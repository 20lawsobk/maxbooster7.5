import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { persistGeneratedImage } from "../../server/services/generatedImageAsset.js";
import { isDeliveredGenerationAsset } from "../../client/src/lib/generatedAssetDelivery";

let png: Buffer;
beforeAll(async () => { png = await sharp({ create: { width: 32, height: 24, channels: 3, background: "blue" } }).png().toBuffer(); });
function fixture(bytes = png) {
  const storage = { uploadGeneratedFile: vi.fn().mockResolvedValue("users/owner/generated-images/image.png"),
    downloadFile: vi.fn().mockResolvedValue(bytes) };
  return { storage: storage as never, fetchImpl: vi.fn().mockResolvedValue(new Response(bytes)), authorize: vi.fn() };
}
describe("generated image delivery", () => {
  it("decodes actual bytes and verifies the owner-scoped saved read-back", async () => {
    const deps = fixture();
    await expect(persistGeneratedImage("/uploads/images/image.png", "owner", deps)).resolves.toMatchObject({
      url: "/api/storage/file/users%2Fowner%2Fgenerated-images%2Fimage.png", width: 32, height: 24,
      format: "png", validation: { artifact_validated: true },
    });
    expect(deps.storage.uploadGeneratedFile).toHaveBeenCalledOnce();
    expect(deps.storage.downloadFile).toHaveBeenCalledOnce();
    expect(deps.fetchImpl.mock.calls[0][1]).toMatchObject({ redirect: "manual", headers: { "X-MaxCore-User-Id": "owner" } });
  });
  it("rejects a truncated image before saving", async () => {
    const deps = fixture(png.subarray(0, 40));
    await expect(persistGeneratedImage("/uploads/images/image.png", "owner", deps)).rejects.toThrow();
    expect(deps.storage.uploadGeneratedFile).not.toHaveBeenCalled();
  });
  it("rejects a saved byte mismatch", async () => {
    const deps = fixture(); deps.storage.downloadFile.mockResolvedValue(Buffer.from("different"));
    await expect(persistGeneratedImage("/uploads/images/image.png", "owner", deps)).rejects.toThrow(/read-back/);
  });
  it.each(["https://example.invalid/uploads/images/a.png", "//example.invalid/uploads/images/a.png",
    "/uploads/images/a.png?token=secret", "asset://image-spec", "/api/storage/file/users/other/a.png",
    "/api/storage/file/users%2Fowner%2F..%2Fa.png"])("rejects untrusted or foreign output %s", async url => {
    const deps = fixture(); await expect(persistGeneratedImage(url, "owner", deps)).rejects.toThrow();
    expect(deps.fetchImpl).not.toHaveBeenCalled(); expect(deps.storage.downloadFile).not.toHaveBeenCalled();
  });
  it("authorizes existing storage grants before reading saved bytes", async () => {
    const deps = fixture(); deps.authorize.mockRejectedValue(new Error("deleted grant"));
    await expect(persistGeneratedImage("/api/storage/file/users/owner/image.png", "owner", deps)).rejects.toThrow("deleted grant");
    expect(deps.storage.downloadFile).not.toHaveBeenCalled();
  });
  it("rejects redirect responses without following them", async () => {
    const deps = fixture(); deps.fetchImpl.mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://example.invalid" } }));
    await expect(persistGeneratedImage("/uploads/images/image.png", "owner", deps)).rejects.toThrow(/download/);
  });
});
describe("social generated asset display", () => {
  it.each(["image", "audio", "video"])("accepts a delivered %s file", modality => {
    expect(isDeliveredGenerationAsset({ modality, payload: "/api/storage/file/users%2Fowner%2Fmedia%2Ffile" })).toBe(true);
    expect(isDeliveredGenerationAsset({ modality, payload: "asset://plan" })).toBe(false);
    expect(isDeliveredGenerationAsset({ modality, payload: "/api/storage/file/users/owner/file", metadata: { kind: "specification" } })).toBe(false);
  });
  it("accepts finished text and excludes plans and empty results", () => {
    expect(isDeliveredGenerationAsset({ modality: "text", payload: "Release announcement" })).toBe(true);
    expect(isDeliveredGenerationAsset({ modality: "text", payload: "Plan", metadata: { kind: "plan" } })).toBe(false);
    expect(isDeliveredGenerationAsset({ modality: "text", payload: "  " })).toBe(false);
  });
});
