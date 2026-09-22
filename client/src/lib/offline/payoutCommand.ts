import { offlineIdentity, assertOfflineIdentity } from "./identity";

/** Money commands are never queued by the offline transport. Persist intent
 * before sending and retain ambiguous outcomes until the same key is acknowledged.
 */
export async function requestPersistedPayout<T extends {success?:boolean;payoutId?:string}>(
  userId:string,amountCents:number,send:(command:{amountCents:number;key:string})=>Promise<T>,
):Promise<T> {
  const identity=offlineIdentity();
  if(identity.owner!==userId) throw new Error("Sign in to the payout owner's account before withdrawing");
  if(!Number.isSafeInteger(amountCents)||amountCents<=0) throw new Error("Invalid payout amount");
  if(!navigator.locks) throw new Error("Safe payout locking is unavailable in this browser");
  const storageKey=`payout-command:v1:account:${encodeURIComponent(userId)}`;
  return navigator.locks.request(storageKey,async()=>{
    assertOfflineIdentity(identity);
    const raw=localStorage.getItem(storageKey);
    let record=raw?JSON.parse(raw):null;
    if(record && (record.userId!==userId || !["pending","acknowledged"].includes(record.state) ||
      !Number.isSafeInteger(record.amountCents) || record.amountCents<=0 || typeof record.key!=="string" || !record.key))
      throw new Error("Stored payout command requires reconciliation; do not clear browser storage");
    if(record?.state==="pending" && record.amountCents!==amountCents)
      throw new Error(`A prior withdrawal of ${(record.amountCents/100).toFixed(2)} USD has an unconfirmed response. Retry that amount to reconcile it before creating another withdrawal.`);
    if(record?.state==="acknowledged")
      throw new Error(`Withdrawal ${record.payoutId} was already acknowledged. Review payout history, then explicitly start another withdrawal.`);
    if(!record) {
      record={userId,amountCents,key:crypto.randomUUID(),state:"pending"};
      // Storage failures block sending; never fall back to an untracked command.
      localStorage.setItem(storageKey,JSON.stringify(record));
    }
    const result=await send({amountCents:record.amountCents,key:record.key});
    assertOfflineIdentity(identity);
    if(result.success!==true || !result.payoutId) throw new Error("Payout acknowledgement missing; retry the same command");
    localStorage.setItem(storageKey,JSON.stringify({...record,state:"acknowledged",payoutId:result.payoutId}));
    return result;
  });
}

export async function confirmNewPayout(userId:string) {
  const identity=offlineIdentity();
  if(identity.owner!==userId || !navigator.locks) throw new Error("Safe payout confirmation is unavailable");
  const key=`payout-command:v1:account:${encodeURIComponent(userId)}`;
  await navigator.locks.request(key,async()=>{
    assertOfflineIdentity(identity);
    const record=JSON.parse(localStorage.getItem(key)||"null");
    if(!record || record.userId!==userId || record.state!=="acknowledged" || !record.payoutId)
      throw new Error("No acknowledged withdrawal to confirm. Retry any unconfirmed prior amount first.");
    localStorage.removeItem(key);
  });
}