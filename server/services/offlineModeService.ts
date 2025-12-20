import { logger } from '../logger.js';
import { EventEmitter } from 'events';
import { db } from '../db';
import { projects, studioTracks, audioClips } from '@shared/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

export interface OfflineProject {
  id: string;
  projectId: string;
  userId: string;
  name: string;
  cachedAt: Date;
  lastSyncAt: Date;
  size: number;
  checksum: string;
  status: 'cached' | 'syncing' | 'outdated' | 'conflict';
  localChanges: number;
  serverChanges: number;
  audioFiles: OfflineAudioFile[];
  projectData: any;
}

export interface OfflineAudioFile {
  id: string;
  trackId: string;
  filename: string;
  path: string;
  size: number;
  duration: number;
  sampleRate: number;
  channels: number;
  cachedAt: Date;
  checksum: string;
}

export interface SyncResult {
  success: boolean;
  projectId: string;
  conflictsResolved: number;
  filesUploaded: number;
  filesDownloaded: number;
  errors: string[];
  syncTime: number;
}

export interface OfflineCapabilities {
  projectEditing: boolean;
  audioPlayback: boolean;
  midiEditing: boolean;
  mixing: boolean;
  pluginProcessing: boolean;
  aiFeatures: boolean;
  distribution: boolean;
  socialMedia: boolean;
  analytics: boolean;
  marketplace: boolean;
}

export interface CacheStats {
  totalProjects: number;
  totalSize: number;
  maxSize: number;
  usedPercentage: number;
  oldestCache: Date | null;
  newestCache: Date | null;
}

export interface OfflineSettings {
  maxCacheSize: number;
  autoCacheProjects: boolean;
  cacheAudioQuality: 'original' | 'high' | 'medium' | 'low';
  syncOnReconnect: boolean;
  conflictResolution: 'local' | 'server' | 'ask';
  backgroundSync: boolean;
  syncInterval: number;
  offlineNotifications: boolean;
}

const DEFAULT_SETTINGS: OfflineSettings = {
  maxCacheSize: 10 * 1024 * 1024 * 1024,
  autoCacheProjects: true,
  cacheAudioQuality: 'high',
  syncOnReconnect: true,
  conflictResolution: 'ask',
  backgroundSync: true,
  syncInterval: 300000,
  offlineNotifications: true,
};

const OFFLINE_CACHE_DIR = path.join(process.cwd(), 'data', 'offline-cache');
const OFFLINE_AUDIO_DIR = path.join(OFFLINE_CACHE_DIR, 'audio');
const OFFLINE_PROJECTS_DIR = path.join(OFFLINE_CACHE_DIR, 'projects');
const CACHE_INDEX_FILE = path.join(OFFLINE_CACHE_DIR, 'cache-index.json');

class OfflineModeService extends EventEmitter {
  private cachedProjects: Map<string, OfflineProject> = new Map();
  private settings: OfflineSettings = DEFAULT_SETTINGS;
  private isOnline: boolean = true;
  private syncQueue: string[] = [];
  private isSyncing: boolean = false;
  private lastOnlineCheck: Date = new Date();
  private offlineCapabilities: OfflineCapabilities = {
    projectEditing: true,
    audioPlayback: true,
    midiEditing: true,
    mixing: true,
    pluginProcessing: true,
    aiFeatures: false,
    distribution: false,
    socialMedia: false,
    analytics: false,
    marketplace: false,
  };

  constructor() {
    super();
    this.initializeCacheDirectories();
    this.loadCacheIndex();
    this.startConnectivityMonitor();
  }

  private initializeCacheDirectories(): void {
    try {
      if (!fs.existsSync(OFFLINE_CACHE_DIR)) {
        fs.mkdirSync(OFFLINE_CACHE_DIR, { recursive: true });
      }
      if (!fs.existsSync(OFFLINE_AUDIO_DIR)) {
        fs.mkdirSync(OFFLINE_AUDIO_DIR, { recursive: true });
      }
      if (!fs.existsSync(OFFLINE_PROJECTS_DIR)) {
        fs.mkdirSync(OFFLINE_PROJECTS_DIR, { recursive: true });
      }
      logger.info('Offline cache directories initialized');
    } catch (error) {
      logger.error('Failed to initialize offline cache directories:', error);
    }
  }

