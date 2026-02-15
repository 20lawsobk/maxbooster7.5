import type { VideoProject, RenderProgress } from '../../../../shared/video/VideoRendererEngine';

export type VideoFormat = 'webm' | 'mp4';
export type VideoResolution = '720p' | '1080p' | '4k';
export type FrameRate = 24 | 30 | 60;

export interface ResolutionConfig {
  width: number;
  height: number;
}

export const RESOLUTION_PRESETS: Record<VideoResolution, ResolutionConfig> = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '4k': { width: 3840, height: 2160 },
};

export interface ExportOptions {
  format: VideoFormat;
  resolution: VideoResolution;
  frameRate: FrameRate;
  videoBitrate?: number;
  audioBitrate?: number;
  audioUrl?: string;
  onProgress?: (progress: ExportProgress) => void;
  signal?: AbortSignal;
}

export interface ExportProgress {
  phase: 'preparing' | 'rendering' | 'encoding' | 'muxing' | 'finalizing';
  currentFrame: number;
  totalFrames: number;
  percentage: number;
  estimatedTimeRemaining: number;
  elapsedTime: number;
}

export interface ExportResult {
  blob: Blob;
  format: VideoFormat;
  resolution: ResolutionConfig;
  duration: number;
  fileSize: number;
}

export type FrameRenderer = (
  canvas: HTMLCanvasElement | OffscreenCanvas,
  frameNumber: number,
  timestamp: number
) => void | Promise<void>;

export class VideoExportError extends Error {
  constructor(
    message: string,
    public readonly code: VideoExportErrorCode,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'VideoExportError';
  }
}

export type VideoExportErrorCode =
  | 'UNSUPPORTED_FORMAT'
  | 'MEDIARECORDER_NOT_SUPPORTED'
  | 'CANVAS_CAPTURE_FAILED'
  | 'ENCODING_FAILED'
  | 'AUDIO_LOAD_FAILED'
  | 'MUXING_FAILED'
  | 'ABORTED'
  | 'UNKNOWN';

function getMimeType(format: VideoFormat): string {
  const mimeTypes: Record<VideoFormat, string[]> = {
    webm: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'],
    mp4: ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4'],
  };

  for (const mimeType of mimeTypes[format]) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }

  throw new VideoExportError(
    `No supported codec found for format: ${format}`,
    'UNSUPPORTED_FORMAT'
  );
}

function getDefaultBitrate(resolution: VideoResolution, frameRate: FrameRate): number {
  const baseBitrates: Record<VideoResolution, number> = {
    '720p': 5_000_000,
    '1080p': 10_000_000,
    '4k': 35_000_000,
  };

  const fpsMultiplier = frameRate / 30;
  return Math.round(baseBitrates[resolution] * fpsMultiplier);
}

export class VideoExporter {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private canvas: HTMLCanvasElement | null = null;
  private stream: MediaStream | null = null;
  private isExporting: boolean = false;
  private aborted: boolean = false;
  private startTime: number = 0;

