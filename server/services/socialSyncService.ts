import { db } from "../db";
import { socialAccounts, posts } from "@shared/schema";
import { eq, and, isNotNull, desc, inArray } from "drizzle-orm";
import { logger } from "../logger";

// ── Timeout-guarded fetch: adds a 15s default signal so no outbound HTTP call
// can hold the event loop indefinitely.  Per-call signal overrides this default.
const timedFetch = (
  url: string | URL | Request,
  init: RequestInit = {},
): Promise<Response> =>
  fetch(url, { signal: AbortSignal.timeout(15_000), ...init });

// ─── Token refresh helpers ────────────────────────────────────────────────────

interface TokenRefreshResult {
  accessToken: string;
  expiresAt: Date | null;
  refreshToken?: string;
}

async function refreshOAuth2Token(
  tokenUrl: string,
  clientId: string,
  clientSecret: string,
  refreshToken: string,
  extraParams: Record<string, string> = {},
): Promise<TokenRefreshResult | null> {
  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      ...extraParams,
    });
    const res = await timedFetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const data = await res?.json();
    if (!data?.access_token) {
      logger?.warn(
        `[TokenRefresh] No access_token in response from ${tokenUrl}:`,
        JSON?.stringify(data),
      );
      return null;
    }
    const expiresAt = data?.expires_in
      ? new Date(Date?.now() + data?.expires_in * 1000)
      : null;
    return {
      accessToken: data.access_token,
      expiresAt,
      refreshToken: data.refresh_token || refreshToken,
    };
  } catch (err) {
    logger?.warn(
      { err: err },
      `[TokenRefresh] Failed to refresh token from ${tokenUrl}:`,
    );
    return null;
  }
}

/**
 * Returns a valid access token for the given social account connection,
 * refreshing it first if expired. Updates the DB when a new token is issued.
 */
