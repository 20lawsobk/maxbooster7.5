import { pool } from "../../db";
import { commerceRepository, commerceStripe } from "./runtime";
import { minorUnits } from "./contract";
import { createHash } from "node:crypto";

/** Only an independently verified, succeeded platform top-up can fund an
 * external royalty statement. Forecasts/marketplace projections are not cash.
 */
export async function fundRoyaltyStatement(statementId:string,topupId:string) {
  const topup=await commerceStripe().topups.retrieve(topupId);
  if(topup.status!=="succeeded") throw new Error("Royalty funding has not settled");
  const row=(await pool.query("SELECT * FROM commerce_statements WHERE statement_id=$1",[statementId])).rows[0];
  if(!row) throw new Error("Statement not found");
  if(row.details.status!=="finalized") throw new Error("Only finalized statements can be funded");
  if(row.details.lineItems?.some((line:any)=>line.source==="marketplace" || line.platform==="marketplace" || line.dsp==="marketplace")) throw new Error("Marketplace earnings are already allocated at sale");
  if(!topup.balance_transaction) throw new Error("Funding balance transaction is not available");
  const balance=typeof topup.balance_transaction==="string"
    ? await commerceStripe().balanceTransactions.retrieve(topup.balance_transaction):topup.balance_transaction;
  if(balance.currency!==row.currency || balance.net!==Number(row.payable_cents)) throw new Error("Net settled funding currency/amount must exactly match statement payable");
  await commerceRepository.book({
    id:`statement:${statementId}`,kind:"royalty",paymentIntent:null,currency:row.currency,
    grossCents:Number(row.payable_cents),feeCents:0,allocations:[{userId:row.user_id,cents:Number(row.payable_cents)}],
    metadata:{statementId,topupId},
  });
}
export async function persistStatementDetails(statementId:string,statement:any) {
  const payable=statement.payableAmount===0?0:minorUnits(Number(statement.payableAmount),statement.currency);
  await pool.query(`INSERT INTO commerce_statements(statement_id,user_id,currency,payable_cents,details)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT(statement_id) DO NOTHING`,
    [statementId,statement.userId,statement.currency.toLowerCase(),payable,JSON.stringify(statement)]);
}
export async function saveCanonicalStatement(statement:any) {
  const cents=Number(statement.payableAmount)===0?0:minorUnits(Number(statement.payableAmount),statement.currency);
  const id=createHash("sha256").update(`${statement.userId}:${new Date(statement.periodStart).toISOString()}:${new Date(statement.periodEnd).toISOString()}:${statement.currency}`).digest("hex");
  return commerceRepository.tx(async c=>{
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`statement:${id}`]);
    const prior=(await c.query("SELECT * FROM commerce_statements WHERE statement_id=$1",[id])).rows[0];
    if(prior && (prior.funded||prior.details.status==="finalized") &&
      (Number(prior.payable_cents)!==cents || statement.status!=="finalized")) throw new Error("Finalized statement revisions require adjustment journals");
    await c.query(`INSERT INTO royalty_statements(id,user_id,label,period_start,period_end,total_earnings,status)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET total_earnings=EXCLUDED.total_earnings,status=EXCLUDED.status
      WHERE royalty_statements.status<>'finalized'`,
      [id,statement.userId,statement.period,statement.periodStart,statement.periodEnd,String(statement.payableAmount),statement.status]);
    await c.query(`INSERT INTO commerce_statements(statement_id,user_id,currency,payable_cents,details)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(statement_id) DO UPDATE SET payable_cents=EXCLUDED.payable_cents,details=EXCLUDED.details
      WHERE commerce_statements.funded=false AND commerce_statements.details->>'status'<>'finalized'`,
      [id,statement.userId,statement.currency.toLowerCase(),cents,JSON.stringify(statement)]);
    const details=(await c.query("SELECT payable_cents,details FROM commerce_statements WHERE statement_id=$1",[id])).rows[0];
    if(Number(details.payable_cents)!==cents) throw new Error("Statement revision needs an explicit adjustment journal");
    const row=(await c.query("SELECT * FROM royalty_statements WHERE id=$1",[id])).rows[0];
    return {id:row.id,userId:row.user_id,label:row.label,periodStart:row.period_start,periodEnd:row.period_end,totalEarnings:row.total_earnings,status:row.status,downloadUrl:row.download_url,createdAt:row.created_at};
  });
}