/** Only post-fix snapshots can authorize collaborator credits. Legacy
 * seller-only snapshots remain payable; ambiguous legacy splits need review. */
export function assertSettlementAuthorization(terms: any, sellerId: string, listingId: string) {
  if (!terms || ![1,2].includes(terms.version))
    throw new Error("Order has no checkout settlement terms; reconciliation is required");
  if (terms.version===2 && (terms.sellerId!==sellerId || terms.listingId!==listingId))
    throw new Error("Settlement authorization does not match order");
  if (terms.version===1 && (!Array.isArray(terms.allocations) ||
      terms.allocations.some((a:any)=>a.userId!==sellerId)))
    throw new Error("Legacy collaborator allocations require authorization reconciliation");
}