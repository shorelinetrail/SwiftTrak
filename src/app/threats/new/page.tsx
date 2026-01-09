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
import type { RiskLevel, Workstream } from '@/types/database';

export default function NewThreatPage() {
  const router = useRouter();
  const { user, workstreams, setWorkstreams } = useAppStore();
  const [loading, setLoading] = useState(false);

  // Fetch workstreams if not already loaded - with timeout
  useEffect(() => {
    if (workstreams.length > 0) return;
    let mounted = true;

    const fetchWorkstreams = async () => {
      const supabase = createClient();
      try {
        const result = await Promise.race([
          supabase.from('workstreams').select('*').order('order_index'),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
        ]);
        if (mounted && result?.data) {
          setWorkstreams(result.data as Workstream[]);
        }
      } catch (error) {
        console.error('[NewThreat] Error fetching workstreams:', error);
      }
    };
    fetchWorkstreams();

    return () => { mounted = false; };
  }, [workstreams.length, setWorkstreams]);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    workstream_id: '',
    proposed_mitigation: '',
    expected_delay: '',
    unmitigated_risk: 'medium' as RiskLevel,
    current_risk: 'medium' as RiskLevel,
    solution: '',
    mitigated_risk: '' as RiskLevel | '',
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

    if (!formData.workstream_id) {
      toast.error('Please select a workstream');
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      const { data, error } = await supabase
        .from('threats')
        .insert({
          title: formData.title.trim(),
          description: formData.description.trim(),
          workstream_id: formData.workstream_id,
          proposed_mitigation: formData.proposed_mitigation.trim() || null,
          expected_delay: formData.expected_delay.trim() || null,
          unmitigated_risk: formData.unmitigated_risk,
          current_risk: formData.current_risk,
          solution: formData.solution.trim() || null,
          mitigated_risk: formData.mitigated_risk || null,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Threat logged successfully');
      router.push(`/threats/${data.id}`);
    } catch (error) {
      console.error('Error creating threat:', error);
      toast.error('Failed to log threat');
    } finally {
      setLoading(false);
    }
  };

  const workstreamOptions = [
    { value: '', label: 'Select a workstream...' },
    ...workstreams.map(w => ({ value: w.id, label: w.name })),
  ];

  const riskOptions = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
  ];

  const mitigatedRiskOptions = [
    { value: '', label: 'Not yet determined' },
    ...riskOptions,
  ];

  return (
    <div className="min-h-screen">
      <Header title="Log Threat" subtitle="Document a new risk or threat" />

      <div className="p-6 max-w-2xl">
        <form onSubmit={handleSubmit}>
          <Card>
            <CardContent className="space-y-6 pt-6">
              <Input
                label="Title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Brief title for the threat"
                required
              />

              <Textarea
                label="Description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Detailed description of the threat and its potential impact"
                rows={4}
                required
              />

              <Select
                label="Workstream"
                options={workstreamOptions}
                value={formData.workstream_id}
                onChange={(value) => setFormData({ ...formData, workstream_id: value })}
              />

              <div className="grid grid-cols-2 gap-4">
                <Select
                  label="Unmitigated Risk Level"
                  options={riskOptions}
                  value={formData.unmitigated_risk}
                  onChange={(value) => setFormData({ ...formData, unmitigated_risk: value as RiskLevel })}
                />
                <Select
                  label="Current Risk Level"
                  options={riskOptions}
                  value={formData.current_risk}
                  onChange={(value) => setFormData({ ...formData, current_risk: value as RiskLevel })}
                />
              </div>

              <Input
                label="Expected Delay"
                value={formData.expected_delay}
                onChange={(e) => setFormData({ ...formData, expected_delay: e.target.value })}
                placeholder="e.g., 2-3 days, 1 week"
              />

              <Textarea
                label="Proposed Mitigation"
                value={formData.proposed_mitigation}
                onChange={(e) => setFormData({ ...formData, proposed_mitigation: e.target.value })}
                placeholder="What actions can be taken to mitigate this threat?"
                rows={3}
              />

              <Textarea
                label="Solution"
                value={formData.solution}
                onChange={(e) => setFormData({ ...formData, solution: e.target.value })}
                placeholder="Final solution or resolution (if known)"
                rows={3}
              />

              <Select
                label="Mitigated Risk Level"
                options={mitigatedRiskOptions}
                value={formData.mitigated_risk}
                onChange={(value) => setFormData({ ...formData, mitigated_risk: value as RiskLevel | '' })}
              />
            </CardContent>

            <CardFooter>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button type="submit" loading={loading}>
                Log Threat
              </Button>
            </CardFooter>
          </Card>
        </form>
      </div>
    </div>
  );
}
