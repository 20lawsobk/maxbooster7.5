import { pool } from "../db";
import { randomUUID } from "node:crypto";

/** Durable inbox; no pool connection is held while nested handlers do I/O.
 * Financial side effects use their own immutable source/operation IDs.
 */
export async function processCommerceEvent(
  event:{id:string;type:string},
  handler:()=>Promise<{success:boolean;message:string}>,
):Promise<{success:boolean;message:string}> {
  await pool.query(`INSERT INTO commerce_webhook_inbox(event_id,event_type,payload)
    VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[event.id,event.type,JSON.stringify(event)]);
  if((await pool.query("SELECT event_id FROM commerce_webhook_receipts WHERE event_id=$1",[event.id])).rows.length) {
    return {success:true,message:"Event already processed"};
  }
  const token=randomUUID();
  const claim=await pool.query(`UPDATE commerce_webhook_inbox SET state='running',lease_token=$2,
    lease_until=now()+interval '5 minutes',attempts=attempts+1
    WHERE event_id=$1 AND state<>'completed' AND (lease_until IS NULL OR lease_until<now()) RETURNING event_id`,[event.id,token]);
  if(!claim.rows.length) return {success:false,message:"Event is already being processed; retry later"};
  let heartbeatError:unknown;
  const heartbeat=setInterval(()=>{
    pool.query("UPDATE commerce_webhook_inbox SET lease_until=now()+interval '5 minutes' WHERE event_id=$1 AND lease_token=$2",[event.id,token])
      .catch(e=>{heartbeatError=e;});
  },30000);
  heartbeat.unref();
  try {
    const result=await handler();
    if(heartbeatError) throw heartbeatError;
    if(!result.success) throw new Error(result.message);
    const client=await pool.connect();
    try {
      await client.query("BEGIN");
      const row=await client.query("UPDATE commerce_webhook_inbox SET state='completed',lease_until=NULL WHERE event_id=$1 AND lease_token=$2 RETURNING event_id",[event.id,token]);
      if(!row.rows.length) throw new Error("Webhook lease lost");
      await client.query("INSERT INTO commerce_webhook_receipts(event_id,event_type) VALUES($1,$2) ON CONFLICT DO NOTHING",[event.id,event.type]);
      await client.query("COMMIT");
    } catch(error) {await client.query("ROLLBACK");throw error;} finally {client.release();}
    return result;
  } catch(error) {
    const message=error instanceof Error?error.message:String(error);
    await pool.query(`UPDATE commerce_webhook_inbox SET state='retry',lease_until=now()+interval '1 minute',error=$3
      WHERE event_id=$1 AND lease_token=$2`,[event.id,token,message]);
    return {success:false,message};
  } finally {clearInterval(heartbeat);}
}