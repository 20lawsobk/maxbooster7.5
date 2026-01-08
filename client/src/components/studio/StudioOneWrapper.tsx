import { useEffect, useRef, ReactNode, useCallback } from 'react';
import { useStudioLayoutStore } from '@/lib/studioLayoutStore';
import { studioOneTheme, cssVariables } from '@/lib/studioOneTheme';
import { StudioOneConsole } from './StudioOneConsole';
import { StudioOneBrowser } from './StudioOneBrowser';
import { ArrangerTrack } from './ArrangerTrack';
import { LauncherGrid } from './LauncherGrid';
import { ConsoleNavColumn } from './ConsoleNavColumn';
import { StudioOneLayout } from './StudioOneLayout';

interface StudioTrack {
  id: string;
  name: string;
  trackType: 'audio' | 'midi' | 'instrument';
  trackNumber: number;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  armed: boolean;
  recordEnabled?: boolean;
  color: string;
  outputBus: string;
  inserts?: Array<{
    id: string;
    name: string;
    type: 'eq' | 'compressor' | 'reverb' | 'delay' | 'distortion' | 'chorus';
    bypass: boolean;
    params?: Record<string, number>;
  }>;
  sends?: Array<{
    id: string;
    targetBusId: string;
    targetBusName: string;
    level: number;
    preFader: boolean;
  }>;
}

interface MixBus {
  id: string;
  name: string;
  color: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
}

interface ArrangerSection {
  id: string;
  name: string;
  color: string;
  startBar: number;
  lengthBars: number;
}

interface BrowserFile {
  id: string;
  name: string;
  type: 'folder' | 'audio' | 'midi' | 'preset' | 'loop';
  path: string;
  duration?: number;
  bpm?: number;
  key?: string;
  size?: number;
  favorite?: boolean;
  children?: BrowserFile[];
}

interface StudioOneWrapperProps {
  tracks: StudioTrack[];
  busses: MixBus[];
  masterVolume: number;
  selectedTrackId?: string;
  inspectorVisible: boolean;
  browserVisible: boolean;
  consoleVisible: boolean;
  browserFiles?: BrowserFile[];
  arrangerSections?: ArrangerSection[];
  bpm?: number;
  pixelsPerBar?: number;
  scrollOffset?: number;
  onInspectorVisibleChange?: (visible: boolean) => void;
  onBrowserVisibleChange?: (visible: boolean) => void;
  onConsoleVisibleChange?: (visible: boolean) => void;
  onTrackVolumeChange: (trackId: string, volume: number) => void;
  onTrackPanChange: (trackId: string, pan: number) => void;
  onTrackMuteToggle: (trackId: string) => void;
  onTrackSoloToggle: (trackId: string) => void;
  onTrackArmedToggle: (trackId: string) => void;
  onBusVolumeChange?: (busId: string, volume: number) => void;
  onBusPanChange?: (busId: string, pan: number) => void;
  onBusMuteToggle?: (busId: string) => void;
  onBusSoloToggle?: (busId: string) => void;
  onMasterVolumeChange: (volume: number) => void;
  onAddTrack: () => void;
  onAddBus?: () => void;
  onTrackSelect: (trackId: string) => void;
  onFileSelect?: (file: BrowserFile) => void;
  onFileDragStart?: (file: BrowserFile, e: React.DragEvent) => void;
  onFilePreview?: (file: BrowserFile) => void;
  onFileAdd?: (file: BrowserFile) => void;
  onArrangerSectionAdd?: (section: Omit<ArrangerSection, 'id'>) => void;
  onArrangerSectionUpdate?: (id: string, updates: Partial<ArrangerSection>) => void;
  onArrangerSectionDelete?: (id: string) => void;
  useNewLayout?: boolean;
  toolbar?: ReactNode;
  transport?: ReactNode;
  inspector?: ReactNode;
  timeline?: ReactNode;
  children?: ReactNode;
}

