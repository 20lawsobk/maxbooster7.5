import os from "node:os";
import fs from "node:fs";
function read(file) {
  try { return fs.readFileSync(file,"utf8").trim(); }
  catch(error) { if(["ENOENT","ENOTDIR"].includes(error.code)) return null; throw error; }
}
export function effectiveCapacity() {
  let cpus=os.availableParallelism(), memory=os.totalmem();
  const max=read("/sys/fs/cgroup/cpu.max")?.split(/\s+/);
  const quota=max?Number(max[0]):Number(read("/sys/fs/cgroup/cpu/cpu.cfs_quota_us"));
  const period=max?Number(max[1]):Number(read("/sys/fs/cgroup/cpu/cpu.cfs_period_us"));
  if(quota>0 && period>0) cpus=Math.min(cpus,quota/period);
  for(const file of ["/sys/fs/cgroup/memory.max","/sys/fs/cgroup/memory/memory.limit_in_bytes"]) {
    const n=Number(read(file)); if(n>0 && Number.isFinite(n)) memory=Math.min(memory,n);
  }
  return {cpus,memoryGB:memory/1024**3};
}
export function liveCapacity() {
  const {cpus,memoryGB}=effectiveCapacity();
  const used=Number(read("/sys/fs/cgroup/memory.current") ?? read("/sys/fs/cgroup/memory/memory.usage_in_bytes"));
  const stats=read("/sys/fs/cgroup/memory.stat") ?? read("/sys/fs/cgroup/memory/memory.stat") ?? "";
  const reclaimable=Number(stats.match(/^(?:total_)?inactive_file (\d+)$/m)?.[1] ?? 0);
  const availableMB=Math.min(os.freemem()+reclaimable,Math.max(0,memoryGB*1024**3-used+reclaimable))/1024**2;
  const pressure=Number((read("/sys/fs/cgroup/io.pressure") ?? read("/proc/pressure/io"))?.match(/some avg10=([\d.]+)/)?.[1] ?? 0);
  return {cpus,memoryMB:memoryGB*1024,availableMB,ioSlots:pressure>25?1:Math.max(1,Math.min(4,Math.floor(cpus/2)))};
}