async function getValidAccessToken(connection: {
  id: string;
  platform: string;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
}): Promise<string | null> {
  const token = connection?.accessToken;
  if (!token) return null;

  // If no expiry stored, assume the token is still valid
  const expiry = connection?.tokenExpiresAt
    ? new Date(connection?.tokenExpiresAt).getTime()
    : null;
  const isExpired = expiry !== null && expiry < Date?.now() + 60_000; // refresh 60s before expiry

  if (!isExpired) return token;
  if (!connection?.refreshToken) {
    logger?.warn(
      `[TokenRefresh] ${connection?.platform}: token expired but no refresh_token stored`,
    );
    return token; // return the expired token; the API call will fail and we'll log it
  }

  logger.info(
    `[TokenRefresh] ${connection.platform}: access token expired — refreshing`,
  );

  let refreshed: TokenRefreshResult | null = null;
  const p = connection.platform;

  if (p === "youtube" || p === "googlebusiness") {
    refreshed = await refreshOAuth2Token(
      "https://oauth2.googleapis.com/token",
      process.env.YOUTUBE_CLIENT_ID ||
        process.env.GOOGLE_BUSINESS_CLIENT_ID ||
        "",
      process.env.YOUTUBE_CLIENT_SECRET ||
        process.env.GOOGLE_BUSINESS_CLIENT_SECRET ||
        "",
      connection.refreshToken,
    );
  } else if (p === "twitter") {
    const clientId =
      process.env.TWITTER_CLIENT_ID || process.env.TWITTER_API_KEY || "";
    const clientSecret =
      process.env.TWITTER_CLIENT_SECRET || process.env.TWITTER_API_SECRET || "";
    // Twitter OAuth2 uses Basic auth for refresh
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
      "base64",
    );
    try {
      const res = await timedFetch("https://api.x.com/2/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basicAuth}`,
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: connection.refreshToken,
          client_id: clientId,
        }).toString(),
      });
      const data = await res.json();
      if (data.access_token) {
        refreshed = {
          accessToken: data.access_token,
          expiresAt: data.expires_in
            ? new Date(Date.now() + data.expires_in * 1000)
            : null,
          refreshToken: data.refresh_token || connection.refreshToken,
        };
      } else {
        logger.warn(`[TokenRefresh] Twitter: ${JSON.stringify(data)}`);
      }
    } catch (err) {
      logger.warn({ err: err }, `[TokenRefresh] Twitter refresh failed:`);
    }
  } else if (p === "tiktok" || p === "tiktok_sandbox") {
    refreshed = await refreshOAuth2Token(
      "https://open.tiktokapis.com/v2/oauth/token/",
      process.env.TIKTOK_CLIENT_KEY || "",
      process.env.TIKTOK_CLIENT_SECRET || "",
      connection.refreshToken,
    );
  } else if (p === "linkedin") {
    refreshed = await refreshOAuth2Token(
      "https://www.linkedin.com/oauth/v2/accessToken",
      process.env.LINKEDIN_CLIENT_ID || "",
      process.env.LINKEDIN_CLIENT_SECRET || "",
      connection.refreshToken,
    );
  } else if (p === "threads") {
    // Threads uses a simple GET for token refresh
    try {
      const res = await timedFetch(
        `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${connection.refreshToken}`,
      );
      const data = await res.json();
      if (data.access_token) {
        refreshed = {
          accessToken: data.access_token,
          expiresAt: data.expires_in
            ? new Date(Date.now() + data.expires_in * 1000)
            : null,
        };
      } else {
        logger.warn(`[TokenRefresh] Threads: ${JSON.stringify(data)}`);
      }
    } catch (err) {
      logger.warn({ err: err }, `[TokenRefresh] Threads refresh failed:`);
    }
  } else if (p === "facebook" || p === "instagram") {
    // Facebook long-lived token exchange
    try {
      const appId =
        process.env.FACEBOOK_APP_ID || process.env.INSTAGRAM_APP_ID || "";
      const appSecret =
        process.env.FACEBOOK_APP_SECRET ||
        process.env.INSTAGRAM_APP_SECRET ||
        "";
      const res = await timedFetch(
        `https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${token}`,
      );
      const data = await res.json();
      if (data.access_token) {
        refreshed = {
          accessToken: data.access_token,
          expiresAt: data.expires_in
            ? new Date(Date.now() + data.expires_in * 1000)
            : null,
        };
      } else {
        logger.warn(`[TokenRefresh] Facebook: ${JSON.stringify(data)}`);
      }
    } catch (err) {
      logger.warn({ err: err }, `[TokenRefresh] Facebook refresh failed:`);
    }
  }

  if (!refreshed) {
    // Refresh failed — mark the connection as needing reconnection so the UI can prompt the user
    try {
      const currentMeta =
        ((
          await db
            .select({ metadata: socialAccounts.metadata })
            .from(socialAccounts)
            .where(eq(socialAccounts.id, connection.id))
            .limit(1)
        )[0].metadata as Record<string, any>) || {};
      await db
        .update(socialAccounts)
        .set({
          metadata: {
            ...currentMeta,
            needsReconnect: true,
            tokenRefreshFailedAt: new Date().toISOString(),
          },
        })
        .where(eq(socialAccounts.id, connection.id));
    } catch (metaErr) {
      logger.debug(
        `[TokenRefresh] Could not persist needsReconnect flag: ${metaErr}`,
      );
    }
    return token; // fall back to expired token (API call will fail and log the error)
  }

  // Persist the new token and clear any needsReconnect flag
  await db
    .update(socialAccounts)
    .set({
      accessToken: refreshed.accessToken,
      tokenExpiresAt: refreshed.expiresAt,
      ...(refreshed.refreshToken
        ? { refreshToken: refreshed.refreshToken }
        : {}),
    })
    .where(eq(socialAccounts.id, connection.id));

  logger.info(
    `[TokenRefresh] ${p}: token refreshed successfully, expires ${refreshed.expiresAt.toISOString() ?? "unknown"}`,
  );
  return refreshed.accessToken;
}

interface SyncResult {
  username: string;
  followerCount: number;
  engagementRate: number;
  profileUrl: string;
  platformUserId: string;
  metadata: Record<string, any>;
}

/**
 * Compute engagement rate from the last 30 published posts for a platform.
 * engagementRate = avg((likes + comments + shares) / followers) * 100
 */
