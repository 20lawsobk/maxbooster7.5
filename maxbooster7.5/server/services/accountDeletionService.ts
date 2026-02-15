import cron from 'node-cron';
import { storage } from '../storage.js';
import { db } from '../db.js';
import { users, deletionAuditLogs } from '@shared/schema';
import { eq, lte, and } from 'drizzle-orm';
import { logger } from '../logger.js';

/**
 * GDPR Compliance: Account Deletion Service
 * 
 * Implements automated account deletion after 30-day grace period
 * as required by GDPR Right to Erasure (Article 17).
 * 
 * Features:
 * - Daily cron job to check for accounts scheduled for deletion
 * - Permanent deletion with cascade to related records
 * - Comprehensive audit logging
 * - Error handling and recovery
 * - Manual deletion API for administrative purposes
 */

export class AccountDeletionService {
  private cronJob: cron.ScheduledTask | null = null;
  private isRunning = false;

  /**
   * Initialize the account deletion service
   * Starts daily cron job at 2 AM UTC
   */
  public initialize(): void {
    // Run daily at 2 AM UTC (off-peak hours)
    this.cronJob = cron.schedule('0 2 * * *', async () => {
      await this.processScheduledDeletions();
    }, {
      timezone: 'UTC'
    });

    logger.info('✅ Account Deletion Service initialized - daily job at 2 AM UTC');
  }

  /**
   * Process all accounts scheduled for deletion
   * Finds users with deletionScheduledAt <= NOW() and permanently deletes them
   */
  public async processScheduledDeletions(): Promise<{
    processed: number;
    successful: number;
    failed: number;
    errors: Array<{ userId: string; error: string }>;
  }> {
    if (this.isRunning) {
      logger.warn('⚠️ Account deletion job already running, skipping this execution');
      return { processed: 0, successful: 0, failed: 0, errors: [] };
    }

    this.isRunning = true;
    const startTime = Date.now();
    
    try {
      logger.info('🗑️ Starting scheduled account deletion job...');

      // Find users scheduled for deletion
      const usersToDelete = await db
        .select()
        .from(users)
        .where(
          and(
            eq(users.markedForDeletion, true),
            lte(users.deletionScheduledAt, new Date())
          )
        );

      if (usersToDelete.length === 0) {
        logger.info('✅ No accounts scheduled for deletion');
        this.isRunning = false;
        return { processed: 0, successful: 0, failed: 0, errors: [] };
      }

      logger.info(`📋 Found ${usersToDelete.length} accounts scheduled for deletion`);

      const results = {
        processed: usersToDelete.length,
        successful: 0,
        failed: 0,
        errors: [] as Array<{ userId: string; error: string }>
      };

      // Process each user deletion
      for (const user of usersToDelete) {
        try {
          await this.permanentlyDeleteUser(user.id, user.email || 'unknown');
          results.successful++;
          logger.info(`✅ Successfully deleted account: ${user.id} (${user.email})`);
        } catch (error: unknown) {
          results.failed++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          results.errors.push({ userId: user.id, error: errorMessage });
          logger.error(`❌ Failed to delete account ${user.id}:`, error);
        }
      }

      const duration = Date.now() - startTime;
      logger.info(
        `🗑️ Account deletion job completed in ${duration}ms - ` +
        `Processed: ${results.processed}, Successful: ${results.successful}, Failed: ${results.failed}`
      );

      if (results.failed > 0) {
        logger.error(`⚠️ ${results.failed} account deletions failed:`, results.errors);
      }

      this.isRunning = false;
      return results;
    } catch (error: unknown) {
      this.isRunning = false;
      logger.error('❌ Account deletion job failed:', error);
      throw error;
    }
  }

