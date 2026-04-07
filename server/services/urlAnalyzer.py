#!/usr/bin/env python3
"""
URL Content Analyzer for Max Booster — Enhanced Edition
========================================================
Fetches any URL and extracts the maximum possible metadata, content signals,
and structured data for social content generation and AI enrichment.

Extraction pipeline (in priority order):
  1. Public oEmbed APIs  — YouTube, Spotify, SoundCloud, Vimeo, TikTok, Twitter/X, Twitch, Bandcamp
  2. JSON-LD / Schema.org — MusicRecording, MusicAlbum, Article, Event, Product, Person, Place, etc.
  3. Open Graph + Twitter Card meta tags
  4. Standard HTML meta tags (description, keywords, author, canonical, published)
  5. Page headings (h1–h3), paragraphs, inline lists
  6. Platform-specific page-data extraction (YouTube ytInitialData, Spotify embed, SoundCloud)
  7. URL-path heuristics (Spotify, Apple Music, YouTube path parsing)
  8. AI-lite signal detection: genre, tone, content category, keywords

All extraction is done with zero external API keys — only public, unauthenticated
endpoints and standard HTTP fetch.

Output: Single JSON object to stdout.
Usage:  python3 urlAnalyzer.py '<url>'
"""

import sys
import json
import re
import urllib.request
import urllib.parse
import urllib.error
import ssl
from html.parser import HTMLParser
from typing import Optional, Any

# ─────────────────────────────────────────────────────────────────────────────
# PLATFORM CATALOGUE
# ─────────────────────────────────────────────────────────────────────────────

PLATFORMS: list[tuple[str, str, str]] = [
    # Music streaming
    (r'(open\.spotify\.com|spotify\.com)',    'spotify',          'music'),
    (r'(youtube\.com|youtu\.be)',             'youtube',          'video'),
    (r'soundcloud\.com',                      'soundcloud',       'music'),
    (r'music\.apple\.com',                    'apple_music',      'music'),
    (r'tidal\.com',                           'tidal',            'music'),
    (r'deezer\.com',                          'deezer',           'music'),
    (r'\.bandcamp\.com',                      'bandcamp',         'music'),
    (r'audiomack\.com',                       'audiomack',        'music'),
    (r'music\.amazon\.com',                   'amazon_music',     'music'),
    (r'pandora\.com',                         'pandora',          'music'),
    (r'boomplay\.com',                        'boomplay',         'music'),
    (r'genius\.com',                          'genius',           'music'),
    (r'beatport\.com',                        'beatport',         'music'),
    (r'traxsource\.com',                      'traxsource',       'music'),
    (r'junodownload\.com',                    'juno',             'music'),
    (r'shazam\.com',                          'shazam',           'music'),
    (r'last\.fm',                             'lastfm',           'music'),
    (r'mixcloud\.com',                        'mixcloud',         'music'),
    (r'resso\.com',                           'resso',            'music'),
    # Music news / editorial
    (r'pitchfork\.com',                       'pitchfork',        'music_news'),
    (r'rollingstone\.com',                    'rolling_stone',    'music_news'),
    (r'billboard\.com',                       'billboard',        'music_news'),
    (r'nme\.com',                             'nme',              'music_news'),
    (r'xxlmag\.com',                          'xxl',              'music_news'),
    (r'allmusic\.com',                        'allmusic',         'music_news'),
    (r'stereogum\.com',                       'stereogum',        'music_news'),
    (r'consequence\.net',                     'consequence',      'music_news'),
    (r'hypebeast\.com',                       'hypebeast',        'culture'),
    (r'complex\.com',                         'complex',          'culture'),
    # Social platforms
    (r'instagram\.com',                       'instagram',        'social'),
    (r'tiktok\.com',                          'tiktok',           'social'),
    (r'(twitter\.com|x\.com)',                'twitter',          'social'),
    (r'facebook\.com',                        'facebook',         'social'),
    (r'threads\.net',                         'threads',          'social'),
    (r'linkedin\.com',                        'linkedin',         'social'),
    (r'pinterest\.com',                       'pinterest',        'social'),
    (r'snapchat\.com',                        'snapchat',         'social'),
    (r'reddit\.com',                          'reddit',           'social'),
    (r'tumblr\.com',                          'tumblr',           'social'),
    (r'mastodon\.',                           'mastodon',         'social'),
    (r'bluesky\.social|bsky\.app',            'bluesky',          'social'),
    # Video
    (r'vimeo\.com',                           'vimeo',            'video'),
    (r'twitch\.tv',                           'twitch',           'video'),
    (r'dailymotion\.com',                     'dailymotion',      'video'),
    (r'rumble\.com',                          'rumble',           'video'),
    (r'kick\.com',                            'kick',             'video'),
    # Podcasts
    (r'open\.spotify\.com/show',              'spotify_podcast',  'podcast'),
    (r'podcasts\.apple\.com',                 'apple_podcasts',   'podcast'),
    (r'anchor\.fm',                           'anchor',           'podcast'),
    (r'buzzsprout\.com',                      'buzzsprout',       'podcast'),
    # Music distribution / industry
    (r'distrokid\.com',                       'distrokid',        'music'),
    (r'tunecore\.com',                        'tunecore',         'music'),
    (r'cdbaby\.com',                          'cd_baby',          'music'),
    (r'landr\.com',                           'landr',            'music'),
    (r'submithub\.com',                       'submithub',        'music'),
    (r'airbit\.com',                          'airbit',           'music'),
    # News / editorial
    (r'nytimes\.com',                         'nytimes',          'news'),
    (r'bbc\.(co\.uk|com)',                    'bbc',              'news'),
    (r'cnn\.com',                             'cnn',              'news'),
    (r'theguardian\.com',                     'guardian',         'news'),
    (r'forbes\.com',                          'forbes',           'business'),
    (r'entrepreneur\.com',                    'entrepreneur',     'business'),
    (r'techcrunch\.com',                      'techcrunch',       'tech'),
    (r'medium\.com',                          'medium',           'blog'),
    (r'substack\.com',                        'substack',         'blog'),
    (r'wordpress\.com',                       'wordpress',        'blog'),
    # E-commerce
    (r'amazon\.(com|co\.uk)',                 'amazon',           'ecommerce'),
    (r'etsy\.com',                            'etsy',             'ecommerce'),
    (r'shopify\.com',                         'shopify',          'ecommerce'),
    (r'ebay\.(com|co\.uk)',                   'ebay',             'ecommerce'),
    # Events
    (r'eventbrite\.com',                      'eventbrite',       'event'),
    (r'ra\.co',                               'resident_advisor', 'event'),
    (r'songkick\.com',                        'songkick',         'event'),
    (r'stubhub\.com',                         'stubhub',          'event'),
    (r'dice\.fm',                             'dice',             'event'),
    (r'axs\.com',                             'axs',              'event'),
    (r'ticketmaster\.com',                    'ticketmaster',     'event'),
    # Link-in-bio / profiles
    (r'linktr\.ee',                           'linktree',         'profile'),
    (r'allmylinks\.com',                      'allmylinks',       'profile'),
    (r'beacons\.ai',                          'beacons',          'profile'),
    (r'campsite\.bio',                        'campsite',         'profile'),
    (r'bio\.link',                            'biolink',          'profile'),
    (r'solo\.to',                             'soloto',           'profile'),
    # Crowdfunding
    (r'kickstarter\.com',                     'kickstarter',      'crowdfunding'),
    (r'indiegogo\.com',                       'indiegogo',        'crowdfunding'),
    (r'patreon\.com',                         'patreon',          'crowdfunding'),
    (r'gofundme\.com',                        'gofundme',         'crowdfunding'),
]

MUSIC_CATEGORIES = {'music', 'music_news', 'podcast'}
MUSIC_PLATFORMS  = {p for p, _, c in PLATFORMS if c in MUSIC_CATEGORIES}

