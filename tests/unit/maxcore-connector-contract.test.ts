import { beforeEach, describe, expect, it, vi } from "vitest";

const env = process.env;

describe("MaxCore connector contract", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...env,
      MAXCORE_LOCAL: "0",
      AI_SERVER_URL: "https://maxcore.example.test/",
      AI_SERVER_KEY: "generation-key",
      MAXCORE_ADMIN_KEY: "admin-key",
    };
  });

  it("uses only the generation Bearer credential for artist workflows", async () => {
    const connector = await import("../../server/services/maxcoreConnector.js");

    expect(connector.getMaxcoreOrigin()).toBe("https://maxcore.example.test");
    expect(connector.getMaxcoreGenerationHeaders()).toEqual({
      Authorization: "Bearer generation-key",
    });
    expect(connector.getMaxcoreGenerationHeaders()).not.toHaveProperty("X-Admin-Key");
  });

  it("uses only the documented admin header for administrative operations", async () => {
    const connector = await import("../../server/services/maxcoreConnector.js");

    expect(connector.getMaxcoreAdminHeaders()).toEqual({
      "X-Admin-Key": "admin-key",
    });
    expect(connector.getMaxcoreAdminHeaders()).not.toHaveProperty("Authorization");
  });

  it("rewrites only MaxCore-relative media fields recursively", async () => {
    const { absolutizeMaxcoreMediaUrls } = await import(
      "../../server/services/maxcoreConnector.js"
    );

    expect(
      absolutizeMaxcoreMediaUrls({
        url: "/uploads/beat.mp3",
        nested: { preview_url: "/media/preview.mp4", title: "/uploads/not-a-url" },
        variants: [{ file_path: "/outputs/image.png" }],
      }),
    ).toEqual({
      url: "https://maxcore.example.test/uploads/beat.mp3",
      nested: {
        preview_url: "https://maxcore.example.test/media/preview.mp4",
        title: "/uploads/not-a-url",
      },
      variants: [{ file_path: "https://maxcore.example.test/outputs/image.png" }],
    });
  });

  it("rewrites legacy absolute local MaxCore media to the allowlisted proxy", async () => {
    process.env = {
      ...env,
      MAXCORE_LOCAL: "1",
      AI_SERVER_URL: "http://127.0.0.1:8090",
      AI_SERVER_KEY: "generation-key",
      SESSION_SECRET: "test-session-secret-0123456789abcdef",
    };
    vi.resetModules();
    const { absolutizeMaxcoreMediaUrls } = await import(
      "../../server/services/maxcoreConnector.js"
    );

    expect(
      absolutizeMaxcoreMediaUrls({
        artworkUrl: "http://127.0.0.1:8090/outputs/cover.png?download=1",
        coverArt: "/media/cover.webp",
        coverArtUrl: "http://127.0.0.1:8090/uploads/cover-art.png",
        previewUrl: "https://cdn.example.test/preview.mp3",
        title: "/uploads/not-a-url",
      }),
    ).toEqual({
      artworkUrl:
        "/api/maxcore-media/outputs/cover.png?download=1",
      coverArt: "/api/maxcore-media/media/cover.webp",
      coverArtUrl: "/api/maxcore-media/uploads/cover-art.png",
      previewUrl: "https://cdn.example.test/preview.mp3",
      title: "/uploads/not-a-url",
    });
  });

  it("does not rewrite an unrelated loopback or external origin", async () => {
    const { absolutizeMaxcoreMediaUrls } = await import(
      "../../server/services/maxcoreConnector.js"
    );

    expect(
      absolutizeMaxcoreMediaUrls({
        artworkUrl: "http://127.0.0.1:9999/outputs/cover.png",
        coverArt: "https://cdn.example.test/cover.png",
      }),
    ).toEqual({
      artworkUrl: "http://127.0.0.1:9999/outputs/cover.png",
      coverArt: "https://cdn.example.test/cover.png",
    });
  });

  it("preserves marketplace row Date values while serializing media", async () => {
    const { absolutizeMaxcoreMediaUrls } = await import(
      "../../server/services/maxcoreConnector.js"
    );
    const createdAt = new Date("2025-01-02T03:04:05.000Z");
    const result = absolutizeMaxcoreMediaUrls({
      createdAt,
      coverArt: "/media/a.png",
    }) as { createdAt: Date; coverArt: string };

    expect(result.createdAt).toBe(createdAt);
    expect(result.coverArt).toBe("https://maxcore.example.test/media/a.png");
  });
});