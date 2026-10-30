// @ts-nocheck
import { Router, Request, Response } from "express";
import { db } from "../db";
import { invoices, orders } from "@shared/schema";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { logger } from "../logger";
import { randomBytes } from "crypto";
import { requireAuth } from "../middleware/auth.js";
import { requireUUIDParam } from "../middleware/requestValidation.js";
import { jsPDF } from "jspdf";
import { emailService } from "../services/emailService.js";

const router = Router();

// AuthenticatedRequest: express Request with an optional user shape.
// We use type intersection rather than interface extension to avoid
// the conflicting `user` property on the base Request type.
type AuthenticatedRequest = Request & {
  user?: { id: string; email: string };
};

function generateInvoiceNumber(): string {
  const year = new Date().getFullYear();
  const unique = randomBytes(4).toString("hex").toUpperCase();
  return `INV-${year}-${unique}`;
}

function toInvoiceResponse(invoice: typeof invoices.$inferSelect) {
  const toAddress = (invoice.toAddress || {}) as Record<string, unknown>;
  const lineItems = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];

  return {
    ...invoice,
    clientName: typeof toAddress.name === "string" ? toAddress.name : "Client not provided",
    clientEmail: typeof toAddress.email === "string" ? toAddress.email : "",
    amount: Number(invoice.totalCents || 0) / 100,
    currency: (invoice.currency || "usd").toUpperCase(),
    dueDate: invoice.dueDate?.toISOString() ?? null,
    createdAt: invoice.createdAt?.toISOString() ?? null,
    paidAt: invoice.paidAt?.toISOString() ?? null,
    items: lineItems.map((item: Record<string, unknown>) => ({
      description: String(item.description || ""),
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || 0),
    })),
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] as string);
}

function normalizeLineItems(lineItems: unknown) {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return { error: "Line items are required" };
  }

  const normalizedLineItems = [];
  for (const item of lineItems as Record<string, unknown>[]) {
    const description =
      typeof item.description === "string" ? item.description.trim() : "";
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    if (
      !description ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      !Number.isFinite(unitPrice) ||
      unitPrice < 0
    ) {
      return {
        error:
          "Each line item needs a description, whole-number quantity, and non-negative price",
      };
    }
    normalizedLineItems.push({ description, quantity, unitPrice });
  }

  const subtotalCents = normalizedLineItems.reduce(
    (sum, item) => sum + Math.round(item.quantity * item.unitPrice * 100),
    0,
  );
  if (!Number.isSafeInteger(subtotalCents)) {
    return { error: "Invoice total is too large" };
  }

  return { normalizedLineItems, subtotalCents };
}

function parseDueDate(value: unknown): Date | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return null;
  const dueDate = new Date(value);
  return Number.isNaN(dueDate.getTime()) ? null : dueDate;
}

router.get(
  "/",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
      const offset = Math.min(
        Math.max(parseInt(req.query.offset as string) || 0, 0),
        100_000,
      );

      let query = db
        .select()
        .from(invoices)
        .where(eq(invoices.userId, userId))
        .orderBy(desc(invoices.createdAt))
        .limit(limit)
        .offset(offset);

      const userInvoices = await query;
      res.json({
        invoices: userInvoices.map(toInvoiceResponse),
        pagination: { limit, offset },
      });
    } catch (error) {
      logger.warn({ err: error }, "[Invoices] Failed to get invoices:");
      res.status(500).json({ error: "Failed to get invoices" });
    }
  },
);

router.get(
  "/:invoiceId",
  requireAuth,
  requireUUIDParam("invoiceId"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { invoiceId } = req.params as Record<string, string>;

      const [invoice] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.id, invoiceId))
        .limit(1);

      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      if (invoice?.userId !== req.user!.id) {
        return res.status(403).json({ error: "Forbidden" });
      }

      res.json(toInvoiceResponse(invoice));
    } catch (error) {
      logger.warn({ err: error }, "[Invoices] Failed to get invoice:");
      res.status(500).json({ error: "Failed to get invoice" });
    }
  },
);

