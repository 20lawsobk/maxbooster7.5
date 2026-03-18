import { db } from '../db';
import { socialAccounts } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '../logger';

interface SyncResult {
  username: string;
  followerCount: number;
  profileUrl: string;
  platformUserId: string;
  metadata: Record<string, any>;
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
      ));

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
        const userResponse = await fetch(`https://graph.facebook.com/me?fields=id,name,picture&access_token=${connection.accessToken}`);
        const userData = await userResponse.json();
        syncedUsername = userData.name || syncedUsername;
        syncedPlatformUserId = userData.id || syncedPlatformUserId;
        syncedProfileUrl = `https://www.facebook.com/${userData.id}`;
        syncedMetadata = { ...syncedMetadata, picture: userData.picture?.data?.url };
      } else if (p === 'instagram') {
        const igResponse = await fetch(`https://graph.facebook.com/me/accounts?access_token=${connection.accessToken}`);
        const igData = await igResponse.json();
        if (igData.data && igData.data.length > 0) {
          const pageId = igData.data[0].id;
          const pageToken = igData.data[0].access_token;
          const igAccountResponse = await fetch(`https://graph.facebook.com/${pageId}?fields=instagram_business_account&access_token=${pageToken}`);
          const igAccountData = await igAccountResponse.json();
          if (igAccountData.instagram_business_account) {
            const igUserResponse = await fetch(`https://graph.facebook.com/${igAccountData.instagram_business_account.id}?fields=username,followers_count,media_count&access_token=${pageToken}`);
            const igUserData = await igUserResponse.json();
            syncedUsername = igUserData.username || syncedUsername;
            syncedFollowerCount = igUserData.followers_count || 0;
            syncedPlatformUserId = igAccountData.instagram_business_account.id || syncedPlatformUserId;
            syncedProfileUrl = `https://www.instagram.com/${igUserData.username}`;
            syncedMetadata = { ...syncedMetadata, mediaCount: igUserData.media_count || 0 };
          }
        }
      } else if (p === 'twitter') {
        const userResponse = await fetch('https://api.twitter.com/2/users/me?user.fields=public_metrics,profile_image_url,description', {
          headers: { Authorization: `Bearer ${connection.accessToken}` },
        });
        const userData = await userResponse.json();
        syncedUsername = userData.data?.username || syncedUsername;
        syncedFollowerCount = userData.data?.public_metrics?.followers_count || 0;
        syncedPlatformUserId = userData.data?.id || syncedPlatformUserId;
        syncedProfileUrl = `https://x.com/${userData.data?.username}`;
        syncedMetadata = { followingCount: userData.data?.public_metrics?.following_count || 0, tweetCount: userData.data?.public_metrics?.tweet_count || 0, listedCount: userData.data?.public_metrics?.listed_count || 0, profileImageUrl: userData.data?.profile_image_url };
      } else if (p === 'youtube') {
        const userResponse = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', {
          headers: { Authorization: `Bearer ${connection.accessToken}` },
        });
        const userData = await userResponse.json();
        const channel = userData.items?.[0];
        syncedUsername = channel?.snippet?.title || syncedUsername;
        syncedFollowerCount = parseInt(channel?.statistics?.subscriberCount || '0');
        syncedPlatformUserId = channel?.id || syncedPlatformUserId;
        syncedProfileUrl = `https://www.youtube.com/channel/${channel?.id}`;
        syncedMetadata = { viewCount: parseInt(channel?.statistics?.viewCount || '0'), videoCount: parseInt(channel?.statistics?.videoCount || '0'), customUrl: channel?.snippet?.customUrl, thumbnailUrl: channel?.snippet?.thumbnails?.default?.url };
      } else if (p === 'tiktok' || p === 'tiktok_sandbox') {
        const userResponse = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,follower_count,following_count,likes_count,video_count', {
          headers: { 'Authorization': `Bearer ${connection.accessToken}` },
        });
        const userData = await userResponse.json();
        const tiktokData = userData.data?.user;
        syncedUsername = tiktokData?.display_name || syncedUsername;
        syncedFollowerCount = tiktokData?.follower_count || 0;
        syncedProfileUrl = tiktokData?.avatar_url || syncedProfileUrl;
        syncedPlatformUserId = tiktokData?.open_id || syncedPlatformUserId;
        syncedMetadata = { followingCount: tiktokData?.following_count || 0, likesCount: tiktokData?.likes_count || 0, videoCount: tiktokData?.video_count || 0 };
      } else if (p === 'linkedin') {
        const userResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
          headers: { 'Authorization': `Bearer ${connection.accessToken}` },
        });
        const userData = await userResponse.json();
        syncedUsername = userData.name || syncedUsername;
        syncedPlatformUserId = userData.sub || syncedPlatformUserId;
        syncedProfileUrl = `https://www.linkedin.com/in/${userData.sub}`;
        syncedMetadata = { email: userData.email, picture: userData.picture };
      } else if (p === 'threads') {
        const userResponse = await fetch(`https://graph.threads.net/me?fields=id,username,threads_profile_picture_url&access_token=${connection.accessToken}`);
        const userData = await userResponse.json();
        syncedUsername = userData.username || syncedUsername;
        syncedPlatformUserId = userData.id || syncedPlatformUserId;
        syncedProfileUrl = `https://www.threads.net/@${userData.username}`;
        syncedMetadata = { profilePictureUrl: userData.threads_profile_picture_url };
      } else if (p === 'google' || p === 'googlebusiness') {
        const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${connection.accessToken}` },
        });
        const userData = await userResponse.json();
        syncedUsername = userData.name || syncedUsername;
        syncedPlatformUserId = userData.id || syncedPlatformUserId;
        syncedMetadata = { email: userData.email, picture: userData.picture };
      }
    } catch (apiErr) {
      logger.warn(`Failed to sync ${p} stats:`, apiErr);
    }

    await db
      .update(socialAccounts)
      .set({
        username: syncedUsername,
        followerCount: syncedFollowerCount,
        profileUrl: syncedProfileUrl,
        platformUserId: syncedPlatformUserId,
        metadata: { ...(syncedMetadata || {}), lastSyncedAt: new Date().toISOString() },
      })
      .where(eq(socialAccounts.id, connection.id));

    results[p] = {
      username: syncedUsername,
      followerCount: syncedFollowerCount,
      profileUrl: syncedProfileUrl,
      platformUserId: syncedPlatformUserId,
      metadata: syncedMetadata,
    };
  }

  return results;
}
