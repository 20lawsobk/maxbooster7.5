import { build } from "esbuild";
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFile } from "node:fs/promises";

// Bundle only actual commerce subjects; every external boundary is intercepted.
// Run with env -i to prevent accidental credential/provider access.
async function subject(entry, mocks) {
  const result = await build({
    entryPoints: [entry], bundle: true, write: false, platform: "node", format: "esm",
    plugins: [{ name: "isolated-boundaries", setup(b) {
      b.onResolve({ filter: /.*/ }, args => {
        if (Object.hasOwn(mocks, args.path)) return { path: args.path, namespace: "mock" };
      });
      b.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "js" }));
    } }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}

test("simulated beta: reports include new withdrawals by currency and keep legacy evidence outside totals", async () => {
  const calls=[];
  const operations=[
    {id:"usd",user_id:"seller",kind:"withdrawal",amount_cents:1250,currency:"usd",state:"completed",created_at:"2026-01-01"},
    {id:"jpy",user_id:"seller",kind:"withdrawal",amount_cents:2500,currency:"jpy",state:"completed",created_at:"2026-01-02"},
    {id:"queued",user_id:"seller",kind:"withdrawal",amount_cents:500,currency:"usd",state:"pending",created_at:"2026-01-03"},
  ];
  globalThis.__commerceReadPool={query:async(sql,args)=>{
    calls.push({sql,args});
    return {rows:sql.includes("commerce_operations")?operations:[{id:"legacy",amount_cents:999999,currency:"usd",status:"completed"}]};
  }};
  const reads=await subject("server/services/commerce/readModels.ts",{
    "../../db":"export const pool=globalThis.__commerceReadPool;",
  });
  const result=await reads.commercePayoutReport("seller",new Date("2026-01-01"),new Date("2026-02-01"));
  assert.equal(result.totalPayouts,3);
  assert.equal(result.summary.byCurrency.usd.completedAmount,12.5);
  assert.equal(result.summary.byCurrency.jpy.completedAmount,2500);
  assert.equal(result.payouts[0].amount,"12.5");
  assert.equal(result.payouts[2].completedAt,null);
  assert.equal(result.reconciliation.includedInTotals,false);
  assert.equal(result.reconciliation.payouts[0].id,"legacy");
  assert.ok(calls.every(c=>c.args[0]==="seller" && c.sql.startsWith("SELECT")));
  const evidence=await reads.legacyReconciliation("seller");
  assert.equal(evidence.withdrawable,false);
  assert.equal(evidence.status,"requires_reconciliation");
  assert.equal(evidence.orders.length,1);
});

test("simulated beta: frozen checkout allocations survive later split changes; missing terms require review", async () => {
  let splits=[{user_id:"seller",percentage:75},{user_id:"collaborator",percentage:25}];
  let booked;
  globalThis.__commerceSnapshotPool={query:async sql=>({rows:sql.includes("royalty_splits")?splits:[{metadata:{}}]})};
  globalThis.__commerceSnapshotRepo={sourceByPayment:async()=>null,book:async sale=>{booked=sale;}};
  const settlement=await subject("server/services/commerce/settlement.ts",{
    "../../db":"export const pool=globalThis.__commerceSnapshotPool;",
    "./runtime":"export const commerceRepository=globalThis.__commerceSnapshotRepo;",
    "./verification":"export async function verifiedPayment(){return {processingFeeCents:59,refundedCents:0,pendingCents:0,disputed:false};}",
  });
  const order={id:"order",listingId:"listing",sellerId:"seller",userId:"buyer",amount:10,currency:"usd",stripePaymentIntentId:"pi_beta",status:"pending",metadata:{amountCents:1000}};
  const terms=await settlement.snapshotMarketplaceTerms(order);
  splits=[{user_id:"changed",percentage:100}];
  order.metadata.settlementTerms=terms;
  await settlement.bookMarketplace(order);
  assert.equal(booked.feeCents,100);
  assert.deepEqual(booked.allocations,[{userId:"seller",cents:675},{userId:"collaborator",cents:225}]);
  assert.equal(booked.processingFeeCents,59);
  await assert.rejects(settlement.bookMarketplace({...order,metadata:{amountCents:1000}}),/reconciliation/);
  await assert.rejects(settlement.bookMarketplace({...order,metadata:{...order.metadata,settlementTerms:{...terms,grossCents:1}}}),/Invalid checkout/);
});

