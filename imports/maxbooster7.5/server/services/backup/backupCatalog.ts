import { db } from "../../db.js";
import { sql } from "drizzle-orm";

export interface BackupRecord {
  key: string;
  name: string;
  date: string;
  size: number;
  checksum: string;
  state: string;
}
function rows(result: any): any[] {
  const value = result.rows ?? result;
  if (!Array.isArray(value)) throw new Error("Unexpected backup catalog result");
  return value;
}
export const backupCatalog = {
  async list(): Promise<BackupRecord[]> {
    return rows(await db.execute(sql`SELECT key, name, created_at AS date, size,
      checksum, state FROM runtime_backup_catalog ORDER BY created_at DESC`));
  },
  async pending(record: BackupRecord) {
    await db.execute(sql`INSERT INTO runtime_backup_catalog
      (key, name, size, checksum, state) VALUES
      (${record.key}, ${record.name}, ${record.size}, ${record.checksum}, 'pending')`);
  },
  async state(key: string, state: string) {
    await db.execute(sql`UPDATE runtime_backup_catalog SET state=${state}
      WHERE key=${key}`);
  },
  async verify(key: string, lease?: { day: string; owner: string }) {
    const result = lease
      ? await db.execute(sql`UPDATE runtime_backup_catalog SET state='verified'
          WHERE key=${key} AND state='pending' AND EXISTS
          (SELECT 1 FROM runtime_backup_runs WHERE day=${lease.day} AND owner=${lease.owner}
           AND state='running' AND lease_until>now()) RETURNING key`)
      : await db.execute(sql`UPDATE runtime_backup_catalog SET state='verified'
          WHERE key=${key} AND state='pending' RETURNING key`);
    if (!rows(result).length) throw new Error("Backup verification commit refused: pending record or lease missing");
  },
  async remove(key: string) {
    await db.execute(sql`DELETE FROM runtime_backup_catalog WHERE key=${key} AND state='deleting'`);
  },
  async claimDay(day: string, owner: string, identity: string): Promise<boolean> {
    return rows(await db.execute(sql`INSERT INTO runtime_backup_runs (day, owner, target_identity, state)
      VALUES (${day}, ${owner}, ${identity}, 'running') ON CONFLICT (day) DO UPDATE
      SET owner=EXCLUDED.owner,state='running',started_at=now(),finished_at=NULL,
          target_identity=EXCLUDED.target_identity,
          lease_until=now()+interval '5 minutes'
      WHERE runtime_backup_runs.state='failed'
         OR (runtime_backup_runs.state='running' AND runtime_backup_runs.lease_until<now())
      RETURNING day`)).length === 1;
  },
  async renewDay(day: string, owner: string): Promise<void> {
    const renewed = rows(await db.execute(sql`UPDATE runtime_backup_runs
      SET lease_until=now()+interval '5 minutes' WHERE day=${day} AND owner=${owner}
      AND state='running' AND lease_until>now() RETURNING day`));
    if (!renewed.length) throw new Error("Backup scheduler lease lost");
  },
  async runs(): Promise<any[]> {
    return rows(await db.execute(sql`SELECT day,state,target_identity,started_at,finished_at,lease_until
      FROM runtime_backup_runs ORDER BY day DESC LIMIT 30`));
  },
  async finishDay(day: string, owner: string, state: string) {
    const updated = rows(await db.execute(sql`UPDATE runtime_backup_runs SET state=${state}, finished_at=now()
      WHERE day=${day} AND owner=${owner} AND lease_until>now() RETURNING day`));
    if (!updated.length) throw new Error("Backup run completion lease lost");
  },
};