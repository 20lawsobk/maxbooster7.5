import {test} from "node:test";
import assert from "node:assert/strict";
import {loadIsolated} from "./helpers-inbound.mjs";
import {readFileSync} from "node:fs";

test("settlement excludes pending attackers on listing and beat paths, preserves approved splits, fences legacy payouts", async () => {
  const state = {listing:{user_id:"seller",metadata:{}},beat:{user_id:"seller"},
    splits:[], booked:[], existing:null};
  globalThis.__integritySettlement = state;
  state.query = async (sql, params) => {
    if (sql.includes("FROM listings")) return {rows:state.listing?[state.listing]:[]};
    if (sql.includes("FROM beats")) return {rows:state.beat?[state.beat]:[]};
    assert.match(sql,/status IN \('active','verified'\)/);
    return {rows:state.splits.filter(s=>s.release_id===params[0] && ["active","verified"].includes(s.status))};
  };
  const {snapshotMarketplaceTerms,bookMarketplace} = await loadIsolated("server/services/commerce/settlement.ts", {
    "../../db":"export const pool={query:(...args)=>globalThis.__integritySettlement.query(...args)};",
    "./runtime":`export const commerceRepository={
      sourceByPayment:async()=>globalThis.__integritySettlement.existing,
      book:async s=>globalThis.__integritySettlement.booked.push(s),compensate:async()=>{}};`,
    "./verification":"export async function verifiedPayment(){return {processingFeeCents:20};}",
  });
  const order={id:"order",listingId:"listing",sellerId:"seller",amount:10,currency:"usd",stripePaymentIntentId:"pi_fixture"};
  state.splits=[{release_id:"listing",user_id:"attacker",percentage:100,status:"pending"}];
  let terms=await snapshotMarketplaceTerms(order);
  assert.deepEqual(terms.allocations,[{userId:"seller",cents:900}]);
  state.listing.metadata.beatId="beat";
  state.splits.push({release_id:"beat",user_id:"attacker",percentage:100,status:"pending"});
  assert.deepEqual((await snapshotMarketplaceTerms(order)).allocations,terms.allocations);
  state.splits.push({release_id:"beat",user_id:"collaborator",percentage:40,status:"verified"},
    {release_id:"beat",user_id:"seller",percentage:60,status:"active"});
  terms=await snapshotMarketplaceTerms(order);
  assert.equal(terms.allocations.find(a=>a.userId==="collaborator").cents,360);
  await bookMarketplace({...order,metadata:{settlementTerms:terms}});
  assert.equal(state.booked.length,1);
  await assert.rejects(bookMarketplace({...order,metadata:{settlementTerms:{...terms,version:1}}}),/reconciliation/);
  await assert.rejects(bookMarketplace({...order,metadata:{settlementTerms:{...terms,sellerId:"attacker"}}}),/authorization/);
  assert.equal(state.booked.length,1);
  state.beat.user_id="other";
  await assert.rejects(snapshotMarketplaceTerms(order),/unowned beat/);
  state.listing.user_id="other";
  await assert.rejects(snapshotMarketplaceTerms(order),/own listing/);
});

test("royalty mutations require resource ownership and serialize resource-wide caps", async () => {
  const state={owners:["seller"],rows:[],locks:0};
  const matches=(row,predicate)=>predicate(row);
  let queue=Promise.resolve();
  const tx={
    execute:async statement=>{
      if(statement.query.includes("pg_advisory_xact_lock")) {state.locks++; return {rows:[]};}
      for(const table of ["listings","beats","releases","projects"]) assert.ok(statement.query.includes(`FROM ${table}`));
      return {rows:state.owners.map(user_id=>({user_id}))};
    },
    select:()=>({from:()=>({where:p=>Promise.resolve(state.rows.filter(r=>matches(r,p)))})}),
    insert:()=>({values:values=>({returning:async()=>{
      const row={id:`split-${state.rows.length}`,...values};state.rows.push(row);return [row];
    }})}),
    update:()=>({set:values=>({where:p=>({returning:async()=>{
      const rows=state.rows.filter(r=>matches(r,p));rows.forEach(r=>Object.assign(r,values));return rows;
    }})})}),
  };
  globalThis.__integrityRoyalty={transaction:async fn=>{
    const before=queue;let unlock;queue=new Promise(r=>unlock=r);await before;
    try{return await fn(tx);}finally{unlock();}
  }};
  const service=await loadIsolated("server/services/royaltySplitOwnership.ts",{
    "../db":"export const db=globalThis.__integrityRoyalty;",
    "@shared/schema":`export const royaltySplits=new Proxy({}, {get:(_,key)=>key});`,
    "drizzle-orm":`export const sql=(p,...values)=>({query:p.join("?"),values});
      export const eq=(key,value)=>row=>row[key]===value;
      export const and=(...conditions)=>row=>conditions.every(fn=>fn(row));`,
  });
  const values={releaseId:"listing",percentage:60,collaboratorEmail:"collaborator@example.invalid",collaboratorName:"Collaborator",role:"producer"};
  await assert.rejects(service.createOwnedRoyaltySplit("attacker",values),/do not own/);
  assert.equal(state.rows.length,0);
  state.owners=[];
  await assert.rejects(service.createOwnedRoyaltySplit("seller",values),/do not own/);
  state.owners=["seller"];
  const outcomes=await Promise.allSettled([
    service.createOwnedRoyaltySplit("seller",values),service.createOwnedRoyaltySplit("seller",values)]);
  assert.equal(outcomes.filter(r=>r.status==="fulfilled").length,1);
  assert.equal(state.rows.length,1);
  assert.equal(state.rows[0].status,"pending");
  await service.createOwnedRoyaltySplit("seller",{...values,percentage:40});
  await assert.rejects(service.updateOwnedRoyaltySplit("seller","split-0",{percentage:80}),/exceed/);
  await service.updateOwnedRoyaltySplit("seller","split-0",{percentage:50});
  state.owners=["other"];
  await assert.rejects(service.updateOwnedRoyaltySplit("seller","split-0",{percentage:10}),/do not own/);
  assert.equal(state.rows[0].percentage,50);
  assert.ok(state.locks>=6);
  await service.createOwnedRoyaltySplit("attacker",{...values,releaseId:"general",percentage:100});
  assert.equal(state.rows.at(-1).status,"pending");
});

test("mounted royalty write routes use ownership service rather than direct writes", () => {
  const source=readFileSync("server/routes.ts","utf8");
  const create=source.slice(source.indexOf('app.post("/api/royalties/splits"'),source.indexOf('app.put("/api/royalties/splits/'));
  const edit=source.slice(source.indexOf('app.put("/api/royalties/splits/'),source.indexOf('app.delete(',source.indexOf('app.put("/api/royalties/splits/')));
  assert.match(create,/createOwnedRoyaltySplit\(req.user.id/);
  assert.match(edit,/updateOwnedRoyaltySplit\(req.user.id/);
  assert.doesNotMatch(create,/\.insert\(royaltySplits\)/);
  assert.doesNotMatch(edit,/\.update\(royaltySplits\)/);
});