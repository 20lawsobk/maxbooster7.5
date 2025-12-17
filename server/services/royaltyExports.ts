import { db } from '../db.js';
import { 
  royaltyStatements, 
  recoupmentAccounts,
  splitContracts,
  users,
  releases,
  type RoyaltyStatement,
} from '@shared/schema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { logger } from '../logger.js';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { royaltiesTaxComplianceService } from './royaltiesTaxComplianceService.js';
import { royaltyEngine, type PeriodStatement, type SplitBreakdown } from './royaltyEngine.js';

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: unknown) => jsPDF;
    lastAutoTable: {
      finalY: number;
    };
  }
}

export interface ExportOptions {
  format: 'csv' | 'excel' | 'pdf' | 'json';
  includeLineItems?: boolean;
  includeTerritoryBreakdown?: boolean;
  includeDspBreakdown?: boolean;
  includeRecoupment?: boolean;
  includeSplits?: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export interface AuditExportOptions {
  userId: string;
  startDate: Date;
  endDate: Date;
  includeTransactions?: boolean;
  includeAdjustments?: boolean;
}

export interface TaxExportOptions {
  userId: string;
  taxYear: number;
  format: 'json' | 'pdf' | 'irs_1099';
}

export interface YearlySummaryOptions {
  userId: string;
  year: number;
  includeMonthlyBreakdown?: boolean;
  includeTerritoryBreakdown?: boolean;
  includeDspBreakdown?: boolean;
}

export interface TerritoryReportOptions {
  userId: string;
  startDate: Date;
  endDate: Date;
  format: 'csv' | 'excel' | 'pdf' | 'json';
}

export class RoyaltyExportsService {
  async exportStatement(
    statementId: string,
    options: ExportOptions
  ): Promise<{ data: string | Buffer; filename: string; mimeType: string }> {
    const statement = await royaltyEngine.getStatement(statementId);
    if (!statement) {
      throw new Error(`Statement ${statementId} not found`);
    }

    switch (options.format) {
      case 'csv':
        return this.exportToCSV(statement, options);
      case 'pdf':
        return this.exportToPDF(statement, options);
      case 'json':
        return this.exportToJSON(statement, options);
      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }
  }

  async exportUserStatements(
    userId: string,
    options: ExportOptions
  ): Promise<{ data: string | Buffer; filename: string; mimeType: string }> {
    let statements = await royaltyEngine.getUserStatements(userId);

    if (options.dateRange) {
      statements = statements.filter(s => 
        s.periodStart >= options.dateRange!.start &&
        s.periodEnd <= options.dateRange!.end
      );
    }

    switch (options.format) {
      case 'csv':
        return this.exportMultipleToCSV(statements, options);
      case 'pdf':
        return this.exportMultipleToPDF(statements, options);
      case 'json':
        return this.exportMultipleToJSON(statements, options);
      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }
  }

  async exportAuditLog(
    options: AuditExportOptions
  ): Promise<{ data: string; filename: string; mimeType: string }> {
    const statements = await db
      .select()
      .from(royaltyStatements)
      .where(
        and(
          eq(royaltyStatements.userId, options.userId),
          gte(royaltyStatements.periodStart, options.startDate),
          lte(royaltyStatements.periodEnd, options.endDate)
        )
      )
      .orderBy(desc(royaltyStatements.periodStart));

    const recoupments = await db
      .select()
      .from(recoupmentAccounts)
      .where(eq(recoupmentAccounts.userId, options.userId));

    const auditData = {
      exportDate: new Date().toISOString(),
      userId: options.userId,
      dateRange: {
        start: options.startDate.toISOString(),
        end: options.endDate.toISOString(),
      },
      statements: statements.map(s => ({
        id: s.id,
        period: s.statementPeriod,
        grossRevenue: s.grossRevenue,
        netRevenue: s.netRevenue,
        status: s.status,
        generatedAt: s.generatedAt,
        finalizedAt: s.finalizedAt,
        paidAt: s.paidAt,
        auditTrail: s.auditTrail,
      })),
      recoupmentAccounts: recoupments.map(r => ({
        id: r.id,
        accountName: r.accountName,
        advanceAmount: r.advanceAmount,
        recoupedAmount: r.recoupedAmount,
        remainingBalance: r.remainingBalance,
        transactions: options.includeTransactions ? r.transactions : undefined,
      })),
    };

    const filename = `audit_log_${options.userId}_${this.formatDateForFilename(options.startDate)}_${this.formatDateForFilename(options.endDate)}.json`;

    return {
      data: JSON.stringify(auditData, null, 2),
      filename,
      mimeType: 'application/json',
    };
  }

