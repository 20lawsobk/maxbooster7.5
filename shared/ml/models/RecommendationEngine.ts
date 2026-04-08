/**
 * Recommendation Engine - In-House ML for Music Recommendations
 * 
 * Provides:
 * - Collaborative filtering for artist/track recommendations
 * - Content-based filtering using audio features
 * - Hybrid approach combining both methods
 * - Similarity scoring between artists/tracks
 * - Playlist generation based on seed tracks
 * - Collaboration matching between artists
 * 
 * 100% in-house, no external APIs
 */

import * as tf from '@tensorflow/tfjs';
import { BaseModel } from './BaseModel.js';
import type { ModelMetadata, TrainingOptions, PredictionResult } from '../types.js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface AudioFeatureVector {
  tempo: number;
  energy: number;
  danceability: number;
  valence: number;
  acousticness: number;
  instrumentalness: number;
  speechiness: number;
  liveness: number;
  loudness: number;
  key: number;
  mode: number;
  timeSignature: number;
}

export interface TrackData {
  id: string;
  artistId: string;
  title: string;
  features: AudioFeatureVector;
  genres: string[];
  plays: number;
  likes: number;
  releaseDate?: Date;
}

export interface ArtistData {
  id: string;
  name: string;
  genres: string[];
  followers: number;
  monthlyListeners: number;
  trackIds: string[];
  collaboratorIds: string[];
  style?: AudioFeatureVector;
}

export interface UserInteraction {
  userId: string;
  itemId: string;
  itemType: 'track' | 'artist';
  interactionType: 'play' | 'like' | 'save' | 'skip' | 'follow';
  timestamp: Date;
  weight: number;
}

export interface SimilarityResult {
  id: string;
  score: number;
  reason: string[];
}

export interface RecommendationResult {
  items: SimilarityResult[];
  method: 'collaborative' | 'content' | 'hybrid';
  confidence: number;
}

export interface PlaylistConfig {
  seedTrackIds: string[];
  targetLength: number;
  diversity: number;
  energyProfile?: 'ascending' | 'descending' | 'peak' | 'steady';
  tempoRange?: { min: number; max: number };
  genres?: string[];
}

export interface GeneratedPlaylist {
  tracks: SimilarityResult[];
  coherenceScore: number;
  diversityScore: number;
  mood: string;
}

export interface CollaboratorMatch {
  artistId: string;
  compatibilityScore: number;
  sharedGenres: string[];
  styleCompatibility: number;
  audienceOverlap: number;
  reasons: string[];
}

export interface MatrixFactorizationModel {
  userFactors: tf.Tensor2D;
  itemFactors: tf.Tensor2D;
  userBias: tf.Tensor1D;
  itemBias: tf.Tensor1D;
  globalBias: number;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;
  
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

function normalizeVector(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
  return norm === 0 ? v : v.map(x => x / norm);
}

function audioFeatureToVector(features: AudioFeatureVector): number[] {
  return [
    features.tempo / 200, // Normalize to 0-1
    features.energy,
    features.danceability,
    features.valence,
    features.acousticness,
    features.instrumentalness,
    features.speechiness,
    features.liveness,
    (features.loudness + 60) / 60, // Normalize from -60 to 0 dB
    features.key / 11, // 0-11 keys
    features.mode, // 0 or 1
    features.timeSignature / 7, // Typically 3-7
  ];
}

function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

// ============================================================================
// RECOMMENDATION ENGINE CLASS
// ============================================================================

export class RecommendationEngine extends BaseModel {
  private tracks: Map<string, TrackData> = new Map();
  private artists: Map<string, ArtistData> = new Map();
  private interactions: UserInteraction[] = [];
  private userItemMatrix: Map<string, Map<string, number>> = new Map();
  private mfModel: MatrixFactorizationModel | null = null;
  private userIdToIndex: Map<string, number> = new Map();
  private itemIdToIndex: Map<string, number> = new Map();
  private indexToItemId: Map<number, string> = new Map();
  private latentFactors: number = 50;

  constructor() {
    super({
      name: 'RecommendationEngine',
      version: '1.0.0',
      type: 'regression',
      inputShape: [12], // Audio feature vector size
      outputShape: [1], // Similarity score
    });
  }

