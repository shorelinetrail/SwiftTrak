'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
// import { useRealtime } from '@/hooks/use-realtime';
import { usePermission } from '@/hooks/use-user';
import { Header } from '@/components/layout/header';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { RiskBadge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { LoadingPage } from '@/components/ui/loading';
import { formatDate, buildWorkstreamOptions } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
  PencilIcon,
  TrashIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import type { Threat, Workstream, User, RiskLevel, ThreatAudit } from '@/types/database';

type ThreatWithRelations = Threat & {
  workstream?: Workstream;
  creator?: User;
};

function formatAuditEntry(entry: ThreatAudit): string {
  switch (entry.change_type) {
    case 'created':
      return `Threat created: "${entry.new_value}"`;
    case 'status_changed':
      return `Status changed from ${entry.old_value} to ${entry.new_value}`;
    case 'risk_changed':
      return `Current risk changed from ${entry.old_value} to ${entry.new_value}`;
    case 'title_changed':
      return `Title changed from "${entry.old_value}" to "${entry.new_value}"`;
    case 'mitigated_risk_changed':
      return `Mitigated risk set to ${entry.new_value}`;
    case 'solution_added':
      return 'Solution was added';
    default:
      return `${entry.change_type}: ${entry.old_value || ''} → ${entry.new_value || ''}`;
  }
}

export default function ThreatDetailPage() {
  const params = useParams();
  const router = useRouter();
  const threatId = params.id as string;

  const { workstreams } = useAppStore();
  const { canEdit, canAdmin, loading: permissionLoading } = usePermission();
  const [loading, setLoading] = useState(true);
  const [threat, setThreat] = useState<ThreatWithRelations | null>(null);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Threat>>({});
  const [auditLog, setAuditLog] = useState<(ThreatAudit & { user?: User })[]>([]);

  const fetchThreat = useCallback(async () => {
    const supabase = createClient();

    try {
      // Add timeout to prevent hanging
      const [threatResult, auditResult] = await Promise.all([
        Promise.race([
          supabase
            .from('threats')
            .select(`
              *,
              workstream:workstreams(id, name, color),
              creator:users!threats_created_by_fkey(id, full_name)
            `)
            .eq('id', threatId)
            .single(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
        ]),
        Promise.race([
          supabase
            .from('threat_audit')
            .select(`
              *,
              user:users(id, full_name)
            `)
            .eq('threat_id', threatId)
            .order('created_at', { ascending: false }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
        ]),
      ]);

      if (!threatResult || threatResult.error || !threatResult.data) {
        toast.error('Threat not found');
        router.push('/threats');
        return;
      }

      setThreat(threatResult.data as unknown as ThreatWithRelations);
      setEditForm(threatResult.data);

      if (auditResult?.data) {
        setAuditLog(auditResult.data as unknown as (ThreatAudit & { user?: User })[]);
      }
    } catch (error) {
      console.error('[ThreatDetail] Error:', error);
      toast.error('Failed to load threat');
    } finally {
      setLoading(false);
    }
  }, [threatId, router]);

  useEffect(() => {
    fetchThreat();
  }, [fetchThreat]);

  // useRealtime({
  //   table: 'threats',
  //   filter: `id=eq.${threatId}`,
  //   onUpdate: () => fetchThreat(),
  // });

  const handleSaveEdit = async () => {
    try {
      const supabase = createClient();

      const { error } = await supabase
        .from('threats')
        .update({
          title: editForm.title,
          description: editForm.description,
          workstream_id: editForm.workstream_id,
          proposed_mitigation: editForm.proposed_mitigation,
          expected_delay: editForm.expected_delay,
          unmitigated_risk: editForm.unmitigated_risk,
          current_risk: editForm.current_risk,
          solution: editForm.solution,
          mitigated_risk: editForm.mitigated_risk,
        })
        .eq('id', threatId);

      if (error) throw error;

      toast.success('Threat updated');
      setEditModalOpen(false);
      fetchThreat();
    } catch (error) {
      console.error('Error updating threat:', error);
      toast.error('Failed to update threat');
    }
  };

  const handleCloseThreat = async (mitigatedRisk: RiskLevel, actualDelay?: string) => {
    try {
      const supabase = createClient();

      const { error } = await supabase
        .from('threats')
        .update({
          status: 'closed',
          mitigated_risk: mitigatedRisk,
          actual_delay: actualDelay || null,
        })
        .eq('id', threatId);

      if (error) throw error;

      toast.success('Threat closed');
      setCloseModalOpen(false);
      fetchThreat();
    } catch (error) {
      console.error('Error closing threat:', error);
      toast.error('Failed to close threat');
    }
  };

  const handleReopenThreat = async () => {
    try {
      const supabase = createClient();

      const { error } = await supabase
        .from('threats')
        .update({
          status: 'open',
        })
        .eq('id', threatId);

      if (error) throw error;

      toast.success('Threat reopened');
      fetchThreat();
    } catch (error) {
      console.error('Error reopening threat:', error);
      toast.error('Failed to reopen threat');
    }
  };

  const handleUpdateCurrentRisk = async (newRisk: RiskLevel) => {
    try {
      const supabase = createClient();

      const { error } = await supabase
        .from('threats')
        .update({ current_risk: newRisk })
        .eq('id', threatId);

      if (error) throw error;

      toast.success('Risk level updated');
      fetchThreat();
    } catch (error) {
      console.error('Error updating risk:', error);
      toast.error('Failed to update risk level');
    }
  };

  const handleDelete = async () => {
    try {
      const supabase = createClient();

      const { error } = await supabase
        .from('threats')
        .delete()
        .eq('id', threatId);

      if (error) throw error;

      toast.success('Threat deleted');
      router.push('/threats');
    } catch (error) {
      console.error('Error deleting threat:', error);
      toast.error('Failed to delete threat');
    }
  };

  if (loading) {
    return <LoadingPage />;
  }

  if (!threat) {
    return null;
  }

  const riskOptions = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
  ];

  // Build workstream options - ensure current threat's workstream is always included
  const workstreamOptions = workstreams.length > 0
    ? buildWorkstreamOptions(workstreams, { includeAll: false })
    : threat?.workstream
      ? [{ value: threat.workstream.id, label: threat.workstream.name }]
      : [];

  return (
    <div className="min-h-screen">
      <Header
        title={
          <div className="flex items-center gap-3">
            <span>{threat.title}</span>
            {threat.status === 'closed' ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                Closed
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                Open
              </span>
            )}
          </div>
        }
        subtitle={threat.workstream?.name}
        actions={
          !permissionLoading && (
            <div className="flex gap-2">
              {canEdit && threat.status === 'open' && (
                <Button variant="secondary" size="sm" onClick={() => setCloseModalOpen(true)}>
                  <CheckCircleIcon className="w-4 h-4 mr-2" />
                  Close Threat
                </Button>
              )}
              {canEdit && threat.status === 'closed' && (
                <Button variant="secondary" size="sm" onClick={handleReopenThreat}>
                  <ArrowPathIcon className="w-4 h-4 mr-2" />
                  Reopen
                </Button>
              )}
              {canEdit && (
                <Button variant="outline" size="sm" onClick={() => setEditModalOpen(true)}>
                  <PencilIcon className="w-4 h-4 mr-2" />
                  Edit
                </Button>
              )}
              {canAdmin && (
                <Button variant="danger" size="sm" onClick={() => setDeleteModalOpen(true)}>
                  <TrashIcon className="w-4 h-4" />
                </Button>
              )}
            </div>
          )
        }
      />

      <div className="p-6 max-w-4xl space-y-6">
        {/* Risk Overview */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-sm text-gray-500 mb-2">Unmitigated Risk</p>
              <RiskBadge risk={threat.unmitigated_risk} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-sm text-gray-500 mb-2">Current Risk</p>
              {canEdit && threat.status === 'open' ? (
                <Select
                  options={riskOptions}
                  value={threat.current_risk}
                  onChange={(value) => handleUpdateCurrentRisk(value as RiskLevel)}
                  className="w-full"
                />
              ) : (
                <RiskBadge risk={threat.current_risk} />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-sm text-gray-500 mb-2">Mitigated Risk</p>
              {threat.mitigated_risk ? (
                <RiskBadge risk={threat.mitigated_risk} />
              ) : (
                <span className="text-gray-400 text-sm">TBD</span>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Details */}
        <Card>
          <CardHeader>
            <CardTitle>Threat Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-1">Description</h4>
              <p className="text-gray-900">{threat.description}</p>
            </div>

            {threat.expected_delay && (
              <div>
                <h4 className="text-sm font-medium text-gray-500 mb-1">Potential Delay</h4>
                <p className="text-gray-900">{threat.expected_delay}</p>
              </div>
            )}

            {threat.status === 'closed' && threat.actual_delay && (
              <div>
                <h4 className="text-sm font-medium text-gray-500 mb-1">Actual Delay</h4>
                <p className="text-gray-900">{threat.actual_delay}</p>
              </div>
            )}

            {threat.proposed_mitigation && (
              <div>
                <h4 className="text-sm font-medium text-gray-500 mb-1">Proposed Mitigation</h4>
                <p className="text-gray-900">{threat.proposed_mitigation}</p>
              </div>
            )}

            {threat.solution && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h4 className="text-sm font-medium text-green-800 mb-1">Solution</h4>
                <p className="text-green-700">{threat.solution}</p>
              </div>
            )}

            <div className="pt-4 border-t border-gray-200 grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Workstream</span>
                {threat.workstream && (
                  <p className="mt-1">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                      style={{
                        backgroundColor: `${threat.workstream.color}20`,
                        color: threat.workstream.color,
                      }}
                    >
                      {threat.workstream.name}
                    </span>
                  </p>
                )}
              </div>
              <div>
                <span className="text-gray-500">Created</span>
                <p className="mt-1 font-medium text-gray-900">
                  {formatDate(threat.created_at)} by {threat.creator?.full_name}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

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
        title="Edit Threat"
        size="lg"
      >
        <div className="space-y-4">
          <Input
            label="Title"
            value={editForm.title || ''}
            onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
          />
          <Textarea
            label="Description"
            value={editForm.description || ''}
            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
            rows={4}
          />
          <Select
            label="Workstream"
            options={workstreamOptions}
            value={editForm.workstream_id || ''}
            onChange={(value) => setEditForm({ ...editForm, workstream_id: value })}
          />
          <div className="grid grid-cols-3 gap-4">
            <Select
              label="Unmitigated Risk"
              options={riskOptions}
              value={editForm.unmitigated_risk || 'medium'}
              onChange={(value) => setEditForm({ ...editForm, unmitigated_risk: value as RiskLevel })}
            />
            <Select
              label="Current Risk"
              options={riskOptions}
              value={editForm.current_risk || 'medium'}
              onChange={(value) => setEditForm({ ...editForm, current_risk: value as RiskLevel })}
            />
            <Select
              label="Mitigated Risk"
              options={[{ value: '', label: 'TBD' }, ...riskOptions]}
              value={editForm.mitigated_risk || ''}
              onChange={(value) => setEditForm({ ...editForm, mitigated_risk: value as RiskLevel })}
            />
          </div>
          <Input
            label="Potential Delay"
            value={editForm.expected_delay || ''}
            onChange={(e) => setEditForm({ ...editForm, expected_delay: e.target.value })}
          />
          <Textarea
            label="Proposed Mitigation"
            value={editForm.proposed_mitigation || ''}
            onChange={(e) => setEditForm({ ...editForm, proposed_mitigation: e.target.value })}
            rows={3}
          />
          <Textarea
            label="Solution"
            value={editForm.solution || ''}
            onChange={(e) => setEditForm({ ...editForm, solution: e.target.value })}
            rows={3}
          />
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => setEditModalOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSaveEdit}>Save Changes</Button>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete Threat"
      >
        <p className="text-gray-600 mb-4">
          Are you sure you want to delete this threat? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            Delete Threat
          </Button>
        </div>
      </Modal>

      {/* Close Threat Modal */}
      <CloseTheatModal
        open={closeModalOpen}
        onClose={() => setCloseModalOpen(false)}
        onConfirm={handleCloseThreat}
        expectedDelay={threat?.expected_delay}
      />
    </div>
  );
}

function CloseTheatModal({
  open,
  onClose,
  onConfirm,
  expectedDelay,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (mitigatedRisk: RiskLevel, actualDelay?: string) => void;
  expectedDelay?: string;
}) {
  const [mitigatedRisk, setMitigatedRisk] = useState<RiskLevel>('low');
  const [actualDelay, setActualDelay] = useState('');

  const riskOptions = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
  ];

  return (
    <Modal open={open} onClose={onClose} title="Close Threat">
      <div className="space-y-4">
        <p className="text-gray-600">
          Closing a threat indicates it has been successfully mitigated. Please provide the final details.
        </p>
        <Select
          label="Mitigated Risk Level"
          options={riskOptions}
          value={mitigatedRisk}
          onChange={(value) => setMitigatedRisk(value as RiskLevel)}
        />
        <Input
          label="Actual Delay"
          value={actualDelay}
          onChange={(e) => setActualDelay(e.target.value)}
          placeholder={expectedDelay ? `Expected was: ${expectedDelay}` : 'e.g., 2 weeks, None'}
          hint="What was the actual delay impact? Leave blank if none."
        />
      </div>
      <div className="flex justify-end gap-3 mt-6">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => onConfirm(mitigatedRisk, actualDelay || undefined)}>
          <CheckCircleIcon className="w-4 h-4 mr-2" />
          Close Threat
        </Button>
      </div>
    </Modal>
  );
}
