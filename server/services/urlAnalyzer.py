#!/usr/bin/env python3
"""
URL Content Analyzer for Max Booster
Fetches a URL and extracts music/artist metadata for content generation.

Usage: python3 urlAnalyzer.py '<url>'
Output: JSON to stdout
"""

import sys
import json
import re
import urllib.request
import urllib.parse
import urllib.error
from html.parser import HTMLParser
from typing import Optional

# ── Platform detection ─────────────────────────────────────────────────────────

PLATFORM_PATTERNS = {
    'spotify':      r'(open\.spotify\.com|spotify\.com)',
    'youtube':      r'(youtube\.com|youtu\.be)',
    'soundcloud':   r'soundcloud\.com',
    'apple_music':  r'music\.apple\.com',
    'tidal':        r'tidal\.com',
    'deezer':       r'deezer\.com',
    'bandcamp':     r'\.bandcamp\.com',
    'instagram':    r'instagram\.com',
    'tiktok':       r'tiktok\.com',
    'twitter':      r'(twitter\.com|x\.com)',
    'facebook':     r'facebook\.com',
    'audiomack':    r'audiomack\.com',
    'distrokid':    r'distrokid\.com',
}

MUSIC_STREAMING = {'spotify', 'youtube', 'soundcloud', 'apple_music', 'tidal', 'deezer', 'bandcamp', 'audiomack'}

GENRE_KEYWORDS = {
    'hip-hop':    ['hip hop', 'rap', 'trap', 'drill', 'freestyle', 'bars', 'flow', 'verse'],
    'r&b':        ['r&b', 'rnb', 'soul', 'neo-soul', 'groove', 'smooth'],
    'pop':        ['pop', 'radio', 'hit', 'catchy', 'mainstream', 'chart'],
    'electronic': ['electronic', 'edm', 'house', 'techno', 'rave', 'dj', 'club', 'synth'],
    'afrobeats':  ['afrobeats', 'afro', 'afropop', 'dancehall', 'latin', 'reggaeton'],
    'country':    ['country', 'folk', 'indie', 'acoustic', 'roots', 'bluegrass'],
    'rock':       ['rock', 'punk', 'metal', 'guitar', 'band', 'alternative'],
    'trap':       ['trap', 'drill', 'mumble', 'melodic trap'],
}

TONE_KEYWORDS = {
    'hype':       ['fire', 'lit', 'hype', 'banger', 'slap', 'hard', 'heat', 'anthem'],
    'romantic':   ['love', 'romance', 'heart', 'baby', 'forever', 'kiss', 'beautiful'],
    'motivational':['grind', 'hustle', 'rise', 'goals', 'success', 'win', 'champion'],
    'dark':       ['dark', 'pain', 'struggle', 'demons', 'shadow', 'cold', 'alone'],
    'uplifting':  ['positive', 'joy', 'happy', 'vibe', 'good', 'smile', 'sunshine'],
}


# ── HTML Parser ────────────────────────────────────────────────────────────────

class MetaExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title        = ''
        self.description  = ''
        self.og: dict     = {}
        self.twitter: dict= {}
        self.schema: dict = {}
        self._in_title    = False
        self._body_text   = []
        self._in_body     = False
        self._script_depth= 0
        self._in_script   = False

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        if tag == 'title':
            self._in_title = True
        elif tag == 'body':
            self._in_body = True
        elif tag == 'script':
            self._in_script = True
            self._script_depth += 1
        elif tag == 'meta':
            prop  = attrs_dict.get('property', '') or attrs_dict.get('name', '')
            content = attrs_dict.get('content', '')
            if prop.startswith('og:'):
                self.og[prop[3:]] = content
            elif prop.startswith('twitter:'):
                self.twitter[prop[8:]] = content
            elif prop == 'description':
                self.description = content

    def handle_endtag(self, tag):
        if tag == 'title':
            self._in_title = False
        elif tag == 'script':
            self._in_script = False
            self._script_depth = max(0, self._script_depth - 1)

    def handle_data(self, data):
        if self._in_title and not self.title:
            self.title = data.strip()
        elif self._in_body and not self._in_script:
            text = data.strip()
            if len(text) > 30:
                self._body_text.append(text)

    @property
    def body_preview(self) -> str:
        return ' '.join(self._body_text)[:500]


