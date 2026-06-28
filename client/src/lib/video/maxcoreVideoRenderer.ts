/**
 * MaxCore Client-Side Video Renderer
 *
 * MaxCore's rendering system is backed by 9TB of social media management,
 * music industry, and paid advertising performance data. Its /api/generate-video
 * API returns rich job metadata (hook, body, cta, template, platform, dimensions)
 * but the resulting /uploads/ URL is always 404 — the file is never written to disk.
 *
 * This renderer renders that metadata through a scene-based, template-specific
 * composition pipeline using Canvas + MediaRecorder, producing a real, playable
 * WebM blob without FFmpeg or server-side work.
 *
 * Each template has its own visual language:
 *   cinematic_promo   — film noir, letterbox, spotlight sweep, grain
 *   lyric_video       — karaoke word-reveal, glow trails, beat sync
 *   music_visualizer  — live EQ bars, waveform, frequency rings
 *   album_promo       — vinyl spin, grooves, sleeve art, tracklist feel
 *   artist_spotlight  — dramatic stage beam, portrait frame, prestige
 *   live_performance  — crowd dots, stage lights, ticket-print
 *   default           — premium editorial with geometric accent shapes
 */

export interface MaxcoreJobMeta {
  hook?: string;
  body?: string;
  cta?: string;
  topic?: string;
  template?: string;
  template_name?: string;
  width?: number;
  height?: number;
  duration?: number;
  aspect_ratio?: string;
  platform?: string;
  artistName?: string;
  bgColor?: string;
  accentColor?: string;
  /** AI-generated hashtags from /api/generate/content */
  hashtags?: string[];
  /** MaxCore content confidence score (0–1) */
  content_confidence?: number | null;
  /** MaxCore sentiment score (0–1) from /api/analyze/sentiment */
  sentiment_score?: number | null;
  /** MaxCore sentiment label e.g. "positive" */
  sentiment_label?: string | null;
}

export interface RenderOptions {
  fps?: number;
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;
}

export interface RenderResult {
  blobUrl: string;
  mimeType: string;
  duration: number;
  width: number;
  height: number;
  revoke: () => void;
}

// ── Photorealistic Palette system ───────────────────────────────────────────

interface Palette {
  bg1: string;
  bg2: string;
  bg3: string;
  bg2Light: string; // secondary/rim light source color
  accent: string;
  accent2: string;
  text: string;
  textDim: string;
  grain: boolean;
  grainAmount: number; // 0–1 grain intensity multiplier
  grainTemp: "warm" | "cool" | "neutral"; // film stock temperature
  shadowTint: string; // hex color pushed into shadow region
  highlightTint: string; // hex color pushed into highlight region
  vignetteStrength: number; // 0–1 lens vignette strength
  keyLightX: number; // 0–1 horizontal key light position
  keyLightY: number; // 0–1 vertical key light position
}

const PALETTES: Record<string, Palette> = {
  cinematic_promo: {
    bg1: "#030206",
    bg2: "#180c2e",
    bg3: "#08040e",
    bg2Light: "#3a1c6e",
    accent: "#c9a84c",
    accent2: "#e8c97a",
    text: "#f5f0e8",
    textDim: "#a09880",
    grain: true,
    grainAmount: 0.07,
    grainTemp: "warm",
    shadowTint: "#0a0618",
    highlightTint: "#c9a84c",
    vignetteStrength: 0.88,
    keyLightX: 0.55,
    keyLightY: 0.38,
  },
  lyric_video: {
    bg1: "#010108",
    bg2: "#04021a",
    bg3: "#020610",
    bg2Light: "#0a0a60",
    accent: "#00e5ff",
    accent2: "#7c4dff",
    text: "#ffffff",
    textDim: "#80d8ff",
    grain: true,
    grainAmount: 0.035,
    grainTemp: "cool",
    shadowTint: "#020410",
    highlightTint: "#00e5ff",
    vignetteStrength: 0.75,
    keyLightX: 0.5,
    keyLightY: 0.45,
  },
  music_visualizer: {
    bg1: "#000408",
    bg2: "#000c28",
    bg3: "#000618",
    bg2Light: "#002060",
    accent: "#00b0ff",
    accent2: "#18ffff",
    text: "#e3f2fd",
    textDim: "#4fc3f7",
    grain: true,
    grainAmount: 0.028,
    grainTemp: "cool",
    shadowTint: "#000820",
    highlightTint: "#00b0ff",
    vignetteStrength: 0.82,
    keyLightX: 0.5,
    keyLightY: 0.35,
  },
  album_promo: {
    bg1: "#0a0400",
    bg2: "#200a00",
    bg3: "#120600",
    bg2Light: "#3a1800",
    accent: "#ff6d00",
    accent2: "#ffab40",
    text: "#fff8f0",
    textDim: "#bf8040",
    grain: true,
    grainAmount: 0.065,
    grainTemp: "warm",
    shadowTint: "#100400",
    highlightTint: "#ff6d00",
    vignetteStrength: 0.9,
    keyLightX: 0.62,
    keyLightY: 0.32,
  },
  artist_spotlight: {
    bg1: "#030003",
    bg2: "#0c000e",
    bg3: "#060008",
    bg2Light: "#280028",
    accent: "#e040fb",
    accent2: "#ea80fc",
    text: "#fce4ff",
    textDim: "#ce93d8",
    grain: true,
    grainAmount: 0.06,
    grainTemp: "warm",
    shadowTint: "#080010",
    highlightTint: "#e040fb",
    vignetteStrength: 0.92,
    keyLightX: 0.45,
    keyLightY: 0.3,
  },
  live_performance: {
    bg1: "#000600",
    bg2: "#001000",
    bg3: "#000600",
    bg2Light: "#002800",
    accent: "#69ff47",
    accent2: "#b2ff59",
    text: "#f1f8e9",
    textDim: "#aed581",
    grain: true,
    grainAmount: 0.05,
    grainTemp: "neutral",
    shadowTint: "#000800",
    highlightTint: "#69ff47",
    vignetteStrength: 0.8,
    keyLightX: 0.5,
    keyLightY: 0.25,
  },
  default: {
    bg1: "#04040c",
    bg2: "#0c0c20",
    bg3: "#04040c",
    bg2Light: "#180830",
    accent: "#7c3aed",
    accent2: "#a855f7",
    text: "#f8f8ff",
    textDim: "#9090c0",
    grain: true,
    grainAmount: 0.04,
    grainTemp: "cool",
    shadowTint: "#04041a",
    highlightTint: "#7c3aed",
    vignetteStrength: 0.78,
    keyLightX: 0.5,
    keyLightY: 0.4,
  },
};

