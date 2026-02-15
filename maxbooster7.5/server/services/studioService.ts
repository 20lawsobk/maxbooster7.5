import { storage } from '../storage';
import type {
  InsertProject,
  Project,
  StudioTrack,
} from '@shared/schema';
import { nanoid } from 'nanoid';
import fs from 'fs';
import path from 'path';
import { logger } from '../logger.js';

interface InsertStudioTrack {
  projectId: string;
  name: string;
  trackType?: string | null;
  color?: string | null;
  volume?: number | null;
  pan?: number | null;
  mute?: boolean;
  solo?: boolean;
  armed?: boolean;
  recordEnabled?: boolean;
  inputMonitoring?: boolean;
  trackNumber?: number;
  height?: number;
  collapsed?: boolean;
  outputBus?: string;
  frozen?: boolean;
  frozenFilePath?: string | null;
  inputSource?: string | null;
  order?: number;
  metadata?: unknown;
}

interface Collaborator {
  userId?: string;
  email?: string;
  role: 'view' | 'edit' | 'admin';
  addedAt?: Date;
}

interface AutosaveState {
  playPosition?: number;
  project?: Project;
  tracks?: StudioTrack[];
}

interface AudioClipData {
  id?: string;
  trackId: string;
  name: string;
  filePath?: string;
  originalFilename?: string;
  fileSize?: number;
  startTime: number;
  endTime: number;
  duration?: number;
  offset?: number;
  gain?: number;
  fadeIn?: number;
  fadeOut?: number;
  takeNumber?: number;
  takeGroupId?: string;
  isComped?: boolean;
  waveformData?: number[];
  peakData?: number[];
}

interface AudioClip extends AudioClipData {
  id: string;
}

interface AudioEffect {
  id: string;
  trackId: string;
  projectId: string;
  chainPosition?: number;
  [key: string]: unknown;
}

interface AudioEffectData {
  trackId?: string;
  projectId?: string;
  [key: string]: unknown;
}

interface AutomationData {
  id: string;
  [key: string]: unknown;
}

interface Autosave {
  id: number;
  projectId: string;
  authorId: string;
  label: string;
  state: unknown;
}

interface RecordingUploadResult {
  clipId: string;
  url: string;
  takeNumber: number;
  takeGroupId: string;
}

interface TrackTemplate {
  name: string;
  trackType: string;
  trackNumber: number;
  color: string;
}

interface ProjectTemplate {
  name: string;
  description: string;
  bpm: number;
  timeSignature: string;
  tracks: TrackTemplate[];
}

interface StudioProjectExtended extends Project {
  collaborators?: Collaborator[] | null;
  totalTracks?: number;
  lastPlayPosition?: number;
}

type StudioProject = StudioProjectExtended;
type InsertStudioProject = InsertProject;

