import { db } from '../db';
import { chatSessions, chatMessages } from '../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { logger } from '../logger.js';
import { randomUUID } from 'crypto';

interface CreateSessionInput {
  userId: string;
}

interface CreateMessageInput {
  sessionId: string;
  userId: string;
  message: string;
  isAI: boolean;
  isStaff?: boolean;
}

export class ChatService {
  async getOrCreateSession(userId: string): Promise<string> {
    try {
      const existingSession = await db
        .select()
        .from(chatSessions)
        .where(
          and(
            eq(chatSessions.userId, userId),
            eq(chatSessions.status, 'active')
          )
        )
        .orderBy(desc(chatSessions.createdAt))
        .limit(1);

      if (existingSession.length > 0) {
        return existingSession[0].id;
      }

      const sessionToken = randomUUID();
      const newSession = await db
        .insert(chatSessions)
        .values({
          userId,
          sessionToken,
          status: 'active',
        })
        .returning();

      logger.info(`Created new chat session for user ${userId}`);
      return newSession[0].id;
    } catch (error: unknown) {
      logger.error('Error getting/creating chat session:', error);
      throw new Error('Failed to create chat session');
    }
  }

  async saveMessage(input: CreateMessageInput): Promise<void> {
    try {
      await db.insert(chatMessages).values({
        sessionId: input.sessionId,
        userId: input.userId,
        message: input.message,
        isAI: input.isAI,
        isStaff: input.isStaff || false,
      });
    } catch (error: unknown) {
      logger.error('Error saving chat message:', error);
      throw new Error('Failed to save message');
    }
  }

  async getSessionMessages(sessionId: string, userId: string): Promise<any[]> {
    try {
      const messages = await db
        .select({
          id: chatMessages.id,
          message: chatMessages.message,
          isAI: chatMessages.isAI,
          isStaff: chatMessages.isStaff,
          createdAt: chatMessages.createdAt,
        })
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.sessionId, sessionId),
            eq(chatMessages.userId, userId)
          )
        )
        .orderBy(chatMessages.createdAt);

      return messages;
    } catch (error: unknown) {
      logger.error('Error retrieving chat messages:', error);
      return [];
    }
  }

  async getUserChatHistory(userId: string, limit: number = 50): Promise<any[]> {
    try {
      const activeSessions = await db
        .select()
        .from(chatSessions)
        .where(
          and(
            eq(chatSessions.userId, userId),
            eq(chatSessions.status, 'active')
          )
        )
        .orderBy(desc(chatSessions.createdAt))
        .limit(1);

      if (activeSessions.length === 0) {
        return [];
      }

      return this.getSessionMessages(activeSessions[0].id, userId);
    } catch (error: unknown) {
      logger.error('Error retrieving user chat history:', error);
      return [];
    }
  }

  async endSession(sessionId: string, userId: string): Promise<void> {
    try {
      await db
        .update(chatSessions)
        .set({
          status: 'ended',
          endedAt: new Date(),
        })
        .where(
          and(
            eq(chatSessions.id, sessionId),
            eq(chatSessions.userId, userId)
          )
        );
    } catch (error: unknown) {
      logger.error('Error ending chat session:', error);
    }
  }
}

export const chatService = new ChatService();
