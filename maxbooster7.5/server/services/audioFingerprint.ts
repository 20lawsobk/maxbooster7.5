import { logger } from '../logger.js';
import { nanoid } from 'nanoid';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface AudioFingerprint {
  id: string;
  releaseId: string;
  trackId: string;
  fingerprint: string;
  duration: number;
  sampleRate: number;
  channels: number;
  algorithm: 'chromaprint' | 'acoustid' | 'maxbooster';
  createdAt: Date;
  metadata?: {
    title?: string;
    artist?: string;
    isrc?: string;
  };
}

export interface SimilarityResult {
  trackId: string;
  releaseId: string;
  score: number;
  matchType: 'exact' | 'near_duplicate' | 'similar' | 'partial' | 'no_match';
  matchedSegments?: {
    sourceStart: number;
    sourceEnd: number;
    matchStart: number;
    matchEnd: number;
    confidence: number;
  }[];
  metadata?: {
    title?: string;
    artist?: string;
    isrc?: string;
  };
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  confidence: number;
  matches: SimilarityResult[];
  warnings: PlagiarismWarning[];
  checkedAt: Date;
}

export interface PlagiarismWarning {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'exact_match' | 'substantial_similarity' | 'melodic_similarity' | 'structural_similarity' | 'sample_detected';
  message: string;
  matchedTrack?: {
    trackId: string;
    title: string;
    artist: string;
    isrc?: string;
  };
  matchedSegments?: {
    start: number;
    end: number;
  };
  confidence: number;
  recommendation: string;
}

export interface FingerprintOptions {
  algorithm?: 'chromaprint' | 'acoustid' | 'maxbooster';
  segmentLength?: number;
  overlapRatio?: number;
  frequencyBands?: number;
}

const SIMILARITY_THRESHOLDS = {
  exact: 0.98,
  nearDuplicate: 0.90,
  similar: 0.75,
  partial: 0.50
};

const PLAGIARISM_THRESHOLDS = {
  critical: 0.95,
  high: 0.85,
  medium: 0.70,
  low: 0.55
};

export class AudioFingerprintService {
  private fingerprintStore: Map<string, AudioFingerprint> = new Map();
  private releaseIndex: Map<string, string[]> = new Map();
  private hashIndex: Map<string, string[]> = new Map();

  async generateFingerprint(
    audioPath: string,
    trackId: string,
    releaseId: string,
    options: FingerprintOptions = {}
  ): Promise<AudioFingerprint> {
    try {
      if (!fs.existsSync(audioPath)) {
        throw new Error(`Audio file not found: ${audioPath}`);
      }

      const stats = fs.statSync(audioPath);
      const algorithm = options.algorithm || 'maxbooster';
      
      const fingerprintData = await this.computeFingerprint(audioPath, options);
      
      const fingerprint: AudioFingerprint = {
        id: `fp_${nanoid()}`,
        releaseId,
        trackId,
        fingerprint: fingerprintData.hash,
        duration: fingerprintData.duration,
        sampleRate: fingerprintData.sampleRate,
        channels: fingerprintData.channels,
        algorithm,
        createdAt: new Date(),
        metadata: fingerprintData.metadata
      };

      this.storeFingerprint(fingerprint);
      
      logger.info(`Generated fingerprint ${fingerprint.id} for track ${trackId}`);
      
      return fingerprint;
    } catch (error) {
      logger.error('Error generating audio fingerprint:', error);
      throw new Error('Failed to generate audio fingerprint');
    }
  }

