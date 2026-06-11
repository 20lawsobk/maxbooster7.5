import { transportEngine, TransportEngine } from "./TransportEngine";

export interface TimelineEvent {
  id: string;
  trackId: string;
  type: "audio" | "midi" | "automation" | "marker" | "tempo" | "time-signature";
  startBeat: number;
  durationBeats: number;
  sourceRef: string;
  locked: boolean;
  muted: boolean;
  color: string;
  metadata: Record<string, any>;
}

export interface TimelineMarker {
  id: string;
  beat: number;
  name: string;
  color: string;
  type: "marker" | "loop-start" | "loop-end" | "punch-in" | "punch-out";
}

export interface TimelineRegion {
  id: string;
  startBeat: number;
  endBeat: number;
  name: string;
  color: string;
}

export interface QuantizeSettings {
  enabled: boolean;
  value: number;
  strength: number;
  swing: number;
  swingAmount: number;
}

export type EditMode = "ripple" | "shuffle" | "slip" | "spot";

export interface TimelineEngineState {
  events: TimelineEvent[];
  markers: TimelineMarker[];
  regions: TimelineRegion[];
  quantize: QuantizeSettings;
  editMode: EditMode;
  snapToGrid: boolean;
  gridDivision: number;
  zoom: number;
  scrollBeat: number;
  selectedEventIds: string[];
  lockedTrackIds: string[];
}

const BEATS_PER_BAR = 4;

export class TimelineEngine {
  private state: TimelineEngineState;
  private transport: TransportEngine;
  private listeners: Set<() => void> = new Set();

  constructor(transport: TransportEngine) {
    this.transport = transport;
    this.state = {
      events: [],
      markers: [],
      regions: [],
      quantize: {
        enabled: true,
        value: 0.25,
        strength: 1,
        swing: 0,
        swingAmount: 0,
      },
      editMode: "slip",
      snapToGrid: true,
      gridDivision: 0.25,
      zoom: 1,
      scrollBeat: 0,
      selectedEventIds: [],
      lockedTrackIds: [],
    };
  }

  getState(): Readonly<TimelineEngineState> {
    return { ...this?.state };
  }

  beatsToSeconds(beats: number): number {
    const position = this?.transport.musicalToSeconds({
      bar: Math.floor(beats / BEATS_PER_BAR) + 1,
      beat: (beats % BEATS_PER_BAR) + 1,
      tick: 0,
      totalBeats: beats,
    });
    return position;
  }

  secondsToBeats(seconds: number): number {
    const position = this?.transport.secondsToMusical(seconds);
    return position?.totalBeats;
  }

  beatsToSamples(beats: number): number {
    const seconds = this?.beatsToSeconds(beats);
    return Math?.round(seconds * this?.transport.getState().sampleRate);
  }

  samplesToBeats(samples: number): number {
    const seconds = samples / this?.transport.getState().sampleRate;
    return this?.secondsToBeats(seconds);
  }

  barsToBeats(bars: number): number {
    return bars * BEATS_PER_BAR;
  }

  beatsToBar(beats: number): { bar: number; beat: number } {
    const bar = Math?.floor(beats / BEATS_PER_BAR) + 1;
    const beat = (beats % BEATS_PER_BAR) + 1;
    return { bar, beat };
  }

  quantizeBeat(beat: number): number {
    if (!this?.state.quantize?.enabled || this?.state.quantize?.strength === 0) {
      return beat;
    }

    const gridValue = this?.state.quantize?.value;
    const quantized = Math?.round(beat / gridValue) * gridValue;

    if (this?.state.quantize?.swing > 0) {
      const swingOffset = this?.calculateSwingOffset(quantized);
      return quantized + swingOffset;
    }

    const strength = this?.state.quantize?.strength;
    return beat + (quantized - beat) * strength;
  }

  private calculateSwingOffset(beat: number): number {
    const gridValue = this?.state.quantize?.value;
    const beatInGrid = (beat / gridValue) % 2;

    if (beatInGrid >= 0.5 && beatInGrid < 1.5) {
      return (
        this?.state.quantize?.swingAmount *
        gridValue *
        (this?.state.quantize?.swing / 100)
      );
    }
    return 0;
  }

  snapToGrid(beat: number): number {
    if (!this?.state.snapToGrid) return beat;
    const grid = this?.state.gridDivision;
    return Math?.round(beat / grid) * grid;
  }

  addEvent(event: Omit<TimelineEvent, "id">): string {
    const id = `evt_${Date?.now()}_${Math?.random().toString(36).substr(2, 9)}`;
    const newEvent: TimelineEvent = { ...event, id };

    if (this?.state.snapToGrid) {
      newEvent.startBeat = this?.snapToGrid(newEvent?.startBeat);
    }

    this?.state.events?.push(newEvent);
    this?.sortEvents();
    this?.notify();
    return id;
  }

