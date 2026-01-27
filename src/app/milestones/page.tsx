'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
// import { useRealtime } from '@/hooks/use-realtime';
import { usePermission } from '@/hooks/use-user';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, getDaysUntil, cn, getWorkstreamDisplayName } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
  PlusIcon,
  FlagIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
  PencilIcon,
} from '@heroicons/react/24/outline';
import type { Milestone, Workstream, User } from '@/types/database';

type MilestoneWithRelations = Milestone & {
  workstream?: Workstream;
  creator?: User;
};

export default function MilestonesPage() {
  const { workstreams } = useAppStore();
  const { canEdit } = usePermission();
  const [loading, setLoading] = useState(true);
  const [milestones, setMilestones] = useState<MilestoneWithRelations[]>([]);

  const fetchMilestones = useCallback(async () => {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('milestones')
      .select(`
        *,
        workstream:workstreams(id, name, color),
        creator:users!milestones_created_by_fkey(id, full_name)
      `)
      .order('target_date', { ascending: true });

    if (error) {
      console.error('Error fetching milestones:', error);
    } else {
      setMilestones(data as unknown as MilestoneWithRelations[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMilestones();
  }, [fetchMilestones]);

  // useRealtime({
  //   table: 'milestones',
  //   onInsert: () => fetchMilestones(),
  //   onUpdate: () => fetchMilestones(),
  //   onDelete: () => fetchMilestones(),
  // });

  const handleToggleComplete = async (milestone: MilestoneWithRelations) => {
    const supabase = createClient();

    const newStatus = milestone.status === 'completed' ? 'pending' : 'completed';
    const completed_at = newStatus === 'completed' ? new Date().toISOString() : null;

    const { error } = await supabase
      .from('milestones')
      .update({ status: newStatus, completed_at })
      .eq('id', milestone.id);

    if (error) {
      toast.error('Failed to update milestone');
    } else {
      toast.success(newStatus === 'completed' ? 'Milestone completed!' : 'Milestone reopened');
      fetchMilestones();
    }
  };

  const pendingMilestones = milestones.filter(m => m.status === 'pending');
  const completedMilestones = milestones.filter(m => m.status === 'completed');
  const missedMilestones = milestones.filter(m => m.status === 'missed');

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header title="Milestones" />
        <div className="flex items-center justify-center h-96">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header
        title="Key Milestones"
        subtitle={`${pendingMilestones.length} pending, ${completedMilestones.length} completed`}
        actions={
          canEdit && (
            <Link href="/milestones/new">
              <Button size="sm">
                <PlusIcon className="w-4 h-4 mr-2" />
                Add Milestone
              </Button>
            </Link>
          )
        }
      />

      <div className="p-6 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <ClockIcon className="w-8 h-8 text-blue-600" />
                <div>
                  <p className="text-2xl font-bold text-blue-700">{pendingMilestones.length}</p>
                  <p className="text-sm text-blue-600">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-green-50 border-green-200">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <CheckCircleIcon className="w-8 h-8 text-green-600" />
                <div>
                  <p className="text-2xl font-bold text-green-700">{completedMilestones.length}</p>
                  <p className="text-sm text-green-600">Completed</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-red-50 border-red-200">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <ExclamationCircleIcon className="w-8 h-8 text-red-600" />
                <div>
                  <p className="text-2xl font-bold text-red-700">{missedMilestones.length}</p>
                  <p className="text-sm text-red-600">Missed</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pending Milestones */}
        {pendingMilestones.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Upcoming Milestones</h2>
            <div className="space-y-3">
              {pendingMilestones.map((milestone) => (
                <MilestoneCard
                  key={milestone.id}
                  milestone={milestone}
                  workstreams={workstreams}
                  onToggleComplete={canEdit ? () => handleToggleComplete(milestone) : undefined}
                  canEdit={canEdit}
                />
              ))}
            </div>
          </div>
        )}

        {/* Completed Milestones */}
        {completedMilestones.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Completed Milestones</h2>
            <div className="space-y-3">
              {completedMilestones.map((milestone) => (
                <MilestoneCard
                  key={milestone.id}
                  milestone={milestone}
                  workstreams={workstreams}
                  onToggleComplete={canEdit ? () => handleToggleComplete(milestone) : undefined}
                  canEdit={canEdit}
                />
              ))}
            </div>
          </div>
        )}

        {milestones.length === 0 && (
          <EmptyState
            icon={<FlagIcon className="w-6 h-6" />}
            title="No milestones defined"
            description="Create milestones to track key project targets."
            action={{
              label: 'Add Milestone',
              onClick: () => window.location.href = '/milestones/new',
            }}
          />
        )}
      </div>
    </div>
  );
}

function MilestoneCard({
  milestone,
  workstreams,
  onToggleComplete,
  canEdit,
}: {
  milestone: MilestoneWithRelations;
  workstreams: Workstream[];
  onToggleComplete?: () => void;
  canEdit?: boolean;
}) {
  const isCompleted = milestone.status === 'completed';
  const isPast = new Date(milestone.target_date) < new Date();
  const daysUntil = getDaysUntil(milestone.target_date);

  return (
    <Card className={cn(
      isCompleted && 'bg-green-50/50',
      !isCompleted && isPast && 'bg-red-50/50 border-red-200'
    )}>
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          {/* Complete button */}
          {onToggleComplete && (
            <button
              onClick={(e) => {
                e.preventDefault();
                onToggleComplete();
              }}
              className={cn(
                'w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors',
                isCompleted
                  ? 'bg-green-500 border-green-500 text-white'
                  : 'border-gray-300 hover:border-green-500'
              )}
            >
              {isCompleted && <CheckCircleIcon className="w-4 h-4" />}
            </button>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className={cn(
                'text-base font-medium',
                isCompleted ? 'text-gray-500 line-through' : 'text-gray-900'
              )}>
                {milestone.title}
              </h3>
              {milestone.workstream && (
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                  style={{
                    backgroundColor: `${milestone.workstream.color}20`,
                    color: milestone.workstream.color,
                  }}
                >
                  {getWorkstreamDisplayName(milestone.workstream, workstreams)}
                </span>
              )}
            </div>
            {milestone.description && (
              <p className="text-sm text-gray-500 mt-1">{milestone.description}</p>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className={cn(
                'text-sm font-medium',
                isCompleted ? 'text-green-600' : isPast ? 'text-red-600' : 'text-gray-900'
              )}>
                {formatDate(milestone.target_date, { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
              {!isCompleted && (
                <p className={cn(
                  'text-xs',
                  isPast ? 'text-red-500' : daysUntil === 0 ? 'text-amber-600' : 'text-gray-500'
                )}>
                  {daysUntil === 0 ? 'Due today' : isPast ? `${Math.abs(daysUntil)} days overdue` : `${daysUntil} days`}
                </p>
              )}
              {isCompleted && milestone.completed_at && (
                <p className="text-xs text-green-600">
                  Completed {formatDate(milestone.completed_at, { month: 'short', day: 'numeric' })}
                </p>
              )}
            </div>
            {canEdit && (
              <Link href={`/milestones/${milestone.id}`}>
                <Button variant="ghost" size="sm" title="Edit milestone">
                  <PencilIcon className="w-4 h-4" />
                </Button>
              </Link>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
