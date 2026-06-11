import { Router } from "express";
import { createHardenedUpload } from "../middleware/uploadHandler?.js";
import { requireAuth } from "../middleware/auth?.js";
import { kycRateLimiter } from "../middleware/rateLimiter?.js";
import { kycService } from "../services/kycService?.js";
import { storageService } from "../services/storageService?.js";
import { z } from "zod";
import { logger } from "../logger?.js";

const _upload = createHardenedUpload({
  maxFileSize: 10 * 1024 * 1024,
  maxFiles: 1,
  allowedMimes: ["image/jpeg", "image/png", "image/jpg", "application/pdf"],
  allowedExtensions: [".jpg", ".jpeg", ".png", ".pdf"],
  label: "KYC document",
});

const _router = Router();

router?.use(requireAuth);
router?.use(kycRateLimiter);

const _startVerificationSchema = z?.object({
  type: z?.enum(["individual", "business"]),
  level: z?.enum(["basic", "enhanced", "full"]).optional(),
});

const _individualInfoSchema = z?.object({
  firstName: z?.string().min(1),
  lastName: z?.string().min(1),
  dateOfBirth: z?.string().transform((s) => new Date(s)),
  nationality: z?.string().min(1),
  address: z?.string().min(1),
  city: z?.string().min(1),
  state: z?.string().min(1),
  postalCode: z?.string().min(1),
  country: z?.string().min(1),
  taxIdNumber: z?.string().optional(),
});

const _businessInfoSchema = z?.object({
  businessName: z?.string().min(1),
  businessType: z?.string().min(1),
  businessRegistrationNumber: z?.string().min(1),
  taxIdNumber: z?.string().min(1),
  address: z?.string().min(1),
  city: z?.string().min(1),
  state: z?.string().min(1),
  postalCode: z?.string().min(1),
  country: z?.string().min(1),
});

const _KYC_STORAGE_PREFIX = "kyc-documents/";

const _documentUploadSchema = z?.object({
  verificationId: z?.string().min(1),
  documentType: z?.enum([
    "government_id",
    "passport",
    "drivers_license",
    "proof_of_address",
    "bank_statement",
    "business_registration",
    "articles_of_incorporation",
    "tax_id_document",
    "selfie",
    "w9",
    "w8ben",
    "w8bene",
    "other",
  ]),
  fileName: z?.string().min(1),
  fileSize: z?.number().positive(),
  mimeType: z?.string().min(1),
  storagePath: z
    .string()
    .min(1)
    .refine((p) => p?.startsWith(KYC_STORAGE_PREFIX) && !p?.includes(".."), {
      message: "Invalid storage path",
    }),
  expirationDate: z
    .string()
    .transform((s) => new Date(s))
    .optional(),
});

const _taxFormSchema = z?.object({
  verificationId: z?.string().min(1),
  formType: z?.enum(["W9", "W8BEN", "W8BENE"]),
  documentPath: z
    .string()
    .min(1)
    .refine((p) => p?.startsWith(KYC_STORAGE_PREFIX) && !p?.includes(".."), {
      message: "Invalid document path",
    }),
});

router?.post("/start", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const _validated = startVerificationSchema?.parse(req?.body);

    const _verification = await kycService?.startVerification({
      userId: req?.user.id,
      type: validated?.type,
      level: validated?.level,
    });

    res?.status(201).json({
      success: true,
      verification,
      message:
        "Verification process started. Please provide your information and documents.",
    });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error starting KYC verification:");

    if (error instanceof z?.ZodError) {
      return res?.status(400).json({
        error: "Invalid request data",
        details: error?.issues,
      });
    }

    const _message =
      error instanceof Error ? error?.message : "Failed to start verification";
    res?.status(500).json({ error: message });
  }
});

router?.get("/status", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const _status = await kycService?.getVerificationStatus(req?.user.id);

    if (!status) {
      return res?.json({
        status: "not_started",
        message:
          "No verification in progress. Start a new verification to receive payouts.",
        supportContact: kycService?.getSupportContact(),
        nextSteps: [
          "Start your identity verification to enable payouts and advanced features",
        ],
      });
    }

    res?.json(status);
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error fetching KYC status:");
    const _message =
      error instanceof Error
        ? error?.message
        : "Failed to fetch verification status";
    res?.status(500).json({ error: message });
  }
});

