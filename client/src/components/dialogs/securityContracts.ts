/** Security dialog contracts. Transport remains the shared cookie/CSRF client. */
export type SecurityRequest = (method: string, url: string, body?: unknown) => Promise<Response>;
export type ErasureRequest = { status: string; requested_at: string; not_before: string; completed_at?: string };

export const freshCodeGuidance = "Codes are single-use. Wait for a fresh six-digit authenticator code after signing in or another security operation.";
export const reauthenticationGuidance = "Sign out, sign in again with your password or Google (and MFA if enabled), then return here within five minutes and use a fresh code.";

export function securityError(error: unknown): string {
  const value = error as { message?: string; status?: number; requiresReauthentication?: boolean; details?: { requiresReauthentication?: boolean } };
  const message = value?.message || "The security request failed. Please try again.";
  return value?.requiresReauthentication || value?.details?.requiresReauthentication || value?.status === 403
    ? `${message} ${reauthenticationGuidance}`
    : message;
}

export async function setupFactor(request: SecurityRequest, replacing: boolean, currentCode: string) {
  if (replacing && !/^\d{6}$/.test(currentCode)) throw new Error("Enter the current authenticator's six-digit code.");
  const response = await request("POST", "/api/auth/2fa/setup", replacing ? { currentCode } : {});
  const data = await response.json();
  if (typeof data.secret !== "string" || !data.secret || typeof data.qrCode !== "string" || !data.qrCode) {
    throw new Error("Server did not return a valid setup. Start setup again.");
  }
  return data as { secret: string; qrCode: string };
}

export async function disableFactor(request: SecurityRequest, password: string, code: string) {
  if (!/^\d{6}$/.test(code)) throw new Error("Enter a fresh six-digit authenticator code.");
  const response = await request("POST", "/api/auth/2fa/disable", { ...(password ? { password } : {}), code });
  if ((await response.json()).success !== true) throw new Error("The server did not confirm that 2FA was disabled.");
}

export async function requestErasure(request: SecurityRequest, password: string) {
  const response = await request("DELETE", "/api/auth/account", password ? { password } : {});
  const data = await response.json();
  if (response.status !== 202 || data.accepted !== true || data.erased !== false || data.request?.status !== "pending_policy") {
    throw new Error("Erasure request outcome is unconfirmed. Sign in again and check request status before retrying.");
  }
  return data;
}

export async function erasureStatus(request: SecurityRequest): Promise<ErasureRequest | null> {
  const data = await (await request("GET", "/api/auth/account/erasure")).json();
  if (data.request === null) return null;
  if (!data.request || !["pending_policy", "cancelled", "processing", "completed"].includes(data.request.status) ||
      !Number.isFinite(Date.parse(data.request.requested_at)) || !Number.isFinite(Date.parse(data.request.not_before))) {
    throw new Error("Invalid erasure status response. Refresh status before taking further action.");
  }
  return data.request;
}

export async function cancelErasure(request: SecurityRequest) {
  const data = await (await request("POST", "/api/auth/account/erasure/cancel", {})).json();
  if (data.cancelled !== true) throw new Error("Cancellation was not confirmed. Refresh status before retrying.");
}