  /**
   * Permanently delete a user account and all related data
   * Implements GDPR Right to Erasure with comprehensive data removal
   * 
   * @param userId - ID of user to delete
   * @param userEmail - Email of user (for audit logging)
   */
  public async permanentlyDeleteUser(userId: string, userEmail: string): Promise<void> {
    logger.info(`🗑️ Starting permanent deletion for user ${userId} (${userEmail})`);

    try {
      // GDPR Compliance: Delete user record
      // Cascading deletes are handled by database foreign key constraints (ON DELETE CASCADE)
      // This will automatically delete:
      // - All projects and associated data
      // - All social media posts and campaigns
      // - All marketplace listings and orders
      // - All analytics and metrics
      // - All notifications
      // - All collaborations
      // - All royalty splits and payments
      // - All assets and files
      // - All content flags (as reporter or content owner)
      // - All JWT tokens and sessions
      // - All compliance records
      // - All audit logs (user-specific)
      
      await db.delete(users).where(eq(users.id, userId));

      // Log deletion to audit trail (system-level log, not user-specific)
      logger.info(
        `✅ GDPR Account Deletion Completed - ` +
        `User: ${userId} (${userEmail}) - ` +
        `Timestamp: ${new Date().toISOString()} - ` +
        `All related data permanently deleted via cascade`
      );

      // Store permanent deletion record for compliance audit
      // This is a system-level audit log, not tied to the deleted user
      await this.logPermanentDeletion({
        userId,
        userEmail,
        deletedAt: new Date(),
        reason: 'scheduled_deletion_after_grace_period'
      });

    } catch (error: unknown) {
      logger.error(`❌ Failed to permanently delete user ${userId}:`, error);
      throw new Error(`Account deletion failed for ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Log permanent deletion for compliance audit trail
   * Stores deletion record in system-level audit log (not tied to deleted user)
   */
  private async logPermanentDeletion(record: {
    userId: string;
    userEmail: string;
    deletedAt: Date;
    reason: string;
    deletedBy?: string;
  }): Promise<void> {
    try {
      // Store in permanent audit log table
      // This table does NOT have foreign key to users table
      // (so it survives user deletion for compliance audit)
      
      await db.insert(deletionAuditLogs).values({
        userId: record.userId,
        userEmail: record.userEmail,
        deletionType: record.reason === 'scheduled_deletion_after_grace_period' ? 'scheduled' : 'manual',
        requestedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago (estimated)
        deletedAt: record.deletedAt,
        deletedBy: record.deletedBy || null,
        reason: record.reason,
        cascadedRecords: null, // Could be expanded to count deleted records
        metadata: null
      });

      logger.info(
        `📝 GDPR Deletion Audit Record Persisted - ` +
        `UserId: ${record.userId}, ` +
        `Email: ${record.userEmail}, ` +
        `DeletedAt: ${record.deletedAt.toISOString()}, ` +
        `Reason: ${record.reason}`
      );
    } catch (error: unknown) {
      logger.error('❌ Failed to persist deletion audit log:', error);
      // Don't throw - deletion already happened, just log the error
    }
  }

  /**
   * Manual deletion API for administrative purposes
   * Allows admins to trigger deletion outside of scheduled job
   * 
   * @param userId - ID of user to delete
   * @param adminId - ID of admin performing deletion
   * @param reason - Reason for manual deletion
   */
  public async manualDelete(userId: string, adminId: string, reason: string): Promise<void> {
    logger.warn(`⚠️ Manual account deletion initiated by admin ${adminId} for user ${userId} - Reason: ${reason}`);

    // Get user email before deletion
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    // Delete user and log to audit table
    await db.delete(users).where(eq(users.id, userId));

    // Store permanent deletion record for compliance audit (with admin ID)
    await this.logPermanentDeletion({
      userId,
      userEmail: user.email || 'unknown',
      deletedAt: new Date(),
      reason: `manual_deletion_by_admin: ${reason}`,
      deletedBy: adminId
    });

    logger.info(`✅ Manual account deletion completed by admin ${adminId} for user ${userId}`);
  }

  /**
   * Stop the cron job (for graceful shutdown)
   */
  public stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      logger.info('🛑 Account Deletion Service stopped');
    }
  }

  /**
   * Get deletion job status
   */
  public getStatus(): { isRunning: boolean; cronActive: boolean } {
    return {
      isRunning: this.isRunning,
      cronActive: !!this.cronJob
    };
  }
}

// Singleton instance
export const accountDeletionService = new AccountDeletionService();
