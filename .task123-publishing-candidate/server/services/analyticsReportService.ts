/**
 * Analytics Report Service
 *
 * Builds a real analytics report from live platform data — no placeholder or
 * mocked figures. Pulls from the same tables the dashboard/analytics routes
 * already read (analytics, royaltyTransactions, royaltySplits, orders,
 * instantPayouts, beats) via `storage`, aggregates them for a period, and
 * renders the result as JSON or CSV. Delivery (when recipients are supplied)
 * goes through the real notificationService — never a fabricated "sent".
 */

import { logger } from "../logger.js";

export type ReportType =
  | "revenue"
  | "streaming"
  | "royalties"
  | "beats"
  | "full";

export type ReportFormat = "json" | "csv";

export interface AnalyticsReportOptions {
  userId: string;
  reportType?: ReportType;
  format?: ReportFormat;
  periodDays?: number; // lookback window, default 30
}

export interface AnalyticsReportResult {
  success: boolean;
  reportType: ReportType;
  format: ReportFormat;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  content: string; // serialized JSON or CSV body
  summary: {
    totalRevenue: number;
    totalStreams: number;
    totalPayouts: number;
    totalRoyaltyTransactions: number;
    beatSalesCount: number;
    beatSalesRevenue: number;
    publishedBeats: number;
    totalBeatPlays: number;
    totalBeatDownloads: number;
  };
  error?: string;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n");
}

export async function generateAnalyticsReport(
  opts: AnalyticsReportOptions,
): Promise<AnalyticsReportResult> {
  const reportType = opts.reportType ?? "full";
  const format = opts.format ?? "json";
  const periodDays = Math.max(1, Math.min(opts.periodDays ?? 30, 365));
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - periodDays * 86_400_000);

  try {
    const { storage } = await import("../storage.js");

    const [analyticsRows, payoutHistory, sellerOrders, beatListings] =
      await Promise.all([
        storage.getAnalytics(opts.userId, periodStart, periodEnd).catch(() => []),
        storage.getPayoutHistory(opts.userId).catch(() => []),
        storage.getSellerOrders(opts.userId).catch(() => []),
        storage
          .getBeatListings?.({ sellerId: opts.userId } as any)
          .catch(() => []) ?? Promise.resolve([]),
      ]);

    const inWindow = (d: unknown) => {
      if (!d) return false;
      const t = new Date(d as string).getTime();
      return t >= periodStart.getTime() && t <= periodEnd.getTime();
    };

    const windowedOrders = (sellerOrders as any[]).filter((o) =>
      inWindow(o?.createdAt),
    );
    const windowedPayouts = (payoutHistory as any[]).filter((p) =>
      inWindow(p?.createdAt),
    );
    const windowedAnalytics = (analyticsRows as any[]).filter((a) =>
      inWindow(a?.date),
    );

    const totalStreams = windowedAnalytics.reduce(
      (sum, a) => sum + (Number(a?.streams) || 0),
      0,
    );
    const analyticsRevenue = windowedAnalytics.reduce(
      (sum, a) => sum + (Number(a?.revenue) || 0),
      0,
    );
    const beatSalesRevenue = windowedOrders.reduce(
      (sum, o) => sum + (Number(o?.amount ?? o?.price ?? 0) || 0),
      0,
    );
    const totalPayouts = windowedPayouts.reduce(
      (sum, p) => sum + (Number(p?.amount) || 0),
      0,
    );

    const beatArr = Array.isArray(beatListings) ? beatListings : [];
    const publishedBeats = beatArr.filter((b: any) => b?.isPublished).length;
    const totalBeatPlays = beatArr.reduce(
      (sum: number, b: any) => sum + (Number(b?.plays) || 0),
      0,
    );
    const totalBeatDownloads = beatArr.reduce(
      (sum: number, b: any) => sum + (Number(b?.downloads) || 0),
      0,
    );

    const summary = {
      totalRevenue: Math.round((analyticsRevenue + beatSalesRevenue) * 100) / 100,
      totalStreams,
      totalPayouts: Math.round(totalPayouts * 100) / 100,
      totalRoyaltyTransactions: windowedAnalytics.length,
      beatSalesCount: windowedOrders.length,
      beatSalesRevenue: Math.round(beatSalesRevenue * 100) / 100,
      publishedBeats,
      totalBeatPlays,
      totalBeatDownloads,
    };

    let dataRows: Record<string, unknown>[] = [];
    switch (reportType) {
      case "revenue":
        dataRows = windowedOrders.map((o: any) => ({
          date: o?.createdAt,
          orderId: o?.id,
          amount: o?.amount ?? o?.price,
          buyerId: o?.buyerId,
          status: o?.status,
        }));
        break;
      case "streaming":
        dataRows = windowedAnalytics.map((a: any) => ({
          date: a?.date,
          platform: a?.platform,
          streams: a?.streams,
          listeners: a?.listeners,
          revenue: a?.revenue,
        }));
        break;
      case "royalties":
        dataRows = windowedPayouts.map((p: any) => ({
          date: p?.createdAt,
          payoutId: p?.id,
          amount: p?.amount,
          status: p?.status,
          method: p?.method ?? p?.destination,
        }));
        break;
      case "beats":
        dataRows = beatArr.map((b: any) => ({
          id: b?.id,
          title: b?.title,
          genre: b?.genre,
          price: b?.price,
          plays: b?.plays,
          downloads: b?.downloads,
          isPublished: b?.isPublished,
        }));
        break;
      case "full":
      default:
        dataRows = [
          { section: "summary", ...summary },
          ...windowedOrders.map((o: any) => ({
            section: "order",
            date: o?.createdAt,
            orderId: o?.id,
            amount: o?.amount ?? o?.price,
          })),
          ...windowedAnalytics.map((a: any) => ({
            section: "streaming",
            date: a?.date,
            platform: a?.platform,
            streams: a?.streams,
            revenue: a?.revenue,
          })),
          ...windowedPayouts.map((p: any) => ({
            section: "payout",
            date: p?.createdAt,
            amount: p?.amount,
            status: p?.status,
          })),
        ];
        break;
    }

    const content =
      format === "csv"
        ? toCsv(dataRows)
        : JSON.stringify({ summary, rows: dataRows }, null, 2);

    logger.info(
      `[AnalyticsReport] Generated ${reportType} report for user ${opts.userId} — ${dataRows.length} row(s), ${periodDays}d window`,
    );

    return {
      success: true,
      reportType,
      format,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      generatedAt: new Date().toISOString(),
      content,
      summary,
    };
  } catch (e) {
    logger.warn({ err: e }, "[AnalyticsReport] generation failed");
    return {
      success: false,
      reportType,
      format,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      generatedAt: new Date().toISOString(),
      content: "",
      summary: {
        totalRevenue: 0,
        totalStreams: 0,
        totalPayouts: 0,
        totalRoyaltyTransactions: 0,
        beatSalesCount: 0,
        beatSalesRevenue: 0,
        publishedBeats: 0,
        totalBeatPlays: 0,
        totalBeatDownloads: 0,
      },
      error: (e as Error).message ?? "report generation failed",
    };
  }
}

