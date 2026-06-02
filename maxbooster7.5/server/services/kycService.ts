import { db } from "../db.js";
import {
  kycVerifications,
  kycDocuments,
  users,
  type KYCVerification,
  type KYCDocument,
  type InsertKYCVerification,
  type InsertKYCDocument,
} from "@shared/schema";
import { eq, and, desc, gte, or } from "drizzle-orm";
import { logger } from "../logger.js";
import crypto from "crypto";
import { emailService } from "./emailService.js";

export type KYCType = "individual" | "business";
export type KYCStatus =
  | "not_started"
  | "pending"
  | "under_review"
  | "verified"
  | "rejected"
  | "expired";
export type KYCLevel = "basic" | "enhanced" | "full";
export type TaxFormType = "W9" | "W8BEN" | "W8BENE";
export type DocumentType =
  | "government_id"
  | "passport"
  | "drivers_license"
  | "proof_of_address"
  | "bank_statement"
  | "business_registration"
  | "articles_of_incorporation"
  | "tax_id_document"
  | "selfie"
  | "w9"
  | "w8ben"
  | "w8bene"
  | "other";

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

export interface DocumentInfo {
  type: DocumentType;
  name: string;
  description: string;
  required: boolean;
  status: "not_uploaded" | "pending" | "approved" | "rejected";
  fileName?: string;
  rejectionReason?: string;
  uploadedAt?: Date;
}

export interface SupportContact {
  email: string;
  phone?: string;
  hours: string;
  responseTime: string;
}

export interface VerificationResult {
  verificationId: string;
  status: KYCStatus;
  level: KYCLevel;
  verificationType: KYCType;
  infoSubmitted: boolean;
  documentsRequired: DocumentType[];
  documentsSubmitted: DocumentType[];
  documentsPending: DocumentType[];
  documentsRejected: DocumentType[];
  documentsApproved: DocumentType[];
  allDocumentsUploaded: boolean;
  taxFormRequired: boolean;
  taxFormSubmitted: boolean;
  payoutEligible: boolean;
  message?: string;
  estimatedReviewTime?: string;
  submittedAt?: string;
  reviewStartedAt?: string;
  rejectionReason?: string;
  resubmissionRequired: boolean;
  documentChecklist: DocumentInfo[];
  supportContact: SupportContact;
  nextSteps: string[];
}

export interface TaxFormSubmission {
  userId: string;
  verificationId: string;
  formType: TaxFormType;
  documentPath: string;
}

const DOCUMENT_REQUIREMENTS: Record<
  KYCLevel,
  Record<KYCType, DocumentType[]>
> = {
  basic: {
    individual: ["government_id"],
    business: ["business_registration"],
  },
  enhanced: {
    individual: ["government_id", "selfie", "proof_of_address"],
    business: [
      "business_registration",
      "articles_of_incorporation",
      "proof_of_address",
    ],
  },
  full: {
    individual: [
      "government_id",
      "selfie",
      "proof_of_address",
      "bank_statement",
    ],
    business: [
      "business_registration",
      "articles_of_incorporation",
      "proof_of_address",
      "bank_statement",
      "tax_id_document",
    ],
  },
};

const PAYOUT_THRESHOLDS: Record<KYCLevel, number> = {
  basic: 500,
  enhanced: 5000,
  full: Infinity,
};

const VERIFICATION_EXPIRY_DAYS = 365;

const DOCUMENT_NAMES: Record<
  DocumentType,
  { name: string; description: string }
