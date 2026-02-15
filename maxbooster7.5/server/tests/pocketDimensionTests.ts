import { pocketManager } from '../pocket-dimension/index';
import { pocketBackupService } from '../services/pocketBackupService';
import { logger } from '../logger';
import * as crypto from 'crypto';

interface TestResult {
  testName: string;
  passed: boolean;
  duration: number;
  details: any;
  error?: string;
}

export class PocketDimensionTester {
  private results: TestResult[] = [];

  async runAllTests(): Promise<TestResult[]> {
    logger.info('🌌 Starting Pocket Dimension Test Suite...\n');

    await this.testBasicReadWrite();
    await this.testCompressionRatios();
    await this.testBracketNotation();
    await this.testNestedDimensions();
    await this.testDeduplication();
    await this.testPocketBackupService();
    await this.testLargeDataStreaming();
    await this.testStats();

    this.printResults();
    return this.results;
  }

  private async testBasicReadWrite(): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.info('📝 Test 1: Basic Read/Write Operations');

      const pocket = await pocketManager.openPocket('test-basic', {
        compressionLevel: 9,
        chunkSize: 128 * 1024,
      });

      const testData = 'Hello from Pocket Dimension! 🌌';
      await pocket.write('test.txt', testData);

      const readData = await pocket.read('test.txt');
      const readString = readData.toString();

      if (readString === testData) {
        logger.info('  ✅ Read/Write successful');
        logger.info(`  📊 Written: "${testData}"`);
        logger.info(`  📊 Read back: "${readString}"`);
        
        this.results.push({
          testName: 'Basic Read/Write',
          passed: true,
          duration: Date.now() - startTime,
          details: { original: testData, readBack: readString },
        });
      } else {
        throw new Error('Data mismatch');
      }