  async export1099(options: TaxExportOptions): Promise<{ 
    data: string | Buffer; 
    filename: string; 
    mimeType: string;
    eligible: boolean;
    reason?: string;
  }> {
    const taxDoc = await royaltiesTaxComplianceService.generate1099MISC(
      options.userId,
      options.taxYear
    );

    if (!taxDoc.eligible) {
      return {
        data: JSON.stringify(taxDoc, null, 2),
        filename: `1099_ineligible_${options.taxYear}_${options.userId}.json`,
        mimeType: 'application/json',
        eligible: false,
        reason: taxDoc.reason,
      };
    }

    switch (options.format) {
      case 'json':
        return {
          data: JSON.stringify(taxDoc, null, 2),
          filename: `1099-MISC_${options.taxYear}_${options.userId}.json`,
          mimeType: 'application/json',
          eligible: true,
        };
      case 'pdf':
        const pdfBuffer = await this.generate1099PDF(taxDoc);
        return {
          data: pdfBuffer,
          filename: `1099-MISC_${options.taxYear}_${options.userId}.pdf`,
          mimeType: 'application/pdf',
          eligible: true,
        };
      case 'irs_1099':
        const irsFormat = this.formatFor1099Submission(taxDoc);
        return {
          data: irsFormat,
          filename: `1099-MISC_IRS_${options.taxYear}_${options.userId}.txt`,
          mimeType: 'text/plain',
          eligible: true,
        };
      default:
        throw new Error(`Unsupported format: ${options.format}`);
    }
  }

  private exportToCSV(
    statement: RoyaltyStatement,
    options: ExportOptions
  ): { data: string; filename: string; mimeType: string } {
    const rows: string[][] = [];

    rows.push(['Royalty Statement Export']);
    rows.push(['Period', statement.statementPeriod]);
    rows.push(['Period Start', statement.periodStart.toISOString()]);
    rows.push(['Period End', statement.periodEnd.toISOString()]);
    rows.push(['Status', statement.status]);
    rows.push([]);

    rows.push(['Summary']);
    rows.push(['Gross Revenue', String(statement.grossRevenue)]);
    rows.push(['Platform Fees', String(statement.platformFees)]);
    rows.push(['Distribution Fees', String(statement.distributionFees)]);
    rows.push(['Recoupment Deductions', String(statement.recoupmentDeductions)]);
    rows.push(['Net Revenue', String(statement.netRevenue)]);
    rows.push(['Payable Amount', String(statement.payableAmount)]);
    rows.push(['Currency', statement.currency]);
    rows.push(['Total Streams', String(statement.totalStreams)]);
    rows.push(['Total Downloads', String(statement.totalDownloads)]);
    rows.push([]);

    if (options.includeLineItems && statement.lineItems) {
      rows.push(['Line Items']);
      rows.push(['DSP', 'Territory', 'Streams', 'Downloads', 'Gross Revenue', 'Effective Rate', 'Currency', 'Exchange Rate']);
      
      const lineItems = statement.lineItems as Array<{
        dsp: string;
        territory: string;
        streams: number;
        downloads: number;
        grossRevenue: number;
        effectiveRate: number;
        currency: string;
        exchangeRate: number;
      }>;

      for (const item of lineItems) {
        rows.push([
          item.dsp,
          item.territory,
          String(item.streams),
          String(item.downloads),
          String(item.grossRevenue),
          String(item.effectiveRate),
          item.currency,
          String(item.exchangeRate),
        ]);
      }
      rows.push([]);
    }

    if (options.includeTerritoryBreakdown && statement.territoryBreakdown) {
      rows.push(['Territory Breakdown']);
      rows.push(['Territory', 'Streams', 'Revenue', 'Percentage']);
      
      const territories = statement.territoryBreakdown as Array<{
        territory: string;
        streams: number;
        revenue: number;
        percentage: number;
      }>;

      for (const territory of territories) {
        rows.push([
          territory.territory,
          String(territory.streams),
          String(territory.revenue),
          `${territory.percentage.toFixed(2)}%`,
        ]);
      }
      rows.push([]);
    }

    if (options.includeDspBreakdown && statement.dspBreakdown) {
      rows.push(['DSP Breakdown']);
      rows.push(['DSP', 'Streams', 'Revenue', 'Average Rate']);
      
      const dsps = statement.dspBreakdown as Array<{
        dsp: string;
        streams: number;
        revenue: number;
        averageRate: number;
      }>;

      for (const dsp of dsps) {
        rows.push([
          dsp.dsp,
          String(dsp.streams),
          String(dsp.revenue),
          `$${dsp.averageRate.toFixed(6)}`,
        ]);
      }
    }

    const csv = rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

    return {
      data: csv,
      filename: `royalty_statement_${statement.statementPeriod}_${statement.id}.csv`,
      mimeType: 'text/csv',
    };
  }

