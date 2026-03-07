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
import re
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
# ── Prompt-Driven Content Assembler ───────────────────────────────────────────
# Generates content FROM the user's actual words — no fixed template phrases.
# The hook, body, and CTA are all constructed using extracted context from the prompt.

_STOP_WORDS = frozenset({
    'the','a','an','and','or','but','in','on','at','to','for','of','with',
    'is','are','was','were','be','been','being','by','from','as','this',
    'that','these','those','it','its','their','our','your','my','we',
    'they','you','i','me','him','her','all','just','more','also','can',
    'will','have','has','had','do','does','did','not','no','so','if',
    'then','than','because','which','when','where','how','what','new',
    'up','out','get','one','two','three','first','last','best','great',
})

_TONE_EMOJIS = {
    'energetic':   ['🔥', '🚀', '💥', '⚡', '🎯', '💫'],
    'chill':       ['✨', '🌙', '💫', '🎶', '🌊', '🍃'],
    'hype':        ['🔥', '🚀', '💥', '🎉', '👑', '⚡'],
    'emotional':   ['💔', '✨', '🥹', '💙', '🌙', '💫'],
    'promotional': ['🚀', '💡', '🎯', '✅', '🔑', '⭐'],
    'informative': ['💡', '🔑', '📌', '✅', '🎯', '💼'],
    'professional':['🎯', '📈', '✅', '🏆', '💼', '🔑'],
    'casual':      ['✨', '💯', '🎵', '🙌', '😤', '💪'],
}

_CTA_BY_TYPE = {
    'platform':  ["Try it free — link in bio 🔗", "Sign up today — link in bio 🚀",
                  "Join thousands of independent artists 🎵", "Start your free trial — link in bio"],
    'event':     ["Grab your tickets — link in bio 🎟️", "Get tickets now 🎟️", "RSVP — link in bio"],
    'beat':      ["License this beat — DM or link in bio 🎛️", "Grab the beat — link in bio",
                  "Available for purchase — DM me 🎛️"],
    'release':   ["Stream now — link in bio 🔗", "Listen on all platforms 🎵",
                  "Save this one 🎵", "Follow for more music 🎵"],
    'general':   ["Follow for more 🎵", "Share with someone who needs this ✨",
                  "Drop your thoughts below 👇", "Save this for later 🔖"],
}

_GENRE_TAG_SETS = {
    'hip-hop':    ['#hiphop','#rap','#newmusic','#unsigned','#bars','#trap','#rapper'],
    'r&b':        ['#rnb','#soul','#newmusic','#grooves','#vibes','#soulmusic','#rnbmusic'],
    'pop':        ['#pop','#newmusic','#popmusic','#indieartist','#mainstream','#bop'],
    'electronic': ['#edm','#electronic','#beats','#dj','#dancemusic','#producer','#techno'],
    'reggae':     ['#reggae','#afrobeats','#dancehall','#afropop','#roots'],
    'rock':       ['#rock','#indie','#alternative','#guitar','#indierock','#altrock'],
    'jazz':       ['#jazz','#jazzmusic','#soulmusic','#livemusic','#jazzvibes'],
    'country':    ['#country','#countrymusic','#folk','#americana','#nashville'],
    'latin':      ['#latin','#latinmusic','#reggaeton','#latinpop','#salsa'],
    'classical':  ['#classical','#classicalmusic','#orchestral','#piano'],
}

_PLATFORM_KEYWORDS = re.compile(
    r'\b(platform|app|software|tool|management|marketplace|distribution|SaaS|AI-powered|'
    r'career management|beat marketplace|DAW|streaming service|analytics|autopilot|royalt|'
    r'music career|music business|independent artist platform)\b',
    re.IGNORECASE
)
_FEATURES_MARKER = re.compile(r'\[Features?:', re.IGNORECASE)
_GENRE_HINTS = {
    'hip-hop':    ['rap','bars','rhyme','flow','drill','trap','cypher','freestyle','verse','mc','rapper'],
    'r&b':        ['rnb','r&b','soul','groove','smooth','neo-soul','vibe','vibes'],
    'pop':        ['pop','mainstream','chart','radio','anthem','bop'],
    'electronic': ['edm','electronic','house','techno','dance','dj','synth','bass','808'],
    'reggae':     ['reggae','dancehall','afrobeats','afropop','roots','riddim'],
    'rock':       ['rock','metal','punk','guitar','alternative','indie','band','grunge'],
    'jazz':       ['jazz','blues','funk','saxophone','trumpet','swing','bebop'],
    'country':    ['country','folk','bluegrass','nashville','acoustic','americana'],
    'latin':      ['latin','salsa','reggaeton','cumbia','bachata','merengue'],
    'classical':  ['classical','orchestra','symphony','piano','violin','chamber'],
}

