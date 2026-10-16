import {
  getToolostApiEnvironment,
  type ToolostApiEnvironment,
} from "./toolostEnvironment.js";

interface ToolostRuntimeEnvironment extends NodeJS.ProcessEnv {
  TOOLOST_ENVIRONMENT?: string;
  TOOLOST_REDIRECT_URI?: string;
  TOOLOST_SANDBOX_REDIRECT_URL?: string;
}

/** Shared authenticated distributor selection for HTTP and background callers.
 * Credentials remain owned by the authorizing account; release ownership is
 * checked by each caller before using this connection.
 */
export async function getDistributionToolostService(userId: string) {
  const [{ storage }, { toolostService }] = await Promise.all([
    import("../storage.js"),
    import("./toolost-service.js"),
  ]);
  const environment = getToolostApiEnvironment();
  const connection =
    (await storage.getToolostConnection(userId, environment)) ??
    (await storage.getAdminToolostConnection(environment));
  if (!connection) {
    throw new Error(
      "Too Lost is not connected. Connect a Too Lost distribution account before submitting releases.",
    );
  }
  return toolostService.forUser(connection.connectedByUserId);
}

/** Account-wide financial totals must never use the shared delivery account. */
export async function getOwnedToolostService(userId: string) {
  const [{ storage }, { toolostService }] = await Promise.all([
    import("../storage.js"),
    import("./toolost-service.js"),
  ]);
  const connection = await storage.getToolostConnection(userId, getToolostApiEnvironment());
  if (!connection || connection.connectedByUserId !== userId) return null;
  return toolostService.forUser(userId);
}

export function getToolostRedirectUri(
  env: ToolostRuntimeEnvironment = process.env,
): string {
  const environment: ToolostApiEnvironment = getToolostApiEnvironment(env);
  const variable =
    environment === "sandbox"
      ? "TOOLOST_SANDBOX_REDIRECT_URL"
      : "TOOLOST_REDIRECT_URI";
  const configured = env[variable]?.trim();

  if (!configured) {
    throw new Error(
      `Too Lost OAuth callback URL is not configured for the selected API environment (${variable}).`,
    );
  }

  if (environment === "sandbox") {
    let callback: URL;
    try {
      callback = new URL(configured);
    } catch {
      throw new Error(
        `Too Lost sandbox OAuth callback URL (${variable}) must be a valid HTTPS URL.`,
      );
    }
    const callbackPath = callback.pathname.replace(/\/+$/, "");
    if (callback.protocol !== "https:") {
      throw new Error(
        `Too Lost sandbox OAuth callback URL (${variable}) must use HTTPS.`,
      );
    }
    if (callbackPath !== "/api/distribution/toolost/callback") {
      throw new Error(
        `Too Lost sandbox OAuth callback URL (${variable}) must use /api/distribution/toolost/callback.`,
      );
    }
    if (callback.hash) {
      throw new Error(
        `Too Lost sandbox OAuth callback URL (${variable}) cannot include a fragment.`,
      );
    }
  }

  return configured;
}