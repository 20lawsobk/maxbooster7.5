/**
 * Discriminator Engine
 *
 * A GAN-style adversarial critic for generated content. Where
 * contentQualityPipeline's scorer rates a batch of candidates against each
 * other, the discriminator judges a single piece of finished content in
 * isolation and answers one question: "does this look real / high quality,
 * or does it look machine-generated slop?" It then hands back a concrete
 * feedback signal the generator can use to improve on its next attempt.
 *
 * Two judgment sources, always blended, never faked:
 *   1. Local heuristic critic — hard-fails on placeholder/broken-generation
 *      artifacts (unresolved template tags, "Lorem ipsum", empty CTAs,
 *      repeated-word stutter, ALL-CAPS spam) that no score blend should be
 *      able to paper over, plus soft signals for coherence/style.
 *   2. MaxCore's own /api/content/score critic — the AI-model-backed judge
 *      already used elsewhere in the pipeline; call it directly here so the
 *      discriminator's realism axis reflects the live trained model, not a
 *      re-derived local guess. Fails explicit (MaxCoreAIClient throws) when
 *      MaxCore is down for this call — the caller's blended score simply
 *      omits the realism axis rather than fabricating one.
 *
 * `judgeContent()` is the read-only critic. `judgeAndImprove()` wraps a
 * caller-supplied generation function in a real feedback loop: generate →
 * judge → on reject, regenerate with the critique appended to context →
 * judge again, up to a small attempt cap. This is the "push the generator to
 * improve" half of the discriminator/generator pair.
 */

import { MaxCoreAIClient } from "./maxcoreClient.js";
import { logger } from "../logger.js";

export interface DiscriminatorInput {
  text: string; // full body/caption to judge
  headline?: string;
  cta?: string;
  hashtags?: string[];
  platform?: string;
}

export interface DiscriminatorVerdict {
  verdict: "pass" | "reject";
  overall: number; // 0-100
  realism: number | null; // null when MaxCore was unavailable for this call
  coherence: number | null;
  style: number | null;
  correctness: number | null;
  hardFails: string[]; // artifact-level defects — any entry forces "reject"
  critique: string[]; // human-readable issues, hard + soft
  feedback: string; // single actionable sentence to feed back into regeneration
  source: "maxcore";
}

const PLACEHOLDER_PATTERNS: RegExp[] = [
  /\{\{.*?\}\}/,
  /\[insert[^\]]*\]/i,
  /lorem ipsum/i,
  /\btodo\b/i,
  /<[a-z]+>/i, // unresolved <placeholder> tags
  /\bundefined\b/,
  /\bnull\b/,
];

const GENERIC_FILLER_PHRASES = [
  "check out my new track",
  "link in bio",
  "new music alert",
  "drop a comment",
];

function repeatedWordStutter(text: string): boolean {
  return /\b(\w{3,})\b(?:\s+\1\b){1,}/i.test(text);
}

function allCapsSpamRatio(text: string): number {
  const words = text.split(/\s+/).filter((w) => /[A-Za-z]{3,}/.test(w));
  if (words.length === 0) return 0;
  const capsWords = words.filter((w) => w === w.toUpperCase());
  return capsWords.length / (words.length || 1);
}

/**
 * Local heuristic critic — always runs, never fails, catches broken
 * generation artifacts a score blend alone could miss.
 */
