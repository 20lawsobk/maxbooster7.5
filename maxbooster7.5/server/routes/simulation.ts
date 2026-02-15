/**
 * Simulation API Routes
 * 
 * Provides endpoints for running and monitoring real-life simulations
 * to test Max Booster systems before launch
 */

import { Router, Request, Response } from 'express';
import { 
  RealLifeSimulationEngine, 
  SIMULATION_PERIODS,
  runFullLifecycleSimulation 
} from '../simulations/realLifeSimulation';
import { EventGenerator, INDUSTRY_BENCHMARKS } from '../simulations/eventGenerators';
import { logger } from '../logger.js';

const router = Router();

// Active simulations storage
const activeSimulations: Map<string, RealLifeSimulationEngine> = new Map();
const simulationResults: Map<string, any> = new Map();
const simulationLogs: Map<string, string[]> = new Map();

// Generate unique simulation ID
function generateSimulationId(): string {
  return `sim_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

// Time acceleration: 98% acceleration = 0.48 seconds per simulated day
const REAL_SECONDS_PER_DAY = 0.48;

// GET /api/simulation/periods - Get available simulation periods
router.get('/periods', (req: Request, res: Response) => {
  const periods = Object.entries(SIMULATION_PERIODS).map(([name, days]) => ({
    name,
    days,
    // Each day takes 0.48 seconds real time
    estimatedRealTime: `${Math.ceil(days * REAL_SECONDS_PER_DAY / 60)} minutes`,
    description: getPeroidDescription(name),
  }));

  res.json({
    success: true,
    periods,
    accelerationFactor: REAL_SECONDS_PER_DAY / (24 * 60 * 60),
    accelerationPercent: 98,
    realSecondsPerDay: REAL_SECONDS_PER_DAY,
  });
});

function getPeroidDescription(name: string): string {
  const descriptions: Record<string, string> = {
    '1_month': 'Quick validation test - basic user flows and payments',
    '3_months': 'Short-term test - seasonal patterns and user retention',
    '6_months': 'Medium-term test - growth trends and churn analysis',
    '1_year': 'Annual cycle test - full seasonal patterns and revenue trends',
    '3_years': 'Growth phase test - market expansion and scaling',
    '6_years': 'Maturity test - sustainable growth and market position',
    '10_years': 'Long-term viability - technology shifts and adaptation',
    '14_years': 'Extended lifecycle - multi-generation platform evolution',
    '18_years': 'Durability test - long-term market dynamics',
    '22_years': 'Legacy test - platform longevity and relevance',
    '26_years': 'Generational test - cross-generational user patterns',
    '30_years': 'Era test - industry transformation scenarios',
    '34_years': 'Extended era test - multiple market cycles',
    '38_years': 'Historical scale test - long-term economic patterns',
    '42_years': 'Multi-decade test - comprehensive lifecycle',
    '46_years': 'Near-maximum test - extreme longevity scenarios',
    '50_years': 'Full lifecycle test - complete platform lifespan simulation',
  };
  return descriptions[name] || 'Simulation period';
}

// GET /api/simulation/benchmarks - Get industry benchmarks
router.get('/benchmarks', (req: Request, res: Response) => {
  res.json({
    success: true,
    benchmarks: INDUSTRY_BENCHMARKS,
  });
});

// POST /api/simulation/start - Start a new simulation
router.post('/start', async (req: Request, res: Response) => {
  try {
    const {
      periodName = '1_month',
      initialUsers = 100,
      initialReleases = 50,
      seedMoney = 10000,
      enableAutonomousSystems = true,
      enableSystemFailures = true,
      enableMarketFluctuations = true,
    } = req.body;

    if (!SIMULATION_PERIODS[periodName as keyof typeof SIMULATION_PERIODS]) {
      return res.status(400).json({
        success: false,
        error: `Invalid period. Valid options: ${Object.keys(SIMULATION_PERIODS).join(', ')}`,
      });
    }

    const simulationId = generateSimulationId();
    
    const simulation = new RealLifeSimulationEngine({
      periodName: periodName as keyof typeof SIMULATION_PERIODS,
      daysToSimulate: SIMULATION_PERIODS[periodName as keyof typeof SIMULATION_PERIODS],
      initialUsers,
      initialReleases,
      seedMoney,
      enableAutonomousSystems,
      enableSystemFailures,
      enableMarketFluctuations,
      realTimeTracking: true,
      snapshotIntervalDays: Math.max(1, Math.floor(SIMULATION_PERIODS[periodName as keyof typeof SIMULATION_PERIODS] / 30)),
    });

    activeSimulations.set(simulationId, simulation);
    simulationLogs.set(simulationId, []);

    // Set up event listeners for real-time tracking
    simulation.on('event', (event) => {
      const logs = simulationLogs.get(simulationId) || [];
      logs.push(`[${event.simulatedTime.toISOString()}] ${event.type}: ${JSON.stringify(event.data)}`);
      if (logs.length > 1000) logs.shift(); // Keep last 1000 events
      simulationLogs.set(simulationId, logs);
    });

    simulation.on('progress', (progress) => {
      logger.debug(`[SIM ${simulationId}] Day ${progress.day}/${progress.totalDays} (${progress.percentComplete.toFixed(1)}%)`);
    });

    simulation.on('snapshot', (snapshot) => {
      logger.info(`[SIM ${simulationId}] Snapshot at day ${snapshot.dayNumber}`);
    });

    simulation.on('complete', (result) => {
      simulationResults.set(simulationId, result);
      activeSimulations.delete(simulationId);
      logger.info(`[SIM ${simulationId}] Complete - stored results`);
    });

    // Start simulation in background
    simulation.runSimulation().catch((error) => {
      logger.error(`[SIM ${simulationId}] Failed:`, error);
      simulationResults.set(simulationId, { error: error.message });
      activeSimulations.delete(simulationId);
    });

    res.json({
      success: true,
      simulationId,
      config: {
        periodName,
        days: SIMULATION_PERIODS[periodName as keyof typeof SIMULATION_PERIODS],
        initialUsers,
        initialReleases,
        seedMoney,
        enableAutonomousSystems,
        enableSystemFailures,
        enableMarketFluctuations,
      },
      estimatedRealTime: `${Math.ceil(SIMULATION_PERIODS[periodName as keyof typeof SIMULATION_PERIODS] * 0.02 * 24 / 60)} minutes`,
      message: 'Simulation started. Use /api/simulation/status/:id to track progress.',
    });

  } catch (error: any) {
    logger.error('Failed to start simulation:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// POST /api/simulation/start-full - Start full 50-year lifecycle simulation
router.post('/start-full', async (req: Request, res: Response) => {
  try {
    const simulationId = `full_${Date.now()}`;
    
    res.json({
      success: true,
      simulationId,
      message: 'Full lifecycle simulation starting in background',
      periods: Object.keys(SIMULATION_PERIODS),
      estimatedTotalTime: 'Several hours at 98% acceleration',
    });

    // Run in background
    runFullLifecycleSimulation()
      .then((results) => {
        simulationResults.set(simulationId, results);
        logger.info(`Full lifecycle simulation complete: ${simulationId}`);
      })
      .catch((error) => {
        logger.error(`Full lifecycle simulation failed:`, error);
        simulationResults.set(simulationId, { error: error.message });
      });

  } catch (error: any) {
    logger.error('Failed to start full simulation:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// GET /api/simulation/status/:id - Get simulation status
router.get('/status/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  const simulation = activeSimulations.get(id);
  if (simulation) {
    const status = simulation.getStatus();
    return res.json({
      success: true,
      status: 'running',
      ...status,
      recentLogs: (simulationLogs.get(id) || []).slice(-50),
    });
  }

  const result = simulationResults.get(id);
  if (result) {
    return res.json({
      success: true,
      status: 'completed',
      result: {
        ...result,
        allEvents: undefined, // Too large to return
        eventsCount: result.allEvents?.length || 0,
      },
    });
  }

  res.status(404).json({
    success: false,
    error: 'Simulation not found',
  });
});

// GET /api/simulation/metrics/:id - Get real-time metrics
router.get('/metrics/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  const simulation = activeSimulations.get(id);
  if (simulation) {
    const status = simulation.getStatus();
    return res.json({
      success: true,
      metrics: status.metrics,
      day: status.currentDay,
      totalDays: status.totalDays,
      percentComplete: status.percentComplete,
    });
  }

  const result = simulationResults.get(id);
  if (result && !result.error) {
    return res.json({
      success: true,
      metrics: result.finalMetrics,
      kpis: result.kpis,
      systemTests: result.systemTests,
    });
  }

  res.status(404).json({
    success: false,
    error: 'Simulation not found',
  });
});

// GET /api/simulation/snapshots/:id - Get simulation snapshots
router.get('/snapshots/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  const result = simulationResults.get(id);
  if (result && result.snapshots) {
    return res.json({
      success: true,
      snapshotCount: result.snapshots.length,
      snapshots: result.snapshots.map((s: any) => ({
        dayNumber: s.dayNumber,
        simulatedDate: s.simulatedDate,
        realTimestamp: s.realTimestamp,
        userCount: s.metrics.users.total,
        activeUsers: s.metrics.users.active,
        mrr: s.metrics.revenue.mrr,
        totalStreams: s.metrics.streams.total,
        uptime: s.metrics.platform.uptime,
      })),
    });
  }

  res.status(404).json({
    success: false,
    error: 'Simulation snapshots not found',
  });
});

// GET /api/simulation/events/:id - Get simulation events
router.get('/events/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { category, impact, limit = 100 } = req.query;

  const result = simulationResults.get(id);
  if (result && result.allEvents) {
    let events = result.allEvents;

    if (category) {
      events = events.filter((e: any) => e.category === category);
    }
    if (impact) {
      events = events.filter((e: any) => e.impact === impact);
    }

    const limitNum = Math.min(parseInt(limit as string) || 100, 1000);
    events = events.slice(-limitNum);

    return res.json({
      success: true,
      totalEvents: result.allEvents.length,
      returnedEvents: events.length,
      events,
    });
  }

  const logs = simulationLogs.get(id);
  if (logs) {
    return res.json({
      success: true,
      status: 'running',
      recentEvents: logs.slice(-parseInt(limit as string) || -100),
    });
  }

  res.status(404).json({
    success: false,
    error: 'Simulation events not found',
  });
});

// POST /api/simulation/pause/:id - Pause simulation
router.post('/pause/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  const simulation = activeSimulations.get(id);
  if (simulation) {
    simulation.pause();
    return res.json({
      success: true,
      message: 'Simulation paused',
    });
  }

  res.status(404).json({
    success: false,
    error: 'Simulation not found or not running',
  });
});

// POST /api/simulation/resume/:id - Resume simulation
router.post('/resume/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  const simulation = activeSimulations.get(id);
  if (simulation) {
    simulation.resume();
    return res.json({
      success: true,
      message: 'Simulation resumed',
    });
  }

  res.status(404).json({
    success: false,
    error: 'Simulation not found or not running',
  });
});

// POST /api/simulation/stop/:id - Stop simulation
router.post('/stop/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  const simulation = activeSimulations.get(id);
  if (simulation) {
    simulation.stop();
    activeSimulations.delete(id);
    return res.json({
      success: true,
      message: 'Simulation stopped',
    });
  }

  res.status(404).json({
    success: false,
    error: 'Simulation not found or not running',
  });
});

// GET /api/simulation/results/:id - Get final results
router.get('/results/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  const result = simulationResults.get(id);
  if (result) {
    if (result.error) {
      return res.status(500).json({
        success: false,
        error: result.error,
      });
    }

    return res.json({
      success: true,
      config: result.config,
      duration: {
        real: `${(result.realDuration / 1000 / 60).toFixed(1)} minutes`,
        simulated: `${result.config.daysToSimulate} days`,
      },
      finalMetrics: result.finalMetrics,
      kpis: result.kpis,
      systemTests: result.systemTests,
      recommendations: result.recommendations,
      snapshotCount: result.snapshots?.length || 0,
      eventCount: result.allEvents?.length || 0,
    });
  }

  res.status(404).json({
    success: false,
    error: 'Simulation results not found',
  });
});

// GET /api/simulation/report/:id - Generate detailed report
router.get('/report/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  const result = simulationResults.get(id);
  if (!result || result.error) {
    return res.status(404).json({
      success: false,
      error: 'Simulation results not found or simulation failed',
    });
  }

  const report = generateSimulationReport(result);
  
  res.setHeader('Content-Type', 'text/markdown');
  res.setHeader('Content-Disposition', `attachment; filename="simulation_report_${id}.md"`);
  res.send(report);
});

function generateSimulationReport(result: any): string {
  const { config, finalMetrics, kpis, systemTests, recommendations } = result;
  
  const testStatus = systemTests.failed === 0 ? '✅ ALL TESTS PASSED' :
                     systemTests.criticalIssues.length > 0 ? '❌ CRITICAL ISSUES FOUND' :
                     '⚠️ WARNINGS DETECTED';

  return `# Max Booster Simulation Report

## Executive Summary

**Period:** ${config.periodName} (${config.daysToSimulate} simulated days)
**Status:** ${testStatus}
**Generated:** ${new Date().toISOString()}

---

## Test Results

| Metric | Passed | Failed | Warnings |
|--------|--------|--------|----------|
| System Tests | ${systemTests.passed} | ${systemTests.failed} | ${systemTests.warnings} |

${systemTests.criticalIssues.length > 0 ? `
### Critical Issues
${systemTests.criticalIssues.map((issue: string) => `- ❌ ${issue}`).join('\n')}
` : ''}

---

## Key Performance Indicators

| KPI | Value | Status |
|-----|-------|--------|
| User Growth Rate | ${kpis.userGrowthRate.toFixed(1)}% | ${kpis.userGrowthRate > 0 ? '✅' : '❌'} |
| Revenue Growth Rate | ${kpis.revenueGrowthRate.toFixed(1)}% | ${kpis.revenueGrowthRate > 0 ? '✅' : '❌'} |
| Churn Rate | ${kpis.churnRate.toFixed(2)}% | ${kpis.churnRate < 5 ? '✅' : kpis.churnRate < 10 ? '⚠️' : '❌'} |
| LTV | $${kpis.ltv.toFixed(2)} | ${kpis.ltv > 100 ? '✅' : '⚠️'} |
| LTV/CAC Ratio | ${(kpis.ltv / kpis.cac).toFixed(2)} | ${kpis.ltv / kpis.cac > 3 ? '✅' : kpis.ltv / kpis.cac > 1 ? '⚠️' : '❌'} |
| Viral Coefficient | ${kpis.viralCoefficient.toFixed(2)} | ${kpis.viralCoefficient > 0.5 ? '✅' : '⚠️'} |
| NPS Score | ${kpis.nps.toFixed(0)} | ${kpis.nps > 50 ? '✅' : kpis.nps > 0 ? '⚠️' : '❌'} |
| System Uptime | ${kpis.systemUptime.toFixed(2)}% | ${kpis.systemUptime > 99.9 ? '✅' : kpis.systemUptime > 99 ? '⚠️' : '❌'} |
| Autonomous Efficiency | ${kpis.autonomousEfficiency.toFixed(1)}% | ${kpis.autonomousEfficiency > 90 ? '✅' : '⚠️'} |

---

## Final Metrics

### Users
- **Total Users:** ${finalMetrics.users.total.toLocaleString()}
- **Active Users:** ${finalMetrics.users.active.toLocaleString()}
- **By Tier:** Free: ${finalMetrics.users.byTier.free}, Basic: ${finalMetrics.users.byTier.basic}, Pro: ${finalMetrics.users.byTier.pro}, Enterprise: ${finalMetrics.users.byTier.enterprise}

### Revenue
- **MRR:** $${finalMetrics.revenue.mrr.toFixed(2)}
- **ARR:** $${finalMetrics.revenue.arr.toFixed(2)}
- **Lifetime Revenue:** $${finalMetrics.revenue.lifetime.toFixed(2)}

### Content & Streams
- **Total Streams:** ${finalMetrics.streams.total.toLocaleString()}
- **Viral Releases:** ${finalMetrics.streams.viralReleases}
- **Avg Streams/Release:** ${finalMetrics.streams.avgPerRelease.toFixed(0)}

### Platform Health
- **Uptime:** ${finalMetrics.platform.uptime.toFixed(2)}%
- **Response Time:** ${finalMetrics.platform.responseTime}ms
- **Error Rate:** ${(finalMetrics.platform.errorRate * 100).toFixed(3)}%

### Autonomous Systems
- **Posts Auto-Published:** ${finalMetrics.autonomous.postsAutoPublished}
- **Campaigns Auto-Launched:** ${finalMetrics.autonomous.campaignsAutoLaunched}
- **Releases Auto-Distributed:** ${finalMetrics.autonomous.releasesAutoDistributed}
- **AI Decisions Made:** ${finalMetrics.autonomous.decisionsAutoMade}
- **Interventions Required:** ${finalMetrics.autonomous.interventionsRequired}

---

## Recommendations

${recommendations.map((rec: string, i: number) => `${i + 1}. ${rec}`).join('\n')}

---

## Conclusion

${testStatus === '✅ ALL TESTS PASSED' ? 
  'The simulation completed successfully with all systems operating within expected parameters. Max Booster is ready for launch.' :
  testStatus === '⚠️ WARNINGS DETECTED' ?
  'The simulation completed with some warnings. Review the recommendations above before launch.' :
  'Critical issues were detected during simulation. These must be addressed before launch.'
}

---

*Report generated by Max Booster Simulation Engine*
*Acceleration: 98% | Real-time tracking enabled*
`;
}

// GET /api/simulation/list - List all simulations
router.get('/list', (req: Request, res: Response) => {
  const running = Array.from(activeSimulations.entries()).map(([id, sim]) => ({
    id,
    status: 'running',
    ...sim.getStatus(),
  }));

  const completed = Array.from(simulationResults.entries()).map(([id, result]) => ({
    id,
    status: result.error ? 'failed' : 'completed',
    error: result.error,
    periodName: result.config?.periodName,
    finalUsers: result.finalMetrics?.users?.total,
    finalMRR: result.finalMetrics?.revenue?.mrr,
    testsPassed: result.systemTests?.passed,
    testsFailed: result.systemTests?.failed,
  }));

  res.json({
    success: true,
    running,
    completed,
    total: running.length + completed.length,
  });
});

// POST /api/simulation/generate-event - Generate test event
router.post('/generate-event', (req: Request, res: Response) => {
  const { type, params = {} } = req.body;

  const generator = new EventGenerator(new Date());

  let event;
  switch (type) {
    case 'user_signup':
      event = generator.generateUserSignupEvent(params.probability);
      break;
    case 'market':
      event = generator.generateMarketEvent();
      break;
    case 'system':
      event = generator.generateSystemEvent();
      break;
    default:
      return res.status(400).json({
        success: false,
        error: 'Invalid event type. Valid types: user_signup, market, system',
      });
  }

  res.json({
    success: true,
    event,
  });
});

// DELETE /api/simulation/:id - Delete simulation results
router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  const simulation = activeSimulations.get(id);
  if (simulation) {
    simulation.stop();
    activeSimulations.delete(id);
  }

  simulationResults.delete(id);
  simulationLogs.delete(id);

  res.json({
    success: true,
    message: 'Simulation deleted',
  });
});

export default router;
