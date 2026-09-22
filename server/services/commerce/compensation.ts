import type Stripe from "stripe";
import { pool } from "../../db";
import { registerWebhookHandler } from "../../safety/stripeWebhookSecurity";
import { commerceRepository, commerceEngine, commerceStripe } from "./runtime";
import { applyVerifiedMerchPayment } from "../merchCheckoutService";

export async function reconcileCharge(chargeId:string,dispute?:Stripe.Dispute) {
  const stripe=commerceStripe();
  const charge=await stripe.charges.retrieve(chargeId);
  const paymentIntent=typeof charge.payment_intent==="string"?charge.payment_intent:charge.payment_intent?.id;
  if(!paymentIntent) return;
  const source=await commerceRepository.sourceByPayment(paymentIntent);
  if(!source) {
    const pi=await stripe.paymentIntents.retrieve(paymentIntent);
    const plan=pi.metadata.planId||pi.metadata.planName||pi.metadata.tier;
    if(plan==="lifetime" && (charge.amount_refunded===charge.amount || (dispute && !["won","warning_closed"].includes(dispute.status)))) {
      const customer=typeof charge.customer==="string"?charge.customer:charge.customer?.id;
      await pool.query("UPDATE users SET subscription_tier='free',subscription_status='refunded' WHERE stripe_customer_id=$1 AND subscription_tier='lifetime'",[customer]);
      return;
    }
    if(plan==="lifetime" && charge.paid && charge.amount_refunded===0 && dispute?.status==="won") {
      const customer=typeof charge.customer==="string"?charge.customer:charge.customer?.id;
      await pool.query("UPDATE users SET subscription_tier='lifetime',subscription_status='active',subscription_ends_at=NULL WHERE stripe_customer_id=$1 AND subscription_status='refunded'",[customer]);
      return;
    }
    if(pi.metadata.beatId || pi.metadata.commerceVersion==="2") throw new Error("Payment has no reconciled commerce source; refund event requires recovery");
    // Not a commerce payment; subscription lifecycle is owned by its handlers.
    return;
  }
  let held=Number(source.disputed_cents);
  if(dispute) {
    const current=await stripe.disputes.retrieve(dispute.id);
    held=["won","warning_closed"].includes(current.status)?0:current.amount;
    for(const balance of current.balance_transactions) await commerceRepository.providerFee(balance.id,balance.fee,balance.currency,source.id);
  }
  const refunds:Stripe.Refund[]=[];
  for await(const refund of stripe.refunds.list({payment_intent:paymentIntent,limit:100})) refunds.push(refund);
  const succeeded=refunds.filter(r=>r.status==="succeeded").reduce((n,r)=>n+r.amount,0);
  const pending=refunds.filter(r=>r.status==="pending"||r.status==="requires_action").reduce((n,r)=>n+r.amount,0);
  await commerceRepository.compensate(source.id,succeeded,held,pending);
  if(source.kind==="merch" && succeeded) await applyVerifiedMerchPayment({
    eventId:`refund:${paymentIntent}:${succeeded}`,orderId:source.metadata.growthMerchOrderId,
    checkoutId:source.metadata.sessionId,currency:source.currency,type:"refunded",amountCents:succeeded,
  });
  // Complete API refund reservations by provider identity, including events
  // delivered before the API request persists its response.
  for(const refund of refunds) {
    if(refund.balance_transaction) {
      const balance=typeof refund.balance_transaction==="string"?await stripe.balanceTransactions.retrieve(refund.balance_transaction):refund.balance_transaction;
      await commerceRepository.providerFee(balance.id,balance.fee,balance.currency,source.id);
    }
    const operation=refund.metadata?.commerceOperation;
    if(operation) {
      const state=refund.status==="succeeded"?"completed":refund.status==="failed"||refund.status==="canceled"?"failed":"awaiting";
      await pool.query("UPDATE commerce_operations SET provider_id=$2,state=$3,lease_until=NULL WHERE id=$1 AND kind='refund'",[operation,refund.id,state]);
      await pool.query("UPDATE refunds SET stripe_refund_id=$2,status=$3,processed_at=CASE WHEN $3='succeeded' THEN now() ELSE processed_at END WHERE id=$1",[operation,refund.id,refund.status]);
    } else {
      await pool.query(`INSERT INTO refunds(id,order_id,user_id,seller_id,amount_cents,currency,status,stripe_refund_id,stripe_charge_id,initiated_by,refund_type)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'provider_dashboard',$10)
        ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status`,
        [`external:${refund.id}`,source.id,source.metadata.buyerId,source.metadata.sellerId,refund.amount,refund.currency,
          refund.status,refund.id,charge.id,refund.amount===Number(source.gross_cents)?"full":"partial"]);
    }
  }
}

export function registerCommerceCompensationHandlers() {
  registerWebhookHandler("topup.reversed",async event=>{
    const topup=event.data.object as Stripe.Topup;
    const current=await commerceStripe().topups.retrieve(topup.id);
    if(current.status!=="reversed") return {success:true,message:"Top-up reversal superseded"};
    const sources=(await pool.query("SELECT id,gross_cents FROM commerce_sources WHERE kind='royalty' AND metadata->>'topupId'=$1",[topup.id])).rows;
    for(const source of sources) await commerceRepository.compensate(source.id,Number(source.gross_cents),0);
    return {success:true,message:"Reversed royalty funding compensated"};
  });
  for(const eventType of ["charge.refunded","refund.created","refund.updated","refund.failed","charge.dispute.created","charge.dispute.updated","charge.dispute.closed"]) {
    registerWebhookHandler(eventType,async event=>{
      const obj=event.data.object as any;
      const chargeId=event.type==="charge.refunded"?obj.id:typeof obj.charge==="string"?obj.charge:obj.charge?.id;
      if(!chargeId) throw new Error("Commerce reversal event has no charge");
      await reconcileCharge(chargeId,event.type.startsWith("charge.dispute.")?obj:undefined);
      return {success:true,message:"Commerce compensation persisted"};
    });
  }
}

export async function initiateCommerceRefund(orderId:string,userId:string,cents:number,key:string) {
  if(!key) throw new Error("An Idempotency-Key is required for refunds");
  const op=await commerceRepository.refundIntent(orderId,userId,cents,key);
  await pool.query(`INSERT INTO refunds(id,order_id,user_id,seller_id,amount_cents,currency,status,initiated_by,refund_type)
    SELECT $1,id,$4,metadata->>'sellerId',$3,currency,'pending','customer',
      CASE WHEN gross_cents=$3 THEN 'full' ELSE 'partial' END FROM commerce_sources WHERE id=$2
    ON CONFLICT (id) DO NOTHING`,[op.id,orderId,cents,userId]);
  if(op.state==="pending") {
    try { await commerceEngine().execute(op.id); }
    catch { /* durable retry remains visible and reserved; never submit a new ID */ }
  }
  const current=await commerceRepository.get(op.id);
  return {success:true,refundId:op.id,stripeRefundId:current?.provider_id,status:current?.state};
}