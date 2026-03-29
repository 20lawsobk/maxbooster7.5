import { eq } from "drizzle-orm";
import { db } from "../../db.js";
import { storefronts } from "@shared/schema";
import { logger } from "../../logger.js";

export async function publishStorefront(storefrontId: string, userId: string): Promise<void> {
  const [sf] = await db
    .select({ id: storefronts.id, userId: storefronts.userId })
    .from(storefronts)
    .where(eq(storefronts.id, storefrontId))
    .limit(1);

  if (!sf) throw new Error("Storefront not found.");
  if (sf.userId !== userId) throw new Error("Unauthorized.");

  await db
    .update(storefronts)
    .set({ isPublic: true, isActive: true, updatedAt: new Date() })
    .where(eq(storefronts.id, storefrontId));

  logger.info(`[publish] Storefront ${storefrontId} published by user ${userId}`);
}

export async function unpublishStorefront(storefrontId: string, userId: string): Promise<void> {
  const [sf] = await db
    .select({ id: storefronts.id, userId: storefronts.userId })
    .from(storefronts)
    .where(eq(storefronts.id, storefrontId))
    .limit(1);

  if (!sf) throw new Error("Storefront not found.");
  if (sf.userId !== userId) throw new Error("Unauthorized.");

  await db
    .update(storefronts)
    .set({ isPublic: false, updatedAt: new Date() })
    .where(eq(storefronts.id, storefrontId));

  logger.info(`[publish] Storefront ${storefrontId} unpublished by user ${userId}`);
}
