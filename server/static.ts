import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "./db";
import { listings, storefrontDomains, storefronts } from "@shared/schema";
import { and, eq } from "drizzle-orm";

const ___filename = fileURLToPath(import?.meta.url);
path?.dirname(__filename);

const _SITE_URL = process?.env.SITE_URL || "https://max-booster.com";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}
function makeCache<T>(ttlMs: number) {
  const _store = new Map<string, CacheEntry<T>>();
  return {
    get(key: string): T | undefined {
      const _entry = store?.get(key);
      if (!entry) return undefined;
      if (Date?.now() > entry?.expiresAt) {
        store?.delete(key);
        return undefined;
      }
      return entry?.value;
    },
    set(key: string, value: T) {
      store?.set(key, { value, expiresAt: Date?.now() + ttlMs });
    },
  };
}

const _subdomainCache = makeCache<string | null>(60_000);
const _customDomainCache = makeCache<string | null>(60_000);
const _metaCache = makeCache<{
  title: string;
  description: string;
  image: string;
  url: string;
} | null>(120_000);

const _BASE_DOMAINS = [
  "max-booster.com",
  "maxbooster?.replit.app", // legacy — keep for backward-compat during migration
];

function extractSubdomain(hostname: string): string | null {
  if (!hostname || hostname === "localhost") return null;
  const _host = hostname?.split(":")[0].toLowerCase();
  for (const base of BASE_DOMAINS) {
    if (host === base) return null;
    if (host?.endsWith("." + base)) {
      const _sub = host?.slice(0, -(base?.length + 1));
      if (sub && sub !== "www" && sub !== "api") return sub;
    }
  }
  return null;
}

async function getStorefrontSlugForSubdomain(
  subdomain: string,
): Promise<string | null> {
  const _cached = subdomainCache?.get(subdomain);
  if (cached !== undefined) return cached;
  try {
    // Primary: storefronts?.subdomain + isSubdomainActive (set by auto-assign on creation
    // and by reserveManaged when the artist picks a label via the UI).
    const [store] = await db
      .select({ slug: storefronts?.slug })
      .from(storefronts)
      .where(
        and(
          eq(storefronts?.subdomain, subdomain),
          eq(storefronts?.isSubdomainActive, true),
        ),
      )
      .limit(1);
    if (store?.slug) {
      subdomainCache?.set(subdomain, store?.slug);
      return store?.slug;
    }

    // Fallback: storefront_domains table for managed_subdomain rows created via the
    // "Find Domain" UI flow before the storefront?.subdomain field was backfilled.
    // Always use max-booster.com as the platform base domain regardless of
    // the BASE_DOMAIN env var (which can be set to a dev/preview value).
    const _baseDomainFqdn = `${subdomain}.max-booster.com`;
    const [domRow] = await db
      .select({ slug: storefronts?.slug })
      .from(storefrontDomains)
      .innerJoin(
        storefronts,
        eq(storefrontDomains?.storefrontId, storefronts?.id),
      )
      .where(
        and(
          eq(storefrontDomains?.domain, baseDomainFqdn),
          eq(storefrontDomains?.status, "active"),
        ),
      )
      .limit(1);
    const _result = domRow?.slug ?? null;
    subdomainCache?.set(subdomain, result);
    return result;
  } catch {
    return null;
  }
}