const storageAny = storage as unknown as {
  createStudioProject(data: InsertStudioProject): Promise<StudioProject>;
  getUserStudioProjects(userId: string): Promise<StudioProject[]>;
  getStudioProject(projectId: string): Promise<StudioProject | undefined>;
  updateStudioProject(projectId: string, userId: string, updates: Partial<StudioProject>): Promise<StudioProject>;
  deleteStudioProject(projectId: string, userId: string): Promise<void>;
  getProject(projectId: string): Promise<Project | undefined>;
  updateProject(projectId: string, updates: Partial<Project>): Promise<Project>;
  createProject(data: InsertProject): Promise<Project>;
  createStudioTrack(data: InsertStudioTrack): Promise<StudioTrack>;
  getProjectTracks(projectId: string): Promise<StudioTrack[]>;
  updateStudioTrack(trackId: string, projectId: string, updates: Partial<StudioTrack>): Promise<StudioTrack>;
  deleteStudioTrack(trackId: string, projectId: string): Promise<void>;
  getStudioTrack(trackId: string): Promise<StudioTrack | undefined>;
  getProjectEffects(projectId: string): Promise<AudioEffect[]>;
  getProjectAutomation(projectId: string): Promise<AutomationData[]>;
  getProjectMarkers(projectId: string): Promise<unknown[]>;
  getTrackAudioClips(trackId: string): Promise<AudioClip[]>;
  getTrackMidiClips(trackId: string): Promise<unknown[]>;
  createAudioClip(data: AudioClipData): Promise<AudioClip>;
  getClipsByTakeGroup(takeGroupId: string): Promise<AudioClip[]>;
  getTrackClips(trackId: string): Promise<AudioClip[]>;
  getAudioClip(clipId: string): Promise<AudioClip | undefined>;
  updateAudioClip(clipId: string, updates: Partial<AudioClipData>): Promise<AudioClip>;
  deleteAudioClip(clipId: string): Promise<void>;
  getTrackEffects(trackId: string): Promise<AudioEffect[]>;
  createAudioEffect(data: AudioEffectData): Promise<AudioEffect>;
  updateAudioEffect(effectId: string, updates: Partial<AudioEffectData>): Promise<AudioEffect>;
  deleteAudioEffect(effectId: string): Promise<void>;
  createAutomationData(data: unknown): Promise<AutomationData>;
  updateAutomationData(automationId: string, updates: unknown): Promise<AutomationData>;
  deleteAutomationData(automationId: string): Promise<void>;
  createAutosave(data: { projectId: string; authorId: string; label: string; state: unknown }): Promise<Autosave>;
  getProjectAutosaves(projectId: string): Promise<Autosave[]>;
  deleteAutosave(autosaveId: number): Promise<void>;
  getAutosave(autosaveId: number): Promise<Autosave | undefined>;
};

export class StudioService {
  async createProject(data: InsertStudioProject): Promise<StudioProject> {
    try {
      const project = await storageAny.createStudioProject(data);
      return project;
    } catch (error: unknown) {
      logger.error('Error creating studio project:', error);
      throw new Error('Failed to create studio project');
    }
  }

  async getUserProjects(userId: string): Promise<StudioProject[]> {
    try {
      return await storageAny.getUserStudioProjects(userId);
    } catch (error: unknown) {
      logger.error('Error fetching user projects:', error);
      throw new Error('Failed to fetch user projects');
    }
  }

