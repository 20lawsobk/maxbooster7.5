/**
 * Paid/Premium Routes Module
 * 
 * This module serves as a registry for routes that require a paid subscription.
 * Individual route files (content-analysis, dualAutopilot, etc.) already
 * apply the requirePremium middleware directly.
 * 
 * This module can be extended to add new premium routes that need centralized
 * premium access control.
 * 
 * Note: Admin users automatically have access to all premium features via
 * the requirePremium middleware.
 */

import { Router } from 'express';

const router = Router();

// This router is currently a placeholder for future premium route organization
// Individual premium routes (content-analysis, dualAutopilot) handle their
// own requirePremium middleware to avoid double-application

export default router;

