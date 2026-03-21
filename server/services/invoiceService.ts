import { nanoid } from 'nanoid';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { logger } from '../logger.js';

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
  discount?: number;
  total: number;
}

export interface InvoiceAddress {
  name: string;
  company?: string;
  street: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
  email?: string;
  phone?: string;
  taxId?: string;
}

export interface TaxBreakdown {
  taxType: string;
  taxRate: number;
  taxableAmount: number;
  taxAmount: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  userId: string;
  type: 'sale' | 'purchase' | 'royalty' | 'service';
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled' | 'refunded';
  from: InvoiceAddress;
  to: InvoiceAddress;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  taxes: TaxBreakdown[];
  totalTax: number;
  discount?: number;
  discountType?: 'percentage' | 'fixed';
  total: number;
  currency: string;
  exchangeRate?: number;
  dueDate: Date;
  issuedDate: Date;
  paidDate?: Date;
  paymentMethod?: string;
  notes?: string;
  terms?: string;
  metadata?: Record<string, any>;
}

export interface TaxRate {
  country: string;
  state?: string;
  taxType: string;
  rate: number;
  name: string;
  isCompound?: boolean;
}

const taxRates: TaxRate[] = [
  { country: 'US', state: 'CA', taxType: 'sales', rate: 7.25, name: 'California Sales Tax' },
  { country: 'US', state: 'NY', taxType: 'sales', rate: 8.0, name: 'New York Sales Tax' },
  { country: 'US', state: 'TX', taxType: 'sales', rate: 6.25, name: 'Texas Sales Tax' },
  { country: 'US', state: 'FL', taxType: 'sales', rate: 6.0, name: 'Florida Sales Tax' },
  { country: 'US', state: 'WA', taxType: 'sales', rate: 6.5, name: 'Washington Sales Tax' },
  { country: 'US', state: 'IL', taxType: 'sales', rate: 6.25, name: 'Illinois Sales Tax' },
  { country: 'US', state: 'PA', taxType: 'sales', rate: 6.0, name: 'Pennsylvania Sales Tax' },
  { country: 'US', state: 'OH', taxType: 'sales', rate: 5.75, name: 'Ohio Sales Tax' },
  { country: 'US', state: 'GA', taxType: 'sales', rate: 4.0, name: 'Georgia Sales Tax' },
  { country: 'US', state: 'NC', taxType: 'sales', rate: 4.75, name: 'North Carolina Sales Tax' },
  { country: 'GB', taxType: 'VAT', rate: 20, name: 'UK VAT' },
  { country: 'DE', taxType: 'VAT', rate: 19, name: 'Germany VAT' },
  { country: 'FR', taxType: 'VAT', rate: 20, name: 'France VAT' },
  { country: 'IT', taxType: 'VAT', rate: 22, name: 'Italy VAT' },
  { country: 'ES', taxType: 'VAT', rate: 21, name: 'Spain VAT' },
  { country: 'NL', taxType: 'VAT', rate: 21, name: 'Netherlands VAT' },
  { country: 'BE', taxType: 'VAT', rate: 21, name: 'Belgium VAT' },
  { country: 'AT', taxType: 'VAT', rate: 20, name: 'Austria VAT' },
  { country: 'SE', taxType: 'VAT', rate: 25, name: 'Sweden VAT' },
  { country: 'DK', taxType: 'VAT', rate: 25, name: 'Denmark VAT' },
  { country: 'NO', taxType: 'VAT', rate: 25, name: 'Norway VAT' },
  { country: 'FI', taxType: 'VAT', rate: 24, name: 'Finland VAT' },
  { country: 'PL', taxType: 'VAT', rate: 23, name: 'Poland VAT' },
  { country: 'CZ', taxType: 'VAT', rate: 21, name: 'Czech Republic VAT' },
  { country: 'PT', taxType: 'VAT', rate: 23, name: 'Portugal VAT' },
  { country: 'IE', taxType: 'VAT', rate: 23, name: 'Ireland VAT' },
  { country: 'CH', taxType: 'VAT', rate: 7.7, name: 'Switzerland VAT' },
  { country: 'AU', taxType: 'GST', rate: 10, name: 'Australia GST' },
  { country: 'NZ', taxType: 'GST', rate: 15, name: 'New Zealand GST' },
  { country: 'CA', taxType: 'GST', rate: 5, name: 'Canada GST' },
  { country: 'CA', state: 'ON', taxType: 'HST', rate: 13, name: 'Ontario HST' },
  { country: 'CA', state: 'BC', taxType: 'PST', rate: 7, name: 'British Columbia PST' },
  { country: 'CA', state: 'QC', taxType: 'QST', rate: 9.975, name: 'Quebec QST', isCompound: true },
  { country: 'JP', taxType: 'consumption', rate: 10, name: 'Japan Consumption Tax' },
  { country: 'KR', taxType: 'VAT', rate: 10, name: 'South Korea VAT' },
  { country: 'SG', taxType: 'GST', rate: 8, name: 'Singapore GST' },
  { country: 'IN', taxType: 'GST', rate: 18, name: 'India GST' },
  { country: 'BR', taxType: 'ICMS', rate: 18, name: 'Brazil ICMS' },
  { country: 'MX', taxType: 'IVA', rate: 16, name: 'Mexico IVA' },
  { country: 'ZA', taxType: 'VAT', rate: 15, name: 'South Africa VAT' },
  { country: 'AE', taxType: 'VAT', rate: 5, name: 'UAE VAT' },
];

