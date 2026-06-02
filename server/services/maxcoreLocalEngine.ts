/**
 * MaxCore Local Inference Engine
 *
 * The 8TB dataset (MaxCore remote) is the ONLY text source.
 * This module no longer generates local content — all generation
 * routes through MaxCoreAIClient.infer() against the remote server.
 * When the remote is unavailable, callers receive null/empty (no fallback).
 */

import { logger } from "../logger.js";

export interface MaxCoreInferRequest {
  platform?: string;
  topic?: string;
  tone?: string;
  genre?: string;
  artist_name?: string;
  artist_bio?: string;
  brand_voice?: string;
  target_audience?: string;
  content_themes?: string[];
  avoid_topics?: string[];
  preferred_hashtags?: string[];
  recent_post_snippets?: string[];
  userId?: string;
  contentType?: string;
}

export interface MaxCoreInferResponse {
  caption: string;
  hook: string;
  body: string;
  cta: string;
  hashtags: string[];
  confidence: number;
  source: "MaxCoreAI";
  model: string;
  processing_ms: number;
}

/**
 * @deprecated The local inference engine is removed. Use MaxCoreAIClient.infer()
 * directly — the 8TB dataset is only accessible through the remote MaxCore server.
 */
export async function maxcoreLocalInfer(
  _req: MaxCoreInferRequest,
): Promise<MaxCoreInferResponse | null> {
  logger.warn(
    "[MaxCoreLocal] maxcoreLocalInfer() called — local engine removed. Use MaxCoreAIClient.infer() for 8TB dataset access.",
  );
  return null;
}

/**
 * Health check response.
 */
export function maxcoreLocalHealth() {
  return {
    status: "ok",
    version: "3.0.0",
    source: "remote-only",
    engine: "MaxCoreAI-remote",
    uptime: process.uptime(),
  };
}
