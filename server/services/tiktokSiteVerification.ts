function hostname(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `http://${trimmed}`);
    return url.hostname.toLowerCase().replace(/\.$/, "") || null;
  } catch {
    return null;
  }
}

export function isConfiguredDevHost(
  requestHost: string | null | undefined,
  configuredDevHost: string | null | undefined,
): boolean {
  const actual = hostname(requestHost);
  const configured = hostname(configuredDevHost);
  return actual !== null && configured !== null && actual === configured;
}

const developmentVerificationText =
  "tiktok-developers-site-verification=YuaYzlWqoobUDQLsXg8nt8UAv5y5jBxr";
const existingVerificationText =
  "tiktok-developers-site-verification=hnfUpA9zyoJspWMdAIdZWXJzIvyo9MBx";

export const developmentVerificationFilePath =
  "/tiktokYuaYzlWqoobUDQLsXg8nt8UAv5y5jBxr.txt";

export function verificationTextForHost(
  requestHost: string | null | undefined,
  configuredDevHost: string | null | undefined,
): string {
  return isConfiguredDevHost(requestHost, configuredDevHost)
    ? developmentVerificationText
    : existingVerificationText;
}

export function verificationMetaTagForHost(
  requestHost: string | null | undefined,
  configuredDevHost: string | null | undefined,
): string | null {
  if (!isConfiguredDevHost(requestHost, configuredDevHost)) return null;

  const prefix = "tiktok-developers-site-verification=";
  const signature = developmentVerificationText.slice(prefix.length);
  return `<meta name="tiktok-developers-site-verification" content="${signature}" />`;
}