function getPalette(meta: MaxcoreJobMeta): Palette {
  const key = meta.template || meta.template_name || "default";
  const base = PALETTES[key] || PALETTES.default;
  if (meta.bgColor || meta.accentColor) {
    return {
      ...base,
      bg1: meta.bgColor || base.bg1,
      bg2: meta.bgColor || base.bg2,
      bg3: meta.bgColor || base.bg3,
      bg2Light: meta.bgColor || base.bg2Light,
      accent: meta.accentColor || base.accent,
      accent2: meta.accentColor || base.accent2,
    };
  }
  return base;
}

// ── Math helpers ────────────────────────────────────────────────────────────

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const smoothstep = (t: number) => t * t * (3 - 2 * t);
const easeIn = (t: number) => t * t * t;
((t: number) => 1 - Math.pow(1 - t, 3));

function fade(t: number, inEnd: number, outStart: number, outEnd = 1): number {
  if (t < inEnd) return smoothstep(clamp(t / inEnd));
  if (t > outStart)
    return smoothstep(clamp(1 - (t - outStart) / (outEnd - outStart)));
  return 1;
}

// ── Typography helpers ──────────────────────────────────────────────────────

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  alpha: number,
  opts: {
    font: string;
    color: string;
    align?: CanvasTextAlign;
    shadow?: string;
    shadowBlur?: number;
    maxW?: number;
    lineH?: number;
    slide?: number;
  },
): number {
  if (alpha <= 0) return y;
  ctx.save();
  ctx.globalAlpha = clamp(alpha);
  ctx.font = opts.font;
  ctx.fillStyle = opts.color;
  ctx.textAlign = opts.align || "center";
  ctx.textBaseline = "middle";
  if (opts.shadow) {
    ctx.shadowColor = opts.shadow;
    ctx.shadowBlur = opts.shadowBlur || 20;
  }
  const slide = opts.slide || 0;
  if (opts.maxW) {
    const lines = wrapLines(ctx, text, opts.maxW);
    const lh = opts.lineH || parseFloat(opts.font) * 1.3;
    lines.forEach((ln, i) =>
      ctx.fillText(ln, x + slide * (1 - alpha), y + i * lh),
    );
    ctx.restore();
    return y + lines.length * lh;
  }
  ctx.fillText(text, x + slide * (1 - alpha), y);
  ctx.restore();
  return y + (opts.lineH || parseFloat(opts.font) * 1.3);
}

// Word-reveal: show the first N words proportional to reveal [0,1]
function revealedText(text: string, reveal: number): string {
  const words = text.trim().split(" ");
  const count = Math.max(1, Math.ceil(reveal * words.length));
  return words.slice(0, count).join(" ");
}

// ── Photorealistic Film Grain ────────────────────────────────────────────────
// Pre-bakes N grain frames (256×256 Gaussian noise tiles) once at render start.
// Each frame composites the appropriate tile with 'soft-light' blend — pixels
// above 128 lighten, below 128 darken — matching real photochemical grain.

function buildGrainFrames(
  w: number,
  h: number,
  p: Palette,
  count = 8,
): HTMLCanvasElement[] {
  const tileW = Math.min(w, 256);
  const tileH = Math.min(h, 256);
  const rBias =
    p.grainTemp === "warm" ? 1.25 : p.grainTemp === "cool" ? 0.8 : 1.0;
  const bBias =
    p.grainTemp === "warm" ? 0.8 : p.grainTemp === "cool" ? 1.25 : 1.0;
  const sigma = p.grainAmount * 72; // std-dev in luminance units

  return Array.from({ length: count }, (_, fi) => {
    const gc = document.createElement("canvas");
    gc.width = tileW;
    gc.height = tileH;
    const gctx = gc.getContext("2d")!;
    const id = gctx.createImageData(tileW, tileH);
    const d = id.data;

    // LCG PRNG — deterministic per frame index, fast
    let rng = (fi * 2654435761 + 1013904223) >>> 0;
    const rand = (): number => {
      rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
      return rng / 0xffffffff;
    };

    for (let i = 0; i < d.length; i += 4) {
      // Box-Muller Gaussian: two uniform samples → one Gaussian sample
      const u1 = Math.max(1e-10, rand());
      const u2 = rand();
      const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const lum = 128 + g * sigma; // centred at 128 (neutral in soft-light)
      d[i] = Math.max(0, Math.min(255, Math.round(lum * rBias)));
      d[i + 1] = Math.max(0, Math.min(255, Math.round(lum)));
      d[i + 2] = Math.max(0, Math.min(255, Math.round(lum * bBias)));
      d[i + 3] = 255;
    }
    gctx.putImageData(id, 0, 0);
    return gc;
  });
}

function compositeGrain(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  grainFrames: HTMLCanvasElement[],
  frameIndex: number,
  p: Palette,
) {
  if (!p.grain || grainFrames.length === 0) return;
  const tile = grainFrames[frameIndex % grainFrames.length];
  ctx.save();
  ctx.globalAlpha = clamp(p.grainAmount, 0, 1);
  ctx.globalCompositeOperation = "soft-light";
  // Tile the grain texture across the full canvas
  for (let ty = 0; ty < h; ty += tile.height) {
    for (let tx = 0; tx < w; tx += tile.width) {
      ctx.drawImage(tile, tx, ty);
    }
  }
  ctx.restore();
}

