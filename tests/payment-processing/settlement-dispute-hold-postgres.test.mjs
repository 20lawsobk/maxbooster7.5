import {test} from "node:test";
import assert from "node:assert/strict";
import {loadIsolated} from "./helpers-inbound.mjs";
import {applyCommerceMigrations,createCommerceFixtureSchema,startDisposablePostgres} from "./helpers-database-postgres.mjs";

test("all settlement consumers use current dispute accounting under the source lock",async t=>{
  const cluster=await startDisposablePostgres();t.after(()=>cluster.stop());const {pool}=cluster;
  await applyCommerceMigrations(pool);await createCommerceFixtureSchema(pool);
  await pool.query(`CREATE TABLE storefront_orders(id text PRIMARY KEY,buyer_id text,seller_id text,storefront_id text,amount_cents integer,currency text,status text,stripe_session_id text,stripe_payment_intent_id text,applied_promotion_id text,updated_at timestamptz DEFAULT now());
    CREATE TABLE merch_orders(id text PRIMARY KEY,user_id text,shipping_address jsonb);
    CREATE TABLE growth_merch_payments(order_id text PRIMARY KEY,checkout_id text,currency text,buyer_id text,subtotal_cents integer,state text);`);
  const {CommerceRepository}=await loadIsolated("server/services/commerce/repository.ts",{"../../logger.js":"export const logger={warn(){}};"});
  const repository=new CommerceRepository(pool);globalThis.__settlementHoldPool=pool;
  const mocks={
    "../../db":"export const pool=globalThis.__settlementHoldPool;",
    "./runtime":"export const commerceRepository=globalThis.__settlementHoldRepository,commerceStripe=()=>globalThis.__settlementHoldStripe;",
    "../merchCheckoutService":"export async function applyVerifiedMerchPayment(){};export function installMerchPaymentAdapter(){};",
    "../../config/defaults":"export const getBaseUrl=()=> 'https://app.example.invalid';",
  };
  // Production consumers and verification/resolver are real. Provider transport
  // and growth fulfillment are explicit fixtures; SQL ledger/locks are real.
  globalThis.__settlementHoldRepository={
    sourceByPayment:(...args)=>repository.sourceByPayment(...args),
    compensate:(...args)=>repository.compensate(...args),
    book:async (sale,initial)=>{
      const prior=await repository.sourceByPayment(sale.paymentIntent);
      await repository.book(sale,initial);
      if(!prior) assert.equal((await repository.balance(sale.allocations[0].userId)).available,0,"initial hold is committed atomically with booking");
      if(!prior&&globalThis.__settlementHoldStatus==="won") {
        await repository.compensate(sale.id,0,10000);
        await repository.compensate(sale.id,0,0);
      }
    },
  };
  const marketplace=await loadIsolated("server/services/commerce/settlement.ts",mocks);
  const merchant=await loadIsolated("server/services/commerce/merchant.ts",mocks);
  const growth=await loadIsolated("server/services/commerce/growthMerch.ts",mocks);
  for(const consumer of ["marketplace","merchant","growth"]) for(const status of ["won","needs_response","provider_failure","missing_accounting","pending_created","pending_succeeded"]) {
    await t.test(`${consumer}: historical charge.disputed=true with current ${status}`,async()=>{
      const id=`${consumer}-${status}`,payment=`pi-${id}`,charge=`ch-${id}`,seller=`seller-${id}`,buyer=`buyer-${id}`,session=`cs-${id}`;
      globalThis.__settlementHoldStatus=status;
      let currentDisputeReads=0,providerStatus=status,refundReads=0;
      const checkout={id:session,payment_status:"paid",currency:"usd",amount_total:10000,amount_subtotal:10000,
        payment_intent:payment,automatic_tax:{status:"complete"},total_details:{amount_tax:0},
        collected_information:{shipping_details:{name:"Fixture",address:{country:"US"}}},
        metadata:{buyerId:buyer,sellerId:seller,platformFeeCents:"1000",growthMerchOrderId:id}};
      globalThis.__settlementHoldStripe={
        paymentIntents:{retrieve:async()=>({status:"succeeded",amount_received:10000,currency:"usd",
          latest_charge:{id:charge,disputed:true,balance_transaction:{amount:10000,currency:"usd",fee:300}}})},
        charges:{retrieve:async()=>({id:charge,payment_intent:payment,disputed:true,currency:"usd",amount:10000})},
        refunds:{list:()=>({async *[Symbol.asyncIterator](){
          const first=++refundReads===1;
          if(status==="pending_created"&&!first)yield{id:`re-${id}`,status:"pending",amount:1000,payment_intent:payment};
          if(status==="pending_succeeded")yield{id:`re-${id}`,status:first?"pending":"succeeded",amount:1000,payment_intent:payment};
        }})},
        disputes:{list:params=>({async *[Symbol.asyncIterator](){
          assert.equal(params.charge,charge);currentDisputeReads++;
          if(providerStatus==="provider_failure") throw new Error("Fixture provider unavailable");
          if(providerStatus==="missing_accounting") return;
          yield {id:`dp-${id}`,charge,status:["pending_created","pending_succeeded"].includes(providerStatus)?"won":providerStatus,amount:10000,currency:"usd"};
        }})},
        checkout:{sessions:{retrieve:async()=>checkout}},
      };
      await pool.query("INSERT INTO users(id) VALUES($1),($2)",[seller,buyer]);
      let sourceId,settle;
      if(consumer==="marketplace") {
        sourceId=id;
        await pool.query("INSERT INTO listings(id,user_id) VALUES($1,$2)",[`listing-${id}`,seller]);
        await pool.query("INSERT INTO orders(id,user_id,seller_id,listing_id,amount,status,license_document_url) VALUES($1,$2,$3,$4,100,'pending','fixture-license')",[id,buyer,seller,`listing-${id}`]);
        settle=()=>marketplace.bookMarketplace({id,listingId:`listing-${id}`,sellerId:seller,userId:buyer,amount:100,currency:"usd",status:"pending",stripePaymentIntentId:payment,
          metadata:{amountCents:10000,settlementTerms:{version:2,sellerId:seller,listingId:`listing-${id}`,grossCents:10000,feeCents:1000,currency:"usd",allocations:[{userId:seller,cents:9000}]}}});
      } else if(consumer==="merchant") {
        sourceId=`merchant:${id}`;
        await pool.query("INSERT INTO storefront_orders(id,buyer_id,seller_id,storefront_id,amount_cents,currency,status) VALUES($1,$2,$3,'store-fixture',10000,'usd','pending')",[id,buyer,seller]);
        settle=()=>merchant.settleMerchantCheckout({...checkout,metadata:{commerceVersion:"2",commerceKind:"merchant",merchantOrderId:id,buyerId:buyer,sellerId:seller,platformFeeCents:"1000"}});
      } else {
        sourceId=`merch:${id}`;
        await pool.query("INSERT INTO merch_orders(id,user_id) VALUES($1,$2)",[id,seller]);
        await pool.query("INSERT INTO growth_merch_payments VALUES($1,$2,'usd',$3,10000,'pending')",[id,session,buyer]);
        settle=()=>growth.handleGrowthMerchCheckout(`evt-${id}`,checkout);
      }
      if(["provider_failure","missing_accounting"].includes(status)) {
        await assert.rejects(settle,/Fixture provider unavailable|accounting is not yet available/);
        assert.equal((await repository.balance(seller)).available,0,"provider failure never exposes initially disputed funds");
        assert.equal(Number((await repository.sourceByPayment(payment)).disputed_cents),10000);
        providerStatus="won";
        await settle();
      } else await settle();
      const expected=status==="needs_response"?10000:0;
      assert.equal(Number((await repository.sourceByPayment(payment)).disputed_cents),expected);
      assert.equal((await repository.balance(seller)).available,expected?0:["pending_created","pending_succeeded"].includes(status)?8100:9000);
      if(["pending_created","pending_succeeded"].includes(status)){
        const state=await repository.sourceByPayment(payment);
        assert.equal(Number(state.pending_refund_cents),status==="pending_created"?1000:0);
        assert.equal(Number(state.refunded_cents),status==="pending_created"?0:1000);
        assert.equal(Number(state.compensated_cents),1000);
      }
      assert.equal(currentDisputeReads,["provider_failure","missing_accounting"].includes(status)?2:1,"consumer executes the deferred authoritative resolver, including retries");
      assert.deepEqual((await pool.query("SELECT journal_id FROM commerce_entries GROUP BY journal_id HAVING sum(amount_cents)<>0")).rows,[]);
      assert.equal((await pool.query("SELECT id FROM commerce_sources WHERE id=$1",[sourceId])).rowCount,1);
    });
  }

  await t.test("stale initial snapshot replay never queues recovery against an already drawn won allocation",async()=>{
    const sale={id:"drawn-won",kind:"merch",paymentIntent:"pi-drawn-won",currency:"usd",grossCents:10000,feeCents:1000,allocations:[{userId:"drawn-seller",cents:9000}]};
    await repository.book(sale,{refunded:0,disputed:10000});
    await repository.compensate(sale.id,0,0);
    await pool.query("INSERT INTO commerce_operations(id,kind,user_id,currency,amount_cents,payload,state,transfer_id) VALUES('withdrawn-won','withdrawal','drawn-seller','usd',9000,'{}','completed','tr-fixture')");
    await pool.query("INSERT INTO commerce_draws(operation_id,allocation_id,amount_cents) VALUES('withdrawn-won','drawn-won:drawn-seller',9000)");
    await pool.query("UPDATE commerce_allocations SET drawn_cents=9000 WHERE source_id=$1",[sale.id]);
    await repository.book(sale,{refunded:0,disputed:10000});
    assert.equal(Number((await repository.sourceByPayment(sale.paymentIntent)).disputed_cents),0);
    assert.deepEqual((await pool.query("SELECT id FROM commerce_operations WHERE kind='reversal' AND payload->>'sourceId'=$1",[sale.id])).rows,[]);
  });

  await t.test("invalid initial compensation rolls back booking, allocations and journals",async()=>{
    const sale={id:"initial-rollback",kind:"merch",paymentIntent:"pi-initial-rollback",currency:"usd",grossCents:10000,feeCents:1000,allocations:[{userId:"initial-rollback-seller",cents:9000}]};
    await assert.rejects(repository.book(sale,{refunded:0,disputed:-1}),/Invalid dispute hold/);
    assert.equal(await repository.sourceByPayment(sale.paymentIntent),undefined);
    assert.deepEqual((await pool.query("SELECT id FROM commerce_allocations WHERE source_id=$1",[sale.id])).rows,[]);
    assert.deepEqual((await pool.query("SELECT id FROM commerce_journals WHERE source=$1",[sale.id])).rows,[]);
  });

  await t.test("real refund engine/provider refresh pending state inside the source transaction",async()=>{
    const id="engine-pending-refresh",payment="pi-engine-pending-refresh";
    await repository.book({id,kind:"merch",paymentIntent:payment,currency:"usd",grossCents:10000,feeCents:1000,allocations:[{userId:"engine-seller",cents:9000}]},{refunded:0,pendingRefund:1000});
    let reads=0;
    const sdk={refunds:{retrieve:async()=>({id:"re-engine",status:"succeeded",charge:"ch-engine"}),
      list:()=>({async *[Symbol.asyncIterator](){yield{id:"re-engine",payment_intent:payment,status:++reads===1?"pending":"succeeded",amount:1000};}})}};
    const {StripeCommerceProvider}=await loadIsolated("server/services/commerce/provider.ts",{stripe:"export default class Stripe {}"});
    const {CommerceEngine}=await loadIsolated("server/services/commerce/engine.ts");
    await pool.query("INSERT INTO commerce_operations(id,kind,user_id,currency,amount_cents,payload,provider_id) VALUES('engine-pending-op','refund','fixture-buyer','usd',1000,$1,'re-engine')",[JSON.stringify({paymentIntent:payment,orderId:id})]);
    await new CommerceEngine(repository,new StripeCommerceProvider(sdk)).execute("engine-pending-op");
    const source=await repository.sourceByPayment(payment);
    assert.equal(Number(source.refunded_cents),1000);
    assert.equal(Number(source.pending_refund_cents),0);
    assert.equal(Number(source.compensated_cents),1000);
    assert.equal((await repository.balance("engine-seller")).available,8100);
    assert.equal(reads,2);
  });
});
