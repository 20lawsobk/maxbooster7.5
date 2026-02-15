import { runPocketTests } from './tests/pocketDimensionTests';
import { logger } from './logger';

async function main() {
  logger.info('🚀 Starting Pocket Dimension Test Suite\n');
  
  try {
    const results = await runPocketTests();
    
    const passedCount = results.filter(r => r.passed).length;
    const totalCount = results.length;
    
    if (passedCount === totalCount) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (error) {
    logger.error('Test suite failed:', error);
    process.exit(1);
  }
}

main();
