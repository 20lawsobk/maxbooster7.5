import { describe, expect, it, vi } from "vitest";
vi.mock("../../server/services/maxcoreClient.js", () => ({ MaxCoreAIClient: { poll: vi.fn() } }));
import { resolveMaxCoreAudioJob, maxcoreAudioSource } from "../../server/services/maxcoreAudioJob.js";
import { MaxCoreControlError } from "../../server/services/maxcoreControlTransport.js";
import { maxcoreOwnerContext } from "../../server/lib/maxcoreOwnerContext.js";

describe("owner-bound bounded MaxCore audio jobs", () => {
  it("polls the real job path with the owner and resolves the final nested artifact", async () => {
    const poll = vi.fn().mockResolvedValue({ status: "done", result: {
      url: "/api/storage/file/users%2Fowner%2Faudio.wav",
    } });
    const result = await resolveMaxCoreAudioJob({ job_id: "job-1", status: "processing" }, "owner", { poll });
    expect(poll).toHaveBeenCalledWith("/api/audio-job/job-1", "owner", expect.any(Number), true);
    expect(maxcoreAudioSource(result)).toBe("/api/storage/file/users%2Fowner%2Faudio.wav");
  });
  it("binds the actual authenticated session instead of a conflicting background owner", async () => {
    const poll = vi.fn().mockResolvedValue({ status: "done", url: "/api/storage/file/users%2Factual%2Faudio.wav" });
    await new Promise<void>((resolve, reject) => maxcoreOwnerContext({ user: { id: "actual" } } as any, {} as any, () => {
      resolveMaxCoreAudioJob({ job_id: "job-1" }, "spoofed", { poll }).then(() => resolve(), reject);
    }));
    expect(poll.mock.calls[0][1]).toBe("actual");
  });
  it.each(["failed", "error", "cancelled", "canceled", "timed_out", "expired"])("rejects terminal %s before trusting a stale URL", async status => {
    const poll = vi.fn();
    await expect(resolveMaxCoreAudioJob({ status, url: "/stale.wav" }, "owner", { poll }))
      .rejects.toMatchObject({ statusCode: 503 });
    expect(poll).not.toHaveBeenCalled();
  });
  it("rejects ownerless and invalid job references before polling", async () => {
    const poll = vi.fn();
    await expect(resolveMaxCoreAudioJob({ job_id: "job" }, undefined, { poll })).rejects.toThrow("authenticated owner");
    await expect(resolveMaxCoreAudioJob({ job_id: "../other-user" }, "owner", { poll })).rejects.toThrow("valid job reference");
    expect(poll).not.toHaveBeenCalled();
  });
  it("stops immediately for denied or missing job access", async () => {
    for (const status of [401, 403, 404]) {
      const poll = vi.fn().mockRejectedValue(new MaxCoreControlError("private upstream detail", status));
      await expect(resolveMaxCoreAudioJob({ job_id: "job" }, "owner", { poll })).rejects.toThrow("access was denied");
      expect(poll).toHaveBeenCalledTimes(1);
    }
  });
  it("recovers transient dependency failures only inside the completion budget", async () => {
    let clock = 1000;
    const poll = vi.fn().mockRejectedValueOnce(new MaxCoreControlError("dependency", 503))
      .mockResolvedValueOnce({ status: "processing" }).mockResolvedValueOnce({ status: "done", audio_url: "/ready.wav" });
    const sleep = vi.fn(async (ms: number) => { clock += ms; });
    const result = await resolveMaxCoreAudioJob({ job_id: "job" }, "owner", {
      poll, sleep, now: () => clock, timeoutMs: 20, intervalMs: 5,
    });
    expect(maxcoreAudioSource(result)).toBe("/ready.wav");
    expect(poll).toHaveBeenCalledTimes(3); expect(sleep).toHaveBeenCalledTimes(2);
  });
  it("stops unfinished jobs at their deadline and rejects artifact-free completion", async () => {
    let clock = 0;
    const poll = vi.fn().mockResolvedValue({ status: "processing" });
    await expect(resolveMaxCoreAudioJob({ job_id: "job" }, "owner", { poll, now: () => clock,
      sleep: async ms => { clock += ms; }, timeoutMs: 10, intervalMs: 5,
    })).rejects.toThrow("deadline");
    expect(poll).toHaveBeenCalledTimes(2);
    await expect(resolveMaxCoreAudioJob({ status: "completed" }, "owner")).rejects.toThrow("no artifact");
  });
});
