import { randomUUID, createHash } from "node:crypto";
import type { Operation, Sale } from "./contract";
import { majorUnits } from "./contract";

export interface SqlClient { query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>; release(): void }
export interface SqlPool { connect(): Promise<SqlClient>; query(sql:string, params?:unknown[]): Promise<{rows:any[]}> }
type Entry = { account:string; userId?:string; cents:number };
export class CommerceRepository {
  constructor(private pool:SqlPool) {}
  async tx<T>(fn:(c:SqlClient)=>Promise<T>):Promise<T> {
    const c=await this.pool.connect();
    try {
      await c.query("BEGIN");
      // An unapplied migration is a hard deployment prerequisite, never a fallback.
      await c.query("SELECT id FROM commerce_sources LIMIT 0");
      const value=await fn(c); await c.query("COMMIT"); return value;
    } catch(e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
  }
  private async lock(c:SqlClient,key:string) { await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[key]); }
  private async journal(c:SqlClient,id:string,currency:string,source:string,entries:Entry[]) {
    if(entries.some(e=>!Number.isSafeInteger(e.cents)) || entries.reduce((n,e)=>n+e.cents,0)!==0) throw new Error("Unbalanced journal");
    const inserted=await c.query("INSERT INTO commerce_journals(id,currency,source) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id",[id,currency,source]);
    if(!inserted.rows.length) return;
    for(let i=0;i<entries.length;i++) await c.query("INSERT INTO commerce_entries(journal_id,line,account,user_id,amount_cents) VALUES($1,$2,$3,$4,$5)",[id,i,entries[i].account,entries[i].userId||null,entries[i].cents]);
  }
  async book(sale:Sale) {
    const processingFee=sale.processingFeeCents||0;
    const tax=sale.taxCents||0;
    if(!Number.isSafeInteger(tax)||tax<0) throw new Error("Invalid collected tax");
    if(!Number.isSafeInteger(processingFee)||processingFee<0||processingFee>sale.grossCents) throw new Error("Invalid processing fee");
    if(!Number.isSafeInteger(sale.grossCents)||sale.grossCents<=0||!Number.isSafeInteger(sale.feeCents)||sale.feeCents<0 ||
      sale.allocations.some(a=>!Number.isSafeInteger(a.cents)||a.cents<0) ||
      sale.allocations.reduce((n,a)=>n+a.cents,0)+sale.feeCents+tax!==sale.grossCents) throw new Error("Invalid allocation conservation");
    return this.tx(async c=>{
      await this.lock(c,`source:${sale.id}`);
      const fingerprint=createHash("sha256").update(JSON.stringify({...sale,allocations:[...sale.allocations].sort((a,b)=>a.userId.localeCompare(b.userId))})).digest("hex");
      const existing=(await c.query("SELECT metadata FROM commerce_sources WHERE id=$1",[sale.id])).rows[0];
      if(existing) {
        if(existing.metadata.fingerprint!==fingerprint) throw new Error("Settlement replay changed immutable terms");
        return;
      }
      if(sale.kind==="royalty") {
        const result=await c.query(`UPDATE commerce_statements SET funded=true,funding_ref=$2
          WHERE statement_id=$1 AND (funding_ref IS NULL OR funding_ref=$2) RETURNING statement_id`,
          [sale.metadata?.statementId,sale.metadata?.topupId]);
        if(!result.rows.length) throw new Error("Statement funding conflict");
      }
      await c.query("INSERT INTO commerce_sources(id,kind,payment_intent,currency,gross_cents,fee_cents,metadata,tax_cents) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[sale.id,sale.kind,sale.paymentIntent,sale.currency,sale.grossCents,sale.feeCents,JSON.stringify({...sale.metadata,fingerprint}),tax]);
      for(const a of sale.allocations) {
        await c.query("INSERT INTO commerce_allocations(id,source_id,user_id,currency,amount_cents) VALUES($1,$2,$3,$4,$5)",[`${sale.id}:${a.userId}`,sale.id,a.userId,sale.currency,a.cents]);
      }
      await this.journal(c,`sale:${sale.id}`,sale.currency,sale.id,[
        {account:"platform_clearing",cents:-(sale.grossCents-processingFee)},
        {account:"processor_expense",cents:-processingFee},{account:"platform_fee",cents:sale.feeCents},
        {account:"tax_liability",cents:tax},
        ...sale.allocations.map(a=>({account:"payable",userId:a.userId,cents:a.cents})),
      ]);
      if(sale.kind==="marketplace") {
        await c.query(`INSERT INTO revenue_events(user_id,source,source_type,amount,currency,listing_id,order_id)
          VALUES($1,'marketplace','beat_sale',$2,$3,$4,$5) ON CONFLICT(order_id) DO NOTHING`,
          [sale.metadata?.sellerId,majorUnits(sale.grossCents,sale.currency),sale.currency,sale.metadata?.listingId,sale.id]);
        const fulfilled=await c.query("UPDATE orders SET status='completed' WHERE id=$1 AND license_document_url IS NOT NULL RETURNING id",[sale.id]);
        if(!fulfilled.rows.length) throw new Error("Order license obligation is not ready");
      }
      if(sale.kind==="merchant") {
        const fulfilled=await c.query("UPDATE storefront_orders SET status='completed',stripe_payment_intent_id=$2,stripe_session_id=$3,updated_at=now() WHERE id=$1 RETURNING id",
          [sale.metadata?.merchantOrderId,sale.paymentIntent,sale.metadata?.sessionId]);
        if(!fulfilled.rows.length) throw new Error("Merchant order no longer exists");
      }
    });
  }
  async balance(userId:string,currency="usd") {
    const rows=(await this.pool.query(`SELECT e.account, COALESCE(sum(e.amount_cents),0)::text AS cents
      FROM commerce_entries e JOIN commerce_journals j ON j.id=e.journal_id
      WHERE e.user_id=$1 AND j.currency=$2 GROUP BY e.account`,[userId,currency])).rows;
    const value=(account:string)=>Number(rows.find(r=>r.account===account)?.cents||0);
    const eligible=(await this.pool.query(`SELECT COALESCE(sum(GREATEST(a.amount_cents-a.reversed_cents-a.drawn_cents,0)),0)::text AS cents
      FROM commerce_allocations a WHERE a.user_id=$1 AND a.currency=$2 AND NOT EXISTS(
        SELECT 1 FROM commerce_operations o WHERE o.kind='refund' AND o.payload->>'orderId'=a.source_id
        AND o.state NOT IN ('completed','failed','cancelled'))`,[userId,currency])).rows[0];
    return {available:Math.min(value("payable"),Number(eligible.cents)),reserved:value("reserved"),paid:value("disbursed")};
  }
  async reserve(userId:string,cents:number,currency:string,key:string,accountId:string) {
    if(!Number.isSafeInteger(cents)||cents<=0||!accountId||!key||key.length>180) throw new Error("Invalid payout request");
    const id=`wd_${createHash("sha256").update(`${userId}:${key}`).digest("hex")}`;
    return this.tx(async c=>{
      await this.lock(c,`wallet:${userId}:${currency}`);
      const prior=(await c.query("SELECT * FROM commerce_operations WHERE id=$1",[id])).rows[0];
      if(prior) {
        if(Number(prior.amount_cents)!==cents||prior.currency!==currency) throw new Error("Idempotency key reused with different payout");
        return this.operation(prior);
      }
      const balance=(await c.query(`SELECT COALESCE(sum(e.amount_cents),0)::text AS cents FROM commerce_entries e
        JOIN commerce_journals j ON j.id=e.journal_id WHERE e.user_id=$1 AND e.account='payable' AND j.currency=$2`,[userId,currency])).rows[0];
      if(Number(balance.cents)<cents) throw new Error("Insufficient funded unreserved balance");
      const activity=(await c.query(`SELECT count(*) FILTER(WHERE created_at>=now()-interval '1 day')::int AS daily_count,
        COALESCE(sum(amount_cents) FILTER(WHERE created_at>=now()-interval '1 day'),0)::text AS daily,
        COALESCE(sum(amount_cents),0)::text AS weekly FROM commerce_operations
        WHERE user_id=$1 AND currency=$2 AND kind='withdrawal' AND state NOT IN ('cancelled','failed')
        AND created_at>=now()-interval '7 days'`,[userId,currency])).rows[0];
      const actor=(await c.query("SELECT created_at FROM users WHERE id=$1",[userId])).rows[0];
      if(!actor?.created_at) throw new Error("Payout account age cannot be verified");
      const age=(Date.now()-new Date(actor.created_at).getTime())/86400000;
      let risk=age<7?30:age<30?10:0;
      if(Number(activity.daily_count)>=3) risk+=25;
      if(majorUnits(Number(activity.daily),currency)>5000) risk+=20;
      if(majorUnits(Number(activity.weekly),currency)>10000) risk+=15;
      if(majorUnits(cents,currency)>2000) risk+=10;
      if(cents>Number(balance.cents)*0.9) risk+=15;
      const disputes=(await c.query(`SELECT count(*)::int AS count FROM commerce_allocations a JOIN commerce_sources s ON s.id=a.source_id
        WHERE a.user_id=$1 AND s.disputed_cents>0`,[userId])).rows[0];
      if(Number(disputes.count)>0) risk+=60;
      if(risk>=60) throw new Error(`Payout requires risk review (score ${risk}); no money was reserved or sent`);
      await c.query("INSERT INTO commerce_operations(id,kind,user_id,currency,amount_cents,payload) VALUES($1,'withdrawal',$2,$3,$4,$5)",[id,userId,currency,cents,JSON.stringify({accountId})]);
      const allocations=(await c.query(`SELECT a.* FROM commerce_allocations a WHERE user_id=$1 AND currency=$2
        AND amount_cents-reversed_cents-drawn_cents>0 AND NOT EXISTS(
          SELECT 1 FROM commerce_operations o WHERE o.kind='refund' AND o.payload->>'orderId'=a.source_id
          AND o.state NOT IN ('completed','failed','cancelled')) ORDER BY created_at,id FOR UPDATE`,[userId,currency])).rows;
      let remaining=cents;
      for(const a of allocations) {
        const amount=Math.min(remaining,Number(a.amount_cents)-Number(a.reversed_cents)-Number(a.drawn_cents));
        if(amount<=0) continue;
        await c.query(`INSERT INTO commerce_draws(operation_id,allocation_id,amount_cents,compensated_cents_at_draw)
          SELECT $1,$2,$3,compensated_cents FROM commerce_sources WHERE id=$4`,[id,a.id,amount,a.source_id]);
        await c.query("UPDATE commerce_allocations SET drawn_cents=drawn_cents+$2 WHERE id=$1",[a.id,amount]);
        remaining-=amount;
      }
      if(remaining) throw new Error("Allocation funding mismatch");
      await this.journal(c,`reserve:${id}`,currency,id,[{account:"payable",userId,cents:-cents},{account:"reserved",userId,cents}]);
      return this.operation((await c.query("SELECT * FROM commerce_operations WHERE id=$1",[id])).rows[0]);
    });
  }
  private operation(row:any):Operation { return {...row,amount_cents:Number(row.amount_cents)}; }
  async get(id:string):Promise<Operation|undefined> {
    const row=(await this.pool.query("SELECT * FROM commerce_operations WHERE id=$1",[id])).rows[0];
    return row ? this.operation(row) : undefined;
  }
  async history(userId:string,limit=100,offset=0) {
    return (await this.pool.query("SELECT * FROM commerce_operations WHERE user_id=$1 AND kind='withdrawal' ORDER BY created_at DESC LIMIT $2 OFFSET $3",[userId,limit,offset])).rows.map(r=>this.operation(r));
  }
  async countHistory(userId:string) {
    return Number((await this.pool.query("SELECT count(*) AS total FROM commerce_operations WHERE user_id=$1 AND kind='withdrawal'",[userId])).rows[0].total);
  }
  async statement(userId:string,currency:string,start:Date,end:Date) {
    if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start) throw new Error("Invalid statement period");
    const opening=(await this.pool.query(`SELECT e.account,COALESCE(sum(e.amount_cents),0)::text AS cents
      FROM commerce_entries e JOIN commerce_journals j ON j.id=e.journal_id
      WHERE e.user_id=$1 AND j.currency=$2 AND j.created_at<$3 GROUP BY e.account`,[userId,currency,start])).rows;
    const entries=(await this.pool.query(`SELECT j.id,j.source,j.currency,j.created_at,e.account,e.amount_cents::text
      FROM commerce_entries e JOIN commerce_journals j ON j.id=e.journal_id
      WHERE e.user_id=$1 AND j.currency=$2 AND j.created_at>=$3 AND j.created_at<$4
      ORDER BY j.created_at,j.id,e.line`,[userId,currency,start,end])).rows;
    return {userId,currency,periodStart:start,periodEnd:end,openingBalances:opening,entries};
  }
  async claim(id?:string):Promise<Operation|undefined> {
    const token=randomUUID();
    const rows=(await this.pool.query(`UPDATE commerce_operations SET state='running',lease_token=$1,
      lease_until=now()+interval '5 minutes',attempts=attempts+1,updated_at=now()
      WHERE id=(SELECT id FROM commerce_operations WHERE state IN ('pending','retry','awaiting','running')
      AND (lease_until IS NULL OR lease_until<now()) AND ($2::text IS NULL OR id=$2)
      ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`,[token,id||null])).rows;
    return rows[0] ? this.operation(rows[0]) : undefined;
  }
  async update(op:Operation,patch:{transferId?:string;providerId?:string;state?:string;error?:string;bankStarted?:boolean}) {
    const r=await this.pool.query(`UPDATE commerce_operations SET transfer_id=COALESCE($3,transfer_id),
      provider_id=COALESCE($4,provider_id),state=COALESCE($5,state),error=$6,updated_at=now(),
      payload=CASE WHEN $7::boolean IS TRUE THEN payload || '{"bankStarted":true}'::jsonb ELSE payload END,
      lease_until=CASE WHEN $5 IN ('retry','awaiting') THEN now()+interval '5 minutes' ELSE lease_until END
      WHERE id=$1 AND lease_token=$2 RETURNING id`,[op.id,op.lease_token,patch.transferId||null,patch.providerId||null,patch.state||null,patch.error||null,patch.bankStarted||false]);
    if(!r.rows.length) throw new Error("Operation lease lost; provider result requires reconciliation");
    if(op.kind==="refund") {
      const status=patch.state==="completed"?"succeeded":patch.state==="failed"?"failed":"pending";
      await this.pool.query("UPDATE refunds SET stripe_refund_id=COALESCE($2,stripe_refund_id),status=$3 WHERE id=$1",[op.id,patch.providerId||null,status]);
    }
  }
  async paid(op:Operation) {
    await this.tx(async c=>{
      await this.lock(c,`wallet:${op.user_id}:${op.currency}`);
      const row=(await c.query("SELECT * FROM commerce_operations WHERE id=$1 FOR UPDATE",[op.id])).rows[0];
      if(row.state==="completed") return;
      if(row.lease_token!==op.lease_token) throw new Error("Payout lease lost");
      await this.journal(c,`paid:${op.id}`,op.currency,op.id,[{account:"reserved",userId:op.user_id,cents:-op.amount_cents},{account:"disbursed",userId:op.user_id,cents:op.amount_cents}]);
      await c.query("UPDATE commerce_operations SET state='completed',lease_until=NULL WHERE id=$1",[op.id]);
    });
  }
  async bankReturned(op:Operation) {
    return this.tx(async c=>{
      await this.lock(c,`wallet:${op.user_id}:${op.currency}`);
      const current=(await c.query("SELECT * FROM commerce_operations WHERE id=$1 FOR UPDATE",[op.id])).rows[0];
      if(current.state!=="completed") return current.state;
      await this.journal(c,`bank-return:${op.id}`,op.currency,op.id,[
        {account:"disbursed",userId:op.user_id,cents:-op.amount_cents},
        {account:"reserved",userId:op.user_id,cents:op.amount_cents},
      ]);
      const recoveries=(await c.query(`SELECT id FROM commerce_operations WHERE kind='reversal'
        AND split_part(payload->>'drawId',':',1)=$1 LIMIT 1`,[op.id])).rows;
      // Returned cash plus an independently attempted refund recovery must not
      // be spent twice. Preserve the funds in an explicit reconciliation hold.
      const state=recoveries.length?"review":"pending";
      await c.query("UPDATE commerce_operations SET state=$2,lease_until=NULL,error=$3 WHERE id=$1",
        [op.id,state,recoveries.length?"Bank return overlaps refund recovery; reconcile provider cash locations before release":null]);
      return state;
    });
  }
  async refundIntent(orderId:string,userId:string,cents:number,key:string) {
    return this.tx(async c=>{
      await this.lock(c,`source:${orderId}`);
      const source=(await c.query("SELECT * FROM commerce_sources WHERE id=$1",[orderId])).rows[0];
      if(!source) throw new Error("Legacy order requires reviewed reconciliation before refund");
      const order=source.kind==="merch"
        ? (await c.query("SELECT buyer_id AS user_id FROM growth_merch_payments WHERE order_id=$1 FOR UPDATE",[source.metadata.growthMerchOrderId])).rows[0]
        : source.kind==="merchant"
        ? (await c.query("SELECT buyer_id AS user_id FROM storefront_orders WHERE id=$1 FOR UPDATE",[source.metadata.merchantOrderId])).rows[0]
        : (await c.query("SELECT user_id FROM orders WHERE id=$1 FOR UPDATE",[orderId])).rows[0];
      if(!order||order.user_id!==userId) throw new Error("Not authorized to refund this order");
      const id=`rf_${createHash("sha256").update(`${userId}:${key}`).digest("hex")}`;
      const prior=(await c.query("SELECT * FROM commerce_operations WHERE id=$1",[id])).rows[0];
      if(prior) {
        if(prior.payload.orderId!==orderId||Number(prior.amount_cents)!==cents) throw new Error("Refund idempotency conflict");
        return this.operation(prior);
      }
      const pending=(await c.query(`SELECT COALESCE(sum(amount_cents),0)::text AS cents FROM commerce_operations
        WHERE kind='refund' AND payload->>'orderId'=$1 AND state NOT IN ('failed','cancelled')`,[orderId])).rows[0];
      // Include externally initiated refunds AND unconfirmed API reservations.
      const apiCompleted=(await c.query(`SELECT COALESCE(sum(amount_cents),0)::text AS cents FROM commerce_operations
        WHERE kind='refund' AND payload->>'orderId'=$1 AND state='completed'`,[orderId])).rows[0];
      const used=Number(source.refunded_cents)+Number(pending.cents)-Number(apiCompleted.cents);
      if(!Number.isSafeInteger(cents)||cents<=0||used+cents>Number(source.gross_cents)) throw new Error("Refund exceeds remaining amount");
      await c.query("INSERT INTO commerce_operations(id,kind,user_id,currency,amount_cents,payload) VALUES($1,'refund',$2,$3,$4,$5)",[id,userId,source.currency,cents,JSON.stringify({orderId,paymentIntent:source.payment_intent})]);
      return this.operation((await c.query("SELECT * FROM commerce_operations WHERE id=$1",[id])).rows[0]);
    });
  }
  async sourceByPayment(paymentIntent:string) {
    return (await this.pool.query("SELECT * FROM commerce_sources WHERE payment_intent=$1",[paymentIntent])).rows[0];
  }
  async compensate(sourceId:string, refunded:number, disputed:number,pendingRefund?:number) {
    await this.tx(async c=>{
      await this.lock(c,`source:${sourceId}`);
      const source=(await c.query("SELECT * FROM commerce_sources WHERE id=$1 FOR UPDATE",[sourceId])).rows[0];
      if(!source) throw new Error("Unreconciled legacy payment; no v2 source");
      // Refunds never decrease. Dispute holds are released on a won dispute.
      refunded=Math.max(refunded,Number(source.refunded_cents));
      pendingRefund=pendingRefund??Number(source.pending_refund_cents);
      const target=Math.min(Number(source.gross_cents),Math.max(refunded+pendingRefund,disputed));
      if(!Number.isSafeInteger(target)||target<0) throw new Error("Invalid reversal amount");
      const allocations=(await c.query("SELECT * FROM commerce_allocations WHERE source_id=$1 ORDER BY user_id FOR UPDATE",[sourceId])).rows;
      const entries:Entry[]=[];
      let beneficiaryDelta=0;
      for(const a of allocations) {
        await this.lock(c,`wallet:${a.user_id}:${a.currency}`);
        const wanted=target===Number(source.gross_cents)?Number(a.amount_cents):Math.floor(Number(a.amount_cents)*target/Number(source.gross_cents));
        const delta=wanted-Number(a.reversed_cents);
        if(delta) entries.push({account:"payable",userId:a.user_id,cents:-delta});
        beneficiaryDelta+=delta;
        await c.query("UPDATE commerce_allocations SET reversed_cents=$2 WHERE id=$1",[a.id,wanted]);
        if(wanted>0) {
          // Recovery is durable; a seller who already banked funds remains in debt
          // until an actual transfer reversal succeeds.
          const draws=(await c.query(`SELECT d.*,o.transfer_id,o.state FROM commerce_draws d JOIN commerce_operations o ON o.id=d.operation_id
            WHERE d.allocation_id=$1 AND d.compensated_cents_at_draw<$2 AND o.transfer_id IS NOT NULL AND o.state='completed' ORDER BY o.created_at`,[a.id,target])).rows;
          const already=(await c.query("SELECT COALESCE(sum(amount_cents),0)::text AS cents FROM commerce_operations WHERE kind='reversal' AND payload->>'allocationId'=$1",[a.id])).rows[0];
          let recovery=wanted-Number(already.cents);
          for(const d of draws) {
            const prior=(await c.query("SELECT COALESCE(sum(amount_cents),0)::text AS cents FROM commerce_operations WHERE kind='reversal' AND payload->>'drawId'=$1",[`${d.operation_id}:${a.id}`])).rows[0];
            const changed=wanted-Math.floor(Number(a.amount_cents)*Number(d.compensated_cents_at_draw)/Number(source.gross_cents));
            const amount=Math.min(recovery,Number(d.amount_cents)-Number(prior.cents),changed-Number(prior.cents));
            if(amount<=0) continue;
            const id=`rv_${createHash("sha256").update(`${sourceId}:${a.id}:${target}:${d.operation_id}`).digest("hex")}`;
            await c.query("INSERT INTO commerce_operations(id,kind,user_id,currency,amount_cents,payload) VALUES($1,'reversal',$2,$3,$4,$5) ON CONFLICT DO NOTHING",[id,a.user_id,a.currency,amount,JSON.stringify({transferId:d.transfer_id,sourceId,allocationId:a.id,drawId:`${d.operation_id}:${a.id}`})]);
            recovery-=amount;
          }
        }
      }
      const delta=target-Number(source.compensated_cents);
      // Partial goodwill refunds do not invent a tax reversal. Full reversals
      // release the actual collected tax; jurisdictional remittance is separate.
      const taxTarget=target===Number(source.gross_cents)?Number(source.tax_cents):0;
      const taxDelta=taxTarget-Number(source.compensated_tax_cents);
      if(delta) {
        entries.push({account:"platform_fee",cents:-(delta-beneficiaryDelta-taxDelta)},
          {account:"tax_liability",cents:-taxDelta},{account:"platform_clearing",cents:delta});
        await this.journal(c,`compensate:${sourceId}:${randomUUID()}`,source.currency,sourceId,entries);
      }
      await c.query("UPDATE commerce_sources SET refunded_cents=$2,disputed_cents=$3,compensated_cents=$4,pending_refund_cents=$5,compensated_tax_cents=$6 WHERE id=$1",[sourceId,refunded,disputed,target,pendingRefund,taxTarget]);
      const status=refunded===Number(source.gross_cents)?"refunded":disputed>0?"disputed":pendingRefund>0?"refund_pending":"completed";
      if(source.kind==="marketplace") await c.query("UPDATE orders SET status=$2 WHERE id=$1",[sourceId,status]);
      if(source.kind==="merchant") await c.query("UPDATE storefront_orders SET status=$2,updated_at=now() WHERE id=$1",[source.metadata.merchantOrderId,status]);
    });
  }
  async recovered(op:Operation) {
    await this.tx(async c=>{
      await this.lock(c,`wallet:${op.user_id}:${op.currency}`);
      const row=(await c.query("SELECT state,lease_token FROM commerce_operations WHERE id=$1 FOR UPDATE",[op.id])).rows[0];
      if(row.state==="completed") return;
      if(row.lease_token!==op.lease_token) throw new Error("Recovery lease lost");
      await this.journal(c,`recovered:${op.id}`,op.currency,op.id,[{account:"payable",userId:op.user_id,cents:op.amount_cents},{account:"platform_recovery",cents:-op.amount_cents}]);
      await c.query("UPDATE commerce_allocations SET drawn_cents=drawn_cents-$2 WHERE id=$1",[op.payload.allocationId,op.amount_cents]);
      await c.query("UPDATE commerce_operations SET state='completed',lease_until=NULL WHERE id=$1 AND lease_token=$2",[op.id,op.lease_token]);
    });
  }
  async providerFee(id:string,fee:number,currency:string,source:string) {
    if(!fee) return;
    await this.tx(c=>this.journal(c,`provider-fee:${id}`,currency,source,[
      {account:"processor_expense",cents:-fee},{account:"platform_clearing",cents:fee},
    ]));
  }
  async withdrawalSources(id:string) {
    return (await this.pool.query(`SELECT DISTINCT s.*,s.compensated_cents>d.compensated_cents_at_draw AS compensation_changed,
      EXISTS(SELECT 1 FROM commerce_operations o WHERE o.kind='refund'
      AND o.payload->>'orderId'=s.id AND o.state NOT IN ('completed','failed','cancelled')) AS refund_pending
      FROM commerce_sources s JOIN commerce_allocations a ON a.source_id=s.id
      JOIN commerce_draws d ON d.allocation_id=a.id WHERE d.operation_id=$1`,[id])).rows;
  }
  async release(op:Operation, cancellationReason?: string) {
    await this.tx(async c=>{
      await this.lock(c,`wallet:${op.user_id}:${op.currency}`);
      const row=(await c.query("SELECT * FROM commerce_operations WHERE id=$1 FOR UPDATE",[op.id])).rows[0];
      if(row.state==="cancelled") return;
      if(row.state==="completed"||row.lease_token!==op.lease_token) throw new Error("Cannot release paid or unowned payout");
      await this.journal(c,`release:${op.id}`,op.currency,op.id,[{account:"reserved",userId:op.user_id,cents:-op.amount_cents},{account:"payable",userId:op.user_id,cents:op.amount_cents}]);
      await c.query(`UPDATE commerce_allocations a SET drawn_cents=a.drawn_cents-d.amount_cents FROM commerce_draws d
        WHERE d.operation_id=$1 AND d.allocation_id=a.id`,[op.id]);
      await c.query("UPDATE commerce_operations SET state='cancelled',lease_until=NULL,payload=payload || $2::jsonb WHERE id=$1",
        [op.id, JSON.stringify(cancellationReason === undefined ? {} : { cancellationReason })]);
    });
  }
  async due(userId:string,periodMonths:number,now=new Date()) {
    const date=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+periodMonths,1));
    await this.pool.query("INSERT INTO commerce_schedules(user_id,next_due) VALUES($1,$2) ON CONFLICT DO NOTHING",[userId,date]);
    const row=(await this.pool.query("SELECT next_due FROM commerce_schedules WHERE user_id=$1",[userId])).rows[0];
    return {due:new Date(row.next_due)<=now,next:new Date(row.next_due)};
  }
  async advance(userId:string,months:number) {
    await this.pool.query("UPDATE commerce_schedules SET next_due=date_trunc('month',now())+($2::int * interval '1 month') WHERE user_id=$1",[userId,months]);
  }
}