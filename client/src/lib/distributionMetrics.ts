export interface NormalizedPlatformEarning {
  platform: string;
  platformId?: string;
  name: string;
  amount?: number;
  earnings?: number;
  streams?: number;
  perStreamRate?: number;
  percentage?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function toFiniteNumber(value: unknown): number | undefined {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return undefined;
  }

  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

/**
 * The platform-earnings endpoint currently returns totalEarnings and platform
 * while the page consumes amount/earnings and name. Normalize that real API
 * shape once, without turning missing values into invented zeros.
 */
export function normalizePlatformEarnings(
  response: unknown,
): NormalizedPlatformEarning[] {
  if (!Array.isArray(response)) {
    throw new Error("Unexpected platform earnings response");
  }

  return response.map((value) => {
    if (!isRecord(value) || typeof value.platform !== "string") {
      throw new Error("Unexpected platform earnings response");
    }

    const amount = toFiniteNumber(
      value.amount ?? value.earnings ?? value.totalEarnings,
    );
    const streams = toFiniteNumber(value.streams);
    const perStreamRate =
      amount !== undefined && streams !== undefined && streams > 0
        ? amount / streams
        : undefined;
    const platformId =
      typeof value.platformId === "string" ? value.platformId : undefined;

    return {
      platform: value.platform,
      ...(platformId ? { platformId } : {}),
      name:
        typeof value.name === "string" && value.name
          ? value.name
          : value.platform,
      ...(amount !== undefined ? { amount, earnings: amount } : {}),
      ...(streams !== undefined ? { streams } : {}),
      ...(perStreamRate !== undefined ? { perStreamRate } : {}),
      ...(typeof value.percentage === "number" &&
      Number.isFinite(value.percentage)
        ? { percentage: value.percentage }
        : {}),
    };
  });
}

export function formatPerThousandStreams(
  earnings: unknown,
  streams: unknown,
): string {
  const amount = toFiniteNumber(earnings);
  const count = toFiniteNumber(streams);
  if (amount === undefined || count === undefined || count <= 0) {
    return "—";
  }

  return `$${((amount / count) * 1000).toFixed(3)}`;
}

export function formatPerStreamRate(
  earnings: unknown,
  streams: unknown,
): string {
  const amount = toFiniteNumber(earnings);
  const count = toFiniteNumber(streams);
  if (amount === undefined || count === undefined || count <= 0) {
    return "—";
  }

  return `$${(amount / count).toFixed(4)}`;
}