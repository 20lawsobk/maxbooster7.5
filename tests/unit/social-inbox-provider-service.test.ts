import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  axiosGet: vi.fn(),
  axiosPost: vi.fn(),
  dbSelect: vi.fn(),
  dbInsert: vi.fn(),
  dbWhere: vi.fn(),
  dbLimit: vi.fn(),
  dbValues: vi.fn(),
  dbConflict: vi.fn(),
  dbReturning: vi.fn(),
  getAccessToken: vi.fn(),
}));

vi.mock("axios", () => ({
  default: {
    get: mocks.axiosGet,
    post: mocks.axiosPost,
  },
}));

vi.mock("../../server/db.js", () => ({
  db: {
    select: mocks.dbSelect,
    insert: mocks.dbInsert,
  },
}));

vi.mock("../../server/services/socialOAuthService.js", () => ({
  socialOAuth: { getValidAccessToken: mocks.getAccessToken },
}));

vi.mock("../../server/logger.js", () => ({
  logger: { warn: vi.fn(), info: vi.fn() },
}));

describe("social inbox provider service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dbSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: mocks.dbWhere,
      })),
    });
    mocks.dbWhere.mockReturnValue({ limit: mocks.dbLimit });
    mocks.dbLimit.mockResolvedValue([]);
    mocks.dbInsert.mockReturnValue({ values: mocks.dbValues });
    mocks.dbValues.mockReturnValue({
      onConflictDoNothing: mocks.dbConflict,
    });
    mocks.dbConflict.mockReturnValue({ returning: mocks.dbReturning });
    mocks.dbReturning.mockResolvedValue([]);
  });

  it("creates stable persisted rows with provider IDs and unread state", async () => {
    const { normalizeProviderInboxMessage } = await import(
      "../../server/services/socialInboxProviderService.js"
    );
    const message = {
      id: "tweet-123",
      platform: "twitter" as const,
      messageType: "mention" as const,
      content: "Love the new release!",
      authorId: "author-1",
      authorName: "Listener",
      authorHandle: "@listener",
      threadId: "conversation-1",
      createdAt: new Date("2025-01-02T03:04:05.000Z"),
    };

    const first = normalizeProviderInboxMessage("user-1", message);
    const second = normalizeProviderInboxMessage("user-1", message);

    expect(first.id).toBe(second.id);
    expect(first).toMatchObject({
      userId: "user-1",
      platform: "twitter",
      messageType: "mention",
      parentMessageId: "tweet-123",
      threadId: "conversation-1",
      status: "unread",
      replyDeliveryState: "draft",
      replyDelivered: false,
      sentiment: "positive",
    });
  });

  it("sends X replies as replies to the provider tweet and requires a receipt", async () => {
    mocks.axiosPost.mockResolvedValue({
      status: 201,
      data: { data: { id: "reply-456" } },
    });
    const { sendSocialInboxReply } = await import(
      "../../server/services/socialInboxProviderService.js"
    );

    const receipt = await sendSocialInboxReply(
      "twitter",
      "tweet-123",
      "Thanks for listening!",
      "test-token",
    );

    expect(mocks.axiosPost).toHaveBeenCalledWith(
      "https://api.x.com/2/tweets",
      {
        text: "Thanks for listening!",
        reply: { in_reply_to_tweet_id: "tweet-123" },
      },
      expect.objectContaining({
        headers: { Authorization: "Bearer test-token" },
      }),
    );
    expect(receipt).toMatchObject({
      providerReplyId: "reply-456",
      providerUrl: "https://x.com/i/status/reply-456",
    });
  });

  it.each([
    ["facebook", "comment-1", "https://graph.facebook.com/v19.0/comment-1/comments"],
    ["instagram", "ig-comment-1", "https://graph.facebook.com/v19.0/ig-comment-1/replies"],
  ])("uses the %s provider reply endpoint and confirms its receipt", async (
    platform,
    providerMessageId,
    expectedUrl,
  ) => {
    mocks.axiosPost.mockResolvedValue({
      status: 200,
      data: { id: `${platform}-reply-1` },
    });
    const { sendSocialInboxReply } = await import(
      "../../server/services/socialInboxProviderService.js"
    );

    const receipt = await sendSocialInboxReply(
      platform,
      providerMessageId,
      "Appreciate your comment!",
      "test-token",
    );

    expect(mocks.axiosPost).toHaveBeenCalledWith(
      expectedUrl,
      { message: "Appreciate your comment!" },
      expect.objectContaining({ params: { access_token: "test-token" } }),
    );
    expect(receipt.providerReplyId).toBe(`${platform}-reply-1`);
  });

  it("keeps provider failures explicit and reports missing receipts as uncertain", async () => {
    mocks.axiosPost.mockResolvedValue({ status: 200, data: {} });
    const { sendSocialInboxReply, SocialInboxProviderError } = await import(
      "../../server/services/socialInboxProviderService.js"
    );

    await expect(
      sendSocialInboxReply("facebook", "comment-1", "Reply", "test-token"),
    ).rejects.toMatchObject({
      name: "SocialInboxProviderError",
      outcome: "unknown",
    });
    expect(SocialInboxProviderError).toBeDefined();
  });

  it("imports and persists only provider messages, and deduplicates by provider ID", async () => {
    mocks.dbLimit.mockResolvedValue([
      { platformUserId: "x-account-1", isActive: true },
    ]);
    mocks.getAccessToken.mockResolvedValue("test-token");
    mocks.axiosGet.mockResolvedValue({
      status: 200,
      data: {
        data: [
          {
            id: "tweet-123",
            text: "New release sounds amazing",
            author_id: "author-1",
            conversation_id: "conversation-1",
            created_at: "2025-01-02T03:04:05.000Z",
          },
        ],
        includes: {
          users: [
            {
              id: "author-1",
              name: "Listener",
              username: "listener",
              verified: false,
              public_metrics: { followers_count: 42 },
            },
          ],
        },
      },
    });
    mocks.dbReturning.mockResolvedValue([{ id: "inbox-row-1" }]);
    const { syncSocialInbox } = await import(
      "../../server/services/socialInboxProviderService.js"
    );

    const result = await syncSocialInbox("user-1", ["twitter"]);

    expect(mocks.axiosGet).toHaveBeenCalledWith(
      "https://api.x.com/2/users/x-account-1/mentions",
      expect.objectContaining({
        headers: { Authorization: "Bearer test-token" },
      }),
    );
    expect(mocks.dbInsert).toHaveBeenCalledOnce();
    expect(mocks.dbValues).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: "user-1",
        platform: "twitter",
        parentMessageId: "tweet-123",
        status: "unread",
      }),
    ]);
    expect(result).toMatchObject({
      success: true,
      results: [{ platform: "twitter", status: "synced", imported: 1, scanned: 1 }],
    });
  });

  it("does not turn a provider authorization error into a successful empty inbox", async () => {
    mocks.dbLimit.mockResolvedValue([
      { platformUserId: "x-account-1", isActive: true },
    ]);
    mocks.getAccessToken.mockResolvedValue("test-token");
    mocks.axiosGet.mockRejectedValue({
      response: {
        status: 403,
        data: { error: { message: "Missing required permissions" } },
      },
    });
    const { syncSocialInbox } = await import(
      "../../server/services/socialInboxProviderService.js"
    );

    const result = await syncSocialInbox("user-1", ["twitter"]);

    expect(result.success).toBe(false);
    expect(result.results).toMatchObject([
      {
        platform: "twitter",
        status: "reauthorize",
        imported: 0,
        error: expect.stringContaining("Missing required permissions"),
      },
    ]);
    expect(mocks.dbInsert).not.toHaveBeenCalled();
  });
});