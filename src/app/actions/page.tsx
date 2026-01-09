'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
// import { useRealtime } from '@/hooks/use-realtime';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { StatusBadge, PriorityBadge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Tabs } from '@/components/ui/tabs';
import { LoadingSpinner } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, isOverdue, getDaysUntil, cn } from '@/lib/utils';
import {
  PlusIcon,
  FunnelIcon,
  ClipboardDocumentListIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import type { Action, Workstream, User, ActionStatus, Priority } from '@/types/database';

type ActionWithRelations = Action & {
  owner?: User;
  workstream?: Workstream;
  creator?: User;
};

export default function ActionsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><LoadingSpinner size="lg" /></div>}>
      <ActionsPageContent />
    </Suspense>
  );
}

function ActionsPageContent() {
  const searchParams = useSearchParams();
  const { workstreams, user } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState<ActionWithRelations[]>([]);
  const [filteredActions, setFilteredActions] = useState<ActionWithRelations[]>([]);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') || 'all');
  const [workstreamFilter, setWorkstreamFilter] = useState<string>(searchParams.get('workstream') || 'all');
  const [priorityFilter, setPriorityFilter] = useState<string>(searchParams.get('priority') || 'all');
  const [activeTab, setActiveTab] = useState('all');

  const fetchActions = useCallback(async () => {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('actions')
      .select(`
        *,
        owner:users!actions_owner_id_fkey(id, full_name, email, avatar_url),
        workstream:workstreams(id, name, color),
        creator:users!actions_created_by_fkey(id, full_name)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching actions:', error);
    } else {
      setActions(data as unknown as ActionWithRelations[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  // Apply filters
  useEffect(() => {
    let filtered = [...actions];

    if (statusFilter !== 'all') {
      filtered = filtered.filter(a => a.status === statusFilter);
    }

    if (workstreamFilter !== 'all') {
      filtered = filtered.filter(a => a.workstream_id === workstreamFilter);
    }

    if (priorityFilter !== 'all') {
      filtered = filtered.filter(a => a.priority === priorityFilter);
    }

    // Tab filters
    if (activeTab === 'my') {
      filtered = filtered.filter(a => a.owner_id === user?.id);
    } else if (activeTab === 'overdue') {
      filtered = filtered.filter(a =>
        a.due_date && isOverdue(a.due_date) &&
        a.status !== 'complete' && a.status !== 'cancelled'
      );
    } else if (activeTab === 'critical') {
      filtered = filtered.filter(a => a.priority === 'critical' && a.status !== 'complete');
    }

    setFilteredActions(filtered);
  }, [actions, statusFilter, workstreamFilter, priorityFilter, activeTab, user]);

  // Real-time updates disabled for stability
  // useRealtime({
  //   table: 'actions',
  //   onInsert: () => fetchActions(),
  //   onUpdate: () => fetchActions(),
  //   onDelete: () => fetchActions(),
  // });

  const tabs = [
    { id: 'all', label: 'All Actions', count: actions.length },
    { id: 'my', label: 'My Actions', count: actions.filter(a => a.owner_id === user?.id).length },
    { id: 'overdue', label: 'Overdue', count: actions.filter(a => a.due_date && isOverdue(a.due_date) && a.status !== 'complete' && a.status !== 'cancelled').length },
    { id: 'critical', label: 'Critical', count: actions.filter(a => a.priority === 'critical' && a.status !== 'complete').length },
  ];

  const statusOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'pending', label: 'Pending' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'complete', label: 'Complete' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  const priorityOptions = [
    { value: 'all', label: 'All Priorities' },
    { value: 'critical', label: 'Critical' },
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' },
  ];

  const workstreamOptions = [
    { value: 'all', label: 'All Workstreams' },
    ...workstreams.map(w => ({ value: w.id, label: w.name })),
  ];

  const handleExport = () => {
    window.location.href = `/api/export/actions?status=${statusFilter}&workstream=${workstreamFilter}&priority=${priorityFilter}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header title="Actions" />
        <div className="flex items-center justify-center h-96">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header
        title="Actions"
        subtitle={`${filteredActions.length} action${filteredActions.length !== 1 ? 's' : ''}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
              Export
            </Button>
            <Link href="/actions/new">
              <Button size="sm">
                <PlusIcon className="w-4 h-4 mr-2" />
                New Action
              </Button>
            </Link>
          </div>
        }
      />

      <div className="p-6 space-y-6">
        {/* Tabs */}
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

        {/* Filters */}
        <Card padding="sm">
          <CardContent>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 text-gray-500">
                <FunnelIcon className="w-4 h-4" />
                <span className="text-sm font-medium">Filters:</span>
              </div>
              <Select
                options={statusOptions}
                value={statusFilter}
                onChange={setStatusFilter}
                className="w-40"
              />
              <Select
                options={priorityOptions}
                value={priorityFilter}
                onChange={setPriorityFilter}
                className="w-40"
              />
              <Select
                options={workstreamOptions}
                value={workstreamFilter}
                onChange={setWorkstreamFilter}
                className="w-48"
              />
              {(statusFilter !== 'all' || priorityFilter !== 'all' || workstreamFilter !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStatusFilter('all');
                    setPriorityFilter('all');
                    setWorkstreamFilter('all');
                  }}
                >
                  Clear Filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Actions List */}
        {filteredActions.length === 0 ? (
          <EmptyState
            icon={<ClipboardDocumentListIcon className="w-6 h-6" />}
            title="No actions found"
            description={
              statusFilter !== 'all' || priorityFilter !== 'all' || workstreamFilter !== 'all'
                ? 'Try adjusting your filters.'
                : 'Create your first action to get started.'
            }
            action={
              statusFilter === 'all' && priorityFilter === 'all' && workstreamFilter === 'all'
                ? {
                    label: 'Create Action',
                    onClick: () => window.location.href = '/actions/new',
                  }
                : undefined
            }
          />
        ) : (
          <div className="space-y-3">
            {filteredActions.map((action) => (
              <ActionCard key={action.id} action={action} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionCard({ action }: { action: ActionWithRelations }) {
  const overdue = action.due_date && isOverdue(action.due_date) && action.status !== 'complete' && action.status !== 'cancelled';

  return (
    <Link href={`/actions/${action.id}`}>
      <Card
        hover
        className={cn(
          overdue && 'border-red-200 bg-red-50/50'
        )}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            {/* Status indicator */}
            <div className={cn(
              'w-1 h-full min-h-[60px] rounded-full',
              action.status === 'complete' && 'bg-green-500',
              action.status === 'in_progress' && 'bg-blue-500',
              action.status === 'pending' && 'bg-gray-300',
              action.status === 'cancelled' && 'bg-red-500',
            )} />

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-medium text-gray-900">{action.title}</h3>
                    <PriorityBadge priority={action.priority} />
                    <StatusBadge status={action.status} />
                  </div>
                  {action.description && (
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{action.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-sm text-gray-500">
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
                    <span>Created {formatDate(action.created_at, { month: 'short', day: 'numeric' })}</span>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  {action.owner && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">{action.owner.full_name}</span>
                      <Avatar src={action.owner.avatar_url} name={action.owner.full_name} size="sm" />
                    </div>
                  )}
                  {action.due_date && (
                    <span className={cn(
                      'text-sm font-medium',
                      overdue ? 'text-red-600' : 'text-gray-500'
                    )}>
                      {overdue ? 'Overdue: ' : 'Due: '}
                      {formatDate(action.due_date, { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