# ── Spotify URL parser ─────────────────────────────────────────────────────────

def parse_spotify_path(url: str) -> dict:
    m = re.search(r'spotify\.com/(track|album|artist|playlist)/([^/?]+)', url)
    if not m:
        return {}
    kind, sid = m.group(1), m.group(2)
    return {'spotify_type': kind, 'spotify_id': sid}


def parse_youtube_id(url: str) -> Optional[str]:
    m = re.search(r'(?:v=|youtu\.be/)([A-Za-z0-9_-]{11})', url)
    return m.group(1) if m else None


# ── Genre + tone detection ─────────────────────────────────────────────────────

def detect_genre(text: str) -> str:
    text_l = text.lower()
    scores = {g: sum(1 for kw in kws if kw in text_l) for g, kws in GENRE_KEYWORDS.items()}
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else 'hip-hop'


def detect_tone(text: str) -> str:
    text_l = text.lower()
    scores = {t: sum(1 for kw in kws if kw in text_l) for t, kws in TONE_KEYWORDS.items()}
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else 'default'


# ── Main analyzer ──────────────────────────────────────────────────────────────

def analyze_url(url: str) -> dict:
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url

    # Detect platform before fetching
    platform = 'web'
    for name, pattern in PLATFORM_PATTERNS.items():
        if re.search(pattern, url, re.I):
            platform = name
            break

    result = {
        'url':          url,
        'platform':     platform,
        'is_music':     platform in MUSIC_STREAMING,
        'title':        '',
        'description':  '',
        'artist':       '',
        'track':        '',
        'album':        '',
        'genre':        'hip-hop',
        'tone':         'default',
        'og_image':     '',
        'summary':      '',
        'content_type': 'track' if platform in MUSIC_STREAMING else 'general',
    }

    # Spotify path metadata
    if platform == 'spotify':
        sp = parse_spotify_path(url)
        result.update(sp)

    # Fetch the page
    try:
        req = urllib.request.Request(
            url,
            headers={
                'User-Agent': 'Mozilla/5.0 (compatible; MaxBooster/1.0)',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.9',
            }
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            raw = resp.read(128 * 1024)  # Max 128KB
            charset = 'utf-8'
            ct = resp.headers.get('Content-Type', '')
            m = re.search(r'charset=([^\s;]+)', ct, re.I)
            if m:
                charset = m.group(1).replace('"', '').strip()
            html = raw.decode(charset, errors='replace')
    except Exception as e:
        result['error'] = str(e)
        return result

    # Parse HTML
    parser = MetaExtractor()
    try:
        parser.feed(html)
    except Exception:
        pass

    # Assemble metadata
    title = parser.og.get('title') or parser.twitter.get('title') or parser.title or ''
    desc  = parser.og.get('description') or parser.twitter.get('description') or \
            parser.description or parser.body_preview[:200]
    image = parser.og.get('image') or parser.twitter.get('image:src') or ''

    result['title']       = title.strip()
    result['description'] = desc.strip()
    result['og_image']    = image.strip()

    # Parse artist / track from common og:title patterns:  "Artist - Track"
    if ' - ' in title:
        parts = title.split(' - ', 1)
        result['artist'] = parts[0].strip()
        result['track']  = parts[1].strip()
    elif ' by ' in title.lower():
        m = re.search(r'^(.*?) by (.+)$', title, re.I)
        if m:
            result['track']  = m.group(1).strip()
            result['artist'] = m.group(2).strip()
    elif parser.og.get('music:musician'):
        result['artist'] = parser.og.get('music:musician', '').split('/')[-1]

    # OG type → content_type
    og_type = parser.og.get('type', '')
    if 'music.song' in og_type or 'music.album' in og_type:
        result['content_type'] = 'track' if 'song' in og_type else 'album'

    # Detect genre and tone from combined text
    combined = f"{title} {desc}"
    result['genre'] = detect_genre(combined)
    result['tone']  = detect_tone(combined)

    # Build a clean summary for content generation
    if result['artist'] and result['track']:
        result['summary'] = f"{result['track']} by {result['artist']}"
    else:
        result['summary'] = title or desc[:100]

    return result


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: urlAnalyzer.py <url>'}))
        sys.exit(1)

    out = analyze_url(sys.argv[1])
    print(json.dumps(out))
