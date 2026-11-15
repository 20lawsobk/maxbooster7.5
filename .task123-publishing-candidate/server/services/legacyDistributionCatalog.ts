/**
 * Read-only historical export shapes. These are not Too Lost provider IDs and
 * must never be used for submission, status refresh, or remote mutations.
 */
export interface LabelGridCatalogTrack {
  title: string;
  isrc?: string;
  trackNumber: number;
  duration: number;
}

export interface LabelGridCatalogRelease {
  id: string;
  title: string;
  artist: string;
  releaseDate?: string;
  upc?: string;
  coverUrl?: string;
  releaseType: "album" | "ep" | "single";
  trackCount: number;
  genre?: string;
  platforms: string[];
  tracks?: LabelGridCatalogTrack[];
}

export async function getHistoricalLabelGridCatalog(
  userId: string,
): Promise<LabelGridCatalogRelease[]> {
  const { storage } = await import("../storage.js");
  const releases = await storage.getDistroReleasesByArtist(userId);
  const historical: LabelGridCatalogRelease[] = [];
  for (const release of releases) {
    const metadata = (release.metadata ?? {}) as Record<string, unknown>;
    if (typeof metadata.labelGridReleaseId !== "string") continue;
    const tracks = await storage.getDistroTracksByRelease(release.id);
    historical.push({
      id: metadata.labelGridReleaseId,
      title: release.title,
      artist: String(metadata.artistName ?? ""),
      releaseDate: release.releaseDate
        ? new Date(release.releaseDate).toISOString()
        : undefined,
      upc: typeof metadata.upc === "string" ? metadata.upc : undefined,
      coverUrl: release.artworkUrl ?? undefined,
      releaseType: ["album", "ep", "single"].includes(String(metadata.releaseType))
        ? metadata.releaseType as "album" | "ep" | "single"
        : "single",
      trackCount: tracks.length,
      genre: typeof metadata.genre === "string" ? metadata.genre : undefined,
      // Selected destinations are not proof of historical delivery.
      platforms: Array.isArray(metadata.labelGridPlatforms)
        ? metadata.labelGridPlatforms.filter((p): p is string => typeof p === "string")
        : [],
      tracks: tracks.map((track, index) => ({
        title: track.title,
        isrc: track.isrc ?? undefined,
        trackNumber: track.trackNumber ?? index + 1,
        duration: Number(track.duration ?? 0),
      })),
    });
  }
  return historical;
}
