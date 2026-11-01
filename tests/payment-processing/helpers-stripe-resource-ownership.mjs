/** A checkout reference does not confer ownership of Stripe's shared catalog, including managed inline prices. */
export function catalogProductOwnedByRun(product, runId) {
  return Boolean(product && !product.deleted && typeof runId === "string" && runId &&
    product.metadata?.inboundTestRunId === runId);
}
