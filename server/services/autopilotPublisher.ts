import cron from 'node-cron';
import { eq, and, desc, isNotNull } from 'drizzle-orm';
import { db } from '../db.js';
import { storefronts, listings, listingLicenseTiers } from '../../shared/schema.js';
import { storage } from '../storage.js';
import { logger } from '../logger.js';
import { storefrontService } from './storefrontService.js';
import { aiModelManager } from './aiModelManager.js';
import { autoPostingServiceV2 } from './autoPostingServiceV2.js';
import type { PostContent } from './autoPostingServiceV2.js';
import { aiContentService } from './aiContentService.js';
import { advancedSocialAIService } from './advancedSocialAIService.js';
import { contentQualityGate } from './contentQualityGate.js';

/**
 * Automated Autopilot Publisher
 * 
 * Runs scheduled jobs to automatically generate and publish content for users
 * with autopilot enabled and autoPublish=true.
 * 
 * Features:
 * - Social Media Auto-Publishing: Generates and posts social media content
 * - Advertising Auto-Publishing: Creates and launches ad campaigns
 * - Multimodal Analysis Integration: Uses analyzed content features for better predictions
 * - Confidence-based Publishing: Only publishes when confidence exceeds user threshold
 * - Scheduled Execution: Runs every 15 minutes to check for autopilot tasks
 */

interface AutoPublishResult {
  userId: string;
  socialPosts: number;
  adCampaigns: number;
  errors: string[];
}

class AutopilotPublisher {
  private isRunning: boolean = false;
  private lastRun: Date | null = null;
  private cronJob: cron.ScheduledTask | null = null;
  // Tracks the last time we successfully initiated a publish attempt per user
  // so shouldPostNow can enforce frequency limits without a DB query.
  // Resets on server restart (acceptable — first cycle after restart triggers promptly
  // and then enforces frequency from that point forward).
  private lastPublishAttempt: Map<string, Date> = new Map();

  // Max entries kept in memory. Entries are evicted by the cleanup interval
  // before this limit is reached under normal load.
  private static readonly MAX_TRACKED_USERS = 50_000;

  // Longest publish frequency is weekly (7 days). Keep entries for 8 days
  // then evict — they no longer affect frequency-gate logic.
  private static readonly ATTEMPT_TTL_MS = 8 * 24 * 60 * 60 * 1000;

  constructor() {
    this.startScheduler();
    this.startAttemptMapCleanup();
  }

  private startAttemptMapCleanup(): void {
    // Run every 6 hours; each pass is O(n) over active users — fast.
    setInterval(() => {
      const cutoff = Date.now() - AutopilotPublisher.ATTEMPT_TTL_MS;
      for (const [userId, lastAttempt] of this.lastPublishAttempt) {
        if (lastAttempt.getTime() < cutoff) {
          this.lastPublishAttempt.delete(userId);
        }
      }
      // Safety valve: if the map is still over cap after TTL eviction (e.g. a
      // burst of new users), drop the oldest entries until we're back under cap.
      if (this.lastPublishAttempt.size > AutopilotPublisher.MAX_TRACKED_USERS) {
        const overflow = this.lastPublishAttempt.size - AutopilotPublisher.MAX_TRACKED_USERS;
        let evicted = 0;
        for (const key of this.lastPublishAttempt.keys()) {
          if (evicted >= overflow) break;
          this.lastPublishAttempt.delete(key);
          evicted++;
        }
      }
    }, 6 * 60 * 60 * 1000);
  }

  private startScheduler(): void {
    this.cronJob = cron.schedule('*/15 * * * *', async () => {
      logger.info('⏰ Autopilot scheduler triggered');
      await this.publishForAllUsers();
    });
    logger.info('✅ Autopilot scheduler started (every 15 minutes)');
  }

