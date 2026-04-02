import { db } from '../db';
import { socialAccounts, posts } from '@shared/schema';
import { eq, and, isNotNull, desc } from 'drizzle-orm';
import { logger } from '../logger';

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
async function calcEngagementRate(userId: string, platform: string, followers: number): Promise<number> {
  if (followers === 0) return 0;
  try {
    const recentPosts = await db
      .select()
      .from(posts)
      .where(and(
        eq(posts.userId, userId),
        eq(posts.platform, platform),
        isNotNull(posts.publishedAt)
      ))
      .orderBy(desc(posts.createdAt))
      .limit(30);

    if (!recentPosts.length) return 0;

    let totalInteractions = 0;
    let counted = 0;
    for (const post of recentPosts) {
      const eng = post.engagement as any;
      if (!eng) continue;
      const interactions = (eng.likes || 0) + (eng.comments || 0) + (eng.shares || 0);
      totalInteractions += interactions;
      counted++;
    }
    if (counted === 0) return 0;
    const avgInteractions = totalInteractions / counted;
    return Math.min(Math.round((avgInteractions / followers) * 10000) / 100, 100);
  } catch {
    return 0;
  }
}

export async function syncPlatformData(
  userId: string,
  platform: string
): Promise<Record<string, SyncResult | { error: string }>> {
  const platformsToSync = platform === 'meta' ? ['facebook', 'instagram'] : [platform];
  const results: Record<string, SyncResult | { error: string }> = {};

  for (const p of platformsToSync) {
    const [connection] = await db
      .select()
      .from(socialAccounts)
      .where(and(
        eq(socialAccounts.userId, userId),
        eq(socialAccounts.platform, p)
      ))
      .limit(1);

    if (!connection || !connection.accessToken) {
      results[p] = { error: 'Not connected or no access token' };
      continue;
    }

    let syncedFollowerCount = connection.followerCount || 0;
    let syncedProfileUrl = connection.profileUrl || '';
    let syncedPlatformUserId = connection.platformUserId || '';
    let syncedMetadata: Record<string, any> = (connection.metadata as Record<string, any>) || {};
    let syncedUsername = connection.username || '';

    try {
      if (p === 'facebook') {
        // Step 1: basic personal profile
        const userRes = await fetch(
          `https://graph.facebook.com/me?fields=id,name,picture&access_token=${connection.accessToken}`
        );
        const userData = await userRes.json();
        syncedUsername = userData.name || syncedUsername;
        syncedPlatformUserId = userData.id || syncedPlatformUserId;
        syncedProfileUrl = `https://www.facebook.com/${userData.id}`;
        syncedMetadata = { ...syncedMetadata, picture: userData.picture?.data?.url };

        // Step 2: fetch managed pages and sum their fan/follower counts
        const pagesRes = await fetch(
          `https://graph.facebook.com/me/accounts?fields=id,name,fan_count,followers_count&access_token=${connection.accessToken}`
        );
        const pagesData = await pagesRes.json();
        if (pagesData.data && pagesData.data.length > 0) {
          // Sum all managed page followers
          const totalPageFollowers = pagesData.data.reduce(
            (sum: number, page: any) => sum + (page.followers_count || page.fan_count || 0),
            0
          );
          const primaryPage = pagesData.data[0];
          syncedFollowerCount = totalPageFollowers;
          syncedProfileUrl = `https://www.facebook.com/${primaryPage.id}`;
          syncedMetadata = {
            ...syncedMetadata,
            pages: pagesData.data.map((pg: any) => ({
              id: pg.id,
              name: pg.name,
              followers: pg.followers_count || pg.fan_count || 0,
            })),
          };
          logger.info(`[SocialSync] Facebook: ${pagesData.data.length} page(s), total followers=${totalPageFollowers}`);
        }

      } else if (p === 'instagram') {
        // Fetch Instagram Business account via the Facebook Graph API
        const pagesRes = await fetch(
          `https://graph.facebook.com/me/accounts?fields=id,name,access_token&access_token=${connection.accessToken}`
        );
        const pagesData = await pagesRes.json();

        if (pagesData.data && pagesData.data.length > 0) {
          let bestIgAccount: any = null;
          let bestFollowers = 0;

          // Check all pages for linked Instagram Business accounts
          for (const page of pagesData.data) {
            const pageToken = page.access_token;
            const igAccountRes = await fetch(
              `https://graph.facebook.com/${page.id}?fields=instagram_business_account&access_token=${pageToken}`
            );
            const igAccountData = await igAccountRes.json();
            if (!igAccountData.instagram_business_account) continue;

            const igId = igAccountData.instagram_business_account.id;
            const igUserRes = await fetch(
              `https://graph.facebook.com/${igId}?fields=username,followers_count,media_count,profile_picture_url&access_token=${pageToken}`
            );
            const igUserData = await igUserRes.json();
            const followers = igUserData.followers_count || 0;

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
            syncedUsername = bestIgAccount.username || syncedUsername;
            syncedFollowerCount = bestIgAccount.followers_count;
            syncedPlatformUserId = bestIgAccount.id;
            syncedProfileUrl = `https://www.instagram.com/${bestIgAccount.username}`;
            syncedMetadata = {
              ...syncedMetadata,
              mediaCount: bestIgAccount.media_count,
              profilePictureUrl: bestIgAccount.profile_picture_url,
            };
            logger.info(`[SocialSync] Instagram: @${bestIgAccount.username}, followers=${bestIgAccount.followers_count}`);
          }
        } else {
          logger.warn(`[SocialSync] Instagram: no linked Facebook pages found`);
        }

      } else if (p === 'twitter') {
        const userRes = await fetch(
          'https://api.twitter.com/2/users/me?user.fields=public_metrics,profile_image_url,description',
          { headers: { Authorization: `Bearer ${connection.accessToken}` } }
        );
        const userData = await userRes.json();
        if (userData.data) {
          syncedUsername = userData.data.username || syncedUsername;
          syncedFollowerCount = userData.data.public_metrics?.followers_count || 0;
          syncedPlatformUserId = userData.data.id || syncedPlatformUserId;
          syncedProfileUrl = `https://x.com/${userData.data.username}`;
          syncedMetadata = {
            ...syncedMetadata,
            followingCount: userData.data.public_metrics?.following_count || 0,
            tweetCount: userData.data.public_metrics?.tweet_count || 0,
            listedCount: userData.data.public_metrics?.listed_count || 0,
            profileImageUrl: userData.data.profile_image_url,
          };
        } else {
          logger.warn(`[SocialSync] Twitter API returned no data:`, userData);
        }

      } else if (p === 'youtube') {
        const userRes = await fetch(
          'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
          { headers: { Authorization: `Bearer ${connection.accessToken}` } }
        );
        const userData = await userRes.json();
        const channel = userData.items?.[0];
        if (channel) {
          syncedUsername = channel.snippet?.title || syncedUsername;
          syncedFollowerCount = parseInt(channel.statistics?.subscriberCount || '0', 10);
          syncedPlatformUserId = channel.id || syncedPlatformUserId;
          syncedProfileUrl = `https://www.youtube.com/channel/${channel.id}`;
          syncedMetadata = {
            ...syncedMetadata,
            viewCount: parseInt(channel.statistics?.viewCount || '0', 10),
            videoCount: parseInt(channel.statistics?.videoCount || '0', 10),
            customUrl: channel.snippet?.customUrl,
            thumbnailUrl: channel.snippet?.thumbnails?.default?.url,
          };
        } else {
          logger.warn(`[SocialSync] YouTube API returned no channels:`, userData);
        }

      } else if (p === 'tiktok' || p === 'tiktok_sandbox') {
        const userRes = await fetch(
          'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,follower_count,following_count,likes_count,video_count',
          { headers: { Authorization: `Bearer ${connection.accessToken}` } }
        );
        const userData = await userRes.json();
        const tiktokData = userData.data?.user;
        if (tiktokData) {
          syncedUsername = tiktokData.display_name || syncedUsername;
          syncedFollowerCount = tiktokData.follower_count || 0;
          syncedProfileUrl = tiktokData.avatar_url || syncedProfileUrl;
          syncedPlatformUserId = tiktokData.open_id || syncedPlatformUserId;
          syncedMetadata = {
            ...syncedMetadata,
            followingCount: tiktokData.following_count || 0,
            likesCount: tiktokData.likes_count || 0,
            videoCount: tiktokData.video_count || 0,
          };
        } else {
          logger.warn(`[SocialSync] TikTok API returned no user data:`, userData);
        }

      } else if (p === 'linkedin') {
        const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
          headers: { Authorization: `Bearer ${connection.accessToken}` },
        });
        const profileData = await profileRes.json();
        syncedUsername = profileData.name || syncedUsername;
        syncedPlatformUserId = profileData.sub || syncedPlatformUserId;
        syncedProfileUrl = profileData.profile || `https://www.linkedin.com/in/${profileData.sub}`;
        syncedMetadata = { ...syncedMetadata, email: profileData.email, picture: profileData.picture };

        // Try network size (requires r_organization_social scope)
        if (syncedPlatformUserId) {
          try {
            const personUrn = encodeURIComponent(`urn:li:person:${syncedPlatformUserId}`);
            const networkRes = await fetch(
              `https://api.linkedin.com/v2/networkSizes/${personUrn}?edgeType=CompanyFollowedByMember`,
              { headers: { Authorization: `Bearer ${connection.accessToken}` } }
            );
            const networkData = await networkRes.json();
            if (typeof networkData.firstDegreeSize === 'number') {
              syncedFollowerCount = networkData.firstDegreeSize;
            }
          } catch (linkedInErr) {
            logger.debug(`[SocialSync] LinkedIn follower count restricted: ${linkedInErr}`);
          }
        }

      } else if (p === 'threads') {
        // Include followers_count in the fields
        const userRes = await fetch(
          `https://graph.threads.net/me?fields=id,username,threads_profile_picture_url,followers_count&access_token=${connection.accessToken}`
        );
        const userData = await userRes.json();
        if (userData.id) {
          syncedUsername = userData.username || syncedUsername;
          syncedPlatformUserId = userData.id || syncedPlatformUserId;
          syncedFollowerCount = userData.followers_count || 0;
          syncedProfileUrl = `https://www.threads.net/@${userData.username}`;
          syncedMetadata = { ...syncedMetadata, profilePictureUrl: userData.threads_profile_picture_url };
        } else {
          logger.warn(`[SocialSync] Threads API error:`, userData);
        }

      } else if (p === 'google' || p === 'googlebusiness') {
        const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${connection.accessToken}` },
        });
        const userData = await userRes.json();
        syncedUsername = userData.name || syncedUsername;
        syncedPlatformUserId = userData.id || syncedPlatformUserId;
        syncedProfileUrl = userData.link || 'https://www.google.com';
        syncedMetadata = { ...syncedMetadata, email: userData.email, picture: userData.picture };

        // Try to get Business Profile review/follower count
        try {
          const accountsRes = await fetch(
            'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
            { headers: { Authorization: `Bearer ${connection.accessToken}` } }
          );
          const accountsData = await accountsRes.json();
          const account = accountsData.accounts?.[0];
          if (account) {
            const locRes = await fetch(
              `https://mybusiness.googleapis.com/v4/${account.name}/locations`,
              { headers: { Authorization: `Bearer ${connection.accessToken}` } }
            );
            const locData = await locRes.json();
            const location = locData.locations?.[0];
            if (location) {
              const reviewCount = location.metadata?.totalReviewCount || 0;
              syncedFollowerCount = reviewCount;
              syncedMetadata = {
                ...syncedMetadata,
                locationName: location.locationName,
                reviewCount,
              };
            }
          }
        } catch (gbErr) {
          logger.debug(`[SocialSync] Google Business extended data unavailable: ${gbErr}`);
        }
      }
    } catch (apiErr) {
      logger.warn(`[SocialSync] Failed to sync ${p} stats:`, apiErr);
    }

    // Calculate engagement rate from our stored published posts
    const engagementRate = await calcEngagementRate(userId, p, syncedFollowerCount);

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
      .where(eq(socialAccounts.id, connection.id));

    results[p] = {
      username: syncedUsername,
      followerCount: syncedFollowerCount,
      engagementRate,
      profileUrl: syncedProfileUrl,
      platformUserId: syncedPlatformUserId,
      metadata: syncedMetadata,
    };

    logger.info(`[SocialSync] ${p}: followers=${syncedFollowerCount}, engagement=${engagementRate}%`);
  }

  return results;
}
