/**
 * Diffusion Background Self-Training Service
 *
 * Automatically trains the diffusion model in the background, continuously
 * improving itself between sessions. Starts as soon as the server boots.
 *
 * Training rotation:
 *   Session 1 → quick  (300 samples × 10 epochs, ~28 min)
 *   Session 2 → medium (600 × 20, ~110 min)
 *   Session 3 → deep   (1000 × 30, ~275 min)
 *   Session 4 → medium (keeps rotating medium/deep indefinitely)
 *   Session 5 → deep
 *   ...
 *
 * Each session resumes from previous weights (long-term memory accumulates).
 * The replay buffer and scene mastery in memory.json grow with every session.
 *
 * Control:
 *   startBackgroundTraining()  — start/resume background loop
 *   stopBackgroundTraining()   — gracefully stop after current session
 *   getBackgroundStatus()      — full status object
 *   isBackgroundTraining()     — quick boolean check
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { logger } from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SYNTH_SCRIPT = path.join(__dirname, 'diffusion', 'synthesizer.py');
const META_PATH    = path.join(__dirname, 'diffusion', 'meta.json');
const MEMORY_PATH  = path.join(__dirname, 'diffusion', 'memory.json');
const STATUS_PATH  = path.join(os.tmpdir(), 'diffusion_bg_status.json');

// Tier rotation sequence — quick first, then alternates medium/deep
const TIER_SEQUENCE: Array<'quick' | 'medium' | 'deep'> = [
  'quick', 'medium', 'deep', 'medium', 'deep', 'medium', 'deep',
];

interface BgStatus {
  running:       boolean;
  paused:        boolean;
  session:       number;
  currentTier:   string;
  startedAt:     number | null;
  lastLoss:      number | null;
  totalSessions: number;
  totalSteps:    number;
  replayBuffer:  number;
  pid:           number | null;
  logTail:       string[];
}

const state: BgStatus = {
  running:       false,
  paused:        false,
  session:       0,
  currentTier:   'quick',
  startedAt:     null,
  lastLoss:      null,
  totalSessions: 0,
  totalSteps:    0,
  replayBuffer:  0,
  pid:           null,
  logTail:       [],
};

let _proc:       ChildProcess | null = null;
let _stopFlag:   boolean             = false;
let _loopTimer:  NodeJS.Timeout | null = null;

const MAX_LOG_LINES = 50;

function _appendLog(line: string) {
  state.logTail.push(line);
  if (state.logTail.length > MAX_LOG_LINES) {
    state.logTail.shift();
  }
}

function _getTier(sessionIndex: number): 'quick' | 'medium' | 'deep' {
  if (sessionIndex < TIER_SEQUENCE.length) {
    return TIER_SEQUENCE[sessionIndex];
  }
  // After initial sequence: alternate medium/deep
  return sessionIndex % 2 === 0 ? 'medium' : 'deep';
}

function _syncMemoryStats() {
  try {
    if (fs.existsSync(MEMORY_PATH)) {
      const raw  = JSON.parse(fs.readFileSync(MEMORY_PATH, 'utf8'));
      const s    = raw?.state ?? {};
      state.totalSessions = s.total_sessions ?? state.totalSessions;
      state.totalSteps    = s.total_steps    ?? state.totalSteps;
      state.replayBuffer  = (raw?.replay_buffer ?? []).length;
    }
    if (fs.existsSync(META_PATH)) {
      const meta = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
      state.lastLoss = meta.final_loss ?? state.lastLoss;
    }
  } catch { /* non-critical */ }
}

function _saveStatus() {
  try {
    fs.writeFileSync(STATUS_PATH, JSON.stringify(state, null, 2));
  } catch { /* non-critical */ }
}


/**
 * Run one training session.
 * Returns a Promise that resolves when the Python process exits.
 */
