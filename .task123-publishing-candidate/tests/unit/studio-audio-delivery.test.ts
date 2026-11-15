import { afterEach, describe, expect, it, vi } from "vitest";
import {
  pollStudioAudioJob,
  resolveStudioGenerationResponse,
} from "../../client/src/components/studio/studioAudioDelivery";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Studio asynchronous audio delivery", () => {
  it("resolves a completed MaxCore job into a playable result and reports missing MIDI honestly", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url === "/api/audio-job/test-job-123") {
          return new Response(
            JSON.stringify({
              status: "completed",
              audio_url: "/api/storage/beats/generated.wav",
              duration: 16,
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response("MIDI is not available", { status: 404 });
      }),
    );

    const result = await resolveStudioGenerationResponse({
      jobId: "test-job-123",
    });

    expect(result).toMatchObject({
      jobId: "test-job-123",
      audioFilePath: "/api/storage/beats/generated.wav",
      duration: 16,
    });
    expect(result.midiError).toContain("Generated MIDI download failed (404)");
    expect(calls).toEqual([
      "/api/audio-job/test-job-123",
      "/api/audio/test-job-123/midi",
    ]);
  });

  it("continues polling queued jobs until MaxCore reports completion", async () => {
    let attempt = 0;
    const fetchImpl = vi.fn(async () => {
      attempt += 1;
      const status = attempt === 1 ? "processing" : "completed";
      return new Response(
        JSON.stringify({
          status,
          ...(status === "completed"
            ? { audio_url: "/api/storage/beats/ready.wav" }
            : {}),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const sleep = vi.fn(async () => undefined);

    const result = await pollStudioAudioJob("test-job-456", {
      fetchImpl,
      intervalMs: 1,
      sleep,
      maxAttempts: 3,
    });

    expect(result.audioUrl).toBe("/api/storage/beats/ready.wav");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });
});
