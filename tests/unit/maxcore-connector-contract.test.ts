import { beforeEach, describe, expect, it, vi } from "vitest";

const env = process.env;

describe("MaxCore connector contract", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...env,
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
});