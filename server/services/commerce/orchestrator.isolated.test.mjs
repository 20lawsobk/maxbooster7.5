import {test} from "node:test";
import {strict as assert} from "node:assert";
import {build} from "esbuild";
async function load(file) {
  const r=await build({entryPoints:[file],bundle:true,write:false,platform:"node",format:"esm",packages:"external"});
  return import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].text).toString("base64")}`);
}
const {CommerceEngine}=await load("server/services/commerce/engine.ts");
const {allocateNet}=await load("server/services/commerce/contract.ts");
const {StripeCommerceProvider}=await load("server/services/commerce/provider.ts");
const {CommerceRepository}=await load("server/services/commerce/repository.ts");

test("cancellation reason is written in the same release transaction without replacing other metadata",async()=>{
  const calls=[];
  const client={query:async(sql,params)=>{
    calls.push({sql,params});
    return {rows:sql.startsWith("SELECT * FROM commerce_operations")
      ? [{state:"running",lease_token:"owned"}] : []};
  },release(){}};
  const repo=new CommerceRepository({connect:async()=>client});
  const op={id:"cancel-test",user_id:"seller",currency:"usd",amount_cents:100,lease_token:"owned"};
  await repo.release(op,"Requested by account owner");
  const write=calls.find(c=>c.sql.includes("payload=payload ||"));
  assert.deepEqual(write.params,["cancel-test",JSON.stringify({cancellationReason:"Requested by account owner"})]);
  assert.equal(calls.at(-1).sql,"COMMIT");
  calls.length=0;
  await repo.release(op);
  assert.deepEqual(calls.find(c=>c.sql.includes("payload=payload ||")).params,["cancel-test","{}"]);
});

function fixture(kind="withdrawal") {
  const op={id:"op_1",kind,user_id:"seller",currency:"usd",amount_cents:9000,state:"pending",
    created_at:"2026-01-01T00:00:00Z",payload:{accountId:"acct_test",paymentIntent:"pi_test"},attempts:0};
  const calls=[],sources=[];
  const repo={
    claim:async()=>{if(["completed","cancelled","failed"].includes(op.state))return;op.attempts++;op.state="running";return {...op,payload:{...op.payload}};},
    update:async(_o,p)=>{calls.push(["update",p]);if(p.transferId)op.transfer_id=p.transferId;if(p.providerId)op.provider_id=p.providerId;if(p.state)op.state=p.state;if(p.bankStarted)op.payload.bankStarted=true;},
    get:async()=>({...op}),
    withdrawalSources:async()=>sources,
    paid:async()=>{calls.push(["paid"]);op.state="completed";},
    release:async()=>{calls.push(["release"]);op.state="cancelled";},
    sourceByPayment:async()=>({id:"sale",disputed_cents:0}),
    compensate:async(...args)=>calls.push(["compensate",...args]),
    recovered:async()=>{calls.push(["recovered"]);op.state="completed";},
  };
  const provider={
    transfer:async()=>{calls.push(["transfer"]);return"tr_real_boundary";},
    payout:async()=>{calls.push(["payout"]);return{id:"po_real_boundary",status:"pending"};},
    refund:async()=>({id:"re_real_boundary",status:"pending"}),
    reverse:async()=>{calls.push(["reverse"]);return"trr_real_boundary";},
  };
  return {op,calls,sources,repo,provider,engine:new CommerceEngine(repo,provider)};
}

test("actual engine preserves reservations through pending bank payout, completes only on paid",async()=>{
  const f=fixture();
  await f.engine.execute("op_1");
  assert.equal(f.op.state,"awaiting");
  assert.equal(f.op.transfer_id,"tr_real_boundary");
  assert(!f.calls.some(c=>c[0]==="paid"||c[0]==="release"));
  f.provider.payout=async()=>({id:"po_real_boundary",status:"paid"});
  await f.engine.execute("op_1");
  assert.equal(f.op.state,"completed");
  assert.equal(f.calls.filter(c=>c[0]==="paid").length,1);
  await f.engine.execute("op_1");
  assert.equal(f.calls.filter(c=>c[0]==="paid").length,1);
});
test("actual engine keeps ambiguous provider failures reserved under the same operation ID",async()=>{
  const f=fixture();let attempt=0;
  f.provider.transfer=async op=>{assert.equal(op.id,"op_1");if(!attempt++)throw new Error("network response lost");return"tr_recovered";};
  await assert.rejects(f.engine.execute("op_1"),/response lost/);
  assert.equal(f.op.state,"retry");
  assert(!f.calls.some(c=>c[0]==="release"));
  await f.engine.execute("op_1");
  assert.equal(f.op.transfer_id,"tr_recovered");
});
test("actual engine reverses a failed bank transfer before releasing reservations",async()=>{
  const f=fixture();f.provider.payout=async()=>({id:"po_failed",status:"failed"});
  f.provider.reverse=async()=>{throw new Error("Connect balance unavailable");};
  await assert.rejects(f.engine.execute("op_1"),/unavailable/);
  assert.equal(f.op.state,"retry");
  assert(!f.calls.some(c=>c[0]==="release"));
  f.provider.reverse=async()=>{f.calls.push(["reverse"]);return"trr";};
  await f.engine.execute("op_1");
  assert.equal(f.op.state,"cancelled");
  assert(f.calls.findIndex(c=>c[0]==="reverse")<f.calls.findIndex(c=>c[0]==="release"));
});
test("actual engine does not fund a new withdrawal after source refund hold",async()=>{
  const f=fixture();f.sources.push({refund_pending:true});
  await f.engine.execute("op_1");
  assert.equal(f.op.state,"cancelled");
  assert(!f.calls.some(c=>c[0]==="transfer"));
});
test("actual engine reconciles refund totals and retries failed recovery without imaginary cash",async()=>{
  const f=fixture("refund");
  f.provider.refund=async()=>({id:"re_1",status:"succeeded",refundedCents:10000});
  await f.engine.execute("op_1");
  assert.equal(f.op.state,"completed");
  assert.deepEqual(f.calls.find(c=>c[0]==="compensate"),["compensate","sale",10000,0,undefined]);
  const r=fixture("reversal");
  r.provider.reverse=async()=>{throw new Error("No recoverable balance");};
  await assert.rejects(r.engine.execute("op_1"),/recoverable/);
  assert(!r.calls.some(c=>c[0]==="recovered"));
});
test("actual allocation contract conserves all cents and rejects invalid contracts",()=>{
  const allocations=allocateNet(10001,1000,[{userId:"a",percentage:50},{userId:"b",percentage:50}]);
  assert.equal(allocations.reduce((n,a)=>n+a.cents,0),9001);
  assert.deepEqual(allocations,[{userId:"a",cents:4501},{userId:"b",cents:4500}]);
  assert.throws(()=>allocateNet(10000,1000,[{userId:"a",percentage:110}]),/100 percent/);
});
test("actual Stripe adapter recovers transfers beyond key TTL, uses account-scoped bank keys",async()=>{
  const creates=[];
  let existing=true;
  const sdk={
    transfers:{
      list:()=>({async *[Symbol.asyncIterator](){if(existing)yield{id:"tr_existing",metadata:{commerceOperation:"op_1"}};}}),
      create:async(payload,options)=>{creates.push({payload,options});return{id:"tr_new"};},
    },
    payouts:{
      list:(_query,options)=>{assert.equal(options.stripeAccount,"acct_test");return{async *[Symbol.asyncIterator](){}};},
      create:async(payload,options)=>{creates.push({payload,options});return{id:"po_new",status:"pending"};},
    },
  };
  const provider=new StripeCommerceProvider(sdk);
  const {op}=fixture();
  assert.equal(await provider.transfer(op),"tr_existing");assert.equal(creates.length,0);
  existing=false;await provider.transfer(op);await provider.payout(op);
  assert.equal(creates[0].options.idempotencyKey,"commerce:op_1:transfer");
  assert.equal(creates[1].options.idempotencyKey,"commerce:op_1:bank");
  assert.equal(creates[1].options.stripeAccount,"acct_test");
  assert.equal(creates[0].payload.amount,9000);
});
test("actual repository books conserved fee/net journals and order fulfillment in one transaction",async()=>{
  const calls=[];
  const client={query:async(sql,params=[])=>{
    calls.push({sql,params});
    return {rows:sql.startsWith("INSERT INTO commerce_journals")||sql.startsWith("UPDATE orders")?[{id:"sale:o"}]:[]};
  },release(){}};
  const repo=new CommerceRepository({connect:async()=>client,query:client.query});
  const sale={id:"o",kind:"marketplace",paymentIntent:"pi",currency:"usd",grossCents:10000,feeCents:1000,processingFeeCents:300,
    allocations:[{userId:"a",cents:4500},{userId:"b",cents:4500}],metadata:{sellerId:"a",listingId:"beat"}};
  await repo.book(sale);
  const entries=calls.filter(c=>c.sql.startsWith("INSERT INTO commerce_entries")).map(c=>c.params[4]);
  assert.deepEqual(entries,[-9700,-300,1000,0,4500,4500]);
  assert.equal(entries.reduce((n,c)=>n+c,0),0);
  assert.equal(calls[0].sql,"BEGIN");
  assert(calls.some(c=>c.sql.startsWith("UPDATE orders SET status='completed'")));
  assert.equal(calls.at(-1).sql,"COMMIT");
  calls.length=0;
  await assert.rejects(repo.book({...sale,allocations:[{userId:"a",cents:9999}]}),/conservation/);
  assert.equal(calls.length,0);
});
test("actual repository rolls back ledger booking when fulfillment persistence fails",async()=>{
  const calls=[];
  const client={query:async(sql)=>{
    calls.push(sql);
    if(sql.startsWith("UPDATE orders")) throw new Error("disk write failed");
    return {rows:sql.startsWith("INSERT INTO commerce_journals")?[{id:"j"}]:[]};
  },release(){}};
  const repo=new CommerceRepository({connect:async()=>client,query:client.query});
  await assert.rejects(repo.book({id:"o",kind:"marketplace",paymentIntent:"pi",currency:"usd",grossCents:100,feeCents:10,
    allocations:[{userId:"a",cents:90}],metadata:{sellerId:"a",listingId:"b"}}),/disk/);
  assert.equal(calls.at(-1),"ROLLBACK");
  assert(!calls.includes("COMMIT"));
});
test("actual engine resolves an ambiguous bank request before acting on a later refund",async()=>{
  const f=fixture();
  f.op.attempts=1;f.op.transfer_id="tr_existing";f.op.payload.bankStarted=true;
  f.sources.push({id:"sale",refunded_cents:10000,disputed_cents:0,compensated_cents:10000,compensation_changed:true});
  f.provider.payout=async()=>({id:"po_already_paid",status:"paid"});
  await f.engine.execute("op_1");
  assert.equal(f.op.state,"completed");
  assert(!f.calls.some(c=>c[0]==="release"));
  assert(f.calls.some(c=>c[0]==="compensate"));
});
test("actual repository reopens returned bank funds, but holds overlapping refund recoveries",async()=>{
  for(const overlap of [false,true]) {
    const entries=[];
    const client={query:async(sql,params=[])=>{
      if(sql.startsWith("SELECT * FROM commerce_operations"))return{rows:[{state:"completed"}]};
      if(sql.startsWith("SELECT id FROM commerce_operations"))return{rows:overlap?[{id:"rv"}]:[]};
      if(sql.startsWith("INSERT INTO commerce_journals"))return{rows:[{id:"return"}]};
      if(sql.startsWith("INSERT INTO commerce_entries"))entries.push(params[4]);
      return{rows:[]};
    },release(){}};
    const repo=new CommerceRepository({connect:async()=>client,query:client.query});
    const {op}=fixture();
    assert.equal(await repo.bankReturned(op),overlap?"review":"pending");
    assert.deepEqual(entries,[-9000,9000]);
  }
});