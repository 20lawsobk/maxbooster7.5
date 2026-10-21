export interface Project {
  id: string;
  userId: string;
  title: string;
  description?: string | null;
  genre?: string | null;
  bpm?: number | null;
  key?: string | null;
  status?: string | null;
  workflowStage?: string | null;
  isStudioProject?: boolean | null;
  metadata?: Record<string, unknown> | null;
  favorite?: boolean | null;
  lastOpenedAt?: string | null;
  coverImageUrl?: string | null;
  tags?: string[] | null;
  timeSignature?: string | null;
  sampleRate?: number | null;
  bitDepth?: number | null;
  createdAt: string;
  updatedAt?: string | null;
  audioUrl?: string | null;
  duration?: number | null;
  fileSize?: number | null;
  streams?: number | null;
  progress?: number | null;
}

export interface SongwritingSession {
  id: string;
  userId?: string | null;
  title: string;
  genre?: string | null;
  mood?: string | null;
  bpm?: number | null;
  key?: string | null;
  lyrics?: string | null;
  notes?: string | null;
  status?: string | null;
  aiAssisted?: boolean | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface SongwritingAssistResponse {
  rhymes: string[];
  chordProgression: string;
  suggestions: string[];
  structures: string[];
}

export interface SongwritingDraftInput {
  title: string;
  genre: string;
  mood: string;
  bpm: number;
  key: string;
  lyrics: string;
  notes: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNullableString(value: unknown): string | null | undefined {
  return value === null
    ? null
    : typeof value === "string"
      ? value
      : undefined;
}

function asNullableFiniteNumber(value: unknown): number | null | undefined {
  return value === null
    ? null
    : typeof value === "number" && Number.isFinite(value)
      ? value
      : undefined;
}

export async function readProjectsJson(
  response: Pick<Response, "json">,
  timeoutMs = 10_000,
): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      response.json(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("The server response took too long to read.")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function normalizeProject(value: unknown): Project | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    !value.id.trim() ||
    typeof value.userId !== "string" ||
    !value.userId.trim() ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    typeof value.createdAt !== "string" ||
    !Number.isFinite(Date.parse(value.createdAt))
  ) {
    return null;
  }

  const project: Project = {
    id: value.id,
    userId: value.userId,
    title: value.title,
    createdAt: value.createdAt,
  };
  const writable = project as unknown as Record<string, unknown>;

  for (const field of [
    "description",
    "genre",
    "key",
    "status",
    "workflowStage",
    "lastOpenedAt",
    "coverImageUrl",
    "updatedAt",
    "audioUrl",
    "timeSignature",
  ] as const) {
    const normalized = asNullableString(value[field]);
    if (normalized !== undefined) writable[field] = normalized;
  }

  for (const field of [
    "bpm",
    "sampleRate",
    "bitDepth",
    "duration",
    "fileSize",
    "streams",
    "progress",
  ] as const) {
    const normalized = asNullableFiniteNumber(value[field]);
    if (normalized !== undefined) writable[field] = normalized;
  }

  if (
    typeof value.isStudioProject === "boolean" ||
    value.isStudioProject === null
  ) {
    project.isStudioProject = value.isStudioProject;
  }
  if (typeof value.favorite === "boolean" || value.favorite === null) {
    project.favorite = value.favorite;
  }
  if (value.metadata === null || isRecord(value.metadata)) {
    project.metadata = value.metadata as Record<string, unknown> | null;
  }
  if (
    value.tags === null ||
    (Array.isArray(value.tags) &&
      value.tags.every((tag) => typeof tag === "string"))
  ) {
    project.tags = value.tags as string[] | null;
  }

  return project;
}

export function normalizeProjectsResponse(payload: unknown): { data: Project[] } {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new Error("The projects response did not match its API contract.");
  }

  const data = payload.data.map(normalizeProject);
  if (data.some((project) => project === null)) {
    throw new Error("The projects response contained an invalid project.");
  }
  return { data: data as Project[] };
}

export function normalizeProjectResponse(payload: unknown): Project {
  const project = normalizeProject(payload);
  if (!project) {
    throw new Error("The project response did not match its API contract.");
  }
  return project;
}

export function normalizeMutationSuccess(payload: unknown): { success: true } {
  if (!isRecord(payload) || payload.success !== true) {
    throw new Error("The server did not confirm the project change.");
  }
  return { success: true };
}

