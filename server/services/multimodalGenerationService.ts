import { randomUUID } from 'crypto';
import { logger } from '../logger.js';
import { generateVideo as generateVideoFFmpeg } from './videoGeneratorService.js';
import { sharpImageService } from './sharpImageService.js';
import {
  type GenerationRequest,
  type GeneratedAsset,
  type TaskStep,
  type TaskPlan,
  type MultimodalPackage,
  type Platform,
  type OutputModality,
  PACK_DEFINITIONS,
} from '@shared/types/multimodalGeneration.js';
import {
  PLATFORM_RULES,
  getRules,
  enforceTextLength,
  enforceHashtagLimit,
  type PlatformRules,
} from '@shared/config/platformRules.js';

// Strip any trailing /api so the base is always the root, then append /api.
// This means AI_SERVER_URL can be set to either the root or the /api form and both work.
const _MAXCORE_BASE = (process.env.AI_SERVER_URL || 'https://secure-ai-forge.replit.app').replace(/\/api\/?$/, '');
const MAXCORE_URL = `${_MAXCORE_BASE}/api`;
const MAXCORE_KEY = process.env.AI_SERVER_KEY || '';

async function maxcorePost(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${MAXCORE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(MAXCORE_KEY ? {
        'Authorization': `Bearer ${MAXCORE_KEY}`,
        'X-API-Key': MAXCORE_KEY,
      } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`MaxCore ${path} → HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    const text = await res.text().catch(() => '');
    throw new Error(`MaxCore ${path} returned non-JSON (${ct || 'no content-type'}): ${text.slice(0, 200)}`);
  }
  return res.json();
}

function safeExtractJson(raw: string): any {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1] : raw;
  const braceStart = candidate.indexOf('{');
  const braceEnd = candidate.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd !== -1) {
    try {
      return JSON.parse(candidate.slice(braceStart, braceEnd + 1));
    } catch { }
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Could not parse JSON from MaxCore response');
  }
}

function validateTaskPlan(raw: any, requestId: string): TaskPlan {
  if (!raw || !Array.isArray(raw.steps)) {
    throw new Error('TaskPlan missing steps array');
  }
  const steps: TaskStep[] = raw.steps.map((s: any, i: number) => ({
    id: s.id || `step_${i}`,
    type: s.type === 'analyze' ? 'analyze' : 'generate',
    worker: ['text', 'image', 'audio', 'video'].includes(s.worker) ? s.worker : 'text',
    inputFrom: s.inputFrom || 'normalizedInput',
    params: s.params || {},
  }));
  return { requestId, steps };
}

// ── Local URL analyzer ────────────────────────────────────────────────────────

type UrlCategory =
  | 'music_stream'   // Spotify, Apple Music, Tidal, Deezer, Audiomack, Bandcamp
  | 'music_video'    // YouTube music video, Vevo
  | 'video'          // YouTube non-music, Vimeo, Dailymotion
  | 'social_post'    // Instagram, TikTok, X/Twitter, Facebook, Threads
  | 'podcast'        // Podcast platforms
  | 'article'        // Blog post, news article, Medium
  | 'ecommerce'      // Online store, merch, product
  | 'website'        // General website / artist site
  | 'press'          // Music press: Pitchfork, Rolling Stone, NME, etc.
  | 'event'          // Show listing, ticketing (Eventbrite, Dice, Ticketmaster)
  | 'other';

interface UrlContext {
  category:   UrlCategory;
  platform:   string;
  contentType: string;
  id?:         string;
}

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function classifyUrl(url: string): UrlContext {
  try {
    const u     = new URL(url);
    const host  = u.hostname.replace(/^www\./, '').toLowerCase();
    const parts = u.pathname.split('/').filter(Boolean);

    // ── Music streaming ─────────────────────────────────────────
    if (host.includes('spotify.com'))       return { category: 'music_stream', platform: 'Spotify',     contentType: parts[0] ?? 'track', id: parts[1] };
    if (host.includes('music.apple.com'))   return { category: 'music_stream', platform: 'Apple Music', contentType: 'album' };
    if (host.includes('tidal.com'))         return { category: 'music_stream', platform: 'Tidal',       contentType: 'track' };
    if (host.includes('deezer.com'))        return { category: 'music_stream', platform: 'Deezer',      contentType: 'track' };
    if (host.includes('audiomack.com'))     return { category: 'music_stream', platform: 'Audiomack',   contentType: 'song' };
    if (host.includes('bandcamp.com'))      return { category: 'music_stream', platform: 'Bandcamp',    contentType: 'track' };
    if (host.includes('soundcloud.com'))    return { category: 'music_stream', platform: 'SoundCloud',  contentType: 'track', id: parts.join('/') };
    if (host.includes('boomplay.com'))      return { category: 'music_stream', platform: 'Boomplay',    contentType: 'track' };
    if (host.includes('pandora.com'))       return { category: 'music_stream', platform: 'Pandora',     contentType: 'station' };
    if (host.includes('music.amazon'))      return { category: 'music_stream', platform: 'Amazon Music',contentType: 'track' };
    if (host.includes('napster.com'))       return { category: 'music_stream', platform: 'Napster',     contentType: 'track' };
    if (host.includes('anghami.com'))       return { category: 'music_stream', platform: 'Anghami',     contentType: 'track' };
    if (host.includes('kkbox.com'))         return { category: 'music_stream', platform: 'KKBOX',       contentType: 'track' };
    if (host.includes('joox.com'))          return { category: 'music_stream', platform: 'JOOX',        contentType: 'track' };
    if (host.includes('gaana.com'))         return { category: 'music_stream', platform: 'Gaana',       contentType: 'song' };
    if (host.includes('jiosaavn.com'))      return { category: 'music_stream', platform: 'JioSaavn',    contentType: 'song' };
    if (host.includes('music.youtube.com')) return { category: 'music_stream', platform: 'YouTube Music',contentType: 'track' };
    if (host.includes('vevo.com'))          return { category: 'music_video',  platform: 'Vevo',        contentType: 'video' };

    // ── Video ────────────────────────────────────────────────────
    if (host.includes('youtube.com') || host.includes('youtu.be')) return { category: 'video', platform: 'YouTube', contentType: 'video', id: u.searchParams.get('v') ?? parts[0] };
    if (host.includes('vimeo.com'))         return { category: 'video', platform: 'Vimeo',       contentType: 'video' };
    if (host.includes('dailymotion.com'))   return { category: 'video', platform: 'Dailymotion',  contentType: 'video' };
    if (host.includes('twitch.tv'))         return { category: 'video', platform: 'Twitch',       contentType: 'stream' };
    if (host.includes('kick.com'))          return { category: 'video', platform: 'Kick',         contentType: 'stream' };
    if (host.includes('rumble.com'))        return { category: 'video', platform: 'Rumble',       contentType: 'video' };

    // ── Social posts ─────────────────────────────────────────────
    if (host.includes('instagram.com'))     return { category: 'social_post', platform: 'Instagram', contentType: parts[0] === 'p' || parts[0] === 'reel' ? parts[0] : 'post' };
    if (host.includes('tiktok.com'))        return { category: 'social_post', platform: 'TikTok',   contentType: 'video' };
    if (host.includes('twitter.com') || host.includes('x.com')) return { category: 'social_post', platform: 'X (Twitter)', contentType: 'tweet' };
    if (host.includes('facebook.com'))      return { category: 'social_post', platform: 'Facebook', contentType: 'post' };
    if (host.includes('threads.net'))       return { category: 'social_post', platform: 'Threads',  contentType: 'post' };
    if (host.includes('linkedin.com'))      return { category: 'social_post', platform: 'LinkedIn', contentType: 'post' };
    if (host.includes('pinterest.com'))     return { category: 'social_post', platform: 'Pinterest',contentType: 'pin' };
    if (host.includes('reddit.com'))        return { category: 'social_post', platform: 'Reddit',   contentType: 'post' };

    // ── Podcast ──────────────────────────────────────────────────
    if (host.includes('podcasts.apple.com'))return { category: 'podcast', platform: 'Apple Podcasts', contentType: 'episode' };
    if (host.includes('open.spotify.com') && parts[0] === 'episode') return { category: 'podcast', platform: 'Spotify Podcasts', contentType: 'episode' };
    if (host.includes('anchor.fm') || host.includes('podcasters.spotify.com')) return { category: 'podcast', platform: 'Spotify Podcasts', contentType: 'episode' };
    if (host.includes('buzzsprout.com'))    return { category: 'podcast', platform: 'Buzzsprout',  contentType: 'episode' };
    if (host.includes('podbean.com'))       return { category: 'podcast', platform: 'Podbean',     contentType: 'episode' };

    // ── Events / ticketing ───────────────────────────────────────
    if (host.includes('eventbrite.com'))    return { category: 'event', platform: 'Eventbrite',    contentType: 'event' };
    if (host.includes('dice.fm'))           return { category: 'event', platform: 'Dice',          contentType: 'event' };
    if (host.includes('ticketmaster.com'))  return { category: 'event', platform: 'Ticketmaster',  contentType: 'event' };
    if (host.includes('axs.com'))           return { category: 'event', platform: 'AXS',           contentType: 'event' };
    if (host.includes('songkick.com'))      return { category: 'event', platform: 'Songkick',      contentType: 'event' };
    if (host.includes('bandsintown.com'))   return { category: 'event', platform: 'Bandsintown',   contentType: 'event' };
    if (host.includes('seetickets.com'))    return { category: 'event', platform: 'See Tickets',   contentType: 'event' };
    if (host.includes('skiddle.com'))       return { category: 'event', platform: 'Skiddle',       contentType: 'event' };

    // ── Music press ──────────────────────────────────────────────
    if (['pitchfork.com','rollingstone.com','nme.com','billboard.com','stereogum.com',
         'theneedledrop.com','xxlmag.com','hotnewhiphop.com','complex.com',
         'consequence.net','allmusic.com','discogs.com'].some(d => host.includes(d)))
      return { category: 'press', platform: host.replace(/\.com$/, ''), contentType: 'review' };

    // ── E-commerce / merch ───────────────────────────────────────
    if (host.includes('merch') || host.includes('shop') ||
        host.includes('store') || host.includes('bigcartel.com') ||
        host.includes('shopify.com') || host.includes('etsy.com'))
      return { category: 'ecommerce', platform: host, contentType: 'product' };

    // ── Article / blog ───────────────────────────────────────────
    if (host.includes('medium.com') || host.includes('substack.com') ||
        host.includes('wordpress.com') || host.includes('ghost.io') ||
        host.includes('blogspot.com'))
      return { category: 'article', platform: host, contentType: 'article' };

    return { category: 'website', platform: host, contentType: 'page' };
  } catch {
    return { category: 'other', platform: '', contentType: 'link' };
  }
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g,   '&')
    .replace(/&lt;/g,    '<')
    .replace(/&gt;/g,    '>')
    .replace(/&quot;/g,  '"')
    .replace(/&#039;/g,  "'")
    .replace(/&#x27;/g,  "'")
    .replace(/&nbsp;/g,  ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}

interface PageMeta {
  title?:       string;
  description?: string;
  siteName?:    string;
  image?:       string;
  author?:      string;
  type?:        string;  // og:type (article, music.song, video.other, etc.)
  publishDate?: string;
}

async function tryOEmbed(oembedUrl: string): Promise<PageMeta | null> {
  try {
    const res = await fetch(oembedUrl, {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const d = await res.json();
    return {
      title:    d.title,
      author:   d.author_name,
      siteName: d.provider_name,
    };
  } catch {
    return null;
  }
}

function inferSiteNameFromUrl(url: string): string | undefined {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    // "en.wikipedia.org" → "Wikipedia"
    const parts = host.split('.');
    if (parts.length >= 2) {
      const domain = parts[parts.length - 2];
      return domain.charAt(0).toUpperCase() + domain.slice(1);
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function scrapeHtml(url: string): Promise<PageMeta> {
  const res = await fetch(url, {
    headers: {
      'User-Agent':      BROWSER_UA,
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control':   'no-cache',
    },
    signal: AbortSignal.timeout(14_000),
    redirect: 'follow',
  });
  if (!res.ok) return {};

  const html = await res.text();

  // ── 1. Meta tag extractor (handles both attribute orderings) ──
  const getMeta = (...props: string[]): string | undefined => {
    for (const prop of props) {
      const escaped = prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m =
        html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']{1,600})["']`, 'i')) ??
        html.match(new RegExp(`<meta[^>]+content=["']([^"']{1,600})["'][^>]+(?:property|name)=["']${escaped}["']`, 'i'));
      if (m?.[1]) return decodeHtmlEntities(m[1]);
    }
    return undefined;
  };

  // ── 2. JSON-LD structured data ─────────────────────────────────
  let jsonLdTitle: string | undefined;
  let jsonLdDescription: string | undefined;
  let jsonLdAuthor: string | undefined;
  let jsonLdDate: string | undefined;
  try {
    const ldMatches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const m of ldMatches) {
      try {
        const ld = JSON.parse(m[1].trim());
        const items = Array.isArray(ld) ? ld : [ld];
        for (const item of items) {
          if (!jsonLdTitle && item.name)          jsonLdTitle       = String(item.name);
          if (!jsonLdTitle && item.headline)      jsonLdTitle       = String(item.headline);
          if (!jsonLdDescription && item.description) jsonLdDescription = String(item.description).slice(0, 400);
          if (!jsonLdAuthor && item.author)       jsonLdAuthor      = typeof item.author === 'string' ? item.author : item.author?.name ?? '';
          if (!jsonLdDate && item.datePublished)  jsonLdDate        = String(item.datePublished);
        }
      } catch { /* malformed JSON-LD */ }
    }
  } catch { /* ignore */ }

  // ── 3. oEmbed discovery from HTML link tag ─────────────────────
  let oembedResult: PageMeta | null = null;
  try {
    const oembedLink = html.match(/<link[^>]+type=["']application\/json\+oembed["'][^>]+href=["']([^"']+)["']/i)
                    ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]+type=["']application\/json\+oembed["']/i);
    if (oembedLink?.[1]) {
      oembedResult = await tryOEmbed(oembedLink[1]);
    }
  } catch { /* ignore */ }

  // ── 4. Fallback: h1 + first paragraph ─────────────────────────
  const h1 = html.match(/<h1[^>]*>([^<]{3,200})<\/h1>/i)?.[1];
  const firstPara = html.match(/<p[^>]*>([^<]{30,400})<\/p>/i)?.[1];

  // ── 5. Assemble with priority ──────────────────────────────────
  // OG/twitter titles are already clean — only strip site-suffix from <title> tags
  const ogTitle      = oembedResult?.title ?? getMeta('og:title', 'twitter:title', 'dc.title') ?? jsonLdTitle;
  const rawPageTitle = html.match(/<title[^>]*>([^<]{1,250})<\/title>/i)?.[1];
  const h1Title      = h1 ? decodeHtmlEntities(h1) : undefined;

  // Strip "Page Title | Site Name" or "Page Title - Site Name" only from <title> tag
  const cleanPageTitle = rawPageTitle
    ? decodeHtmlEntities(rawPageTitle).replace(/\s+[|\u2013\u2014]\s+[^|\u2013\u2014]{2,60}$/, '').trim()
    : undefined;

  const siteNameFromMeta = oembedResult?.siteName ?? getMeta('og:site_name');
  const inferredSiteName = inferSiteNameFromUrl(url);
  const effectiveSiteName = siteNameFromMeta ?? inferredSiteName;

  let finalTitle = ogTitle
    ? decodeHtmlEntities(ogTitle).trim()
    : (cleanPageTitle ?? h1Title);
  // Strip site-name suffix from title (e.g. "Miles Davis - Wikipedia" → "Miles Davis")
  if (finalTitle && effectiveSiteName) {
    const esc = effectiveSiteName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    finalTitle = finalTitle.replace(new RegExp(`\\s*[-–—|]\\s*${esc}\\s*$`, 'i'), '').trim() || finalTitle;
  }

  const rawDesc =
    getMeta('og:description', 'twitter:description', 'description', 'dc.description') ??
    jsonLdDescription ??
    (firstPara ? decodeHtmlEntities(firstPara.replace(/<[^>]+>/g, '')) : undefined);

  const cleanDesc = rawDesc?.replace(/<[^>]+>/g, '').trim();
  const BOT_WALL_DESC = [
    /confirm.*you.*re a human/i,
    /not a (robot|bot|spambot)/i,
    /verify.*you.*re a human/i,
    /ddos protection/i,
    /cloudflare.*ray id/i,
    /enable.*javascript.*cookies/i,
    /please enable cookies/i,
  ];
  const safeDesc = (cleanDesc && BOT_WALL_DESC.some(re => re.test(cleanDesc))) ? undefined : cleanDesc;

  return {
    title:       finalTitle || undefined,
    description: safeDesc,
    siteName:    effectiveSiteName ?? undefined,
    image:       getMeta('og:image', 'twitter:image') ?? undefined,
    author:      oembedResult?.author ?? jsonLdAuthor ?? getMeta('author', 'dc.creator') ?? undefined,
    type:        getMeta('og:type') ?? undefined,
    publishDate: jsonLdDate ?? getMeta('article:published_time') ?? undefined,
  };
}

async function fetchUrlMetadata(url: string, ctx: UrlContext): Promise<PageMeta> {
  // ── Known oEmbed endpoints (no need to scrape HTML first) ──────
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    const r = await tryOEmbed(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if (r?.title) return { ...r, siteName: 'YouTube', description: `Video by ${r.author ?? 'creator'}` };
  }
  if (url.includes('spotify.com')) {
    const r = await tryOEmbed(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
    if (r?.title) return { ...r, siteName: 'Spotify', description: r.author ? `by ${r.author} on Spotify` : 'Streaming on Spotify' };
  }
  if (url.includes('soundcloud.com')) {
    const r = await tryOEmbed(`https://soundcloud.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if (r?.title) return { ...r, siteName: 'SoundCloud', description: r.author ? `Track by ${r.author} on SoundCloud` : undefined };
  }
  if (url.includes('vimeo.com')) {
    const r = await tryOEmbed(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`);
    if (r?.title) return { ...r, siteName: 'Vimeo', description: r.author ? `Video by ${r.author}` : undefined };
  }
  if (url.includes('twitter.com') || url.includes('x.com')) {
    const r = await tryOEmbed(`https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`);
    if (r?.title) return { ...r, siteName: 'X (Twitter)' };
  }
  if (url.includes('bandcamp.com')) {
    const r = await tryOEmbed(`https://bandcamp.com/api/oembed?url=${encodeURIComponent(url)}&format=json`);
    if (r?.title) return { ...r, siteName: 'Bandcamp', description: r.author ? `by ${r.author} on Bandcamp` : undefined };
  }

  // ── HTML scrape with full extraction pipeline ──────────────────
  try {
    const meta = await scrapeHtml(url);
    // Strip generic "shell" titles returned by JS-rendered apps
    const GENERIC_TITLES = [
      /^spotify\s*[-–—|]/i,
      /^spotify$/i,
      /^soundcloud\s*[-–—|]/i,
      /^soundcloud$/i,
      /^tiktok\s*[-–—|]/i,
      /^tiktok$/i,
      /^instagram\s*[-–—|]/i,
      /^instagram$/i,
      /^facebook\s*[-–—|]/i,
      /^facebook$/i,
      /^twitter\s*[-–—|]/i,
      /^x\s*[-–—|]/i,
      /^medium$/i,
      /^home$/i,
      /^just a moment/i,
      /^loading/i,
      /^please wait/i,
      /^access denied/i,
      /^403/i,
      /^404/i,
      /^page not found/i,
      /^error/i,
      /^verify to continue/i,
      /^security check/i,
      /^attention required/i,
      /^ddos protection/i,
      /^bot.*detected/i,
      /^captcha/i,
      /^one more step/i,
      /^checking your browser/i,
    ];
    if (meta.title) {
      const isGeneric = GENERIC_TITLES.some(re => re.test(meta.title!));
      if (isGeneric) meta.title = undefined;
    }
    // Also strip if title exactly matches site name
    if (meta.title && meta.siteName && meta.title.toLowerCase() === meta.siteName.toLowerCase()) {
      meta.title = undefined;
    }
    // Wipe description if it looks like a bot-wall / captcha page
    if (meta.description) {
      const BOT_WALL = [
        /confirm.*you.*re a human/i,
        /not a (robot|bot|spambot)/i,
        /verify.*you.*re a human/i,
        /security check/i,
        /cloudflare.*ray id/i,
        /enable.*javascript.*cookies/i,
      ];
      if (BOT_WALL.some(re => re.test(meta.description!))) {
        meta.description = undefined;
      }
    }
    return meta;
  } catch {
    return {};
  }
}

// ─── Dynamic Hashtag Engine ──────────────────────────────────────────────────
// Per content-category, per platform hashtag pools (ordered by performance weight)
const HASHTAG_LIBRARY: Record<string, Record<string, string[]>> = {
  music_stream: {
    instagram:      ['#newmusic', '#nowplaying', '#streaming', '#newrelease', '#indieartist', '#musician', '#hiphop', '#rnb', '#music', '#artist'],
    facebook:       ['#newmusic', '#streaming', '#music'],
    tiktok:         ['#newmusic', '#fyp', '#music', '#artist', '#viral'],
    twitter:        ['#newmusic', '#music'],
    youtube:        [],
    linkedin:       ['#music', '#newrelease', '#artist'],
    threads:        [],
    google_business:[],
  },
  music_video: {
    instagram:      ['#musicvideo', '#officialvideo', '#newvideo', '#nowplaying', '#musician', '#newmusic', '#hiphop', '#vibes', '#music', '#artist'],
    facebook:       ['#musicvideo', '#newrelease', '#music'],
    tiktok:         ['#musicvideo', '#fyp', '#newmusic', '#official', '#viral'],
    twitter:        ['#musicvideo', '#music'],
    youtube:        [],
    linkedin:       ['#music', '#musicvideo', '#artist'],
    threads:        [],
    google_business:[],
  },
  video: {
    instagram:      ['#newvideo', '#contentcreator', '#behindthescenes', '#music', '#artist', '#vlog', '#viral', '#fyp'],
    facebook:       ['#video', '#music', '#artist'],
    tiktok:         ['#fyp', '#viral', '#artist', '#music', '#trending'],
    twitter:        ['#video', '#music'],
    youtube:        [],
    linkedin:       ['#video', '#music', '#artist'],
    threads:        [],
    google_business:[],
  },
  event: {
    instagram:      ['#concert', '#livemusic', '#tickets', '#event', '#live', '#musicfestival', '#tour', '#artist'],
    facebook:       ['#concert', '#livemusic', '#tickets'],
    tiktok:         ['#concert', '#fyp', '#livemusic', '#tickets', '#tour'],
    twitter:        ['#concert', '#livemusic'],
    youtube:        [],
    linkedin:       ['#event', '#music', '#concert'],
    threads:        [],
    google_business:[],
  },
  press: {
    instagram:      ['#press', '#feature', '#media', '#artist', '#music', '#interview', '#magazine', '#promo'],
    facebook:       ['#press', '#feature', '#music'],
    tiktok:         ['#press', '#fyp', '#music', '#feature', '#viral'],
    twitter:        ['#press', '#music'],
    youtube:        [],
    linkedin:       ['#press', '#media', '#music', '#feature', '#musicindustry'],
    threads:        [],
    google_business:[],
  },
  ecommerce: {
    instagram:      ['#merch', '#drop', '#shopnow', '#limitededition', '#newdrop', '#merchandise', '#artist', '#fashion'],
    facebook:       ['#merch', '#drop', '#shopnow'],
    tiktok:         ['#merch', '#fyp', '#drop', '#shopnow', '#tiktokshop'],
    twitter:        ['#merch', '#drop'],
    youtube:        [],
    linkedin:       ['#merch', '#merchandise', '#artist'],
    threads:        [],
    google_business:[],
  },
  podcast: {
    instagram:      ['#podcast', '#newepisode', '#music', '#interview', '#podcastlife', '#listen', '#nowplaying'],
    facebook:       ['#podcast', '#newepisode', '#music'],
    tiktok:         ['#podcast', '#fyp', '#newepisode', '#music', '#podcastclips'],
    twitter:        ['#podcast', '#music'],
    youtube:        [],
    linkedin:       ['#podcast', '#music', '#interview', '#content'],
    threads:        [],
    google_business:[],
  },
  article: {
    instagram:      ['#article', '#blog', '#music', '#read', '#musicindustry', '#artist', '#culture'],
    facebook:       ['#article', '#blog', '#music'],
    tiktok:         ['#music', '#fyp', '#article', '#learn'],
    twitter:        ['#music', '#article'],
    youtube:        [],
    linkedin:       ['#article', '#musicindustry', '#music', '#insights'],
    threads:        [],
    google_business:[],
  },
  social_post: {
    instagram:      ['#music', '#artist', '#vibes', '#content', '#newpost'],
    facebook:       ['#music', '#artist'],
    tiktok:         ['#fyp', '#music', '#artist', '#viral'],
    twitter:        ['#music', '#artist'],
    youtube:        [],
    linkedin:       ['#music', '#artist'],
    threads:        [],
    google_business:[],
  },
};

function getHashtagsForPlatform(
  category: string,
  platform: string,
  max: number,
  artistName?: string,
): string {
  if (max === 0) return '';
  const pool = HASHTAG_LIBRARY[category]?.[platform] ?? HASHTAG_LIBRARY['social_post']?.[platform] ?? [];
  const tags = pool.slice(0, max - (artistName ? 1 : 0));
  if (artistName) {
    const artistTag = '#' + artistName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (artistTag.length > 1 && !tags.includes(artistTag)) tags.push(artistTag);
  }
  return tags.length > 0 ? '\n\n' + tags.join(' ') : '';
}

// ─── Per-Platform Copy Builder ────────────────────────────────────────────────
// Returns genuinely differentiated copy for each target platform.
// Content style, length, tone, and angle all vary by platform norms.
function buildCopyFromContext(
  ctx: UrlContext,
  meta: PageMeta,
  intent: string,
  targetPlatform?: string,
): { hook: string; body: string; cta: string } {
  const title    = meta.title ?? '';
  const desc     = meta.description ?? '';
  const platform = meta.siteName ?? ctx.platform;
  const author   = meta.author ?? '';
  const tp       = targetPlatform ?? '';

  // Per-platform copy factories per content category
  switch (ctx.category) {

    case 'music_stream': {
      if (tp === 'tiktok') return {
        hook: title ? `POV: "${title}" just hit different 🎵` : `POV: This song just changed everything 🎵`,
        body: desc.slice(0, 80) || 'The vibes are immaculate 🔥',
        cta:  `🔗 Link in bio to stream`,
      };
      if (tp === 'twitter') return {
        hook: title ? `🎵 "${title}" is out now on ${platform}` : `🎵 New music just dropped`,
        body: desc.slice(0, 100) || '',
        cta:  `Stream it 🔗`,
      };
      if (tp === 'youtube') return {
        hook: title ? `New Release: "${title}" — Out Now on ${platform}` : `New Music — Out Now`,
        body: desc || `Stream "${title}" on ${platform}. Drop a comment with your favorite lyric! 🎤`,
        cta:  `🔔 Subscribe for more and hit the like button!`,
      };
      if (tp === 'linkedin') return {
        hook: title ? `Excited to announce my latest release: "${title}"` : `New music release announcement`,
        body: desc || `After months of work, this track is finally out on ${platform}. Music is the universal language — I hope it resonates.`,
        cta:  `Stream it now — link in the first comment.`,
      };
      if (tp === 'threads') return {
        hook: title ? `"${title}" is out now 🎶` : `New music just dropped`,
        body: desc.slice(0, 100) || `Feels like the right time for this one`,
        cta:  `Link in bio`,
      };
      if (tp === 'facebook') return {
        hook: title ? `🎵 "${title}" is now streaming everywhere!` : `🎵 New music is now streaming!`,
        body: desc || `I've been working on this for a while and I'm so excited to finally share it. This track means a lot to me and I can't wait for you all to hear it.`,
        cta:  `Stream now on ${platform} — link in the comments 🔗`,
      };
      if (tp === 'google_business') return {
        hook: title ? `New Music Release: "${title}"` : `New music release`,
        body: desc || `Now available on all major streaming platforms.`,
        cta:  `Listen now on ${platform}`,
      };
      return {
        hook: title ? `🎵 "${title}" is streaming now on ${platform}!` : `🎵 New music on ${platform}!`,
        body: desc || (title ? `Listen to "${title}" — link in bio!` : `Stream the latest on ${platform}`),
        cta:  `Stream on ${platform} 🔗 Link in bio!`,
      };
    }

    case 'music_video': {
      if (tp === 'tiktok') return {
        hook: title ? `🎬 We need to talk about this music video "${title}"` : `🎬 This music video hits HARD`,
        body: `Tell me your favorite part in the comments 👇`,
        cta:  `🔗 Full video — link in bio`,
      };
      if (tp === 'twitter') return {
        hook: title ? `🎬 "${title}" — official video is out` : `🎬 New music video just dropped`,
        body: '',
        cta:  `Watch now 🔗`,
      };
      if (tp === 'youtube') return {
        hook: title ? `Official Music Video: "${title}"` : `Official Music Video — Out Now`,
        body: desc || `Watch the official music video. If you love it, hit subscribe and turn on notifications for more!`,
        cta:  `🔔 Subscribe for new music videos and hit the like button!`,
      };
      if (tp === 'linkedin') return {
        hook: title ? `Proud to share the official music video for "${title}"` : `New music video release`,
        body: desc || `Storytelling through visuals — this video took months of creative work to bring to life.`,
        cta:  `Watch the full video — link below.`,
      };
      if (tp === 'threads') return {
        hook: title ? `music video for "${title}" is live 🎬` : `new music video is live 🎬`,
        body: desc.slice(0, 80) || `go watch it`,
        cta:  `link in bio`,
      };
      if (tp === 'facebook') return {
        hook: title ? `🎬 The official music video for "${title}" is HERE!` : `🎬 New music video just dropped!`,
        body: desc || `I'm so proud of this one. Every scene tells a story. Watch the full video and let me know what you think in the comments!`,
        cta:  `Watch on ${platform} — link below! 🎬`,
      };
      return {
        hook: title ? `🎬 "${title}" — official music video just dropped!` : `🎬 New music video just dropped!`,
        body: desc || `Watch the official video — link in bio!`,
        cta:  `Watch on ${platform} 🎬 Link in bio!`,
      };
    }

    case 'video': {
      if (tp === 'tiktok') return {
        hook: title ? `you need to watch this "${title}" 👀` : `you need to see this 👀`,
        body: author ? `by ${author}` : '',
        cta:  `🔗 Watch the full thing`,
      };
      if (tp === 'twitter') return {
        hook: title ? `📹 "${title}"` : `📹 New video`,
        body: author ? `by ${author}` : '',
        cta:  `Watch 🔗`,
      };
      if (tp === 'youtube') return {
        hook: title ? `Watch: "${title}"` : `New Video — Watch Now`,
        body: desc || (author ? `by ${author}` : '') || 'Like and subscribe for more content!',
        cta:  `🔔 Subscribe and hit the like button!`,
      };
      if (tp === 'linkedin') return {
        hook: title ? `Worth watching: "${title}"` : `Sharing this video`,
        body: desc || (author ? `by ${author}` : '') || 'Great perspective here.',
        cta:  `Full video in the comments.`,
      };
      if (tp === 'threads') return {
        hook: title ? `"${title}" 📹` : `new video 📹`,
        body: desc.slice(0, 80) || '',
        cta:  `link in bio`,
      };
      if (tp === 'facebook') return {
        hook: title ? `📹 Watch: "${title}"` : `📹 New video — check it out!`,
        body: desc || (author ? `by ${author}` : '') || 'Let me know what you think in the comments!',
        cta:  `Watch on ${platform} ▶️`,
      };
      return {
        hook: title ? `📹 Watch: "${title}"` : `📹 New video — check it out!`,
        body: desc || (author ? `by ${author}` : '') || 'Link in bio!',
        cta:  `Watch on ${platform} ▶️ Link in bio!`,
      };
    }

    case 'social_post': {
      if (tp === 'tiktok') return {
        hook: title || `check this out 👀`,
        body: desc.slice(0, 60) || '',
        cta:  `🔗 follow for more`,
      };
      if (tp === 'twitter') return {
        hook: title || `Check this out`,
        body: '',
        cta:  `🔗`,
      };
      if (tp === 'linkedin') return {
        hook: title || `Worth sharing`,
        body: desc || `Interesting content from ${platform}.`,
        cta:  `Link in comments.`,
      };
      if (tp === 'threads') return {
        hook: title || `look at this`,
        body: desc.slice(0, 80) || '',
        cta:  ``,
      };
      return {
        hook: title || `Check out this ${ctx.contentType} 👀`,
        body: desc || `See what I posted on ${platform}!`,
        cta:  `Follow me on ${platform} 🔗 Link in bio!`,
      };
    }

    case 'podcast': {
      if (tp === 'tiktok') return {
        hook: title ? `🎙️ this podcast episode "${title}" changed how I think about music` : `🎙️ this podcast episode is insane`,
        body: desc.slice(0, 80) || '',
        cta:  `🔗 full episode — link in bio`,
      };
      if (tp === 'twitter') return {
        hook: title ? `🎙️ New episode: "${title}"` : `🎙️ New podcast episode out`,
        body: desc.slice(0, 80) || '',
        cta:  `Listen 🔗`,
      };
      if (tp === 'youtube') return {
        hook: title ? `New Episode: "${title}"` : `New Podcast Episode — Out Now`,
        body: desc || `Listen to the full episode. Subscribe and leave a comment!`,
        cta:  `🔔 Subscribe for new episodes every week!`,
      };
      if (tp === 'linkedin') return {
        hook: title ? `New podcast episode: "${title}"` : `New podcast episode out now`,
        body: desc || `Diving deep into topics that matter for artists and creators.`,
        cta:  `Listen in the link below.`,
      };
      if (tp === 'threads') return {
        hook: title ? `new episode: "${title}" 🎙️` : `new podcast episode just dropped 🎙️`,
        body: desc.slice(0, 80) || '',
        cta:  `link in bio`,
      };
      if (tp === 'facebook') return {
        hook: title ? `🎙️ New podcast episode: "${title}"` : `🎙️ New podcast episode!`,
        body: desc || `We covered so much ground in this one. Whether you're an artist, producer, or music fan — this episode is for you. Drop your thoughts in the comments!`,
        cta:  `Listen on ${platform} 🎙️ Link in comments!`,
      };
      return {
        hook: title ? `🎙️ New episode: "${title}"` : `🎙️ New podcast episode out now!`,
        body: desc || 'Listen to the latest episode — link in bio!',
        cta:  `Listen on ${platform} 🎙️ Link in bio!`,
      };
    }

    case 'event': {
      if (tp === 'tiktok') return {
        hook: title ? `🎟️ get your tickets NOW for "${title}" before they sell out` : `🎟️ tickets dropping NOW — don't miss this`,
        body: desc.slice(0, 80) || `these go FAST`,
        cta:  `🔗 grab tickets — link in bio`,
      };
      if (tp === 'twitter') return {
        hook: title ? `🎟️ ${title}` : `🎟️ Tickets on sale now`,
        body: desc.slice(0, 80) || '',
        cta:  `Get yours 🔗`,
      };
      if (tp === 'youtube') return {
        hook: title ? `Live Event: "${title}" — Get Your Tickets Now` : `Live Event — Tickets Available Now`,
        body: desc || `Don't miss this live experience. Tickets available now. Subscribe for tour updates!`,
        cta:  `🔔 Subscribe for announcements and upcoming dates!`,
      };
      if (tp === 'linkedin') return {
        hook: title ? `Excited to announce: "${title}"` : `Event announcement`,
        body: desc || `This is going to be an incredible experience. Come join us.`,
        cta:  `Tickets available — link in comments.`,
      };
      if (tp === 'threads') return {
        hook: title ? `"${title}" 🎟️` : `tickets are up 🎟️`,
        body: desc.slice(0, 80) || `get em before they're gone`,
        cta:  `link in bio`,
      };
      if (tp === 'facebook') return {
        hook: title ? `🎟️ Tickets are LIVE for "${title}"!` : `🎟️ Tickets are on sale now!`,
        body: desc || `Don't wait — these tickets WILL sell out. Tag a friend you want to come with and grab your tickets now!`,
        cta:  `Get your tickets on ${platform} 🎟️ Link in comments!`,
      };
      return {
        hook: title ? `🎟️ ${title}` : `🎟️ Tickets on sale now!`,
        body: desc || 'Get your tickets before they sell out!',
        cta:  `Grab tickets on ${platform} 🎟️ Link in bio!`,
      };
    }

    case 'press': {
      if (tp === 'tiktok') return {
        hook: title ? `🗞️ they wrote about me "${title}" and I'm not okay` : `🗞️ press feature just dropped and I'm emotional`,
        body: author ? `shoutout ${author} for the love` : `grateful for the coverage`,
        cta:  `🔗 read the full article — link in bio`,
      };
      if (tp === 'twitter') return {
        hook: title ? `📰 "${title}"` : `📰 Press feature just dropped`,
        body: author ? `via ${author}` : '',
        cta:  `Read it 🔗`,
      };
      if (tp === 'youtube') return {
        hook: title ? `Press Feature: "${title}"` : `Press Feature — Read Now`,
        body: desc || (author ? `Written by ${author}` : '') || `Read the full article. Subscribe for more updates!`,
        cta:  `🔔 Subscribe for more news and updates!`,
      };
      if (tp === 'linkedin') return {
        hook: title ? `Honored to be featured: "${title}"` : `Exciting press coverage`,
        body: desc || (author ? `A thoughtful piece by ${author}` : '') || `Grateful for the recognition and the opportunity to share my story.`,
        cta:  `Read the full feature — link in comments.`,
      };
      if (tp === 'threads') return {
        hook: title ? `"${title}" 📰` : `press feature just went up 📰`,
        body: author ? `written by ${author}` : '',
        cta:  `link in bio`,
      };
      if (tp === 'facebook') return {
        hook: title ? `📰 Just got featured: "${title}"` : `📰 Press feature just dropped!`,
        body: desc || (author ? `Thank you to ${author} for this incredible piece. Read the full article and let me know what you think!` : `So grateful for this feature. Read the full article — link below!`),
        cta:  `Read on ${platform} 📰 Link in comments!`,
      };
      return {
        hook: title ? `📰 "${title}"` : `📰 Press feature just dropped!`,
        body: desc || (author ? `Review by ${author}` : '') || `Read the full feature — link in bio!`,
        cta:  `Read on ${platform} 📰 Link in bio!`,
      };
    }

    case 'ecommerce': {
      if (tp === 'tiktok') return {
        hook: title ? `🛍️ the "${title}" drop is HERE and it's selling OUT` : `🛍️ new merch drop and it's going FAST`,
        body: `get it before it's gone 🔥`,
        cta:  `🔗 shop now — link in bio`,
      };
      if (tp === 'twitter') return {
        hook: title ? `🛍️ ${title} — just dropped` : `🛍️ New merch drop`,
        body: '',
        cta:  `Shop now 🔗`,
      };
      if (tp === 'youtube') return {
        hook: title ? `New Merch Drop: "${title}" — Available Now` : `New Merch — Shop Now`,
        body: desc || `Grab the latest before it sells out. Subscribe for future drops!`,
        cta:  `🔔 Subscribe for exclusive drops and announcements!`,
      };
      if (tp === 'linkedin') return {
        hook: title ? `New merchandise available: "${title}"` : `New merchandise drop`,
        body: desc || `Excited to share the latest merch drop with the community.`,
        cta:  `Shop now — link in comments.`,
      };
      if (tp === 'threads') return {
        hook: title ? `"${title}" merch is live 🛍️` : `new merch just dropped 🛍️`,
        body: desc.slice(0, 80) || `grab it before it's gone`,
        cta:  `link in bio`,
      };
      if (tp === 'facebook') return {
        hook: title ? `🛍️ NEW DROP: "${title}" is available NOW!` : `🛍️ New merch just dropped!`,
        body: desc || `We worked hard on this and I think you're going to love it. Quantities are limited — don't sleep on this! Tag someone who needs this in their life.`,
        cta:  `Shop now 🛍️ Link in comments!`,
      };
      return {
        hook: title ? `🛍️ ${title}` : `🛍️ New merch drop!`,
        body: desc || 'Shop the latest — link in bio!',
        cta:  `Shop now 🛍️ Link in bio!`,
      };
    }

    case 'article': {
      if (tp === 'tiktok') return {
        hook: title ? `📖 "${title}" — read this if you care about your music career` : `📖 this article on music is required reading`,
        body: author ? `by ${author}` : '',
        cta:  `🔗 link in bio`,
      };
      if (tp === 'twitter') return {
        hook: title ? `✍️ "${title}"` : `✍️ New post just went live`,
        body: author ? `by ${author}` : '',
        cta:  `Read 🔗`,
      };
      if (tp === 'youtube') return {
        hook: title ? `Read This: "${title}"` : `New Article — Read Now`,
        body: desc || (author ? `by ${author}` : '') || `New content out now. Subscribe for more!`,
        cta:  `🔔 Subscribe for regular content and updates!`,
      };
      if (tp === 'linkedin') return {
        hook: title ? `Worth reading: "${title}"` : `New article I think you should read`,
        body: desc || (author ? `Written by ${author}` : '') || `Insightful read for anyone in the music industry.`,
        cta:  `Full article in the comments.`,
      };
      if (tp === 'threads') return {
        hook: title ? `"${title}" ✍️` : `new post just went live ✍️`,
        body: desc.slice(0, 80) || '',
        cta:  `link in bio`,
      };
      if (tp === 'facebook') return {
        hook: title ? `✍️ New article: "${title}"` : `✍️ New post just went live!`,
        body: desc || (author ? `Written by ${author}` : '') || `Really proud of this one. Read it and let me know what you think in the comments!`,
        cta:  `Read more ✍️ Link in comments!`,
      };
      return {
        hook: title ? `✍️ "${title}"` : `✍️ New post just went live!`,
        body: desc || (author ? `Written by ${author}` : '') || 'Read it — link in bio!',
        cta:  `Read more ✍️ Link in bio!`,
      };
    }

    default: {
      if (tp === 'tiktok') return {
        hook: title ? `check this out "${title}" 🔗` : `you need to see this 🔗`,
        body: desc.slice(0, 60) || '',
        cta:  `link in bio`,
      };
      if (tp === 'twitter') return {
        hook: title ? `🔗 ${title}` : `🔗 Check this out`,
        body: '',
        cta:  `🔗`,
      };
      if (tp === 'linkedin') return {
        hook: title || `Worth sharing`,
        body: desc || `Sharing this with my network.`,
        cta:  platform ? `More on ${platform} — link in comments.` : `Link in comments.`,
      };
      if (tp === 'threads') return {
        hook: title || `look at this`,
        body: desc.slice(0, 80) || '',
        cta:  `link in bio`,
      };
      if (tp === 'facebook') return {
        hook: title ? `🔗 ${title}` : `🔗 Check this out!`,
        body: desc || `Sharing this with all of you. Let me know your thoughts in the comments!`,
        cta:  platform ? `Visit on ${platform} 🔗 Link in comments!` : `🔗 Link in comments!`,
      };
      return {
        hook: title ? `🔗 ${title}` : `🔗 Check this out!`,
        body: desc || 'Link in bio!',
        cta:  platform ? `Visit on ${platform} 🔗 Link in bio!` : '🔗 Link in bio!',
      };
    }
  }
}

async function localAnalyzeUrl(
  url: string,
  req: GenerationRequest,
  platformRulesSubset: Record<string, PlatformRules>,
): Promise<any> {
  const ctx  = classifyUrl(url);
  const meta = await fetchUrlMetadata(url, ctx);

  const title    = meta.title ?? '';
  const desc     = meta.description ?? '';
  const siteName = meta.siteName ?? ctx.platform;

  // Generate shared (generic) copy and per-platform differentiated copy
  const copy = buildCopyFromContext(ctx, { ...meta, siteName }, req.intent ?? 'promote');
  const perPlatformCopy: Record<string, { hook: string; body: string; cta: string }> = {};
  for (const p of req.platforms) {
    perPlatformCopy[p] = buildCopyFromContext(ctx, { ...meta, siteName }, req.intent ?? 'promote', p);
  }

  const summary = [title, desc.slice(0, 120)].filter(Boolean).join(' — ')
               || `${ctx.category === 'event' ? 'Upcoming event' : 'New content'} on ${siteName || url}`;

  logger.info(`[MultimodalGen] URL analyzed: category=${ctx.category} title="${title || '(none)'}" platform=${siteName || ctx.platform}`);

  return {
    summary,
    hook:        copy.hook,
    body:        copy.body,
    cta:         copy.cta,
    perPlatformCopy,
    title,
    description: desc,
    siteName,
    author:      meta.author,
    imageUrl:    meta.image,
    publishDate: meta.publishDate,
    sourceUrl:   url,
    urlCategory: ctx.category,
    modality:    'url',
    platforms:   req.platforms,
    intent:      req.intent,
    metadata:    { ...(req.input.metadata || {}), sourceUrl: url, title, siteName, urlCategory: ctx.category },
    platformRules: platformRulesSubset,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

async function normalizeInput(req: GenerationRequest): Promise<any> {
  const platformRulesSubset = req.platforms.reduce<Record<string, PlatformRules>>((acc, p) => {
    acc[p] = getRules(p);
    return acc;
  }, {});

  try {
    return await maxcorePost('/analyze', {
      modality: req.input.modality,
      payload: req.input.payload,
      artistProfileId: req.artistProfileId,
      platforms: req.platforms,
      intent: req.intent,
      metadata: req.input.metadata,
      platformRules: platformRulesSubset,
    });
  } catch (err) {
    logger.warn('[MultimodalGen] MaxCore /analyze unavailable, using local fallback:', err instanceof Error ? err.message : String(err));

    // For URL inputs: fetch the page and extract real metadata
    const payload = req.input.payload ?? '';
    if (req.input.modality === 'url' && /^https?:\/\//i.test(payload)) {
      try {
        return await localAnalyzeUrl(payload, req, platformRulesSubset);
      } catch (urlErr) {
        logger.warn('[MultimodalGen] URL metadata fetch failed:', urlErr instanceof Error ? urlErr.message : String(urlErr));
      }
    }

    return {
      summary:  payload,
      modality: req.input.modality,
      platforms: req.platforms,
      intent:   req.intent,
      metadata: req.input.metadata || {},
      platformRules: platformRulesSubset,
    };
  }
}

function buildStepParamsForPlatform(
  platform: Platform,
  modality: 'text' | 'image' | 'audio' | 'video',
  slotId?: string,
  purpose?: string,
): Record<string, any> {
  const rules = getRules(platform);
  const base: Record<string, any> = { platform, slotId, purpose };

  if (modality === 'text') {
    base.maxLength = rules.text.maxLength ?? rules.text.descriptionMax ?? 5000;
    base.recommendedLength = rules.text.recommendedLength;
    base.tone = rules.text.tone;
    base.hashtagsAllowed = rules.text.hashtags?.allowed ?? false;
    base.maxHashtags = rules.text.hashtags?.allowed ? (rules.text.hashtags.max ?? 5) : 0;
    if (platform === 'youtube') {
      base.titleMax = rules.text.titleMax;
      base.descriptionMax = rules.text.descriptionMax;
    }
  } else if (modality === 'image') {
    base.aspectRatios = rules.image.aspectRatios;
    base.recommendedAspectRatio = rules.image.recommended ?? rules.image.aspectRatios[0];
  } else if (modality === 'video') {
    base.aspectRatios = rules.video.aspectRatios;
    base.recommendedAspectRatio = rules.video.aspectRatios[0];
    base.maxDurationSec = rules.video.maxDurationSec;
    base.recommendedDurationSec = rules.video.recommendedDurationSec ?? rules.video.recommendedShortSec;
    base.requiresHook = rules.video.requiresHook ?? false;
  } else if (modality === 'audio') {
    base.voiceover = rules.audio.voiceover;
    base.maxDurationSec = rules.audio.maxDurationSec;
    base.audioStyle = rules.audio.style ?? rules.audio.tone ?? [];
  }

  return base;
}

async function planTasks(normalized: any, req: GenerationRequest): Promise<TaskPlan> {
  const packSpec = req.packId ? PACK_DEFINITIONS[req.packId] ?? null : null;

  const platformRulesForPack = req.platforms.reduce<Record<string, PlatformRules>>((acc, p) => {
    acc[p] = getRules(p);
    return acc;
  }, {});

  try {
    const raw = await maxcorePost('/generate/text', {
      mode: 'planner',
      system: `
        You are a content orchestration planner for music artists.
        You receive normalized content, target platforms, an optional packSpec, and per-platform rules.
        Use the platformRules to set accurate constraints (character limits, aspect ratios, durations, tone, hashtag rules) in each step's params.
        Output ONLY a JSON TaskPlan:
        {
          "steps": [
            {
              "id": "step_1",
              "type": "generate",
              "worker": "text",
              "inputFrom": "normalizedInput",
              "params": {
                "platform": "<platform>",
                "slotId": "<slotId>",
                "maxLength": <n>,
                "recommendedLength": <n>,
                "tone": ["<tone>"],
                "hashtagsAllowed": <bool>,
                "maxHashtags": <n>,
                "aspectRatio": "<ratio>",
                "maxDurationSec": <n>,
                "requiresHook": <bool>
              }
            }
          ]
        }
        Group text assets into one step and image assets into one step.
        For audio/video slots, create individual steps per slot.
      `,
      input: {
        normalized,
        request: req,
        packSpec,
        platformRules: platformRulesForPack,
      },
    });
    const text = typeof raw === 'string' ? raw : (raw.text || raw.content || JSON.stringify(raw));
    const planJson = safeExtractJson(text);
    return validateTaskPlan(planJson, req.id);
  } catch (err) {
    logger.warn('[MultimodalGen] MaxCore planner failed, building default plan:', err);
    return buildDefaultPlan(req);
  }
}

function buildDefaultPlan(req: GenerationRequest): TaskPlan {
  const packSpec = req.packId ? PACK_DEFINITIONS[req.packId] ?? null : null;
  const steps: TaskStep[] = [];

  if (packSpec) {
    const textSlots = packSpec.filter(s => s.modality === 'text');
    const imageSlots = packSpec.filter(s => s.modality === 'image');
    const audioSlots = packSpec.filter(s => s.modality === 'audio');
    const videoSlots = packSpec.filter(s => s.modality === 'video');

    if (textSlots.length > 0) {
      steps.push({
        id: 'step_text',
        type: 'generate',
        worker: 'text',
        inputFrom: 'normalizedInput',
        params: {
          slots: textSlots.map(slot => ({
            ...slot,
            ...buildStepParamsForPlatform(slot.platform as Platform, 'text', slot.id, slot.purpose),
          })),
        },
      });
    }

    if (imageSlots.length > 0) {
      steps.push({
        id: 'step_image',
        type: 'generate',
        worker: 'image',
        inputFrom: 'normalizedInput',
        params: {
          slots: imageSlots.map(slot => ({
            ...slot,
            ...buildStepParamsForPlatform(slot.platform as Platform, 'image', slot.id, slot.purpose),
          })),
        },
      });
    }

    for (const slot of audioSlots) {
      steps.push({
        id: `step_audio_${slot.id}`,
        type: 'generate',
        worker: 'audio',
        inputFrom: 'normalizedInput',
        params: buildStepParamsForPlatform(slot.platform as Platform, 'audio', slot.id, slot.purpose),
      });
    }

    for (const slot of videoSlots) {
      steps.push({
        id: `step_video_${slot.id}`,
        type: 'generate',
        worker: 'video',
        inputFrom: 'normalizedInput',
        params: buildStepParamsForPlatform(slot.platform as Platform, 'video', slot.id, slot.purpose),
      });
    }
  } else {
    const rawModality = (req.constraints?.outputModality as string) || 'text';
    const outputModality: 'text' | 'image' | 'audio' | 'video' =
      ['text', 'image', 'audio', 'video'].includes(rawModality)
        ? (rawModality as 'text' | 'image' | 'audio' | 'video')
        : 'text';

    if (outputModality === 'image') {
      const imageSlots = req.platforms.map(p => ({
        id: `${p}_image`,
        platform: p,
        modality: 'image',
        purpose: 'Platform image creative',
      }));
      steps.push({
        id: 'step_image',
        type: 'generate',
        worker: 'image',
        inputFrom: 'normalizedInput',
        params: {
          slots: imageSlots.map(slot => ({
            ...slot,
            ...buildStepParamsForPlatform(slot.platform as Platform, 'image', slot.id, slot.purpose),
          })),
        },
      });
    } else if (outputModality === 'audio') {
      for (const platform of req.platforms) {
        steps.push({
          id: `step_audio_${platform}`,
          type: 'generate',
          worker: 'audio',
          inputFrom: 'normalizedInput',
          params: buildStepParamsForPlatform(platform, 'audio', `${platform}_audio`, 'Audio voiceover'),
        });
      }
    } else if (outputModality === 'video') {
      for (const platform of req.platforms) {
        steps.push({
          id: `step_video_${platform}`,
          type: 'generate',
          worker: 'video',
          inputFrom: 'normalizedInput',
          params: buildStepParamsForPlatform(platform, 'video', `${platform}_video`, 'Video content'),
        });
      }
    } else {
      for (const platform of req.platforms) {
        steps.push({
          id: `step_text_${platform}`,
          type: 'generate',
          worker: 'text',
          inputFrom: 'normalizedInput',
          params: buildStepParamsForPlatform(platform, 'text'),
        });
      }
    }
  }

  if (steps.length === 0) {
    steps.push({
      id: 'step_text_default',
      type: 'generate',
      worker: 'text',
      inputFrom: 'normalizedInput',
      params: buildStepParamsForPlatform(req.platforms[0] ?? 'instagram', 'text'),
    });
  }

  return { requestId: req.id, steps };
}

function buildLocalTextAssets(
  rawSlots: any[],
  inputs: any,
  req: GenerationRequest,
): GeneratedAsset[] {
  const normalized = inputs?.normalized ?? {};
  const summary: string = typeof normalized.summary === 'string'
    ? normalized.summary
    : (typeof req.input?.payload === 'string' ? req.input.payload.slice(0, 280) : '');
  const hook: string = normalized.hook ?? (summary.slice(0, 100) || req.intent || 'New music out now');
  const body: string = normalized.body ?? (summary || hook);
  const cta:  string = normalized.cta  ?? 'Stream now 🎵';
  const artist: string = normalized.artistName ?? '';

  const TEMPLATES: Record<string, (h: string, b: string, c: string, a: string, tags: string) => string> = {
    instagram:       (h, b, c, a, tags) => `${h}\n\n${b}\n\n${c}${a ? ` | ${a}` : ''}${tags}`,
    tiktok:          (h, _b, c, _a, tags) => `${h} ${c}${tags}`,
    twitter:         (h, _b, c, _a, _tags) => `${h} ${c}`.trim(),
    threads:         (h, b, c, _a, _tags) => `${h}\n\n${c}${b ? `\n${b}` : ''}`,
    facebook:        (h, b, c, a, tags) => `${h}\n\n${b}\n\n${c}${a ? `\n\n— ${a}` : ''}${tags}`,
    youtube:         (h, b, c, _a, _tags) => `${h}\n\n${b}\n\n${c}\n\nSubscribe for more 🔔`,
    linkedin:        (h, b, c, a, _tags) => `${a ? `${a} | ` : ''}${h}\n\n${b}\n\n${c}`,
    google_business: (h, b, c, _a, _tags) => `${h}\n\n${b}\n\n${c}`,
  };

  return rawSlots.map((slot: any) => {
    const platform = (slot.platform ?? req.platforms[0]) as Platform;
    const rules = platform ? getRules(platform) : null;

    // Use per-platform differentiated copy if available (from localAnalyzeUrl)
    const perCopy = normalized.perPlatformCopy?.[platform];
    const platformHook = perCopy?.hook ?? hook;
    const platformBody = perCopy?.body ?? body;
    const platformCta  = perCopy?.cta  ?? cta;

    // Dynamic hashtags: respect platform rules for allowed count
    const maxHashtags = rules?.text.hashtags?.allowed ? (rules.text.hashtags.max ?? 5) : 0;
    const tags = getHashtagsForPlatform(
      normalized.urlCategory ?? 'social_post',
      platform,
      maxHashtags,
      artist || undefined,
    );

    const tplFn = TEMPLATES[platform] ?? TEMPLATES.instagram;
    let payload = tplFn(platformHook, platformBody, platformCta, artist, tags);
    if (rules) payload = enforceTextLength(payload, rules.text);
    const enriched = rules
      ? enrichTextAssetMetadata(payload, platform, rules, {
          platformRules: rules.text,
          hook: platformHook,
          body: platformBody,
          cta:  platformCta,
        })
      : {};
    return {
      id: randomUUID(),
      modality: 'text' as OutputModality,
      payload,
      platform,
      slotId:  slot.id,
      purpose: slot.purpose ?? 'Post copy',
      metadata: { ...enriched, source: 'local' },
    };
  });
}

const textWorker = {
  async run(step: TaskStep, inputs: any, req: GenerationRequest): Promise<GeneratedAsset[]> {
    const packSpec = req.packId ? PACK_DEFINITIONS[req.packId] ?? null : null;
    const rawSlots = step.params?.slots || (step.params?.platform
      ? [{ id: `${step.params.platform}_post`, platform: step.params.platform, modality: 'text', purpose: 'Post copy' }]
      : packSpec?.filter(s => s.modality === 'text') || [{ id: 'post', platform: req.platforms[0], modality: 'text', purpose: 'Post copy' }]);

    const slotsWithRules = rawSlots.map((slot: any) => ({
      ...slot,
      platformRules: getRules(slot.platform as Platform)?.text ?? null,
    }));

    try {
      const result = await maxcorePost('/generate/text', {
        mode: 'content',
        step,
        inputs,
        slots: slotsWithRules,
        constraints: req.constraints,
        artistProfileId: req.artistProfileId,
        intent: req.intent,
        platformRules: Object.fromEntries(
          req.platforms.map(p => [p, getRules(p).text])
        ),
      });

      const outputs = Array.isArray(result.outputs) ? result.outputs : [];
      if (outputs.length === 0) return buildLocalTextAssets(rawSlots, inputs, req);

      return outputs.map((o: any) => {
        const rules = o.platform ? getRules(o.platform as Platform) : null;
        let payload: string = o.text || o.content || '';
        if (rules) payload = enforceTextLength(payload, rules.text);
        const enriched = rules
          ? enrichTextAssetMetadata(payload, o.platform, rules, { ...(o.meta ?? {}), platformRules: rules.text })
          : { ...(o.meta ?? {}), platformRules: null };
        return {
          id: randomUUID(),
          modality: 'text' as OutputModality,
          payload,
          platform: o.platform as Platform | undefined,
          slotId: o.slotId,
          purpose: o.purpose,
          metadata: enriched,
        };
      });
    } catch (err) {
      logger.warn('[MultimodalGen] MaxCore /generate/text unavailable, using local fallback:', err instanceof Error ? err.message : String(err));
      return buildLocalTextAssets(rawSlots, inputs, req);
    }
  },
};

const PLATFORM_OPTIMAL_TIMES: Record<string, string> = {
  instagram:      '6–9 PM local',
  facebook:       '1–4 PM local',
  tiktok:         '7–9 PM local',
  youtube:        '2–4 PM EST',
  linkedin:       '10 AM–12 PM local',
  threads:        '9 AM or 8 PM local',
  google_business:'9–11 AM local',
};

function enrichTextAssetMetadata(
  payload: string,
  platform: string,
  rules: PlatformRules,
  existingMeta: Record<string, any> = {},
): Record<string, any> {
  const hashtagRegex = /#[\w\u0080-\uFFFF]+/g;
  const extractedHashtags: string[] = payload.match(hashtagRegex) ?? [];
  const cleanText = payload.replace(hashtagRegex, '').trim();

  const emojiRegex = /\p{Emoji_Presentation}|\p{Emoji}\uFE0F/gu;
  const emojiCount = (payload.match(emojiRegex) ?? []).length;
  const wordCount = cleanText.split(/\s+/).filter(Boolean).length;
  const charCount = payload.length;
  const charLimit = rules.text.maxCharCount ?? null;

  let hook: string | undefined = existingMeta.hook;
  let body: string | undefined = existingMeta.body;
  let cta: string | undefined  = existingMeta.cta;

  if (!hook && !body && !cta && cleanText) {
    const paragraphs = cleanText.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
    if (paragraphs.length >= 3) {
      hook = paragraphs[0];
      cta  = paragraphs[paragraphs.length - 1];
      body = paragraphs.slice(1, -1).join('\n\n');
    } else if (paragraphs.length === 2) {
      hook = paragraphs[0];
      body = paragraphs[1];
    } else {
      const sentences = cleanText.split(/(?<=[.!?])\s+/);
      if (sentences.length >= 2) {
        hook = sentences[0];
        body = sentences.slice(1).join(' ');
      }
    }
    if (body) {
      const ctaKw = /\b(subscribe|follow|check out|stream now|listen now|tap|click|link in bio|watch|download|buy|shop|join|sign up|get it|available now|out now)\b/i;
      const lines = body.split('\n');
      const ctaIdx = lines.map((l, i) => ({ l, i })).filter(({ l }) => ctaKw.test(l)).pop()?.i ?? -1;
      if (ctaIdx > 0) {
        cta  = lines.slice(ctaIdx).join('\n').trim();
        body = lines.slice(0, ctaIdx).join('\n').trim();
      }
    }
  }

  // Platform-calibrated engagement scoring
  let score = 50;
  const suggestions: string[] = [];

  switch (platform) {
    case 'tiktok':
      // TikTok: hook-first wins, keep it SHORT, 1–2 emojis max, a few hashtags
      if (hook) score += 20; else suggestions.push('Start with a viral hook in the first 5 words to stop the scroll');
      if (wordCount <= 15) score += 15; else if (wordCount > 25) suggestions.push('Keep TikTok captions under 15 words for best performance');
      if (emojiCount >= 1 && emojiCount <= 3) score += 10; else if (emojiCount === 0) suggestions.push('Add 1–2 trending emojis');
      if (extractedHashtags.length >= 2 && extractedHashtags.length <= 5) score += 5;
      if (cta) score += 10; else suggestions.push('Add a "link in bio" or "follow for more" CTA');
      break;

    case 'instagram':
      // Instagram: hashtags are essential (5–8 optimal), emoji adds flair, hook + CTA needed
      if (hook) score += 10; else suggestions.push('Open with an attention-grabbing first line');
      if (extractedHashtags.length >= 5) score += 20;
      else if (extractedHashtags.length >= 2) score += 10;
      else suggestions.push('Add 5–8 hashtags for maximum Instagram reach');
      if (emojiCount >= 2 && emojiCount <= 8) score += 10; else if (emojiCount === 0) suggestions.push('Add 2–4 emojis to boost visual appeal');
      if (cta) score += 10; else suggestions.push('Add "Link in bio" to drive traffic');
      if (wordCount >= 20 && wordCount <= 150) score += 10;
      break;

    case 'facebook':
      // Facebook: conversational, moderate length, story-driven
      if (hook) score += 10; else suggestions.push('Start with an engaging personal statement or question');
      if (wordCount >= 20 && wordCount <= 80) score += 15; else if (wordCount < 10) suggestions.push('Expand the post — Facebook users engage more with 40–80 word posts');
      if (emojiCount >= 1 && emojiCount <= 5) score += 10; else if (emojiCount > 8) suggestions.push('Too many emojis can reduce Facebook reach — keep it to 3–5');
      if (cta) score += 15; else suggestions.push('Add a call-to-action directing users to the link in comments');
      if (extractedHashtags.length <= 3) score += 5;
      else if (extractedHashtags.length > 5) suggestions.push('Facebook posts perform best with 1–3 hashtags');
      break;

    case 'twitter':
      // Twitter/X: punchy, witty, under 240 chars is ideal, 1–2 hashtags only
      if (charCount <= 240) score += 20; else if (charCount > 270) suggestions.push('Keep tweets under 240 characters for best engagement');
      if (hook) score += 20; else suggestions.push('Lead with your most interesting point — no warmup needed on X');
      if (extractedHashtags.length <= 2) score += 10; else suggestions.push('1–2 hashtags max on X/Twitter — more reduces engagement');
      if (cta) score += 10;
      break;

    case 'linkedin':
      // LinkedIn: professional, insightful, longer is OK, minimal emoji, strong hook
      if (hook) score += 20; else suggestions.push('Open with a bold professional insight or surprising statistic');
      if (wordCount >= 50) score += 15; else suggestions.push('LinkedIn posts with 150+ words see 3x more engagement');
      if (emojiCount <= 2) score += 10; else suggestions.push('Reduce emojis for a more professional and credible tone');
      if (cta) score += 15; else suggestions.push('End with a question or CTA to drive comments');
      if (extractedHashtags.length >= 2 && extractedHashtags.length <= 5) score += 5; else if (extractedHashtags.length === 0) suggestions.push('Add 3–5 professional hashtags to increase discoverability');
      break;

    case 'youtube':
      // YouTube: SEO-rich description, subscribe CTA is critical, keyword density matters
      if (/subscribe|🔔/i.test(payload)) score += 25; else suggestions.push('Always include a subscribe + notification bell CTA for YouTube');
      if (wordCount >= 30) score += 15; else suggestions.push('YouTube descriptions should be 100–300 words for SEO');
      if (hook) score += 15; else suggestions.push('Put key info and keywords in the first 2 sentences of your description');
      if (cta) score += 10;
      if (emojiCount >= 1 && emojiCount <= 6) score += 5;
      break;

    case 'threads':
      // Threads: casual, authentic, conversational — NO hashtags, minimal emoji
      if (extractedHashtags.length === 0) score += 15; else suggestions.push('Threads performs better without hashtags — remove them');
      if (emojiCount <= 3) score += 10; else suggestions.push('Keep it casual — max 2–3 emojis on Threads');
      if (wordCount >= 10 && wordCount <= 60) score += 15; else if (wordCount > 100) suggestions.push('Shorter, more conversational posts work best on Threads');
      if (hook) score += 10;
      break;

    case 'google_business':
      // Google Business: professional, local, clear action CTA
      if (cta) score += 25; else suggestions.push('Google Business posts must include a clear action (Visit, Call, Book)');
      if (wordCount >= 20 && wordCount <= 100) score += 15;
      if (hook) score += 10;
      if (extractedHashtags.length === 0) score += 10; else suggestions.push('Google Business posts do not use hashtags');
      break;

    default:
      if (emojiCount >= 1 && emojiCount <= 5) score += 10;
      if (extractedHashtags.length > 0 && extractedHashtags.length <= 10) score += 10;
      if (wordCount >= 15 && wordCount <= 60) score += 10;
      if (hook) score += 10;
      if (cta)  score += 10;
      if (emojiCount === 0) suggestions.push('Add 1–3 emojis to increase engagement');
      if (extractedHashtags.length === 0) suggestions.push('Include relevant hashtags');
      if (!cta) suggestions.push('Add a clear call-to-action');
      if (wordCount < 10) suggestions.push('Expand content for better reach');
  }

  if (charLimit && charCount > charLimit * 0.9) suggestions.push('Near character limit — consider trimming');
  score = Math.min(100, score);

  const positive = /\b(amazing|excited|love|great|best|awesome|happy|proud|thrilled|celebrate|new|launch|drop|release)\b/i;
  const negative = /\b(struggle|hard|difficult|bad|fail|problem|issue|concern)\b/i;
  const sentimentLabel = positive.test(payload) ? 'positive' : negative.test(payload) ? 'negative' : 'neutral';

  return {
    ...existingMeta,
    hook: hook ?? existingMeta.hook,
    body: body ?? existingMeta.body,
    cta:  cta  ?? existingMeta.cta,
    hashtags:      existingMeta.hashtags ?? (extractedHashtags.length > 0 ? extractedHashtags : undefined),
    charCount,
    charLimit,
    wordCount,
    emojiCount,
    engagementScore: score,
    sentimentLabel,
    suggestions,
    optimalPostTime: existingMeta.optimalPostTime ?? PLATFORM_OPTIMAL_TIMES[platform] ?? '6 PM local',
  };
}

const imageWorker = {
  async run(step: TaskStep, inputs: any, req: GenerationRequest): Promise<GeneratedAsset[]> {
    const slots = step.params?.slots || [];
    const slotsWithRules = slots.map((slot: any) => ({
      ...slot,
      platformRules: getRules(slot.platform as Platform)?.image ?? null,
    }));

    const mapOutputs = (outputs: any[]) => outputs.map((o: any) => ({
      id: randomUUID(),
      modality: 'image' as OutputModality,
      payload: o.url || o.src || '',
      platform: o.platform as Platform | undefined,
      slotId: o.slotId,
      purpose: o.purpose,
      metadata: {
        ...(o.meta ?? {}),
        aspectRatio: o.aspectRatio ?? step.params?.recommendedAspectRatio,
        platformRules: o.platform ? getRules(o.platform as Platform).image : null,
      },
    }));

    try {
      const result = await maxcorePost('/generate/image', {
        step,
        inputs,
        slots: slotsWithRules,
        constraints: req.constraints,
        artistProfileId: req.artistProfileId,
        intent: req.intent,
        platformRules: Object.fromEntries(
          req.platforms.map(p => [p, getRules(p).image])
        ),
      });
      const outputs = Array.isArray(result.outputs) ? result.outputs : [];
      if (outputs.length > 0) return mapOutputs(outputs);
    } catch (err) {
      logger.warn('[MultimodalGen] MaxCore /generate/image unavailable, using local fallback:', err instanceof Error ? err.message : String(err));
    }

    // Local fallback: Sharp-based image generation
    const normalized = inputs?.normalized ?? {};
    const prompt = normalized.summary ?? req.input?.payload ?? req.intent ?? 'music artist promotional image';
    const platform = (step.params?.platform ?? req.platforms[0]) as Platform;
    const rules = getRules(platform);
    try {
      const img = await sharpImageService.generateImage({
        prompt: String(prompt).slice(0, 200),
        platform,
        tone: (req.constraints as any)?.tone ?? 'creative',
      });
      return [{
        id: randomUUID(),
        modality: 'image' as OutputModality,
        payload: img.publicUrl,
        platform,
        metadata: {
          aspectRatio: step.params?.recommendedAspectRatio ?? rules.image.aspectRatios?.[0],
          platformRules: rules.image,
          source: 'local-sharp',
        },
      }];
    } catch (sharpErr) {
      logger.warn('[MultimodalGen] Sharp image fallback also failed:', sharpErr instanceof Error ? sharpErr.message : String(sharpErr));
      return [];
    }
  },
};

const audioWorker = {
  async run(step: TaskStep, inputs: any, req: GenerationRequest): Promise<GeneratedAsset[]> {
    const platform = step.params?.platform as Platform | undefined;
    const audioRules = platform ? getRules(platform).audio : null;

    try {
      const result = await maxcorePost('/generate/audio', {
        step,
        inputs,
        constraints: req.constraints,
        artistProfileId: req.artistProfileId,
        intent: req.intent,
        platformRules: audioRules,
      });
      const outputs = Array.isArray(result.outputs) ? result.outputs : [];
      if (outputs.length > 0) {
        return outputs.map((o: any) => ({
          id: randomUUID(),
          modality: 'audio' as OutputModality,
          payload: o.url || '',
          platform: o.platform as Platform | undefined,
          slotId: o.slotId,
          metadata: {
            ...(o.meta ?? {}),
            maxDurationSec: audioRules?.maxDurationSec,
            platformRules: audioRules,
          },
        }));
      }
    } catch (err) {
      logger.warn('[MultimodalGen] MaxCore /generate/audio unavailable — no local audio fallback available:', err instanceof Error ? err.message : String(err));
    }
    // No local audio generation available; return empty (video worker handles audio via FFmpeg)
    return [];
  },
};

const videoWorker = {
  async run(step: TaskStep, inputs: any, req: GenerationRequest): Promise<GeneratedAsset[]> {
    const platform = step.params?.platform as Platform | undefined;
    const videoRules = platform ? getRules(platform).video : null;

    // MaxCore does not expose a /generate/video endpoint — use the local
    // FFmpeg-based generator instead.
    const normalized = inputs?.normalized ?? {};
    const summary: string = typeof normalized.summary === 'string' ? normalized.summary : '';
    const genre: string = normalized.genre ?? req.constraints?.genre ?? 'default';

    const result = await generateVideoFFmpeg({
      topic:        summary.slice(0, 120) || req.intent || 'new music',
      platform:     platform ?? (req.platforms[0] as any) ?? 'tiktok',
      duration:     videoRules?.maxDurationSec ? Math.min(videoRules.maxDurationSec, 30) : 15,
      aspect_ratio: videoRules?.aspectRatios?.[0] ?? '9:16',
      tone:         req.constraints?.tone ?? 'energetic',
      goal:         req.constraints?.goal ?? 'growth',
      quality:      'cinematic',
      genre,
      artist_name:  normalized.artistName,
      hook:         normalized.hook,
      body:         normalized.body,
      cta:          normalized.cta,
    });

    if (!result.success || !result.url) {
      throw new Error(result.error ?? 'Local video generation failed');
    }

    return [{
      id: randomUUID(),
      modality: 'video' as OutputModality,
      payload: result.url,
      platform,
      metadata: {
        aspectRatio: videoRules?.aspectRatios?.[0],
        maxDurationSec: videoRules?.maxDurationSec,
        requiresHook: videoRules?.requiresHook,
        platformRules: videoRules,
        source: 'ffmpeg',
        genre,
      },
    }];
  },
};

const workers = {
  text: textWorker,
  image: imageWorker,
  audio: audioWorker,
  video: videoWorker,
};

export async function handleGeneration(req: GenerationRequest): Promise<MultimodalPackage> {
  logger.info(`[MultimodalGen] Starting generation: id=${req.id}, pack=${req.packId ?? 'none'}, platforms=${req.platforms.join(',')}`);

  const normalized = await normalizeInput(req);
  const plan = await planTasks(normalized, req);

  const stepOutputs = new Map<string, GeneratedAsset[]>();

  // Separate steps that depend only on normalized input (can run in parallel)
  // from steps that depend on earlier step outputs (must run serially after dependencies)
  const independentSteps = plan.steps.filter(
    (s) => !s.inputFrom || s.inputFrom === 'normalizedInput',
  );
  const dependentSteps = plan.steps.filter(
    (s) => s.inputFrom && s.inputFrom !== 'normalizedInput',
  );

  // Run all independent steps concurrently
  if (independentSteps.length > 0) {
    await Promise.all(
      independentSteps.map(async (step) => {
        const worker = workers[step.worker];
        if (!worker) {
          logger.warn(`[MultimodalGen] Unknown worker: ${step.worker}`);
          return;
        }
        const assets = await worker.run(step, { normalized }, req);
        stepOutputs.set(step.id, assets);
        logger.info(`[MultimodalGen] Step ${step.id} (${step.worker}) → ${assets.length} asset(s) [parallel]`);
      }),
    );
  }

  // Run dependent steps serially, each resolving its upstream outputs
  for (const step of dependentSteps) {
    const worker = workers[step.worker];
    if (!worker) {
      logger.warn(`[MultimodalGen] Unknown worker: ${step.worker}`);
      continue;
    }
    const inputs = {
      normalized,
      stepAssets: (Array.isArray(step.inputFrom) ? step.inputFrom : [step.inputFrom])
        .flatMap((id: string) => stepOutputs.get(id) ?? []),
    };
    const assets = await worker.run(step, inputs, req);
    stepOutputs.set(step.id, assets);
    logger.info(`[MultimodalGen] Step ${step.id} (${step.worker}) → ${assets.length} asset(s) [sequential]`);
  }

  const allAssets = Array.from(stepOutputs.values()).flat();

  logger.info(`[MultimodalGen] Done: id=${req.id}, total_assets=${allAssets.length}`);

  return {
    requestId: req.id,
    assets: allAssets,
    plan,
    generatedAt: new Date().toISOString(),
  };
}

export { PLATFORM_RULES };
