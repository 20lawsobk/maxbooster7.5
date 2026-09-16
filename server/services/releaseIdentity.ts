// Shared release/track identity matching used by every catalog-import entry
// point (CSV/DDEX/XLSX upload in catalogImporter.ts, profile auto-sync and
// Too Lost single-release import in distributionDataTransferService.ts).
//
// Historically each importer carried its own copy of this normalization
// logic and its own idea of "does this release already exist?" scoped to
// only the one table it writes to (legacy `releases` or newer
// `distro_releases`). That let the same real-world release be imported once
// per table. Centralizing normalization guarantees both importers agree on
// what counts as "the same artist" or "the same title", and
// findExistingReleaseAcrossTables gives both importers a single place to ask
// "does this release exist ANYWHERE for this user" before creating a new row.
import { eq } from "drizzle-orm";
import { db } from "../db";
import { releases, distroReleases, distroTracks } from "@shared/schema";

const dedupeStrings = (values: unknown[]): string[] =>
  Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );

export const normalizeArtistNameForIdentity = (value: unknown): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+(?:feat\.?|ft\.?|featuring)\b.*/i, "")
    .replace(/\s*\([^)]{0,45}\)\s*/g, " ")
    .replace(/[^a-z0-9]/g, "");

export const normalizeReleaseTitleForIdentity = (value: unknown): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s*-\s*(?:single|ep|album)\s*$/i, "")
    .replace(/[^a-z0-9]/g, "");

export const normalizeIdentityValue = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase();

export const normalizedUpc = (value: unknown): string | undefined => {
  const result = normalizeIdentityValue(value);
  return result || undefined;
};

export const releaseArtistTitleKey = (
  artistName: unknown,
  title: unknown,
): string =>
  `${normalizeArtistNameForIdentity(artistName)}:${normalizeReleaseTitleForIdentity(title)}`;

/**
 * True when both sides carry a usable identity signal (ISRC, then track
 * number, then title) that says "this is the same track". Mirrors an
 * OR-cascade rather than a single derived key so a track that gains an ISRC
 * between scans (one side has it, the other doesn't yet) still matches
 * instead of appearing as a second, duplicate track entry.
 */
const isSameTrack = (
  incoming: { isrc: string; trackNumber: number; hasTrackNumber: boolean; title: string },
  candidate: Record<string, unknown>,
): boolean => {
  const candidateIsrc = normalizeIdentityValue(candidate.isrc);
  if (incoming.isrc && candidateIsrc) {
    return incoming.isrc === candidateIsrc;
  }
  const candidateNumber = Number(candidate.trackNumber);
  const candidateHasNumber =
    Number.isFinite(candidateNumber) && candidateNumber > 0;
  if (incoming.hasTrackNumber && candidateHasNumber) {
    return incoming.trackNumber === candidateNumber;
  }
  if (!incoming.hasTrackNumber && !candidateHasNumber && incoming.title) {
    return (
      incoming.title === normalizeReleaseTitleForIdentity(candidate.title)
    );
  }
  return false;
};

/**
 * Merge track metadata instead of replacing it with whichever provider was
 * scanned last. Providers often disagree about ISRC/duration availability and
 * one provider may return only a partial track list.
 *
 * Matching uses an OR-cascade (ISRC, else track number, else title) checked
 * per candidate rather than a single derived Map key. A single derived key
 * would key a track without an ISRC by its track number, then key the same
 * track WITH an ISRC (enriched by a second provider) by that ISRC instead —
 * two different keys for one physical track, producing a duplicate entry the
 * moment an ISRC arrives later than the first scan.
 */
export const mergeTrackMetadata = (
  existingTracks: unknown,
  incomingTracks: unknown,
): Array<Record<string, unknown>> => {
  const merged: Array<Record<string, unknown>> = [];

  const findMatchIndex = (track: Record<string, unknown>): number => {
    const isrc = normalizeIdentityValue(track.isrc);
    const trackNumber = Number(track.trackNumber);
    const hasTrackNumber = Number.isFinite(trackNumber) && trackNumber > 0;
    const title = normalizeReleaseTitleForIdentity(track.title);
    return merged.findIndex((candidate) =>
      isSameTrack({ isrc, trackNumber, hasTrackNumber, title }, candidate),
    );
  };

  const add = (value: unknown) => {
    if (!Array.isArray(value)) return;
    for (const rawTrack of value) {
      if (!rawTrack || typeof rawTrack !== "object") continue;
      const track = { ...(rawTrack as Record<string, unknown>) };
      const trackNumber = Number(track.trackNumber);
      const hasTrackNumber = Number.isFinite(trackNumber) && trackNumber > 0;
      const hasIdentity =
        Boolean(normalizeIdentityValue(track.isrc)) ||
        hasTrackNumber ||
        Boolean(normalizeReleaseTitleForIdentity(track.title));
      if (!hasIdentity) continue;

      const matchIndex = findMatchIndex(track);
      if (matchIndex === -1) {
        merged.push(track);
        continue;
      }

      // Preserve every existing field while allowing a later provider to
      // enrich absent/null values. Never overwrite useful data with null.
      const enriched = { ...merged[matchIndex] };
      for (const [field, fieldValue] of Object.entries(track)) {
        if (
          fieldValue !== undefined &&
          fieldValue !== null &&
          fieldValue !== ""
        ) {
          enriched[field] = fieldValue;
        }
      }
      merged[matchIndex] = enriched;
    }
  };

  add(existingTracks);
  add(incomingTracks);

  return merged.sort((a, b) => {
    const aNumber = Number(a.trackNumber);
    const bNumber = Number(b.trackNumber);
    if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) {
      return aNumber - bNumber;
    }
    if (Number.isFinite(aNumber)) return -1;
    if (Number.isFinite(bNumber)) return 1;
    return String(a.title ?? "").localeCompare(String(b.title ?? ""));
  });
};

