import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { validateGeneratedArtifact } from "../../server/services/generatedArtifactValidation.js";
import { isAllowedMaxcoreMediaPath } from "../../server/services/maxcoreConnector.js";
import { beatAudioObservation } from "../../server/services/beatAudioContext.js";

function fixture(owner: string | null = "actual-admin", status = "done", foreign = false, corrupt = false) {
  // Execute the actual private generation/owner methods without importing the
  // unrelated scheduler, payment or promotion services.
  const source = readFileSync("server/services/beatMoneyLoopService.ts", "utf8");
  const tree = ts.createSourceFile("beat.ts", source, ts.ScriptTarget.Latest, true);
  const service = tree.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === "BeatMoneyLoopService") as ts.ClassDeclaration;
  const methods = service.members.filter(node => ts.isMethodDeclaration(node) &&
    ["_maxcoreAudio", "_requireAdminId"].includes(node.name.getText(tree))).map(node => node.getText(tree)).join("\n");
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const wav = Buffer.alloc(corrupt ? 2048 : 160044);
  wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
  if (!corrupt) {
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
    wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write("data", 36); wav.writeUInt32LE(160000, 40);
  }
  const downloadFile = vi.fn().mockResolvedValue(wav);
  const awareness = vi.fn(async (_endpoint, body) => ({ ...body, awareness: {
    snapshot_id: "actual-live", awareness: "Public live observations", expires_at: Date.now() / 1000 + 60,
  } }));
  const sandbox: Record<string, unknown> = {
    owner, process: { env: { BEAT_DURATION_SECONDS: "10" } }, Buffer, URL, AbortSignal,
    setTimeout: (callback: () => void) => { queueMicrotask(callback); return 1; },
    getMaxcoreOriginOrDefault: () => "http://maxcore.fixture",
    getMaxcoreGenerationKey: () => "private-fixture-channel",
    validateGeneratedArtifact, isAllowedMaxcoreMediaPath, prepareGenerationAwareness: awareness, storageService: { downloadFile }, beatAudioObservation,
    logger: { info: vi.fn(), warn: vi.fn() },
    fetch: async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/api/generate/audio")) return Response.json({ job_id: "job-1", status: "processing" });
      return Response.json({ status,
        url: `/api/storage/file/users%2F${foreign ? "victim" : "actual-admin"}%2Fgenerated-audio%2Fbeat.wav` });
    },
  };
  const compiled = ts.transpileModule(`class Probe { async resolveAdminId(){ return owner; } ${methods} }
    globalThis.probe = new Probe();`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compiled, sandbox);
  return { probe: sandbox.probe as { _maxcoreAudio: (scan: unknown, mode: string) => Promise<unknown> }, calls, downloadFile, awareness, wav };
}
describe("Beat Money Loop private audio identity", () => {
  const scan = { hooks: [], productionStyles: [], genre: "house", tempo: 128 };
  it("binds the existing admin to generation, polling and durable download without starting a cycle", async () => {
    const f = fixture();
    const result = await f.probe._maxcoreAudio(scan, "C");
    expect(result).toMatchObject({ wavBytes: f.wav });
    expect(f.awareness).toHaveBeenCalledTimes(1);
    expect(f.awareness).toHaveBeenCalledWith("/api/generate/audio", expect.objectContaining({ bpm: 128 }));
    expect(f.calls.map(c => c.url)).toEqual(["http://maxcore.fixture/api/generate/audio", "http://maxcore.fixture/api/audio-job/job-1"]);
    for (const call of f.calls) expect(call.init.headers).toMatchObject({
      Authorization: "Bearer private-fixture-channel", "X-MaxCore-User-Id": "actual-admin",
    });
    expect(JSON.parse(String(f.calls[0].init.body))).toMatchObject({
      user_id: "actual-admin", owner_id: "actual-admin", awareness: { snapshot_id: "actual-live" },
    });
    const request = JSON.parse(String(f.calls[0].init.body));
    expect(request).toMatchObject({ instrument: "ensemble", format: "wav" });
    expect(request.dedicated_controls).toEqual({
      duration_sec: 10, instrument: "ensemble", arrangement: "structured",
      sample_rate: 44100, genre: "house", bpm: 128,
    });
    expect(request.context).toMatchObject({
      synthesis_scope: "parametric_instrumental", semantic_style_applied: false,
    });
    expect(request).not.toHaveProperty("mode");
    expect(f.downloadFile).toHaveBeenCalledWith("users/actual-admin/generated-audio/beat.wav");
  });
  it("does not dispatch or invent an owner when the configured admin does not exist", async () => {
    const f = fixture(null);
    await expect(f.probe._maxcoreAudio(scan, "C")).rejects.toThrow("admin user not found");
    expect(f.calls).toHaveLength(0); expect(f.awareness).not.toHaveBeenCalled();
  });
  it("stops cancelled jobs and refuses another user's durable object", async () => {
    const cancelled = fixture("actual-admin", "cancelled");
    await expect(cancelled.probe._maxcoreAudio(scan, "C")).rejects.toThrow("audio job failed");
    expect(cancelled.calls).toHaveLength(2);
    const foreign = fixture("actual-admin", "done", true);
    await expect(foreign.probe._maxcoreAudio(scan, "C")).rejects.toThrow("different user");
    expect(foreign.downloadFile).not.toHaveBeenCalled();
  });
  it("rejects a WAV-shaped corrupt payload before publication", async () => {
    const f = fixture("actual-admin", "done", false, true);
    await expect(f.probe._maxcoreAudio(scan, "C")).rejects.toThrow();
  });
  it.each(["timed_out", "timeout", "expired"])("stops terminal %s jobs immediately", async status => {
    const f = fixture("actual-admin", status);
    await expect(f.probe._maxcoreAudio(scan, "C")).rejects.toThrow("audio job failed");
    expect(f.calls).toHaveLength(2);
    expect(f.downloadFile).not.toHaveBeenCalled();
  });
});
