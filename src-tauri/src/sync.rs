use chrono::Utc;
use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use crate::db::Database;
use crate::models::{OdooInstance, SyncStatusInfo};
use crate::odoo::{OdooClient, OdooError};

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::CreateInstanceInput;

    #[test]
    fn failed_sync_remains_visible_until_a_successful_retry() {
        let db = Database::new_in_memory().unwrap();
        let instance = db.create_instance(CreateInstanceInput {
            name: "Broken connection".into(), url: "invalid URL".into(), db: "test".into(),
            username: "test".into(), api_key: "test".into(), color: None,
        }).unwrap();
        let engine = SyncEngine::new(db.clone());
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let error = runtime.block_on(engine.sync_all()).unwrap_err();
        assert!(error.contains("Broken connection"));
        let status = engine.get_sync_status();
        assert_eq!(status.message.as_deref(), Some(error.as_str()));
        assert!(!status.online);
        assert!(!status.is_syncing);
        assert!(status.last_synced_at.is_none());
        db.delete_instance(&instance.id).unwrap();
        let status = runtime.block_on(engine.sync_all()).unwrap();
        assert!(status.message.is_none());
        assert!(!status.is_syncing);
    }
}

pub struct SyncEngine {
    db: Database,
    client: OdooClient,
    is_syncing: Arc<AtomicBool>,
    sync_lock: tokio::sync::Mutex<()>,
    last_error: Mutex<Option<String>>,
}

impl SyncEngine {
    pub fn new(db: Database) -> Self {
        Self {
            db,
            client: OdooClient::new(),
            is_syncing: Arc::new(AtomicBool::new(false)),
            sync_lock: tokio::sync::Mutex::new(()),
            last_error: Mutex::new(None),
        }
    }

    pub fn is_syncing(&self) -> bool {
        self.is_syncing.load(Ordering::SeqCst)
    }

    pub fn get_sync_status(&self) -> SyncStatusInfo {
        let pending = self.db.count_pending_mutations().unwrap_or(0);
        let instances = self.db.get_instances().unwrap_or_default();
        let last_sync = instances
            .iter()
            .filter_map(|i| i.last_sync_at.clone())
            .max();
        let message = self.last_error.lock().unwrap().clone();

        SyncStatusInfo {
            pending_mutations: pending,
            last_synced_at: last_sync,
            is_syncing: self.is_syncing(),
            online: message.is_none(),
            message,
        }
    }

    /// Full bidirectional synchronization across all active instances
    pub async fn sync_all(&self) -> Result<SyncStatusInfo, String> {
        // A manual request waits for an active run, then processes any new edits.
        let _guard = self.sync_lock.lock().await;
        self.is_syncing.store(true, Ordering::SeqCst);

        let result = self.execute_sync_internal().await;
        *self.last_error.lock().unwrap() = result.as_ref().err().cloned();
        self.is_syncing.store(false, Ordering::SeqCst);

        match result {
            Ok(_) => Ok(self.get_sync_status()),
            Err(e) => Err(e),
        }
    }

    async fn execute_sync_internal(&self) -> Result<(), String> {
        let instances = self.db.get_instances().map_err(|e| e.to_string())?;
        let active_instances: Vec<OdooInstance> = instances.into_iter().filter(|i| i.active).collect();

        if active_instances.is_empty() {
            return Ok(());
        }

        let mut errors = Vec::new();
        for instance in &active_instances {
            // 1. Process Outbox (Push local mutations)
            if let Err(e) = self.push_mutations_for_instance(instance).await {
                eprintln!("Error pushing mutations to instance {}: {}", instance.name, e);
                errors.push(format!("{} — sending changes: {}", instance.name, e));
            }

            // 2. Process Inbound (Pull remote changes)
            if let Err(e) = self.pull_instance_data(instance).await {
                eprintln!("Error pulling data from instance {}: {}", instance.name, e);
                errors.push(format!("{} — downloading changes: {}", instance.name, e));
            } else {
                let now = Utc::now().to_rfc3339();
                self.db.update_instance_last_sync(&instance.id, &now).map_err(|e| e.to_string())?;
            }
        }

        if errors.is_empty() { Ok(()) } else { Err(errors.join("\n")) }
    }

