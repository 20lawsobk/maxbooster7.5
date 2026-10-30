import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";
import { pool as applicationPool } from "../server/db";
import { CommerceRepository } from "../server/services/commerce/repository";
import { CommerceEngine } from "../server/services/commerce/engine";
import { StripeCommerceProvider } from "../server/services/commerce/provider";
import { processCommerceEvent } from "../server/services/commerceWebhookRepository";
import { submitToolostRelease } from "../server/routes/distribution-toolost-submission";

const [phase, statePath] = process.argv.slice(2);
if (!["first", "restart"].includes(phase) || !statePath) throw new Error("phase and simulator state path required");
if (process.env.PROVIDER_MODE !== "SIMULATED_STRIPE_AND_TOOLOST" ||
    process.env.READINESS_ISOLATED_PG !== "1" || process.env.READINESS_EGRESS_GUARD !== "1") {
  throw new Error("Explicit isolated simulation markers are required");
}

type ProviderState = {
  transfers: Array<{ id:string; transfer_group:string; metadata:{commerceOperation:string} }>;
  payouts: Array<{ id:string; status:string; metadata:{commerceOperation:string}; created:number }>;
  creates: { transfer:number; payout:number; toolost:number };
};
const state:ProviderState = JSON.parse(readFileSync(statePath, "utf8"));
const save = () => writeFileSync(statePath, JSON.stringify(state));

const stripeSimulator:any = {
  transfers: {
    list: () => ({ async *[Symbol.asyncIterator]() { yield* state.transfers; } }),
    create: async (params:any) => {
      state.creates.transfer++;
      state.transfers.push({id:"tr_sim_001",transfer_group:params.transfer_group,metadata:params.metadata});
      save();
      throw new Error("SIMULATED accepted transfer; response lost");
    },
  },
  payouts: {
    list: () => ({ async *[Symbol.asyncIterator]() { yield* state.payouts; } }),
    create: async (params:any) => {
      state.creates.payout++;
      state.payouts.push({id:"po_sim_001",status:"paid",metadata:params.metadata,created:1700000000});
      save();
      throw new Error("SIMULATED accepted payout; response lost");
    },
    retrieve: async (id:string) => state.payouts.find(p => p.id === id),
  },
};

const direct = new pg.Pool({connectionString:process.env.DATABASE_URL, max:2});
const repo = new CommerceRepository(direct as any);
const output:any = {phase, simulation:true, routes:[], assertions:[]};
const check = (condition:unknown, message:string) => {
  if (!condition) throw new Error(message);
  output.assertions.push(message);
};

