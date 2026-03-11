/**
 * Video Generator Service — Python NumPy Frame Engine + FFmpeg Compositor
 *
 * Architecture: Two-stage pipeline
 *   Stage 1 — Python frame generator (frameGenerator.py):
 *     - 13 visual styles: 8 abstract NumPy + 5 realistic scene environments
 *       Abstract: plasma_fractal, galaxy_spiral, neon_tunnel, aurora_curtains,
 *                 warp_speed, liquid_metal, fire_embers, crystal_facets
 *       Realistic: concert_stage, city_nights, studio_session, golden_hour, neon_cityscape
 *     - scene_prompt: free-text description auto-selects scene style + artist silhouettes
 *     - Genre-calibrated style selection and palette mapping
 *     - Live EQ visualizer overlay (32-bar music spectrum)
 *     - Human figure silhouettes, crowd rendering, environmental animation
 *     - Renders at 2x downscale internally → FFmpeg scales up (4x faster)
 *     - Piped as raw RGB24 directly to FFmpeg stdin (zero intermediate files)
 *   Stage 2 — FFmpeg compositor:
 *     - Bicubic upscale to full output resolution
 *     - Multi-font text overlays with animated alpha (DejaVu family)
 *     - Accent bars, artist branding, CTA pill buttons
 *     - xfade transitions between 3 scenes (hook → body → CTA)
 *     - Genre-calibrated procedural audio track (8 genre profiles)
 *     - Logo overlay (optional, auto-positioned top-right)
 *
 * Performance: ~25–35s render time for a 15s 1080×1920 video (no GPU required)
 * Quality:     Professional motion-graphics grade; 13 music-industry visual styles
 *              including 5 realistic environments with human figures
 */

import { execFile, execFileSync, spawn } from 'child_process';
import { promisify } from 'util';
import { mkdirSync, existsSync, unlinkSync } from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { unifiedAIController } from './unifiedAIController.js';
import { logger } from '../logger.js';

const execFileAsync = promisify(execFile);

function resolveFFmpegPath(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    const p = execFileSync('/bin/sh', ['-c', 'which ffmpeg'], { timeout: 3000 }).toString().trim();
    if (p) return p;
  } catch {}
  const candidates = [
    '/run/current-system/sw/bin/ffmpeg',
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/nix/var/nix/profiles/default/bin/ffmpeg',
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return 'ffmpeg';
}

const FFMPEG               = resolveFFmpegPath();
const OUTPUT_DIR           = path.join(process.cwd(), 'uploads', 'videos');
const TEMP_DIR             = path.join(process.cwd(), 'uploads', 'video_temp');
const FONT_DIR             = '/usr/share/fonts/truetype/dejavu';
const FRAME_GENERATOR_PATH = path.join(process.cwd(), 'server', 'services', 'frameGenerator.py');

// Maps legacy FFmpeg bgType names → Python frame generator style names
const BG_TO_PYTHON: Record<string, string> = {
  plasma:         'plasma_fractal',
  aurora:         'aurora_curtains',
  neon_pulse:     'neon_tunnel',
  gradient_sweep: 'liquid_metal',
  wave:           'aurora_curtains',
  fire:           'fire_embers',
  warp:           'warp_speed',
};

// ── FONTS ─────────────────────────────────────────────────────────────────────
const FONTS = {
  bold:        `${FONT_DIR}/DejaVuSans-Bold.ttf`,
  regular:     `${FONT_DIR}/DejaVuSans.ttf`,
  italic:      `${FONT_DIR}/DejaVuSans-Oblique.ttf` ,
  boldItalic:  `${FONT_DIR}/DejaVuSansMono-BoldOblique.ttf`,
  serif:       `${FONT_DIR}/DejaVuSerif-Bold.ttf`,
  serifReg:    `${FONT_DIR}/DejaVuSerif.ttf`,
  mono:        `${FONT_DIR}/DejaVuSansMono-Bold.ttf`,
  monoLight:   `${FONT_DIR}/DejaVuSansMono.ttf`,
} as const;

type FontKey = keyof typeof FONTS;

// ── ASPECT RATIOS ─────────────────────────────────────────────────────────────
const ASPECT_RATIOS: Record<string, [number, number]> = {
  '9:16': [1080, 1920],
  '16:9': [1920, 1080],
  '1:1':  [1080, 1080],
  '4:5':  [1080, 1350],
};

const PLATFORM_RATIOS: Record<string, string> = {
  tiktok:          '9:16',
  instagram:       '1:1',
  instagram_reels: '9:16',
  youtube:         '16:9',
  facebook:        '1:1',
  twitter:         '16:9',
  linkedin:        '16:9',
  threads:         '1:1',
  googlebusiness:  '16:9',
};

// ── ANIMATED BACKGROUND ENGINE ────────────────────────────────────────────────
// Returns the `-vf` geq prefix for each animated bg type.
// Expressions are designed to stay in-range without clip() — no commas inside math.
// For solid: uses `color=` lavfi source instead (fastest, no geq needed).
type BgType = 'plasma' | 'aurora' | 'neon_pulse' | 'gradient_sweep' | 'wave' | 'fire' | 'warp' | 'solid';

function getBgSourceArgs(bgType: BgType, bg: string, width: number, height: number, dur: number): string[] {
  const s = `${width}x${height}`;
  if (bgType === 'solid') {
    return ['-f', 'lavfi', '-i', `color=c=${bg}:s=${s}:d=${dur}:r=30`];
  }
  return ['-f', 'lavfi', '-i', `nullsrc=s=${s}:r=30:d=${dur}`];
}

