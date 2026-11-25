import { z } from "zod";

export const onboardingUpdateSchema = z.object({
  step: z.number().int().nonnegative().optional(),
  completed: z.boolean().optional(),
  hasCompletedOnboarding: z.boolean().optional(),
  onboardingData: z.record(z.string(), z.unknown()).optional(),
});
