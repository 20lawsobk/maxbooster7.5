/**
 * AI Help Desk API Routes
 */

import { Router, Request, Response } from 'express';
import { aiHelpDeskService } from '../services/aiHelpDeskService';
import { BUSINESS_CONFIG } from '../config/businessConfig';
import crypto from 'crypto';

const router = Router();

/**
 * GET /api/help-desk/welcome
 * Get welcome message and initial suggestions
 */
router.get('/welcome', (req: Request, res: Response) => {
  const response = aiHelpDeskService.getWelcomeMessage();
  res.json({
    success: true,
    assistant: {
      name: BUSINESS_CONFIG.helpDesk.aiAssistantName,
      role: BUSINESS_CONFIG.helpDesk.aiAssistantRole,
    },
    ...response
  });
});

/**
 * POST /api/help-desk/chat
 * Send a message to the AI help desk
 */
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { message, sessionId } = req.body;
    const userId = (req as any).user?.id;
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }
    
    // Use provided sessionId or generate new one
    const chatSessionId = sessionId || crypto.randomUUID();
    
    const response = await aiHelpDeskService.processMessage(chatSessionId, message, userId);
    
    res.json({
      success: true,
      sessionId: chatSessionId,
      assistant: BUSINESS_CONFIG.helpDesk.aiAssistantName,
      ...response
    });
  } catch (error) {
    console.error('Help desk chat error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process message'
    });
  }
});

/**
 * POST /api/help-desk/escalate
 * Escalate to human support
 */
router.post('/escalate', async (req: Request, res: Response) => {
  try {
    const { sessionId, reason } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }
    
    const result = await aiHelpDeskService.escalateToHuman(sessionId, reason || 'User requested human support');
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Escalation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to escalate'
    });
  }
});

/**
 * POST /api/help-desk/end
 * End a help desk session
 */
router.post('/end', (req: Request, res: Response) => {
  const { sessionId } = req.body;
  
  if (sessionId) {
    aiHelpDeskService.endConversation(sessionId);
  }
  
  res.json({
    success: true,
    message: 'Session ended. Thank you for using Max Booster support!'
  });
});

/**
 * GET /api/help-desk/info
 * Get help desk and company information
 */
router.get('/info', (req: Request, res: Response) => {
  res.json({
    success: true,
    company: BUSINESS_CONFIG.company,
    helpDesk: {
      name: BUSINESS_CONFIG.helpDesk.aiAssistantName,
      role: BUSINESS_CONFIG.helpDesk.aiAssistantRole,
      capabilities: BUSINESS_CONFIG.helpDesk.capabilities
    },
    branding: BUSINESS_CONFIG.branding
  });
});

export default router;
