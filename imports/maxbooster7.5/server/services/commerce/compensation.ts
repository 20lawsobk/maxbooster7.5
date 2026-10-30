import { deferredReversalState, type ReversalState } from "./reversalState";
import type Stripe from "stripe";
import { pool } from "../../db";
import { registerWebhookHandler } from "../../safety/stripeWebhookSecurity";
import { commerceRepository, commerceEngine, commerceStripe } from "./runtime";
import { applyVerifiedMerchPayment } from "../merchCheckoutService";

const providerReadOptions={timeout:8_000,maxNetworkRetries:0};

async function reconcileLifetimeCharge(stripe:Stripe,chargeId:string,paymentIntent:string,customer:string,dispute?:Stripe.Dispute) {
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const users=await client.query("SELECT id FROM users WHERE stripe_customer_id=$1 FOR UPDATE",[customer]);
    if(!users.rows.length) {await client.query("COMMIT");return;}
    let timer:ReturnType<typeof setTimeout>|undefined;
    const read=async()=>({
      charge:await stripe.charges.retrieve(chargeId,providerReadOptions),
      dispute:dispute?await stripe.disputes.retrieve(dispute.id,providerReadOptions):undefined,
    });
    let current:Awaited<ReturnType<typeof read>>;
    try {
      current=await Promise.race([read(),new Promise<never>((_,reject)=>{
        timer=setTimeout(()=>reject(new Error("Lifetime reversal state read timed out")),10_000);
      })]);
    } finally {if(timer)clearTimeout(timer);}
    const currentPayment=typeof current.charge.payment_intent==="string"?current.charge.payment_intent:current.charge.payment_intent?.id;
    const currentCustomer=typeof current.charge.customer==="string"?current.charge.customer:current.charge.customer?.id;
    const disputeCharge=typeof current.dispute?.charge==="string"?current.dispute.charge:current.dispute?.charge?.id;
    if(currentPayment!==paymentIntent||currentCustomer!==customer||(current.dispute&&disputeCharge!==chargeId)) {
      throw new Error("Lifetime reversal payment identity changed");
    }
    if(current.charge.amount_refunded===current.charge.amount ||
        (current.dispute&&!["won","warning_closed"].includes(current.dispute.status))) {
      await client.query("UPDATE users SET subscription_tier='free',subscription_status=CASE WHEN subscription_status IN ('suspended','banned') THEN subscription_status ELSE 'refunded' END WHERE stripe_customer_id=$1 AND subscription_tier='lifetime'",[customer]);
    } else if(current.charge.paid&&current.charge.amount_refunded===0&&current.dispute?.status==="won") {
      await client.query("UPDATE users SET subscription_tier='lifetime',subscription_status='active',subscription_ends_at=NULL WHERE stripe_customer_id=$1 AND subscription_status='refunded'",[customer]);
    }
    await client.query("COMMIT");
  } catch(error) {await client.query("ROLLBACK");throw error;}
  finally {client.release();}
}

export async function reconcileCharge(chargeId:string,dispute?:Stripe.Dispute) {
  const stripe=commerceStripe();
  const charge=await stripe.charges.retrieve(chargeId);
  const paymentIntent=typeof charge.payment_intent==="string"?charge.payment_intent:charge.payment_intent?.id;
  if(!paymentIntent) return;
  const source=await commerceRepository.sourceByPayment(paymentIntent);
  if(!source) {
    const pi=await stripe.paymentIntents.retrieve(paymentIntent);
    const plan=pi.metadata.planId||pi.metadata.planName||pi.metadata.tier;
    if(plan==="lifetime") {
      const customer=typeof charge.customer==="string"?charge.customer:charge.customer?.id;
      if(!customer) throw new Error("Lifetime reversal has no customer identity");
      await reconcileLifetimeCharge(stripe,chargeId,paymentIntent,customer,dispute);
      return;
    }
    if(pi.metadata.beatId || pi.metadata.commerceVersion==="2") throw new Error("Payment has no reconciled commerce source; refund event requires recovery");
    // Not a commerce payment; subscription lifecycle is owned by its handlers.
    return;
  }
  let currentDispute:Stripe.Dispute|undefined;
  const held=dispute?async (lockedPaymentIntent:string)=>{
    if(lockedPaymentIntent!==paymentIntent) throw new Error("Dispute payment source changed");
    // The repository executes this bounded read under its transaction/source
    // lock, on the same DB connection as compensation. Fees remain outside it.
    currentDispute=await stripe.disputes.retrieve(dispute.id,providerReadOptions);
    const currentCharge=typeof currentDispute.charge==="string"?currentDispute.charge:currentDispute.charge?.id;
    if(currentCharge!==chargeId) throw new Error("Dispute charge identity changed");
    return ["won","warning_closed"].includes(currentDispute.status)?0:currentDispute.amount;
  }:undefined;
  let refunds:Stripe.Refund[]=[],snapshot:ReversalState|undefined;
  const read=deferredReversalState(stripe,paymentIntent,{dispute:held,refunds:rows=>{refunds=rows;}});
  await commerceRepository.compensate(source.id,0,async lockedPayment=>{
    snapshot=await read(lockedPayment);return snapshot;
  });
  const succeeded=snapshot?.refunded??0;
  if(currentDispute) for(const balance of currentDispute.balance_transactions) {
    await commerceRepository.providerFee(balance.id,balance.fee,balance.currency,source.id);
  }
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
    for(const source of sources) await commerceRepository.compensate(source.id,Number(source.gross_cents));
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