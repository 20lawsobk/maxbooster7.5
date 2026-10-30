import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import pg from "pg";
import {drizzle} from "drizzle-orm/node-postgres";
import * as orm from "drizzle-orm";
import {pgTable,varchar,text,real,timestamp} from "drizzle-orm/pg-core";
import {loadIsolated} from "./helpers-inbound.mjs";

test("real isolated PostgreSQL: ownership, concurrent caps, shipping rejection, reservation rollback and expiry", async t=>{
  const root=mkdtempSync(path.join(os.tmpdir(),"integrity-pg-"));
  const env={PATH:process.env.PATH,HOME:root};
  let started=false,pool;
  const original=process.env.STRIPE_MERCH_SHIPPING_COUNTRIES;
  t.after(async()=>{
    if(original===undefined) delete process.env.STRIPE_MERCH_SHIPPING_COUNTRIES;
    else process.env.STRIPE_MERCH_SHIPPING_COUNTRIES=original;
    if(pool) await pool.end();
    if(started) execFileSync("pg_ctl",["-D",`${root}/data`,"-m","immediate","-w","stop"],{env,stdio:"pipe"});
    rmSync(root,{recursive:true,force:true});
  });
  execFileSync("initdb",["-D",`${root}/data`,"-U","fixture","--auth=trust","--no-locale"],{env,stdio:"pipe"});
  execFileSync("pg_ctl",["-D",`${root}/data`,"-l",`${root}/postgres.log`,"-o",`-k ${root} -h ''`,"-w","start"],{env,stdio:"pipe"});
  started=true;
  pool=new pg.Pool({host:root,user:"fixture",database:"postgres",port:5432,max:8});
  await pool.query(`
    CREATE TABLE users(id varchar PRIMARY KEY,subscription_status text);
    INSERT INTO users VALUES ('seller','suspended'),('other','active');
    CREATE TABLE pg_sessions(sid text PRIMARY KEY,sess text,expire bigint);
    CREATE TABLE jwt_tokens(id text PRIMARY KEY,user_id text,revoked boolean DEFAULT false,revoked_at timestamp,revoked_reason text);
    CREATE TABLE refresh_tokens(id text PRIMARY KEY,user_id text,revoked boolean DEFAULT false,revoked_at timestamp,revoked_reason text);
    CREATE TABLE listings(id varchar PRIMARY KEY,user_id varchar);
    CREATE TABLE beats(id varchar PRIMARY KEY,user_id varchar);
    CREATE TABLE releases(id varchar PRIMARY KEY,user_id varchar);
    CREATE TABLE projects(id varchar PRIMARY KEY,user_id varchar);
    INSERT INTO listings VALUES ('listing','seller');
    CREATE TABLE royalty_splits(id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
      release_id varchar,user_id varchar,collaborator_name text,collaborator_email text,role text,
      percentage real,status text,updated_at timestamp);
    CREATE TABLE merch_items(id varchar PRIMARY KEY,user_id varchar,name text,price real,sale_price real,
      inventory integer,is_active boolean,is_digital boolean,variants jsonb,updated_at timestamp,sold_count integer);
    INSERT INTO merch_items VALUES('tee','seller','Tee',10,NULL,5,true,false,'[]',now(),0);
    CREATE TABLE merch_orders(id varchar PRIMARY KEY,user_id varchar,buyer_email text,buyer_name text,
      items jsonb,total real,status text,shipping_address jsonb,updated_at timestamp);
    CREATE TABLE growth_merch_payments(order_id varchar PRIMARY KEY,buyer_id varchar,command_key varchar,
      currency text,subtotal_cents bigint,state text,checkout_id text,checkout_url text,collected_cents bigint,
      refunded_cents bigint DEFAULT 0,UNIQUE(buyer_id,command_key));
    CREATE TABLE growth_merch_payment_events(event_id varchar PRIMARY KEY,order_id varchar,event_type text);
  `);
  globalThis.__integrityPgDb=drizzle(pool);
  globalThis.__integrityUserSchema=pgTable("users",{id:varchar("id").primaryKey(),subscriptionStatus:text("subscription_status")});
  globalThis.__integrityPgOrm=orm;
  globalThis.__integrityPgSchema=pgTable("royalty_splits",{
    id:varchar("id").primaryKey().default(orm.sql`gen_random_uuid()::text`),
    releaseId:varchar("release_id"),userId:varchar("user_id"),
    collaboratorName:text("collaborator_name"),collaboratorEmail:text("collaborator_email"),
    role:text("role"),percentage:real("percentage"),status:text("status"),updatedAt:timestamp("updated_at"),
  });
  const mocks={
    "../db":"export const db=globalThis.__integrityPgDb;",
    "@shared/schema":"export const royaltySplits=globalThis.__integrityPgSchema;",
    "drizzle-orm":"export const {sql,and,eq}=globalThis.__integrityPgOrm;",
  };
  const royalty=await loadIsolated("server/services/royaltySplitOwnership.ts",mocks);
  const billing=await loadIsolated("server/services/billingAccountStatus.ts",{
    "drizzle-orm":mocks["drizzle-orm"],
    "../../shared/schema.js":"export const users=globalThis.__integrityUserSchema;",
  });
  const userSchema=globalThis.__integrityUserSchema;
  await globalThis.__integrityPgDb.update(userSchema).set({subscriptionStatus:billing.billingAccountStatus("active")});
  assert.equal((await pool.query("SELECT subscription_status FROM users WHERE id='seller'")).rows[0].subscription_status,"suspended");
  await pool.query("UPDATE users SET subscription_status='banned' WHERE id='seller'");
  await globalThis.__integrityPgDb.update(userSchema).set({subscriptionStatus:billing.billingAccountStatus("canceled")});
  assert.equal((await pool.query("SELECT subscription_status FROM users WHERE id='seller'")).rows[0].subscription_status,"banned");
  assert.equal((await pool.query("SELECT subscription_status FROM users WHERE id='other'")).rows[0].subscription_status,"canceled");

  const remote=await loadIsolated("server/services/remoteSessions.ts",{
    "../db.js":mocks["../db"],"drizzle-orm":mocks["drizzle-orm"],
  });
  const sessionData={userId:"seller",authGeneration:"1",cookie:{maxAge:60000}};
  for(const [sid,userId] of [["current","seller"],["remote","seller"],["foreign","other"]])
    await pool.query("INSERT INTO pg_sessions VALUES($1,$2,$3)",[sid,JSON.stringify({...sessionData,userId}),Date.now()+60000]);
  await pool.query("INSERT INTO jwt_tokens(id,user_id) VALUES('jwt','seller'); INSERT INTO refresh_tokens(id,user_id) VALUES('refresh','seller')");
  assert.equal((await remote.listOwnedSessions("seller")).length,2);
  assert.equal(await remote.revokeOwnedSessions("seller","current","foreign"),0);
  assert.equal(await remote.revokeOwnedSessions("seller","current","remote"),1);
  assert.equal((await pool.query("SELECT revoked FROM jwt_tokens")).rows[0].revoked,true);
  assert.equal((await pool.query("SELECT revoked FROM refresh_tokens")).rows[0].revoked,true);
  const {createSessionAuthority}=await loadIsolated("server/services/sessionAuthority.ts",{
    "../db.js":mocks["../db"],
  });
  const authority=createSessionAuthority(pool);
  const cutoff=Number((await pool.query("SELECT sess::jsonb->>'revokedBefore' AS cutoff FROM pg_sessions WHERE sid='bearer-revocation:seller'")).rows[0].cutoff);
  assert.equal(await authority.validateBearer("seller",cutoff),false);
  assert.equal(await authority.validateBearer("seller",cutoff+1),true);
  assert.equal(await authority.validateBearer("seller",undefined),false);
  globalThis.__integrityExpressSession=(await import("express-session")).default;
  const {AuthoritativeSessionStore}=await loadIsolated("server/middleware/authoritativeSessionStore.ts",{
    "../db.js":mocks["../db"],"drizzle-orm":mocks["drizzle-orm"],
    "express-session":"export default globalThis.__integrityExpressSession;",
    "../services/sessionAuthority.js":"export async function sessionAuthority(){return {validate:async()=>true};}",
  });
  const store=new AuthoritativeSessionStore();
  const call=(method,...args)=>new Promise((resolve,reject)=>store[method](...args,(err,value)=>err?reject(err):resolve(value)));
  assert.equal(await remote.setDeviceTrust("seller","foreign",true),false);
  assert.equal(await remote.setDeviceTrust("seller","current",true),true);
  await call("set","current",sessionData);
  assert.equal((await call("get","current")).trusted,true,"in-flight saves preserve authoritative device trust");
  assert.equal((await remote.ownedSessionStatus("seller","current")).concurrentSessions,1);
  assert.equal(await remote.ownsLiveSession("seller","remote"),false);
  await call("set","remote",sessionData);
  await call("touch","remote",sessionData);
  assert.equal(await call("get","remote"),null,"in-flight save/touch cannot resurrect a revoked session");
  assert.equal((await call("get","current")).userId,"seller");
  await call("destroy","foreign");
  await call("set","foreign",{...sessionData,userId:"other"});
  assert.equal(await call("get","foreign"),null);
  assert.equal(await remote.revokeOwnedSessions("seller","current"),0);
  await pool.query("INSERT INTO pg_sessions VALUES('second',$1,$2)",[JSON.stringify(sessionData),Date.now()+60000]);
  assert.equal(await remote.revokeOwnedSessions("seller","current"),1);
  assert.equal((await call("get","current")).userId,"seller");
  const values={releaseId:"listing",percentage:20,collaboratorName:"Collaborator",collaboratorEmail:"fixture@example.invalid",role:"producer"};
  await assert.rejects(royalty.createOwnedRoyaltySplit("attacker",values),/do not own/);
  const results=await Promise.allSettled(Array.from({length:12},()=>royalty.createOwnedRoyaltySplit("seller",values)));
  assert.equal(results.filter(r=>r.status==="fulfilled").length,5);
  assert.equal(Number((await pool.query("SELECT sum(percentage) AS total FROM royalty_splits")).rows[0].total),100);
  const id=results.find(r=>r.status==="fulfilled").value.id;
  await assert.rejects(royalty.updateOwnedRoyaltySplit("seller",id,{percentage:30}),/exceed/);
  await royalty.updateOwnedRoyaltySplit("seller",id,{percentage:10});
  await pool.query("UPDATE listings SET user_id='other'");
  await assert.rejects(royalty.updateOwnedRoyaltySplit("seller",id,{percentage:5}),/do not own/);

  const merch=await loadIsolated("server/services/merchCheckoutService.ts",mocks);
  process.env.STRIPE_MERCH_SHIPPING_COUNTRIES="US";
  let providerCalls=0,preflightFailure=false;
  merch.installMerchPaymentAdapter({
    validateCheckout:async()=>{if(preflightFailure) throw new Error("shipping rate unavailable");},
    createCheckout:async()=>{providerCalls++;return {checkoutId:"cs_fixture",checkoutUrl:"https://checkout.invalid/fixture"};},
  });
  const input={buyerId:"buyer",commandKey:"fixture-command",buyerEmail:"buyer@example.invalid",buyerName:"Buyer",
    shippingAddress:{country:"US"},items:[{itemId:"tee",quantity:2}]};
  for(const country of ["!!","CA","",null]) {
    await assert.rejects(merch.createMerchCheckout({...input,shippingAddress:{country}}),/shipping|Shipping/);
  }
  preflightFailure=true;
  await assert.rejects(merch.createMerchCheckout(input),/shipping rate/);
  preflightFailure=false;
  await pool.query("UPDATE merch_items SET price=0");
  await assert.rejects(merch.createMerchCheckout(input),/positive total/);
  assert.equal((await pool.query("SELECT inventory FROM merch_items")).rows[0].inventory,5);
  assert.equal((await pool.query("SELECT * FROM growth_merch_payments")).rowCount,0);
  await pool.query("UPDATE merch_items SET price=10");
  await assert.rejects(merch.createMerchCheckout({...input,items:[...input.items,{itemId:"zzz-absent",quantity:1}]}),/not available/);
  assert.equal((await pool.query("SELECT inventory FROM merch_items")).rows[0].inventory,5);
  assert.equal((await pool.query("SELECT * FROM growth_merch_payments")).rowCount,0);
  assert.equal(providerCalls,0);
  const checkout=await merch.createMerchCheckout(input);
  assert.equal((await pool.query("SELECT inventory FROM merch_items")).rows[0].inventory,3);
  assert.deepEqual(await merch.createMerchCheckout(input),checkout);
  assert.equal(providerCalls,1);
  const expiry={eventId:"evt_expire",orderId:checkout.orderId,checkoutId:"cs_fixture",currency:"usd",type:"expired",amountCents:0};
  await merch.applyVerifiedMerchPayment(expiry);
  await merch.applyVerifiedMerchPayment(expiry);
  assert.equal((await pool.query("SELECT inventory FROM merch_items")).rows[0].inventory,5);
});