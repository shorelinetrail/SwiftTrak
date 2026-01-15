'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';
import { LoadingSpinner } from '@/components/ui/loading';
import toast from 'react-hot-toast';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  UserGroupIcon,
  SwatchIcon,
  LinkIcon,
  ClipboardDocumentIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import type { User, Workstream, StakeholderLink, UserRole, UserStatus, UpdatesConfig } from '@/types/database';

export default function AdminPage() {
  const router = useRouter();
  const { workstreams, setWorkstreams } = useAppStore();

  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [stakeholderLinks, setStakeholderLinks] = useState<StakeholderLink[]>([]);
  const [updatesConfig, setUpdatesConfig] = useState<UpdatesConfig>({
    auto_log_completed_milestones: true,
    auto_log_completed_actions: false,
  });
  const [activeTab, setActiveTab] = useState('users');

  // Modal states
  const [createUserModalOpen, setCreateUserModalOpen] = useState(false);
  const [workstreamModalOpen, setWorkstreamModalOpen] = useState(false);
  const [stakeholderLinkModalOpen, setStakeholderLinkModalOpen] = useState(false);
  const [selectedWorkstream, setSelectedWorkstream] = useState<Workstream | null>(null);

  // Direct auth check and data fetch - bypasses complex hook chain
  useEffect(() => {
    let mounted = true;

    const checkAuthAndFetch = async () => {
      const supabase = createClient();

      try {
        // Step 1: Get auth user directly with timeout
        const authPromise = supabase.auth.getUser();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Auth timeout')), 5000)
        );

        let authUser;
        try {
          const result = await Promise.race([authPromise, timeoutPromise]);
          authUser = result.data?.user;
          if (result.error) {
            console.error('[AdminPage] Auth error:', result.error);
            router.push('/auth/login');
            return;
          }
        } catch (timeoutErr) {
          console.error('[AdminPage] Auth timed out');
          toast.error('Authentication timed out. Please refresh.');
          setLoading(false);
          return;
        }

        if (!authUser) {
          console.log('[AdminPage] No auth user, redirecting to login');
          router.push('/auth/login');
          return;
        }

        // Step 2: Get user profile with role
        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('id', authUser.id)
          .single();

        if (profileError || !profile) {
          console.log('[AdminPage] No profile found, redirecting to dashboard');
          router.push('/dashboard');
          return;
        }

        // Step 3: Check if admin
        if (profile.role !== 'admin') {
          console.log('[AdminPage] User is not admin:', profile.role);
          router.push('/dashboard');
          return;
        }

        if (!mounted) return;

        // User is admin, set current user and fetch data
        setCurrentUser(profile as User);

        // Step 4: Fetch admin data
        const [usersResult, workstreamsResult, linksResult, settingsResult] = await Promise.all([
          supabase.from('users').select('*').order('full_name'),
          supabase.from('workstreams').select('*').order('order_index'),
          supabase.from('stakeholder_links').select('*').order('created_at', { ascending: false }),
          supabase.from('system_settings').select('*').eq('key', 'updates_config').single(),
        ]);

        if (!mounted) return;

        if (usersResult.data) setUsers(usersResult.data as User[]);
        if (workstreamsResult.data) setWorkstreams(workstreamsResult.data as Workstream[]);
        if (linksResult.data) setStakeholderLinks(linksResult.data as StakeholderLink[]);
        if (settingsResult.data?.value) {
          setUpdatesConfig(settingsResult.data.value as UpdatesConfig);
        }

        setLoading(false);
      } catch (error) {
        console.error('[AdminPage] Error:', error);
        if (mounted) {
          toast.error('Failed to load admin page');
          router.push('/dashboard');
        }
      }
    };

    checkAuthAndFetch();

    return () => {
      mounted = false;
    };
  }, [router, setWorkstreams]);

  const fetchData = useCallback(async () => {
    const supabase = createClient();

    try {
      const [usersResult, workstreamsResult, linksResult, settingsResult] = await Promise.all([
        supabase.from('users').select('*').order('full_name'),
        supabase.from('workstreams').select('*').order('order_index'),
        supabase.from('stakeholder_links').select('*').order('created_at', { ascending: false }),
        supabase.from('system_settings').select('*').eq('key', 'updates_config').single(),
      ]);

      if (usersResult.data) setUsers(usersResult.data as User[]);
      if (workstreamsResult.data) setWorkstreams(workstreamsResult.data as Workstream[]);
      if (linksResult.data) setStakeholderLinks(linksResult.data as StakeholderLink[]);
      if (settingsResult.data?.value) {
        setUpdatesConfig(settingsResult.data.value as UpdatesConfig);
      }
    } catch (error) {
      console.error('[AdminPage] fetchData error:', error);
      toast.error('Failed to refresh data');
    }
  }, [setWorkstreams]);

  const handleUpdateUserRole = async (userId: string, role: UserRole) => {
    const supabase = createClient();

    const { error } = await supabase
      .from('users')
      .update({ role })
      .eq('id', userId);

    if (error) {
      toast.error('Failed to update user role');
    } else {
      toast.success('User role updated');
      fetchData();
    }
  };

  const handleCreatePendingUser = async (data: { email: string; full_name: string; role: UserRole }) => {
    const supabase = createClient();

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, status')
      .eq('email', data.email.toLowerCase())
      .single();

    if (existingUser) {
      toast.error('A user with this email already exists');
      return;
    }

    // Create pending user with a temporary UUID (not linked to auth.users yet)
    const { error } = await supabase.from('users').insert({
      id: crypto.randomUUID(),
      email: data.email.toLowerCase(),
      full_name: data.full_name,
      role: data.role,
      status: 'pending',
      invited_by: currentUser?.id,
      auth_linked: false,
    });

    if (error) {
      console.error('[AdminPage] Failed to create pending user:', error);
      toast.error(`Failed to create user: ${error.message}`);
    } else {
      toast.success('User created. They will be linked when they sign up.');
      setCreateUserModalOpen(false);
      fetchData();
    }
  };

  const handleCreateWorkstream = async (data: Partial<Workstream>) => {
    console.log('[AdminPage] handleCreateWorkstream called with:', data);
    const supabase = createClient();

    const insertData = {
      name: data.name,
      description: data.description,
      color: data.color || '#dc2626',
      order_index: workstreams.length,
    };
    console.log('[AdminPage] Inserting workstream:', insertData);

    const { data: result, error } = await supabase.from('workstreams').insert(insertData).select();

    console.log('[AdminPage] Workstream insert result:', { result, error });

    if (error) {
      console.error('[AdminPage] Failed to create workstream:', error);
      toast.error(`Failed to create workstream: ${error.message}`);
    } else {
      console.log('[AdminPage] Workstream created successfully');
      toast.success('Workstream created');
      setWorkstreamModalOpen(false);
      fetchData();
    }
  };

  const handleUpdateWorkstream = async (workstreamId: string, data: Partial<Workstream>) => {
    const supabase = createClient();

    const { error } = await supabase
      .from('workstreams')
      .update(data)
      .eq('id', workstreamId);

    if (error) {
      toast.error('Failed to update workstream');
    } else {
      toast.success('Workstream updated');
      setWorkstreamModalOpen(false);
      setSelectedWorkstream(null);
      fetchData();
    }
  };

  const handleDeleteWorkstream = async (workstreamId: string) => {
    if (!confirm('Are you sure? This will affect all related actions and threats.')) return;

    const supabase = createClient();

    const { error } = await supabase
      .from('workstreams')
      .delete()
      .eq('id', workstreamId);

    if (error) {
      toast.error('Failed to delete workstream');
    } else {
      toast.success('Workstream deleted');
      setWorkstreamModalOpen(false);
      setSelectedWorkstream(null);
      fetchData();
    }
  };

  const handleCreateStakeholderLink = async (name: string, workstreamIds: string[]) => {
    const supabase = createClient();

    const { error } = await supabase
      .from('stakeholder_links')
      .insert({
        name,
        workstream_ids: workstreamIds.length > 0 ? workstreamIds : null,
        created_by: currentUser?.id,
      });

    if (error) {
      toast.error('Failed to create stakeholder link');
    } else {
      toast.success('Stakeholder link created');
      setStakeholderLinkModalOpen(false);
      fetchData();
    }
  };

  const handleDeleteStakeholderLink = async (linkId: string) => {
    const supabase = createClient();

    const { error } = await supabase
      .from('stakeholder_links')
      .delete()
      .eq('id', linkId);

    if (error) {
      toast.error('Failed to delete link');
    } else {
      toast.success('Link deleted');
      fetchData();
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const handleUpdateUpdatesConfig = async (config: UpdatesConfig) => {
    const supabase = createClient();

    const { error } = await supabase
      .from('system_settings')
      .upsert({
        key: 'updates_config',
        value: config,
        updated_by: currentUser?.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });

    if (error) {
      toast.error('Failed to update settings');
      console.error('[AdminPage] Failed to update settings:', error);
    } else {
      setUpdatesConfig(config);
      toast.success('Settings updated');
    }
  };

  const tabs = [
    { id: 'users', label: 'Users', count: users.length },
    { id: 'workstreams', label: 'Workstreams', count: workstreams.length },
    { id: 'stakeholder', label: 'Stakeholder Links', count: stakeholderLinks.length },
    { id: 'settings', label: 'Settings' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header title="Admin" />
        <div className="flex items-center justify-center h-96">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header title="Administration" subtitle="Manage users, workstreams, and settings" />

      <div className="p-6 space-y-6">
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

        {/* Users Tab */}
        {activeTab === 'users' && (
          <Card>
            <CardHeader
              actions={
                <Button size="sm" onClick={() => setCreateUserModalOpen(true)}>
                  <PlusIcon className="w-4 h-4 mr-2" />
                  Add User
                </Button>
              }
            >
              <CardTitle className="flex items-center gap-2">
                <UserGroupIcon className="w-5 h-5 text-gray-400" />
                User Management
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-4">
                Add users before they sign up. When they register with the same email, their account will be automatically linked.
              </p>
              <div className="space-y-3">
                {users.map((user) => (
                  <div
                    key={user.id}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      user.status === 'pending' ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar src={user.avatar_url} name={user.full_name} size="sm" />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900">{user.full_name}</p>
                          {user.status === 'pending' && (
                            <Badge variant="warning" size="sm">Pending</Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">{user.email}</p>
                      </div>
                    </div>
                    <Select
                      options={[
                        { value: 'view', label: 'View Only' },
                        { value: 'edit', label: 'Can Edit' },
                        { value: 'admin', label: 'Admin' },
                      ]}
                      value={user.role}
                      onChange={(value) => handleUpdateUserRole(user.id, value as UserRole)}
                      className="w-32"
                    />
                  </div>
                ))}
                {users.length === 0 && (
                  <p className="text-center text-gray-500 py-8">
                    No users yet. Add users to pre-configure their roles before they sign up.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Workstreams Tab */}
        {activeTab === 'workstreams' && (
          <Card>
            <CardHeader
              actions={
                <Button size="sm" onClick={() => {
                  setSelectedWorkstream(null);
                  setWorkstreamModalOpen(true);
                }}>
                  <PlusIcon className="w-4 h-4 mr-2" />
                  Add Workstream
                </Button>
              }
            >
              <CardTitle className="flex items-center gap-2">
                <SwatchIcon className="w-5 h-5 text-gray-400" />
                Workstreams
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {workstreams.map((workstream) => (
                  <div
                    key={workstream.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: workstream.color }}
                      />
                      <div>
                        <p className="font-medium text-gray-900">{workstream.name}</p>
                        {workstream.description && (
                          <p className="text-sm text-gray-500">{workstream.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedWorkstream(workstream);
                          setWorkstreamModalOpen(true);
                        }}
                      >
                        <PencilIcon className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteWorkstream(workstream.id)}
                      >
                        <TrashIcon className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
                {workstreams.length === 0 && (
                  <p className="text-center text-gray-500 py-8">
                    No workstreams configured. Add workstreams to organize your crisis response.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stakeholder Links Tab */}
        {activeTab === 'stakeholder' && (
          <Card>
            <CardHeader
              actions={
                <Button size="sm" onClick={() => setStakeholderLinkModalOpen(true)}>
                  <PlusIcon className="w-4 h-4 mr-2" />
                  Create Link
                </Button>
              }
            >
              <CardTitle className="flex items-center gap-2">
                <LinkIcon className="w-5 h-5 text-gray-400" />
                Stakeholder Links
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-4">
                Create read-only links for external stakeholders who need visibility without login.
              </p>
              <div className="space-y-3">
                {stakeholderLinks.map((link) => {
                  const url = `${window.location.origin}/stakeholder/${link.token}`;
                  return (
                    <div
                      key={link.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-gray-900">{link.name}</p>
                        <p className="text-xs text-gray-500 font-mono truncate max-w-md">{url}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(url)}
                        >
                          <ClipboardDocumentIcon className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteStakeholderLink(link.id)}
                        >
                          <TrashIcon className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {stakeholderLinks.length === 0 && (
                  <p className="text-center text-gray-500 py-8">
                    No stakeholder links created yet.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cog6ToothIcon className="w-5 h-5 text-gray-400" />
                Updates & Activity Settings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-6">
                Configure automatic logging of activity to the Updates feed.
              </p>
              <div className="space-y-4">
                <label className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">Auto-log completed milestones</p>
                    <p className="text-sm text-gray-500">
                      Automatically post to Updates when a milestone is marked as completed
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={updatesConfig.auto_log_completed_milestones}
                    onChange={(e) => handleUpdateUpdatesConfig({
                      ...updatesConfig,
                      auto_log_completed_milestones: e.target.checked,
                    })}
                    className="h-5 w-5 rounded border-gray-300 text-red-600 focus:ring-red-500"
                  />
                </label>

                <label className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">Auto-log completed actions</p>
                    <p className="text-sm text-gray-500">
                      Automatically post to Updates when an action is marked as complete
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={updatesConfig.auto_log_completed_actions}
                    onChange={(e) => handleUpdateUpdatesConfig({
                      ...updatesConfig,
                      auto_log_completed_actions: e.target.checked,
                    })}
                    className="h-5 w-5 rounded border-gray-300 text-red-600 focus:ring-red-500"
                  />
                </label>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Workstream Modal */}
      <WorkstreamModal
        open={workstreamModalOpen}
        onClose={() => {
          setWorkstreamModalOpen(false);
          setSelectedWorkstream(null);
        }}
        workstream={selectedWorkstream}
        onSave={(data) => {
          if (selectedWorkstream) {
            handleUpdateWorkstream(selectedWorkstream.id, data);
          } else {
            handleCreateWorkstream(data);
          }
        }}
      />

      {/* Stakeholder Link Modal */}
      <StakeholderLinkModal
        open={stakeholderLinkModalOpen}
        onClose={() => setStakeholderLinkModalOpen(false)}
        workstreams={workstreams}
        onSave={handleCreateStakeholderLink}
      />

      {/* Create User Modal */}
      <CreateUserModal
        open={createUserModalOpen}
        onClose={() => setCreateUserModalOpen(false)}
        onSave={handleCreatePendingUser}
      />
    </div>
  );
}

function WorkstreamModal({
  open,
  onClose,
  workstream,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  workstream: Workstream | null;
  onSave: (data: Partial<Workstream>) => void;
}) {
  const [formData, setFormData] = useState({
    name: workstream?.name || '',
    description: workstream?.description || '',
    color: workstream?.color || '#dc2626',
  });

  useEffect(() => {
    if (workstream) {
      setFormData({
        name: workstream.name,
        description: workstream.description || '',
        color: workstream.color,
      });
    } else {
      setFormData({ name: '', description: '', color: '#dc2626' });
    }
  }, [workstream]);

  const colors = [
    '#dc2626', '#ea580c', '#d97706', '#ca8a04', '#65a30d',
    '#16a34a', '#059669', '#0d9488', '#0891b2', '#0284c7',
    '#2563eb', '#4f46e5', '#7c3aed', '#9333ea', '#c026d3',
    '#db2777', '#e11d48',
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={workstream ? 'Edit Workstream' : 'Add Workstream'}
    >
      <div className="space-y-4">
        <Input
          label="Name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="e.g., Mechanical, Electrical, Operations"
          required
        />
        <Textarea
          label="Description (Optional)"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Brief description of this workstream"
          rows={2}
        />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
          <div className="flex flex-wrap gap-2">
            {colors.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setFormData({ ...formData, color })}
                className={`w-8 h-8 rounded-full ${
                  formData.color === color ? 'ring-2 ring-offset-2 ring-gray-400' : ''
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => onSave(formData)}>
          {workstream ? 'Save Changes' : 'Create Workstream'}
        </Button>
      </div>
    </Modal>
  );
}

function StakeholderLinkModal({
  open,
  onClose,
  workstreams,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  workstreams: Workstream[];
  onSave: (name: string, workstreamIds: string[]) => void;
}) {
  const [name, setName] = useState('');
  const [selectedWorkstreams, setSelectedWorkstreams] = useState<string[]>([]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create Stakeholder Link"
    >
      <div className="space-y-4">
        <Input
          label="Link Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Executive Team, Client View"
          required
        />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Visible Workstreams (leave empty for all)
          </label>
          <div className="space-y-2">
            {workstreams.map((ws) => (
              <label key={ws.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedWorkstreams.includes(ws.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedWorkstreams([...selectedWorkstreams, ws.id]);
                    } else {
                      setSelectedWorkstreams(selectedWorkstreams.filter(id => id !== ws.id));
                    }
                  }}
                  className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: ws.color }}
                />
                <span className="text-sm text-gray-700">{ws.name}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => {
          if (name.trim()) {
            onSave(name.trim(), selectedWorkstreams);
          }
        }}>
          Create Link
        </Button>
      </div>
    </Modal>
  );
}

function CreateUserModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: { email: string; full_name: string; role: UserRole }) => void;
}) {
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    role: 'view' as UserRole,
  });

  useEffect(() => {
    if (!open) {
      setFormData({ email: '', full_name: '', role: 'view' });
    }
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Add User">
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Create a user before they sign up. When they register with this email, they&apos;ll automatically inherit the role you set here.
        </p>
        <Input
          label="Email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          placeholder="user@example.com"
          required
        />
        <Input
          label="Full Name"
          value={formData.full_name}
          onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
          placeholder="John Doe"
          required
        />
        <Select
          label="Role"
          options={[
            { value: 'view', label: 'View Only' },
            { value: 'edit', label: 'Can Edit' },
            { value: 'admin', label: 'Admin' },
          ]}
          value={formData.role}
          onChange={(value) => setFormData({ ...formData, role: value as UserRole })}
        />
      </div>
      <div className="flex justify-end gap-3 mt-6">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            if (formData.email.trim() && formData.full_name.trim()) {
              onSave(formData);
            }
          }}
        >
          Add User
        </Button>
      </div>
    </Modal>
  );
}
