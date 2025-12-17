import { logger } from '../server/logger.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface DeploymentStep {
  name: string;
  command?: string;
  manual?: boolean;
  critical: boolean;
  rollbackCommand?: string;
}

class DeploymentRunbook {
  private steps: DeploymentStep[] = [];
  private executedSteps: string[] = [];

  constructor() {
    this.defineSteps();
  }

  private defineSteps(): void {
    this.steps = [
      {
        name: '1. Pre-deployment validation',
        command: 'tsx scripts/pre-deployment-checklist.ts',
        critical: true,
      },
      {
        name: '2. Verify backups',
        command: 'tsx scripts/verify-backups.ts',
        critical: true,
      },
      {
        name: '3. Run smoke tests',
        command: 'tsx tests/smoke/post-deployment-tests.ts',
        critical: false,
      },
      {
        name: '4. Check performance regression',
        manual: true,
        critical: false,
      },
      {
        name: '5. Save pre-deployment baseline',
        manual: true,
        critical: false,
      },
      {
        name: '6. Build production bundle',
        command: 'npm run build',
        critical: true,
        rollbackCommand: 'rm -rf dist',
      },
      {
        name: '7. Deploy to production',
        manual: true,
        critical: true,
      },
      {
        name: '8. Run post-deployment smoke tests',
        command: 'tsx tests/smoke/post-deployment-tests.ts',
        critical: true,
      },
      {
        name: '9. Verify monitoring systems',
        manual: true,
        critical: true,
      },
      {
        name: '10. Save post-deployment baseline',
        manual: true,
        critical: false,
      },
    ];
  }

  async execute(): Promise<boolean> {
    logger.info(`
╔═══════════════════════════════════════════════════════════════╗
║              DEPLOYMENT RUNBOOK EXECUTION                     ║
╠═══════════════════════════════════════════════════════════════╣
║  Total Steps:     ${this.steps.length}                                       ║
║  Critical Steps:  ${this.steps.filter(s => s.critical).length}                                       ║
╚═══════════════════════════════════════════════════════════════╝
    `);

    for (const step of this.steps) {
      logger.info(`\n📋 ${step.name}`);

      if (step.manual) {
        logger.info(`   ⚠️  MANUAL STEP - Complete this step manually`);
        logger.info(`   ${step.critical ? '❗ CRITICAL - Do not skip' : 'ℹ️  Recommended but optional'}`);
        continue;
      }

      if (step.command) {
        try {
          logger.info(`   ▶️  Executing: ${step.command}`);
          const { stdout, stderr } = await execAsync(step.command);

          if (stdout) logger.info(stdout);
          if (stderr) logger.warn(stderr);

          logger.info(`   ✅ COMPLETED`);
          this.executedSteps.push(step.name);
        } catch (error) {
          logger.error(`   ❌ FAILED: ${error}`);

          if (step.critical) {
            logger.error('\n🚨 CRITICAL STEP FAILED - ABORTING DEPLOYMENT\n');
            await this.rollback();
            return false;
          } else {
            logger.warn('   ⚠️  Non-critical step failed, continuing...');
          }
        }
      }
    }

    this.printSummary();
    return true;
  }

  private async rollback(): Promise<void> {
    logger.warn('\n🔄 Initiating rollback...\n');

    for (const stepName of this.executedSteps.reverse()) {
      const step = this.steps.find(s => s.name === stepName);

      if (step?.rollbackCommand) {
        try {
          logger.info(`   ↩️  Rolling back: ${step.name}`);
          await execAsync(step.rollbackCommand);
          logger.info(`   ✅ Rolled back`);
        } catch (error) {
          logger.error(`   ❌ Rollback failed: ${error}`);
        }
      }
    }

    logger.warn('\n✅ Rollback completed\n');
  }

  private printSummary(): void {
    console.log('\n' + '═'.repeat(70));
    console.log('            DEPLOYMENT RUNBOOK SUMMARY');
    console.log('═'.repeat(70) + '\n');

    console.log(`Steps Completed:  ${this.executedSteps.length}/${this.steps.length}`);
    console.log(`Manual Steps:     ${this.steps.filter(s => s.manual).length}`);

    console.log('\n✅ Automated deployment steps completed successfully!\n');
    console.log('📋 Next: Complete manual steps and verify deployment\n');

    console.log('═'.repeat(70) + '\n');
  }
}

const runbook = new DeploymentRunbook();
runbook.execute().then((success) => {
  process.exit(success ? 0 : 1);
}).catch((error) => {
  logger.error('Deployment runbook failed:', error);
  process.exit(1);
});
