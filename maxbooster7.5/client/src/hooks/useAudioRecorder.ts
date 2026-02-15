import { useState, useRef, useCallback, useEffect } from 'react';
import { useAudioContext } from './useAudioContext';
import { logger } from '@/lib/logger';

export interface RecordingState {
  isRecording: boolean;
  isPlaying: boolean;
  isPaused: boolean;
  duration: number;
  currentTime: number;
  recordedBlob: Blob | null;
  audioUrl: string | null;
  inputLevel: number;
}

export function useAudioRecorder() {
  const { context, isSupported } = useAudioContext();
  const [state, setState] = useState<RecordingState>({
    isRecording: false,
    isPlaying: false,
    isPaused: false,
    duration: 0,
    currentTime: 0,
    recordedBlob: null,
    audioUrl: null,
    inputLevel: 0,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const startMonitoring = useCallback(async (deviceId?: string) => {
    try {
      if (!isSupported || !context) {
        throw new Error('Audio recording not supported');
      }

      if (context.state === 'suspended') {
        await context.resume();
      }

      const constraints: MediaStreamConstraints = {
        audio: deviceId 
          ? { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true }
          : { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const source = context.createMediaStreamSource(stream);
      sourceNodeRef.current = source;
      
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Float32Array(analyser.fftSize);

      const updateLevel = () => {
        if (analyserRef.current && streamRef.current) {
          analyserRef.current.getFloatTimeDomainData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i] * dataArray[i];
          }
          const rms = Math.sqrt(sum / dataArray.length);
          const db = 20 * Math.log10(Math.max(rms, 1e-10));
          const normalizedLevel = Math.max(0, Math.min(1, (db + 60) / 60));
          setState((prev) => ({ ...prev, inputLevel: normalizedLevel }));
          animationFrameRef.current = requestAnimationFrame(updateLevel);
        }
      };
      updateLevel();

      return stream;
    } catch (error) {
      logger.error('Error starting monitoring:', error);
      throw error;
    }
  }, [isSupported, context]);

  const stopMonitoring = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    
    analyserRef.current = null;
    
    if (streamRef.current && !state.isRecording) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    
    setState((prev) => ({ ...prev, inputLevel: 0 }));
  }, [state.isRecording]);

  const startRecording = useCallback(async (deviceId?: string) => {
    try {
      let stream = streamRef.current;
      if (!stream || stream.getTracks().every(t => t.readyState === 'ended')) {
        stream = await startMonitoring(deviceId);
      }

      if (!stream) {
        throw new Error('No audio stream available');
      }

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        const audioUrl = URL.createObjectURL(blob);

        setState((prev) => ({
          ...prev,
          recordedBlob: blob,
          audioUrl,
          isRecording: false,
        }));

        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current);
          durationIntervalRef.current = null;
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      startTimeRef.current = Date.now();
      mediaRecorder.start(100);

      setState((prev) => ({ ...prev, isRecording: true, duration: 0, recordedBlob: null, audioUrl: null }));

      durationIntervalRef.current = setInterval(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          const duration = (Date.now() - startTimeRef.current) / 1000;
          setState((prev) => ({ ...prev, duration }));
        }
      }, 100);

    } catch (error) {
      logger.error('Error starting recording:', error);
      throw error;
    }
  }, [startMonitoring]);

  const stopRecording = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    stopMonitoring();
  }, [stopMonitoring]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording && !state.isPaused) {
      mediaRecorderRef.current.pause();
      setState((prev) => ({ ...prev, isPaused: true }));
    }
  }, [state.isRecording, state.isPaused]);

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

      audio.ontimeupdate = () => {
        setState((prev) => ({ ...prev, currentTime: audio.currentTime }));
      };

      audio.onended = () => {
        setState((prev) => ({ ...prev, isPlaying: false, currentTime: 0 }));
      };

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

  const clearRecording = useCallback(() => {
    if (state.audioUrl) {
      URL.revokeObjectURL(state.audioUrl);
    }
    setState((prev) => ({
      ...prev,
      duration: 0,
      currentTime: 0,
      recordedBlob: null,
      audioUrl: null,
    }));
  }, [state.audioUrl]);

  const uploadRecording = useCallback(
    async (projectId: string, trackId: string, startTime: number = 0): Promise<{ clipId: string } | null> => {
      if (!state.recordedBlob) {
        logger.warn('No recording to upload');
        return null;
      }

      try {
        const formData = new FormData();
        const filename = `recording_${Date.now()}.webm`;
        formData.append('audio', state.recordedBlob, filename);
        formData.append('name', `Recording ${new Date().toLocaleTimeString()}`);
        formData.append('startTime', startTime.toString());
        formData.append('duration', state.duration.toString());

        const response = await fetch(`/api/studio/projects/${projectId}/tracks/${trackId}/clips/upload`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
          throw new Error(errorData.error || 'Failed to upload recording');
        }

        const result = await response.json();
        clearRecording();
        return result;
      } catch (error) {
        logger.error('Error uploading recording:', error);
        throw error;
      }
    },
    [state.recordedBlob, state.duration, clearRecording]
  );

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (state.audioUrl) {
        URL.revokeObjectURL(state.audioUrl);
      }
    };
  }, []);

  return {
    ...state,
    isSupported,
    startMonitoring,
    stopMonitoring,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    playRecording,
    pausePlayback,
    stopPlayback,
    clearRecording,
    uploadRecording,
  };
}
