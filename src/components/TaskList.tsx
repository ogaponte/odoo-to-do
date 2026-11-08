import React, { useState } from 'react';
import {
  Calendar,
  Check,
  CloudCheck,
  CloudUpload,
  Folder,
  Plus,
  Search,
  Star,
  X,
} from 'lucide-react';
import { OdooInstance, Project, Task } from '../types';
import { handleWindowDrag } from '../utils/drag';
import { ViewFilter } from './Sidebar';

interface TaskListProps {
  tasks: Task[];
  instances: OdooInstance[];
  projects: Project[];
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
  onToggleComplete: (id: string, current: boolean) => void;
  onToggleStar: (id: string, current: string) => void;
  onCreateTask: (title: string) => Promise<void>;
  currentView: ViewFilter;
  selectedInstance: OdooInstance | null;
  selectedProject: Project | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const TaskList: React.FC<TaskListProps> = ({
  tasks,
  instances,
  projects,
  selectedTaskId,
  onSelectTask,
  onToggleComplete,
  onToggleStar,
  onCreateTask,
  currentView,
  selectedInstance,
  selectedProject,
  searchQuery,
  onSearchChange,
}) => {
  const [quickTitle, setQuickTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tabFilter, setTabFilter] = useState<'all' | 'pending' | 'completed'>('all');

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onCreateTask(quickTitle.trim());
      setQuickTitle('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getHeaderTitle = () => {
    if (selectedProject) return selectedProject.name;
    if (selectedInstance) return selectedInstance.name;
    switch (currentView) {
      case 'my_day':
        return 'My Day';
      case 'important':
        return 'Important';
      case 'planned':
        return 'Planned';
      case 'completed':
        return 'Completed';
      default:
        return 'All Tasks';
    }
  };

  const instanceMap = new Map(instances.map((i) => [i.id, i]));
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  // Filter tasks by tabFilter and search
  const filteredTasks = tasks.filter((t) => {
    if (currentView !== 'completed') {
      if (tabFilter !== 'completed' && t.is_completed) return false;
      if (tabFilter === 'completed' && !t.is_completed) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const titleMatch = t.title.toLowerCase().includes(q);
      const descMatch = t.description.toLowerCase().includes(q);
      const proj = t.project_id ? projectMap.get(t.project_id) : null;
      const projMatch = proj ? proj.name.toLowerCase().includes(q) : false;
      return titleMatch || descMatch || projMatch;
    }
    return true;
  });

  const formatDeadline = (dateStr: string | null) => {
    if (!dateStr) return null;
    const today = new Date().toISOString().split('T')[0];
    const isOverdue = dateStr < today;
    const isToday = dateStr === today;

    return {
      text: isToday ? 'Today' : dateStr,
      isOverdue,
      isToday,
    };
  };

  return (
    <div className={`${selectedTaskId ? 'w-[340px] flex-none' : 'flex-1'} min-w-0 h-screen flex flex-col bg-white/10 dark:bg-black/15 backdrop-blur-lg border-r border-black/8 dark:border-white/10 select-none overflow-hidden`}>
      {/* Action and Filter Header */}
      <div
        data-tauri-drag-region="deep"
        onMouseDown={handleWindowDrag}
        className="px-6 pt-4 pb-3 border-b border-black/5 dark:border-white/5 cursor-grab active:cursor-grabbing"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pointer-events-none" data-tauri-drag-region="deep">
          <div className="min-w-0 max-w-full" data-tauri-drag-region="deep">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight break-words">
              {getHeaderTitle()}
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              {filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'}
              {selectedInstance && (
                <span className="inline-flex items-center gap-1.5 ml-2 font-medium">
                  <span
                    className="w-2 h-2 rounded-full inline-block shadow-xs"
                    style={{ backgroundColor: selectedInstance.color }}
                  />
                  {selectedInstance.name}
                </span>
              )}
            </p>
          </div>

          {/* Tab Filter */}
          <div
            data-no-drag
            className="flex items-center bg-black/6 dark:bg-white/10 p-0.5 rounded-lg text-sm backdrop-blur-md pointer-events-auto cursor-default"
          >
            <button
              onClick={() => setTabFilter('all')}
              className={`px-2.5 py-1 rounded-md transition ${
                tabFilter === 'all'
                  ? 'bg-white/90 dark:bg-zinc-800/90 text-zinc-900 dark:text-zinc-100 font-semibold shadow-2xs'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setTabFilter('pending')}
              className={`px-2.5 py-1 rounded-md transition ${
                tabFilter === 'pending'
                  ? 'bg-white/90 dark:bg-zinc-800/90 text-zinc-900 dark:text-zinc-100 font-semibold shadow-2xs'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              Pending
            </button>
            <button
              onClick={() => setTabFilter('completed')}
              className={`px-2.5 py-1 rounded-md transition ${
                tabFilter === 'completed'
                  ? 'bg-white/90 dark:bg-zinc-800/90 text-zinc-900 dark:text-zinc-100 font-semibold shadow-2xs'
                  : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              Completed
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div data-no-drag className="relative mb-2.5 pointer-events-auto cursor-default">
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search tasks, notes or projects..."
            className="w-full rounded-lg bg-white/60 dark:bg-zinc-800/40 backdrop-blur-md border border-black/8 dark:border-white/10 pl-8.5 pr-8 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/40 shadow-2xs"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-2 text-zinc-400 hover:text-zinc-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Quick Add Bar (MS To-Do style) */}
        <form onSubmit={handleQuickAdd} data-no-drag className="relative pointer-events-auto cursor-default">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/75 dark:bg-zinc-800/50 backdrop-blur-md border border-black/10 dark:border-white/12 shadow-xs focus-within:ring-2 focus-within:ring-blue-500/30 focus-within:border-blue-500 transition">
            <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <input
              type="text"
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              placeholder="Add a task... (Press Enter)"
              className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden"
              disabled={isSubmitting}
            />
            {quickTitle.trim() && (
              <button
                type="submit"
                disabled={isSubmitting}
                className="text-sm font-semibold px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition shadow-xs cursor-pointer"
              >
                Add
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Tasks Scrollable List */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
        {filteredTasks.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center p-6">
            <div className="w-12 h-12 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center text-zinc-400 mb-3">
              <Check className="w-6 h-6 stroke-[2]" />
            </div>
            <p className="text-base font-medium text-zinc-700 dark:text-zinc-300">
              No tasks in this view
            </p>
            <p className="text-sm text-zinc-400 mt-1 max-w-xs">
              Use the bar above to create a task, even when offline.
            </p>
          </div>
        ) : (
          filteredTasks.map((task) => {
            const isSelected = selectedTaskId === task.id;
            const inst = instanceMap.get(task.instance_id);
            const proj = task.project_id ? projectMap.get(task.project_id) : null;
            const deadlineInfo = formatDeadline(task.date_deadline);
            const isStarred = task.priority === '1';

            return (
              <div
                key={task.id}
                onClick={() => onSelectTask(task.id)}
                className={`group flex items-start gap-3 p-3 rounded-xl border transition cursor-pointer ${
                  isSelected
                    ? 'bg-blue-500/20 dark:bg-blue-500/25 border-blue-500/40 dark:border-blue-400/40 shadow-xs'
                    : 'bg-white/45 dark:bg-white/5 backdrop-blur-md border-black/6 dark:border-white/8 hover:bg-white/70 dark:hover:bg-white/10 hover:shadow-2xs'
                }`}
              >
                {/* Round Checkbox (Apple / MS To-Do style) */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleComplete(task.id, task.is_completed);
                  }}
                  className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition cursor-pointer ${
                    task.is_completed
                      ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                      : 'border-zinc-400/60 dark:border-zinc-500/60 hover:border-blue-500'
                  }`}
                >
                  {task.is_completed && <Check className="w-3 h-3 stroke-[3]" />}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-sm font-medium truncate ${
                        task.is_completed
                          ? 'line-through text-zinc-400 dark:text-zinc-500'
                          : 'text-zinc-900 dark:text-zinc-100'
                      }`}
                    >
                      {task.title}
                    </span>

                    {/* Star Priority Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleStar(task.id, task.priority);
                      }}
                      className={`shrink-0 p-0.5 transition cursor-pointer ${
                        isStarred
                          ? 'text-amber-500'
                          : 'text-zinc-300 dark:text-zinc-600 hover:text-amber-400'
                      }`}
                    >
                      <Star
                        className={`w-4 h-4 ${isStarred ? 'fill-amber-500' : ''}`}
                      />
                    </button>
                  </div>

                  {/* Metadata tags */}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {/* Instance badge */}
                    {inst && (
                      <span className="inline-flex items-center gap-1 text-[13px] font-medium px-1.5 py-0.5 rounded-md bg-black/6 dark:bg-white/10 text-zinc-600 dark:text-zinc-300">
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0 shadow-xs"
                          style={{ backgroundColor: inst.color }}
                        />
                        {inst.name}
                      </span>
                    )}

                    {/* Project badge */}
                    {proj && (
                      <span className="inline-flex items-center gap-1 text-[13px] text-zinc-500 dark:text-zinc-400">
                        <Folder className="w-2.5 h-2.5 opacity-60" />
                        {proj.name}
                      </span>
                    )}

                    {/* Deadline tag */}
                    {deadlineInfo && (
                      <span
                        className={`inline-flex items-center gap-1 text-[13px] font-medium px-1.5 py-0.2 rounded-md ${
                          deadlineInfo.isOverdue && !task.is_completed
                            ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/20'
                            : deadlineInfo.isToday && !task.is_completed
                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                            : 'text-zinc-400'
                        }`}
                      >
                        <Calendar className="w-2.5 h-2.5" />
                        {deadlineInfo.text}
                      </span>
                    )}

                    {/* Sync Indicator */}
                    <span className="ml-auto inline-flex items-center gap-1 text-[13px] text-zinc-400" title={`Status: ${task.sync_status}`}>
                      {task.sync_status === 'synced' ? (
                        <CloudCheck className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <CloudUpload className="w-3.5 h-3.5 text-amber-500" />
                      )}
                      {task.odoo_id && (
                        <span className="text-[12px] text-zinc-400">#{task.odoo_id}</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
