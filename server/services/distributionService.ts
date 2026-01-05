import { storage } from "../storage";
import { nanoid } from "nanoid";
import type { 
  InsertRelease, 
  Release, 
  DistributionPackage, 
  InsertDistributionPackage, 
  DistributionTrack, 
  InsertDistributionTrack,
  InsertDistributionSLAMetric,
  DistributionSLAMetric,
  InsertContentIdRegistration,
  ContentIdRegistration,
  InsertSyncLicense,
  SyncLicense,
  InsertSyncLicenseInquiry,
  SyncLicenseInquiry,
  InsertRoyaltySplit,
  RoyaltySplit,
  InsertRoyaltyTransaction,
  RoyaltyTransaction,
  InsertPreSaveCampaign,
  PreSaveCampaign,
  InsertPreSaveEntry,
  PreSaveEntry
} from "@shared/schema";
import archiver from "archiver";
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { createReadStream, createWriteStream } from "fs";
import { storageService } from './storageService.js';
import os from 'os';
import { randomUUID } from 'crypto';
import { labelGridService } from './labelgrid-service.js';
import { logger } from '../logger.js';

const DEFAULT_SLA_TARGET_HOURS = 48;

export interface DSPProvider {
  id: string;
  name: string;
  type: 'streaming' | 'download' | 'social';
  isActive: boolean;
}

export interface DispatchStatus {
  provider: string;
  status: 'pending' | 'processing' | 'live' | 'failed';
  submittedAt?: Date;
  liveDate?: Date;
  errorMessage?: string;
}

export class DistributionService {

  /**
   * Create a new release
   */
  async createRelease(data: InsertRelease): Promise<Release> {
    try {
      const release = await storage.createRelease(data);
      return release;
    } catch (error: unknown) {
      logger.error("Error creating release:", error);
      throw new Error("Failed to create release");
    }
  }

  /**
   * Get user's releases
   */
  async getUserReleases(userId: string): Promise<Release[]> {
    try {
      return await storage.getUserReleases(userId);
    } catch (error: unknown) {
      logger.error("Error fetching releases:", error);
      throw new Error("Failed to fetch releases");
    }
  }

  /**
   * Get release by ID
   */
  async getRelease(releaseId: string, userId: string): Promise<Release | undefined> {
    try {
      const releases = await storage.getUserReleases(userId);
      return releases.find(r => r.id === releaseId);
    } catch (error: unknown) {
      logger.error("Error fetching release:", error);
      throw new Error("Failed to fetch release");
    }
  }

