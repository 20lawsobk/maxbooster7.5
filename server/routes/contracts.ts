import { Router, Request, Response } from 'express';
import { contractTemplateService, ContractVariables } from '../services/contractTemplateService';
import { invoiceService } from '../services/invoiceService';
import { taxFormService, TaxpayerInfo } from '../services/taxFormService';
import { logger } from '../logger.js';
import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { db } from '../db';
import { marketplaceDisputes, users } from '@shared/schema';
import { eq, and, or, desc, notInArray } from 'drizzle-orm';

interface SplitParticipant {
  userId: string;
  name: string;
  email: string;
  role: string;
  splitPercentage: number;
}

interface SplitSheet {
  id: string;
  releaseId: string;
  creatorId: string;
  contractName: string;
  participants: SplitParticipant[];
  status: 'draft' | 'pending_signature' | 'active' | 'voided';
  effectiveDate: Date;
  createdAt: Date;
  signatures: Array<{ userId: string; signedAt?: Date; signatureHash?: string }>;
}

const splitSheets: Map<string, SplitSheet> = new Map();

const router = Router();

router.get('/templates', async (req: Request, res: Response) => {
  try {
    const templates = contractTemplateService.getTemplates();
    const { category } = req.query;

    if (category) {
      const filtered = templates.filter(t => t.category === category);
      return res.json({ templates: filtered });
    }

    const categories = [...new Set(templates.map(t => t.category))];
    return res.json({ templates, categories });
  } catch (error: any) {
    logger.error('Error fetching contract templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

router.get('/templates/:templateId', async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const template = contractTemplateService.getTemplateById(templateId);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    return res.json(template);
  } catch (error: any) {
    logger.error('Error fetching template:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

router.post('/generate', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { templateId, variables } = req.body;

    if (!templateId) {
      return res.status(400).json({ error: 'templateId is required' });
    }

    const contract = contractTemplateService.generateContract(
      templateId,
      variables as ContractVariables,
      req.user!.id
    );

    return res.status(201).json(contract);
  } catch (error: any) {
    logger.error('Error generating contract:', error);
    res.status(500).json({ error: error.message || 'Failed to generate contract' });
  }
});

router.get('/my-contracts', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const contracts = contractTemplateService.getContractsByUser(req.user!.id);
    return res.json({ contracts });
  } catch (error: any) {
    logger.error('Error fetching user contracts:', error);
    res.status(500).json({ error: 'Failed to fetch contracts' });
  }
});

router.get('/:contractId', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { contractId } = req.params;
    const contract = contractTemplateService.getContract(contractId);

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    return res.json(contract);
  } catch (error: any) {
    logger.error('Error fetching contract:', error);
    res.status(500).json({ error: 'Failed to fetch contract' });
  }
});

router.post('/:contractId/sign', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { contractId } = req.params;
    const { partyName, signature } = req.body;

    if (!partyName) {
      return res.status(400).json({ error: 'partyName is required' });
    }

    const signatureHash = crypto
      .createHash('sha256')
      .update(`${signature || 'electronic-signature'}-${Date.now()}-${req.user!.id}`)
      .digest('hex');

    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

    const contract = await contractTemplateService.signContract(contractId, partyName, {
      signatureHash,
      ipAddress,
    });

    return res.json(contract);
  } catch (error: any) {
    logger.error('Error signing contract:', error);
    res.status(500).json({ error: error.message || 'Failed to sign contract' });
  }
});

