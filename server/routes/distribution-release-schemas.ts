import { z } from "zod";

export const createReleaseSchema = z.object({
  title: z.string().min(1),
  artistName: z.string().min(1),
  releaseType: z.enum(["single", "EP", "album"]),
  primaryGenre: z.string().min(1),
  secondaryGenre: z.string().optional(),
  language: z.string().min(1),
  labelName: z.string().optional(),
  copyrightYear: z.number().int().min(1900),
  copyrightOwner: z.string().min(1),
  publishingRights: z.string().optional(),
  isExplicit: z.boolean().default(false),
  moodTags: z.array(z.string()).optional(),
  releaseDate: z.string().optional(),
  territoryMode: z
    .enum(["worldwide", "include", "exclude"])
    .default("worldwide"),
  territories: z.array(z.string()).optional(),
  selectedPlatforms: z.array(z.string()).optional(),
  artworkAiUsage: z.enum(["none", "ai-generated"]).optional(),
  audioAiUsage: z.enum(["none", "ai-assisted"]).optional(),
  compositionAiUsage: z.enum(["none", "ai-assisted"]).optional(),
  composerName: z.string().max(120).optional(),
  acceptTerms: z.boolean().optional(),
  confirmRights: z.boolean().optional(),
  confirmYoutubeRights: z.boolean().optional(),
  royaltySplits: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        email: z.string().trim().email().max(254),
        role: z.enum([
          "songwriter",
          "producer",
          "performer",
          "manager",
          "featured_artist",
        ]),
        percentage: z.number().finite().gt(0).max(100),
      }),
    )
    .max(50)
    .superRefine((splits, context) => {
      const total = splits.reduce((sum, split) => sum + split.percentage, 0);
      if (splits.length > 0 && Math.abs(total - 100) > 0.01) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Royalty split percentages must total 100% (received ${total.toFixed(2)}%).`,
        });
      }

      const emails = new Set<string>();
      splits.forEach((split, index) => {
        const email = split.email.toLowerCase();
        if (emails.has(email)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, "email"],
            message: "Each collaborator email may only appear once.",
          });
        }
        emails.add(email);
      });
    })
    .optional(),
});

export const updateReleaseSchema = createReleaseSchema.partial();
export const createReleaseDraftSchema = createReleaseSchema.partial().extend({
  title: z.string().trim().min(1).max(200),
});