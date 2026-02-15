import { logger } from '../../server/logger.ts';

interface SmokeTest {
  name: string;
  critical: boolean;
  test: () => Promise<boolean>;
}

class PostDeploymentSmokeTests {
  private tests: SmokeTest[] = [];
  private results: Array<{ name: string; passed: boolean; error?: string }> = [];

  constructor() {
    this.registerTests();
  }

  private registerTests(): void {
    this.tests = [
      {
        name: 'API Health Check',
        critical: true,
        test: async () => {
          const response = await fetch('http://localhost:5000/api/monitoring/system-health');
          const data = await response.json();
          return data.success && data.healthy;
        },
      },
      {
        name: 'Database Connection',
        critical: true,
        test: async () => {
          const response = await fetch('http://localhost:5000/api/monitoring/system-health');
          const data = await response.json();
          return data.success && data.healthy;
        },
      },
      {
        name: 'Redis/Queue System',
        critical: true,
        test: async () => {
          const response = await fetch('http://localhost:5000/api/monitoring/queue-health');
          const data = await response.json();
          return data.healthy === true;
        },
      },
      {
        name: 'AI Model Telemetry',
        critical: false,
        test: async () => {
          const response = await fetch('http://localhost:5000/api/monitoring/ai-models');
          const data = await response.json();
          return data.success === true;
        },
      },
      {
        name: 'Monitoring Dashboard',
        critical: false,
        test: async () => {
          const response = await fetch('http://localhost:5000/api/monitoring/dashboard');
          const data = await response.json();
          return data.success === true;
        },
      },
      {
        name: 'Alerting Configuration',
        critical: false,
        test: async () => {
          const response = await fetch('http://localhost:5000/api/monitoring/alerting/config');
          const data = await response.json();
          return data.success === true;
        },
      },
      {
        name: 'Frontend Accessibility',
        critical: true,
        test: async () => {
          const response = await fetch('http://localhost:5000/');
          return response.ok;
        },
      },
      {
        name: 'Static Assets',
        critical: false,
        test: async () => {
          const response = await fetch('http://localhost:5000/assets/index.css');
          return response.ok;
        },
      },
    ];
  }

  async runAllTests(): Promise<{ passed: boolean; criticalFailures: number }> {
    logger.info(`
╔═══════════════════════════════════════════════════════════════╗
║            POST-DEPLOYMENT SMOKE TESTS                        ║
╠═══════════════════════════════════════════════════════════════╣
║  Running ${this.tests.length} smoke tests to validate deployment...        ║
╚═══════════════════════════════════════════════════════════════╝
    `);

    for (const test of this.tests) {
      try {
        logger.info(`\n🔍 Testing: ${test.name}...`);
        const passed = await test.test();

        this.results.push({ name: test.name, passed });

        if (passed) {
          logger.info(`   ✅ PASS`);
        } else {
          logger.error(`   ❌ FAIL${test.critical ? ' (CRITICAL)' : ''}`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        this.results.push({ name: test.name, passed: false, error: errorMsg });
        logger.error(`   ❌ ERROR: ${errorMsg}${test.critical ? ' (CRITICAL)' : ''}`);
      }
    }

    return this.generateReport();
  }

  private generateReport(): { passed: boolean; criticalFailures: number } {
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.passed).length;
    const failedTests = this.results.filter(r => !r.passed).length;

    const criticalTests = this.tests.filter(t => t.critical);
    const criticalFailures = this.results.filter(r => {
      const test = this.tests.find(t => t.name === r.name);
      return !r.passed && test?.critical;
    }).length;

    console.log('\n' + '═'.repeat(70));
    console.log('             POST-DEPLOYMENT TEST RESULTS');
    console.log('═'.repeat(70) + '\n');

    console.log(`Total Tests:         ${totalTests}`);
    console.log(`Passed:              ${passedTests} ✅`);
    console.log(`Failed:              ${failedTests} ❌`);
    console.log(`Critical Failures:   ${criticalFailures} ${criticalFailures > 0 ? '🚨' : '✅'}\n`);

    console.log('═'.repeat(70));
    console.log('                  DETAILED RESULTS');
    console.log('═'.repeat(70) + '\n');

    for (const result of this.results) {
      const test = this.tests.find(t => t.name === result.name);
      const icon = result.passed ? '✅' : '❌';
      const critical = test?.critical ? ' (CRITICAL)' : '';

      console.log(`${icon} ${result.name}${critical}`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    }

    console.log('\n' + '═'.repeat(70));

    if (criticalFailures === 0 && passedTests === totalTests) {
      console.log('                ✅ DEPLOYMENT: SUCCESSFUL');
      console.log('');
      console.log('  All smoke tests passed. Deployment verified.');
    } else if (criticalFailures === 0) {
      console.log('                ⚠️ DEPLOYMENT: PARTIAL SUCCESS');
      console.log('');
      console.log('  Critical tests passed, but some non-critical tests failed.');
      console.log('  Review failures for optimal operation.');
    } else {
      console.log('                ❌ DEPLOYMENT: FAILED');
      console.log('');
      console.log('  Critical smoke tests failed. Immediate action required!');
      console.log('  Consider rolling back deployment.');
    }

    console.log('═'.repeat(70) + '\n');

    return {
      passed: criticalFailures === 0,
      criticalFailures,
    };
  }
}

const smokeTests = new PostDeploymentSmokeTests();
smokeTests.runAllTests().then(({ passed }) => {
  process.exit(passed ? 0 : 1);
}).catch((error) => {
  logger.error('Smoke tests failed:', error);
  process.exit(1);
});
