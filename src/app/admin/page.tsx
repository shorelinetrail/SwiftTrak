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
import { PhotoGallery } from '@/components/PhotoGallery';
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
  MegaphoneIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline';
import type { User, Workstream, StakeholderLink, UserRole, UserStatus, UpdatesConfig, FeatureConfig } from '@/types/database';

export default function AdminPage() {
  const router = useRouter();
  const { workstreams, setWorkstreams, setFeatureConfig } = useAppStore();

  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [stakeholderLinks, setStakeholderLinks] = useState<StakeholderLink[]>([]);
  const [updatesConfig, setUpdatesConfig] = useState<UpdatesConfig>({
    auto_log_completed_milestones: true,
    auto_log_completed_actions: false,
  });
  const [featureConfig, setFeatureConfigState] = useState<FeatureConfig>({
    gantt_chart_enabled: true,
    technical_queries_enabled: true,
  });
  const [activeTab, setActiveTab] = useState('users');
  const [photos, setPhotos] = useState<Array<{
    id: string;
    workstream_id: string;
    storage_path: string;
    original_filename: string;
    caption?: string;
    taken_at?: string;
    created_at: string;
    updated_at: string;
    url?: string;
    thumbnail_url?: string;
    workstream?: { id: string; name: string; color: string };
    uploader?: { id: string; full_name: string };
  }>>([]);
  const [photosLoading, setPhotosLoading] = useState(false);

  // Modal states
  const [createUserModalOpen, setCreateUserModalOpen] = useState(false);
  const [workstreamModalOpen, setWorkstreamModalOpen] = useState(false);
  const [stakeholderLinkModalOpen, setStakeholderLinkModalOpen] = useState(false);
  const [selectedWorkstream, setSelectedWorkstream] = useState<Workstream | null>(null);
  const [invitingUserId, setInvitingUserId] = useState<string | null>(null);

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
        const [usersResult, workstreamsResult, linksResult, settingsResult, featureResult] = await Promise.all([
          supabase.from('users').select('*').order('full_name'),
          supabase.from('workstreams').select('*').order('order_index'),
          supabase.from('stakeholder_links').select('*').order('created_at', { ascending: false }),
          supabase.from('system_settings').select('*').eq('key', 'updates_config').maybeSingle(),
          supabase.from('system_settings').select('*').eq('key', 'feature_config').maybeSingle(),
        ]);

        if (!mounted) return;

        if (usersResult.data) setUsers(usersResult.data as User[]);
        if (workstreamsResult.data) setWorkstreams(workstreamsResult.data as Workstream[]);
        if (linksResult.data) setStakeholderLinks(linksResult.data as StakeholderLink[]);
        if (settingsResult.data?.value && !settingsResult.error) {
          setUpdatesConfig(settingsResult.data.value as UpdatesConfig);
        }
        if (featureResult.data?.value && !featureResult.error) {
          setFeatureConfigState(featureResult.data.value as FeatureConfig);
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
      const [usersResult, workstreamsResult, linksResult, settingsResult, featureResult] = await Promise.all([
        supabase.from('users').select('*').order('full_name'),
        supabase.from('workstreams').select('*').order('order_index'),
        supabase.from('stakeholder_links').select('*').order('created_at', { ascending: false }),
        supabase.from('system_settings').select('*').eq('key', 'updates_config').maybeSingle(),
        supabase.from('system_settings').select('*').eq('key', 'feature_config').maybeSingle(),
      ]);

      if (usersResult.data) setUsers(usersResult.data as User[]);
      if (workstreamsResult.data) setWorkstreams(workstreamsResult.data as Workstream[]);
      if (linksResult.data) setStakeholderLinks(linksResult.data as StakeholderLink[]);
      if (settingsResult.data?.value && !settingsResult.error) {
        setUpdatesConfig(settingsResult.data.value as UpdatesConfig);
      }
      if (featureResult.data?.value && !featureResult.error) {
        setFeatureConfigState(featureResult.data.value as FeatureConfig);
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

  const handleInviteUser = async (data: { email: string; full_name: string; role: UserRole }) => {
    try {
      const response = await fetch('/api/auth/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error || 'Failed to send invite');
        return;
      }

      if (result.emailSent) {
        toast.success('Invite sent! They will receive an email to set up their account.');
        setCreateUserModalOpen(false);
      } else {
        // Email failed - show as error with details
        toast.error(result.message || 'User created but invite email failed. Check SMTP configuration.');
      }

      fetchData();
    } catch (error) {
      console.error('[AdminPage] Failed to invite user:', error);
      toast.error('Failed to send invite');
    }
  };

  const handleSendInviteToExistingUser = async (user: User) => {
    setInvitingUserId(user.id);
    try {
      const response = await fetch('/api/auth/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          full_name: user.full_name,
          role: user.role,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error || 'Failed to send invite');
        return;
      }

      if (result.emailSent) {
        toast.success(`Invite sent to ${user.email}`);
      } else {
        // Email failed - show as error with details
        toast.error(result.message || 'Invite email could not be sent. Check SMTP configuration.');
      }

      fetchData();
    } catch (error) {
      console.error('[AdminPage] Failed to send invite:', error);
      toast.error('Failed to send invite');
    } finally {
      setInvitingUserId(null);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!confirm(`Are you sure you want to delete ${userName}? This cannot be undone.`)) return;

    try {
      const response = await fetch('/api/auth/delete-user', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('[AdminPage] Failed to delete user:', result.error);
        toast.error(result.error || 'Failed to delete user');
      } else {
        toast.success(`${userName} has been deleted`);
        fetchData();
      }
    } catch (error) {
      console.error('[AdminPage] Failed to delete user:', error);
      toast.error('Failed to delete user');
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

  const handleUpdateFeatureConfig = async (config: FeatureConfig) => {
    const supabase = createClient();

    const { error } = await supabase
      .from('system_settings')
      .upsert({
        key: 'feature_config',
        value: config,
        updated_by: currentUser?.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });

    if (error) {
      toast.error('Failed to update feature settings');
      console.error('[AdminPage] Failed to update feature settings:', error);
    } else {
      setFeatureConfigState(config);
      setFeatureConfig(config); // Update global store
      toast.success('Feature settings updated');
    }
  };

  // Fetch photos when Photos tab is selected
  const fetchPhotos = useCallback(async () => {
    setPhotosLoading(true);
    try {
      const response = await fetch('/api/photos');
      if (response.ok) {
        const data = await response.json();
        setPhotos(data);
      }
    } catch (error) {
      console.error('Error fetching photos:', error);
    } finally {
      setPhotosLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'photos' && photos.length === 0 && !photosLoading) {
      fetchPhotos();
    }
  }, [activeTab, photos.length, photosLoading, fetchPhotos]);

  const handleDeletePhoto = async (photoId: string) => {
    const response = await fetch(`/api/photos?id=${photoId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      toast.error(error.error || 'Failed to delete photo');
      throw new Error(error.error);
    }

    setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    toast.success('Photo deleted');
  };

  const handleCaptionUpdate = async (photoId: string, caption: string) => {
    const response = await fetch('/api/photos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: photoId, caption }),
    });

    if (!response.ok) {
      const error = await response.json();
      toast.error(error.error || 'Failed to update caption');
      throw new Error(error.error);
    }

    setPhotos((prev) =>
      prev.map((p) => (p.id === photoId ? { ...p, caption } : p))
    );
    toast.success('Caption updated');
  };

  const tabs = [
    { id: 'users', label: 'Users', count: users.length },
    { id: 'workstreams', label: 'Workstreams', count: workstreams.length },
    { id: 'stakeholder', label: 'Stakeholder Links', count: stakeholderLinks.length },
    { id: 'photos', label: 'Photos', count: photos.length > 0 ? photos.length : undefined },
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
                          {user.id === currentUser?.id && (
                            <Badge variant="default" size="sm">You</Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">{user.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {user.status === 'pending' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleSendInviteToExistingUser(user)}
                          disabled={invitingUserId === user.id}
                        >
                          {invitingUserId === user.id ? 'Sending...' : user.invited_at ? 'Resend Invite' : 'Send Invite'}
                        </Button>
                      )}
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
                      {user.id !== currentUser?.id && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteUser(user.id, user.full_name)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          Delete
                        </Button>
                      )}
                    </div>
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

        {/* Photos Tab */}
        {activeTab === 'photos' && (
          <div className="space-y-6">
            {/* Album Management */}
            <Card>
              <CardHeader
                actions={
                  <Button size="sm" onClick={() => {
                    setSelectedWorkstream(null);
                    setWorkstreamModalOpen(true);
                  }}>
                    <PlusIcon className="w-4 h-4 mr-2" />
                    New Album
                  </Button>
                }
              >
                <CardTitle className="flex items-center gap-2">
                  <SwatchIcon className="w-5 h-5 text-gray-400" />
                  Photo Albums
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500 mb-4">
                  Albums are based on workstreams. Create, edit, or delete albums to organize photos.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {workstreams.map((ws) => {
                    const photoCount = photos.filter((p) => p.workstream_id === ws.id).length;
                    return (
                      <div
                        key={ws.id}
                        className="relative p-3 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors group"
                      >
                        <div
                          className="w-8 h-8 rounded-lg mb-2"
                          style={{ backgroundColor: ws.color }}
                        />
                        <p className="text-sm font-medium text-gray-900 truncate">{ws.name}</p>
                        <p className="text-xs text-gray-500">{photoCount} photo{photoCount !== 1 ? 's' : ''}</p>

                        {/* Edit/Delete buttons on hover */}
                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => {
                              setSelectedWorkstream(ws);
                              setWorkstreamModalOpen(true);
                            }}
                            className="p-1 bg-white rounded shadow hover:bg-gray-50"
                            title="Edit album"
                          >
                            <PencilIcon className="w-3 h-3 text-gray-500" />
                          </button>
                          <button
                            onClick={() => handleDeleteWorkstream(ws.id)}
                            className="p-1 bg-white rounded shadow hover:bg-gray-50"
                            title="Delete album"
                          >
                            <TrashIcon className="w-3 h-3 text-red-500" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {workstreams.length === 0 && (
                    <p className="col-span-full text-center text-gray-500 py-4">
                      No albums yet. Create one to start organizing photos.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Photo Gallery */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PhotoIcon className="w-5 h-5 text-gray-400" />
                  All Photos ({photos.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {photosLoading ? (
                  <div className="flex justify-center py-8">
                    <LoadingSpinner />
                  </div>
                ) : (
                  <PhotoGallery
                    photos={photos}
                    emptyMessage="No photos uploaded yet"
                    canEdit={true}
                    onDelete={handleDeletePhoto}
                    onCaptionUpdate={handleCaptionUpdate}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            {/* Feature Toggles */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cog6ToothIcon className="w-5 h-5 text-gray-400" />
                  Feature Settings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500 mb-6">
                  Enable or disable optional features for your team.
                </p>
                <div className="space-y-4">
                  <label className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">Gantt Chart</p>
                      <p className="text-sm text-gray-500">
                        Show Gantt chart for visual project timeline and milestone tracking
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={featureConfig.gantt_chart_enabled}
                      onChange={(e) => handleUpdateFeatureConfig({
                        ...featureConfig,
                        gantt_chart_enabled: e.target.checked,
                      })}
                      className="h-5 w-5 rounded border-gray-300 text-red-600 focus:ring-red-500"
                    />
                  </label>

                  <label className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">Technical Queries</p>
                      <p className="text-sm text-gray-500">
                        Enable technical query tracking and assignment system
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={featureConfig.technical_queries_enabled}
                      onChange={(e) => handleUpdateFeatureConfig({
                        ...featureConfig,
                        technical_queries_enabled: e.target.checked,
                      })}
                      className="h-5 w-5 rounded border-gray-300 text-red-600 focus:ring-red-500"
                    />
                  </label>

                </div>
              </CardContent>
            </Card>

            {/* Updates & Activity Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MegaphoneIcon className="w-5 h-5 text-gray-400" />
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
          </div>
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
        onInvite={handleInviteUser}
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
  onInvite,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: { email: string; full_name: string; role: UserRole }) => void;
  onInvite: (data: { email: string; full_name: string; role: UserRole }) => Promise<void>;
}) {
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    role: 'view' as UserRole,
  });
  const [sendInvite, setSendInvite] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setFormData({ email: '', full_name: '', role: 'view' });
      setSendInvite(true);
      setSaving(false);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!formData.email.trim() || !formData.full_name.trim()) return;

    setSaving(true);
    try {
      if (sendInvite) {
        await onInvite(formData);
      } else {
        onSave(formData);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add User">
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Add a new user and optionally send them an invite email to set up their account.
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
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={sendInvite}
            onChange={(e) => setSendInvite(e.target.checked)}
            className="rounded border-gray-300 text-red-600 focus:ring-red-500"
          />
          <span className="text-sm text-gray-700">Send invite email</span>
        </label>
        {!sendInvite && (
          <p className="text-xs text-gray-500 ml-6">
            User will be created but won&apos;t receive an email. They can sign up manually with this email.
          </p>
        )}
      </div>
      <div className="flex justify-end gap-3 mt-6">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} loading={saving}>
          {sendInvite ? 'Send Invite' : 'Add User'}
        </Button>
      </div>
    </Modal>
  );
}
