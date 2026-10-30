import { spawn as nodeSpawn } from "node:child_process";
import { postgresConnectionEnvironment, safePostgresDiagnostic } from "./postgresTools.js";
import { assertSafeSpawnArguments, restrictedChildEnvironment } from "../subprocessSafety.js";

const RESTORE_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_DIAGNOSTIC_BYTES = 16 * 1024;
const TERMINATION_GRACE_MS = 2_000;

interface RestoreDependencies {
  spawn?: typeof nodeSpawn;
  timeoutMs?: number;
  terminationGraceMs?: number;
}

/** Wait for psql teardown before the caller removes its private SQL files. */
export function runDatabaseRestore(
  command: string,
  args: string[],
  targetUrl: string,
  dependencies: RestoreDependencies = {},
): Promise<void> {
  const timeoutMs = dependencies.timeoutMs ?? RESTORE_TIMEOUT_MS;
  const graceMs = dependencies.terminationGraceMs ?? TERMINATION_GRACE_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > RESTORE_TIMEOUT_MS ||
      !Number.isSafeInteger(graceMs) || graceMs <= 0 || graceMs > 10_000) {
    throw new Error("Invalid database restore process deadline");
  }
  assertSafeSpawnArguments(args);
  const env = restrictedChildEnvironment(postgresConnectionEnvironment(targetUrl));
  return new Promise((resolve, reject) => {
    const child = (dependencies.spawn ?? nodeSpawn)(command, args, {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
      env,
    });
    let diagnostic = "";
    let diagnosticBytes = 0;
    let failure: Error | undefined;
    let closed = false;
    let settled = false;
    let termTimer: ReturnType<typeof setTimeout> | undefined;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const clearTimers = () => {
      clearTimeout(deadline);
      if (termTimer) clearTimeout(termTimer);
      if (killTimer) clearTimeout(killTimer);
    };
    const fail = (error: Error) => {
      if (failure || closed || settled) return;
      failure = error;
      try { child.kill("SIGTERM"); } catch { /* still attempt escalation */ }
      termTimer = setTimeout(() => {
        if (closed) return;
        try { child.kill("SIGKILL"); } catch { /* report unconfirmed teardown below */ }
        killTimer = setTimeout(() => {
          if (closed || settled) return;
          settled = true;
          clearTimers();
          reject(new AggregateError([failure, new Error("psql termination was not confirmed")],
            `${failure?.message}; psql termination was not confirmed`));
        }, graceMs);
      }, graceMs);
    };
    const deadline = setTimeout(() => fail(new Error(
      `Database restore timed out after ${timeoutMs}ms`,
    )), timeoutMs);
    child.stderr?.on("data", (chunk: Buffer | string) => {
      if (failure || settled) return;
      diagnosticBytes += Buffer.byteLength(chunk);
      if (diagnosticBytes > MAX_DIAGNOSTIC_BYTES) {
        fail(new Error("Database restore exceeded diagnostic output limit"));
        return;
      }
      diagnostic += chunk.toString();
    });
    child.stderr?.on("error", error => fail(new Error(
      `Database restore diagnostic stream failed: ${safePostgresDiagnostic(error)}`,
    )));
    child.once("error", error => fail(new Error(
      `Database restore process failed: ${safePostgresDiagnostic(error)}`,
    )));
    child.once("close", code => {
      closed = true;
      clearTimers();
      if (settled) return;
      settled = true;
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error(
        `Restore failed (code ${code}): ${safePostgresDiagnostic(diagnostic)}`,
      ));
      else resolve();
    });
  });
}
