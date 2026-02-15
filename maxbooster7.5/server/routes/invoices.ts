import { Router, Request, Response } from 'express';
import { db } from '../db';
import { invoices, orders, users, notifications } from '@shared/schema';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import { logger } from '../logger';
import { invoiceService } from '../services/invoiceService';
import { nanoid } from 'nanoid';

const router = Router();

interface AuthenticatedRequest extends Request {
  user?: { id: string; email: string };
}

const requireAuth = (req: AuthenticatedRequest, res: Response, next: any) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  next();
};

function generateInvoiceNumber(): string {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 99999).toString().padStart(5, '0');
  return `INV-${year}-${random}`;
}

router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string | undefined;

    let query = db
      .select()
      .from(invoices)
      .where(eq(invoices.userId, userId))
      .orderBy(desc(invoices.createdAt))
      .limit(limit)
      .offset(offset);

    const userInvoices = await query;
    res.json({ invoices: userInvoices, pagination: { limit, offset } });
  } catch (error) {
    logger.error('[Invoices] Failed to get invoices:', error);
    res.status(500).json({ message: 'Failed to get invoices' });
  }
});

router.get('/:invoiceId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { invoiceId } = req.params;
    
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId));
    
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    
    if (invoice.userId !== req.user!.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    res.json(invoice);
  } catch (error) {
    logger.error('[Invoices] Failed to get invoice:', error);
    res.status(500).json({ message: 'Failed to get invoice' });
  }
});

router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { lineItems, toAddress, fromAddress, dueDate, notes, terms, invoiceType } = req.body;
    
    if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
      return res.status(400).json({ message: 'Line items are required' });
    }
    
    const subtotalCents = lineItems.reduce((sum: number, item: any) => {
      return sum + (item.quantity * item.unitPrice * 100);
    }, 0);
    
    const taxCents = Math.round(subtotalCents * 0.0); // Calculate based on location
    const totalCents = subtotalCents + taxCents;
    
    const invoiceNumber = generateInvoiceNumber();
    
    const [invoice] = await db
      .insert(invoices)
      .values({
        invoiceNumber,
        userId,
        invoiceType: invoiceType || 'sale',
        status: 'draft',
        fromAddress: fromAddress || null,
        toAddress: toAddress || null,
        lineItems,
        subtotalCents,
        taxCents,
        totalCents,
        dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        notes,
        terms,
      })
      .returning();
    
    logger.info('[Invoices] Invoice created:', { invoiceId: invoice.id, invoiceNumber });
    res.status(201).json(invoice);
  } catch (error) {
    logger.error('[Invoices] Failed to create invoice:', error);
    res.status(500).json({ message: 'Failed to create invoice' });
  }
});

router.put('/:invoiceId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { invoiceId } = req.params;
    const userId = req.user!.id;
    
    const [existing] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.userId, userId)));
    
    if (!existing) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    
    if (existing.status === 'paid') {
      return res.status(400).json({ message: 'Cannot modify paid invoice' });
    }
    
    const { lineItems, toAddress, fromAddress, dueDate, notes, terms, status } = req.body;
    
    let subtotalCents = existing.subtotalCents;
    let totalCents = existing.totalCents;
    
    if (lineItems && Array.isArray(lineItems)) {
      subtotalCents = lineItems.reduce((sum: number, item: any) => {
        return sum + (item.quantity * item.unitPrice * 100);
      }, 0);
      totalCents = subtotalCents + (existing.taxCents || 0);
    }
    
    const [updated] = await db
      .update(invoices)
      .set({
        lineItems: lineItems || existing.lineItems,
        fromAddress: fromAddress || existing.fromAddress,
        toAddress: toAddress || existing.toAddress,
        dueDate: dueDate ? new Date(dueDate) : existing.dueDate,
        notes: notes || existing.notes,
        terms: terms || existing.terms,
        status: status || existing.status,
        subtotalCents,
        totalCents,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId))
      .returning();
    
    res.json(updated);
  } catch (error) {
    logger.error('[Invoices] Failed to update invoice:', error);
    res.status(500).json({ message: 'Failed to update invoice' });
  }
});

router.post('/:invoiceId/send', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { invoiceId } = req.params;
    const userId = req.user!.id;
    
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.userId, userId)));
    
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    
    await db
      .update(invoices)
      .set({ status: 'sent', updatedAt: new Date() })
      .where(eq(invoices.id, invoiceId));
    
    logger.info('[Invoices] Invoice sent:', { invoiceId, invoiceNumber: invoice.invoiceNumber });
    res.json({ success: true, message: 'Invoice sent successfully' });
  } catch (error) {
    logger.error('[Invoices] Failed to send invoice:', error);
    res.status(500).json({ message: 'Failed to send invoice' });
  }
});

router.post('/:invoiceId/mark-paid', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { invoiceId } = req.params;
    const userId = req.user!.id;
    const { paymentMethod } = req.body;
    
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.userId, userId)));
    
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    
    await db
      .update(invoices)
      .set({
        status: 'paid',
        paidAt: new Date(),
        paymentMethod: paymentMethod || 'manual',
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId));
    
    logger.info('[Invoices] Invoice marked paid:', { invoiceId, invoiceNumber: invoice.invoiceNumber });
    res.json({ success: true, message: 'Invoice marked as paid' });
  } catch (error) {
    logger.error('[Invoices] Failed to mark invoice paid:', error);
    res.status(500).json({ message: 'Failed to mark invoice as paid' });
  }
});

