'use client';

import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  PhotoIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowUpTrayIcon,
  DocumentIcon,
  FilmIcon,
} from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils';

interface UploadState {
  progress: number;
  status: 'pending' | 'extracting' | 'compressing' | 'uploading' | 'complete' | 'error';
  error?: string;
  takenAt?: string;
}

interface PhotoUploaderProps {
  workstreamId: string;
  onUploadComplete?: (photos: { id: string; storage_path: string }[]) => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024; // 10GB
const MAX_IMAGE_SIZE_FOR_COMPRESSION = 10 * 1024 * 1024; // 10MB - compress images under this
const MAX_DIMENSION = 2048;
const TARGET_SIZE = 3.5 * 1024 * 1024; // 3.5MB for API upload
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska', 'video/x-m4v', 'video/ogg'];

// Check if file is an image
function isImageFile(file: File): boolean {
  return IMAGE_TYPES.includes(file.type) || file.type.startsWith('image/');
}

// Check if file is a video
function isVideoFile(file: File): boolean {
  return VIDEO_TYPES.includes(file.type) || file.type.startsWith('video/');
}

// Extract EXIF date from JPEG before compression strips it
function extractExifDate(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const view = new DataView(e.target?.result as ArrayBuffer);

        // Check for JPEG marker
        if (view.getUint16(0) !== 0xFFD8) {
          resolve(null);
          return;
        }

        let offset = 2;
        while (offset < view.byteLength) {
          const marker = view.getUint16(offset);

          // APP1 marker (EXIF)
          if (marker === 0xFFE1) {
            const exifStart = offset + 4;

            // Check for "Exif\0\0"
            if (view.getUint32(exifStart) === 0x45786966 && view.getUint16(exifStart + 4) === 0x0000) {
              const tiffStart = exifStart + 6;
              const littleEndian = view.getUint16(tiffStart) === 0x4949;

              const ifdOffset = view.getUint32(tiffStart + 4, littleEndian);
              const numEntries = view.getUint16(tiffStart + ifdOffset, littleEndian);

              // Search IFD0 for ExifIFD pointer
              for (let i = 0; i < numEntries; i++) {
                const entryOffset = tiffStart + ifdOffset + 2 + i * 12;
                const tag = view.getUint16(entryOffset, littleEndian);

                // ExifIFD pointer (0x8769)
                if (tag === 0x8769) {
                  const exifIfdOffset = view.getUint32(entryOffset + 8, littleEndian);
                  const exifNumEntries = view.getUint16(tiffStart + exifIfdOffset, littleEndian);

                  // Search ExifIFD for DateTimeOriginal
                  for (let j = 0; j < exifNumEntries; j++) {
                    const exifEntryOffset = tiffStart + exifIfdOffset + 2 + j * 12;
                    const exifTag = view.getUint16(exifEntryOffset, littleEndian);

                    // DateTimeOriginal (0x9003)
                    if (exifTag === 0x9003) {
                      const valueOffset = view.getUint32(exifEntryOffset + 8, littleEndian);
                      const dateString = String.fromCharCode(
                        ...new Uint8Array(e.target?.result as ArrayBuffer, tiffStart + valueOffset, 19)
                      );

                      // Parse "YYYY:MM:DD HH:MM:SS" to ISO format
                      const match = dateString.match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
                      if (match) {
                        const isoDate = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`;
                        resolve(isoDate);
                        return;
                      }
                    }
                  }
                }
              }
            }
            break;
          }

          // Move to next marker
          if ((marker & 0xFF00) !== 0xFF00) break;
          offset += 2 + view.getUint16(offset + 2);
        }

        resolve(null);
      } catch {
        resolve(null);
      }
    };
    reader.onerror = () => resolve(null);
    reader.readAsArrayBuffer(file);
  });
}

// Compress image using canvas
function compressImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      // Scale down if needed
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Try decreasing quality until under target size
      let quality = 0.9;
      const tryCompress = () => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image'));
              return;
            }

            if (blob.size > TARGET_SIZE && quality > 0.1) {
              quality -= 0.1;
              tryCompress();
            } else {
              resolve({ blob, width, height });
            }
          },
          'image/jpeg',
          quality
        );
      };

      tryCompress();
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

// Create thumbnail
function createThumbnail(file: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const THUMB_SIZE = 400;
      let { width, height } = img;

      const ratio = Math.min(THUMB_SIZE / width, THUMB_SIZE / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to create thumbnail'));
            return;
          }
          resolve(blob);
        },
        'image/jpeg',
        0.8
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

export function PhotoUploader({ workstreamId, onUploadComplete }: PhotoUploaderProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploadStates, setUploadStates] = useState<UploadState[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((newFiles: FileList | File[]) => {
    const validFiles: File[] = [];
    const newPreviews: string[] = [];
    const newStates: UploadState[] = [];

    Array.from(newFiles).forEach((file) => {
      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        console.warn(`File ${file.name} exceeds ${MAX_FILE_SIZE / (1024 * 1024 * 1024)}GB limit`);
        return;
      }

      validFiles.push(file);
      // Only create preview URL for images
      if (isImageFile(file)) {
        newPreviews.push(URL.createObjectURL(file));
      } else {
        newPreviews.push(''); // Placeholder for non-images
      }
      newStates.push({ progress: 0, status: 'pending' });
    });

    setFiles((prev) => [...prev, ...validFiles]);
    setPreviews((prev) => [...prev, ...newPreviews]);
    setUploadStates((prev) => [...prev, ...newStates]);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const removeFile = useCallback((index: number) => {
    if (previews[index]) {
      URL.revokeObjectURL(previews[index]);
    }
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
    setUploadStates((prev) => prev.filter((_, i) => i !== index));
  }, [previews]);

  const updateState = (index: number, updates: Partial<UploadState>) => {
    setUploadStates((prev) => {
      const newStates = [...prev];
      newStates[index] = { ...newStates[index], ...updates };
      return newStates;
    });
  };

  const uploadFile = async (file: File, index: number): Promise<{ id: string; storage_path: string } | null> => {
    try {
      const isImage = isImageFile(file);
      const shouldCompress = isImage && file.size <= MAX_IMAGE_SIZE_FOR_COMPRESSION;

      let takenAt: string | null = null;
      let uploadBlob: Blob = file;
      let thumbnailBlob: Blob | null = null;
      let width: number | null = null;
      let height: number | null = null;

      if (isImage) {
        // Step 1: Extract EXIF date for images
        updateState(index, { status: 'extracting', progress: 10 });
        takenAt = await extractExifDate(file);
        updateState(index, { takenAt: takenAt || undefined });

        if (shouldCompress) {
          // Step 2: Compress image if small enough
          updateState(index, { status: 'compressing', progress: 30 });
          const compressed = await compressImage(file);
          uploadBlob = compressed.blob;
          width = compressed.width;
          height = compressed.height;

          // Step 3: Create thumbnail
          updateState(index, { progress: 50 });
          thumbnailBlob = await createThumbnail(uploadBlob);
        }
      }

      // Step 4: Upload file
      updateState(index, { status: 'uploading', progress: 60 });

      // For large files or non-images, upload directly to Supabase
      const useDirectUpload = file.size > TARGET_SIZE || !shouldCompress;

      if (useDirectUpload) {
        // Get presigned upload URL from R2
        const presignResponse = await fetch('/api/photos/presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type || 'application/octet-stream',
            workstreamId,
          }),
        });

        if (!presignResponse.ok) {
          throw new Error('Failed to get upload URL');
        }

        const { uploadUrl, key: storagePath } = await presignResponse.json();

        // Upload directly to R2 via presigned URL
        const uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: uploadBlob,
        });

        if (!uploadResponse.ok) {
          throw new Error('Failed to upload file');
        }

        updateState(index, { progress: 80 });

        // Register metadata in database
        const response = await fetch('/api/photos/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workstreamId,
            storagePath,
            originalFilename: file.name,
            fileSize: uploadBlob.size,
            width,
            height,
            takenAt,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to register file');
        }

        const result = await response.json();
        updateState(index, { status: 'complete', progress: 100 });
        return { id: result.id, storage_path: result.storage_path };
      } else {
        // Use existing API upload for small compressed images
        const formData = new FormData();
        formData.append('file', uploadBlob, file.name.replace(/\.[^.]+$/, '.jpg'));
        if (thumbnailBlob) {
          formData.append('thumbnail', thumbnailBlob, `thumb_${file.name.replace(/\.[^.]+$/, '.jpg')}`);
        }
        formData.append('workstreamId', workstreamId);
        formData.append('originalFilename', file.name);
        if (width) formData.append('width', width.toString());
        if (height) formData.append('height', height.toString());
        formData.append('fileSize', uploadBlob.size.toString());
        if (takenAt) {
          formData.append('takenAt', takenAt);
        }

        const response = await fetch('/api/photos/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Upload failed');
        }

        const result = await response.json();
        updateState(index, { status: 'complete', progress: 100 });
        return { id: result.id, storage_path: result.storage_path };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      updateState(index, { status: 'error', error: message });
      return null;
    }
  };

  const handleUpload = async () => {
    if (files.length === 0 || isUploading) return;

    setIsUploading(true);
    const results: { id: string; storage_path: string }[] = [];

    // Upload files sequentially to avoid overwhelming the server
    for (let i = 0; i < files.length; i++) {
      if (uploadStates[i].status === 'complete') continue;

      const result = await uploadFile(files[i], i);
      if (result) {
        results.push(result);
      }
    }

    setIsUploading(false);

    if (results.length > 0 && onUploadComplete) {
      onUploadComplete(results);
    }
  };

  const pendingCount = uploadStates.filter((s) => s.status === 'pending').length;
  const completedCount = uploadStates.filter((s) => s.status === 'complete').length;
  const errorCount = uploadStates.filter((s) => s.status === 'error').length;

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
          isDragging
            ? 'border-red-500 bg-red-50'
            : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
          className="hidden"
        />
        <PhotoIcon className="w-12 h-12 mx-auto text-gray-400 mb-3" />
        <p className="text-sm text-gray-600">
          <span className="font-medium text-red-600">Click to upload</span> or drag and drop
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Images, documents, and other files up to {MAX_FILE_SIZE / (1024 * 1024 * 1024)}GB each
        </p>
      </div>

      {/* Preview grid */}
      {files.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {files.map((file, index) => (
            <div key={index} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
              {previews[index] ? (
                <img
                  src={previews[index]}
                  alt={file.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className={cn(
                  "w-full h-full flex flex-col items-center justify-center p-2",
                  isVideoFile(file) ? "bg-gray-800" : "bg-gray-100"
                )}>
                  {isVideoFile(file) ? (
                    <FilmIcon className="w-12 h-12 text-gray-400 mb-2" />
                  ) : (
                    <DocumentIcon className="w-12 h-12 text-gray-400 mb-2" />
                  )}
                  <p className={cn(
                    "text-xs text-center truncate w-full px-2",
                    isVideoFile(file) ? "text-gray-300" : "text-gray-600"
                  )}>
                    {file.name}
                  </p>
                  <p className={cn(
                    "text-xs",
                    isVideoFile(file) ? "text-gray-500" : "text-gray-400"
                  )}>
                    {(file.size / (1024 * 1024)).toFixed(1)} MB
                  </p>
                </div>
              )}

              {/* Status overlay */}
              {uploadStates[index].status !== 'pending' && uploadStates[index].status !== 'complete' && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <div className="text-white text-center">
                    <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-xs mt-2">
                      {uploadStates[index].status === 'extracting' && 'Reading EXIF...'}
                      {uploadStates[index].status === 'compressing' && 'Compressing...'}
                      {uploadStates[index].status === 'uploading' && 'Uploading...'}
                    </p>
                  </div>
                </div>
              )}

              {/* Complete overlay */}
              {uploadStates[index].status === 'complete' && (
                <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                  <CheckCircleIcon className="w-8 h-8 text-green-600" />
                </div>
              )}

              {/* Error overlay */}
              {uploadStates[index].status === 'error' && (
                <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
                  <div className="text-center">
                    <ExclamationCircleIcon className="w-8 h-8 text-red-600 mx-auto" />
                    <p className="text-xs text-red-700 mt-1 px-2">
                      {uploadStates[index].error}
                    </p>
                  </div>
                </div>
              )}

              {/* Remove button */}
              {!isUploading && uploadStates[index].status !== 'complete' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(index);
                  }}
                  className="absolute top-2 right-2 w-6 h-6 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              )}

              {/* Progress bar */}
              {uploadStates[index].status !== 'pending' && uploadStates[index].status !== 'complete' && uploadStates[index].status !== 'error' && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200">
                  <div
                    className="h-full bg-red-500 transition-all duration-300"
                    style={{ width: `${uploadStates[index].progress}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      {files.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            {pendingCount > 0 && `${pendingCount} ready to upload`}
            {completedCount > 0 && ` • ${completedCount} uploaded`}
            {errorCount > 0 && ` • ${errorCount} failed`}
          </p>
          <Button
            onClick={handleUpload}
            disabled={isUploading || pendingCount === 0}
            loading={isUploading}
          >
            <ArrowUpTrayIcon className="w-4 h-4 mr-2" />
            Upload {pendingCount} File{pendingCount !== 1 ? 's' : ''}
          </Button>
        </div>
      )}
    </div>
  );
}
