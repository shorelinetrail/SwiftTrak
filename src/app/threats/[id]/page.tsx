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
import { LoadingSpinner } from '@/components/ui/loading';
import { formatDate, buildWorkstreamOptions, getWorkstreamDisplayName, cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
  PencilIcon,
  TrashIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  ClockIcon,
  LinkIcon,
  PlusIcon,
  XMarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { ChatBubbleLeftIcon } from '@heroicons/react/24/outline';
import { Avatar } from '@/components/ui/avatar';
import { StatusBadge } from '@/components/ui/badge';
import { getRelativeTime } from '@/lib/utils';
import type { Threat, Workstream, User, RiskLevel, ThreatAudit, ThreatUpdate, Action, ThreatActionLink } from '@/types/database';

type ThreatWithRelations = Threat & {
  workstream?: Workstream;
  creator?: User;
};

type LinkedAction = Action & {
  workstream?: Workstream;
  owner?: User;
};

function formatAuditEntry(entry: ThreatAudit): string {
  switch (entry.change_type) {
    case 'created':
      return 'created this threat';
    case 'status_changed':
      return `changed status from ${entry.old_value} to ${entry.new_value}`;
    case 'risk_changed':
      return `changed current risk from ${entry.old_value} to ${entry.new_value}`;
    case 'title_changed':
      return `changed title from "${entry.old_value}" to "${entry.new_value}"`;
    case 'mitigated_risk_changed':
      return `set mitigated risk to ${entry.new_value}`;
    case 'solution_added':
      return 'added a solution';
    default:
      return `${entry.change_type.replace(/_/g, ' ')}`;
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
  const [updates, setUpdates] = useState<(ThreatUpdate & { user?: User })[]>([]);
  const [newUpdateContent, setNewUpdateContent] = useState('');
  const [addingUpdate, setAddingUpdate] = useState(false);
  const [linkedActions, setLinkedActions] = useState<LinkedAction[]>([]);
  const [linkActionModalOpen, setLinkActionModalOpen] = useState(false);
  const [createActionModalOpen, setCreateActionModalOpen] = useState(false);
  const [availableActions, setAvailableActions] = useState<LinkedAction[]>([]);
  const [selectedActionId, setSelectedActionId] = useState('');
  const [actionSearchQuery, setActionSearchQuery] = useState('');

  // Navigation through threats
  const [allThreatIds, setAllThreatIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const fetchThreat = useCallback(async () => {
    const supabase = createClient();

    try {
      // Add timeout to prevent hanging
      const [threatResult, auditResult, updatesResult, linksResult] = await Promise.all([
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
        Promise.race([
          supabase
            .from('threat_updates')
            .select(`
              *,
              user:users(id, full_name, avatar_url)
            `)
            .eq('threat_id', threatId)
            .order('created_at', { ascending: true }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
        ]),
        Promise.race([
          supabase
            .from('threat_action_links')
            .select(`
              action:actions(
                id, title, status, priority, due_date,
                workstream:workstreams(id, name, color),
                owner:users!actions_owner_id_fkey(id, full_name)
              )
            `)
            .eq('threat_id', threatId),
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

      if (updatesResult?.data) {
        setUpdates(updatesResult.data as unknown as (ThreatUpdate & { user?: User })[]);
      }

      if (linksResult?.data) {
        const actions = linksResult.data
          .map((link: { action: LinkedAction }) => link.action)
          .filter((action: LinkedAction | null): action is LinkedAction => action !== null);
        setLinkedActions(actions);
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

  // Fetch all threat IDs for navigation
  useEffect(() => {
    const fetchThreatIds = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('threats')
        .select('id')
        .order('created_at', { ascending: false });

      if (data) {
        const ids = data.map(t => t.id);
        setAllThreatIds(ids);
        setCurrentIndex(ids.indexOf(threatId));
      }
    };
    fetchThreatIds();
  }, [threatId]);

  const goToPrevious = () => {
    if (currentIndex > 0) {
      router.push(`/threats/${allThreatIds[currentIndex - 1]}`);
    }
  };

  const goToNext = () => {
    if (currentIndex < allThreatIds.length - 1) {
      router.push(`/threats/${allThreatIds[currentIndex + 1]}`);
    }
  };

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

  const handleAddUpdate = async () => {
    if (!newUpdateContent.trim()) return;

    setAddingUpdate(true);
    try {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();

      if (!authUser) {
        toast.error('You must be logged in to add updates');
        return;
      }

      const { error } = await supabase.from('threat_updates').insert({
        threat_id: threatId,
        user_id: authUser.id,
        content: newUpdateContent.trim(),
      });

      if (error) throw error;

      toast.success('Update added');
      setNewUpdateContent('');
      fetchThreat();
    } catch (error) {
      console.error('Error adding update:', error);
      toast.error('Failed to add update');
    } finally {
      setAddingUpdate(false);
    }
  };

  const fetchAvailableActions = async () => {
    const supabase = createClient();

    // Fetch all actions not already linked to this threat
    const { data, error } = await supabase
      .from('actions')
      .select(`
        id, title, status, priority, due_date,
        workstream:workstreams(id, name, color),
        owner:users!actions_owner_id_fkey(id, full_name)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching actions:', error);
      return;
    }

    // Filter out already linked actions
    const linkedIds = linkedActions.map(a => a.id);
    const available = (data || []).filter(a => !linkedIds.includes(a.id));
    setAvailableActions(available as unknown as LinkedAction[]);
  };

  const handleLinkAction = async () => {
    if (!selectedActionId) return;

    try {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();

      const { error } = await supabase.from('threat_action_links').insert({
        threat_id: threatId,
        action_id: selectedActionId,
        created_by: authUser?.id,
      });

      if (error) throw error;

      toast.success('Action linked');
      setLinkActionModalOpen(false);
      setSelectedActionId('');
      setActionSearchQuery('');
      fetchThreat();
    } catch (error) {
      console.error('Error linking action:', error);
      toast.error('Failed to link action');
    }
  };

  const handleUnlinkAction = async (actionId: string) => {
    try {
      const supabase = createClient();

      const { error } = await supabase
        .from('threat_action_links')
        .delete()
        .eq('threat_id', threatId)
        .eq('action_id', actionId);

      if (error) throw error;

      toast.success('Action unlinked');
      fetchThreat();
    } catch (error) {
      console.error('Error unlinking action:', error);
      toast.error('Failed to unlink action');
    }
  };

  const openLinkActionModal = () => {
    fetchAvailableActions();
    setLinkActionModalOpen(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header
          breadcrumbs={[
            { label: 'Threats', href: '/threats' },
            { label: 'Loading...' },
          ]}
        />
        <div className="p-6 flex items-center justify-center h-64">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
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
    ? buildWorkstreamOptions(workstreams, {
        includeAll: false,
        excludeParentsWithChildren: true,
        mapOption: (ws) => ({
          icon: <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ws.color }} />,
        }),
      })
    : threat?.workstream
      ? [{ value: threat.workstream.id, label: threat.workstream.name }]
      : [];

  return (
    <div className="min-h-screen">
      <Header
        breadcrumbs={[
          { label: 'Threats', href: '/threats' },
          { label: threat.title },
        ]}
      />

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Threat Info */}
          <Card>
            <CardContent className="pt-6">
              {/* Title and Actions Row */}
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  {threat.display_id && (
                    <span className="text-sm font-mono text-gray-500 mb-1 block">{threat.display_id}</span>
                  )}
                  <h1 className="text-2xl font-bold text-gray-900">{threat.title}</h1>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Navigation */}
                  {allThreatIds.length > 1 && (
                    <div className="flex items-center gap-1 mr-2">
                      <button
                        onClick={goToPrevious}
                        disabled={currentIndex <= 0}
                        className={cn(
                          'p-1.5 rounded-lg transition-colors',
                          currentIndex > 0
                            ? 'text-gray-600 hover:bg-gray-100'
                            : 'text-gray-300 cursor-not-allowed'
                        )}
                        title="Previous threat"
                      >
                        <ChevronLeftIcon className="w-5 h-5" />
                      </button>
                      <span className="text-xs text-gray-500 min-w-[4rem] text-center">
                        {currentIndex + 1} / {allThreatIds.length}
                      </span>
                      <button
                        onClick={goToNext}
                        disabled={currentIndex >= allThreatIds.length - 1}
                        className={cn(
                          'p-1.5 rounded-lg transition-colors',
                          currentIndex < allThreatIds.length - 1
                            ? 'text-gray-600 hover:bg-gray-100'
                            : 'text-gray-300 cursor-not-allowed'
                        )}
                        title="Next threat"
                      >
                        <ChevronRightIcon className="w-5 h-5" />
                      </button>
                    </div>
                  )}
                  {!permissionLoading && canEdit && threat.status === 'open' && (
                    <Button variant="secondary" size="sm" onClick={() => setCloseModalOpen(true)}>
                      <CheckCircleIcon className="w-4 h-4 mr-2" />
                      Close
                    </Button>
                  )}
                  {!permissionLoading && canEdit && threat.status === 'closed' && (
                    <Button variant="secondary" size="sm" onClick={handleReopenThreat}>
                      <ArrowPathIcon className="w-4 h-4 mr-2" />
                      Reopen
                    </Button>
                  )}
                  {!permissionLoading && canEdit && (
                    <Button variant="outline" size="sm" onClick={() => setEditModalOpen(true)}>
                      <PencilIcon className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                  )}
                  {!permissionLoading && canAdmin && (
                    <Button variant="danger" size="sm" onClick={() => setDeleteModalOpen(true)}>
                      <TrashIcon className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Status Badges Row */}
              <div className="flex items-center flex-wrap gap-2 mb-6">
                {threat.status === 'closed' ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Closed
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                    Open
                  </span>
                )}
                <RiskBadge risk={threat.current_risk} />
                {threat.workstream && (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{
                      backgroundColor: `${threat.workstream.color}20`,
                      color: threat.workstream.color,
                    }}
                  >
                    {getWorkstreamDisplayName(threat.workstream, workstreams)}
                  </span>
                )}
              </div>

              {/* Description */}
              {threat.description && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Description</h3>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{threat.description}</p>
                </div>
              )}

              {/* Solution */}
              {threat.solution && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                  <h4 className="text-sm font-medium text-green-800 mb-1">Solution</h4>
                  <p className="text-sm text-green-700 whitespace-pre-wrap">{threat.solution}</p>
                </div>
              )}

              {/* Risk Overview */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Unmitigated</p>
                  <RiskBadge risk={threat.unmitigated_risk} />
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Current</p>
                  {canEdit && threat.status === 'open' ? (
                    <Select
                      options={riskOptions}
                      value={threat.current_risk}
                      onChange={(value) => handleUpdateCurrentRisk(value as RiskLevel)}
                      className="w-full text-sm"
                    />
                  ) : (
                    <RiskBadge risk={threat.current_risk} />
                  )}
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Mitigated</p>
                  {threat.mitigated_risk ? (
                    <RiskBadge risk={threat.mitigated_risk} />
                  ) : (
                    <span className="text-gray-400 text-xs">TBD</span>
                  )}
                </div>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                {threat.expected_delay && (
                  <div>
                    <span className="text-gray-500">Potential Delay</span>
                    <p className="mt-1 font-medium text-gray-900">{threat.expected_delay}</p>
                  </div>
                )}
                {threat.status === 'closed' && threat.actual_delay && (
                  <div>
                    <span className="text-gray-500">Actual Delay</span>
                    <p className="mt-1 font-medium text-gray-900">{threat.actual_delay}</p>
                  </div>
                )}
                <div>
                  <span className="text-gray-500">Created</span>
                  <p className="mt-1 font-medium text-gray-900">
                    {formatDate(threat.created_at)} by {threat.creator?.full_name}
                  </p>
                </div>
              </div>

              {/* Proposed Mitigation */}
              {threat.proposed_mitigation && (
                <div className="mt-6 pt-4 border-t border-gray-100">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Proposed Mitigation</h3>
                  <p className="text-sm text-gray-700">{threat.proposed_mitigation}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Updates/Comments */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ChatBubbleLeftIcon className="w-5 h-5 text-gray-400" />
                Updates ({updates.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Updates list */}
              {updates.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No updates yet</p>
              ) : (
                <div className="space-y-4 mb-4">
                  {updates.map((update) => (
                    <div key={update.id} className="flex gap-3 p-3 bg-gray-50 rounded-lg">
                      <Avatar
                        src={update.user?.avatar_url}
                        name={update.user?.full_name || 'Unknown'}
                        size="sm"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">
                            {update.user?.full_name || 'Unknown'}
                          </span>
                          <span className="text-xs text-gray-500">
                            {getRelativeTime(update.created_at)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{update.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add update form */}
              {canEdit && (
                <div className="pt-4 border-t border-gray-200">
                  <Textarea
                    placeholder="Add an update..."
                    value={newUpdateContent}
                    onChange={(e) => setNewUpdateContent(e.target.value)}
                    rows={3}
                  />
                  <div className="flex justify-end mt-2">
                    <Button
                      size="sm"
                      onClick={handleAddUpdate}
                      disabled={!newUpdateContent.trim() || addingUpdate}
                      loading={addingUpdate}
                    >
                      Post Update
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Linked Actions */}
          <Card>
            <CardHeader
              actions={
                canEdit && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={openLinkActionModal} title="Link existing action">
                      <LinkIcon className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setCreateActionModalOpen(true)} title="Create new action">
                      <PlusIcon className="w-4 h-4" />
                    </Button>
                  </div>
                )
              }
            >
              <CardTitle className="flex items-center gap-2">
                <LinkIcon className="w-5 h-5 text-gray-400" />
                Linked Actions ({linkedActions.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {linkedActions.length === 0 ? (
                <p className="text-center text-gray-500 py-4 text-sm">No linked actions</p>
              ) : (
                <div className="space-y-2">
                  {linkedActions.map((action) => (
                    <div
                      key={action.id}
                      className="flex items-start justify-between gap-2 p-2 bg-gray-50 rounded-lg group"
                    >
                      <a
                        href={`/actions/${action.id}`}
                        className="flex-1 min-w-0 hover:text-red-600"
                      >
                        <p className="text-sm font-medium text-gray-900 truncate group-hover:text-red-600">
                          {action.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <StatusBadge status={action.status} />
                          {action.workstream && (
                            <span
                              className="text-xs px-1.5 py-0.5 rounded"
                              style={{
                                backgroundColor: `${action.workstream.color}20`,
                                color: action.workstream.color,
                              }}
                            >
                              {action.workstream.name}
                            </span>
                          )}
                        </div>
                      </a>
                      {canEdit && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            handleUnlinkAction(action.id);
                          }}
                          className="p-1 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Unlink action"
                        >
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Audit Trail */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClockIcon className="w-5 h-5 text-gray-400" />
                Audit Trail
              </CardTitle>
            </CardHeader>
            <CardContent>
              {auditLog.length === 0 ? (
                <p className="text-center text-gray-500 py-4">No history</p>
              ) : (
                <div className="space-y-4">
                  {auditLog.map((entry) => (
                    <div key={entry.id} className="relative pl-4 border-l-2 border-gray-200">
                      <div className="absolute -left-1.5 top-0 w-3 h-3 rounded-full bg-gray-300" />
                      <p className="text-sm text-gray-900">
                        <span className="font-medium">{entry.user?.full_name || 'System'}</span>
                        {' '}
                        {formatAuditEntry(entry)}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {getRelativeTime(entry.change_type === 'created' ? threat.created_at : entry.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
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

      {/* Link Action Modal */}
      <Modal
        open={linkActionModalOpen}
        onClose={() => {
          setLinkActionModalOpen(false);
          setSelectedActionId('');
          setActionSearchQuery('');
        }}
        title="Link Existing Action"
      >
        <div className="space-y-4">
          <Input
            placeholder="Search actions..."
            value={actionSearchQuery}
            onChange={(e) => setActionSearchQuery(e.target.value)}
          />
          <div className="max-h-64 overflow-y-auto space-y-2">
            {availableActions
              .filter(a =>
                a.title.toLowerCase().includes(actionSearchQuery.toLowerCase())
              )
              .map((action) => (
                <div
                  key={action.id}
                  onClick={() => setSelectedActionId(action.id)}
                  className={`p-3 rounded-lg cursor-pointer border-2 transition-colors ${
                    selectedActionId === action.id
                      ? 'border-red-500 bg-red-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className="font-medium text-gray-900">{action.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <StatusBadge status={action.status} />
                    {action.workstream && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: `${action.workstream.color}20`,
                          color: action.workstream.color,
                        }}
                      >
                        {action.workstream.name}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            {availableActions.filter(a =>
              a.title.toLowerCase().includes(actionSearchQuery.toLowerCase())
            ).length === 0 && (
              <p className="text-center text-gray-500 py-4">No actions found</p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => setLinkActionModalOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleLinkAction} disabled={!selectedActionId}>
            <LinkIcon className="w-4 h-4 mr-2" />
            Link Action
          </Button>
        </div>
      </Modal>

      {/* Create Action Modal */}
      <CreateActionFromThreatModal
        open={createActionModalOpen}
        onClose={() => setCreateActionModalOpen(false)}
        threat={threat}
        workstreams={workstreams}
        onCreated={(actionId) => {
          setCreateActionModalOpen(false);
          fetchThreat();
          // Optionally navigate to the new action
          // router.push(`/actions/${actionId}`);
        }}
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

function CreateActionFromThreatModal({
  open,
  onClose,
  threat,
  workstreams,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  threat: ThreatWithRelations | null;
  workstreams: Workstream[];
  onCreated: (actionId: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [workstreamId, setWorkstreamId] = useState('');
  const [priority, setPriority] = useState<'critical' | 'high' | 'medium' | 'low'>('medium');
  const [dueDate, setDueDate] = useState('');
  const [creating, setCreating] = useState(false);

  // Pre-fill from threat when modal opens
  useEffect(() => {
    if (open && threat) {
      setTitle(`Mitigate: ${threat.title}`);
      setDescription(threat.proposed_mitigation || `Action to mitigate threat: ${threat.title}`);
      setWorkstreamId(threat.workstream_id || '');
      // Map risk to priority
      if (threat.current_risk === 'high') setPriority('high');
      else if (threat.current_risk === 'medium') setPriority('medium');
      else setPriority('low');
    }
  }, [open, threat]);

  const handleCreate = async () => {
    if (!title.trim() || !workstreamId) {
      toast.error('Please fill in all required fields');
      return;
    }

    setCreating(true);
    try {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();

      if (!authUser) {
        toast.error('You must be logged in');
        return;
      }

      // Create the action
      const { data: newAction, error: actionError } = await supabase
        .from('actions')
        .insert({
          title: title.trim(),
          description: description.trim() || null,
          workstream_id: workstreamId,
          owner_id: authUser.id,
          created_by: authUser.id,
          status: 'pending',
          priority,
          due_date: dueDate || null,
        })
        .select('id')
        .single();

      if (actionError) throw actionError;

      // Link the action to the threat
      const { error: linkError } = await supabase
        .from('threat_action_links')
        .insert({
          threat_id: threat?.id,
          action_id: newAction.id,
          created_by: authUser.id,
        });

      if (linkError) {
        console.error('Error linking action to threat:', linkError);
        // Don't fail the whole operation, just log it
      }

      toast.success('Action created and linked');

      // Reset form
      setTitle('');
      setDescription('');
      setWorkstreamId('');
      setPriority('medium');
      setDueDate('');

      onCreated(newAction.id);
    } catch (error) {
      console.error('Error creating action:', error);
      toast.error('Failed to create action');
    } finally {
      setCreating(false);
    }
  };

  const priorityOptions = [
    { value: 'critical', label: 'Critical' },
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' },
  ];

  const workstreamOptions = buildWorkstreamOptions(workstreams, {
    includeAll: false,
    excludeParentsWithChildren: true,
    mapOption: (ws) => ({
      icon: <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ws.color }} />,
    }),
  });

  return (
    <Modal open={open} onClose={onClose} title="Create Action from Threat" size="lg">
      <div className="space-y-4">
        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
        <Select
          label="Workstream"
          options={workstreamOptions}
          value={workstreamId}
          onChange={(value) => setWorkstreamId(value)}
        />
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Priority"
            options={priorityOptions}
            value={priority}
            onChange={(value) => setPriority(value as 'critical' | 'high' | 'medium' | 'low')}
          />
          <Input
            label="Due Date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleCreate} loading={creating} disabled={!title.trim() || !workstreamId}>
          <PlusIcon className="w-4 h-4 mr-2" />
          Create Action
        </Button>
      </div>
    </Modal>
  );
}