  async export(
    project: VideoProject,
    frameRenderer: FrameRenderer,
    options: ExportOptions
  ): Promise<ExportResult> {
    if (typeof MediaRecorder === 'undefined') {
      throw new VideoExportError(
        'MediaRecorder API is not supported in this browser',
        'MEDIARECORDER_NOT_SUPPORTED'
      );
    }

    if (this.isExporting) {
      throw new VideoExportError(
        'Export already in progress',
        'ENCODING_FAILED'
      );
    }

    this.isExporting = true;
    this.aborted = false;
    this.recordedChunks = [];
    this.startTime = performance.now();

    const resolution = RESOLUTION_PRESETS[options.resolution];
    const { frameRate, format } = options;
    const videoBitrate = options.videoBitrate ?? getDefaultBitrate(options.resolution, frameRate);

    if (options.signal) {
      options.signal.addEventListener('abort', () => {
        this.abort();
      });
    }

    try {
      this.reportProgress(options.onProgress, {
        phase: 'preparing',
        currentFrame: 0,
        totalFrames: Math.ceil(project.duration * frameRate),
        percentage: 0,
        estimatedTimeRemaining: 0,
        elapsedTime: 0,
      });

      this.canvas = document.createElement('canvas');
      this.canvas.width = resolution.width;
      this.canvas.height = resolution.height;

      this.stream = this.canvas.captureStream(frameRate);
      if (!this.stream) {
        throw new VideoExportError(
          'Failed to capture canvas stream',
          'CANVAS_CAPTURE_FAILED'
        );
      }

      const mimeType = getMimeType(format);

      const recorderOptions: MediaRecorderOptions = {
        mimeType,
        videoBitsPerSecond: videoBitrate,
      };

      if (options.audioBitrate) {
        recorderOptions.audioBitsPerSecond = options.audioBitrate;
      }

      this.mediaRecorder = new MediaRecorder(this.stream, recorderOptions);

      const videoBlob = await this.recordFrames(
        project,
        frameRenderer,
        resolution,
        frameRate,
        options.onProgress
      );

      if (this.aborted) {
        throw new VideoExportError('Export was cancelled', 'ABORTED');
      }

      let finalBlob = videoBlob;

      if (options.audioUrl) {
        this.reportProgress(options.onProgress, {
          phase: 'muxing',
          currentFrame: Math.ceil(project.duration * frameRate),
          totalFrames: Math.ceil(project.duration * frameRate),
          percentage: 95,
          estimatedTimeRemaining: 0,
          elapsedTime: (performance.now() - this.startTime) / 1000,
        });

        finalBlob = await this.muxAudio(videoBlob, options.audioUrl, format, options.audioBitrate);
      }

      this.reportProgress(options.onProgress, {
        phase: 'finalizing',
        currentFrame: Math.ceil(project.duration * frameRate),
        totalFrames: Math.ceil(project.duration * frameRate),
        percentage: 100,
        estimatedTimeRemaining: 0,
        elapsedTime: (performance.now() - this.startTime) / 1000,
      });

      return {
        blob: finalBlob,
        format,
        resolution,
        duration: project.duration,
        fileSize: finalBlob.size,
      };
    } finally {
      this.cleanup();
    }
  }

  private async recordFrames(
    project: VideoProject,
    frameRenderer: FrameRenderer,
    resolution: ResolutionConfig,
    frameRate: FrameRate,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || !this.canvas) {
        reject(new VideoExportError('Recorder not initialized', 'ENCODING_FAILED'));
        return;
      }