  private async computeFingerprint(
    audioPath: string,
    options: FingerprintOptions
  ): Promise<{
    hash: string;
    duration: number;
    sampleRate: number;
    channels: number;
    metadata?: any;
  }> {
    const fileBuffer = fs.readFileSync(audioPath);
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    
    const segmentHashes: string[] = [];
    const segmentSize = 4096;
    
    for (let i = 0; i < fileBuffer.length; i += segmentSize) {
      const segment = fileBuffer.slice(i, Math.min(i + segmentSize, fileBuffer.length));
      const segmentHash = crypto.createHash('md5').update(segment).digest('hex').substring(0, 8);
      segmentHashes.push(segmentHash);
    }
    
    const combinedFingerprint = segmentHashes.join('');
    const finalHash = crypto.createHash('sha256').update(combinedFingerprint).digest('hex');
    
    const stats = fs.statSync(audioPath);
    const estimatedDuration = Math.round(stats.size / 176400);
    
    return {
      hash: finalHash,
      duration: estimatedDuration,
      sampleRate: 44100,
      channels: 2,
      metadata: {}
    };
  }

  private storeFingerprint(fingerprint: AudioFingerprint): void {
    this.fingerprintStore.set(fingerprint.id, fingerprint);
    
    const releaseFingerprints = this.releaseIndex.get(fingerprint.releaseId) || [];
    releaseFingerprints.push(fingerprint.id);
    this.releaseIndex.set(fingerprint.releaseId, releaseFingerprints);
    
    const hashShort = fingerprint.fingerprint.substring(0, 16);
    const hashMatches = this.hashIndex.get(hashShort) || [];
    hashMatches.push(fingerprint.id);
    this.hashIndex.set(hashShort, hashMatches);
  }

  async checkDuplicates(
    audioPath: string,
    trackId: string,
    releaseId: string,
    options: {
      threshold?: number;
      maxResults?: number;
      excludeOwn?: boolean;
    } = {}
  ): Promise<DuplicateCheckResult> {
    try {
      const fingerprint = await this.generateFingerprint(audioPath, trackId, releaseId);
      
      const threshold = options.threshold ?? SIMILARITY_THRESHOLDS.partial;
      const maxResults = options.maxResults ?? 10;
      const excludeOwn = options.excludeOwn ?? true;

      const matches: SimilarityResult[] = [];
      const warnings: PlagiarismWarning[] = [];

      for (const [id, storedFp] of this.fingerprintStore) {
        if (id === fingerprint.id) continue;
        if (excludeOwn && storedFp.releaseId === releaseId) continue;

        const similarity = this.calculateSimilarity(fingerprint.fingerprint, storedFp.fingerprint);
        
        if (similarity >= threshold) {
          const matchType = this.determineMatchType(similarity);
          
          matches.push({
            trackId: storedFp.trackId,
            releaseId: storedFp.releaseId,
            score: similarity,
            matchType,
            metadata: storedFp.metadata
          });

          const warning = this.generatePlagiarismWarning(similarity, storedFp);
          if (warning) {
            warnings.push(warning);
          }
        }
      }

      matches.sort((a, b) => b.score - a.score);
      const topMatches = matches.slice(0, maxResults);

      const isDuplicate = topMatches.some(m => m.matchType === 'exact' || m.matchType === 'near_duplicate');
      const confidence = topMatches.length > 0 ? topMatches[0].score : 0;

      return {
        isDuplicate,
        confidence,
        matches: topMatches,
        warnings: warnings.sort((a, b) => {
          const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
          return severityOrder[a.severity] - severityOrder[b.severity];
        }),
        checkedAt: new Date()
      };
    } catch (error) {
      logger.error('Error checking duplicates:', error);
      throw new Error('Failed to check for duplicates');
    }
  }

  private calculateSimilarity(hash1: string, hash2: string): number {
    if (hash1 === hash2) return 1.0;
    
    let matchingChars = 0;
    const minLength = Math.min(hash1.length, hash2.length);
    
    for (let i = 0; i < minLength; i++) {
      if (hash1[i] === hash2[i]) {
        matchingChars++;
      }
    }
    
    const baseSimilarity = matchingChars / minLength;
    
    const blocks1 = this.splitIntoBlocks(hash1, 8);
    const blocks2 = this.splitIntoBlocks(hash2, 8);
    
    let matchingBlocks = 0;
    for (const block of blocks1) {
      if (blocks2.includes(block)) {
        matchingBlocks++;
      }
    }
    
    const blockSimilarity = matchingBlocks / Math.max(blocks1.length, blocks2.length);
    
    return (baseSimilarity * 0.4 + blockSimilarity * 0.6);
  }

