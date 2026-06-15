'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  PhotoIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowUpTrayIcon,
  DocumentIcon,
  FilmIcon,
  LockClosedIcon,
} from '@heroicons/react/24/outline';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'avi', 'mkv', 'm4v', 'ogv', 'wmv'];
const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024;

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_EXTENSIONS.includes(file.name.split('.').pop()?.toLowerCase() || '');
}

function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || VIDEO_EXTENSIONS.includes(file.name.split('.').pop()?.toLowerCase() || '');
}

interface UploadState {
  progress: number;
  status: 'pending' | 'uploading' | 'complete' | 'error';
  error?: string;
}

interface LinkInfo {
  name: string;
  workstream: { name: string; color: string };
  expires_at?: string;
  max_files?: number;
  upload_count: number;
}

export default function PublicUploadPage() {
  const params = useParams();
  const token = params.token as string;

  const [linkInfo, setLinkInfo] = useState<LinkInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploadStates, setUploadStates] = useState<UploadState[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const validate = async () => {
      try {
        const res = await fetch(`/api/upload-links/${token}/presign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: '__validate__', contentType: 'text/plain' }),
        });

        if (!res.ok) {
          const data = await res.json();
          setError(data.error || 'Invalid or expired upload link');
          setLoading(false);
          return;
        }

        // Fetch link metadata via a simple validation call
        // We'll get the link info from a dedicated endpoint
        const infoRes = await fetch(`/api/upload-links/${token}/info`);
        if (infoRes.ok) {
          setLinkInfo(await infoRes.json());
        }
      } catch {
        setError('Failed to validate upload link');
      }
      setLoading(false);
    };
    validate();
  }, [token]);

  const handleFiles = useCallback((newFiles: FileList | File[]) => {
    const validFiles: File[] = [];
    const newPreviews: string[] = [];
    const newStates: UploadState[] = [];

    Array.from(newFiles).forEach((file) => {
      if (file.size > MAX_FILE_SIZE) return;
      validFiles.push(file);
      newPreviews.push(isImageFile(file) ? URL.createObjectURL(file) : '');
      newStates.push({ progress: 0, status: 'pending' });
    });

    setFiles((prev) => [...prev, ...validFiles]);
    setPreviews((prev) => [...prev, ...newPreviews]);
    setUploadStates((prev) => [...prev, ...newStates]);
  }, []);

  const removeFile = (index: number) => {
    if (previews[index]) URL.revokeObjectURL(previews[index]);
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
    setUploadStates((prev) => prev.filter((_, i) => i !== index));
  };

  const updateState = (index: number, updates: Partial<UploadState>) => {
    setUploadStates((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const uploadFile = async (file: File, index: number) => {
    try {
      updateState(index, { status: 'uploading', progress: 10 });

      // Get presigned URL
      const presignRes = await fetch(`/api/upload-links/${token}/presign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
        }),
      });

      if (!presignRes.ok) {
        const data = await presignRes.json();
        throw new Error(data.error || 'Failed to get upload URL');
      }

      const { uploadUrl, key } = await presignRes.json();
      updateState(index, { progress: 15 });

      // Upload to R2 with progress
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round(15 + (e.loaded / e.total) * 75);
            updateState(index, { progress: pct });
          }
        };

        xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Upload failed'));
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(file);
      });

      updateState(index, { progress: 92 });

      // Register metadata
      const regRes = await fetch(`/api/upload-links/${token}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storagePath: key,
          originalFilename: file.name,
          fileSize: file.size,
        }),
      });

      if (!regRes.ok) {
        const data = await regRes.json();
        throw new Error(data.error || 'Failed to register file');
      }

      updateState(index, { status: 'complete', progress: 100 });
      setUploadedCount((prev) => prev + 1);
    } catch (err) {
      updateState(index, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Upload failed',
      });
    }
  };

  const handleUploadAll = async () => {
    setIsUploading(true);
    const pending = files
      .map((file, index) => ({ file, index }))
      .filter(({ index }) => uploadStates[index].status === 'pending');

    for (const { file, index } of pending) {
      await uploadFile(file, index);
    }
    setIsUploading(false);
  };

  const pendingCount = uploadStates.filter((s) => s.status === 'pending').length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <LockClosedIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Upload Link Unavailable</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto p-6">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-red-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-xl">S</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">
            {linkInfo?.name || 'File Upload'}
          </h1>
          {linkInfo?.workstream && (
            <p className="text-sm text-gray-500 mt-1">
              Uploading to{' '}
              <span
                className="font-medium"
                style={{ color: linkInfo.workstream.color }}
              >
                {linkInfo.workstream.name}
              </span>
            </p>
          )}
          {uploadedCount > 0 && (
            <p className="text-sm text-green-600 mt-2">
              {uploadedCount} file{uploadedCount !== 1 ? 's' : ''} uploaded successfully
            </p>
          )}
        </div>

        {/* Drop zone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
          className={cn(
            'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors mb-6',
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
          <ArrowUpTrayIcon className="w-10 h-10 mx-auto text-gray-400 mb-3" />
          <p className="text-sm text-gray-600">
            <span className="font-medium text-red-600">Click to upload</span> or drag and drop
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Files up to {MAX_FILE_SIZE / (1024 * 1024 * 1024)}GB each
          </p>
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 mb-6">
            {files.map((file, index) => {
              const state = uploadStates[index];
              return (
                <div key={index} className="flex items-center gap-3 p-3">
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                    {isImageFile(file) && previews[index] ? (
                      <img src={previews[index]} alt="" className="w-full h-full object-cover rounded-lg" />
                    ) : isVideoFile(file) ? (
                      <FilmIcon className="w-5 h-5 text-gray-400" />
                    ) : (
                      <DocumentIcon className="w-5 h-5 text-gray-400" />
                    )}
                  </div>

                  {/* Name and progress */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs text-gray-500">
                        {file.size < 1024 * 1024
                          ? `${(file.size / 1024).toFixed(0)} KB`
                          : `${(file.size / (1024 * 1024)).toFixed(1)} MB`}
                      </p>
                      {state.status === 'uploading' && (
                        <span className="text-xs text-red-600 font-medium">{state.progress}%</span>
                      )}
                      {state.status === 'complete' && (
                        <span className="text-xs text-green-600 font-medium">Done</span>
                      )}
                      {state.status === 'error' && (
                        <span className="text-xs text-red-600">{state.error}</span>
                      )}
                    </div>
                    {(state.status === 'uploading') && (
                      <div className="w-full bg-gray-200 rounded-full h-1 mt-1.5">
                        <div
                          className="bg-red-600 h-1 rounded-full transition-all duration-300"
                          style={{ width: `${state.progress}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Status icon / remove */}
                  <div className="flex-shrink-0">
                    {state.status === 'complete' ? (
                      <CheckCircleIcon className="w-5 h-5 text-green-500" />
                    ) : state.status === 'error' ? (
                      <ExclamationCircleIcon className="w-5 h-5 text-red-500" />
                    ) : state.status === 'pending' && !isUploading ? (
                      <button
                        onClick={() => removeFile(index)}
                        className="w-6 h-6 rounded-full hover:bg-gray-100 flex items-center justify-center"
                      >
                        <XMarkIcon className="w-4 h-4 text-gray-400" />
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Upload button */}
        {pendingCount > 0 && (
          <button
            onClick={handleUploadAll}
            disabled={isUploading}
            className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium rounded-xl transition-colors"
          >
            {isUploading
              ? 'Uploading...'
              : `Upload ${pendingCount} file${pendingCount !== 1 ? 's' : ''}`}
          </button>
        )}
      </div>
    </div>
  );
}
