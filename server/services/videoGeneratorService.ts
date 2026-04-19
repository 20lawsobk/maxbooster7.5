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
 *     - Multi-font text overlays with animated alpha + slide-up (DejaVu family)
 *     - Drop shadows, outlines, accent bars, artist branding, CTA pill buttons
 *     - Cinematic vignette via FFmpeg vignette filter
 *     - xfade transitions between 3 scenes (hook → body → CTA)
 *     - Genre-calibrated procedural audio track (15 genre profiles)
 *     - Logo overlay (optional, auto-positioned top-right)
 *
 * Performance: ~22–30s render time for a 15s 1080×1920 video (no GPU required)
 * Quality:     Professional motion-graphics grade; 23 templates, 11 background
 *              animation types, cinematic vignette, text depth effects
 */

import { execFile, execFileSync, spawn } from 'child_process';
import { PYTHON, PYTHON_AVAILABLE } from './pythonPath.js';
import { promisify } from 'util';
import { mkdirSync, existsSync, unlinkSync } from 'fs';
import os from 'os';
import path from 'path';
import { randomBytes } from 'crypto';
import { contentQualityPipeline } from './contentQualityPipeline.js';
import { logger } from '../logger.js';

const execFileAsync = promisify(execFile);

function resolveFFmpegPath(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    const p = execFileSync('/bin/sh', ['-c', 'which ffmpeg'], { timeout: 3000 }).toString().trim();
    if (p) return p;
  } catch { /* intentional: shell which-lookup fails → falls through to hardcoded candidates */ }
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
  galaxy:         'galaxy_spiral',
  hologram:       'neon_tunnel',
  chromatic:      'plasma_fractal',
  sunrise:        'golden_hour',
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
// Each bg type produces a geq= filter expression rendering at half-resolution
// (iW × iH) for performance, then lanczos-upscaled to the final output size.
// Expressions are designed to always stay in [0,255] — sin²() is always ≥ 0
// and amplitude weights sum to ≤ 1.0 so peak = base + full_amplitude.
// "galaxy" and "hologram" use FFmpeg geq built-ins: hypot(), atan().
// "solid" uses a lavfi color source (fastest, no geq needed).
type BgType =
  | 'plasma' | 'aurora' | 'neon_pulse' | 'gradient_sweep'
  | 'wave'   | 'fire'   | 'warp'       | 'solid'
  | 'galaxy' | 'hologram' | 'chromatic' | 'sunrise';

function getBgSourceArgs(bgType: BgType, bg: string, width: number, height: number, dur: number): string[] {
  const s = `${width}x${height}`;
  if (bgType === 'solid') {
    return ['-f', 'lavfi', '-i', `color=c=${bg}:s=${s}:d=${dur}:r=30`];
  }
  return ['-f', 'lavfi', '-i', `nullsrc=s=${s}:r=30:d=${dur}`];
}

/**
 * Returns an enhanced geq= VF expression for animated gradient backgrounds.
 * Renders at half resolution (iW × iH) → callers lanczos-upscale to final size.
 *
 * Every expression uses multi-layer harmonic interference for organic, cinematic
 * motion. Each channel has 3 contributing waves at different frequencies and drift
 * speeds so colors evolve independently — no geometric grid artifacts.
 *
 * @param ac  Optional accent color hex (e.g. '0xe94560'). When supplied the
 *            animation morphs between bg and ac; otherwise bg → bright.
 */