const currencySymbols: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CAD: 'C$',
  AUD: 'A$',
  CHF: 'CHF',
  CNY: '¥',
  INR: '₹',
  MXN: 'MX$',
  BRL: 'R$',
  KRW: '₩',
  SGD: 'S$',
  NZD: 'NZ$',
  SEK: 'kr',
  NOK: 'kr',
  DKK: 'kr',
  ZAR: 'R',
  AED: 'د.إ',
  PLN: 'zł',
  CZK: 'Kč',
};

class InvoiceService {
  private invoices: Map<string, Invoice> = new Map();
  private invoiceCounter: number = 1000;

  generateInvoiceNumber(): string {
    const year = new Date().getFullYear();
    const number = ++this.invoiceCounter;
    return `INV-${year}-${number.toString().padStart(5, '0')}`;
  }

  getTaxRates(country: string, state?: string): TaxRate[] {
    const rates = taxRates.filter(r => {
      if (r.country !== country) return false;
      if (state && r.state && r.state !== state) return false;
      if (!state && r.state) return false;
      return true;
    });

    if (rates.length === 0 && state) {
      return taxRates.filter(r => r.country === country && !r.state);
    }

    return rates;
  }

  calculateTax(amount: number, country: string, state?: string): TaxBreakdown[] {
    const rates = this.getTaxRates(country, state);
    const taxes: TaxBreakdown[] = [];
    let taxableAmount = amount;

    for (const rate of rates) {
      if (rate.isCompound) {
        taxableAmount = amount + taxes.reduce((sum, t) => sum + t.taxAmount, 0);
      }

      const taxAmount = taxableAmount * (rate.rate / 100);
      taxes.push({
        taxType: rate.taxType,
        taxRate: rate.rate,
        taxableAmount,
        taxAmount: Math.round(taxAmount * 100) / 100,
      });
    }

    return taxes;
  }

  getCurrencySymbol(currency: string): string {
    return currencySymbols[currency] || currency;
  }

