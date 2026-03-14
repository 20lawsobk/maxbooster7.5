import { execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const CWD = process.cwd();

function probe(p: string): string | null {
  try {
    execFileSync(p, ['--version'], { timeout: 3000, stdio: 'ignore' });
    return p;
  } catch {
    return null;
  }
}

function resolvePython(): string {
  const candidates = [
    path.join(CWD, '.venv', 'bin', 'python3'),
    path.join(CWD, '.venv', 'bin', 'python'),
    '/usr/bin/python3',
    '/usr/local/bin/python3',
    'python3',
    'python',
  ];

  for (const c of candidates) {
    if (probe(c)) return c;
  }

  return 'python3';
}

export const PYTHON = resolvePython();

export function ensureVenv(): void {
  const venvPy = path.join(CWD, '.venv', 'bin', 'python3');
  const reqFile = path.join(CWD, 'requirements.txt');

  if (!fs.existsSync(venvPy) && fs.existsSync(reqFile)) {
    try {
      execFileSync('python3', ['-m', 'venv', path.join(CWD, '.venv')], { timeout: 30_000, stdio: 'inherit' });
      execFileSync(venvPy, ['-m', 'pip', 'install', '-r', reqFile, '--quiet'], { timeout: 120_000, stdio: 'inherit' });
      process.stdout.write('[Python] venv created and packages installed\n');
    } catch (e: any) {
      process.stderr.write(`[Python] Could not create venv: ${e.message}\n`);
    }
  }
}
