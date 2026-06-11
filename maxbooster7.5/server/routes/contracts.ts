import { Router, Request, Response, NextFunction } from "express";
import {
  contractTemplateService,
  ContractVariables,
} from "../services/contractTemplateService";
import { invoiceService } from "../services/invoiceService";
import { taxFormService, TaxpayerInfo } from "../services/taxFormService";
import { logger } from "../logger.js";
import crypto from "crypto";
import { randomBytes } from "crypto";
import { db } from "../db";
import {
  marketplaceDisputes,
  users,
  contractTemplates,
  splitSheets,
} from "@shared/schema";
import { eq, and, or, desc, notInArray, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";

interface SplitParticipant {
  userId: string;
  name: string;
  email: string;
  role: string;
  splitPercentage: number;
}

const router = Router();

router.get("/templates", requireAuth, async (req: Request, res: Response) => {
  try {
    const builtInTemplates = contractTemplateService.getTemplates();
    const { category } = req.query;
    const userId = req.user?.id;

    let userCustomTemplates: Record<string, unknown>[] = [];
    if (userId) {
      try {
        const dbTemplates = await db
          .select()
          .from(contractTemplates)
          .where(
            and(
              eq(contractTemplates.userId, userId),
              eq(contractTemplates.isDefault, false),
            ),
          )
          .limit(50);
        userCustomTemplates = dbTemplates.map((t) => ({
          id: t.id,
          type: t.content as string,
          name: t.name,
          description: t.description || "",
          category: t.category || "Custom",
          variables: Array.isArray(t.variables) ? t.variables : [],
          isPremium: false,
          isCustom: true,
        }));
      } catch (e) {
        logger.warn(
          { err: e },
          "Failed to fetch user custom contract templates:",
        );
      }
    }

    const allTemplates = [...builtInTemplates, ...userCustomTemplates];

    if (category) {
      const filtered = allTemplates.filter((t) => t.category === category);
      return res.json({ templates: filtered });
    }

    const categories = [...new Set(allTemplates.map((t) => t.category))];
    return res.json({ templates: allTemplates, categories });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching contract templates:");
    res.status(500).json({ error: "Failed to fetch templates" });
  }
});

router.get(
  "/templates/:templateId",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { templateId } = req.params;
      const template = contractTemplateService.getTemplateById(templateId);

      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      return res.json(template);
    } catch (error) {
      logger.warn({ err: error }, "Error fetching template:");
      res.status(500).json({ error: "Failed to fetch template" });
    }
  },
);

router.post(
  "/templates/custom",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { name, description, content, category, variables } = req.body;

      if (!name || !content) {
        return res.status(400).json({ error: "name and content are required" });
      }

      const [created] = await db
        .insert(contractTemplates)
        .values({
          userId,
          name,
          description: description || "",
          content,
          category: category || "Custom",
          variables: variables || [],
          isDefault: false,
        })
        .returning();

      return res.status(201).json(created);
    } catch (error) {
      logger.warn({ err: error }, "Error creating custom contract template:");
      res.status(500).json({ error: "Failed to create template" });
    }
  },
);

router.put(
  "/templates/custom/:templateId",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { templateId } = req.params;
      const updates = req.body;

      const [updated] = await db
        .update(contractTemplates)
        .set({ ...updates, updatedAt: new Date() })
        .where(
          and(
            eq(contractTemplates.id, templateId),
            eq(contractTemplates.userId, userId),
          ),
        )
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Template not found" });
      }

      return res.json(updated);
    } catch (error) {
      logger.warn({ err: error }, "Error updating custom contract template:");
      res.status(500).json({ error: "Failed to update template" });
    }
  },
);

router.delete(
  "/templates/custom/:templateId",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { templateId } = req.params;

      const [deleted] = await db
        .delete(contractTemplates)
        .where(
          and(
            eq(contractTemplates.id, templateId),
            eq(contractTemplates.userId, userId),
            eq(contractTemplates.isDefault, false),
          ),
        )
        .returning();

      if (!deleted) {
        return res.status(404).json({
          error: "Template not found or cannot delete default templates",
        });
      }

      return res.json({ success: true });
    } catch (error) {
      logger.warn({ err: error }, "Error deleting custom contract template:");
      res.status(500).json({ error: "Failed to delete template" });
    }
  },
);

router.post("/generate", requireAuth, async (req: Request, res: Response) => {
  try {
    await contractTemplateService.waitForInit();
    const { templateId, variables } = req.body;

    if (!templateId) {
      return res.status(400).json({ error: "templateId is required" });
    }

    const contract = contractTemplateService.generateContract(
      templateId,
      variables as ContractVariables,
      req.user!.id,
    );

    return res.status(201).json(contract);
  } catch (error) {
    logger.warn({ err: error }, "Error generating contract:");
    res.status(500).json({ error: "Failed to generate contract" });
  }
});

router.get(
  "/my-contracts",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      await contractTemplateService.waitForInit();
      const userId = req.user!.id;
      const contracts = contractTemplateService.getContractsByUser(userId);
      return res.json({ contracts });
    } catch (error) {
      logger.warn({ err: error }, "Error fetching user contracts:");
      res.status(500).json({ error: "Failed to fetch contracts" });
    }
  },
);

router.get("/my", requireAuth, async (req: Request, res: Response) => {
  try {
    await contractTemplateService.waitForInit();
    const contracts = contractTemplateService.getContractsByUser(req.user!.id);
    return res.json({ contracts });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching user contracts:");
    res.status(500).json({ error: "Failed to fetch contracts" });
  }
});

