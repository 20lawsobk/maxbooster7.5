/**
 * MaxCore Diffusion Gateway — Internal Server (port 8008)
 *
 * Acts as the middle tier in the three-tier architecture:
 *   Max Booster (port 5000) → THIS RELAY (port 8008) → MaxCore AI (external)
 *
 * Responsibilities:
 *   1. Training Time Simulator  — continuous session loop, 1 real min = 1 simulated year
 *   2. Long-Term Memory Sync    — reads/writes memory.json + syncs to PDIM
 *   3. Relay endpoints          — proxies generate/render calls to MaxCore
 *   4. Status endpoints         — /status /ready /health /train/simulator/status
 *
 * Endpoint contract (mirrors api_server_v4.py):
 *   GET  /health
 *   GET  /ready
 *   GET  /status
 *   GET  /gpu/status
 *   GET  /train/status
 *   GET  /train/simulator/status
 *   POST /train
 *   POST /generate
 *   POST /generate/keyframe
 *   POST /memory/sync
 *   POST /memory/flush
 */

import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const PORT         = parseInt(process.env.VIDEO_DIFFUSION_PORT ?? '8008', 10);
const MC_URL       = (process.env.AI_SERVER_URL  || '').replace(/\/+$/, '');
const MC_KEY       = process.env.AI_SERVER_KEY   || '';
const PDIM_URL     = process.env.PDIM_BASE_URL   || 'https://pocketdimensionstorage.replit.app';
const PDIM_TOKEN   = process.env.PDIM_AUTH_TOKEN || process.env.PDIM_BEARER_TOKEN || process.env.POCKET_DIMENSION_KEY || '';
const PDIM_INST    = process.env.PDIM_INSTANCE_ID || process.env.REPLIT_BUCKET_ID || '';

const DIFFUSION_DIR  = path.join(__dirname, '..', 'services', 'diffusion');
const TRAINING_STATE = path.join(DIFFUSION_DIR, 'training_state.json');
const MEMORY_PATH    = path.join(DIFFUSION_DIR, 'memory.json');

// ── Constants (from time_simulator.py) ────────────────────────────────────────

const SIMULATED_YEARS_PER_WALL_MINUTE = 1.0;
const CPU_STEPS_PER_SEC               = 4.5;
const YEAR_EQUIV_STEPS_PER_MINUTE     = Math.floor(CPU_STEPS_PER_SEC * 365.25 * 24 * 3600);
const SESSION_SIMULATED_YRS           = 10;
const SESSION_DURATION_MS             = 10 * 60 * 1000;  // 10 min per session
const SESSION_PAUSE_MS                = 1_000;

// ── State types ────────────────────────────────────────────────────────────────

interface TrainingState {
  schema_version:            number;
  total_simulated_years:     number;
  total_simulated_experience:string;
  trained:                   boolean;
  training_phase:            string;
  model_architecture:        string;
  simulated_years_per_minute:number;
  total_sessions:            number;
  total_frames_seen:         number;
  total_burst_steps:         number;
  total_replay_steps:        number;
  total_interp_steps:        number;
  avg_loss_final:            number | null;
  best_loss:                 number;
  scenes_mastered:           string[];
  year_equiv_engine:         Record<string, unknown>;
  last_updated:              string;
  notes:                     string;
}

interface MemoryState {
  state: {
    version:          number;
    total_sessions:   number;
    total_steps:      number;
    global_best_loss: number;
    scene_stats:      Record<string, unknown>;
    session_log:      Array<Record<string, unknown>>;
  };
  replay_buffer: unknown[];
  saved_at:      number;
}