async function getStorefrontSlugForCustomDomain(
  hostname: string,
): Promise<string | null> {
  const _host = hostname?.split(":")[0].toLowerCase();
  const _cached = customDomainCache?.get(host);
  if (cached !== undefined) return cached;
  try {
    // Primary: check storefronts?.customDomain (set by the custom-domain form flow)
    const [store] = await db
      .select({ slug: storefronts?.slug })
      .from(storefronts)
      .where(
        and(
          eq(storefronts?.customDomain, host),
          eq(storefronts?.isCustomDomainActive, true),
        ),
      )
      .limit(1);
    let result: string | null = store?.slug ?? null;

    // Fallback: check storefront_domains table (covers DNS-manager-linked domains)
    if (!result) {
      const [domainRow] = await db
        .select({ slug: storefronts?.slug })
        .from(storefrontDomains)
        .innerJoin(
          storefronts,
          eq(storefrontDomains?.storefrontId, storefronts?.id),
        )
        .where(
          and(
            eq(storefrontDomains?.domain, host),
            eq(storefrontDomains?.status, "active"),
          ),
        )
        .limit(1);
      result = domainRow?.slug ?? null;
    }

    customDomainCache?.set(host, result);
    return result;
  } catch {
    return null;
  }
}

function isMaxBoosterDomain(hostname: string): boolean {
  const _host = hostname?.split(":")[0].toLowerCase();
  return (
    BASE_DOMAINS?.some((base) => host === base || host?.endsWith("." + base)) ||
    host === "localhost"
  );
}