router.get('/:invoiceId/pdf', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { invoiceId } = req.params;
    const userId = req.user!.id;
    
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.userId, userId)));
    
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    
    const pdfData = await invoiceService.generatePDF({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      userId: invoice.userId,
      type: (invoice.invoiceType as 'sale' | 'purchase' | 'royalty' | 'service') || 'sale',
      status: (invoice.status as 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled' | 'refunded') || 'draft',
      from: (invoice.fromAddress as any) || {
        name: 'Max Booster',
        street: '123 Music Lane',
        city: 'Los Angeles',
        state: 'CA',
        postalCode: '90001',
        country: 'US',
      },
      to: (invoice.toAddress as any) || {
        name: 'Customer',
        street: 'N/A',
        city: 'N/A',
        postalCode: 'N/A',
        country: 'US',
      },
      lineItems: ((invoice.lineItems as any[]) || []).map((item: any, idx: number) => ({
        id: `item-${idx}`,
        description: item.description || 'Service',
        quantity: item.quantity || 1,
        unitPrice: item.unitPrice || 0,
        total: (item.quantity || 1) * (item.unitPrice || 0),
      })),
      subtotal: (invoice.subtotalCents || 0) / 100,
      taxes: [],
      totalTax: (invoice.taxCents || 0) / 100,
      total: (invoice.totalCents || 0) / 100,
      currency: invoice.currency || 'USD',
      dueDate: invoice.dueDate || new Date(),
      issuedDate: invoice.createdAt || new Date(),
      notes: invoice.notes || undefined,
      terms: invoice.terms || undefined,
    });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);
    res.send(Buffer.from(pdfData, 'base64'));
  } catch (error) {
    logger.error('[Invoices] Failed to generate PDF:', error);
    res.status(500).json({ message: 'Failed to generate PDF' });
  }
});

router.post('/generate-from-order/:orderId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { orderId } = req.params;
    const userId = req.user!.id;
    
    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.userId, userId)));
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    const invoiceNumber = generateInvoiceNumber();
    
    const [invoice] = await db
      .insert(invoices)
      .values({
        invoiceNumber,
        userId,
        invoiceType: 'sale',
        status: 'paid',
        lineItems: [{
          description: `Order #${orderId}`,
          quantity: 1,
          unitPrice: order.amount,
        }],
        subtotalCents: Math.round(order.amount * 100),
        totalCents: Math.round(order.amount * 100),
        paidAt: order.createdAt,
        paymentMethod: 'stripe',
        metadata: { orderId },
      })
      .returning();
    
    logger.info('[Invoices] Invoice generated from order:', { invoiceId: invoice.id, orderId });
    res.status(201).json(invoice);
  } catch (error) {
    logger.error('[Invoices] Failed to generate invoice from order:', error);
    res.status(500).json({ message: 'Failed to generate invoice' });
  }
});

router.post('/bulk-generate', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { startDate, endDate } = req.body;
    
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();
    
    const userOrders = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.userId, userId),
          eq(orders.status, 'completed'),
          gte(orders.createdAt, start),
          lte(orders.createdAt, end)
        )
      );
    
    const generatedInvoices: string[] = [];
    
    for (const order of userOrders) {
      const existingResult = await db.execute(
        sql`SELECT id FROM invoices WHERE metadata->>'orderId' = ${order.id}`
      );
      
      if (existingResult.rows && existingResult.rows.length > 0) {
        continue;
      }
      
      const invoiceNumber = generateInvoiceNumber();
      
      const [invoice] = await db
        .insert(invoices)
        .values({
          invoiceNumber,
          userId,
          invoiceType: 'sale',
          status: 'paid',
          lineItems: [{
            description: `Order #${order.id}`,
            quantity: 1,
            unitPrice: order.amount,
          }],
          subtotalCents: Math.round(order.amount * 100),
          totalCents: Math.round(order.amount * 100),
          paidAt: order.createdAt,
          paymentMethod: 'stripe',
          metadata: { orderId: order.id },
        })
        .returning();
      
      generatedInvoices.push(invoice.id);
    }
    
    logger.info('[Invoices] Bulk invoices generated:', { count: generatedInvoices.length, userId });
    res.json({
      success: true,
      generated: generatedInvoices.length,
      invoiceIds: generatedInvoices,
    });
  } catch (error) {
    logger.error('[Invoices] Failed to bulk generate invoices:', error);
    res.status(500).json({ message: 'Failed to bulk generate invoices' });
  }
});

router.get('/summary/stats', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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
          WHERE user_id = ${userId}`
    );
    
    const stats = statsResult.rows?.[0] || {};
    
    res.json({
      totalInvoices: Number(stats.total_invoices) || 0,
      paidCount: Number(stats.paid_count) || 0,
      sentCount: Number(stats.sent_count) || 0,
      draftCount: Number(stats.draft_count) || 0,
      overdueCount: Number(stats.overdue_count) || 0,
      totalPaid: Number(stats.total_paid_cents) / 100 || 0,
      totalPending: Number(stats.total_pending_cents) / 100 || 0,
    });
  } catch (error) {
    logger.error('[Invoices] Failed to get invoice stats:', error);
    res.status(500).json({ message: 'Failed to get invoice statistics' });
  }
});

export default router;
