export function effectiveCapacity(): {cpus:number;memoryGB:number};
export function liveCapacity(): {cpus:number;memoryMB:number;availableMB:number;ioSlots:number};
export function deploymentWorkerBudget(requested?:string|number,cpus?:number,variable?:string):number;
export function deploymentTaskWorkerBudget(requested?:string|number,cpus?:number):number;
