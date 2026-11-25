// @ts-nocheck
import { createHash } from "node:crypto";
import axios from "axios";
import { and, eq } from "drizzle-orm";
import { db } from "../db.js";
import { socialAccounts, socialInboxMessages } from "@shared/schema";
import { logger } from "../logger.js";
import { socialOAuth } from "./socialOAuthService.js";

const GRAPH_API = "https://graph.facebook.com/v19.0";
const X_API = "https://api.x.com/2";
const SYNC_LIMIT = 20;
const PROVIDER_TIMEOUT_MS = 15_000;
const SUPPORTED_INBOX_PLATFORMS = new Set(["twitter", "facebook", "instagram"]);

export interface InboxProviderMessage {
  id: string;
  platform: "twitter" | "facebook" | "instagram";
  messageType: "comment" | "mention";
  content: string;
  authorId: string;
  authorName: string;
  authorHandle: string;
  authorAvatar?: string | null;
  authorFollowers?: number;
  authorVerified?: boolean;
  postContent?: string | null;
  postUrl?: string | null;
  threadId?: string | null;
  createdAt: Date;
}

export class SocialInboxProviderError extends Error {
  constructor(
    message: string,
    public readonly providerStatus?: number,
    public readonly outcome: "failed" | "unknown" = "failed",
  ) {
    super(message);
    this.name = "SocialInboxProviderError";
  }
}

function safeProviderError(error: any): SocialInboxProviderError {
  const status = Number(error?.response?.status) || undefined;
  const body = error?.response?.data;
  const detail =
    body?.error?.message ||
    body?.error_description ||
    body?.detail ||
    (typeof body?.error === "string" ? body.error : "");
  const message = detail
    ? `Provider request failed${status ? ` (HTTP ${status})` : ""}: ${String(detail).slice(0, 240)}`
    : `Provider request failed${status ? ` (HTTP ${status})` : ""}`;
  return new SocialInboxProviderError(
    message,
    status,
    !status || status >= 500 ? "unknown" : "failed",
  );
}

function toDate(value: unknown): Date {
  const parsed = value ? new Date(String(value)) : new Date();
  return Number.isFinite(parsed.getTime()) ? parsed : new Date();
}

function deterministicInboxId(
  userId: string,
  platform: string,
  providerMessageId: string,
): string {
  const digest = createHash("sha256")
    .update(`${userId}:${platform}:${providerMessageId}`)
    .digest("hex");
  return `inbox_${digest}`;
}

function sentimentFor(text: string): "positive" | "neutral" | "negative" {
  const normalized = text.toLowerCase();
  if (/\b(hate|awful|terrible|worst|bad|angry|disappointed|scam)\b/.test(normalized)) {
    return "negative";
  }
  if (/\b(love|great|amazing|awesome|excellent|beautiful|thank you|thanks)\b/.test(normalized)) {
    return "positive";
  }
  return "neutral";
}

export function normalizeProviderInboxMessage(
  userId: string,
  message: InboxProviderMessage,
) {
  return {
    id: deterministicInboxId(userId, message.platform, message.id),
    userId,
    platform: message.platform,
    messageType: message.messageType,
    content: message.content || "",
    authorId: message.authorId || null,
    authorName: message.authorName || "Unknown",
    authorHandle: message.authorHandle || "unknown",
    authorAvatar: message.authorAvatar || null,
    authorFollowers: message.authorFollowers || 0,
    authorVerified: message.authorVerified || false,
    postContent: message.postContent || null,
    postUrl: message.postUrl || null,
    sentiment: sentimentFor(message.content || ""),
    priority: "medium",
    status: "unread",
    tags: [],
    threadId: message.threadId || message.id,
    parentMessageId: message.id,
    replyContent: null,
    replyDelivered: false,
    replyDeliveryState: "draft",
    providerReplyId: null,
    replyDeliveryError: null,
    createdAt: message.createdAt,
  };
}

async function providerGet(url: string, config: Record<string, unknown>) {
  try {
    const response = await axios.get(url, {
      ...config,
      timeout: PROVIDER_TIMEOUT_MS,
    });
    if (response?.data?.error) {
      throw new SocialInboxProviderError(
        `Provider request failed: ${String(response.data.error.message || response.data.error).slice(0, 240)}`,
        response.status,
        "failed",
      );
    }
    return response.data;
  } catch (error) {
    if (error instanceof SocialInboxProviderError) throw error;
    throw safeProviderError(error);
  }
}