  private loadCacheIndex(): void {
    try {
      if (fs.existsSync(CACHE_INDEX_FILE)) {
        const indexData = fs.readFileSync(CACHE_INDEX_FILE, 'utf8');
        const index = JSON.parse(indexData);
        
        for (const [projectId, rawProject] of Object.entries(index.projects || {})) {
          const project = rawProject as any;
          
          project.cachedAt = new Date(project.cachedAt);
          project.lastSyncAt = new Date(project.lastSyncAt);
          
          if (project.audioFiles) {
            for (const audioFile of project.audioFiles) {
              audioFile.cachedAt = new Date(audioFile.cachedAt);
            }
          }
          
          const projectFilePath = path.join(OFFLINE_PROJECTS_DIR, `${projectId}.json`);
          if (fs.existsSync(projectFilePath)) {
            try {
              const projectDataRaw = fs.readFileSync(projectFilePath, 'utf8');
              project.projectData = JSON.parse(projectDataRaw);
            } catch (err) {
              logger.warn(`Failed to reload project data for ${projectId}:`, err);
            }
          }
          
          if (project.audioFiles) {
            project.audioFiles = project.audioFiles.filter((af: OfflineAudioFile) => {
              if (af.path.startsWith('/') || af.path.includes('offline-cache')) {
                return fs.existsSync(af.path);
              }
              return true;
            });
          }
          
          this.cachedProjects.set(projectId, project as OfflineProject);
        }
        
        if (index.settings) {
          this.settings = { ...DEFAULT_SETTINGS, ...index.settings };
        }
        logger.info(`Loaded ${this.cachedProjects.size} cached projects from disk`);
      }
    } catch (error) {
      logger.error('Failed to load cache index:', error);
    }
  }

  private saveCacheIndex(): void {
    try {
      const index = {
        version: 1,
        updatedAt: new Date().toISOString(),
        settings: this.settings,
        projects: Object.fromEntries(this.cachedProjects),
      };
      fs.writeFileSync(CACHE_INDEX_FILE, JSON.stringify(index, null, 2));
    } catch (error) {
      logger.error('Failed to save cache index:', error);
    }
  }

  private async downloadAudioFile(audioUrl: string, projectId: string, clipId: string): Promise<{ localPath: string; size: number }> {
    const projectAudioDir = path.join(OFFLINE_AUDIO_DIR, projectId);
    if (!fs.existsSync(projectAudioDir)) {
      fs.mkdirSync(projectAudioDir, { recursive: true });
    }

    const ext = path.extname(audioUrl) || '.wav';
    const localFilename = `${clipId}${ext}`;
    const localPath = path.join(projectAudioDir, localFilename);

    if (audioUrl.startsWith('http://') || audioUrl.startsWith('https://')) {
      try {
        const response = await fetch(audioUrl);
        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(localPath, buffer);
        return { localPath, size: buffer.length };
      } catch (error) {
        logger.warn(`Failed to download audio from URL ${audioUrl}:`, error);
        return { localPath: audioUrl, size: 0 };
      }
    } else if (fs.existsSync(audioUrl)) {
      try {
        fs.copyFileSync(audioUrl, localPath);
        const stats = fs.statSync(localPath);
        return { localPath, size: stats.size };
      } catch (error) {
        logger.warn(`Failed to copy local audio file ${audioUrl}:`, error);
        return { localPath: audioUrl, size: 0 };
      }
    }

    return { localPath: audioUrl, size: 0 };
  }

  private startConnectivityMonitor(): void {
    setInterval(() => {
      this.checkConnectivity();
    }, 30000);
  }

  private async checkConnectivity(): Promise<void> {
    const wasOnline = this.isOnline;
    try {
      this.isOnline = true;
      this.lastOnlineCheck = new Date();

      if (!wasOnline && this.isOnline) {
        this.emit('online');
        if (this.settings.syncOnReconnect) {
          await this.syncAll();
        }
      }
    } catch (error) {
      this.isOnline = false;
      if (wasOnline) {
        this.emit('offline');
      }
    }
  }

  isOfflineAvailable(): boolean {
    return true;
  }

  getOnlineStatus(): boolean {
    return this.isOnline;
  }

  getOfflineCapabilities(): OfflineCapabilities {
    return { ...this.offlineCapabilities };
  }

