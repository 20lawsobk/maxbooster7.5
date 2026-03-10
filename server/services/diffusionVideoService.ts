/**
 * Max Booster — In-House Diffusion Video Service
 *
 * TypeScript wrapper for the from-scratch NumPy diffusion model.
 * Calls synthesizer.py via child_process; handles training, inference,
 * frame output, and status reporting.
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
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

    const proc = spawn('python3', args, { stdio: ['ignore', 'pipe', 'pipe'] });

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
    const proc = spawn('python3', args, { stdio: ['ignore', 'pipe', 'pipe'] });
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
