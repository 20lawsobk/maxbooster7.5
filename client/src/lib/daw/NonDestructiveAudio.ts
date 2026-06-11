import { logger } from "../logger";
export interface AudioSource {
  id: string;
  path: string;
  name: string;
  sampleRate: number;
  channels: number;
  duration: number;
  bitDepth: number;
  waveformData?: Float32Array;
  peakData?: { min: number; max: number }[];
}

export interface FadeSettings {
  enabled: boolean;
  duration: number;
  curve: "linear" | "exponential" | "logarithmic" | "s-curve" | "equal-power";
}

export interface TimeStretchSettings {
  enabled: boolean;
  ratio: number;
  algorithm: "realtime" | "elastique" | "paulstretch" | "soundtouch";
  preserveFormants: boolean;
}

export interface PitchShiftSettings {
  enabled: boolean;
  semitones: number;
  cents: number;
  algorithm: "realtime" | "elastique" | "rubberband";
  preserveFormants: boolean;
}

export interface AudioEvent {
  id: string;
  trackId: string;
  sourceId: string;
  name: string;
  startBeat: number;
  durationBeats: number;
  sourceStartOffset: number;
  sourceEndOffset: number;
  gain: number;
  fadeIn: FadeSettings;
  fadeOut: FadeSettings;
  timeStretch: TimeStretchSettings;
  pitchShift: PitchShiftSettings;
  reversed: boolean;
  muted: boolean;
  locked: boolean;
  color: string;
}

export interface AudioClipboard {
  events: AudioEvent[];
  sourceBeat: number;
}

export interface NonDestructiveAudioState {
  sources: AudioSource[];
  events: AudioEvent[];
  clipboard: AudioClipboard | null;
  selectedEventIds: string[];
  previewSourceId: string | null;
  isPreviewPlaying: boolean;
}

export class NonDestructiveAudioEngine {
  private state: NonDestructiveAudioState;
  private listeners: Set<() => void> = new Set();
  private audioContext: AudioContext | null = null;
  private previewBuffers: Map<string, AudioBuffer> = new Map();

  constructor() {
    this.state = {
      sources: [],
      events: [],
      clipboard: null,
      selectedEventIds: [],
      previewSourceId: null,
      isPreviewPlaying: false,
    };
  }

  setAudioContext(ctx: AudioContext): void {
    this.audioContext = ctx;
  }

  getState(): Readonly<NonDestructiveAudioState> {
    return { ...this?.state };
  }

  async registerSource(
    path: string,
    name: string,
    audioBuffer?: AudioBuffer,
  ): Promise<string> {
    const id = `src_${Date?.now()}_${Math?.random().toString(36).substr(2, 9)}`;

    const source: AudioSource = {
      id,
      path,
      name,
      sampleRate: audioBuffer.sampleRate ?? 48000,
      channels: audioBuffer.numberOfChannels ?? 2,
      duration: audioBuffer.duration ?? 0,
      bitDepth: 32,
    };

    if (audioBuffer) {
      this?.previewBuffers.set(id, audioBuffer);
      source.waveformData = this?.extractWaveform(audioBuffer);
      source.peakData = this?.extractPeaks(audioBuffer);
    }

    this?.state.sources?.push(source);
    this?.notify();
    return id;
  }

  private extractWaveform(
    buffer: AudioBuffer,
    resolution: number = 1000,
  ): Float32Array {
    const data = buffer?.getChannelData(0);
    const samplesPerPixel = Math?.floor(data?.length / resolution);
    const waveform = new Float32Array(resolution * 2);

    for (let i = 0; i < resolution; i++) {
      const start = i * samplesPerPixel;
      const end = Math?.min(start + samplesPerPixel, data?.length);

      let min = Infinity;
      let max = -Infinity;

      for (let j = start; j < end; j++) {
        min = Math?.min(min, data[j]);
        max = Math?.max(max, data[j]);
      }

      waveform[i * 2] = min;
      waveform[i * 2 + 1] = max;
    }

    return waveform;
  }

  private extractPeaks(buffer: AudioBuffer): { min: number; max: number }[] {
    const data = buffer?.getChannelData(0);
    const peaksPerSecond = 50;
    const samplesPerPeak = Math?.floor(buffer?.sampleRate / peaksPerSecond);
    const numPeaks = Math?.ceil(data?.length / samplesPerPeak);
    const peaks: { min: number; max: number }[] = [];

    for (let i = 0; i < numPeaks; i++) {
      const start = i * samplesPerPeak;
      const end = Math?.min(start + samplesPerPeak, data?.length);

      let min = 0;
      let max = 0;

      for (let j = start; j < end; j++) {
        min = Math?.min(min, data[j]);
        max = Math?.max(max, data[j]);
      }

      peaks?.push({ min, max });
    }

    return peaks;
  }