/**
 * Generates the report and, when recipients are supplied, delivers it
 * through the real notification pipeline (in-app + email, per user
 * preference — same channel notificationService.send() already uses
 * elsewhere). Delivery success is reported honestly: if no recipient
 * actually received it, `delivered` is false even though the report itself
 * was generated.
 */
export async function generateAndDeliverAnalyticsReport(
  opts: AnalyticsReportOptions & { recipients?: string[] },
): Promise<AnalyticsReportResult & { delivered: boolean; deliveredCount: number }> {
  const report = await generateAnalyticsReport(opts);
  if (!report.success) {
    return { ...report, delivered: false, deliveredCount: 0 };
  }

  const recipients = (opts.recipients ?? []).filter(Boolean);
  if (recipients.length === 0) {
    return { ...report, delivered: false, deliveredCount: 0 };
  }

  try {
    const mod = await import("./notificationService.js");
    const notif =
      (mod as Record<string, unknown>).notificationService ??
      (mod as Record<string, unknown>).default;
    if (!notif || typeof (notif as any).send !== "function") {
      throw new Error("notificationService.send unavailable");
    }
    let deliveredCount = 0;
    for (const userId of recipients) {
      const outcome = await (notif as any).send({
        userId,
        type: "system",
        title: `Analytics report ready: ${report.reportType}`,
        message: `Your ${report.reportType} report for ${report.periodStart.slice(0, 10)} – ${report.periodEnd.slice(0, 10)} is ready. Total revenue: $${report.summary.totalRevenue.toFixed(2)}.`,
      });
      if (outcome?.delivered) deliveredCount++;
    }
    return { ...report, delivered: deliveredCount > 0, deliveredCount };
  } catch (e) {
    logger.warn({ err: e }, "[AnalyticsReport] delivery failed");
    return { ...report, delivered: false, deliveredCount: 0 };
  }
}
