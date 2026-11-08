use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension, Result};
use uuid::Uuid;

use crate::models::{
    CreateInstanceInput, CreateTaskInput, OdooInstance, Project, Stage, SyncQueueItem, Task,
    UpdateInstanceInput, UpdateTaskInput,
};

#[derive(Clone)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.init_schema()?;
        Ok(db)
    }

    #[cfg(test)]
    pub fn new_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.init_schema()?;
        Ok(db)
    }

    fn init_schema(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS instances (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                url TEXT NOT NULL,
                db TEXT NOT NULL,
                username TEXT NOT NULL,
                api_key TEXT NOT NULL,
                color TEXT NOT NULL,
                last_sync_at TEXT,
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                instance_id TEXT NOT NULL,
                odoo_id INTEGER,
                name TEXT NOT NULL,
                color TEXT,
                sync_status TEXT NOT NULL DEFAULT 'synced',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                odoo_write_date TEXT,
                FOREIGN KEY (instance_id) REFERENCES instances(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS stages (
                id TEXT PRIMARY KEY,
                instance_id TEXT NOT NULL,
                odoo_id INTEGER,
                project_id TEXT,
                name TEXT NOT NULL,
                sequence INTEGER NOT NULL DEFAULT 0,
                is_closed INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (instance_id) REFERENCES instances(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                instance_id TEXT NOT NULL,
                project_id TEXT,
                stage_id TEXT,
                odoo_id INTEGER,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                is_completed INTEGER NOT NULL DEFAULT 0,
                priority TEXT NOT NULL DEFAULT '0',
                date_deadline TEXT,
                kanban_state TEXT NOT NULL DEFAULT 'normal',
                sync_status TEXT NOT NULL DEFAULT 'synced',
                sync_error TEXT,
                local_updated_at TEXT NOT NULL,
                odoo_write_date TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (instance_id) REFERENCES instances(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS sync_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                instance_id TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                operation TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                retry_count INTEGER NOT NULL DEFAULT 0,
                last_error TEXT,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_tasks_instance ON tasks(instance_id);
            CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
            CREATE INDEX IF NOT EXISTS idx_tasks_sync_status ON tasks(sync_status);
            CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
            "#,
        )?;

        // Existing cached remote tasks remain hidden until their assignment is verified.
        let has_assignment: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM pragma_table_info('tasks') WHERE name = 'assigned_to_me')",
            [], |row| row.get(0),
        )?;
        if !has_assignment {
            conn.execute("ALTER TABLE tasks ADD COLUMN assigned_to_me INTEGER NOT NULL DEFAULT 0", [])?;
        }

        Ok(())
    }

    // ==========================================
    // INSTANCE MANAGEMENT
    // ==========================================

    pub fn get_instances(&self) -> Result<Vec<OdooInstance>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, url, db, username, api_key, color, last_sync_at, active, created_at, updated_at 
             FROM instances ORDER BY created_at ASC"
        )?;

        let iter = stmt.query_map([], |row| {
            let active_int: i32 = row.get(8)?;
            Ok(OdooInstance {
                id: row.get(0)?,
                name: row.get(1)?,
                url: row.get(2)?,
                db: row.get(3)?,
                username: row.get(4)?,
                api_key: row.get(5)?,
                color: row.get(6)?,
                last_sync_at: row.get(7)?,
                active: active_int == 1,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })?;

        let mut instances = Vec::new();
        for instance in iter {
            instances.push(instance?);
        }
        Ok(instances)
    }

    pub fn get_instance_by_id(&self, id: &str) -> Result<Option<OdooInstance>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, url, db, username, api_key, color, last_sync_at, active, created_at, updated_at 
             FROM instances WHERE id = ?1"
        )?;

        let mut iter = stmt.query_map(params![id], |row| {
            let active_int: i32 = row.get(8)?;
            Ok(OdooInstance {
                id: row.get(0)?,
                name: row.get(1)?,
                url: row.get(2)?,
                db: row.get(3)?,
                username: row.get(4)?,
                api_key: row.get(5)?,
                color: row.get(6)?,
                last_sync_at: row.get(7)?,
                active: active_int == 1,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })?;

        if let Some(instance) = iter.next() {
            Ok(Some(instance?))
        } else {
            Ok(None)
        }
    }

    pub fn create_instance(&self, input: CreateInstanceInput) -> Result<OdooInstance> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        let id = Uuid::new_v4().to_string();
        let color = input.color.unwrap_or_else(|| "#3B82F6".to_string());

        conn.execute(
            "INSERT INTO instances (id, name, url, db, username, api_key, color, last_sync_at, active, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, 1, ?8, ?8)",
            params![id, input.name, input.url.trim_end_matches('/'), input.db, input.username, input.api_key, color, now],
        )?;

        Ok(OdooInstance {
            id,
            name: input.name,
            url: input.url.trim_end_matches('/').to_string(),
            db: input.db,
            username: input.username,
            api_key: input.api_key,
            color,
            last_sync_at: None,
            active: true,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn update_instance(&self, input: UpdateInstanceInput) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        let active_int = if input.active { 1 } else { 0 };

        conn.execute(
            "UPDATE instances SET name = ?1, url = ?2, db = ?3, username = ?4, api_key = ?5, color = ?6, active = ?7, updated_at = ?8
             WHERE id = ?9",
            params![
                input.name,
                input.url.trim_end_matches('/'),
                input.db,
                input.username,
                input.api_key,
                input.color,
                active_int,
                now,
                input.id
            ],
        )?;

        Ok(())
    }

    pub fn delete_instance(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM sync_queue WHERE instance_id = ?1", params![id])?;
        conn.execute("DELETE FROM tasks WHERE instance_id = ?1", params![id])?;
        conn.execute("DELETE FROM stages WHERE instance_id = ?1", params![id])?;
        conn.execute("DELETE FROM projects WHERE instance_id = ?1", params![id])?;
        conn.execute("DELETE FROM instances WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn update_instance_last_sync(&self, id: &str, sync_time: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE instances SET last_sync_at = ?1 WHERE id = ?2",
            params![sync_time, id],
        )?;
        Ok(())
    }

    // ==========================================
    // PROJECTS & STAGES
    // ==========================================

    pub fn get_projects(&self, instance_id: Option<&str>) -> Result<Vec<Project>> {
        let conn = self.conn.lock().unwrap();
        let mut query = "SELECT id, instance_id, odoo_id, name, color, sync_status, created_at, updated_at, odoo_write_date FROM projects".to_string();
        if instance_id.is_some() {
            query.push_str(" WHERE instance_id = ?1");
        }
        query.push_str(" ORDER BY name ASC");

        let mut stmt = conn.prepare(&query)?;
        let rows = if let Some(iid) = instance_id {
            stmt.query_map(params![iid], Self::map_project_row)?
        } else {
            stmt.query_map([], Self::map_project_row)?
        };

        let mut projects = Vec::new();
        for p in rows {
            projects.push(p?);
        }
        Ok(projects)
    }

    fn map_project_row(row: &rusqlite::Row) -> Result<Project> {
        Ok(Project {
            id: row.get(0)?,
            instance_id: row.get(1)?,
            odoo_id: row.get(2)?,
            name: row.get(3)?,
            color: row.get(4)?,
            sync_status: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
            odoo_write_date: row.get(8)?,
        })
    }

    pub fn upsert_odoo_project(
        &self,
        instance_id: &str,
        odoo_id: i64,
        name: &str,
        odoo_write_date: Option<&str>,
    ) -> Result<String> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();

        let mut stmt = conn.prepare(
            "SELECT id FROM projects WHERE instance_id = ?1 AND odoo_id = ?2",
        )?;
        let existing_id: Option<String> = stmt
            .query_row(params![instance_id, odoo_id], |row| row.get(0))
            .ok();

        if let Some(id) = existing_id {
            conn.execute(
                "UPDATE projects SET name = ?1, odoo_write_date = ?2, updated_at = ?3, sync_status = 'synced' WHERE id = ?4",
                params![name, odoo_write_date, now, id],
            )?;
            Ok(id)
        } else {
            let new_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO projects (id, instance_id, odoo_id, name, sync_status, created_at, updated_at, odoo_write_date)
                 VALUES (?1, ?2, ?3, ?4, 'synced', ?5, ?5, ?6)",
                params![new_id, instance_id, odoo_id, name, now, odoo_write_date],
            )?;
            Ok(new_id)
        }
    }

    pub fn upsert_odoo_stage(
        &self,
        instance_id: &str,
        odoo_id: i64,
        name: &str,
        sequence: i32,
        is_closed: bool,
    ) -> Result<String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id FROM stages WHERE instance_id = ?1 AND odoo_id = ?2",
        )?;
        let existing_id: Option<String> = stmt
            .query_row(params![instance_id, odoo_id], |row| row.get(0))
            .ok();

        let is_closed_int = if is_closed { 1 } else { 0 };

        if let Some(id) = existing_id {
            conn.execute(
                "UPDATE stages SET name = ?1, sequence = ?2, is_closed = ?3 WHERE id = ?4",
                params![name, sequence, is_closed_int, id],
            )?;
            Ok(id)
        } else {
            let new_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO stages (id, instance_id, odoo_id, name, sequence, is_closed)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![new_id, instance_id, odoo_id, name, sequence, is_closed_int],
            )?;
            Ok(new_id)
        }
    }

    pub fn get_stages(&self, instance_id: Option<&str>) -> Result<Vec<Stage>> {
        let conn = self.conn.lock().unwrap();
        let mut query = "SELECT id, instance_id, odoo_id, project_id, name, sequence, is_closed FROM stages".to_string();
        if instance_id.is_some() {
            query.push_str(" WHERE instance_id = ?1");
        }
        query.push_str(" ORDER BY sequence ASC");

        let mut stmt = conn.prepare(&query)?;
        let rows = if let Some(iid) = instance_id {
            stmt.query_map(params![iid], Self::map_stage_row)?
        } else {
            stmt.query_map([], Self::map_stage_row)?
        };

        let mut stages = Vec::new();
        for s in rows {
            stages.push(s?);
        }
        Ok(stages)
    }

    fn map_stage_row(row: &rusqlite::Row) -> Result<Stage> {
        let is_closed_int: i32 = row.get(6)?;
        Ok(Stage {
            id: row.get(0)?,
            instance_id: row.get(1)?,
            odoo_id: row.get(2)?,
            project_id: row.get(3)?,
            name: row.get(4)?,
            sequence: row.get(5)?,
            is_closed: is_closed_int == 1,
        })
    }

    // ==========================================
    // TASKS (OFFLINE-FIRST CRUD)
    // ==========================================

    pub fn get_tasks(
        &self,
        instance_id: Option<&str>,
        project_id: Option<&str>,
        starred_only: bool,
        completed_only: Option<bool>,
        search_query: Option<&str>,
    ) -> Result<Vec<Task>> {
        let conn = self.conn.lock().unwrap();
        let mut conditions = vec!["(odoo_id IS NULL OR assigned_to_me = 1)".to_string()];
        let mut param_values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(iid) = instance_id {
            param_values.push(Box::new(iid.to_string()));
            conditions.push(format!("instance_id = ?{}", param_values.len()));
        }

        if let Some(pid) = project_id {
            param_values.push(Box::new(pid.to_string()));
            conditions.push(format!("project_id = ?{}", param_values.len()));
        }

        if starred_only {
            conditions.push("priority = '1'".to_string());
        }

        if let Some(completed) = completed_only {
            let c_val = if completed { 1 } else { 0 };
            conditions.push(format!("is_completed = {}", c_val));
        }

        if let Some(q) = search_query {
            if !q.trim().is_empty() {
                let pattern = format!("%{}%", q.trim());
                param_values.push(Box::new(pattern));
                let idx = param_values.len();
                conditions.push(format!("(title LIKE ?{0} OR description LIKE ?{0})", idx));
            }
        }

        let mut query = "SELECT id, instance_id, project_id, stage_id, odoo_id, title, description,
                                is_completed, priority, date_deadline, kanban_state, sync_status,
                                sync_error, local_updated_at, odoo_write_date, created_at, updated_at
                         FROM tasks".to_string();

        if !conditions.is_empty() {
            query.push_str(" WHERE ");
            query.push_str(&conditions.join(" AND "));
        }

        query.push_str(" ORDER BY is_completed ASC, priority DESC, local_updated_at DESC");

        let mut stmt = conn.prepare(&query)?;
        let params_refs: Vec<&dyn rusqlite::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();

        let rows = stmt.query_map(params_refs.as_slice(), Self::map_task_row)?;
        let mut tasks = Vec::new();
        for t in rows {
            tasks.push(t?);
        }
        Ok(tasks)
    }

    pub fn get_task_by_id(&self, id: &str) -> Result<Option<Task>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, instance_id, project_id, stage_id, odoo_id, title, description,
                    is_completed, priority, date_deadline, kanban_state, sync_status,
                    sync_error, local_updated_at, odoo_write_date, created_at, updated_at
             FROM tasks WHERE id = ?1",
        )?;

        let mut iter = stmt.query_map(params![id], Self::map_task_row)?;
        if let Some(row) = iter.next() {
            Ok(Some(row?))
        } else {
            Ok(None)
        }
    }

    fn map_task_row(row: &rusqlite::Row) -> Result<Task> {
        let is_completed_int: i32 = row.get(7)?;
        Ok(Task {
            id: row.get(0)?,
            instance_id: row.get(1)?,
            project_id: row.get(2)?,
            stage_id: row.get(3)?,
            odoo_id: row.get(4)?,
            title: row.get(5)?,
            description: row.get(6)?,
            is_completed: is_completed_int == 1,
            priority: row.get(8)?,
            date_deadline: row.get(9)?,
            kanban_state: row.get(10)?,
            sync_status: row.get(11)?,
            sync_error: row.get(12)?,
            local_updated_at: row.get(13)?,
            odoo_write_date: row.get(14)?,
            created_at: row.get(15)?,
            updated_at: row.get(16)?,
        })
    }

    /// Creates a task locally immediately (instant offline support) and queues it for sync
    pub fn create_task_locally(&self, input: CreateTaskInput) -> Result<Task> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        let id = Uuid::new_v4().to_string();
        let priority = input.priority.unwrap_or_else(|| "0".to_string());
        let description = input.description.unwrap_or_default();

        conn.execute(
            "INSERT INTO tasks (
                id, instance_id, project_id, stage_id, odoo_id, title, description,
                is_completed, priority, date_deadline, kanban_state, sync_status,
                sync_error, local_updated_at, odoo_write_date, created_at, updated_at
             ) VALUES (
                ?1, ?2, ?3, NULL, NULL, ?4, ?5,
                0, ?6, ?7, 'normal', 'pending_create',
                NULL, ?8, NULL, ?8, ?8
             )",
            params![
                id,
                input.instance_id,
                input.project_id,
                input.title,
                description,
                priority,
                input.date_deadline,
                now
            ],
        )?;

        // Payload for synchronization queue
        let payload = serde_json::json!({
            "title": input.title,
            "description": description,
            "priority": priority,
            "date_deadline": input.date_deadline,
            "project_id": input.project_id
        });

        conn.execute(
            "INSERT INTO sync_queue (instance_id, entity_type, entity_id, operation, payload_json, status, retry_count, created_at)
             VALUES (?1, 'task', ?2, 'create', ?3, 'pending', 0, ?4)",
            params![input.instance_id, id, payload.to_string(), now],
        )?;

        Ok(Task {
            id,
            instance_id: input.instance_id,
            project_id: input.project_id,
            stage_id: None,
            odoo_id: None,
            title: input.title,
            description,
            is_completed: false,
            priority,
            date_deadline: input.date_deadline,
            kanban_state: "normal".to_string(),
            sync_status: "pending_create".to_string(),
            sync_error: None,
            local_updated_at: now.clone(),
            odoo_write_date: None,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    /// Updates a task locally and queues the changes for outbound sync
    pub fn update_task_locally(&self, input: UpdateTaskInput) -> Result<Task> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();

        // 1. Fetch current task
        let mut stmt = conn.prepare(
            "SELECT id, instance_id, project_id, stage_id, odoo_id, title, description,
                    is_completed, priority, date_deadline, kanban_state, sync_status,
                    sync_error, local_updated_at, odoo_write_date, created_at, updated_at
             FROM tasks WHERE id = ?1",
        )?;
        let mut iter = stmt.query_map(params![input.id], Self::map_task_row)?;
        let current = iter.next().ok_or_else(|| {
            rusqlite::Error::QueryReturnedNoRows
        })??;

        // 2. Compute new values
        let new_title = input.title.unwrap_or(current.title);
        let new_description = input.description.unwrap_or(current.description);
        let new_completed = input.is_completed.unwrap_or(current.is_completed);
        let new_priority = input.priority.unwrap_or(current.priority);
        let new_deadline = match input.date_deadline {
            Some(opt) => opt,
            None => current.date_deadline,
        };
        let new_project = match input.project_id {
            Some(opt) => opt,
            None => current.project_id,
        };
        let new_stage = match input.stage_id {
            Some(opt) => opt,
            None => current.stage_id,
        };
        let new_kanban = input.kanban_state.unwrap_or(current.kanban_state);

        // Keep 'pending_create' if it hasn't synced yet; otherwise 'pending_update'
        let new_sync_status = if current.sync_status == "pending_create" {
            "pending_create"
        } else {
            "pending_update"
        };

        let is_completed_int = if new_completed { 1 } else { 0 };

        conn.execute(
            "UPDATE tasks SET
                title = ?1,
                description = ?2,
                is_completed = ?3,
                priority = ?4,
                date_deadline = ?5,
                project_id = ?6,
                stage_id = ?7,
                kanban_state = ?8,
                sync_status = ?9,
                local_updated_at = ?10,
                updated_at = ?10
             WHERE id = ?11",
            params![
                new_title,
                new_description,
                is_completed_int,
                new_priority,
                new_deadline,
                new_project,
                new_stage,
                new_kanban,
                new_sync_status,
                now,
                input.id
            ],
        )?;

        // Payload for mutation queue
        let payload = serde_json::json!({
            "title": new_title,
            "description": new_description,
            "is_completed": new_completed,
            "priority": new_priority,
            "date_deadline": new_deadline,
            "project_id": new_project,
            "stage_id": new_stage,
            "kanban_state": new_kanban
        });

        conn.execute(
            "INSERT INTO sync_queue (instance_id, entity_type, entity_id, operation, payload_json, status, retry_count, created_at)
             VALUES (?1, 'task', ?2, 'update', ?3, 'pending', 0, ?4)",
            params![current.instance_id, input.id, payload.to_string(), now],
        )?;

        Ok(Task {
            id: current.id,
            instance_id: current.instance_id,
            project_id: new_project,
            stage_id: new_stage,
            odoo_id: current.odoo_id,
            title: new_title,
            description: new_description,
            is_completed: new_completed,
            priority: new_priority,
            date_deadline: new_deadline,
            kanban_state: new_kanban,
            sync_status: new_sync_status.to_string(),
            sync_error: None,
            local_updated_at: now.clone(),
            odoo_write_date: current.odoo_write_date,
            created_at: current.created_at,
            updated_at: now,
        })
    }

    /// Deletes a task locally. If it exists in Odoo, queues a delete mutation; otherwise deletes directly.
    pub fn delete_task_locally(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();

        let mut stmt = conn.prepare(
            "SELECT instance_id, odoo_id, sync_status FROM tasks WHERE id = ?1",
        )?;
        let row_opt = stmt.query_row(params![id], |row| {
            let iid: String = row.get(0)?;
            let odoo_id: Option<i64> = row.get(1)?;
            let sync_status: String = row.get(2)?;
            Ok((iid, odoo_id, sync_status))
        }).ok();

        if let Some((instance_id, odoo_id, _sync_status)) = row_opt {
            if let Some(rem_id) = odoo_id {
                // If it was already pushed to Odoo, queue unlink mutation and soft/hard delete
                let payload = serde_json::json!({
                    "odoo_id": rem_id
                });
                conn.execute(
                    "INSERT INTO sync_queue (instance_id, entity_type, entity_id, operation, payload_json, status, retry_count, created_at)
                     VALUES (?1, 'task', ?2, 'delete', ?3, 'pending', 0, ?4)",
                    params![instance_id, id, payload.to_string(), now],
                )?;
                conn.execute("DELETE FROM tasks WHERE id = ?1", params![id])?;
            } else {
                // Created offline and never synced to Odoo: remove directly and clean up queue
                conn.execute("DELETE FROM sync_queue WHERE entity_id = ?1", params![id])?;
                conn.execute("DELETE FROM tasks WHERE id = ?1", params![id])?;
            }
        }

        Ok(())
    }

    // ==========================================
    // SYNC HELPERS (PULL & PUSH)
    // ==========================================

    pub fn get_pending_mutations(&self) -> Result<Vec<SyncQueueItem>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, instance_id, entity_type, entity_id, operation, payload_json, status, retry_count, last_error, created_at
             FROM sync_queue WHERE status = 'pending' ORDER BY id ASC",
        )?;

        let iter = stmt.query_map([], |row| {
            Ok(SyncQueueItem {
                id: row.get(0)?,
                instance_id: row.get(1)?,
                entity_type: row.get(2)?,
                entity_id: row.get(3)?,
                operation: row.get(4)?,
                payload_json: row.get(5)?,
                status: row.get(6)?,
                retry_count: row.get(7)?,
                last_error: row.get(8)?,
                created_at: row.get(9)?,
            })
        })?;

        let mut items = Vec::new();
        for item in iter {
            items.push(item?);
        }
        Ok(items)
    }

    pub fn mark_mutation_completed(&self, queue_id: i64) -> Result<()> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        let entity_id: Option<String> = tx.query_row(
            "SELECT entity_id FROM sync_queue WHERE id = ?1", params![queue_id], |row| row.get(0),
        ).optional()?;
        tx.execute(
            "DELETE FROM sync_queue WHERE id = ?1",
            params![queue_id],
        )?;
        if let Some(id) = entity_id {
            tx.execute(
                "UPDATE tasks SET sync_status = 'synced', sync_error = NULL
                 WHERE id = ?1 AND odoo_id IS NOT NULL
                 AND NOT EXISTS (SELECT 1 FROM sync_queue WHERE entity_id = ?1 AND status = 'pending')",
                params![id],
            )?;
        }
        tx.commit()
    }

    pub fn mark_mutation_failed(&self, queue_id: i64, error: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE sync_queue SET retry_count = retry_count + 1, last_error = ?1 WHERE id = ?2",
            params![error, queue_id],
        )?;
        Ok(())
    }

    pub fn update_task_odoo_id(&self, local_id: &str, odoo_id: i64, write_date: Option<&str>) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE tasks SET odoo_id = ?1, odoo_write_date = ?2, sync_status = 'synced', sync_error = NULL, assigned_to_me = 1 WHERE id = ?3",
            params![odoo_id, write_date, local_id],
        )?;
        Ok(())
    }

    pub fn count_pending_mutations(&self) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sync_queue WHERE status = 'pending'",
            [],
            |r| r.get(0),
        )?;
        Ok(count)
    }

    /// Replace the verified assignment snapshot without deleting tasks or pending edits.
    pub fn refresh_task_assignments(&self, instance_id: &str, odoo_ids: &[i64]) -> Result<()> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        tx.execute("UPDATE tasks SET assigned_to_me = 0 WHERE instance_id = ?1 AND odoo_id IS NOT NULL", params![instance_id])?;
        for odoo_id in odoo_ids {
            tx.execute("UPDATE tasks SET assigned_to_me = 1 WHERE instance_id = ?1 AND odoo_id = ?2", params![instance_id, odoo_id])?;
        }
        tx.commit()
    }

    /// Pull sync: Upserts a task coming from Odoo without clobbering pending local edits
    pub fn upsert_odoo_task(
        &self,
        instance_id: &str,
        odoo_id: i64,
        title: &str,
        description: &str,
        is_completed: bool,
        priority: &str,
        date_deadline: Option<&str>,
        kanban_state: &str,
        project_odoo_id: Option<i64>,
        stage_odoo_id: Option<i64>,
        odoo_write_date: Option<&str>,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().to_rfc3339();

        // Find local project id if project_odoo_id is provided
        let local_project_id: Option<String> = if let Some(p_oid) = project_odoo_id {
            conn.query_row(
                "SELECT id FROM projects WHERE instance_id = ?1 AND odoo_id = ?2",
                params![instance_id, p_oid],
                |r| r.get(0),
            ).ok()
        } else {
            None
        };

        // Find local stage id if stage_odoo_id is provided
        let local_stage_id: Option<String> = if let Some(s_oid) = stage_odoo_id {
            conn.query_row(
                "SELECT id FROM stages WHERE instance_id = ?1 AND odoo_id = ?2",
                params![instance_id, s_oid],
                |r| r.get(0),
            ).ok()
        } else {
            None
        };

        // Check if task exists locally
        let existing = conn.query_row(
            "SELECT id, sync_status FROM tasks WHERE instance_id = ?1 AND odoo_id = ?2",
            params![instance_id, odoo_id],
            |r| {
                let id: String = r.get(0)?;
                let status: String = r.get(1)?;
                Ok((id, status))
            },
        ).ok();

        let is_completed_int = if is_completed { 1 } else { 0 };

        if let Some((local_id, sync_status)) = existing {
            // If the local task has pending local edits, don't clobber them!
            let has_pending: bool = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM sync_queue WHERE entity_id = ?1 AND status = 'pending')",
                params![local_id], |row| row.get(0),
            )?;
            if has_pending || sync_status == "pending_create" {
                // Keep local changes, but record the remote write_date
                conn.execute(
                    "UPDATE tasks SET odoo_write_date = ?1 WHERE id = ?2",
                    params![odoo_write_date, local_id],
                )?;
            } else {
                // Safe to update with remote changes
                conn.execute(
                    "UPDATE tasks SET
                        title = ?1,
                        description = ?2,
                        is_completed = ?3,
                        priority = ?4,
                        date_deadline = ?5,
                        kanban_state = ?6,
                        project_id = ?7,
                        stage_id = ?8,
                        sync_status = 'synced',
                        sync_error = NULL,
                        odoo_write_date = ?9,
                        updated_at = ?10
                     WHERE id = ?11",
                    params![
                        title,
                        description,
                        is_completed_int,
                        priority,
                        date_deadline,
                        kanban_state,
                        local_project_id,
                        local_stage_id,
                        odoo_write_date,
                        now,
                        local_id
                    ],
                )?;
            }
        } else {
            // New task from Odoo: insert locally as synced
            let new_id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO tasks (
                    id, instance_id, project_id, stage_id, odoo_id, title, description,
                    is_completed, priority, date_deadline, kanban_state, sync_status,
                    sync_error, local_updated_at, odoo_write_date, created_at, updated_at
                 ) VALUES (
                    ?1, ?2, ?3, ?4, ?5, ?6, ?7,
                    ?8, ?9, ?10, ?11, 'synced',
                    NULL, ?12, ?13, ?12, ?12
                 )",
                params![
                    new_id,
                    instance_id,
                    local_project_id,
                    local_stage_id,
                    odoo_id,
                    title,
                    description,
                    is_completed_int,
                    priority,
                    date_deadline,
                    kanban_state,
                    now,
                    odoo_write_date
                ],
            )?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn completed_outbox_unblocks_remote_updates_without_losing_newer_edits() {
        let db = Database::new_in_memory().unwrap();
        let instance = db.create_instance(CreateInstanceInput {
            name: "Sync test".into(), url: "https://example.com".into(), db: "test".into(),
            username: "test".into(), api_key: "test".into(), color: None,
        }).unwrap();
        let task = db.create_task_locally(CreateTaskInput {
            instance_id: instance.id.clone(), project_id: None, title: "Task".into(),
            description: None, priority: None, date_deadline: None,
        }).unwrap();
        db.update_task_odoo_id(&task.id, 42, None).unwrap();
        db.mark_mutation_completed(db.get_pending_mutations().unwrap()[0].id).unwrap();
        for description in ["First edit", "Newer edit"] {
            let mut input: UpdateTaskInput = serde_json::from_value(serde_json::json!({"id":task.id})).unwrap();
            input.description = Some(description.into());
            db.update_task_locally(input).unwrap();
        }
        let queue = db.get_pending_mutations().unwrap();
        db.mark_mutation_completed(queue[0].id).unwrap();
        db.upsert_odoo_task(&instance.id, 42, "Remote", "First edit", false, "0", None, "normal", None, None, None).unwrap();
        assert_eq!(db.get_task_by_id(&task.id).unwrap().unwrap().description, "Newer edit");
        db.mark_mutation_completed(queue[1].id).unwrap();
        assert_eq!(db.get_task_by_id(&task.id).unwrap().unwrap().sync_status, "synced");
        // Recover the stale flags produced by previous application versions.
        db.conn.lock().unwrap().execute("UPDATE tasks SET sync_status = 'pending_update' WHERE id = ?1", params![task.id]).unwrap();
        db.upsert_odoo_task(&instance.id, 42, "Remote", "Downloaded edit", false, "0", None, "normal", None, None, None).unwrap();
        let refreshed = db.get_task_by_id(&task.id).unwrap().unwrap();
        assert_eq!(refreshed.description, "Downloaded edit");
        assert_eq!(refreshed.sync_status, "synced");
    }

    #[test]
    fn image_notes_survive_restart_and_remain_in_sync_queue() {
        let path = std::env::temp_dir().join(format!("odoo-notes-{}.db", Uuid::new_v4()));
        let html = r#"<p><strong>Screenshot</strong></p><ul><li>Review</li></ul><p><img src="data:image/png;base64,iVBORw0KGgo=" data-file-name="clipboard.png"></p>"#;
        let task_id;
        {
            let db = Database::new(path.clone()).unwrap();
            let instance = db.create_instance(CreateInstanceInput {
                name: "Image test".into(), url: "https://example.com".into(),
                db: "test".into(), username: "test".into(), api_key: "test".into(), color: None,
            }).unwrap();
            let task = db.create_task_locally(CreateTaskInput {
                instance_id: instance.id, project_id: None, title: "Image note".into(),
                description: Some(html.into()), priority: None, date_deadline: None,
            }).unwrap();
            task_id = task.id;
        }
        {
            let db = Database::new(path.clone()).unwrap();
            assert_eq!(db.get_task_by_id(&task_id).unwrap().unwrap().description, html);
            let queue = db.get_pending_mutations().unwrap();
            let payload: serde_json::Value = serde_json::from_str(&queue[0].payload_json).unwrap();
            assert_eq!(payload["description"], html);
        }
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn assignment_snapshot_filters_cached_tasks_and_preserves_offline_work() {
        let db = Database::new_in_memory().unwrap();
        // The migration must also work when opening an already migrated database.
        db.init_schema().unwrap();
        let mut instances = Vec::new();
        for name in ["first", "second"] {
            instances.push(db.create_instance(CreateInstanceInput {
                name: name.into(), url: "https://example.com".into(), db: name.into(),
                username: name.into(), api_key: "test".into(), color: None,
            }).unwrap());
        }
        for instance in &instances {
            for id in [1, 2] {
                db.upsert_odoo_task(&instance.id, id, "Remote task", "", false,
                    "0", None, "normal", None, None, None).unwrap();
            }
        }
        // Old cached tasks have no verified assignment and must not appear.
        assert!(db.get_tasks(None, None, false, None, None).unwrap().is_empty());
        let offline = db.create_task_locally(CreateTaskInput {
            instance_id: instances[0].id.clone(), project_id: None,
            title: "Offline task".into(), description: None, priority: None, date_deadline: None,
        }).unwrap();
        db.refresh_task_assignments(&instances[0].id, &[1]).unwrap();
        db.refresh_task_assignments(&instances[1].id, &[2]).unwrap();
        let visible = db.get_tasks(None, None, false, None, None).unwrap();
        assert_eq!(visible.len(), 3);
        assert!(visible.iter().any(|t| t.id == offline.id));
        assert!(visible.iter().any(|t| t.instance_id == instances[0].id && t.odoo_id == Some(1)));
        assert!(visible.iter().any(|t| t.instance_id == instances[1].id && t.odoo_id == Some(2)));

        // Reassignment hides the old task, including when the result is empty.
        db.refresh_task_assignments(&instances[0].id, &[]).unwrap();
        assert_eq!(db.get_tasks(Some(&instances[0].id), None, false, None, None).unwrap().len(), 1);
        assert_eq!(db.get_tasks(Some(&instances[1].id), None, false, None, None).unwrap().len(), 1);
        assert_eq!(db.get_pending_mutations().unwrap().len(), 1);
        db.update_task_odoo_id(&offline.id, 3, None).unwrap();
        assert_eq!(db.get_tasks(Some(&instances[0].id), None, false, None, None).unwrap().len(), 1);
    }

    #[test]
    fn test_instance_and_task_offline_flow() {
        let db = Database::new_in_memory().unwrap();

        // 1. Create instance
        let inst = db.create_instance(CreateInstanceInput {
            name: "Odoo Test 1".to_string(),
            url: "https://test.odoo.com".to_string(),
            db: "testdb".to_string(),
            username: "admin".to_string(),
            api_key: "secret123".to_string(),
            color: Some("#10B981".to_string()),
        }).unwrap();

        assert_eq!(inst.name, "Odoo Test 1");
        assert_eq!(inst.color, "#10B981");

        // 2. Create task locally while offline
        let task = db.create_task_locally(CreateTaskInput {
            instance_id: inst.id.clone(),
            project_id: None,
            title: "Revisar facturación mensual".to_string(),
            description: Some("Notas importantes sobre los asientos contables".to_string()),
            priority: Some("1".to_string()),
            date_deadline: Some("2026-12-01".to_string()),
        }).unwrap();

        assert_eq!(task.title, "Revisar facturación mensual");
        assert_eq!(task.sync_status, "pending_create");
        assert_eq!(task.odoo_id, None);
        assert_eq!(task.priority, "1");

        // Verify outbox queue
        let queue = db.get_pending_mutations().unwrap();
        assert_eq!(queue.len(), 1);
        assert_eq!(queue[0].operation, "create");
        assert_eq!(queue[0].entity_id, task.id);

        // 3. Mark synced with Odoo ID
        db.update_task_odoo_id(&task.id, 9942, Some("2026-11-07 18:00:00")).unwrap();
        db.mark_mutation_completed(queue[0].id).unwrap();

        let updated_task = db.get_task_by_id(&task.id).unwrap().unwrap();
        assert_eq!(updated_task.odoo_id, Some(9942));
        assert_eq!(updated_task.sync_status, "synced");

        // Outbox queue should now be empty
        let queue_after = db.get_pending_mutations().unwrap();
        assert_eq!(queue_after.len(), 0);

        // 4. Update task locally (e.g. mark completed)
        let modified = db.update_task_locally(UpdateTaskInput {
            id: task.id.clone(),
            title: None,
            description: None,
            is_completed: Some(true),
            priority: None,
            date_deadline: None,
            project_id: None,
            stage_id: None,
            kanban_state: Some("done".to_string()),
        }).unwrap();

        assert!(modified.is_completed);
        assert_eq!(modified.sync_status, "pending_update");

        let queue_update = db.get_pending_mutations().unwrap();
        assert_eq!(queue_update.len(), 1);
        assert_eq!(queue_update[0].operation, "update");
    }
}

