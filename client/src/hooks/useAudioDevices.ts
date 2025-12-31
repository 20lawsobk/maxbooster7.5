import { useState, useEffect, useCallback } from 'react';
import { logger } from '@/lib/logger';

export interface AudioDeviceInfo {
  deviceId: string;
  groupId: string;
  kind: 'audioinput' | 'audiooutput';
  label: string;
  channelCount?: number;
  sampleRate?: number;
}

export interface AudioDeviceState {
  inputs: AudioDeviceInfo[];
  outputs: AudioDeviceInfo[];
  selectedInput: string | null;
  selectedOutput: string | null;
  isEnumerating: boolean;
  permissionGranted: boolean;
  error: string | null;
}

/**
 * Hook for enumerating and managing audio I/O devices
 * Implements professional DAW-style device management
 */
/**
 * TODO: Add function documentation
 */
export function useAudioDevices() {
  const [state, setState] = useState<AudioDeviceState>({
    inputs: [],
    outputs: [],
    selectedInput: null,
    selectedOutput: null,
    isEnumerating: false,
    permissionGranted: false,
    error: null,
  });

  /**
   * Enumerate all available audio devices
   * This provides the foundation for device selection in the DAW
   */
  const enumerateDevices = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      setState((prev) => ({
        ...prev,
        error: 'Media devices API not supported in this browser',
      }));
      return;
    }

    setState((prev) => ({ ...prev, isEnumerating: true, error: null }));

    try {
      // Request permission first to get labeled devices
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Stop the stream immediately (we just needed permission)
      stream.getTracks().forEach((track) => track.stop());

      // Now enumerate with labels
      const devices = await navigator.mediaDevices.enumerateDevices();

      const inputs: AudioDeviceInfo[] = [];
      const outputs: AudioDeviceInfo[] = [];

      devices.forEach((device) => {
        if (device.kind === 'audioinput') {
          inputs.push({
            deviceId: device.deviceId,
            groupId: device.groupId,
            kind: 'audioinput',
            label: device.label || `Microphone ${inputs.length + 1}`,
          });
        } else if (device.kind === 'audiooutput') {
          outputs.push({
            deviceId: device.deviceId,
            groupId: device.groupId,
            kind: 'audiooutput',
            label: device.label || `Speaker ${outputs.length + 1}`,
          });
        }
      });

      setState((prev) => ({
        ...prev,
        inputs,
        outputs,
        isEnumerating: false,
        permissionGranted: true,
        // Auto-select first device if none selected
        selectedInput: prev.selectedInput || (inputs.length > 0 ? inputs[0].deviceId : null),
        selectedOutput: prev.selectedOutput || (outputs.length > 0 ? outputs[0].deviceId : null),
      }));
    } catch (error: unknown) {
      setState((prev) => ({
        ...prev,
        isEnumerating: false,
        permissionGranted: false,
        error: error.message || 'Failed to enumerate audio devices',
      }));
    }
  }, []);

  /**
   * Select an input device
   */
  const selectInput = useCallback((deviceId: string) => {
    setState((prev) => ({ ...prev, selectedInput: deviceId }));
  }, []);

  /**
   * Select an output device
   */
  const selectOutput = useCallback((deviceId: string) => {
    setState((prev) => ({ ...prev, selectedOutput: deviceId }));
  }, []);

  /**
   * Get audio stream from selected input device
   */
  const getInputStream = useCallback(
    async (deviceId?: string, constraints?: MediaTrackConstraints): Promise<MediaStream | null> => {
      try {
        const targetDevice = deviceId || state.selectedInput;

        if (!targetDevice) {
          throw new Error('No input device selected');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: targetDevice },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000, // Professional standard
            channelCount: 2, // Stereo
            ...constraints,
          },
        });

        return stream;
      } catch (error: unknown) {
        logger.error('Failed to get input stream:', error);
        return null;
      }
    },
    [state.selectedInput]
  );

  /**
   * Get device capabilities (sample rate, channel count, etc.)
   */
  const getDeviceCapabilities = useCallback(
    async (deviceId: string): Promise<MediaTrackCapabilities | null> => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: deviceId } },
        });

        const audioTrack = stream.getAudioTracks()[0];
        const capabilities = audioTrack.getCapabilities();

        // Clean up
        stream.getTracks().forEach((track) => track.stop());

        return capabilities;
      } catch (error: unknown) {
        logger.error('Failed to get device capabilities:', error);
        return null;
      }
    },
    []
  );

  /**
   * Handle device changes (hot-plugging)
   */
  const handleDeviceChange = useCallback(() => {
    logger.info('Audio device configuration changed, re-enumerating...');
    enumerateDevices();
  }, [enumerateDevices]);

  /**
   * Initialize and listen for device changes
   */
  useEffect(() => {
    enumerateDevices();

    // Listen for device changes (hot-plugging)
    if (navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    }

    return () => {
      if (navigator.mediaDevices) {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      }
    };
  }, [enumerateDevices, handleDeviceChange]);

  return {
    ...state,
    enumerateDevices,
    selectInput,
    selectOutput,
    getInputStream,
    getDeviceCapabilities,
  };
}