# oEmbed provider registry (endpoint, url_param_name)
OEMBED_PROVIDERS: list[tuple[str, str, str]] = [
    (r'(youtube\.com|youtu\.be)',   'https://www.youtube.com/oembed',            'url'),
    (r'vimeo\.com',                 'https://vimeo.com/api/oembed.json',         'url'),
    (r'soundcloud\.com',            'https://soundcloud.com/oembed',             'url'),
    (r'open\.spotify\.com',         'https://open.spotify.com/oembed',           'url'),
    (r'tiktok\.com',                'https://www.tiktok.com/oembed',             'url'),
    (r'(twitter\.com|x\.com)',      'https://publish.twitter.com/oembed',        'url'),
    (r'instagram\.com',             'https://graph.facebook.com/v18.0/instagram_oembed', 'url'),
    (r'twitch\.tv',                 'https://api.twitch.tv/helix/videos',        'url'),
    (r'\.bandcamp\.com',            'https://bandcamp.com/api/oembed',           'url'),
    (r'mixcloud\.com',              'https://www.mixcloud.com/oembed/',          'url'),
    (r'reddit\.com',                'https://www.reddit.com/oembed',             'url'),
    (r'dailymotion\.com',           'https://www.dailymotion.com/services/oembed','url'),
    (r'flickr\.com',                'https://www.flickr.com/services/oembed/',   'url'),
]

# Schema.org type → content_type mapping
SCHEMA_TYPE_MAP = {
    'MusicRecording':    'track',
    'MusicAlbum':        'album',
    'MusicPlaylist':     'playlist',
    'MusicGroup':        'artist',
    'Person':            'profile',
    'NewsArticle':       'article',
    'Article':           'article',
    'BlogPosting':       'article',
    'WebPage':           'website',
    'VideoObject':       'video',
    'Movie':             'video',
    'TVEpisode':         'video',
    'TVSeries':          'video',
    'Product':           'product',
    'Event':             'event',
    'MusicEvent':        'event',
    'SportsEvent':       'event',
    'PodcastEpisode':    'podcast_episode',
    'PodcastSeries':     'podcast',
    'RadioEpisode':      'radio',
    'Book':              'article',
    'Dataset':           'article',
    'ItemList':          'playlist',
}

OG_TYPE_MAP = {
    'music.song':          'track',
    'music.album':         'album',
    'music.playlist':      'playlist',
    'music.radio_station': 'radio',
    'article':             'article',
    'video.other':         'video',
    'video.movie':         'video',
    'video.tv_show':       'video',
    'video.episode':       'video',
    'product':             'product',
    'profile':             'profile',
    'website':             'website',
    'book':                'article',
    'event':               'event',
}

CONTENT_CATEGORY_KEYWORDS: dict[str, list[str]] = {
    'music':       ['music', 'song', 'track', 'album', 'artist', 'rapper', 'singer',
                    'producer', 'beat', 'mixtape', 'ep', 'single', 'stream', 'listen',
                    'spotify', 'soundcloud', 'bpm', 'lyrics', 'hip hop', 'rap', 'rnb',
                    'playlist', 'label', 'genre', 'released', 'debut', 'featuring'],
    'news':        ['breaking', 'report', 'exclusive', 'news', 'journalist', 'editor',
                    'press', 'media', 'headline', 'story', 'interview', 'publish', 'wire'],
    'tech':        ['technology', 'software', 'app', 'startup', 'developer', 'code',
                    'ai', 'artificial intelligence', 'launch', 'product', 'feature',
                    'saas', 'api', 'platform', 'cloud', 'machine learning'],
    'business':    ['business', 'brand', 'company', 'revenue', 'growth', 'strategy',
                    'entrepreneur', 'funding', 'investment', 'market', 'deal', 'ceo',
                    'acquisition', 'valuation', 'ipo', 'profit'],
    'culture':     ['culture', 'lifestyle', 'fashion', 'style', 'trend', 'street',
                    'hypebeast', 'sneaker', 'design', 'art', 'creative', 'hype'],
    'entertainment':['movie', 'film', 'tv show', 'series', 'celebrity', 'award',
                    'drama', 'comedy', 'streaming', 'netflix', 'hbo', 'disney'],
    'sports':      ['sports', 'game', 'match', 'championship', 'team', 'player',
                    'nba', 'nfl', 'soccer', 'football', 'basketball', 'athlete'],
    'event':       ['concert', 'festival', 'event', 'tour', 'show', 'performance',
                    'ticket', 'venue', 'live', 'vip', 'gig', 'club', 'lineup'],
    'product':     ['buy', 'shop', 'sale', 'discount', 'price', 'review', 'unboxing',
                    'merch', 'merchandise', 'gear', 'clothing', 'limited edition'],
    'podcast':     ['podcast', 'episode', 'listen', 'subscribe', 'host', 'guest',
                    'interview', 'conversation', 'show notes', 'transcript'],
}

GENRE_KEYWORDS: dict[str, list[str]] = {
    'hip-hop':    ['hip hop', 'hip-hop', 'rap', 'freestyle', 'bars', 'flow', 'verse',
                   'cypher', 'rhyme', 'emcee', 'mc', 'drill', 'trap', 'mumble'],
    'r&b':        ['r&b', 'rnb', 'soul', 'neo-soul', 'groove', 'smooth', 'motown',
                   'funk', 'gospel', 'soulful'],
    'pop':        ['pop', 'radio', 'hit', 'catchy', 'mainstream', 'chart', 'billboard',
                   'hook', 'chorus', 'bubblegum', 'synth-pop'],
    'electronic': ['electronic', 'edm', 'house', 'techno', 'rave', 'dj set', 'club',
                   'synth', 'dubstep', 'trance', 'ambient', 'bass', 'banger', 'drop'],
    'afrobeats':  ['afrobeats', 'afro', 'afropop', 'dancehall', 'reggaeton', 'soca',
                   'amapiano', 'highlife', 'naija', 'ghana', 'nigeria', 'south africa'],
    'country':    ['country', 'folk', 'indie', 'acoustic', 'roots', 'bluegrass',
                   'songwriter', 'americana', 'nashville', 'honky tonk'],
    'rock':       ['rock', 'punk', 'metal', 'guitar', 'band', 'alternative', 'grunge',
                   'hardcore', 'emo', 'indie rock', 'shoegaze', 'stoner'],
    'trap':       ['trap', 'plugg', 'rage', 'hi-hat', '808', 'adlibs', 'ad-libs'],
    'jazz':       ['jazz', 'blues', 'swing', 'improvise', 'saxophone', 'trumpet',
                   'bebop', 'fusion', 'smooth jazz', 'big band'],
    'classical':  ['classical', 'orchestra', 'symphony', 'opera', 'piano', 'violin',
                   'concerto', 'sonata', 'baroque', 'chamber', 'philharmonic'],
    'reggae':     ['reggae', 'ska', 'dub', 'rasta', 'jamaica', 'riddim', 'one love'],
    'latin':      ['latin', 'salsa', 'bachata', 'merengue', 'cumbia', 'regional mexican',
                   'corridos', 'tumbados', 'urbano', 'reggaeton'],
}

