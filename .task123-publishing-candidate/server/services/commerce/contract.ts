export interface Allocation { userId: string; cents: number }
export interface Sale {
  id: string; kind: "marketplace" | "merchant" | "merch" | "royalty";
  paymentIntent: string | null; currency: string; grossCents: number;
  feeCents: number; allocations: Allocation[]; metadata?: Record<string, unknown>;
  processingFeeCents?: number;
  taxCents?: number;
}
export interface Operation {
  id: string; kind: "withdrawal" | "refund" | "reversal";
  user_id: string; currency: string; amount_cents: number;
  state: string; payload: Record<string, any>; transfer_id?: string;
  provider_id?: string; lease_token?: string; created_at: string;
  attempts?: number;
  error?: string;
}
/** Growth producer stores this on Checkout Session AND PaymentIntent metadata.
 * Server must derive amounts/merchant identity from its own product records.
 */
export interface MerchantCheckoutMetadata {
  commerceVersion: "2";
  commerceKind: "merchant";
  merchantOrderId: string;
  sellerId: string;
  buyerId: string;
  platformFeeCents: string;
}
export function currencyFactor(currency="usd"):number {
  const code=currency.toUpperCase();
  if(!/^[A-Z]{3}$/.test(code)) throw new Error("Invalid currency");
  const exponent=new Intl.NumberFormat("en",{style:"currency",currency:code}).resolvedOptions().maximumFractionDigits;
  return 10**(exponent??2);
}
export function majorUnits(value:number,currency="usd") {return value/currencyFactor(currency);}
export function minorUnits(value: number,currency="usd"): number {
  const cents = Math.round(value * currencyFactor(currency));
  if (!Number.isFinite(value) || !Number.isSafeInteger(cents) || cents <= 0) throw new Error("Invalid monetary amount");
  return cents;
}
export function allocateNet(grossCents: number, feeCents: number, splits: { userId: string; percentage: number }[]): Allocation[] {
  if (!Number.isSafeInteger(grossCents) || !Number.isSafeInteger(feeCents) || grossCents <= 0 || feeCents < 0 || feeCents >= grossCents) throw new Error("Invalid settlement amounts");
  if (!splits.length || splits.some(s => !s.userId || !Number.isFinite(s.percentage) || s.percentage <= 0) ||
      Math.abs(splits.reduce((n,s) => n+s.percentage,0)-100)>0.000001) throw new Error("Splits must total 100 percent");
  const net = grossCents-feeCents;
  const lines = splits.map(s => ({ userId:s.userId, cents:Math.floor(net*s.percentage/100), remainder:(net*s.percentage/100)%1 }));
  let left = net-lines.reduce((n,s)=>n+s.cents,0);
  for (const line of [...lines].sort((a,b)=>b.remainder-a.remainder || a.userId.localeCompare(b.userId))) if (left-- > 0) line.cents++;
  const merged = new Map<string,number>();
  for (const line of lines) merged.set(line.userId,(merged.get(line.userId)||0)+line.cents);
  return [...merged].map(([userId,cents])=>({userId,cents}));
}