  public stopScheduler(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      logger.info('⏹️ Autopilot scheduler stopped');
    }
  }

  /**
   * Main entry point: Run autopilot publishing for all eligible users
   */
  async publishForAllUsers(): Promise<AutoPublishResult[]> {
    if (this.isRunning) {
      logger.warn('Autopilot publisher already running, skipping this cycle');
      return [];
    }

    try {
      this.isRunning = true;
      this.lastRun = new Date();
      logger.info('🚀 Starting automated autopilot publishing cycle');

      // Get all users with autopilot enabled
      const enabledConfigs = await storage.getAllEnabledAutopilotConfigs();
      
      if (enabledConfigs.length === 0) {
        logger.info('No users with autopilot enabled');
        return [];
      }

      logger.info(`Found ${enabledConfigs.length} users with autopilot enabled`);

      // Process each user in parallel (but limit concurrency to avoid overload)
      const results: AutoPublishResult[] = [];
      const batchSize = 5; // Process 5 users at a time
      
      for (let i = 0; i < enabledConfigs.length; i += batchSize) {
        const batch = enabledConfigs.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(config => this.publishForUser(config))
        );
        results.push(...batchResults);
      }

      const totalPosts = results.reduce((sum, r) => sum + r.socialPosts, 0);
      const totalCampaigns = results.reduce((sum, r) => sum + r.adCampaigns, 0);
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

      logger.info(`✅ Autopilot publishing cycle completed:`);
      logger.info(`   - Social posts published: ${totalPosts}`);
      logger.info(`   - Ad campaigns created: ${totalCampaigns}`);
      logger.info(`   - Errors: ${totalErrors}`);

      return results;
    } catch (error) {
      logger.warn({ err: error }, 'Error in autopilot publishing cycle:');
      return [];
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Publish content for a single user
   */
  private async publishForUser(config: Record<string, unknown>): Promise<AutoPublishResult> {
    const result: AutoPublishResult = {
      userId: config.userId,
      socialPosts: 0,
      adCampaigns: 0,
      errors: [],
    };

    try {
      // Check if auto-publish is enabled for this user
      if (!config.autoPublish) {
        logger.info(`[Autopilot] User ${config.userId}: autoPublish=false — skipping (user must enable auto-publish in settings)`);
        return result;
      }

      // Check posting frequency to determine if we should post now
      // (shouldPostNow logs its own INFO message with next-attempt time)
      if (!this.shouldPostNow(config)) {
        return result;
      }

      logger.info(`📝 Processing autopilot for user ${config.userId}`);

      // Social Media Autopilot - errors propagate upward, not silently logged
      // CRITICAL: Media generation failures must abort scheduling
      if (config.platforms && config.platforms.length > 0) {
        const socialResult = await this.publishSocialContent(config);
        result.socialPosts = socialResult.posts;
        if (socialResult.error) {
          // Non-critical errors (like low confidence) are recorded but not thrown
          if (!socialResult.error.includes('threshold') && 
              !socialResult.error.includes('not trained')) {
            throw new Error(`Social media publishing failed: ${socialResult.error}`);
          }
          result.errors.push(`Social: ${socialResult.error}`);
        }
      }

      // Advertising Autopilot - errors propagate upward, not silently logged
      // CRITICAL: Media generation failures must abort campaign creation
      const adResult = await this.publishAdvertisingCampaigns(config);
      result.adCampaigns = adResult.campaigns;
      if (adResult.error) {
        // Non-critical errors (like low confidence) are recorded but not thrown
        if (!adResult.error.includes('below threshold') && 
            !adResult.error.includes('not trained')) {
          throw new Error(`Advertising campaign creation failed: ${adResult.error}`);
        }
        result.errors.push(`Advertising: ${adResult.error}`);
      }

    } catch (error) {
      result.errors.push(`General: ${error.message}`);
      logger.warn({ err: error }, `Error processing user ${config.userId}:`);
    }

    return result;
  }

  /**
   * Round-robin platform selector — picks the platform with the fewest existing posts
   * so that all enabled platforms get equal coverage over time.
   */
  private async pickNextPlatform(userId: string, platforms: string[]): Promise<string> {
    if (platforms.length === 1) return platforms[0];
    try {
      // Count existing posts per platform for this user
      const existing = await storage.getUserSocialPosts(userId);
      const counts: Record<string, number> = {};
      for (const p of platforms) counts[p] = 0;
      for (const post of (existing || [])) {
        const pl = post.platform;
        if (pl && counts[pl] !== undefined) counts[pl]++;
      }
      // Pick the platform with the fewest posts
      const sorted = platforms.slice().sort((a, b) => counts[a] - counts[b]);
      logger.info(`[Autopilot] Platform rotation counts: ${JSON.stringify(counts)} → picking "${sorted[0]}"`);
      return sorted[0];
    } catch {
      // Fallback: rotate by minute so we spread across platforms even without DB data
      const minuteIndex = Math.floor(Date.now() / 60000) % platforms.length;
      return platforms[minuteIndex];
    }
  }

  /**
   * Fetch live storefront + listing context for a user so both autopilots can
   * generate content that references real beat titles, prices, and promotions
   * instead of generic placeholders.
   */
  private async fetchStorefrontContext(userId: string): Promise<{
    storefrontUrl: string;
    beatContext: string;
    promotionContext: string;
  }> {
    const baseDomain = process.env.BASE_DOMAIN || 'max-booster.com';
    const defaultUrl = `https://${baseDomain}`;

    try {
      // Fetch the user's primary storefront
      const [storefront] = await db
        .select()
        .from(storefronts)
        .where(and(eq(storefronts.userId, userId), eq(storefronts.isActive, true)))
        .orderBy(desc(storefronts.createdAt))
        .limit(1);

      const storefrontUrl = storefront
        ? storefrontService.getStorefrontUrl({
            slug:                storefront.slug,
            subdomain:           storefront.subdomain ?? null,
            customDomain:        storefront.customDomain ?? null,
            isSubdomainActive:   storefront.isSubdomainActive ?? false,
            isCustomDomainActive: storefront.isCustomDomainActive ?? false,
          })
        : defaultUrl;

      // Fetch up to 5 recent published listings for beat context
      const recentListings = await db
        .select({
          id:               listings.id,
          title:            listings.title,
          category:         listings.category,
          priceCents:       listings.priceCents,
          discountPercent:  listings.discountPercent,
          discountPriceCents: listings.discountPriceCents,
          discountExpiresAt:  listings.discountExpiresAt,
          metadata:         listings.metadata,
          previewUrl:       listings.previewUrl,
          artworkUrl:       listings.artworkUrl,
        })
        .from(listings)
        .where(and(eq(listings.userId, userId), eq(listings.isPublished, true)))
        .orderBy(desc(listings.createdAt))
        .limit(5);

      // Build beat context string
      const beatLines = recentListings.map((l) => {
        const meta = (l.metadata as Record<string, unknown> | null) ?? {};
        const genre = (meta.genre as string) || l.category || 'beat';
        const bpm   = meta.bpm ? `${meta.bpm} BPM` : '';
        const key   = meta.key ? `key of ${meta.key}` : '';
        const price = l.priceCents ? `$${(l.priceCents / 100).toFixed(2)}` : '';
        const details = [genre, bpm, key, price].filter(Boolean).join(' · ');
        return `"${l.title}"${details ? ` (${details})` : ''}`;
      });
      const beatContext = beatLines.length > 0
        ? `Latest beats available: ${beatLines.join('; ')}.`
        : '';

      // Build promotion context string — highlight any active discounts or BOGO
      const promoLines: string[] = [];
      for (const l of recentListings) {
        const now = new Date();
        const hasDiscount =
          l.discountPercent && l.discountPercent > 0 &&
          (!l.discountExpiresAt || new Date(l.discountExpiresAt) > now);

        if (hasDiscount) {
          const origPrice = l.priceCents ? `$${(l.priceCents / 100).toFixed(2)}` : '';
          const salePrice = l.discountPriceCents
            ? `$${(l.discountPriceCents / 100).toFixed(2)}`
            : '';
          const expiry = l.discountExpiresAt
            ? ` (expires ${new Date(l.discountExpiresAt).toLocaleDateString()})`
            : '';
          promoLines.push(
            `"${l.title}" is ${l.discountPercent}% off${origPrice ? ` — was ${origPrice}` : ''}${salePrice ? `, now ${salePrice}` : ''}${expiry}`
          );
        }
      }

      // Also check license tier BOGOs
      if (recentListings.length > 0) {
        const listingIds = recentListings.map((l) => l.id);
        const bogoTiers = await db
          .select({ listingId: listingLicenseTiers.listingId, licenseType: listingLicenseTiers.licenseType })
          .from(listingLicenseTiers)
          .where(and(
            eq(listingLicenseTiers.bogoEnabled, true),
            eq(listingLicenseTiers.isActive, true),
          ))
          .limit(5);

        for (const tier of bogoTiers) {
          const listing = recentListings.find((l) => l.id === tier.listingId);
          if (listing) {
            promoLines.push(`Buy one ${tier.licenseType} license for "${listing.title}", get one free`);
          }
        }
      }

      const promotionContext = promoLines.length > 0
        ? `Active promotions: ${promoLines.join('; ')}.`
        : '';

      logger.info(
        `[Autopilot] Storefront context for ${userId}: url=${storefrontUrl} beats=${beatLines.length} promos=${promoLines.length}`
      );

      return { storefrontUrl, beatContext, promotionContext };
    } catch (err) {
      logger.warn({ err }, `[Autopilot] Failed to fetch storefront context for ${userId} — using defaults`);
      return { storefrontUrl: defaultUrl, beatContext: '', promotionContext: '' };
    }
  }

  private async publishSocialContent(config: Record<string, unknown>): Promise<{ posts: number; error?: string }> {
    try {
      const userId = config.userId;
      const platforms: string[] = config.platforms && config.platforms.length > 0
        ? config.platforms
        : ['twitter', 'instagram'];

      // Fetch live storefront + beat data in parallel with platform selection
      const [targetPlatform, sfContext] = await Promise.all([
        this.pickNextPlatform(userId, platforms),
        this.fetchStorefrontContext(userId),
      ]);
      logger.info(`[Autopilot] User ${userId}: targeting platform "${targetPlatform}" this cycle`);

      // Get the user's trained social media AI model
      const socialAI = await aiModelManager.getSocialAutopilot(userId);

      if (!socialAI.getIsTrained()) {
        // Model not trained yet — route through the A/B quality gate (up to 10 rounds × 7
        // variants each) so every post still meets ≥ 90% of Veo quality before scheduling.
        logger.info(`[Autopilot] User ${userId}: model untrained — running A/B quality gate (target: 81/100 = 90% Veo)`);

        // Enrich the quality gate topic with real beat data when available
        const enrichedTopic = sfContext.beatContext
          ? `${config.topic || 'new music'} — ${sfContext.beatContext}`
          : (config.topic || 'new music');

        const gateResult = await contentQualityGate.run(userId, {
          topic: enrichedTopic,
          objective: 'engagement',
          platform: targetPlatform,
          tone: config.brandVoice,
          genre: config.genre,
          targetAudience: config.targetAudience,
        });

        if (!gateResult) {
          logger.info(`[Autopilot] User ${userId}: quality gate rejected all variants — skipping post to protect quality`);
          return { posts: 0, error: 'Content quality gate: all variants below minimum threshold (73). Skipping to protect brand quality.' };
        }

        // Append storefront URL to the gated content so every post links back
        const baseText = gateResult.winner.headline
          ? `${gateResult.winner.headline}\n\n${gateResult.winner.content}`
          : gateResult.winner.content;
        const gatedText = sfContext.storefrontUrl && !baseText.includes(sfContext.storefrontUrl)
          ? `${baseText}\n🔗 ${sfContext.storefrontUrl}`
          : baseText;

        const postContent: PostContent = {
          text: gatedText,
          hashtags: gateResult.winner.hashtags,
          mediaType: 'text',
        };

        const nextOptimalTime = this.calculateNextOptimalPostingTime(
          targetPlatform,
          config.postingFrequency || 'daily'
        );

        const scheduledPost = await autoPostingServiceV2.schedulePost(
          userId,
          [targetPlatform],
          postContent,
          nextOptimalTime,
          'social_autopilot'
        );

        logger.info(
          `✅ User ${userId}: Scheduled quality-gated post ${scheduledPost.id} for "${targetPlatform}" ` +
          `at ${nextOptimalTime.toISOString()} — ` +
          `score=${gateResult.winner.scores.overall.toFixed(1)} (passed round ${gateResult.passedOnAttempt}/${10}, ` +
          `${gateResult.totalVariantsTried} variants tried)`
        );
        return { posts: 1 };
      }

      // Trained model path — MaxCore is the ONLY content source ────────────────
      // Pick content type deterministically, rotating per 15-min window so that
      // back-to-back cycles vary without being random.
      const contentTypes = config.contentTypes || ['tips', 'insights'];
      const ctSeed = `${userId}:${contentTypes.join(',')}:${Math.floor(Date.now() / (15 * 60 * 1000))}`;
      const ctIdx = (() => {
        let h = 2166136261;
        for (let i = 0; i < ctSeed.length; i++) { h ^= ctSeed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
        return h % contentTypes.length;
      })();
      const selectedContentType = contentTypes[ctIdx];

      // Map autopilot content-type labels → AdvancedContentRequest format
      const contentTypeMap: Record<string, 'announcement' | 'behind_scenes' | 'engagement' | 'promotional' | 'storytelling'> = {
        tips:          'behind_scenes',
        insights:      'storytelling',
        questions:     'engagement',
        announcements: 'announcement',
        promotions:    'promotional',
      };
      // Map brand-voice label → valid tone the MaxCore pipeline understands
      const toneMap: Record<string, 'professional' | 'casual' | 'energetic' | 'inspirational' | 'humorous' | 'storytelling'> = {
        professional: 'professional',
        casual:       'casual',
        energetic:    'energetic',
        inspirational:'inspirational',
        humorous:     'humorous',
        storytelling: 'storytelling',
        authentic:    'inspirational',
        bold:         'energetic',
        friendly:     'casual',
      };

      // Build a music-relevant topic, enriched with real beat titles when available
      const genre = config.genre || 'music';
      const topicByContentType: Record<string, string> = {
        tips:          `${genre} music production tips`,
        insights:      `${genre} music industry insights`,
        questions:     `${genre} music fan conversation`,
        announcements: `${genre} music release`,
        promotions:    `${genre} music promotion`,
      };
      const baseTopic = topicByContentType[selectedContentType] || `${genre} music`;

      // For promotions, embed active promo details directly into the topic
      const mcTopic = selectedContentType === 'promotions' && sfContext.promotionContext
        ? `${baseTopic} — ${sfContext.promotionContext}`
        : baseTopic;

      // Generate content through MaxCore via advancedSocialAIService
      const advancedContent = await advancedSocialAIService.generateAdvancedContent({
        userId,
        platforms:         [targetPlatform],
        topic:             mcTopic,
        tone:              toneMap[(config.brandVoice || '').toLowerCase()] || 'energetic',
        genre:             config.genre,
        targetAudience:    config.targetAudience,
        objective:         'engagement',
        contentType:       contentTypeMap[selectedContentType] || 'engagement',
        includeHashtags:   true,
        includeEmojis:     true,
        storefrontUrl:     sfContext.storefrontUrl,
        beatContext:       sfContext.beatContext,
        promotionContext:  sfContext.promotionContext,
      });

      // Normalise score (0-100) to confidence fraction (0-1) for threshold check
      const confidence = advancedContent.scoring.overall / 100;
      const minThreshold = config.minConfidenceThreshold || 0.7;

      if (confidence < minThreshold) {
        logger.info(
          `[Autopilot] User ${userId}: MaxCore content confidence ${confidence.toFixed(2)} ` +
          `below threshold ${minThreshold} — skipping`
        );
        return { posts: 0, error: `Confidence ${confidence.toFixed(2)} below threshold ${minThreshold}` };
      }

      logger.info(
        `[Autopilot] User ${userId}: MaxCore-sourced "${selectedContentType}" content ` +
        `for "${targetPlatform}" — score=${advancedContent.scoring.overall.toFixed(1)} topic="${mcTopic}"`
      );

      // ── Veo Quality Gate — trained model path ────────────────────────────────
      // scoreAndGateExisting() scores the MaxCore-generated text and, if it
      // falls short, runs the full A/B retry loop to find a passing variant.
      const rawText = advancedContent.primary.hook
        ? `${advancedContent.primary.hook}\n\n${advancedContent.primary.body}`
        : advancedContent.primary.body;
      const gateResult = await contentQualityGate.scoreAndGateExisting(
        userId,
        rawText,
        targetPlatform,
        {
          topic:          mcTopic,
          objective:      'engagement',
          tone:           config.brandVoice,
          genre:          config.genre,
          targetAudience: config.targetAudience,
        }
      );

      if (!gateResult) {
        logger.warn(`[Autopilot] User ${userId}: MaxCore content below Veo pressure floor — skipping post to protect quality`);
        return { posts: 0, error: 'Veo quality gate: MaxCore content below minimum floor (73). Skipping to protect brand quality.' };
      }

      const finalText = gateResult.winner.headline
        ? `${gateResult.winner.headline}\n\n${gateResult.winner.content}`
        : gateResult.winner.content || rawText;

      logger.info(
        `[Autopilot] User ${userId}: MaxCore content cleared Veo gate — ` +
        `score=${gateResult.winner.scores.overall.toFixed(1)} threshold=${gateResult.thresholdUsed} ` +
        `variants_tried=${gateResult.totalVariantsTried}`
      );

      // Media type: use MaxCore's recommendation but only if it's a supported format.
      // 'carousel' and 'live' are not real asset formats — fall back to 'text'.
      const mcMediaRec = advancedContent.mediaGuidance?.recommendedType;
      const resolvedMediaType: 'text' | 'image' | 'video' | 'audio' =
        (mcMediaRec === 'image' || mcMediaRec === 'video')
          ? mcMediaRec
          : 'text';

      // Generate actual media asset using in-house AI Content Service
      // CRITICAL: No silent fallbacks - if media generation fails, we must propagate the error
      let mediaUrl: string | undefined;
      if (resolvedMediaType !== 'text') {
        const generatedAsset = await aiContentService.generateContent({
          prompt: finalText,
          platform: targetPlatform as Record<string, unknown>,
          format: resolvedMediaType,
          tone: 'creative',
          length: 'medium',
        });
        if (!generatedAsset.url) {
          throw new Error(`Media generation returned no URL for ${resolvedMediaType}`);
        }
        mediaUrl = generatedAsset.url;
        logger.info(`✅ Generated ${resolvedMediaType} asset for user ${userId}: ${mediaUrl}`);
      }

      // Create post content with MaxCore-sourced, quality-gated text
      const mcHashtags = advancedContent.primary.hashtags || [];
      const postContent: PostContent = {
        text: finalText,
        hashtags: gateResult.winner.hashtags.length > 0
          ? gateResult.winner.hashtags
          : mcHashtags,
        mediaType: mediaUrl ? resolvedMediaType : 'text',
        mediaUrl,
      };

      // Calculate next optimal posting time for this platform
      const nextOptimalTime = this.calculateNextOptimalPostingTime(
        targetPlatform,
        config.postingFrequency || 'daily'
      );

      // Schedule post for optimal time (not immediate)
      const scheduledPost = await autoPostingServiceV2.schedulePost(
        userId,
        [targetPlatform],
        postContent,
        nextOptimalTime,
        'social_autopilot'
      );

      logger.info(
        `✅ User ${userId}: Scheduled MaxCore-sourced post ${scheduledPost.id} for "${targetPlatform}" ` +
        `at ${nextOptimalTime.toISOString()} (confidence: ${confidence.toFixed(2)}, ` +
        `quality: ${gateResult.winner.scores.overall.toFixed(1)})`
      );

      return { posts: 1 };
    } catch (error) {
      logger.warn({ err: error }, 'Error in publishSocialContent:');
      return { posts: 0, error: error.message };
    }
  }

  /**
   * Publish advertising campaigns for a user
   */
  private async publishAdvertisingCampaigns(config: Record<string, unknown>): Promise<{ campaigns: number; error?: string }> {
    try {
      const userId = config.userId;

      // Fetch live storefront + beat data for ad content enrichment
      const sfContext = await this.fetchStorefrontContext(userId);
      
      // Get the user's advertising AI model (works with or without prior campaign training —
      // generateCampaignRecommendations() runs from its internal prediction engine regardless).
      const advertisingAI = await aiModelManager.getAdvertisingAutopilot(userId);
      const isTrained = advertisingAI.getIsTrained();
      logger.info(
        `[Autopilot] User ${userId}: Advertising AI model ${isTrained ? 'trained' : 'using base predictions (no campaigns yet)'}`
      );

      // Get multimodal features if enabled
      let multimodalFeatures = null;
      if (config.useMultimodalAnalysis) {
        const recentAnalysis = await storage.getRecentAnalyzedContent(userId, 1);
        if (recentAnalysis && recentAnalysis.length > 0) {
          multimodalFeatures = recentAnalysis[0].features;
        }
      }

      // Inject storefront context into multimodal features so the ad AI can use it
      const enrichedFeatures = {
        ...(multimodalFeatures || {}),
        storefrontUrl:    sfContext.storefrontUrl,
        beatContext:      sfContext.beatContext      || undefined,
        promotionContext: sfContext.promotionContext || undefined,
      };

      // Generate campaign recommendations
      const objective = 'brand_awareness'; // Could be configurable
      const recommendations = await advertisingAI.generateCampaignRecommendations(
        objective,
        enrichedFeatures
      );

      if (!recommendations || recommendations.length === 0) {
        return { campaigns: 0, error: 'No campaign recommendations generated' };
      }

      // Pick the best recommendation
      const bestCampaign = recommendations.reduce((best: Record<string, unknown>, current: Record<string, unknown>) => {
        return (current.predictedROI || 0) > (best.predictedROI || 0) ? current : best;
      });

      // Check confidence threshold for auto-publish
      const confidence = bestCampaign.confidence || bestCampaign.predictedROI || 0;
      const minThreshold = config.minConfidenceThreshold || 0.7;
      
      if (confidence < minThreshold) {
        logger.info(`User ${userId}: Campaign confidence ${confidence.toFixed(2)} below threshold ${minThreshold}, not creating`);
        return { campaigns: 0, error: `Confidence ${confidence.toFixed(2)} below threshold ${minThreshold}` };
      }

      // Generate actual media asset for advertising campaign using in-house AI Content Service
      // CRITICAL: No silent fallbacks - if media generation fails, we must propagate the error
      let mediaUrl: string | undefined;
      if (bestCampaign.mediaType !== 'text') {
        const generatedAsset = await aiContentService.generateContent({
          prompt: bestCampaign.content,
          platform: bestCampaign.platforms[0] as Record<string, unknown>,
          format: bestCampaign.mediaType,
          tone: 'promotional',
          length: 'medium',
        });
        if (!generatedAsset.url) {
          throw new Error(`Ad media generation returned no URL for ${bestCampaign.mediaType}`);
        }
        mediaUrl = generatedAsset.url;
        logger.info(`✅ Generated ${bestCampaign.mediaType} ad asset for user ${userId}: ${mediaUrl}`);
      }

      // Calculate next optimal posting time for advertising
      const primaryPlatform = bestCampaign.platforms?.[0] || 'facebook';
      const nextOptimalTime = this.calculateNextOptimalPostingTime(
        primaryPlatform,
        config.postingFrequency || 'daily'
      );

      // Append storefront URL + beat/promo context to the ad content body
      let adContent = bestCampaign.content || '';
      if (sfContext.storefrontUrl && !adContent.includes(sfContext.storefrontUrl)) {
        adContent = `${adContent}\n🔗 ${sfContext.storefrontUrl}`.trim();
      }

      // Create campaign via storage with AI-selected media type, timing, and generated assets
      const campaign = await storage.createAdCampaign({
        userId,
        name: bestCampaign.name || `Auto ${bestCampaign.mediaType} Campaign - ${primaryPlatform}`,
        platform: primaryPlatform,
        objective,
        budget: bestCampaign.suggestedBudget || 0,
        spent: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        status: 'scheduled', // Set as scheduled, not active yet
        startDate: nextOptimalTime, // Use optimal time instead of now
        platforms: bestCampaign.platforms || ['facebook', 'instagram'],
        connectedPlatforms: [],
        personalAdNetwork: true,
        useAIAmplification: true,
        targetAudience: bestCampaign.targetAudience || {},
        creativeAssets: bestCampaign.creatives || [],
        landingPageUrl: sfContext.storefrontUrl,
        aiPredictions: {
          viralityScore: confidence,
          expectedReach: bestCampaign.expectedReach || 1000,
          expectedEngagement: bestCampaign.expectedEngagement || 50,
          confidence,
          beatContext:      sfContext.beatContext      || undefined,
          promotionContext: sfContext.promotionContext || undefined,
        },
      });

      logger.info(`✅ User ${userId}: Created ${mediaUrl ? bestCampaign.mediaType : 'text'} ad campaign ${campaign.id} for ${primaryPlatform} at ${nextOptimalTime.toISOString()} (confidence: ${confidence.toFixed(2)}, ROI: ${bestCampaign.predictedROI.toFixed(2)}x)${mediaUrl ? ` with asset: ${mediaUrl}` : ''}`);
      
      return { campaigns: 1 };
    } catch (error) {
      logger.warn({ err: error }, 'Error in publishAdvertisingCampaigns:');
      return { campaigns: 0, error: error.message };
    }
  }

  /**
   * Determine if it's time to generate and schedule content for this user.
   *
   * Strategy: frequency-based interval tracking rather than a narrow time-of-day window.
   * The previous approach (first-15-min of 2-4 hardcoded hours) only fired ~3% of cycles.
   *
   * - We track the last time we ran for each user in `lastPublishAttempt` (in-memory).
   * - If enough time has elapsed for the configured frequency, we return true and
   *   update the tracker; otherwise we log at INFO so operators can see exactly why.
   * - `calculateNextOptimalPostingTime` still places the scheduled post at the best
   *   platform-specific time slot — timing quality is NOT lost, just decoupled from
   *   the "should we generate now" gate.
   */
  private shouldPostNow(config: Record<string, unknown>): boolean {
    const frequency = config.postingFrequency || 'daily';
    const userId = config.userId;
    const now = new Date();

    // Minimum elapsed time between scheduling attempts per frequency
    const intervalMs: Record<string, number> = {
      'hourly':      1  * 60 * 60 * 1000,   // 1 hour
      'twice-daily': 12 * 60 * 60 * 1000,   // 12 hours
      'daily':       24 * 60 * 60 * 1000,   // 24 hours
      'weekly':       7 * 24 * 60 * 60 * 1000, // 7 days
    };

    const minInterval = intervalMs[frequency] ?? intervalMs['daily'];
    const lastAttempt = this.lastPublishAttempt.get(userId);

    if (lastAttempt) {
      const elapsed = now.getTime() - lastAttempt.getTime();
      if (elapsed < minInterval) {
        const nextAttempt = new Date(lastAttempt.getTime() + minInterval);
        logger.info(
          `[Autopilot] User ${userId}: frequency="${frequency}" — next attempt at ` +
          `${nextAttempt.toISOString()} (${Math.round((nextAttempt.getTime() - now.getTime()) / 60000)} min away)`
        );
        return false;
      }
    }

    // Enough time has passed — record this attempt and proceed
    this.lastPublishAttempt.set(userId, now);
    logger.info(`[Autopilot] User ${userId}: frequency="${frequency}" gate passed — proceeding with content generation`);
    return true;
  }

  /**
   * Calculate next optimal posting time based on platform and frequency
   * Returns the next available optimal time slot that respects user constraints
   */
  private calculateNextOptimalPostingTime(platform: string, frequency: string): Date {
    const now = new Date();
    const currentHour = now.getHours();

    // Platform-specific optimal posting hours
    const optimalHours = {
      twitter: [9, 12, 17],      // 9 AM, 12 PM, 5 PM
      instagram: [11, 13, 19],   // 11 AM, 1 PM, 7 PM
      facebook: [13, 15, 19],    // 1 PM, 3 PM, 7 PM
      tiktok: [6, 10, 19, 22],   // 6 AM, 10 AM, 7 PM, 10 PM
      youtube: [14, 17, 20],     // 2 PM, 5 PM, 8 PM
    };

    const platformHours = optimalHours[platform] || [9, 12, 17];

    // Find the next optimal hour (>= currentHour so we don't skip the current hour slot)
    const currentMinute = now.getMinutes();
    let nextOptimalHour = platformHours.find(h => h > currentHour);
    const sameHourSlot = platformHours.find(h => h === currentHour);

    // If we're currently in an optimal hour and at most 55 minutes in, use it (schedule 5 min from now)
    if (sameHourSlot !== undefined && currentMinute <= 55) {
      const scheduledTime = new Date(now);
      scheduledTime.setMinutes(currentMinute + 5, 0, 0);
      return scheduledTime;
    }

    // If no future optimal hour today, roll over to first optimal hour tomorrow
    if (!nextOptimalHour) {
      nextOptimalHour = platformHours[0];
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(nextOptimalHour, 0, 0, 0);
      return tomorrow;
    }

    // Schedule for today at next optimal hour
    const scheduledTime = new Date(now);
    scheduledTime.setHours(nextOptimalHour, 0, 0, 0);
    return scheduledTime;
  }

  /**
   * Get status of the autopilot publisher
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun,
    };
  }
}

export const autopilotPublisher = new AutopilotPublisher();
