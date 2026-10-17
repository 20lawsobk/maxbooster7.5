import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  createReleaseDraftSchema,
  editReleaseDraftSchema,
  createTrackSchema,
  editTrackSchema,
  updateReleaseSchema,
} from "../../server/routes/distribution-release-schemas.js";

// Pure payload construction only: no DB, credentials, account, or provider requests.
vi.mock("../../server/services/distributionSubmissionRepository.js", () => ({
  submitDistributionOnce: vi.fn(),
}));

describe("distribution completion draft/track contracts", () => {
  it("does not reset explicit content or territory restrictions in unrelated PATCHes", () => {
    expect(updateReleaseSchema.parse({ title: "Renamed" })).toEqual({ title: "Renamed" });
    expect(editTrackSchema.parse({ title: "Renamed" })).toEqual({ title: "Renamed" });
    expect(editTrackSchema.parse({ explicit: false })).toEqual({ explicit: false });
    expect(editReleaseDraftSchema.parse({ territoryMode: "include" }))
      .toEqual({ territoryMode: "include" });
  });
  it("saves an incomplete wizard draft without inventing compliance declarations", () => {
    const draft = createReleaseDraftSchema.parse({
      title: "Unfinished release",
      artistName: "",
      primaryGenre: "",
      copyrightOwner: "",
      upc: "",
    });
    expect(draft.artworkAiUsage).toBeUndefined();
    expect(draft.audioAiUsage).toBeUndefined();
    expect(draft.compositionAiUsage).toBeUndefined();
    expect(draft.composerName).toBeUndefined();
    expect(draft.acceptTerms).toBeUndefined();
    expect(draft.confirmRights).toBeUndefined();
    expect(draft.confirmYoutubeRights).toBeUndefined();
    expect(draft.upc).toBe("");
    expect(editReleaseDraftSchema.parse({ artistName: "" })).toEqual({ artistName: "" });
  });

  it("retains explicitly supplied negative confirmations rather than promoting them", () => {
    expect(createReleaseDraftSchema.parse({
      title: "Draft", acceptTerms: false, confirmRights: false,
      artworkAiUsage: "ai-generated",
    })).toMatchObject({ acceptTerms: false, confirmRights: false, artworkAiUsage: "ai-generated" });
  });

  it("accepts truthful assigned identifiers and per-track explicit/string lyrics", () => {
    expect(createTrackSchema.parse({
      title: "Track",
      trackNumber: 2,
      isrc: "USABC2600001",
      explicit: true,
      lyrics: "One track's lyrics",
      clientUploadId: "local-upload-1",
    })).toMatchObject({
      trackNumber: 2, isrc: "USABC2600001", explicit: true,
      lyrics: "One track's lyrics", clientUploadId: "local-upload-1",
    });
    expect(() => createTrackSchema.parse({ title: "Track", explicit: true })).toThrow();
    expect(() => createTrackSchema.parse({ title: "Track", trackNumber: 1, lyrics: { track1: "wrong" } })).toThrow();
    expect(() => createTrackSchema.parse({ title: "Track", trackNumber: 1, isrc: "provisional" })).toThrow();
  });

  it("allows missing official identifiers only while saving a track draft", () => {
    const track = createTrackSchema.parse({ title: "Track", trackNumber: 1 });
    expect(track.isrc).toBeUndefined();
    expect(createTrackSchema.parse({ title: "Track", trackNumber: 1, isrc: "" }).isrc).toBe("");
  });

  it("maps persisted track metadata to Too Lost without losing explicit lyrics", async () => {
    const { buildToolostPayload } = await import("../../server/routes/distribution-toolost-submission.js");
    const payload = buildToolostPayload({
      title: "Fixture only", releaseDate: "2026-01-01",
      metadata: {
        upc: "012345678905", artworkAiUsage: "none",
        audioAiUsage: "none", compositionAiUsage: "none",
        composerName: "Fixture composer", acceptTerms: false, confirmRights: false,
      },
    }, [{
      title: "Fixture track", trackNumber: 2, isrc: "USABC2600001",
      audioUrl: "https://example.invalid/audio.flac",
      metadata: { explicit: true, lyrics: "Persisted lyrics" },
    }], ["Spotify"]);
    expect(payload.upc).toBe("012345678905");
    expect(payload.acceptTerms).toBe(false);
    expect(payload.confirmRights).toBe(false);
    expect(payload.tracks[0]).toMatchObject({
      explicit: true, lyrics: "Persisted lyrics", trackNumber: 2, isrc: "USABC2600001",
    });
  });

  it("rejects absent AI declarations at payload construction", async () => {
    const { buildToolostPayload } = await import("../../server/routes/distribution-toolost-submission.js");
    expect(() => buildToolostPayload({ metadata: {} }, [], [])).toThrow(/explicit AI-involvement/);
  });
});

describe("distribution completion source guards (not rendered UI coverage)", () => {
  const wizard = readFileSync("client/src/components/distribution/ReleaseWizard.tsx", "utf8");
  const routes = readFileSync("server/routes/distribution.ts", "utf8");
  const page = readFileSync("client/src/pages/Distribution.tsx", "utf8");

  it("hydrates a selected owned draft including existing media", () => {
    expect(wizard).toContain('apiRequest("GET", `/api/distribution/releases/${encodeURIComponent(releaseId)}`)');
    expect(routes).toContain("res.json({ ...release, tracks, royaltySplits: savedSplits })");
    expect(wizard).toContain("setExistingArtwork(release.artworkUrl");
    expect(page).toContain("releaseId={wizardReleaseId}");
    expect(page).toContain("Review &amp; complete");
  });

  it("checkpoints uploads and only invokes submitted-success callback after confirmed submission", () => {
    expect(wizard).toContain("uploadedTracks.current.get(audioFile.id)");
    expect(wizard).toContain("uploadedTracks.current.set(audioFile.id, uploaded)");
    expect(routes).toContain("if (existing) return res.json(existing)");
    expect(wizard).toContain('if (status === "submitted") onComplete?.()');
    expect(wizard).toContain('submissionStatus === "submitted" && createPreSave');
  });

  it("uses actual child component contracts for completion fields", () => {
    expect(wizard).toContain("lyricsData={lyricsTracks.map");
    expect(wizard).toContain("selectedDate={releaseDate}");
    expect(wizard).toContain("onChange={setSelectedTerritories}");
    expect(wizard).toContain("previewUrl={artworkPreview}");
    expect(wizard).not.toContain("lyrics: lyrics,");
    expect(wizard).not.toContain("ISRCs are auto-generated");
  });
});
