#!/usr/bin/env python3
"""
URL Content Analyzer for Max Booster
Fetches any URL and extracts metadata, content, and signals for social content generation.

Works with music platforms, news sites, blogs, e-commerce, social profiles,
event pages, brand sites, YouTube videos, and anything else with a URL.

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

# ── Platform catalogue ─────────────────────────────────────────────────────────
# Maps pattern → (platform_id, platform_category)

PLATFORMS: list[tuple[str, str, str]] = [
    # Music streaming
    (r'(open\.spotify\.com|spotify\.com)',    'spotify',      'music'),
    (r'(youtube\.com|youtu\.be)',             'youtube',      'video'),
    (r'soundcloud\.com',                      'soundcloud',   'music'),
    (r'music\.apple\.com',                   'apple_music',  'music'),
    (r'tidal\.com',                           'tidal',        'music'),
    (r'deezer\.com',                          'deezer',       'music'),
    (r'\.bandcamp\.com',                      'bandcamp',     'music'),
    (r'audiomack\.com',                       'audiomack',    'music'),
    (r'music\.amazon\.com',                  'amazon_music', 'music'),
    (r'pandora\.com',                         'pandora',      'music'),
    (r'boomplay\.com',                        'boomplay',     'music'),
    (r'genius\.com',                          'genius',       'music'),
    (r'pitchfork\.com',                       'pitchfork',    'music_news'),
    (r'rollingstone\.com',                   'rolling_stone','music_news'),
    (r'billboard\.com',                       'billboard',    'music_news'),
    (r'hypebeast\.com',                       'hypebeast',    'culture'),
    (r'complex\.com',                         'complex',      'culture'),
    # Social platforms
    (r'instagram\.com',                       'instagram',    'social'),
    (r'tiktok\.com',                          'tiktok',       'social'),
    (r'(twitter\.com|x\.com)',               'twitter',      'social'),
    (r'facebook\.com',                        'facebook',     'social'),
    (r'threads\.net',                         'threads',      'social'),
    (r'linkedin\.com',                        'linkedin',     'social'),
    (r'pinterest\.com',                       'pinterest',    'social'),
    (r'snapchat\.com',                        'snapchat',     'social'),
    (r'reddit\.com',                          'reddit',       'social'),
    (r'tumblr\.com',                          'tumblr',       'social'),
    # Video platforms
    (r'vimeo\.com',                           'vimeo',        'video'),
    (r'twitch\.tv',                           'twitch',       'video'),
    (r'dailymotion\.com',                    'dailymotion',  'video'),
    # Music distribution / industry
    (r'distrokid\.com',                       'distrokid',    'music'),
    (r'tunecore\.com',                        'tunecore',     'music'),
    (r'cdbaby\.com',                          'cd_baby',      'music'),
    (r'(landr\.com|landr)',                   'landr',        'music'),
    (r'submithub\.com',                       'submithub',    'music'),
    # News / editorial
    (r'nytimes\.com',                         'nytimes',      'news'),
    (r'bbc\.(co\.uk|com)',                   'bbc',          'news'),
    (r'cnn\.com',                             'cnn',          'news'),
    (r'theguardian\.com',                    'guardian',     'news'),
    (r'forbes\.com',                          'forbes',       'business'),
    (r'entrepreneur\.com',                   'entrepreneur', 'business'),
    (r'techcrunch\.com',                      'techcrunch',   'tech'),
    (r'medium\.com',                          'medium',       'blog'),
    (r'substack\.com',                        'substack',     'blog'),
    # E-commerce
    (r'amazon\.(com|co\.uk)',                'amazon',       'ecommerce'),
    (r'etsy\.com',                            'etsy',         'ecommerce'),
    (r'shopify\.com',                         'shopify',      'ecommerce'),
    # Events
    (r'(eventbrite\.com|eventbrite)',         'eventbrite',   'event'),
    (r'ra\.co',                              'resident_advisor', 'event'),
    (r'songkick\.com',                        'songkick',     'event'),
    (r'stubhub\.com',                         'stubhub',      'event'),
    # Misc
    (r'linktr\.ee',                          'linktree',     'profile'),
    (r'allmylinks\.com',                     'allmylinks',   'profile'),
    (r'beacons\.ai',                         'beacons',      'profile'),
    (r'campsite\.bio',                       'campsite',     'profile'),
]

MUSIC_CATEGORIES = {'music', 'music_news'}
MUSIC_PLATFORMS  = {p for p, _, c in PLATFORMS if c in MUSIC_CATEGORIES}

# ── Content type signals ────────────────────────────────────────────────────────

OG_TYPE_MAP = {
    'music.song':     'track',
    'music.album':    'album',
    'music.playlist': 'playlist',
    'music.radio_station': 'radio',
    'article':        'article',
    'video.other':    'video',
    'video.movie':    'video',
    'video.tv_show':  'video',
    'video.episode':  'video',
    'product':        'product',
    'profile':        'profile',
    'website':        'website',
    'book':           'article',
    'event':          'event',
}

# ── Content category detection ─────────────────────────────────────────────────
# Used when the platform category is 'web' or ambiguous.

CONTENT_CATEGORY_KEYWORDS: dict[str, list[str]] = {
    'music':       ['music', 'song', 'track', 'album', 'artist', 'rapper', 'singer',
                    'producer', 'beat', 'mixtape', 'ep', 'single', 'stream', 'listen',
                    'spotify', 'soundcloud', 'bpm', 'lyrics', 'hip hop', 'rap'],
    'news':        ['breaking', 'report', 'exclusive', 'news', 'journalist', 'editor',
                    'press', 'media', 'headline', 'story', 'interview', 'publish'],
    'tech':        ['technology', 'software', 'app', 'startup', 'developer', 'code',
                    'ai', 'artificial intelligence', 'launch', 'product', 'feature'],
    'business':    ['business', 'brand', 'company', 'revenue', 'growth', 'strategy',
                    'entrepreneur', 'funding', 'investment', 'market', 'deal'],
    'culture':     ['culture', 'lifestyle', 'fashion', 'style', 'trend', 'street',
                    'hypebeast', 'sneaker', 'design', 'art', 'creative'],
    'entertainment':['movie', 'film', 'tv show', 'series', 'celebrity', 'award',
                    'drama', 'comedy', 'streaming', 'netflix', 'hbo'],
    'sports':      ['sports', 'game', 'match', 'championship', 'team', 'player',
                    'nba', 'nfl', 'soccer', 'football', 'basketball', 'athlete'],
    'event':       ['concert', 'festival', 'event', 'tour', 'show', 'performance',
                    'ticket', 'venue', 'live', 'vip', 'gig', 'club'],
    'product':     ['buy', 'shop', 'sale', 'discount', 'price', 'review', 'unboxing',
                    'merch', 'merchandise', 'gear', 'clothing', 'limited edition'],
}

# ── Genre detection (music context) ───────────────────────────────────────────

GENRE_KEYWORDS: dict[str, list[str]] = {
    'hip-hop':    ['hip hop', 'hip-hop', 'rap', 'freestyle', 'bars', 'flow', 'verse', 'cypher'],
    'r&b':        ['r&b', 'rnb', 'soul', 'neo-soul', 'groove', 'smooth', 'motown'],
    'pop':        ['pop', 'radio', 'hit', 'catchy', 'mainstream', 'chart', 'billboard'],
    'electronic': ['electronic', 'edm', 'house', 'techno', 'rave', 'dj set', 'club', 'synth', 'dubstep'],
    'afrobeats':  ['afrobeats', 'afro', 'afropop', 'dancehall', 'latin', 'reggaeton', 'soca', 'amapiano'],
    'country':    ['country', 'folk', 'indie', 'acoustic', 'roots', 'bluegrass', 'songwriter'],
    'rock':       ['rock', 'punk', 'metal', 'guitar', 'band', 'alternative', 'grunge', 'hardcore'],
    'trap':       ['trap', 'drill', 'mumble', 'melodic trap', 'plugg', 'rage'],
    'jazz':       ['jazz', 'blues', 'swing', 'improvise', 'saxophone', 'trumpet', 'bebop'],
    'classical':  ['classical', 'orchestra', 'symphony', 'opera', 'piano', 'violin', 'concerto'],
}

# ── Tone detection (universal) ─────────────────────────────────────────────────

TONE_KEYWORDS: dict[str, list[str]] = {
    'hype':        ['fire', 'lit', 'hype', 'banger', 'slap', 'hard', 'heat', 'anthem',
                    'crazy', 'insane', 'epic', 'massive', 'banging', 'goes off'],
    'romantic':    ['love', 'romance', 'heart', 'baby', 'forever', 'kiss', 'beautiful',
                    'soulmate', 'passion', 'intimate', 'tender', 'miss you'],
    'motivational':['grind', 'hustle', 'rise', 'goals', 'success', 'win', 'champion',
                    'believe', 'mindset', 'ambition', 'level up', 'legacy', 'unstoppable'],
    'dark':        ['dark', 'pain', 'struggle', 'demons', 'shadow', 'cold', 'alone',
                    'betrayal', 'hurt', 'lost', 'broken', 'storm', 'war', 'street'],
    'uplifting':   ['positive', 'joy', 'happy', 'vibe', 'good', 'smile', 'sunshine',
                    'blessed', 'grateful', 'celebration', 'victory', 'energy', 'radiate'],
    'chill':       ['chill', 'relax', 'laid back', 'smooth', 'mellow', 'vibe', 'easy',
                    'lo-fi', 'sunset', 'weekend', 'drift', 'float'],
    'informative': ['learn', 'tips', 'guide', 'how to', 'explained', 'breakdown',
                    'analysis', 'review', 'report', 'insight', 'data', 'facts'],
    'promotional': ['new', 'out now', 'available', 'launch', 'release', 'drop', 'debut',
                    'exclusive', 'limited', 'pre-order', 'announcement', 'coming soon'],
}

# ── HTML parser ────────────────────────────────────────────────────────────────

class MetaExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title         = ''
        self.description   = ''
        self.keywords      = ''
        self.author        = ''
        self.published     = ''
        self.canonical     = ''
        self.og: dict      = {}
        self.twitter: dict = {}
        self._h_tags: list[str] = []       # h1, h2 text captured
        self._paragraphs: list[str] = []   # <p> text
        self._in_title    = False
        self._in_h        = False
        self._cur_h_level = 0
        self._in_p        = False
        self._in_body     = False
        self._in_script   = False
        self._in_style    = False
        self._cur_text    = ''

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'title':
            self._in_title = True
        elif tag == 'body':
            self._in_body = True
        elif tag in ('h1', 'h2', 'h3') and len(self._h_tags) < 6:
            self._in_h = True
            self._cur_h_level = int(tag[1])
            self._cur_text = ''
        elif tag == 'p' and len(self._paragraphs) < 8:
            self._in_p = True
            self._cur_text = ''
        elif tag == 'script':
            self._in_script = True
        elif tag == 'style':
            self._in_style = True
        elif tag == 'meta':
            prop    = (a.get('property') or a.get('name') or '').lower().strip()
            content = (a.get('content') or '').strip()
            if prop.startswith('og:'):
                self.og[prop[3:]] = content
            elif prop.startswith('twitter:'):
                self.twitter[prop[8:]] = content
            elif prop in ('description',):
                self.description = self.description or content
            elif prop == 'keywords':
                self.keywords = content
            elif prop in ('author', 'article:author', 'byl'):
                self.author = self.author or content
            elif prop in ('article:published_time', 'pubdate', 'date'):
                self.published = self.published or content
        elif tag == 'link':
            if a.get('rel') == 'canonical' and a.get('href'):
                self.canonical = a['href']
        elif tag == 'time' and a.get('datetime'):
            self.published = self.published or a['datetime']

    def handle_endtag(self, tag):
        if tag == 'title':
            self._in_title = False
        elif tag in ('h1', 'h2', 'h3') and self._in_h:
            t = self._cur_text.strip()
            if t and len(t) > 2:
                self._h_tags.append(t)
            self._in_h = False
            self._cur_text = ''
        elif tag == 'p' and self._in_p:
            t = self._cur_text.strip()
            if len(t) > 40:
                self._paragraphs.append(t)
            self._in_p = False
            self._cur_text = ''
        elif tag == 'script':
            self._in_script = False
        elif tag == 'style':
            self._in_style = False

    def handle_data(self, data):
        text = data.strip()
        if not text or self._in_script or self._in_style:
            return
        if self._in_title and not self.title:
            self.title = text
        if self._in_h:
            self._cur_text += ' ' + text
        if self._in_p:
            self._cur_text += ' ' + text

    @property
    def body_preview(self) -> str:
        parts = self._paragraphs[:4]
        return ' '.join(parts)[:600] if parts else ''

    @property
    def h1(self) -> str:
        return self._h_tags[0] if self._h_tags else ''

    @property
    def headings(self) -> list[str]:
        return self._h_tags[:4]


# ── Platform-specific parsers ──────────────────────────────────────────────────

def parse_spotify_path(url: str) -> dict:
    m = re.search(r'spotify\.com/(track|album|artist|playlist|episode)/([^/?]+)', url)
    if not m:
        return {}
    return {'spotify_type': m.group(1), 'spotify_id': m.group(2)}


def parse_youtube_id(url: str) -> Optional[str]:
    m = re.search(r'(?:v=|youtu\.be/)([A-Za-z0-9_-]{11})', url)
    return m.group(1) if m else None


def parse_domain(url: str) -> str:
    """Return the bare domain (e.g. 'soundcloud.com') from a full URL."""
    try:
        return urllib.parse.urlparse(url).netloc.lstrip('www.')
    except Exception:
        return ''


# ── Content classification helpers ────────────────────────────────────────────

def detect_content_category(text: str, platform_category: str) -> str:
    """Classify content into a general category. Returns the best match."""
    if platform_category and platform_category not in ('web',):
        return platform_category
    text_l = text.lower()
    scores = {
        cat: sum(1 for kw in kws if kw in text_l)
        for cat, kws in CONTENT_CATEGORY_KEYWORDS.items()
    }
    best, score = max(scores.items(), key=lambda x: x[1])
    return best if score > 0 else 'general'


def detect_genre(text: str) -> str:
    """Detect music genre from text. Returns 'default' if no match."""
    text_l = text.lower()
    scores = {g: sum(1 for kw in kws if kw in text_l) for g, kws in GENRE_KEYWORDS.items()}
    best, score = max(scores.items(), key=lambda x: x[1])
    return best if score > 0 else 'default'


def detect_tone(text: str) -> str:
    """Detect content tone. Returns 'default' if nothing clear."""
    text_l = text.lower()
    scores = {t: sum(1 for kw in kws if kw in text_l) for t, kws in TONE_KEYWORDS.items()}
    best, score = max(scores.items(), key=lambda x: x[1])
    return best if score > 0 else 'default'


def extract_keywords(text: str, meta_keywords: str = '', n: int = 8) -> list[str]:
    """Extract the most meaningful words as keywords."""
    # Use meta keywords if available
    if meta_keywords:
        kws = [k.strip() for k in re.split(r'[,;]', meta_keywords) if k.strip()]
        if kws:
            return kws[:n]
    # Fall back to frequency-based extraction (filter stop words)
    stop = {'the','a','an','and','or','but','in','on','at','to','for','of','with',
             'is','are','was','were','be','been','has','have','had','do','does','did',
             'this','that','these','those','it','its','i','we','you','he','she','they',
             'not','from','by','as','up','out','if','so','can','will','about'}
    words = re.findall(r'\b[a-z]{4,}\b', text.lower())
    freq: dict[str, int] = {}
    for w in words:
        if w not in stop:
            freq[w] = freq.get(w, 0) + 1
    top = sorted(freq, key=freq.get, reverse=True)[:n]
    return top


def infer_content_type(platform: str, platform_cat: str, og_type: str, url: str) -> str:
    """Infer what kind of content the URL points to."""
    # OG type wins if specific
    for key, ct in OG_TYPE_MAP.items():
        if key in og_type:
            return ct
    # Platform category signals
    if platform_cat == 'music':
        if 'track' in url or 'song' in url:
            return 'track'
        if 'album' in url:
            return 'album'
        if 'playlist' in url:
            return 'playlist'
        if 'artist' in url:
            return 'artist'
        return 'music'
    if platform_cat == 'video':
        return 'video'
    if platform_cat == 'social':
        if any(x in url for x in ['/p/', '/post', '/status', '/reel', '/shorts']):
            return 'post'
        return 'profile'
    if platform_cat == 'event':
        return 'event'
    if platform_cat in ('news', 'blog', 'music_news', 'culture', 'tech', 'business'):
        return 'article'
    if platform_cat == 'ecommerce':
        return 'product'
    if platform_cat == 'profile':
        return 'profile'
    return 'website'


def build_summary(title: str, description: str, artist: str, track: str,
                  h1: str, paragraphs: list[str], content_type: str) -> str:
    """Build a concise, readable summary for any content type."""
    if artist and track:
        return f'"{track}" by {artist}'
    if artist and content_type == 'artist':
        return f'Artist profile: {artist}'
    if title:
        # Clean common suffixes like "| Website Name" or "- Brand"
        clean = re.sub(r'\s*[\|\-–—]\s*.{1,40}$', '', title).strip()
        if len(clean) > 10:
            return clean
    if h1 and h1 != title:
        return h1[:120]
    if description:
        return description[:160]
    if paragraphs:
        return paragraphs[0][:160]
    return title[:120] if title else ''


# ── HTTP fetch ─────────────────────────────────────────────────────────────────

BROWSER_UA = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    'AppleWebKit/537.36 (KHTML, like Gecko) '
    'Chrome/124.0.0.0 Safari/537.36'
)


def fetch_html(url: str, timeout: int = 10) -> tuple[str, str]:
    """
    Fetch URL, return (html_text, final_url).
    Follows up to 3 redirects manually for control.
    Raises on failure.
    """
    req = urllib.request.Request(
        url,
        headers={
            'User-Agent':      BROWSER_UA,
            'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'identity',
            'DNT':             '1',
        }
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        final_url = resp.url
        raw = resp.read(200 * 1024)   # up to 200 KB
        ct = resp.headers.get('Content-Type', '')
        charset = 'utf-8'
        m = re.search(r'charset=([^\s;\"\']+)', ct, re.I)
        if m:
            charset = m.group(1).strip()
        try:
            html = raw.decode(charset, errors='replace')
        except (LookupError, UnicodeDecodeError):
            html = raw.decode('utf-8', errors='replace')
    return html, final_url


# ── Main analyzer ──────────────────────────────────────────────────────────────

def analyze_url(url: str) -> dict:
    # Normalize URL
    url = url.strip()
    if not url:
        return {'error': 'Empty URL'}
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url

    # ── Platform detection ────────────────────────────────────────────────────
    platform     = 'web'
    platform_cat = 'web'
    for pattern, pid, pcat in PLATFORMS:
        if re.search(pattern, url, re.I):
            platform     = pid
            platform_cat = pcat
            break

    domain = parse_domain(url)

    result: dict = {
        'url':            url,
        'domain':         domain,
        'platform':       platform,
        'platform_category': platform_cat,
        'is_music':       platform_cat in MUSIC_CATEGORIES,
        'title':          '',
        'description':    '',
        'author':         '',
        'published':      '',
        'og_image':       '',
        'canonical':      '',
        'keywords':       [],
        'headings':       [],
        'body_preview':   '',
        'summary':        '',
        'artist':         '',
        'track':          '',
        'album':          '',
        'content_type':   '',
        'content_category': '',
        'genre':          'default',
        'tone':           'default',
    }

    # Platform-specific pre-fetch metadata
    if platform == 'spotify':
        result.update(parse_spotify_path(url))
    if platform == 'youtube':
        vid = parse_youtube_id(url)
        if vid:
            result['youtube_id'] = vid

    # ── Fetch the page ────────────────────────────────────────────────────────
    try:
        html, final_url = fetch_html(url)
        if final_url and final_url != url:
            result['final_url'] = final_url
    except Exception as e:
        result['error'] = str(e)
        # Still return partial data — platform + url are useful even on fetch fail
        result['content_type']     = infer_content_type(platform, platform_cat, '', url)
        result['content_category'] = platform_cat if platform_cat != 'web' else 'general'
        result['summary']          = domain
        return result

    # ── Parse HTML ────────────────────────────────────────────────────────────
    parser = MetaExtractor()
    try:
        parser.feed(html)
    except Exception:
        pass

    # Assemble core fields
    title = (parser.og.get('title') or parser.twitter.get('title') or parser.title or '').strip()
    desc  = (parser.og.get('description') or parser.twitter.get('description') or
             parser.description or '').strip()
    image = (parser.og.get('image') or parser.twitter.get('image') or
             parser.twitter.get('image:src') or '').strip()
    og_type = parser.og.get('type', '').lower()

    result['title']       = title
    result['description'] = desc
    result['og_image']    = image
    result['canonical']   = parser.canonical or ''
    result['author']      = (parser.og.get('article:author') or parser.author or '').strip()
    result['published']   = (parser.og.get('article:published_time') or parser.published or '').strip()
    result['headings']    = parser.headings
    result['body_preview']= parser.body_preview[:400]

    # ── Artist / track extraction (music context) ─────────────────────────────
    # Pattern: "Artist - Track", "Track by Artist", "Artist · Track"
    if ' - ' in title:
        parts = title.split(' - ', 1)
        result['artist'] = parts[0].strip()
        result['track']  = parts[1].strip()
    elif ' · ' in title:
        parts = title.split(' · ', 1)
        result['artist'] = parts[0].strip()
        result['track']  = parts[1].strip()
    elif re.search(r'\bby\b', title, re.I):
        m = re.search(r'^(.+?)\s+by\s+(.+)$', title, re.I)
        if m:
            result['track']  = m.group(1).strip()
            result['artist'] = m.group(2).strip()
    # OG music namespace
    result['artist'] = result['artist'] or parser.og.get('music:musician', '').split('/')[-1].strip()
    result['album']  = parser.og.get('music:album', '').strip()

    # ── Content classification ─────────────────────────────────────────────────
    combined_text = f"{title} {desc} {parser.body_preview} {' '.join(parser.headings)}"

    content_type = infer_content_type(platform, platform_cat, og_type, url)
    result['content_type'] = content_type

    content_category = detect_content_category(combined_text, platform_cat)
    result['content_category'] = content_category

    # Genre detection: meaningful for music content; 'default' for others
    genre = detect_genre(combined_text)
    result['genre'] = genre

    # Tone detection: works for any content
    tone = detect_tone(combined_text)
    result['tone'] = tone

    # Keywords
    result['keywords'] = extract_keywords(combined_text, parser.keywords)

    # ── Summary ───────────────────────────────────────────────────────────────
    result['summary'] = build_summary(
        title, desc, result['artist'], result['track'],
        parser.h1, parser._paragraphs, content_type,
    )

    return result


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: urlAnalyzer.py <url>'}))
        sys.exit(1)

    out = analyze_url(sys.argv[1])
    print(json.dumps(out, ensure_ascii=False, indent=2))
