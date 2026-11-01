/**
 * XZ ENGINE
 *
 * Thin wrapper around the real `xz` CLI (liblzma) for the "archival / cold
 * data" tier of the adaptive codec mesh — highest compression ratio at the
 * cost of speed, used when the awareness profiler + size hint indicate the
 * data is worth the extra CPU (large, compressible, not latency-sensitive).
 *
 * Streams via stdin/stdout pipes (no temp files) so concurrent calls don't
 * contend on disk I/O the way file-based invocation would.
 */
import { spawn } from "child_process";
import { logger } from "../../../logger.js";

let xzAvailable: boolean | null = null;

async function checkXz(): Promise<boolean> {
  if (xzAvailable !== null) return xzAvailable;
  xzAvailable = await new Promise<boolean>((resolve) => {
    const p = spawn("xz", ["--version"]);
    p.on("error", () => resolve(false));
    p.on("exit", (code) => resolve(code === 0));
  });
  if (!xzAvailable) {
    logger.warn("[XzEngine] `xz` CLI not available — archival codec tier disabled");
  }
  return xzAvailable;
}

function runPiped(args: string[], input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn("xz", args);
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    proc.stdout.on("data", (c) => chunks.push(c));
    proc.stderr.on("data", (c) => errChunks.push(c));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(
          new Error(
            `xz exited ${code}: ${Buffer.concat(errChunks).toString("utf8").slice(0, 500)}`,
          ),
        );
      }
    });

    proc.stdin.on("error", () => {
      /* EPIPE if xz exits early (e.g. bad input) — surfaced via close/exit above */
    });
    proc.stdin.end(input);
  });
}

export class XzEngine {
  async isAvailable(): Promise<boolean> {
    return checkXz();
  }

  /** level 0-9; -e enables "extreme" mode for a better ratio at more CPU cost. */
  async compress(data: Buffer, level = 9, extreme = true): Promise<Buffer> {
    const available = await checkXz();
    if (!available) throw new Error("xz CLI not available");
    const args = [`-${level}${extreme ? "e" : ""}`, "-T0", "-c"];
    return runPiped(args, data);
  }

  async decompress(data: Buffer): Promise<Buffer> {
    const available = await checkXz();
    if (!available) throw new Error("xz CLI not available");
    return runPiped(["-d", "-T0", "-c"], data);
  }
}

export const xzEngine = new XzEngine();
