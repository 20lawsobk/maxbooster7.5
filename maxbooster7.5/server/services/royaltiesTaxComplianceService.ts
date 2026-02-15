import { storage } from '../storage.js';

const TAX_THRESHOLD = 600;

export class RoyaltiesTaxComplianceService {
  async aggregateAnnualEarnings(userId: string, year: number) {
    const collaborators = await storage.getCollaboratorsForTaxYear(year);
    return collaborators.find((c) => c.userId === userId);
  }

  async generate1099MISC(userId: string, year: number) {
    const earnings = await this.aggregateAnnualEarnings(userId, year);

    if (!earnings || earnings.totalEarnings < TAX_THRESHOLD) {
      return { eligible: false, reason: `Earnings below $${TAX_THRESHOLD} threshold` };
    }

    const taxProfile = await storage.getTaxProfile(userId);

    if (!taxProfile || !taxProfile.w9OnFile) {
      return { eligible: false, reason: 'W9 form not on file' };
    }

    return {
      eligible: true,
      taxYear: year,
      payer: {
        name: 'Max Booster Music LLC',
        ein: '00-0000000',
        address: '123 Music Lane, Nashville, TN 37201',
      },
      recipient: {
        name: taxProfile.legalName,
        taxId: taxProfile.taxId,
        taxIdType: taxProfile.taxIdType,
        address: `${taxProfile.address}, ${taxProfile.city}, ${taxProfile.state} ${taxProfile.zipCode}`,
      },
      amounts: {
        box1_rents: 0,
        box2_royalties: earnings.totalEarnings,
        box3_otherIncome: 0,
      },
      generatedAt: new Date(),
    };
  }

  async validateTaxProfile(userId: string): Promise<{ valid: boolean; errors: string[] }> {
    const profile = await storage.getTaxProfile(userId);
    const errors: string[] = [];

    if (!profile) {
      errors.push('Tax profile not found');
      return { valid: false, errors };
    }

    if (!profile.w9OnFile) errors.push('W9 form not on file');
    if (!profile.taxId) errors.push('Tax ID missing');
    if (!profile.legalName) errors.push('Legal name missing');
    if (!profile.address) errors.push('Address missing');

    return { valid: errors.length === 0, errors };
  }

  async exportTaxDocument(userId: string, year: number) {
    const doc = await this.generate1099MISC(userId, year);

    return {
      format: 'json',
      data: doc,
      filename: `1099-MISC-${year}-${userId}.json`,
    };
  }
}

export const royaltiesTaxComplianceService = new RoyaltiesTaxComplianceService();