def _is_platform_promo(topic: str, genre: str) -> bool:
    """Return True when topic describes a music platform/SaaS rather than a music release."""
    if _FEATURES_MARKER.search(topic):
        return True
    if _PLATFORM_KEYWORDS.search(topic):
        return True
    return False

def _parse_topic(topic: str) -> dict:
    """Parse user's raw topic/prompt into structured context for content assembly."""
    features_match = re.search(r'\[Features?: ([^\]]+)\]', topic, re.IGNORECASE)
    features = [f.strip() for f in features_match.group(1).split(',')] if features_match else []
    clean = re.sub(r'\[Features?:[^\]]+\]', '', topic).strip().strip(' —-|')

    quoted = re.findall(r'[\'\"](.*?)[\'\"]', clean)
    # Split on em-dash, pipe, bullet, AND space-hyphen-space (but not hyphens within words)
    parts = [p.strip() for p in re.split(r'\s*[—|•]\s*|\s+-\s+', clean) if p.strip() and len(p.strip()) > 1]
    primary = parts[0] if parts else clean
    subtitle = ' — '.join(parts[1:]) if len(parts) > 1 else ''

    # Extract content words but skip very common generic ones even beyond stop words
    _EXTRA_SKIP = _STOP_WORDS | {
        'about','long','ride','rides','car','night','late','day','time','way','want','make',
        'like','love','good','feel','know','see','look','come','take','give','say','song',
        'music','artist','track','album','single','release','free','live','show','set',
        'video','platform','management','career','studio','distribution','production',
        'market','place','service','system','tool','app','use','using',
    }
    all_words = re.findall(r'\b[a-zA-Z]{3,}\b', clean + ' ' + ' '.join(features))
    content_words = list(dict.fromkeys([w for w in all_words if w.lower() not in _EXTRA_SKIP]))[:12]

    _DESCRIPTORS = re.compile(
        r'\b(chill|dreamy|smooth|raw|dark|deep|fresh|sweet|warm|bright|rich|pure|classic|'
        r'modern|nostalgic|emotional|upbeat|melancholy|uplifting|powerful|gentle|fierce|'
        r'energetic|vibrant|bold|gritty|acoustic|electric|live|indie|underground|experimental|'
        r'innovative|authentic|organic|exclusive|rare|special|iconic|trending|emerging|rising)\b',
        re.IGNORECASE
    )
    descriptors = list(dict.fromkeys(_DESCRIPTORS.findall(clean.lower())))[:4]

    is_platform = _is_platform_promo(topic, '')
    is_event = bool(re.search(r'\b(show|concert|tour|gig|performance|festival|event|live\s+at|live\s+show)\b', clean, re.I))
    is_beat = bool(re.search(r'\b(beat|instrumental|sample|loop|type\s*beat|prod(?:uced)?)\b', clean, re.I))
    is_release = bool(quoted or re.search(r'\b(single|track|song|album|ep|mixtape|release|drop|out\s*now|now\s*playing)\b', clean, re.I))

    detected_genre = None
    lower_clean = clean.lower()
    for g, kws in _GENRE_HINTS.items():
        if any(k in lower_clean for k in kws):
            detected_genre = g
            break

    return {
        'primary': primary,
        'subtitle': subtitle,
        'parts': parts,
        'features': features,
        'quoted': quoted,
        'descriptors': descriptors,
        'content_words': content_words,
        'is_platform': is_platform,
        'is_event': is_event,
        'is_beat': is_beat,
        'is_release': is_release,
        'genre': detected_genre,
        'raw': clean,
    }

def _emoji(tone: str, seed: int = 0) -> str:
    import random
    pool = _TONE_EMOJIS.get(tone, _TONE_EMOJIS['energetic'])
    return pool[seed % len(pool)]

