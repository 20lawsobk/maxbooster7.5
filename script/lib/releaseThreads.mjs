import {
  deploymentWorkerBudget,
  liveCapacity,
} from '../deployment/capacity.mjs';

/** Release builds use the shared detected capacity, bounded by 16 CPUs. */
export function releaseCapsuleThreads(
  value,
  cpus = liveCapacity().cpus,
) {
  return deploymentWorkerBudget(
    value,
    cpus,
    'RELEASE_CAPSULE_THREADS',
  );
}