function getBgVfPrefix(bgType: BgType, bg: string, width: number, height: number): string {
  const hex = bg.replace('0x', '');
  const R = parseInt(hex.slice(0, 2), 16);
  const G = parseInt(hex.slice(2, 4), 16);
  const B = parseInt(hex.slice(4, 6), 16);
  const aR = Math.floor((255 - R) * 0.45);
  const aG = Math.floor((255 - G) * 0.40);
  const aB = Math.floor((255 - B) * 0.50);
  const H = height, W = width;

  // geq uses capital T for time (T), capital X/Y for pixel coords.
  // Use sin(x)*sin(x) instead of abs(sin(x)) — always non-negative, no multi-arg funcs.
  // Avoid double parentheses: write sin(X/n-Y/n) instead of sin((X-Y)/n).

  switch (bgType) {
    case 'plasma':
      return (
        `geq=` +
        `r='${R}+${aR}*sin(X/20+T*1.8)*sin(Y/30-T*1.2)':` +
        `g='${G}+${aG}*sin(X/25+Y/25+T*1.5)*sin(X/25+Y/25+T*1.5)':` +
        `b='${B}+${aB}*sin(X/18-Y/22+T*2.0)*sin(X/18-Y/22+T*2.0)',format=yuv420p`
      );
    case 'aurora':
      return (
        `geq=` +
        `r='${R}+20*sin(X/40+T*0.8)*sin(X/40+T*0.8)':` +
        `g='${G}+${Math.min(80, 255-G)}*sin(Y/25+T*1.2)*sin(Y/25+T*1.2)*sin(X/60+T*0.5)*sin(X/60+T*0.5)':` +
        `b='${B}+${Math.min(60, 255-B)}*sin(X/30-Y/30+T*1.5)*sin(X/30-Y/30+T*1.5)',format=yuv420p`
      );
    case 'neon_pulse':
      return (
        `geq=` +
        `r='${R}+${aR}*sin(X/50+T*2.5)*sin(X/50+T*2.5)':` +
        `g='${G}+${aG}*sin(Y/50+T*2.0)*sin(Y/50+T*2.0)':` +
        `b='${B}+${aB}*sin(X/60+Y/60+T*3.0)*sin(X/60+Y/60+T*3.0)',format=yuv420p`
      );
    case 'gradient_sweep':
      return (
        `geq=` +
        `r='${R}+${aR}*Y/${H}+${Math.floor(aR*0.3)}*sin(T*0.8+X/200)*sin(T*0.8+X/200)':` +
        `g='${G}+${aG}*X/${W}+${Math.floor(aG*0.25)}*sin(T*0.6+Y/200)*sin(T*0.6+Y/200)':` +
        `b='${B}+${aB}*sin(T*0.7)*sin(T*0.7)',format=yuv420p`
      );
    case 'wave':
      return (
        `geq=` +
        `r='${R}+${Math.min(40, aR)}*sin(Y/50+X/80+T*2)*sin(Y/50+X/80+T*2)':` +
        `g='${G}+${Math.min(60, aG)}*sin(Y/60+T*1.5)*sin(Y/60+T*1.5)':` +
        `b='${B}+${Math.min(80, aB)}*sin(X/55-T*1.8)*sin(X/55-T*1.8)',format=yuv420p`
      );
    case 'fire':
      return (
        `geq=` +
        `r='${R}+${Math.min(120, 255-R)}*sin(X/20+T*3)*sin(X/20+T*3)*(${H}-Y)/${H}':` +
        `g='${G}+${Math.min(50, 255-G)}*sin(X/25+T*3.5)*sin(X/25+T*3.5)*(${H}-Y)/${H}*0.4':` +
        `b='${B}+8*sin(T*5)*sin(T*5)',format=yuv420p`
      );
    case 'warp':
      return (
        `geq=` +
        `r='${R}+${aR}*sin(X/W*6.28-Y/H*6.28+T*2)*sin(X/W*6.28-Y/H*6.28+T*2)':` +
        `g='${G}+${aG}*sin(X/W*9.42+T*1.5)*sin(X/W*9.42+T*1.5)':` +
        `b='${B}+${aB}*sin(Y/H*6.28-T*2.5)*sin(Y/H*6.28-T*2.5)',format=yuv420p`
      );
    case 'solid':
    default:
      return 'format=yuv420p';
  }
}