def _build_hook(ctx: dict, tone: str) -> str:
    """Construct a hook sentence using the user's primary entity and tone."""
    import random
    primary = ctx['primary']
    subtitle = ctx['subtitle']
    quoted = ctx['quoted']
    descs = ctx['descriptors']
    e1, e2 = _emoji(tone, 0), _emoji(tone, 2)
    title = f'"{quoted[0]}"' if quoted else primary
    adj = descs[0] if descs else ''
    adj_cap = adj.capitalize() + ' ' if adj else ''

    # Short label from subtitle for use in hooks (first descriptive clause, max 38 chars)
    def _short_sub(sub: str, max_len: int = 38) -> str:
        first = sub.split('—')[0].split(',')[0].split('about')[0].strip()
        return first[:max_len].rsplit(' ', 1)[0].rstrip(' -—') if len(first) > max_len else first

    if ctx['is_platform']:
        # Shorten the primary name if it contains a descriptor after a dash
        short_primary = primary.split(' - ')[0].strip() if ' - ' in primary else primary
        opts = [
            f"Meet {short_primary} {e1}",
            f"Introducing {short_primary} — built for artists like you {e1}",
            f"{short_primary} is changing the game {e1}",
            f"Have you discovered {short_primary} yet? {e1}",
            f"Why every artist needs {short_primary} {e2}",
        ]
    elif ctx['is_event']:
        opts = [
            f"{e1} {primary} — don't miss this",
            f"See you there: {primary} {e1}",
            f"Don't miss {primary} {e1}",
            f"{primary} is LIVE — get your tickets {e1}",
        ]
    elif ctx['is_beat']:
        beat_title = f'"{quoted[0]}"' if quoted else primary
        sub_hint = _short_sub(subtitle) if subtitle else ''
        opts = [
            f"{e1} New beat: {beat_title}",
            f"Beat drop: {beat_title} {e1}",
            f"{beat_title} — {sub_hint} {e1}" if sub_hint else f"{beat_title} available now {e1}",
            f"{e1} {beat_title} — fire your next project up {e2}",
        ]
    elif ctx['is_release'] or quoted:
        sub_hint = _short_sub(subtitle) if subtitle else (f'{adj_cap}release' if adj else 'new release')
        opts = [
            f"{e1} {title} is out now",
            f"New music: {title} {e1}",
            f"You need to hear {title} right now {e2}",
            f"{title} — {sub_hint} {e1}" if sub_hint else f"{e1} {title}",
            f"Stream {title} — this one hits different {e2}",
        ]
    else:
        desc_hint = subtitle.split('—')[0].strip() if subtitle else adj
        opts = [
            f"{e1} {primary}",
            f"{primary} {e1}",
            f"Check this out: {primary} {e1}",
            f"{e1} {primary}{f' — {desc_hint}' if desc_hint else ''}",
        ]

    return random.choice([o for o in opts if o.strip()])

def _build_body(ctx: dict) -> str:
    """Assemble body content directly from the user's own words — no pre-written phrases."""
    import random
    subtitle = ctx['subtitle']
    features = ctx['features']
    descs = ctx['descriptors']
    content_words = ctx['content_words']
    quoted = ctx['quoted']
    title = f'"{quoted[0]}"' if quoted else ctx['primary']

    segments = []

    if ctx['is_platform']:
        if features:
            segments.append(' | '.join(features[:3]))
            if len(features) > 3:
                segments.append(' | '.join(features[3:6]))
        elif subtitle:
            segments.append(subtitle)
        else:
            segments.append(f"Built for independent artists and music creators")
        closer = random.choice([
            "All the tools you need, in one place",
            "Manage, distribute, and promote — all in one",
            "Built to grow your career",
        ])
        segments.append(closer)

    elif ctx['is_release'] or quoted:
        if subtitle:
            segments.append(subtitle)
        elif descs:
            desc_str = ', '.join(descs[:2])
            segments.append(f"A {desc_str} sound that speaks for itself")
        if content_words:
            extra = [w for w in content_words if w.lower() not in {d.lower() for d in descs}][:3]
            if extra and not subtitle:
                segments.append(' | '.join(extra))
        if not segments:
            segments.append(f"This one is different — hit play and find out")

    elif ctx['is_beat']:
        if subtitle:
            segments.append(subtitle)
        if descs:
            segments.append(f"{descs[0].capitalize()} sound, ready for your next project")
        elif content_words:
            segments.append(' | '.join(content_words[:3]))

    elif ctx['is_event']:
        # Subtitle already carries date/location/show type — use it as-is
        if subtitle:
            segments.append(subtitle)
        if not segments:
            segments.append(ctx['primary'])

    else:
        if subtitle:
            segments.append(subtitle)
        # Only add content words if subtitle didn't already cover the topic
        if content_words and not subtitle:
            segments.append(' | '.join(content_words[:4]))
        if not segments:
            segments.append(ctx['primary'])

    return ' | '.join([s for s in segments if s]) or ctx['primary']