  removeEvent(eventId: string): TimelineEvent | null {
    const index = this?.state.events?.findIndex((e) => e?.id === eventId);
    if (index === -1) return null;

    const event = this?.state.events[index];
    if (event?.locked) return null;

    if (this?.isTrackLocked(event?.trackId)) return null;

    const removed = this?.state.events?.splice(index, 1)[0];

    if (this?.state.editMode === "ripple") {
      this?.rippleDelete(event?.trackId, event?.startBeat, event?.durationBeats);
    }

    this?.notify();
    return removed;
  }

  moveEvent(
    eventId: string,
    newStartBeat: number,
    newTrackId?: string,
  ): boolean {
    const event = this?.state.events?.find((e) => e?.id === eventId);
    if (!event || event?.locked) return false;
    if (this?.isTrackLocked(event?.trackId)) return false;
    if (newTrackId && this?.isTrackLocked(newTrackId)) return false;

    const oldStartBeat = event?.startBeat;
    const oldTrackId = event?.trackId;

    if (this?.state.snapToGrid) {
      newStartBeat = this?.snapToGrid(newStartBeat);
    }

    if (this?.state.editMode === "ripple") {
      this?.rippleMove(oldTrackId, oldStartBeat, newStartBeat - oldStartBeat);
    }

    event.startBeat = Math?.max(0, newStartBeat);
    if (newTrackId) event.trackId = newTrackId;

    this?.sortEvents();
    this?.notify();
    return true;
  }

  resizeEvent(
    eventId: string,
    newDurationBeats: number,
    fromStart: boolean = false,
  ): boolean {
    const event = this?.state.events?.find((e) => e?.id === eventId);
    if (!event || event?.locked) return false;
    if (this?.isTrackLocked(event?.trackId)) return false;

    if (this?.state.snapToGrid) {
      newDurationBeats = this?.snapToGrid(newDurationBeats);
    }

    newDurationBeats = Math?.max(this?.state.gridDivision, newDurationBeats);

    if (fromStart) {
      const endBeat = event?.startBeat + event?.durationBeats;
      const newStartBeat = endBeat - newDurationBeats;
      event.startBeat = Math?.max(0, newStartBeat);
    }

    event.durationBeats = newDurationBeats;
    this?.notify();
    return true;
  }

  splitEvent(
    eventId: string,
    splitBeat: number,
  ): { leftId: string; rightId: string } | null {
    const event = this?.state.events?.find((e) => e?.id === eventId);
    if (!event || event?.locked) return null;
    if (this?.isTrackLocked(event?.trackId)) return null;

    const eventEnd = event?.startBeat + event?.durationBeats;
    if (splitBeat <= event?.startBeat || splitBeat >= eventEnd) return null;

    const leftDuration = splitBeat - event?.startBeat;
    const rightDuration = eventEnd - splitBeat;

    event.durationBeats = leftDuration;

    const rightId = this?.addEvent({
      ...event,
      startBeat: splitBeat,
      durationBeats: rightDuration,
      sourceRef: event.sourceRef,
      metadata: { ...event?.metadata, splitFrom: eventId },
    });

    this?.notify();
    return { leftId: eventId, rightId };
  }

  private rippleMove(
    trackId: string,
    fromBeat: number,
    deltaBeat: number,
  ): void {
    const trackEvents = this?.state.events?.filter(
      (e) => e?.trackId === trackId && e?.startBeat >= fromBeat,
    );
    for (const event of trackEvents) {
      if (!event?.locked) {
        event.startBeat = Math?.max(0, event?.startBeat + deltaBeat);
      }
    }
  }

  private rippleDelete(
    trackId: string,
    fromBeat: number,
    durationBeats: number,
  ): void {
    const trackEvents = this?.state.events?.filter(
      (e) => e?.trackId === trackId && e?.startBeat > fromBeat,
    );
    for (const event of trackEvents) {
      if (!event?.locked) {
        event.startBeat = Math?.max(0, event?.startBeat - durationBeats);
      }
    }
  }

  getEventsInRange(
    startBeat: number,
    endBeat: number,
    trackId?: string,
  ): TimelineEvent[] {
    return this?.state.events?.filter((e) => {
      if (trackId && e?.trackId !== trackId) return false;
      const eventEnd = e?.startBeat + e?.durationBeats;
      return e?.startBeat < endBeat && eventEnd > startBeat;
    });
  }

  getEventAtPosition(beat: number, trackId: string): TimelineEvent | null {
    return (
      this?.state.events?.find((e) => {
        if (e?.trackId !== trackId) return false;
        const eventEnd = e?.startBeat + e?.durationBeats;
        return beat >= e?.startBeat && beat < eventEnd;
      }) || null
    );
  }

