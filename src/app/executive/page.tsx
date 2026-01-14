'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import { Header } from '@/components/layout/header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge, PriorityBadge, RiskBadge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading';
import { formatDate, cn } from '@/lib/utils';
import {
  DocumentArrowDownIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import toast from 'react-hot-toast';
import type { Action, Threat, Milestone, Workstream } from '@/types/database';

interface ExecutiveStats {
  totalActions: number;
  pendingActions: number;
  inProgressActions: number;
  completedActions: number;
  overdueActions: number;
  criticalActions: number;
  totalThreats: number;
  highRiskThreats: number;
  mediumRiskThreats: number;
  lowRiskThreats: number;
  pendingMilestones: number;
  completedMilestones: number;
  missedMilestones: number;
}

interface WorkstreamStats {
  workstream: Workstream;
  totalActions: number;
  completedActions: number;
  highRiskThreats: number;
}

export default function ExecutiveDashboardPage() {
  const { workstreams } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ExecutiveStats | null>(null);
  const [workstreamStats, setWorkstreamStats] = useState<WorkstreamStats[]>([]);
  const [recentActions, setRecentActions] = useState<Action[]>([]);
  const [criticalThreats, setCriticalThreats] = useState<Threat[]>([]);
  const [upcomingMilestones, setUpcomingMilestones] = useState<Milestone[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const dashboardRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    const now = new Date();

    // Fetch all data in parallel
    const [actionsResult, threatsResult, milestonesResult] = await Promise.all([
      supabase.from('actions').select('*'),
      supabase.from('threats').select('*'),
      supabase.from('milestones').select('*'),
    ]);

    const actions = actionsResult.data || [];
    const threats = threatsResult.data || [];
    const milestones = milestonesResult.data || [];

    // Calculate stats
    setStats({
      totalActions: actions.length,
      pendingActions: actions.filter(a => a.status === 'pending').length,
      inProgressActions: actions.filter(a => a.status === 'in_progress').length,
      completedActions: actions.filter(a => a.status === 'complete').length,
      overdueActions: actions.filter(a =>
        a.due_date && new Date(a.due_date) < now &&
        a.status !== 'complete' && a.status !== 'cancelled'
      ).length,
      criticalActions: actions.filter(a =>
        a.priority === 'critical' && a.status !== 'complete' && a.status !== 'cancelled'
      ).length,
      totalThreats: threats.length,
      highRiskThreats: threats.filter(t => t.current_risk === 'high').length,
      mediumRiskThreats: threats.filter(t => t.current_risk === 'medium').length,
      lowRiskThreats: threats.filter(t => t.current_risk === 'low').length,
      pendingMilestones: milestones.filter(m => m.status === 'pending').length,
      completedMilestones: milestones.filter(m => m.status === 'completed').length,
      missedMilestones: milestones.filter(m => m.status === 'missed').length,
    });

    // Calculate workstream stats
    const wsStats = workstreams.map(ws => ({
      workstream: ws,
      totalActions: actions.filter(a => a.workstream_id === ws.id).length,
      completedActions: actions.filter(a => a.workstream_id === ws.id && a.status === 'complete').length,
      highRiskThreats: threats.filter(t => t.workstream_id === ws.id && t.current_risk === 'high').length,
    }));
    setWorkstreamStats(wsStats);

    // Recent critical/high priority actions
    setRecentActions(
      actions
        .filter(a => (a.priority === 'critical' || a.priority === 'high') && a.status !== 'complete')
        .slice(0, 5) as Action[]
    );

    // High risk threats
    setCriticalThreats(
      threats.filter(t => t.current_risk === 'high').slice(0, 5) as Threat[]
    );

    // Upcoming milestones
    const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    setUpcomingMilestones(
      milestones
        .filter(m => m.status === 'pending' && new Date(m.target_date) <= oneWeekFromNow)
        .sort((a, b) => new Date(a.target_date).getTime() - new Date(b.target_date).getTime())
        .slice(0, 5) as Milestone[]
    );

    setLastUpdated(new Date());
    setLoading(false);
  }, [workstreams]);

  useEffect(() => {
    fetchData();

    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const exportToPDF = async () => {
    if (!dashboardRef.current) return;

    try {
      const canvas = await html2canvas(dashboardRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('l', 'mm', 'a4');
      const imgWidth = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      pdf.save(`SwiftTrak-Executive-Report-${formatDate(new Date(), { year: 'numeric', month: '2-digit', day: '2-digit' })}.pdf`);

      toast.success('PDF exported successfully');
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error('Failed to export PDF');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header title="Executive Dashboard" />
        <div className="flex items-center justify-center h-96">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  const completionRate = stats && stats.totalActions > 0
    ? Math.round((stats.completedActions / stats.totalActions) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-gray-100">
      <Header
        title="Executive Dashboard"
        subtitle={`Last updated: ${formatDate(lastUpdated, { hour: '2-digit', minute: '2-digit' })}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchData}>
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={exportToPDF}>
              <DocumentArrowDownIcon className="w-4 h-4 mr-2" />
              Export PDF
            </Button>
          </div>
        }
      />

      <div ref={dashboardRef} className="p-6 space-y-6">
        {/* Overall Progress */}
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Crisis Response Progress</h2>
              <p className="text-gray-300 mt-1">Overall completion rate across all workstreams</p>
            </div>
            <div className="text-right">
              <p className="text-5xl font-bold">{completionRate}%</p>
              <p className="text-gray-300">{stats?.completedActions} of {stats?.totalActions} actions complete</p>
            </div>
          </div>
          <div className="mt-4 h-4 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-500"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Critical Actions"
            value={stats?.criticalActions || 0}
            icon={<ExclamationTriangleIcon className="w-6 h-6" />}
            color="red"
            trend={stats?.criticalActions ? 'needs attention' : 'clear'}
          />
          <MetricCard
            title="Overdue Items"
            value={stats?.overdueActions || 0}
            icon={<ClockIcon className="w-6 h-6" />}
            color="orange"
            trend={stats?.overdueActions ? 'needs attention' : 'on track'}
          />
          <MetricCard
            title="High Risk Threats"
            value={stats?.highRiskThreats || 0}
            icon={<XCircleIcon className="w-6 h-6" />}
            color="red"
            trend={stats?.highRiskThreats ? 'active' : 'mitigated'}
          />
          <MetricCard
            title="Milestones This Week"
            value={upcomingMilestones.length}
            icon={<CheckCircleIcon className="w-6 h-6" />}
            color="blue"
            trend={`${stats?.completedMilestones || 0} completed`}
          />
        </div>

        {/* Workstream Progress */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowTrendingUpIcon className="w-5 h-5 text-gray-400" />
              Workstream Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {workstreamStats.map(({ workstream, totalActions, completedActions, highRiskThreats }) => {
                const percentage = totalActions > 0 ? Math.round((completedActions / totalActions) * 100) : 0;
                return (
                  <div key={workstream.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: workstream.color }}
                        />
                        <span className="font-medium text-gray-900">{workstream.name}</span>
                        {highRiskThreats > 0 && (
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                            {highRiskThreats} high risk
                          </span>
                        )}
                      </div>
                      <span className="text-sm text-gray-500">
                        {completedActions}/{totalActions} ({percentage}%)
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
              })}
            </div>
          </CardContent>
        </Card>

        {/* Critical Items Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Priority Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-red-600">Priority Actions</CardTitle>
            </CardHeader>
            <CardContent>
              {recentActions.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No critical actions pending</p>
              ) : (
                <div className="space-y-3">
                  {recentActions.map((action) => (
                    <div key={action.id} className="p-2 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {action.title}
                        </span>
                        <PriorityBadge priority={action.priority} />
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <StatusBadge status={action.status} />
                        {action.due_date && (
                          <span>{formatDate(action.due_date, { month: 'short', day: 'numeric' })}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* High Risk Threats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-orange-600">High Risk Threats</CardTitle>
            </CardHeader>
            <CardContent>
              {criticalThreats.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No high risk threats</p>
              ) : (
                <div className="space-y-3">
                  {criticalThreats.map((threat) => (
                    <div key={threat.id} className="p-2 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {threat.title}
                        </span>
                        <RiskBadge risk={threat.current_risk} />
                      </div>
                      {threat.expected_delay && (
                        <p className="text-xs text-gray-500">
                          Potential delay: {threat.expected_delay}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming Milestones */}
          <Card>
            <CardHeader>
              <CardTitle className="text-blue-600">Upcoming Milestones</CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingMilestones.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No milestones this week</p>
              ) : (
                <div className="space-y-3">
                  {upcomingMilestones.map((milestone) => (
                    <div key={milestone.id} className="p-2 bg-gray-50 rounded-lg">
                      <span className="text-sm font-medium text-gray-900 block truncate">
                        {milestone.title}
                      </span>
                      <span className="text-xs text-gray-500">
                        Target: {formatDate(milestone.target_date, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
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

function MetricCard({
  title,
  value,
  icon,
  color,
  trend,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: 'red' | 'orange' | 'blue' | 'green';
  trend: string;
}) {
  const colors = {
    red: 'bg-red-50 border-red-200 text-red-600',
    orange: 'bg-orange-50 border-orange-200 text-orange-600',
    blue: 'bg-blue-50 border-blue-200 text-blue-600',
    green: 'bg-green-50 border-green-200 text-green-600',
  };

  return (
    <Card className={cn('border-2', colors[color])}>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium opacity-80">{title}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
            <p className="text-xs opacity-60 mt-1">{trend}</p>
          </div>
          <div className="opacity-40">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}
