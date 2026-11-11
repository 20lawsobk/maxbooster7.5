/**
 * PDIM command argument contract — exercised against the PRODUCTION
 * PdimRedisClient with its HTTP transport mocked. These tests fail if the
 * client's exec()/scriptExec() validation or wire format regresses.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdimRedisClient } from "../../server/lib/pdimClient.js";

const EXEC_URL = "https://pdim.test/api/redis/exec";
const TOKEN = "test-bearer-token";

type FetchCall = { url: string; init: RequestInit };

describe("PDIM command argument contract (PdimRedisClient)", () => {
  let calls: FetchCall[];
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    calls = [];
    fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ result: "OK" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends commands as {cmd, args:string[]} with Bearer auth", async () => {
    const client = new PdimRedisClient(EXEC_URL, TOKEN);
    const result = await client.sendCommand(["GET", "some-key"]);

    expect(result).toBe("OK");
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe(EXEC_URL);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toEqual({ cmd: "GET", args: ["some-key"] });
  });

  it("retries a transport reset once for idempotent HSET only", async () => {
    fetchMock
      .mockRejectedValueOnce(Object.assign(new Error("fetch failed"), {
        cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }),
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: 1 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    const client = new PdimRedisClient(EXEC_URL, TOKEN);

    await expect(client.sendCommand(["HSET", "session:1", "status", "active"]))
      .resolves.toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const sentBodies = fetchMock.mock.calls.map((call) =>
      JSON.parse(String((call[1] as RequestInit).body)),
    );
    expect(sentBodies[0]).toEqual(sentBodies[1]);
  });

  it("retries a transport reset once for read-only GET", async () => {
    fetchMock
      .mockRejectedValueOnce(Object.assign(new Error("fetch failed"), {
        cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }),
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: "value" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    const client = new PdimRedisClient(EXEC_URL, TOKEN);

    await expect(client.sendCommand(["GET", "state:key"])).resolves.toBe("value");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not replay non-idempotent commands after an uncertain transport failure", async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error("fetch failed"), {
      cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }),
    }));
    const client = new PdimRedisClient(EXEC_URL, TOKEN);

    await expect(client.sendCommand(["INCR", "counter"])).rejects.toThrow("fetch failed");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("coerces numeric arguments to strings on the wire", async () => {
    const client = new PdimRedisClient(EXEC_URL, TOKEN);
    await client.sendCommand(["INCRBY", "counter", 2 as unknown as string]);

    const body = JSON.parse(String(calls[calls.length - 1].init.body));
    expect(body.args).toEqual(["counter", "2"]);
  });

  it.each([
    [["SET", "artist:1", 7 as unknown as string], ["artist:1", "7"]],
    [["ZADD", "leaderboard", 42 as unknown as string, "artist:2"], ["leaderboard", "42", "artist:2"]],
  ])("coerces parameter set %j to wire args %j", async (command, expectedArgs) => {
    const client = new PdimRedisClient(EXEC_URL, TOKEN);
    await client.sendCommand(command as [string, ...string[]]);

    const body = JSON.parse(String(calls[calls.length - 1].init.body));
    expect(body.args).toEqual(expectedArgs);
  });

  it("rejects nullish arguments on the main exec path before any HTTP request", async () => {
    const client = new PdimRedisClient(EXEC_URL, TOKEN);
    await expect(
      client.sendCommand(["HSET", "artist:1", "genre", null as unknown as string]),
    ).rejects.toThrow(/nullish command argument/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects nullish arguments on the script (Lua/BullMQ) path before any HTTP request", async () => {
    const client = new PdimRedisClient(EXEC_URL, TOKEN);
    await expect(
      client.scriptExec(["SET", "k", undefined as unknown as string]),
    ).rejects.toThrow(/nullish command argument/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [["HSET", "artist:1", "genre", null as unknown as string], "sendCommand"],
    [["SET", "k", undefined as unknown as string], "scriptExec"],
  ])("rejects nullish parameter set %j on %s", async (command, method) => {
    const client = new PdimRedisClient(EXEC_URL, TOKEN);
    const call =
      method === "sendCommand"
        ? client.sendCommand(command as [string, ...string[]])
        : client.scriptExec(command as [string, ...string[]]);

    await expect(call).rejects.toThrow(/nullish command argument/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces HTTP command errors instead of converting them to null", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "ERR unknown command 'NOPE'" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new PdimRedisClient(EXEC_URL, TOKEN);

    await expect(client.sendCommand(["NOPE"])).rejects.toThrow(
      /ERR unknown command/,
    );
  });

  it("surfaces protocol error envelopes instead of converting them to null", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "ERR unknown command 'NOPE'" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new PdimRedisClient(EXEC_URL, TOKEN);

    await expect(client.sendCommand(["NOPE"])).rejects.toThrow(
      /ERR unknown command/,
    );
  });
});
