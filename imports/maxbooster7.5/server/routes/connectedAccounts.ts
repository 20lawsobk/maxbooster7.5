import { Router, Request, Response } from "express";
import { logger } from "../logger.js";
import { db } from "../db";
import { socialAccounts } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { notificationService } from "../services/notificationService.js";
import { socialOAuth } from "../services/socialOAuthService.js";

const router = Router();

router.use(requireAuth);

const getDefaultPermissions = (provider: string) => {
  const basePermissions = [
    {
      id: "read_profile",
      label: "Read Profile",
      description: "Access your basic profile information",
      enabled: true,
      required: true,
    },
  ];

  const streamingPermissions = [
    {
      id: "read_playlists",
      label: "Read Playlists",
      description: "Access your playlists and saved tracks",
      enabled: true,
      required: false,
    },
    {
      id: "sync_library",
      label: "Sync Library",
      description: "Sync your music library for analytics",
      enabled: true,
      required: false,
    },
  ];

  const socialPermissions = [
    {
      id: "read_followers",
      label: "Read Followers",
      description: "Access your follower count and engagement metrics",
      enabled: true,
      required: false,
    },
    {
      id: "post_content",
      label: "Post Content",
      description: "Share content on your behalf",
      enabled: false,
      required: false,
    },
  ];

  if (["spotify", "apple_music", "soundcloud"].includes(provider)) {
    return [...basePermissions, ...streamingPermissions];
  } else if (
    ["instagram", "tiktok", "youtube", "twitter", "facebook"].includes(provider)
  ) {
    return [...basePermissions, ...socialPermissions];
  }

  return basePermissions;
};

function getAccountStatus(
  account: Record<string, unknown>,
): "connected" | "expired" | "error" {
  if (!account?.isActive) return "error";
  if (account?.tokenExpiresAt && new Date(account?.tokenExpiresAt as any) < new Date())
    return "expired";
  return "connected";
}

function getAccountPermissions(account: Record<string, unknown>) {
  const metadata = (account.metadata as Record<string, unknown> | null) ?? {};
  const savedPermissions = metadata.permissions;
  return Array.isArray(savedPermissions) &&
    savedPermissions.every(
      (permission) =>
        permission &&
        typeof permission === "object" &&
        typeof (permission as Record<string, unknown>).id === "string" &&
        typeof (permission as Record<string, unknown>).enabled === "boolean",
    )
    ? savedPermissions
    : getDefaultPermissions(account.platform as string);
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const accounts = await db
      .select()
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.userId, userId),
          eq(socialAccounts.isActive, true),
        ),
      )
      .limit(50);

    const safeAccounts = accounts?.map((account) => ({
      id: account.id,
      provider: account.platform,
      providerAccountId: account.platformUserId || "",
      username: account.username || undefined,
      displayName: account.username || account?.platform,
      email: undefined,
      avatarUrl: undefined,
      connectedAt: account.createdAt?.toISOString() || new Date().toISOString(),
      lastSyncedAt:
        ((account.metadata as Record<string, unknown> | null)
          ?.lastSyncedAt as string | undefined) || account.createdAt?.toISOString(),
      expiresAt: account.tokenExpiresAt?.toISOString(),
      status: getAccountStatus(account),
      scopes: [],
      permissions: getAccountPermissions(account),
    }));

    res.json(safeAccounts);

    setImmediate(async () => {
      try {
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        for (const account of accounts) {
          if (account?.tokenExpiresAt) {
            const msUntilExpiry =
              new Date(account?.tokenExpiresAt).getTime() - Date?.now();
            if (msUntilExpiry > 0 && msUntilExpiry <= sevenDays) {
              const platformName =
                account?.platform.charAt(0).toUpperCase() +
                account?.platform.slice(1);
              await notificationService?.sendSocialTokenExpiringNotification(
                userId,
                platformName,
              );
            }
          }
        }
      } catch (err) {
        logger.warn({ err: err }, "Social token expiring notification error:");
      }
    });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching connected accounts:");
    res.status(500).json({ error: "Failed to fetch connected accounts" });
  }
});

router.delete("/:accountId", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { accountId } = req.params as Record<string, string>;

    const result = await db
      .update(socialAccounts)
      .set({ isActive: false })
      .where(
        and(
          eq(socialAccounts.id, accountId),
          eq(socialAccounts.userId, userId),
        ),
      )
      .returning({ id: socialAccounts.id });

    if (result?.length === 0) {
      return res.status(404).json({ error: "Connected account not found" });
    }

    res.json({ success: true, message: "Account disconnected successfully" });
  } catch (error) {
    logger.warn({ err: error }, "Error disconnecting account:");
    res.status(500).json({ error: "Failed to disconnect account" });
  }
});

