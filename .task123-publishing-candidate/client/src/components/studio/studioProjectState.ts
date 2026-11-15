interface RelationalTrack {
  id: string;
  name?: string;
  type?: string;
  trackType?: string;
  color?: string;
  volume?: number;
  pan?: number;
  muted?: boolean;
  isMuted?: boolean;
  solo?: boolean;
  isSolo?: boolean;
  isArmed?: boolean;
}

interface RelationalClip {
  id: string;
  trackId: string;
  name?: string;
  filePath?: string;
  audioUrl?: string;
  startTime?: number;
  duration?: number | null;
  offset?: number;
  gain?: number;
  fadeIn?: number;
  fadeOut?: number;
}

interface SerializedTrack {
  id: string;
  name: string;
  type: string;
  color: string;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  armed: boolean;
  frozen: boolean;
  height: number;
  collapsed: boolean;
  inputSource?: string;
  outputTarget: string;
  plugins: unknown[];
  sends: unknown[];
  audioClips: Array<Record<string, unknown>>;
  midiClips: unknown[];
  automationLanes: unknown[];
}

export interface RelationalTrackData {
  tracks?: RelationalTrack[];
  clips?: RelationalClip[];
}

export function mergeRelationalTracksIntoDawState<T extends { tracks: SerializedTrack[] }>(
  dawState: T,
  data: RelationalTrackData,
): T {
  const tracks = dawState.tracks.map((track) => ({
    ...track,
    audioClips: [...(track.audioClips || [])],
  }));
  const trackById = new Map(tracks.map((track) => [track.id, track]));
  const relationalTracks = data.tracks || [];

  for (const backendTrack of relationalTracks) {
    if (!backendTrack?.id || trackById.has(backendTrack.id)) continue;

    const track: SerializedTrack = {
      id: backendTrack.id,
      name: backendTrack.name || "Audio Track",
      type: backendTrack.trackType || backendTrack.type || "audio",
      color: backendTrack.color || "#3b82f6",
      volume: backendTrack.volume ?? 1,
      pan: backendTrack.pan ?? 0,
      muted: backendTrack.muted ?? backendTrack.isMuted ?? false,
      solo: backendTrack.solo ?? backendTrack.isSolo ?? false,
      armed: backendTrack.isArmed ?? false,
      frozen: false,
      height: 80,
      collapsed: false,
      inputSource: undefined,
      outputTarget: "master",
      plugins: [],
      sends: [],
      audioClips: [],
      midiClips: [],
      automationLanes: [],
    };
    tracks.push(track);
    trackById.set(track.id, track);
  }

  const knownClipIds = new Set(
    tracks.flatMap((track) => track.audioClips.map((clip) => clip.id)),
  );
  for (const clip of data.clips || []) {
    if (!clip?.id || !clip.trackId || knownClipIds.has(clip.id)) continue;
    const track = trackById.get(clip.trackId);
    const sourceUrl = clip.audioUrl || clip.filePath;
    if (!track || !sourceUrl) continue;

    track.audioClips.push({
      id: clip.id,
      trackId: track.id,
      name: clip.name || "Audio Clip",
      startTime: clip.startTime ?? 0,
      duration: clip.duration ?? 0,
      offset: clip.offset ?? 0,
      gain: clip.gain ?? 1,
      fadeIn: clip.fadeIn ?? 0,
      fadeOut: clip.fadeOut ?? 0,
      color: track.color,
      sourceUrl,
      muted: false,
      locked: false,
    });
    knownClipIds.add(clip.id);
  }

  return { ...dawState, tracks } as T;
}