  /**
   * Submit release to DSP providers via LabelGrid
   */
  async submitToProvider(releaseId: string, providerId: string, userId: string): Promise<{
    success: boolean;
    dispatchId: string;
    estimatedLiveDate: Date;
  }> {
    try {
      const release = await this.getRelease(releaseId, userId);
      if (!release) {
        throw new Error("Release not found");
      }

      // Check if LabelGrid is configured
      if (labelGridService.isConfigured()) {
        // PRODUCTION: Use LabelGrid API for real distribution
        try {
          // Prepare release data for LabelGrid
          const labelGridRelease = {
            title: release.title,
            artist: release.artist,
            releaseDate: release.releaseDate?.toISOString() || new Date().toISOString(),
            upc: release.upc || undefined,
            tracks: [],
            artwork: release.coverArt || '',
            genre: release.genre || 'General',
            platforms: [providerId], // Submit to specific platform
            label: release.label,
            copyrightYear: new Date().getFullYear(),
            copyrightOwner: release.copyrightHolder || release.artist,
          };

          // Submit to LabelGrid (it handles database updates internally)
          const result = await labelGridService.submitRelease(labelGridRelease);

          return {
            success: true,
            dispatchId: result.releaseId,
            estimatedLiveDate: result.estimatedLiveDate ? new Date(result.estimatedLiveDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          };
        } catch (error: unknown) {
          logger.error("LabelGrid distribution failed:", error);
          throw error;
        }
      } else {
        // DEVELOPMENT/DEMO MODE: Simulated distribution (no real API calls)
        logger.warn('⚠️  LabelGrid API token not configured - using demo mode');
        logger.warn('   Set LABELGRID_API_TOKEN in environment to enable real distribution');

        const dispatchId = `demo_dispatch_${nanoid()}`;
        const estimatedLiveDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

        // Update release platforms
        const platforms = (release.platforms as any) || [];
        platforms.push({
          providerId,
          status: 'processing',
          dispatchId,
          submittedAt: new Date(),
          estimatedLiveDate,
        });

        await storage.updateRelease(releaseId, userId, { platforms });

        return {
          success: true,
          dispatchId,
          estimatedLiveDate,
        };
      }
    } catch (error: unknown) {
      logger.error("Error submitting to provider:", error);
      throw new Error("Failed to submit to provider");
    }
  }

  /**
   * Track distribution dispatch status
   */
  async trackDispatchStatus(releaseId: string, userId: string): Promise<DispatchStatus[]> {
    try {
      const release = await this.getRelease(releaseId, userId);
      if (!release) {
        throw new Error("Release not found");
      }

      const platforms = (release.platforms as any[]) || [];
      
      return platforms.map(p => ({
        provider: p.providerId,
        status: p.status,
        submittedAt: p.submittedAt ? new Date(p.submittedAt) : undefined,
        liveDate: p.liveDate ? new Date(p.liveDate) : undefined,
        errorMessage: p.errorMessage,
      }));
    } catch (error: unknown) {
      logger.error("Error tracking dispatch status:", error);
      throw new Error("Failed to track dispatch status");
    }
  }

  /**
   * Handle DSP webhook for status updates
   */
  async handleDSPWebhook(payload: {
    provider: string;
    releaseId: string;
    status: string;
    liveDate?: string;
    errorMessage?: string;
  }): Promise<void> {
    try {
      // In production:
      // 1. Verify webhook signature
      // 2. Find release by external ID
      // 3. Update platform status
      // 4. Notify user of status change

      logger.info("DSP Webhook received:", payload);
    } catch (error: unknown) {
      logger.error("Error handling DSP webhook:", error);
      throw new Error("Failed to handle DSP webhook");
    }
  }

  /**
   * Get available DSP providers
   */
  async getProviders(): Promise<DSPProvider[]> {
    return [
      { id: 'spotify', name: 'Spotify', type: 'streaming', isActive: true },
      { id: 'apple_music', name: 'Apple Music', type: 'streaming', isActive: true },
      { id: 'youtube_music', name: 'YouTube Music', type: 'streaming', isActive: true },
      { id: 'amazon_music', name: 'Amazon Music', type: 'streaming', isActive: true },
      { id: 'deezer', name: 'Deezer', type: 'streaming', isActive: true },
      { id: 'tidal', name: 'Tidal', type: 'streaming', isActive: true },
      { id: 'soundcloud', name: 'SoundCloud', type: 'streaming', isActive: true },
      { id: 'pandora', name: 'Pandora', type: 'streaming', isActive: true },
      { id: 'tiktok', name: 'TikTok', type: 'social', isActive: true },
      { id: 'instagram', name: 'Instagram/Facebook', type: 'social', isActive: true },
    ];
  }

  /**
   * Distribute release to all selected platforms
   */
  async distributeRelease(releaseId: string, userId: string) {
    try {
      const release = await this.getRelease(releaseId, userId);
      if (!release) {
        throw new Error("Release not found");
      }

      const platforms = [
        'spotify',
        'apple_music', 
        'youtube_music',
        'amazon_music',
        'deezer',
        'tidal'
      ];

      const distributionResults = platforms.map(platform => ({
        platform,
        status: 'processing',
        estimatedLiveDate: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }));

      return {
        success: true,
        distributionId: `dist_${releaseId}`,
        platforms: distributionResults
      };
    } catch (error: unknown) {
      logger.error("Distribution error:", error);
      throw new Error("Failed to distribute release");
    }
  }

  /**
   * Get release analytics
   */
  async getReleaseAnalytics(releaseId: string, userId: string) {
    try {
      // In production, fetch from platform APIs
      return {
        totalStreams: 0,
        totalRevenue: 0,
        platforms: {},
        demographics: {},
        timeline: []
      };
    } catch (error: unknown) {
      logger.error("Analytics error:", error);
      throw new Error("Failed to fetch analytics");
    }
  }

  /**
   * Setup royalty splits for collaborators
   */
  async setupRoyaltySplit(releaseId: string, splits: Array<{ userId: string; percentage: number; role: string }>) {
    try {
      // Validate splits total 100%
      const total = splits.reduce((sum, s) => sum + s.percentage, 0);
      if (total !== 100) {
        throw new Error("Split percentages must total 100%");
      }

      // In production: Integrate with Stripe Connect for automatic royalty splits
      return { success: true, splitId: `split_${releaseId}` };
    } catch (error: unknown) {
      logger.error("Royalty split error:", error);
      throw new Error("Failed to setup royalty split");
    }
  }

  /**
   * Validate ISRC (International Standard Recording Code)
   * Format: CC-XXX-YY-NNNNN (e.g., US-S1Z-99-00001)
   */
  validateISRC(isrc: string): boolean {
    const isrcPattern = /^[A-Z]{2}-[A-Z0-9]{3}-\d{2}-\d{5}$/;
    return isrcPattern.test(isrc);
  }

  /**
   * Validate UPC/EAN code
   * Format: 12-13 digits
   */
  validateUPC(upc: string): boolean {
    const upcPattern = /^\d{12,13}$/;
    return upcPattern.test(upc);
  }

  /**
   * Validate artwork dimensions and format
   */
  async validateArtwork(artworkPath: string): Promise<{ valid: boolean; error?: string }> {
    try {
      if (!fs.existsSync(artworkPath)) {
        return { valid: false, error: "Artwork file not found" };
      }

      const ext = path.extname(artworkPath).toLowerCase();
      if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
        return { valid: false, error: "Artwork must be JPEG or PNG" };
      }

      // In production, use sharp or similar to check dimensions
      // For now, we'll accept the file
      return { valid: true };
    } catch (error: unknown) {
      logger.error("Artwork validation error:", error);
      return { valid: false, error: "Failed to validate artwork" };
    }
  }

  /**
   * Create distribution package from project data
   */
  async createDistributionPackage(data: InsertDistributionPackage): Promise<DistributionPackage> {
    try {
      // Validate UPC if provided
      if (data.upc && !this.validateUPC(data.upc)) {
        throw new Error("Invalid UPC format. Must be 12-13 digits.");
      }

      const pkg = await storage.createDistributionPackage(data);
      return pkg;
    } catch (error: unknown) {
      logger.error("Error creating distribution package:", error);
      throw new Error("Failed to create distribution package");
    }
  }

