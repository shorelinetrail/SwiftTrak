export type UserRole = 'admin' | 'edit' | 'view';
export type UserStatus = 'active' | 'pending';
export type ActionStatus = 'pending' | 'in_progress' | 'complete' | 'cancelled';
export type ThreatStatus = 'open' | 'closed';
export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type RiskLevel = 'low' | 'medium' | 'high';
export type QueryPriority = 'urgent' | 'high' | 'medium' | 'low';

export interface User {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  role: UserRole;
  status: UserStatus;
  invited_by?: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  inviter?: User;
}

export interface UserWorkstreamPermission {
  id: string;
  user_id: string;
  workstream_id: string;
  permission: UserRole;
  created_at: string;
}

export interface Workstream {
  id: string;
  name: string;
  description?: string;
  color: string;
  order_index: number;
  parent_id?: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  // Joined/computed fields
  parent?: Workstream;
  children?: Workstream[];
}

export interface Action {
  id: string;
  title: string;
  description?: string;
  workstream_id: string;
  owner_id: string;
  status: ActionStatus;
  priority: Priority;
  due_date?: string;
  completed_at?: string;
  completion_comment?: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  // Joined fields
  workstream?: Workstream;
  owner?: User;
  creator?: User;
}

export interface ActionUpdate {
  id: string;
  action_id: string;
  user_id: string;
  content: string;
  created_at: string;
  // Joined fields
  user?: User;
}

export interface ActionAudit {
  id: string;
  action_id: string;
  user_id: string;
  change_type: string;
  old_value?: string;
  new_value?: string;
  created_at: string;
  // Joined fields
  user?: User;
}

export interface Threat {
  id: string;
  title: string;
  description: string;
  workstream_id: string;
  proposed_mitigation?: string;
  expected_delay?: string;
  actual_delay?: string;
  unmitigated_risk: RiskLevel;
  current_risk: RiskLevel;
  solution?: string;
  mitigated_risk?: RiskLevel;
  status: ThreatStatus;
  created_at: string;
  updated_at: string;
  created_by: string;
  // Joined fields
  workstream?: Workstream;
  creator?: User;
}

export interface ThreatAudit {
  id: string;
  threat_id: string;
  user_id: string;
  change_type: string;
  old_value?: string;
  new_value?: string;
  created_at: string;
  // Joined fields
  user?: User;
}

export interface TechnicalQuery {
  id: string;
  title: string;
  description: string;
  workstream_id?: string;
  submitted_by: string;
  assigned_to: string;
  priority: QueryPriority;
  response?: string;
  responded_at?: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  workstream?: Workstream;
  submitter?: User;
  assignee?: User;
}

export interface Decision {
  id: string;
  title: string;
  description: string;
  workstream_id?: string;
  made_by: string;
  rationale?: string;
  impact?: string;
  created_at: string;
  // Joined fields
  workstream?: Workstream;
  decision_maker?: User;
}

export interface DecisionAudit {
  id: string;
  decision_id: string;
  user_id: string;
  change_type: string;
  old_value?: string;
  new_value?: string;
  created_at: string;
  // Joined fields
  user?: User;
}

export interface Milestone {
  id: string;
  title: string;
  description?: string;
  workstream_id?: string;
  target_date: string;
  completed_at?: string;
  status: 'pending' | 'completed' | 'missed';
  created_at: string;
  updated_at: string;
  created_by: string;
  // Joined fields
  workstream?: Workstream;
  creator?: User;
}

export interface MilestoneAudit {
  id: string;
  milestone_id: string;
  user_id: string;
  change_type: string;
  old_value?: string;
  new_value?: string;
  created_at: string;
  // Joined fields
  user?: User;
}

export interface GanttTask {
  id: string;
  title: string;
  workstream_id?: string;
  start_date: string;
  end_date: string;
  progress: number;
  parent_id?: string;
  order_index: number;
  optimistic_duration?: number;
  pessimistic_duration?: number;
  most_likely_duration?: number;
  assigned_to?: string;
  constraint_type?: 'none' | 'start_no_earlier_than' | 'finish_no_later_than' | 'must_start_on' | 'must_finish_on';
  constraint_date?: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  workstream?: Workstream;
  assignee?: User;
  dependencies?: GanttDependency[];
}

export interface GanttDependency {
  id: string;
  task_id: string;
  depends_on_id: string;
  dependency_type: 'finish_to_start' | 'start_to_start' | 'finish_to_finish' | 'start_to_finish';
  lag_days?: number;
  created_at: string;
}

export interface GanttTaskComment {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  user?: User;
}

export interface Attachment {
  id: string;
  entity_type: 'action' | 'threat' | 'query' | 'decision' | 'milestone';
  entity_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
  uploaded_by: string;
  created_at: string;
  // Joined fields
  uploader?: User;
}

export interface Mention {
  id: string;
  entity_type: 'action_update' | 'query_response' | 'decision';
  entity_id: string;
  mentioned_user_id: string;
  mentioned_by: string;
  seen: boolean;
  created_at: string;
}

export interface StakeholderLink {
  id: string;
  token: string;
  name: string;
  expires_at?: string;
  workstream_ids?: string[];
  created_by: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  entity_type?: string;
  entity_id?: string;
  read: boolean;
  created_at: string;
}
