import { execFileSync } from "child_process";
import path from "path";
import fs from "fs";

const CWD = process.cwd();

function probe(p: string): boolean {
  try {
    execFileSync(p, ["--version"], { timeout: 3000, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function resolvePython(): string | null {
  // Production startup restores and validates this exact interpreter before
  // importing any consumer. Never silently substitute an unrelated system Python.
  if (process.env.MAXBOOSTER_PYTHON) {
    return probe(process.env.MAXBOOSTER_PYTHON) ? process.env.MAXBOOSTER_PYTHON : null;
  }
  const candidates = [
    path?.join(CWD, "python_runtime", "bin", "python3"),
    path?.join(CWD, "python_runtime", "bin", "python"),
    path?.join(CWD, ".venv", "bin", "python3"),
    path?.join(CWD, ".venv", "bin", "python"),
    "/usr/bin/python3",
    "/usr/local/bin/python3",
    "python3",
    "python",
  ];

  for (const c of candidates) {
    if (probe(c)) return c;
  }

  return null;
}

const resolved = resolvePython();

export const PYTHON: string = resolved ?? process.env.MAXBOOSTER_PYTHON ?? "python3";
export const PYTHON_AVAILABLE: boolean = resolved !== null;

if (!PYTHON_AVAILABLE) {
  process.stdout.write(
    "[Python] required interpreter unavailable — Python-backed operations cannot run\n",
  );
}

export function ensureVenv(): void {
  const venvPy = path?.join(CWD, ".venv", "bin", "python3");
  const reqFile = path?.join(CWD, "requirements.txt");

  if (!fs?.existsSync(venvPy) && fs?.existsSync(reqFile)) {
    try {
      execFileSync("python3", ["-m", "venv", path?.join(CWD, ".venv")], {
        timeout: 30_000,
        stdio: "inherit",
      });
      execFileSync(venvPy, ["-m", "pip", "install", "-r", reqFile, "--quiet"], {
        timeout: 120_000,
        stdio: "inherit",
      });
      process.stdout.write("[Python] venv created and packages installed\n");
    } catch (e) {
      process.stderr.write(`[Python] Could not create venv: ${(e as any)?.message}\n`);
    }
  }
}
