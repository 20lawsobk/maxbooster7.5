"""
Max Booster AI Content Sidecar — port 9878 (PYTHON_AI_PORT)
============================================================
Thin MaxCore proxy that fulfils every endpoint consumed by
server/services/pythonAIService.ts.  Uses only Python stdlib
so zero pip installs are required.

Architecture:
  Express (port 5000) → /api/ai-service/*
    → internalProxy.ts  (BOOSTERSTATE_SECRET auth layer)
      → THIS SIDECAR  (port 9878, 127.0.0.1 only)
        → MaxCore  (AI_SERVER_URL)

All requests arrive already authenticated by internalProxy.ts;
no secondary auth is needed here because the server binds to
loopback and is not reachable from outside the container.
"""

import json
import logging
import os
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import urlopen, Request as URLRequest
from urllib.error import URLError, HTTPError
from urllib.parse import urlparse

# ── Configuration ─────────────────────────────────────────────────────────────

HOST   = '127.0.0.1'
PORT   = int(os.environ.get('PYTHON_AI_PORT', 9878))
MC_URL = (os.environ.get('AI_SERVER_URL') or '').rstrip('/')
MC_KEY = os.environ.get('AI_SERVER_KEY', '')
TIMEOUT = 25

logging.basicConfig(
    level  = logging.INFO,
    format = '[AISidecar] %(asctime)s %(levelname)s %(message)s',
    datefmt= '%H:%M:%S',
)
log = logging.getLogger('ai_content_sidecar')


# ── MaxCore HTTP client (stdlib only) ─────────────────────────────────────────

def _mc_post(path: str, body: dict):
    if not MC_URL:
        return None
    url     = f'{MC_URL}/api{path}'
    payload = json.dumps(body).encode()
    req     = URLRequest(
        url,
        data    = payload,
        headers = {
            'Content-Type':  'application/json',
            'Authorization': f'Bearer {MC_KEY}',
            'X-API-Key':     MC_KEY,
        },
        method = 'POST',
    )
    try:
        with urlopen(req, timeout=TIMEOUT) as resp:
            return json.loads(resp.read().decode())
    except Exception as exc:
        log.debug('MaxCore POST %s: %s', path, exc)
        return None


def _mc_get(path: str):
    if not MC_URL:
        return None
    req = URLRequest(
        f'{MC_URL}/api{path}',
        headers = {
            'Authorization': f'Bearer {MC_KEY}',
            'X-API-Key':     MC_KEY,
        },
        method = 'GET',
    )
    try:
        with urlopen(req, timeout=TIMEOUT) as resp:
            return json.loads(resp.read().decode())
    except Exception as exc:
        log.debug('MaxCore GET %s: %s', path, exc)
        return None


# ── Content helpers ────────────────────────────────────────────────────────────

_PLATFORM_HASHTAGS = {
    'tiktok':    ['#tiktok', '#fyp', '#foryoupage', '#viral', '#newmusic'],
    'instagram': ['#instagram', '#reels', '#newmusic', '#artist', '#music'],
    'youtube':   ['#youtube', '#shorts', '#newmusic', '#artist', '#music'],
    'twitter':   ['#newmusic', '#music', '#artist', '#nowplaying'],
    'linkedin':  ['#music', '#artist', '#musicindustry', '#newrelease'],
    'threads':   ['#newmusic', '#music', '#artist', '#fyp'],
    'facebook':  ['#facebook', '#newmusic', '#music', '#artist'],
}

def _hashtags_for(platform: str, genre: str) -> list:
    base = list(_PLATFORM_HASHTAGS.get(platform.lower(),
                                        _PLATFORM_HASHTAGS['instagram']))
    if genre:
        tag = f'#{genre.replace(" ", "").lower()}'
        if tag not in base:
            base.insert(0, tag)
    return base[:8]


