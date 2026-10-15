#!/usr/bin/env node
import { spawn } from "node:child_process";

const explicitMode = process.env.MAXBOOSTER_START_MODE;
if (explicitMode && !["development", "production"].includes(explicitMode)) {
  console.error("[start] MAXBOOSTER_START_MODE must be development or production");
  process.exit(2);
}

const production =
  explicitMode === "production" ||
  (!explicitMode &&
    (process.env.NODE_ENV === "production" ||
      Boolean(process.env.REPLIT_DEPLOYMENT_ID)));

const command = production ? "start.sh" : "scripts/start-dev.sh";
console.log(
  `[start] ${production ? "production" : "development"} mode → ${command}`,
);

const child = spawn("bash", [command], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    if (child.exitCode === null && child.signalCode === null) {
      child.kill(signal);
    }
  });
}

child.once("error", (error) => {
  console.error(`[start] Could not launch ${command}: ${error.message}`);
  process.exitCode = 1;
});
child.once("close", (code, signal) => {
  if (signal) {
    process.exitCode = signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1;
  } else {
    process.exitCode = code ?? 1;
  }
});