async function calcEngagementRate(
  userId: string,
  platform: string,
  followers: number,
): Promise<number> {
  if (followers === 0) return 0;
  try {
    // First try posts with publishedAt set (actually published)
    let recentPosts = await db
      .select()
      .from(posts)
      .where(
        and(
          eq(posts.userId, userId),
          eq(posts.platform, platform),
          isNotNull(posts.publishedAt),
        ),
      )
      .orderBy(desc(posts.createdAt))
      .limit(30);

    // Fallback: also include posts with status='published' or 'completed'
    if (!recentPosts?.length) {
      recentPosts = await db
        .select()
        .from(posts)
        .where(
          and(
            eq(posts?.userId, userId),
            eq(posts?.platform, platform),
            inArray(posts?.status, ["published", "completed"]),
          ),
        )
        .orderBy(desc(posts?.createdAt))
        .limit(30);
    }

    if (!recentPosts?.length) return 0;

    let totalInteractions = 0;
    let counted = 0;
    for (const post of recentPosts) {
      const eng = post?.engagement as Record<string, unknown>;
      if (!eng) continue;
      const interactions =
        (eng?.likes || 0) + (eng?.comments || 0) + (eng?.shares || 0);
      totalInteractions += interactions;
      counted++;
    }
    if (counted === 0) return 0;
    const avgInteractions = totalInteractions / counted;
    return Math?.min(
      Math?.round((avgInteractions / followers) * 10000) / 100,
      100,
    );
  } catch {
    return 0;
  }
}

