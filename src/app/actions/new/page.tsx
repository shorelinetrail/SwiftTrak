'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import toast from 'react-hot-toast';
import { buildWorkstreamOptions } from '@/lib/utils';
import type { Priority, User, Workstream } from '@/types/database';

export default function NewActionPage() {
  const router = useRouter();
  const { user, workstreams, setWorkstreams } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    workstream_id: '',
    owner_id: '',
    priority: '' as Priority | '', // Optional - can be unassigned
    due_date: '',
    created_at: '', // Created date for importing historical actions
    completed_at: '', // Date closed for importing already-closed actions
    initial_comment: '', // For importing legacy comments
    created_by_override: '', // For bulk import - defaults to System if blank
  });

  // Fetch workstreams and users on mount
  useEffect(() => {
    const supabase = createClient();

    const fetchData = async () => {
      // Fetch workstreams if not loaded
      if (workstreams.length === 0) {
        const { data: wsData } = await supabase
          .from('workstreams')
          .select('*')
          .order('order_index');
        if (wsData) {
          setWorkstreams(wsData as Workstream[]);
        }
      }

      // Fetch users for owner selection
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .order('full_name');
      if (userData) {
        setUsers(userData as User[]);
      }
      setLoadingUsers(false);
    };

    fetchData();
  }, [workstreams.length, setWorkstreams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      toast.error('Title is required');
      return;
    }

    if (!formData.workstream_id) {
      toast.error('Please select a workstream');
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      // Determine status based on completion date
      const isCompleted = !!formData.completed_at;
      const status = isCompleted ? 'complete' : 'pending';

      // System user ID for bulk imports
      const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

      // Determine who created this action
      // If using import fields (created_at, date closed, initial comment, or created_by_override), use override or System
      const isImport = formData.created_at || formData.completed_at || formData.initial_comment.trim() || formData.created_by_override;
      const createdBy = isImport
        ? (formData.created_by_override || SYSTEM_USER_ID)
        : user?.id;

      // Build insert data
      const insertData: Record<string, unknown> = {
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        workstream_id: formData.workstream_id,
        owner_id: formData.owner_id || null,
        priority: formData.priority || null,
        due_date: formData.due_date || null,
        status,
        completed_at: formData.completed_at || null,
        created_by: createdBy,
      };

      // Add custom created_at for historical imports
      if (formData.created_at) {
        insertData.created_at = new Date(formData.created_at).toISOString();
      }

      const { data, error } = await supabase
        .from('actions')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      // If there's an initial comment (legacy import), create an action_update
      if (formData.initial_comment.trim() && data) {
        await supabase
          .from('action_updates')
          .insert({
            action_id: data.id,
            user_id: createdBy, // Use same user as action creator for legacy comments
            content: formData.initial_comment.trim(),
          });
      }

      toast.success('Action created successfully');
      router.push(`/actions/${data.id}`);
    } catch (error) {
      console.error('Error creating action:', error);
      toast.error('Failed to create action');
    } finally {
      setLoading(false);
    }
  };

  // Use hierarchy format for cleaner dropdowns, exclude parent workstreams that have children
  const workstreamOptions = buildWorkstreamOptions(workstreams, {
    allLabel: 'Select a workstream...',
    allValue: '',
    excludeParentsWithChildren: true,
    mapOption: (ws) => ({
      icon: <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ws.color }} />,
    }),
  });

  const userOptions = [
    { value: '', label: 'Unassigned' },
    ...users.map(u => ({ value: u.id, label: u.full_name })),
  ];

  // Options for created_by in import section - defaults to System if blank
  const createdByOptions = [
    { value: '', label: 'System (default)' },
    ...users.filter(u => u.id !== '00000000-0000-0000-0000-000000000000').map(u => ({ value: u.id, label: u.full_name })),
  ];

  const priorityOptions = [
    { value: '', label: 'Unassigned' },
    { value: 'critical', label: 'Critical' },
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' },
  ];

  return (
    <div className="min-h-screen">
      <Header
        title="New Action"
        subtitle="Create a new action item"
        breadcrumbs={[
          { label: 'Actions', href: '/actions' },
          { label: 'New Action' },
        ]}
      />

      <div className="p-6 max-w-2xl">
        <form onSubmit={handleSubmit}>
          <Card>
            <CardContent className="space-y-6 pt-6">
              <Input
                label="Title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Enter action title"
                required
              />

              <Textarea
                label="Description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter action description (optional)"
                rows={4}
              />

              <Select
                label="Workstream"
                options={workstreamOptions}
                value={formData.workstream_id}
                onChange={(value) => setFormData({ ...formData, workstream_id: value })}
              />

              <div className="grid grid-cols-2 gap-4">
                <Select
                  label="Priority"
                  options={priorityOptions}
                  value={formData.priority}
                  onChange={(value) => setFormData({ ...formData, priority: value as Priority })}
                />

                <Select
                  label="Owner"
                  options={userOptions}
                  value={formData.owner_id}
                  onChange={(value) => setFormData({ ...formData, owner_id: value })}
                  disabled={loadingUsers}
                />
              </div>

              <Input
                label="Due Date"
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
              />

              {/* Legacy Import Section */}
              <div className="border-t pt-6 mt-6">
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700">Legacy Import Options</p>
                  <p className="text-xs text-gray-500 mt-1">
                    For importing historical actions from another system. Leave blank for new actions.
                  </p>
                </div>

                <div className="space-y-4 bg-gray-50 p-4 rounded-lg">
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="Date Created"
                      type="date"
                      value={formData.created_at}
                      onChange={(e) => setFormData({ ...formData, created_at: e.target.value })}
                    />
                    <Input
                      label="Date Closed"
                      type="date"
                      value={formData.completed_at}
                      onChange={(e) => setFormData({ ...formData, completed_at: e.target.value })}
                    />
                  </div>

                  <Select
                    label="Created By"
                    options={createdByOptions}
                    value={formData.created_by_override}
                    onChange={(value) => setFormData({ ...formData, created_by_override: value })}
                    disabled={loadingUsers}
                  />

                  <Textarea
                    label="Initial Comment"
                    value={formData.initial_comment}
                    onChange={(e) => setFormData({ ...formData, initial_comment: e.target.value })}
                    placeholder="Paste legacy comments or notes from another system"
                    rows={4}
                  />
                </div>
              </div>
            </CardContent>

            <CardFooter>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button type="submit" loading={loading}>
                Create Action
              </Button>
            </CardFooter>
          </Card>
        </form>
      </div>
    </div>
  );
}