  private exportToPDF(
    statement: RoyaltyStatement,
    options: ExportOptions
  ): { data: Buffer; filename: string; mimeType: string } {
    const doc = new jsPDF();

    doc.setFontSize(20);
    doc.text('Royalty Statement', 105, 20, { align: 'center' });

    doc.setFontSize(12);
    doc.text(`Period: ${statement.statementPeriod}`, 20, 35);
    doc.text(`Status: ${statement.status}`, 20, 42);
    doc.text(`Generated: ${statement.generatedAt?.toISOString().split('T')[0] || 'N/A'}`, 20, 49);

    doc.setFontSize(14);
    doc.text('Summary', 20, 65);

    doc.autoTable({
      startY: 70,
      head: [['Description', 'Amount']],
      body: [
        ['Gross Revenue', `$${Number(statement.grossRevenue).toFixed(2)}`],
        ['Platform Fees', `-$${Number(statement.platformFees).toFixed(2)}`],
        ['Distribution Fees', `-$${Number(statement.distributionFees).toFixed(2)}`],
        ['Recoupment Deductions', `-$${Number(statement.recoupmentDeductions).toFixed(2)}`],
        ['Net Revenue', `$${Number(statement.netRevenue).toFixed(2)}`],
        ['Payable Amount', `$${Number(statement.payableAmount).toFixed(2)}`],
      ],
      theme: 'striped',
      headStyles: { fillColor: [41, 128, 185] },
    });

    let currentY = doc.lastAutoTable.finalY + 15;

    doc.text('Streaming Statistics', 20, currentY);
    currentY += 5;

    doc.autoTable({
      startY: currentY,
      head: [['Metric', 'Value']],
      body: [
        ['Total Streams', String(statement.totalStreams || 0)],
        ['Total Downloads', String(statement.totalDownloads || 0)],
        ['Currency', statement.currency],
      ],
      theme: 'striped',
      headStyles: { fillColor: [46, 204, 113] },
    });

    if (options.includeTerritoryBreakdown && statement.territoryBreakdown) {
      currentY = doc.lastAutoTable.finalY + 15;
      
      const territories = statement.territoryBreakdown as Array<{
        territory: string;
        streams: number;
        revenue: number;
        percentage: number;
      }>;

      if (currentY > 250) {
        doc.addPage();
        currentY = 20;
      }

      doc.text('Territory Breakdown', 20, currentY);
      currentY += 5;

      doc.autoTable({
        startY: currentY,
        head: [['Territory', 'Streams', 'Revenue', 'Share']],
        body: territories.map(t => [
          t.territory,
          String(t.streams),
          `$${t.revenue.toFixed(2)}`,
          `${t.percentage.toFixed(1)}%`,
        ]),
        theme: 'striped',
        headStyles: { fillColor: [155, 89, 182] },
      });
    }

    if (options.includeDspBreakdown && statement.dspBreakdown) {
      currentY = doc.lastAutoTable.finalY + 15;
      
      const dsps = statement.dspBreakdown as Array<{
        dsp: string;
        streams: number;
        revenue: number;
        averageRate: number;
      }>;

      if (currentY > 250) {
        doc.addPage();
        currentY = 20;
      }

      doc.text('Platform Breakdown', 20, currentY);
      currentY += 5;

      doc.autoTable({
        startY: currentY,
        head: [['Platform', 'Streams', 'Revenue', 'Avg Rate']],
        body: dsps.map(d => [
          d.dsp,
          String(d.streams),
          `$${d.revenue.toFixed(2)}`,
          `$${d.averageRate.toFixed(6)}`,
        ]),
        theme: 'striped',
        headStyles: { fillColor: [230, 126, 34] },
      });
    }

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.text(
        `Page ${i} of ${pageCount} | Generated by Max Booster | ${new Date().toISOString()}`,
        105,
        doc.internal.pageSize.height - 10,
        { align: 'center' }
      );
    }

