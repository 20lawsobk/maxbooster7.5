import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  chainInstances: [] as Array<{ input: unknown }>,
  chainSync: vi.fn(() => [] as string[]),
  chainDestroy: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("../../client/src/lib/daw/TrackPluginChain", () => ({
  TrackPluginChain: class {
    input = { connect: vi.fn(), disconnect: vi.fn() };

    constructor() {
      mocks.chainInstances.push(this);
    }

    sync(inserts: unknown[]) {
      return mocks.chainSync(inserts);
    }

    destroy() {
      mocks.chainDestroy();
    }
  },
}));

vi.mock("../../client/src/lib/logger", () => ({
  logger: {
    info: mocks.logInfo,
    warn: mocks.logWarn,
    error: mocks.logError,
  },
}));

import {
  AudioWorkletEngine,
  type ScheduledClip,
} from "../../client/src/lib/daw/AudioWorkletEngine";

class FakeAudioParam {
  value = 1;
  setTargetAtTime = vi.fn((value: number) => {
    this.value = value;
  });
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
}

class FakeAudioNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeGain extends FakeAudioNode {
  gain = new FakeAudioParam();
}

class FakeStereoPanner extends FakeAudioNode {
  pan = new FakeAudioParam();
}

class FakeAnalyser extends FakeAudioNode {
  fftSize = 2048;
  smoothingTimeConstant = 0;
  samples = [0.5, -0.25, 0, 0];

  get frequencyBinCount() {
    return this.fftSize / 2;
  }

  getFloatTimeDomainData = vi.fn((data: Float32Array) => {
    data.set(this.samples.slice(0, data.length));
  });
}

class FakeBufferSource extends FakeAudioNode {
  buffer: AudioBuffer | null = null;
  onended: ((event: Event) => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
}

class FakeAudioContext {
  static addModuleFailure: Error | null = null;
  static initialState: AudioContextState = "running";

  readonly options: AudioContextOptions;
  readonly sampleRate = 48000;
  readonly baseLatency = 0.01;
  readonly outputLatency = 0.02;
  readonly destination = new FakeAudioNode() as unknown as AudioDestinationNode;
  readonly audioWorklet = {
    addModule: vi.fn(async () => {
      if (FakeAudioContext.addModuleFailure) {
        throw FakeAudioContext.addModuleFailure;
      }
    }),
  };
  readonly gains: FakeGain[] = [];
  readonly analyzers: FakeAnalyser[] = [];
  readonly panners: FakeStereoPanner[] = [];
  readonly sources: FakeBufferSource[] = [];
  state = FakeAudioContext.initialState;
  currentTime = 1;
  decodedBuffer: AudioBuffer = {} as AudioBuffer;
  resume = vi.fn(async () => {
    this.state = "running";
  });
  close = vi.fn(async () => {
    this.state = "closed";
  });
  decodeAudioData = vi.fn(async () => this.decodedBuffer);

  constructor(options: AudioContextOptions) {
    this.options = options;
    contexts.push(this);
  }

  createGain() {
    const node = new FakeGain();
    this.gains.push(node);
    return node as unknown as GainNode;
  }

  createAnalyser() {
    const node = new FakeAnalyser();
    this.analyzers.push(node);
    return node as unknown as AnalyserNode;
  }

  createStereoPanner() {
    const node = new FakeStereoPanner();
    this.panners.push(node);
    return node as unknown as StereoPannerNode;
  }

  createBufferSource() {
    const node = new FakeBufferSource();
    this.sources.push(node);
    return node as unknown as AudioBufferSourceNode;
  }
}

class FakeAudioWorkletNode extends FakeAudioNode {
  readonly port = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    postMessage: vi.fn(),
  };

  constructor() {
    super();
    workletNodes.push(this);
  }
}

const contexts: FakeAudioContext[] = [];
const workletNodes: FakeAudioWorkletNode[] = [];
const frameCallbacks = new Map<number, FrameRequestCallback>();
let nextFrameId = 1;

