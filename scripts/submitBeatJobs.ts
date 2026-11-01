/**
 * Step 1 — Submit all beat generation jobs to MaxCore and save job IDs.
 * Run: npx tsx scripts/submitBeatJobs.ts
 * Then: npx tsx scripts/pollBeatJobs.ts
 */

import fs from "node:fs/promises";
import path from "node:path";

const MAXCORE_BASE = (
  process.env.AI_SERVER_URL || "https://secure-ai-forge.replit.app"
).replace(/\/api\/?$/, "");
const MAXCORE_KEY = process.env.AI_SERVER_KEY || "";

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

const JOBS_FILE = path.join(process.cwd(), "scripts", "_beatJobs.json");

async function submitJob(target: typeof TARGETS[0]) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(MAXCORE_KEY ? { Authorization: `Bearer ${MAXCORE_KEY}` } : {}),
  };
  const res = await fetch(`${MAXCORE_BASE}/api/generate/audio`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      genre: target.genre,
      mood: target.mood,
      bpm: target.bpm,
      key: target.key,
      duration: 30,
      style: target.mood,
      production_style: "modern",
      quality: "release",
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    job_id?: string;
    audio_url?: string;
    audio_data?: string;
    wav_data?: string;
    url?: string;
  };
  return { target, jobId: data.job_id ?? null, directData: data.job_id ? null : data };
}

async function main() {
  console.log(`🎵 Submitting ${TARGETS.length} beat jobs to MaxCore in parallel...`);

  const results = await Promise.allSettled(TARGETS.map(submitJob));

  const jobs: Array<{
    genre: string; mood: string; key: string; bpm: number; price: number;
    jobId: string | null;
    directData: Record<string, unknown> | null;
    error?: string;
  }> = [];

  results.forEach((r, i) => {
    const t = TARGETS[i];
    if (r.status === "fulfilled") {
      const { jobId, directData } = r.value;
      console.log(`  ✓ ${t.genre} × ${t.mood} → ${jobId ? `job:${jobId}` : "direct data"}`);
      jobs.push({ ...t, jobId, directData: directData as Record<string, unknown> | null });
    } else {
      console.error(`  ✗ ${t.genre} × ${t.mood}: ${r.reason?.message}`);
      jobs.push({ ...t, jobId: null, directData: null, error: r.reason?.message });
    }
  });

  await fs.writeFile(JOBS_FILE, JSON.stringify(jobs, null, 2));
  console.log(`\n📄 Saved ${jobs.length} job records to ${JOBS_FILE}`);
  console.log("   Run: npx tsx scripts/pollBeatJobs.ts");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