TONE_KEYWORDS: dict[str, list[str]] = {
    'hype':        ['fire', 'lit', 'hype', 'banger', 'slap', 'hard', 'heat', 'anthem',
                    'crazy', 'insane', 'epic', 'massive', 'banging', 'goes off'],
    'romantic':    ['love', 'romance', 'heart', 'baby', 'forever', 'kiss', 'beautiful',
                    'soulmate', 'passion', 'intimate', 'tender', 'miss you', 'feelings'],
    'motivational':['grind', 'hustle', 'rise', 'goals', 'success', 'win', 'champion',
                    'believe', 'mindset', 'ambition', 'level up', 'legacy', 'unstoppable',
                    'career', 'achieve', 'grow', 'build', 'boost', 'level', 'power',
                    'professional', 'artist', 'creator', 'producer'],
    'dark':        ['dark', 'pain', 'struggle', 'demons', 'shadow', 'cold', 'alone',
                    'betrayal', 'hurt', 'lost', 'broken', 'storm', 'war', 'street'],
    'uplifting':   ['positive', 'joy', 'happy', 'vibe', 'good', 'smile', 'sunshine',
                    'blessed', 'grateful', 'celebration', 'victory', 'energy', 'radiate'],
    'chill':       ['chill', 'relax', 'laid back', 'smooth', 'mellow', 'vibe', 'easy',
                    'lo-fi', 'sunset', 'weekend', 'drift', 'float', 'lofi'],
    'informative': ['learn', 'tips', 'guide', 'how to', 'explained', 'breakdown',
                    'analysis', 'review', 'report', 'insight', 'data', 'facts',
                    'analytics', 'management', 'distribution', 'licensing', 'royalt',
                    'streaming', 'marketplace', 'automation', 'coaching'],
    'promotional': ['new', 'out now', 'available', 'launch', 'release', 'drop', 'debut',
                    'exclusive', 'limited', 'pre-order', 'announcement', 'coming soon',
                    'all-in-one', 'platform', 'powered', 'features', 'suite', 'tools',
                    'ai-powered', 'global', 'professional', 'powered by', 'sign up',
                    'get started', 'free trial', 'join', 'try', 'start', 'discover',
                    'introducing', 'now live', 'deploy', 'built for', 'designed for'],
}

# ─────────────────────────────────────────────────────────────────────────────
# HTML PARSER (collects meta, OG, Twitter Card, JSON-LD, headings, paragraphs)
# ─────────────────────────────────────────────────────────────────────────────

class MetaExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title         = ''
        self.description   = ''
        self.keywords      = ''
        self.author        = ''
        self.published     = ''
        self.modified      = ''
        self.canonical     = ''
        self.language      = ''
        self.og: dict      = {}
        self.twitter: dict = {}
        self.json_ld_blocks: list[str] = []  # raw JSON-LD text
        self._h_tags: list[tuple[int, str]] = []  # (level, text)
        self._paragraphs: list[str] = []
        self._list_items: list[str] = []
        self._in_title    = False
        self._in_h        = False
        self._cur_h_level = 0
        self._in_p        = False
        self._in_li       = False
        self._in_script   = False
        self._script_type = ''
        self._in_style    = False
        self._cur_text    = ''

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'html':
            self.language = self.language or a.get('lang', '')[:5]
        elif tag == 'title':
            self._in_title = True
        elif tag == 'body':
            pass
        elif tag in ('h1', 'h2', 'h3') and len(self._h_tags) < 10:
            self._in_h = True
            self._cur_h_level = int(tag[1])
            self._cur_text = ''
        elif tag == 'p' and len(self._paragraphs) < 12:
            self._in_p = True
            self._cur_text = ''
        elif tag == 'li' and len(self._list_items) < 20:
            self._in_li = True
            self._cur_text = ''
        elif tag == 'script':
            st = a.get('type', '').lower()
            self._script_type = st
            self._in_script = True
            if 'ld+json' in st:
                self._cur_text = ''
        elif tag == 'style':
            self._in_style = True
        elif tag == 'meta':
            prop    = (a.get('property') or a.get('name') or a.get('itemprop') or '').lower().strip()
            content = (a.get('content') or '').strip()
            if not content:
                return
            if prop.startswith('og:'):
                self.og[prop[3:]] = content
            elif prop.startswith('twitter:'):
                self.twitter[prop[8:]] = content
            elif prop in ('description', 'og:description'):
                self.description = self.description or content
            elif prop == 'keywords':
                self.keywords = content
            elif prop in ('author', 'article:author', 'byl', 'creator', 'dc.creator'):
                self.author = self.author or content
            elif prop in ('article:published_time', 'pubdate', 'date', 'dc.date',
                          'datePublished', 'published_date', 'publish_date', 'og:pubdate'):
                self.published = self.published or content
            elif prop in ('article:modified_time', 'last-modified', 'dateModified'):
                self.modified = self.modified or content
            elif prop in ('robots',):
                pass  # skip
        elif tag == 'link':
            rel  = a.get('rel', '')
            href = a.get('href', '')
            if rel == 'canonical' and href:
                self.canonical = href
            elif rel == 'alternate' and a.get('hreflang'):
                self.language = self.language or a.get('hreflang', '')[:5]
        elif tag == 'time' and a.get('datetime'):
            self.published = self.published or a['datetime']

    def handle_endtag(self, tag):
        if tag == 'title':
            self._in_title = False
        elif tag in ('h1', 'h2', 'h3') and self._in_h:
            t = self._cur_text.strip()
            if t and len(t) > 2:
                self._h_tags.append((self._cur_h_level, t))
            self._in_h = False
            self._cur_text = ''
        elif tag == 'p' and self._in_p:
            t = self._cur_text.strip()
            if len(t) > 30:
                self._paragraphs.append(t)
            self._in_p = False
            self._cur_text = ''
        elif tag == 'li' and self._in_li:
            t = self._cur_text.strip()
            if len(t) > 5:
                self._list_items.append(t)
            self._in_li = False
            self._cur_text = ''
        elif tag == 'script':
            if 'ld+json' in self._script_type and self._cur_text.strip():
                self.json_ld_blocks.append(self._cur_text.strip())
            self._in_script = False
            self._script_type = ''
            self._cur_text = ''
        elif tag == 'style':
            self._in_style = False

    def handle_data(self, data):
        text = data.strip()
        if not text:
            return
        if self._in_script:
            if 'ld+json' in self._script_type:
                self._cur_text += data
            return
        if self._in_style:
            return
        if self._in_title and not self.title:
            self.title = text
        if self._in_h:
            self._cur_text += ' ' + text
        if self._in_p:
            self._cur_text += ' ' + text
        if self._in_li:
            self._cur_text += ' ' + text

    @property
    def body_preview(self) -> str:
        parts = self._paragraphs[:5]
        return ' '.join(parts)[:800] if parts else ''

    @property
    def h1(self) -> str:
        for level, text in self._h_tags:
            if level == 1:
                return text
        return self._h_tags[0][1] if self._h_tags else ''

    @property
    def headings(self) -> list[str]:
        return [t for _, t in self._h_tags[:6]]


# ─────────────────────────────────────────────────────────────────────────────
# HTTP HELPERS
# ─────────────────────────────────────────────────────────────────────────────

BROWSER_UA = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    'AppleWebKit/537.36 (KHTML, like Gecko) '
    'Chrome/124.0.0.0 Safari/537.36'
)

def _make_ssl_context(verify: bool = True) -> ssl.SSLContext:
    """Create an SSL context, optionally with certificate verification disabled."""
    if verify:
        ctx = ssl.create_default_context()
    else:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
    return ctx


def fetch_html(url: str, timeout: int = 20) -> tuple[str, str]:
    """Fetch URL, return (html_text, final_url). Reads up to 400 KB.
    Tries with SSL verification first; falls back to no verification if it fails.
    Also retries with a simplified Accept-Encoding to handle sites that block identity encoding.
    """
    headers = {
        'User-Agent':      BROWSER_UA,
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
        'DNT':             '1',
        'Cache-Control':   'no-cache',
        'Connection':      'keep-alive',
    }

    last_exc: Exception = Exception('Unknown fetch error')

    for verify_ssl in (True, False):
        ctx = _make_ssl_context(verify_ssl)
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
                final_url = resp.url
                raw = resp.read(400 * 1024)
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
        except ssl.SSLError as e:
            last_exc = e
            if verify_ssl:
                continue  # retry without SSL verification
            raise
        except urllib.error.HTTPError as e:
            if e.code in (403, 401, 429):
                raise Exception(f'HTTP {e.code}: site blocked request')
            raise
        except Exception as e:
            last_exc = e
            if verify_ssl:
                continue  # retry without SSL verification
            raise

    raise last_exc


