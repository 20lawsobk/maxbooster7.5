import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { listingStems, listings, orders } from "../../shared/schema";

export async function canReadListingStems(listingId: string, userId?: string): Promise<boolean> {
  if (!userId) return false;
  const [listing] = await db.select({ userId: listings.userId })
    .from(listings).where(eq(listings.id, listingId)).limit(1);
  if (!listing) return false;
  if (listing.userId === userId) return true;
  const [purchase] = await db.select({ id: orders.id }).from(orders).where(and(
    eq(orders.listingId, listingId), eq(orders.userId, userId), eq(orders.status, "completed"),
  )).limit(1);
  return Boolean(purchase);
}

export function stemStorageKey(url: string): string | null {
  const prefix = "/api/storage/file/";
  if (!url.startsWith(prefix)) return null;
  try { return decodeURIComponent(url.slice(prefix.length)); } catch { return null; }
}

// null means this is not a stem; false must never fall through to public serving.
// Legacy rows retain differently percent-encoded URLs rather than a canonical
// key column. Compare decoded stored URLs, never decode Express params again.
export async function stemAssetAccess(key: string, userId?: string): Promise<boolean | null> {
  const rows = await db.select({ listingId: listingStems.listingId, fileUrl: listingStems.fileUrl })
    .from(listingStems);
  const listingIds = new Set(rows.filter(row => stemStorageKey(row.fileUrl) === key)
    .map(row => row.listingId));
  if (!listingIds.size) return null;
  for (const id of listingIds) {
    if (!await canReadListingStems(id, userId)) return false;
  }
  return true;
}