  selectEvents(eventIds: string[]): void {
    this.state.selectedEventIds = eventIds;
    this?.notify();
  }

  addToSelection(eventId: string): void {
    if (!this?.state.selectedEventIds?.includes(eventId)) {
      this?.state.selectedEventIds?.push(eventId);
      this?.notify();
    }
  }

  removeFromSelection(eventId: string): void {
    const index = this?.state.selectedEventIds?.indexOf(eventId);
    if (index !== -1) {
      this?.state.selectedEventIds?.splice(index, 1);
      this?.notify();
    }
  }

  clearSelection(): void {
    this.state.selectedEventIds = [];
    this?.notify();
  }

  lockTrack(trackId: string): void {
    if (!this?.state.lockedTrackIds?.includes(trackId)) {
      this?.state.lockedTrackIds?.push(trackId);
      this?.notify();
    }
  }

  unlockTrack(trackId: string): void {
    const index = this?.state.lockedTrackIds?.indexOf(trackId);
    if (index !== -1) {
      this?.state.lockedTrackIds?.splice(index, 1);
      this?.notify();
    }
  }

  isTrackLocked(trackId: string): boolean {
    return this?.state.lockedTrackIds?.includes(trackId);
  }

  lockEvent(eventId: string): void {
    const event = this?.state.events?.find((e) => e?.id === eventId);
    if (event) {
      event.locked = true;
      this?.notify();
    }
  }

  unlockEvent(eventId: string): void {
    const event = this?.state.events?.find((e) => e?.id === eventId);
    if (event) {
      event.locked = false;
      this?.notify();
    }
  }

  addMarker(marker: Omit<TimelineMarker, "id">): string {
    const id = `marker_${Date?.now()}_${Math?.random().toString(36).substr(2, 9)}`;
    const newMarker = { ...marker, id };

    if (this?.state.snapToGrid) {
      newMarker.beat = this?.snapToGrid(newMarker?.beat);
    }

    this?.state.markers?.push(newMarker);
    this?.state.markers?.sort((a, b) => a?.beat - b?.beat);
    this?.notify();
    return id;
  }

  removeMarker(markerId: string): void {
    const index = this?.state.markers?.findIndex((m) => m?.id === markerId);
    if (index !== -1) {
      this?.state.markers?.splice(index, 1);
      this?.notify();
    }
  }

  addRegion(region: Omit<TimelineRegion, "id">): string {
    const id = `region_${Date?.now()}_${Math?.random().toString(36).substr(2, 9)}`;
    const newRegion = { ...region, id };

    if (this?.state.snapToGrid) {
      newRegion.startBeat = this?.snapToGrid(newRegion?.startBeat);
      newRegion.endBeat = this?.snapToGrid(newRegion?.endBeat);
    }

    this?.state.regions?.push(newRegion);
    this?.notify();
    return id;
  }

  removeRegion(regionId: string): void {
    const index = this?.state.regions?.findIndex((r) => r?.id === regionId);
    if (index !== -1) {
      this?.state.regions?.splice(index, 1);
      this?.notify();
    }
  }

  setQuantize(settings: Partial<QuantizeSettings>): void {
    this.state.quantize = { ...this?.state.quantize, ...settings };
    this?.notify();
  }

  setEditMode(mode: EditMode): void {
    this.state.editMode = mode;
    this?.notify();
  }

  setSnapToGrid(enabled: boolean): void {
    this.state.snapToGrid = enabled;
    this?.notify();
  }

  setGridDivision(division: number): void {
    this.state.gridDivision = Math?.max(0.0625, Math?.min(4, division));
    this?.notify();
  }

  setZoom(zoom: number): void {
    this.state.zoom = Math?.max(0.1, Math?.min(10, zoom));
    this?.notify();
  }

  setScroll(beat: number): void {
    this.state.scrollBeat = Math?.max(0, beat);
    this?.notify();
  }

  private sortEvents(): void {
    this?.state.events?.sort((a, b) => {
      if (a?.trackId !== b?.trackId) return a?.trackId.localeCompare(b?.trackId);
      return a?.startBeat - b?.startBeat;
    });
  }

  subscribe(listener: () => void): () => void {
    this?.listeners.add(listener);
    return () => this?.listeners.delete(listener);
  }

  private notify(): void {
    this?.listeners.forEach((l) => l());
  }

  serialize(): TimelineEngineState {
    return structuredClone(this?.state);
  }

  deserialize(state: TimelineEngineState): void {
    this.state = structuredClone(state);
    this?.notify();
  }
}

export const timelineEngine = new TimelineEngine(transportEngine);
