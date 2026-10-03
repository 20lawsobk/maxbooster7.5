import { pool } from "../../db";
import { commerceRepository } from "./runtime";
import { allocateNet, minorUnits } from "./contract";
import { verifiedPayment } from "./verification";
import { assertSettlementAuthorization } from "./settlementAuthorization";

export async function snapshotMarketplaceTerms(order:{listingId:string;sellerId:string;amount:number;currency?:string;metadata?:any}) {
  const listing=(await pool.query("SELECT user_id,metadata FROM listings WHERE id=$1",[order.listingId])).rows[0];
  if (!listing || listing.user_id !== order.sellerId) throw new Error("Marketplace seller does not own listing");
  // Pending invitations are not payment authorization. user_id on approved
  // settlement rows identifies the beneficiary; pending UI rows identify creator.
  const approved = "SELECT user_id,percentage FROM royalty_splits WHERE release_id=$1 AND status IN ('active','verified') ORDER BY id";
  let splits=(await pool.query(approved,[order.listingId])).rows;
  if(!splits.length && listing.metadata?.beatId) {
    const beat=(await pool.query("SELECT user_id FROM beats WHERE id=$1",[listing.metadata.beatId])).rows[0];
    if (!beat || beat.user_id !== order.sellerId) throw new Error("Listing references an unowned beat");
    splits=(await pool.query(approved,[listing.metadata.beatId])).rows;
  }
  const gross=order.metadata?.amountCents ?? minorUnits(Number(order.amount),order.currency||"usd");
  const feeRate=Number(process.env.PLATFORM_FEE_PERCENTAGE ?? 10);
  if(!Number.isFinite(feeRate)||feeRate<0||feeRate>=100) throw new Error("Invalid platform fee");
  const fee=Math.round(gross*feeRate/100);
  const allocations=allocateNet(gross,fee,splits.length?splits.map(s=>({userId:s.user_id,percentage:Number(s.percentage)})):[{userId:order.sellerId,percentage:100}]);
  return {version:2,sellerId:order.sellerId,listingId:order.listingId,grossCents:gross,feeCents:fee,currency:(order.currency||"usd").toLowerCase(),allocations};
}

export async function bookMarketplace(order:any) {
  const existing=await commerceRepository.sourceByPayment(order.stripePaymentIntentId);
  if(existing) {
    if(existing.id!==order.id) throw new Error("Payment already allocated to a different order");
    return;
  }
  if(order.status==="completed") throw new Error("Historical completed order needs reconciliation, not automatic re-credit");
  const terms=order.metadata?.settlementTerms;
  assertSettlementAuthorization(terms,order.sellerId,order.listingId);
  const listing=(await pool.query("SELECT user_id FROM listings WHERE id=$1",[order.listingId])).rows[0];
  if (!listing || listing.user_id!==order.sellerId) throw new Error("Settlement seller does not own listing");
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