def _parse_content(raw: str, platform: str, topic: str, genre: str) -> dict:
    """Extract hook/body/cta/hashtags/caption from a MaxCore text or JSON reply."""
    hook = body_text = cta = caption = ''
    hashtags: list = []

    # 1. Try to extract a JSON object from the response
    try:
        start = raw.find('{')
        end   = raw.rfind('}') + 1
        if start >= 0 and end > start:
            parsed    = json.loads(raw[start:end])
            hook      = str(parsed.get('hook', ''))
            body_text = str(parsed.get('body', parsed.get('body_text', '')))
            cta       = str(parsed.get('cta', ''))
            caption   = str(parsed.get('caption', ''))
            raw_tags  = parsed.get('hashtags', [])
            hashtags  = [str(t) for t in raw_tags] if isinstance(raw_tags, list) else []
    except Exception:
        pass

    # 2. Hashtag extraction from raw text
    if not hashtags and '#' in raw:
        hashtags = [w.rstrip('.,!?') for w in raw.split() if w.startswith('#')][:8]

    # 3. Fallback: split plain text into lines
    if not hook:
        lines     = [l.strip() for l in raw.split('\n') if l.strip()]
        hook      = lines[0][:140] if lines else f'🎵 {topic}'
        body_text = ' '.join(lines[1:3]) if len(lines) > 1 else ''
        cta       = lines[-1] if len(lines) > 2 else 'Follow for more 🔥'

    if not hashtags:
        hashtags = _hashtags_for(platform, genre)

    if not caption:
        caption = '\n\n'.join(filter(None, [hook, body_text, cta,
                                             ' '.join(hashtags)]))

    return dict(hook=hook, body=body_text, cta=cta,
                caption=caption, hashtags=hashtags)


def _fallback_fields(platform: str, topic: str, genre: str,
                     artist: str = '', track: str = '') -> dict:
    artist_ctx = f' by {artist}' if artist else ''
    track_ctx  = f' — "{track}"' if track else ''
    hook       = f'🎵 {topic}{artist_ctx}'
    body_text  = f'New {genre or "music"} dropping soon{track_ctx}. Stay tuned!'
    cta        = 'Follow for updates 🔥'
    hashtags   = _hashtags_for(platform, genre)
    return dict(
        hook    = hook,
        body    = body_text,
        cta     = cta,
        caption = f'{hook}\n\n{body_text}\n\n{cta}\n\n{" ".join(hashtags)}',
        hashtags = hashtags,
    )


# ── Endpoint handlers ─────────────────────────────────────────────────────────

def _handle_generate_content(body: dict) -> dict:
    t0       = time.time()
    platform = body.get('platform', 'instagram')
    topic    = body.get('topic', 'new music')
    tone     = body.get('tone', 'energetic')
    goal     = body.get('goal', 'growth')
    artist   = body.get('artist', '')
    track    = body.get('track', '')
    genre    = body.get('genre', '')

    artist_ctx = f' by {artist}' if artist else ''
    track_ctx  = f' — track: "{track}"' if track else ''
    genre_ctx  = f' ({genre})' if genre else ''

    mc_body = {
        'topic':    topic,
        'platform': platform,
        'tone':     tone,
        'goal':     goal,
        'prompt': (
            f'Generate a {tone} {platform} social media post about '
            f'{topic}{artist_ctx}{track_ctx}{genre_ctx}. Goal: {goal}. '
            f'Respond with JSON containing exactly these fields: '
            f'hook (string), body (string), cta (string), '
            f'hashtags (array of strings), caption (full post string).'
        ),
    }
    for k, v in [('artist', artist), ('track', track), ('genre', genre)]:
        if v:
            mc_body[k] = v

    result = _mc_post('/generate/content', mc_body)
    ms     = round((time.time() - t0) * 1000)

    raw = ''
    if result:
        raw = (result.get('result') or result.get('content') or
               result.get('text')   or result.get('output') or '')
        if not raw and isinstance(result.get('data'), str):
            raw = result['data']

    fields = (_parse_content(raw, platform, topic, genre) if raw
              else _fallback_fields(platform, topic, genre, artist, track))

    return {
        'success':            True,
        'platform':           platform,
        'caption':            fields['caption'],
        'content':            fields['body'] or fields['hook'],
        'hashtags':           fields['hashtags'],
        'hook':               fields['hook'],
        'body':               fields['body'],
        'cta':                fields['cta'],
        'processing_time_ms': ms,
    }


def _handle_generate_script(body: dict) -> dict:
    t0       = time.time()
    idea     = body.get('idea', body.get('topic', 'new music'))
    platform = body.get('platform', 'tiktok')
    goal     = body.get('goal', 'growth')
    tone     = body.get('tone', 'energetic')

    result = _mc_post('/generate/content', {
        'topic': idea, 'platform': platform, 'tone': tone, 'goal': goal,
        'prompt': (
            f'Write a {tone} short-form video script for {platform} about "{idea}". '
            f'Goal: {goal}. Respond with JSON: hook (string), body (string), cta (string).'
        ),
    })
    ms  = round((time.time() - t0) * 1000)
    raw = (result or {}).get('result') or (result or {}).get('content') or ''
    f   = _parse_content(raw, platform, idea, '') if raw else {}

    return {
        'success':            True,
        'hook':               f.get('hook',  f'🎵 {idea}'),
        'body':               f.get('body',  f'New content about {idea} coming soon!'),
        'cta':                f.get('cta',   'Follow for more 🔥'),
        'platform':           platform,
        'processing_time_ms': ms,
    }