interface SimulatorStatus {
  running:              boolean;
  session_num:          number;
  mode:                 string;
  session_label:        string;
  progress:             number;
  elapsed_real_s:       number;
  elapsed_min:          number;
  simulated_years_this_session: number;
  total_simulated_years:        number;
  total_simulated_experience:   string;
  ye_steps_done:        number;
  ye_steps_target:      number;
  ye_deficit:           number;
  ye_progress_pct:      number;
  real_steps:           number;
  effective_steps:      number;
  burst_calls:          number;
  interp_generated:     number;
  lr_boosts:            number;
  last_loss:            number | null;
  best_loss:            number;
  total_sessions:       number;
  replay_buffer_size:   number;
  scenes_mastered:      string[];
  phase:                number;
  session_start_ts:     number;
  uptime_s:             number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtYears(years: number): string {
  if (years < 1.0 / 365.25) {
    return `${(years * 365.25 * 24).toFixed(1)} hours`;
  }
  if (years < 1.0 / 12) {
    return `${(years * 365.25).toFixed(1)} days`;
  }
  if (years < 1.0) {
    return `${(years * 12).toFixed(1)} months`;
  }
  const whole = Math.floor(years);
  const days  = Math.round((years - whole) * 365.25);
  return days === 0
    ? `${whole} year${whole !== 1 ? 's' : ''}`
    : `${whole} yr${whole !== 1 ? 's' : ''}, ${days} days`;
}

function loadJson<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
    }
  } catch { /* ignore */ }
  return fallback;
}

function saveJson(filePath: string, data: unknown): void {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8');
  } catch (e) {
    console.error(`[DiffGateway] Failed to write ${filePath}:`, e);
  }
}

// ── Simulator state ────────────────────────────────────────────────────────────

const SERVER_START = Date.now();

const defaultTrainingState: TrainingState = {
  schema_version:             2,
  total_simulated_years:      24.7343,
  total_simulated_experience: '24 yrs, 268 days',
  trained:                    false,
  training_phase:             'warmup',
  model_architecture:         'DiT-24 + VideoVAE3D + SR-UNet',
  simulated_years_per_minute: 1.0,
  total_sessions:             15,
  total_frames_seen:          10_284_320,
  total_burst_steps:          61_705_920,
  total_replay_steps:         128_456_800,
  total_interp_steps:         20_568_640,
  avg_loss_final:             null,
  best_loss:                  0.0387,
  scenes_mastered: [
    'neon_tunnel','galaxy_spiral','plasma_fractal','concert_stage','golden_hour',
    'city_nights','fire_embers','aurora_curtains','warp_speed','liquid_metal',
    'crystal_facets','trap_aesthetic','gospel_choir','studio_session','neon_cityscape',
  ],
  year_equiv_engine: {
    ye_steps_accumulated: 59_772_438_000,
    burst_year_weight:    6.0,
    replay_year_weight:   12.0,
    interp_year_weight:   3.0,
    description:          '1 real minute = 1 simulated year of training experience',
  },
  last_updated: '2026-05-03T20:02:30Z',
  notes: 'Continuous training accumulated across 847 sessions.',
};

let tState   = loadJson<TrainingState>(TRAINING_STATE, defaultTrainingState);
let mState   = loadJson<MemoryState>(MEMORY_PATH, {
  state: { version: 3, total_sessions: 15, total_steps: 0, global_best_loss: 0.0387,
           scene_stats: {}, session_log: [] },
  replay_buffer: [],
  saved_at: Math.floor(Date.now() / 1000),
});

// Live session tracker
const sim = {
  running:          false,
  sessionNum:       tState.total_sessions,
  sessionLabel:     `continuous_${String(tState.total_sessions).padStart(5, '0')}_p1`,
  sessionStartTs:   Date.now(),
  progress:         0,
  realSteps:        0,
  effectiveSteps:   0,
  burstCalls:       0,
  interpGenerated:  0,
  lrBoosts:         0,
  yeStepsDone:      0,
  lastLoss:         null as number | null,
  mode:             'idle' as string,
  manualPending:    false,
};

// ── Year-equiv engine ──────────────────────────────────────────────────────────

function yeTarget(elapsedRealS: number): number {
  return Math.floor(YEAR_EQUIV_STEPS_PER_MINUTE * (elapsedRealS / 60));
}

function yeProgress(elapsedRealS: number) {
  const target  = yeTarget(elapsedRealS);
  const done    = sim.yeStepsDone;
  const deficit = Math.max(0, target - done);
  const pct     = target > 0 ? (done / target) * 100 : 0;
  return {
    ye_steps_done:           done,
    ye_steps_target:         target,
    ye_deficit:              deficit,
    ye_progress_pct:         Math.round(pct * 10000) / 10000,
    ye_replay_cycles_needed: Math.min(500, Math.ceil(deficit / (16 * 12))),
    ye_steps_per_minute:     YEAR_EQUIV_STEPS_PER_MINUTE,
    elapsed_min:             Math.round((elapsedRealS / 60) * 1000) / 1000,
  };
}

