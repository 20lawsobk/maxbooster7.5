// @ts-nocheck
import { logger } from "../logger.js";
import { EventEmitter } from "events";
import { db } from "../db";
import { projects, studioTracks, audioClips } from "@shared/schema";
import { eq, and } from "drizzle-orm";
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
  private userSettings = new Map<string, OfflineSettings>();
  private userIndexLoads = new Map<string, Promise<void>>();
  private isOnline: boolean = true;
  private syncQueue: string[] = [];
  private syncingUsers = new Set<string>();
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
        // Unattributable legacy cache entries are quarantined, never exposed.
        if (typeof project.userId !== "string" || project.projectId !== projectId) continue;
        project.cachedAt = new Date(project?.cachedAt as any);
        project.lastSyncAt = new Date(project?.lastSyncAt as any);
        if (project?.audioFiles) {
          for (const af of project?.audioFiles ?? [])
            af.cachedAt = new Date(af?.cachedAt);
          project.audioFiles = (project?.audioFiles as any).filter(
            (af: OfflineAudioFile) => {
              if (
                af?.path?.startsWith("/") ||
                af?.path?.includes("offline-cache")
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
      // Legacy global preferences must never become another user's settings.
      for (const [userId, settings] of Object.entries(index?.userSettings ?? {})) {
        this.userSettings.set(userId, { ...DEFAULT_SETTINGS, ...(settings as OfflineSettings) });
      }
      logger.info(
        `[OfflineCache] Loaded ${this.cachedProjects.size} cached projects from Pocket Dimension`,
      );
    } catch {
      /* no index yet — first run */
    }
  }

  private async loadUserIndex(userId: string): Promise<void> {
    if (!userId) throw new Error("User required");
    await this.pocketReady;
    if (!this.userIndexLoads.has(userId)) {
      const load = (async () => {
        if (!this.pocket) throw new Error("Offline cache storage unavailable");
        const key = `index/users/${encodeURIComponent(userId)}.json`;
        // Only a genuine missing key is an empty user cache; provider outages propagate.
        let raw: Buffer;
        try { raw = await (this as any).pocket.read(key); }
        catch (error) {
          if (/not found|does not exist/i.test((error as Error).message)) return;
          throw error;
        }
        const index = JSON.parse(raw.toString("utf8"));
        if (index.userId !== userId) throw new Error("Offline cache owner mismatch");
        this.userSettings.set(userId, { ...DEFAULT_SETTINGS, ...index.settings });
        for (const rawProject of Object.values(index.projects ?? {})) {
          const project = rawProject as OfflineProject;
          if (project.userId !== userId) throw new Error("Offline project owner mismatch");
          project.cachedAt = new Date(project.cachedAt);
          project.lastSyncAt = new Date(project.lastSyncAt);
          this.cachedProjects.set(project.projectId, project);
        }
      })();
      this.userIndexLoads.set(userId, load);
      load.catch(() => this.userIndexLoads.delete(userId));
    }
    await this.userIndexLoads.get(userId);
  }

  private async saveCacheIndex(userId: string): Promise<void> {
    await this.pocketReady;
    if (!this.pocket) throw new Error("Offline cache storage unavailable");
    const index = {
      version: 1,
      updatedAt: new Date().toISOString(),
      userId,
      settings: this.getSettings(userId),
      projects: Object.fromEntries([...this.cachedProjects].filter(([, project]) => project.userId === userId)),
    };
    await (this as any).pocket
      .write(
        `index/users/${encodeURIComponent(userId)}.json`,
        Buffer?.from(JSON.stringify(index, null, 2)),
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
          for (const userId of new Set(Array.from(this.cachedProjects.values()).map((p) => p.userId))) {
            if (userId && this.getSettings(userId).syncOnReconnect) await this.syncAll(userId);
          }
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
      await this.pocketReady;
      await this.loadUserIndex(userId);
      if (!this.pocket) throw new Error("Offline cache storage unavailable");
      logger.info({ projectId, userId }, "Caching project for offline use:");

      const project = await db.query.projects.findFirst({
        where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
      });

      if (!project) {
        throw new Error("Project not found");
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
      await this.saveCacheIndex(userId);
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

  private async authorizeProject(projectId: string, userId: string): Promise<void> {
    if (!userId || !projectId) throw new Error("Project not found");
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
    });
    if (!project) throw new Error("Project not found");
    await this.loadUserIndex(userId);
  }

  async uncacheProject(projectId: string, userId: string): Promise<void> {
    await this.authorizeProject(projectId, userId);
    const cached = this.cachedProjects.get(projectId);
    if (!cached || cached.userId !== userId) {
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
    await this.saveCacheIndex(userId);
    this.emit("projectUncached", { projectId });
    logger.info({ projectId }, "Project uncached:");
  }

  async getCachedProject(projectId: string, userId: string): Promise<OfflineProject | undefined> {
    await this.authorizeProject(projectId, userId);
    const cached = this.cachedProjects.get(projectId);
    return cached?.userId === userId ? cached : undefined;
  }

  async getCachedProjects(userId: string): Promise<OfflineProject[]> {
    await this.loadUserIndex(userId);
    if (!userId) throw new Error("User required");
    const owned = await db.select({ id: projects.id }).from(projects).where(eq(projects.userId, userId));
    const allowed = new Set(owned.map((project) => project.id));
    return Array.from(this.cachedProjects.values()).filter(
      (p) => p?.userId === userId && allowed.has(p.projectId),
    );
  }

  async isProjectCached(projectId: string, userId: string): Promise<boolean> {
    return !!(await this.getCachedProject(projectId, userId));
  }

  async syncProject(projectId: string, userId: string): Promise<SyncResult> {
    const startTime = Date.now();
    const cached = await this.getCachedProject(projectId, userId);

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

      const serverProject = await db.query.projects.findFirst({
        where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
      });

      if (!serverProject) {
        throw new Error("Project no longer exists on server");
      }

      let conflictsResolved = 0;
      let filesUploaded = 0;
      let filesDownloaded = 0;

      if (cached?.localChanges > 0 && cached?.serverChanges > 0) {
        const resolution = this.getSettings(userId).conflictResolution;
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

      const syncTime = Date.now() - startTime;
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

  async syncAll(userId: string): Promise<{ results: SyncResult[]; totalTime: number }> {
    if (this.syncingUsers.has(userId)) {
      throw new Error("Sync already in progress");
    }

    this.syncingUsers.add(userId);
    const startTime = Date.now();
    const results: SyncResult[] = [];

    try {
      const projectsToSync = (await this.getCachedProjects(userId)).map((p) => p.projectId);

      const uniqueProjects = [...new Set(projectsToSync)];

      for (const projectId of uniqueProjects) {
        const result = await this.syncProject(projectId, userId);
        results?.push(result);
      }

      this.syncQueue = this.syncQueue.filter((id) => !uniqueProjects.includes(id));

      return {
        results,
        totalTime: Date.now() - startTime,
      };
    } finally {
      this.syncingUsers.delete(userId);
    }
  }

  async recordLocalChange(projectId: string, userId: string): Promise<void> {
    const cached = await this.getCachedProject(projectId, userId);
    if (cached) {
      cached.localChanges++;
      cached.status = "outdated";
      this.emit("localChange", { projectId, changes: cached.localChanges });
    }
  }

  async recordServerChange(projectId: string, userId: string): Promise<void> {
    const cached = await this.getCachedProject(projectId, userId);
    if (cached) {
      cached.serverChanges++;
      cached.status = "outdated";
      this.emit("serverChange", { projectId, changes: cached.serverChanges });
    }
  }

  async getCacheStats(userId: string): Promise<CacheStats> {
    const projects = await this.getCachedProjects(userId);
    const totalSize = projects.reduce((sum, p) => sum + p?.size, 0);
    const cacheDates = projects.map((p) => p?.cachedAt);

    return {
      totalProjects: projects.length,
      totalSize,
      maxSize: this.getSettings(userId).maxCacheSize,
      usedPercentage: (totalSize / this.getSettings(userId).maxCacheSize) * 100,
      oldestCache:
        cacheDates?.length > 0
          ? new Date(Math.min(...(cacheDates?.map((d) => d?.getTime()) ?? [])))
          : null,
      newestCache:
        cacheDates?.length > 0
          ? new Date(Math.max(...(cacheDates?.map((d) => d?.getTime()) ?? [])))
          : null,
    };
  }

  getSettings(userId: string): OfflineSettings {
    if (!userId) throw new Error("User required");
    return { ...(this.userSettings.get(userId) ?? DEFAULT_SETTINGS) };
  }

  async readSettings(userId: string): Promise<OfflineSettings> {
    await this.loadUserIndex(userId);
    return this.getSettings(userId);
  }

  async updateSettings(updates: Partial<OfflineSettings>, userId: string): Promise<OfflineSettings> {
    await this.loadUserIndex(userId);
    const settings = { ...this.getSettings(userId), ...updates };
    this.userSettings.set(userId, settings);
    await this.saveCacheIndex(userId);
    this.emit("settingsUpdated", { userId, settings });
    return settings;
  }

  async clearCache(userId: string): Promise<void> {
    const projectIds = (await this.getCachedProjects(userId)).map((p) => p.projectId);
    for (const projectId of projectIds) {
      await this.uncacheProject(projectId, userId);
    }
    this.emit("cacheCleared");
    logger.info("Offline cache cleared");
  }

  async cleanupOldCache(
    userId: string,
    maxAge: number = 30 * 24 * 60 * 60 * 1000,
  ): Promise<number> {
    const now = Date.now();
    let cleaned = 0;

    for (const project of await this.getCachedProjects(userId)) {
      if (now - project?.cachedAt?.getTime() > maxAge) {
        await this.uncacheProject(project.projectId, userId);
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

  async getSyncQueue(userId: string): Promise<string[]> {
    const owned = new Set((await this.getCachedProjects(userId)).map((p) => p.projectId));
    return this.syncQueue.filter((id) => owned.has(id));
  }

  isSyncInProgress(userId: string): boolean {
    return this.syncingUsers.has(userId);
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

    const filename = `${cached?.name?.replace(/[^a-z0-9]/gi, "_")}_offline.mbproj`;
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

    await this.authorizeProject(projectId, userId);
    return projectId;
  }
}

export const offlineModeService = new OfflineModeService();
