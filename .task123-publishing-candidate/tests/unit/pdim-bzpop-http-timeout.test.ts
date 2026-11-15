import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { PdimRedisClient } from "../../server/lib/pdimClient.js";

describe("PDIM blocking HTTP commands", () => {
  let server: ReturnType<typeof createServer> | undefined;
  let client: PdimRedisClient | undefined;

  afterEach(async () => {
    await client?.disconnect();
    client = undefined;
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server!.close(error => error ? reject(error) : resolve());
      });
      server = undefined;
    }
  });

  it("renews bounded HTTP waits while preserving indefinite BZPOPMIN semantics", async () => {
    const requests: Array<{ cmd: string; args: string[] }> = [];
    server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", chunk => chunks.push(Buffer.from(chunk)));
      request.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        requests.push(body);
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(
          requests.length === 1 ? null : ["queue:test", "ready-job", "1"],
        ));
      });
    });
    await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test HTTP server did not bind");

    client = new PdimRedisClient(
      `http://127.0.0.1:${address.port}/api/redis/instances/local/exec`,
      "test-channel-token",
    );
    await expect(client.bzpopmin("queue:test", 0)).resolves.toEqual([
      "queue:test", "ready-job", "1",
    ]);
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.cmd).toBe("BZPOPMIN");
      expect(request.args).toEqual(["queue:test", "240"]);
    }
  }, 3_000);
});
