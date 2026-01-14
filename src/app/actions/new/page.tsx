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
    priority: 'medium' as Priority,
    due_date: '',
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

      const { data, error } = await supabase
        .from('actions')
        .insert({
          title: formData.title.trim(),
          description: formData.description.trim() || null,
          workstream_id: formData.workstream_id,
          owner_id: formData.owner_id || null,
          priority: formData.priority,
          due_date: formData.due_date || null,
          status: 'pending',
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Action created successfully');
      router.push(`/actions/${data.id}`);
    } catch (error) {
      console.error('Error creating action:', error);
      toast.error('Failed to create action');
    } finally {
      setLoading(false);
    }
  };

  const workstreamOptions = buildWorkstreamOptions(workstreams, {
    allLabel: 'Select a workstream...',
    allValue: '',
  });

  const userOptions = [
    { value: '', label: 'Unassigned' },
    ...users.map(u => ({ value: u.id, label: u.full_name })),
  ];

  const priorityOptions = [
    { value: 'critical', label: 'Critical' },
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' },
  ];

  return (
    <div className="min-h-screen">
      <Header title="New Action" subtitle="Create a new action item" />

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
