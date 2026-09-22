import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const where = vi.fn();
  const query = Object.fromEntries(["projects", "studioProjects", "collaborationProjects", "projectMembers", "studioTracks", "audioClips", "pluginInstances"].map((name) => [name, { findFirst: vi.fn(), findMany: vi.fn() }]));
  return {
    query, where, select: vi.fn(() => ({ from: () => ({ where }) })), transaction: vi.fn(),
    upload: vi.fn(), read: vi.fn(), delete: vi.fn(), transition: vi.fn(), get: vi.fn(), recover: vi.fn(),
    pocket: { read: vi.fn().mockRejectedValue(new Error("File not found")), write: vi.fn().mockResolvedValue(undefined), delete: vi.fn() },
  };
});
vi.mock("../../server/db", () => ({ db: { query: mocks.query, select: mocks.select, transaction: mocks.transaction } }));
vi.mock("../../server/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("../../server/services/hybridStorageService", () => ({ hybridStorageService: { upload: mocks.upload, read: mocks.read, delete: mocks.delete } }));
vi.mock("../../server/services/genericExportRepository", () => ({ exportRepository: { transition: mocks.transition, get: mocks.get, recover: mocks.recover } }));
vi.mock("../../server/middleware/auth", () => ({ requireAuth: (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock("../../server/pocket-dimension/index.js", () => ({ PocketDimensionManager: { getInstance: () => ({ openPocket: async () => mocks.pocket }) } }));
vi.mock("fs", () => ({ mkdirSync: vi.fn(), existsSync: vi.fn(() => false), rmSync: vi.fn() }));

import { getStudioProjectAccess } from "../../server/services/studioProjectAccess";
import { modulationRouting } from "../../server/services/modulationRoutingRepository";
import { runGenericExport, csvCell, clipFilter } from "../../server/services/genericExportRenderer";
import durableRouter from "../../server/routes/durableExports";
import { createHash } from "node:crypto";

beforeEach(() => {
  vi.clearAllMocks();
  for (const query of Object.values(mocks.query)) {
    query.findFirst.mockResolvedValue(undefined);
    query.findMany.mockResolvedValue([]);
  }
});

describe("CG4 authoritative collaboration roles", () => {
  it("allows owner of a real studio project", async () => {
    mocks.query.studioProjects.findFirst.mockResolvedValue({ id: "p", userId: "owner" });
    expect(await getStudioProjectAccess("owner", "p")).toEqual({ read: true, write: true });
  });
  it("allows member edits but only viewer reads; strangers and absent projects are denied", async () => {
    mocks.query.projects.findFirst.mockResolvedValue({ id: "p", userId: "owner" });
    mocks.query.projectMembers.findFirst.mockResolvedValue({ role: "viewer" });
    expect(await getStudioProjectAccess("viewer", "p")).toEqual({ read: true, write: false });
    mocks.query.projectMembers.findFirst.mockResolvedValue({ role: "member" });
    expect((await getStudioProjectAccess("member", "p")).write).toBe(true);
    mocks.query.projectMembers.findFirst.mockResolvedValue(undefined);
    expect((await getStudioProjectAccess("stranger", "p")).read).toBe(false);
    mocks.query.projects.findFirst.mockResolvedValue(undefined);
    expect((await getStudioProjectAccess("owner", "missing")).read).toBe(false);
  });
  it("propagates repository outages rather than granting access", async () => {
    mocks.query.studioProjects.findFirst.mockRejectedValue(new Error("DB unavailable"));
    await expect(getStudioProjectAccess("u", "p")).rejects.toThrow("DB unavailable");
  });
});

describe("CG5 durable project metadata repository", () => {
  it("returns empty first read; saves, reads and removes with unrelated metadata preserved", async () => {
    const row = { id: "p", userId: "u", metadata: { titleColor: "blue" } };
    mocks.transaction.mockImplementation(async (fn) => fn({
      select: () => ({ from: () => ({ where: () => ({ for: async () => [row] }) }) }),
      update: () => ({ set: (patch: any) => ({ where: async () => Object.assign(row, patch) }) }),
    }));
    expect(await modulationRouting("u", "p")).toEqual([]);
    await modulationRouting("u", "p", undefined, { replace: [{ id: "r", amount: 0.5 }] });
    expect(await modulationRouting("u", "p")).toEqual([{ id: "r", amount: 0.5 }]);
    expect(row.metadata.titleColor).toBe("blue");
    await modulationRouting("u", "p", undefined, { remove: "r" });
    expect(await modulationRouting("u", "p")).toEqual([]);
  });
  it("denies absent/unowned projects before writing", async () => {
    mocks.transaction.mockImplementation(async (fn) => fn({ select: () => ({ from: () => ({ where: () => ({ for: async () => [] }) }) }) }));
    await expect(modulationRouting("stranger", "p", undefined, { replace: [] })).rejects.toThrow("Project not found");
  });
});

describe("CG2 real report bytes and commit protocol", () => {
  const job: any = { id: "job", userId: "u", name: "Analytics", type: "data", format: "csv", settings: {} };
  it("CSV quotes delimiters/newlines and neutralizes spreadsheet formulas", () => {
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
    expect(csvCell("=1+1")).toBe("\"'=1+1\"");
  });
  it("builds timeline-aware clip filters, rejecting missing duration", () => {
    expect(clipFilter({ duration: 3, startTime: 2, gain: 0.5, fadeIn: 1, fadeOut: 1 }, 0)).toContain("adelay=2000:all=1");
    expect(() => clipFilter({ duration: null, startTime: 0, gain: 1, fadeIn: 0, fadeOut: 0 }, 0)).toThrow("timing");
  });
  it("renders actual report rows, uploads user-scoped bytes, verifies, then completes", async () => {
    mocks.transition.mockResolvedValueOnce(job).mockResolvedValueOnce({ ...job, status: "complete" });
    mocks.get.mockResolvedValue({ ...job, status: "processing" });
    mocks.where.mockResolvedValue([{ date: new Date("2026-01-01"), streams: 42, revenue: 1.25, totalListeners: 12, followers: 3, platform: "Real source" }]);
    mocks.upload.mockImplementation(async (_user, _name, bytes) => { mocks.read.mockResolvedValue(bytes); return { key: "u/exports/file" }; });
    await runGenericExport("job", "u");
    const [user, , bytes, mime] = mocks.upload.mock.calls[0];
    expect(user).toBe("u"); expect(mime).toContain("text/csv");
    expect(bytes.toString()).toContain('"42","1.25"');
    expect(mocks.transition.mock.calls.at(-1)?.[2]).toMatchObject({ status: "complete", artifact: { key: "u/exports/file", size: bytes.length } });
  });
  it("never completes when PDIM returns corrupted bytes", async () => {
    mocks.transition.mockResolvedValueOnce(job).mockResolvedValue({});
    mocks.get.mockResolvedValue({ status: "processing" }); mocks.where.mockResolvedValue([]);
    mocks.upload.mockResolvedValue({ key: "key" }); mocks.read.mockResolvedValue(Buffer.from("corrupted"));
    await runGenericExport("job", "u");
    expect(mocks.transition.mock.calls.at(-1)?.[2]).toMatchObject({ status: "failed", error: "Stored artifact verification failed" });
  });
  it("does not upload an artifact after durable cancellation", async () => {
    mocks.transition.mockResolvedValueOnce(job); mocks.get.mockResolvedValue({ status: "cancelled" }); mocks.where.mockResolvedValue([]);
    await runGenericExport("job", "u");
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("renders real WAV bytes from an authorized PDIM clip using local FFmpeg", async () => {
    const audioJob = { ...job, type: "audio", projectId: "p", format: "wav", settings: { format: "wav", sampleRate: 8000, bitDepth: 16, normalize: false } };
    const samples = 800;
    const source = Buffer.alloc(44 + samples * 2);
    source.write("RIFF", 0); source.writeUInt32LE(source.length - 8, 4); source.write("WAVEfmt ", 8);
    source.writeUInt32LE(16, 16); source.writeUInt16LE(1, 20); source.writeUInt16LE(1, 22);
    source.writeUInt32LE(8000, 24); source.writeUInt32LE(16000, 28); source.writeUInt16LE(2, 32); source.writeUInt16LE(16, 34);
    source.write("data", 36); source.writeUInt32LE(samples * 2, 40);
    for (let i = 0; i < samples; i++) source.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / 8000) * 10000), 44 + i * 2);
    mocks.query.projects.findFirst.mockResolvedValue({ id: "p", userId: "u" });
    mocks.query.studioTracks.findMany.mockResolvedValue([{ id: "t", name: "Tone", trackType: "audio", volume: 1, pan: 0 }]);
    mocks.query.audioClips.findMany.mockResolvedValue([{ id: "c", trackId: "t", audioUrl: "u/source.wav", duration: 0.1, startTime: 0.1, gain: 1 }]);
    mocks.transition.mockResolvedValueOnce(audioJob).mockResolvedValue({ status: "complete" });
    mocks.get.mockResolvedValue({ status: "processing" });
    mocks.read.mockResolvedValue(source);
    mocks.upload.mockImplementation(async (user, filename, bytes) => { mocks.read.mockResolvedValue(bytes); return { key: `${user}/${filename}` }; });
    await runGenericExport("job", "u");
    expect(mocks.upload).toHaveBeenCalledOnce();
    const bytes = mocks.upload.mock.calls[0][2] as Buffer;
    expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString()).toBe("WAVE");
    expect(bytes.length).toBeGreaterThan(source.length);
    expect(mocks.transition.mock.calls.at(-1)?.[2].status).toBe("complete");
  });
  it("wired download handler serves verified bytes and denies missing owner-scoped rows", async () => {
    const route = (durableRouter as any).stack.find((layer: any) => Array.isArray(layer.route?.path) && layer.route.path.includes("/download/:jobId"));
    const handler = route.route.stack.at(-1).handle;
    const bytes = Buffer.from('{"streams":42}');
    mocks.get.mockResolvedValue({ status: "complete", artifact: { key: "u/key", size: bytes.length, checksum: createHash("sha256").update(bytes).digest("hex"), filename: "Analytics.json", mime: "application/json" } });
    mocks.read.mockResolvedValue(bytes);
    const res: any = { status: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(), send: vi.fn(), json: vi.fn() };
    await handler({ params: { jobId: "job" }, user: { id: "u" } }, res);
    expect(mocks.get).toHaveBeenCalledWith("job", "u");
    expect(res.send).toHaveBeenCalledWith(bytes);
    expect(res.set.mock.calls[0][0]["Content-Disposition"]).toContain("attachment");
    mocks.get.mockResolvedValue(undefined); res.send.mockClear();
    await handler({ params: { jobId: "job" }, user: { id: "stranger" } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.send).not.toHaveBeenCalled();
  });
});

describe("CG3 actor-aware offline server boundaries", () => {
  it("rejects another owner's known project for every targeted read/mutation", async () => {
    vi.useFakeTimers();
    const { offlineModeService: service } = await import("../../server/services/offlineModeService");
    for (const method of ["getCachedProject", "isProjectCached", "uncacheProject", "syncProject", "recordLocalChange", "recordServerChange"] as const) {
      await expect(service[method]("known-project", "stranger")).rejects.toThrow("Project not found");
    }
    await expect(service.cacheProject("known-project", "stranger")).rejects.toThrow("Project not found");
    expect(mocks.pocket.write).not.toHaveBeenCalled();
    vi.clearAllTimers(); vi.useRealTimers();
  });
  it("filters cache list/stats/queue by both actor and current database ownership", async () => {
    const { offlineModeService: service } = await import("../../server/services/offlineModeService");
    const entry = (projectId: string, userId: string) => ({ projectId, userId, size: 10, cachedAt: new Date(), audioFiles: [] });
    (service as any).cachedProjects = new Map([["a", entry("a", "u")], ["b", entry("b", "other")], ["revoked", entry("revoked", "u")]]);
    (service as any).syncQueue = ["a", "b", "revoked"];
    mocks.where.mockResolvedValue([{ id: "a" }]);
    expect((await service.getCachedProjects("u")).map((p) => p.projectId)).toEqual(["a"]);
    expect(await service.getSyncQueue("u")).toEqual(["a"]);
    expect((await service.getCacheStats("u")).totalProjects).toBe(1);
    await service.updateSettings({ maxCacheSize: 100 }, "u");
    expect(service.getSettings("other").maxCacheSize).not.toBe(100);
    const [key, bytes] = mocks.pocket.write.mock.calls.at(-1)!;
    expect(key).toBe("index/users/u.json");
    expect(JSON.parse(bytes.toString()).projects.b).toBeUndefined();
  });
});
afterAll(() => { vi.useRealTimers(); });