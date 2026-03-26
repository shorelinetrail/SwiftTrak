'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { LoadingPage } from '@/components/ui/loading';
import { formatDate } from '@/lib/utils';
import { bulkDownloadAttachments, type DownloadProgress } from '@/lib/bulk-download';
import toast from 'react-hot-toast';
import {
  ArrowDownTrayIcon,
  DocumentArrowDownIcon,
  FunnelIcon,
  PaperClipIcon,
} from '@heroicons/react/24/outline';
import type { Attachment, Workstream, User } from '@/types/database';

type AttachmentWithRelations = Attachment & {
  uploader?: User;
};

type EntityInfo = {
  title: string;
  workstream_id?: string;
};

export default function AttachmentsPage() {
  const { workstreams } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [attachments, setAttachments] = useState<AttachmentWithRelations[]>([]);
  const [entityMap, setEntityMap] = useState<Record<string, EntityInfo>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);

  // Filters
  const [entityTypeFilter, setEntityTypeFilter] = useState('all');
  const [workstreamFilter, setWorkstreamFilter] = useState('all');

  const fetchAttachments = useCallback(async () => {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('attachments')
      .select(`
        *,
        uploader:users(id, full_name)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load attachments');
      setLoading(false);
      return;
    }

    const attachmentsList = (data || []) as unknown as AttachmentWithRelations[];
    setAttachments(attachmentsList);

    // Fetch entity titles for context
    const entityIds = {
      action: new Set<string>(),
      threat: new Set<string>(),
      query: new Set<string>(),
      decision: new Set<string>(),
      milestone: new Set<string>(),
    };
    for (const a of attachmentsList) {
      entityIds[a.entity_type]?.add(a.entity_id);
    }

    const map: Record<string, EntityInfo> = {};

    const tableMap: Record<string, string> = {
      action: 'actions',
      threat: 'threats',
      query: 'technical_queries',
      decision: 'decisions',
      milestone: 'milestones',
    };

    for (const [type, ids] of Object.entries(entityIds)) {
      if (ids.size === 0) continue;
      const table = tableMap[type];
      if (!table) continue;

      const { data: entities } = await supabase
        .from(table)
        .select('id, title, workstream_id')
        .in('id', Array.from(ids));

      if (entities) {
        for (const entity of entities) {
          map[entity.id] = {
            title: entity.title,
            workstream_id: entity.workstream_id,
          };
        }
      }
    }

    setEntityMap(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  const filteredAttachments = attachments.filter((a) => {
    if (entityTypeFilter !== 'all' && a.entity_type !== entityTypeFilter) return false;
    if (workstreamFilter !== 'all') {
      const info = entityMap[a.entity_id];
      if (!info || info.workstream_id !== workstreamFilter) return false;
    }
    return true;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredAttachments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAttachments.map((a) => a.id)));
    }
  };

  const handleBulkDownload = async () => {
    const toDownload = filteredAttachments.filter((a) => selectedIds.has(a.id));
    if (toDownload.length === 0) {
      toast.error('No files selected');
      return;
    }

    setDownloading(true);
    setDownloadProgress(null);
    try {
      const result = await bulkDownloadAttachments(toDownload, 'swifttrak-attachments', setDownloadProgress);
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

  const handleDownloadAll = async () => {
    if (filteredAttachments.length === 0) return;

    setDownloading(true);
    setDownloadProgress(null);
    try {
      const result = await bulkDownloadAttachments(filteredAttachments, 'swifttrak-all-attachments', setDownloadProgress);
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

  const entityTypeOptions = [
    { value: 'all', label: 'All Types' },
    { value: 'action', label: 'Actions' },
    { value: 'threat', label: 'Threats' },
    { value: 'query', label: 'Queries' },
    { value: 'decision', label: 'Decisions' },
    { value: 'milestone', label: 'Milestones' },
  ];

  const workstreamOptions = [
    { value: 'all', label: 'All Workstreams' },
    ...workstreams.map((w) => ({ value: w.id, label: w.name })),
  ];

  const formatEntityType = (type: string) => {
    const labels: Record<string, string> = {
      action: 'Action',
      threat: 'Threat',
      query: 'Query',
      decision: 'Decision',
      milestone: 'Milestone',
    };
    return labels[type] || type;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return <LoadingPage />;
  }

  const allSelected = filteredAttachments.length > 0 && selectedIds.size === filteredAttachments.length;

  return (
    <div className="min-h-screen">
      <Header
        title="Attachments"
        subtitle={`${filteredAttachments.length} file${filteredAttachments.length !== 1 ? 's' : ''}`}
        actions={
          <div className="flex gap-2">
            {selectedIds.size > 0 && (
              <Button
                size="sm"
                onClick={handleBulkDownload}
                disabled={downloading}
                loading={downloading}
              >
                <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
                Download Selected ({selectedIds.size})
              </Button>
            )}
            {filteredAttachments.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadAll}
                disabled={downloading}
                loading={downloading}
              >
                <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
                Download All
              </Button>
            )}
          </div>
        }
      />

      {/* Download progress bar */}
      {downloadProgress && (
        <div className="mx-6 mt-4 bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              {downloadProgress.phase === 'zipping'
                ? 'Creating zip file...'
                : `Downloading files... ${downloadProgress.completed}/${downloadProgress.total}`}
            </span>
            {downloadProgress.failed > 0 && (
              <span className="text-sm text-red-600">{downloadProgress.failed} failed</span>
            )}
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-red-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${Math.round((downloadProgress.completed / downloadProgress.total) * 100)}%` }}
            />
          </div>
          {downloadProgress.phase === 'downloading' && downloadProgress.currentFile && (
            <p className="text-xs text-gray-500 mt-1 truncate">{downloadProgress.currentFile}</p>
          )}
        </div>
      )}

      <div className="p-6 space-y-6">
        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <FunnelIcon className="w-5 h-5 text-gray-400" />
              <div className="flex gap-4 flex-1">
                <div className="w-48">
                  <Select
                    options={entityTypeOptions}
                    value={entityTypeFilter}
                    onChange={(value) => {
                      setEntityTypeFilter(value);
                      setSelectedIds(new Set());
                    }}
                  />
                </div>
                <div className="w-48">
                  <Select
                    options={workstreamOptions}
                    value={workstreamFilter}
                    onChange={(value) => {
                      setWorkstreamFilter(value);
                      setSelectedIds(new Set());
                    }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Attachments Table */}
        <Card>
          <CardContent className="pt-6">
            {filteredAttachments.length === 0 ? (
              <div className="text-center py-12">
                <PaperClipIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No attachments found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-2 w-10">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                          className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                        />
                      </th>
                      <th className="text-left py-3 px-2 font-medium text-gray-500">File</th>
                      <th className="text-left py-3 px-2 font-medium text-gray-500">Type</th>
                      <th className="text-left py-3 px-2 font-medium text-gray-500">Entity</th>
                      <th className="text-left py-3 px-2 font-medium text-gray-500">Size</th>
                      <th className="text-left py-3 px-2 font-medium text-gray-500">Uploaded By</th>
                      <th className="text-left py-3 px-2 font-medium text-gray-500">Date</th>
                      <th className="text-right py-3 px-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAttachments.map((attachment) => {
                      const entityInfo = entityMap[attachment.entity_id];
                      return (
                        <tr
                          key={attachment.id}
                          className="border-b border-gray-100 hover:bg-gray-50"
                        >
                          <td className="py-3 px-2">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(attachment.id)}
                              onChange={() => toggleSelect(attachment.id)}
                              className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                            />
                          </td>
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-2">
                              <DocumentArrowDownIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                              <a
                                href={attachment.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-gray-900 hover:text-red-600 truncate max-w-xs"
                              >
                                {attachment.file_name}
                              </a>
                            </div>
                          </td>
                          <td className="py-3 px-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                              {formatEntityType(attachment.entity_type)}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-gray-600 truncate max-w-xs">
                            {entityInfo?.title || '-'}
                          </td>
                          <td className="py-3 px-2 text-gray-500">
                            {formatFileSize(attachment.file_size)}
                          </td>
                          <td className="py-3 px-2 text-gray-600">
                            {attachment.uploader?.full_name || '-'}
                          </td>
                          <td className="py-3 px-2 text-gray-500">
                            {formatDate(attachment.created_at)}
                          </td>
                          <td className="py-3 px-2 text-right">
                            <a
                              href={attachment.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gray-400 hover:text-red-600"
                            >
                              <ArrowDownTrayIcon className="w-4 h-4" />
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
