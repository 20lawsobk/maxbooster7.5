"""
Max Booster AI Content Sidecar — port 9878 (PYTHON_AI_PORT)
------------------------------------------------------------
Thin MaxCore proxy that fulfils every endpoint consumed by
server/services/pythonAIService.ts.  Uses only Python stdlib
so zero pip installs are required.

Architecture (direct-call path — bypasses Express CSRF):
  pythonAIService.ts  →  THIS SIDECAR (port 9878, 127.0.0.1 only)
                                ↓
                          MaxCore  (local loopback / MAXCORE_URL)

The sidecar also remains reachable via the Express proxy for any
browser-side callers that go through /api/ai-service/* (BOOSTERSTATE_SECRET
auth layer in internalProxy.ts).  The loopback-only bind ensures external
callers cannot reach this service directly.

MaxCore-only, fail-explicit: MaxCore is the ONLY content source. When it is
unreachable or returns nothing usable, endpoints answer 503 — the sidecar
never substitutes locally-templated content.
"""

import hashlib
import hmac as _hmac
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


def _resolve_maxcore_url() -> str:
    """Mirror server/config/index.ts + maxcoreConnector.getMaxcoreOrigin().

    - Local mode (default, MAXCORE_LOCAL != "0"): the supervised MaxCore child
      on loopback — never the public app URL, so requests can't bounce off
      Express CSRF/Origin validation.
    - Remote mode: MAXCORE_URL / AI_SERVER_URL, normalized to the root origin.
      Deployments have historically set the URL with a trailing "/api"; strip
      it so `f"{MC_URL}/api{path}"` never produces a doubled "/api/api/..."
      path (which the main app rejects with 403).
    """
    if os.environ.get('MAXCORE_LOCAL', '1') != '0':
        port = os.environ.get('MAXCORE_LOCAL_PORT') or '8090'
        return f'http://127.0.0.1:{port}'
    raw = (os.environ.get('MAXCORE_URL') or os.environ.get('AI_SERVER_URL') or '').rstrip('/')
    if raw.endswith('/api'):
        raw = raw[:-len('/api')]
    return raw


def _resolve_maxcore_key() -> str:
    """Mirror config.maxcoreGenerationKey: explicit key, else the deterministic
    loopback key derived from SESSION_SECRET in local mode."""
    explicit = os.environ.get('AI_SERVER_KEY') or os.environ.get('MAXCORE_ADMIN_KEY')
    if explicit:
        return explicit
    secret = os.environ.get('SESSION_SECRET', '')
    if os.environ.get('MAXCORE_LOCAL', '1') != '0' and secret:
        digest = _hmac.new(secret.encode(), b'maxcore-gen', hashlib.sha256).hexdigest()
        return 'mclocal-' + digest[:40]
    return ''


