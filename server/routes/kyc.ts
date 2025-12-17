import { Router } from 'express';
import { kycService } from '../services/kycService.js';
import { z } from 'zod';
import { logger } from '../logger.js';

const router = Router();

const startVerificationSchema = z.object({
  type: z.enum(['individual', 'business']),
  level: z.enum(['basic', 'enhanced', 'full']).optional(),
});

const individualInfoSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.string().transform(s => new Date(s)),
  nationality: z.string().min(1),
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  postalCode: z.string().min(1),
  country: z.string().min(1),
  taxIdNumber: z.string().optional(),
});

const businessInfoSchema = z.object({
  businessName: z.string().min(1),
  businessType: z.string().min(1),
  businessRegistrationNumber: z.string().min(1),
  taxIdNumber: z.string().min(1),
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  postalCode: z.string().min(1),
  country: z.string().min(1),
});

const documentUploadSchema = z.object({
  verificationId: z.string().min(1),
  documentType: z.enum([
    'government_id',
    'passport',
    'drivers_license',
    'proof_of_address',
    'bank_statement',
    'business_registration',
    'articles_of_incorporation',
    'tax_id_document',
    'selfie',
    'w9',
    'w8ben',
    'w8bene',
    'other',
  ]),
  fileName: z.string().min(1),
  fileSize: z.number().positive(),
  mimeType: z.string().min(1),
  storagePath: z.string().min(1),
  expirationDate: z.string().transform(s => new Date(s)).optional(),
});

const taxFormSchema = z.object({
  verificationId: z.string().min(1),
  formType: z.enum(['W9', 'W8BEN', 'W8BENE']),
  documentPath: z.string().min(1),
});

router.post('/start', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const validated = startVerificationSchema.parse(req.body);

    const verification = await kycService.startVerification({
      userId: req.user.id,
      type: validated.type,
      level: validated.level,
    });

    res.status(201).json({
      success: true,
      verification,
      message: 'Verification process started. Please provide your information and documents.',
    });
  } catch (error: unknown) {
    logger.error('Error starting KYC verification:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid request data',
        details: error.errors,
      });
    }

    const message = error instanceof Error ? error.message : 'Failed to start verification';
    res.status(500).json({ error: message });
  }
});

router.get('/status', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const status = await kycService.getVerificationStatus(req.user.id);

    if (!status) {
      return res.json({
        status: 'not_started',
        message: 'No verification in progress. Start a new verification to receive payouts.',
      });
    }

    res.json(status);
  } catch (error: unknown) {
    logger.error('Error fetching KYC status:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch verification status';
    res.status(500).json({ error: message });
  }
});

router.put('/individual', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { verificationId, ...info } = req.body;
    
    if (!verificationId) {
      return res.status(400).json({ error: 'Verification ID required' });
    }

    const validated = individualInfoSchema.parse(info);
    const verification = await kycService.updateIndividualInfo(verificationId, validated);

    res.json({
      success: true,
      verification,
      message: 'Individual information updated successfully.',
    });
  } catch (error: unknown) {
    logger.error('Error updating individual info:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid request data',
        details: error.errors,
      });
    }

    const message = error instanceof Error ? error.message : 'Failed to update individual information';
    res.status(500).json({ error: message });
  }
});

router.put('/business', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { verificationId, ...info } = req.body;
    
    if (!verificationId) {
      return res.status(400).json({ error: 'Verification ID required' });
    }

    const validated = businessInfoSchema.parse(info);
    const verification = await kycService.updateBusinessInfo(verificationId, validated);

    res.json({
      success: true,
      verification,
      message: 'Business information updated successfully.',
    });
  } catch (error: unknown) {
    logger.error('Error updating business info:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid request data',
        details: error.errors,
      });
    }

    const message = error instanceof Error ? error.message : 'Failed to update business information';
    res.status(500).json({ error: message });
  }
});

