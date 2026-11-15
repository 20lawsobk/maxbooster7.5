import { pool } from "../../db";
import { majorUnits } from "./contract";

/** Read-only evidence, never a credit or a reconstructed withdrawable balance. */
export async function legacyReconciliation(userId:string) {
  const [orders, royalties, payouts, statements, ledger] = await Promise.all([
    pool.query(`SELECT o.id,o.amount,o.currency,o.status,o.created_at FROM orders o
      WHERE o.seller_id=$1 AND o.status='completed'
      AND NOT EXISTS (SELECT 1 FROM commerce_sources s WHERE s.id=o.id) ORDER BY o.created_at DESC`,[userId]),
    pool.query(`SELECT id,amount,currency,status,created_at,metadata FROM royalty_transactions
      WHERE user_id=$1 ORDER BY created_at DESC`,[userId]),
    pool.query("SELECT * FROM instant_payouts WHERE user_id=$1 ORDER BY created_at DESC",[userId]),
    pool.query("SELECT * FROM royalty_statements WHERE user_id=$1 ORDER BY created_at DESC",[userId]),
    pool.query("SELECT * FROM ledger_entries WHERE user_id=$1 ORDER BY created_at DESC",[userId]),
  ]);
  return {status:"requires_reconciliation",withdrawable:false,
    notice:"Historical records are unverified evidence, may overlap, and are not added to available balance. Finance must reconcile funding, refunds and prior payouts.",
    orders:orders.rows,royalties:royalties.rows,payouts:payouts.rows,statements:statements.rows,ledger:ledger.rows};
}

export function withdrawalView(op:any) {
  const status=op.state==="completed"?"completed":op.state==="cancelled"?"cancelled":
    op.state==="failed"?"failed":op.state==="review"?"review":"pending";
  return {id:op.id,userId:op.user_id,amountCents:Number(op.amount_cents),
    amount:String(majorUnits(Number(op.amount_cents),op.currency)),currency:op.currency,
    status,providerState:op.state,stripePayoutId:op.provider_id ?? null,
    requestedAt:op.created_at,createdAt:op.created_at,
    completedAt:op.state==="completed"?op.updated_at ?? null:null,
    failureReason:op.error ?? null,metadata:{transferId:op.transfer_id},source:"commerce"};
}

export function summarizeWithdrawals(rows:any[]) {
  const payouts=rows.map(withdrawalView);
  const byCurrency:Record<string,{completedAmount:number;completedCents:number;byStatus:Record<string,{count:number;amount:number}>;byMonth:Record<string,{count:number;amount:number}>}>={};
  for(const payout of payouts) {
    const currency=payout.currency.toLowerCase();
    const group=byCurrency[currency] ??= {completedAmount:0,completedCents:0,byStatus:{},byMonth:{}};
    const amount=Number(payout.amount);
    const month=new Date(payout.createdAt).toISOString().slice(0,7);
    for(const [map,key] of [[group.byStatus,payout.status],[group.byMonth,month]] as const) {
      const bucket=map[key] ??= {count:0,amount:0};
      bucket.count++; bucket.amount+=amount;
    }
    if(payout.status==="completed") {group.completedCents+=payout.amountCents;group.completedAmount=majorUnits(group.completedCents,currency);}
  }
  return {totalPayouts:payouts.length,completedPayouts:payouts.filter(p=>p.status==="completed").length,
    failedPayouts:payouts.filter(p=>p.status==="failed").length,
    pendingPayouts:payouts.filter(p=>p.status==="pending"||p.status==="review").length,
    payouts,summary:{byCurrency}};
}

export async function commercePayoutReport(userId:string,start:Date,end:Date) {
  if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<start) throw new Error("Invalid payout report period");
  const rows=(await pool.query(`SELECT * FROM commerce_operations
    WHERE user_id=$1 AND kind='withdrawal' AND created_at >= $2 AND created_at <= $3
    ORDER BY created_at DESC`,[userId,start,end])).rows;
  const legacy=(await pool.query(`SELECT * FROM instant_payouts
    WHERE user_id=$1 AND created_at >= $2 AND created_at <= $3 ORDER BY created_at DESC`,[userId,start,end])).rows;
  return {...summarizeWithdrawals(rows),reconciliation:{status:"requires_reconciliation",includedInTotals:false,payouts:legacy}};
}