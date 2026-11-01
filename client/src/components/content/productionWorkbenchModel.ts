/**
 * Pure model for the Production workspace: validation, portable project
 * serialization, request construction, script/caption export and history.
 * No network, no DOM. Everything here is unit-testable.
 */

export const PROJECT_FORMAT = "maxbooster.production-project";
export const PROJECT_VERSION = 1;
export const FPS = 24;
export const MAX_SCENES = 8;
export const MIN_SCENES = 1;
export const MAX_SCENE_TEXT = 280;
export const MIN_SCENE_SEC = 0.5;
export const MAX_SCENE_SEC = 30;
export const MIN_TOTAL_SEC = 0.5;
export const MAX_TOTAL_SEC = 60;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_TOTAL_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 4096 * 4096;
export const MAX_NARRATION_CHARS = 3000;
export const MAX_BRIEF_CHARS = 2000;
export const MAX_PROJECT_FILE_BYTES = 16 * 1024 * 1024;

export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type ImageMime = (typeof IMAGE_MIME_TYPES)[number];
export const TRANSITIONS = ["fade", "dissolve", "wipeleft", "fadeblack"] as const;
export type Transition = (typeof TRANSITIONS)[number];
export const COLOR_GRADES = ["none", "warm", "cool", "cinematic", "neon"] as const;
export type ColorGrade = (typeof COLOR_GRADES)[number];
export const VOICES = ["en-us", "en-gb"] as const;
export type Voice = (typeof VOICES)[number];
export const INSTRUMENTS = ["ensemble", "piano", "synth", "bass", "drums"] as const;
export type Instrument = (typeof INSTRUMENTS)[number];
export const ARRANGEMENTS = ["structured", "loop"] as const;
export type Arrangement = (typeof ARRANGEMENTS)[number];
export const MUSIC_KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
  .flatMap(note => [`${note} minor`, `${note} major`]);
export const ASPECTS = {
  portrait: { label: "Vertical 9:16", width: 360, height: 640 },
  square: { label: "Square 1:1", width: 640, height: 640 },
  landscape: { label: "Landscape 16:9", width: 640, height: 360 },
} as const;
export type AspectId = keyof typeof ASPECTS;

export interface MediaAsset {
  /** Raw base64, no data: prefix. */
  b64: string;
  mime: ImageMime;
  name: string;
  bytes: number;
  width: number;
  height: number;
}

export interface Scene {
  id: string;
  text: string;
  durationSec: number;
  image?: MediaAsset;
}

export interface ProductionProject {
  brief: string;
  platform: string;
  aspect: AspectId;
  scenes: Scene[];
  transition: Transition;
  colorGrade: ColorGrade;
  logo?: MediaAsset;
  narration: { enabled: boolean; text: string; voice: Voice; wpm: number };
  music: { enabled: boolean; bpm: number; key: string; instrument: Instrument; arrangement: Arrangement };
}

let sceneCounter = 0;
export function newSceneId(): string {
  sceneCounter += 1;
  return `scene-${Date.now().toString(36)}-${sceneCounter}`;
}

export function createScene(text = "", durationSec = 3): Scene {
  return { id: newSceneId(), text, durationSec };
}

export function createEmptyProject(platform = "instagram"): ProductionProject {
  return {
    brief: "",
    platform,
    aspect: platform === "youtube" || platform === "twitter" ? "landscape" : platform === "tiktok" ? "portrait" : "square",
    scenes: [createScene()],
    transition: "fade",
    colorGrade: "none",
    narration: { enabled: false, text: "", voice: "en-us", wpm: 150 },
    music: { enabled: false, bpm: 100, key: "C minor", instrument: "piano", arrangement: "structured" },
  };
}

