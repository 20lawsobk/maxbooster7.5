import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type StudioMode = 'arrange' | 'mix' | 'project' | 'launcher';
export type PanelSection = 'inputs' | 'inserts' | 'sends' | 'outputs' | 'meters';

export interface PanelState {
  visible: boolean;
  width?: number;
  height?: number;
  minimized?: boolean;
}

export interface ConsoleSections {
  inputs: boolean;
  inserts: boolean;
  sends: boolean;
  outputs: boolean;
  meters: boolean;
  faders: boolean;
}

export interface StudioLayoutState {
  mode: StudioMode;
  browserPanel: PanelState;
  inspectorPanel: PanelState;
  consolePanel: PanelState;
  arrangePanel: PanelState;
  launcherPanel: PanelState;
  consoleSections: ConsoleSections;
  channelWidth: 'narrow' | 'normal' | 'wide';
  showTransport: boolean;
  showToolbar: boolean;
  showNavigator: boolean;
  snapEnabled: boolean;
  gridVisible: boolean;
  automationVisible: boolean;
  arrangerTrackVisible: boolean;
  markerLaneVisible: boolean;
  zoomLevel: number;
  horizontalScroll: number;
  verticalScroll: number;
  selectedTrackIds: string[];
  selectedClipIds: string[];
  focusedPanel: 'arrange' | 'console' | 'browser' | 'inspector' | 'launcher' | null;
  setMode: (mode: StudioMode) => void;
  togglePanel: (panel: 'browser' | 'inspector' | 'console' | 'launcher') => void;
  setPanelWidth: (panel: 'browser' | 'inspector', width: number) => void;
  setPanelHeight: (panel: 'console', height: number) => void;
  toggleConsoleSection: (section: keyof ConsoleSections) => void;
  setChannelWidth: (width: 'narrow' | 'normal' | 'wide') => void;
  setZoomLevel: (level: number) => void;
  setScroll: (horizontal: number, vertical: number) => void;
  setSelectedTracks: (ids: string[]) => void;
  setSelectedClips: (ids: string[]) => void;
  setFocusedPanel: (panel: StudioLayoutState['focusedPanel']) => void;
  toggleGridVisible: () => void;
  toggleSnapEnabled: () => void;
  toggleAutomationVisible: () => void;
  toggleArrangerTrack: () => void;
  toggleMarkerLane: () => void;
  resetLayout: () => void;
}

const defaultState = {
  mode: 'arrange' as StudioMode,
  browserPanel: { visible: true, width: 280 },
  inspectorPanel: { visible: false, width: 260 },
  consolePanel: { visible: true, height: 300 },
  arrangePanel: { visible: true },
  launcherPanel: { visible: false },
  consoleSections: {
    inputs: true,
    inserts: true,
    sends: true,
    outputs: true,
    meters: true,
    faders: true,
  },
  channelWidth: 'normal' as const,
  showTransport: true,
  showToolbar: true,
  showNavigator: false,
  snapEnabled: true,
  gridVisible: true,
  automationVisible: false,
  arrangerTrackVisible: false,
  markerLaneVisible: true,
  zoomLevel: 1,
  horizontalScroll: 0,
  verticalScroll: 0,
  selectedTrackIds: [] as string[],
  selectedClipIds: [] as string[],
  focusedPanel: null as StudioLayoutState['focusedPanel'],
};

export const useStudioLayoutStore = create<StudioLayoutState>()(
  persist(
    (set) => ({
      ...defaultState,

      setMode: (mode) => set((state) => {
        const updates: Partial<StudioLayoutState> = { mode };
        if (mode === 'mix') {
          updates.consolePanel = { ...state.consolePanel, visible: true, height: 500 };
          updates.launcherPanel = { ...state.launcherPanel, visible: false };
        } else if (mode === 'launcher') {
          updates.launcherPanel = { ...state.launcherPanel, visible: true };
        } else if (mode === 'arrange') {
          updates.consolePanel = { ...state.consolePanel, visible: true, height: 300 };
          updates.launcherPanel = { ...state.launcherPanel, visible: false };
        } else if (mode === 'project') {
          updates.browserPanel = { ...state.browserPanel, visible: false };
          updates.consolePanel = { ...state.consolePanel, visible: true };
        }
        return updates;
      }),

      togglePanel: (panel) => set((state) => {
        const panelKey = `${panel}Panel` as keyof StudioLayoutState;
        const currentPanel = state[panelKey] as PanelState;
        return {
          [panelKey]: { ...currentPanel, visible: !currentPanel.visible },
        } as Partial<StudioLayoutState>;
      }),

      setPanelWidth: (panel, width) => set((state) => {
        const panelKey = `${panel}Panel` as keyof StudioLayoutState;
        const currentPanel = state[panelKey] as PanelState;
        return {
          [panelKey]: { ...currentPanel, width },
        } as Partial<StudioLayoutState>;
      }),

      setPanelHeight: (panel, height) => set((state) => {
        const panelKey = `${panel}Panel` as keyof StudioLayoutState;
        const currentPanel = state[panelKey] as PanelState;
        return {
          [panelKey]: { ...currentPanel, height },
        } as Partial<StudioLayoutState>;
      }),

      toggleConsoleSection: (section) => set((state) => ({
        consoleSections: {
          ...state.consoleSections,
          [section]: !state.consoleSections[section],
        },
      })),

      setChannelWidth: (width) => set({ channelWidth: width }),

      setZoomLevel: (level) => set({ zoomLevel: Math.max(0.1, Math.min(10, level)) }),

      setScroll: (horizontal, vertical) => set({
        horizontalScroll: horizontal,
        verticalScroll: vertical,
      }),

      setSelectedTracks: (ids) => set({ selectedTrackIds: ids }),

      setSelectedClips: (ids) => set({ selectedClipIds: ids }),

      setFocusedPanel: (panel) => set({ focusedPanel: panel }),

      toggleGridVisible: () => set((state) => ({ gridVisible: !state.gridVisible })),

      toggleSnapEnabled: () => set((state) => ({ snapEnabled: !state.snapEnabled })),

      toggleAutomationVisible: () => set((state) => ({ automationVisible: !state.automationVisible })),

      toggleArrangerTrack: () => set((state) => ({ arrangerTrackVisible: !state.arrangerTrackVisible })),

      toggleMarkerLane: () => set((state) => ({ markerLaneVisible: !state.markerLaneVisible })),

      resetLayout: () => set(defaultState),
    }),
    {
      name: 'studio-layout',
      partialize: (state) => ({
        mode: state.mode,
        browserPanel: state.browserPanel,
        inspectorPanel: state.inspectorPanel,
        consolePanel: state.consolePanel,
        consoleSections: state.consoleSections,
        channelWidth: state.channelWidth,
        showTransport: state.showTransport,
        snapEnabled: state.snapEnabled,
        gridVisible: state.gridVisible,
        markerLaneVisible: state.markerLaneVisible,
      }),
    }
  )
);
