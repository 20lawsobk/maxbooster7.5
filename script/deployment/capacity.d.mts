export const DEDICATED_DEPLOYMENT_LIMITS: Readonly<{cpus:number;memoryGB:number}>;
export function effectiveCapacity(): {cpus:number;memoryGB:number};
export function clampDeploymentCapacity(capacity:{cpus:number;memoryGB:number}):{cpus:number;memoryGB:number};
export function liveCapacity(): {cpus:number;memoryMB:number;usedMB:number;availableMB:number;ioSlots:number};
export function deploymentWorkerBudget(requested?:string|number,cpus?:number,variable?:string):number;
export function deploymentTaskWorkerBudget(requested?:string|number,cpus?:number):number;
