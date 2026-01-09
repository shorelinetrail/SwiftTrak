'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();
  const { workstreams, setWorkstreams } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActions, setRecentActions] = useState<(Action & { owner?: User; workstream?: Workstream })[]>([]);
  const [recentThreats, setRecentThreats] = useState<(Threat & { workstream?: Workstream })[]>([]);
  const [pendingQueries, setPendingQueries] = useState<(TechnicalQuery & { assignee?: User })[]>([]);
  const [upcomingMilestones, setUpcomingMilestones] = useState<(Milestone & { workstream?: Workstream })[]>([]);

  // Direct data fetch - no dependency on app store user
  useEffect(() => {
    let mounted = true;

    const fetchAllData = async () => {
      const supabase = createClient();

      try {
        // Get current user for user-specific queries (with timeout)
        let userId: string | null = null;

        try {
          const authPromise = supabase.auth.getUser();
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Auth timeout')), 5000)
          );
          const result = await Promise.race([authPromise, timeoutPromise]);
          const authUser = result.data?.user;

          if (!authUser) {
            // No user - redirect to login
            router.push('/auth/login');
            return;
          }

          const { data: profile } = await supabase
            .from('users')
            .select('*')
            .eq('id', authUser.id)
            .single();
          if (profile && mounted) {
            setCurrentUser(profile as User);
            userId = profile.id;
          }
        } catch (authErr) {
          console.error('[Dashboard] Auth error/timeout:', authErr);
          // Redirect to login on auth failure
          router.push('/auth/login');
          return;
        }

        // Fetch all dashboard data
        const [actionsRes, threatsRes, queriesRes, milestonesRes, workstreamsRes] = await Promise.all([
          supabase.from('actions').select('id, status, priority, due_date'),
          supabase.from('threats').select('id, current_risk'),
          supabase.from('technical_queries').select('id, responded_at'),
          supabase.from('milestones').select('id, target_date, status'),
          supabase.from('workstreams').select('*').order('order_index'),
        ]);

        if (!mounted) return;

        // Set workstreams in store
        if (workstreamsRes.data) {
          setWorkstreams(workstreamsRes.data as Workstream[]);
        }

        const actionsData = actionsRes.data || [];
        const threatsData = threatsRes.data || [];
        const queriesData = queriesRes.data || [];
        const milestonesData = milestonesRes.data || [];

        const now = new Date();
        const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        setStats({
          totalActions: actionsData.length,
          completedActions: actionsData.filter(a => a.status === 'complete').length,
          overdueActions: actionsData.filter(a => a.due_date && new Date(a.due_date) < now && a.status !== 'complete' && a.status !== 'cancelled').length,
          criticalActions: actionsData.filter(a => a.priority === 'critical' && a.status !== 'complete' && a.status !== 'cancelled').length,
          totalThreats: threatsData.length,
          highRiskThreats: threatsData.filter(t => t.current_risk === 'high').length,
          pendingQueries: queriesData.filter(q => !q.responded_at).length,
          upcomingMilestones: milestonesData.filter(m => new Date(m.target_date) <= oneWeekFromNow && m.status === 'pending').length,
        });

        // Fetch recent actions with relations
        const { data: recentActionsData } = await supabase
          .from('actions')
          .select(`
            *,
            owner:users!actions_owner_id_fkey(id, full_name, avatar_url),
            workstream:workstreams(id, name, color)
          `)
          .in('status', ['pending', 'in_progress'])
          .order('updated_at', { ascending: false })
          .limit(5);

        if (recentActionsData && mounted) {
          setRecentActions(recentActionsData as unknown as (Action & { owner?: User; workstream?: Workstream })[]);
        }

        // Fetch recent threats
        const { data: recentThreatsData } = await supabase
          .from('threats')
          .select(`
            *,
            workstream:workstreams(id, name, color)
          `)
          .in('current_risk', ['high', 'medium'])
          .order('updated_at', { ascending: false })
          .limit(5);

        if (recentThreatsData && mounted) {
          setRecentThreats(recentThreatsData as unknown as (Threat & { workstream?: Workstream })[]);
        }

        // Fetch pending queries assigned to current user
        if (userId) {
          const { data: pendingQueriesData } = await supabase
            .from('technical_queries')
            .select(`
              *,
              submitter:users!technical_queries_submitted_by_fkey(id, full_name, avatar_url)
            `)
            .eq('assigned_to', userId)
            .is('responded_at', null)
            .order('created_at', { ascending: false })
            .limit(5);

          if (pendingQueriesData && mounted) {
            setPendingQueries(pendingQueriesData as unknown as (TechnicalQuery & { assignee?: User })[]);
          }
        }

        // Fetch upcoming milestones
        const { data: upcomingMilestonesData } = await supabase
          .from('milestones')
          .select(`
            *,
            workstream:workstreams(id, name, color)
          `)
          .eq('status', 'pending')
          .gte('target_date', now.toISOString())
          .order('target_date', { ascending: true })
          .limit(5);

        if (upcomingMilestonesData && mounted) {
          setUpcomingMilestones(upcomingMilestonesData as unknown as (Milestone & { workstream?: Workstream })[]);
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

    fetchAllData();

    return () => {
      mounted = false;
    };
  }, [setWorkstreams, router]);

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
          <Link href="/executive">
            <Button variant="outline" size="sm">
              Executive View
            </Button>
          </Link>
        }
      />

      <div className="p-6 space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-red-500 to-red-600 text-white border-0">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-red-100 text-sm font-medium">Critical Actions</p>
                  <p className="text-3xl font-bold mt-1">{stats?.criticalActions || 0}</p>
                </div>
                <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                  <ExclamationCircleIcon className="w-6 h-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white border-0">
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

          <Card className="bg-gradient-to-br from-amber-500 to-amber-600 text-white border-0">
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

          <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white border-0">
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
                  <WorkstreamProgress key={workstream.id} workstream={workstream} />
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
              {recentActions.length === 0 ? (
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
                  {recentActions.map((action) => (
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
                                {action.workstream.name}
                              </span>
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
              {recentThreats.length === 0 ? (
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
                  {recentThreats.map((threat) => (
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
                                {threat.workstream.name}
                              </span>
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
              {upcomingMilestones.length === 0 ? (
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
                  {upcomingMilestones.map((milestone) => (
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
                              {milestone.workstream.name}
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

function WorkstreamProgress({ workstream }: { workstream: Workstream }) {
  const [stats, setStats] = useState({ total: 0, completed: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('actions')
        .select('status')
        .eq('workstream_id', workstream.id);

      if (data) {
        setStats({
          total: data.length,
          completed: data.filter(a => a.status === 'complete').length,
        });
      }
    };

    fetchStats();
  }, [workstream.id]);

  const percentage = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: workstream.color }}
          />
          <span className="text-sm font-medium text-gray-700">{workstream.name}</span>
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
