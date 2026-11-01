/**
 * Step 2 — Poll all pending MaxCore audio jobs, download audio, save to DB.
 * Run after submitBeatJobs.ts:  npx tsx scripts/pollBeatJobs.ts
 */

import { neon } from "@neondatabase/serverless";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const NEON_URL = process.env.NEON_DATABASE_URL!;
if (!NEON_URL) throw new Error("NEON_DATABASE_URL not set");
const sql = neon(NEON_URL);

const MAXCORE_BASE = (
  process.env.AI_SERVER_URL || "https://secure-ai-forge.replit.app"
).replace(/\/api\/?$/, "");
const MAXCORE_KEY = process.env.AI_SERVER_KEY || "";
const ADMIN_ID = "31b06dba-b992-4da5-90ef-3dac95692716";

const JOBS_FILE = path.join(process.cwd(), "scripts", "_beatJobs.json");
const AUDIO_DIR = path.join(process.cwd(), "public", "generated-content", "audio");

type Job = {
  genre: string; mood: string; key: string; bpm: number; price: number;
  jobId: string | null;
  directData: Record<string, unknown> | null;
  error?: string;
  done?: boolean;
  beatId?: string;
};

const headers: Record<string, string> = {
  "Content-Type": "application/json",
  ...(MAXCORE_KEY ? { Authorization: `Bearer ${MAXCORE_KEY}` } : {}),
};

async function extractAudioBytes(data: Record<string, unknown>): Promise<Buffer | null> {
  if (data.wav_data || data.audio_data) {
    return Buffer.from((data.wav_data || data.audio_data) as string, "base64");
  }
  const url = (data.audio_url || data.url) as string | undefined;
  if (url) {
    const abs = url.startsWith("http") ? url : `${MAXCORE_BASE}${url}`;
    const r = await fetch(abs, { headers, signal: AbortSignal.timeout(60_000) });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  }
  return null;
}

async function saveBeat(job: Job, wav: Buffer): Promise<string> {
  await fs.mkdir(AUDIO_DIR, { recursive: true });
  const filename = `beat_${Date.now()}_${crypto.randomBytes(6).toString("hex")}.wav`;
  await fs.writeFile(path.join(AUDIO_DIR, filename), wav);
  const audioUrl = `/generated-content/audio/${filename}`;

  const adj = job.mood.charAt(0).toUpperCase() + job.mood.slice(1);
  const gen = job.genre.charAt(0).toUpperCase() + job.genre.slice(1);
  const stamp = new Date().toISOString().slice(5, 10).replace("-", "/");
  const title = `${adj} ${gen} Type Beat (${job.key}) ${job.bpm} BPM — ${stamp}`;
  const tags = [job.genre, job.mood, "type beat", job.key.toLowerCase()];

  const rows = await sql`
    INSERT INTO beats (user_id, title, genre, bpm, key, audio_url, price, is_published, tags, created_at)
    VALUES (${ADMIN_ID}, ${title}, ${job.genre}, ${job.bpm}, ${job.key}, ${audioUrl}, ${job.price}, true, ${JSON.stringify(tags)}, NOW())
    RETURNING id
  `;
  return rows[0].id as string;
}

async function pollJob(job: Job): Promise<{ wav: Buffer; status: string } | null> {
  if (!job.jobId) {
    // Direct data response (no polling needed)
    if (job.directData) {
      const wav = await extractAudioBytes(job.directData);
      return wav ? { wav, status: "direct" } : null;
    }
    return null;
  }

  const res = await fetch(`${MAXCORE_BASE}/api/audio-job/${job.jobId}`, {
    headers,
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!res || !res.ok) return null;

  const data = (await res.json()) as Record<string, unknown>;
  const status = data.status as string | undefined;
  const isDone = status === "completed" || status === "done" || data.audio_url || data.wav_data;
  if (!isDone) return null;

  const wav = await extractAudioBytes(data);
  return wav ? { wav, status: status ?? "completed" } : null;
}

async function main() {
  const raw = await fs.readFile(JOBS_FILE, "utf8").catch(() => null);
  if (!raw) { console.error(`No jobs file at ${JOBS_FILE}. Run submitBeatJobs.ts first.`); process.exit(1); }

  const jobs: Job[] = JSON.parse(raw);
  const pending = jobs.filter((j) => !j.done && !j.error);
  console.log(`📊 ${pending.length} pending jobs, ${jobs.filter((j) => j.done).length} already done`);

  const POLL_INTERVAL_MS = 8_000;
  const DEADLINE = Date.now() + 10 * 60_000; // 10 min total

  while (Date.now() < DEADLINE) {
    const still = jobs.filter((j) => !j.done && !j.error && j.jobId !== undefined);
    if (still.length === 0) break;

    process.stdout.write(`\r⏳ Polling ${still.length} jobs...`);

    const checks = await Promise.allSettled(still.map((j) => pollJob(j)));

    let anyProgress = false;
    for (let i = 0; i < still.length; i++) {
      const job = still[i];
      const check = checks[i];
      if (check.status === "fulfilled" && check.value) {
        const { wav } = check.value;
        try {
          console.log(`\n  ✓ ${job.genre} × ${job.mood} — ${(wav.length / 1024).toFixed(0)} KB`);
          const beatId = await saveBeat(job, wav);
          job.done = true;
          job.beatId = beatId;
          console.log(`    Saved → beat ${beatId}`);
          anyProgress = true;
        } catch (e) {
          job.error = (e as Error).message;
          console.error(`\n  ✗ ${job.genre} × ${job.mood}: save failed — ${job.error}`);
        }
      }
    }

    // Write progress after each poll round
    await fs.writeFile(JOBS_FILE, JSON.stringify(jobs, null, 2));

    if (!anyProgress) await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  const done = jobs.filter((j) => j.done);
  const failed = jobs.filter((j) => j.error && !j.done);
  const timeout = jobs.filter((j) => !j.done && !j.error);

  console.log("\n\n═══════════════════════════════════");
  console.log("  FINAL RESULTS");
  console.log("═══════════════════════════════════");
  console.log(`✓ Saved:   ${done.length}`);
  done.forEach((j) => console.log(`  ✓ ${j.genre} × ${j.mood} (${j.key}) → ${j.beatId}`));
  if (failed.length) {
    console.log(`✗ Failed:  ${failed.length}`);
    failed.forEach((j) => console.log(`  ✗ ${j.genre} × ${j.mood}: ${j.error?.slice(0, 80)}`));
  }
  if (timeout.length) {
    console.log(`⏱  Timeout: ${timeout.length} (still in MaxCore queue — re-run to pick up)`);
    timeout.forEach((j) => console.log(`  ⏱  ${j.genre} × ${j.mood} job:${j.jobId}`));
  }
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
