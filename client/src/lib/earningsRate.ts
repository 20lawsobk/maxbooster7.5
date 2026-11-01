export function earningsPerStream(
  earnings: unknown,
  streams: unknown,
  scale = 1,
): number | null {
  if (
    typeof earnings !== "number" ||
    typeof streams !== "number" ||
    !Number.isFinite(earnings) ||
    !Number.isFinite(streams) ||
    streams <= 0 ||
    !Number.isFinite(scale) ||
    scale <= 0
  ) {
    return null;
  }
  const rate = (earnings / streams) * scale;
  return Number.isFinite(rate) ? rate : null;
}

export function formatEarningsRate(
  earnings: unknown,
  streams: unknown,
  scale = 1,
  digits = 4,
): string {
  const rate = earningsPerStream(earnings, streams, scale);
  return rate === null ? "—" : `$${rate.toFixed(digits)}`;
}