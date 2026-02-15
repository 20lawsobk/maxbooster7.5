import { useState, useEffect, useCallback } from 'react';
import { logger } from '@/lib/logger';

export interface MIDIDeviceInfo {
  id: string;
  name: string;
  manufacturer: string;
  type: 'input' | 'output';
  state: 'connected' | 'disconnected';
  connection: 'open' | 'closed' | 'pending';
}

export interface MIDIDeviceState {
  inputs: MIDIDeviceInfo[];
  outputs: MIDIDeviceInfo[];
  selectedInput: string | null;
  selectedOutput: string | null;
  isSupported: boolean;
  accessGranted: boolean;
  error: string | null;
}

/**
 * Hook for enumerating and managing MIDI devices using Web MIDI API
 * Enables professional MIDI controller integration
 */
/**
 * TODO: Add function documentation
 */
export function useMIDIDevices() {
  const [state, setState] = useState<MIDIDeviceState>({
    inputs: [],
    outputs: [],
    selectedInput: null,
    selectedOutput: null,
    isSupported: false,
    accessGranted: false,
    error: null,
  });

  const [midiAccess, setMIDIAccess] = useState<MIDIAccess | null>(null);

  /**
   * Request MIDI access and enumerate devices
   */
  const requestMIDIAccess = useCallback(async () => {
    // Check if Web MIDI API is supported
    if (!navigator.requestMIDIAccess) {
      setState((prev) => ({
        ...prev,
        isSupported: false,
        error: 'Web MIDI API not supported in this browser. Try Chrome, Edge, or Opera.',
      }));
      return;
    }

    setState((prev) => ({ ...prev, isSupported: true }));

    try {
      const access = await navigator.requestMIDIAccess({ sysex: false });
      setMIDIAccess(access);

      const inputs: MIDIDeviceInfo[] = [];
      const outputs: MIDIDeviceInfo[] = [];

      // Enumerate input devices
      access.inputs.forEach((input) => {
        inputs.push({
          id: input.id,
          name: input.name || 'Unknown MIDI Input',
          manufacturer: input.manufacturer || 'Unknown',
          type: 'input',
          state: input.state,
          connection: input.connection,
        });
      });

      // Enumerate output devices
      access.outputs.forEach((output) => {
        outputs.push({
          id: output.id,
          name: output.name || 'Unknown MIDI Output',
          manufacturer: output.manufacturer || 'Unknown',
          type: 'output',
          state: output.state,
          connection: output.connection,
        });
      });

      setState((prev) => ({
        ...prev,
        inputs,
        outputs,
        accessGranted: true,
        selectedInput: prev.selectedInput || (inputs.length > 0 ? inputs[0].id : null),
        selectedOutput: prev.selectedOutput || (outputs.length > 0 ? outputs[0].id : null),
      }));

      // Listen for device state changes (hot-plugging)
      access.addEventListener('statechange', handleStateChange);
    } catch (error: unknown) {
      setState((prev) => ({
        ...prev,
        accessGranted: false,
        error: error.message || 'Failed to access MIDI devices',
      }));
    }
  }, []);

  /**
   * Handle MIDI device state changes (hot-plug events)
   */
  const handleStateChange = useCallback(
    (event: Event) => {
      const e = event as MIDIConnectionEvent;
      logger.info(`MIDI device ${e.port.state}: ${e.port.name}`);

      // Re-enumerate devices when state changes
      if (midiAccess) {
        const inputs: MIDIDeviceInfo[] = [];
        const outputs: MIDIDeviceInfo[] = [];

        midiAccess.inputs.forEach((input) => {
          inputs.push({
            id: input.id,
            name: input.name || 'Unknown MIDI Input',
            manufacturer: input.manufacturer || 'Unknown',
            type: 'input',
            state: input.state,
            connection: input.connection,
          });
        });

        midiAccess.outputs.forEach((output) => {
          outputs.push({
            id: output.id,
            name: output.name || 'Unknown MIDI Output',
            manufacturer: output.manufacturer || 'Unknown',
            type: 'output',
            state: output.state,
            connection: output.connection,
          });
        });

        setState((prev) => ({ ...prev, inputs, outputs }));
      }
    },
    [midiAccess]
  );

  /**
   * Select a MIDI input device
   */
  const selectInput = useCallback((deviceId: string) => {
    setState((prev) => ({ ...prev, selectedInput: deviceId }));
  }, []);

  /**
   * Select a MIDI output device
   */
  const selectOutput = useCallback((deviceId: string) => {
    setState((prev) => ({ ...prev, selectedOutput: deviceId }));
  }, []);

  /**
   * Get the MIDI input port for the selected device
   */
  const getInputPort = useCallback(
    (deviceId?: string): MIDIInput | null => {
      if (!midiAccess) return null;

      const targetId = deviceId || state.selectedInput;
      if (!targetId) return null;

      return midiAccess.inputs.get(targetId) || null;
    },
    [midiAccess, state.selectedInput]
  );

  /**
   * Get the MIDI output port for the selected device
   */
  const getOutputPort = useCallback(
    (deviceId?: string): MIDIOutput | null => {
      if (!midiAccess) return null;

      const targetId = deviceId || state.selectedOutput;
      if (!targetId) return null;

      return midiAccess.outputs.get(targetId) || null;
    },
    [midiAccess, state.selectedOutput]
  );

  /**
   * Subscribe to MIDI messages from an input device
   */
  const subscribeToInput = useCallback(
    (callback: (message: MIDIMessageEvent) => void, deviceId?: string): (() => void) | null => {
      const port = getInputPort(deviceId);
      if (!port) return null;

      const handler = (event: Event) => {
        callback(event as MIDIMessageEvent);
      };

      port.addEventListener('midimessage', handler);

      // Open the port if it's not already open
      if (port.connection !== 'open') {
        port.open();
      }

      // Return cleanup function
      return () => {
        port.removeEventListener('midimessage', handler);
      };
    },
    [getInputPort]
  );

  /**
   * Send MIDI message to output device
   */
  const sendMessage = useCallback(
    (message: number[] | Uint8Array, deviceId?: string): boolean => {
      const port = getOutputPort(deviceId);
      if (!port) return false;

      try {
        port.send(message);
        return true;
      } catch (error: unknown) {
        logger.error('Failed to send MIDI message:', error);
        return false;
      }
    },
    [getOutputPort]
  );

  /**
   * Initialize MIDI access on mount
   */
  useEffect(() => {
    requestMIDIAccess();

    return () => {
      if (midiAccess) {
        midiAccess.removeEventListener('statechange', handleStateChange);
      }
    };
  }, []);

  return {
    ...state,
    requestMIDIAccess,
    selectInput,
    selectOutput,
    getInputPort,
    getOutputPort,
    subscribeToInput,
    sendMessage,
  };
}