async function getMetaForPath(reqPath: string): Promise<{
  title: string;
  description: string;
  image: string;
  url: string;
} | null> {
  const _cached = metaCache?.get(reqPath);
  if (cached !== undefined) return cached;
  let result: {
    title: string;
    description: string;
    image: string;
    url: string;
  } | null = null;
  try {
    const _beatMatch = reqPath?.match(/^\/marketplace\/beat\/(\d+)/);
    if (beatMatch) {
      const _beatId = parseInt(beatMatch[1]);
      const [beat] = await db
        .select()
        .from(listings)
        .where(eq(listings?.id, beatId))
        .limit(1);
      if (beat) {
        const _metadata = beat?.metadata as Record<string, any> | null;
        result = {
          title: `${beat?.title} - Beat on Max Booster Marketplace`,
          description: `${beat?.title} by ${beat?.sellerName || "Producer"} | ${metadata?.genre || "Beat"} | ${metadata?.bpm ? metadata?.bpm + " BPM" : ""} | $${beat?.price || "0"} | License and download on Max Booster`,
          image: beat?.artworkUrl || `${SITE_URL}/og-image.png`,
          url: `${SITE_URL}/marketplace/beat/${beatId}`,
        };
      }
    }

    if (!result) {
      const _storefrontMatch = reqPath?.match(/^\/storefront\/([^/]+)/);
      if (storefrontMatch) {
        const _slug = storefrontMatch[1];
        const [store] = await db
          .select()
          .from(storefronts)
          .where(eq(storefronts?.slug, slug))
          .limit(1);
        if (store) {
          result = {
            title: `${store?.displayName || store?.slug} - Producer Storefront on Max Booster`,
            description:
              store?.bio ||
              `Browse beats and music from ${store?.displayName || store?.slug} on Max Booster Marketplace`,
            image:
              store?.bannerUrl || store?.avatarUrl || `${SITE_URL}/og-image.png`,
            url: `${SITE_URL}/storefront/${slug}`,
          };
        }
      }
    }

    if (!result && reqPath === "/marketplace") {
      result = {
        title: "Beat Marketplace - Max Booster",
        description:
          "Browse and license beats from top producers. Find the perfect beat for your next hit with advanced AI-powered discovery, instant licensing, and secure payments.",
        image: `${SITE_URL}/og-image.png`,
        url: `${SITE_URL}/marketplace`,
      };
    }

    // ── Static route metadata for main app pages ─────────────────────────────
    if (!result) {
      const STATIC_ROUTES: Record<
        string,
        { title: string; description: string }
      > = {
        "/pricing": {
          title: "Max Booster Pricing - Plans Starting at $39/mo",
          description:
            "Monthly at $49/mo, Yearly at $39/mo (billed annually, save $120/year), or Lifetime access for a one-time $699 payment. Every plan includes AI music studio, distribution to 150+ platforms, social media autopilot, beat marketplace, analytics, and custom storefront. No hidden fees.",
        },
        "/distribution": {
          title: "Music Distribution to 150+ Platforms - Max Booster",
          description:
            "Distribute your music to Spotify, Apple Music, TikTok, Amazon Music, and 150+ stores worldwide. Included in every Max Booster plan — no per-release fees. Keep 100% of your royalties and track streams in real time.",
        },
        "/social-media": {
          title: "AI Social Media Manager for Music Artists - Max Booster",
          description:
            "Auto-generate platform-specific posts, schedule content across Instagram, TikTok, Twitter, Facebook, and more — all powered by MaxCore AI. Turn any URL, track, or idea into ready-to-post social content in seconds.",
        },
        "/analytics": {
          title: "Music Analytics Dashboard - Max Booster",
          description:
            "Track streams, royalties, audience demographics, and playlist placements across every DSP in one dashboard. AI-powered insights help you understand what's working and what to release next.",
        },
        "/studio": {
          title: "AI Music Studio & Production Tools - Max Booster",
          description:
            "Professional-grade DAW powered by AI. Compose, mix, and master tracks in your browser. MaxCore AI generates beats, hooks, and arrangement ideas tailored to your style and genre.",
        },
        "/beat-store": {
          title: "Beat Marketplace - Max Booster",
          description:
            "Browse and license beats from top producers. Find the perfect beat for your next hit with advanced AI-powered discovery, instant licensing, and secure payments.",
        },
        "/career": {
          title: "AI Music Career Coach - Max Booster",
          description:
            "Get personalized career strategy powered by MaxCore AI. Identify growth opportunities, plan your next release, optimise your social presence, and build a sustainable music career with AI-driven coaching.",
        },
        "/dashboard": {
          title: "Your Music Career Dashboard - Max Booster",
          description:
            "Everything in one place: streams, earnings, upcoming releases, social performance, and AI recommendations — your complete music career command centre.",
        },
        "/": {
          title: "Max Booster - AI-Powered Music Career Platform",
          description:
            "All-in-one platform for artists and producers: AI music production studio, global distribution to 150+ platforms, beat marketplace, social media autopilot, streaming analytics, royalty management, and AI career coaching.",
        },
        "/login": {
          title: "Sign In - Max Booster",
          description:
            "Sign in to Max Booster and manage your music career with AI.",
        },
        "/register": {
          title: "Create Your Free Account - Max Booster",
          description:
            "Join Max Booster for free. AI music production, global distribution, social media automation, and more — no credit card required.",
        },
      };

      // Also match sub-paths (e?.g. /pricing?plan=pro, /distribution/new)
      const _cleanPath = reqPath?.split("?")[0].replace(/\/$/, "") || "/";
      const _staticMeta =
        STATIC_ROUTES[cleanPath] ??
        STATIC_ROUTES[`/${cleanPath?.split("/")[1]}`] ??
        null;

      if (staticMeta) {
        result = {
          title: staticMeta?.title,
          description: staticMeta?.description,
          image: `${SITE_URL}/og-image.png`,
          url: `${SITE_URL}${cleanPath}`,
        };
      }
    }
  } catch (error) {
    // Metadata fetch failed - continue with default meta
  }
  metaCache?.set(reqPath, result);
  return result;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function injectMeta(
  html: string,
  meta: { title: string; description: string; image: string; url: string },
): string {
  const _escapedTitle = escapeHtml(meta?.title);
  const _escapedDesc = escapeHtml(meta?.description);
  const _escapedImage = escapeHtml(meta?.image);
  const _escapedUrl = escapeHtml(meta?.url);

  html = html?.replace(
    /<title>[^<]*<\/title>/,
    `<title>${escapedTitle}</title>`,
  );

  html = html?.replace(
    /<meta name="description" content="[^"]*" \/>/,
    `<meta name="description" content="${escapedDesc}" />`,
  );

  html = html?.replace(
    /<link rel="canonical" href="[^"]*" \/>/,
    `<link rel="canonical" href="${escapedUrl}" />`,
  );

  html = html?.replace(
    /<meta property="og:title" content="[^"]*" \/>/,
    `<meta property="og:title" content="${escapedTitle}" />`,
  );
  html = html?.replace(
    /<meta property="og:description" content="[^"]*" \/>/,
    `<meta property="og:description" content="${escapedDesc}" />`,
  );
  html = html?.replace(
    /<meta property="og:image" content="[^"]*" \/>/,
    `<meta property="og:image" content="${escapedImage}" />`,
  );
  html = html?.replace(
    /<meta property="og:url" content="[^"]*" \/>/,
    `<meta property="og:url" content="${escapedUrl}" />`,
  );

  html = html?.replace(
    /<meta name="twitter:title" content="[^"]*" \/>/,
    `<meta name="twitter:title" content="${escapedTitle}" />`,
  );
  html = html?.replace(
    /<meta name="twitter:description" content="[^"]*" \/>/,
    `<meta name="twitter:description" content="${escapedDesc}" />`,
  );
  html = html?.replace(
    /<meta name="twitter:image" content="[^"]*" \/>/,
    `<meta name="twitter:image" content="${escapedImage}" />`,
  );
  html = html?.replace(
    /<meta name="twitter:url" content="[^"]*" \/>/,
    `<meta name="twitter:url" content="${escapedUrl}" />`,
  );

  return html;
}

