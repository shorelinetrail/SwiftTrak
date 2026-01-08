'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import { useRealtime } from '@/hooks/use-realtime';
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
} from '@heroicons/react/24/outline';
import type { GanttTask, GanttDependency, Workstream, User } from '@/types/database';

type GanttTaskWithRelations = GanttTask & {
  workstream?: Workstream;
  assignee?: User;
  dependencies?: GanttDependency[];
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

  const [addTaskModalOpen, setAddTaskModalOpen] = useState(false);
  const [editTaskModalOpen, setEditTaskModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<GanttTaskWithRelations | null>(null);

  const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>({
    start: new Date(),
    end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  const fetchTasks = useCallback(async () => {
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

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useRealtime({
    table: 'gantt_tasks',
    onInsert: () => fetchTasks(),
    onUpdate: () => fetchTasks(),
    onDelete: () => fetchTasks(),
  });

  const criticalPath = useMemo(() => {
    if (!showCriticalPath || tasks.length === 0) return [];
    return calculateCriticalPath(tasks);
  }, [tasks, showCriticalPath]);

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
              <Button size="sm" onClick={() => setAddTaskModalOpen(true)}>
                <PlusIcon className="w-4 h-4 mr-2" />
                Add Task
              </Button>
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

        {/* Critical Path Legend */}
        {showCriticalPath && criticalPath.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <div className="w-4 h-4 bg-red-500 rounded" />
            <span>Critical Path ({criticalPath.length} tasks)</span>
            <ExclamationTriangleIcon className="w-4 h-4 text-yellow-500 ml-4" />
            <span>Any delay in these tasks will delay the project</span>
          </div>
        )}

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

            {/* Tasks */}
            <div>
              {tasks.map((task) => {
                const position = getTaskPosition(task);
                const isCritical = criticalPath.includes(task.id);
                const pert = task.optimistic_duration && task.pessimistic_duration && task.most_likely_duration
                  ? calculatePERT(task.optimistic_duration, task.pessimistic_duration, task.most_likely_duration)
                  : null;

                return (
                  <div
                    key={task.id}
                    className="flex border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                    onClick={() => {
                      setSelectedTask(task);
                      setEditTaskModalOpen(true);
                    }}
                  >
                    {/* Task name */}
                    <div className="w-64 flex-shrink-0 p-3 border-r border-gray-200">
                      <div className="flex items-center gap-2">
                        {task.workstream && (
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: task.workstream.color }}
                          />
                        )}
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
                          backgroundColor: task.workstream?.color || '#6b7280',
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
              })}
            </div>
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
        />
      )}
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
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<GanttTask>) => void;
  onDelete?: () => void;
  task?: GanttTaskWithRelations;
  workstreams: Workstream[];
  users: User[];
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
