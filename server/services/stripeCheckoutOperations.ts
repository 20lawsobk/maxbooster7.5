import { createHash } from "node:crypto";

const PROVIDER_REPLAY_WINDOW_MS = 23 * 60 * 60 * 1000;
const REQUEST_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

type CheckoutDatabase = {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
  connect(): Promise<{
    query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
    release(): void;
  }>;
};

export type StripeCheckoutResult = { sessionId: string; url: string };
export type CheckoutReservation = {
  id: string;
  state: "checkout_creating" | "checkout_ready";
  snapshot: any;
  result?: StripeCheckoutResult;
};

export class CheckoutOperationConflictError extends Error {
  statusCode = 409;
  code = "IDEMPOTENCY_CONFLICT";
  retryable = false;
}

export class CheckoutOperationReconciliationError extends Error {
  statusCode = 409;
  code = "CHECKOUT_RECONCILIATION_REQUIRED";
  retryable = false;
}

export class CheckoutOperationUnavailableError extends Error {
  statusCode = 503;
  code = "CHECKOUT_OPERATION_STORE_UNAVAILABLE";
  retryable = false;
}

function translateStorageError(error: unknown): never {
  if ((error as { code?: string })?.code === "42P01") {
    throw new CheckoutOperationUnavailableError(
      "Checkout is unavailable until the commerce operations schema is deployed",
    );
  }
  throw error;
}

export function checkoutIntentHash(intent: unknown): string {
  return createHash("sha256").update(JSON.stringify(intent)).digest("hex");
}

export function checkoutOperationId(
  scope: string,
  userId: string,
  requestKey: string,
): string {
  if (!REQUEST_KEY_PATTERN.test(requestKey)) {
    throw Object.assign(new Error("A valid Idempotency-Key header is required"), {
      statusCode: 400,
      code: "IDEMPOTENCY_KEY_REQUIRED",
      retryable: false,
    });
  }
  return `checkout_${createHash("sha256")
    .update(JSON.stringify([scope, userId, requestKey]))
    .digest("hex")}`;
}

function readPrior(
  prior: any,
  input: { id: string; scope: string; userId: string; intentHash: string },
): CheckoutReservation {
  if (
    prior.user_id !== input.userId ||
    prior.kind !== input.scope ||
    prior.payload?.intentHash !== input.intentHash
  ) {
    throw new CheckoutOperationConflictError(
      "Idempotency-Key was already used for a different checkout",
    );
  }
  if (prior.state === "checkout_ready") {
    return {
      id: input.id,
      state: "checkout_ready",
      snapshot: prior.payload?.snapshot,
      result: prior.payload?.result,
    };
  }

  const createdAt = new Date(prior.created_at).getTime();
  if (
    prior.state !== "checkout_creating" ||
    !Number.isFinite(createdAt) ||
    Date.now() - createdAt >= PROVIDER_REPLAY_WINDOW_MS
  ) {
    throw new CheckoutOperationReconciliationError(
      "Checkout provider response is unknown; reconcile it before starting another payment",
    );
  }
  return {
    id: input.id,
    state: "checkout_creating",
    snapshot: prior.payload?.snapshot,
  };
}

export async function findCheckoutOperation(
  database: CheckoutDatabase,
  input: {
    scope: string;
    userId: string;
    requestKey: string;
    intentHash: string;
  },
): Promise<CheckoutReservation | null> {
  const id = checkoutOperationId(input.scope, input.userId, input.requestKey);
  try {
    const prior = (
      await database.query(
        "SELECT id,kind,user_id,state,payload,created_at FROM commerce_operations WHERE id=$1",
        [id],
      )
    ).rows[0];
    return prior
      ? readPrior(prior, { ...input, id })
      : null;
  } catch (error) {
    translateStorageError(error);
  }
}

export async function reserveCheckoutOperation(
  database: CheckoutDatabase,
  input: {
    scope: string;
    userId: string;
    requestKey: string;
    intentHash: string;
    amountCents: number;
    currency: string;
    snapshot: unknown;
  },
): Promise<CheckoutReservation> {
  const id = checkoutOperationId(input.scope, input.userId, input.requestKey);
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("Checkout amount must be a positive integer number of cents");
  }
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
      [`stripe-checkout:${id}`],
    );
    const prior = (
      await client.query(
        "SELECT id,kind,user_id,state,payload,created_at FROM commerce_operations WHERE id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (prior) {
      const reservation = readPrior(prior, { ...input, id });
      await client.query("COMMIT");
      return reservation;
    }
    await client.query(
      `INSERT INTO commerce_operations
        (id,kind,user_id,currency,amount_cents,state,payload)
       VALUES($1,$2,$3,$4,$5,'checkout_creating',$6::jsonb)`,
      [
        id,
        input.scope,
        input.userId,
        input.currency,
        input.amountCents,
        JSON.stringify({
          intentHash: input.intentHash,
          snapshot: input.snapshot,
        }),
      ],
    );
    await client.query("COMMIT");
    return {
      id,
      state: "checkout_creating",
      snapshot: input.snapshot,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    translateStorageError(error);
  } finally {
    client.release();
  }
}

export async function completeCheckoutOperation(
  database: CheckoutDatabase,
  input: {
    id: string;
    scope: string;
    userId: string;
    result: StripeCheckoutResult;
    beforeCommit?: (client: {
      query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
    }) => Promise<void>;
  },
): Promise<StripeCheckoutResult> {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    const prior = (
      await client.query(
        "SELECT kind,user_id,state,payload,provider_id FROM commerce_operations WHERE id=$1 FOR UPDATE",
        [input.id],
      )
    ).rows[0];
    if (!prior || prior.kind !== input.scope || prior.user_id !== input.userId) {
      throw new Error("Checkout operation disappeared before its receipt was saved");
    }
    if (prior.state === "checkout_ready") {
      const saved = prior.payload?.result as StripeCheckoutResult | undefined;
      if (!saved || saved.sessionId !== input.result.sessionId) {
        throw new Error("Checkout operation has a conflicting provider receipt");
      }
      await client.query("COMMIT");
      return saved;
    }
    if (prior.state !== "checkout_creating") {
      throw new Error("Checkout operation is not in a completable state");
    }
    await input.beforeCommit?.(client);
    const updated = await client.query(
      `UPDATE commerce_operations
       SET state='checkout_ready',provider_id=$2,
           payload=payload || $3::jsonb,updated_at=now()
       WHERE id=$1 AND kind=$4 AND user_id=$5 AND state='checkout_creating'
       RETURNING id`,
      [
        input.id,
        input.result.sessionId,
        JSON.stringify({ result: input.result }),
        input.scope,
        input.userId,
      ],
    );
    if (!updated.rows.length) {
      throw new Error("Checkout operation changed before its receipt was saved");
    }
    await client.query("COMMIT");
    return input.result;
  } catch (error) {
    await client.query("ROLLBACK");
    translateStorageError(error);
  } finally {
    client.release();
  }
}