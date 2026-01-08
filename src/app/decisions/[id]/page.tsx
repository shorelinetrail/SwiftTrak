'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { usePermission } from '@/hooks/use-user';
import { Header } from '@/components/layout/header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Modal } from '@/components/ui/modal';
import { LoadingPage } from '@/components/ui/loading';
import { formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
  TrashIcon,
  DocumentTextIcon,
  LightBulbIcon,
  ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline';
import type { Decision, Workstream, User } from '@/types/database';

type DecisionWithRelations = Decision & {
  workstream?: Workstream;
  decision_maker?: User;
};

export default function DecisionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const decisionId = params.id as string;

  const { canAdmin } = usePermission();
  const [loading, setLoading] = useState(true);
  const [decision, setDecision] = useState<DecisionWithRelations | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const fetchDecision = useCallback(async () => {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('decisions')
      .select(`
        *,
        workstream:workstreams(id, name, color),
        decision_maker:users!decisions_made_by_fkey(id, full_name, email, avatar_url)
      `)
      .eq('id', decisionId)
      .single();

    if (error || !data) {
      toast.error('Decision not found');
      router.push('/decisions');
      return;
    }

    setDecision(data as unknown as DecisionWithRelations);
    setLoading(false);
  }, [decisionId, router]);

  useEffect(() => {
    fetchDecision();
  }, [fetchDecision]);

  const handleDelete = async () => {
    try {
      const supabase = createClient();

      const { error } = await supabase
        .from('decisions')
        .delete()
        .eq('id', decisionId);

      if (error) throw error;

      toast.success('Decision deleted');
      router.push('/decisions');
    } catch (error) {
      console.error('Error deleting decision:', error);
      toast.error('Failed to delete decision');
    }
  };

  if (loading) {
    return <LoadingPage />;
  }

  if (!decision) {
    return null;
  }

  return (
    <div className="min-h-screen">
      <Header
        title={decision.title}
        subtitle={decision.workstream?.name || 'Decision Log Entry'}
        actions={
          canAdmin && (
            <Button variant="danger" size="sm" onClick={() => setDeleteModalOpen(true)}>
              <TrashIcon className="w-4 h-4" />
            </Button>
          )
        }
      />

      <div className="p-6 max-w-4xl space-y-6">
        {/* Decision Maker Info */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {decision.decision_maker && (
                  <>
                    <Avatar
                      src={decision.decision_maker.avatar_url}
                      name={decision.decision_maker.full_name}
                      size="lg"
                    />
                    <div>
                      <p className="text-lg font-medium text-gray-900">
                        {decision.decision_maker.full_name}
                      </p>
                      <p className="text-sm text-gray-500">
                        Recorded on {formatDate(decision.created_at)}
                      </p>
                    </div>
                  </>
                )}
              </div>
              {decision.workstream && (
                <span
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium"
                  style={{
                    backgroundColor: `${decision.workstream.color}20`,
                    color: decision.workstream.color,
                  }}
                >
                  {decision.workstream.name}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Decision Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DocumentTextIcon className="w-5 h-5 text-gray-400" />
              Decision
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-900 whitespace-pre-wrap">{decision.description}</p>
          </CardContent>
        </Card>

        {decision.rationale && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LightBulbIcon className="w-5 h-5 text-yellow-500" />
                Rationale
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700 whitespace-pre-wrap">{decision.rationale}</p>
            </CardContent>
          </Card>
        )}

        {decision.impact && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowTrendingUpIcon className="w-5 h-5 text-blue-500" />
                Expected Impact
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700 whitespace-pre-wrap">{decision.impact}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Delete Modal */}
      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete Decision"
      >
        <p className="text-gray-600 mb-4">
          Are you sure you want to delete this decision record? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            Delete Decision
          </Button>
        </div>
      </Modal>
    </div>
  );
}
