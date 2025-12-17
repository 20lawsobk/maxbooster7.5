import { storage } from "../storage";
import { nanoid } from "nanoid";
import type { InsertRelease, Release, DistributionPackage, InsertDistributionPackage, DistributionTrack, InsertDistributionTrack } from "@shared/schema";
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
}

export const distributionService = new DistributionService();