def fetch_json(url: str, timeout: int = 8) -> Optional[dict]:
    """Fetch a JSON URL, return parsed dict or None on any failure."""
    for verify_ssl in (True, False):
        try:
            ctx = _make_ssl_context(verify_ssl)
            req = urllib.request.Request(
                url,
                headers={
                    'User-Agent': BROWSER_UA,
                    'Accept':     'application/json, text/json, */*',
                }
            )
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
                raw = resp.read(100 * 1024)
                return json.loads(raw.decode('utf-8', errors='replace'))
        except ssl.SSLError:
            if verify_ssl:
                continue
            return None
        except Exception:
            return None
    return None


# ─────────────────────────────────────────────────────────────────────────────
# oEMBED FETCHER
# ─────────────────────────────────────────────────────────────────────────────

def fetch_oembed(url: str) -> Optional[dict]:
    """
    Try all registered oEmbed providers. Returns the first successful response,
    or None if no provider matches or all fail.
    """
    for pattern, endpoint, param in OEMBED_PROVIDERS:
        if re.search(pattern, url, re.I):
            qs = urllib.parse.urlencode({param: url, 'format': 'json', 'maxwidth': 640})
            full = f"{endpoint}?{qs}"
            data = fetch_json(full)
            if data and isinstance(data, dict) and not data.get('error'):
                return data
    return None


# ─────────────────────────────────────────────────────────────────────────────
# JSON-LD / SCHEMA.ORG EXTRACTOR
# ─────────────────────────────────────────────────────────────────────────────

def _flatten_ld(node: Any, depth: int = 0) -> list[dict]:
    """Recursively flatten JSON-LD graph nodes into a flat list of dicts."""
    if depth > 4:
        return []
    if isinstance(node, dict):
        return [node] + _flatten_ld(node.get('@graph', []), depth + 1)
    if isinstance(node, list):
        out = []
        for item in node:
            out.extend(_flatten_ld(item, depth + 1))
        return out
    return []


def _ld_str(val: Any) -> str:
    """Extract string from JSON-LD value (may be string, dict with @value, or list)."""
    if isinstance(val, str):
        return val.strip()
    if isinstance(val, dict):
        return str(val.get('@value') or val.get('name') or val.get('url') or '').strip()
    if isinstance(val, list) and val:
        return _ld_str(val[0])
    return ''


def _ld_name(val: Any) -> str:
    """Extract a human-readable name from a JSON-LD entity."""
    if isinstance(val, str):
        return val.strip()
    if isinstance(val, dict):
        return str(val.get('name') or val.get('@value') or '').strip()
    if isinstance(val, list) and val:
        return _ld_name(val[0])
    return ''