function getBgVfPrefix(bgType: BgType, bg: string, iW: number, iH: number, ac?: string): string {
  const parseHex = (s: string) => {
    const h = s.replace('0x', '').replace('#', '');
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)] as const;
  };
  const [R, G, B] = parseHex(bg);
  const [AR, AG, AB] = ac ? parseHex(ac) : [255, 255, 255];
  const aR = AR - R;
  const aG = AG - G;
  const aB = AB - B;

  // Spatial frequency divisors (pixels per full sine cycle ÷ 2π)
  const dX1 = Math.round(iW / 6.28);    // 1 cycle across width
  const dX2 = Math.round(iW / 12.57);   // 2 cycles across width
  const dY1 = Math.round(iH / 6.28);    // 1 cycle across height
  const dY2 = Math.round(iH / 12.57);   // 2 cycles across height
  const dD1 = Math.round(Math.hypot(iW, iH) / 6.28); // 1 cycle across diagonal

  switch (bgType) {

    case 'plasma': {
      // Three channels with cross-axis diagonal interference — organic colour blobs.
      // Each channel gets 3 waves: major axis, counter-diagonal, minor cross-axis.
      return (
        `geq=` +
        `r='${R}+${aR}*(0.55*sin(X/${dX1}+T*1.1)*sin(X/${dX1}+T*1.1)+0.35*sin((X-Y)/${dD1}+T*0.7)*sin((X-Y)/${dD1}+T*0.7)+0.10*sin(Y/${dY2}*0.5-T*1.5)*sin(Y/${dY2}*0.5-T*1.5))':` +
        `g='${G}+${aG}*(0.50*sin(Y/${dY2}-T*0.9)*sin(Y/${dY2}-T*0.9)+0.35*sin((X+Y)/${dD1}+T*0.6)*sin((X+Y)/${dD1}+T*0.6)+0.15*sin(X/${dX2}+T*1.2)*sin(X/${dX2}+T*1.2))':` +
        `b='${B}+${aB}*(0.55*sin(X/${dX2}+Y/${dY1}+T*0.7)*sin(X/${dX2}+Y/${dY1}+T*0.7)+0.35*sin(Y/${dY1}+T*1.0)*sin(Y/${dY1}+T*1.0)+0.10*sin(X/${dX1}-T*1.3)*sin(X/${dX1}-T*1.3))'`
      );
    }

    case 'aurora': {
      // Tall horizontal curtains with luminance shimmer and subtle R accent.
      const gAmp = Math.min(aG, 180);
      const bAmp = Math.min(aB, 200);
      const rAmp = Math.min(aR, 60);
      return (
        `geq=` +
        `r='${R}+${rAmp}*(0.65*sin(X/${dX1}+T*0.3)*sin(X/${dX1}+T*0.3)*sin(Y/${dY2}*0.3)*sin(Y/${dY2}*0.3)+0.35*sin(Y/${dY1}+T*0.2)*sin(Y/${dY1}+T*0.2))':` +
        `g='${G}+${gAmp}*(0.60*sin(Y/${dY1}+X/${dX2}*0.15+T*0.5)*sin(Y/${dY1}+X/${dX2}*0.15+T*0.5)+0.30*sin(Y/${dY2}+T*0.3)*sin(Y/${dY2}+T*0.3)+0.10*sin(X/${dX1}+T*0.2)*sin(X/${dX1}+T*0.2))':` +
        `b='${B}+${bAmp}*(0.60*sin(X/${dX1}*0.8+Y/${dY2}*0.25+T*0.4)*sin(X/${dX1}*0.8+Y/${dY2}*0.25+T*0.4)+0.35*sin(Y/${dY1}+T*0.6)*sin(Y/${dY1}+T*0.6)+0.05*sin(X/${dX2}+T*0.3)*sin(X/${dX2}+T*0.3))'`
      );
    }

    case 'neon_pulse': {
      // Electric grid with cross-diagonal interference and sub-harmonic depth.
      return (
        `geq=` +
        `r='${R}+${aR}*(0.55*sin(X/${dX2}+T*2.0)*sin(X/${dX2}+T*2.0)+0.30*sin(Y/${dY1}+T*1.5)*sin(Y/${dY1}+T*1.5)+0.15*sin((X+Y)/${dD1}+T*2.5)*sin((X+Y)/${dD1}+T*2.5))':` +
        `g='${G}+${aG}*(0.55*sin(Y/${dY2}+T*1.6)*sin(Y/${dY2}+T*1.6)+0.35*sin(X/${dX1}+T*2.2)*sin(X/${dX1}+T*2.2)+0.10*sin((X-Y)/${dD1}+T*1.8)*sin((X-Y)/${dD1}+T*1.8))':` +
        `b='${B}+${aB}*(0.50*sin(X/${dX1}+Y/${dY1}+T*2.4)*sin(X/${dX1}+Y/${dY1}+T*2.4)+0.35*sin(X/${dX2}+T*1.9)*sin(X/${dX2}+T*1.9)+0.15*sin(Y/${dY2}+T*2.8)*sin(Y/${dY2}+T*2.8))'`
      );
    }

    case 'gradient_sweep': {
      // Slow diagonal editorial sweep with counter-rotating secondary wave.
      return (
        `geq=` +
        `r='${R}+${aR}*(0.55*Y/${iH}+0.35*sin(X/${dX1}+T*0.4)*sin(X/${dX1}+T*0.4)+0.10*sin((X+Y)/${dD1}+T*0.3)*sin((X+Y)/${dD1}+T*0.3))':` +
        `g='${G}+${aG}*(0.45*X/${iW}+0.40*sin(Y/${dY1}+T*0.3)*sin(Y/${dY1}+T*0.3)+0.15*sin((X-Y)/${dD1}+T*0.5)*sin((X-Y)/${dD1}+T*0.5))':` +
        `b='${B}+${aB}*(0.50*sin(X/${dD1}+Y/${dD1}+T*0.5)*sin(X/${dD1}+Y/${dD1}+T*0.5)+0.35*sin(Y/${dY1}+T*0.2)*sin(Y/${dY1}+T*0.2)+0.15*(1-X/${iW}))'`
      );
    }

    case 'wave': {
      // Multi-directional liquid interference — light-on-water feel.
      return (
        `geq=` +
        `r='${R}+${aR}*(0.50*sin(Y/${dY2}+X/${dX1}*0.3+T*1.4)*sin(Y/${dY2}+X/${dX1}*0.3+T*1.4)+0.35*sin(Y/${dY1}+T*0.8)*sin(Y/${dY1}+T*0.8)+0.15*sin(X/${dX1}+T*1.0)*sin(X/${dX1}+T*1.0))':` +
        `g='${G}+${aG}*(0.55*sin(Y/${dY1}+T*1.0)*sin(Y/${dY1}+T*1.0)+0.30*sin(X/${dX2}+Y/${dY2}*0.4+T*0.7)*sin(X/${dX2}+Y/${dY2}*0.4+T*0.7)+0.15*sin((X+Y)/${dD1}+T*1.2)*sin((X+Y)/${dD1}+T*1.2))':` +
        `b='${B}+${aB}*(0.55*sin(X/${dX2}-T*1.2)*sin(X/${dX2}-T*1.2)+0.35*sin(Y/${dY2}+X/${dX1}*0.2+T*0.9)*sin(Y/${dY2}+X/${dX1}*0.2+T*0.9)+0.10*sin(Y/${dY1}+T*1.5)*sin(Y/${dY1}+T*1.5))'`
      );
    }

    case 'fire': {
      // Upward rolling heat with multiple hot columns — orange inferno.
      const rAmp = Math.min(220, 255 - R);
      const gAmp = Math.min(80,  255 - G);
      return (
        `geq=` +
        `r='${R}+${rAmp}*(0.55*sin(X/${dX2}+T*3.2)*sin(X/${dX2}+T*3.2)+0.30*sin(X/${dX1}*1.3+T*2.8)*sin(X/${dX1}*1.3+T*2.8)+0.15*sin(X/${dX2}*1.7+T*3.8)*sin(X/${dX2}*1.7+T*3.8))*(${iH}-Y)/${iH}':` +
        `g='${G}+${gAmp}*(0.50*sin(X/${dX2}+T*3.0)*sin(X/${dX2}+T*3.0)+0.35*sin(X/${dX1}+T*2.5)*sin(X/${dX1}+T*2.5)+0.15*sin(X/${dX2}*1.5+T*3.5)*sin(X/${dX2}*1.5+T*3.5))*(${iH}-Y*1.15)/${iH}':` +
        `b='${B}+15*sin(T*4.0)*sin(T*4.0)*(1-Y/${iH})*0.5'`
      );
    }

    case 'warp': {
      // Orbital colour rotation with layered spiral feel — cosmic/sci-fi.
      return (
        `geq=` +
        `r='${R}+${aR}*(0.55*sin(X/${dX1}-Y/${dY2}+T*1.5)*sin(X/${dX1}-Y/${dY2}+T*1.5)+0.35*sin(X/${dX2}+Y/${dY1}*0.5+T*1.0)*sin(X/${dX2}+Y/${dY1}*0.5+T*1.0)+0.10*sin((X-Y)/${dD1}+T*2.0)*sin((X-Y)/${dD1}+T*2.0))':` +
        `g='${G}+${aG}*(0.50*sin(X/${dX2}+Y/${dY1}+T*1.0)*sin(X/${dX2}+Y/${dY1}+T*1.0)+0.35*sin(Y/${dY2}-T*0.8)*sin(Y/${dY2}-T*0.8)+0.15*sin((X+Y)/${dD1}+T*1.3)*sin((X+Y)/${dD1}+T*1.3))':` +
        `b='${B}+${aB}*(0.55*sin(Y/${dY1}-T*1.8)*sin(Y/${dY1}-T*1.8)+0.35*sin(X/${dX1}+Y/${dY2}*0.3+T*1.5)*sin(X/${dX1}+Y/${dY2}*0.3+T*1.5)+0.10*sin(X/${dX2}-T*2.2)*sin(X/${dX2}-T*2.2))'`
      );
    }

    case 'galaxy': {
      // Radial vortex from center — cosmic swirl with depth layers.
      // hypot(a,b) = sqrt(a²+b²) is native to FFmpeg's geq evaluator.
      const cx = Math.round(iW / 2);
      const cy = Math.round(iH / 2);
      return (
        `geq=` +
        `r='${R}+${aR}*(0.60*sin(hypot(X-${cx},Y-${cy})/${dD1}*3-T*1.2)*sin(hypot(X-${cx},Y-${cy})/${dD1}*3-T*1.2)+0.30*sin((X-${cx})/${dX1}+(Y-${cy})/${dY1}+T*0.8)*sin((X-${cx})/${dX1}+(Y-${cy})/${dY1}+T*0.8)+0.10*sin(T*2.0)*sin(T*2.0))':` +
        `g='${G}+${aG}*(0.50*sin(hypot(X-${cx},Y-${cy})/${dD1}*2.5-T*1.0)*sin(hypot(X-${cx},Y-${cy})/${dD1}*2.5-T*1.0)+0.35*sin((X-${cx})/${dX2}-(Y-${cy})/${dY2}+T*0.6)*sin((X-${cx})/${dX2}-(Y-${cy})/${dY2}+T*0.6)+0.15*sin(T*1.5)*sin(T*1.5))':` +
        `b='${B}+${aB}*(0.55*sin(hypot(X-${cx},Y-${cy})/${dD1}*2-T*0.8)*sin(hypot(X-${cx},Y-${cy})/${dD1}*2-T*0.8)+0.40*sin((Y-${cy})/${dY1}-(X-${cx})/${dX1}+T*0.5)*sin((Y-${cy})/${dY1}-(X-${cx})/${dX1}+T*0.5)+0.05*sin(T*1.0)*sin(T*1.0))'`
      );
    }

    case 'hologram': {
      // Grid node interference with horizontal scanlines — sci-fi HUD feel.
      // sin²(X)*sin²(Y) peaks at grid intersections, drops between them.
      return (
        `geq=` +
        `r='${R}+${aR}*(0.50*sin(X/${dX2}+T*0.8)*sin(X/${dX2}+T*0.8)*sin(Y/${dY2}+T*0.5)*sin(Y/${dY2}+T*0.5)+0.30*sin(Y*0.8+T*2.0)*sin(Y*0.8+T*2.0)*0.5+0.20*sin((X+Y)/${dD1}+T*0.3)*sin((X+Y)/${dD1}+T*0.3))':` +
        `g='${G}+${aG}*(0.65*sin(X/${dX2}+T*0.9)*sin(X/${dX2}+T*0.9)*sin(Y/${dY2}+T*0.4)*sin(Y/${dY2}+T*0.4)+0.25*sin(Y*1.2+T*2.5)*sin(Y*1.2+T*2.5)*0.5+0.10*sin(X/${dX1}+T*0.5)*sin(X/${dX1}+T*0.5))':` +
        `b='${B}+${aB}*(0.55*sin(X/${dX2}+T*0.7)*sin(X/${dX2}+T*0.7)*sin(Y/${dY2}+T*0.6)*sin(Y/${dY2}+T*0.6)+0.35*sin((X-Y)/${dD1}+T*0.4)*sin((X-Y)/${dD1}+T*0.4)+0.10*sin(T*3.0)*sin(T*3.0))'`
      );
    }

    case 'chromatic': {
      // Prismatic rainbow sweep — hue channels staggered by 120° (2.09 rad).
      // Each channel sweeps through the full amplitude independently.
      // bg is treated as a dark offset; rainbow pop is amplitude-driven.
      const amp = 185;
      const wave = `X/${dX1}+Y/${dY1}*0.3+T*0.55`;
      return (
        `geq=` +
        `r='${R}+${amp}*sin(${wave})*sin(${wave})':` +
        `g='${G}+${amp}*sin(${wave}+2.09)*sin(${wave}+2.09)':` +
        `b='${B}+${amp}*sin(${wave}+4.19)*sin(${wave}+4.19)'`
      );
    }

    case 'sunrise': {
      // Warm upward gradient: deep red/orange at bottom → purple twilight at top.
      // Subtle cloud variation via horizontal sine on G channel.
      const rAmp = Math.min(210, 255 - R);
      const gAmp = Math.min(110, 255 - G);
      const bAmp = Math.min(90,  255 - B);
      return (
        `geq=` +
        `r='${R}+${rAmp}*(${iH}-Y)/${iH}+${Math.floor(rAmp * 0.2)}*sin(X/${dX1}+T*0.25)*sin(X/${dX1}+T*0.25)':` +
        `g='${G}+${gAmp}*(${iH}-Y)*(${iH}-Y)/(${iH}*${iH})+${Math.floor(gAmp * 0.3)}*sin(X/${dX1}*0.7+T*0.20)*sin(X/${dX1}*0.7+T*0.20)*(${iH}-Y)/${iH}':` +
        `b='${B}+${bAmp}*sin(X/${dX1}+Y/${dY1}*0.5+T*0.18)*sin(X/${dX1}+Y/${dY1}*0.5+T*0.18)*(1-0.9*(${iH}-Y)/${iH})'`
      );
    }

    case 'solid':
    default:
      return 'format=yuv420p';
  }
}