  // ============================================================================
  // BASE MODEL IMPLEMENTATION
  // ============================================================================

  protected buildModel(): tf.LayersModel {
    // Neural collaborative filtering model
    const model = tf.sequential();
    
    // Input embedding layer
    model.add(tf.layers.dense({
      inputShape: [this.latentFactors * 2],
      units: 128,
      activation: 'relu',
      kernelRegularizer: tf.regularizers.l2({ l2: 0.01 }),
    }));
    
    model.add(tf.layers.dropout({ rate: 0.3 }));
    
    model.add(tf.layers.dense({
      units: 64,
      activation: 'relu',
    }));
    
    model.add(tf.layers.dense({
      units: 32,
      activation: 'relu',
    }));
    
    model.add(tf.layers.dense({
      units: 1,
      activation: 'sigmoid',
    }));

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'binaryCrossentropy',
      metrics: ['accuracy'],
    });

    return model;
  }

  protected preprocessInput(input: any): tf.Tensor {
    if (Array.isArray(input)) {
      return tf.tensor2d([input]);
    }
    return tf.tensor2d([[...Object.values(input)]]);
  }

  protected postprocessOutput(output: tf.Tensor): number[] {
    return Array.from(output.dataSync());
  }

  // ============================================================================
  // DATA MANAGEMENT
  // ============================================================================

  public addTrack(track: TrackData): void {
    this.tracks.set(track.id, track);
    this.rebuildIndices();
  }

  public addTracks(tracks: TrackData[]): void {
    tracks.forEach(track => this.tracks.set(track.id, track));
    this.rebuildIndices();
  }

  public addArtist(artist: ArtistData): void {
    this.artists.set(artist.id, artist);
  }

  public addArtists(artists: ArtistData[]): void {
    artists.forEach(artist => this.artists.set(artist.id, artist));
  }

  public recordInteraction(interaction: UserInteraction): void {
    this.interactions.push(interaction);
    this.updateUserItemMatrix(interaction);
  }

  public recordInteractions(interactions: UserInteraction[]): void {
    interactions.forEach(i => this.recordInteraction(i));
  }

  private updateUserItemMatrix(interaction: UserInteraction): void {
    if (!this.userItemMatrix.has(interaction.userId)) {
      this.userItemMatrix.set(interaction.userId, new Map());
    }
    
    const userRow = this.userItemMatrix.get(interaction.userId)!;
    const currentValue = userRow.get(interaction.itemId) || 0;
    
    // Weight by interaction type
    const weights: Record<string, number> = {
      play: 1.0,
      like: 2.0,
      save: 2.5,
      follow: 3.0,
      skip: -0.5,
    };
    
    userRow.set(
      interaction.itemId,
      currentValue + (weights[interaction.interactionType] || 1) * interaction.weight
    );
  }

  private rebuildIndices(): void {
    this.itemIdToIndex.clear();
    this.indexToItemId.clear();
    
    let index = 0;
    for (const trackId of this.tracks.keys()) {
      this.itemIdToIndex.set(trackId, index);
      this.indexToItemId.set(index, trackId);
      index++;
    }
  }

  // ============================================================================
  // MATRIX FACTORIZATION
  // ============================================================================

  public async trainMatrixFactorization(options: TrainingOptions): Promise<void> {
    const numUsers = this.userItemMatrix.size;
    const numItems = this.tracks.size;

    if (numUsers === 0 || numItems === 0) {
      throw new Error('No data available for training');
    }

    // Initialize user index mapping
    let userIndex = 0;
    for (const userId of this.userItemMatrix.keys()) {
      this.userIdToIndex.set(userId, userIndex++);
    }

    // Initialize factors with random values
    const userFactors = tf.randomNormal([numUsers, this.latentFactors], 0, 0.01);
    const itemFactors = tf.randomNormal([numItems, this.latentFactors], 0, 0.01);
    const userBias = tf.zeros([numUsers]);
    const itemBias = tf.zeros([numItems]);

    // Calculate global bias
    let total = 0;
    let count = 0;
    for (const userRow of this.userItemMatrix.values()) {
      for (const value of userRow.values()) {
        total += value;
        count++;
      }
    }
    const globalBias = count > 0 ? total / count : 0;

    // SGD training
    const learningRate = options.learningRate || 0.01;
    const regularization = 0.02;

    let userFactorsData = await userFactors.array() as number[][];
    let itemFactorsData = await itemFactors.array() as number[][];
    let userBiasData = await userBias.array() as number[];
    let itemBiasData = await itemBias.array() as number[];

    for (let epoch = 0; epoch < options.epochs; epoch++) {
      for (const [userId, userRow] of this.userItemMatrix.entries()) {
        const uIdx = this.userIdToIndex.get(userId)!;
        
        for (const [itemId, rating] of userRow.entries()) {
          const iIdx = this.itemIdToIndex.get(itemId);
          if (iIdx === undefined) continue;

          // Calculate prediction
          let prediction = globalBias + userBiasData[uIdx] + itemBiasData[iIdx];
          for (let k = 0; k < this.latentFactors; k++) {
            prediction += userFactorsData[uIdx][k] * itemFactorsData[iIdx][k];
          }

          const error = rating - prediction;

          // Update biases
          userBiasData[uIdx] += learningRate * (error - regularization * userBiasData[uIdx]);
          itemBiasData[iIdx] += learningRate * (error - regularization * itemBiasData[iIdx]);

          // Update factors
          for (let k = 0; k < this.latentFactors; k++) {
            const uFactor = userFactorsData[uIdx][k];
            const iFactor = itemFactorsData[iIdx][k];
            
            userFactorsData[uIdx][k] += learningRate * (error * iFactor - regularization * uFactor);
            itemFactorsData[iIdx][k] += learningRate * (error * uFactor - regularization * iFactor);
          }
        }
      }
    }

    // Store trained model
    this.mfModel = {
      userFactors: tf.tensor2d(userFactorsData),
      itemFactors: tf.tensor2d(itemFactorsData),
      userBias: tf.tensor1d(userBiasData),
      itemBias: tf.tensor1d(itemBiasData),
      globalBias,
    };

    // Clean up initial tensors
    userFactors.dispose();
    itemFactors.dispose();
    userBias.dispose();
    itemBias.dispose();

    this.isTrained = true;
  }

  // ============================================================================
  // COLLABORATIVE FILTERING
  // ============================================================================

  private async predictCollaborative(userId: string, itemId: string): Promise<number> {
    if (!this.mfModel) return 0;

    const uIdx = this.userIdToIndex.get(userId);
    const iIdx = this.itemIdToIndex.get(itemId);

    if (uIdx === undefined || iIdx === undefined) return 0;

    const userFactor = this.mfModel.userFactors.slice([uIdx, 0], [1, this.latentFactors]);
    const itemFactor = this.mfModel.itemFactors.slice([iIdx, 0], [1, this.latentFactors]);
    const userBias = await this.mfModel.userBias.slice([uIdx], [1]).data();
    const itemBias = await this.mfModel.itemBias.slice([iIdx], [1]).data();

    const dotProduct = await tf.sum(tf.mul(userFactor, itemFactor)).data();
    
    const prediction = this.mfModel.globalBias + userBias[0] + itemBias[0] + dotProduct[0];

    userFactor.dispose();
    itemFactor.dispose();

    return Math.max(0, Math.min(5, prediction)); // Clamp to 0-5 range
  }

  private async getCollaborativeRecommendations(
    userId: string,
    limit: number
  ): Promise<SimilarityResult[]> {
    const scores: Array<{ id: string; score: number }> = [];
    const userInteractions = this.userItemMatrix.get(userId);
    const interactedItems = new Set(userInteractions?.keys() || []);

    for (const trackId of this.tracks.keys()) {
      if (interactedItems.has(trackId)) continue;
      
      const score = await this.predictCollaborative(userId, trackId);
      scores.push({ id: trackId, score });
    }

    scores.sort((a, b) => b.score - a.score);

    return scores.slice(0, limit).map(s => ({
      id: s.id,
      score: s.score / 5, // Normalize to 0-1
      reason: ['Based on your listening history'],
    }));
  }

  // ============================================================================
  // CONTENT-BASED FILTERING
  // ============================================================================

  private getContentSimilarity(track1: TrackData, track2: TrackData): number {
    const featureVector1 = audioFeatureToVector(track1.features);
    const featureVector2 = audioFeatureToVector(track2.features);
    
    const featureSimilarity = cosineSimilarity(featureVector1, featureVector2);
    const genreSimilarity = jaccardSimilarity(track1.genres, track2.genres);
    
    // Weighted combination
    return featureSimilarity * 0.6 + genreSimilarity * 0.4;
  }

  private getContentBasedRecommendations(
    seedTrackIds: string[],
    limit: number,
    excludeIds: Set<string> = new Set()
  ): SimilarityResult[] {
    const seedTracks = seedTrackIds
      .map(id => this.tracks.get(id))
      .filter((t): t is TrackData => t !== undefined);

    if (seedTracks.length === 0) return [];

    const scores: Map<string, { score: number; reasons: string[] }> = new Map();

    for (const [trackId, track] of this.tracks.entries()) {
      if (excludeIds.has(trackId) || seedTrackIds.includes(trackId)) continue;

      let totalScore = 0;
      const reasons: string[] = [];

      for (const seedTrack of seedTracks) {
        const similarity = this.getContentSimilarity(seedTrack, track);
        totalScore += similarity;

        // Identify specific reasons
        if (jaccardSimilarity(seedTrack.genres, track.genres) > 0.5) {
          reasons.push(`Similar genre to "${seedTrack.title}"`);
        }
        
        const tempoDiff = Math.abs(seedTrack.features.tempo - track.features.tempo);
        if (tempoDiff < 10) {
          reasons.push('Similar tempo');
        }

        const energyDiff = Math.abs(seedTrack.features.energy - track.features.energy);
        if (energyDiff < 0.15) {
          reasons.push('Similar energy level');
        }
      }

      scores.set(trackId, {
        score: totalScore / seedTracks.length,
        reasons: [...new Set(reasons)].slice(0, 3),
      });
    }

    return Array.from(scores.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, limit)
      .map(([id, { score, reasons }]) => ({
        id,
        score,
        reason: reasons.length > 0 ? reasons : ['Similar audio characteristics'],
      }));
  }

  // ============================================================================
  // HYBRID RECOMMENDATIONS
  // ============================================================================

  public async recommendTracks(
    userId: string,
    seedTrackIds: string[] = [],
    limit: number = 20,
    hybridWeight: number = 0.5 // 0 = full content, 1 = full collaborative
  ): Promise<RecommendationResult> {
    const userInteractions = this.userItemMatrix.get(userId);
    const excludeIds = new Set(userInteractions?.keys() || []);
    
    // Get collaborative recommendations if we have a trained model
    let collaborativeRecs: SimilarityResult[] = [];
    if (this.mfModel && userInteractions && userInteractions.size > 0) {
      collaborativeRecs = await this.getCollaborativeRecommendations(userId, limit * 2);
    }

    // Get content-based recommendations
    const effectiveSeedTracks = seedTrackIds.length > 0 
      ? seedTrackIds 
      : Array.from(userInteractions?.keys() || []).slice(0, 5);
    
    const contentRecs = this.getContentBasedRecommendations(
      effectiveSeedTracks,
      limit * 2,
      excludeIds
    );

    // Hybrid combination
    const hybridScores: Map<string, SimilarityResult> = new Map();

    for (const rec of contentRecs) {
      const contentScore = rec.score * (1 - hybridWeight);
      hybridScores.set(rec.id, {
        id: rec.id,
        score: contentScore,
        reason: rec.reason,
      });
    }

    for (const rec of collaborativeRecs) {
      const existing = hybridScores.get(rec.id);
      const collabScore = rec.score * hybridWeight;
      
      if (existing) {
        existing.score += collabScore;
        existing.reason = [...existing.reason, ...rec.reason];
      } else {
        hybridScores.set(rec.id, {
          id: rec.id,
          score: collabScore,
          reason: rec.reason,
        });
      }
    }

    const items = Array.from(hybridScores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const method = hybridWeight === 0 ? 'content' : 
                   hybridWeight === 1 ? 'collaborative' : 'hybrid';

    return {
      items,
      method,
      confidence: items.length > 0 ? items[0].score : 0,
    };
  }

  // ============================================================================
  // ARTIST RECOMMENDATIONS
  // ============================================================================

  public async recommendArtists(
    userId: string,
    limit: number = 10
  ): Promise<RecommendationResult> {
    const userInteractions = this.userItemMatrix.get(userId);
    
    if (!userInteractions || userInteractions.size === 0) {
      return { items: [], method: 'content', confidence: 0 };
    }

    // Get artists from user's listened tracks
    const likedArtistIds = new Set<string>();
    for (const trackId of userInteractions.keys()) {
      const track = this.tracks.get(trackId);
      if (track) likedArtistIds.add(track.artistId);
    }

    // Score other artists by similarity
    const artistScores: Map<string, { score: number; reasons: string[] }> = new Map();

    for (const [artistId, artist] of this.artists.entries()) {
      if (likedArtistIds.has(artistId)) continue;

      let totalScore = 0;
      const reasons: string[] = [];

      for (const likedArtistId of likedArtistIds) {
        const likedArtist = this.artists.get(likedArtistId);
        if (!likedArtist) continue;

        // Genre similarity
        const genreSim = jaccardSimilarity(artist.genres, likedArtist.genres);
        totalScore += genreSim * 0.5;

        if (genreSim > 0.5) {
          reasons.push(`Similar to ${likedArtist.name}`);
        }

        // Style similarity if available
        if (artist.style && likedArtist.style) {
          const styleVec1 = audioFeatureToVector(artist.style);
          const styleVec2 = audioFeatureToVector(likedArtist.style);
          const styleSim = cosineSimilarity(styleVec1, styleVec2);
          totalScore += styleSim * 0.3;
        }

        // Collaboration network
        if (artist.collaboratorIds.includes(likedArtistId) ||
            likedArtist.collaboratorIds.includes(artistId)) {
          totalScore += 0.2;
          reasons.push(`Collaborated with ${likedArtist.name}`);
        }
      }

      artistScores.set(artistId, {
        score: totalScore / likedArtistIds.size,
        reasons: [...new Set(reasons)].slice(0, 3),
      });
    }

    const items = Array.from(artistScores.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, limit)
      .map(([id, { score, reasons }]) => ({
        id,
        score,
        reason: reasons.length > 0 ? reasons : ['Based on your taste'],
      }));

    return {
      items,
      method: 'hybrid',
      confidence: items.length > 0 ? items[0].score : 0,
    };
  }

  // ============================================================================
  // SIMILARITY SEARCH
  // ============================================================================

  public findSimilar(
    itemId: string,
    itemType: 'track' | 'artist',
    limit: number = 10
  ): SimilarityResult[] {
    if (itemType === 'track') {
      return this.findSimilarTracks(itemId, limit);
    } else {
      return this.findSimilarArtists(itemId, limit);
    }
  }

  private findSimilarTracks(trackId: string, limit: number): SimilarityResult[] {
    const sourceTrack = this.tracks.get(trackId);
    if (!sourceTrack) return [];

    return this.getContentBasedRecommendations([trackId], limit, new Set([trackId]));
  }

  private findSimilarArtists(artistId: string, limit: number): SimilarityResult[] {
    const sourceArtist = this.artists.get(artistId);
    if (!sourceArtist) return [];

    const scores: Array<{ id: string; score: number; reasons: string[] }> = [];

    for (const [otherId, artist] of this.artists.entries()) {
      if (otherId === artistId) continue;

      const reasons: string[] = [];
      let score = 0;

      // Genre similarity
      const genreSim = jaccardSimilarity(sourceArtist.genres, artist.genres);
      score += genreSim * 0.4;
      if (genreSim > 0.5) {
        const sharedGenres = sourceArtist.genres.filter(g => artist.genres.includes(g));
        reasons.push(`Both create ${sharedGenres.slice(0, 2).join(', ')}`);
      }

      // Style similarity
      if (sourceArtist.style && artist.style) {
        const styleVec1 = audioFeatureToVector(sourceArtist.style);
        const styleVec2 = audioFeatureToVector(artist.style);
        const styleSim = cosineSimilarity(styleVec1, styleVec2);
        score += styleSim * 0.4;
        if (styleSim > 0.8) reasons.push('Similar production style');
      }

      // Collaboration overlap
      const collabOverlap = jaccardSimilarity(
        sourceArtist.collaboratorIds,
        artist.collaboratorIds
      );
      score += collabOverlap * 0.2;
      if (collabOverlap > 0.3) reasons.push('Similar collaboration circle');

      scores.push({
        id: otherId,
        score,
        reasons: reasons.length > 0 ? reasons : ['Similar artist profile'],
      });
    }

    return scores
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ id, score, reasons }) => ({ id, score, reason: reasons }));
  }

  // ============================================================================
  // PLAYLIST GENERATION
  // ============================================================================

  public generatePlaylist(config: PlaylistConfig): GeneratedPlaylist {
    const {
      seedTrackIds,
      targetLength,
      diversity,
      energyProfile = 'steady',
      tempoRange,
      genres,
    } = config;

    const seedTracks = seedTrackIds
      .map(id => this.tracks.get(id))
      .filter((t): t is TrackData => t !== undefined);

    if (seedTracks.length === 0) {
      return {
        tracks: [],
        coherenceScore: 0,
        diversityScore: 0,
        mood: 'unknown',
      };
    }

    // Calculate target audio profile based on seeds
    const avgFeatures = this.calculateAverageFeatures(seedTracks);
    
    // Generate energy curve based on profile
    const energyCurve = this.generateEnergyCurve(targetLength, energyProfile);

    // Score and select tracks
    const selectedTracks: SimilarityResult[] = [];
    const usedTrackIds = new Set(seedTrackIds);
    const candidateTracks = Array.from(this.tracks.entries())
      .filter(([id]) => !usedTrackIds.has(id));

    for (let i = 0; i < targetLength; i++) {
      const targetEnergy = energyCurve[i];
      const position = i / targetLength;

      let bestTrack: { id: string; track: TrackData; score: number } | null = null;
      let bestScore = -Infinity;

      for (const [trackId, track] of candidateTracks) {
        if (usedTrackIds.has(trackId)) continue;

        let score = 0;
        const reasons: string[] = [];

        // Feature similarity to average
        const featureVec = audioFeatureToVector(track.features);
        const avgVec = audioFeatureToVector(avgFeatures);
        const coherenceScore = cosineSimilarity(featureVec, avgVec);
        score += coherenceScore * (1 - diversity) * 0.4;

        // Energy match
        const energyDiff = Math.abs(track.features.energy - targetEnergy);
        score += (1 - energyDiff) * 0.3;

        // Tempo filter
        if (tempoRange) {
          if (track.features.tempo >= tempoRange.min && track.features.tempo <= tempoRange.max) {
            score += 0.15;
          } else {
            score -= 0.3;
          }
        }

        // Genre filter
        if (genres && genres.length > 0) {
          const genreMatch = jaccardSimilarity(genres, track.genres);
          score += genreMatch * 0.15;
        }

        // Diversity bonus (prefer tracks from different artists)
        const artistDiversity = selectedTracks.filter(
          s => this.tracks.get(s.id)?.artistId === track.artistId
        ).length;
        score -= artistDiversity * diversity * 0.1;

        if (score > bestScore) {
          bestScore = score;
          bestTrack = { id: trackId, track, score };
        }
      }

      if (bestTrack) {
        selectedTracks.push({
          id: bestTrack.id,
          score: bestTrack.score,
          reason: ['Playlist fit'],
        });
        usedTrackIds.add(bestTrack.id);
      }
    }

    // Calculate playlist metrics
    const coherenceScore = this.calculatePlaylistCoherence(selectedTracks);
    const diversityScore = this.calculatePlaylistDiversity(selectedTracks);
    const mood = this.determineMood(avgFeatures);

    return {
      tracks: selectedTracks,
      coherenceScore,
      diversityScore,
      mood,
    };
  }

  private calculateAverageFeatures(tracks: TrackData[]): AudioFeatureVector {
    const sum: AudioFeatureVector = {
      tempo: 0, energy: 0, danceability: 0, valence: 0,
      acousticness: 0, instrumentalness: 0, speechiness: 0,
      liveness: 0, loudness: 0, key: 0, mode: 0, timeSignature: 4,
    };

    for (const track of tracks) {
      for (const key of Object.keys(sum) as (keyof AudioFeatureVector)[]) {
        sum[key] += track.features[key];
      }
    }

    const avg = { ...sum };
    for (const key of Object.keys(avg) as (keyof AudioFeatureVector)[]) {
      avg[key] /= tracks.length;
    }

    return avg;
  }

  private generateEnergyCurve(
    length: number,
    profile: 'ascending' | 'descending' | 'peak' | 'steady'
  ): number[] {
    const curve: number[] = [];
    
    for (let i = 0; i < length; i++) {
      const position = i / (length - 1);
      let energy: number;
      
      switch (profile) {
        case 'ascending':
          energy = 0.3 + position * 0.6;
          break;
        case 'descending':
          energy = 0.9 - position * 0.6;
          break;
        case 'peak':
          energy = position < 0.5
            ? 0.3 + position * 1.2
            : 0.9 - (position - 0.5) * 1.2;
          break;
        case 'steady':
        default:
          energy = 0.6;
          break;
      }
      
      curve.push(Math.max(0, Math.min(1, energy)));
    }
    
    return curve;
  }

  private calculatePlaylistCoherence(tracks: SimilarityResult[]): number {
    if (tracks.length < 2) return 1;

    const trackData = tracks
      .map(t => this.tracks.get(t.id))
      .filter((t): t is TrackData => t !== undefined);

    let totalSimilarity = 0;
    let comparisons = 0;

    for (let i = 0; i < trackData.length - 1; i++) {
      const similarity = this.getContentSimilarity(trackData[i], trackData[i + 1]);
      totalSimilarity += similarity;
      comparisons++;
    }

    return comparisons > 0 ? totalSimilarity / comparisons : 0;
  }

  private calculatePlaylistDiversity(tracks: SimilarityResult[]): number {
    if (tracks.length < 2) return 0;

    const artistSet = new Set<string>();
    const genreSet = new Set<string>();

    for (const track of tracks) {
      const trackData = this.tracks.get(track.id);
      if (trackData) {
        artistSet.add(trackData.artistId);
        trackData.genres.forEach(g => genreSet.add(g));
      }
    }

    const artistDiversity = artistSet.size / tracks.length;
    const genreDiversity = Math.min(genreSet.size / 5, 1); // Normalize to max 5 genres

    return (artistDiversity + genreDiversity) / 2;
  }

  private determineMood(features: AudioFeatureVector): string {
    if (features.valence > 0.7 && features.energy > 0.7) return 'energetic';
    if (features.valence > 0.6 && features.energy < 0.5) return 'happy-chill';
    if (features.valence < 0.4 && features.energy > 0.7) return 'intense';
    if (features.valence < 0.4 && features.energy < 0.5) return 'melancholic';
    if (features.danceability > 0.7) return 'dance';
    if (features.acousticness > 0.7) return 'acoustic';
    return 'balanced';
  }

  // ============================================================================
  // COLLABORATION MATCHING
  // ============================================================================

  public matchCollaborators(
    artistId: string,
    limit: number = 10
  ): CollaboratorMatch[] {
    const sourceArtist = this.artists.get(artistId);
    if (!sourceArtist) return [];

    const matches: CollaboratorMatch[] = [];

    for (const [otherId, artist] of this.artists.entries()) {
      if (otherId === artistId) continue;
      if (sourceArtist.collaboratorIds.includes(otherId)) continue;

      const reasons: string[] = [];

      // Genre compatibility
      const sharedGenres = sourceArtist.genres.filter(g => artist.genres.includes(g));
      const genreScore = sharedGenres.length / Math.max(sourceArtist.genres.length, artist.genres.length);
      if (sharedGenres.length > 0) {
        reasons.push(`Shared genres: ${sharedGenres.slice(0, 3).join(', ')}`);
      }

      // Style compatibility
      let styleCompatibility = 0.5;
      if (sourceArtist.style && artist.style) {
        const styleVec1 = audioFeatureToVector(sourceArtist.style);
        const styleVec2 = audioFeatureToVector(artist.style);
        styleCompatibility = cosineSimilarity(styleVec1, styleVec2);
        
        // Complementary styles can also work well
        const complementScore = 1 - styleCompatibility;
        if (complementScore > 0.6) {
          reasons.push('Complementary production styles');
          styleCompatibility = 0.3 + complementScore * 0.4;
        } else if (styleCompatibility > 0.7) {
          reasons.push('Similar production quality');
        }
      }

      // Audience overlap estimation
      const followerRatio = Math.min(sourceArtist.followers, artist.followers) /
                           Math.max(sourceArtist.followers, artist.followers);
      const audienceOverlap = followerRatio * genreScore;
      if (audienceOverlap > 0.3) {
        reasons.push('Potential audience crossover');
      }

      // Mutual connections
      const mutualCollaborators = sourceArtist.collaboratorIds.filter(
        c => artist.collaboratorIds.includes(c)
      );
      if (mutualCollaborators.length > 0) {
        reasons.push(`${mutualCollaborators.length} mutual collaborator(s)`);
      }

      // Calculate overall compatibility score
      const compatibilityScore = 
        genreScore * 0.3 +
        styleCompatibility * 0.3 +
        audienceOverlap * 0.2 +
        (mutualCollaborators.length > 0 ? 0.2 : 0);

      matches.push({
        artistId: otherId,
        compatibilityScore,
        sharedGenres,
        styleCompatibility,
        audienceOverlap,
        reasons: reasons.length > 0 ? reasons : ['Potential creative match'],
      });
    }

    return matches
      .sort((a, b) => b.compatibilityScore - a.compatibilityScore)
      .slice(0, limit);
  }

  // ============================================================================
  // REAL-TIME UPDATES
  // ============================================================================

  public async updateRecommendations(interaction: UserInteraction): Promise<void> {
    this.recordInteraction(interaction);

    // Incremental update to matrix factorization if trained
    if (this.mfModel && this.userIdToIndex.has(interaction.userId)) {
      const uIdx = this.userIdToIndex.get(interaction.userId)!;
      const iIdx = this.itemIdToIndex.get(interaction.itemId);

      if (iIdx !== undefined) {
        // Perform single gradient step
        const learningRate = 0.01;
        const regularization = 0.02;

        const userFactor = await this.mfModel.userFactors.slice([uIdx, 0], [1, this.latentFactors]).array();
        const itemFactor = await this.mfModel.itemFactors.slice([iIdx, 0], [1, this.latentFactors]).array();
        const userBias = await this.mfModel.userBias.slice([uIdx], [1]).data();
        const itemBias = await this.mfModel.itemBias.slice([iIdx], [1]).data();

        let prediction = this.mfModel.globalBias + userBias[0] + itemBias[0];
        for (let k = 0; k < this.latentFactors; k++) {
          prediction += (userFactor as number[][])[0][k] * (itemFactor as number[][])[0][k];
        }

        const rating = this.userItemMatrix.get(interaction.userId)?.get(interaction.itemId) || 0;
        const error = rating - prediction;

        // Update bias tensors
        const newUserBias = await this.mfModel.userBias.array();
        const newItemBias = await this.mfModel.itemBias.array();
        (newUserBias as number[])[uIdx] += learningRate * (error - regularization * (newUserBias as number[])[uIdx]);
        (newItemBias as number[])[iIdx] += learningRate * (error - regularization * (newItemBias as number[])[iIdx]);

        this.mfModel.userBias.dispose();
        this.mfModel.itemBias.dispose();
        this.mfModel.userBias = tf.tensor1d(newUserBias as number[]);
        this.mfModel.itemBias = tf.tensor1d(newItemBias as number[]);
      }
    }
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  public override dispose(): void {
    super.dispose();
    
    if (this.mfModel) {
      this.mfModel.userFactors.dispose();
      this.mfModel.itemFactors.dispose();
      this.mfModel.userBias.dispose();
      this.mfModel.itemBias.dispose();
      this.mfModel = null;
    }

    this.tracks.clear();
    this.artists.clear();
    this.interactions = [];
    this.userItemMatrix.clear();
    this.userIdToIndex.clear();
    this.itemIdToIndex.clear();
    this.indexToItemId.clear();
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  public getStats(): {
    trackCount: number;
    artistCount: number;
    userCount: number;
    interactionCount: number;
    isTrained: boolean;
  } {
    return {
      trackCount: this.tracks.size,
      artistCount: this.artists.size,
      userCount: this.userItemMatrix.size,
      interactionCount: this.interactions.length,
      isTrained: this.mfModel !== null,
    };
  }
}

export default RecommendationEngine;
