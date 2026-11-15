// Credential-free production-parameter contract simulation. Providers are local deterministic objects.
// Run only as: env -i PATH="$PATH" HOME=/tmp node scripts/production-provider-simulation.mjs
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";

if (Object.keys(process.env).some(k => /DATABASE|PGHOST|PGPORT|PGUSER|PGPASSWORD|NEON|STRIPE|TOOLOST|NODE_OPTIONS/.test(k)))
  throw new Error("Refusing inherited database/provider/runtime configuration; invoke under env -i");

const root=resolve(".");
const temp=mkdtempSync("/tmp/commerce-provider-simulation-");
const socketPort="55441";
const digest=p=>createHash("sha256").update(readFileSync(p)).digest("hex");
const revision=spawnSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).stdout.trim();
const timestamp=new Date().toISOString().replace(/[:.]/g,"-");
const reportPath=`reports/production-provider-simulation-${timestamp}.md`;
const statePath=join(temp,"provider-state.json");
writeFileSync(statePath,JSON.stringify({transfers:[],payouts:[],creates:{transfer:0,payout:0,toolost:0}}));
const baseEnv={PATH:process.env.PATH,HOME:temp,LANG:"C",TZ:"UTC"};
let started=false, client, failures=0;
const results=[];
function run(command,args,env=baseEnv) {
  const r=spawnSync(command,args,{cwd:root,env,encoding:"utf8",timeout:120000});
  if(r.status!==0) throw new Error(`${command} ${args.join(" ")}\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}
try {
  const schema=readFileSync("shared/schema.ts","utf8");
  const baseline=schema.replace('export * from "./readiness-schema";',"");
  mkdirSync(join(temp,"schema")); symlinkSync(join(root,"node_modules"),join(temp,"node_modules"),"dir");
  writeFileSync(join(temp,"schema/schema.ts"),baseline);
  const config=join(temp,"drizzle.json");
  writeFileSync(config,JSON.stringify({dialect:"postgresql",schema:join(temp,"schema/schema.ts"),out:join(temp,"baseline")}));
  run(process.execPath,["node_modules/drizzle-kit/bin.cjs","generate",`--config=${config}`]);
  run("initdb",["-D",join(temp,"data"),"-U","simulation","--auth=trust","--no-locale","--encoding=UTF8"]);
  run("pg_ctl",["-D",join(temp,"data"),"-l",join(temp,"postgres.log"),"-o",`-k ${temp} -p ${socketPort} -h ''`,"-w","start"]);
  started=true;
  client=new pg.Client({host:temp,port:Number(socketPort),user:"simulation",database:"postgres"});
  await client.connect();
  for(const file of readdirSync(join(temp,"baseline")).filter(f=>f.endsWith(".sql")).sort())
    await client.query(readFileSync(join(temp,"baseline",file),"utf8"));
  for(const file of ["migrations/0022_commerce_webhook_receipts.sql","migrations/0022_integrations_distribution_submissions.sql","migrations/0023_commerce_settlement.sql"])
    await client.query(readFileSync(file,"utf8"));

  const databaseUrl=`postgresql://simulation@%2F${temp.slice(1).replaceAll("/","%2F")}:${socketPort}/postgres`;
  const workerEnv={...baseEnv,DATABASE_URL:databaseUrl,NODE_ENV:"test",READINESS_ISOLATED_PG:"1",
    READINESS_EGRESS_GUARD:"1",PROVIDER_MODE:"SIMULATED_STRIPE_AND_TOOLOST",
    SESSION_SECRET:"simulation-only-not-a-deployment-secret-0000000000000000"};
  for(const phase of ["first","restart"]) {
    const text=run(process.execPath,["--import","./scripts/readiness-egress-guard.mjs","--import","tsx",
      "scripts/production-provider-simulation-worker.ts",phase,statePath],workerEnv);
    const line=text.trim().split("\n").findLast(x=>x.startsWith("{"));
    if(!line) throw new Error(`Worker ${phase} did not emit JSON`);
    results.push(JSON.parse(line));
  }

  const unbalanced=(await client.query(`SELECT j.id,j.currency,sum(e.amount_cents)::text total FROM commerce_journals j
    JOIN commerce_entries e ON e.journal_id=j.id GROUP BY j.id,j.currency HAVING sum(e.amount_cents)<>0`)).rows;
  const journals=(await client.query(`SELECT j.id,j.currency,sum(e.amount_cents)::text total,count(*)::int lines
    FROM commerce_journals j JOIN commerce_entries e ON e.journal_id=j.id GROUP BY j.id,j.currency ORDER BY j.id`)).rows;
  const receipts=(await client.query("SELECT event_id,event_type FROM commerce_webhook_receipts ORDER BY event_id")).rows;
  const effects=(await client.query(`SELECT
    (SELECT count(*)::int FROM commerce_sources WHERE id='sim-order') sources,
    (SELECT count(*)::int FROM revenue_events WHERE order_id='sim-order') revenue_events,
    (SELECT count(*)::int FROM commerce_operations WHERE kind='withdrawal') withdrawals,
    (SELECT status FROM orders WHERE id='sim-order') order_status,
    (SELECT license_document_url FROM orders WHERE id='sim-order') license_url`)).rows[0];
  const currencies=(await client.query(`SELECT j.currency,e.account,sum(e.amount_cents)::text cents FROM commerce_entries e
    JOIN commerce_journals j ON j.id=e.journal_id GROUP BY j.currency,e.account ORDER BY j.currency,e.account`)).rows;
  if(unbalanced.length) throw new Error(`unbalanced journals: ${JSON.stringify(unbalanced)}`);
  if(effects.sources!==1||effects.revenue_events!==1||effects.withdrawals!==1||effects.order_status!=="completed"||!effects.license_url)
    throw new Error(`accepted effect threshold failed: ${JSON.stringify(effects)}`);
  if(receipts.length!==1||receipts[0].event_id!=="evt_sale") throw new Error(`receipt threshold failed: ${JSON.stringify(receipts)}`);
  const state=JSON.parse(readFileSync(statePath,"utf8"));
  if(state.creates.transfer!==1||state.creates.payout!==1||state.creates.toolost!==1)
    throw new Error(`provider duplicate threshold failed: ${JSON.stringify(state.creates)}`);

  const report=[
    "# Production-parameter commerce/provider process simulation","",
    "**SIMULATION — deterministic local Stripe and TooLost contract transports; no real API acceptance is claimed.**",
    `Run: ${new Date().toISOString()}`,`Revision: ${revision}`,
    "Isolation: parent and workers use allowlisted env-i-derived environments. Workers preload the socket egress guard, which rejects every non-loopback TCP/TLS destination and all UDP. PostgreSQL listened only on a private temporary Unix socket (`listen_addresses=''`). No external credentials, Neon/shared database, TCP provider endpoint, or financial API write was used.",
    "", "## Thresholds defined before execution",
    "- Accepted-effect rows per immutable source/provider command: exactly 1.",
    "- Unbalanced committed journals: 0.",
    "- Cross-currency arithmetic: 0; every query and journal remains currency-partitioned (USD exercised; other currencies not combined).",
    "- Mismatched callback settlement effects: 0; callback must match frozen payment, amount, and currency.",
    "- Lost-response retries: unresolved state must remain durable; provider create count must stay 1 after list/reconcile.",
    "- Durable successful webhook receipts: exactly 1 per event; failed callbacks receive no receipt.",
    "", "## Effective parameters",
    "- Sale: USD 10,000 cents gross; 1,000 platform fee; 320 processor fee; 500 tax; 8,500 seller allocation.",
    "- Withdrawal: USD 5,000 cents; standard simulated payout; repository risk and allocation checks enabled.",
    "- Retry/restart: transfer response loss, process restart, payout response loss, reconciliation retry; webhook duplicate delayed until restart.",
    "- TooLost: one Spotify release; accepted checkpoint followed by response loss; restart retry must be blocked pending reconciliation.",
    "- Worker timeout: 120 seconds each; operation leases deterministically expired only to model elapsed retry delay.",
    "", "## Critical source hashes",
    ...["server/services/commerce/repository.ts","server/services/commerce/engine.ts","server/services/commerce/provider.ts",
      "server/services/commerceWebhookRepository.ts","server/services/distributionSubmissionRepository.ts",
      "server/routes/distribution-toolost-submission.ts","migrations/0023_commerce_settlement.sql"].map(p=>`- ${p}: SHA256 ${digest(p)}`),
    "", "## Results",
    ...results.flatMap(r=>[`### ${r.phase}`, ...r.assertions.map(x=>`- PASS: ${x}`),...r.routes.map(x=>`- Trace: ${x}`)]),
    `- PASS: provider accepted create counts ${JSON.stringify(state.creates)}.`,
    `- PASS: actual SQL effect counts ${JSON.stringify(effects)}.`,
    `- PASS: committed journal balance query returned 0 failures. Actual journals: ${JSON.stringify(journals)}.`,
    `- PASS: durable receipts: ${JSON.stringify(receipts)}.`,
    `- Currency-partitioned account totals (actual SQL, not expected constants): ${JSON.stringify(currencies)}.`,
    "", "## Coverage and honest limits",
    "Exercised: actual CommerceRepository booking/reserve/paid SQL; actual CommerceEngine; actual StripeCommerceProvider lookup-before-create contract against a local simulator; actual durable webhook inbox/receipt handler; actual TooLost route payload/platform resolution and distribution submission repository; marketplace completion/license readiness path.",
    "Unexercised/unsupported here: real Stripe signatures/HTTP SDK transport, real TooLost HTTP/account catalog, refunds/disputes/reversals/bank-return, tax remittance, multi-currency FX/conversion, Connect account authorization, notification delivery, storefront/merch/subscription handlers, network partitions longer than lease, concurrency/load, and any live/shared migration. USD currency isolation was exercised; no claim is made that an FX path exists.",
    "Outcome: PASS for this credential-free disposable synthetic-database simulation only. Production provider acceptance remains NOT TESTED.",
  ];
  mkdirSync("reports",{recursive:true});
  writeFileSync(reportPath,report.join("\n")+"\n",{flag:"wx"});
  console.log(report.join("\n"));
} catch(error) {
  failures++;
  console.error(error.stack||error);
} finally {
  if(client) await client.end().catch(()=>{});
  if(started) spawnSync("pg_ctl",["-D",join(temp,"data"),"-m","immediate","-w","stop"],{env:baseEnv,encoding:"utf8"});
  rmSync(temp,{recursive:true,force:true});
}
console.log(`Artifact: ${reportPath}`);
process.exitCode=failures?1:0;