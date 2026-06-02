import { logger } from "../logger.js";
import { randomBytes } from "crypto";

export type PlatformType = "web" | "android" | "desktop";
export type UpdateStatus = "pending" | "downloading" | "installed" | "failed";

export interface DeviceInfo {
  deviceId: string;
  userId: string;
  platform: PlatformType;
  appVersion: string;
  osInfo: string;
  deviceName: string;
  lastSeen: string;
  registeredAt: string;
}

export interface VersionInfo {
  platform: PlatformType;
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  releaseDate: string;
  changelog: string;
  downloadUrl: string;
  isForced: boolean;
}

export interface UpdateNotification {
  id: string;
  platform: PlatformType;
  version: string;
  changelog: string;
  isForced: boolean;
  createdAt: string;
}

export interface DeviceUpdateStatus {
  deviceId: string;
  platform: PlatformType;
  status: UpdateStatus;
  targetVersion: string;
  updatedAt: string;
}

export interface SyncState {
  preferences: Record<string, unknown>;
  theme: string;
  language: string;
  sessionState: Record<string, unknown>;
  notificationReadIds: string[];
  lastSyncAt: string;
  syncVersion: number;
}

export interface SyncStatus {
  deviceId: string;
  platform: PlatformType;
  lastSyncAt: string;
  syncVersion: number;
  isOnline: boolean;
}

interface UpdateRollout {
  id: string;
  platform: PlatformType;
  targetVersion: string;
  isForced: boolean;
  changelog: string;
  triggeredAt: string;
  triggeredBy: string;
  deviceStatuses: Map<string, DeviceUpdateStatus>;
}

const WEB_VERSION = "3.0.0";
const HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000;

// Memory caps — in-process cache only. Persistent state lives in Redis/DB.
const MAX_USER_CACHE = 50_000; // ~50 K concurrent active users
const MAX_DEVICE_SYNC_KEYS = 200_000; // 50 K users × 4 devices each
const MAX_UPDATE_ROLLOUTS = 1_000; // admin-created, small by nature
const DEVICE_STALE_TTL_MS = 2 * 60 * 60 * 1000; // 2 h without a heartbeat → evict

const userDevices: Map<string, Map<string, DeviceInfo>> = new Map();
const userSyncStates: Map<string, SyncState> = new Map();
const deviceSyncVersions: Map<string, number> = new Map();
const updateNotifications: Map<string, UpdateNotification[]> = new Map();
const updateRollouts: Map<string, UpdateRollout> = new Map();
const latestVersions: Map<
  PlatformType,
  {
    version: string;
    releaseDate: string;
    changelog: string;
    downloadUrl: string;
  }
> = new Map();

latestVersions.set("web", {
  version: WEB_VERSION,
  releaseDate: new Date().toISOString(),
  changelog: "Latest web release",
  downloadUrl: "https://max-booster.com",
});
latestVersions.set("android", {
  version: WEB_VERSION,
  releaseDate: new Date().toISOString(),
  changelog: "Latest Android release",
  downloadUrl: "",
});
latestVersions.set("desktop", {
  version: WEB_VERSION,
  releaseDate: new Date().toISOString(),
  changelog: "Latest desktop release",
  downloadUrl: "",
});

// Periodic eviction — runs every 5 minutes, removes users whose every device
// has been idle for DEVICE_STALE_TTL_MS.  Also enforces hard caps as a safety net.
setInterval(
  () => {
    const now = Date.now();
    for (const [uid, devices] of userDevices.entries()) {
      const allStale = [...devices.values()].every(
        (d) => now - new Date(d.lastSeen).getTime() > DEVICE_STALE_TTL_MS,
      );
      if (allStale) {
        for (const [did] of devices.entries())
          deviceSyncVersions.delete(`${uid}:${did}`);
        userDevices.delete(uid);
        userSyncStates.delete(uid);
      }
    }
    // Hard-cap safety net: if still over limit after TTL eviction, drop oldest entries.
    while (userDevices.size > MAX_USER_CACHE) {
      const oldest = userDevices.keys().next().value;
      if (oldest === undefined) break;
      userDevices.delete(oldest);
      userSyncStates.delete(oldest);
    }
    while (deviceSyncVersions.size > MAX_DEVICE_SYNC_KEYS) {
      const oldest = deviceSyncVersions.keys().next().value;
      if (oldest !== undefined) deviceSyncVersions.delete(oldest);
    }
    while (updateRollouts.size > MAX_UPDATE_ROLLOUTS) {
      const oldest = updateRollouts.keys().next().value;
      if (oldest !== undefined) updateRollouts.delete(oldest);
    }
  },
  5 * 60 * 1000,
).unref(); // unref: won't keep process alive on shutdown

function compareVersions(a: string, b: string): number {
  const partsA = a.replace(/^v/, "").split(".").map(Number);
  const partsB = b.replace(/^v/, "").split(".").map(Number);
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  return 0;
}

