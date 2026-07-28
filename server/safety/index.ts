/**
 * SAFETY MODULE INDEX
 *
 * Central export for all production safety systems.
 * These modules are MANDATORY for production operation.
 */

// Kill Switch - Emergency stop for autonomous systems
export {
  killSwitch,
  guardedOperation,
  type AutonomousSystemName,
  type KillSwitchState,
  type KillSwitchAuditEntry,
} from "./killSwitch";

// Environment Validation - Boot-time checks
export {
  validateEnvironment,
  requireEnv,
  getEnv,
  type ValidationResult,
} from "./envValidation";

// Mandatory Middleware - Security essentials
export {
  applyMandatoryMiddleware,
  globalErrorHandler,
  requestIdMiddleware,
  requestLoggingMiddleware,
  type MandatoryMiddlewareResult,
} from "./mandatoryMiddleware";

// Stripe Webhook Security - Payment verification
export {
  stripeWebhookMiddleware,
  stripeRawBodyParser,
  checkIdempotency,
  registerWebhookHandler,
  handleWebhookEvent,
  getWebhookAuditLog,
} from "./stripeWebhookSecurity";

// Database Indexes - Performance optimization
export {
  createRequiredIndexes,
  getIndexStatus,
  type IndexCreationResult,
} from "./databaseIndexes";

// Refund Handler - Payment dispute management
export {
  processRefund,
  handleDispute,
  registerRefundWebhookHandlers,
  getRefundStats,
} from "./refundHandler";

// Input Validation - Request sanitization
export {
  validate,
  sanitizeString,
  sanitizeObject,
  sanitizationMiddleware,
  escapeSqlIdentifier,
  trackValidationError,
  schemas,
  routeSchemas,
} from "./inputValidation";

// Autonomous RBAC - Permission control
export {
  canPerformAction,
  recordAction,
  requestApproval,
  processApproval,
  getPendingApprovals,
  getRBACStatus,
  type AutonomousAction,
  type PermissionLevel,
} from "./autonomousRBAC";

// Audit Logger - Guaranteed event logging
export {
  initAuditLogger,
  audit,
  auditAuth,
  auditPayment,
  auditSecurity,
  auditAutonomous,
  getAuditLog,
  cleanupAuditLog,
  shutdownAuditLogger,
  type AuditEntry,
  type AuditCategory,
  type AuditSeverity,
} from "./auditLogger";

import { logger } from "../logger.js";

/**
 * Initialize all safety systems
 * Call this during server startup
 */
export async function initializeSafetySystems(): Promise<{
  success: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  logger.info("════════════════════════════════════════════════════════");
  logger.info("🛡️ INITIALIZING PRODUCTION SAFETY SYSTEMS");
  logger.info("════════════════════════════════════════════════════════");

  // 1. Validate environment (non-strict mode - log but don't fail)
  try {
    const { validateEnvironment } = await import("./envValidation");
    const envResult = validateEnvironment(false);
    if (!envResult.valid) {
      errors.push(...envResult.errors);
    }
  } catch (error) {
    errors.push(`Environment validation failed: ${error.message}`);
    logger.warn({ err: error }, "[Safety] Environment validation error:");
  }

  // 2. Initialize audit logger
  try {
    const { initAuditLogger } = await import("./auditLogger");
    await initAuditLogger();
    logger.info("   ✓ Audit logger initialized");
  } catch (error) {
    errors.push(`Audit logger failed: ${error.message}`);
    logger.warn({ err: error }, "[Safety] Audit logger error:");
  }

  // 3. Create database indexes
  try {
    const { createRequiredIndexes } = await import("./databaseIndexes");
    const indexResult = await createRequiredIndexes();
    if (!indexResult.success) {
      logger.warn("   ⚠ Some database indexes failed to create");
    } else {
      logger.info("   ✓ Database indexes verified");
    }
  } catch (error) {
    // Non-critical - log but don't fail
    logger.warn("[Safety] Database index creation skipped:", error?.message);
  }

  // 4. Register refund webhook handlers
  try {
    const { registerRefundWebhookHandlers } = await import("./refundHandler");
    registerRefundWebhookHandlers();
    logger.info("   ✓ Refund webhook handlers registered");
  } catch (error) {
    errors?.push(`Refund handlers failed: ${error?.message}`);
    logger.warn({ err: error }, "[Safety] Refund handler error:");
  }

  // 5. Initialize kill switch (always succeeds)
  try {
    const { killSwitch } = await import("./killSwitch");
    const state = killSwitch?.getState();
    logger.info(
      `   ✓ Kill switch ready (global killed: ${state?.globalKilled})`,
    );
  } catch (error) {
    errors?.push(`Kill switch failed: ${error?.message}`);
    logger.warn({ err: error }, "[Safety] Kill switch error:");
  }

  const success = errors?.length === 0;

  logger.info("────────────────────────────────────────────────────────");
  if (success) {
    logger.info("   ✅ All safety systems initialized successfully");
  } else {
    logger.warn(
      `   ⚠ Safety systems initialized with ${errors?.length} warnings`,
    );
  }
  logger.info("════════════════════════════════════════════════════════");

  return { success, errors };
}
