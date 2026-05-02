import { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db.js";
import { storefrontHosts, storefronts, users } from "@shared/schema";
import { logger } from "../logger.js";

const INTERNAL_HOSTS = [
  "localhost",
  "127.0.0.1",
  "replit.app",
  "replit.dev",
  "repl.co",
];

function isInternalHost(host: string): boolean {
  return INTERNAL_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

// Static asset file extensions — never need tenant resolution
const STATIC_EXT_RE = /\.(js|css|woff2?|ttf|eot|otf|ico|png|jpg|jpeg|gif|webp|svg|avif|map|json|txt|xml)$/i;

function isStaticAssetPath(p: string): boolean {
  return (
    p.startsWith("/assets/") ||
    p.startsWith("/favicon") ||
    p.startsWith("/icons/") ||
    p.startsWith("/images/") ||
    p.startsWith("/fonts/") ||
    STATIC_EXT_RE.test(p)
  );
}

export async function multiTenantRouter(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const host = (req.headers.host || "").toLowerCase().split(":")[0];

    // Always skip: internal hosts, API paths, Vite internals, static assets
    if (
      isInternalHost(host) ||
      req.path.startsWith("/api/") ||
      req.path.startsWith("/_") ||
      isStaticAssetPath(req.path)
    ) {
      return next();
    }

    // storefront_hosts is the canonical routing projection: every activated custom
    // domain (root + www variant) and platform subdomain is written here by all
    // three activation paths (storefrontDnsService, dnsManager, domain.controller).
    const [hostRow] = await db
      .select({
        storefrontId: storefrontHosts.storefrontId,
        storefront: storefronts,
      })
      .from(storefrontHosts)
      .innerJoin(storefronts, eq(storefrontHosts.storefrontId, storefronts.id))
      .where(eq(storefrontHosts.host, host))
      .limit(1);

    if (!hostRow) {
      // Domain not registered — let downstream handlers (static.ts fallbacks) try
      return next();
    }

    // Attach storefront regardless of isActive/isPublic state so the SPA can
    // render a "coming soon" / "private" view rather than a raw 404.
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, hostRow.storefront.userId))
      .limit(1);

    (req as Record<string, unknown>).storefront = hostRow.storefront;
    (req as Record<string, unknown>).artist = user ?? null;

    logger.debug(`[multiTenant] Resolved ${host} → storefront ${hostRow.storefront.id}`);
    next();
  } catch (err) {
    logger.warn({ err }, "[multiTenant] Error resolving storefront");
    next();
  }
}
