'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
// import { useRealtime } from '@/hooks/use-realtime';
import { Header } from '@/components/layout/header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge, PriorityBadge, RiskBadge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { WorkstreamSelect } from '@/components/ui/workstream-select';
import { WorkstreamBadge } from '@/components/ui/workstream-badge';
import { ColorIndicator } from '@/components/ui/color-indicator';
import { StatsCard } from '@/components/ui/stats-card';
import { formatDate, isOverdue, getDaysUntil } from '@/lib/utils';
import {
  ClipboardDocumentListIcon,
  ExclamationTriangleIcon,
  QuestionMarkCircleIcon,
  FlagIcon,
  ArrowTrendingUpIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  PlusIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import type { Action, Threat, TechnicalQuery, Milestone, Workstream, User } from '@/types/database';

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
  const [recentActions, setRecentActions] = useState<(Action & { owner?: User; workstream?: Workstream })[]>([]);
  const [recentThreats, setRecentThreats] = useState<(Threat & { workstream?: Workstream })[]>([]);
  const [pendingQueries, setPendingQueries] = useState<(TechnicalQuery & { assignee?: User })[]>([]);
  const [upcomingMilestones, setUpcomingMilestones] = useState<(Milestone & { workstream?: Workstream })[]>([]);

  // Helper to get parent workstream for hierarchy display
  const getParentWorkstream = (parentId: string | null | undefined) => {
    if (!parentId) return null;
    return workstreams.find(ws => ws.id === parentId) || null;
  };

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
      criticalActions: filteredActions.filter(a => a.priority === 'critical' && a.status !== 'complete' && a.status !== 'cancelled').length,
      totalThreats: filteredThreats.length,
      highRiskThreats: filteredThreats.filter(t => t.current_risk === 'high').length,
      pendingQueries: allQueries.filter(q => !q.responded_at).length, // Queries aren't workstream-specific in the same way
      upcomingMilestones: filteredMilestones.filter(m => new Date(m.target_date) <= oneWeekFromNow && m.status === 'pending').length,
    };
  }, [allActions, allThreats, allQueries, allMilestones, selectedWorkstream]);

  // Filter displayed items by workstream
  const filteredRecentActions = useMemo(() =>
    selectedWorkstream === 'all'
      ? recentActions
      : recentActions.filter(a => a.workstream_id === selectedWorkstream),
    [recentActions, selectedWorkstream]
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

        // Fetch detailed data in parallel with timeout
        const detailResult = await Promise.race([
          Promise.all([
            supabase
              .from('actions')
              .select(`*, owner:users!actions_owner_id_fkey(id, full_name, avatar_url), workstream:workstreams(id, name, color)`)
              .in('status', ['pending', 'in_progress'])
              .order('updated_at', { ascending: false })
              .limit(5)
              .then(r => r.data),
            supabase
              .from('threats')
              .select(`*, workstream:workstreams(id, name, color)`)
              .in('current_risk', ['high', 'medium'])
              .order('updated_at', { ascending: false })
              .limit(5)
              .then(r => r.data),
            supabase
              .from('milestones')
              .select(`*, workstream:workstreams(id, name, color)`)
              .eq('status', 'pending')
              .gte('target_date', now.toISOString())
              .order('target_date', { ascending: true })
              .limit(5)
              .then(r => r.data),
          ]),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
        ]);

        if (!mounted) return;

        if (detailResult) {
          const [recentActionsData, recentThreatsData, upcomingMilestonesData] = detailResult;
          if (recentActionsData) {
            setRecentActions(recentActionsData as unknown as (Action & { owner?: User; workstream?: Workstream })[]);
          }
          if (recentThreatsData) {
            setRecentThreats(recentThreatsData as unknown as (Threat & { workstream?: Workstream })[]);
          }
          if (upcomingMilestonesData) {
            setUpcomingMilestones(upcomingMilestonesData as unknown as (Milestone & { workstream?: Workstream })[]);
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
              <WorkstreamSelect
                workstreams={workstreams}
                value={selectedWorkstream}
                onChange={setSelectedWorkstream}
                className="w-56"
              />
            </div>
            <Link href="/executive">
              <Button variant="outline" size="sm">
                Executive View
              </Button>
            </Link>
          </div>
        }
      />

      <div className="p-6 space-y-6">
        {/* Stats Grid - Clickable Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href={`/actions?priority=critical${selectedWorkstream !== 'all' ? `&workstream=${selectedWorkstream}` : ''}`}>
            <StatsCard
              title="Critical Actions"
              value={stats?.criticalActions || 0}
              icon={<ExclamationCircleIcon className="w-6 h-6" />}
              variant="gradient"
              color="red"
            />
          </Link>

          <Link href={`/actions?status=overdue${selectedWorkstream !== 'all' ? `&workstream=${selectedWorkstream}` : ''}`}>
            <StatsCard
              title="Overdue Actions"
              value={stats?.overdueActions || 0}
              icon={<ClockIcon className="w-6 h-6" />}
              variant="gradient"
              color="orange"
            />
          </Link>

          <Link href={`/threats?risk=high${selectedWorkstream !== 'all' ? `&workstream=${selectedWorkstream}` : ''}`}>
            <StatsCard
              title="High Risk Threats"
              value={stats?.highRiskThreats || 0}
              icon={<ExclamationTriangleIcon className="w-6 h-6" />}
              variant="gradient"
              color="amber"
            />
          </Link>

          <Link href={`/actions?status=complete${selectedWorkstream !== 'all' ? `&workstream=${selectedWorkstream}` : ''}`}>
            <StatsCard
              title="Completed Actions"
              value={`${stats?.completedActions || 0}/${stats?.totalActions || 0}`}
              icon={<CheckCircleIcon className="w-6 h-6" />}
              variant="gradient"
              color="green"
            />
          </Link>
        </div>

        {/* Progress by Workstream */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowTrendingUpIcon className="w-5 h-5 text-gray-400" />
              Progress by Workstream
            </CardTitle>
          </CardHeader>
          <CardContent>
            {workstreams.length === 0 ? (
              <EmptyState
                title="No workstreams configured"
                description="Create workstreams to organize your crisis response."
                action={{
                  label: 'Create Workstream',
                  onClick: () => window.location.href = '/admin',
                }}
              />
            ) : (
              <div className="space-y-4">
                {workstreams.map((workstream) => (
                  <WorkstreamProgress key={workstream.id} workstream={workstream} allWorkstreams={workstreams} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Actions */}
          <Card>
            <CardHeader
              actions={
                <Link href="/actions">
                  <Button variant="ghost" size="sm">View All</Button>
                </Link>
              }
            >
              <CardTitle className="flex items-center gap-2">
                <ClipboardDocumentListIcon className="w-5 h-5 text-gray-400" />
                Active Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredRecentActions.length === 0 ? (
                <EmptyState
                  icon={<ClipboardDocumentListIcon className="w-6 h-6" />}
                  title="No active actions"
                  description="All actions are complete or no actions created yet."
                  action={{
                    label: 'Create Action',
                    onClick: () => window.location.href = '/actions/new',
                  }}
                />
              ) : (
                <div className="space-y-3">
                  {filteredRecentActions.map((action) => (
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
                              <WorkstreamBadge
                                workstream={action.workstream}
                                parent={getParentWorkstream(action.workstream.parent_id)}
                              />
                            )}
                            <StatusBadge status={action.status} />
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {action.owner && (
                            <Avatar src={action.owner.avatar_url} name={action.owner.full_name} size="xs" />
                          )}
                          {action.due_date && (
                            <span className={`text-xs ${isOverdue(action.due_date) ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                              {isOverdue(action.due_date) ? 'Overdue' : `Due ${getDaysUntil(action.due_date)}d`}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Threats */}
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
                  description="No high or medium risk threats identified."
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
                              <WorkstreamBadge
                                workstream={threat.workstream}
                                parent={getParentWorkstream(threat.workstream.parent_id)}
                              />
                            )}
                            {threat.expected_delay && (
                              <span className="text-xs text-gray-500">
                                Delay: {threat.expected_delay}
                              </span>
                            )}
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
                            <WorkstreamBadge
                              workstream={milestone.workstream}
                              parent={getParentWorkstream(milestone.workstream.parent_id)}
                              className="mt-1"
                            />
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
        </div>
      </div>
    </div>
  );
}

function WorkstreamProgress({ workstream, allWorkstreams }: { workstream: Workstream; allWorkstreams: Workstream[] }) {
  const [stats, setStats] = useState({ total: 0, completed: 0 });
  const parent = workstream.parent_id ? allWorkstreams.find(ws => ws.id === workstream.parent_id) : null;

  useEffect(() => {
    let mounted = true;

    const fetchStats = async () => {
      const supabase = createClient();

      try {
        // Add timeout to prevent hanging
        const result = await Promise.race([
          supabase.from('actions').select('status').eq('workstream_id', workstream.id),
          new Promise<{ data: null }>((resolve) => setTimeout(() => resolve({ data: null }), 5000)),
        ]);

        if (result.data && mounted) {
          setStats({
            total: result.data.length,
            completed: result.data.filter(a => a.status === 'complete').length,
          });
        }
      } catch (error) {
        console.error('[WorkstreamProgress] Error:', error);
      }
    };

    fetchStats();

    return () => {
      mounted = false;
    };
  }, [workstream.id]);

  const percentage = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ColorIndicator color={workstream.color} size="sm" />
          <span className="text-sm font-medium text-gray-700">
            {parent ? (
              <span className="flex items-center gap-1">
                <span className="text-gray-400">{parent.name}</span>
                <span className="text-gray-300">/</span>
                <span>{workstream.name}</span>
              </span>
            ) : (
              workstream.name
            )}
          </span>
        </div>
        <span className="text-sm text-gray-500">
          {stats.completed}/{stats.total} ({percentage}%)
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${percentage}%`,
            backgroundColor: workstream.color,
          }}
        />
      </div>
    </div>
  );
}
