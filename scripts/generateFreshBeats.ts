/**
 * generateFreshBeats.ts — background beat generator
 * Generates fresh beats for top-scored genre × mood combos via MaxCore.
 * No HTTP server, no PDIM, no session required.
 *
 * Run detached: nohup npx tsx scripts/generateFreshBeats.ts >> /tmp/beat_gen.log 2>&1 &
 */

import { neon } from "@neondatabase/serverless";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const NEON_URL = process.env.NEON_DATABASE_URL!;
if (!NEON_URL) { console.error("NEON_DATABASE_URL not set"); process.exit(1); }
const sql = neon(NEON_URL);

const MAXCORE_BASE = (
  process.env.AI_SERVER_URL || "https://secure-ai-forge.replit.app"
).replace(/\/api\/?$/, "");
const MAXCORE_KEY = process.env.AI_SERVER_KEY || "";
const ADMIN_ID   = "31b06dba-b992-4da5-90ef-3dac95692716";
const AUDIO_DIR  = path.join(process.cwd(), "public", "generated-content", "audio");

/** Top genre × mood combinations by combined engagement+sales score */
const TARGETS = [
  { genre: "afrobeats",  mood: "energetic",   key: "A Minor",  bpm: 105, price: 59.99 },
  { genre: "afrobeats",  mood: "euphoric",    key: "E Minor",  bpm: 110, price: 59.99 },
  { genre: "trap",       mood: "dark",        key: "F# Minor", bpm: 140, price: 49.99 },
  { genre: "drill",      mood: "aggressive",  key: "C# Minor", bpm: 138, price: 44.99 },
  { genre: "hiphop",     mood: "empowering",  key: "G Minor",  bpm: 92,  price: 47.99 },
  { genre: "r&b",        mood: "melancholic", key: "Eb Minor", bpm: 78,  price: 54.99 },
  { genre: "pop",        mood: "energetic",   key: "C Major",  bpm: 120, price: 52.99 },
  { genre: "electronic", mood: "euphoric",    key: "D Minor",  bpm: 128, price: 49.99 },
  { genre: "dancehall",  mood: "energetic",   key: "A Major",  bpm: 100, price: 44.99 },
  { genre: "lofi",       mood: "chill",       key: "F Major",  bpm: 80,  price: 29.99 },
];

const log = (msg: string) => {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
};

const authHeaders: Record<string, string> = MAXCORE_KEY
  ? { Authorization: `Bearer ${MAXCORE_KEY}` }
  : {};

async function callMaxCore(t: typeof TARGETS[0]): Promise<Buffer> {
  log(`  POST /api/generate/audio [${t.genre} × ${t.mood}]`);
  const res = await fetch(`${MAXCORE_BASE}/api/generate/audio`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({
      genre: t.genre, mood: t.mood, bpm: t.bpm, key: t.key,
      duration: 30, style: t.mood, production_style: "modern", quality: "release",
    }),
    signal: AbortSignal.timeout(900_000), // 15 min — matches beat loop service
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = (await res.json()) as Record<string, unknown>;

  // Async job path
  if (data.job_id) {
    log(`  Polling job ${data.job_id}...`);
    const deadline = Date.now() + 900_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10_000));
      const jr = await fetch(`${MAXCORE_BASE}/api/audio-job/${data.job_id}`, {
        headers: authHeaders,
        signal: AbortSignal.timeout(30_000),
      }).catch(() => null);
      if (!jr?.ok) { process.stdout.write("."); continue; }
      const jd = (await jr.json()) as Record<string, unknown>;
      const done = jd.status === "completed" || jd.status === "done" ||
                   jd.audio_url || jd.wav_data || jd.wav_b64 || jd.audio_b64;
      if (done) return extractBytes(jd);
      process.stdout.write(".");
    }
    throw new Error("Job timed out after 15 min");
  }

  return extractBytes(data);
}

function extractBytes(d: Record<string, unknown>): Buffer {
  const b64 = (d.wav_b64 || d.audio_b64 || d.wav_data || d.audio_data) as string | undefined;
  if (b64) return Buffer.from(b64, "base64");
  const url = (d.audio_url || d.url) as string | undefined;
  if (!url) throw new Error(`No audio in response: ${JSON.stringify(d).slice(0, 200)}`);
  // Sync fetch not available — caller must handle URL case in a second step.
  // (In practice MaxCore returns base64 for completed jobs.)
  throw new Error(`Got URL but no base64 bytes — re-fetch needed: ${url}`);
}

async function saveBeat(t: typeof TARGETS[0], wav: Buffer): Promise<string> {
  await fs.mkdir(AUDIO_DIR, { recursive: true });
  const filename = `beat_${Date.now()}_${crypto.randomBytes(6).toString("hex")}.wav`;
  await fs.writeFile(path.join(AUDIO_DIR, filename), wav);
  const audioUrl = `/generated-content/audio/${filename}`;
  const adj  = t.mood.charAt(0).toUpperCase()  + t.mood.slice(1);
  const gen  = t.genre.charAt(0).toUpperCase() + t.genre.slice(1);
  const stamp = new Date().toISOString().slice(5, 10).replace("-", "/");
  const title = `${adj} ${gen} Type Beat (${t.key}) ${t.bpm} BPM — ${stamp}`;
  const tags  = [t.genre, t.mood, "type beat", t.key.toLowerCase()];

  const rows = await sql`
    INSERT INTO beats (user_id, title, genre, bpm, key, audio_url, price, is_published, tags, created_at)
    VALUES (${ADMIN_ID}, ${title}, ${t.genre}, ${t.bpm}, ${t.key}, ${audioUrl}, ${t.price}, true, ${JSON.stringify(tags)}, NOW())
    RETURNING id
  `;
  return rows[0].id as string;
}

async function main() {
  log(`🎵 Beat generator starting — ${TARGETS.length} targets`);
  log(`   MaxCore: ${MAXCORE_BASE}`);
  log(`   Auth: ${MAXCORE_KEY ? "Bearer token set" : "no auth key"}`);

  let ok = 0, fail = 0;

  for (const t of TARGETS) {
    log(`\n▶ [${t.genre} × ${t.mood}] key=${t.key} bpm=${t.bpm} price=$${t.price}`);
    try {
      const wav = await callMaxCore(t);
      if (wav.length < 1000) throw new Error(`Audio too small: ${wav.length} bytes`);
      log(`  ✓ Audio received — ${(wav.length / 1024).toFixed(0)} KB`);
      const beatId = await saveBeat(t, wav);
      log(`  ✓ Saved → beat ${beatId}`);
      ok++;
    } catch (err) {
      const msg = (err as Error).message;
      log(`  ✗ FAILED: ${msg.slice(0, 200)}`);
      fail++;
    }
  }

  log(`\n═══ DONE ═══ ✓ ${ok}  ✗ ${fail}  total ${TARGETS.length}`);
}

main().catch((e) => { log(`FATAL: ${e.message}`); process.exit(1); });
