'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import { usePermission } from '@/hooks/use-user';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading';
import { PhotoGallery } from '@/components/PhotoGallery';
import { buildWorkstreamOptions } from '@/lib/utils';
import {
  PlusIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import type { WorkstreamPhoto, Workstream, User } from '@/types/database';

type PhotoWithRelations = WorkstreamPhoto & {
  workstream?: Workstream;
  uploader?: User;
};

export default function PhotosPage() {
  const router = useRouter();
  const { workstreams, setWorkstreams } = useAppStore();
  const { canEdit } = usePermission();
  const [loading, setLoading] = useState(true);
  const [photos, setPhotos] = useState<PhotoWithRelations[]>([]);
  const [workstreamFilter, setWorkstreamFilter] = useState<string>('all');

  const fetchPhotos = useCallback(async () => {
    const supabase = createClient();

    // Fetch photos
    const url = workstreamFilter === 'all'
      ? '/api/photos'
      : `/api/photos?workstreamId=${workstreamFilter}`;

    try {
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setPhotos(data);
      }
    } catch (error) {
      console.error('Error fetching photos:', error);
    }

    setLoading(false);
  }, [workstreamFilter]);

  // Fetch workstreams if not loaded
  useEffect(() => {
    if (workstreams.length === 0) {
      const fetchWorkstreams = async () => {
        const supabase = createClient();
        const { data } = await supabase
          .from('workstreams')
          .select('*')
          .order('order_index');
        if (data) {
          setWorkstreams(data as Workstream[]);
        }
      };
      fetchWorkstreams();
    }
  }, [workstreams.length, setWorkstreams]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  const workstreamOptions = buildWorkstreamOptions(workstreams, {
    allLabel: 'All Workstreams',
    allValue: 'all',
    mapOption: (ws) => ({
      icon: <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ws.color }} />,
    }),
  });

  // Get storage URL
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const storageUrl = supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/photos` : '';

  // Get counts per workstream for stats
  const photoCountByWorkstream = photos.reduce((acc, photo) => {
    const wsId = photo.workstream_id;
    acc[wsId] = (acc[wsId] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header title="Photos" subtitle="Loading..." />
        <div className="p-6 flex items-center justify-center h-64">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header
        title="Photos"
        subtitle={`${photos.length} photo${photos.length !== 1 ? 's' : ''} across workstreams`}
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <FunnelIcon className="w-4 h-4 text-gray-400" />
              <Select
                options={workstreamOptions}
                value={workstreamFilter}
                onChange={setWorkstreamFilter}
                className="w-48"
              />
            </div>
            {canEdit && (
              <Link href="/photos/upload">
                <Button size="sm">
                  <PlusIcon className="w-4 h-4 mr-2" />
                  Upload Photos
                </Button>
              </Link>
            )}
          </div>
        }
      />

      <div className="p-6 space-y-6">
        {/* Workstream album cards */}
        {workstreamFilter === 'all' && workstreams.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {workstreams
              .filter((ws) => photoCountByWorkstream[ws.id])
              .map((ws) => (
                <button
                  key={ws.id}
                  onClick={() => setWorkstreamFilter(ws.id)}
                  className="p-4 rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all text-left"
                >
                  <div
                    className="w-8 h-8 rounded-lg mb-2"
                    style={{ backgroundColor: ws.color }}
                  />
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {ws.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {photoCountByWorkstream[ws.id]} photo{photoCountByWorkstream[ws.id] !== 1 ? 's' : ''}
                  </p>
                </button>
              ))}
          </div>
        )}

        {/* Photo gallery */}
        <PhotoGallery
          photos={photos}
          storageUrl={storageUrl}
          emptyMessage={
            workstreamFilter === 'all'
              ? 'No photos uploaded yet'
              : 'No photos in this workstream'
          }
          onUploadClick={() => router.push('/photos/upload')}
          canUpload={canEdit}
        />
      </div>
    </div>
  );
}
