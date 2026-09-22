import {
  type ToolostDSP,
  type ToolostRelease,
  type ToolostReleaseResponse,
  type ToolostTrack,
} from "../services/toolost-service";
import { submitDistributionOnce } from "../services/distributionSubmissionRepository.js";

type TooLostSubmissionClient = {
  getAvailableDSPs(): Promise<{ dsps: ToolostDSP[] }>;
  createRelease(
    release: ToolostRelease,
    checkpoint?: (data: Record<string, unknown>) => Promise<void>,
  ): Promise<ToolostReleaseResponse>;
};

function platformKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function resolveToolostPlatforms(
  catalog: ToolostDSP[],
  requestedPlatforms: string[],
): string[] {
  return requestedPlatforms.map((requested) => {
    const requestedKey = platformKey(requested);
    const match = catalog.find((dsp) =>
      [dsp.id, dsp.slug, dsp.name].some(
        (candidate) => platformKey(candidate) === requestedKey,
      ),
    );
    if (!match) {
      throw new Error(
        `Too Lost release blocked: selected store "${requested}" is not present in the connected account's live platform catalog.`,
      );
    }
    return match.name;
  });
}

export function buildToolostPayload(
  release: Record<string, unknown>,
  tracks: unknown[],
  platforms: string[],
): ToolostRelease {
  const metadata = (release.metadata as Record<string, unknown>) || {};
  const artworkAiUsage =
    typeof metadata.artworkAiUsage === "string"
      ? metadata.artworkAiUsage
      : undefined;
  const audioAiUsage =
    typeof metadata.audioAiUsage === "string"
      ? metadata.audioAiUsage
      : undefined;
  const compositionAiUsage =
    typeof metadata.compositionAiUsage === "string"
      ? metadata.compositionAiUsage
      : undefined;

  if (
    !["none", "ai-generated"].includes(artworkAiUsage || "") ||
    !["none", "ai-assisted"].includes(audioAiUsage || "") ||
    !["none", "ai-assisted"].includes(compositionAiUsage || "")
  ) {
    throw new Error(
      "Too Lost requires valid explicit AI-involvement declarations for the artwork, recording, and composition. Review and save all three declarations before submitting.",
    );
  }
  const validArtworkAiUsage = artworkAiUsage as "none" | "ai-generated";
  const releaseType =
    metadata.releaseType === "EP"
      ? "EP"
      : metadata.releaseType === "album"
        ? "Album"
        : "Single";
  const languageCodes: Record<string, string> = {
    English: "en",
    Spanish: "es",
    French: "fr",
    German: "de",
    Italian: "it",
    Portuguese: "pt",
    Japanese: "ja",
    Korean: "ko",
    Mandarin: "zh",
  };
  const language = String(metadata.language || "").trim();

  return {
    title: String(release.title || ""),
    artist: String(
      release.artistName ||
        release.artist ||
        metadata.artistName ||
        "Unknown Artist",
    ),
    releaseType,
    language: languageCodes[language] || language,
    composerName: String(metadata.composerName || ""),
    acceptTerms: metadata.acceptTerms === true,
    confirmRights: metadata.confirmRights === true,
    confirmYoutubeRights: metadata.confirmYoutubeRights === true,
    releaseDate: release.releaseDate
      ? new Date(release.releaseDate as string | Date).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0],
    upc: (release as { upc?: string }).upc,
    artwork: String(
      release.artworkUrl || metadata.artworkUrl || metadata.artwork || "",
    ),
    genre: String(release.genre || metadata.primaryGenre || "Other"),
    platforms,
    label: metadata.labelName ? String(metadata.labelName) : undefined,
    copyrightYear: Number(metadata.copyrightYear) || undefined,
    copyrightOwner: metadata.copyrightOwner
      ? String(metadata.copyrightOwner)
      : undefined,
    territoryMode:
      (metadata.territoryMode as "worldwide" | "include" | "exclude") ||
      "worldwide",
    territories: Array.isArray(metadata.territories)
      ? (metadata.territories as string[])
      : [],
    artworkAiUsage: validArtworkAiUsage,
    tracks: tracks.map((track, index) => {
      const value = track as Record<string, unknown>;
      return {
        title: String(value.title || ""),
        artist: String(
          value.artistName ||
            release.artistName ||
            release.artist ||
            metadata.artistName ||
            "Unknown Artist",
        ),
        isrc: value.isrc ? String(value.isrc) : undefined,
        audioFile: String(value.audioUrl || value.fileUrl || ""),
        duration: Number(value.duration) || 0,
        trackNumber: Number(value.trackNumber) || index + 1,
        explicit: Boolean(value.explicit),
        lyrics: value.lyrics ? String(value.lyrics) : undefined,
        audioAiUsage,
        compositionAiUsage,
      } satisfies ToolostTrack;
    }),
  };
}

export async function submitToolostRelease({
  client,
  userId,
  releaseId,
  release,
  tracks,
  requestedPlatforms,
}: {
  client: TooLostSubmissionClient;
  userId: string;
  releaseId: string;
  release: Record<string, unknown>;
  tracks: unknown[];
  requestedPlatforms: string[];
}): Promise<{
  providerPlatforms: string[];
  payload: ToolostRelease;
  result: ToolostReleaseResponse;
}> {
  const liveCatalog = await client.getAvailableDSPs();
  const providerPlatforms = resolveToolostPlatforms(
    liveCatalog.dsps,
    requestedPlatforms,
  );
  const payload = buildToolostPayload(release, tracks, providerPlatforms);
  const result = await submitDistributionOnce(
    "toolost",
    userId,
    releaseId,
    payload,
    (checkpoint) => client.createRelease(payload, checkpoint),
  );
  return { providerPlatforms, payload, result };
}