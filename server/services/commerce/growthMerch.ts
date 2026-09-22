import type Stripe from "stripe";
import type { MerchPaymentAdapter } from "../merchCheckoutService";
import { applyVerifiedMerchPayment, installMerchPaymentAdapter } from "../merchCheckoutService";
import { pool } from "../../db";
import { commerceRepository, commerceStripe } from "./runtime";
import { verifiedPayment } from "./verification";
import { getBaseUrl } from "../../config/defaults";

/** This is the concrete Stripe implementation of growth's exported contract.
 * Shipping rate and tax registration are real provider configuration, not
 * invented rates or a silently free-shipping fallback.
 */
export const stripeMerchPaymentAdapter:MerchPaymentAdapter={
  async createCheckout(input) {
    const stripe=commerceStripe();
    const shippingRateId=process.env.STRIPE_MERCH_SHIPPING_RATE_ID;
    if(!shippingRateId) throw new Error("Configure STRIPE_MERCH_SHIPPING_RATE_ID before selling physical merchandise");
    const shipping=await stripe.shippingRates.retrieve(shippingRateId);
    if(!shipping.active || shipping.type!=="fixed_amount" || shipping.fixed_amount?.currency!==input.currency) throw new Error("Merchandise shipping rate is inactive or has the wrong currency");
    const country=input.shippingAddress.country?.toUpperCase();
    if(!country || !/^[A-Z]{2}$/.test(country)) throw new Error("A valid shipping destination country is required");
    const countries=(process.env.STRIPE_MERCH_SHIPPING_COUNTRIES||"").split(",").map(c=>c.trim().toUpperCase());
    if(!countries.includes(country)) throw new Error("Shipping is not configured for this destination");
    const order=(await pool.query(`SELECT o.user_id,p.buyer_id,p.created_at,p.checkout_id FROM merch_orders o
      JOIN growth_merch_payments p ON p.order_id=o.id WHERE o.id=$1`,[input.orderId])).rows[0];
    if(!order) throw new Error("Reserved merchandise order does not exist");
    if(order.checkout_id) {
      const existing=await stripe.checkout.sessions.retrieve(order.checkout_id);
      if(!existing.url || existing.status!=="open") throw new Error("Merchandise checkout is no longer open");
      return {checkoutId:existing.id,checkoutUrl:existing.url};
    }
    for await(const session of stripe.checkout.sessions.list({limit:100,created:{gte:Math.floor(new Date(order.created_at).getTime()/1000)-60}})) {
      if(session.metadata?.growthMerchOrderId===input.orderId) {
        if(!session.url || session.status!=="open") throw new Error("Existing merchandise checkout is no longer payable");
        return {checkoutId:session.id,checkoutUrl:session.url};
      }
    }
    const amount=input.lines.reduce((n,l)=>n+l.quantity*l.unitAmountCents,0);
    if(amount!==input.subtotalCents || amount<=0) throw new Error("Merchant line amounts do not match the reserved subtotal");
    const feeRate=Number(process.env.PLATFORM_FEE_PERCENTAGE??10);
    if(!Number.isFinite(feeRate)||feeRate<0||feeRate>=100) throw new Error("Invalid merchandise platform fee");
    const metadata={commerceVersion:"2",commerceKind:"merch",growthMerchOrderId:input.orderId,
      buyerId:order.buyer_id,sellerId:order.user_id,platformFeeCents:String(Math.round(amount*feeRate/100))};
    const session=await stripe.checkout.sessions.create({
      mode:"payment",client_reference_id:input.orderId,customer_email:input.buyerEmail,
      metadata,payment_intent_data:{metadata},
      automatic_tax:{enabled:true},shipping_address_collection:{allowed_countries:[country as any]},
      shipping_options:[{shipping_rate:shippingRateId}],
      line_items:input.lines.map(l=>({quantity:l.quantity,price_data:{currency:input.currency,unit_amount:l.unitAmountCents,
        tax_behavior:"exclusive",product_data:{name:l.name}}})),
      success_url:`${getBaseUrl()}/merch?checkout=success&order=${encodeURIComponent(input.orderId)}`,
      cancel_url:`${getBaseUrl()}/merch?checkout=canceled&order=${encodeURIComponent(input.orderId)}`,
    },{idempotencyKey:input.idempotencyKey});
    if(!session.url) throw new Error("Stripe did not return a merchandise checkout URL");
    return {checkoutId:session.id,checkoutUrl:session.url};
  },
};

