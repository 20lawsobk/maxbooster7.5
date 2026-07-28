/**
 * Autopilot Coordination Module
 * Exports all coordination components for rule-based + learning hybrid architecture
 */

export * from "./AutopilotCoordinator.js";
export * from "./SocialMediaRuleEngine.js";
export * from "./AdvertisingRuleEngine.js";
export * from "./FeatureStore.js";

import { autopilotCoordinator } from "./AutopilotCoordinator.js";
import { socialMediaRuleEngine } from "./SocialMediaRuleEngine.js";
import { advertisingRuleEngine } from "./AdvertisingRuleEngine.js";
import { featureStore } from "./FeatureStore.js";

export const coordination = {
  autopilotCoordinator,
  socialMediaRuleEngine,
  advertisingRuleEngine,
  featureStore,
};

export type {
  AudienceInsight,
  TimingSignal,
  PerformanceLift,
  CampaignState,
  ExecutionIntent,
  CoordinationDecision,
  ConflictResolutionStrategy,
} from "./AutopilotCoordinator.js";

export type {
  PlatformLimits,
  ContentGuideline,
  SchedulingRule,
  SchedulingContext,
  RuleEvaluationResult,
} from "./SocialMediaRuleEngine.js";

export type {
  BudgetConstraints,
  TargetingConstraints,
  ComplianceRule,
  AdContext,
  BudgetAllocationRule,
  AdRuleEvaluationResult,
} from "./AdvertisingRuleEngine.js";

export type {
  AudienceCohort,
  TimingPattern,
  ContentPerformance,
  CampaignInsight,
  CrossSystemMetrics,
  LearningEvent,
} from "./FeatureStore.js";
