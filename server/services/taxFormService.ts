import { nanoid } from 'nanoid';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { logger } from '../logger.js';

export type TaxFormType = 'W-9' | 'W-8BEN' | 'W-8BEN-E' | '1099-MISC' | '1099-NEC' | '1099-K';

export interface TaxpayerInfo {
  name: string;
  businessName?: string;
  taxClassification?: 'individual' | 'c_corp' | 's_corp' | 'partnership' | 'trust' | 'llc' | 'other';
  llcClassification?: 'c' | 's' | 'p';
  exemptPayeeCode?: string;
  fatcaExemptionCode?: string;
  address: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  tinType: 'ssn' | 'ein' | 'itin' | 'foreign_tin';
  tin: string;
  foreignTinCountry?: string;
  dateOfBirth?: Date;
  countryOfCitizenship?: string;
  claimTreatyBenefits?: boolean;
  treatyCountry?: string;
  treatyArticle?: string;
  treatyRate?: number;
}

export interface GeneratedTaxForm {
  id: string;
  userId: string;
  formType: TaxFormType;
  taxYear: number;
  taxpayerInfo: Partial<TaxpayerInfo>;
  recipientInfo?: Partial<TaxpayerInfo>;
  status: 'draft' | 'pending_signature' | 'signed' | 'submitted' | 'rejected';
  amounts?: Record<string, number>;
  signatureDate?: Date;
  signatureHash?: string;
  createdAt: Date;
  updatedAt: Date;
  pdfUrl?: string;
}

export interface TaxSummary {
  userId: string;
  taxYear: number;
  totalEarnings: number;
  totalWithholding: number;
  platformFees: number;
  netEarnings: number;
  bySource: Array<{
    source: string;
    description: string;
    grossAmount: number;
    fees: number;
    netAmount: number;
    withholding: number;
  }>;
  forms: GeneratedTaxForm[];
}

export interface WithholdingCalculation {
  grossAmount: number;
  withholdingRate: number;
  withholdingAmount: number;
  netAmount: number;
  reason: string;
  treatyApplied?: boolean;
}

const withholdingRates: Record<string, number> = {
  default_us: 0,
  default_foreign: 30,
  backup_withholding: 24,
  treaty_reduced: 0,
};

const treatyRates: Record<string, number> = {
  CA: 0,
  GB: 0,
  DE: 0,
  FR: 0,
  JP: 0,
  AU: 0,
  NZ: 0,
  NL: 0,
  SE: 0,
  DK: 0,
  NO: 0,
  IT: 0,
  ES: 0,
  IE: 0,
  BE: 0,
  CH: 0,
  AT: 0,
  FI: 0,
  LU: 0,
  PT: 10,
  GR: 0,
  KR: 0,
  SG: 0,
  IN: 15,
  MX: 10,
  BR: 15,
  ZA: 0,
  IL: 10,
  CN: 10,
  RU: 0,
  PL: 0,
  CZ: 0,
  HU: 0,
  TR: 10,
};

class TaxFormService {
  private taxForms: Map<string, GeneratedTaxForm> = new Map();

