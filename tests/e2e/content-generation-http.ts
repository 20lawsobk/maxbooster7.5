/**
 * Content-Generation Functional Test Harness (HTTP, read-only against running app)
 * --------------------------------------------------------------------------------
 * Verifies that every content-type generation service is wired up correctly and
 * returns REAL output (not an empty 200, not a silent crash). Drives the real
 * user path: register a fresh session-cookie user, then exercise each generation
 * endpoint serially (light -> heavy) with rate-limit jitter, asserting actual
 * generated content. Heavy/async endpoints (music video render) are polled with a
 * bounded cap; model training (diffusion/train) is intentionally NOT triggered.
 *
 * Run:  npx tsx tests/e2e/content-generation-http.ts
 * Env:  TEST_BASE_URL (default http://localhost:5000)
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const BASE = process.env.TEST_BASE_URL || "http://localhost:5000";
const VIDEO_POLL_CAP_MS = Number(process.env.VIDEO_POLL_CAP_MS || 240_000);

// ── Cookie jar ──────────────────────────────────────────────────────────────
const jar = new Map<string, string>();
let cookieHeader = "";
let csrfToken = ""; // echoed in x-csrf-token header for state-changing requests
function captureCookies(res: Response) {
  const sc =
    typeof (res.headers as any).getSetCookie === "function"
      ? (res.headers as any).getSetCookie()
      : res.headers.get("set-cookie")
        ? [res.headers.get("set-cookie") as string]
        : [];
  for (const c of sc) {
    const pair = c.split(";")[0];
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
  if (jar.size)
    cookieHeader = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

// ── HTTP helper ─────────────────────────────────────────────────────────────
type ApiOpts = {
  body?: unknown;
  query?: Record<string, string>;
  form?: FormData;
  timeoutMs?: number;
};
type ApiRes = { ok: boolean; status: number; json: any; text: string };
async function api(method: string, p: string, opts: ApiOpts = {}): Promise<ApiRes> {
  const url =
    BASE + p + (opts.query ? "?" + new URLSearchParams(opts.query).toString() : "");
  const doFetch = async (): Promise<ApiRes> => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 45_000);
    const headers: Record<string, string> = {};
    if (cookieHeader) headers["Cookie"] = cookieHeader;
    if (!["GET", "HEAD", "OPTIONS", "TRACE"].includes(method) && csrfToken)
      headers["x-csrf-token"] = csrfToken;
    let payload: any;
    if (opts.form) {
      payload = opts.form; // fetch sets multipart boundary
    } else if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(opts.body);
    }
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: payload,
        signal: ctrl.signal,
      });
      captureCookies(res);
      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* non-json */
      }
      return { ok: res.ok, status: res.status, json, text };
    } finally {
      clearTimeout(t);
    }
  };
  let r = await doFetch();
  if (r.status === 429) {
    // Rate-limited: back off once and retry.
    await sleep(6000);
    r = await doFetch();
  }
  return r;
}

// ── Utilities ───────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = () => 700 + Math.floor(Math.random() * 900);

/** Recursively detect a real text string of >= min chars anywhere in the value. */
function deepText(o: unknown, min = 8, depth = 0): boolean {
  if (depth > 7 || o == null) return false;
  if (typeof o === "string") return o.trim().length >= min;
  if (Array.isArray(o)) return o.some((v) => deepText(v, min, depth + 1));
  if (typeof o === "object")
    return Object.values(o as Record<string, unknown>).some((v) =>
      deepText(v, min, depth + 1),
    );
  return false;
}
function nonEmpty(o: unknown): boolean {
  if (o == null) return false;
  if (Array.isArray(o)) return o.length > 0;
  if (typeof o === "object") return Object.keys(o as object).length > 0;
  if (typeof o === "string") return o.length > 0;
  return Boolean(o);
}
function detectSource(j: any): string | undefined {
  if (!j) return undefined;
  const cands = [
    j.source,
    j.data?.source,
    j.data?.metadata?.source,
    j.data?.meta?.source,
    j.result?.source,
    j.meta?.source,
    j.provider,
    j.data?.provider,
    j.engine,
    j.data?.engine,
  ];
  for (const c of cands) if (typeof c === "string" && c) return c;
  return undefined;
}
function snippet(j: any, text: string, n = 140): string {
  const s = j ? JSON.stringify(j) : text;
  return (s || "").slice(0, n).replace(/\s+/g, " ");
}

