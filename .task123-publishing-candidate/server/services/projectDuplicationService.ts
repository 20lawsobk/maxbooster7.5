import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db.js";
import {
  projects,
  studioTracks,
  audioClips,
  markers,
  pluginInstances,
  type Project,
} from "@shared/schema";
import { logger } from "../logger.js";

export class ProjectNotFoundError extends Error {
  constructor(projectId: string) {
    super(`Project ${projectId} not found or not owned by this user`);
    this.name = "ProjectNotFoundError";
  }
}

function newId(): string {
  return randomBytes(8).toString("hex");
}

export interface DuplicateProjectOverrides {
  title?: string;
  description?: string;
}

/**
 * Deep-copies a project and its DAW child data (tracks, audio clips, plugin
 * instances, timeline markers) into a brand-new project row owned by the
 * same user. Runs as a single DB transaction so a duplicate is either
 * created in full or not at all.
 *
 * Scope note: warp markers and take-comping tables are intentionally NOT
 * copied yet — those subsystems are being rebuilt from a non-functional
 * state on a different schema. This cascade must be extended to include
 * them once that work lands, or duplicated projects will silently lose
 * warp/comp data.
 */
export async function duplicateProject(
  sourceProjectId: string,
  userId: string,
  overrides: DuplicateProjectOverrides = {},
): Promise<Project> {
  const [source] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, sourceProjectId), eq(projects.userId, userId)));

  if (!source) {
    throw new ProjectNotFoundError(sourceProjectId);
  }

  const newProjectId = newId();

  return db.transaction(async (tx) => {
    const [newProject] = await tx
      .insert(projects)
      .values({
        id: newProjectId,
        userId,
        title: overrides.title?.trim() || `${source.title} (Copy)`,
        description:
          overrides.description !== undefined
            ? overrides.description || null
            : source.description,
        genre: source.genre,
        bpm: source.bpm,
        key: source.key,
        status: source.status,
        workflowStage: source.workflowStage,
        isStudioProject: source.isStudioProject,
        metadata: source.metadata,
        favorite: false,
        lastOpenedAt: null,
        coverImageUrl: source.coverImageUrl,
        audioUrl: source.audioUrl,
        fileSize: source.fileSize,
        duration: source.duration,
        tags: source.tags,
        timeSignature: source.timeSignature,
        sampleRate: source.sampleRate,
        bitDepth: source.bitDepth,
      })
      .returning();

    // ---- Tracks (need the old->new id map before copying their children) ----
    const sourceTracks = await tx
      .select()
      .from(studioTracks)
      .where(eq(studioTracks.projectId, sourceProjectId));

    const trackIdMap = new Map<string, string>();
    for (const track of sourceTracks) {
      const newTrackId = newId();
      trackIdMap.set(track.id, newTrackId);
      await tx.insert(studioTracks).values({
        id: newTrackId,
        projectId: newProjectId,
        name: track.name,
        trackType: track.trackType,
        color: track.color,
        volume: track.volume,
        pan: track.pan,
        isMuted: track.isMuted,
        isSolo: track.isSolo,
        isArmed: track.isArmed,
        inputSource: track.inputSource,
        outputBus: track.outputBus,
        order: track.order,
        metadata: track.metadata,
      });
    }

    // ---- Audio clips ----
    const sourceClips = await tx
      .select()
      .from(audioClips)
      .where(eq(audioClips.projectId, sourceProjectId));

    for (const clip of sourceClips) {
      await tx.insert(audioClips).values({
        id: newId(),
        projectId: newProjectId,
        trackId: clip.trackId ? (trackIdMap.get(clip.trackId) ?? null) : null,
        name: clip.name,
        audioUrl: clip.audioUrl,
        startTime: clip.startTime,
        duration: clip.duration,
        fadeIn: clip.fadeIn,
        fadeOut: clip.fadeOut,
        gain: clip.gain,
        warpMode: clip.warpMode,
        warpSettings: clip.warpSettings,
        metadata: clip.metadata,
      });
    }

    // ---- Timeline markers ----
    const sourceMarkers = await tx
      .select()
      .from(markers)
      .where(eq(markers.projectId, sourceProjectId));

    for (const marker of sourceMarkers) {
      await tx.insert(markers).values({
        id: newId(),
        projectId: newProjectId,
        name: marker.name,
        time: marker.time,
        color: marker.color,
        markerType: marker.markerType,
        metadata: marker.metadata,
      });
    }

    // ---- Plugin instances ----
    const sourcePlugins = await tx
      .select()
      .from(pluginInstances)
      .where(eq(pluginInstances.projectId, sourceProjectId));

    for (const plugin of sourcePlugins) {
      await tx.insert(pluginInstances).values({
        id: newId(),
        projectId: newProjectId,
        trackId: plugin.trackId
          ? (trackIdMap.get(plugin.trackId) ?? null)
          : null,
        pluginId: plugin.pluginId,
        name: plugin.name,
        position: plugin.position,
        parameters: plugin.parameters,
        presetId: plugin.presetId,
        isBypassed: plugin.isBypassed,
      });
    }

    logger.info(
      `[Studio] Duplicated project ${sourceProjectId} -> ${newProjectId}: ` +
        `${sourceTracks.length} track(s), ${sourceClips.length} clip(s), ` +
        `${sourceMarkers.length} marker(s), ${sourcePlugins.length} plugin instance(s)`,
    );

    return newProject;
  });
}