function _runSession(tier: 'quick' | 'medium' | 'deep'): Promise<boolean> {
  return new Promise((resolve) => {
    if (_stopFlag) { resolve(false); return; }

    state.currentTier = tier;
    state.startedAt   = Date.now();
    _appendLog(`[BgTrainer] Session ${state.session + 1} starting  tier=${tier}`);
    _saveStatus();

    const args = [SYNTH_SCRIPT, '--train-only', '--tier', tier];
    _proc = spawn('python3', args, {
      stdio:  ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    state.pid     = _proc.pid ?? null;
    state.running = true;

    _proc.stdout?.on('data', (d: Buffer) => {
      d.toString().split('\n').filter(Boolean).forEach(line => {
        _appendLog(line.trim());
        if (process.env.NODE_ENV !== 'production') {
          process.stdout.write(`[DiffBG] ${line}\n`);
        }
      });
    });

    _proc.stderr?.on('data', (d: Buffer) => {
      d.toString().split('\n').filter(Boolean).forEach(line => {
        _appendLog(`[err] ${line.trim()}`);
      });
    });

    _proc.on('close', (code: number | null) => {
      state.pid = null;
      _syncMemoryStats();
      if (code === 0) {
        state.session++;
        _appendLog(`[BgTrainer] Session ${state.session} complete ✓  `
                  + `loss=${state.lastLoss?.toFixed(4) ?? '?'}  `
                  + `replay=${state.replayBuffer}`);
        resolve(true);
      } else {
        _appendLog(`[BgTrainer] Session exited with code ${code}`);
        resolve(false);
      }
      _saveStatus();
    });

    _proc.on('error', (err: Error) => {
      _appendLog(`[BgTrainer] Process error: ${err.message}`);
      state.pid = null;
      resolve(false);
    });
  });
}


/**
 * Main training loop — runs sessions indefinitely until stopBackgroundTraining()
 * is called. Waits 10 seconds between sessions (cool-down).
 */
async function _trainingLoop() {
  _appendLog('[BgTrainer] Background self-training loop started');

  while (!_stopFlag) {
    const tier = _getTier(state.session);
    const ok   = await _runSession(tier);

    if (!ok && !_stopFlag) {
      _appendLog('[BgTrainer] Session failed — retrying in 60s');
      await _sleep(60_000);
    } else if (!_stopFlag) {
      // 10-second cool-down between sessions (let server breathe)
      _appendLog('[BgTrainer] Cool-down 10s before next session...');
      await _sleep(10_000);
    }
  }

  state.running = false;
  state.paused  = false;
  _saveStatus();
  _appendLog('[BgTrainer] Background training loop stopped');
}

function _sleep(ms: number): Promise<void> {
  return new Promise(r => { _loopTimer = setTimeout(r, ms); });
}


// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Start the background self-training loop.
 * Safe to call multiple times — won't start a second loop if already running.
 */
export function startBackgroundTraining(): void {
  if (state.running) {
    logger.info('[DiffBG] Already running — ignoring start request');
    return;
  }
  _stopFlag     = false;
  state.running = true;
  state.paused  = false;
  _syncMemoryStats();
  _trainingLoop().catch(err =>
    logger.error('[DiffBG] Unhandled loop error:', err)
  );
  logger.info('[DiffBG] Background self-training started');
}

/**
 * Gracefully stop after the current session completes.
 * Does NOT kill the running process — waits for clean exit.
 */
export function stopBackgroundTraining(): void {
  _stopFlag = true;
  if (_loopTimer) { clearTimeout(_loopTimer); _loopTimer = null; }
  state.paused = true;
  _saveStatus();
  logger.info('[DiffBG] Stop requested — will halt after current session');
}

/**
 * Force-kill the running training process immediately.
 */
export function forceStopBackgroundTraining(): void {
  _stopFlag = true;
  if (_loopTimer) { clearTimeout(_loopTimer); _loopTimer = null; }
  if (_proc && !_proc.killed) {
    _proc.kill('SIGTERM');
    setTimeout(() => { if (_proc && !_proc.killed) _proc.kill('SIGKILL'); }, 5000);
  }
  state.running = false;
  state.paused  = false;
  state.pid     = null;
  _saveStatus();
  logger.info('[DiffBG] Force-stopped');
}

export function isBackgroundTraining(): boolean {
  return state.running && !_stopFlag;
}

export function getBackgroundStatus(): BgStatus & { eta: string } {
  _syncMemoryStats();
  const tierMins: Record<string, number> = { quick: 28, medium: 110, deep: 275 };
  const elapsedMin = state.startedAt
    ? Math.round((Date.now() - state.startedAt) / 60_000)
    : 0;
  const totalMin  = tierMins[state.currentTier] ?? 60;
  const remaining = Math.max(0, totalMin - elapsedMin);
  const eta = state.running
    ? `~${remaining}min remaining in current ${state.currentTier} session`
    : 'not running';

  return { ...state, eta };
}
