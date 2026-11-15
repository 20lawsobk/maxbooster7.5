import { Router } from "express";
import { logger } from "../logger.js";

const router = Router();

const GITHUB_OWNER = "20lawsobk";
const GITHUB_REPO = "maxbooster7.5";
const CACHE_TTL_MS = 5 * 60 * 1000;
const GITHUB_API_TIMEOUT_MS = 10_000;
const RELEASES_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;
const RELEASE_DOWNLOAD_PREFIX = `/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/`;

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
  download_count: number;
  content_type: string;
}

type PlatformAssets = {
  windows: { installer?: ReleaseAsset; portable?: ReleaseAsset };
  mac: { dmg?: ReleaseAsset; zip?: ReleaseAsset };
  linux: {
    appimage?: ReleaseAsset;
    deb?: ReleaseAsset;
    tarball?: ReleaseAsset;
  };
  android: { apk?: ReleaseAsset; aab?: ReleaseAsset };
  ios: { ipa?: ReleaseAsset };
};

interface ReleaseInfo {
  version: string;
  tag: string;
  published_at: string;
  html_url: string;
  assets: ReleaseAsset[];
  platforms: PlatformAssets;
}

interface GithubReleasePayload {
  tag_name?: unknown;
  name?: unknown;
  published_at?: unknown;
  html_url?: unknown;
  assets?: unknown;
}

let cachedRelease: ReleaseInfo | null = null;
let cacheTimestamp = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function approvedReleaseDownloadUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== "github.com" ||
      !parsed.pathname.startsWith(RELEASE_DOWNLOAD_PREFIX)
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function approvedReleasePageUrl(value: unknown): string {
  if (typeof value !== "string") return RELEASES_URL;
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol === "https:" &&
      parsed.hostname === "github.com" &&
      parsed.pathname.startsWith(`/${GITHUB_OWNER}/${GITHUB_REPO}/releases`)
    ) {
      return parsed.toString();
    }
  } catch {
    // Fall back to the canonical repository releases page.
  }
  return RELEASES_URL;
}

function classifyAsset(asset: ReleaseAsset):
  | { platform: "windows"; type: "installer" | "portable" }
  | { platform: "mac"; type: "dmg" | "zip" }
  | { platform: "linux"; type: "appimage" | "deb" | "tarball" }
  | { platform: "android"; type: "apk" | "aab" }
  | { platform: "ios"; type: "ipa" }
  | null {
  const name = asset.name.toLowerCase();
  if (
    name.endsWith(".exe") &&
    (name.includes("setup") || name.includes("install"))
  ) {
    return { platform: "windows", type: "installer" };
  }
  if (name.endsWith(".exe")) return { platform: "windows", type: "portable" };
  if (name.endsWith(".msi")) return { platform: "windows", type: "installer" };
  if (name.endsWith(".dmg")) return { platform: "mac", type: "dmg" };
  if (name.endsWith(".zip") && name.includes("mac")) {
    return { platform: "mac", type: "zip" };
  }
  if (name.endsWith(".appimage")) return { platform: "linux", type: "appimage" };
  if (name.endsWith(".deb")) return { platform: "linux", type: "deb" };
  if (name.endsWith(".tar.gz") || name.endsWith(".tgz")) {
    return { platform: "linux", type: "tarball" };
  }
  if (name.endsWith(".apk")) return { platform: "android", type: "apk" };
  if (name.endsWith(".aab")) return { platform: "android", type: "aab" };
  if (name.endsWith(".ipa")) return { platform: "ios", type: "ipa" };
  return null;
}

function placeAsset(platforms: PlatformAssets, asset: ReleaseAsset): void {
  const classification = classifyAsset(asset);
  if (!classification) return;
  switch (classification.platform) {
    case "windows":
      platforms.windows[classification.type] = asset;
      return;
    case "mac":
      platforms.mac[classification.type] = asset;
      return;
    case "linux":
      platforms.linux[classification.type] = asset;
      return;
    case "android":
      platforms.android[classification.type] = asset;
      return;
    case "ios":
      platforms.ios[classification.type] = asset;
      return;
  }
}

function normalizeAsset(value: unknown): ReleaseAsset | null {
  if (!isRecord(value)) return null;
  const downloadUrl = approvedReleaseDownloadUrl(value.browser_download_url);
  if (
    typeof value.name !== "string" ||
    !value.name.trim() ||
    value.name.length > 255 ||
    !downloadUrl ||
    typeof value.size !== "number" ||
    !Number.isFinite(value.size) ||
    value.size < 0
  ) {
    return null;
  }
  return {
    name: value.name,
    browser_download_url: downloadUrl,
    size: value.size,
    download_count:
      typeof value.download_count === "number" &&
      Number.isFinite(value.download_count) &&
      value.download_count >= 0
        ? value.download_count
        : 0,
    content_type:
      typeof value.content_type === "string" ? value.content_type.slice(0, 255) : "",
  };
}

export function processGithubRelease(payload: unknown): ReleaseInfo | null {
  if (!isRecord(payload)) return null;
  const data = payload as GithubReleasePayload;
  const assets = Array.isArray(data.assets)
    ? data.assets.map(normalizeAsset).filter((asset): asset is ReleaseAsset => Boolean(asset))
    : [];

  const platforms: PlatformAssets = {
    windows: {},
    mac: {},
    linux: {},
    android: {},
    ios: {},
  };
  for (const asset of assets) placeAsset(platforms, asset);

  const rawTag = typeof data.tag_name === "string" ? data.tag_name.trim() : "";
  const rawName = typeof data.name === "string" ? data.name.trim() : "";
  const version = (rawTag.replace(/^v/, "") || rawName || "unknown").slice(0, 100);
  const publishedAt =
    typeof data.published_at === "string" &&
    Number.isFinite(Date.parse(data.published_at))
      ? data.published_at
      : "";

  return {
    version,
    tag: rawTag.slice(0, 100),
    published_at: publishedAt,
    html_url: approvedReleasePageUrl(data.html_url),
    assets,
    platforms,
  };
}

