// Real production packer, non-destructive hardlink snapshots, identical T1
// allocation to the four-CPU publishing builder. Never run on mutable inputs.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { packCapsule, MAXCORE_CAPSULE_EXCLUDE_PATHS, PDIM_CAPSULE_EXCLUDE_PATHS } from "./lib/capsulePack.js";
import { beginDeploymentPack } from "./lib/deploymentPackRecovery.mjs";

const root = process.cwd();
fs.mkdirSync(path.join(root, ".deployment-pack-state"), {recursive:true});
const scratch = fs.mkdtempSync(path.join(root, ".deployment-pack-state/benchmark-"));
const targets = [
  {dir:"python_runtime", capsule:"python_runtime.pdim"},
  {dir:"node_modules", capsule:"node_modules.pdim"},
  {dir:"external/maxcore", capsule:"external_maxcore.pdim", excludePaths:MAXCORE_CAPSULE_EXCLUDE_PATHS},
  {dir:"external/pdim", capsule:"external_pdim.pdim", excludePaths:PDIM_CAPSULE_EXCLUDE_PATHS},
];
const results: Array<{level:number; seconds:number; bytes:number}> = [];
try {
  for (const level of (process.argv.includes("--new-only") ? [6] : [19,6])) {
    const copy = path.join(scratch, String(level));
    fs.mkdirSync(path.join(copy,"external"),{recursive:true});
    for (const {dir} of targets) execFileSync("cp",["-al",path.join(root,dir),path.join(copy,dir)]);
    const start = performance.now();
    // New production packing also pays for safe reentry. Include that cost.
    if (level === 6) beginDeploymentPack(copy);
    const packed = await Promise.all(targets.map(target=>packCapsule({...target,root:copy,threads:1,compressionLevel:level})));
    const result = {level,seconds:(performance.now()-start)/1000,bytes:packed.reduce((n,r)=>n+(r?.sizeBytes??0),0)};
    results.push(result);
    console.log("BENCHMARK", JSON.stringify(result));
    for(const r of packed) if(r) execFileSync("zstd",["-t",r.capsulePath],{stdio:"inherit"});
    fs.rmSync(copy,{recursive:true,force:true});
  }
  console.log("RESULT",JSON.stringify({results,speedup:results.length === 2 ? results[0].seconds/results[1].seconds : null}));
} finally {
  fs.rmSync(scratch,{recursive:true,force:true});
}