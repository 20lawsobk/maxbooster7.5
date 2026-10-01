import type Stripe from "stripe";
import { pool } from "../../db";
import { commerceStripe, commerceRepository } from "./runtime";
import type { MerchantCheckoutMetadata, Sale } from "./contract";
import { verifiedPayment } from "./verification";
import type { CommerceRepository } from "./repository";

/** Growth integration seam. The caller persists a real pending storefront order
 * first. Prices and ownership are loaded here, never accepted from browser input.
 */
export async function createMerchantCheckout(input:{
  orderId:string;buyerId:string;successUrl:string;cancelUrl:string;idempotencyKey:string;
}) {
  const order=(await pool.query("SELECT * FROM storefront_orders WHERE id=$1",[input.orderId])).rows[0];
  if(!order || order.buyer_id!==input.buyerId || order.status!=="pending") throw new Error("Merchant order not available");
  if(!input.idempotencyKey) throw new Error("Checkout idempotency key is required");
  const stripe=commerceStripe();
  if(order.stripe_session_id) {
    const existing=await stripe.checkout.sessions.retrieve(order.stripe_session_id);
    if(existing.status!=="open") throw new Error("Checkout is no longer open; create a new merchant order");
    return {sessionId:existing.id,url:existing.url};
  }
  // Recover an accepted create whose local response was lost, even after the
  // provider's idempotency-key retention window has elapsed.
  for await(const existing of stripe.checkout.sessions.list({limit:100,created:{gte:Math.floor(new Date(order.created_at).getTime()/1000)-60}})) {
    if(existing.metadata?.merchantOrderId===order.id) {
      await pool.query("UPDATE storefront_orders SET stripe_session_id=$2 WHERE id=$1",[order.id,existing.id]);
      if(existing.status!=="open") throw new Error("Merchant checkout has already completed or expired");
      return {sessionId:existing.id,url:existing.url};
    }
  }
  const amount=Number(order.amount_cents);
  if(!Number.isSafeInteger(amount)||amount<=0) throw new Error("Merchant order amount is invalid");
  const rate=Number(process.env.PLATFORM_FEE_PERCENTAGE ?? 10);
  if(!Number.isFinite(rate)||rate<0||rate>=100) throw new Error("Invalid platform fee");
  const metadata:MerchantCheckoutMetadata={
    commerceVersion:"2",commerceKind:"merchant",merchantOrderId:order.id,
    sellerId:order.seller_id,buyerId:order.buyer_id,platformFeeCents:String(Math.round(amount*rate/100)),
  };
  const session=await stripe.checkout.sessions.create({
    mode:"payment",metadata:{...metadata},payment_intent_data:{metadata:{...metadata}},
    line_items:[{quantity:1,price_data:{currency:order.currency,unit_amount:amount,product_data:{name:`Storefront purchase ${order.listing_id}`}}}],
    success_url:input.successUrl,cancel_url:input.cancelUrl,
  },{idempotencyKey:`merchant:${order.id}:checkout`});
  await pool.query("UPDATE storefront_orders SET stripe_session_id=$2 WHERE id=$1 AND status='pending'",[order.id,session.id]);
  return {sessionId:session.id,url:session.url};
}

export type MerchantCheckoutSession = Pick<
  Stripe.Checkout.Session,
  "id" | "metadata" | "payment_status" | "amount_total" | "currency" | "payment_intent"
>;

export type MerchantSettlementDependencies = {
  pool: Pick<typeof pool, "query">;
  repository: Pick<CommerceRepository, "book" | "compensate">;
  verifyPayment: typeof verifiedPayment;
};

const merchantSettlementDependencies: MerchantSettlementDependencies = {
  pool,
  repository: commerceRepository,
  verifyPayment: verifiedPayment,
};