export function StudioOneWrapper({
  tracks,
  busses,
  masterVolume,
  selectedTrackId,
  inspectorVisible,
  browserVisible,
  consoleVisible,
  browserFiles = [],
  arrangerSections = [],
  bpm = 120,
  pixelsPerBar = 100,
  scrollOffset = 0,
  onInspectorVisibleChange,
  onBrowserVisibleChange,
  onConsoleVisibleChange,
  onTrackVolumeChange,
  onTrackPanChange,
  onTrackMuteToggle,
  onTrackSoloToggle,
  onTrackArmedToggle,
  onBusVolumeChange,
  onBusPanChange,
  onBusMuteToggle,
  onBusSoloToggle,
  onMasterVolumeChange,
  onAddTrack,
  onAddBus,
  onTrackSelect,
  onFileSelect,
  onFileDragStart,
  onFilePreview,
  onFileAdd,
  onArrangerSectionAdd,
  onArrangerSectionUpdate,
  onArrangerSectionDelete,
  useNewLayout = false,
  toolbar,
  transport,
  inspector,
  timeline,
  children,
}: StudioOneWrapperProps) {
  const {
    mode,
    browserPanel,
    inspectorPanel,
    consolePanel,
    arrangerTrackVisible,
    launcherPanel,
    setPanelVisibility,
    toggleArrangerTrack,
  } = useStudioLayoutStore();

  const initializedRef = useRef(false);
  const externalUpdateRef = useRef(false);

  useEffect(() => {
    if (!initializedRef.current) {
      setPanelVisibility('browser', browserVisible);
      setPanelVisibility('inspector', inspectorVisible);
      setPanelVisibility('console', consoleVisible);
      initializedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!initializedRef.current) return;
    if (externalUpdateRef.current) {
      externalUpdateRef.current = false;
      return;
    }
    if (browserPanel.visible !== browserVisible && onBrowserVisibleChange) {
      onBrowserVisibleChange(browserPanel.visible);
    }
  }, [browserPanel.visible]);

  useEffect(() => {
    if (!initializedRef.current) return;
    if (externalUpdateRef.current) {
      externalUpdateRef.current = false;
      return;
    }
    if (inspectorPanel.visible !== inspectorVisible && onInspectorVisibleChange) {
      onInspectorVisibleChange(inspectorPanel.visible);
    }
  }, [inspectorPanel.visible]);

  useEffect(() => {
    if (!initializedRef.current) return;
    if (externalUpdateRef.current) {
      externalUpdateRef.current = false;
      return;
    }
    if (consolePanel.visible !== consoleVisible && onConsoleVisibleChange) {
      onConsoleVisibleChange(consolePanel.visible);
    }
  }, [consolePanel.visible]);

  const defaultBrowserFiles: BrowserFile[] = browserFiles.length > 0 ? browserFiles : [
    {
      id: 'project-files',
      name: 'Project Files',
      type: 'folder',
      path: '/project',
      children: [],
    },
    {
      id: 'samples',
      name: 'Samples',
      type: 'folder',
      path: '/samples',
      children: [
        { id: 'drums', name: 'Drums', type: 'folder', path: '/samples/drums', children: [] },
        { id: 'bass', name: 'Bass', type: 'folder', path: '/samples/bass', children: [] },
        { id: 'synths', name: 'Synths', type: 'folder', path: '/samples/synths', children: [] },
      ],
    },
    {
      id: 'loops',
      name: 'Loops',
      type: 'folder',
      path: '/loops',
      children: [],
    },
    {
      id: 'presets',
      name: 'Presets',
      type: 'folder',
      path: '/presets',
      children: [],
    },
  ];

  const consoleElement = (
    <StudioOneConsole
      tracks={tracks.map((t, i) => ({
        ...t,
        trackNumber: t.trackNumber || i + 1,
        inserts: t.inserts || [],
        sends: t.sends || [],
      }))}
      busses={busses}
      masterVolume={masterVolume}
      selectedTrackId={selectedTrackId}
      onTrackVolumeChange={onTrackVolumeChange}
      onTrackPanChange={onTrackPanChange}
      onTrackMuteToggle={onTrackMuteToggle}
      onTrackSoloToggle={onTrackSoloToggle}
      onTrackArmedToggle={onTrackArmedToggle}
      onBusVolumeChange={onBusVolumeChange || (() => {})}
      onBusPanChange={onBusPanChange || (() => {})}
      onBusMuteToggle={onBusMuteToggle || (() => {})}
      onBusSoloToggle={onBusSoloToggle || (() => {})}
      onMasterVolumeChange={onMasterVolumeChange}
      onAddTrack={onAddTrack}
      onAddBus={onAddBus || (() => {})}
      onTrackSelect={onTrackSelect}
    />
  );

  const browserElement = (
    <StudioOneBrowser
      files={defaultBrowserFiles}
      onFileSelect={onFileSelect || (() => {})}
      onFileDragStart={onFileDragStart || (() => {})}
      onFilePreview={onFilePreview || (() => {})}
      onFileAdd={onFileAdd || (() => {})}
      onToggleFavorite={() => {}}
    />
  );

  const arrangerElement = arrangerTrackVisible ? (
    <ArrangerTrack
      sections={arrangerSections}
      bpm={bpm}
      timeSignature={[4, 4]}
      pixelsPerBar={pixelsPerBar}
      scrollOffset={scrollOffset}
      visible={arrangerTrackVisible}
      onToggleVisibility={toggleArrangerTrack}
      onSectionAdd={onArrangerSectionAdd || (() => {})}
      onSectionUpdate={onArrangerSectionUpdate || (() => {})}
      onSectionDelete={onArrangerSectionDelete || (() => {})}
      onSectionDuplicate={() => {}}
      onSectionMove={() => {}}
      onSectionResize={() => {}}
    />
  ) : null;

  const launcherElement = (
    <LauncherGrid
      scenes={[
        { id: '1', name: 'Scene 1', clips: [] },
        { id: '2', name: 'Scene 2', clips: [] },
        { id: '3', name: 'Scene 3', clips: [] },
      ]}
      tracks={tracks.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        armed: t.armed || false,
      }))}
      onClipTrigger={() => {}}
      onSceneTrigger={() => {}}
      onSceneStop={() => {}}
      onAddScene={() => {}}
      onAddClip={() => {}}
      onStopAll={() => {}}
    />
  );

  if (useNewLayout) {
    return (
      <StudioOneLayout
        toolbar={toolbar}
        transport={transport}
        inspector={inspector}
        arranger={arrangerElement}
        arrange={timeline || children}
        console={consoleElement}
        browser={browserElement}
        launcher={launcherElement}
      />
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: cssVariables }} />
      
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex-1 flex overflow-hidden">
          {children}
        </div>

        {consolePanel.visible && consoleElement}
      </div>
    </>
  );
}

