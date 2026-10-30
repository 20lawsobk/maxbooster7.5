/** Pure policies shared by the money-moving service and its isolated tests. */
import { currencyFactor } from "./commerce/contract";
export function validateCustomerRefund(
  order: { userId: string; amount: number; status: string; currency?:string|null;metadata?:unknown },
  actorId: string,
  requestedCents?: number,
): number {
  if (order.userId !== actorId) throw new Error("Not authorized to refund this order");
  if (order.status !== "completed") throw new Error("Order is not eligible for refund");
  const metadata=order.metadata as {amountCents?:number}|undefined;
  const total = metadata?.amountCents ?? Math.round(Number(order.amount) * currencyFactor(order.currency||"usd"));
  const amount = requestedCents ?? total;
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > total) {
    throw new Error("Invalid refund amount");
  }
  return amount;
}

export function subscriptionPlan(metadata: Record<string, string> | null | undefined): string {
  const plan = metadata?.planId ?? metadata?.planName ?? metadata?.plan ?? metadata?.tier;
  if (plan !== "monthly" && plan !== "yearly" && plan !== "lifetime") {
    throw new Error("Missing or unsupported subscription plan metadata");
  }
  return plan;
}