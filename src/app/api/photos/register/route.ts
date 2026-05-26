import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Register a file that was uploaded directly to Supabase Storage
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

    // Parse request body
    const body = await request.json();
    const {
      workstreamId,
      storagePath,
      originalFilename,
      fileSize,
      width,
      height,
      takenAt,
      thumbnailPath,
    } = body;

    if (!workstreamId || !storagePath || !originalFilename) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Create database record
    const { data: photo, error: dbError } = await adminClient
      .from('workstream_photos')
      .insert({
        workstream_id: workstreamId,
        storage_path: storagePath,
        thumbnail_path: thumbnailPath || null,
        original_filename: originalFilename,
        taken_at: takenAt || null,
        file_size: fileSize || null,
        width: width || null,
        height: height || null,
        uploaded_by: userId,
        storage_backend: 'r2',
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      return NextResponse.json(
        { error: 'Failed to save file record', detail: dbError.message, code: dbError.code },
        { status: 500 }
      );
    }

    return NextResponse.json(photo);
  } catch (error) {
    console.error('File registration error:', error);
    return NextResponse.json(
      { error: 'Internal server error', detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
