import { storage } from '../storage';
import { stripeService } from './stripeService';
import { logger } from '../logger.js';

export class BeatService {
  async purchaseBeat(beatId: string, buyerId: string, licenseType: 'standard' | 'exclusive') {
    try {
      const beat = await storage.getBeat(beatId);
      if (!beat) {
        throw new Error('Beat not found');
      }

      if (licenseType === 'exclusive' && beat.isExclusiveSold) {
        throw new Error('Exclusive license already sold');
      }

      const price = licenseType === 'standard' ? beat.standardPrice : beat.exclusivePrice;
      if (!price) {
        throw new Error('License not available');
      }

      // Create Stripe payment intent
      const paymentIntent = await stripeService.createBeatPurchaseIntent(
        beatId,
        buyerId,
        licenseType,
        Number(price)
      );

      return {
        success: true,
        paymentIntent: paymentIntent.client_secret,
        licenseType,
        price,
      };
    } catch (error: unknown) {
      logger.error('Beat purchase error:', error);
      throw error;
    }
  }

  async completeBeatPurchase(
    paymentIntentId: string,
    beatId: string,
    buyerId: string,
    sellerId: string,
    licenseType: 'standard' | 'exclusive',
    price: number
  ) {
    try {
      // Create sale record
      const sale = await storage.createBeatSale({
        beatId,
        buyerId,
        sellerId,
        licenseType,
        price: price.toString(),
        stripePaymentIntentId: paymentIntentId,
      });

      // If exclusive license, mark beat as sold
      if (licenseType === 'exclusive') {
        await storage.updateBeat(beatId, { isExclusiveSold: true });
      }

      // Generate license agreement
      const licenseAgreement = await this.generateLicenseAgreement(sale, licenseType);

      return {
        success: true,
        sale,
        licenseAgreement,
      };
    } catch (error: unknown) {
      logger.error('Beat purchase completion error:', error);
      throw error;
    }
  }

  private async generateLicenseAgreement(sale: unknown, licenseType: 'standard' | 'exclusive') {
    // Generate legal license agreement based on license type
    const terms =
      licenseType === 'standard'
        ? {
            commercialUse: true,
            creditRequired: true,
            exclusivity: false,
            copyrightRetention: 'producer',
          }
        : {
            commercialUse: true,
            creditRequired: false,
            exclusivity: true,
            copyrightRetention: 'buyer',
          };

    return {
      id: `license_${sale.id}`,
      terms,
      generatedAt: new Date(),
    };
  }

  async getBeatAnalytics(beatId: string, userId: string) {
    try {
      const analytics = await storage.getBeatAnalytics(beatId, userId);
      return analytics;
    } catch (error: unknown) {
      logger.error('Beat analytics error:', error);
      throw new Error('Failed to fetch beat analytics');
    }
  }
}

export const beatService = new BeatService();