async function getTwitterMentions(
  userId: string,
  accessToken: string,
  platformUserId?: string | null,
): Promise<InboxProviderMessage[]> {
  let accountId = platformUserId;
  if (!accountId) {
    const me = await providerGet(`${X_API}/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    accountId = me?.data?.id;
  }
  if (!accountId) {
    throw new SocialInboxProviderError(
      "X did not return the connected account ID; reconnect the account.",
    );
  }

  const data = await providerGet(`${X_API}/users/${encodeURIComponent(accountId)}/mentions`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: {
      max_results: SYNC_LIMIT,
      "tweet.fields": "author_id,created_at,conversation_id,public_metrics",
      expansions: "author_id",
      "user.fields": "name,username,profile_image_url,public_metrics,verified",
    },
  });
  const users = new Map(
    (data?.includes?.users || []).map((user: any) => [user.id, user]),
  );

  return (data?.data || []).map((tweet: any) => {
    const author: any = users.get(tweet.author_id) || {};
    return {
      id: String(tweet.id),
      platform: "twitter",
      messageType: "mention",
      content: tweet.text || "",
      authorId: tweet.author_id || "",
      authorName: author.name || "Unknown",
      authorHandle: author.username ? `@${author.username}` : "unknown",
      authorAvatar: author.profile_image_url || null,
      authorFollowers: author.public_metrics?.followers_count || 0,
      authorVerified: author.verified || false,
      postUrl: author.username
        ? `https://x.com/${author.username}/status/${tweet.id}`
        : `https://x.com/i/status/${tweet.id}`,
      threadId: tweet.conversation_id || tweet.id,
      createdAt: toDate(tweet.created_at),
    } satisfies InboxProviderMessage;
  });
}

async function getFacebookComments(
  accessToken: string,
): Promise<InboxProviderMessage[]> {
  const page = await providerGet(`${GRAPH_API}/me`, {
    params: { fields: "id,name", access_token: accessToken },
  });
  if (!page?.id) {
    throw new SocialInboxProviderError(
      "Facebook did not return the connected Page ID; reconnect the account.",
    );
  }

  const feed = await providerGet(`${GRAPH_API}/${encodeURIComponent(page.id)}/feed`, {
    params: {
      fields: "id,message,permalink_url,created_time",
      limit: SYNC_LIMIT,
      access_token: accessToken,
    },
  });
  const messages: InboxProviderMessage[] = [];
  for (const post of feed?.data || []) {
    if (!post?.id) continue;
    const comments = await providerGet(
      `${GRAPH_API}/${encodeURIComponent(post.id)}/comments`,
      {
        params: {
          fields: "id,message,from{id,name,picture},created_time,permalink_url",
          limit: 100,
          access_token: accessToken,
        },
      },
    );
    for (const comment of comments?.data || []) {
      if (!comment?.id || !comment?.message || comment?.from?.id === page.id) continue;
      messages.push({
        id: String(comment.id),
        platform: "facebook",
        messageType: "comment",
        content: comment.message,
        authorId: comment.from?.id || "",
        authorName: comment.from?.name || "Unknown",
        authorHandle: comment.from?.name || "unknown",
        authorAvatar: comment.from?.picture?.data?.url || null,
        postContent: post.message || "",
        postUrl: comment.permalink_url || post.permalink_url || null,
        threadId: String(post.id),
        createdAt: toDate(comment.created_time),
      });
    }
  }
  return messages;
}

async function getInstagramComments(
  accountId: string | null | undefined,
  accessToken: string,
): Promise<InboxProviderMessage[]> {
  if (!accountId) {
    throw new SocialInboxProviderError(
      "Instagram Business Account ID is missing; reconnect the account.",
    );
  }
  const media = await providerGet(
    `${GRAPH_API}/${encodeURIComponent(accountId)}/media`,
    {
      params: {
        fields: "id,caption,permalink,timestamp",
        limit: SYNC_LIMIT,
        access_token: accessToken,
      },
    },
  );
  const messages: InboxProviderMessage[] = [];
  for (const post of media?.data || []) {
    if (!post?.id) continue;
    const comments = await providerGet(
      `${GRAPH_API}/${encodeURIComponent(post.id)}/comments`,
      {
        params: {
          fields: "id,text,username,timestamp,from",
          limit: 100,
          access_token: accessToken,
        },
      },
    );
    for (const comment of comments?.data || []) {
      if (!comment?.id || !comment?.text) continue;
      const username = comment.username || comment.from?.username || "unknown";
      if (comment.from?.id === accountId || username === "unknown") continue;
      messages.push({
        id: String(comment.id),
        platform: "instagram",
        messageType: "comment",
        content: comment.text,
        authorId: comment.from?.id || username,
        authorName: username,
        authorHandle: `@${username}`,
        postContent: post.caption || "",
        postUrl: post.permalink || null,
        threadId: String(post.id),
        createdAt: toDate(comment.timestamp),
      });
    }
  }
  return messages;
}

