import { afterEach, describe, expect, it } from "vitest";
import {
  createServer,
  type RequestListener,
  type Server,
} from "node:http";
import type { AddressInfo } from "node:net";
import { pollVideoJobUntilDone } from "../../client/src/lib/videoJobPolling";

let server: Server | undefined;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server!.close((error) => (error ? reject(error) : resolve()));
    });
    server = undefined;
  }
});

async function listen(handler: RequestListener) {
  server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

describe("video job polling", () => {
  it.each(["canceled", "timed_out", "timeout"])("stops immediately on %s", async status => {
    let calls = 0;
    await expect(pollVideoJobUntilDone("job", { sleep: async () => {},
      fetchStatus: async () => { calls++; return Response.json({ status }); },
    })).rejects.toMatchObject({ status });
    expect(calls).toBe(1);
  });
  it.each([undefined, "asset://video-plan", ["java", "script:alert(1)"].join("")])("rejects completed non-file output %s", async url => {
    let calls = 0;
    await expect(pollVideoJobUntilDone("job", { sleep: async () => {},
      fetchStatus: async () => { calls++; return Response.json({ status: "completed", url }); },
    })).rejects.toThrow(/playable file/);
    expect(calls).toBe(1);
  });
  it("returns a playable file from a completed job", async () => {
    await expect(pollVideoJobUntilDone("job", { sleep: async () => {},
      fetchStatus: async () => Response.json({ status: "completed", video_url: "/api/storage/file/users/owner/video.mp4" }),
    })).resolves.toMatchObject({ success: true, url: "/api/storage/file/users/owner/video.mp4" });
  });
  it("stops after one non-2xx response reports a terminal job error", async () => {
    let requestCount = 0;
    const origin = await listen((_request, response) => {
      requestCount++;
      response.writeHead(500, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          status: "error",
          error: "MaxCore video render failed",
        }),
      );
    });

    await expect(
      pollVideoJobUntilDone("job-under-test", {
        fetchStatus: (jobId) => fetch(`${origin}/jobs/${jobId}`),
        sleep: async () => {},
        maxAttempts: 3,
      }),
    ).rejects.toMatchObject({
      name: "TerminalJobError",
      status: "error",
      message: "MaxCore video render failed",
    });

    expect(requestCount).toBe(1);
  });
});
