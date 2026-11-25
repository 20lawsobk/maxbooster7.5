import fs from "node:fs";
import {restoreCapsule, restoreAppRemainderCapsule} from "../pdim-restore.mjs";
const [capsule,manifest,target,sentinel]=process.argv.slice(2);
// Missing packed inputs must not be silently reported as restored.
if (!fs.existsSync(capsule) || !fs.existsSync(manifest)) {
  throw new Error(`Missing required runtime capsule: ${capsule}`);
}
const restored = target === "."
  ? await restoreAppRemainderCapsule(capsule, manifest, sentinel)
  : await restoreCapsule(capsule, manifest, target, sentinel);
if (!restored) {
  throw new Error(`Failed to restore ${target}`);
}
