#!/usr/bin/env tsx

import DatabaseOptimizer from '../database/optimize-database';
import { logger } from './logger.js';

async function main() {
  logger.info('🎯 Max Booster Database Optimization Script');
  logger.info('==========================================\n');

  const optimizer = new DatabaseOptimizer();

  try {
    // Step 1: Execute optimization
    await optimizer.executeOptimization();

    // Step 2: Validate results
    logger.info('\n');
    const isValid = await optimizer.validateOptimizations();

    if (isValid) {
      logger.info('\n✅ All critical indexes validated successfully!');
    } else {
      logger.info('\n❌ Some critical indexes are missing. Please review the results above.');
    }

    // Step 3: Analyze performance
    await optimizer.analyzeQueryPerformance();

    logger.info('\n🎉 Database optimization process completed!');
    logger.info('\n📈 Your Max Booster platform is now optimized for:');
    logger.info('   • High-performance user queries');
    logger.info('   • Lightning-fast analytics dashboards');
    logger.info('   • Efficient distribution system');
    logger.info('   • Rapid search capabilities');
    logger.info('   • Scalable financial reporting');
  } catch (error: unknown) {
    logger.warn({ err: error }, '❌ Database optimization failed:');
    process.exit(1);
  }
}

// Execute if called directly
if (require.main === module) {
  main()
    .then(() => {
      logger.info('\n✨ Optimization complete. Exiting...');
      process.exit(0);
    })
    .catch((error) => {
      logger.warn({ err: error }, 'Fatal error:');
      process.exit(1);
    });
}

export default main;
