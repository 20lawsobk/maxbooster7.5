export interface BeatMoneyLoopAudioViewer {
  ownerId: string;
  viewerId?: string;
  viewerRole?: string;
  hasCompletedPurchase?: boolean;
}

/** A source WAV is available only to its owner, an admin, or a completed buyer. */
export function canAccessBeatMoneyLoopSourceAudio(
  viewer: BeatMoneyLoopAudioViewer,
): boolean {
  return (
    viewer.viewerId === viewer.ownerId ||
    viewer.viewerRole === "admin" ||
    viewer.hasCompletedPurchase === true
  );
}

/**
 * Old records may have stored the full source URL as their preview URL. Such a
 * URL is never a public preview; fail closed instead of returning the source.
 */
export function getDistinctBeatMoneyLoopPreviewUrl(
  source: unknown,
  audioUrl: string | null | undefined,
  previewUrl: string | null | undefined,
): string | null {
  if (!previewUrl) return null;
  if (source === "beat-money-loop" && previewUrl === audioUrl) return null;
  return previewUrl;
}