router.get("/tax-rates", async (req: Request, res: Response) => {
  try {
    const { country, state } = req.query;

    if (!country) {
      return res.status(400).json({ error: "country is required" });
    }

    const rates = invoiceService.getTaxRates(
      country as string,
      state as string,
    );
    return res.json({ rates });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching tax rates:");
    res.status(500).json({ error: "Failed to fetch tax rates" });
  }
});

router.get("/marketplace-disputes", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
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
        .orderBy(desc(marketplaceDisputes.createdAt))
        .limit(200);
    } else {
      disputes = await db
        .select()
        .from(marketplaceDisputes)
        .where(
          or(
            eq(marketplaceDisputes.buyerId, userId),
            eq(marketplaceDisputes.sellerId, userId),
          ),
        )
        .orderBy(desc(marketplaceDisputes.createdAt))
        .limit(100);
    }

    if (status && typeof status === "string") {
      disputes = disputes.filter((d) => d.status === status);
    }

    return res.json({ disputes });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching marketplace disputes:");
    res.status(500).json({ error: "Failed to fetch disputes" });
  }
});

router.get("/:contractId", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { contractId } = req.params;
    const contract = contractTemplateService.getContract(contractId);

    if (!contract) {
      return res.status(404).json({ error: "Contract not found" });
    }

    return res.json(contract);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching contract:");
    res.status(500).json({ error: "Failed to fetch contract" });
  }
});

router.post("/:contractId/sign", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { contractId } = req.params;
    const { partyName, signature } = req.body;

    if (!partyName) {
      return res.status(400).json({ error: "partyName is required" });
    }

    const signatureHash = crypto
      .createHash("sha256")
      .update(
        `${signature || "electronic-signature"}-${Date.now()}-${req.user!.id}`,
      )
      .digest("hex");

    const ipAddress = req.ip || req.socket.remoteAddress || "unknown";

    const contract = await contractTemplateService.signContract(
      contractId,
      partyName,
      {
        signatureHash,
        ipAddress,
      },
    );

    return res.json(contract);
  } catch (error) {
    logger.warn({ err: error }, "Error signing contract:");
    res.status(500).json({ error: "Failed to sign contract" });
  }
});

