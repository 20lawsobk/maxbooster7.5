import type Stripe from "stripe";

export interface ReversalState {refunded:number;pendingRefund:number;disputed?:number}
export type ReversalReader=(paymentIntent:string)=>Promise<ReversalState>;

/** Refresh decreasing pending totals while owning the source transaction lock. */
export function deferredReversalState(stripe:Stripe,paymentIntent:string,options:{
  dispute?:(paymentIntent:string)=>Promise<number>;
  refunds?:(rows:Stripe.Refund[])=>void;
}={}):ReversalReader {
  return async lockedPaymentIntent=>{
    if(lockedPaymentIntent!==paymentIntent) throw new Error("Refund payment source changed");
    let timer:ReturnType<typeof setTimeout>|undefined;
    const read=async()=>{
      let refunded=0,pendingRefund=0;
      const rows:Stripe.Refund[]=[];
      for await(const refund of stripe.refunds.list({payment_intent:paymentIntent,limit:100},{timeout:8_000,maxNetworkRetries:0})) {
        const identity=typeof refund.payment_intent==="string"?refund.payment_intent:refund.payment_intent?.id;
        if((identity&&identity!==paymentIntent)||!Number.isSafeInteger(refund.amount)||refund.amount<0||
            !["succeeded","pending","requires_action","failed","canceled"].includes(refund.status||"")) {
          throw new Error("Refund accounting identity/state is invalid");
        }
        if(refund.status==="succeeded")refunded+=refund.amount;
        if(refund.status==="pending"||refund.status==="requires_action")pendingRefund+=refund.amount;
        if(!Number.isSafeInteger(refunded)||!Number.isSafeInteger(pendingRefund)) throw new Error("Invalid refund accounting total");
        rows.push(refund);
      }
      const disputed=options.dispute?await options.dispute(lockedPaymentIntent):undefined;
      options.refunds?.(rows);
      return {refunded,pendingRefund,...(disputed===undefined?{}:{disputed})};
    };
    try {
      return await Promise.race([read(),new Promise<never>((_,reject)=>{
        timer=setTimeout(()=>reject(new Error("Reversal accounting read timed out")),10_000);
      })]);
    } finally {if(timer)clearTimeout(timer);}
  };
}
