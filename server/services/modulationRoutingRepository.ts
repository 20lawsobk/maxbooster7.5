import { db } from "../db";
import { projects, studioTracks } from "@shared/schema";
import { and, eq } from "drizzle-orm";

type Routing = { id: string; [key: string]: unknown };
type Config = { routings: Routing[]; updatedAt: string };
type Metadata = Record<string, unknown> & { modulationRoutingV1?: Record<string, Config> };

/** Existing project metadata is the durable owner; serialize mutations on that row.
 * JSON-string tuple keys distinguish project-wide from track scopes without collisions.
 */
export async function modulationRouting(
  userId: string, projectId: string, trackId?: string,
  mutation?: { replace: Routing[] } | { remove: string },
): Promise<Routing[]> {
  return db.transaction(async (tx) => {
    const [project] = await tx.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId))).for("update");
    if (!project) throw new Error("Project not found");
    if (trackId) {
      const [track] = await tx.select({ id: studioTracks.id }).from(studioTracks)
        .where(and(eq(studioTracks.id, trackId), eq(studioTracks.projectId, projectId)));
      if (!track) throw new Error("Track not found in project");
    }
    const metadata = (project.metadata ?? {}) as Metadata;
    const scopes = { ...metadata.modulationRoutingV1 };
    const key = JSON.stringify(trackId ? ["track", trackId] : ["project"]);
    const previous = scopes[key]?.routings ?? [];
    const routings = !mutation ? previous : "replace" in mutation
      ? mutation.replace : previous.filter((routing) => routing.id !== mutation.remove);
    if (mutation) {
      scopes[key] = { routings, updatedAt: new Date().toISOString() };
      await tx.update(projects).set({
        metadata: { ...metadata, modulationRoutingV1: scopes }, updatedAt: new Date(),
      }).where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    }
    return routings;
  });
}