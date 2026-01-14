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
import { formatDate, getRelativeTime, cn, buildWorkstreamOptions, getWorkstreamDisplayName } from '@/lib/utils';
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
  ChevronLeftIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { RiskBadge } from '@/components/ui/badge';
import type { Action, ActionUpdate, ActionAudit, Workstream, User, Attachment, ActionStatus, Priority, Threat } from '@/types/database';

type ActionWithRelations = Action & {
  owner?: User;
  workstream?: Workstream;
  creator?: User;
};

type ActionUpdateWithUser = ActionUpdate & { user?: User };
type ActionAuditWithUser = ActionAudit & { user?: User };
type AttachmentWithUser = Attachment & { uploader?: User };
type LinkedThreat = Threat & { workstream?: Workstream };

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
  const [relatedThreats, setRelatedThreats] = useState<LinkedThreat[]>([]);

  // Navigation through actions
  const [allActionIds, setAllActionIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  // Modal states
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  // Form states
  const [newUpdate, setNewUpdate] = useState('');
  const [submittingUpdate, setSubmittingUpdate] = useState(false);
  const [completionComment, setCompletionComment] = useState('');
  const [editForm, setEditForm] = useState<Partial<Action>>({});

  // Admin import comment form
  const [adminCommentUser, setAdminCommentUser] = useState('');
  const [adminCommentDate, setAdminCommentDate] = useState('');
  const [adminCommentContent, setAdminCommentContent] = useState('');
  const [submittingAdminComment, setSubmittingAdminComment] = useState(false);

  // Admin edit created date
  const [editingCreatedDate, setEditingCreatedDate] = useState(false);
  const [newCreatedDate, setNewCreatedDate] = useState('');

  // Toggle for admin-only features
  const [showAdminFeatures, setShowAdminFeatures] = useState(false);

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
      .order('created_at', { ascending: true });

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

    // Fetch related threats via threat_action_links
    const { data: threatLinksData } = await supabase
      .from('threat_action_links')
      .select(`
        threat:threats(
          id, title, status, current_risk, description,
          workstream:workstreams(id, name, color)
        )
      `)
      .eq('action_id', actionId);

    if (threatLinksData) {
      const threats = threatLinksData
        .map((link: { threat: LinkedThreat }) => link.threat)
        .filter((threat: LinkedThreat | null): threat is LinkedThreat => threat !== null);
      setRelatedThreats(threats);
    }

    setLoading(false);
  }, [actionId, router]);

  useEffect(() => {
    fetchAction();
  }, [fetchAction]);

  // Fetch all action IDs for navigation
  useEffect(() => {
    const fetchActionIds = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('actions')
        .select('id')
        .order('created_at', { ascending: false });

      if (data) {
        const ids = data.map(a => a.id);
        setAllActionIds(ids);
        setCurrentIndex(ids.indexOf(actionId));
      }
    };
    fetchActionIds();
  }, [actionId]);

  const goToPrevious = () => {
    if (currentIndex > 0) {
      router.push(`/actions/${allActionIds[currentIndex - 1]}`);
    }
  };

  const goToNext = () => {
    if (currentIndex < allActionIds.length - 1) {
      router.push(`/actions/${allActionIds[currentIndex + 1]}`);
    }
  };

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

  // Admin-only: Add comment as a different user with custom date
  const handleAddAdminComment = async () => {
    if (!adminCommentContent.trim()) {
      toast.error('Comment content is required');
      return;
    }

    if (!canAdmin) {
      toast.error('Admin permission required');
      return;
    }

    setSubmittingAdminComment(true);
    try {
      const supabase = createClient();

      // Use System user if no user selected
      const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
      const selectedUserId = adminCommentUser || SYSTEM_USER_ID;

      // Build insert data - mark as legacy import to hide date
      const insertData: Record<string, unknown> = {
        action_id: actionId,
        user_id: selectedUserId,
        content: adminCommentContent.trim(),
        is_legacy_import: true,
      };

      // If a custom date is set, add it
      if (adminCommentDate) {
        insertData.created_at = new Date(adminCommentDate).toISOString();
      }

      const { error } = await supabase.from('action_updates').insert(insertData);

      if (error) throw error;

      // Reset form
      setAdminCommentUser('');
      setAdminCommentDate('');
      setAdminCommentContent('');
      toast.success('Comment imported successfully');
      fetchAction();
    } catch (error) {
      console.error('Error adding admin comment:', error);
      toast.error('Failed to import comment');
    } finally {
      setSubmittingAdminComment(false);
    }
  };

  // Admin-only: Update created date
  const handleUpdateCreatedDate = async () => {
    if (!newCreatedDate || !canAdmin) return;

    try {
      const supabase = createClient();

      const { error } = await supabase
        .from('actions')
        .update({ created_at: new Date(newCreatedDate).toISOString() })
        .eq('id', actionId);

      if (error) throw error;

      toast.success('Created date updated');
      setEditingCreatedDate(false);
      setNewCreatedDate('');
      fetchAction();
    } catch (error) {
      console.error('Error updating created date:', error);
      toast.error('Failed to update created date');
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

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header
          breadcrumbs={[
            { label: 'Actions', href: '/actions' },
            { label: 'Loading...' },
          ]}
        />
        <div className="p-6 flex items-center justify-center h-64">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
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

  const workstreamOptions = buildWorkstreamOptions(workstreams, {
    includeAll: false,
    excludeParentsWithChildren: true,
    mapOption: (ws) => ({
      icon: <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ws.color }} />,
    }),
  });
  const userOptions = [
    { value: '', label: 'Unassigned' },
    ...users.map(u => ({ value: u.id, label: u.full_name })),
  ];

  return (
    <div className="min-h-screen">
      <Header
        breadcrumbs={[
          { label: 'Actions', href: '/actions' },
          { label: action.title },
        ]}
      />

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Action Details */}
          <Card>
            <CardContent className="pt-6">
              {/* Title and Actions Row */}
              <div className="flex items-start justify-between gap-4 mb-4">
                <h1 className="text-2xl font-bold text-gray-900">{action.title}</h1>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Navigation */}
                  {allActionIds.length > 1 && (
                    <div className="flex items-center gap-1 mr-2">
                      <button
                        onClick={goToPrevious}
                        disabled={currentIndex <= 0}
                        className={cn(
                          'p-1.5 rounded-lg transition-colors',
                          currentIndex > 0
                            ? 'text-gray-600 hover:bg-gray-100'
                            : 'text-gray-300 cursor-not-allowed'
                        )}
                        title="Previous action"
                      >
                        <ChevronLeftIcon className="w-5 h-5" />
                      </button>
                      <span className="text-xs text-gray-500 min-w-[4rem] text-center">
                        {currentIndex + 1} / {allActionIds.length}
                      </span>
                      <button
                        onClick={goToNext}
                        disabled={currentIndex >= allActionIds.length - 1}
                        className={cn(
                          'p-1.5 rounded-lg transition-colors',
                          currentIndex < allActionIds.length - 1
                            ? 'text-gray-600 hover:bg-gray-100'
                            : 'text-gray-300 cursor-not-allowed'
                        )}
                        title="Next action"
                      >
                        <ChevronRightIcon className="w-5 h-5" />
                      </button>
                    </div>
                  )}

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
                  {canAdmin && showAdminFeatures && (
                    <Button variant="danger" size="sm" onClick={() => setDeleteModalOpen(true)}>
                      <TrashIcon className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Status Badges Row */}
              <div className="flex items-center flex-wrap gap-2 mb-6">
                <StatusBadge status={action.status} />
                <PriorityBadge priority={action.priority} />
                {action.workstream && (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{
                      backgroundColor: `${action.workstream.color}20`,
                      color: action.workstream.color,
                    }}
                  >
                    {getWorkstreamDisplayName(action.workstream, workstreams)}
                  </span>
                )}
              </div>

              {/* Description Section */}
              {action.description && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Description</h3>
                  <div className="prose prose-sm max-w-none text-gray-700">
                    {action.description}
                  </div>
                </div>
              )}

              {/* Completion Note */}
              {action.completion_comment && action.status === 'complete' && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                  <h4 className="text-sm font-medium text-green-800 mb-1">Completion Note</h4>
                  <p className="text-sm text-green-700">{action.completion_comment}</p>
                </div>
              )}

              {/* Details Grid */}
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
                  {canAdmin && showAdminFeatures && editingCreatedDate ? (
                    <div className="mt-1 flex items-center gap-2">
                      <Input
                        type="datetime-local"
                        value={newCreatedDate}
                        onChange={(e) => setNewCreatedDate(e.target.value)}
                        className="text-sm"
                      />
                      <Button size="sm" onClick={handleUpdateCreatedDate}>
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => {
                        setEditingCreatedDate(false);
                        setNewCreatedDate('');
                      }}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <p className="mt-1 font-medium text-gray-900">
                      {formatDate(action.created_at)} by {action.creator?.full_name}
                      {canAdmin && showAdminFeatures && (
                        <button
                          onClick={() => {
                            setEditingCreatedDate(true);
                            setNewCreatedDate(new Date(action.created_at).toISOString().slice(0, 16));
                          }}
                          className="ml-2 text-xs text-gray-400 hover:text-gray-600"
                        >
                          (edit)
                        </button>
                      )}
                    </p>
                  )}
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
            <CardHeader
              actions={
                canAdmin && (
                  <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showAdminFeatures}
                      onChange={(e) => setShowAdminFeatures(e.target.checked)}
                      className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                    />
                    Admin tools
                  </label>
                )
              }
            >
              <CardTitle className="flex items-center gap-2">
                <ChatBubbleLeftIcon className="w-5 h-5 text-gray-400" />
                Updates ({updates.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {updates.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No updates yet</p>
              ) : (
                <div className="space-y-4 mb-4">
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
                          {!update.is_legacy_import && (
                            <span className="text-xs text-gray-500">
                              {getRelativeTime(update.created_at)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-700 mt-1">{update.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {canEdit && (
                <div className="pt-4 border-t border-gray-200">
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

              {/* Admin-only: Import comments with custom user/date */}
              {canAdmin && showAdminFeatures && (
                <div className="mt-6 p-4 border border-dashed border-gray-300 rounded-lg bg-gray-50">
                  <p className="text-sm font-medium text-gray-700 mb-3">
                    Admin: Import Legacy Comment
                  </p>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Select
                        label="User (defaults to System)"
                        options={[
                          { value: '', label: 'System (default)' },
                          ...users.filter(u => u.id !== '00000000-0000-0000-0000-000000000000').map(u => ({ value: u.id, label: u.full_name })),
                        ]}
                        value={adminCommentUser}
                        onChange={setAdminCommentUser}
                      />
                      <Input
                        label="Date (optional)"
                        type="datetime-local"
                        value={adminCommentDate}
                        onChange={(e) => setAdminCommentDate(e.target.value)}
                      />
                    </div>
                    <Textarea
                      label="Comment"
                      placeholder="Paste legacy comment..."
                      value={adminCommentContent}
                      onChange={(e) => setAdminCommentContent(e.target.value)}
                      rows={3}
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleAddAdminComment}
                        disabled={!adminCommentContent.trim() || submittingAdminComment}
                        loading={submittingAdminComment}
                      >
                        Import Comment
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Attachments */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PaperClipIcon className="w-5 h-5 text-gray-400" />
                Attachments ({attachments.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
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

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Related Threats */}
          {relatedThreats.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ExclamationTriangleIcon className="w-5 h-5 text-gray-400" />
                  Related Threats ({relatedThreats.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {relatedThreats.map((threat) => (
                    <a
                      key={threat.id}
                      href={`/threats/${threat.id}`}
                      className="block p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {threat.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <RiskBadge risk={threat.current_risk} />
                        {threat.status === 'closed' ? (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-800">
                            Closed
                          </span>
                        ) : (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800">
                            Open
                          </span>
                        )}
                      </div>
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Audit Trail */}
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
                        {getRelativeTime(entry.change_type === 'created' ? action.created_at : entry.created_at)}
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
  const formatValue = (value: string | null | undefined, type: string) => {
    if (!value || value === 'null') return 'none';
    if (type === 'status') return value.replace('_', ' ');
    if (type === 'date') {
      try {
        return formatDate(value, { month: 'short', day: 'numeric', year: 'numeric' });
      } catch {
        return value;
      }
    }
    return value;
  };

  switch (entry.change_type) {
    case 'created':
      return 'created this action';
    case 'status_changed':
      return `changed status from "${formatValue(entry.old_value, 'status')}" to "${formatValue(entry.new_value, 'status')}"`;
    case 'owner_changed':
      return `reassigned owner from "${formatValue(entry.old_value, 'text')}" to "${formatValue(entry.new_value, 'text')}"`;
    case 'priority_changed':
      return `changed priority from "${formatValue(entry.old_value, 'text')}" to "${formatValue(entry.new_value, 'text')}"`;
    case 'due_date_changed':
      return `changed due date from "${formatValue(entry.old_value, 'date')}" to "${formatValue(entry.new_value, 'date')}"`;
    case 'title_changed':
      return `changed title from "${entry.old_value}" to "${entry.new_value}"`;
    case 'description_changed':
      return 'updated the description';
    case 'workstream_changed':
      return `moved from "${formatValue(entry.old_value, 'text')}" to "${formatValue(entry.new_value, 'text')}"`;
    default:
      return 'made changes';
  }
}