function normalizeSongwritingSession(value: unknown): SongwritingSession | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    !value.id.trim() ||
    typeof value.title !== "string" ||
    !value.title.trim()
  ) {
    return null;
  }

  const session: SongwritingSession = {
    id: value.id,
    title: value.title,
  };
  const writable = session as unknown as Record<string, unknown>;
  for (const field of [
    "userId",
    "genre",
    "mood",
    "key",
    "lyrics",
    "notes",
    "status",
    "createdAt",
    "updatedAt",
  ] as const) {
    const normalized = asNullableString(value[field]);
    if (normalized !== undefined) writable[field] = normalized;
  }
  const bpm = asNullableFiniteNumber(value.bpm);
  if (bpm !== undefined) session.bpm = bpm;
  if (typeof value.aiAssisted === "boolean" || value.aiAssisted === null) {
    session.aiAssisted = value.aiAssisted;
  }
  return session;
}

export function normalizeSongwritingSessions(
  payload: unknown,
): SongwritingSession[] {
  if (!Array.isArray(payload)) {
    throw new Error("The songwriting response did not match its API contract.");
  }
  const sessions = payload.map(normalizeSongwritingSession);
  if (sessions.some((session) => session === null)) {
    throw new Error("The songwriting response contained an invalid session.");
  }
  return sessions as SongwritingSession[];
}

export function normalizeSongwritingSessionResponse(
  payload: unknown,
): SongwritingSession {
  const session = normalizeSongwritingSession(payload);
  if (!session) {
    throw new Error("The songwriting session response was invalid.");
  }
  return session;
}

export function normalizeSongwritingAssist(
  payload: unknown,
): SongwritingAssistResponse {
  if (!isRecord(payload)) {
    throw new Error("The songwriting assistant response was invalid.");
  }
  const list = (field: string): string[] => {
    const value = payload[field];
    if (
      !Array.isArray(value) ||
      !value.every((item) => typeof item === "string")
    ) {
      throw new Error(`The songwriting assistant returned invalid ${field}.`);
    }
    return value.map((item) => item.trim()).filter(Boolean);
  };
  if (typeof payload.chordProgression !== "string") {
    throw new Error("The songwriting assistant returned invalid chords.");
  }
  return {
    rhymes: list("rhymes"),
    suggestions: list("suggestions"),
    structures: list("structures"),
    chordProgression: payload.chordProgression.trim(),
  };
}

export function normalizeSongwritingDraftInput(
  input: SongwritingDraftInput,
): SongwritingDraftInput {
  const title = input.title.trim();
  const genre = input.genre.trim();
  const mood = input.mood.trim();
  const key = input.key.trim();
  const lyrics = input.lyrics;
  const notes = input.notes;

  if (!title || title.length > 255) {
    throw new Error("Song title must be between 1 and 255 characters.");
  }
  if (!genre || genre.length > 100) {
    throw new Error("Genre must be between 1 and 100 characters.");
  }
  if (mood.length > 100) {
    throw new Error("Mood must be 100 characters or fewer.");
  }
  if (!key || key.length > 32) {
    throw new Error("Key must be between 1 and 32 characters.");
  }
  if (!Number.isInteger(input.bpm) || input.bpm < 20 || input.bpm > 999) {
    throw new Error("BPM must be a whole number between 20 and 999.");
  }
  if (lyrics.length > 20_000) {
    throw new Error("Lyrics must be 20,000 characters or fewer.");
  }
  if (notes.length > 10_000) {
    throw new Error("Notes must be 10,000 characters or fewer.");
  }

  return { ...input, title, genre, mood, key };
}

export function resolveProjectAudioSource(raw: string): string {
  const value = raw.trim();
  if (!value) {
    throw new Error("This project does not have a valid audio source.");
  }

  if (value.startsWith("/api/")) return value;
  if (value.startsWith("//")) {
    throw new Error("Protocol-relative audio URLs are not allowed.");
  }

  let parsed: URL | null = null;
  try {
    parsed = new URL(value);
  } catch {
    parsed = null;
  }
  if (parsed) {
    if (parsed.protocol !== "https:") {
      throw new Error("Only secure HTTPS audio URLs are allowed.");
    }
    return parsed.toString();
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    throw new Error("Unsupported audio URL scheme.");
  }
  return `/api/marketplace/audio/${value.replace(/^\/+/, "")}`;
}

export function formatProjectDate(value: unknown): string {
  if (typeof value !== "string") return "Date unavailable";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString()
    : "Date unavailable";
}

export function formatProjectFileSize(bytes: unknown): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) {
    return "Size unavailable";
  }
  if (bytes === 0) return "0 Bytes";
  const units = ["Bytes", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / 1024 ** index;
  return `${Math.round(value * 100) / 100} ${units[index]}`;
}

export function formatProjectDuration(seconds: unknown): string {
  if (
    typeof seconds !== "number" ||
    !Number.isFinite(seconds) ||
    seconds < 0
  ) {
    return "Duration unavailable";
  }
  const rounded = Math.floor(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}