router.post(
  "/",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const {
        lineItems,
        toAddress,
        fromAddress,
        dueDate,
        notes,
        terms,
        invoiceType,
        currency,
      } = req.body;

      const normalized = normalizeLineItems(lineItems);
      if ("error" in normalized) return res.status(400).json(normalized);
      const clientEmail =
        toAddress && typeof toAddress.email === "string"
          ? toAddress.email.trim()
          : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
        return res.status(400).json({ error: "A valid client email is required" });
      }
      const clientName =
        toAddress && typeof toAddress.name === "string"
          ? toAddress.name.trim()
          : "";
      if (!clientName) {
        return res.status(400).json({ error: "A client name is required" });
      }
      if (typeof currency !== "undefined" && !/^[A-Za-z]{3}$/.test(currency)) {
        return res.status(400).json({ error: "Currency must be a three-letter ISO code" });
      }
      const parsedDueDate = parseDueDate(dueDate);
      if (parsedDueDate === null) {
        return res.status(400).json({ error: "Due date must be a valid date" });
      }
      const { normalizedLineItems, subtotalCents } = normalized;

      const taxCents = Math.round(subtotalCents * 0.0); // Calculate based on location
      const totalCents = subtotalCents + taxCents;

      const invoiceNumber = generateInvoiceNumber();

      const [invoice] = await db
        .insert(invoices)
        .values({
          invoiceNumber,
          userId,
          invoiceType: invoiceType || "sale",
          status: "draft",
          fromAddress: fromAddress || null,
          toAddress: { ...toAddress, name: clientName, email: clientEmail },
          lineItems: normalizedLineItems,
          subtotalCents,
          taxCents,
          totalCents,
          currency: typeof currency === "string" ? currency.toLowerCase() : "usd",
          dueDate:
            parsedDueDate ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          notes,
          terms,
        })
        .returning();

      logger.info({
        invoiceId: invoice.id,
        invoiceNumber,
      }, "[Invoices] Invoice created:");
      res.status(201).json(toInvoiceResponse(invoice));
    } catch (error) {
      logger.warn({ err: error }, "[Invoices] Failed to create invoice:");
      res.status(500).json({ error: "Failed to create invoice" });
    }
  },
);

router.put(
  "/:invoiceId",
  requireAuth,
  requireUUIDParam("invoiceId"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { invoiceId } = req.params as Record<string, string>;
      const userId = req.user!.id;

      const [existing] = await db
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, invoiceId), eq(invoices.userId, userId)))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      if (existing.status !== "draft") {
        return res.status(400).json({ error: "Only draft invoices can be modified" });
      }

      const { lineItems, fromAddress, dueDate, notes, terms, status } = req.body;
      let { toAddress } = req.body;

      if (status !== undefined) {
        return res.status(400).json({
          error: "Invoice status is managed by sending and payment workflows",
        });
      }
      if (toAddress !== undefined) {
        const clientName =
          toAddress && typeof toAddress.name === "string"
            ? toAddress.name.trim()
            : "";
        const clientEmail =
          toAddress && typeof toAddress.email === "string"
            ? toAddress.email.trim()
            : "";
        if (
          !clientName ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)
        ) {
          return res.status(400).json({
            error: "A client name and valid client email are required",
          });
        }
        toAddress = { ...toAddress, name: clientName, email: clientEmail };
      }
      const normalized = lineItems === undefined ? undefined : normalizeLineItems(lineItems);
      if (normalized && "error" in normalized) return res.status(400).json(normalized);
      const parsedDueDate = parseDueDate(dueDate);
      if (parsedDueDate === null) {
        return res.status(400).json({ error: "Due date must be a valid date" });
      }
      const subtotalCents = normalized?.subtotalCents ?? existing.subtotalCents;
      const totalCents = subtotalCents + (existing.taxCents || 0);

      const [updated] = await db
        .update(invoices)
        .set({
          lineItems: normalized?.normalizedLineItems ?? existing.lineItems,
          fromAddress: fromAddress ?? existing.fromAddress,
          toAddress: toAddress ?? existing.toAddress,
          dueDate: parsedDueDate ?? existing.dueDate,
          notes: notes ?? existing.notes,
          terms: terms ?? existing.terms,
          subtotalCents,
          totalCents,
          updatedAt: new Date(),
        })
        .where(and(eq(invoices.id, invoiceId), eq(invoices.userId, userId)))
        .returning();

      res.json(updated);
    } catch (error) {
      logger.warn({ err: error }, "[Invoices] Failed to update invoice:");
      res.status(500).json({ error: "Failed to update invoice" });
    }
  },
);

