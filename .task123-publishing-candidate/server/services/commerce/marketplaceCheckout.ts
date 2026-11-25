import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { pool } from "../../db";
import { snapshotMarketplaceTerms } from "./settlement";
import { majorUnits } from "./contract";
import { assertSettlementAuthorization } from "./settlementAuthorization";

/** Reuse a pending purchase, including across a lost checkout-create response.
 * The DB order is the immutable contract; provider metadata carries only identity.
 */
export async function createMarketplaceCheckout(stripe:Stripe,input:{
  buyerId:string;sellerId:string;beatId:string;licenseType:string;amountCents:number;
  licenseSnapshot:Record<string,unknown>|null;title:string;successUrl:string;cancelUrl:string;
}) {
  if(input.buyerId===input.sellerId) throw new Error("Cannot purchase your own beat");
  if(!Number.isSafeInteger(input.amountCents)||input.amountCents<=0) throw new Error("Invalid checkout amount");
  const client=await pool.connect();
  let order:any;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[`checkout:${input.buyerId}:${input.beatId}:${input.licenseType}`]);
    order=(await client.query(`SELECT * FROM orders WHERE user_id=$1 AND listing_id=$2 AND license_type=$3
      AND status IN ('pending','completed') AND metadata->>'checkoutKind'='marketplace-v1' ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [input.buyerId,input.beatId,input.licenseType])).rows[0];
    if(!order) {
      const terms=await snapshotMarketplaceTerms({listingId:input.beatId,sellerId:input.sellerId,
        amount:majorUnits(input.amountCents,"usd"),currency:"usd",metadata:{amountCents:input.amountCents}});
      const metadata={amountCents:input.amountCents,settlementTerms:terms,checkoutKind:"marketplace-v1",
        checkoutTitle:input.title,successUrl:input.successUrl,cancelUrl:input.cancelUrl};
      order=(await client.query(`INSERT INTO orders(id,user_id,seller_id,listing_id,license_type,amount,currency,status,license_snapshot,metadata)
        VALUES($1,$2,$3,$4,$5,$6,'usd','pending',$7,$8) RETURNING *`,
        [randomUUID(),input.buyerId,input.sellerId,input.beatId,input.licenseType,
          majorUnits(input.amountCents,"usd"),input.licenseSnapshot,metadata])).rows[0];
    }
    await client.query("COMMIT");
  } catch(error) {await client.query("ROLLBACK");throw error;} finally {client.release();}
  if(!order.metadata?.settlementTerms) throw new Error("Checkout requires historical reconciliation");
  assertSettlementAuthorization(order.metadata.settlementTerms,input.sellerId,input.beatId);
  if(order.seller_id!==input.sellerId) throw new Error("Checkout seller changed; reconciliation is required");
  const identity={commerceKind:"marketplace",commerceVersion:"1",orderId:order.id,
    buyerId:order.user_id,sellerId:order.seller_id,beatId:order.listing_id,licenseType:order.license_type};
  const remember=async(session:Stripe.Checkout.Session)=>{
    await pool.query(`UPDATE orders SET metadata=metadata || $2::jsonb WHERE id=$1`,
      [order.id,JSON.stringify({sessionId:session.id})]);
    if(session.status==="expired") {
      await pool.query("UPDATE orders SET status='cancelled' WHERE id=$1 AND status='pending'",[order.id]);
      throw new Error("Checkout expired; start a new purchase");
    }
    if(session.status!=="open" || !session.url) throw new Error("Checkout already submitted; await payment reconciliation");
    return {sessionId:session.id,url:session.url,orderId:order.id};
  };
  if(order.metadata.sessionId) return remember(await stripe.checkout.sessions.retrieve(order.metadata.sessionId));
  // Recover accepted creates even beyond the provider idempotency retention window.
  for await(const session of stripe.checkout.sessions.list({limit:100,created:{gte:Math.floor(new Date(order.created_at).getTime()/1000)-60}})) {
    if(session.metadata?.orderId===order.id) return remember(session);
  }
  return remember(await stripe.checkout.sessions.create({
    mode:"payment",payment_method_types:["card"],metadata:identity,payment_intent_data:{metadata:identity},
    line_items:[{quantity:1,price_data:{currency:order.currency,unit_amount:order.metadata.amountCents,
      product_data:{name:order.metadata.checkoutTitle}}}],
    success_url:order.metadata.successUrl,cancel_url:order.metadata.cancelUrl,
  },{idempotencyKey:`marketplace:${order.id}:checkout:v1`}));
}

export async function consumeMarketplaceCheckout(session:Stripe.Checkout.Session,fulfill:(id:string,payment:string)=>Promise<unknown>) {
  const meta=session.metadata;
  if(meta?.commerceKind!=="marketplace" || meta.commerceVersion!=="1" || !meta.orderId)
    throw new Error("Historical checkout lacks a frozen order; reconciliation required");
  const order=(await pool.query("SELECT * FROM orders WHERE id=$1",[meta.orderId])).rows[0];
  const payment=typeof session.payment_intent==="string"?session.payment_intent:session.payment_intent?.id;
  if(!order?.metadata?.settlementTerms) throw new Error("Order lacks frozen settlement terms; reconciliation required");
  if(!payment || session.payment_status!=="paid" || session.amount_total!==order.metadata.amountCents ||
    session.currency!==order.currency || meta.buyerId!==order.user_id || meta.sellerId!==order.seller_id ||
    meta.beatId!==order.listing_id || meta.licenseType!==order.license_type ||
    (order.metadata.sessionId && order.metadata.sessionId!==session.id) ||
    (order.stripe_payment_intent_id && order.stripe_payment_intent_id!==payment))
    throw new Error("Checkout does not match its frozen order");
  return fulfill(order.id,payment);
}