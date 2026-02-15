import { storage } from '../storage.js';
import type { InsertForecastSnapshot } from '@shared/schema';
import { db } from '../db.js';
import { revenueEvents } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';

export class RoyaltiesForecastingService {
  async calculateForecast(
    userId: string,
    projectId: string,
    granularity: 'monthly' | 'quarterly' | 'annual'
  ) {
    const historicalEvents = await this.getHistoricalRevenue(projectId, granularity);

    if (historicalEvents.length < 3) {
      throw new Error('Insufficient historical data (minimum 3 periods required)');
    }

    const alpha = 0.3;
    const periods = this.getPeriodCount(granularity);

    const forecast = this.exponentialSmoothing(historicalEvents, alpha, periods);
    const variance = this.calculateVariance(historicalEvents);
    const confidence = this.calculateConfidenceIntervals(forecast, variance);

    const forecastData: InsertForecastSnapshot = {
      userId,
      projectId,
      granularity,
      forecastPeriods: confidence,
      baselinePeriod: `${historicalEvents[0].period} - ${historicalEvents[historicalEvents.length - 1].period}`,
      confidenceLevel: 95,
      algorithm: 'exponential_smoothing',
      metadata: {
        alpha,
        variance,
        historicalPeriods: historicalEvents.length,
      },
    };

    return await storage.createForecast(forecastData);
  }

  private async getHistoricalRevenue(projectId: string, granularity: string) {
    const events = await db
      .select()
      .from(revenueEvents)
      .where(eq(revenueEvents.projectId, projectId))
      .orderBy(desc(revenueEvents.occurredAt));

    const grouped = this.groupByPeriod(events, granularity);
    return grouped;
  }

  private groupByPeriod(events: unknown[], granularity: string) {
    const periods: Record<string, number> = {};

    for (const event of events) {
      const period = this.getPeriodKey(event.occurredAt, granularity);
      periods[period] = (periods[period] || 0) + Number(event.amount);
    }

    return Object.entries(periods)
      .map(([period, amount]) => ({ period, amount }))
      .sort((a, b) => a.period.localeCompare(b.period));
  }

  private getPeriodKey(date: Date, granularity: string): string {
    const d = new Date(date);
    if (granularity === 'monthly') {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    } else if (granularity === 'quarterly') {
      const quarter = Math.floor(d.getMonth() / 3) + 1;
      return `${d.getFullYear()}-Q${quarter}`;
    } else {
      return `${d.getFullYear()}`;
    }
  }

  private getPeriodCount(granularity: string): number {
    if (granularity === 'monthly') return 6;
    if (granularity === 'quarterly') return 4;
    return 2;
  }

  private exponentialSmoothing(
    data: { period: string; amount: number }[],
    alpha: number,
    periods: number
  ) {
    const forecast: { period: string; predicted: number }[] = [];
    let lastValue = data[data.length - 1].amount;

    for (let i = 0; i < periods; i++) {
      const predicted = lastValue;
      forecast.push({
        period: this.getNextPeriod(data[data.length - 1].period, i + 1),
        predicted,
      });
      lastValue = predicted;
    }

    return forecast;
  }

  private getNextPeriod(lastPeriod: string, offset: number): string {
    if (lastPeriod.includes('-Q')) {
      const [year, q] = lastPeriod.split('-Q');
      const quarter = parseInt(q) + offset;
      const newYear = parseInt(year) + Math.floor((quarter - 1) / 4);
      const newQuarter = ((quarter - 1) % 4) + 1;
      return `${newYear}-Q${newQuarter}`;
    } else if (lastPeriod.includes('-')) {
      const [year, month] = lastPeriod.split('-');
      const monthNum = parseInt(month) + offset;
      const newYear = parseInt(year) + Math.floor((monthNum - 1) / 12);
      const newMonth = ((monthNum - 1) % 12) + 1;
      return `${newYear}-${String(newMonth).padStart(2, '0')}`;
    } else {
      return `${parseInt(lastPeriod) + offset}`;
    }
  }

  private calculateVariance(data: { period: string; amount: number }[]): number {
    const mean = data.reduce((sum, d) => sum + d.amount, 0) / data.length;
    const variance = data.reduce((sum, d) => sum + Math.pow(d.amount - mean, 2), 0) / data.length;
    return Math.sqrt(variance);
  }

  private calculateConfidenceIntervals(
    forecast: { period: string; predicted: number }[],
    stdDev: number
  ) {
    const z95 = 1.96;

    return forecast.map((f) => ({
      period: f.period,
      predicted: f.predicted,
      lower: Math.max(0, f.predicted - z95 * stdDev),
      upper: f.predicted + z95 * stdDev,
    }));
  }
}

export const royaltiesForecastingService = new RoyaltiesForecastingService();
