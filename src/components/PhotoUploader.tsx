'use client';

import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  PhotoIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowUpTrayIcon,
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

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_DIMENSION = 2048;
const TARGET_SIZE = 3.5 * 1024 * 1024; // 3.5MB for Vercel limit
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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
      if (!ACCEPTED_TYPES.includes(file.type)) {
        return;
      }

      validFiles.push(file);
      newPreviews.push(URL.createObjectURL(file));
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
    URL.revokeObjectURL(previews[index]);
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
      // Step 1: Extract EXIF date
      updateState(index, { status: 'extracting', progress: 10 });
      const takenAt = await extractExifDate(file);
      updateState(index, { takenAt: takenAt || undefined });

      // Step 2: Compress image
      updateState(index, { status: 'compressing', progress: 30 });
      const { blob: compressedBlob, width, height } = await compressImage(file);

      // Step 3: Create thumbnail
      updateState(index, { progress: 50 });
      const thumbnailBlob = await createThumbnail(compressedBlob);

      // Step 4: Upload to API
      updateState(index, { status: 'uploading', progress: 60 });

      const formData = new FormData();
      formData.append('file', compressedBlob, file.name.replace(/\.[^.]+$/, '.jpg'));
      formData.append('thumbnail', thumbnailBlob, `thumb_${file.name.replace(/\.[^.]+$/, '.jpg')}`);
      formData.append('workstreamId', workstreamId);
      formData.append('originalFilename', file.name);
      formData.append('width', width.toString());
      formData.append('height', height.toString());
      formData.append('fileSize', compressedBlob.size.toString());
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
          accept={ACCEPTED_TYPES.join(',')}
          multiple
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
          className="hidden"
        />
        <PhotoIcon className="w-12 h-12 mx-auto text-gray-400 mb-3" />
        <p className="text-sm text-gray-600">
          <span className="font-medium text-red-600">Click to upload</span> or drag and drop
        </p>
        <p className="text-xs text-gray-500 mt-1">
          JPEG, PNG, WebP up to 10MB each
        </p>
      </div>

      {/* Preview grid */}
      {files.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {files.map((file, index) => (
            <div key={index} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
              <img
                src={previews[index]}
                alt={file.name}
                className="w-full h-full object-cover"
              />

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
            Upload {pendingCount} Photo{pendingCount !== 1 ? 's' : ''}
          </Button>
        </div>
      )}
    </div>
  );
}