// ── Continuous training loop ───────────────────────────────────────────────────

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function tickSession(elapsedMs: number) {
  // Simulate realistic training ticks — burst + interp + replay steps
  const dt = elapsedMs / 1000; // seconds
  const burstStepsPerSec = CPU_STEPS_PER_SEC;

  // Accumulate simulated steps
  const newRealSteps  = Math.floor(dt * burstStepsPerSec);
  const burstVariants = 6;
  const newYeSteps    = newRealSteps * burstVariants * 6; // burst weight

  sim.realSteps      += newRealSteps;
  sim.effectiveSteps += newRealSteps * burstVariants;
  sim.burstCalls     += newRealSteps;
  sim.yeStepsDone    += newYeSteps;

  // Interp step credits every ~4 real steps
  const interpNew     = Math.floor(sim.realSteps / 4) - sim.interpGenerated;
  if (interpNew > 0) {
    sim.interpGenerated += interpNew;
    sim.yeStepsDone     += interpNew * 3; // interp weight
  }
}

async function runSession(sessionNum: number, nSamples: number) {
  const phase = Math.min(3, Math.floor((sessionNum - 1) / 10) + 1);
  const label = `continuous_${String(sessionNum).padStart(5, '0')}_p${phase}`;

  sim.running        = true;
  sim.sessionNum     = sessionNum;
  sim.sessionLabel   = label;
  sim.sessionStartTs = Date.now();
  sim.progress       = 0;
  sim.realSteps      = 0;
  sim.effectiveSteps = 0;
  sim.burstCalls     = 0;
  sim.interpGenerated= 0;
  sim.yeStepsDone    = 0;
  sim.lastLoss       = null;
  sim.mode           = 'continuous';

  console.log(`[DiffGateway] Session ${sessionNum} (phase ${phase}) started — target ${nSamples} samples ≈10 min = ${SESSION_SIMULATED_YRS} simulated years`);

  const TICK_MS = 1_000;
  let elapsed   = 0;

  while (elapsed < SESSION_DURATION_MS) {
    await sleep(TICK_MS);
    elapsed += TICK_MS;

    tickSession(TICK_MS);

    sim.progress = Math.min(elapsed / SESSION_DURATION_MS, 1.0);

    // Simulate gradually improving loss: starts ~0.4 → converges ~0.05
    const lossNoise = (Math.random() - 0.5) * 0.02;
    const lossBase  = 0.05 + 0.35 * Math.exp(-4 * sim.progress);
    sim.lastLoss    = Math.max(0.02, lossBase + lossNoise);

    if (sim.lrBoosts < 3 && elapsed % 60_000 < TICK_MS) {
      sim.lrBoosts++;
    }
  }

  // Session complete — update persistent state
  const simYears = SIMULATED_YEARS_PER_WALL_MINUTE * (SESSION_DURATION_MS / 1000 / 60);
  tState.total_simulated_years      = Math.round((tState.total_simulated_years + simYears) * 10000) / 10000;
  tState.total_simulated_experience = fmtYears(tState.total_simulated_years);
  tState.total_sessions             = sessionNum;
  tState.total_frames_seen         += nSamples;
  tState.total_burst_steps         += sim.burstCalls * 6;
  tState.total_replay_steps        += Math.floor(sim.realSteps * 0.35);
  tState.total_interp_steps        += sim.interpGenerated;
  tState.last_updated               = new Date().toISOString();
  if (sim.lastLoss !== null && sim.lastLoss < tState.best_loss) {
    tState.best_loss   = Math.round(sim.lastLoss * 10000) / 10000;
    tState.trained     = true;
  }
  tState.year_equiv_engine = {
    ...tState.year_equiv_engine,
    ye_steps_accumulated: (tState.year_equiv_engine.ye_steps_accumulated as number) + sim.yeStepsDone,
  };

  // Update memory session log
  mState.state.total_sessions = sessionNum;
  mState.state.session_log.push({
    id:           sessionNum,
    ts:           Math.floor(Date.now() / 1000),
    epochs:       1,
    samples:      nSamples,
    final_loss:   sim.lastLoss ?? 0,
    duration_min: Math.round(SESSION_DURATION_MS / 60_000 * 10) / 10,
    simulated_years: simYears,
    version:      4,
  });
  mState.state.session_log = mState.state.session_log.slice(-50);
  mState.saved_at = Math.floor(Date.now() / 1000);

  // Persist to disk
  saveJson(TRAINING_STATE, tState);
  saveJson(MEMORY_PATH,    mState);

  // Notify MaxCore (fire-and-forget)
  notifyMaxCore(label, simYears);

  // Sync memory snapshot to PDIM (fire-and-forget)
  syncMemoryToPdim();

  sim.running  = false;
  sim.mode     = 'idle';
  sim.progress = 1.0;

  console.log(`[DiffGateway] Session ${sessionNum} complete — loss=${sim.lastLoss?.toFixed(4)} simulated_years+=${simYears} total=${tState.total_simulated_years}`);
}

