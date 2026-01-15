'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import { usePermission } from '@/hooks/use-user';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, getRelativeTime, getWorkstreamDisplayName, cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
  PlusIcon,
  MegaphoneIcon,
  FlagIcon,
  CheckCircleIcon,
  PencilIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { BookmarkIcon as BookmarkSolidIcon } from '@heroicons/react/24/solid';
import type { Update, Workstream, User } from '@/types/database';

type UpdateWithRelations = Update & {
  workstream?: Workstream;
  creator?: User;
};

export default function UpdatesPage() {
  const { workstreams, user } = useAppStore();
  const { canEdit, canAdmin } = usePermission();
  const [loading, setLoading] = useState(true);
  const [updates, setUpdates] = useState<UpdateWithRelations[]>([]);

  // Editing states
  const [editingUpdateId, setEditingUpdateId] = useState<string | null>(null);
  const [editingUpdateContent, setEditingUpdateContent] = useState('');
  const [deletingUpdateId, setDeletingUpdateId] = useState<string | null>(null);

  const fetchUpdates = useCallback(async () => {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('updates')
      .select(`
        *,
        workstream:workstreams(id, name, color, parent_id),
        creator:users!updates_created_by_fkey(id, full_name, avatar_url)
      `)
      .order('is_pinned', { ascending: false })
      .order('posted_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error fetching updates:', error);
    } else {
      setUpdates(data as unknown as UpdateWithRelations[]);
    }
    setLoading(false);
  }, []);

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

  const getSourceIcon = (sourceType?: string) => {
    switch (sourceType) {
      case 'milestone_completed':
        return <FlagIcon className="w-5 h-5 text-green-600" />;
      case 'action_completed':
        return <CheckCircleIcon className="w-5 h-5 text-blue-600" />;
      default:
        return <MegaphoneIcon className="w-5 h-5 text-red-600" />;
    }
  };

  const getSourceLabel = (sourceType?: string) => {
    switch (sourceType) {
      case 'milestone_completed':
        return 'Milestone Completed';
      case 'action_completed':
        return 'Action Completed';
      default:
        return 'Announcement';
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
        actions={
          <Link href="/updates/new">
            <Button>
              <PlusIcon className="w-4 h-4 mr-2" />
              Post Update
            </Button>
          </Link>
        }
      />

      <div className="p-6 max-w-4xl mx-auto">
        {updates.length === 0 ? (
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
            {updates.map((update) => (
              <Card
                key={update.id}
                className={cn(
                  update.is_pinned && 'border-red-200 bg-red-50/30'
                )}
              >
                <CardContent className="p-4">
                  <div className="flex gap-4">
                    {/* Icon */}
                    <div className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
                      update.source_type === 'milestone_completed' && 'bg-green-100',
                      update.source_type === 'action_completed' && 'bg-blue-100',
                      (!update.source_type || update.source_type === 'manual') && 'bg-red-100'
                    )}>
                      {getSourceIcon(update.source_type)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium text-gray-500 uppercase">
                            {getSourceLabel(update.source_type)}
                          </span>
                          {update.is_pinned && (
                            <span className="inline-flex items-center gap-1 text-xs text-red-600">
                              <BookmarkSolidIcon className="w-3 h-3" />
                              Pinned
                            </span>
                          )}
                          {update.workstream && (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                              style={{
                                backgroundColor: `${update.workstream.color}20`,
                                color: update.workstream.color,
                              }}
                            >
                              {getWorkstreamDisplayName(update.workstream, workstreams)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {canEdit && (update.created_by === user?.id || canAdmin) && (
                            <>
                              {canAdmin && (
                                <button
                                  onClick={() => handleTogglePin(update.id, update.is_pinned)}
                                  className={cn(
                                    'p-1 rounded',
                                    update.is_pinned
                                      ? 'text-red-600 hover:text-red-700'
                                      : 'text-gray-400 hover:text-gray-600'
                                  )}
                                  title={update.is_pinned ? 'Unpin' : 'Pin'}
                                >
                                  <BookmarkSolidIcon className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setEditingUpdateId(update.id);
                                  setEditingUpdateContent(update.content);
                                }}
                                className="p-1 text-gray-400 hover:text-gray-600 rounded"
                                title="Edit"
                              >
                                <PencilIcon className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setDeletingUpdateId(update.id)}
                                className="p-1 text-gray-400 hover:text-red-600 rounded"
                                title="Delete"
                              >
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          <span className="text-xs text-gray-400 whitespace-nowrap ml-2">
                            {getRelativeTime(update.posted_at)}
                          </span>
                        </div>
                      </div>

                      {editingUpdateId === update.id ? (
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
                              onClick={() => handleEditUpdate(update.id)}
                            >
                              Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-gray-900 mt-1 whitespace-pre-wrap">
                          {update.content}
                        </p>
                      )}

                      {update.creator && (
                        <div className="flex items-center gap-2 mt-3 text-sm text-gray-500">
                          <Avatar
                            src={update.creator.avatar_url}
                            name={update.creator.full_name}
                            size="xs"
                          />
                          <span>{update.creator.full_name}</span>
                          <span className="text-gray-300">•</span>
                          <span>{formatDate(update.posted_at, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
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
