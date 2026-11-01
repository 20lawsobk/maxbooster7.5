export type ProjectUpdateBoundaryResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; message: string };

const PROJECT_UPDATE_FIELDS = new Set([
  "title",
  "description",
  "genre",
  "tempo",
  "bpm",
  "key",
  "timeSignature",
  "sampleRate",
  "bitDepth",
  "workflowStage",
  "status",
  "version",
  "expectedUpdatedAt",
]);

function boundedOptionalString(
  value: unknown,
  field: string,
  max: number,
  options: { allowEmpty?: boolean } = {},
): { ok: true; value?: string } | { ok: false; message: string } {
  if (value === undefined) return { ok: true };
  if (typeof value !== "string") {
    return { ok: false, message: `${field} must be a string` };
  }
  const normalized = value.trim();
  if (!options.allowEmpty && normalized.length === 0) {
    return { ok: false, message: `${field} cannot be empty` };
  }
  if (normalized.length > max) {
    return { ok: false, message: `${field} is too long` };
  }
  return { ok: true, value: normalized };
}

export function normalizeProjectDetailsUpdate(
  body: unknown,
): ProjectUpdateBoundaryResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Invalid project update" };
  }

  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((key) => !PROJECT_UPDATE_FIELDS.has(key))) {
    return { ok: false, message: "Unsupported project update field" };
  }
  if (Object.keys(input).length === 0) {
    return { ok: false, message: "Project update is empty" };
  }

  const output: Record<string, unknown> = {};
  // Preserve the optimistic-concurrency precondition through this shared
  // normalization boundary. The route enforces omission as HTTP428.
  if (input.expectedUpdatedAt !== undefined) {
    if (input.expectedUpdatedAt !== null &&
        (typeof input.expectedUpdatedAt !== "string" ||
         !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(input.expectedUpdatedAt) ||
         !Number.isFinite(Date.parse(input.expectedUpdatedAt)))) {
      return { ok: false, message: "Invalid project update timestamp" };
    }
    output.expectedUpdatedAt = input.expectedUpdatedAt;
  }

  const strings: Array<[
    string,
    number,
    { allowEmpty?: boolean }?,
  ]> = [
    ["title", 255],
    ["description", 5000, { allowEmpty: true }],
    ["genre", 100, { allowEmpty: true }],
    ["key", 32, { allowEmpty: true }],
    ["workflowStage", 50],
    ["status", 50],
  ];
  for (const [field, max, options] of strings) {
    const normalized = boundedOptionalString(input[field], field, max, options);
    if (!normalized.ok) return normalized;
    if (normalized.value !== undefined) output[field] = normalized.value;
  }

  const rawTempo = input.tempo ?? input.bpm;
  if (input.tempo !== undefined && input.bpm !== undefined) {
    if (input.tempo !== input.bpm) {
      return { ok: false, message: "tempo and bpm must match when both are provided" };
    }
  }
  if (rawTempo !== undefined) {
    if (
      typeof rawTempo !== "number" ||
      !Number.isFinite(rawTempo) ||
      rawTempo < 20 ||
      rawTempo > 999
    ) {
      return { ok: false, message: "tempo must be between 20 and 999 BPM" };
    }
    // studio.ts persists `data.tempo` into the bpm column. Normalize legacy
    // `bpm` callers onto that canonical field so their value is not lost.
    output.tempo = rawTempo;
  }

  if (input.timeSignature !== undefined) {
    if (
      typeof input.timeSignature !== "string" ||
      !/^\d{1,2}\/\d{1,2}$/.test(input.timeSignature.trim())
    ) {
      return { ok: false, message: "Invalid time signature" };
    }
    output.timeSignature = input.timeSignature.trim();
  }

  if (input.sampleRate !== undefined) {
    if (
      typeof input.sampleRate !== "number" ||
      !Number.isFinite(input.sampleRate) ||
      input.sampleRate < 8000 ||
      input.sampleRate > 192000
    ) {
      return { ok: false, message: "Invalid sample rate" };
    }
    output.sampleRate = input.sampleRate;
  }

  if (input.bitDepth !== undefined) {
    if (
      typeof input.bitDepth !== "number" ||
      ![16, 24, 32].includes(input.bitDepth)
    ) {
      return { ok: false, message: "Bit depth must be 16, 24, or 32" };
    }
    output.bitDepth = input.bitDepth;
  }

  if (input.version !== undefined) {
    if (
      typeof input.version !== "number" ||
      !Number.isInteger(input.version) ||
      input.version < 0
    ) {
      return { ok: false, message: "Invalid project version" };
    }
    output.version = input.version;
  }

  return { ok: true, value: output };
}
