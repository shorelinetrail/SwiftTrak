'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import { usePermission } from '@/hooks/use-user';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Tabs } from '@/components/ui/tabs';
import { LoadingSpinner } from '@/components/ui/loading';
import { PhotoGallery } from '@/components/PhotoGallery';
import { buildWorkstreamOptions } from '@/lib/utils';
import {
  PlusIcon,
  FunnelIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import type { WorkstreamPhoto, Workstream, User } from '@/types/database';

type PhotoWithRelations = WorkstreamPhoto & {
  workstream?: Workstream;
  uploader?: User;
  url?: string;
  thumbnail_url?: string;
};

export default function PhotosPage() {
  const router = useRouter();
  const { workstreams, setWorkstreams } = useAppStore();
  const { canEdit, canAdmin } = usePermission();
  const [loading, setLoading] = useState(true);
  const [photos, setPhotos] = useState<PhotoWithRelations[]>([]);
  const [hiddenPhotos, setHiddenPhotos] = useState<PhotoWithRelations[]>([]);
  const [workstreamFilter, setWorkstreamFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'all' | 'hidden'>('all');

  const fetchPhotos = useCallback(async () => {
    // Fetch photos with signed URLs from API
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

  const fetchHiddenPhotos = useCallback(async () => {
    if (!canAdmin) return;

    const url = workstreamFilter === 'all'
      ? '/api/photos?hiddenOnly=true'
      : `/api/photos?workstreamId=${workstreamFilter}&hiddenOnly=true`;

    try {
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setHiddenPhotos(data);
      }
    } catch (error) {
      console.error('Error fetching hidden photos:', error);
    }
  }, [workstreamFilter, canAdmin]);

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
    if (canAdmin) {
      fetchHiddenPhotos();
    }
  }, [fetchPhotos, fetchHiddenPhotos, canAdmin]);

  // Toggle hidden handler (admin only)
  const handleToggleHidden = async (photoId: string, isHidden: boolean) => {
    const response = await fetch('/api/photos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: photoId, is_hidden: isHidden }),
    });

    if (!response.ok) {
      const error = await response.json();
      toast.error(error.error || 'Failed to update photo');
      throw new Error(error.error);
    }

    // Move photo between visible and hidden lists
    if (isHidden) {
      // Moving from visible to hidden
      const photo = photos.find((p) => p.id === photoId);
      if (photo) {
        setPhotos((prev) => prev.filter((p) => p.id !== photoId));
        setHiddenPhotos((prev) => [{ ...photo, is_hidden: true }, ...prev]);
      }
      toast.success('Photo hidden');
    } else {
      // Moving from hidden to visible
      const photo = hiddenPhotos.find((p) => p.id === photoId);
      if (photo) {
        setHiddenPhotos((prev) => prev.filter((p) => p.id !== photoId));
        setPhotos((prev) => [{ ...photo, is_hidden: false }, ...prev]);
      }
      toast.success('Photo unhidden');
    }
  };

  // Delete handler
  const handleDelete = async (photoId: string) => {
    const response = await fetch(`/api/photos?id=${photoId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      toast.error(error.error || 'Failed to delete photo');
      throw new Error(error.error);
    }

    // Remove from local state
    setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    toast.success('Photo deleted');
  };

  // Caption update handler
  const handleCaptionUpdate = async (photoId: string, caption: string) => {
    const response = await fetch('/api/photos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: photoId, caption }),
    });

    if (!response.ok) {
      const error = await response.json();
      toast.error(error.error || 'Failed to update caption');
      throw new Error(error.error);
    }

    // Update local state
    setPhotos((prev) =>
      prev.map((p) => (p.id === photoId ? { ...p, caption } : p))
    );
    toast.success('Caption updated');
  };

  const workstreamOptions = buildWorkstreamOptions(workstreams, {
    allLabel: 'All Workstreams',
    allValue: 'all',
    mapOption: (ws) => ({
      icon: <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ws.color }} />,
    }),
  });

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
        {/* Admin tabs for all/hidden photos */}
        {canAdmin && (
          <Tabs
            activeTab={activeTab}
            onChange={(id) => setActiveTab(id as 'all' | 'hidden')}
            tabs={[
              { id: 'all', label: 'All Photos', count: photos.length },
              { id: 'hidden', label: 'Hidden', count: hiddenPhotos.length, icon: <EyeSlashIcon className="w-4 h-4" /> },
            ]}
          />
        )}

        {activeTab === 'all' ? (
          <>
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

            {/* Photo gallery - signed URLs are embedded in photos data */}
            <PhotoGallery
              photos={photos}
              emptyMessage={
                workstreamFilter === 'all'
                  ? 'No photos uploaded yet'
                  : 'No photos in this workstream'
              }
              onUploadClick={() => router.push('/photos/upload')}
              canUpload={canEdit}
              canEdit={canEdit}
              isAdmin={canAdmin}
              onDelete={handleDelete}
              onCaptionUpdate={handleCaptionUpdate}
              onToggleHidden={canAdmin ? handleToggleHidden : undefined}
            />
          </>
        ) : (
          /* Hidden photos (admin only) */
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <EyeSlashIcon className="w-5 h-5 text-yellow-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-yellow-800">Hidden Photos</p>
                  <p className="text-sm text-yellow-700 mt-1">
                    These photos are only visible to administrators. Click the eye icon in the lightbox to unhide a photo.
                  </p>
                </div>
              </div>
            </div>
            <PhotoGallery
              photos={hiddenPhotos}
              emptyMessage="No hidden photos"
              canUpload={false}
              canEdit={canEdit}
              isAdmin={canAdmin}
              onDelete={handleDelete}
              onCaptionUpdate={handleCaptionUpdate}
              onToggleHidden={handleToggleHidden}
            />
          </div>
        )}
      </div>
    </div>
  );
}
