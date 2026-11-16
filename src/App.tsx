import { useEffect, useState } from 'react';
import { api } from './api';
import { InstanceModal } from './components/InstanceModal';
import { Sidebar, ViewFilter } from './components/Sidebar';
import { TaskDetail } from './components/TaskDetail';
import { TaskList } from './components/TaskList';
import { OdooInstance, Project, Stage, SyncStatusInfo, Task, UpdateTaskInput } from './types';

export function App() {
  const [instances, setInstances] = useState<OdooInstance[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatusInfo | null>(null);

  // Navigation State
  const [currentView, setCurrentView] = useState<ViewFilter>('all');
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isInstanceModalOpen, setIsInstanceModalOpen] = useState(false);
  const [editingInstance, setEditingInstance] = useState<OdooInstance | null>(null);

  // Responsive mobile support
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const loadData = async () => {
    try {
      const [instList, projList, stageList, st] = await Promise.all([
        api.getInstances(),
        api.getProjects(),
        api.getStages(),
        api.getSyncStatus(),
      ]);

      setInstances(instList);
      setProjects(projList);
      setStages(stageList);
      setSyncStatus(st);

      // Load tasks with current active filters
      const taskList = await api.getTasks({
        instanceId: selectedInstanceId || undefined,
        projectId: selectedProjectId || undefined,
        starredOnly: currentView === 'important',
        completedOnly: currentView === 'completed' ? true : undefined,
        searchQuery: searchQuery.trim() || undefined,
      });

      setTasks(taskList);
    } catch (e) {
      console.error('Error loading local data from Rust:', e);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentView, selectedInstanceId, selectedProjectId]);

  // If the active project is deleted remotely, reset selection
  useEffect(() => {
    if (selectedProjectId && !projects.some((p) => p.id === selectedProjectId)) {
      setSelectedProjectId(null);
    }
  }, [projects, selectedProjectId]);

  // Refresh local data too, so background downloads appear without navigating.
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const st = await api.getSyncStatus();
        setSyncStatus(st);
        await loadData();
      } catch (e) {
        console.error('Error fetching sync status:', e);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [currentView, selectedInstanceId, selectedProjectId, searchQuery]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        handleTriggerSync();
      }
      if (e.key === 'Escape') {
        setSelectedTaskId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleTriggerSync = async () => {
    try {
      setSyncStatus((prev) => (prev ? { ...prev, is_syncing: true } : null));
      const status = await api.syncAll();
      setSyncStatus(status);
    } catch (e: any) {
      console.error('Sync failed:', e);
      setSyncStatus((prev) => prev ? { ...prev, is_syncing: false, online: false, message: String(e) } : null);
    } finally {
      await loadData();
    }
  };

  const handleCreateTask = async (title: string) => {
    let targetInstanceId = selectedInstanceId;
    if (!targetInstanceId) {
      if (instances.length > 0) {
        targetInstanceId = instances[0].id;
      } else {
        alert('Please connect an Odoo instance before creating tasks.');
        setIsInstanceModalOpen(true);
        return;
      }
    }

    const newTask = await api.createTask({
      instance_id: targetInstanceId,
      project_id: selectedProjectId,
      title,
      priority: currentView === 'important' ? '1' : '0',
      date_deadline:
        currentView === 'my_day'
          ? new Date().toISOString().split('T')[0]
          : null,
    });

    setTasks((prev) => [newTask, ...prev]);
    setSelectedTaskId(newTask.id);
  };

  const handleToggleComplete = async (id: string, current: boolean) => {
    // Optimistic UI update
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, is_completed: !current } : t))
    );
    try {
      await api.toggleTaskCompletion(id, !current);
      const st = await api.getSyncStatus();
      setSyncStatus(st);
    } catch (e) {
      console.error('Failed to toggle completion:', e);
      loadData();
    }
  };

  const handleToggleStar = async (id: string, current: string) => {
    const newStar = current === '1' ? '0' : '1';
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, priority: newStar } : t))
    );
    try {
      await api.toggleTaskStar(id, newStar === '1');
      const st = await api.getSyncStatus();
      setSyncStatus(st);
    } catch (e) {
      console.error('Failed to toggle star:', e);
      loadData();
    }
  };

  const handleUpdateTask = async (input: UpdateTaskInput) => {
    try {
      const updated = await api.updateTask(input);
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      const st = await api.getSyncStatus();
      setSyncStatus(st);
    } catch (e) {
      console.error('Failed to update task:', e);
    }
  };

  const handleDeleteTask = async (id: string) => {
    try {
      await api.deleteTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
      if (selectedTaskId === id) {
        setSelectedTaskId(null);
      }
      const st = await api.getSyncStatus();
      setSyncStatus(st);
    } catch (e) {
      console.error('Failed to delete task:', e);
    }
  };

  const handleDeleteInstance = async (id: string) => {
    try {
      await api.deleteInstance(id);
      if (selectedInstanceId === id) {
        setSelectedInstanceId(null);
        setSelectedProjectId(null);
      }
      await loadData();
    } catch (e) {
      console.error('Failed to delete instance:', e);
    }
  };

  const handleUpdateInstanceColor = async (id: string, color: string) => {
    // Optimistic UI update
    setInstances((prev) =>
      prev.map((inst) => (inst.id === id ? { ...inst, color } : inst))
    );
    try {
      await api.updateInstanceColor(id, color);
    } catch (e) {
      console.error('Failed to update instance color:', e);
      await loadData();
    }
  };

  const handleCreateProject = async (instanceId: string, name: string) => {
    try {
      const newProj = await api.createProject({
        instance_id: instanceId,
        name: name.trim(),
      });
      setProjects((prev) => [...prev, newProj]);
      setSelectedInstanceId(instanceId);
      setSelectedProjectId(newProj.id);
      const st = await api.getSyncStatus();
      setSyncStatus(st);
    } catch (e) {
      console.error('Failed to create project:', e);
      alert(`Failed to create project: ${e}`);
    }
  };

  // Compute Task counts for sidebar smart views
  const todayStr = new Date().toISOString().split('T')[0];
  const byProject: Record<string, number> = {};
  for (const t of tasks) {
    if (t.project_id && !t.is_completed) {
      byProject[t.project_id] = (byProject[t.project_id] || 0) + 1;
    }
  }

  const taskCounts = {
    my_day: tasks.filter(
      (t) => !t.is_completed && (t.date_deadline === todayStr || t.priority === '1')
    ).length,
    important: tasks.filter((t) => !t.is_completed && t.priority === '1').length,
    planned: tasks.filter((t) => !t.is_completed && Boolean(t.date_deadline)).length,
    all: tasks.filter((t) => !t.is_completed).length,
    completed: tasks.filter((t) => t.is_completed).length,
    byProject,
  };

  const selectedInstance = instances.find((i) => i.id === selectedInstanceId) || null;
  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;
  const selectedTask = tasks.find((t) => t.id === selectedTaskId) || null;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans antialiased select-none">
      {/* Mobile Drawer Backdrop */}
      {isMobile && isMobileDrawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
          onClick={() => setIsMobileDrawerOpen(false)}
        />
      )}

      {/* Left Sidebar (Desktop fixed/resizable, Mobile slide-in drawer) */}
      <div
        className={
          isMobile
            ? `fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-white dark:bg-zinc-900 shadow-2xl transform transition-transform duration-250 ease-out ${
                isMobileDrawerOpen ? 'translate-x-0' : '-translate-x-full'
              }`
            : 'contents'
        }
      >
        <Sidebar
          currentView={currentView}
          onSelectView={(v) => {
            setCurrentView(v);
            setSelectedInstanceId(null);
            setSelectedProjectId(null);
            if (isMobile) setIsMobileDrawerOpen(false);
          }}
          selectedInstanceId={selectedInstanceId}
          onSelectInstance={(id) => {
            setSelectedInstanceId(id);
            setSelectedProjectId(null);
            if (isMobile) setIsMobileDrawerOpen(false);
          }}
          selectedProjectId={selectedProjectId}
          onSelectProject={(id) => {
            setSelectedProjectId(id);
            if (isMobile) setIsMobileDrawerOpen(false);
          }}
          instances={instances}
          projects={projects}
          taskCounts={taskCounts}
          syncStatus={syncStatus}
          onTriggerSync={handleTriggerSync}
          onOpenAddInstance={() => {
            setEditingInstance(null);
            setIsInstanceModalOpen(true);
            if (isMobile) setIsMobileDrawerOpen(false);
          }}
          onDeleteInstance={handleDeleteInstance}
          onUpdateInstanceColor={handleUpdateInstanceColor}
          onEditInstance={(inst) => {
            setEditingInstance(inst);
            setIsInstanceModalOpen(true);
            if (isMobile) setIsMobileDrawerOpen(false);
          }}
          onCreateProject={handleCreateProject}
          isMobile={isMobile}
          onCloseDrawer={() => setIsMobileDrawerOpen(false)}
        />
      </div>

      {/* Middle Pane: Task List (Hidden on mobile when a task is open) */}
      {(!isMobile || !selectedTask) && (
        <TaskList
          tasks={tasks}
          instances={instances}
          projects={projects}
          selectedTaskId={selectedTask?.id ?? null}
          onSelectTask={(id) => setSelectedTaskId(id)}
          onToggleComplete={handleToggleComplete}
          onToggleStar={handleToggleStar}
          onCreateTask={handleCreateTask}
          onDeleteTask={handleDeleteTask}
          currentView={currentView}
          selectedInstance={selectedInstance}
          selectedProject={selectedProject}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          isMobile={isMobile}
          onOpenDrawer={() => setIsMobileDrawerOpen(true)}
          onTriggerSync={handleTriggerSync}
          isSyncing={syncStatus?.is_syncing}
        />
      )}

      {/* Right Pane: Task Detail (Full screen on mobile, side pane on desktop) */}
      {selectedTask && (
        <TaskDetail
          task={selectedTask}
          instances={instances}
          projects={projects}
          stages={stages}
          onClose={() => setSelectedTaskId(null)}
          onUpdate={handleUpdateTask}
          onDelete={handleDeleteTask}
          isMobile={isMobile}
        />
      )}

      {/* Instance Configuration Modal */}
      <InstanceModal
        isOpen={isInstanceModalOpen}
        onClose={() => setIsInstanceModalOpen(false)}
        onSaved={loadData}
        editingInstance={editingInstance}
      />
    </div>
  );
}

export default App;
