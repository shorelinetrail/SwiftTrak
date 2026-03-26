import JSZip from 'jszip';
import type { Attachment } from '@/types/database';

export type DownloadProgress = {
  total: number;
  completed: number;
  failed: number;
  currentFile: string;
  phase: 'downloading' | 'zipping' | 'done';
};

const MAX_RETRIES = 3;
const CONCURRENCY = 6;

async function fetchWithRetry(
  url: string,
  retries = MAX_RETRIES
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      // 4xx errors (except 429) are not retryable
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (err) {
      if (attempt === retries) throw err;
    }
    // Exponential backoff: 500ms, 1s, 2s
    await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
  }
  throw new Error('Max retries exceeded');
}

/**
 * Run async tasks with limited concurrency.
 */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const index = nextIndex++;
      results[index] = await tasks[index]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Downloads multiple attachments and bundles them into a zip file.
 * Uses concurrent fetching with retries for reliability.
 */
export async function bulkDownloadAttachments(
  attachments: Attachment[],
  zipFileName: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<{ total: number; succeeded: number; failed: number }> {
  if (attachments.length === 0) return { total: 0, succeeded: 0, failed: 0 };

  // Single file — just download directly
  if (attachments.length === 1) {
    const attachment = attachments[0];
    const link = document.createElement('a');
    link.href = attachment.file_url;
    link.download = attachment.file_name;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return { total: 1, succeeded: 1, failed: 0 };
  }

  const zip = new JSZip();
  const fileNameCounts = new Map<string, number>();
  let completed = 0;
  let failed = 0;

  const entityTypes = new Set(attachments.map((a) => a.entity_type));
  const useSubfolders = entityTypes.size > 1;

  const tasks = attachments.map((attachment) => async () => {
    onProgress?.({
      total: attachments.length,
      completed,
      failed,
      currentFile: attachment.file_name,
      phase: 'downloading',
    });

    try {
      const response = await fetchWithRetry(attachment.file_url);
      const blob = await response.blob();

      let fileName = attachment.file_name;
      const key = useSubfolders
        ? `${attachment.entity_type}/${fileName}`
        : fileName;
      const count = fileNameCounts.get(key) || 0;
      if (count > 0) {
        const dotIndex = fileName.lastIndexOf('.');
        if (dotIndex > 0) {
          fileName = `${fileName.slice(0, dotIndex)} (${count})${fileName.slice(dotIndex)}`;
        } else {
          fileName = `${fileName} (${count})`;
        }
      }
      fileNameCounts.set(key, count + 1);

      const path = useSubfolders
        ? `${attachment.entity_type}/${fileName}`
        : fileName;
      zip.file(path, blob);
    } catch {
      failed++;
      console.warn(`Failed to fetch after retries: ${attachment.file_name}`);
    } finally {
      completed++;
      onProgress?.({
        total: attachments.length,
        completed,
        failed,
        currentFile: attachment.file_name,
        phase: 'downloading',
      });
    }
  });

  await runWithConcurrency(tasks, CONCURRENCY);

  onProgress?.({
    total: attachments.length,
    completed: attachments.length,
    failed,
    currentFile: 'Creating zip...',
    phase: 'zipping',
  });

  const content = await zip.generateAsync({ type: 'blob' });

  // Trigger download
  const url = URL.createObjectURL(content);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${zipFileName}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  onProgress?.({
    total: attachments.length,
    completed: attachments.length,
    failed,
    currentFile: '',
    phase: 'done',
  });

  return { total: attachments.length, succeeded: attachments.length - failed, failed };
}

/**
 * Downloads files by URL into a zip. Used by the Files/Photos page
 * where files have signed URLs rather than Attachment records.
 */
export async function bulkDownloadFiles(
  files: Array<{ url: string; filename: string }>,
  zipFileName: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<{ total: number; succeeded: number; failed: number }> {
  if (files.length === 0) return { total: 0, succeeded: 0, failed: 0 };

  if (files.length === 1) {
    const file = files[0];
    const link = document.createElement('a');
    link.href = file.url;
    link.download = file.filename;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return { total: 1, succeeded: 1, failed: 0 };
  }

  const zip = new JSZip();
  const fileNameCounts = new Map<string, number>();
  let completed = 0;
  let failed = 0;

  const tasks = files.map((file) => async () => {
    onProgress?.({
      total: files.length,
      completed,
      failed,
      currentFile: file.filename,
      phase: 'downloading',
    });

    try {
      const response = await fetchWithRetry(file.url);
      const blob = await response.blob();

      let fileName = file.filename;
      const count = fileNameCounts.get(fileName) || 0;
      if (count > 0) {
        const dotIndex = fileName.lastIndexOf('.');
        if (dotIndex > 0) {
          fileName = `${fileName.slice(0, dotIndex)} (${count})${fileName.slice(dotIndex)}`;
        } else {
          fileName = `${fileName} (${count})`;
        }
      }
      fileNameCounts.set(file.filename, count + 1);
      zip.file(fileName, blob);
    } catch {
      failed++;
      console.warn(`Failed to fetch after retries: ${file.filename}`);
    } finally {
      completed++;
      onProgress?.({
        total: files.length,
        completed,
        failed,
        currentFile: file.filename,
        phase: 'downloading',
      });
    }
  });

  await runWithConcurrency(tasks, CONCURRENCY);

  onProgress?.({
    total: files.length,
    completed: files.length,
    failed,
    currentFile: 'Creating zip...',
    phase: 'zipping',
  });

  const content = await zip.generateAsync({ type: 'blob' });

  const url = URL.createObjectURL(content);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${zipFileName}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  onProgress?.({
    total: files.length,
    completed: files.length,
    failed,
    currentFile: '',
    phase: 'done',
  });

  return { total: files.length, succeeded: files.length - failed, failed };
}