// ── AUDIO ENGINE ──────────────────────────────────────────────────────────────
// Genre-calibrated procedural chord tones — no external audio files required.
const AUDIO_PROFILES: Record<string, { expr: string; filters: string }> = {
  'hip-hop': {
    expr: '0.12*sin(2*PI*55*t)+0.08*sin(2*PI*110*t)+0.05*sin(2*PI*165*t)+0.03*sin(2*PI*220*t)',
    filters: 'lowpass=f=800,bass=g=4,volume=0.70,dynaudnorm',
  },
  'r&b': {
    expr: '0.10*sin(2*PI*110*t)+0.08*sin(2*PI*138.59*t)+0.07*sin(2*PI*164.81*t)+0.04*sin(2*PI*220*t)',
    filters: 'lowpass=f=1200,treble=g=-2,volume=0.70,dynaudnorm',
  },
  'pop': {
    expr: '0.08*sin(2*PI*261.63*t)+0.07*sin(2*PI*329.63*t)+0.06*sin(2*PI*392.00*t)+0.04*sin(2*PI*523.25*t)',
    filters: 'treble=g=3,volume=0.75,dynaudnorm',
  },
  'electronic': {
    expr: '0.15*sin(2*PI*55*t)+0.10*sin(2*PI*110*t)+0.05*sin(2*PI*440*t)+0.03*sin(2*PI*880*t)',
    filters: 'lowpass=f=2000,bass=g=6,treble=g=4,volume=0.80,dynaudnorm',
  },
  'afrobeats': {
    expr: '0.10*sin(2*PI*220*t)+0.08*sin(2*PI*261.63*t)+0.07*sin(2*PI*293.66*t)+0.05*sin(2*PI*349.23*t)',
    filters: 'lowpass=f=1500,volume=0.75,dynaudnorm',
  },
  'latin': {
    expr: '0.09*sin(2*PI*196*t)+0.08*sin(2*PI*246.94*t)+0.07*sin(2*PI*293.66*t)+0.05*sin(2*PI*392*t)',
    filters: 'treble=g=2,volume=0.75,dynaudnorm',
  },
  'country': {
    expr: '0.08*sin(2*PI*196*t)+0.07*sin(2*PI*246.94*t)+0.06*sin(2*PI*329.63*t)+0.04*sin(2*PI*392*t)',
    filters: 'treble=g=2,lowpass=f=3000,volume=0.70,dynaudnorm',
  },
  'rock': {
    expr: '0.12*sin(2*PI*82.41*t)+0.09*sin(2*PI*110*t)+0.07*sin(2*PI*164.81*t)+0.05*sin(2*PI*220*t)',
    filters: 'bass=g=5,treble=g=3,volume=0.80,dynaudnorm',
  },
  default: {
    expr: '0.08*sin(2*PI*110*t)+0.06*sin(2*PI*138.59*t)+0.05*sin(2*PI*164.81*t)+0.03*sin(2*PI*220*t)',
    filters: 'lowpass=f=2000,volume=0.65,dynaudnorm',
  },
};

// ── TEMPLATES ─────────────────────────────────────────────────────────────────
interface TemplateStyle {
  bg: string; tc: string; ac: string; cta_bg: string;
  hs: number; bs: number; cs: number;
  name: string;
  bgType: BgType;
  font: FontKey;
  transition: string;
}

const TEMPLATE_STYLES: Record<string, TemplateStyle> = {
  cinematic_promo:  { bg: '0x1a1a2e', tc: '0xffffff', ac: '0xe94560', cta_bg: '0xe94560', hs: 64, bs: 42, cs: 48, name: 'Cinematic Promo',  bgType: 'plasma',         font: 'bold',      transition: 'fadeblack' },
  neon_pulse:       { bg: '0x0d0221', tc: '0x00fff5', ac: '0xff6ec7', cta_bg: '0xff6ec7', hs: 62, bs: 44, cs: 46, name: 'Neon Pulse',        bgType: 'neon_pulse',     font: 'mono',      transition: 'dissolve'  },
  dark_cinema:      { bg: '0x0a0a0a', tc: '0xe0e0e0', ac: '0x444466', cta_bg: '0x222244', hs: 60, bs: 40, cs: 44, name: 'Dark Cinema',       bgType: 'solid',          font: 'serif',     transition: 'fade'      },
  aurora:           { bg: '0x0d1b2a', tc: '0xffffff', ac: '0x40e0d0', cta_bg: '0x20a090', hs: 62, bs: 42, cs: 46, name: 'Aurora',            bgType: 'aurora',         font: 'bold',      transition: 'dissolve'  },
  music_video:      { bg: '0x1a0030', tc: '0xffffff', ac: '0xff00ff', cta_bg: '0xcc00cc', hs: 66, bs: 44, cs: 48, name: 'Music Video',        bgType: 'plasma',         font: 'boldItalic',transition: 'wipeleft'  },
  gold_luxury:      { bg: '0x1a1000', tc: '0xf5e642', ac: '0xd4af37', cta_bg: '0xb8960c', hs: 60, bs: 40, cs: 44, name: 'Gold Luxury',       bgType: 'gradient_sweep', font: 'serif',     transition: 'fade'      },
  elegant_minimal:  { bg: '0xfafafa', tc: '0x1a1a1a', ac: '0x8b7355', cta_bg: '0x1a1a1a', hs: 60, bs: 40, cs: 44, name: 'Elegant Minimal',   bgType: 'solid',          font: 'serifReg',  transition: 'fade'      },
  vintage_film:     { bg: '0x2a1a0a', tc: '0xf0dfc0', ac: '0xaa7755', cta_bg: '0x8a5533', hs: 58, bs: 40, cs: 42, name: 'Vintage Film',      bgType: 'gradient_sweep', font: 'serif',     transition: 'dissolve'  },
  ocean_wave:       { bg: '0x001a3a', tc: '0xffffff', ac: '0x006994', cta_bg: '0x004a72', hs: 60, bs: 42, cs: 44, name: 'Ocean Wave',         bgType: 'wave',           font: 'bold',      transition: 'dissolve'  },
  fire_ember:       { bg: '0x1a0500', tc: '0xffffff', ac: '0xff4500', cta_bg: '0xcc3300', hs: 62, bs: 44, cs: 46, name: 'Fire & Ember',       bgType: 'fire',           font: 'bold',      transition: 'fade'      },
  storyteller:      { bg: '0x1a1a2e', tc: '0xe0e0e0', ac: '0x6655aa', cta_bg: '0x443388', hs: 60, bs: 40, cs: 44, name: 'Storyteller',       bgType: 'gradient_sweep', font: 'italic',    transition: 'fade'      },
  promo:            { bg: '0x1a1a2e', tc: '0xffffff', ac: '0xe94560', cta_bg: '0xe94560', hs: 62, bs: 42, cs: 46, name: 'Quick Promo',        bgType: 'plasma',         font: 'bold',      transition: 'fadeblack' },
  lyric:            { bg: '0x0f0f23', tc: '0xffffff', ac: '0xffd700', cta_bg: '0x333366', hs: 56, bs: 52, cs: 40, name: 'Quick Lyric',        bgType: 'warp',           font: 'boldItalic',transition: 'dissolve'  },
  announcement:     { bg: '0x16213e', tc: '0xe2e2e2', ac: '0x0f3460', cta_bg: '0xe94560', hs: 58, bs: 44, cs: 46, name: 'Announcement',       bgType: 'gradient_sweep', font: 'bold',      transition: 'wipeleft'  },
  minimal:          { bg: '0xfafafa', tc: '0x1a1a1a', ac: '0x333333', cta_bg: '0x1a1a1a', hs: 60, bs: 40, cs: 44, name: 'Quick Minimal',      bgType: 'solid',          font: 'serifReg',  transition: 'fade'      },
  neon:             { bg: '0x0d0221', tc: '0x00fff5', ac: '0xff6ec7', cta_bg: '0xff6ec7', hs: 62, bs: 44, cs: 46, name: 'Quick Neon',         bgType: 'neon_pulse',     font: 'mono',      transition: 'dissolve'  },
};

