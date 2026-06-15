import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('upload_links')
      .select(`
        *,
        workstream:workstreams(id, name, color),
        creator:users!upload_links_created_by_fkey(id, full_name)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch upload links' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Upload links error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
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

    const { name, workstream_id, expires_at, max_files } = await request.json();

    if (!name || !workstream_id) {
      return NextResponse.json({ error: 'Name and workstream are required' }, { status: 400 });
    }

    const { data, error } = await adminClient
      .from('upload_links')
      .insert({
        name,
        workstream_id,
        created_by: profile.id,
        expires_at: expires_at || null,
        max_files: max_files || null,
      })
      .select(`
        *,
        workstream:workstreams(id, name, color)
      `)
      .single();

    if (error) {
      console.error('Create upload link error:', error);
      return NextResponse.json({ error: 'Failed to create upload link' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Upload link create error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'ID required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from('upload_links')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete upload link error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
