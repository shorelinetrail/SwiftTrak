import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const adminClient = createAdminClient();

    const { data: link, error } = await adminClient
      .from('upload_links')
      .select(`
        name, expires_at, max_files, upload_count, is_active,
        workstream:workstreams(name, color)
      `)
      .eq('token', token)
      .single();

    if (error || !link) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (!link.is_active) {
      return NextResponse.json({ error: 'Deactivated' }, { status: 403 });
    }

    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Expired' }, { status: 403 });
    }

    return NextResponse.json({
      name: link.name,
      workstream: link.workstream,
      expires_at: link.expires_at,
      max_files: link.max_files,
      upload_count: link.upload_count,
    });
  } catch (error) {
    console.error('Upload link info error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
