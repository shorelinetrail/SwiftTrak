import JSZip from 'jszip';
import type { Attachment } from '@/types/database';

export type DownloadProgress = {
  total: number;
  completed: number;
  currentFile: string;
};

/**
 * Downloads multiple attachments and bundles them into a zip file.
 * Files are organized by entity type if mixed, or flat if from a single entity.
 */
export async function bulkDownloadAttachments(
  attachments: Attachment[],
  zipFileName: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
  if (attachments.length === 0) return;

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
    return;
  }

  const zip = new JSZip();
  const fileNameCounts = new Map<string, number>();

  // Check if attachments span multiple entity types
  const entityTypes = new Set(attachments.map((a) => a.entity_type));
  const useSubfolders = entityTypes.size > 1;

  for (let i = 0; i < attachments.length; i++) {
    const attachment = attachments[i];

    onProgress?.({
      total: attachments.length,
      completed: i,
      currentFile: attachment.file_name,
    });

    try {
      const response = await fetch(attachment.file_url);
      if (!response.ok) continue;

      const blob = await response.blob();

      // Deduplicate file names
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
      // Skip files that fail to fetch
      console.warn(`Failed to fetch: ${attachment.file_name}`);
    }
  }

  onProgress?.({
    total: attachments.length,
    completed: attachments.length,
    currentFile: 'Creating zip...',
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
}