def _build_cta(ctx: dict) -> str:
    import random
    if ctx['is_platform']:
        key = 'platform'
    elif ctx['is_event']:
        key = 'event'
    elif ctx['is_beat']:
        key = 'beat'
    elif ctx['is_release']:
        key = 'release'
    else:
        key = 'general'
    return random.choice(_CTA_BY_TYPE[key])

def _build_hashtags(ctx: dict, genre: str) -> list:
    """Derive hashtags from the user's actual words + genre context."""
    import random
    tags = set()

    if ctx['is_platform']:
        base = ['#musictech','#indieartist','#musicproduction','#musicbusiness',
                '#musicdistribution','#beatmaker','#musicmarketing','#musiccareer',
                '#AImusic','#musiccreator','#musicentrepreneur','#artistdevelopment']
        tags.update(random.sample(base, min(6, len(base))))
    else:
        genre_resolved = genre or ctx.get('genre') or 'pop'
        base = _GENRE_TAG_SETS.get(genre_resolved, ['#newmusic','#indieartist','#musicartist'])
        tags.update(random.sample(base, min(4, len(base))))
        tags.update(['#streamingmusic','#musicproducer'])
        if ctx['is_event']:
            tags.update(['#livemusic','#concert','#musicfestival'])
        if ctx['is_beat']:
            tags.update(['#beatmaker','#producer','#freebeat','#typebeat'])

    skip = _STOP_WORDS | {
        'music','artist','track','song','album','single','release','out','now','new',
        'about','long','ride','rides','car','night','late','day','time','way',
        'video','platform','management','career','studio','distribution','production',
        'market','place','service','system','tool','app','live','show','set',
        'lawz','music','free','good','feel','want','make','like','love','know',
    }
    for word in ctx['content_words'][:8]:
        if word.lower() not in skip and len(word) > 3:
            tag = '#' + word.lower().replace('-', '')
            if 3 < len(tag) <= 32:
                tags.add(tag)

    for q in ctx['quoted'][:1]:
        tag = '#' + re.sub(r'[^a-zA-Z0-9]', '', q)
        if len(tag) > 2:
            tags.add(tag)

    result = list(tags)
    random.shuffle(result)
    return result[:12]