router.get('/:contractId/pdf', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { contractId } = req.params;
    const pdfBuffer = contractTemplateService.generatePDF(contractId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="contract-${contractId}.pdf"`);
    return res.send(pdfBuffer);
  } catch (error: any) {
    logger.error('Error generating contract PDF:', error);
    res.status(500).json({ error: error.message || 'Failed to generate PDF' });
  }
});

router.get('/invoices/list', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const invoices = invoiceService.getInvoicesByUser(req.user!.id);
    const summary = invoiceService.getInvoiceSummary(req.user!.id);

    return res.json({ invoices, summary });
  } catch (error: any) {
    logger.error('Error fetching invoices:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

router.post('/invoices/create', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { from, to, lineItems, currency, dueDate, notes, terms, discount, discountType, applyTax } = req.body;

    if (!from || !to || !lineItems || lineItems.length === 0) {
      return res.status(400).json({ error: 'from, to, and lineItems are required' });
    }

    const invoice = invoiceService.createInvoice({
      userId: req.user!.id,
      type: 'sale',
      from,
      to,
      lineItems,
      currency,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      notes,
      terms,
      discount,
      discountType,
      applyTax,
    });

    return res.status(201).json(invoice);
  } catch (error: any) {
    logger.error('Error creating invoice:', error);
    res.status(500).json({ error: error.message || 'Failed to create invoice' });
  }
});

router.get('/invoices/:invoiceId', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { invoiceId } = req.params;
    const invoice = invoiceService.getInvoice(invoiceId);

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    return res.json(invoice);
  } catch (error: any) {
    logger.error('Error fetching invoice:', error);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

router.patch('/invoices/:invoiceId/status', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { invoiceId } = req.params;
    const { status, paymentMethod } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    const invoice = invoiceService.updateInvoiceStatus(invoiceId, status, {
      paidDate: status === 'paid' ? new Date() : undefined,
      paymentMethod,
    });

    return res.json(invoice);
  } catch (error: any) {
    logger.error('Error updating invoice status:', error);
    res.status(500).json({ error: error.message || 'Failed to update invoice status' });
  }
});

router.get('/invoices/:invoiceId/pdf', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { invoiceId } = req.params;
    const pdfBuffer = invoiceService.generatePDF(invoiceId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoiceId}.pdf"`);
    return res.send(pdfBuffer);
  } catch (error: any) {
    logger.error('Error generating invoice PDF:', error);
    res.status(500).json({ error: error.message || 'Failed to generate PDF' });
  }
});

router.get('/invoices/overdue/list', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const overdueInvoices = invoiceService.getOverdueInvoices(req.user!.id);
    return res.json({ invoices: overdueInvoices });
  } catch (error: any) {
    logger.error('Error fetching overdue invoices:', error);
    res.status(500).json({ error: 'Failed to fetch overdue invoices' });
  }
});

router.get('/tax-rates', async (req: Request, res: Response) => {
  try {
    const { country, state } = req.query;

    if (!country) {
      return res.status(400).json({ error: 'country is required' });
    }

    const rates = invoiceService.getTaxRates(country as string, state as string);
    return res.json({ rates });
  } catch (error: any) {
    logger.error('Error fetching tax rates:', error);
    res.status(500).json({ error: 'Failed to fetch tax rates' });
  }
});

router.get('/tax-forms/available', async (req: Request, res: Response) => {
  try {
    const availableForms = taxFormService.getAvailableForms();
    return res.json({ forms: availableForms });
  } catch (error: any) {
    logger.error('Error fetching available tax forms:', error);
    res.status(500).json({ error: 'Failed to fetch available forms' });
  }
});

router.get('/tax-forms/list', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { taxYear } = req.query;
    let forms;

    if (taxYear) {
      forms = taxFormService.getTaxFormsByYear(req.user!.id, parseInt(taxYear as string));
    } else {
      forms = taxFormService.getTaxFormsByUser(req.user!.id);
    }

    return res.json({ forms });
  } catch (error: any) {
    logger.error('Error fetching tax forms:', error);
    res.status(500).json({ error: 'Failed to fetch tax forms' });
  }
});

router.post('/tax-forms/generate', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { formType, taxpayerInfo, recipientInfo, taxYear, amounts } = req.body;

    if (!formType || !taxpayerInfo) {
      return res.status(400).json({ error: 'formType and taxpayerInfo are required' });
    }

    let form;

    switch (formType) {
      case 'W-9':
        form = taxFormService.generateW9(req.user!.id, taxpayerInfo as TaxpayerInfo);
        break;
      case 'W-8BEN':
        form = taxFormService.generateW8BEN(req.user!.id, taxpayerInfo as TaxpayerInfo);
        break;
      case '1099-NEC':
        if (!recipientInfo || !amounts) {
          return res.status(400).json({ error: 'recipientInfo and amounts are required for 1099-NEC' });
        }
        form = taxFormService.generate1099NEC(
          req.user!.id,
          taxpayerInfo,
          recipientInfo,
          taxYear || new Date().getFullYear(),
          amounts
        );
        break;
      case '1099-MISC':
        if (!recipientInfo || !amounts) {
          return res.status(400).json({ error: 'recipientInfo and amounts are required for 1099-MISC' });
        }
        form = taxFormService.generate1099MISC(
          req.user!.id,
          taxpayerInfo,
          recipientInfo,
          taxYear || new Date().getFullYear(),
          amounts
        );
        break;
      case '1099-K':
        if (!recipientInfo || !amounts) {
          return res.status(400).json({ error: 'recipientInfo and amounts are required for 1099-K' });
        }
        form = taxFormService.generate1099K(
          req.user!.id,
          taxpayerInfo,
          recipientInfo,
          taxYear || new Date().getFullYear(),
          amounts
        );
        break;
      default:
        return res.status(400).json({ error: `Unsupported form type: ${formType}` });
    }

    return res.status(201).json(form);
  } catch (error: any) {
    logger.error('Error generating tax form:', error);
    res.status(500).json({ error: error.message || 'Failed to generate tax form' });
  }
});

