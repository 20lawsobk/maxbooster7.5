import { z } from "zod";

export const supportMessageSchema = z.object({ message: z.string().trim().min(1).max(10000) });
export const supportTicketCreateSchema = z.object({
  subject: z.string().trim().min(1).max(255),
  description: z.string().trim().max(10000).nullish(),
  category: z.enum(["general", "billing", "technical", "account"]).default("general"),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
});
export const supportTicketUpdateSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  assignedTo: z.string().trim().min(1).max(255).nullable().optional(),
  responseTimeMinutes: z.number().int().min(0).max(2147483647).nullable().optional(),
  satisfactionRating: z.number().int().min(1).max(5).nullable().optional(),
  resolvedAt: z.string().datetime({offset: true}).transform(value => new Date(value)).nullable().optional(),
}).strict().refine(value => Object.keys(value).length > 0, "At least one update is required");
