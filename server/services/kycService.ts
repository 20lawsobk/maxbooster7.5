import { db } from '../db.js';
import {
  kycVerifications,
  kycDocuments,
  users,
  type KYCVerification,
  type KYCDocument,
  type InsertKYCVerification,
  type InsertKYCDocument,
} from '@shared/schema';
import { eq, and, desc, gte, or } from 'drizzle-orm';
import { logger } from '../logger.js';
import crypto from 'crypto';
import { emailService } from './emailService.js';

export type KYCType = 'individual' | 'business';
export type KYCStatus = 'not_started' | 'pending' | 'under_review' | 'verified' | 'rejected' | 'expired';
export type KYCLevel = 'basic' | 'enhanced' | 'full';
export type TaxFormType = 'W9' | 'W8BEN' | 'W8BENE';
export type DocumentType = 
  | 'government_id' 
  | 'passport' 
  | 'drivers_license' 
  | 'proof_of_address' 
  | 'bank_statement' 
  | 'business_registration' 
  | 'articles_of_incorporation' 
  | 'tax_id_document' 
  | 'selfie' 
  | 'w9' 
  | 'w8ben' 
  | 'w8bene' 
  | 'other';

export interface KYCStartRequest {
  userId: string;
  type: KYCType;
  level?: KYCLevel;
}

export interface IndividualInfo {
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  nationality: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  taxIdNumber?: string;
}

export interface BusinessInfo {
  businessName: string;
  businessType: string;
  businessRegistrationNumber: string;
  taxIdNumber: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface DocumentUploadRequest {
  verificationId: string;
  userId: string;
  documentType: DocumentType;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storagePath: string;
  expirationDate?: Date;
}

export interface VerificationResult {
  verificationId: string;
  status: KYCStatus;
  level: KYCLevel;
  documentsRequired: DocumentType[];
  documentsSubmitted: DocumentType[];
  documentsPending: DocumentType[];
  taxFormRequired: boolean;
  taxFormSubmitted: boolean;
  payoutEligible: boolean;
  message?: string;
}

export interface TaxFormSubmission {
  userId: string;
  verificationId: string;
  formType: TaxFormType;
  documentPath: string;
}

const DOCUMENT_REQUIREMENTS: Record<KYCLevel, Record<KYCType, DocumentType[]>> = {
  basic: {
    individual: ['government_id'],
    business: ['business_registration'],
  },
  enhanced: {
    individual: ['government_id', 'selfie', 'proof_of_address'],
    business: ['business_registration', 'articles_of_incorporation', 'proof_of_address'],
  },
  full: {
    individual: ['government_id', 'selfie', 'proof_of_address', 'bank_statement'],
    business: ['business_registration', 'articles_of_incorporation', 'proof_of_address', 'bank_statement', 'tax_id_document'],
  },
};

const PAYOUT_THRESHOLDS: Record<KYCLevel, number> = {
  basic: 500,
  enhanced: 5000,
  full: Infinity,
};

const VERIFICATION_EXPIRY_DAYS = 365;

export class KYCService {
  async startVerification(request: KYCStartRequest): Promise<KYCVerification> {
    const existingVerification = await this.getActiveVerification(request.userId);
    
    if (existingVerification) {
      if (existingVerification.status === 'verified' && !this.isExpired(existingVerification)) {
        throw new Error('User already has an active verified status');
      }
      
      if (existingVerification.status === 'pending' || existingVerification.status === 'under_review') {
        return existingVerification;
      }
    }

    const [verification] = await db
      .insert(kycVerifications)
      .values({
        userId: request.userId,
        type: request.type,
        status: 'pending',
        level: request.level || 'basic',
        startedAt: new Date(),
      })
      .returning();

    logger.info(`KYC verification started: ${verification.id} for user ${request.userId}`);

    return verification;
  }

  async updateIndividualInfo(verificationId: string, info: IndividualInfo): Promise<KYCVerification> {
    const verification = await this.getVerification(verificationId);
    if (!verification) {
      throw new Error('Verification not found');
    }

    if (verification.type !== 'individual') {
      throw new Error('Verification type mismatch');
    }

    const [updated] = await db
      .update(kycVerifications)
      .set({
        firstName: info.firstName,
        lastName: info.lastName,
        dateOfBirth: info.dateOfBirth,
        nationality: info.nationality,
        address: info.address,
        city: info.city,
        state: info.state,
        postalCode: info.postalCode,
        country: info.country,
        taxIdNumber: info.taxIdNumber,
        updatedAt: new Date(),
      })
      .where(eq(kycVerifications.id, verificationId))
      .returning();

    logger.info(`Individual info updated for verification ${verificationId}`);

    return updated;
  }