export async function syncPlatformData(
  userId: string,
  platform: string,
): Promise<Record<string, SyncResult | { error: string }>> {
  const platformsToSync =
    platform === "meta" ? ["facebook", "instagram"] : [platform];
  const results: Record<string, SyncResult | { error: string }> = {};

  for (const p of platformsToSync) {
    const [connection] = await db
      .select()
      .from(socialAccounts)
      .where(
        and(eq(socialAccounts?.userId, userId), eq(socialAccounts?.platform, p)),
      )
      .limit(1);

    if (!connection || !connection?.accessToken) {
      results[p] = { error: "Not connected or no access token" };
      continue;
    }

    // Get a valid (refreshed if needed) access token before making any API calls
    const accessToken = await getValidAccessToken(connection);
    if (!accessToken) {
      results[p] = { error: "Could not obtain valid access token" };
      continue;
    }

    let syncedFollowerCount = connection?.followerCount || 0;
    let syncedProfileUrl = connection?.profileUrl || "";
    let syncedPlatformUserId = connection?.platformUserId || "";
    let syncedMetadata: Record<string, any> =
      (connection?.metadata as Record<string, any>) || {};
    let syncedUsername = connection?.username || "";

    try {
      if (p === "facebook") {
        // Step 1: basic personal profile
        const userRes = await timedFetch(
          `https://graph.facebook.com/me?fields=id,name,picture&access_token=${accessToken}`,
        );
        const userData = await userRes?.json();
        if (userData?.error)
          logger?.warn(
            `[SocialSync] Facebook profile error:`,
            JSON?.stringify(userData?.error),
          );
        syncedUsername = userData?.name || syncedUsername;
        syncedPlatformUserId = userData?.id || syncedPlatformUserId;
        syncedProfileUrl = `https://www.facebook.com/${userData.id}`;
        syncedMetadata = {
          ...syncedMetadata,
          picture: userData.picture?.data?.url,
        };

        // Step 2: fetch managed pages and sum their fan/follower counts
        const pagesRes = await timedFetch(
          `https://graph.facebook.com/me/accounts?fields=id,name,fan_count,followers_count&access_token=${accessToken}`,
        );
        const pagesData = await pagesRes?.json();
        if (pagesData?.data && pagesData?.data.length > 0) {
          // Sum all managed page followers
          const totalPageFollowers = pagesData?.data.reduce(
            (sum: number, page: Record<string, unknown>) =>
              sum + (page?.followers_count || page?.fan_count || 0),
            0,
          );
          const primaryPage = pagesData?.data[0];
          syncedFollowerCount = totalPageFollowers;
          syncedProfileUrl = `https://www.facebook.com/${primaryPage.id}`;
          syncedMetadata = {
            ...syncedMetadata,
            pages: pagesData.data.map((pg: Record<string, unknown>) => ({
              id: pg.id,
              name: pg.name,
              followers: pg.followers_count || pg?.fan_count || 0,
            })),
          };
          logger?.info(
            `[SocialSync] Facebook: ${pagesData.data.length} page(s), total followers=${totalPageFollowers}`,
          );
        }
      } else if (p === "instagram") {
        // Fetch Instagram Business account via the Facebook Graph API
        const pagesRes = await timedFetch(
          `https://graph.facebook.com/me/accounts?fields=id,name,access_token&access_token=${accessToken}`,
        );
        const pagesData = await pagesRes?.json();

        if (pagesData?.data && pagesData?.data.length > 0) {
          let bestIgAccount: Record<string, unknown> | null = null;
          let bestFollowers = 0;

          // Check all pages for linked Instagram Business accounts
          for (const page of pagesData?.data) {
            const pageToken = page?.access_token;
            const igAccountRes = await timedFetch(
              `https://graph.facebook.com/${page.id}?fields=instagram_business_account&access_token=${pageToken}`,
            );
            const igAccountData = await igAccountRes?.json();
            if (!igAccountData?.instagram_business_account) continue;

            const igId = igAccountData?.instagram_business_account.id;
            const igUserRes = await timedFetch(
              `https://graph.facebook.com/${igId}?fields=username,followers_count,media_count,profile_picture_url&access_token=${pageToken}`,
            );
            const igUserData = await igUserRes?.json();
            const followers = igUserData?.followers_count || 0;

            if (followers >= bestFollowers) {
              bestFollowers = followers;
              bestIgAccount = {
                id: igId,
                username: igUserData.username,
                followers_count: followers,
                media_count: igUserData.media_count || 0,
                profile_picture_url: igUserData.profile_picture_url,
                pageToken,
              };
            }
          }

          if (bestIgAccount) {
            syncedUsername = bestIgAccount?.username || syncedUsername;
            syncedFollowerCount = bestIgAccount?.followers_count;
            syncedPlatformUserId = bestIgAccount?.id;
            syncedProfileUrl = `https://www.instagram.com/${bestIgAccount.username}`;
            syncedMetadata = {
              ...syncedMetadata,
              mediaCount: bestIgAccount.media_count,
              profilePictureUrl: bestIgAccount.profile_picture_url,
            };
            logger?.info(
              `[SocialSync] Instagram: @${bestIgAccount.username}, followers=${bestIgAccount?.followers_count}`,
            );
          }
        } else {
          logger?.warn(`[SocialSync] Instagram: no linked Facebook pages found`);
        }
      } else if (p === "twitter") {
        const userRes = await timedFetch(
          "https://api.twitter.com/2/users/me?user.fields=public_metrics,profile_image_url,description",
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const userData = await userRes?.json();
        if (userData?.data) {
          syncedUsername = userData?.data.username || syncedUsername;
          syncedFollowerCount =
            userData?.data.public_metrics?.followers_count || 0;
          syncedPlatformUserId = userData?.data.id || syncedPlatformUserId;
          syncedProfileUrl = `https://x.com/${userData.data.username}`;
          syncedMetadata = {
            ...syncedMetadata,
            followingCount: userData.data.public_metrics?.following_count || 0,
            tweetCount: userData.data.public_metrics?.tweet_count || 0,
            listedCount: userData.data.public_metrics?.listed_count || 0,
            profileImageUrl: userData.data.profile_image_url,
          };
        } else {
          const isAuthError =
            userData?.status === 401 || userData?.title === "Unauthorized";
          logger?.warn(
            `[SocialSync] Twitter response (no .data): ${JSON?.stringify(userData).slice(0, 400)}`,
          );
          if (isAuthError)
            syncedMetadata = {
              ...syncedMetadata,
              needsReconnect: true,
              tokenRefreshFailedAt: new Date().toISOString(),
            };
        }
      } else if (p === "youtube") {
        const userRes = await timedFetch(
          "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const userData = await userRes?.json();
        const channel = userData?.items?.[0];
        if (channel) {
          syncedUsername = channel?.snippet?.title || syncedUsername;
          syncedFollowerCount = parseInt(
            channel?.statistics?.subscriberCount || "0",
            10,
          );
          syncedPlatformUserId = channel?.id || syncedPlatformUserId;
          syncedProfileUrl = `https://www.youtube.com/channel/${channel.id}`;
          syncedMetadata = {
            ...syncedMetadata,
            viewCount: parseInt(channel?.statistics?.viewCount || "0", 10),
            videoCount: parseInt(channel?.statistics?.videoCount || "0", 10),
            customUrl: channel.snippet?.customUrl,
            thumbnailUrl: channel.snippet?.thumbnails?.default?.url,
          };
        } else {
          logger?.warn(
            `[SocialSync] YouTube no channels: ${JSON?.stringify(userData).slice(0, 400)}`,
          );
        }
      } else if (p === "tiktok" || p === "tiktok_sandbox") {
        const userRes = await timedFetch(
          "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,follower_count,following_count,likes_count,video_count",
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const userData = await userRes?.json();
        const tiktokData = userData?.data?.user;
        if (tiktokData) {
          syncedUsername = tiktokData?.display_name || syncedUsername;
          syncedFollowerCount = tiktokData?.follower_count || 0;
          syncedProfileUrl = tiktokData?.avatar_url || syncedProfileUrl;
          syncedPlatformUserId = tiktokData?.open_id || syncedPlatformUserId;
          syncedMetadata = {
            ...syncedMetadata,
            followingCount: tiktokData.following_count || 0,
            likesCount: tiktokData.likes_count || 0,
            videoCount: tiktokData.video_count || 0,
          };
        } else {
          const errCode = userData?.error?.code;
          logger?.warn(
            `[SocialSync] TikTok no user data: ${JSON?.stringify(userData).slice(0, 400)}`,
          );
          if (
            errCode === "access_token_invalid" ||
            errCode === "token_expired"
          ) {
            syncedMetadata = {
              ...syncedMetadata,
              needsReconnect: true,
              tokenRefreshFailedAt: new Date().toISOString(),
            };
          }
        }
      } else if (p === "linkedin") {
        const profileRes = await timedFetch(
          "https://api.linkedin.com/v2/userinfo",
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );
        const profileData = await profileRes?.json();
        const liErr =
          profileData?.error ||
          (profileData?.status === 401 ? profileData : null);
        if (liErr) {
          logger?.warn(
            `[SocialSync] LinkedIn profile error: ${JSON?.stringify(profileData).slice(0, 400)}`,
          );
          // DISABLED_APPLICATION (65606) or any 401 means the OAuth app/token is invalid
          const isDisabled =
            profileData?.code === "DISABLED_APPLICATION" ||
            profileData?.serviceErrorCode === 65606;
          if (profileData?.status === 401 || isDisabled) {
            syncedMetadata = {
              ...syncedMetadata,
              needsReconnect: true,
              tokenRefreshFailedAt: new Date().toISOString(),
            };
          }
        } else {
          syncedUsername = profileData?.name || syncedUsername;
          syncedPlatformUserId = profileData?.sub || syncedPlatformUserId;
          // Use syncedPlatformUserId (already has fallback) rather than raw profileData?.sub
          syncedProfileUrl =
            profileData?.profile ||
            `https://www.linkedin.com/in/${syncedPlatformUserId}`;
          syncedMetadata = {
            ...syncedMetadata,
            email: profileData.email,
            picture: profileData.picture,
          };
        }

        // Try to get connection count via OAuth 2.0 — LinkedIn exposes this through
        // multiple endpoints depending on which scopes were granted at connect-time.
        // Skip if the app itself returned an error (disabled, 401, etc.)
        if (syncedPlatformUserId && !liErr) {
          try {
            // Attempt 1: r_network scope → connections list (count in paging?._total)
            const connectionsRes = await timedFetch(
              "https://api.linkedin.com/v2/connections?q=viewer&start=0&count=0",
              {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "LinkedIn-Version": "202304",
                },
              },
            );
            const connectionsData = await connectionsRes?.json();
            const connCount =
              connectionsData?.paging?._total ?? connectionsData?.paging?.total;
            if (typeof connCount === "number" && connCount > 0) {
              syncedFollowerCount = connCount;
              logger?.info(
                `[SocialSync] LinkedIn connections (r_network): ${connCount}`,
              );
            } else {
              // Attempt 2: networkSizes endpoint (company-follower count, requires r_organization_social)
              const personUrn = encodeURIComponent(
                `urn:li:person:${syncedPlatformUserId}`,
              );
              const networkRes = await timedFetch(
                `https://api.linkedin.com/v2/networkSizes/${personUrn}?edgeType=CompanyFollowedByMember`,
                { headers: { Authorization: `Bearer ${accessToken}` } },
              );
              const networkData = await networkRes?.json();
              if (typeof networkData?.firstDegreeSize === "number") {
                syncedFollowerCount = networkData?.firstDegreeSize;
                logger?.info(
                  `[SocialSync] LinkedIn company followers (r_organization_social): ${networkData?.firstDegreeSize}`,
                );
              } else {
                // LinkedIn OAuth 2.0 does not expose connection/follower counts without
                // r_network or r_organization_social scope — 0 is correct until re-auth with those scopes.
                logger?.debug(
                  `[SocialSync] LinkedIn: no connection count accessible with current OAuth scopes — ${JSON?.stringify(connectionsData).slice(0, 150)}`,
                );
              }
            }
          } catch (linkedInErr) {
            logger?.debug(
              `[SocialSync] LinkedIn follower count error: ${linkedInErr}`,
            );
          }
        }
      } else if (p === "threads") {
        // Include followers_count in the fields
        const userRes = await timedFetch(
          `https://graph.threads.net/me?fields=id,username,threads_profile_picture_url,followers_count&access_token=${accessToken}`,
        );
        const userData = await userRes?.json();
        if (userData?.id) {
          syncedUsername = userData?.username || syncedUsername;
          syncedPlatformUserId = userData?.id || syncedPlatformUserId;
          syncedFollowerCount = userData?.followers_count || 0;
          syncedProfileUrl = `https://www.threads.net/@${userData.username}`;
          syncedMetadata = {
            ...syncedMetadata,
            profilePictureUrl: userData.threads_profile_picture_url,
          };
        } else {
          logger?.warn(
            `[SocialSync] Threads error: ${JSON?.stringify(userData).slice(0, 400)}`,
          );
          const threadsErrCode = userData?.error?.code;
          if (
            threadsErrCode === 190 ||
            userData?.error?.type === "OAuthException"
          ) {
            syncedMetadata = {
              ...syncedMetadata,
              needsReconnect: true,
              tokenRefreshFailedAt: new Date().toISOString(),
            };
          }
        }
      } else if (p === "google" || p === "googlebusiness") {
        const userRes = await timedFetch(
          "https://www.googleapis.com/oauth2/v2/userinfo",
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );
        const userData = await userRes?.json();
        syncedUsername = userData?.name || syncedUsername;
        syncedPlatformUserId = userData?.id || syncedPlatformUserId;
        syncedProfileUrl = userData?.link || "https://www.google.com";
        syncedMetadata = {
          ...syncedMetadata,
          email: userData.email,
          picture: userData.picture,
        };

        // Try to get Business Profile review/follower count
        try {
          const accountsRes = await timedFetch(
            "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          const accountsData = await accountsRes?.json();
          const account = accountsData?.accounts?.[0];
          if (account) {
            const locRes = await timedFetch(
              `https://mybusiness.googleapis.com/v4/${account.name}/locations`,
              { headers: { Authorization: `Bearer ${accessToken}` } },
            );
            const locData = await locRes?.json();
            const location = locData?.locations?.[0];
            if (location) {
              const reviewCount = location?.metadata?.totalReviewCount || 0;
              syncedFollowerCount = reviewCount;
              syncedMetadata = {
                ...syncedMetadata,
                locationName: location.locationName,
                reviewCount,
              };
            }
          }
        } catch (gbErr) {
          logger?.debug(
            `[SocialSync] Google Business extended data unavailable: ${gbErr}`,
          );
        }
      }
    } catch (apiErr) {
      logger?.warn(`[SocialSync] Failed to sync ${p} stats:`, apiErr);
    }

    // Calculate engagement rate from our stored published posts
    const engagementRate = await calcEngagementRate(
      userId,
      p,
      syncedFollowerCount,
    );

    await db
      .update(socialAccounts)
      .set({
        username: syncedUsername,
        followerCount: syncedFollowerCount,
        profileUrl: syncedProfileUrl,
        platformUserId: syncedPlatformUserId,
        metadata: {
          ...syncedMetadata,
          lastSyncedAt: new Date().toISOString(),
          engagementRate,
        },
      })
      .where(eq(socialAccounts?.id, connection?.id));

    results[p] = {
      username: syncedUsername,
      followerCount: syncedFollowerCount,
      engagementRate,
      profileUrl: syncedProfileUrl,
      platformUserId: syncedPlatformUserId,
      metadata: syncedMetadata,
    };

    logger?.info(
      `[SocialSync] ${p}: followers=${syncedFollowerCount}, engagement=${engagementRate}%`,
    );
  }

  return results;
}