export function StudioOneBrowserPanel({
  files = [],
  onFileSelect,
  onFileDragStart,
  onFilePreview,
  onFileAdd,
  onToggleFavorite,
}: {
  files?: BrowserFile[];
  onFileSelect?: (file: BrowserFile) => void;
  onFileDragStart?: (file: BrowserFile, e: React.DragEvent) => void;
  onFilePreview?: (file: BrowserFile) => void;
  onFileAdd?: (file: BrowserFile) => void;
  onToggleFavorite?: (fileId: string) => void;
}) {
  const defaultFiles: BrowserFile[] = files.length > 0 ? files : [
    {
      id: 'project-files',
      name: 'Project Files',
      type: 'folder',
      path: '/project',
      children: [],
    },
    {
      id: 'samples',
      name: 'Samples',
      type: 'folder',
      path: '/samples',
      children: [
        { id: 'drums', name: 'Drums', type: 'folder', path: '/samples/drums', children: [] },
        { id: 'bass', name: 'Bass', type: 'folder', path: '/samples/bass', children: [] },
      ],
    },
    {
      id: 'loops',
      name: 'Loops',
      type: 'folder',
      path: '/loops',
      children: [],
    },
  ];

  return (
    <StudioOneBrowser
      files={defaultFiles}
      onFileSelect={onFileSelect || (() => {})}
      onFileDragStart={onFileDragStart || (() => {})}
      onFilePreview={onFilePreview || (() => {})}
      onFileAdd={onFileAdd || (() => {})}
      onToggleFavorite={onToggleFavorite || (() => {})}
    />
  );
}

export function StudioOneArrangerPanel({
  sections = [],
  bpm = 120,
  pixelsPerBar = 100,
  scrollOffset = 0,
  onSectionAdd,
  onSectionUpdate,
  onSectionDelete,
  onSectionDuplicate,
  onSectionMove,
  onSectionResize,
}: {
  sections?: ArrangerSection[];
  bpm?: number;
  pixelsPerBar?: number;
  scrollOffset?: number;
  onSectionAdd?: (section: Omit<ArrangerSection, 'id'>) => void;
  onSectionUpdate?: (id: string, updates: Partial<ArrangerSection>) => void;
  onSectionDelete?: (id: string) => void;
  onSectionDuplicate?: (id: string) => void;
  onSectionMove?: (id: string, newStartBar: number) => void;
  onSectionResize?: (id: string, newLengthBars: number) => void;
}) {
  const { arrangerTrackVisible, toggleArrangerTrack } = useStudioLayoutStore();

  return (
    <ArrangerTrack
      sections={sections}
      bpm={bpm}
      timeSignature={[4, 4]}
      pixelsPerBar={pixelsPerBar}
      scrollOffset={scrollOffset}
      visible={arrangerTrackVisible}
      onToggleVisibility={toggleArrangerTrack}
      onSectionAdd={onSectionAdd || (() => {})}
      onSectionUpdate={onSectionUpdate || (() => {})}
      onSectionDelete={onSectionDelete || (() => {})}
      onSectionDuplicate={onSectionDuplicate || (() => {})}
      onSectionMove={onSectionMove || (() => {})}
      onSectionResize={onSectionResize || (() => {})}
    />
  );
}