  /**
   * Generate DSP-compliant metadata JSON
   */
  async generateMetadataJSON(packageId: string): Promise<any> {
    try {
      const pkg = await storage.getDistributionPackageById(packageId);
      if (!pkg) {
        throw new Error("Distribution package not found");
      }

      const tracks = await storage.getPackageTracks(packageId);

      // Build DSP-compliant metadata structure
      const metadata = {
        release: {
          upc: pkg.upc,
          title: pkg.albumTitle,
          releaseDate: pkg.releaseDate?.toISOString().split('T')[0],
          label: pkg.label,
          artwork: pkg.artworkUrl,
          copyrightP: pkg.copyrightP,
          copyrightC: pkg.copyrightC,
        },
        tracks: tracks.map(track => ({
          isrc: track.isrc,
          trackNumber: track.trackNumber,
          title: track.title,
          artist: track.artist,
          genre: track.genre,
          duration: track.duration,
          explicitContent: track.explicitContent,
          credits: track.credits ? JSON.parse(track.credits) : {},
          lyrics: track.lyrics,
        })),
        licensing: {
          territories: ["WORLDWIDE"],
          rights: ["streaming", "download"],
          restrictions: [],
        },
        metadata_version: "1.0",
        generated_at: new Date().toISOString(),
      };

      return metadata;
    } catch (error: unknown) {
      logger.error("Error generating metadata JSON:", error);
      throw new Error("Failed to generate metadata JSON");
    }
  }