      const totalFrames = Math.ceil(project.duration * frameRate);
      const frameDuration = 1000 / frameRate;
      let currentFrame = 0;

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        const mimeType = this.mediaRecorder?.mimeType ?? 'video/webm';
        const blob = new Blob(this.recordedChunks, { type: mimeType });
        resolve(blob);
      };

      this.mediaRecorder.onerror = (event) => {
        reject(new VideoExportError(
          `MediaRecorder error: ${(event as ErrorEvent).message || 'Unknown error'}`,
          'ENCODING_FAILED',
          event
        ));
      };

      this.mediaRecorder.start();

      const renderNextFrame = async () => {
        if (this.aborted) {
          this.mediaRecorder?.stop();
          return;
        }

        if (currentFrame >= totalFrames) {
          this.mediaRecorder?.stop();
          return;
        }

        const timestamp = currentFrame / frameRate;

        try {
          await frameRenderer(this.canvas!, currentFrame, timestamp);
        } catch (error) {
          reject(new VideoExportError(
            `Frame rendering failed at frame ${currentFrame}`,
            'ENCODING_FAILED',
            error
          ));
          return;
        }

        currentFrame++;

        const elapsedTime = (performance.now() - this.startTime) / 1000;
        const framesPerSecond = currentFrame / elapsedTime;
        const remainingFrames = totalFrames - currentFrame;
        const estimatedTimeRemaining = framesPerSecond > 0 ? remainingFrames / framesPerSecond : 0;

        this.reportProgress(onProgress, {
          phase: 'rendering',
          currentFrame,
          totalFrames,
          percentage: Math.round((currentFrame / totalFrames) * 90),
          estimatedTimeRemaining,
          elapsedTime,
        });

        requestAnimationFrame(() => {
          setTimeout(renderNextFrame, 0);
        });
      };

      renderNextFrame();
    });
  }

  private async muxAudio(
    videoBlob: Blob,
    audioUrl: string,
    format: VideoFormat,
    audioBitrate?: number
  ): Promise<Blob> {
    try {
      const audioResponse = await fetch(audioUrl);
      if (!audioResponse.ok) {
        throw new VideoExportError(
          `Failed to fetch audio: ${audioResponse.status} ${audioResponse.statusText}`,
          'AUDIO_LOAD_FAILED'
        );
      }

      const audioContext = new AudioContext();
      const audioBuffer = await audioContext.decodeAudioData(await audioResponse.arrayBuffer());
      
      const offlineContext = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        audioBuffer.length,
        audioBuffer.sampleRate
      );

      const source = offlineContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(offlineContext.destination);
      source.start();

      const renderedBuffer = await offlineContext.startRendering();

      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const stream = canvas.captureStream(1);

      const audioDestination = audioContext.createMediaStreamDestination();
      const bufferSource = audioContext.createBufferSource();
      bufferSource.buffer = renderedBuffer;
      bufferSource.connect(audioDestination);

      for (const track of audioDestination.stream.getAudioTracks()) {
        stream.addTrack(track);
      }

      const combinedStream = new MediaStream([
        ...stream.getVideoTracks(),
        ...audioDestination.stream.getAudioTracks(),
      ]);

      const mimeType = getMimeType(format);
      const recorder = new MediaRecorder(combinedStream, {
        mimeType,
        audioBitsPerSecond: audioBitrate ?? 128000,
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      return new Promise((resolve, reject) => {
        recorder.onstop = () => {
          audioContext.close();
          resolve(new Blob([videoBlob, ...chunks], { type: mimeType }));
        };
        recorder.onerror = (e) => {
          audioContext.close();
          reject(new VideoExportError('Audio muxing failed', 'MUXING_FAILED', e));
        };

        bufferSource.start();
        recorder.start();
        
        setTimeout(() => {
          recorder.stop();
          bufferSource.stop();
        }, renderedBuffer.duration * 1000);
      });
    } catch (error) {
      if (error instanceof VideoExportError) throw error;
      throw new VideoExportError(
        `Audio muxing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'MUXING_FAILED',
        error
      );
    }
  }

  abort(): void {
    this.aborted = true;
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.cleanup();
  }

  private cleanup(): void {
    this.isExporting = false;
    
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
    
    this.mediaRecorder = null;
    this.canvas = null;
    this.recordedChunks = [];
  }

  private reportProgress(
    callback: ((progress: ExportProgress) => void) | undefined,
    progress: ExportProgress
  ): void {
    if (callback) {
      callback(progress);
    }
  }

  isActive(): boolean {
    return this.isExporting;
  }

  static isFormatSupported(format: VideoFormat): boolean {
    try {
      getMimeType(format);
      return true;
    } catch {
      return false;
    }
  }

  static getSupportedFormats(): VideoFormat[] {
    const formats: VideoFormat[] = ['webm', 'mp4'];
    return formats.filter((format) => VideoExporter.isFormatSupported(format));
  }

  static getRecommendedBitrate(resolution: VideoResolution, frameRate: FrameRate): number {
    return getDefaultBitrate(resolution, frameRate);
  }
}

export async function exportToFile(
  project: VideoProject,
  frameRenderer: FrameRenderer,
  options: ExportOptions,
  filename?: string
): Promise<void> {
  const exporter = new VideoExporter();
  const result = await exporter.export(project, frameRenderer, options);

  const url = URL.createObjectURL(result.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename ?? `export_${Date.now()}.${options.format}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function createExportAbortController(): AbortController {
  return new AbortController();
}