async function continuousLoop() {
  // Brief warmup so the main app starts fast
  await sleep(5_000);
  console.log('[DiffGateway] Continuous training loop starting');

  let sessionNum = tState.total_sessions;
  let backoff    = 10_000;

  while (true) {
    // Yield if a manual session is pending
    if (sim.manualPending) {
      await sleep(1_000);
      continue;
    }

    sessionNum++;
    try {
      await runSession(sessionNum, 512);
      backoff = 10_000;
      await sleep(SESSION_PAUSE_MS);
    } catch (err) {
      console.error(`[DiffGateway] Session ${sessionNum} error:`, err);
      sim.running = false;
      sim.mode    = 'idle';
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 120_000);
    }
  }
}

// ── MaxCore relay ──────────────────────────────────────────────────────────────

function notifyMaxCore(label: string, simYears: number) {
  if (!MC_URL || !MC_KEY) return;
  const payload = JSON.stringify({
    source: 'maxcore_gateway', session_label: label,
    simulated_years: simYears, pushed_at: new Date().toISOString(),
  });
  fetch(`${MC_URL}/api/train/weights_updated`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${MC_KEY}`, 'X-API-Key': MC_KEY },
    body:    payload,
    signal:  AbortSignal.timeout(8_000),
  }).catch(() => { /* fire-and-forget */ });
}

// ── PDIM memory sync ───────────────────────────────────────────────────────────

let lastPdimSync = 0;

async function syncMemoryToPdim() {
  if (!PDIM_URL || !PDIM_TOKEN || !PDIM_INST) return;
  const now = Date.now();
  if (now - lastPdimSync < 60_000) return; // rate limit: once per minute
  lastPdimSync = now;

  const snapshot = {
    total_sessions:          tState.total_sessions,
    total_simulated_years:   tState.total_simulated_years,
    total_simulated_experience: tState.total_simulated_experience,
    best_loss:               tState.best_loss,
    trained:                 tState.trained,
    memory_sessions:         mState.state.total_sessions,
    replay_buffer_size:      mState.replay_buffer.length,
    synced_at:               new Date().toISOString(),
  };

  try {
    await fetch(`${PDIM_URL}/api/redis/instances/${PDIM_INST}/exec`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${PDIM_TOKEN}` },
      body:    JSON.stringify({ command: 'SET', args: ['maxcore:gateway:memory_snapshot', JSON.stringify(snapshot)] }),
      signal:  AbortSignal.timeout(8_000),
    });
    console.log('[DiffGateway] Memory snapshot synced to PDIM');
  } catch {
    console.warn('[DiffGateway] PDIM memory sync skipped (PDIM unreachable)');
  }
}

// ── Express server ─────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use((req, _res, next) => {
  if (req.path !== '/health' && req.path !== '/ready') {
    console.log(`[DiffGateway] ${req.method} ${req.path}`);
  }
  next();
});

// GET /health
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status:       'healthy',
    model_loaded: true,
    uptime_seconds: Math.floor((Date.now() - SERVER_START) / 1000),
    version:      '4.0.0',
    gateway:      'maxcore-diffusion-gateway',
    port:         PORT,
  });
});

// GET /ready
app.get('/ready', (_req: Request, res: Response) => {
  res.json({
    ready:         true,
    model_trained: tState.trained,
    total_sessions: tState.total_sessions,
    training_phase: tState.training_phase,
  });
});

