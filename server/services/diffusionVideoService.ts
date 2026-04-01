/**
 * Max Booster — In-House Diffusion Video Service
 *
 * TypeScript wrapper for the from-scratch NumPy diffusion model.
 * Calls synthesizer.py via child_process; handles training, inference,
 * frame output, and status reporting.
 */

import { spawn } from 'child_process';
import { PYTHON } from './pythonPath.js';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __metaUrl = (import.meta as any)?.url as string | undefined;
const __filename = __metaUrl ? fileURLToPath(__metaUrl) : path.resolve(process.argv[1] ?? '');
const __dirname = path.dirname(__filename);

const SYNTH_SCRIPT = path.join(
  __dirname,
  'diffusion',
  'synthesizer.py',
);

const WEIGHTS_PATH = path.join(__dirname, 'diffusion', 'weights.npz');
const META_PATH    = path.join(__dirname, 'diffusion', 'meta.json');

export interface DiffusionGenOptions {
  prompt?:        string;
  genre?:         string;
  nFrames?:       number;
  fps?:           number;
  outputDir?:     string;
  frameSize?:     number;
  guidanceScale?: number;
  forceRetrain?:  boolean;
}

export interface DiffusionGenResult {
  framePaths: string[];
  frameCount: number;
  modelMeta:  Record<string, unknown>;
  elapsedMs:  number;
}

export interface TrainingStatus {
  trained:    boolean;
  finalLoss?: number;
  epochs?:    number;
  samples?:   number;
  weightsSizeKB?: number;
}


// ── Training status ────────────────────────────────────────────────────────

export function getDiffusionTrainingStatus(): TrainingStatus {
  const trained = fs.existsSync(WEIGHTS_PATH) && fs.existsSync(META_PATH);
  if (!trained) return { trained: false };

  try {
    const meta = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
    const stat = fs.statSync(WEIGHTS_PATH);
    return {
      trained:        true,
      finalLoss:      meta.final_loss,
      epochs:         meta.epochs,
      samples:        meta.samples,
      weightsSizeKB:  Math.round(stat.size / 1024),
    };
  } catch {
    return { trained };
  }
}


// ── Train the model (background) ────────────────────────────────────────────