// ── UTILS ─────────────────────────────────────────────────────────────────────
function escFFmpeg(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/;/g, '\\;')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/,/g, '\\,')
    .replace(/%/g, '%%')   // FFmpeg drawtext uses % for format specifiers (e.g. %{pts})
    .replace(/\n/g, '\\n');
}

function wrap(text: string, maxChars = 28): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && cur.length + w.length + 1 > maxChars) { lines.push(cur); cur = w; }
    else { cur = cur ? `${cur} ${w}` : w; }
  }
  if (cur) lines.push(cur);
  return lines.join('\n');
}

function scaleFonts(style: TemplateStyle, width: number) {
  if (width >= 1080) return { hs: style.hs, bs: style.bs, cs: style.cs };
  const s = width / 1080;
  return { hs: Math.floor(style.hs * s), bs: Math.floor(style.bs * s), cs: Math.floor(style.cs * s) };
}

function tempPath(tag: string): string {
  return path.join(TEMP_DIR, `tmp_${tag}_${randomBytes(4).toString('hex')}.mp4`);
}

function cleanup(...paths: string[]) {
  for (const p of paths) {
    try { if (existsSync(p)) unlinkSync(p); } catch { /* ignore */ }
  }
}

// ── SCENE RENDERER ────────────────────────────────────────────────────────────
// Renders a single scene (video only, no audio) to a temp file.
interface SceneSpec {
  type: 'hook' | 'body' | 'cta';
  primaryText: string;
  secondaryText?: string;
  artistName?: string;
  duration: number;
  style: TemplateStyle;
  width: number;
  height: number;
  outPath: string;
  genre?: string;
  scene_prompt?: string;
}

// ── PYTHON FRAME PIPELINE ─────────────────────────────────────────────────────
// Spawns the Python frame generator and pipes its raw RGB24 output directly
// into FFmpeg for encoding + text overlay — no intermediate files needed.
async function renderWithPython(
  innerW: number, innerH: number,
  width: number, height: number,
  dur: number,
  style: TemplateStyle,
  genre: string,
  textVfParts: string[],
  outPath: string,
  scenePrompt?: string,
): Promise<void> {
  const fps = 30;

  const pythonCfgObj: Record<string, unknown> = {
    width:        innerW,
    height:       innerH,
    duration:     dur,
    fps,
    render_scale: 1,
    bg:           style.bg,
    ac:           style.ac,
    genre,
    eq_bars:      true,
    eq_height:    0.12,
    eq_n_bars:    32,
    speed:        1.0,
    intensity:    0.88,
  };

  if (scenePrompt && scenePrompt.trim()) {
    pythonCfgObj.scene_prompt = scenePrompt.trim();
  } else {
    pythonCfgObj.style = BG_TO_PYTHON[style.bgType] || 'plasma_fractal';
  }

  const pythonCfg = JSON.stringify(pythonCfgObj);

  // Scale up from internal resolution, then apply text overlays
  const scaleFilter = innerW !== width
    ? `scale=${width}:${height}:flags=lanczos,`
    : '';
  const vf = `${scaleFilter}format=yuv420p,${textVfParts.join(',')}`;

  return new Promise<void>((resolve, reject) => {
    const python = spawn('python3', [FRAME_GENERATOR_PATH, pythonCfg]);
    const ffmpeg = spawn(FFMPEG, [
      '-y',
      '-f', 'rawvideo', '-pix_fmt', 'rgb24',
      '-s', `${innerW}x${innerH}`, '-r', String(fps),
      '-i', 'pipe:0',
      '-vf', vf,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      '-an', '-frames:v', String(Math.ceil(dur * fps)),
      outPath,
    ]);

    python.stdout.pipe(ffmpeg.stdin);

    // Absorb EPIPE on ffmpeg.stdin — this fires when FFmpeg exits early (e.g. filter
    // error) while Python is still writing frames. Without this listener the error
    // propagates as an uncaughtException and crashes the entire server.
    ffmpeg.stdin.on('error', (e: NodeJS.ErrnoException) => {
      if (e.code === 'EPIPE' || e.code === 'ECONNRESET') return; // expected on early FFmpeg exit
      logger.warn('[VideoGen] ffmpeg.stdin error:', e.message);
    });

    let ffErr = '';
    let pyErr = '';
    let rejected = false;
    const doReject = (err: Error) => { if (!rejected) { rejected = true; reject(err); } };

    ffmpeg.stderr.on('data', (d: Buffer) => { ffErr += d.toString(); });
    python.stderr.on('data', (d: Buffer) => {
      const msg = d.toString();
      pyErr += msg;
      if (!msg.includes('RuntimeWarning')) logger.debug('[FrameGen]', msg.trim());
    });

    python.on('error', (e) => doReject(new Error(`Python error: ${e.message}`)));
    ffmpeg.on('error', (e) => doReject(new Error(`FFmpeg error: ${e.message}`)));

    ffmpeg.on('close', (code) => {
      // Stop Python from writing more frames into a now-closed FFmpeg stdin
      try { python.stdout.unpipe(ffmpeg.stdin); } catch {}
      try { ffmpeg.stdin.destroy(); } catch {}
      if (code === 0) resolve();
      else {
        const ffErrSnip = ffErr.slice(-1000);
        const pyErrSnip = pyErr.slice(-200).trim();
        logger.error(`[VideoGen] FFmpeg stderr tail: ${ffErrSnip}`);
        if (pyErrSnip) logger.error(`[VideoGen] Python stderr tail: ${pyErrSnip}`);
        doReject(new Error(`FFmpeg exited ${code}: ${ffErrSnip}`));
      }
    });

    python.on('close', (code) => {
      if (code !== 0) logger.warn(`[FrameGen] Python exited ${code}`);
      // FFmpeg reads until stdin EOF, which happens when Python exits
    });
  });
}

