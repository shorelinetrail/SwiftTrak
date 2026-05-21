import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPresignedDownloadUrls, deleteR2Objects } from '@/lib/r2';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workstreamId = searchParams.get('workstreamId');
    const hiddenOnly = searchParams.get('hiddenOnly') === 'true';

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

    const isAdmin = profile?.role === 'admin';

    let query = adminClient
      .from('workstream_photos')
      .select(`
        *,
        workstream:workstreams(id, name, color),
        uploader:users!workstream_photos_uploaded_by_fkey(id, full_name, avatar_url)
      `)
      .order('created_at', { ascending: false });

    if (workstreamId && workstreamId !== 'all') {
      query = query.eq('workstream_id', workstreamId);
    }

    if (hiddenOnly && isAdmin) {
      query = query.eq('is_hidden', true);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching photos:', error);
      return NextResponse.json({ error: 'Failed to fetch photos' }, { status: 500 });
    }

    const SIGNED_URL_EXPIRY = 60 * 60;
    const photos = data || [];

    // Split by storage backend
    const r2Photos = photos.filter((p) => p.storage_backend === 'r2');
    const supabasePhotos = photos.filter((p) => p.storage_backend !== 'r2');

    // Generate R2 signed URLs
    const r2Keys = [
      ...r2Photos.map((p) => p.storage_path),
      ...r2Photos.filter((p) => p.thumbnail_path).map((p) => p.thumbnail_path as string),
    ];
    const r2UrlMap = r2Keys.length > 0
      ? await getPresignedDownloadUrls(r2Keys, SIGNED_URL_EXPIRY)
      : new Map<string, string>();

    // Generate Supabase signed URLs
    const supabaseMainPaths = supabasePhotos.map((p) => p.storage_path);
    const supabaseThumbPaths = supabasePhotos
      .filter((p) => p.thumbnail_path)
      .map((p) => p.thumbnail_path as string);

    const [mainSigned, thumbSigned] = await Promise.all([
      supabaseMainPaths.length > 0
        ? adminClient.storage.from('photos').createSignedUrls(supabaseMainPaths, SIGNED_URL_EXPIRY)
        : { data: [], error: null },
      supabaseThumbPaths.length > 0
        ? adminClient.storage.from('photos').createSignedUrls(supabaseThumbPaths, SIGNED_URL_EXPIRY)
        : { data: [], error: null },
    ]);

    const supabaseUrlMap = new Map<string, string>();
    if (mainSigned.data) {
      for (const item of mainSigned.data) {
        if (item.signedUrl && item.path) supabaseUrlMap.set(item.path, item.signedUrl);
      }
    }
    if (thumbSigned.data) {
      for (const item of thumbSigned.data) {
        if (item.signedUrl && item.path) supabaseUrlMap.set(item.path, item.signedUrl);
      }
    }

    // Merge: pick the right URL map per photo
    const photosWithSignedUrls = photos.map((photo) => {
      const urlMap = photo.storage_backend === 'r2' ? r2UrlMap : supabaseUrlMap;
      const mainUrl = urlMap.get(photo.storage_path) || null;
      const thumbUrl = photo.thumbnail_path
        ? urlMap.get(photo.thumbnail_path) || null
        : null;
      return {
        ...photo,
        url: mainUrl,
        thumbnail_url: thumbUrl || mainUrl,
      };
    });

    return NextResponse.json(photosWithSignedUrls);
  } catch (error) {
    console.error('Photos API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const photoId = searchParams.get('id');

    if (!photoId) {
      return NextResponse.json({ error: 'Photo ID required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: photo, error: fetchError } = await adminClient
      .from('workstream_photos')
      .select('*, uploader:users!workstream_photos_uploaded_by_fkey(id)')
      .eq('id', photoId)
      .single();

    if (fetchError || !photo) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    const { data: profile } = await adminClient
      .from('users')
      .select('id, role')
      .or(`auth_id.eq.${user.id},id.eq.${user.id}`)
      .single();

    const isOwner = profile?.id === photo.uploaded_by;
    const isAdmin = profile?.role === 'admin';

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Delete from the correct storage backend
    const keysToDelete = [photo.storage_path];
    if (photo.thumbnail_path) keysToDelete.push(photo.thumbnail_path);

    if (photo.storage_backend === 'r2') {
      await deleteR2Objects(keysToDelete);
    } else {
      await adminClient.storage.from('photos').remove(keysToDelete);
    }

    const { error: deleteError } = await adminClient
      .from('workstream_photos')
      .delete()
      .eq('id', photoId);

    if (deleteError) {
      console.error('Error deleting photo:', deleteError);
      return NextResponse.json({ error: 'Failed to delete photo' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete photo error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, caption, is_hidden } = body;

    if (!id) {
      return NextResponse.json({ error: 'Photo ID required' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { data: photo, error: fetchError } = await adminClient
      .from('workstream_photos')
      .select('uploaded_by')
      .eq('id', id)
      .single();

    if (fetchError || !photo) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    const { data: profile } = await adminClient
      .from('users')
      .select('id, role')
      .or(`auth_id.eq.${user.id},id.eq.${user.id}`)
      .single();

    const isOwner = profile?.id === photo.uploaded_by;
    const isAdmin = profile?.role === 'admin';

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    if (is_hidden !== undefined && !isAdmin) {
      return NextResponse.json({ error: 'Only admins can hide/unhide photos' }, { status: 403 });
    }

    const updateData: { caption?: string; is_hidden?: boolean; updated_at: string } = {
      updated_at: new Date().toISOString(),
    };

    if (caption !== undefined) updateData.caption = caption;
    if (is_hidden !== undefined) updateData.is_hidden = is_hidden;

    const { data: updated, error: updateError } = await adminClient
      .from('workstream_photos')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating photo:', updateError);
      return NextResponse.json({ error: 'Failed to update photo' }, { status: 500 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Update photo error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
