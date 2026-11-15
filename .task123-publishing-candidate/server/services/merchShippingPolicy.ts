export class MerchCheckoutError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
/** Shared pre-reservation/provider policy. Never release a reservation merely
 * because a provider call timed out: its session may already be payable. */
export function validateMerchShippingCountry(address: Record<string, string>): string {
  const raw = address?.country;
  const country = typeof raw === "string" ? raw.toUpperCase() : "";
  if (!country || !/^[A-Z]{2}$/.test(country))
    throw new MerchCheckoutError(400, "A valid shipping destination country is required");
  const allowed = (process.env.STRIPE_MERCH_SHIPPING_COUNTRIES || "")
    .split(",").map(value => value.trim().toUpperCase()).filter(Boolean);
  if (!allowed.includes(country))
    throw new MerchCheckoutError(400, "Shipping is not configured for this destination");
  return country;
}