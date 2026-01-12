'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { LoadingSpinner } from '@/components/ui/loading';
import toast from 'react-hot-toast';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  SwatchIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { Select } from '@/components/ui/select';
import { useMemo } from 'react';
import type { User, Workstream } from '@/types/database';

export default function WorkstreamsPage() {
  const router = useRouter();
  const { workstreams, setWorkstreams } = useAppStore();

  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [workstreamModalOpen, setWorkstreamModalOpen] = useState(false);
  const [selectedWorkstream, setSelectedWorkstream] = useState<Workstream | null>(null);

  // Auth check - allow edit and admin roles
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
            console.error('[WorkstreamsPage] Auth error:', result.error);
            router.push('/auth/login');
            return;
          }
        } catch (timeoutErr) {
          console.error('[WorkstreamsPage] Auth timed out');
          toast.error('Authentication timed out. Please refresh.');
          setLoading(false);
          return;
        }

        if (!authUser) {
          console.log('[WorkstreamsPage] No auth user, redirecting to login');
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
          console.log('[WorkstreamsPage] No profile found, redirecting to dashboard');
          router.push('/dashboard');
          return;
        }

        // Step 3: Check if user has edit or admin role
        if (profile.role !== 'admin' && profile.role !== 'edit') {
          console.log('[WorkstreamsPage] User does not have edit permission:', profile.role);
          toast.error('You need edit permissions to manage workstreams');
          router.push('/dashboard');
          return;
        }

        if (!mounted) return;

        // User has permission, set current user and fetch data
        setCurrentUser(profile as User);

        // Step 4: Fetch workstreams
        const workstreamsResult = await supabase
          .from('workstreams')
          .select('*')
          .order('order_index');

        if (!mounted) return;

        if (workstreamsResult.data) {
          setWorkstreams(workstreamsResult.data as Workstream[]);
        }

        setLoading(false);
      } catch (error) {
        console.error('[WorkstreamsPage] Error:', error);
        if (mounted) {
          toast.error('Failed to load workstreams page');
          router.push('/dashboard');
        }
      }
    };

    checkAuthAndFetch();

    return () => {
      mounted = false;
    };
  }, [router, setWorkstreams]);

  const fetchWorkstreams = useCallback(async () => {
    const supabase = createClient();

    try {
      const workstreamsResult = await supabase
        .from('workstreams')
        .select('*')
        .order('order_index');

      if (workstreamsResult.data) {
        setWorkstreams(workstreamsResult.data as Workstream[]);
      }
    } catch (error) {
      console.error('[WorkstreamsPage] fetchWorkstreams error:', error);
      toast.error('Failed to refresh workstreams');
    }
  }, [setWorkstreams]);

  // Organize workstreams into hierarchy
  const workstreamHierarchy = useMemo(() => {
    const rootWorkstreams = workstreams.filter(ws => !ws.parent_id);
    const childrenMap = new Map<string, Workstream[]>();

    workstreams.forEach(ws => {
      if (ws.parent_id) {
        const existing = childrenMap.get(ws.parent_id) || [];
        existing.push(ws);
        childrenMap.set(ws.parent_id, existing);
      }
    });

    return { rootWorkstreams, childrenMap };
  }, [workstreams]);

  const handleCreateWorkstream = async (data: Partial<Workstream>) => {
    console.log('[WorkstreamsPage] handleCreateWorkstream called with:', data);
    const supabase = createClient();

    const insertData = {
      name: data.name,
      description: data.description,
      color: data.color || '#dc2626',
      order_index: workstreams.length,
      parent_id: data.parent_id || null,
    };
    console.log('[WorkstreamsPage] Inserting workstream:', insertData);

    const { data: result, error } = await supabase.from('workstreams').insert(insertData).select();

    console.log('[WorkstreamsPage] Workstream insert result:', { result, error });

    if (error) {
      console.error('[WorkstreamsPage] Failed to create workstream:', error);
      toast.error(`Failed to create workstream: ${error.message}`);
    } else {
      console.log('[WorkstreamsPage] Workstream created successfully');
      toast.success('Workstream created');
      setWorkstreamModalOpen(false);
      fetchWorkstreams();
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
      fetchWorkstreams();
    }
  };

  const handleDeleteWorkstream = async (workstreamId: string) => {
    // Only admins can delete workstreams
    if (currentUser?.role !== 'admin') {
      toast.error('Only admins can delete workstreams');
      return;
    }

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
      fetchWorkstreams();
    }
  };

  const isAdmin = currentUser?.role === 'admin';

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header title="Workstreams" />
        <div className="flex items-center justify-center h-96">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header title="Workstreams" subtitle="Manage workstreams for organizing crisis response" />

      <div className="p-6 space-y-6">
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
              {workstreamHierarchy.rootWorkstreams.map((workstream) => {
                const children = workstreamHierarchy.childrenMap.get(workstream.id) || [];
                return (
                  <div key={workstream.id}>
                    {/* Parent Workstream */}
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
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
                        {children.length > 0 && (
                          <span className="text-xs text-gray-400 ml-2">
                            ({children.length} sub-workstream{children.length !== 1 ? 's' : ''})
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Add sub-workstream"
                          onClick={() => {
                            setSelectedWorkstream({ parent_id: workstream.id } as Workstream);
                            setWorkstreamModalOpen(true);
                          }}
                        >
                          <PlusIcon className="w-4 h-4" />
                        </Button>
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
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteWorkstream(workstream.id)}
                          >
                            <TrashIcon className="w-4 h-4 text-red-500" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Child Workstreams (Sub-workstreams) */}
                    {children.length > 0 && (
                      <div className="ml-6 mt-2 space-y-2 border-l-2 border-gray-200 pl-4">
                        {children.map((child) => (
                          <div
                            key={child.id}
                            className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                          >
                            <div className="flex items-center gap-3">
                              <ChevronRightIcon className="w-3 h-3 text-gray-400" />
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: child.color }}
                              />
                              <div>
                                <p className="text-sm font-medium text-gray-900">{child.name}</p>
                                {child.description && (
                                  <p className="text-xs text-gray-500">{child.description}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedWorkstream(child);
                                  setWorkstreamModalOpen(true);
                                }}
                              >
                                <PencilIcon className="w-3 h-3" />
                              </Button>
                              {isAdmin && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteWorkstream(child.id)}
                                >
                                  <TrashIcon className="w-3 h-3 text-red-500" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {workstreams.length === 0 && (
                <p className="text-center text-gray-500 py-8">
                  No workstreams configured. Add workstreams to organize your crisis response.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Workstream Modal */}
      <WorkstreamModal
        open={workstreamModalOpen}
        onClose={() => {
          setWorkstreamModalOpen(false);
          setSelectedWorkstream(null);
        }}
        workstream={selectedWorkstream}
        allWorkstreams={workstreams}
        onSave={(data) => {
          if (selectedWorkstream?.id) {
            handleUpdateWorkstream(selectedWorkstream.id, data);
          } else {
            handleCreateWorkstream(data);
          }
        }}
      />
    </div>
  );
}

function WorkstreamModal({
  open,
  onClose,
  workstream,
  allWorkstreams,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  workstream: Workstream | null;
  allWorkstreams: Workstream[];
  onSave: (data: Partial<Workstream>) => void;
}) {
  const [formData, setFormData] = useState({
    name: workstream?.name || '',
    description: workstream?.description || '',
    color: workstream?.color || '#dc2626',
    parent_id: workstream?.parent_id || '',
  });

  // Get only root workstreams (no parent) for parent selection
  // Exclude current workstream and its children from selection
  const availableParents = useMemo(() => {
    return allWorkstreams.filter(ws =>
      !ws.parent_id && // Only root workstreams can be parents
      ws.id !== workstream?.id // Can't be parent of itself
    );
  }, [allWorkstreams, workstream]);

  const isEditing = workstream?.id;
  const isCreatingSubworkstream = !workstream?.id && workstream?.parent_id;

  useEffect(() => {
    if (workstream?.id) {
      // Editing existing workstream
      setFormData({
        name: workstream.name,
        description: workstream.description || '',
        color: workstream.color,
        parent_id: workstream.parent_id || '',
      });
    } else if (workstream?.parent_id) {
      // Creating new sub-workstream
      const parent = allWorkstreams.find(ws => ws.id === workstream.parent_id);
      setFormData({
        name: '',
        description: '',
        color: parent?.color || '#dc2626',
        parent_id: workstream.parent_id,
      });
    } else {
      // Creating new root workstream
      setFormData({ name: '', description: '', color: '#dc2626', parent_id: '' });
    }
  }, [workstream, allWorkstreams]);

  const parentWorkstream = formData.parent_id
    ? allWorkstreams.find(ws => ws.id === formData.parent_id)
    : null;

  const colors = [
    '#dc2626', '#ea580c', '#d97706', '#ca8a04', '#65a30d',
    '#16a34a', '#059669', '#0d9488', '#0891b2', '#0284c7',
    '#2563eb', '#4f46e5', '#7c3aed', '#9333ea', '#c026d3',
    '#db2777', '#e11d48',
  ];

  const getModalTitle = () => {
    if (isEditing) return 'Edit Workstream';
    if (isCreatingSubworkstream) return 'Add Sub-workstream';
    return 'Add Workstream';
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={getModalTitle()}
    >
      <div className="space-y-4">
        {/* Show parent info if creating sub-workstream */}
        {parentWorkstream && (
          <div className="flex items-center gap-2 p-2 bg-gray-100 rounded-lg text-sm">
            <span className="text-gray-500">Parent:</span>
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: parentWorkstream.color }}
            />
            <span className="font-medium">{parentWorkstream.name}</span>
          </div>
        )}

        <Input
          label="Name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder={isCreatingSubworkstream ? "e.g., Electrical Systems, HVAC" : "e.g., Mechanical, Electrical, Operations"}
          required
        />
        <Textarea
          label="Description (Optional)"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Brief description of this workstream"
          rows={2}
        />

        {/* Parent selector - only show when not creating a sub-workstream */}
        {!isCreatingSubworkstream && availableParents.length > 0 && (
          <Select
            label="Parent Workstream (Optional)"
            options={[
              { value: '', label: 'None (Root workstream)' },
              ...availableParents.map(ws => ({ value: ws.id, label: ws.name })),
            ]}
            value={formData.parent_id}
            onChange={(value) => setFormData({ ...formData, parent_id: value })}
          />
        )}

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
          {isEditing ? 'Save Changes' : isCreatingSubworkstream ? 'Create Sub-workstream' : 'Create Workstream'}
        </Button>
      </div>
    </Modal>
  );
}