> = {
  government_id: {
    name: "Government ID",
    description: "Valid government-issued photo ID (national ID card)",
  },
  passport: {
    name: "Passport",
    description: "Valid passport with photo page clearly visible",
  },
  drivers_license: {
    name: "Driver's License",
    description: "Valid driver's license (front and back)",
  },
  proof_of_address: {
    name: "Proof of Address",
    description: "Utility bill or bank statement from the last 3 months",
  },
  bank_statement: {
    name: "Bank Statement",
    description: "Recent bank statement showing your name and address",
  },
  business_registration: {
    name: "Business Registration",
    description: "Official business registration certificate",
  },
  articles_of_incorporation: {
    name: "Articles of Incorporation",
    description: "Company articles of incorporation or formation documents",
  },
  tax_id_document: {
    name: "Tax ID Document",
    description: "EIN letter or tax registration certificate",
  },
  selfie: {
    name: "Selfie Verification",
    description: "Clear selfie holding your ID next to your face",
  },
  w9: { name: "W-9 Form", description: "IRS W-9 form for US tax purposes" },
  w8ben: {
    name: "W-8BEN Form",
    description: "IRS W-8BEN form for non-US individuals",
  },
  w8bene: {
    name: "W-8BEN-E Form",
    description: "IRS W-8BEN-E form for non-US entities",
  },
  other: {
    name: "Other Document",
    description: "Additional supporting document",
  },
};

const SUPPORT_CONTACT: SupportContact = {
  email: "kyc-support@maxbooster.ai",
  phone: "+1 (888) 555-0123",
  hours: "Monday - Friday, 9:00 AM - 6:00 PM EST",
  responseTime: "Within 24 hours",
};

const FILE_SIZE_LIMITS = {
  minBytes: 10 * 1024,
  maxBytes: 10 * 1024 * 1024,
  minMB: 0.01,
  maxMB: 10,
};

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/jpg",
  "application/pdf",
];

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  errorCode?:
    | "FILE_TOO_SMALL"
    | "FILE_TOO_LARGE"
    | "INVALID_FORMAT"
    | "EMPTY_FILE";
}

interface KYCMetadata {
  level?: KYCLevel;
  startedAt?: string;
  submittedAt?: string;
  taxFormType?: TaxFormType;
  taxFormSubmitted?: boolean;
  reviewedBy?: string;
  reviewNotes?: string;
  rejectionReason?: string;
  individualInfo?: IndividualInfo;
  businessInfo?: BusinessInfo;
}

function getMetadata(verification: KYCVerification): KYCMetadata {
  return (verification.metadata as KYCMetadata) || {};
}

function getLevel(verification: KYCVerification): KYCLevel {
  const metadata = getMetadata(verification);
  return metadata.level || "basic";
}

export class KYCService {
  async startVerification(request: KYCStartRequest): Promise<KYCVerification> {
    const existingVerification = await this.getActiveVerification(
      request.userId,
    );

    if (existingVerification) {
      if (
        existingVerification.status === "verified" &&
        !this.isExpired(existingVerification)
      ) {
        throw new Error("User already has an active verified status");
      }

      if (
        existingVerification.status === "pending" ||
        existingVerification.status === "under_review"
      ) {
        return existingVerification;
      }
    }

    const [verification] = await db
      .insert(kycVerifications)
      .values({
        userId: request.userId,
        verificationType: request.type,
        status: "pending",
        metadata: {
          level: request.level || "basic",
          startedAt: new Date().toISOString(),
        },
      })
      .returning();

    logger.info(
      `KYC verification started: ${verification.id} for user ${request.userId}`,
    );

    return verification;
  }

  async updateIndividualInfo(
    verificationId: string,
    info: IndividualInfo,
    userId: string,
  ): Promise<KYCVerification> {
    const verification = await this.getVerification(verificationId);
    if (!verification) {
      throw new Error("Verification not found");
    }

    if (verification.userId !== userId) {
      throw new Error("Unauthorized: This verification does not belong to you");
    }

    if (verification.verificationType !== "individual") {
      throw new Error("Verification type mismatch");
    }

    const existingMetadata =
      (verification.metadata as Record<string, unknown>) || {};
    const updatedMetadata = {
      ...existingMetadata,
      individualInfo: info,
    };

    const [updated] = await db
      .update(kycVerifications)
      .set({
        metadata: updatedMetadata,
      })
      .where(eq(kycVerifications.id, verificationId))
      .returning();

    logger.info(`Individual info updated for verification ${verificationId}`);

    return updated;
  }