router.post('/documents', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const validated = documentUploadSchema.parse(req.body);

    const document = await kycService.uploadDocument({
      ...validated,
      userId: req.user.id,
    });

    res.status(201).json({
      success: true,
      document,
      message: 'Document uploaded successfully. It will be reviewed shortly.',
    });
  } catch (error: unknown) {
    logger.error('Error uploading document:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid request data',
        details: error.errors,
      });
    }

    const message = error instanceof Error ? error.message : 'Failed to upload document';
    res.status(500).json({ error: message });
  }
});

router.post('/tax-form', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const validated = taxFormSchema.parse(req.body);

    const verification = await kycService.submitTaxForm({
      ...validated,
      userId: req.user.id,
    });

    res.json({
      success: true,
      verification,
      message: `${validated.formType} form submitted successfully.`,
    });
  } catch (error: unknown) {
    logger.error('Error submitting tax form:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid request data',
        details: error.errors,
      });
    }

    const message = error instanceof Error ? error.message : 'Failed to submit tax form';
    res.status(500).json({ error: message });
  }
});

router.get('/documents', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const verification = await kycService.getActiveVerification(req.user.id);
    
    if (!verification) {
      return res.json({ documents: [] });
    }

    const documents = await kycService.getVerificationDocuments(verification.id);

    res.json({ documents });
  } catch (error: unknown) {
    logger.error('Error fetching documents:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch documents';
    res.status(500).json({ error: message });
  }
});

router.get('/payout-eligibility', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const amount = parseFloat(req.query.amount as string) || 0;
    const eligibility = await kycService.checkPayoutEligibility(req.user.id, amount);

    res.json(eligibility);
  } catch (error: unknown) {
    logger.error('Error checking payout eligibility:', error);
    const message = error instanceof Error ? error.message : 'Failed to check eligibility';
    res.status(500).json({ error: message });
  }
});

router.post('/upgrade', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { verificationId, newLevel } = req.body;

    if (!verificationId || !newLevel) {
      return res.status(400).json({ error: 'Verification ID and new level required' });
    }

    const verification = await kycService.upgradeVerificationLevel(verificationId, newLevel);

    res.json({
      success: true,
      verification,
      message: `Verification upgraded to ${newLevel}. Please submit additional required documents.`,
    });
  } catch (error: unknown) {
    logger.error('Error upgrading verification:', error);
    const message = error instanceof Error ? error.message : 'Failed to upgrade verification';
    res.status(500).json({ error: message });
  }
});

router.get('/admin/pending', async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const pending = await kycService.getPendingVerifications();

    res.json({ verifications: pending });
  } catch (error: unknown) {
    logger.error('Error fetching pending verifications:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch pending verifications';
    res.status(500).json({ error: message });
  }
});

router.post('/admin/review/:verificationId', async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { verificationId } = req.params;
    const { action, notes, reason } = req.body;

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be "approve" or "reject"' });
    }

    let verification;
    if (action === 'approve') {
      verification = await kycService.approveVerification(verificationId, req.user.id, notes);
    } else {
      if (!reason) {
        return res.status(400).json({ error: 'Rejection reason required' });
      }
      verification = await kycService.rejectVerification(verificationId, req.user.id, reason);
    }

    res.json({
      success: true,
      verification,
      message: `Verification ${action}d successfully`,
    });
  } catch (error: unknown) {
    logger.error('Error reviewing verification:', error);
    const message = error instanceof Error ? error.message : 'Failed to review verification';
    res.status(500).json({ error: message });
  }
});

router.post('/admin/documents/:documentId/review', async (req, res) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { documentId } = req.params;
    const { approved, reason } = req.body;

    if (typeof approved !== 'boolean') {
      return res.status(400).json({ error: 'Approved status required' });
    }

    if (!approved && !reason) {
      return res.status(400).json({ error: 'Rejection reason required' });
    }

    const document = await kycService.reviewDocument(documentId, req.user.id, approved, reason);

    res.json({
      success: true,
      document,
      message: `Document ${approved ? 'approved' : 'rejected'} successfully`,
    });
  } catch (error: unknown) {
    logger.error('Error reviewing document:', error);
    const message = error instanceof Error ? error.message : 'Failed to review document';
    res.status(500).json({ error: message });
  }
});

export default router;
