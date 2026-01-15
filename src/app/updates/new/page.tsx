'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import toast from 'react-hot-toast';
import { buildWorkstreamOptions } from '@/lib/utils';
import type { Workstream } from '@/types/database';

export default function NewUpdatePage() {
  const router = useRouter();
  const { user, workstreams, setWorkstreams } = useAppStore();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    content: '',
    workstream_id: '',
    useNow: true,
    posted_date: '',
    posted_time: '',
  });

  // Initialize with current date/time
  useEffect(() => {
    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const time = now.toTimeString().slice(0, 5);
    setFormData(prev => ({
      ...prev,
      posted_date: date,
      posted_time: time,
    }));
  }, []);

  // Fetch workstreams on mount
  useEffect(() => {
    const supabase = createClient();

    const fetchData = async () => {
      if (workstreams.length === 0) {
        const { data: wsData } = await supabase
          .from('workstreams')
          .select('*')
          .order('order_index');
        if (wsData) {
          setWorkstreams(wsData as Workstream[]);
        }
      }
    };

    fetchData();
  }, [workstreams.length, setWorkstreams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.content.trim()) {
      toast.error('Update content is required');
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      // Calculate posted_at
      let posted_at: string;
      if (formData.useNow) {
        posted_at = new Date().toISOString();
      } else {
        const dateTime = `${formData.posted_date}T${formData.posted_time}:00`;
        posted_at = new Date(dateTime).toISOString();
      }

      const { error } = await supabase
        .from('updates')
        .insert({
          content: formData.content.trim(),
          workstream_id: formData.workstream_id || null,
          posted_at,
          created_by: user?.id,
          source_type: 'manual',
        });

      if (error) throw error;

      toast.success('Update posted successfully');
      router.push('/updates');
    } catch (error) {
      console.error('Error creating update:', error);
      toast.error('Failed to post update');
    } finally {
      setLoading(false);
    }
  };

  const workstreamOptions = buildWorkstreamOptions(workstreams, {
    includeAll: false,
    labelFormat: 'path',
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        title="Post Update"
        breadcrumbs={[
          { label: 'Updates', href: '/updates' },
          { label: 'New Update' },
        ]}
      />

      <div className="p-6 max-w-2xl mx-auto">
        <form onSubmit={handleSubmit}>
          <Card>
            <CardContent className="p-6 space-y-6">
              {/* Content */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Update Content <span className="text-red-500">*</span>
                </label>
                <Textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Share an update, announcement, or news..."
                  rows={4}
                  required
                />
              </div>

              {/* Workstream */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Workstream
                </label>
                <Select
                  options={[
                    { value: '', label: 'All Workstreams (General)' },
                    ...workstreamOptions,
                  ]}
                  value={formData.workstream_id}
                  onChange={(value) => setFormData({ ...formData, workstream_id: value })}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Optional: Link this update to a specific workstream
                </p>
              </div>

              {/* Date/Time Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="useNow"
                    checked={formData.useNow}
                    onChange={(e) => setFormData({ ...formData, useNow: e.target.checked })}
                    className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                  />
                  <label htmlFor="useNow" className="text-sm font-medium text-gray-700">
                    Post now
                  </label>
                </div>

                {!formData.useNow && (
                  <div className="grid grid-cols-2 gap-4 pl-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Date
                      </label>
                      <Input
                        type="date"
                        value={formData.posted_date}
                        onChange={(e) => setFormData({ ...formData, posted_date: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Time
                      </label>
                      <Input
                        type="time"
                        value={formData.posted_time}
                        onChange={(e) => setFormData({ ...formData, posted_time: e.target.value })}
                      />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>

            <CardFooter className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/updates')}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={loading}
              >
                Post Update
              </Button>
            </CardFooter>
          </Card>
        </form>
      </div>
    </div>
  );
}
