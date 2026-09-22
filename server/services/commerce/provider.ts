import Stripe from "stripe";
import type { Operation } from "./contract";

export interface CommerceProvider {
  transfer(op: Operation): Promise<string>;
  payout(op: Operation): Promise<{ id: string; status: string }>;
  refund(op: Operation): Promise<{ id: string; status: string; refundedCents?:number;pendingCents?:number }>;
  reverse(op: Operation): Promise<string>;
}

/** All requests use immutable durable operation IDs. Recovery searches provider
 * records BEFORE retrying creation, including beyond Stripe's idempotency TTL.
 */
export class StripeCommerceProvider implements CommerceProvider {
  constructor(private stripe: Stripe) {}
  async transfer(op: Operation): Promise<string> {
    if (op.transfer_id) return op.transfer_id;
    for await (const t of this.stripe.transfers.list({ transfer_group: op.id, limit:100 })) {
      if (t.metadata.commerceOperation === op.id) return t.id;
    }
    const t = await this.stripe.transfers.create({
      amount:op.amount_cents, currency:op.currency, destination:op.payload.accountId,
      transfer_group:op.id, metadata:{commerceOperation:op.id},
    }, {idempotencyKey:`commerce:${op.id}:transfer`});
    return t.id;
  }
  async payout(op: Operation) {
    const options = {stripeAccount:op.payload.accountId};
    if (op.provider_id) {
      const p = await this.stripe.payouts.retrieve(op.provider_id, options);
      return {id:p.id,status:p.status};
    }
    for await (const p of this.stripe.payouts.list({limit:100, created:{gte:Math.floor(new Date(op.created_at).getTime()/1000)-60}}, options)) {
      if(p.metadata?.commerceOperation===op.id) return {id:p.id,status:p.status};
    }
    const p = await this.stripe.payouts.create({
      amount:op.amount_cents,currency:op.currency,method:"standard",
      metadata:{commerceOperation:op.id},
    }, {...options,idempotencyKey:`commerce:${op.id}:bank`});
    return {id:p.id,status:p.status};
  }
  async refund(op: Operation) {
    const result=async (r:Stripe.Refund)=>{
      let refundedCents: number|undefined;
      let pendingCents=0;
      if(r.charge) {
        refundedCents=0;
        for await(const refund of this.stripe.refunds.list({payment_intent:op.payload.paymentIntent,limit:100})) {
          if(refund.status==="succeeded") refundedCents+=refund.amount;
          if(refund.status==="pending"||refund.status==="requires_action") pendingCents+=refund.amount;
        }
      }
      return {id:r.id,status:r.status||"pending",refundedCents,pendingCents};
    };
    if(op.provider_id) {
      const r=await this.stripe.refunds.retrieve(op.provider_id);
      return result(r);
    }
    for await(const r of this.stripe.refunds.list({payment_intent:op.payload.paymentIntent,limit:100})) {
      if(r.metadata?.commerceOperation===op.id) return result(r);
    }
    const r=await this.stripe.refunds.create({
      payment_intent:op.payload.paymentIntent, amount:op.amount_cents,
      metadata:{commerceOperation:op.id,orderId:op.payload.orderId},
    },{idempotencyKey:`commerce:${op.id}:refund`});
    return result(r);
  }
  async reverse(op: Operation) {
    for await(const r of this.stripe.transfers.listReversals(op.payload.transferId,{limit:100})) {
      if(r.metadata?.commerceOperation===op.id) return r.id;
    }
    const r=await this.stripe.transfers.createReversal(op.payload.transferId,{
      amount:op.amount_cents, metadata:{commerceOperation:op.id},
    },{idempotencyKey:`commerce:${op.id}:reversal`});
    return r.id;
  }
}