router.get("/:contractId/pdf", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { contractId } = req.params;
    const pdfBuffer = contractTemplateService.generatePDF(contractId);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="contract-${contractId}.pdf"`,
    );
    return res.send(pdfBuffer);
  } catch (error) {
    logger.warn({ err: error }, "Error generating contract PDF:");
    res.status(500).json({ error: "Failed to generate PDF" });
  }
});

router.post("/validate", requireAuth, async (req: Request, res: Response) => {
  try {
    const { templateId, variables } = req.body;

    if (!templateId) {
      return res.status(400).json({ error: "templateId is required" });
    }

    const validation = contractTemplateService.validateContractVariables(
      templateId,
      variables as ContractVariables,
    );

    return res.json({
      outcome: validation.valid ? "validation_passed" : "validation_errors",
      ...validation,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error validating contract:");
    res.status(500).json({ error: "Failed to validate contract" });
  }
});

router.post("/preview", requireAuth, async (req: Request, res: Response) => {
  try {
    const { templateId, variables } = req.body;

    if (!templateId) {
      return res.status(400).json({ error: "templateId is required" });
    }

    const content = contractTemplateService.getContractPreview(
      templateId,
      variables as ContractVariables,
    );

    return res.json({
      outcome: "preview_generated",
      content,
    });
  } catch (error) {
    logger.warn({ err: error }, "Error generating preview:");
    res.status(500).json({ error: "Failed to generate preview" });
  }
});

router.patch(
  "/:contractId/draft",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { contractId } = req.params;
      const { variables } = req.body;

      const contract = contractTemplateService.updateContractDraft(
        contractId,
        variables,
      );

      return res.json({
        outcome: "contract_customization_saved",
        contract,
      });
    } catch (error) {
      logger.warn({ err: error }, "Error updating contract draft:");
      res.status(500).json({ error: "Failed to update contract draft" });
    }
  },
);

router.post(
  "/:contractId/send-for-signature",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { contractId } = req.params;

      const contract = contractTemplateService.sendForSignature(contractId);

      return res.json({
        outcome: "signature_requested",
        message: "Contract sent for signature",
        contract,
      });
    } catch (error) {
      logger.warn({ err: error }, "Error sending for signature:");
      res.status(500).json({ error: "Failed to send for signature" });
    }
  },
);

router.get(
  "/:contractId/signature-status",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { contractId } = req.params;

      const status = contractTemplateService.getSignatureStatus(contractId);

      let outcome = "signature_pending";
      if (status.allSigned) {
        outcome = "contract_executed";
      } else if (status.signed > 0) {
        outcome = "partially_signed";
      }

      return res.json({
        outcome,
        ...status,
      });
    } catch (error) {
      logger.warn({ err: error }, "Error getting signature status:");
      res.status(500).json({ error: "Failed to get signature status" });
    }
  },
);

router.post(
  "/:contractId/decline",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { contractId } = req.params;
      const { partyName, reason } = req.body;

      if (!partyName || !reason) {
        return res
          .status(400)
          .json({ error: "partyName and reason are required" });
      }

      const contract = contractTemplateService.declineSignature(
        contractId,
        partyName,
        reason,
      );

      return res.json({
        outcome: "signature_declined",
        reason,
        contract,
      });
    } catch (error) {
      logger.warn({ err: error }, "Error declining signature:");
      res.status(500).json({ error: "Failed to decline signature" });
    }
  },
);

router.post(
  "/:contractId/void",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { contractId } = req.params;
      const { reason } = req.body;

      const contract = contractTemplateService.voidContract(
        contractId,
        reason || "No reason provided",
      );

      return res.json({
        outcome: "contract_terminated",
        contract,
      });
    } catch (error) {
      logger.warn({ err: error }, "Error voiding contract:");
      res.status(500).json({ error: "Failed to void contract" });
    }
  },
);

router.get(
  "/:contractId/timeline",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { contractId } = req.params;

      const timeline = contractTemplateService.getContractTimeline(contractId);

      return res.json({
        outcome: "timeline_loaded",
        timeline,
      });
    } catch (error) {
      logger.warn({ err: error }, "Error getting contract timeline:");
      res.status(500).json({ error: "Failed to get timeline" });
    }
  },
);

router.get(
  "/stats/summary",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const stats = contractTemplateService.getContractStats(req.user!.id);

      return res.json({
        outcome: "stats_loaded",
        stats,
      });
    } catch (error) {
      logger.warn({ err: error }, "Error getting contract stats:");
      res.status(500).json({ error: "Failed to get contract stats" });
    }
  },
);

router.get("/invoices/list", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const invoices = invoiceService.getInvoicesByUser(req.user!.id);
    const summary = invoiceService.getInvoiceSummary(req.user!.id);

    return res.json({ invoices, summary });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching invoices:");
    res.status(500).json({ error: "Failed to fetch invoices" });
  }
});

router.post("/invoices/create", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const {
      from,
      to,
      lineItems,
      currency,
      dueDate,
      notes,
      terms,
      discount,
      discountType,
      applyTax,
    } = req.body;

    if (!from || !to || !lineItems || lineItems.length === 0) {
      return res
        .status(400)
        .json({ error: "from, to, and lineItems are required" });
    }

    const invoice = invoiceService.createInvoice({
      userId: req.user!.id,
      type: "sale",
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
  } catch (error) {
    logger.warn({ err: error }, "Error creating invoice:");
    res.status(500).json({ error: "Failed to create invoice" });
  }
});

router.get("/invoices/:invoiceId", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { invoiceId } = req.params;
    const invoice = invoiceService.getInvoice(invoiceId);

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    if (invoice.userId !== req.user!.id) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    return res.json(invoice);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching invoice:");
    res.status(500).json({ error: "Failed to fetch invoice" });
  }
});

router.patch(
  "/invoices/:invoiceId/status",
  async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { invoiceId } = req.params;
      const { status, paymentMethod } = req.body;

      if (!status) {
        return res.status(400).json({ error: "status is required" });
      }

      const existing = invoiceService.getInvoice(invoiceId);
      if (!existing || existing.userId !== req.user!.id) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      const invoice = invoiceService.updateInvoiceStatus(invoiceId, status, {
        paidDate: status === "paid" ? new Date() : undefined,
        paymentMethod,
      });

      return res.json(invoice);
    } catch (error) {
      logger.warn({ err: error }, "Error updating invoice status:");
      res.status(500).json({ error: "Failed to update invoice status" });
    }
  },
);

router.get("/invoices/:invoiceId/pdf", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { invoiceId } = req.params;
    const invoiceCheck = invoiceService.getInvoice(invoiceId);
    if (!invoiceCheck || invoiceCheck.userId !== req.user!.id) {
      return res.status(404).json({ error: "Invoice not found" });
    }
    const pdfBuffer = invoiceService.generatePDF(invoiceId);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="invoice-${invoiceId}.pdf"`,
    );
    return res.send(pdfBuffer);
  } catch (error) {
    logger.warn({ err: error }, "Error generating invoice PDF:");
    res.status(500).json({ error: "Failed to generate PDF" });
  }
});

router.get("/invoices/overdue/list", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const overdueInvoices = invoiceService.getOverdueInvoices(req.user!.id);
    return res.json({ invoices: overdueInvoices });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching overdue invoices:");
    res.status(500).json({ error: "Failed to fetch overdue invoices" });
  }
});

router.get("/tax-forms/available", async (req: Request, res: Response) => {
  try {
    const availableForms = taxFormService.getAvailableForms();
    return res.json({ forms: availableForms });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching available tax forms:");
    res.status(500).json({ error: "Failed to fetch available forms" });
  }
});

router.get("/tax-forms/list", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { taxYear } = req.query;
    let forms;

    if (taxYear) {
      forms = taxFormService.getTaxFormsByYear(
        req.user!.id,
        parseInt(taxYear as string),
      );
    } else {
      forms = taxFormService.getTaxFormsByUser(req.user!.id);
    }

    return res.json({ forms });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching tax forms:");
    res.status(500).json({ error: "Failed to fetch tax forms" });
  }
});