function validateArtifacts(input: DiscriminatorInput): {
  hardFails: string[];
} {
  const hardFails: string[] = [];
  const fullText = [input.headline, input.text, input.cta]
    .filter(Boolean)
    .join(" ");

  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(fullText)) {
      hardFails.push(`Unresolved placeholder/artifact matched ${pattern}`);
    }
  }

  if (!input.text || input.text.trim().length < 8) {
    hardFails.push("Body text is empty or too short to be real content");
  }

  if (repeatedWordStutter(fullText)) {
    hardFails.push("Repeated-word stutter detected (broken generation)");
  }

  if (allCapsSpamRatio(fullText) > 0.4) {
    hardFails.push("Excessive ALL-CAPS spam detected");
  }

  const lowerFull = fullText.toLowerCase();
  const genericHits = GENERIC_FILLER_PHRASES.filter((p) =>
    lowerFull.includes(p),
  );
  if (genericHits.length > 0) {
    hardFails.push(
      `Generic filler phrase(s) present: ${genericHits.join(", ")} — replace with specific, artist-voiced language`,
    );
  }

  if (/\s{3,}/.test(fullText)) {
    hardFails.push("Irregular whitespace suggests a broken template merge");
  }
  const openQuotes = (fullText.match(/"/g) || []).length;
  if (openQuotes % 2 !== 0) {
    hardFails.push("Unmatched quotation mark");
  }

  return { hardFails };
}

const PASS_THRESHOLD = 65;

export async function judgeContent(
  input: DiscriminatorInput,
): Promise<DiscriminatorVerdict> {
  const validation = validateArtifacts(input);
  const result = await MaxCoreAIClient.infer<{
    score?: number;
    feedback?: string;
  }>("/api/content/score", {
    text: `${input.headline ?? ""}\n\n${input.text}`.trim(),
    platform: input.platform ?? "instagram",
    cta: input.cta ?? "",
    hashtags: input.hashtags ?? [],
  });
  if (typeof result?.score !== "number" || !Number.isFinite(result.score)) {
    throw new Error("MaxCore content score returned an invalid response contract");
  }
  const realism = Math.min(100, Math.max(0, result.score));
  const overall = Math.round(realism);
  const critique = [...validation.hardFails];
  if (result.feedback) critique.push(`MaxCore critic: ${result.feedback}`);

  const verdict: "pass" | "reject" =
    validation.hardFails.length > 0 || overall < PASS_THRESHOLD ? "reject" : "pass";

  const feedback =
    verdict === "pass"
      ? "Content passed the discriminator — no changes required."
      : critique.length > 0
        ? `Revise before use: ${critique.join("; ")}.`
        : `Overall quality (${overall}) is below the ${PASS_THRESHOLD} pass threshold — regenerate with a stronger hook and clearer CTA.`;

  return {
    verdict,
    overall,
    realism,
    coherence: null,
    style: null,
    correctness: null,
    hardFails: validation.hardFails,
    critique,
    feedback,
    source: "maxcore",
  };
}

/**
 * Adversarial feedback loop: generate → judge → on reject, regenerate with
 * the critique folded into the next attempt's context → judge again, up to
 * `maxAttempts`. `generate` must accept an optional `feedbackContext` string
 * (appended to whatever the caller already feeds its own generator, e.g.
 * MaxCore's `extra_context`) and return the same shape `judgeContent`
 * expects plus whatever the caller needs downstream.
 */
export async function judgeAndImprove<
  T extends DiscriminatorInput,
>(
  generate: (feedbackContext?: string) => Promise<T>,
  maxAttempts: number = 2,
): Promise<{ result: T; verdict: DiscriminatorVerdict; attempts: number }> {
  let feedbackContext: string | undefined;
  let lastResult: T | undefined;
  let lastVerdict: DiscriminatorVerdict | undefined;

  for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt++) {
    const result = await generate(feedbackContext);
    const verdict = await judgeContent(result);
    lastResult = result;
    lastVerdict = verdict;

    if (verdict.verdict === "pass") {
      logger.info(
        `[Discriminator] Passed on attempt ${attempt}/${maxAttempts} (score ${verdict.overall})`,
      );
      return { result, verdict, attempts: attempt };
    }

    logger.info(
      `[Discriminator] Rejected attempt ${attempt}/${maxAttempts} (score ${verdict.overall}): ${verdict.feedback}`,
    );
    feedbackContext = verdict.feedback;
  }

  // Exhausted attempts — return the last attempt with its (failing) verdict
  // so the caller can decide honestly (e.g. fall back, or surface the
  // rejection) rather than silently pretending it passed.
  return {
    result: lastResult as T,
    verdict: lastVerdict as DiscriminatorVerdict,
    attempts: Math.max(1, maxAttempts),
  };
}
