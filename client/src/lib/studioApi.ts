import { apiRequest } from "./queryClient";

export interface CompingGroup {
  id: number;
  projectId: number;
  trackId: string;
  name: string;
  activeVersionId?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CompingLane {
  id: number;
  groupId: number;
  name: string;
  order: number;
  muted: boolean;
  color: string;
  createdAt: string;
}

export interface CompingSegment {
  id: number;
  laneId: number;
  startBeat: number;
  endBeat: number;
  active: boolean;
  gain: number;
  fadeIn: number;
  fadeOut: number;
  createdAt: string;
}

export interface CompingVersion {
  id: number;
  groupId: number;
  name: string;
  segmentData: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
}

export interface StudioMarker {
  id: number;
  projectId: number;
  name: string;
  position: number;
  color: string;
  type: "marker" | "region" | "loop" | "punch";
  endPosition?: number;
  notes?: string;
  createdAt: string;
}

export interface StemExportConfig {
  format: "wav" | "flac" | "aiff" | "mp3";
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

export const _studioApi = {
  comping: {
    async createGroup(
      projectId: number,
      data: { trackId: string; name: string },
    ): Promise<CompingGroup> {
      return apiRequest(
        "POST",
        `/api/studio/projects/${projectId}/comping/groups`,
        data,
      );
    },

    async getGroups(projectId: number): Promise<CompingGroup[]> {
      const _res = await fetch(
        `/api/studio/projects/${projectId}/comping/groups`,
        { credentials: "include" },
      );
      if (!res?.ok) throw new Error("Failed to fetch comping groups");
      return res?.json();
    },

    async getGroup(projectId: number, groupId: number): Promise<CompingGroup> {
      const _res = await fetch(
        `/api/studio/projects/${projectId}/comping/groups/${groupId}`,
        { credentials: "include" },
      );
      if (!res?.ok) throw new Error("Failed to fetch comping group");
      return res?.json();
    },

    async updateGroup(
      projectId: number,
      groupId: number,
      data: Partial<CompingGroup>,
    ): Promise<CompingGroup> {
      return apiRequest(
        "PUT",
        `/api/studio/projects/${projectId}/comping/groups/${groupId}`,
        data,
      );
    },

    async deleteGroup(projectId: number, groupId: number): Promise<void> {
      await apiRequest(
        "DELETE",
        `/api/studio/projects/${projectId}/comping/groups/${groupId}`,
      );
    },

    async duplicateGroup(
      projectId: number,
      groupId: number,
    ): Promise<CompingGroup> {
      return apiRequest(
        "POST",
        `/api/studio/projects/${projectId}/comping/groups/${groupId}/duplicate`,
      );
    },

    async createLane(
      projectId: number,
      data: { groupId: number; name: string; color?: string },
    ): Promise<CompingLane> {
      return apiRequest(
        "POST",
        `/api/studio/projects/${projectId}/comping/lanes`,
        data,
      );
    },

    async getLanes(projectId: number, groupId: number): Promise<CompingLane[]> {
      const _res = await fetch(
        `/api/studio/projects/${projectId}/comping/groups/${groupId}/lanes`,
        { credentials: "include" },
      );
      if (!res?.ok) throw new Error("Failed to fetch comping lanes");
      return res?.json();
    },

    async updateLane(
      projectId: number,
      laneId: number,
      data: Partial<CompingLane>,
    ): Promise<CompingLane> {
      return apiRequest(
        "PUT",
        `/api/studio/projects/${projectId}/comping/lanes/${laneId}`,
        data,
      );
    },

    async deleteLane(projectId: number, laneId: number): Promise<void> {
      await apiRequest(
        "DELETE",
        `/api/studio/projects/${projectId}/comping/lanes/${laneId}`,
      );
    },

    async reorderLanes(
      projectId: number,
      groupId: number,
      laneIds: number[],
    ): Promise<void> {
      await apiRequest(
        "PUT",
        `/api/studio/projects/${projectId}/comping/groups/${groupId}/lanes/reorder`,
        { laneIds },
      );
    },

    async createSegment(
      projectId: number,
      data: { laneId: number; startBeat: number; endBeat: number },
    ): Promise<CompingSegment> {
      return apiRequest(
        "POST",
        `/api/studio/projects/${projectId}/comping/segments`,
        data,
      );
    },

    async getSegments(
      projectId: number,
      groupId: number,
    ): Promise<CompingSegment[]> {
      const _res = await fetch(
        `/api/studio/projects/${projectId}/comping/groups/${groupId}/segments`,
        { credentials: "include" },
      );
      if (!res?.ok) throw new Error("Failed to fetch comping segments");
      return res?.json();
    },

    async updateSegment(
      projectId: number,
      segmentId: number,
      data: Partial<CompingSegment>,
    ): Promise<CompingSegment> {
      return apiRequest(
        "PUT",
        `/api/studio/projects/${projectId}/comping/segments/${segmentId}`,
        data,
      );
    },

    async deleteSegment(projectId: number, segmentId: number): Promise<void> {
      await apiRequest(
        "DELETE",
        `/api/studio/projects/${projectId}/comping/segments/${segmentId}`,
      );
    },

    async createVersion(
      projectId: number,
      groupId: number,
      name: string,
    ): Promise<CompingVersion> {
      return apiRequest(
        "POST",
        `/api/studio/projects/${projectId}/comping/groups/${groupId}/versions`,
        { name },
      );
    },

    async getVersions(
      projectId: number,
      groupId: number,
    ): Promise<CompingVersion[]> {
      const _res = await fetch(
        `/api/studio/projects/${projectId}/comping/groups/${groupId}/versions`,
        { credentials: "include" },
      );
      if (!res?.ok) throw new Error("Failed to fetch comping versions");
      return res?.json();
    },

    async activateVersion(
      projectId: number,
      groupId: number,
      versionId: number,
    ): Promise<void> {
      await apiRequest(
        "PUT",
        `/api/studio/projects/${projectId}/comping/groups/${groupId}/versions/${versionId}/activate`,
      );
    },

    async deleteVersion(projectId: number, versionId: number): Promise<void> {
      await apiRequest(
        "DELETE",
        `/api/studio/projects/${projectId}/comping/versions/${versionId}`,
      );
    },

    async renderComp(
      projectId: number,
      groupId: number,
    ): Promise<{ audioUrl: string }> {
      return apiRequest(
        "POST",
        `/api/studio/projects/${projectId}/comping/render`,
        { groupId },
      );
    },
  },

  markers: {
    async getMarkers(projectId: number): Promise<StudioMarker[]> {
      const _res = await fetch(`/api/studio/projects/${projectId}/markers`, {
        credentials: "include",
      });
      if (!res?.ok) throw new Error("Failed to fetch markers");
      return res?.json();
    },

    async createMarker(
      projectId: number,
      data: Omit<StudioMarker, "id" | "projectId" | "createdAt">,
    ): Promise<StudioMarker> {
      return apiRequest(
        "POST",
        `/api/studio/projects/${projectId}/markers`,
        data,
      );
    },

    async updateMarker(
      markerId: number,
      data: Partial<StudioMarker>,
    ): Promise<StudioMarker> {
      return apiRequest("PATCH", `/api/studio/markers/${markerId}`, data);
    },

    async deleteMarker(markerId: number): Promise<void> {
      await apiRequest("DELETE", `/api/studio/markers/${markerId}`);
    },
  },

  stems: {
    async exportStems(
      projectId: number,
      config: StemExportConfig,
    ): Promise<{ exportId: string }> {
      return apiRequest(
        "POST",
        `/api/studio/projects/${projectId}/stems/export`,
        config,
      );
    },

    async getExportStatus(
      projectId: number,
      exportId: string,
    ): Promise<StemExportStatus> {
      const _res = await fetch(
        `/api/studio/projects/${projectId}/stems/status/${exportId}`,
        { credentials: "include" },
      );
      if (!res?.ok) throw new Error("Failed to fetch export status");
      return res?.json();
    },

    async downloadStems(projectId: number, exportId: string): Promise<Blob> {
      const _res = await fetch(
        `/api/studio/projects/${projectId}/stems/download/${exportId}`,
        { credentials: "include" },
      );
      if (!res?.ok) throw new Error("Failed to download stems");
      return res?.blob();
    },

    async listExports(projectId: number): Promise<StemExportStatus[]> {
      const _res = await fetch(`/api/studio/projects/${projectId}/stems/list`, {
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

    async getSupportedFormats(projectId: number): Promise<{
      formats: string[];
      sampleRates: number[];
      bitDepths: number[];
    }> {
      const _res = await fetch(
        `/api/studio/projects/${projectId}/stems/formats`,
        { credentials: "include" },
      );
      if (!res?.ok) throw new Error("Failed to get formats");
      return res?.json();
    },
  },

  midi: {
    async getClips(projectId: number, trackId: string): Promise<MidiClip[]> {
      const _res = await fetch(
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
      return apiRequest(
        "POST",
        `/api/studio/projects/${projectId}/midi/clips`,
        data,
      );
    },

    async updateClip(
      projectId: number,
      clipId: string,
      data: Partial<MidiClip>,
    ): Promise<MidiClip> {
      return apiRequest(
        "PUT",
        `/api/studio/projects/${projectId}/midi/clips/${clipId}`,
        data,
      );
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
      return apiRequest(
        "POST",
        `/api/studio/projects/${projectId}/midi/clips/${clipId}/notes`,
        note,
      );
    },

    async updateNote(
      projectId: number,
      clipId: string,
      noteId: string,
      data: Partial<MidiNote>,
    ): Promise<MidiNote> {
      return apiRequest(
        "PUT",
        `/api/studio/projects/${projectId}/midi/clips/${clipId}/notes/${noteId}`,
        data,
      );
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
      projectId: number,
      clipId: string,
    ): Promise<WarpMarker[]> {
      const _res = await fetch(
        `/api/studio/projects/${projectId}/warping/clips/${clipId}/markers`,
        { credentials: "include" },
      );
      if (!res?.ok) throw new Error("Failed to fetch warp markers");
      return res?.json();
    },

    async addWarpMarker(
      projectId: number,
      clipId: string,
      data: { originalBeat: number; warpedBeat: number },
    ): Promise<WarpMarker> {
      return apiRequest(
        "POST",
        `/api/studio/projects/${projectId}/warping/clips/${clipId}/markers`,
        data,
      );
    },

    async updateWarpMarker(
      projectId: number,
      markerId: number,
      data: Partial<WarpMarker>,
    ): Promise<WarpMarker> {
      return apiRequest(
        "PUT",
        `/api/studio/projects/${projectId}/warping/markers/${markerId}`,
        data,
      );
    },

    async deleteWarpMarker(projectId: number, markerId: number): Promise<void> {
      await apiRequest(
        "DELETE",
        `/api/studio/projects/${projectId}/warping/markers/${markerId}`,
      );
    },

    async analyzeClipTempo(
      projectId: number,
      clipId: string,
    ): Promise<{ tempo: number; confidence: number; beats: number[] }> {
      return apiRequest(
        "POST",
        `/api/studio/projects/${projectId}/warping/clips/${clipId}/analyze`,
      );
    },
  },
};
