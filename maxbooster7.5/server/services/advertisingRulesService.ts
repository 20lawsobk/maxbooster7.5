import { storage } from '../storage';
import { logger } from '../logger.js';

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
    const rules = await storage.getCampaignRules(campaignId);
    const variants = await storage.getCampaignVariants(campaignId);
    const executions: unknown[] = [];

    for (const rule of rules) {
      if (rule.status !== 'active') continue;

      for (const variant of variants) {
        if (variant.status === 'killed') continue; // Skip already killed variants

        if (this.shouldTrigger(rule, variant)) {
          const execution = await this.executeRule(rule, variant);
          executions.push(execution);
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
    const metrics = variant.actualMetrics || {};

    switch (condition.metric) {
      case 'engagement':
        return this.compareMetric(metrics.engagement || 0, condition.operator, condition.threshold);
      case 'reach':
        return this.compareMetric(metrics.reach || 0, condition.operator, condition.threshold);
      case 'shares':
        return this.compareMetric(metrics.shares || 0, condition.operator, condition.threshold);
      case 'clicks':
        return this.compareMetric(metrics.clicks || 0, condition.operator, condition.threshold);
      case 'saves':
        return this.compareMetric(metrics.saves || 0, condition.operator, condition.threshold);
      case 'time':
        const hoursSinceCreated =
          (Date.now() - new Date(variant.createdAt).getTime()) / (1000 * 60 * 60);
        return this.compareMetric(hoursSinceCreated, condition.operator, condition.threshold);
      case 'viralityScore':
        return this.compareMetric(
          variant.viralityScore || 0,
          condition.operator,
          condition.threshold
        );
      default:
        return false;
    }
  }

  /**
   * Compare metric value against threshold
   */
  private compareMetric(value: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case '<':
        return value < threshold;
      case '<=':
        return value <= threshold;
      case '>':
        return value > threshold;
      case '>=':
        return value >= threshold;
      case '==':
        return value === threshold;
      default:
        return false;
    }
  }

  /**
   * Execute rule action (kill, pause, pivot, alert)
   */
  private async executeRule(rule: unknown, variant: unknown): Promise<any> {
    const triggerReason = this.generateTriggerReason(rule, variant);
    const learnings = this.extractLearnings(rule, variant);

    // Execute action
    let actionTaken = 'none';
    switch (rule.action) {
      case 'kill':
        await storage.updateAdCampaignVariant(variant.id, { status: 'killed' });
        actionTaken = 'killed';
        break;
      case 'pause':
        await storage.updateAdCampaignVariant(variant.id, { status: 'paused' });
        actionTaken = 'paused';
        break;
      case 'pivot':
        await this.executePivot(rule.pivotStrategy, variant);
        actionTaken = 'pivoted';
        break;
      case 'alert':
        // Would send notification via notificationService
        actionTaken = 'alerted';
        break;
    }

    // Record execution
    const execution = await storage.createAdRuleExecution({
      ruleId: rule.id,
      variantId: variant.id,
      triggerReason,
      actionTaken,
      metricsSnapshot: variant.actualMetrics,
      learnings,
    });

    // Update rule trigger count
    await storage.updateAdKillRule(rule.id, {
      triggeredCount: (rule.triggeredCount || 0) + 1,
      lastTriggeredAt: new Date(),
    });

    return execution;
  }

  /**
   * Generate human-readable trigger reason
   */
  private generateTriggerReason(rule: unknown, variant: unknown): string {
    const { condition } = rule;
    const metrics = variant.actualMetrics || {};
    const actualValue = metrics[condition.metric] || 0;

    const duration = this.getRunDuration(variant);
    return `${condition.metric.toUpperCase()} (${this.formatMetric(actualValue, condition.metric)}) ${condition.operator} threshold (${this.formatMetric(condition.threshold, condition.metric)}) after ${duration} hours`;
  }

  /**
   * Extract learnings from rule execution
   */
  private extractLearnings(rule: unknown, variant: unknown): string {
    const learnings: string[] = [];
    const metrics = variant.actualMetrics || {};

    // Organic performance learnings
    if (metrics.engagement && variant.predictedEngagement) {
      const performanceRatio = metrics.engagement / variant.predictedEngagement;
      if (performanceRatio < 0.5) {
        learnings.push(
          `Organic engagement ${Math.round((1 - performanceRatio) * 100)}% below prediction - content may not resonate with audience`
        );
      } else if (performanceRatio > 1.5) {
        learnings.push(
          `Organic engagement ${Math.round((performanceRatio - 1) * 100)}% above prediction - high-performing content, allocate more reach to similar posts`
        );
      }
    }

    // Platform-specific learnings
    learnings.push(
      `${variant.platform} organic performance: ${this.formatMetricSnapshot(metrics)}`
    );

    // Virality learnings
    if (variant.viralityScore) {
      if (variant.viralityScore < 50) {
        learnings.push(
          'Low virality score - optimize with more hashtags, questions, and visual content'
        );
      } else if (variant.viralityScore > 80) {
        learnings.push('High virality score - excellent organic amplification potential');
      }
    }

    // Cost savings learnings
    const organicReach = metrics.reach || 0;
    if (organicReach > 0) {
      learnings.push(
        `Achieved ${organicReach} organic reach with $0 ad spend - equivalent to ~$${this.estimateAdSpendEquivalent(organicReach, variant.platform)} in traditional advertising`
      );
    }

    return learnings.join('. ');
  }

  /**
   * Execute pivot strategy
   */
  private async executePivot(strategy: unknown, variant: unknown): Promise<void> {
    if (!strategy) return;

    if (strategy.reallocateBudget) {
      // Find best performing variant in campaign
      const allVariants = await storage.getCampaignVariants(variant.campaignId);
      const bestVariant = allVariants.reduce((best, v) => {
        const bestEngagement = best.actualMetrics?.engagement || 0;
        const currentEngagement = v.actualMetrics?.engagement || 0;
        return currentEngagement > bestEngagement ? v : best;
      }, allVariants[0]);

      if (bestVariant && bestVariant.id !== variant.id) {
        // In organic posting, "budget" means posting frequency/reach
        // Increase frequency for best performer, decrease for underperformer
        const note = `Pivot: Increasing posting frequency for high-performing ${bestVariant.platform} content`;
        logger.info(note);
      }
    }

    if (strategy.swapCreative) {
      // Pause underperforming variant
      await storage.updateAdCampaignVariant(variant.id, { status: 'paused' });
      // Would create new variant with different creative
      logger.info(
        `Pivot: Paused underperforming ${variant.platform} variant, recommend new creative`
      );
    }
  }

  /**
   * Format metric for display
   */
  private formatMetric(value: number, metricType: string): string {
    switch (metricType) {
      case 'engagement':
      case 'ctr':
        return `${(value * 100).toFixed(2)}%`;
      case 'reach':
      case 'shares':
      case 'clicks':
      case 'saves':
        return value.toLocaleString();
      case 'viralityScore':
        return `${value}/100`;
      default:
        return value.toFixed(2);
    }
  }

  /**
   * Format metrics snapshot
   */
  private formatMetricSnapshot(metrics: unknown): string {
    const parts: string[] = [];

    if (metrics.reach) parts.push(`${metrics.reach} reach`);
    if (metrics.engagement) parts.push(`${(metrics.engagement * 100).toFixed(1)}% engagement`);
    if (metrics.shares) parts.push(`${metrics.shares} shares`);
    if (metrics.clicks) parts.push(`${metrics.clicks} clicks`);
    if (metrics.saves) parts.push(`${metrics.saves} saves`);

    return parts.join(', ') || 'No metrics yet';
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
    return Math.round((Date.now() - new Date(variant.createdAt).getTime()) / (1000 * 60 * 60));
  }
}
