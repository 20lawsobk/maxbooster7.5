import { storage } from '../storage';
import type {
  InsertStudioProject,
  InsertStudioTrack,
  StudioProject,
  StudioTrack,
} from '@shared/schema';
import { nanoid } from 'nanoid';
import fs from 'fs';
import path from 'path';
import { logger } from '../logger.js';

export class StudioService {
  /**
   * Create a new DAW project
   */
  async createProject(data: InsertStudioProject): Promise<StudioProject> {
    try {
      const project = await storage.createStudioProject(data);
      return project;
    } catch (error: unknown) {
      logger.error('Error creating studio project:', error);
      throw new Error('Failed to create studio project');
    }
  }

  /**
   * Get user's studio projects
   */
  async getUserProjects(userId: string): Promise<StudioProject[]> {
    try {
      return await storage.getUserStudioProjects(userId);
    } catch (error: unknown) {
      logger.error('Error fetching user projects:', error);
      throw new Error('Failed to fetch user projects');
    }
  }

  /**
   * Get project by ID
   */
  async getProject(projectId: string, userId: string): Promise<StudioProject | undefined> {
    try {
      const project = await storage.getStudioProject(projectId);

      if (!project) {
        return undefined;
      }

      // Verify ownership or collaboration
      if (project.userId !== userId) {
        const collaborators = (project.collaborators as any[]) || [];
        const isCollaborator = collaborators.some((c: unknown) => c.userId === userId);

        if (!isCollaborator) {
          throw new Error('Unauthorized access to project');
        }
      }

      return project;
    } catch (error: unknown) {
      logger.error('Error fetching project:', error);
      throw new Error('Failed to fetch project');
    }
  }

  /**
   * Update project
   */
  async updateProject(
    projectId: string,
    userId: string,
    updates: Partial<StudioProject>
  ): Promise<StudioProject> {
    try {
      return await storage.updateStudioProject(projectId, userId, updates);
    } catch (error: unknown) {
      logger.error('Error updating project:', error);
      throw new Error('Failed to update project');
    }
  }

  /**
   * Delete project
   */
  async deleteProject(projectId: string, userId: string): Promise<void> {
    try {
      await storage.deleteStudioProject(projectId, userId);
    } catch (error: unknown) {
      logger.error('Error deleting project:', error);
      throw new Error('Failed to delete project');
    }
  }

