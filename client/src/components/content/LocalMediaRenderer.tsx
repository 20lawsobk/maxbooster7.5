import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

export type LocalMediaKind = "image" | "audio" | "video";

export interface LocalMediaResult {
  kind: LocalMediaKind;
  url: string;
  width?: number;
  height?: number;
  durationSec?: number;
  bpm?: number;
  key?: string;
  instrument?: string;
  controls: Record<string, unknown>;
  capability: Record<string, unknown>;
}

interface RendererOptions {
  headline: string;
  platform: string;
  aspect: string;
  colorScheme: string;
  durationSec: number;
  bpm: number;
  key: string;
  instrument: string;
  arrangement: string;
  background: string;
  color1: string;
  color2: string;
}

export interface LocalMediaRendererProps {
  kind: LocalMediaKind;
  initialHeadline?: string;
  initialBpm?: number;
  platform?: string;
  onGenerated?: (result: LocalMediaResult) => void;
  className?: string;
}

const INSTRUMENTS = ["ensemble", "piano", "synth", "bass", "drums"];
const KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
  .flatMap(note => [note + " minor", note + " major"]);
const COLOR_SCHEMES = ["dark_neon", "vibrant_pastel", "monochrome", "high_contrast",
  "corporate_blue", "warm_earth", "bold_red_gold"];
const ASPECTS: Record<string, [number, number]> = {
  square: [640, 640], landscape: [640, 360], portrait: [360, 640],
};
const PRESENTATION = {
  image: { title: "Poster layout", description: "Place your exact headline on a designed background. This option creates typography and layout, not illustrated subjects.", action: "Create poster" },
  audio: { title: "Instrumental synthesis", description: "Create a piano, synth, bass, drum or ensemble instrumental. This option does not create vocals or imitate recordings.", action: "Create instrumental" },
  video: { title: "Promotional clip", description: "Animate your headline over a solid or gradient background in one scene. This option does not create people, locations or cinematic scenes.", action: "Create clip" },
};

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** Explicit renderer controls only: a subject prompt is never reinterpreted. */
export function buildLocalMediaRequest(kind: LocalMediaKind, options: RendererOptions) {
  if (!Object.hasOwn(PRESENTATION, kind)) throw new Error("Unsupported media type");
  if (!Object.hasOwn(ASPECTS, options.aspect)) throw new Error("Choose a supported aspect ratio");
  const [width, height] = ASPECTS[options.aspect];
  const headline = options.headline.trim();
  if (kind !== "audio" && (!headline || headline.length > 280)) {
    throw new Error("Enter a headline of 1–280 characters");
  }
  if (kind === "image") {
    if (!COLOR_SCHEMES.includes(options.colorScheme)) throw new Error("Choose a supported poster palette");
    return { endpoint: "/api/generate/image", body: {
      platform: options.platform, prompt: headline,
      dedicated_controls: { headline, width, height, mode: "poster",
        color_scheme: options.colorScheme, img_format: "png" },
    } };
  }
  if (!positive(options.durationSec) || options.durationSec < 1 || options.durationSec > (kind === "audio" ? 60 : 20)) {
    throw new Error(kind === "audio" ? "Choose an instrumental duration from 1–60 seconds" : "Choose a clip duration from 1–20 seconds");
  }
  if (kind === "audio") {
    if (!positive(options.bpm) || options.bpm < 60 || options.bpm > 200) throw new Error("Choose a tempo from 60–200 BPM");
    if (!KEYS.includes(options.key) || !INSTRUMENTS.includes(options.instrument) ||
        !["loop", "structured"].includes(options.arrangement)) throw new Error("Choose supported instrumental controls");
    return { endpoint: "/api/generate/audio", body: {
      platform: options.platform, prompt: "Instrumental synthesis", duration: options.durationSec,
      dedicated_controls: { duration_sec: options.durationSec, bpm: options.bpm,
        key: options.key, instrument: options.instrument, arrangement: options.arrangement, sample_rate: 44100 },
    } };
  }
  if (!["solid", "gradient"].includes(options.background) ||
      !/^#[0-9a-f]{6}$/i.test(options.color1) || !/^#[0-9a-f]{6}$/i.test(options.color2)) {
    throw new Error("Choose a supported clip background and colors");
  }
  return { endpoint: "/api/generate-video", body: {
    idea: headline, platform: options.platform,
    dedicated_controls: { duration_sec: options.durationSec, width, height, fps: 24,
      headline, background: options.background, color1: options.color1.replace("#", "0x"),
      color2: options.color2.replace("#", "0x"), continuity: "single_scene" },
  } };
}

