import { pool } from "../../db";
import { commerceRepository } from "./runtime";
import { allocateNet, minorUnits } from "./contract";
import { verifiedPayment } from "./verification";

export async function snapshotMarketplaceTerms(order:{listingId:string;sellerId:string;amount:number;currency?:string;metadata?:any}) {
  const listing=(await pool.query("SELECT metadata FROM listings WHERE id=$1",[order.listingId])).rows[0];
  let splits=(await pool.query("SELECT user_id,percentage FROM royalty_splits WHERE release_id=$1 ORDER BY id",[order.listingId])).rows;
  if(!splits.length && listing?.metadata?.beatId) splits=(await pool.query("SELECT user_id,percentage FROM royalty_splits WHERE release_id=$1 ORDER BY id",[listing.metadata.beatId])).rows;
  const gross=order.metadata?.amountCents ?? minorUnits(Number(order.amount),order.currency||"usd");
  const feeRate=Number(process.env.PLATFORM_FEE_PERCENTAGE ?? 10);
  if(!Number.isFinite(feeRate)||feeRate<0||feeRate>=100) throw new Error("Invalid platform fee");
  const fee=Math.round(gross*feeRate/100);
  const allocations=allocateNet(gross,fee,splits.length?splits.map(s=>({userId:s.user_id,percentage:Number(s.percentage)})):[{userId:order.sellerId,percentage:100}]);
  return {version:1,grossCents:gross,feeCents:fee,currency:(order.currency||"usd").toLowerCase(),allocations};
}

export async function bookMarketplace(order:any) {
  const existing=await commerceRepository.sourceByPayment(order.stripePaymentIntentId);
  if(existing) {
    if(existing.id!==order.id) throw new Error("Payment already allocated to a different order");
    return;
  }
  if(order.status==="completed") throw new Error("Historical completed order needs reconciliation, not automatic re-credit");
  const terms=order.metadata?.settlementTerms;
  if(!terms || terms.version!==1) throw new Error("Order has no checkout settlement terms; reconciliation is required");
  const gross=order.metadata?.amountCents ?? minorUnits(Number(order.amount),order.currency||"usd");
  const fee=terms.feeCents;
  if(terms.grossCents!==gross || terms.currency!==(order.currency||"usd").toLowerCase() ||
    !Number.isSafeInteger(fee) || fee<0 || fee>=gross || !Array.isArray(terms.allocations) ||
    terms.allocations.some((a:any)=>!a.userId || !Number.isSafeInteger(a.cents) || a.cents<0) ||
    terms.allocations.reduce((sum:number,a:any)=>sum+a.cents,0)!==gross-fee) throw new Error("Invalid checkout settlement terms");
  const verified=await verifiedPayment(order.stripePaymentIntentId,gross,(order.currency||"usd").toLowerCase());
  await commerceRepository.book({
    id:order.id,kind:"marketplace",paymentIntent:order.stripePaymentIntentId,
    currency:(order.currency||"usd").toLowerCase(),grossCents:gross,feeCents:fee,
    processingFeeCents:verified.processingFeeCents,
    allocations:terms.allocations,
    metadata:{listingId:order.listingId,buyerId:order.userId,sellerId:order.sellerId},
  });
  if(verified.refundedCents||verified.pendingCents||verified.disputed) {
    await commerceRepository.compensate(order.id,verified.refundedCents,verified.disputed?gross:0,verified.pendingCents);
  }
}