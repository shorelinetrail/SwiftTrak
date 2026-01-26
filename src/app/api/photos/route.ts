import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workstreamId = searchParams.get('workstreamId');

    const supabase = await createClient();

    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

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

    // Generate signed URLs for each photo (valid for 1 hour)
    const SIGNED_URL_EXPIRY = 60 * 60; // 1 hour in seconds

    const photosWithSignedUrls = await Promise.all(
      (data || []).map(async (photo) => {
        // Generate signed URL for main image
        const { data: mainUrlData } = await supabase.storage
          .from('photos')
          .createSignedUrl(photo.storage_path, SIGNED_URL_EXPIRY);

        // Generate signed URL for thumbnail if it exists
        let thumbnailUrl = null;
        if (photo.thumbnail_path) {
          const { data: thumbUrlData } = await supabase.storage
            .from('photos')
            .createSignedUrl(photo.thumbnail_path, SIGNED_URL_EXPIRY);
          thumbnailUrl = thumbUrlData?.signedUrl || null;
        }

        return {
          ...photo,
          url: mainUrlData?.signedUrl || null,
          thumbnail_url: thumbnailUrl || mainUrlData?.signedUrl || null,
        };
      })
    );

    return NextResponse.json(photosWithSignedUrls);
  } catch (error) {
    console.error('Photos API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
