import { storage } from "../storage";
import { stripeService } from "./stripeService";
import { logger } from "../logger.js";

export class BeatService {
  async purchaseBeat(
    beatId: string,
    buyerId: string,
    licenseType: "standard" | "exclusive",
  ) {
    try {
      const beat = await (storage as any)?.getBeat(beatId);
      if (!beat) {
        throw new Error("Beat not found");
      }
      const sellerId = beat?.userId;
      if (typeof sellerId !== "string" || !sellerId) {
        throw new Error("Beat seller could not be verified");
      }

      if (licenseType === "exclusive" && beat?.isExclusiveSold) {
        throw new Error("Exclusive license already sold");
      }

      const price =
        licenseType === "standard" ? beat?.standardPrice : beat?.exclusivePrice;
      if (!price) {
        throw new Error("License not available");
      }

      // Create Stripe payment intent
      const paymentIntent = await stripeService?.createBeatPurchaseIntent(
        beatId,
        buyerId,
        licenseType,
        Number(price),
        sellerId,
      );

      return {
        success: true,
        paymentIntent: paymentIntent.client_secret,
        licenseType,
        price,
      };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Beat purchase error:");
      throw error;
    }
  }

  async completeBeatPurchase(
    paymentIntentId: string,
    beatId: string,
    buyerId: string,
    sellerId: string,
    licenseType: "standard" | "exclusive",
    price: number,
  ) {
    try {
      if (!paymentIntentId || !Number.isFinite(price) || price <= 0) {
        throw new Error("A valid paid beat purchase is required");
      }
      const beat = await (storage as any)?.getBeat(beatId);
      if (!beat) {
        throw new Error("Beat not found");
      }
      if (beat.userId !== sellerId) {
        throw new Error("Seller does not own this beat");
      }
      if (licenseType === "exclusive" && beat.isExclusiveSold) {
        throw new Error("Exclusive license already sold");
      }
      const amountCents = Math.round(price * 100);
      if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
        throw new Error("Beat purchase amount is invalid");
      }
      const verified = await stripeService.verifyBeatPurchaseIntent({
        paymentIntentId,
        beatId,
        buyerId,
        sellerId,
        licenseType,
        amountCents,
      });

      // Fulfillment is allowed only after Stripe confirms the exact purchase.
      const sale = await (storage as any)?.createBeatSale({
        beatId,
        buyerId,
        sellerId,
        licenseType,
        price: (verified.amountCents / 100).toFixed(2),
        stripePaymentIntentId: paymentIntentId,
      });
      if (!sale) {
        throw new Error("Paid beat sale could not be durably recorded");
      }

      // If exclusive license, mark beat as sold
      if (licenseType === "exclusive") {
        await (storage as any)?.updateBeat(beatId, { isExclusiveSold: true });
      }

      // Generate license agreement
      const licenseAgreement = await this.generateLicenseAgreement(
        sale,
        licenseType,
      );

      return {
        success: true,
        sale,
        licenseAgreement,
      };
    } catch (error: unknown) {
      logger.warn({ err: error }, "Beat purchase completion error:");
      throw error;
    }
  }

  private async generateLicenseAgreement(
    sale: unknown,
    licenseType: "standard" | "exclusive",
  ) {
    // Generate legal license agreement based on license type
    const terms =
      licenseType === "standard"
        ? {
            commercialUse: true,
            creditRequired: true,
            exclusivity: false,
            copyrightRetention: "producer",
          }
        : {
            commercialUse: true,
            creditRequired: false,
            exclusivity: true,
            copyrightRetention: "buyer",
          };

    return {
      id: `license_${(sale as any)?.id}`,
      terms,
      generatedAt: new Date(),
    };
  }

  async getBeatAnalytics(beatId: string, userId: string) {
    try {
      const analytics = await (storage as any)?.getBeatAnalytics(beatId, userId);
      return analytics;
    } catch (error: unknown) {
      logger.warn({ err: error }, "Beat analytics error:");
      throw new Error("Failed to fetch beat analytics");
    }
  }
}

export const beatService = new BeatService();
