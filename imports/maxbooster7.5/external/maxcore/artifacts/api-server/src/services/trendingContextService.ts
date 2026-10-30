import { contentAwarenessService } from "./contentAwarenessService.js";
/** Read-only receipt access, never token selection/ranking or heuristic hashtags. */
export async function getTrendingContext(platform?: string) {
  return contentAwarenessService.getContextForMode("social", platform);
}