export interface CrossTableReleaseMatch {
  table: "releases" | "distro_releases";
  id: string;
  title: string;
}

/**
 * Look up whether a release already exists for this user in EITHER release
 * table. The CSV/DDEX/XLSX importer (catalogImporter.ts) writes to the
 * legacy `releases` table; the profile-sync and Too Lost single-release
 * importers (distributionDataTransferService.ts) write to `distro_releases`.
 * Each importer already de-dupes against its own table — this closes the gap
 * between them so importing "the same" release through both paths can't
 * create two separate rows.
 *
 * A hit here only prevents a duplicate INSERT. It does not attempt to update
 * a match found in the *other* table's shape, since the two tables are not
 * interchangeable (different owner column, different consumers). The
 * caller's own same-table path still gets full metadata enrichment on match.
 */
export async function findExistingReleaseAcrossTables(
  userId: string,
  identity: { upc?: string; title: string; artistName: string },
  queryDb: any = db,
): Promise<CrossTableReleaseMatch | null> {
  const normalizedArtist = normalizeArtistNameForIdentity(identity.artistName);
  const normalizedTitle = normalizeReleaseTitleForIdentity(identity.title);
  const incomingUpc = normalizedUpc(identity.upc);
  if (!incomingUpc && !normalizedArtist) return null;

  const [legacyRows, distroRows] = await Promise.all([
    queryDb.select().from(releases).where(eq(releases.userId, userId)),
    queryDb
      .select()
      .from(distroReleases)
      .where(eq(distroReleases.artistId, userId)),
  ]);

  // UPC is a globally unique code, so a same-user UPC match is authoritative
  // on its own. Requiring an artist match first would miss it for historical
  // rows that never had artist metadata persisted (the legacy `releases`
  // table has no dedicated artist column; older imports may not have written
  // `metadata.artistName` either), even though the UPC proves it is the same
  // release. Artist+title is only the fallback for when a usable UPC isn't
  // available on both sides.
  const matchesIdentity = (
    candidateArtistName: unknown,
    candidateTitle: unknown,
    candidateUpc: unknown,
  ): boolean => {
    const candidateUpcNormalized = normalizedUpc(candidateUpc);
    if (incomingUpc && candidateUpcNormalized) {
      return incomingUpc === candidateUpcNormalized;
    }
    if (!normalizedArtist) return false;
    if (normalizeArtistNameForIdentity(candidateArtistName) !== normalizedArtist) {
      return false;
    }
    return normalizeReleaseTitleForIdentity(candidateTitle) === normalizedTitle;
  };

  for (const row of legacyRows) {
    const metadata = (row.metadata || {}) as Record<string, unknown>;
    const candidateArtist = metadata.artistName ?? metadata.artist;
    if (matchesIdentity(candidateArtist, row.title, row.upc)) {
      return { table: "releases", id: row.id, title: row.title };
    }
  }

  for (const row of distroRows) {
    const metadata = (row.metadata || {}) as Record<string, unknown>;
    if (matchesIdentity(metadata.artistName, row.title, metadata.upc)) {
      return { table: "distro_releases", id: row.id, title: row.title };
    }
  }

  return null;
}

/**
 * Backfill patch for a release row matched in the OTHER table from the one
 * currently importing. There is no cross-table merge capability (the two
 * tables have different owner columns and consumers), but discarding cover
 * art, tracks, or platform data the current scan/row actually has — just
 * because a same-release row already exists in the other table — would
 * silently violate "metadata importation" for every release that happens to
 * get created in one table before the other. This only FILLS gaps (never
 * overwrites a real existing value) using the same non-destructive semantics
 * as `mergeTrackMetadata` and the same-table merge in
 * `upsertCatalogReleaseInTransaction`.
 */
