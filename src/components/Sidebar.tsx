import React, { useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Folder,
  Inbox,
  MoreVertical,
  Plus,
  RefreshCw,
  Server,
  Star,
  Sun,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { OdooInstance, Project, SyncStatusInfo } from '../types';
import { handleWindowDrag } from '../utils/drag';

export type ViewFilter = 'my_day' | 'important' | 'planned' | 'all' | 'completed';

interface SidebarProps {
  currentView: ViewFilter;
  onSelectView: (view: ViewFilter) => void;
  selectedInstanceId: string | null;
  onSelectInstance: (instanceId: string | null) => void;
  selectedProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
  instances: OdooInstance[];
  projects: Project[];
  taskCounts: {
    my_day: number;
    important: number;
    planned: number;
    all: number;
    completed: number;
    byProject: Record<string, number>;
  };
  syncStatus: SyncStatusInfo | null;
  onTriggerSync: () => void;
  onOpenAddInstance: () => void;
  onDeleteInstance: (id: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onSelectView,
  selectedInstanceId,
  onSelectInstance,
  selectedProjectId,
  onSelectProject,
  instances,
  projects,
  taskCounts,
  syncStatus,
  onTriggerSync,
  onOpenAddInstance,
  onDeleteInstance,
}) => {
  const [expandedInstances, setExpandedInstances] = useState<Record<string, boolean>>({});
  const [instanceMenuOpen, setInstanceMenuOpen] = useState<string | null>(null);

  const toggleInstanceExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedInstances((prev) => ({
      ...prev,
      [id]: prev[id] === undefined ? true : !prev[id],
    }));
  };

  const navItems = [
    {
      id: 'my_day' as ViewFilter,
      label: 'My Day',
      icon: Sun,
      color: 'text-amber-500',
      count: taskCounts.my_day,
    },
    {
      id: 'important' as ViewFilter,
      label: 'Important',
      icon: Star,
      color: 'text-rose-500',
      count: taskCounts.important,
    },
    {
      id: 'planned' as ViewFilter,
      label: 'Planned',
      icon: Calendar,
      color: 'text-blue-500',
      count: taskCounts.planned,
    },
    {
      id: 'all' as ViewFilter,
      label: 'All Tasks',
      icon: Inbox,
      color: 'text-emerald-500',
      count: taskCounts.all,
    },
    {
      id: 'completed' as ViewFilter,
      label: 'Completed',
      icon: CheckCircle2,
      color: 'text-zinc-400',
      count: taskCounts.completed,
    },
  ];

  return (
    <aside className="w-52 xl:w-64 shrink-0 h-screen flex flex-col bg-white/5 dark:bg-black/10 backdrop-blur-xl border-r border-black/5 dark:border-white/5 select-none">
      {/* App Header & macOS Window Drag Region */}
      <div
        data-tauri-drag-region="deep"
        onMouseDown={handleWindowDrag}
        className="h-24 shrink-0 pt-9 pb-3 px-3 flex items-center justify-between gap-2 border-b border-black/4 dark:border-white/5 cursor-grab active:cursor-grabbing transition-colors"
        title="Drag here to move the window"
      >
        <div className="min-w-0 flex items-center gap-2 pointer-events-none" data-tauri-drag-region="deep">
          <img
            src="/logo.png"
            alt="Odoo To Do"
            className="w-7 h-7 rounded-md object-contain shadow-2xs shrink-0"
          />
          <span className="truncate font-semibold text-sm tracking-tight text-zinc-800 dark:text-zinc-200">
            Odoo To Do
          </span>
        </div>

        <button
          type="button"
          data-no-drag
          data-tauri-drag-region="false"
          onClick={(e) => {
            e.stopPropagation();
            onTriggerSync();
          }}
          disabled={syncStatus?.is_syncing}
          title="Sync now (Cmd+R)"
          className="shrink-0 cursor-pointer p-1 rounded-md text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-black/8 dark:hover:bg-white/10 transition"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${
              syncStatus?.is_syncing ? 'animate-spin text-blue-500' : ''
            }`}
          />
        </button>
      </div>

      {/* Navigation Items */}
      <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-0.5">
        <div className="space-y-0.5 mb-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isSelected =
              currentView === item.id &&
              selectedInstanceId === null &&
              selectedProjectId === null;

            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectView(item.id);
                  onSelectInstance(null);
                  onSelectProject(null);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm font-medium transition cursor-pointer ${
                  isSelected
                    ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400 font-semibold shadow-2xs'
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/8'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${item.color}`} />
                  <span>{item.label}</span>
                </div>
                {item.count > 0 && (
                  <span
                    className={`text-sm px-1.5 py-0.2 rounded-full font-medium ${
                      isSelected
                        ? 'bg-blue-500 text-white'
                        : 'text-zinc-500 dark:text-zinc-400'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Instances & Projects Header */}
        <div className="pt-2 pb-1.5 px-2 flex items-center justify-between">
          <span className="text-[13px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Odoo Instances
          </span>
          <button
            type="button"
            onClick={onOpenAddInstance}
            title="Connect a new Odoo instance"
            className="cursor-pointer p-1 rounded-md text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-black/5 dark:hover:bg-white/10 transition"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Instances List */}
        {instances.length === 0 ? (
          <div className="p-3 text-center border border-dashed border-zinc-400/30 dark:border-zinc-700/40 rounded-xl my-2 bg-white/10 dark:bg-white/5">
            <Server className="w-5 h-5 mx-auto text-zinc-400 dark:text-zinc-500 mb-1" />
            <p className="text-sm text-zinc-600 dark:text-zinc-400 font-medium">No instances</p>
            <button
              type="button"
              onClick={onOpenAddInstance}
              className="cursor-pointer mt-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Connect Odoo
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {instances.map((instance) => {
              const isExpanded = expandedInstances[instance.id] ?? true;
              const instanceProjects = projects.filter((p) => p.instance_id === instance.id);
              const isInstanceActive =
                selectedInstanceId === instance.id && selectedProjectId === null;

              return (
                <div key={instance.id} className="relative group/inst">
                  {/* Instance row */}
                  <div
                    onClick={() => {
                      onSelectInstance(instance.id);
                      onSelectProject(null);
                    }}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm cursor-pointer transition ${
                      isInstanceActive
                        ? 'bg-black/10 dark:bg-white/15 text-zinc-900 dark:text-zinc-100 font-semibold shadow-2xs'
                        : 'text-zinc-700 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/8'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        type="button"
                        onClick={(e) => toggleInstanceExpand(instance.id, e)}
                        className="cursor-pointer text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 p-0.5"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                        style={{ backgroundColor: instance.color }}
                      />
                      <span className="truncate text-sm">{instance.name}</span>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover/inst:opacity-100 transition">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setInstanceMenuOpen(
                            instanceMenuOpen === instance.id ? null : instance.id
                          );
                        }}
                        className="cursor-pointer p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Instance Context Menu */}
                  {instanceMenuOpen === instance.id && (
                    <div className="absolute right-2 top-8 z-30 w-36 py-1 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-2xl border border-black/10 dark:border-white/10 rounded-lg shadow-xl text-sm">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setInstanceMenuOpen(null);
                          if (confirm(`Delete instance "${instance.name}" and its local data?`)) {
                            onDeleteInstance(instance.id);
                          }
                        }}
                        className="cursor-pointer w-full text-left px-3 py-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 flex items-center gap-2"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  )}

                  {/* Projects list */}
                  {isExpanded && instanceProjects.length > 0 && (
                    <div className="pl-6 pr-1 space-y-0.5 mt-0.5">
                      {instanceProjects.map((project) => {
                        const isProjSelected = selectedProjectId === project.id;
                        const pCount = taskCounts.byProject[project.id] || 0;

                        return (
                          <button
                            key={project.id}
                            type="button"
                            onClick={() => {
                              onSelectInstance(instance.id);
                              onSelectProject(project.id);
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-1 rounded-md text-sm transition cursor-pointer ${
                              isProjSelected
                                ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400 font-semibold shadow-2xs'
                                : 'text-zinc-600 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/8'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Folder className="w-3.5 h-3.5 shrink-0 opacity-60" />
                              <span className="truncate">{project.name}</span>
                            </div>
                            {pCount > 0 && (
                              <span className="text-[13px] text-zinc-400 ml-1 shrink-0 font-medium">
                                {pCount}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Sync Dock */}
      <div className="p-3 border-t border-black/4 dark:border-white/5 bg-white/5 dark:bg-black/10 backdrop-blur-md">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1.5">
            {syncStatus?.is_syncing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-500" />
            ) : syncStatus?.message || (syncStatus?.pending_mutations && syncStatus.pending_mutations > 0) ? (
              <WifiOff className="w-3.5 h-3.5 text-amber-500" />
            ) : (
              <Wifi className="w-3.5 h-3.5 text-emerald-500" />
            )}

            <span className="text-sm text-zinc-600 dark:text-zinc-400 truncate max-w-[140px]">
              {syncStatus?.is_syncing
                ? 'Syncing...'
                : syncStatus?.message
                ? 'Sync failed'
                : syncStatus?.pending_mutations && syncStatus.pending_mutations > 0
                ? `${syncStatus.pending_mutations} pending`
                : syncStatus?.last_synced_at ? 'Up to date' : 'Not synced yet'}
            </span>
          </div>

          <button
            type="button"
            onClick={onTriggerSync}
            disabled={syncStatus?.is_syncing}
            className="cursor-pointer text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-40 font-medium"
          >
            Sync
          </button>
        </div>
        {syncStatus?.last_synced_at && (
          <p className="mt-2 text-[12px] text-zinc-500">
            Last download: {new Date(syncStatus.last_synced_at).toLocaleString('en-US')}
          </p>
        )}
        {syncStatus?.message && (
          <p role="alert" className="mt-2 text-sm text-rose-600 dark:text-rose-400 whitespace-pre-wrap break-words">
            {syncStatus.message}
          </p>
        )}
      </div>
    </aside>
  );
};
