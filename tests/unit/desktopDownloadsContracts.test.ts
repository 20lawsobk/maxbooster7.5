import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  normalizeGithubReleaseUrl,
  normalizeReleaseData,
  readReleaseJson,
} from "../../client/src/lib/downloadReleaseContracts";
import { processGithubRelease } from "../../server/routes/downloadsImpl";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const canonicalDownload =
  "https://github.com/20lawsobk/maxbooster7.5/releases/download/v3.0.0/Max-Booster-3.0.0.AppImage";

describe("Desktop download metadata boundary", () => {
  it("allows only HTTPS URLs inside the canonical repository", () => {
    expect(normalizeGithubReleaseUrl(canonicalDownload)).toBe(canonicalDownload);
    expect(
      normalizeGithubReleaseUrl(
        "https://github.com/20lawsobk/maxbooster7.5/releases",
      ),
    ).toBe("https://github.com/20lawsobk/maxbooster7.5/releases");

    for (const url of [
      "http://github.com/20lawsobk/maxbooster7.5/releases/download/v1/a.exe",
      "https://github.com/another/repository/releases/download/v1/a.exe",
      "https://example.com/a.exe",
      "javascript:alert(1)",
    ]) {
      expect(() => normalizeGithubReleaseUrl(url)).toThrow();
    }
  });

  it("normalizes valid release data and rejects invalid timestamps or assets", () => {
    expect(
      normalizeReleaseData({
        available: true,
        version: "3.0.0",
        fetchedAt: "2026-10-16T14:30:00.000Z",
        releasesPageUrl:
          "https://github.com/20lawsobk/maxbooster7.5/releases/tag/v3.0.0",
        allReleasesUrl:
          "https://github.com/20lawsobk/maxbooster7.5/releases",
        desktop: [
          {
            platform: "Linux",
            downloadUrl: canonicalDownload,
            fileName: "Max-Booster-3.0.0.AppImage",
            fileSize: "120 MB",
          },
        ],
        mobile: [],
      }),
    ).toMatchObject({
      available: true,
      version: "3.0.0",
      desktop: [
        {
          platform: "Linux",
          downloadUrl: canonicalDownload,
        },
      ],
    });

    expect(() =>
      normalizeReleaseData({ available: true, fetchedAt: "not-a-date" }),
    ).toThrow(/timestamp/i);
    expect(() =>
      normalizeReleaseData({
        available: true,
        desktop: [
          {
            platform: "Linux",
            downloadUrl: "https://example.com/a.AppImage",
            fileName: "a.AppImage",
            fileSize: "1 MB",
          },
        ],
      }),
    ).toThrow(/official Max Booster repository/i);
  });

  it("bounds stalled response bodies", async () => {
    vi.useFakeTimers();
    try {
      const pending = readReleaseJson(
        { json: () => new Promise<never>(() => {}) },
        25,
      );
      await vi.advanceTimersByTimeAsync(25);
      await expect(pending).rejects.toThrow(/too long/i);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("GitHub release service", () => {
  it("classifies approved assets and drops assets outside the repository", () => {
    const release = processGithubRelease({
      tag_name: "v3.0.0",
      name: "Max Booster 3.0.0",
      published_at: "2026-10-16T14:00:00.000Z",
      html_url:
        "https://github.com/20lawsobk/maxbooster7.5/releases/tag/v3.0.0",
      assets: [
        {
          name: "Max-Booster-3.0.0.AppImage",
          browser_download_url: canonicalDownload,
          size: 1024,
          download_count: 3,
          content_type: "application/octet-stream",
        },
        {
          name: "foreign.exe",
          browser_download_url:
            "https://github.com/another/repository/releases/download/v3/foreign.exe",
          size: 1024,
          download_count: 0,
          content_type: "application/octet-stream",
        },
      ],
    });

    expect(release?.version).toBe("3.0.0");
    expect(release?.assets).toHaveLength(1);
    expect(release?.platforms.linux.appimage?.name).toBe(
      "Max-Booster-3.0.0.AppImage",
    );
    expect(release?.platforms.windows.installer).toBeUndefined();
  });

  it("falls back to the canonical releases page when html_url is untrusted", () => {
    expect(
      processGithubRelease({
        tag_name: "v1",
        html_url: "https://example.com/fake",
        assets: [],
      })?.html_url,
    ).toBe("https://github.com/20lawsobk/maxbooster7.5/releases");
  });
});

describe("Desktop page integration contract", () => {
  it("routes through the reviewed page and avoids dynamic Tailwind classes", () => {
    const routePage = read("client/src/pages/DesktopApp.tsx");
    const page = read("client/src/pages/DesktopAppPageImpl.tsx");

    expect(routePage).toContain(
      'export { default } from "./DesktopAppPageImpl"',
    );
    expect(page).toContain("useRequireSubscription");
    expect(page).toContain("normalizeReleaseData");
    expect(page).toContain("AbortController");
    expect(page).not.toContain("hover:border-${");
    expect(page).not.toContain("text-${");
    expect(page).not.toContain("100% safe");
    expect(page).toContain("Verify the source, not a blanket safety claim");
  });

  it("keeps backend release metadata and Electron update feed on the same repository", () => {
    const routeWrapper = read("server/routes/downloads.ts");
    const route = read("server/routes/downloadsImpl.ts");
    const builder = read("electron-builder.config.cjs");
    const desktopWorkflow = read(".github/workflows/build-desktop.yml");
    const mobileWorkflow = read(".github/workflows/build-mobile.yml");

    expect(routeWrapper).not.toContain("@ts-nocheck");
    expect(route).toContain('const GITHUB_OWNER = "20lawsobk"');
    expect(route).toContain('const GITHUB_REPO = "maxbooster7.5"');
    expect(route).toContain("AbortSignal.timeout");
    expect(route).toContain("RELEASE_DOWNLOAD_PREFIX");

    expect(builder).toContain('owner: "20lawsobk"');
    expect(builder).toContain('repo: "maxbooster7.5"');

    expect(desktopWorkflow).toContain("softprops/action-gh-release@v2");
    expect(desktopWorkflow).toContain("--publish never");
    expect(mobileWorkflow).toContain("softprops/action-gh-release@v2");
  });
});
