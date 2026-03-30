'use client';

import { useState, useRef, useMemo, memo, useEffect } from 'react';
import Image from 'next/image';
import { PhotoLightbox } from './PhotoLightbox';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/utils';
import {
  PhotoIcon,
  CheckIcon,
  DocumentIcon,
  EyeSlashIcon,
  PlayIcon,
  FilmIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import type { WorkstreamPhoto } from '@/types/database';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'avi', 'mkv', 'm4v', 'ogv', 'wmv'];

function isImageFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return IMAGE_EXTENSIONS.includes(ext);
}

function isVideoFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return VIDEO_EXTENSIONS.includes(ext);
}

function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toUpperCase() || 'FILE';
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type PhotoWithRelations = Omit<WorkstreamPhoto, 'workstream' | 'uploader'> & {
  workstream?: { id: string; name: string; color: string };
  uploader?: { id: string; full_name: string; avatar_url?: string };
  url?: string;
  thumbnail_url?: string;
};

interface PhotoGalleryProps {
  photos: PhotoWithRelations[];
  emptyMessage?: string;
  onUploadClick?: () => void;
  canUpload?: boolean;
  canEdit?: boolean;
  isAdmin?: boolean;
  onDelete?: (photoId: string) => Promise<void>;
  onCaptionUpdate?: (photoId: string, caption: string) => Promise<void>;
  onToggleHidden?: (photoId: string, isHidden: boolean) => Promise<void>;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  viewMode?: 'grid' | 'details';
}

const EMPTY_SET = new Set<string>();

