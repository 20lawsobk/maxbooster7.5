import { db } from '../db';
import { systemSettings } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../logger';

interface PaymentBypassConfig {
  enabled: boolean;
  activatedAt: string | null;
  expiresAt: string | null;
  activatedBy: string | null;
  reason: string | null;
}

const PAYMENT_BYPASS_KEY = 'payment_bypass';
const DEFAULT_BYPASS_DURATION_HOURS = 2;

class PaymentBypassService {
  private cachedConfig: PaymentBypassConfig | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL_MS = 30000;

  private getDefaultConfig(): PaymentBypassConfig {
    return {
      enabled: false,
      activatedAt: null,
      expiresAt: null,
      activatedBy: null,
      reason: null,
    };
  }

  private async loadConfig(): Promise<PaymentBypassConfig> {
    try {
      const [setting] = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, PAYMENT_BYPASS_KEY));

      if (setting?.value) {
        const config = setting.value as PaymentBypassConfig;
        
        if (config.expiresAt && new Date(config.expiresAt) <= new Date()) {
          logger.info('[PaymentBypass] Bypass has expired, resetting to disabled');
          await this.saveConfig(this.getDefaultConfig(), 'system');
          return this.getDefaultConfig();
        }
        
        return config;
      }
    } catch (error) {
      logger.error('[PaymentBypass] Failed to load config:', error);
    }
    return this.getDefaultConfig();
  }

  private async saveConfig(config: PaymentBypassConfig, updatedBy: string): Promise<void> {
    try {
      const [existing] = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, PAYMENT_BYPASS_KEY));

      if (existing) {
        await db
          .update(systemSettings)
          .set({
            value: config,
            updatedBy,
            updatedAt: new Date(),
          })
          .where(eq(systemSettings.key, PAYMENT_BYPASS_KEY));
      } else {
        await db
          .insert(systemSettings)
          .values({
            key: PAYMENT_BYPASS_KEY,
            value: config,
            description: 'Payment requirements bypass configuration',
            updatedBy,
          });
      }
      
      this.cachedConfig = config;
      this.cacheExpiry = Date.now() + this.CACHE_TTL_MS;
      
      logger.info('[PaymentBypass] Config saved successfully');
    } catch (error) {
      logger.error('[PaymentBypass] Failed to save config:', error);
      throw error;
    }
  }

  async isPaymentBypassed(): Promise<boolean> {
    const now = Date.now();
    
    if (this.cachedConfig && now < this.cacheExpiry) {
      if (!this.cachedConfig.enabled) {
        return false;
      }
      
      if (this.cachedConfig.expiresAt) {
        const expiresAt = new Date(this.cachedConfig.expiresAt).getTime();
        if (now >= expiresAt) {
          await this.deactivate('system', 'Auto-expired after time limit');
          return false;
        }
      }
      
      return true;
    }

    const config = await this.loadConfig();
    this.cachedConfig = config;
    this.cacheExpiry = now + this.CACHE_TTL_MS;

    if (!config.enabled) {
      return false;
    }

    if (config.expiresAt) {
      const expiresAt = new Date(config.expiresAt).getTime();
      if (now >= expiresAt) {
        logger.info('[PaymentBypass] Bypass has expired, auto-disabling');
        await this.deactivate('system', 'Auto-expired after time limit');
        return false;
      }
    }

    return true;
  }

  async activate(adminId: string, reason?: string, durationHours: number = DEFAULT_BYPASS_DURATION_HOURS): Promise<PaymentBypassConfig> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationHours * 60 * 60 * 1000);

    const config: PaymentBypassConfig = {
      enabled: true,
      activatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      activatedBy: adminId,
      reason: reason || `Payment bypass activated for ${durationHours} hours`,
    };

    await this.saveConfig(config, adminId);
    logger.info(`[PaymentBypass] Activated by ${adminId} until ${expiresAt.toISOString()}`);

    return config;
  }

  async deactivate(adminId: string, reason?: string): Promise<PaymentBypassConfig> {
    const currentConfig = await this.loadConfig();
    const wasEnabled = currentConfig.enabled;
    
    const config = this.getDefaultConfig();
    await this.saveConfig(config, adminId);
    
    if (wasEnabled) {
      logger.info(`[PaymentBypass] Deactivated by ${adminId}. Reason: ${reason || 'Manual deactivation'}`);
    }

    return config;
  }

  async getStatus(): Promise<{
    bypassed: boolean;
    config: PaymentBypassConfig;
    timeRemaining: string | null;
    timeRemainingMs: number | null;
  }> {
    const config = await this.loadConfig();
    const bypassed = await this.isPaymentBypassed();
    let timeRemaining: string | null = null;
    let timeRemainingMs: number | null = null;

    if (bypassed && config.expiresAt) {
      const expiresAt = new Date(config.expiresAt);
      const now = new Date();
      const diffMs = expiresAt.getTime() - now.getTime();

      if (diffMs > 0) {
        timeRemainingMs = diffMs;
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        timeRemaining = `${hours}h ${minutes}m`;
      }
    }

    return {
      bypassed,
      config,
      timeRemaining,
      timeRemainingMs,
    };
  }

  async extendBypass(adminId: string, additionalHours: number): Promise<PaymentBypassConfig> {
    const config = await this.loadConfig();
    
    if (!config.enabled || !config.expiresAt) {
      throw new Error('No active bypass to extend');
    }

    const currentExpiry = new Date(config.expiresAt);
    const newExpiry = new Date(currentExpiry.getTime() + additionalHours * 60 * 60 * 1000);

    config.expiresAt = newExpiry.toISOString();
    config.reason = `${config.reason} | Extended by ${additionalHours}h by ${adminId}`;

    await this.saveConfig(config, adminId);
    logger.info(`[PaymentBypass] Extended by ${adminId} until ${newExpiry.toISOString()}`);

    return config;
  }
}

export const paymentBypassService = new PaymentBypassService();
