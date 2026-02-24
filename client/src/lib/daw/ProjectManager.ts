import { logger } from '../logger';
import { transportEngine } from './TransportEngine';
import { timelineEngine } from './TimelineEngine';
import { automationEngine } from './AutomationEngine';
import { routingEngine } from './RoutingEngine';
import { midiEngine } from './MIDIEngine';
import { nonDestructiveAudio } from './NonDestructiveAudio';
import { pluginStateManager } from './PluginStateManager';

export interface ProjectMetadata {
  id: string;
  name: string;
  version: number;
  createdAt: number;
  modifiedAt: number;
  lastSavedAt: number | null;
  sampleRate: number;
  bitDepth: number;
  tempo: number;
  timeSignature: { numerator: number; denominator: number };
  duration: number;
  author: string;
  description: string;
  tags: string[];
}

export interface ProjectVersion {
  id: string;
  name: string;
  createdAt: number;
  data: string;
  description: string;
}

export interface MediaPoolItem {
  id: string;
  type: 'audio' | 'midi' | 'video' | 'image';
  name: string;
  path: string;
  size: number;
  duration?: number;
  sampleRate?: number;
  channels?: number;
  missing: boolean;
  usageCount: number;
  addedAt: number;
}

export interface ProjectState {
  metadata: ProjectMetadata;
  transport: ReturnType<typeof transportEngine.getState>;
  timeline: ReturnType<typeof timelineEngine.getState>;
  automation: ReturnType<typeof automationEngine.getState>;
  routing: ReturnType<typeof routingEngine.serialize>;
  midi: ReturnType<typeof midiEngine.getState>;
  audio: ReturnType<typeof nonDestructiveAudio.serialize>;
  plugins: ReturnType<typeof pluginStateManager.serialize>;
}

export interface ProjectManagerState {
  currentProject: ProjectMetadata | null;
  isDirty: boolean;
  versions: ProjectVersion[];
  mediaPool: MediaPoolItem[];
  missingFiles: string[];
  autosaveEnabled: boolean;
  autosaveInterval: number;
  maxVersions: number;
  lastAutosave: number | null;
  isRecovering: boolean;
  recoveryData: string | null;
}

const STORAGE_KEY = 'daw_project';
const AUTOSAVE_KEY = 'daw_autosave';
const RECOVERY_KEY = 'daw_recovery';

export class ProjectManager {
  private state: ProjectManagerState;
  private listeners: Set<() => void> = new Set();
  private autosaveTimer: number | null = null;
  private dirtyCheckTimer: number | null = null;
  private lastSnapshot: string = '';

  constructor() {
    this.state = {
      currentProject: null,
      isDirty: false,
      versions: [],
      mediaPool: [],
      missingFiles: [],
      autosaveEnabled: true,
      autosaveInterval: 60000,
      maxVersions: 20,
      lastAutosave: null,
      isRecovering: false,
      recoveryData: null,
    };

    this.checkForRecovery();
    this.startDirtyCheck();
  }

  getState(): Readonly<ProjectManagerState> {
    return { ...this.state };
  }

  createNew(name: string = 'Untitled Project'): void {
    if (this.state.isDirty) {
      logger.warn('Unsaved changes will be lost');
    }

    const id = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    this.state.currentProject = {
      id,
      name,
      version: 1,
      createdAt: now,
      modifiedAt: now,
      lastSavedAt: null,
      sampleRate: 48000,
      bitDepth: 32,
      tempo: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      duration: 300,
      author: '',
      description: '',
      tags: [],
    };

    this.state.isDirty = false;
    this.state.versions = [];
    this.state.mediaPool = [];
    this.state.missingFiles = [];

    this.takeSnapshot();
    this.startAutosave();
    this.notify();
  }

  save(): string {
    if (!this.state.currentProject) {
      throw new Error('No project to save');
    }

    const projectState = this.serializeProject();
    const serialized = JSON.stringify(projectState);

    try {
      localStorage.setItem(STORAGE_KEY, serialized);
      
      this.state.currentProject.lastSavedAt = Date.now();
      this.state.currentProject.modifiedAt = Date.now();
      this.state.isDirty = false;
      
      this.takeSnapshot();
      this.notify();

      return serialized;
    } catch (error) {
      logger.error('Failed to save project:', error);
      throw error;
    }
  }