async function renderScene(spec: SceneSpec): Promise<void> {
  const { style, width, height, duration: dur, primaryText, secondaryText, artistName, outPath } = spec;
  const genre = (spec.genre || 'default').toLowerCase();
  const mc    = Math.max(16, Math.floor(width / (style.bs * 0.58)));
  const { hs, bs, cs } = scaleFonts(style, width);
  const font  = FONTS[style.font];
  const barH  = Math.floor(height * 0.085);

  // Build text/graphics VF parts (independent of background source)
  const textVfParts: string[] = [];

  textVfParts.push(`drawbox=x=0:y=0:w=${width}:h=${barH}:color=${style.ac}@0.28:t=fill`);
  textVfParts.push(`drawbox=x=0:y=${height - barH}:w=${width}:h=${barH}:color=${style.ac}@0.28:t=fill`);

  if (artistName) {
    const at = escFFmpeg(artistName.toUpperCase());
    textVfParts.push(
      `drawtext=fontfile=${FONTS.mono}:text='${at}':fontcolor=${style.ac}:fontsize=${Math.floor(bs * 0.62)}` +
      `:x=(w-text_w)/2:y=h*0.05:alpha='min(1\\,t*4)'`
    );
  }

  switch (spec.type) {
    case 'hook': {
      const ht = escFFmpeg(wrap(primaryText, mc));
      textVfParts.push(
        `drawtext=fontfile=${font}:text='${ht}':fontcolor=${style.tc}:fontsize=${hs}` +
        `:x=(w-text_w)/2:y=(h-text_h)/4:alpha='min(1\\,t*3)'`
      );
      textVfParts.push(
        `drawbox=x=iw/4:y=ih*0.42:w=iw/2:h=4:color=${style.ac}:t=fill` +
        `:enable='gte(t\\,0.4)'`
      );
      break;
    }
    case 'body': {
      const bt = escFFmpeg(wrap(primaryText, mc + 4));
      textVfParts.push(
        `drawtext=fontfile=${font}:text='${bt}':fontcolor=${style.tc}:fontsize=${bs}` +
        `:x=(w-text_w)/2:y=(h-text_h)/2:alpha='min(1\\,t*3)'`
      );
      if (secondaryText) {
        const st = escFFmpeg(wrap(secondaryText, mc + 8));
        textVfParts.push(
          `drawtext=fontfile=${FONTS.regular}:text='${st}':fontcolor=${style.tc}@0.70:fontsize=${Math.floor(bs * 0.72)}` +
          `:x=(w-text_w)/2:y=h*0.66:alpha='min(1\\,max(0\\,(t-0.4)*3))'`
        );
      }
      break;
    }
    case 'cta': {
      const boxW = Math.floor(width * 0.82);
      const boxX = Math.floor((width - boxW) / 2);
      const boxY = Math.floor(height * 0.68);
      const ct   = escFFmpeg(wrap(primaryText, mc + 2));
      textVfParts.push(
        `drawbox=x=${boxX}:y=${boxY}:w=${boxW}:h=${cs + 44}:color=${style.cta_bg}@0.92:t=fill` +
        `:enable='gte(t\\,0.2)'`
      );
      textVfParts.push(
        `drawbox=x=${boxX}:y=${boxY}:w=${boxW}:h=4:color=${style.ac}:t=fill` +
        `:enable='gte(t\\,0.2)'`
      );
      textVfParts.push(
        `drawtext=fontfile=${font}:text='${ct}':fontcolor=white:fontsize=${cs}` +
        `:x=(w-text_w)/2:y=h*0.70:alpha='min(1\\,t*5)'`
      );
      if (secondaryText) {
        const st = escFFmpeg(wrap(secondaryText, mc + 4));
        textVfParts.push(
          `drawtext=fontfile=${FONTS.regular}:text='${st}':fontcolor=${style.tc}:fontsize=${bs}` +
          `:x=(w-text_w)/2:y=(h-text_h)/2:alpha='min(1\\,max(0\\,(t-0.3)*3))'`
        );
      }
      break;
    }
  }

  const scenePrompt = spec.scene_prompt || '';

  if (style.bgType === 'solid' && !scenePrompt) {
    // Solid background — fast FFmpeg-only path (only when no scene prompt)
    const vf = ['format=yuv420p', ...textVfParts].join(',');
    await execFileAsync(FFMPEG, [
      '-y',
      '-f', 'lavfi', '-i', `color=c=${style.bg}:s=${width}x${height}:d=${dur}:r=30`,
      '-vf', vf,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      '-an', '-t', String(dur),
      outPath,
    ], { timeout: 90_000 });
  } else {
    // Animated background — Python NumPy/PIL scene engine piped to FFmpeg
    // Render at half resolution internally, FFmpeg scales up (4x faster)
    const scale  = 2;
    const innerW = Math.floor(width / scale);
    const innerH = Math.floor(height / scale);
    await renderWithPython(innerW, innerH, width, height, dur, style, genre, textVfParts, outPath, scenePrompt || undefined);
  }
}

