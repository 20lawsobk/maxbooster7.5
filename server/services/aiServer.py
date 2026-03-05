#!/usr/bin/env python3
"""
Max Booster — Python AI Microservice
FastAPI server on port 9878 that handles:
  - Video generation (via frameGenerator.py + FFmpeg)
  - Content generation (AI text for social media)
  - Image analysis (via imageAnalyzer.py)
  - Visual spec generation
  - Cinematic template catalogue
"""

import os
import sys
import json
import time
import uuid
import asyncio
import subprocess
import threading
from pathlib import Path
from typing import Optional, Dict, Any

import uvicorn
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ── Paths ──────────────────────────────────────────────────────────────────────
SERVICE_DIR   = Path(__file__).parent
WORKSPACE_DIR = SERVICE_DIR.parent.parent          # /home/runner/workspace
FRAME_GEN     = SERVICE_DIR / 'frameGenerator.py'
IMAGE_ANAL    = SERVICE_DIR / 'imageAnalyzer.py'
OUTPUT_DIR    = WORKSPACE_DIR / 'uploads' / 'videos'
TEMP_DIR      = WORKSPACE_DIR / 'uploads' / 'video_temp'

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
TEMP_DIR.mkdir(parents=True, exist_ok=True)

# ── Resolve FFmpeg ─────────────────────────────────────────────────────────────
def _find_ffmpeg() -> str:
    if 'FFMPEG_PATH' in os.environ:
        return os.environ['FFMPEG_PATH']
    try:
        result = subprocess.run(['/bin/sh', '-c', 'which ffmpeg'],
                                capture_output=True, text=True, timeout=5)
        path = result.stdout.strip()
        if path:
            return path
    except Exception:
        pass
    for candidate in ['/run/current-system/sw/bin/ffmpeg',
                      '/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg']:
        if os.path.exists(candidate):
            return candidate
    return 'ffmpeg'

FFMPEG = _find_ffmpeg()

# ── In-memory job store ────────────────────────────────────────────────────────
_jobs: Dict[str, Dict[str, Any]] = {}
_jobs_lock = threading.Lock()

def _new_job(payload: dict) -> str:
    jid = str(uuid.uuid4())
    with _jobs_lock:
        _jobs[jid] = {'status': 'queued', 'payload': payload, 'result': None, 'error': None,
                      'created_at': time.time()}
    return jid

def _set_job(jid: str, **kwargs):
    with _jobs_lock:
        if jid in _jobs:
            _jobs[jid].update(kwargs)

def _get_job(jid: str) -> Optional[Dict]:
    with _jobs_lock:
        return _jobs.get(jid)

# ── Template catalogue ─────────────────────────────────────────────────────────
TEMPLATES = [
    {'id': 'cinematic_promo',  'name': 'Cinematic Promo',  'description': 'Film-quality dramatic lighting',  'colors': ['#1a1a2e','#e94560']},
    {'id': 'neon_pulse',       'name': 'Neon Pulse',        'description': 'Vibrant plasma energy',           'colors': ['#0d0221','#00fff5']},
    {'id': 'dark_cinema',      'name': 'Dark Cinema',       'description': 'Moody atmospheric film',          'colors': ['#0a0a0a','#444466']},
    {'id': 'aurora',           'name': 'Aurora',            'description': 'Northern lights waves',           'colors': ['#0d1b2a','#40e0d0']},
    {'id': 'music_video',      'name': 'Music Video',       'description': 'High-energy bold colors',         'colors': ['#1a0030','#ff00ff']},
    {'id': 'gold_luxury',      'name': 'Gold Luxury',       'description': 'Premium gold aesthetic',          'colors': ['#1a1000','#d4af37']},
    {'id': 'elegant_minimal',  'name': 'Elegant',           'description': 'Clean sophisticated',             'colors': ['#fafafa','#8b7355']},
    {'id': 'vintage_film',     'name': 'Vintage Film',      'description': 'Retro 8mm aesthetic',             'colors': ['#2a1a0a','#aa7755']},
    {'id': 'ocean_wave',       'name': 'Ocean Wave',        'description': 'Calming ocean gradients',         'colors': ['#001a3a','#006994']},
    {'id': 'fire_ember',       'name': 'Fire & Ember',      'description': 'Intense warm tones',              'colors': ['#1a0500','#ff4500']},
    {'id': 'storyteller',      'name': 'Storyteller',       'description': 'Narrative progression',           'colors': ['#1a1a2e','#6655aa']},
]

