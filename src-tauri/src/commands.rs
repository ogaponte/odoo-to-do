use std::sync::Arc;
use tauri::State;

use crate::db::Database;
use crate::models::{
    ConnectionTestResult, CreateInstanceInput, CreateTaskInput, OdooInstance, Project, Stage,
    SyncStatusInfo, Task, UpdateInstanceInput, UpdateTaskInput,
};
use crate::odoo::OdooClient;
use crate::sync::SyncEngine;

pub struct AppState {
    pub db: Database,
    pub sync_engine: Arc<SyncEngine>,
}

// ==========================================
// WINDOW COMMANDS
// ==========================================

#[tauri::command]
pub fn drag_window(window: tauri::WebviewWindow) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

// ==========================================
// INSTANCE COMMANDS
// ==========================================

#[tauri::command]
pub async fn get_instances(state: State<'_, AppState>) -> Result<Vec<OdooInstance>, String> {
    state.db.get_instances().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_instance(
    input: CreateInstanceInput,
    state: State<'_, AppState>,
) -> Result<OdooInstance, String> {
    let instance = state.db.create_instance(input).map_err(|e| e.to_string())?;
    // Trigger background sync for the new instance
    let sync = state.sync_engine.clone();
    tokio::spawn(async move {
        let _ = sync.sync_all().await;
    });
    Ok(instance)
}

#[tauri::command]
pub async fn update_instance(
    input: UpdateInstanceInput,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.db.update_instance(input).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_instance(id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.db.delete_instance(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn test_odoo_connection(input: CreateInstanceInput) -> Result<ConnectionTestResult, String> {
    let client = OdooClient::new();
    let temp_instance = OdooInstance {
        id: "temp".to_string(),
        name: input.name,
        url: input.url,
        db: input.db,
        username: input.username,
        api_key: input.api_key,
        color: input.color.unwrap_or_else(|| "#3B82F6".to_string()),
        last_sync_at: None,
        active: true,
        created_at: String::new(),
        updated_at: String::new(),
    };
    Ok(client.test_connection(&temp_instance).await)
}

// ==========================================
// PROJECT & STAGE COMMANDS
// ==========================================

#[tauri::command]
pub async fn get_projects(
    instance_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<Project>, String> {
    state
        .db
        .get_projects(instance_id.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_stages(
    instance_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<Stage>, String> {
    state
        .db
        .get_stages(instance_id.as_deref())
        .map_err(|e| e.to_string())
}

// ==========================================
// TASK COMMANDS (OFFLINE-FIRST)
// ==========================================

#[tauri::command]
pub async fn get_tasks(
    instance_id: Option<String>,
    project_id: Option<String>,
    starred_only: Option<bool>,
    completed_only: Option<bool>,
    search_query: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<Task>, String> {
    state
        .db
        .get_tasks(
            instance_id.as_deref(),
            project_id.as_deref(),
            starred_only.unwrap_or(false),
            completed_only,
            search_query.as_deref(),
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_task(id: String, state: State<'_, AppState>) -> Result<Option<Task>, String> {
    state.db.get_task_by_id(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_task(
    input: CreateTaskInput,
    state: State<'_, AppState>,
) -> Result<Task, String> {
    let task = state.db.create_task_locally(input).map_err(|e| e.to_string())?;
    
    // Auto sync push in background
    let sync = state.sync_engine.clone();
    tokio::spawn(async move {
        let _ = sync.sync_all().await;
    });

    Ok(task)
}

#[tauri::command]
pub async fn update_task(
    input: UpdateTaskInput,
    state: State<'_, AppState>,
) -> Result<Task, String> {
    let task = state.db.update_task_locally(input).map_err(|e| e.to_string())?;

    // Auto sync push in background
    let sync = state.sync_engine.clone();
    tokio::spawn(async move {
        let _ = sync.sync_all().await;
    });

    Ok(task)
}

#[tauri::command]
pub async fn delete_task(id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.db.delete_task_locally(&id).map_err(|e| e.to_string())?;

    // Auto sync push in background
    let sync = state.sync_engine.clone();
    tokio::spawn(async move {
        let _ = sync.sync_all().await;
    });

    Ok(())
}

#[tauri::command]
pub async fn toggle_task_completion(
    id: String,
    completed: bool,
    state: State<'_, AppState>,
) -> Result<Task, String> {
    let input = UpdateTaskInput {
        id,
        title: None,
        description: None,
        is_completed: Some(completed),
        priority: None,
        date_deadline: None,
        project_id: None,
        stage_id: None,
        kanban_state: Some(if completed { "done".to_string() } else { "normal".to_string() }),
    };
    let task = state.db.update_task_locally(input).map_err(|e| e.to_string())?;

    let sync = state.sync_engine.clone();
    tokio::spawn(async move {
        let _ = sync.sync_all().await;
    });

    Ok(task)
}

#[tauri::command]
pub async fn toggle_task_star(
    id: String,
    starred: bool,
    state: State<'_, AppState>,
) -> Result<Task, String> {
    let input = UpdateTaskInput {
        id,
        title: None,
        description: None,
        is_completed: None,
        priority: Some(if starred { "1".to_string() } else { "0".to_string() }),
        date_deadline: None,
        project_id: None,
        stage_id: None,
        kanban_state: None,
    };
    let task = state.db.update_task_locally(input).map_err(|e| e.to_string())?;

    let sync = state.sync_engine.clone();
    tokio::spawn(async move {
        let _ = sync.sync_all().await;
    });

    Ok(task)
}

// ==========================================
// SYNC COMMANDS
// ==========================================

#[tauri::command]
pub async fn sync_all(state: State<'_, AppState>) -> Result<SyncStatusInfo, String> {
    state.sync_engine.sync_all().await
}

#[tauri::command]
pub async fn get_sync_status(state: State<'_, AppState>) -> Result<SyncStatusInfo, String> {
    Ok(state.sync_engine.get_sync_status())
}
