'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import { usePermission } from '@/hooks/use-user';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Tabs } from '@/components/ui/tabs';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading';
import { PhotoGallery } from '@/components/PhotoGallery';
import { buildWorkstreamOptions } from '@/lib/utils';
import {
  PlusIcon,
  FunnelIcon,
  EyeSlashIcon,
  CheckIcon,
  XMarkIcon,
  TrashIcon,
  PencilIcon,
  PhotoIcon,
  FilmIcon,
  DocumentIcon,
  Squares2X2Icon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ListBulletIcon,
  ViewColumnsIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { bulkDownloadFiles, type DownloadProgress } from '@/lib/bulk-download';
import type { WorkstreamPhoto, Workstream, User } from '@/types/database';

// File type detection
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'avi', 'mkv', 'm4v', 'ogv', 'wmv'];

function getFileType(filename: string): 'photo' | 'video' | 'document' {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (IMAGE_EXTENSIONS.includes(ext)) return 'photo';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  return 'document';
}

type FileTypeFilter = 'all' | 'photos' | 'videos' | 'documents';

type PhotoWithRelations = WorkstreamPhoto & {
  workstream?: Workstream;
  uploader?: User;
  url?: string;
  thumbnail_url?: string;
};

export default function PhotosPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { workstreams, setWorkstreams } = useAppStore();
  const { canEdit, canAdmin } = usePermission();
  const [loading, setLoading] = useState(true);
  const [photos, setPhotos] = useState<PhotoWithRelations[]>([]);
  const [hiddenPhotos, setHiddenPhotos] = useState<PhotoWithRelations[]>([]);
  const [workstreamFilter, setWorkstreamFilter] = useState<string>('all');
  const [fileTypeFilter, setFileTypeFilter] = useState<FileTypeFilter>('all');
  const [activeTab, setActiveTab] = useState<'all' | 'hidden'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'details'>('grid');

  // Selection mode for bulk operations
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCaptionModalOpen, setBulkCaptionModalOpen] = useState(false);
  const [bulkCaption, setBulkCaption] = useState('');
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPhotos = useCallback(async () => {
    const url = workstreamFilter === 'all'
      ? '/api/photos'
      : `/api/photos?workstreamId=${workstreamFilter}`;

    try {
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setPhotos(data);
      }
    } catch (error) {
      console.error('Error fetching photos:', error);
    }

    setLoading(false);
  }, [workstreamFilter]);

  const fetchHiddenPhotos = useCallback(async () => {
    if (!canAdmin) return;

    const url = workstreamFilter === 'all'
      ? '/api/photos?hiddenOnly=true'
      : `/api/photos?workstreamId=${workstreamFilter}&hiddenOnly=true`;

    try {
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setHiddenPhotos(data);
      }
    } catch (error) {
      console.error('Error fetching hidden photos:', error);
    }
  }, [workstreamFilter, canAdmin]);

  // Fetch workstreams if not loaded
  useEffect(() => {
    if (workstreams.length === 0) {
      const doFetch = async () => {
        const supabase = createClient();
        const { data } = await supabase
          .from('workstreams')
          .select('*')
          .order('order_index');
        if (data) {
          setWorkstreams(data as Workstream[]);
        }
      };
      doFetch();
    }
  }, [workstreams.length, setWorkstreams]);

  // Fetch photos when filter changes
  useEffect(() => {
    fetchPhotos();
    fetchHiddenPhotos();
  }, [fetchPhotos, fetchHiddenPhotos]);

  // Refetch when navigating back (e.g. after upload)
  useEffect(() => {
    if (pathname === '/photos') {
      fetchPhotos();
      fetchHiddenPhotos();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Toggle hidden handler (admin only)
  const handleToggleHidden = useCallback(async (photoId: string, isHidden: boolean) => {
    const response = await fetch('/api/photos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: photoId, is_hidden: isHidden }),
    });

    if (!response.ok) {
      const error = await response.json();
      toast.error(error.error || 'Failed to update photo');
      throw new Error(error.error);
    }

    if (isHidden) {
      const photo = photos.find((p) => p.id === photoId);
      if (photo) {
        setPhotos((prev) => prev.filter((p) => p.id !== photoId));
        setHiddenPhotos((prev) => [{ ...photo, is_hidden: true }, ...prev]);
      }
      toast.success('Photo hidden');
    } else {
      const photo = hiddenPhotos.find((p) => p.id === photoId);
      if (photo) {
        setHiddenPhotos((prev) => prev.filter((p) => p.id !== photoId));
        setPhotos((prev) => [{ ...photo, is_hidden: false }, ...prev]);
      }
      toast.success('Photo unhidden');
    }
  }, [photos, hiddenPhotos]);

  // Delete handler
  const handleDelete = useCallback(async (photoId: string) => {
    const response = await fetch(`/api/photos?id=${photoId}`, { method: 'DELETE' });

    if (!response.ok) {
      const error = await response.json();
      toast.error(error.error || 'Failed to delete photo');
      throw new Error(error.error);
    }

    setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    setHiddenPhotos((prev) => prev.filter((p) => p.id !== photoId));
    toast.success('Photo deleted');
  }, []);

  // Caption update handler
  const handleCaptionUpdate = useCallback(async (photoId: string, caption: string) => {
    const response = await fetch('/api/photos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: photoId, caption }),
    });

    if (!response.ok) {
      const error = await response.json();
      toast.error(error.error || 'Failed to update caption');
      throw new Error(error.error);
    }

    setPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, caption } : p)));
    setHiddenPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, caption } : p)));
    toast.success('Caption updated');
  }, []);

  // Bulk delete handler
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    const confirmMsg = `Are you sure you want to delete ${selectedIds.size} file${selectedIds.size !== 1 ? 's' : ''}? This cannot be undone.`;
    if (!confirm(confirmMsg)) return;

    setIsBulkProcessing(true);
    let successCount = 0;
    let errorCount = 0;

    for (const photoId of selectedIds) {
      try {
        const response = await fetch(`/api/photos?id=${photoId}`, { method: 'DELETE' });
        if (response.ok) successCount++;
        else errorCount++;
      } catch {
        errorCount++;
      }
    }

    setPhotos((prev) => prev.filter((p) => !selectedIds.has(p.id)));
    setHiddenPhotos((prev) => prev.filter((p) => !selectedIds.has(p.id)));
    setSelectedIds(new Set());
    setSelectionMode(false);
    setIsBulkProcessing(false);

    if (errorCount === 0) {
      toast.success(`Deleted ${successCount} file${successCount !== 1 ? 's' : ''}`);
    } else {
      toast.error(`Deleted ${successCount}, failed ${errorCount}`);
    }
  };

  // Bulk caption handler
  const handleBulkCaption = async () => {
    if (selectedIds.size === 0 || !bulkCaption.trim()) return;

    setIsBulkProcessing(true);
    let successCount = 0;
    let errorCount = 0;

    for (const photoId of selectedIds) {
      try {
        const response = await fetch('/api/photos', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: photoId, caption: bulkCaption.trim() }),
        });
        if (response.ok) successCount++;
        else errorCount++;
      } catch {
        errorCount++;
      }
    }

    const newCaption = bulkCaption.trim();
    setPhotos((prev) => prev.map((p) => (selectedIds.has(p.id) ? { ...p, caption: newCaption } : p)));
    setHiddenPhotos((prev) => prev.map((p) => (selectedIds.has(p.id) ? { ...p, caption: newCaption } : p)));
    setBulkCaptionModalOpen(false);
    setBulkCaption('');
    setSelectedIds(new Set());
    setSelectionMode(false);
    setIsBulkProcessing(false);

    if (errorCount === 0) {
      toast.success(`Updated caption on ${successCount} file${successCount !== 1 ? 's' : ''}`);
    } else {
      toast.error(`Updated ${successCount}, failed ${errorCount}`);
    }
  };

  // Bulk download handler
  const handleBulkDownload = async () => {
    const selected = photos.filter((p) => selectedIds.has(p.id));
    if (selected.length === 0) return;

    setIsBulkProcessing(true);
    setDownloadProgress({ total: selected.length, completed: 0, failed: 0, currentFile: 'Refreshing URLs...', phase: 'downloading' });

    try {
      // Refresh signed URLs to avoid expiry
      const freshResponse = await fetch(
        workstreamFilter === 'all' ? '/api/photos' : `/api/photos?workstreamId=${workstreamFilter}`
      );
      let filesToDownload = selected;
      if (freshResponse.ok) {
        const freshPhotos = await freshResponse.json() as PhotoWithRelations[];
        const freshMap = new Map(freshPhotos.map((p) => [p.id, p]));
        filesToDownload = selected.map((p) => freshMap.get(p.id) || p);
      }

      const files = filesToDownload
        .filter((p) => p.url)
        .map((p) => ({ url: p.url!, filename: p.original_filename }));

      const result = await bulkDownloadFiles(files, 'swifttrak-files', setDownloadProgress);

      if (result.failed === 0) {
        toast.success(`Downloaded ${result.succeeded} file${result.succeeded !== 1 ? 's' : ''}`);
      } else {
        toast.error(`Downloaded ${result.succeeded} of ${result.total} (${result.failed} failed)`);
      }
    } catch (error) {
      console.error('Bulk download failed:', error);
      toast.error('Failed to download files');
    } finally {
      setIsBulkProcessing(false);
      setDownloadProgress(null);
    }
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchPhotos(), fetchHiddenPhotos()]);
    setRefreshing(false);
  };

  // Memoize expensive computations
  const workstreamOptions = useMemo(
    () => buildWorkstreamOptions(workstreams, { allLabel: 'All Workstreams', allValue: 'all' }),
    [workstreams]
  );

  const filteredPhotos = useMemo(() => {
    if (fileTypeFilter === 'all') return photos;
    return photos.filter((p) => {
      const type = getFileType(p.original_filename);
      if (fileTypeFilter === 'photos') return type === 'photo';
      if (fileTypeFilter === 'videos') return type === 'video';
      if (fileTypeFilter === 'documents') return type === 'document';
      return true;
    });
  }, [photos, fileTypeFilter]);

  const filteredHiddenPhotos = useMemo(() => {
    if (fileTypeFilter === 'all') return hiddenPhotos;
    return hiddenPhotos.filter((p) => {
      const type = getFileType(p.original_filename);
      if (fileTypeFilter === 'photos') return type === 'photo';
      if (fileTypeFilter === 'videos') return type === 'video';
      if (fileTypeFilter === 'documents') return type === 'document';
      return true;
    });
  }, [hiddenPhotos, fileTypeFilter]);

  const typeCounts = useMemo(() => ({
    all: photos.length,
    photos: photos.filter((p) => getFileType(p.original_filename) === 'photo').length,
    videos: photos.filter((p) => getFileType(p.original_filename) === 'video').length,
    documents: photos.filter((p) => getFileType(p.original_filename) === 'document').length,
  }), [photos]);

  const photoCountByWorkstream = useMemo(() => {
    return filteredPhotos.reduce((acc, photo) => {
      acc[photo.workstream_id] = (acc[photo.workstream_id] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [filteredPhotos]);

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header title="Files" subtitle="Loading..." />
        <div className="p-6 flex items-center justify-center h-64">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header
        title="Files"
        subtitle={selectionMode
          ? `${selectedIds.size} selected`
          : `${photos.length} file${photos.length !== 1 ? 's' : ''} across workstreams`
        }
        actions={
          selectionMode ? (
            <div className="flex items-center gap-2">
              {selectedIds.size > 0 && (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleBulkDownload}
                    disabled={isBulkProcessing}
                  >
                    <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setBulkCaptionModalOpen(true)}
                    disabled={isBulkProcessing}
                  >
                    <PencilIcon className="w-4 h-4 mr-2" />
                    Set Caption
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleBulkDelete}
                    disabled={isBulkProcessing}
                    className="text-red-600 hover:text-red-700"
                  >
                    <TrashIcon className="w-4 h-4 mr-2" />
                    Delete
                  </Button>
                </>
              )}
              <Button size="sm" variant="secondary" onClick={exitSelectionMode}>
                <XMarkIcon className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                title="Refresh"
              >
                <ArrowPathIcon className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <div className="flex items-center gap-2">
                <FunnelIcon className="w-4 h-4 text-gray-400" />
                <Select
                  options={workstreamOptions}
                  value={workstreamFilter}
                  onChange={setWorkstreamFilter}
                  className="w-48"
                />
              </div>
              {/* View mode toggle */}
              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 ${viewMode === 'grid' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
                  title="Grid view"
                >
                  <ViewColumnsIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('details')}
                  className={`p-2 ${viewMode === 'details' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
                  title="Details view"
                >
                  <ListBulletIcon className="w-4 h-4" />
                </button>
              </div>
              {canEdit && photos.length > 0 && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setSelectionMode(true)}
                >
                  <CheckIcon className="w-4 h-4 mr-2" />
                  Select
                </Button>
              )}
              {canEdit && (
                <Link href="/photos/upload">
                  <Button size="sm">
                    <PlusIcon className="w-4 h-4 mr-2" />
                    Upload
                  </Button>
                </Link>
              )}
            </div>
          )
        }
      />

      {/* Download progress bar */}
      {downloadProgress && (
        <div className="mx-6 mt-4 bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              {downloadProgress.phase === 'zipping'
                ? 'Creating zip file...'
                : downloadProgress.phase === 'done'
                  ? 'Download complete'
                  : `Downloading files... ${downloadProgress.completed}/${downloadProgress.total}`}
            </span>
            <span className="text-sm text-gray-500">
              {downloadProgress.failed > 0 && (
                <span className="text-red-600">{downloadProgress.failed} failed</span>
              )}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-red-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${Math.round((downloadProgress.completed / downloadProgress.total) * 100)}%` }}
            />
          </div>
          {downloadProgress.phase === 'downloading' && downloadProgress.currentFile && (
            <p className="text-xs text-gray-500 mt-1 truncate">
              {downloadProgress.currentFile}
            </p>
          )}
        </div>
      )}

      <div className="p-6 space-y-6">
        {/* Admin tabs for all/hidden files */}
        {canAdmin && (
          <Tabs
            activeTab={activeTab}
            onChange={(id) => setActiveTab(id as 'all' | 'hidden')}
            tabs={[
              { id: 'all', label: 'All Files', count: photos.length },
              { id: 'hidden', label: 'Hidden', count: hiddenPhotos.length, icon: <EyeSlashIcon className="w-4 h-4" /> },
            ]}
          />
        )}

        {/* File type filter tabs */}
        <div className="flex flex-wrap items-center gap-2">
          {([
            { id: 'all' as FileTypeFilter, label: 'All', icon: <Squares2X2Icon className="w-4 h-4" />, count: typeCounts.all },
            { id: 'photos' as FileTypeFilter, label: 'Photos', icon: <PhotoIcon className="w-4 h-4" />, count: typeCounts.photos },
            { id: 'videos' as FileTypeFilter, label: 'Videos', icon: <FilmIcon className="w-4 h-4" />, count: typeCounts.videos },
            { id: 'documents' as FileTypeFilter, label: 'Documents', icon: <DocumentIcon className="w-4 h-4" />, count: typeCounts.documents },
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFileTypeFilter(tab.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                fileTypeFilter === tab.id
                  ? 'bg-red-100 text-red-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.count > 0 && (
                <span className={`ml-1 text-xs ${fileTypeFilter === tab.id ? 'text-red-600' : 'text-gray-500'}`}>
                  ({tab.count})
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'all' ? (
          <>
            {/* Workstream album cards (grid view only) */}
            {viewMode === 'grid' && workstreamFilter === 'all' && workstreams.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {workstreams
                  .filter((ws) => photoCountByWorkstream[ws.id])
                  .map((ws) => (
                    <button
                      key={ws.id}
                      onClick={() => setWorkstreamFilter(ws.id)}
                      className="p-4 rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all text-left"
                    >
                      <div
                        className="w-8 h-8 rounded-lg mb-2"
                        style={{ backgroundColor: ws.color }}
                      />
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {ws.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {photoCountByWorkstream[ws.id]} file{photoCountByWorkstream[ws.id] !== 1 ? 's' : ''}
                      </p>
                    </button>
                  ))}
              </div>
            )}

            <PhotoGallery
              photos={filteredPhotos}
              emptyMessage={
                fileTypeFilter !== 'all'
                  ? `No ${fileTypeFilter} found`
                  : workstreamFilter === 'all'
                    ? 'No files uploaded yet'
                    : 'No files in this workstream'
              }
              onUploadClick={() => router.push('/photos/upload')}
              canUpload={canEdit}
              canEdit={canEdit}
              isAdmin={canAdmin}
              onDelete={handleDelete}
              onCaptionUpdate={handleCaptionUpdate}
              onToggleHidden={canAdmin ? handleToggleHidden : undefined}
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              viewMode={viewMode}
            />
          </>
        ) : (
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <EyeSlashIcon className="w-5 h-5 text-yellow-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-yellow-800">Hidden Files</p>
                  <p className="text-sm text-yellow-700 mt-1">
                    These files are only visible to administrators. Click the eye icon in the lightbox to unhide a file.
                  </p>
                </div>
              </div>
            </div>
            <PhotoGallery
              photos={filteredHiddenPhotos}
              emptyMessage="No hidden files"
              canUpload={false}
              canEdit={canEdit}
              isAdmin={canAdmin}
              onDelete={handleDelete}
              onCaptionUpdate={handleCaptionUpdate}
              onToggleHidden={handleToggleHidden}
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              viewMode={viewMode}
            />
          </div>
        )}
      </div>

      {/* Bulk Caption Modal */}
      <Modal
        open={bulkCaptionModalOpen}
        onClose={() => {
          setBulkCaptionModalOpen(false);
          setBulkCaption('');
        }}
        title="Set Caption"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            This will set the same caption on {selectedIds.size} selected file{selectedIds.size !== 1 ? 's' : ''}.
          </p>
          <Input
            label="Caption"
            value={bulkCaption}
            onChange={(e) => setBulkCaption(e.target.value)}
            placeholder="Enter caption for all selected files..."
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setBulkCaptionModalOpen(false);
                setBulkCaption('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleBulkCaption}
              disabled={!bulkCaption.trim() || isBulkProcessing}
            >
              {isBulkProcessing ? 'Updating...' : 'Apply Caption'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
