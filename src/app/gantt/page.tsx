'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
// import { useRealtime } from '@/hooks/use-realtime';
import { usePermission } from '@/hooks/use-user';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { LoadingSpinner } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { Avatar } from '@/components/ui/avatar';
import { calculateCriticalPath, calculatePERT, cn, formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
  PlusIcon,
  ChartBarIcon,
  CalendarIcon,
  UserIcon,
  ExclamationTriangleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  LinkIcon,
  TrashIcon,
  FlagIcon,
} from '@heroicons/react/24/outline';
import type { GanttTask, GanttDependency, Workstream, User, Milestone } from '@/types/database';

type GanttTaskWithRelations = GanttTask & {
  workstream?: Workstream;
  assignee?: User;
  dependencies?: GanttDependency[];
};

type MilestoneWithRelations = Milestone & {
  workstream?: Workstream;
};

export default function GanttPage() {
  const { workstreams } = useAppStore();
  const { canEdit } = usePermission();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<GanttTaskWithRelations[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const [viewMode, setViewMode] = useState<'gantt' | 'resource'>('gantt');
  const [showCriticalPath, setShowCriticalPath] = useState(true);
  const [showUncertainty, setShowUncertainty] = useState(false);
  const [showDependencies, setShowDependencies] = useState(true);
  const [showMilestones, setShowMilestones] = useState(true);
  const [allDependencies, setAllDependencies] = useState<GanttDependency[]>([]);
  const [milestones, setMilestones] = useState<MilestoneWithRelations[]>([]);

  const [addTaskModalOpen, setAddTaskModalOpen] = useState(false);
  const [editTaskModalOpen, setEditTaskModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<GanttTaskWithRelations | null>(null);
  const [milestoneModalOpen, setMilestoneModalOpen] = useState(false);
  const [selectedMilestone, setSelectedMilestone] = useState<MilestoneWithRelations | null>(null);

  const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>({
    start: new Date(),
    end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  const fetchTasks = useCallback(async () => {
    try {
      const supabase = createClient();

      const { data: tasksData, error } = await supabase
        .from('gantt_tasks')
        .select(`
          *,
          workstream:workstreams(id, name, color),
          assignee:users!gantt_tasks_assigned_to_fkey(id, full_name, avatar_url)
        `)
        .order('order_index');

      if (error) {
        console.error('Error fetching tasks:', error);
        toast.error('Failed to load Gantt data');
      } else {
        // Fetch dependencies
        const { data: depsData } = await supabase
          .from('gantt_dependencies')
          .select('*');

        const tasksWithDeps = (tasksData || []).map(task => ({
          ...task,
          dependencies: (depsData || []).filter(d => d.task_id === task.id),
        }));

        setTasks(tasksWithDeps as unknown as GanttTaskWithRelations[]);
        setAllDependencies((depsData || []) as GanttDependency[]);

        // Calculate date range from tasks
        if (tasksWithDeps.length > 0) {
          const allDates = tasksWithDeps.flatMap(t => [new Date(t.start_date), new Date(t.end_date)]);
          const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
          const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
          // Add some padding
          minDate.setDate(minDate.getDate() - 2);
          maxDate.setDate(maxDate.getDate() + 5);
          setDateRange({ start: minDate, end: maxDate });
        }
      }

      // Fetch users
      const { data: usersData } = await supabase
        .from('users')
        .select('*')
        .order('full_name');

      if (usersData) {
        setUsers(usersData as User[]);
      }

      // Fetch milestones
      const { data: milestonesData } = await supabase
        .from('milestones')
        .select(`
          *,
          workstream:workstreams(id, name, color)
        `)
        .order('target_date');

      if (milestonesData) {
        setMilestones(milestonesData as MilestoneWithRelations[]);

        // Extend date range to include milestones
        if (milestonesData.length > 0) {
          const milestoneDates = milestonesData.map(m => new Date(m.target_date));
          const maxMilestoneDate = new Date(Math.max(...milestoneDates.map(d => d.getTime())));
          setDateRange(prev => ({
            start: prev.start,
            end: new Date(Math.max(prev.end.getTime(), maxMilestoneDate.getTime() + 5 * 24 * 60 * 60 * 1000)),
          }));
        }
      }
    } catch (error) {
      console.error('Error loading gantt data:', error);
      toast.error('Failed to load Gantt chart');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // useRealtime({
  //   table: 'gantt_tasks',
  //   onInsert: () => fetchTasks(),
  //   onUpdate: () => fetchTasks(),
  //   onDelete: () => fetchTasks(),
  // });

  const criticalPath = useMemo(() => {
    if (!showCriticalPath || tasks.length === 0) return [];
    return calculateCriticalPath(tasks);
  }, [tasks, showCriticalPath]);

  // Group tasks by workstream with hierarchy support
  const tasksByWorkstream = useMemo(() => {
    const grouped = new Map<string, GanttTaskWithRelations[]>();
    const unassigned: GanttTaskWithRelations[] = [];

    tasks.forEach(task => {
      if (task.workstream_id && task.workstream) {
        const existing = grouped.get(task.workstream_id) || [];
        existing.push(task);
        grouped.set(task.workstream_id, existing);
      } else {
        unassigned.push(task);
      }
    });

    // Build hierarchy: parent workstreams with their children
    type WorkstreamGroup = {
      workstream: Workstream | null;
      tasks: GanttTaskWithRelations[];
      isSubworkstream?: boolean;
      children?: WorkstreamGroup[];
    };

    const result: WorkstreamGroup[] = [];
    const rootWorkstreams = workstreams.filter(ws => !ws.parent_id);
    const childrenMap = new Map<string, Workstream[]>();

    workstreams.forEach(ws => {
      if (ws.parent_id) {
        const existing = childrenMap.get(ws.parent_id) || [];
        existing.push(ws);
        childrenMap.set(ws.parent_id, existing);
      }
    });

    rootWorkstreams.forEach(ws => {
      const wsTasks = grouped.get(ws.id) || [];
      const children = childrenMap.get(ws.id) || [];

      // Add parent workstream with its tasks
      if (wsTasks.length > 0 || children.some(c => (grouped.get(c.id) || []).length > 0)) {
        const childGroups: WorkstreamGroup[] = children
          .filter(c => (grouped.get(c.id) || []).length > 0)
          .map(c => ({
            workstream: c,
            tasks: grouped.get(c.id) || [],
            isSubworkstream: true,
          }));

        result.push({
          workstream: ws,
          tasks: wsTasks,
          children: childGroups,
        });
      }
    });

    if (unassigned.length > 0) {
      result.push({ workstream: null, tasks: unassigned });
    }

    return result;
  }, [tasks, workstreams]);

  const daysBetween = Math.ceil(
    (dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24)
  );

  const getTaskPosition = (task: GanttTaskWithRelations) => {
    const startDate = new Date(task.start_date);
    const endDate = new Date(task.end_date);

    const startOffset = Math.max(0,
      (startDate.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24)
    );
    const duration = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);

    const left = (startOffset / daysBetween) * 100;
    const width = Math.max(1, (duration / daysBetween) * 100);

    return { left: `${left}%`, width: `${width}%` };
  };

  const handleAddTask = async (formData: Partial<GanttTask>) => {
    const supabase = createClient();

    const { error } = await supabase.from('gantt_tasks').insert({
      title: formData.title,
      workstream_id: formData.workstream_id || null,
      start_date: formData.start_date,
      end_date: formData.end_date,
      progress: 0,
      order_index: tasks.length,
      assigned_to: formData.assigned_to || null,
      optimistic_duration: formData.optimistic_duration,
      pessimistic_duration: formData.pessimistic_duration,
      most_likely_duration: formData.most_likely_duration,
    });

    if (error) {
      toast.error('Failed to add task');
    } else {
      toast.success('Task added');
      setAddTaskModalOpen(false);
      fetchTasks();
    }
  };

  const handleUpdateTask = async (taskId: string, updates: Partial<GanttTask>) => {
    const supabase = createClient();

    const { error } = await supabase
      .from('gantt_tasks')
      .update(updates)
      .eq('id', taskId);

    if (error) {
      toast.error('Failed to update task');
    } else {
      toast.success('Task updated');
      setEditTaskModalOpen(false);
      fetchTasks();
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const supabase = createClient();

    const { error } = await supabase
      .from('gantt_tasks')
      .delete()
      .eq('id', taskId);

    if (error) {
      toast.error('Failed to delete task');
    } else {
      toast.success('Task deleted');
      setEditTaskModalOpen(false);
      fetchTasks();
    }
  };

  const handleAddDependency = async (taskId: string, dependsOnId: string, dependencyType: GanttDependency['dependency_type']) => {
    const supabase = createClient();

    const { error } = await supabase
      .from('gantt_dependencies')
      .insert({
        task_id: taskId,
        depends_on_id: dependsOnId,
        dependency_type: dependencyType,
      });

    if (error) {
      toast.error('Failed to add dependency');
    } else {
      toast.success('Dependency added');
      fetchTasks();
    }
  };

  const handleRemoveDependency = async (dependencyId: string) => {
    const supabase = createClient();

    const { error } = await supabase
      .from('gantt_dependencies')
      .delete()
      .eq('id', dependencyId);

    if (error) {
      toast.error('Failed to remove dependency');
    } else {
      toast.success('Dependency removed');
      fetchTasks();
    }
  };

  const handleAddMilestone = async (data: Partial<Milestone>) => {
    const supabase = createClient();

    const { error } = await supabase.from('milestones').insert({
      title: data.title,
      description: data.description,
      workstream_id: data.workstream_id || null,
      target_date: data.target_date,
      status: 'pending',
    });

    if (error) {
      toast.error('Failed to add milestone');
    } else {
      toast.success('Milestone added');
      setMilestoneModalOpen(false);
      fetchTasks();
    }
  };

  const handleUpdateMilestone = async (milestoneId: string, data: Partial<Milestone>) => {
    const supabase = createClient();

    const { error } = await supabase
      .from('milestones')
      .update(data)
      .eq('id', milestoneId);

    if (error) {
      toast.error('Failed to update milestone');
    } else {
      toast.success('Milestone updated');
      setMilestoneModalOpen(false);
      setSelectedMilestone(null);
      fetchTasks();
    }
  };

  const handleDeleteMilestone = async (milestoneId: string) => {
    const supabase = createClient();

    const { error } = await supabase
      .from('milestones')
      .delete()
      .eq('id', milestoneId);

    if (error) {
      toast.error('Failed to delete milestone');
    } else {
      toast.success('Milestone deleted');
      setMilestoneModalOpen(false);
      setSelectedMilestone(null);
      fetchTasks();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header title="Gantt Chart" />
        <div className="flex items-center justify-center h-96">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header
        title="Gantt Chart"
        subtitle="Project timeline and dependencies"
        actions={
          <div className="flex gap-2">
            <Button
              variant={viewMode === 'gantt' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setViewMode('gantt')}
            >
              <ChartBarIcon className="w-4 h-4 mr-1" />
              Gantt
            </Button>
            <Button
              variant={viewMode === 'resource' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setViewMode('resource')}
            >
              <UserIcon className="w-4 h-4 mr-1" />
              Resource
            </Button>
            {canEdit && (
              <>
                <Button size="sm" variant="outline" onClick={() => {
                  setSelectedMilestone(null);
                  setMilestoneModalOpen(true);
                }}>
                  <FlagIcon className="w-4 h-4 mr-2" />
                  Add Milestone
                </Button>
                <Button size="sm" onClick={() => setAddTaskModalOpen(true)}>
                  <PlusIcon className="w-4 h-4 mr-2" />
                  Add Task
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="p-6 space-y-4">
        {/* Controls */}
        <Card padding="sm">
          <CardContent>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCriticalPath}
                  onChange={(e) => setShowCriticalPath(e.target.checked)}
                  className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <span className="text-sm text-gray-700">Show Critical Path</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showUncertainty}
                  onChange={(e) => setShowUncertainty(e.target.checked)}
                  className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <span className="text-sm text-gray-700">Show Uncertainty</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showDependencies}
                  onChange={(e) => setShowDependencies(e.target.checked)}
                  className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <span className="text-sm text-gray-700">Show Dependencies</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showMilestones}
                  onChange={(e) => setShowMilestones(e.target.checked)}
                  className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <span className="text-sm text-gray-700">Show Milestones</span>
              </label>
              <div className="flex items-center gap-2 ml-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const newStart = new Date(dateRange.start);
                    const newEnd = new Date(dateRange.end);
                    newStart.setDate(newStart.getDate() - 7);
                    newEnd.setDate(newEnd.getDate() - 7);
                    setDateRange({ start: newStart, end: newEnd });
                  }}
                >
                  <ChevronLeftIcon className="w-4 h-4" />
                </Button>
                <span className="text-sm text-gray-600">
                  {formatDate(dateRange.start, { month: 'short', day: 'numeric' })} -{' '}
                  {formatDate(dateRange.end, { month: 'short', day: 'numeric' })}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const newStart = new Date(dateRange.start);
                    const newEnd = new Date(dateRange.end);
                    newStart.setDate(newStart.getDate() + 7);
                    newEnd.setDate(newEnd.getDate() + 7);
                    setDateRange({ start: newStart, end: newEnd });
                  }}
                >
                  <ChevronRightIcon className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Legend */}
        {(showCriticalPath && criticalPath.length > 0) || (showMilestones && milestones.length > 0) || showDependencies ? (
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
            {showCriticalPath && criticalPath.length > 0 && (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-red-500 rounded" />
                  <span>Critical Path ({criticalPath.length} tasks)</span>
                </div>
                <div className="flex items-center gap-2">
                  <ExclamationTriangleIcon className="w-4 h-4 text-yellow-500" />
                  <span>Any delay will delay the project</span>
                </div>
              </>
            )}
            {showMilestones && milestones.length > 0 && (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-purple-500 rotate-45" />
                  <span>Pending</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rotate-45" />
                  <span>Completed</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rotate-45" />
                  <span>Missed</span>
                </div>
              </>
            )}
            {showDependencies && allDependencies.length > 0 && (
              <div className="flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-blue-500" />
                <span>Dependencies ({allDependencies.length} links)</span>
              </div>
            )}
          </div>
        ) : null}

        {/* Gantt Chart */}
        {tasks.length === 0 ? (
          <EmptyState
            icon={<ChartBarIcon className="w-6 h-6" />}
            title="No tasks defined"
            description="Add tasks to visualize your project timeline."
            action={canEdit ? {
              label: 'Add Task',
              onClick: () => setAddTaskModalOpen(true),
            } : undefined}
          />
        ) : viewMode === 'gantt' ? (
          <Card padding="none" className="overflow-hidden">
            {/* Header */}
            <div className="flex border-b border-gray-200">
              <div className="w-64 flex-shrink-0 p-3 bg-gray-50 font-medium text-sm text-gray-700 border-r border-gray-200">
                Task
              </div>
              <div className="flex-1 relative h-10 bg-gray-50">
                {/* Date headers */}
                {Array.from({ length: Math.min(daysBetween, 30) }).map((_, i) => {
                  const date = new Date(dateRange.start);
                  date.setDate(date.getDate() + i);
                  return (
                    <div
                      key={i}
                      className="absolute top-0 h-full border-r border-gray-200 text-xs text-gray-500 flex items-center justify-center"
                      style={{
                        left: `${(i / daysBetween) * 100}%`,
                        width: `${(1 / daysBetween) * 100}%`,
                      }}
                    >
                      {date.getDate() === 1 || i === 0
                        ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        : date.getDate()}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Tasks grouped by workstream */}
            <div>
              {tasksByWorkstream.map(({ workstream, tasks: wsTasks, children }) => (
                <div key={workstream?.id || 'unassigned'}>
                  {/* Workstream header */}
                  <div className="flex border-b border-gray-200 bg-gray-100">
                    <div className="w-64 flex-shrink-0 p-2 border-r border-gray-200">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: workstream?.color || '#6b7280' }}
                        />
                        <span className="text-sm font-semibold text-gray-700">
                          {workstream?.name || 'Unassigned'}
                        </span>
                        <span className="text-xs text-gray-500">
                          ({wsTasks.length} task{wsTasks.length !== 1 ? 's' : ''})
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 h-8" />
                  </div>

                  {/* Tasks in this workstream */}
                  {wsTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      workstream={workstream}
                      indent={1}
                      getTaskPosition={getTaskPosition}
                      criticalPath={criticalPath}
                      showUncertainty={showUncertainty}
                      onClick={() => {
                        setSelectedTask(task);
                        setEditTaskModalOpen(true);
                      }}
                    />
                  ))}

                  {/* Sub-workstreams */}
                  {children?.map(({ workstream: subWs, tasks: subTasks }) => (
                    <div key={subWs?.id}>
                      {/* Sub-workstream header */}
                      <div className="flex border-b border-gray-200 bg-gray-50">
                        <div className="w-64 flex-shrink-0 p-2 pl-6 border-r border-gray-200">
                          <div className="flex items-center gap-2">
                            <ChevronRightIcon className="w-3 h-3 text-gray-400" />
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: subWs?.color || '#6b7280' }}
                            />
                            <span className="text-xs font-medium text-gray-600">
                              {subWs?.name}
                            </span>
                            <span className="text-xs text-gray-400">
                              ({subTasks.length})
                            </span>
                          </div>
                        </div>
                        <div className="flex-1 h-7" />
                      </div>

                      {/* Tasks in sub-workstream */}
                      {subTasks.map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          workstream={subWs}
                          indent={2}
                          getTaskPosition={getTaskPosition}
                          criticalPath={criticalPath}
                          showUncertainty={showUncertainty}
                          onClick={() => {
                            setSelectedTask(task);
                            setEditTaskModalOpen(true);
                          }}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Milestones Row */}
            {showMilestones && milestones.length > 0 && (
              <div className="border-t-2 border-gray-300">
                <div className="flex border-b border-gray-200 bg-purple-50">
                  <div className="w-64 flex-shrink-0 p-2 border-r border-gray-200">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-purple-600 rotate-45" />
                      <span className="text-sm font-semibold text-purple-700">
                        Milestones
                      </span>
                      <span className="text-xs text-purple-500">
                        ({milestones.length})
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 relative h-12">
                    {milestones.map((milestone) => {
                      const milestoneDate = new Date(milestone.target_date);
                      const offset = (milestoneDate.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24);
                      const left = (offset / daysBetween) * 100;

                      if (left < 0 || left > 100) return null;

                      const isCompleted = milestone.status === 'completed';
                      const isMissed = milestone.status === 'missed';

                      return (
                        <div
                          key={milestone.id}
                          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group cursor-pointer"
                          style={{ left: `${left}%` }}
                          title={`${milestone.title} - ${formatDate(milestone.target_date, { month: 'short', day: 'numeric' })}`}
                          onClick={() => {
                            if (canEdit) {
                              setSelectedMilestone(milestone);
                              setMilestoneModalOpen(true);
                            }
                          }}
                        >
                          <div
                            className={cn(
                              'w-4 h-4 rotate-45 border-2 transition-transform hover:scale-125',
                              isCompleted
                                ? 'bg-green-500 border-green-600'
                                : isMissed
                                ? 'bg-red-500 border-red-600'
                                : 'bg-purple-500 border-purple-600'
                            )}
                          />
                          {/* Tooltip */}
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                            {milestone.title}
                            {milestone.workstream && (
                              <span className="text-gray-400"> ({milestone.workstream.name})</span>
                            )}
                            {canEdit && <span className="text-blue-400 block text-center mt-1">Click to edit</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </Card>
        ) : (
          // Resource View
          <Card padding="none" className="overflow-hidden">
            <div className="divide-y divide-gray-200">
              {users
                .filter(u => tasks.some(t => t.assigned_to === u.id))
                .map((user) => {
                  const userTasks = tasks.filter(t => t.assigned_to === user.id);
                  return (
                    <div key={user.id} className="p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <Avatar src={user.avatar_url} name={user.full_name} size="sm" />
                        <div>
                          <p className="font-medium text-gray-900">{user.full_name}</p>
                          <p className="text-sm text-gray-500">{userTasks.length} tasks assigned</p>
                        </div>
                      </div>
                      <div className="space-y-2 pl-11">
                        {userTasks.map(task => (
                          <div
                            key={task.id}
                            className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-sm"
                          >
                            <div className="flex items-center gap-2">
                              {task.workstream && (
                                <div
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: task.workstream.color }}
                                />
                              )}
                              <span>{task.title}</span>
                            </div>
                            <div className="text-gray-500">
                              {formatDate(task.start_date, { month: 'short', day: 'numeric' })} -{' '}
                              {formatDate(task.end_date, { month: 'short', day: 'numeric' })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          </Card>
        )}
      </div>

      {/* Add Task Modal */}
      <TaskModal
        open={addTaskModalOpen}
        onClose={() => setAddTaskModalOpen(false)}
        onSave={handleAddTask}
        workstreams={workstreams}
        users={users}
        allTasks={tasks}
      />

      {/* Edit Task Modal */}
      {selectedTask && (
        <TaskModal
          open={editTaskModalOpen}
          onClose={() => {
            setEditTaskModalOpen(false);
            setSelectedTask(null);
          }}
          onSave={(data) => handleUpdateTask(selectedTask.id, data)}
          onDelete={() => handleDeleteTask(selectedTask.id)}
          task={selectedTask}
          workstreams={workstreams}
          users={users}
          allTasks={tasks}
          onDependencyAdd={handleAddDependency}
          onDependencyRemove={handleRemoveDependency}
        />
      )}

      {/* Milestone Modal */}
      <MilestoneModal
        open={milestoneModalOpen}
        onClose={() => {
          setMilestoneModalOpen(false);
          setSelectedMilestone(null);
        }}
        onSave={(data) => {
          if (selectedMilestone) {
            handleUpdateMilestone(selectedMilestone.id, data);
          } else {
            handleAddMilestone(data);
          }
        }}
        onDelete={selectedMilestone ? () => handleDeleteMilestone(selectedMilestone.id) : undefined}
        milestone={selectedMilestone}
        workstreams={workstreams}
      />
    </div>
  );
}

function TaskModal({
  open,
  onClose,
  onSave,
  onDelete,
  task,
  workstreams,
  users,
  allTasks,
  onDependencyAdd,
  onDependencyRemove,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<GanttTask>) => void;
  onDelete?: () => void;
  task?: GanttTaskWithRelations;
  workstreams: Workstream[];
  users: User[];
  allTasks?: GanttTaskWithRelations[];
  onDependencyAdd?: (taskId: string, dependsOnId: string, type: GanttDependency['dependency_type']) => void;
  onDependencyRemove?: (dependencyId: string) => void;
}) {
  const [formData, setFormData] = useState({
    title: task?.title || '',
    workstream_id: task?.workstream_id || '',
    start_date: task?.start_date ? new Date(task.start_date).toISOString().slice(0, 16) : '',
    end_date: task?.end_date ? new Date(task.end_date).toISOString().slice(0, 16) : '',
    assigned_to: task?.assigned_to || '',
    progress: task?.progress || 0,
    optimistic_duration: task?.optimistic_duration || '',
    pessimistic_duration: task?.pessimistic_duration || '',
    most_likely_duration: task?.most_likely_duration || '',
  });

  const [newDependencyTask, setNewDependencyTask] = useState('');
  const [newDependencyType, setNewDependencyType] = useState<GanttDependency['dependency_type']>('finish_to_start');

  // Get tasks that are not this task and not already dependencies
  const availableDependencies = useMemo(() => {
    if (!task || !allTasks) return [];
    const existingDeps = (task.dependencies || []).map(d => d.depends_on_id);
    return allTasks.filter(t =>
      t.id !== task.id &&
      !existingDeps.includes(t.id)
    );
  }, [task, allTasks]);

  useEffect(() => {
    if (task) {
      setFormData({
        title: task.title,
        workstream_id: task.workstream_id || '',
        start_date: new Date(task.start_date).toISOString().slice(0, 16),
        end_date: new Date(task.end_date).toISOString().slice(0, 16),
        assigned_to: task.assigned_to || '',
        progress: task.progress,
        optimistic_duration: task.optimistic_duration || '',
        pessimistic_duration: task.pessimistic_duration || '',
        most_likely_duration: task.most_likely_duration || '',
      });
      setNewDependencyTask('');
      setNewDependencyType('finish_to_start');
    }
  }, [task]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      title: formData.title,
      workstream_id: formData.workstream_id || undefined,
      start_date: formData.start_date,
      end_date: formData.end_date,
      assigned_to: formData.assigned_to || undefined,
      progress: Number(formData.progress),
      optimistic_duration: formData.optimistic_duration ? Number(formData.optimistic_duration) : undefined,
      pessimistic_duration: formData.pessimistic_duration ? Number(formData.pessimistic_duration) : undefined,
      most_likely_duration: formData.most_likely_duration ? Number(formData.most_likely_duration) : undefined,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={task ? 'Edit Task' : 'Add Task'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Task Title"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          required
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Start Date"
            type="datetime-local"
            value={formData.start_date}
            onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
            required
          />
          <Input
            label="End Date"
            type="datetime-local"
            value={formData.end_date}
            onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Workstream"
            options={[
              { value: '', label: 'None' },
              ...workstreams.map(w => ({ value: w.id, label: w.name })),
            ]}
            value={formData.workstream_id}
            onChange={(value) => setFormData({ ...formData, workstream_id: value })}
          />
          <Select
            label="Assigned To"
            options={[
              { value: '', label: 'Unassigned' },
              ...users.map(u => ({ value: u.id, label: u.full_name })),
            ]}
            value={formData.assigned_to}
            onChange={(value) => setFormData({ ...formData, assigned_to: value })}
          />
        </div>

        {task && (
          <Input
            label="Progress (%)"
            type="number"
            min="0"
            max="100"
            value={formData.progress}
            onChange={(e) => setFormData({ ...formData, progress: Number(e.target.value) })}
          />
        )}

        <div className="border-t border-gray-200 pt-4">
          <p className="text-sm font-medium text-gray-700 mb-2">Duration Uncertainty (PERT)</p>
          <div className="grid grid-cols-3 gap-4">
            <Input
              label="Optimistic (days)"
              type="number"
              value={formData.optimistic_duration}
              onChange={(e) => setFormData({ ...formData, optimistic_duration: e.target.value })}
              placeholder="Best case"
            />
            <Input
              label="Most Likely (days)"
              type="number"
              value={formData.most_likely_duration}
              onChange={(e) => setFormData({ ...formData, most_likely_duration: e.target.value })}
              placeholder="Expected"
            />
            <Input
              label="Pessimistic (days)"
              type="number"
              value={formData.pessimistic_duration}
              onChange={(e) => setFormData({ ...formData, pessimistic_duration: e.target.value })}
              placeholder="Worst case"
            />
          </div>
        </div>

        {/* Dependencies Section - only for editing existing tasks */}
        {task && onDependencyAdd && onDependencyRemove && (
          <div className="border-t border-gray-200 pt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">
              <LinkIcon className="w-4 h-4 inline mr-1" />
              Dependencies (This task depends on...)
            </p>

            {/* Current dependencies */}
            {task.dependencies && task.dependencies.length > 0 && (
              <div className="space-y-2 mb-4">
                {task.dependencies.map((dep) => {
                  const dependsOnTask = allTasks?.find(t => t.id === dep.depends_on_id);
                  return (
                    <div
                      key={dep.id}
                      className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <LinkIcon className="w-4 h-4 text-blue-500" />
                        <span className="font-medium">{dependsOnTask?.title || 'Unknown task'}</span>
                        <span className="text-gray-500 text-xs">
                          ({dep.dependency_type.replace(/_/g, ' ')})
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onDependencyRemove(dep.id)}
                      >
                        <TrashIcon className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add new dependency */}
            {availableDependencies.length > 0 && (
              <div className="flex gap-2">
                <Select
                  label=""
                  className="flex-1"
                  options={[
                    { value: '', label: 'Select task...' },
                    ...availableDependencies.map(t => ({ value: t.id, label: t.title })),
                  ]}
                  value={newDependencyTask}
                  onChange={(value) => setNewDependencyTask(value)}
                />
                <Select
                  label=""
                  className="w-48"
                  options={[
                    { value: 'finish_to_start', label: 'Finish to Start' },
                    { value: 'start_to_start', label: 'Start to Start' },
                    { value: 'finish_to_finish', label: 'Finish to Finish' },
                    { value: 'start_to_finish', label: 'Start to Finish' },
                  ]}
                  value={newDependencyType}
                  onChange={(value) => setNewDependencyType(value as GanttDependency['dependency_type'])}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (newDependencyTask && task) {
                      onDependencyAdd(task.id, newDependencyTask, newDependencyType);
                      setNewDependencyTask('');
                    }
                  }}
                  disabled={!newDependencyTask}
                >
                  <PlusIcon className="w-4 h-4" />
                </Button>
              </div>
            )}

            {availableDependencies.length === 0 && (!task.dependencies || task.dependencies.length === 0) && (
              <p className="text-sm text-gray-500 italic">No dependencies configured</p>
            )}
          </div>
        )}

        <div className="flex justify-between pt-4">
          {onDelete ? (
            <Button type="button" variant="danger" onClick={onDelete}>
              Delete
            </Button>
          ) : (
            <div />
          )}
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              {task ? 'Save Changes' : 'Add Task'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// TaskRow component for rendering individual task rows
function TaskRow({
  task,
  workstream,
  indent,
  getTaskPosition,
  criticalPath,
  showUncertainty,
  onClick,
}: {
  task: GanttTaskWithRelations;
  workstream: Workstream | null;
  indent: number;
  getTaskPosition: (task: GanttTaskWithRelations) => { left: string; width: string };
  criticalPath: string[];
  showUncertainty: boolean;
  onClick: () => void;
}) {
  const position = getTaskPosition(task);
  const isCritical = criticalPath.includes(task.id);
  const pert = task.optimistic_duration && task.pessimistic_duration && task.most_likely_duration
    ? calculatePERT(task.optimistic_duration, task.pessimistic_duration, task.most_likely_duration)
    : null;

  const paddingLeft = indent === 1 ? 'pl-6' : indent === 2 ? 'pl-10' : 'pl-3';

  return (
    <div
      className="flex border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
      onClick={onClick}
    >
      {/* Task name */}
      <div className={cn("w-64 flex-shrink-0 p-3 border-r border-gray-200", paddingLeft)}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 truncate">
            {task.title}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          {task.assignee && (
            <Avatar
              src={task.assignee.avatar_url}
              name={task.assignee.full_name}
              size="xs"
            />
          )}
          <span className="text-xs text-gray-500">{task.progress}%</span>
        </div>
      </div>

      {/* Task bar */}
      <div className="flex-1 relative h-16 py-2">
        {/* Uncertainty range */}
        {showUncertainty && pert && (
          <div
            className="absolute h-3 bg-yellow-100 rounded-sm top-1/2 -translate-y-1/2"
            style={{
              left: position.left,
              width: `${parseFloat(position.width) * 1.5}%`,
              opacity: 0.5,
            }}
          />
        )}

        {/* Main bar */}
        <div
          className={cn(
            'absolute h-8 rounded gantt-task top-1/2 -translate-y-1/2',
            isCritical ? 'gantt-critical' : ''
          )}
          style={{
            left: position.left,
            width: position.width,
            backgroundColor: workstream?.color || '#6b7280',
          }}
        >
          {/* Progress */}
          <div
            className="h-full rounded opacity-30 bg-black"
            style={{ width: `${task.progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function MilestoneModal({
  open,
  onClose,
  onSave,
  onDelete,
  milestone,
  workstreams,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<Milestone>) => void;
  onDelete?: () => void;
  milestone?: MilestoneWithRelations | null;
  workstreams: Workstream[];
}) {
  const [formData, setFormData] = useState({
    title: milestone?.title || '',
    description: milestone?.description || '',
    workstream_id: milestone?.workstream_id || '',
    target_date: milestone?.target_date ? new Date(milestone.target_date).toISOString().slice(0, 10) : '',
    status: milestone?.status || 'pending',
  });

  useEffect(() => {
    if (milestone) {
      setFormData({
        title: milestone.title,
        description: milestone.description || '',
        workstream_id: milestone.workstream_id || '',
        target_date: new Date(milestone.target_date).toISOString().slice(0, 10),
        status: milestone.status,
      });
    } else {
      setFormData({
        title: '',
        description: '',
        workstream_id: '',
        target_date: '',
        status: 'pending',
      });
    }
  }, [milestone]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      title: formData.title,
      description: formData.description || undefined,
      workstream_id: formData.workstream_id || undefined,
      target_date: formData.target_date,
      status: formData.status as Milestone['status'],
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={milestone ? 'Edit Milestone' : 'Add Milestone'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Milestone Title"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          placeholder="e.g., Phase 1 Complete, Design Review"
          required
        />

        <Textarea
          label="Description (Optional)"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Brief description of this milestone"
          rows={2}
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Target Date"
            type="date"
            value={formData.target_date}
            onChange={(e) => setFormData({ ...formData, target_date: e.target.value })}
            required
          />
          <Select
            label="Workstream"
            options={[
              { value: '', label: 'None' },
              ...workstreams.map(w => ({ value: w.id, label: w.name })),
            ]}
            value={formData.workstream_id}
            onChange={(value) => setFormData({ ...formData, workstream_id: value })}
          />
        </div>

        {milestone && (
          <Select
            label="Status"
            options={[
              { value: 'pending', label: 'Pending' },
              { value: 'completed', label: 'Completed' },
              { value: 'missed', label: 'Missed' },
            ]}
            value={formData.status}
            onChange={(value) => setFormData({ ...formData, status: value })}
          />
        )}

        <div className="flex justify-between pt-4">
          {onDelete ? (
            <Button type="button" variant="danger" onClick={onDelete}>
              Delete
            </Button>
          ) : (
            <div />
          )}
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              {milestone ? 'Save Changes' : 'Add Milestone'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
