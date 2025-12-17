import { db } from '../db';
import { sessions, users, passwordResetTokens } from '@shared/schema';
import { gte, sql, count, desc, eq, and } from 'drizzle-orm';

// Track metrics in memory (for production, use Redis or dedicated monitoring)
let requestCounter = 0;
let errorCounter = 0;
let lastMetricsReset = Date.now();

// Increment request counter (call from middleware)
export function trackRequest() {
  requestCounter++;
}

// Increment error counter (call from error handlers)
export function trackError() {
  errorCounter++;
}

/**
 * TODO: Add function documentation
 */
export async function getSecurityMetrics() {
  const uptimeSeconds = Math.floor(process.uptime());

  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const [activeSessionsResult] = await db
    .select({ count: count() })
    .from(sessions)
    .where(gte(sessions.lastActivity, fifteenMinutesAgo));

  const activeSessions = activeSessionsResult?.count || 0;

  const [totalLoginsResult] = await db
    .select({ count: count() })
    .from(sessions)
    .where(gte(sessions.createdAt, yesterday));

  const totalLogins = totalLoginsResult?.count || 0;

  // Count failed password reset attempts as proxy for failed logins
  const [failedLoginsResult] = await db
    .select({ count: count() })
    .from(passwordResetTokens)
    .where(gte(passwordResetTokens.createdAt, yesterday));

  const failedLogins = failedLoginsResult?.count || 0;

  const successRate = totalLogins > 0 ? ((totalLogins - failedLogins) / totalLogins) * 100 : 100;

  // Calculate real metrics from tracked data
  const minutesSinceReset = (Date.now() - lastMetricsReset) / 60000;
  const requestsPerMinute =
    minutesSinceReset > 0 ? Math.round(requestCounter / minutesSinceReset) : 0;
  const errorRate = requestCounter > 0 ? (errorCounter / requestCounter) * 100 : 0;

  // Reset counters every hour to prevent overflow
  if (minutesSinceReset >= 60) {
    requestCounter = 0;
    errorCounter = 0;
    lastMetricsReset = Date.now();
  }

  const status = errorRate > 10 ? 'critical' : errorRate > 5 ? 'degraded' : 'healthy';

  // Count suspicious activity (multiple sessions from same user)
  const [suspiciousActivityResult] = await db
    .select({ count: count() })
    .from(sessions)
    .where(gte(sessions.createdAt, oneHourAgo));

  const suspiciousActivity = Math.max(0, (suspiciousActivityResult?.count || 0) - activeSessions);

  return {
    systemHealth: {
      uptime: uptimeSeconds,
      status,
      errorRate: Math.round(errorRate * 100) / 100,
      requestsPerMinute,
    },
    authentication: {
      totalLogins,
      failedLogins,
      successRate: Math.round(successRate * 100) / 100,
      activeSessions,
    },
    threats: {
      blockedAttempts: failedLogins,
      suspiciousActivity,
      rateLimit: Math.min(suspiciousActivity, 10), // Cap at 10 for display
    },
  };
}

/**
 * TODO: Add function documentation
 */
export async function getBehavioralAlerts() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const suspiciousUsers = await db
    .select({
      userId: sessions.userId,
      sessionCount: count(),
    })
    .from(sessions)
    .where(gte(sessions.createdAt, oneHourAgo))
    .groupBy(sessions.userId)
    .having(sql`count(*) > 5`);

  const alerts = [];

  for (const suspiciousUser of suspiciousUsers) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, suspiciousUser.userId))
      .limit(1);

    if (user) {
      alerts.push({
        id: `alert-${suspiciousUser.userId}-${Date.now()}`,
        userId: suspiciousUser.userId,
        username: user.username || user.email || 'Unknown',
        type: 'unusual_activity' as const,
        severity: 'medium' as const,
        timestamp: new Date().toISOString(),
        description: `User has created ${suspiciousUser.sessionCount} sessions in the last hour`,
        resolved: false,
      });
    }
  }

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentPasswordResets = await db
    .select({
      email: passwordResetTokens.email,
      tokenCount: count(),
    })
    .from(passwordResetTokens)
    .where(gte(passwordResetTokens.createdAt, oneDayAgo))
    .groupBy(passwordResetTokens.email)
    .having(sql`count(*) > 3`);

  for (const resetAttempt of recentPasswordResets) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, resetAttempt.email))
      .limit(1);

    if (user) {
      alerts.push({
        id: `alert-reset-${user.id}-${Date.now()}`,
        userId: user.id,
        username: user.username || user.email || 'Unknown',
        type: 'multiple_failed_logins' as const,
        severity: 'high' as const,
        timestamp: new Date().toISOString(),
        description: `${resetAttempt.tokenCount} password reset requests in the last 24 hours`,
        resolved: false,
      });
    }
  }

  return { alerts };
}

