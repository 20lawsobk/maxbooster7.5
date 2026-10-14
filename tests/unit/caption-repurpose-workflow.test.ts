import { describe, expect, it, vi } from "vitest";
import { repurposePublishedCaption } from "../../server/services/captionRepurposeWorkflow";

const now = new Date("2027-01-01T12:00:00Z");
const config = { targetPlatforms: "all", autoSchedule: false, staggerHours: 2 };
function fixture() {
  const rows = new Map<string, any>();
  return {
    rows,
    source: vi.fn().mockResolvedValue({
      userId: "owner", platform: "facebook", status: "published",
      publishedAt: new Date("2027-01-01T11:00:00Z"), text: "Source facts",
      mediaUrl: "https://example.test/art.jpg", mediaType: "image",
    }),
    platforms: vi.fn().mockResolvedValue(["twitter", "instagram"]),
    existing: vi.fn(async (id: string) => rows.get(id) ?? null),
    generate: vi.fn(async (_owner: string, platform: string) => `Adapted for ${platform}`),
    persist: vi.fn(async (input: any) => {
      const row = { id: `post_${input.key}`, userId: input.userId, content: input.content,
        status: input.autoSchedule ? "pending" : "draft" };
      rows.set(row.id, row);
      return row;
    }),
  };
}
describe("owned, durable caption repurposing", () => {
  it("persists generated drafts and returns their actual IDs and states", async () => {
    const deps = fixture();
    const result = await repurposePublishedCaption("owner", "source", config, deps, now);
    expect(result.artifacts).toHaveLength(2);
    expect(result.artifacts.every(p => p.status === "draft")).toBe(true);
    expect(deps.generate).toHaveBeenCalledWith("owner", "instagram", "Source facts", expect.any(Number));
    expect(deps.persist.mock.calls[0][0].content.mediaUrl).toBe("https://example.test/art.jpg");
  });
  it("reuses persisted captions and keys on retries rather than generating new variants", async () => {
    const deps = fixture();
    const a = await repurposePublishedCaption("owner", "source", config, deps, now);
    const b = await repurposePublishedCaption("owner", "source", config, deps, now);
    expect(a).toEqual(b);
    expect(deps.generate).toHaveBeenCalledTimes(2);
    expect(deps.rows.size).toBe(2);
  });
  it("anchors scheduled times to the publication, not the retry clock", async () => {
    const deps = fixture();
    await repurposePublishedCaption("owner", "source", { ...config, autoSchedule: true }, deps, now);
    expect(deps.persist.mock.calls.map(([p]) => p.at.toISOString()))
      .toEqual(["2027-01-01T13:00:00.000Z", "2027-01-01T15:00:00.000Z"]);
  });
  it("denies a foreign source before generation", async () => {
    const deps = fixture();
    await expect(repurposePublishedCaption("intruder", "source", config, deps, now)).rejects.toThrow("not found");
    expect(deps.generate).not.toHaveBeenCalled();
    expect(deps.persist).not.toHaveBeenCalled();
  });
  it("preserves generation errors without substituting template content", async () => {
    const deps = fixture();
    deps.generate.mockRejectedValue(new Error("Checkpoint cannot encode source"));
    await expect(repurposePublishedCaption("owner", "source", config, deps, now)).rejects.toThrow("cannot encode");
    expect(deps.persist).not.toHaveBeenCalled();
  });
  it("does not persist partial work when a later generation fails", async () => {
    const deps = fixture();
    deps.generate.mockResolvedValueOnce("first").mockRejectedValueOnce(new Error("second failed"));
    await expect(repurposePublishedCaption("owner", "source", config, deps, now)).rejects.toThrow("second failed");
    expect(deps.persist).not.toHaveBeenCalled();
  });
  it("rejects empty output", async () => {
    const deps = fixture();
    deps.generate.mockResolvedValue(" ");
    await expect(repurposePublishedCaption("owner", "source", config, deps, now)).rejects.toThrow("usable caption");
    expect(deps.persist).not.toHaveBeenCalled();
  });
  it("preflights TikTok video requirements", async () => {
    const deps = fixture();
    deps.platforms.mockResolvedValue(["twitter", "tiktok"]);
    await expect(repurposePublishedCaption("owner", "source", config, deps, now)).rejects.toThrow("requires source video");
    expect(deps.generate).not.toHaveBeenCalled();
  });
  it("propagates persistence failure", async () => {
    const deps = fixture();
    deps.persist.mockRejectedValue(new Error("storage down"));
    await expect(repurposePublishedCaption("owner", "source", config, deps, now)).rejects.toThrow("storage down");
  });
});
