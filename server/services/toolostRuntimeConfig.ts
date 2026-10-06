interface ToolostEnvironment {
  TOOLOST_ENVIRONMENT?: string;
  TOOLOST_REDIRECT_URI?: string;
  TOOLOST_SANDBOX_REDIRECT_URI?: string;
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
  const connection =
    (await storage.getToolostConnection(userId)) ??
    (await storage.getAdminToolostConnection());
  if (!connection) {
    throw new Error(
      "Too Lost is not connected. Connect a Too Lost distribution account before submitting releases.",
    );
  }
  return toolostService.forUser(connection.connectedByUserId);
}

export function getToolostRedirectUri(
  env: ToolostEnvironment = process.env as ToolostEnvironment,
): string {
  const configured =
    env.TOOLOST_ENVIRONMENT === "sandbox"
      ? env.TOOLOST_SANDBOX_REDIRECT_URI?.trim()
      : env.TOOLOST_REDIRECT_URI?.trim();

  if (configured) return configured;

  const variable =
    env.TOOLOST_ENVIRONMENT === "sandbox"
      ? "TOOLOST_SANDBOX_REDIRECT_URI"
      : "TOOLOST_REDIRECT_URI";
  throw new Error(
    `Too Lost OAuth callback URL is not configured for the selected API environment (${variable}).`,
  );
}