import { randomUUID } from "node:crypto";

export type SocialMediaJobFamily = "video" | "music-video";
export interface SocialMediaJob {
  status: "processing" | "done" | "error";
  result?: Record<string, unknown>;
  error?: string;
}
export interface MediaJobDatabase {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}
export interface MediaJobLease {
  family: SocialMediaJobFamily;
  id: string;
  ownerId: string;
  token: string;
}
export type TerminalMediaJob = Omit<SocialMediaJob, "status"> & { status: "done" | "error" };

export function mediaJobAssetUrl(result: Record<string, unknown> | undefined): string | undefined {
  const value = result?.url || result?.video_url;
  if (typeof value !== "string" || value.trim() !== value || !value) return undefined;
  try {
    // Root-relative application URLs and explicit HTTP(S) asset URLs are the
    // renderer contract. A protocol-relative host or a local file is not one.
    if (value.startsWith("//") || (!value.startsWith("/") && !/^https?:\/\//i.test(value))) return undefined;
    const parsed = new URL(value, "https://maxbooster.invalid");
    return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password ? value : undefined;
  } catch { return undefined; }
}

/** PostgreSQL is the status authority. Workers never adopt another renderer's
 * lease: a lost worker becomes an explicit interruption, not a duplicate render.
 * This persists job metadata; renderer assets still require shared blob storage.
 */
export class SocialMediaJobRepository {
  constructor(private readonly database: MediaJobDatabase) {}

  async create(family: SocialMediaJobFamily, id: string, ownerId: string): Promise<MediaJobLease> {
    const lease = { family, id, ownerId, token: randomUUID() };
    await this.database.query(`WITH expired AS (
      SELECT id FROM social_media_jobs WHERE updated_at<clock_timestamp()-interval '7 days'
      AND (status<>'processing' OR lease_expires_at<=clock_timestamp())
      ORDER BY updated_at LIMIT 100 FOR UPDATE SKIP LOCKED
    ), pruned AS (DELETE FROM social_media_jobs WHERE id IN (SELECT id FROM expired))
    INSERT INTO social_media_jobs
      (id,family,owner_id,status,lease_token,lease_expires_at)
      VALUES($1,$2,$3,'processing',$4,clock_timestamp()+interval '60 seconds')`,
    [id, family, ownerId, lease.token]);
    return lease;
  }

  async heartbeat(lease: MediaJobLease): Promise<boolean> {
    const { rows } = await this.database.query(`UPDATE social_media_jobs
      SET lease_expires_at=clock_timestamp()+interval '60 seconds',updated_at=clock_timestamp()
      WHERE id=$1 AND family=$2 AND owner_id=$3 AND lease_token=$4
      AND status='processing' AND lease_expires_at>clock_timestamp() RETURNING id`,
    [lease.id, lease.family, lease.ownerId, lease.token]);
    return rows.length === 1;
  }

  async finish(lease: MediaJobLease, job: TerminalMediaJob): Promise<boolean> {
    if (job.status !== "done" && job.status !== "error") throw new Error("A terminal media status is required");
    if (job.status === "done" && !mediaJobAssetUrl(job.result)) {
      throw new Error("A completed media job requires a durable asset URL");
    }
    const serialized = job.result ? JSON.stringify(job.result) : null;
    if (serialized && Buffer.byteLength(serialized) > 1_048_576) throw new Error("Media job result is too large");
    const { rows } = await this.database.query(`UPDATE social_media_jobs
      SET status=$5,result=$6::jsonb,error=$7,updated_at=clock_timestamp(),lease_expires_at=NULL
      WHERE id=$1 AND family=$2 AND owner_id=$3 AND lease_token=$4
      AND status='processing' AND lease_expires_at>clock_timestamp() RETURNING id`,
    [lease.id, lease.family, lease.ownerId, lease.token, job.status, serialized,
      job.status === "error" ? (job.error || "Video generation failed") : null]);
    return rows.length === 1;
  }

  async get(family: SocialMediaJobFamily, id: string, ownerId: string): Promise<SocialMediaJob | undefined> {
    // Ownership is present in both statements, including recovery. Polling a
    // guessed foreign ID cannot disclose or change another customer's status.
    await this.database.query(`UPDATE social_media_jobs SET status='error',
      error='The render worker stopped before completion. Please generate again.',
      updated_at=clock_timestamp(),lease_expires_at=NULL
      WHERE id=$1 AND family=$2 AND owner_id=$3 AND status='processing'
      AND lease_expires_at<=clock_timestamp()`, [id, family, ownerId]);
    const { rows } = await this.database.query(`SELECT status,result,error FROM social_media_jobs
      WHERE id=$1 AND family=$2 AND owner_id=$3`, [id, family, ownerId]);
    const row = rows[0];
    if (!row) return undefined;
    return { status: row.status as SocialMediaJob["status"],
      ...(row.result ? { result: row.result as Record<string, unknown> } : {}),
      ...(row.error ? { error: String(row.error) } : {}) };
  }
}

/** A failed heartbeat cannot grant ownership. The row will expire, and finish
 * remains fenced even if a stalled renderer later returns successfully. */
export function keepMediaJobAlive(repository: SocialMediaJobRepository, lease: MediaJobLease,
  onFailure: () => void, intervalMs = 10_000): () => void {
  let busy = false;
  let stopped = false;
  const timer = setInterval(() => {
    if (busy || stopped) return;
    busy = true;
    void repository.heartbeat(lease).then((owned) => {
      if (!owned && !stopped) { stopped = true; clearInterval(timer); onFailure(); }
    }).catch(() => {
      if (!stopped) { stopped = true; clearInterval(timer); onFailure(); }
    }).finally(() => { busy = false; });
  }, intervalMs);
  timer.unref();
  return () => { stopped = true; clearInterval(timer); };
}