export function buildCrossTableBackfillPatch(
  existing: { artworkUrl?: string | null; metadata: unknown },
  incoming: {
    upc?: string | null;
    coverUrl?: string | null;
    platforms?: string[];
    tracks?: Array<Record<string, unknown>>;
  },
): { artworkUrl?: string; metadata: Record<string, unknown> } | null {
  const existingMetadata = (existing.metadata || {}) as Record<
    string,
    unknown
  >;

  const coverUrl =
    existing.artworkUrl ||
    (typeof existingMetadata.coverUrl === "string" &&
      existingMetadata.coverUrl) ||
    (typeof existingMetadata.coverArtUrl === "string" &&
      existingMetadata.coverArtUrl) ||
    incoming.coverUrl ||
    null;

  const mergedPlatforms = dedupeStrings([
    ...(Array.isArray(existingMetadata.distributionPlatforms)
      ? existingMetadata.distributionPlatforms
      : []),
    ...(Array.isArray(existingMetadata.platforms)
      ? existingMetadata.platforms
      : []),
    ...(incoming.platforms ?? []),
  ]);

  const tracks = incoming.tracks?.length
    ? mergeTrackMetadata(existingMetadata.tracks, incoming.tracks)
    : null;

  const existingUpc = normalizedUpc(existingMetadata.upc as string);
  const incomingUpc = normalizedUpc(incoming.upc ?? undefined);

  const gainedCoverArt = Boolean(coverUrl) && !existing.artworkUrl;
  const gainedPlatforms =
    mergedPlatforms.length >
    dedupeStrings([
      ...(Array.isArray(existingMetadata.distributionPlatforms)
        ? existingMetadata.distributionPlatforms
        : []),
      ...(Array.isArray(existingMetadata.platforms)
        ? existingMetadata.platforms
        : []),
    ]).length;
  const gainedTracks =
    tracks !== null &&
    tracks.length >
      (Array.isArray(existingMetadata.tracks)
        ? existingMetadata.tracks.length
        : 0);
  const gainedUpc = !existingUpc && Boolean(incomingUpc);

  if (!gainedCoverArt && !gainedPlatforms && !gainedTracks && !gainedUpc) {
    return null;
  }

  const patchMetadata: Record<string, unknown> = { ...existingMetadata };
  if (coverUrl) {
    patchMetadata.coverUrl = coverUrl;
    patchMetadata.coverArtUrl = coverUrl;
  }
  if (mergedPlatforms.length) {
    patchMetadata.distributionPlatforms = mergedPlatforms;
    patchMetadata.platforms = mergedPlatforms;
  }
  if (tracks !== null) {
    patchMetadata.tracks = tracks;
  }
  if (gainedUpc) {
    patchMetadata.upc = incomingUpc;
  }

  return {
    ...(gainedCoverArt ? { artworkUrl: coverUrl as string } : {}),
    metadata: patchMetadata,
  };
}

/**
 * Keep `distro_tracks` rows in sync with a release's merged track list.
 * Shared by both catalog-import entry points: `distributionDataTransferService`
 * (its native table) and `catalogImporter`'s cross-table backfill (a CSV/DDEX
 * row enriching a release that already exists in `distro_releases`).
 */
export async function syncDistroTrackRows(
  tx: any,
  releaseId: string,
  tracks: Array<Record<string, unknown>>,
): Promise<void> {
  if (!tracks.length) return;
  const existingRows = await tx
    .select()
    .from(distroTracks)
    .where(eq(distroTracks.releaseId, releaseId));

  for (const track of tracks) {
    const trackNumber = Number(track.trackNumber);
    const isrc = normalizeIdentityValue(track.isrc);
    const existing = existingRows.find((row: Record<string, unknown>) => {
      if (isrc && normalizeIdentityValue(row.isrc) === isrc) return true;
      return Number(row.trackNumber) === trackNumber;
    });
    if (existing) {
      const [updated] = await tx
        .update(distroTracks)
        .set({
          title: existing.title || String(track.title || "Untitled Track"),
          trackNumber:
            Number(existing.trackNumber) || trackNumber || existingRows.length + 1,
          isrc: existing.isrc || (track.isrc as string | undefined) || null,
          duration:
            existing.duration ??
            (typeof track.duration === "number" ? track.duration : null),
        })
        .where(eq(distroTracks.id, existing.id))
        .returning();
      const index = existingRows.findIndex(
        (row: any) => row.id === existing.id,
      );
      if (index >= 0) existingRows[index] = updated;
      continue;
    }

    const [created] = await tx
      .insert(distroTracks)
      .values({
        releaseId,
        title: String(track.title || "Untitled Track"),
        trackNumber: trackNumber || existingRows.length + 1,
        isrc: (track.isrc as string | undefined) || null,
        duration: typeof track.duration === "number" ? track.duration : null,
      })
      .returning();
    existingRows.push(created);
  }
}
