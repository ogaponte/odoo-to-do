import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderPlus,
  Inbox,
  MoreVertical,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  Server,
  Star,
  Sun,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { OdooInstance, Project, SyncStatusInfo } from '../types';
import { handleWindowDrag } from '../utils/drag';
import { ConfirmModal } from './ConfirmModal';

export type ViewFilter = 'my_day' | 'important' | 'planned' | 'all' | 'completed';

const INSTANCE_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Emerald
  '#8B5CF6', // Purple
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#EF4444', // Red
  '#F97316', // Orange
];

const SIDEBAR_STORAGE_KEY = 'odoo_sidebar_width';
const DEFAULT_SIDEBAR_WIDTH = 240;
const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 500;

function getInitialSidebarWidth(): number {
  try {
    const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= MIN_SIDEBAR_WIDTH && parsed <= MAX_SIDEBAR_WIDTH) {
        return parsed;
      }
    }
  } catch {
    // Ignore storage errors
  }
  return DEFAULT_SIDEBAR_WIDTH;
}

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
  onUpdateInstanceColor: (id: string, color: string) => void;
  onEditInstance?: (instance: OdooInstance) => void;
  onCreateProject: (instanceId: string, name: string) => Promise<void>;
  isMobile?: boolean;
  onCloseDrawer?: () => void;
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
  onUpdateInstanceColor,
  onEditInstance,
  onCreateProject,
  isMobile,
  onCloseDrawer,
}) => {
  const [expandedInstances, setExpandedInstances] = useState<Record<string, boolean>>({});
  const [instanceMenuOpen, setInstanceMenuOpen] = useState<string | null>(null);
  const [addingProjectForInstance, setAddingProjectForInstance] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [instanceToDelete, setInstanceToDelete] = useState<OdooInstance | null>(null);

  // Resizable sidebar state
  const [sidebarWidth, setSidebarWidth] = useState<number>(getInitialSidebarWidth);
  const [isResizing, setIsResizing] = useState(false);
  const isResizingRef = useRef(false);
  const sidebarWidthRef = useRef(sidebarWidth);

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    setIsResizing(true);

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;
      const maxAllowed = Math.min(MAX_SIDEBAR_WIDTH, Math.floor(window.innerWidth * 0.5));
      const newWidth = Math.min(Math.max(moveEvent.clientX, MIN_SIDEBAR_WIDTH), maxAllowed);
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        setIsResizing(false);
        try {
          localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarWidthRef.current.toString());
        } catch {
          // Ignore storage errors
        }
      }
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, []);

  const handleDoubleClick = useCallback(() => {
    setSidebarWidth(DEFAULT_SIDEBAR_WIDTH);
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, DEFAULT_SIDEBAR_WIDTH.toString());
    } catch {
      // Ignore storage errors
    }
  }, []);

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
    <aside
      style={isMobile ? { width: '100%' } : { width: `${sidebarWidth}px` }}
      className={`${isMobile ? 'w-full' : 'relative shrink-0 flex-none'} h-screen flex flex-col bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border-r border-black/5 dark:border-white/5 select-none`}
    >
      {/* App Header & macOS Window Drag Region */}
      <div
        data-tauri-drag-region={isMobile ? undefined : "deep"}
        onMouseDown={isMobile ? undefined : handleWindowDrag}
        style={
          isMobile
            ? { paddingTop: 'env(safe-area-inset-top, 0px)' }
            : undefined
        }
        className={`${
          isMobile ? 'h-auto pt-3 pb-3 px-4' : 'h-24 pt-9 pb-3 px-3'
        } shrink-0 flex items-center justify-between gap-2 border-b border-black/4 dark:border-white/5 ${
          isMobile ? '' : 'cursor-grab active:cursor-grabbing'
        } transition-colors`}
        title={isMobile ? undefined : "Drag here to move the window"}
      >
        <div className="min-w-0 flex items-center gap-2 pointer-events-none" data-tauri-drag-region={isMobile ? undefined : "deep"}>
          <img
            src="/logo.png"
            alt="Odoo To Do"
            className="w-7 h-7 rounded-md object-contain shadow-2xs shrink-0"
          />
          <span className="truncate font-semibold text-sm tracking-tight text-zinc-800 dark:text-zinc-200">
            Odoo To Do
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            data-no-drag
            data-tauri-drag-region="false"
            onClick={(e) => {
              e.stopPropagation();
              onTriggerSync();
            }}
            disabled={syncStatus?.is_syncing}
            title="Sync now"
            className="shrink-0 cursor-pointer p-1.5 rounded-md text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-black/8 dark:hover:bg-white/10 transition"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                syncStatus?.is_syncing ? 'animate-spin text-blue-500' : ''
              }`}
            />
          </button>
          {isMobile && onCloseDrawer && (
            <button
              type="button"
              onClick={onCloseDrawer}
              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-black/8 dark:hover:bg-white/10 transition cursor-pointer"
              title="Close menu"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
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
                          setExpandedInstances((prev) => ({ ...prev, [instance.id]: true }));
                          setAddingProjectForInstance(instance.id);
                          setNewProjectName('');
                        }}
                        title={`New project in ${instance.name}`}
                        className="cursor-pointer p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
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
                    <>
                      {/* Click outside backdrop */}
                      <div
                        className="fixed inset-0 z-20 cursor-default"
                        onClick={(e) => {
                          e.stopPropagation();
                          setInstanceMenuOpen(null);
                        }}
                      />

                      <div
                        className="absolute right-2 top-8 z-30 w-48 p-2 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-2xl border border-black/10 dark:border-white/10 rounded-xl shadow-2xl text-xs select-none animate-in fade-in zoom-in-95 duration-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Color Section */}
                        <div className="px-1 py-0.5">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
                            <span className="flex items-center gap-1.5">
                              <Palette className="w-3 h-3 text-zinc-500" /> Color
                            </span>
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs border border-black/10 dark:border-white/20"
                              style={{ backgroundColor: instance.color }}
                            />
                          </div>

                          {/* Color swatches */}
                          <div className="grid grid-cols-5 gap-1.5 items-center">
                            {INSTANCE_COLORS.map((c) => {
                              const isCurrent = instance.color.toLowerCase() === c.toLowerCase();
                              return (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() => {
                                    onUpdateInstanceColor(instance.id, c);
                                    setInstanceMenuOpen(null);
                                  }}
                                  title={c}
                                  className={`w-6 h-6 rounded-full cursor-pointer flex items-center justify-center transition-transform hover:scale-110 shadow-2xs border ${
                                    isCurrent
                                      ? 'ring-2 ring-offset-1 ring-blue-500 dark:ring-offset-zinc-900 border-white dark:border-zinc-900'
                                      : 'border-black/10 dark:border-white/10'
                                  }`}
                                  style={{ backgroundColor: c }}
                                >
                                  {isCurrent && (
                                    <Check className="w-3 h-3 text-white stroke-[3] drop-shadow-xs" />
                                  )}
                                </button>
                              );
                            })}

                            {/* Custom color input */}
                            <label
                              title="Custom color"
                              className="w-6 h-6 rounded-full cursor-pointer flex items-center justify-center border border-dashed border-zinc-400 dark:border-zinc-500 hover:border-zinc-700 dark:hover:border-zinc-300 transition-transform hover:scale-110 relative overflow-hidden"
                            >
                              <input
                                type="color"
                                value={instance.color}
                                onChange={(e) => {
                                  onUpdateInstanceColor(instance.id, e.target.value);
                                }}
                                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                              />
                              <Plus className="w-3 h-3 text-zinc-500 dark:text-zinc-400" />
                            </label>
                          </div>
                        </div>

                        <div className="my-1.5 border-t border-black/5 dark:border-white/5" />

                        {/* New project */}
                        <button
                          type="button"
                          onClick={() => {
                            setInstanceMenuOpen(null);
                            setExpandedInstances((prev) => ({ ...prev, [instance.id]: true }));
                            setAddingProjectForInstance(instance.id);
                            setNewProjectName('');
                          }}
                          className="cursor-pointer w-full text-left px-2 py-1.5 rounded-md text-zinc-700 dark:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 flex items-center gap-2 font-medium text-xs transition"
                        >
                          <FolderPlus className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" /> New project
                        </button>

                        {/* Edit details */}
                        {onEditInstance && (
                          <button
                            type="button"
                            onClick={() => {
                              setInstanceMenuOpen(null);
                              onEditInstance(instance);
                            }}
                            className="cursor-pointer w-full text-left px-2 py-1.5 rounded-md text-zinc-700 dark:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 flex items-center gap-2 font-medium text-xs transition"
                          >
                            <Pencil className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" /> Edit instance
                          </button>
                        )}

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={() => {
                            setInstanceMenuOpen(null);
                            setInstanceToDelete(instance);
                          }}
                          className="cursor-pointer w-full text-left px-2 py-1.5 rounded-md text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 flex items-center gap-2 font-medium text-xs transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                      </div>
                    </>
                  )}

                  {/* Projects list */}
                  {isExpanded && (
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

                      {/* Inline add project form or button */}
                      {addingProjectForInstance === instance.id ? (
                        <form
                          onSubmit={async (e) => {
                            e.preventDefault();
                            if (!newProjectName.trim()) return;
                            await onCreateProject(instance.id, newProjectName.trim());
                            setNewProjectName('');
                            setAddingProjectForInstance(null);
                          }}
                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/70 dark:bg-zinc-800/70 border border-blue-500/40 shadow-xs mt-1"
                        >
                          <Folder className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <input
                            type="text"
                            autoFocus
                            value={newProjectName}
                            onChange={(e) => setNewProjectName(e.target.value)}
                            placeholder="Project name..."
                            className="flex-1 bg-transparent text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden min-w-0"
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                setAddingProjectForInstance(null);
                                setNewProjectName('');
                              }
                            }}
                          />
                          <button
                            type="submit"
                            disabled={!newProjectName.trim()}
                            className="text-xs font-semibold px-1.5 py-0.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded transition shadow-2xs cursor-pointer shrink-0"
                          >
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAddingProjectForInstance(null);
                              setNewProjectName('');
                            }}
                            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-0.5 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setAddingProjectForInstance(instance.id);
                            setNewProjectName('');
                          }}
                          className="w-full flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/8 transition cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>New project</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Sync Dock */}
      <div
        style={
          isMobile
            ? { paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 1.5rem)' }
            : undefined
        }
        className="p-3 border-t border-black/4 dark:border-white/5 bg-white/5 dark:bg-black/10 backdrop-blur-md"
      >
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1.5">
            {syncStatus?.is_syncing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-500" />
            ) : syncStatus?.message || (syncStatus?.pending_mutations && syncStatus.pending_mutations > 0) ? (
              <WifiOff className="w-3.5 h-3.5 text-amber-500" />
            ) : (
              <Wifi className="w-3.5 h-3.5 text-emerald-500" />
            )}

            <span className="text-sm text-zinc-600 dark:text-zinc-400 truncate min-w-0 flex-1">
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
            className="cursor-pointer text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-40 font-medium shrink-0 ml-2"
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

      {/* Resizer Handle (Desktop only) */}
      {!isMobile && (
        <>
          <div
            data-no-drag
            data-tauri-drag-region="false"
            role="separator"
            aria-orientation="vertical"
            aria-valuenow={sidebarWidth}
            onMouseDown={handleMouseDown}
            onDoubleClick={handleDoubleClick}
            className="absolute top-0 right-0 translate-x-1/2 w-3.5 h-full cursor-col-resize z-40 group flex items-center justify-center select-none"
            title="Arrastra para redimensionar (doble clic para restablecer)"
          >
            <div
              className={`w-0.5 h-full transition-colors duration-150 ${
                isResizing
                  ? 'bg-blue-500 shadow-xs'
                  : 'group-hover:bg-blue-500/80 bg-transparent'
              }`}
            />
          </div>

          {/* Transparent overlay while actively dragging to prevent hover/event loss */}
          {isResizing && (
            <div
              className="fixed inset-0 z-50 cursor-col-resize select-none pointer-events-auto"
              style={{ cursor: 'col-resize' }}
            />
          )}
        </>
      )}

      {/* Instance Deletion Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(instanceToDelete)}
        title="¿Eliminar instancia?"
        message={`¿Estás seguro de que deseas eliminar la instancia "${instanceToDelete?.name}" y todos sus datos sincronizados localmente?`}
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        onConfirm={() => {
          if (instanceToDelete) {
            onDeleteInstance(instanceToDelete.id);
            setInstanceToDelete(null);
          }
        }}
        onCancel={() => setInstanceToDelete(null)}
      />
    </aside>
  );
};
