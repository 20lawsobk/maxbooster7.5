/**
 * FEATURE TRACKING HOOK
 *
 * Tracks which features a user interacts with, feeding the customer health
 * score's feature adoption component. Feature adoption is a leading indicator
 * of retention — users who use 5+ features churn at significantly lower rates.
 *
 * Usage:
 *   const { track } = useFeatureTracking();
 *   track('distribution'); // call when user visits or uses a feature
 */

import { useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";

type TrackAction = "used" | "discovered" | "completed" | "skipped";

interface TrackOptions {
  action?: TrackAction;
  metadata?: Record<string, unknown>;
}

const pendingEvents: Array<{
  featureName: string;
  action: TrackAction;
  metadata?: Record<string, unknown>;
}> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  if (pendingEvents.length === 0) return;
  const batch = pendingEvents.splice(0, pendingEvents.length);
  for (const event of batch) {
    fetch("/api/retention/feature-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(event),
    }).catch(() => {});
  }
}

export function useFeatureTracking() {
  const { user } = useAuth();

  const track = useCallback(
    (featureName: string, options: TrackOptions = {}) => {
      if (!user) return;

      pendingEvents.push({
        featureName,
        action: options.action ?? "used",
        metadata: options.metadata,
      });

      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = setTimeout(flush, 2000);
    },
    [user],
  );

  return { track };
}
