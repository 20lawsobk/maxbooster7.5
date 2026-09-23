import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  raw: null as string | null,
  readFailure: null as Error | null,
  pocketFailure: null as Error | null,
  writes: [] as Array<[string, string]>,
}));

vi.mock("../../server/lib/pdimClient.js", () => ({
  getPdimClient: () => ({
    get: async () => {
      if (state.readFailure) throw state.readFailure;
      return state.raw;
    },
    set: async (key: string, value: string) => {
      state.writes.push([key, value]);
      return "OK";
    },
  }),
}));

vi.mock("../../server/pocket-dimension/index.js", () => ({
  pocketManager: {
    openPocket: async () => {
      if (state.pocketFailure) throw state.pocketFailure;
      return {
        write: vi.fn(),
        read: vi.fn(),
        delete: vi.fn(),
      };
    },
  },
}));

vi.mock("../../server/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@replit/object-storage", () => ({ Client: class {} }));

async function freshService() {
  vi.resetModules();
  const module = await import("../../server/services/hybridStorageService.ts");
  return module.hybridStorageService;
}

beforeEach(() => {
  state.raw = null;
  state.readFailure = null;
  state.pocketFailure = null;
  state.writes.length = 0;
});

describe("HybridStorageService ownership-index recovery", () => {
  it("accepts an authoritative absent index as a new empty store", async () => {
    const service = await freshService();
    await expect(service.initialize()).resolves.toBeUndefined();
    expect(service.listFiles("new-owner")).toEqual([]);
    expect(state.writes).toEqual([]);
  });

  it.each([
    ["malformed JSON", "{"],
    ["missing maps", "{}"],
    [
      "invalid ownership entry",
      JSON.stringify({
        files: { "owner/file": { key: "owner/file", userId: 7 } },
        contentHashes: {},
        publicHashes: {},
      }),
    ],
    [
      "dangling content hash",
      JSON.stringify({
        files: {},
        contentHashes: { abc: ["missing/file"] },
        publicHashes: {},
      }),
    ],
  ])("rejects %s without overwriting stored bytes", async (_name, fixture) => {
    state.raw = fixture;
    const original = state.raw;
    const service = await freshService();
    await expect(service.initialize()).rejects.toThrow(/ownership index/);
    expect(state.raw).toBe(original);
    expect(state.writes).toEqual([]);
  });

  it("does not latch a failed initialization and succeeds after an authoritative retry", async () => {
    state.readFailure = new Error("synthetic PDIM outage");
    const service = await freshService();
    await expect(service.initialize()).rejects.toThrow(/ownership index/);
    expect(state.writes).toEqual([]);

    state.readFailure = null;
    state.raw = null;
    await expect(service.initialize()).resolves.toBeUndefined();
    expect(service.listFiles("new-owner")).toEqual([]);
    expect(state.writes).toEqual([]);
  });

  it("does not suppress PocketDimension open failures or latch the failed attempt", async () => {
    state.pocketFailure = new Error("synthetic corrupt pocket metadata");
    const service = await freshService();
    await expect(service.initialize()).rejects.toThrow(/Pocket Dimension is unavailable or corrupt/);
    expect(state.writes).toEqual([]);

    state.pocketFailure = null;
    await expect(service.initialize()).resolves.toBeUndefined();
    expect(state.writes).toEqual([]);
  });
});