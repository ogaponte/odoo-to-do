import React, { useEffect, useRef, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  CloudCheck,
  CloudUpload,
  ExternalLink,
  Folder,
  Server,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { OdooInstance, Project, Stage, Task, UpdateTaskInput } from '../types';
import { handleWindowDrag } from '../utils/drag';
import { HtmlNotes } from './HtmlNotes';
import { openUrl } from '@tauri-apps/plugin-opener';

interface TaskDetailProps {
  task: Task | null;
  instances: OdooInstance[];
  projects: Project[];
  stages: Stage[];
  onClose: () => void;
  onUpdate: (input: UpdateTaskInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export const TaskDetail: React.FC<TaskDetailProps> = ({
  task,
  instances,
  projects,
  stages,
  onClose,
  onUpdate,
  onDelete,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dateDeadline, setDateDeadline] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [stageId, setStageId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [browserError, setBrowserError] = useState('');
  const [openingBrowser, setOpeningBrowser] = useState(false);
  const previousTask = useRef<Task | null>(null);

  useEffect(() => {
    if (task) {
      const previous = previousTask.current;
      const switching = previous?.id !== task.id;
      // Apply downloaded changes while preserving any edits still being typed.
      setTitle((current) => switching || current === previous?.title ? task.title : current);
      setDescription((current) => switching || current === previous?.description ? task.description : current);
      setDateDeadline((current) => switching || current === (previous?.date_deadline || '') ? task.date_deadline || '' : current);
      setProjectId((current) => switching || current === previous?.project_id ? task.project_id : current);
      setStageId((current) => switching || current === previous?.stage_id ? task.stage_id : current);
      if (switching) {
        setLastSavedTime(null);
        setBrowserError('');
      }
    }
    previousTask.current = task;
  }, [task?.id, task?.title, task?.description, task?.date_deadline, task?.project_id, task?.stage_id]);

  // Debounced auto-save for description
  useEffect(() => {
    if (!task) return;
    if (description === task.description) return;

    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        await onUpdate({
          id: task.id,
          description,
        });
        setLastSavedTime('Saved');
      } finally {
        setIsSaving(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [description, task?.id]);

  if (!task) return null;

  const currentInstance = instances.find((i) => i.id === task.instance_id);
  const instanceProjects = projects.filter((p) => p.instance_id === task.instance_id);
  const instanceStages = stages.filter((s) => s.instance_id === task.instance_id);

  const handleOpenInOdoo = async () => {
    if (!currentInstance || !task.odoo_id) return;
    setBrowserError('');
    setOpeningBrowser(true);
    try {
      const url = new URL(currentInstance.url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid Odoo URL');
      // Odoo resolves this route to the task form or the login page as needed.
      url.pathname = `${url.pathname.replace(/\/+$/, '')}/mail/view`;
      url.search = new URLSearchParams({
        db: currentInstance.db,
        model: 'project.task',
        res_id: String(task.odoo_id),
      }).toString();
      url.hash = '';
      url.username = '';
      url.password = '';
      await openUrl(url.href);
    } catch {
      setBrowserError('Could not open the task in your browser. Please check the Odoo instance URL and try again.');
    } finally {
      setOpeningBrowser(false);
    }
  };

  const handleTitleBlur = async () => {
    if (title.trim() && title !== task.title) {
      setIsSaving(true);
      try {
        await onUpdate({
          id: task.id,
          title: title.trim(),
        });
        setLastSavedTime('Saved');
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleDeadlineChange = async (newDate: string) => {
    setDateDeadline(newDate);
    setIsSaving(true);
    try {
      await onUpdate({
        id: task.id,
        date_deadline: newDate ? newDate : null,
      });
      setLastSavedTime('Saved');
    } finally {
      setIsSaving(false);
    }
  };

  const handleProjectChange = async (newProjId: string) => {
    const pVal = newProjId ? newProjId : null;
    setProjectId(pVal);
    setIsSaving(true);
    try {
      await onUpdate({
        id: task.id,
        project_id: pVal,
      });
      setLastSavedTime('Saved');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStageChange = async (newStageId: string) => {
    const sVal = newStageId ? newStageId : null;
    setStageId(sVal);
    setIsSaving(true);
    try {
      await onUpdate({
        id: task.id,
        stage_id: sVal,
      });
      setLastSavedTime('Saved');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleComplete = async () => {
    await onUpdate({
      id: task.id,
      is_completed: !task.is_completed,
    });
  };

  const handleToggleStar = async () => {
    const newPriority = task.priority === '1' ? '0' : '1';
    await onUpdate({
      id: task.id,
      priority: newPriority,
    });
  };

  const handleDelete = async () => {
    if (confirm(`Delete task "${task.title}"?`)) {
      await onDelete(task.id);
      onClose();
    }
  };

  return (
    <div className="flex-1 min-w-0 h-screen flex flex-col bg-white/15 dark:bg-black/20 backdrop-blur-xl border-l border-black/8 dark:border-white/10 select-none animate-in slide-in-from-right duration-150">
      {/* Top action bar (draggable in empty space) */}
      <div
        data-tauri-drag-region="deep"
        onMouseDown={handleWindowDrag}
        className="h-13 px-4 flex items-center justify-between border-b border-black/5 dark:border-white/5 cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-2 pointer-events-none" data-tauri-drag-region="deep">
          {task.sync_status === 'synced' ? (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/20 shadow-2xs">
              <CloudCheck className="w-3.5 h-3.5" />
              {task.odoo_id ? `Odoo #${task.odoo_id}` : 'Synced'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-amber-600 dark:text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded-full border border-amber-500/20 shadow-2xs">
              <CloudUpload className="w-3.5 h-3.5" />
              Pending sync
            </span>
          )}

          {lastSavedTime && (
            <span className="text-[13px] text-zinc-400">
              {isSaving ? 'Saving...' : lastSavedTime}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1" data-no-drag>
          <button
            type="button"
            onClick={handleDelete}
            title="Delete task"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-500/15 transition cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close panel"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main scrollable detail */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Title input & Completion button */}
        <div className="flex items-start gap-2.5">
          <button
            type="button"
            onClick={handleToggleComplete}
            className={`mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition cursor-pointer ${
              task.is_completed
                ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                : 'border-zinc-400/60 dark:border-zinc-500/60 hover:border-blue-500'
            }`}
          >
            {task.is_completed ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Circle className="w-4 h-4 text-transparent" />
            )}
          </button>

          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            placeholder="Task title"
            className={`w-full text-lg font-semibold bg-transparent border-0 focus:outline-hidden text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 ${
              task.is_completed ? 'line-through text-zinc-400 dark:text-zinc-500' : ''
            }`}
          />

          <button
            type="button"
            onClick={handleToggleStar}
            className={`p-1 shrink-0 transition cursor-pointer ${
              task.priority === '1'
                ? 'text-amber-500'
                : 'text-zinc-300 dark:text-zinc-600 hover:text-amber-400'
            }`}
          >
            <Star
              className={`w-4 h-4 ${task.priority === '1' ? 'fill-amber-500' : ''}`}
            />
          </button>
        </div>

        {/* Metadata Controls */}
        <div className="space-y-2 pt-2 border-t border-black/5 dark:border-white/5 text-sm">
          <button
            type="button"
            onClick={handleOpenInOdoo}
            disabled={!task.odoo_id || !currentInstance || openingBrowser}
            title={task.odoo_id ? 'Open this task in your default browser' : 'Sync this task before opening it in Odoo'}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ExternalLink className="w-4 h-4" />
            {openingBrowser ? 'Opening…' : 'Open in Odoo'}
          </button>
          {browserError && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{browserError}</p>}
          {/* Instance indicator */}
          {currentInstance && (
            <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-black/4 dark:bg-white/6 backdrop-blur-md">
              <span className="text-zinc-500 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 opacity-70" /> Instance
              </span>
              <span className="font-medium text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full shadow-xs"
                  style={{ backgroundColor: currentInstance.color }}
                />
                {currentInstance.name}
              </span>
            </div>
          )}

          {/* Project selector */}
          <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-black/4 dark:bg-white/6 backdrop-blur-md">
            <span className="text-zinc-500 flex items-center gap-1.5">
              <Folder className="w-3.5 h-3.5 opacity-70" /> Project
            </span>
            <select
              value={projectId || ''}
              onChange={(e) => handleProjectChange(e.target.value)}
              className="bg-transparent text-right font-medium text-zinc-800 dark:text-zinc-200 focus:outline-hidden cursor-pointer"
            >
              <option value="" className="dark:bg-zinc-900">No project</option>
              {instanceProjects.map((p) => (
                <option key={p.id} value={p.id} className="dark:bg-zinc-900">
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Stage selector (if available) */}
          {instanceStages.length > 0 && (
            <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-black/4 dark:bg-white/6 backdrop-blur-md">
              <span className="text-zinc-500 flex items-center gap-1.5">
                Stage
              </span>
              <select
                value={stageId || ''}
                onChange={(e) => handleStageChange(e.target.value)}
                className="bg-transparent text-right font-medium text-zinc-800 dark:text-zinc-200 focus:outline-hidden cursor-pointer"
              >
                <option value="" className="dark:bg-zinc-900">No stage</option>
                {instanceStages.map((s) => (
                  <option key={s.id} value={s.id} className="dark:bg-zinc-900">
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Deadline Picker */}
          <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-black/4 dark:bg-white/6 backdrop-blur-md">
            <span className="text-zinc-500 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 opacity-70" /> Due date
            </span>
            <input
              type="date"
              value={dateDeadline}
              onChange={(e) => handleDeadlineChange(e.target.value)}
              className="bg-transparent text-right font-medium text-zinc-800 dark:text-zinc-200 focus:outline-hidden text-sm cursor-pointer"
            />
          </div>
        </div>

        {/* Apple Notes Style Editor */}
        <div className="pt-2 border-t border-black/5 dark:border-white/5 flex-1 flex flex-col">
          <label className="block text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-2">
            Notes and description
          </label>
          <HtmlNotes
            key={task.id}
            value={description}
            baseUrl={currentInstance?.url}
            onChange={setDescription}
          />
        </div>

        {/* Timestamps & technical metadata */}
        <div className="pt-3 border-t border-black/5 dark:border-white/5 text-[13px] text-zinc-400 space-y-1">
          <div className="flex items-center justify-between">
            <span>Local ID:</span>
            <span className="font-mono">{task.id.slice(0, 8)}...</span>
          </div>
          {task.odoo_id && (
            <div className="flex items-center justify-between">
              <span>Odoo ID:</span>
              <span className="font-mono font-medium text-zinc-600 dark:text-zinc-300">
                #{task.odoo_id}
              </span>
            </div>
          )}
          {task.odoo_write_date && (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" /> Last updated in Odoo:
              </span>
              <span>{task.odoo_write_date}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
