import { useStudioStore } from '@/stores/studioStore';
import { commandManager } from '../commands';

export interface ProjectMetadata {
  id: string;
  name: string;
  createdAt: number;
  modifiedAt: number;
  version: number;
  sampleRate: number;
  tempo: number;
  timeSignatureNum: number;
  timeSignatureDen: number;
  author?: string;
  description?: string;
  tags?: string[];
}

export interface ProjectSnapshot {
  metadata: ProjectMetadata;
  tracks: any[];
  transport: any;
  view: any;
  mixer: any;
  masterTrack: any;
  commandHistoryLength: number;
}

export interface AutosaveEntry {
  id: string;
  projectId: string;
  timestamp: number;
  snapshotKey: string;
  reason: 'interval' | 'manual' | 'beforeAction' | 'recovery';
}

export interface MediaPoolItem {
  id: string;
  name: string;
  type: 'audio' | 'midi' | 'video' | 'image';
  path: string;
  duration?: number;
  sampleRate?: number;
  channels?: number;
  fileSize: number;
  addedAt: number;
  usageCount: number;
  metadata?: Record<string, any>;
}

export class ProjectManager {
  private autosaveInterval: number | null = null;
  private autosaveIntervalMs = 60000;
  private maxAutosaves = 10;
  private isDirty = false;
  private lastSaveTime = 0;
  private autosaveEntries: AutosaveEntry[] = [];
  private mediaPool: Map<string, MediaPoolItem> = new Map();
  private storageKey = 'maxbooster_project_';
  private autosaveStorageKey = 'maxbooster_autosave_';
  private recoveryStorageKey = 'maxbooster_recovery_';
  private listeners: Set<(event: ProjectEvent) => void> = new Set();
  
  constructor() {
    this.loadRecoveryData();
    this.setupBeforeUnloadHandler();
  }
  
