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

  it("coerces numeric arguments to strings on the wire", async () => {
    const client = new PdimRedisClient(EXEC_URL, TOKEN);
    await client.sendCommand(["INCRBY", "counter", 2 as unknown as string]);

    const body = JSON.parse(String(calls[calls.length - 1].init.body));
    expect(body.args).toEqual(["counter", "2"]);
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
});
