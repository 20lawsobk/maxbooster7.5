import { useState, useRef, useCallback } from 'react';
import { useAudioContext } from './useAudioContext';
import { logger } from '@/lib/logger';

export interface RecordingState {
  isRecording: boolean;
  isPlaying: boolean;
  isPaused: boolean;
  duration: number;
  currentTime: number;
  recordedBlobs: Blob[];
  audioUrl: string | null;
}

/**
 * TODO: Add function documentation
 */
export function useAudioRecorder() {
  const { context, isSupported } = useAudioContext();
  const [state, setState] = useState<RecordingState>({
    isRecording: false,
    isPlaying: false,
    isPaused: false,
    duration: 0,
    currentTime: 0,
    recordedBlobs: [],
    audioUrl: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number>();
  const startTimeRef = useRef<number>(0);

  const startRecording = useCallback(async () => {
    try {
      if (!isSupported) {
        throw new Error('Audio recording not supported');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100,
        },
      });

      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(blob);

        setState((prev) => ({
          ...prev,
          recordedBlobs: [...prev.recordedBlobs, blob],
          audioUrl,
          isRecording: false,
        }));
      };

      mediaRecorderRef.current = mediaRecorder;
      startTimeRef.current = Date.now();
      mediaRecorder.start(100); // Collect data every 100ms

      setState((prev) => ({ ...prev, isRecording: true, duration: 0 }));

      // Update recording duration
      const updateDuration = () => {
        if (mediaRecorderRef.current?.state === 'recording') {
          const duration = (Date.now() - startTimeRef.current) / 1000;
          setState((prev) => ({ ...prev, duration }));
          animationFrameRef.current = requestAnimationFrame(updateDuration);
        }
      };
      updateDuration();
    } catch (error: unknown) {
      logger.error('Error starting recording:', error);
      throw error;
    }
  }, [isSupported]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording) {
      mediaRecorderRef.current.stop();

      // Stop all tracks to release the microphone
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
  }, [state.isRecording]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording) {
      mediaRecorderRef.current.pause();
      setState((prev) => ({ ...prev, isPaused: true }));
    }
  }, [state.isRecording]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isPaused) {
      mediaRecorderRef.current.resume();
      setState((prev) => ({ ...prev, isPaused: false }));
    }
  }, [state.isPaused]);

  const playRecording = useCallback(() => {
    if (state.audioUrl && !state.isPlaying) {
      if (!audioElementRef.current) {
        audioElementRef.current = new Audio();
      }

      const audio = audioElementRef.current;
      audio.src = state.audioUrl;
      audio.currentTime = state.currentTime;

      audio.addEventListener('timeupdate', () => {
        setState((prev) => ({ ...prev, currentTime: audio.currentTime }));
      });

      audio.addEventListener('ended', () => {
        setState((prev) => ({ ...prev, isPlaying: false, currentTime: 0 }));
      });

      audio.play();
      setState((prev) => ({ ...prev, isPlaying: true }));
    }
  }, [state.audioUrl, state.isPlaying, state.currentTime]);

  const pausePlayback = useCallback(() => {
    if (audioElementRef.current && state.isPlaying) {
      audioElementRef.current.pause();
      setState((prev) => ({ ...prev, isPlaying: false }));
    }
  }, [state.isPlaying]);

  const stopPlayback = useCallback(() => {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
      setState((prev) => ({ ...prev, isPlaying: false, currentTime: 0 }));
    }
  }, []);

  const seekTo = useCallback((time: number) => {
    if (audioElementRef.current) {
      audioElementRef.current.currentTime = time;
      setState((prev) => ({ ...prev, currentTime: time }));
    }
  }, []);

  const clearRecordings = useCallback(() => {
    // Clean up object URLs
    if (state.audioUrl) {
      URL.revokeObjectURL(state.audioUrl);
    }

    setState({
      isRecording: false,
      isPlaying: false,
      isPaused: false,
      duration: 0,
      currentTime: 0,
      recordedBlobs: [],
      audioUrl: null,
    });

    if (audioElementRef.current) {
      audioElementRef.current = null;
    }
  }, [state.audioUrl]);

  const exportRecording = useCallback(
    async (format: 'wav' | 'mp3' = 'wav') => {
      if (!state.audioUrl) return null;

      try {
        // Convert the recorded blob to the desired format
        const response = await fetch(state.audioUrl);
        const blob = await response.blob();

        // For now, return the blob as-is (WebM format)
        // In a real implementation, you'd convert to the target format
        return blob;
      } catch (error: unknown) {
        logger.error('Error exporting recording:', error);
        return null;
      }
    },
    [state.audioUrl]
  );

  const uploadRecording = useCallback(
    async (trackId: string) => {
      const blob = await exportRecording();
      if (!blob) return null;

      try {
        const formData = new FormData();
        formData.append('audio', blob, `recording_${Date.now()}.webm`);
        formData.append('trackId', trackId);

        const response = await fetch('/api/audio/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error('Failed to upload recording');
        }

        return await response.json();
      } catch (error: unknown) {
        logger.error('Error uploading recording:', error);
        throw error;
      }
    },
    [exportRecording]
  );

  return {
    ...state,
    isSupported,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    playRecording,
    pausePlayback,
    stopPlayback,
    seekTo,
    clearRecordings,
    exportRecording,
    uploadRecording,
  };
}
