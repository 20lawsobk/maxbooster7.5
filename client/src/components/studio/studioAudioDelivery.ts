export interface GeneratedMidiNote {
  pitch: number;
  velocity: number;
  startTime: number;
  duration: number;
}

export interface StudioAudioJobResult {
  audioUrl: string;
  status: string;
  payload: Record<string, unknown>;
}

export interface ResolvedStudioGeneration {
  audioFilePath?: string;
  jobId?: string;
  duration?: number;
  generatedNotes: GeneratedMidiNote[];
  midiError?: string;
}

const JOB_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

export function triggerStudioDownload(url: string, filename: string): void {
  if (!url?.trim()) throw new Error("The server did not provide a download URL");
  const resolved = new URL(url, window.location.origin);
  if (resolved.protocol !== "https:" && resolved.origin !== window.location.origin) {
    throw new Error("The server returned an unsafe download URL");
  }
  const anchor = document.createElement("a");
  anchor.href = resolved.toString();
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function readVariableLength(bytes: Uint8Array, cursor: { value: number }): number {
  let value = 0;
  for (let count = 0; count < 4; count++) {
    if (cursor.value >= bytes.length) throw new Error("Truncated MIDI event");
    const byte = bytes[cursor.value++];
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return value;
  }
  throw new Error("Invalid MIDI variable-length quantity");
}

export function parseStandardMidi(buffer: ArrayBuffer): GeneratedMidiNote[] {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 14 || String.fromCharCode(...bytes.subarray(0, 4)) !== "MThd") {
    throw new Error("Generated MIDI has an invalid header");
  }

  const view = new DataView(buffer);
  const headerLength = view.getUint32(4);
  const trackCount = view.getUint16(10);
  const division = view.getUint16(12);
  if (headerLength < 6 || division === 0 || (division & 0x8000) !== 0) {
    throw new Error("Generated MIDI uses an unsupported time division");
  }

  const notes: GeneratedMidiNote[] = [];
  let offset = 8 + headerLength;
  for (let trackIndex = 0; trackIndex < trackCount; trackIndex++) {
    if (
      offset + 8 > bytes.length ||
      String.fromCharCode(...bytes.subarray(offset, offset + 4)) !== "MTrk"
    ) {
      throw new Error("Generated MIDI has a missing track");
    }

    const trackLength = view.getUint32(offset + 4);
    const trackEnd = offset + 8 + trackLength;
    if (trackEnd > bytes.length) throw new Error("Generated MIDI track is truncated");
    const cursor = { value: offset + 8 };
    let tick = 0;
    let runningStatus = 0;
    const active = new Map<string, Array<{ tick: number; velocity: number }>>();

    while (cursor.value < trackEnd) {
      tick += readVariableLength(bytes, cursor);
      if (cursor.value >= trackEnd) throw new Error("Truncated MIDI status byte");
      let status = bytes[cursor.value++];
      if (status < 0x80) {
        cursor.value--;
        if (runningStatus < 0x80 || runningStatus >= 0xf0) {
          throw new Error("MIDI track uses invalid running status");
        }
        status = runningStatus;
      } else if (status < 0xf0) {
        runningStatus = status;
      }

      if (status === 0xff) {
        if (cursor.value >= trackEnd) throw new Error("Truncated MIDI meta event");
        cursor.value++;
        const length = readVariableLength(bytes, cursor);
        cursor.value += length;
        if (cursor.value > trackEnd) throw new Error("Truncated MIDI meta payload");
        continue;
      }

      if (status === 0xf0 || status === 0xf7) {
        const length = readVariableLength(bytes, cursor);
        cursor.value += length;
        if (cursor.value > trackEnd) throw new Error("Truncated MIDI SysEx payload");
        continue;
      }

      const command = status & 0xf0;
      const channel = status & 0x0f;
      const dataLength = command === 0xc0 || command === 0xd0 ? 1 : 2;
      if (cursor.value + dataLength > trackEnd) {
        throw new Error("Truncated MIDI channel event");
      }
      const pitch = bytes[cursor.value++];
      const velocity = dataLength === 2 ? bytes[cursor.value++] : 0;
      const noteKey = `${channel}:${pitch}`;

      if (command === 0x90 && velocity > 0) {
        const stack = active.get(noteKey) || [];
        stack.push({ tick, velocity });
        active.set(noteKey, stack);
      } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
        const start = active.get(noteKey)?.shift();
        if (start) {
          notes.push({
            pitch,
            velocity: start.velocity,
            startTime: start.tick / division,
            duration: Math.max(1 / 16, (tick - start.tick) / division),
          });
        }
      }
    }
    offset = trackEnd;
  }

  if (!notes.length) throw new Error("Generated MIDI contains no playable notes");
  return notes.sort((a, b) => a.startTime - b.startTime || a.pitch - b.pitch);
}