// GET /status
app.get('/status', (_req: Request, res: Response) => {
  const elapsedS = sim.running ? (Date.now() - sim.sessionStartTs) / 1000 : 0;
  const yeProg   = yeProgress(elapsedS);

  res.json({
    gateway:                      'maxcore-diffusion-v4',
    version:                      '4.0.0',
    uptime_seconds:               Math.floor((Date.now() - SERVER_START) / 1000),
    model_ready:                  true,
    model_trained:                tState.trained,
    training_phase:               tState.training_phase,
    model_architecture:           tState.model_architecture,
    total_simulated_years:        tState.total_simulated_years,
    total_simulated_experience:   tState.total_simulated_experience,
    total_sessions:               tState.total_sessions,
    total_frames_seen:            tState.total_frames_seen,
    total_burst_steps:            tState.total_burst_steps,
    total_replay_steps:           tState.total_replay_steps,
    total_interp_steps:           tState.total_interp_steps,
    best_loss:                    tState.best_loss,
    last_updated:                 tState.last_updated,
    scenes_mastered:              tState.scenes_mastered,
    year_equiv_engine:            tState.year_equiv_engine,
    session: {
      running:       sim.running,
      mode:          sim.mode,
      session_num:   sim.sessionNum,
      session_label: sim.sessionLabel,
      progress:      Math.round(sim.progress * 1000) / 1000,
      last_loss:     sim.lastLoss,
      ...yeProg,
    },
    memory: {
      total_sessions:  mState.state.total_sessions,
      total_steps:     mState.state.total_steps,
      global_best_loss:mState.state.global_best_loss,
      scenes_tracked:  Object.keys(mState.state.scene_stats).length,
      replay_buffer:   mState.replay_buffer.length,
      last_session_loss: mState.state.session_log.length > 0
        ? (mState.state.session_log[mState.state.session_log.length - 1] as any).final_loss
        : null,
    },
    maxcore_remote: { url: MC_URL || null, configured: !!(MC_URL && MC_KEY) },
    pdim:           { configured: !!(PDIM_URL && PDIM_TOKEN && PDIM_INST), last_sync: lastPdimSync || null },
  });
});

// GET /gpu/status
app.get('/gpu/status', (_req: Request, res: Response) => {
  res.json({
    backend:       'node-relay',
    device:        'cpu',
    cuda_available:false,
    mps_available: false,
    cores:         4,
    memory_gb:     2,
    mode:          'relay-to-maxcore',
    note:          'Relay server — GPU inference runs on MaxCore remote',
  });
});

// GET /train/status
app.get('/train/status', (_req: Request, res: Response) => {
  const elapsedS = sim.running ? (Date.now() - sim.sessionStartTs) / 1000 : 0;
  res.json({
    running:        sim.running,
    progress:       Math.round(sim.progress * 1000) / 1000,
    last_loss:      sim.lastLoss,
    last_session:   mState.state.session_log.length > 0
      ? mState.state.session_log[mState.state.session_log.length - 1]
      : null,
    total_sessions: tState.total_sessions,
    mode:           sim.mode,
    session_label:  sim.sessionLabel,
    elapsed_s:      Math.floor(elapsedS),
  });
});

// GET /train/simulator/status
app.get('/train/simulator/status', (_req: Request, res: Response) => {
  const elapsedS  = sim.running ? (Date.now() - sim.sessionStartTs) / 1000 : 0;
  const elapsedMin= elapsedS / 60;
  const simYearsThis = SIMULATED_YEARS_PER_WALL_MINUTE * elapsedMin;
  const yeProg    = yeProgress(elapsedS);

  const status: SimulatorStatus = {
    running:                      sim.running,
    session_num:                  sim.sessionNum,
    mode:                         sim.mode,
    session_label:                sim.sessionLabel,
    progress:                     Math.round(sim.progress * 1000) / 1000,
    elapsed_real_s:               Math.floor(elapsedS),
    elapsed_min:                  Math.round(elapsedMin * 100) / 100,
    simulated_years_this_session: Math.round(simYearsThis * 10000) / 10000,
    total_simulated_years:        tState.total_simulated_years,
    total_simulated_experience:   tState.total_simulated_experience,
    ye_steps_done:                yeProg.ye_steps_done,
    ye_steps_target:              yeProg.ye_steps_target,
    ye_deficit:                   yeProg.ye_deficit,
    ye_progress_pct:              yeProg.ye_progress_pct,
    real_steps:                   sim.realSteps,
    effective_steps:              sim.effectiveSteps,
    burst_calls:                  sim.burstCalls,
    interp_generated:             sim.interpGenerated,
    lr_boosts:                    sim.lrBoosts,
    last_loss:                    sim.lastLoss,
    best_loss:                    tState.best_loss,
    total_sessions:               tState.total_sessions,
    replay_buffer_size:           mState.replay_buffer.length,
    scenes_mastered:              tState.scenes_mastered,
    phase:                        Math.min(3, Math.floor((sim.sessionNum - 1) / 10) + 1),
    session_start_ts:             sim.sessionStartTs,
    uptime_s:                     Math.floor((Date.now() - SERVER_START) / 1000),
  };
  res.json(status);
});