  saveAs(name: string): string {
    if (!this.state.currentProject) {
      throw new Error('No project to save');
    }

    this.state.currentProject = {
      ...this.state.currentProject,
      id: `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      version: 1,
      createdAt: Date.now(),
    };

    return this.save();
  }

  load(data: string): void {
    try {
      const projectState: ProjectState = JSON.parse(data);
      this.deserializeProject(projectState);
      
      this.state.currentProject = projectState.metadata;
      this.state.isDirty = false;
      
      this.takeSnapshot();
      this.startAutosave();
      this.validateMediaPool();
      this.notify();
    } catch (error) {
      logger.error('Failed to load project:', error);
      throw new Error('Invalid project file');
    }
  }

  loadFromStorage(): boolean {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        this.load(data);
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Failed to load from storage:', error);
      return false;
    }
  }

  createVersion(name: string, description: string = ''): string {
    if (!this.state.currentProject) {
      throw new Error('No project open');
    }

    const projectState = this.serializeProject();
    const serialized = JSON.stringify(projectState);

    const version: ProjectVersion = {
      id: `ver_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      createdAt: Date.now(),
      data: serialized,
      description,
    };

    this.state.versions.unshift(version);

    while (this.state.versions.length > this.state.maxVersions) {
      this.state.versions.pop();
    }

    this.notify();
    return version.id;
  }

  loadVersion(versionId: string): void {
    const version = this.state.versions.find(v => v.id === versionId);
    if (!version) {
      throw new Error('Version not found');
    }

    this.load(version.data);
  }

  deleteVersion(versionId: string): void {
    this.state.versions = this.state.versions.filter(v => v.id !== versionId);
    this.notify();
  }

  private serializeProject(): ProjectState {
    return {
      metadata: this.state.currentProject!,
      transport: transportEngine.getState(),
      timeline: timelineEngine.serialize(),
      automation: automationEngine.serialize(),
      routing: routingEngine.serialize(),
      midi: midiEngine.serialize(),
      audio: nonDestructiveAudio.serialize(),
      plugins: pluginStateManager.serialize(),
    };
  }

  private deserializeProject(state: ProjectState): void {
    timelineEngine.deserialize(state.timeline);
    automationEngine.deserialize(state.automation);
    routingEngine.deserialize(state.routing);
    midiEngine.deserialize(state.midi);
    nonDestructiveAudio.deserialize(state.audio);
    pluginStateManager.deserialize(state.plugins);
  }

