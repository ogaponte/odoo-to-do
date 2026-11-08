pub mod commands;
pub mod db;
pub mod models;
pub mod odoo;
pub mod sync;

use std::fs;
use std::sync::Arc;
use std::time::Duration;
use tauri::Manager;

use commands::AppState;
use db::Database;
use sync::SyncEngine;

#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Set the display name before AppKit initializes, including unbundled dev runs.
    #[cfg(target_os = "macos")]
    objc2_foundation::NSProcessInfo::processInfo()
        .setProcessName(objc2_foundation::ns_string!("Odoo To Do"));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Apply macOS native vibrancy (frosted glass / translucent blur)
            #[cfg(target_os = "macos")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = apply_vibrancy(
                        &window,
                        NSVisualEffectMaterial::Sidebar,
                        Some(NSVisualEffectState::Active),
                        None,
                    );
                }
            }

            // Determine storage directory
            let app_data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::current_dir().unwrap().join(".odoo_tasks"));

            fs::create_dir_all(&app_data_dir).expect("Failed to create app data directory");
            let db_path = app_data_dir.join("odoo_tasks.db");

            println!("Initializing SQLite database at: {:?}", db_path);
            let db = Database::new(db_path).expect("Failed to initialize database");
            let sync_engine = Arc::new(SyncEngine::new(db.clone()));

            // Spawn periodic background sync (every 3 minutes)
            let background_sync = sync_engine.clone();
            tauri::async_runtime::spawn(async move {
                // Initial sync shortly after launch
                tokio::time::sleep(Duration::from_secs(3)).await;
                let _ = background_sync.sync_all().await;

                let mut interval = tokio::time::interval(Duration::from_secs(180));
                // Consume Tokio's immediate first tick; startup already synced.
                interval.tick().await;
                loop {
                    interval.tick().await;
                    let _ = background_sync.sync_all().await;
                }
            });

            app.manage(AppState {
                db,
                sync_engine,
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::drag_window,
            commands::get_instances,
            commands::add_instance,
            commands::update_instance,
            commands::delete_instance,
            commands::test_odoo_connection,
            commands::get_projects,
            commands::get_stages,
            commands::get_tasks,
            commands::get_task,
            commands::create_task,
            commands::update_task,
            commands::delete_task,
            commands::toggle_task_completion,
            commands::toggle_task_star,
            commands::sync_all,
            commands::get_sync_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running odoo-to-do application");
}