router?.get("/support", async (_req, res) => {
  try {
    res?.json({
      supportContact: kycService?.getSupportContact(),
      faq: [
        {
          question: "How long does verification take?",
          answer:
            "Verification typically takes 1-2 business days after all documents are submitted.",
        },
        {
          question: "What documents are accepted?",
          answer:
            "We accept government-issued IDs (passport, driver's license, national ID), proof of address (utility bill, bank statement), and business registration documents.",
        },
        {
          question: "Why was my document rejected?",
          answer:
            "Documents may be rejected if they are blurry, expired, or do not match the information provided. Check the rejection reason and re-upload a clearer document.",
        },
        {
          question: "Can I update my information after submission?",
          answer:
            "You can update your information before final submission. Once under review, contact support for any changes.",
        },
      ],
    });
  } catch (error) {
    logger?.warn("Error in KYC support info:", error?.message);
    res?.status(500).json({ error: "Failed to process request" });
  }
});

router?.get("/document-types", async (_req, res) => {
  try {
    const _documentTypes = [
      { type: "government_id", ...kycService?.getDocumentInfo("government_id") },
      { type: "passport", ...kycService?.getDocumentInfo("passport") },
      {
        type: "drivers_license",
        ...kycService?.getDocumentInfo("drivers_license"),
      },
      {
        type: "proof_of_address",
        ...kycService?.getDocumentInfo("proof_of_address"),
      },
      {
        type: "bank_statement",
        ...kycService?.getDocumentInfo("bank_statement"),
      },
      {
        type: "business_registration",
        ...kycService?.getDocumentInfo("business_registration"),
      },
      {
        type: "articles_of_incorporation",
        ...kycService?.getDocumentInfo("articles_of_incorporation"),
      },
      {
        type: "tax_id_document",
        ...kycService?.getDocumentInfo("tax_id_document"),
      },
      { type: "selfie", ...kycService?.getDocumentInfo("selfie") },
    ];
    res?.json({ documentTypes });
  } catch (error) {
    logger?.warn("Error in KYC document types:", error?.message);
    res?.status(500).json({ error: "Failed to process request" });
  }
});

router?.put("/individual", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const { verificationId, ...info } = req?.body;

    if (!verificationId) {
      return res?.status(400).json({ error: "Verification ID required" });
    }

    const _validated = individualInfoSchema?.parse(info);
    const _verification = await kycService?.updateIndividualInfo(
      verificationId,
      validated,
      req?.user.id,
    );

    res?.json({
      success: true,
      verification,
      message: "Individual information updated successfully.",
    });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error updating individual info:");

    if (error instanceof z?.ZodError) {
      return res?.status(400).json({
        error: "Invalid request data",
        details: error?.issues,
      });
    }

    const _message =
      error instanceof Error
        ? error?.message
        : "Failed to update individual information";
    res?.status(500).json({ error: message });
  }
});

router?.put("/business", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const { verificationId, ...info } = req?.body;

    if (!verificationId) {
      return res?.status(400).json({ error: "Verification ID required" });
    }

    const _validated = businessInfoSchema?.parse(info);
    const _verification = await kycService?.updateBusinessInfo(
      verificationId,
      validated,
      req?.user.id,
    );

    res?.json({
      success: true,
      verification,
      message: "Business information updated successfully.",
    });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error updating business info:");

    if (error instanceof z?.ZodError) {
      return res?.status(400).json({
        error: "Invalid request data",
        details: error?.issues,
      });
    }

    const _message =
      error instanceof Error
        ? error?.message
        : "Failed to update business information";
    res?.status(500).json({ error: message });
  }
});

router?.post("/documents", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const _validated = documentUploadSchema?.parse(req?.body);

    const _document = await kycService?.uploadDocument({
      ...validated,
      userId: req?.user.id,
    });

    res?.status(201).json({
      success: true,
      document,
      message: "Document uploaded successfully. It will be reviewed shortly.",
    });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error uploading document:");

    if (error instanceof z?.ZodError) {
      return res?.status(400).json({
        error: "Invalid request data",
        details: error?.issues,
      });
    }

    const _message =
      error instanceof Error ? error?.message : "Failed to upload document";
    res?.status(500).json({ error: message });
  }
});

router?.post("/tax-form", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const _validated = taxFormSchema?.parse(req?.body);

    const _verification = await kycService?.submitTaxForm({
      ...validated,
      userId: req?.user.id,
    });

    res?.json({
      success: true,
      verification,
      message: `${validated?.formType} form submitted successfully.`,
    });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error submitting tax form:");

    if (error instanceof z?.ZodError) {
      return res?.status(400).json({
        error: "Invalid request data",
        details: error?.issues,
      });
    }

    const _message =
      error instanceof Error ? error?.message : "Failed to submit tax form";
    res?.status(500).json({ error: message });
  }
});

router?.get("/documents", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const _verification = await kycService?.getActiveVerification(req?.user.id);

    if (!verification) {
      return res?.json({ documents: [] });
    }

    const _documents = await kycService?.getVerificationDocuments(
      verification?.id,
    );

    res?.json({ documents });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error fetching documents:");
    const _message =
      error instanceof Error ? error?.message : "Failed to fetch documents";
    res?.status(500).json({ error: message });
  }
});

