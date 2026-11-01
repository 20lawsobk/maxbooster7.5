import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useStudioStore } from "../../client/src/stores/studioStore";
import { normalizeGeneratedMidiNotes } from "../../client/src/components/studio/studioAudioDelivery";
import { withMediaJobDeadline } from "../../client/src/lib/mediaJobTransport";
import { cancelStudioGenerationScope, createStudioGenerationLease } from "../../client/src/components/studio/useStudioGenerationScope";

// Execute each component's actual callback body, not a reimplemented lookalike.
// UI rendering and real React commit/unmount remain separate browser gates.
const originalState = useStudioStore.getState();
const originalProject = originalState.project;
const modules = ["AIMusicGenerator", "UltimateDAW", "StudioOneDAW"] as const;
const callbackName = (module: string) => module === "AIMusicGenerator" ? "handleGenerate" : "generateStudioTextTrack";
function extract(module: string, name = callbackName(module)) {
  const file = path.resolve(`client/src/components/studio/${module}.tsx`);
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let body: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name && node.initializer && ts.isCallExpression(node.initializer)) {
      body = node.initializer.arguments[0];
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!body) throw new Error(`Missing actual ${module} generation callback`);
  return ts.transpileModule(`globalThis.callback = ${body.getText(source)}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const generated = () => ({ audioFilePath: "/api/storage/file/owned.wav", duration: 4,
  generatedNotes: [{ pitch: 60, startTime: 0, duration: 1, velocity: 90 }] });
function fixture(module: string, result: Promise<unknown> = Promise.resolve(generated())) {
  const controllers = new Set<AbortController>();
  useStudioStore.setState({ project: { ...originalProject, id: "owned-project-a" } });
  let current = true;
  const submitted = { jobId: "owned-audio-job" };
  const apiRequest = vi.fn(async (_method: string, _url: string, _data: unknown,
    _options?: { signal?: AbortSignal; maxRetries?: number }) => Response.json(submitted));
  const resolver = vi.fn(async (_submitted: Record<string, unknown>, _options?: { signal?: AbortSignal }) => result);
  const insert = vi.fn(() => ({ audioAdded: true, midiAdded: true }));
  const toast = vi.fn(); const busy = vi.fn();
  const context = { console, DOMException, AbortController, Promise,
    beginGeneration: () => createStudioGenerationLease(controllers, () => current && useStudioStore.getState().project.id === "owned-project-a"),
    withMediaJobDeadline, apiRequest, resolveStudioGenerationResponse: resolver,
    projectId: "owned-project-a", transport: { tempo: 120 }, musicalKey: "C", musicalScale: "minor",
    scale: "Minor", key: "C", prompt: "Owned exact instruction", selectedGenre: "hip_hop",
    selectedInstrumentCategory: "synths", selectedInstrument: "synth_lead", bars: 8, tempo: 120,
    complexity: 0.5, INSTRUMENTS: { synths: [{ id: "synth_lead", category: "melodic", name: "Synth" }] },
    toast, setIsGenerating: busy, setGeneratedTrack: insert, addGeneratedStudioResult: insert,
    callback: undefined as unknown as (options: unknown) => Promise<void>,
  };
  vm.runInNewContext(extract(module), context, { filename: `${module}-actual-callback.js` });
  const run = () => context.callback({ label: "Owned generation", text: "Owned exact instruction",
    instrumentType: "synth_lead", instrumentCategory: "melodic" });
  return { controllers, apiRequest, resolver, insert, toast, busy, submitted, run,
    changeProject: () => { current = false; },
    switchAuthoritativeStore: () => useStudioStore.setState({ project: { ...originalProject, id: "owned-project-b" } }) };
}
afterEach(() => { vi.useRealTimers(); useStudioStore.setState(originalState, true); });

describe.each(modules)("%s generation scope callback", module => {
  it("binds an owned request and consumes the delivered audio and MIDI once", async () => {
    const f = fixture(module); await f.run();
    expect(f.apiRequest).toHaveBeenCalledOnce();
    expect(f.apiRequest.mock.calls[0]).toEqual(["POST", "/api/studio/generation/text",
      expect.objectContaining({ projectId: "owned-project-a", bars: 8 }),
      expect.objectContaining({ signal: expect.any(AbortSignal), maxRetries: 0 })]);
    expect(f.resolver).toHaveBeenCalledWith(f.submitted, { signal: expect.any(AbortSignal) });
    expect(f.insert).toHaveBeenCalledOnce();
    expect(f.insert).toHaveBeenCalledWith(expect.objectContaining({ audioFilePath: "/api/storage/file/owned.wav" }));
    expect(f.toast).toHaveBeenCalledOnce(); expect(f.controllers.size).toBe(0);
  });
  it("does not insert a late previous-project result before passive cleanup", async () => {
    const delivery = deferred<unknown>(); const f = fixture(module, delivery.promise);
    const run = f.run();
    await vi.waitFor(() => expect(f.resolver).toHaveBeenCalledOnce());
    f.changeProject(); delivery.resolve(generated()); await run;
    expect(f.insert).not.toHaveBeenCalled(); expect(f.toast).not.toHaveBeenCalled();
    expect(f.busy.mock.calls.filter(call => call[0] === false)).toHaveLength(0);
    expect(f.controllers.size).toBe(0);
  });
  it("rejects an actual application store switch before any React layout commit", async () => {
    const delivery = deferred<unknown>(); const f = fixture(module, delivery.promise);
    const run = f.run();
    await vi.waitFor(() => expect(f.resolver).toHaveBeenCalledOnce());
    f.switchAuthoritativeStore(); delivery.resolve(generated()); await run;
    expect(useStudioStore.getState().project.id).toBe("owned-project-b");
    expect(f.insert).not.toHaveBeenCalled(); expect(f.toast).not.toHaveBeenCalled();
    expect(f.busy.mock.calls.filter(call => call[0] === false)).toHaveLength(0);
    expect(f.controllers.size).toBe(0);
  });
  it("suppresses stale failure and final-state writes after the project changes", async () => {
    const delivery = deferred<unknown>(); const f = fixture(module, delivery.promise);
    const run = f.run();
    await vi.waitFor(() => expect(f.resolver).toHaveBeenCalledOnce());
    f.changeProject(); delivery.reject(new Error("Previous project transport failed")); await run;
    expect(f.insert).not.toHaveBeenCalled(); expect(f.toast).not.toHaveBeenCalled();
    expect(f.busy.mock.calls.filter(call => call[0] === false)).toHaveLength(0);
    expect(f.controllers.size).toBe(0);
  });
  it("cancels a native submission body on unmount without publishing state", async () => {
    vi.useFakeTimers();
    const f = fixture(module);
    let body: ReadableStreamDefaultController<Uint8Array> | undefined;
    let requestSignal: AbortSignal | undefined;
    f.apiRequest.mockImplementation(async (_method, _url, _data, options) => {
      requestSignal = options?.signal;
      return new Response(new ReadableStream<Uint8Array>({ start(control) { body = control; } }));
    });
    const run = f.run(); await vi.advanceTimersByTimeAsync(0);
    cancelStudioGenerationScope(f.controllers); await run;
    expect(requestSignal?.aborted).toBe(true); expect(f.resolver).not.toHaveBeenCalled();
    expect(f.insert).not.toHaveBeenCalled(); expect(f.toast).not.toHaveBeenCalled();
    expect(f.busy.mock.calls.filter(call => call[0] === false)).toHaveLength(0);
    body?.error(new Error("Owned stalled stream cleanup")); expect(vi.getTimerCount()).toBe(0);
  });
  it("bounds a stalled submission body and restores the current UI on failure", async () => {
    vi.useFakeTimers();
    const f = fixture(module);
    let body: ReadableStreamDefaultController<Uint8Array> | undefined;
    f.apiRequest.mockImplementation(async () => new Response(new ReadableStream<Uint8Array>({ start(control) { body = control; } })));
    const run = f.run(); await vi.advanceTimersByTimeAsync(45_000); await run;
    expect(f.resolver).not.toHaveBeenCalled(); expect(f.insert).not.toHaveBeenCalled();
    expect(f.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Generation Failed",
      description: "Audio generation submission timed out" }));
    if (module === "AIMusicGenerator") expect(f.busy).toHaveBeenLastCalledWith(false);
    expect(f.controllers.size).toBe(0);
    body?.error(new Error("Owned stalled stream cleanup")); expect(vi.getTimerCount()).toBe(0);
  });
});


describe.each(["UltimateDAW", "StudioOneDAW"])("%s actual generated-track insertion", module => {
  function insertion() {
    const context = { console, DOMException, crypto: globalThis.crypto,
      projectId: "owned-project-a", useStudioStore, normalizeGeneratedMidiNotes,
      store: useStudioStore.getState(),
      callback: undefined as unknown as (input: unknown) => { audioAdded: boolean; midiAdded: boolean },
    };
    vm.runInNewContext(extract(module, "addGeneratedStudioResult"), context);
    return context.callback;
  }
  it("checks actual store authority before any track mutation after a synchronous switch", () => {
    useStudioStore.setState({ project: { ...originalProject, id: "owned-project-a" } });
    const insert = insertion();
    useStudioStore.setState({ project: { ...originalProject, id: "owned-project-b" } });
    const before = useStudioStore.getState();
    expect(() => insert({ name: "Old result", ...generated() })).toThrow("originating project");
    expect(useStudioStore.getState()).toBe(before);
  });
  it("retains actual audio and MIDI insertion into the matching owned project", () => {
    useStudioStore.setState({ project: { ...originalProject, id: "owned-project-a" } });
    const beforeTracks = useStudioStore.getState().tracks.length;
    const inserted = insertion()({ name: "Owned result", ...generated() });
    expect(inserted).toEqual({ audioAdded: true, midiAdded: true });
    const tracks = useStudioStore.getState().tracks.slice(beforeTracks);
    expect(tracks).toHaveLength(2);
    expect(tracks[0].audioClips[0].sourceUrl).toBe("/api/storage/file/owned.wav");
    expect(tracks[1].midiClips[0].notes[0]).toMatchObject({ pitch: 60, velocity: 90 });
    expect(useStudioStore.getState().project.id).toBe("owned-project-a");
  });
});