router.post("/tax-forms/generate", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { formType, taxpayerInfo, recipientInfo, taxYear, amounts } =
      req.body;

    if (!formType || !taxpayerInfo) {
      return res
        .status(400)
        .json({ error: "formType and taxpayerInfo are required" });
    }

    let form;

    switch (formType) {
      case "W-9":
        form = taxFormService.generateW9(
          req.user!.id,
          taxpayerInfo as TaxpayerInfo,
        );
        break;
      case "W-8BEN":
        form = taxFormService.generateW8BEN(
          req.user!.id,
          taxpayerInfo as TaxpayerInfo,
        );
        break;
      case "1099-NEC":
        if (!recipientInfo || !amounts) {
          return res.status(400).json({
            error: "recipientInfo and amounts are required for 1099-NEC",
          });
        }
        form = taxFormService.generate1099NEC(
          req.user!.id,
          taxpayerInfo,
          recipientInfo,
          taxYear || new Date().getFullYear(),
          amounts,
        );
        break;
      case "1099-MISC":
        if (!recipientInfo || !amounts) {
          return res.status(400).json({
            error: "recipientInfo and amounts are required for 1099-MISC",
          });
        }
        form = taxFormService.generate1099MISC(
          req.user!.id,
          taxpayerInfo,
          recipientInfo,
          taxYear || new Date().getFullYear(),
          amounts,
        );
        break;
      case "1099-K":
        if (!recipientInfo || !amounts) {
          return res.status(400).json({
            error: "recipientInfo and amounts are required for 1099-K",
          });
        }
        form = taxFormService.generate1099K(
          req.user!.id,
          taxpayerInfo,
          recipientInfo,
          taxYear || new Date().getFullYear(),
          amounts,
        );
        break;
      default:
        return res
          .status(400)
          .json({ error: `Unsupported form type: ${formType}` });
    }

    return res.status(201).json(form);
  } catch (error) {
    logger.warn({ err: error }, "Error generating tax form:");
    res.status(500).json({ error: "Failed to generate tax form" });
  }
});

router.get("/tax-forms/:formId", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { formId } = req.params;
    const form = taxFormService.getTaxForm(formId);

    if (!form) {
      return res.status(404).json({ error: "Tax form not found" });
    }

    return res.json(form);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching tax form:");
    res.status(500).json({ error: "Failed to fetch tax form" });
  }
});

router.post("/tax-forms/:formId/sign", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { formId } = req.params;
    const { signature } = req.body;

    const signatureHash = crypto
      .createHash("sha256")
      .update(
        `${signature || "electronic-signature"}-${Date.now()}-${req.user!.id}`,
      )
      .digest("hex");

    const form = taxFormService.signTaxForm(formId, signatureHash);
    return res.json(form);
  } catch (error) {
    logger.warn({ err: error }, "Error signing tax form:");
    res.status(500).json({ error: "Failed to sign tax form" });
  }
});

router.get("/tax-forms/:formId/pdf", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { formId } = req.params;
    const form = taxFormService.getTaxForm(formId);

    if (!form) {
      return res.status(404).json({ error: "Tax form not found" });
    }

    let pdfBuffer: Buffer;

    switch (form.formType) {
      case "W-9":
        pdfBuffer = taxFormService.generateW9PDF(formId);
        break;
      case "W-8BEN":
        pdfBuffer = taxFormService.generateW8BENPDF(formId);
        break;
      case "1099-NEC":
      case "1099-MISC":
      case "1099-K":
        pdfBuffer = taxFormService.generate1099PDF(formId);
        break;
      default:
        return res
          .status(400)
          .json({ error: "PDF generation not supported for this form type" });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${form.formType}-${formId}.pdf"`,
    );
    return res.send(pdfBuffer);
  } catch (error) {
    logger.warn({ err: error }, "Error generating tax form PDF:");
    res.status(500).json({ error: "Failed to generate PDF" });
  }
});

router.post(
  "/tax-forms/calculate-withholding",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const {
        grossAmount,
        isUSPerson,
        country,
        hasTreatyBenefits,
        hasValidW9,
        hasBackupWithholding,
      } = req.body;

      if (grossAmount === undefined) {
        return res.status(400).json({ error: "grossAmount is required" });
      }

      const calculation = taxFormService.calculateWithholding(
        grossAmount,
        isUSPerson ?? true,
        country,
        hasTreatyBenefits,
        hasValidW9,
        hasBackupWithholding,
      );

      return res.json(calculation);
    } catch (error) {
      logger.warn({ err: error }, "Error calculating withholding:");
      res.status(500).json({ error: "Failed to calculate withholding" });
    }
  },
);

router.get(
  "/tax-forms/summary/:taxYear",
  async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Unauthorized" });
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
          return res
            .status(400)
            .json({ error: "Invalid earnings data format" });
        }
      }

      const summary = taxFormService.generateTaxSummary(
        req.user!.id,
        parseInt(taxYear),
        earningsData,
      );
      return res.json(summary);
    } catch (error) {
      logger.warn({ err: error }, "Error generating tax summary:");
      res.status(500).json({ error: "Failed to generate tax summary" });
    }
  },
);

