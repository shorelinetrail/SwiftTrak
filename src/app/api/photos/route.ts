import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workstreamId = searchParams.get('workstreamId');
    const includeHidden = searchParams.get('includeHidden') === 'true';
    const hiddenOnly = searchParams.get('hiddenOnly') === 'true';

    const supabase = await createClient();

    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Use admin client for queries and signed URL generation
    const adminClient = createAdminClient();

    // Get user profile to check if admin
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
      .order('taken_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (workstreamId && workstreamId !== 'all') {
      query = query.eq('workstream_id', workstreamId);
    }

    // Filter based on hidden status
    // Note: is_hidden column may not exist if migration hasn't run yet
    // Only apply filter when explicitly requested to avoid breaking queries
    if (hiddenOnly && isAdmin) {
      // Admin requesting only hidden photos
      query = query.eq('is_hidden', true);
    }
    // If includeHidden is false and column exists, hidden photos will still show
    // This is intentional - run the migration to enable hidden photo filtering

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
        // Generate signed URL for main image using admin client
        const { data: mainUrlData, error: mainUrlError } = await adminClient.storage
          .from('photos')
          .createSignedUrl(photo.storage_path, SIGNED_URL_EXPIRY);

        if (mainUrlError) {
          console.error('Error generating signed URL for', photo.storage_path, mainUrlError);
        }

        // Generate signed URL for thumbnail if it exists
        let thumbnailUrl = null;
        if (photo.thumbnail_path) {
          const { data: thumbUrlData } = await adminClient.storage
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

// Delete a photo
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

    // Get the photo to check ownership and get storage paths
    const { data: photo, error: fetchError } = await adminClient
      .from('workstream_photos')
      .select('*, uploader:users!workstream_photos_uploaded_by_fkey(id)')
      .eq('id', photoId)
      .single();

    if (fetchError || !photo) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    // Check permission: must be owner or admin
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

    // Delete from storage
    const filesToDelete = [photo.storage_path];
    if (photo.thumbnail_path) {
      filesToDelete.push(photo.thumbnail_path);
    }

    await adminClient.storage.from('photos').remove(filesToDelete);

    // Delete from database
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

// Update photo (caption, is_hidden)
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

    // Get the photo to check ownership
    const { data: photo, error: fetchError } = await adminClient
      .from('workstream_photos')
      .select('uploaded_by')
      .eq('id', id)
      .single();

    if (fetchError || !photo) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    // Check permission: must be owner or admin
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

    // Only admins can hide/unhide photos
    if (is_hidden !== undefined && !isAdmin) {
      return NextResponse.json({ error: 'Only admins can hide/unhide photos' }, { status: 403 });
    }

    // Build update object
    const updateData: { caption?: string; is_hidden?: boolean; updated_at: string } = {
      updated_at: new Date().toISOString(),
    };

    if (caption !== undefined) {
      updateData.caption = caption;
    }

    if (is_hidden !== undefined) {
      updateData.is_hidden = is_hidden;
    }

    // Update photo
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
