import { commerceStripe } from "./runtime";

/** Provider accounting snapshot, including processing fees; never infer a fee
 * or successful payment from browser metadata.
 */
export async function verifiedPayment(paymentIntent:string,gross:number,currency:string) {
  const stripe=commerceStripe();
  const pi=await stripe.paymentIntents.retrieve(paymentIntent,{expand:["latest_charge.balance_transaction"]});
  if(pi.status!=="succeeded"||pi.amount_received!==gross||pi.currency!==currency) throw new Error("Provider payment amount/status/currency mismatch");
  const charge=typeof pi.latest_charge==="string"?await stripe.charges.retrieve(pi.latest_charge,{expand:["balance_transaction"]}):pi.latest_charge;
  if(!charge || !charge.balance_transaction) throw new Error("Provider settlement accounting is not yet available");
  const balance=typeof charge.balance_transaction==="string"?await stripe.balanceTransactions.retrieve(charge.balance_transaction):charge.balance_transaction;
  if(balance.currency!==currency || balance.amount!==gross) throw new Error("FX settlement needs an explicit currency-conversion journal");
  let refundedCents=0,pendingCents=0;
  for await(const refund of stripe.refunds.list({payment_intent:paymentIntent,limit:100})) {
    if(refund.status==="succeeded") refundedCents+=refund.amount;
    if(refund.status==="pending"||refund.status==="requires_action") pendingCents+=refund.amount;
  }
  return {processingFeeCents:balance.fee,refundedCents,pendingCents,chargeId:charge.id,disputed:charge.disputed};
}