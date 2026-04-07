/**
 * MaxCore Client-Side Video Renderer
 *
 * MaxCore's /api/generate-video API successfully returns job metadata
 * (hook, body, cta, template, dimensions, duration) but the `/uploads/`
 * URL it provides always returns 404 — the server never writes the file.
 *
 * This renderer fills that gap: it takes the MaxCore job metadata and
 * uses the browser's Canvas + MediaRecorder APIs to produce a real,
 * playable video blob — no FFmpeg, no server-side rendering.
 *
 * The output is a WebM (or MP4 if the browser supports it) blob URL
 * that can be passed directly to a <video> tag.
 */

export interface MaxcoreJobMeta {
  hook?:            string;
  body?:            string;
  cta?:             string;
  topic?:           string;
  template?:        string;
  template_name?:   string;
  width?:           number;
  height?:          number;
  duration?:        number;
  aspect_ratio?:    string;
  platform?:        string;
  artistName?:      string;
  bgColor?:         string;
  accentColor?:     string;
}

export interface RenderOptions {
  fps?:        number;
  onProgress?: (pct: number) => void;
  signal?:     AbortSignal;
}

export interface RenderResult {
  blobUrl:   string;
  mimeType:  string;
  duration:  number;
  width:     number;
  height:    number;
  revoke:    () => void;
}

// ── Template colour palettes ───────────────────────────────────────────────

const TEMPLATE_PALETTES: Record<string, { bg: string[]; accent: string; text: string }> = {
  cinematic_promo:   { bg: ['#0a0a1a', '#1a0a2e', '#0d0d1a'], accent: '#e94560', text: '#ffffff' },
  lyric_video:       { bg: ['#0d0d0d', '#1a1a1a', '#0d1a0d'], accent: '#00ff88', text: '#ffffff' },
  music_visualizer:  { bg: ['#000011', '#001133', '#000022'], accent: '#00aaff', text: '#ffffff' },
  album_promo:       { bg: ['#1a0000', '#330a00', '#1a0a00'], accent: '#ff6600', text: '#ffffff' },
  artist_spotlight:  { bg: ['#0a000a', '#1a001a', '#0d000d'], accent: '#cc00ff', text: '#ffffff' },
  live_performance:  { bg: ['#001a00', '#002200', '#001100'], accent: '#00ff44', text: '#ffffff' },
  default:           { bg: ['#0a0a1a', '#1a1a2e', '#0a0a1a'], accent: '#7c3aed', text: '#ffffff' },
};

function getPalette(template?: string, bgColor?: string, accentColor?: string) {
  const base = TEMPLATE_PALETTES[template || 'default'] || TEMPLATE_PALETTES.default;
  return {
    bg:     bgColor ? [bgColor, bgColor, bgColor] : base.bg,
    accent: accentColor || base.accent,
    text:   base.text,
  };
}

// ── Canvas drawing helpers ─────────────────────────────────────────────────

function drawGradientBackground(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  colors: string[],
  time: number,
) {
  const shift = (Math.sin(time * 0.3) + 1) / 2;
  const grd = ctx.createLinearGradient(0, 0, w * shift, h);
  grd.addColorStop(0, colors[0]);
  grd.addColorStop(0.5, colors[1 % colors.length]);
  grd.addColorStop(1, colors[2 % colors.length]);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);
}

function drawParticles(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  accent: string,
  time: number,
  count = 30,
) {
  ctx.save();
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < count; i++) {
    const seed = i * 137.508;
    const x = (((Math.sin(seed) + 1) / 2) * w + Math.sin(time * 0.5 + seed) * 40) % w;
    const y = (((Math.cos(seed * 1.3) + 1) / 2) * h + Math.cos(time * 0.4 + seed) * 30) % h;
    const r = 1 + Math.abs(Math.sin(time * 0.8 + seed)) * 3;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
  }
  ctx.restore();
}

