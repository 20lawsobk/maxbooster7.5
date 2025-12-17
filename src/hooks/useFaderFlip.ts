import { useState, useCallback, useMemo } from 'react';

export type FaderMode = 
  | 'volume'
  | 'fx1' | 'fx2' | 'fx3' | 'fx4'
  | 'cue1' | 'cue2' | 'cue3' | 'cue4'
  | 'bus1' | 'bus2' | 'bus3' | 'bus4' | 'bus5' | 'bus6' | 'bus7' | 'bus8';

export type FaderModeType = 'volume' | 'fx' | 'cue' | 'bus';

export interface FaderModeConfig {
  id: FaderMode;
  label: string;
  shortLabel: string;
  type: FaderModeType;
  color: string;
}

export const FADER_MODE_COLORS: Record<FaderModeType, string> = {
  volume: '#22c55e',
  fx: '#3b82f6',
  cue: '#f97316',
  bus: '#a855f7',
};

export const FADER_MODES: FaderModeConfig[] = [
  { id: 'volume', label: 'Volume', shortLabel: 'VOL', type: 'volume', color: FADER_MODE_COLORS.volume },
  { id: 'fx1', label: 'FX Send 1', shortLabel: 'FX1', type: 'fx', color: FADER_MODE_COLORS.fx },
  { id: 'fx2', label: 'FX Send 2', shortLabel: 'FX2', type: 'fx', color: FADER_MODE_COLORS.fx },
  { id: 'fx3', label: 'FX Send 3', shortLabel: 'FX3', type: 'fx', color: FADER_MODE_COLORS.fx },
  { id: 'fx4', label: 'FX Send 4', shortLabel: 'FX4', type: 'fx', color: FADER_MODE_COLORS.fx },
  { id: 'cue1', label: 'Cue Mix 1', shortLabel: 'CUE1', type: 'cue', color: FADER_MODE_COLORS.cue },
  { id: 'cue2', label: 'Cue Mix 2', shortLabel: 'CUE2', type: 'cue', color: FADER_MODE_COLORS.cue },
  { id: 'cue3', label: 'Cue Mix 3', shortLabel: 'CUE3', type: 'cue', color: FADER_MODE_COLORS.cue },
  { id: 'cue4', label: 'Cue Mix 4', shortLabel: 'CUE4', type: 'cue', color: FADER_MODE_COLORS.cue },
  { id: 'bus1', label: 'Bus Send 1', shortLabel: 'BUS1', type: 'bus', color: FADER_MODE_COLORS.bus },
  { id: 'bus2', label: 'Bus Send 2', shortLabel: 'BUS2', type: 'bus', color: FADER_MODE_COLORS.bus },
  { id: 'bus3', label: 'Bus Send 3', shortLabel: 'BUS3', type: 'bus', color: FADER_MODE_COLORS.bus },
  { id: 'bus4', label: 'Bus Send 4', shortLabel: 'BUS4', type: 'bus', color: FADER_MODE_COLORS.bus },
  { id: 'bus5', label: 'Bus Send 5', shortLabel: 'BUS5', type: 'bus', color: FADER_MODE_COLORS.bus },
  { id: 'bus6', label: 'Bus Send 6', shortLabel: 'BUS6', type: 'bus', color: FADER_MODE_COLORS.bus },
  { id: 'bus7', label: 'Bus Send 7', shortLabel: 'BUS7', type: 'bus', color: FADER_MODE_COLORS.bus },
  { id: 'bus8', label: 'Bus Send 8', shortLabel: 'BUS8', type: 'bus', color: FADER_MODE_COLORS.bus },
];

export interface ChannelFaderState {
  mode: FaderMode;
  values: Record<FaderMode, number>;
}

export interface UseFaderFlipOptions {
  channelIds: string[];
  defaultMode?: FaderMode;
}

export interface UseFaderFlipReturn {
  channelModes: Record<string, FaderMode>;
  channelValues: Record<string, Record<FaderMode, number>>;
  globalMode: FaderMode | null;
  isGlobalModeActive: boolean;
  selectedChannels: string[];
  getChannelMode: (channelId: string) => FaderMode;
  getChannelValue: (channelId: string, mode?: FaderMode) => number;
  getModeConfig: (mode: FaderMode) => FaderModeConfig;
  setChannelMode: (channelId: string, mode: FaderMode) => void;
  setChannelValue: (channelId: string, value: number, mode?: FaderMode) => void;
  setGlobalMode: (mode: FaderMode | null) => void;
  toggleGlobalMode: (mode: FaderMode) => void;
  returnToVolume: (channelId?: string) => void;
  selectChannel: (channelId: string, multi?: boolean) => void;
  deselectChannel: (channelId: string) => void;
  clearSelection: () => void;
  applyGlobalModeToSelected: () => void;
  formatValue: (value: number, mode: FaderMode) => string;
}

