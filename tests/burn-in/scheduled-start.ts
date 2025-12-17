import { logger } from '../../server/logger.js';
import { spawn } from 'child_process';

function getMillisecondsUntil730AM(): number {
  const now = new Date();
  const nowUTC = now.getTime();
  
  const currentUTCHours = now.getUTCHours();
  const currentUTCMinutes = now.getUTCMinutes();
  
  const targetUTCHours = 12;
  const targetUTCMinutes = 30;
  
  let minutesUntilTarget = (targetUTCHours * 60 + targetUTCMinutes) - (currentUTCHours * 60 + currentUTCMinutes);
  
  if (minutesUntilTarget <= 0) {
    minutesUntilTarget += 24 * 60;
  }
  
  return minutesUntilTarget * 60 * 1000;
}

function formatTimeRemaining(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

async function main() {
  const msUntilStart = getMillisecondsUntil730AM();
  const startTime = new Date(Date.now() + msUntilStart);
  
  logger.info(`
╔═══════════════════════════════════════════════════════════════╗
║           BURN-IN TEST - SCHEDULED START                      ║
╠═══════════════════════════════════════════════════════════════╣
║  Current Time:     ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}                ║
║  Scheduled Start:  ${startTime.toLocaleString('en-US', { timeZone: 'America/New_York' })}                ║
║  Time Until Start: ${formatTimeRemaining(msUntilStart)}                              ║
║                                                               ║
║  The 6-hour accelerated burn-in test will automatically       ║
║  start at 7:30 AM and complete at 1:30 PM.                    ║
║                                                               ║
║  Press Ctrl+C to cancel the scheduled start.                  ║
╚═══════════════════════════════════════════════════════════════╝
  `);

  logger.info(`⏰ Waiting until 7:30 AM to start burn-in test...`);
  
  await new Promise(resolve => setTimeout(resolve, msUntilStart));
  
  logger.info(`🚀 Starting 6-hour burn-in test NOW at 7:30 AM...`);
  
  const child = spawn('tsx', ['tests/burn-in/24-hour-test.ts'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });
  
  child.on('exit', (code) => {
    logger.info(`Burn-in test completed with exit code: ${code}`);
    process.exit(code || 0);
  });
  
  process.on('SIGINT', () => {
    logger.warn('\n⚠️ Received interrupt signal, stopping burn-in test...');
    child.kill('SIGINT');
  });
}

main().catch((error) => {
  logger.error('Fatal error in scheduled burn-in test:', error);
  process.exit(1);
});
