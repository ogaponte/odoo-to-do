export interface OdooInstance {
  id: string;
  name: string;
  url: string;
  db: string;
  username: string;
  api_key: string;
  color: string;
  last_sync_at: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateInstanceInput {
  name: string;
  url: string;
  db: string;
  username: string;
  api_key: string;
  color?: string;
}

export interface UpdateInstanceInput {
  id: string;
  name: string;
  url: string;
  db: string;
  username: string;
  api_key: string;
  color: string;
  active: boolean;
}

export interface Project {
  id: string;
  instance_id: string;
  odoo_id: number | null;
  name: string;
  color: string | null;
  sync_status: 'synced' | 'pending_create' | 'pending_update';
  created_at: string;
  updated_at: string;
  odoo_write_date: string | null;
}

export interface Stage {
  id: string;
  instance_id: string;
  odoo_id: number | null;
  project_id: string | null;
  name: string;
  sequence: number;
  is_closed: boolean;
}

export interface Task {
  id: string;
  instance_id: string;
  project_id: string | null;
  stage_id: string | null;
  odoo_id: number | null;
  title: string;
  description: string;
  is_completed: boolean;
  priority: string; // '0' | '1'
  date_deadline: string | null;
  kanban_state: string; // 'normal' | 'done' | 'blocked'
  sync_status: 'synced' | 'pending_create' | 'pending_update' | 'pending_delete' | 'conflict';
  sync_error: string | null;
  local_updated_at: string;
  odoo_write_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTaskInput {
  instance_id: string;
  project_id?: string | null;
  title: string;
  description?: string;
  priority?: string;
  date_deadline?: string | null;
}

export interface UpdateTaskInput {
  id: string;
  title?: string;
  description?: string;
  is_completed?: boolean;
  priority?: string;
  date_deadline?: string | null;
  project_id?: string | null;
  stage_id?: string | null;
  kanban_state?: string;
}

export interface SyncStatusInfo {
  pending_mutations: number;
  last_synced_at: string | null;
  is_syncing: boolean;
  online: boolean;
  message: string | null;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  odoo_version: string | null;
  user_id: number | null;
}
