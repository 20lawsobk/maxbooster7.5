import { logger } from '../logger.js';
import { env } from '../config/env.js';

interface ClusterSessionConfig {
  sessionSecret: string;
  sessionName: string;
  maxAge: number;
  secure: boolean;
}

class ClusterSessionManager {
  private static instance: ClusterSessionManager;
  private config: ClusterSessionConfig;
  private isDistributedMode: boolean = true;

  private constructor() {
    const isProductionEnv =
      process.env.NODE_ENV === 'production' || !!process.env.REPLIT_DEPLOYMENT;
    const rawSecret = env.SESSION_SECRET;
    if (isProductionEnv && (!rawSecret || rawSecret.length < 32)) {
      logger.warn(
        '❌ CRITICAL: SESSION_SECRET missing or too short (<32 chars) — refusing to start in production'
      );
      process.exit(1);
    }
    this.config = {
      sessionSecret: rawSecret || 'dev-only-insecure-fallback-not-for-production',
      sessionName: 'maxbooster.sid',
      maxAge: parseInt(process.env.SESSION_MAX_AGE || '86400000'),
      secure: process.env.NODE_ENV === 'production' || !!process.env.REPLIT_DEPLOYMENT,
    };
    this.isDistributedMode = true;
  }

  static getInstance(): ClusterSessionManager {
    if (!ClusterSessionManager.instance) {
      ClusterSessionManager.instance = new ClusterSessionManager();
    }
    return ClusterSessionManager.instance;
  }

  async initialize(): Promise<void> {
    logger.info(`Cluster session manager ready (boosterstate mode)`);
  }

  isDistributed(): boolean {
    return this.isDistributedMode;
  }

  getStatus(): { mode: string; connected: boolean; prefix: string } {
    return {
      mode: 'boosterstate',
      connected: true,
      prefix: 'maxbooster:sess:',
    };
  }

  async shutdown(): Promise<void> {
    logger.info('Cluster session manager shutdown');
  }
}

export const clusterSessionManager = ClusterSessionManager.getInstance();
