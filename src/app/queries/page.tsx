'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
// import { useRealtime } from '@/hooks/use-realtime';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import { PriorityBadge, Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, getRelativeTime, cn } from '@/lib/utils';
import {
  PlusIcon,
  QuestionMarkCircleIcon,
  CheckCircleIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import type { TechnicalQuery, Workstream, User, QueryPriority } from '@/types/database';

type QueryWithRelations = TechnicalQuery & {
  workstream?: Workstream;
  submitter?: User;
  assignee?: User;
};

export default function QueriesPage() {
  const { user } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [queries, setQueries] = useState<QueryWithRelations[]>([]);
  const [activeTab, setActiveTab] = useState('all');

  const fetchQueries = useCallback(async () => {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('technical_queries')
      .select(`
        *,
        workstream:workstreams(id, name, color),
        submitter:users!technical_queries_submitted_by_fkey(id, full_name, avatar_url),
        assignee:users!technical_queries_assigned_to_fkey(id, full_name, avatar_url)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching queries:', error);
    } else {
      setQueries(data as unknown as QueryWithRelations[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchQueries();
  }, [fetchQueries]);

  // useRealtime({
  //   table: 'technical_queries',
  //   onInsert: () => fetchQueries(),
  //   onUpdate: () => fetchQueries(),
  // });

  const filteredQueries = queries.filter(q => {
    if (activeTab === 'pending') return !q.responded_at;
    if (activeTab === 'resolved') return !!q.responded_at;
    if (activeTab === 'mine') return q.assigned_to === user?.id && !q.responded_at;
    if (activeTab === 'submitted') return q.submitted_by === user?.id;
    return true;
  });

  const tabs = [
    { id: 'all', label: 'All Queries', count: queries.length },
    { id: 'pending', label: 'Pending', count: queries.filter(q => !q.responded_at).length },
    { id: 'mine', label: 'Assigned to Me', count: queries.filter(q => q.assigned_to === user?.id && !q.responded_at).length },
    { id: 'submitted', label: 'My Submissions', count: queries.filter(q => q.submitted_by === user?.id).length },
    { id: 'resolved', label: 'Resolved', count: queries.filter(q => !!q.responded_at).length },
  ];

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header title="Technical Queries" />
        <div className="flex items-center justify-center h-96">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header
        title="Technical Queries"
        subtitle={`${filteredQueries.length} quer${filteredQueries.length !== 1 ? 'ies' : 'y'}`}
        actions={
          <Link href="/queries/new">
            <Button size="sm">
              <PlusIcon className="w-4 h-4 mr-2" />
              Submit Query
            </Button>
          </Link>
        }
      />

      <div className="p-6 space-y-6">
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

        {filteredQueries.length === 0 ? (
          <EmptyState
            icon={<QuestionMarkCircleIcon className="w-6 h-6" />}
            title="No queries found"
            description={
              activeTab === 'mine'
                ? 'You have no queries assigned to you.'
                : 'No technical queries have been submitted yet.'
            }
            action={{
              label: 'Submit Query',
              onClick: () => window.location.href = '/queries/new',
            }}
          />
        ) : (
          <div className="space-y-3">
            {filteredQueries.map((query) => (
              <QueryCard key={query.id} query={query} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function QueryCard({ query }: { query: QueryWithRelations }) {
  const isResolved = !!query.responded_at;

  return (
    <Link href={`/queries/${query.id}`}>
      <Card hover>
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            <div className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center',
              isResolved ? 'bg-green-100' : 'bg-purple-100'
            )}>
              {isResolved ? (
                <CheckCircleIcon className="w-5 h-5 text-green-600" />
              ) : (
                <QuestionMarkCircleIcon className="w-5 h-5 text-purple-600" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-medium text-gray-900">{query.title}</h3>
                    <PriorityBadge priority={query.priority} />
                    {isResolved && <Badge variant="success">Resolved</Badge>}
                  </div>
                  <p className="text-sm text-gray-600 mt-1 line-clamp-2">{query.description}</p>
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <ClockIcon className="w-4 h-4" />
                      {getRelativeTime(query.created_at)}
                    </span>
                    {query.submitter && (
                      <span>From: {query.submitter.full_name}</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  {query.assignee && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Assigned to:</span>
                      <Avatar src={query.assignee.avatar_url} name={query.assignee.full_name} size="sm" />
                    </div>
                  )}
                  {query.workstream && (
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                      style={{
                        backgroundColor: `${query.workstream.color}20`,
                        color: query.workstream.color,
                      }}
                    >
                      {query.workstream.name}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