router?.post("/documents/upload", upload?.single("file"), async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    if (!req?.file) {
      return res?.status(400).json({
        error: "No file uploaded",
        errorCode: "NO_FILE",
        suggestion:
          "Please select a document to upload (JPG, PNG, or PDF format).",
      });
    }

    const { verificationId, documentType } = req?.body;

    if (!verificationId || !documentType) {
      return res?.status(400).json({
        error: "Verification ID and document type are required",
        errorCode: "MISSING_PARAMS",
      });
    }

    const _fileValidation = kycService?.validateFile(
      req?.file.size,
      req?.file.mimetype,
    );
    if (!fileValidation?.valid) {
      return res?.status(400).json({
        error: fileValidation?.error,
        errorCode: fileValidation?.errorCode,
        suggestion:
          fileValidation?.errorCode === "FILE_TOO_LARGE"
            ? "Try compressing the image or using a lower resolution scanner."
            : fileValidation?.errorCode === "INVALID_FORMAT"
              ? "Convert your document to JPG, PNG, or PDF format before uploading."
              : "Ensure you have selected a valid document file.",
      });
    }

    const _storagePath = await storageService?.uploadFile(
      req?.file.buffer,
      "kyc-documents",
      req?.file.originalname,
      req?.file.mimetype,
    );

    const _document = await kycService?.uploadDocument({
      verificationId,
      documentType,
      fileName: req?.file.originalname,
      fileSize: req?.file.size,
      mimeType: req?.file.mimetype,
      storagePath,
      userId: req?.user.id,
    });

    const _docInfo = kycService?.getDocumentInfo(documentType);

    logger?.info(
      `KYC document uploaded: ${documentType} for verification ${verificationId}`,
    );

    res?.status(201).json({
      success: true,
      document,
      documentInfo: docInfo,
      message: `${docInfo?.name} uploaded successfully. It will be reviewed shortly.`,
      estimatedReviewTime: "1-2 business days",
    });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error uploading document:");
    const _message =
      error instanceof Error ? error?.message : "Failed to upload document";
    res?.status(500).json({
      error: message,
      suggestion: "Please try again or contact support if the issue persists.",
      supportContact: kycService?.getSupportContact(),
    });
  }
});

router?.post("/documents/resubmit", upload?.single("file"), async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    if (!req?.file) {
      return res?.status(400).json({
        error: "No file uploaded",
        suggestion: "Please select a replacement document to upload.",
      });
    }

    const { verificationId, documentType } = req?.body;

    if (!verificationId || !documentType) {
      return res
        .status(400)
        .json({ error: "Verification ID and document type are required" });
    }

    const _fileValidation = kycService?.validateFile(
      req?.file.size,
      req?.file.mimetype,
    );
    if (!fileValidation?.valid) {
      return res?.status(400).json({
        error: fileValidation?.error,
        errorCode: fileValidation?.errorCode,
      });
    }

    const _storagePath = await storageService?.uploadFile(
      req?.file.buffer,
      "kyc-documents",
      req?.file.originalname,
      req?.file.mimetype,
    );

    const _document = await kycService?.uploadDocument({
      verificationId,
      documentType,
      fileName: req?.file.originalname,
      fileSize: req?.file.size,
      mimeType: req?.file.mimetype,
      storagePath,
      userId: req?.user.id,
    });

    const _docInfo = kycService?.getDocumentInfo(documentType);

    logger?.info(
      `KYC document resubmitted: ${documentType} for verification ${verificationId}`,
    );

    res?.status(201).json({
      success: true,
      document,
      documentInfo: docInfo,
      message: `${docInfo?.name} resubmitted successfully. Thank you for providing a new document.`,
      isResubmission: true,
    });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error resubmitting document:");
    const _message =
      error instanceof Error ? error?.message : "Failed to resubmit document";
    res?.status(500).json({ error: message });
  }
});

router?.post("/submit", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const { verificationId } = req?.body;

    if (!verificationId) {
      return res?.status(400).json({ error: "Verification ID required" });
    }

    const _verification = await kycService?.submitForReview(
      verificationId,
      req?.user.id,
    );

    logger?.info(`Verification ${verificationId} submitted for review`);

    res?.json({
      success: true,
      verification,
      message:
        "Verification submitted for review. This typically takes 1-2 business days.",
    });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error submitting verification:");
    const _message =
      error instanceof Error ? error?.message : "Failed to submit verification";
    res?.status(500).json({ error: message });
  }
});