  /**
   * Generate CSV export of track list
   */
  async generateCSV(packageId: string): Promise<string> {
    try {
      const tracks = await storage.getPackageTracks(packageId);

      const headers = [
        "Track Number",
        "ISRC",
        "Title",
        "Artist",
        "Genre",
        "Duration (seconds)",
        "Explicit Content",
      ];

      const rows = tracks.map(track => [
        track.trackNumber?.toString() || "",
        track.isrc || "",
        track.title || "",
        track.artist || "",
        track.genre || "",
        track.duration?.toString() || "",
        track.explicitContent ? "Yes" : "No",
      ]);

      const csvContent = [
        headers.join(","),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(",")),
      ].join("\n");

      return csvContent;
    } catch (error: unknown) {
      logger.error("Error generating CSV:", error);
      throw new Error("Failed to generate CSV");
    }
  }

  /**
   * Package metadata, CSV, and artwork as ZIP file
   */
  async packageAsZIP(packageId: string): Promise<string> {
    const tempZipPath = path.join(os.tmpdir(), `distribution_${randomUUID()}.zip`);
    
    try {
      const pkg = await storage.getDistributionPackageById(packageId);
      if (!pkg) {
        throw new Error("Distribution package not found");
      }

      const output = createWriteStream(tempZipPath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      await new Promise<void>((resolve, reject) => {
        output.on("close", () => {
          logger.info(`ZIP package created: ${archive.pointer()} bytes`);
          resolve();
        });

        archive.on("error", (err) => {
          reject(err);
        });

        archive.pipe(output);

        // Add metadata.json
        this.generateMetadataJSON(packageId).then((metadata) => {
          archive.append(JSON.stringify(metadata, null, 2), { name: "metadata.json" });

          // Add tracks.csv
          this.generateCSV(packageId).then((csv) => {
            archive.append(csv, { name: "tracks.csv" });

            // Add artwork if available
            if (pkg.artworkUrl) {
              // Convert public URL path to filesystem path
              // pkg.artworkUrl is like "/distribution/artwork/artwork_123.jpg"
              const artworkFilePath = path.join(process.cwd(), "public", pkg.artworkUrl);
              
              if (fs.existsSync(artworkFilePath)) {
                const artworkExt = path.extname(pkg.artworkUrl);
                archive.file(artworkFilePath, { name: `artwork${artworkExt}` });
              } else {
                logger.warn(`Artwork file not found: ${artworkFilePath}`);
              }
            }

            // Add README
            const readme = `Distribution Package
=====================

Package ID: ${packageId}
Album: ${pkg.albumTitle}
UPC: ${pkg.upc}
Release Date: ${pkg.releaseDate?.toISOString().split('T')[0] || 'Not set'}
Label: ${pkg.label || 'Not set'}

Files Included:
- metadata.json: DSP-compliant metadata
- tracks.csv: Track listing
${pkg.artworkUrl ? '- artwork: Album artwork' : ''}

Generated: ${new Date().toISOString()}
`;
            archive.append(readme, { name: "README.txt" });

            archive.finalize();
          }).catch(reject);
        }).catch(reject);
      });

      // Upload ZIP to storageService
      const zipBuffer = await fsPromises.readFile(tempZipPath);
      const zipFilename = `distribution_${packageId}_${Date.now()}.zip`;
      const zipKey = await storageService.uploadFile(
        zipBuffer,
        'exports',
        zipFilename,
        'application/zip'
      );

      logger.info(`✅ Distribution package uploaded: ${zipKey}`);
      
      return zipKey;
    } catch (error: unknown) {
      logger.error("Error packaging ZIP:", error);
      throw new Error("Failed to package distribution files");
    } finally {
      // Clean up temp file
      try {
        await fsPromises.unlink(tempZipPath);
      } catch (error: unknown) {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Get distribution package by project ID
   */
  async getDistributionPackageByProject(projectId: string): Promise<DistributionPackage | undefined> {
    try {
      return await storage.getDistributionPackage(projectId);
    } catch (error: unknown) {
      logger.error("Error getting distribution package:", error);
      throw new Error("Failed to get distribution package");
    }
  }

  /**
   * Update distribution package
   */
  async updateDistributionPackage(packageId: string, updates: Partial<DistributionPackage>): Promise<DistributionPackage> {
    try {
      // Validate UPC if being updated
      if (updates.upc && !this.validateUPC(updates.upc)) {
        throw new Error("Invalid UPC format. Must be 12-13 digits.");
      }

      return await storage.updateDistributionPackage(packageId, updates);
    } catch (error: unknown) {
      logger.error("Error updating distribution package:", error);
      throw new Error("Failed to update distribution package");
    }
  }

  /**
   * Add track to distribution package
   */
  async addPackageTrack(track: InsertDistributionTrack): Promise<DistributionTrack> {
    try {
      // Validate ISRC if provided
      if (track.isrc && !this.validateISRC(track.isrc)) {
        throw new Error("Invalid ISRC format. Expected: CC-XXX-YY-NNNNN");
      }

      return await storage.createDistributionTrack(track);
    } catch (error: unknown) {
      logger.error("Error adding package track:", error);
      throw new Error("Failed to add track to package");
    }
  }

  /**
   * Get all tracks for a distribution package
   */
  async getPackageTracks(packageId: string): Promise<DistributionTrack[]> {
    try {
      return await storage.getPackageTracks(packageId);
    } catch (error: unknown) {
      logger.error("Error getting package tracks:", error);
      throw new Error("Failed to get package tracks");
    }
  }

  /**
   * Refresh release status from LabelGrid or demo mode
   */
  async refreshReleaseStatus(releaseId: string): Promise<{
    status: string;
    platforms: Array<{ platform: string; status: string; liveDate?: Date }>;
    lastChecked: Date;
  }> {
    try {
      const release = await storage.getDistroRelease(releaseId);
      if (!release) {
        throw new Error("Release not found");
      }

      if (labelGridService.isConfigured()) {
        try {
          const status = await labelGridService.getDeliveryStatus(releaseId);
          return {
            status: status.status || 'pending',
            platforms: status.platforms?.map((p: any) => ({
              platform: p.platform,
              status: p.status,
              liveDate: p.liveDate ? new Date(p.liveDate) : undefined,
            })) || [],
            lastChecked: new Date(),
          };
        } catch (error: unknown) {
          logger.error("Error fetching status from LabelGrid:", error);
        }
      }

      const currentPlatforms = (release.platforms as any[]) || [];
      return {
        status: release.status || 'draft',
        platforms: currentPlatforms.map((p: any) => ({
          platform: typeof p === 'string' ? p : p.platform || p.name,
          status: p.status || 'pending',
          liveDate: p.liveDate ? new Date(p.liveDate) : undefined,
        })),
        lastChecked: new Date(),
      };
    } catch (error: unknown) {
      logger.error("Error refreshing release status:", error);
      throw new Error("Failed to refresh release status");
    }
  }

  // ============================================================================
  // SLA METRICS TRACKING (Production delivery 1-2 day targets)
  // ============================================================================

  /**
   * Create SLA metric for distribution tracking
   */
  async createSLAMetric(releaseId: string, platform: string): Promise<DistributionSLAMetric> {
    try {
      const submittedAt = new Date();
      const targetDeliveryAt = new Date(submittedAt.getTime() + DEFAULT_SLA_TARGET_HOURS * 60 * 60 * 1000);

      const metric = await storage.createDistributionSLAMetric({
        releaseId,
        platform,
        submittedAt,
        targetDeliveryAt,
        slaTargetHours: DEFAULT_SLA_TARGET_HOURS,
        status: 'pending',
        deliveryPhase: 'queued',
      });

      logger.info(`✅ SLA metric created for ${platform}: target ${DEFAULT_SLA_TARGET_HOURS}h delivery`);
      return metric;
    } catch (error: unknown) {
      logger.error("Error creating SLA metric:", error);
      throw new Error("Failed to create SLA metric");
    }
  }

  /**
   * Update SLA metric when delivery is confirmed
   */
  async markDelivered(metricId: string, liveAt?: Date): Promise<DistributionSLAMetric> {
    try {
      const metric = await storage.getDistributionSLAMetric(metricId);
      if (!metric) {
        throw new Error("SLA metric not found");
      }

      const actualDeliveryAt = new Date();
      const deliveryHours = (actualDeliveryAt.getTime() - metric.submittedAt.getTime()) / (1000 * 60 * 60);
      const metSLA = deliveryHours <= (metric.slaTargetHours || DEFAULT_SLA_TARGET_HOURS);

      const updated = await storage.updateDistributionSLAMetric(metricId, {
        actualDeliveryAt,
        liveAt: liveAt || actualDeliveryAt,
        actualDeliveryHours: deliveryHours,
        metSLA,
        status: 'delivered',
        deliveryPhase: 'live',
      });

      logger.info(`✅ Delivery confirmed: ${deliveryHours.toFixed(1)}h (SLA ${metSLA ? 'MET' : 'MISSED'})`);
      return updated;
    } catch (error: unknown) {
      logger.error("Error marking delivery:", error);
      throw new Error("Failed to mark delivery");
    }
  }

  /**
   * Get SLA metrics for a release
   */
  async getReleaseSLAMetrics(releaseId: string): Promise<DistributionSLAMetric[]> {
    try {
      return await storage.getDistributionSLAMetricsByRelease(releaseId);
    } catch (error: unknown) {
      logger.error("Error fetching SLA metrics:", error);
      throw new Error("Failed to fetch SLA metrics");
    }
  }

  /**
   * Get SLA compliance report
   */
  async getSLAComplianceReport(userId: string, days: number = 30): Promise<{
    totalDeliveries: number;
    onTimeDeliveries: number;
    lateDeliveries: number;
    averageDeliveryHours: number;
    complianceRate: number;
    byPlatform: Record<string, { total: number; onTime: number; rate: number }>;
  }> {
    try {
      const metrics = await storage.getSLAMetricsByUser(userId, days);
      
      const completed = metrics.filter(m => m.actualDeliveryAt);
      const onTime = completed.filter(m => m.metSLA);
      
      const avgHours = completed.length > 0
        ? completed.reduce((sum, m) => sum + (m.actualDeliveryHours || 0), 0) / completed.length
        : 0;

      const byPlatform: Record<string, { total: number; onTime: number; rate: number }> = {};
      for (const m of completed) {
        if (!byPlatform[m.platform]) {
          byPlatform[m.platform] = { total: 0, onTime: 0, rate: 0 };
        }
        byPlatform[m.platform].total++;
        if (m.metSLA) byPlatform[m.platform].onTime++;
      }
      
      for (const platform of Object.keys(byPlatform)) {
        byPlatform[platform].rate = (byPlatform[platform].onTime / byPlatform[platform].total) * 100;
      }

      return {
        totalDeliveries: completed.length,
        onTimeDeliveries: onTime.length,
        lateDeliveries: completed.length - onTime.length,
        averageDeliveryHours: Math.round(avgHours * 10) / 10,
        complianceRate: completed.length > 0 ? (onTime.length / completed.length) * 100 : 100,
        byPlatform,
      };
    } catch (error: unknown) {
      logger.error("Error generating SLA report:", error);
      throw new Error("Failed to generate SLA report");
    }
  }

  /**
   * Retry failed delivery
   */
  async retryDelivery(metricId: string): Promise<DistributionSLAMetric> {
    try {
      const metric = await storage.getDistributionSLAMetric(metricId);
      if (!metric) {
        throw new Error("SLA metric not found");
      }

      const updated = await storage.updateDistributionSLAMetric(metricId, {
        status: 'pending',
        deliveryPhase: 'retrying',
        retryCount: (metric.retryCount || 0) + 1,
        lastRetryAt: new Date(),
        errorMessage: null,
      });

      logger.info(`🔄 Retry initiated for ${metric.platform} (attempt ${updated.retryCount})`);
      return updated;
    } catch (error: unknown) {
      logger.error("Error retrying delivery:", error);
      throw new Error("Failed to retry delivery");
    }
  }

  // ============================================================================
  // CONTENT ID REGISTRATION (YouTube monetization)
  // ============================================================================

  /**
   * Register track for Content ID (YouTube monetization)
   */
  async registerContentId(data: {
    releaseId: string;
    trackId: string;
    userId: string;
    isrc: string;
    registrationType?: 'sound_recording' | 'composition';
    ownershipPercentage?: number;
    territories?: string[];
    matchPolicy?: 'monetize' | 'track' | 'block';
    claimPolicy?: 'monetize' | 'track' | 'block';
    allowUserUploads?: boolean;
    youtubeChannelId?: string;
  }): Promise<ContentIdRegistration> {
    try {
      const registration = await storage.createContentIdRegistration({
        releaseId: data.releaseId,
        trackId: data.trackId,
        userId: data.userId,
        isrc: data.isrc,
        registrationType: data.registrationType || 'sound_recording',
        ownershipPercentage: data.ownershipPercentage || 100,
        territories: data.territories || ['WORLDWIDE'],
        matchPolicy: data.matchPolicy || 'monetize',
        claimPolicy: data.claimPolicy || 'monetize',
        allowUserUploads: data.allowUserUploads || false,
        youtubeChannelId: data.youtubeChannelId,
        status: 'pending',
        submittedAt: new Date(),
      });

      logger.info(`✅ Content ID registration submitted for ISRC: ${data.isrc}`);
      return registration;
    } catch (error: unknown) {
      logger.error("Error registering Content ID:", error);
      throw new Error("Failed to register Content ID");
    }
  }

  /**
   * Get Content ID registrations for a release
   */
  async getContentIdRegistrations(releaseId: string): Promise<ContentIdRegistration[]> {
    try {
      return await storage.getContentIdRegistrationsByRelease(releaseId);
    } catch (error: unknown) {
      logger.error("Error fetching Content ID registrations:", error);
      throw new Error("Failed to fetch Content ID registrations");
    }
  }

  /**
   * Update Content ID registration status
   */
  async updateContentIdStatus(registrationId: string, data: {
    status?: string;
    assetId?: string;
    approvedAt?: Date;
    activeAt?: Date;
    errorMessage?: string;
  }): Promise<ContentIdRegistration> {
    try {
      return await storage.updateContentIdRegistration(registrationId, data);
    } catch (error: unknown) {
      logger.error("Error updating Content ID status:", error);
      throw new Error("Failed to update Content ID status");
    }
  }

  /**
   * Get Content ID revenue summary
   */
  async getContentIdRevenue(userId: string): Promise<{
    totalClaims: number;
    totalRevenue: number;
    byTrack: Array<{ trackId: string; isrc: string; claims: number; revenue: number }>;
  }> {
    try {
      const registrations = await storage.getContentIdRegistrationsByUser(userId);
      
      const byTrack = registrations.map(r => ({
        trackId: r.trackId,
        isrc: r.isrc,
        claims: r.totalClaims || 0,
        revenue: r.totalRevenue || 0,
      }));

      return {
        totalClaims: registrations.reduce((sum, r) => sum + (r.totalClaims || 0), 0),
        totalRevenue: registrations.reduce((sum, r) => sum + (r.totalRevenue || 0), 0),
        byTrack,
      };
    } catch (error: unknown) {
      logger.error("Error fetching Content ID revenue:", error);
      throw new Error("Failed to fetch Content ID revenue");
    }
  }

  // ============================================================================
  // SYNC LICENSING (Film/TV/Ads)
  // ============================================================================

  /**
   * Create or update sync license for a track/release
   */
  async createSyncLicense(data: InsertSyncLicense): Promise<SyncLicense> {
    try {
      const license = await storage.createSyncLicense(data);
      logger.info(`✅ Sync license created for release: ${data.releaseId}`);
      return license;
    } catch (error: unknown) {
      logger.error("Error creating sync license:", error);
      throw new Error("Failed to create sync license");
    }
  }

  /**
   * Get sync license for a release/track
   */
  async getSyncLicense(releaseId: string, trackId?: string): Promise<SyncLicense | undefined> {
    try {
      return await storage.getSyncLicense(releaseId, trackId);
    } catch (error: unknown) {
      logger.error("Error fetching sync license:", error);
      throw new Error("Failed to fetch sync license");
    }
  }

  /**
   * Update sync license settings
   */
  async updateSyncLicense(licenseId: string, updates: Partial<InsertSyncLicense>): Promise<SyncLicense> {
    try {
      return await storage.updateSyncLicense(licenseId, updates);
    } catch (error: unknown) {
      logger.error("Error updating sync license:", error);
      throw new Error("Failed to update sync license");
    }
  }

  /**
   * Submit sync license inquiry
   */
  async submitSyncInquiry(data: InsertSyncLicenseInquiry): Promise<SyncLicenseInquiry> {
    try {
      const inquiry = await storage.createSyncLicenseInquiry(data);
      
      // Update inquiry count on license
      await storage.incrementSyncLicenseInquiries(data.syncLicenseId);
      
      logger.info(`📩 Sync inquiry received from ${data.inquirerEmail}`);
      return inquiry;
    } catch (error: unknown) {
      logger.error("Error submitting sync inquiry:", error);
      throw new Error("Failed to submit sync inquiry");
    }
  }

  /**
   * Get sync inquiries for a user
   */
  async getSyncInquiries(userId: string): Promise<SyncLicenseInquiry[]> {
    try {
      return await storage.getSyncInquiriesByUser(userId);
    } catch (error: unknown) {
      logger.error("Error fetching sync inquiries:", error);
      throw new Error("Failed to fetch sync inquiries");
    }
  }

  /**
   * Respond to sync inquiry
   */
  async respondToSyncInquiry(inquiryId: string, response: {
    status: 'approved' | 'rejected' | 'negotiating';
    responseNotes?: string;
  }): Promise<SyncLicenseInquiry> {
    try {
      return await storage.updateSyncLicenseInquiry(inquiryId, {
        status: response.status,
        responseNotes: response.responseNotes,
        respondedAt: new Date(),
      });
    } catch (error: unknown) {
      logger.error("Error responding to sync inquiry:", error);
      throw new Error("Failed to respond to sync inquiry");
    }
  }

  // ============================================================================
  // ROYALTY SPLIT MANAGEMENT
  // ============================================================================

  /**
   * Create royalty split for a release
   */
  async createRoyaltySplit(data: InsertRoyaltySplit): Promise<RoyaltySplit> {
    try {
      // Validate that total splits don't exceed 100%
      const existingSplits = await storage.getRoyaltySplitsByRelease(data.releaseId, data.trackId);
      const totalExisting = existingSplits.reduce((sum, s) => sum + s.percentage, 0);
      
      if (totalExisting + data.percentage > 100) {
        throw new Error(`Total splits cannot exceed 100%. Current: ${totalExisting}%, Adding: ${data.percentage}%`);
      }

      const split = await storage.createRoyaltySplit({
        ...data,
        status: 'pending',
        inviteSentAt: new Date(),
      });

      logger.info(`✅ Royalty split created: ${data.collaboratorName} (${data.percentage}%)`);
      return split;
    } catch (error: unknown) {
      logger.error("Error creating royalty split:", error);
      throw new Error(error instanceof Error ? error.message : "Failed to create royalty split");
    }
  }

  /**
   * Get all royalty splits for a release
   */
  async getRoyaltySplits(releaseId: string, trackId?: string): Promise<RoyaltySplit[]> {
    try {
      return await storage.getRoyaltySplitsByRelease(releaseId, trackId);
    } catch (error: unknown) {
      logger.error("Error fetching royalty splits:", error);
      throw new Error("Failed to fetch royalty splits");
    }
  }

  /**
   * Update royalty split
   */
  async updateRoyaltySplit(splitId: string, updates: Partial<InsertRoyaltySplit>): Promise<RoyaltySplit> {
    try {
      if (updates.percentage !== undefined) {
        const split = await storage.getRoyaltySplit(splitId);
        if (!split) throw new Error("Split not found");

        const otherSplits = await storage.getRoyaltySplitsByRelease(split.releaseId, split.trackId);
        const otherTotal = otherSplits
          .filter(s => s.id !== splitId)
          .reduce((sum, s) => sum + s.percentage, 0);

        if (otherTotal + updates.percentage > 100) {
          throw new Error(`Total splits cannot exceed 100%. Others: ${otherTotal}%, New: ${updates.percentage}%`);
        }
      }

      return await storage.updateRoyaltySplit(splitId, updates);
    } catch (error: unknown) {
      logger.error("Error updating royalty split:", error);
      throw new Error(error instanceof Error ? error.message : "Failed to update royalty split");
    }
  }

  /**
   * Accept royalty split invite
   */
  async acceptRoyaltySplit(splitId: string, userId: string, payoutDetails: {
    payoutMethod: 'stripe' | 'paypal' | 'bank';
    stripeAccountId?: string;
    paypalEmail?: string;
    bankDetails?: Record<string, any>;
  }): Promise<RoyaltySplit> {
    try {
      return await storage.updateRoyaltySplit(splitId, {
        userId,
        status: 'accepted',
        inviteAcceptedAt: new Date(),
        payoutMethod: payoutDetails.payoutMethod,
        stripeAccountId: payoutDetails.stripeAccountId,
        paypalEmail: payoutDetails.paypalEmail,
        bankDetails: payoutDetails.bankDetails,
      });
    } catch (error: unknown) {
      logger.error("Error accepting royalty split:", error);
      throw new Error("Failed to accept royalty split");
    }
  }

  /**
   * Remove royalty split
   */
  async removeRoyaltySplit(splitId: string): Promise<void> {
    try {
      await storage.deleteRoyaltySplit(splitId);
      logger.info(`🗑️ Royalty split removed: ${splitId}`);
    } catch (error: unknown) {
      logger.error("Error removing royalty split:", error);
      throw new Error("Failed to remove royalty split");
    }
  }

  /**
   * Calculate royalty distribution for earnings
   */
  async calculateRoyaltyDistribution(releaseId: string, totalEarnings: number, periodStart: Date, periodEnd: Date): Promise<{
    distributions: Array<{ splitId: string; collaboratorName: string; amount: number; percentage: number }>;
    totalDistributed: number;
  }> {
    try {
      const splits = await storage.getRoyaltySplitsByRelease(releaseId);
      
      const distributions = splits.map(split => ({
        splitId: split.id,
        collaboratorName: split.collaboratorName,
        percentage: split.percentage,
        amount: (totalEarnings * split.percentage) / 100,
      }));

      const totalDistributed = distributions.reduce((sum, d) => sum + d.amount, 0);

      return { distributions, totalDistributed };
    } catch (error: unknown) {
      logger.error("Error calculating royalty distribution:", error);
      throw new Error("Failed to calculate royalty distribution");
    }
  }

  /**
   * Record royalty transaction
   */
  async recordRoyaltyTransaction(data: InsertRoyaltyTransaction): Promise<RoyaltyTransaction> {
    try {
      const transaction = await storage.createRoyaltyTransaction(data);
      
      // Update split totals
      const split = await storage.getRoyaltySplit(data.splitId);
      if (split) {
        await storage.updateRoyaltySplit(data.splitId, {
          totalEarned: (split.totalEarned || 0) + data.amount,
          pendingPayout: (split.pendingPayout || 0) + data.amount,
        });
      }

      return transaction;
    } catch (error: unknown) {
      logger.error("Error recording royalty transaction:", error);
      throw new Error("Failed to record royalty transaction");
    }
  }

  /**
   * Get royalty transaction history
   */
  async getRoyaltyTransactions(splitId: string): Promise<RoyaltyTransaction[]> {
    try {
      return await storage.getRoyaltyTransactionsBySplit(splitId);
    } catch (error: unknown) {
      logger.error("Error fetching royalty transactions:", error);
      throw new Error("Failed to fetch royalty transactions");
    }
  }

  // ============================================================================
  // PRE-SAVE CAMPAIGNS (Enhanced)
  // ============================================================================

  /**
   * Create pre-save campaign
   */
  async createPreSaveCampaign(data: InsertPreSaveCampaign): Promise<PreSaveCampaign> {
    try {
      const slug = data.slug || `${data.name.toLowerCase().replace(/\s+/g, '-')}-${nanoid(6)}`;
      
      const campaign = await storage.createPreSaveCampaign({
        ...data,
        slug,
        status: 'active',
        totalSaves: 0,
        spotifySaves: 0,
        appleMusicSaves: 0,
        deezerSaves: 0,
        emailSignups: 0,
      });

      logger.info(`✅ Pre-save campaign created: ${campaign.name}`);
      return campaign;
    } catch (error: unknown) {
      logger.error("Error creating pre-save campaign:", error);
      throw new Error("Failed to create pre-save campaign");
    }
  }

  /**
   * Get pre-save campaign by slug
   */
  async getPreSaveCampaignBySlug(slug: string): Promise<PreSaveCampaign | undefined> {
    try {
      return await storage.getPreSaveCampaignBySlug(slug);
    } catch (error: unknown) {
      logger.error("Error fetching pre-save campaign:", error);
      throw new Error("Failed to fetch pre-save campaign");
    }
  }

  /**
   * Get pre-save campaigns for a user
   */
  async getUserPreSaveCampaigns(userId: string): Promise<PreSaveCampaign[]> {
    try {
      return await storage.getPreSaveCampaignsByUser(userId);
    } catch (error: unknown) {
      logger.error("Error fetching pre-save campaigns:", error);
      throw new Error("Failed to fetch pre-save campaigns");
    }
  }

  /**
   * Record pre-save entry
   */
  async recordPreSave(data: InsertPreSaveEntry): Promise<PreSaveEntry> {
    try {
      const entry = await storage.createPreSaveEntry(data);
      
      // Update campaign counters
      const campaign = await storage.getPreSaveCampaign(data.campaignId);
      if (campaign) {
        const updates: Partial<PreSaveCampaign> = {
          totalSaves: (campaign.totalSaves || 0) + 1,
        };

        if (data.platform === 'spotify') {
          updates.spotifySaves = (campaign.spotifySaves || 0) + 1;
        } else if (data.platform === 'apple_music') {
          updates.appleMusicSaves = (campaign.appleMusicSaves || 0) + 1;
        } else if (data.platform === 'deezer') {
          updates.deezerSaves = (campaign.deezerSaves || 0) + 1;
        }

        if (data.email) {
          updates.emailSignups = (campaign.emailSignups || 0) + 1;
        }

        // Calculate conversion rate
        const totalSaves = (updates.totalSaves || campaign.totalSaves || 0);
        const pageViews = (campaign.metadata as any)?.pageViews || 1;
        updates.conversionRate = (totalSaves / pageViews) * 100;

        await storage.updatePreSaveCampaign(data.campaignId, updates);
      }

      logger.info(`✅ Pre-save recorded: ${data.platform}`);
      return entry;
    } catch (error: unknown) {
      logger.error("Error recording pre-save:", error);
      throw new Error("Failed to record pre-save");
    }
  }

  /**
   * Get pre-save entries for a campaign
   */
  async getPreSaveEntries(campaignId: string): Promise<PreSaveEntry[]> {
    try {
      return await storage.getPreSaveEntriesByCampaign(campaignId);
    } catch (error: unknown) {
      logger.error("Error fetching pre-save entries:", error);
      throw new Error("Failed to fetch pre-save entries");
    }
  }

  /**
   * Get pre-save campaign analytics
   */
  async getPreSaveCampaignAnalytics(campaignId: string): Promise<{
    totalSaves: number;
    byPlatform: Record<string, number>;
    byCountry: Record<string, number>;
    bySource: Record<string, number>;
    emailSignups: number;
    conversionRate: number;
    timeline: Array<{ date: string; saves: number }>;
  }> {
    try {
      const campaign = await storage.getPreSaveCampaign(campaignId);
      if (!campaign) {
        throw new Error("Campaign not found");
      }

      const entries = await storage.getPreSaveEntriesByCampaign(campaignId);

      const byPlatform: Record<string, number> = {};
      const byCountry: Record<string, number> = {};
      const bySource: Record<string, number> = {};
      const byDate: Record<string, number> = {};

      for (const entry of entries) {
        byPlatform[entry.platform] = (byPlatform[entry.platform] || 0) + 1;
        
        if (entry.country) {
          byCountry[entry.country] = (byCountry[entry.country] || 0) + 1;
        }
        
        const source = entry.utmSource || 'direct';
        bySource[source] = (bySource[source] || 0) + 1;

        if (entry.createdAt) {
          const date = entry.createdAt.toISOString().split('T')[0];
          byDate[date] = (byDate[date] || 0) + 1;
        }
      }

      const timeline = Object.entries(byDate)
        .map(([date, saves]) => ({ date, saves }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return {
        totalSaves: campaign.totalSaves || 0,
        byPlatform,
        byCountry,
        bySource,
        emailSignups: campaign.emailSignups || 0,
        conversionRate: campaign.conversionRate || 0,
        timeline,
      };
    } catch (error: unknown) {
      logger.error("Error fetching campaign analytics:", error);
      throw new Error("Failed to fetch campaign analytics");
    }
  }

  /**
   * Update pre-save campaign
   */
  async updatePreSaveCampaign(campaignId: string, updates: Partial<InsertPreSaveCampaign>): Promise<PreSaveCampaign> {
    try {
      return await storage.updatePreSaveCampaign(campaignId, updates);
    } catch (error: unknown) {
      logger.error("Error updating pre-save campaign:", error);
      throw new Error("Failed to update pre-save campaign");
    }
  }

  /**
   * End pre-save campaign (convert to live release)
   */
  async endPreSaveCampaign(campaignId: string): Promise<PreSaveCampaign> {
    try {
      return await storage.updatePreSaveCampaign(campaignId, {
        status: 'completed',
        endDate: new Date(),
      });
    } catch (error: unknown) {
      logger.error("Error ending pre-save campaign:", error);
      throw new Error("Failed to end pre-save campaign");
    }
  }
}

export const distributionService = new DistributionService();
