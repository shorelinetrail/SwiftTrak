'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { StatusBadge, PriorityBadge, RiskBadge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading';
import { formatDate, cn } from '@/lib/utils';
import {
  ClipboardDocumentListIcon,
  ExclamationTriangleIcon,
  FlagIcon,
  ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline';
import type { Action, Threat, Milestone, Workstream, StakeholderLink } from '@/types/database';

export default function StakeholderPage() {
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<StakeholderLink | null>(null);
  const [workstreams, setWorkstreams] = useState<Workstream[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [threats, setThreats] = useState<Threat[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchData = useCallback(async () => {
    const supabase = createClient();

    // Validate token
    const { data: linkData, error: linkError } = await supabase
      .from('stakeholder_links')
      .select('*')
      .eq('token', token)
      .single();

    if (linkError || !linkData) {
      setError('Invalid or expired link');
      setLoading(false);
      return;
    }

    // Check expiration
    if (linkData.expires_at && new Date(linkData.expires_at) < new Date()) {
      setError('This link has expired');
      setLoading(false);
      return;
    }

    setLink(linkData as StakeholderLink);

    // Build workstream filter
    const workstreamIds = linkData.workstream_ids || null;

    // Fetch workstreams
    let workstreamsQuery = supabase.from('workstreams').select('*').order('order_index');
    if (workstreamIds) {
      workstreamsQuery = workstreamsQuery.in('id', workstreamIds);
    }
    const { data: workstreamsData } = await workstreamsQuery;
    setWorkstreams((workstreamsData || []) as Workstream[]);

    // Fetch actions
    let actionsQuery = supabase.from('actions').select('*').order('created_at', { ascending: false });
    if (workstreamIds) {
      actionsQuery = actionsQuery.in('workstream_id', workstreamIds);
    }
    const { data: actionsData } = await actionsQuery;
    setActions((actionsData || []) as Action[]);

    // Fetch threats
    let threatsQuery = supabase.from('threats').select('*').order('created_at', { ascending: false });
    if (workstreamIds) {
      threatsQuery = threatsQuery.in('workstream_id', workstreamIds);
    }
    const { data: threatsData } = await threatsQuery;
    setThreats((threatsData || []) as Threat[]);

    // Fetch milestones
    let milestonesQuery = supabase.from('milestones').select('*').order('target_date');
    if (workstreamIds) {
      milestonesQuery = milestonesQuery.in('workstream_id', workstreamIds);
    }
    const { data: milestonesData } = await milestonesQuery;
    setMilestones((milestonesData || []) as Milestone[]);

    setLastUpdated(new Date());
    setLoading(false);
  }, [token]);

  useEffect(() => {
    fetchData();

    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ExclamationTriangleIcon className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900">{error}</h1>
          <p className="text-gray-500 mt-2">Please contact the administrator for a new link.</p>
        </div>
      </div>
    );
  }

  const completedActions = actions.filter(a => a.status === 'complete').length;
  const completionRate = actions.length > 0 ? Math.round((completedActions / actions.length) * 100) : 0;
  const highRiskThreats = threats.filter(t => t.current_risk === 'high').length;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">S</span>
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">SwiftTrak</h1>
                <p className="text-sm text-gray-500">{link?.name} - Read Only View</p>
              </div>
            </div>
            <p className="text-sm text-gray-500">
              Last updated: {formatDate(lastUpdated, { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Overall Progress */}
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Crisis Response Progress</h2>
              <p className="text-gray-300 mt-1">Overall completion rate</p>
            </div>
            <div className="text-right">
              <p className="text-5xl font-bold">{completionRate}%</p>
              <p className="text-gray-300">{completedActions} of {actions.length} actions complete</p>
            </div>
          </div>
          <div className="mt-4 h-4 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-500"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>

        {/* Key Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <ClipboardDocumentListIcon className="w-8 h-8 text-blue-600" />
                <div>
                  <p className="text-2xl font-bold text-blue-700">{actions.filter(a => a.status !== 'complete' && a.status !== 'cancelled').length}</p>
                  <p className="text-sm text-blue-600">Active Actions</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className={cn(
            'border-2',
            highRiskThreats > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
          )}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <ExclamationTriangleIcon className={cn(
                  'w-8 h-8',
                  highRiskThreats > 0 ? 'text-red-600' : 'text-green-600'
                )} />
                <div>
                  <p className={cn(
                    'text-2xl font-bold',
                    highRiskThreats > 0 ? 'text-red-700' : 'text-green-700'
                  )}>{highRiskThreats}</p>
                  <p className={cn(
                    'text-sm',
                    highRiskThreats > 0 ? 'text-red-600' : 'text-green-600'
                  )}>High Risk Threats</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-purple-50 border-purple-200">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <FlagIcon className="w-8 h-8 text-purple-600" />
                <div>
                  <p className="text-2xl font-bold text-purple-700">{milestones.filter(m => m.status === 'pending').length}</p>
                  <p className="text-sm text-purple-600">Pending Milestones</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Workstream Progress */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowTrendingUpIcon className="w-5 h-5 text-gray-400" />
              Progress by Workstream
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {workstreams.map((ws) => {
                const wsActions = actions.filter(a => a.workstream_id === ws.id);
                const wsCompleted = wsActions.filter(a => a.status === 'complete').length;
                const percentage = wsActions.length > 0 ? Math.round((wsCompleted / wsActions.length) * 100) : 0;
                const wsThreats = threats.filter(t => t.workstream_id === ws.id && t.current_risk === 'high').length;

                return (
                  <div key={ws.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: ws.color }}
                        />
                        <span className="font-medium text-gray-900">{ws.name}</span>
                        {wsThreats > 0 && (
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                            {wsThreats} high risk
                          </span>
                        )}
                      </div>
                      <span className="text-sm text-gray-500">
                        {wsCompleted}/{wsActions.length} ({percentage}%)
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%`, backgroundColor: ws.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Actions & Threats */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Active Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Active Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {actions
                  .filter(a => a.status !== 'complete' && a.status !== 'cancelled')
                  .map((action) => (
                    <div key={action.id} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-gray-900 truncate">{action.title}</span>
                        <PriorityBadge priority={action.priority} />
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <StatusBadge status={action.status} />
                        {action.due_date && (
                          <span className="text-gray-500">
                            Due: {formatDate(action.due_date, { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>

          {/* Active Threats */}
          <Card>
            <CardHeader>
              <CardTitle>Active Threats</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {threats.map((threat) => (
                  <div key={threat.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-900 truncate">{threat.title}</span>
                      <RiskBadge risk={threat.current_risk} />
                    </div>
                    {threat.expected_delay && (
                      <p className="text-sm text-gray-500">Expected delay: {threat.expected_delay}</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Milestones */}
        <Card>
          <CardHeader>
            <CardTitle>Milestones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {milestones.map((milestone) => {
                const isPast = new Date(milestone.target_date) < new Date();
                return (
                  <div
                    key={milestone.id}
                    className={cn(
                      'p-3 rounded-lg flex items-center justify-between',
                      milestone.status === 'completed' && 'bg-green-50',
                      milestone.status === 'pending' && !isPast && 'bg-blue-50',
                      milestone.status === 'pending' && isPast && 'bg-red-50',
                      milestone.status === 'missed' && 'bg-red-50'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <FlagIcon className={cn(
                        'w-5 h-5',
                        milestone.status === 'completed' && 'text-green-600',
                        milestone.status === 'pending' && !isPast && 'text-blue-600',
                        (milestone.status === 'missed' || (milestone.status === 'pending' && isPast)) && 'text-red-600'
                      )} />
                      <span className="font-medium text-gray-900">{milestone.title}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">
                        {formatDate(milestone.target_date, { month: 'short', day: 'numeric' })}
                      </p>
                      <StatusBadge status={milestone.status} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <footer className="text-center text-sm text-gray-500 py-4">
          <p>This is a read-only view. Contact your administrator for full access.</p>
          <p className="mt-1">SwiftTrak Crisis Management System</p>
        </footer>
      </main>
    </div>
  );
}