  async getProject(projectId: string, userId: string): Promise<StudioProject | undefined> {
    try {
      const project = await storageAny.getStudioProject(projectId);

      if (!project) {
        return undefined;
      }

      if (project.userId !== userId) {
        const collaborators = (project.collaborators as Collaborator[] | null) || [];
        const isCollaborator = collaborators.some((c: Collaborator) => c.userId === userId);

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

  async updateProject(
    projectId: string,
    userId: string,
    updates: Partial<StudioProject>
  ): Promise<StudioProject> {
    try {
      return await storageAny.updateStudioProject(projectId, userId, updates);
    } catch (error: unknown) {
      logger.error('Error updating project:', error);
      throw new Error('Failed to update project');
    }
  }

  async deleteProject(projectId: string, userId: string): Promise<void> {
    try {
      await storageAny.deleteStudioProject(projectId, userId);
    } catch (error: unknown) {
      logger.error('Error deleting project:', error);
      throw new Error('Failed to delete project');
    }
  }

  async addTrack(projectId: string, trackData: InsertStudioTrack): Promise<StudioTrack> {
    try {
      const project = await storageAny.getProject(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      const track = await storageAny.createStudioTrack(trackData);

      await storageAny.updateProject(projectId, {
        totalTracks: ((project as { totalTracks?: number }).totalTracks || 0) + 1,
      } as Partial<Project>);

      return track;
    } catch (error: unknown) {
      logger.error('Error adding track:', error);
      throw new Error('Failed to add track');
    }
  }

  async getProjectTracks(projectId: string): Promise<StudioTrack[]> {
    try {
      return await storageAny.getProjectTracks(projectId);
    } catch (error: unknown) {
      logger.error('Error fetching project tracks:', error);
      throw new Error('Failed to fetch project tracks');
    }
  }

  async updateTrack(
    trackId: string,
    projectId: string,
    updates: Partial<StudioTrack>
  ): Promise<StudioTrack> {
    try {
      return await storageAny.updateStudioTrack(trackId, projectId, updates);
    } catch (error: unknown) {
      logger.error('Error updating track:', error);
      throw new Error('Failed to update track');
    }
  }

  async deleteTrack(trackId: string, projectId: string): Promise<void> {
    try {
      await storageAny.deleteStudioTrack(trackId, projectId);

      const project = await storageAny.getStudioProject(projectId);
      if (project) {
        await storageAny.updateStudioProject(projectId, project.userId, {
          totalTracks: Math.max(0, ((project as { totalTracks?: number }).totalTracks || 1) - 1),
        } as Partial<StudioProject>);
      }
    } catch (error: unknown) {
      logger.error('Error deleting track:', error);
      throw new Error('Failed to delete track');
    }
  }

  async uploadAudio(
    file: Express.Multer.File,
    userId: string
  ): Promise<{ id: string; url: string; duration?: number }> {
    try {
      const audioId = `audio_${nanoid()}`;
      const ext = path.extname(file.originalname);
      const fileName = `${audioId}${ext}`;
      const uploadPath = path.join(process.cwd(), 'uploads', 'audio', fileName);

      const audioDir = path.join(process.cwd(), 'uploads', 'audio');
      
      // Use async operations to avoid blocking event loop
      const fsPromises = await import('fs/promises');
      try {
        await fsPromises.access(audioDir);
      } catch {
        await fsPromises.mkdir(audioDir, { recursive: true });
      }

      // Use async rename instead of sync
      await fsPromises.rename(file.path, uploadPath);

      return {
        id: audioId,
        url: `/uploads/audio/${fileName}`,
        duration: undefined,
      };
    } catch (error: unknown) {
      logger.error('Error uploading audio:', error);
      throw new Error('Failed to upload audio file');
    }
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operationName: string
  ): Promise<T> {
    let timeoutId: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timeoutId!);
      return result;
    } catch (error) {
      clearTimeout(timeoutId!);
      throw error;
    }
  }

  async processAudio(
    audioId: string,
    audioPath: string,
    userId?: string
  ): Promise<{ waveformData: number[]; peaks: number[] }> {
    const AUDIO_PROCESSING_TIMEOUT_MS = 60000; // 60 second timeout for audio processing
    const MAX_WAVEFORM_SAMPLES = 100000; // Limit memory usage

    try {
      const { audioService } = await import('./audioService');
      
      // Wrap waveform generation with timeout to prevent hanging
      const waveformResult = await this.withTimeout(
        audioService.generateWaveform(audioPath, userId || 'system'),
        AUDIO_PROCESSING_TIMEOUT_MS,
        'Audio waveform generation'
      );
      
      let waveformData = Array.isArray(waveformResult) ? waveformResult : [];
      
      // Limit memory usage by downsampling if too many samples
      if (waveformData.length > MAX_WAVEFORM_SAMPLES) {
        const ratio = Math.ceil(waveformData.length / MAX_WAVEFORM_SAMPLES);
        waveformData = waveformData.filter((_, i) => i % ratio === 0);
      }

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

  async saveAutosave(projectId: string, userId: string, state: AutosaveState): Promise<void> {
    try {
      await storageAny.updateStudioProject(projectId, userId, {
        lastPlayPosition: state.playPosition || 0,
        updatedAt: new Date(),
      } as Partial<StudioProject>);
    } catch (error: unknown) {
      logger.error('Error saving autosave:', error);
      throw new Error('Failed to save autosave');
    }
  }

  async loadProject(
    projectId: string,
    userId: string
  ): Promise<{
    project: StudioProject;
    tracks: StudioTrack[];
    audioClips: AudioClip[];
    midiClips: unknown[];
    effects: AudioEffect[];
    automation: AutomationData[];
    markers: unknown[];
  }> {
    try {
      const project = await this.getProject(projectId, userId);
      if (!project) {
        throw new Error('Project not found');
      }

      const tracks = await storageAny.getProjectTracks(projectId);
      const effects = await storageAny.getProjectEffects(projectId);
      const automation = await storageAny.getProjectAutomation(projectId);
      const markers = await storageAny.getProjectMarkers(projectId);

      const audioClips: AudioClip[] = [];
      const midiClips: unknown[] = [];

      for (const track of tracks) {
        const trackAudioClips = await storageAny.getTrackAudioClips(track.id);
        const trackMidiClips = await storageAny.getTrackMidiClips(track.id);
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
  ): Promise<RecordingUploadResult> {
    try {
      const clipId = `clip_${nanoid()}`;
      const ext = path.extname(file.originalname);
      const fileName = `${clipId}${ext}`;
      const uploadPath = path.join(process.cwd(), 'uploads', 'audio', fileName);

      const audioDir = path.join(process.cwd(), 'uploads', 'audio');
      
      // Use async operations to avoid blocking event loop
      const fsPromises = await import('fs/promises');
      try {
        await fsPromises.access(audioDir);
      } catch {
        await fsPromises.mkdir(audioDir, { recursive: true });
      }

      await fsPromises.rename(file.path, uploadPath);

      const audioClip = await storageAny.createAudioClip({
        id: clipId,
        trackId: options.trackId,
        name: `Take ${options.takeNumber}`,
        filePath: `/uploads/audio/${fileName}`,
        originalFilename: file.originalname,
        fileSize: file.size,
        startTime: options.startPosition,
        endTime: options.startPosition + 10,
        takeNumber: options.takeNumber,
        takeGroupId: options.takeGroupId || nanoid(),
        isComped: false,
      });

      return {
        clipId: audioClip.id,
        url: `/uploads/audio/${fileName}`,
        takeNumber: options.takeNumber,
        takeGroupId: audioClip.takeGroupId || '',
      };
    } catch (error: unknown) {
      logger.error('Error uploading recording:', error);
      throw new Error('Failed to upload recording');
    }
  }

  async getClipsByTakeGroup(takeGroupId: string): Promise<AudioClip[]> {
    try {
      return await storageAny.getClipsByTakeGroup(takeGroupId);
    } catch (error: unknown) {
      logger.error('Error fetching clips by take group:', error);
      throw new Error('Failed to fetch clips by take group');
    }
  }

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

      return {
        exportId,
        status: 'processing',
      };
    } catch (error: unknown) {
      logger.error('Error exporting project:', error);
      throw new Error('Failed to export project');
    }
  }

  async addCollaborator(
    projectId: string,
    userId: string,
    collaboratorEmail: string,
    role: 'view' | 'edit' | 'admin'
  ): Promise<void> {
    try {
      const project = await storageAny.getStudioProject(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      if (project.userId !== userId) {
        throw new Error('Only project owner can add collaborators');
      }

      const collaborators = (project.collaborators as Collaborator[] | null) || [];
      collaborators.push({
        email: collaboratorEmail,
        role,
        addedAt: new Date(),
      });

      await storageAny.updateStudioProject(projectId, userId, {
        collaborators,
      } as Partial<StudioProject>);
    } catch (error: unknown) {
      logger.error('Error adding collaborator:', error);
      throw new Error('Failed to add collaborator');
    }
  }

  async createAudioClip(clipData: AudioClipData): Promise<AudioClip> {
    try {
      return await storageAny.createAudioClip(clipData);
    } catch (error: unknown) {
      logger.error('Error creating audio clip:', error);
      throw new Error('Failed to create audio clip');
    }
  }

  async getTrackClips(trackId: string): Promise<AudioClip[]> {
    try {
      return await storageAny.getTrackClips(trackId);
    } catch (error: unknown) {
      logger.error('Error fetching track clips:', error);
      throw new Error('Failed to fetch track clips');
    }
  }

  async updateAudioClip(clipId: string, updates: Partial<AudioClipData>): Promise<AudioClip> {
    try {
      return await storageAny.updateAudioClip(clipId, updates);
    } catch (error: unknown) {
      logger.error('Error updating audio clip:', error);
      throw new Error('Failed to update audio clip');
    }
  }

  async deleteAudioClip(clipId: string): Promise<void> {
    try {
      await storageAny.deleteAudioClip(clipId);
    } catch (error: unknown) {
      logger.error('Error deleting audio clip:', error);
      throw new Error('Failed to delete audio clip');
    }
  }

  async normalizeClip(clipId: string): Promise<AudioClip> {
    try {
      const clip = await storageAny.getAudioClip(clipId);
      if (!clip) {
        throw new Error('Clip not found');
      }

      const peakData = (clip.peakData as number[] | null) || [];
      const peak = peakData.length > 0 ? Math.max(...peakData) : 0.5;

      const normalizeGain = peak > 0 ? 1.0 / peak : 1.0;

      return await this.updateAudioClip(clipId, { gain: normalizeGain });
    } catch (error: unknown) {
      logger.error('Error normalizing clip:', error);
      throw new Error('Failed to normalize clip');
    }
  }

  async splitClip(clipId: string, splitTime: number): Promise<{ clip1: AudioClip; clip2: AudioClip }> {
    try {
      const clip = await storageAny.getAudioClip(clipId);
      if (!clip) {
        throw new Error('Clip not found');
      }

      const clip1Duration = splitTime - clip.startTime;
      const clip2Duration = clip.endTime - splitTime;

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

      const clip2 = await this.createAudioClip({
        trackId: clip.trackId,
        name: `${clip.name} (2)`,
        filePath: clip.filePath,
        originalFilename: clip.originalFilename,
        duration: clip2Duration,
        startTime: splitTime,
        endTime: clip.endTime,
        offset: (clip.offset || 0) + clip1Duration,
        gain: clip.gain,
        fadeIn: 0,
        fadeOut: clip.fadeOut,
        waveformData: clip.waveformData,
        peakData: clip.peakData,
      });

      await this.deleteAudioClip(clipId);

      return { clip1, clip2 };
    } catch (error: unknown) {
      logger.error('Error splitting clip:', error);
      throw new Error('Failed to split clip');
    }
  }

  async addEffect(trackId: string, projectId: string, effectData: AudioEffectData): Promise<AudioEffect> {
    try {
      const effect = await storageAny.createAudioEffect({
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

  async getTrackEffects(trackId: string): Promise<AudioEffect[]> {
    try {
      const effects = await storageAny.getTrackEffects(trackId);
      return effects.sort((a: AudioEffect, b: AudioEffect) => (a.chainPosition || 0) - (b.chainPosition || 0));
    } catch (error: unknown) {
      logger.error('Error fetching track effects:', error);
      throw new Error('Failed to fetch track effects');
    }
  }

  async updateEffect(effectId: string, updates: Partial<AudioEffectData>): Promise<AudioEffect> {
    try {
      return await storageAny.updateAudioEffect(effectId, updates);
    } catch (error: unknown) {
      logger.error('Error updating effect:', error);
      throw new Error('Failed to update effect');
    }
  }

  async deleteEffect(effectId: string): Promise<void> {
    try {
      await storageAny.deleteAudioEffect(effectId);
    } catch (error: unknown) {
      logger.error('Error deleting effect:', error);
      throw new Error('Failed to delete effect');
    }
  }

  async reorderEffects(effectIds: string[]): Promise<void> {
    try {
      for (let i = 0; i < effectIds.length; i++) {
        await storageAny.updateAudioEffect(effectIds[i], { chainPosition: i });
      }
    } catch (error: unknown) {
      logger.error('Error reordering effects:', error);
      throw new Error('Failed to reorder effects');
    }
  }

  async saveAutomation(automationData: unknown): Promise<AutomationData> {
    try {
      return await storageAny.createAutomationData(automationData);
    } catch (error: unknown) {
      logger.error('Error saving automation:', error);
      throw new Error('Failed to save automation');
    }
  }

  async getProjectAutomationData(projectId: string): Promise<AutomationData[]> {
    try {
      return await storageAny.getProjectAutomation(projectId);
    } catch (error: unknown) {
      logger.error('Error fetching automation:', error);
      throw new Error('Failed to fetch automation');
    }
  }

  async updateAutomation(automationId: string, updates: unknown): Promise<AutomationData> {
    try {
      return await storageAny.updateAutomationData(automationId, updates);
    } catch (error: unknown) {
      logger.error('Error updating automation:', error);
      throw new Error('Failed to update automation');
    }
  }

  async deleteAutomation(automationId: string): Promise<void> {
    try {
      await storageAny.deleteAutomationData(automationId);
    } catch (error: unknown) {
      logger.error('Error deleting automation:', error);
      throw new Error('Failed to delete automation');
    }
  }

  async saveProject(
    projectId: string,
    userId: string,
    label: string = 'Manual save'
  ): Promise<void> {
    try {
      const projectData = await this.loadProject(projectId, userId);

      await storageAny.createAutosave({
        projectId,
        authorId: userId,
        label,
        state: projectData,
      });

      const autosaves = await storageAny.getProjectAutosaves(projectId);
      if (autosaves.length > 10) {
        const toDelete = autosaves.slice(10);
        for (const autosave of toDelete) {
          await storageAny.deleteAutosave(autosave.id);
        }
      }
    } catch (error: unknown) {
      logger.error('Error saving project:', error);
      throw new Error('Failed to save project');
    }
  }

  async getProjectAutosaves(projectId: string): Promise<Autosave[]> {
    try {
      return await storageAny.getProjectAutosaves(projectId);
    } catch (error: unknown) {
      logger.error('Error fetching autosaves:', error);
      throw new Error('Failed to fetch autosaves');
    }
  }

  async restoreFromAutosave(autosaveId: number, userId: string): Promise<Project> {
    try {
      const autosave = await storageAny.getAutosave(autosaveId);
      if (!autosave) {
        throw new Error('Autosave not found');
      }

      const state = autosave.state as AutosaveState;
      const project = state.project;

      if (!project) {
        throw new Error('Invalid autosave state');
      }

      const restoredProject = await storageAny.createProject({
        userId,
        title: `${project.title} (Restored)`,
        isStudioProject: true,
        bpm: project.bpm,
        timeSignature: project.timeSignature,
        key: project.key,
        sampleRate: project.sampleRate,
        bitDepth: project.bitDepth,
        status: 'draft',
      } as InsertProject);

      for (const track of state.tracks || []) {
        await storageAny.createStudioTrack({
          ...track,
          projectId: restoredProject.id,
        } as InsertStudioTrack);
      }

      return restoredProject;
    } catch (error: unknown) {
      logger.error('Error restoring from autosave:', error);
      throw new Error('Failed to restore from autosave');
    }
  }

  async freezeTrack(trackId: string, file: Express.Multer.File, projectId: string): Promise<{ success: boolean; frozenFilePath: string }> {
    try {
      const frozenId = `frozen_${nanoid()}`;
      const ext = path.extname(file.originalname);
      const fileName = `${frozenId}${ext}`;
      const uploadPath = path.join(process.cwd(), 'uploads', 'audio', fileName);

      const audioDir = path.join(process.cwd(), 'uploads', 'audio');
      if (!fs.existsSync(audioDir)) {
        fs.mkdirSync(audioDir, { recursive: true });
      }

      fs.renameSync(file.path, uploadPath);

      const frozenFilePath = `/uploads/audio/${fileName}`;

      await storageAny.updateStudioTrack(trackId, projectId, {
        frozen: true,
        frozenFilePath,
      } as Partial<StudioTrack>);

      return {
        success: true,
        frozenFilePath,
      };
    } catch (error: unknown) {
      logger.error('Error freezing track:', error);
      throw new Error('Failed to freeze track');
    }
  }

  async unfreezeTrack(trackId: string, projectId: string): Promise<{ success: boolean }> {
    try {
      const track = await storageAny.getStudioTrack(trackId);

      if (!track) {
        throw new Error('Track not found');
      }

      const frozenFilePath = (track as { frozenFilePath?: string }).frozenFilePath;
      if (frozenFilePath) {
        const frozenPath = path.join(process.cwd(), frozenFilePath);
        if (fs.existsSync(frozenPath)) {
          fs.unlinkSync(frozenPath);
        }
      }

      await storageAny.updateStudioTrack(trackId, projectId, {
        frozen: false,
        frozenFilePath: null,
      } as Partial<StudioTrack>);

      return {
        success: true,
      };
    } catch (error: unknown) {
      logger.error('Error unfreezing track:', error);
      throw new Error('Failed to unfreeze track');
    }
  }

  async createFromTemplate(userId: string, templateName: string): Promise<Project> {
    try {
      const templates = this.getBuiltInTemplates();
      const template = templates.find((t) => t.name === templateName);

      if (!template) {
        throw new Error('Template not found');
      }

      const project = await storageAny.createProject({
        userId,
        title: template.name,
        description: template.description,
        isStudioProject: true,
        bpm: template.bpm,
        timeSignature: template.timeSignature,
        sampleRate: 48000,
        bitDepth: 24,
        status: 'draft',
      } as InsertProject);

      for (const trackTemplate of template.tracks) {
        await storageAny.createStudioTrack({
          projectId: project.id,
          name: trackTemplate.name,
          trackType: trackTemplate.trackType,
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
        } as InsertStudioTrack);
      }

      return project;
    } catch (error: unknown) {
      logger.error('Error creating from template:', error);
      throw new Error('Failed to create from template');
    }
  }

  getBuiltInTemplates(): ProjectTemplate[] {
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

  async saveAsTemplate(projectId: string, userId: string, templateName: string): Promise<Project> {
    try {
      const project = await storageAny.getProject(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      const tracks = await storageAny.getProjectTracks(projectId);

      const template = await storageAny.createProject({
        userId,
        title: templateName,
        description: `Custom template created from ${project.title}`,
        isStudioProject: true,
        bpm: project.bpm,
        timeSignature: project.timeSignature,
        sampleRate: project.sampleRate,
        bitDepth: project.bitDepth,
        status: 'draft',
      } as InsertProject);

      for (const track of tracks) {
        await storageAny.createStudioTrack({
          projectId: template.id,
          name: track.name,
          trackType: track.trackType,
          trackNumber: (track as { trackNumber?: number }).trackNumber,
          volume: track.volume,
          pan: track.pan,
          mute: false,
          solo: false,
          armed: false,
          recordEnabled: false,
          inputMonitoring: (track as { inputMonitoring?: boolean }).inputMonitoring,
          color: track.color,
          height: (track as { height?: number }).height,
          collapsed: (track as { collapsed?: boolean }).collapsed,
          outputBus: (track as { outputBus?: string }).outputBus,
        } as InsertStudioTrack);
      }

      return template;
    } catch (error: unknown) {
      logger.error('Error saving as template:', error);
      throw new Error('Failed to save as template');
    }
  }
}

export const studioService = new StudioService();