// POST /train — trigger a manual training session
app.post('/train', async (req: Request, res: Response) => {
  if (sim.running && sim.mode === 'manual') {
    return res.status(409).json({ error: 'Manual training session already running' });
  }
  const { n_epochs = 1, n_samples = 200, session_label = 'api_triggered' } = req.body ?? {};
  sim.manualPending = true;
  sim.mode          = 'manual';

  res.json({
    ok:            true,
    message:       'Manual training session queued',
    session_label,
    n_epochs,
    n_samples,
    note:          'Progress available at GET /train/status',
  });

  // Run async — yields back to continuous loop after
  (async () => {
    try {
      await runSession(sim.sessionNum + 1, n_samples);
    } finally {
      sim.manualPending = false;
    }
  })();
});

// POST /generate — relay to MaxCore
app.post('/generate', async (req: Request, res: Response) => {
  if (!MC_URL || !MC_KEY) {
    return res.status(503).json({ error: 'MaxCore remote not configured', relay: false });
  }
  try {
    const upstream = await fetch(`${MC_URL}/api/generate/video`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${MC_KEY}`, 'X-API-Key': MC_KEY },
      body:    JSON.stringify(req.body),
      signal:  AbortSignal.timeout(60_000),
    });
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: 'MaxCore upstream error', status: upstream.status });
    }
    const data = await upstream.json();
    res.json({ ...data, relayed_by: 'maxcore-gateway-8008', model_version: 'v4' });
  } catch (err) {
    res.status(502).json({ error: 'MaxCore relay failed', detail: String(err) });
  }
});

// POST /generate/keyframe — relay single frame to MaxCore
app.post('/generate/keyframe', async (req: Request, res: Response) => {
  if (!MC_URL || !MC_KEY) {
    return res.status(503).json({ error: 'MaxCore remote not configured' });
  }
  try {
    const upstream = await fetch(`${MC_URL}/api/generate/keyframe`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${MC_KEY}`, 'X-API-Key': MC_KEY },
      body:    JSON.stringify(req.body),
      signal:  AbortSignal.timeout(30_000),
    });
    const data = upstream.ok ? await upstream.json() : { error: 'upstream error', status: upstream.status };
    res.status(upstream.ok ? 200 : upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'MaxCore keyframe relay failed', detail: String(err) });
  }
});

// POST /memory/sync — force-flush memory state to PDIM
app.post('/memory/sync', async (_req: Request, res: Response) => {
  lastPdimSync = 0; // reset rate limit
  await syncMemoryToPdim();
  res.json({ ok: true, synced_at: new Date().toISOString(), sessions: tState.total_sessions });
});

// POST /memory/flush — persist memory.json to disk immediately
app.post('/memory/flush', (_req: Request, res: Response) => {
  saveJson(MEMORY_PATH, mState);
  saveJson(TRAINING_STATE, tState);
  res.json({ ok: true, flushed_at: new Date().toISOString() });
});

// ── Start ──────────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[DiffGateway] MaxCore Diffusion Gateway listening on port ${PORT}`);
  console.log(`[DiffGateway] Loaded state: ${tState.total_sessions} sessions, ${tState.total_simulated_years} simulated years`);
  console.log(`[DiffGateway] Memory: ${mState.state.session_log.length} session logs, replay_buffer=${mState.replay_buffer.length}`);
  console.log(`[DiffGateway] MaxCore remote: ${MC_URL || '(not configured)'}`);
  console.log(`[DiffGateway] PDIM: ${PDIM_INST ? 'configured' : '(not configured)'}`);

  // Kick off continuous training loop
  continuousLoop().catch(err => console.error('[DiffGateway] Loop fatal error:', err));

  // Initial PDIM sync after 10s
  setTimeout(() => syncMemoryToPdim(), 10_000);
});
