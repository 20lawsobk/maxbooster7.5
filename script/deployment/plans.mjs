import fs from "node:fs";
// Dependencies are correctness barriers, not a prescribed execution order.
export function buildPlan() {
  const deadlines={cleanup:600,node:180,diffusion:180,dependencies:900,rust:600,python:360,
    strip:300,packer:120,assets:120,app_capsule:900,prune:300,pack_node:600,
    pack_python:600,pack_maxcore:600,pack_pdim:600,source:600,finalize:180};
  const task=(id,deps=[],memoryMB=256,cpu=1,io=1)=>({
    id,deps,memoryMB,cpu,io,timeoutMs:deadlines[id]*1000,command:"bash",args:["build.sh","--executive-task",id],
    ...(["app_capsule","pack_node","pack_python","pack_maxcore","pack_pdim","source"].includes(id)
      ? {elasticCPU:true,maxCPU:id==="app_capsule"?8:2} : {}),
  });
  return [
    task("cleanup",[],128,1,2),
    task("node",[],128),
    task("diffusion",["cleanup"],128),
    task("dependencies",["cleanup","diffusion"],3072,2),
    task("rust",["cleanup"],2048,2),
    task("python",["cleanup"],768),
    task("strip",["dependencies"],128),
    task("packer",["dependencies"],256),
    task("assets",["dependencies"],128),
    // The source snapshot reads MaxCore and generated files. No packer may
    // remove them until this reader has flushed and verified its snapshot.
    task("app_capsule",["strip","packer","assets","rust","node","diffusion","python"],2048,2),
    task("prune",["app_capsule"],128),
    // Level 19 + long-window compression measured above 600 MiB for the
    // compressor alone at one worker. Reserve the parent, tar and two workers.
    task("pack_node",["prune"],1536),
    task("pack_python",["app_capsule"],1536),
    task("pack_maxcore",["app_capsule"],1536),
    task("pack_pdim",["app_capsule"],1536),
    task("source",["pack_node","pack_python","pack_maxcore","pack_pdim"],1536),
    task("finalize",["source"],128),
  ];
}

export function startPlan(node) {
  const restoreData = fs.existsSync("dist/deployment/runtime-data-required") ||
    fs.existsSync("dist/deployment/runtime-data-backup.json");
  const definitions=[
    ["restore-node","node_modules.pdim","node_modules.manifest.json","node_modules",".pdim-restored"],
    ["restore-python","python_runtime.pdim","python_runtime.manifest.json","python_runtime",".pdim-restored-py"],
    ["restore-maxcore","external_maxcore.pdim","external_maxcore.manifest.json","external/maxcore",".pdim-restored-maxcore"],
    ["restore-pdim","external_pdim.pdim","external_pdim.manifest.json","external/pdim",".pdim-restored-pdim"],
  ];
  return [
    ...definitions.map(([id,...args])=>({id,deps:[],cpu:1,io:1,memoryMB:256,
      command:node,args:["dist/deployment/restore-one.mjs",...args]})),
    ...(restoreData ? [{id:"restore-data",deps:["restore-node"],cpu:1,io:1,memoryMB:256,
      timeoutMs:900000,command:node,args:["dist/deployment/restore-runtime-data.mjs"]}] : []),
    {id:"application",deps:[...definitions.map(([id])=>id),...(restoreData ? ["restore-data"] : [])],cpu:1,io:0,memoryMB:512,
      command:"bash",args:["start.sh","--executive-application"],application:true},
  ];
}