def parse_json_ld(blocks: list[str]) -> dict:
    """
    Parse all JSON-LD blocks from the page and extract structured data.
    Returns a flat dict of extracted fields.
    """
    out: dict = {}
    nodes: list[dict] = []
    for raw in blocks:
        try:
            parsed = json.loads(raw)
        except Exception:
            continue
        nodes.extend(_flatten_ld(parsed))

    # Priority: music > event > article > video > product > profile
    type_priority = [
        'MusicRecording', 'MusicAlbum', 'MusicPlaylist', 'MusicGroup',
        'PodcastEpisode', 'PodcastSeries', 'RadioEpisode',
        'MusicEvent', 'Event', 'SportsEvent',
        'NewsArticle', 'Article', 'BlogPosting',
        'VideoObject', 'Movie', 'TVEpisode', 'TVSeries',
        'Product', 'Person', 'Organization', 'WebPage', 'ItemList',
    ]

    def get_type(node: dict) -> str:
        t = node.get('@type', '')
        if isinstance(t, list):
            t = t[0] if t else ''
        return str(t).split('/')[-1]

    # Sort nodes by type priority
    def sort_key(n: dict) -> int:
        t = get_type(n)
        try:
            return type_priority.index(t)
        except ValueError:
            return len(type_priority)

    nodes.sort(key=sort_key)

    for node in nodes:
        ntype = get_type(node)
        if not ntype:
            continue

        mapped = SCHEMA_TYPE_MAP.get(ntype)
        if mapped and not out.get('content_type'):
            out['content_type'] = mapped

        name = _ld_str(node.get('name'))
        if name and not out.get('title'):
            out['title'] = name

        desc = _ld_str(node.get('description'))
        if desc and not out.get('description'):
            out['description'] = desc

        image = node.get('image')
        if image and not out.get('og_image'):
            if isinstance(image, str):
                out['og_image'] = image
            elif isinstance(image, dict):
                out['og_image'] = image.get('url', '')
            elif isinstance(image, list) and image:
                img0 = image[0]
                out['og_image'] = img0 if isinstance(img0, str) else img0.get('url', '')

        # ── Music-specific ─────────────────────────────────────────────────
        if ntype in ('MusicRecording',):
            by_artist = node.get('byArtist')
            artist = _ld_name(by_artist)
            if artist and not out.get('artist'):
                out['artist'] = artist
            if name and not out.get('track'):
                out['track'] = name
            in_album = node.get('inAlbum')
            if in_album and not out.get('album'):
                out['album'] = _ld_name(in_album)
            duration = _ld_str(node.get('duration'))
            if duration and not out.get('duration'):
                out['duration'] = _parse_iso_duration(duration)
            genre = _ld_str(node.get('genre'))
            if genre and not out.get('ld_genre'):
                out['ld_genre'] = genre.lower()
            isrc = _ld_str(node.get('isrcCode') or node.get('isrc'))
            if isrc:
                out['isrc'] = isrc
            date_pub = _ld_str(node.get('datePublished'))
            if date_pub and not out.get('release_date'):
                out['release_date'] = date_pub[:10]
            label_node = node.get('recordingOf', {})
            if isinstance(label_node, dict):
                label_by = label_node.get('byArtist')
                if label_by and not out.get('artist'):
                    out['artist'] = _ld_name(label_by)

        if ntype == 'MusicAlbum':
            by_artist = node.get('byArtist')
            if by_artist and not out.get('artist'):
                out['artist'] = _ld_name(by_artist)
            if name and not out.get('album'):
                out['album'] = name
            date_pub = _ld_str(node.get('datePublished'))
            if date_pub and not out.get('release_date'):
                out['release_date'] = date_pub[:10]
            label = _ld_str(node.get('recordLabel') or node.get('productionCompany'))
            if label and not out.get('label'):
                out['label'] = label
            tracks = node.get('tracks', node.get('track', []))
            if isinstance(tracks, list) and tracks and not out.get('tracklist'):
                out['tracklist'] = [_ld_name(t) for t in tracks if _ld_name(t)][:20]
                out['track_count'] = len(tracks)
            genre = _ld_str(node.get('genre'))
            if genre and not out.get('ld_genre'):
                out['ld_genre'] = genre.lower()

        if ntype == 'MusicPlaylist':
            by = node.get('author') or node.get('creator')
            if by and not out.get('author'):
                out['author'] = _ld_name(by)
            tracks = node.get('tracks', node.get('track', []))
            if isinstance(tracks, list) and not out.get('track_count'):
                out['track_count'] = len(tracks)

        if ntype in ('MusicGroup',):
            if name and not out.get('artist'):
                out['artist'] = name
            members = node.get('member', [])
            if isinstance(members, list) and not out.get('members'):
                out['members'] = [_ld_name(m) for m in members if _ld_name(m)][:10]
            genre = _ld_str(node.get('genre'))
            if genre and not out.get('ld_genre'):
                out['ld_genre'] = genre.lower()

        # ── Video-specific ─────────────────────────────────────────────────
        if ntype in ('VideoObject', 'Movie', 'TVEpisode', 'TVSeries'):
            duration = _ld_str(node.get('duration'))
            if duration and not out.get('duration'):
                out['duration'] = _parse_iso_duration(duration)
            upload_date = _ld_str(node.get('uploadDate') or node.get('datePublished'))
            if upload_date and not out.get('published'):
                out['published'] = upload_date[:10]
            views = node.get('interactionStatistic')
            if isinstance(views, list):
                for stat in views:
                    if isinstance(stat, dict):
                        itype = stat.get('interactionType', {})
                        itype_str = itype.get('@type', '') if isinstance(itype, dict) else str(itype)
                        if 'Watch' in itype_str and not out.get('view_count'):
                            out['view_count'] = _safe_int(stat.get('userInteractionCount'))
                        elif 'Like' in itype_str and not out.get('like_count'):
                            out['like_count'] = _safe_int(stat.get('userInteractionCount'))
            elif isinstance(views, dict):
                out['view_count'] = _safe_int(views.get('userInteractionCount'))
            director = node.get('director')
            if director and not out.get('author'):
                out['author'] = _ld_name(director)
            embed = _ld_str(node.get('embedUrl'))
            if embed and not out.get('embed_url'):
                out['embed_url'] = embed
            thumb = node.get('thumbnailUrl')
            if thumb and not out.get('thumbnail_url'):
                out['thumbnail_url'] = thumb if isinstance(thumb, str) else thumb[0] if isinstance(thumb, list) else ''
            keywords = _ld_str(node.get('keywords'))
            if keywords and not out.get('tags'):
                out['tags'] = [k.strip() for k in re.split(r'[,;]', keywords) if k.strip()][:15]

        # ── Event-specific ─────────────────────────────────────────────────
        if ntype in ('Event', 'MusicEvent', 'SportsEvent'):
            start = _ld_str(node.get('startDate'))
            if start and not out.get('event_date'):
                out['event_date'] = start
            end = _ld_str(node.get('endDate'))
            if end and not out.get('event_end_date'):
                out['event_end_date'] = end
            location = node.get('location')
            if location and not out.get('event_location'):
                if isinstance(location, str):
                    out['event_location'] = location
                elif isinstance(location, dict):
                    loc_name = _ld_name(location)
                    address = location.get('address', {})
                    if isinstance(address, dict):
                        parts = [address.get('streetAddress', ''), address.get('addressLocality', ''),
                                 address.get('addressRegion', ''), address.get('addressCountry', '')]
                        addr_str = ', '.join(p for p in parts if p)
                        out['event_location'] = f"{loc_name}: {addr_str}" if addr_str else loc_name
                    else:
                        out['event_location'] = loc_name
            performers = node.get('performer', node.get('performers', []))
            if performers and not out.get('performers'):
                if isinstance(performers, (dict, str)):
                    performers = [performers]
                out['performers'] = [_ld_name(p) for p in performers if _ld_name(p)][:10]
            organizer = node.get('organizer')
            if organizer and not out.get('organizer'):
                out['organizer'] = _ld_name(organizer)
            offers = node.get('offers')
            if offers and not out.get('price'):
                if isinstance(offers, dict):
                    out['price'] = _ld_str(offers.get('price'))
                    out['currency'] = _ld_str(offers.get('priceCurrency'))
                elif isinstance(offers, list) and offers:
                    out['price'] = _ld_str(offers[0].get('price'))
                    out['currency'] = _ld_str(offers[0].get('priceCurrency'))

        # ── Article-specific ───────────────────────────────────────────────
        if ntype in ('Article', 'NewsArticle', 'BlogPosting'):
            author = node.get('author')
            if author and not out.get('author'):
                if isinstance(author, list) and author:
                    out['author'] = _ld_name(author[0])
                else:
                    out['author'] = _ld_name(author)
            date_pub = _ld_str(node.get('datePublished'))
            if date_pub and not out.get('published'):
                out['published'] = date_pub[:10]
            date_mod = _ld_str(node.get('dateModified'))
            if date_mod and not out.get('modified'):
                out['modified'] = date_mod[:10]
            section = _ld_str(node.get('articleSection'))
            if section and not out.get('section'):
                out['section'] = section
            word_count = _safe_int(node.get('wordCount'))
            if word_count and not out.get('word_count'):
                out['word_count'] = word_count
                out['reading_time_minutes'] = max(1, round(word_count / 200))
            keywords = _ld_str(node.get('keywords'))
            if keywords and not out.get('tags'):
                out['tags'] = [k.strip() for k in re.split(r'[,;]', keywords) if k.strip()][:15]

        # ── Product-specific ───────────────────────────────────────────────
        if ntype == 'Product':
            offers = node.get('offers')
            if offers and not out.get('price'):
                o = offers[0] if isinstance(offers, list) else offers
                if isinstance(o, dict):
                    out['price'] = _ld_str(o.get('price'))
                    out['currency'] = _ld_str(o.get('priceCurrency', 'USD'))
            brand = node.get('brand')
            if brand and not out.get('brand'):
                out['brand'] = _ld_name(brand)
            agg_rating = node.get('aggregateRating')
            if agg_rating and isinstance(agg_rating, dict):
                out['rating'] = _ld_str(agg_rating.get('ratingValue'))
                out['review_count'] = _safe_int(agg_rating.get('reviewCount') or agg_rating.get('ratingCount'))
            sku = _ld_str(node.get('sku') or node.get('gtin'))
            if sku and not out.get('sku'):
                out['sku'] = sku

        # ── Person / Profile ───────────────────────────────────────────────
        if ntype == 'Person':
            if name and not out.get('author'):
                out['author'] = name
            job = _ld_str(node.get('jobTitle'))
            if job and not out.get('job_title'):
                out['job_title'] = job
            same_as = node.get('sameAs', [])
            if isinstance(same_as, list) and not out.get('social_links'):
                out['social_links'] = [s for s in same_as if isinstance(s, str)][:10]
            followers = node.get('numberOfFollowers') or node.get('interactionStatistic')
            if isinstance(followers, int) and not out.get('follower_count'):
                out['follower_count'] = followers

        # ── Podcast-specific ───────────────────────────────────────────────
        if ntype in ('PodcastEpisode', 'RadioEpisode'):
            duration = _ld_str(node.get('duration') or node.get('timeRequired'))
            if duration and not out.get('duration'):
                out['duration'] = _parse_iso_duration(duration)
            ep_num = _ld_str(node.get('episodeNumber'))
            if ep_num and not out.get('episode_number'):
                out['episode_number'] = ep_num
            series = node.get('partOfSeries') or node.get('associatedMedia')
            if series and not out.get('series_name'):
                out['series_name'] = _ld_name(series)

    return out


def _safe_int(v: Any) -> Optional[int]:
    try:
        return int(str(v).replace(',', ''))
    except Exception:
        return None


def _parse_iso_duration(d: str) -> str:
    """Convert ISO 8601 duration (PT3M45S) to human-readable (3:45) or return as-is."""
    if not d or not d.startswith('PT'):
        return d
    m = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', d)
    if not m:
        return d
    hours, minutes, seconds = m.group(1), m.group(2), m.group(3)
    h, mi, s = int(hours or 0), int(minutes or 0), int(seconds or 0)
    if h:
        return f"{h}:{mi:02d}:{s:02d}"
    return f"{mi}:{s:02d}"


# ─────────────────────────────────────────────────────────────────────────────
# PLATFORM-SPECIFIC PARSERS
# ─────────────────────────────────────────────────────────────────────────────

