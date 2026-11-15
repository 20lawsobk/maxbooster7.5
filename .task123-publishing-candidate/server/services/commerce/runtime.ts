import { createStripeClient, getStripeSecretKey } from "../../lib/stripeClient";
import { pool } from "../../db";
import { CommerceRepository } from "./repository";
import { StripeCommerceProvider } from "./provider";
import { CommerceEngine } from "./engine";
export const commerceRepository=new CommerceRepository(pool);
export function commerceStripe() {
  const key=getStripeSecretKey();
  if(!key) throw new Error("Stripe is not configured for this runtime");
  return createStripeClient(key);
}
export function commerceEngine() {
  return new CommerceEngine(commerceRepository,new StripeCommerceProvider(commerceStripe()));
}