test("simulated beta: payout UI wires exact cents, stable retry command and truthful standard timing", async () => {
  const ui=await readFile("client/src/components/marketplace/PayoutDashboard.tsx","utf8");
  const api=await readFile("client/src/lib/queryClient.ts","utf8");
  assert.match(ui,/amountCents: intent.amountCents/);
  assert.match(ui,/"Idempotency-Key": intent.key/);
  assert.match(ui,/requestPersistedPayout\(user.id,amountCents/);
  assert.match(api,/headers: Record<string, string> = \{ \.\.\.options\?\.headers \}/);
  assert.doesNotMatch(ui,/T\+0|arrive in minutes|paid instantly/);
});

test("simulated beta: actual purchase producer -> registered webhook -> settlement replay uses one frozen order", async () => {
  let order,insertions=0,bookings=0,source=null,providerCreates=0,lostResponse=true;
  const sessions=[];
  const query=async(sql,args=[])=>{
    if(sql.includes("FROM listings")) return {rows:[{metadata:{}}]};
    if(sql.includes("FROM royalty_splits")) return {rows:[]};
    if(sql.startsWith("SELECT * FROM orders")) return {rows:order?[order]:[]};
    if(sql.startsWith("INSERT INTO orders")) {
      insertions++;
      order={id:args[0],user_id:args[1],seller_id:args[2],listing_id:args[3],license_type:args[4],amount:args[5],
        currency:"usd",status:"pending",license_snapshot:args[6],metadata:args[7],created_at:"2026-01-01"};
      return {rows:[order]};
    }
    if(sql.startsWith("UPDATE orders SET metadata")) Object.assign(order.metadata,JSON.parse(args[1]));
    return {rows:[]};
  };
  globalThis.__chainPool={query,connect:async()=>({query,release(){}})};
  globalThis.__chainRepo={
    sourceByPayment:async()=>source,
    book:async sale=>{bookings++;assert.equal(sale.allocations[0].cents,900);source=sale;order.status="completed";},
  };
  const settlement=await subject("server/services/commerce/settlement.ts",{
    "../../db":"export const pool=globalThis.__chainPool;",
    "./runtime":"export const commerceRepository=globalThis.__chainRepo;",
    "./verification":"export async function verifiedPayment(){return {processingFeeCents:59,refundedCents:0,pendingCents:0,disputed:false};}",
  });
  globalThis.__chainSettlement=settlement;
  const checkout=await subject("server/services/commerce/marketplaceCheckout.ts",{
    "../../db":"export const pool=globalThis.__chainPool;",
    "./settlement":"export const snapshotMarketplaceTerms=globalThis.__chainSettlement.snapshotMarketplaceTerms;",
  });
  globalThis.__chainCheckout=checkout;
  globalThis.__chainStripe={checkout:{sessions:{
    list:async function*(){yield* sessions;},
    retrieve:async()=>sessions[0],
    create:async params=>{
      providerCreates++;
      assert.equal(insertions,1);
      assert.equal(order.metadata.settlementTerms.feeCents,100);
      assert.equal(params.payment_intent_data.metadata.orderId,order.id);
      sessions.push({id:"cs_beta",url:"https://checkout.invalid/beta",status:"open",metadata:params.metadata,
        payment_intent:"pi_beta",amount_total:1000,currency:"usd",payment_status:"unpaid"});
      if(lostResponse){lostResponse=false;throw new Error("Accepted checkout response lost");}
      return sessions[0];
    },
  }},paymentIntents:{retrieve:async()=>({id:"pi_beta",status:"succeeded",amount_received:1000,currency:"usd",metadata:sessions[0].metadata})}};
  const orderView=()=>({...order,userId:order.user_id,sellerId:order.seller_id,listingId:order.listing_id,
    licenseType:order.license_type,stripePaymentIntentId:order.stripe_payment_intent_id});
  globalThis.__chainStorage={getOrder:async()=>orderView()};
  globalThis.__chainDb={
    update:()=>({set:changes=>({where:()=>({returning:async()=>{order.stripe_payment_intent_id=changes.stripePaymentIntentId;return [orderView()];}})})}),
    insert:()=>({values:()=>({onConflictDoNothing:async()=>{}})}),
  };
  process.env.STRIPE_SECRET_KEY="sk_test_isolated_noncredential";
  const service=await subject("server/services/marketplaceService.ts",{
    stripe:"export default class Stripe { constructor(){return globalThis.__chainStripe;} }",
    "../storage":"export const storage=globalThis.__chainStorage;",
    "../db":"export const db=globalThis.__chainDb;",
    "./commerce/settlement":"export const {bookMarketplace,snapshotMarketplaceTerms}=globalThis.__chainSettlement;",
    "./commerce/marketplaceCheckout":"export const {createMarketplaceCheckout}=globalThis.__chainCheckout;",
    "./commerceOrderRepository":"export async function updateCommerceOrder(){throw new Error('Unexpected failed order');}",
    "@shared/schema":"export const listingLicenseTiers={},listings={},notifications={},orders={},royaltySplits={},royaltyTransactions={},revenueEvents={};",
    "drizzle-orm":"export const eq=()=>{},and=()=>{},sql=()=>{};",
    "./instantPayoutService":"export const instantPayoutService={};",
    "./notificationService.js":"export const notificationService={};",
    "../logger.js":"export const logger={info(){},warn(){},error(){}};",
    "../config/defaults.js":"export const getBaseUrl=()=> 'https://app.invalid';",
  });
  const marketplace=service.marketplaceService;
  marketplace.getListing=async()=>({id:"beat",userId:"seller",title:"Beta",licenses:[{type:"basic",price:10}]});
  marketplace.generateLicense=async()=>{};
  marketplace._deliverSaleNotifications=async()=>{};
  globalThis.__chainMarketplace=marketplace;
  await assert.rejects(marketplace.initiatePurchase("buyer","beat","basic"));
  const recovered=await marketplace.createCheckoutSession({buyerId:"buyer",beatId:"beat",licenseType:"basic",
    successUrl:"https://app.invalid/success",cancelUrl:"https://app.invalid/cancel"});
  assert.equal(recovered.orderId,order.id);assert.equal(providerCreates,1);assert.equal(insertions,1);
  await marketplace.initiatePurchase("buyer","beat","basic");
  globalThis.__chainHandlers=new Map();
  await subject("server/routes/webhooks/stripe.ts",{
    express:"export const Router=()=>({post(){},get(){}});",
    stripe:"export default class Stripe {}",
    "../../logger.js":"export const logger={info(){},warn(){},error(){}};",
    "../../safety/stripeWebhookSecurity":"export const stripeWebhookMiddleware=()=>{};export const handleWebhookEvent=()=>{};export const registerWebhookHandler=(type,fn)=>globalThis.__chainHandlers.set(type,fn);",
    "../../safety/auditLogger":"export const auditPayment={charge:async()=>{}};",
    "../../db":"export const db=globalThis.__chainDb;",
    "@shared/schema":"export const orders={},storefrontOrders={},bogoPromotions={},customerMemberships={},users={};",
    "drizzle-orm":"export const eq=()=>{},and=()=>{},sql=()=>{};",
    "../../services/notificationService.js":"export const notificationService={};",
    "../../services/dunningService.js":"export const dunningService={};",
    "../../services/instantPayoutService.js":"export const instantPayoutService={};",
    "../../config/env.js":"export const env={};",
    "../../services/commerce/merchant":"export const settleMerchantCheckout=()=>{};",
    "../../services/commerce/marketplaceCheckout":"export const consumeMarketplaceCheckout=globalThis.__chainCheckout.consumeMarketplaceCheckout;",
    "../../services/marketplaceService.js":"export const marketplaceService=globalThis.__chainMarketplace;",
    "../../services/commerce/payouts":"export const handleCommercePayoutEvent=()=>{};",
    "../../services/commerce/entitlements":"export const currentSubscription=()=>{};",
    "../../services/commerce/growthMerch":"export const installStripeMerchPaymentAdapter=()=>{};export const handleGrowthMerchCheckout=()=>{};",
  });
  const handler=globalThis.__chainHandlers.get("checkout.session.completed");
  sessions[0].payment_status="paid";sessions[0].status="complete";
  await globalThis.__chainHandlers.get("payment_intent.succeeded")({data:{object:{id:"pi_beta",metadata:sessions[0].metadata}}});
  await handler({id:"evt_beta",data:{object:sessions[0]}});
  await handler({id:"evt_replay",data:{object:sessions[0]}});
  await globalThis.__chainHandlers.get("payment_intent.succeeded")({data:{object:{id:"pi_beta",metadata:sessions[0].metadata}}});
  assert.equal(bookings,1);assert.equal(insertions,1);
  await assert.rejects(handler({data:{object:{...sessions[0],metadata:{beatId:"beat"}}}}),/reconciliation/);
  await assert.rejects(handler({data:{object:{...sessions[0],amount_total:999}}}),/frozen order/);
  await assert.rejects(marketplace.processPayment(order.id,"pi_other"));
  await assert.rejects(marketplace.initiatePurchase("buyer","beat","basic"));
  assert.equal(providerCreates,1);assert.equal(insertions,1);
  delete process.env.STRIPE_SECRET_KEY;
});

test("simulated beta: payout command survives lost response/reload and fences account switches", async () => {
  const saved=new Map();
  globalThis.localStorage={getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)};
  Object.defineProperty(globalThis,"navigator",{value:{locks:{request:async(_key,fn)=>fn()}},configurable:true});
  globalThis.__payoutIdentity={owner:"buyer",epoch:1};
  const mocks={"./identity":"export const offlineIdentity=()=>({...globalThis.__payoutIdentity});export function assertOfflineIdentity(i){if(i.owner!==globalThis.__payoutIdentity.owner||i.epoch!==globalThis.__payoutIdentity.epoch)throw new Error('Account changed');}"};
  const first=await subject("client/src/lib/offline/payoutCommand.ts",mocks);
  let key;
  await assert.rejects(first.requestPersistedPayout("buyer",1250,async intent=>{key=intent.key;throw new Error("Response lost");}),/Response lost/);
  const reloaded=await subject("client/src/lib/offline/payoutCommand.ts",mocks);
  await assert.rejects(reloaded.requestPersistedPayout("buyer",1300,async()=>{throw new Error("Must not send");}),/prior withdrawal/);
  await reloaded.requestPersistedPayout("buyer",1250,async intent=>{assert.equal(intent.key,key);return {success:true,payoutId:"wd_beta"};});
  await assert.rejects(reloaded.requestPersistedPayout("buyer",1250,async()=>{}),/already acknowledged/);
  globalThis.__payoutIdentity={owner:"other",epoch:2};
  await assert.rejects(reloaded.confirmNewPayout("buyer"),/unavailable/);
  globalThis.__payoutIdentity={owner:"buyer",epoch:3};
  await reloaded.confirmNewPayout("buyer");
  await reloaded.requestPersistedPayout("buyer",1250,async intent=>{assert.notEqual(intent.key,key);return {success:true,payoutId:"wd_next"};});
});

