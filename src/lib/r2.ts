import { S3Client, PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'swift-trak';

// Client for server-side operations (send commands)
const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

// Client for presigned URLs — endpoint includes the bucket so the
// generated URL is path-style (account.r2.../bucket/key) and avoids
// the virtual-hosted subdomain that has no SSL cert.
const r2PresignClient = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET_NAME}`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

export function getR2Client() {
  return r2Client;
}

export function getBucketName() {
  return R2_BUCKET_NAME;
}

export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 3600
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(r2PresignClient, command, { expiresIn });
}

export async function getPresignedDownloadUrl(
  key: string,
  expiresIn = 3600,
  downloadFilename?: string
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ...(downloadFilename && {
      ResponseContentDisposition: `attachment; filename="${downloadFilename}"`,
    }),
  });
  return getSignedUrl(r2PresignClient, command, { expiresIn });
}

export async function getPresignedDownloadUrls(
  keys: string[],
  expiresIn = 3600
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const BATCH_SIZE = 50;
  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    const batch = keys.slice(i, i + BATCH_SIZE);
    const urls = await Promise.all(
      batch.map(async (key) => {
        try {
          const url = await getPresignedDownloadUrl(key, expiresIn);
          return { key, url };
        } catch {
          return { key, url: '' };
        }
      })
    );
    for (const { key, url } of urls) {
      if (url) results.set(key, url);
    }
  }
  return results;
}

export async function deleteR2Object(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  });
  await r2Client.send(command);
}

export async function deleteR2Objects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const command = new DeleteObjectsCommand({
    Bucket: R2_BUCKET_NAME,
    Delete: {
      Objects: keys.map((Key) => ({ Key })),
    },
  });
  await r2Client.send(command);
}