export function useFaderFlip({ 
  channelIds, 
  defaultMode = 'volume' 
}: UseFaderFlipOptions): UseFaderFlipReturn {
  const [channelModes, setChannelModes] = useState<Record<string, FaderMode>>(() => 
    channelIds.reduce((acc, id) => ({ ...acc, [id]: defaultMode }), {})
  );

  const [channelValues, setChannelValues] = useState<Record<string, Record<FaderMode, number>>>(() =>
    channelIds.reduce((acc, id) => ({
      ...acc,
      [id]: FADER_MODES.reduce((vals, mode) => ({
        ...vals,
        [mode.id]: mode.id === 'volume' ? 0.75 : 0
      }), {} as Record<FaderMode, number>)
    }), {})
  );

  const [globalMode, setGlobalModeState] = useState<FaderMode | null>(null);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);

  const isGlobalModeActive = globalMode !== null;

  const getModeConfig = useCallback((mode: FaderMode): FaderModeConfig => {
    return FADER_MODES.find(m => m.id === mode) || FADER_MODES[0];
  }, []);

  const getChannelMode = useCallback((channelId: string): FaderMode => {
    if (globalMode && selectedChannels.includes(channelId)) {
      return globalMode;
    }
    return channelModes[channelId] || 'volume';
  }, [channelModes, globalMode, selectedChannels]);

  const getChannelValue = useCallback((channelId: string, mode?: FaderMode): number => {
    const currentMode = mode || getChannelMode(channelId);
    return channelValues[channelId]?.[currentMode] ?? 0;
  }, [channelValues, getChannelMode]);

  const setChannelMode = useCallback((channelId: string, mode: FaderMode) => {
    setChannelModes(prev => ({ ...prev, [channelId]: mode }));
  }, []);

  const setChannelValue = useCallback((channelId: string, value: number, mode?: FaderMode) => {
    const currentMode = mode || getChannelMode(channelId);
    setChannelValues(prev => ({
      ...prev,
      [channelId]: {
        ...(prev[channelId] || {}),
        [currentMode]: Math.max(0, Math.min(1, value))
      }
    }));
  }, [getChannelMode]);

  const setGlobalMode = useCallback((mode: FaderMode | null) => {
    setGlobalModeState(mode);
  }, []);

  const toggleGlobalMode = useCallback((mode: FaderMode) => {
    setGlobalModeState(prev => prev === mode ? null : mode);
  }, []);

  const returnToVolume = useCallback((channelId?: string) => {
    if (channelId) {
      setChannelModes(prev => ({ ...prev, [channelId]: 'volume' }));
    } else {
      setGlobalModeState(null);
      setChannelModes(prev => 
        Object.keys(prev).reduce((acc, id) => ({ ...acc, [id]: 'volume' }), {})
      );
    }
  }, []);

  const selectChannel = useCallback((channelId: string, multi = false) => {
    setSelectedChannels(prev => {
      if (multi) {
        return prev.includes(channelId) 
          ? prev.filter(id => id !== channelId)
          : [...prev, channelId];
      }
      return [channelId];
    });
  }, []);

  const deselectChannel = useCallback((channelId: string) => {
    setSelectedChannels(prev => prev.filter(id => id !== channelId));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedChannels([]);
  }, []);

  const applyGlobalModeToSelected = useCallback(() => {
    if (!globalMode) return;
    setChannelModes(prev => {
      const updated = { ...prev };
      selectedChannels.forEach(id => {
        updated[id] = globalMode;
      });
      return updated;
    });
  }, [globalMode, selectedChannels]);

  const formatValue = useCallback((value: number, mode: FaderMode): string => {
    const modeConfig = getModeConfig(mode);
    if (modeConfig.type === 'volume') {
      if (value === 0) return '-∞ dB';
      const db = 20 * Math.log10(value);
      return `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`;
    }
    return `${Math.round(value * 100)}%`;
  }, [getModeConfig]);

  return {
    channelModes,
    channelValues,
    globalMode,
    isGlobalModeActive,
    selectedChannels,
    getChannelMode,
    getChannelValue,
    getModeConfig,
    setChannelMode,
    setChannelValue,
    setGlobalMode,
    toggleGlobalMode,
    returnToVolume,
    selectChannel,
    deselectChannel,
    clearSelection,
    applyGlobalModeToSelected,
    formatValue,
  };
}
