/** Read sources; write only an owned temporary directory. Never start the app. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { buildServerBundles, SERVER_ENTRIES } from "../script/lib/serverBundles";

const root = process.cwd();
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "deployment-benchmark-"));
const samples: { mode: string; seconds: number }[] = [];
try {
  // ABBA ordering reduces the warm-filesystem advantage of always running last.
  for (const mode of ["serial", "combined", "combined", "serial"]) {
    const outdir = path.join(scratch, mode);
    const started = performance.now();
    if (mode === "combined") {
      await buildServerBundles(root, outdir);
    } else {
      for (const [name, entry] of Object.entries(SERVER_ENTRIES)) {
        await build({
          entryPoints: [path.join(root, entry)], outfile: path.join(outdir, `${name}.mjs`),
          bundle: true, platform: "node", target: "node22", format: "esm",
          packages: "external", sourcemap: false, minify: false,
        });
      }
    }
    samples.push({ mode, seconds: (performance.now() - started) / 1000 });
    for (const name of Object.keys(SERVER_ENTRIES)) {
      execFileSync(process.execPath, ["--check", path.join(outdir, `${name}.mjs`)], { stdio: "pipe" });
    }
  }
  const mean = (mode: string) => samples.filter(s => s.mode === mode).reduce((n, s) => n + s.seconds, 0) / 2;
  console.log(JSON.stringify({ samples, serialMean: mean("serial"), combinedMean: mean("combined"),
    speedup: mean("serial") / mean("combined"), scope: "server bundling only; not total publishing time" }, null, 2));
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}