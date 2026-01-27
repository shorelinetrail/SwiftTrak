'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import { usePermission } from '@/hooks/use-user';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { RiskBadge } from '@/components/ui/badge';
import { formatDate, getRelativeTime, getWorkstreamDisplayName, buildWorkstreamOptions, cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
  PlusIcon,
  MegaphoneIcon,
  CheckCircleIcon,
  PencilIcon,
  TrashIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import { BookmarkIcon as BookmarkSolidIcon } from '@heroicons/react/24/solid';
import type { Update, Workstream, User, Threat, Milestone, RiskLevel } from '@/types/database';

type UpdateWithRelations = Update & {
  workstream?: Workstream;
  creator?: User;
};

type RecentUpdateItem = {
  type: 'update' | 'threat' | 'milestone';
  id: string;
  content: string;
  posted_at: string;
  workstream?: Workstream;
  creator?: User;
  // Update-specific
  is_pinned?: boolean;
  source_type?: string;
  created_by?: string;
  // Threat-specific
  threat_title?: string;
  current_risk?: RiskLevel;
  // Milestone-specific
  milestone_title?: string;
};

export default function UpdatesPage() {
  const { workstreams, user, setWorkstreams } = useAppStore();
  const { canEdit, canAdmin } = usePermission();
  const [loading, setLoading] = useState(true);
  const [updateItems, setUpdateItems] = useState<RecentUpdateItem[]>([]);
  const [selectedWorkstream, setSelectedWorkstream] = useState<string>('all');

  // Editing states
  const [editingUpdateId, setEditingUpdateId] = useState<string | null>(null);
  const [editingUpdateContent, setEditingUpdateContent] = useState('');
  const [deletingUpdateId, setDeletingUpdateId] = useState<string | null>(null);

  // Workstream filter options
  const workstreamOptions = useMemo(() =>
    buildWorkstreamOptions(workstreams, {
      mapOption: (ws) => ({
        icon: <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ws.color }} />,
      }),
    }),
  [workstreams]);

  // Filter by workstream
  const filteredUpdateItems = useMemo(() =>
    selectedWorkstream === 'all'
      ? updateItems
      : updateItems.filter(item => item.workstream?.id === selectedWorkstream),
    [updateItems, selectedWorkstream]
  );

  const fetchUpdates = useCallback(async () => {
    const supabase = createClient();
    const items: RecentUpdateItem[] = [];

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

      // Fetch regular updates
      const { data: updatesData, error: updatesError } = await supabase
        .from('updates')
        .select(`
          *,
          workstream:workstreams(id, name, color, parent_id),
          creator:users!updates_created_by_fkey(id, full_name, avatar_url)
        `)
        .order('is_pinned', { ascending: false })
        .order('posted_at', { ascending: false })
        .limit(100);

      if (updatesError) {
        console.error('Error fetching updates:', updatesError);
      } else if (updatesData) {
        for (const update of updatesData as UpdateWithRelations[]) {
          // Skip system-generated updates for milestones and threats (we'll fetch those separately)
          const lowerContent = update.content.toLowerCase();
          if (lowerContent.startsWith('milestone complete') || lowerContent.startsWith('threat closed')) {
            continue;
          }
          items.push({
            type: 'update',
            id: update.id,
            content: update.content,
            posted_at: update.posted_at,
            workstream: update.workstream,
            creator: update.creator,
            is_pinned: update.is_pinned,
            source_type: update.source_type,
            created_by: update.created_by,
          });
        }
      }

      // Fetch recently closed threats (last 30 days)
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const { data: closedThreatsData } = await supabase
        .from('threats')
        .select(`*, workstream:workstreams(id, name, color, parent_id)`)
        .eq('status', 'closed')
        .gte('updated_at', new Date(thirtyDaysAgo).toISOString())
        .order('updated_at', { ascending: false })
        .limit(50);

      if (closedThreatsData) {
        for (const threat of closedThreatsData as (Threat & { workstream?: Workstream })[]) {
          items.push({
            type: 'threat',
            id: threat.id,
            content: `Threat closed: ${threat.title}`,
            posted_at: threat.updated_at,
            workstream: threat.workstream,
            threat_title: threat.title,
            current_risk: threat.current_risk as RiskLevel,
          });
        }
      }

      // Fetch recently completed milestones (last 30 days)
      const { data: completedMilestonesData } = await supabase
        .from('milestones')
        .select(`*, workstream:workstreams(id, name, color, parent_id)`)
        .eq('status', 'completed')
        .gte('updated_at', new Date(thirtyDaysAgo).toISOString())
        .order('updated_at', { ascending: false })
        .limit(50);

      if (completedMilestonesData) {
        for (const milestone of completedMilestonesData as (Milestone & { workstream?: Workstream })[]) {
          items.push({
            type: 'milestone',
            id: milestone.id,
            content: `Milestone complete: ${milestone.title}`,
            posted_at: milestone.updated_at,
            workstream: milestone.workstream,
            milestone_title: milestone.title,
          });
        }
      }

      // Sort by pinned first, then by posted_at
      items.sort((a, b) => {
        // Pinned items first
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        // Then by date
        return new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime();
      });

      setUpdateItems(items);
    } catch (error) {
      console.error('Error fetching updates:', error);
      toast.error('Failed to load updates');
    } finally {
      setLoading(false);
    }
  }, [workstreams.length, setWorkstreams]);

  useEffect(() => {
    fetchUpdates();
  }, [fetchUpdates]);

  const handleEditUpdate = async (updateId: string) => {
    if (!editingUpdateContent.trim()) return;

    try {
      const supabase = createClient();

      const { error } = await supabase
        .from('updates')
        .update({ content: editingUpdateContent.trim() })
        .eq('id', updateId);

      if (error) throw error;

      toast.success('Update edited');
      setEditingUpdateId(null);
      setEditingUpdateContent('');
      fetchUpdates();
    } catch (error) {
      console.error('Error editing update:', error);
      toast.error('Failed to edit update');
    }
  };

  const handleDeleteUpdate = async (updateId: string) => {
    try {
      const supabase = createClient();

      const { error } = await supabase
        .from('updates')
        .delete()
        .eq('id', updateId);

      if (error) throw error;

      toast.success('Update deleted');
      setDeletingUpdateId(null);
      fetchUpdates();
    } catch (error) {
      console.error('Error deleting update:', error);
      toast.error('Failed to delete update');
    }
  };

  const handleTogglePin = async (updateId: string, currentlyPinned: boolean) => {
    try {
      const supabase = createClient();

      const { error } = await supabase
        .from('updates')
        .update({ is_pinned: !currentlyPinned })
        .eq('id', updateId);

      if (error) throw error;

      toast.success(currentlyPinned ? 'Update unpinned' : 'Update pinned');
      fetchUpdates();
    } catch (error) {
      console.error('Error toggling pin:', error);
      toast.error('Failed to update pin status');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header title="Updates" />
        <div className="p-6 flex items-center justify-center h-64">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        title="Updates"
        subtitle="Announcements, completed milestones, and closed threats"
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
            {canEdit && (
              <Link href="/updates/new">
                <Button>
                  <PlusIcon className="w-4 h-4 mr-2" />
                  Post Update
                </Button>
              </Link>
            )}
          </div>
        }
      />

      <div className="p-6 max-w-4xl mx-auto">
        {filteredUpdateItems.length === 0 ? (
          <EmptyState
            icon={<MegaphoneIcon className="w-6 h-6" />}
            title="No updates yet"
            description="Post updates to keep your team informed about project progress."
            action={{
              label: 'Post Update',
              onClick: () => window.location.href = '/updates/new',
            }}
          />
        ) : (
          <div className="space-y-4">
            {filteredUpdateItems.map((item) => (
              <Card
                key={`${item.type}-${item.id}`}
                className={cn(
                  item.is_pinned && 'border-red-200 bg-red-50/30'
                )}
              >
                <CardContent className="p-4">
                  <div className="flex gap-4">
                    {/* Icon */}
                    {item.type === 'threat' && (
                      <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                        <CheckCircleIcon className="w-5 h-5 text-green-600" />
                      </div>
                    )}
                    {item.type === 'milestone' && (
                      <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                        <CheckCircleIcon className="w-5 h-5 text-green-600" />
                      </div>
                    )}
                    {item.type === 'update' && (
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <MegaphoneIcon className="w-5 h-5 text-blue-600" />
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium text-gray-500 uppercase">
                            {item.type === 'threat' ? 'Threat Closed' :
                             item.type === 'milestone' ? 'Milestone Complete' :
                             'Announcement'}
                          </span>
                          {item.is_pinned && (
                            <span className="inline-flex items-center gap-1 text-xs text-red-600">
                              <BookmarkSolidIcon className="w-3 h-3" />
                              Pinned
                            </span>
                          )}
                          {item.workstream && (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                              style={{
                                backgroundColor: `${item.workstream.color}20`,
                                color: item.workstream.color,
                              }}
                            >
                              {getWorkstreamDisplayName(item.workstream, workstreams)}
                            </span>
                          )}
                          {item.type === 'threat' && item.current_risk && (
                            <RiskBadge risk={item.current_risk} />
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {item.type === 'update' && canEdit && (item.created_by === user?.id || canAdmin) && (
                            <>
                              {canAdmin && (
                                <button
                                  onClick={() => handleTogglePin(item.id, item.is_pinned || false)}
                                  className={cn(
                                    'p-1 rounded',
                                    item.is_pinned
                                      ? 'text-red-600 hover:text-red-700'
                                      : 'text-gray-400 hover:text-gray-600'
                                  )}
                                  title={item.is_pinned ? 'Unpin' : 'Pin'}
                                >
                                  <BookmarkSolidIcon className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setEditingUpdateId(item.id);
                                  setEditingUpdateContent(item.content);
                                }}
                                className="p-1 text-gray-400 hover:text-gray-600 rounded"
                                title="Edit"
                              >
                                <PencilIcon className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setDeletingUpdateId(item.id)}
                                className="p-1 text-gray-400 hover:text-red-600 rounded"
                                title="Delete"
                              >
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          <span className="text-xs text-gray-400 whitespace-nowrap ml-2">
                            {getRelativeTime(item.posted_at)}
                          </span>
                        </div>
                      </div>

                      {item.type === 'update' && editingUpdateId === item.id ? (
                        <div className="mt-2">
                          <Textarea
                            value={editingUpdateContent}
                            onChange={(e) => setEditingUpdateContent(e.target.value)}
                            rows={3}
                          />
                          <div className="flex justify-end gap-2 mt-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingUpdateId(null);
                                setEditingUpdateContent('');
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleEditUpdate(item.id)}
                            >
                              Save
                            </Button>
                          </div>
                        </div>
                      ) : item.type === 'threat' ? (
                        <Link href={`/threats/${item.id}`} className="block hover:underline mt-1">
                          <p className="text-gray-900">
                            <span className="font-medium">Threat closed:</span> {item.threat_title}
                          </p>
                        </Link>
                      ) : item.type === 'milestone' ? (
                        <Link href={`/milestones/${item.id}`} className="block hover:underline mt-1">
                          <p className="text-gray-900">
                            <span className="font-medium">Milestone complete:</span> {item.milestone_title}
                          </p>
                        </Link>
                      ) : (
                        <p className="text-gray-900 mt-1 whitespace-pre-wrap">
                          {item.content}
                        </p>
                      )}

                      {item.type === 'update' && item.creator && (
                        <div className="flex items-center gap-2 mt-3 text-sm text-gray-500">
                          <Avatar
                            src={item.creator.avatar_url}
                            name={item.creator.full_name}
                            size="xs"
                          />
                          <span>{item.creator.full_name}</span>
                          <span className="text-gray-300">•</span>
                          <span>{formatDate(item.posted_at, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Delete Update Confirmation */}
      {deletingUpdateId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setDeletingUpdateId(null)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6">
            <h3 className="text-lg font-semibold mb-2">Delete Update</h3>
            <p className="text-gray-600 mb-4">Are you sure you want to delete this update?</p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeletingUpdateId(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => handleDeleteUpdate(deletingUpdateId)}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
