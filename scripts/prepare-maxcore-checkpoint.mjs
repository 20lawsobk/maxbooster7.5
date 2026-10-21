import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = "external/maxcore/artifacts/ai-training-server/ai_model/weights/model.corrupt";
if (process.argv.includes("--fetch")) {
  const fetch = spawnSync("git", ["lfs", "fetch", `--include=${source}`, "--exclude=", "origin", "HEAD"], {
    cwd: root, stdio: "inherit",
  });
  if (fetch.error || fetch.status !== 0) {
    console.error("Checkpoint fetch failed. Resolve the reported Git LFS access/budget error, or supply the pinned artifact via MAXCORE_CHECKPOINT_PATH.");
    process.exit(fetch.status || 1);
  }
}
const result = spawnSync(process.env.MAXBOOSTER_PYTHON || "python3", [
  path.join(root, "external/maxcore/artifacts/ai-training-server/ai_model/model/checkpoint_release.py"),
], { cwd: root, stdio: "inherit" });
if (result.error) console.error(`Checkpoint preparation could not run: ${result.error.message}`);
process.exit(result.status ?? 1);