// ── MULTI-SCENE COMBINER ──────────────────────────────────────────────────────
async function combineScenes(
  scenePaths: string[],
  sceneDurations: number[],
  outputPath: string,
  transition: string,
  transitionDur = 0.5,
): Promise<void> {
  if (scenePaths.length === 1) {
    await execFileAsync('cp', [scenePaths[0], outputPath]);
    return;
  }

  const inputs = scenePaths.flatMap(p => ['-i', p]);

  // Build xfade filter chain — accumulate offsets accounting for overlap
  let filterComplex = '';
  let prevLabel = '[0:v]';
  let cumOffset = 0;

  for (let i = 0; i < scenePaths.length - 1; i++) {
    cumOffset += sceneDurations[i] - transitionDur;
    const nextIn  = `[${i + 1}:v]`;
    const outLbl  = i === scenePaths.length - 2 ? '[vout]' : `[v${i}]`;
    filterComplex += `${prevLabel}${nextIn}xfade=transition=${transition}:duration=${transitionDur}:offset=${cumOffset.toFixed(2)}${outLbl};`;
    prevLabel = outLbl;
  }
  filterComplex = filterComplex.replace(/;$/, '');

  const ffmpegArgs = [
    '-y', ...inputs,
    '-filter_complex', filterComplex,
    '-map', '[vout]',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    outputPath,
  ];

  await execFileAsync(FFMPEG, ffmpegArgs, { timeout: 120_000 });
}

// ── AUDIO + LOGO FINALIZER ────────────────────────────────────────────────────
async function applyAudioAndLogo(
  videoPath: string,
  outputPath: string,
  totalDur: number,
  audioProfile: { expr: string; filters: string },
  logoPath?: string,
): Promise<void> {
  const audioSrc = `aevalsrc=${audioProfile.expr}:s=44100:c=stereo`;
  const fadeDur  = Math.min(1.5, totalDur * 0.12);
  const fadeOut  = Math.max(0, totalDur - fadeDur);

  if (logoPath && existsSync(logoPath)) {
    // ── video + audio + logo overlay ──
    const ffmpegArgs = [
      '-y',
      '-i', videoPath,
      '-f', 'lavfi', '-i', audioSrc,
      '-i', logoPath,
      '-filter_complex',
        `[2:v]scale=iw*0.14:ih*0.14[logo];` +
        `[0:v][logo]overlay=W-w-24:24:enable='between(t\\,0\\,${totalDur})'[vout];` +
        `[1:a]${audioProfile.filters},afade=t=in:st=0:d=${fadeDur},afade=t=out:st=${fadeOut.toFixed(2)}:d=${fadeDur}[aout]`,
      '-map', '[vout]', '-map', '[aout]',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
      '-c:a', 'aac', '-b:a', '128k',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      '-t', String(totalDur),
      outputPath,
    ];
    await execFileAsync(FFMPEG, ffmpegArgs, { timeout: 90_000 });
  } else {
    // ── video + audio only ──
    const ffmpegArgs = [
      '-y',
      '-i', videoPath,
      '-f', 'lavfi', '-i', audioSrc,
      '-map', '0:v', '-map', '1:a',
      '-c:v', 'copy',
      '-af', `${audioProfile.filters},afade=t=in:st=0:d=${fadeDur},afade=t=out:st=${fadeOut.toFixed(2)}:d=${fadeDur}`,
      '-c:a', 'aac', '-b:a', '128k',
      '-t', String(totalDur),
      outputPath,
    ];
    await execFileAsync(FFMPEG, ffmpegArgs, { timeout: 90_000 });
  }
}

// ── PUBLIC INTERFACE ──────────────────────────────────────────────────────────
export interface VideoGenOptions {
  topic: string;
  platform?: string;
  template?: string;
  aspect_ratio?: string;
  duration?: number;
  tone?: string;
  goal?: string;
  genre?: string;
  artist_name?: string;
  quality?: string;
  hook?: string;
  body?: string;
  cta?: string;
  logo_path?: string;
  scene_prompt?: string;
  bg_color?: string;
  accent_color?: string;
}

export interface VideoGenResult {
  success: boolean;
  url?: string;
  filename?: string;
  width?: number;
  height?: number;
  duration?: number;
  hook?: string;
  body?: string;
  cta?: string;
  template?: string;
  template_name?: string;
  scenes_rendered?: number;
  processing_time_ms?: number;
  render_time_ms?: number;
  source?: string;
  quality?: string;
  capabilities?: string[];
  error?: string;
}

