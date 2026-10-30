import { pool } from "../db.js";
import type { DataTransferJob } from "./distributionDataTransferService.js";

export async function saveCatalogTransfer(job: DataTransferJob): Promise<void> {
  await pool.query(
    `INSERT INTO integration_catalog_transfers(id,user_id,progress) VALUES($1,$2,$3::jsonb)
     ON CONFLICT(id) DO UPDATE SET progress=excluded.progress,updated_at=now()
     WHERE integration_catalog_transfers.user_id=excluded.user_id`, [job.id, job.userId, JSON.stringify(job)],
  );
}
function decode(job: any): DataTransferJob {
  return { ...job, createdAt: new Date(job.createdAt), updatedAt: new Date(job.updatedAt),
    ...(job.completedAt ? { completedAt: new Date(job.completedAt) } : {}) };
}
export async function readCatalogTransfer(id: string): Promise<DataTransferJob | null> {
  const result = await pool.query(`SELECT progress FROM integration_catalog_transfers WHERE id=$1`, [id]);
  return result.rows[0] ? decode(result.rows[0].progress) : null;
}
export async function listCatalogTransfers(userId: string): Promise<DataTransferJob[]> {
  const result = await pool.query(`SELECT progress FROM integration_catalog_transfers WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 500`, [userId]);
  return result.rows.map(row => decode(row.progress));
}