export interface DownloadExtra {
  label: string;
  url: string;
  name: string;
  size: string;
}

export interface DownloadAsset {
  platform: "Windows" | "macOS" | "Linux" | "Android" | "iOS";
  downloadUrl: string;
  fileName: string;
  fileSize: string;
  buildDate?: string;
  fallbackUrl?: string;
  fallbackName?: string;
  extras?: DownloadExtra[];
}

export interface ReleaseData {
  available: boolean;
  version?: string;
  publishedAt?: string;
  fetchedAt?: string;
  releasesPageUrl?: string;
  allReleasesUrl?: string;
  desktop?: DownloadAsset[];
  mobile?: DownloadAsset[];
  fallbackUrl?: string;
  message?: string;
}

const GITHUB_REPOSITORY_PATH = "/20lawsobk/maxbooster7.5/";
const PLATFORMS = new Set(["Windows", "macOS", "Linux", "Android", "iOS"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeGithubReleaseUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("The release metadata contained an invalid URL.");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("The release metadata contained an invalid URL.");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "github.com" ||
    !parsed.pathname.toLowerCase().startsWith(GITHUB_REPOSITORY_PATH)
  ) {
    throw new Error(
      "The release metadata pointed outside the official Max Booster repository.",
    );
  }
  return parsed.toString();
}

function optionalReleaseUrl(value: unknown): string | undefined {
  return value === undefined || value === null
    ? undefined
    : normalizeGithubReleaseUrl(value);
}

function optionalTimestamp(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error("The release metadata contained an invalid timestamp.");
  }
  return value;
}

function normalizeExtra(value: unknown): DownloadExtra {
  if (!isRecord(value)) throw new Error("A release extra was invalid.");
  if (
    typeof value.label !== "string" ||
    !value.label.trim() ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    typeof value.size !== "string" ||
    !value.size.trim()
  ) {
    throw new Error("A release extra was invalid.");
  }
  return {
    label: value.label.trim().slice(0, 100),
    name: value.name.trim().slice(0, 255),
    size: value.size.trim().slice(0, 100),
    url: normalizeGithubReleaseUrl(value.url),
  };
}

function normalizeAsset(value: unknown): DownloadAsset {
  if (!isRecord(value)) throw new Error("A download asset was invalid.");
  if (
    typeof value.platform !== "string" ||
    !PLATFORMS.has(value.platform) ||
    typeof value.fileName !== "string" ||
    !value.fileName.trim() ||
    typeof value.fileSize !== "string" ||
    !value.fileSize.trim()
  ) {
    throw new Error("A download asset was invalid.");
  }

  const extras = value.extras;
  if (extras !== undefined && !Array.isArray(extras)) {
    throw new Error("A download asset contained invalid extras.");
  }

  return {
    platform: value.platform as DownloadAsset["platform"],
    downloadUrl: normalizeGithubReleaseUrl(value.downloadUrl),
    fileName: value.fileName.trim().slice(0, 255),
    fileSize: value.fileSize.trim().slice(0, 100),
    ...(typeof value.buildDate === "string" && value.buildDate.trim()
      ? { buildDate: value.buildDate.trim().slice(0, 100) }
      : {}),
    ...(value.fallbackUrl !== undefined
      ? { fallbackUrl: normalizeGithubReleaseUrl(value.fallbackUrl) }
      : {}),
    ...(typeof value.fallbackName === "string" && value.fallbackName.trim()
      ? { fallbackName: value.fallbackName.trim().slice(0, 255) }
      : {}),
    ...(Array.isArray(extras) ? { extras: extras.map(normalizeExtra) } : {}),
  };
}

export function normalizeReleaseData(payload: unknown): ReleaseData {
  if (!isRecord(payload) || typeof payload.available !== "boolean") {
    throw new Error("The download service response did not match its API contract.");
  }

  const normalizeList = (value: unknown): DownloadAsset[] | undefined => {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) {
      throw new Error("The download service returned an invalid asset list.");
    }
    return value.map(normalizeAsset);
  };

  const releasesPageUrl = optionalReleaseUrl(payload.releasesPageUrl);
  const allReleasesUrl = optionalReleaseUrl(payload.allReleasesUrl);
  const fallbackUrl = optionalReleaseUrl(payload.fallbackUrl);
  const publishedAt = optionalTimestamp(payload.publishedAt);
  const fetchedAt = optionalTimestamp(payload.fetchedAt);
  const desktop = normalizeList(payload.desktop);
  const mobile = normalizeList(payload.mobile);

  return {
    available: payload.available,
    ...(typeof payload.version === "string" && payload.version.trim()
      ? { version: payload.version.trim().slice(0, 100) }
      : {}),
    ...(publishedAt ? { publishedAt } : {}),
    ...(fetchedAt ? { fetchedAt } : {}),
    ...(releasesPageUrl ? { releasesPageUrl } : {}),
    ...(allReleasesUrl ? { allReleasesUrl } : {}),
    ...(fallbackUrl ? { fallbackUrl } : {}),
    ...(typeof payload.message === "string"
      ? { message: payload.message.trim().slice(0, 500) }
      : {}),
    ...(desktop !== undefined ? { desktop } : {}),
    ...(mobile !== undefined ? { mobile } : {}),
  };
}

export async function readReleaseJson(
  response: Pick<Response, "json">,
  timeoutMs = 10_000,
): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      response.json(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error("The download service response took too long to read."),
            ),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