  async updateBusinessInfo(
    verificationId: string,
    info: BusinessInfo,
    userId: string,
  ): Promise<KYCVerification> {
    const verification = await this.getVerification(verificationId);
    if (!verification) {
      throw new Error("Verification not found");
    }

    if (verification.userId !== userId) {
      throw new Error("Unauthorized: This verification does not belong to you");
    }

    if (verification.verificationType !== "business") {
      throw new Error("Verification type mismatch");
    }

    const existingMetadata =
      (verification.metadata as Record<string, unknown>) || {};
    const updatedMetadata = {
      ...existingMetadata,
      businessInfo: info,
    };

    const [updated] = await db
      .update(kycVerifications)
      .set({
        metadata: updatedMetadata,
      })
      .where(eq(kycVerifications.id, verificationId))
      .returning();

    logger.info(`Business info updated for verification ${verificationId}`);

    return updated;
  }

  async uploadDocument(request: DocumentUploadRequest): Promise<KYCDocument> {
    const verification = await this.getVerification(request.verificationId);
    if (!verification) {
      throw new Error("Verification not found");
    }

    if (verification.userId !== request.userId) {
      throw new Error("Unauthorized: This verification does not belong to you");
    }

    if (verification.status === "verified") {
      throw new Error("Cannot upload documents for verified accounts");
    }

    const [document] = await db
      .insert(kycDocuments)
      .values({
        userId: request.userId,
        documentType: request.documentType,
        documentUrl: request.storagePath,
        status: "pending",
        expiresAt: request.expirationDate,
        metadata: {
          verificationId: request.verificationId,
          fileName: request.fileName,
          fileSize: request.fileSize,
          mimeType: request.mimeType,
        },
      })
      .returning();

    logger.info(
      `Document uploaded: ${document.id} type: ${request.documentType} for verification ${request.verificationId}`,
    );

    await this.checkAndUpdateVerificationStatus(request.verificationId);

    return document;
  }

  async submitTaxForm(submission: TaxFormSubmission): Promise<KYCVerification> {
    const verification = await this.getVerification(submission.verificationId);
    if (!verification) {
      throw new Error("Verification not found");
    }

    await this.uploadDocument({
      verificationId: submission.verificationId,
      userId: submission.userId,
      documentType: submission.formType.toLowerCase() as DocumentType,
      fileName: `${submission.formType}_${Date.now()}.pdf`,
      fileSize: 0,
      mimeType: "application/pdf",
      storagePath: submission.documentPath,
    });

    const existingMetadata = getMetadata(verification);
    const updatedMetadata = {
      ...existingMetadata,
      taxFormType: submission.formType,
      taxFormSubmitted: true,
    };

    const [updated] = await db
      .update(kycVerifications)
      .set({
        metadata: updatedMetadata,
      })
      .where(eq(kycVerifications.id, submission.verificationId))
      .returning();

    logger.info(
      `Tax form ${submission.formType} submitted for verification ${submission.verificationId}`,
    );

    return updated;
  }

  async reviewDocument(
    documentId: string,
    reviewerId: string,
    approved: boolean,
    reason?: string,
  ): Promise<KYCDocument> {
    const existingDoc = await this.getDocument(documentId);
    if (!existingDoc) {
      throw new Error("Document not found");
    }

    const existingMeta = (existingDoc.metadata as Record<string, any>) || {};
    const updatedMeta = {
      ...existingMeta,
      reviewedBy: reviewerId,
      reviewedAt: new Date().toISOString(),
      rejectionReason: approved ? null : reason,
    };

    const [document] = await db
      .update(kycDocuments)
      .set({
        status: approved ? "approved" : "rejected",
        verifiedAt: approved ? new Date() : null,
        metadata: updatedMeta,
      })
      .where(eq(kycDocuments.id, documentId))
      .returning();

    logger.info(
      `Document ${documentId} ${approved ? "approved" : "rejected"} by ${reviewerId}`,
    );

    const verificationId = existingMeta.verificationId;
    if (verificationId) {
      const allDocs = await this.getVerificationDocuments(verificationId);
      await this.checkAndUpdateVerificationStatus(verificationId, allDocs);
    }

    return document;
  }