export async function generateVideo(opts: VideoGenOptions): Promise<VideoGenResult> {
  const startMs = Date.now();

  mkdirSync(OUTPUT_DIR, { recursive: true });
  mkdirSync(TEMP_DIR, { recursive: true });

  const platform    = opts.platform || 'tiktok';
  const templateKey = (opts.template && TEMPLATE_STYLES[opts.template]) ? opts.template : 'cinematic_promo';
  const baseStyle   = TEMPLATE_STYLES[templateKey];
  // Allow callers (e.g. audio/image analysis) to supply extracted colors that override template defaults
  const normalizeHex = (c?: string) => c ? c.replace(/^#/, '0x') : undefined;
  const customBg     = normalizeHex(opts.bg_color);
  const customAc     = normalizeHex(opts.accent_color);
  const style: TemplateStyle = (customBg || customAc)
    ? { ...baseStyle, ...(customBg ? { bg: customBg, cta_bg: customBg } : {}), ...(customAc ? { ac: customAc } : {}) }
    : baseStyle;
  const ratio       = opts.aspect_ratio || PLATFORM_RATIOS[platform] || '9:16';
  const [width, height] = ASPECT_RATIOS[ratio] || [1080, 1920];
  const totalDur    = Math.max(6, Math.min(opts.duration || 15, 30));
  const genre       = (opts.genre || 'default').toLowerCase();
  const audioProfile = AUDIO_PROFILES[genre] || AUDIO_PROFILES.default;

  // ── Scene prompt: explicit → derived from topic+genre → undefined (Python uses genre defaults)
  const scenePrompt = opts.scene_prompt?.trim() ||
    (opts.topic ? `${opts.topic} ${genre} music` : undefined);

  // ── AI content generation ──
  let hook = opts.hook || '';
  let body = opts.body || '';
  let cta  = opts.cta  || '';
  let aiSource = 'template';

  if (!hook && !body && !cta && opts.topic) {
    try {
      const aiResult = await unifiedAIController.generateContent({
        topic: opts.topic,
        platform,
        tone: opts.tone || 'energetic',
        contentType: 'promotional',
        includeHashtags: false,
        includeEmojis: false,
        genre,
        artistName: opts.artist_name,
      });
      if (aiResult.success && aiResult.data) {
        const d = aiResult.data as Record<string, string>;
        hook = d.hook || d.caption?.split('\n')[0] || `New Music: ${opts.topic}`;
        body = d.body || d.caption?.split('\n')[1] || 'Stream now on all platforms';
        cta  = d.cta  || 'Follow for more';
        aiSource = 'ai_model';
      }
    } catch (e) {
      logger.warn('[VideoGen] AI content failed, using defaults:', e);
    }
  }

  if (!hook) hook = opts.topic?.slice(0, 60) || 'New Music Drop';
  if (!body) body = 'Stream now on all platforms';
  if (!cta)  cta  = 'Follow for more';

  // ── Scene duration split ──
  // Multi-scene: hook 40% | body 35% | CTA 25%  (minimum 3s per scene)
  const multiScene = totalDur >= 9;
  const sceneDurations = multiScene
    ? [
        Math.max(3, Math.round(totalDur * 0.40)),
        Math.max(3, Math.round(totalDur * 0.35)),
        Math.max(3, Math.round(totalDur * 0.25)),
      ]
    : [totalDur];

  const renderStart = Date.now();
  const tempFiles: string[] = [];

  try {
    if (multiScene) {
      // ── Render 3 scenes ──
      const hookPath = tempPath('hook');
      const bodyPath = tempPath('body');
      const ctaPath  = tempPath('cta');
      tempFiles.push(hookPath, bodyPath, ctaPath);

      // Render scenes sequentially — parallel Python processes each allocate ~180MB of
      // numpy frame buffers (540×960×RGB24×30fps×Ns) and OOM-kill each other on Replit.
      await renderScene({ type: 'hook', primaryText: hook, artistName: opts.artist_name, duration: sceneDurations[0], style, width, height, outPath: hookPath, genre, scene_prompt: scenePrompt });
      await renderScene({ type: 'body', primaryText: body, artistName: opts.artist_name, duration: sceneDurations[1], style, width, height, outPath: bodyPath, genre, scene_prompt: scenePrompt });
      await renderScene({ type: 'cta',  primaryText: cta,  secondaryText: body, artistName: opts.artist_name, duration: sceneDurations[2], style, width, height, outPath: ctaPath, genre, scene_prompt: scenePrompt });

      // ── Combine with xfade ──
      const combinedPath = tempPath('combined');
      tempFiles.push(combinedPath);
      await combineScenes([hookPath, bodyPath, ctaPath], sceneDurations, combinedPath, style.transition);

      // ── Add audio (+ logo if provided) ──
      const filename = `video_${randomBytes(6).toString('hex')}.mp4`;
      const finalPath = path.join(OUTPUT_DIR, filename);
      const combinedDur = sceneDurations.reduce((a, b) => a + b, 0) - 2 * 0.5;
      await applyAudioAndLogo(combinedPath, finalPath, combinedDur, audioProfile, opts.logo_path);

      const renderMs = Date.now() - renderStart;
      cleanup(...tempFiles);

      logger.info(`[VideoGen] ✅ ${filename} — ${width}x${height} ${totalDur}s | 3 scenes | ${style.bgType} bg | ${genre} audio | ${renderMs}ms`);

      return {
        success: true,
        url: `/uploads/videos/${filename}`,
        filename,
        width,
        height,
        duration: Math.round(combinedDur),
        hook, body, cta,
        template: templateKey,
        template_name: style.name,
        scenes_rendered: 3,
        processing_time_ms: Date.now() - startMs,
        render_time_ms: renderMs,
        source: aiSource,
        quality: opts.quality || 'cinematic',
        capabilities: ['animated_background', 'multi_scene', 'audio_track', 'multi_font', ...(opts.logo_path ? ['logo_overlay'] : [])],
      };

    } else {
      // ── Single-scene (short videos < 9s) ──
      const scenePath = tempPath('single');
      tempFiles.push(scenePath);

      // Render all text in one scene (full mode)
      const mc = Math.max(16, Math.floor(width / (style.bs * 0.58)));
      const { hs, bs, cs } = scaleFonts(style, width);
      const font = FONTS[style.font];
      const barH = Math.floor(height * 0.085);
      const hookEnd   = totalDur * 0.45;
      const bodyStart = totalDur * 0.25;
      const bodyEnd   = totalDur * 0.75;
      const ctaStart  = totalDur * 0.62;
      const boxW = Math.floor(width * 0.82);
      const boxX = Math.floor((width - boxW) / 2);
      const boxY = Math.floor(height * 0.70);

      // Build time-enabled text filters for single-scene all-content video
      const vfParts: string[] = [];

      vfParts.push(`drawbox=x=0:y=0:w=${width}:h=${barH}:color=${style.ac}@0.28:t=fill`);
      vfParts.push(`drawbox=x=0:y=${height - barH}:w=${width}:h=${barH}:color=${style.ac}@0.28:t=fill`);

      if (opts.artist_name) {
        const at = escFFmpeg(opts.artist_name.toUpperCase());
        vfParts.push(`drawtext=fontfile=${FONTS.mono}:text='${at}':fontcolor=${style.ac}:fontsize=${Math.floor(bs * 0.62)}:x=(w-text_w)/2:y=h*0.05`);
      }

      const ht = escFFmpeg(wrap(hook, mc));
      vfParts.push(
        `drawtext=fontfile=${font}:text='${ht}':fontcolor=${style.tc}:fontsize=${hs}` +
        `:x=(w-text_w)/2:y=(h-text_h)/4` +
        `:enable='between(t\\,0.3\\,${hookEnd.toFixed(1)})'` +
        `:alpha='if(lt(t\\,0.8)\\,min(1\\,(t-0.3)*2)\\,if(gt(t\\,${(hookEnd-0.5).toFixed(1)})\\,max(0\\,(${hookEnd.toFixed(1)}-t)*2)\\,1))'`
      );

      const bt = escFFmpeg(wrap(body, mc));
      vfParts.push(
        `drawtext=fontfile=${FONTS.regular}:text='${bt}':fontcolor=${style.tc}:fontsize=${bs}` +
        `:x=(w-text_w)/2:y=(h-text_h)/2` +
        `:enable='between(t\\,${bodyStart.toFixed(1)}\\,${bodyEnd.toFixed(1)})'` +
        `:alpha='if(lt(t\\,${(bodyStart+0.5).toFixed(1)})\\,min(1\\,(t-${bodyStart.toFixed(1)})*2)\\,if(gt(t\\,${(bodyEnd-0.5).toFixed(1)})\\,max(0\\,(${bodyEnd.toFixed(1)}-t)*2)\\,1))'`
      );

      vfParts.push(`drawbox=x=${boxX}:y=${boxY}:w=${boxW}:h=${cs + 44}:color=${style.cta_bg}@0.90:t=fill:enable='between(t\\,${ctaStart.toFixed(1)}\\,${totalDur})'`);
      const ct = escFFmpeg(wrap(cta, mc));
      vfParts.push(
        `drawtext=fontfile=${font}:text='${ct}':fontcolor=white:fontsize=${cs}` +
        `:x=(w-text_w)/2:y=h*0.72` +
        `:enable='between(t\\,${ctaStart.toFixed(1)}\\,${totalDur})'` +
        `:alpha='if(lt(t\\,${(ctaStart+0.3).toFixed(1)})\\,min(1\\,(t-${ctaStart.toFixed(1)})*3)\\,1)'`
      );

      if (style.bgType === 'solid' && !scenePrompt) {
        await execFileAsync(FFMPEG, [
          '-y',
          '-f', 'lavfi', '-i', `color=c=${style.bg}:s=${width}x${height}:d=${totalDur}:r=30`,
          '-vf', ['format=yuv420p', ...vfParts].join(','),
          '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
          '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
          '-an', '-t', String(totalDur), scenePath,
        ], { timeout: 90_000 });
      } else {
        const scale  = 2;
        const innerW = Math.floor(width / scale);
        const innerH = Math.floor(height / scale);
        await renderWithPython(innerW, innerH, width, height, totalDur, style, genre, vfParts, scenePath, scenePrompt || undefined);
      }

      // Add audio + optional logo
      const filename = `video_${randomBytes(6).toString('hex')}.mp4`;
      const finalPath = path.join(OUTPUT_DIR, filename);
      await applyAudioAndLogo(scenePath, finalPath, totalDur, audioProfile, opts.logo_path);

      const renderMs = Date.now() - renderStart;
      cleanup(...tempFiles);

      logger.info(`[VideoGen] ✅ ${filename} — ${width}x${height} ${totalDur}s | single scene | ${style.bgType} bg | ${genre} audio | ${renderMs}ms`);

      return {
        success: true,
        url: `/uploads/videos/${filename}`,
        filename, width, height,
        duration: totalDur,
        hook, body, cta,
        template: templateKey,
        template_name: style.name,
        scenes_rendered: 1,
        processing_time_ms: Date.now() - startMs,
        render_time_ms: renderMs,
        source: aiSource,
        quality: opts.quality || 'standard',
        capabilities: ['animated_background', 'audio_track', 'multi_font', ...(opts.logo_path ? ['logo_overlay'] : [])],
      };
    }

  } catch (err: any) {
    cleanup(...tempFiles);
    logger.error('[VideoGen] Render failed:', err?.stderr || err?.message);
    return { success: false, error: `Video render failed: ${err?.message || 'FFmpeg error'}` };
  }
}
