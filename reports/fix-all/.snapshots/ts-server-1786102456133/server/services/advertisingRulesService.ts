import { storage } from "../storage";
import { logger } from "../logger.js";

/**
 * Advertisement Kill/Pivot Rules Service
 * Automated performance monitoring and optimization
 * Maximizes organic reach by killing underperformers and pivoting to winners
 */
export class AdvertisingRulesService {
  /**
   * Evaluate all active rules for a campaign
   */
  async evaluateRules(campaignId: number): Promise<any[]> {
    const rules = await (storage as any)?.getCampaignRules(campaignId);
    const variants = await (storage as any)?.getCampaignVariants(campaignId);
    const executions: unknown[] = [];

    for (const rule of rules) {
      if (rule?.status !== "active") continue;

      for (const variant of variants) {
        if (variant?.status === "killed") continue; // Skip already killed variants

        if (this.shouldTrigger(rule, variant)) {
          const execution = await this.executeRule(rule, variant);
          executions?.push(execution);
        }
      }
    }

    return executions;
  }

  /**
   * Check if rule should trigger based on metrics
   */
  private shouldTrigger(rule: unknown, variant: unknown): boolean {
    const { condition } = rule;
    const metrics = (variant as any)?.actualMetrics || {};

    switch (condition?.metric) {
      case "engagement":
        return this.compareMetric(
          metrics?.engagement || 0,
          condition?.operator,
          condition?.threshold,
        );
      case "reach":
        return this.compareMetric(
          metrics?.reach || 0,
          condition?.operator,
          condition?.threshold,
        );
      case "shares":
        return this.compareMetric(
          metrics?.shares || 0,
          condition?.operator,
          condition?.threshold,
        );
      case "clicks":
        return this.compareMetric(
          metrics?.clicks || 0,
          condition?.operator,
          condition?.threshold,
        );
      case "saves":
        return this.compareMetric(
          metrics?.saves || 0,
          condition?.operator,
          condition?.threshold,
        );
      case "time":
        const hoursSinceCreated =
          (Date?.now() - new Date((variant as any)?.createdAt).getTime()) /
          (1000 * 60 * 60);
        return this.compareMetric(
          hoursSinceCreated,
          condition?.operator,
          condition?.threshold,
        );
      case "viralityScore":
        return this.compareMetric(
          (variant as any)?.viralityScore || 0,
          condition?.operator,
          condition?.threshold,
        );
      default:
        return false;
    }
  }

  /**
   * Compare metric value against threshold
   */
  private compareMetric(
    value: number,
    operator: string,
    threshold: number,
  ): boolean {
    switch (operator) {
      case "<":
        return value < threshold;
      case "<=":
        return value <= threshold;
      case ">":
        return value > threshold;
      case ">=":
        return value >= threshold;
      case "==":
        return value === threshold;
      default:
        return false;
    }
  }

  /**
   * Execute rule action (kill, pause, pivot, alert)
   */
  private async executeRule(rule: unknown, variant: unknown): Promise<unknown> {
    const triggerReason = this.generateTriggerReason(rule, variant);
    const learnings = this.extractLearnings(rule, variant);

    // Execute action
    let actionTaken = "none";
    switch ((rule as any)?.action) {
      case "kill":
        await (storage as any)?.updateAdCampaignVariant((variant as any)?.id, { status: "killed" });
        actionTaken = "killed";
        break;
      case "pause":
        await (storage as any)?.updateAdCampaignVariant((variant as any)?.id, { status: "paused" });
        actionTaken = "paused";
        break;
      case "pivot":
        await this.executePivot((rule as any)?.pivotStrategy, variant);
        actionTaken = "pivoted";
        break;
      case "alert":
        // Would send notification via notificationService
        actionTaken = "alerted";
        break;
    }

    // Record execution
    const execution = await (storage as any)?.createAdRuleExecution({
      ruleId: (rule as any).id,
      variantId: (variant as any).id,
      triggerReason,
      actionTaken,
      metricsSnapshot: (variant as any).actualMetrics,
      learnings,
    });

    // Update rule trigger count
    await (storage as any)?.updateAdKillRule((rule as any)?.id, {
      triggeredCount: ((rule as any)?.triggeredCount || 0) + 1,
      lastTriggeredAt: new Date(),
    });

    return execution;
  }

  /**
   * Generate human-readable trigger reason
   */
  private generateTriggerReason(rule: unknown, variant: unknown): string {
    const { condition } = rule;
    const metrics = (variant as any)?.actualMetrics || {};
    const actualValue = metrics[condition?.metric] || 0;

    const duration = this.getRunDuration(variant);
    return `${condition?.metric.toUpperCase()} (${this.formatMetric(actualValue, condition?.metric)}) ${condition?.operator} threshold (${this.formatMetric(condition?.threshold, condition?.metric)}) after ${duration} hours`;
  }

