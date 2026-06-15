import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const adminClient = createAdminClient();

    // Validate token
    const { data: link, error } = await adminClient
      .from('upload_links')
      .select('id, workstream_id, created_by, expires_at, max_files, upload_count, is_active')
      .eq('token', token)
      .single();

    if (error || !link) {
      return NextResponse.json({ error: 'Invalid upload link' }, { status: 404 });
    }

    if (!link.is_active) {
      return NextResponse.json({ error: 'This upload link has been deactivated' }, { status: 403 });
    }

    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This upload link has expired' }, { status: 403 });
    }

    if (link.max_files && link.upload_count >= link.max_files) {
      return NextResponse.json({ error: 'Upload limit reached' }, { status: 403 });
    }

    const {
      storagePath,
      originalFilename,
      fileSize,
      width,
      height,
      takenAt,
    } = await request.json();

    if (!storagePath || !originalFilename) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Create photo record (uploaded_by = link creator)
    const { data: photo, error: dbError } = await adminClient
      .from('workstream_photos')
      .insert({
        workstream_id: link.workstream_id,
        storage_path: storagePath,
        original_filename: originalFilename,
        file_size: fileSize || null,
        width: width || null,
        height: height || null,
        taken_at: takenAt || null,
        uploaded_by: link.created_by,
        storage_backend: 'r2',
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      return NextResponse.json(
        { error: 'Failed to save file record', detail: dbError.message },
        { status: 500 }
      );
    }

    // Increment upload count
    await adminClient
      .from('upload_links')
      .update({ upload_count: link.upload_count + 1, updated_at: new Date().toISOString() })
      .eq('id', link.id);

    return NextResponse.json(photo);
  } catch (error) {
    console.error('Upload link register error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