function getUserDevices(userId: string): Map<string, DeviceInfo> {
  if (!userDevices.has(userId)) {
    userDevices.set(userId, new Map());
  }
  return userDevices.get(userId)!;
}

function getUserSyncState(userId: string): SyncState {
  if (!userSyncStates.has(userId)) {
    userSyncStates.set(userId, {
      preferences: {},
      theme: "system",
      language: "en",
      sessionState: {},
      notificationReadIds: [],
      lastSyncAt: new Date().toISOString(),
      syncVersion: 0,
    });
  }
  return userSyncStates.get(userId)!;
}

export function registerDevice(
  userId: string,
  device: {
    deviceId: string;
    platform: PlatformType;
    appVersion: string;
    osInfo: string;
    deviceName: string;
  },
): DeviceInfo {
  const devices = getUserDevices(userId);
  const now = new Date().toISOString();

  const deviceInfo: DeviceInfo = {
    deviceId: device.deviceId,
    userId,
    platform: device.platform,
    appVersion: device.appVersion,
    osInfo: device.osInfo,
    deviceName: device.deviceName,
    lastSeen: now,
    registeredAt: devices.has(device.deviceId)
      ? devices.get(device.deviceId)!.registeredAt
      : now,
  };

  devices.set(device.deviceId, deviceInfo);
  logger.info("Device registered", {
    userId,
    deviceId: device.deviceId,
    platform: device.platform,
  });
  return deviceInfo;
}

export function unregisterDevice(userId: string, deviceId: string): boolean {
  const devices = getUserDevices(userId);
  const removed = devices.delete(deviceId);
  if (removed) {
    deviceSyncVersions.delete(`${userId}:${deviceId}`);
    logger.info("Device unregistered", { userId, deviceId });
  }
  return removed;
}

export function heartbeat(userId: string, deviceId: string): DeviceInfo | null {
  const devices = getUserDevices(userId);
  const device = devices.get(deviceId);
  if (!device) return null;
  device.lastSeen = new Date().toISOString();
  return device;
}

export function listDevices(userId: string): DeviceInfo[] {
  const devices = getUserDevices(userId);
  return Array.from(devices.values());
}

export function isDeviceOnline(device: DeviceInfo): boolean {
  const lastSeen = new Date(device.lastSeen).getTime();
  return Date.now() - lastSeen < HEARTBEAT_TIMEOUT_MS;
}

export function checkForUpdate(
  platform: PlatformType,
  currentVersion: string,
): VersionInfo {
  const latest = latestVersions.get(platform);
  const latestVersion = latest?.version || WEB_VERSION;
  const updateAvailable = compareVersions(currentVersion, latestVersion) < 0;

  const forcedNotifications = (updateNotifications.get("global") || []).filter(
    (n) =>
      n.platform === platform &&
      n.isForced &&
      compareVersions(currentVersion, n.version) < 0,
  );

  return {
    platform,
    currentVersion,
    latestVersion,
    updateAvailable,
    releaseDate: latest?.releaseDate || new Date().toISOString(),
    changelog: latest?.changelog || "",
    downloadUrl: latest?.downloadUrl || "",
    isForced: forcedNotifications.length > 0,
  };
}

export function getLatestVersions(): Record<
  PlatformType,
  {
    version: string;
    releaseDate: string;
    changelog: string;
    downloadUrl: string;
  }
> {
  const result: Record<
    string,
    {
      version: string;
      releaseDate: string;
      changelog: string;
      downloadUrl: string;
    }
  > = {};
  for (const [platform, info] of latestVersions.entries()) {
    result[platform] = { ...info };
  }
  return result as Record<
    PlatformType,
    {
      version: string;
      releaseDate: string;
      changelog: string;
      downloadUrl: string;
    }
  >;
}

export function setLatestVersion(
  platform: PlatformType,
  version: string,
  changelog: string,
  downloadUrl: string,
): void {
  latestVersions.set(platform, {
    version,
    releaseDate: new Date().toISOString(),
    changelog,
    downloadUrl,
  });
}

export function pushUpdateNotification(
  platform: PlatformType,
  version: string,
  changelog: string,
  isForced: boolean,
): UpdateNotification {
  const notification: UpdateNotification = {
    id: `update-${Date.now()}-${randomBytes(3).toString("hex")}`,
    platform,
    version,
    changelog,
    isForced,
    createdAt: new Date().toISOString(),
  };

  if (!updateNotifications.has("global")) {
    updateNotifications.set("global", []);
  }
  updateNotifications.get("global")!.push(notification);

  logger.info("Update notification pushed", { platform, version, isForced });
  return notification;
}