export const PhotoGallery = memo(function PhotoGallery({
  photos,
  emptyMessage = 'No photos yet',
  onUploadClick,
  canUpload = false,
  canEdit = false,
  isAdmin = false,
  onDelete,
  onCaptionUpdate,
  onToggleHidden,
  selectionMode = false,
  selectedIds = EMPTY_SET,
  onSelectionChange,
  viewMode = 'grid',
}: PhotoGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const lastSelectedIndexRef = useRef<number | null>(null);

  // Progressive rendering: show PAGE_SIZE items, load more on scroll
  const PAGE_SIZE = 40;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Reset visible count when photos list changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [photos]);

  // IntersectionObserver to load more when sentinel enters viewport
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || visibleCount >= photos.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, photos.length));
        }
      },
      { rootMargin: '400px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visibleCount, photos.length]);

  const visiblePhotos = useMemo(
    () => photos.slice(0, visibleCount),
    [photos, visibleCount]
  );

  // Build id-to-index map once instead of O(n) findIndex per photo
  const idToIndex = useMemo(() => {
    const map = new Map<string, number>();
    photos.forEach((p, i) => map.set(p.id, i));
    return map;
  }, [photos]);

  // Group visible photos by date
  const groupedPhotos = useMemo(() => {
    const dateMap = new Map<string, PhotoWithRelations[]>();
    visiblePhotos.forEach((photo) => {
      const dateStr = (photo.taken_at ? new Date(photo.taken_at) : new Date(photo.created_at))
        .toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
      if (!dateMap.has(dateStr)) {
        dateMap.set(dateStr, []);
      }
      dateMap.get(dateStr)!.push(photo);
    });
    const groups: { date: string; photos: PhotoWithRelations[] }[] = [];
    dateMap.forEach((datePhotos, date) => {
      groups.push({ date, photos: datePhotos });
    });
    return groups;
  }, [visiblePhotos]);

  // Lightbox photo data (memoized to avoid recreating on every render)
  const lightboxPhotos = useMemo(
    () =>
      photos.map((p) => ({
        id: p.id,
        url: p.url || '',
        thumbnail_url: p.thumbnail_url,
        original_filename: p.original_filename,
        taken_at: p.taken_at,
        caption: p.caption,
        file_size: p.file_size,
        is_hidden: p.is_hidden,
        uploader: p.uploader ? { full_name: p.uploader.full_name } : undefined,
      })),
    [photos]
  );

  if (photos.length === 0) {
    return (
      <EmptyState
        icon={<PhotoIcon className="w-6 h-6" />}
        title={emptyMessage}
        description="Photos will appear here once uploaded."
        action={
          canUpload && onUploadClick
            ? { label: 'Upload Photos', onClick: onUploadClick }
            : undefined
        }
      />
    );
  }

  const handleClick = (photoId: string, flatIndex: number, e: React.MouseEvent) => {
    if (selectionMode && onSelectionChange) {
      const newSelection = new Set(selectedIds);

      if (e.shiftKey && lastSelectedIndexRef.current !== null) {
        const start = Math.min(lastSelectedIndexRef.current, flatIndex);
        const end = Math.max(lastSelectedIndexRef.current, flatIndex);
        for (let i = start; i <= end; i++) {
          newSelection.add(photos[i].id);
        }
      } else {
        if (newSelection.has(photoId)) {
          newSelection.delete(photoId);
        } else {
          newSelection.add(photoId);
        }
        lastSelectedIndexRef.current = flatIndex;
      }

      onSelectionChange(newSelection);
    } else {
      setLightboxIndex(flatIndex);
    }
  };

  return (
    <>
      {viewMode === 'details' ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                {selectionMode && <th className="text-left py-3 px-2 w-10" />}
                <th className="text-left py-3 px-2 font-medium text-gray-500">File</th>
                <th className="text-left py-3 px-2 font-medium text-gray-500">Workstream</th>
                <th className="text-left py-3 px-2 font-medium text-gray-500">Size</th>
                <th className="text-left py-3 px-2 font-medium text-gray-500">Uploaded By</th>
                <th className="text-left py-3 px-2 font-medium text-gray-500">Date</th>
                <th className="text-left py-3 px-2 font-medium text-gray-500">Caption</th>
                <th className="text-right py-3 px-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {visiblePhotos.map((photo) => {
                const flatIndex = idToIndex.get(photo.id) ?? 0;
                const isSelected = selectedIds.has(photo.id);
                const isImage = isImageFile(photo.original_filename);
                const isVideo = isVideoFile(photo.original_filename);

                return (
                  <tr
                    key={photo.id}
                    className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${
                      isSelected ? 'bg-red-50' : ''
                    }`}
                    onClick={(e) => handleClick(photo.id, flatIndex, e)}
                  >
                    {selectionMode && (
                      <td className="py-2 px-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            if (onSelectionChange) {
                              const next = new Set(selectedIds);
                              if (isSelected) next.delete(photo.id);
                              else next.add(photo.id);
                              onSelectionChange(next);
                            }
                          }}
                          className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                        />
                      </td>
                    )}
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-3">
                        {/* Thumbnail */}
                        <div className="w-10 h-10 rounded overflow-hidden bg-gray-100 flex-shrink-0">
                          {isImage && photo.thumbnail_url ? (
                            <Image
                              src={photo.thumbnail_url}
                              alt=""
                              width={40}
                              height={40}
                              className="w-full h-full object-cover"
                            />
                          ) : isVideo ? (
                            <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                              <FilmIcon className="w-5 h-5 text-gray-400" />
                            </div>
                          ) : (
                            <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                              <DocumentIcon className="w-5 h-5 text-gray-400" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate max-w-xs">
                            {photo.original_filename}
                          </p>
                          <p className="text-xs text-gray-400">{getFileExtension(photo.original_filename)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2 px-2">
                      {photo.workstream && (
                        <span
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium"
                          style={{
                            backgroundColor: `${photo.workstream.color}20`,
                            color: photo.workstream.color,
                          }}
                        >
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: photo.workstream.color }}
                          />
                          {photo.workstream.name}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-gray-500 whitespace-nowrap">
                      {formatFileSize(photo.file_size)}
                    </td>
                    <td className="py-2 px-2 text-gray-600">
                      {photo.uploader?.full_name || '-'}
                    </td>
                    <td className="py-2 px-2 text-gray-500 whitespace-nowrap">
                      {formatDate(photo.taken_at || photo.created_at)}
                    </td>
                    <td className="py-2 px-2 text-gray-500 truncate max-w-[200px]">
                      {photo.caption || '-'}
                    </td>
                    <td className="py-2 px-2 text-right" onClick={(e) => e.stopPropagation()}>
                      {photo.url && (
                        <a
                          href={photo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-400 hover:text-red-600"
                        >
                          <ArrowDownTrayIcon className="w-4 h-4" />
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-8">
          {groupedPhotos.map(({ date, photos: datePhotos }) => (
            <div key={date}>
              <h3 className="text-sm font-medium text-gray-500 mb-3">{date}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                {datePhotos.map((photo) => {
                  const flatIndex = idToIndex.get(photo.id) ?? 0;
                  const imageUrl = photo.thumbnail_url || photo.url;
                  const isSelected = selectedIds.has(photo.id);

                  if (!imageUrl) return null;

                  const isImage = isImageFile(photo.original_filename);
                  const isVideo = isVideoFile(photo.original_filename);

                  return (
                    <button
                      key={photo.id}
                      onClick={(e) => handleClick(photo.id, flatIndex, e)}
                      className={`relative aspect-square rounded-lg overflow-hidden bg-gray-100 hover:opacity-90 transition-all focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ${
                        isSelected ? 'ring-2 ring-red-500 ring-offset-2' : ''
                      }`}
                    >
                      {isImage && imageUrl ? (
                        <Image
                          src={imageUrl}
                          alt={photo.original_filename}
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                        />
                      ) : isVideo ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-800 p-2">
                          <FilmIcon className="w-10 h-10 text-gray-400 mb-1" />
                          <span className="text-xs font-medium text-gray-300 truncate max-w-full px-1">
                            {getFileExtension(photo.original_filename)}
                          </span>
                          <span className="text-[10px] text-gray-500 truncate max-w-full px-1 mt-0.5">
                            {photo.original_filename.length > 15
                              ? photo.original_filename.slice(0, 12) + '...'
                              : photo.original_filename}
                          </span>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
                              <PlayIcon className="w-6 h-6 text-white ml-0.5" />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-200 p-2">
                          <DocumentIcon className="w-10 h-10 text-gray-400 mb-1" />
                          <span className="text-xs font-medium text-gray-500 truncate max-w-full px-1">
                            {getFileExtension(photo.original_filename)}
                          </span>
                          <span className="text-[10px] text-gray-400 truncate max-w-full px-1 mt-0.5">
                            {photo.original_filename.length > 15
                              ? photo.original_filename.slice(0, 12) + '...'
                              : photo.original_filename}
                          </span>
                        </div>
                      )}
                      {photo.is_hidden && (
                        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-yellow-500 flex items-center justify-center">
                          <EyeSlashIcon className="w-3.5 h-3.5 text-white" />
                        </div>
                      )}
                      {selectionMode && (
                        <div
                          className={`absolute top-2 left-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                            isSelected
                              ? 'bg-red-500 border-red-500 text-white'
                              : 'bg-white/80 border-gray-300'
                          }`}
                        >
                          {isSelected && <CheckIcon className="w-4 h-4" />}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Load more sentinel */}
      {visibleCount < photos.length && (
        <div ref={sentinelRef} className="flex justify-center py-6">
          <p className="text-sm text-gray-400">
            Showing {visibleCount} of {photos.length} files...
          </p>
        </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={lightboxPhotos}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          canEdit={canEdit}
          isAdmin={isAdmin}
          onDelete={onDelete}
          onCaptionUpdate={onCaptionUpdate}
          onToggleHidden={onToggleHidden}
        />
      )}
    </>
  );
});