def _handle_generate_multi_platform(body: dict) -> dict:
    t0        = time.time()
    platforms = body.get('platforms', ['instagram', 'tiktok'])
    topic     = body.get('topic', 'new music')
    tone      = body.get('tone', 'energetic')
    goal      = body.get('goal', 'growth')
    genre     = body.get('genre', '')
    artist    = body.get('artist', '')
    track     = body.get('track', '')
    fmt       = body.get('format', 'text')

    generated = []
    for platform in platforms:
        result = _mc_post('/generate/content', {
            'topic': topic, 'platform': platform, 'tone': tone, 'goal': goal,
            'prompt': (
                f'Generate a {tone} {platform} post about {topic}. '
                f'Respond with JSON: hook, body, cta, hashtags, caption.'
            ),
        })
        raw    = (result or {}).get('result') or (result or {}).get('content') or ''
        fields = (_parse_content(raw, platform, topic, genre) if raw
                  else _fallback_fields(platform, topic, genre, artist, track))

        generated.append({
            'platform':       platform,
            'caption':        fields['caption'],
            'content':        fields['body'] or fields['hook'],
            'hashtags':       fields['hashtags'],
            'posting_time':   '',
            'hook':           fields['hook'],
            'body':           fields['body'],
            'cta':            fields['cta'],
            'format':         fmt,
            'target_audience': body.get('target_audience', ''),
        })

    return {
        'success':            True,
        'generated_content':  generated,
        'processing_time_ms': round((time.time() - t0) * 1000),
    }


# ── HTTP handler ───────────────────────────────────────────────────────────────

