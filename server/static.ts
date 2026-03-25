import express, { type Express, type Request, type Response, type NextFunction } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db } from './db';
import { listings, storefronts, users } from '@shared/schema';
import { and, eq } from 'drizzle-orm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SITE_URL = 'https://maxbooster.replit.app';

interface CacheEntry<T> { value: T; expiresAt: number; }
function makeCache<T>(ttlMs: number) {
  const store = new Map<string, CacheEntry<T>>();
  return {
    get(key: string): T | undefined {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (Date.now() > entry.expiresAt) { store.delete(key); return undefined; }
      return entry.value;
    },
    set(key: string, value: T) {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
  };
}

const subdomainCache = makeCache<string | null>(60_000);
const customDomainCache = makeCache<string | null>(60_000);
const metaCache = makeCache<{ title: string; description: string; image: string; url: string } | null>(120_000);

const BASE_DOMAINS = [
  'maxbooster.replit.app',
  'maxbooster.app',
];

function extractSubdomain(hostname: string): string | null {
  if (!hostname || hostname === 'localhost') return null;
  const host = hostname.split(':')[0].toLowerCase();
  for (const base of BASE_DOMAINS) {
    if (host === base) return null;
    if (host.endsWith('.' + base)) {
      const sub = host.slice(0, -(base.length + 1));
      if (sub && sub !== 'www' && sub !== 'api') return sub;
    }
  }
  return null;
}

async function getStorefrontSlugForSubdomain(subdomain: string): Promise<string | null> {
  const cached = subdomainCache.get(subdomain);
  if (cached !== undefined) return cached;
  try {
    const [store] = await db
      .select({ slug: storefronts.slug })
      .from(storefronts)
      .where(and(eq(storefronts.subdomain, subdomain), eq(storefronts.isSubdomainActive, true)))
      .limit(1);
    const result = store?.slug ?? null;
    subdomainCache.set(subdomain, result);
    return result;
  } catch {
    return null;
  }
}

async function getStorefrontSlugForCustomDomain(hostname: string): Promise<string | null> {
  const host = hostname.split(':')[0].toLowerCase();
  const cached = customDomainCache.get(host);
  if (cached !== undefined) return cached;
  try {
    const [store] = await db
      .select({ slug: storefronts.slug })
      .from(storefronts)
      .where(and(eq(storefronts.customDomain, host), eq(storefronts.isCustomDomainActive, true)))
      .limit(1);
    const result = store?.slug ?? null;
    customDomainCache.set(host, result);
    return result;
  } catch {
    return null;
  }
}

function isMaxBoosterDomain(hostname: string): boolean {
  const host = hostname.split(':')[0].toLowerCase();
  return BASE_DOMAINS.some(base => host === base || host.endsWith('.' + base)) || host === 'localhost';
}

async function getMetaForPath(reqPath: string): Promise<{ title: string; description: string; image: string; url: string } | null> {
  const cached = metaCache.get(reqPath);
  if (cached !== undefined) return cached;
  let result: { title: string; description: string; image: string; url: string } | null = null;
  try {
    const beatMatch = reqPath.match(/^\/marketplace\/beat\/(\d+)/);
    if (beatMatch) {
      const beatId = parseInt(beatMatch[1]);
      const [beat] = await db.select().from(listings).where(eq(listings.id, beatId)).limit(1);
      if (beat) {
        const metadata = beat.metadata as Record<string, any> | null;
        result = {
          title: `${beat.title} - Beat on Max Booster Marketplace`,
          description: `${beat.title} by ${beat.sellerName || 'Producer'} | ${metadata?.genre || 'Beat'} | ${metadata?.bpm ? metadata.bpm + ' BPM' : ''} | $${beat.price || '0'} | License and download on Max Booster`,
          image: beat.artworkUrl || `${SITE_URL}/og-image.png`,
          url: `${SITE_URL}/marketplace/beat/${beatId}`,
        };
      }
    }

    if (!result) {
      const storefrontMatch = reqPath.match(/^\/storefront\/([^/]+)/);
      if (storefrontMatch) {
        const slug = storefrontMatch[1];
        const [store] = await db.select().from(storefronts).where(eq(storefronts.slug, slug)).limit(1);
        if (store) {
          result = {
            title: `${store.displayName || store.slug} - Producer Storefront on Max Booster`,
            description: store.bio || `Browse beats and music from ${store.displayName || store.slug} on Max Booster Marketplace`,
            image: store.bannerUrl || store.avatarUrl || `${SITE_URL}/og-image.png`,
            url: `${SITE_URL}/storefront/${slug}`,
          };
        }
      }
    }

    if (!result && reqPath === '/marketplace') {
      result = {
        title: 'Beat Marketplace - Max Booster',
        description: 'Browse and license beats from top producers. Find the perfect beat for your next hit with advanced AI-powered discovery, instant licensing, and secure payments.',
        image: `${SITE_URL}/og-image.png`,
        url: `${SITE_URL}/marketplace`,
      };
    }
  } catch (error) {
    // Metadata fetch failed - continue with default meta
  }
  metaCache.set(reqPath, result);
  return result;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function injectMeta(html: string, meta: { title: string; description: string; image: string; url: string }): string {
  const escapedTitle = escapeHtml(meta.title);
  const escapedDesc = escapeHtml(meta.description);
  const escapedImage = escapeHtml(meta.image);
  const escapedUrl = escapeHtml(meta.url);

  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapedTitle}</title>`);

  html = html.replace(
    /<meta name="description" content="[^"]*" \/>/,
    `<meta name="description" content="${escapedDesc}" />`
  );

  html = html.replace(
    /<link rel="canonical" href="[^"]*" \/>/,
    `<link rel="canonical" href="${escapedUrl}" />`
  );

  html = html.replace(
    /<meta property="og:title" content="[^"]*" \/>/,
    `<meta property="og:title" content="${escapedTitle}" />`
  );
  html = html.replace(
    /<meta property="og:description" content="[^"]*" \/>/,
    `<meta property="og:description" content="${escapedDesc}" />`
  );
  html = html.replace(
    /<meta property="og:image" content="[^"]*" \/>/,
    `<meta property="og:image" content="${escapedImage}" />`
  );
  html = html.replace(
    /<meta property="og:url" content="[^"]*" \/>/,
    `<meta property="og:url" content="${escapedUrl}" />`
  );

  html = html.replace(
    /<meta name="twitter:title" content="[^"]*" \/>/,
    `<meta name="twitter:title" content="${escapedTitle}" />`
  );
  html = html.replace(
    /<meta name="twitter:description" content="[^"]*" \/>/,
    `<meta name="twitter:description" content="${escapedDesc}" />`
  );
  html = html.replace(
    /<meta name="twitter:image" content="[^"]*" \/>/,
    `<meta name="twitter:image" content="${escapedImage}" />`
  );
  html = html.replace(
    /<meta name="twitter:url" content="[^"]*" \/>/,
    `<meta name="twitter:url" content="${escapedUrl}" />`
  );

  return html;
}

const DIST_PATH = path.resolve(__dirname, "public");

const EXT_CONTENT_TYPE: Record<string, string> = {
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.svg':  'image/svg+xml; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.xml':  'application/xml; charset=utf-8',
  '.txt':  'text/plain; charset=utf-8',
};

function precompressedMiddleware(distPath: string) {
  return function (req: Request, res: Response, next: NextFunction) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    const urlPath = req.path;
    const ext = path.extname(urlPath);
    if (!EXT_CONTENT_TYPE[ext]) return next();

    const absPath = path.join(distPath, urlPath);
    const acceptEncoding = req.headers['accept-encoding'] || '';

    const tryBr  = acceptEncoding.includes('br');
    const tryGz  = acceptEncoding.includes('gzip');

    const candidates: Array<{ file: string; encoding: string }> = [];
    if (tryBr)  candidates.push({ file: absPath + '.br',  encoding: 'br' });
    if (tryGz)  candidates.push({ file: absPath + '.gz',  encoding: 'gzip' });

    for (const { file, encoding } of candidates) {
      if (fs.existsSync(file)) {
        const ct = EXT_CONTENT_TYPE[ext];
        res.setHeader('Content-Type', ct);
        res.setHeader('Content-Encoding', encoding);
        res.setHeader('Vary', 'Accept-Encoding');

        if (ext === '.html') {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else if (/\/assets\/.*-[A-Za-z0-9_-]{6,12}\.(js|css)$/.test(urlPath)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (ext === '.js' || ext === '.css') {
          res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=86400');
        }

        // Use callback form so EIO errors during event-loop saturation return a
        // retryable 503 instead of an unhandled-error 500.
        res.sendFile(file, (err) => {
          if (err && !res.headersSent) {
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('Retry-After', '1');
            res.status(503).end('Asset temporarily unavailable — please retry');
          }
        });
        return;
      }
    }

    next();
  };
}

function staticFileMiddlewareOptions() {
  return {
    etag: true,
    lastModified: true,
    setHeaders: (res: any, filePath: string) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      } else if (filePath.match(/\.(js|css)$/)) {
        if (filePath.match(/assets\/.*-[a-f0-9]{8}\.(js|css)$/)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
        }
      } else if (filePath.match(/\.(woff2?|ttf|eot)$/)) {
        res.setHeader('Cache-Control', 'public, max-age=604800');
      } else if (filePath.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)$/)) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      }
    },
  };
}

/**
 * Register express.static for the pre-built frontend assets.
 * Must be called BEFORE session middleware so asset requests never pay
 * the cost of a PDIM session lookup.  Serves everything in dist/public
 * except the SPA catch-all (index.html for arbitrary paths) which is
 * handled by serveStatic() below, called after API routes are registered.
 */
export function serveStaticFiles(app: Express) {
  if (!fs.existsSync(DIST_PATH)) return;
  app.use(precompressedMiddleware(DIST_PATH));
  app.use(express.static(DIST_PATH, staticFileMiddlewareOptions()));
}

export function serveStatic(app: Express) {
  const distPath = DIST_PATH;
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  const indexPath = path.resolve(distPath, "index.html");
  const baseHtml = fs.readFileSync(indexPath, 'utf-8');

  app.use("/{*splat}", async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    const subdomain = extractSubdomain(req.hostname);
    if (subdomain) {
      const slug = await getStorefrontSlugForSubdomain(subdomain);
      if (slug) {
        const safeSlug = slug.replace(/[^a-z0-9-]/gi, '');
        const html = baseHtml.replace(
          '</head>',
          `<script>window.__MAXBOOSTER_SUBDOMAIN__=${JSON.stringify(safeSlug)}</script></head>`
        );
        return res.send(html);
      }
    }

    if (!isMaxBoosterDomain(req.hostname)) {
      const slug = await getStorefrontSlugForCustomDomain(req.hostname);
      if (slug) {
        const safeSlug = slug.replace(/[^a-z0-9-]/gi, '');
        const html = baseHtml.replace(
          '</head>',
          `<script>window.__MAXBOOSTER_SUBDOMAIN__=${JSON.stringify(safeSlug)}</script></head>`
        );
        return res.send(html);
      }
    }

    const meta = await getMetaForPath(req.originalUrl);
    if (meta) {
      const injected = injectMeta(baseHtml, meta);
      return res.send(injected);
    }

    res.sendFile(indexPath, (err) => {
      if (err && !res.headersSent) {
        res.setHeader('Retry-After', '1');
        res.status(503).end('Service temporarily unavailable — please retry');
      }
    });
  });
}
