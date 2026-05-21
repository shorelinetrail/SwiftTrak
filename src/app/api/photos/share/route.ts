import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPresignedDownloadUrl } from '@/lib/r2';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, expiryDays = 7 } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'Photo ID required' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { data: photo, error } = await adminClient
      .from('workstream_photos')
      .select('storage_path, original_filename, storage_backend')
      .eq('id', id)
      .single();

    if (error || !photo) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    const days = Math.min(Math.max(1, expiryDays), 30);
    const expirySeconds = days * 24 * 60 * 60;

    let url: string;

    if (photo.storage_backend === 'r2') {
      url = await getPresignedDownloadUrl(
        photo.storage_path,
        expirySeconds,
        photo.original_filename
      );
    } else {
      const { data: signedData, error: signError } = await adminClient.storage
        .from('photos')
        .createSignedUrl(photo.storage_path, expirySeconds, {
          download: photo.original_filename,
        });

      if (signError || !signedData?.signedUrl) {
        return NextResponse.json({ error: 'Failed to generate link' }, { status: 500 });
      }
      url = signedData.signedUrl;
    }

    return NextResponse.json({
      url,
      filename: photo.original_filename,
      expiresIn: days,
    });
  } catch (error) {
    console.error('Share link error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