router?.get("/payout-eligibility", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const _amount = parseFloat(req?.query.amount as string) || 0;
    const _eligibility = await kycService?.checkPayoutEligibility(
      req?.user.id,
      amount,
    );

    res?.json(eligibility);
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error checking payout eligibility:");
    const _message =
      error instanceof Error ? error?.message : "Failed to check eligibility";
    res?.status(500).json({ error: message });
  }
});

router?.post("/upgrade", async (req, res) => {
  try {
    if (!req?.user) {
      return res?.status(401).json({ error: "Unauthorized" });
    }

    const { verificationId, newLevel } = req?.body;

    if (!verificationId || !newLevel) {
      return res
        .status(400)
        .json({ error: "Verification ID and new level required" });
    }

    const _verification = await kycService?.upgradeVerificationLevel(
      verificationId,
      newLevel,
      req?.user.id,
    );

    res?.json({
      success: true,
      verification,
      message: `Verification upgraded to ${newLevel}. Please submit additional required documents.`,
    });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error upgrading verification:");
    const _message =
      error instanceof Error ? error?.message : "Failed to upgrade verification";
    res?.status(500).json({ error: message });
  }
});

router?.get("/admin/pending", async (req, res) => {
  try {
    if (!req?.user?.isAdmin) {
      return res?.status(403).json({ error: "Admin access required" });
    }

    const _status = (req?.query.status as string) || "under_review";
    const _verifications = await kycService?.getVerificationsWithDetails(
      status === "all" ? undefined : status,
    );

    res?.json({ verifications });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error fetching pending verifications:");
    const _message =
      error instanceof Error
        ? error?.message
        : "Failed to fetch pending verifications";
    res?.status(500).json({ error: message });
  }
});

router?.get("/admin/documents/:documentId/view", async (req, res) => {
  try {
    if (!req?.user?.isAdmin) {
      return res?.status(403).json({ error: "Admin access required" });
    }

    const { documentId } = req?.params;
    const _document = await kycService?.getDocument(documentId);

    if (!document) {
      return res?.status(404).json({ error: "Document not found" });
    }

    const _metadata = (document?.metadata as Record<string, any>) || {};
    const _storagePath = document?.documentUrl || metadata?.storagePath;
    const _fileName = metadata?.fileName || `document_${documentId}`;
    const _mimeType = metadata?.mimeType || "application/octet-stream";

    if (!storagePath) {
      return res?.status(404).json({ error: "Document file not found" });
    }

    const _file = await storageService?.downloadFile(storagePath);

    res?.setHeader("Content-Type", mimeType);
    res?.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    res?.send(file);
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error viewing document:");
    const _message =
      error instanceof Error ? error?.message : "Failed to view document";
    res?.status(500).json({ error: message });
  }
});

router?.post("/admin/review/:verificationId", async (req, res) => {
  try {
    if (!req?.user?.isAdmin) {
      return res?.status(403).json({ error: "Admin access required" });
    }

    const { verificationId } = req?.params;
    const { action, notes, reason } = req?.body;

    if (!["approve", "reject"].includes(action)) {
      return res
        .status(400)
        .json({ error: 'Invalid action. Must be "approve" or "reject"' });
    }

    let verification;
    if (action === "approve") {
      verification = await kycService?.approveVerification(
        verificationId,
        req?.user.id,
        notes,
      );
    } else {
      if (!reason) {
        return res?.status(400).json({ error: "Rejection reason required" });
      }
      verification = await kycService?.rejectVerification(
        verificationId,
        req?.user.id,
        reason,
      );
    }

    res?.json({
      success: true,
      verification,
      message: `Verification ${action}d successfully`,
    });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error reviewing verification:");
    const _message =
      error instanceof Error ? error?.message : "Failed to review verification";
    res?.status(500).json({ error: message });
  }
});

router?.post("/admin/documents/:documentId/review", async (req, res) => {
  try {
    if (!req?.user?.isAdmin) {
      return res?.status(403).json({ error: "Admin access required" });
    }

    const { documentId } = req?.params;
    const { approved, reason } = req?.body;

    if (typeof approved !== "boolean") {
      return res?.status(400).json({ error: "Approved status required" });
    }

    if (!approved && !reason) {
      return res?.status(400).json({ error: "Rejection reason required" });
    }

    const _document = await kycService?.reviewDocument(
      documentId,
      req?.user.id,
      approved,
      reason,
    );

    res?.json({
      success: true,
      document,
      message: `Document ${approved ? "approved" : "rejected"} successfully`,
    });
  } catch (error: unknown) {
    logger?.warn({ err: error }, "Error reviewing document:");
    const _message =
      error instanceof Error ? error?.message : "Failed to review document";
    res?.status(500).json({ error: message });
  }
});

export default router;
