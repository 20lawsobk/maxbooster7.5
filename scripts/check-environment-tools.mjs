// Development/build tool admission. No application credentials or services used.
import { execFileSync } from "node:child_process";

const run = (command, args, env = process.env) => execFileSync(command, args, {
  env, encoding: "utf8", timeout: 20_000, stdio: ["ignore", "pipe", "pipe"],
}).trim();

try {
  const versions = Object.fromEntries(["node", "nodejs", "npm", "nix", "nix-shell"]
    .map(command => [command, run(command, ["--version"])]));
  if (!/^v22\./.test(versions.node) || versions.nodejs !== versions.node) {
    throw new Error("node and nodejs must resolve to the same supported Node 22 runtime");
  }
  if (Number(versions.npm.split(".")[0]) < 10) throw new Error("npm 10 or newer is required");
  if (run("nix", ["--extra-experimental-features", "nix-command", "eval", "--offline", "--impure", "--expr", "1 + 1"]) !== "2") {
    throw new Error("Nix evaluation failed");
  }
  const expression = 'derivation { name = "maxbooster-tool-admission"; system = builtins.currentSystem; builder = "/bin/sh"; shell = "/bin/bash"; }';
  run("nix-shell", ["--expr", expression, "--run", "test 2 -eq 2"], { ...process.env, NIX_BUILD_SHELL: "/bin/bash" });
  console.log(JSON.stringify({ ready: true, versions, nixEvaluation: true, nixShellExecution: true }, null, 2));
} catch (error) {
  console.error("Required environment tools failed admission:", error instanceof Error ? error.message.split("\n")[0] : "unknown failure");
  process.exitCode = 1;
}
