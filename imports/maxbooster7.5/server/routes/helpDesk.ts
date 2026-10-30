// @ts-nocheck
import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { aiHelpDeskService } from "../services/aiHelpDeskService";
import { BUSINESS_CONFIG } from "../config/businessConfig";
import { logger } from "../logger.js";
import crypto from "crypto";
import { z } from "zod";

const router = Router();

// 30 messages per IP per 10 min — prevents AI cost abuse on public endpoint
// Authenticated users get 3× headroom via the skip
const chatRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many messages. Please slow down and try again shortly.",
  },
  skip: (req) => !!req.user,
});

const chatSchema = z.object({
  message: z.string().min(1).max(5000),
  sessionId: z.string().uuid().optional(),
});

const escalateSchema = z.object({
  sessionId: z.string().min(1).max(200),
  reason: z.string().max(2000).optional(),
});

const endSessionSchema = z.object({
  sessionId: z.string().min(1).max(200).optional(),
});

router.get("/welcome", (_req: Request, res: Response) => {
  try {
    const response = aiHelpDeskService?.getWelcomeMessage();
    res.json({
      success: true,
      assistant: {
        name: BUSINESS_CONFIG.helpDesk.aiAssistantName,
        role: BUSINESS_CONFIG.helpDesk.aiAssistantRole,
      },
      ...response,
    });
  } catch (error) {
    logger.warn({ err: error }, "Help desk welcome error:");
    res.status(500).json({ success: false, error: "Failed to load help desk" });
  }
});

router.post("/chat", chatRateLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = chatSchema?.safeParse(req.body);
    if (!parsed?.success) {
      return res.status(400).json({
        success: false,
        error: "Validation error",
        details: parsed.error.flatten(),
      });
    }

    const { message, sessionId } = parsed?.data ?? {};
    const userId = req.user?.id;
    const chatSessionId = sessionId || crypto?.randomUUID();

    const response = await aiHelpDeskService?.processMessage(
      chatSessionId,
      message,
      userId,
    );

    res.json({
      success: true,
      sessionId: chatSessionId,
      assistant: BUSINESS_CONFIG.helpDesk.aiAssistantName,
      ...response,
    });
  } catch (error) {
    logger.warn({ err: error }, "Help desk chat error:");
    res.status(500).json({
      success: false,
      error: "Failed to process message",
    });
  }
});

router.post("/escalate", async (req: Request, res: Response) => {
  try {
    const parsed = escalateSchema?.safeParse(req.body);
    if (!parsed?.success) {
      return res.status(400).json({
        success: false,
        error: "Validation error",
        details: parsed.error.flatten(),
      });
    }

    const { sessionId, reason } = parsed?.data ?? {};
    const result = await aiHelpDeskService?.escalateToHuman(
      sessionId,
      reason || "User requested human support",
    );

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    logger.warn({ err: error }, "Escalation error:");
    res.status(500).json({
      success: false,
      error: "Failed to escalate",
    });
  }
});

router.post("/end", (req: Request, res: Response) => {
  try {
    const parsed = endSessionSchema?.safeParse(req.body);
    if (!parsed?.success) {
      return res.status(400).json({ success: false, error: "Invalid request" });
    }

    const { sessionId } = parsed?.data ?? {};
    if (sessionId) {
      aiHelpDeskService?.endConversation(sessionId);
    }

    res.json({
      success: true,
      message: "Session ended. Thank you for using Max Booster support!",
    });
  } catch (error) {
    logger.warn({ err: error }, "Help desk end session error:");
    res.status(500).json({ success: false, error: "Failed to end session" });
  }
});

router.get("/info", (_req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      company: BUSINESS_CONFIG.company,
      helpDesk: {
        name: BUSINESS_CONFIG.helpDesk.aiAssistantName,
        role: BUSINESS_CONFIG.helpDesk.aiAssistantRole,
        capabilities: BUSINESS_CONFIG.helpDesk.capabilities,
      },
      branding: BUSINESS_CONFIG.branding,
    });
  } catch (error) {
    logger.warn({ err: error }, "Help desk info error:");
    res
      .status(500)
      .json({ success: false, error: "Failed to load help desk info" });
  }
});

export default router;
