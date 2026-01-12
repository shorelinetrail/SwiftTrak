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
import type { Workstream } from '@/types/database';

export default function NewMilestonePage() {
  const router = useRouter();
  const { user, workstreams, setWorkstreams } = useAppStore();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    workstream_id: '',
    target_date: '',
  });

  // Fetch workstreams if not already loaded
  useEffect(() => {
    if (workstreams.length === 0) {
      const fetchWorkstreams = async () => {
        const supabase = createClient();
        const { data } = await supabase
          .from('workstreams')
          .select('*')
          .order('order_index');
        if (data) {
          setWorkstreams(data as Workstream[]);
        }
      };
      fetchWorkstreams();
    }
  }, [workstreams.length, setWorkstreams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Form submitted!');

    if (!formData.title.trim()) {
      toast.error('Title is required');
      return;
    }

    if (!formData.target_date) {
      toast.error('Target date is required');
      return;
    }

    setLoading(true);
    console.log('Loading set, creating supabase client...');

    try {
      const supabase = createClient();
      console.log('Calling getUser...');

      // Get current user directly from auth
      const { data: { user: authUser } } = await supabase.auth.getUser();
      console.log('Auth user:', authUser?.id);

      if (!authUser) {
        toast.error('Please log in to create a milestone');
        router.push('/auth/login');
        return;
      }

      const { data, error } = await supabase
        .from('milestones')
        .insert({
          title: formData.title.trim(),
          description: formData.description.trim() || null,
          workstream_id: formData.workstream_id || null,
          target_date: formData.target_date,
          status: 'pending',
          created_by: authUser.id,
        })
        .select()
        .single();

      if (error) {
        console.error('Insert error:', error);
        throw error;
      }

      toast.success('Milestone created');
      router.push('/milestones');
    } catch (error) {
      console.error('Error creating milestone:', error);
      toast.error('Failed to create milestone: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const workstreamOptions = [
    { value: '', label: 'No specific workstream' },
    ...workstreams.map(w => ({ value: w.id, label: w.name })),
  ];

  return (
    <div className="min-h-screen">
      <Header title="Add Milestone" subtitle="Define a key project target" />

      <div className="p-6 max-w-2xl">
        <form onSubmit={handleSubmit}>
          <Card>
            <CardContent className="space-y-6 pt-6">
              <Input
                label="Milestone Title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., Equipment back online"
                required
              />

              <Textarea
                label="Description (Optional)"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Additional details about this milestone"
                rows={3}
              />

              <Input
                label="Target Date"
                type="date"
                value={formData.target_date}
                onChange={(e) => setFormData({ ...formData, target_date: e.target.value })}
                required
              />

              <Select
                label="Workstream (Optional)"
                options={workstreamOptions}
                value={formData.workstream_id}
                onChange={(value) => setFormData({ ...formData, workstream_id: value })}
              />
            </CardContent>

            <CardFooter>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button type="submit" loading={loading}>
                Create Milestone
              </Button>
            </CardFooter>
          </Card>
        </form>
      </div>
    </div>
  );
}
