export type UserRole = 'admin' | 'edit' | 'view';
export type ActionStatus = 'pending' | 'in_progress' | 'complete' | 'cancelled';
export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type RiskLevel = 'low' | 'medium' | 'high';
export type QueryPriority = 'urgent' | 'high' | 'medium' | 'low';

export interface User {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
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
  unmitigated_risk: RiskLevel;
  current_risk: RiskLevel;
  solution?: string;
  mitigated_risk?: RiskLevel;
  created_at: string;
  updated_at: string;
  created_by: string;
  // Joined fields
  workstream?: Workstream;
  creator?: User;
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

export interface WorkstreamPhoto {
  id: string;
  workstream_id: string;
  storage_path: string;
  thumbnail_path?: string;
  original_filename: string;
  taken_at?: string;
  caption?: string;
  file_size?: number;
  width?: number;
  height?: number;
  is_hidden?: boolean;
  storage_backend?: 'supabase' | 'r2';
  uploaded_by?: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  workstream?: Workstream;
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

export interface UploadLink {
  id: string;
  token: string;
  name: string;
  workstream_id: string;
  created_by: string;
  expires_at?: string;
  max_files?: number;
  upload_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Joined fields
  workstream?: Workstream;
  creator?: User;
}

export type VendorActivityStatus = 'planned' | 'confirmed' | 'in_progress' | 'complete' | 'cancelled';

export interface Vendor {
  id: string;
  name: string;
  vendor_number?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  creator?: User;
  activities?: VendorActivity[];
  linked_actions?: Action[];
}

export interface VendorActivity {
  id: string;
  vendor_id: string;
  description: string;
  purchase_requisition?: string;
  purchase_order?: string;
  purchase_order_value?: number;
  provisional_start_date?: string;
  provisional_end_date?: string;
  confirmed_start_date?: string;
  confirmed_end_date?: string;
  status: VendorActivityStatus;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  vendor?: Vendor;
  creator?: User;
}

export interface VendorActionLink {
  id: string;
  vendor_id: string;
  action_id: string;
  created_by?: string;
  created_at: string;
  // Joined fields
  vendor?: Vendor;
  action?: Action;
}

export interface VendorAudit {
  id: string;
  vendor_id: string;
  user_id?: string;
  change_type: string;
  field_name?: string;
  old_value?: string;
  new_value?: string;
  created_at: string;
  // Joined fields
  user?: User;
}

export interface VendorActivityAudit {
  id: string;
  activity_id: string;
  vendor_id: string;
  user_id?: string;
  change_type: string;
  field_name?: string;
  old_value?: string;
  new_value?: string;
  created_at: string;
  // Joined fields
  user?: User;
}

export interface VendorContact {
  id: string;
  vendor_id: string;
  name: string;
  job_title?: string;
  email?: string;
  phone?: string;
  is_primary: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  creator?: User;
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