  /**
   * Extract learnings from rule execution
   */
  private extractLearnings(_rule: unknown, variant: unknown): string {
    const learnings: string[] = [];
    const metrics = (variant as any)?.actualMetrics || {};

    // Organic performance learnings
    if (metrics?.engagement && (variant as any)?.predictedEngagement) {
      const performanceRatio = metrics?.engagement / (variant as any)?.predictedEngagement;
      if (performanceRatio < 0.5) {
        learnings?.push(
          `Organic engagement ${Math.round((1 - performanceRatio) * 100)}% below prediction - content may not resonate with audience`,
        );
      } else if (performanceRatio > 1.5) {
        learnings?.push(
          `Organic engagement ${Math.round((performanceRatio - 1) * 100)}% above prediction - high-performing content, allocate more reach to similar posts`,
        );
      }
    }

    // Platform-specific learnings
    learnings?.push(
      `${(variant as any)?.platform} organic performance: ${this.formatMetricSnapshot(metrics)}`,
    );

    // Virality learnings
    if ((variant as any)?.viralityScore) {
      if ((variant as any)?.viralityScore < 50) {
        learnings?.push(
          "Low virality score - optimize with more hashtags, questions, and visual content",
        );
      } else if ((variant as any)?.viralityScore > 80) {
        learnings?.push(
          "High virality score - excellent organic amplification potential",
        );
      }
    }

    // Cost savings learnings
    const organicReach = metrics?.reach || 0;
    if (organicReach > 0) {
      learnings?.push(
        `Achieved ${organicReach} organic reach with $0 ad spend - equivalent to ~$${this.estimateAdSpendEquivalent(organicReach, (variant as any)?.platform)} in traditional advertising`,
      );
    }

    return learnings?.join(". ");
  }

  /**
   * Execute pivot strategy
   */
  private async executePivot(
    strategy: unknown,
    variant: unknown,
  ): Promise<void> {
    if (!strategy) return;

    if ((strategy as any)?.reallocateBudget) {
      // Find best performing variant in campaign
      const allVariants = await (storage as any)?.getCampaignVariants((variant as any)?.campaignId);
      const bestVariant = allVariants?.reduce((best: any, v: any) => {
        const bestEngagement = best?.actualMetrics?.engagement || 0;
        const currentEngagement = v?.actualMetrics?.engagement || 0;
        return currentEngagement > bestEngagement ? v : best;
      }, allVariants[0]);

      if (bestVariant && bestVariant?.id !== (variant as any)?.id) {
        // In organic posting, "budget" means posting frequency/reach
        // Increase frequency for best performer, decrease for underperformer
        const note = `Pivot: Increasing posting frequency for high-performing ${bestVariant?.platform} content`;
        logger.info(note);
      }
    }

    if ((strategy as any)?.swapCreative) {
      // Pause underperforming variant
      await (storage as any)?.updateAdCampaignVariant((variant as any)?.id, { status: "paused" });
      // Would create new variant with different creative
      logger.info(
        `Pivot: Paused underperforming ${(variant as any)?.platform} variant, recommend new creative`,
      );
    }
  }

  /**
   * Format metric for display
   */
  private formatMetric(value: number, metricType: string): string {
    switch (metricType) {
      case "engagement":
      case "ctr":
        return `${(value * 100).toFixed(2)}%`;
      case "reach":
      case "shares":
      case "clicks":
      case "saves":
        return value?.toLocaleString();
      case "viralityScore":
        return `${value}/100`;
      default:
        return value?.toFixed(2);
    }
  }

  /**
   * Format metrics snapshot
   */
  private formatMetricSnapshot(metrics: unknown): string {
    const parts: string[] = [];

    if ((metrics as any)?.reach) parts?.push(`${(metrics as any)?.reach} reach`);
    if ((metrics as any)?.engagement)
      parts?.push(`${((metrics as any)?.engagement * 100).toFixed(1)}% engagement`);
    if ((metrics as any)?.shares) parts?.push(`${(metrics as any)?.shares} shares`);
    if ((metrics as any)?.clicks) parts?.push(`${(metrics as any)?.clicks} clicks`);
    if ((metrics as any)?.saves) parts?.push(`${(metrics as any)?.saves} saves`);

    return parts?.join(", ") || "No metrics yet";
  }

  /**
   * Estimate ad spend equivalent for organic reach
   */
  private estimateAdSpendEquivalent(reach: number, platform: string): number {
    const cpm: Record<string, number> = {
      facebook: 12.0,
      instagram: 9.0,
      twitter: 6.5,
      linkedin: 33.0,
      tiktok: 10.0,
      youtube: 20.0,
    };

    const platformCPM = cpm[platform] || 10.0;
    return Math.round((reach / 1000) * platformCPM);
  }

  /**
   * Get variant run duration in hours
   */
  private getRunDuration(variant: unknown): number {
    return Math.round(
      (Date?.now() - new Date((variant as any)?.createdAt).getTime()) / (1000 * 60 * 60),
    );
  }
}