  addToMediaPool(item: Omit<MediaPoolItem, 'id' | 'addedAt' | 'usageCount' | 'missing'>): string {
    const id = `media_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newItem: MediaPoolItem = {
      ...item,
      id,
      addedAt: Date.now(),
      usageCount: 0,
      missing: false,
    };

    this.state.mediaPool.push(newItem);
    this.markDirty();
    this.notify();
    return id;
  }

  removeFromMediaPool(itemId: string): void {
    const item = this.state.mediaPool.find(i => i.id === itemId);
    if (item && item.usageCount > 0) {
      logger.warn(`Media item ${itemId} is still in use (${item.usageCount} references)`);
      return;
    }

    this.state.mediaPool = this.state.mediaPool.filter(i => i.id !== itemId);
    this.markDirty();
    this.notify();
  }

  updateMediaPoolUsage(itemId: string, delta: number): void {
    const item = this.state.mediaPool.find(i => i.id === itemId);
    if (item) {
      item.usageCount = Math.max(0, item.usageCount + delta);
      this.notify();
    }
  }

  private validateMediaPool(): void {
    this.state.missingFiles = [];

    for (const item of this.state.mediaPool) {
      item.missing = false;
    }

    this.notify();
  }

  resolveMissingFile(originalPath: string, newPath: string): void {
    const item = this.state.mediaPool.find(i => i.path === originalPath);
    if (item) {
      item.path = newPath;
      item.missing = false;
      this.state.missingFiles = this.state.missingFiles.filter(p => p !== originalPath);
      this.markDirty();
      this.notify();
    }
  }

  private startAutosave(): void {
    if (this.autosaveTimer !== null) {
      clearInterval(this.autosaveTimer);
    }

    if (this.state.autosaveEnabled) {
      this.autosaveTimer = window.setInterval(() => {
        this.performAutosave();
      }, this.state.autosaveInterval);
    }
  }

  private stopAutosave(): void {
    if (this.autosaveTimer !== null) {
      clearInterval(this.autosaveTimer);
      this.autosaveTimer = null;
    }
  }

  private performAutosave(): void {
    if (!this.state.currentProject || !this.state.isDirty) return;

    try {
      const projectState = this.serializeProject();
      const serialized = JSON.stringify(projectState);
      localStorage.setItem(AUTOSAVE_KEY, serialized);
      this.state.lastAutosave = Date.now();
      
      localStorage.setItem(RECOVERY_KEY, serialized);
      
      this.notify();
    } catch (error) {
      logger.error('Autosave failed:', error);
    }
  }

  setAutosave(enabled: boolean, interval?: number): void {
    this.state.autosaveEnabled = enabled;
    if (interval) {
      this.state.autosaveInterval = interval;
    }
    
    if (enabled) {
      this.startAutosave();
    } else {
      this.stopAutosave();
    }
    
    this.notify();
  }

  private checkForRecovery(): void {
    try {
      const recoveryData = localStorage.getItem(RECOVERY_KEY);
      if (recoveryData) {
        this.state.recoveryData = recoveryData;
        this.state.isRecovering = true;
        this.notify();
      }
    } catch (error) {
      logger.error('Failed to check for recovery data:', error);
    }
  }

  recoverProject(): void {
    if (!this.state.recoveryData) return;

    try {
      this.load(this.state.recoveryData);
      this.state.isRecovering = false;
      this.state.recoveryData = null;
      localStorage.removeItem(RECOVERY_KEY);
      this.notify();
    } catch (error) {
      logger.error('Failed to recover project:', error);
      this.discardRecovery();
    }
  }

  discardRecovery(): void {
    this.state.isRecovering = false;
    this.state.recoveryData = null;
    localStorage.removeItem(RECOVERY_KEY);
    this.notify();
  }

  markDirty(): void {
    if (!this.state.isDirty) {
      this.state.isDirty = true;
      this.notify();
    }
  }

  private startDirtyCheck(): void {
    this.dirtyCheckTimer = window.setInterval(() => {
      const currentSnapshot = this.takeSnapshotString();
      if (currentSnapshot !== this.lastSnapshot) {
        this.markDirty();
      }
    }, 5000);
  }

  private takeSnapshot(): void {
    this.lastSnapshot = this.takeSnapshotString();
  }

  private takeSnapshotString(): string {
    try {
      return JSON.stringify({
        timeline: timelineEngine.serialize(),
        automation: automationEngine.serialize(),
        midi: midiEngine.serialize(),
      });
    } catch {
      return '';
    }
  }

  setProjectMetadata(updates: Partial<ProjectMetadata>): void {
    if (!this.state.currentProject) return;

    this.state.currentProject = {
      ...this.state.currentProject,
      ...updates,
      modifiedAt: Date.now(),
    };
    
    this.markDirty();
    this.notify();
  }

  exportProject(): string {
    if (!this.state.currentProject) {
      throw new Error('No project to export');
    }

    const projectState = this.serializeProject();
    return JSON.stringify(projectState, null, 2);
  }

  async saveToBackend(projectId?: string): Promise<{ success: boolean; projectId: string }> {
    const projectState = this.serializeProject();
    const metadata = this.state.currentProject;
    
    const payload = {
      title: metadata?.name || 'Untitled Project',
      tempo: metadata?.tempo || 120,
      timeSignature: metadata?.timeSignature ? 
        `${metadata.timeSignature.numerator}/${metadata.timeSignature.denominator}` : '4/4',
      sampleRate: metadata?.sampleRate || 48000,
      bitDepth: metadata?.bitDepth || 24,
      description: metadata?.description || '',
      dawState: JSON.stringify(projectState),
      version: metadata?.version || 1,
    };

    try {
      if (projectId) {
        const response = await fetch(`/api/studio/projects/${projectId}/save-daw-state`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        
        if (!response.ok) throw new Error('Failed to save project');
        
        this.state.isDirty = false;
        if (this.state.currentProject) {
          this.state.currentProject.lastSavedAt = Date.now();
        }
        this.notify();
        
        return { success: true, projectId };
      } else {
        const response = await fetch('/api/studio/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        
        if (!response.ok) throw new Error('Failed to create project');
        
        const data = await response.json();
        const newProjectId = data.id;
        
        if (this.state.currentProject) {
          this.state.currentProject.id = newProjectId;
          this.state.currentProject.lastSavedAt = Date.now();
        }
        this.state.isDirty = false;
        this.notify();
        
        return { success: true, projectId: newProjectId };
      }
    } catch (error) {
      logger.error('[ProjectManager] Backend save failed:', error);
      throw error;
    }
  }

  async loadFromBackend(projectId: string): Promise<boolean> {
    try {
      const response = await fetch(`/api/studio/projects/${projectId}/daw-state`);
      if (!response.ok) {
        logger.warn('[ProjectManager] No DAW state found for project');
        return false;
      }

      const data = await response.json();
      
      if (data.dawState) {
        const projectState: ProjectState = JSON.parse(data.dawState);
        this.deserializeProject(projectState);
        this.state.currentProject = projectState.metadata;
        this.state.isDirty = false;
        this.takeSnapshot();
        this.startAutosave();
        this.notify();
        return true;
      }
      
      if (data.project) {
        this.state.currentProject = {
          id: data.project.id,
          name: data.project.title || 'Untitled',
          version: 1,
          createdAt: new Date(data.project.createdAt).getTime(),
          modifiedAt: data.project.updatedAt ? new Date(data.project.updatedAt).getTime() : Date.now(),
          lastSavedAt: null,
          sampleRate: data.project.sampleRate || 48000,
          bitDepth: data.project.bitDepth || 24,
          tempo: data.project.bpm || data.project.tempo || 120,
          timeSignature: { numerator: 4, denominator: 4 },
          duration: 300,
          author: '',
          description: data.project.description || '',
          tags: data.project.tags || [],
        };
        this.state.isDirty = false;
        this.startAutosave();
        this.notify();
      }

      return true;
    } catch (error) {
      logger.error('[ProjectManager] Backend load failed:', error);
      return false;
    }
  }

  async listBackendProjects(): Promise<Array<{ id: string; name: string; updatedAt: string }>> {
    try {
      const response = await fetch('/api/studio/projects');
      if (!response.ok) throw new Error('Failed to fetch projects');
      const projects = await response.json();
      return projects.map((p: any) => ({
        id: p.id,
        name: p.title,
        updatedAt: p.updatedAt || p.createdAt,
      }));
    } catch (error) {
      logger.error('[ProjectManager] Failed to list projects:', error);
      return [];
    }
  }

  getProjectStats(): {
    trackCount: number;
    clipCount: number;
    pluginCount: number;
    automationPoints: number;
    mediaItems: number;
    estimatedSize: number;
  } {
    const timeline = timelineEngine.getState();
    const automation = automationEngine.getState();
    const midi = midiEngine.getState();
    const audio = nonDestructiveAudio.getState();
    const plugins = pluginStateManager.getState();

    return {
      trackCount: timeline.events.filter(e => e.type === 'audio' || e.type === 'midi').length,
      clipCount: midi.clips.length + audio.events.length,
      pluginCount: plugins.plugins.length,
      automationPoints: automation.lanes.reduce((sum, l) => sum + l.points.length, 0),
      mediaItems: this.state.mediaPool.length,
      estimatedSize: JSON.stringify(this.serializeProject()).length,
    };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach(l => l());
  }

  dispose(): void {
    this.stopAutosave();
    if (this.dirtyCheckTimer !== null) {
      clearInterval(this.dirtyCheckTimer);
    }
    this.listeners.clear();
  }
}

export const projectManager = new ProjectManager();