    return {
      data: Buffer.from(doc.output('arraybuffer')),
      filename: `royalty_statement_${statement.statementPeriod}_${statement.id}.pdf`,
      mimeType: 'application/pdf',
    };
  }

  private exportToJSON(
    statement: RoyaltyStatement,
    options: ExportOptions
  ): { data: string; filename: string; mimeType: string } {
    const exportData: Record<string, unknown> = {
      id: statement.id,
      userId: statement.userId,
      period: statement.statementPeriod,
      periodStart: statement.periodStart,
      periodEnd: statement.periodEnd,
      status: statement.status,
      summary: {
        grossRevenue: statement.grossRevenue,
        platformFees: statement.platformFees,
        distributionFees: statement.distributionFees,
        recoupmentDeductions: statement.recoupmentDeductions,
        netRevenue: statement.netRevenue,
        payableAmount: statement.payableAmount,
        currency: statement.currency,
        exchangeRate: statement.exchangeRate,
        usdEquivalent: statement.usdEquivalent,
      },
      streaming: {
        totalStreams: statement.totalStreams,
        totalDownloads: statement.totalDownloads,
      },
      timestamps: {
        generatedAt: statement.generatedAt,
        finalizedAt: statement.finalizedAt,
        paidAt: statement.paidAt,
      },
    };

    if (options.includeLineItems) {
      exportData.lineItems = statement.lineItems;
    }

    if (options.includeTerritoryBreakdown) {
      exportData.territoryBreakdown = statement.territoryBreakdown;
    }

    if (options.includeDspBreakdown) {
      exportData.dspBreakdown = statement.dspBreakdown;
    }

    return {
      data: JSON.stringify(exportData, null, 2),
      filename: `royalty_statement_${statement.statementPeriod}_${statement.id}.json`,
      mimeType: 'application/json',
    };
  }

  private exportMultipleToCSV(
    statements: RoyaltyStatement[],
    options: ExportOptions
  ): { data: string; filename: string; mimeType: string } {
    const headers = [
      'Statement ID',
      'Period',
      'Period Start',
      'Period End',
      'Gross Revenue',
      'Platform Fees',
      'Distribution Fees',
      'Recoupment',
      'Net Revenue',
      'Payable Amount',
      'Currency',
      'Streams',
      'Downloads',
      'Status',
    ];

    const rows = statements.map(s => [
      s.id,
      s.statementPeriod,
      s.periodStart.toISOString(),
      s.periodEnd.toISOString(),
      String(s.grossRevenue),
      String(s.platformFees),
      String(s.distributionFees),
      String(s.recoupmentDeductions),
      String(s.netRevenue),
      String(s.payableAmount),
      s.currency,
      String(s.totalStreams),
      String(s.totalDownloads),
      s.status,
    ]);

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

    return {
      data: csv,
      filename: `royalty_statements_export_${this.formatDateForFilename(new Date())}.csv`,
      mimeType: 'text/csv',
    };
  }

