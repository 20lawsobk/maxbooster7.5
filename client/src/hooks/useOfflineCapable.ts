import { useMemo } from "react";
import { useLocation } from "wouter";
import { useOfflineStatus } from "./useOfflineStatus";

export type FeatureCapability = "full" | "limited" | "unavailable";

export interface OfflineCapabilities {
  projectEditing: FeatureCapability;
  audioPlayback: FeatureCapability;
  midiEditing: FeatureCapability;
  mixing: FeatureCapability;
  drafts: FeatureCapability;
  cachedData: FeatureCapability;
  aiFeatures: FeatureCapability;
  distribution: FeatureCapability;
  socialMedia: FeatureCapability;
  marketplace: FeatureCapability;
  analytics: FeatureCapability;
  collaboration: FeatureCapability;
}

const OFFLINE_ROUTES: Record<string, FeatureCapability> = {
  "/studio": "limited",
  "/projects": "limited",
  "/dashboard": "limited",
  "/settings": "full",
};

const ONLINE_ONLY_ROUTES = [
  "/distribution",
  "/social-media",
  "/marketplace",
  "/analytics",
  "/advertising",
  "/collaborations",
  "/contracts",
  "/royalties",
];

export function useOfflineCapable(): {
  isFullyCapable: boolean;
  isPartiallyCapable: boolean;
  isUnavailable: boolean;
  capabilities: OfflineCapabilities;
  routeCapability: FeatureCapability;
  availableFeatures: string[];
  unavailableFeatures: string[];
} {
  const { isOffline } = useOfflineStatus();
  const [location] = useLocation();

  const capabilities = useMemo<OfflineCapabilities>(() => {
    if (!isOffline) {
      return {
        projectEditing: "full",
        audioPlayback: "full",
        midiEditing: "full",
        mixing: "full",
        drafts: "full",
        cachedData: "full",
        aiFeatures: "full",
        distribution: "full",
        socialMedia: "full",
        marketplace: "full",
        analytics: "full",
        collaboration: "full",
      };
    }

    return {
      projectEditing: "limited",
      audioPlayback: "limited",
      midiEditing: "full",
      mixing: "limited",
      drafts: "full",
      cachedData: "limited",
      aiFeatures: "unavailable",
      distribution: "unavailable",
      socialMedia: "unavailable",
      marketplace: "unavailable",
      analytics: "limited",
      collaboration: "unavailable",
    };
  }, [isOffline]);

  const routeCapability = useMemo<FeatureCapability>(() => {
    if (!isOffline) return "full";

    const normalizedPath = location?.split("?")[0];

    for (const route of ONLINE_ONLY_ROUTES) {
      if (normalizedPath?.startsWith(route)) {
        return "unavailable";
      }
    }

    for (const [route, capability] of Object.entries(OFFLINE_ROUTES)) {
      if (normalizedPath?.startsWith(route)) {
        return capability;
      }
    }

    return "limited";
  }, [isOffline, location]);

  const availableFeatures = useMemo(() => {
    return Object.entries(capabilities)
      .filter(([, capability]) => capability !== "unavailable")
      .map(([feature]) => feature);
  }, [capabilities]);

  const unavailableFeatures = useMemo(() => {
    return Object.entries(capabilities)
      .filter(([, capability]) => capability === "unavailable")
      .map(([feature]) => feature);
  }, [capabilities]);

  const isFullyCapable = routeCapability === "full";
  const isPartiallyCapable = routeCapability === "limited";
  const isUnavailable = routeCapability === "unavailable";

  return {
    isFullyCapable,
    isPartiallyCapable,
    isUnavailable,
    capabilities,
    routeCapability,
    availableFeatures,
    unavailableFeatures,
  };
}

export default useOfflineCapable;