/** A plan, scratch URL or upload acknowledgment is not a delivered artifact. */
export function readLocalMediaResult(kind: LocalMediaKind, value: unknown): LocalMediaResult {
  if (!Object.hasOwn(PRESENTATION, kind) || !record(value) || value.success !== true || value.status !== "completed" ||
      value.delivery_status !== "durable" || !record(value.validation) ||
      value.validation.artifact_validated !== true || !record(value.receipt) ||
      value.receipt.durable !== true || value.receipt.retrievable !== true ||
      typeof value.job_id !== "string" || !value.job_id || value.receipt.job_id !== value.job_id ||
      typeof value.url !== "string" || !/^\/api\/storage\/file\/[^?#]+$/.test(value.url) ||
      value.receipt.url !== value.url || typeof value.receipt.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/i.test(value.receipt.sha256) || !positive(value.receipt.size_bytes) ||
      !Number.isInteger(value.receipt.size_bytes) || value.receipt.size_bytes < 32 ||
      !record(value.capability) || value.capability.trained !== false ||
      value.capability.kind !== ({ image: "layout", audio: "synthesis", video: "procedural" }[kind])) {
    throw new Error("The renderer did not deliver a validated media file. Retry when generation is available.");
  }
  const controls = record(value.receipt.effective_controls) ? value.receipt.effective_controls : {};
  const duration = value.receipt.duration;
  const width = value.receipt.width;
  const height = value.receipt.height;
  if (kind === "audio" && (!positive(controls.bpm) || typeof controls.key !== "string" ||
      !KEYS.includes(controls.key) || typeof controls.instrument !== "string" || !INSTRUMENTS.includes(controls.instrument))) {
    throw new Error("The rendered instrumental has no verified musical controls");
  }
  if (kind !== "audio" && (!positive(width) || !positive(height))) {
    throw new Error("The rendered file has no verified dimensions");
  }
  if (kind !== "audio" && (controls.width !== width || controls.height !== height)) {
    throw new Error("The rendered dimensions do not match the applied controls");
  }
  if (kind !== "image" && !positive(duration)) throw new Error("The rendered file has no verified duration");
  return { kind, url: value.url, controls, capability: value.capability,
    ...(positive(width) ? { width } : {}), ...(positive(height) ? { height } : {}),
    ...(positive(duration) ? { durationSec: duration } : {}),
    ...(positive(controls.bpm) ? { bpm: controls.bpm } : {}),
    ...(typeof controls.key === "string" ? { key: controls.key } : {}),
    ...(typeof controls.instrument === "string" ? { instrument: controls.instrument } : {}),
  };
}

export function LocalMediaRenderer({ kind, initialHeadline = "", initialBpm = 120,
  platform = "instagram", onGenerated, className = "" }: LocalMediaRendererProps) {
  const id = useId();
  const [headline, setHeadline] = useState(initialHeadline);
  const [aspect, setAspect] = useState("square");
  const [colorScheme, setColorScheme] = useState("dark_neon");
  const [durationSec, setDurationSec] = useState(kind === "audio" ? 8 : 4);
  const [bpm, setBpm] = useState(initialBpm);
  const [key, setKey] = useState("C minor");
  const [instrument, setInstrument] = useState("piano");
  const [arrangement, setArrangement] = useState("loop");
  const [background, setBackground] = useState("gradient");
  const [color1, setColor1] = useState("#1a1a2e");
  const [color2, setColor2] = useState("#16213e");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LocalMediaResult | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => { setHeadline(initialHeadline); }, [initialHeadline]);
  useEffect(() => { setBpm(initialBpm); }, [initialBpm]);
  useEffect(() => {
    setResult(null); setError(null); setBusy(false);
    return () => { active.current?.abort(); active.current = null; };
  }, [kind]);

  async function generate() {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 120_000);
    setBusy(true); setError(null); setResult(null);
    try {
      const request = buildLocalMediaRequest(kind, { headline, platform, aspect, colorScheme,
        durationSec, bpm, key, instrument, arrangement, background, color1, color2 });
      const response = await apiRequest("POST", request.endpoint, request.body, {
        signal: controller.signal, maxRetries: 0,
      });
      const media = readLocalMediaResult(kind, await response.json());
      if (active.current !== controller) return;
      setResult(media); onGenerated?.(media);
    } catch (failure) {
      if (active.current !== controller || (controller.signal.aborted && !timedOut)) return;
      setError(timedOut ? "Creation timed out. Please retry when generation is available." : failure && typeof failure === "object" && "userMessage" in failure && typeof failure.userMessage === "string"
        ? failure.userMessage : failure instanceof Error ? failure.message : "Unable to create media. Please retry.");
    } finally {
      clearTimeout(timer);
      if (active.current === controller) { active.current = null; setBusy(false); }
    }
  }

  const field = "w-full rounded-md border bg-background px-3 py-2 text-sm";
  const title = PRESENTATION[kind];
  return <section className={`space-y-4 ${className}`} aria-label={title.title}>
    <div><h3 className="font-semibold">{title.title}</h3><p className="text-sm text-muted-foreground">{title.description}</p></div>
    <fieldset disabled={busy} className="space-y-3">
      {kind !== "audio" && <div className="space-y-1"><label htmlFor={`${id}-headline`}>Headline</label>
        <input id={`${id}-headline`} className={field} value={headline} maxLength={280}
          onChange={event => setHeadline(event.target.value)} /></div>}
      {kind !== "audio" && <div className="space-y-1"><label htmlFor={`${id}-aspect`}>Aspect ratio</label>
        <select id={`${id}-aspect`} className={field} value={aspect} onChange={event => setAspect(event.target.value)}>
          <option value="square">Square</option><option value="portrait">Portrait</option><option value="landscape">Landscape</option>
        </select></div>}
      {kind === "image" && <div className="space-y-1"><label htmlFor={`${id}-palette`}>Palette</label>
        <select id={`${id}-palette`} className={field} value={colorScheme} onChange={event => setColorScheme(event.target.value)}>
          {COLOR_SCHEMES.map(color => <option key={color} value={color}>{color.replaceAll("_", " ")}</option>)}
        </select></div>}
      {kind !== "image" && <div className="space-y-1"><label htmlFor={`${id}-duration`}>Duration (seconds)</label>
        <input id={`${id}-duration`} className={field} type="number" min={1} max={kind === "audio" ? 60 : 20}
          value={Number.isFinite(durationSec) ? durationSec : ""} onChange={event => setDurationSec(event.target.valueAsNumber)} /></div>}
      {kind === "audio" && <>
        <div className="space-y-1"><label htmlFor={`${id}-instrument`}>Instrument</label>
          <select id={`${id}-instrument`} className={field} value={instrument} onChange={event => setInstrument(event.target.value)}>
            {INSTRUMENTS.map(item => <option key={item} value={item}>{item}</option>)}
          </select></div>
        <div className="space-y-1"><label htmlFor={`${id}-tempo`}>Tempo (BPM)</label>
          <input id={`${id}-tempo`} className={field} type="number" min={60} max={200} value={Number.isFinite(bpm) ? bpm : ""}
            onChange={event => setBpm(event.target.valueAsNumber)} /></div>
        <div className="space-y-1"><label htmlFor={`${id}-key`}>Key</label>
          <select id={`${id}-key`} className={field} value={key} onChange={event => setKey(event.target.value)}>
            {KEYS.map(item => <option key={item} value={item}>{item}</option>)}
          </select></div>
        <div className="space-y-1"><label htmlFor={`${id}-arrangement`}>Arrangement</label>
          <select id={`${id}-arrangement`} className={field} value={arrangement} onChange={event => setArrangement(event.target.value)}>
            <option value="loop">Loop</option><option value="structured">Structured</option>
          </select></div>
      </>}
      {kind === "video" && <>
        <div className="space-y-1"><label htmlFor={`${id}-background`}>Background</label>
          <select id={`${id}-background`} className={field} value={background} onChange={event => setBackground(event.target.value)}>
            <option value="gradient">Gradient</option><option value="solid">Solid</option>
          </select></div>
        <div className="flex gap-4"><label htmlFor={`${id}-color1`}>First color <input id={`${id}-color1`} type="color" value={color1} onChange={event => setColor1(event.target.value)} /></label>
          {background === "gradient" && <label htmlFor={`${id}-color2`}>Second color <input id={`${id}-color2`} type="color" value={color2} onChange={event => setColor2(event.target.value)} /></label>}</div>
      </>}
    </fieldset>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="button" onClick={() => void generate()} disabled={busy} aria-busy={busy}>
      {busy ? "Creating…" : error ? "Retry" : title.action}
    </Button>
    {result && <div className="space-y-2" aria-label="Created media">
      {kind === "image" ? <img src={result.url} alt={String(result.controls.headline || "Created poster")} className="max-h-80 w-full object-contain" />
        : kind === "audio" ? <audio controls src={result.url} className="w-full" />
          : <video controls src={result.url} className="max-h-80 w-full" playsInline />}
      <p className="text-sm text-muted-foreground">{result.width && result.height ? `${result.width} × ${result.height}` : "Instrumental audio"}
        {result.durationSec ? ` · ${result.durationSec.toFixed(1)} seconds` : ""}</p>
      <a className="inline-block text-sm font-medium underline" href={result.url}
        download={`created-${kind}.${kind === "image" ? "png" : kind === "audio" ? "wav" : "mp4"}`}>Download {kind}</a>
    </div>}
  </section>;
}
