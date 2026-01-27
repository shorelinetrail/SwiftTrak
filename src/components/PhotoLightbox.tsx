'use client';

import { useEffect, useCallback, useState } from 'react';
import Image from 'next/image';
import {
  XMarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowDownTrayIcon,
  TrashIcon,
  PencilIcon,
  CheckIcon,
  DocumentIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline';
import { formatDate } from '@/lib/utils';

// Image file extensions that can be previewed
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];

function isImageFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return IMAGE_EXTENSIONS.includes(ext);
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

interface Photo {
  id: string;
  url: string;
  thumbnail_url?: string;
  original_filename: string;
  taken_at?: string;
  caption?: string;
  file_size?: number;
  is_hidden?: boolean;
  uploader?: { full_name: string };
}

interface PhotoLightboxProps {
  photos: Photo[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onDelete?: (photoId: string) => Promise<void>;
  onCaptionUpdate?: (photoId: string, caption: string) => Promise<void>;
  onToggleHidden?: (photoId: string, isHidden: boolean) => Promise<void>;
  canEdit?: boolean;
  isAdmin?: boolean;
}

export function PhotoLightbox({
  photos,
  currentIndex,
  onClose,
  onNavigate,
  onDelete,
  onCaptionUpdate,
  onToggleHidden,
  canEdit = false,
  isAdmin = false,
}: PhotoLightboxProps) {
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditingCaption, setIsEditingCaption] = useState(false);
  const [captionText, setCaptionText] = useState('');
  const [isSavingCaption, setIsSavingCaption] = useState(false);
  const [isTogglingHidden, setIsTogglingHidden] = useState(false);

  const currentPhoto = photos[currentIndex];