  subscribe(listener: (event: ProjectEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  
  private emit(event: ProjectEvent): void {
    this.listeners.forEach(l => l(event));
  }
  
  private setupBeforeUnloadHandler(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', (e) => {
        if (this.isDirty) {
          this.saveRecoverySnapshot();
          e.preventDefault();
          e.returnValue = '';
        }
      });
    }
  }
  
  startAutosave(intervalMs: number = 60000): void {
    this.autosaveIntervalMs = intervalMs;
    
    if (this.autosaveInterval) {
      clearInterval(this.autosaveInterval);
    }
    
    this.autosaveInterval = window.setInterval(() => {
      if (this.isDirty) {
        this.createAutosave('interval');
      }
    }, this.autosaveIntervalMs);
    
    this.emit({ type: 'autosave_started', intervalMs });
  }
  
  stopAutosave(): void {
    if (this.autosaveInterval) {
      clearInterval(this.autosaveInterval);
      this.autosaveInterval = null;
    }
    this.emit({ type: 'autosave_stopped' });
  }
  
  markDirty(): void {
    this.isDirty = true;
    this.emit({ type: 'dirty_changed', isDirty: true });
  }
  
  markClean(): void {
    this.isDirty = false;
    this.lastSaveTime = Date.now();
    this.emit({ type: 'dirty_changed', isDirty: false });
  }
  
  get isProjectDirty(): boolean {
    return this.isDirty;
  }
  
  createSnapshot(): ProjectSnapshot {
    const state = useStudioStore.getState();
    
    return {
      metadata: {
        id: state.project?.id || `project-${Date.now()}`,
        name: state.project?.name || 'Untitled Project',
        createdAt: state.project?.createdAt || Date.now(),
        modifiedAt: Date.now(),
        version: (state.project?.version || 0) + 1,
        sampleRate: state.project?.sampleRate || 48000,
        tempo: state.transport?.tempo || 120,
        timeSignatureNum: state.transport?.timeSignatureNum || 4,
        timeSignatureDen: state.transport?.timeSignatureDen || 4,
        author: state.project?.author,
        description: state.project?.description,
        tags: state.project?.tags,
      },
      tracks: JSON.parse(JSON.stringify(state.tracks || [])),
      transport: JSON.parse(JSON.stringify(state.transport || {})),
      view: JSON.parse(JSON.stringify(state.view || {})),
      mixer: JSON.parse(JSON.stringify(state.mixer || {})),
      masterTrack: JSON.parse(JSON.stringify(state.masterTrack || {})),
      commandHistoryLength: commandManager.getHistory().length,
    };
  }
  
  restoreSnapshot(snapshot: ProjectSnapshot): void {
    useStudioStore.setState({
      project: snapshot.metadata as any,
      tracks: snapshot.tracks,
      transport: snapshot.transport,
      view: snapshot.view,
      mixer: snapshot.mixer,
      masterTrack: snapshot.masterTrack,
    });
    
    commandManager.clear();
    this.markClean();
    this.emit({ type: 'snapshot_restored', snapshot });
  }
  
  async saveProject(projectId?: string): Promise<string> {
    const snapshot = this.createSnapshot();
    const id = projectId || snapshot.metadata.id;
    
    try {
      localStorage.setItem(
        this.storageKey + id,
        JSON.stringify(snapshot)
      );
      
      this.markClean();
      this.emit({ type: 'project_saved', projectId: id });
      return id;
    } catch (error) {
      this.emit({ type: 'save_error', error: error as Error });
      throw error;
    }
  }
  
  async loadProject(projectId: string): Promise<ProjectSnapshot | null> {
    try {
      const data = localStorage.getItem(this.storageKey + projectId);
      if (!data) return null;
      
      const snapshot = JSON.parse(data) as ProjectSnapshot;
      this.restoreSnapshot(snapshot);
      this.emit({ type: 'project_loaded', projectId, snapshot });
      return snapshot;
    } catch (error) {
      this.emit({ type: 'load_error', error: error as Error });
      return null;
    }
  }
  
  createAutosave(reason: AutosaveEntry['reason'] = 'manual'): AutosaveEntry | null {
    try {
      const snapshot = this.createSnapshot();
      const entry: AutosaveEntry = {
        id: `autosave-${Date.now()}`,
        projectId: snapshot.metadata.id,
        timestamp: Date.now(),
        snapshotKey: `${this.autosaveStorageKey}${snapshot.metadata.id}_${Date.now()}`,
        reason,
      };
      
      localStorage.setItem(entry.snapshotKey, JSON.stringify(snapshot));
      
      this.autosaveEntries.push(entry);
      this.pruneAutosaves(snapshot.metadata.id);
      
      localStorage.setItem(
        `${this.autosaveStorageKey}index_${snapshot.metadata.id}`,
        JSON.stringify(this.autosaveEntries.filter(e => e.projectId === snapshot.metadata.id))
      );
      
      this.emit({ type: 'autosave_created', entry });
      return entry;
    } catch (error) {
      this.emit({ type: 'autosave_error', error: error as Error });
      return null;
    }
  }
  
  private pruneAutosaves(projectId: string): void {
    const projectAutosaves = this.autosaveEntries
      .filter(e => e.projectId === projectId)
      .sort((a, b) => b.timestamp - a.timestamp);
    
    if (projectAutosaves.length > this.maxAutosaves) {
      const toRemove = projectAutosaves.slice(this.maxAutosaves);
      toRemove.forEach(entry => {
        localStorage.removeItem(entry.snapshotKey);
        const index = this.autosaveEntries.findIndex(e => e.id === entry.id);
        if (index !== -1) {
          this.autosaveEntries.splice(index, 1);
        }
      });
    }
  }
  
  getAutosaves(projectId: string): AutosaveEntry[] {
    return this.autosaveEntries
      .filter(e => e.projectId === projectId)
      .sort((a, b) => b.timestamp - a.timestamp);
  }
  
  async restoreAutosave(entryId: string): Promise<boolean> {
    const entry = this.autosaveEntries.find(e => e.id === entryId);
    if (!entry) return false;
    
    try {
      const data = localStorage.getItem(entry.snapshotKey);
      if (!data) return false;
      
      const snapshot = JSON.parse(data) as ProjectSnapshot;
      this.restoreSnapshot(snapshot);
      this.emit({ type: 'autosave_restored', entry, snapshot });
      return true;
    } catch {
      return false;
    }
  }
  
  saveRecoverySnapshot(): void {
    try {
      const snapshot = this.createSnapshot();
      localStorage.setItem(
        `${this.recoveryStorageKey}${snapshot.metadata.id}`,
        JSON.stringify({
          snapshot,
          timestamp: Date.now(),
          url: typeof window !== 'undefined' ? window.location.href : '',
        })
      );
    } catch {
    }
  }
  
  private loadRecoveryData(): void {
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(this.autosaveStorageKey + 'index_'));
      keys.forEach(key => {
        const data = localStorage.getItem(key);
        if (data) {
          const entries = JSON.parse(data) as AutosaveEntry[];
          this.autosaveEntries.push(...entries);
        }
      });
    } catch {
    }
  }
  
  checkForRecovery(): { projectId: string; timestamp: number } | null {
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(this.recoveryStorageKey));
      if (keys.length === 0) return null;
      
      const latest = keys
        .map(key => {
          const data = localStorage.getItem(key);
          if (!data) return null;
          const parsed = JSON.parse(data);
          return {
            key,
            projectId: parsed.snapshot?.metadata?.id,
            timestamp: parsed.timestamp,
          };
        })
        .filter(Boolean)
        .sort((a, b) => (b?.timestamp || 0) - (a?.timestamp || 0))[0];
      
      return latest ? { projectId: latest.projectId, timestamp: latest.timestamp } : null;
    } catch {
      return null;
    }
  }
  
  async recoverCrashedProject(projectId: string): Promise<boolean> {
    try {
      const data = localStorage.getItem(`${this.recoveryStorageKey}${projectId}`);
      if (!data) return false;
      
      const { snapshot } = JSON.parse(data);
      this.restoreSnapshot(snapshot);
      
      localStorage.removeItem(`${this.recoveryStorageKey}${projectId}`);
      this.emit({ type: 'crash_recovered', projectId, snapshot });
      return true;
    } catch {
      return false;
    }
  }
  
  clearRecoveryData(projectId: string): void {
    localStorage.removeItem(`${this.recoveryStorageKey}${projectId}`);
  }
  
  addToMediaPool(item: Omit<MediaPoolItem, 'id' | 'addedAt' | 'usageCount'>): MediaPoolItem {
    const newItem: MediaPoolItem = {
      ...item,
      id: `media-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      addedAt: Date.now(),
      usageCount: 0,
    };
    
    this.mediaPool.set(newItem.id, newItem);
    this.emit({ type: 'media_added', item: newItem });
    return newItem;
  }
  
  removeFromMediaPool(itemId: string): boolean {
    const item = this.mediaPool.get(itemId);
    if (!item) return false;
    
    this.mediaPool.delete(itemId);
    this.emit({ type: 'media_removed', itemId });
    return true;
  }
  
  getMediaPoolItems(type?: MediaPoolItem['type']): MediaPoolItem[] {
    const items = Array.from(this.mediaPool.values());
    return type ? items.filter(i => i.type === type) : items;
  }
  
  getMediaItem(itemId: string): MediaPoolItem | undefined {
    return this.mediaPool.get(itemId);
  }
  
  incrementMediaUsage(itemId: string): void {
    const item = this.mediaPool.get(itemId);
    if (item) {
      item.usageCount++;
    }
  }
  
  decrementMediaUsage(itemId: string): void {
    const item = this.mediaPool.get(itemId);
    if (item && item.usageCount > 0) {
      item.usageCount--;
    }
  }
  
  getUnusedMedia(): MediaPoolItem[] {
    return Array.from(this.mediaPool.values()).filter(i => i.usageCount === 0);
  }
  
  cleanUnusedMedia(): number {
    const unused = this.getUnusedMedia();
    unused.forEach(item => this.mediaPool.delete(item.id));
    this.emit({ type: 'media_cleaned', count: unused.length });
    return unused.length;
  }
  
  exportProject(): string {
    const snapshot = this.createSnapshot();
    const mediaItems = Array.from(this.mediaPool.values());
    
    return JSON.stringify({
      version: '1.0',
      exportedAt: Date.now(),
      snapshot,
      mediaPool: mediaItems,
    });
  }
  
  importProject(data: string): boolean {
    try {
      const parsed = JSON.parse(data);
      if (!parsed.snapshot) return false;
      
      this.restoreSnapshot(parsed.snapshot);
      
      if (parsed.mediaPool) {
        this.mediaPool.clear();
        parsed.mediaPool.forEach((item: MediaPoolItem) => {
          this.mediaPool.set(item.id, item);
        });
      }
      
      this.emit({ type: 'project_imported' });
      return true;
    } catch {
      return false;
    }
  }
}

export type ProjectEvent =
  | { type: 'autosave_started'; intervalMs: number }
  | { type: 'autosave_stopped' }
  | { type: 'dirty_changed'; isDirty: boolean }
  | { type: 'project_saved'; projectId: string }
  | { type: 'project_loaded'; projectId: string; snapshot: ProjectSnapshot }
  | { type: 'save_error'; error: Error }
  | { type: 'load_error'; error: Error }
  | { type: 'autosave_created'; entry: AutosaveEntry }
  | { type: 'autosave_error'; error: Error }
  | { type: 'autosave_restored'; entry: AutosaveEntry; snapshot: ProjectSnapshot }
  | { type: 'snapshot_restored'; snapshot: ProjectSnapshot }
  | { type: 'crash_recovered'; projectId: string; snapshot: ProjectSnapshot }
  | { type: 'media_added'; item: MediaPoolItem }
  | { type: 'media_removed'; itemId: string }
  | { type: 'media_cleaned'; count: number }
  | { type: 'project_imported' };

export const projectManager = new ProjectManager();
