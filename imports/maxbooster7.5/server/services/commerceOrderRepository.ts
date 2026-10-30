import { db } from "../db";
import { orders } from "@shared/schema";
import { eq } from "drizzle-orm";

/** Typed, narrow order writes; DatabaseStorage has no updateOrder method. */
export async function updateCommerceOrder(
  id: string,
  changes: Partial<Pick<typeof orders.$inferInsert,
    "status" | "stripePaymentIntentId" | "metadata" | "licenseDocumentUrl">>,
) {
  const [order] = await db.update(orders).set(changes)
    .where(eq(orders.id, id)).returning();
  if (!order) throw new Error("Order not found");
  return order;
}