router.post(
  "/:invoiceId/send",
  requireAuth,
  requireUUIDParam("invoiceId"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { invoiceId } = req.params as Record<string, string>;
      const userId = req.user!.id;

      const [invoice] = await db
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, invoiceId), eq(invoices.userId, userId)))
        .limit(1);

      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }
      if (invoice.status !== "draft") {
        return res.status(400).json({ error: "Only draft invoices can be sent" });
      }

      const toAddress = (invoice.toAddress || {}) as Record<string, unknown>;
      const clientEmail =
        typeof toAddress.email === "string" ? toAddress.email.trim() : "";
      if (!clientEmail) {
        return res.status(400).json({ error: "Invoice client email is required before sending" });
      }

      const sent = await emailService.send({
        to: clientEmail,
        subject: `Invoice ${invoice.invoiceNumber}`,
        html: `<h1>Invoice ${escapeHtml(invoice.invoiceNumber)}</h1><p>Your invoice total is ${escapeHtml(
          `${(Number(invoice.totalCents || 0) / 100).toFixed(2)} ${(invoice.currency || "USD").toUpperCase()}`,
        )}.</p><p>Due date: ${escapeHtml(
          invoice.dueDate?.toLocaleDateString() || "Not set",
        )}</p>`,
      });
      if (!sent) {
        return res.status(503).json({
          error: "Invoice email could not be delivered; the invoice remains a draft",
        });
      }

      await db
        .update(invoices)
        .set({ status: "sent", updatedAt: new Date() })
        .where(eq(invoices.id, invoiceId));

      logger.info({
        invoiceId,
        invoiceNumber: invoice.invoiceNumber,
      }, "[Invoices] Invoice sent:");
      res.json({ success: true, message: "Invoice emailed successfully" });
    } catch (error) {
      logger.warn({ err: error }, "[Invoices] Failed to send invoice:");
      res.status(500).json({ error: "Failed to send invoice" });
    }
  },
);

router.get(
  "/:invoiceId/pdf",
  requireAuth,
  requireUUIDParam("invoiceId"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { invoiceId } = req.params as Record<string, string>;
      const userId = req.user!.id;

      const [invoice] = await db
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, invoiceId), eq(invoices.userId, userId)))
        .limit(1);

      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      const document = new jsPDF();
      const toAddress = (invoice.toAddress || {}) as Record<string, unknown>;
      const currency = (invoice.currency || "USD").toUpperCase();
      const items = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];
      let y = 20;
      document.setFontSize(20);
      document.text(`Invoice ${invoice.invoiceNumber}`, 20, y);
      y += 14;
      document.setFontSize(11);
      document.text(`Bill to: ${String(toAddress.name || "")}`, 20, y);
      y += 7;
      document.text(`Email: ${String(toAddress.email || "")}`, 20, y);
      y += 7;
      document.text(`Status: ${invoice.status || "draft"}`, 20, y);
      y += 7;
      document.text(`Due: ${invoice.dueDate?.toLocaleDateString() || "Not set"}`, 20, y);
      y += 12;
      for (const item of items as Record<string, unknown>[]) {
        const quantity = Number(item.quantity || 0);
        const unitPrice = Number(item.unitPrice || 0);
        const line = `${String(item.description || "")} - ${quantity} x ${unitPrice.toFixed(2)} ${currency} = ${(quantity * unitPrice).toFixed(2)} ${currency}`;
        const lines = document.splitTextToSize(line, 170);
        if (y + lines.length * 7 > 280) {
          document.addPage();
          y = 20;
        }
        document.text(lines, 20, y);
        y += lines.length * 7;
      }
      y += 8;
      document.setFontSize(13);
      document.text(`Total: ${(Number(invoice.totalCents || 0) / 100).toFixed(2)} ${currency}`, 20, y);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${invoice.invoiceNumber}.pdf"`,
      );
      res.send(Buffer.from(document.output("arraybuffer")));
    } catch (error) {
      logger.warn({ err: error }, "[Invoices] Failed to generate PDF:");
      res.status(500).json({ error: "Failed to generate PDF" });
    }
  },
);

router.delete(
  "/:invoiceId",
  requireAuth,
  requireUUIDParam("invoiceId"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { invoiceId } = req.params as Record<string, string>;
      const [invoice] = await db
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, invoiceId), eq(invoices.userId, req.user!.id)))
        .limit(1);
      if (!invoice) return res.status(404).json({ error: "Invoice not found" });
      if (invoice.status !== "draft" && invoice.status !== "cancelled") {
        return res.status(400).json({ error: "Only draft or cancelled invoices can be deleted" });
      }
      await db.delete(invoices).where(eq(invoices.id, invoice.id));
      res.status(204).end();
    } catch (error) {
      logger.warn({ err: error }, "[Invoices] Failed to delete invoice:");
      res.status(500).json({ error: "Failed to delete invoice" });
    }
  },
);

