'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
// import { useRealtime } from '@/hooks/use-realtime';
import { Header } from '@/components/layout/header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { StatusBadge, PriorityBadge, RiskBadge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, isOverdue, getDaysUntil, getRelativeTime, buildWorkstreamOptions, getWorkstreamDisplayName } from '@/lib/utils';
import {
  ClipboardDocumentListIcon,
  ExclamationTriangleIcon,
  QuestionMarkCircleIcon,
  FlagIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  PlusIcon,
  FunnelIcon,
  UserIcon,
  ArrowPathIcon,
  BoltIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import type { Action, Threat, TechnicalQuery, Milestone, Workstream, User, Update } from '@/types/database';
import { MegaphoneIcon } from '@heroicons/react/24/outline';

type UpdateWithRelations = Update & {
  workstream?: Workstream;
  creator?: User;
};

interface DashboardStats {
  totalActions: number;
  completedActions: number;
  overdueActions: number;
  criticalActions: number;
  totalThreats: number;
  highRiskThreats: number;
  pendingQueries: number;
  upcomingMilestones: number;
}

export default function DashboardPage() {
  const { workstreams, setWorkstreams } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [selectedWorkstream, setSelectedWorkstream] = useState<string>('all');
  const [allActions, setAllActions] = useState<{ id: string; status: string; priority: string; due_date: string | null; workstream_id: string }[]>([]);
  const [allThreats, setAllThreats] = useState<{ id: string; current_risk: string; workstream_id: string }[]>([]);
  const [allQueries, setAllQueries] = useState<{ id: string; responded_at: string | null }[]>([]);
  const [allMilestones, setAllMilestones] = useState<{ id: string; target_date: string; status: string; workstream_id: string | null }[]>([]);
  const [myActions, setMyActions] = useState<(Action & { owner?: User; workstream?: Workstream })[]>([]);
  const [recentlyUpdated, setRecentlyUpdated] = useState<(Action & { owner?: User; workstream?: Workstream; last_change?: string })[]>([]);
  const [recentThreats, setRecentThreats] = useState<(Threat & { workstream?: Workstream })[]>([]);
  const [pendingQueries, setPendingQueries] = useState<(TechnicalQuery & { assignee?: User })[]>([]);
  const [upcomingMilestones, setUpcomingMilestones] = useState<(Milestone & { workstream?: Workstream })[]>([]);
  const [recentUpdates, setRecentUpdates] = useState<UpdateWithRelations[]>([]);

  // Workstream filter options with hierarchy
  const workstreamOptions = useMemo(() =>
    buildWorkstreamOptions(workstreams, {
      mapOption: (ws) => ({
        icon: <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ws.color }} />,
      }),
    }),
  [workstreams]);

  // Calculate stats based on selected workstream
  const stats = useMemo<DashboardStats | null>(() => {
    const now = new Date();
    const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const filteredActions = selectedWorkstream === 'all'
      ? allActions
      : allActions.filter(a => a.workstream_id === selectedWorkstream);

    const filteredThreats = selectedWorkstream === 'all'
      ? allThreats
      : allThreats.filter(t => t.workstream_id === selectedWorkstream);

    const filteredMilestones = selectedWorkstream === 'all'
      ? allMilestones
      : allMilestones.filter(m => m.workstream_id === selectedWorkstream);

    return {
      totalActions: filteredActions.length,
      completedActions: filteredActions.filter(a => a.status === 'complete').length,
      overdueActions: filteredActions.filter(a => a.due_date && new Date(a.due_date) < now && a.status !== 'complete' && a.status !== 'cancelled').length,
      criticalActions: filteredActions.filter(a => (a.priority === 'critical' || a.priority === 'high') && a.status !== 'complete' && a.status !== 'cancelled').length,
      totalThreats: filteredThreats.length,
      highRiskThreats: filteredThreats.filter(t => t.current_risk === 'high').length,
      pendingQueries: allQueries.filter(q => !q.responded_at).length, // Queries aren't workstream-specific in the same way
      upcomingMilestones: filteredMilestones.filter(m => new Date(m.target_date) <= oneWeekFromNow && m.status === 'pending').length,
    };
  }, [allActions, allThreats, allQueries, allMilestones, selectedWorkstream]);

  // Filter displayed items by workstream
  const filteredMyActions = useMemo(() =>
    selectedWorkstream === 'all'
      ? myActions
      : myActions.filter(a => a.workstream_id === selectedWorkstream),
    [myActions, selectedWorkstream]
  );

  const filteredRecentlyUpdated = useMemo(() =>
    selectedWorkstream === 'all'
      ? recentlyUpdated
      : recentlyUpdated.filter(a => a.workstream_id === selectedWorkstream),
    [recentlyUpdated, selectedWorkstream]
  );

  const filteredRecentThreats = useMemo(() =>
    selectedWorkstream === 'all'
      ? recentThreats
      : recentThreats.filter(t => t.workstream_id === selectedWorkstream),
    [recentThreats, selectedWorkstream]
  );

  const filteredUpcomingMilestones = useMemo(() =>
    selectedWorkstream === 'all'
      ? upcomingMilestones
      : upcomingMilestones.filter(m => m.workstream_id === selectedWorkstream),
    [upcomingMilestones, selectedWorkstream]
  );

  // Direct data fetch with timeout protection
  useEffect(() => {
    let mounted = true;
    let failsafeTimeoutId: NodeJS.Timeout;

    const fetchAllData = async () => {
      const supabase = createClient();

      try {
        // Get current user for user-specific queries (with timeout)
        let userId: string | null = null;

        try {
          const authResult = await Promise.race([
            supabase.auth.getUser(),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
          ]);

          if (authResult?.data?.user) {
            const profileResult = await Promise.race([
              supabase.from('users').select('*').eq('id', authResult.data.user.id).single(),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
            ]);
            if (profileResult?.data && mounted) {
              setCurrentUser(profileResult.data as User);
              userId = profileResult.data.id;
            }
          }
        } catch (authErr) {
          console.error('[Dashboard] Auth error:', authErr);
        }

        // Fetch all dashboard data with timeout
        const dataResult = await Promise.race([
          Promise.all([
            supabase.from('actions').select('id, status, priority, due_date'),
            supabase.from('threats').select('id, current_risk'),
            supabase.from('technical_queries').select('id, responded_at'),
            supabase.from('milestones').select('id, target_date, status'),
            supabase.from('workstreams').select('*').order('order_index'),
          ]),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
        ]);

        if (!mounted) return;

        // Handle timeout case
        if (!dataResult) {
          console.warn('[Dashboard] Data fetch timed out');
          return;
        }

        const [actionsRes, threatsRes, queriesRes, milestonesRes, workstreamsRes] = dataResult;

        // Set workstreams in store
        if (workstreamsRes.data) {
          setWorkstreams(workstreamsRes.data as Workstream[]);
        }

        const actionsData = actionsRes.data || [];
        const threatsData = threatsRes.data || [];
        const queriesData = queriesRes.data || [];
        const milestonesData = milestonesRes.data || [];

        // Store raw data for filtering
        setAllActions(actionsData as { id: string; status: string; priority: string; due_date: string | null; workstream_id: string }[]);
        setAllThreats(threatsData as { id: string; current_risk: string; workstream_id: string }[]);
        setAllQueries(queriesData as { id: string; responded_at: string | null }[]);
        setAllMilestones(milestonesData as { id: string; target_date: string; status: string; workstream_id: string | null }[]);

        const now = new Date();
        const actionSelect = `*, owner:users!actions_owner_id_fkey(id, full_name, avatar_url), workstream:workstreams(id, name, color, parent_id)`;

        // Fetch detailed data in parallel with timeout
        const detailResult = await Promise.race([
          Promise.all([
            // My Actions - assigned to current user
            userId
              ? supabase
                  .from('actions')
                  .select(actionSelect)
                  .eq('owner_id', userId)
                  .in('status', ['pending', 'in_progress', 'on_hold'])
                  .order('updated_at', { ascending: false })
                  .limit(5)
                  .then(r => r.data)
              : Promise.resolve([]),
            // Recently Updated Actions (including completed in last 7 days)
            supabase
              .from('actions')
              .select(actionSelect)
              .or(`status.in.(pending,in_progress,on_hold),and(status.eq.complete,completed_at.gte.${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()})`)
              .order('updated_at', { ascending: false })
              .limit(5)
              .then(r => r.data),
            // Active Threats (status is 'open' or null for open threats)
            supabase
              .from('threats')
              .select(`*, workstream:workstreams(id, name, color, parent_id)`)
              .neq('status', 'closed')
              .order('updated_at', { ascending: false })
              .limit(5)
              .then(r => r.data),
            // Upcoming Milestones
            supabase
              .from('milestones')
              .select(`*, workstream:workstreams(id, name, color, parent_id)`)
              .eq('status', 'pending')
              .gte('target_date', now.toISOString())
              .order('target_date', { ascending: true })
              .limit(5)
              .then(r => r.data),
            // Recent Updates (gracefully handle if table doesn't exist yet)
            supabase
              .from('updates')
              .select(`*, workstream:workstreams(id, name, color, parent_id), creator:users!updates_created_by_fkey(id, full_name, avatar_url)`)
              .order('is_pinned', { ascending: false })
              .order('posted_at', { ascending: false })
              .limit(5)
              .then(r => r.error ? [] : (r.data || [])),
          ]),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
        ]);

        if (!mounted) return;

        if (detailResult) {
          const [myActionsData, recentlyUpdatedData, recentThreatsData, upcomingMilestonesData, recentUpdatesData] = detailResult;
          if (myActionsData) {
            setMyActions(myActionsData as unknown as (Action & { owner?: User; workstream?: Workstream })[]);
          }
          if (recentlyUpdatedData) {
            // Fetch latest audit entry for each action to show what changed
            const actionIds = (recentlyUpdatedData as { id: string }[]).map(a => a.id);
            if (actionIds.length > 0) {
              const { data: auditData } = await supabase
                .from('action_audit')
                .select('action_id, change_type, old_value, new_value, created_at')
                .in('action_id', actionIds)
                .order('created_at', { ascending: false });

              // Get the most recent audit entry per action
              const latestAuditByAction = new Map<string, { change_type: string; old_value?: string; new_value?: string }>();
              if (auditData) {
                for (const entry of auditData) {
                  if (!latestAuditByAction.has(entry.action_id)) {
                    latestAuditByAction.set(entry.action_id, entry);
                  }
                }
              }

              // Attach change description to actions
              const actionsWithChanges = (recentlyUpdatedData as (Action & { owner?: User; workstream?: Workstream })[]).map(action => {
                const audit = latestAuditByAction.get(action.id);
                let last_change = '';
                if (audit) {
                  switch (audit.change_type) {
                    case 'status_changed':
                      last_change = audit.new_value === 'complete' ? 'Marked complete' : `Status → ${audit.new_value?.replace('_', ' ')}`;
                      break;
                    case 'owner_changed':
                      last_change = 'Owner changed';
                      break;
                    case 'priority_changed':
                      last_change = `Priority → ${audit.new_value}`;
                      break;
                    case 'due_date_changed':
                      last_change = 'Due date changed';
                      break;
                    case 'update_added':
                      last_change = 'Update posted';
                      break;
                    case 'created':
                      last_change = 'Created';
                      break;
                    default:
                      last_change = 'Updated';
                  }
                }
                return { ...action, last_change };
              });
              setRecentlyUpdated(actionsWithChanges);
            } else {
              setRecentlyUpdated([]);
            }
          }
          if (recentThreatsData) {
            setRecentThreats(recentThreatsData as unknown as (Threat & { workstream?: Workstream })[]);
          }
          if (upcomingMilestonesData) {
            setUpcomingMilestones(upcomingMilestonesData as unknown as (Milestone & { workstream?: Workstream })[]);
          }
          if (recentUpdatesData) {
            setRecentUpdates(recentUpdatesData as unknown as UpdateWithRelations[]);
          }
        }

        // Fetch pending queries if we have a user
        if (userId && mounted) {
          const pendingQueriesResult = await Promise.race([
            supabase
              .from('technical_queries')
              .select(`*, submitter:users!technical_queries_submitted_by_fkey(id, full_name, avatar_url)`)
              .eq('assigned_to', userId)
              .is('responded_at', null)
              .order('created_at', { ascending: false })
              .limit(5),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
          ]);

          if (pendingQueriesResult?.data && mounted) {
            setPendingQueries(pendingQueriesResult.data as unknown as (TechnicalQuery & { assignee?: User })[]);
          }
        }

      } catch (error) {
        console.error('[Dashboard] Error:', error);
        toast.error('Failed to load dashboard data');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    // FAILSAFE: Always stop loading after 15 seconds no matter what
    failsafeTimeoutId = setTimeout(() => {
      if (mounted) {
        console.warn('[Dashboard] Failsafe timeout triggered - forcing loading to stop');
        setLoading(false);
      }
    }, 15000);

    fetchAllData();

    return () => {
      mounted = false;
      clearTimeout(failsafeTimeoutId);
    };
  }, [setWorkstreams]);

  // Real-time updates disabled temporarily for stability
  // TODO: Re-enable with proper memoization

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header
        title="Crisis Dashboard"
        subtitle="Real-time overview of all workstreams"
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <FunnelIcon className="w-4 h-4 text-gray-400" />
              <Select
                options={workstreamOptions}
                value={selectedWorkstream}
                onChange={setSelectedWorkstream}
                className="w-48"
              />
            </div>
          </div>
        }
      />

      <div className="p-6 space-y-6">
        {/* Stats Grid - Clickable Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href={`/actions?priority=critical,high${selectedWorkstream !== 'all' ? `&workstream=${selectedWorkstream}` : ''}`}>
            <Card className="bg-gradient-to-br from-red-500 to-red-600 text-white border-0 cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-red-100 text-sm font-medium">High Priority Actions</p>
                    <p className="text-3xl font-bold mt-1">{stats?.criticalActions || 0}</p>
                  </div>
                  <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                    <ExclamationCircleIcon className="w-6 h-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href={`/actions?status=overdue${selectedWorkstream !== 'all' ? `&workstream=${selectedWorkstream}` : ''}`}>
            <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white border-0 cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-orange-100 text-sm font-medium">Overdue Actions</p>
                    <p className="text-3xl font-bold mt-1">{stats?.overdueActions || 0}</p>
                  </div>
                  <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                    <ClockIcon className="w-6 h-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href={`/threats?risk=high${selectedWorkstream !== 'all' ? `&workstream=${selectedWorkstream}` : ''}`}>
            <Card className="bg-gradient-to-br from-amber-500 to-amber-600 text-white border-0 cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-amber-100 text-sm font-medium">High Risk Threats</p>
                    <p className="text-3xl font-bold mt-1">{stats?.highRiskThreats || 0}</p>
                  </div>
                  <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                    <ExclamationTriangleIcon className="w-6 h-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href={`/actions?status=complete${selectedWorkstream !== 'all' ? `&workstream=${selectedWorkstream}` : ''}`}>
            <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white border-0 cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-green-100 text-sm font-medium">Completed Actions</p>
                    <p className="text-3xl font-bold mt-1">
                      {stats?.completedActions || 0}/{stats?.totalActions || 0}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                    <CheckCircleIcon className="w-6 h-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-3">
          <Link href="/actions/new">
            <Button>
              <PlusIcon className="w-4 h-4 mr-2" />
              New Action
            </Button>
          </Link>
          <Link href="/threats/new">
            <Button variant="secondary">
              <PlusIcon className="w-4 h-4 mr-2" />
              Log Threat
            </Button>
          </Link>
          <Link href="/queries/new">
            <Button variant="secondary">
              <PlusIcon className="w-4 h-4 mr-2" />
              Submit Query
            </Button>
          </Link>
          <Link href="/decisions/new">
            <Button variant="secondary">
              <PlusIcon className="w-4 h-4 mr-2" />
              Record Decision
            </Button>
          </Link>
          <Link href="/updates/new">
            <Button variant="secondary">
              <MegaphoneIcon className="w-4 h-4 mr-2" />
              Post Update
            </Button>
          </Link>
        </div>

        {/* Updates Ticker */}
        {recentUpdates.length > 0 && (
          <Card className="bg-gradient-to-r from-red-50 to-orange-50 border-red-100">
            <CardHeader
              actions={
                <Link href="/updates">
                  <Button variant="ghost" size="sm">View All Updates</Button>
                </Link>
              }
            >
              <CardTitle className="flex items-center gap-2">
                <MegaphoneIcon className="w-5 h-5 text-red-500" />
                Recent Updates
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentUpdates.slice(0, 3).map((update) => (
                  <div
                    key={update.id}
                    className="flex items-start gap-3 p-3 bg-white rounded-lg border border-red-100"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">{update.content}</p>
                      <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                        {update.creator && (
                          <>
                            <Avatar src={update.creator.avatar_url} name={update.creator.full_name} size="xs" />
                            <span>{update.creator.full_name}</span>
                            <span className="text-gray-300">•</span>
                          </>
                        )}
                        <span>{getRelativeTime(update.posted_at)}</span>
                        {update.workstream && (
                          <>
                            <span className="text-gray-300">•</span>
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium"
                              style={{
                                backgroundColor: `${update.workstream.color}20`,
                                color: update.workstream.color,
                              }}
                            >
                              {getWorkstreamDisplayName(update.workstream, workstreams)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recently Updated Actions */}
          <Card>
            <CardHeader
              actions={
                <Link href="/actions">
                  <Button variant="ghost" size="sm">View All</Button>
                </Link>
              }
            >
              <CardTitle className="flex items-center gap-2">
                <ArrowPathIcon className="w-5 h-5 text-gray-400" />
                Recently Updated Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredRecentlyUpdated.length === 0 ? (
                <EmptyState
                  icon={<ArrowPathIcon className="w-6 h-6" />}
                  title="No recent activity"
                  description="No actions have been updated recently."
                />
              ) : (
                <div className="space-y-3">
                  {filteredRecentlyUpdated.map((action) => (
                    <Link
                      key={action.id}
                      href={`/actions/${action.id}`}
                      className="block p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-medium text-gray-900 truncate">{action.title}</h4>
                            <PriorityBadge priority={action.priority} />
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            {action.workstream && (
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                                style={{
                                  backgroundColor: `${action.workstream.color}20`,
                                  color: action.workstream.color,
                                }}
                              >
                                {getWorkstreamDisplayName(action.workstream, workstreams)}
                              </span>
                            )}
                            <StatusBadge status={action.status} />
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {action.owner && (
                            <Avatar src={action.owner.avatar_url} name={action.owner.full_name} size="xs" />
                          )}
                          <span className="text-xs text-gray-500">
                            {action.last_change && <span className="font-medium text-gray-600">{action.last_change}</span>}
                            {action.last_change && ' · '}
                            {getRelativeTime(action.updated_at)}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* My Actions */}
          <Card>
            <CardHeader
              actions={
                <Link href={`/actions?owner=${currentUser?.id || ''}`}>
                  <Button variant="ghost" size="sm">View All</Button>
                </Link>
              }
            >
              <CardTitle className="flex items-center gap-2">
                <UserIcon className="w-5 h-5 text-gray-400" />
                Actions Assigned to Me
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!currentUser ? (
                <EmptyState
                  icon={<UserIcon className="w-6 h-6" />}
                  title="Sign in to see your actions"
                  description="Your assigned actions will appear here."
                />
              ) : filteredMyActions.length === 0 ? (
                <EmptyState
                  icon={<UserIcon className="w-6 h-6" />}
                  title="No actions assigned"
                  description="You have no active actions assigned to you."
                />
              ) : (
                <div className="space-y-3">
                  {filteredMyActions.map((action) => (
                    <Link
                      key={action.id}
                      href={`/actions/${action.id}`}
                      className="block p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-medium text-gray-900 truncate">{action.title}</h4>
                            <PriorityBadge priority={action.priority} />
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            {action.workstream && (
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                                style={{
                                  backgroundColor: `${action.workstream.color}20`,
                                  color: action.workstream.color,
                                }}
                              >
                                {getWorkstreamDisplayName(action.workstream, workstreams)}
                              </span>
                            )}
                            <StatusBadge status={action.status} />
                          </div>
                        </div>
                        {action.due_date && (
                          <span className={`text-xs ${isOverdue(action.due_date) ? 'text-red-600 font-medium' : getDaysUntil(action.due_date) === 0 ? 'text-amber-600 font-medium' : 'text-gray-500'}`}>
                            {getDaysUntil(action.due_date) === 0 ? 'Due today' : isOverdue(action.due_date) ? 'Overdue' : `Due ${getDaysUntil(action.due_date)}d`}
                          </span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Active Threats */}
          <Card>
            <CardHeader
              actions={
                <Link href="/threats">
                  <Button variant="ghost" size="sm">View All</Button>
                </Link>
              }
            >
              <CardTitle className="flex items-center gap-2">
                <ExclamationTriangleIcon className="w-5 h-5 text-gray-400" />
                Active Threats
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredRecentThreats.length === 0 ? (
                <EmptyState
                  icon={<ExclamationTriangleIcon className="w-6 h-6" />}
                  title="No active threats"
                  description="No open threats identified."
                  action={{
                    label: 'Log Threat',
                    onClick: () => window.location.href = '/threats/new',
                  }}
                />
              ) : (
                <div className="space-y-3">
                  {filteredRecentThreats.map((threat) => (
                    <Link
                      key={threat.id}
                      href={`/threats/${threat.id}`}
                      className="block p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium text-gray-900 truncate">{threat.title}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            {threat.workstream && (
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                                style={{
                                  backgroundColor: `${threat.workstream.color}20`,
                                  color: threat.workstream.color,
                                }}
                              >
                                {getWorkstreamDisplayName(threat.workstream, workstreams)}
                              </span>
                            )}
                            <span className="text-xs text-gray-500">
                              {getRelativeTime(threat.updated_at)}
                            </span>
                          </div>
                        </div>
                        <RiskBadge risk={threat.current_risk} />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pending Queries */}
          {pendingQueries.length > 0 && (
            <Card>
              <CardHeader
                actions={
                  <Link href="/queries">
                    <Button variant="ghost" size="sm">View All</Button>
                  </Link>
                }
              >
                <CardTitle className="flex items-center gap-2">
                  <QuestionMarkCircleIcon className="w-5 h-5 text-gray-400" />
                  Queries Awaiting Your Response
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {pendingQueries.map((query) => (
                    <Link
                      key={query.id}
                      href={`/queries/${query.id}`}
                      className="block p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium text-gray-900 truncate">{query.title}</h4>
                          <p className="text-xs text-gray-500 mt-1">
                            From: {(query as unknown as { submitter?: User }).submitter?.full_name || 'Unknown'}
                          </p>
                        </div>
                        <PriorityBadge priority={query.priority} />
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Upcoming Milestones */}
          <Card>
            <CardHeader
              actions={
                <Link href="/milestones">
                  <Button variant="ghost" size="sm">View All</Button>
                </Link>
              }
            >
              <CardTitle className="flex items-center gap-2">
                <FlagIcon className="w-5 h-5 text-gray-400" />
                Upcoming Milestones
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredUpcomingMilestones.length === 0 ? (
                <EmptyState
                  icon={<FlagIcon className="w-6 h-6" />}
                  title="No upcoming milestones"
                  description="No milestones scheduled for the next week."
                  action={{
                    label: 'Create Milestone',
                    onClick: () => window.location.href = '/milestones/new',
                  }}
                />
              ) : (
                <div className="space-y-3">
                  {filteredUpcomingMilestones.map((milestone) => (
                    <Link
                      key={milestone.id}
                      href={`/milestones/${milestone.id}`}
                      className="block p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium text-gray-900 truncate">{milestone.title}</h4>
                          {milestone.workstream && (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mt-1"
                              style={{
                                backgroundColor: `${milestone.workstream.color}20`,
                                color: milestone.workstream.color,
                              }}
                            >
                              {getWorkstreamDisplayName(milestone.workstream, workstreams)}
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-gray-900">
                            {formatDate(milestone.target_date, { month: 'short', day: 'numeric' })}
                          </p>
                          <p className="text-xs text-gray-500">
                            {getDaysUntil(milestone.target_date)}d remaining
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