PLATFORMS = ['TikTok','Instagram Reels','YouTube Shorts','Twitter/X','Facebook']
ASPECT_RATIOS = [
    {'id': '9:16', 'name': 'Vertical (9:16)',  'platforms': ['TikTok','Reels','Stories','Shorts']},
    {'id': '1:1',  'name': 'Square (1:1)',      'platforms': ['Instagram','Twitter','Facebook']},
    {'id': '16:9', 'name': 'Landscape (16:9)', 'platforms': ['YouTube','Twitter']},
]

# ── Content generation ─────────────────────────────────────────────────────────
HOOK_TEMPLATES = {
    'energetic':  ["🔥 {topic} just dropped!", "This {topic} slaps different 🎵", "You need to hear {topic} NOW"],
    'chill':      ["Vibing to {topic} 🎶", "Lost in {topic} tonight ✨", "Let {topic} wash over you"],
    'hype':       ["🚀 {topic} IS HERE", "MASSIVE DROP: {topic} 🔥", "{topic} about to go viral"],
    'emotional':  ["This {topic} hits different 💔", "{topic} gave me chills ✨", "Had to share {topic}"],
}
BODY_TEMPLATES = {
    'hip-hop':    ["Bars are hitting 🎤 | Stream on all platforms | New vibes dropping daily"],
    'r&b':        ["Smooth grooves 🎵 | Love & soul in every note | Stream everywhere"],
    'pop':        ["Catchy hooks 🎶 | Feel-good energy | Your new favorite song"],
    'default':    ["Fresh sound 🎵 | Quality music | Available everywhere"],
}
CTA_TEMPLATES = ["Follow for daily music drops", "Stream now — link in bio 🔗",
                 "Save this for the vibe 🎵", "Share with someone who needs this ✨"]

def _gen_content(topic: str, platform: str, tone: str, genre: str) -> dict:
    import random
    hook_list = HOOK_TEMPLATES.get(tone, HOOK_TEMPLATES['energetic'])
    hook = random.choice(hook_list).replace('{topic}', topic or 'this track')
    body_list = BODY_TEMPLATES.get(genre, BODY_TEMPLATES['default'])
    body = random.choice(body_list)
    cta  = random.choice(CTA_TEMPLATES)
    tags = ['#newmusic','#musicartist','#indieartist','#streamingmusic',f'#{genre.replace("-","")}',
            '#hiphop','#rnb','#newrelease','#musicproducer','#unsigned']
    random.shuffle(tags)
    return {
        'success': True, 'platform': platform,
        'caption': f"{hook}\n\n{body}\n\n{' '.join(tags[:6])}",
        'content': body, 'hashtags': tags[:8], 'hook': hook, 'body': body, 'cta': cta,
        'posting_time': '7:00 PM', 'processing_time_ms': 50,
    }

# ── Video generation (background thread) ──────────────────────────────────────
def _run_video_job(jid: str, opts: dict):
    _set_job(jid, status='running', started_at=time.time())
    try:
        result = _generate_video_sync(opts)
        _set_job(jid, status='done', result=result)
    except Exception as e:
        _set_job(jid, status='error', error=str(e))

