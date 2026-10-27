/** Validate retention age before any destructive hybrid cleanup begins. */
export function normalizeHybridCleanupDays(value: unknown): number {
  if (value === undefined) return 90;

  const days =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^[1-9][0-9]*$/.test(value)
        ? Number(value)
        : NaN;

  // A negative, zero, fractional or malformed age could select every
  // never-accessed object for deletion. Do not silently default on bad input.
  if (!Number.isSafeInteger(days) || days < 1 || days > 36500) {
    throw new RangeError("olderThanDays must be an integer between 1 and 36500");
  }
  return days;
}