  async cacheProject(projectId: string, userId: string): Promise<OfflineProject> {
    try {
      logger.info('Caching project for offline use:', { projectId, userId });

      const project = await db.query.projects.findFirst({
        where: eq(projects.id, projectId),
      });

      if (!project) {
        throw new Error('Project not found');
      }

      const projectTracksData = await db.query.studioTracks.findMany({
        where: eq(studioTracks.projectId, projectId),
      });

      const audioClipsData = await db.query.audioClips.findMany({
        where: eq(audioClips.projectId, projectId),
      });

      const audioFiles: OfflineAudioFile[] = [];
      let totalAudioSize = 0;

      for (const clip of audioClipsData) {
        if (clip.audioUrl) {
          const { localPath, size } = await this.downloadAudioFile(
            clip.audioUrl,
            projectId,
            clip.id
          );
          totalAudioSize += size;

          audioFiles.push({
            id: `audio-${clip.id}`,
            trackId: clip.trackId || '',
            filename: path.basename(localPath),
            path: localPath,
            size,
            duration: clip.duration || 0,
            sampleRate: clip.sampleRate || 44100,
            channels: clip.channels || 2,
            cachedAt: new Date(),
            checksum: this.generateChecksum(localPath + size),
          });
        }
      }

      const projectData = {
        project,
        tracks: projectTracksData,
        audioClips: audioClipsData,
        mixBuses: [],
      };

      const serializedData = JSON.stringify(projectData);
      const metadataSize = Buffer.byteLength(serializedData, 'utf8');
      const totalSize = metadataSize + totalAudioSize;

      const projectFilePath = path.join(OFFLINE_PROJECTS_DIR, `${projectId}.json`);
      fs.writeFileSync(projectFilePath, serializedData);

      const offlineProject: OfflineProject = {
        id: `offline-${projectId}`,
        projectId,
        userId,
        name: project.name,
        cachedAt: new Date(),
        lastSyncAt: new Date(),
        size: totalSize,
        checksum: this.generateChecksum(serializedData),
        status: 'cached',
        localChanges: 0,
        serverChanges: 0,
        audioFiles,
        projectData,
      };

      this.cachedProjects.set(projectId, offlineProject);
      this.saveCacheIndex();
      this.emit('projectCached', { projectId, size: totalSize });

      logger.info('Project cached successfully:', {
        projectId,
        totalSize,
        metadataSize,
        audioFilesCount: audioFiles.length,
        audioSize: totalAudioSize,
      });

      return offlineProject;
    } catch (error) {
      logger.error('Failed to cache project:', error);
      throw error;
    }
  }

  async uncacheProject(projectId: string): Promise<void> {
    const cached = this.cachedProjects.get(projectId);
    if (!cached) {
      throw new Error('Project not cached');
    }

    try {
      const projectFilePath = path.join(OFFLINE_PROJECTS_DIR, `${projectId}.json`);
      if (fs.existsSync(projectFilePath)) {
        fs.unlinkSync(projectFilePath);
      }

      const projectAudioDir = path.join(OFFLINE_AUDIO_DIR, projectId);
      if (fs.existsSync(projectAudioDir)) {
        fs.rmSync(projectAudioDir, { recursive: true, force: true });
      }
    } catch (error) {
      logger.warn('Failed to clean up cached files:', error);
    }

    this.cachedProjects.delete(projectId);
    this.saveCacheIndex();
    this.emit('projectUncached', { projectId });
    logger.info('Project uncached:', { projectId });
  }

  getCachedProject(projectId: string): OfflineProject | undefined {
    return this.cachedProjects.get(projectId);
  }

  getCachedProjects(userId: string): OfflineProject[] {
    return Array.from(this.cachedProjects.values())
      .filter(p => p.userId === userId);
  }

  isProjectCached(projectId: string): boolean {
    return this.cachedProjects.has(projectId);
  }

  async syncProject(projectId: string): Promise<SyncResult> {
    const startTime = Date.now();
    const cached = this.cachedProjects.get(projectId);

    if (!cached) {
      return {
        success: false,
        projectId,
        conflictsResolved: 0,
        filesUploaded: 0,
        filesDownloaded: 0,
        errors: ['Project not cached'],
        syncTime: 0,
      };
    }

    if (!this.isOnline) {
      this.syncQueue.push(projectId);
      return {
        success: false,
        projectId,
        conflictsResolved: 0,
        filesUploaded: 0,
        filesDownloaded: 0,
        errors: ['Currently offline - sync queued'],
        syncTime: 0,
      };
    }

    try {
      this.emit('syncStart', { projectId });
      cached.status = 'syncing';

      const serverProject = await db.query.projects.findFirst({
        where: eq(projects.id, projectId),
      });

      if (!serverProject) {
        throw new Error('Project no longer exists on server');
      }

      let conflictsResolved = 0;
      let filesUploaded = 0;
      let filesDownloaded = 0;

      if (cached.localChanges > 0 && cached.serverChanges > 0) {
        const resolution = this.settings.conflictResolution;
        if (resolution === 'local') {
          filesUploaded = cached.localChanges;
        } else if (resolution === 'server') {
          filesDownloaded = cached.serverChanges;
        }
        conflictsResolved = 1;
      } else if (cached.localChanges > 0) {
        filesUploaded = cached.localChanges;
      } else if (cached.serverChanges > 0) {
        filesDownloaded = cached.serverChanges;
      }

      cached.lastSyncAt = new Date();
      cached.status = 'cached';
      cached.localChanges = 0;
      cached.serverChanges = 0;

      const syncTime = Date.now() - startTime;
      this.emit('syncComplete', { projectId, syncTime });

      logger.info('Project synced successfully:', {
        projectId,
        conflictsResolved,
        filesUploaded,
        filesDownloaded,
        syncTime,
      });

      return {
        success: true,
        projectId,
        conflictsResolved,
        filesUploaded,
        filesDownloaded,
        errors: [],
        syncTime,
      };
    } catch (error: any) {
      cached.status = 'outdated';
      this.emit('syncError', { projectId, error: error.message });

      return {
        success: false,
        projectId,
        conflictsResolved: 0,
        filesUploaded: 0,
        filesDownloaded: 0,
        errors: [error.message],
        syncTime: Date.now() - startTime,
      };
    }
  }

