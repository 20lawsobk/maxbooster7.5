import { effectiveCapacity } from '../deployment/capacity.mjs';

/** Preparation packs serially; explicitly bound compression CPU use to quota. */
export function releaseCapsuleThreads(value, cpus = effectiveCapacity().cpus) {
  const maximum = Math.max(1, Math.floor(cpus));
  if (value === undefined) return 1;
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > maximum) {
    throw new Error(`RELEASE_CAPSULE_THREADS must be an integer from 1 to ${maximum}`);
  }
  return Number(value);
}