def _generate_video_sync(opts: dict) -> dict:
    """Full video generation: Python frames → FFmpeg. Returns result dict."""
    import os, random, secrets
    from string import hexdigits

    template   = opts.get('template', 'cinematic_promo')
    platform   = opts.get('platform', 'tiktok')
    duration   = max(6, min(int(opts.get('duration', 10)), 30))
    hook_text  = opts.get('hook') or opts.get('topic') or 'New Music Drop'
    body_text  = opts.get('body') or 'Stream now on all platforms'
    cta_text   = opts.get('cta')  or 'Follow for more'
    artist     = opts.get('artist_name') or ''
    genre      = (opts.get('genre') or 'hip-hop').lower()
    quality    = opts.get('quality') or 'cinematic'
    ar_str     = opts.get('aspect_ratio') or '9:16'

    # Resolution
    AR_MAP = {'9:16': (1080,1920), '1:1': (1080,1080), '16:9': (1920,1080), '4:5': (1080,1350)}
    width, height = AR_MAP.get(ar_str, (1080,1920))

    # Style
    STYLE_BG = {
        'cinematic_promo': 'plasma_fractal', 'neon_pulse': 'neon_tunnel',
        'dark_cinema': 'solid',              'aurora': 'aurora_curtains',
        'music_video': 'plasma_fractal',     'gold_luxury': 'crystal_facets',
        'elegant_minimal': 'solid',          'vintage_film': 'crystal_facets',
        'ocean_wave': 'galaxy_spiral',       'fire_ember': 'fire_embers',
        'storyteller': 'galaxy_spiral',
    }
    STYLE_COLORS = {
        'cinematic_promo': ('#1a1a2e','#e94560','#ffffff'),
        'neon_pulse':      ('#0d0221','#ff6ec7','#00fff5'),
        'dark_cinema':     ('#0a0a0a','#444466','#e0e0e0'),
        'aurora':          ('#0d1b2a','#40e0d0','#ffffff'),
        'music_video':     ('#1a0030','#ff00ff','#ffffff'),
        'gold_luxury':     ('#1a1000','#d4af37','#f5e642'),
        'elegant_minimal': ('#fafafa','#8b7355','#1a1a1a'),
        'vintage_film':    ('#2a1a0a','#aa7755','#f0dfc0'),
        'ocean_wave':      ('#001a3a','#006994','#ffffff'),
        'fire_ember':      ('#1a0500','#ff4500','#ffffff'),
        'storyteller':     ('#1a1a2e','#6655aa','#e0e0e0'),
    }
    bg_style   = STYLE_BG.get(template, 'plasma_fractal')
    bg_color, ac_color, tc_color = STYLE_COLORS.get(template, ('#1a1a2e','#e94560','#ffffff'))
    is_solid   = (bg_style == 'solid')

    token      = secrets.token_hex(6)
    out_name   = f'video_{token}.mp4'
    out_path   = str(OUTPUT_DIR / out_name)
    temp_hook  = str(TEMP_DIR / f'hook_{token}.mp4')
    temp_body  = str(TEMP_DIR / f'body_{token}.mp4')
    temp_cta   = str(TEMP_DIR / f'cta_{token}.mp4')
    temp_combo = str(TEMP_DIR / f'combo_{token}.mp4')

    FONT_DIR   = '/usr/share/fonts/truetype/dejavu'
    FONT_BOLD  = f'{FONT_DIR}/DejaVuSans-Bold.ttf'
    FONT_REG   = f'{FONT_DIR}/DejaVuSans.ttf'
    FONT_MONO  = f'{FONT_DIR}/DejaVuSansMono-Bold.ttf'

    def esc(s: str) -> str:
        return s.replace("'", "\\'").replace(':', '\\:').replace('%', '\\%')

    def make_vf(txt_main: str, txt_sub: str = '', scene: str = 'hook',
                w=width, h=height) -> str:
        bars = [
            f"drawbox=x=0:y=0:w={w}:h={h//12}:color={ac_color}@0.28:t=fill",
            f"drawbox=x=0:y={h-h//12}:w={w}:h={h//12}:color={ac_color}@0.28:t=fill",
        ]
        if artist:
            bars.append(
                f"drawtext=fontfile={FONT_MONO}:text='{esc(artist.upper())}':"
                f"fontcolor={ac_color}:fontsize={w//18}:x=(w-text_w)/2:y=h*0.05")
        if scene == 'hook':
            bars.append(
                f"drawtext=fontfile={FONT_BOLD}:text='{esc(txt_main)}':"
                f"fontcolor={tc_color}:fontsize={w//16}:x=(w-text_w)/2:y=(h-text_h)/4:"
                f"alpha='min(1,t*3)'")
        elif scene == 'body':
            bars.append(
                f"drawtext=fontfile={FONT_REG}:text='{esc(txt_main)}':"
                f"fontcolor={tc_color}:fontsize={w//20}:x=(w-text_w)/2:y=(h-text_h)/2:"
                f"alpha='min(1,t*3)'")
        else:  # cta
            bw = int(w*0.82); bx = (w-bw)//2; by = int(h*0.68)
            bars += [
                f"drawbox=x={bx}:y={by}:w={bw}:h=80:color={ac_color}@0.92:t=fill:enable='gte(t,0.2)'",
                f"drawtext=fontfile={FONT_BOLD}:text='{esc(txt_main)}':"
                f"fontcolor=white:fontsize={w//18}:x=(w-text_w)/2:y=h*0.70:"
                f"alpha='min(1,t*5)'",
            ]
        return 'format=yuv420p,' + ','.join(bars)

    # Scene durations
    d_hook = max(3, round(duration * 0.40))
    d_body = max(3, round(duration * 0.35))
    d_cta  = max(2, duration - d_hook - d_body)
    scenes = [(temp_hook, d_hook, hook_text, '', 'hook'),
              (temp_body, d_body, body_text, '', 'body'),
              (temp_cta,  d_cta,  cta_text,  body_text, 'cta')]

    # ── Inner resolution (Python renders at half res, FFmpeg upscales) ──
    scale  = 2
    iw, ih = width // scale, height // scale

    def render_scene(out: str, dur: int, txt: str, sub: str, stype: str):
        vf = make_vf(txt, sub, stype)
        if is_solid:
            cmd = [FFMPEG, '-y', '-f', 'lavfi', '-i',
                   f'color=c={bg_color}:s={width}x{height}:d={dur}:r=30',
                   '-vf', vf, '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
                   '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
                   '-an', '-t', str(dur), out]
            r = subprocess.run(cmd, capture_output=True, timeout=90)
            if r.returncode != 0:
                raise RuntimeError(f'FFmpeg solid bg failed (code {r.returncode}): {r.stderr.decode()[-400:]}')
        else:
            cfg = json.dumps({
                'style': bg_style, 'width': iw, 'height': ih, 'duration': dur,
                'fps': 30, 'render_scale': 1, 'bg': bg_color, 'ac': ac_color,
                'genre': genre, 'eq_bars': True, 'eq_height': 0.12, 'eq_n_bars': 32,
                'speed': 1.0, 'intensity': 0.88,
            })
            scale_vf = f'scale={width}:{height}:flags=lanczos,' if iw != width else ''
            full_vf  = f'{scale_vf}{vf}'
            py_proc  = subprocess.Popen(
                [sys.executable, str(FRAME_GEN), cfg],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            ff_cmd   = [FFMPEG, '-y',
                        '-f', 'rawvideo', '-pix_fmt', 'rgb24',
                        '-s', f'{iw}x{ih}', '-r', '30',
                        '-i', 'pipe:0',
                        '-vf', full_vf,
                        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
                        '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
                        '-an', '-frames:v', str(dur * 30), out]
            ff_proc  = subprocess.Popen(ff_cmd, stdin=py_proc.stdout,
                                        stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            py_proc.stdout.close()
            ff_out, ff_err = ff_proc.communicate(timeout=120)
            py_proc.wait(timeout=10)
            if ff_proc.returncode != 0:
                raise RuntimeError(f'FFmpeg failed: {ff_err.decode()[-300:]}')

    # Render scenes (sequential to avoid memory pressure)
    t0 = time.time()
    for (out, dur, txt, sub, stype) in scenes:
        render_scene(out, dur, txt, sub, stype)

    # ── Combine with xfade ──────────────────────────────────────────────────
    combo_dur = d_hook + d_body + d_cta - 2 * 0.5
    xfade_cmd = [
        FFMPEG, '-y',
        '-i', temp_hook, '-i', temp_body, '-i', temp_cta,
        '-filter_complex',
        f'[0][1]xfade=transition=fadeblack:duration=0.5:offset={d_hook-0.5}[v01];'
        f'[v01][2]xfade=transition=fadeblack:duration=0.5:offset={d_hook+d_body-1.0}[vout]',
        '-map', '[vout]', '-c:v', 'libx264', '-preset', 'fast', '-crf', '21',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', temp_combo,
    ]
    r = subprocess.run(xfade_cmd, capture_output=True, timeout=120)
    if r.returncode != 0:
        raise RuntimeError(f'FFmpeg xfade failed (code {r.returncode}): {r.stderr.decode()[-400:]}')

    # ── Add procedural audio ────────────────────────────────────────────────
    AUDIO_PROFILES = {
        'hip-hop':    "0.12*sin(2*PI*55*t)+0.08*sin(2*PI*110*t)+0.05*sin(2*PI*165*t)+0.03*sin(2*PI*220*t)",
        'trap':       "0.15*sin(2*PI*55*t)+0.10*sin(2*PI*110*t)+0.05*sin(2*PI*440*t)+0.03*sin(2*PI*880*t)",
        'r&b':        "0.10*sin(2*PI*110*t)+0.08*sin(2*PI*138.59*t)+0.07*sin(2*PI*164.81*t)+0.04*sin(2*PI*220*t)",
        'pop':        "0.08*sin(2*PI*261.63*t)+0.07*sin(2*PI*329.63*t)+0.06*sin(2*PI*392.00*t)+0.04*sin(2*PI*523.25*t)",
        'electronic': "0.10*sin(2*PI*220*t)+0.08*sin(2*PI*261.63*t)+0.07*sin(2*PI*293.66*t)+0.05*sin(2*PI*349.23*t)",
        'country':    "0.09*sin(2*PI*196*t)+0.08*sin(2*PI*246.94*t)+0.07*sin(2*PI*293.66*t)+0.05*sin(2*PI*392*t)",
        'rock':       "0.12*sin(2*PI*82.41*t)+0.09*sin(2*PI*110*t)+0.07*sin(2*PI*164.81*t)+0.05*sin(2*PI*220*t)",
        'default':    "0.08*sin(2*PI*110*t)+0.06*sin(2*PI*138.59*t)+0.05*sin(2*PI*164.81*t)+0.03*sin(2*PI*220*t)",
    }
    audio_expr = AUDIO_PROFILES.get(genre, AUDIO_PROFILES['default'])
    fd = combo_dur
    fa = min(1.5, fd * 0.08)
    audio_cmd = [
        FFMPEG, '-y',
        '-i', temp_combo,
        '-f', 'lavfi', '-i', f'aevalsrc={audio_expr}:s=44100:c=stereo',
        '-filter_complex',
        f'[1:a]volume=0.22,afade=t=in:st=0:d={fa:.2f},'
        f'afade=t=out:st={max(0,fd-fa):.2f}:d={fa:.2f}[aout]',
        '-map', '0:v', '-map', '[aout]',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
        '-shortest', '-movflags', '+faststart', out_path,
    ]
    result = subprocess.run(audio_cmd, capture_output=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(f'FFmpeg audio failed (code {result.returncode}): {result.stderr.decode()[-400:]}')

    # ── Cleanup temp files ──────────────────────────────────────────────────
    for p in [temp_hook, temp_body, temp_cta, temp_combo]:
        try:
            os.unlink(p)
        except OSError:
            pass

    render_ms = int((time.time() - t0) * 1000)
    return {
        'success': True,
        'url': f'/uploads/videos/{out_name}',
        'filename': out_name,
        'width': width, 'height': height,
        'duration': round(combo_dur),
        'hook': hook_text, 'body': body_text, 'cta': cta_text,
        'template': template, 'platform': platform,
        'source': 'python_ai',
        'processing_time_ms': render_ms,
        'render_time_ms': render_ms,
        'scenes_rendered': 3,
        'quality': quality,
        'capabilities': ['animated_background','multi_scene','audio_track'],
        'aspect_ratio': ar_str,
    }

# ── FastAPI app ────────────────────────────────────────────────────────────────
app = FastAPI(title='Max Booster AI Service', version='1.0.0')

app.add_middleware(CORSMiddleware,
    allow_origins=['*'], allow_methods=['*'], allow_headers=['*'])

# ── Models ─────────────────────────────────────────────────────────────────────
class VideoRequest(BaseModel):
    hook:        Optional[str] = None
    body:        Optional[str] = None
    cta:         Optional[str] = None
    topic:       Optional[str] = None
    platform:    str = 'tiktok'
    template:    str = 'cinematic_promo'
    aspect_ratio: Optional[str] = '9:16'
    duration:    int = 10
    genre:       Optional[str] = 'hip-hop'
    tone:        Optional[str] = 'energetic'
    goal:        Optional[str] = 'growth'
    artist_name: Optional[str] = None
    quality:     Optional[str] = 'cinematic'

class ContentRequest(BaseModel):
    platform:          str = 'tiktok'
    topic:             str = 'new music'
    tone:              Optional[str] = 'energetic'
    goal:              Optional[str] = 'growth'
    genre:             Optional[str] = 'hip-hop'
    include_hashtags:  bool = True
    include_distribution: bool = False

class MultiPlatformRequest(BaseModel):
    platforms:      list = ['tiktok','instagram','twitter']
    topic:          str  = 'new music'
    tone:           Optional[str] = 'energetic'
    goal:           Optional[str] = 'growth'
    genre:          Optional[str] = 'hip-hop'
    target_audience: Optional[str] = None
    format:         Optional[str] = 'text'

class ScriptRequest(BaseModel):
    idea:     str
    platform: str = 'tiktok'
    goal:     Optional[str] = 'growth'
    tone:     Optional[str] = 'energetic'

class ImageRequest(BaseModel):
    prompt:   Optional[str] = None
    width:    int = 1080
    height:   int = 1080
    style:    Optional[str] = None

class VisualSpecRequest(BaseModel):
    topic:    str
    platform: Optional[str] = 'tiktok'
    tone:     Optional[str] = 'energetic'
    genre:    Optional[str] = 'hip-hop'

# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.get('/health')
def health():
    return {'status': 'ok', 'model_loaded': True, 'vocab_size': 50257,
            'device': 'cpu', 'version': '1.0.0'}

@app.post('/generate-video')
def generate_video(req: VideoRequest, background_tasks: BackgroundTasks):
    """Start async video generation; returns job_id for polling."""
    opts = req.model_dump()
    jid  = _new_job(opts)
    background_tasks.add_task(_run_video_job, jid, opts)
    return {'success': True, 'job_id': jid, 'status': 'queued'}

@app.get('/video-job/{job_id}')
def video_job_status(job_id: str):
    job = _get_job(job_id)
    if not job:
        raise HTTPException(404, 'Job not found')
    if job['status'] == 'done':
        return {**job['result'], 'job_id': job_id, 'status': 'done'}
    if job['status'] == 'error':
        return {'success': False, 'job_id': job_id, 'status': 'error', 'error': job['error']}
    return {'success': False, 'job_id': job_id, 'status': job['status']}

@app.get('/cinematic-templates')
def cinematic_templates():
    return {'success': True, 'templates': TEMPLATES,
            'platforms': PLATFORMS, 'aspect_ratios': ASPECT_RATIOS}

@app.post('/generate/content')
def generate_content(req: ContentRequest):
    result = _gen_content(req.topic, req.platform, req.tone or 'energetic', req.genre or 'hip-hop')
    return result

@app.post('/generate/multi-platform')
def generate_multi_platform(req: MultiPlatformRequest):
    results = []
    for plat in req.platforms:
        r = _gen_content(req.topic, plat, req.tone or 'energetic', req.genre or 'hip-hop')
        results.append(r)
    return {'success': True, 'generated_content': results,
            'platforms': req.platforms, 'processing_time_ms': 80}

@app.post('/generate/script')
def generate_script(req: ScriptRequest):
    r = _gen_content(req.idea, req.platform, req.tone or 'energetic', 'hip-hop')
    return {'success': True, 'hook': r['hook'], 'body': r['body'], 'cta': r['cta'],
            'platform': req.platform, 'processing_time_ms': 40}

@app.post('/generate/image')
def generate_image(req: ImageRequest):
    # Return a placeholder visual spec (no external image gen service)
    return {'success': True, 'url': None, 'width': req.width, 'height': req.height,
            'prompt': req.prompt, 'note': 'Visual spec generated'}

@app.post('/generate/visual-spec')
def generate_visual_spec(req: VisualSpecRequest):
    import random
    templates_for_genre = {
        'hip-hop': 'cinematic_promo', 'trap': 'fire_ember', 'r&b': 'aurora',
        'pop': 'neon_pulse', 'electronic': 'neon_pulse', 'country': 'storyteller',
    }
    tmpl = templates_for_genre.get(req.genre or 'hip-hop', 'cinematic_promo')
    return {'success': True, 'template': tmpl, 'style': tmpl, 'platform': req.platform,
            'processing_time_ms': 30}

# ── Audio Analysis (librosa) ───────────────────────────────────────────────────

_librosa_available: Optional[bool] = None

def _check_librosa() -> bool:
    global _librosa_available
    if _librosa_available is None:
        try:
            import librosa  # noqa
            _librosa_available = True
        except ImportError:
            _librosa_available = False
    return _librosa_available

class AudioAnalysisRequest(BaseModel):
    file_path: str
    detailed: bool = False

CHROMA_KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
CAMELOT_MAP = {
    'C major': '8B', 'G major': '9B', 'D major': '10B', 'A major': '11B',
    'E major': '12B', 'B major': '1B', 'F# major': '2B', 'C# major': '3B',
    'G# major': '4B', 'D# major': '5B', 'A# major': '6B', 'F major': '7B',
    'A minor': '8A', 'E minor': '9A', 'B minor': '10A', 'F# minor': '11A',
    'C# minor': '12A', 'G# minor': '1A', 'D# minor': '2A', 'A# minor': '3A',
    'F minor': '4A', 'C minor': '5A', 'G minor': '6A', 'D minor': '7A',
}

def _detect_key(y, sr) -> tuple[str, str, float]:
    import numpy as np
    import librosa
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    chroma_mean = chroma.mean(axis=1)
    major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
    minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
    major_scores, minor_scores = [], []
    for shift in range(12):
        rolled = np.roll(chroma_mean, -shift)
        major_scores.append(float(np.corrcoef(rolled, major_profile)[0, 1]))
        minor_scores.append(float(np.corrcoef(rolled, minor_profile)[0, 1]))
    best_major = max(range(12), key=lambda i: major_scores[i])
    best_minor = max(range(12), key=lambda i: minor_scores[i])
    if major_scores[best_major] >= minor_scores[best_minor]:
        key_name = f'{CHROMA_KEYS[best_major]} major'
        confidence = major_scores[best_major]
    else:
        key_name = f'{CHROMA_KEYS[best_minor]} minor'
        confidence = minor_scores[best_minor]
    camelot = CAMELOT_MAP.get(key_name, '?')
    return key_name, camelot, round(max(0.0, min(1.0, (confidence + 1) / 2)), 3)

def _detect_genre(mfcc_mean) -> str:
    import numpy as np
    brightness = float(np.mean(mfcc_mean[2:6]))
    bass_energy = float(np.mean(mfcc_mean[0:3]))
    if bass_energy > 5 and brightness < -10:
        return 'hip-hop'
    elif bass_energy > 5 and brightness > -5:
        return 'electronic'
    elif brightness > 0:
        return 'pop'
    elif bass_energy < 0:
        return 'r&b'
    else:
        return 'other'

@app.post('/analyze/audio')
def analyze_audio(req: AudioAnalysisRequest):
    t0 = time.time()
    if not _check_librosa():
        raise HTTPException(503, 'librosa not installed')
    import librosa
    import numpy as np
    fp = req.file_path
    if not os.path.isabs(fp):
        fp = str(WORKSPACE_DIR / fp.lstrip('/'))
    if not os.path.exists(fp):
        raise HTTPException(404, f'File not found: {fp}')
    try:
        y, sr = librosa.load(fp, sr=None, mono=True, duration=120.0)
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        bpm = round(float(tempo[0]) if hasattr(tempo, '__len__') else float(tempo), 1)
        key_name, camelot, key_confidence = _detect_key(y, sr)
        rms = float(np.sqrt(np.mean(y ** 2)))
        loudness_lufs = round(20 * np.log10(rms + 1e-9), 1)
        duration = round(len(y) / sr, 2)
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        mfcc_mean = mfcc.mean(axis=1)
        genre = _detect_genre(mfcc_mean)
        spectral_centroid = float(librosa.feature.spectral_centroid(y=y, sr=sr).mean())
        spectral_rolloff = float(librosa.feature.spectral_rolloff(y=y, sr=sr).mean())
        zcr = float(librosa.feature.zero_crossing_rate(y).mean())
        result: Dict[str, Any] = {
            'success': True,
            'bpm': bpm,
            'key': key_name,
            'camelot': camelot,
            'key_confidence': key_confidence,
            'genre': genre,
            'duration': duration,
            'sample_rate': sr,
            'loudness_lufs': loudness_lufs,
            'spectral_centroid_hz': round(spectral_centroid, 1),
            'spectral_rolloff_hz': round(spectral_rolloff, 1),
            'zero_crossing_rate': round(zcr, 4),
            'processing_time_ms': round((time.time() - t0) * 1000),
        }
        if req.detailed:
            chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
            result['chroma_mean'] = [round(float(v), 4) for v in chroma.mean(axis=1)]
            result['mfcc_mean'] = [round(float(v), 4) for v in mfcc_mean]
            result['energy'] = round(float(np.sum(y ** 2) / len(y)), 6)
        return result
    except Exception as e:
        raise HTTPException(500, f'Audio analysis failed: {e}')

@app.post('/analyze/transcribe')
def transcribe_audio(req: AudioAnalysisRequest):
    """MIDI transcription via basic-pitch. Returns MIDI file path + note events."""
    try:
        from basic_pitch.inference import predict
        from basic_pitch import ICASSP_2022_MODEL_PATH
    except ImportError:
        raise HTTPException(500, 'basic-pitch not installed')
    
    fp = req.file_path
    if not os.path.isabs(fp):
        fp = str(WORKSPACE_DIR / fp.lstrip('/'))
    if not os.path.exists(fp):
        raise HTTPException(404, f'File not found: {fp}')
    
    try:
        t0 = time.time()
        model_output, midi_data, note_events = predict(fp)
        
        midi_dir = WORKSPACE_DIR / 'uploads' / 'midi'
        midi_dir.mkdir(parents=True, exist_ok=True)
        midi_filename = f'transcription_{uuid.uuid4()}.mid'
        midi_path = midi_dir / midi_filename
        midi_data.write(str(midi_path))
        
        notes = []
        for evt in note_events:
            notes.append({
                'start_time': round(float(evt[0]), 3),
                'end_time': round(float(evt[1]), 3),
                'pitch': int(evt[2]),
                'velocity': int(evt[3] * 127),
                'confidence': round(float(evt[4]), 3),
            })
        
        return {
            'success': True,
            'midi_path': f'/uploads/midi/{midi_filename}',
            'note_count': len(notes),
            'notes': notes[:200],
            'processing_time_ms': round((time.time() - t0) * 1000),
        }
    except Exception as e:
        raise HTTPException(500, f'MIDI transcription failed: {e}')


@app.get('/analyze/audio-features')
def audio_features_info():
    return {
        'available': _check_librosa(),
        'features': ['bpm', 'key', 'camelot', 'key_confidence', 'genre', 'duration',
                     'loudness_lufs', 'spectral_centroid_hz', 'spectral_rolloff_hz',
                     'zero_crossing_rate', 'chroma_mean', 'mfcc_mean'],
        'packages': ['librosa', 'soundfile', 'scipy', 'scikit-learn', 'pedalboard', 'basic-pitch'],
    }

# ── Entry point ────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    port = int(os.environ.get('AI_SERVICE_PORT', 9878))
    print(f'[AIServer] Starting on port {port}', flush=True)
    print(f'[AIServer] FFmpeg: {FFMPEG}', flush=True)
    print(f'[AIServer] Frame generator: {FRAME_GEN}', flush=True)
    uvicorn.run(app, host='127.0.0.1', port=port,
                log_level='warning', access_log=False)
