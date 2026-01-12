'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
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
  ChatBubbleLeftIcon,
  DocumentArrowDownIcon,
} from '@heroicons/react/24/outline';
import type { GanttTask, GanttDependency, GanttTaskComment, Workstream, User, Milestone } from '@/types/database';

type GanttTaskWithRelations = GanttTask & {
  workstream?: Workstream;
  assignee?: User;
  dependencies?: GanttDependency[];
};

type MilestoneWithRelations = Milestone & {
  workstream?: Workstream;
};

export default function GanttPage() {
  console.log('[GanttPage] Rendering start');
  const { workstreams, user } = useAppStore();
  console.log('[GanttPage] workstreams:', workstreams?.length);
  const { canEdit } = usePermission();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<GanttTaskWithRelations[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const [viewMode, setViewMode] = useState<'gantt' | 'resource'>('gantt');
  const [zoomLevel, setZoomLevel] = useState<'day' | 'week' | 'month'>('day');
  const [showCriticalPath, setShowCriticalPath] = useState(true);
  const [showUncertainty, setShowUncertainty] = useState(false);
  const [showDependencies, setShowDependencies] = useState(true);
  const [showMilestones, setShowMilestones] = useState(true);
  const [allDependencies, setAllDependencies] = useState<GanttDependency[]>([]);
  const [milestones, setMilestones] = useState<MilestoneWithRelations[]>([]);
  const [collapsedWorkstreams, setCollapsedWorkstreams] = useState<Set<string>>(new Set());

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

        // Create clean data objects without potential circular references
        const cleanTasks = (tasksData || []).map(task => ({
          id: task.id,
          title: task.title,
          start_date: task.start_date,
          end_date: task.end_date,
          progress: task.progress,
          workstream_id: task.workstream_id,
          assigned_to: task.assigned_to,
          order_index: task.order_index,
          optimistic_duration: task.optimistic_duration,
          pessimistic_duration: task.pessimistic_duration,
          most_likely_duration: task.most_likely_duration,
          created_at: task.created_at,
          updated_at: task.updated_at,
          created_by: task.created_by,
          // Extract only needed fields from relations to avoid circular refs
          workstream: task.workstream ? {
            id: task.workstream.id,
            name: task.workstream.name,
            color: task.workstream.color,
          } : undefined,
          assignee: task.assignee ? {
            id: task.assignee.id,
            full_name: task.assignee.full_name,
            avatar_url: task.assignee.avatar_url,
          } : undefined,
          dependencies: (depsData || []).filter(d => d.task_id === task.id).map(d => ({
            id: d.id,
            task_id: d.task_id,
            depends_on_id: d.depends_on_id,
            dependency_type: d.dependency_type,
            lag_days: d.lag_days || 0,
            created_at: d.created_at,
          })),
        }));

        setTasks(cleanTasks as unknown as GanttTaskWithRelations[]);
        setAllDependencies((depsData || []).map(d => ({
          id: d.id,
          task_id: d.task_id,
          depends_on_id: d.depends_on_id,
          dependency_type: d.dependency_type,
          lag_days: d.lag_days || 0,
          created_at: d.created_at,
        })) as GanttDependency[]);

        // Calculate date range from tasks
        if (cleanTasks.length > 0) {
          const allDates = cleanTasks.flatMap(t => [new Date(t.start_date), new Date(t.end_date)]);
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
    console.log('[GanttPage] criticalPath useMemo - tasks:', tasks.length);
    if (!showCriticalPath || tasks.length === 0) return [];
    return calculateCriticalPath(tasks);
  }, [tasks, showCriticalPath]);

  // Group tasks by workstream with hierarchy support
  const tasksByWorkstream = useMemo(() => {
    console.log('[GanttPage] tasksByWorkstream useMemo start');
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

    console.log('[GanttPage] tasksByWorkstream useMemo end - groups:', result.length);
    return result;
  }, [tasks, workstreams]);

  console.log('[GanttPage] Before daysBetween calc');
  const daysBetween = Math.ceil(
    (dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24)
  );
  console.log('[GanttPage] daysBetween:', daysBetween);

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

  // Calculate today line position
  const todayPosition = useMemo(() => {
    try {
      // Get current date components in UK timezone using Intl API
      const now = new Date();
      const ukFormatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/London',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      const parts = ukFormatter.formatToParts(now);
      const getPart = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0', 10);

      const year = getPart('year');
      const month = getPart('month');
      const day = getPart('day');
      const hours = getPart('hour');
      const minutes = getPart('minute');

      // Calculate fractional hours through the day (0-24)
      const fractionalHours = hours + minutes / 60;
      const dayFraction = fractionalHours / 24;

      // Get the start of today in local time (for comparison with dateRange)
      const todayStart = new Date(year, month - 1, day, 0, 0, 0, 0);
      const startDate = new Date(dateRange.start);
      startDate.setHours(0, 0, 0, 0);

      // Calculate days from start, adding the fractional day for current time
      const daysDiff = Math.floor((todayStart.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const offset = daysDiff + dayFraction;
      const percentage = (offset / daysBetween) * 100;
      return percentage >= 0 && percentage <= 100 ? percentage : null;
    } catch {
      // Fallback to simple calculation if Intl API fails
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startDate = new Date(dateRange.start);
      startDate.setHours(0, 0, 0, 0);
      const offset = (today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      const percentage = (offset / daysBetween) * 100;
      return percentage >= 0 && percentage <= 100 ? percentage : null;
    }
  }, [dateRange.start, daysBetween]);

  // Calculate zoom-based intervals for date header
  const zoomConfig = useMemo(() => {
    switch (zoomLevel) {
      case 'week':
        return {
          interval: 7,
          cellCount: Math.ceil(daysBetween / 7),
          format: (d: Date) => {
            const weekNum = Math.ceil((d.getDate() + new Date(d.getFullYear(), d.getMonth(), 1).getDay()) / 7);
            return `W${weekNum} ${d.toLocaleDateString('en-US', { month: 'short' })}`;
          }
        };
      case 'month':
        return {
          interval: 30,
          cellCount: Math.ceil(daysBetween / 30),
          format: (d: Date) => d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
        };
      default:
        return {
          interval: 1,
          cellCount: Math.min(daysBetween, 60),
          format: (d: Date) => d.getDate() === 1 ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : String(d.getDate())
        };
    }
  }, [zoomLevel, daysBetween]);

  // Build task row index map for dependency line calculations
  const taskRowIndexMap = useMemo(() => {
    console.log('[GanttPage] taskRowIndexMap useMemo start');
    const map = new Map<string, number>();
    let rowIndex = 0;

    tasksByWorkstream.forEach(({ workstream, tasks: wsTasks, children }) => {
      rowIndex++; // Workstream header
      const wsId = workstream?.id || 'unassigned';
      const isCollapsed = collapsedWorkstreams.has(wsId);

      if (!isCollapsed) {
        wsTasks.forEach((task) => {
          map.set(task.id, rowIndex);
          rowIndex++;
        });

        children?.forEach(({ workstream: subWs, tasks: subTasks }) => {
          rowIndex++; // Sub-workstream header
          subTasks.forEach((task) => {
            map.set(task.id, rowIndex);
            rowIndex++;
          });
        });
      }
    });

    console.log('[GanttPage] taskRowIndexMap useMemo end - size:', map.size);
    return map;
  }, [tasksByWorkstream, collapsedWorkstreams]);

  console.log('[GanttPage] After all useMemo hooks');

  // Toggle workstream collapse
  const toggleWorkstreamCollapse = (workstreamId: string) => {
    setCollapsedWorkstreams(prev => {
      const newSet = new Set(prev);
      if (newSet.has(workstreamId)) {
        newSet.delete(workstreamId);
      } else {
        newSet.add(workstreamId);
      }
      return newSet;
    });
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
      // If dates changed, cascade to dependent tasks
      if (updates.end_date || updates.start_date) {
        const newEndDate = updates.end_date ? new Date(updates.end_date) : undefined;
        const newStartDate = updates.start_date ? new Date(updates.start_date) : undefined;
        if (newEndDate) {
          await cascadeDependencyUpdates(taskId, newEndDate, newStartDate);
        }
      }
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

  // Check for circular dependencies before adding a new one
  const wouldCreateCircularDependency = (taskId: string, dependsOnId: string): boolean => {
    // Check if adding this dependency would create a cycle
    // We traverse from dependsOnId's dependencies to see if we can reach taskId
    const visited = new Set<string>();
    const stack = [dependsOnId];

    while (stack.length > 0) {
      const currentId = stack.pop()!;
      if (currentId === taskId) {
        return true; // Circular dependency detected
      }

      if (visited.has(currentId)) continue;
      visited.add(currentId);

      // Find all tasks that currentId depends on
      const currentTaskDeps = allDependencies.filter(d => d.task_id === currentId);
      for (const dep of currentTaskDeps) {
        stack.push(dep.depends_on_id);
      }
    }

    return false;
  };

  const handleAddDependency = async (taskId: string, dependsOnId: string, dependencyType: GanttDependency['dependency_type'], lagDays: number = 0) => {
    const supabase = createClient();

    // Prevent self-dependency
    if (taskId === dependsOnId) {
      toast.error('A task cannot depend on itself');
      return;
    }

    // Check for circular dependencies
    if (wouldCreateCircularDependency(taskId, dependsOnId)) {
      toast.error('Cannot add this dependency - it would create a circular dependency chain');
      return;
    }

    // Check if dependency already exists
    const existingDep = allDependencies.find(
      d => d.task_id === taskId && d.depends_on_id === dependsOnId
    );
    if (existingDep) {
      toast.error('This dependency already exists');
      return;
    }

    // Get the predecessor task and the dependent task
    const predecessorTask = tasks.find(t => t.id === dependsOnId);
    const dependentTask = tasks.find(t => t.id === taskId);

    if (!predecessorTask || !dependentTask) {
      toast.error('Task not found');
      return;
    }

    // Calculate required start date based on dependency type and lag/lead time
    // Positive lag = delay (gap between tasks), Negative lag = lead (overlap)
    const lagMs = lagDays * 24 * 60 * 60 * 1000;
    let requiredStartDate: Date | null = null;
    const predecessorStart = new Date(predecessorTask.start_date);
    const predecessorEnd = new Date(predecessorTask.end_date);
    const dependentStart = new Date(dependentTask.start_date);
    const dependentEnd = new Date(dependentTask.end_date);
    const dependentDuration = dependentEnd.getTime() - dependentStart.getTime();

    switch (dependencyType) {
      case 'finish_to_start':
        // Dependent task starts after predecessor finishes + lag
        const fsRequiredStart = new Date(predecessorEnd.getTime() + lagMs);
        if (dependentStart < fsRequiredStart) {
          requiredStartDate = fsRequiredStart;
        }
        break;
      case 'start_to_start':
        // Both tasks start at the same time + lag
        const ssRequiredStart = new Date(predecessorStart.getTime() + lagMs);
        if (dependentStart < ssRequiredStart) {
          requiredStartDate = ssRequiredStart;
        }
        break;
      case 'finish_to_finish':
        // Both tasks finish at the same time + lag - adjust start based on duration
        const requiredEnd = new Date(predecessorEnd.getTime() + lagMs);
        const calculatedStart = new Date(requiredEnd.getTime() - dependentDuration);
        if (dependentEnd < requiredEnd) {
          requiredStartDate = calculatedStart;
        }
        break;
      case 'start_to_finish':
        // Dependent finishes when predecessor starts + lag
        const sfRequiredEnd = new Date(predecessorStart.getTime() + lagMs);
        if (dependentEnd < sfRequiredEnd) {
          requiredStartDate = new Date(sfRequiredEnd.getTime() - dependentDuration);
        }
        break;
    }

    // Insert the dependency with lag
    const { error: depError } = await supabase
      .from('gantt_dependencies')
      .insert({
        task_id: taskId,
        depends_on_id: dependsOnId,
        dependency_type: dependencyType,
        lag_days: lagDays,
      });

    if (depError) {
      toast.error('Failed to add dependency');
      return;
    }

    // If we need to adjust the dependent task's dates
    if (requiredStartDate) {
      const newEndDate = new Date(requiredStartDate.getTime() + dependentDuration);
      const { error: updateError } = await supabase
        .from('gantt_tasks')
        .update({
          start_date: requiredStartDate.toISOString(),
          end_date: newEndDate.toISOString(),
        })
        .eq('id', taskId);

      if (updateError) {
        toast.error('Dependency added but failed to adjust dates');
      } else {
        toast.success('Dependency added and schedule adjusted');
        // Cascade to any tasks that depend on this one
        await cascadeDependencyUpdates(taskId, newEndDate, requiredStartDate);
      }
    } else {
      toast.success('Dependency added');
    }

    // Refresh data and update selectedTask
    await refreshTasksAndUpdateSelected();
  };

  // Cascade date changes to dependent tasks with circular dependency protection
  const cascadeDependencyUpdates = async (
    changedTaskId: string,
    newEndDate: Date,
    newStartDate?: Date,
    visitedTasks: Set<string> = new Set()
  ) => {
    // Prevent infinite loops
    if (visitedTasks.has(changedTaskId)) {
      console.warn('Circular dependency detected during cascade, stopping');
      return;
    }
    visitedTasks.add(changedTaskId);

    const supabase = createClient();

    // Fetch fresh dependencies to avoid stale state
    const { data: freshDeps, error: depsError } = await supabase
      .from('gantt_dependencies')
      .select('*')
      .eq('depends_on_id', changedTaskId);

    if (depsError) {
      console.error('Error fetching dependencies during cascade:', depsError);
      return;
    }

    if (!freshDeps || freshDeps.length === 0) return;

    // Also fetch fresh task data
    const { data: freshTasks, error: tasksError } = await supabase
      .from('gantt_tasks')
      .select('*');

    if (tasksError) {
      console.error('Error fetching tasks during cascade:', tasksError);
      return;
    }

    if (!freshTasks) return;

    for (const dep of freshDeps) {
      const dependentTask = freshTasks.find(t => t.id === dep.task_id);
      if (!dependentTask) continue;

      const dependentStart = new Date(dependentTask.start_date);
      const dependentEnd = new Date(dependentTask.end_date);
      const duration = dependentEnd.getTime() - dependentStart.getTime();

      // Validate duration
      if (duration < 0) {
        console.warn(`Invalid task duration for task ${dep.task_id}`);
        continue;
      }

      // Include lag time in calculations (positive = delay, negative = lead/overlap)
      const lagMs = (dep.lag_days || 0) * 24 * 60 * 60 * 1000;
      let requiredStart: Date | null = null;

      switch (dep.dependency_type) {
        case 'finish_to_start':
          // Dependent starts after predecessor finishes + lag
          const fsRequired = new Date(newEndDate.getTime() + lagMs);
          if (dependentStart.getTime() < fsRequired.getTime()) {
            requiredStart = fsRequired;
          }
          break;
        case 'start_to_start':
          // Both start at same time + lag
          if (newStartDate) {
            const ssRequired = new Date(newStartDate.getTime() + lagMs);
            if (dependentStart.getTime() < ssRequired.getTime()) {
              requiredStart = ssRequired;
            }
          }
          break;
        case 'finish_to_finish':
          // Both finish at same time + lag - adjust start to maintain duration
          const ffRequired = new Date(newEndDate.getTime() + lagMs);
          const calculatedStart = new Date(ffRequired.getTime() - duration);
          if (dependentEnd.getTime() < ffRequired.getTime()) {
            requiredStart = calculatedStart;
          }
          break;
        case 'start_to_finish':
          // Dependent finishes when predecessor starts + lag
          if (newStartDate) {
            const sfRequired = new Date(newStartDate.getTime() + lagMs);
            if (dependentEnd.getTime() < sfRequired.getTime()) {
              requiredStart = new Date(sfRequired.getTime() - duration);
            }
          }
          break;
      }

      if (requiredStart) {
        const newDepEnd = new Date(requiredStart.getTime() + duration);

        // Validate dates before updating
        if (isNaN(requiredStart.getTime()) || isNaN(newDepEnd.getTime())) {
          console.error('Invalid dates calculated for task:', dep.task_id);
          continue;
        }

        const { error: updateError } = await supabase
          .from('gantt_tasks')
          .update({
            start_date: requiredStart.toISOString(),
            end_date: newDepEnd.toISOString(),
          })
          .eq('id', dep.task_id);

        if (updateError) {
          console.error(`Failed to update task ${dep.task_id}:`, updateError);
          continue;
        }

        // Recursively cascade with both start and end dates
        await cascadeDependencyUpdates(dep.task_id, newDepEnd, requiredStart, visitedTasks);
      }
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
      // Refresh data and update selectedTask
      await refreshTasksAndUpdateSelected();
    }
  };

  // Helper to refresh tasks and update selectedTask with fresh data
  const refreshTasksAndUpdateSelected = async () => {
    try {
      const supabase = createClient();

      const { data: tasksData } = await supabase
        .from('gantt_tasks')
        .select(`
          *,
          workstream:workstreams(id, name, color),
          assignee:users!gantt_tasks_assigned_to_fkey(id, full_name, avatar_url)
        `)
        .order('order_index');

      const { data: depsData } = await supabase
        .from('gantt_dependencies')
        .select('*');

      // Create clean data objects without potential circular references
      const cleanTasks = (tasksData || []).map(task => ({
        id: task.id,
        title: task.title,
        start_date: task.start_date,
        end_date: task.end_date,
        progress: task.progress,
        workstream_id: task.workstream_id,
        assigned_to: task.assigned_to,
        order_index: task.order_index,
        optimistic_duration: task.optimistic_duration,
        pessimistic_duration: task.pessimistic_duration,
        most_likely_duration: task.most_likely_duration,
        created_at: task.created_at,
        updated_at: task.updated_at,
        created_by: task.created_by,
        workstream: task.workstream ? {
          id: task.workstream.id,
          name: task.workstream.name,
          color: task.workstream.color,
        } : undefined,
        assignee: task.assignee ? {
          id: task.assignee.id,
          full_name: task.assignee.full_name,
          avatar_url: task.assignee.avatar_url,
        } : undefined,
        dependencies: (depsData || []).filter(d => d.task_id === task.id).map(d => ({
          id: d.id,
          task_id: d.task_id,
          depends_on_id: d.depends_on_id,
          dependency_type: d.dependency_type,
          lag_days: d.lag_days || 0,
          created_at: d.created_at,
        })),
      }));

      setTasks(cleanTasks as unknown as GanttTaskWithRelations[]);
      setAllDependencies((depsData || []).map(d => ({
        id: d.id,
        task_id: d.task_id,
        depends_on_id: d.depends_on_id,
        dependency_type: d.dependency_type,
        lag_days: d.lag_days || 0,
        created_at: d.created_at,
      })) as GanttDependency[]);

      // Update selectedTask with fresh data if it's set
      if (selectedTask) {
        const freshTask = cleanTasks.find(t => t.id === selectedTask.id);
        if (freshTask) {
          setSelectedTask(freshTask as unknown as GanttTaskWithRelations);
        }
      }
    } catch (error) {
      console.error('Error refreshing tasks:', error);
    }
  };

  const handleUpdateDependency = async (dependencyId: string, newType: GanttDependency['dependency_type'], lagDays?: number) => {
    const supabase = createClient();

    // Get the dependency to find the related tasks
    const dep = allDependencies.find(d => d.id === dependencyId);
    if (!dep) {
      toast.error('Dependency not found');
      return;
    }

    const predecessorTask = tasks.find(t => t.id === dep.depends_on_id);
    const dependentTask = tasks.find(t => t.id === dep.task_id);

    if (!predecessorTask || !dependentTask) {
      toast.error('Related tasks not found');
      return;
    }

    // Update the dependency type and lag
    const updateData: { dependency_type: string; lag_days?: number } = { dependency_type: newType };
    if (lagDays !== undefined) {
      updateData.lag_days = lagDays;
    }

    const { error } = await supabase
      .from('gantt_dependencies')
      .update(updateData)
      .eq('id', dependencyId);

    if (error) {
      toast.error('Failed to update dependency');
      return;
    }

    // Recalculate dates based on new dependency type and lag
    const effectiveLag = lagDays !== undefined ? lagDays : (dep.lag_days || 0);
    const lagMs = effectiveLag * 24 * 60 * 60 * 1000;
    let requiredStartDate: Date | null = null;
    const predecessorStart = new Date(predecessorTask.start_date);
    const predecessorEnd = new Date(predecessorTask.end_date);
    const dependentStart = new Date(dependentTask.start_date);
    const dependentEnd = new Date(dependentTask.end_date);
    const dependentDuration = dependentEnd.getTime() - dependentStart.getTime();

    switch (newType) {
      case 'finish_to_start':
        const fsRequired = new Date(predecessorEnd.getTime() + lagMs);
        if (dependentStart < fsRequired) {
          requiredStartDate = fsRequired;
        }
        break;
      case 'start_to_start':
        const ssRequired = new Date(predecessorStart.getTime() + lagMs);
        if (dependentStart < ssRequired) {
          requiredStartDate = ssRequired;
        }
        break;
      case 'finish_to_finish':
        const ffRequired = new Date(predecessorEnd.getTime() + lagMs);
        const calculatedStart = new Date(ffRequired.getTime() - dependentDuration);
        if (dependentEnd < ffRequired) {
          requiredStartDate = calculatedStart;
        }
        break;
      case 'start_to_finish':
        const sfRequired = new Date(predecessorStart.getTime() + lagMs);
        if (dependentEnd < sfRequired) {
          requiredStartDate = new Date(sfRequired.getTime() - dependentDuration);
        }
        break;
    }

    // Adjust dates if needed
    if (requiredStartDate) {
      const newEndDate = new Date(requiredStartDate.getTime() + dependentDuration);
      await supabase
        .from('gantt_tasks')
        .update({
          start_date: requiredStartDate.toISOString(),
          end_date: newEndDate.toISOString(),
        })
        .eq('id', dep.task_id);

      await cascadeDependencyUpdates(dep.task_id, newEndDate, requiredStartDate);
      toast.success('Dependency updated and schedule adjusted');
    } else {
      toast.success('Dependency updated');
    }

    // Refresh data and update selectedTask
    await refreshTasksAndUpdateSelected();
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

  // Handle drag-to-reschedule task
  const handleDragTask = async (taskId: string, newStartDate: Date, newEndDate: Date) => {
    const supabase = createClient();

    const { error } = await supabase
      .from('gantt_tasks')
      .update({
        start_date: newStartDate.toISOString(),
        end_date: newEndDate.toISOString(),
      })
      .eq('id', taskId);

    if (error) {
      toast.error('Failed to reschedule task');
    } else {
      toast.success('Task rescheduled');
      // Cascade to dependent tasks
      await cascadeDependencyUpdates(taskId, newEndDate, newStartDate);
      fetchTasks();
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      'Title',
      'Start Date',
      'End Date',
      'Progress',
      'Workstream',
      'Assigned To',
      'Constraint Type',
      'Constraint Date',
      'Parent Task',
    ];

    const rows = tasks.map(task => {
      const parentTask = task.parent_id ? tasks.find(t => t.id === task.parent_id) : null;
      return [
        task.title,
        new Date(task.start_date).toISOString().slice(0, 10),
        new Date(task.end_date).toISOString().slice(0, 10),
        `${task.progress}%`,
        task.workstream?.name || '',
        task.assignee?.full_name || '',
        task.constraint_type || 'none',
        task.constraint_date ? new Date(task.constraint_date).toISOString().slice(0, 10) : '',
        parentTask?.title || '',
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `gantt-export-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Exported to CSV');
  };

  // Generate report summary
  const generateReport = () => {
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.progress === 100).length;
    const criticalTaskCount = criticalPath.length;
    const overdueTasks = tasks.filter(t => {
      const endDate = new Date(t.end_date);
      return endDate < new Date() && t.progress < 100;
    }).length;

    const report = `
GANTT CHART REPORT
Generated: ${new Date().toLocaleString()}
==========================================

SUMMARY
-------
Total Tasks: ${totalTasks}
Completed: ${completedTasks} (${totalTasks > 0 ? Math.round(completedTasks / totalTasks * 100) : 0}%)
In Progress: ${totalTasks - completedTasks}
Critical Path Tasks: ${criticalTaskCount}
Overdue Tasks: ${overdueTasks}

WORKSTREAM BREAKDOWN
--------------------
${workstreams.map(ws => {
  const wsTasks = tasks.filter(t => t.workstream_id === ws.id);
  const wsComplete = wsTasks.filter(t => t.progress === 100).length;
  return `${ws.name}: ${wsTasks.length} tasks (${wsComplete} complete)`;
}).join('\n')}

CRITICAL PATH TASKS
-------------------
${criticalPath.map(taskId => {
  const task = tasks.find(t => t.id === taskId);
  return task ? `- ${task.title} (${new Date(task.start_date).toLocaleDateString()} - ${new Date(task.end_date).toLocaleDateString()})` : '';
}).filter(Boolean).join('\n') || 'No critical path identified'}

OVERDUE TASKS
-------------
${tasks.filter(t => new Date(t.end_date) < new Date() && t.progress < 100).map(t =>
  `- ${t.title}: Due ${new Date(t.end_date).toLocaleDateString()}, ${t.progress}% complete`
).join('\n') || 'No overdue tasks'}
`.trim();

    const blob = new Blob([report], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `gantt-report-${new Date().toISOString().slice(0, 10)}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Report generated');
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

              {/* Zoom Controls */}
              <div className="flex items-center gap-1 border-l border-gray-200 pl-4 ml-2">
                <span className="text-xs text-gray-500 mr-1">Zoom:</span>
                {(['day', 'week', 'month'] as const).map((level) => (
                  <Button
                    key={level}
                    variant={zoomLevel === level ? 'primary' : 'ghost'}
                    size="sm"
                    onClick={() => setZoomLevel(level)}
                    className="px-2 py-1 text-xs"
                  >
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </Button>
                ))}
              </div>

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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const today = new Date();
                    const rangeSize = dateRange.end.getTime() - dateRange.start.getTime();
                    const newStart = new Date(today.getTime() - rangeSize / 4);
                    const newEnd = new Date(newStart.getTime() + rangeSize);
                    setDateRange({ start: newStart, end: newEnd });
                  }}
                  className="text-xs"
                >
                  Today
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

                {/* Export buttons */}
                <div className="border-l border-gray-200 pl-4 ml-2 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportCSV}
                    className="text-xs"
                  >
                    <DocumentArrowDownIcon className="w-4 h-4 mr-1" />
                    Export CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={generateReport}
                    className="text-xs"
                  >
                    <ChartBarIcon className="w-4 h-4 mr-1" />
                    Report
                  </Button>
                </div>
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
                {/* Date headers - adjusted by zoom level */}
                {Array.from({ length: zoomConfig.cellCount }).map((_, i) => {
                  const date = new Date(dateRange.start);
                  date.setDate(date.getDate() + (i * zoomConfig.interval));
                  const cellWidth = (zoomConfig.interval / daysBetween) * 100;
                  const cellLeft = (i * zoomConfig.interval / daysBetween) * 100;

                  return (
                    <div
                      key={i}
                      className="absolute top-0 h-full border-r border-gray-200 text-xs text-gray-500 flex items-center justify-center overflow-hidden"
                      style={{
                        left: `${cellLeft}%`,
                        width: `${cellWidth}%`,
                      }}
                    >
                      {zoomConfig.format(date)}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Tasks grouped by workstream */}
            <div className="relative">
              {/* Today line - positioned in the chart area (after 256px task name column) */}
              {todayPosition !== null && (
                <div
                  className="absolute top-0 bottom-0 z-10 pointer-events-none"
                  style={{ left: '256px', right: 0 }}
                >
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-red-500"
                    style={{ left: `${todayPosition}%` }}
                  >
                    <div className="absolute -top-1 -left-2 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                      <span className="text-[8px] text-white font-bold">T</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Dependency arrows SVG overlay */}
              {showDependencies && allDependencies.length > 0 && (
                <DependencyArrows
                  dependencies={allDependencies}
                  tasks={tasks}
                  taskRowIndexMap={taskRowIndexMap}
                  getTaskPosition={getTaskPosition}
                  daysBetween={daysBetween}
                  dateRange={dateRange}
                />
              )}

              {tasksByWorkstream.map(({ workstream, tasks: wsTasks, children }) => {
                const wsId = workstream?.id || 'unassigned';
                const isCollapsed = collapsedWorkstreams.has(wsId);
                const totalTasks = wsTasks.length + (children?.reduce((acc, c) => acc + c.tasks.length, 0) || 0);

                return (
                <div key={wsId}>
                  {/* Workstream header - clickable to collapse */}
                  <div
                    className="flex border-b border-gray-200 bg-gray-100 cursor-pointer hover:bg-gray-150 select-none"
                    onClick={() => toggleWorkstreamCollapse(wsId)}
                  >
                    <div className="w-64 flex-shrink-0 p-2 border-r border-gray-200">
                      <div className="flex items-center gap-2">
                        <ChevronDownIcon
                          className={cn(
                            'w-4 h-4 text-gray-500 transition-transform',
                            isCollapsed && '-rotate-90'
                          )}
                        />
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: workstream?.color || '#6b7280' }}
                        />
                        <span className="text-sm font-semibold text-gray-700">
                          {workstream?.name || 'Unassigned'}
                        </span>
                        <span className="text-xs text-gray-500">
                          ({totalTasks} task{totalTasks !== 1 ? 's' : ''})
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 h-8 relative">
                      {/* Today indicator in header */}
                      {todayPosition !== null && (
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-red-300"
                          style={{ left: `${todayPosition}%` }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Tasks in this workstream - hide when collapsed */}
                  {!isCollapsed && wsTasks.map((task) => (
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
                      todayPosition={todayPosition}
                      onDrag={handleDragTask}
                      dateRange={dateRange}
                      daysBetween={daysBetween}
                      canEdit={canEdit}
                    />
                  ))}

                  {/* Sub-workstreams - hide when collapsed */}
                  {!isCollapsed && children?.map(({ workstream: subWs, tasks: subTasks }) => (
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
                        <div className="flex-1 h-7 relative">
                          {/* Today indicator */}
                          {todayPosition !== null && (
                            <div
                              className="absolute top-0 bottom-0 w-0.5 bg-red-300"
                              style={{ left: `${todayPosition}%` }}
                            />
                          )}
                        </div>
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
                          todayPosition={todayPosition}
                          onDrag={handleDragTask}
                          dateRange={dateRange}
                          daysBetween={daysBetween}
                          canEdit={canEdit}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              );
              })}
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
        currentUser={user}
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
          onDependencyUpdate={handleUpdateDependency}
          currentUser={user}
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
  onDependencyUpdate,
  currentUser,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<GanttTask>) => void;
  onDelete?: () => void;
  task?: GanttTaskWithRelations;
  workstreams: Workstream[];
  users: User[];
  allTasks?: GanttTaskWithRelations[];
  onDependencyAdd?: (taskId: string, dependsOnId: string, type: GanttDependency['dependency_type'], lagDays?: number) => void;
  onDependencyRemove?: (dependencyId: string) => void;
  onDependencyUpdate?: (dependencyId: string, newType: GanttDependency['dependency_type'], lagDays?: number) => void;
  currentUser?: User | null;
}) {
  const [editingDependency, setEditingDependency] = useState<string | null>(null);
  const [editingLag, setEditingLag] = useState<{ [key: string]: number }>({});
  const [comments, setComments] = useState<GanttTaskComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [formData, setFormData] = useState({
    title: task?.title || '',
    workstream_id: task?.workstream_id || '',
    start_date: task?.start_date ? new Date(task.start_date).toISOString().slice(0, 10) : '',
    end_date: task?.end_date ? new Date(task.end_date).toISOString().slice(0, 10) : '',
    assigned_to: task?.assigned_to || '',
    progress: task?.progress || 0,
    optimistic_duration: task?.optimistic_duration || '',
    pessimistic_duration: task?.pessimistic_duration || '',
    most_likely_duration: task?.most_likely_duration || '',
    constraint_type: task?.constraint_type || 'none',
    constraint_date: task?.constraint_date ? new Date(task.constraint_date).toISOString().slice(0, 10) : '',
    parent_id: task?.parent_id || '',
  });

  const [newDependencyTask, setNewDependencyTask] = useState('');
  const [newDependencyType, setNewDependencyType] = useState<GanttDependency['dependency_type']>('finish_to_start');
  const [newDependencyLag, setNewDependencyLag] = useState<number>(0);

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
        start_date: new Date(task.start_date).toISOString().slice(0, 10),
        end_date: new Date(task.end_date).toISOString().slice(0, 10),
        assigned_to: task.assigned_to || '',
        progress: task.progress,
        optimistic_duration: task.optimistic_duration || '',
        pessimistic_duration: task.pessimistic_duration || '',
        most_likely_duration: task.most_likely_duration || '',
        constraint_type: task.constraint_type || 'none',
        constraint_date: task.constraint_date ? new Date(task.constraint_date).toISOString().slice(0, 10) : '',
        parent_id: task.parent_id || '',
      });
      setNewDependencyTask('');
      setNewDependencyType('finish_to_start');
      setNewDependencyLag(0);
      setEditingLag({});
      setNewComment('');
    }
  }, [task]);

  // Fetch comments when task changes
  useEffect(() => {
    const fetchComments = async () => {
      if (!task?.id) {
        setComments([]);
        return;
      }

      setLoadingComments(true);
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('gantt_task_comments')
          .select(`
            *,
            user:users(id, full_name, avatar_url)
          `)
          .eq('task_id', task.id)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching comments:', error);
        } else {
          setComments(data as GanttTaskComment[]);
        }
      } catch (error) {
        console.error('Error fetching comments:', error);
      } finally {
        setLoadingComments(false);
      }
    };

    if (open && task?.id) {
      fetchComments();
    }
  }, [open, task?.id]);

  const handleAddComment = async () => {
    if (!task?.id || !newComment.trim()) return;

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('gantt_task_comments')
        .insert({
          task_id: task.id,
          content: newComment.trim(),
        })
        .select(`
          *,
          user:users(id, full_name, avatar_url)
        `)
        .single();

      if (error) {
        toast.error('Failed to add comment');
        console.error('Error adding comment:', error);
      } else {
        setComments(prev => [data as GanttTaskComment, ...prev]);
        setNewComment('');
        toast.success('Comment added');
      }
    } catch (error) {
      console.error('Error adding comment:', error);
      toast.error('Failed to add comment');
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('gantt_task_comments')
        .delete()
        .eq('id', commentId);

      if (error) {
        toast.error('Failed to delete comment');
        console.error('Error deleting comment:', error);
      } else {
        setComments(prev => prev.filter(c => c.id !== commentId));
        toast.success('Comment deleted');
      }
    } catch (error) {
      console.error('Error deleting comment:', error);
      toast.error('Failed to delete comment');
    }
  };

  // Get potential parent tasks (exclude current task and its children)
  const availableParentTasks = useMemo(() => {
    if (!allTasks) return [];
    return allTasks.filter(t => t.id !== task?.id && t.parent_id !== task?.id);
  }, [allTasks, task?.id]);

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
      constraint_type: formData.constraint_type as GanttTask['constraint_type'],
      constraint_date: formData.constraint_date || undefined,
      parent_id: formData.parent_id || undefined,
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
            type="date"
            value={formData.start_date}
            onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
            required
          />
          <Input
            label="End Date"
            type="date"
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

        {/* Task Constraints Section */}
        <div className="border-t border-gray-200 pt-4">
          <p className="text-sm font-medium text-gray-700 mb-2">Task Constraints</p>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Constraint Type"
              options={[
                { value: 'none', label: 'None' },
                { value: 'start_no_earlier_than', label: 'Start No Earlier Than' },
                { value: 'finish_no_later_than', label: 'Finish No Later Than' },
                { value: 'must_start_on', label: 'Must Start On' },
                { value: 'must_finish_on', label: 'Must Finish On' },
              ]}
              value={formData.constraint_type}
              onChange={(value) => setFormData({ ...formData, constraint_type: value as GanttTask['constraint_type'] })}
            />
            {formData.constraint_type !== 'none' && (
              <Input
                label="Constraint Date"
                type="date"
                value={formData.constraint_date}
                onChange={(e) => setFormData({ ...formData, constraint_date: e.target.value })}
              />
            )}
          </div>
        </div>

        {/* Parent Task Section (Summary Tasks) */}
        {allTasks && allTasks.length > 0 && (
          <div className="border-t border-gray-200 pt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Parent Task (Summary)</p>
            <Select
              label=""
              options={[
                { value: '', label: 'None (Top-level task)' },
                ...availableParentTasks.map(t => ({ value: t.id, label: t.title })),
              ]}
              value={formData.parent_id}
              onChange={(value) => setFormData({ ...formData, parent_id: value })}
            />
            <p className="text-xs text-gray-500 mt-1">
              Set a parent to create a task hierarchy. Parent tasks summarize their children.
            </p>
          </div>
        )}

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
                  const isEditing = editingDependency === dep.id;
                  const currentLag = editingLag[dep.id] ?? dep.lag_days ?? 0;

                  return (
                    <div
                      key={dep.id}
                      className="flex flex-col p-2 bg-gray-50 rounded-lg text-sm gap-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-1">
                          <LinkIcon className="w-4 h-4 text-blue-500 flex-shrink-0" />
                          <span className="font-medium">{dependsOnTask?.title || 'Unknown task'}</span>
                        </div>
                        <div className="flex gap-1">
                          {isEditing && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingDependency(null);
                                setEditingLag(prev => {
                                  const newLag = { ...prev };
                                  delete newLag[dep.id];
                                  return newLag;
                                });
                              }}
                            >
                              Cancel
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onDependencyRemove(dep.id)}
                          >
                            <TrashIcon className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pl-6">
                        {isEditing && onDependencyUpdate ? (
                          <>
                            <Select
                              label=""
                              className="w-40"
                              options={[
                                { value: 'finish_to_start', label: 'Finish → Start' },
                                { value: 'start_to_start', label: 'Start → Start' },
                                { value: 'finish_to_finish', label: 'Finish → Finish' },
                                { value: 'start_to_finish', label: 'Start → Finish' },
                              ]}
                              value={dep.dependency_type}
                              onChange={(value) => {
                                onDependencyUpdate(dep.id, value as GanttDependency['dependency_type'], currentLag);
                                setEditingDependency(null);
                                setEditingLag(prev => {
                                  const newLag = { ...prev };
                                  delete newLag[dep.id];
                                  return newLag;
                                });
                              }}
                            />
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-gray-500">Lag:</span>
                              <input
                                type="number"
                                className="w-16 px-2 py-1 text-xs border border-gray-300 rounded"
                                value={currentLag}
                                onChange={(e) => setEditingLag(prev => ({ ...prev, [dep.id]: parseInt(e.target.value) || 0 }))}
                                placeholder="0"
                              />
                              <span className="text-xs text-gray-500">days</span>
                            </div>
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              onClick={() => {
                                onDependencyUpdate(dep.id, dep.dependency_type, currentLag);
                                setEditingDependency(null);
                                setEditingLag(prev => {
                                  const newLag = { ...prev };
                                  delete newLag[dep.id];
                                  return newLag;
                                });
                              }}
                            >
                              Save
                            </Button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="text-gray-500 text-xs hover:text-blue-600 hover:underline cursor-pointer"
                              onClick={() => {
                                setEditingDependency(dep.id);
                                setEditingLag(prev => ({ ...prev, [dep.id]: dep.lag_days || 0 }));
                              }}
                              title="Click to edit dependency"
                            >
                              {dep.dependency_type.replace(/_/g, ' ')}
                            </button>
                            {(dep.lag_days !== undefined && dep.lag_days !== 0) && (
                              <span className={`text-xs ${dep.lag_days > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                                {dep.lag_days > 0 ? `+${dep.lag_days}d lag` : `${dep.lag_days}d lead`}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add new dependency */}
            {availableDependencies.length > 0 && (
              <div className="space-y-2">
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
                    className="w-40"
                    options={[
                      { value: 'finish_to_start', label: 'Finish → Start' },
                      { value: 'start_to_start', label: 'Start → Start' },
                      { value: 'finish_to_finish', label: 'Finish → Finish' },
                      { value: 'start_to_finish', label: 'Start → Finish' },
                    ]}
                    value={newDependencyType}
                    onChange={(value) => setNewDependencyType(value as GanttDependency['dependency_type'])}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 flex-1">
                    <span className="text-xs text-gray-500">Lag/Lead:</span>
                    <input
                      type="number"
                      className="w-20 px-2 py-1 text-sm border border-gray-300 rounded"
                      value={newDependencyLag}
                      onChange={(e) => setNewDependencyLag(parseInt(e.target.value) || 0)}
                      placeholder="0"
                    />
                    <span className="text-xs text-gray-500">days (+ = lag, - = lead)</span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (newDependencyTask && task) {
                        onDependencyAdd(task.id, newDependencyTask, newDependencyType, newDependencyLag);
                        setNewDependencyTask('');
                        setNewDependencyLag(0);
                      }
                    }}
                    disabled={!newDependencyTask}
                >
                  <PlusIcon className="w-4 h-4" />
                </Button>
                </div>
              </div>
            )}

            {availableDependencies.length === 0 && (!task.dependencies || task.dependencies.length === 0) && (
              <p className="text-sm text-gray-500 italic">No dependencies configured</p>
            )}
          </div>
        )}

        {/* Comments Section - only for editing existing tasks */}
        {task && (
          <div className="border-t border-gray-200 pt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">
              <ChatBubbleLeftIcon className="w-4 h-4 inline mr-1" />
              Comments ({comments.length})
            </p>

            {/* Add comment input */}
            <div className="flex gap-2 mb-4">
              <Textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                rows={2}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleAddComment}
                disabled={!newComment.trim()}
                className="self-end"
              >
                <PlusIcon className="w-4 h-4" />
              </Button>
            </div>

            {/* Comments list */}
            {loadingComments ? (
              <div className="text-center py-4">
                <LoadingSpinner size="sm" />
              </div>
            ) : comments.length > 0 ? (
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {comments.map((comment) => (
                  <div key={comment.id} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Avatar
                          src={comment.user?.avatar_url}
                          name={comment.user?.full_name || 'Unknown'}
                          size="xs"
                        />
                        <span className="text-sm font-medium text-gray-700">
                          {comment.user?.full_name || 'Unknown'}
                        </span>
                        <span className="text-xs text-gray-400">
                          {formatDate(comment.created_at, { month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' })}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteComment(comment.id)}
                      >
                        <TrashIcon className="w-3 h-3 text-red-500" />
                      </Button>
                    </div>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{comment.content}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 italic">No comments yet</p>
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
  todayPosition,
  onDrag,
  dateRange,
  daysBetween,
  canEdit,
}: {
  task: GanttTaskWithRelations;
  workstream: Workstream | null;
  indent: number;
  getTaskPosition: (task: GanttTaskWithRelations) => { left: string; width: string };
  criticalPath: string[];
  showUncertainty: boolean;
  onClick: () => void;
  todayPosition?: number | null;
  onDrag?: (taskId: string, newStartDate: Date, newEndDate: Date) => void;
  dateRange?: { start: Date; end: Date };
  daysBetween?: number;
  canEdit?: boolean;
}) {
  const position = getTaskPosition(task);
  const isCritical = criticalPath.includes(task.id);
  const pert = task.optimistic_duration && task.pessimistic_duration && task.most_likely_duration
    ? calculatePERT(task.optimistic_duration, task.pessimistic_duration, task.most_likely_duration)
    : null;

  const paddingLeft = indent === 1 ? 'pl-6' : indent === 2 ? 'pl-10' : 'pl-3';
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!canEdit || !onDrag) return;
    e.stopPropagation();
    setIsDragging(true);
    setDragStartX(e.clientX);
    setDragOffset(0);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    const offset = e.clientX - dragStartX;
    setDragOffset(offset);
  }, [isDragging, dragStartX]);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (!isDragging || !onDrag || !containerRef.current || !dateRange || !daysBetween) {
      setIsDragging(false);
      return;
    }

    const containerWidth = containerRef.current.offsetWidth;
    const dayWidth = containerWidth / daysBetween;
    const daysMoved = Math.round(dragOffset / dayWidth);

    if (daysMoved !== 0) {
      const currentStart = new Date(task.start_date);
      const currentEnd = new Date(task.end_date);
      const newStart = new Date(currentStart.getTime() + daysMoved * 24 * 60 * 60 * 1000);
      const newEnd = new Date(currentEnd.getTime() + daysMoved * 24 * 60 * 60 * 1000);
      onDrag(task.id, newStart, newEnd);
    }

    setIsDragging(false);
    setDragOffset(0);
  }, [isDragging, dragOffset, onDrag, dateRange, daysBetween, task.id, task.start_date, task.end_date]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

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
      <div ref={containerRef} className="flex-1 relative h-16 py-2">
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
          ref={barRef}
          className={cn(
            'absolute h-8 rounded gantt-task top-1/2 -translate-y-1/2',
            isCritical ? 'gantt-critical' : '',
            isDragging ? 'opacity-70 cursor-grabbing' : canEdit ? 'cursor-grab' : ''
          )}
          style={{
            left: isDragging ? `calc(${position.left} + ${dragOffset}px)` : position.left,
            width: position.width,
            backgroundColor: workstream?.color || '#6b7280',
            transition: isDragging ? 'none' : 'left 0.2s ease-out',
          }}
          onMouseDown={handleMouseDown}
          title={canEdit ? 'Drag to reschedule' : undefined}
        >
          {/* Progress */}
          <div
            className="h-full rounded opacity-30 bg-black pointer-events-none"
            style={{ width: `${task.progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// DependencyArrows component for drawing SVG lines between tasks
function DependencyArrows({
  dependencies,
  tasks,
  taskRowIndexMap,
  getTaskPosition,
  daysBetween,
  dateRange,
}: {
  dependencies: GanttDependency[];
  tasks: GanttTaskWithRelations[];
  taskRowIndexMap: Map<string, number>;
  getTaskPosition: (task: GanttTaskWithRelations) => { left: string; width: string };
  daysBetween: number;
  dateRange: { start: Date; end: Date };
}) {
  console.log('[DependencyArrows] Rendering - deps:', dependencies.length, 'tasks:', tasks.length);
  const ROW_HEIGHT = 64; // h-16 = 4rem = 64px
  const HEADER_HEIGHT = 32; // Workstream header height
  const TASK_NAME_WIDTH = 256; // w-64 = 16rem = 256px

  // Calculate arrows for each dependency
  const arrows = useMemo(() => {
    console.log('[DependencyArrows] arrows useMemo start');
    return dependencies.map((dep) => {
      const fromTask = tasks.find(t => t.id === dep.depends_on_id);
      const toTask = tasks.find(t => t.id === dep.task_id);

      if (!fromTask || !toTask) return null;

      const fromRowIndex = taskRowIndexMap.get(fromTask.id);
      const toRowIndex = taskRowIndexMap.get(toTask.id);

      // If either task is in a collapsed section, don't draw the arrow
      if (fromRowIndex === undefined || toRowIndex === undefined) return null;

      const fromPosition = getTaskPosition(fromTask);
      const toPosition = getTaskPosition(toTask);

      // Calculate pixel positions
      // From position: end of the "from" task bar
      const fromLeftPercent = parseFloat(fromPosition.left);
      const fromWidthPercent = parseFloat(fromPosition.width);
      const toLeftPercent = parseFloat(toPosition.left);

      // Determine connection points based on dependency type
      let fromX: number, toX: number;

      switch (dep.dependency_type) {
        case 'finish_to_start':
          fromX = fromLeftPercent + fromWidthPercent; // End of from task
          toX = toLeftPercent; // Start of to task
          break;
        case 'start_to_start':
          fromX = fromLeftPercent; // Start of from task
          toX = toLeftPercent; // Start of to task
          break;
        case 'finish_to_finish':
          fromX = fromLeftPercent + fromWidthPercent; // End of from task
          toX = toLeftPercent + parseFloat(toPosition.width); // End of to task
          break;
        case 'start_to_finish':
          fromX = fromLeftPercent; // Start of from task
          toX = toLeftPercent + parseFloat(toPosition.width); // End of to task
          break;
        default:
          fromX = fromLeftPercent + fromWidthPercent;
          toX = toLeftPercent;
      }

      // Calculate Y positions (center of each row)
      const fromY = (fromRowIndex * ROW_HEIGHT) + (ROW_HEIGHT / 2);
      const toY = (toRowIndex * ROW_HEIGHT) + (ROW_HEIGHT / 2);

      return {
        id: dep.id,
        fromX,
        toX,
        fromY,
        toY,
        type: dep.dependency_type,
      };
    }).filter(Boolean) as Array<{
      id: string;
      fromX: number;
      toX: number;
      fromY: number;
      toY: number;
      type: string;
    }>;
  }, [dependencies, tasks, taskRowIndexMap, getTaskPosition]);

  if (arrows.length === 0) return null;

  // Calculate total height needed for SVG
  const maxRow = Math.max(...Array.from(taskRowIndexMap.values())) + 1;
  const svgHeight = maxRow * ROW_HEIGHT + 100;

  return (
    <svg
      className="absolute top-0 pointer-events-none"
      style={{
        left: TASK_NAME_WIDTH,
        width: `calc(100% - ${TASK_NAME_WIDTH}px)`,
        height: svgHeight,
        overflow: 'visible',
      }}
    >
      <defs>
        <marker
          id="arrowhead"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon
            points="0 0, 10 3.5, 0 7"
            fill="#3B82F6"
          />
        </marker>
        <marker
          id="arrowhead-critical"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon
            points="0 0, 10 3.5, 0 7"
            fill="#EF4444"
          />
        </marker>
      </defs>
      {arrows.map((arrow) => {
        // Convert percentage positions to SVG coordinates
        // The SVG width is (100% - 256px), so we need to calculate based on percentage
        const startX = `${arrow.fromX}%`;
        const endX = `${arrow.toX}%`;
        const startY = arrow.fromY;
        const endY = arrow.toY;

        // Calculate control points for curved line
        const midY = (startY + endY) / 2;
        const curveOffset = Math.min(Math.abs(endY - startY) / 4, 20);

        // Create a path that goes from end of one task to start of another
        // with a nice curve
        let pathD: string;

        if (Math.abs(arrow.fromY - arrow.toY) < ROW_HEIGHT) {
          // Tasks on same or adjacent rows - simple curved line
          pathD = `M ${startX} ${startY}
                   C ${arrow.fromX + 3}% ${startY},
                     ${arrow.toX - 3}% ${endY},
                     ${endX} ${endY}`;
        } else if (arrow.fromX < arrow.toX - 5) {
          // Normal case: from task ends before to task starts
          pathD = `M ${startX} ${startY}
                   L ${arrow.fromX + 1}% ${startY}
                   Q ${arrow.fromX + 2}% ${startY} ${arrow.fromX + 2}% ${startY + (endY > startY ? 10 : -10)}
                   L ${arrow.fromX + 2}% ${midY}
                   Q ${arrow.fromX + 2}% ${endY - (endY > startY ? 10 : -10)} ${arrow.fromX + 3}% ${endY}
                   L ${arrow.toX - 1}% ${endY}`;
        } else {
          // Overlapping case: need to route around
          const routeX = Math.max(arrow.fromX + 2, arrow.toX + 2);
          pathD = `M ${startX} ${startY}
                   L ${routeX}% ${startY}
                   Q ${routeX + 1}% ${startY} ${routeX + 1}% ${startY + (endY > startY ? 10 : -10)}
                   L ${routeX + 1}% ${endY - (endY > startY ? 10 : -10)}
                   Q ${routeX + 1}% ${endY} ${routeX}% ${endY}
                   L ${endX} ${endY}`;
        }

        return (
          <path
            key={arrow.id}
            d={pathD}
            fill="none"
            stroke="#3B82F6"
            strokeWidth="2"
            strokeDasharray={arrow.type === 'finish_to_start' ? 'none' : '4 2'}
            markerEnd="url(#arrowhead)"
            opacity="0.7"
          />
        );
      })}
    </svg>
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
  const [formData, setFormData] = useState<{
    title: string;
    description: string;
    workstream_id: string;
    target_date: string;
    status: Milestone['status'];
  }>({
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
            onChange={(value) => setFormData({ ...formData, status: value as Milestone['status'] })}
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
