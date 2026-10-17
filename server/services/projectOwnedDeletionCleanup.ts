import { and, eq, inArray } from "drizzle-orm";
import {
  projects, studioTracks, audioClips, midiClips, midiNotes, markers,
  pluginInstances, warpMarkers, takeGroups, takeLanes, takeSegments,
  compVersions, stemExports, studioRecentFiles, projectRoyaltySplits,
} from "@shared/schema";
import type { Database } from "../db.js";

type ProjectDeletionTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Caller must hold the owned canonical projects row FOR UPDATE and have checked
 * its expectedUpdatedAt, on this same transaction. Never opens/commits a separate
 * transaction: queued mutations must commit cleanup and their receipt together.
 * This is the documented DAW graph, not a business/history or file-store cascade.
 */
export async function deleteLockedOwnedProject(
  tx: ProjectDeletionTransaction,
  projectId: string,
  userId: string,
): Promise<void> {
  const projectMidiClips = tx.select({ id: midiClips.id }).from(midiClips)
    .where(eq(midiClips.projectId, projectId));
  const projectAudioClips = tx.select({ id: audioClips.id }).from(audioClips)
    .where(eq(audioClips.projectId, projectId));
  const projectTakeGroups = tx.select({ id: takeGroups.id }).from(takeGroups)
    .where(eq(takeGroups.projectId, projectId));
  await tx.delete(midiNotes).where(inArray(midiNotes.clipId, projectMidiClips));
  await tx.delete(warpMarkers).where(inArray(warpMarkers.clipId, projectAudioClips));
  await tx.delete(takeSegments).where(inArray(takeSegments.takeGroupId, projectTakeGroups));
  await tx.delete(takeLanes).where(inArray(takeLanes.takeGroupId, projectTakeGroups));
  await tx.delete(compVersions).where(eq(compVersions.projectId, projectId));
  await tx.delete(takeGroups).where(eq(takeGroups.projectId, projectId));
  await tx.delete(midiClips).where(eq(midiClips.projectId, projectId));
  await tx.delete(audioClips).where(eq(audioClips.projectId, projectId));
  await tx.delete(markers).where(eq(markers.projectId, projectId));
  await tx.delete(pluginInstances).where(eq(pluginInstances.projectId, projectId));
  await tx.delete(stemExports).where(eq(stemExports.projectId, projectId));
  await tx.delete(studioRecentFiles).where(eq(studioRecentFiles.projectId, projectId));
  await tx.delete(studioTracks).where(eq(studioTracks.projectId, projectId));
  await tx.delete(projectRoyaltySplits).where(eq(projectRoyaltySplits.projectId, projectId));
  const [deleted] = await tx.delete(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .returning({ id: projects.id });
  if (!deleted) throw new Error("Locked project was not deleted");
}
