/**
 * Self-Healing Security Engine Configuration
 * 
 * Centralized configuration for all self-healing security thresholds and settings.
 * Override via environment variables or config management system.
 */

export interface SelfHealingConfig {
  // Threat Detection Thresholds
  threatThresholds: {
    low: number;       // 0.3 default
    medium: number;    // 0.5 default
    high: number;      // 0.7 default
    critical: number;  // 0.9 default
  };

  // Rate Limiting
  rateLimit: {
    windowMs: number;           // 60000 (1 minute)
    maxRequests: number;        // 100 default
    highRateThreshold: number;  // 0.5 score threshold
  };

  // IP Blocking Durations (milliseconds)
  blockDurations: {
    low: number;      // 5 minutes
    medium: number;   // 30 minutes
    high: number;     // 2 hours
    critical: number; // 24 hours
  };

  // IP Reputation
  ipReputation: {
    baseScore: number;              // 100 (perfect)
    violationPenalty: number;       // 20 points per violation
    decayFactor: number;            // 0.0001 (half-life ~7 days)
    suspiciousThreshold: number;    // 0.7
  };

  // Memory Management
  memory: {
    heapWarningThreshold: number;   // 0.85 (85% of max)
    heapCriticalThreshold: number;  // 0.90 (90% of max)
    growthRateThreshold: number;    // 10 * 1024 * 1024 (10MB/min)
    externalMemoryThreshold: number; // 50 * 1024 * 1024 (50MB/min)
  };

  // Circuit Breaker
  circuitBreaker: {
    failureThreshold: number;    // 5 failures
    successThreshold: number;    // 2 successes
    timeout: number;             // 5000ms
    resetTimeout: number;        // 30000ms (30s)
  };

  // Database Recovery
  databaseRecovery: {
    maxAttempts: number;         // 10
    baseBackoffMs: number;       // 1000 (1s)
    maxBackoffMs: number;        // 512000 (512s)
    connectionTimeout: number;   // 5000ms
    queryTimeout: number;        // 30000ms
  };

  // Process Management
  process: {
    maxRestartsPerHour: number;  // 3
    gracefulShutdownTimeout: number; // 30000ms (30s)
    healthCheckInterval: number; // 30000ms (30s)
  };

  // Monitoring & Metrics
  monitoring: {
    metricsRetentionMs: number;  // 24 * 60 * 60 * 1000 (24 hours)
    healthCheckCacheTTL: number; // 30000ms (30s)
    samplingRate: number;        // 1 (100% of requests)
  };

  // Alerting
  alerting: {
    enabled: boolean;
    channels: {
      database: boolean;
      console: boolean;
      webhook: boolean;
      email: boolean;
      slack: boolean;
      pagerduty: boolean;
    };
    webhookUrl?: string;
    slackWebhookUrl?: string;
    pagerdutyKey?: string;
    emailRecipients?: string[];
  };
}

// Default configuration
export const defaultConfig: SelfHealingConfig = {
  threatThresholds: {
    low: 0.3,
    medium: 0.5,
    high: 0.7,
    critical: 0.9,
  },

  rateLimit: {
    windowMs: 60000,
    maxRequests: 100,
    highRateThreshold: 0.5,
  },

  blockDurations: {
    low: 5 * 60 * 1000,        // 5 minutes
    medium: 30 * 60 * 1000,     // 30 minutes
    high: 2 * 60 * 60 * 1000,   // 2 hours
    critical: 24 * 60 * 60 * 1000, // 24 hours
  },

  ipReputation: {
    baseScore: 100,
    violationPenalty: 20,
    decayFactor: 0.0001,
    suspiciousThreshold: 0.7,
  },

  memory: {
    heapWarningThreshold: 0.85,
    heapCriticalThreshold: 0.90,
    growthRateThreshold: 10 * 1024 * 1024,
    externalMemoryThreshold: 50 * 1024 * 1024,
  },

  circuitBreaker: {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 5000,
    resetTimeout: 30000,
  },

  databaseRecovery: {
    maxAttempts: 10,
    baseBackoffMs: 1000,
    maxBackoffMs: 512000,
    connectionTimeout: 5000,
    queryTimeout: 30000,
  },

  process: {
    maxRestartsPerHour: 3,
    gracefulShutdownTimeout: 30000,
    healthCheckInterval: 30000,
  },

  monitoring: {
    metricsRetentionMs: 24 * 60 * 60 * 1000,
    healthCheckCacheTTL: 30000,
    samplingRate: 1,
  },

  alerting: {
    enabled: true,
    channels: {
      database: true,
      console: true,
      webhook: false,
      email: false,
      slack: false,
      pagerduty: false,
    },
  },
};

/**
 * Load configuration from environment variables
 */
export function loadConfig(): SelfHealingConfig {
  const config = { ...defaultConfig };

  // Override from environment variables
  if (process.env.SELF_HEALING_LOW_THRESHOLD) {
    config.threatThresholds.low = parseFloat(process.env.SELF_HEALING_LOW_THRESHOLD);
  }
  if (process.env.SELF_HEALING_MEDIUM_THRESHOLD) {
    config.threatThresholds.medium = parseFloat(process.env.SELF_HEALING_MEDIUM_THRESHOLD);
  }
  if (process.env.SELF_HEALING_HIGH_THRESHOLD) {
    config.threatThresholds.high = parseFloat(process.env.SELF_HEALING_HIGH_THRESHOLD);
  }
  if (process.env.SELF_HEALING_CRITICAL_THRESHOLD) {
    config.threatThresholds.critical = parseFloat(process.env.SELF_HEALING_CRITICAL_THRESHOLD);
  }

  if (process.env.RATE_LIMIT_MAX_REQUESTS) {
    config.rateLimit.maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS);
  }

  if (process.env.MEMORY_HEAP_WARNING) {
    config.memory.heapWarningThreshold = parseFloat(process.env.MEMORY_HEAP_WARNING);
  }
  if (process.env.MEMORY_HEAP_CRITICAL) {
    config.memory.heapCriticalThreshold = parseFloat(process.env.MEMORY_HEAP_CRITICAL);
  }

  // Alerting configuration
  if (process.env.SLACK_WEBHOOK_URL) {
    config.alerting.channels.slack = true;
    config.alerting.slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
  }
  if (process.env.PAGERDUTY_KEY) {
    config.alerting.channels.pagerduty = true;
    config.alerting.pagerdutyKey = process.env.PAGERDUTY_KEY;
  }
  if (process.env.ALERT_WEBHOOK_URL) {
    config.alerting.channels.webhook = true;
    config.alerting.webhookUrl = process.env.ALERT_WEBHOOK_URL;
  }
  if (process.env.ALERT_EMAIL_RECIPIENTS) {
    config.alerting.channels.email = true;
    config.alerting.emailRecipients = process.env.ALERT_EMAIL_RECIPIENTS.split(',');
  }

  return config;
}

// Singleton instance
let configInstance: SelfHealingConfig | null = null;

export function getConfig(): SelfHealingConfig {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

// Allow runtime updates (for testing or dynamic reconfiguration)
export function updateConfig(updates: Partial<SelfHealingConfig>): void {
  if (configInstance) {
    configInstance = { ...configInstance, ...updates };
  }
}