  // Reset caption edit state when photo changes
  useEffect(() => {
    setIsEditingCaption(false);
    setCaptionText(currentPhoto?.caption || '');
  }, [currentIndex, currentPhoto?.caption]);

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      onNavigate(currentIndex - 1);
    }
  }, [currentIndex, onNavigate]);

  const handleNext = useCallback(() => {
    if (currentIndex < photos.length - 1) {
      onNavigate(currentIndex + 1);
    }
  }, [currentIndex, photos.length, onNavigate]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditingCaption) return; // Don't navigate while editing

      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          handlePrevious();
          break;
        case 'ArrowRight':
          handleNext();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, handlePrevious, handleNext, isEditingCaption]);

  // Prevent body scroll when lightbox is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Touch swipe handling
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null || isEditingCaption) return;

    const touchEnd = e.changedTouches[0].clientX;
    const diff = touchStart - touchEnd;

    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        handleNext();
      } else {
        handlePrevious();
      }
    }

    setTouchStart(null);
  };

  const handleDownload = async () => {
    if (!currentPhoto.url) return;

    try {
      const response = await fetch(currentPhoto.url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = currentPhoto.original_filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: open in new tab
      window.open(currentPhoto.url, '_blank');
    }
  };

  const handleDelete = async () => {
    if (!onDelete || isDeleting) return;

    if (!confirm('Are you sure you want to delete this photo?')) return;

    setIsDeleting(true);
    try {
      await onDelete(currentPhoto.id);
      // If we deleted the last photo, close lightbox
      if (photos.length === 1) {
        onClose();
      } else if (currentIndex >= photos.length - 1) {
        // If at end, go to previous
        onNavigate(currentIndex - 1);
      }
    } catch (error) {
      console.error('Delete failed:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveCaption = async () => {
    if (!onCaptionUpdate || isSavingCaption) return;

    setIsSavingCaption(true);
    try {
      await onCaptionUpdate(currentPhoto.id, captionText);
      setIsEditingCaption(false);
    } catch (error) {
      console.error('Caption update failed:', error);
    } finally {
      setIsSavingCaption(false);
    }
  };

  const handleToggleHidden = async () => {
    if (!onToggleHidden || isTogglingHidden) return;

    setIsTogglingHidden(true);
    try {
      await onToggleHidden(currentPhoto.id, !currentPhoto.is_hidden);
    } catch (error) {
      console.error('Toggle hidden failed:', error);
    } finally {
      setIsTogglingHidden(false);
    }
  };

  if (!currentPhoto?.url) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top toolbar */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        {/* Caption edit button */}
        {canEdit && onCaptionUpdate && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsEditingCaption(true);
              setCaptionText(currentPhoto.caption || '');
            }}
            className="w-10 h-10 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white transition-colors"
            title="Edit caption"
          >
            <PencilIcon className="w-5 h-5" />
          </button>
        )}

        {/* Hide/Unhide button (admin only) */}
        {isAdmin && onToggleHidden && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleToggleHidden();
            }}
            disabled={isTogglingHidden}
            className={`w-10 h-10 rounded-full flex items-center justify-center text-white transition-colors disabled:opacity-50 ${
              currentPhoto.is_hidden
                ? 'bg-yellow-600/70 hover:bg-yellow-600'
                : 'bg-black/50 hover:bg-black/70'
            }`}
            title={currentPhoto.is_hidden ? 'Unhide photo' : 'Hide photo'}
          >
            {currentPhoto.is_hidden ? (
              <EyeIcon className="w-5 h-5" />
            ) : (
              <EyeSlashIcon className="w-5 h-5" />
            )}
          </button>
        )}

        {/* Download button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleDownload();
          }}
          className="w-10 h-10 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white transition-colors"
          title="Download"
        >
          <ArrowDownTrayIcon className="w-5 h-5" />
        </button>

        {/* Delete button */}
        {canEdit && onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            disabled={isDeleting}
            className="w-10 h-10 bg-red-600/70 hover:bg-red-600 rounded-full flex items-center justify-center text-white transition-colors disabled:opacity-50"
            title="Delete photo"
          >
            <TrashIcon className="w-5 h-5" />
          </button>
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          className="w-10 h-10 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white transition-colors"
        >
          <XMarkIcon className="w-6 h-6" />
        </button>
      </div>

      {/* Previous button */}
      {currentIndex > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handlePrevious();
          }}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white transition-colors"
        >
          <ChevronLeftIcon className="w-8 h-8" />
        </button>
      )}

      {/* Next button */}
      {currentIndex < photos.length - 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleNext();
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white transition-colors"
        >
          <ChevronRightIcon className="w-8 h-8" />
        </button>
      )}

      {/* Image or Document Preview */}
      <div
        className="relative max-w-[90vw] max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {isImageFile(currentPhoto.original_filename) ? (
          <Image
            src={currentPhoto.url}
            alt={currentPhoto.original_filename}
            width={1200}
            height={800}
            className="max-w-full max-h-[85vh] object-contain"
            priority
          />
        ) : (
          /* Non-image file preview */
          <div className="flex flex-col items-center justify-center bg-gray-800 rounded-lg p-12 min-w-[300px]">
            <div className="w-24 h-24 bg-gray-700 rounded-lg flex items-center justify-center mb-4">
              <DocumentIcon className="w-12 h-12 text-gray-400" />
            </div>
            <div className="text-center">
              <p className="text-white font-medium text-lg mb-1 max-w-[400px] truncate">
                {currentPhoto.original_filename}
              </p>
              <p className="text-gray-400 text-sm">
                {getFileExtension(currentPhoto.original_filename)} File
                {currentPhoto.file_size && ` • ${formatFileSize(currentPhoto.file_size)}`}
              </p>
            </div>
            <button
              onClick={handleDownload}
              className="mt-6 px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-2 transition-colors"
            >
              <ArrowDownTrayIcon className="w-5 h-5" />
              Download File
            </button>
          </div>
        )}
      </div>

      {/* Photo info */}
      <div
        className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="max-w-3xl mx-auto">
          {/* Caption display/edit */}
          {isEditingCaption ? (
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={captionText}
                onChange={(e) => setCaptionText(e.target.value)}
                placeholder="Add a caption..."
                className="flex-1 bg-white/20 border border-white/30 rounded px-3 py-1.5 text-sm text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/50"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveCaption();
                  if (e.key === 'Escape') setIsEditingCaption(false);
                }}
              />
              <button
                onClick={handleSaveCaption}
                disabled={isSavingCaption}
                className="w-8 h-8 bg-green-600 hover:bg-green-700 rounded-full flex items-center justify-center text-white disabled:opacity-50"
              >
                <CheckIcon className="w-5 h-5" />
              </button>
              <button
                onClick={() => setIsEditingCaption(false)}
                className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
          ) : currentPhoto.caption ? (
            <p className="text-sm mb-2">{currentPhoto.caption}</p>
          ) : canEdit && onCaptionUpdate ? (
            <button
              onClick={() => {
                setIsEditingCaption(true);
                setCaptionText('');
              }}
              className="text-sm text-white/60 hover:text-white mb-2"
            >
              + Add caption
            </button>
          ) : null}

          <div className="flex items-center justify-between text-xs text-gray-300">
            <div className="flex items-center gap-4">
              {currentPhoto.is_hidden && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-600/80 text-white rounded-full text-xs font-medium">
                  <EyeSlashIcon className="w-3 h-3" />
                  Hidden
                </span>
              )}
              {currentPhoto.taken_at && (
                <span>Taken: {formatDate(currentPhoto.taken_at)}</span>
              )}
              {currentPhoto.uploader && (
                <span>Uploaded by: {currentPhoto.uploader.full_name}</span>
              )}
            </div>
            <span>
              {currentIndex + 1} / {photos.length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
