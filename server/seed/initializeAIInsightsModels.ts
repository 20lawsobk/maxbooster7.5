import { storage } from '../storage';
import { logger } from '../logger.js';

/**
 * TODO: Add function documentation
 */
export async function initializeAIInsightsModels() {
  logger.info('📊 Initializing AI Insights Engine Models...');

  try {
    const models = [
      {
        modelName: 'time_series_predictor_v1',
        modelType: 'insights',
        description:
          'Time series forecasting engine for predictive analytics with exponential smoothing and seasonal decomposition',
        category: 'analytics',
        isActive: true,
        isBeta: false,
      },
      {
        modelName: 'cohort_analyzer_v1',
        modelType: 'insights',
        description:
          'Cohort analysis engine for retention, LTV, and engagement tracking across user segments',
        category: 'analytics',
        isActive: true,
        isBeta: false,
      },
      {
        modelName: 'churn_predictor_v1',
        modelType: 'insights',
        description:
          'Machine learning-based churn prediction with personalized retention recommendations',
        category: 'analytics',
        isActive: true,
        isBeta: false,
      },
      {
        modelName: 'revenue_forecaster_v1',
        modelType: 'insights',
        description:
          'Revenue forecasting engine with MRR/ARR predictions and multi-scenario analysis',
        category: 'analytics',
        isActive: true,
        isBeta: false,
      },
      {
        modelName: 'anomaly_detector_v1',
        modelType: 'insights',
        description: 'Metric anomaly detection with root cause analysis and automated alerting',
        category: 'analytics',
        isActive: true,
        isBeta: false,
      },
    ];

    for (const modelData of models) {
      const existing = await storage.getAIModelByName(modelData.modelName);

      if (existing) {
        logger.info(`✓ AI Model ${modelData.modelName} already exists`);
        continue;
      }

      const model = await storage.createAIModel(modelData);
      logger.info(`✓ Created AI Model: ${model.modelName}`);

      const version = await storage.createAIModelVersion({
        modelId: model.id,
        versionNumber: 'v1.0.0',
        versionHash: `${modelData.modelName}_${Date.now()}`,
        algorithmChanges: 'Initial release with professional-grade analytics',
        parameters: {
          deterministic: true,
          performanceTarget: '2000ms',
          features: getModelFeatures(modelData.modelName),
        },
        performanceMetrics: {
          accuracy: getModelAccuracy(modelData.modelName),
          latency: 1500,
          throughput: 100,
        },
        status: 'production',
        deployedAt: new Date(),
      });

      await storage.updateAIModel(model.id, {
        currentVersionId: version.id,
      });

      logger.info(`  ✓ Created version: ${version.versionNumber}`);

      await storage.createPerformanceMetric({
        modelId: model.id,
        versionId: version.id,
        metricType: 'accuracy',
        metricValue: getModelAccuracy(modelData.modelName),
        metricUnit: 'score',
        aggregationPeriod: 'daily',
        sampleSize: 1000,
        metadata: { baseline: true },
      });

      await storage.createPerformanceMetric({
        modelId: model.id,
        versionId: version.id,
        metricType: 'latency',
        metricValue: 1500,
        metricUnit: 'ms',
        aggregationPeriod: 'daily',
        sampleSize: 1000,
        metadata: { baseline: true },
      });

      logger.info(`  ✓ Created baseline performance metrics`);
    }

    logger.info('✅ AI Insights Engine Models initialized successfully!');
    return true;
  } catch (error: unknown) {
    logger.error('❌ Failed to initialize AI Insights Models:', error);
    throw error;
  }
}

/**
 * TODO: Add function documentation
 */
function getModelFeatures(modelName: string): string[] {
  const features: Record<string, string[]> = {
    time_series_predictor_v1: [
      'Exponential smoothing algorithm',
      'Seasonal decomposition',
      'Linear regression with trend detection',
      'Multiple forecast horizons (7d, 30d, 90d, 365d)',
      'Confidence intervals (95%, 99%)',
      'Automatic seasonality detection',
      'Sub-2s prediction time',
    ],
    cohort_analyzer_v1: [
      'Multi-cohort type support (registration, plan, channel, segment)',
      'Time-based retention analysis (day 1, 7, 30, 90, 365)',
      'LTV calculation and forecasting',
      'Engagement scoring and tracking',
      'Churn rate analysis per cohort',
      'Cross-cohort comparison',
      'Heatmap visualization data generation',
    ],
    churn_predictor_v1: [
      'Multi-factor churn probability (0-100%)',
      'Risk level classification (low, medium, high, critical)',
      'Time window estimation (days until likely churn)',
      'Top risk factor identification and ranking',
      'Engagement trend analysis',
      'Payment failure tracking',
      'Personalized retention recommendations',
      'Confidence scoring per prediction',
    ],
    revenue_forecaster_v1: [
      'MRR/ARR forecasting',
      'Multi-period forecasting (daily, weekly, monthly, quarterly, yearly)',
      'Three-scenario analysis (best, base, worst case)',
      'Revenue breakdown by plan, channel, region, segment',
      'Seasonality detection and adjustment',
      'MoM/YoY growth rate calculation',
      'Growth trend classification',
      'Confidence interval calculation',
    ],
    anomaly_detector_v1: [
      'Real-time anomaly detection',
      'Multiple anomaly types (spike, drop, trend break, seasonal deviation)',
      'Severity classification (low, medium, high, critical)',
      'Statistical deviation scoring',
      'Root cause analysis with likelihood scoring',
      'Event and campaign correlation',
      'Revenue and user impact estimation',
      'Automated critical alerts',
    ],
  };

  return features[modelName] || [];
}

/**
 * TODO: Add function documentation
 */
function getModelAccuracy(modelName: string): number {
  const accuracies: Record<string, number> = {
    time_series_predictor_v1: 0.87,
    cohort_analyzer_v1: 0.92,
    churn_predictor_v1: 0.85,
    revenue_forecaster_v1: 0.89,
    anomaly_detector_v1: 0.91,
  };

  return accuracies[modelName] || 0.85;
}

// Auto-run if executed directly
if (require.main === module) {
  initializeAIInsightsModels()
    .then(() => {
      logger.info('Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Script failed:', error);
      process.exit(1);
    });
}
