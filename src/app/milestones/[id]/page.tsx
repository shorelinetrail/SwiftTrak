'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import { usePermission } from '@/hooks/use-user';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading';
import toast from 'react-hot-toast';
import type { Workstream, Milestone } from '@/types/database';

type MilestoneWithRelations = Milestone & {
  workstream?: Workstream;
};

export default function EditMilestonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { workstreams, setWorkstreams } = useAppStore();
  const { canEdit } = usePermission();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [milestone, setMilestone] = useState<MilestoneWithRelations | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    workstream_id: '',
    target_date: '',
    status: 'pending' as Milestone['status'],
  });

  const fetchMilestone = useCallback(async () => {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('milestones')
      .select(`
        *,
        workstream:workstreams(id, name, color)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching milestone:', error);
      toast.error('Milestone not found');
      router.push('/milestones');
      return;
    }

    const milestoneData = data as unknown as MilestoneWithRelations;
    setMilestone(milestoneData);
    setFormData({
      title: milestoneData.title,
      description: milestoneData.description || '',
      workstream_id: milestoneData.workstream_id || '',
      target_date: new Date(milestoneData.target_date).toISOString().slice(0, 10),
      status: milestoneData.status,
    });
    setLoading(false);
  }, [id, router]);

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

  useEffect(() => {
    fetchMilestone();
  }, [fetchMilestone]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canEdit) {
      toast.error('You do not have permission to edit milestones');
      return;
    }

    if (!formData.title.trim()) {
      toast.error('Title is required');
      return;
    }

    if (!formData.target_date) {
      toast.error('Target date is required');
      return;
    }

    setSaving(true);

    try {
      const supabase = createClient();

      const updateData: Partial<Milestone> = {
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        workstream_id: formData.workstream_id || undefined,
        target_date: formData.target_date,
        status: formData.status,
      };

      // If status changed to completed, set completed_at
      if (formData.status === 'completed' && milestone?.status !== 'completed') {
        updateData.completed_at = new Date().toISOString();
      } else if (formData.status !== 'completed') {
        updateData.completed_at = undefined;
      }

      const { error } = await supabase
        .from('milestones')
        .update(updateData)
        .eq('id', id);

      if (error) {
        console.error('Update error:', error);
        throw error;
      }

      toast.success('Milestone updated');
      router.push('/milestones');
    } catch (error) {
      console.error('Error updating milestone:', error);
      toast.error('Failed to update milestone');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!canEdit) {
      toast.error('You do not have permission to delete milestones');
      return;
    }

    if (!confirm('Are you sure you want to delete this milestone?')) {
      return;
    }

    setSaving(true);

    try {
      const supabase = createClient();

      const { error } = await supabase
        .from('milestones')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Milestone deleted');
      router.push('/milestones');
    } catch (error) {
      console.error('Error deleting milestone:', error);
      toast.error('Failed to delete milestone');
    } finally {
      setSaving(false);
    }
  };

  const workstreamOptions = [
    { value: '', label: 'No specific workstream' },
    ...workstreams.map(w => ({ value: w.id, label: w.name })),
  ];

  const statusOptions = [
    { value: 'pending', label: 'Pending' },
    { value: 'completed', label: 'Completed' },
    { value: 'missed', label: 'Missed' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header title="Edit Milestone" />
        <div className="flex items-center justify-center h-96">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  if (!milestone) {
    return null;
  }

  return (
    <div className="min-h-screen">
      <Header title="Edit Milestone" subtitle={milestone.title} />

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
                disabled={!canEdit}
              />

              <Textarea
                label="Description (Optional)"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Additional details about this milestone"
                rows={3}
                disabled={!canEdit}
              />

              <Input
                label="Target Date"
                type="date"
                value={formData.target_date}
                onChange={(e) => setFormData({ ...formData, target_date: e.target.value })}
                required
                disabled={!canEdit}
              />

              <Select
                label="Workstream (Optional)"
                options={workstreamOptions}
                value={formData.workstream_id}
                onChange={(value) => setFormData({ ...formData, workstream_id: value })}
                disabled={!canEdit}
              />

              <Select
                label="Status"
                options={statusOptions}
                value={formData.status}
                onChange={(value) => setFormData({ ...formData, status: value as Milestone['status'] })}
                disabled={!canEdit}
              />
            </CardContent>

            <CardFooter className="flex justify-between">
              <div>
                {canEdit && (
                  <Button
                    type="button"
                    variant="danger"
                    onClick={handleDelete}
                    disabled={saving}
                  >
                    Delete
                  </Button>
                )}
              </div>
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={() => router.back()}>
                  Cancel
                </Button>
                {canEdit && (
                  <Button type="submit" loading={saving}>
                    Save Changes
                  </Button>
                )}
              </div>
            </CardFooter>
          </Card>
        </form>
      </div>
    </div>
  );
}