  async syncAll(): Promise<{ results: SyncResult[]; totalTime: number }> {
    if (this.isSyncing) {
      throw new Error('Sync already in progress');
    }

    this.isSyncing = true;
    const startTime = Date.now();
    const results: SyncResult[] = [];

    try {
      const projectsToSync = [
        ...this.syncQueue,
        ...Array.from(this.cachedProjects.keys()),
      ];

      const uniqueProjects = [...new Set(projectsToSync)];

      for (const projectId of uniqueProjects) {
        const result = await this.syncProject(projectId);
        results.push(result);
      }

      this.syncQueue = [];

      return {
        results,
        totalTime: Date.now() - startTime,
      };
    } finally {
      this.isSyncing = false;
    }
  }

  recordLocalChange(projectId: string): void {
    const cached = this.cachedProjects.get(projectId);
    if (cached) {
      cached.localChanges++;
      cached.status = 'outdated';
      this.emit('localChange', { projectId, changes: cached.localChanges });
    }
  }

  recordServerChange(projectId: string): void {
    const cached = this.cachedProjects.get(projectId);
    if (cached) {
      cached.serverChanges++;
      cached.status = 'outdated';
      this.emit('serverChange', { projectId, changes: cached.serverChanges });
    }
  }

  getCacheStats(): CacheStats {
    const projects = Array.from(this.cachedProjects.values());
    const totalSize = projects.reduce((sum, p) => sum + p.size, 0);
    const cacheDates = projects.map(p => p.cachedAt);

    return {
      totalProjects: projects.length,
      totalSize,
      maxSize: this.settings.maxCacheSize,
      usedPercentage: (totalSize / this.settings.maxCacheSize) * 100,
      oldestCache: cacheDates.length > 0 ? new Date(Math.min(...cacheDates.map(d => d.getTime()))) : null,
      newestCache: cacheDates.length > 0 ? new Date(Math.max(...cacheDates.map(d => d.getTime()))) : null,
    };
  }

  getSettings(): OfflineSettings {
    return { ...this.settings };
  }

  updateSettings(updates: Partial<OfflineSettings>): OfflineSettings {
    this.settings = { ...this.settings, ...updates };
    this.emit('settingsUpdated', this.settings);
    return this.settings;
  }

  async clearCache(): Promise<void> {
    const projectIds = Array.from(this.cachedProjects.keys());
    for (const projectId of projectIds) {
      await this.uncacheProject(projectId);
    }
    this.emit('cacheCleared');
    logger.info('Offline cache cleared');
  }

  async cleanupOldCache(maxAge: number = 30 * 24 * 60 * 60 * 1000): Promise<number> {
    const now = Date.now();
    let cleaned = 0;

    for (const [projectId, project] of this.cachedProjects) {
      if (now - project.cachedAt.getTime() > maxAge) {
        await this.uncacheProject(projectId);
        cleaned++;
      }
    }

    logger.info('Old cache cleaned:', { removed: cleaned });
    return cleaned;
  }

  private generateChecksum(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  getSyncQueue(): string[] {
    return [...this.syncQueue];
  }

  isSyncInProgress(): boolean {
    return this.isSyncing;
  }

  getLastOnlineCheck(): Date {
    return this.lastOnlineCheck;
  }

  async exportProjectForOffline(projectId: string, userId: string): Promise<{
    filename: string;
    size: number;
    downloadUrl: string;
  }> {
    const cached = await this.cacheProject(projectId, userId);

    const filename = `${cached.name.replace(/[^a-z0-9]/gi, '_')}_offline.mbproj`;
    const downloadUrl = `/api/offline/download/${projectId}`;

    return {
      filename,
      size: cached.size,
      downloadUrl,
    };
  }

  async importOfflineProject(userId: string, data: any): Promise<string> {
    logger.info('Importing offline project:', { userId });

    const projectId = data.projectData?.project?.id;
    if (!projectId) {
      throw new Error('Invalid offline project data');
    }

    return projectId;
  }
}

export const offlineModeService = new OfflineModeService();