// ── Photorealistic Background — multi-layer cinematic depth ─────────────────

function drawCinematicBg(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  p: Palette,
  time: number,
) {
  // Layer 1: base fill — the darkest shadow plane
  ctx.fillStyle = p.bg1;
  ctx.fillRect(0, 0, w, h);

  // Layer 2: atmospheric depth haze (distance falloff toward top)
  const haze = ctx.createLinearGradient(0, h * 0.55, 0, 0);
  haze.addColorStop(0, `${p.bg2}00`);
  haze.addColorStop(1, `${p.bg2}70`);
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, w, h);

  // Layer 3: key light — main directional source, breathes gently
  const kx = w * (p.keyLightX + Math.sin(time * 0.08) * 0.025);
  const ky = h * (p.keyLightY + Math.cos(time * 0.06) * 0.018);
  const kr = Math.max(w, h) * 0.72;
  const key = ctx.createRadialGradient(kx, ky, 0, kx, ky, kr);
  key.addColorStop(0, `${p.bg2}d0`);
  key.addColorStop(0.3, `${p.bg3}80`);
  key.addColorStop(0.7, `${p.bg1}30`);
  key.addColorStop(1, `${p.bg1}00`);
  ctx.fillStyle = key;
  ctx.fillRect(0, 0, w, h);

  // Layer 4: rim/fill light — secondary source from opposite quadrant
  const rx = w * (1.0 - p.keyLightX + Math.cos(time * 0.07) * 0.02);
  const ry = h * (1.0 - p.keyLightY + Math.sin(time * 0.09) * 0.02);
  const rim = ctx.createRadialGradient(
    rx,
    ry,
    0,
    rx,
    ry,
    Math.max(w, h) * 0.55,
  );
  rim.addColorStop(0, `${p.bg2Light}50`);
  rim.addColorStop(0.45, `${p.bg2Light}20`);
  rim.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = rim;
  ctx.fillRect(0, 0, w, h);

  // Layer 5: specular micro-caustic (very subtle animated highlight shimmer)
  const sx = w * (0.5 + Math.sin(time * 0.13) * 0.3);
  const sy = h * (0.2 + Math.cos(time * 0.11) * 0.1);
  const spec = ctx.createRadialGradient(sx, sy, 0, sx, sy, w * 0.18);
  spec.addColorStop(0, `${p.bg2Light}22`);
  spec.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = spec;
  ctx.fillRect(0, 0, w, h);
}

// ── Photographic Lens Vignette ───────────────────────────────────────────────
// Non-linear falloff from centre — matches real lens optical characteristics.