export function installStripeMerchPaymentAdapter() {installMerchPaymentAdapter(stripeMerchPaymentAdapter);}
export async function handleGrowthMerchCheckout(eventId:string,session:Stripe.Checkout.Session,expired=false) {
  const orderId=session.metadata?.growthMerchOrderId;
  if(!orderId) throw new Error("Merchandise checkout has no order reference");
  const stripe=commerceStripe();
  const current=await stripe.checkout.sessions.retrieve(session.id);
  if(expired) {
    if(current.status!=="expired" || current.payment_status==="paid") throw new Error("Checkout expiry is not confirmed by provider");
    await applyVerifiedMerchPayment({eventId,orderId,checkoutId:session.id,currency:current.currency||"usd",type:"expired",amountCents:0});
    return;
  }
  if(current.payment_status!=="paid" || current.automatic_tax?.status!=="complete") throw new Error("Merchandise payment or tax calculation is not complete");
  const order=(await pool.query(`SELECT p.*,o.user_id FROM growth_merch_payments p JOIN merch_orders o ON o.id=p.order_id WHERE p.order_id=$1`,[orderId])).rows[0];
  if(!order || (order.checkout_id&&order.checkout_id!==current.id) || order.currency!==current.currency ||
    current.metadata?.buyerId!==order.buyer_id || current.metadata?.sellerId!==order.user_id ||
    current.amount_subtotal!==Number(order.subtotal_cents)) throw new Error("Merchandise checkout does not match reservation");
  if(order.state==="expired") throw new Error("Expired merchandise reservation requires reconciliation");
  const shipping=current.collected_information?.shipping_details;
  if(!shipping?.address) throw new Error("Paid merchandise checkout has no verified shipping address");
  if(!current.total_details || !Number.isSafeInteger(current.total_details.amount_tax)) throw new Error("Provider tax breakdown is missing");
  const gross=current.amount_total!,tax=current.total_details.amount_tax,fee=Number(current.metadata?.platformFeeCents);
  if(!Number.isSafeInteger(fee)||fee<0||fee>=gross-tax) throw new Error("Invalid collected merchandise fee");
  const pi=typeof current.payment_intent==="string"?current.payment_intent:current.payment_intent?.id;
  if(!pi) throw new Error("Merchandise checkout has no payment intent");
  const verified=await verifiedPayment(pi,gross,current.currency!);
  await commerceRepository.book({id:`merch:${orderId}`,kind:"merch",paymentIntent:pi,currency:current.currency!,
    grossCents:gross,feeCents:fee,taxCents:tax,processingFeeCents:verified.processingFeeCents,
    allocations:[{userId:order.user_id,cents:gross-tax-fee}],
    metadata:{growthMerchOrderId:orderId,sessionId:current.id,buyerId:order.buyer_id,sellerId:order.user_id}});
  await pool.query("UPDATE merch_orders SET shipping_address=$2::jsonb WHERE id=$1",
    [orderId,JSON.stringify({...shipping.address,name:shipping.name})]);
  await applyVerifiedMerchPayment({eventId,orderId,checkoutId:current.id,currency:current.currency!,type:"paid",amountCents:gross});
  if(verified.refundedCents||verified.pendingCents||verified.disputed) {
    await commerceRepository.compensate(`merch:${orderId}`,verified.refundedCents,verified.disputed?gross:0,verified.pendingCents);
    if(verified.refundedCents) await applyVerifiedMerchPayment({eventId:`refund:${pi}:${verified.refundedCents}`,orderId,checkoutId:current.id,currency:current.currency!,type:"refunded",amountCents:verified.refundedCents});
  }
}