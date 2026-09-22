import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";

export interface MerchPaymentAdapter {
  createCheckout(input: {
    orderId: string; idempotencyKey: string; buyerEmail: string;
    currency: "usd"; subtotalCents: number;
    lines: Array<{ name: string; quantity: number; unitAmountCents: number }>;
    shippingAddress: Record<string, string>;
  }): Promise<{ checkoutId: string; checkoutUrl: string }>;
}
let payments: MerchPaymentAdapter | undefined;
/** Commerce owns processor configuration, tax/shipping quote and signed events. */
export function installMerchPaymentAdapter(adapter: MerchPaymentAdapter) { payments = adapter; }
const rows = (r: any): any[] => r.rows ?? r;
export class MerchCheckoutError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function toMerchCents(value: unknown): number {
  if ((typeof value !== "number" && typeof value !== "string") || value === "")
    throw new MerchCheckoutError(400, "Catalog price is required");
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001)
    throw new MerchCheckoutError(400, "Catalog price must be a nonnegative USD cent amount");
  const cents = Math.round(amount * 100);
  if (!Number.isSafeInteger(cents)) throw new MerchCheckoutError(400, "Catalog price is out of range");
  return cents;
}
export async function createMerchCheckout(input: {
  buyerId: string; commandKey: string; buyerEmail: string; buyerName: string;
  shippingAddress: Record<string, string>; items: Array<{ itemId: string; quantity: number }>;
}) {
  if (!payments) throw new MerchCheckoutError(503, "Merchandise payment integration is not configured");
  const adapter = payments;
  const order = await db.transaction(async tx => {
    // Serialize command creation even when two requests arrive before either insert.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${input.buyerId}:${input.commandKey}`}))`);
    const existing = rows(await tx.execute(sql`SELECT p.*,o.items,o.buyer_email,o.buyer_name,o.shipping_address
      FROM growth_merch_payments p JOIN merch_orders o ON o.id=p.order_id
      WHERE p.buyer_id=${input.buyerId} AND p.command_key=${input.commandKey}`))[0];
    if (existing) {
      const identity = (items: Array<{ itemId: string; quantity: number }>) =>
        JSON.stringify(items.map(i => ({ itemId: i.itemId, quantity: i.quantity }))
          .sort((a, b) => a.itemId.localeCompare(b.itemId)));
      const address = (value: Record<string, string>) =>
        JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
      if (existing.buyer_email !== input.buyerEmail || existing.buyer_name !== input.buyerName ||
          identity(existing.items) !== identity(input.items) ||
          address(existing.shipping_address) !== address(input.shippingAddress))
        throw new MerchCheckoutError(409, "Checkout key is already bound to different order details");
      return existing;
    }
    if (!input.items.length || new Set(input.items.map(i => i.itemId)).size !== input.items.length)
      throw new MerchCheckoutError(400, "Order requires distinct products");
    let artistId: string | undefined;
    const lines = [];
    let subtotal = 0;
    // Deterministic lock order prevents multi-product deadlock.
    for (const requested of [...input.items].sort((a, b) => a.itemId.localeCompare(b.itemId))) {
      if (!Number.isInteger(requested.quantity) || requested.quantity < 1 || requested.quantity > 100)
        throw new MerchCheckoutError(400, "Quantity must be between 1 and 100");
      const item = rows(await tx.execute(sql`SELECT * FROM merch_items WHERE id=${requested.itemId} FOR UPDATE`))[0];
      if (!item || !item.is_active || item.is_digital)
        throw new MerchCheckoutError(400, "Physical product is not available");
      if (Array.isArray(item.variants) && item.variants.length)
        throw new MerchCheckoutError(400, "Variant-level inventory configuration is required for this product");
      if (artistId && artistId !== item.user_id) throw new MerchCheckoutError(400, "An order must contain one artist's products");
      artistId = item.user_id;
      if (item.inventory < requested.quantity) throw new MerchCheckoutError(409, "Insufficient stock");
      const unitAmountCents = toMerchCents(item.sale_price ?? item.price);
      subtotal += unitAmountCents * requested.quantity;
      if (!Number.isSafeInteger(subtotal)) throw new MerchCheckoutError(400, "Order total is out of range");
      lines.push({ itemId: item.id, name: item.name, quantity: requested.quantity, unitAmountCents });
      await tx.execute(sql`UPDATE merch_items SET inventory=inventory-${requested.quantity},updated_at=now()
        WHERE id=${item.id}`);
    }
    const id = randomUUID();
    await tx.execute(sql`INSERT INTO merch_orders
      (id,user_id,buyer_email,buyer_name,items,total,status,shipping_address)
      VALUES (${id},${artistId},${input.buyerEmail},${input.buyerName},${JSON.stringify(lines)}::jsonb,
        ${subtotal / 100},'pending',${JSON.stringify(input.shippingAddress)}::jsonb)`);
    await tx.execute(sql`INSERT INTO growth_merch_payments
      (order_id,buyer_id,command_key,currency,subtotal_cents,state)
      VALUES (${id},${input.buyerId},${input.commandKey},'usd',${subtotal},'reserved')`);
    return { order_id: id, subtotal_cents: subtotal, items: lines,
      buyer_email: input.buyerEmail, shipping_address: input.shippingAddress, state: "reserved" };
  });
  if (order.checkout_url) return { orderId: order.order_id, checkoutUrl: order.checkout_url };
  if (order.state !== "reserved") throw new MerchCheckoutError(409, "Order is no longer payable");
  // Retry uses immutable order snapshot and the same provider idempotency key.
  const checkout = await adapter.createCheckout({
    orderId: order.order_id, idempotencyKey: `merch:${order.order_id}`,
    buyerEmail: order.buyer_email, currency: "usd", subtotalCents: Number(order.subtotal_cents),
    lines: order.items, shippingAddress: order.shipping_address,
  });
  if (!checkout.checkoutId || new URL(checkout.checkoutUrl).protocol !== "https:")
    throw new Error("Payment provider returned an invalid checkout");
  await db.execute(sql`UPDATE growth_merch_payments SET checkout_id=${checkout.checkoutId},
    checkout_url=${checkout.checkoutUrl},state='checkout'
    WHERE order_id=${order.order_id} AND state='reserved'`);
  return { orderId: order.order_id, checkoutUrl: checkout.checkoutUrl };
}

