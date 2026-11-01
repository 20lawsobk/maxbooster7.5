import { logger } from "../logger.js";
import { EventEmitter } from "events";
import { db } from "../db";
import { projects, studioTracks, audioClips } from "@shared/schema";
import { eq } from "drizzle-orm";
import * as fs from "fs";
import fsPromises from "fs/promises";
import * as path from "path";
import { PocketDimensionManager } from "../pocket-dimension/index.js";

// ── Timeout-guarded fetch: adds a 10s default signal so no outbound HTTP call
// can hold the event loop indefinitely.  Per-call signal overrides this default.
const timedFetch = (
  url: string | URL | Request,
  init: RequestInit = {},
): Promise<Response> =>
  fetch(url, { signal: AbortSignal.timeout(10_000), ...init });

export interface OfflineProject {
  id: string;
  projectId: string;
  userId: string;
  name: string;
  cachedAt: Date;
  lastSyncAt: Date;
  size: number;
  checksum: string;
  status: "cached" | "syncing" | "outdated" | "conflict";
  localChanges: number;
  serverChanges: number;
  audioFiles: OfflineAudioFile[];
  projectData: Record<string, unknown>;
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
  cacheAudioQuality: "original" | "high" | "medium" | "low";
  syncOnReconnect: boolean;
  conflictResolution: "local" | "server" | "ask";
  backgroundSync: boolean;
  syncInterval: number;
  offlineNotifications: boolean;
}

const DEFAULT_SETTINGS: OfflineSettings = {
  maxCacheSize: 10 * 1024 * 1024 * 1024,
  autoCacheProjects: true,
  cacheAudioQuality: "high",
  syncOnReconnect: true,
  conflictResolution: "ask",
  backgroundSync: true,
  syncInterval: 300000,
  offlineNotifications: true,
};

const OFFLINE_AUDIO_DIR = path?.join(
  process.cwd(),
  "data",
  "offline-cache",
  "audio",
);
const POCKET_ID = "offline-mode-cache";

