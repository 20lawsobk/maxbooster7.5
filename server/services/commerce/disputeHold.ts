import type Stripe from "stripe";

const readOptions={timeout:8_000,maxNetworkRetries:0};
const statuses=new Set(["warning_needs_response","warning_under_review","warning_closed","needs_response","under_review","won","lost"]);

/** Charge.disputed is historical, not proof of a currently withheld amount. */
export function deferredDisputeHold(stripe:Stripe,paymentIntent:string,chargeId:string) {
  return async (lockedPaymentIntent:string):Promise<number>=>{
    if(lockedPaymentIntent!==paymentIntent) throw new Error("Dispute payment source changed");
    let timer:ReturnType<typeof setTimeout>|undefined;
    const read=async()=>{
      const charge=await stripe.charges.retrieve(chargeId,readOptions);
      const payment=typeof charge.payment_intent==="string"?charge.payment_intent:charge.payment_intent?.id;
      if(charge.id!==chargeId||payment!==paymentIntent||typeof charge.disputed!=="boolean") {
        throw new Error("Dispute charge identity changed");
      }
      let held=0;
      const seen=new Set<string>();
      for await(const dispute of stripe.disputes.list({charge:chargeId,limit:100},readOptions)) {
        const identity=typeof dispute.charge==="string"?dispute.charge:dispute.charge?.id;
        if(identity!==chargeId||!dispute.id||seen.has(dispute.id)||!statuses.has(dispute.status)||
            dispute.currency!==charge.currency||!Number.isSafeInteger(dispute.amount)||dispute.amount<0) {
          throw new Error("Dispute accounting identity/state is invalid");
        }
        seen.add(dispute.id);
        if(!["won","warning_closed"].includes(dispute.status)) held+=dispute.amount;
        if(!Number.isSafeInteger(held)||held>charge.amount) throw new Error("Dispute hold exceeds charge accounting");
      }
      if(charge.disputed&&!seen.size) throw new Error("Disputed charge accounting is not yet available");
      return held;
    };
    try {
      return await Promise.race([read(),new Promise<never>((_,reject)=>{
        timer=setTimeout(()=>reject(new Error("Dispute accounting read timed out")),10_000);
      })]);
    } finally {if(timer)clearTimeout(timer);}
  };
}