function drawVignette(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  strength: number,
) {
  if (strength <= 0) return;
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.sqrt(cx * cx + cy * cy);

  // Inner clear zone at 28% radius; darkening accelerates toward edge
  const vig = ctx.createRadialGradient(cx, cy, r * 0.28, cx, cy, r * 1.18);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(0.45, `rgba(0,0,0,${(strength * 0.18).toFixed(3)})`);
  vig.addColorStop(0.72, `rgba(0,0,0,${(strength * 0.48).toFixed(3)})`);
  vig.addColorStop(1, `rgba(0,0,0,${(strength * 0.82).toFixed(3)})`);

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// ── Split-Tone Color Grade ───────────────────────────────────────────────────
// Cinema-standard shadow/highlight split toning via GPU compositing modes.
// multiply pushes color into shadows; screen lifts highlights.

function applyColorGrade(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  p: Palette,
  time: number,
) {
  ctx.save();

  // Shadow tint — multiply a gradient from mid-frame down
  const shadowGrd = ctx.createLinearGradient(0, h * 0.42, 0, h);
  shadowGrd.addColorStop(0, `${p.shadowTint}00`);
  shadowGrd.addColorStop(1, `${p.shadowTint}88`);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = shadowGrd;
  ctx.fillRect(0, 0, w, h);

  // Highlight tint — screen a radial bloom near the key light position
  const hkx = w * (p.keyLightX + Math.sin(time * 0.08) * 0.02);
  const hky = h * (p.keyLightY + Math.cos(time * 0.06) * 0.02);
  const hlGrd = ctx.createRadialGradient(
    hkx,
    hky,
    0,
    hkx,
    hky,
    Math.max(w, h) * 0.55,
  );
  hlGrd.addColorStop(0, `${p.highlightTint}28`);
  hlGrd.addColorStop(0.5, `${p.highlightTint}10`);
  hlGrd.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = hlGrd;
  ctx.fillRect(0, 0, w, h);

  // Micro-contrast lift — soft overlay to push S-curve depth
  const contrastGrd = ctx.createRadialGradient(
    w / 2,
    h / 2,
    0,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.6,
  );
  contrastGrd.addColorStop(0, "rgba(255,255,255,0.03)");
  contrastGrd.addColorStop(1, "rgba(0,0,0,0.06)");
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = contrastGrd;
  ctx.fillRect(0, 0, w, h);

  ctx.restore();
}

// ── Legacy linear bg (kept for scene variants that use it) ──────────────────

function drawRadialBg(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  p: Palette,
  time: number,
) {
  drawCinematicBg(ctx, w, h, p, time);
}

function drawLinearBg(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  p: Palette,
  t: number,
) {
  drawCinematicBg(ctx, w, h, p, t);
}

// ── Platform overlay ────────────────────────────────────────────────────────

function drawPlatformChrome(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  platform: string,
  t: number, // normalised [0,1]
  accent: string,
) {
  ctx.save();
  switch (platform) {
    case "tiktok": {
      // Scrubber bar at bottom
      const barH = Math.max(2, h * 0.006);
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fillRect(0, h - barH * 4, w, barH);
      ctx.fillStyle = accent;
      ctx.fillRect(0, h - barH * 4, w * t, barH);
      // Right-side icon dots (profile pic placeholder)
      const dotR = w * 0.04;
      const dotX = w - dotR - w * 0.04;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(dotX, h * 0.55 + i * dotR * 2.8, dotR, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.fill();
      }
      break;
    }
    case "instagram": {
      // Top stories ring
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(2, w * 0.006);
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.06, w * 0.055, 0, Math.PI * 2 * t);
      ctx.stroke();
      break;
    }
    case "youtube": {
      // Letterbox top/bottom bars (16:9 cinematic crop hint)
      const lbH = h * 0.04;
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(0, 0, w, lbH);
      ctx.fillRect(0, h - lbH, w, lbH);
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

// ── Scene: INTRO ────────────────────────────────────────────────────────────
// Branded cold open — artist name reveals from center, accent line draws in

function drawIntroScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  meta: MaxcoreJobMeta,
  p: Palette,
  t: number, // scene progress [0,1]
  time: number,
  base: number,
) {
  drawRadialBg(ctx, w, h, p, time);

  const cx = w / 2;
  const cy = h / 2;

  // Expanding ring
  for (let ring = 0; ring < 4; ring++) {
    const phase = clamp(t * 1.5 - ring * 0.15);
    const r = phase * Math.min(w, h) * (0.25 + ring * 0.08);
    const alpha = (1 - phase) * (0.35 - ring * 0.06);
    if (alpha <= 0) continue;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = Math.max(1, (4 - ring) * w * 0.003);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Accent line
  const lineAlpha = clamp((t - 0.1) * 3);
  if (lineAlpha > 0) {
    const lineW = w * 0.3 * smoothstep(clamp((t - 0.1) * 4));
    ctx.save();
    ctx.globalAlpha = lineAlpha;
    ctx.fillStyle = p.accent;
    ctx.fillRect(cx - lineW / 2, cy - h * 0.01, lineW, h * 0.003);
    ctx.restore();
  }

  // Artist / brand name
  const nameAlpha = clamp((t - 0.2) * 4);
  const artist = meta.artistName || meta.topic || "";
  if (artist && nameAlpha > 0) {
    const fs = Math.round(base * 1.1);
    drawText(ctx, artist.toUpperCase(), cx, cy + h * 0.07, nameAlpha, {
      font: `700 ${fs}px 'Inter', system-ui, sans-serif`,
      color: p.text,
      shadow: p.accent,
      shadowBlur: 30,
      slide: w * 0.05,
    });
  }

  // Tagline
  const tagAlpha = clamp((t - 0.35) * 3);
  const tag = meta.hook
    ? meta.hook.split(" ").slice(0, 5).join(" ")
    : "NEW RELEASE";
  if (tagAlpha > 0) {
    const fs = Math.round(base * 0.55);
    drawText(ctx, tag.toUpperCase(), cx, cy + h * 0.14, tagAlpha * 0.7, {
      font: `400 ${fs}px 'Inter', system-ui, sans-serif`,
      color: p.textDim,
      slide: w * 0.03,
    });
  }
}

// ── Scene: HOOK ─────────────────────────────────────────────────────────────
// The money frame — big bold hook text dominates, kinetic typography

function drawHookScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  meta: MaxcoreJobMeta,
  p: Palette,
  t: number,
  time: number,
  base: number,
  template: string,
) {
  drawLinearBg(ctx, w, h, p, time);

  const cx = w / 2;
  const isVertical = h > w;

  // Template-specific hook bg treatment
  if (template === "cinematic_promo" || template === "artist_spotlight") {
    // Letterbox bars
    const lbH = h * 0.08;
    const lbAlpha = smoothstep(clamp(t * 3));
    ctx.save();
    ctx.globalAlpha = lbAlpha * 0.9;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, w, lbH);
    ctx.fillRect(0, h - lbH, w, lbH);
    ctx.restore();

    // Spotlight sweep
    const spotX = w * (0.2 + Math.sin(time * 0.4) * 0.15);
    const spotGrd = ctx.createRadialGradient(spotX, 0, 0, spotX, 0, h * 1.2);
    spotGrd.addColorStop(0, "rgba(255,240,200,0.12)");
    spotGrd.addColorStop(0.4, "rgba(255,220,100,0.04)");
    spotGrd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = spotGrd;
    ctx.fillRect(0, 0, w, h);
  }

  if (template === "music_visualizer") {
    // EQ bars in background
    const barCount = 32;
    const barW = w / barCount;
    ctx.save();
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < barCount; i++) {
      const h2 = h * (0.1 + Math.abs(Math.sin(i * 1.3 + time * 4)) * 0.35);
      const grd = ctx.createLinearGradient(0, h, 0, h - h2);
      grd.addColorStop(0, p.accent2);
      grd.addColorStop(1, "transparent");
      ctx.fillStyle = grd;
      ctx.fillRect(i * barW, h - h2, barW - 2, h2);
    }
    ctx.restore();
  }

  if (template === "lyric_video") {
    // Glow trail behind text position
    const glowGrd = ctx.createRadialGradient(
      cx,
      h * 0.42,
      0,
      cx,
      h * 0.42,
      w * 0.5,
    );
    glowGrd.addColorStop(0, `${p.accent}28`);
    glowGrd.addColorStop(1, "transparent");
    ctx.fillStyle = glowGrd;
    ctx.fillRect(0, 0, w, h);
  }

  // Hook text — word-reveal
  const hook = meta.hook || meta.topic || "Your Sound. Your Story.";
  const reveal = smoothstep(clamp(t * 1.8));
  const hookText = revealedText(hook, reveal);
  const hookAlpha = smoothstep(clamp(t * 3));

  const hfs = Math.round(base * (isVertical ? 1.5 : 1.3));
  const hookY = isVertical ? h * 0.38 : h * 0.4;
  const pad = w * 0.08;

  ctx.save();
  ctx.globalAlpha = hookAlpha;
  ctx.font = `900 ${hfs}px 'Inter', system-ui, sans-serif`;
  ctx.fillStyle = p.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = p.accent;
  ctx.shadowBlur = 40;

  const lines = wrapLines(ctx, hookText.toUpperCase(), w - pad * 2);
  const lh = hfs * 1.15;
  const totalH = lines.length * lh;
  lines.forEach((ln, i) => {
    ctx.fillText(ln, cx, hookY - totalH / 2 + i * lh);
  });
  ctx.restore();

  // Accent underline beneath last line
  if (hookAlpha > 0.5) {
    const lastLineW = ctx.measureText(lines[lines.length - 1] || "").width;
    const underY = hookY + totalH / 2 + hfs * 0.2;
    const ulAlpha = smoothstep(clamp((t - 0.3) * 3));
    const ulW = lastLineW * smoothstep(clamp((t - 0.3) * 4));
    ctx.save();
    ctx.globalAlpha = ulAlpha;
    ctx.fillStyle = p.accent;
    ctx.fillRect(cx - ulW / 2, underY, ulW, Math.max(2, hfs * 0.04));
    ctx.restore();
  }

  // Artist small watermark
  const artist = meta.artistName || "";
  if (artist) {
    const afs = Math.round(base * 0.5);
    drawText(ctx, artist, w - w * 0.06, h - h * 0.04, hookAlpha * 0.45, {
      font: `500 ${afs}px 'Inter', system-ui, sans-serif`,
      color: p.textDim,
      align: "right",
    });
  }
}

