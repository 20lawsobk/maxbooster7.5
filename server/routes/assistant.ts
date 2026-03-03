import { Router, Request, Response } from 'express';
import { db } from '../db.ts';
import { eq, desc, asc } from 'drizzle-orm';
import {
  assistantConversations,
  assistantMessages,
} from '../../shared/schema.ts';
import { generateMaxResponse } from '../services/maxAssistantService.ts';
import { logger } from '../logger.js';

const router = Router();

async function getOrCreateConversation(userId: string): Promise<string> {
  const existing = await db
    .select()
    .from(assistantConversations)
    .where(eq(assistantConversations.userId, userId))
    .orderBy(desc(assistantConversations.createdAt))
    .limit(1);

  if (existing.length > 0) {
    return existing[0].id;
  }

  const created = await db
    .insert(assistantConversations)
    .values({ userId })
    .returning();

  return created[0].id;
}

router.get('/history', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.json({ messages: [] });
    }

    const conversation = await db
      .select()
      .from(assistantConversations)
      .where(eq(assistantConversations.userId, user.id))
      .orderBy(desc(assistantConversations.createdAt))
      .limit(1);

    if (conversation.length === 0) {
      return res.json({ messages: [] });
    }

    const messages = await db
      .select()
      .from(assistantMessages)
      .where(eq(assistantMessages.conversationId, conversation[0].id))
      .orderBy(asc(assistantMessages.createdAt))
      .limit(100);

    return res.json({ messages });
  } catch (error: any) {
    logger.error('[assistant] Error fetching history:', error.message);
    return res.json({ messages: [] });
  }
});

router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const trimmed = message.trim().slice(0, 2000);
    const user = (req as any).user;

    let history: { role: 'user' | 'assistant'; content: string }[] = [];
    let conversationId: string | null = null;

    if (user) {
      conversationId = await getOrCreateConversation(user.id);

      const priorMessages = await db
        .select()
        .from(assistantMessages)
        .where(eq(assistantMessages.conversationId, conversationId))
        .orderBy(asc(assistantMessages.createdAt))
        .limit(20);

      history = priorMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      await db.insert(assistantMessages).values({
        conversationId,
        role: 'user',
        content: trimmed,
      });
    }

    const aiResponse = generateMaxResponse(trimmed, history);

    if (user && conversationId) {
      await db.insert(assistantMessages).values({
        conversationId,
        role: 'assistant',
        content: aiResponse.content,
      });

      await db
        .update(assistantConversations)
        .set({ updatedAt: new Date() })
        .where(eq(assistantConversations.id, conversationId));
    }

    return res.json({
      content: aiResponse.content,
      category: aiResponse.category,
      confidence: aiResponse.confidence,
    });
  } catch (error: any) {
    logger.error('[assistant] Error processing chat:', error.message);
    return res.status(500).json({ error: 'Failed to process your message. Please try again.' });
  }
});

router.delete('/history', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const conversations = await db
      .select()
      .from(assistantConversations)
      .where(eq(assistantConversations.userId, user.id));

    for (const conv of conversations) {
      await db
        .delete(assistantMessages)
        .where(eq(assistantMessages.conversationId, conv.id));
    }

    await db
      .delete(assistantConversations)
      .where(eq(assistantConversations.userId, user.id));

    return res.json({ success: true });
  } catch (error: any) {
    logger.error('[assistant] Error clearing history:', error.message);
    return res.status(500).json({ error: 'Failed to clear history' });
  }
});

export default router;
