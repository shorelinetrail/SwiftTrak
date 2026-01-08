import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };
  return new Date(date).toLocaleDateString('en-US', options || defaultOptions);
}

export function formatDateShort(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function formatTime(date: string | Date): string {
  return new Date(date).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getRelativeTime(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return formatDateShort(date);
}

export function isOverdue(dueDate: string | Date): boolean {
  return new Date(dueDate) < new Date();
}

export function getDaysUntil(date: string | Date): number {
  const now = new Date();
  const target = new Date(date);
  const diffInMs = target.getTime() - now.getTime();
  return Math.ceil(diffInMs / (1000 * 60 * 60 * 24));
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-800',
    in_progress: 'bg-blue-100 text-blue-800',
    complete: 'bg-green-100 text-green-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
    missed: 'bg-red-100 text-red-800',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}

export function getPriorityColor(priority: string): string {
  const colors: Record<string, string> = {
    critical: 'bg-red-600 text-white',
    urgent: 'bg-red-600 text-white',
    high: 'bg-orange-500 text-white',
    medium: 'bg-yellow-400 text-black',
    low: 'bg-green-500 text-white',
  };
  return colors[priority] || 'bg-gray-100 text-gray-800';
}

export function getRiskColor(risk: string): string {
  const colors: Record<string, string> = {
    low: 'bg-green-100 text-green-800 border-green-300',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    high: 'bg-red-100 text-red-800 border-red-300',
  };
  return colors[risk] || 'bg-gray-100 text-gray-800 border-gray-300';
}

export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function extractMentions(text: string): string[] {
  const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
  const mentions: string[] = [];
  let match;
  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push(match[2]); // User ID
  }
  return mentions;
}

export function renderMentions(text: string): string {
  return text.replace(
    /@\[([^\]]+)\]\(([^)]+)\)/g,
    '<span class="mention bg-blue-100 text-blue-800 px-1 rounded">@$1</span>'
  );
}

export function truncate(text: string, length: number): string {
  if (text.length <= length) return text;
  return text.slice(0, length) + '...';
}

export function calculateCriticalPath(tasks: Array<{
  id: string;
  start_date: string;
  end_date: string;
  dependencies?: Array<{ depends_on_id: string }>;
}>): string[] {
  // Build dependency graph
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const successors = new Map<string, string[]>();
  const predecessors = new Map<string, string[]>();

  tasks.forEach(task => {
    if (!successors.has(task.id)) successors.set(task.id, []);
    if (!predecessors.has(task.id)) predecessors.set(task.id, []);

    task.dependencies?.forEach(dep => {
      const depList = successors.get(dep.depends_on_id) || [];
      depList.push(task.id);
      successors.set(dep.depends_on_id, depList);

      const predList = predecessors.get(task.id) || [];
      predList.push(dep.depends_on_id);
      predecessors.set(task.id, predList);
    });
  });

  // Calculate earliest start/finish times (forward pass)
  const earlyStart = new Map<string, number>();
  const earlyFinish = new Map<string, number>();

  const getDuration = (task: typeof tasks[0]) => {
    const start = new Date(task.start_date).getTime();
    const end = new Date(task.end_date).getTime();
    return (end - start) / (1000 * 60 * 60 * 24);
  };

  const calculateEarly = (taskId: string): number => {
    if (earlyFinish.has(taskId)) return earlyFinish.get(taskId)!;

    const task = taskMap.get(taskId);
    if (!task) return 0;

    const preds = predecessors.get(taskId) || [];
    const es = preds.length > 0
      ? Math.max(...preds.map(p => calculateEarly(p)))
      : 0;

    earlyStart.set(taskId, es);
    const ef = es + getDuration(task);
    earlyFinish.set(taskId, ef);
    return ef;
  };

  tasks.forEach(t => calculateEarly(t.id));

  // Calculate latest start/finish times (backward pass)
  const projectEnd = Math.max(...Array.from(earlyFinish.values()));
  const lateStart = new Map<string, number>();
  const lateFinish = new Map<string, number>();

  const calculateLate = (taskId: string): number => {
    if (lateStart.has(taskId)) return lateStart.get(taskId)!;

    const task = taskMap.get(taskId);
    if (!task) return projectEnd;

    const succs = successors.get(taskId) || [];
    const lf = succs.length > 0
      ? Math.min(...succs.map(s => calculateLate(s)))
      : projectEnd;

    lateFinish.set(taskId, lf);
    const ls = lf - getDuration(task);
    lateStart.set(taskId, ls);
    return ls;
  };

  tasks.forEach(t => calculateLate(t.id));

  // Find critical path (tasks with zero slack)
  const criticalPath: string[] = [];
  tasks.forEach(task => {
    const es = earlyStart.get(task.id) || 0;
    const ls = lateStart.get(task.id) || 0;
    const slack = ls - es;
    if (Math.abs(slack) < 0.001) {
      criticalPath.push(task.id);
    }
  });

  return criticalPath;
}

export function calculatePERT(
  optimistic: number,
  mostLikely: number,
  pessimistic: number
): { expected: number; standardDeviation: number } {
  const expected = (optimistic + 4 * mostLikely + pessimistic) / 6;
  const standardDeviation = (pessimistic - optimistic) / 6;
  return { expected, standardDeviation };
}