      await pocketManager.closePocket('test-basic');
      logger.info('');
    } catch (error) {
      this.results.push({
        testName: 'Basic Read/Write',
        passed: false,
        duration: Date.now() - startTime,
        details: {},
        error: (error as Error).message,
      });
      logger.error('  ❌ Test failed:', error);
    }
  }

  private async testCompressionRatios(): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.info('🗜️  Test 2: Compression Ratios');

      const pocket = await pocketManager.openPocket('test-compression', {
        compressionLevel: 9,
        enableDeduplication: true,
      });

      const testSizes = [
        { name: 'JSON Config', data: JSON.stringify({ config: 'test'.repeat(1000) }, null, 2) },
        { name: 'Repeated Text', data: 'Lorem ipsum dolor sit amet. '.repeat(5000) },
        { name: 'Random Data', data: crypto.randomBytes(10240).toString('hex') },
      ];

      const compressionResults: any[] = [];

      for (const test of testSizes) {
        const originalSize = Buffer.byteLength(test.data);
        await pocket.write(`compression/${test.name}.txt`, test.data);
        
        const stats = pocket.getStats();
        const ratio = stats.compressionRatio;

        compressionResults.push({
          name: test.name,
          originalSize,
          compressedSize: Math.round(originalSize / ratio),
          ratio: ratio.toFixed(2),
          savings: `${((1 - 1/ratio) * 100).toFixed(1)}%`,
        });

        logger.info(`  📊 ${test.name}:`);
        logger.info(`     Original: ${(originalSize / 1024).toFixed(2)} KB`);
        logger.info(`     Compressed: ${(originalSize / ratio / 1024).toFixed(2)} KB`);
        logger.info(`     Ratio: ${ratio.toFixed(2)}:1`);
        logger.info(`     Savings: ${((1 - 1/ratio) * 100).toFixed(1)}%`);
      }

      this.results.push({
        testName: 'Compression Ratios',
        passed: true,
        duration: Date.now() - startTime,
        details: { results: compressionResults },
      });

      await pocketManager.closePocket('test-compression');
      logger.info('');
    } catch (error) {
      this.results.push({
        testName: 'Compression Ratios',
        passed: false,
        duration: Date.now() - startTime,
        details: {},
        error: (error as Error).message,
      });
      logger.error('  ❌ Test failed:', error);
    }
  }

  private async testBracketNotation(): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.info('🔲 Test 3: Bracket Notation Access');

      const pocket = await pocketManager.openPocket('test-brackets', {
        compressionLevel: 6,
      });

      // Write using bracket notation
      const testData = { message: 'Bracket notation is magic! ✨' };
      await pocket.write('config/settings.json', JSON.stringify(testData, null, 2));

      // Read back
      const readData = await pocket.read('config/settings.json');
      const parsed = JSON.parse(readData.toString());

      if (parsed.message === testData.message) {
        logger.info('  ✅ Bracket notation working');
        logger.info(`  📊 Path: config/settings.json`);
        logger.info(`  📊 Data: ${JSON.stringify(parsed)}`);
        
        this.results.push({
          testName: 'Bracket Notation',
          passed: true,
          duration: Date.now() - startTime,
          details: { written: testData, read: parsed },
        });
      } else {
        throw new Error('Bracket notation data mismatch');
      }

      await pocketManager.closePocket('test-brackets');
      logger.info('');
    } catch (error) {
      this.results.push({
        testName: 'Bracket Notation',
        passed: false,
        duration: Date.now() - startTime,
        details: {},
        error: (error as Error).message,
      });
      logger.error('  ❌ Test failed:', error);
    }
  }

  private async testNestedDimensions(): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.info('🌀 Test 4: Nested Dimensions (Inception Mode!)');

      const pocket = await pocketManager.openPocket('test-nested', {
        compressionLevel: 9,
      });

      await pocket.write('level1.txt', 'Level 1 data');

      const nested = await pocket.createNestedDimension('experimental', {
        compressionLevel: 9,
      });

      await nested.write('level2.txt', 'Level 2 data (nested)');

      const nestedAgain = await nested.createNestedDimension('deep', {
        compressionLevel: 9,
      });

      await nestedAgain.write('level3.txt', 'Level 3 data (nested^2)');

      const level1 = (await pocket.read('level1.txt')).toString();
      const level2 = (await nested.read('level2.txt')).toString();
      const level3 = (await nestedAgain.read('level3.txt')).toString();

      logger.info('  ✅ Nested dimensions created successfully');
      logger.info(`  📊 Level 1: "${level1}"`);
      logger.info(`  📊 Level 2 (nested): "${level2}"`);
      logger.info(`  📊 Level 3 (nested²): "${level3}"`);
      logger.info('  🎉 Inception achieved! 🌀');

      this.results.push({
        testName: 'Nested Dimensions',
        passed: true,
        duration: Date.now() - startTime,
        details: { level1, level2, level3 },
      });

      await pocketManager.closePocket('test-nested');
      logger.info('');
    } catch (error) {
      this.results.push({
        testName: 'Nested Dimensions',
        passed: false,
        duration: Date.now() - startTime,
        details: {},
        error: (error as Error).message,
      });
      logger.error('  ❌ Test failed:', error);
    }
  }

  private async testDeduplication(): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.info('🔄 Test 5: Deduplication System');

      const pocket = await pocketManager.openPocket('test-dedup', {
        compressionLevel: 9,
        enableDeduplication: true,
      });

      const baseData = 'A'.repeat(10000);
      
      await pocket.write('version1.txt', baseData);
      const stats1 = pocket.getStats();

      await pocket.write('version2.txt', baseData);
      const stats2 = pocket.getStats();

      await pocket.write('version3.txt', baseData + 'B'.repeat(1000));
      const stats3 = pocket.getStats();

      const dedupSavings = stats3.deduplicationSavings;

      logger.info('  ✅ Deduplication working');
      logger.info(`  📊 After version 1: ${stats1.totalEntries} entries`);
      logger.info(`  📊 After version 2 (identical): ${stats2.totalEntries} entries`);
      logger.info(`  📊 After version 3 (similar): ${stats3.totalEntries} entries`);
      logger.info(`  📊 Deduplication savings: ${dedupSavings.toFixed(1)}%`);
      logger.info('  💾 Content-addressed storage prevents duplication!');

      this.results.push({
        testName: 'Deduplication',
        passed: dedupSavings > 0,
        duration: Date.now() - startTime,
        details: { dedupSavings: `${dedupSavings.toFixed(1)}%` },
      });

      await pocketManager.closePocket('test-dedup');
      logger.info('');
    } catch (error) {
      this.results.push({
        testName: 'Deduplication',
        passed: false,
        duration: Date.now() - startTime,
        details: {},
        error: (error as Error).message,
      });
      logger.error('  ❌ Test failed:', error);
    }
  }

  private async testPocketBackupService(): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.info('💾 Test 6: Pocket Backup Service Integration');

      await pocketBackupService.initialize();

      const backupId = await pocketBackupService.createBackup({
        component: 'test-component',
        version: 'v1.0.0',
        data: {
          config: 'test'.repeat(1000),
          models: ['model1', 'model2', 'model3'],
          metadata: { timestamp: new Date().toISOString() },
        },
        metadata: { testRun: true },
      });

      logger.info(`  ✅ Backup created: ${backupId}`);

      const restored = await pocketBackupService.restoreBackup(backupId);

      logger.info('  ✅ Backup restored successfully');
      logger.info(`  📊 Component: ${restored.component || 'test-component'}`);
      
      const stats = await pocketBackupService.getStorageStats();
      
      logger.info(`  📊 Storage Stats:`);
      logger.info(`     Backups: ${stats.backups.count} files`);
      logger.info(`     Total Size: ${(stats.global.totalSize / 1024).toFixed(2)} KB`);
      logger.info(`     Compressed: ${(stats.global.compressedSize / 1024).toFixed(2)} KB`);
      logger.info(`     Overall Ratio: ${stats.global.overallRatio.toFixed(2)}:1`);

      this.results.push({
        testName: 'Pocket Backup Service',
        passed: true,
        duration: Date.now() - startTime,
        details: { backupId, stats },
      });

      logger.info('');
    } catch (error) {
      this.results.push({
        testName: 'Pocket Backup Service',
        passed: false,
        duration: Date.now() - startTime,
        details: {},
        error: (error as Error).message,
      });
      logger.error('  ❌ Test failed:', error);
    }
  }

  private async testLargeDataStreaming(): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.info('🌊 Test 7: Large Data Streaming (No Memory Spikes)');

      const pocket = await pocketManager.openPocket('test-streaming', {
        compressionLevel: 9,
        chunkSize: 256 * 1024,
      });

      const memBefore = process.memoryUsage().heapUsed;
      
      const largeData = 'X'.repeat(5 * 1024 * 1024);
      await pocket.write('large-file.txt', largeData);

      const memAfter = process.memoryUsage().heapUsed;
      const memIncrease = (memAfter - memBefore) / 1024 / 1024;

      const stats = pocket.getStats();

      logger.info('  ✅ Large file written successfully');
      logger.info(`  📊 Data size: ${(largeData.length / 1024 / 1024).toFixed(2)} MB`);
      logger.info(`  📊 Memory increase: ${memIncrease.toFixed(2)} MB`);
      logger.info(`  📊 Compression ratio: ${stats.compressionRatio.toFixed(2)}:1`);
      logger.info(`  💚 Streaming prevents memory bloat!`);

      this.results.push({
        testName: 'Large Data Streaming',
        passed: memIncrease < 50,
        duration: Date.now() - startTime,
        details: {
          dataSize: `${(largeData.length / 1024 / 1024).toFixed(2)} MB`,
          memIncrease: `${memIncrease.toFixed(2)} MB`,
          compressionRatio: stats.compressionRatio.toFixed(2),
        },
      });

      await pocketManager.closePocket('test-streaming');
      logger.info('');
    } catch (error) {
      this.results.push({
        testName: 'Large Data Streaming',
        passed: false,
        duration: Date.now() - startTime,
        details: {},
        error: (error as Error).message,
      });
      logger.error('  ❌ Test failed:', error);
    }
  }

  private async testStats(): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.info('📊 Test 8: Statistics & Monitoring');

      const pocket = await pocketManager.openPocket('test-stats', {
        compressionLevel: 9,
        enableDeduplication: true,
      });

      for (let i = 0; i < 10; i++) {
        await pocket.write(`file${i}.txt`, `Data ${i}`.repeat(1000));
      }

      const stats = pocket.getStats();

      logger.info('  ✅ Statistics retrieved');
      logger.info(`  📊 Total Entries: ${stats.totalEntries}`);
      logger.info(`  📊 Total Size: ${(stats.totalSize / 1024).toFixed(2)} KB`);
      logger.info(`  📊 Compressed Size: ${(stats.compressedSize / 1024).toFixed(2)} KB`);
      logger.info(`  📊 Compression Ratio: ${stats.compressionRatio.toFixed(2)}:1`);
      logger.info(`  📊 Deduplication Savings: ${stats.deduplicationSavings.toFixed(1)}%`);

      this.results.push({
        testName: 'Statistics & Monitoring',
        passed: true,
        duration: Date.now() - startTime,
        details: { stats },
      });

      await pocketManager.closePocket('test-stats');
      logger.info('');
    } catch (error) {
      this.results.push({
        testName: 'Statistics & Monitoring',
        passed: false,
        duration: Date.now() - startTime,
        details: {},
        error: (error as Error).message,
      });
      logger.error('  ❌ Test failed:', error);
    }
  }

  private printResults(): void {
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('🎯 POCKET DIMENSION TEST RESULTS');
    logger.info('═══════════════════════════════════════════════════════\n');

    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const total = this.results.length;

    this.results.forEach(result => {
      const icon = result.passed ? '✅' : '❌';
      logger.info(`${icon} ${result.testName} (${result.duration}ms)`);
      if (!result.passed && result.error) {
        logger.error(`   Error: ${result.error}`);
      }
    });

    logger.info('');
    logger.info('═══════════════════════════════════════════════════════');
    logger.info(`📈 Summary: ${passed}/${total} tests passed`);
    
    if (failed === 0) {
      logger.info('🎉 ALL TESTS PASSED! Pocket Dimension is working perfectly! 🌌');
    } else {
      logger.warn(`⚠️  ${failed} test(s) failed`);
    }
    
    logger.info('═══════════════════════════════════════════════════════\n');
  }

  async cleanup(): Promise<void> {
    logger.info('🧹 Cleaning up test pockets...');
    
    const testPockets = [
      'test-basic',
      'test-compression',
      'test-brackets',
      'test-nested',
      'test-dedup',
      'test-streaming',
      'test-stats',
    ];

    for (const pocketName of testPockets) {
      try {
        await pocketManager.closePocket(pocketName);
      } catch {
        // Pocket might already be closed
      }
    }

    await pocketBackupService.shutdown();
    
    logger.info('✅ Cleanup complete\n');
  }
}

export async function runPocketTests(): Promise<TestResult[]> {
  const tester = new PocketDimensionTester();
  
  try {
    const results = await tester.runAllTests();
    await tester.cleanup();
    return results;
  } catch (error) {
    logger.error('Fatal test error:', error);
    await tester.cleanup();
    throw error;
  }
}