export async function syncSocialInbox(
  userId: string,
  requestedPlatforms?: string[],
) {
  const platforms = requestedPlatforms?.length
    ? [...new Set(requestedPlatforms.map((platform) => platform.toLowerCase()))]
    : ["twitter", "facebook", "instagram"];
  const results = [];

  for (const platform of platforms) {
    if (!SUPPORTED_INBOX_PLATFORMS.has(platform)) {
      results.push({
        platform,
        status: "unsupported",
        imported: 0,
        error: "Provider inbox ingestion is not available for this platform.",
      });
      continue;
    }

    try {
      const [account] = await db
        .select({
          platformUserId: socialAccounts.platformUserId,
          isActive: socialAccounts.isActive,
        })
        .from(socialAccounts)
        .where(
          and(
            eq(socialAccounts.userId, userId),
            eq(socialAccounts.platform, platform),
            eq(socialAccounts.isActive, true),
          ),
        )
        .limit(1);
      if (!account) {
        results.push({
          platform,
          status: "not_connected",
          imported: 0,
          error: "Connect this platform before syncing its inbox.",
        });
        continue;
      }
      const accessToken = await socialOAuth.getValidAccessToken(userId, platform);
      if (!accessToken) {
        results.push({
          platform,
          status: "reauthorize",
          imported: 0,
          error: "A usable platform token is unavailable; reconnect this account.",
        });
        continue;
      }

      const messages =
        platform === "twitter"
          ? await getTwitterMentions(userId, accessToken, account.platformUserId)
          : platform === "facebook"
            ? await getFacebookComments(accessToken)
            : await getInstagramComments(account.platformUserId, accessToken);
      const rows = messages.map((message) =>
        normalizeProviderInboxMessage(userId, message),
      );
      const inserted = rows.length
        ? await db
          .insert(socialInboxMessages)
          .values(rows)
          .onConflictDoNothing({ target: socialInboxMessages.id })
          .returning({ id: socialInboxMessages.id })
        : [];
      results.push({
        platform,
        status: "synced",
        imported: inserted.length,
        scanned: messages.length,
        window: `comments/mentions from the most recent ${SYNC_LIMIT} account items`,
      });
    } catch (error) {
      const providerError =
        error instanceof SocialInboxProviderError
          ? error
          : safeProviderError(error);
      logger.warn(
        {
          platform,
          status: providerError.providerStatus,
          outcome: providerError.outcome,
        },
        "[SocialInbox] Provider sync failed",
      );
      results.push({
        platform,
        status:
          providerError.providerStatus === 401 ||
          providerError.providerStatus === 403
            ? "reauthorize"
            : "failed",
        imported: 0,
        error: providerError.message,
      });
    }
  }
  return {
    success: results.every((result) =>
      ["synced", "not_connected", "unsupported"].includes(result.status),
    ),
    results,
  };
}

export async function sendSocialInboxReply(
  platform: string,
  providerMessageId: string | null | undefined,
  content: string,
  accessToken: string,
) {
  if (!providerMessageId) {
    throw new SocialInboxProviderError(
      "Provider message ID is missing; this inbox item cannot be replied to.",
    );
  }

  let url: string;
  let body: Record<string, unknown>;
  let headers: Record<string, string> = {};
  let params: Record<string, string> = { access_token: accessToken };
  if (platform === "twitter") {
    url = `${X_API}/tweets`;
    body = {
      text: content,
      reply: { in_reply_to_tweet_id: providerMessageId },
    };
    headers = { Authorization: `Bearer ${accessToken}` };
    params = {};
  } else if (platform === "facebook") {
    url = `${GRAPH_API}/${encodeURIComponent(providerMessageId)}/comments`;
    body = { message: content };
  } else if (platform === "instagram") {
    url = `${GRAPH_API}/${encodeURIComponent(providerMessageId)}/replies`;
    body = { message: content };
  } else {
    throw new SocialInboxProviderError(
      `Replies are not supported for ${platform}.`,
    );
  }

  try {
    const response = await axios.post(url, body, {
      headers,
      params,
      timeout: PROVIDER_TIMEOUT_MS,
    });
    const providerReplyId =
      response?.data?.id || response?.data?.data?.id || null;
    if (!providerReplyId) {
      throw new SocialInboxProviderError(
        "The provider accepted no identifiable reply receipt; delivery requires reconciliation.",
        response?.status,
        "unknown",
      );
    }
    return {
      providerReplyId: String(providerReplyId),
      providerUrl:
        platform === "twitter"
          ? `https://x.com/i/status/${providerReplyId}`
          : undefined,
    };
  } catch (error) {
    if (error instanceof SocialInboxProviderError) throw error;
    throw safeProviderError(error);
  }
}

export async function deliverInboxReply(
  message: { userId: string; platform: string; parentMessageId?: string | null },
  content: string,
) {
  let accessToken: string | null;
  try {
    accessToken = await socialOAuth.getValidAccessToken(
      message.userId,
      message.platform,
    );
  } catch {
    throw new SocialInboxProviderError(
      `Could not obtain a valid ${message.platform} token; reconnect the account before sending.`,
      401,
      "failed",
    );
  }
  if (!accessToken) {
    throw new SocialInboxProviderError(
      `No valid ${message.platform} account token is available; reconnect the account.`,
      401,
      "failed",
    );
  }
  return sendSocialInboxReply(
    message.platform,
    message.parentMessageId,
    content,
    accessToken,
  );
}