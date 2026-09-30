import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Keep the behavioral inventory test isolated from the database and storage
// implementations. Importing the service also constructs its singleton, so
// these mocks let the test exercise the platform policy without connecting to
// a real database.
vi.mock("../../server/db.js", () => {
  const emptyQuery = {
    from: () => ({
      where: () => ({
        limit: async () => [],
      }),
    }),
  };
  return {
    db: {
      select: () => emptyQuery,
      insert: () => ({
        values: () => ({
          onConflictDoNothing: async () => undefined,
        }),
      }),
    },
  };
});
vi.mock("../../server/storage.js", () => ({
  storage: {
    getUserSocialToken: vi.fn(),
    updateUserSocialToken: vi.fn(),
  },
}));

const routeSource = readFileSync(
  resolve(process.cwd(), "server/routes/socialOAuth.ts"),
  "utf8",
);
const serviceSource = readFileSync(
  resolve(process.cwd(), "server/services/socialOAuthService.ts"),
  "utf8",
);
const authRoutesSource = readFileSync(
  resolve(process.cwd(), "server/routes.ts"),
  "utf8",
);

describe("social OAuth provider contracts", () => {
  it("uses the current Google Business Profile scope only", () => {
    expect(routeSource).toContain(
      '"https://www.googleapis.com/auth/business.manage"',
    );
    expect(routeSource).not.toContain(
      "https://www.googleapis.com/auth/plus.business.manage",
    );
  });

  it("does not return access tokens from the refresh endpoint", () => {
    expect(routeSource).not.toContain("accessToken: result.accessToken");
    expect(routeSource).toContain('message: "Token refreshed successfully"');
  });

  it("keeps Spotify configured in the shared OAuth service and uses Basic refresh auth", () => {
    expect(serviceSource).toContain('this.oauthConfigs.set("spotify"');
    expect(serviceSource).toContain(
      'platform === "twitter" || platform === "spotify"',
    );
    expect(serviceSource).toContain('"spotify",\n] as const');
    expect(routeSource).toContain("process.env.SPOTIFY_CLIENT_SECRET");
    expect(routeSource).toContain(
      "process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET",
    );
  });

  it("returns Spotify when it is the connected provider", async () => {
    const { collectConnectedPlatforms, socialOAuth } = await import(
      "../../server/services/socialOAuthService.js"
    );
    const connected = await collectConnectedPlatforms(
      async (platform) => platform === "spotify",
    );

    expect(connected).toEqual(["spotify"]);

    // The service starts a periodic refresh monitor at module load. Stop it
    // so this focused test does not leave a timer behind.
    const interval = (socialOAuth as any).tokenRefreshInterval as
      | NodeJS.Timeout
      | null;
    if (interval) clearInterval(interval);
  });

  it("keeps the eight social-provider inventory distinct from Google sign-in", async () => {
    const { SOCIAL_PROVIDER_IDS, CONNECTED_PLATFORM_IDS } = await import(
      "../../server/services/socialOAuthService.js"
    );
    expect(SOCIAL_PROVIDER_IDS).toEqual([
      "meta",
      "twitter",
      "youtube",
      "tiktok",
      "linkedin",
      "threads",
      "googlebusiness",
      "spotify",
    ]);
    expect(SOCIAL_PROVIDER_IDS).not.toContain("google");
    expect(CONNECTED_PLATFORM_IDS).toContain("spotify");
  });

  it("supports refresh for tokens stored by the live callback", () => {
    expect(serviceSource).toContain("socialAccounts.refreshToken");
    expect(serviceSource).toContain("socialAccounts.tokenExpiresAt");
    expect(serviceSource).toContain(
      "accessToken: row.accessToken,\n      refreshToken: row.refreshToken",
    );
  });

  it("does not log the Google token response body", () => {
    expect(authRoutesSource).not.toContain(
      'logger.warn({ tokens }, "[Google OAuth] Token exchange failed")',
    );
    expect(authRoutesSource).toContain("hasAccessToken: Boolean(tokens.access_token)");
  });

  it("uses the verified sandbox TikTok callback when no override is supplied", () => {
    expect(routeSource).toContain(
      '${process.env.DOMAIN || process.env.APP_URL || "https://maxbooster.replit.app"}/tiktok/sandbox/callback',
    );
    expect(routeSource).toContain("TIKTOK_SANDBOX_REDIRECT_URI ||");
  });

  it("encrypts callback tokens with the per-user per-platform context", () => {
    // Publishers (socialOAuthService, socialService, socialSyncService) all
    // decrypt via decryptSocialCredential, so the callback stores encrypted
    // tokens — never the raw effectiveToken.
    expect(routeSource).toContain(
      "encryptSocialCredential(effectiveToken, `${stateData.userId}:${p.name}:access`)",
    );
    expect(routeSource).not.toContain("accessToken: effectiveToken");
  });
});