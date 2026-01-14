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
import type { QueryPriority, User, Workstream } from '@/types/database';

export default function NewQueryPage() {
  const router = useRouter();
  const { user, workstreams, setWorkstreams } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    workstream_id: '',
    assigned_to: '',
    priority: 'medium' as QueryPriority,
  });

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

      // Fetch users
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .order('full_name');
      if (userData) {
        setUsers(userData as User[]);
      }
    };

    fetchData();
  }, [workstreams.length, setWorkstreams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      toast.error('Title is required');
      return;
    }

    if (!formData.description.trim()) {
      toast.error('Description is required');
      return;
    }

    if (!formData.assigned_to) {
      toast.error('Please select someone to assign this query to');
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      const { data, error } = await supabase
        .from('technical_queries')
        .insert({
          title: formData.title.trim(),
          description: formData.description.trim(),
          workstream_id: formData.workstream_id || null,
          assigned_to: formData.assigned_to,
          priority: formData.priority,
          submitted_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Send email notification
      await fetch('/api/notifications/query-assigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queryId: data.id }),
      });

      toast.success('Query submitted successfully');
      router.push(`/queries/${data.id}`);
    } catch (error) {
      console.error('Error creating query:', error);
      toast.error('Failed to submit query');
    } finally {
      setLoading(false);
    }
  };

  const workstreamOptions = buildWorkstreamOptions(workstreams, {
    allLabel: 'No specific workstream',
    allValue: '',
  });

  const userOptions = [
    { value: '', label: 'Select a person...' },
    ...users.filter(u => u.id !== user?.id).map(u => ({ value: u.id, label: u.full_name })),
  ];

  const priorityOptions = [
    { value: 'urgent', label: 'Urgent - Immediate Response Required', description: 'For critical blockers' },
    { value: 'high', label: 'High - Within Hours', description: 'Important but not blocking' },
    { value: 'medium', label: 'Medium - Within 1 Day', description: 'Standard priority' },
    { value: 'low', label: 'Low - Within 2-3 Days', description: 'Non-urgent information' },
  ];

  return (
    <div className="min-h-screen">
      <Header title="Submit Technical Query" subtitle="Get answers from your team" />

      <div className="p-6 max-w-2xl">
        <form onSubmit={handleSubmit}>
          <Card>
            <CardContent className="space-y-6 pt-6">
              <Input
                label="Query Title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Brief summary of your question"
                required
              />

              <Textarea
                label="Description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Provide full details of your technical query..."
                rows={6}
                required
              />

              <Select
                label="Assign To"
                options={userOptions}
                value={formData.assigned_to}
                onChange={(value) => setFormData({ ...formData, assigned_to: value })}
              />

              <Select
                label="Priority"
                options={priorityOptions}
                value={formData.priority}
                onChange={(value) => setFormData({ ...formData, priority: value as QueryPriority })}
              />

              <Select
                label="Workstream (Optional)"
                options={workstreamOptions}
                value={formData.workstream_id}
                onChange={(value) => setFormData({ ...formData, workstream_id: value })}
              />

              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
                <h4 className="font-medium text-gray-900 mb-2">Priority Guidelines</h4>
                <ul className="space-y-1">
                  <li><strong>Urgent:</strong> Immediate response needed - critical blocker</li>
                  <li><strong>High:</strong> Response within hours - important decision pending</li>
                  <li><strong>Medium:</strong> Response within 1 day - standard query</li>
                  <li><strong>Low:</strong> Response within 2-3 days - non-urgent information</li>
                </ul>
              </div>
            </CardContent>

            <CardFooter>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button type="submit" loading={loading}>
                Submit Query
              </Button>
            </CardFooter>
          </Card>
        </form>
      </div>
    </div>
  );
}