/** Call ONLY after commerce verifies provider signature, account and event payload.
 * Expired means provider-confirmed unpayable, never merely a local timeout.
 * Refund amount is cumulative provider-refunded cents, not a client assertion.
 */
export async function applyVerifiedMerchPayment(event: {
  eventId: string; orderId: string; checkoutId: string; currency: string;
  type: "paid" | "expired" | "refunded"; amountCents: number;
}) {
  if (!Number.isSafeInteger(event.amountCents) || event.amountCents < 0)
    throw new Error("Invalid verified payment amount");
  return db.transaction(async tx => {
    const payment = rows(await tx.execute(sql`SELECT * FROM growth_merch_payments
      WHERE order_id=${event.orderId} FOR UPDATE`))[0];
    if (!payment || payment.currency !== event.currency ||
        (payment.checkout_id && payment.checkout_id !== event.checkoutId))
      throw new Error("Payment does not match reserved order");
    const seen = rows(await tx.execute(sql`SELECT event_id FROM growth_merch_payment_events WHERE event_id=${event.eventId}`));
    if (seen.length) return { duplicate: true };
    const order = rows(await tx.execute(sql`SELECT * FROM merch_orders WHERE id=${event.orderId} FOR UPDATE`))[0];
    if (event.type === "paid") {
      if (payment.state === "expired" || event.amountCents < Number(payment.subtotal_cents))
        throw new Error("Invalid payment settlement");
      if (["paid", "refunded"].includes(payment.state) && event.amountCents !== Number(payment.collected_cents))
        throw new Error("Payment amount changed for a settled checkout");
      if (payment.state !== "paid" && payment.state !== "refunded") {
        await tx.execute(sql`UPDATE growth_merch_payments SET state='paid',
          collected_cents=${event.amountCents},checkout_id=${event.checkoutId} WHERE order_id=${event.orderId}`);
        await tx.execute(sql`UPDATE merch_orders SET status='processing',total=${event.amountCents / 100},
          updated_at=now() WHERE id=${event.orderId}`);
        for (const line of order.items) await tx.execute(sql`UPDATE merch_items SET
          sold_count=coalesce(sold_count,0)+${line.quantity} WHERE id=${line.itemId}`);
      }
    } else if (event.type === "expired") {
      if (payment.state === "paid" || payment.state === "refunded") throw new Error("Paid checkout cannot expire");
      if (payment.state !== "expired") {
        for (const line of order.items) await tx.execute(sql`UPDATE merch_items SET inventory=inventory+${line.quantity}
          WHERE id=${line.itemId}`);
        await tx.execute(sql`UPDATE growth_merch_payments SET state='expired' WHERE order_id=${event.orderId}`);
        await tx.execute(sql`UPDATE merch_orders SET status='cancelled',updated_at=now() WHERE id=${event.orderId}`);
      }
    } else {
      if (!["paid", "refunded"].includes(payment.state) || event.amountCents > Number(payment.collected_cents))
        throw new Error("Refund requires matching settled payment");
      const refund = Math.max(Number(payment.refunded_cents), event.amountCents);
      await tx.execute(sql`UPDATE growth_merch_payments SET refunded_cents=${refund},
        state=${refund === Number(payment.collected_cents) ? "refunded" : "paid"}
        WHERE order_id=${event.orderId}`);
      if (refund === Number(payment.collected_cents))
        await tx.execute(sql`UPDATE merch_orders SET status='refunded',updated_at=now() WHERE id=${event.orderId}`);
    }
    await tx.execute(sql`INSERT INTO growth_merch_payment_events(event_id,order_id,event_type)
      VALUES (${event.eventId},${event.orderId},${event.type})`);
    return { duplicate: false };
  });
}