  private splitIntoBlocks(str: string, blockSize: number): string[] {
    const blocks: string[] = [];
    for (let i = 0; i < str.length; i += blockSize) {
      blocks.push(str.substring(i, i + blockSize));
    }
    return blocks;
  }

  private determineMatchType(similarity: number): SimilarityResult['matchType'] {
    if (similarity >= SIMILARITY_THRESHOLDS.exact) return 'exact';
    if (similarity >= SIMILARITY_THRESHOLDS.nearDuplicate) return 'near_duplicate';
    if (similarity >= SIMILARITY_THRESHOLDS.similar) return 'similar';
    if (similarity >= SIMILARITY_THRESHOLDS.partial) return 'partial';
    return 'no_match';
  }

  private generatePlagiarismWarning(
    similarity: number,
    matchedFingerprint: AudioFingerprint
  ): PlagiarismWarning | null {
    if (similarity < PLAGIARISM_THRESHOLDS.low) return null;

    let severity: PlagiarismWarning['severity'];
    let type: PlagiarismWarning['type'];
    let recommendation: string;

    if (similarity >= PLAGIARISM_THRESHOLDS.critical) {
      severity = 'critical';
      type = 'exact_match';
      recommendation = 'This appears to be an exact or near-exact copy. Do not proceed with distribution without verifying rights.';
    } else if (similarity >= PLAGIARISM_THRESHOLDS.high) {
      severity = 'high';
      type = 'substantial_similarity';
      recommendation = 'Substantial similarity detected. Review the content for potential copyright issues.';
    } else if (similarity >= PLAGIARISM_THRESHOLDS.medium) {
      severity = 'medium';
      type = 'melodic_similarity';
      recommendation = 'Notable similarity found. Consider reviewing for unintentional similarities.';
    } else {
      severity = 'low';
      type = 'structural_similarity';
      recommendation = 'Minor similarity detected. This may be coincidental but worth noting.';
    }

    return {
      id: `warn_${nanoid()}`,
      severity,
      type,
      message: `${Math.round(similarity * 100)}% similarity detected with existing content`,
      matchedTrack: {
        trackId: matchedFingerprint.trackId,
        title: matchedFingerprint.metadata?.title || 'Unknown',
        artist: matchedFingerprint.metadata?.artist || 'Unknown',
        isrc: matchedFingerprint.metadata?.isrc
      },
      confidence: similarity,
      recommendation
    };
  }

  async compareTracks(
    trackId1: string,
    trackId2: string
  ): Promise<SimilarityResult | null> {
    let fp1: AudioFingerprint | undefined;
    let fp2: AudioFingerprint | undefined;

    for (const fp of this.fingerprintStore.values()) {
      if (fp.trackId === trackId1) fp1 = fp;
      if (fp.trackId === trackId2) fp2 = fp;
    }

    if (!fp1 || !fp2) {
      return null;
    }

    const similarity = this.calculateSimilarity(fp1.fingerprint, fp2.fingerprint);

    return {
      trackId: trackId2,
      releaseId: fp2.releaseId,
      score: similarity,
      matchType: this.determineMatchType(similarity),
      metadata: fp2.metadata
    };
  }

