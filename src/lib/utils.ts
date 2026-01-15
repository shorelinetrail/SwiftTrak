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
  return new Date(date).toLocaleDateString('en-GB', options || defaultOptions);
}

export function formatDateShort(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-GB', {
    month: 'short',
    day: 'numeric',
  });
}

export function formatTime(date: string | Date): string {
  return new Date(date).toLocaleTimeString('en-GB', {
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
  dependencies?: Array<{ depends_on_id: string; lag_days?: number; dependency_type?: string }>;
}>): string[] {
  // Build dependency graph with lag information
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  // Store successors with their lag values: Map<taskId, Array<{successorId, lag}>>
  const successors = new Map<string, Array<{ id: string; lag: number }>>();
  // Store predecessors with their lag values: Map<taskId, Array<{predecessorId, lag}>>
  const predecessors = new Map<string, Array<{ id: string; lag: number }>>();

  tasks.forEach(task => {
    if (!successors.has(task.id)) successors.set(task.id, []);
    if (!predecessors.has(task.id)) predecessors.set(task.id, []);

    task.dependencies?.forEach(dep => {
      const lagDays = dep.lag_days || 0;

      const depList = successors.get(dep.depends_on_id) || [];
      depList.push({ id: task.id, lag: lagDays });
      successors.set(dep.depends_on_id, depList);

      const predList = predecessors.get(task.id) || [];
      predList.push({ id: dep.depends_on_id, lag: lagDays });
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

  // Track visited nodes to prevent infinite recursion from circular dependencies
  const visitingEarly = new Set<string>();
  const visitingLate = new Set<string>();

  const calculateEarly = (taskId: string): number => {
    if (earlyFinish.has(taskId)) return earlyFinish.get(taskId)!;

    // Circular dependency protection
    if (visitingEarly.has(taskId)) {
      console.warn('Circular dependency detected in calculateEarly for task:', taskId);
      return 0;
    }
    visitingEarly.add(taskId);

    const task = taskMap.get(taskId);
    if (!task) {
      visitingEarly.delete(taskId);
      return 0;
    }

    const preds = predecessors.get(taskId) || [];
    // Early Start = max(Early Finish of predecessor + lag) for all predecessors
    const es = preds.length > 0
      ? Math.max(...preds.map(p => calculateEarly(p.id) + p.lag))
      : 0;

    earlyStart.set(taskId, es);
    const ef = es + getDuration(task);
    earlyFinish.set(taskId, ef);
    visitingEarly.delete(taskId);
    return ef;
  };

  tasks.forEach(t => calculateEarly(t.id));

  // Calculate latest start/finish times (backward pass)
  const projectEnd = earlyFinish.size > 0 ? Math.max(...Array.from(earlyFinish.values())) : 0;
  const lateStart = new Map<string, number>();
  const lateFinish = new Map<string, number>();

  const calculateLate = (taskId: string): number => {
    if (lateStart.has(taskId)) return lateStart.get(taskId)!;

    // Circular dependency protection
    if (visitingLate.has(taskId)) {
      console.warn('Circular dependency detected in calculateLate for task:', taskId);
      return projectEnd;
    }
    visitingLate.add(taskId);

    const task = taskMap.get(taskId);
    if (!task) {
      visitingLate.delete(taskId);
      return projectEnd;
    }

    const succs = successors.get(taskId) || [];
    // Late Finish = min(Late Start of successor - lag) for all successors
    const lf = succs.length > 0
      ? Math.min(...succs.map(s => {
          const succLateStart = calculateLate(s.id);
          return succLateStart - s.lag;
        }))
      : projectEnd;

    lateFinish.set(taskId, lf);
    const ls = lf - getDuration(task);
    lateStart.set(taskId, ls);
    visitingLate.delete(taskId);
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

/**
 * Build hierarchical workstream options for Select components.
 * Children are indented with "— " prefix to show hierarchy.
 *
 * @param workstreams - Array of workstream objects with id, name, and optional parent_id
 * @param options - Configuration options
 * @param options.includeAll - Whether to include an "all" or placeholder option (default: true)
 * @param options.allLabel - Custom label for the all/placeholder option (default: "All Workstreams")
 * @param options.allValue - Custom value for the all/placeholder option (default: "all")
 * @param options.labelFormat - How to format child labels: 'hierarchy' = "— Child", 'path' = "Parent/Child"
 * @param options.excludeParentsWithChildren - If true, parent workstreams with children are not selectable
 * @param options.mapOption - Optional function to add extra properties to each option
 */
export function buildWorkstreamOptions<T extends { id: string; name: string; parent_id?: string | null }>(
  workstreams: T[],
  config: {
    includeAll?: boolean;
    allLabel?: string;
    allValue?: string;
    labelFormat?: 'hierarchy' | 'path'; // 'hierarchy' = "— Child", 'path' = "Parent/Child"
    excludeParentsWithChildren?: boolean;
    mapOption?: (ws: T, isChild: boolean) => Record<string, unknown>;
  } = {}
): Array<{ value: string; label: string } & Record<string, unknown>> {
  const { includeAll = true, allLabel = 'All Workstreams', allValue = 'all', labelFormat = 'hierarchy', excludeParentsWithChildren = false, mapOption } = config;
  const options: Array<{ value: string; label: string } & Record<string, unknown>> = [];

  if (includeAll) {
    options.push({ value: allValue, label: allLabel });
  }

  // Build a map of workstreams by id for parent lookup
  const workstreamMap = new Map<string, T>();
  workstreams.forEach(ws => workstreamMap.set(ws.id, ws));

  // Get root workstreams (no parent)
  const rootWorkstreams = workstreams
    .filter(ws => !ws.parent_id)
    .sort((a, b) => a.name.localeCompare(b.name));

  // Build a map of children by parent_id
  const childrenMap = new Map<string, T[]>();
  workstreams.forEach(ws => {
    if (ws.parent_id) {
      const existing = childrenMap.get(ws.parent_id) || [];
      existing.push(ws);
      childrenMap.set(ws.parent_id, existing);
    }
  });

  // Add root workstreams and their children
  rootWorkstreams.forEach(root => {
    const children = childrenMap.get(root.id) || [];
    const hasChildren = children.length > 0;

    // Only add root if it has no children OR we're not excluding parents with children
    if (!excludeParentsWithChildren || !hasChildren) {
      const rootOption: { value: string; label: string } & Record<string, unknown> = {
        value: root.id,
        label: root.name,
        ...(mapOption ? mapOption(root, false) : {}),
      };
      options.push(rootOption);
    }

    // Add children with appropriate format
    children
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(child => {
        const childLabel = labelFormat === 'path'
          ? `${root.name}/${child.name}`
          : `— ${child.name}`;
        const childOption: { value: string; label: string } & Record<string, unknown> = {
          value: child.id,
          label: childLabel,
          ...(mapOption ? mapOption(child, true) : {}),
        };
        options.push(childOption);
      });
  });

  return options;
}

/**
 * Get the display name for a workstream, including parent if applicable.
 * Returns "Parent/Child" format for child workstreams.
 */
export function getWorkstreamDisplayName<T extends { id: string; name: string; parent_id?: string | null }>(
  workstream: T,
  allWorkstreams: T[]
): string {
  if (!workstream.parent_id) {
    return workstream.name;
  }

  const parent = allWorkstreams.find(ws => ws.id === workstream.parent_id);
  if (parent) {
    return `${parent.name}/${workstream.name}`;
  }

  return workstream.name;
}
