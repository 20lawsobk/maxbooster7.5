import { sql } from "drizzle-orm";

/** Billing is not an account-reactivation authority. Evaluate atomically in
 * the UPDATE so a concurrent suspension cannot be overwritten by a webhook. */
export function billingAccountStatus(status: string) {
  return sql`CASE WHEN subscription_status IN ('suspended','banned')
    THEN subscription_status ELSE ${status} END`;
}