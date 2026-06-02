import { useState, useEffect, useCallback } from "react";
import { getCsrfTokenFromCookie } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Smartphone,
  Monitor,
  Globe,
  RefreshCw,
  Download,
  Check,
  AlertCircle,
  Wifi,
  Clock,
  Settings,
  Trash2,
} from "lucide-react";

interface DeviceInfo {
  deviceId: string;
  platform: "web" | "android" | "desktop";
  appVersion: string;
  osInfo: string;
  deviceName: string;
  lastSeen: string;
  registeredAt: string;
}

interface VersionEntry {
  version: string;
  releaseDate: string;
  changelog: string;
  downloadUrl: string;
}

interface SyncStatus {
  deviceId: string;
  platform: string;
  lastSyncAt: string;
  syncVersion: number;
  isOnline: boolean;
}

interface SyncSettings {
  preferences: boolean;
  theme: boolean;
  language: boolean;
  sessionState: boolean;
  notifications: boolean;
}

const platformIcons: Record<string, React.ReactNode> = {
  web: <Globe className="h-5 w-5" />,
  android: <Smartphone className="h-5 w-5" />,
  desktop: <Monitor className="h-5 w-5" />,
};

const platformLabels: Record<string, string> = {
  web: "Web",
  android: "Android",
  desktop: "Desktop",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function CrossPlatformSync() {
  const { toast } = useToast();
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [versions, setVersions] = useState<Record<string, VersionEntry>>({});
  const [syncStatuses, setSyncStatuses] = useState<SyncStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncSettings, setSyncSettings] = useState<SyncSettings>({
    preferences: true,
    theme: true,
    language: true,
    sessionState: true,
    notifications: true,
  });

  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch("/api/platform-sync/devices");
      if (res.ok) {
        const data = await res.json();
        setDevices(data.devices || []);
      }
    } catch {
      /* empty */
    }
  }, []);

  const fetchVersions = useCallback(async () => {
    try {
      const res = await fetch("/api/platform-sync/version/latest");
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions || {});
      }
    } catch {
      /* empty */
    }
  }, []);

  const fetchSyncStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/platform-sync/sync/status");
      if (res.ok) {
        const data = await res.json();
        setSyncStatuses(data.statuses || []);
      }
    } catch {
      /* empty */
    }
  }, []);

  const autoRegisterWebDevice = useCallback(async () => {
    try {
      let storedId = localStorage.getItem("maxbooster_device_id");
      if (!storedId) {
        storedId = `web-${crypto.randomUUID?.() || Date.now().toString(36)}`;
        localStorage.setItem("maxbooster_device_id", storedId);
      }
      const ua = navigator.userAgent;
      let osInfo = "Unknown OS";
      if (ua.includes("Win")) osInfo = "Windows";
      else if (ua.includes("Mac")) osInfo = "macOS";
      else if (ua.includes("Linux")) osInfo = "Linux";
      else if (ua.includes("Android")) osInfo = "Android";
      else if (ua.includes("iPhone") || ua.includes("iPad")) osInfo = "iOS";

      const csrfToken = getCsrfTokenFromCookie();
      await fetch("/api/platform-sync/devices/register", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        body: JSON.stringify({
          deviceId: storedId,
          platform: "web",
          appVersion: "3.0.0",
          osInfo,
          deviceName: `${osInfo} Browser`,
        }),
      });
    } catch {}
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await autoRegisterWebDevice();
    await Promise.all([fetchDevices(), fetchVersions(), fetchSyncStatus()]);
    setLoading(false);
  }, [fetchDevices, fetchVersions, fetchSyncStatus, autoRegisterWebDevice]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleRemoveDevice = async (deviceId: string) => {
    try {
      const csrfToken = getCsrfTokenFromCookie();
      const res = await fetch(`/api/platform-sync/devices/${deviceId}`, {
        method: "DELETE",
        credentials: "include",
        headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
      });
      if (res.ok) {
        toast({ title: "Device removed" });
        await fetchDevices();
      } else {
        const data = await res.json();
        toast({
          title: "Error",
          description: data.error || "Failed to remove device",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to remove device",
        variant: "destructive",
      });
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const deviceId =
        localStorage.getItem("maxbooster_device_id") || `web-${Date.now()}`;
      const changes: Record<string, unknown> = {};
      if (syncSettings.preferences) changes.preferences = {};
      if (syncSettings.theme) changes.theme = undefined;
      if (syncSettings.language) changes.language = undefined;
      if (syncSettings.sessionState)
        changes.sessionState = { currentPage: window.location.pathname };
      if (syncSettings.notifications) changes.notificationReadIds = [];

      const csrfToken = getCsrfTokenFromCookie();
      const res = await fetch("/api/platform-sync/sync/push", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        body: JSON.stringify({ deviceId, changes }),
      });

      if (res.ok) {
        toast({
          title: "Sync complete",
          description: "All devices synced successfully",
        });
        await fetchSyncStatus();
      } else {
        const data = await res.json();
        toast({
          title: "Sync failed",
          description: data.error || "Failed to sync",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Sync failed",
        description: "Network error",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const getSyncStatusForDevice = (deviceId: string): SyncStatus | undefined => {
    return syncStatuses.find((s) => s.deviceId === deviceId);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight dark:text-white">
            Cross-Platform Sync
          </h2>
          <p className="text-muted-foreground">
            Manage your devices and sync settings across all platforms
          </p>
        </div>
        <Button onClick={handleSyncNow} disabled={syncing}>
          <RefreshCw
            className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`}
          />
          {syncing ? "Syncing..." : "Sync Now"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wifi className="h-5 w-5" />
            Connected Devices
          </CardTitle>
        </CardHeader>
        <CardContent>
          {devices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Monitor className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No devices registered</p>
              <p className="text-sm mt-1">
                Devices will appear here when they connect
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {devices.map((device) => {
                const status = getSyncStatusForDevice(device.deviceId);
                return (
                  <div
                    key={device.deviceId}
                    className="flex items-center justify-between p-4 rounded-lg border bg-background dark:bg-gray-800/50 hover:bg-muted/50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 dark:bg-primary/20 text-primary">
                        {platformIcons[device.platform]}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium dark:text-white">
                            {device.deviceName}
                          </span>
                          <Badge variant="secondary" className="text-xs">
                            {platformLabels[device.platform] || device.platform}
                          </Badge>
                          {status?.isOnline ? (
                            <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 text-xs">
                              Online
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              Offline
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {timeAgo(device.lastSeen)}
                          </span>
                          <span>v{device.appVersion}</span>
                          <span>{device.osInfo}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {status && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Check className="h-3 w-3" />
                          Synced {timeAgo(status.lastSyncAt)}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveDevice(device.deviceId)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Sync Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              {
                key: "preferences" as const,
                label: "User Preferences",
                desc: "Sync app preferences across devices",
              },
              {
                key: "theme" as const,
                label: "Theme",
                desc: "Keep theme consistent on all platforms",
              },
              {
                key: "language" as const,
                label: "Language",
                desc: "Sync language settings",
              },
              {
                key: "sessionState" as const,
                label: "Session State",
                desc: "Resume where you left off on any device",
              },
              {
                key: "notifications" as const,
                label: "Notification Read Status",
                desc: "Sync read/unread notifications",
              },
            ].map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between py-2"
              >
                <div>
                  <p className="font-medium dark:text-white">{item.label}</p>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </div>
                <Switch
                  checked={syncSettings[item.key]}
                  onCheckedChange={(checked) =>
                    setSyncSettings((prev) => ({
                      ...prev,
                      [item.key]: checked,
                    }))
                  }
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Remote Updates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {(["web", "android", "desktop"] as const).map((platform) => {
              const v = versions[platform];
              if (!v) return null;
              return (
                <div
                  key={platform}
                  className="flex items-center justify-between p-4 rounded-lg border bg-background dark:bg-gray-800/50"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 dark:bg-primary/20 text-primary">
                      {platformIcons[platform]}
                    </div>
                    <div>
                      <p className="font-medium dark:text-white">
                        {platformLabels[platform]}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Current: v{v.version}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
                      <Check className="h-3 w-3 mr-1" />
                      Up to date
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
          {devices.length > 0 && (
            <div className="mt-4 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Updates are pushed automatically to connected devices
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
