import fs from "node:fs";
import path from "node:path";

export const MAXCORE_SELECTED_CANDIDATE_POINTER =
  "external/maxcore/artifacts/ai-training-server/ai_model/training/candidate_registry/selected.json";

/**
 * Candidate serving is explicitly candidate-only, and its run payloads are
 * excluded from production capsules. Refuse a deploy build rather than ship a
 * selection pointer whose verified run will be missing at runtime.
 */
export function assertNoSelectedMaxCoreCandidate(root: string): void {
  const pointerPath = path.resolve(root, MAXCORE_SELECTED_CANDIDATE_POINTER);
  if (fs.existsSync(pointerPath)) {
    throw new Error(
      `Production build refused: ${MAXCORE_SELECTED_CANDIDATE_POINTER} selects candidate-only artifacts that are excluded from deployment. Promote an approved model through the serving release manifest first.`,
    );
  }
}