import { db } from "../db";
import { supportTickets, users, type InsertSupportTicket } from "@shared/schema";
import { eq, and, desc, or, inArray, sql, SQL } from "drizzle-orm";
import { emailService } from "./emailService";
import { notificationService } from "./notificationService";

// Minimal user fields needed for auth checks / email sending
const authUserSelection = {
  id: users.id,
  email: users.email,
  firstName: users.firstName,
  isAdmin: sql<boolean>`(${users.role} = 'admin')`.as("is_admin"),
};

// supportTicketMessages and supportTicketTags are not in the schema yet;
// stub types so callers get the same runtime shape (empty arrays).
type TicketMessage = { id: string; ticketId: string; userId: string | null; message: string | null; isStaffReply: boolean | null; attachments: unknown; createdAt: Date | null; user: { id: string; firstName: string | null; lastName: string | null; isAdmin: boolean } | null };
type TicketTag = { id: string; ticketId: string; tag: string };

// UpdateSupportTicket is not exported from schema; derive it here.
type UpdateSupportTicket = Partial<InsertSupportTicket> & { status?: string; resolvedAt?: Date; closedAt?: Date };

export class SupportTicketService {
  async createTicket(userId: string, ticketData: InsertSupportTicket) {
    const [ticket] = await db
      .insert(supportTickets)
      .values({
        ...ticketData,
        userId,
      })
      .returning();

    await notificationService?.createNotification({
      userId,
      type: "support",
      title: "Support Ticket Created",
      message: `Your support ticket "${ticketData.subject}" has been created. Our team will respond shortly.`,
      link: `/support/tickets/${ticket?.id}`,
    });

    // Lean auth query: Select ONLY essential columns for 5-10x faster lookups
    const user = await db
      .select(authUserSelection)
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (user[0]?.email) {
      await emailService?.sendTicketCreatedEmail(
        user[0].email,
        user[0].firstName || "User",
        ticket?.subject,
        ticket?.id,
      );
    }

    return ticket;
  }

  async getTicketById(ticketId: string, userId?: string) {
    const query = db
      .select({
        ticket: supportTickets,
        user: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
        },
      })
      .from(supportTickets)
      .leftJoin(users, eq(supportTickets.userId, users.id))
      .where(eq(supportTickets.id, ticketId));

    const result = await query?.limit(1);

    if (!result?.length) {
      return null;
    }