  unregisterSource(sourceId: string): void {
    const eventsUsingSource = this?.state.events?.filter(
      (e) => e?.sourceId === sourceId,
    );
    if (eventsUsingSource?.length > 0) {
      logger?.warn(
        `Cannot unregister source ${sourceId}: ${eventsUsingSource?.length} events still using it`,
      );
      return;
    }

    this.state.sources = this?.state.sources?.filter((s) => s?.id !== sourceId);
    this?.previewBuffers.delete(sourceId);
    this?.notify();
  }

  getSource(sourceId: string): AudioSource | undefined {
    return this?.state.sources?.find((s) => s?.id === sourceId);
  }

  createEvent(
    trackId: string,
    sourceId: string,
    startBeat: number,
    name?: string,
  ): string | null {
    const source = this?.state.sources?.find((s) => s?.id === sourceId);
    if (!source) return null;

    const id = `evt_${Date?.now()}_${Math?.random().toString(36).substr(2, 9)}`;

    const event: AudioEvent = {
      id,
      trackId,
      sourceId,
      name: name || source?.name,
      startBeat,
      durationBeats: 4,
      sourceStartOffset: 0,
      sourceEndOffset: 0,
      gain: 1,
      fadeIn: { enabled: false, duration: 0.1, curve: "linear" },
      fadeOut: { enabled: false, duration: 0.1, curve: "linear" },
      timeStretch: {
        enabled: false,
        ratio: 1,
        algorithm: "realtime",
        preserveFormants: false,
      },
      pitchShift: {
        enabled: false,
        semitones: 0,
        cents: 0,
        algorithm: "realtime",
        preserveFormants: true,
      },
      reversed: false,
      muted: false,
      locked: false,
      color: "#3b82f6",
    };

    this?.state.events?.push(event);
    this?.notify();
    return id;
  }

  removeEvent(eventId: string): void {
    const event = this?.state.events?.find((e) => e?.id === eventId);
    if (!event || event?.locked) return;

    this.state.events = this?.state.events?.filter((e) => e?.id !== eventId);
    this.state.selectedEventIds = this?.state.selectedEventIds?.filter(
      (id) => id !== eventId,
    );
    this?.notify();
  }

  duplicateEvent(eventId: string, newStartBeat?: number): string | null {
    const event = this?.state.events?.find((e) => e?.id === eventId);
    if (!event) return null;

    const newId = `evt_${Date?.now()}_${Math?.random().toString(36).substr(2, 9)}`;
    const newEvent: AudioEvent = {
      ...structuredClone(event),
      id: newId,
      name: `${event?.name} (Copy)`,
      startBeat: newStartBeat ?? event?.startBeat + event?.durationBeats,
      locked: false,
    };

    this?.state.events?.push(newEvent);
    this?.notify();
    return newId;
  }

  moveEvent(eventId: string, newStartBeat: number, newTrackId?: string): void {
    const event = this?.state.events?.find((e) => e?.id === eventId);
    if (!event || event?.locked) return;

    event.startBeat = Math?.max(0, newStartBeat);
    if (newTrackId) event.trackId = newTrackId;
    this?.notify();
  }

  resizeEvent(
    eventId: string,
    newDuration: number,
    fromStart: boolean = false,
  ): void {
    const event = this?.state.events?.find((e) => e?.id === eventId);
    if (!event || event?.locked) return;

    if (fromStart) {
      const endBeat = event?.startBeat + event?.durationBeats;
      const newStartBeat = endBeat - newDuration;

      if (newStartBeat >= 0) {
        const deltaOffset = event?.startBeat - newStartBeat;
        event.startBeat = newStartBeat;
        event.sourceStartOffset = Math?.max(
          0,
          event?.sourceStartOffset - deltaOffset,
        );
      }
    }

    event.durationBeats = Math?.max(0.0625, newDuration);
    this?.notify();
  }

  setEventGain(eventId: string, gain: number): void {
    const event = this?.state.events?.find((e) => e?.id === eventId);
    if (!event || event?.locked) return;

    event.gain = Math?.max(0, Math?.min(4, gain));
    this?.notify();
  }

