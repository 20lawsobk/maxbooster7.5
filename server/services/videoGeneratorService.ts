import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdirSync, existsSync } from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { unifiedAIController } from './unifiedAIController.js';
import { logger } from '../logger.js';

const execFileAsync = promisify(execFile);

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const FONT_REG = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';

const OUTPUT_DIR = path.join(process.cwd(), 'uploads', 'videos');

const ASPECT_RATIOS: Record<string, [number, number]> = {
  '9:16': [1080, 1920],
  '16:9': [1920, 1080],
  '1:1': [1080, 1080],
  '4:5': [1080, 1350],
};

const PLATFORM_RATIOS: Record<string, string> = {
  tiktok: '9:16',
  instagram: '1:1',
  instagram_reels: '9:16',
  youtube: '16:9',
  facebook: '1:1',
  twitter: '16:9',
  linkedin: '16:9',
  threads: '1:1',
  googlebusiness: '16:9',
};

const TEMPLATE_STYLES: Record<string, {
  bg: string; tc: string; ac: string; cta_bg: string;
  hs: number; bs: number; cs: number;
  name: string;
}> = {
  cinematic_promo:  { bg: '0x1a1a2e', tc: '0xffffff', ac: '0xe94560', cta_bg: '0xe94560', hs: 64, bs: 42, cs: 48, name: 'Cinematic Promo' },
  neon_pulse:       { bg: '0x0d0221', tc: '0x00fff5', ac: '0xff6ec7', cta_bg: '0xff6ec7', hs: 62, bs: 44, cs: 46, name: 'Neon Pulse' },
  dark_cinema:      { bg: '0x0a0a0a', tc: '0xe0e0e0', ac: '0x444466', cta_bg: '0x222244', hs: 60, bs: 40, cs: 44, name: 'Dark Cinema' },
  aurora:           { bg: '0x0d1b2a', tc: '0xffffff', ac: '0x40e0d0', cta_bg: '0x20a090', hs: 62, bs: 42, cs: 46, name: 'Aurora' },
  music_video:      { bg: '0x1a0030', tc: '0xffffff', ac: '0xff00ff', cta_bg: '0xcc00cc', hs: 66, bs: 44, cs: 48, name: 'Music Video' },
  gold_luxury:      { bg: '0x1a1000', tc: '0xf5e642', ac: '0xd4af37', cta_bg: '0xb8960c', hs: 60, bs: 40, cs: 44, name: 'Gold Luxury' },
  elegant_minimal:  { bg: '0xfafafa', tc: '0x1a1a1a', ac: '0x8b7355', cta_bg: '0x1a1a1a', hs: 60, bs: 40, cs: 44, name: 'Elegant Minimal' },
  vintage_film:     { bg: '0x2a1a0a', tc: '0xf0dfc0', ac: '0xaa7755', cta_bg: '0x8a5533', hs: 58, bs: 40, cs: 42, name: 'Vintage Film' },
  ocean_wave:       { bg: '0x001a3a', tc: '0xffffff', ac: '0x006994', cta_bg: '0x004a72', hs: 60, bs: 42, cs: 44, name: 'Ocean Wave' },
  fire_ember:       { bg: '0x1a0500', tc: '0xffffff', ac: '0xff4500', cta_bg: '0xcc3300', hs: 62, bs: 44, cs: 46, name: 'Fire & Ember' },
  storyteller:      { bg: '0x1a1a2e', tc: '0xe0e0e0', ac: '0x6655aa', cta_bg: '0x443388', hs: 60, bs: 40, cs: 44, name: 'Storyteller' },
  promo:            { bg: '0x1a1a2e', tc: '0xffffff', ac: '0xe94560', cta_bg: '0xe94560', hs: 62, bs: 42, cs: 46, name: 'Quick Promo' },
  lyric:            { bg: '0x0f0f23', tc: '0xffffff', ac: '0xffd700', cta_bg: '0x333366', hs: 56, bs: 52, cs: 40, name: 'Quick Lyric' },
  announcement:     { bg: '0x16213e', tc: '0xe2e2e2', ac: '0x0f3460', cta_bg: '0xe94560', hs: 58, bs: 44, cs: 46, name: 'Announcement' },
  minimal:          { bg: '0xfafafa', tc: '0x1a1a1a', ac: '0x333333', cta_bg: '0x1a1a1a', hs: 60, bs: 40, cs: 44, name: 'Quick Minimal' },
  neon:             { bg: '0x0d0221', tc: '0x00fff5', ac: '0xff6ec7', cta_bg: '0xff6ec7', hs: 62, bs: 44, cs: 46, name: 'Quick Neon' },
};

