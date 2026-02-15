import cron from 'node-cron';
import { logger } from '../logger.js';

let weeklyInsightsTask: cron.ScheduledTask | null = null;

export function initializeWeeklyInsightsCron(): void {
  if (weeklyInsightsTask) {
    weeklyInsightsTask.stop();
  }

  weeklyInsightsTask = cron.schedule('0 9 * * 1', async () => {
    logger.info('📊 Starting weekly insights email job (Monday 9 AM)');
    
    try {
      const { weeklyInsightsService } = await import('../services/weeklyInsightsService.js');
      const result = await weeklyInsightsService.sendWeeklyInsights();
      
      logger.info(`📧 Weekly insights complete: ${result.sent} sent, ${result.failed} failed`);
    } catch (error) {
      logger.error('❌ Weekly insights cron job failed:', error);
    }
  }, {
    timezone: 'America/New_York',
  });

  logger.info('✅ Weekly insights cron job scheduled (Every Monday at 9 AM EST)');
}

export function stopWeeklyInsightsCron(): void {
  if (weeklyInsightsTask) {
    weeklyInsightsTask.stop();
    weeklyInsightsTask = null;
    logger.info('⏹️ Weekly insights cron job stopped');
  }
}

export function getWeeklyInsightsStatus(): { running: boolean; nextRun: string | null } {
  if (!weeklyInsightsTask) {
    return { running: false, nextRun: null };
  }

  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysUntilMonday = dayOfWeek === 0 ? 1 : dayOfWeek === 1 && now.getHours() < 9 ? 0 : 8 - dayOfWeek;
  
  const nextRun = new Date(now);
  nextRun.setDate(now.getDate() + daysUntilMonday);
  nextRun.setHours(9, 0, 0, 0);

  return {
    running: true,
    nextRun: nextRun.toISOString(),
  };
}
