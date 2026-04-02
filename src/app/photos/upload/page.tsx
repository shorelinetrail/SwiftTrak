'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import { usePermission } from '@/hooks/use-user';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { PhotoUploader } from '@/components/PhotoUploader';
import { LoadingSpinner } from '@/components/ui/loading';
import { buildWorkstreamOptions } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { Workstream } from '@/types/database';

export default function PhotoUploadPage() {
  const router = useRouter();
  const { workstreams, setWorkstreams } = useAppStore();
  const { canEdit } = usePermission();
  const [loading, setLoading] = useState(true);
  const [selectedWorkstream, setSelectedWorkstream] = useState<string>('');
  const [uploadedCount, setUploadedCount] = useState(0);

  // Fetch workstreams if not loaded
  useEffect(() => {
    const fetchData = async () => {
      if (workstreams.length === 0) {
        const supabase = createClient();
        const { data } = await supabase
          .from('workstreams')
          .select('*')
          .order('order_index');
        if (data) {
          setWorkstreams(data as Workstream[]);
        }
      }
      setLoading(false);
    };
    fetchData();
  }, [workstreams.length, setWorkstreams]);

  // Redirect if no edit permission
  useEffect(() => {
    if (!loading && !canEdit) {
      toast.error('You do not have permission to upload files');
      router.push('/photos');
    }
  }, [loading, canEdit, router]);

  const handleUploadComplete = (photos: { id: string; storage_path: string }[]) => {
    setUploadedCount((prev) => prev + photos.length);
    toast.success(`${photos.length} file${photos.length !== 1 ? 's' : ''} uploaded successfully`);
  };

  const workstreamOptions = buildWorkstreamOptions(workstreams, {
    allLabel: 'Select a workstream...',
    allValue: '',
    excludeParentsWithChildren: true,
    mapOption: (ws) => ({
      icon: <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ws.color }} />,
    }),
  });

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header
          title="Upload Files"
          breadcrumbs={[
            { label: 'Files', href: '/photos' },
            { label: 'Upload' },
          ]}
        />
        <div className="p-6 flex items-center justify-center h-64">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header
        title="Upload Files"
        subtitle="Add photos, videos, and documents to workstreams"
        breadcrumbs={[
          { label: 'Files', href: '/photos' },
          { label: 'Upload' },
        ]}
      />

      <div className="p-6 max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>Select Workstream</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Select
                label="Workstream"
                options={workstreamOptions}
                value={selectedWorkstream}
                onChange={setSelectedWorkstream}
              />
              <p className="mt-1 text-sm text-gray-500">Files will be organized by workstream</p>
            </div>

            {selectedWorkstream && (
              <div className="border-t pt-6">
                <PhotoUploader
                  workstreamId={selectedWorkstream}
                  onUploadComplete={handleUploadComplete}
                />
              </div>
            )}

            {uploadedCount > 0 && (
              <div className="flex items-center justify-between pt-4 border-t">
                <p className="text-sm text-gray-600">
                  {uploadedCount} file{uploadedCount !== 1 ? 's' : ''} uploaded this session
                </p>
                <button
                  onClick={() => router.push('/photos')}
                  className="text-sm text-red-600 hover:text-red-700 font-medium"
                >
                  View Files →
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
