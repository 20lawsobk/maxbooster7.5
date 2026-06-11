import { Router, Request, Response } from "express";
import { db } from "../db.js";
import { eq, desc, sql, inArray } from "drizzle-orm";
import {
  assistantConversations,
  assistantMessages,
} from "../../shared/schema.js";
import { generateMaxResponse } from "../services/maxAssistantService.js";
import { logger } from "../logger.js";
import { aiRateLimiter } from "../middleware/rateLimiter.js";
import rateLimit from "express-rate-limit";

// Unauthenticated callers get a tighter IP-based cap.
// Authenticated users are handled by the Redis-backed aiRateLimiter (100/hr).
const anonChatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !!req?.user,
  message: {
    error: "Too many messages — please sign in or wait before sending again.",
  },
});

const router = Router();

const PAGE_SIZE = 40;
const AI_CONTEXT_MESSAGES = 50;

async function getOrCreateConversation(userId: string): Promise<string> {
  const existing = await db
    .select()
    .from(assistantConversations)
    .where(eq(assistantConversations?.userId, userId))
    .orderBy(desc(assistantConversations?.createdAt))
    .limit(1);

  if (existing?.length > 0) {
    return existing[0].id;
  }

  const created = await db
    .insert(assistantConversations)
    .values({ userId })
    .returning();

  return created[0].id;
}

// GET /api/assistant/history
// Returns the latest PAGE_SIZE messages for the user's conversation.
// For pagination, pass ?before=<messageId> to get messages older than that ID.
// Response: { messages, hasMore, total, conversationId }
router.get("/history", async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user) {
      return res.json({
        messages: [],
        hasMore: false,
        total: 0,
        conversationId: null,
      });
    }

    const beforeId = req.query.before as string | undefined;

    const conversation = await db
      .select()
      .from(assistantConversations)
      .where(eq(assistantConversations.userId, user.id))
      .orderBy(desc(assistantConversations.createdAt))
      .limit(1);

    if (conversation.length === 0) {
      return res.json({
        messages: [],
        hasMore: false,
        total: 0,
        conversationId: null,
      });
    }

    const convId = conversation[0].id;

    // Count total messages in this conversation
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(assistantMessages)
      .where(eq(assistantMessages.conversationId, convId));

    const total = Number(countResult[0].count ?? 0);

    // Fetch page of messages.
    // When `before` cursor is provided, we find messages older than the given message.
    // Strategy: fetch PAGE_SIZE + 1 rows descending (newest first), then reverse.
    // This gives us the page of messages that are "before" in time.
    let fetchedRows;

    if (beforeId) {
      // Find the createdAt of the cursor message
      const cursorMsg = await db
        .select({ createdAt: assistantMessages.createdAt })
        .from(assistantMessages)
        .where(eq(assistantMessages.id, beforeId))
        .limit(1);

      if (cursorMsg.length === 0) {
        return res.json({
          messages: [],
          hasMore: false,
          total,
          conversationId: convId,
        });
      }

      const cursorDate = cursorMsg[0].createdAt;

      fetchedRows = await db
        .select()
        .from(assistantMessages)
        .where(
          sql`${assistantMessages.conversationId} = ${convId} AND ${assistantMessages.createdAt} < ${cursorDate}`,
        )
        .orderBy(desc(assistantMessages.createdAt))
        .limit(PAGE_SIZE + 1);
    } else {
      // Initial load: get the latest PAGE_SIZE messages
      fetchedRows = await db
        .select()
        .from(assistantMessages)
        .where(eq(assistantMessages.conversationId, convId))
        .orderBy(desc(assistantMessages.createdAt))
        .limit(PAGE_SIZE + 1);
    }

    const hasMore = fetchedRows.length > PAGE_SIZE;
    const pageRows = hasMore ? fetchedRows.slice(0, PAGE_SIZE) : fetchedRows;

    // Reverse so oldest-first order for display
    const messages = pageRows.reverse();

    return res.json({ messages, hasMore, total, conversationId: convId });
  } catch (error) {
    logger.warn("[assistant] Error fetching history:", error.message);
    return res.json({
      messages: [],
      hasMore: false,
      total: 0,
      conversationId: null,
    });
  }
});

// POST /api/assistant/chat
// Sends a message to Max, persists it, returns the in-house AI response.
// Body: { message: string }
// Response: { content, category, confidence, proactiveSuggestions, relatedTopics, quickActions, messageId, assistantMessageId }
router.post(
  "/chat",
  aiRateLimiter,
  anonChatLimiter,
  async (req: Request, res: Response) => {
    try {
      const { message } = req.body ?? {};

      if (
        !message ||
        typeof message !== "string" ||
        message.trim().length === 0
      ) {
        return res.status(400).json({ error: "Message is required" });
      }

      const trimmed = message.trim().slice(0, 2000);
      const user = req.user;

      let history: { role: "user" | "assistant"; content: string }[] = [];
      let conversationId: string | null = null;
      let userMessageId: string | null = null;
      let assistantMessageId: string | null = null;

      if (user) {
        conversationId = await getOrCreateConversation(user.id);

        // Fetch the last AI_CONTEXT_MESSAGES for conversation context
        const priorRows = await db
          .select()
          .from(assistantMessages)
          .where(eq(assistantMessages.conversationId, conversationId))
          .orderBy(desc(assistantMessages.createdAt))
          .limit(AI_CONTEXT_MESSAGES);

        history = priorRows.reverse().map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

        // Persist the user's message
        const [inserted] = await db
          .insert(assistantMessages)
          .values({ conversationId, role: "user", content: trimmed })
          .returning();

        userMessageId = inserted?.id;
      }

      const aiResponse = generateMaxResponse(trimmed, history);

      if (user && conversationId) {
        const [aiInserted] = await db
          .insert(assistantMessages)
          .values({
            conversationId,
            role: "assistant",
            content: aiResponse.content,
          })
          .returning();

        assistantMessageId = aiInserted?.id;

        await db
          .update(assistantConversations)
          .set({ updatedAt: new Date() })
          .where(eq(assistantConversations?.id, conversationId));
      }

      return res?.json({
        content: aiResponse.content,
        category: aiResponse.category,
        confidence: aiResponse.confidence,
        proactiveSuggestions: aiResponse.proactiveSuggestions ?? [],
        relatedTopics: aiResponse.relatedTopics ?? [],
        quickActions: aiResponse.quickActions ?? [],
        messageId: userMessageId,
        assistantMessageId,
      });
    } catch (error) {
      logger?.warn("[assistant] Error processing chat:", error?.message);
      return res
        .status(500)
        .json({ error: "Failed to process your message. Please try again." });
    }
  },
);

// DELETE /api/assistant/history
// Clears all messages and conversation records for the user.
router?.delete("/history", async (req: Request, res: Response) => {
  try {
    const user = req?.user;
    if (!user) {
      return res?.status(401).json({ error: "Not authenticated" });
    }

    const conversations = await db
      .select({ id: assistantConversations.id })
      .from(assistantConversations)
      .where(eq(assistantConversations?.userId, user?.id))
      .limit(500);

    if (conversations?.length > 0) {
      const convIds = conversations?.map((c) => c?.id);
      await db
        .delete(assistantMessages)
        .where(inArray(assistantMessages?.conversationId, convIds));
    }

    await db
      .delete(assistantConversations)
      .where(eq(assistantConversations?.userId, user?.id));

    return res?.json({ success: true });
  } catch (error) {
    logger?.warn("[assistant] Error clearing history:", error?.message);
    return res?.status(500).json({ error: "Failed to clear history" });
  }
});

export default router;
