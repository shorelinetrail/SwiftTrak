'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { StatusBadge, PriorityBadge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { getRelativeTime, buildWorkstreamOptions, getWorkstreamDisplayName } from '@/lib/utils';
import {
  ArrowPathIcon,
  FunnelIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { usePermission } from '@/hooks/use-user';
import type { Action, Workstream, User } from '@/types/database';

type RecentlyUpdatedAction = Action & {
  owner?: User;
  workstream?: Workstream;
  last_change?: string;
  effective_date?: string;
  audit_id?: string;
};

export default function RecentActionsPage() {
  const { workstreams, setWorkstreams } = useAppStore();
  const { canAdmin } = usePermission();
  const [loading, setLoading] = useState(true);
  const [recentlyUpdated, setRecentlyUpdated] = useState<RecentlyUpdatedAction[]>([]);
  const [selectedWorkstream, setSelectedWorkstream] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<string>('7');

  // Workstream filter options with hierarchy
  const workstreamOptions = useMemo(() =>
    buildWorkstreamOptions(workstreams, {
      mapOption: (ws) => ({
        icon: <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ws.color }} />,
      }),
    }),
  [workstreams]);

  const timeRangeOptions = [
    { value: '7', label: 'Last 7 days' },
    { value: '14', label: 'Last 14 days' },
    { value: '30', label: 'Last 30 days' },
    { value: '90', label: 'Last 90 days' },
  ];

  // Filter by workstream
  const filteredRecentlyUpdated = useMemo(() =>
    selectedWorkstream === 'all'
      ? recentlyUpdated
      : recentlyUpdated.filter(a => a.workstream_id === selectedWorkstream),
    [recentlyUpdated, selectedWorkstream]
  );

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const supabase = createClient();

      try {
        // Fetch workstreams if not already loaded
        if (workstreams.length === 0) {
          const { data: workstreamsData } = await supabase
            .from('workstreams')
            .select('*')
            .order('order_index');
          if (workstreamsData) {
            setWorkstreams(workstreamsData as Workstream[]);
          }
        }

        const daysAgo = Date.now() - parseInt(timeRange) * 24 * 60 * 60 * 1000;

        // Fetch recent audit entries first
        let auditData: { id: string; action_id: string; change_type: string; old_value?: string; new_value?: string; created_at: string }[] | null = null;
        const { data: auditWithFilter, error: filterError } = await supabase
          .from('action_audit')
          .select('id, action_id, change_type, old_value, new_value, created_at, hide_from_recent')
          .gte('created_at', new Date(daysAgo).toISOString())
          .eq('hide_from_recent', false)
          .order('created_at', { ascending: false })
          .limit(100);

        if (filterError) {
          const { data: auditWithoutFilter } = await supabase
            .from('action_audit')
            .select('id, action_id, change_type, old_value, new_value, created_at')
            .gte('created_at', new Date(daysAgo).toISOString())
            .order('created_at', { ascending: false })
            .limit(100);
          auditData = auditWithoutFilter;
        } else {
          auditData = auditWithFilter;
        }

        if (auditData && auditData.length > 0) {
          // Get unique action IDs from audit entries (most recent first)
          const seenActionIds = new Set<string>();
          const latestAuditByAction = new Map<string, { id: string; change_type: string; old_value?: string; new_value?: string; created_at: string }>();

          for (const entry of auditData) {
            if (!seenActionIds.has(entry.action_id)) {
              seenActionIds.add(entry.action_id);
              latestAuditByAction.set(entry.action_id, entry);
            }
          }

          // Fetch action details for all actions with recent audit entries
          const actionIds = Array.from(seenActionIds);
          const { data: actionsData } = await supabase
            .from('actions')
            .select(`*, owner:users!actions_owner_id_fkey(id, full_name, avatar_url), workstream:workstreams(id, name, color, parent_id)`)
            .in('id', actionIds);

          if (actionsData) {
            // Build actions with audit info, sorted by audit entry time
            const actionsWithChanges = actionIds
              .map(actionId => {
                const action = actionsData.find(a => a.id === actionId);
                if (!action) return null;

                const audit = latestAuditByAction.get(actionId);
                let last_change = '';
                let audit_id: string | undefined;
                let effective_date = audit?.created_at || action.updated_at;

                if (audit) {
                  audit_id = audit.id;
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

                return {
                  ...action,
                  last_change,
                  audit_id,
                  effective_date,
                } as RecentlyUpdatedAction;
              })
              .filter((a): a is RecentlyUpdatedAction => a !== null);

            setRecentlyUpdated(actionsWithChanges);
          } else {
            setRecentlyUpdated([]);
          }
        } else {
          setRecentlyUpdated([]);
        }
      } catch (error) {
        console.error('[RecentActions] Error:', error);
        toast.error('Failed to load recent actions');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [timeRange, setWorkstreams, workstreams.length]);

  // Handler to hide an action from recently updated
  const handleHideFromRecent = async (e: React.MouseEvent, action: RecentlyUpdatedAction) => {
    e.preventDefault();
    e.stopPropagation();

    if (!action.audit_id) {
      toast.error('Cannot hide this entry');
      return;
    }

    const supabase = createClient();
    const { error } = await supabase
      .from('action_audit')
      .update({ hide_from_recent: true })
      .eq('id', action.audit_id);

    if (error) {
      console.error('[RecentActions] Error hiding action:', error);
      toast.error('Failed to hide action');
      return;
    }

    // Remove from state
    setRecentlyUpdated(prev => prev.filter(a => a.id !== action.id));
    toast.success('Hidden from recent updates');
  };

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
        title="Recently Updated Actions"
        subtitle="Actions with recent activity"
        breadcrumbs={[
          { label: 'Actions', href: '/actions' },
          { label: 'Recent Activity' },
        ]}
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
            <Select
              options={timeRangeOptions}
              value={timeRange}
              onChange={setTimeRange}
              className="w-36"
            />
          </div>
        }
      />

      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            {filteredRecentlyUpdated.length === 0 ? (
              <EmptyState
                icon={<ArrowPathIcon className="w-6 h-6" />}
                title="No recent activity"
                description="No actions have been updated in the selected time period."
              />
            ) : (
              <div className="space-y-3">
                {filteredRecentlyUpdated.map((action) => (
                  <Link
                    key={action.id}
                    href={`/actions/${action.id}`}
                    className="group block p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all"
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
                      <div className="flex items-start gap-2">
                        {canAdmin && action.audit_id && (
                          <button
                            onClick={(e) => handleHideFromRecent(e, action)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-all"
                            title="Hide from recent updates"
                          >
                            <EyeSlashIcon className="w-4 h-4" />
                          </button>
                        )}
                        <div className="flex flex-col items-end gap-1">
                          {action.owner && (
                            <Avatar src={action.owner.avatar_url} name={action.owner.full_name} size="xs" />
                          )}
                          <span className="text-xs text-gray-500">
                            {action.last_change && <span className="font-medium text-gray-600">{action.last_change}</span>}
                            {action.last_change && ' · '}
                            {getRelativeTime(action.effective_date || action.updated_at)}
                          </span>
                        </div>
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
  );
}
