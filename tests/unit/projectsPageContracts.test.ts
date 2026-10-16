import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  formatProjectDate,
  formatProjectDuration,
  formatProjectFileSize,
  normalizeMutationSuccess,
  normalizeProjectResponse,
  normalizeProjectsResponse,
  normalizeSongwritingAssist,
  normalizeSongwritingDraftInput,
  normalizeSongwritingSessions,
  readProjectsJson,
  resolveProjectAudioSource,
} from "../../client/src/lib/projectsPageContracts";
import { normalizeProjectDetailsUpdate } from "../../server/lib/projectPageContracts";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const project = {
  id: "project-1",
  userId: "user-1",
  title: "Reviewed Project",
  createdAt: "2026-10-16T12:00:00.000Z",
  updatedAt: "2026-10-16T12:05:00.000Z",
};

describe("Projects page API contracts", () => {
  it("accepts the canonical /api/projects envelope", () => {
    expect(normalizeProjectsResponse({ data: [project] })).toEqual({
      data: [project],
    });
  });

  it("rejects malformed project list and item responses", () => {
    expect(() => normalizeProjectsResponse([project])).toThrow(/API contract/i);
    expect(() =>
      normalizeProjectsResponse({ data: [{ ...project, createdAt: "bad-date" }] }),
    ).toThrow(/invalid project/i);
    expect(() => normalizeProjectResponse({ id: "missing-fields" })).toThrow(
      /API contract/i,
    );
  });

  it("requires explicit mutation confirmation", () => {
    expect(normalizeMutationSuccess({ success: true })).toEqual({ success: true });
    expect(() => normalizeMutationSuccess({ success: false })).toThrow(
      /did not confirm/i,
    );
  });

  it("bounds stalled response bodies", async () => {
    vi.useFakeTimers();
    try {
      const pending = readProjectsJson(
        { json: () => new Promise<never>(() => {}) },
        25,
      );
      await vi.advanceTimersByTimeAsync(25);
      await expect(pending).rejects.toThrow(/too long/i);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Projects playback boundary", () => {
  it("allows secure HTTPS and same-origin API audio", () => {
    expect(resolveProjectAudioSource("https://cdn.example.com/a.wav")).toBe(
      "https://cdn.example.com/a.wav",
    );
    expect(resolveProjectAudioSource("/api/storage/audio/a.wav")).toBe(
      "/api/storage/audio/a.wav",
    );
    expect(resolveProjectAudioSource("uploads/a.wav")).toBe(
      "/api/marketplace/audio/uploads/a.wav",
    );
  });

  it.each([
    "http://cdn.example.com/a.wav",
    "javascript:alert(1)",
    "data:audio/wav;base64,AAAA",
    "//cdn.example.com/a.wav",
  ])("rejects insecure or ambiguous source %s", (source) => {
    expect(() => resolveProjectAudioSource(source)).toThrow();
  });

  it("formats invalid and valid metadata safely", () => {
    expect(formatProjectDate("not-a-date")).toBe("Date unavailable");
    expect(formatProjectDuration(125.9)).toBe("2:05");
    expect(formatProjectDuration(Number.NaN)).toBe("Duration unavailable");
    expect(formatProjectFileSize(1024)).toBe("1 KB");
    expect(formatProjectFileSize(-1)).toBe("Size unavailable");
  });
});

describe("direct project mutation boundary", () => {
  it("normalizes legacy bpm onto the studio route's tempo field", () => {
    expect(
      normalizeProjectDetailsUpdate({
        title: "  Updated  ",
        bpm: 128,
        description: "  notes  ",
      }),
    ).toEqual({
      ok: true,
      value: {
        title: "Updated",
        description: "notes",
        tempo: 128,
      },
    });
  });

  it.each([
    {},
    { unknown: true },
    { title: "" },
    { title: "x".repeat(256) },
    { description: "x".repeat(5001) },
    { genre: "x".repeat(101) },
    { bpm: 10 },
    { tempo: 120, bpm: 121 },
    { sampleRate: 200000 },
    { bitDepth: 12 },
    { timeSignature: "four-four" },
  ])("rejects invalid direct update %o", (payload) => {
    expect(normalizeProjectDetailsUpdate(payload).ok).toBe(false);
  });
});

describe("Songwriting contracts inside Projects", () => {
  it("validates session and AI-assist response shapes", () => {
    expect(
      normalizeSongwritingSessions([
        {
          id: "song-1",
          title: "Hook",
          genre: "hip-hop",
          bpm: 90,
        },
      ]),
    ).toHaveLength(1);

    expect(
      normalizeSongwritingAssist({
        suggestions: ["Try a stronger opening line"],
        rhymes: ["light", "night"],
        chordProgression: "C - G - Am - F",
        structures: ["Verse - Chorus"],
      }),
    ).toEqual({
      suggestions: ["Try a stronger opening line"],
      rhymes: ["light", "night"],
      chordProgression: "C - G - Am - F",
      structures: ["Verse - Chorus"],
    });

    expect(() => normalizeSongwritingSessions({ data: [] })).toThrow();
    expect(() =>
      normalizeSongwritingAssist({
        suggestions: [],
        rhymes: "night",
        chordProgression: "C",
        structures: [],
      }),
    ).toThrow(/rhymes/i);
  });

  it("bounds songwriting data before it reaches the API", () => {
    const valid = {
      title: "Song",
      genre: "pop",
      mood: "bright",
      bpm: 120,
      key: "C",
      lyrics: "hello",
      notes: "note",
    };
    expect(normalizeSongwritingDraftInput(valid)).toEqual(valid);
    expect(() =>
      normalizeSongwritingDraftInput({ ...valid, bpm: 12 }),
    ).toThrow(/BPM/i);
    expect(() =>
      normalizeSongwritingDraftInput({ ...valid, lyrics: "x".repeat(20_001) }),
    ).toThrow(/Lyrics/i);
    expect(() =>
      normalizeSongwritingDraftInput({ ...valid, notes: "x".repeat(10_001) }),
    ).toThrow(/Notes/i);
  });
});

describe("Projects route integration contract", () => {
  it("routes through the reviewed implementation without ts-nocheck", () => {
    const routePage = read("client/src/pages/Projects.tsx");
    const implementation = read("client/src/pages/ProjectsPageImpl.tsx");
    expect(routePage).toContain('export { default } from "./ProjectsPageImpl"');
    expect(routePage).not.toContain("@ts-nocheck");
    expect(implementation).not.toContain("@ts-nocheck");
    expect(implementation).toContain("normalizeProjectsResponse");
    expect(implementation).toContain("resolveProjectAudioSource");
    expect(implementation).toContain("window.confirm");
    expect(implementation).toContain('maxLength={20000}');
    expect(implementation).toContain('maxLength={10000}');
  });

  it("server-gates every Projects page API family behind paid access", () => {
    const sessionAuth = read("server/auth.ts");
    const jwtAuth = read("server/middleware/auth.ts");

    expect(sessionAuth).toContain('"/api/projects"');
    expect(sessionAuth).toContain('"/api/studio"');
    expect(sessionAuth).toContain('"/api/songwriting"');
    expect(sessionAuth).toContain("normalizeProjectDetailsUpdate");
    expect(sessionAuth).toContain('code: "PAID_SUBSCRIPTION_REQUIRED"');

    expect(jwtAuth).toContain('"/api/studio"');
    expect(jwtAuth).toContain('"/api/songwriting"');
    expect(jwtAuth).toContain('code: "PAID_SUBSCRIPTION_REQUIRED"');
  });
});
