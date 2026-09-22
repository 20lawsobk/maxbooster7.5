import type { CommerceProvider } from "./provider";
import type { CommerceRepository } from "./repository";
import type { Operation } from "./contract";

/** Executes durable intents, not timers or in-memory completion receipts. */
export class CommerceEngine {
  constructor(private repo:CommerceRepository, private provider:CommerceProvider) {}
  async execute(id?:string) {
    const op=await this.repo.claim(id);
    if(!op) return undefined;
    try {
      if(op.kind==="withdrawal") await this.withdraw(op);
      else if(op.kind==="refund") {
        const refund=await this.provider.refund(op);
        await this.repo.update(op,{providerId:refund.id,state:refund.status==="failed"||refund.status==="canceled"?"failed":"awaiting"});
        if(refund.refundedCents!==undefined) {
          const source=await this.repo.sourceByPayment(op.payload.paymentIntent);
          if(!source) throw new Error("Refund payment source is missing");
          await this.repo.compensate(source.id,refund.refundedCents,Number(source.disputed_cents),refund.pendingCents);
          await this.repo.update(op,{state:refund.status==="succeeded"?"completed":refund.status==="failed"||refund.status==="canceled"?"failed":"awaiting"});
        }
      } else {
        const id=await this.provider.reverse(op);
        await this.repo.update(op,{providerId:id});
        await this.repo.recovered(op);
      }
    } catch(error) {
      // Ambiguous calls stay reserved and retry the SAME immutable operation.
      await this.repo.update(op,{state:"retry",error:error instanceof Error?error.message:String(error)});
      throw error;
    }
    return this.repo.get(op.id);
  }
  private async withdraw(op:Operation) {
    const sources=await this.repo.withdrawalSources(op.id);
    const reversed=sources.some(s=>s.compensation_changed || s.refund_pending);
    // Only the first claim is known not to have reached Stripe. Later claims
    // must resolve the immutable transfer operation before releasing reserves.
    if(reversed && !op.transfer_id && op.attempts===1) { await this.repo.release(op); return; }
    const transferId=await this.provider.transfer(op);
    await this.repo.update(op,{transferId});
    op.transfer_id=transferId;
    if(reversed && !op.provider_id && !op.payload.bankStarted) {
      await this.provider.reverse({...op,id:`cancel:${op.id}`,payload:{transferId}});
      await this.repo.release(op); return;
    }
    await this.repo.update(op,{bankStarted:true});
    const payout=await this.provider.payout(op);
    await this.repo.update(op,{providerId:payout.id,state:"awaiting"});
    if(payout.status==="paid") {
      await this.repo.paid(op);
      // A refund may have arrived while the bank payout was pending.
      for(const source of await this.repo.withdrawalSources(op.id)) {
        if(Number(source.compensated_cents)>0) await this.repo.compensate(source.id,Number(source.refunded_cents),Number(source.disputed_cents));
      }
    } else if(payout.status==="failed"||payout.status==="canceled") {
      await this.provider.reverse({...op,id:`cancel:${op.id}`,payload:{transferId}});
      await this.repo.release(op);
    }
  }
  async drain(limit=50) {
    let processed=0,failed=0;
    for(let i=0;i<limit;i++) {
      try { if(!await this.execute()) break; processed++; }
      catch { failed++; }
    }
    return {processed,failed};
  }
}