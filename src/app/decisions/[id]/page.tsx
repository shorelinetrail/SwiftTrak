'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { usePermission } from '@/hooks/use-user';
import { useAppStore } from '@/stores/app-store';
import { Header } from '@/components/layout/header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Avatar } from '@/components/ui/avatar';
import { Modal } from '@/components/ui/modal';
import { LoadingSpinner } from '@/components/ui/loading';
import { formatDate, buildWorkstreamOptions } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
  TrashIcon,
  PencilIcon,
  DocumentTextIcon,
  LightBulbIcon,
  ArrowTrendingUpIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import type { Decision, Workstream, User, DecisionAudit } from '@/types/database';

function formatAuditEntry(entry: DecisionAudit): string {
  switch (entry.change_type) {
    case 'created':
      return `Decision recorded: "${entry.new_value}"`;
    case 'title_changed':
      return `Title changed from "${entry.old_value}" to "${entry.new_value}"`;
    case 'rationale_changed':
      return `Rationale updated`;
    case 'impact_changed':
      return `Impact updated`;
    case 'description_changed':
      return `Description updated`;
    case 'workstream_changed':
      return `Workstream changed`;
    default:
      return `${entry.change_type}: ${entry.old_value || ''} → ${entry.new_value || ''}`;
  }
}

type DecisionWithRelations = Decision & {
  workstream?: Workstream;
  decision_maker?: User;
};

