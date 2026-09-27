import { describe, expect, it, vi } from "vitest";
import express from "express";
import { request } from "node:http";
import type { Server } from "node:http";
import { maxcoreOwnerContext, trustedMaxcoreOwner, bindMaxcoreOwner } from "../../lib/maxcoreOwnerContext.js";
import { modelAuthHeaders, modelOwnedBody } from "../../../external/maxcore/artifacts/api-server/src/config/model-auth.js";

vi.mock("../../config/index.js", () => ({ config: {
  maxcoreUrl: "http://private-maxcore", maxcoreGenerationKey: "private-channel",
} }));
vi.mock("../../logger.js", () => ({ logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import { MaxCoreAIClient } from "../maxcoreClient.js";

describe("public Node session -> private MaxCore ownership", () => {
  it("does not accept a background-owner argument while inside an unauthenticated public request", () => {
    maxcoreOwnerContext({ headers: { "x-maxcore-user-id": "victim" }, body: { userId: "victim" } } as any, {} as any, () => {
      expect(trustedMaxcoreOwner("victim")).toBeUndefined();
      expect(bindMaxcoreOwner({ owner_id: "victim", userId: "victim", text: "music" }, trustedMaxcoreOwner("victim")))
        .toEqual({ text: "music" });
    });
  });
  it("binds actual authenticated request owner, not public body/header or service argument", async () => {
    const sent: any[] = [];
    const transport = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      sent.push(init);
      return new Response(JSON.stringify({ job_id: "job-1" }), { headers: { "content-type": "application/json" } });
    });
    let server: Server | undefined;
    try {
      const app = express();
      app.use(express.json(), maxcoreOwnerContext);
      // Isolated auth fixture: public callers cannot choose this identity.
      app.post("/generate", (req, _res, next) => { req.user = { id: "session-owner" } as any; next(); }, async (req, res) => {
        const result = await MaxCoreAIClient.generate("/generate/audio", req.body, "spoofed-service-owner");
        res.json(result);
      });
      server = app.listen(0, "127.0.0.1");
      await new Promise<void>(resolve => server!.once("listening", resolve));
      const address = server.address() as { port: number };
      await new Promise<void>((resolve, reject) => {
        const req = request(`http://127.0.0.1:${address.port}/generate`, {
          method: "POST", headers: { "Content-Type": "application/json", "X-MaxCore-User-Id": "victim" },
        }, res => {
          res.resume();
          res.on("end", () => res.statusCode === 200 ? resolve() : reject(new Error(`HTTP ${res.statusCode}`)));
        });
        req.on("error", reject);
        req.end(JSON.stringify({ userId: "victim", owner_id: "victim", text: "music", trusted_owner: "victim" }));
      });
      const forwarded = sent.find(entry => entry.method === "POST");
      expect(forwarded.headers["X-MaxCore-User-Id"]).toBe("session-owner");
      const pythonHeaders = modelAuthHeaders({
        authorization: forwarded.headers.Authorization,
        "x-maxcore-user-id": forwarded.headers["X-MaxCore-User-Id"],
      }, "127.0.0.1", "private-channel")!;
      expect(pythonHeaders["X-MaxCore-User-Id"]).toBe("session-owner");
      expect(modelOwnedBody(JSON.parse(forwarded.body), pythonHeaders))
        .toEqual({ text: "music", userId: "session-owner", user_id: "session-owner", owner_id: "session-owner" });
    } finally {
      transport.mockRestore();
      if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    }
  });
});