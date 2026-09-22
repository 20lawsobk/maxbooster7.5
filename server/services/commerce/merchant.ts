import type Stripe from "stripe";
import { pool } from "../../db";
import { commerceStripe, commerceRepository } from "./runtime";
import type { MerchantCheckoutMetadata } from "./contract";
import { verifiedPayment } from "./verification";

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

export async function settleMerchantCheckout(session:Stripe.Checkout.Session) {
  const metadata=session.metadata;
  if(metadata?.commerceVersion!=="2" || metadata.commerceKind!=="merchant") throw new Error("Unsupported merchant checkout contract");
  if(session.payment_status!=="paid") throw new Error("Merchant checkout not paid");
  const order=(await pool.query("SELECT * FROM storefront_orders WHERE id=$1",[metadata.merchantOrderId])).rows[0];
  if(!order || order.buyer_id!==metadata.buyerId || order.seller_id!==metadata.sellerId ||
    Number(order.amount_cents)!==session.amount_total || order.currency!==session.currency ||
    (order.stripe_session_id && order.stripe_session_id!==session.id)) throw new Error("Merchant payment does not match stored order");
  const paymentIntent=typeof session.payment_intent==="string"?session.payment_intent:session.payment_intent?.id;
  if(!paymentIntent) throw new Error("Merchant checkout has no payment intent");
  const fee=Number(metadata.platformFeeCents),gross=Number(order.amount_cents);
  if(!Number.isSafeInteger(fee)||fee<0||fee>=gross) throw new Error("Invalid merchant fee");
  const verified=await verifiedPayment(paymentIntent,gross,order.currency);
  await commerceRepository.book({id:`merchant:${order.id}`,kind:"merchant",paymentIntent,currency:order.currency,
    processingFeeCents:verified.processingFeeCents,
    grossCents:gross,feeCents:fee,allocations:[{userId:order.seller_id,cents:gross-fee}],
    metadata:{sellerId:order.seller_id,buyerId:order.buyer_id,merchantOrderId:order.id,sessionId:session.id}});
  if(verified.refundedCents||verified.pendingCents||verified.disputed) await commerceRepository.compensate(`merchant:${order.id}`,verified.refundedCents,verified.disputed?gross:0,verified.pendingCents);
}