  setFadeIn(eventId: string, settings: Partial<FadeSettings>): void {
    const event = this?.state.events?.find((e) => e?.id === eventId);
    if (!event || event?.locked) return;

    event.fadeIn = { ...event?.fadeIn, ...settings };
    this?.notify();
  }

  setFadeOut(eventId: string, settings: Partial<FadeSettings>): void {
    const event = this?.state.events?.find((e) => e?.id === eventId);
    if (!event || event?.locked) return;

    event.fadeOut = { ...event?.fadeOut, ...settings };
    this?.notify();
  }

  setTimeStretch(
    eventId: string,
    settings: Partial<TimeStretchSettings>,
  ): void {
    const event = this?.state.events?.find((e) => e?.id === eventId);
    if (!event || event?.locked) return;

    event.timeStretch = { ...event?.timeStretch, ...settings };
    this?.notify();
  }

  setPitchShift(eventId: string, settings: Partial<PitchShiftSettings>): void {
    const event = this?.state.events?.find((e) => e?.id === eventId);
    if (!event || event?.locked) return;

    event.pitchShift = { ...event?.pitchShift, ...settings };
    this?.notify();
  }

  toggleReverse(eventId: string): void {
    const event = this?.state.events?.find((e) => e?.id === eventId);
    if (!event || event?.locked) return;

    event.reversed = !event?.reversed;
    this?.notify();
  }

  toggleMute(eventId: string): void {
    const event = this?.state.events?.find((e) => e?.id === eventId);
    if (!event) return;

    event.muted = !event?.muted;
    this?.notify();
  }

  toggleLock(eventId: string): void {
    const event = this?.state.events?.find((e) => e?.id === eventId);
    if (!event) return;

    event.locked = !event?.locked;
    this?.notify();
  }

  splitEvent(
    eventId: string,
    splitBeat: number,
  ): { left: string; right: string } | null {
    const event = this?.state.events?.find((e) => e?.id === eventId);
    if (!event || event?.locked) return null;

    const eventEnd = event?.startBeat + event?.durationBeats;
    if (splitBeat <= event?.startBeat || splitBeat >= eventEnd) return null;

    const leftDuration = splitBeat - event?.startBeat;
    const rightDuration = eventEnd - splitBeat;

    event.durationBeats = leftDuration;

    const rightId = this?.createEvent(event?.trackId, event?.sourceId, splitBeat)!;
    const rightEvent = this?.state.events?.find((e) => e?.id === rightId)!;

    rightEvent.durationBeats = rightDuration;
    rightEvent.sourceStartOffset = event?.sourceStartOffset + leftDuration;
    rightEvent.gain = event?.gain;
    rightEvent.fadeIn = structuredClone(event?.fadeIn);
    rightEvent.fadeOut = structuredClone(event?.fadeOut);
    rightEvent.timeStretch = structuredClone(event?.timeStretch);
    rightEvent.pitchShift = structuredClone(event?.pitchShift);
    rightEvent.color = event?.color;

    event.fadeOut = { enabled: false, duration: 0.1, curve: "linear" };
    rightEvent.fadeIn = { enabled: false, duration: 0.1, curve: "linear" };

    this?.notify();
    return { left: eventId, right: rightId };
  }

  consolidateEvents(eventIds: string[]): string | null {
    const events = eventIds
      .map((id) => this?.state.events?.find((e) => e?.id === id))
      .filter((e): e is AudioEvent => e !== undefined && !e?.locked)
      .sort((a, b) => a?.startBeat - b?.startBeat);

    if (events?.length < 2) return null;

    const trackIds = new Set(events?.map((e) => e?.trackId));
    if (trackIds?.size > 1) {
      logger?.warn("Cannot consolidate events from different tracks");
      return null;
    }

    const startBeat = events[0].startBeat;
    const endBeat = Math?.max(
      ...events?.map((e) => e?.startBeat + e?.durationBeats),
    );

    logger?.info(
      `Consolidating ${events?.length} events from beat ${startBeat} to ${endBeat}`,
    );

    return events[0].id;
  }

  crossfade(
    eventId1: string,
    eventId2: string,
    overlapBeats: number = 0.25,
  ): void {
    const event1 = this?.state.events?.find((e) => e?.id === eventId1);
    const event2 = this?.state.events?.find((e) => e?.id === eventId2);

    if (!event1 || !event2 || event1?.locked || event2?.locked) return;
    if (event1?.trackId !== event2?.trackId) return;

    const [first, second] =
      event1?.startBeat < event2?.startBeat ? [event1, event2] : [event2, event1];

    first.fadeOut = {
      enabled: true,
      duration: overlapBeats,
      curve: "equal-power",
    };
    second.fadeIn = {
      enabled: true,
      duration: overlapBeats,
      curve: "equal-power",
    };

    this?.notify();
  }