  async approveVerification(
    verificationId: string,
    reviewerId: string,
    notes?: string,
  ): Promise<KYCVerification> {
    const verification = await this.getVerification(verificationId);
    if (!verification) {
      throw new Error("Verification not found");
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + VERIFICATION_EXPIRY_DAYS);

    const existingMetadata = getMetadata(verification);
    const updatedMetadata = {
      ...existingMetadata,
      reviewedBy: reviewerId,
      reviewNotes: notes,
    };

    const [updated] = await db
      .update(kycVerifications)
      .set({
        status: "verified",
        verifiedAt: new Date(),
        expiresAt,
        metadata: updatedMetadata,
      })
      .where(eq(kycVerifications.id, verificationId))
      .returning();

    logger.info(`Verification ${verificationId} approved by ${reviewerId}`);

    await this.notifyVerificationComplete(updated);

    return updated;
  }

  async rejectVerification(
    verificationId: string,
    reviewerId: string,
    reason: string,
  ): Promise<KYCVerification> {
    const verification = await this.getVerification(verificationId);
    if (!verification) {
      throw new Error("Verification not found");
    }

    const existingMetadata = getMetadata(verification);
    const updatedMetadata = {
      ...existingMetadata,
      rejectionReason: reason,
      reviewedBy: reviewerId,
    };

    const [updated] = await db
      .update(kycVerifications)
      .set({
        status: "rejected",
        metadata: updatedMetadata,
      })
      .where(eq(kycVerifications.id, verificationId))
      .returning();

    logger.info(
      `Verification ${verificationId} rejected by ${reviewerId}: ${reason}`,
    );

    await this.notifyVerificationRejected(updated);

    return updated;
  }

  async getVerificationStatus(
    userId: string,
  ): Promise<VerificationResult | null> {
    const verification = await this.getActiveVerification(userId);
    if (!verification) {
      return null;
    }

    const metadata = getMetadata(verification);
    const level = getLevel(verification);
    const verificationType = verification.verificationType as KYCType;
    const documents = await this.getVerificationDocuments(verification.id);
    const requiredDocs = DOCUMENT_REQUIREMENTS[level][verificationType];
    const submittedTypes = documents.map((d) => d.documentType);
    const pendingTypes = documents
      .filter((d) => d.status === "pending")
      .map((d) => d.documentType);
    const rejectedTypes = documents
      .filter((d) => d.status === "rejected")
      .map((d) => d.documentType);
    const approvedTypes = documents
      .filter((d) => d.status === "approved")
      .map((d) => d.documentType);

    const taxFormRequired = this.isTaxFormRequired(verification);

    const infoSubmitted =
      verificationType === "individual"
        ? !!(
            metadata.individualInfo?.firstName &&
            metadata.individualInfo?.lastName
          )
        : !!metadata.businessInfo?.businessName;

    const allDocumentsUploaded = requiredDocs.every((docType) =>
      submittedTypes.includes(docType),
    );
    const hasRejectedDocs = rejectedTypes.length > 0;
    const resubmissionRequired =
      hasRejectedDocs || verification.status === "rejected";

    const documentChecklist: DocumentInfo[] = requiredDocs.map((docType) => {
      const doc = documents.find((d) => d.documentType === docType);
      const docMeta = (doc?.metadata as Record<string, any>) || {};
      const nameInfo = DOCUMENT_NAMES[docType] || {
        name: docType,
        description: "",
      };

      return {
        type: docType,
        name: nameInfo.name,
        description: nameInfo.description,
        required: true,
        status: doc
          ? (doc.status as "pending" | "approved" | "rejected")
          : "not_uploaded",
        fileName: docMeta.fileName,
        rejectionReason: docMeta.rejectionReason,
        uploadedAt: doc?.createdAt,
      };
    });

    const nextSteps = this.getNextSteps(
      verification,
      infoSubmitted,
      allDocumentsUploaded,
      hasRejectedDocs,
      documents,
    );

    return {
      verificationId: verification.id,
      status: verification.status as KYCStatus,
      level,
      verificationType,
      infoSubmitted,
      documentsRequired: requiredDocs,
      documentsSubmitted: submittedTypes as DocumentType[],
      documentsPending: pendingTypes as DocumentType[],
      documentsRejected: rejectedTypes as DocumentType[],
      documentsApproved: approvedTypes as DocumentType[],
      allDocumentsUploaded,
      taxFormRequired,
      taxFormSubmitted: metadata.taxFormSubmitted || false,
      payoutEligible: this.isPayoutEligible(verification),
      message: this.getStatusMessage(verification),
      estimatedReviewTime: this.getEstimatedReviewTime(
        verification,
        documents.length,
      ),
      submittedAt: metadata.submittedAt,
      reviewStartedAt: metadata.reviewStartedAt,
      rejectionReason: metadata.rejectionReason,
      resubmissionRequired,
      documentChecklist,
      supportContact: SUPPORT_CONTACT,
      nextSteps,
    };
  }