// ── Scene operations (immutable) ──────────────────────────────────────────────
export function addScene(p: ProductionProject): ProductionProject {
  if (p.scenes.length >= MAX_SCENES) return p;
  return { ...p, scenes: [...p.scenes, createScene()] };
}
export function removeScene(p: ProductionProject, id: string): ProductionProject {
  if (p.scenes.length <= MIN_SCENES) return p;
  return { ...p, scenes: p.scenes.filter(s => s.id !== id) };
}
export function moveScene(p: ProductionProject, id: string, delta: -1 | 1): ProductionProject {
  const i = p.scenes.findIndex(s => s.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= p.scenes.length) return p;
  const scenes = [...p.scenes];
  [scenes[i], scenes[j]] = [scenes[j], scenes[i]];
  return { ...p, scenes };
}
export function updateScene(p: ProductionProject, id: string, patch: Partial<Omit<Scene, "id">>): ProductionProject {
  return { ...p, scenes: p.scenes.map(s => (s.id === id ? { ...s, ...patch } : s)) };
}

// ── Validation ────────────────────────────────────────────────────────────────
/** Backend contract: frames = floor(duration_sec * 24 + 0.5). */
export function sceneFrames(durationSec: number): number {
  return Number.isFinite(durationSec) ? Math.floor(durationSec * FPS + 0.5) : 0;
}
/** Requested total = sum of rounded scene frames / 24 (not the raw duration sum). */
export function totalDuration(scenes: Array<{ durationSec: number }>): number {
  return scenes.reduce((sum, s) => sum + sceneFrames(s.durationSec), 0) / FPS;
}

export function base64ByteLength(b64: string): number {
  const clean = b64.replace(/\s/g, "");
  const pad = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - pad;
}

/** Pre-read check of a picked file. Returns an error message or null. */
export function checkImageFile(file: { type: string; size: number }): string | null {
  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) return "Use a PNG, JPEG or WebP image.";
  if (file.size > MAX_IMAGE_BYTES) return "Each image must be 4 MiB or smaller.";
  if (file.size <= 0) return "That image file is empty.";
  return null;
}

export function checkImageDimensions(width: number, height: number): string | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) return "The image dimensions could not be read.";
  if (width * height > MAX_IMAGE_PIXELS) return "Images must be at most 4096 x 4096 pixels.";
  return null;
}

export function totalMediaBytes(p: ProductionProject): number {
  return p.scenes.reduce((sum, s) => sum + (s.image?.bytes ?? 0), 0) + (p.logo?.bytes ?? 0);
}

function validAsset(a: unknown): a is MediaAsset {
  if (!a || typeof a !== "object") return false;
  const v = a as Record<string, unknown>;
  return typeof v.b64 === "string" && /^[A-Za-z0-9+/]+={0,2}$/.test(v.b64) &&
    typeof v.mime === "string" && (IMAGE_MIME_TYPES as readonly string[]).includes(v.mime) &&
    typeof v.name === "string" && v.name.length <= 255 &&
    typeof v.bytes === "number" && v.bytes === base64ByteLength(v.b64) && v.bytes > 0 && v.bytes <= MAX_IMAGE_BYTES &&
    typeof v.width === "number" && typeof v.height === "number" && checkImageDimensions(v.width, v.height) === null;
}