router.post("/:accountId/refresh", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { accountId } = req.params as Record<string, string>;

    const [account] = await db
      .select({
        id: socialAccounts.id,
        platform: socialAccounts.platform,
        refreshToken: socialAccounts.refreshToken,
      })
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.id, accountId),
          eq(socialAccounts.userId, userId),
        ),
      )
      .limit(1);

    if (!account) {
      return res.status(404).json({ error: "Connected account not found" });
    }
    if (!account.refreshToken) {
      return res.status(400).json({
        error: "No refresh token available. Please reconnect this account.",
      });
    }

    const refreshed = await socialOAuth.refreshAccessToken(userId, account.platform);
    res.json({
      message: "Connection refreshed successfully",
      account: {
        id: accountId,
        status: "connected",
        expiresIn: refreshed.expiresIn,
      },
    });
  } catch (error) {
    logger.warn({ err: error }, "Error refreshing account connection:");
    res.status(500).json({ error: "Failed to refresh account connection" });
  }
});

router.post("/manual-token", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const {
      platform,
      accessToken,
      refreshToken,
      username,
      platformUserId,
      expiresIn,
    } = req.body;

    if (!platform || !accessToken) {
      return res
        .status(400)
        .json({ error: "Platform and access token are required" });
    }

    const validPlatforms = [
      "instagram",
      "facebook",
      "tiktok",
      "twitter",
      "youtube",
      "spotify",
      "threads",
      "linkedin",
      "soundcloud",
      "apple_music",
    ];
    if (!validPlatforms?.includes(platform)) {
      return res
        .status(400)
        .json({
          error: `Invalid platform. Must be one of: ${validPlatforms?.join(", ")}`,
        });
    }

    const existing = await db
      .select()
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.userId, userId),
          eq(socialAccounts.platform, platform),
        ),
      )
      .limit(5);

    const tokenExpiresAt = expiresIn
      ? new Date(Date?.now() + expiresIn * 1000)
      : null;

    if (existing?.length > 0) {
      await db
        .update(socialAccounts)
        .set({
          accessToken,
          refreshToken: refreshToken || existing[0].refreshToken,
          username: username || existing[0].username,
          platformUserId: platformUserId || existing[0].platformUserId,
          tokenExpiresAt,
          isActive: true,
        })
        .where(eq(socialAccounts.id, existing[0].id));

      logger.info(`[ManualToken] Updated ${platform} token for user ${userId}`);
      res.json({
        success: true,
        message: `${platform} access token updated successfully`,
        id: existing[0].id,
      });
    } else {
      const [newAccount] = await db
        .insert(socialAccounts)
        .values({
          userId,
          platform,
          accessToken,
          refreshToken: refreshToken || null,
          username: username || null,
          platformUserId: platformUserId || null,
          tokenExpiresAt,
          isActive: true,
        })
        .returning({ id: socialAccounts.id });

      logger.info(`[ManualToken] Created ${platform} token for user ${userId}`);
      res.json({
        success: true,
        message: `${platform} connected successfully`,
        id: newAccount.id,
      });
    }
  } catch (error) {
    logger.warn({ err: error }, "Error saving manual token:");
    res.status(500).json({ error: "Failed to save access token" });
  }
});

router.put("/:accountId/permissions", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { accountId } = req.params as Record<string, string>;
    const permissionUpdates = req.body;

    const accounts = await db
      .select()
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.id, accountId),
          eq(socialAccounts.userId, userId),
        ),
      )
      .limit(1);

    if (accounts?.length === 0) {
      return res.status(404).json({ error: "Connected account not found" });
    }

    const account = accounts[0];
    const permissions = getAccountPermissions(account);
    let changed = false;

    for (const [permId, enabled] of Object.entries(permissionUpdates)) {
      const permission = permissions?.find((p) => p?.id === permId);
      if (permission && !permission?.required) {
        if (typeof enabled !== "boolean") {
          return res
            .status(400)
            .json({ error: `Permission ${permId} must be a boolean` });
        }
        permission.enabled = enabled;
        changed = true;
      }
    }
    if (!changed) {
      return res.status(400).json({ error: "No editable permissions supplied" });
    }

    const metadata = (account.metadata as Record<string, unknown> | null) ?? {};
    await db
      .update(socialAccounts)
      .set({ metadata: { ...metadata, permissions } })
      .where(eq(socialAccounts.id, account.id));

    res.json({
      message: "Permissions updated successfully",
      permissions,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error updating account permissions:");
    res.status(500).json({ error: "Failed to update account permissions" });
  }
});

export default router;
