'use client';

import { useEffect, useState, useCallback, Suspense, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
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
  ArrowUpTrayIcon,
  TableCellsIcon,
  Squares2X2Icon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
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
  const router = useRouter();
  const { workstreams, user } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState<ActionWithRelations[]>([]);
  const [filteredActions, setFilteredActions] = useState<ActionWithRelations[]>([]);

  // View mode (cards or table)
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Upload modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<{ success: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResults(null);

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());

      if (lines.length < 2) {
        toast.error('File must have a header row and at least one data row');
        setUploading(false);
        return;
      }

      // Parse CSV header
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));

      // Map column names to our fields
      const columnMap: Record<string, string> = {
        'title': 'title',
        'name': 'title',
        'action': 'title',
        'description': 'description',
        'details': 'description',
        'priority': 'priority',
        'status': 'status',
        'workstream': 'workstream',
        'owner': 'owner',
        'assignee': 'owner',
        'assigned to': 'owner',
        'due date': 'due_date',
        'due': 'due_date',
        'deadline': 'due_date',
      };

      const fieldIndexes: Record<string, number> = {};
      headers.forEach((h, i) => {
        const mapped = columnMap[h];
        if (mapped) fieldIndexes[mapped] = i;
      });

      if (fieldIndexes['title'] === undefined) {
        toast.error('File must have a Title column');
        setUploading(false);
        return;
      }

      const supabase = createClient();
      const results = { success: 0, errors: [] as string[] };

      // Get users for owner mapping
      const { data: users } = await supabase.from('users').select('id, full_name, email');
      const userMap = new Map<string, string>();
      users?.forEach(u => {
        userMap.set(u.full_name.toLowerCase(), u.id);
        userMap.set(u.email.toLowerCase(), u.id);
      });

      // Get workstreams for mapping
      const workstreamMap = new Map<string, string>();
      workstreams.forEach(w => {
        workstreamMap.set(w.name.toLowerCase(), w.id);
      });

      // Process each row
      for (let i = 1; i < lines.length; i++) {
        const row = parseCSVLine(lines[i]);
        if (row.length === 0) continue;

        const getValue = (field: string) => {
          const idx = fieldIndexes[field];
          return idx !== undefined ? row[idx]?.trim().replace(/"/g, '') : undefined;
        };

        const title = getValue('title');
        if (!title) {
          results.errors.push(`Row ${i + 1}: Missing title`);
          continue;
        }

        // Map priority
        let priority: Priority = 'medium';
        const priorityValue = getValue('priority')?.toLowerCase();
        if (priorityValue && ['critical', 'high', 'medium', 'low'].includes(priorityValue)) {
          priority = priorityValue as Priority;
        }

        // Map status
        let status: ActionStatus = 'pending';
        const statusValue = getValue('status')?.toLowerCase().replace(/\s+/g, '_');
        if (statusValue && ['pending', 'in_progress', 'complete', 'cancelled'].includes(statusValue)) {
          status = statusValue as ActionStatus;
        }

        // Map workstream
        let workstream_id: string | null = null;
        const workstreamValue = getValue('workstream')?.toLowerCase();
        if (workstreamValue && workstreamMap.has(workstreamValue)) {
          workstream_id = workstreamMap.get(workstreamValue)!;
        }

        // Map owner
        let owner_id: string | null = null;
        const ownerValue = getValue('owner')?.toLowerCase();
        if (ownerValue && userMap.has(ownerValue)) {
          owner_id = userMap.get(ownerValue)!;
        }

        // Parse due date
        let due_date: string | null = null;
        const dueDateValue = getValue('due_date');
        if (dueDateValue) {
          const parsed = new Date(dueDateValue);
          if (!isNaN(parsed.getTime())) {
            due_date = parsed.toISOString();
          }
        }

        const { error } = await supabase.from('actions').insert({
          title,
          description: getValue('description') || null,
          priority,
          status,
          workstream_id,
          owner_id,
          due_date,
          created_by: user?.id,
        });

        if (error) {
          results.errors.push(`Row ${i + 1}: ${error.message}`);
        } else {
          results.success++;
        }
      }

      setUploadResults(results);

      if (results.success > 0) {
        toast.success(`Successfully imported ${results.success} action${results.success !== 1 ? 's' : ''}`);
        fetchActions(); // Refresh the list
      }

      if (results.errors.length > 0) {
        toast.error(`${results.errors.length} row${results.errors.length !== 1 ? 's' : ''} failed to import`);
      }
    } catch (err) {
      console.error('Upload error:', err);
      toast.error('Failed to process file');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Parse CSV line handling quoted values
  function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }

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
          <div className="flex items-center gap-2">
            {/* View Toggle */}
            <div className="flex rounded-lg border border-gray-200 p-1">
              <button
                onClick={() => setViewMode('cards')}
                className={`p-1.5 rounded transition-colors ${
                  viewMode === 'cards' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
                }`}
                title="Card View"
              >
                <Squares2X2Icon className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded transition-colors ${
                  viewMode === 'table' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
                }`}
                title="Table View"
              >
                <TableCellsIcon className="w-4 h-4" />
              </button>
            </div>

            <Button variant="outline" size="sm" onClick={() => setShowUploadModal(true)}>
              <ArrowUpTrayIcon className="w-4 h-4 mr-2" />
              Import
            </Button>
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
        ) : viewMode === 'cards' ? (
          <div className="space-y-3">
            {filteredActions.map((action) => (
              <ActionCard key={action.id} action={action} />
            ))}
          </div>
        ) : (
          <ActionsTable actions={filteredActions} />
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowUploadModal(false)} />
          <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Import Actions from CSV</h2>
              <button
                onClick={() => setShowUploadModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Upload a CSV file to import multiple actions at once. The file should have column headers.
              </p>

              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-900 mb-2">Supported Columns</h3>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li><strong>Title</strong> (required): Title, Name, or Action</li>
                  <li><strong>Description</strong>: Description or Details</li>
                  <li><strong>Priority</strong>: Critical, High, Medium, Low</li>
                  <li><strong>Status</strong>: Pending, In Progress, Complete, Cancelled</li>
                  <li><strong>Workstream</strong>: Must match existing workstream name</li>
                  <li><strong>Owner</strong>: User&apos;s full name or email</li>
                  <li><strong>Due Date</strong>: Due Date, Due, or Deadline (any date format)</li>
                </ul>
                <a
                  href="/templates/actions-import-template.csv"
                  download
                  className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-700 mt-3"
                >
                  <ArrowDownTrayIcon className="w-4 h-4" />
                  Download template
                </a>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />

              {uploadResults && (
                <div className={cn(
                  'rounded-lg p-4',
                  uploadResults.errors.length > 0 ? 'bg-amber-50' : 'bg-green-50'
                )}>
                  <div className="flex items-center gap-2 mb-2">
                    {uploadResults.errors.length > 0 ? (
                      <ExclamationCircleIcon className="w-5 h-5 text-amber-500" />
                    ) : (
                      <CheckCircleIcon className="w-5 h-5 text-green-500" />
                    )}
                    <span className="font-medium">
                      {uploadResults.success} action{uploadResults.success !== 1 ? 's' : ''} imported
                    </span>
                  </div>
                  {uploadResults.errors.length > 0 && (
                    <div className="mt-2">
                      <p className="text-sm font-medium text-amber-800 mb-1">Errors:</p>
                      <ul className="text-sm text-amber-700 max-h-32 overflow-y-auto space-y-0.5">
                        {uploadResults.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowUploadModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <>
                      <LoadingSpinner size="sm" className="mr-2" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <ArrowUpTrayIcon className="w-4 h-4 mr-2" />
                      Select File
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
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

function ActionsTable({ actions }: { actions: ActionWithRelations[] }) {
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                Title
              </th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                Status
              </th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                Priority
              </th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                Workstream
              </th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                Owner
              </th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                Due Date
              </th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                Created
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {actions.map((action) => {
              const overdue = action.due_date && isOverdue(action.due_date) && action.status !== 'complete' && action.status !== 'cancelled';

              return (
                <tr
                  key={action.id}
                  className={cn(
                    'hover:bg-gray-50 cursor-pointer transition-colors',
                    overdue && 'bg-red-50/50'
                  )}
                  onClick={() => window.location.href = `/actions/${action.id}`}
                >
                  <td className="px-4 py-3">
                    <div className="max-w-xs">
                      <p className="text-sm font-medium text-gray-900 truncate">{action.title}</p>
                      {action.description && (
                        <p className="text-xs text-gray-500 truncate mt-0.5">{action.description}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={action.status} />
                  </td>
                  <td className="px-4 py-3">
                    <PriorityBadge priority={action.priority} />
                  </td>
                  <td className="px-4 py-3">
                    {action.workstream ? (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                        style={{
                          backgroundColor: `${action.workstream.color}20`,
                          color: action.workstream.color,
                        }}
                      >
                        {action.workstream.name}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {action.owner ? (
                      <div className="flex items-center gap-2">
                        <Avatar src={action.owner.avatar_url} name={action.owner.full_name} size="xs" />
                        <span className="text-sm text-gray-700">{action.owner.full_name}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {action.due_date ? (
                      <span className={cn(
                        'text-sm',
                        overdue ? 'text-red-600 font-medium' : 'text-gray-700'
                      )}>
                        {formatDate(action.due_date, { month: 'short', day: 'numeric' })}
                        {overdue && ' (Overdue)'}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-500">
                      {formatDate(action.created_at, { month: 'short', day: 'numeric' })}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
