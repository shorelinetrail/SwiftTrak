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
import { Select, MultiSelect } from '@/components/ui/select';
import { StatusBadge, PriorityBadge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Tabs } from '@/components/ui/tabs';
import { LoadingSpinner } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, isOverdue, getDaysUntil, cn, buildWorkstreamOptions } from '@/lib/utils';
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
  ChevronUpIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import type { Action, Workstream, User, ActionStatus, Priority } from '@/types/database';

type ActionWithRelations = Action & {
  owner?: User;
  workstream?: Workstream;
  creator?: User;
};

type SortColumn = 'title' | 'status' | 'priority' | 'workstream' | 'owner' | 'due_date' | 'created_at';
type SortDirection = 'asc' | 'desc';

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

  // View mode (cards or table) - default to table
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');

  // Upload modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<{ success: number; errors: string[]; warnings: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Filters (arrays for multi-select)
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [workstreamFilter, setWorkstreamFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState('all');

  // Sorting
  const [sortColumn, setSortColumn] = useState<SortColumn>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

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

  // Apply filters and sorting
  useEffect(() => {
    let filtered = [...actions];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(a =>
        a.title.toLowerCase().includes(query) ||
        a.description?.toLowerCase().includes(query) ||
        a.owner?.full_name?.toLowerCase().includes(query) ||
        a.workstream?.name?.toLowerCase().includes(query)
      );
    }

    if (statusFilter.length > 0) {
      filtered = filtered.filter(a => statusFilter.includes(a.status));
    }

    if (workstreamFilter.length > 0) {
      filtered = filtered.filter(a => a.workstream_id && workstreamFilter.includes(a.workstream_id));
    }

    if (priorityFilter.length > 0) {
      filtered = filtered.filter(a => a.priority && priorityFilter.includes(a.priority));
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

    // Apply sorting
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const statusOrder = { pending: 0, in_progress: 1, complete: 2, cancelled: 3 };

    filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortColumn) {
        case 'title':
          comparison = (a.title || '').localeCompare(b.title || '');
          break;
        case 'status':
          comparison = (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4);
          break;
        case 'priority':
          const aPriority = a.priority ? priorityOrder[a.priority] : 5;
          const bPriority = b.priority ? priorityOrder[b.priority] : 5;
          comparison = aPriority - bPriority;
          break;
        case 'workstream':
          comparison = (a.workstream?.name || '').localeCompare(b.workstream?.name || '');
          break;
        case 'owner':
          comparison = (a.owner?.full_name || '').localeCompare(b.owner?.full_name || '');
          break;
        case 'due_date':
          const aDate = a.due_date ? new Date(a.due_date).getTime() : Infinity;
          const bDate = b.due_date ? new Date(b.due_date).getTime() : Infinity;
          comparison = aDate - bDate;
          break;
        case 'created_at':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    setFilteredActions(filtered);
  }, [actions, searchQuery, statusFilter, workstreamFilter, priorityFilter, activeTab, user, sortColumn, sortDirection]);

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

  const workstreamOptions = buildWorkstreamOptions(workstreams, { includeAll: false });

  const handleExport = () => {
    const params = new URLSearchParams();
    if (statusFilter.length > 0) params.set('status', statusFilter.join(','));
    if (workstreamFilter.length > 0) params.set('workstream', workstreamFilter.join(','));
    if (priorityFilter.length > 0) params.set('priority', priorityFilter.join(','));
    window.location.href = `/api/export/actions?${params.toString()}`;
  };

  const hasActiveFilters = searchQuery.trim() || statusFilter.length > 0 || priorityFilter.length > 0 || workstreamFilter.length > 0;

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
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
        'date created': 'created_at',
        'created': 'created_at',
        'created date': 'created_at',
        'date closed': 'completed_at',
        'closed': 'completed_at',
        'completed': 'completed_at',
        'completion date': 'completed_at',
        'created by': 'created_by',
        'creator': 'created_by',
        'initial comment': 'initial_comment',
        'comment': 'initial_comment',
        'comments': 'initial_comment',
        'notes': 'initial_comment',
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
      const results = { success: 0, errors: [] as string[], warnings: [] as string[] };

      // Get users for owner mapping - map by email (primary) and full name
      const { data: users } = await supabase.from('users').select('id, full_name, email');
      const userByEmail = new Map<string, { id: string; name: string }>();
      const userByName = new Map<string, { id: string; email: string }>();
      users?.forEach(u => {
        userByEmail.set(u.email.toLowerCase(), { id: u.id, name: u.full_name });
        userByName.set(u.full_name.toLowerCase(), { id: u.id, email: u.email });
      });

      // Get workstreams for mapping - support both name and Parent/Child format
      const workstreamMap = new Map<string, string>();
      const workstreamById = new Map<string, Workstream>();
      workstreams.forEach(w => {
        workstreamMap.set(w.name.toLowerCase(), w.id);
        workstreamById.set(w.id, w);
      });
      // Add Parent/Child format mappings
      workstreams.forEach(w => {
        if (w.parent_id) {
          const parent = workstreamById.get(w.parent_id);
          if (parent) {
            workstreamMap.set(`${parent.name.toLowerCase()}/${w.name.toLowerCase()}`, w.id);
          }
        }
      });

      // Track unmatched owners for summary
      const unmatchedOwners = new Set<string>();

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

        // Map priority (optional - can be null)
        let priority: Priority | null = null;
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

        // Map owner - try email first, then name
        let owner_id: string | null = null;
        const ownerValue = getValue('owner');
        if (ownerValue) {
          const ownerLower = ownerValue.toLowerCase();
          // Try email match first (most reliable)
          if (userByEmail.has(ownerLower)) {
            owner_id = userByEmail.get(ownerLower)!.id;
          }
          // Try name match
          else if (userByName.has(ownerLower)) {
            owner_id = userByName.get(ownerLower)!.id;
          }
          // No match found
          else {
            unmatchedOwners.add(ownerValue);
            results.warnings.push(`Row ${i + 1}: Owner "${ownerValue}" not found - action created without owner`);
          }
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

        // Parse created date (for historical imports)
        let created_at: string | null = null;
        const createdAtValue = getValue('created_at');
        if (createdAtValue) {
          const parsed = new Date(createdAtValue);
          if (!isNaN(parsed.getTime())) {
            created_at = parsed.toISOString();
          }
        }

        // Parse completed date (for closed actions)
        let completed_at: string | null = null;
        const completedAtValue = getValue('completed_at');
        if (completedAtValue) {
          const parsed = new Date(completedAtValue);
          if (!isNaN(parsed.getTime())) {
            completed_at = parsed.toISOString();
            // Auto-set status to complete if date closed is provided
            if (status === 'pending') {
              status = 'complete';
            }
          }
        }

        // Map created_by - try user lookup, default to System
        const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
        let created_by_id: string = user?.id || SYSTEM_USER_ID;
        const createdByValue = getValue('created_by');
        if (createdByValue) {
          const createdByLower = createdByValue.toLowerCase();
          if (createdByLower === 'system') {
            created_by_id = SYSTEM_USER_ID;
          } else if (userByEmail.has(createdByLower)) {
            created_by_id = userByEmail.get(createdByLower)!.id;
          } else if (userByName.has(createdByLower)) {
            created_by_id = userByName.get(createdByLower)!.id;
          } else {
            results.warnings.push(`Row ${i + 1}: Creator "${createdByValue}" not found - using current user`);
          }
        }

        // Get initial comment for legacy import
        const initialComment = getValue('initial_comment');

        // Build insert data
        const insertData: Record<string, unknown> = {
          title,
          description: getValue('description') || null,
          priority,
          status,
          workstream_id,
          owner_id,
          due_date,
          completed_at,
          created_by: created_by_id,
        };

        // Add custom created_at for historical imports
        if (created_at) {
          insertData.created_at = created_at;
        }

        const { data: newAction, error } = await supabase.from('actions').insert(insertData).select().single();

        if (error) {
          results.errors.push(`Row ${i + 1}: ${error.message}`);
        } else {
          results.success++;

          // If there's an initial comment (legacy import), create an action_update
          if (initialComment && newAction) {
            await supabase
              .from('action_updates')
              .insert({
                action_id: newAction.id,
                user_id: created_by_id,
                content: initialComment.trim(),
                is_legacy_import: true,
              });
          }
        }
      }

      // Add summary warning for unmatched owners
      if (unmatchedOwners.size > 0) {
        console.log('Unmatched owner emails/names:', Array.from(unmatchedOwners));
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

        {/* Search & Filters */}
        <Card padding="sm">
          <CardContent>
            <div className="flex flex-wrap items-center gap-4">
              {/* Search */}
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search actions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent w-48"
                />
              </div>
              <div className="h-6 w-px bg-gray-200" />
              <div className="flex items-center gap-2 text-gray-500">
                <FunnelIcon className="w-4 h-4" />
                <span className="text-sm font-medium">Filters:</span>
              </div>
              <MultiSelect
                options={statusOptions}
                value={statusFilter}
                onChange={setStatusFilter}
                placeholder="All Statuses"
                className="w-40"
              />
              <MultiSelect
                options={priorityOptions}
                value={priorityFilter}
                onChange={setPriorityFilter}
                placeholder="All Priorities"
                className="w-40"
              />
              <MultiSelect
                options={workstreamOptions}
                value={workstreamFilter}
                onChange={setWorkstreamFilter}
                placeholder="All Workstreams"
                className="w-48"
              />
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter([]);
                    setPriorityFilter([]);
                    setWorkstreamFilter([]);
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
              hasActiveFilters
                ? 'Try adjusting your filters.'
                : 'Create your first action to get started.'
            }
            action={
              !hasActiveFilters
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
          <ActionsTable
            actions={filteredActions}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onSort={handleSort}
          />
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
                  <li><strong>Priority</strong>: Critical, High, Medium, Low (or blank)</li>
                  <li><strong>Status</strong>: Pending, In Progress, Complete, Cancelled</li>
                  <li><strong>Workstream</strong>: Parent/Child format (e.g., &quot;IT Systems/Development&quot;)</li>
                  <li><strong>Owner</strong>: User&apos;s full name or email</li>
                  <li><strong>Due Date</strong>: Due Date, Due, or Deadline</li>
                </ul>
                <h3 className="text-sm font-medium text-gray-900 mt-4 mb-2">Legacy Import Columns</h3>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li><strong>Date Created</strong>: Original creation date for historical actions</li>
                  <li><strong>Date Closed</strong>: Completion date (auto-sets status to Complete)</li>
                  <li><strong>Created By</strong>: Creator name/email (defaults to System)</li>
                  <li><strong>Initial Comment</strong>: Legacy notes to import as first comment</li>
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
                  uploadResults.errors.length > 0 ? 'bg-red-50' : uploadResults.warnings.length > 0 ? 'bg-amber-50' : 'bg-green-50'
                )}>
                  <div className="flex items-center gap-2 mb-2">
                    {uploadResults.errors.length > 0 ? (
                      <ExclamationCircleIcon className="w-5 h-5 text-red-500" />
                    ) : uploadResults.warnings.length > 0 ? (
                      <ExclamationCircleIcon className="w-5 h-5 text-amber-500" />
                    ) : (
                      <CheckCircleIcon className="w-5 h-5 text-green-500" />
                    )}
                    <span className="font-medium">
                      {uploadResults.success} action{uploadResults.success !== 1 ? 's' : ''} imported
                    </span>
                  </div>
                  {uploadResults.warnings.length > 0 && (
                    <div className="mt-2">
                      <p className="text-sm font-medium text-amber-800 mb-1">
                        Warnings ({uploadResults.warnings.length}):
                      </p>
                      <ul className="text-sm text-amber-700 max-h-24 overflow-y-auto space-y-0.5">
                        {uploadResults.warnings.slice(0, 5).map((warn, i) => (
                          <li key={i}>{warn}</li>
                        ))}
                        {uploadResults.warnings.length > 5 && (
                          <li className="text-amber-600 italic">
                            ...and {uploadResults.warnings.length - 5} more
                          </li>
                        )}
                      </ul>
                      <p className="text-xs text-amber-600 mt-2">
                        Tip: Owner emails must match existing user accounts
                      </p>
                    </div>
                  )}
                  {uploadResults.errors.length > 0 && (
                    <div className="mt-2">
                      <p className="text-sm font-medium text-red-800 mb-1">Errors:</p>
                      <ul className="text-sm text-red-700 max-h-24 overflow-y-auto space-y-0.5">
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

interface ActionsTableProps {
  actions: ActionWithRelations[];
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onSort: (column: SortColumn) => void;
}

function ActionsTable({ actions, sortColumn, sortDirection, onSort }: ActionsTableProps) {
  const SortableHeader = ({ column, label }: { column: SortColumn; label: string }) => (
    <th
      className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3 cursor-pointer hover:bg-gray-100 select-none"
      onClick={() => onSort(column)}
    >
      <div className="flex items-center gap-1">
        {label}
        <span className="inline-flex flex-col">
          <ChevronUpIcon
            className={cn(
              'w-3 h-3 -mb-1',
              sortColumn === column && sortDirection === 'asc' ? 'text-gray-900' : 'text-gray-300'
            )}
          />
          <ChevronDownIcon
            className={cn(
              'w-3 h-3',
              sortColumn === column && sortDirection === 'desc' ? 'text-gray-900' : 'text-gray-300'
            )}
          />
        </span>
      </div>
    </th>
  );

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <SortableHeader column="title" label="Title" />
              <SortableHeader column="status" label="Status" />
              <SortableHeader column="priority" label="Priority" />
              <SortableHeader column="workstream" label="Workstream" />
              <SortableHeader column="owner" label="Owner" />
              <SortableHeader column="due_date" label="Due Date" />
              <SortableHeader column="created_at" label="Created" />
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
                    <div className="max-w-md">
                      <p className="text-sm font-medium text-gray-900">{action.title}</p>
                      {action.description && (
                        <p className="text-xs text-gray-500 mt-0.5">{action.description}</p>
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
