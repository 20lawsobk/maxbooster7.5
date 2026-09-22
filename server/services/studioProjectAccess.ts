import { db } from "../db";
import { projects, studioProjects, projectMembers, collaborationProjects } from "@shared/schema";
import { and, eq } from "drizzle-orm";

export interface StudioProjectAccess { read: boolean; write: boolean }

/** Same project families as studio/collaboration REST; public visibility is not edit permission. */
export async function getStudioProjectAccess(userId: string, projectId: string): Promise<StudioProjectAccess> {
  const studio = await db.query.studioProjects.findFirst({ where: eq(studioProjects.id, projectId) });
  const project = studio ?? await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  const collaboration = project ? undefined : await db.query.collaborationProjects.findFirst({
    where: eq(collaborationProjects.id, projectId),
  });
  if (!project && !collaboration) return { read: false, write: false };
  if ((project?.userId ?? collaboration?.ownerId) === userId) return { read: true, write: true };
  const member = await db.query.projectMembers.findFirst({
    where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId), eq(projectMembers.status, "active")),
  });
  return {
    read: !!member,
    write: !!member && ["owner", "admin", "editor", "member"].includes(member.role ?? ""),
  };
}