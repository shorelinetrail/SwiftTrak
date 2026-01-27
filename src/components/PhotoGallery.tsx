'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { PhotoLightbox } from './PhotoLightbox';
import { EmptyState } from '@/components/ui/empty-state';
import { PhotoIcon, CheckIcon } from '@heroicons/react/24/outline';
import type { WorkstreamPhoto } from '@/types/database';

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
  onDelete?: (photoId: string) => Promise<void>;
  onCaptionUpdate?: (photoId: string, caption: string) => Promise<void>;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
}

export function PhotoGallery({
  photos,
  emptyMessage = 'No photos yet',
  onUploadClick,
  canUpload = false,
  canEdit = false,
  onDelete,
  onCaptionUpdate,
  selectionMode = false,
  selectedIds = new Set(),
  onSelectionChange,
}: PhotoGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const lastSelectedIndexRef = useRef<number | null>(null);

  if (photos.length === 0) {
    return (
      <EmptyState
        icon={<PhotoIcon className="w-6 h-6" />}
        title={emptyMessage}
        description="Photos will appear here once uploaded."
        action={
          canUpload && onUploadClick
            ? {
                label: 'Upload Photos',
                onClick: onUploadClick,
              }
            : undefined
        }
      />
    );
  }

  // Group photos by date (using taken_at if available, otherwise created_at)
  const groupedPhotos: { date: string; photos: PhotoWithRelations[] }[] = [];
  const dateMap = new Map<string, PhotoWithRelations[]>();

  photos.forEach((photo) => {
    const dateStr = photo.taken_at
      ? new Date(photo.taken_at).toLocaleDateString('en-GB', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : new Date(photo.created_at).toLocaleDateString('en-GB', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });

    if (!dateMap.has(dateStr)) {
      dateMap.set(dateStr, []);
    }
    dateMap.get(dateStr)!.push(photo);
  });

  // Convert map to array and sort by date descending
  dateMap.forEach((datePhotos, date) => {
    groupedPhotos.push({ date, photos: datePhotos });
  });

  // Find the index in the flat array for lightbox navigation
  const flatPhotos = photos;

  return (
    <>
      <div className="space-y-8">
        {groupedPhotos.map(({ date, photos: datePhotos }) => (
          <div key={date}>
            <h3 className="text-sm font-medium text-gray-500 mb-3">{date}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {datePhotos.map((photo) => {
                const flatIndex = flatPhotos.findIndex((p) => p.id === photo.id);
                const imageUrl = photo.thumbnail_url || photo.url;
                const isSelected = selectedIds.has(photo.id);

                if (!imageUrl) return null;

                const handleClick = (e: React.MouseEvent) => {
                  if (selectionMode && onSelectionChange) {
                    const newSelection = new Set(selectedIds);

                    // Shift+click: range selection
                    if (e.shiftKey && lastSelectedIndexRef.current !== null) {
                      const start = Math.min(lastSelectedIndexRef.current, flatIndex);
                      const end = Math.max(lastSelectedIndexRef.current, flatIndex);

                      // Add all photos in range to selection
                      for (let i = start; i <= end; i++) {
                        newSelection.add(flatPhotos[i].id);
                      }
                    }
                    // Ctrl/Cmd+click: toggle individual selection
                    else if (e.ctrlKey || e.metaKey) {
                      if (isSelected) {
                        newSelection.delete(photo.id);
                      } else {
                        newSelection.add(photo.id);
                      }
                      lastSelectedIndexRef.current = flatIndex;
                    }
                    // Regular click: toggle selection
                    else {
                      if (isSelected) {
                        newSelection.delete(photo.id);
                      } else {
                        newSelection.add(photo.id);
                      }
                      lastSelectedIndexRef.current = flatIndex;
                    }

                    onSelectionChange(newSelection);
                  } else {
                    setLightboxIndex(flatIndex);
                  }
                };

                return (
                  <button
                    key={photo.id}
                    onClick={handleClick}
                    className={`relative aspect-square rounded-lg overflow-hidden bg-gray-100 hover:opacity-90 transition-all focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ${
                      isSelected ? 'ring-2 ring-red-500 ring-offset-2' : ''
                    }`}
                  >
                    <Image
                      src={imageUrl}
                      alt={photo.original_filename}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                    />
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

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={flatPhotos.map((p) => ({
            id: p.id,
            url: p.url || '',
            thumbnail_url: p.thumbnail_url,
            original_filename: p.original_filename,
            taken_at: p.taken_at,
            caption: p.caption,
            uploader: p.uploader ? { full_name: p.uploader.full_name } : undefined,
          }))}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          canEdit={canEdit}
          onDelete={onDelete}
          onCaptionUpdate={onCaptionUpdate}
        />
      )}
    </>
  );
}