test("actual StripeService rejects another buyer and invalid refund values before money or writes", async () => {
  let writes = 0;
  const order = { id: "order", userId: "buyer", amount: 12, status: "completed", stripePaymentIntentId: "pi_test" };
  globalThis.__commerceTestDb = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [order] }) }) }),
    insert: () => { writes++; throw new Error("Unexpected write"); },
  };
  const service = await subject("server/services/stripeService.ts", {
    stripe: "export default class Stripe {}",
    "../storage": "export const storage = {};",
    "./stripeSetup.js": "export const getStripePriceIds = () => ({});",
    "../logger.js": "export const logger = { warn(){}, info(){}, error(){} };",
    "./externalServices.js": "export function executeStripeOperation(){ throw new Error('Unexpected provider call'); }",
    "../db.js": "export const db = globalThis.__commerceTestDb;",
    "@shared/schema": "export const users={}, orders={}, listingStems={}, refunds={}, ledgerEntries={}, notifications={}, taxForms={};",
    "drizzle-orm": "export const eq=()=>{}, and=()=>{}, desc=()=>{}, sql=()=>{};",
    "./instantPayoutService": "export const instantPayoutService = {};",
    "./marketplaceService": "export const marketplaceService={processPayment:async()=>{throw new Error('Unexpected marketplace payment');}};",
    "../config/env.js": "export const env = { STRIPE_SECRET_KEY: 'sk_test_isolated_noncredential' };",
    "../lib/envHelpers.js": "export const isProductionEnv = () => false;",
    "./commerce/compensation": "export async function initiateCommerceRefund(){ throw new Error('Unexpected refund intent'); }",
  });
  const denied = await service.stripeService.createRefund({ orderId: "order", userId: "attacker" });
  assert.equal(denied.success, false);
  assert.match(denied.error, /authorized/);
  for (const amountCents of [0, -1, 1.2, NaN, Infinity, 1201]) {
    const result = await service.stripeService.createRefund({ orderId: "order", userId: "buyer", amountCents });
    assert.equal(result.success, false);
    assert.match(result.error, /amount/);
  }
  await assert.rejects(service.stripeService.getOrderRefunds("order", "attacker"), /Forbidden/);
  assert.equal(writes, 0);
});

