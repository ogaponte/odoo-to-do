import { invoke } from '@tauri-apps/api/core';
import {
  ConnectionTestResult,
  CreateInstanceInput,
  CreateTaskInput,
  OdooInstance,
  Project,
  Stage,
  SyncStatusInfo,
  Task,
  UpdateInstanceInput,
  UpdateTaskInput,
} from './types';

export const api = {
  // Instances
  async getInstances(): Promise<OdooInstance[]> {
    return await invoke('get_instances');
  },

  async addInstance(input: CreateInstanceInput): Promise<OdooInstance> {
    return await invoke('add_instance', { input });
  },

  async updateInstance(input: UpdateInstanceInput): Promise<void> {
    return await invoke('update_instance', { input });
  },

  async deleteInstance(id: string): Promise<void> {
    return await invoke('delete_instance', { id });
  },

  async testConnection(input: CreateInstanceInput): Promise<ConnectionTestResult> {
    return await invoke('test_odoo_connection', { input });
  },

  // Projects & Stages
  async getProjects(instanceId?: string): Promise<Project[]> {
    return await invoke('get_projects', { instanceId: instanceId || null });
  },

  async getStages(instanceId?: string): Promise<Stage[]> {
    return await invoke('get_stages', { instanceId: instanceId || null });
  },

  // Tasks
  async getTasks(params?: {
    instanceId?: string;
    projectId?: string;
    starredOnly?: boolean;
    completedOnly?: boolean;
    searchQuery?: string;
  }): Promise<Task[]> {
    return await invoke('get_tasks', {
      instanceId: params?.instanceId || null,
      projectId: params?.projectId || null,
      starredOnly: params?.starredOnly ?? false,
      completedOnly: params?.completedOnly ?? null,
      searchQuery: params?.searchQuery || null,
    });
  },

  async getTask(id: string): Promise<Task | null> {
    return await invoke('get_task', { id });
  },

  async createTask(input: CreateTaskInput): Promise<Task> {
    return await invoke('create_task', { input });
  },

  async updateTask(input: UpdateTaskInput): Promise<Task> {
    return await invoke('update_task', { input });
  },

  async deleteTask(id: string): Promise<void> {
    return await invoke('delete_task', { id });
  },

  async toggleTaskCompletion(id: string, completed: boolean): Promise<Task> {
    return await invoke('toggle_task_completion', { id, completed });
  },

  async toggleTaskStar(id: string, starred: boolean): Promise<Task> {
    return await invoke('toggle_task_star', { id, starred });
  },

  // Sync
  async syncAll(): Promise<SyncStatusInfo> {
    return await invoke('sync_all');
  },

  async getSyncStatus(): Promise<SyncStatusInfo> {
    return await invoke('get_sync_status');
  },
};
