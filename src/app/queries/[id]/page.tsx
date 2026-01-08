'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import { useRealtime } from '@/hooks/use-realtime';
import { usePermission } from '@/hooks/use-user';
import { Header } from '@/components/layout/header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { PriorityBadge, Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { LoadingPage } from '@/components/ui/loading';
import { formatDate, getRelativeTime } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
  CheckCircleIcon,
  ClockIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import type { TechnicalQuery, Workstream, User } from '@/types/database';

type QueryWithRelations = TechnicalQuery & {
  workstream?: Workstream;
  submitter?: User;
  assignee?: User;
};

export default function QueryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryId = params.id as string;

  const { user } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState<QueryWithRelations | null>(null);
  const [response, setResponse] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchQuery = useCallback(async () => {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('technical_queries')
      .select(`
        *,
        workstream:workstreams(id, name, color),
        submitter:users!technical_queries_submitted_by_fkey(id, full_name, email, avatar_url),
        assignee:users!technical_queries_assigned_to_fkey(id, full_name, email, avatar_url)
      `)
      .eq('id', queryId)
      .single();

    if (error || !data) {
      toast.error('Query not found');
      router.push('/queries');
      return;
    }

    setQuery(data as unknown as QueryWithRelations);
    setLoading(false);
  }, [queryId, router]);

  useEffect(() => {
    fetchQuery();
  }, [fetchQuery]);

  useRealtime({
    table: 'technical_queries',
    filter: `id=eq.${queryId}`,
    onUpdate: () => fetchQuery(),
  });

  const handleSubmitResponse = async () => {
    if (!response.trim()) {
      toast.error('Please enter a response');
      return;
    }

    setSubmitting(true);

    try {
      const supabase = createClient();

      const { error } = await supabase
        .from('technical_queries')
        .update({
          response: response.trim(),
          responded_at: new Date().toISOString(),
        })
        .eq('id', queryId);

      if (error) throw error;

      // Send notification to submitter
      await fetch('/api/notifications/query-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queryId }),
      });

      toast.success('Response submitted');
      fetchQuery();
    } catch (error) {
      console.error('Error submitting response:', error);
      toast.error('Failed to submit response');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingPage />;
  }

  if (!query) {
    return null;
  }

  const isResolved = !!query.responded_at;
  const isAssignee = query.assigned_to === user?.id;
  const canRespond = isAssignee && !isResolved;

  return (
    <div className="min-h-screen">
      <Header
        title={query.title}
        subtitle={query.workstream?.name || 'Technical Query'}
      />

      <div className="p-6 max-w-4xl space-y-6">
        {/* Status Banner */}
        <div className={`rounded-lg p-4 ${isResolved ? 'bg-green-50 border border-green-200' : 'bg-purple-50 border border-purple-200'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isResolved ? (
                <CheckCircleIcon className="w-6 h-6 text-green-600" />
              ) : (
                <ClockIcon className="w-6 h-6 text-purple-600" />
              )}
              <div>
                <p className={`font-medium ${isResolved ? 'text-green-800' : 'text-purple-800'}`}>
                  {isResolved ? 'Query Resolved' : 'Awaiting Response'}
                </p>
                <p className={`text-sm ${isResolved ? 'text-green-600' : 'text-purple-600'}`}>
                  {isResolved
                    ? `Responded ${getRelativeTime(query.responded_at!)}`
                    : 'Response pending from assignee'
                  }
                </p>
              </div>
            </div>
            <PriorityBadge priority={query.priority} />
          </div>
        </div>

        {/* Query Details */}
        <Card>
          <CardHeader>
            <CardTitle>Query Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-2">Question</h4>
              <p className="text-gray-900 whitespace-pre-wrap">{query.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-6 pt-4 border-t border-gray-200">
              <div>
                <h4 className="text-sm font-medium text-gray-500 mb-2">Submitted By</h4>
                {query.submitter && (
                  <div className="flex items-center gap-2">
                    <Avatar src={query.submitter.avatar_url} name={query.submitter.full_name} size="sm" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{query.submitter.full_name}</p>
                      <p className="text-xs text-gray-500">{formatDate(query.created_at)}</p>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-500 mb-2">Assigned To</h4>
                {query.assignee && (
                  <div className="flex items-center gap-2">
                    <Avatar src={query.assignee.avatar_url} name={query.assignee.full_name} size="sm" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{query.assignee.full_name}</p>
                      <p className="text-xs text-gray-500">{query.assignee.email}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Response Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {isResolved ? (
                <CheckCircleIcon className="w-5 h-5 text-green-600" />
              ) : (
                <ClockIcon className="w-5 h-5 text-gray-400" />
              )}
              Response
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isResolved ? (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-gray-900 whitespace-pre-wrap">{query.response}</p>
                <p className="text-sm text-gray-500 mt-4">
                  Responded by {query.assignee?.full_name} on {formatDate(query.responded_at!)}
                </p>
              </div>
            ) : canRespond ? (
              <div className="space-y-4">
                <Textarea
                  placeholder="Enter your response to this query..."
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  rows={6}
                />
                <div className="flex justify-end">
                  <Button onClick={handleSubmitResponse} loading={submitting}>
                    <CheckCircleIcon className="w-4 h-4 mr-2" />
                    Submit Response
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <ClockIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>Waiting for response from {query.assignee?.full_name}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
