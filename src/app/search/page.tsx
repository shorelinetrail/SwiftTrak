'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading';
import { StatusBadge, PriorityBadge, RiskBadge } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/utils';
import {
  MagnifyingGlassIcon,
  ClipboardDocumentListIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  QuestionMarkCircleIcon,
  FlagIcon,
} from '@heroicons/react/24/outline';
import type { Action, Decision, Threat, TechnicalQuery, Milestone, Workstream } from '@/types/database';

type ActionResult = Action & { workstream?: Workstream };
type DecisionResult = Decision & { workstream?: Workstream };
type ThreatResult = Threat & { workstream?: Workstream };
type QueryResult = TechnicalQuery & { workstream?: Workstream };
type MilestoneResult = Milestone & { workstream?: Workstream };

interface SearchResults {
  actions: ActionResult[];
  decisions: DecisionResult[];
  threats: ThreatResult[];
  queries: QueryResult[];
  milestones: MilestoneResult[];
}

export default function SearchPage() {
  return (
    <Suspense fallback={<SearchLoading />}>
      <SearchPageContent />
    </Suspense>
  );
}

function SearchLoading() {
  return (
    <div className="min-h-screen">
      <Header title="Search" />
      <div className="p-6 flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    </div>
  );
}

function SearchPageContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get('q') || '';
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<SearchResults>({
    actions: [],
    decisions: [],
    threats: [],
    queries: [],
    milestones: [],
  });
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    const search = async () => {
      if (!query.trim()) {
        setResults({ actions: [], decisions: [], threats: [], queries: [], milestones: [] });
        setLoading(false);
        return;
      }

      setLoading(true);
      const supabase = createClient();
      const searchTerm = `%${query}%`;

      const [actionsRes, decisionsRes, threatsRes, queriesRes, milestonesRes] = await Promise.all([
        supabase
          .from('actions')
          .select('*, workstream:workstreams(id, name, color)')
          .or(`title.ilike.${searchTerm},description.ilike.${searchTerm}`)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('decisions')
          .select('*, workstream:workstreams(id, name, color)')
          .or(`title.ilike.${searchTerm},description.ilike.${searchTerm},rationale.ilike.${searchTerm}`)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('threats')
          .select('*, workstream:workstreams(id, name, color)')
          .or(`title.ilike.${searchTerm},description.ilike.${searchTerm}`)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('technical_queries')
          .select('*, workstream:workstreams(id, name, color)')
          .or(`title.ilike.${searchTerm},question.ilike.${searchTerm}`)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('milestones')
          .select('*, workstream:workstreams(id, name, color)')
          .or(`title.ilike.${searchTerm},description.ilike.${searchTerm}`)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      setResults({
        actions: (actionsRes.data || []) as ActionResult[],
        decisions: (decisionsRes.data || []) as DecisionResult[],
        threats: (threatsRes.data || []) as ThreatResult[],
        queries: (queriesRes.data || []) as QueryResult[],
        milestones: (milestonesRes.data || []) as MilestoneResult[],
      });
      setLoading(false);
    };

    search();
  }, [query]);

  const totalCount = results.actions.length + results.decisions.length + results.threats.length + results.queries.length + results.milestones.length;

  const tabs = [
    { id: 'all', label: 'All', count: totalCount },
    { id: 'actions', label: 'Actions', count: results.actions.length },
    { id: 'decisions', label: 'Decisions', count: results.decisions.length },
    { id: 'threats', label: 'Threats', count: results.threats.length },
    { id: 'queries', label: 'Queries', count: results.queries.length },
    { id: 'milestones', label: 'Milestones', count: results.milestones.length },
  ];

  const showActions = activeTab === 'all' || activeTab === 'actions';
  const showDecisions = activeTab === 'all' || activeTab === 'decisions';
  const showThreats = activeTab === 'all' || activeTab === 'threats';
  const showQueries = activeTab === 'all' || activeTab === 'queries';
  const showMilestones = activeTab === 'all' || activeTab === 'milestones';

  return (
    <div className="min-h-screen">
      <Header
        title={`Search: "${query}"`}
        subtitle={loading ? 'Searching...' : `${totalCount} result${totalCount !== 1 ? 's' : ''}`}
      />

      <div className="p-6 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <LoadingSpinner size="lg" />
          </div>
        ) : totalCount === 0 ? (
          <EmptyState
            icon={<MagnifyingGlassIcon className="w-6 h-6" />}
            title="No results found"
            description={`No matches found for "${query}". Try different search terms.`}
          />
        ) : (
          <>
            <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

            <div className="space-y-6">
              {/* Actions */}
              {showActions && results.actions.length > 0 && (
                <div>
                  {activeTab === 'all' && (
                    <h2 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-2">
                      <ClipboardDocumentListIcon className="w-4 h-4" />
                      Actions ({results.actions.length})
                    </h2>
                  )}
                  <div className="space-y-2">
                    {results.actions.map((action) => (
                      <Link key={action.id} href={`/actions/${action.id}`}>
                        <Card hover className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-medium text-gray-900">{action.title}</h3>
                              {action.description && (
                                <p className="text-sm text-gray-500 line-clamp-2 mt-1">{action.description}</p>
                              )}
                              <div className="flex items-center gap-2 mt-2">
                                <StatusBadge status={action.status} />
                                <PriorityBadge priority={action.priority} />
                                {action.workstream && (
                                  <span
                                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                                    style={{
                                      backgroundColor: `${action.workstream.color}20`,
                                      color: action.workstream.color,
                                    }}
                                  >
                                    {action.workstream.name}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className="text-xs text-gray-400 whitespace-nowrap">
                              {formatDate(action.created_at, { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Decisions */}
              {showDecisions && results.decisions.length > 0 && (
                <div>
                  {activeTab === 'all' && (
                    <h2 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-2">
                      <DocumentTextIcon className="w-4 h-4" />
                      Decisions ({results.decisions.length})
                    </h2>
                  )}
                  <div className="space-y-2">
                    {results.decisions.map((decision) => (
                      <Link key={decision.id} href={`/decisions/${decision.id}`}>
                        <Card hover className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-medium text-gray-900">{decision.title}</h3>
                              {decision.description && (
                                <p className="text-sm text-gray-500 line-clamp-2 mt-1">{decision.description}</p>
                              )}
                              <div className="flex items-center gap-2 mt-2">
                                {decision.workstream && (
                                  <span
                                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                                    style={{
                                      backgroundColor: `${decision.workstream.color}20`,
                                      color: decision.workstream.color,
                                    }}
                                  >
                                    {decision.workstream.name}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className="text-xs text-gray-400 whitespace-nowrap">
                              {formatDate(decision.created_at, { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Threats */}
              {showThreats && results.threats.length > 0 && (
                <div>
                  {activeTab === 'all' && (
                    <h2 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-2">
                      <ExclamationTriangleIcon className="w-4 h-4" />
                      Threats ({results.threats.length})
                    </h2>
                  )}
                  <div className="space-y-2">
                    {results.threats.map((threat) => (
                      <Link key={threat.id} href={`/threats/${threat.id}`}>
                        <Card hover className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-medium text-gray-900">{threat.title}</h3>
                              {threat.description && (
                                <p className="text-sm text-gray-500 line-clamp-2 mt-1">{threat.description}</p>
                              )}
                              <div className="flex items-center gap-2 mt-2">
                                <RiskBadge level={threat.current_risk} />
                                {threat.workstream && (
                                  <span
                                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                                    style={{
                                      backgroundColor: `${threat.workstream.color}20`,
                                      color: threat.workstream.color,
                                    }}
                                  >
                                    {threat.workstream.name}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className="text-xs text-gray-400 whitespace-nowrap">
                              {formatDate(threat.created_at, { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Queries */}
              {showQueries && results.queries.length > 0 && (
                <div>
                  {activeTab === 'all' && (
                    <h2 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-2">
                      <QuestionMarkCircleIcon className="w-4 h-4" />
                      Queries ({results.queries.length})
                    </h2>
                  )}
                  <div className="space-y-2">
                    {results.queries.map((query) => (
                      <Link key={query.id} href={`/queries/${query.id}`}>
                        <Card hover className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-medium text-gray-900">{query.title}</h3>
                              {query.question && (
                                <p className="text-sm text-gray-500 line-clamp-2 mt-1">{query.question}</p>
                              )}
                              <div className="flex items-center gap-2 mt-2">
                                <PriorityBadge priority={query.priority} />
                                <span className={`text-xs px-2 py-0.5 rounded ${query.responded_at ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                  {query.responded_at ? 'Resolved' : 'Pending'}
                                </span>
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
                            <span className="text-xs text-gray-400 whitespace-nowrap">
                              {formatDate(query.created_at, { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Milestones */}
              {showMilestones && results.milestones.length > 0 && (
                <div>
                  {activeTab === 'all' && (
                    <h2 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-2">
                      <FlagIcon className="w-4 h-4" />
                      Milestones ({results.milestones.length})
                    </h2>
                  )}
                  <div className="space-y-2">
                    {results.milestones.map((milestone) => (
                      <Link key={milestone.id} href={`/milestones/${milestone.id}`}>
                        <Card hover className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-medium text-gray-900">{milestone.title}</h3>
                              {milestone.description && (
                                <p className="text-sm text-gray-500 line-clamp-2 mt-1">{milestone.description}</p>
                              )}
                              <div className="flex items-center gap-2 mt-2">
                                <StatusBadge status={milestone.status} />
                                {milestone.workstream && (
                                  <span
                                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                                    style={{
                                      backgroundColor: `${milestone.workstream.color}20`,
                                      color: milestone.workstream.color,
                                    }}
                                  >
                                    {milestone.workstream.name}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className="text-xs text-gray-400 whitespace-nowrap">
                              {milestone.target_date
                                ? formatDate(milestone.target_date, { month: 'short', day: 'numeric' })
                                : 'No target date'}
                            </span>
                          </div>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
