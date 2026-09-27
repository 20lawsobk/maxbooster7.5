/** Caller-owned data is transported verbatim; only Core performs enrichment. */
export interface GenerationEnrichment {
  awarenessBlock: string;
  hasData: boolean;
}
export async function buildGenerationEnrichment(params: {
  userId: string;
  artistProfileId?: string;
  platforms: string[];
  context?: string;
}): Promise<GenerationEnrichment> {
  return { awarenessBlock: params.context ?? "", hasData: params.context !== undefined };
}