// ── AUDIO ENGINE ──────────────────────────────────────────────────────────────
// Three-layer synthesis per genre: sub bass + beat pulse + chord pad.
// Each layer is a separate FFmpeg lavfi aevalsrc input, mixed via amix,
// then shaped with acompressor + EQ for a music-like result.
//
// Formula guide:
//   bass  — constant sub-bass foundation (40–120 Hz, rich harmonics)
//   beat  — amplitude-modulated kick: abs(sin(PI*bps*t))^pw gates the
//            bass carrier to create a punchy beat at the song's BPM
//            NOTE: pow(x,n) is written as x^n to avoid commas in the
//            expression — FFmpeg's lavfi parser treats ',' as a filter
//            separator, so pow(x,n) breaks the filter graph parser.
//   pad   — chord/melody layer (mid-range harmony, lower volume)
//   bps   — beats per second (BPM / 60)
//   pw    — sharpness exponent for the beat envelope (higher = punchier)
//   filters — per-genre EQ + compression chain applied after amix

interface AudioProfile {
  bass: string;
  beat: string;
  pad: string;
  bps: number;
  pw: number;
  filters: string;
}

export const AUDIO_PROFILES: Record<string, AudioProfile> = {
  'hip-hop': {
    // 90 BPM — deep 808 sub, punchy kick envelope, Cm chord pad
    bps: 1.5, pw: 8,
    bass: '0.22*sin(2*PI*55*t)+0.14*sin(2*PI*110*t)+0.07*sin(2*PI*165*t)+0.04*sin(2*PI*220*t)',
    beat: '0.40*abs(sin(PI*1.5*t))^8*sin(2*PI*55*t)+0.12*abs(sin(PI*3.0*t))^10*sin(2*PI*220*t)',
    pad:  '0.05*sin(2*PI*261.63*t)+0.04*sin(2*PI*311.13*t)+0.04*sin(2*PI*392.00*t)+0.03*sin(2*PI*523.25*t)',
    filters: 'equalizer=f=60:width_type=o:width=1.5:g=5,equalizer=f=200:width_type=o:width=2:g=3,lowpass=f=8000,acompressor=threshold=0.3:ratio=5:attack=3:release=40,bass=g=4,dynaudnorm=p=0.95',
  },
  'trap': {
    // 70 BPM half-time — booming 808, tight hi-hat rolls, minimal chord
    bps: 1.167, pw: 10,
    bass: '0.28*sin(2*PI*41.2*t)+0.18*sin(2*PI*82.4*t)+0.08*sin(2*PI*123.6*t)+0.04*sin(2*PI*164.8*t)',
    beat: '0.50*abs(sin(PI*1.167*t))^10*sin(2*PI*41.2*t)+0.08*abs(sin(PI*7.0*t))^14*(sin(2*PI*6000*t)+sin(2*PI*6273*t))',
    pad:  '0.04*sin(2*PI*220*t)+0.03*sin(2*PI*261.63*t)+0.025*sin(2*PI*329.63*t)',
    filters: 'equalizer=f=45:width_type=o:width=1:g=7,equalizer=f=160:width_type=o:width=2:g=4,lowpass=f=6000,acompressor=threshold=0.25:ratio=8:attack=1:release=25,bass=g=6,dynaudnorm=p=0.95',
  },
  'r&b': {
    // 80 BPM — smooth Am7 chord, soft kick, silky pad
    bps: 1.333, pw: 6,
    bass: '0.18*sin(2*PI*110*t)+0.12*sin(2*PI*138.59*t)+0.09*sin(2*PI*164.81*t)+0.06*sin(2*PI*220*t)+0.04*sin(2*PI*277.18*t)',
    beat: '0.30*abs(sin(PI*1.333*t))^6*sin(2*PI*110*t)+0.08*abs(sin(PI*2.667*t))^8*sin(2*PI*330*t)',
    pad:  '0.06*sin(2*PI*220*t)+0.05*sin(2*PI*261.63*t)+0.04*sin(2*PI*329.63*t)+0.04*sin(2*PI*440*t)',
    filters: 'equalizer=f=80:width_type=o:width=2:g=3,equalizer=f=3000:width_type=o:width=3:g=-2,treble=g=-1,lowpass=f=12000,acompressor=threshold=0.35:ratio=4:attack=5:release=60,dynaudnorm=p=0.90',
  },
  'pop': {
    // 120 BPM — bright C major, tight 4-on-the-floor kick, sparkly pad
    bps: 2.0, pw: 8,
    bass: '0.18*sin(2*PI*65.41*t)+0.12*sin(2*PI*130.81*t)+0.07*sin(2*PI*196*t)+0.04*sin(2*PI*261.63*t)',
    beat: '0.38*abs(sin(PI*2.0*t))^8*sin(2*PI*65.41*t)+0.10*abs(sin(PI*4.0*t))^10*sin(2*PI*392*t)',
    pad:  '0.07*sin(2*PI*261.63*t)+0.06*sin(2*PI*329.63*t)+0.06*sin(2*PI*392*t)+0.04*sin(2*PI*523.25*t)+0.03*sin(2*PI*659.26*t)',
    filters: 'equalizer=f=100:width_type=o:width=2:g=2,treble=g=3,equalizer=f=8000:width_type=o:width=2:g=2,acompressor=threshold=0.3:ratio=4:attack=3:release=35,dynaudnorm=p=0.92',
  },
  'electronic': {
    // 128 BPM EDM — pounding kick, saw-like bass, supersawpad chord
    bps: 2.133, pw: 10,
    bass: '0.24*sin(2*PI*55*t)+0.16*sin(2*PI*110*t)+0.10*sin(2*PI*165*t)+0.06*sin(2*PI*220*t)+0.03*sin(2*PI*275*t)',
    beat: '0.50*abs(sin(PI*2.133*t))^10*sin(2*PI*55*t)+0.12*abs(sin(PI*2.133*t))^12*(sin(2*PI*440*t)+sin(2*PI*443*t))',
    pad:  '0.05*(sin(2*PI*440*t)+sin(2*PI*441.5*t))+0.04*(sin(2*PI*523.25*t)+sin(2*PI*524.8*t))+0.03*sin(2*PI*659.26*t)',
    filters: 'equalizer=f=60:width_type=o:width=1:g=6,treble=g=4,equalizer=f=200:width_type=o:width=2:g=3,acompressor=threshold=0.2:ratio=8:attack=1:release=20,bass=g=5,dynaudnorm=p=0.95',
  },
  'afrobeats': {
    // 95 BPM — warm Am tonality, syncopated feel, tropical percussive pad
    bps: 1.583, pw: 7,
    bass: '0.20*sin(2*PI*110*t)+0.14*sin(2*PI*146.83*t)+0.10*sin(2*PI*164.81*t)+0.06*sin(2*PI*220*t)',
    beat: '0.35*abs(sin(PI*1.583*t))^7*sin(2*PI*110*t)+0.12*abs(sin(PI*3.167*t))^8*sin(2*PI*349.23*t)',
    pad:  '0.06*sin(2*PI*220*t)+0.05*sin(2*PI*261.63*t)+0.04*sin(2*PI*329.63*t)+0.04*sin(2*PI*440*t)',
    filters: 'equalizer=f=90:width_type=o:width=2:g=4,treble=g=2,lowpass=f=14000,acompressor=threshold=0.32:ratio=4:attack=4:release=45,dynaudnorm=p=0.90',
  },
  'latin': {
    // 100 BPM — bright Dm tonality, salsa-inflected rhythm, treble-forward
    bps: 1.667, pw: 7,
    bass: '0.18*sin(2*PI*73.42*t)+0.13*sin(2*PI*146.83*t)+0.09*sin(2*PI*195.99*t)+0.05*sin(2*PI*293.66*t)',
    beat: '0.36*abs(sin(PI*1.667*t))^7*sin(2*PI*73.42*t)+0.14*abs(sin(PI*3.333*t))^9*sin(2*PI*392*t)',
    pad:  '0.06*sin(2*PI*293.66*t)+0.05*sin(2*PI*349.23*t)+0.04*sin(2*PI*440*t)+0.04*sin(2*PI*587.33*t)',
    filters: 'treble=g=3,equalizer=f=100:width_type=o:width=2:g=3,lowpass=f=16000,acompressor=threshold=0.3:ratio=4:attack=3:release=35,dynaudnorm=p=0.92',
  },
  'country': {
    // 90 BPM — G major, warm twangy chord, steady kick
    bps: 1.5, pw: 6,
    bass: '0.16*sin(2*PI*98*t)+0.12*sin(2*PI*130.81*t)+0.08*sin(2*PI*196*t)+0.05*sin(2*PI*261.63*t)',
    beat: '0.32*abs(sin(PI*1.5*t))^6*sin(2*PI*98*t)+0.10*abs(sin(PI*3.0*t))^7*sin(2*PI*392*t)',
    pad:  '0.06*sin(2*PI*196*t)+0.05*sin(2*PI*246.94*t)+0.05*sin(2*PI*293.66*t)+0.04*sin(2*PI*392*t)',
    filters: 'treble=g=2,equalizer=f=120:width_type=o:width=2:g=2,lowpass=f=12000,acompressor=threshold=0.35:ratio=3:attack=5:release=50,dynaudnorm=p=0.88',
  },
  'rock': {
    // 120 BPM — power chord E5, distorted edge via harmonics, driving beat
    bps: 2.0, pw: 8,
    bass: '0.22*sin(2*PI*82.41*t)+0.15*sin(2*PI*164.81*t)+0.09*sin(2*PI*247.22*t)+0.06*sin(2*PI*329.63*t)+0.04*sin(2*PI*412.04*t)',
    beat: '0.45*abs(sin(PI*2.0*t))^8*sin(2*PI*82.41*t)+0.12*abs(sin(PI*4.0*t))^10*(sin(2*PI*440*t)+sin(2*PI*880*t))*0.5',
    pad:  '0.05*(sin(2*PI*329.63*t)+sin(2*PI*493.88*t)+sin(2*PI*659.26*t))',
    filters: 'bass=g=5,treble=g=3,equalizer=f=250:width_type=o:width=2:g=3,equalizer=f=5000:width_type=o:width=2:g=2,acompressor=threshold=0.25:ratio=6:attack=2:release=30,dynaudnorm=p=0.95',
  },
  'jazz': {
    // 120 BPM swing — Dm7 chord, walking-bass feel, mellow
    bps: 2.0, pw: 5,
    bass: '0.15*sin(2*PI*73.42*t)+0.11*sin(2*PI*110*t)+0.08*sin(2*PI*146.83*t)+0.06*sin(2*PI*220*t)',
    beat: '0.25*abs(sin(PI*2.0*t))^5*sin(2*PI*73.42*t)+0.08*abs(sin(PI*3.0*t))^6*sin(2*PI*349.23*t)',
    pad:  '0.05*sin(2*PI*220*t)+0.04*sin(2*PI*261.63*t)+0.04*sin(2*PI*311.13*t)+0.04*sin(2*PI*392*t)+0.03*sin(2*PI*466.16*t)',
    filters: 'equalizer=f=150:width_type=o:width=2:g=2,treble=g=-1,lowpass=f=10000,acompressor=threshold=0.4:ratio=3:attack=8:release=80,dynaudnorm=p=0.85',
  },
  'reggae': {
    // 80 BPM — off-beat skank feel, warm C# minor bass, bright mids
    bps: 1.333, pw: 5,
    bass: '0.20*sin(2*PI*69.3*t)+0.14*sin(2*PI*92.5*t)+0.09*sin(2*PI*138.59*t)+0.05*sin(2*PI*185.0*t)',
    beat: '0.25*abs(sin(PI*1.333*t+PI*0.5))^5*sin(2*PI*69.3*t)+0.14*abs(sin(PI*2.667*t+PI*0.5))^6*sin(2*PI*311.13*t)',
    pad:  '0.07*sin(2*PI*207.65*t)+0.06*sin(2*PI*261.63*t)+0.05*sin(2*PI*311.13*t)+0.05*sin(2*PI*415.30*t)',
    filters: 'equalizer=f=80:width_type=o:width=2:g=4,treble=g=2,equalizer=f=2500:width_type=o:width=2:g=2,lowpass=f=14000,acompressor=threshold=0.35:ratio=4:attack=5:release=55,dynaudnorm=p=0.88',
  },
  'metal': {
    // 160 BPM — aggressive power chord riff, double-kick, saturated harmonics
    bps: 2.667, pw: 12,
    bass: '0.26*sin(2*PI*82.41*t)+0.18*sin(2*PI*164.81*t)+0.12*sin(2*PI*247.22*t)+0.08*sin(2*PI*329.63*t)+0.05*sin(2*PI*412.04*t)+0.03*sin(2*PI*494.45*t)',
    beat: '0.55*abs(sin(PI*2.667*t))^12*sin(2*PI*82.41*t)+0.15*abs(sin(PI*5.333*t))^12*sin(2*PI*164.81*t)+0.08*abs(sin(PI*10.667*t))^14*(sin(2*PI*8000*t)+sin(2*PI*9000*t))*0.5',
    pad:  '0.04*(sin(2*PI*329.63*t)+sin(2*PI*392.00*t)+sin(2*PI*493.88*t)+sin(2*PI*587.33*t))',
    filters: 'bass=g=6,treble=g=4,equalizer=f=250:width_type=o:width=2:g=4,equalizer=f=4000:width_type=o:width=2:g=3,equalizer=f=8000:width_type=o:width=2:g=2,acompressor=threshold=0.2:ratio=10:attack=1:release=20,dynaudnorm=p=0.95',
  },
  'blues': {
    // 85 BPM — walking blues bass (E7 feel), swing shuffle, warm and raw
    bps: 1.417, pw: 5,
    bass: '0.18*sin(2*PI*82.41*t)+0.12*sin(2*PI*110*t)+0.09*sin(2*PI*164.81*t)+0.07*sin(2*PI*220*t)+0.05*sin(2*PI*329.63*t)',
    beat: '0.28*abs(sin(PI*1.417*t))^5*sin(2*PI*82.41*t)+0.10*abs(sin(PI*2.833*t+PI*0.3))^6*sin(2*PI*246.94*t)',
    pad:  '0.06*sin(2*PI*329.63*t)+0.05*sin(2*PI*392.00*t)+0.04*sin(2*PI*493.88*t)+0.04*sin(2*PI*587.33*t)',
    filters: 'equalizer=f=120:width_type=o:width=2:g=3,equalizer=f=3000:width_type=o:width=2:g=2,treble=g=1,lowpass=f=12000,acompressor=threshold=0.38:ratio=3:attack=6:release=60,dynaudnorm=p=0.87',
  },
  'classical': {
    // 100 BPM — orchestral-inspired, lush string-like pad, gentle and refined
    bps: 1.667, pw: 4,
    bass: '0.12*sin(2*PI*130.81*t)+0.09*sin(2*PI*164.81*t)+0.07*sin(2*PI*196.00*t)+0.05*sin(2*PI*261.63*t)',
    beat: '0.18*abs(sin(PI*1.667*t))^4*sin(2*PI*130.81*t)+0.06*abs(sin(PI*3.333*t))^5*sin(2*PI*392.00*t)',
    pad:  '0.07*sin(2*PI*261.63*t)+0.06*sin(2*PI*329.63*t)+0.05*sin(2*PI*392.00*t)+0.05*sin(2*PI*523.25*t)+0.04*sin(2*PI*659.26*t)+0.03*sin(2*PI*783.99*t)',
    filters: 'equalizer=f=200:width_type=o:width=2:g=2,treble=g=1,equalizer=f=6000:width_type=o:width=2:g=1,lowpass=f=16000,acompressor=threshold=0.45:ratio=3:attack=10:release=100,dynaudnorm=p=0.82',
  },
  default: {
    // 100 BPM — neutral Am chord, gentle beat, balanced
    bps: 1.667, pw: 7,
    bass: '0.09*sin(2*PI*110*t)+0.06*sin(2*PI*138.59*t)+0.04*sin(2*PI*164.81*t)+0.03*sin(2*PI*220*t)',
    beat: '0.16*abs(sin(PI*1.667*t))^7*sin(2*PI*110*t)+0.05*abs(sin(PI*3.333*t))^8*sin(2*PI*330*t)',
    pad:  '0.04*sin(2*PI*220*t)+0.03*sin(2*PI*261.63*t)+0.03*sin(2*PI*329.63*t)+0.02*sin(2*PI*440*t)',
    filters: 'highpass=f=80,lowpass=f=12000,acompressor=threshold=0.4:ratio=3:attack=5:release=50,dynaudnorm=p=0.60',
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

export const TEMPLATE_STYLES: Record<string, TemplateStyle> = {
  // ── Original 17 templates (fully preserved) ───────────────────────────────
  cinematic_promo:  { bg: '0x1a1a2e', tc: '0xffffff', ac: '0xe94560', cta_bg: '0xe94560', hs: 64, bs: 42, cs: 48, name: 'Cinematic Promo',   bgType: 'plasma',         font: 'bold',      transition: 'fadeblack' },
  neon_pulse:       { bg: '0x0d0221', tc: '0x00fff5', ac: '0xff6ec7', cta_bg: '0xff6ec7', hs: 62, bs: 44, cs: 46, name: 'Neon Pulse',         bgType: 'neon_pulse',     font: 'mono',      transition: 'dissolve'  },
  dark_cinema:      { bg: '0x0a0a0a', tc: '0xe0e0e0', ac: '0x444466', cta_bg: '0x222244', hs: 60, bs: 40, cs: 44, name: 'Dark Cinema',        bgType: 'solid',          font: 'serif',     transition: 'fade'      },
  aurora:           { bg: '0x0d1b2a', tc: '0xffffff', ac: '0x40e0d0', cta_bg: '0x20a090', hs: 62, bs: 42, cs: 46, name: 'Aurora',             bgType: 'aurora',         font: 'bold',      transition: 'dissolve'  },
  music_video:      { bg: '0x1a0030', tc: '0xffffff', ac: '0xff00ff', cta_bg: '0xcc00cc', hs: 66, bs: 44, cs: 48, name: 'Music Video',         bgType: 'plasma',         font: 'boldItalic',transition: 'wipeleft'  },
  gold_luxury:      { bg: '0x1a1000', tc: '0xf5e642', ac: '0xd4af37', cta_bg: '0xb8960c', hs: 60, bs: 40, cs: 44, name: 'Gold Luxury',        bgType: 'gradient_sweep', font: 'serif',     transition: 'fade'      },
  elegant_minimal:  { bg: '0xfafafa', tc: '0x1a1a1a', ac: '0x8b7355', cta_bg: '0x1a1a1a', hs: 60, bs: 40, cs: 44, name: 'Elegant Minimal',    bgType: 'solid',          font: 'serifReg',  transition: 'fade'      },
  vintage_film:     { bg: '0x2a1a0a', tc: '0xf0dfc0', ac: '0xaa7755', cta_bg: '0x8a5533', hs: 58, bs: 40, cs: 42, name: 'Vintage Film',       bgType: 'gradient_sweep', font: 'serif',     transition: 'dissolve'  },
  ocean_wave:       { bg: '0x001a3a', tc: '0xffffff', ac: '0x006994', cta_bg: '0x004a72', hs: 60, bs: 42, cs: 44, name: 'Ocean Wave',          bgType: 'wave',           font: 'bold',      transition: 'dissolve'  },
  fire_ember:       { bg: '0x1a0500', tc: '0xffffff', ac: '0xff4500', cta_bg: '0xcc3300', hs: 62, bs: 44, cs: 46, name: 'Fire & Ember',        bgType: 'fire',           font: 'bold',      transition: 'fade'      },
  storyteller:      { bg: '0x1a1a2e', tc: '0xe0e0e0', ac: '0x6655aa', cta_bg: '0x443388', hs: 60, bs: 40, cs: 44, name: 'Storyteller',        bgType: 'gradient_sweep', font: 'italic',    transition: 'fade'      },
  promo:            { bg: '0x1a1a2e', tc: '0xffffff', ac: '0xe94560', cta_bg: '0xe94560', hs: 62, bs: 42, cs: 46, name: 'Quick Promo',         bgType: 'plasma',         font: 'bold',      transition: 'fadeblack' },
  lyric:            { bg: '0x0f0f23', tc: '0xffffff', ac: '0xffd700', cta_bg: '0x333366', hs: 56, bs: 52, cs: 40, name: 'Quick Lyric',         bgType: 'warp',           font: 'boldItalic',transition: 'dissolve'  },
  announcement:     { bg: '0x16213e', tc: '0xe2e2e2', ac: '0x0f3460', cta_bg: '0xe94560', hs: 58, bs: 44, cs: 46, name: 'Announcement',        bgType: 'gradient_sweep', font: 'bold',      transition: 'wipeleft'  },
  minimal:          { bg: '0xfafafa', tc: '0x1a1a1a', ac: '0x333333', cta_bg: '0x1a1a1a', hs: 60, bs: 40, cs: 44, name: 'Quick Minimal',       bgType: 'solid',          font: 'serifReg',  transition: 'fade'      },
  neon:             { bg: '0x0d0221', tc: '0x00fff5', ac: '0xff6ec7', cta_bg: '0xff6ec7', hs: 62, bs: 44, cs: 46, name: 'Quick Neon',          bgType: 'neon_pulse',     font: 'mono',      transition: 'dissolve'  },
  // ── 6 new premium templates ───────────────────────────────────────────────
  viral_music:      { bg: '0x0a0a14', tc: '0xffffff', ac: '0xfe2d5c', cta_bg: '0xfe2d5c', hs: 68, bs: 44, cs: 50, name: 'Viral Music',         bgType: 'plasma',         font: 'bold',      transition: 'fadeblack' },
  artist_brand:     { bg: '0x111827', tc: '0xf9fafb', ac: '0x818cf8', cta_bg: '0x4f46e5', hs: 62, bs: 42, cs: 46, name: 'Artist Brand',        bgType: 'galaxy',         font: 'bold',      transition: 'dissolve'  },
  hype_drop:        { bg: '0x000000', tc: '0xffffff', ac: '0xfbbf24', cta_bg: '0xf59e0b', hs: 70, bs: 46, cs: 50, name: 'Hype Drop',           bgType: 'hologram',       font: 'mono',      transition: 'wipeleft'  },
  gradient_vibes:   { bg: '0x0d0221', tc: '0xe0e7ff', ac: '0xa78bfa', cta_bg: '0x6d28d9', hs: 62, bs: 42, cs: 46, name: 'Gradient Vibes',      bgType: 'chromatic',      font: 'boldItalic',transition: 'dissolve'  },
  warm_soul:        { bg: '0x1c0a00', tc: '0xfff7ed', ac: '0xf97316', cta_bg: '0xea580c', hs: 62, bs: 42, cs: 46, name: 'Warm Soul',           bgType: 'sunrise',        font: 'serif',     transition: 'fade'      },
  midnight_drop:    { bg: '0x0f0f1a', tc: '0xc7d2fe', ac: '0x7c3aed', cta_bg: '0x5b21b6', hs: 64, bs: 44, cs: 48, name: 'Midnight Drop',       bgType: 'warp',           font: 'boldItalic',transition: 'dissolve'  },
};

// ── UTILS ─────────────────────────────────────────────────────────────────────

/**
 * Strip characters that can break FFmpeg's filter option parser from video overlay text.
 * Applied BEFORE escFFmpeg. Removes: URLs, hashtags, @mentions, emoji, non-ASCII,
 * single quotes/apostrophes, and pipe chars. Collapses extra whitespace.
 */
function sanitizeVideoText(text: string, maxLen = 120): string {
  const clean = text
    .replace(/https?:\/\/\S+/g, '')           // strip URLs
    .replace(/#\w+/g, '')                       // strip hashtags
    .replace(/@\w+/g, '')                       // strip @mentions
    .replace(/[^\x00-\x7F]/g, '')              // strip non-ASCII (emoji, Unicode)
    .replace(/['"]/g, '')                       // strip single/double quotes (filter breakers)
    .replace(/[|]/g, '-')                       // replace pipes with dashes
    .replace(/\s+/g, ' ')                       // collapse whitespace
    .trim();
  return clean.length > maxLen ? clean.slice(0, maxLen).trim() : clean;
}

function escFFmpeg(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/;/g, '\\;')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/,/g, '\\,')
    .replace(/%/g, '%%')
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

function scaleFonts(style: TemplateStyle, width: number, platform?: string) {
  let s = width >= 1080 ? 1 : width / 1080;
  // TikTok & Reels: 12% larger hook text — thumb-stopping impact
  const hookBoost = (platform === 'tiktok' || platform === 'instagram_reels') ? 1.12 : 1.0;
  // LinkedIn & YouTube: slightly smaller, more professional
  const shrink    = (platform === 'linkedin') ? 0.94 : 1.0;
  s *= shrink;
  return {
    hs: Math.floor(style.hs * s * hookBoost),
    bs: Math.floor(style.bs * s),
    cs: Math.floor(style.cs * s),
  };
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
  platform?: string;
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

  pythonCfgObj.seed = parseInt(randomBytes(4).toString('hex'), 16);

  const pythonCfg = JSON.stringify(pythonCfgObj);

  const scaleFilter = innerW !== width
    ? `scale=${width}:${height}:flags=lanczos,`
    : '';
  const vf = `${scaleFilter}format=yuv420p,${textVfParts.join(',')}`;

  if (!PYTHON_AVAILABLE) {
    return Promise.reject(new Error(
      'Video render failed: Python 3 is not installed on this server. ' +
      'The Cinematic AI Video Studio requires Python with numpy and Pillow.'
    ));
  }

  logger.debug('[VideoGen] vf filter string:', vf);

  return new Promise<void>((resolve, reject) => {
    const python = spawn(PYTHON, [FRAME_GENERATOR_PATH, pythonCfg]);
    const ffmpeg = spawn(FFMPEG, [
      '-y',
      '-f', 'rawvideo', '-pix_fmt', 'rgb24',
      '-s', `${innerW}x${innerH}`, '-r', String(fps),
      '-i', 'pipe:0',
      '-vf', vf,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      '-an', '-frames:v', String(Math.ceil(dur * fps)),
      outPath,
    ]);

    python.stdout.pipe(ffmpeg.stdin);

    ffmpeg.stdin.on('error', (e: NodeJS.ErrnoException) => {
      if (e.code === 'EPIPE' || e.code === 'ECONNRESET') return;
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
      try { python.stdout.unpipe(ffmpeg.stdin); } catch { /* intentional: stream may already be closed */ }
      try { ffmpeg.stdin.destroy(); } catch { /* intentional: stream may already be closed */ }
      if (code === 0) resolve();
      else {
        const ffErrSnip = ffErr.slice(-1000);
        const pyErrSnip = pyErr.slice(-200).trim();
        logger.warn(`[VideoGen] FFmpeg stderr tail: ${ffErrSnip}`);
        if (pyErrSnip) logger.warn(`[VideoGen] Python stderr tail: ${pyErrSnip}`);
        doReject(new Error(`FFmpeg exited ${code}: ${ffErrSnip}`));
      }
    });

    python.on('close', (code) => {
      if (code !== 0) logger.warn(`[FrameGen] Python exited ${code}`);
    });
  });
}

async function renderScene(spec: SceneSpec): Promise<void> {
  const { style, width, height, duration: dur, primaryText, secondaryText, artistName, outPath, platform } = spec;
  const genre = (spec.genre || 'default').toLowerCase();
  const mc    = Math.max(16, Math.floor(width / (style.bs * 0.58)));
  const { hs, bs, cs } = scaleFonts(style, width, platform);
  const font  = FONTS[style.font];
  const barH  = Math.floor(height * 0.085);
  const isSolid = style.bgType === 'solid';

  // Build text/graphics VF parts (independent of background source)
  const textVfParts: string[] = [];

  // ── Accent bars (top + bottom) ─────────────────────────────────────────────
  textVfParts.push(`drawbox=x=0:y=0:w=${width}:h=${barH}:color=${style.ac}@0.30:t=fill`);
  textVfParts.push(`drawbox=x=0:y=${height - barH}:w=${width}:h=${barH}:color=${style.ac}@0.30:t=fill`);

  // ── Artist name (uppercase, monospace, accent-colored) ─────────────────────
  if (artistName) {
    const at = escFFmpeg(sanitizeVideoText(artistName).toUpperCase());
    const atSize = Math.floor(bs * 0.62);
    // Shadow layer for artist name
    textVfParts.push(
      `drawtext=fontfile=${FONTS.mono}:text='${at}':fontcolor=black@0.45:fontsize=${atSize}` +
      `:x=(w-text_w)/2+3:y=h*0.05+3:alpha='min(1\\,t*5)'`
    );
    textVfParts.push(
      `drawtext=fontfile=${FONTS.mono}:text='${at}':fontcolor=${style.ac}:fontsize=${atSize}` +
      `:x=(w-text_w)/2:y=h*0.05:alpha='min(1\\,t*5)'`
    );
  }

  switch (spec.type) {
    case 'hook': {
      const ht    = escFFmpeg(wrap(sanitizeVideoText(primaryText), mc));
      const yBase = `(h-text_h)/4`;
      // Slide-up: text drops in 30px and slides up as it fades
      const slideY = `(${yBase})+30*(1-min(1\\,t*3))`;
      // Drop shadow on hook text
      textVfParts.push(
        `drawtext=fontfile=${font}:text='${ht}':fontcolor=black@0.50:fontsize=${hs}` +
        `:x=(w-text_w)/2+4:y=${slideY}+4:alpha='min(1\\,t*3)'`
      );
      // Main hook text with outline
      textVfParts.push(
        `drawtext=fontfile=${font}:text='${ht}':fontcolor=${style.tc}:fontsize=${hs}` +
        `:x=(w-text_w)/2:y=${slideY}:alpha='min(1\\,t*3)'` +
        `:bordercolor=${style.ac}:borderw=2`
      );
      // Animated accent line that expands from center (width grows 0→50% over 0.6s)
      const acLineY = Math.floor(height * 0.44);
      textVfParts.push(
        `drawbox=x=(iw-iw*min(1\\,max(0\\,(t-0.3)*2.5))*0.50)/2` +
        `:y=${acLineY}:w=iw*min(1\\,max(0\\,(t-0.3)*2.5))*0.50:h=4` +
        `:color=${style.ac}:t=fill:enable='gte(t\\,0.3)'`
      );
      break;
    }
    case 'body': {
      const bt    = escFFmpeg(wrap(sanitizeVideoText(primaryText), mc + 4));
      const yBase = `(h-text_h)/2`;
      const slideY = `(${yBase})+25*(1-min(1\\,t*3))`;
      // Shadow
      textVfParts.push(
        `drawtext=fontfile=${font}:text='${bt}':fontcolor=black@0.40:fontsize=${bs}` +
        `:x=(w-text_w)/2+3:y=${slideY}+3:alpha='min(1\\,t*3)'`
      );
      // Main body text
      textVfParts.push(
        `drawtext=fontfile=${font}:text='${bt}':fontcolor=${style.tc}:fontsize=${bs}` +
        `:x=(w-text_w)/2:y=${slideY}:alpha='min(1\\,t*3)'`
      );
      if (secondaryText) {
        const st    = escFFmpeg(wrap(sanitizeVideoText(secondaryText), mc + 8));
        const stSlide = `h*0.66+20*(1-min(1\\,max(0\\,(t-0.4)*3)))`;
        textVfParts.push(
          `drawtext=fontfile=${FONTS.regular}:text='${st}':fontcolor=${style.tc}@0.72:fontsize=${Math.floor(bs * 0.72)}` +
          `:x=(w-text_w)/2:y=${stSlide}:alpha='min(1\\,max(0\\,(t-0.4)*3))'`
        );
      }
      break;
    }
    case 'cta': {
      const boxW    = Math.floor(width * 0.82);
      const boxX    = Math.floor((width - boxW) / 2);
      const boxY    = Math.floor(height * 0.68);
      const boxH    = cs + 44;
      const ct      = escFFmpeg(wrap(sanitizeVideoText(primaryText), mc + 2));
      // CTA pill box with dual accent stripes (top + bottom)
      textVfParts.push(
        `drawbox=x=${boxX}:y=${boxY}:w=${boxW}:h=${boxH}:color=${style.cta_bg}@0.94:t=fill` +
        `:enable='gte(t\\,0.2)'`
      );
      textVfParts.push(
        `drawbox=x=${boxX}:y=${boxY}:w=${boxW}:h=4:color=${style.ac}:t=fill` +
        `:enable='gte(t\\,0.2)'`
      );
      textVfParts.push(
        `drawbox=x=${boxX}:y=${boxY + boxH - 4}:w=${boxW}:h=4:color=${style.ac}@0.55:t=fill` +
        `:enable='gte(t\\,0.2)'`
      );
      // CTA text (slide-up + fast fade-in)
      const ctSlide = `h*0.70+20*(1-min(1\\,t*5))`;
      textVfParts.push(
        `drawtext=fontfile=${font}:text='${ct}':fontcolor=white:fontsize=${cs}` +
        `:x=(w-text_w)/2:y=${ctSlide}:alpha='min(1\\,t*5)'`
      );
      if (secondaryText) {
        const st     = escFFmpeg(wrap(sanitizeVideoText(secondaryText), mc + 4));
        const stSlide = `(h-text_h)/2+22*(1-min(1\\,max(0\\,(t-0.3)*3)))`;
        textVfParts.push(
          `drawtext=fontfile=${FONTS.regular}:text='${st}':fontcolor=${style.tc}:fontsize=${bs}` +
          `:x=(w-text_w)/2:y=${stSlide}:alpha='min(1\\,max(0\\,(t-0.3)*3))'`
        );
      }
      break;
    }
  }

  const scenePrompt = spec.scene_prompt || '';

  if (isSolid) {
    // Solid background — fast FFmpeg color source, add vignette for cinematic depth
    const vf = ['format=yuv420p', 'vignette=angle=PI/5:mode=forward:eval=init', ...textVfParts].join(',');
    await execFileAsync(FFMPEG, [
      '-y',
      '-f', 'lavfi', '-i', `color=c=${style.bg}:s=${width}x${height}:d=${dur}:r=30`,
      '-vf', vf,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      '-an', '-t', String(dur),
      outPath,
    ], { timeout: 300_000 });
  } else {
    // Animated background — pure FFmpeg geq at half-res, lanczos upscale, then vignette
    const iW    = Math.floor(width / 2);
    const iH    = Math.floor(height / 2);
    const bgGeq = getBgVfPrefix(style.bgType, style.bg, iW, iH, style.ac);
    const vf    = [
      bgGeq,
      `scale=${width}:${height}:flags=lanczos`,
      'format=yuv420p',
      'vignette=angle=PI/5:mode=forward:eval=init',
      ...textVfParts,
    ].join(',');
    await execFileAsync(FFMPEG, [
      '-y',
      '-f', 'lavfi', '-i', `nullsrc=s=${iW}x${iH}:r=30:d=${dur}`,
      '-vf', vf,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      '-an', '-t', String(dur),
      outPath,
    ], { timeout: 300_000 });
  }
}

// ── MULTI-SCENE COMBINER ──────────────────────────────────────────────────────
async function combineScenes(
  scenePaths: string[],
  sceneDurations: number[],
  outputPath: string,
  transition: string,
  transitionDur = 0.40,
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
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    outputPath,
  ];

  await execFileAsync(FFMPEG, ffmpegArgs, { timeout: 300_000 });
}

// ── AUDIO + LOGO FINALIZER ────────────────────────────────────────────────────
/**
 * Generate a TTS voiceover WAV using FFmpeg's built-in flite filter.
 */
async function generateVoiceover(
  hook: string,
  body: string,
  cta: string,
  totalDur: number,
): Promise<string | null> {
  try {
    const spoken = [hook, body, cta]
      .map(t => sanitizeVideoText(t, 300))
      .map(t => t
        .replace(/[?:=,;[\]\\]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
      )
      .filter(Boolean)
      .join(' ... ');

    const outPath = path.join(os.tmpdir(), `vo_${randomBytes(6).toString('hex')}.wav`);

    await execFileAsync(FFMPEG, [
      '-y',
      '-f', 'lavfi',
      '-i', `flite=text='${spoken.replace(/'/g, '')}':voice=kal16`,
      '-af', 'highpass=f=120,acompressor=threshold=0.4:ratio=3:attack=5:release=50,volume=1.3',
      '-t', String(totalDur),
      '-ar', '44100',
      '-ac', '2',
      outPath,
    ], { timeout: 30_000 });

    return existsSync(outPath) ? outPath : null;
  } catch (e: any) {
    const msg = e?.stderr || e?.message || String(e);
    logger.warn(`[VideoGen] Voiceover generation failed, skipping: ${msg}`);
    return null;
  }
}

async function applyAudioAndLogo(
  videoPath: string,
  outputPath: string,
  totalDur: number,
  audioProfile: AudioProfile,
  logoPath?: string,
  userAudioPath?: string,
  voiceoverText?: { hook: string; body: string; cta: string },
): Promise<void> {
  const fadeDur = Math.min(1.5, totalDur * 0.10);
  const fadeOut = Math.max(0, totalDur - fadeDur);
  const fd      = fadeDur.toFixed(2);
  const fo      = fadeOut.toFixed(2);

  // ── Three lavfi sources for layered synthesis ──────────────────────────────
  const src1 = `aevalsrc=${audioProfile.bass}|${audioProfile.bass}:sample_rate=44100:channel_layout=stereo`;
  const src2 = `aevalsrc=${audioProfile.beat}|${audioProfile.beat}:sample_rate=44100:channel_layout=stereo`;
  const src3 = `aevalsrc=${audioProfile.pad}|${audioProfile.pad}:sample_rate=44100:channel_layout=stereo`;

  const hasLogo = !!(logoPath && existsSync(logoPath));
  const hasUser = !!(userAudioPath && existsSync(userAudioPath));

  let voiceoverPath: string | null = null;
  if (voiceoverText) {
    voiceoverPath = await generateVoiceover(
      voiceoverText.hook,
      voiceoverText.body,
      voiceoverText.cta,
      totalDur,
    );
  }
  const hasVoiceover = !!(voiceoverPath && existsSync(voiceoverPath));

  // Build input list: [0]=video, [1]=bass, [2]=beat, [3]=pad, [4?]=logo, [5?]=user audio, [6?]=voiceover
  const inputs: string[] = ['-i', videoPath];
  inputs.push('-f', 'lavfi', '-i', src1);
  inputs.push('-f', 'lavfi', '-i', src2);
  inputs.push('-f', 'lavfi', '-i', src3);

  let logoIdx = -1;
  let userIdx = -1;
  let voIdx   = -1;
  let nextIdx = 4;

  if (hasLogo) {
    logoIdx = nextIdx++;
    inputs.push('-i', logoPath!);
  }
  if (hasUser) {
    userIdx = nextIdx++;
    inputs.push('-i', userAudioPath!);
  }
  if (hasVoiceover) {
    voIdx = nextIdx++;
    inputs.push('-i', voiceoverPath!);
  }

  // ── filter_complex ─────────────────────────────────────────────────────────
  const parts: string[] = [];
  const videoMap: string[] = hasLogo ? ['-map', '[vfinal]'] : ['-map', '0:v'];
  const outputLabels: string[] = [...videoMap, '-map', '[afinal]'];

  // Video chain — only needed when overlaying the logo
  if (hasLogo) {
    parts.push(
      `[${logoIdx}:v]scale=iw*0.14:ih*0.14[logo]`,
      `[0:v][logo]overlay=W-w-24:24:enable='between(t\\,0\\,${totalDur})'[vfinal]`,
    );
  }

  // Procedural synth mix (bass=1, beat=2, pad=3)
  // amix weights: bass at 1.25 (dominant), beat at 1.0, pad at 0.55
  parts.push(`[1:a][2:a][3:a]amix=inputs=3:normalize=0:weights=1.25 1.0 0.55[synth_raw]`);
  // Full EQ + stereo widening chain
  parts.push(
    `[synth_raw]${audioProfile.filters},` +
    `extrastereo=m=1.4,` +
    `afade=t=in:st=0:d=${fd},afade=t=out:st=${fo}:d=${fd}[synth]`
  );

  if (hasVoiceover && hasUser) {
    parts.push(
      `[${voIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo,` +
      `volume=1.1,afade=t=in:st=0:d=${fd},afade=t=out:st=${fo}:d=${fd}[vo_a]`,
    );
    parts.push(
      `[${userIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo,` +
      `volume=0.55,afade=t=in:st=0:d=${fd},afade=t=out:st=${fo}:d=${fd}[user_a]`,
    );
    parts.push(`[vo_a][user_a][synth]amix=inputs=3:normalize=0:weights=1.1 0.55 0.18[afinal]`);
  } else if (hasVoiceover) {
    parts.push(
      `[${voIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo,` +
      `volume=1.2,afade=t=in:st=0:d=${fd},afade=t=out:st=${fo}:d=${fd}[vo_a]`,
    );
    parts.push(`[vo_a][synth]amix=inputs=2:normalize=0:weights=1.2 0.20[afinal]`);
  } else if (hasUser) {
    parts.push(
      `[${userIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo,` +
      `volume=0.88,afade=t=in:st=0:d=${fd},afade=t=out:st=${fo}:d=${fd}[user_a]`,
    );
    parts.push(`[user_a][synth]amix=inputs=2:normalize=0:weights=1.0 0.22[afinal]`);
  } else {
    parts.push(`[synth]volume=1.0[afinal]`);
  }

  const ffmpegArgs = [
    '-y',
    ...inputs,
    '-filter_complex', parts.join(';'),
    ...outputLabels,
    '-c:v', hasLogo ? 'libx264' : 'copy',
    ...(hasLogo ? ['-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p'] : []),
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    '-t', String(totalDur),
    outputPath,
  ];

  try {
    await execFileAsync(FFMPEG, ffmpegArgs, { timeout: 180_000 });
  } catch (ffmpegErr) {
    // Some FFmpeg builds don't support equalizer/extrastereo/dynaudnorm.
    // Retry with a safe filter chain (volume + afade only) so audio is always present.
    const errMsg = ffmpegErr instanceof Error ? ffmpegErr.message : String(ffmpegErr);
    if (/No such filter|Invalid option|filter.*not found|option.*not found/i.test(errMsg)) {
      logger.warn('[VideoGen] Complex audio filters unavailable, retrying with safe fallback chain:', errMsg.slice(0, 120));
      const safeParts = parts.map((p) =>
        p
          .replace(`[synth_raw]${audioProfile.filters},extrastereo=m=1.4,`, '[synth_raw]volume=0.9,')
          .replace(`[synth_raw]${audioProfile.filters},`, '[synth_raw]volume=0.9,'),
      );
      const safeArgs = [
        '-y',
        ...inputs,
        '-filter_complex', safeParts.join(';'),
        ...outputLabels,
        '-c:v', hasLogo ? 'libx264' : 'copy',
        ...(hasLogo ? ['-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p'] : []),
        '-c:a', 'aac', '-b:a', '192k',
        '-movflags', '+faststart',
        '-t', String(totalDur),
        outputPath,
      ];
      await execFileAsync(FFMPEG, safeArgs, { timeout: 180_000 });
    } else {
      throw ffmpegErr;
    }
  }

  // Clean up temp voiceover file
  if (hasVoiceover && voiceoverPath) {
    try { unlinkSync(voiceoverPath); } catch { /* intentional: temp voiceover cleanup */ }
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
  user_audio_path?: string;
  voiceover?: boolean;
  scene_prompt?: string;
  bg_color?: string;
  accent_color?: string;
  userId?: string;
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

  const scenePrompt = opts.scene_prompt?.trim() ||
    (opts.topic ? `${opts.topic} ${genre} music` : undefined);

  // ── AI content generation via Advanced Content Pipeline ──────────────────
  let hook = opts.hook || '';
  let body = opts.body || '';
  let cta  = opts.cta  || '';
  let aiSource = 'provided';

  if (!hook && !body && !cta && opts.topic) {
    try {
      const userId = opts.userId || 'anonymous';
      const pipelineResult = await contentQualityPipeline.generateWithAdvancedAI(
        userId,
        {
          topic:      opts.topic,
          platform,
          genre:      genre !== 'default' ? genre : undefined,
          artistName: opts.artist_name || '',
          tone:       opts.tone || 'energetic',
          objective:  opts.goal === 'sales' || opts.goal === 'traffic'
                        ? 'conversions'
                        : opts.goal === 'viral'
                          ? 'viral'
                          : 'engagement',
        },
        5,
      );
      const best = pipelineResult.selected;
      if (best) {
        hook = best.headline.slice(0, 80);
        body = best.content.split('\n')[0].slice(0, 120);
        cta  = best.callToAction.slice(0, 60);
        const score = best.scores.overall;
        aiSource = `pipeline_${score.toFixed(0)}`;
        logger.info(
          `[VideoGen] Pipeline content — score=${score.toFixed(1)} ` +
          `algoAlign=${(best.scores.algorithmAlignment ?? 0).toFixed(1)} ` +
          `${score < 81 ? '⚠ below 81 threshold' : '✅ gate passed'}`
        );
      }
    } catch (e) {
      logger.warn({ err: e }, '[VideoGen] Pipeline content generation failed, using defaults:');
    }
  }

  if (!hook) hook = opts.topic?.slice(0, 60) || 'New Music Drop';
  if (!body) body = 'Stream now on all platforms';
  if (!cta)  cta  = 'Follow for more';

  // ── Scene duration split ──────────────────────────────────────────────────
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
      // ── Render 3 scenes sequentially ──────────────────────────────────────
      const hookPath = tempPath('hook');
      const bodyPath = tempPath('body');
      const ctaPath  = tempPath('cta');
      tempFiles.push(hookPath, bodyPath, ctaPath);

      await renderScene({ type: 'hook', primaryText: hook, artistName: opts.artist_name, duration: sceneDurations[0], style, width, height, outPath: hookPath, genre, scene_prompt: scenePrompt, platform });
      await renderScene({ type: 'body', primaryText: body, artistName: opts.artist_name, duration: sceneDurations[1], style, width, height, outPath: bodyPath, genre, scene_prompt: scenePrompt, platform });
      await renderScene({ type: 'cta',  primaryText: cta,  secondaryText: body, artistName: opts.artist_name, duration: sceneDurations[2], style, width, height, outPath: ctaPath, genre, scene_prompt: scenePrompt, platform });

      // ── Combine with xfade ────────────────────────────────────────────────
      const combinedPath = tempPath('combined');
      tempFiles.push(combinedPath);
      await combineScenes([hookPath, bodyPath, ctaPath], sceneDurations, combinedPath, style.transition);

      // ── Add audio (+ logo if provided) ────────────────────────────────────
      const filename = `video_${randomBytes(6).toString('hex')}.mp4`;
      const finalPath = path.join(OUTPUT_DIR, filename);
      const transitionDur = 0.40;
      const combinedDur = sceneDurations.reduce((a, b) => a + b, 0) - 2 * transitionDur;
      await applyAudioAndLogo(combinedPath, finalPath, combinedDur, audioProfile, opts.logo_path, opts.user_audio_path,
        opts.voiceover ? { hook, body, cta } : undefined);

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
        quality: 'cinematic',
        capabilities: [
          'animated_background', 'vignette', 'slide_up_text', 'drop_shadow',
          'multi_scene', 'audio_track', 'multi_font',
          ...(opts.logo_path ? ['logo_overlay'] : []),
        ],
      };

    } else {
      // ── Single-scene (short videos < 9s) ──────────────────────────────────
      const scenePath = tempPath('single');
      tempFiles.push(scenePath);

      const mc = Math.max(16, Math.floor(width / (style.bs * 0.58)));
      const { hs, bs, cs } = scaleFonts(style, width, platform);
      const font  = FONTS[style.font];
      const barH  = Math.floor(height * 0.085);
      const hookEnd   = totalDur * 0.45;
      const bodyStart = totalDur * 0.25;
      const bodyEnd   = totalDur * 0.75;
      const ctaStart  = totalDur * 0.62;
      const boxW = Math.floor(width * 0.82);
      const boxX = Math.floor((width - boxW) / 2);
      const boxY = Math.floor(height * 0.70);
      const boxH = cs + 44;

      const vfParts: string[] = [];

      // Accent bars
      vfParts.push(`drawbox=x=0:y=0:w=${width}:h=${barH}:color=${style.ac}@0.30:t=fill`);
      vfParts.push(`drawbox=x=0:y=${height - barH}:w=${width}:h=${barH}:color=${style.ac}@0.30:t=fill`);

      if (opts.artist_name) {
        const at     = escFFmpeg(sanitizeVideoText(opts.artist_name).toUpperCase());
        const atSize = Math.floor(bs * 0.62);
        vfParts.push(
          `drawtext=fontfile=${FONTS.mono}:text='${at}':fontcolor=black@0.40:fontsize=${atSize}` +
          `:x=(w-text_w)/2+3:y=h*0.05+3`
        );
        vfParts.push(
          `drawtext=fontfile=${FONTS.mono}:text='${at}':fontcolor=${style.ac}:fontsize=${atSize}` +
          `:x=(w-text_w)/2:y=h*0.05`
        );
      }

      // Hook text with shadow + slide-up
      const ht = escFFmpeg(wrap(sanitizeVideoText(hook), mc));
      vfParts.push(
        `drawtext=fontfile=${font}:text='${ht}':fontcolor=black@0.45:fontsize=${hs}` +
        `:x=(w-text_w)/2+4:y=(h-text_h)/4+4` +
        `:enable='between(t\\,0.3\\,${hookEnd.toFixed(1)})'` +
        `:alpha='if(lt(t\\,0.8)\\,min(1\\,(t-0.3)*2)\\,if(gt(t\\,${(hookEnd-0.5).toFixed(1)})\\,max(0\\,(${hookEnd.toFixed(1)}-t)*2)\\,1))'`
      );
      vfParts.push(
        `drawtext=fontfile=${font}:text='${ht}':fontcolor=${style.tc}:fontsize=${hs}` +
        `:x=(w-text_w)/2:y=(h-text_h)/4` +
        `:enable='between(t\\,0.3\\,${hookEnd.toFixed(1)})'` +
        `:alpha='if(lt(t\\,0.8)\\,min(1\\,(t-0.3)*2)\\,if(gt(t\\,${(hookEnd-0.5).toFixed(1)})\\,max(0\\,(${hookEnd.toFixed(1)}-t)*2)\\,1))'` +
        `:bordercolor=${style.ac}:borderw=2`
      );

      // Body text
      const bt = escFFmpeg(wrap(sanitizeVideoText(body), mc));
      vfParts.push(
        `drawtext=fontfile=${FONTS.regular}:text='${bt}':fontcolor=${style.tc}:fontsize=${bs}` +
        `:x=(w-text_w)/2:y=(h-text_h)/2` +
        `:enable='between(t\\,${bodyStart.toFixed(1)}\\,${bodyEnd.toFixed(1)})'` +
        `:alpha='if(lt(t\\,${(bodyStart+0.5).toFixed(1)})\\,min(1\\,(t-${bodyStart.toFixed(1)})*2)\\,if(gt(t\\,${(bodyEnd-0.5).toFixed(1)})\\,max(0\\,(${bodyEnd.toFixed(1)}-t)*2)\\,1))'`
      );

      // CTA pill with dual accent lines
      vfParts.push(
        `drawbox=x=${boxX}:y=${boxY}:w=${boxW}:h=${boxH}:color=${style.cta_bg}@0.94:t=fill` +
        `:enable='between(t\\,${ctaStart.toFixed(1)}\\,${totalDur})'`
      );
      vfParts.push(
        `drawbox=x=${boxX}:y=${boxY}:w=${boxW}:h=4:color=${style.ac}:t=fill` +
        `:enable='between(t\\,${ctaStart.toFixed(1)}\\,${totalDur})'`
      );
      vfParts.push(
        `drawbox=x=${boxX}:y=${boxY + boxH - 4}:w=${boxW}:h=4:color=${style.ac}@0.55:t=fill` +
        `:enable='between(t\\,${ctaStart.toFixed(1)}\\,${totalDur})'`
      );
      const ct = escFFmpeg(wrap(sanitizeVideoText(cta), mc));
      vfParts.push(
        `drawtext=fontfile=${font}:text='${ct}':fontcolor=white:fontsize=${cs}` +
        `:x=(w-text_w)/2:y=h*0.72` +
        `:enable='between(t\\,${ctaStart.toFixed(1)}\\,${totalDur})'` +
        `:alpha='if(lt(t\\,${(ctaStart+0.3).toFixed(1)})\\,min(1\\,(t-${ctaStart.toFixed(1)})*3)\\,1)'`
      );

      if (style.bgType === 'solid') {
        const vf = ['format=yuv420p', 'vignette=angle=PI/5:mode=forward:eval=init', ...vfParts].join(',');
        await execFileAsync(FFMPEG, [
          '-y',
          '-f', 'lavfi', '-i', `color=c=${style.bg}:s=${width}x${height}:d=${totalDur}:r=30`,
          '-vf', vf,
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
          '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
          '-an', '-t', String(totalDur), scenePath,
        ], { timeout: 300_000 });
      } else {
        const iW    = Math.floor(width / 2);
        const iH    = Math.floor(height / 2);
        const bgGeq = getBgVfPrefix(style.bgType, style.bg, iW, iH, style.ac);
        const vfAnim = [
          bgGeq,
          `scale=${width}:${height}:flags=lanczos`,
          'format=yuv420p',
          'vignette=angle=PI/5:mode=forward:eval=init',
          ...vfParts,
        ].join(',');
        await execFileAsync(FFMPEG, [
          '-y',
          '-f', 'lavfi', '-i', `nullsrc=s=${iW}x${iH}:r=30:d=${totalDur}`,
          '-vf', vfAnim,
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
          '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
          '-an', '-t', String(totalDur), scenePath,
        ], { timeout: 300_000 });
      }

      const filename = `video_${randomBytes(6).toString('hex')}.mp4`;
      const finalPath = path.join(OUTPUT_DIR, filename);
      await applyAudioAndLogo(scenePath, finalPath, totalDur, audioProfile, opts.logo_path, opts.user_audio_path,
        opts.voiceover ? { hook, body, cta } : undefined);

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
        quality: 'cinematic',
        capabilities: [
          'animated_background', 'vignette', 'drop_shadow', 'text_outline',
          'audio_track', 'multi_font',
          ...(opts.logo_path ? ['logo_overlay'] : []),
        ],
      };
    }

  } catch (err: any) {
    cleanup(...tempFiles);
    logger.warn('[VideoGen] Render failed:', err?.stderr || err?.message);
    return { success: false, error: `Video render failed: ${err?.message || 'FFmpeg error'}` };
  }
}
