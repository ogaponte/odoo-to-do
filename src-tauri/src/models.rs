use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OdooInstance {
    pub id: String,
    pub name: String,
    pub url: String,
    pub db: String,
    pub username: String,
    pub api_key: String,
    pub color: String,
    pub last_sync_at: Option<String>,
    pub active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateInstanceInput {
    pub name: String,
    pub url: String,
    pub db: String,
    pub username: String,
    pub api_key: String,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInstanceInput {
    pub id: String,
    pub name: String,
    pub url: String,
    pub db: String,
    pub username: String,
    pub api_key: String,
    pub color: String,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub instance_id: String,
    pub odoo_id: Option<i64>,
    pub name: String,
    pub color: Option<String>,
    pub sync_status: String,
    pub created_at: String,
    pub updated_at: String,
    pub odoo_write_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Stage {
    pub id: String,
    pub instance_id: String,
    pub odoo_id: Option<i64>,
    pub project_id: Option<String>,
    pub name: String,
    pub sequence: i32,
    pub is_closed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub instance_id: String,
    pub project_id: Option<String>,
    pub stage_id: Option<String>,
    pub odoo_id: Option<i64>,
    pub title: String,
    pub description: String,
    pub is_completed: bool,
    pub priority: String, // "0" normal, "1" important
    pub date_deadline: Option<String>, // "YYYY-MM-DD"
    pub kanban_state: String, // "normal", "done", "blocked"
    pub sync_status: String, // "synced", "pending_create", "pending_update", "pending_delete", "conflict"
    pub sync_error: Option<String>,
    pub local_updated_at: String,
    pub odoo_write_date: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTaskInput {
    pub instance_id: String,
    pub project_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub priority: Option<String>,
    pub date_deadline: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateTaskInput {
    pub id: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub is_completed: Option<bool>,
    pub priority: Option<String>,
    pub date_deadline: Option<Option<String>>,
    pub project_id: Option<Option<String>>,
    pub stage_id: Option<Option<String>>,
    pub kanban_state: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncQueueItem {
    pub id: i64,
    pub instance_id: String,
    pub entity_type: String, // "task" | "project"
    pub entity_id: String,
    pub operation: String, // "create" | "update" | "delete"
    pub payload_json: String,
    pub status: String, // "pending" | "failed" | "completed"
    pub retry_count: i32,
    pub last_error: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStatusInfo {
    pub pending_mutations: i64,
    pub last_synced_at: Option<String>,
    pub is_syncing: bool,
    pub online: bool,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionTestResult {
    pub success: bool,
    pub message: String,
    pub odoo_version: Option<String>,
    pub user_id: Option<i64>,
}
