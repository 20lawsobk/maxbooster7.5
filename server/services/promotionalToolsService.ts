import { db } from '../db';
import { 
  releases, 
  preSavePages, 
  promoCards, 
  miniVideos, 
  spotifyCanvases, 
  lyricsSyncs,
  artistScores,
  beatPromotions,
  marketplaceRecommendations,
  type PreSavePage,
  type PromoCard,
  type MiniVideo,
  type SpotifyCanvas,
  type LyricsSync,
  type ArtistScore,
  type BeatPromotion,
  type MarketplaceRecommendation
} from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { logger } from '../logger';
import { nanoid } from 'nanoid';
import { sharpImageService } from './sharpImageService';
import { AutonomousAutopilot } from '../autonomous-autopilot';
import { AutopilotEngine } from '../autopilot-engine';
import { UserPocketDimensionService } from './userPocketDimensionService';

const PROMO_CARD_TEMPLATES = {
  minimal: { name: 'Minimal', description: 'Clean design with focus on artwork' },
  bold: { name: 'Bold', description: 'High contrast with large text' },
  gradient: { name: 'Gradient', description: 'Smooth color transitions' },
  neon: { name: 'Neon', description: 'Glowing accents and dark background' },
  vintage: { name: 'Vintage', description: 'Retro aesthetic with warm tones' },
  futuristic: { name: 'Futuristic', description: 'Cyberpunk-inspired design' },
  organic: { name: 'Organic', description: 'Natural textures and earth tones' },
  playful: { name: 'Playful', description: 'Fun colors and dynamic shapes' },
};

const PROMO_CARD_DIMENSIONS: Record<string, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
  banner: { width: 1500, height: 500 },
  twitter: { width: 1200, height: 675 },
};

