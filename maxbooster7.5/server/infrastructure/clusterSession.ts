import { logger } from '../logger.js';

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
    this.config = {
      sessionSecret: process.env.SESSION_SECRET || 'max-booster-session-secret-change-in-production',
      sessionName: 'maxbooster.sid',
      maxAge: parseInt(process.env.SESSION_MAX_AGE || '86400000'),
      secure: process.env.NODE_ENV === 'production',
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
