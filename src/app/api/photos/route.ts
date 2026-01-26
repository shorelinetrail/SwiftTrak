import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workstreamId = searchParams.get('workstreamId');

    const supabase = await createClient();

    let query = supabase
      .from('workstream_photos')
      .select(`
        *,
        workstream:workstreams(id, name, color),
        uploader:users!workstream_photos_uploaded_by_fkey(id, full_name, avatar_url)
      `)
      .order('taken_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (workstreamId && workstreamId !== 'all') {
      query = query.eq('workstream_id', workstreamId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching photos:', error);
      return NextResponse.json(
        { error: 'Failed to fetch photos' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Photos API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