export function validateProject(p: ProductionProject): string[] {
  const errors: string[] = [];
  if (p.scenes.length < MIN_SCENES || p.scenes.length > MAX_SCENES) errors.push(`Use ${MIN_SCENES} to ${MAX_SCENES} scenes.`);
  p.scenes.forEach((s, i) => {
    const t = s.text.trim();
    if (!t) errors.push(`Scene ${i + 1} needs on-screen text.`);
    else if (t.length > MAX_SCENE_TEXT) errors.push(`Scene ${i + 1} text is over ${MAX_SCENE_TEXT} characters.`);
    if (!Number.isFinite(s.durationSec) || s.durationSec < MIN_SCENE_SEC || s.durationSec > MAX_SCENE_SEC) {
      errors.push(`Scene ${i + 1} duration must be ${MIN_SCENE_SEC} to ${MAX_SCENE_SEC} seconds.`);
    }
    if (s.image && !validAsset(s.image)) errors.push(`Scene ${i + 1} image is not a valid PNG, JPEG or WebP under 4 MiB.`);
  });
  const total = totalDuration(p.scenes);
  if (total < MIN_TOTAL_SEC || total > MAX_TOTAL_SEC) errors.push(`Total length must be ${MIN_TOTAL_SEC} to ${MAX_TOTAL_SEC} seconds (now ${total}s).`);
  if (p.logo && !validAsset(p.logo)) errors.push("The logo is not a valid PNG, JPEG or WebP under 4 MiB.");
  if (totalMediaBytes(p) > MAX_TOTAL_IMAGE_BYTES) errors.push("Scene images and logo together must be 8 MiB or smaller.");
  if (!Object.hasOwn(ASPECTS, p.aspect)) errors.push("Choose a supported aspect ratio.");
  if (!TRANSITIONS.includes(p.transition)) errors.push("Choose a supported transition.");
  if (!COLOR_GRADES.includes(p.colorGrade)) errors.push("Choose a supported color grade.");
  if (p.brief.length > MAX_BRIEF_CHARS) errors.push(`Brief must be ${MAX_BRIEF_CHARS} characters or fewer.`);
  if (p.narration.enabled) {
    const t = p.narration.text.trim();
    if (!t || t.length > MAX_NARRATION_CHARS) errors.push(`Narration script must be 1 to ${MAX_NARRATION_CHARS} characters.`);
    if (!VOICES.includes(p.narration.voice)) errors.push("Choose a supported narration voice.");
    if (!Number.isInteger(p.narration.wpm) || p.narration.wpm < 100 || p.narration.wpm > 220) errors.push("Narration pace must be a whole number from 100 to 220 words per minute.");
  }
  if (p.music.enabled) {
    if (!Number.isFinite(p.music.bpm) || p.music.bpm < 60 || p.music.bpm > 200) errors.push("Music tempo must be 60 to 200 BPM.");
    if (!MUSIC_KEYS.includes(p.music.key)) errors.push("Choose a supported musical key.");
    if (!INSTRUMENTS.includes(p.music.instrument)) errors.push("Choose a supported instrument.");
    if (!ARRANGEMENTS.includes(p.music.arrangement)) errors.push("Choose a supported arrangement.");
  }
  return errors;
}

/** Rough spoken length estimate for the narration script, in seconds. */
export function estimateNarrationSec(text: string, wpm: number): number {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return wpm > 0 ? Math.round((words / wpm) * 600) / 10 : 0;
}

// ── Request construction ──────────────────────────────────────────────────────
export function buildProductionRequest(p: ProductionProject) {
  const errors = validateProject(p);
  if (errors.length) throw new Error(errors[0]);
  const { width, height } = ASPECTS[p.aspect];
  const scenes = p.scenes.map(s => ({
    text: s.text.trim(),
    duration_sec: s.durationSec,
    ...(s.image ? { image_b64: s.image.b64 } : {}),
  }));
  const brief = p.brief.trim();
  return {
    endpoint: "/api/generate-video" as const,
    body: {
      idea: brief || scenes.map(s => s.text).join("\n"),
      platform: p.platform,
      dedicated_controls: {
        width, height, fps: FPS,
        duration_sec: totalDuration(p.scenes),
        headline: "",
        production: {
          version: 1 as const,
          scenes,
          transition: p.transition,
          color_grade: p.colorGrade,
          ...(p.logo ? { logo_b64: p.logo.b64 } : {}),
          ...(p.narration.enabled ? { narration: { text: p.narration.text.trim(), voice: p.narration.voice, wpm: p.narration.wpm } } : {}),
          ...(p.music.enabled ? { music: { bpm: p.music.bpm, key: p.music.key, instrument: p.music.instrument, arrangement: p.music.arrangement } } : {}),
        },
      },
    },
  };
}

/** Stable identity of everything that affects a render (used for stale marking). */
export function projectFingerprint(p: ProductionProject): string {
  return JSON.stringify({
    platform: p.platform, aspect: p.aspect, brief: p.brief.trim(),
    scenes: p.scenes.map(s => [s.text.trim(), s.durationSec, s.image ? `${s.image.bytes}:${s.image.b64.slice(0, 64)}:${s.image.b64.slice(-64)}` : null]),
    t: p.transition, g: p.colorGrade,
    logo: p.logo ? `${p.logo.bytes}:${p.logo.b64.slice(0, 64)}:${p.logo.b64.slice(-64)}` : null,
    n: p.narration.enabled ? [p.narration.text.trim(), p.narration.voice, p.narration.wpm] : null,
    m: p.music.enabled ? [p.music.bpm, p.music.key, p.music.instrument, p.music.arrangement] : null,
  });
}

