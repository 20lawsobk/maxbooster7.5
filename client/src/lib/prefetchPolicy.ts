export interface PrefetchSignals {
  saveData?: boolean;
  effectiveType?: string;
  downlink?: number;
  deviceMemory?: number;
  hardwareConcurrency?: number;
  viewportWidth?: number;
}

export type PrefetchMode = "none" | "intent" | "idle";

export function isIdlePrefetchAllowed(
  isDevelopment: boolean,
  mode: PrefetchMode,
): boolean {
  return !isDevelopment && mode === "idle";
}

/**
 * Keep speculative network work off constrained devices. "idle" is reserved
 * for known-fast, desktop-sized clients; missing browser hints are treated
 * conservatively rather than guessed to be fast.
 */
export function getPrefetchMode(signals: PrefetchSignals): PrefetchMode {
  const type = signals.effectiveType?.toLowerCase();
  if (
    signals.saveData === true ||
    type === "slow-2g" ||
    type === "2g" ||
    (signals.downlink !== undefined && signals.downlink < 1.5) ||
    (signals.deviceMemory !== undefined && signals.deviceMemory <= 2) ||
    (signals.hardwareConcurrency !== undefined &&
      signals.hardwareConcurrency <= 2)
  ) {
    return "none";
  }

  const knownFastDesktop =
    (signals.viewportWidth ?? 0) >= 1024 &&
    type === "4g" &&
    (signals.downlink ?? 0) >= 5 &&
    (signals.deviceMemory ?? 0) >= 4 &&
    (signals.hardwareConcurrency ?? 0) >= 4;

  return knownFastDesktop ? "idle" : "intent";
}