  async updateBusinessInfo(verificationId: string, info: BusinessInfo): Promise<KYCVerification> {
    const verification = await this.getVerification(verificationId);
    if (!verification) {
      throw new Error('Verification not found');
    }

    if (verification.type !== 'business') {
      throw new Error('Verification type mismatch');
    }

    const [updated] = await db
      .update(kycVerifications)
      .set({
        businessName: info.businessName,
        businessType: info.businessType,
        businessRegistrationNumber: info.businessRegistrationNumber,
        taxIdNumber: info.taxIdNumber,
        address: info.address,
        city: info.city,
        state: info.state,
        postalCode: info.postalCode,
        country: info.country,
        updatedAt: new Date(),
      })
      .where(eq(kycVerifications.id, verificationId))
      .returning();

    logger.info(`Business info updated for verification ${verificationId}`);

    return updated;
  }

  async uploadDocument(request: DocumentUploadRequest): Promise<KYCDocument> {
    const verification = await this.getVerification(request.verificationId);
    if (!verification) {
      throw new Error('Verification not found');
    }

    if (verification.status === 'verified') {
      throw new Error('Cannot upload documents for verified accounts');
    }

    const [document] = await db
      .insert(kycDocuments)
      .values({
        verificationId: request.verificationId,
        userId: request.userId,
        documentType: request.documentType,
        fileName: request.fileName,
        fileSize: request.fileSize,
        mimeType: request.mimeType,
        storagePath: request.storagePath,
        status: 'pending',
        expirationDate: request.expirationDate,
      })
      .returning();

    logger.info(`Document uploaded: ${document.id} type: ${request.documentType} for verification ${request.verificationId}`);

    await this.checkAndUpdateVerificationStatus(request.verificationId);

    return document;
  }

  async submitTaxForm(submission: TaxFormSubmission): Promise<KYCVerification> {
    const verification = await this.getVerification(submission.verificationId);
    if (!verification) {
      throw new Error('Verification not found');
    }

    await this.uploadDocument({
      verificationId: submission.verificationId,
      userId: submission.userId,
      documentType: submission.formType.toLowerCase() as DocumentType,
      fileName: `${submission.formType}_${Date.now()}.pdf`,
      fileSize: 0,
      mimeType: 'application/pdf',
      storagePath: submission.documentPath,
    });

    const [updated] = await db
      .update(kycVerifications)
      .set({
        taxFormType: submission.formType,
        taxFormSubmitted: true,
        updatedAt: new Date(),
      })
      .where(eq(kycVerifications.id, submission.verificationId))
      .returning();

    logger.info(`Tax form ${submission.formType} submitted for verification ${submission.verificationId}`);

    return updated;
  }

  async reviewDocument(documentId: string, reviewerId: string, approved: boolean, reason?: string): Promise<KYCDocument> {
    const [document] = await db
      .update(kycDocuments)
      .set({
        status: approved ? 'approved' : 'rejected',
        rejectionReason: approved ? null : reason,
        reviewedAt: new Date(),
        reviewedBy: reviewerId,
      })
      .where(eq(kycDocuments.id, documentId))
      .returning();

    logger.info(`Document ${documentId} ${approved ? 'approved' : 'rejected'} by ${reviewerId}`);

    const allDocs = await this.getVerificationDocuments(document.verificationId);
    await this.checkAndUpdateVerificationStatus(document.verificationId, allDocs);

    return document;
  }

  async approveVerification(verificationId: string, reviewerId: string, notes?: string): Promise<KYCVerification> {
    const verification = await this.getVerification(verificationId);
    if (!verification) {
      throw new Error('Verification not found');
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + VERIFICATION_EXPIRY_DAYS);

    const [updated] = await db
      .update(kycVerifications)
      .set({
        status: 'verified',
        verifiedAt: new Date(),
        expiresAt,
        reviewedBy: reviewerId,
        reviewNotes: notes,
        updatedAt: new Date(),
      })
      .where(eq(kycVerifications.id, verificationId))
      .returning();

    logger.info(`Verification ${verificationId} approved by ${reviewerId}`);

    await this.notifyVerificationComplete(updated);

    return updated;
  }