router.get(
  "/tax-forms/summary/:taxYear/pdf",
  async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { taxYear } = req.params;

      const summary = taxFormService.generateTaxSummary(
        req.user!.id,
        parseInt(taxYear),
        [],
      );
      const pdfBuffer = taxFormService.generateTaxSummaryPDF(summary);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="tax-summary-${taxYear}.pdf"`,
      );
      return res.send(pdfBuffer);
    } catch (error) {
      logger.warn({ err: error }, "Error generating tax summary PDF:");
      res.status(500).json({ error: "Failed to generate PDF" });
    }
  },
);

router.get("/split-sheets/list", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = req.user!.id;
    const rows = await db
      .select()
      .from(splitSheets)
      .where(
        or(
          eq(splitSheets.creatorId, userId),
          sql`${splitSheets.participants} @> ${JSON.stringify([{ userId }])}::jsonb`,
        ),
      )
      .orderBy(desc(splitSheets.createdAt))
      .limit(100);

    return res.json({ splitSheets: rows });
  } catch (error) {
    logger.warn({ err: error }, "Error fetching split sheets:");
    res.status(500).json({ error: "Failed to fetch split sheets" });
  }
});

router.post("/split-sheets/create", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { releaseId, contractName, participants, effectiveDate } = req.body;

    if (
      !releaseId ||
      !contractName ||
      !participants ||
      participants.length === 0
    ) {
      return res.status(400).json({
        error: "releaseId, contractName, and participants are required",
      });
    }

    const totalSplit = participants.reduce(
      (sum: number, p: SplitParticipant) => sum + p.splitPercentage,
      0,
    );
    if (Math.abs(totalSplit - 100) > 0.01) {
      return res
        .status(400)
        .json({ error: "Split percentages must total 100%" });
    }

    const signatures = participants.map((p: SplitParticipant) => ({
      userId: p.userId,
    }));

    const [inserted] = await db
      .insert(splitSheets)
      .values({
        releaseId,
        creatorId: req.user!.id,
        contractName,
        participants,
        status: "pending_signature",
        effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
        signatures,
      })
      .returning();

    return res.status(201).json(inserted);
  } catch (error) {
    logger.warn({ err: error }, "Error creating split sheet:");
    res.status(500).json({ error: "Failed to create split sheet" });
  }
});

router.get("/split-sheets/:contractId", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { contractId } = req.params;
    const [contract] = await db
      .select()
      .from(splitSheets)
      .where(eq(splitSheets.id, contractId))
      .limit(1);

    if (!contract) {
      return res.status(404).json({ error: "Split sheet not found" });
    }

    return res.json(contract);
  } catch (error) {
    logger.warn({ err: error }, "Error fetching split sheet:");
    res.status(500).json({ error: "Failed to fetch split sheet" });
  }
});

router.post(
  "/split-sheets/:contractId/sign",
  async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { contractId } = req.params;
      const { signature } = req.body;
      const userId = req.user!.id;

      const [contract] = await db
        .select()
        .from(splitSheets)
        .where(eq(splitSheets.id, contractId))
        .limit(1);

      if (!contract) {
        return res.status(404).json({ error: "Split sheet not found" });
      }

      const signatures = contract.signatures as Array<{
        userId: string;
        signedAt?: string;
        signatureHash?: string;
      }>;
      const sigIndex = signatures.findIndex((s) => s.userId === userId);

      if (sigIndex === -1) {
        return res
          .status(403)
          .json({ error: "You are not a participant in this split sheet" });
      }

      const signatureHash = crypto
        .createHash("sha256")
        .update(
          `${signature || "electronic-signature"}-${Date.now()}-${userId}`,
        )
        .digest("hex");

      signatures[sigIndex] = {
        userId,
        signedAt: new Date().toISOString(),
        signatureHash,
      };

      const allSigned = signatures.every((s) => s.signedAt);
      const newStatus = allSigned ? "active" : contract.status;

      const [updated] = await db
        .update(splitSheets)
        .set({
          signatures,
          status: newStatus,
          updatedAt: new Date(),
        })
        .where(eq(splitSheets.id, contractId))
        .returning();

      return res.json(updated);
    } catch (error) {
      logger.warn({ err: error }, "Error signing split sheet:");
      res.status(500).json({ error: "Failed to sign split sheet" });
    }
  },
);

router.post(
  "/split-sheets/:contractId/add-participant",
  async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { contractId } = req.params;
      const { userId, name, email, role, splitPercentage } = req.body;

      if (
        !userId ||
        !name ||
        !email ||
        !role ||
        splitPercentage === undefined
      ) {
        return res.status(400).json({
          error: "userId, name, email, role, and splitPercentage are required",
        });
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Invalid email address format" });
      }

      const [contract] = await db
        .select()
        .from(splitSheets)
        .where(eq(splitSheets.id, contractId))
        .limit(1);

      if (!contract) {
        return res.status(404).json({ error: "Split sheet not found" });
      }

      if (contract.creatorId !== req.user!.id) {
        return res
          .status(403)
          .json({ error: "Only the creator can add participants" });
      }

      const participants = contract.participants as SplitParticipant[];
      participants.push({ userId, name, email, role, splitPercentage });

      const signatures = contract.signatures as Array<{ userId: string }>;
      signatures.push({ userId });

      const [updated] = await db
        .update(splitSheets)
        .set({
          participants,
          signatures,
          status: "pending_signature",
          updatedAt: new Date(),
        })
        .where(eq(splitSheets.id, contractId))
        .returning();

      return res.json(updated);
    } catch (error) {
      logger.warn({ err: error }, "Error adding participant:");
      res.status(500).json({ error: "Failed to add participant" });
    }
  },
);

router.post(
  "/split-sheets/validate",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { participants } = req.body;

      if (!participants || !Array.isArray(participants)) {
        return res
          .status(400)
          .json({ error: "participants array is required" });
      }

      const totalSplit = participants.reduce(
        (sum: number, p: Record<string, unknown>) =>
          sum + (p.splitPercentage || 0),
        0,
      );
      const isValid = Math.abs(totalSplit - 100) <= 0.01;

      return res.json({
        valid: isValid,
        totalPercentage: totalSplit,
        message: isValid
          ? "Splits are valid"
          : "Splits must total exactly 100%",
      });
    } catch (error) {
      logger.warn({ err: error }, "Error validating splits:");
      res.status(500).json({ error: "Failed to validate splits" });
    }
  },
);

// =========================================
// MARKETPLACE DISPUTE HANDLING
// =========================================

const VALID_DISPUTE_TYPES = [
  "license_issue",
  "quality_issue",
  "non_delivery",
  "unauthorized_use",
  "refund_request",
  "other",
];
const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ["under_review", "closed"],
  under_review: [
    "pending_seller_response",
    "pending_buyer_response",
    "resolved",
    "escalated",
    "closed",
  ],
  pending_seller_response: ["under_review", "resolved", "escalated", "closed"],
  pending_buyer_response: ["under_review", "resolved", "escalated", "closed"],
  escalated: ["resolved", "closed"],
  resolved: ["closed"],
  closed: [],
};

const isAdminUser = (user: Record<string, unknown>): boolean => {
  return user?.role === "admin" || user?.role === "superadmin";
};

const canAccessDispute = (
  dispute: Record<string, unknown>,
  userId: string,
  userRole: string | null,
): boolean => {
  return (
    dispute.buyerId === userId ||
    dispute.sellerId === userId ||
    userRole === "admin" ||
    userRole === "superadmin"
  );
};

router.post("/marketplace-disputes", async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { orderId, sellerId, disputeType, subject, description, evidence } =
      req.body;

    if (!orderId || !disputeType || !subject || !description) {
      return res.status(400).json({
        error: "orderId, disputeType, subject, and description are required",
      });
    }

    if (!VALID_DISPUTE_TYPES.includes(disputeType)) {
      return res.status(400).json({
        error: `Invalid dispute type. Valid types: ${VALID_DISPUTE_TYPES.join(", ")}`,
      });
    }

    if (subject.length > 200) {
      return res
        .status(400)
        .json({ error: "Subject must be 200 characters or less" });
    }

    if (description.length > 5000) {
      return res
        .status(400)
        .json({ error: "Description must be 5000 characters or less" });
    }

    const existingDisputes = await db
      .select()
      .from(marketplaceDisputes)
      .where(
        and(
          eq(marketplaceDisputes.orderId, orderId),
          notInArray(marketplaceDisputes.status, ["resolved", "closed"]),
        ),
      )
      .limit(10);

    if (existingDisputes.length > 0) {
      return res.status(400).json({
        error: "An open dispute already exists for this order",
        disputeId: existingDisputes[0].id,
      });
    }

    const now = new Date();
    const initialEvidence = (evidence || []).map(
      (e: Record<string, unknown>) => ({
        type: e.type || "document",
        url: e.url,
        uploadedAt: now.toISOString(),
        uploadedBy: req.user!.id,
      }),
    );

    const initialMessages = [
      {
        from: "system",
        message: "Dispute created. Our team will review within 24-48 hours.",
        sentAt: now.toISOString(),
        type: "system" as const,
      },
    ];

    const [dispute] = await db
      .insert(marketplaceDisputes)
      .values({
        orderId,
        buyerId: req.user!.id,
        sellerId: sellerId || "",
        disputeType,
        status: "open",
        subject,
        description,
        evidence: initialEvidence,
        messages: initialMessages,
      })
      .returning();

    logger.info(
      `Marketplace dispute ${dispute.id} created for order ${orderId} by user ${req.user!.id}`,
    );

    return res.status(201).json({
      dispute,
      message:
        "Dispute created successfully. We will review your case shortly.",
    });
  } catch (error) {
    logger.warn({ err: error }, "Error creating marketplace dispute:");
    res.status(500).json({ error: "Failed to create dispute" });
  }
});

router.get(
  "/marketplace-disputes/:disputeId",
  async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { disputeId } = req.params;
      const [dispute] = await db
        .select()
        .from(marketplaceDisputes)
        .where(eq(marketplaceDisputes.id, disputeId))
        .limit(1);

      if (!dispute) {
        return res.status(404).json({ error: "Dispute not found" });
      }

      if (!canAccessDispute(dispute, req.user!.id, req.user!.role)) {
        return res
          .status(403)
          .json({ error: "Not authorized to view this dispute" });
      }

      return res.json({ dispute });
    } catch (error) {
      logger.warn({ err: error }, "Error fetching dispute:");
      res.status(500).json({ error: "Failed to fetch dispute" });
    }
  },
);

router.post(
  "/marketplace-disputes/:disputeId/message",
  async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { disputeId } = req.params;
      const { message } = req.body;

      if (!message || message.trim().length === 0) {
        return res.status(400).json({ error: "Message is required" });
      }

      if (message.length > 2000) {
        return res
          .status(400)
          .json({ error: "Message must be 2000 characters or less" });
      }

      const [dispute] = await db
        .select()
        .from(marketplaceDisputes)
        .where(eq(marketplaceDisputes.id, disputeId))
        .limit(1);

      if (!dispute) {
        return res.status(404).json({ error: "Dispute not found" });
      }

      if (!canAccessDispute(dispute, req.user!.id, req.user!.role)) {
        return res
          .status(403)
          .json({ error: "Not authorized to message on this dispute" });
      }

      if (["resolved", "closed"].includes(dispute.status || "")) {
        return res.status(400).json({
          error: "Cannot add messages to a resolved or closed dispute",
        });
      }

      const isAdmin = isAdminUser(req.user);
      const newMessage = {
        from: req.user!.id,
        message: message.trim(),
        sentAt: new Date().toISOString(),
        type: isAdmin ? ("admin" as const) : ("user" as const),
      };

      const updatedMessages = [...(dispute.messages || []), newMessage];
      let newStatus = dispute.status;

      if (
        dispute.status === "pending_seller_response" &&
        dispute.sellerId === req.user!.id
      ) {
        newStatus = "under_review";
        updatedMessages.push({
          from: "system",
          message: "Seller has responded. Dispute is under review.",
          sentAt: new Date().toISOString(),
          type: "system" as const,
        });
      } else if (
        dispute.status === "pending_buyer_response" &&
        dispute.buyerId === req.user!.id
      ) {
        newStatus = "under_review";
        updatedMessages.push({
          from: "system",
          message: "Buyer has responded. Dispute is under review.",
          sentAt: new Date().toISOString(),
          type: "system" as const,
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

      logger.info(
        `Message added to dispute ${disputeId} by user ${req.user!.id}`,
      );

      return res.json({
        dispute: updatedDispute,
        message: "Message added successfully",
      });
    } catch (error) {
      logger.warn({ err: error }, "Error adding message to dispute:");
      res.status(500).json({ error: "Failed to add message" });
    }
  },
);

router.post(
  "/marketplace-disputes/:disputeId/evidence",
  async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { disputeId } = req.params;
      const { type, url } = req.body;

      if (!url) {
        return res.status(400).json({ error: "Evidence URL is required" });
      }

      const [dispute] = await db
        .select()
        .from(marketplaceDisputes)
        .where(eq(marketplaceDisputes.id, disputeId))
        .limit(1);

      if (!dispute) {
        return res.status(404).json({ error: "Dispute not found" });
      }

      if (!canAccessDispute(dispute, req.user!.id, req.user!.role)) {
        return res
          .status(403)
          .json({ error: "Not authorized to add evidence to this dispute" });
      }

      if (["resolved", "closed"].includes(dispute.status || "")) {
        return res.status(400).json({
          error: "Cannot add evidence to a resolved or closed dispute",
        });
      }

      const newEvidence = {
        type: type || "document",
        url,
        uploadedAt: new Date().toISOString(),
        uploadedBy: req.user!.id,
      };

      const isAdmin = isAdminUser(req.user);
      let uploaderLabel = "admin";
      if (!isAdmin) {
        uploaderLabel = dispute.buyerId === req.user!.id ? "buyer" : "seller";
      }

      const updatedEvidence = [...(dispute.evidence || []), newEvidence];
      const updatedMessages = [
        ...(dispute.messages || []),
        {
          from: "system",
          message: `New evidence uploaded by ${uploaderLabel}`,
          sentAt: new Date().toISOString(),
          type: "system" as const,
        },
      ];

      const [updatedDispute] = await db
        .update(marketplaceDisputes)
        .set({
          evidence: updatedEvidence,
          messages: updatedMessages,
          updatedAt: new Date(),
        })
        .where(eq(marketplaceDisputes.id, disputeId))
        .returning();

      logger.info(
        `Evidence added to dispute ${disputeId} by user ${req.user!.id}`,
      );

      return res.json({
        dispute: updatedDispute,
        message: "Evidence added successfully",
      });
    } catch (error) {
      logger.warn({ err: error }, "Error adding evidence:");
      res.status(500).json({ error: "Failed to add evidence" });
    }
  },
);

router.post(
  "/marketplace-disputes/:disputeId/escalate",
  async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { disputeId } = req.params;
      const { reason } = req.body;

      const [dispute] = await db
        .select()
        .from(marketplaceDisputes)
        .where(eq(marketplaceDisputes.id, disputeId))
        .limit(1);

      if (!dispute) {
        return res.status(404).json({ error: "Dispute not found" });
      }

      if (dispute.buyerId !== req.user!.id) {
        return res
          .status(403)
          .json({ error: "Only the buyer can escalate a dispute" });
      }

      if (
        !VALID_STATUS_TRANSITIONS[dispute.status || ""]?.includes("escalated")
      ) {
        return res.status(400).json({
          error: `Cannot escalate dispute from status: ${dispute.status}`,
        });
      }

      const now = new Date();
      const updatedMessages = [
        ...(dispute.messages || []),
        {
          from: "system",
          message: `Dispute escalated${reason ? `: ${reason}` : ""}. A senior support representative will review within 24 hours.`,
          sentAt: now.toISOString(),
          type: "system" as const,
        },
      ];

      const [updatedDispute] = await db
        .update(marketplaceDisputes)
        .set({
          status: "escalated",
          escalatedAt: now,
          updatedAt: now,
          messages: updatedMessages,
        })
        .where(eq(marketplaceDisputes.id, disputeId))
        .returning();

      logger.info(`Dispute ${disputeId} escalated by user ${req.user!.id}`);

      return res.json({
        dispute: updatedDispute,
        message: "Dispute escalated successfully",
      });
    } catch (error) {
      logger.warn({ err: error }, "Error escalating dispute:");
      res.status(500).json({ error: "Failed to escalate dispute" });
    }
  },
);

router.post(
  "/marketplace-disputes/:disputeId/resolve",
  async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { disputeId } = req.params;
      const { outcome, refundAmount, explanation } = req.body;

      if (!outcome || !explanation) {
        return res
          .status(400)
          .json({ error: "Outcome and explanation are required" });
      }

      const validOutcomes = [
        "refund_full",
        "refund_partial",
        "no_refund",
        "license_reissued",
        "mutual_agreement",
      ];
      if (!validOutcomes.includes(outcome)) {
        return res.status(400).json({
          error: `Invalid outcome. Valid outcomes: ${validOutcomes.join(", ")}`,
        });
      }

      if (
        outcome === "refund_partial" &&
        (refundAmount === undefined || refundAmount <= 0)
      ) {
        return res
          .status(400)
          .json({ error: "Partial refund requires a valid refund amount" });
      }

      const [dispute] = await db
        .select()
        .from(marketplaceDisputes)
        .where(eq(marketplaceDisputes.id, disputeId))
        .limit(1);

      if (!dispute) {
        return res.status(404).json({ error: "Dispute not found" });
      }

      const isAdmin = isAdminUser(req.user);
      if (outcome !== "mutual_agreement" && !isAdmin) {
        if (
          dispute.buyerId !== req.user!.id &&
          dispute.sellerId !== req.user!.id
        ) {
          return res
            .status(403)
            .json({ error: "Not authorized to resolve this dispute" });
        }
      }

      if (
        !VALID_STATUS_TRANSITIONS[dispute.status || ""]?.includes("resolved")
      ) {
        return res.status(400).json({
          error: `Cannot resolve dispute from status: ${dispute.status}`,
        });
      }

      const now = new Date();
      const resolution = {
        outcome,
        refundAmount: outcome === "refund_partial" ? refundAmount : undefined,
        explanation,
        resolvedBy: req.user!.id,
        resolvedAt: now.toISOString(),
      };

      const updatedMessages = [
        ...(dispute.messages || []),
        {
          from: "system",
          message: `Dispute resolved with outcome: ${outcome.replace(/_/g, " ")}. ${explanation}`,
          sentAt: now.toISOString(),
          type: "system" as const,
        },
      ];

      const [updatedDispute] = await db
        .update(marketplaceDisputes)
        .set({
          status: "resolved",
          resolvedAt: now,
          updatedAt: now,
          resolution,
          messages: updatedMessages,
        })
        .where(eq(marketplaceDisputes.id, disputeId))
        .returning();

      logger.info(
        `Dispute ${disputeId} resolved with outcome ${outcome} by user ${req.user!.id}`,
      );

      return res.json({
        dispute: updatedDispute,
        message: "Dispute resolved successfully",
      });
    } catch (error) {
      logger.warn({ err: error }, "Error resolving dispute:");
      res.status(500).json({ error: "Failed to resolve dispute" });
    }
  },
);

router.post(
  "/marketplace-disputes/:disputeId/withdraw",
  async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { disputeId } = req.params;

      const [dispute] = await db
        .select()
        .from(marketplaceDisputes)
        .where(eq(marketplaceDisputes.id, disputeId))
        .limit(1);

      if (!dispute) {
        return res.status(404).json({ error: "Dispute not found" });
      }

      if (dispute.buyerId !== req.user!.id) {
        return res
          .status(403)
          .json({ error: "Only the buyer can withdraw a dispute" });
      }

      if (["resolved", "closed"].includes(dispute.status || "")) {
        return res
          .status(400)
          .json({ error: "Cannot withdraw a resolved or closed dispute" });
      }

      const now = new Date();
      const updatedMessages = [
        ...(dispute.messages || []),
        {
          from: "system",
          message: "Dispute withdrawn by buyer.",
          sentAt: now.toISOString(),
          type: "system" as const,
        },
      ];

      const [updatedDispute] = await db
        .update(marketplaceDisputes)
        .set({
          status: "closed",
          updatedAt: now,
          messages: updatedMessages,
        })
        .where(eq(marketplaceDisputes.id, disputeId))
        .returning();

      logger.info(`Dispute ${disputeId} withdrawn by user ${req.user!.id}`);

      return res.json({
        dispute: updatedDispute,
        message: "Dispute withdrawn successfully",
      });
    } catch (error) {
      logger.warn({ err: error }, "Error withdrawing dispute:");
      res.status(500).json({ error: "Failed to withdraw dispute" });
    }
  },
);

router.get(
  "/marketplace-disputes/stats",
  async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const userId = req.user!.id;
      const isAdmin = isAdminUser(req.user);

      let userDisputes;
      if (isAdmin) {
        userDisputes = await db.select().from(marketplaceDisputes).limit(200);
      } else {
        userDisputes = await db
          .select()
          .from(marketplaceDisputes)
          .where(
            or(
              eq(marketplaceDisputes.buyerId, userId),
              eq(marketplaceDisputes.sellerId, userId),
            ),
          );
      }

      const stats = {
        total: userDisputes.length,
        open: userDisputes.filter((d) => d.status === "open").length,
        underReview: userDisputes.filter((d) => d.status === "under_review")
          .length,
        pendingResponse: userDisputes.filter(
          (d) =>
            d.status === "pending_seller_response" ||
            d.status === "pending_buyer_response",
        ).length,
        resolved: userDisputes.filter((d) => d.status === "resolved").length,
        escalated: userDisputes.filter((d) => d.status === "escalated").length,
        closed: userDisputes.filter((d) => d.status === "closed").length,
        asBuyer: userDisputes.filter((d) => d.buyerId === userId).length,
        asSeller: userDisputes.filter((d) => d.sellerId === userId).length,
      };

      return res.json({ stats });
    } catch (error) {
      logger.warn({ err: error }, "Error fetching dispute stats:");
      res.status(500).json({ error: "Failed to fetch dispute stats" });
    }
  },
);

export default router;
