import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  api: vi.fn(), toast: vi.fn(), setters: [] as unknown[],
  lyrics: "", firstEmpty: true, dedicatedMode: "",
}));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual,
    useState: (initial: unknown) => {
      let value = typeof initial === "function" ? initial() : initial;
      if (state.lyrics && state.firstEmpty && value === "") { value = state.lyrics; state.firstEmpty = false; }
      if (state.dedicatedMode === "audio" && value === "model") value = "synthesis";
      if (state.dedicatedMode === "video" && value === "text") value = "promo";
      return [value, (next: unknown) => state.setters.push(next)];
    },
    useCallback: (callback: unknown) => callback,
    useMemo: (callback: () => unknown) => callback(),
    useRef: (current: unknown) => ({ current }),
    useEffect: () => {},
  };
});
vi.mock("@/lib/queryClient", () => ({ apiRequest: state.api, getCsrfTokenFromCookie: () => "fixture-csrf" }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: state.toast }) }));
vi.mock("wouter", () => ({ useLocation: () => ["/studio", vi.fn()] }));
vi.mock("@/components/ui/video-player", () => ({ VideoPlayer: () => null }));
vi.mock("@/components/content/LocalMediaRenderer", () => ({ LocalMediaRenderer: function LocalMediaRenderer() { return null; } }));
vi.mock("framer-motion", () => ({
  motion: new Proxy({}, { get: (_target, name) => String(name) }),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

import { AIMusicGenerator } from "../../client/src/components/studio/AIMusicGenerator";
import { FlowStateLyricsToMelody } from "../../client/src/components/studio/FlowStateLyricsToMelody";
import { ServerVideoGenerator } from "../../client/src/components/content/ServerVideoGenerator";
import { LocalMediaRenderer } from "../../client/src/components/content/LocalMediaRenderer";

function elements(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as React.ReactNode)];
}
function text(node: React.ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (React.isValidElement<Record<string, unknown>>(node)) return text(node.props.children as React.ReactNode);
  return typeof node === "string" ? node : "";
}
async function click(tree: React.ReactNode, label: string) {
  const button = elements(tree).find(node => typeof node.props.onClick === "function" && text(node.props.children as React.ReactNode).trim() === label);
  expect(button, label).toBeDefined();
  await (button!.props.onClick as () => Promise<void>)();
}
beforeEach(() => {
  state.api.mockReset(); state.toast.mockReset(); state.setters.length = 0;
  state.lyrics = ""; state.firstEmpty = true; state.dedicatedMode = "";
});

describe("studio component request/result contracts", () => {
  it("supplies the arrangement instrument and inserts actual normalized notes", async () => {
    const notes = [{ pitch: 60, velocity: 96, startTime: 0, duration: 1 }];
    state.api.mockResolvedValue({ json: async () => ({ arrangement: { notes } }) });
    const onTrackGenerated = vi.fn();
    const tree = AIMusicGenerator({ projectId: "owned-project", initialTempo: 96, onTrackGenerated });
    await click(tree, "Generate Full Arrangement");
    expect(state.api).toHaveBeenCalledWith("POST", "/api/studio/generation/pattern/arrangement", expect.objectContaining({ instrument: "synth_lead", tempo: 96 }));
    expect(onTrackGenerated).toHaveBeenCalledWith(expect.objectContaining({ type: "midi", generatedNotes: notes }));
  });
  it("sends exact lyric direction and consumes normalized MIDI pitches without invented scores", async () => {
    state.lyrics = "My exact lyric\nSecond line";
    state.api.mockResolvedValue({ json: async () => ({ melody: { notes: [
      { pitch: 60, velocity: 96, startTime: 0, duration: 1 },
    ] } }) });
    const tree = FlowStateLyricsToMelody({ currentKey: "C", currentTempo: 96 });
    await click(tree, "Generate Melodies");
    expect(state.api).toHaveBeenCalledWith("POST", "/api/studio/generation/pattern/melody", expect.objectContaining({
      instrument: "piano", tempo: 96,
      direction: expect.objectContaining({ lyrics: state.lyrics, mood: "Happy", pitchRange: [60, 72], melodicMovement: 0.5 }),
    }));
    const suggestions = state.setters.find(value => Array.isArray(value) && value[0]?.notes) as Array<{ notes: unknown[]; confidence?: number }>;
    expect(suggestions[0].notes[0]).toMatchObject({ pitch: 60, noteName: "C4", duration: 1 });
    expect(suggestions[0].confidence).toBeUndefined();
  });
  it("keeps synthesis an explicit option and retains actual renderer metadata", () => {
    const normal = AIMusicGenerator({ initialTempo: 96 });
    expect(elements(normal).filter(node => node.type === LocalMediaRenderer)).toHaveLength(0);
    state.dedicatedMode = "audio";
    const tree = AIMusicGenerator({ initialTempo: 96 });
    const renderer = elements(tree).find(node => node.type === LocalMediaRenderer)!;
    expect(renderer.props).toMatchObject({ kind: "audio", initialBpm: 96 });
    (renderer.props.onGenerated as (result: unknown) => void)({ url: "/api/storage/file/audio.wav", bpm: 110, key: "D", durationSec: 4 });
    expect(state.setters).toContainEqual(expect.objectContaining({ audioFilePath: "/api/storage/file/audio.wav", duration: 4,
      parameters: expect.objectContaining({ tempo: 110, key: "D" }) }));
    expect(state.api).not.toHaveBeenCalled();
  });
  it("only exposes promotional rendering after selecting it and forwards the target platform", () => {
    const callback = vi.fn();
    const normal = ServerVideoGenerator({ platform: "youtube", topic: "My release", onVideoGenerated: callback });
    expect(elements(normal).filter(node => node.type === LocalMediaRenderer)).toHaveLength(0);
    state.dedicatedMode = "video";
    const tree = ServerVideoGenerator({ platform: "youtube", topic: "My release", onVideoGenerated: callback });
    const renderer = elements(tree).find(node => node.type === LocalMediaRenderer)!;
    expect(renderer.props).toMatchObject({ kind: "video", platform: "youtube", initialHeadline: "My release" });
    (renderer.props.onGenerated as (result: unknown) => void)({ url: "/api/storage/file/video.mp4", width: 640, height: 360, durationSec: 3 });
    expect(callback).toHaveBeenCalledWith("/api/storage/file/video.mp4", undefined);
    expect(state.api).not.toHaveBeenCalled();
  });
});
