import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPresignedUploadUrl } from '@/lib/r2';

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
      .or(`auth_id.eq.${user.id},id.eq.${user.id}`)
      .single();

    if (!profile || !['admin', 'edit'].includes(profile.role)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { filename, contentType, workstreamId } = await request.json();

    if (!filename || !contentType || !workstreamId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `${workstreamId}/${timestamp}_${randomStr}_${sanitizedFilename}`;

    const uploadUrl = await getPresignedUploadUrl(key, contentType, 3600);

    return NextResponse.json({ uploadUrl, key });
  } catch (error) {
    console.error('Presign error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