try {
  if (phase === "first") {
    await direct.query("INSERT INTO users(id,email,password,created_at) VALUES('sim-seller','seller@simulation.invalid','not-a-credential',now()-interval '90 days'),('sim-buyer','buyer@simulation.invalid','not-a-credential',now()-interval '90 days')");
    await direct.query(`INSERT INTO orders(id,user_id,seller_id,listing_id,amount,currency,status,license_type,license_document_url,stripe_payment_intent_id,metadata)
      VALUES('sim-order','sim-buyer','sim-seller','sim-listing',100.00,'usd','pending','premium','/api/marketplace/orders/sim-order/license','pi_sim_001','{"amountCents":10000,"licenseContent":{"licenseType":"premium","beatId":"sim-listing","buyer":{"id":"sim-buyer"},"producer":{"id":"sim-seller"}}}')`);

    let settlementCalls=0;
    const mismatched = await processCommerceEvent({id:"evt_mismatch",type:"checkout.session.completed"}, async () => {
      const callback={orderId:"sim-order",paymentIntent:"pi_wrong",amount:9999,currency:"eur"};
      if (callback.paymentIntent!=="pi_sim_001" || callback.amount!==10000 || callback.currency!=="usd")
        return {success:false,message:"Callback does not match frozen order"};
      throw new Error("unreachable");
    });
    check(!mismatched.success, "mismatched callback rejected without settlement");
    await direct.query("UPDATE commerce_webhook_inbox SET lease_until=now()-interval '1 second' WHERE event_id='evt_mismatch'");

    const accepted = await processCommerceEvent({id:"evt_sale",type:"checkout.session.completed"}, async () => {
      settlementCalls++;
      await repo.book({id:"sim-order",kind:"marketplace",paymentIntent:"pi_sim_001",currency:"usd",
        grossCents:10000,feeCents:1000,processingFeeCents:320,taxCents:500,
        allocations:[{userId:"sim-seller",cents:8500}],
        metadata:{sellerId:"sim-seller",listingId:"sim-listing"}} as any);
      return {success:true,message:"simulated provider callback settled"};
    });
    check(accepted.success && settlementCalls===1, "actual durable webhook repository settled one frozen sale");
    output.routes.push("processCommerceEvent -> CommerceRepository.book -> marketplace order/license entitlement");

    const op=await repo.reserve("sim-seller",5000,"usd","simulation-withdrawal","acct_simulated");
    const engine=new CommerceEngine(repo,new StripeCommerceProvider(stripeSimulator));
    await engine.execute(op.id).then(()=>{throw new Error("lost response did not surface");},()=>{});
    check(state.creates.transfer===1, "accepted-before-response-loss created one simulated transfer");
    const stored=await repo.get(op.id);
    check(stored?.state==="retry" && !stored.transfer_id, "lost response remains unresolved and reserved, not acknowledged");
    output.routes.push("CommerceRepository.reserve -> CommerceEngine -> StripeCommerceProvider.transfer(simulated)");

    const toolostClient:any = {
      getAvailableDSPs: async () => ({dsps:[{id:"spotify",slug:"spotify",name:"Spotify"}]}),
      createRelease: async (_payload:any, checkpoint:any) => {
        state.creates.toolost++; await checkpoint({providerReleaseId:"tl_sim_001",accepted:true}); save();
        throw new Error("SIMULATED TooLost accepted release; response lost");
      },
    };
    const release:any={title:"Simulation Release",artistName:"Simulation Artist",releaseDate:"2030-01-01",genre:"Electronic",
      artworkUrl:"https://assets.invalid/simulation.jpg",metadata:{artworkAiUsage:"none",audioAiUsage:"none",
      compositionAiUsage:"none",composerName:"Simulation Composer",acceptTerms:true,confirmRights:true,confirmYoutubeRights:true}};
    await submitToolostRelease({client:toolostClient,userId:"sim-seller",releaseId:"sim-release",release,
      tracks:[{title:"Simulation Track",audioUrl:"https://assets.invalid/track.wav",duration:180}],requestedPlatforms:["Spotify"]})
      .then(()=>{throw new Error("TooLost response loss did not surface");},()=>{});
    const submission=(await direct.query("SELECT state,checkpoint FROM integration_distribution_submissions WHERE release_id='sim-release'")).rows[0];
    check(submission.state==="unknown" && submission.checkpoint.providerReleaseId==="tl_sim_001",
      "TooLost accepted checkpoint is durable and ambiguous result is unknown");
    output.routes.push("submitToolostRelease -> submitDistributionOnce -> simulated TooLost transport");
  } else {
    const duplicate = await processCommerceEvent({id:"evt_sale",type:"checkout.session.completed"}, async () => {
      throw new Error("durable receipt failed across process restart");
    });
    check(duplicate.success && duplicate.message==="Event already processed", "delayed duplicate callback skipped after process restart");

    let tooLostCalls=0;
    const blockedClient:any={getAvailableDSPs:async()=>({dsps:[{id:"spotify",slug:"spotify",name:"Spotify"}]}),
      createRelease:async()=>{tooLostCalls++;throw new Error("must not blindly repeat");}};
    const release:any={title:"Simulation Release",artistName:"Simulation Artist",releaseDate:"2030-01-01",genre:"Electronic",
      artworkUrl:"https://assets.invalid/simulation.jpg",metadata:{artworkAiUsage:"none",audioAiUsage:"none",
      compositionAiUsage:"none",composerName:"Simulation Composer",acceptTerms:true,confirmRights:true,confirmYoutubeRights:true}};
    await submitToolostRelease({client:blockedClient,userId:"sim-seller",releaseId:"sim-release",release,
      tracks:[{title:"Simulation Track",audioUrl:"https://assets.invalid/track.wav",duration:180}],requestedPlatforms:["Spotify"]})
      .then(()=>{throw new Error("ambiguous TooLost submission was repeated");},()=>{});
    check(tooLostCalls===0 && state.creates.toolost===1, "ambiguous TooLost acceptance is not blindly repeated after restart");

    await direct.query("UPDATE commerce_operations SET lease_until=now()-interval '1 second' WHERE kind='withdrawal'");
    let engine=new CommerceEngine(repo,new StripeCommerceProvider(stripeSimulator));
    await engine.execute().then(()=>{throw new Error("payout response loss did not surface");},()=>{});
    check(state.creates.transfer===1 && state.creates.payout===1, "retry discovered prior transfer and created one simulated payout");
    await direct.query("UPDATE commerce_operations SET lease_until=now()-interval '1 second' WHERE kind='withdrawal'");
    engine=new CommerceEngine(repo,new StripeCommerceProvider(stripeSimulator));
    const completed=await engine.execute();
    check(completed?.state==="completed", "second retry discovered accepted payout and completed durable operation");
    check(state.creates.transfer===1 && state.creates.payout===1, "provider recovery produced no duplicate accepted effects");
    output.routes.push("restart -> Stripe provider list/reconcile -> CommerceRepository.paid");
  }
  save();
  console.log(JSON.stringify(output));
} finally {
  await direct.end();
  await (applicationPool as any).end();
}