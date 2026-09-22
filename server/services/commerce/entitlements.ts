import type Stripe from "stripe";
import { pool } from "../../db";
import { commerceStripe } from "./runtime";
import { getStripePriceIds } from "../stripeSetup";
import { subscriptionPlan } from "../commercePolicy";

/** Resolve current provider state instead of trusting delivery order. */
export async function currentSubscription(event:Stripe.Event):Promise<Stripe.Subscription|null> {
  const stripe=commerceStripe();
  const incoming=await stripe.subscriptions.retrieve((event.data.object as Stripe.Subscription).id);
  const customer=typeof incoming.customer==="string"?incoming.customer:incoming.customer.id;
  const user=(await pool.query("SELECT subscription_tier,stripe_subscription_id FROM users WHERE stripe_customer_id=$1",[customer])).rows[0];
  if(!user) throw new Error("Subscription customer is not yet linked to a local user");
  if(user.subscription_tier==="lifetime") return null;
  if(user.stripe_subscription_id && user.stripe_subscription_id!==incoming.id) {
    const current=await stripe.subscriptions.retrieve(user.stripe_subscription_id);
    if(current.created>=incoming.created || !["active","trialing"].includes(incoming.status)) return null;
    // A newer paid subscription can supersede the old one, never the reverse.
    await pool.query("UPDATE users SET stripe_subscription_id=$2 WHERE stripe_customer_id=$1 AND stripe_subscription_id=$3",
      [customer,incoming.id,current.id]);
  }
  const prices=getStripePriceIds();
  const price=incoming.items.data[0]?.price.id;
  const plan=price===prices.monthly?"monthly":price===prices.yearly?"yearly":subscriptionPlan(incoming.metadata);
  incoming.metadata={...incoming.metadata,planId:plan};
  return incoming;
}