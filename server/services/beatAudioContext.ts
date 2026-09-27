/** Audio observations are metadata, not decisions inferred from awareness prose. */
export interface BeatAudioContext {
  genre?: string;
  mood?: string;
  tempo?: number;
  requestedKey?: string;
  musicalKey?: string;
  confidence?: number;
  hooks: string[];
  productionStyles: string[];
  snapshot_id?: string;
  provenance?: unknown;
  awareness_receipt?: Record<string, unknown>;
}

export function beatAudioInputs(preferences: { genre?: string; mood?: string; key?: string } = {}): BeatAudioContext {
  return {
    ...(preferences.genre !== undefined ? { genre: preferences.genre } : {}),
    ...(preferences.mood !== undefined ? { mood: preferences.mood } : {}),
    ...(preferences.key !== undefined ? { requestedKey: preferences.key } : {}),
    hooks: [],
    productionStyles: [],
  };
}

export function beatAudioObservation(data: Record<string, unknown>, submission: Record<string, unknown> = {}): Partial<BeatAudioContext> {
  const metadata = data.metadata && typeof data.metadata === "object"
    ? data.metadata as Record<string, unknown> : {};
  const field = (name: string) => data[name] ?? metadata[name];
  const observed: Partial<BeatAudioContext> = {};
  for (const key of ["genre", "mood"] as const) {
    if (typeof field(key) === "string" && field(key)) observed[key] = field(key) as string;
  }
  if (typeof field("bpm") === "number" && Number.isFinite(field("bpm")) && (field("bpm") as number) > 0) {
    observed.tempo = field("bpm") as number;
  }
  if (typeof field("key") === "string" && field("key")) observed.musicalKey = field("key") as string;
  // Never promote echoed requested mc_bpm/mc_key to measured metadata.
  const receipt = {
    ...submission,
    ...(data.snapshot_id !== undefined ? { snapshot_id: data.snapshot_id } : {}),
    ...(data.awareness !== undefined ? { awareness: data.awareness } : {}),
    ...(data.provenance !== undefined ? { provenance: data.provenance } : {}),
    ...(data.awareness_receipt !== undefined ? { awareness_receipt: data.awareness_receipt } : {}),
  };
  observed.awareness_receipt = receipt;
  if (typeof receipt.snapshot_id === "string") observed.snapshot_id = receipt.snapshot_id;
  if (receipt.provenance !== undefined) observed.provenance = receipt.provenance;
  return observed;
}