async function githubHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "MaxBooster-App",
  };
  const token = process.env.GITHUB_PAT || process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  const now = Date.now();
  if (cachedRelease && now - cacheTimestamp < CACHE_TTL_MS) return cachedRelease;

  try {
    const headers = await githubHeaders();
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      { signal: AbortSignal.timeout(GITHUB_API_TIMEOUT_MS), headers },
    );

    let payload: unknown;
    if (response.status === 404) {
      const allResponse = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=1`,
        { signal: AbortSignal.timeout(GITHUB_API_TIMEOUT_MS), headers },
      );
      if (!allResponse.ok) {
        logger.warn(`GitHub releases API returned ${allResponse.status}`);
        return null;
      }
      const releases: unknown = await allResponse.json();
      payload = Array.isArray(releases) ? releases[0] : undefined;
    } else if (!response.ok) {
      logger.warn(`GitHub releases API returned ${response.status}`);
      return null;
    } else {
      payload = await response.json();
    }

    const release = processGithubRelease(payload);
    if (!release) return null;
    cachedRelease = release;
    cacheTimestamp = Date.now();
    return release;
  } catch (error) {
    logger.warn({ err: error }, "Failed to fetch GitHub releases");
    return null;
  }
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "Unknown size";
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function downloadAsset(
  platform: "Windows" | "macOS" | "Linux" | "Android" | "iOS",
  primary: ReleaseAsset,
  fallback?: ReleaseAsset,
) {
  return {
    platform,
    downloadUrl: primary.browser_download_url,
    fileName: primary.name,
    fileSize: formatSize(primary.size),
    ...(fallback && fallback !== primary
      ? {
          fallbackUrl: fallback.browser_download_url,
          fallbackName: fallback.name,
        }
      : {}),
  };
}

router.get("/latest", async (_req, res) => {
  try {
    const release = await fetchLatestRelease();
    if (!release) {
      return res.json({
        available: false,
        message: "No current release is available",
        fallbackUrl: RELEASES_URL,
        allReleasesUrl: RELEASES_URL,
        fetchedAt: new Date().toISOString(),
      });
    }

    const desktop: Array<Record<string, unknown>> = [];
    const mobile: Array<Record<string, unknown>> = [];

    const windowsPrimary =
      release.platforms.windows.installer || release.platforms.windows.portable;
    if (windowsPrimary) {
      desktop.push(
        downloadAsset(
          "Windows",
          windowsPrimary,
          release.platforms.windows.portable || release.platforms.windows.installer,
        ),
      );
    }

    const macPrimary = release.platforms.mac.dmg || release.platforms.mac.zip;
    if (macPrimary) {
      desktop.push(
        downloadAsset(
          "macOS",
          macPrimary,
          release.platforms.mac.zip || release.platforms.mac.dmg,
        ),
      );
    }

    const linuxPrimary =
      release.platforms.linux.appimage ||
      release.platforms.linux.deb ||
      release.platforms.linux.tarball;
    if (linuxPrimary) {
      const extras = [
        release.platforms.linux.deb && release.platforms.linux.deb !== linuxPrimary
          ? {
              label: ".deb Package",
              url: release.platforms.linux.deb.browser_download_url,
              name: release.platforms.linux.deb.name,
              size: formatSize(release.platforms.linux.deb.size),
            }
          : null,
        release.platforms.linux.tarball &&
        release.platforms.linux.tarball !== linuxPrimary
          ? {
              label: "tar.gz Archive",
              url: release.platforms.linux.tarball.browser_download_url,
              name: release.platforms.linux.tarball.name,
              size: formatSize(release.platforms.linux.tarball.size),
            }
          : null,
        release.platforms.linux.appimage &&
        release.platforms.linux.appimage !== linuxPrimary
          ? {
              label: "AppImage",
              url: release.platforms.linux.appimage.browser_download_url,
              name: release.platforms.linux.appimage.name,
              size: formatSize(release.platforms.linux.appimage.size),
            }
          : null,
      ].filter((extra): extra is NonNullable<typeof extra> => extra !== null);

      desktop.push({
        ...downloadAsset("Linux", linuxPrimary),
        ...(extras.length ? { extras } : {}),
      });
    }

    if (release.platforms.android.apk) {
      mobile.push(downloadAsset("Android", release.platforms.android.apk));
    }
    if (release.platforms.ios.ipa) {
      mobile.push(downloadAsset("iOS", release.platforms.ios.ipa));
    }

    return res.json({
      available: true,
      version: release.version,
      publishedAt: release.published_at,
      fetchedAt: new Date().toISOString(),
      releasesPageUrl: release.html_url,
      allReleasesUrl: RELEASES_URL,
      desktop,
      mobile,
    });
  } catch (error) {
    logger.warn({ err: error }, "Failed to get download info");
    return res.status(500).json({
      available: false,
      message: "Failed to fetch release information",
      fallbackUrl: RELEASES_URL,
      allReleasesUrl: RELEASES_URL,
      fetchedAt: new Date().toISOString(),
    });
  }
});

export default router;