  private exportMultipleToPDF(
    statements: RoyaltyStatement[],
    options: ExportOptions
  ): { data: Buffer; filename: string; mimeType: string } {
    const doc = new jsPDF();

    doc.setFontSize(20);
    doc.text('Royalty Statements Summary', 105, 20, { align: 'center' });

    doc.setFontSize(12);
    doc.text(`Total Statements: ${statements.length}`, 20, 35);
    doc.text(`Generated: ${new Date().toISOString().split('T')[0]}`, 20, 42);

    const totalGross = statements.reduce((sum, s) => sum + Number(s.grossRevenue), 0);
    const totalNet = statements.reduce((sum, s) => sum + Number(s.netRevenue), 0);
    const totalPayable = statements.reduce((sum, s) => sum + Number(s.payableAmount), 0);

    doc.autoTable({
      startY: 55,
      head: [['Period', 'Gross', 'Net', 'Payable', 'Streams', 'Status']],
      body: statements.map(s => [
        s.statementPeriod,
        `$${Number(s.grossRevenue).toFixed(2)}`,
        `$${Number(s.netRevenue).toFixed(2)}`,
        `$${Number(s.payableAmount).toFixed(2)}`,
        String(s.totalStreams || 0),
        s.status,
      ]),
      foot: [[
        'TOTAL',
        `$${totalGross.toFixed(2)}`,
        `$${totalNet.toFixed(2)}`,
        `$${totalPayable.toFixed(2)}`,
        '',
        '',
      ]],
      theme: 'striped',
      headStyles: { fillColor: [41, 128, 185] },
      footStyles: { fillColor: [52, 73, 94], fontStyle: 'bold' },
    });

    return {
      data: Buffer.from(doc.output('arraybuffer')),
      filename: `royalty_statements_summary_${this.formatDateForFilename(new Date())}.pdf`,
      mimeType: 'application/pdf',
    };
  }

  private exportMultipleToJSON(
    statements: RoyaltyStatement[],
    options: ExportOptions
  ): { data: string; filename: string; mimeType: string } {
    const exportData = {
      exportDate: new Date().toISOString(),
      count: statements.length,
      totals: {
        grossRevenue: statements.reduce((sum, s) => sum + Number(s.grossRevenue), 0),
        platformFees: statements.reduce((sum, s) => sum + Number(s.platformFees), 0),
        distributionFees: statements.reduce((sum, s) => sum + Number(s.distributionFees), 0),
        recoupmentDeductions: statements.reduce((sum, s) => sum + Number(s.recoupmentDeductions), 0),
        netRevenue: statements.reduce((sum, s) => sum + Number(s.netRevenue), 0),
        payableAmount: statements.reduce((sum, s) => sum + Number(s.payableAmount), 0),
        totalStreams: statements.reduce((sum, s) => sum + (s.totalStreams || 0), 0),
        totalDownloads: statements.reduce((sum, s) => sum + (s.totalDownloads || 0), 0),
      },
      statements: statements.map(s => ({
        id: s.id,
        period: s.statementPeriod,
        grossRevenue: s.grossRevenue,
        netRevenue: s.netRevenue,
        payableAmount: s.payableAmount,
        status: s.status,
      })),
    };

    return {
      data: JSON.stringify(exportData, null, 2),
      filename: `royalty_statements_export_${this.formatDateForFilename(new Date())}.json`,
      mimeType: 'application/json',
    };
  }

  private async generate1099PDF(taxDoc: unknown): Promise<Buffer> {
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.text('Form 1099-MISC', 105, 20, { align: 'center' });
    doc.setFontSize(12);
    doc.text('Miscellaneous Income', 105, 28, { align: 'center' });
    doc.text(`Tax Year: ${(taxDoc as any).taxYear}`, 105, 36, { align: 'center' });

    doc.setFontSize(10);
    doc.text('PAYER\'S Information:', 20, 50);
    doc.text((taxDoc as any).payer.name, 20, 58);
    doc.text(`EIN: ${(taxDoc as any).payer.ein}`, 20, 66);
    doc.text((taxDoc as any).payer.address, 20, 74);

    doc.text('RECIPIENT\'S Information:', 110, 50);
    doc.text((taxDoc as any).recipient.name, 110, 58);
    doc.text(`TIN: ${(taxDoc as any).recipient.taxId}`, 110, 66);
    doc.text((taxDoc as any).recipient.address, 110, 74);

    doc.autoTable({
      startY: 90,
      head: [['Box', 'Description', 'Amount']],
      body: [
        ['1', 'Rents', `$${(taxDoc as any).amounts.box1_rents.toFixed(2)}`],
        ['2', 'Royalties', `$${(taxDoc as any).amounts.box2_royalties.toFixed(2)}`],
        ['3', 'Other Income', `$${(taxDoc as any).amounts.box3_otherIncome.toFixed(2)}`],
      ],
      theme: 'grid',
    });

    doc.setFontSize(8);
    doc.text('This is a tax document. Please retain for your records.', 105, 280, { align: 'center' });

    return Buffer.from(doc.output('arraybuffer'));
  }

