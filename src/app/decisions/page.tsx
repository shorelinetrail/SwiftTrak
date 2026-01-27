'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
// import { useRealtime } from '@/hooks/use-realtime';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { WorkstreamSelect } from '@/components/ui/workstream-select';
import { WorkstreamBadge } from '@/components/ui/workstream-badge';
import { formatDate, getRelativeTime } from '@/lib/utils';
import {
  PlusIcon,
  DocumentTextIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import type { Decision, Workstream, User } from '@/types/database';

type DecisionWithRelations = Decision & {
  workstream?: Workstream;
  decision_maker?: User;
};

export default function DecisionsPage() {
  const { workstreams } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [decisions, setDecisions] = useState<DecisionWithRelations[]>([]);
  const [workstreamFilter, setWorkstreamFilter] = useState<string>('all');

  const fetchDecisions = useCallback(async () => {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('decisions')
      .select(`
        *,
        workstream:workstreams(id, name, color),
        decision_maker:users!decisions_made_by_fkey(id, full_name, avatar_url)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching decisions:', error);
    } else {
      setDecisions(data as unknown as DecisionWithRelations[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDecisions();
  }, [fetchDecisions]);

  // useRealtime({
  //   table: 'decisions',
  //   onInsert: () => fetchDecisions(),
  // });

  const filteredDecisions = workstreamFilter === 'all'
    ? decisions
    : decisions.filter(d => d.workstream_id === workstreamFilter);

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header title="Decision Log" />
        <div className="flex items-center justify-center h-96">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header
        title="Decision Log"
        subtitle={`${filteredDecisions.length} decision${filteredDecisions.length !== 1 ? 's' : ''} recorded`}
        actions={
          <Link href="/decisions/new">
            <Button size="sm">
              <PlusIcon className="w-4 h-4 mr-2" />
              Record Decision
            </Button>
          </Link>
        }
      />

      <div className="p-6 space-y-6">
        {/* Filter */}
        <Card padding="sm">
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-gray-500">
                <FunnelIcon className="w-4 h-4" />
                <span className="text-sm font-medium">Filter:</span>
              </div>
              <WorkstreamSelect
                workstreams={workstreams}
                value={workstreamFilter}
                onChange={setWorkstreamFilter}
                className="w-56"
              />
            </div>
          </CardContent>
        </Card>

        {/* Decisions Timeline */}
        {filteredDecisions.length === 0 ? (
          <EmptyState
            icon={<DocumentTextIcon className="w-6 h-6" />}
            title="No decisions recorded"
            description="Document key decisions for future reference."
            action={{
              label: 'Record Decision',
              onClick: () => window.location.href = '/decisions/new',
            }}
          />
        ) : (
          <div className="space-y-4">
            {filteredDecisions.map((decision, index) => (
              <DecisionCard key={decision.id} decision={decision} workstreams={workstreams} isFirst={index === 0} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DecisionCard({ decision, workstreams, isFirst }: { decision: DecisionWithRelations; workstreams: Workstream[]; isFirst: boolean }) {
  const getParentWorkstream = (parentId: string | null | undefined) => {
    if (!parentId) return null;
    return workstreams.find(ws => ws.id === parentId) || null;
  };

  return (
    <div className="relative pl-8">
      {/* Timeline line */}
      <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gray-200" />

      {/* Timeline dot - standardized to w-4 h-4 */}
      <div className={`absolute left-1 top-4 w-4 h-4 rounded-full border-2 border-white ${isFirst ? 'bg-red-500' : 'bg-gray-300'}`} />

      <Link href={`/decisions/${decision.id}`}>
        <Card hover>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-base font-medium text-gray-900">{decision.title}</h3>
                  {decision.workstream && (
                    <WorkstreamBadge
                      workstream={decision.workstream}
                      parent={getParentWorkstream(decision.workstream.parent_id)}
                    />
                  )}
                </div>
                <p className="text-sm text-gray-600 line-clamp-2">{decision.description}</p>
                {decision.rationale && (
                  <p className="text-sm text-gray-500 mt-2 italic line-clamp-1">
                    Rationale: {decision.rationale}
                  </p>
                )}
              </div>

              <div className="flex flex-col items-end gap-2 text-right">
                {decision.decision_maker && (
                  <div className="flex items-center gap-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{decision.decision_maker.full_name}</p>
                      <p className="text-xs text-gray-500">{getRelativeTime(decision.created_at)}</p>
                    </div>
                    <Avatar src={decision.decision_maker.avatar_url} name={decision.decision_maker.full_name} size="sm" />
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