export function triggerRemoteUpdate(
  platform: PlatformType,
  targetVersion: string,
  isForced: boolean,
  changelog: string,
  triggeredBy: string,
): UpdateRollout {
  const rollout: UpdateRollout = {
    id: `rollout-${Date.now()}-${randomBytes(3).toString("hex")}`,
    platform,
    targetVersion,
    isForced,
    changelog,
    triggeredAt: new Date().toISOString(),
    triggeredBy,
    deviceStatuses: new Map(),
  };

  for (const [, devices] of userDevices.entries()) {
    for (const [deviceId, device] of devices.entries()) {
      if (
        device.platform === platform &&
        compareVersions(device.appVersion, targetVersion) < 0
      ) {
        rollout.deviceStatuses.set(deviceId, {
          deviceId,
          platform,
          status: "pending",
          targetVersion,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }

  updateRollouts.set(rollout.id, rollout);
  setLatestVersion(platform, targetVersion, changelog, "");
  pushUpdateNotification(platform, targetVersion, changelog, isForced);

  logger.info("Remote update triggered", {
    rolloutId: rollout.id,
    platform,
    targetVersion,
    affectedDevices: rollout.deviceStatuses.size,
  });
  return rollout;
}

export function getUpdateRolloutStatus(): Array<{
  id: string;
  platform: PlatformType;
  targetVersion: string;
  isForced: boolean;
  changelog: string;
  triggeredAt: string;
  triggeredBy: string;
  stats: {
    total: number;
    pending: number;
    downloading: number;
    installed: number;
    failed: number;
  };
  devices: DeviceUpdateStatus[];
}> {
  const results = [];
  for (const [, rollout] of updateRollouts.entries()) {
    const devices = Array.from(rollout.deviceStatuses.values());
    const stats = {
      total: devices.length,
      pending: devices.filter((d) => d.status === "pending").length,
      downloading: devices.filter((d) => d.status === "downloading").length,
      installed: devices.filter((d) => d.status === "installed").length,
      failed: devices.filter((d) => d.status === "failed").length,
    };
    results.push({
      id: rollout.id,
      platform: rollout.platform,
      targetVersion: rollout.targetVersion,
      isForced: rollout.isForced,
      changelog: rollout.changelog,
      triggeredAt: rollout.triggeredAt,
      triggeredBy: rollout.triggeredBy,
      stats,
      devices,
    });
  }
  return results;
}

export function pullSyncState(
  userId: string,
  deviceId: string,
): { state: SyncState; hasChanges: boolean } {
  const syncState = getUserSyncState(userId);
  const deviceSyncKey = `${userId}:${deviceId}`;
  const lastDeviceVersion = deviceSyncVersions.get(deviceSyncKey) || 0;
  const hasChanges = syncState.syncVersion > lastDeviceVersion;

  deviceSyncVersions.set(deviceSyncKey, syncState.syncVersion);

  return { state: { ...syncState }, hasChanges };
}

export function pushSyncState(
  userId: string,
  deviceId: string,
  changes: Partial<SyncState>,
): SyncState {
  const syncState = getUserSyncState(userId);

  if (changes.preferences !== undefined) {
    syncState.preferences = {
      ...syncState.preferences,
      ...changes.preferences,
    };
  }
  if (changes.theme !== undefined) {
    syncState.theme = changes.theme;
  }
  if (changes.language !== undefined) {
    syncState.language = changes.language;
  }
  if (changes.sessionState !== undefined) {
    syncState.sessionState = {
      ...syncState.sessionState,
      ...changes.sessionState,
      _lastUpdatedBy: deviceId,
      _lastUpdatedAt: new Date().toISOString(),
    };
  }
  if (changes.notificationReadIds !== undefined) {
    const merged = new Set([
      ...syncState.notificationReadIds,
      ...changes.notificationReadIds,
    ]);
    syncState.notificationReadIds = Array.from(merged);
  }

  syncState.syncVersion += 1;
  syncState.lastSyncAt = new Date().toISOString();

  const deviceSyncKey = `${userId}:${deviceId}`;
  deviceSyncVersions.set(deviceSyncKey, syncState.syncVersion);

  logger.info("Sync state updated", {
    userId,
    deviceId,
    syncVersion: syncState.syncVersion,
  });
  return { ...syncState };
}

export function getSyncStatus(userId: string): SyncStatus[] {
  const devices = getUserDevices(userId);
  const syncState = getUserSyncState(userId);
  const statuses: SyncStatus[] = [];

  for (const [deviceId, device] of devices.entries()) {
    const deviceSyncKey = `${userId}:${deviceId}`;
    const deviceVersion = deviceSyncVersions.get(deviceSyncKey) || 0;

    statuses.push({
      deviceId,
      platform: device.platform,
      lastSyncAt:
        deviceVersion > 0 ? syncState.lastSyncAt : device.registeredAt,
      syncVersion: deviceVersion,
      isOnline: isDeviceOnline(device),
    });
  }

  return statuses;
}