export function trainDiffusionModel(opts: {
  nSamples?: number;
  nEpochs?:  number;
  tier?:     'quick' | 'medium' | 'deep';
  onLog?:    (line: string) => void;
} = {}): Promise<TrainingStatus> {
  return new Promise((resolve, reject) => {
    const args = [
      SYNTH_SCRIPT,
      '--train-only',
      '--tier', opts.tier ?? 'quick',
    ];
    if (opts.nSamples) args.push('--samples', String(opts.nSamples));
    if (opts.nEpochs)  args.push('--epochs',  String(opts.nEpochs));

    const proc = spawn(PYTHON, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    proc.stdout.on('data', (d) => {
      const line = d.toString().trim();
      if (line) opts.onLog?.(line);
    });

    proc.stderr.on('data', (d) => {
      const line = d.toString().trim();
      if (line) opts.onLog?.(`[stderr] ${line}`);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(getDiffusionTrainingStatus());
      } else {
        reject(new Error(`Diffusion trainer exited with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}


// ── Generate video frames ──────────────────────────────────────────────────

export function generateDiffusionFrames(
  opts: DiffusionGenOptions = {},
): Promise<DiffusionGenResult> {
  return new Promise((resolve, reject) => {
    const {
      prompt        = '',
      genre         = 'hip-hop',
      nFrames       = 15,
      fps           = 30,
      frameSize     = 512,
      guidanceScale = 2.5,
      forceRetrain  = false,
    } = opts;

    const outDir = opts.outputDir
      ?? path.join(os.tmpdir(), `diffusion_${Date.now()}`);

    fs.mkdirSync(outDir, { recursive: true });

    const args: string[] = [
      SYNTH_SCRIPT,
      prompt || `${genre} music video`,
      '--genre',    genre,
      '--frames',   String(nFrames),
      '--out',      outDir,
      '--size',     String(frameSize),
      '--guidance', String(guidanceScale),
    ];

    if (forceRetrain) args.push('--train');

    const t0 = Date.now();
    const proc = spawn(PYTHON, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(
          `Diffusion synthesizer failed (exit ${code}): ${stderr.slice(-500)}`));
      }

      // Collect generated frame paths
      const framePaths = fs.existsSync(outDir)
        ? fs.readdirSync(outDir)
            .filter(f => f.endsWith('.png'))
            .sort()
            .map(f => path.join(outDir, f))
        : [];

      // Try to parse JSON result from last line of stdout
      let modelMeta: Record<string, unknown> = {};
      try {
        const lines = stdout.trim().split('\n');
        const jsonLine = lines.reverse().find(l => l.startsWith('{'));
        if (jsonLine) modelMeta = JSON.parse(jsonLine);
      } catch { /* ignore */ }

      resolve({
        framePaths,
        frameCount: framePaths.length,
        modelMeta,
        elapsedMs: Date.now() - t0,
      });
    });

    proc.on('error', reject);
  });
}


// ── PyTorch Diffusion API (new video_diffusion/ module) ───────────────────

export interface PyTorchDiffusionRequest {
  prompt?:           string;
  T?:                number;
  H?:                number;
  W?:                number;
  bpm?:              number;
  energy?:           number;
  energy_peak?:      number;
  style_name?:       string;
  beat_index?:       number;
  total_beats?:      number;
  is_drop?:          boolean;
  emotional_goal?:   string;
  blend_style_name?: string;
  blend_weight?:     number;
  seed?:             number;
  output_format?:    'frames_b64' | 'mp4_b64' | 'json_shape';
  platform?:         string;
  // DigitalGPU controls
  use_digital_gpu?:  boolean;
  temporal_smooth?:  boolean;
}

export interface PyTorchDiffusionResult {
  status:         string;
  frames_b64?:    string[];
  mp4_b64?:       string;
  shape?:         number[];
  style_used?:    string;
  scene_name?:    string;
  device?:        string;
  num_frames?:    number;
  gpu_applied?:   boolean;
  scene_metadata?: Record<string, unknown>;
}

export interface DigitalGPUStatus {
  device:               string;
  backend:              string;
  cuda_available:       boolean;
  bf16:                 boolean;
  tf32:                 boolean;
  vram_total?:          number;
  vram_allocated?:      number;
  vram_free?:           number;
  postprocessor_ready:  boolean;
  pipeline_ready:       boolean;
  available_scenes:     string[];
}

const PYTORCH_API_BASE =
  process.env.VIDEO_DIFFUSION_URL ?? 'http://127.0.0.1:8010';

/** Query DigitalGPU backend capabilities from the diffusion API server. */
export async function getDigitalGPUStatus(): Promise<DigitalGPUStatus | null> {
  try {
    const res = await fetch(`${PYTORCH_API_BASE}/gpu/status`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    return res.json() as Promise<DigitalGPUStatus>;
  } catch {
    return null;
  }
}

/** Check if the PyTorch diffusion API server is alive. */
export async function isPyTorchDiffusionReady(): Promise<boolean> {
  try {
    const res = await fetch(`${PYTORCH_API_BASE}/ready`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return false;
    const body = await res.json() as { ready?: boolean };
    return body.ready === true;
  } catch {
    return false;
  }
}

/** Generate a full music-synced video via the PyTorch diffusion API. */
export async function generatePyTorchDiffusionVideo(
  opts: PyTorchDiffusionRequest,
): Promise<PyTorchDiffusionResult> {
  const payload: PyTorchDiffusionRequest = {
    prompt:           opts.prompt ?? '',
    T:                opts.T ?? 16,
    H:                opts.H ?? 256,
    W:                opts.W ?? 256,
    bpm:              opts.bpm ?? 120,
    energy:           opts.energy ?? 0.65,
    energy_peak:      opts.energy_peak ?? 0.85,
    style_name:       opts.style_name ?? 'neon_tunnel',
    beat_index:       opts.beat_index ?? 0,
    total_beats:      opts.total_beats ?? 4,
    is_drop:          opts.is_drop ?? false,
    emotional_goal:   opts.emotional_goal ?? 'curiosity',
    blend_style_name: opts.blend_style_name,
    blend_weight:     opts.blend_weight ?? 0,
    seed:             opts.seed,
    output_format:    opts.output_format ?? 'mp4_b64',
    platform:         opts.platform ?? 'tiktok',
    use_digital_gpu:  opts.use_digital_gpu ?? true,
    temporal_smooth:  opts.temporal_smooth ?? true,
  };

  const res = await fetch(`${PYTORCH_API_BASE}/generate`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
    signal:  AbortSignal.timeout(120_000),  // 2-min budget for inference
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`PyTorch diffusion API error ${res.status}: ${msg}`);
  }

  return res.json() as Promise<PyTorchDiffusionResult>;
}

/** Generate a single representative keyframe via the PyTorch diffusion API. */
export async function generatePyTorchKeyframe(
  opts: Omit<PyTorchDiffusionRequest, 'T' | 'output_format'>,
): Promise<{
  frame_b64?:      string;
  style_used?:     string;
  scene_name?:     string;
  gpu_applied?:    boolean;
  scene_metadata?: Record<string, unknown>;
}> {
  const res = await fetch(`${PYTORCH_API_BASE}/generate/keyframe`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ ...opts, use_digital_gpu: opts.use_digital_gpu ?? true }),
    signal:  AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`PyTorch keyframe API error ${res.status}: ${msg}`);
  }

  return res.json();
}


// ── Quick sanity test ──────────────────────────────────────────────────────

export async function testDiffusionModel(): Promise<{
  ok: boolean;
  status: TrainingStatus;
  message: string;
}> {
  const status = getDiffusionTrainingStatus();
  const msg = status.trained
    ? `Model trained — ${status.epochs} epochs, loss ${status.finalLoss?.toFixed(4)}, weights ${status.weightsSizeKB} KB`
    : 'Model not yet trained. Call trainDiffusionModel() to train.';
  return { ok: status.trained, status, message: msg };
}