  formatCurrency(amount: number, currency: string): string {
    const symbol = this.getCurrencySymbol(currency);
    return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  createInvoice(data: {
    userId: string;
    type: Invoice['type'];
    from: InvoiceAddress;
    to: InvoiceAddress;
    lineItems: Omit<InvoiceLineItem, 'id' | 'total'>[];
    currency?: string;
    dueDate?: Date;
    notes?: string;
    terms?: string;
    discount?: number;
    discountType?: 'percentage' | 'fixed';
    applyTax?: boolean;
    metadata?: Record<string, any>;
  }): Invoice {
    const currency = data.currency || 'USD';
    const invoiceNumber = this.generateInvoiceNumber();

    const lineItems: InvoiceLineItem[] = data.lineItems.map(item => {
      const subtotal = item.quantity * item.unitPrice;
      const discountAmount = item.discount ? subtotal * (item.discount / 100) : 0;
      const taxAmount = item.taxRate ? (subtotal - discountAmount) * (item.taxRate / 100) : 0;
      const total = subtotal - discountAmount + taxAmount;

      return {
        id: nanoid(8),
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxRate: item.taxRate,
        discount: item.discount,
        total: Math.round(total * 100) / 100,
      };
    });

    const subtotal = lineItems.reduce((sum, item) => {
      const itemSubtotal = item.quantity * item.unitPrice;
      const itemDiscount = item.discount ? itemSubtotal * (item.discount / 100) : 0;
      return sum + (itemSubtotal - itemDiscount);
    }, 0);

    let taxes: TaxBreakdown[] = [];
    if (data.applyTax !== false) {
      taxes = this.calculateTax(subtotal, data.to.country, data.to.state);
    }

    const totalTax = taxes.reduce((sum, t) => sum + t.taxAmount, 0);

    let discountAmount = 0;
    if (data.discount) {
      if (data.discountType === 'percentage') {
        discountAmount = subtotal * (data.discount / 100);
      } else {
        discountAmount = data.discount;
      }
    }

    const total = subtotal + totalTax - discountAmount;

    const invoice: Invoice = {
      id: `inv_${nanoid(12)}`,
      invoiceNumber,
      userId: data.userId,
      type: data.type,
      status: 'draft',
      from: data.from,
      to: data.to,
      lineItems,
      subtotal: Math.round(subtotal * 100) / 100,
      taxes,
      totalTax: Math.round(totalTax * 100) / 100,
      discount: discountAmount > 0 ? Math.round(discountAmount * 100) / 100 : undefined,
      discountType: data.discountType,
      total: Math.round(total * 100) / 100,
      currency,
      dueDate: data.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      issuedDate: new Date(),
      notes: data.notes,
      terms: data.terms || 'Payment is due within 30 days of invoice date.',
      metadata: data.metadata,
    };

    this.invoices.set(invoice.id, invoice);
    logger.info(`Created invoice ${invoice.invoiceNumber} for user ${data.userId}`);
    return invoice;
  }

  getInvoice(invoiceId: string): Invoice | undefined {
    return this.invoices.get(invoiceId);
  }

  getInvoicesByUser(userId: string): Invoice[] {
    return Array.from(this.invoices.values()).filter(inv => inv.userId === userId);
  }

  updateInvoiceStatus(invoiceId: string, status: Invoice['status'], paymentDetails?: {
    paidDate?: Date;
    paymentMethod?: string;
  }): Invoice {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    invoice.status = status;
    if (status === 'paid' && paymentDetails) {
      invoice.paidDate = paymentDetails.paidDate || new Date();
      invoice.paymentMethod = paymentDetails.paymentMethod;
    }

    this.invoices.set(invoiceId, invoice);
    logger.info(`Updated invoice ${invoice.invoiceNumber} status to ${status}`);
    return invoice;
  }

  generatePDF(invoiceId: string): Buffer {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let y = margin;

    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('INVOICE', pageWidth - margin, y, { align: 'right' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(invoice.invoiceNumber, pageWidth - margin, y + 10, { align: 'right' });

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(invoice.from.name, margin, y);
    y += 7;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    if (invoice.from.company) {
      doc.text(invoice.from.company, margin, y);
      y += 5;
    }
    doc.text(invoice.from.street, margin, y);
    y += 5;
    doc.text(`${invoice.from.city}, ${invoice.from.state || ''} ${invoice.from.postalCode}`, margin, y);
    y += 5;
    doc.text(invoice.from.country, margin, y);
    y += 5;
    if (invoice.from.email) {
      doc.text(invoice.from.email, margin, y);
      y += 5;
    }
    if (invoice.from.taxId) {
      doc.text(`Tax ID: ${invoice.from.taxId}`, margin, y);
      y += 5;
    }

    y += 15;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Bill To:', margin, y);
    y += 7;

    doc.setFont('helvetica', 'normal');
    doc.text(invoice.to.name, margin, y);
    y += 5;
    if (invoice.to.company) {
      doc.text(invoice.to.company, margin, y);
      y += 5;
    }
    doc.text(invoice.to.street, margin, y);
    y += 5;
    doc.text(`${invoice.to.city}, ${invoice.to.state || ''} ${invoice.to.postalCode}`, margin, y);
    y += 5;
    doc.text(invoice.to.country, margin, y);
    y += 5;
    if (invoice.to.email) {
      doc.text(invoice.to.email, margin, y);
      y += 5;
    }

    const detailsX = pageWidth - margin - 60;
    let detailsY = 60;
    doc.setFont('helvetica', 'bold');
    doc.text('Invoice Date:', detailsX, detailsY);
    doc.setFont('helvetica', 'normal');
    doc.text(new Date(invoice.issuedDate).toLocaleDateString(), detailsX + 35, detailsY);
    detailsY += 7;

    doc.setFont('helvetica', 'bold');
    doc.text('Due Date:', detailsX, detailsY);
    doc.setFont('helvetica', 'normal');
    doc.text(new Date(invoice.dueDate).toLocaleDateString(), detailsX + 35, detailsY);
    detailsY += 7;

    doc.setFont('helvetica', 'bold');
    doc.text('Status:', detailsX, detailsY);
    doc.setFont('helvetica', 'normal');
    doc.text(invoice.status.toUpperCase(), detailsX + 35, detailsY);

    y = Math.max(y, detailsY) + 20;

    const tableData = invoice.lineItems.map(item => [
      item.description,
      item.quantity.toString(),
      this.formatCurrency(item.unitPrice, invoice.currency),
      item.taxRate ? `${item.taxRate}%` : '-',
      this.formatCurrency(item.total, invoice.currency),
    ]);

    (doc as any).autoTable({
      startY: y,
      head: [['Description', 'Qty', 'Unit Price', 'Tax', 'Total']],
      body: tableData,
      theme: 'striped',
      headStyles: {
        fillColor: [66, 66, 66],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      styles: {
        fontSize: 9,
        cellPadding: 5,
      },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 20, halign: 'center' },
        2: { cellWidth: 30, halign: 'right' },
        3: { cellWidth: 20, halign: 'center' },
        4: { cellWidth: 30, halign: 'right' },
      },
    });

    y = (doc as any).lastAutoTable.finalY + 10;

    const totalsX = pageWidth - margin - 60;
    
    doc.setFont('helvetica', 'normal');
    doc.text('Subtotal:', totalsX, y);
    doc.text(this.formatCurrency(invoice.subtotal, invoice.currency), pageWidth - margin, y, { align: 'right' });
    y += 7;

    for (const tax of invoice.taxes) {
      doc.text(`${tax.taxType.toUpperCase()} (${tax.taxRate}%):`, totalsX, y);
      doc.text(this.formatCurrency(tax.taxAmount, invoice.currency), pageWidth - margin, y, { align: 'right' });
      y += 7;
    }

    if (invoice.discount) {
      doc.text('Discount:', totalsX, y);
      doc.text(`-${this.formatCurrency(invoice.discount, invoice.currency)}`, pageWidth - margin, y, { align: 'right' });
      y += 7;
    }

    y += 3;
    doc.setLineWidth(0.5);
    doc.line(totalsX, y, pageWidth - margin, y);
    y += 7;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Total:', totalsX, y);
    doc.text(this.formatCurrency(invoice.total, invoice.currency), pageWidth - margin, y, { align: 'right' });

    y += 20;

    if (invoice.notes) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Notes:', margin, y);
      y += 7;
      doc.setFont('helvetica', 'normal');
      const noteLines = doc.splitTextToSize(invoice.notes, pageWidth - margin * 2);
      doc.text(noteLines, margin, y);
      y += noteLines.length * 5 + 10;
    }

    if (invoice.terms) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Terms & Conditions:', margin, y);
      y += 7;
      doc.setFont('helvetica', 'normal');
      const termLines = doc.splitTextToSize(invoice.terms, pageWidth - margin * 2);
      doc.text(termLines, margin, y);
    }

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Invoice ID: ${invoice.id}`, margin, doc.internal.pageSize.getHeight() - 10);
    doc.text(`Generated: ${new Date().toISOString()}`, pageWidth - margin - 60, doc.internal.pageSize.getHeight() - 10);

    return Buffer.from(doc.output('arraybuffer'));
  }

  getOverdueInvoices(userId?: string): Invoice[] {
    const now = new Date();
    return Array.from(this.invoices.values()).filter(inv => {
      if (userId && inv.userId !== userId) return false;
      if (inv.status === 'paid' || inv.status === 'cancelled' || inv.status === 'refunded') return false;
      return new Date(inv.dueDate) < now;
    });
  }

  getInvoiceSummary(userId: string): {
    totalInvoiced: number;
    totalPaid: number;
    totalOutstanding: number;
    totalOverdue: number;
    invoiceCount: number;
    byStatus: Record<string, number>;
  } {
    const userInvoices = this.getInvoicesByUser(userId);
    const now = new Date();

    const summary = {
      totalInvoiced: 0,
      totalPaid: 0,
      totalOutstanding: 0,
      totalOverdue: 0,
      invoiceCount: userInvoices.length,
      byStatus: {} as Record<string, number>,
    };

    for (const inv of userInvoices) {
      summary.totalInvoiced += inv.total;
      summary.byStatus[inv.status] = (summary.byStatus[inv.status] || 0) + 1;

      if (inv.status === 'paid') {
        summary.totalPaid += inv.total;
      } else if (inv.status !== 'cancelled' && inv.status !== 'refunded') {
        summary.totalOutstanding += inv.total;
        if (new Date(inv.dueDate) < now) {
          summary.totalOverdue += inv.total;
        }
      }
    }

    return summary;
  }
}

export const invoiceService = new InvoiceService();
