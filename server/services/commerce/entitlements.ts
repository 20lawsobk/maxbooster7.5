import type Stripe from "stripe";
import { pool } from "../../db";
import { commerceStripe } from "./runtime";
import { getStripePriceIds } from "../stripeSetup";
import { subscriptionPlan } from "../commercePolicy";

/** Resolve current provider state instead of trusting delivery order. */
export async function currentSubscription(event:Stripe.Event):Promise<Stripe.Subscription|null> {
  const stripe=commerceStripe();
  const requestedId=(event.data.object as Stripe.Subscription).id;
  if(typeof requestedId!=="string" || !requestedId) throw new Error("Missing subscription identity");
  const incoming=await stripe.subscriptions.retrieve(requestedId);
  if(incoming.id!==requestedId) throw new Error("Provider subscription identity does not match the event");
  const customer=typeof incoming.customer==="string"?incoming.customer:incoming.customer.id;
  if(typeof customer!=="string" || !customer) throw new Error("Missing subscription customer identity");
  const users=(await pool.query("SELECT id,subscription_tier,stripe_subscription_id FROM users WHERE stripe_customer_id=$1",[customer])).rows;
  if(users.length!==1) throw new Error(users.length===0
    ? "Subscription customer is not yet linked to a local user"
    : "Subscription customer is linked to multiple local users");
  const user=users[0];
  if(user.subscription_tier==="lifetime") return null;
  if(user.stripe_subscription_id && user.stripe_subscription_id!==incoming.id) {
    const current=await stripe.subscriptions.retrieve(user.stripe_subscription_id);
    const currentCustomer=typeof current.customer==="string"?current.customer:current.customer.id;
    if(current.id!==user.stripe_subscription_id || currentCustomer!==customer) {
      throw new Error("Current provider subscription does not match the linked customer");
    }
    if(!Number.isSafeInteger(current.created) || !Number.isSafeInteger(incoming.created)) {
      throw new Error("Provider subscription chronology is invalid");
    }
    if(current.created>=incoming.created || !["active","trialing"].includes(incoming.status)) return null;
  }
  // Validate the authoritative price/plan before changing the local pointer.
  // Inline-priced legacy recurring checkout carries monthly/yearly metadata;
  // lifetime purchases are one-time checkout and cannot come from this path.
  const prices=getStripePriceIds();
  const price=incoming.items.data[0]?.price.id;
  const plan=price===prices.monthly?"monthly":price===prices.yearly?"yearly":subscriptionPlan(incoming.metadata);
  if(plan==="lifetime") throw new Error("Recurring subscriptions cannot grant lifetime entitlements");
  // Provider reads can race another webhook or a lifetime upgrade. Admit only
  // the exact local owner and subscription generation observed above. Consumers
  // also condition their entitlement write on this pointer and lifetime tier.
  const claimed=await pool.query(`UPDATE users SET stripe_subscription_id=$3
    WHERE id=$1 AND stripe_customer_id=$2
      AND stripe_subscription_id IS NOT DISTINCT FROM $4
      AND subscription_tier IS DISTINCT FROM 'lifetime'
    RETURNING id`, [user.id,customer,incoming.id,user.stripe_subscription_id]);
  if(claimed.rowCount!==1) return null;
  incoming.metadata={...incoming.metadata,planId:plan};
  return incoming;
}