def _gen_content(topic: str, platform: str, tone: str, genre: str) -> dict:
    """Generate social media content from the user's actual prompt — no hardcoded template phrases."""
    ctx = _parse_topic(topic)
    hook     = _build_hook(ctx, tone)
    body     = _build_body(ctx)
    cta      = _build_cta(ctx)
    hashtags = _build_hashtags(ctx, genre or ctx.get('genre') or '')
    caption  = f"{hook}\n\n{body}\n\n{cta}"
    return {
        'success': True, 'platform': platform,
        'caption': caption,
        'content': body, 'hashtags': hashtags,
        'hook': hook, 'body': body, 'cta': cta,
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
    # Delegate to the full visual spec generator for a rich response
    spec = _gen_visual_spec(
        topic=req.prompt or '',
        artist='', track='', genre='', tone='energetic',
        platform='instagram', thumbnail_url='', keywords=[], description=''
    )
    return {**spec, 'url': None, 'width': req.width, 'height': req.height}

# ── Prompt-driven visual spec generator ────────────────────────────────────────

_GENRE_TEMPLATES = {
    'hip-hop':    ('cinematic_promo', '#1a1a2e', '#e94560', '#ffffff'),
    'trap':       ('fire_ember',      '#1a0500', '#ff4500', '#ffffff'),
    'r&b':        ('aurora',          '#0d1b2a', '#d4af37', '#ffffff'),
    'soul':       ('gold_luxury',     '#1a1000', '#d4af37', '#ffffff'),
    'pop':        ('music_video',     '#1a0030', '#ff00ff', '#ffffff'),
    'electronic': ('neon_pulse',      '#0d0221', '#00fff5', '#ffffff'),
    'edm':        ('neon_pulse',      '#0d0221', '#00fff5', '#ffffff'),
    'country':    ('storyteller',     '#2a1a0a', '#aa7755', '#ffffff'),
    'folk':       ('vintage_film',    '#2a1a0a', '#aa7755', '#f5f0e8'),
    'rock':       ('dark_cinema',     '#0a0a0a', '#cc4444', '#ffffff'),
    'jazz':       ('gold_luxury',     '#1a1000', '#d4af37', '#f5f0e8'),
    'classical':  ('elegant_minimal', '#fafafa', '#8b7355', '#1a1a1a'),
    'reggae':     ('ocean_wave',      '#001a3a', '#00aa44', '#ffffff'),
    'afrobeats':  ('music_video',     '#1a0500', '#ff8800', '#ffffff'),
    'latin':      ('fire_ember',      '#1a0500', '#ff6600', '#ffffff'),
    'platform':   ('elegant_minimal', '#1a1a2e', '#6655aa', '#ffffff'),
    'event':      ('gold_luxury',     '#1a1000', '#d4af37', '#ffffff'),
    'beat':       ('cinematic_promo', '#1a1a2e', '#e94560', '#ffffff'),
}

_PLATFORM_ASPECT = {
    'tiktok':     '9:16',
    'instagram':  '1:1',
    'youtube':    '16:9',
    'twitter':    '16:9',
    'facebook':   '16:9',
    'linkedin':   '16:9',
    'reels':      '9:16',
    'stories':    '9:16',
}

def _gen_visual_spec(
    topic: str, artist: str, track: str, genre: str, tone: str,
    platform: str, thumbnail_url: str, keywords: list, description: str
) -> dict:
    """Generate a rich, prompt-driven visual spec from URL analysis context."""
    import random

    ctx = _parse_topic(topic)

    # Determine content-type key for template selection
    if ctx['is_platform']:
        genre_key = 'platform'
    elif ctx['is_event']:
        genre_key = 'event'
    elif ctx['is_beat']:
        genre_key = 'beat'
    else:
        raw_genre = (genre or ctx.get('genre') or 'hip-hop').lower().strip()
        # Normalise: keep & for r&b, convert spaces to hyphens, try direct match then fallback
        genre_key = raw_genre.replace(' ', '-')
        if genre_key not in _GENRE_TEMPLATES:
            genre_key = genre_key.replace('&', '')  # e.g. 'rb' won't match either, handled below
        if genre_key not in _GENRE_TEMPLATES:
            # Try partial match
            for k in _GENRE_TEMPLATES:
                if k in raw_genre or raw_genre in k:
                    genre_key = k
                    break
            else:
                genre_key = 'hip-hop'

    tmpl_id, bg_color, accent_color, text_color = _GENRE_TEMPLATES.get(
        genre_key, _GENRE_TEMPLATES['hip-hop']
    )

    # Build overlay texts from actual content
    title_text = track or (ctx['quoted'][0] if ctx['quoted'] else ctx['primary'])
    subtitle_text = artist or ''
    if not subtitle_text and ctx['subtitle']:
        # Try to pull genre/style from subtitle as a secondary label
        subtitle_text = ctx['subtitle'].split('—')[0].strip()[:40]

    # Short tagline: use descriptors or first meaningful phrase from topic
    if ctx['descriptors']:
        tagline = ' | '.join(ctx['descriptors'][:2]).capitalize()
    elif keywords:
        tagline = ' | '.join(keywords[:2])
    elif description:
        tagline = description[:60].rsplit(' ', 1)[0]
    else:
        tagline = genre.upper() if genre else ''

    # Visual mood derived from tone + genre
    mood_map = {
        'energetic': 'High-energy, bold contrasts, dynamic motion',
        'chill':     'Soft gradients, ambient glow, floating particles',
        'hype':      'Explosive colors, rapid cuts, intense lighting',
        'emotional': 'Moody atmosphere, deep shadows, warm highlights',
        'professional': 'Clean lines, minimal text, premium feel',
        'casual':    'Bright, friendly, approachable palette',
    }
    visual_mood = mood_map.get(tone or 'energetic', mood_map['energetic'])

    # Platform aspect ratio
    aspect_ratio = _PLATFORM_ASPECT.get(platform or 'instagram', '1:1')

    # Build color palette (bg + accent + 2 intermediate)
    def hex_mid(c1: str, c2: str) -> str:
        """Simple midpoint between two hex colors."""
        try:
            r1, g1, b1 = int(c1[1:3], 16), int(c1[3:5], 16), int(c1[5:7], 16)
            r2, g2, b2 = int(c2[1:3], 16), int(c2[3:5], 16), int(c2[5:7], 16)
            return f'#{(r1+r2)//2:02x}{(g1+g2)//2:02x}{(b1+b2)//2:02x}'
        except Exception:
            return accent_color

    mid1 = hex_mid(bg_color, accent_color)
    palette = [bg_color, mid1, accent_color, text_color]

    # Video config that can be passed directly to /generate-video
    video_config = {
        'template':     tmpl_id,
        'bg_color':     bg_color,
        'accent_color': accent_color,
        'text_color':   text_color,
        'topic':        title_text or topic,
        'artist_name':  artist or '',
        'hook':         title_text,
        'body':         subtitle_text or tagline,
        'cta':          ('Sign Up Free — Link in Bio 🔗' if ctx['is_platform']
                         else 'License This Beat — Link in Bio 🎛️' if ctx['is_beat']
                         else 'Get Tickets — Link in Bio 🎟️' if ctx['is_event']
                         else 'Stream Now — Link in Bio 🔗'),
        'platform':     platform or 'instagram',
        'aspect_ratio': aspect_ratio,
        'duration':     15,
        'tone':         tone or 'energetic',
        'quality':      'cinematic',
        'genre':        genre or genre_key,
    }

    return {
        'success':       True,
        'template':      tmpl_id,
        'template_name': next((t['name'] for t in TEMPLATES if t['id'] == tmpl_id), tmpl_id),
        'bg_color':      bg_color,
        'accent_color':  accent_color,
        'text_color':    text_color,
        'color_palette': palette,
        'title_text':    title_text,
        'subtitle_text': subtitle_text,
        'tagline':       tagline,
        'visual_mood':   visual_mood,
        'aspect_ratio':  aspect_ratio,
        'thumbnail_url': thumbnail_url or '',
        'video_config':  video_config,
        'platform':      platform or 'instagram',
        'genre':         genre or genre_key,
        'processing_time_ms': 30,
    }

class VisualSpecFullRequest(BaseModel):
    topic:         str = ''
    artist:        str = ''
    track:         str = ''
    genre:         str = ''
    tone:          str = 'energetic'
    platform:      str = 'instagram'
    thumbnail_url: str = ''
    keywords:      list = []
    description:   str = ''

@app.post('/generate/visual-spec')
def generate_visual_spec(req: VisualSpecFullRequest):
    return _gen_visual_spec(
        topic=req.topic, artist=req.artist, track=req.track,
        genre=req.genre, tone=req.tone, platform=req.platform,
        thumbnail_url=req.thumbnail_url, keywords=req.keywords,
        description=req.description,
    )

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

# ═══════════════════════════════════════════════════════════════════════════════
# Training API — UNetV4 diffusion model training
# ═══════════════════════════════════════════════════════════════════════════════

import threading as _threading

_train_state: dict = {
    'status':      'idle',       # idle | running | stopping | stopped | error
    'phase':       0,
    'phase_name':  '',
    'epoch':       0,
    'step':        0,
    'loss':        None,
    'loss_history': [],
    'total_samples': 0,
    'session_count': 0,
    'start_time':  None,
    'elapsed_sec': 0,
    'error':       None,
    'weights_path': None,
    'last_save':   None,
    'dataset_stats': {},
}
_train_lock   = _threading.Lock()
_train_thread: _threading.Thread | None = None
_stop_event   = _threading.Event()

DIFFUSION_DIR = SERVICE_DIR / 'diffusion'


def _set_train_state(**kwargs):
    with _train_lock:
        _train_state.update(kwargs)


def _training_worker(mode: str, n_sessions: int, phase_id: int | None):
    """Background thread: runs CurriculumTrainer sessions."""
    import sys as _sys
    if str(DIFFUSION_DIR.parent) not in _sys.path:
        _sys.path.insert(0, str(DIFFUSION_DIR.parent))

    try:
        from diffusion.training_curriculum import CurriculumTrainer
        from diffusion.dataset_reader import get_reader as _get_dr

        # Populate dataset stats at start
        try:
            dr = _get_dr()
            _set_train_state(dataset_stats=dr.get_stats())
        except Exception:
            pass

        trainer = CurriculumTrainer()

        def _run_one_session(phase=None):
            """Run a single session and update shared state."""
            if _stop_event.is_set():
                return False

            sched   = trainer.scheduler
            phase_o = phase if phase else sched.current_phase
            _set_train_state(
                status     = 'running',
                phase      = phase_o.phase_id,
                phase_name = phase_o.name,
                epoch      = 0,
            )

            import time as _time
            t0 = _time.time()
            meta = trainer.run_session(phase)
            elapsed = _time.time() - t0

            loss = meta.get('final_loss', meta.get('mean_loss', None))
            with _train_lock:
                _train_state['session_count'] += 1
                _train_state['total_samples'] += (
                    meta.get('samples_per_epoch', 0) * meta.get('epochs', 0)
                )
                _train_state['elapsed_sec'] += elapsed
                if loss is not None:
                    _train_state['loss'] = round(float(loss), 6)
                    _train_state['loss_history'].append({
                        'session': _train_state['session_count'],
                        'loss':    round(float(loss), 6),
                        'phase':   phase_o.phase_id,
                        'ts':      _time.time(),
                    })
                    # Keep last 200 points
                    if len(_train_state['loss_history']) > 200:
                        _train_state['loss_history'] = _train_state['loss_history'][-200:]
                _train_state['weights_path'] = meta.get('weights_path', None)
                _train_state['last_save']    = _time.time()
            return True

        import time as _t
        _set_train_state(start_time=_t.time())

        if mode == 'session':
            _run_one_session()

        elif mode == 'day':
            for _ in range(n_sessions):
                if _stop_event.is_set():
                    break
                _run_one_session()

        elif mode == 'continuous':
            # run_month() handles the April 3 deadline, consecutive error backoff,
            # and clean shutdown via stop_event. Patch run_session to sync shared state.
            from diffusion.training_curriculum import CurriculumTrainer as _CT2
            _trainer2 = _CT2()
            _orig_rs  = _trainer2.run_session

            def _patched_rs(phase=None):
                import time as _t2
                sched   = _trainer2.scheduler
                phase_o = phase if phase else sched.current_phase
                _set_train_state(
                    status     = 'running',
                    phase      = phase_o.phase_id,
                    phase_name = phase_o.name,
                )
                t0   = _t2.time()
                meta = _orig_rs(phase)
                elapsed = _t2.time() - t0
                loss = meta.get('final_loss', meta.get('mean_loss', None))
                with _train_lock:
                    _train_state['session_count'] += 1
                    _train_state['total_samples'] += (
                        meta.get('samples_per_epoch', 0) * meta.get('epochs', 0)
                    )
                    _train_state['elapsed_sec'] += elapsed
                    if loss is not None:
                        _train_state['loss'] = round(float(loss), 6)
                        _train_state['loss_history'].append({
                            'session': _train_state['session_count'],
                            'loss':    round(float(loss), 6),
                            'phase':   _train_state['phase'],
                            'ts':      _t2.time(),
                        })
                        if len(_train_state['loss_history']) > 200:
                            _train_state['loss_history'] = _train_state['loss_history'][-200:]
                    _train_state['last_save'] = _t2.time()
                return meta

            _trainer2.run_session = _patched_rs
            _trainer2.run_month(
                sleep_between_sessions_sec=120,
                stop_event=_stop_event,
                deadline_str='2026-04-03',
            )

        _set_train_state(
            status = 'stopped' if _stop_event.is_set() else 'idle',
        )

    except Exception as e:
        import traceback as _tb
        _set_train_state(status='error', error=str(e))
        print(f'[TrainingWorker] Error: {e}\n{_tb.format_exc()}', flush=True)


class TrainStartRequest(BaseModel):
    mode: str = 'session'       # 'session' | 'day' | 'continuous'
    n_sessions: int = 3
    phase_id: Optional[int] = None


class TrainSessionRequest(BaseModel):
    phase_id: Optional[int] = None
    n_epochs: int = 5
    n_samples: int = 500
    T: int = 4
    res: int = 96
    lr: float = 2e-4


@app.post('/train/start')
def train_start(req: TrainStartRequest):
    global _train_thread
    with _train_lock:
        if _train_state['status'] == 'running':
            return {'success': False, 'error': 'Training already running',
                    'status': _train_state['status']}

        _stop_event.clear()
        _train_state['error'] = None

    _train_thread = _threading.Thread(
        target=_training_worker,
        args=(req.mode, req.n_sessions, req.phase_id),
        daemon=True,
        name='UNetV4Trainer',
    )
    _train_thread.start()
    return {'success': True, 'mode': req.mode, 'status': 'running'}


@app.post('/train/stop')
def train_stop():
    _stop_event.set()
    _set_train_state(status='stopping')
    return {'success': True, 'status': 'stopping'}


@app.get('/train/status')
def train_status():
    with _train_lock:
        state = dict(_train_state)
    # Compute live elapsed
    import time as _t
    if state['start_time'] and state['status'] == 'running':
        state['elapsed_sec'] = round(_t.time() - state['start_time'])
    return state


@app.post('/train/session')
def train_single_session(req: TrainSessionRequest):
    """Run a single training session with explicit parameters (blocking, short timeout)."""
    global _train_thread
    with _train_lock:
        if _train_state['status'] == 'running':
            return {'success': False, 'error': 'Training already running'}

    _stop_event.clear()
    _set_train_state(status='running', error=None)

    import sys as _sys
    if str(DIFFUSION_DIR.parent) not in _sys.path:
        _sys.path.insert(0, str(DIFFUSION_DIR.parent))

    import threading as _t2
    result_box: list = []

    def _run():
        try:
            from diffusion.trainer import train_v4
            meta = train_v4(
                n_epochs      = req.n_epochs,
                n_samples     = req.n_samples,
                T             = req.T,
                res           = req.res,
                lr            = req.lr,
                session_label = f'api_session_T{req.T}',
            )
            result_box.append({'success': True, 'meta': meta})
        except Exception as e:
            result_box.append({'success': False, 'error': str(e)})
        finally:
            _set_train_state(status='idle')

    t = _t2.Thread(target=_run, daemon=True)
    t.start()
    t.join(timeout=3600)   # max 1 hour blocking

    if result_box:
        return result_box[0]
    return {'success': False, 'error': 'Training thread did not complete'}


@app.get('/train/datasets')
def train_datasets():
    """Return stats on all downloaded training datasets."""
    try:
        import sys as _sys
        if str(DIFFUSION_DIR.parent) not in _sys.path:
            _sys.path.insert(0, str(DIFFUSION_DIR.parent))
        from diffusion.dataset_reader import get_reader
        reader = get_reader()
        stats  = reader.get_stats()

        # Add disk usage info per dataset dir
        datasets_dir = Path(stats['datasets_dir'])
        disk_info: dict = {}
        if datasets_dir.exists():
            for d in sorted(datasets_dir.iterdir()):
                if d.is_dir() and not d.name.startswith('.'):
                    try:
                        size = sum(f.stat().st_size for f in d.rglob('*') if f.is_file())
                        disk_info[d.name] = round(size / 1e9, 3)
                    except Exception:
                        disk_info[d.name] = 0.0

        return {
            'success':   True,
            'stats':     stats,
            'disk_gb':   disk_info,
            'total_gb':  round(sum(disk_info.values()), 2),
        }
    except Exception as e:
        return {'success': False, 'error': str(e), 'stats': {}}


@app.get('/train/schedule')
def train_schedule():
    """Return the full 30-day curriculum schedule."""
    try:
        import sys as _sys
        if str(DIFFUSION_DIR.parent) not in _sys.path:
            _sys.path.insert(0, str(DIFFUSION_DIR.parent))
        from diffusion.training_curriculum import CurriculumTrainer
        trainer = CurriculumTrainer()
        return {
            'success':       True,
            'schedule':      trainer.get_schedule(),
            'current_status': trainer.scheduler.get_status(),
        }
    except Exception as e:
        return {'success': False, 'error': str(e)}


# ── Auto-start background training on server boot ─────────────────────────────
@app.on_event('startup')
async def _auto_start_training():
    """
    Automatically start continuous background training when the AI server boots.
    Resumes from existing weights_v4.npz + curriculum_progress.json if present.
    Runs until April 3, 2026 — the launch deadline.
    """
    import asyncio as _asyncio

    # Brief delay so the server fully initialises before training starts
    await _asyncio.sleep(5)

    global _train_thread
    with _train_lock:
        if _train_state['status'] == 'running':
            print('[AIServer] Training already running — skipping auto-start', flush=True)
            return

        _stop_event.clear()
        _train_state['error']   = None
        _train_state['status']  = 'running'
        _train_state['start_time'] = __import__('time').time()

    _train_thread = _threading.Thread(
        target=_training_worker,
        args=('continuous', 3, None),
        daemon=True,
        name='UNetV4TrainerBG',
    )
    _train_thread.start()
    print('[AIServer] Background training auto-started (continuous, deadline 2026-04-03)',
          flush=True)


# ── Entry point ────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    port = int(os.environ.get('AI_SERVICE_PORT', 9878))
    print(f'[AIServer] Starting on port {port}', flush=True)
    print(f'[AIServer] FFmpeg: {FFMPEG}', flush=True)
    print(f'[AIServer] Frame generator: {FRAME_GEN}', flush=True)
    uvicorn.run(app, host='127.0.0.1', port=port,
                log_level='warning', access_log=False)
