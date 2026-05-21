import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getR2Client, getBucketName, deleteR2Objects } from '@/lib/r2';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: profile } = await adminClient
      .from('users')
      .select('id, role')
      .eq('auth_id', user.id)
      .single();

    if (!profile) {
      const { data: profileById } = await adminClient
        .from('users')
        .select('id, role')
        .eq('id', user.id)
        .single();

      if (!profileById || !['admin', 'edit'].includes(profileById.role)) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
      }
    } else if (!['admin', 'edit'].includes(profile.role)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const userId = profile?.id || user.id;

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const thumbnail = formData.get('thumbnail') as File;
    const workstreamId = formData.get('workstreamId') as string;
    const originalFilename = formData.get('originalFilename') as string;
    const width = parseInt(formData.get('width') as string) || null;
    const height = parseInt(formData.get('height') as string) || null;
    const fileSize = parseInt(formData.get('fileSize') as string) || null;
    const takenAt = formData.get('takenAt') as string | null;

    if (!file || !workstreamId || !originalFilename) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const r2 = getR2Client();
    const bucket = getBucketName();

    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const sanitizedFilename = originalFilename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const basePath = `${workstreamId}/${timestamp}_${randomStr}`;
    const storagePath = `${basePath}_${sanitizedFilename}`;
    const thumbnailPath = thumbnail ? `${basePath}_thumb_${sanitizedFilename}` : null;

    // Upload main file to R2
    const fileBuffer = await file.arrayBuffer();
    await r2.send(new PutObjectCommand({
      Bucket: bucket,
      Key: storagePath,
      Body: Buffer.from(fileBuffer),
      ContentType: file.type || 'application/octet-stream',
    }));

    // Upload thumbnail if provided
    if (thumbnail && thumbnailPath) {
      try {
        const thumbBuffer = await thumbnail.arrayBuffer();
        await r2.send(new PutObjectCommand({
          Bucket: bucket,
          Key: thumbnailPath,
          Body: Buffer.from(thumbBuffer),
          ContentType: 'image/jpeg',
        }));
      } catch (thumbError) {
        console.error('Thumbnail upload error:', thumbError);
      }
    }

    // Create database record
    const { data: photo, error: dbError } = await adminClient
      .from('workstream_photos')
      .insert({
        workstream_id: workstreamId,
        storage_path: storagePath,
        thumbnail_path: thumbnailPath,
        original_filename: originalFilename,
        taken_at: takenAt || null,
        file_size: fileSize,
        width,
        height,
        uploaded_by: userId,
        storage_backend: 'r2',
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      await deleteR2Objects([storagePath, ...(thumbnailPath ? [thumbnailPath] : [])]);
      return NextResponse.json({ error: 'Failed to save photo record' }, { status: 500 });
    }

    return NextResponse.json(photo);
  } catch (error) {
    console.error('Photo upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
