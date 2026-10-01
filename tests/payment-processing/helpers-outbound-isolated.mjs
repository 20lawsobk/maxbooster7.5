import { build } from "esbuild";

/**
 * Bundle a real production subject while replacing every explicitly named
 * module boundary with a caller-owned in-memory adapter. Tests run with an
 * empty environment and never need a database, Stripe client, or network.
 */
export async function loadOutboundSubject(entryPoint, boundaries = {}) {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    plugins: [{
      name: "outbound-payment-isolated-boundaries",
      setup(buildContext) {
        buildContext.onResolve({ filter: /.*/ }, (args) => {
          if (Object.hasOwn(boundaries, args.path)) {
            return { path: args.path, namespace: "outbound-mock" };
          }
        });
        buildContext.onLoad({ filter: /.*/, namespace: "outbound-mock" }, (args) => ({
          contents: boundaries[args.path],
          loader: "js",
        }));
      },
    }],
  });

  const source = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

export function operation(overrides = {}) {
  return {
    id: "op_outbound_1",
    kind: "withdrawal",
    user_id: "seller",
    currency: "usd",
    amount_cents: 9000,
    state: "pending",
    created_at: "2026-01-01T00:00:00Z",
    payload: { accountId: "acct_seller", paymentIntent: "pi_source", orderId: "sale_1" },
    attempts: 0,
    ...overrides,
  };
}

export function commerceEngineFixture(kind = "withdrawal") {
  const op = operation({ kind });
  const calls = [];
  const sources = [];
  const repository = {
    claim: async () => {
      if (["completed", "cancelled", "failed"].includes(op.state)) return undefined;
      op.attempts += 1;
      op.state = "running";
      return { ...op, payload: { ...op.payload } };
    },
    update: async (_current, patch) => {
      calls.push(["update", patch]);
      if (patch.transferId) op.transfer_id = patch.transferId;
      if (patch.providerId) op.provider_id = patch.providerId;
      if (patch.state) op.state = patch.state;
      if (patch.bankStarted) op.payload.bankStarted = true;
    },
    get: async () => ({ ...op }),
    withdrawalSources: async () => sources,
    paid: async () => { calls.push(["paid"]); op.state = "completed"; },
    release: async () => { calls.push(["release"]); op.state = "cancelled"; },
    sourceByPayment: async () => ({ id: "sale_1", disputed_cents: 0 }),
    compensate: async (...args) => calls.push(["compensate", ...args]),
    recovered: async () => { calls.push(["recovered"]); op.state = "completed"; },
  };
  const provider = {
    transfer: async () => { calls.push(["transfer"]); return "tr_outbound"; },
    payout: async () => { calls.push(["payout"]); return { id: "po_outbound", status: "pending" }; },
    refund: async () => ({ id: "re_outbound", status: "pending" }),
    reverse: async () => { calls.push(["reverse"]); return "trr_outbound"; },
  };
  return { op, calls, sources, repository, provider };
}