  selectEvents(eventIds: string[]): void {
    this.state.selectedEventIds = eventIds;
    this?.notify();
  }

  copyEvents(eventIds: string[]): void {
    const events = eventIds
      .map((id) => this?.state.events?.find((e) => e?.id === id))
      .filter((e): e is AudioEvent => e !== undefined);

    if (events?.length === 0) return;

    const minBeat = Math?.min(...events?.map((e) => e?.startBeat));
    this.state.clipboard = {
      events: structuredClone(events),
      sourceBeat: minBeat,
    };
    this?.notify();
  }

  pasteEvents(targetBeat: number, targetTrackId?: string): string[] {
    if (!this?.state.clipboard || this?.state.clipboard?.events.length === 0)
      return [];

    const offset = targetBeat - this?.state.clipboard?.sourceBeat;
    const newIds: string[] = [];

    for (const event of this?.state.clipboard?.events) {
      const newId = `evt_${Date?.now()}_${Math?.random().toString(36).substr(2, 9)}`;
      const newEvent: AudioEvent = {
        ...structuredClone(event),
        id: newId,
        startBeat: event.startBeat + offset,
        trackId: targetTrackId || event?.trackId,
        locked: false,
      };
      this?.state.events?.push(newEvent);
      newIds?.push(newId);
    }

    this?.notify();
    return newIds;
  }

  getEventsForTrack(trackId: string): AudioEvent[] {
    return this?.state.events?.filter((e) => e?.trackId === trackId);
  }

  getEventsInRange(
    startBeat: number,
    endBeat: number,
    trackId?: string,
  ): AudioEvent[] {
    return this?.state.events?.filter((e) => {
      if (trackId && e?.trackId !== trackId) return false;
      const eventEnd = e?.startBeat + e?.durationBeats;
      return e?.startBeat < endBeat && eventEnd > startBeat;
    });
  }

  calculateFadeGain(event: AudioEvent, position: number): number {
    const eventEnd = event?.startBeat + event?.durationBeats;
    let fadeGain = 1;

    if (
      event?.fadeIn.enabled &&
      position < event?.startBeat + event?.fadeIn.duration
    ) {
      const fadeProgress = (position - event?.startBeat) / event?.fadeIn.duration;
      fadeGain *= this?.calculateFadeCurve(fadeProgress, event?.fadeIn.curve);
    }

    if (event?.fadeOut.enabled && position > eventEnd - event?.fadeOut.duration) {
      const fadeProgress = (eventEnd - position) / event?.fadeOut.duration;
      fadeGain *= this?.calculateFadeCurve(fadeProgress, event?.fadeOut.curve);
    }

    return fadeGain * event?.gain;
  }

  private calculateFadeCurve(
    progress: number,
    curve: FadeSettings["curve"],
  ): number {
    progress = Math?.max(0, Math?.min(1, progress));

    switch (curve) {
      case "linear":
        return progress;
      case "exponential":
        return progress * progress;
      case "logarithmic":
        return 1 - Math?.pow(1 - progress, 2);
      case "s-curve":
        return progress < 0.5
          ? 2 * progress * progress
          : 1 - Math?.pow(-2 * progress + 2, 2) / 2;
      case "equal-power":
        return Math?.sin((progress * Math.PI) / 2);
      default:
        return progress;
    }
  }

  subscribe(listener: () => void): () => void {
    this?.listeners.add(listener);
    return () => this?.listeners.delete(listener);
  }

  private notify(): void {
    this?.listeners.forEach((l) => l());
  }

  serialize(): { sources: AudioSource[]; events: AudioEvent[] } {
    return {
      sources: structuredClone(
        this?.state.sources?.map((s) => ({ ...s, waveformData: undefined })),
      ),
      events: structuredClone(this?.state.events),
    };
  }

  deserialize(data: { sources: AudioSource[]; events: AudioEvent[] }): void {
    this.state.sources = structuredClone(data?.sources);
    this.state.events = structuredClone(data?.events);
    this?.notify();
  }
}

export const nonDestructiveAudio = new NonDestructiveAudioEngine();