export async function settleMerchantCheckout(
  session: MerchantCheckoutSession,
  dependencies: MerchantSettlementDependencies = merchantSettlementDependencies,
) {
  const metadata=session.metadata;
  const storefrontCheckout = metadata?.type === "storefront_purchase";
  const singleMerchantCheckout =
    metadata?.commerceVersion === "2" &&
    metadata.commerceKind === "merchant" &&
    Boolean(metadata.merchantOrderId);
  if (!storefrontCheckout && !singleMerchantCheckout) {
    throw new Error("Unsupported merchant checkout contract");
  }
  if (
    metadata?.commerceVersion &&
    metadata.commerceVersion !== "2"
  ) {
    throw new Error("Unsupported merchant checkout version");
  }
  if(session.payment_status!=="paid") throw new Error("Merchant checkout not paid");
  if (!session.id) throw new Error("Merchant checkout has no session id");
  const orderRows = storefrontCheckout
    ? (
        await dependencies.pool.query(
          "SELECT * FROM storefront_orders WHERE stripe_session_id=$1",
          [session.id],
        )
      ).rows
    : [
        (
          await dependencies.pool.query(
            "SELECT * FROM storefront_orders WHERE id=$1",
            [metadata!.merchantOrderId],
          )
        ).rows[0],
      ].filter(Boolean);
  if (!orderRows.length) {
    throw new Error("Merchant checkout has no matching stored order");
  }

  const firstOrder = orderRows[0];
  const buyerId = String(firstOrder.buyer_id);
  const sellerId = String(firstOrder.seller_id);
  const storefrontId = String(firstOrder.storefront_id);
  const currency = String(firstOrder.currency || "usd").toLowerCase();
  if (
    orderRows.some(
      (order: any) =>
        String(order.buyer_id) !== buyerId ||
        String(order.seller_id) !== sellerId ||
        String(order.storefront_id) !== storefrontId ||
        String(order.currency || "usd").toLowerCase() !== currency ||
        (order.stripe_session_id && order.stripe_session_id !== session.id) ||
        !["pending", "completed"].includes(String(order.status)) ||
        (order.stripe_payment_intent_id &&
          order.stripe_payment_intent_id !==
            (typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id))
    )
  ) {
    throw new Error("Merchant payment does not match stored order");
  }
  if (
    (metadata?.buyerId && metadata.buyerId !== buyerId) ||
    (metadata?.sellerId && metadata.sellerId !== sellerId) ||
    (storefrontCheckout &&
      metadata?.storefrontId &&
      metadata.storefrontId !== storefrontId)
  ) {
    throw new Error("Merchant checkout identity does not match stored order");
  }

  const gross = orderRows.reduce((total: number, order: any) => {
    const amount = Number(order.amount_cents);
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new Error("Merchant order contains an invalid amount");
    }
    return total + amount;
  }, 0);
  if (
    !Number.isSafeInteger(gross) ||
    gross <= 0 ||
    Number(session.amount_total) !== gross ||
    (session.currency || "usd").toLowerCase() !== currency
  ) {
    throw new Error("Merchant payment does not match stored order total");
  }

  const paymentIntent=typeof session.payment_intent==="string"?session.payment_intent:session.payment_intent?.id;
  if(!paymentIntent) throw new Error("Merchant checkout has no payment intent");
  let fee: number;
  if (metadata?.platformFeeCents !== undefined) {
    fee = Number(metadata.platformFeeCents);
  } else {
    const rate = Number(process.env.PLATFORM_FEE_PERCENTAGE ?? 10);
    if (!Number.isFinite(rate) || rate < 0 || rate >= 100) {
      throw new Error("Invalid platform fee configuration");
    }
    fee = Math.round((gross * rate) / 100);
  }
  if(!Number.isSafeInteger(fee)||fee<0||fee>=gross) throw new Error("Invalid merchant fee");
  const verified=await dependencies.verifyPayment(paymentIntent,gross,currency);
  const promotionId =
    metadata?.promotionId ||
    orderRows.find((order: any) => order.applied_promotion_id)
      ?.applied_promotion_id ||
    null;
  const sale: Sale = {
    id: storefrontCheckout
      ? `merchant:checkout:${session.id}`
      : `merchant:${firstOrder.id}`,
    kind: "merchant",
    paymentIntent,
    currency,
    processingFeeCents:verified.processingFeeCents,
    grossCents: gross,
    feeCents: fee,
    allocations: [{ userId: sellerId, cents: gross - fee }],
    metadata: {
      sellerId,
      buyerId,
      storefrontId,
      ...(storefrontCheckout
        ? { storefrontCheckout: true }
        : { merchantOrderId: firstOrder.id }),
      sessionId: session.id,
      ...(promotionId ? { promotionId } : {}),
    },
  };
  await dependencies.repository.book(sale);
  if(verified.refundedCents||verified.pendingCents||verified.disputed) {
    await dependencies.repository.compensate(
      sale.id,
      verified.refundedCents,
      verified.disputed ? gross : 0,
      verified.pendingCents,
    );
  }
}