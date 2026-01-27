import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Bulk update photos (caption or workstream/album)
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { ids, caption, workstream_id } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Photo IDs required' }, { status: 400 });
    }

    if (caption === undefined && !workstream_id) {
      return NextResponse.json({ error: 'Either caption or workstream_id required' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Check user is admin
    const { data: profile } = await adminClient
      .from('users')
      .select('id, role')
      .or(`auth_id.eq.${user.id},id.eq.${user.id}`)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required for bulk operations' }, { status: 403 });
    }

    // Build update object
    const updateData: { caption?: string; workstream_id?: string; updated_at: string } = {
      updated_at: new Date().toISOString(),
    };

    if (caption !== undefined) {
      updateData.caption = caption;
    }

    if (workstream_id) {
      // Verify workstream exists
      const { data: workstream } = await adminClient
        .from('workstreams')
        .select('id')
        .eq('id', workstream_id)
        .single();

      if (!workstream) {
        return NextResponse.json({ error: 'Workstream not found' }, { status: 404 });
      }

      updateData.workstream_id = workstream_id;
    }

    // Perform bulk update
    const { data: updated, error: updateError } = await adminClient
      .from('workstream_photos')
      .update(updateData)
      .in('id', ids)
      .select();

    if (updateError) {
      console.error('Error bulk updating photos:', updateError);
      return NextResponse.json({ error: 'Failed to update photos' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      updated: updated?.length || 0,
      message: `Updated ${updated?.length || 0} photo(s)`
    });
  } catch (error) {
    console.error('Bulk update photos error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