  private getNextSteps(
    verification: KYCVerification,
    infoSubmitted: boolean,
    allDocumentsUploaded: boolean,
    hasRejectedDocs: boolean,
    documents: KYCDocument[],
  ): string[] {
    const steps: string[] = [];
    const status = verification.status as KYCStatus;

    if (status === "rejected") {
      steps.push(
        "Your verification was rejected. Please review the rejection reason and start a new verification.",
      );
      steps.push("Contact support if you have questions about the rejection.");
      return steps;
    }

    if (status === "verified") {
      steps.push("Your account is verified! You can now receive payouts.");
      return steps;
    }

    if (status === "under_review") {
      steps.push("Your documents are being reviewed by our team.");
      steps.push(
        "You will receive an email notification once the review is complete.",
      );
      steps.push("Typical review time is 1-2 business days.");
      return steps;
    }

    if (!infoSubmitted) {
      steps.push("Complete your personal/business information form.");
    }

    if (hasRejectedDocs) {
      const rejectedDocs = documents.filter((d) => d.status === "rejected");
      rejectedDocs.forEach((doc) => {
        const docMeta = (doc.metadata as Record<string, any>) || {};
        const nameInfo = DOCUMENT_NAMES[doc.documentType as DocumentType] || {
          name: doc.documentType,
        };
        steps.push(
          `Re-upload ${nameInfo.name}: ${docMeta.rejectionReason || "Document was rejected"}`,
        );
      });
    }

    if (!allDocumentsUploaded && infoSubmitted) {
      steps.push("Upload all required documents to proceed.");
    }

    if (allDocumentsUploaded && infoSubmitted && !hasRejectedDocs) {
      steps.push("Submit your verification for review.");
    }

    return steps;
  }

  private getEstimatedReviewTime(
    verification: KYCVerification,
    documentCount: number,
  ): string {
    const status = verification.status as KYCStatus;

    if (status === "verified") return "Complete";
    if (status === "rejected") return "N/A";
    if (status !== "under_review") return "Submit documents to see estimate";

    if (documentCount <= 2) return "1 business day";
    if (documentCount <= 4) return "1-2 business days";
    return "2-3 business days";
  }

  validateFile(fileSize: number, mimeType: string): FileValidationResult {
    if (fileSize === 0) {
      return {
        valid: false,
        error: "File is empty. Please upload a valid document.",
        errorCode: "EMPTY_FILE",
      };
    }

    if (fileSize < FILE_SIZE_LIMITS.minBytes) {
      return {
        valid: false,
        error: `File is too small (${(fileSize / 1024).toFixed(2)} KB). Minimum size is ${FILE_SIZE_LIMITS.minMB} MB. The document may not be readable.`,
        errorCode: "FILE_TOO_SMALL",
      };
    }

    if (fileSize > FILE_SIZE_LIMITS.maxBytes) {
      return {
        valid: false,
        error: `File is too large (${(fileSize / (1024 * 1024)).toFixed(2)} MB). Maximum size is ${FILE_SIZE_LIMITS.maxMB} MB. Please compress the file or use a lower resolution.`,
        errorCode: "FILE_TOO_LARGE",
      };
    }

    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return {
        valid: false,
        error: `Invalid file format (${mimeType}). Accepted formats: JPG, PNG, or PDF.`,
        errorCode: "INVALID_FORMAT",
      };
    }

