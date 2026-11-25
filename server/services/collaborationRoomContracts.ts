import { z } from "zod";

export const openRoomRequestSchema = z.object({}).strict();

export const collaborationRoomMessageRequestSchema = z.object({
  clientMessageId: z.string().uuid(),
  content: z.string().trim().min(1).max(4_000),
}).strict();

