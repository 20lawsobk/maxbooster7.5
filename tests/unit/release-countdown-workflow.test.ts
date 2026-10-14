import { describe, expect, it, vi } from "vitest";
import { scheduleReleaseCountdown } from "../../server/services/releaseCountdownWorkflow";

const now = new Date("2027-01-01T12:00:00Z");
const config = { platforms: "all", post7Day: true, post3Day: true, post1Day: true, postReleaseDay: true };
function fixture() {
  return {
    loadRelease: vi.fn().mockResolvedValue({
      id: "release", userId: "owner", title: "Actual title",
      releaseDate: new Date("2027-01-20T12:00:00Z"), artworkUrl: null,
    }),
    platforms: vi.fn().mockResolvedValue(["twitter", "facebook"]),
    schedule: vi.fn(async (_owner, _platform, _content, _at, key) => ({ id: `post_${key}` })),
  };
}
describe("durable release countdown", () => {
  it("returns publisher IDs for all eight persisted slots at exact release-relative times", async () => {
    const deps = fixture();
    const result = await scheduleReleaseCountdown("owner", "release", config, deps, now);
    expect(deps.loadRelease).toHaveBeenCalledWith("owner", "release");
    expect(result.scheduled).toHaveLength(8);
    expect(new Set(result.scheduled.map(p => p.postId)).size).toBe(8);
    expect(result.scheduled[0].scheduledAt).toBe("2027-01-13T12:00:00.000Z");
    expect(deps.schedule.mock.calls[0][2].text).toContain("Actual title");
  });
  it("uses identical keys on retries and different keys for different owners", async () => {
    const deps = fixture();
    const a = await scheduleReleaseCountdown("owner", "release", config, deps, now);
    const b = await scheduleReleaseCountdown("owner", "release", config, deps, now);
    expect(a).toEqual(b);
    deps.loadRelease.mockResolvedValue({ ...(await deps.loadRelease()), userId: "other" });
    const c = await scheduleReleaseCountdown("other", "release", config, deps, now);
    expect(c.scheduled[0].postId).not.toBe(a.scheduled[0].postId);
  });
  it("rejects another owner's release before inspecting accounts or scheduling", async () => {
    const deps = fixture();
    await expect(scheduleReleaseCountdown("intruder", "release", config, deps, now)).rejects.toThrow("Release not found");
    expect(deps.platforms).not.toHaveBeenCalled();
    expect(deps.schedule).not.toHaveBeenCalled();
  });
  it("preflights all platforms before scheduling any work", async () => {
    const deps = fixture();
    deps.platforms.mockResolvedValue(["twitter", "tiktok"]);
    await expect(scheduleReleaseCountdown("owner", "release", config, deps, now)).rejects.toThrow("unavailable for tiktok");
    expect(deps.schedule).not.toHaveBeenCalled();
  });
  it("rejects Instagram without artwork", async () => {
    const deps = fixture();
    deps.platforms.mockResolvedValue(["instagram"]);
    await expect(scheduleReleaseCountdown("owner", "release", config, deps, now)).rejects.toThrow("require release artwork");
    expect(deps.schedule).not.toHaveBeenCalled();
  });
  it("reports past slots as skipped rather than scheduled", async () => {
    const deps = fixture();
    const result = await scheduleReleaseCountdown("owner", "release", config, deps, new Date("2027-01-18T12:00:00Z"));
    expect(result.skippedPastOffsets).toEqual([7, 3]);
    expect(result.scheduled).toHaveLength(4);
  });
  it("does not claim success after an enqueue failure", async () => {
    const deps = fixture();
    deps.schedule.mockRejectedValueOnce(new Error("Queue unavailable"));
    await expect(scheduleReleaseCountdown("owner", "release", config, deps, now)).rejects.toThrow("Queue unavailable");
  });
  it("rejects malformed flags before any scheduling", async () => {
    const deps = fixture();
    await expect(scheduleReleaseCountdown("owner", "release", { ...config, post1Day: "false" }, deps, now)).rejects.toThrow("must be a boolean");
    expect(deps.schedule).not.toHaveBeenCalled();
  });
});