  async rejectVerification(verificationId: string, reviewerId: string, reason: string): Promise<KYCVerification> {
    const [updated] = await db
      .update(kycVerifications)
      .set({
        status: 'rejected',
        rejectionReason: reason,
        reviewedBy: reviewerId,
        updatedAt: new Date(),
      })
      .where(eq(kycVerifications.id, verificationId))
      .returning();

    logger.info(`Verification ${verificationId} rejected by ${reviewerId}: ${reason}`);

    await this.notifyVerificationRejected(updated);

    return updated;
  }

  async getVerificationStatus(userId: string): Promise<VerificationResult | null> {
    const verification = await this.getActiveVerification(userId);
    if (!verification) {
      return null;
    }

    const documents = await this.getVerificationDocuments(verification.id);
    const requiredDocs = DOCUMENT_REQUIREMENTS[verification.level][verification.type];
    const submittedTypes = documents.map(d => d.documentType);
    const approvedTypes = documents.filter(d => d.status === 'approved').map(d => d.documentType);
    const pendingTypes = documents.filter(d => d.status === 'pending').map(d => d.documentType);

    const taxFormRequired = this.isTaxFormRequired(verification);

    return {
      verificationId: verification.id,
      status: verification.status,
      level: verification.level,
      documentsRequired: requiredDocs,
      documentsSubmitted: submittedTypes as DocumentType[],
      documentsPending: pendingTypes as DocumentType[],
      taxFormRequired,
      taxFormSubmitted: verification.taxFormSubmitted || false,
      payoutEligible: this.isPayoutEligible(verification),
      message: this.getStatusMessage(verification),
    };
  }

  async getVerification(verificationId: string): Promise<KYCVerification | null> {
    const [verification] = await db
      .select()
      .from(kycVerifications)
      .where(eq(kycVerifications.id, verificationId));

    return verification || null;
  }

  async getActiveVerification(userId: string): Promise<KYCVerification | null> {
    const [verification] = await db
      .select()
      .from(kycVerifications)
      .where(eq(kycVerifications.userId, userId))
      .orderBy(desc(kycVerifications.createdAt))
      .limit(1);

    return verification || null;
  }

  async getVerificationDocuments(verificationId: string): Promise<KYCDocument[]> {
    return db
      .select()
      .from(kycDocuments)
      .where(eq(kycDocuments.verificationId, verificationId))
      .orderBy(desc(kycDocuments.uploadedAt));
  }

  async getPendingVerifications(): Promise<KYCVerification[]> {
    return db
      .select()
      .from(kycVerifications)
      .where(
        or(
          eq(kycVerifications.status, 'pending'),
          eq(kycVerifications.status, 'under_review')
        )
      )
      .orderBy(kycVerifications.createdAt);
  }

  async checkPayoutEligibility(userId: string, amount: number): Promise<{
    eligible: boolean;
    reason?: string;
    requiredLevel?: KYCLevel;
    currentLevel?: KYCLevel;
  }> {
    const verification = await this.getActiveVerification(userId);

    if (!verification || verification.status !== 'verified') {
      return {
        eligible: false,
        reason: 'KYC verification required for payouts',
        requiredLevel: 'basic',
      };
    }

    if (this.isExpired(verification)) {
      return {
        eligible: false,
        reason: 'KYC verification has expired. Please renew.',
        requiredLevel: verification.level,
        currentLevel: verification.level,
      };
    }

    const threshold = PAYOUT_THRESHOLDS[verification.level];
    if (amount > threshold) {
      const requiredLevel = this.getRequiredLevelForAmount(amount);
      return {
        eligible: false,
        reason: `Payout amount exceeds ${verification.level} tier limit. Please upgrade to ${requiredLevel}.`,
        requiredLevel,
        currentLevel: verification.level,
      };
    }

    if (this.isTaxFormRequired(verification) && !verification.taxFormSubmitted) {
      return {
        eligible: false,
        reason: 'Tax form submission required before payouts',
        currentLevel: verification.level,
      };
    }

    return { eligible: true, currentLevel: verification.level };
  }