function escFFmpeg(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/;/g, '\\;')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function wrap(text: string, maxChars = 28): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur && cur.length + w.length + 1 > maxChars) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cur ? `${cur} ${w}` : w;
    }
  }
  if (cur) lines.push(cur);
  return lines.join('\n');
}

export interface VideoGenOptions {
  topic: string;
  platform?: string;
  template?: string;
  aspect_ratio?: string;
  duration?: number;
  tone?: string;
  goal?: string;
  artist_name?: string;
  quality?: string;
  hook?: string;
  body?: string;
  cta?: string;
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
  error?: string;
}

export async function generateVideo(opts: VideoGenOptions): Promise<VideoGenResult> {
  const startMs = Date.now();

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const platform = opts.platform || 'tiktok';
  const templateKey = opts.template || 'cinematic_promo';
  const style = TEMPLATE_STYLES[templateKey] || TEMPLATE_STYLES['cinematic_promo'];

  const ratio = opts.aspect_ratio || PLATFORM_RATIOS[platform] || '9:16';
  const [width, height] = ASPECT_RATIOS[ratio] || [1080, 1920];
  const dur = Math.max(5, Math.min(opts.duration || 10, 30));

  let hook = opts.hook || '';
  let body = opts.body || '';
  let cta = opts.cta || '';
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
      });

      if (aiResult.success && aiResult.data) {
        const d = aiResult.data as any;
        hook = d.hook || d.caption?.split('\n')[0] || `New Music: ${opts.topic}`;
        body = d.body || d.caption?.split('\n')[1] || `Stream now on all platforms`;
        cta = d.cta || 'Follow for more';
        aiSource = 'ai_model';
      }
    } catch (e) {
      logger.warn('[VideoGen] AI content generation failed, using topic as hook:', e);
    }
  }

  if (!hook) hook = opts.topic?.slice(0, 60) || 'New Music Drop';
  if (!body) body = 'Stream now on all platforms';
  if (!cta) cta = 'Follow for more';

  const mc = Math.max(18, Math.floor(width / (style.bs * 0.6)));

  const hookEnd = dur * 0.45;
  const bodyStart = dur * 0.25;
  const bodyEnd = dur * 0.75;
  const ctaStart = dur * 0.6;
  const barH = Math.floor(height * 0.10);
  const boxW = Math.floor(width * 0.8);
  const boxX = Math.floor((width - boxW) / 2);
  const boxY = Math.floor(height * 0.72);

  let hs = style.hs, bs = style.bs, cs = style.cs;
  if (width < 1080) {
    const s = width / 1080;
    hs = Math.floor(hs * s);
    bs = Math.floor(bs * s);
    cs = Math.floor(cs * s);
  }

  const vfParts: string[] = [];

  vfParts.push(`drawbox=x=0:y=0:w=${width}:h=${barH}:color=${style.ac}@0.25:t=fill`);
  vfParts.push(`drawbox=x=0:y=${height - barH}:w=${width}:h=${barH}:color=${style.ac}@0.25:t=fill`);

  if (opts.artist_name) {
    const at = escFFmpeg(opts.artist_name);
    vfParts.push(
      `drawtext=fontfile=${FONT_BOLD}:text='${at}':fontcolor=${style.ac}:fontsize=${Math.floor(bs * 0.7)}` +
      `:x=(w-text_w)/2:y=h*0.06`
    );
  }

  if (hook) {
    const ht = escFFmpeg(wrap(hook, mc));
    vfParts.push(
      `drawtext=fontfile=${FONT_BOLD}:text='${ht}':fontcolor=${style.tc}:fontsize=${hs}` +
      `:x=(w-text_w)/2:y=(h-text_h)/4` +
      `:enable='between(t\\,0.3\\,${hookEnd.toFixed(1)})'` +
      `:alpha='if(lt(t\\,0.8)\\,min(1\\,(t-0.3)*2)\\,if(gt(t\\,${(hookEnd - 0.5).toFixed(1)})\\,max(0\\,(${hookEnd.toFixed(1)}-t)*2)\\,1))'`
    );
  }

  if (body) {
    const bt = escFFmpeg(wrap(body, mc));
    vfParts.push(
      `drawtext=fontfile=${FONT_REG}:text='${bt}':fontcolor=${style.tc}:fontsize=${bs}` +
      `:x=(w-text_w)/2:y=(h-text_h)/2` +
      `:enable='between(t\\,${bodyStart.toFixed(1)}\\,${bodyEnd.toFixed(1)})'` +
      `:alpha='if(lt(t\\,${(bodyStart + 0.5).toFixed(1)})\\,min(1\\,(t-${bodyStart.toFixed(1)})*2)\\,if(gt(t\\,${(bodyEnd - 0.5).toFixed(1)})\\,max(0\\,(${bodyEnd.toFixed(1)}-t)*2)\\,1))'`
    );
  }

  if (cta) {
    const ct = escFFmpeg(wrap(cta, mc));
    vfParts.push(
      `drawbox=x=${boxX}:y=${boxY}:w=${boxW}:h=${cs + 40}:color=${style.cta_bg}@0.85:t=fill` +
      `:enable='between(t\\,${ctaStart.toFixed(1)}\\,${dur.toFixed(1)})'`
    );
    vfParts.push(
      `drawtext=fontfile=${FONT_BOLD}:text='${ct}':fontcolor=white:fontsize=${cs}` +
      `:x=(w-text_w)/2:y=h*0.73` +
      `:enable='between(t\\,${ctaStart.toFixed(1)}\\,${dur.toFixed(1)})'` +
      `:alpha='if(lt(t\\,${(ctaStart + 0.3).toFixed(1)})\\,min(1\\,(t-${ctaStart.toFixed(1)})*3)\\,1)'`
    );
  }

  const vf = vfParts.join(',');
  const filename = `video_${randomBytes(6).toString('hex')}.mp4`;
  const outPath = path.join(OUTPUT_DIR, filename);

  const ffmpegArgs = [
    '-y',
    '-f', 'lavfi', '-i', `color=c=${style.bg}:s=${width}x${height}:d=${dur}:r=30`,
    '-vf', vf,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-t', String(dur),
    outPath,
  ];

  const renderStart = Date.now();
  try {
    await execFileAsync(FFMPEG, ffmpegArgs, { timeout: 90000 });
  } catch (err: any) {
    logger.error('[VideoGen] FFmpeg failed:', err?.stderr || err?.message);
    return { success: false, error: `Video render failed: ${err?.message || 'FFmpeg error'}` };
  }
  const renderMs = Date.now() - renderStart;

  logger.info(`[VideoGen] ✅ Rendered ${filename} (${width}x${height}, ${dur}s, ${renderMs}ms)`);

  return {
    success: true,
    url: `/uploads/videos/${filename}`,
    filename,
    width,
    height,
    duration: dur,
    hook,
    body,
    cta,
    template: templateKey,
    template_name: style.name,
    scenes_rendered: 3,
    processing_time_ms: Date.now() - startMs,
    render_time_ms: renderMs,
    source: aiSource,
    quality: opts.quality || 'cinematic',
  };
}
