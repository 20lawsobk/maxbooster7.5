import { test } from "node:test";
import assert from "node:assert/strict";
import { loadIsolated } from "./helpers-inbound.mjs";
import { applyCommerceMigrations, startDisposablePostgres } from "./helpers-database-postgres.mjs";

function barrier() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
}

test("refund reconciliation preserves newer dispute transitions in real isolated PostgreSQL", async t => {
  const cluster = await startDisposablePostgres();
  t.after(() => cluster.stop());
  const { pool } = cluster;
  await applyCommerceMigrations(pool);
  const { CommerceRepository } = await loadIsolated("server/services/commerce/repository.ts", {
    "../../logger.js": "export const logger={warn(){}};",
  });
  const repository = new CommerceRepository(pool);
  globalThis.__raceRepo = repository;
  globalThis.__racePool = pool;
  const { reconcileCharge } = await loadIsolated("server/services/commerce/compensation.ts", {
    "../../db": "export const pool=globalThis.__racePool;",
    "../../safety/stripeWebhookSecurity": "export const registerWebhookHandler=()=>{};",
    "./runtime": "export const commerceRepository=globalThis.__raceRepo,commerceEngine=()=>({}),commerceStripe=()=>globalThis.__raceStripe;",
    "../merchCheckoutService": "export async function applyVerifiedMerchPayment(){};",
  });

  for (const [name, initialHold, newerHold] of [["hold-created", 0, 10000], ["hold-won", 10000, 0]]) {
    await t.test(name, async () => {
      const id = `race-${name}`;
      await repository.book({
        id, kind: "merch", paymentIntent: `pi-${id}`, currency: "usd", grossCents: 10000,
        feeCents: 1000, allocations: [{ userId: `seller-${name}`, cents: 9000 }],
      });
      if (initialHold) await repository.compensate(id, 0, initialHold, 0);
      const providerReached = barrier();
      const finishProviderRead = barrier();
      globalThis.__raceStripe = {
        charges: { retrieve: async () => ({ payment_intent: `pi-${id}` }) },
        refunds: { list: () => ({ async *[Symbol.asyncIterator]() {
          providerReached.release();
          await finishProviderRead.promise;
        } }) },
      };
      // reconcileCharge has already read the source when provider pagination
      // starts. Commit a newer dispute state while that older refund event waits.
      const refundEvent = reconcileCharge(`ch-${id}`);
      await providerReached.promise;
      try {
        await repository.compensate(id, 0, newerHold, 0);
      } finally {
        finishProviderRead.release();
      }
      await refundEvent;
      const source = await repository.sourceByPayment(`pi-${id}`);
      assert.equal(Number(source.disputed_cents), newerHold);
      assert.equal(Number(source.compensated_cents), newerHold);
      const balance = await repository.balance(`seller-${name}`);
      assert.equal(balance.available, newerHold ? 0 : 9000);
      const journals = (await pool.query(`SELECT journal_id,sum(amount_cents)::text AS sum
        FROM commerce_entries GROUP BY journal_id HAVING sum(amount_cents)<>0`)).rows;
      assert.deepEqual(journals, []);
    });
  }
});