  calculateWithholding(
    grossAmount: number,
    isUSPerson: boolean,
    country?: string,
    hasTreatyBenefits?: boolean,
    hasValidW9?: boolean,
    hasBackupWithholding?: boolean
  ): WithholdingCalculation {
    if (isUSPerson) {
      if (hasBackupWithholding) {
        const rate = withholdingRates.backup_withholding;
        const withholdingAmount = grossAmount * (rate / 100);
        return {
          grossAmount,
          withholdingRate: rate,
          withholdingAmount: Math.round(withholdingAmount * 100) / 100,
          netAmount: grossAmount - withholdingAmount,
          reason: 'Backup withholding applied (missing or invalid TIN)',
        };
      }

      if (!hasValidW9) {
        const rate = withholdingRates.backup_withholding;
        const withholdingAmount = grossAmount * (rate / 100);
        return {
          grossAmount,
          withholdingRate: rate,
          withholdingAmount: Math.round(withholdingAmount * 100) / 100,
          netAmount: grossAmount - withholdingAmount,
          reason: 'Backup withholding - W-9 not on file',
        };
      }

      return {
        grossAmount,
        withholdingRate: 0,
        withholdingAmount: 0,
        netAmount: grossAmount,
        reason: 'US person with valid W-9 - no withholding required',
      };
    }

    if (hasTreatyBenefits && country && treatyRates[country] !== undefined) {
      const rate = treatyRates[country];
      const withholdingAmount = grossAmount * (rate / 100);
      return {
        grossAmount,
        withholdingRate: rate,
        withholdingAmount: Math.round(withholdingAmount * 100) / 100,
        netAmount: grossAmount - withholdingAmount,
        reason: `Treaty rate applied for ${country}`,
        treatyApplied: true,
      };
    }

    const rate = withholdingRates.default_foreign;
    const withholdingAmount = grossAmount * (rate / 100);
    return {
      grossAmount,
      withholdingRate: rate,
      withholdingAmount: Math.round(withholdingAmount * 100) / 100,
      netAmount: grossAmount - withholdingAmount,
      reason: 'Standard 30% withholding for non-US persons',
    };
  }