// ── Receipt reading ───────────────────────────────────────────────────────────
export interface TimelineScene { text: string; durationSec: number; imageHash?: string }
function rec(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}
/** Reads the server's echoed timeline (hashes instead of base64). Null when absent or malformed. */
/** Image digests are metadata only; never used for previews. */
export function readProductionTimeline(data: unknown): TimelineScene[] | null {
  if (!rec(data) || !rec(data.receipt)) return null;
  const r = data.receipt;
  const source = rec(r.effective_controls) && rec(r.effective_controls.production) ? r.effective_controls.production
    : rec(r.production_timeline) ? r.production_timeline : null;
  if (!source || !Array.isArray(source.scenes)) return null;
  const out: TimelineScene[] = [];
  for (const s of source.scenes) {
    if (!rec(s) || typeof s.text !== "string" || typeof s.duration_sec !== "number") return null;
    const d = s.image_b64 ?? s.image_sha256 ?? s.image_hash;
    const hash = typeof d === "string" ? d : rec(d) && typeof d.sha256 === "string" ? d.sha256 : undefined;
    out.push({ text: s.text, durationSec: s.duration_sec, ...(hash ? { imageHash: hash } : {}) });
  }
  return out;
}

// ── Script and captions ───────────────────────────────────────────────────────
export function buildScriptText(p: ProductionProject): string {
  const lines: string[] = [];
  if (p.brief.trim()) lines.push("BRIEF", p.brief.trim(), "");
  lines.push("SCENES");
  let f = 0;
  p.scenes.forEach((s, i) => {
    const end = f + sceneFrames(s.durationSec);
    lines.push(`${i + 1}. [${(f / FPS).toFixed(2)}s - ${(end / FPS).toFixed(2)}s] ${s.text.trim()}`);
    f = end;
  });
  if (p.narration.enabled && p.narration.text.trim()) lines.push("", `NARRATION (${p.narration.voice}, ${p.narration.wpm} wpm)`, p.narration.text.trim());
  return lines.join("\n") + "\n";
}

