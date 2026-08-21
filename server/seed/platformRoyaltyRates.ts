/**
 * Seed data for platform_royalty_rates — real, publicly-reported per-stream
 * payout averages for major DSPs. These are admin-editable after seeding
 * (see /api/admin/financial-config/royalty-rates), so this file establishes
 * a real starting point rather than leaving the table empty and forcing
 * royaltyEngine to silently fall back to its hardcoded default constants.
 *
 * Rates are blended (ad-supported + premium) average per-stream USD payouts
 * as commonly reported by DSP transparency reports, distributor rate cards
 * (DistroKid/CD Baby/TuneCore published averages), and industry trackers
 * (e.g. Duetti/Soundcharts/Ditto royalty calculators) circa 2024-2025.
 * They are estimates by nature — actual per-stream rates vary by user's
 * subscription tier, territory, and label deal — hence the admin UI to
 * correct them as better data becomes available.
 */
export const PLATFORM_ROYALTY_RATES: Array<{
  platform: string;
  displayName: string;
  baseRatePerStream: number;
  premiumMultiplier: number;
  notes: string;
}> = [
  {
    platform: "spotify",
    displayName: "Spotify",
    baseRatePerStream: 0.004,
    premiumMultiplier: 1.4,
    notes:
      "Blended ad-supported + premium average per-stream payout; premium subscribers pay out roughly 1.3-1.5x the ad-supported rate.",
  },
  {
    platform: "apple_music",
    displayName: "Apple Music",
    baseRatePerStream: 0.01,
    premiumMultiplier: 1.0,
    notes: "Subscription-only catalog; historically the highest major-DSP per-stream rate.",
  },
  {
    platform: "amazon_music",
    displayName: "Amazon Music",
    baseRatePerStream: 0.004,
    premiumMultiplier: 1.2,
    notes: "Blended Amazon Music Unlimited + Prime Music average.",
  },
  {
    platform: "youtube_music",
    displayName: "YouTube Music",
    baseRatePerStream: 0.002,
    premiumMultiplier: 2.0,
    notes: "Ad-supported YouTube streams pay far less than YouTube Music Premium/subscription streams.",
  },
  {
    platform: "tidal",
    displayName: "TIDAL",
    baseRatePerStream: 0.0125,
    premiumMultiplier: 1.0,
    notes: "Subscription-only, historically among the highest payouts of major DSPs.",
  },
  {
    platform: "deezer",
    displayName: "Deezer",
    baseRatePerStream: 0.0064,
    premiumMultiplier: 1.1,
    notes: "Blended average across Deezer's free and premium tiers.",
  },
  {
    platform: "soundcloud",
    displayName: "SoundCloud",
    baseRatePerStream: 0.0025,
    premiumMultiplier: 1.3,
    notes: "SoundCloud Premier/monetization program average; varies by fan-powered vs ad-supported plays.",
  },
  {
    platform: "pandora",
    displayName: "Pandora",
    baseRatePerStream: 0.0013,
    premiumMultiplier: 1.5,
    notes: "Ad-supported internet radio rate; Pandora Premium streams pay meaningfully more.",
  },
  {
    platform: "tiktok",
    displayName: "TikTok",
    baseRatePerStream: 0.0004,
    premiumMultiplier: 1.0,
    notes: "Sync/usage-based payout per video-with-sound play, not a traditional on-demand stream.",
  },
  {
    platform: "iheartradio",
    displayName: "iHeartRadio",
    baseRatePerStream: 0.0006,
    premiumMultiplier: 1.0,
    notes: "Ad-supported digital radio rate.",
  },
];

export async function seedPlatformRoyaltyRates() {
  const { db } = await import("../db.js");
  const { platformRoyaltyRates } = await import("../../shared/schema.js");
  const { sql } = await import("drizzle-orm");
  const { logger } = await import("../logger.js");

  logger.info("🌱 Seeding platform royalty rates...");

  try {
    await db
      .insert(platformRoyaltyRates)
      .values(
        PLATFORM_ROYALTY_RATES.map((r) => ({
          platform: r.platform,
          displayName: r.displayName,
          baseRatePerStream: r.baseRatePerStream,
          premiumMultiplier: r.premiumMultiplier,
          notes: r.notes,
        })),
      )
      .onConflictDoNothing({ target: platformRoyaltyRates.platform });

    logger.info(
      `✅ Platform royalty rate seeding complete! ${PLATFORM_ROYALTY_RATES.length} platforms available (existing admin-edited rows left untouched).`,
    );
  } catch (error: unknown) {
    logger.warn({ err: error }, "❌ Error seeding platform royalty rates:");
    throw error;
  }
}