export async function pollStudioAudioJob(
  jobId: string,
  options: {
    signal?: AbortSignal;
    intervalMs?: number;
    maxAttempts?: number;
    fetchImpl?: typeof fetch;
    sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  } = {},
): Promise<StudioAudioJobResult> {
  if (!JOB_ID_PATTERN.test(jobId)) throw new Error("Invalid audio generation job id");
  const fetchImpl = options.fetchImpl || fetch;
  const intervalMs = options.intervalMs ?? 2_000;
  const maxAttempts = options.maxAttempts ?? 150;
  const sleep =
    options.sleep ||
    ((milliseconds, signal) =>
      new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
          reject(new DOMException("Generation polling was cancelled", "AbortError"));
          return;
        }
        const timer = setTimeout(resolve, milliseconds);
        signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new DOMException("Generation polling was cancelled", "AbortError"));
          },
          { once: true },
        );
      }));

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    options.signal?.throwIfAborted?.();
    const response = await fetchImpl(`/api/audio-job/${encodeURIComponent(jobId)}`, {
      credentials: "include",
      signal: options.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || `Audio generation status failed (${response.status})`);
    }
    if (!payload || typeof payload.status !== "string") {
      throw new Error("Audio generation status response was invalid");
    }

    const status = payload.status.toLowerCase();
    if (["error", "failed", "cancelled"].includes(status)) {
      throw new Error(payload.error || payload.message || "Audio generation failed");
    }
    if (["done", "complete", "completed", "succeeded", "success"].includes(status)) {
      const audioUrl = payload.audio_url || payload.audioUrl || payload.url;
      if (typeof audioUrl !== "string" || !audioUrl.trim()) {
        throw new Error("Audio generation completed without an audio URL");
      }
      return { audioUrl, status, payload };
    }
    if (!["queued", "pending", "processing", "running"].includes(status)) {
      throw new Error(`Unknown audio generation job status: ${status}`);
    }
    if (attempt + 1 < maxAttempts) await sleep(intervalMs, options.signal);
  }

  throw new Error("Audio generation timed out before a result was available");
}

export async function fetchStudioMidiNotes(
  jobId: string,
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<GeneratedMidiNote[]> {
  if (!JOB_ID_PATTERN.test(jobId)) throw new Error("Invalid audio generation job id");
  const response = await (options.fetchImpl || fetch)(
    `/api/audio/${encodeURIComponent(jobId)}/midi`,
    { credentials: "include", signal: options.signal },
  );
  if (!response.ok) {
    throw new Error(`Generated MIDI download failed (${response.status})`);
  }
  return parseStandardMidi(await response.arrayBuffer());
}

export function normalizeGeneratedMidiNotes(input: unknown): GeneratedMidiNote[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const note = value as Record<string, unknown>;
    const pitch =
      typeof note.pitch === "number"
        ? note.pitch
        : typeof note.note === "number" && typeof note.octave === "number"
          ? note.note + (note.octave + 1) * 12
          : NaN;
    const startTime = typeof note.startTime === "number" ? note.startTime : 0;
    const duration = typeof note.duration === "number" ? note.duration : NaN;
    const velocity = typeof note.velocity === "number" ? note.velocity : NaN;
    if (
      !Number.isInteger(pitch) ||
      pitch < 0 ||
      pitch > 127 ||
      !Number.isFinite(startTime) ||
      startTime < 0 ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      !Number.isFinite(velocity) ||
      velocity < 0 ||
      velocity > 127
    ) {
      return [];
    }
    return [{ pitch, startTime, duration, velocity }];
  });
}

export async function resolveStudioGenerationResponse(
  response: Record<string, unknown>,
  options: { signal?: AbortSignal } = {},
): Promise<ResolvedStudioGeneration> {
  if (response.success === false) {
    throw new Error(
      typeof response.message === "string"
        ? response.message
        : "Audio generation request failed",
    );
  }

  const jobId = typeof response.jobId === "string" ? response.jobId : undefined;
  let audioFilePath =
    typeof response.audioFilePath === "string"
      ? response.audioFilePath
      : typeof response.audioUrl === "string"
        ? response.audioUrl
        : undefined;
  let duration =
    typeof response.duration === "number" && response.duration > 0
      ? response.duration
      : undefined;
  let generatedNotes = normalizeGeneratedMidiNotes(response.generatedNotes);
  let midiError: string | undefined;

  if (jobId) {
    const job = await pollStudioAudioJob(jobId, { signal: options.signal });
    audioFilePath = job.audioUrl;
    if (!duration && typeof job.payload.duration === "number") {
      duration = job.payload.duration;
    }
    try {
      generatedNotes = await fetchStudioMidiNotes(jobId, { signal: options.signal });
    } catch (error) {
      midiError =
        error instanceof Error ? error.message : "Generated MIDI could not be read";
    }
  }

  if (!audioFilePath && !generatedNotes.length) {
    throw new Error("Generation completed without a playable audio or MIDI result");
  }
  return { audioFilePath, jobId, duration, generatedNotes, midiError };
}