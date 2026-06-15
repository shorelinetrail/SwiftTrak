import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPresignedUploadUrl } from '@/lib/r2';

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
      .select('id, workstream_id, expires_at, max_files, upload_count, is_active')
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
      return NextResponse.json({ error: 'Upload limit reached for this link' }, { status: 403 });
    }

    const { filename, contentType } = await request.json();

    if (!filename || !contentType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `${link.workstream_id}/${timestamp}_${randomStr}_${sanitizedFilename}`;

    const uploadUrl = await getPresignedUploadUrl(key, contentType, 3600);

    return NextResponse.json({ uploadUrl, key });
  } catch (error) {
    console.error('Upload link presign error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
