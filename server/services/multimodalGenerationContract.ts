import { AIUnavailableError } from "../lib/aiSource.js";
import type {
  GeneratedAsset,
  TaskPlan,
  TaskStep,
} from "@shared/types/multimodalGeneration.js";

function invalidOutput(step: TaskStep): never {
  throw new AIUnavailableError(`multimodal ${step.worker} output validation`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/**
 * Validate one worker's complete response before it can enter the package.
 * Slot-based steps must return exactly one non-empty asset for each requested
 * slot; accepting a subset would make a pack look complete when it is not.
 */
export function validateStepAssets(
  step: TaskStep,
  output: unknown,
): GeneratedAsset[] {
  if (!Array.isArray(output) || output.length === 0) invalidOutput(step);

  const params = isRecord(step.params) ? step.params : {};
  const rawSlots = Array.isArray(params.slots) ? params.slots : null;
  if (rawSlots && rawSlots.length === 0) invalidOutput(step);
  const expectedSlots = rawSlots
    ? rawSlots.map((slot) => {
        if (!isRecord(slot) || typeof slot.id !== "string" || !slot.id.trim()) {
          invalidOutput(step);
        }
        return {
          id: slot.id,
          platform: typeof slot.platform === "string" ? slot.platform : undefined,
        };
      })
    : typeof params.slotId === "string" && params.slotId.trim()
      ? [
          {
            id: params.slotId,
            platform:
              typeof params.platform === "string" ? params.platform : undefined,
          },
        ]
      : [];

  if (
    expectedSlots.length === 0 &&
    (typeof params.platform !== "string" || !params.platform.trim())
  ) {
    invalidOutput(step);
  }
  if (new Set(expectedSlots.map((slot) => slot.id)).size !== expectedSlots.length) {
    invalidOutput(step);
  }

  const expectedById = new Map(expectedSlots.map((slot) => [slot.id, slot]));
  const seenAssetIds = new Set<string>();
  const seenSlotIds = new Set<string>();
  const assets: GeneratedAsset[] = [];

  for (const candidate of output) {
    if (
      !isRecord(candidate) ||
      typeof candidate.id !== "string" ||
      !candidate.id.trim() ||
      typeof candidate.payload !== "string" ||
      !candidate.payload.trim() ||
      candidate.modality !== step.worker ||
      seenAssetIds.has(candidate.id)
    ) {
      invalidOutput(step);
    }
    seenAssetIds.add(candidate.id);

    if (expectedSlots.length > 0) {
      if (
        typeof candidate.slotId !== "string" ||
        !expectedById.has(candidate.slotId) ||
        seenSlotIds.has(candidate.slotId)
      ) {
        invalidOutput(step);
      }
      const expected = expectedById.get(candidate.slotId)!;
      if (
        expected.platform &&
        candidate.platform !== expected.platform
      ) {
        invalidOutput(step);
      }
      seenSlotIds.add(candidate.slotId);
    } else if (
      typeof params.platform === "string" &&
      candidate.platform !== params.platform
    ) {
      invalidOutput(step);
    }

    assets.push(candidate as unknown as GeneratedAsset);
  }

  if (
    expectedSlots.length > 0 &&
    (assets.length !== expectedSlots.length ||
      seenSlotIds.size !== expectedSlots.length)
  ) {
    invalidOutput(step);
  }

  return assets;
}

/** Ensure no planned worker was omitted or left with an empty result. */
export function validatePlanAssets(
  plan: TaskPlan,
  outputs: ReadonlyMap<string, GeneratedAsset[]>,
): GeneratedAsset[] {
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
    throw new AIUnavailableError("multimodal generation plan");
  }

  const stepIds = new Set<string>();
  const assets: GeneratedAsset[] = [];

  for (const step of plan.steps) {
    if (!step.id || stepIds.has(step.id)) {
      throw new AIUnavailableError("multimodal generation plan");
    }
    stepIds.add(step.id);

    const stepAssets = outputs.get(step.id);
    if (!stepAssets?.length) {
      throw new AIUnavailableError("multimodal generation plan");
    }
    assets.push(...stepAssets);
  }

  if (assets.length === 0) {
    throw new AIUnavailableError("multimodal generation");
  }

  return assets;
}