// ── Synthetic media (valid WAV + PNG so multipart uploads are real) ───────────
function makeWav(seconds = 6, sampleRate = 22050): Buffer {
  const n = Math.floor(seconds * sampleRate);
  const dataSize = n * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    // Tonal body + 2Hz amplitude envelope + a kick transient every 0.5s so
    // section/beat detection has real energy variation to work with.
    const env = 0.4 + 0.4 * Math.sin(2 * Math.PI * 2 * t);
    const beatPhase = t % 0.5;
    const kick = beatPhase < 0.05 ? Math.sin(2 * Math.PI * 60 * t) * 0.5 : 0;
    const tone = Math.sin(2 * Math.PI * 220 * t) * 0.3 * env;
    let s = tone + kick;
    s = Math.max(-1, Math.min(1, s));
    buf.writeInt16LE(Math.floor(s * 32767), 44 + i * 2);
  }
  return buf;
}
function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function makePng(w = 96, h = 96, rgb: [number, number, number] = [70, 90, 200]): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  const row = Buffer.alloc(1 + w * 3);
  for (let x = 0; x < w; x++) {
    row[1 + x * 3] = rgb[0];
    row[2 + x * 3] = rgb[1];
    row[3 + x * 3] = rgb[2];
  }
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  const idat = zlib.deflateSync(raw);
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── Result recording ──────────────────────────────────────────────────────────
type Status = "PASS" | "FAIL" | "WIRED" | "SKIP";
type Row = {
  group: string;
  name: string;
  status: Status;
  detail: string;
  source?: string;
  ms: number;
};
const results: Row[] = [];
type FnRes = { status: Status; detail: string; source?: string };

