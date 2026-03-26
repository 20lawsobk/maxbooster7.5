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

function buildCopyFromContext(
  ctx: UrlContext,
  meta: PageMeta,
  intent: string,
): { hook: string; body: string; cta: string } {
  const title    = meta.title ?? '';
  const desc     = meta.description ?? '';
  const platform = meta.siteName ?? ctx.platform;
  const author   = meta.author ?? '';

  switch (ctx.category) {
    case 'music_stream':
      return {
        hook: title ? `🎵 "${title}" is streaming now on ${platform}!` : `🎵 New music on ${platform}!`,
        body: desc || (title ? `Listen to "${title}" — link in bio!` : `Stream the latest on ${platform}`),
        cta:  `Stream on ${platform} 🔗 Link in bio!`,
      };
    case 'music_video':
      return {
        hook: title ? `🎬 "${title}" — official music video just dropped!` : `🎬 New music video just dropped!`,
        body: desc || `Watch the official video — link in bio!`,
        cta:  `Watch on ${platform} 🎬 Link in bio!`,
      };
    case 'video':
      return {
        hook: title ? `📹 Watch: "${title}"` : `📹 New video — check it out!`,
        body: desc || (author ? `by ${author}` : '') || 'Link in bio!',
        cta:  `Watch on ${platform} ▶️ Link in bio!`,
      };
    case 'social_post':
      return {
        hook: title || `Check out this ${ctx.contentType} 👀`,
        body: desc || `See what I posted on ${platform}!`,
        cta:  `Follow me on ${platform} 🔗 Link in bio!`,
      };
    case 'podcast':
      return {
        hook: title ? `🎙️ New episode: "${title}"` : `🎙️ New podcast episode out now!`,
        body: desc || 'Listen to the latest episode — link in bio!',
        cta:  `Listen on ${platform} 🎙️ Link in bio!`,
      };
    case 'event':
      return {
        hook: title ? `🎟️ ${title}` : `🎟️ Tickets on sale now!`,
        body: desc || 'Get your tickets before they sell out!',
        cta:  `Grab tickets on ${platform} 🎟️ Link in bio!`,
      };
    case 'press':
      return {
        hook: title ? `📰 "${title}"` : `📰 Press feature just dropped!`,
        body: desc || (author ? `Review by ${author}` : '') || `Read the full feature — link in bio!`,
        cta:  `Read on ${platform} 📰 Link in bio!`,
      };
    case 'ecommerce':
      return {
        hook: title ? `🛍️ ${title}` : `🛍️ New merch drop!`,
        body: desc || 'Shop the latest — link in bio!',
        cta:  `Shop now 🛍️ Link in bio!`,
      };
    case 'article':
      return {
        hook: title ? `✍️ "${title}"` : `✍️ New post just went live!`,
        body: desc || (author ? `Written by ${author}` : '') || 'Read it — link in bio!',
        cta:  `Read more ✍️ Link in bio!`,
      };
    default:
      return {
        hook: title ? `🔗 ${title}` : `🔗 Check this out!`,
        body: desc || 'Link in bio!',
        cta:  platform ? `Visit on ${platform} 🔗 Link in bio!` : '🔗 Link in bio!',
      };
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

  const copy = buildCopyFromContext(ctx, { ...meta, siteName }, req.intent ?? 'promote');

  const summary = [title, desc.slice(0, 120)].filter(Boolean).join(' — ')
               || `${ctx.category === 'event' ? 'Upcoming event' : 'New content'} on ${siteName || url}`;

  logger.info(`[MultimodalGen] URL analyzed: category=${ctx.category} title="${title || '(none)'}" platform=${siteName || ctx.platform}`);

  return {
    summary,
    hook:        copy.hook,
    body:        copy.body,
    cta:         copy.cta,
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

  const TEMPLATES: Record<string, (h: string, b: string, c: string, a: string) => string> = {
    instagram:       (h, b, c, a) => `${h}\n\n${b}\n\n${c}${a ? ` | ${a}` : ''}\n\n#music #newmusic #artist #hiphop`,
    tiktok:          (h, _b, c)   => `${h} 🎵 ${c}`,
    twitter:         (h, _b, c)   => `${h} ${c}`,
    threads:         (h, b, c)    => `${h}\n\n${c}${b ? `\n${b}` : ''}`,
    facebook:        (h, b, c, a) => `${h}\n\n${b}\n\n${c}${a ? `\n\n— ${a}` : ''}`,
    youtube:         (h, b, c)    => `${h}\n\n${b}\n\n${c}\n\nSubscribe for more 🔔`,
    linkedin:        (h, b, c, a) => `${a ? `${a} | ` : ''}${h}\n\n${b}\n\n${c}`,
    google_business: (h, b, c)    => `${h}\n\n${b}\n\n${c}`,
  };

  return rawSlots.map((slot: any) => {
    const platform = (slot.platform ?? req.platforms[0]) as Platform;
    const rules = platform ? getRules(platform) : null;
    const tplFn = TEMPLATES[platform] ?? TEMPLATES.instagram;
    let payload = tplFn(hook, body, cta, artist);
    if (rules) payload = enforceTextLength(payload, rules.text);
    const enriched = rules
      ? enrichTextAssetMetadata(payload, platform, rules, { platformRules: rules.text })
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

  let score = 50;
  if (emojiCount >= 1 && emojiCount <= 5) score += 10;
  if (extractedHashtags.length > 0 && extractedHashtags.length <= 10) score += 10;
  if (wordCount >= 15 && wordCount <= 60) score += 10;
  if (hook) score += 10;
  if (cta)  score += 10;
  score = Math.min(100, score);

  const suggestions: string[] = [];
  if (emojiCount === 0) suggestions.push('Add 1–3 emojis to increase engagement');
  if (extractedHashtags.length === 0) suggestions.push('Include relevant hashtags');
  if (charLimit && charCount > charLimit * 0.9) suggestions.push('Near character limit — consider trimming');
  if (!cta) suggestions.push('Add a clear call-to-action');
  if (wordCount < 10) suggestions.push('Expand content for better reach');

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

  for (const step of plan.steps) {
    const worker = workers[step.worker];
    if (!worker) {
      logger.warn(`[MultimodalGen] Unknown worker: ${step.worker}`);
      continue;
    }

    const inputs =
      step.inputFrom === 'normalizedInput'
        ? { normalized }
        : {
            normalized,
            stepAssets: (Array.isArray(step.inputFrom) ? step.inputFrom : [step.inputFrom])
              .flatMap(id => stepOutputs.get(id) ?? []),
          };

    const assets = await worker.run(step, inputs, req);
    stepOutputs.set(step.id, assets);
    logger.info(`[MultimodalGen] Step ${step.id} (${step.worker}) → ${assets.length} asset(s)`);
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