  generateW9(userId: string, taxpayerInfo: TaxpayerInfo): GeneratedTaxForm {
    const form: GeneratedTaxForm = {
      id: `tax_${nanoid(12)}`,
      userId,
      formType: 'W-9',
      taxYear: new Date().getFullYear(),
      taxpayerInfo,
      status: 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.taxForms.set(form.id, form);
    logger.info(`Generated W-9 form ${form.id} for user ${userId}`);
    return form;
  }

  generateW8BEN(userId: string, taxpayerInfo: TaxpayerInfo): GeneratedTaxForm {
    if (!taxpayerInfo.countryOfCitizenship) {
      throw new Error('Country of citizenship is required for W-8BEN');
    }

    const form: GeneratedTaxForm = {
      id: `tax_${nanoid(12)}`,
      userId,
      formType: 'W-8BEN',
      taxYear: new Date().getFullYear(),
      taxpayerInfo,
      status: 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.taxForms.set(form.id, form);
    logger.info(`Generated W-8BEN form ${form.id} for user ${userId}`);
    return form;
  }

  generate1099NEC(
    payerId: string,
    payerInfo: TaxpayerInfo,
    recipientInfo: TaxpayerInfo,
    taxYear: number,
    amounts: { nonemployeeCompensation: number; federalWithholding?: number; stateWithholding?: number }
  ): GeneratedTaxForm {
    const form: GeneratedTaxForm = {
      id: `tax_${nanoid(12)}`,
      userId: payerId,
      formType: '1099-NEC',
      taxYear,
      taxpayerInfo: payerInfo,
      recipientInfo,
      status: 'draft',
      amounts: {
        box1_nonemployee_compensation: amounts.nonemployeeCompensation,
        box4_federal_withholding: amounts.federalWithholding || 0,
        box5_state_tax_withheld: amounts.stateWithholding || 0,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.taxForms.set(form.id, form);
    logger.info(`Generated 1099-NEC form ${form.id} for tax year ${taxYear}`);
    return form;
  }

  generate1099MISC(
    payerId: string,
    payerInfo: TaxpayerInfo,
    recipientInfo: TaxpayerInfo,
    taxYear: number,
    amounts: {
      rents?: number;
      royalties?: number;
      otherIncome?: number;
      federalWithholding?: number;
      fishingBoatProceeds?: number;
      medicalPayments?: number;
      substitutePayments?: number;
      cropInsuranceProceeds?: number;
      grossProceedsAttorney?: number;
      section409ADeferrals?: number;
      excessGoldenParachute?: number;
      nqdc?: number;
    }
  ): GeneratedTaxForm {
    const form: GeneratedTaxForm = {
      id: `tax_${nanoid(12)}`,
      userId: payerId,
      formType: '1099-MISC',
      taxYear,
      taxpayerInfo: payerInfo,
      recipientInfo,
      status: 'draft',
      amounts: {
        box1_rents: amounts.rents || 0,
        box2_royalties: amounts.royalties || 0,
        box3_other_income: amounts.otherIncome || 0,
        box4_federal_withholding: amounts.federalWithholding || 0,
        box5_fishing_boat_proceeds: amounts.fishingBoatProceeds || 0,
        box6_medical_payments: amounts.medicalPayments || 0,
        box8_substitute_payments: amounts.substitutePayments || 0,
        box9_crop_insurance: amounts.cropInsuranceProceeds || 0,
        box10_gross_proceeds_attorney: amounts.grossProceedsAttorney || 0,
        box12_section_409a: amounts.section409ADeferrals || 0,
        box13_excess_golden_parachute: amounts.excessGoldenParachute || 0,
        box14_nqdc: amounts.nqdc || 0,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.taxForms.set(form.id, form);
    logger.info(`Generated 1099-MISC form ${form.id} for tax year ${taxYear}`);
    return form;
  }

  generate1099K(
    payerId: string,
    payerInfo: TaxpayerInfo,
    recipientInfo: TaxpayerInfo,
    taxYear: number,
    amounts: {
      grossAmount: number;
      cardNotPresent?: number;
      transactionsByMonth: number[];
      federalWithholding?: number;
      stateWithholding?: number;
    }
  ): GeneratedTaxForm {
    const form: GeneratedTaxForm = {
      id: `tax_${nanoid(12)}`,
      userId: payerId,
      formType: '1099-K',
      taxYear,
      taxpayerInfo: payerInfo,
      recipientInfo,
      status: 'draft',
      amounts: {
        box1a_gross_amount: amounts.grossAmount,
        box1b_card_not_present: amounts.cardNotPresent || 0,
        box3_number_of_transactions: amounts.transactionsByMonth.reduce((a, b) => a + b, 0),
        box4_federal_withholding: amounts.federalWithholding || 0,
        box6_state_tax_withheld: amounts.stateWithholding || 0,
        ...amounts.transactionsByMonth.reduce((acc, val, idx) => {
          acc[`box5${String.fromCharCode(97 + idx)}_month_${idx + 1}`] = val;
          return acc;
        }, {} as Record<string, number>),
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.taxForms.set(form.id, form);
    logger.info(`Generated 1099-K form ${form.id} for tax year ${taxYear}`);
    return form;
  }

  getTaxForm(formId: string): GeneratedTaxForm | undefined {
    return this.taxForms.get(formId);
  }

  getTaxFormsByUser(userId: string): GeneratedTaxForm[] {
    return Array.from(this.taxForms.values()).filter(form => form.userId === userId);
  }

  getTaxFormsByYear(userId: string, taxYear: number): GeneratedTaxForm[] {
    return Array.from(this.taxForms.values()).filter(
      form => form.userId === userId && form.taxYear === taxYear
    );
  }

  signTaxForm(formId: string, signatureHash: string): GeneratedTaxForm {
    const form = this.taxForms.get(formId);
    if (!form) {
      throw new Error('Tax form not found');
    }

    form.status = 'signed';
    form.signatureDate = new Date();
    form.signatureHash = signatureHash;
    form.updatedAt = new Date();

    this.taxForms.set(formId, form);
    logger.info(`Tax form ${formId} signed`);
    return form;
  }

  generateTaxSummary(userId: string, taxYear: number, earnings: Array<{
    source: string;
    description: string;
    grossAmount: number;
    fees: number;
    withholding: number;
  }>): TaxSummary {
    const forms = this.getTaxFormsByYear(userId, taxYear);

    const bySource = earnings.map(e => ({
      ...e,
      netAmount: e.grossAmount - e.fees - e.withholding,
    }));

    const totalEarnings = bySource.reduce((sum, e) => sum + e.grossAmount, 0);
    const totalWithholding = bySource.reduce((sum, e) => sum + e.withholding, 0);
    const platformFees = bySource.reduce((sum, e) => sum + e.fees, 0);
    const netEarnings = bySource.reduce((sum, e) => sum + e.netAmount, 0);

    return {
      userId,
      taxYear,
      totalEarnings,
      totalWithholding,
      platformFees,
      netEarnings,
      bySource,
      forms,
    };
  }

  generateW9PDF(formId: string): Buffer {
    const form = this.taxForms.get(formId);
    if (!form || form.formType !== 'W-9') {
      throw new Error('W-9 form not found');
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    let y = margin;

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Form W-9', margin, y);
    doc.setFontSize(10);
    doc.text('(Rev. October 2018)', margin + 35, y);
    y += 6;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Department of the Treasury', margin, y);
    y += 4;
    doc.text('Internal Revenue Service', margin, y);
    y += 8;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Request for Taxpayer Identification Number and Certification', pageWidth / 2, y, { align: 'center' });
    y += 10;

    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    const info = form.taxpayerInfo;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('1  Name (as shown on your income tax return)', margin, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.text(info.name || '', margin, y);
    y += 10;

    doc.setFont('helvetica', 'bold');
    doc.text('2  Business name/disregarded entity name, if different from above', margin, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.text(info.businessName || '', margin, y);
    y += 10;

    doc.setFont('helvetica', 'bold');
    doc.text('3  Check appropriate box for federal tax classification:', margin, y);
    y += 6;

    const classifications = [
      { value: 'individual', label: 'Individual/sole proprietor or single-member LLC' },
      { value: 'c_corp', label: 'C Corporation' },
      { value: 's_corp', label: 'S Corporation' },
      { value: 'partnership', label: 'Partnership' },
      { value: 'trust', label: 'Trust/estate' },
      { value: 'llc', label: 'Limited liability company' },
      { value: 'other', label: 'Other' },
    ];

    doc.setFont('helvetica', 'normal');
    for (const cls of classifications) {
      const isChecked = info.taxClassification === cls.value;
      doc.rect(margin, y - 3, 4, 4);
      if (isChecked) {
        doc.text('X', margin + 0.8, y);
      }
      doc.text(cls.label, margin + 8, y);
      y += 6;
    }
    y += 5;

    doc.setFont('helvetica', 'bold');
    doc.text('5  Address (number, street, and apt. or suite no.)', margin, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.text(info.address?.street || '', margin, y);
    y += 10;

    doc.setFont('helvetica', 'bold');
    doc.text('6  City, state, and ZIP code', margin, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    const cityStateZip = `${info.address?.city || ''}, ${info.address?.state || ''} ${info.address?.postalCode || ''}`;
    doc.text(cityStateZip, margin, y);
    y += 15;

    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    doc.setFont('helvetica', 'bold');
    doc.text('Part I  Taxpayer Identification Number (TIN)', margin, y);
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.text(`Social security number: ${info.tinType === 'ssn' ? this.maskTIN(info.tin || '') : '___-__-____'}`, margin, y);
    y += 6;
    doc.text(`Employer identification number: ${info.tinType === 'ein' ? this.maskTIN(info.tin || '') : '__-_______'}`, margin, y);
    y += 15;

    doc.setFont('helvetica', 'bold');
    doc.text('Part II  Certification', margin, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const certText = `Under penalties of perjury, I certify that:
1. The number shown on this form is my correct taxpayer identification number, and
2. I am not subject to backup withholding, and
3. I am a U.S. citizen or other U.S. person, and
4. The FATCA code(s) entered on this form (if any) indicating that I am exempt from FATCA reporting is correct.`;
    
    const certLines = doc.splitTextToSize(certText, pageWidth - margin * 2);
    doc.text(certLines, margin, y);
    y += certLines.length * 4 + 15;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Sign Here', margin, y);
    y += 8;

    doc.line(margin, y + 5, margin + 80, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.text('Signature of U.S. person', margin, y + 10);

    doc.line(margin + 100, y + 5, margin + 150, y + 5);
    doc.text('Date', margin + 100, y + 10);

    if (form.signatureDate) {
      doc.text(new Date(form.signatureDate).toLocaleDateString(), margin + 100, y + 3);
    }

    doc.setFontSize(8);
    doc.text(`Form ID: ${form.id}`, margin, doc.internal.pageSize.getHeight() - 10);
    doc.text(`Generated: ${new Date().toISOString()}`, pageWidth - margin - 50, doc.internal.pageSize.getHeight() - 10);

    return Buffer.from(doc.output('arraybuffer'));
  }

  generateW8BENPDF(formId: string): Buffer {
    const form = this.taxForms.get(formId);
    if (!form || form.formType !== 'W-8BEN') {
      throw new Error('W-8BEN form not found');
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    let y = margin;

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Form W-8BEN', margin, y);
    doc.setFontSize(10);
    doc.text('(Rev. October 2021)', margin + 45, y);
    y += 6;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Department of the Treasury', margin, y);
    y += 4;
    doc.text('Internal Revenue Service', margin, y);
    y += 8;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Certificate of Foreign Status of Beneficial Owner for United States', pageWidth / 2, y, { align: 'center' });
    y += 5;
    doc.text('Tax Withholding and Reporting (Individuals)', pageWidth / 2, y, { align: 'center' });
    y += 10;

    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    const info = form.taxpayerInfo;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Part I  Identification of Beneficial Owner', margin, y);
    y += 8;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('1  Name of individual who is the beneficial owner', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.text(info.name || '', margin, y);
    y += 8;

    doc.setFont('helvetica', 'bold');
    doc.text('2  Country of citizenship', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.text(info.countryOfCitizenship || '', margin, y);
    y += 8;

    doc.setFont('helvetica', 'bold');
    doc.text('3  Permanent residence address', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.text(info.address?.street || '', margin, y);
    y += 5;
    doc.text(`${info.address?.city || ''}, ${info.address?.state || ''} ${info.address?.postalCode || ''}, ${info.address?.country || ''}`, margin, y);
    y += 8;

    doc.setFont('helvetica', 'bold');
    doc.text('6  Foreign tax identifying number (or SSN/ITIN for US)', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.text(this.maskTIN(info.tin || ''), margin, y);
    y += 8;

    if (info.dateOfBirth) {
      doc.setFont('helvetica', 'bold');
      doc.text('8  Date of birth', margin, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.text(new Date(info.dateOfBirth).toLocaleDateString(), margin, y);
      y += 8;
    }

    y += 5;
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    doc.setFont('helvetica', 'bold');
    doc.text('Part II  Claim of Tax Treaty Benefits', margin, y);
    y += 8;

    if (info.claimTreatyBenefits && info.treatyCountry) {
      doc.setFont('helvetica', 'normal');
      doc.text(`9  I certify that the beneficial owner is a resident of ${info.treatyCountry}`, margin, y);
      y += 5;
      doc.text(`   within the meaning of the income tax treaty between the United States and that country.`, margin, y);
      y += 8;

      if (info.treatyArticle && info.treatyRate !== undefined) {
        doc.text(`10 Special rates and conditions: Article ${info.treatyArticle}, ${info.treatyRate}% rate`, margin, y);
        y += 8;
      }
    }

    y += 5;
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    doc.setFont('helvetica', 'bold');
    doc.text('Part III  Certification', margin, y);
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const certText = `Under penalties of perjury, I declare that I have examined the information on this form and to the best of my knowledge and belief it is true, correct, and complete. I further certify under penalties of perjury that:
• I am the individual that is the beneficial owner (or am authorized to sign for the individual that is the beneficial owner) of all the income to which this form relates
• The person named on line 1 of this form is not a U.S. person
• The income to which this form relates is not effectively connected with the conduct of a trade or business in the United States`;
    
    const certLines = doc.splitTextToSize(certText, pageWidth - margin * 2);
    doc.text(certLines, margin, y);
    y += certLines.length * 4 + 15;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Sign Here', margin, y);
    y += 10;

    doc.line(margin, y, margin + 80, y);
    doc.setFont('helvetica', 'normal');
    doc.text('Signature of beneficial owner', margin, y + 5);

    doc.line(margin + 100, y, margin + 150, y);
    doc.text('Date', margin + 100, y + 5);

    if (form.signatureDate) {
      doc.text(new Date(form.signatureDate).toLocaleDateString(), margin + 100, y - 3);
    }

    doc.setFontSize(8);
    doc.text(`Form ID: ${form.id}`, margin, doc.internal.pageSize.getHeight() - 10);

    return Buffer.from(doc.output('arraybuffer'));
  }

  generate1099PDF(formId: string): Buffer {
    const form = this.taxForms.get(formId);
    if (!form || (!form.formType.startsWith('1099'))) {
      throw new Error('1099 form not found');
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    let y = margin;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Form ${form.formType}`, margin, y);
    doc.setFontSize(10);
    doc.text(`Tax Year ${form.taxYear}`, pageWidth - margin - 30, y);
    y += 8;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Copy B - For Recipient', margin, y);
    y += 10;

    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    const payerInfo = form.taxpayerInfo;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text("PAYER'S name, street address, city, state, and ZIP code", margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.text(payerInfo.name || '', margin, y);
    y += 4;
    if (payerInfo.address) {
      doc.text(payerInfo.address.street || '', margin, y);
      y += 4;
      doc.text(`${payerInfo.address.city || ''}, ${payerInfo.address.state || ''} ${payerInfo.address.postalCode || ''}`, margin, y);
    }
    y += 8;

    doc.setFont('helvetica', 'bold');
    doc.text("PAYER'S TIN", margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.text(this.maskTIN(payerInfo.tin || ''), margin, y);
    y += 10;

    const recipientInfo = form.recipientInfo;
    doc.setFont('helvetica', 'bold');
    doc.text("RECIPIENT'S name", margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.text(recipientInfo?.name || '', margin, y);
    y += 8;

    doc.setFont('helvetica', 'bold');
    doc.text("RECIPIENT'S TIN", margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.text(this.maskTIN(recipientInfo?.tin || ''), margin, y);
    y += 8;

    doc.setFont('helvetica', 'bold');
    doc.text("RECIPIENT'S address", margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    if (recipientInfo?.address) {
      doc.text(recipientInfo.address.street || '', margin, y);
      y += 4;
      doc.text(`${recipientInfo.address.city || ''}, ${recipientInfo.address.state || ''} ${recipientInfo.address.postalCode || ''}`, margin, y);
    }
    y += 15;

    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    doc.setFont('helvetica', 'bold');
    doc.text('AMOUNTS REPORTED', margin, y);
    y += 8;

    const amounts = form.amounts || {};
    const amountEntries = Object.entries(amounts).filter(([_, v]) => v > 0);

    for (const [key, value] of amountEntries) {
      const label = key.replace(/_/g, ' ').replace(/box\d+\s?/, 'Box ');
      doc.setFont('helvetica', 'normal');
      doc.text(`${label}:`, margin, y);
      doc.text(`$${(value as number).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, margin + 80, y);
      y += 6;
    }

    doc.setFontSize(8);
    doc.text(`Form ID: ${form.id}`, margin, doc.internal.pageSize.getHeight() - 10);
    doc.text(`Generated: ${new Date().toISOString()}`, pageWidth - margin - 50, doc.internal.pageSize.getHeight() - 10);

    return Buffer.from(doc.output('arraybuffer'));
  }

  generateTaxSummaryPDF(summary: TaxSummary): Buffer {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    let y = margin;

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(`Tax Summary Report - ${summary.taxYear}`, pageWidth / 2, y, { align: 'center' });
    y += 15;

    doc.setFontSize(12);
    doc.text('Earnings Overview', margin, y);
    y += 10;

    const formatCurrency = (val: number) => `$${val.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    const summaryData = [
      ['Total Gross Earnings', formatCurrency(summary.totalEarnings)],
      ['Platform Fees', `(${formatCurrency(summary.platformFees)})`],
      ['Tax Withholding', `(${formatCurrency(summary.totalWithholding)})`],
      ['Net Earnings', formatCurrency(summary.netEarnings)],
    ];

    (doc as any).autoTable({
      startY: y,
      body: summaryData,
      theme: 'plain',
      styles: { fontSize: 10 },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 50, halign: 'right', fontStyle: 'bold' },
      },
    });

    y = (doc as any).lastAutoTable.finalY + 15;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Earnings by Source', margin, y);
    y += 10;

    const sourceData = summary.bySource.map(s => [
      s.source,
      s.description,
      formatCurrency(s.grossAmount),
      formatCurrency(s.fees),
      formatCurrency(s.withholding),
      formatCurrency(s.netAmount),
    ]);

    (doc as any).autoTable({
      startY: y,
      head: [['Source', 'Description', 'Gross', 'Fees', 'Withholding', 'Net']],
      body: sourceData,
      theme: 'striped',
      headStyles: { fillColor: [66, 66, 66] },
      styles: { fontSize: 8 },
      columnStyles: {
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
      },
    });

    y = (doc as any).lastAutoTable.finalY + 15;

    if (summary.forms.length > 0) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Tax Forms on File', margin, y);
      y += 10;

      const formData = summary.forms.map(f => [
        f.formType,
        f.status,
        f.signatureDate ? new Date(f.signatureDate).toLocaleDateString() : 'Not signed',
      ]);

      (doc as any).autoTable({
        startY: y,
        head: [['Form Type', 'Status', 'Signed Date']],
        body: formData,
        theme: 'striped',
        headStyles: { fillColor: [66, 66, 66] },
        styles: { fontSize: 9 },
      });
    }

    doc.setFontSize(8);
    doc.text(`Generated: ${new Date().toISOString()}`, margin, doc.internal.pageSize.getHeight() - 10);

    return Buffer.from(doc.output('arraybuffer'));
  }

  private maskTIN(tin: string): string {
    if (!tin || tin.length < 4) return tin;
    return 'XXX-XX-' + tin.slice(-4);
  }

  getAvailableForms(): Array<{ type: TaxFormType; name: string; description: string; requiredFor: string }> {
    return [
      {
        type: 'W-9',
        name: 'Request for Taxpayer Identification Number',
        description: 'Required for US persons to avoid backup withholding',
        requiredFor: 'US citizens and residents',
      },
      {
        type: 'W-8BEN',
        name: 'Certificate of Foreign Status (Individuals)',
        description: 'Claim foreign status and treaty benefits to reduce withholding',
        requiredFor: 'Non-US individuals',
      },
      {
        type: 'W-8BEN-E',
        name: 'Certificate of Foreign Status (Entities)',
        description: 'For foreign entities to claim reduced withholding',
        requiredFor: 'Non-US entities and businesses',
      },
      {
        type: '1099-NEC',
        name: 'Nonemployee Compensation',
        description: 'Reports payments of $600 or more to non-employees',
        requiredFor: 'Payers reporting contractor payments',
      },
      {
        type: '1099-MISC',
        name: 'Miscellaneous Income',
        description: 'Reports royalties, rents, and other miscellaneous income',
        requiredFor: 'Payers reporting royalties and misc income',
      },
      {
        type: '1099-K',
        name: 'Payment Card and Third Party Network Transactions',
        description: 'Reports payment card/third party network transactions',
        requiredFor: 'Payment processors and marketplaces',
      },
    ];
  }
}

export const taxFormService = new TaxFormService();