  async findSimilarTracks(
    trackId: string,
    options: {
      threshold?: number;
      maxResults?: number;
    } = {}
  ): Promise<SimilarityResult[]> {
    const threshold = options.threshold ?? SIMILARITY_THRESHOLDS.partial;
    const maxResults = options.maxResults ?? 10;

    let sourceFingerprint: AudioFingerprint | undefined;
    for (const fp of this.fingerprintStore.values()) {
      if (fp.trackId === trackId) {
        sourceFingerprint = fp;
        break;
      }
    }

    if (!sourceFingerprint) {
      return [];
    }

    const matches: SimilarityResult[] = [];

    for (const fp of this.fingerprintStore.values()) {
      if (fp.trackId === trackId) continue;

      const similarity = this.calculateSimilarity(sourceFingerprint.fingerprint, fp.fingerprint);
      
      if (similarity >= threshold) {
        matches.push({
          trackId: fp.trackId,
          releaseId: fp.releaseId,
          score: similarity,
          matchType: this.determineMatchType(similarity),
          metadata: fp.metadata
        });
      }
    }

    return matches
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }

  getFingerprint(fingerprintId: string): AudioFingerprint | undefined {
    return this.fingerprintStore.get(fingerprintId);
  }

  getFingerprintByTrack(trackId: string): AudioFingerprint | undefined {
    for (const fp of this.fingerprintStore.values()) {
      if (fp.trackId === trackId) {
        return fp;
      }
    }
    return undefined;
  }

  getFingerprintsByRelease(releaseId: string): AudioFingerprint[] {
    const fingerprintIds = this.releaseIndex.get(releaseId) || [];
    return fingerprintIds
      .map(id => this.fingerprintStore.get(id))
      .filter((fp): fp is AudioFingerprint => fp !== undefined);
  }

  deleteFingerprint(fingerprintId: string): boolean {
    const fingerprint = this.fingerprintStore.get(fingerprintId);
    if (!fingerprint) return false;

    this.fingerprintStore.delete(fingerprintId);

    const releaseFingerprints = this.releaseIndex.get(fingerprint.releaseId);
    if (releaseFingerprints) {
      const index = releaseFingerprints.indexOf(fingerprintId);
      if (index > -1) {
        releaseFingerprints.splice(index, 1);
        this.releaseIndex.set(fingerprint.releaseId, releaseFingerprints);
      }
    }

    const hashShort = fingerprint.fingerprint.substring(0, 16);
    const hashMatches = this.hashIndex.get(hashShort);
    if (hashMatches) {
      const index = hashMatches.indexOf(fingerprintId);
      if (index > -1) {
        hashMatches.splice(index, 1);
        this.hashIndex.set(hashShort, hashMatches);
      }
    }

    logger.info(`Deleted fingerprint ${fingerprintId}`);
    return true;
  }

  deleteFingerprintsByRelease(releaseId: string): number {
    const fingerprintIds = this.releaseIndex.get(releaseId) || [];
    let deletedCount = 0;

    for (const id of fingerprintIds) {
      if (this.deleteFingerprint(id)) {
        deletedCount++;
      }
    }

    this.releaseIndex.delete(releaseId);
    
    logger.info(`Deleted ${deletedCount} fingerprints for release ${releaseId}`);
    return deletedCount;
  }

  getStats(): {
    totalFingerprints: number;
    totalReleases: number;
    storageSize: number;
    indexSize: number;
  } {
    let storageSize = 0;
    for (const fp of this.fingerprintStore.values()) {
      storageSize += fp.fingerprint.length;
    }

    return {
      totalFingerprints: this.fingerprintStore.size,
      totalReleases: this.releaseIndex.size,
      storageSize,
      indexSize: this.hashIndex.size
    };
  }

  exportFingerprints(releaseId?: string): AudioFingerprint[] {
    if (releaseId) {
      return this.getFingerprintsByRelease(releaseId);
    }
    return Array.from(this.fingerprintStore.values());
  }

  importFingerprints(fingerprints: AudioFingerprint[]): number {
    let importedCount = 0;
    
    for (const fp of fingerprints) {
      if (!this.fingerprintStore.has(fp.id)) {
        this.storeFingerprint(fp);
        importedCount++;
      }
    }
    
    logger.info(`Imported ${importedCount} fingerprints`);
    return importedCount;
  }
}

export const audioFingerprintService = new AudioFingerprintService();