export default function DecisionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const decisionId = params.id as string;

  const { workstreams, setWorkstreams } = useAppStore();
  const { canEdit, canAdmin } = usePermission();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [decision, setDecision] = useState<DecisionWithRelations | null>(null);
  const [auditLog, setAuditLog] = useState<(DecisionAudit & { user?: User })[]>([]);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    title: '',
    description: '',
    workstream_id: '',
    rationale: '',
    impact: '',
  });

  const fetchDecision = useCallback(async () => {
    const supabase = createClient();

    const [decisionResult, auditResult] = await Promise.all([
      supabase
        .from('decisions')
        .select(`
          *,
          workstream:workstreams(id, name, color),
          decision_maker:users!decisions_made_by_fkey(id, full_name, email, avatar_url)
        `)
        .eq('id', decisionId)
        .single(),
      supabase
        .from('decision_audit')
        .select(`
          *,
          user:users(id, full_name)
        `)
        .eq('decision_id', decisionId)
        .order('created_at', { ascending: false }),
    ]);

    if (decisionResult.error || !decisionResult.data) {
      toast.error('Decision not found');
      router.push('/decisions');
      return;
    }

    const decisionData = decisionResult.data as unknown as DecisionWithRelations;
    setDecision(decisionData);
    setEditFormData({
      title: decisionData.title,
      description: decisionData.description,
      workstream_id: decisionData.workstream_id || '',
      rationale: decisionData.rationale || '',
      impact: decisionData.impact || '',
    });

    if (auditResult.data) {
      setAuditLog(auditResult.data as unknown as (DecisionAudit & { user?: User })[]);
    }

    setLoading(false);
  }, [decisionId, router]);

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
    fetchDecision();
  }, [fetchDecision]);

  const handleSave = async () => {
    if (!canEdit) {
      toast.error('You do not have permission to edit decisions');
      return;
    }

    if (!editFormData.title.trim()) {
      toast.error('Title is required');
      return;
    }

    if (!editFormData.description.trim()) {
      toast.error('Decision description is required');
      return;
    }

    setSaving(true);

    try {
      const supabase = createClient();

      const { error } = await supabase
        .from('decisions')
        .update({
          title: editFormData.title.trim(),
          description: editFormData.description.trim(),
          workstream_id: editFormData.workstream_id || null,
          rationale: editFormData.rationale.trim() || null,
          impact: editFormData.impact.trim() || null,
        })
        .eq('id', decisionId);

      if (error) throw error;

      toast.success('Decision updated');
      setEditModalOpen(false);
      fetchDecision();
    } catch (error) {
      console.error('Error updating decision:', error);
      toast.error('Failed to update decision');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const supabase = createClient();

      const { error } = await supabase
        .from('decisions')
        .delete()
        .eq('id', decisionId);

      if (error) throw error;

      toast.success('Decision deleted');
      router.push('/decisions');
    } catch (error) {
      console.error('Error deleting decision:', error);
      toast.error('Failed to delete decision');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header
          title="Loading..."
          breadcrumbs={[
            { label: 'Decisions', href: '/decisions' },
            { label: 'Loading...' },
          ]}
        />
        <div className="p-6 flex items-center justify-center h-64">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  if (!decision) {
    return null;
  }

  return (
    <div className="min-h-screen">
      <Header
        title={decision.title}
        subtitle={decision.workstream?.name || 'Decision Log Entry'}
        breadcrumbs={[
          { label: 'Decisions', href: '/decisions' },
          { label: decision.title },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => setEditModalOpen(true)}>
                <PencilIcon className="w-4 h-4" />
              </Button>
            )}
            {canAdmin && (
              <Button variant="danger" size="sm" onClick={() => setDeleteModalOpen(true)}>
                <TrashIcon className="w-4 h-4" />
              </Button>
            )}
          </div>
        }
      />

      <div className="p-6 max-w-4xl space-y-6">
        {/* Decision Maker Info */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {decision.decision_maker && (
                  <>
                    <Avatar
                      src={decision.decision_maker.avatar_url}
                      name={decision.decision_maker.full_name}
                      size="lg"
                    />
                    <div>
                      <p className="text-lg font-medium text-gray-900">
                        {decision.decision_maker.full_name}
                      </p>
                      <p className="text-sm text-gray-500">
                        Recorded on {formatDate(decision.created_at)}
                      </p>
                    </div>
                  </>
                )}
              </div>
              {decision.workstream && (
                <span
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium"
                  style={{
                    backgroundColor: `${decision.workstream.color}20`,
                    color: decision.workstream.color,
                  }}
                >
                  {decision.workstream.name}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Decision Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DocumentTextIcon className="w-5 h-5 text-gray-400" />
              Decision
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-900 whitespace-pre-wrap">{decision.description}</p>
          </CardContent>
        </Card>

        {decision.rationale && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LightBulbIcon className="w-5 h-5 text-yellow-500" />
                Rationale
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700 whitespace-pre-wrap">{decision.rationale}</p>
            </CardContent>
          </Card>
        )}

        {decision.impact && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowTrendingUpIcon className="w-5 h-5 text-blue-500" />
                Expected Impact
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700 whitespace-pre-wrap">{decision.impact}</p>
            </CardContent>
          </Card>
        )}

        {/* Audit Log */}
        {auditLog.length > 0 && (
          <Card>
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

      {/* Edit Modal */}
      <Modal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Decision"
      >
        <div className="space-y-4">
          <Input
            label="Title"
            value={editFormData.title}
            onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
            placeholder="Decision title"
            required
          />

          <Textarea
            label="Decision"
            value={editFormData.description}
            onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
            placeholder="Describe the decision that was made"
            rows={3}
            required
          />

          <Select
            label="Workstream (Optional)"
            options={buildWorkstreamOptions(workstreams, {
              allLabel: 'No specific workstream',
              allValue: '',
            })}
            value={editFormData.workstream_id}
            onChange={(value) => setEditFormData({ ...editFormData, workstream_id: value })}
          />

          <Textarea
            label="Rationale (Optional)"
            value={editFormData.rationale}
            onChange={(e) => setEditFormData({ ...editFormData, rationale: e.target.value })}
            placeholder="Why was this decision made?"
            rows={3}
          />

          <Textarea
            label="Expected Impact (Optional)"
            value={editFormData.impact}
            onChange={(e) => setEditFormData({ ...editFormData, impact: e.target.value })}
            placeholder="What is the expected impact of this decision?"
            rows={3}
          />

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setEditModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving}>
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete Decision"
      >
        <p className="text-gray-600 mb-4">
          Are you sure you want to delete this decision record? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            Delete Decision
          </Button>
        </div>
      </Modal>
    </div>
  );
}
