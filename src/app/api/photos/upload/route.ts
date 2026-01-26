import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check user has edit permission
    const adminClient = createAdminClient();
    const { data: profile } = await adminClient
      .from('users')
      .select('id, role')
      .eq('auth_id', user.id)
      .single();

    if (!profile) {
      // Try by id for backwards compatibility
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

    // Parse form data
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
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Generate unique file paths
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const sanitizedFilename = originalFilename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const basePath = `${workstreamId}/${timestamp}_${randomStr}`;
    const storagePath = `${basePath}_${sanitizedFilename}`;
    const thumbnailPath = thumbnail ? `${basePath}_thumb_${sanitizedFilename}` : null;

    // Upload main file to Supabase Storage
    const fileBuffer = await file.arrayBuffer();
    const { error: uploadError } = await adminClient.storage
      .from('photos')
      .upload(storagePath, fileBuffer, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 }
      );
    }

    // Upload thumbnail if provided
    if (thumbnail && thumbnailPath) {
      const thumbBuffer = await thumbnail.arrayBuffer();
      const { error: thumbError } = await adminClient.storage
        .from('photos')
        .upload(thumbnailPath, thumbBuffer, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (thumbError) {
        console.error('Thumbnail upload error:', thumbError);
        // Continue without thumbnail
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
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      // Try to clean up uploaded files
      await adminClient.storage.from('photos').remove([storagePath]);
      if (thumbnailPath) {
        await adminClient.storage.from('photos').remove([thumbnailPath]);
      }
      return NextResponse.json(
        { error: 'Failed to save photo record' },
        { status: 500 }
      );
    }

    return NextResponse.json(photo);
  } catch (error) {
    console.error('Photo upload error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