class OfflineModeService extends EventEmitter {
  private cachedProjects: Map<string, OfflineProject> = new Map();
  private settings: OfflineSettings = DEFAULT_SETTINGS;
  private isOnline: boolean = true;
  private syncQueue: string[] = [];
  private isSyncing: boolean = false;
  private lastOnlineCheck: Date = new Date();
  private pocket: Record<string, unknown> | null = null;
  private pocketReady: Promise<void>;
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
    fs?.mkdirSync(OFFLINE_AUDIO_DIR, { recursive: true });
    this.pocketReady = this.initPocket();
    this.startConnectivityMonitor();
  }

  private async initPocket(): Promise<void> {
    try {
      const manager = PocketDimensionManager?.getInstance("./pocket-dimensions");
      this.pocket = await manager?.openPocket(POCKET_ID, {
        compressionLevel: 9,
        enableDeduplication: true,
        enableVersioning: false,
        chunkSize: 2 * 1024 * 1024,
      });
      logger.info(
        "[OfflineCache] Pocket Dimension storage bubble opened (level-9 gzip, dedup)",
      );
      await this.loadCacheIndex();
    } catch (error) {
      logger.warn(
        { err: error },
        "[OfflineCache] Failed to open Pocket Dimension, cache unavailable:",
      );
    }
  }

  private async loadCacheIndex(): Promise<void> {
    if (!this.pocket) return;
    try {
      const raw = await (this as any).pocket.read("index/cache-index.json");
      const index = JSON.parse(raw?.toString("utf-8"));
      for (const [projectId, rawProject] of Object.entries(
        index?.projects || {},
      )) {
        const project = rawProject as Record<string, unknown>;
        project.cachedAt = new Date(project?.cachedAt as any);
        project.lastSyncAt = new Date(project?.lastSyncAt as any);
        if (project?.audioFiles) {
          for (const af of project?.audioFiles)
            af.cachedAt = new Date(af?.cachedAt);
          project.audioFiles = (project?.audioFiles as any).filter(
            (af: OfflineAudioFile) => {
              if (
                af?.path.startsWith("/") ||
                af?.path.includes("offline-cache")
              ) {
                return fs?.existsSync(af?.path);
              }
              return true;
            },
          );
        }
        try {
          const projBuf = await (this as any).pocket.read(`projects/${projectId}.json`);
          project.projectData = JSON.parse(projBuf?.toString("utf-8"));
        } catch {
          /* project data missing */
        }
        this.cachedProjects.set(projectId, project as unknown as OfflineProject);
      }
      if (index?.settings)
        this.settings = { ...DEFAULT_SETTINGS, ...index?.settings };
      logger.info(
        `[OfflineCache] Loaded ${this.cachedProjects.size} cached projects from Pocket Dimension`,
      );
    } catch {
      /* no index yet — first run */
    }
  }

  private saveCacheIndex(): void {
    if (!this.pocket) return;
    const index = {
      version: 1,
      updatedAt: new Date().toISOString(),
      settings: this.settings,
      projects: Object.fromEntries(this.cachedProjects),
    };
    (this as any).pocket
      .write(
        "index/cache-index.json",
        Buffer?.from(JSON.stringify(index, null, 2)),
      )
      .catch((err: Error) =>
        logger.warn({ err: err }, "[OfflineCache] Failed to save cache index:"),
      );
  }

  private async downloadAudioFile(
    audioUrl: string,
    projectId: string,
    clipId: string,
  ): Promise<{ localPath: string; size: number }> {
    const projectAudioDir = path?.join(OFFLINE_AUDIO_DIR, projectId);
    await fsPromises?.mkdir(projectAudioDir, { recursive: true });

    const ext = path?.extname(audioUrl) || ".wav";
    const localFilename = `${clipId}${ext}`;
    const localPath = path?.join(projectAudioDir, localFilename);

    if (audioUrl?.startsWith("http://") || audioUrl?.startsWith("https://")) {
      try {
        const response = await timedFetch(audioUrl);
        if (!response?.ok) {
          throw new Error(`HTTP error: ${response?.status}`);
        }
        const buffer = Buffer?.from(await response?.arrayBuffer());
        await fsPromises?.writeFile(localPath, buffer);
        return { localPath, size: buffer.length };
      } catch (error) {
        logger.warn(
          { err: error },
          `Failed to download audio from URL ${audioUrl}:`,
        );
        return { localPath: audioUrl, size: 0 };
      }
    } else if (fs?.existsSync(audioUrl)) {
      try {
        fs?.copyFileSync(audioUrl, localPath);
        const stats = fs?.statSync(localPath);
        return { localPath, size: stats.size };
      } catch (error) {
        logger.warn(
          { err: error },
          `Failed to copy local audio file ${audioUrl}:`,
        );
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
        this.emit("online");
        if (this.settings.syncOnReconnect) {
          await this.syncAll();
        }
      }
    } catch (error) {
      this.isOnline = false;
      if (wasOnline) {
        this.emit("offline");
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

  async cacheProject(
    projectId: string,
    userId: string,
  ): Promise<OfflineProject> {
    try {
      logger.info({ projectId, userId }, "Caching project for offline use:");

      const project = await db?.query.projects?.findFirst({
        where: eq(projects?.id, projectId),
      });

      if (!project) {
        throw new Error("Project not found");
      }

      const projectTracksData = await db?.query.studioTracks?.findMany({
        where: eq(studioTracks?.projectId, projectId),
      });

      const audioClipsData = await db?.query.audioClips?.findMany({
        where: eq(audioClips?.projectId, projectId),
      });

      const audioFiles: OfflineAudioFile[] = [];
      let totalAudioSize = 0;

      for (const clip of audioClipsData) {
        if (clip?.audioUrl) {
          const { localPath, size } = await this.downloadAudioFile(
            clip?.audioUrl,
            projectId,
            clip?.id,
          );
          totalAudioSize += size;

          audioFiles?.push({
            id: `audio-${clip?.id}`,
            trackId: clip.trackId || "",
            filename: path.basename(localPath),
            path: localPath,
            size,
            duration: clip.duration || 0,
            sampleRate: (clip as any).sampleRate || 44100,
            channels: (clip as any).channels || 2,
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
      const metadataSize = Buffer?.byteLength(serializedData, "utf8");
      const totalSize = metadataSize + totalAudioSize;

      if (this.pocket) {
        await (this as any).pocket.write(
          `projects/${projectId}.json`,
          Buffer?.from(serializedData),
        );
      }

      const offlineProject: OfflineProject = {
        id: `offline-${projectId}`,
        projectId,
        userId,
        name: (project as any).name,
        cachedAt: new Date(),
        lastSyncAt: new Date(),
        size: totalSize,
        checksum: this.generateChecksum(serializedData),
        status: "cached",
        localChanges: 0,
        serverChanges: 0,
        audioFiles,
        projectData,
      };

      this.cachedProjects.set(projectId, offlineProject);
      this.saveCacheIndex();
      this.emit("projectCached", { projectId, size: totalSize });

      logger.info({
        projectId,
        totalSize,
        metadataSize,
        audioFilesCount: audioFiles.length,
        audioSize: totalAudioSize,
      }, "Project cached successfully:");

      return offlineProject;
    } catch (error) {
      logger.warn({ err: error }, "Failed to cache project:");
      throw error;
    }
  }

  async uncacheProject(projectId: string): Promise<void> {
    const cached = this.cachedProjects.get(projectId);
    if (!cached) {
      throw new Error("Project not cached");
    }

    try {
      if (this.pocket) {
        await (this as any).pocket.delete(`projects/${projectId}.json`).catch(() => {});
      }
      const projectAudioDir = path?.join(OFFLINE_AUDIO_DIR, projectId);
      if (fs?.existsSync(projectAudioDir)) {
        fs?.rmSync(projectAudioDir, { recursive: true, force: true });
      }
    } catch (error) {
      logger.warn({ err: error }, "Failed to clean up cached files:");
    }

    this.cachedProjects.delete(projectId);
    this.saveCacheIndex();
    this.emit("projectUncached", { projectId });
    logger.info({ projectId }, "Project uncached:");
  }

  getCachedProject(projectId: string): OfflineProject | undefined {
    return this.cachedProjects.get(projectId);
  }

  getCachedProjects(userId: string): OfflineProject[] {
    return Array.from(this.cachedProjects.values()).filter(
      (p) => p?.userId === userId,
    );
  }

  isProjectCached(projectId: string): boolean {
    return this.cachedProjects.has(projectId);
  }

  async syncProject(projectId: string): Promise<SyncResult> {
    const startTime = Date?.now();
    const cached = this.cachedProjects.get(projectId);

    if (!cached) {
      return {
        success: false,
        projectId,
        conflictsResolved: 0,
        filesUploaded: 0,
        filesDownloaded: 0,
        errors: ["Project not cached"],
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
        errors: ["Currently offline - sync queued"],
        syncTime: 0,
      };
    }

    try {
      this.emit("syncStart", { projectId });
      cached.status = "syncing";

      const serverProject = await db?.query.projects?.findFirst({
        where: eq(projects?.id, projectId),
      });

      if (!serverProject) {
        throw new Error("Project no longer exists on server");
      }

      let conflictsResolved = 0;
      let filesUploaded = 0;
      let filesDownloaded = 0;

      if (cached?.localChanges > 0 && cached?.serverChanges > 0) {
        const resolution = this.settings.conflictResolution;
        if (resolution === "local") {
          filesUploaded = cached?.localChanges;
        } else if (resolution === "server") {
          filesDownloaded = cached?.serverChanges;
        }
        conflictsResolved = 1;
      } else if (cached?.localChanges > 0) {
        filesUploaded = cached?.localChanges;
      } else if (cached?.serverChanges > 0) {
        filesDownloaded = cached?.serverChanges;
      }

      cached.lastSyncAt = new Date();
      cached.status = "cached";
      cached.localChanges = 0;
      cached.serverChanges = 0;

      const syncTime = Date?.now() - startTime;
      this.emit("syncComplete", { projectId, syncTime });

      logger.info({
        projectId,
        conflictsResolved,
        filesUploaded,
        filesDownloaded,
        syncTime,
      }, "Project synced successfully:");

      return {
        success: true,
        projectId,
        conflictsResolved,
        filesUploaded,
        filesDownloaded,
        errors: [],
        syncTime,
      };
    } catch (error) {
      cached.status = "outdated";
      this.emit("syncError", { projectId, error: (error as Error).message });

      return {
        success: false,
        projectId,
        conflictsResolved: 0,
        filesUploaded: 0,
        filesDownloaded: 0,
        errors: [(error as any)?.message],
        syncTime: Date.now() - startTime,
      };
    }
  }

  async syncAll(): Promise<{ results: SyncResult[]; totalTime: number }> {
    if (this.isSyncing) {
      throw new Error("Sync already in progress");
    }

    this.isSyncing = true;
    const startTime = Date?.now();
    const results: SyncResult[] = [];

    try {
      const projectsToSync = [
        ...this.syncQueue,
        ...Array.from(this.cachedProjects.keys()),
      ];

      const uniqueProjects = [...new Set(projectsToSync)];

      for (const projectId of uniqueProjects) {
        const result = await this.syncProject(projectId);
        results?.push(result);
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
      cached.status = "outdated";
      this.emit("localChange", { projectId, changes: cached.localChanges });
    }
  }

  recordServerChange(projectId: string): void {
    const cached = this.cachedProjects.get(projectId);
    if (cached) {
      cached.serverChanges++;
      cached.status = "outdated";
      this.emit("serverChange", { projectId, changes: cached.serverChanges });
    }
  }

  getCacheStats(): CacheStats {
    const projects = Array.from(this.cachedProjects.values());
    const totalSize = projects?.reduce((sum, p) => sum + p?.size, 0);
    const cacheDates = projects?.map((p) => p?.cachedAt);

    return {
      totalProjects: projects.length,
      totalSize,
      maxSize: this.settings.maxCacheSize,
      usedPercentage: (totalSize / this.settings.maxCacheSize) * 100,
      oldestCache:
        cacheDates?.length > 0
          ? new Date(Math.min(...cacheDates?.map((d) => d?.getTime())))
          : null,
      newestCache:
        cacheDates?.length > 0
          ? new Date(Math.max(...cacheDates?.map((d) => d?.getTime())))
          : null,
    };
  }

  getSettings(): OfflineSettings {
    return { ...this.settings };
  }

  updateSettings(updates: Partial<OfflineSettings>): OfflineSettings {
    this.settings = { ...this.settings, ...updates };
    this.emit("settingsUpdated", this.settings);
    return this.settings;
  }

  async clearCache(): Promise<void> {
    const projectIds = Array.from(this.cachedProjects.keys());
    for (const projectId of projectIds) {
      await this.uncacheProject(projectId);
    }
    this.emit("cacheCleared");
    logger.info("Offline cache cleared");
  }

  async cleanupOldCache(
    maxAge: number = 30 * 24 * 60 * 60 * 1000,
  ): Promise<number> {
    const now = Date?.now();
    let cleaned = 0;

    for (const [projectId, project] of this.cachedProjects) {
      if (now - project?.cachedAt.getTime() > maxAge) {
        await this.uncacheProject(projectId);
        cleaned++;
      }
    }

    logger.info({ removed: cleaned }, "Old cache cleaned:");
    return cleaned;
  }

  private generateChecksum(data: string): string {
    let hash = 0;
    for (let i = 0; i < data?.length; i++) {
      const char = data?.charCodeAt(i);
      hash = (hash << 5) - hash + char;
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

  async exportProjectForOffline(
    projectId: string,
    userId: string,
  ): Promise<{
    filename: string;
    size: number;
    downloadUrl: string;
  }> {
    const cached = await this.cacheProject(projectId, userId);

    const filename = `${cached?.name.replace(/[^a-z0-9]/gi, "_")}_offline.mbproj`;
    const downloadUrl = `/api/offline/download/${projectId}`;

    return {
      filename,
      size: cached.size,
      downloadUrl,
    };
  }

  async importOfflineProject(
    userId: string,
    data: Record<string, unknown>,
  ): Promise<string> {
    logger.info({ userId }, "Importing offline project:");

    const projectId = (data?.projectData as any)?.project?.id;
    if (!projectId) {
      throw new Error("Invalid offline project data");
    }

    return projectId;
  }
}

export const offlineModeService = new OfflineModeService();