  private formatFor1099Submission(taxDoc: unknown): string {
    return [
      'IRS 1099-MISC SUBMISSION FORMAT',
      `TAX_YEAR:${(taxDoc as any).taxYear}`,
      `PAYER_NAME:${(taxDoc as any).payer.name}`,
      `PAYER_EIN:${(taxDoc as any).payer.ein}`,
      `RECIPIENT_NAME:${(taxDoc as any).recipient.name}`,
      `RECIPIENT_TIN:${(taxDoc as any).recipient.taxId}`,
      `BOX2_ROYALTIES:${(taxDoc as any).amounts.box2_royalties}`,
      `GENERATED:${new Date().toISOString()}`,
    ].join('\n');
  }

  private formatDateForFilename(date: Date): string {
    return date.toISOString().split('T')[0].replace(/-/g, '');
  }

  async exportToExcel(
    statements: RoyaltyStatement[],
    options: ExportOptions
  ): Promise<{ data: string; filename: string; mimeType: string }> {
    const worksheets: Record<string, string[][]> = {};

    worksheets['Summary'] = [
      ['Royalty Statements Export', '', '', '', '', '', '', ''],
      ['Generated', new Date().toISOString(), '', '', '', '', '', ''],
      ['Total Statements', String(statements.length), '', '', '', '', '', ''],
      [],
      ['Statement ID', 'Period', 'Gross Revenue', 'Platform Fees', 'Distribution Fees', 'Recoupment', 'Net Revenue', 'Payable', 'Status'],
    ];

    for (const s of statements) {
      worksheets['Summary'].push([
        s.id,
        s.statementPeriod,
        `$${Number(s.grossRevenue).toFixed(2)}`,
        `$${Number(s.platformFees).toFixed(2)}`,
        `$${Number(s.distributionFees).toFixed(2)}`,
        `$${Number(s.recoupmentDeductions).toFixed(2)}`,
        `$${Number(s.netRevenue).toFixed(2)}`,
        `$${Number(s.payableAmount).toFixed(2)}`,
        s.status,
      ]);
    }

    const totalGross = statements.reduce((sum, s) => sum + Number(s.grossRevenue), 0);
    const totalNet = statements.reduce((sum, s) => sum + Number(s.netRevenue), 0);
    const totalPayable = statements.reduce((sum, s) => sum + Number(s.payableAmount), 0);

    worksheets['Summary'].push([]);
    worksheets['Summary'].push([
      'TOTALS',
      '',
      `$${totalGross.toFixed(2)}`,
      '',
      '',
      '',
      `$${totalNet.toFixed(2)}`,
      `$${totalPayable.toFixed(2)}`,
      '',
    ]);

    if (options.includeLineItems) {
      worksheets['Line Items'] = [
        ['Statement ID', 'DSP', 'Territory', 'Streams', 'Downloads', 'Gross Revenue', 'Effective Rate', 'Currency', 'Exchange Rate'],
      ];

      for (const s of statements) {
        const lineItems = (s.lineItems || []) as Array<{
          dsp: string;
          territory: string;
          streams: number;
          downloads: number;
          grossRevenue: number;
          effectiveRate: number;
          currency: string;
          exchangeRate: number;
        }>;

        for (const item of lineItems) {
          worksheets['Line Items'].push([
            s.id,
            item.dsp,
            item.territory,
            String(item.streams),
            String(item.downloads),
            `$${item.grossRevenue.toFixed(4)}`,
            `$${item.effectiveRate.toFixed(6)}`,
            item.currency,
            String(item.exchangeRate),
          ]);
        }
      }
    }

    if (options.includeTerritoryBreakdown) {
      worksheets['Territory Breakdown'] = [
        ['Statement ID', 'Territory', 'Streams', 'Revenue', 'Percentage'],
      ];

      for (const s of statements) {
        const territories = (s.territoryBreakdown || []) as Array<{
          territory: string;
          streams: number;
          revenue: number;
          percentage: number;
        }>;

        for (const t of territories) {
          worksheets['Territory Breakdown'].push([
            s.id,
            t.territory,
            String(t.streams),
            `$${t.revenue.toFixed(2)}`,
            `${t.percentage.toFixed(2)}%`,
          ]);
        }
      }
    }

    if (options.includeDspBreakdown) {
      worksheets['DSP Breakdown'] = [
        ['Statement ID', 'Platform', 'Streams', 'Revenue', 'Average Rate'],
      ];

      for (const s of statements) {
        const dsps = (s.dspBreakdown || []) as Array<{
          dsp: string;
          streams: number;
          revenue: number;
          averageRate: number;
        }>;

        for (const d of dsps) {
          worksheets['DSP Breakdown'].push([
            s.id,
            d.dsp,
            String(d.streams),
            `$${d.revenue.toFixed(2)}`,
            `$${d.averageRate.toFixed(6)}`,
          ]);
        }
      }
    }

    const xlsxContent = this.generateXLSXFormat(worksheets);

    return {
      data: xlsxContent,
      filename: `royalty_statements_${this.formatDateForFilename(new Date())}.xlsx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  private generateXLSXFormat(worksheets: Record<string, string[][]>): string {
    let csvOutput = '';
    for (const [sheetName, rows] of Object.entries(worksheets)) {
      csvOutput += `=== ${sheetName} ===\n`;
      for (const row of rows) {
        csvOutput += row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',') + '\n';
      }
      csvOutput += '\n';
    }
    return csvOutput;
  }

  async exportYearlySummary(
    options: YearlySummaryOptions
  ): Promise<{ data: string; filename: string; mimeType: string }> {
    const yearStart = new Date(options.year, 0, 1);
    const yearEnd = new Date(options.year, 11, 31, 23, 59, 59);

    const statements = await db
      .select()
      .from(royaltyStatements)
      .where(
        and(
          eq(royaltyStatements.userId, options.userId),
          gte(royaltyStatements.periodStart, yearStart),
          lte(royaltyStatements.periodEnd, yearEnd)
        )
      )
      .orderBy(desc(royaltyStatements.periodStart));

    const monthlyTotals: Record<string, { 
      gross: number; 
      net: number; 
      payable: number; 
      streams: number 
    }> = {};

    const territoryTotals: Record<string, { streams: number; revenue: number }> = {};
    const dspTotals: Record<string, { streams: number; revenue: number }> = {};

    let totalGross = 0;
    let totalNet = 0;
    let totalPayable = 0;
    let totalStreams = 0;

    for (const s of statements) {
      const month = s.statementPeriod || new Date(s.periodStart).toISOString().slice(0, 7);
      
      if (!monthlyTotals[month]) {
        monthlyTotals[month] = { gross: 0, net: 0, payable: 0, streams: 0 };
      }

      monthlyTotals[month].gross += Number(s.grossRevenue);
      monthlyTotals[month].net += Number(s.netRevenue);
      monthlyTotals[month].payable += Number(s.payableAmount);
      monthlyTotals[month].streams += s.totalStreams || 0;

      totalGross += Number(s.grossRevenue);
      totalNet += Number(s.netRevenue);
      totalPayable += Number(s.payableAmount);
      totalStreams += s.totalStreams || 0;

      if (options.includeTerritoryBreakdown && s.territoryBreakdown) {
        const territories = s.territoryBreakdown as Array<{
          territory: string;
          streams: number;
          revenue: number;
        }>;

        for (const t of territories) {
          if (!territoryTotals[t.territory]) {
            territoryTotals[t.territory] = { streams: 0, revenue: 0 };
          }
          territoryTotals[t.territory].streams += t.streams;
          territoryTotals[t.territory].revenue += t.revenue;
        }
      }

      if (options.includeDspBreakdown && s.dspBreakdown) {
        const dsps = s.dspBreakdown as Array<{
          dsp: string;
          streams: number;
          revenue: number;
        }>;

        for (const d of dsps) {
          if (!dspTotals[d.dsp]) {
            dspTotals[d.dsp] = { streams: 0, revenue: 0 };
          }
          dspTotals[d.dsp].streams += d.streams;
          dspTotals[d.dsp].revenue += d.revenue;
        }
      }
    }

    const summaryData = {
      year: options.year,
      userId: options.userId,
      generatedAt: new Date().toISOString(),
      totals: {
        grossRevenue: totalGross,
        netRevenue: totalNet,
        payableAmount: totalPayable,
        totalStreams,
        statementCount: statements.length,
      },
      monthlyBreakdown: options.includeMonthlyBreakdown ? monthlyTotals : undefined,
      territoryBreakdown: options.includeTerritoryBreakdown ? Object.entries(territoryTotals)
        .map(([territory, data]) => ({
          territory,
          ...data,
          percentage: totalStreams > 0 ? (data.streams / totalStreams) * 100 : 0,
        }))
        .sort((a, b) => b.revenue - a.revenue) : undefined,
      dspBreakdown: options.includeDspBreakdown ? Object.entries(dspTotals)
        .map(([dsp, data]) => ({
          dsp,
          ...data,
          percentage: totalStreams > 0 ? (data.streams / totalStreams) * 100 : 0,
        }))
        .sort((a, b) => b.revenue - a.revenue) : undefined,
    };

    return {
      data: JSON.stringify(summaryData, null, 2),
      filename: `yearly_summary_${options.year}_${options.userId}.json`,
      mimeType: 'application/json',
    };
  }

  async exportTerritoryReport(
    options: TerritoryReportOptions
  ): Promise<{ data: string | Buffer; filename: string; mimeType: string }> {
    const statements = await db
      .select()
      .from(royaltyStatements)
      .where(
        and(
          eq(royaltyStatements.userId, options.userId),
          gte(royaltyStatements.periodStart, options.startDate),
          lte(royaltyStatements.periodEnd, options.endDate)
        )
      );

    const territoryData: Record<string, {
      streams: number;
      revenue: number;
      downloads: number;
      periods: string[];
    }> = {};

    for (const s of statements) {
      const territories = (s.territoryBreakdown || []) as Array<{
        territory: string;
        streams: number;
        revenue: number;
      }>;

      for (const t of territories) {
        if (!territoryData[t.territory]) {
          territoryData[t.territory] = { streams: 0, revenue: 0, downloads: 0, periods: [] };
        }
        territoryData[t.territory].streams += t.streams;
        territoryData[t.territory].revenue += t.revenue;
        if (!territoryData[t.territory].periods.includes(s.statementPeriod)) {
          territoryData[t.territory].periods.push(s.statementPeriod);
        }
      }
    }

    const reportData = Object.entries(territoryData)
      .map(([territory, data]) => ({
        territory,
        ...data,
        avgRevenuePerStream: data.streams > 0 ? data.revenue / data.streams : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    switch (options.format) {
      case 'csv': {
        const headers = ['Territory', 'Streams', 'Revenue', 'Avg Revenue/Stream', 'Periods'];
        const rows = reportData.map(r => [
          r.territory,
          String(r.streams),
          `$${r.revenue.toFixed(2)}`,
          `$${r.avgRevenuePerStream.toFixed(6)}`,
          r.periods.join('; '),
        ]);
        const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
        return {
          data: csv,
          filename: `territory_report_${this.formatDateForFilename(options.startDate)}_${this.formatDateForFilename(options.endDate)}.csv`,
          mimeType: 'text/csv',
        };
      }
      case 'json':
      default:
        return {
          data: JSON.stringify({
            dateRange: {
              start: options.startDate.toISOString(),
              end: options.endDate.toISOString(),
            },
            generatedAt: new Date().toISOString(),
            territories: reportData,
          }, null, 2),
          filename: `territory_report_${this.formatDateForFilename(options.startDate)}_${this.formatDateForFilename(options.endDate)}.json`,
          mimeType: 'application/json',
        };
    }
  }
}

export const royaltyExportsService = new RoyaltyExportsService();
