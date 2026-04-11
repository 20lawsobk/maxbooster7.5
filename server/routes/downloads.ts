import { Router } from 'express';
import { logger } from '../logger.js';

const router = Router();

const GITHUB_OWNER = '20lawsobk';
const GITHUB_REPO = 'maxbooster7.5';
const CACHE_TTL_MS = 5 * 60 * 1000;

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
  download_count: number;
  content_type: string;
}

interface ReleaseInfo {
  version: string;
  tag: string;
  published_at: string;
  html_url: string;
  assets: ReleaseAsset[];
  platforms: {
    windows: { installer?: ReleaseAsset; portable?: ReleaseAsset };
    mac: { dmg?: ReleaseAsset; zip?: ReleaseAsset };
    linux: { appimage?: ReleaseAsset; deb?: ReleaseAsset; tarball?: ReleaseAsset };
    android: { apk?: ReleaseAsset; aab?: ReleaseAsset };
  };
}

let cachedRelease: ReleaseInfo | null = null;
let cacheTimestamp = 0;

function classifyAsset(asset: { name: string; browser_download_url: string; size: number; download_count: number; content_type: string }) {
  const name = asset.name.toLowerCase();
  if (name.endsWith('.exe') && (name.includes('setup') || name.includes('install'))) return { platform: 'windows', type: 'installer' } as const;
  if (name.endsWith('.exe')) return { platform: 'windows', type: 'portable' } as const;
  if (name.endsWith('.msi')) return { platform: 'windows', type: 'installer' } as const;
  if (name.endsWith('.dmg')) return { platform: 'mac', type: 'dmg' } as const;
  if (name.endsWith('.zip') && name.includes('mac')) return { platform: 'mac', type: 'zip' } as const;
  if (name.endsWith('.appimage')) return { platform: 'linux', type: 'appimage' } as const;
  if (name.endsWith('.deb')) return { platform: 'linux', type: 'deb' } as const;
  if (name.endsWith('.tar.gz') || name.endsWith('.tgz')) return { platform: 'linux', type: 'tarball' } as const;
  if (name.endsWith('.apk')) return { platform: 'android', type: 'apk' } as const;
  if (name.endsWith('.aab')) return { platform: 'android', type: 'aab' } as const;
  return null;
}

async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  const now = Date.now();
  if (cachedRelease && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedRelease;
  }

  try {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'MaxBooster-App',
    };
    const token = process.env.GITHUB_PAT || process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      { headers }
    );

    if (!response.ok) {
      if (response.status === 404) {
        const allResponse = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=1`,
          { headers }
        );
        if (!allResponse.ok) {
          logger.warn(`GitHub releases API returned ${allResponse.status}`);
          return null;
        }
        const releases = await allResponse.json();
        if (!releases.length) return null;
        return processRelease(releases[0]);
      }
      logger.warn(`GitHub releases API returned ${response.status}`);
      return null;
    }

    const data = await response.json();
    return processRelease(data);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to fetch GitHub releases:');
    return null;
  }
}

function processRelease(data: any): ReleaseInfo {
  const platforms: ReleaseInfo['platforms'] = {
    windows: {},
    mac: {},
    linux: {},
    android: {},
  };

  const assets: ReleaseAsset[] = (data.assets || []).map((a: any) => ({
    name: a.name,
    browser_download_url: a.browser_download_url,
    size: a.size,
    download_count: a.download_count,
    content_type: a.content_type,
  }));

  for (const asset of assets) {
    const classification = classifyAsset(asset);
    if (!classification) continue;
    const { platform, type } = classification;
    (platforms as any)[platform][type] = asset;
  }

  const version = (data.tag_name || '').replace(/^v/, '') || data.name || 'unknown';

  const result: ReleaseInfo = {
    version,
    tag: data.tag_name || '',
    published_at: data.published_at || '',
    html_url: data.html_url || '',
    assets,
    platforms,
  };

  cachedRelease = result;
  cacheTimestamp = Date.now();

  return result;
}

function formatSize(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

router.get('/latest', async (_req, res) => {
  try {
    const release = await fetchLatestRelease();
    if (!release) {
      return res.json({
        available: false,
        message: 'No releases found',
        fallbackUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`,
      });
    }

    const desktopDownloads = [];
    const mobileDownloads = [];

    if (release.platforms.windows.installer || release.platforms.windows.portable) {
      const primary = release.platforms.windows.installer || release.platforms.windows.portable;
      const fallback = release.platforms.windows.portable || release.platforms.windows.installer;
      desktopDownloads.push({
        platform: 'Windows',
        downloadUrl: primary!.browser_download_url,
        fileName: primary!.name,
        fileSize: formatSize(primary!.size),
        fallbackUrl: fallback !== primary ? fallback!.browser_download_url : undefined,
        fallbackName: fallback !== primary ? fallback!.name : undefined,
      });
    }

    if (release.platforms.mac.dmg || release.platforms.mac.zip) {
      const primary = release.platforms.mac.dmg || release.platforms.mac.zip;
      const fallback = release.platforms.mac.zip || release.platforms.mac.dmg;
      desktopDownloads.push({
        platform: 'macOS',
        downloadUrl: primary!.browser_download_url,
        fileName: primary!.name,
        fileSize: formatSize(primary!.size),
        fallbackUrl: fallback !== primary ? fallback!.browser_download_url : undefined,
        fallbackName: fallback !== primary ? fallback!.name : undefined,
      });
    }

    if (release.platforms.linux.appimage || release.platforms.linux.deb || release.platforms.linux.tarball) {
      const primary = release.platforms.linux.appimage || release.platforms.linux.deb;
      const deb = release.platforms.linux.deb;
      const tarball = release.platforms.linux.tarball;
      desktopDownloads.push({
        platform: 'Linux',
        downloadUrl: primary!.browser_download_url,
        fileName: primary!.name,
        fileSize: formatSize(primary!.size),
        fallbackUrl: tarball ? tarball.browser_download_url : (deb && deb !== primary ? deb.browser_download_url : undefined),
        fallbackName: tarball ? tarball.name : (deb && deb !== primary ? deb.name : undefined),
        extras: [
          ...(deb && deb !== primary ? [{ label: '.deb Package', url: deb.browser_download_url, name: deb.name, size: formatSize(deb.size) }] : []),
          ...(tarball ? [{ label: 'tar.gz Archive', url: tarball.browser_download_url, name: tarball.name, size: formatSize(tarball.size) }] : []),
          ...(release.platforms.linux.appimage && primary !== release.platforms.linux.appimage ? [{ label: 'AppImage', url: release.platforms.linux.appimage.browser_download_url, name: release.platforms.linux.appimage.name, size: formatSize(release.platforms.linux.appimage.size) }] : []),
        ].filter(e => e),
      });
    }

    if (release.platforms.android.apk) {
      const asset = release.platforms.android.apk;
      mobileDownloads.push({
        platform: 'Android',
        downloadUrl: asset.browser_download_url,
        fileName: asset.name,
        fileSize: formatSize(asset.size),
      });
    }

    res.json({
      available: true,
      version: release.version,
      publishedAt: release.published_at,
      releasesPageUrl: release.html_url,
      allReleasesUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`,
      desktop: desktopDownloads,
      mobile: mobileDownloads,
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get download info:');
    res.status(500).json({
      available: false,
      error: 'Failed to fetch release information',
      fallbackUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`,
    });
  }
});

export default router;