router.post(
  "/generate-from-order/:orderId",
  requireAuth,
  requireUUIDParam("orderId"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { orderId } = req.params as Record<string, string>;
      const userId = req.user!.id;

      const [order] = await db
        .select()
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
        .limit(1);

      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      const [existingInvoice] = await db
        .select({ id: invoices.id })
        .from(invoices)
        .where(
          and(
            eq(invoices.userId, userId),
            sql`${invoices.metadata}->>'orderId' = ${orderId}`,
          ),
        )
        .limit(1);
      if (existingInvoice) {
        return res.status(409).json({
          error: "An invoice has already been generated for this order",
          invoiceId: existingInvoice.id,
        });
      }

      const invoiceNumber = generateInvoiceNumber();

      const [invoice] = await db
        .insert(invoices)
        .values({
          invoiceNumber,
          userId,
          invoiceType: "sale",
          status: "paid",
          lineItems: [
            {
              description: `Order #${orderId}`,
              quantity: 1,
              unitPrice: order.amount,
            },
          ],
          subtotalCents: Math.round(Number(order?.amount) * 100),
          totalCents: Math.round(Number(order?.amount) * 100),
          paidAt: order.createdAt,
          paymentMethod: "stripe",
          metadata: { orderId },
        })
        .returning();

      logger.info({
        invoiceId: invoice.id,
        orderId,
      }, "[Invoices] Invoice generated from order:");
      res.status(201).json(invoice);
    } catch (error) {
      logger.warn(
        { err: error },
        "[Invoices] Failed to generate invoice from order:",
      );
      res.status(500).json({ error: "Failed to generate invoice" });
    }
  },
);

router.post(
  "/bulk-generate",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { startDate, endDate } = req.body;

      const start = startDate
        ? new Date(startDate)
        : new Date(Date?.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate) : new Date();

      const userOrders = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.userId, userId),
            eq(orders.status, "completed"),
            gte(orders.createdAt, start),
            lte(orders.createdAt, end),
          ),
        )
        .limit(200);

      const generatedInvoices: string[] = [];

      for (const order of userOrders) {
        const existingResult = await db.execute(
          sql`SELECT id FROM invoices WHERE metadata->>'orderId' = ${order?.id}`,
        );

        if (existingResult?.rows && existingResult?.rows.length > 0) {
          continue;
        }

        const invoiceNumber = generateInvoiceNumber();

        const [invoice] = await db
          .insert(invoices)
          .values({
            invoiceNumber,
            userId,
            invoiceType: "sale",
            status: "paid",
            lineItems: [
              {
                description: `Order #${order?.id}`,
                quantity: 1,
                unitPrice: order.amount,
              },
            ],
            subtotalCents: Math.round(Number(order?.amount) * 100),
            totalCents: Math.round(Number(order?.amount) * 100),
            paidAt: order.createdAt,
            paymentMethod: "stripe",
            metadata: { orderId: order.id },
          })
          .returning();

        generatedInvoices?.push(invoice?.id);
      }

      logger.info({
        count: generatedInvoices.length,
        userId,
      }, "[Invoices] Bulk invoices generated:");
      res.json({
        success: true,
        generated: generatedInvoices.length,
        invoiceIds: generatedInvoices,
      });
    } catch (error) {
      logger.warn(
        { err: error },
        "[Invoices] Failed to bulk generate invoices:",
      );
      res.status(500).json({ error: "Failed to bulk generate invoices" });
    }
  },
);

router.get(
  "/summary/stats",
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      const statsResult = await db.execute(
        sql`SELECT 
            COUNT(*) as total_invoices,
            COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_count,
            COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_count,
            COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_count,
            COUNT(CASE WHEN status = 'overdue' THEN 1 END) as overdue_count,
            COALESCE(SUM(CASE WHEN status = 'paid' THEN total_cents ELSE 0 END), 0) as total_paid_cents,
            COALESCE(SUM(CASE WHEN status = 'sent' THEN total_cents ELSE 0 END), 0) as total_pending_cents
          FROM invoices 
          WHERE user_id = ${userId}`,
      );

      const stats = statsResult?.rows?.[0] || {};

      res.json({
        totalInvoices: Number(stats?.total_invoices) || 0,
        paidCount: Number(stats?.paid_count) || 0,
        sentCount: Number(stats?.sent_count) || 0,
        draftCount: Number(stats?.draft_count) || 0,
        overdueCount: Number(stats?.overdue_count) || 0,
        totalPaid: Number(stats?.total_paid_cents) / 100 || 0,
        totalPending: Number(stats?.total_pending_cents) / 100 || 0,
      });
    } catch (error) {
      logger.warn({ err: error }, "[Invoices] Failed to get invoice stats:");
      res.status(500).json({ error: "Failed to get invoice statistics" });
    }
  },
);

export default router;