export function formatSrtTime(frames: number): string {
  const ms = Math.round((frames * 1000) / FPS);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const r = ms % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(r, 3)}`;
}

/** Scene captions (authored on-screen text), boundaries rounded to 24 fps frames. Not a speech transcript. */
export function buildSceneSrt(scenes: Array<{ text: string; durationSec: number }>): string {
  let frames = 0;
  return scenes.map((s, i) => {
    const start = frames;
    frames += sceneFrames(s.durationSec);
    const end = Math.max(start + 1, frames);
    return `${i + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${s.text.trim()}\n`;
  }).join("\n");
}

// ── Portable project file ─────────────────────────────────────────────────────
export function serializeProject(p: ProductionProject): string {
  return JSON.stringify({
    format: PROJECT_FORMAT, version: PROJECT_VERSION, savedAt: new Date().toISOString(),
    project: { ...p, scenes: p.scenes.map(({ id: _id, ...rest }) => rest) },
  }, null, 2);
}

function pick<T extends string>(list: readonly T[], v: unknown): T {
  if (typeof v !== "string" || !list.includes(v as T)) throw new Error("Project file contains an unsupported setting.");
  return v as T;
}
function num(v: unknown, label: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`Project file has an invalid ${label}.`);
  return v;
}
function str(v: unknown, label: string, max: number): string {
  if (typeof v !== "string" || v.length > max) throw new Error(`Project file has an invalid ${label}.`);
  return v;
}

/** Parse and fully validate an imported project. Throws a user-readable error. */
export function parseProject(text: string): ProductionProject {
  if (text.length > MAX_PROJECT_FILE_BYTES * 1.4) throw new Error("Project file is too large.");
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("That file is not valid JSON."); }
  if (!rec(raw) || raw.format !== PROJECT_FORMAT) throw new Error("That file is not a Max Booster production project.");
  if (raw.version !== PROJECT_VERSION) throw new Error("This project was saved by an unsupported version.");
  const p = raw.project;
  if (!rec(p) || !Array.isArray(p.scenes)) throw new Error("Project file is missing its scenes.");
  if (p.scenes.length < MIN_SCENES || p.scenes.length > MAX_SCENES) throw new Error(`Project must have ${MIN_SCENES} to ${MAX_SCENES} scenes.`);
  const scenes: Scene[] = p.scenes.map((s: unknown, i: number) => {
    if (!rec(s)) throw new Error(`Scene ${i + 1} is malformed.`);
    if (s.image !== undefined && !validAsset(s.image)) throw new Error(`Scene ${i + 1} image is invalid or too large.`);
    const img = s.image as MediaAsset | undefined;
    return {
      id: newSceneId(), text: str(s.text, `scene ${i + 1} text`, MAX_SCENE_TEXT), durationSec: num(s.durationSec, `scene ${i + 1} duration`),
      ...(img ? { image: { b64: img.b64, mime: img.mime, name: img.name, bytes: img.bytes, width: img.width, height: img.height } } : {}),
    };
  });
  if (p.logo !== undefined && !validAsset(p.logo)) throw new Error("Project logo is invalid or too large.");
  const n = rec(p.narration) ? p.narration : {};
  const m = rec(p.music) ? p.music : {};
  const logo = p.logo as MediaAsset | undefined;
  const project: ProductionProject = {
    brief: str(p.brief ?? "", "brief", MAX_BRIEF_CHARS),
    platform: str(p.platform ?? "instagram", "platform", 40),
    aspect: pick(Object.keys(ASPECTS) as AspectId[], p.aspect),
    scenes,
    transition: pick(TRANSITIONS, p.transition),
    colorGrade: pick(COLOR_GRADES, p.colorGrade),
    ...(logo ? { logo: { b64: logo.b64, mime: logo.mime, name: logo.name, bytes: logo.bytes, width: logo.width, height: logo.height } } : {}),
    narration: { enabled: n.enabled === true, text: str(n.text ?? "", "narration", MAX_NARRATION_CHARS), voice: pick(VOICES, n.voice ?? "en-us"), wpm: num(n.wpm ?? 150, "narration pace") },
    music: { enabled: m.enabled === true, bpm: num(m.bpm ?? 100, "tempo"), key: str(m.key ?? "C minor", "key", 12), instrument: pick(INSTRUMENTS, m.instrument ?? "piano"), arrangement: pick(ARRANGEMENTS, m.arrangement ?? "structured") },
  };
  if (totalMediaBytes(project) > MAX_TOTAL_IMAGE_BYTES) throw new Error("Project images exceed the 8 MiB total limit.");
  return project;
}

/** True when the project holds authored work worth confirming before replacement. */
export function hasAuthoredWork(p: ProductionProject): boolean {
  return Boolean(p.brief.trim() || p.logo || p.narration.text.trim() || p.scenes.length > 1 ||
    p.scenes.some(s => s.text.trim() || s.image));
}

// ── Undo/redo history ─────────────────────────────────────────────────────────
export interface History<T> { past: T[]; present: T; future: T[] }
export const HISTORY_LIMIT = 50;
export function historyInit<T>(present: T): History<T> { return { past: [], present, future: [] }; }
export function historyPush<T>(h: History<T>, next: T): History<T> {
  if (next === h.present) return h;
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [] };
}
/** Replace present without a new snapshot (coalesces keystrokes in the same field). */
export function historyReplace<T>(h: History<T>, next: T): History<T> { return { ...h, present: next, future: [] }; }
export function historyUndo<T>(h: History<T>): History<T> {
  if (!h.past.length) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}
export function historyRedo<T>(h: History<T>): History<T> {
  if (!h.future.length) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}
