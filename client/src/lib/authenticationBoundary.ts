export interface AuthenticationExchange {
  response: { ok: boolean };
  data: Record<string, unknown>;
}

/** The provider owns cleanup and unlock; callers only perform HTTP exchange. */
export async function completeAuthentication<T extends AuthenticationExchange, U extends { id: string }>(
  request: () => Promise<T>,
  boundary: {
    changeAccount: <R>(operation: () => Promise<R>) => Promise<R>;
    setToken: (token: string | null) => void;
    verify: () => Promise<U | null>;
    commit: (user: U) => void;
  },
): Promise<T> {
  const result = await boundary.changeAccount(async () => {
    const exchange = await request();
    if (exchange.response.ok && exchange.data.requiresTwoFactor !== true) {
      if (typeof exchange.data.id !== "string" || !exchange.data.id) {
        throw new Error("Invalid authentication response. Sign in again before continuing.");
      }
      boundary.setToken(typeof exchange.data.sessionToken === "string" && exchange.data.sessionToken
        ? exchange.data.sessionToken : null);
    }
    return exchange;
  });
  // Failed credentials/challenges never unlock the account or seed user cache.
  if (!result.response.ok || result.data.requiresTwoFactor === true) return result;
  try {
    const verified = await boundary.verify();
    if (!verified || verified.id !== result.data.id) {
      throw new Error("The active session could not be verified. Please sign in again.");
    }
    boundary.commit(verified);
    return result;
  } catch (error) {
    boundary.setToken(null);
    throw error;
  }
}
