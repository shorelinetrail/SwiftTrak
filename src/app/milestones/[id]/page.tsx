'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import { usePermission } from '@/hooks/use-user';
import { Header } from '@/components/layout/header';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading';
import { ClockIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { buildWorkstreamOptions, formatDate } from '@/lib/utils';
import type { Workstream, Milestone, MilestoneAudit, User } from '@/types/database';

function formatAuditEntry(entry: MilestoneAudit): string {
  switch (entry.change_type) {
    case 'created':
      return `Milestone created: "${entry.new_value}"`;
    case 'status_changed':
      return `Status changed from ${entry.old_value} to ${entry.new_value}`;
    case 'title_changed':
      return `Title changed from "${entry.old_value}" to "${entry.new_value}"`;
    case 'target_date_changed':
      return `Target date changed from ${entry.old_value} to ${entry.new_value}`;
    default:
      return `${entry.change_type}: ${entry.old_value || ''} → ${entry.new_value || ''}`;
  }
}

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
  const [auditLog, setAuditLog] = useState<(MilestoneAudit & { user?: User })[]>([]);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    workstream_id: '',
    target_date: '',
    status: 'pending' as Milestone['status'],
  });

  const fetchMilestone = useCallback(async () => {
    const supabase = createClient();

    const [milestoneResult, auditResult] = await Promise.all([
      supabase
        .from('milestones')
        .select(`
          *,
          workstream:workstreams(id, name, color)
        `)
        .eq('id', id)
        .single(),
      supabase
        .from('milestone_audit')
        .select(`
          *,
          user:users(id, full_name)
        `)
        .eq('milestone_id', id)
        .order('created_at', { ascending: false }),
    ]);

    if (milestoneResult.error) {
      console.error('Error fetching milestone:', milestoneResult.error);
      toast.error('Milestone not found');
      router.push('/milestones');
      return;
    }

    const milestoneData = milestoneResult.data as unknown as MilestoneWithRelations;
    setMilestone(milestoneData);
    setFormData({
      title: milestoneData.title,
      description: milestoneData.description || '',
      workstream_id: milestoneData.workstream_id || '',
      target_date: new Date(milestoneData.target_date).toISOString().slice(0, 10),
      status: milestoneData.status,
    });

    if (auditResult.data) {
      setAuditLog(auditResult.data as unknown as (MilestoneAudit & { user?: User })[]);
    }

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

  const workstreamOptions = buildWorkstreamOptions(workstreams, {
    allLabel: 'No specific workstream',
    allValue: '',
  });

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
      <Header
        title="Edit Milestone"
        subtitle={milestone.title}
        breadcrumbs={[
          { label: 'Milestones', href: '/milestones' },
          { label: milestone.title },
        ]}
      />

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

        {/* Audit Log */}
        {auditLog.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClockIcon className="w-5 h-5 text-gray-400" />
                Activity Log
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {auditLog.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-3 text-sm">
                    <div className="w-2 h-2 mt-1.5 rounded-full bg-gray-400 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-gray-900">
                        {formatAuditEntry(entry)}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {entry.user?.full_name || 'System'} &middot; {formatDate(entry.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