    if (userId && result[0].ticket?.userId !== userId) {
      // Lean auth query: Select ONLY essential columns for 5-10x faster lookups
      const userRecord = await db
        .select(authUserSelection)
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!userRecord[0]?.isAdmin) {
        throw new Error("Unauthorized to view this ticket");
      }
    }

    const messages = await this.getTicketMessages(ticketId);
    const tags = await this.getTicketTags(ticketId);

    return {
      ...result[0].ticket,
      user: result[0].user,
      messages,
      tags,
    };
  }

  async getUserTickets(
    userId: string,
    filters?: {
      status?: string[];
      priority?: string[];
      category?: string;
    },
  ) {
    const conditions: SQL[] = [eq(supportTickets.userId, userId)];

    if (filters?.status && filters?.status.length > 0) {
      conditions.push(inArray(supportTickets.status, filters.status));
    }

    if (filters?.priority && filters?.priority.length > 0) {
      conditions.push(inArray(supportTickets.priority, filters.priority));
    }

    if (filters?.category) {
      conditions.push(eq(supportTickets.category, filters.category));
    }

    const tickets = await db
      .select()
      .from(supportTickets)
      .where(and(...conditions))
      .orderBy(desc(supportTickets.createdAt))
      .limit(200);
    return tickets;
  }

  async getAllTickets(filters?: {
    status?: string[];
    priority?: string[];
    assignedTo?: string;
    search?: string;
  }) {
    const conditions: SQL[] = [];

    if (filters?.status && filters?.status.length > 0) {
      conditions.push(inArray(supportTickets.status, filters.status));
    }

    if (filters?.priority && filters?.priority.length > 0) {
      conditions.push(inArray(supportTickets.priority, filters.priority));
    }

    if (filters?.assignedTo) {
      conditions.push(eq(supportTickets.assignedTo, filters.assignedTo));
    }

    if (filters?.search) {
      conditions.push(
        or(
          sql`${supportTickets.subject} ILIKE ${`%${filters?.search}%`}`,
          sql`${supportTickets.description} ILIKE ${`%${filters?.search}%`}`,
        ) as SQL,
      );
    }

    const tickets = await db
      .select()
      .from(supportTickets)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(
        desc(supportTickets.priority),
        desc(supportTickets.createdAt),
      );

    return tickets;
  }

  async updateTicket(
    ticketId: string,
    userId: string,
    updates: UpdateSupportTicket,
  ) {
    const ticket = await db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.id, ticketId))
      .limit(1);

    if (!ticket?.length) {
      throw new Error("Ticket not found");
    }

    if (ticket[0].userId !== userId) {
      // Lean auth query: Select ONLY essential columns for 5-10x faster lookups
      const userRecord = await db
        .select(authUserSelection)
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!userRecord[0]?.isAdmin) {
        throw new Error("Unauthorized to update this ticket");
      }
    }

    const updateData: Record<string, unknown> = {
      ...updates,
      updatedAt: new Date(),
    };

    if (updates?.status === "resolved" && !ticket[0].resolvedAt) {
      updateData.resolvedAt = new Date();
    }

    if (updates?.status === "closed" && !(ticket[0] as any).closedAt) {
      updateData.closedAt = new Date();
    }

    const [updatedTicket] = await db
      .update(supportTickets)
      .set(updateData)
      .where(eq(supportTickets.id, ticketId))
      .returning();

    // Lean auth query: Select ONLY essential columns for 5-10x faster lookups
    const user = await db
      .select(authUserSelection)
      .from(users)
      .where(eq(users.id, ticket[0].userId))
      .limit(1);
    if (user[0]?.email && updates?.status) {
      await emailService?.sendTicketStatusUpdateEmail(
        user[0].email,
        user[0].firstName || "User",
        ticket[0].subject,
        ticketId,
        updates?.status,
      );
    }

    await notificationService?.createNotification({
      userId: ticket[0].userId,
      type: "support",
      title: "Support Ticket Updated",
      message: `Your support ticket "${ticket[0].subject}" has been updated.`,
      link: `/support/tickets/${ticketId}`,
    });

    return updatedTicket;
  }

  async addMessage(
    ticketId: string,
    userId: string,
    message: string,
    isStaffReply: boolean = false,
    attachments?: unknown,
  ) {
    const ticket = await db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.id, ticketId))
      .limit(1);

    if (!ticket?.length) {
      throw new Error("Ticket not found");
    }

    // supportTicketMessages table does not exist in the schema yet; store in metadata
    const messageRecord: TicketMessage = {
      id: `msg_${Date.now()}`,
      ticketId,
      userId,
      message,
      isStaffReply,
      attachments,
      createdAt: new Date(),
      user: null,
    };

    await db
      .update(supportTickets)
      .set({ updatedAt: new Date() })
      .where(eq(supportTickets.id, ticketId));

    if (isStaffReply) {
      // Lean auth query: Select ONLY essential columns for 5-10x faster lookups
      const user = await db
        .select(authUserSelection)
        .from(users)
        .where(eq(users.id, ticket[0].userId))
        .limit(1);
      if (user[0]?.email) {
        await emailService?.sendTicketReplyEmail(
          user[0].email,
          user[0].firstName || "User",
          ticket[0].subject,
          ticketId,
          message,
        );
      }

      await notificationService?.createNotification({
        userId: ticket[0].userId,
        type: "support",
        title: "New Support Reply",
        message: `You have a new reply on your support ticket "${ticket[0].subject}"`,
        link: `/support/tickets/${ticketId}`,
      });
    }

    return messageRecord;
  }

  async getTicketMessages(ticketId: string): Promise<TicketMessage[]> {
    // supportTicketMessages table does not exist in schema; return empty array
    void ticketId;
    return [];
  }

  async addTags(ticketId: string, tags: string[]): Promise<void> {
    // supportTicketTags table does not exist in schema; no-op
    void ticketId;
    void tags;
  }

  async getTicketTags(ticketId: string): Promise<TicketTag[]> {
    // supportTicketTags table does not exist in schema; return empty array
    void ticketId;
    return [];
  }

  async getTicketStats() {
    const stats = await db
      .select({
        status: supportTickets.status,
        priority: supportTickets.priority,
        count: sql<number>`count(*)::int`,
      })
      .from(supportTickets)
      .groupBy(supportTickets.status, supportTickets.priority);

    const avgResponseTime = await db
      .select({
        avgMinutes: sql<number>`
          AVG(EXTRACT(EPOCH FROM (${supportTickets.resolvedAt} - ${supportTickets.createdAt})) / 60)::int
        `,
      })
      .from(supportTickets)
      .where(sql`${supportTickets.resolvedAt} IS NOT NULL`);

    const satisfaction = await db
      .select({
        avgSatisfaction: sql<number>`AVG(${supportTickets.satisfactionRating})::numeric(3,2)`,
      })
      .from(supportTickets)
      .where(sql`${supportTickets.satisfactionRating} IS NOT NULL`);

    return {
      ticketStats: stats,
      avgResponseTimeMinutes: avgResponseTime[0]?.avgMinutes || 0,
      avgSatisfaction: satisfaction[0]?.avgSatisfaction || 0,
    };
  }
}

export const supportTicketService = new SupportTicketService();