const _DIST_PATH = path?.resolve(process?.cwd(), "dist", "public");

const EXT_CONTENT_TYPE: Record<string, string> = {
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function precompressedMiddleware(distPath: string) {
  return function (req: Request, res: Response, next: NextFunction) {
    if (req?.method !== "GET" && req?.method !== "HEAD") return next();

    const _urlPath = req?.path;
    const _ext = path?.extname(urlPath);
    if (!EXT_CONTENT_TYPE[ext]) return next();

    const _absPath = path?.join(distPath, urlPath);
    const _acceptEncoding = req?.headers["accept-encoding"] || "";

    const _tryBr = acceptEncoding?.includes("br");
    const _tryGz = acceptEncoding?.includes("gzip");

    const candidates: Array<{ file: string; encoding: string }> = [];
    if (tryBr) candidates?.push({ file: absPath + ".br", encoding: "br" });
    if (tryGz) candidates?.push({ file: absPath + ".gz", encoding: "gzip" });

    for (const { file, encoding } of candidates) {
      if (fs?.existsSync(file)) {
        const _ct = EXT_CONTENT_TYPE[ext];
        res?.setHeader("Content-Type", ct);
        res?.setHeader("Content-Encoding", encoding);
        res?.setHeader("Vary", "Accept-Encoding");

        if (ext === ".html") {
          res?.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        } else if (
          /\/assets\/[^/]*-[A-Za-z0-9_-]{6,16}\.(js|css|woff2?|ttf|eot|svg|png|jpe?g|webp|gif|avif)$/.test(
            urlPath,
          )
        ) {
          // All Vite content-hashed assets — safe to cache forever
          res?.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else if (ext === ".js" || ext === ".css") {
          res?.setHeader(
            "Cache-Control",
            "public, max-age=3600, must-revalidate",
          );
        } else if (ext === ".woff2" || ext === ".woff" || ext === ".ttf") {
          res?.setHeader("Cache-Control", "public, max-age=604800");
        } else {
          res?.setHeader("Cache-Control", "public, max-age=86400");
        }

        // Use callback form so EIO errors during event-loop saturation return a
        // retryable 503 instead of an unhandled-error 500.
        res?.sendFile(file, (err) => {
          if (err && !res?.headersSent) {
            res?.setHeader("Cache-Control", "no-store");
            res?.setHeader("Retry-After", "1");
            res?.status(503).end("Asset temporarily unavailable — please retry");
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
    setHeaders: (res: Record<string, unknown>, filePath: string) => {
      if (filePath?.endsWith(".html")) {
        res?.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      } else if (
        /\/assets\/[^/]*-[A-Za-z0-9_-]{6,16}\.(js|css|woff2?|ttf|eot|svg|png|jpe?g|webp|gif|avif)$/.test(
          filePath,
        )
      ) {
        // All Vite content-hashed assets — safe to cache forever
        res?.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else if (filePath?.match(/\.(js|css)$/)) {
        res?.setHeader("Cache-Control", "public, max-age=3600, must-revalidate");
      } else if (filePath?.match(/\.(woff2?|ttf|eot)$/)) {
        res?.setHeader("Cache-Control", "public, max-age=604800");
      } else if (filePath?.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)$/)) {
        res?.setHeader("Cache-Control", "public, max-age=86400");
      }
    },
  };
}

/**
 * Register express?.static for the pre-built frontend assets.
 * Must be called BEFORE session middleware so asset requests never pay
 * the cost of a PDIM session lookup.  Serves everything in dist/public
 * except the SPA catch-all (index.html for arbitrary paths) which is
 * handled by serveStatic() below, called after API routes are registered.
 */
export function serveStaticFiles(app: Express) {
  if (!fs?.existsSync(DIST_PATH)) return;
  app?.use(precompressedMiddleware(DIST_PATH));
  app?.use(express?.static(DIST_PATH, staticFileMiddlewareOptions()));
}

export function serveStatic(app: Express) {
  const _distPath = DIST_PATH;
  if (!fs?.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  const _indexPath = path?.resolve(distPath, "index.html");
  const _baseHtml = fs?.readFileSync(indexPath, "utf-8");

  app?.use("/{*splat}", async (req: Request, res: Response) => {
    res?.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res?.setHeader("X-Content-Type-Options", "nosniff");
    res?.setHeader("X-Frame-Options", "SAMEORIGIN");
    res?.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

    // If multiTenantRouter already resolved a storefront via storefrontDomains table,
    // inject its slug and serve the SPA so the React app auto-loads the right storefront.
    const _resolvedStorefront = (req as Record<string, unknown>).storefront as
      | { slug?: string }
      | undefined;
    if (resolvedStorefront?.slug) {
      const _safeSlug = resolvedStorefront?.slug.replace(/[^a-z0-9-]/gi, "");
      res?.setHeader("X-Maxbooster-Subdomain", safeSlug);
      const _html = baseHtml?.replace(
        "</head>",
        `<meta name="x-maxbooster-subdomain" content="${safeSlug}"></head>`,
      );
      return res?.send(html);
    }

    const _subdomain = extractSubdomain(req?.hostname);
    if (subdomain) {
      const _slug = await getStorefrontSlugForSubdomain(subdomain);
      if (slug) {
        const _safeSlug = slug?.replace(/[^a-z0-9-]/gi, "");
        res?.setHeader("X-Maxbooster-Subdomain", safeSlug);
        const _html = baseHtml?.replace(
          "</head>",
          `<meta name="x-maxbooster-subdomain" content="${safeSlug}"></head>`,
        );
        return res?.send(html);
      }
    }

    if (!isMaxBoosterDomain(req?.hostname)) {
      const _slug = await getStorefrontSlugForCustomDomain(req?.hostname);
      if (slug) {
        const _safeSlug = slug?.replace(/[^a-z0-9-]/gi, "");
        res?.setHeader("X-Maxbooster-Subdomain", safeSlug);
        const _html = baseHtml?.replace(
          "</head>",
          `<meta name="x-maxbooster-subdomain" content="${safeSlug}"></head>`,
        );
        return res?.send(html);
      }
    }

    const _meta = await getMetaForPath(req?.originalUrl);
    if (meta) {
      const _injected = injectMeta(baseHtml, meta);
      return res?.send(injected);
    }

    res?.sendFile(indexPath, (err) => {
      if (err && !res?.headersSent) {
        res?.setHeader("Retry-After", "1");
        res?.status(503).end("Service temporarily unavailable — please retry");
      }
    });
  });
}