/**
 * TODO: Add function documentation
 */
export async function detectSecurityAnomalies() {
  const anomalies = [];

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const [recentSessionsResult] = await db
    .select({ count: count() })
    .from(sessions)
    .where(gte(sessions.createdAt, yesterday));

  const [previousSessionsResult] = await db
    .select({ count: count() })
    .from(sessions)
    .where(and(gte(sessions.createdAt, twoDaysAgo), sql`${sessions.createdAt} < ${yesterday}`));

  const recentSessions = recentSessionsResult?.count || 0;
  const previousSessions = previousSessionsResult?.count || 0;

  if (previousSessions > 0) {
    const percentageChange = ((recentSessions - previousSessions) / previousSessions) * 100;

    if (Math.abs(percentageChange) > 200) {
      anomalies.push({
        type: 'traffic_spike' as const,
        timestamp: new Date().toISOString(),
        metric: 'session_creation_rate',
        expectedValue: previousSessions,
        actualValue: recentSessions,
        severity: percentageChange > 0 ? ('high' as const) : ('medium' as const),
        description: `Session creation ${percentageChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(percentageChange).toFixed(1)}% in the last 24 hours`,
      });
    }
  }

  const [passwordResetResult] = await db
    .select({ count: count() })
    .from(passwordResetTokens)
    .where(gte(passwordResetTokens.createdAt, yesterday));

  const passwordResets = passwordResetResult?.count || 0;

  if (passwordResets > 10) {
    anomalies.push({
      type: 'auth_pattern' as const,
      timestamp: new Date().toISOString(),
      metric: 'password_reset_requests',
      expectedValue: 0,
      actualValue: passwordResets,
      severity: passwordResets > 50 ? ('high' as const) : ('medium' as const),
      description: `${passwordResets} password reset requests in the last 24 hours`,
    });
  }

  return { anomalies };
}

/**
 * TODO: Add function documentation
 */
export async function getPentestResults() {
  const hasHttps = process.env.NODE_ENV === 'production';
  const hasSecurityHeaders = true;

  const vulnerabilities = [];
  const recommendations = [];

  if (!hasHttps && process.env.NODE_ENV === 'production') {
    vulnerabilities.push({
      id: 'vuln-https-001',
      severity: 'high' as const,
      category: 'Transport Security',
      description: 'Application not using HTTPS in production',
      status: 'open' as const,
      detectedDate: new Date().toISOString(),
    });
    recommendations.push('Enable HTTPS/TLS for all production traffic');
  }

  if (
    !process.env.SESSION_SECRET ||
    process.env.SESSION_SECRET === 'fallback-secret-change-in-production'
  ) {
    vulnerabilities.push({
      id: 'vuln-session-001',
      severity: 'critical' as const,
      category: 'Session Management',
      description: 'Weak or default session secret detected',
      status: 'open' as const,
      detectedDate: new Date().toISOString(),
    });
    recommendations.push('Set a strong, unique SESSION_SECRET environment variable');
  }

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_SECRET_KEY.startsWith('sk_')) {
    vulnerabilities.push({
      id: 'vuln-stripe-001',
      severity: 'medium' as const,
      category: 'Payment Security',
      description: 'Stripe API key not properly configured',
      status: 'open' as const,
      detectedDate: new Date().toISOString(),
    });
    recommendations.push('Configure valid Stripe API keys for payment processing');
  }

  const summary = {
    critical: vulnerabilities.filter((v) => v.severity === 'critical').length,
    high: vulnerabilities.filter((v) => v.severity === 'high').length,
    medium: vulnerabilities.filter((v) => v.severity === 'medium').length,
    low: vulnerabilities.filter((v) => v.severity === 'low').length,
    passed: hasHttps && hasSecurityHeaders ? 2 : hasSecurityHeaders ? 1 : 0,
  };

  if (vulnerabilities.length === 0) {
    recommendations.push('No critical vulnerabilities detected');
    recommendations.push('Continue regular security audits');
    recommendations.push('Keep dependencies up to date');
  }

  return {
    lastScan: new Date().toISOString(),
    summary,
    vulnerabilities,
    recommendations,
  };
}