  async upgradeVerificationLevel(verificationId: string, newLevel: KYCLevel): Promise<KYCVerification> {
    const verification = await this.getVerification(verificationId);
    if (!verification) {
      throw new Error('Verification not found');
    }

    const levelOrder: KYCLevel[] = ['basic', 'enhanced', 'full'];
    const currentIndex = levelOrder.indexOf(verification.level);
    const newIndex = levelOrder.indexOf(newLevel);

    if (newIndex <= currentIndex) {
      throw new Error('Can only upgrade to a higher verification level');
    }

    const [updated] = await db
      .update(kycVerifications)
      .set({
        level: newLevel,
        status: 'pending',
        updatedAt: new Date(),
      })
      .where(eq(kycVerifications.id, verificationId))
      .returning();

    logger.info(`Verification ${verificationId} upgraded to ${newLevel}`);

    return updated;
  }

  private async checkAndUpdateVerificationStatus(verificationId: string, existingDocs?: KYCDocument[]): Promise<void> {
    const verification = await this.getVerification(verificationId);
    if (!verification) return;

    const documents = existingDocs || await this.getVerificationDocuments(verificationId);
    const requiredDocs = DOCUMENT_REQUIREMENTS[verification.level][verification.type];

    const hasAllRequired = requiredDocs.every(docType =>
      documents.some(d => d.documentType === docType && d.status !== 'rejected')
    );

    if (hasAllRequired && verification.status === 'pending') {
      await db
        .update(kycVerifications)
        .set({
          status: 'under_review',
          submittedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(kycVerifications.id, verificationId));

      logger.info(`Verification ${verificationId} moved to under_review`);
    }
  }

  private isExpired(verification: KYCVerification): boolean {
    if (!verification.expiresAt) return false;
    return new Date() > verification.expiresAt;
  }

  private isTaxFormRequired(verification: KYCVerification): boolean {
    if (verification.country === 'US') {
      return true;
    }
    return verification.level === 'enhanced' || verification.level === 'full';
  }

  private isPayoutEligible(verification: KYCVerification): boolean {
    return verification.status === 'verified' && !this.isExpired(verification);
  }

  private getRequiredLevelForAmount(amount: number): KYCLevel {
    if (amount <= PAYOUT_THRESHOLDS.basic) return 'basic';
    if (amount <= PAYOUT_THRESHOLDS.enhanced) return 'enhanced';
    return 'full';
  }

  private getStatusMessage(verification: KYCVerification): string {
    switch (verification.status) {
      case 'not_started':
        return 'Verification not started. Please provide your information.';
      case 'pending':
        return 'Please upload required documents to proceed.';
      case 'under_review':
        return 'Your verification is under review. This typically takes 1-2 business days.';
      case 'verified':
        return this.isExpired(verification)
          ? 'Your verification has expired. Please renew.'
          : 'Your account is verified.';
      case 'rejected':
        return `Verification rejected: ${verification.rejectionReason}`;
      case 'expired':
        return 'Your verification has expired. Please submit new documents.';
      default:
        return 'Unknown status';
    }
  }

  private async notifyVerificationComplete(verification: KYCVerification): Promise<void> {
    try {
      const [user] = await db
        .select({ email: users.email, firstName: users.firstName })
        .from(users)
        .where(eq(users.id, verification.userId));

      if (user?.email) {
        await emailService.sendEmail({
          to: user.email,
          subject: 'Identity Verification Complete',
          html: `
            <h2>Verification Approved</h2>
            <p>Dear ${user.firstName || 'User'},</p>
            <p>Your ${verification.type} verification has been approved at the ${verification.level} level.</p>
            <p>You can now receive payouts up to the limits for your verification tier.</p>
          `,
        });
      }
    } catch (error) {
      logger.error('Error notifying verification complete:', error);
    }
  }

  private async notifyVerificationRejected(verification: KYCVerification): Promise<void> {
    try {
      const [user] = await db
        .select({ email: users.email, firstName: users.firstName })
        .from(users)
        .where(eq(users.id, verification.userId));

      if (user?.email) {
        await emailService.sendEmail({
          to: user.email,
          subject: 'Identity Verification Update Required',
          html: `
            <h2>Verification Requires Attention</h2>
            <p>Dear ${user.firstName || 'User'},</p>
            <p>Your verification was not approved for the following reason:</p>
            <p><em>${verification.rejectionReason}</em></p>
            <p>Please log in to your account to submit corrected information.</p>
          `,
        });
      }
    } catch (error) {
      logger.error('Error notifying verification rejected:', error);
    }
  }
}

export const kycService = new KYCService();