    /// Pushes local pending mutations (creations, updates, deletions) to Odoo
    async fn push_mutations_for_instance(&self, instance: &OdooInstance) -> Result<(), OdooError> {
        let uid = self.client.authenticate(instance).await?;
        let mutations = self.db.get_pending_mutations().map_err(|e| OdooError::Odoo(e.to_string()))?;
        let instance_mutations: Vec<_> = mutations
            .into_iter()
            .filter(|m| m.instance_id == instance.id)
            .collect();

        let mut errors = Vec::new();
        for m in instance_mutations {
            let payload: Value = serde_json::from_str(&m.payload_json).unwrap_or(Value::Null);

            match m.operation.as_str() {
                "create" => {
                    let task_opt = self.db.get_task_by_id(&m.entity_id).map_err(|e| OdooError::Odoo(e.to_string()))?;
                    if let Some(task) = task_opt {
                        let mut odoo_vals = serde_json::Map::new();
                        odoo_vals.insert("name".to_string(), Value::String(task.title.clone()));
                        odoo_vals.insert("description".to_string(), Value::String(task.description.clone()));
                        odoo_vals.insert("priority".to_string(), Value::String(task.priority.clone()));
                        odoo_vals.insert("user_ids".to_string(), serde_json::json!([[6, 0, [uid]]]));

                        if let Some(deadline) = task.date_deadline {
                            odoo_vals.insert("date_deadline".to_string(), Value::String(deadline));
                        }

                        // Resolve remote project_id if assigned
                        if let Some(ref pid) = task.project_id {
                            if let Ok(projects) = self.db.get_projects(Some(&instance.id)) {
                                if let Some(p) = projects.into_iter().find(|p| &p.id == pid) {
                                    if let Some(oid) = p.odoo_id {
                                        odoo_vals.insert("project_id".to_string(), serde_json::json!(oid));
                                    }
                                }
                            }
                        }

                        match self.client.create_record(instance, "project.task", Value::Object(odoo_vals)).await {
                            Ok(new_odoo_id) => {
                                let now = Utc::now().to_rfc3339();
                                self.db.update_task_odoo_id(&task.id, new_odoo_id, Some(&now)).map_err(|e| OdooError::Odoo(e.to_string()))?;
                                self.db.mark_mutation_completed(m.id).map_err(|e| OdooError::Odoo(e.to_string()))?;
                            }
                            Err(e) => {
                                let _ = self.db.mark_mutation_failed(m.id, &e.to_string());
                                errors.push(e.to_string());
                            }
                        }
                    } else {
                        // Task was deleted before it was pushed
                        self.db.mark_mutation_completed(m.id).map_err(|e| OdooError::Odoo(e.to_string()))?;
                    }
                }
                "update" => {
                    let task_opt = self.db.get_task_by_id(&m.entity_id).map_err(|e| OdooError::Odoo(e.to_string()))?;
                    if let Some(task) = task_opt {
                        if let Some(odoo_id) = task.odoo_id {
                            let mut odoo_vals = serde_json::Map::new();

                            if let Some(title) = payload.get("title").and_then(|v| v.as_str()) {
                                odoo_vals.insert("name".to_string(), Value::String(title.to_string()));
                            }
                            if let Some(desc) = payload.get("description").and_then(|v| v.as_str()) {
                                odoo_vals.insert("description".to_string(), Value::String(desc.to_string()));
                            }
                            if let Some(priority) = payload.get("priority").and_then(|v| v.as_str()) {
                                odoo_vals.insert("priority".to_string(), Value::String(priority.to_string()));
                            }
                            if let Some(deadline) = payload.get("date_deadline") {
                                if deadline.is_null() {
                                    odoo_vals.insert("date_deadline".to_string(), Value::Bool(false));
                                } else if let Some(d_str) = deadline.as_str() {
                                    odoo_vals.insert("date_deadline".to_string(), Value::String(d_str.to_string()));
                                }
                            }

                            // If completion status changed
                            if let Some(completed) = payload.get("is_completed").and_then(|v| v.as_bool()) {
                                if completed {
                                    odoo_vals.insert("state".to_string(), Value::String("1_done".to_string()));
                                } else {
                                    odoo_vals.insert("state".to_string(), Value::String("01_in_progress".to_string()));
                                }
                            }

                            match self.client.write_record(instance, "project.task", odoo_id, Value::Object(odoo_vals)).await {
                                Ok(_) => {
                                    self.db.mark_mutation_completed(m.id).map_err(|e| OdooError::Odoo(e.to_string()))?;
                                }
                                Err(e) => {
                                    let _ = self.db.mark_mutation_failed(m.id, &e.to_string());
                                    errors.push(e.to_string());
                                }
                            }
                        }
                    } else {
                        self.db.mark_mutation_completed(m.id).map_err(|e| OdooError::Odoo(e.to_string()))?;
                    }
                }
                "delete" => {
                    if let Some(odoo_id) = payload.get("odoo_id").and_then(|v| v.as_i64()) {
                        match self.client.unlink_record(instance, "project.task", odoo_id).await {
                            Ok(_) => {
                                self.db.mark_mutation_completed(m.id).map_err(|e| OdooError::Odoo(e.to_string()))?;
                            }
                            Err(e) => {
                                let _ = self.db.mark_mutation_failed(m.id, &e.to_string());
                                errors.push(e.to_string());
                            }
                        }
                    } else {
                        self.db.mark_mutation_completed(m.id).map_err(|e| OdooError::Odoo(e.to_string()))?;
                    }
                }
                _ => {}
            }
        }

        if errors.is_empty() { Ok(()) } else { Err(OdooError::Odoo(errors.join("\n"))) }
    }

