import { Router, Request, Response } from 'express';
import { contractTemplateService, ContractVariables } from '../services/contractTemplateService';
import { invoiceService } from '../services/invoiceService';
import { taxFormService, TaxpayerInfo } from '../services/taxFormService';
import { logger } from '../logger.js';
import crypto from 'crypto';
import { nanoid } from 'nanoid';

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

export default router;