MC_URL = _resolve_maxcore_url()
MC_KEY = _resolve_maxcore_key()
# Keep TIMEOUT comfortably below pythonAIService.ts's 30 s client timeout so
# the sidecar always finishes (and can write the response) before the caller
# gives up and closes the connection.
TIMEOUT = 20

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
        # Bearer ONLY — MaxCore validates X-API-Key/X-Admin-Key schemes first
        # and 401s the whole request if either is present (see replit.md).
        headers = {
            'Content-Type':  'application/json',
            'Authorization': f'Bearer {MC_KEY}',
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


class MaxCoreUnavailable(Exception):
    """MaxCore returned no usable content.

    Per the MaxCore-only fail-explicit contract, the sidecar must NEVER
    substitute locally-templated content — callers must see an explicit
    503 so unavailability is always visible.
    """


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

    # 3. Split plain MaxCore text into lines — never fabricate copy locally.
    if not hook:
        lines     = [l.strip() for l in raw.split('\n') if l.strip()]
        if not lines:
            raise MaxCoreUnavailable('MaxCore returned no usable content')
        hook      = lines[0][:140]
        body_text = ' '.join(lines[1:3]) if len(lines) > 1 else ''
        cta       = lines[-1] if len(lines) > 2 else ''

    if not hashtags:
        hashtags = _hashtags_for(platform, genre)

    if not caption:
        caption = '\n\n'.join(filter(None, [hook, body_text, cta,
                                             ' '.join(hashtags)]))

    return dict(hook=hook, body=body_text, cta=cta,
                caption=caption, hashtags=hashtags)


def _extract_fields(result, platform: str, topic: str, genre: str,
                    context: str = 'content generation') -> dict:
    """Build hook/body/cta/hashtags/caption from a MaxCore reply.

    MaxCore's /api/generate/content returns structured fields directly
    (caption, hook, body, cta, hashtags, ...). Older/other endpoints return a
    raw text blob under result/content/text/output. Prefer structured fields,
    then parse raw text. Fail-explicit: no usable MaxCore content raises
    MaxCoreUnavailable — never substitute locally-templated copy.
    """
    if isinstance(result, dict):
        if result.get('caption') or result.get('hook'):
            raw_tags = result.get('hashtags', [])
            hashtags = ([str(t) for t in raw_tags] if isinstance(raw_tags, list)
                        else []) or _hashtags_for(platform, genre)
            hook      = str(result.get('hook', ''))
            body_text = str(result.get('body', result.get('body_text', '')))
            cta       = str(result.get('cta', ''))
            caption   = str(result.get('caption', '')) or '\n\n'.join(
                filter(None, [hook, body_text, cta, ' '.join(hashtags)]))
            return dict(hook=hook, body=body_text, cta=cta,
                        caption=caption, hashtags=hashtags)
        raw = (result.get('result') or result.get('content') or
               result.get('text')   or result.get('output') or '')
        if not raw and isinstance(result.get('data'), str):
            raw = result['data']
        if raw:
            return _parse_content(raw, platform, topic, genre)
    raise MaxCoreUnavailable(context)


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
    fields = _extract_fields(result, platform, topic, genre, 'content generation')

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
    ms = round((time.time() - t0) * 1000)
    f  = _extract_fields(result, platform, idea, '', 'script generation')
    if not (f.get('hook') or f.get('body')):
        raise MaxCoreUnavailable('script generation (empty response)')

    return {
        'success':            True,
        'hook':               f.get('hook', ''),
        'body':               f.get('body', ''),
        'cta':                f.get('cta', ''),
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
        fields = _extract_fields(result, platform, topic, genre,
                                 f'multi-platform generation ({platform})')

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

    def _send(self, data: dict, status: int = 200) -> bool:
        """Serialize *data* as JSON and write the HTTP response.

        Returns True on success, False if the client has already disconnected
        (BrokenPipeError / ConnectionResetError).  All other errors are
        re-raised so callers can decide how to handle them.
        """
        try:
            body = json.dumps(data, ensure_ascii=False, default=str).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Connection', 'close')
            self.end_headers()
            self.wfile.write(body)
            return True
        except (BrokenPipeError, ConnectionResetError):
            # Client disconnected before we could send — not an error on our side.
            log.debug('%s %s — client disconnected before response was sent',
                      getattr(self, 'command', '?'), getattr(self, 'path', '?'))
            return False

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
                result = _mc_get(f'/video-job/{job_id}')
                if result is None:
                    # Never fabricate job progress — surface the outage.
                    self._send({'success': False, 'job_id': job_id,
                                'error': 'MaxCore unavailable — video job status unknown'}, 503)
                else:
                    self._send(result)
            else:
                self._send({'error': 'Not found'}, 404)
        except (BrokenPipeError, ConnectionResetError):
            log.debug('GET %s — client disconnected', path)
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
                fields = _extract_fields(result, platform, script, '',
                                         'distribution caption generation')
                self._send({
                    'success':      True,
                    'caption':      fields['caption'],
                    'content':      fields['body'] or fields['hook'],
                    'hashtags':     fields['hashtags'],
                    'posting_time': '',
                    'platform':     platform,
                })

            elif path == '/boostsheet/create':
                result = _mc_post('/boostsheet/create', body)
                if result is None:
                    raise MaxCoreUnavailable('boost sheet creation')
                self._send(result)

            elif path == '/optimize':
                result = _mc_post('/optimize', body)
                if result is None:
                    raise MaxCoreUnavailable('content optimization')
                self._send(result)

            elif path == '/generate/video':
                result = _mc_post('/generate/video', body)
                if result is None:
                    raise MaxCoreUnavailable('video generation')
                self._send(result)

            elif path in ('/generate-video', '/generate/video-job'):
                result = _mc_post('/generate-video', body)
                if result is None:
                    raise MaxCoreUnavailable('video job submission')
                self._send(result)

            elif path == '/generate/visual-spec':
                result = _mc_post('/generate/visual-spec', body)
                if result is None:
                    raise MaxCoreUnavailable('visual spec generation')
                self._send(result)

            elif path == '/generate/image':
                result = _mc_post('/generate/image', body)
                if result is None:
                    raise MaxCoreUnavailable('image generation')
                self._send(result)

            elif path == '/analyze/audio':
                result = _mc_post('/audio/analyze', body)
                if result is None:
                    raise MaxCoreUnavailable('audio analysis')
                self._send(result)

            elif path == '/analyze/transcribe':
                result = _mc_post('/analyze/transcribe', body)
                if result is None:
                    raise MaxCoreUnavailable('audio transcription')
                self._send(result)

            else:
                # Universal passthrough for any unlisted endpoint
                result = _mc_post(path, body)
                if result is not None:
                    self._send(result)
                else:
                    self._send({'error': f'Endpoint {path} not available'}, 404)

        except (BrokenPipeError, ConnectionResetError):
            # Client dropped the connection mid-request — nothing to respond to.
            log.debug('POST %s — client disconnected mid-request', path)
        except MaxCoreUnavailable as exc:
            # Fail-explicit contract: MaxCore is the ONLY content source.
            log.warning('POST %s — MaxCore unavailable: %s', path, exc)
            self._send({'success': False,
                        'error': f'MaxCore unavailable — {exc}'}, 503)
        except Exception as exc:
            log.error('POST %s error: %s\n%s', path, exc, traceback.format_exc())
            # Best-effort error response — ignore if the pipe is already gone.
            self._send({'error': str(exc)}, 500)


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    if not MC_URL:
        log.warning('MaxCore URL not resolved — all generation endpoints will return 503 (MaxCore-only, fail-explicit)')
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