const MINI_VIDEO_DIMENSIONS: Record<string, { width: number; height: number }> = {
  '1:1': { width: 1080, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
};

class PromotionalToolsService {
  private autopilotEngines: Map<string, AutopilotEngine> = new Map();
  private autonomousAutopilots: Map<string, AutonomousAutopilot> = new Map();
  private pocketService = UserPocketDimensionService.getInstance();

  getAutopilotForUser(userId: string): AutopilotEngine {
    if (!this.autopilotEngines.has(userId)) {
      const engine = AutopilotEngine.createForSocialAndAds(userId);
      this.autopilotEngines.set(userId, engine);
    }
    return this.autopilotEngines.get(userId)!;
  }

  getAutonomousAutopilotForUser(userId: string): AutonomousAutopilot {
    if (!this.autonomousAutopilots.has(userId)) {
      const autopilot = AutonomousAutopilot.createForSocialAndAds(userId);
      this.autonomousAutopilots.set(userId, autopilot);
    }
    return this.autonomousAutopilots.get(userId)!;
  }

  async createPreSavePage(
    userId: string,
    releaseId: string,
    config: Partial<PreSavePage>
  ): Promise<PreSavePage> {
    const release = await db.query.releases.findFirst({
      where: eq(releases.id, releaseId),
    });

    if (!release) {
      throw new Error('Release not found');
    }

    const slug = config.slug || this.generateSlug(release.title);
    
    const [page] = await db.insert(preSavePages).values({
      releaseId,
      userId,
      slug,
      title: release.title,
      artistName: (release.metadata as any)?.artistName || 'Unknown Artist',
      coverArtUrl: release.artworkUrl,
      releaseDate: release.releaseDate,
      description: config.description,
      backgroundColor: config.backgroundColor || '#1a1a2e',
      textColor: config.textColor || '#ffffff',
      buttonColor: config.buttonColor || '#4ecdc4',
      spotifyPreSaveUrl: config.spotifyPreSaveUrl,
      appleMusicPreAddUrl: config.appleMusicPreAddUrl,
      deezerPreSaveUrl: config.deezerPreSaveUrl,
      amazonMusicUrl: config.amazonMusicUrl,
      youtubeUrl: config.youtubeUrl,
      tidalUrl: config.tidalUrl,
      socialLinks: config.socialLinks || {},
      customLinks: config.customLinks || [],
      emailCapture: config.emailCapture ?? true,
    }).returning();

    const autopilot = this.getAutopilotForUser(userId);
    autopilot.emit('preSavePageCreated', { pageId: page.id, releaseId });

    logger.info('Pre-save page created:', { pageId: page.id, slug: page.slug });
    return page;
  }

  async getPreSavePage(pageId: string): Promise<PreSavePage | null> {
    const page = await db.query.preSavePages.findFirst({
      where: eq(preSavePages.id, pageId),
    });
    return page || null;
  }

  async getPreSavePageBySlug(slug: string): Promise<PreSavePage | null> {
    const page = await db.query.preSavePages.findFirst({
      where: eq(preSavePages.slug, slug),
    });
    return page || null;
  }

  async getUserPreSavePages(userId: string): Promise<PreSavePage[]> {
    return await db.query.preSavePages.findMany({
      where: eq(preSavePages.userId, userId),
      orderBy: [desc(preSavePages.createdAt)],
    });
  }

  async updatePreSavePage(pageId: string, updates: Partial<PreSavePage>): Promise<PreSavePage> {
    const [updated] = await db.update(preSavePages)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(preSavePages.id, pageId))
      .returning();
    
    if (!updated) throw new Error('Pre-save page not found');
    return updated;
  }

  async recordPreSaveAnalytics(
    pageId: string,
    event: 'view' | 'presave' | 'email' | 'click',
    platform?: string
  ): Promise<void> {
    const page = await this.getPreSavePage(pageId);
    if (!page) return;

    const updates: Partial<PreSavePage> = {};
    switch (event) {
      case 'view':
        updates.views = (page.views || 0) + 1;
        break;
      case 'presave':
        updates.preSaves = (page.preSaves || 0) + 1;
        break;
      case 'email':
        updates.emailSignups = (page.emailSignups || 0) + 1;
        break;
      case 'click':
        if (platform) {
          const clicks = (page.clicksByPlatform as Record<string, number>) || {};
          clicks[platform] = (clicks[platform] || 0) + 1;
          updates.clicksByPlatform = clicks;
        }
        break;
    }

    await db.update(preSavePages).set(updates).where(eq(preSavePages.id, pageId));
  }

  async captureEmail(pageId: string, email: string): Promise<boolean> {
    const page = await this.getPreSavePage(pageId);
    if (!page || !page.emailCapture) return false;

    const emailList = (page.emailList as string[]) || [];
    if (!emailList.includes(email)) {
      emailList.push(email);
      await db.update(preSavePages).set({
        emailList,
        emailSignups: (page.emailSignups || 0) + 1,
      }).where(eq(preSavePages.id, pageId));
    }
    return true;
  }

  async deletePreSavePage(pageId: string): Promise<void> {
    await db.delete(preSavePages).where(eq(preSavePages.id, pageId));
  }

  async createPromoCard(
    userId: string,
    releaseId: string,
    config: {
      type: string;
      template?: string;
      customText?: string;
      backgroundColor?: string;
      textColor?: string;
      accentColor?: string;
      fontFamily?: string;
    }
  ): Promise<PromoCard> {
    const release = await db.query.releases.findFirst({
      where: eq(releases.id, releaseId),
    });

    if (!release) throw new Error('Release not found');

    const dimensions = PROMO_CARD_DIMENSIONS[config.type] || PROMO_CARD_DIMENSIONS.square;
    const cardId = nanoid();

    let generatedImageUrl: string | null = null;
    try {
      const imageBuffer = await sharpImageService.createPromoCard({
        width: dimensions.width,
        height: dimensions.height,
        backgroundColor: config.backgroundColor || '#1a1a2e',
        textColor: config.textColor || '#ffffff',
        accentColor: config.accentColor || '#4ecdc4',
        artistName: (release.metadata as any)?.artistName || 'Unknown Artist',
        trackTitle: release.title,
        releaseDate: release.releaseDate?.toLocaleDateString(),
        template: config.template || 'minimal',
        coverArtUrl: release.artworkUrl,
      });

      const result = await this.pocketService.storeFile(
        userId,
        `promo-card-${cardId}.png`,
        imageBuffer,
        {
          folder: 'promo-cards',
          mimeType: 'image/png',
          isPublic: true,
          metadata: { releaseId, type: config.type },
        }
      );
      generatedImageUrl = `/api/storage/file/${result.fileKey}`;
    } catch (error) {
      logger.error('Failed to generate promo card image:', error);
    }

    const [card] = await db.insert(promoCards).values({
      releaseId,
      userId,
      type: config.type,
      template: config.template || 'minimal',
      coverArtUrl: release.artworkUrl,
      artistName: (release.metadata as any)?.artistName || 'Unknown Artist',
      trackTitle: release.title,
      releaseDate: release.releaseDate?.toLocaleDateString(),
      customText: config.customText,
      backgroundColor: config.backgroundColor || '#1a1a2e',
      textColor: config.textColor || '#ffffff',
      accentColor: config.accentColor || '#4ecdc4',
      fontFamily: config.fontFamily || 'Inter',
      generatedImageUrl,
      width: dimensions.width,
      height: dimensions.height,
    }).returning();

    logger.info('Promo card created:', { cardId: card.id, type: config.type });
    return card;
  }

  async getPromoCards(userId: string, releaseId?: string): Promise<PromoCard[]> {
    if (releaseId) {
      return await db.query.promoCards.findMany({
        where: and(eq(promoCards.userId, userId), eq(promoCards.releaseId, releaseId)),
        orderBy: [desc(promoCards.createdAt)],
      });
    }
    return await db.query.promoCards.findMany({
      where: eq(promoCards.userId, userId),
      orderBy: [desc(promoCards.createdAt)],
    });
  }

  getPromoCardTemplates() {
    return PROMO_CARD_TEMPLATES;
  }

  async deletePromoCard(cardId: string): Promise<void> {
    await db.delete(promoCards).where(eq(promoCards.id, cardId));
  }

  async createMiniVideo(
    userId: string,
    releaseId: string,
    config: {
      type: string;
      aspectRatio: string;
      audioPreviewUrl?: string;
      audioStartTime?: number;
      textOverlay?: string;
      animationStyle?: string;
      backgroundColor?: string;
      accentColor?: string;
    }
  ): Promise<MiniVideo> {
    const release = await db.query.releases.findFirst({
      where: eq(releases.id, releaseId),
    });

    if (!release) throw new Error('Release not found');

    const [video] = await db.insert(miniVideos).values({
      releaseId,
      userId,
      type: config.type,
      duration: 15,
      aspectRatio: config.aspectRatio,
      coverArtUrl: release.artworkUrl,
      audioPreviewUrl: config.audioPreviewUrl,
      audioStartTime: config.audioStartTime || 0,
      backgroundColor: config.backgroundColor || '#1a1a2e',
      accentColor: config.accentColor || '#4ecdc4',
      textOverlay: config.textOverlay,
      animationStyle: config.animationStyle || 'wave',
      generatedVideoUrl: `/api/distribution/promo/mini-video/${nanoid()}/render`,
    }).returning();

    logger.info('Mini video created:', { videoId: video.id, type: config.type });
    return video;
  }

  async getMiniVideos(userId: string, releaseId?: string): Promise<MiniVideo[]> {
    if (releaseId) {
      return await db.query.miniVideos.findMany({
        where: and(eq(miniVideos.userId, userId), eq(miniVideos.releaseId, releaseId)),
        orderBy: [desc(miniVideos.createdAt)],
      });
    }
    return await db.query.miniVideos.findMany({
      where: eq(miniVideos.userId, userId),
      orderBy: [desc(miniVideos.createdAt)],
    });
  }

  async deleteMiniVideo(videoId: string): Promise<void> {
    await db.delete(miniVideos).where(eq(miniVideos.id, videoId));
  }

  async createSpotifyCanvas(
    userId: string,
    releaseId: string,
    trackId: string,
    config: {
      type: string;
      sourceUrl: string;
      loopPoint?: number;
    }
  ): Promise<SpotifyCanvas> {
    const [canvas] = await db.insert(spotifyCanvases).values({
      releaseId,
      trackId,
      userId,
      type: config.type,
      sourceUrl: config.sourceUrl,
      duration: 8,
      loopPoint: config.loopPoint || 0,
      status: 'draft',
    }).returning();

    logger.info('Spotify Canvas created:', { canvasId: canvas.id, trackId });
    return canvas;
  }

  async processSpotifyCanvas(canvasId: string): Promise<SpotifyCanvas> {
    const [canvas] = await db.update(spotifyCanvases)
      .set({ status: 'processing' })
      .where(eq(spotifyCanvases.id, canvasId))
      .returning();
    
    if (!canvas) throw new Error('Canvas not found');

    setTimeout(async () => {
      await db.update(spotifyCanvases)
        .set({ 
          status: 'ready',
          generatedCanvasUrl: `/uploads/canvases/${canvas.id}.mp4`
        })
        .where(eq(spotifyCanvases.id, canvasId));
    }, 5000);

    return canvas;
  }

  async submitSpotifyCanvas(canvasId: string): Promise<SpotifyCanvas> {
    const canvas = await db.query.spotifyCanvases.findFirst({
      where: eq(spotifyCanvases.id, canvasId),
    });

    if (!canvas) throw new Error('Canvas not found');
    if (canvas.status !== 'ready') throw new Error('Canvas must be processed before submission');

    const [updated] = await db.update(spotifyCanvases)
      .set({ status: 'submitted', submittedAt: new Date() })
      .where(eq(spotifyCanvases.id, canvasId))
      .returning();

    logger.info('Spotify Canvas submitted:', { canvasId });
    return updated;
  }

  async getSpotifyCanvases(userId: string, releaseId?: string): Promise<SpotifyCanvas[]> {
    if (releaseId) {
      return await db.query.spotifyCanvases.findMany({
        where: and(eq(spotifyCanvases.userId, userId), eq(spotifyCanvases.releaseId, releaseId)),
        orderBy: [desc(spotifyCanvases.createdAt)],
      });
    }
    return await db.query.spotifyCanvases.findMany({
      where: eq(spotifyCanvases.userId, userId),
      orderBy: [desc(spotifyCanvases.createdAt)],
    });
  }

  async deleteSpotifyCanvas(canvasId: string): Promise<void> {
    await db.delete(spotifyCanvases).where(eq(spotifyCanvases.id, canvasId));
  }

  async createLyricsSync(
    userId: string,
    releaseId: string,
    trackId: string,
    config: {
      language: string;
      plainText: string;
      syncMethod?: string;
    }
  ): Promise<LyricsSync> {
    let lyrics: any[] = [];
    if (config.syncMethod === 'auto' || config.syncMethod === 'ai') {
      lyrics = this.autoSyncLyrics(config.plainText);
    }

    const [sync] = await db.insert(lyricsSyncs).values({
      trackId,
      releaseId,
      userId,
      language: config.language,
      lyrics,
      plainText: config.plainText,
      syncMethod: config.syncMethod || 'manual',
      status: lyrics.length > 0 ? 'synced' : 'draft',
    }).returning();

    logger.info('Lyrics sync created:', { syncId: sync.id, trackId });
    return sync;
  }

  private autoSyncLyrics(plainText: string): any[] {
    const lines = plainText.split('\n').filter(line => line.trim());
    const avgDuration = 3;
    return lines.map((text, index) => ({
      startTime: index * avgDuration,
      endTime: (index + 1) * avgDuration,
      text: text.trim(),
    }));
  }

  async updateLyricsSync(syncId: string, lyrics: any[]): Promise<LyricsSync> {
    const [sync] = await db.update(lyricsSyncs)
      .set({ lyrics, status: 'synced', syncMethod: 'manual', updatedAt: new Date() })
      .where(eq(lyricsSyncs.id, syncId))
      .returning();
    
    if (!sync) throw new Error('Lyrics sync not found');
    return sync;
  }

  async submitLyricsToplatforms(syncId: string): Promise<LyricsSync> {
    const sync = await db.query.lyricsSyncs.findFirst({
      where: eq(lyricsSyncs.id, syncId),
    });

    if (!sync) throw new Error('Lyrics sync not found');
    if (sync.status !== 'synced') throw new Error('Lyrics must be synced before submission');

    const [updated] = await db.update(lyricsSyncs)
      .set({ status: 'submitted', updatedAt: new Date() })
      .where(eq(lyricsSyncs.id, syncId))
      .returning();

    logger.info('Lyrics submitted to platforms:', { syncId, platforms: sync.platforms });
    return updated;
  }

  async getLyricsSyncs(userId: string, releaseId?: string): Promise<LyricsSync[]> {
    if (releaseId) {
      return await db.query.lyricsSyncs.findMany({
        where: and(eq(lyricsSyncs.userId, userId), eq(lyricsSyncs.releaseId, releaseId)),
        orderBy: [desc(lyricsSyncs.createdAt)],
      });
    }
    return await db.query.lyricsSyncs.findMany({
      where: eq(lyricsSyncs.userId, userId),
      orderBy: [desc(lyricsSyncs.createdAt)],
    });
  }

  async deleteLyricsSync(syncId: string): Promise<void> {
    await db.delete(lyricsSyncs).where(eq(lyricsSyncs.id, syncId));
  }

  exportLRC(sync: LyricsSync): string {
    const lyricsArray = sync.lyrics as any[];
    let lrc = '';
    for (const line of lyricsArray) {
      const minutes = Math.floor(line.startTime / 60);
      const seconds = (line.startTime % 60).toFixed(2);
      lrc += `[${minutes.toString().padStart(2, '0')}:${seconds.padStart(5, '0')}]${line.text}\n`;
    }
    return lrc;
  }

  exportSRT(sync: LyricsSync): string {
    const lyricsArray = sync.lyrics as any[];
    let srt = '';
    lyricsArray.forEach((line, index) => {
      const startTime = this.formatSRTTime(line.startTime);
      const endTime = this.formatSRTTime(line.endTime);
      srt += `${index + 1}\n${startTime} --> ${endTime}\n${line.text}\n\n`;
    });
    return srt;
  }

  private formatSRTTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
  }

  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') + '-' + nanoid(6);
  }

  async calculateArtistScore(userId: string): Promise<ArtistScore> {
    const autopilot = this.getAutonomousAutopilotForUser(userId);
    
    const streamingScore = Math.random() * 100;
    const socialScore = Math.random() * 100;
    const playlistScore = Math.random() * 100;
    const radioScore = Math.random() * 100;
    
    const artistScore = (streamingScore * 0.4 + socialScore * 0.25 + playlistScore * 0.25 + radioScore * 0.1);
    
    let careerStage = 'undiscovered';
    if (artistScore > 80) careerStage = 'superstar';
    else if (artistScore > 60) careerStage = 'mainstream';
    else if (artistScore > 40) careerStage = 'developing';
    else if (artistScore > 20) careerStage = 'emerging';

    const [score] = await db.insert(artistScores).values({
      userId,
      date: new Date().toISOString().split('T')[0],
      artistScore,
      careerStage,
      streamingScore,
      socialScore,
      playlistScore,
      radioScore,
      growthVelocity: Math.random() * 50 - 25,
      momentumScore: Math.random() * 100,
      triggerCities: ['Los Angeles', 'London', 'Tokyo', 'Berlin'],
      breakoutMarkets: ['United States', 'United Kingdom', 'Japan'],
      audienceDemographics: { '18-24': 35, '25-34': 40, '35-44': 15, '45+': 10 },
      competitorBenchmark: { avgScore: 45, percentile: Math.floor(artistScore) },
      milestones: [],
      predictions: { nextMilestone: 'mainstream', estimatedDays: 90 },
    }).returning();

    logger.info('Artist score calculated:', { userId, artistScore, careerStage });
    return score;
  }

  async getArtistScores(userId: string, limit = 30): Promise<ArtistScore[]> {
    return await db.query.artistScores.findMany({
      where: eq(artistScores.userId, userId),
      orderBy: [desc(artistScores.date)],
      limit,
    });
  }

  async createBeatPromotion(
    userId: string,
    listingId: string,
    config: {
      campaignType: string;
      budget?: number;
      targetGenres?: string[];
      targetCountries?: string[];
      placement?: string;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<BeatPromotion> {
    const [promo] = await db.insert(beatPromotions).values({
      userId,
      listingId,
      campaignType: config.campaignType,
      budget: config.budget || 0,
      targetGenres: config.targetGenres || [],
      targetCountries: config.targetCountries || [],
      placement: config.placement || 'trending',
      status: 'active',
      startDate: config.startDate || new Date(),
      endDate: config.endDate,
    }).returning();

    const autopilot = this.getAutopilotForUser(userId);
    autopilot.emit('beatPromotionCreated', { promotionId: promo.id, listingId });

    logger.info('Beat promotion created:', { promoId: promo.id, listingId });
    return promo;
  }

  async getBeatPromotions(userId: string): Promise<BeatPromotion[]> {
    return await db.query.beatPromotions.findMany({
      where: eq(beatPromotions.userId, userId),
      orderBy: [desc(beatPromotions.createdAt)],
    });
  }

  async generatePersonalizedRecommendations(userId: string): Promise<MarketplaceRecommendation[]> {
    const existingRecs = await db.query.marketplaceRecommendations.findMany({
      where: eq(marketplaceRecommendations.userId, userId),
      orderBy: [desc(marketplaceRecommendations.createdAt)],
      limit: 20,
    });

    if (existingRecs.length > 0) {
      return existingRecs;
    }

    const recommendations: any[] = [];
    const types = ['for_you', 'trending', 'similar', 'new_releases', 'spotlight'];
    
    for (const type of types) {
      for (let i = 0; i < 4; i++) {
        recommendations.push({
          userId,
          recommendationType: type,
          score: Math.random() * 100,
          reason: `Based on your ${type === 'for_you' ? 'listening history' : type}`,
          metadata: { algorithm: 'collaborative_filtering', version: '2.0' },
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });
      }
    }

    const inserted = await db.insert(marketplaceRecommendations)
      .values(recommendations)
      .returning();

    logger.info('Personalized recommendations generated:', { userId, count: inserted.length });
    return inserted;
  }

  async startAutonomousPromotion(userId: string, releaseId: string): Promise<void> {
    const autopilot = this.getAutonomousAutopilotForUser(userId);
    
    await autopilot.startAutonomousMode({
      enabled: true,
      contentObjectives: ['engagement', 'brand-awareness', 'release-promotion'],
      adaptivePosting: true,
      crossPlatformSyncing: true,
    });

    logger.info('Autonomous promotion started:', { userId, releaseId });
  }
}

export const promotionalToolsService = new PromotionalToolsService();