function drawPulse(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  accent: string,
  time: number,
) {
  const maxR = Math.min(cx, cy) * 0.6;
  for (let ring = 0; ring < 3; ring++) {
    const phase = (time * 0.5 + ring * 0.4) % 1;
    const r = phase * maxR;
    const alpha = (1 - phase) * 0.25;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.globalAlpha = alpha;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number, y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const words = text.split(' ');
  let line = '';
  let ly = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, ly);
      line = word;
      ly += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) { ctx.fillText(line, x, ly); ly += lineHeight; }
  return ly;
}

function easedAlpha(t: number, start: number, end: number): number {
  if (t < start) return 0;
  if (t > end) return 1;
  const p = (t - start) / (end - start);
  return p * p * (3 - 2 * p); // smoothstep
}

/** Draw a single frame of the promotional video. t ∈ [0, 1] */
function drawFrame(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  meta: MaxcoreJobMeta,
  palette: ReturnType<typeof getPalette>,
  t: number,
  time: number,
) {
  const isVertical = h > w;
  const pad = w * 0.07;

  // Background
  drawGradientBackground(ctx, w, h, palette.bg, time);

  // Pulse rings behind text
  drawPulse(ctx, w / 2, h * (isVertical ? 0.15 : 0.5), palette.accent, time);

  // Particles
  drawParticles(ctx, w, h, palette.accent, time);

  // Accent bar
  const barH = Math.max(3, h * 0.005);
  const barAlpha = easedAlpha(t, 0, 0.1);
  ctx.save();
  ctx.globalAlpha = barAlpha;
  ctx.fillStyle = palette.accent;
  ctx.fillRect(0, 0, w * t, barH);
  ctx.restore();

  // ── Text layers ────────────────────────────────────────────────────────
  const textW = w - pad * 2;
  const baseFont = Math.max(14, Math.round(w * 0.055));

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  let textY = isVertical ? h * 0.28 : h * 0.22;

  // HOOK
  const hook = meta.hook || meta.topic || 'Your Music. Your Moment.';
  const hookAlpha = easedAlpha(t, 0, 0.15);
  ctx.save();
  ctx.globalAlpha = hookAlpha;
  ctx.font = `bold ${Math.round(baseFont * 1.4)}px 'Inter', sans-serif`;
  ctx.fillStyle = palette.text;
  ctx.shadowColor = palette.accent;
  ctx.shadowBlur = 20;
  textY = wrapText(ctx, hook.toUpperCase(), w / 2, textY, textW, baseFont * 1.8);
  ctx.restore();

  textY += baseFont * 0.5;

  // Accent divider
  const divAlpha = easedAlpha(t, 0.15, 0.25);
  ctx.save();
  ctx.globalAlpha = divAlpha;
  ctx.fillStyle = palette.accent;
  ctx.fillRect(w / 2 - w * 0.12, textY, w * 0.24, 2);
  ctx.restore();

  textY += baseFont * 1.2;

  // BODY
  const body = meta.body || '';
  if (body) {
    const bodyAlpha = easedAlpha(t, 0.2, 0.35);
    ctx.save();
    ctx.globalAlpha = bodyAlpha;
    ctx.font = `${Math.round(baseFont * 0.85)}px 'Inter', sans-serif`;
    ctx.fillStyle = palette.text;
    ctx.globalAlpha *= 0.85;
    textY = wrapText(ctx, body, w / 2, textY, textW, baseFont * 1.4);
    ctx.restore();
  }

  // CTA — bottom
  const cta = meta.cta || '';
  if (cta) {
    const ctaAlpha = easedAlpha(t, 0.55, 0.7);
    const ctaY = isVertical ? h * 0.82 : h * 0.82;
    const ctaW  = Math.min(textW * 0.8, w * 0.6);
    const ctaH  = baseFont * 2.2;
    const ctaX  = w / 2 - ctaW / 2;
    ctx.save();
    ctx.globalAlpha = ctaAlpha;

    // Pill button
    ctx.fillStyle = palette.accent;
    const r = ctaH / 2;
    ctx.beginPath();
    ctx.moveTo(ctaX + r, ctaY - ctaH / 2);
    ctx.lineTo(ctaX + ctaW - r, ctaY - ctaH / 2);
    ctx.arc(ctaX + ctaW - r, ctaY, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(ctaX + r, ctaY + ctaH / 2);
    ctx.arc(ctaX + r, ctaY, r, Math.PI / 2, -Math.PI / 2);
    ctx.closePath();
    ctx.fill();

    ctx.font = `bold ${Math.round(baseFont * 0.9)}px 'Inter', sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cta, w / 2, ctaY);
    ctx.restore();
  }

  // Artist name watermark
  const artist = meta.artistName || '';
  if (artist) {
    const artistAlpha = easedAlpha(t, 0.05, 0.2) * 0.6;
    ctx.save();
    ctx.globalAlpha = artistAlpha;
    ctx.font = `${Math.round(baseFont * 0.65)}px 'Inter', sans-serif`;
    ctx.fillStyle = palette.text;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(artist, w - pad, h - pad * 0.6);
    ctx.restore();
  }

  // Fade in / out
  if (t < 0.06) {
    ctx.fillStyle = '#000';
    ctx.globalAlpha = 1 - t / 0.06;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
  if (t > 0.92) {
    ctx.fillStyle = '#000';
    ctx.globalAlpha = (t - 0.92) / 0.08;
    ctx.fillRect(0, 0, w, h);
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
  const {
    fps      = 30,
    onProgress,
    signal,
  } = opts;

  const duration = Math.max(3, Math.min(60, meta.duration || 10));
  // Cap canvas resolution for browser performance — scale down if either dim > 1280
  const rawW = meta.width  || (meta.aspect_ratio === '16:9' ? 1920 : 1080);
  const rawH = meta.height || (meta.aspect_ratio === '16:9' ? 1080 : 1920);
  const scale = Math.min(1, 1280 / Math.max(rawW, rawH));
  const W = Math.round(rawW * scale);
  const H = Math.round(rawH * scale);

  const palette = getPalette(meta.template || meta.template_name, meta.bgColor, meta.accentColor);

  const totalFrames = Math.ceil(duration * fps);

  // ── Pick supported MIME type ───────────────────────────────────────────
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];
  const mimeType = candidates.find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';

  // ── Set up canvas ──────────────────────────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const stream = canvas.captureStream(fps);
  const chunks: Blob[] = [];

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: Math.min(8_000_000, W * H * fps * 0.07),
  });

  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  const blobReady = new Promise<Blob>((resolve, reject) => {
    recorder.onstop   = () => resolve(new Blob(chunks, { type: mimeType }));
    recorder.onerror  = (e) => reject(new Error(`MediaRecorder error: ${(e as any).error?.message || 'unknown'}`));
  });

  recorder.start(100); // collect chunks every 100ms

  // ── Render frames ──────────────────────────────────────────────────────
  for (let frame = 0; frame <= totalFrames; frame++) {
    if (signal?.aborted) {
      recorder.stop();
      throw new Error('Render aborted');
    }

    const t    = frame / totalFrames;           // normalised [0, 1]
    const time = frame / fps;                   // real seconds

    drawFrame(ctx, W, H, meta, palette, t, time);

    onProgress?.(Math.round(t * 95));

    // Yield to browser every 5 frames to stay responsive
    if (frame % 5 === 0) {
      await new Promise<void>(r => setTimeout(r, 0));
    }
  }

  recorder.stop();
  const blob = await blobReady;

  onProgress?.(100);

  const blobUrl = URL.createObjectURL(blob);
  return {
    blobUrl,
    mimeType,
    duration,
    width:  W,
    height: H,
    revoke: () => URL.revokeObjectURL(blobUrl),
  };
}
