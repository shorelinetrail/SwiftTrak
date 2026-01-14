'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
// import { useRealtime } from '@/hooks/use-realtime';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { RiskBadge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, cn } from '@/lib/utils';
import {
  PlusIcon,
  FunnelIcon,
  ExclamationTriangleIcon,
  ArrowsUpDownIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import type { Threat, Workstream, User, RiskLevel, ThreatStatus } from '@/types/database';

type ThreatWithRelations = Threat & {
  workstream?: Workstream;
  creator?: User;
};

export default function ThreatsPage() {
  const { workstreams, setWorkstreams } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [threats, setThreats] = useState<ThreatWithRelations[]>([]);
  const [filteredThreats, setFilteredThreats] = useState<ThreatWithRelations[]>([]);

  const [workstreamFilter, setWorkstreamFilter] = useState<string>('all');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [sortBy, setSortBy] = useState<string>('risk');

  // Ensure workstreams are loaded
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
        console.error('[Threats] Error fetching workstreams:', error);
      }
    };
    fetchWorkstreams();

    return () => { mounted = false; };
  }, [workstreams.length, setWorkstreams]);

  const fetchThreats = useCallback(async () => {
    const supabase = createClient();

    try {
      // Add timeout to prevent hanging
      const result = await Promise.race([
        supabase
          .from('threats')
          .select(`
            *,
            workstream:workstreams(id, name, color),
            creator:users!threats_created_by_fkey(id, full_name)
          `)
          .order('created_at', { ascending: false }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
      ]);

      if (result?.data) {
        setThreats(result.data as unknown as ThreatWithRelations[]);
      } else if (result?.error) {
        console.error('Error fetching threats:', result.error);
      }
    } catch (error) {
      console.error('[Threats] Error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchThreats();
  }, [fetchThreats]);

  useEffect(() => {
    let filtered = [...threats];

    // Filter by status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(t => t.status === statusFilter);
    }

    if (workstreamFilter !== 'all') {
      filtered = filtered.filter(t => t.workstream_id === workstreamFilter);
    }

    if (riskFilter !== 'all') {
      filtered = filtered.filter(t => t.current_risk === riskFilter);
    }

    // Sort
    const riskOrder: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2 };
    if (sortBy === 'risk') {
      filtered.sort((a, b) => riskOrder[a.current_risk] - riskOrder[b.current_risk]);
    } else if (sortBy === 'risk_desc') {
      filtered.sort((a, b) => riskOrder[b.current_risk] - riskOrder[a.current_risk]);
    } else if (sortBy === 'newest') {
      filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortBy === 'oldest') {
      filtered.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }

    setFilteredThreats(filtered);
  }, [threats, workstreamFilter, riskFilter, statusFilter, sortBy]);

  // useRealtime({
  //   table: 'threats',
  //   onInsert: () => fetchThreats(),
  //   onUpdate: () => fetchThreats(),
  //   onDelete: () => fetchThreats(),
  // });

  const workstreamOptions = [
    { value: 'all', label: 'All Workstreams' },
    ...workstreams.map(w => ({ value: w.id, label: w.name })),
  ];

  const riskOptions = [
    { value: 'all', label: 'All Risk Levels' },
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' },
  ];

  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'open', label: 'Open' },
    { value: 'closed', label: 'Closed' },
  ];

  const sortOptions = [
    { value: 'risk', label: 'Risk: High to Low' },
    { value: 'risk_desc', label: 'Risk: Low to High' },
    { value: 'newest', label: 'Newest First' },
    { value: 'oldest', label: 'Oldest First' },
  ];

  // Only count open threats for summary
  const openThreats = threats.filter(t => t.status === 'open');

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header title="Threats" />
        <div className="flex items-center justify-center h-96">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header
        title="Threats"
        subtitle={`${filteredThreats.length} threat${filteredThreats.length !== 1 ? 's' : ''} identified`}
        actions={
          <Link href="/threats/new">
            <Button size="sm">
              <PlusIcon className="w-4 h-4 mr-2" />
              Log Threat
            </Button>
          </Link>
        }
      />

      <div className="p-6 space-y-6">
        {/* Risk Summary - only counts open threats */}
        <div className="grid grid-cols-4 gap-4">
          <Card className="bg-red-50 border-red-200">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-red-600 font-medium">High Risk</p>
                  <p className="text-2xl font-bold text-red-700">
                    {openThreats.filter(t => t.current_risk === 'high').length}
                  </p>
                </div>
                <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                  <ExclamationTriangleIcon className="w-5 h-5 text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-yellow-50 border-yellow-200">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-yellow-600 font-medium">Medium Risk</p>
                  <p className="text-2xl font-bold text-yellow-700">
                    {openThreats.filter(t => t.current_risk === 'medium').length}
                  </p>
                </div>
                <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-green-50 border-green-200">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-600 font-medium">Low Risk</p>
                  <p className="text-2xl font-bold text-green-700">
                    {openThreats.filter(t => t.current_risk === 'low').length}
                  </p>
                </div>
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <ExclamationTriangleIcon className="w-5 h-5 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gray-50 border-gray-200">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 font-medium">Closed</p>
                  <p className="text-2xl font-bold text-gray-700">
                    {threats.filter(t => t.status === 'closed').length}
                  </p>
                </div>
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                  <CheckCircleIcon className="w-5 h-5 text-gray-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card padding="sm">
          <CardContent>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 text-gray-500">
                <FunnelIcon className="w-4 h-4" />
                <span className="text-sm font-medium">Filters:</span>
              </div>
              <Select
                options={statusOptions}
                value={statusFilter}
                onChange={setStatusFilter}
                className="w-32"
              />
              <Select
                options={riskOptions}
                value={riskFilter}
                onChange={setRiskFilter}
                className="w-40"
              />
              <Select
                options={workstreamOptions}
                value={workstreamFilter}
                onChange={setWorkstreamFilter}
                className="w-48"
              />
              <div className="flex items-center gap-2 ml-auto text-gray-500">
                <ArrowsUpDownIcon className="w-4 h-4" />
                <span className="text-sm font-medium">Sort:</span>
              </div>
              <Select
                options={sortOptions}
                value={sortBy}
                onChange={setSortBy}
                className="w-44"
              />
            </div>
          </CardContent>
        </Card>

        {/* Threats List */}
        {filteredThreats.length === 0 ? (
          <EmptyState
            icon={<ExclamationTriangleIcon className="w-6 h-6" />}
            title="No threats found"
            description="No threats match your current filters."
            action={{
              label: 'Log Threat',
              onClick: () => window.location.href = '/threats/new',
            }}
          />
        ) : (
          <div className="space-y-3">
            {filteredThreats.map((threat) => (
              <ThreatCard key={threat.id} threat={threat} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ThreatCard({ threat }: { threat: ThreatWithRelations }) {
  const isClosed = threat.status === 'closed';

  return (
    <Link href={`/threats/${threat.id}`}>
      <Card hover className={isClosed ? 'opacity-75' : ''}>
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            <div className={cn(
              'w-1 h-full min-h-[80px] rounded-full',
              isClosed && 'bg-gray-400',
              !isClosed && threat.current_risk === 'high' && 'bg-red-500',
              !isClosed && threat.current_risk === 'medium' && 'bg-yellow-500',
              !isClosed && threat.current_risk === 'low' && 'bg-green-500',
            )} />

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-medium text-gray-900">{threat.title}</h3>
                    {isClosed && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                        Closed
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-1 line-clamp-2">{threat.description}</p>
                  <div className="flex items-center gap-3 mt-2 text-sm text-gray-500">
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
                    {threat.expected_delay && (
                      <span>Potential delay: {threat.expected_delay}</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{isClosed ? 'Final:' : 'Current:'}</span>
                    <RiskBadge risk={isClosed && threat.mitigated_risk ? threat.mitigated_risk : threat.current_risk} />
                  </div>
                  {!isClosed && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Unmitigated:</span>
                      <RiskBadge risk={threat.unmitigated_risk} />
                    </div>
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