router.get('/tax-forms/:formId', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { formId } = req.params;
    const form = taxFormService.getTaxForm(formId);

    if (!form) {
      return res.status(404).json({ error: 'Tax form not found' });
    }

    return res.json(form);
  } catch (error: any) {
    logger.error('Error fetching tax form:', error);
    res.status(500).json({ error: 'Failed to fetch tax form' });
  }
});

router.post('/tax-forms/:formId/sign', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { formId } = req.params;
    const { signature } = req.body;

    const signatureHash = crypto
      .createHash('sha256')
      .update(`${signature || 'electronic-signature'}-${Date.now()}-${req.user!.id}`)
      .digest('hex');

    const form = taxFormService.signTaxForm(formId, signatureHash);
    return res.json(form);
  } catch (error: any) {
    logger.error('Error signing tax form:', error);
    res.status(500).json({ error: error.message || 'Failed to sign tax form' });
  }
});

router.get('/tax-forms/:formId/pdf', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { formId } = req.params;
    const form = taxFormService.getTaxForm(formId);

    if (!form) {
      return res.status(404).json({ error: 'Tax form not found' });
    }

    let pdfBuffer: Buffer;

    switch (form.formType) {
      case 'W-9':
        pdfBuffer = taxFormService.generateW9PDF(formId);
        break;
      case 'W-8BEN':
        pdfBuffer = taxFormService.generateW8BENPDF(formId);
        break;
      case '1099-NEC':
      case '1099-MISC':
      case '1099-K':
        pdfBuffer = taxFormService.generate1099PDF(formId);
        break;
      default:
        return res.status(400).json({ error: 'PDF generation not supported for this form type' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${form.formType}-${formId}.pdf"`);
    return res.send(pdfBuffer);
  } catch (error: any) {
    logger.error('Error generating tax form PDF:', error);
    res.status(500).json({ error: error.message || 'Failed to generate PDF' });
  }
});

router.post('/tax-forms/calculate-withholding', async (req: Request, res: Response) => {
  try {
    const { grossAmount, isUSPerson, country, hasTreatyBenefits, hasValidW9, hasBackupWithholding } = req.body;

    if (grossAmount === undefined) {
      return res.status(400).json({ error: 'grossAmount is required' });
    }

    const calculation = taxFormService.calculateWithholding(
      grossAmount,
      isUSPerson ?? true,
      country,
      hasTreatyBenefits,
      hasValidW9,
      hasBackupWithholding
    );

    return res.json(calculation);
  } catch (error: any) {
    logger.error('Error calculating withholding:', error);
    res.status(500).json({ error: 'Failed to calculate withholding' });
  }
});

router.get('/tax-forms/summary/:taxYear', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { taxYear } = req.params;
    const { earnings } = req.query;

    let earningsData: Array<{
      source: string;
      description: string;
      grossAmount: number;
      fees: number;
      withholding: number;
    }> = [];

    if (earnings) {
      try {
        earningsData = JSON.parse(earnings as string);
      } catch {
        return res.status(400).json({ error: 'Invalid earnings data format' });
      }
    }

    const summary = taxFormService.generateTaxSummary(req.user!.id, parseInt(taxYear), earningsData);
    return res.json(summary);
  } catch (error: any) {
    logger.error('Error generating tax summary:', error);
    res.status(500).json({ error: 'Failed to generate tax summary' });
  }
});