function makeAudioBuffer(
  channelSamples: Float32Array[],
  sampleRate = 48000,
): AudioBuffer {
  return {
    numberOfChannels: channelSamples.length,
    sampleRate,
    length: channelSamples[0]?.length ?? 0,
    duration: (channelSamples[0]?.length ?? 0) / sampleRate,
    getChannelData: vi.fn((channel: number) => channelSamples[channel]),
  } as unknown as AudioBuffer;
}

function audioContextFor(): FakeAudioContext {
  const context = contexts[0];
  expect(context).toBeDefined();
  return context;
}

describe("AudioWorkletEngine", () => {
  beforeEach(() => {
    contexts.length = 0;
    workletNodes.length = 0;
    frameCallbacks.clear();
    nextFrameId = 1;
    FakeAudioContext.addModuleFailure = null;
    FakeAudioContext.initialState = "running";
    mocks.chainInstances.length = 0;
    mocks.chainSync.mockReset().mockReturnValue([]);
    mocks.chainDestroy.mockReset();
    mocks.logInfo.mockReset();
    mocks.logWarn.mockReset();
    mocks.logError.mockReset();
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const id = nextFrameId++;
      frameCallbacks.set(id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      frameCallbacks.delete(id);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("exposes stable defaults and safe no-context behavior", async () => {
    const engine = new AudioWorkletEngine();
    const stateChanges: unknown[] = [];
    engine.on((event) => stateChanges.push(event));

    expect(engine.getState()).toEqual({
      isPlaying: false,
      isRecording: false,
      currentSample: 0,
      currentTime: 0,
      loopStart: 0,
      loopEnd: 0,
      isLooping: false,
    });
    expect(engine.getSampleRate()).toBe(48000);
    expect(engine.getLatency()).toBe(0);

    engine.createTrack("before-init");
    expect(engine.setTrackPlugins("missing", [
      { id: "unsupported", name: "Unknown", parameters: {} },
    ])).toEqual(["unsupported"]);
    engine.setTrackVolume("missing", 0.5);
    engine.setTrackPan("missing", 0);
    engine.setTrackMute("missing", true);
    engine.setTrackSolo("missing", true);
    engine.setMasterVolume(0.5);
    engine.scheduleClip({
      id: "clip",
      trackId: "missing",
      buffer: makeAudioBuffer([new Float32Array(1)]),
      startSample: 0,
      durationSamples: 1,
      offsetSamples: 0,
      gain: 1,
      fadeInSamples: 0,
      fadeOutSamples: 0,
    });
    engine.play();
    engine.setPosition(-10);
    engine.setLoop(true, 100, 200);
    expect(engine.getState()).toMatchObject({
      currentSample: 0,
      currentTime: 0,
      isLooping: true,
      loopStart: 100,
      loopEnd: 200,
    });
    engine.pause();
    engine.stop();
    expect(engine.getState()).toMatchObject({
      isPlaying: false,
      currentSample: 0,
      currentTime: 0,
    });

    await expect(engine.loadAudioFile("track.wav")).rejects.toThrow(
      "AudioContext not initialized",
    );
    await expect(engine.loadAudioBlob(new Blob(["track"]))).rejects.toThrow(
      "AudioContext not initialized",
    );
    engine.dispose();
    expect(stateChanges.length).toBeGreaterThan(0);
    expect(contexts).toHaveLength(0);
  });

  it("initializes the worklet graph and resumes an existing suspended context", async () => {
    const engine = new AudioWorkletEngine();
    const events: unknown[] = [];
    engine.on((event) => events.push(event));

    await engine.initialize({ sampleRate: 44100, bufferSize: 512 });

    expect(contexts).toHaveLength(1);
    expect(contexts[0].options).toMatchObject({
      sampleRate: 44100,
      latencyHint: "interactive",
    });
    expect(contexts[0].audioWorklet.addModule).toHaveBeenCalledWith(
      "/audio-processor.js",
    );
    expect(workletNodes).toHaveLength(1);
    expect(contexts[0].gains[0].connect).toHaveBeenCalled();
    expect(workletNodes[0].connect).toHaveBeenCalledWith(
      contexts[0].destination,
    );
    expect(engine.getSampleRate()).toBe(48000);
    expect(events).toContainEqual({
      type: "state-change",
      data: { initialized: true },
    });

    contexts[0].state = "suspended";
    await engine.initialize({ channels: 1 });
    expect(contexts).toHaveLength(1);
    expect(contexts[0].resume).toHaveBeenCalledOnce();
    expect(events.filter((event: any) => event.type === "state-change"))
      .toHaveLength(2);
  });

  it("resumes a newly created context that starts suspended", async () => {
    FakeAudioContext.initialState = "suspended";
    const engine = new AudioWorkletEngine();

    await engine.initialize();

    expect(contexts).toHaveLength(1);
    expect(contexts[0].resume).toHaveBeenCalledOnce();
    expect(contexts[0].state).toBe("running");
  });

  it("propagates AudioContext construction failures and records the error", async () => {
    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          throw new Error("audio device unavailable");
        }
      },
    );
    const engine = new AudioWorkletEngine();

    await expect(engine.initialize()).rejects.toThrow(
      "audio device unavailable",
    );
    expect(mocks.logError).toHaveBeenCalledOnce();
  });

  it("converts worklet meter messages and ignores unrelated messages", async () => {
    const engine = new AudioWorkletEngine();
    const events: any[] = [];
    engine.on((event) => events.push(event));
    await engine.initialize();

    workletNodes[0].port.onmessage?.({
      data: {
        type: "metering",
        data: {
          position: 960,
          time: 0.02,
          peakLeft: 0.5,
          peakRight: 0,
          rmsLeft: 0.25,
          rmsRight: 0,
        },
      },
    } as MessageEvent);

    expect(engine.getState()).toMatchObject({
      currentSample: 960,
      currentTime: 0.02,
    });
    expect(engine.getMeteringData("master")).toMatchObject({
      trackId: "master",
      left: 20 * Math.log10(0.5),
      right: -Infinity,
      peakLeft: 0.5,
      peakRight: 0,
      rmsLeft: 20 * Math.log10(0.25),
      rmsRight: -Infinity,
    });
    expect(events.map((event) => event.type)).toEqual([
      "state-change",
      "metering-update",
      "position-update",
    ]);

    workletNodes[0].port.onmessage?.({ data: { type: "unknown" } } as MessageEvent);
    expect(events).toHaveLength(3);
    expect(engine.getAllMeteringData()).not.toBe(engine.getAllMeteringData());
    engine.dispose();
  });

  it("falls back to analyzer metering when the worklet module cannot load", async () => {
    FakeAudioContext.addModuleFailure = new Error("worklet unavailable");
    const engine = new AudioWorkletEngine();
    const events: any[] = [];
    engine.on((event) => events.push(event));

    await engine.initialize();
    engine.createTrack("lead");

    const frame = [...frameCallbacks.values()][0];
    expect(frame).toBeDefined();
    frame?.(0);

    vi.useFakeTimers();
    engine.play();
    const activeFrame = [...frameCallbacks.values()].at(-1);
    activeFrame?.(0);

    expect(workletNodes).toHaveLength(0);
    expect(engine.getMeteringData("lead")).toMatchObject({
      trackId: "lead",
      peakLeft: 0.5,
      peakRight: 0.5,
    });
    expect(engine.getMeteringData("master")).toMatchObject({
      trackId: "master",
      peakLeft: 0.5,
    });
    expect(events.some((event) => event.type === "metering-update")).toBe(true);
    engine.pause();
    engine.dispose();
  });

  it("applies track and master controls, routes inserts, and removes tracks", async () => {
    const engine = new AudioWorkletEngine();
    await engine.initialize();
    engine.createTrack("lead");
    engine.createTrack("backing");
    const context = audioContextFor();
    const leadGain = context.gains[1];
    const backingGain = context.gains[2];

    engine.setTrackVolume("lead", 2);
    expect(leadGain.gain.value).toBe(1);
    engine.setTrackPan("lead", -0.25);
    expect(context.panners[0].pan.value).toBe(-0.25);
    engine.setTrackMute("lead", true);
    engine.setTrackSolo("backing", true);
    expect(leadGain.gain.value).toBe(0);
    expect(backingGain.gain.value).toBe(1);
    engine.setTrackSolo("backing", false);
    expect(leadGain.gain.value).toBe(0);
    engine.setTrackMute("lead", false);
    expect(leadGain.gain.value).toBe(1);
    engine.setMasterVolume(-1);
    expect(context.gains[0].gain.value).toBe(0);

    const trackInsert = {
      id: "track-insert",
      name: "Track insert",
      parameters: {},
    };
    mocks.chainSync.mockReturnValue(["track-result"]);
    expect(engine.setTrackPlugins("lead", [trackInsert])).toEqual([
      "track-result",
    ]);
    mocks.chainSync.mockReturnValue(["unavailable"]);
    expect(engine.setTrackPlugins("missing", [
      { id: "missing-insert", name: "Missing", parameters: {} },
    ])).toEqual(["missing-insert"]);
    expect(engine.setTrackPlugins("master", [
      { id: "master-insert", name: "Unknown", parameters: {} },
    ])).toEqual(["unavailable"]);
    expect(mocks.chainInstances).toHaveLength(3);
    engine.createTrack("lead");
    expect(mocks.chainInstances).toHaveLength(3);
    engine.removeTrack("missing");

    engine.removeTrack("lead");
    expect(context.analyzers[1].disconnect).toHaveBeenCalled();
    expect(context.panners[0].disconnect).toHaveBeenCalled();
    expect(leadGain.disconnect).toHaveBeenCalled();
    expect(mocks.chainDestroy).toHaveBeenCalled();
    engine.dispose();
  });

  it("schedules a clip with fades and stops its source when removed", async () => {
    const engine = new AudioWorkletEngine();
    await engine.initialize();
    engine.createTrack("lead");
    const clip: ScheduledClip = {
      id: "clip-1",
      trackId: "lead",
      buffer: makeAudioBuffer([new Float32Array(4800)]),
      startSample: 0,
      durationSamples: 4800,
      offsetSamples: 120,
      gain: 0.8,
      fadeInSamples: 240,
      fadeOutSamples: 480,
    };
    engine.scheduleClip(clip);
    engine.play();

    const context = audioContextFor();
    const source = context.sources[0];
    const clipGain = context.gains[2];
    expect(source.buffer).toBe(clip.buffer);
    expect(source.start).toHaveBeenCalledWith(1, 120 / 48000, 0.1);
    expect(clipGain.gain.setValueAtTime).toHaveBeenCalledTimes(2);
    expect(clipGain.gain.linearRampToValueAtTime).toHaveBeenCalledTimes(2);

    engine.pause();
    expect(source.stop).toHaveBeenCalledOnce();
    engine.play();
    const rescheduledSource = context.sources[1];
    expect(rescheduledSource.start).toHaveBeenCalledOnce();
    engine.removeClip(clip.id);
    expect(rescheduledSource.stop).toHaveBeenCalledOnce();
    expect(rescheduledSource.disconnect).toHaveBeenCalledOnce();
    engine.pause();
    engine.dispose();
  });

  it("skips clips outside the playback window or without a usable track", async () => {
    const engine = new AudioWorkletEngine();
    const internals = engine as unknown as {
      scheduleClipPlayback: (clip: ScheduledClip) => void;
    };
    const clip: ScheduledClip = {
      id: "edge-clip",
      trackId: "lead",
      buffer: makeAudioBuffer([new Float32Array(4800)]),
      startSample: 0,
      durationSamples: 4800,
      offsetSamples: 0,
      gain: 1,
      fadeInSamples: 0,
      fadeOutSamples: 0,
    };

    internals.scheduleClipPlayback(clip);
    await engine.initialize();
    internals.scheduleClipPlayback(clip);
    engine.createTrack("lead");
    internals.scheduleClipPlayback({ ...clip, durationSamples: 0 });
    engine.setPosition(4800);
    internals.scheduleClipPlayback(clip);
    engine.setPosition(0);
    internals.scheduleClipPlayback({ ...clip, startSample: 30000 });
    expect(audioContextFor().sources).toHaveLength(0);
    engine.dispose();
  });

  it("forwards transport commands to the loaded worklet", async () => {
    const engine = new AudioWorkletEngine();
    await engine.initialize();
    engine.createTrack("lead");
    engine.setLoop(true, 240, 2400);
    engine.play();
    engine.setPosition(480);
    engine.stop();

    const messages = workletNodes[0].port.postMessage.mock.calls.map(
      ([message]) => message,
    );
    expect(messages.map((message: any) => message.type)).toContain("setLoop");
    expect(messages.map((message: any) => message.type)).toContain("play");
    expect(messages.map((message: any) => message.type)).toContain("seek");
    expect(messages.map((message: any) => message.type)).toContain("pause");
    expect(messages.map((message: any) => message.type)).toContain("stop");
    expect(engine.getState()).toMatchObject({
      currentSample: 0,
      currentTime: 0,
      isPlaying: false,
    });
    engine.dispose();
  });

  it("unsubscribes event listeners without affecting other engine state", () => {
    const engine = new AudioWorkletEngine();
    const events: unknown[] = [];
    const unsubscribe = engine.on((event) => events.push(event));

    engine.setPosition(10);
    expect(events).toHaveLength(1);
    unsubscribe();
    engine.setPosition(20);
    expect(events).toHaveLength(1);
    expect(engine.getState().currentSample).toBe(20);
  });

  it("loads audio through normalized URLs and decodes blobs", async () => {
    const engine = new AudioWorkletEngine();
    await engine.initialize();
    const context = audioContextFor();
    const decoded = makeAudioBuffer([new Float32Array([0.1])]);
    context.decodedBuffer = decoded;
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      arrayBuffer: async () => new ArrayBuffer(4),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(engine.loadAudioFile("uploads/song.wav")).resolves.toBe(decoded);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/marketplace/audio/uploads/song.wav",
    );
    await engine.loadAudioFile("https://media.example.test/song.wav");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://media.example.test/song.wav",
    );
    await engine.loadAudioFile("/api/marketplace/audio/owned.wav");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/marketplace/audio/owned.wav",
    );
    await expect(engine.loadAudioBlob(new Blob(["audio"]))).resolves.toBe(decoded);
    expect(context.decodeAudioData).toHaveBeenCalledTimes(4);
    engine.dispose();
  });

  it("reports failed audio fetches with the normalized URL and HTTP status", async () => {
    const engine = new AudioWorkletEngine();
    await engine.initialize();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 404,
        statusText: "Not Found",
        arrayBuffer: async () => new ArrayBuffer(0),
      })),
    );

    await expect(engine.loadAudioFile("missing.wav")).rejects.toThrow(
      'Failed to fetch audio "/api/marketplace/audio/missing.wav": HTTP 404 Not Found',
    );
    engine.dispose();
  });

  it("builds multi-resolution mono/stereo peaks and legacy peak data", () => {
    const engine = new AudioWorkletEngine();
    const left = new Float32Array(70);
    const right = new Float32Array(70);
    left[0] = 0.8;
    left[1] = -0.6;
    right[0] = 0.2;
    right[1] = -0.4;
    left[69] = 0.4;
    right[69] = 0.2;

    const stereoCache = engine.extractPeakCache(
      makeAudioBuffer([left, right], 44100),
    );
    expect(stereoCache.sampleRate).toBe(44100);
    expect(stereoCache.totalSamples).toBe(70);
    expect(stereoCache.levels.map((level) => level.samplesPerPeak)).toEqual([
      64, 256, 1024, 4096,
    ]);
    expect(stereoCache.levels[0].count).toBe(2);
    expect(stereoCache.levels[0].peaks[0]).toBeCloseTo(-0.5, 6);
    expect(stereoCache.levels[0].peaks[1]).toBeCloseTo(0.5, 6);
    expect(stereoCache.levels[0].peaks[2]).toBe(0);
    expect(stereoCache.levels[0].peaks[3]).toBeCloseTo(0.3, 6);

    const monoCache = engine.extractPeakCache(makeAudioBuffer([left]));
    expect(monoCache.levels[0].peaks[0]).toBeCloseTo(-0.6, 6);
    expect(monoCache.levels[0].peaks[1]).toBeCloseTo(0.8, 6);
    expect(engine.extractPeakData(makeAudioBuffer([left]))[0]).toBeCloseTo(
      0.8,
      6,
    );
  });
});
