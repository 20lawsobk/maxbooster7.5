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
        charges: { retrieve: async () => {providerReached.release();await finishProviderRead.promise;return {payment_intent:`pi-${id}`};} },
        refunds: { list: () => ({ async *[Symbol.asyncIterator]() {} }) },
      };
      // A newer dispute transition commits while the earlier event is still
      // waiting for its provider charge; refund-only refresh must preserve it.
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

  await t.test("older dispute event reads current provider state after delayed refund pagination", async () => {
    const id="race-dispute-order";
    await repository.book({id,kind:"merch",paymentIntent:`pi-${id}`,currency:"usd",grossCents:10000,
      feeCents:1000,allocations:[{userId:"seller-dispute-order",cents:9000}]});
    const reached=barrier(),resume=barrier();
    let providerStatus="needs_response",pages=0;
    globalThis.__raceStripe={
      charges:{retrieve:async()=>({payment_intent:`pi-${id}`})},
      disputes:{retrieve:async()=>({id:"dp-order",charge:"ch-order",status:providerStatus,amount:10000,balance_transactions:[]})},
      refunds:{list:()=>({async *[Symbol.asyncIterator](){
        if(++pages===1){reached.release();await resume.promise;}
      }})},
    };
    const older=reconcileCharge("ch-order",{id:"dp-order"});
    await reached.promise;
    try {
      providerStatus="won";
      const newer=reconcileCharge("ch-order",{id:"dp-order"});
      const deadline=Date.now()+2000;let waiting=false;
      while(Date.now()<deadline){
        waiting=(await pool.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted) AS waiting")).rows[0].waiting;
        if(waiting)break;await new Promise(resolve=>setTimeout(resolve,5));
      }
      assert.equal(waiting,true);
      resume.release();await newer;
    } finally {resume.release();}
    await older;
    const source=await repository.sourceByPayment(`pi-${id}`);
    assert.equal(Number(source.disputed_cents),0);
    assert.equal((await repository.balance("seller-dispute-order")).available,9000);
  });

  await t.test("authoritative dispute reads serialize on the same source transaction", async () => {
    const id="race-dispute-serialized";
    await repository.book({id,kind:"merch",paymentIntent:`pi-${id}`,currency:"usd",grossCents:10000,
      feeCents:1000,allocations:[{userId:"seller-dispute-serialized",cents:9000}]});
    const reached=barrier(),resume=barrier();let newerReads=0;
    const older=repository.compensate(id,0,async payment=>{
      assert.equal(payment,`pi-${id}`);reached.release();await resume.promise;return 10000;
    });
    await reached.promise;
    const newer=repository.compensate(id,0,async()=>{newerReads++;return 0;});
    try {
      const deadline=Date.now()+2000;let waiting=false;
      while(Date.now()<deadline) {
        waiting=(await pool.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted) AS waiting")).rows[0].waiting;
        if(waiting)break;
        await new Promise(resolve=>setTimeout(resolve,5));
      }
      assert.equal(waiting,true,"second transaction waits for the source lock");
      assert.equal(newerReads,0,"provider state is not observed before owning the source lock");
    } finally {resume.release();}
    await Promise.all([older,newer]);
    assert.equal(Number((await repository.sourceByPayment(`pi-${id}`)).disputed_cents),0);
    assert.equal((await repository.balance("seller-dispute-serialized")).available,9000);
  });

  await t.test("dispute identity mismatch rolls back without fees or hold changes", async () => {
    const id="race-dispute-identity";
    await repository.book({id,kind:"merch",paymentIntent:`pi-${id}`,currency:"usd",grossCents:10000,
      feeCents:1000,allocations:[{userId:"seller-dispute-identity",cents:9000}]});
    globalThis.__raceStripe={charges:{retrieve:async()=>({payment_intent:`pi-${id}`})},
      disputes:{retrieve:async()=>({id:"dp-other",charge:"ch-another-source",status:"needs_response",amount:10000,balance_transactions:[]})},
      refunds:{list:()=>({async *[Symbol.asyncIterator](){}})}};
    await assert.rejects(reconcileCharge("ch-expected",{id:"dp-other"}),/Dispute charge identity changed/);
    assert.equal(Number((await repository.sourceByPayment(`pi-${id}`)).disputed_cents),0);
    assert.equal((await repository.balance("seller-dispute-identity")).available,9000);
  });

  await t.test("hung dispute read rolls back and releases its source lock", async () => {
    const id="race-dispute-timeout";
    await repository.book({id,kind:"merch",paymentIntent:`pi-${id}`,currency:"usd",grossCents:10000,
      feeCents:1000,allocations:[{userId:"seller-dispute-timeout",cents:9000}]});
    await assert.rejects(repository.compensate(id,0,()=>new Promise(()=>{})),/Dispute state read timed out/);
    await repository.compensate(id,0,10000);
    assert.equal(Number((await repository.sourceByPayment(`pi-${id}`)).disputed_cents),10000);
  });

  await pool.query("CREATE TABLE refunds(id text PRIMARY KEY,stripe_refund_id text,status text,processed_at timestamptz)");
  for(const kind of ["pending-created","pending-succeeded"]) await t.test(`pending refund observations serialize: ${kind}`,async()=>{
    const id=`pending-${kind}`,payment=`pi-${id}`;
    await repository.book({id,kind:"merch",paymentIntent:payment,currency:"usd",grossCents:10000,feeCents:1000,allocations:[{userId:`seller-${id}`,cents:9000}]});
    const reached=barrier(),resume=barrier();let reads=0;
    globalThis.__raceStripe={charges:{retrieve:async()=>({payment_intent:payment})},refunds:{list:()=>({async *[Symbol.asyncIterator](){
      const first=++reads===1;
      if(!first||kind==="pending-succeeded")yield{id:`re-${id}`,payment_intent:payment,status:first?"pending":kind==="pending-created"?"pending":"succeeded",amount:1000,metadata:{commerceOperation:`op-${id}`}};
      if(first){reached.release();await resume.promise;}
    }})}};
    const older=reconcileCharge(`ch-${id}`);await reached.promise;
    const newer=reconcileCharge(`ch-${id}`);
    try{
      const deadline=Date.now()+2000;let waiting=false;
      while(Date.now()<deadline){waiting=(await pool.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted) AS waiting")).rows[0].waiting;
        if(waiting)break;await new Promise(resolve=>setTimeout(resolve,5));}
      assert.equal(waiting,true,"pending totals are observed only after owning the source lock");
      assert.equal(reads,1);
    } finally {resume.release();}
    await Promise.all([older,newer]);
    const source=await repository.sourceByPayment(payment);
    assert.equal(Number(source.pending_refund_cents),kind==="pending-created"?1000:0);
    assert.equal(Number(source.refunded_cents),kind==="pending-created"?0:1000);
    assert.equal(Number(source.compensated_cents),1000);
    assert.equal((await repository.balance(`seller-${id}`)).available,8100);
  });

  await t.test("legacy lifetime entitlement uses current provider status instead of stale event status", async () => {
    await pool.query("CREATE TABLE users(id text PRIMARY KEY,stripe_customer_id text,subscription_tier text,subscription_status text,subscription_ends_at timestamptz)");
    for(const [id,initialTier,initialStatus,eventStatus,currentStatus,expectedTier,expectedStatus] of [
      ["late-open","lifetime","active","needs_response","won","lifetime","active"],
      ["late-won","free","refunded","won","lost","free","refunded"],
      ["current-won","free","refunded","needs_response","won","lifetime","active"],
      ["banned-won","free","banned","needs_response","won","free","banned"],
    ]) {
      await pool.query("INSERT INTO users VALUES($1,$2,$3,$4,NULL)",[id,`cus-${id}`,initialTier,initialStatus]);
      globalThis.__raceStripe={
        charges:{retrieve:async()=>({id:`ch-${id}`,payment_intent:`pi-${id}`,customer:`cus-${id}`,paid:true,amount:10000,amount_refunded:0})},
        paymentIntents:{retrieve:async()=>({metadata:{planId:"lifetime"}})},
        disputes:{retrieve:async()=>({id:`dp-${id}`,charge:`ch-${id}`,status:currentStatus,amount:10000,balance_transactions:[]})},
      };
      await reconcileCharge(`ch-${id}`,{id:`dp-${id}`,status:eventStatus});
      const row=(await pool.query("SELECT subscription_tier,subscription_status FROM users WHERE id=$1",[id])).rows[0];
      assert.deepEqual(row,{subscription_tier:expectedTier,subscription_status:expectedStatus},id);
    }
  });

  await t.test("legacy lifetime provider observations serialize before entitlement writes", async () => {
    const id="lifetime-overlap",customer="cus-lifetime-overlap",chargeId="ch-lifetime-overlap",payment="pi-lifetime-overlap";
    await pool.query("INSERT INTO users VALUES($1,$2,'lifetime','active',NULL)",[id,customer]);
    const reached=barrier(),resume=barrier();let status="needs_response",reads=0;
    globalThis.__raceStripe={
      charges:{retrieve:async()=>({id:chargeId,payment_intent:payment,customer,paid:true,amount:10000,amount_refunded:0})},
      paymentIntents:{retrieve:async()=>({metadata:{planId:"lifetime"}})},
      disputes:{retrieve:async()=>{
        const observed=status;
        if(++reads===1){reached.release();await resume.promise;}
        return {id:"dp-lifetime-overlap",charge:chargeId,status:observed,amount:10000,balance_transactions:[]};
      }},
    };
    const older=reconcileCharge(chargeId,{id:"dp-lifetime-overlap",status:"needs_response"});
    await reached.promise;status="won";
    const newer=reconcileCharge(chargeId,{id:"dp-lifetime-overlap",status:"won"});
    try {
      const deadline=Date.now()+2000;let waiting=false;
      while(Date.now()<deadline) {
        waiting=(await pool.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE NOT granted) AS waiting")).rows[0].waiting;
        if(waiting)break;
        await new Promise(resolve=>setTimeout(resolve,5));
      }
      assert.equal(waiting,true,"second lifetime transition waits for the customer row lock");
      assert.equal(reads,1,"current provider status is read only while owning the customer row");
    } finally {resume.release();}
    await Promise.all([older,newer]);
    const row=(await pool.query("SELECT subscription_tier,subscription_status FROM users WHERE id=$1",[id])).rows[0];
    assert.deepEqual(row,{subscription_tier:"lifetime",subscription_status:"active"});
  });
});
