import { pgTable, varchar, text, jsonb, integer, timestamp } from "drizzle-orm/pg-core";
import { and, eq, desc, lt, inArray } from "drizzle-orm";
import { db } from "../db";
import { randomUUID } from "node:crypto";

export interface ExportArtifact { key: string; size: number; checksum: string; mime: string; filename: string; expiresAt?: string }
// Dedicated definition avoids changing the shared schema while the additive migration is pending.
export const genericExportJobs = pgTable("generic_export_jobs", {
  id: varchar("id").primaryKey(), userId: varchar("user_id").notNull(),
  name: text("name").notNull(), type: text("type").notNull(), format: text("format").notNull(),
  projectId: varchar("project_id"), settings: jsonb("settings").$type<Record<string, any>>().notNull(),
  status: text("status").notNull(), progress: integer("progress").notNull(),
  artifact: jsonb("artifact").$type<ExportArtifact>(), error: text("error"),
  retryCount: integer("retry_count").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});
export type DurableExportJob = typeof genericExportJobs.$inferSelect;
export const exportRepository = {
  async create(input: Pick<DurableExportJob, "userId" | "name" | "type" | "format" | "projectId" | "settings">) {
    const [job] = await db.insert(genericExportJobs).values({
      ...input, id: randomUUID(), status: "queued", progress: 0, retryCount: 0,
      createdAt: new Date(), updatedAt: new Date(),
    }).returning();
    return job;
  },
  async get(id: string, userId: string) {
    const [job] = await db.select().from(genericExportJobs)
      .where(and(eq(genericExportJobs.id, id), eq(genericExportJobs.userId, userId)));
    return job;
  },
  async list(userId: string) {
    return db.select().from(genericExportJobs).where(eq(genericExportJobs.userId, userId))
      .orderBy(desc(genericExportJobs.createdAt)).limit(1000);
  },
  async transition(id: string, from: string[], patch: Partial<DurableExportJob>, userId: string) {
    const [job] = await db.update(genericExportJobs).set({ ...patch, updatedAt: new Date() })
      .where(and(eq(genericExportJobs.id, id), eq(genericExportJobs.userId, userId), inArray(genericExportJobs.status, from))).returning();
    return job;
  },
  async recover(userId: string) {
    // Interrupted render is never declared successful; explicit retry is available.
    await db.update(genericExportJobs).set({
      status: "failed", error: "Export worker interrupted or exceeded 30 minute execution limit", updatedAt: new Date(),
    }).where(and(eq(genericExportJobs.userId, userId), inArray(genericExportJobs.status, ["queued", "processing"]),
      lt(genericExportJobs.updatedAt, new Date(Date.now() - 30 * 60_000))));
  },
};