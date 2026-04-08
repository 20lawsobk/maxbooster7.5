import { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db.js";
import { storefrontDomains, storefronts, users } from "@shared/schema";
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

export async function multiTenantRouter(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const host = (req.headers.host || "").toLowerCase().split(":")[0];

    if (isInternalHost(host) || req.path.startsWith("/api/") || req.path.startsWith("/_")) {
      return next();
    }

    const [domainRow] = await db
      .select({
        domain: storefrontDomains,
        storefront: storefronts,
      })
      .from(storefrontDomains)
      .innerJoin(storefronts, eq(storefrontDomains.storefrontId, storefronts.id))
      .where(eq(storefrontDomains.domain, host))
      .limit(1);

    if (
      !domainRow ||
      domainRow.domain.status !== "active" ||
      !domainRow.storefront.isActive
    ) {
      res.status(404).send("Storefront not found.");
      return;
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, domainRow.storefront.userId))
      .limit(1);

    (req as any).storefront = domainRow.storefront;
    (req as any).artist = user;

    logger.debug(`[multiTenant] Resolved ${host} → storefront ${domainRow.storefront.id}`);
    next();
  } catch (err) {
    logger.warn("[multiTenant] Error resolving storefront:", err);
    next();
  }
}
