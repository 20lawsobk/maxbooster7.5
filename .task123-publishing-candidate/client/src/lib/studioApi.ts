// @ts-nocheck
import { apiRequest } from "./queryClient";

export interface CompingGroup {
  id: string;
  projectId: string;
  trackId: string;
  name: string;
  startTime: number;
  endTime: number | null;
  status: "recording" | "editing" | "comped" | "rendered" | "archived";
  takeCount: number;
  color?: string | null;
  activeCompVersionId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompingLane {
  id: string;
  takeGroupId: string;
  name: string;
  audioClipId?: string | null;
  isActive: boolean;
  isMuted: boolean;
  isSolo: boolean;
  volume: number;
  color?: string | null;
  rating?: number | null;
  notes?: string | null;
  laneIndex: number;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompingSegment {
  id: string;
  compVersionId?: string | null;
  takeGroupId: string;
  takeLaneId: string;
  startTime: number;
  endTime: number;
  fadeIn: number;
  fadeOut: number;
  crossfadeType: string;
  gain: number;
  isSelected: boolean;
  order: number;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompingVersion {
  id: string;
  projectId: string;
  trackId: string;
  takeGroupId: string;
  name: string;
  versionNumber: number;
  description?: string | null;
  createdBy?: string | null;
  segments?: CompingSegment[] | null;
  renderedClipId?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CompingLaneWithSegments extends CompingLane {
  segments: CompingSegment[];
}

export interface CompingGroupWithDetails extends CompingGroup {
  lanes: CompingLaneWithSegments[];
  versions: CompingVersion[];
}

export interface CompRenderResult {
  clipId: string;
  audioUrl: string;
  duration: number;
  status: "processing" | "completed" | "failed";
}

export interface StudioMarker {
  id: string;
  projectId: string;
  name: string;
  time: number;
  color?: string | null;
  markerType?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface StemExportConfig {
  format: "wav" | "flac" | "mp3" | "aac";
  sampleRate: number;
  bitDepth: number;
  trackIds?: string[];
  includeEffects: boolean;
  normalizeLevel?: number;
  startBeat?: number;
  endBeat?: number;
}

export interface StemExportStatus {
  id: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  progress: number;
  message?: string;
  files?: string[];
  createdAt: string;
}

export interface WarpMarker {
  id: number;
  clipId: string;
  originalBeat: number;
  warpedBeat: number;
  createdAt: string;
}

export interface MidiNote {
  id: string;
  clipId: string;
  pitch: number;
  velocity: number;
  startBeat: number;
  durationBeats: number;
  channel: number;
}

export interface MidiClip {
  id: string;
  trackId: string;
  name: string;
  startBeat: number;
  durationBeats: number;
  color: string;
  notes: MidiNote[];
  looped: boolean;
  loopLength: number;
}

export const studioApi = {
  comping: {
    async createGroup(
      projectId: string,
      data: {
        trackId: string;
        name: string;
        startTime: number;
        endTime: number;
        color?: string;
        metadata?: Record<string, unknown>;
      },
    ): Promise<CompingGroup> {
      const res = await apiRequest(
        "POST",
        `/api/studio/projects/${projectId}/comping/groups`,
        data,
      );
      return res.json();
    },

    async getGroups(projectId: string): Promise<CompingGroup[]> {
      const res = await fetch(
        `/api/studio/projects/${projectId}/comping/groups`,
        { credentials: "include" },
      );
      if (!res?.ok) throw new Error("Failed to fetch comping groups");
      const data = await res.json();
      return data.takeGroups;
    },

    async getGroup(
      projectId: string,
      groupId: string,
    ): Promise<CompingGroupWithDetails> {
      const res = await fetch(
        `/api/studio/projects/${projectId}/comping/groups/${groupId}`,
        { credentials: "include" },
      );
      if (!res?.ok) throw new Error("Failed to fetch comping group");
      return res.json();
    },

    async updateGroup(
      projectId: string,
      groupId: string,
      data: Partial<
        Pick<
          CompingGroup,
          "name" | "startTime" | "endTime" | "color" | "status" | "metadata"
        >
      >,
    ): Promise<CompingGroup> {
      const res = await apiRequest(
        "PUT",
        `/api/studio/projects/${projectId}/comping/groups/${groupId}`,
        data,
      );
      return res.json();
    },

    async deleteGroup(projectId: string, groupId: string): Promise<void> {
      await apiRequest(
        "DELETE",
        `/api/studio/projects/${projectId}/comping/groups/${groupId}`,
      );
    },

    async duplicateGroup(
      projectId: string,
      groupId: string,
    ): Promise<CompingGroup> {
      const res = await apiRequest(
        "POST",
        `/api/studio/projects/${projectId}/comping/groups/${groupId}/duplicate`,
      );
      return res.json();
    },

    async createLane(
      projectId: string,
      data: {
        takeGroupId: string;
        name: string;
        audioClipId?: string;
        laneIndex?: number;
        volume?: number;
        color?: string;
        rating?: number;
        notes?: string;
        metadata?: Record<string, unknown>;
      },
    ): Promise<CompingLane> {
      const res = await apiRequest(
        "POST",
        `/api/studio/projects/${projectId}/comping/lanes`,
        data,
      );
      return res.json();
    },

    async getLanes(projectId: string, groupId: string): Promise<CompingLane[]> {
      const res = await fetch(
        `/api/studio/projects/${projectId}/comping/groups/${groupId}/lanes`,
        { credentials: "include" },
      );
      if (!res?.ok) throw new Error("Failed to fetch comping lanes");
      const data = await res.json();
      return data.lanes;
    },

    async updateLane(
      projectId: string,
      laneId: string,
      data: Partial<
        Pick<
          CompingLane,
          | "name"
          | "isMuted"
          | "isSolo"
          | "isActive"
          | "volume"
          | "color"
          | "rating"
          | "notes"
          | "audioClipId"
          | "metadata"
        >
      >,
    ): Promise<CompingLane> {
      const res = await apiRequest(
        "PUT",
        `/api/studio/projects/${projectId}/comping/lanes/${laneId}`,
        data,
      );
      return res.json();
    },

    async deleteLane(projectId: string, laneId: string): Promise<void> {
      await apiRequest(
        "DELETE",
        `/api/studio/projects/${projectId}/comping/lanes/${laneId}`,
      );
    },

    async reorderLanes(
      projectId: string,
      groupId: string,
      laneIds: string[],
    ): Promise<void> {
      await apiRequest(
        "PUT",
        `/api/studio/projects/${projectId}/comping/groups/${groupId}/lanes/reorder`,
        { laneIds },
      );
    },

    async createSegment(
      projectId: string,
      data: {
        takeGroupId: string;
        takeLaneId: string;
        compVersionId?: string;
        startTime: number;
        endTime: number;
        fadeIn?: number;
        fadeOut?: number;
        crossfadeType?: string;
        gain?: number;
        isSelected?: boolean;
        order?: number;
        metadata?: Record<string, unknown>;
      },
    ): Promise<CompingSegment> {
      const res = await apiRequest(
        "POST",
        `/api/studio/projects/${projectId}/comping/segments`,
        data,
      );
      return res.json();
    },

    async getSegments(
      projectId: string,
      groupId: string,
    ): Promise<CompingSegment[]> {
      const res = await fetch(
        `/api/studio/projects/${projectId}/comping/groups/${groupId}/segments`,
        { credentials: "include" },
      );
      if (!res?.ok) throw new Error("Failed to fetch comping segments");
      const data = await res.json();
      return data.segments;
    },

    /**
     * Choose which lane covers a given time range for the current comp.
     * The server only removes previously-selected segments that overlap
     * [startTime, endTime) — selections made for other time ranges from
     * other lanes are preserved.
     */
    async selectSegment(
      projectId: string,
      groupId: string,
      data: {
        laneId: string;
        startTime: number;
        endTime: number;
        compVersionId?: string;
      },
    ): Promise<CompingSegment> {
      const res = await apiRequest(
        "POST",
        `/api/studio/projects/${projectId}/comping/groups/${groupId}/select`,
        data,
      );
      return res.json();
    },

    async updateSegment(
      projectId: string,
      segmentId: string,
      data: Partial<
        Pick<
          CompingSegment,
          | "startTime"
          | "endTime"
          | "fadeIn"
          | "fadeOut"
          | "crossfadeType"
          | "gain"
          | "isSelected"
          | "order"
          | "metadata"
        >
      >,
    ): Promise<CompingSegment> {
      const res = await apiRequest(
        "PUT",
        `/api/studio/projects/${projectId}/comping/segments/${segmentId}`,
        data,
      );
      return res.json();
    },

    async deleteSegment(projectId: string, segmentId: string): Promise<void> {
      await apiRequest(
        "DELETE",
        `/api/studio/projects/${projectId}/comping/segments/${segmentId}`,
      );
    },

    async createVersion(
      projectId: string,
      groupId: string,
      data: { name: string; description?: string },
    ): Promise<CompingVersion> {
      const res = await apiRequest(
        "POST",
        `/api/studio/projects/${projectId}/comping/groups/${groupId}/versions`,
        data,
      );
      return res.json();
    },

    async getVersions(
      projectId: string,
      groupId: string,
    ): Promise<{
      versions: CompingVersion[];
      activeVersion: CompingVersion | undefined;
      totalVersions: number;
    }> {
      const res = await fetch(
        `/api/studio/projects/${projectId}/comping/groups/${groupId}/versions`,
        { credentials: "include" },
      );
      if (!res?.ok) throw new Error("Failed to fetch comping versions");
      return res.json();
    },

    async activateVersion(
      projectId: string,
      groupId: string,
      versionId: string,
    ): Promise<void> {
      await apiRequest(
        "PUT",
        `/api/studio/projects/${projectId}/comping/groups/${groupId}/versions/${versionId}/activate`,
      );
    },

    async deleteVersion(projectId: string, versionId: string): Promise<void> {
      await apiRequest(
        "DELETE",
        `/api/studio/projects/${projectId}/comping/versions/${versionId}`,
      );
    },

    async renderComp(
      projectId: string,
      groupId: string,
    ): Promise<CompRenderResult> {
      const res = await apiRequest(
        "POST",
        `/api/studio/projects/${projectId}/comping/render`,
        { groupId },
      );
      return res.json();
    },
  },

  markers: {
    async getMarkers(projectId: string): Promise<StudioMarker[]> {
      const res = await fetch(`/api/studio/projects/${projectId}/markers`, {
        credentials: "include",
      });
      if (!res?.ok) throw new Error("Failed to fetch markers");
      const data = await res.json();
      return data.markers;
    },

    async createMarker(
      projectId: string,
      data: Omit<StudioMarker, "id" | "projectId" | "createdAt">,
    ): Promise<StudioMarker> {
      return (await apiRequest(
        "POST",
        `/api/studio/projects/${projectId}/markers`,
        data,
      )).json();
    },

    async updateMarker(
      markerId: string,
      data: Partial<StudioMarker>,
    ): Promise<StudioMarker> {
      return (await apiRequest("PATCH", `/api/studio/markers/${markerId}`, data)).json();
    },

    async deleteMarker(markerId: string): Promise<void> {
      await apiRequest("DELETE", `/api/studio/markers/${markerId}`);
    },
  },

  stems: {
    async exportStems(
      projectId: number,
      config: StemExportConfig,
    ): Promise<{ exportId: string }> {
      return (await apiRequest(
        "POST",
        `/api/studio/projects/${projectId}/stems/export`,
        config,
      )).json();
    },

    async getExportStatus(
      projectId: number,
      exportId: string,
    ): Promise<StemExportStatus> {
      const res = await fetch(
        `/api/studio/projects/${projectId}/stems/status/${exportId}`,
        { credentials: "include" },
      );
      if (!res?.ok) throw new Error("Failed to fetch export status");
      return res?.json();
    },

    async downloadStems(projectId: number, exportId: string): Promise<Blob> {
      const res = await fetch(
        `/api/studio/projects/${projectId}/stems/download/${exportId}`,
        { credentials: "include" },
      );
      if (!res?.ok) throw new Error("Failed to download stems");
      return res?.blob();
    },

    async listExports(projectId: number): Promise<StemExportStatus[]> {
      const res = await fetch(`/api/studio/projects/${projectId}/stems/list`, {
        credentials: "include",
      });
      if (!res?.ok) throw new Error("Failed to list exports");
      return res?.json();
    },

    async deleteExport(projectId: number, exportId: string): Promise<void> {
      await apiRequest(
        "DELETE",
        `/api/studio/projects/${projectId}/stems/${exportId}`,
      );
    },

    async cancelExport(projectId: number, exportId: string): Promise<void> {
      await apiRequest(
        "POST",
        `/api/studio/projects/${projectId}/stems/${exportId}/cancel`,
      );
    },

    async getSupportedFormats(
      projectId: number,
    ): Promise<{
      formats: string[];
      sampleRates: number[];
      bitDepths: number[];
    }> {
      const res = await fetch(
        `/api/studio/projects/${projectId}/stems/formats`,
        { credentials: "include" },
      );
      if (!res?.ok) throw new Error("Failed to get formats");
      return res?.json();
    },
  },

  midi: {
    async getClips(projectId: number, trackId: string): Promise<MidiClip[]> {
      const res = await fetch(
        `/api/studio/projects/${projectId}/midi/clips?trackId=${trackId}`,
        { credentials: "include" },
      );
      if (!res?.ok) throw new Error("Failed to fetch MIDI clips");
      return res?.json();
    },

    async createClip(
      projectId: number,
      data: Omit<MidiClip, "id" | "notes">,
    ): Promise<MidiClip> {
      return (await apiRequest(
        "POST",
        `/api/studio/projects/${projectId}/midi/clips`,
        data,
      )).json();
    },

    async updateClip(
      projectId: number,
      clipId: string,
      data: Partial<MidiClip>,
    ): Promise<MidiClip> {
      return (await apiRequest(
        "PUT",
        `/api/studio/projects/${projectId}/midi/clips/${clipId}`,
        data,
      )).json();
    },

    async deleteClip(projectId: number, clipId: string): Promise<void> {
      await apiRequest(
        "DELETE",
        `/api/studio/projects/${projectId}/midi/clips/${clipId}`,
      );
    },

    async addNote(
      projectId: number,
      clipId: string,
      note: Omit<MidiNote, "id" | "clipId">,
    ): Promise<MidiNote> {
      return (await apiRequest(
        "POST",
        `/api/studio/projects/${projectId}/midi/clips/${clipId}/notes`,
        note,
      )).json();
    },

    async updateNote(
      projectId: number,
      clipId: string,
      noteId: string,
      data: Partial<MidiNote>,
    ): Promise<MidiNote> {
      return (await apiRequest(
        "PUT",
        `/api/studio/projects/${projectId}/midi/clips/${clipId}/notes/${noteId}`,
        data,
      )).json();
    },

    async deleteNote(
      projectId: number,
      clipId: string,
      noteId: string,
    ): Promise<void> {
      await apiRequest(
        "DELETE",
        `/api/studio/projects/${projectId}/midi/clips/${clipId}/notes/${noteId}`,
      );
    },

    async quantizeNotes(
      projectId: number,
      clipId: string,
      options: { value: number; strength: number; selectedOnly?: boolean },
    ): Promise<void> {
      await apiRequest(
        "POST",
        `/api/studio/projects/${projectId}/midi/clips/${clipId}/quantize`,
        options,
      );
    },
  },

  warping: {
    async getWarpMarkers(
      _projectId: number,
      clipId: string,
    ): Promise<WarpMarker[]> {
      const res = await fetch(
        `/api/studio/warping/clips/${clipId}/warp/markers`,
        { credentials: "include" },
      );
      if (!res?.ok) throw new Error("Failed to fetch warp markers");
      const data = await res.json();
      return Array.isArray(data) ? data : (data?.markers ?? []);
    },

    async addWarpMarker(
      _projectId: number,
      clipId: string,
      data: { originalBeat: number; warpedBeat: number },
    ): Promise<WarpMarker> {
      return apiRequest(
        "POST",
        `/api/studio/warping/clips/${clipId}/warp/markers`,
        data,
      );
    },

    async updateWarpMarker(
      clipId: string,
      markerId: number | string,
      data: Partial<WarpMarker>,
    ): Promise<WarpMarker> {
      return apiRequest(
        "PUT",
        `/api/studio/warping/clips/${clipId}/warp/markers/${markerId}`,
        data,
      );
    },

    async deleteWarpMarker(
      clipId: string,
      markerId: number | string,
    ): Promise<void> {
      await apiRequest(
        "DELETE",
        `/api/studio/warping/clips/${clipId}/warp/markers/${markerId}`,
      );
    },

    async analyzeClipTempo(
      _projectId: number,
      clipId: string,
    ): Promise<{
      clipId: string;
      originalDuration: number;
      currentDuration: number;
      timeStretch: number;
      pitchShift: number;
      preserveFormants: boolean;
      markerCount: number;
      markers: Array<Record<string, unknown>>;
    }> {
      return apiRequest(
        "GET",
        `/api/studio/warping/clips/${clipId}/warp/tempo`,
      );
    },
  },
};