test("actual receipt repository commits only successful handlers and releases on failure", async () => {
  const queries = [];
  let released = 0;
  let receipt = false;
  globalThis.__commerceTestPool = {
    query: async (sql) => {
      queries.push(sql);
      if(sql.startsWith("SELECT event_id")) return {rows:receipt?[{event_id:"evt"}]:[]};
      return {rows:[{event_id:"evt"}]};
    },
    connect: async () => ({
      query: async (sql) => {
        queries.push(sql);
        return { rows: [{ event_id: "evt" }] };
      },
      release: () => released++,
    }),
  };
  const { processCommerceEvent } = await subject("server/services/commerceWebhookRepository.ts", {
    "../db": "export const pool = globalThis.__commerceTestPool;",
  });
  const event = { id: "evt", type: "payment_intent.succeeded" };
  await processCommerceEvent(event, async () => ({ success: true, message: "ok" }));
  assert(queries.some(q => q.startsWith("INSERT INTO")));
  assert.equal(queries.at(-1), "COMMIT");
  queries.length = 0;
  await processCommerceEvent(event, async () => ({ success: false, message: "retry" }));
  assert(queries.at(-1).includes("state='retry'"));
  assert(!queries.some(q => q.startsWith("INSERT INTO commerce_webhook_receipts")));
  const crash=await processCommerceEvent(event, async () => { throw new Error("crash"); });
  assert.equal(crash.success,false);
  receipt = true;
  const replay = await processCommerceEvent(event, async () => { throw new Error("Must not run"); });
  assert.equal(replay.success, true);
  assert.equal(released, 1);
});