def parse_spotify_path(url: str) -> dict:
    out: dict = {}
    m = re.search(r'spotify\.com/(track|album|artist|playlist|episode|show)/([^/?#]+)', url)
    if m:
        out['spotify_type'] = m.group(1)
        out['spotify_id']   = m.group(2)
    return out


def parse_youtube_id(url: str) -> Optional[str]:
    m = re.search(r'(?:v=|youtu\.be/|embed/|shorts/)([A-Za-z0-9_-]{11})', url)
    return m.group(1) if m else None


def parse_youtube_page_data(html: str) -> dict:
    """
    Extract ytInitialData embedded in YouTube page source.
    Gets: title, channel, description, view count, like count, tags, upload date, duration.
    """
    out: dict = {}
    # ytInitialData contains the bulk of structured video data
    m = re.search(r'var ytInitialData\s*=\s*(\{.{100,}?\});', html, re.S)
    if not m:
        # fallback: the data might be embedded in a script differently
        m = re.search(r'"videoDetails"\s*:\s*(\{[^{}]+(?:\{[^{}]*\}[^{}]*)*\})', html)
        if m:
            try:
                vd = json.loads(m.group(1))
                out['title']        = vd.get('title', '')
                out['author']       = vd.get('author', '')
                out['view_count']   = _safe_int(vd.get('viewCount'))
                out['duration']     = _format_seconds(vd.get('lengthSeconds'))
                out['description']  = vd.get('shortDescription', '')[:500]
                kws = vd.get('keywords', [])
                if kws:
                    out['tags'] = kws[:20]
            except Exception:
                pass
        return out
    try:
        yd = json.loads(m.group(1))
    except Exception:
        return out

    # Extract from videoDetails (most reliable path)
    vd_str = re.search(r'"videoDetails"\s*:\s*(\{[^{}]+(?:\{[^{}]*\}[^{}]*)*\})', m.group(1))
    if vd_str:
        try:
            vd = json.loads(vd_str.group(1))
            if not out.get('title'):
                out['title'] = vd.get('title', '')
            if not out.get('author'):
                out['author'] = vd.get('author', '')
            if not out.get('view_count'):
                out['view_count'] = _safe_int(vd.get('viewCount'))
            if not out.get('duration'):
                out['duration'] = _format_seconds(vd.get('lengthSeconds'))
            if not out.get('description'):
                out['description'] = vd.get('shortDescription', '')[:600]
            kws = vd.get('keywords', [])
            if kws and not out.get('tags'):
                out['tags'] = kws[:20]
        except Exception:
            pass

    # Try to get like count from engagementPanels / buttons
    like_m = re.search(r'"defaultText"\s*:\s*\{"simpleText"\s*:\s*"([\d,KMB\.]+)"\}', m.group(1))
    if like_m and not out.get('like_count'):
        count_str = like_m.group(1).replace(',', '')
        if re.match(r'^\d+$', count_str):
            out['like_count'] = int(count_str)

    # Try subscriber count for channel pages
    sub_m = re.search(r'"subscriberCountText"\s*:\s*\{"simpleText"\s*:\s*"([^"]+)"\}', m.group(1))
    if sub_m and not out.get('subscriber_count'):
        out['subscriber_count'] = sub_m.group(1)

    return out


def _format_seconds(seconds: Any) -> str:
    if seconds is None:
        return ''
    try:
        s = int(seconds)
        h, rem = divmod(s, 3600)
        m, sec = divmod(rem, 60)
        if h:
            return f"{h}:{m:02d}:{sec:02d}"
        return f"{m}:{sec:02d}"
    except Exception:
        return str(seconds)


def parse_soundcloud_page_data(html: str) -> dict:
    """Extract structured data from SoundCloud pages."""
    out: dict = {}
    # SoundCloud injects hydration JSON
    m = re.search(r'window\.__sc_hydration\s*=\s*(\[.+?\]);\s*', html, re.S)
    if m:
        try:
            items = json.loads(m.group(1))
            for item in items:
                d = item.get('data', {})
                if item.get('hydratable') == 'sound' and d:
                    out['title']       = d.get('title', '')
                    out['author']      = d.get('user', {}).get('username', '')
                    out['description'] = d.get('description', '')[:500]
                    out['play_count']  = d.get('playback_count')
                    out['like_count']  = d.get('likes_count')
                    out['comment_count'] = d.get('comment_count')
                    out['duration']    = _format_seconds(d.get('duration', 0) / 1000) if d.get('duration') else ''
                    genre = d.get('genre', '')
                    if genre:
                        out['ld_genre'] = genre.lower()
                    tags = d.get('tag_list', '')
                    if tags:
                        out['tags'] = [t.strip().strip('"') for t in tags.split() if t.strip()][:15]
                    out['release_date'] = (d.get('release_date') or d.get('created_at') or '')[:10]
                    out['stream_url']   = d.get('stream_url', '')
                    out['thumbnail_url'] = d.get('artwork_url', '').replace('-large', '-t500x500')
                    out['label']        = d.get('label_name', '')
                    break
                elif item.get('hydratable') == 'user' and d:
                    if not out.get('author'):
                        out['author']           = d.get('username', '')
                        out['subscriber_count']  = d.get('followers_count')
                        out['track_count']       = d.get('track_count')
                        out['playlist_count']    = d.get('playlist_count')
                        out['thumbnail_url']     = d.get('avatar_url', '').replace('-large', '-t500x500')
        except Exception:
            pass
    return out


def parse_apple_music_path(url: str) -> dict:
    """Extract content type and IDs from Apple Music URLs."""
    out: dict = {}
    m = re.search(r'music\.apple\.com/([a-z]{2})/([^/]+)/([^/?#]+)(?:/([^/?#]+))?', url)
    if not m:
        return out
    country, content_type, slug, item_id = m.groups()
    ct_map = {'album': 'album', 'song': 'track', 'artist': 'artist',
              'playlist': 'playlist', 'music-video': 'video', 'station': 'radio'}
    out['apple_music_type'] = content_type
    if item_id:
        out['apple_music_id'] = item_id
    if content_type in ct_map:
        out['content_type'] = ct_map[content_type]
    # Slug often contains "artist-name-track-name"
    parts = slug.replace('-', ' ').title()
    out['title_hint'] = parts
    return out


def parse_bandcamp_page_data(html: str) -> dict:
    """Extract Bandcamp's embedded data-tralbum JSON."""
    out: dict = {}
    m = re.search(r'data-tralbum\s*=\s*"([^"]+)"', html)
    if not m:
        m = re.search(r'TralbumData\s*=\s*(\{.+?\});\s*', html, re.S)
    if m:
        try:
            raw = m.group(1)
            # unescape HTML entities from attribute
            raw = raw.replace('&quot;', '"').replace('&amp;', '&').replace('&#39;', "'")
            data = json.loads(raw)
            out['artist'] = data.get('artist', '')
            out['album']  = data.get('album_title', '')
            tracks = data.get('trackinfo', [])
            if tracks and not out.get('tracklist'):
                out['tracklist'] = [t.get('title', '') for t in tracks if t.get('title')][:20]
                out['track_count'] = len(tracks)
            tags = data.get('tags', [])
            if tags:
                out['tags'] = [t.get('name', '') for t in tags if t.get('name')][:15]
            out['release_date'] = data.get('album_release_date', data.get('current', {}).get('release_date', ''))[:10]
        except Exception:
            pass
    return out


def parse_domain(url: str) -> str:
    try:
        return urllib.parse.urlparse(url).netloc.lstrip('www.')
    except Exception:
        return ''


# ─────────────────────────────────────────────────────────────────────────────
# CONTENT CLASSIFICATION
# ─────────────────────────────────────────────────────────────────────────────