    return { valid: true };
  }

  getDocumentInfo(documentType: DocumentType): {
    name: string;
    description: string;
  } {
    return (
      DOCUMENT_NAMES[documentType] || { name: documentType, description: "" }
    );
  }

  getSupportContact(): SupportContact {
    return SUPPORT_CONTACT;
  }

  async getVerification(
    verificationId: string,
  ): Promise<KYCVerification | null> {
    const [verification] = await db
      .select()
      .from(kycVerifications)
      .where(eq(kycVerifications.id, verificationId))
      .limit(1);

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

  async getVerificationDocuments(
    verificationId: string,
  ): Promise<KYCDocument[]> {
    const verification = await this.getVerification(verificationId);
    if (!verification) {
      return [];
    }

    const allDocs = await db
      .select()
      .from(kycDocuments)
      .where(eq(kycDocuments.userId, verification.userId))
      .orderBy(desc(kycDocuments.createdAt));

    return allDocs.filter((doc) => {
      const meta = (doc.metadata as Record<string, any>) || {};
      return meta.verificationId === verificationId;
    });
  }

  async getDocument(documentId: string): Promise<KYCDocument | null> {
    const [doc] = await db
      .select()
      .from(kycDocuments)
      .where(eq(kycDocuments.id, documentId))
      .limit(1);
    return doc || null;
  }

  async getPendingVerifications(): Promise<KYCVerification[]> {
    return db
      .select()
      .from(kycVerifications)
      .where(
        or(
          eq(kycVerifications.status, "pending"),
          eq(kycVerifications.status, "under_review"),
        ),
      )
      .orderBy(kycVerifications.createdAt);
  }

  async getVerificationsWithDetails(statusFilter?: string): Promise<any[]> {
    let query = db
      .select({
        id: kycVerifications.id,
        userId: kycVerifications.userId,
        verificationType: kycVerifications.verificationType,
        status: kycVerifications.status,
        metadata: kycVerifications.metadata,
        verifiedAt: kycVerifications.verifiedAt,
        expiresAt: kycVerifications.expiresAt,
        createdAt: kycVerifications.createdAt,
        userEmail: users.email,
        username: users.username,
      })
      .from(kycVerifications)
      .leftJoin(users, eq(kycVerifications.userId, users.id))
      .orderBy(desc(kycVerifications.createdAt));

    let verifications;
    if (statusFilter) {
      verifications = await query.where(
        eq(kycVerifications.status, statusFilter),
      );
    } else {
      verifications = await query;
    }

    const results = await Promise.all(
      verifications.map(async (v) => {
        const documents = await this.getVerificationDocuments(v.id);
        const metadata = (v.metadata as KYCMetadata) || {};
        const individualInfo = metadata.individualInfo;
        const businessInfo = metadata.businessInfo;

        return {
          id: v.id,
          userId: v.userId,
          verificationType: v.verificationType,
          status: v.status,
          level: metadata.level || "basic",
          firstName: individualInfo?.firstName,
          lastName: individualInfo?.lastName,
          businessName: businessInfo?.businessName,
          dateOfBirth: individualInfo?.dateOfBirth,
          nationality: individualInfo?.nationality,
          address: individualInfo?.address || businessInfo?.address,
          city: individualInfo?.city || businessInfo?.city,
          state: individualInfo?.state || businessInfo?.state,
          postalCode: individualInfo?.postalCode || businessInfo?.postalCode,
          country: individualInfo?.country || businessInfo?.country,
          taxIdNumber: individualInfo?.taxIdNumber || businessInfo?.taxIdNumber,
          businessType: businessInfo?.businessType,
          businessRegistrationNumber: businessInfo?.businessRegistrationNumber,
          submittedAt: metadata.submittedAt,
          createdAt: v.createdAt,
          user: { email: v.userEmail, username: v.username },
          documents,
        };
      }),
    );

    return results;
  }

  async checkPayoutEligibility(
    userId: string,
    amount: number,
  ): Promise<{
    eligible: boolean;
    reason?: string;
    requiredLevel?: KYCLevel;
    currentLevel?: KYCLevel;
  }> {
    const verification = await this.getActiveVerification(userId);

    if (!verification || verification.status !== "verified") {
      return {
        eligible: false,
        reason: "KYC verification required for payouts",
        requiredLevel: "basic",
      };
    }

    const level = getLevel(verification);
    const metadata = getMetadata(verification);

    if (this.isExpired(verification)) {
      return {
        eligible: false,
        reason: "KYC verification has expired. Please renew.",
        requiredLevel: level,
        currentLevel: level,
      };
    }

    const threshold = PAYOUT_THRESHOLDS[level];
    if (amount > threshold) {
      const requiredLevel = this.getRequiredLevelForAmount(amount);
      return {
        eligible: false,
        reason: `Payout amount exceeds ${level} tier limit. Please upgrade to ${requiredLevel}.`,
        requiredLevel,
        currentLevel: level,
      };
    }

    if (this.isTaxFormRequired(verification) && !metadata.taxFormSubmitted) {
      return {
        eligible: false,
        reason: "Tax form submission required before payouts",
        currentLevel: level,
      };
    }

    return { eligible: true, currentLevel: level };
  }

  async upgradeVerificationLevel(
    verificationId: string,
    newLevel: KYCLevel,
    userId: string,
  ): Promise<KYCVerification> {
    const verification = await this.getVerification(verificationId);
    if (!verification) {
      throw new Error("Verification not found");
    }

    if (verification.userId !== userId) {
      throw new Error("Unauthorized: This verification does not belong to you");
    }

    const currentLevel = getLevel(verification);
    const levelOrder: KYCLevel[] = ["basic", "enhanced", "full"];
    const currentIndex = levelOrder.indexOf(currentLevel);
    const newIndex = levelOrder.indexOf(newLevel);

    if (newIndex <= currentIndex) {
      throw new Error("Can only upgrade to a higher verification level");
    }

    const existingMetadata = getMetadata(verification);
    const updatedMetadata = {
      ...existingMetadata,
      level: newLevel,
    };

    const [updated] = await db
      .update(kycVerifications)
      .set({
        status: "pending",
        metadata: updatedMetadata,
      })
      .where(eq(kycVerifications.id, verificationId))
      .returning();

    logger.info(`Verification ${verificationId} upgraded to ${newLevel}`);

    return updated;
  }

  async submitForReview(
    verificationId: string,
    userId: string,
  ): Promise<KYCVerification> {
    const verification = await this.getVerification(verificationId);
    if (!verification) {
      throw new Error("Verification not found");
    }

    if (verification.userId !== userId) {
      throw new Error("Unauthorized to submit this verification");
    }

    if (
      verification.status === "under_review" ||
      verification.status === "verified"
    ) {
      throw new Error("Verification already submitted or verified");
    }

    const documents = await this.getVerificationDocuments(verificationId);
    if (documents.length === 0) {
      throw new Error("At least one document is required before submission");
    }

    const existingMetadata = getMetadata(verification);
    const updatedMetadata = {
      ...existingMetadata,
      submittedAt: new Date().toISOString(),
    };

    const [updated] = await db
      .update(kycVerifications)
      .set({
        status: "under_review",
        metadata: updatedMetadata,
      })
      .where(eq(kycVerifications.id, verificationId))
      .returning();

    logger.info(
      `Verification ${verificationId} submitted for review by user ${userId}`,
    );

    return updated;
  }

  private async checkAndUpdateVerificationStatus(
    verificationId: string,
    existingDocs?: KYCDocument[],
  ): Promise<void> {
    const verification = await this.getVerification(verificationId);
    if (!verification) return;

    const level = getLevel(verification);
    const documents =
      existingDocs || (await this.getVerificationDocuments(verificationId));
    const requiredDocs =
      DOCUMENT_REQUIREMENTS[level][verification.verificationType as KYCType];

    const hasAllRequired = requiredDocs.every((docType) =>
      documents.some(
        (d) => d.documentType === docType && d.status !== "rejected",
      ),
    );

    if (hasAllRequired && verification.status === "pending") {
      const existingMetadata = getMetadata(verification);
      const updatedMetadata = {
        ...existingMetadata,
        submittedAt: new Date().toISOString(),
      };

      await db
        .update(kycVerifications)
        .set({
          status: "under_review",
          metadata: updatedMetadata,
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
    const metadata = getMetadata(verification);
    const country =
      metadata.individualInfo?.country || metadata.businessInfo?.country;
    if (country === "US") {
      return true;
    }
    const level = getLevel(verification);
    return level === "enhanced" || level === "full";
  }

  private isPayoutEligible(verification: KYCVerification): boolean {
    return verification.status === "verified" && !this.isExpired(verification);
  }

  private getRequiredLevelForAmount(amount: number): KYCLevel {
    if (amount <= PAYOUT_THRESHOLDS.basic) return "basic";
    if (amount <= PAYOUT_THRESHOLDS.enhanced) return "enhanced";
    return "full";
  }

  private getStatusMessage(verification: KYCVerification): string {
    const metadata = getMetadata(verification);
    switch (verification.status) {
      case "not_started":
        return "Verification not started. Please provide your information.";
      case "pending":
        return "Please upload required documents to proceed.";
      case "under_review":
        return "Your verification is under review. This typically takes 1-2 business days.";
      case "verified":
        return this.isExpired(verification)
          ? "Your verification has expired. Please renew."
          : "Your account is verified.";
      case "rejected":
        return `Verification rejected: ${metadata.rejectionReason || "No reason provided"}`;
      case "expired":
        return "Your verification has expired. Please submit new documents.";
      default:
        return "Unknown status";
    }
  }

  private async notifyVerificationComplete(
    verification: KYCVerification,
  ): Promise<void> {
    try {
      const [user] = await db
        .select({ email: users.email, firstName: users.firstName })
        .from(users)
        .where(eq(users.id, verification.userId))
        .limit(1);

      const level = getLevel(verification);

      if (user?.email) {
        await emailService.sendEmail({
          to: user.email,
          subject: "Identity Verification Complete",
          html: `
            <h2>Verification Approved</h2>
            <p>Dear ${user.firstName || "User"},</p>
            <p>Your ${verification.verificationType} verification has been approved at the ${level} level.</p>
            <p>You can now receive payouts up to the limits for your verification tier.</p>
          `,
        });
      }
    } catch (error) {
      logger.warn({ err: error }, "Error notifying verification complete:");
    }
  }

  private async notifyVerificationRejected(
    verification: KYCVerification,
  ): Promise<void> {
    try {
      const [user] = await db
        .select({ email: users.email, firstName: users.firstName })
        .from(users)
        .where(eq(users.id, verification.userId))
        .limit(1);

      const metadata = getMetadata(verification);

      if (user?.email) {
        await emailService.sendEmail({
          to: user.email,
          subject: "Identity Verification Update Required",
          html: `
            <h2>Verification Requires Attention</h2>
            <p>Dear ${user.firstName || "User"},</p>
            <p>Your verification was not approved for the following reason:</p>
            <p><em>${metadata.rejectionReason || "Please contact support for details"}</em></p>
            <p>Please log in to your account to submit corrected information.</p>
          `,
        });
      }
    } catch (error) {
      logger.warn({ err: error }, "Error notifying verification rejected:");
    }
  }
}

export const kycService = new KYCService();