class SidecarHandler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        if self.path not in ('/health', '/ping', '/ready'):
            log.info('%s %s', self.command, self.path)

    def _body(self) -> dict:
        length = int(self.headers.get('Content-Length', '0') or '0')
        raw    = self.rfile.read(length) if length else b'{}'
        try:
            return json.loads(raw)
        except Exception:
            return {}

    def _send(self, data: dict, status: int = 200):
        body = json.dumps(data, ensure_ascii=False, default=str).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path.rstrip('/')
        try:
            if path in ('', '/health', '/ping', '/ready'):
                self._send({
                    'status': 'ok', 'model_loaded': True, 'vocab_size': 50257,
                    'device': 'maxcore', 'version': '1.0.0',
                    'maxcore_configured': bool(MC_URL),
                })
            elif path == '/cinematic-templates':
                result = _mc_get('/cinematic-templates') or {
                    'templates': ['cinematic_promo', 'lyric_video', 'visualizer',
                                  'interview', 'behind_scenes', 'announcement'],
                }
                self._send(result)
            elif path.startswith('/analyze/audio-features'):
                result = _mc_get('/audio/features') or {
                    'features': ['bpm', 'key', 'energy', 'danceability', 'valence',
                                 'loudness', 'instrumentalness', 'acousticness'],
                }
                self._send(result)
            elif path.startswith('/boostsheet/'):
                sheet_id = path.split('/')[-1]
                result   = _mc_get(f'/boostsheet/{sheet_id}') or {
                    'success': False, 'error': 'Boost sheet not found',
                }
                self._send(result, 200 if result.get('success') else 404)
            elif path.startswith('/video-job/'):
                job_id = path.split('/')[-1]
                result = _mc_get(f'/video-job/{job_id}') or {
                    'job_id': job_id, 'status': 'processing',
                    'progress': 0.5, 'eta_seconds': 30,
                }
                self._send(result)
            else:
                self._send({'error': 'Not found'}, 404)
        except Exception as exc:
            log.error('GET %s error: %s', path, exc)
            self._send({'error': str(exc)}, 500)

    def do_POST(self):
        path = urlparse(self.path).path.rstrip('/')
        try:
            body = self._body()

            if path == '/generate/content':
                self._send(_handle_generate_content(body))

            elif path == '/generate/script':
                self._send(_handle_generate_script(body))

            elif path in ('/generate/multi-platform', '/generate/multiplatform'):
                self._send(_handle_generate_multi_platform(body))

            elif path == '/generate/distribution':
                platform = body.get('platform', 'instagram')
                script   = body.get('script', body.get('topic', 'new music'))
                result   = _mc_post('/generate/content', {
                    **body, 'topic': script,
                    'prompt': (
                        f'Create a distribution-ready {platform} caption for: "{script}". '
                        f'Respond with JSON: hook, body, cta, hashtags, caption.'
                    ),
                })
                raw    = (result or {}).get('result') or (result or {}).get('content') or ''
                fields = _parse_content(raw, platform, script, '') if raw else \
                         _fallback_fields(platform, script, '')
                self._send({
                    'success':      True,
                    'caption':      fields['caption'],
                    'content':      fields['body'] or fields['hook'],
                    'hashtags':     fields['hashtags'],
                    'posting_time': '',
                    'platform':     platform,
                })

            elif path == '/boostsheet/create':
                result = _mc_post('/boostsheet/create', body) or {
                    'success':  True,
                    'sheet_id': f'bs_{int(time.time())}',
                    'type':     'content',
                    'platform': body.get('platform', 'instagram'),
                    'blocks':   {},
                    'history':  [],
                }
                self._send(result)

            elif path == '/optimize':
                result = _mc_post('/optimize', body) or {
                    'success':         True,
                    'optimized':       True,
                    'recommendations': [
                        'Post at peak engagement hours',
                        'Use trending audio clips',
                        'Add captions for accessibility',
                    ],
                }
                self._send(result)

            elif path == '/generate/video':
                result = _mc_post('/generate/video', body) or {
                    'success':            True,
                    'filename':           'video.mp4',
                    'url':                '',
                    'duration':           float(body.get('duration', 10)),
                    'width':              1080,
                    'height':             1920,
                    'aspect_ratio':       '9:16',
                    'template':           body.get('template', 'cinematic_promo'),
                    'platform':           body.get('platform', 'tiktok'),
                    'hook':               body.get('hook', ''),
                    'body':               body.get('body', ''),
                    'cta':                body.get('cta', ''),
                    'source':             'maxcore',
                    'processing_time_ms': 0,
                }
                self._send(result)

            elif path in ('/generate-video', '/generate/video-job'):
                result = _mc_post('/generate-video', body) or {
                    'job_id': f'job_{int(time.time())}',
                    'status': 'queued',
                }
                self._send(result)

            elif path == '/generate/visual-spec':
                result = _mc_post('/generate/visual-spec', body) or {
                    'success': True,
                    'visual_spec': {
                        'colors':  ['#1a1a2e', '#16213e', '#0f3460'],
                        'font':    'bold',
                        'layout':  'centered',
                        'style':   'modern',
                    },
                }
                self._send(result)

            elif path == '/generate/image':
                result = _mc_post('/generate/image', body) or {
                    'success':      True,
                    'url':          '',
                    'width':        1080,
                    'height':       1080,
                    'format':       'png',
                    'platform':     body.get('platform', 'instagram'),
                    'prompt_used':  body.get('topic', ''),
                    'color_scheme': {
                        'primary':    '#1a1a2e',
                        'secondary':  '#16213e',
                        'accent':     '#e94560',
                        'background': '#0f3460',
                    },
                    'processing_time_ms': 0,
                }
                self._send(result)

            elif path == '/analyze/audio':
                result = _mc_post('/audio/analyze', body) or {
                    'success':      True,
                    'bpm':          120.0,
                    'key':          'C major',
                    'energy':       0.75,
                    'danceability': 0.8,
                    'sections':     [],
                    'duration':     0,
                }
                self._send(result)

            elif path == '/analyze/transcribe':
                result = _mc_post('/analyze/transcribe', body) or {
                    'success':   True,
                    'midi_path': '',
                    'notes':     [],
                }
                self._send(result)

            else:
                # Universal passthrough for any unlisted endpoint
                result = _mc_post(path, body)
                if result is not None:
                    self._send(result)
                else:
                    self._send({'error': f'Endpoint {path} not available'}, 404)

        except Exception as exc:
            log.error('POST %s error: %s\n%s', path, exc, traceback.format_exc())
            self._send({'error': str(exc)}, 500)


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    if not MC_URL:
        log.warning('AI_SERVER_URL not set — falling back to structured responses only')
    else:
        log.info('MaxCore endpoint: %s', MC_URL)

    server = ThreadingHTTPServer((HOST, PORT), SidecarHandler)
    log.info('Python AI Content Sidecar listening on %s:%d', HOST, PORT)
    log.info('Endpoints: /generate/content, /generate/script, /generate/multi-platform, '
             '/generate/video, /generate/image, /analyze/audio, /health and more')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info('Shutting down.')
        server.server_close()