def detect_content_category(text: str, platform_category: str) -> str:
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
    text_l = text.lower()
    scores = {g: sum(1 for kw in kws if kw in text_l) for g, kws in GENRE_KEYWORDS.items()}
    best, score = max(scores.items(), key=lambda x: x[1])
    return best if score > 0 else 'default'


def detect_tone(text: str) -> str:
    text_l = text.lower()
    scores = {t: sum(1 for kw in kws if kw in text_l) for t, kws in TONE_KEYWORDS.items()}
    best, score = max(scores.items(), key=lambda x: x[1])
    return best if score > 0 else 'default'


def extract_keywords(text: str, meta_keywords: str = '', n: int = 12) -> list[str]:
    if meta_keywords:
        kws = [k.strip() for k in re.split(r'[,;]', meta_keywords) if k.strip()]
        if kws:
            return kws[:n]
    stop = {'the','a','an','and','or','but','in','on','at','to','for','of','with',
             'is','are','was','were','be','been','has','have','had','do','does','did',
             'this','that','these','those','it','its','i','we','you','he','she','they',
             'not','from','by','as','up','out','if','so','can','will','about','just',
             'all','more','also','than','then','when','what','which','who','its','our'}
    words = re.findall(r'\b[a-z]{4,}\b', text.lower())
    freq: dict[str, int] = {}
    for w in words:
        if w not in stop:
            freq[w] = freq.get(w, 0) + 1
    top = sorted(freq, key=freq.get, reverse=True)[:n]
    return top


def infer_content_type(platform: str, platform_cat: str, og_type: str, url: str) -> str:
    for key, ct in OG_TYPE_MAP.items():
        if key in og_type:
            return ct
    if platform_cat == 'music':
        if any(x in url for x in ['track', 'song', '/s/']):
            return 'track'
        if 'album' in url:
            return 'album'
        if 'playlist' in url:
            return 'playlist'
        if 'artist' in url:
            return 'artist'
        if 'show' in url or 'episode' in url:
            return 'podcast_episode'
        return 'music'
    if platform_cat == 'video':
        if any(x in url for x in ['/shorts/', '/clip/']):
            return 'short'
        return 'video'
    if platform_cat == 'social':
        if any(x in url for x in ['/p/', '/post', '/status', '/reel', '/shorts', '/s/']):
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
    if platform_cat == 'podcast':
        return 'podcast'
    if platform_cat == 'crowdfunding':
        return 'crowdfunding'
    return 'website'


def build_summary(title: str, description: str, artist: str, track: str,
                  h1: str, paragraphs: list[str], content_type: str) -> str:
    if artist and track:
        return f'"{track}" by {artist}'
    if artist and content_type == 'artist':
        return f'Artist: {artist}'
    if title:
        clean = re.sub(r'\s*[\|\-–—]\s*.{1,40}$', '', title).strip()
        # If the cleaned title is a short brand name (< 30 chars) and we have a
        # richer description, use the description — brand names alone are not useful
        # as a summary for content generation.
        if clean and len(clean) > 10:
            if len(clean) >= 30 or not description:
                return clean
            # Short brand name: fall through to description below
    if h1 and h1 != title and len(h1) > 20:
        return h1[:200]
    if description:
        return description[:220]
    if paragraphs:
        return paragraphs[0][:200]
    return title[:160] if title else ''


def estimate_reading_time(paragraphs: list[str], word_count_override: Optional[int] = None) -> Optional[int]:
    if word_count_override:
        return max(1, round(word_count_override / 200))
    total_words = sum(len(p.split()) for p in paragraphs)
    if total_words > 50:
        return max(1, round(total_words / 200))
    return None


def extract_music_from_title(title: str, platform_cat: str) -> dict[str, str]:
    """
    Extract artist/track from common title patterns:
    "Artist - Track", "Artist · Track", "Track by Artist", "Track | Artist"
    """
    out: dict[str, str] = {}
    if not title or platform_cat not in MUSIC_CATEGORIES:
        return out
    # "Artist – Track Title" or "Artist - Track Title"
    for sep in [' – ', ' - ', ' — ']:
        if sep in title:
            parts = title.split(sep, 1)
            out['artist'] = parts[0].strip()
            out['track']  = parts[1].strip()
            return out
    # "Artist · Track" (common on Apple Music, Spotify)
    if ' · ' in title:
        parts = title.split(' · ', 1)
        out['artist'] = parts[0].strip()
        out['track']  = parts[1].strip()
        return out
    # "Track by Artist"
    m = re.search(r'^(.+?)\s+by\s+(.+)$', title, re.I)
    if m:
        out['track']  = m.group(1).strip()
        out['artist'] = m.group(2).strip()
        return out
    # "Track | Artist" (some platforms)
    if ' | ' in title:
        parts = title.split(' | ', 1)
        out['track']  = parts[0].strip()
        out['artist'] = parts[1].strip()
    return out


# ─────────────────────────────────────────────────────────────────────────────
# MAIN ANALYZER
# ─────────────────────────────────────────────────────────────────────────────

