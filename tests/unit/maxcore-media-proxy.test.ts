/**
 * Unit tests for the access-control guard on the public, unauthenticated
 * /api/maxcore-media/* proxy (server/routes/maxcoreProxy.ts).
 *
 * This proxy exists so browsers can load MaxCore-generated media (cover art,
 * previews) even when MaxCore's real origin is a loopback address they can
 * never reach directly (see .agents/memory + absolutizeMaxcoreMediaUrls in
 * server/services/maxcoreConnector.ts). Because it is public and unauthenticated,
 * isAllowedMaxcoreMediaPath is the ONLY thing standing between it and becoming
 * an open relay to MaxCore's full GET surface — these tests lock in that
 * boundary directly, independent of any running server or MaxCore instance.
 */
import { describe, it, expect } from "vitest";
import { isAllowedMaxcoreMediaPath } from "../../server/services/maxcoreConnector.js";

describe("isAllowedMaxcoreMediaPath", () => {
  it.each([
    "/uploads/images/img_b750a13982d54c5d.png",
    "/media/audio/preview_abc123.mp3",
    "/static/assets/logo.png",
    "/files/exports/report.pdf",
    "/outputs/video/render_1.mp4",
  ])("allows a media-prefixed path %s", (p) => {
    expect(isAllowedMaxcoreMediaPath(p)).toBe(true);
  });

  it.each([
    "",
    "/api/platform/model/info",
    "/health",
    "/admin/secrets",
    "/api/storage/artist/some-profile",
    "uploads/images/no-leading-slash.png",
  ])("rejects a non-media path %s", (p) => {
    expect(isAllowedMaxcoreMediaPath(p)).toBe(false);
  });

  it.each([
    "/uploads/../../../etc/passwd",
    "/uploads/%2e%2e/%2e%2e/etc/passwd",
    "/media/..%2f..%2fadmin",
    "/uploads/foo\0bar",
  ])("rejects traversal attempts %s", (p) => {
    expect(isAllowedMaxcoreMediaPath(p)).toBe(false);
  });

  it("rejects a path with an unparseable percent-encoding", () => {
    expect(isAllowedMaxcoreMediaPath("/uploads/%")).toBe(false);
  });
});