    /// Pulls projects, stages, and tasks from Odoo
    async fn pull_instance_data(&self, instance: &OdooInstance) -> Result<(), OdooError> {
        // 1. Fetch Projects
        let project_fields = ["id", "name", "write_date"];
        let projects_raw = self.client.search_read(
            instance,
            "project.project",
            serde_json::json!([["active", "=", true]]),
            &project_fields,
            Some(200),
        ).await?;

        for p in projects_raw {
            if let (Some(oid), Some(name)) = (p.get("id").and_then(|v| v.as_i64()), p.get("name").and_then(|v| v.as_str())) {
                let wdate = p.get("write_date").and_then(|v| v.as_str());
                let _ = self.db.upsert_odoo_project(&instance.id, oid, name, wdate);
            }
        }

        // 2. Fetch Stages
        let stage_fields = ["id", "name", "sequence", "fold"];
        if let Ok(stages_raw) = self.client.search_read(
            instance,
            "project.task.type",
            serde_json::json!([]),
            &stage_fields,
            Some(100),
        ).await {
            for s in stages_raw {
                if let (Some(oid), Some(name)) = (s.get("id").and_then(|v| v.as_i64()), s.get("name").and_then(|v| v.as_str())) {
                    let seq = s.get("sequence").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
                    let fold = s.get("fold").and_then(|v| v.as_bool()).unwrap_or(false);
                    let _ = self.db.upsert_odoo_stage(&instance.id, oid, name, seq, fold);
                }
            }
        }

        // 3. Fetch Tasks
        let task_fields = [
            "id",
            "name",
            "description",
            "priority",
            "date_deadline",
            "state",
            "project_id",
            "stage_id",
            "write_date",
        ];

        let uid = self.client.authenticate(instance).await?;
        // Read assigned active tasks, including completed ones so locally cached tasks
        // are updated when they are completed in Odoo. The UI hides completed tasks.
        let tasks_raw = self.client.search_read(
            instance,
            "project.task",
            serde_json::json!([["user_ids", "in", [uid]]]),
            &task_fields,
            None,
        ).await?;

        let assigned_ids: Vec<i64> = tasks_raw.iter()
            .filter_map(|task| task.get("id").and_then(Value::as_i64))
            .collect();

        for t in tasks_raw {
            if let (Some(oid), Some(name)) = (t.get("id").and_then(|v| v.as_i64()), t.get("name").and_then(|v| v.as_str())) {
                let desc = t.get("description")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let priority = t.get("priority")
                    .and_then(|v| v.as_str())
                    .unwrap_or("0");
                let date_deadline = t.get("date_deadline").and_then(|v| v.as_str());
                let state = t.get("state").and_then(|v| v.as_str()).unwrap_or("01_in_progress");
                let write_date = t.get("write_date").and_then(|v| v.as_str());

                let project_odoo_id = t.get("project_id").and_then(|v| {
                    if let Some(arr) = v.as_array() {
                        arr.first().and_then(|id| id.as_i64())
                    } else {
                        v.as_i64()
                    }
                });

                let stage_odoo_id = t.get("stage_id").and_then(|v| {
                    if let Some(arr) = v.as_array() {
                        arr.first().and_then(|id| id.as_i64())
                    } else {
                        v.as_i64()
                    }
                });

                let is_completed = state == "1_done";
                // Keep the existing local schema; only the Odoo API uses `state`.
                let kanban_state = if is_completed { "done" } else { "normal" };

                self.db.upsert_odoo_task(
                    &instance.id,
                    oid,
                    name,
                    desc,
                    is_completed,
                    priority,
                    date_deadline,
                    kanban_state,
                    project_odoo_id,
                    stage_odoo_id,
                    write_date,
                ).map_err(|e| OdooError::Odoo(e.to_string()))?;
            }
        }

        self.db.refresh_task_assignments(&instance.id, &assigned_ids)
            .map_err(|e| OdooError::Odoo(e.to_string()))?;
        Ok(())
    }
}