  /**
   * Add track to project
   */
  async addTrack(projectId: string, trackData: InsertStudioTrack): Promise<StudioTrack> {
    try {
      // Verify project exists using unified projects table
      const project = await storage.getProject(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      const track = await storage.createStudioTrack(trackData);

      // Update project track count using unified projects table
      await storage.updateProject(projectId, {
        totalTracks: (project.totalTracks || 0) + 1,
      });

      return track;
    } catch (error: unknown) {
      logger.error('Error adding track:', error);
      throw new Error('Failed to add track');
    }
  }

  /**
   * Get project tracks
   */
  async getProjectTracks(projectId: string): Promise<StudioTrack[]> {
    try {
      return await storage.getProjectTracks(projectId);
    } catch (error: unknown) {
      logger.error('Error fetching project tracks:', error);
      throw new Error('Failed to fetch project tracks');
    }
  }

  /**
   * Update track
   */
  async updateTrack(
    trackId: string,
    projectId: string,
    updates: Partial<StudioTrack>
  ): Promise<StudioTrack> {
    try {
      return await storage.updateStudioTrack(trackId, projectId, updates);
    } catch (error: unknown) {
      logger.error('Error updating track:', error);
      throw new Error('Failed to update track');
    }
  }

  /**
   * Delete track
   */
  async deleteTrack(trackId: string, projectId: string): Promise<void> {
    try {
      await storage.deleteStudioTrack(trackId, projectId);

      // Update project track count
      const project = await storage.getStudioProject(projectId);
      if (project) {
        await storage.updateStudioProject(projectId, project.userId, {
          totalTracks: Math.max(0, (project.totalTracks || 1) - 1),
        });
      }
    } catch (error: unknown) {
      logger.error('Error deleting track:', error);
      throw new Error('Failed to delete track');
    }
  }

  /**
   * Upload audio file
   */
  async uploadAudio(
    file: Express.Multer.File,
    userId: string
  ): Promise<{ id: string; url: string; duration?: number }> {
    try {
      const audioId = `audio_${nanoid()}`;
      const ext = path.extname(file.originalname);
      const fileName = `${audioId}${ext}`;
      const uploadPath = path.join(process.cwd(), 'uploads', 'audio', fileName);

      // Ensure directory exists
      const audioDir = path.join(process.cwd(), 'uploads', 'audio');
      if (!fs.existsSync(audioDir)) {
        fs.mkdirSync(audioDir, { recursive: true });
      }

      // Move file to permanent location
      fs.renameSync(file.path, uploadPath);

      // In production, also upload to cloud storage (S3/R2)
      // and extract audio metadata (duration, sample rate, etc.)

      return {
        id: audioId,
        url: `/uploads/audio/${fileName}`,
        duration: undefined, // Would be extracted from audio file
      };
    } catch (error: unknown) {
      logger.error('Error uploading audio:', error);
      throw new Error('Failed to upload audio file');
    }
  }

  /**
   * Process audio waveform using FFmpeg
   */
  async processAudio(
    audioId: string,
    audioPath: string
  ): Promise<{ waveformData: number[]; peaks: number[] }> {
    try {
      // Use audioService for real waveform generation
      const { audioService } = await import('./audioService');
      const waveformData = await audioService.generateWaveform(audioPath);

      // Extract peaks from waveform data for visualization
      const peaks = this.extractPeaksFromWaveform(waveformData, 100);

      return {
        waveformData,
        peaks,
      };
    } catch (error: unknown) {
      logger.error('Error processing audio:', error);
      throw new Error('Failed to process audio');
    }
  }

  /**
   * Extract peak values from waveform data
   */
  private extractPeaksFromWaveform(waveformData: number[], targetPeaks: number): number[] {
    const peaks: number[] = [];
    const windowSize = Math.floor(waveformData.length / targetPeaks);

    for (let i = 0; i < waveformData.length; i += windowSize) {
      let maxPeak = 0;
      for (let j = i; j < Math.min(i + windowSize, waveformData.length); j++) {
        maxPeak = Math.max(maxPeak, Math.abs(waveformData[j]));
      }
      peaks.push(maxPeak);
    }

    return peaks;
  }

  /**
   * Autosave project state
   */
  async saveAutosave(projectId: string, userId: string, state: unknown): Promise<void> {
    try {
      // Store autosave data
      await storage.updateStudioProject(projectId, userId, {
        lastPlayPosition: state.playPosition || 0,
        updatedAt: new Date(),
      });

      // In production, also save detailed state to separate autosave table
      // with timestamp for version control
    } catch (error: unknown) {
      logger.error('Error saving autosave:', error);
      throw new Error('Failed to save autosave');
    }
  }

  /**
   * Load complete project state with all tracks and clips
   */
  async loadProject(
    projectId: string,
    userId: string
  ): Promise<{
    project: StudioProject;
    tracks: StudioTrack[];
    audioClips: unknown[];
    midiClips: unknown[];
    effects: unknown[];
    automation: unknown[];
    markers: unknown[];
  }> {
    try {
      const project = await this.getProject(projectId, userId);
      if (!project) {
        throw new Error('Project not found');
      }

      const tracks = await storage.getProjectTracks(projectId);
      const effects = await storage.getProjectEffects(projectId);
      const automation = await storage.getProjectAutomation(projectId);
      const markers = await storage.getProjectMarkers(projectId);

      // Get all clips for all tracks
      const audioClips = [];
      const midiClips = [];

      for (const track of tracks) {
        const trackAudioClips = await storage.getTrackAudioClips(track.id);
        const trackMidiClips = await storage.getTrackMidiClips(track.id);
        audioClips.push(...trackAudioClips);
        midiClips.push(...trackMidiClips);
      }

      return {
        project,
        tracks,
        audioClips,
        midiClips,
        effects,
        automation,
        markers,
      };
    } catch (error: unknown) {
      logger.error('Error loading project:', error);
      throw new Error('Failed to load project');
    }
  }

  /**
   * Upload recorded audio file with take metadata (Phase 6)
   */
  async uploadRecording(
    file: Express.Multer.File,
    options: {
      userId: string;
      trackId: string;
      projectId: string;
      takeNumber: number;
      takeGroupId?: string;
      startPosition: number;
    }
  ): Promise<any> {
    try {
      const clipId = `clip_${nanoid()}`;
      const ext = path.extname(file.originalname);
      const fileName = `${clipId}${ext}`;
      const uploadPath = path.join(process.cwd(), 'uploads', 'audio', fileName);

      // Ensure directory exists
      const audioDir = path.join(process.cwd(), 'uploads', 'audio');
      if (!fs.existsSync(audioDir)) {
        fs.mkdirSync(audioDir, { recursive: true });
      }

      // Move file to permanent location
      fs.renameSync(file.path, uploadPath);

      // Create audio clip in database with take metadata
      const audioClip = await storage.createAudioClip({
        id: clipId,
        trackId: options.trackId,
        name: `Take ${options.takeNumber}`,
        filePath: `/uploads/audio/${fileName}`,
        originalFilename: file.originalname,
        fileSize: file.size,
        startTime: options.startPosition,
        endTime: options.startPosition + 10, // Will be updated with actual duration
        takeNumber: options.takeNumber,
        takeGroupId: options.takeGroupId || nanoid(),
        isComped: false,
      });

      return {
        clipId: audioClip.id,
        url: `/uploads/audio/${fileName}`,
        takeNumber: options.takeNumber,
        takeGroupId: audioClip.takeGroupId,
      };
    } catch (error: unknown) {
      logger.error('Error uploading recording:', error);
      throw new Error('Failed to upload recording');
    }
  }

  /**
   * Get clips by take group
   */
  async getClipsByTakeGroup(takeGroupId: string): Promise<any[]> {
    try {
      return await storage.getClipsByTakeGroup(takeGroupId);
    } catch (error: unknown) {
      logger.error('Error fetching clips by take group:', error);
      throw new Error('Failed to fetch clips by take group');
    }
  }

  /**
   * Export project to audio file
   */
  async exportProject(
    projectId: string,
    userId: string,
    options: {
      format: 'wav' | 'mp3' | 'flac' | 'aac';
      quality: 'low' | 'medium' | 'high' | 'lossless';
    }
  ): Promise<{ exportId: string; status: 'processing' | 'completed'; url?: string }> {
    try {
      const exportId = `export_${nanoid()}`;

      // In production:
      // 1. Queue export job
      // 2. Render all tracks together
      // 3. Apply master effects
      // 4. Encode to requested format
      // 5. Upload to storage
      // 6. Notify user when complete

      return {
        exportId,
        status: 'processing',
      };
    } catch (error: unknown) {
      logger.error('Error exporting project:', error);
      throw new Error('Failed to export project');
    }
  }

  /**
   * Add collaborator to project
   */
  async addCollaborator(
    projectId: string,
    userId: string,
    collaboratorEmail: string,
    role: 'view' | 'edit' | 'admin'
  ): Promise<void> {
    try {
      const project = await storage.getStudioProject(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      if (project.userId !== userId) {
        throw new Error('Only project owner can add collaborators');
      }

      const collaborators = (project.collaborators as any[]) || [];
      collaborators.push({
        email: collaboratorEmail,
        role,
        addedAt: new Date(),
      });

      await storage.updateStudioProject(projectId, userId, {
        collaborators,
      });
    } catch (error: unknown) {
      logger.error('Error adding collaborator:', error);
      throw new Error('Failed to add collaborator');
    }
  }

  /**
   * Create audio clip
   */
  async createAudioClip(clipData: unknown): Promise<any> {
    try {
      return await storage.createAudioClip(clipData);
    } catch (error: unknown) {
      logger.error('Error creating audio clip:', error);
      throw new Error('Failed to create audio clip');
    }
  }

  /**
   * Get clips for a track
   */
  async getTrackClips(trackId: string): Promise<any[]> {
    try {
      return await storage.getTrackClips(trackId);
    } catch (error: unknown) {
      logger.error('Error fetching track clips:', error);
      throw new Error('Failed to fetch track clips');
    }
  }

  /**
   * Update audio clip
   */
  async updateAudioClip(clipId: string, updates: unknown): Promise<any> {
    try {
      return await storage.updateAudioClip(clipId, updates);
    } catch (error: unknown) {
      logger.error('Error updating audio clip:', error);
      throw new Error('Failed to update audio clip');
    }
  }

  /**
   * Delete audio clip
   */
  async deleteAudioClip(clipId: string): Promise<void> {
    try {
      await storage.deleteAudioClip(clipId);
    } catch (error: unknown) {
      logger.error('Error deleting audio clip:', error);
      throw new Error('Failed to delete audio clip');
    }
  }

  /**
   * Normalize audio clip
   */
  async normalizeClip(clipId: string): Promise<any> {
    try {
      const clip = await storage.getAudioClip(clipId);
      if (!clip) {
        throw new Error('Clip not found');
      }

      // Calculate peak amplitude from waveform data or audio file
      const peakData = (clip.peakData as number[]) || [];
      const peak = peakData.length > 0 ? Math.max(...peakData) : 0.5;

      // Calculate gain to bring peak to 0dB (1.0)
      const normalizeGain = peak > 0 ? 1.0 / peak : 1.0;

      return await this.updateAudioClip(clipId, { gain: normalizeGain });
    } catch (error: unknown) {
      logger.error('Error normalizing clip:', error);
      throw new Error('Failed to normalize clip');
    }
  }

  /**
   * Split clip at time position
   */
  async splitClip(clipId: string, splitTime: number): Promise<{ clip1: any; clip2: any }> {
    try {
      const clip = await storage.getAudioClip(clipId);
      if (!clip) {
        throw new Error('Clip not found');
      }

      // Calculate new clip boundaries
      const clip1Duration = splitTime - clip.startTime;
      const clip2Duration = clip.endTime - splitTime;

      // Create first clip (before split)
      const clip1 = await this.createAudioClip({
        trackId: clip.trackId,
        name: `${clip.name} (1)`,
        filePath: clip.filePath,
        originalFilename: clip.originalFilename,
        duration: clip1Duration,
        startTime: clip.startTime,
        endTime: splitTime,
        offset: clip.offset,
        gain: clip.gain,
        fadeIn: clip.fadeIn,
        fadeOut: 0,
        waveformData: clip.waveformData,
        peakData: clip.peakData,
      });

      // Create second clip (after split)
      const clip2 = await this.createAudioClip({
        trackId: clip.trackId,
        name: `${clip.name} (2)`,
        filePath: clip.filePath,
        originalFilename: clip.originalFilename,
        duration: clip2Duration,
        startTime: splitTime,
        endTime: clip.endTime,
        offset: clip.offset + clip1Duration,
        gain: clip.gain,
        fadeIn: 0,
        fadeOut: clip.fadeOut,
        waveformData: clip.waveformData,
        peakData: clip.peakData,
      });

      // Delete original clip
      await this.deleteAudioClip(clipId);

      return { clip1, clip2 };
    } catch (error: unknown) {
      logger.error('Error splitting clip:', error);
      throw new Error('Failed to split clip');
    }
  }

  /**
   * Add effect to track
   */
  async addEffect(trackId: string, projectId: string, effectData: unknown): Promise<any> {
    try {
      const effect = await storage.createAudioEffect({
        ...effectData,
        trackId,
        projectId,
      });
      return effect;
    } catch (error: unknown) {
      logger.error('Error adding effect:', error);
      throw new Error('Failed to add effect');
    }
  }

  /**
   * Get effects for a track
   */
  async getTrackEffects(trackId: string): Promise<any[]> {
    try {
      const effects = await storage.getTrackEffects(trackId);
      return effects.sort((a, b) => (a.chainPosition || 0) - (b.chainPosition || 0));
    } catch (error: unknown) {
      logger.error('Error fetching track effects:', error);
      throw new Error('Failed to fetch track effects');
    }
  }

  /**
   * Update effect parameters
   */
  async updateEffect(effectId: string, updates: unknown): Promise<any> {
    try {
      return await storage.updateAudioEffect(effectId, updates);
    } catch (error: unknown) {
      logger.error('Error updating effect:', error);
      throw new Error('Failed to update effect');
    }
  }

  /**
   * Delete effect
   */
  async deleteEffect(effectId: string): Promise<void> {
    try {
      await storage.deleteAudioEffect(effectId);
    } catch (error: unknown) {
      logger.error('Error deleting effect:', error);
      throw new Error('Failed to delete effect');
    }
  }

  /**
   * Reorder effects in chain
   */
  async reorderEffects(effectIds: string[]): Promise<void> {
    try {
      // Update chain position for each effect
      for (let i = 0; i < effectIds.length; i++) {
        await storage.updateAudioEffect(effectIds[i], { chainPosition: i });
      }
    } catch (error: unknown) {
      logger.error('Error reordering effects:', error);
      throw new Error('Failed to reorder effects');
    }
  }

  /**
   * Save automation data
   */
  async saveAutomation(automationData: unknown): Promise<any> {
    try {
      return await storage.createAutomationData(automationData);
    } catch (error: unknown) {
      logger.error('Error saving automation:', error);
      throw new Error('Failed to save automation');
    }
  }

  /**
   * Get automation for project
   */
  async getProjectAutomationData(projectId: string): Promise<any[]> {
    try {
      return await storage.getProjectAutomation(projectId);
    } catch (error: unknown) {
      logger.error('Error fetching automation:', error);
      throw new Error('Failed to fetch automation');
    }
  }

  /**
   * Update automation data
   */
  async updateAutomation(automationId: string, updates: unknown): Promise<any> {
    try {
      return await storage.updateAutomationData(automationId, updates);
    } catch (error: unknown) {
      logger.error('Error updating automation:', error);
      throw new Error('Failed to update automation');
    }
  }

  /**
   * Delete automation
   */
  async deleteAutomation(automationId: string): Promise<void> {
    try {
      await storage.deleteAutomationData(automationId);
    } catch (error: unknown) {
      logger.error('Error deleting automation:', error);
      throw new Error('Failed to delete automation');
    }
  }

  /**
   * Save project to autosaves table (Phase 7)
   */
  async saveProject(
    projectId: string,
    userId: string,
    label: string = 'Manual save'
  ): Promise<void> {
    try {
      const projectData = await this.loadProject(projectId, userId);

      await storage.createAutosave({
        projectId,
        authorId: userId,
        label,
        state: projectData as any,
      });

      // Keep only last 10 autosaves
      const autosaves = await storage.getProjectAutosaves(projectId);
      if (autosaves.length > 10) {
        const toDelete = autosaves.slice(10);
        for (const autosave of toDelete) {
          await storage.deleteAutosave(autosave.id);
        }
      }
    } catch (error: unknown) {
      logger.error('Error saving project:', error);
      throw new Error('Failed to save project');
    }
  }

  /**
   * Get project autosaves
   */
  async getProjectAutosaves(projectId: string): Promise<any[]> {
    try {
      return await storage.getProjectAutosaves(projectId);
    } catch (error: unknown) {
      logger.error('Error fetching autosaves:', error);
      throw new Error('Failed to fetch autosaves');
    }
  }

  /**
   * Restore project from autosave
   */
  async restoreFromAutosave(autosaveId: number, userId: string): Promise<any> {
    try {
      const autosave = await storage.getAutosave(autosaveId);
      if (!autosave) {
        throw new Error('Autosave not found');
      }

      // Create a new project from the autosave state
      const state = autosave.state as any;
      const project = state.project;

      const restoredProject = await storage.createProject({
        userId,
        title: `${project.title} (Restored)`,
        isStudioProject: true,
        bpm: project.bpm,
        timeSignature: project.timeSignature,
        key: project.key,
        sampleRate: project.sampleRate,
        bitDepth: project.bitDepth,
        masterVolume: project.masterVolume,
        status: 'draft',
      });

      // Restore tracks, clips, effects, etc.
      for (const track of state.tracks || []) {
        await storage.createStudioTrack({
          ...track,
          projectId: restoredProject.id,
        });
      }

      return restoredProject;
    } catch (error: unknown) {
      logger.error('Error restoring from autosave:', error);
      throw new Error('Failed to restore from autosave');
    }
  }

  /**
   * Phase 8: Freeze track
   */
  async freezeTrack(trackId: string, file: Express.Multer.File, projectId: string): Promise<any> {
    try {
      const frozenId = `frozen_${nanoid()}`;
      const ext = path.extname(file.originalname);
      const fileName = `${frozenId}${ext}`;
      const uploadPath = path.join(process.cwd(), 'uploads', 'audio', fileName);

      // Ensure directory exists
      const audioDir = path.join(process.cwd(), 'uploads', 'audio');
      if (!fs.existsSync(audioDir)) {
        fs.mkdirSync(audioDir, { recursive: true });
      }

      // Move file to permanent location
      fs.renameSync(file.path, uploadPath);

      const frozenFilePath = `/uploads/audio/${fileName}`;

      // Update track with frozen status
      await storage.updateStudioTrack(trackId, projectId, {
        frozen: true,
        frozenFilePath,
      });

      return {
        success: true,
        frozenFilePath,
      };
    } catch (error: unknown) {
      logger.error('Error freezing track:', error);
      throw new Error('Failed to freeze track');
    }
  }

  /**
   * Phase 8: Unfreeze track
   */
  async unfreezeTrack(trackId: string, projectId: string): Promise<any> {
    try {
      const track = await storage.getStudioTrack(trackId);

      if (!track) {
        throw new Error('Track not found');
      }

      // Delete frozen file if it exists
      if (track.frozenFilePath) {
        const frozenPath = path.join(process.cwd(), track.frozenFilePath);
        if (fs.existsSync(frozenPath)) {
          fs.unlinkSync(frozenPath);
        }
      }

      // Update track to unfrozen status
      await storage.updateStudioTrack(trackId, projectId, {
        frozen: false,
        frozenFilePath: null,
      });

      return {
        success: true,
      };
    } catch (error: unknown) {
      logger.error('Error unfreezing track:', error);
      throw new Error('Failed to unfreeze track');
    }
  }

  /**
   * Create project from template (Phase 7)
   */
  async createFromTemplate(userId: string, templateName: string): Promise<any> {
    try {
      const templates = this.getBuiltInTemplates();
      const template = templates.find((t) => t.name === templateName);

      if (!template) {
        throw new Error('Template not found');
      }

      const project = await storage.createProject({
        userId,
        title: template.name,
        description: template.description,
        isStudioProject: true,
        bpm: template.bpm,
        timeSignature: template.timeSignature,
        sampleRate: 48000,
        bitDepth: 24,
        status: 'draft',
      });

      // Create tracks based on template
      for (const trackTemplate of template.tracks) {
        await storage.createStudioTrack({
          projectId: project.id,
          name: trackTemplate.name,
          trackType: trackTemplate.trackType as any,
          trackNumber: trackTemplate.trackNumber,
          volume: 0.8,
          pan: 0,
          mute: false,
          solo: false,
          armed: false,
          recordEnabled: false,
          inputMonitoring: false,
          color: trackTemplate.color,
          height: 100,
          collapsed: false,
          outputBus: 'master',
        });
      }

      return project;
    } catch (error: unknown) {
      logger.error('Error creating from template:', error);
      throw new Error('Failed to create from template');
    }
  }

  /**
   * Get built-in templates
   */
  getBuiltInTemplates(): Array<{
    name: string;
    description: string;
    bpm: number;
    timeSignature: string;
    tracks: Array<{ name: string; trackType: string; trackNumber: number; color: string }>;
  }> {
    return [
      {
        name: 'Blank Project',
        description: 'Empty project with no tracks',
        bpm: 120,
        timeSignature: '4/4',
        tracks: [],
      },
      {
        name: 'Music Production',
        description: '8 audio tracks ready for music production',
        bpm: 120,
        timeSignature: '4/4',
        tracks: [
          { name: 'Vocals', trackType: 'audio', trackNumber: 1, color: '#4ade80' },
          { name: 'Guitar 1', trackType: 'audio', trackNumber: 2, color: '#60a5fa' },
          { name: 'Guitar 2', trackType: 'audio', trackNumber: 3, color: '#f87171' },
          { name: 'Bass', trackType: 'audio', trackNumber: 4, color: '#fbbf24' },
          { name: 'Keys', trackType: 'audio', trackNumber: 5, color: '#a78bfa' },
          { name: 'Drums', trackType: 'audio', trackNumber: 6, color: '#fb923c' },
          { name: 'Percussion', trackType: 'audio', trackNumber: 7, color: '#ec4899' },
          { name: 'FX', trackType: 'audio', trackNumber: 8, color: '#14b8a6' },
        ],
      },
      {
        name: 'Podcast',
        description: '3 audio tracks for podcast recording',
        bpm: 120,
        timeSignature: '4/4',
        tracks: [
          { name: 'Host', trackType: 'audio', trackNumber: 1, color: '#4ade80' },
          { name: 'Guest', trackType: 'audio', trackNumber: 2, color: '#60a5fa' },
          { name: 'Intro/Outro', trackType: 'audio', trackNumber: 3, color: '#f87171' },
        ],
      },
      {
        name: 'Beat Making',
        description: 'Drum and instrument tracks for beat production',
        bpm: 140,
        timeSignature: '4/4',
        tracks: [
          { name: 'Kick', trackType: 'audio', trackNumber: 1, color: '#4ade80' },
          { name: 'Snare', trackType: 'audio', trackNumber: 2, color: '#60a5fa' },
          { name: 'Hi-Hats', trackType: 'audio', trackNumber: 3, color: '#f87171' },
          { name: '808 Bass', trackType: 'audio', trackNumber: 4, color: '#fbbf24' },
          { name: 'Melody 1', trackType: 'audio', trackNumber: 5, color: '#a78bfa' },
          { name: 'Melody 2', trackType: 'audio', trackNumber: 6, color: '#fb923c' },
          { name: 'Vocal Sample', trackType: 'audio', trackNumber: 7, color: '#ec4899' },
        ],
      },
      {
        name: 'Mastering',
        description: 'Stereo track with mastering chain',
        bpm: 120,
        timeSignature: '4/4',
        tracks: [{ name: 'Stereo Master', trackType: 'audio', trackNumber: 1, color: '#4ade80' }],
      },
    ];
  }

  /**
   * Save current project as template
   */
  async saveAsTemplate(projectId: string, userId: string, templateName: string): Promise<any> {
    try {
      const project = await storage.getProject(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      const tracks = await storage.getProjectTracks(projectId);

      const template = await storage.createProject({
        userId,
        title: templateName,
        description: `Custom template created from ${project.title}`,
        isStudioProject: true,
        isTemplate: true,
        bpm: project.bpm,
        timeSignature: project.timeSignature,
        sampleRate: project.sampleRate,
        bitDepth: project.bitDepth,
        status: 'draft',
      });

      // Copy tracks structure (without audio files)
      for (const track of tracks) {
        await storage.createStudioTrack({
          projectId: template.id,
          name: track.name,
          trackType: track.trackType,
          trackNumber: track.trackNumber,
          volume: track.volume,
          pan: track.pan,
          mute: false,
          solo: false,
          armed: false,
          recordEnabled: false,
          inputMonitoring: track.inputMonitoring,
          color: track.color,
          height: track.height,
          collapsed: track.collapsed,
          outputBus: track.outputBus,
        });
      }

      return template;
    } catch (error: unknown) {
      logger.error('Error saving as template:', error);
      throw new Error('Failed to save as template');
    }
  }
}

export const studioService = new StudioService();
