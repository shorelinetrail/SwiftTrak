'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import toast from 'react-hot-toast';

export default function NewDecisionPage() {
  const router = useRouter();
  const { user, workstreams } = useAppStore();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    workstream_id: '',
    rationale: '',
    impact: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim()) {
      toast.error('Title is required');
      return;
    }

    if (!formData.description.trim()) {
      toast.error('Description is required');
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      const { data, error } = await supabase
        .from('decisions')
        .insert({
          title: formData.title.trim(),
          description: formData.description.trim(),
          workstream_id: formData.workstream_id || null,
          rationale: formData.rationale.trim() || null,
          impact: formData.impact.trim() || null,
          made_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Decision recorded');
      router.push(`/decisions/${data.id}`);
    } catch (error) {
      console.error('Error creating decision:', error);
      toast.error('Failed to record decision');
    } finally {
      setLoading(false);
    }
  };

  const workstreamOptions = [
    { value: '', label: 'No specific workstream' },
    ...workstreams.map(w => ({ value: w.id, label: w.name })),
  ];

  return (
    <div className="min-h-screen">
      <Header title="Record Decision" subtitle="Document a key decision for the record" />

      <div className="p-6 max-w-2xl">
        <form onSubmit={handleSubmit}>
          <Card>
            <CardContent className="space-y-6 pt-6">
              <Input
                label="Decision Title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Brief summary of the decision"
                required
              />

              <Textarea
                label="Decision Description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="What was decided?"
                rows={4}
                required
              />

              <Textarea
                label="Rationale"
                value={formData.rationale}
                onChange={(e) => setFormData({ ...formData, rationale: e.target.value })}
                placeholder="Why was this decision made? What factors were considered?"
                rows={3}
              />

              <Textarea
                label="Expected Impact"
                value={formData.impact}
                onChange={(e) => setFormData({ ...formData, impact: e.target.value })}
                placeholder="What are the expected consequences or outcomes?"
                rows={3}
              />

              <Select
                label="Workstream (Optional)"
                options={workstreamOptions}
                value={formData.workstream_id}
                onChange={(value) => setFormData({ ...formData, workstream_id: value })}
              />

              <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-700">
                <p className="font-medium mb-1">Why record decisions?</p>
                <p>Documenting key decisions helps with post-incident review, ensures accountability, and provides context for future reference.</p>
              </div>
            </CardContent>

            <CardFooter>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button type="submit" loading={loading}>
                Record Decision
              </Button>
            </CardFooter>
          </Card>
        </form>
      </div>
    </div>
  );
}