// ── Scene: BODY ─────────────────────────────────────────────────────────────
// Supporting copy with visual backdrop — template-specific centrepiece

function drawBodyScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  meta: MaxcoreJobMeta,
  p: Palette,
  t: number,
  time: number,
  base: number,
  template: string,
) {
  drawLinearBg(ctx, w, h, p, time);
  const cx = w / 2;
  const isVertical = h > w;

  // Template centrepiece
  if (template === "music_visualizer") {
    // Full EQ visualizer
    const barCount = 48;
    const barW = (w * 0.85) / barCount;
    const startX = w * 0.075;
    const maxBarH = h * 0.35;
    const baseY = h * (isVertical ? 0.72 : 0.7);
    for (let i = 0; i < barCount; i++) {
      const freq = Math.abs(
        Math.sin(i * 0.4 + time * 6) * 0.5 +
          Math.sin(i * 0.15 + time * 3.7) * 0.3 +
          Math.sin(i * 0.07 + time * 1.8) * 0.2,
      );
      const bh = freq * maxBarH * smoothstep(clamp(t * 2));
      const grd = ctx.createLinearGradient(0, baseY, 0, baseY - bh);
      grd.addColorStop(0, p.accent + "40");
      grd.addColorStop(0.6, p.accent);
      grd.addColorStop(1, p.accent2);
      ctx.fillStyle = grd;
      const rx = startX + i * (barW + 1);
      ctx.fillRect(rx, baseY - bh, barW, bh);
    }
  }

  if (template === "album_promo") {
    // Spinning vinyl record
    const vinylR = Math.min(w, h) * (isVertical ? 0.22 : 0.28);
    const vinylCX = isVertical ? cx : w * 0.72;
    const vinylCY = isVertical ? h * 0.35 : h * 0.5;
    const rot = time * 1.5;

    ctx.save();
    ctx.translate(vinylCX, vinylCY);
    ctx.rotate(rot);

    // Outer disc
    ctx.beginPath();
    ctx.arc(0, 0, vinylR, 0, Math.PI * 2);
    ctx.fillStyle = "#111";
    ctx.fill();

    // Grooves
    ctx.globalAlpha = 0.5;
    for (let g = 1; g <= 6; g++) {
      ctx.beginPath();
      ctx.arc(0, 0, vinylR * (0.4 + g * 0.09), 0, Math.PI * 2);
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Label
    ctx.globalAlpha = 1;
    const labelR = vinylR * 0.28;
    ctx.beginPath();
    ctx.arc(0, 0, labelR, 0, Math.PI * 2);
    ctx.fillStyle = p.accent;
    ctx.fill();

    // Centre hole
    ctx.beginPath();
    ctx.arc(0, 0, vinylR * 0.03, 0, Math.PI * 2);
    ctx.fillStyle = "#000";
    ctx.fill();

    ctx.restore();

    // Sheen
    ctx.save();
    const sheen = ctx.createLinearGradient(
      vinylCX - vinylR,
      vinylCY - vinylR,
      vinylCX + vinylR * 0.3,
      vinylCY + vinylR * 0.3,
    );
    sheen.addColorStop(0, "rgba(255,255,255,0.08)");
    sheen.addColorStop(0.5, "rgba(255,255,255,0)");
    ctx.fillStyle = sheen;
    ctx.beginPath();
    ctx.arc(vinylCX, vinylCY, vinylR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (template === "live_performance") {
    // Stage lights beaming down
    const beamCount = 5;
    for (let b = 0; b < beamCount; b++) {
      const bx = w * (0.1 + (b / (beamCount - 1)) * 0.8);
      const bAlpha =
        (0.06 + Math.abs(Math.sin(time * 1.2 + b)) * 0.06) *
        smoothstep(clamp(t * 2));
      const grd = ctx.createLinearGradient(bx, 0, bx, h * 0.75);
      grd.addColorStop(
        0,
        `${b % 2 === 0 ? p.accent : p.accent2}${Math.round(bAlpha * 255)
          .toString(16)
          .padStart(2, "0")}`,
      );
      grd.addColorStop(1, "transparent");
      ctx.fillStyle = grd;
      ctx.save();
      ctx.beginPath();
      const spread = w * 0.08;
      ctx.moveTo(bx - spread * 0.1, 0);
      ctx.lineTo(bx + spread * 0.1, 0);
      ctx.lineTo(bx + spread, h * 0.75);
      ctx.lineTo(bx - spread, h * 0.75);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Crowd dots
    const dotCount = 60;
    ctx.save();
    ctx.globalAlpha = 0.15 * smoothstep(clamp((t - 0.2) * 3));
    for (let d = 0; d < dotCount; d++) {
      const dx = (d / dotCount) * w;
      const dy = h * (0.78 + Math.sin(d * 7.3) * 0.06);
      const dr = w * 0.008 + Math.abs(Math.sin(d * 2.1 + time * 3)) * w * 0.006;
      ctx.beginPath();
      ctx.arc(dx, dy, dr, 0, Math.PI * 2);
      ctx.fillStyle = p.text;
      ctx.fill();
    }
    ctx.restore();
  }

  if (template === "artist_spotlight") {
    // Single dramatic beam
    const beamGrd = ctx.createLinearGradient(cx, 0, cx, h * 0.7);
    beamGrd.addColorStop(0, `${p.accent}30`);
    beamGrd.addColorStop(1, "transparent");
    ctx.save();
    const spread = w * 0.3;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.02, 0);
    ctx.lineTo(cx + w * 0.02, 0);
    ctx.lineTo(cx + spread, h * 0.7);
    ctx.lineTo(cx - spread, h * 0.7);
    ctx.closePath();
    ctx.fillStyle = beamGrd;
    ctx.fill();
    ctx.restore();
  }

  // Body copy text
  const body = meta.body || "";
  const bodyAlpha = fade(t, 0.15, 0.85);
  if (body && bodyAlpha > 0) {
    const bfs = Math.round(base * 0.78);
    const textY = isVertical ? h * 0.58 : h * 0.55;
    const padX = w * 0.1;
    ctx.save();
    ctx.globalAlpha = bodyAlpha;
    ctx.font = `400 ${bfs}px 'Inter', system-ui, sans-serif`;
    ctx.fillStyle = p.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = p.bg1;
    ctx.shadowBlur = 10;
    const lines = wrapLines(ctx, body, w - padX * 2);
    const lh = bfs * 1.55;
    lines.slice(0, 3).forEach((ln, i) => {
      const rowAlpha = smoothstep(clamp((t - 0.12 - i * 0.08) * 5));
      ctx.globalAlpha = bodyAlpha * rowAlpha;
      ctx.fillText(ln, cx, textY + i * lh);
    });
    ctx.restore();
  }

  // Accent geometry — template-specific accent shapes
  if (template === "lyric_video") {
    // Horizontal lines that pulse
    const lineAlpha = smoothstep(clamp(t * 2)) * 0.3;
    ctx.save();
    ctx.globalAlpha = lineAlpha;
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const ly = h * (0.25 + i * 0.15) + Math.sin(time * 1.5 + i) * h * 0.01;
      ctx.globalAlpha = lineAlpha * (1 - i * 0.25);
      ctx.beginPath();
      ctx.moveTo(0, ly);
      ctx.lineTo(w, ly);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Small hook reminder at top
  const hook = meta.hook || "";
  if (hook) {
    const hRemindAlpha = smoothstep(clamp(t * 2)) * 0.5;
    const hrfs = Math.round(base * 0.5);
    drawText(
      ctx,
      hook.split(" ").slice(0, 5).join(" ").toUpperCase(),
      cx,
      h * 0.08,
      hRemindAlpha,
      {
        font: `700 ${hrfs}px 'Inter', system-ui, sans-serif`,
        color: p.accent,
      },
    );
  }
}

// ── Scene: CTA ──────────────────────────────────────────────────────────────
// Conversion scene — button, urgency, final ask

function drawCtaScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  meta: MaxcoreJobMeta,
  p: Palette,
  t: number,
  time: number,
  base: number,
) {
  drawRadialBg(ctx, w, h, p, time);
  const cx = w / 2;
  const isVertical = h > w;

  // Pulsating background glow
  const pulseR = Math.min(w, h) * (0.3 + Math.sin(time * 2) * 0.05);
  const grd = ctx.createRadialGradient(cx, h * 0.5, 0, cx, h * 0.5, pulseR);
  grd.addColorStop(0, `${p.accent}25`);
  grd.addColorStop(1, "transparent");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);

  // Hook summary
  const hook = meta.hook || meta.topic || "";
  if (hook) {
    const hAlpha = smoothstep(clamp(t * 3));
    const hfs = Math.round(base * 0.9);
    const hookY = isVertical ? h * 0.3 : h * 0.28;
    ctx.save();
    ctx.globalAlpha = hAlpha;
    ctx.font = `800 ${hfs}px 'Inter', system-ui, sans-serif`;
    ctx.fillStyle = p.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = p.accent;
    ctx.shadowBlur = 25;
    const lines = wrapLines(ctx, hook.toUpperCase(), w * 0.8);
    lines
      .slice(0, 2)
      .forEach((ln, i) => ctx.fillText(ln, cx, hookY + i * hfs * 1.2));
    ctx.restore();
  }

  // CTA pill button
  const cta = meta.cta || "Listen Now";
  const ctaAlpha = smoothstep(clamp((t - 0.2) * 4));
  if (ctaAlpha > 0) {
    const btnW = Math.min(w * 0.72, 380 * (w / 1080));
    const btnH = base * 2.4;
    const btnX = cx - btnW / 2;
    const btnY = isVertical ? h * 0.55 : h * 0.52;
    const btnR = btnH / 2;

    // Pulse ring behind button
    const ringScale = 1 + Math.sin(time * 3) * 0.04;
    ctx.save();
    ctx.globalAlpha = ctaAlpha * 0.35;
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = Math.max(1, w * 0.005);
    ctx.beginPath();
    ctx.ellipse(
      cx,
      btnY,
      (btnW / 2) * ringScale + btnH * 0.3,
      (btnH / 2) * ringScale + btnH * 0.3,
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    ctx.restore();

    // Button fill — gradient
    const btnGrd = ctx.createLinearGradient(
      btnX,
      btnY - btnH / 2,
      btnX + btnW,
      btnY + btnH / 2,
    );
    btnGrd.addColorStop(0, p.accent);
    btnGrd.addColorStop(1, p.accent2);

    ctx.save();
    ctx.globalAlpha = ctaAlpha;
    ctx.shadowColor = p.accent;
    ctx.shadowBlur = 30;

    ctx.beginPath();
    ctx.moveTo(btnX + btnR, btnY - btnH / 2);
    ctx.lineTo(btnX + btnW - btnR, btnY - btnH / 2);
    ctx.arcTo(btnX + btnW, btnY - btnH / 2, btnX + btnW, btnY, btnR);
    ctx.lineTo(btnX + btnW, btnY + btnH / 2 - btnR);
    ctx.arcTo(
      btnX + btnW,
      btnY + btnH / 2,
      btnX + btnW - btnR,
      btnY + btnH / 2,
      btnR,
    );
    ctx.lineTo(btnX + btnR, btnY + btnH / 2);
    ctx.arcTo(btnX, btnY + btnH / 2, btnX, btnY, btnR);
    ctx.lineTo(btnX, btnY - btnH / 2 + btnR);
    ctx.arcTo(btnX, btnY - btnH / 2, btnX + btnR, btnY - btnH / 2, btnR);
    ctx.closePath();
    ctx.fillStyle = btnGrd;
    ctx.fill();

    // Button text
    ctx.shadowBlur = 0;
    ctx.font = `700 ${Math.round(base * 0.78)}px 'Inter', system-ui, sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(cta, cx, btnY);
    ctx.restore();
  }

  // Artist and platform signal
  const artist = meta.artistName || "";
  if (artist) {
    const aAlpha = smoothstep(clamp((t - 0.35) * 3)) * 0.65;
    const afs = Math.round(base * 0.52);
    drawText(ctx, artist, cx, isVertical ? h * 0.74 : h * 0.72, aAlpha, {
      font: `600 ${afs}px 'Inter', system-ui, sans-serif`,
      color: p.textDim,
    });
  }

  // AI-generated hashtags from MaxCore /api/generate/content
  const tags = meta.hashtags.slice(0, 5) || [];
  if (tags.length > 0) {
    const tagAlpha = smoothstep(clamp((t - 0.45) * 3)) * 0.7;
    const tfs = Math.round(base * 0.42);
    const tagLine = tags.join("  ");
    const tagY = isVertical ? h * 0.83 : h * 0.81;
    ctx.save();
    ctx.globalAlpha = tagAlpha;
    ctx.font = `500 ${tfs}px 'Inter', system-ui, sans-serif`;
    ctx.fillStyle = p.accent;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = p.accent;
    ctx.shadowBlur = 8;
    ctx.fillText(tagLine, cx, tagY);
    ctx.restore();
  }
}

// ── Scene: OUTRO ────────────────────────────────────────────────────────────
// Final brand lock-up — rings collapse inward, logo/name fades out

function drawOutroScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  meta: MaxcoreJobMeta,
  p: Palette,
  t: number,
  time: number,
  base: number,
) {
  ctx.fillStyle = p.bg1;
  ctx.fillRect(0, 0, w, h);

  // Slowly fading glow
  const glowAlpha = (1 - t) * 0.5;
  const grd = ctx.createRadialGradient(
    w / 2,
    h / 2,
    0,
    w / 2,
    h / 2,
    Math.min(w, h) * 0.4,
  );
  grd.addColorStop(
    0,
    `${p.accent}${Math.round(glowAlpha * 255)
      .toString(16)
      .padStart(2, "0")}`,
  );
  grd.addColorStop(1, "transparent");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);

  // Collapsing rings
  for (let ring = 0; ring < 3; ring++) {
    const phase = clamp(t + ring * 0.15);
    const maxR = Math.min(w, h) * (0.35 - ring * 0.06);
    const r = maxR * (1 - easeIn(phase));
    if (r <= 0) continue;
    ctx.save();
    ctx.globalAlpha = (1 - phase) * 0.4;
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = Math.max(1, w * 0.004);
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Brand name
  const artist = meta.artistName || "";
  const fadeOut = smoothstep(clamp(1 - t * 1.5));
  if (artist && fadeOut > 0) {
    const afs = Math.round(base * 0.9);
    drawText(ctx, artist.toUpperCase(), w / 2, h / 2, fadeOut, {
      font: `700 ${afs}px 'Inter', system-ui, sans-serif`,
      color: p.text,
      shadow: p.accent,
      shadowBlur: 20,
    });
  }
}

// ── Master frame router ─────────────────────────────────────────────────────
// Divides the timeline into 5 scenes and routes each frame to its renderer.
//
//   0%  – 12%   INTRO        brand cold open
//  10%  – 40%   HOOK         big typography
//  35%  – 68%   BODY         supporting content
//  62%  – 88%   CTA          conversion
//  84%  – 100%  OUTRO        lock-up

interface Scene {
  start: number;
  end: number;
  draw: (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    localT: number,
    time: number,
  ) => void;
}

function buildScenes(
  w: number,
  h: number,
  meta: MaxcoreJobMeta,
  p: Palette,
  base: number,
  template: string,
): Scene[] {
  return [
    {
      start: 0,
      end: 0.14,
      draw: (ctx, w, _h, lt, time) =>
        drawIntroScene(ctx, w, h, meta, p, lt, time, base),
    },
    {
      start: 0.1,
      end: 0.44,
      draw: (ctx, w, _h, lt, time) =>
        drawHookScene(ctx, w, h, meta, p, lt, time, base, template),
    },
    {
      start: 0.38,
      end: 0.7,
      draw: (ctx, w, _h, lt, time) =>
        drawBodyScene(ctx, w, h, meta, p, lt, time, base, template),
    },
    {
      start: 0.64,
      end: 0.88,
      draw: (ctx, w, _h, lt, time) =>
        drawCtaScene(ctx, w, h, meta, p, lt, time, base),
    },
    {
      start: 0.84,
      end: 1.0,
      draw: (ctx, w, _h, lt, time) =>
        drawOutroScene(ctx, w, h, meta, p, lt, time, base),
    },
  ];
}

// Blend alpha for a scene given global progress t
function sceneAlpha(scene: Scene, t: number): number {
  const { start, end } = scene;
  const w = end - start;
  if (t < start || t > end) return 0;
  const lt = (t - start) / w;
  const fadeW = Math?.min(0.15, w * 0.3);
  const inA = lt < fadeW / w ? lt / (fadeW / w) : 1;
  const outA = lt > 1 - fadeW / w ? (1 - lt) / (fadeW / w) : 1;
  return Math?.min(inA, outA);
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  meta: MaxcoreJobMeta,
  p: Palette,
  scenes: Scene[],
  t: number,
  time: number,
  fps: number,
  grainFrames?: HTMLCanvasElement[],
) {

  // Determine dominant scene (highest alpha)
  let dominantScene = scenes[0];
  let dominantA = 0;
  for (const s of scenes) {
    const a = sceneAlpha(s, t);
    if (a > dominantA) {
      dominantA = a;
      dominantScene = s;
    }
  }

  // Draw dominant scene as base
  const domStart = dominantScene?.start;
  const domEnd = dominantScene?.end;
  const domLocal = domEnd > domStart ? (t - domStart) / (domEnd - domStart) : 0;
  dominantScene?.draw(ctx, w, h, clamp(domLocal), time);

  // Overlay blending scenes
  for (const s of scenes) {
    if (s === dominantScene) continue;
    const a = sceneAlpha(s, t);
    if (a <= 0.02) continue;
    const ls = s?.start;
    const le = s?.end;
    const lt = le > ls ? (t - ls) / (le - ls) : 0;

    const offscreen = document?.createElement("canvas");
    offscreen.width = w;
    offscreen.height = h;
    const octx = offscreen?.getContext("2d")!;
    s?.draw(octx, w, h, clamp(lt), time);
    ctx?.save();
    ctx.globalAlpha = a;
    ctx?.drawImage(offscreen, 0, 0);
    ctx?.restore();
  }

  // Platform chrome on top
  drawPlatformChrome(ctx, w, h, meta?.platform || "", t, p?.accent);

  // ── Post-processing stack (always applied, order matters) ──────────────
  // 1. Split-tone color grade (shadow tint + highlight tint + S-curve lift)
  applyColorGrade(ctx, w, h, p, time);

  // 2. Lens vignette — physically-based edge darkening
  drawVignette(ctx, w, h, p?.vignetteStrength);

  // 3. Photorealistic film grain (pre-baked Gaussian, soft-light blend)
  if (grainFrames) {
    compositeGrain(ctx, w, h, grainFrames, Math?.floor(time * fps), p);
  }

  // Global fade in / out
  if (t < 0.04) {
    ctx.fillStyle = "#000";
    ctx.globalAlpha = 1 - t / 0.04;
    ctx?.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
  if (t > 0.94) {
    ctx.fillStyle = "#000";
    ctx.globalAlpha = (t - 0.94) / 0.06;
    ctx?.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Render a promotional video from MaxCore job metadata.
 * Returns a blob URL pointing to a real WebM/MP4 video.
 */
export async function renderMaxcoreVideo(
  meta: MaxcoreJobMeta,
  opts: RenderOptions = {},
): Promise<RenderResult> {
  const { fps = 30, onProgress, signal } = opts;

  const duration = Math?.max(3, Math?.min(60, meta?.duration || 10));

  // Cap canvas resolution for browser performance
  const rawW = meta?.width || (meta?.aspect_ratio === "16:9" ? 1920 : 1080);
  const rawH = meta?.height || (meta?.aspect_ratio === "16:9" ? 1080 : 1920);
  const scale = Math?.min(1, 1280 / Math?.max(rawW, rawH));
  const W = Math?.round(rawW * scale);
  const H = Math?.round(rawH * scale);

  const p = getPalette(meta);
  const base = Math?.max(14, Math?.round(W * 0.045));
  const template = meta?.template || meta?.template_name || "default";
  const totalFrames = Math?.ceil(duration * fps);

  const scenes = buildScenes(W, H, meta, p, base, template);

  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4",
  ];
  const mimeType =
    candidates?.find((m) => MediaRecorder?.isTypeSupported(m)) || "video/webm";

  const canvas = document?.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas?.getContext("2d")!;

  // Pre-bake 8 Gaussian film grain frames before render starts (one-time cost)
  const grainFrames = p?.grain ? buildGrainFrames(W, H, p) : [];

  const stream = canvas?.captureStream(fps);
  const chunks: Blob[] = [];

  // Bitrate: photorealistic quality requires higher data budget
  // Target ~0.14 bits per pixel per frame — matches broadcast quality
  const targetBps = Math?.min(20_000_000, W * H * fps * 0.14);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: targetBps,
  });

  recorder.ondataavailable = (e) => {
    if (e?.data.size > 0) chunks?.push(e?.data);
  };

  const blobReady = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    recorder.onerror = (e) =>
      reject(
        new Error(
          `MediaRecorder error: ${(e as Record<string, unknown>).error?.message || "unknown"}`,
        ),
      );
  });

  recorder?.start(100);

  const frameDurationMs = 1000 / fps;

  for (let frame = 0; frame <= totalFrames; frame++) {
    if (signal?.aborted) {
      recorder?.stop();
      throw new Error("Render aborted");
    }

    const frameStart = performance?.now();
    const t = frame / totalFrames;
    const time = frame / fps;

    drawFrame(ctx, W, H, meta, p, scenes, t, time, fps, grainFrames);
    onProgress?.(Math?.round(t * 95));

    const elapsed = performance?.now() - frameStart;
    const wait = Math?.max(0, frameDurationMs - elapsed);
    await new Promise<void>((r) => setTimeout(r, wait));
  }

  recorder?.stop();
  const blob = await blobReady;
  onProgress?.(100);

  const blobUrl = URL?.createObjectURL(blob);
  return {
    blobUrl,
    mimeType,
    duration,
    width: W,
    height: H,
    revoke: () => URL?.revokeObjectURL(blobUrl),
  };
}
