import { pool } from "../../db";
import { commerceRepository, commerceEngine, commerceStripe } from "./runtime";
import { minorUnits, majorUnits } from "./contract";
import type Stripe from "stripe";
export async function requestCommercePayout(userId:string,amount:number,currency="usd",key?:string) {
  if(!key) throw new Error("An Idempotency-Key is required for a payout");
  currency=currency.toLowerCase();
  const user=(await pool.query("SELECT stripe_connected_account_id FROM users WHERE id=$1",[userId])).rows[0];
  if(!user?.stripe_connected_account_id) throw new Error("Complete Stripe Connect onboarding before withdrawing");
  const account=await commerceStripe().accounts.retrieve(user.stripe_connected_account_id);
  if(!account.payouts_enabled || account.capabilities?.transfers!=="active") throw new Error("Stripe Connect verification or payout capability is incomplete");
  const op=await commerceRepository.reserve(userId,minorUnits(amount,currency),currency,key,user.stripe_connected_account_id);
  // Reservation is a durable request. Provider outages leave the operation queued.
  if(op.state==="pending") {
    try { await commerceEngine().execute(op.id); }
    catch { /* persisted retry with visible error; scheduler resumes the same ID */ }
  }
  const current=await commerceRepository.get(op.id);
  return {success:true,payoutId:op.id,stripePayoutId:current?.provider_id,amount,state:current?.state,error:current?.error||undefined};
}
export function payoutView(op:any) {
  return {id:op.id,userId:op.user_id,amount:majorUnits(op.amount_cents,op.currency),netAmount:majorUnits(op.amount_cents,op.currency),grossAmount:majorUnits(op.amount_cents,op.currency),
    currency:op.currency.toUpperCase(),method:"stripe",status:op.state==="completed"?"completed":op.state==="cancelled"?"cancelled":op.state==="failed"?"failed":"pending",
    transactionId:op.provider_id,createdAt:new Date(op.created_at),failureReason:op.error,taxWithheld:0};
}
export async function payOrderBeneficiaries(orderId:string,actorId:string) {
  const source=(await pool.query("SELECT * FROM commerce_sources WHERE id=$1",[orderId])).rows[0];
  if(!source || source.metadata.sellerId!==actorId) throw new Error("Not authorized for this sale");
  if(Number(source.compensated_cents)>0) throw new Error("Sale has a refund or dispute");
  const allocations=(await pool.query("SELECT * FROM commerce_allocations WHERE source_id=$1 ORDER BY user_id",[orderId])).rows;
  const operations:string[]=[],transfers:string[]=[],errors:string[]=[];
  for(const allocation of allocations) {
    try {
      const result=await requestCommercePayout(allocation.user_id,majorUnits(Number(allocation.amount_cents),allocation.currency),allocation.currency,`allocation:${allocation.id}`);
      operations.push(result.payoutId);
      const op=await commerceRepository.get(result.payoutId);
      if(op?.transfer_id) transfers.push(op.transfer_id);
    } catch(error) {errors.push(`${allocation.user_id}: ${error instanceof Error?error.message:String(error)}`);}
  }
  return {success:errors.length===0,splitPaymentIds:operations,transfers,errors};
}
export async function handleCommercePayoutEvent(event:Stripe.Event) {
  const payout=event.data.object as Stripe.Payout;
  const id=payout.metadata?.commerceOperation;
  if(!id) return false;
  const op=await commerceRepository.get(id);
  if(!op || event.account!==op.payload.accountId) throw new Error("Payout event does not match its connected account");
  if(event.type==="payout.failed" && op.state==="completed") {
    const actual=await commerceStripe().payouts.retrieve(payout.id,{stripeAccount:op.payload.accountId});
    if(actual.status==="failed" || actual.status==="canceled") {
      if(await commerceRepository.bankReturned(op)==="review") throw new Error("Bank return is held for overlapping refund-recovery reconciliation");
    }
  }
  if(op.state==="review") throw new Error("Payout requires provider-cash reconciliation");
  await pool.query("UPDATE commerce_operations SET lease_until=now() WHERE id=$1 AND state IN ('awaiting','retry')",[id]);
  await commerceEngine().execute(id);
  return true;
}