test("plan policy accepts real legacy producers, rejects invented/default tiers", async () => {
  const { subscriptionPlan, validateCustomerRefund } = await subject("server/services/commercePolicy.ts", {});
  for (const key of ["planId", "planName", "plan", "tier"]) {
    assert.equal(subscriptionPlan({ [key]: "yearly" }), "yearly");
  }
  assert.throws(() => subscriptionPlan({}), /metadata/);
  assert.throws(() => subscriptionPlan({ planId: "enterprise" }), /metadata/);
  assert.equal(validateCustomerRefund({ userId: "u", amount: 12, status: "completed" }, "u"), 1200);
});

test("actual marketplace service rejects a succeeded payment belonging to a different order", async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_isolated_noncredential";
  globalThis.__commerceUnexpectedEffects = 0;
  const { marketplaceService } = await subject("server/services/marketplaceService.ts", {
    stripe: "export default class Stripe { paymentIntents = { retrieve: async () => ({status:'succeeded', amount_received:1200, currency:'usd'}) }; }",
    "../storage": "export const storage = { getOrder: async () => ({id:'o',userId:'u',sellerId:'s',amount:12,currency:'usd',status:'pending',stripePaymentIntentId:'pi_correct'}) };",
    "./commerceOrderRepository": "export async function updateCommerceOrder(){ globalThis.__commerceUnexpectedEffects++; throw new Error('Unexpected order write'); }",
    "./commerce/settlement": "export async function snapshotMarketplaceTerms(){throw new Error('Unexpected checkout');} export async function bookMarketplace(){globalThis.__commerceUnexpectedEffects++;throw new Error('Unexpected settlement');}",
    "./commerce/marketplaceCheckout": "export async function createMarketplaceCheckout(){throw new Error('Unexpected checkout');}",
    "../db": "export const db = new Proxy({}, {get(){ globalThis.__commerceUnexpectedEffects++; throw new Error('Unexpected database effect'); }});",
    "@shared/schema": "export const listingLicenseTiers={}, listings={}, notifications={}, orders={}, royaltySplits={}, royaltyTransactions={}, revenueEvents={};",
    "drizzle-orm": "export const eq=()=>{}, and=()=>{}, sql=()=>{};",
    "./instantPayoutService": "export const instantPayoutService = new Proxy({}, {get(){ globalThis.__commerceUnexpectedEffects++; throw new Error('Unexpected money movement'); }});",
    "./notificationService.js": "export const notificationService = {};",
    "../logger.js": "export const logger = { warn(){}, info(){}, error(){} };",
    "../config/defaults.js": "export const getBaseUrl = () => 'https://isolated.invalid';",
  });
  await assert.rejects(marketplaceService.processPayment("o", "pi_wrong"), /Failed to process payment/);
  assert.equal(globalThis.__commerceUnexpectedEffects, 0);
  delete process.env.STRIPE_SECRET_KEY;
});

test("actual payment verification books provider fees and only succeeded refund totals",async()=>{
  globalThis.__commerceSdk={
    paymentIntents:{retrieve:async()=>({status:"succeeded",amount_received:10000,currency:"usd",
      latest_charge:{id:"ch",disputed:false,balance_transaction:{id:"bt",amount:10000,currency:"usd",fee:320}}})},
    refunds:{list:()=>({async *[Symbol.asyncIterator](){
      yield{status:"succeeded",amount:2000};yield{status:"pending",amount:1000};yield{status:"failed",amount:500};
    }})},
  };
  const {verifiedPayment}=await subject("server/services/commerce/verification.ts",{
    "./runtime":"export const commerceStripe=()=>globalThis.__commerceSdk;",
  });
  assert.deepEqual(await verifiedPayment("pi",10000,"usd"),{processingFeeCents:320,refundedCents:2000,pendingCents:1000,chargeId:"ch",disputed:false});
  await assert.rejects(verifiedPayment("pi",9999,"usd"),/mismatch/);
});