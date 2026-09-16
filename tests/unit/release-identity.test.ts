import { describe, expect, it } from "vitest";
import {
  normalizeArtistNameForIdentity,
  normalizeReleaseTitleForIdentity,
  normalizedUpc,
  releaseArtistTitleKey,
  mergeTrackMetadata,
} from "../../server/services/releaseIdentity.js";

// Pure-function tests, no mocking: releaseIdentity.ts is the single shared
// source of truth every catalog-import entry point uses to decide "is this
// the same release/track". A regression here silently reopens duplicate
// imports across the whole catalog system, not just one importer.

describe("normalizeArtistNameForIdentity", () => {
  it("lowercases, strips accents, and removes punctuation/spacing", () => {
    expect(normalizeArtistNameForIdentity("Beyoncé")).toBe("beyonce");
    expect(normalizeArtistNameForIdentity("The Weeknd")).toBe("theweeknd");
  });

  it("drops a featuring clause", () => {
    expect(normalizeArtistNameForIdentity("Drake feat. Rihanna")).toBe(
      "drake",
    );
    expect(normalizeArtistNameForIdentity("Drake ft. Rihanna")).toBe("drake");
    expect(normalizeArtistNameForIdentity("Drake featuring Rihanna")).toBe(
      "drake",
    );
  });

  it("drops a short parenthetical", () => {
    expect(normalizeArtistNameForIdentity("Artist Name (Official)")).toBe(
      "artistname",
    );
  });

  it("treats null/undefined as an empty identity", () => {
    expect(normalizeArtistNameForIdentity(undefined)).toBe("");
    expect(normalizeArtistNameForIdentity(null)).toBe("");
  });
});

describe("normalizeReleaseTitleForIdentity", () => {
  it("drops a trailing release-type suffix", () => {
    expect(normalizeReleaseTitleForIdentity("Midnights - Album")).toBe(
      "midnights",
    );
    expect(normalizeReleaseTitleForIdentity("Some Song - Single")).toBe(
      "somesong",
    );
    expect(normalizeReleaseTitleForIdentity("Some EP - EP")).toBe("someep");
  });

  it("is stable for titles without a suffix", () => {
    expect(normalizeReleaseTitleForIdentity("First Light")).toBe(
      "firstlight",
    );
  });
});

describe("normalizedUpc", () => {
  it("normalizes case/whitespace and treats blank as undefined", () => {
    expect(normalizedUpc(" 123456789012 ")).toBe("123456789012");
    expect(normalizedUpc("")).toBeUndefined();
    expect(normalizedUpc(undefined)).toBeUndefined();
  });
});

describe("releaseArtistTitleKey", () => {
  it("combines normalized artist and title into one identity key", () => {
    expect(
      releaseArtistTitleKey("Drake feat. Future", "Way 2 Sexy - Single"),
    ).toBe(releaseArtistTitleKey("DRAKE", "Way 2 Sexy"));
  });

  it("distinguishes genuinely different artist/title pairs", () => {
    expect(releaseArtistTitleKey("Drake", "Way 2 Sexy")).not.toBe(
      releaseArtistTitleKey("Drake", "Hotline Bling"),
    );
  });
});

describe("mergeTrackMetadata", () => {
  it("matches by ISRC when both sides have one, preferring the latest non-empty values", () => {
    const merged = mergeTrackMetadata(
      [{ title: "Intro", trackNumber: 1, isrc: "US1234500001", duration: 30 }],
      [
        {
          title: "Intro (Remaster)",
          trackNumber: 1,
          isrc: "US1234500001",
          duration: 32,
        },
      ],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].duration).toBe(32);
    expect(merged[0].title).toBe("Intro (Remaster)");
  });

  it("does not duplicate a track that gains an ISRC between scans (OR-cascade, not a single derived key)", () => {
    // First scan (e.g. Too Lost): no ISRC yet, only a track number.
    const afterFirstScan = mergeTrackMetadata(
      [],
      [{ title: "First Light", trackNumber: 1, duration: 210 }],
    );
    expect(afterFirstScan).toHaveLength(1);

    // Second scan (e.g. a different DSP/profile): same track now carries an
    // ISRC. A single derived key (isrc-if-present-else-trackNumber) would key
    // this scan's track differently from the first and create a duplicate.
    const afterSecondScan = mergeTrackMetadata(afterFirstScan, [
      {
        title: "First Light",
        trackNumber: 1,
        isrc: "US-MXB-24-00001",
        duration: 210,
      },
    ]);

    expect(afterSecondScan).toHaveLength(1);
    expect(afterSecondScan[0].isrc).toBe("US-MXB-24-00001");
  });

  it("matches by title when neither side has an ISRC or track number", () => {
    const merged = mergeTrackMetadata(
      [{ title: "Interlude" }],
      [{ title: "Interlude", duration: 45 }],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].duration).toBe(45);
  });

  it("keeps two genuinely different tracks separate", () => {
    const merged = mergeTrackMetadata(
      [{ title: "First Light", trackNumber: 1, isrc: "US1" }],
      [{ title: "Afterglow", trackNumber: 2, isrc: "US2" }],
    );
    expect(merged).toHaveLength(2);
  });

  it("never overwrites a real value with null/undefined/empty from the other side", () => {
    const merged = mergeTrackMetadata(
      [{ title: "First Light", trackNumber: 1, isrc: "US1", duration: 210 }],
      [{ title: "First Light", trackNumber: 1, isrc: "US1", duration: null }],
    );
    expect(merged[0].duration).toBe(210);
  });

  it("sorts merged tracks by track number", () => {
    const merged = mergeTrackMetadata(
      [{ title: "B", trackNumber: 2, isrc: "US2" }],
      [{ title: "A", trackNumber: 1, isrc: "US1" }],
    );
    expect(merged.map((t) => t.title)).toEqual(["A", "B"]);
  });

  it("ignores an incoming track with no usable identity signal at all", () => {
    const merged = mergeTrackMetadata([], [{ duration: 30 }]);
    expect(merged).toHaveLength(0);
  });
});