async function test(group: string, name: string, fn: () => Promise<FnRes>) {
  const t0 = Date.now();
  let row: Row;
  try {
    const r = await fn();
    row = { group, name, status: r.status, detail: r.detail, source: r.source, ms: Date.now() - t0 };
  } catch (e: any) {
    row = { group, name, status: "FAIL", detail: `threw: ${e?.message || e}`, ms: Date.now() - t0 };
  }
  results.push(row);
  const tag = { PASS: "PASS", FAIL: "FAIL", WIRED: "WIRED", SKIP: "SKIP" }[row.status];
  console.log(
    `  [${tag}] ${name} — ${row.detail}${row.source ? ` {source:${row.source}}` : ""} (${row.ms}ms)`,
  );
  await sleep(jitter());
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== Content-Generation Functional Tests @ ${BASE} ===\n`);

  // Preflight
  const health = await api("GET", "/api/health");
  if (!health.ok) {
    console.error(`App not healthy (GET /api/health -> ${health.status}). Aborting.`);
    process.exit(2);
  }
  console.log("App health: ok");

  // Register a fresh session-cookie user
  const email = `cgtest_${Date.now()}@maxbooster-test.com`;
  const reg = await api("POST", "/api/auth/register", {
    body: {
      email,
      password: "TestPass123!",
      firstName: "CG",
      lastName: "Tester",
    },
  });
  if (!reg.ok || !cookieHeader) {
    console.error(
      `Register failed (${reg.status}): ${snippet(reg.json, reg.text)} — cannot auth, aborting.`,
    );
    process.exit(2);
  }
  console.log(`Registered test user ${email} (session cookie acquired)`);

  // Acquire CSRF token (required for all state-changing requests).
  const csrf = await api("GET", "/api/csrf-token");
  csrfToken = csrf.json?.csrfToken || "";
  if (!csrfToken) {
    console.error(
      `Failed to obtain CSRF token (${csrf.status}): ${snippet(csrf.json, csrf.text)} — aborting.`,
    );
    process.exit(2);
  }
  console.log("CSRF token acquired\n");
  await sleep(jitter());

  const wav = makeWav(6);
  const png = makePng();

  // ── GROUP: Text / Social content ───────────────────────────────────────────
  console.log("── Text / Social content ─────────────────────────");

  await test("text", "POST /api/ai/content/generate", async () => {
    const r = await api("POST", "/api/ai/content/generate", {
      body: { topic: "my new single drops Friday", tone: "energetic", platform: "instagram", contentType: "release" },
    });
    if (!r.ok) return { status: "FAIL", detail: `${r.status} ${snippet(r.json, r.text)}` };
    const ok = r.json?.success && deepText(r.json?.data, 12);
    return { status: ok ? "PASS" : "FAIL", detail: ok ? `generated caption (conf=${r.json?.confidence ?? "?"})` : `no real text: ${snippet(r.json, r.text)}`, source: detectSource(r.json) };
  });

  await test("text", "GET ab-variants (/api/social/ai-content/ab-variants)", async () => {
    // NOTE: this route reads req.query, not body.
    const r = await api("GET", "/api/social/ai-content/ab-variants", {
      query: { content: "Check out my brand new track, out now!", variationType: "tone" },
    });
    if (!r.ok) return { status: "FAIL", detail: `${r.status} ${snippet(r.json, r.text)}` };
    const variants = r.json?.variants ?? r.json?.data?.variants;
    const ok = nonEmpty(variants) && deepText(variants, 6);
    return { status: ok ? "PASS" : "FAIL", detail: ok ? `${(variants as any[]).length} variants` : `no variants: ${snippet(r.json, r.text)}`, source: detectSource(r.json) };
  });

  await test("text", "POST /api/social/ai-content/multilingual", async () => {
    const r = await api("POST", "/api/social/ai-content/multilingual", {
      body: { content: "Check out my brand new single, out everywhere now!", targetLanguages: ["es", "fr"] },
    });
    if (!r.ok) return { status: "FAIL", detail: `${r.status} ${snippet(r.json, r.text)}` };
    const tr = r.json?.translations ?? r.json?.data?.translations;
    const ok = nonEmpty(tr) && deepText(tr, 6);
    return { status: ok ? "PASS" : "FAIL", detail: ok ? `${(tr as any[]).length} translations` : `no translations: ${snippet(r.json, r.text)}`, source: detectSource(r.json) };
  });

  await test("text", "POST /api/social/ai-content/optimize-hashtags", async () => {
    const r = await api("POST", "/api/social/ai-content/optimize-hashtags", {
      body: { content: "new trap single release night vibes", platform: "instagram", goal: "engagement" },
    });
    if (!r.ok) return { status: "FAIL", detail: `${r.status} ${snippet(r.json, r.text)}` };
    const h = r.json?.hashtags ?? r.json?.data?.hashtags;
    const ok = nonEmpty(h);
    return { status: ok ? "PASS" : "FAIL", detail: ok ? `${Array.isArray(h) ? h.length : "?"} hashtags` : `no hashtags: ${snippet(r.json, r.text)}`, source: detectSource(r.json) };
  });

  await test("text", "POST /api/social/chatbot/respond", async () => {
    const r = await api("POST", "/api/social/chatbot/respond", {
      body: { platform: "instagram", senderId: "fan_1", senderName: "Fan", content: "How can I license this beat?", threadId: "thread_1" },
    });
    if (!r.ok) return { status: "FAIL", detail: `${r.status} ${snippet(r.json, r.text)}` };
    const resp = r.json?.response ?? r.json?.data?.response ?? r.json?.reply;
    const ok = deepText(resp, 10) || deepText(r.json, 10);
    return { status: ok ? "PASS" : "FAIL", detail: ok ? `chatbot replied` : `no reply: ${snippet(r.json, r.text)}`, source: detectSource(r.json) };
  });

  await test("text", "POST /api/social/strategy/plan", async () => {
    const r = await api("POST", "/api/social/strategy/plan", {
      body: { startDate: "2026-07-01", platforms: ["tiktok", "instagram"], postsPerWeek: 3 },
    });
    if (!r.ok) return { status: "FAIL", detail: `${r.status} ${snippet(r.json, r.text)}` };
    const plan = r.json?.plan ?? r.json?.data?.plan ?? r.json?.data;
    const ok = nonEmpty(plan);
    return { status: ok ? "PASS" : "FAIL", detail: ok ? `content plan generated` : `empty plan: ${snippet(r.json, r.text)}`, source: detectSource(r.json) };
  });

  await test("text", "POST /api/social/strategy/recommend", async () => {
    const r = await api("POST", "/api/social/strategy/recommend", {
      body: { platforms: ["instagram"], count: 5, timeframe: "week" },
    });
    if (!r.ok) return { status: "FAIL", detail: `${r.status} ${snippet(r.json, r.text)}` };
    const recs = r.json?.recommendations ?? r.json?.data?.recommendations ?? r.json?.data;
    const ok = nonEmpty(recs);
    return { status: ok ? "PASS" : "FAIL", detail: ok ? `recommendations generated` : `empty: ${snippet(r.json, r.text)}`, source: detectSource(r.json) };
  });

  // ── GROUP: Advertising / Multimodal ────────────────────────────────────────
  console.log("── Advertising / Multimodal ──────────────────────");

  await test("ads", "POST /api/advertising/generate-content", async () => {
    const r = await api("POST", "/api/advertising/generate-content", {
      body: { contentType: "promotional", platform: "instagram", topic: "new single release", tone: "energetic" },
    });
    if (!r.ok) return { status: "FAIL", detail: `${r.status} ${snippet(r.json, r.text)}` };
    const ok = r.json?.success && deepText(r.json?.content, 12);
    return { status: ok ? "PASS" : "FAIL", detail: ok ? `ad copy generated` : `no copy: ${snippet(r.json, r.text)}`, source: detectSource(r.json) };
  });

  await test("ads", "POST /api/ai/ads/optimize", async () => {
    const r = await api("POST", "/api/ai/ads/optimize", {
      body: { campaign: { id: "test_camp", name: "Test Campaign", budget: 100, platform: "instagram", objective: "engagement" }, action: "score" },
    });
    if (!r.ok) return { status: "FAIL", detail: `${r.status} ${snippet(r.json, r.text)}` };
    const ok = r.json?.success && nonEmpty(r.json?.data);
    return { status: ok ? "PASS" : "FAIL", detail: ok ? `optimization data returned` : `empty: ${snippet(r.json, r.text)}`, source: detectSource(r.json) };
  });

  await test("multimodal", "POST /api/multimodal/generate", async () => {
    // Text modality across platforms INCLUDING youtube. YouTube's platform
    // rules omit `hashtags`, which previously crashed the text-slot builder
    // (unguarded rules.text.hashtags.allowed). No media pack is used on purpose:
    // a pack expands into heavy image/audio/video asset generation that is slow
    // and non-deterministic — not what a wiring/correctness check needs.
    const r = await api("POST", "/api/multimodal/generate", {
      body: {
        input: { modality: "text", payload: "My new album launches this Friday — pre-save now!" },
        platforms: ["tiktok", "instagram", "youtube"],
      },
      timeoutMs: 45_000,
    });
    if (!r.ok) return { status: "FAIL", detail: `${r.status} ${snippet(r.json, r.text)}` };
    const ok = deepText(r.json, 12);
    return { status: ok ? "PASS" : "FAIL", detail: ok ? `multimodal package generated (text; platforms incl. youtube)` : `no content: ${snippet(r.json, r.text)}`, source: detectSource(r.json) };
  });

  // ── GROUP: Studio audio / patterns ─────────────────────────────────────────
  console.log("── Studio audio / patterns ───────────────────────");

  await test("audio", "POST /api/studio/generation/text (text->audio synth)", async () => {
    const r = await api("POST", "/api/studio/generation/text", {
      body: { text: "lofi chill beat", genre: "lofi", tempo: 90, duration: 6 },
      timeoutMs: 120_000,
    });
    if (!r.ok) return { status: "FAIL", detail: `${r.status} ${snippet(r.json, r.text)}` };
    const fp = r.json?.audioFilePath ?? r.json?.audioUrl ?? r.json?.data?.audioFilePath;
    let fileNote = "";
    if (typeof fp === "string") {
      const candidates = [fp, path.join(process.cwd(), fp.replace(/^\//, "")), path.join(process.cwd(), "uploads", fp.replace(/^\/?uploads\//, ""))];
      const found = candidates.find((c) => { try { return fs.existsSync(c) && fs.statSync(c).size > 256; } catch { return false; } });
      if (found) fileNote = ` file=${(fs.statSync(found).size / 1024).toFixed(1)}KB`;
    }
    const ok = r.json?.success && typeof fp === "string" && fp.length > 0;
    return { status: ok ? "PASS" : "FAIL", detail: ok ? `audio synthesized${fileNote}` : `no audio path: ${snippet(r.json, r.text)}`, source: detectSource(r.json) };
  });

  await test("audio", "POST /api/studio/generation/audio (style transfer, multipart)", async () => {
    const fd = new FormData();
    fd.append("audio", new Blob([wav], { type: "audio/wav" }), "input.wav");
    fd.append("targetType", "drums");
    const r = await api("POST", "/api/studio/generation/audio", { form: fd, timeoutMs: 120_000 });
    if (!r.ok) return { status: "FAIL", detail: `${r.status} ${snippet(r.json, r.text)}` };
    const fp = r.json?.audioFilePath ?? r.json?.audioUrl ?? r.json?.data?.audioFilePath;
    const ok = r.json?.success && typeof fp === "string" && fp.length > 0;
    return { status: ok ? "PASS" : "FAIL", detail: ok ? `style transfer produced audio` : `no output: ${snippet(r.json, r.text)}`, source: detectSource(r.json) };
  });

  const patternTests: Array<[string, object, string]> = [
    ["melody", { instrument: "synth_lead", genre: "pop", key: "C", scale: "major", tempo: 120 }, "pattern"],
    ["drums", { instrument: "trap_kit", genre: "trap", key: "C", scale: "minor", tempo: 140 }, "pattern"],
    ["chords", { instrument: "piano", genre: "jazz", key: "A", scale: "minor", tempo: 110 }, "progression"],
    ["arrangement", { instrument: "synth_lead", genre: "edm", key: "C", scale: "minor", tempo: 128 }, "arrangement"],
  ];
  for (const [kind, body, field] of patternTests) {
    await test("audio", `POST /api/studio/generation/pattern/${kind}`, async () => {
      const r = await api("POST", `/api/studio/generation/pattern/${kind}`, { body });
      if (!r.ok) return { status: "FAIL", detail: `${r.status} ${snippet(r.json, r.text)}` };
      const out = (r.json as any)?.[field];
      const ok = r.json?.success && nonEmpty(out);
      return { status: ok ? "PASS" : "FAIL", detail: ok ? `${kind} generated` : `empty ${field}: ${snippet(r.json, r.text)}` };
    });
  }

  await test("audio", "POST /api/songwriting/ai-assist", async () => {
    const r = await api("POST", "/api/songwriting/ai-assist", {
      body: { prompt: "summer love by the ocean", genre: "pop", mood: "happy" },
    });
    if (!r.ok) return { status: "FAIL", detail: `${r.status} ${snippet(r.json, r.text)}` };
    const ok = nonEmpty(r.json?.suggestions) || nonEmpty(r.json?.rhymes) || nonEmpty(r.json?.chordProgression) || deepText(r.json, 10);
    return { status: ok ? "PASS" : "FAIL", detail: ok ? `songwriting suggestions returned` : `empty: ${snippet(r.json, r.text)}`, source: detectSource(r.json) };
  });

  // ── GROUP: Legal / business documents ──────────────────────────────────────
  console.log("── Legal / business documents ────────────────────");

  await test("docs", "POST /api/contracts/generate", async () => {
    let templateId = "tpl_nda";
    try {
      const tpls = await api("GET", "/api/contracts/templates");
      const list = tpls.json?.templates;
      if (Array.isArray(list) && list.length) {
        templateId = list.find((t: any) => t?.id === "tpl_nda")?.id ?? list[0]?.id ?? templateId;
      }
    } catch { /* fall back to tpl_nda */ }
    const r = await api("POST", "/api/contracts/generate", {
      body: {
        templateId,
        variables: {
          artistName: "Test Artist", producerName: "Test Producer", disclosingParty: "Test Artist",
          receivingParty: "Test Producer", effectiveDate: "2026-07-01", date: "2026-07-01",
          amount: "1000", trackTitle: "Test Track", companyName: "Max Booster",
        },
      },
    });
    if (!r.ok) return { status: "FAIL", detail: `${r.status} ${snippet(r.json, r.text)}` };
    const content = r.json?.content ?? r.json?.body ?? r.json?.text ?? r.json?.html;
    const ok = (typeof content === "string" && content.length > 80) || deepText(r.json, 80);
    return { status: ok ? "PASS" : "FAIL", detail: ok ? `contract '${templateId}' generated` : `no content: ${snippet(r.json, r.text)}` };
  });

  await test("docs", "POST /api/contracts/tax-forms/generate", async () => {
    const r = await api("POST", "/api/contracts/tax-forms/generate", {
      body: {
        formType: "W-9",
        taxpayerInfo: { name: "Test Artist", businessName: "Test LLC", taxClassification: "individual", address: "1 Test St", city: "Austin", state: "TX", zip: "78701", ssn: "000-00-0000", tin: "00-0000000" },
      },
    });
    if (!r.ok) return { status: "FAIL", detail: `${r.status} ${snippet(r.json, r.text)}` };
    const ok = nonEmpty(r.json) && (deepText(r.json, 4) || r.json?.id);
    return { status: ok ? "PASS" : "FAIL", detail: ok ? `W-9 tax form generated` : `empty form: ${snippet(r.json, r.text)}` };
  });

  // ── GROUP: Video (heavy / async) ───────────────────────────────────────────
  console.log("── Video (heavy / async) ─────────────────────────");

  // Diffusion subsystem wiring (status endpoints)
  let diffusionTrained = false;
  await test("video", "GET /api/music-videos/diffusion/status", async () => {
    const r = await api("GET", "/api/music-videos/diffusion/status");
    if (!r.ok) return { status: "FAIL", detail: `${r.status} ${snippet(r.json, r.text)}` };
    diffusionTrained = Boolean(r.json?.trained);
    return { status: "PASS", detail: `wired (trained=${r.json?.trained}, isTraining=${r.json?.isTraining})` };
  });
  await test("video", "GET /api/music-videos/diffusion/background/status", async () => {
    const r = await api("GET", "/api/music-videos/diffusion/background/status");
    if (!r.ok) return { status: "FAIL", detail: `${r.status} ${snippet(r.json, r.text)}` };
    return { status: "PASS", detail: `wired (running=${r.json?.running})` };
  });

  await test("video", "POST /api/music-videos/diffusion/generate", async () => {
    if (!diffusionTrained) {
      return { status: "WIRED", detail: "model not trained — generation skipped (training is ~28min, not triggered by design)" };
    }
    const r = await api("POST", "/api/music-videos/diffusion/generate", {
      body: { prompt: "neon city skyline at night", genre: "hip-hop", nFrames: 4, fps: 12, frameSize: 128 },
      timeoutMs: 180_000,
    });
    if (!r.ok) {
      if (r.status === 400 && /not trained/i.test(r.text)) return { status: "WIRED", detail: "endpoint wired (model not trained)" };
      return { status: "FAIL", detail: `${r.status} ${snippet(r.json, r.text)}` };
    }
    const ok = nonEmpty(r.json?.framePaths);
    return { status: ok ? "PASS" : "FAIL", detail: ok ? `${r.json.frameCount} frames generated` : `no frames: ${snippet(r.json, r.text)}` };
  });

  // diffusion/train: intentionally NOT exercised (kicks off ~28min CPU training).
  results.push({ group: "video", name: "POST /api/music-videos/diffusion/train", status: "SKIP", detail: "intentionally not triggered (starts ~28min CPU training; subsystem confirmed wired via status endpoints)", ms: 0 });
  console.log(`  [SKIP] POST /api/music-videos/diffusion/train — intentionally not triggered (heavy training)`);

  // Music Video Studio (AI scene generation via MaxCore) — async job + poll.
  await test("video", "Music Video Studio (ai_generate_scenes via MaxCore)", async () => {
    const fd = new FormData();
    fd.append("audio", new Blob([wav], { type: "audio/wav" }), "track.wav");
    fd.append("ai_generate_scenes", "true");
    fd.append("genre", "hip-hop");
    fd.append("platform", "instagram");
    fd.append("aspect_ratio", "9:16");
    fd.append("color_grade", "cinematic");
    fd.append("intensity", "moderate");
    fd.append("artist_name", "Test Artist");
    const start = await api("POST", "/api/social/generate-music-video", { form: fd, timeoutMs: 30_000 });
    if (!start.ok || !start.json?.jobId) return { status: "FAIL", detail: `start failed ${start.status}: ${snippet(start.json, start.text)}` };
    const jobId = start.json.jobId as string;
    const deadline = Date.now() + VIDEO_POLL_CAP_MS;
    let last: ApiRes | null = null;
    while (Date.now() < deadline) {
      await sleep(5000);
      last = await api("GET", `/api/social/music-video-job/${jobId}`, { timeoutMs: 20_000 });
      const st = last.json?.status;
      if (st === "done") {
        const res = last.json?.result;
        const artifact = res?.filename || res?.url || res?.videoUrl || res?.pdim?.key;
        const ok = Boolean(artifact);
        return { status: ok ? "PASS" : "FAIL", detail: ok ? `rendered: ${artifact}${res?.viralScore != null ? ` viralScore=${res.viralScore}` : ""}` : `done but no artifact: ${snippet(res, last.text)}`, source: detectSource(res) || detectSource(last.json) };
      }
      if (st === "error" || last.status === 500) {
        return { status: "FAIL", detail: `render error: ${last.json?.error ?? snippet(last.json, last.text)}` };
      }
    }
    return { status: "FAIL", detail: `timed out after ${(VIDEO_POLL_CAP_MS / 1000) | 0}s (still processing) — last: ${snippet(last?.json, last?.text || "")}` };
  });

  // Legacy image-to-video (user images + audio) — async job + poll.
  await test("video", "Image-to-Video (legacy, user image + audio)", async () => {
    const fd = new FormData();
    fd.append("images", new Blob([png], { type: "image/png" }), "scene1.png");
    fd.append("audio", new Blob([wav], { type: "audio/wav" }), "track.wav");
    fd.append("genre", "hip-hop");
    fd.append("platform", "instagram");
    fd.append("aspect_ratio", "9:16");
    fd.append("duration", "6");
    fd.append("color_grade", "cinematic");
    fd.append("intensity", "moderate");
    const start = await api("POST", "/api/social/generate-music-video", { form: fd, timeoutMs: 30_000 });
    if (!start.ok || !start.json?.jobId) return { status: "FAIL", detail: `start failed ${start.status}: ${snippet(start.json, start.text)}` };
    const jobId = start.json.jobId as string;
    const deadline = Date.now() + VIDEO_POLL_CAP_MS;
    let last: ApiRes | null = null;
    while (Date.now() < deadline) {
      await sleep(5000);
      last = await api("GET", `/api/social/music-video-job/${jobId}`, { timeoutMs: 20_000 });
      const st = last.json?.status;
      if (st === "done") {
        const res = last.json?.result;
        const artifact = res?.filename || res?.url || res?.videoUrl || res?.pdim?.key;
        const ok = Boolean(artifact);
        return { status: ok ? "PASS" : "FAIL", detail: ok ? `rendered: ${artifact}` : `done but no artifact: ${snippet(res, last.text)}`, source: detectSource(res) || detectSource(last.json) };
      }
      if (st === "error" || last.status === 500) {
        return { status: "FAIL", detail: `render error: ${last.json?.error ?? snippet(last.json, last.text)}` };
      }
    }
    return { status: "FAIL", detail: `timed out after ${(VIDEO_POLL_CAP_MS / 1000) | 0}s (still processing)` };
  });

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n=== SUMMARY ===`);
  const counts = { PASS: 0, FAIL: 0, WIRED: 0, SKIP: 0 } as Record<Status, number>;
  for (const r of results) counts[r.status]++;
  const pad = (s: string, n: number) => (s + " ".repeat(n)).slice(0, n);
  console.log(`${pad("STATUS", 7)} ${pad("GROUP", 11)} ${pad("SERVICE", 52)} SRC`);
  for (const r of results) {
    console.log(`${pad(r.status, 7)} ${pad(r.group, 11)} ${pad(r.name, 52)} ${r.source ?? ""}`);
  }
  console.log(
    `\nPASS=${counts.PASS}  FAIL=${counts.FAIL}  WIRED=${counts.WIRED}  SKIP=${counts.SKIP}  (total ${results.length})`,
  );
  if (counts.FAIL > 0) {
    console.log(`\nFailures:`);
    for (const r of results.filter((x) => x.status === "FAIL")) console.log(`  - ${r.name}: ${r.detail}`);
  }
  process.exit(counts.FAIL > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Harness crashed:", e);
  process.exit(2);
});
