interface ToolostEnvironment {
  TOOLOST_ENVIRONMENT?: string;
  TOOLOST_REDIRECT_URI?: string;
  TOOLOST_SANDBOX_REDIRECT_URI?: string;
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