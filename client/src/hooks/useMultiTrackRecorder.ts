import { useState, useRef, useCallback } from "react";
import { useAudioContext } from "./useAudioContext";
import { useAudioDevices } from "./useAudioDevices";
import { nanoid } from "nanoid";
import { logger } from "@/lib/logger";
import { getCsrfTokenFromCookie } from "@/lib/queryClient";

export interface TrackRecorder {
  trackId: string;
  trackName: string;
  mediaRecorder: MediaRecorder | null;
  stream: MediaStream | null;
  audioChunks: Blob[];
  inputLevel: number;
}

export interface RecordingSession {
  sessionId: string;
  takeGroupId: string;
  takeNumber: number;
  startTime: number;
  startPosition: number;
  punchIn?: number;
  punchOut?: number;
  isLoopRecording: boolean;
}

export interface MultiTrackRecordingState {
  isRecording: boolean;
  isPunched: boolean;
  activeRecorders: Map<string, TrackRecorder>;
  currentSession: RecordingSession | null;
  duration: number;
  inputLevels: Map<string, number>;
  latencyMs: number;
  selectedInputDevice: string | null;
  bufferSize: number;
}

export function useMultiTrackRecorder(
  selectedDeviceId?: string | null,
  bufferSize?: number,
) {
  const { context, isSupported } = useAudioContext();
  const _audioDevices = useAudioDevices();

  // Use provided device/buffer OR fallback to audioDevices state
  const _effectiveDeviceId = selectedDeviceId ?? audioDevices?.selectedInput;
  const _effectiveBufferSize = bufferSize ?? 256;

  const [state, setState] = useState<MultiTrackRecordingState>({
    isRecording: false,
    isPunched: false,
    activeRecorders: new Map(),
    currentSession: null,
    duration: 0,
    inputLevels: new Map(),
    latencyMs: 0,
    selectedInputDevice: effectiveDeviceId,
    bufferSize: effectiveBufferSize,
  });

  const _analyzerNodesRef = useRef<Map<string, AnalyserNode>>(new Map());
  const _animationFrameRef = useRef<number>();
  const _sessionStartTimeRef = useRef<number>(0);

  const _measureLatency = useCallback(async (): Promise<number> => {
    if (!context) return 0;

    const _baseLatency = context?.baseLatency || 0;
    const _outputLatency = context?.outputLatency || 0;

    const _totalLatency = (baseLatency + outputLatency) * 1000;

    setState((prev) => ({ ...prev, latencyMs: totalLatency }));
    return totalLatency;
  }, [context]);

  const _startInputMonitoring = useCallback(
    async (trackId: string, _trackName: string) => {
      if (!context || !isSupported) return null;

      try {
        // Use selected input device
        const _stream = await audioDevices?.getInputStream(
          effectiveDeviceId || undefined,
          {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000, // Professional standard
          },
        );

        if (!stream) {
          throw new Error("Failed to get audio stream from selected device");
        }

        const _source = context?.createMediaStreamSource(stream);
        const _analyser = context?.createAnalyser();
        analyser?.fftSize = 256;

        source?.connect(analyser);
        analyzerNodesRef?.current.set(trackId, analyser);

        const _updateInputLevel = () => {
          const _dataArray = new Uint8Array(analyser?.frequencyBinCount);
          analyser?.getByteFrequencyData(dataArray);

          const _average =
            dataArray?.reduce((sum, value) => sum + value, 0) / dataArray?.length;
          const _normalizedLevel = average / 255;

          setState((prev) => {
            const _newLevels = new Map(prev?.inputLevels);
            newLevels?.set(trackId, normalizedLevel);
            return { ...prev, inputLevels: newLevels };
          });
        };

        const _intervalId = setInterval(updateInputLevel, 50);

        return { stream, source, analyser, intervalId };
      } catch (error: unknown) {
        logger?.error("Error starting input monitoring:", error);
        return null;
      }
    },
    [context, isSupported, audioDevices, effectiveDeviceId],
  );

  const _stopInputMonitoring = useCallback(
    (trackId: string, monitoringData: unknown) => {
      if (monitoringData) {
        if (monitoringData?.stream) {
          monitoringData?.stream
            .getTracks()
            .forEach((track: MediaStreamTrack) => track?.stop());
        }
        if (monitoringData?.intervalId) {
          clearInterval(monitoringData?.intervalId);
        }
      }

      analyzerNodesRef?.current.delete(trackId);
      setState((prev) => {
        const _newLevels = new Map(prev?.inputLevels);
        newLevels?.delete(trackId);
        return { ...prev, inputLevels: newLevels };
      });
    },
    [],
  );

  const _startRecording = useCallback(
    async (
      armedTracks: Array<{ id: string; name: string }>,
      options: {
        startPosition: number;
        takeNumber?: number;
        takeGroupId?: string;
        punchIn?: number;
        punchOut?: number;
        isLoopRecording?: boolean;
      },
    ) => {
      if (!context || !isSupported) {
        throw new Error("Audio recording not supported");
      }

      try {
        const _sessionId = nanoid();
        const _takeGroupId = options?.takeGroupId || nanoid();
        const _takeNumber = options?.takeNumber || 1;

        const _newRecorders = new Map<string, TrackRecorder>();

        for (const track of armedTracks) {
          // Use selected input device for recording
          const _stream = await audioDevices?.getInputStream(
            effectiveDeviceId || undefined,
            {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              sampleRate: 48000,
            },
          );

          if (!stream) {
            throw new Error(
              `Failed to get audio stream for track ${track?.name}`,
            );
          }

          const _mediaRecorder = new MediaRecorder(stream, {
            mimeType: "audio/webm;codecs=opus",
          });

          const audioChunks: Blob[] = [];

          mediaRecorder?.ondataavailable = (event) => {
            if (event?.data.size > 0) {
              audioChunks?.push(event?.data);
              newRecorders?.get(track?.id)!.audioChunks = audioChunks;
            }
          };

          mediaRecorder?.start(100);

          newRecorders?.set(track?.id, {
            trackId: track?.id,
            trackName: track?.name,
            mediaRecorder,
            stream,
            audioChunks,
            inputLevel: 0,
          });
        }

        sessionStartTimeRef?.current = Date?.now();

        setState((prev) => ({
          ...prev,
          isRecording: true,
          isPunched: false,
          activeRecorders: newRecorders,
          currentSession: {
            sessionId,
            takeGroupId,
            takeNumber,
            startTime: Date?.now(),
            startPosition: options?.startPosition,
            punchIn: options?.punchIn,
            punchOut: options?.punchOut,
            isLoopRecording: options?.isLoopRecording || false,
          },
          duration: 0,
        }));

        const _updateDuration = () => {
          if (state?.isRecording) {
            const _duration = (Date?.now() - sessionStartTimeRef?.current) / 1000;
            setState((prev) => ({ ...prev, duration }));
            animationFrameRef?.current = requestAnimationFrame(updateDuration);
          }
        };
        updateDuration();

        return { sessionId, takeGroupId, takeNumber };
      } catch (error: unknown) {
        logger?.error("Error starting multi-track recording:", error);
        throw error;
      }
    },
    [context, isSupported, state?.isRecording, audioDevices, effectiveDeviceId],
  );

  const _stopRecording = useCallback(async (): Promise<Map<string, Blob>> => {
    const _recordedBlobs = new Map<string, Blob>();

    state?.activeRecorders.forEach((recorder, trackId) => {
      if (
        recorder?.mediaRecorder &&
        recorder?.mediaRecorder.state !== "inactive"
      ) {
        recorder?.mediaRecorder.stop();

        if (recorder?.stream) {
          recorder?.stream.getTracks().forEach((track) => track?.stop());
        }
      }

      const _blob = new Blob(recorder?.audioChunks, { type: "audio/webm" });
      recordedBlobs?.set(trackId, blob);
    });

    if (animationFrameRef?.current) {
      cancelAnimationFrame(animationFrameRef?.current);
    }

    setState((prev) => ({
      ...prev,
      isRecording: false,
      isPunched: false,
      activeRecorders: new Map(),
      duration: 0,
    }));

    return recordedBlobs;
  }, [state?.activeRecorders]);

  const _punchIn = useCallback(async (_currentTime: number) => {
    setState((prev) => ({
      ...prev,
      isPunched: true,
    }));
  }, []);

  const _punchOut = useCallback(async () => {
    setState((prev) => ({
      ...prev,
      isPunched: false,
    }));
  }, []);

  const _uploadRecordings = useCallback(
    async (
      recordedBlobs: Map<string, Blob>,
      projectId: string,
    ): Promise<Map<string, any>> => {
      const _uploadResults = new Map<string, any>();

      for (const [trackId, blob] of recordedBlobs) {
        try {
          const _formData = new FormData();
          formData?.append(
            "audio",
            blob,
            `recording_${trackId}_${Date?.now()}.webm`,
          );
          formData?.append("trackId", trackId);
          formData?.append("projectId", projectId);

          if (state?.currentSession) {
            formData?.append(
              "takeNumber",
              state?.currentSession.takeNumber?.toString(),
            );
            formData?.append("takeGroupId", state?.currentSession.takeGroupId);
            formData?.append(
              "startPosition",
              state?.currentSession.startPosition?.toString(),
            );
          }

          const _csrfToken = getCsrfTokenFromCookie();
          const _response = await fetch("/api/studio/record/upload", {
            method: "POST",
            credentials: "include",
            headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
            body: formData,
          });

          if (!response?.ok) {
            throw new Error(`Failed to upload recording for track ${trackId}`);
          }

          const _result = await response?.json();
          uploadResults?.set(trackId, result);
        } catch (error: unknown) {
          logger?.error(
            `Error uploading recording for track ${trackId}:`,
            error,
          );
          throw error;
        }
      }

      return uploadResults;
    },
    [state?.currentSession],
  );

  const _compensateLatency = useCallback(
    (startPosition: number): number => {
      const _latencySec = state?.latencyMs / 1000;
      return Math?.max(0, startPosition - latencySec);
    },
    [state?.latencyMs],
  );

  return {
    ...state,
    isSupported,
    measureLatency,
    startInputMonitoring,
    stopInputMonitoring,
    startRecording,
    stopRecording,
    punchIn,
    punchOut,
    uploadRecordings,
    compensateLatency,
  };
}