router.get('/tax-forms/summary/:taxYear/pdf', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { taxYear } = req.params;
    
    const summary = taxFormService.generateTaxSummary(req.user!.id, parseInt(taxYear), []);
    const pdfBuffer = taxFormService.generateTaxSummaryPDF(summary);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="tax-summary-${taxYear}.pdf"`);
    return res.send(pdfBuffer);
  } catch (error: any) {
    logger.error('Error generating tax summary PDF:', error);
    res.status(500).json({ error: error.message || 'Failed to generate PDF' });
  }
});

router.get('/split-sheets/list', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userSheets: SplitSheet[] = [];
    splitSheets.forEach((sheet) => {
      if (sheet.creatorId === req.user!.id || sheet.participants.some(p => p.userId === req.user!.id)) {
        userSheets.push(sheet);
      }
    });
    return res.json({ splitSheets: userSheets });
  } catch (error: any) {
    logger.error('Error fetching split sheets:', error);
    res.status(500).json({ error: 'Failed to fetch split sheets' });
  }
});

router.post('/split-sheets/create', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { releaseId, contractName, participants, effectiveDate } = req.body;

    if (!releaseId || !contractName || !participants || participants.length === 0) {
      return res.status(400).json({ error: 'releaseId, contractName, and participants are required' });
    }

    const totalSplit = participants.reduce((sum: number, p: SplitParticipant) => sum + p.splitPercentage, 0);
    if (Math.abs(totalSplit - 100) > 0.01) {
      return res.status(400).json({ error: 'Split percentages must total 100%' });
    }

    const newSheet: SplitSheet = {
      id: nanoid(),
      releaseId,
      creatorId: req.user!.id,
      contractName,
      participants,
      status: 'pending_signature',
      effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
      createdAt: new Date(),
      signatures: participants.map((p: SplitParticipant) => ({ userId: p.userId })),
    };

    splitSheets.set(newSheet.id, newSheet);
    return res.status(201).json(newSheet);
  } catch (error: any) {
    logger.error('Error creating split sheet:', error);
    res.status(500).json({ error: error.message || 'Failed to create split sheet' });
  }
});

router.get('/split-sheets/:contractId', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { contractId } = req.params;
    const contract = splitSheets.get(contractId);

    if (!contract) {
      return res.status(404).json({ error: 'Split sheet not found' });
    }

    return res.json(contract);
  } catch (error: any) {
    logger.error('Error fetching split sheet:', error);
    res.status(500).json({ error: 'Failed to fetch split sheet' });
  }
});

router.post('/split-sheets/:contractId/sign', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { contractId } = req.params;
    const { signature } = req.body;

    const contract = splitSheets.get(contractId);
    if (!contract) {
      return res.status(404).json({ error: 'Split sheet not found' });
    }

    const signatureHash = crypto
      .createHash('sha256')
      .update(`${signature || 'electronic-signature'}-${Date.now()}-${req.user!.id}`)
      .digest('hex');

    const sigIndex = contract.signatures.findIndex(s => s.userId === req.user!.id);
    if (sigIndex === -1) {
      return res.status(403).json({ error: 'You are not a participant in this split sheet' });
    }

    contract.signatures[sigIndex] = {
      userId: req.user!.id,
      signedAt: new Date(),
      signatureHash,
    };

    const allSigned = contract.signatures.every(s => s.signedAt);
    if (allSigned) {
      contract.status = 'active';
    }

    splitSheets.set(contractId, contract);
    return res.json(contract);
  } catch (error: any) {
    logger.error('Error signing split sheet:', error);
    res.status(500).json({ error: error.message || 'Failed to sign split sheet' });
  }
});

router.post('/split-sheets/:contractId/add-participant', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { contractId } = req.params;
    const { userId, name, email, role, splitPercentage } = req.body;

    if (!userId || !name || !email || !role || splitPercentage === undefined) {
      return res.status(400).json({ error: 'userId, name, email, role, and splitPercentage are required' });
    }

    const contract = splitSheets.get(contractId);
    if (!contract) {
      return res.status(404).json({ error: 'Split sheet not found' });
    }

    if (contract.creatorId !== req.user!.id) {
      return res.status(403).json({ error: 'Only the creator can add participants' });
    }

    contract.participants.push({ userId, name, email, role, splitPercentage });
    contract.signatures.push({ userId });
    contract.status = 'pending_signature';

    splitSheets.set(contractId, contract);
    return res.json(contract);
  } catch (error: any) {
    logger.error('Error adding participant:', error);
    res.status(500).json({ error: error.message || 'Failed to add participant' });
  }
});

router.post('/split-sheets/validate', async (req: Request, res: Response) => {
  try {
    const { participants } = req.body;

    if (!participants || !Array.isArray(participants)) {
      return res.status(400).json({ error: 'participants array is required' });
    }

    const totalSplit = participants.reduce((sum: number, p: any) => sum + (p.splitPercentage || 0), 0);
    const isValid = Math.abs(totalSplit - 100) <= 0.01;

    return res.json({
      valid: isValid,
      totalPercentage: totalSplit,
      message: isValid ? 'Splits are valid' : 'Splits must total exactly 100%',
    });
  } catch (error: any) {
    logger.error('Error validating splits:', error);
    res.status(500).json({ error: 'Failed to validate splits' });
  }
});

// =========================================
// MARKETPLACE DISPUTE HANDLING
// =========================================

const VALID_DISPUTE_TYPES = ['license_issue', 'quality_issue', 'non_delivery', 'unauthorized_use', 'refund_request', 'other'];
const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  'open': ['under_review', 'closed'],
  'under_review': ['pending_seller_response', 'pending_buyer_response', 'resolved', 'escalated', 'closed'],
  'pending_seller_response': ['under_review', 'resolved', 'escalated', 'closed'],
  'pending_buyer_response': ['under_review', 'resolved', 'escalated', 'closed'],
  'escalated': ['resolved', 'closed'],
  'resolved': ['closed'],
  'closed': [],
};

const isAdminUser = (user: any): boolean => {
  return user?.role === 'admin' || user?.role === 'superadmin';
};

const canAccessDispute = (dispute: any, userId: string, userRole: string | null): boolean => {
  return dispute.buyerId === userId || 
         dispute.sellerId === userId || 
         userRole === 'admin' || 
         userRole === 'superadmin';
};

router.post('/marketplace-disputes', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { orderId, sellerId, disputeType, subject, description, evidence } = req.body;

    if (!orderId || !disputeType || !subject || !description) {
      return res.status(400).json({ error: 'orderId, disputeType, subject, and description are required' });
    }

    if (!VALID_DISPUTE_TYPES.includes(disputeType)) {
      return res.status(400).json({ error: `Invalid dispute type. Valid types: ${VALID_DISPUTE_TYPES.join(', ')}` });
    }

    if (subject.length > 200) {
      return res.status(400).json({ error: 'Subject must be 200 characters or less' });
    }

    if (description.length > 5000) {
      return res.status(400).json({ error: 'Description must be 5000 characters or less' });
    }

    const existingDisputes = await db
      .select()
      .from(marketplaceDisputes)
      .where(
        and(
          eq(marketplaceDisputes.orderId, orderId),
          notInArray(marketplaceDisputes.status, ['resolved', 'closed'])
        )
      );

    if (existingDisputes.length > 0) {
      return res.status(400).json({ error: 'An open dispute already exists for this order', disputeId: existingDisputes[0].id });
    }

    const now = new Date();
    const initialEvidence = (evidence || []).map((e: any) => ({
      type: e.type || 'document',
      url: e.url,
      uploadedAt: now.toISOString(),
      uploadedBy: req.user!.id,
    }));

    const initialMessages = [{
      from: 'system',
      message: 'Dispute created. Our team will review within 24-48 hours.',
      sentAt: now.toISOString(),
      type: 'system' as const,
    }];

    const [dispute] = await db
      .insert(marketplaceDisputes)
      .values({
        orderId,
        buyerId: req.user!.id,
        sellerId: sellerId || '',
        disputeType,
        status: 'open',
        subject,
        description,
        evidence: initialEvidence,
        messages: initialMessages,
      })
      .returning();

    logger.info(`Marketplace dispute ${dispute.id} created for order ${orderId} by user ${req.user!.id}`);

    return res.status(201).json({
      dispute,
      message: 'Dispute created successfully. We will review your case shortly.',
    });
  } catch (error: any) {
    logger.error('Error creating marketplace dispute:', error);
    res.status(500).json({ error: error.message || 'Failed to create dispute' });
  }
});

router.get('/marketplace-disputes', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { status } = req.query;
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const isAdmin = isAdminUser(req.user);

    let disputes;
    if (isAdmin) {
      disputes = await db
        .select()
        .from(marketplaceDisputes)
        .orderBy(desc(marketplaceDisputes.createdAt));
    } else {
      disputes = await db
        .select()
        .from(marketplaceDisputes)
        .where(or(
          eq(marketplaceDisputes.buyerId, userId),
          eq(marketplaceDisputes.sellerId, userId)
        ))
        .orderBy(desc(marketplaceDisputes.createdAt));
    }

    if (status && typeof status === 'string') {
      disputes = disputes.filter(d => d.status === status);
    }

    return res.json({ disputes });
  } catch (error: any) {
    logger.error('Error fetching marketplace disputes:', error);
    res.status(500).json({ error: 'Failed to fetch disputes' });
  }
});

router.get('/marketplace-disputes/:disputeId', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { disputeId } = req.params;
    const [dispute] = await db
      .select()
      .from(marketplaceDisputes)
      .where(eq(marketplaceDisputes.id, disputeId));

    if (!dispute) {
      return res.status(404).json({ error: 'Dispute not found' });
    }

    if (!canAccessDispute(dispute, req.user!.id, req.user!.role)) {
      return res.status(403).json({ error: 'Not authorized to view this dispute' });
    }

    return res.json({ dispute });
  } catch (error: any) {
    logger.error('Error fetching dispute:', error);
    res.status(500).json({ error: 'Failed to fetch dispute' });
  }
});

router.post('/marketplace-disputes/:disputeId/message', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { disputeId } = req.params;
    const { message } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (message.length > 2000) {
      return res.status(400).json({ error: 'Message must be 2000 characters or less' });
    }

    const [dispute] = await db
      .select()
      .from(marketplaceDisputes)
      .where(eq(marketplaceDisputes.id, disputeId));

    if (!dispute) {
      return res.status(404).json({ error: 'Dispute not found' });
    }

    if (!canAccessDispute(dispute, req.user!.id, req.user!.role)) {
      return res.status(403).json({ error: 'Not authorized to message on this dispute' });
    }

    if (['resolved', 'closed'].includes(dispute.status || '')) {
      return res.status(400).json({ error: 'Cannot add messages to a resolved or closed dispute' });
    }

    const isAdmin = isAdminUser(req.user);
    const newMessage = {
      from: req.user!.id,
      message: message.trim(),
      sentAt: new Date().toISOString(),
      type: isAdmin ? 'admin' as const : 'user' as const,
    };

    const updatedMessages = [...(dispute.messages || []), newMessage];
    let newStatus = dispute.status;

    if (dispute.status === 'pending_seller_response' && dispute.sellerId === req.user!.id) {
      newStatus = 'under_review';
      updatedMessages.push({
        from: 'system',
        message: 'Seller has responded. Dispute is under review.',
        sentAt: new Date().toISOString(),
        type: 'system' as const,
      });
    } else if (dispute.status === 'pending_buyer_response' && dispute.buyerId === req.user!.id) {
      newStatus = 'under_review';
      updatedMessages.push({
        from: 'system',
        message: 'Buyer has responded. Dispute is under review.',
        sentAt: new Date().toISOString(),
        type: 'system' as const,
      });
    }

    const [updatedDispute] = await db
      .update(marketplaceDisputes)
      .set({
        messages: updatedMessages,
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(marketplaceDisputes.id, disputeId))
      .returning();

    logger.info(`Message added to dispute ${disputeId} by user ${req.user!.id}`);

    return res.json({ dispute: updatedDispute, message: 'Message added successfully' });
  } catch (error: any) {
    logger.error('Error adding message to dispute:', error);
    res.status(500).json({ error: 'Failed to add message' });
  }
});

router.post('/marketplace-disputes/:disputeId/evidence', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { disputeId } = req.params;
    const { type, url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'Evidence URL is required' });
    }

    const [dispute] = await db
      .select()
      .from(marketplaceDisputes)
      .where(eq(marketplaceDisputes.id, disputeId));

    if (!dispute) {
      return res.status(404).json({ error: 'Dispute not found' });
    }

    if (!canAccessDispute(dispute, req.user!.id, req.user!.role)) {
      return res.status(403).json({ error: 'Not authorized to add evidence to this dispute' });
    }

    if (['resolved', 'closed'].includes(dispute.status || '')) {
      return res.status(400).json({ error: 'Cannot add evidence to a resolved or closed dispute' });
    }

    const newEvidence = {
      type: type || 'document',
      url,
      uploadedAt: new Date().toISOString(),
      uploadedBy: req.user!.id,
    };

    const isAdmin = isAdminUser(req.user);
    let uploaderLabel = 'admin';
    if (!isAdmin) {
      uploaderLabel = dispute.buyerId === req.user!.id ? 'buyer' : 'seller';
    }

    const updatedEvidence = [...(dispute.evidence || []), newEvidence];
    const updatedMessages = [...(dispute.messages || []), {
      from: 'system',
      message: `New evidence uploaded by ${uploaderLabel}`,
      sentAt: new Date().toISOString(),
      type: 'system' as const,
    }];

    const [updatedDispute] = await db
      .update(marketplaceDisputes)
      .set({
        evidence: updatedEvidence,
        messages: updatedMessages,
        updatedAt: new Date(),
      })
      .where(eq(marketplaceDisputes.id, disputeId))
      .returning();

    logger.info(`Evidence added to dispute ${disputeId} by user ${req.user!.id}`);

    return res.json({ dispute: updatedDispute, message: 'Evidence added successfully' });
  } catch (error: any) {
    logger.error('Error adding evidence:', error);
    res.status(500).json({ error: 'Failed to add evidence' });
  }
});

router.post('/marketplace-disputes/:disputeId/escalate', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { disputeId } = req.params;
    const { reason } = req.body;

    const [dispute] = await db
      .select()
      .from(marketplaceDisputes)
      .where(eq(marketplaceDisputes.id, disputeId));

    if (!dispute) {
      return res.status(404).json({ error: 'Dispute not found' });
    }

    if (dispute.buyerId !== req.user!.id) {
      return res.status(403).json({ error: 'Only the buyer can escalate a dispute' });
    }

    if (!VALID_STATUS_TRANSITIONS[dispute.status || '']?.includes('escalated')) {
      return res.status(400).json({ error: `Cannot escalate dispute from status: ${dispute.status}` });
    }

    const now = new Date();
    const updatedMessages = [...(dispute.messages || []), {
      from: 'system',
      message: `Dispute escalated${reason ? `: ${reason}` : ''}. A senior support representative will review within 24 hours.`,
      sentAt: now.toISOString(),
      type: 'system' as const,
    }];

    const [updatedDispute] = await db
      .update(marketplaceDisputes)
      .set({
        status: 'escalated',
        escalatedAt: now,
        updatedAt: now,
        messages: updatedMessages,
      })
      .where(eq(marketplaceDisputes.id, disputeId))
      .returning();

    logger.info(`Dispute ${disputeId} escalated by user ${req.user!.id}`);

    return res.json({ dispute: updatedDispute, message: 'Dispute escalated successfully' });
  } catch (error: any) {
    logger.error('Error escalating dispute:', error);
    res.status(500).json({ error: 'Failed to escalate dispute' });
  }
});

router.post('/marketplace-disputes/:disputeId/resolve', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { disputeId } = req.params;
    const { outcome, refundAmount, explanation } = req.body;

    if (!outcome || !explanation) {
      return res.status(400).json({ error: 'Outcome and explanation are required' });
    }

    const validOutcomes = ['refund_full', 'refund_partial', 'no_refund', 'license_reissued', 'mutual_agreement'];
    if (!validOutcomes.includes(outcome)) {
      return res.status(400).json({ error: `Invalid outcome. Valid outcomes: ${validOutcomes.join(', ')}` });
    }

    if (outcome === 'refund_partial' && (refundAmount === undefined || refundAmount <= 0)) {
      return res.status(400).json({ error: 'Partial refund requires a valid refund amount' });
    }

    const [dispute] = await db
      .select()
      .from(marketplaceDisputes)
      .where(eq(marketplaceDisputes.id, disputeId));

    if (!dispute) {
      return res.status(404).json({ error: 'Dispute not found' });
    }

    const isAdmin = isAdminUser(req.user);
    if (outcome !== 'mutual_agreement' && !isAdmin) {
      if (dispute.buyerId !== req.user!.id && dispute.sellerId !== req.user!.id) {
        return res.status(403).json({ error: 'Not authorized to resolve this dispute' });
      }
    }

    if (!VALID_STATUS_TRANSITIONS[dispute.status || '']?.includes('resolved')) {
      return res.status(400).json({ error: `Cannot resolve dispute from status: ${dispute.status}` });
    }

    const now = new Date();
    const resolution = {
      outcome,
      refundAmount: outcome === 'refund_partial' ? refundAmount : undefined,
      explanation,
      resolvedBy: req.user!.id,
      resolvedAt: now.toISOString(),
    };

    const updatedMessages = [...(dispute.messages || []), {
      from: 'system',
      message: `Dispute resolved with outcome: ${outcome.replace(/_/g, ' ')}. ${explanation}`,
      sentAt: now.toISOString(),
      type: 'system' as const,
    }];

    const [updatedDispute] = await db
      .update(marketplaceDisputes)
      .set({
        status: 'resolved',
        resolvedAt: now,
        updatedAt: now,
        resolution,
        messages: updatedMessages,
      })
      .where(eq(marketplaceDisputes.id, disputeId))
      .returning();

    logger.info(`Dispute ${disputeId} resolved with outcome ${outcome} by user ${req.user!.id}`);

    return res.json({ dispute: updatedDispute, message: 'Dispute resolved successfully' });
  } catch (error: any) {
    logger.error('Error resolving dispute:', error);
    res.status(500).json({ error: 'Failed to resolve dispute' });
  }
});

router.post('/marketplace-disputes/:disputeId/withdraw', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { disputeId } = req.params;

    const [dispute] = await db
      .select()
      .from(marketplaceDisputes)
      .where(eq(marketplaceDisputes.id, disputeId));

    if (!dispute) {
      return res.status(404).json({ error: 'Dispute not found' });
    }

    if (dispute.buyerId !== req.user!.id) {
      return res.status(403).json({ error: 'Only the buyer can withdraw a dispute' });
    }

    if (['resolved', 'closed'].includes(dispute.status || '')) {
      return res.status(400).json({ error: 'Cannot withdraw a resolved or closed dispute' });
    }

    const now = new Date();
    const updatedMessages = [...(dispute.messages || []), {
      from: 'system',
      message: 'Dispute withdrawn by buyer.',
      sentAt: now.toISOString(),
      type: 'system' as const,
    }];

    const [updatedDispute] = await db
      .update(marketplaceDisputes)
      .set({
        status: 'closed',
        updatedAt: now,
        messages: updatedMessages,
      })
      .where(eq(marketplaceDisputes.id, disputeId))
      .returning();

    logger.info(`Dispute ${disputeId} withdrawn by user ${req.user!.id}`);

    return res.json({ dispute: updatedDispute, message: 'Dispute withdrawn successfully' });
  } catch (error: any) {
    logger.error('Error withdrawing dispute:', error);
    res.status(500).json({ error: 'Failed to withdraw dispute' });
  }
});

router.get('/marketplace-disputes/stats', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.user!.id;
    const isAdmin = isAdminUser(req.user);

    let userDisputes;
    if (isAdmin) {
      userDisputes = await db
        .select()
        .from(marketplaceDisputes);
    } else {
      userDisputes = await db
        .select()
        .from(marketplaceDisputes)
        .where(or(
          eq(marketplaceDisputes.buyerId, userId),
          eq(marketplaceDisputes.sellerId, userId)
        ));
    }

    const stats = {
      total: userDisputes.length,
      open: userDisputes.filter(d => d.status === 'open').length,
      underReview: userDisputes.filter(d => d.status === 'under_review').length,
      pendingResponse: userDisputes.filter(d => 
        d.status === 'pending_seller_response' || d.status === 'pending_buyer_response'
      ).length,
      resolved: userDisputes.filter(d => d.status === 'resolved').length,
      escalated: userDisputes.filter(d => d.status === 'escalated').length,
      closed: userDisputes.filter(d => d.status === 'closed').length,
      asBuyer: userDisputes.filter(d => d.buyerId === userId).length,
      asSeller: userDisputes.filter(d => d.sellerId === userId).length,
    };

    return res.json({ stats });
  } catch (error: any) {
    logger.error('Error fetching dispute stats:', error);
    res.status(500).json({ error: 'Failed to fetch dispute stats' });
  }
});

export default router;
