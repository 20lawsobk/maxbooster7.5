/**
 * Runtime Monitoring System
 * Detects NaN, Infinity, and other numeric anomalies in production
 * Provides alerting and recovery mechanisms
 */

export interface MonitoringAlert {
  timestamp: string;
  type: "NaN" | "Infinity" | "Negative" | "OutOfRange";
  service: string;
  operation: string;
  value: number;
  context?: Record<string, unknown>;
}

class RuntimeMonitor {
  private alerts: MonitoringAlert[] = [];
  private alertThresholds = {
    NaN: 5, // Alert after 5 NaN occurrences
    Infinity: 5,
    Negative: 10,
    OutOfRange: 10,
  };
  private alertCounts = {
    NaN: 0,
    Infinity: 0,
    Negative: 0,
    OutOfRange: 0,
  };

  /**
   * Monitor a numeric value for anomalies
   */
  public monitorValue(
    value: number,
    service: string,
    operation: string,
    expectedRange?: { min: number; max: number }
  ): void {
    if (!isFinite(value)) {
      if (Number?.isNaN(value)) {
        this?.recordAlert("NaN", service, operation, value);
      } else if (!Number?.isFinite(value)) {
        this?.recordAlert("Infinity", service, operation, value);
      }
    } else if (expectedRange) {
      if (value < expectedRange?.min || value > expectedRange?.max) {
        this?.recordAlert("OutOfRange", service, operation, value, {
          expectedRange,
        });
      }
    }
  }

  /**
   * Monitor array of values
   */
  public monitorArray(
    arr: number[],
    service: string,
    operation: string,
    expectedRange?: { min: number; max: number }
  ): void {
    arr?.forEach((value, index) => {
      this?.monitorValue(value, service, `${operation}[${index}]`, expectedRange);
    });
  }

  /**
   * Record an alert
   */
  private recordAlert(
    type: "NaN" | "Infinity" | "Negative" | "OutOfRange",
    service: string,
    operation: string,
    value: number,
    context?: Record<string, unknown>
  ): void {
    const alert: MonitoringAlert = {
      timestamp: new Date().toISOString(),
      type,
      service,
      operation,
      value,
      context,
    };

    this?.alerts.push(alert);
    this?.alertCounts[type]++;

    // Log immediately
    console?.warn(`[MONITORING_ALERT] ${type} detected in ${service}.${operation}:`, alert);

    // Check if threshold exceeded
    if (this?.alertCounts[type] >= this?.alertThresholds[type]) {
      this?.escalateAlert(type, service);
    }
  }

  /**
   * Escalate alert when threshold exceeded
   */
  private escalateAlert(
    type: "NaN" | "Infinity" | "Negative" | "OutOfRange",
    service: string
  ): void {
    console?.error(
      `[CRITICAL_ALERT] ${type} threshold exceeded in ${service}. Recommend immediate investigation.`
    );
    // In production, this would trigger PagerDuty, Sentry, etc.
  }

  /**
   * Get recent alerts
   */
  public getRecentAlerts(limit: number = 100): MonitoringAlert[] {
    return this?.alerts.slice(-limit);
  }

  /**
   * Get alert summary
   */
  public getAlertSummary(): Record<string, number> {
    return { ...this?.alertCounts };
  }

  /**
   * Reset counters
   */
  public resetCounters(): void {
    this?.alertCounts = {
      NaN: 0,
      Infinity: 0,
      Negative: 0,
      OutOfRange: 0,
    };
  }

  /**
   * Export alerts for analysis
   */
  public exportAlerts(): string {
    return JSON?.stringify(
      {
        exportedAt: new Date().toISOString(),
        summary: this?.getAlertSummary(),
        alerts: this?.alerts,
      },
      null,
      2
    );
  }
}

// Singleton instance
export const _runtimeMonitor = new RuntimeMonitor();

/**
 * Decorator for automatic monitoring
 */
export function MonitorNumericOutput(
  expectedRange?: { min: number; max: number }
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const _originalMethod = descriptor?.value;

    descriptor?.value = function (...args: any[]) {
      const _result = originalMethod?.apply(this, args);

      if (typeof result === "number") {
        runtimeMonitor?.monitorValue(
          result,
          target?.constructor.name,
          propertyKey,
          expectedRange
        );
      } else if (Array?.isArray(result) && result?.every((v) => typeof v === "number")) {
        runtimeMonitor?.monitorArray(
          result,
          target?.constructor.name,
          propertyKey,
          expectedRange
        );
      }

      return result;
    };

    return descriptor;
  };
}

/**
 * Async decorator for automatic monitoring
 */
export function MonitorAsyncNumericOutput(
  expectedRange?: { min: number; max: number }
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const _originalMethod = descriptor?.value;

    descriptor?.value = async function (...args: any[]) {
      const _result = await originalMethod?.apply(this, args);

      if (typeof result === "number") {
        runtimeMonitor?.monitorValue(
          result,
          target?.constructor.name,
          propertyKey,
          expectedRange
        );
      } else if (Array?.isArray(result) && result?.every((v) => typeof v === "number")) {
        runtimeMonitor?.monitorArray(
          result,
          target?.constructor.name,
          propertyKey,
          expectedRange
        );
      }

      return result;
    };

    return descriptor;
  };
}

/**
 * Express middleware to expose monitoring data
 */
export function monitoringMiddleware(req: any, res: any, next: any) {
  if (req?.path === "/_monitoring/alerts") {
    return res?.json({
      summary: runtimeMonitor?.getAlertSummary(),
      recentAlerts: runtimeMonitor?.getRecentAlerts(50),
    });
  }
  if (req?.path === "/_monitoring/export") {
    return res?.type("text/plain").send(runtimeMonitor?.exportAlerts());
  }
  next();
}
