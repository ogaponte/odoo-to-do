# Graph Report - Odoo To Do  (2026-11-07)

## Corpus Check
- 31 files · ~16,298 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: (none) 2, .xml 2, .toml 1)

## Summary
- 312 nodes · 575 edges · 18 communities (12 shown, 6 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Database
- package.json
- App.tsx
- commands.rs
- OdooError
- SyncEngine
- tauri.conf.json
- compilerOptions
- models.rs
- Odoo To Do
- compilerOptions
- default.json
- odoo-to-do
- HtmlNotes.tsx
- macos-dev-runner.py

## God Nodes (most connected - your core abstractions)
1. `Database` - 37 edges
2. `AppState` - 19 edges
3. `compilerOptions` - 16 edges
4. `OdooError` - 15 edges
5. `SyncEngine` - 15 edges
6. `OdooClient` - 13 edges
7. `OdooInstance` - 11 edges
8. `react` - 10 edges
9. `completed_outbox_unblocks_remote_updates_without_losing_newer_edits()` - 10 edges
10. `assignment_snapshot_filters_cached_tasks_and_preserves_offline_work()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `AppState` --references--> `Database`  [EXTRACTED]
  src-tauri/src/commands.rs → src-tauri/src/db.rs
- `AppState` --references--> `SyncEngine`  [EXTRACTED]
  src-tauri/src/commands.rs → src-tauri/src/sync.rs
- `SyncEngine` --references--> `Database`  [EXTRACTED]
  src-tauri/src/sync.rs → src-tauri/src/db.rs
- `SyncEngine` --references--> `OdooClient`  [EXTRACTED]
  src-tauri/src/sync.rs → src-tauri/src/odoo.rs
- `TaskDetail()` --calls--> `HtmlNotes()`  [EXTRACTED]
  src/components/TaskDetail.tsx → src/components/HtmlNotes.tsx

## Import Cycles
- None detected.

## Communities (18 total, 6 thin omitted)

### Community 0 - "Database"
Cohesion: 0.08
Nodes (6): assignment_snapshot_filters_cached_tasks_and_preserves_offline_work(), completed_outbox_unblocks_remote_updates_without_losing_newer_edits(), Database, image_notes_survive_restart_and_remain_in_sync_queue(), test_instance_and_task_offline_flow(), SyncQueueItem

### Community 1 - "package.json"
Cohesion: 0.09
Nodes (27): devDependencies, tailwindcss@^4.3.5, @tailwindcss/vite@^4.3.5, @tauri-apps/cli@^2, @types/react@^19.1.8, @types/react-dom@^19.1.6, typescript@~6.0.3, vite@^8.0.16 (+19 more)

### Community 2 - "App.tsx"
Cohesion: 0.17
Nodes (26): @tauri-apps/api@^2, react, @tauri-apps/api, api, App(), InstanceModal(), InstanceModalProps, PRESET_COLORS (+18 more)

### Community 3 - "commands.rs"
Cohesion: 0.17
Nodes (18): add_instance(), AppState, create_task(), delete_instance(), delete_task(), drag_window(), get_instances(), get_projects() (+10 more)

### Community 4 - "OdooError"
Cohesion: 0.18
Nodes (7): OdooClient, OdooError, AuthFailed, InvalidUrl, Json, Network, Odoo

### Community 6 - "tauri.conf.json"
Cohesion: 0.10
Nodes (20): app, macOSPrivateApi, security, windows, build, beforeBuildCommand, beforeDevCommand, devUrl (+12 more)

### Community 7 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+10 more)

### Community 8 - "models.rs"
Cohesion: 0.15
Nodes (10): ConnectionTestResult, CreateInstanceInput, CreateTaskInput, OdooInstance, Project, Stage, SyncStatusInfo, Task (+2 more)

### Community 9 - "Odoo To Do"
Cohesion: 0.22
Nodes (8): Compilación y pruebas, Conectar Odoo, Datos locales, Desarrollo, Estructura, Funciones, Odoo To Do, Requisitos

### Community 10 - "compilerOptions"
Cohesion: 0.25
Nodes (7): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, skipLibCheck, include

### Community 11 - "default.json"
Cohesion: 0.33
Nodes (5): description, identifier, permissions, $schema, windows

### Community 16 - "HtmlNotes.tsx"
Cohesion: 0.14
Nodes (17): dependencies, dompurify@^3.4.17, lucide-react@^1.70.0, react@^19.1.0, react-dom@^19.1.0, @tauri-apps/plugin-opener@^2, dompurify, lucide-react (+9 more)

## Knowledge Gaps
- **4 isolated node(s):** `odoo-to-do`, `Network`, `Json`, `InvalidUrl`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 119 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Database` connect `Database` to `commands.rs`, `SyncEngine`?**
  _High betweenness centrality (0.122) - this node is a cross-community bridge._
- **What connects `odoo-to-do`, `Network`, `Json` to the rest of the system?**
  _4 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Database` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Why does `OdooClient` connect `OdooError` to `commands.rs`, `SyncEngine`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.0896551724137931 - nodes in this community are weakly interconnected._
- **Why does `SyncQueueItem` connect `Database` to `models.rs`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Should `SyncEngine` be split into smaller, more focused modules?**
  _Cohesion score 0.1168091168091168 - nodes in this community are weakly interconnected._