def analyze_url(url: str) -> dict:
    url = url.strip()
    if not url:
        return {'error': 'Empty URL'}
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url

    # ── 1. Platform detection ──────────────────────────────────────────────
    platform     = 'web'
    platform_cat = 'web'
    for pattern, pid, pcat in PLATFORMS:
        if re.search(pattern, url, re.I):
            platform     = pid
            platform_cat = pcat
            break

    domain = parse_domain(url)

    result: dict = {
        # Core
        'url':               url,
        'domain':            domain,
        'platform':          platform,
        'platform_category': platform_cat,
        'is_music':          platform_cat in MUSIC_CATEGORIES,
        # Basic metadata
        'title':             '',
        'description':       '',
        'author':            '',
        'published':         '',
        'modified':          '',
        'og_image':          '',
        'thumbnail_url':     '',
        'canonical':         '',
        'language':          '',
        # Classification
        'content_type':      '',
        'content_category':  '',
        'genre':             'default',
        'tone':              'default',
        # Music-specific
        'artist':            '',
        'track':             '',
        'album':             '',
        'duration':          '',
        'release_date':      '',
        'label':             '',
        'isrc':              '',
        'bpm':               '',
        # Content arrays
        'keywords':          [],
        'tags':              [],
        'headings':          [],
        'body_preview':      '',
        'summary':           '',
        # Engagement (populated when available)
        'view_count':        None,
        'like_count':        None,
        'comment_count':     None,
        'play_count':        None,
        'share_count':       None,
        'subscriber_count':  None,
        # Media
        'embed_url':         '',
        # Reading
        'reading_time_minutes': None,
        'word_count':        None,
        # Event-specific
        'event_date':        '',
        'event_end_date':    '',
        'event_location':    '',
        'performers':        [],
        # Product-specific
        'price':             '',
        'currency':          '',
        'brand':             '',
        'rating':            '',
        'review_count':      None,
        # Platform IDs
        'spotify_type':      '',
        'spotify_id':        '',
        'youtube_id':        '',
        'apple_music_type':  '',
        'apple_music_id':    '',
        # Source tracking
        'data_sources':      [],
    }

    # ── 2. URL-path heuristics (before fetch) ─────────────────────────────
    if platform == 'spotify':
        result.update(parse_spotify_path(url))
    elif platform == 'youtube':
        vid = parse_youtube_id(url)
        if vid:
            result['youtube_id'] = vid
    elif platform == 'apple_music':
        result.update(parse_apple_music_path(url))

    # ── 3. oEmbed (public APIs, no key required) ──────────────────────────
    oembed = fetch_oembed(url)
    if oembed:
        result['data_sources'].append('oembed')
        _apply(result, 'title',          oembed.get('title', ''))
        _apply(result, 'author',         oembed.get('author_name', ''))
        _apply(result, 'thumbnail_url',  oembed.get('thumbnail_url', ''))
        _apply(result, 'og_image',       oembed.get('thumbnail_url', ''))
        _apply(result, 'embed_url',      oembed.get('html', ''))  # raw embed HTML
        _apply(result, 'provider_name',  oembed.get('provider_name', ''))
        # oEmbed embed URL extraction
        embed_html = oembed.get('html', '')
        if embed_html:
            em = re.search(r'src="([^"]+)"', embed_html)
            if em:
                result['embed_url'] = em.group(1)
        # Duration from oEmbed
        if oembed.get('duration') and not result['duration']:
            result['duration'] = _format_seconds(oembed['duration'])

    # ── 4. Fetch the full HTML page ────────────────────────────────────────
    html = ''
    try:
        html, final_url = fetch_html(url)
        if final_url and final_url != url:
            result['final_url'] = final_url
            # Re-detect platform from final URL if redirect changed domain
            for pattern, pid, pcat in PLATFORMS:
                if re.search(pattern, final_url, re.I):
                    if platform == 'web':
                        platform, platform_cat = pid, pcat
                        result['platform']          = platform
                        result['platform_category'] = platform_cat
                        result['is_music']          = platform_cat in MUSIC_CATEGORIES
                    break
        result['data_sources'].append('html')
    except Exception as e:
        result['error'] = str(e)
        result['content_type']     = infer_content_type(platform, platform_cat, '', url)
        result['content_category'] = platform_cat if platform_cat != 'web' else 'general'
        result['summary']          = result.get('title') or domain
        return result

    # ── 5. HTML parsing ────────────────────────────────────────────────────
    parser = MetaExtractor()
    try:
        parser.feed(html)
    except Exception:
        pass

    _apply(result, 'language', parser.language)

    # ── 6. JSON-LD / Schema.org extraction ────────────────────────────────
    if parser.json_ld_blocks:
        ld_data = parse_json_ld(parser.json_ld_blocks)
        if ld_data:
            result['data_sources'].append('json_ld')
            for k, v in ld_data.items():
                if v and not result.get(k):
                    result[k] = v
            # Promote ld_genre into genre field
            if ld_data.get('ld_genre') and result['genre'] == 'default':
                result['genre'] = ld_data['ld_genre']
                del result['ld_genre']
            else:
                result.pop('ld_genre', None)

    # ── 7. Platform-specific page data ────────────────────────────────────
    if platform == 'youtube' and html:
        yt_data = parse_youtube_page_data(html)
        if yt_data:
            result['data_sources'].append('youtube_page_data')
            for k in ['title', 'author', 'description', 'tags', 'duration']:
                _apply(result, k, yt_data.get(k, ''))
            if yt_data.get('view_count') and not result['view_count']:
                result['view_count'] = yt_data['view_count']
            if yt_data.get('like_count') and not result['like_count']:
                result['like_count'] = yt_data['like_count']
            if yt_data.get('subscriber_count') and not result['subscriber_count']:
                result['subscriber_count'] = yt_data['subscriber_count']

    elif platform == 'soundcloud' and html:
        sc_data = parse_soundcloud_page_data(html)
        if sc_data:
            result['data_sources'].append('soundcloud_page_data')
            for k, v in sc_data.items():
                if v and not result.get(k):
                    result[k] = v

    elif platform == 'bandcamp' and html:
        bc_data = parse_bandcamp_page_data(html)
        if bc_data:
            result['data_sources'].append('bandcamp_page_data')
            for k, v in bc_data.items():
                if v and not result.get(k):
                    result[k] = v

    # ── 8. OG + Twitter Card + standard meta ──────────────────────────────
    result['data_sources'].append('meta_tags')
    title = (parser.og.get('title') or parser.twitter.get('title') or parser.title or '').strip()
    desc  = (parser.og.get('description') or parser.twitter.get('description') or
             parser.description or '').strip()
    image = (parser.og.get('image') or parser.og.get('image:url') or
             parser.twitter.get('image') or parser.twitter.get('image:src') or '').strip()
    og_type = parser.og.get('type', '').lower()

    _apply(result, 'title',       title)
    _apply(result, 'description', desc)
    _apply(result, 'og_image',    image)
    _apply(result, 'thumbnail_url', image)
    _apply(result, 'canonical',   parser.canonical or '')
    _apply(result, 'author',      (parser.og.get('article:author') or parser.author or '').strip())
    _apply(result, 'published',   (parser.og.get('article:published_time') or parser.published or '').strip())
    _apply(result, 'modified',    (parser.og.get('article:modified_time') or parser.modified or '').strip())

    # Music namespace OG tags
    og_musician = parser.og.get('music:musician', '')
    if og_musician:
        _apply(result, 'artist', og_musician.split('/')[-1].strip())
    og_album = parser.og.get('music:album', '')
    _apply(result, 'album', og_album)
    og_duration = parser.og.get('music:duration', '')
    if og_duration:
        try:
            _apply(result, 'duration', _format_seconds(int(og_duration)))
        except Exception:
            pass
    og_release = parser.og.get('music:release_date', '')
    _apply(result, 'release_date', og_release[:10] if og_release else '')

    # Twitter card type
    tw_type = parser.twitter.get('card', '')
    if tw_type == 'player' and not result['embed_url']:
        result['embed_url'] = parser.twitter.get('player', '')

    # ── 9. Page headings & body text ──────────────────────────────────────
    result['headings']    = parser.headings
    result['body_preview'] = parser.body_preview[:600]

    # ── 10. Artist / track extraction from title ──────────────────────────
    if not result['artist'] and not result['track']:
        music_from_title = extract_music_from_title(title, platform_cat)
        for k, v in music_from_title.items():
            _apply(result, k, v)

    # ── 11. Content classification ────────────────────────────────────────
    combined = f"{result['title']} {result['description']} {result['body_preview']} {' '.join(result['headings'])}"
    if result.get('tags'):
        combined += ' ' + ' '.join(result['tags'])
    if result.get('ld_genre'):
        combined += ' ' + result['ld_genre']

    if not result['content_type']:
        result['content_type'] = infer_content_type(platform, platform_cat, og_type, url)

    result['content_category'] = detect_content_category(combined, platform_cat)

    if result['genre'] == 'default':
        detected = detect_genre(combined)
        if detected != 'default':
            result['genre'] = detected

    result['tone'] = detect_tone(combined)

    # ── 12. Keywords & tags ───────────────────────────────────────────────
    if not result['keywords']:
        result['keywords'] = extract_keywords(combined, parser.keywords)
    if not result['tags']:
        if parser.keywords:
            result['tags'] = [k.strip() for k in re.split(r'[,;]', parser.keywords) if k.strip()][:15]

    # ── 13. Reading time ──────────────────────────────────────────────────
    if not result['reading_time_minutes']:
        rt = estimate_reading_time(parser._paragraphs, result.get('word_count'))
        if rt:
            result['reading_time_minutes'] = rt

    # ── 14. Summary ───────────────────────────────────────────────────────
    result['summary'] = build_summary(
        result['title'], result['description'],
        result['artist'], result['track'],
        parser.h1, parser._paragraphs, result['content_type'],
    )

    # ── 15. Clean up None values and empty lists ──────────────────────────
    result = {k: v for k, v in result.items()
              if v is not None or k in ('view_count', 'like_count', 'comment_count',
                                         'play_count', 'share_count', 'subscriber_count',
                                         'review_count', 'reading_time_minutes', 'word_count')}

    return result


def _apply(d: dict, key: str, value: Any) -> None:
    """Set d[key] = value only if key is not already set to a non-empty value."""
    if value and not d.get(key):
        d[key] = value


# ─────────────────────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: urlAnalyzer.py <url>'}))
        sys.exit(1)

    out = analyze_url(sys.argv[1])
    print(json.dumps(out, ensure_ascii=False, indent=2))
