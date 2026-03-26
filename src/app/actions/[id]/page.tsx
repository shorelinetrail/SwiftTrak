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
import { StatusBadge, PriorityBadge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Modal } from '@/components/ui/modal';
import { LoadingSpinner, LoadingPage } from '@/components/ui/loading';
import { formatDate, getRelativeTime, cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
  PencilIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  PaperClipIcon,
  ChatBubbleLeftIcon,
  DocumentArrowDownIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import { bulkDownloadAttachments, type DownloadProgress } from '@/lib/bulk-download';
import type { Action, ActionUpdate, ActionAudit, Workstream, User, Attachment, ActionStatus, Priority } from '@/types/database';

type ActionWithRelations = Action & {
  owner?: User;
  workstream?: Workstream;
  creator?: User;
};

type ActionUpdateWithUser = ActionUpdate & { user?: User };
type ActionAuditWithUser = ActionAudit & { user?: User };
type AttachmentWithUser = Attachment & { uploader?: User };

export default function ActionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const actionId = params.id as string;

  const { user, workstreams } = useAppStore();
  const { canEdit, canAdmin } = usePermission();
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<ActionWithRelations | null>(null);
  const [updates, setUpdates] = useState<ActionUpdateWithUser[]>([]);
  const [auditLog, setAuditLog] = useState<ActionAuditWithUser[]>([]);
  const [attachments, setAttachments] = useState<AttachmentWithUser[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Modal states
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  // Form states
  const [newUpdate, setNewUpdate] = useState('');
  const [submittingUpdate, setSubmittingUpdate] = useState(false);
  const [completionComment, setCompletionComment] = useState('');
  const [editForm, setEditForm] = useState<Partial<Action>>({});
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);

  const fetchAction = useCallback(async () => {
    const supabase = createClient();

    const { data: actionData, error } = await supabase
      .from('actions')
      .select(`
        *,
        owner:users!actions_owner_id_fkey(id, full_name, email, avatar_url),
        workstream:workstreams(id, name, color),
        creator:users!actions_created_by_fkey(id, full_name)
      `)
      .eq('id', actionId)
      .single();

    if (error || !actionData) {
      toast.error('Action not found');
      router.push('/actions');
      return;
    }

    setAction(actionData as unknown as ActionWithRelations);
    setEditForm(actionData);

    // Fetch updates
    const { data: updatesData } = await supabase
      .from('action_updates')
      .select(`
        *,
        user:users(id, full_name, avatar_url)
      `)
      .eq('action_id', actionId)
      .order('created_at', { ascending: false });

    if (updatesData) {
      setUpdates(updatesData as unknown as ActionUpdateWithUser[]);
    }

    // Fetch audit log
    const { data: auditData } = await supabase
      .from('action_audit')
      .select(`
        *,
        user:users(id, full_name)
      `)
      .eq('action_id', actionId)
      .order('created_at', { ascending: false });

    if (auditData) {
      setAuditLog(auditData as unknown as ActionAuditWithUser[]);
    }

    // Fetch attachments
    const { data: attachmentsData } = await supabase
      .from('attachments')
      .select(`
        *,
        uploader:users(id, full_name)
      `)
      .eq('entity_type', 'action')
      .eq('entity_id', actionId)
      .order('created_at', { ascending: false });

    if (attachmentsData) {
      setAttachments(attachmentsData as unknown as AttachmentWithUser[]);
    }

    // Fetch users for editing
    const { data: usersData } = await supabase
      .from('users')
      .select('*')
      .order('full_name');

    if (usersData) {
      setUsers(usersData as User[]);
    }

    setLoading(false);
  }, [actionId, router]);

  useEffect(() => {
    fetchAction();
  }, [fetchAction]);

  // Real-time updates disabled for stability
  // useRealtime({
  //   table: 'actions',
  //   filter: `id=eq.${actionId}`,
  //   onUpdate: () => fetchAction(),
  // });

  // useRealtime({
  //   table: 'action_updates',
  //   filter: `action_id=eq.${actionId}`,
  //   onInsert: () => fetchAction(),
  // });

  const handleAddUpdate = async () => {
    if (!newUpdate.trim()) return;

    setSubmittingUpdate(true);
    try {
      const supabase = createClient();

      const { error } = await supabase.from('action_updates').insert({
        action_id: actionId,
        user_id: user?.id,
        content: newUpdate.trim(),
      });

      if (error) throw error;

      setNewUpdate('');
      toast.success('Update added');
      fetchAction();
    } catch (error) {
      console.error('Error adding update:', error);
      toast.error('Failed to add update');
    } finally {
      setSubmittingUpdate(false);
    }
  };

  const handleStatusChange = async (newStatus: ActionStatus) => {
    try {
      const supabase = createClient();

      const updateData: Partial<Action> = { status: newStatus };

      if (newStatus === 'complete') {
        updateData.completed_at = new Date().toISOString();
        updateData.completion_comment = completionComment || undefined;
      }

      const { error } = await supabase
        .from('actions')
        .update(updateData)
        .eq('id', actionId);

      if (error) throw error;

      toast.success(`Status updated to ${newStatus.replace('_', ' ')}`);
      setCompleteModalOpen(false);
      fetchAction();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
  };

  const handleSaveEdit = async () => {
    try {
      const supabase = createClient();

      const { error } = await supabase
        .from('actions')
        .update({
          title: editForm.title,
          description: editForm.description,
          workstream_id: editForm.workstream_id,
          owner_id: editForm.owner_id,
          priority: editForm.priority,
          due_date: editForm.due_date,
        })
        .eq('id', actionId);

      if (error) throw error;

      toast.success('Action updated');
      setEditModalOpen(false);
      fetchAction();
    } catch (error) {
      console.error('Error updating action:', error);
      toast.error('Failed to update action');
    }
  };

  const handleDelete = async () => {
    try {
      const supabase = createClient();

      const { error } = await supabase
        .from('actions')
        .delete()
        .eq('id', actionId);

      if (error) throw error;

      toast.success('Action deleted');
      router.push('/actions');
    } catch (error) {
      console.error('Error deleting action:', error);
      toast.error('Failed to delete action');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const supabase = createClient();

      // Upload to storage
      const fileExt = file.name.split('.').pop();
      const filePath = `${user?.id}/${actionId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('attachments')
        .getPublicUrl(filePath);

      // Save attachment record
      const { error } = await supabase.from('attachments').insert({
        entity_type: 'action',
        entity_id: actionId,
        file_name: file.name,
        file_url: publicUrl,
        file_type: file.type,
        file_size: file.size,
        uploaded_by: user?.id,
      });

      if (error) throw error;

      toast.success('File uploaded');
      fetchAction();
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error('Failed to upload file');
    }
  };

  const handleBulkDownload = async () => {
    if (attachments.length === 0) return;
    setDownloading(true);
    setDownloadProgress(null);
    try {
      const zipName = `${action?.title?.replace(/[^a-zA-Z0-9]/g, '_') || 'attachments'}-files`;
      const result = await bulkDownloadAttachments(attachments, zipName, setDownloadProgress);
      if (result.failed === 0) {
        toast.success(`Downloaded ${result.succeeded} file${result.succeeded !== 1 ? 's' : ''}`);
      } else {
        toast.error(`Downloaded ${result.succeeded} of ${result.total} (${result.failed} failed)`);
      }
    } catch (error) {
      console.error('Bulk download failed:', error);
      toast.error('Failed to download files');
    } finally {
      setDownloading(false);
      setDownloadProgress(null);
    }
  };

  if (loading) {
    return <LoadingPage />;
  }

  if (!action) {
    return null;
  }

  const statusOptions = [
    { value: 'pending', label: 'Pending' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'complete', label: 'Complete' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  const priorityOptions = [
    { value: 'critical', label: 'Critical' },
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' },
  ];

  const workstreamOptions = workstreams.map(w => ({ value: w.id, label: w.name }));
  const userOptions = [
    { value: '', label: 'Unassigned' },
    ...users.map(u => ({ value: u.id, label: u.full_name })),
  ];

  return (
    <div className="min-h-screen">
      <Header
        title={action.title}
        subtitle={action.workstream?.name}
        actions={
          <div className="flex gap-2">
            {canEdit && (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditModalOpen(true)}>
                  <PencilIcon className="w-4 h-4 mr-2" />
                  Edit
                </Button>
                {action.status !== 'complete' && action.status !== 'cancelled' && (
                  <Button size="sm" onClick={() => setCompleteModalOpen(true)}>
                    <CheckCircleIcon className="w-4 h-4 mr-2" />
                    Complete
                  </Button>
                )}
              </>
            )}
            {canAdmin && (
              <Button variant="danger" size="sm" onClick={() => setDeleteModalOpen(true)}>
                <TrashIcon className="w-4 h-4" />
              </Button>
            )}
          </div>
        }
      />

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Action Details */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <StatusBadge status={action.status} />
                  <PriorityBadge priority={action.priority} />
                </div>
                {action.workstream && (
                  <span
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium"
                    style={{
                      backgroundColor: `${action.workstream.color}20`,
                      color: action.workstream.color,
                    }}
                  >
                    {action.workstream.name}
                  </span>
                )}
              </div>

              {action.description && (
                <div className="prose prose-sm max-w-none text-gray-700 mb-6">
                  {action.description}
                </div>
              )}

              {action.completion_comment && action.status === 'complete' && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                  <h4 className="text-sm font-medium text-green-800 mb-1">Completion Note</h4>
                  <p className="text-sm text-green-700">{action.completion_comment}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Owner</span>
                  <div className="flex items-center gap-2 mt-1">
                    {action.owner ? (
                      <>
                        <Avatar src={action.owner.avatar_url} name={action.owner.full_name} size="sm" />
                        <span className="font-medium">{action.owner.full_name}</span>
                      </>
                    ) : (
                      <span className="text-gray-400">Unassigned</span>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-gray-500">Due Date</span>
                  <p className={cn(
                    'mt-1 font-medium',
                    action.due_date && new Date(action.due_date) < new Date() && action.status !== 'complete'
                      ? 'text-red-600'
                      : 'text-gray-900'
                  )}>
                    {action.due_date ? formatDate(action.due_date) : 'No due date'}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Created</span>
                  <p className="mt-1 font-medium text-gray-900">
                    {formatDate(action.created_at)} by {action.creator?.full_name}
                  </p>
                </div>
                {action.completed_at && (
                  <div>
                    <span className="text-gray-500">Completed</span>
                    <p className="mt-1 font-medium text-gray-900">
                      {formatDate(action.completed_at)}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Updates */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ChatBubbleLeftIcon className="w-5 h-5 text-gray-400" />
                Updates ({updates.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {canEdit && (
                <div className="mb-4">
                  <Textarea
                    placeholder="Add an update..."
                    value={newUpdate}
                    onChange={(e) => setNewUpdate(e.target.value)}
                    rows={3}
                  />
                  <div className="flex justify-end mt-2">
                    <Button
                      size="sm"
                      onClick={handleAddUpdate}
                      disabled={!newUpdate.trim() || submittingUpdate}
                      loading={submittingUpdate}
                    >
                      Post Update
                    </Button>
                  </div>
                </div>
              )}

              {updates.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No updates yet</p>
              ) : (
                <div className="space-y-4">
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
                        <p className="text-sm text-gray-700 mt-1">{update.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Attachments */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <PaperClipIcon className="w-5 h-5 text-gray-400" />
                  Attachments ({attachments.length})
                </CardTitle>
                {attachments.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBulkDownload}
                    disabled={downloading}
                    loading={downloading}
                  >
                    <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
                    {downloading ? 'Downloading...' : 'Download All'}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {downloadProgress && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-600">
                      {downloadProgress.phase === 'zipping'
                        ? 'Creating zip...'
                        : `${downloadProgress.completed}/${downloadProgress.total} files`}
                    </span>
                    {downloadProgress.failed > 0 && (
                      <span className="text-xs text-red-600">{downloadProgress.failed} failed</span>
                    )}
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div
                      className="bg-red-600 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${Math.round((downloadProgress.completed / downloadProgress.total) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
              {canEdit && (
                <div className="mb-4">
                  <label className="block">
                    <span className="sr-only">Choose file</span>
                    <input
                      type="file"
                      onChange={handleFileUpload}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-red-50 file:text-red-700 hover:file:bg-red-100"
                    />
                  </label>
                </div>
              )}

              {attachments.length === 0 ? (
                <p className="text-center text-gray-500 py-4">No attachments</p>
              ) : (
                <div className="space-y-2">
                  {attachments.map((attachment) => (
                    <a
                      key={attachment.id}
                      href={attachment.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50"
                    >
                      <DocumentArrowDownIcon className="w-5 h-5 text-gray-400" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {attachment.file_name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {(attachment.file_size / 1024).toFixed(1)} KB - {attachment.uploader?.full_name}
                        </p>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Audit Trail */}
        <div className="space-y-6">
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
                        {formatAuditChange(entry)}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {getRelativeTime(entry.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          {canEdit && action.status !== 'complete' && action.status !== 'cancelled' && (
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {action.status === 'pending' && (
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => handleStatusChange('in_progress')}
                  >
                    <ClockIcon className="w-4 h-4 mr-2" />
                    Start Working
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="w-full justify-start text-red-600 hover:bg-red-50"
                  onClick={() => handleStatusChange('cancelled')}
                >
                  <XCircleIcon className="w-4 h-4 mr-2" />
                  Cancel Action
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      <Modal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Action"
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
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Status"
              options={statusOptions}
              value={editForm.status || 'pending'}
              onChange={(value) => setEditForm({ ...editForm, status: value as ActionStatus })}
            />
            <Select
              label="Priority"
              options={priorityOptions}
              value={editForm.priority || 'medium'}
              onChange={(value) => setEditForm({ ...editForm, priority: value as Priority })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Workstream"
              options={workstreamOptions}
              value={editForm.workstream_id || ''}
              onChange={(value) => setEditForm({ ...editForm, workstream_id: value })}
            />
            <Select
              label="Owner"
              options={userOptions}
              value={editForm.owner_id || ''}
              onChange={(value) => setEditForm({ ...editForm, owner_id: value })}
            />
          </div>
          <Input
            label="Due Date"
            type="date"
            value={editForm.due_date ? new Date(editForm.due_date).toISOString().slice(0, 10) : ''}
            onChange={(e) => setEditForm({ ...editForm, due_date: e.target.value })}
          />
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => setEditModalOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSaveEdit}>Save Changes</Button>
        </div>
      </Modal>

      {/* Complete Modal */}
      <Modal
        open={completeModalOpen}
        onClose={() => setCompleteModalOpen(false)}
        title="Complete Action"
      >
        <p className="text-gray-600 mb-4">
          Mark this action as complete. You can optionally add a completion note.
        </p>
        <Textarea
          label="Completion Note (Optional)"
          value={completionComment}
          onChange={(e) => setCompletionComment(e.target.value)}
          placeholder="Add any final notes..."
          rows={3}
        />
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => setCompleteModalOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => handleStatusChange('complete')}>
            <CheckCircleIcon className="w-4 h-4 mr-2" />
            Mark Complete
          </Button>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete Action"
      >
        <p className="text-gray-600 mb-4">
          Are you sure you want to delete this action? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            <TrashIcon className="w-4 h-4 mr-2" />
            Delete Action
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function formatAuditChange(entry: ActionAuditWithUser): string {
  switch (entry.change_type) {
    case 'created':
      return `created this action`;
    case 'status_changed':
      return `changed status from ${entry.old_value} to ${entry.new_value}`;
    case 'owner_changed':
      return `changed the owner`;
    case 'priority_changed':
      return `changed priority from ${entry.old_value} to ${entry.new_value}`;
    case 'due_date_changed':
      return `changed the due date`;
    default:
      return `made changes`;
  }
}
