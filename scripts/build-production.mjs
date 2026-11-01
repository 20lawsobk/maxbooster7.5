// Serialize ordinary compilation with the historical publishing pipeline.
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {spawn} from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inheritedPublishing = process.env.DEPLOY_PACK === "1" &&
  process.env.PUBLISH_PAYLOAD_CLEANUP === "1" &&
  process.env.PUBLISH_BUILD_ROOT === root &&
  process.env.PUBLISH_SHELL_PACKS_CAPSULES === "1";
const compile = [process.execPath, "--import", "tsx", "script/build.ts"];
const identity = createHash("sha256").update(root).digest("hex");
const command = inheritedPublishing ? compile : [
  "flock", "-n", "-E", "73", `/tmp/maxbooster-publishing-${identity}.lock`, ...compile,
];
const child = spawn(command[0], command.slice(1), {
  cwd: root, env: process.env, stdio: "inherit", detached: true,
});
const stop = signal => {
  if (!child.pid) return;
  try { process.kill(-child.pid, signal); }
  catch (error) { if (error.code !== "ESRCH") console.error(error.message); }
};
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
child.on("error", error => {
  console.error(`Build launcher failed (flock and installed build dependencies are required): ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  stop("SIGTERM");
  if (code === 73) console.error("Another build/publishing pipeline owns this root; no compilation started.");
  process.exitCode = code ?? (signal ? 1 : 0);
});
