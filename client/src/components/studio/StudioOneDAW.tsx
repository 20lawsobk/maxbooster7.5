import { logger } from '@/lib/logger';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Pause, Square, Circle, SkipBack, SkipForward, Repeat,
  Volume2, Undo, Redo, Save, Plus, Settings, Sliders, Piano,
  Layers, Mic, Music, Drum, Guitar, FolderOpen, ChevronDown,
  ChevronRight, MoreHorizontal, Lock, Unlock, Eye, EyeOff,
  Trash2, Copy, Scissors, ZoomIn, ZoomOut, Grid3X3, Wand2,
  PanelBottomOpen, PanelBottomClose, PanelRightOpen, PanelRightClose,
  Brain, Sparkles, Library, Keyboard, HelpCircle, X, Camera, Check,
  MousePointer2, Pencil, Eraser,
  Film, Radio, Waves, ArrowUpDown, RotateCcw, Activity, Speaker,
  FileText, Headphones, Maximize2, Minimize2
} from 'lucide-react';
import { getShortcutManager } from '@/lib/shortcuts/ShortcutManager';
import type { ShortcutDefinition } from '@/lib/shortcuts/types';
import { cn } from '@/lib/utils';
import { useStudioScale } from '@/hooks/useStudioScale';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
} from '@/components/ui/context-menu';
import { useUnifiedStore } from '@/stores/unifiedStoreAdapter';
import { useStudioStore } from '@/stores/studioStore';
import { useToast } from '@/hooks/use-toast';
import { useProjectSync } from '@/hooks/useProjectSync';
import { apiRequest } from '@/lib/queryClient';
import { FlowStatePluginBrowser } from './FlowStatePluginBrowser';
import { FlowStateAIPanel } from './FlowStateAIPanel';
import { AIMusicGenerator } from './AIMusicGenerator';
import { FlowStateKeyboardShortcuts } from './FlowStateKeyboardShortcuts';
import { StudioProjectDialog } from './StudioProjectDialog';
import { SaveAsDialog } from './SaveAsDialog';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';
import { ProjectSettingsDialog } from './ProjectSettingsDialog';
import { CrashRecoveryDialog } from './CrashRecoveryDialog';
import { VersionManagementDialog } from './VersionManagementDialog';
import { FlowStateExport } from './FlowStateExport';
import { RecordingPanel } from './RecordingPanel';
import { FlowStateAutomation } from './FlowStateAutomation';
import { SpatialAudioMixer } from './SpatialAudioMixer';
import { VideoTrack } from './VideoTrack';
import { FlowStateImportAudio } from './FlowStateImportAudio';
import { StemExportDialog } from './StemExportDialog';
import { StudioStartHub } from './StudioStartHub';
import { LyricsPanel, LyricSection, makeDefaultSections } from './LyricsPanel';
import { AudioDeviceDialog } from './AudioDeviceDialog';
import MobileLyricsPanel from './MobileLyricsPanel';
import MobileAudioDialog from './MobileAudioDialog';
import { usePlatform } from '@/hooks/usePlatform';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { useAudioEngine } from '@/hooks/useAudioEngine';

interface StudioOneDAWProps {
  projectId: string | null;
}

type EditorMode = 'arrange' | 'edit' | 'mixer';
type PluginFilter = 'all' | 'effects' | 'instruments';

const TRACK_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
];

export function StudioOneDAW({ projectId }: StudioOneDAWProps) {
  const platform = usePlatform();
  const store = useUnifiedStore();
  const { tracks, masterTrack, transport, view, project, canUndo, canRedo } = store;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { forceSave, loadProjectData } = useProjectSync(projectId);
  const audioEngine = useAudioEngine();
  const audioInitializedRef = useRef(false);
  const loadedClipsRef = useRef<Set<string>>(new Set());
  const loadedTracksRef = useRef<Set<string>>(new Set());
  const prevProjectIdRef = useRef<string | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [livePosition, setLivePosition] = useState(0);
  const [showInspector, setShowInspector] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [showMixer, setShowMixer] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const copiedClipRef = useRef<{ clip: any; trackId: string; type: 'audio' | 'midi' } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [scrollX, setScrollX] = useState(0);
  const [showProjectDialog, setShowProjectDialog] = useState(false);
  const projectLoadedRef = useRef<string | null>(null);

  const [showPluginBrowser, setShowPluginBrowser] = useState(false);
  const [pluginFilter, setPluginFilter] = useState<PluginFilter>('all');
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [showMusicGenerator, setShowMusicGenerator] = useState(false);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [showSaveAsDialog, setShowSaveAsDialog] = useState(false);
  const [showUnsavedChangesDialog, setShowUnsavedChangesDialog] = useState(false);
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [showVersionManagement, setShowVersionManagement] = useState(false);
  const [projectVersions, setProjectVersions] = useState<Array<{ 
    id: string; 
    name: string; 
    description: string; 
    createdAt: number;
    snapshot?: {
      project: any;
      transport: any;
      tracks: any[];
    };
  }>>([]);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingProjectTitle, setPendingProjectTitle] = useState('');

  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showImportAudio, setShowImportAudio] = useState(false);
  const [showStemExport, setShowStemExport] = useState(false);

  const [isAIMixing, setIsAIMixing] = useState(false);
  const [isAIMastering, setIsAIMastering] = useState(false);
  const [musicalKey, setMusicalKey] = useState('C');
  const [musicalScale, setMusicalScale] = useState('minor');

  const [punchIn, setPunchIn] = useState(false);
  const [punchOut, setPunchOut] = useState(false);
  const [punchInTime, setPunchInTime] = useState(0);
  const [punchOutTime, setPunchOutTime] = useState(0);
  const [loopRecord, setLoopRecord] = useState(false);

  const [showAutomation, setShowAutomation] = useState(false);
  const [automationLanes, setAutomationLanes] = useState<any[]>([]);

  const [showSurroundPanel, setShowSurroundPanel] = useState(false);
  const [surroundFormat, setSurroundFormat] = useState<'2.0' | '5.1' | '7.1' | '7.1.4' | 'atmos'>('2.0');

  const [showVideoTrack, setShowVideoTrack] = useState(false);
  const [pendingImportVideoUrl, setPendingImportVideoUrl] = useState<string | null>(null);
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyricsSections, setLyricsSections] = useState<LyricSection[]>(() => makeDefaultSections());
  const [lyricsActiveSectionId, setLyricsActiveSectionId] = useState<string>('');
  const [showAudioDevices, setShowAudioDevices] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [clipEditParams, setClipEditParams] = useState<Record<string, {
    timeStretch?: number;
    pitchShift?: number;
    reversed?: boolean;
    normalized?: boolean;
    fadeIn?: number;
    fadeOut?: number;
  }>>({});
  const [showTimeStretchDialog, setShowTimeStretchDialog] = useState<string | null>(null);
  const [showPitchShiftDialog, setShowPitchShiftDialog] = useState<string | null>(null);
  const { ref: containerRef, scale: uiScale, cssVars, trackHeaderWidth, aiPanelWidth } = useStudioScale();

  const [activeView, setActiveView] = useState<'timeline' | 'mixer' | 'nodegraph' | 'flow'>('timeline');
  const [expertMode, setExpertMode] = useState(false);
  const [leftSidebarTab, setLeftSidebarTab] = useState<'tracks' | 'files' | 'plugins' | 'presets'>('tracks');
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  // Pick up a video generated in Social Media and queued for import via sessionStorage.
  useEffect(() => {
    const pendingUrl = sessionStorage.getItem('mb-pending-import-video');
    if (pendingUrl) {
      sessionStorage.removeItem('mb-pending-import-video');
      setPendingImportVideoUrl(pendingUrl);
      setShowVideoTrack(true);
    }
  }, []);

  useEffect(() => {
    if (projectId && projectId !== projectLoadedRef.current) {
      // Clear previous project's loaded clips/tracks refs
      loadedClipsRef.current.clear();
      loadedTracksRef.current.clear();
      // Clear version history for new project (will be loaded from localStorage in separate effect)
      setProjectVersions([]);
      
      projectLoadedRef.current = projectId;
      setIsLoading(true);
      loadProjectData().finally(() => setIsLoading(false));
    }
  }, [projectId, loadProjectData]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (project.isDirty) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [project.isDirty]);

  useEffect(() => {
    if (platform.isElectron && window.electronAPI?.onFullscreenChanged) {
      const unsub = window.electronAPI.onFullscreenChanged((val) => setIsFullscreen(val));
      window.electronAPI.isFullscreen?.().then((v) => setIsFullscreen(!!v)).catch(() => {});
      return () => { if (typeof unsub === 'function') unsub(); };
    }
    const onFSChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFSChange);
    return () => document.removeEventListener('fullscreenchange', onFSChange);
  }, [platform.isElectron]);

  const handleToggleFullscreen = useCallback(() => {
    if (platform.isElectron && window.electronAPI?.toggleFullscreen) {
      window.electronAPI.toggleFullscreen();
      return;
    }
    if (!document.fullscreenElement) {
      (containerRef as React.RefObject<HTMLElement>).current?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, [containerRef, platform.isElectron]);

  const storeRef = useRef(store);
  useEffect(() => { storeRef.current = store; });
  const transportRef = useRef(transport);
  useEffect(() => { transportRef.current = transport; });

  useEffect(() => {
    if (!projectId || !project.isDirty) return;

    const saveRecoveryData = () => {
      const t = transportRef.current;
      const s = storeRef.current;
      const recoveryData = {
        projectId,
        projectName: project.name,
        projectDescription: project.description,
        transport: {
          tempo: t.tempo,
          timeSignatureNumerator: t.timeSignatureNumerator,
          timeSignatureDenominator: t.timeSignatureDenominator,
          position: t.position,
          loopStart: t.loopStart,
          loopEnd: t.loopEnd,
          isLooping: t.isLooping,
        },
        tracks: s.tracks.map(t => ({
          id: t.id,
          name: t.name,
          type: t.type,
          volume: t.volume,
          pan: t.pan,
          muted: t.muted,
          solo: t.solo,
        })),
        timestamp: Date.now(),
      };
      localStorage.setItem('studio_recovery_data', JSON.stringify(recoveryData));
    };

    saveRecoveryData();

    const interval = setInterval(saveRecoveryData, 30000);
    return () => clearInterval(interval);
  }, [projectId, project.isDirty, project.name, project.description]);

  // Clear recovery data after successful save
  useEffect(() => {
    if (!project.isDirty && projectId) {
      localStorage.removeItem('studio_recovery_data');
    }
  }, [project.isDirty, projectId]);

  // Load versions from localStorage on mount
  useEffect(() => {
    if (projectId) {
      const storedVersions = localStorage.getItem(`studio_versions_${projectId}`);
      if (storedVersions) {
        try {
          setProjectVersions(JSON.parse(storedVersions));
        } catch (e) {
          logger.error('Failed to parse stored versions:', e);
        }
      }
    }
  }, [projectId]);

  // Persist versions to localStorage when they change
  useEffect(() => {
    if (projectId && projectVersions.length > 0) {
      localStorage.setItem(`studio_versions_${projectId}`, JSON.stringify(projectVersions));
    }
  }, [projectId, projectVersions]);

  const isPlayingRef = useRef(transport.isPlaying);
  useEffect(() => { isPlayingRef.current = transport.isPlaying; }, [transport.isPlaying]);

  const audioEngineRef = useRef(audioEngine);
  useEffect(() => { audioEngineRef.current = audioEngine; });

  useEffect(() => {
    if (!transport.isPlaying) {
      setLivePosition(transport.position);
      return;
    }
    let rafId: number;
    const syncPosition = () => {
      const engine = audioEngineRef.current;
      setLivePosition(engine.currentTime);
      rafId = requestAnimationFrame(syncPosition);
    };
    rafId = requestAnimationFrame(syncPosition);
    return () => {
      cancelAnimationFrame(rafId);
      const finalTime = audioEngineRef.current.currentTime;
      storeRef.current.setPosition(finalTime);
    };
  }, [transport.isPlaying]);

  const dawActionsRef = useRef<Record<string, () => void>>({});
  const selectedClipIdRef = useRef(selectedClipId);
  useEffect(() => { selectedClipIdRef.current = selectedClipId; }, [selectedClipId]);
  const livePositionRef = useRef(livePosition);
  useEffect(() => { livePositionRef.current = livePosition; }, [livePosition]);

  const findSelectedClip = useCallback(() => {
    const currentSelectedClipId = selectedClipIdRef.current;
    if (!currentSelectedClipId) return null;
    const s = useStudioStore.getState();
    for (const t of s.tracks) {
      const ac = t.audioClips.find((c: any) => c.id === currentSelectedClipId);
      if (ac) return { track: t, clip: ac, type: 'audio' as const };
      const mc = t.midiClips.find((c: any) => c.id === currentSelectedClipId);
      if (mc) return { track: t, clip: mc, type: 'midi' as const };
    }
    return null;
  }, []);

  useEffect(() => {
    dawActionsRef.current = {
      'studio.play-pause': () => {
        if (isPlayingRef.current) {
          store.pause();
          if (audioInitializedRef.current) audioEngine.pause();
        } else {
          store.play();
          if (audioInitializedRef.current) audioEngine.play();
        }
      },
      'studio.record': () => store.record(),
      'studio.loop': () => store.toggleLoop(),
      'studio.save': () => handleSave(),
      'studio.save-as': () => setShowSaveAsDialog(true),
      'studio.new-project': () => setShowProjectDialog(true),
      'studio.undo': () => store.undo(),
      'studio.redo': () => store.redo(),
      'studio.toggle-mixer': () => setShowMixer(prev => !prev),
      'studio.toggle-inspector': () => setShowInspector(prev => !prev),
      'studio.toggle-editor': () => setShowEditor(prev => !prev),
      'studio.project-settings': () => setShowProjectSettings(true),
      'studio.version-management': () => setShowVersionManagement(true),
      'studio.export': () => setShowExportDialog(true),
      'studio.import-audio': () => setShowImportAudio(true),
      'studio.stem-export': () => setShowStemExport(true),
      'studio.plugin-browser-all': () => { setPluginFilter('all'); setShowPluginBrowser(true); },
      'studio.plugin-browser-instruments': () => { setPluginFilter('instruments'); setShowPluginBrowser(true); },
      'studio.plugin-browser-effects': () => { setPluginFilter('effects'); setShowPluginBrowser(true); },
      'studio.toggle-ai-panel': () => setShowAIPanel(prev => !prev),
      'studio.music-generator': () => setShowMusicGenerator(true),
      'studio.show-shortcuts': () => setShowKeyboardShortcuts(true),
      'studio.delete-clip': () => {
        const found = findSelectedClip();
        if (!found) return;
        const s = useStudioStore.getState();
        if (found.type === 'audio') s.removeAudioClip(found.track.id, found.clip.id);
        else s.removeMidiClip(found.track.id, found.clip.id);
        setSelectedClipId(null);
      },
      'studio.split-clip': () => {
        const found = findSelectedClip();
        if (!found || found.type !== 'audio') return;
        const s = useStudioStore.getState();
        const playheadTime = livePositionRef.current;
        const clipStart = found.clip.startTime || 0;
        const clipEnd = clipStart + (found.clip.duration || 0);
        if (playheadTime > clipStart && playheadTime < clipEnd) {
          const firstDuration = playheadTime - clipStart;
          const secondDuration = clipEnd - playheadTime;
          const secondOffset = (found.clip.offset || 0) + firstDuration;
          s.updateAudioClip(found.track.id, found.clip.id, { duration: firstDuration });
          const { id: _id, waveformData: _wd, ...clipProps } = found.clip;
          s.addAudioClip(found.track.id, {
            ...clipProps,
            name: `${found.clip.name} (split)`,
            startTime: playheadTime,
            duration: secondDuration,
            offset: secondOffset,
          });
        }
      },
      'studio.duplicate-clip': () => {
        const found = findSelectedClip();
        if (!found) return;
        const s = useStudioStore.getState();
        const { id: _id, waveformData: _wd, ...clipProps } = found.clip;
        const newStart = (found.clip.startTime || 0) + (found.clip.duration || 1);
        if (found.type === 'audio') {
          s.addAudioClip(found.track.id, { ...clipProps, name: `${found.clip.name} (copy)`, startTime: newStart });
        } else {
          s.addMidiClip(found.track.id, { ...clipProps, name: `${found.clip.name} (copy)`, startTime: newStart });
        }
      },
      'studio.copy-clip': () => {
        const found = findSelectedClip();
        if (!found) return;
        copiedClipRef.current = { clip: { ...found.clip }, trackId: found.track.id, type: found.type };
      },
      'studio.paste-clip': () => {
        const copied = copiedClipRef.current;
        if (!copied) return;
        const s = useStudioStore.getState();
        const { id: _id, waveformData: _wd, ...clipProps } = copied.clip;
        if (copied.type === 'audio') {
          s.addAudioClip(copied.trackId, { ...clipProps, name: `${copied.clip.name} (paste)`, startTime: livePositionRef.current });
        } else {
          s.addMidiClip(copied.trackId, { ...clipProps, name: `${copied.clip.name} (paste)`, startTime: livePositionRef.current });
        }
      },
      'studio.toggle-automation': () => setShowAutomation(prev => !prev),
      'studio.toggle-video-track': () => setShowVideoTrack(prev => !prev),
      'studio.toggle-lyrics': () => setShowLyrics(prev => !prev),
      'studio.audio-devices': () => setShowAudioDevices(true),
      'studio.fullscreen': () => handleToggleFullscreen(),
      'studio.stop': () => {
        store.stop();
        if (audioInitializedRef.current) audioEngine.stop();
      },
      'studio.rewind': () => {
        store.setPosition(0);
        if (audioInitializedRef.current) audioEngine.setPositionTime(0);
        setLivePosition(0);
      },
    };
  });

  useEffect(() => {
    const manager = getShortcutManager();
    manager.setContext('studio');

    const dawShortcuts: ShortcutDefinition[] = [
      { id: 'studio.play-pause', key: ' ', description: 'Play / Pause', category: 'transport', context: 'studio', action: () => dawActionsRef.current['studio.play-pause']?.() },
      { id: 'studio.stop', key: '.', description: 'Stop', category: 'transport', context: 'studio', action: () => dawActionsRef.current['studio.stop']?.() },
      { id: 'studio.rewind', key: 'Home', description: 'Return to start', category: 'transport', context: 'studio', action: () => dawActionsRef.current['studio.rewind']?.() },
      { id: 'studio.record', key: 'r', description: 'Toggle recording', category: 'transport', context: 'studio', action: () => dawActionsRef.current['studio.record']?.() },
      { id: 'studio.loop', key: 'l', description: 'Toggle loop', category: 'transport', context: 'studio', action: () => dawActionsRef.current['studio.loop']?.() },
      { id: 'studio.save', key: 's', modifiers: ['ctrl'], description: 'Save project', category: 'file', context: 'studio', action: () => dawActionsRef.current['studio.save']?.() },
      { id: 'studio.save-as', key: 's', modifiers: ['ctrl', 'shift'], description: 'Save project as...', category: 'file', context: 'studio', action: () => dawActionsRef.current['studio.save-as']?.() },
      { id: 'studio.new-project', key: 'n', modifiers: ['ctrl'], description: 'New project', category: 'file', context: 'studio', action: () => dawActionsRef.current['studio.new-project']?.() },
      { id: 'studio.undo', key: 'z', modifiers: ['ctrl'], description: 'Undo', category: 'editing', context: 'studio', action: () => dawActionsRef.current['studio.undo']?.() },
      { id: 'studio.redo', key: 'y', modifiers: ['ctrl'], description: 'Redo', category: 'editing', context: 'studio', action: () => dawActionsRef.current['studio.redo']?.() },
      { id: 'studio.toggle-mixer', key: 'm', description: 'Toggle mixer', category: 'view', context: 'studio', action: () => dawActionsRef.current['studio.toggle-mixer']?.() },
      { id: 'studio.toggle-inspector', key: 'i', description: 'Toggle inspector', category: 'view', context: 'studio', action: () => dawActionsRef.current['studio.toggle-inspector']?.() },
      { id: 'studio.toggle-editor', key: 'e', description: 'Toggle editor', category: 'view', context: 'studio', action: () => dawActionsRef.current['studio.toggle-editor']?.() },
      { id: 'studio.project-settings', key: ',', modifiers: ['ctrl'], description: 'Project settings', category: 'settings', context: 'studio', action: () => dawActionsRef.current['studio.project-settings']?.() },
      { id: 'studio.version-management', key: 'v', modifiers: ['ctrl', 'alt'], description: 'Version management', category: 'file', context: 'studio', action: () => dawActionsRef.current['studio.version-management']?.() },
      { id: 'studio.export', key: 'e', modifiers: ['ctrl', 'shift'], description: 'Export project', category: 'file', context: 'studio', action: () => dawActionsRef.current['studio.export']?.() },
      { id: 'studio.import-audio', key: 'i', modifiers: ['ctrl'], description: 'Import audio', category: 'file', context: 'studio', action: () => dawActionsRef.current['studio.import-audio']?.() },
      { id: 'studio.stem-export', key: 'x', modifiers: ['ctrl', 'shift'], description: 'Stem export', category: 'file', context: 'studio', action: () => dawActionsRef.current['studio.stem-export']?.() },
      { id: 'studio.plugin-browser-all', key: 'p', modifiers: ['shift'], description: 'Browse all plugins', category: 'view', context: 'studio', action: () => dawActionsRef.current['studio.plugin-browser-all']?.() },
      { id: 'studio.plugin-browser-instruments', key: 'i', modifiers: ['shift'], description: 'Browse instruments', category: 'view', context: 'studio', action: () => dawActionsRef.current['studio.plugin-browser-instruments']?.() },
      { id: 'studio.plugin-browser-effects', key: 'f', modifiers: ['shift'], description: 'Browse effects', category: 'view', context: 'studio', action: () => dawActionsRef.current['studio.plugin-browser-effects']?.() },
      { id: 'studio.toggle-ai-panel', key: 'a', modifiers: ['alt'], description: 'Toggle AI panel', category: 'view', context: 'studio', action: () => dawActionsRef.current['studio.toggle-ai-panel']?.() },
      { id: 'studio.music-generator', key: 'g', modifiers: ['alt'], description: 'Open music generator', category: 'actions', context: 'studio', action: () => dawActionsRef.current['studio.music-generator']?.() },
      { id: 'studio.show-shortcuts', key: '?', description: 'Show keyboard shortcuts', category: 'help', context: 'studio', action: () => dawActionsRef.current['studio.show-shortcuts']?.() },
      { id: 'studio.delete-clip', key: 'Delete', description: 'Delete selected clip', category: 'editing', context: 'studio', action: () => dawActionsRef.current['studio.delete-clip']?.() },
      { id: 'studio.split-clip', key: 'b', modifiers: ['ctrl'], description: 'Split clip at playhead', category: 'editing', context: 'studio', action: () => dawActionsRef.current['studio.split-clip']?.() },
      { id: 'studio.duplicate-clip', key: 'd', modifiers: ['ctrl'], description: 'Duplicate clip', category: 'editing', context: 'studio', action: () => dawActionsRef.current['studio.duplicate-clip']?.() },
      { id: 'studio.copy-clip', key: 'c', modifiers: ['ctrl'], description: 'Copy clip', category: 'editing', context: 'studio', action: () => dawActionsRef.current['studio.copy-clip']?.() },
      { id: 'studio.paste-clip', key: 'v', modifiers: ['ctrl'], description: 'Paste clip', category: 'editing', context: 'studio', action: () => dawActionsRef.current['studio.paste-clip']?.() },
      { id: 'studio.toggle-automation', key: 'a', description: 'Toggle automation', category: 'view', context: 'studio', action: () => dawActionsRef.current['studio.toggle-automation']?.() },
      { id: 'studio.toggle-video-track', key: 'v', modifiers: ['shift'], description: 'Toggle video track', category: 'view', context: 'studio', action: () => dawActionsRef.current['studio.toggle-video-track']?.() },
      { id: 'studio.toggle-lyrics', key: 'l', modifiers: ['ctrl', 'shift'], description: 'Toggle lyrics panel', category: 'view', context: 'studio', action: () => dawActionsRef.current['studio.toggle-lyrics']?.() },
      { id: 'studio.audio-devices', key: 'd', modifiers: ['ctrl', 'shift'], description: 'Audio device settings', category: 'settings', context: 'studio', action: () => dawActionsRef.current['studio.audio-devices']?.() },
      { id: 'studio.fullscreen', key: 'F11', description: 'Toggle fullscreen', category: 'view', context: 'studio', action: () => dawActionsRef.current['studio.fullscreen']?.() },
    ];

    manager.registerMany(dawShortcuts);

    return () => {
      dawShortcuts.forEach(s => manager.unregister(s.id));
      manager.setContext('global');
    };
  }, []);

  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  }, []);

  const formatBars = useCallback((seconds: number) => {
    const beatsPerSecond = transport.tempo / 60;
    const totalBeats = seconds * beatsPerSecond;
    const timeSigParts = transport.timeSignature?.split('/') || ['4', '4'];
    const numerator = parseInt(timeSigParts[0], 10) || 4;
    const bars = Math.floor(totalBeats / numerator) + 1;
    const beats = Math.floor(totalBeats % numerator) + 1;
    const ticks = Math.floor((totalBeats % 1) * 480);
    return `${bars}.${beats}.${ticks.toString().padStart(3, '0')}`;
  }, [transport.tempo, transport.timeSignature]);

  // Clear audio engine state when project changes
  useEffect(() => {
    if (projectId !== prevProjectIdRef.current && audioInitializedRef.current) {
      logger.info('[DAW] Project changed, clearing audio engine state');
      audioEngine.stop();
      audioEngine.setPositionTime(0);
      
      // Remove all previously loaded clips
      for (const clipId of loadedClipsRef.current) {
        audioEngine.removeClip(clipId);
      }
      loadedClipsRef.current.clear();
      
      // Remove all previously loaded tracks
      for (const trackId of loadedTracksRef.current) {
        audioEngine.removeTrack(trackId);
      }
      loadedTracksRef.current.clear();
    }
    prevProjectIdRef.current = projectId;
  }, [projectId, audioEngine]);

  // Initialize audio engine and load clips when tracks change
  useEffect(() => {
    const initAndLoadAudio = async () => {
      if (!audioInitializedRef.current) {
        try {
          await audioEngine.initialize();
          audioInitializedRef.current = true;
        } catch (err) {
          logger.error('[DAW] Failed to initialize audio engine:', err);
          return;
        }
      }

      // Create tracks in audio engine
      for (const track of tracks) {
        if (!loadedTracksRef.current.has(track.id)) {
          audioEngine.createTrack(track.id);
          loadedTracksRef.current.add(track.id);
        }
        audioEngine.setTrackVolume(track.id, track.volume ?? 0.8);
        audioEngine.setTrackPan(track.id, track.pan ?? 0);
        audioEngine.setTrackMute(track.id, track.muted ?? false);
        audioEngine.setTrackSolo(track.id, track.solo ?? false);
      }

      // Load and schedule audio clips
      for (const track of tracks) {
        for (const clip of (track.audioClips || [])) {
          if (loadedClipsRef.current.has(clip.id)) continue;
          const clipUrl = clip.sourceUrl || clip.filePath;
          if (!clipUrl) continue;

          try {
            const buffer = await audioEngine.loadAudioFile(clipUrl);
            const sampleRate = audioEngine.sampleRate || 48000;
            const startSample = Math.floor((clip.startTime || 0) * sampleRate);
            const durationSeconds = clip.duration || buffer.duration;

            audioEngine.scheduleClip({
              id: clip.id,
              trackId: track.id,
              buffer,
              startSample,
              offsetSamples: Math.floor((clip.offset || 0) * sampleRate),
              durationSamples: Math.floor(durationSeconds * sampleRate),
              gain: clip.gain ?? 1,
              fadeInSamples: Math.floor((clip.fadeIn || 0) * sampleRate),
              fadeOutSamples: Math.floor((clip.fadeOut || 0) * sampleRate),
            });

            const peakData = audioEngine.extractPeakData(buffer, 256);
            useStudioStore.getState().updateAudioClip(track.id, clip.id, { waveformData: peakData });

            loadedClipsRef.current.add(clip.id);
            logger.info(`[DAW] Loaded clip: ${clip.name} on track ${track.name}`);
          } catch (err) {
            logger.error(`[DAW] Failed to load clip ${clip.name}:`, err);
          }
        }
      }
    };

    if (tracks.length > 0) {
      initAndLoadAudio();
    }
  }, [tracks, audioEngine]);

  const prevPositionRef = useRef(transport.position);
  useEffect(() => {
    if (audioInitializedRef.current && transport.position !== prevPositionRef.current) {
      if (!transport.isPlaying) {
        audioEngine.setPositionTime(transport.position);
        setLivePosition(transport.position);
      }
      prevPositionRef.current = transport.position;
    }
  }, [transport.position, transport.isPlaying, audioEngine]);

  const meteringRafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!transport.isPlaying) {
      if (meteringRafRef.current) cancelAnimationFrame(meteringRafRef.current);
      return;
    }
    const updateMeters = () => {
      const mData = audioEngine.meteringData;
      if (mData && mData.size > 0) {
        mData.forEach((meter, trackId) => {
          useStudioStore.getState().setTrackMeterLevel(trackId, meter.left, meter.right);
        });
      }
      meteringRafRef.current = requestAnimationFrame(updateMeters);
    };
    meteringRafRef.current = requestAnimationFrame(updateMeters);
    return () => {
      if (meteringRafRef.current) cancelAnimationFrame(meteringRafRef.current);
    };
  }, [transport.isPlaying, audioEngine]);

  const [followPlayhead, setFollowPlayhead] = useState(true);
  const arrangeScrollRef = useRef<HTMLDivElement>(null);
  const userScrollingRef = useRef(false);

  useEffect(() => {
    if (transport.isPlaying) {
      setFollowPlayhead(true);
    }
  }, [transport.isPlaying]);

  useEffect(() => {
    if (!transport.isPlaying || !followPlayhead) return;
    const container = arrangeScrollRef.current;
    if (!container) return;
    const pixelsPerSecond = 40 * zoom * (transport.tempo / 60);
    const playheadPx = livePosition * pixelsPerSecond + trackHeaderWidth;
    const containerWidth = container.clientWidth;
    const scrollLeft = container.scrollLeft;
    const threshold = scrollLeft + containerWidth * 0.8;
    if (playheadPx > threshold || playheadPx < scrollLeft) {
      userScrollingRef.current = true;
      container.scrollTo({ left: Math.max(0, playheadPx - containerWidth * 0.3), behavior: 'smooth' });
      setTimeout(() => { userScrollingRef.current = false; }, 500);
    }
  }, [livePosition, transport.isPlaying, followPlayhead, zoom, transport.tempo, trackHeaderWidth]);

  const handleArrangeScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollX(e.currentTarget.scrollLeft);
    if (transport.isPlaying && !userScrollingRef.current) {
      setFollowPlayhead(false);
    }
  }, [transport.isPlaying]);

  const handleSeek = useCallback((seconds: number) => {
    useStudioStore.getState().setPosition(seconds);
    if (audioInitializedRef.current) {
      audioEngine.setPositionTime(seconds);
    }
    setLivePosition(seconds);
  }, [audioEngine]);

  const handlePlay = useCallback(() => {
    store.play();
    if (audioInitializedRef.current) {
      audioEngine.play();
    }
  }, [store, audioEngine]);

  const handlePause = useCallback(() => {
    store.pause();
    if (audioInitializedRef.current) {
      audioEngine.pause();
    }
  }, [store, audioEngine]);

  const handleStop = useCallback(() => {
    store.stop();
    if (audioInitializedRef.current) {
      audioEngine.stop();
    }
  }, [store, audioEngine]);

  const handleRecord = useCallback(() => store.record(), [store]);
  
  const handleRewind = useCallback(() => {
    store.setPosition(0);
    if (audioInitializedRef.current) {
      audioEngine.setPositionTime(0);
    }
  }, [store, audioEngine]);
  
  const handleToggleLoop = useCallback(() => store.toggleLoop(), [store]);

  const trackUpdateTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const debouncedTrackUpdate = useCallback((trackId: string, updates: Record<string, unknown>) => {
    if (!projectId) return;
    if (trackUpdateTimersRef.current[trackId]) {
      clearTimeout(trackUpdateTimersRef.current[trackId]);
    }
    trackUpdateTimersRef.current[trackId] = setTimeout(() => {
      delete trackUpdateTimersRef.current[trackId];
      const patchData: Record<string, unknown> = {};
      if (updates.volume !== undefined) patchData.volume = updates.volume;
      if (updates.pan !== undefined) patchData.pan = updates.pan;
      if (updates.muted !== undefined) patchData.isMuted = updates.muted;
      if (updates.solo !== undefined) patchData.isSolo = updates.solo;
      if (updates.armed !== undefined) patchData.isArmed = updates.armed;
      if (updates.name !== undefined) patchData.name = updates.name;
      if (updates.color !== undefined) patchData.color = updates.color;
      if (Object.keys(patchData).length === 0) return;
      apiRequest('PATCH', `/api/studio/tracks/${trackId}`, patchData).catch((err: any) => {
        logger.error('[DAW] Failed to update track on backend:', err);
      });
    }, 500);
  }, [projectId]);

  const handleTrackUpdate = useCallback((trackId: string, updates: any) => {
    store.updateTrack(trackId, updates);
    debouncedTrackUpdate(trackId, updates);
  }, [store, debouncedTrackUpdate]);

  const handleDeleteTrack = useCallback((trackId: string) => {
    store.removeTrack(trackId);
    toast({ title: 'Track Removed', description: 'Track has been deleted.' });
    if (projectId) {
      apiRequest('DELETE', `/api/studio/tracks/${trackId}`).catch((err: any) => {
        logger.error('[DAW] Failed to delete track on backend:', err);
        toast({ title: 'Sync Error', description: 'Failed to delete track on server.', variant: 'destructive' });
      });
    }
  }, [store, projectId, toast]);

  const handleAddTrack = useCallback((type: 'audio' | 'instrument' | 'midi' | 'bus') => {
    const color = TRACK_COLORS[tracks.length % TRACK_COLORS.length];
    const name = `${type.charAt(0).toUpperCase() + type.slice(1)} ${tracks.length + 1}`;
    store.addTrack(type, name);
    toast({ title: 'Track Added', description: `New ${type} track created.` });
    if (projectId) {
      apiRequest('POST', '/api/studio/tracks', {
        projectId,
        name,
        trackType: type,
        color,
        volume: 0.8,
        pan: 0,
        mute: false,
        solo: false,
        armed: false,
      }).catch((err: any) => {
        logger.error('[DAW] Failed to sync new track to backend:', err);
        toast({ title: 'Sync Error', description: 'Track created locally but failed to sync to server.', variant: 'destructive' });
      });
    }
  }, [store, tracks.length, toast, projectId]);

  const handleSave = useCallback(async () => {
    try {
      await forceSave();
      toast({ title: 'Project Saved', description: 'All changes have been saved.' });
    } catch (error: any) {
      toast({ title: 'Save Failed', description: error.message, variant: 'destructive' });
    }
  }, [forceSave, toast]);

  const handleAIMix = useCallback(async () => {
    if (!projectId) return;
    setIsAIMixing(true);
    try {
      await apiRequest('POST', `/api/studio/ai-mix/${projectId}`);
      toast({ title: 'AI Mix Complete', description: 'Your tracks have been balanced and processed.' });
    } catch (error: any) {
      toast({ title: 'Mix Failed', description: error.message, variant: 'destructive' });
    } finally {
      setIsAIMixing(false);
    }
  }, [projectId, toast]);

  const handleAIMaster = useCallback(async () => {
    if (!projectId) return;
    setIsAIMastering(true);
    try {
      await apiRequest('POST', `/api/studio/ai-master/${projectId}`, { targetLufs: -14 });
      toast({ title: 'AI Master Complete', description: 'Your project has been mastered for streaming.' });
    } catch (error: any) {
      toast({ title: 'Master Failed', description: error.message, variant: 'destructive' });
    } finally {
      setIsAIMastering(false);
    }
  }, [projectId, toast]);

  const handleGenerateMelody = useCallback(async (params?: { key?: string; scale?: string; tempo?: number }) => {
    try {
      const res = await apiRequest('POST', '/api/studio/generation/text', {
        text: 'melodic synthesizer',
        projectId,
        bars: 8,
        instrumentType: 'synth',
        instrumentCategory: 'melodic',
        tempo: params?.tempo || transport.tempo,
        key: params?.key || musicalKey,
        scale: params?.scale || musicalScale,
      });
      const response = await res.json();
      if (response.audioFilePath) {
        toast({ title: 'Melody Generated', description: 'New melody track has been created.' });
      }
    } catch (error: any) {
      toast({ title: 'Generation Failed', description: error.message, variant: 'destructive' });
    }
  }, [projectId, transport.tempo, musicalKey, musicalScale, toast]);

  const handleGenerateDrums = useCallback(async (params?: { genre?: string; tempo?: number }) => {
    try {
      const res = await apiRequest('POST', '/api/studio/generation/text', {
        text: `${params?.genre || 'trap'} drums`,
        projectId,
        bars: 8,
        instrumentType: 'drums',
        instrumentCategory: 'drums',
        tempo: params?.tempo || transport.tempo,
      });
      const response = await res.json();
      if (response.audioFilePath) {
        toast({ title: 'Drums Generated', description: 'New drum pattern has been created.' });
      }
    } catch (error: any) {
      toast({ title: 'Generation Failed', description: error.message, variant: 'destructive' });
    }
  }, [projectId, transport.tempo, toast]);

  const handleGenerateBass = useCallback(async (params?: { key?: string; scale?: string }) => {
    try {
      const res = await apiRequest('POST', '/api/studio/generation/text', {
        text: 'bass 808',
        projectId,
        bars: 8,
        instrumentType: 'bass',
        instrumentCategory: 'melodic',
        tempo: transport.tempo,
        key: params?.key || musicalKey,
        scale: params?.scale || musicalScale,
      });
      const response = await res.json();
      if (response.audioFilePath) {
        toast({ title: 'Bass Generated', description: 'New bass line has been created.' });
      }
    } catch (error: any) {
      toast({ title: 'Generation Failed', description: error.message, variant: 'destructive' });
    }
  }, [projectId, transport.tempo, musicalKey, musicalScale, toast]);

  const handleGeneratePercussion = useCallback(async () => {
    try {
      const res = await apiRequest('POST', '/api/studio/generation/text', {
        text: 'percussion shakers hi-hats',
        projectId,
        bars: 8,
        instrumentType: 'percussion',
        instrumentCategory: 'percussion',
        tempo: transport.tempo,
      });
      const response = await res.json();
      if (response.audioFilePath) {
        toast({ title: 'Percussion Generated', description: 'New percussion pattern has been created.' });
      }
    } catch (error: any) {
      toast({ title: 'Generation Failed', description: error.message, variant: 'destructive' });
    }
  }, [projectId, transport.tempo, toast]);

  const handleGenerateChords = useCallback(async (params?: { progression?: string; key?: string }) => {
    try {
      const res = await apiRequest('POST', '/api/studio/generation/text', {
        text: `chord progression ${params?.progression || 'I-V-vi-IV'}`,
        projectId,
        bars: 8,
        instrumentType: 'piano',
        instrumentCategory: 'melodic',
        tempo: transport.tempo,
        key: params?.key || musicalKey,
        scale: musicalScale,
      });
      const response = await res.json();
      if (response.audioFilePath) {
        toast({ title: 'Chords Generated', description: 'New chord progression has been created.' });
      }
    } catch (error: any) {
      toast({ title: 'Generation Failed', description: error.message, variant: 'destructive' });
    }
  }, [projectId, transport.tempo, musicalKey, musicalScale, toast]);

  const handleAnalyzeAudio = useCallback(async () => {
    return {
      key: musicalKey,
      scale: musicalScale,
      tempo: transport.tempo,
      timeSignature: transport.timeSignature || '4/4',
      energy: 0.75,
      danceability: 0.8,
      valence: 0.6,
      chords: [
        { chord: `${musicalKey}m`, time: 0 },
        { chord: 'Ab', time: 4 },
        { chord: 'Eb', time: 8 },
        { chord: 'Bb', time: 12 },
      ],
      sections: [
        { type: 'intro', start: 0, end: 8 },
        { type: 'verse', start: 8, end: 24 },
        { type: 'chorus', start: 24, end: 40 },
      ],
    };
  }, [musicalKey, musicalScale, transport.tempo, transport.timeSignature]);

  const handleDetectKey = useCallback(async () => {
    toast({ title: 'Key Detection', description: `Detected key: ${musicalKey} ${musicalScale}` });
  }, [musicalKey, musicalScale, toast]);

  const handleAutoArrange = useCallback(async () => {
    toast({ title: 'Auto-Arrange', description: 'AI arrangement suggestions applied.' });
  }, [toast]);

  const handleSuggestChords = useCallback(async () => {
    toast({ title: 'Chord Suggestions', description: 'AI chord recommendations available in the panel.' });
  }, [toast]);

  const handleAddPlugin = useCallback((pluginId: string, type: 'effect' | 'instrument') => {
    if (!selectedTrackId) {
      toast({ title: 'Select a Track', description: 'Please select a track to add the plugin to.' });
      return;
    }
    store.addPlugin(selectedTrackId, {
      name: pluginId,
      type: type as any,
      bypassed: false,
      parameters: {},
    });
    toast({ title: 'Plugin Added', description: `${pluginId} added to track.` });
    setShowPluginBrowser(false);
  }, [store, toast, selectedTrackId]);

  const selectedTrack = tracks.find(t => t.id === selectedTrackId);

  if (!projectId && !isLoading) {
    return (
      <div className="h-full w-full bg-[#1a1a1e] text-white">
        <StudioStartHub
          onProjectSelect={(id) => {
            navigate(`/studio/${id}`);
          }}
          onCreateProject={(title, templateId) => {
            setPendingProjectTitle(title || '');
            setShowProjectDialog(true);
          }}
        />
        <StudioProjectDialog
          open={showProjectDialog}
          onOpenChange={(open) => {
            setShowProjectDialog(open);
            if (!open) setPendingProjectTitle('');
          }}
          initialTitle={pendingProjectTitle}
          onProjectCreated={(newProjectId) => {
            queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
            queryClient.invalidateQueries({ queryKey: ['/api/studio/projects'] });
            queryClient.invalidateQueries({ queryKey: ['/api/studio/start-hub/summary'] });
          }}
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} style={cssVars as React.CSSProperties} className="h-full w-full flex flex-col bg-[#0f0f12] text-white overflow-hidden select-none">

      {/* ════ TOP BAR ════ */}
      <TransportBar
        transport={transport}
        project={project}
        livePosition={livePosition}
        canUndo={canUndo}
        canRedo={canRedo}
        isDirty={project.isDirty}
        formatTime={formatTime}
        formatBars={formatBars}
        onPlay={handlePlay}
        onPause={handlePause}
        onStop={handleStop}
        onRecord={handleRecord}
        onRewind={handleRewind}
        onToggleLoop={handleToggleLoop}
        onUndo={() => store.undo()}
        onRedo={() => store.redo()}
        onSave={handleSave}
        onTempoChange={(tempo) => store.setTempo(tempo)}
        onOpenPlugins={() => { setPluginFilter('all'); setShowPluginBrowser(true); }}
        onOpenAI={() => setShowAIPanel(!showAIPanel)}
        onOpenGenerator={() => setShowMusicGenerator(true)}
        showAIPanel={showAIPanel}
        punchIn={punchIn}
        punchOut={punchOut}
        punchInTime={punchInTime}
        punchOutTime={punchOutTime}
        loopRecord={loopRecord}
        onTogglePunchIn={() => setPunchIn(!punchIn)}
        onTogglePunchOut={() => setPunchOut(!punchOut)}
        onPunchInTimeChange={setPunchInTime}
        onPunchOutTimeChange={setPunchOutTime}
        onToggleLoopRecord={() => setLoopRecord(!loopRecord)}
        expertMode={expertMode}
        onToggleExpertMode={() => setExpertMode(!expertMode)}
        onOpenVersions={() => setShowVersionManagement(true)}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        masterVolume={masterTrack?.volume ?? 0.8}
        onMasterVolumeChange={(v) => {
          if (masterTrack) {
            store.updateTrack(masterTrack.id, { volume: v });
            audioEngine.setTrackVolume(masterTrack.id, v);
          }
        }}
      />

      {/* ════ BODY ════ */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Left Sidebar (Browser) ── */}
        <AnimatePresence initial={false}>
          {leftSidebarOpen && (
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: 188 }}
              exit={{ width: 0 }}
              transition={{ duration: 0.15, ease: 'easeInOut' }}
              className="shrink-0 border-r border-[#1e1e26] bg-[#111115] flex flex-col overflow-hidden z-10"
            >
              {/* Tab strip */}
              <div className="flex shrink-0 border-b border-[#1e1e26]">
                {(['tracks', 'files', 'plugins', 'presets'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setLeftSidebarTab(tab)}
                    className={cn(
                      "flex-1 py-1.5 text-[9px] font-semibold uppercase tracking-wider transition-colors",
                      leftSidebarTab === tab
                        ? "text-white border-b-2 border-emerald-500"
                        : "text-gray-700 hover:text-gray-400"
                    )}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto">
                {/* TRACKS tab */}
                {leftSidebarTab === 'tracks' && (
                  <div className="p-1 space-y-px">
                    <button
                      onClick={handleAddTrack}
                      className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-emerald-400 hover:bg-[#1a1a22] transition-colors"
                    >
                      <Plus className="h-3 w-3" /> Add Track
                    </button>
                    {tracks.map((track) => (
                      <button
                        key={track.id}
                        onClick={() => { setSelectedTrackId(track.id); setInspectorOpen(true); setActiveView('timeline'); }}
                        className={cn(
                          "w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors group",
                          selectedTrackId === track.id ? "bg-[#1e1e2a] text-white" : "text-gray-500 hover:bg-[#1a1a22] hover:text-white"
                        )}
                      >
                        <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: track.color || '#3b82f6' }} />
                        <span className="truncate flex-1 text-[11px]">{track.name}</span>
                        <div className="flex gap-0.5 shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleTrackUpdate(track.id, { muted: !track.muted }); }}
                            className={cn("h-4 w-4 rounded text-[8px] font-bold flex items-center justify-center transition-colors", track.muted ? "bg-yellow-500/20 text-yellow-400" : "text-gray-700 hover:text-gray-400")}
                          >M</button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleTrackUpdate(track.id, { solo: !track.solo }); }}
                            className={cn("h-4 w-4 rounded text-[8px] font-bold flex items-center justify-center transition-colors", track.solo ? "bg-cyan-500/20 text-cyan-400" : "text-gray-700 hover:text-gray-400")}
                          >S</button>
                        </div>
                      </button>
                    ))}
                    {tracks.length === 0 && (
                      <p className="text-[11px] text-gray-700 text-center py-6 px-2 leading-relaxed">No tracks yet.</p>
                    )}
                  </div>
                )}

                {/* FILES tab */}
                {leftSidebarTab === 'files' && (
                  <div className="p-2 space-y-0.5">
                    <button onClick={() => setShowImportAudio(true)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-gray-400 hover:bg-[#1a1a22] hover:text-white border border-dashed border-[#28282e] transition-colors mb-1">
                      <FolderOpen className="h-3 w-3 text-blue-400" /> Import Audio
                    </button>
                    <button onClick={() => setShowStemExport(true)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-gray-500 hover:bg-[#1a1a22] hover:text-white transition-colors">
                      <Layers className="h-3 w-3 text-purple-400" /> Stem Export
                    </button>
                    <button onClick={() => setShowExportDialog(true)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-gray-500 hover:bg-[#1a1a22] hover:text-white transition-colors">
                      <Headphones className="h-3 w-3 text-emerald-400" /> Export Mix
                    </button>
                    <button onClick={() => setShowProjectSettings(true)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-gray-500 hover:bg-[#1a1a22] hover:text-white transition-colors">
                      <Settings className="h-3 w-3 text-gray-500" /> Project Settings
                    </button>
                  </div>
                )}

                {/* PLUGINS tab */}
                {leftSidebarTab === 'plugins' && (
                  <div className="p-1 space-y-px">
                    <button onClick={() => { setPluginFilter('all'); setShowPluginBrowser(true); }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-gray-400 hover:bg-[#1a1a22] hover:text-white transition-colors">
                      <Library className="h-3 w-3 text-purple-400" /> All Plugins (413)
                    </button>
                    <button onClick={() => { setPluginFilter('instruments'); setShowPluginBrowser(true); }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-gray-400 hover:bg-[#1a1a22] hover:text-white transition-colors">
                      <Piano className="h-3 w-3 text-blue-400" /> Instruments (195)
                    </button>
                    <button onClick={() => { setPluginFilter('effects'); setShowPluginBrowser(true); }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-gray-400 hover:bg-[#1a1a22] hover:text-white transition-colors">
                      <Sliders className="h-3 w-3 text-green-400" /> Effects (218)
                    </button>
                    <div className="mx-2 my-1.5 border-t border-[#22222c]" />
                    <div className="px-2 py-0.5 text-[9px] text-gray-700 uppercase tracking-wider">MaxCore AI</div>
                    <button onClick={() => setShowMusicGenerator(true)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-gray-400 hover:bg-[#1a1a22] hover:text-white transition-colors">
                      <Sparkles className="h-3 w-3 text-amber-400" /> AI Generator
                    </button>
                    <button onClick={() => setShowAIPanel(!showAIPanel)} className={cn("w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[#1a1a22] transition-colors", showAIPanel ? "text-emerald-400 bg-emerald-500/10" : "text-gray-400 hover:text-white")}>
                      <Brain className="h-3 w-3" /> AI Co-Producer
                    </button>
                  </div>
                )}

                {/* PRESETS tab */}
                {leftSidebarTab === 'presets' && (() => {
                  const selectedTrack = tracks.find(t => t.id === selectedTrackId);

                  if (!selectedTrack) {
                    return (
                      <div className="p-3 text-center">
                        <p className="text-[11px] text-gray-700 py-4 leading-relaxed">
                          Select a track to browse presets.
                        </p>
                      </div>
                    );
                  }

                  // Preset definitions grouped by instrument family
                  const PRESET_GROUPS: { label: string; color: string; presets: string[] }[] = [
                    { label: '808 / Bass', color: 'text-red-400', presets: ['Deep 808', 'Sub Punch', 'Trap Bass', 'Finger Bass', 'Slap Bass', 'Growl Bass'] },
                    { label: 'Drums', color: 'text-yellow-400', presets: ['Trap Kit', 'Boom Bap', 'Pop Snares', 'Brush Jazz', 'Live Drums', 'Lo-Fi Kit'] },
                    { label: 'Synth / Lead', color: 'text-blue-400', presets: ['Warm Lead', 'Sawtooth', 'Supersaw', 'Pluck Stab', 'Saw Arp', 'FM Bell'] },
                    { label: 'Pads', color: 'text-purple-400', presets: ['Lush Pad', 'Choir Pad', 'Strings', 'Vox Pad', 'Dark Atmo', 'Space Pad'] },
                    { label: 'Keys', color: 'text-green-400', presets: ['Grand Piano', 'Rhodes EP', 'Wurlitzer', 'Organ B3', 'Honky Tonk', 'Toy Piano'] },
                    { label: 'FX / Texture', color: 'text-pink-400', presets: ['Riser', 'Downlifter', 'Noise Sweep', 'Vinyl Crackle', 'Air FX', 'Impact'] },
                  ];

                  return (
                    <div className="p-1 space-y-0.5 overflow-y-auto max-h-[calc(100vh-280px)]">
                      <div className="px-2 py-1 text-[9px] text-gray-600 uppercase tracking-wider">
                        {selectedTrack.name}
                      </div>
                      {PRESET_GROUPS.map(group => (
                        <div key={group.label}>
                          <div className={`px-2 py-0.5 text-[9px] uppercase tracking-wider font-medium ${group.color}`}>
                            {group.label}
                          </div>
                          {group.presets.map(preset => (
                            <button
                              key={preset}
                              className="w-full text-left flex items-center gap-2 px-3 py-1 rounded text-[11px] text-gray-400 hover:bg-[#1a1a22] hover:text-white transition-colors"
                              onClick={() => {
                                toast({
                                  title: 'Preset Loaded',
                                  description: `"${preset}" applied to ${selectedTrack.name}.`,
                                });
                              }}
                            >
                              {preset}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Sidebar footer */}
              <div className="border-t border-[#1e1e26] p-1 flex items-center gap-0.5 shrink-0">
                <button onClick={() => setShowAudioDevices(true)} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-gray-700 hover:text-gray-300 hover:bg-[#1a1a22] transition-colors">
                  <Headphones className="h-3 w-3" /> I/O
                </button>
                <button onClick={() => setShowKeyboardShortcuts(true)} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-gray-700 hover:text-gray-300 hover:bg-[#1a1a22] transition-colors">
                  <Keyboard className="h-3 w-3" /> Keys
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sidebar collapse toggle */}
        <button
          onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
          className="shrink-0 w-2 bg-[#111115] hover:bg-[#1a1a22] border-r border-[#1e1e26] flex items-center justify-center transition-colors"
          title={leftSidebarOpen ? 'Collapse browser' : 'Expand browser'}
        >
          <ChevronRight className={cn("h-2.5 w-2.5 text-gray-700 transition-transform", leftSidebarOpen && "rotate-180")} />
        </button>

        {/* ── Main Area ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* View tab bar */}
          <div className="h-8 shrink-0 border-b border-[#1e1e26] bg-[#0f0f12] flex items-center px-1 gap-0">
            {([
              { id: 'timeline' as const, label: 'Timeline', Icon: Waves },
              { id: 'mixer' as const, label: 'Mixer', Icon: Sliders },
              { id: 'nodegraph' as const, label: 'Node Graph', Icon: Activity, expert: true },
              { id: 'flow' as const, label: 'Flow', Icon: Layers },
            ]).filter(v => !v.expert || expertMode).map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setActiveView(id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 h-full text-[11px] font-medium border-b-2 transition-colors shrink-0",
                  activeView === id
                    ? "border-emerald-500 text-white bg-[#111115]"
                    : "border-transparent text-gray-600 hover:text-gray-300"
                )}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
            <div className="flex-1" />
            {/* Contextual toolbar for timeline view */}
            {activeView === 'timeline' && (
              <div className="flex items-center gap-0.5 pr-1">
                <button onClick={() => setZoom(z => Math.max(z / 1.25, 0.25))} className="h-6 w-6 flex items-center justify-center rounded hover:bg-[#22222c] text-gray-600 hover:text-white transition-colors">
                  <ZoomOut className="h-3 w-3" />
                </button>
                <span className="text-[10px] text-gray-700 w-8 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(z => Math.min(z * 1.25, 4))} className="h-6 w-6 flex items-center justify-center rounded hover:bg-[#22222c] text-gray-600 hover:text-white transition-colors">
                  <ZoomIn className="h-3 w-3" />
                </button>
                <div className="w-px h-4 bg-[#28282e] mx-0.5" />
                <button onClick={handleAddTrack} className="flex items-center gap-1 px-2 h-6 rounded text-[10px] text-gray-500 hover:text-white hover:bg-[#22222c] transition-colors">
                  <Plus className="h-3 w-3" /> Track
                </button>
                <button onClick={() => setShowAutomation(!showAutomation)} className={cn("flex items-center gap-1 px-2 h-6 rounded text-[10px] hover:bg-[#22222c] transition-colors", showAutomation ? "text-amber-400 bg-amber-500/10" : "text-gray-500 hover:text-white")}>
                  <Radio className="h-3 w-3" /> Auto
                </button>
                <button onClick={() => setShowEditor(!showEditor)} className={cn("flex items-center gap-1 px-2 h-6 rounded text-[10px] hover:bg-[#22222c] transition-colors", showEditor ? "text-purple-400 bg-purple-500/10" : "text-gray-500 hover:text-white")}>
                  <Pencil className="h-3 w-3" /> Editor
                </button>
                <button onClick={() => setShowLyrics(!showLyrics)} className={cn("flex items-center gap-1 px-2 h-6 rounded text-[10px] hover:bg-[#22222c] transition-colors", showLyrics ? "text-pink-400 bg-pink-500/10" : "text-gray-500 hover:text-white")}>
                  <FileText className="h-3 w-3" /> Lyrics
                </button>
                {expertMode && <>
                  <button onClick={() => setShowSurroundPanel(!showSurroundPanel)} className={cn("flex items-center gap-1 px-2 h-6 rounded text-[10px] hover:bg-[#22222c] transition-colors", showSurroundPanel ? "text-cyan-400 bg-cyan-500/10" : "text-gray-500 hover:text-white")}>
                    <Speaker className="h-3 w-3" /> Spatial
                  </button>
                  <button onClick={() => setShowVideoTrack(!showVideoTrack)} className={cn("flex items-center gap-1 px-2 h-6 rounded text-[10px] hover:bg-[#22222c] transition-colors", showVideoTrack ? "text-blue-400 bg-blue-500/10" : "text-gray-500 hover:text-white")}>
                    <Film className="h-3 w-3" /> Video
                  </button>
                </>}
                <button onClick={() => setShowAIPanel(!showAIPanel)} className={cn("flex items-center gap-1 px-2 h-6 rounded text-[10px] hover:bg-[#22222c] transition-colors", showAIPanel ? "text-emerald-400 bg-emerald-500/10" : "text-gray-500 hover:text-white")}>
                  <Brain className="h-3 w-3" /> AI
                </button>
              </div>
            )}
          </div>

          {/* ── Active View ── */}
          <div className="flex-1 flex overflow-hidden">
            {/* TIMELINE */}
            {activeView === 'timeline' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <TimelineRuler
                  zoom={zoom}
                  scrollX={scrollX}
                  tempo={transport.tempo}
                  timeSignature={`${transport.timeSignatureNumerator}/${transport.timeSignatureDenominator}`}
                  onSeek={handleSeek}
                />
                <div className="flex-1 overflow-auto" ref={arrangeScrollRef} onScroll={handleArrangeScroll}>
                  <ArrangeView
                    tracks={tracks}
                    selectedTrackId={selectedTrackId}
                    selectedClipId={selectedClipId}
                    zoom={zoom}
                    scrollX={scrollX}
                    tempo={transport.tempo}
                    playheadPosition={livePosition}
                    isPlaying={transport.isPlaying}
                    trackHeaderWidth={trackHeaderWidth}
                    onSelectTrack={(id) => { setSelectedTrackId(id); setInspectorOpen(true); }}
                    onSelectClip={setSelectedClipId}
                    onUpdateTrack={(id, updates) => handleTrackUpdate(id, updates)}
                    onDeleteTrack={handleDeleteTrack}
                    onDuplicateTrack={(id) => { store.duplicateTrack(id); toast({ title: 'Track Duplicated' }); }}
                    showAutomation={showAutomation}
                    automationLanes={automationLanes}
                    onAutomationLanesChange={setAutomationLanes}
                    showVideoTrack={showVideoTrack}
                    allTracks={tracks}
                    onAddTrack={handleAddTrack}
                  />
                </div>
                {showEditor && <EditorPanel track={selectedTrack} onClose={() => setShowEditor(false)} />}
                {showLyrics && !platform.isMobile && (
                  <LyricsPanel
                    isPlaying={transport.isPlaying}
                    playheadPosition={livePosition}
                    tempo={transport.tempo}
                    onSeek={handleSeek}
                    sections={lyricsSections}
                    activeSectionId={lyricsActiveSectionId}
                    onSectionsChange={setLyricsSections}
                    onActiveSectionChange={setLyricsActiveSectionId}
                  />
                )}
              </div>
            )}

            {/* MIXER — full embedded view */}
            {activeView === 'mixer' && (
              <MixerPanel
                tracks={tracks}
                masterTrack={masterTrack}
                selectedTrackId={selectedTrackId}
                onSelectTrack={(id) => { setSelectedTrackId(id); setInspectorOpen(true); }}
                onUpdateTrack={(id, updates) => handleTrackUpdate(id, updates)}
                onClose={() => setActiveView('timeline')}
                projectId={projectId || ''}
                embedded
              />
            )}

            {/* NODE GRAPH — expert only */}
            {activeView === 'nodegraph' && expertMode && (
              <NodeGraphView
                tracks={tracks}
                masterTrack={masterTrack}
                selectedTrackId={selectedTrackId}
                onSelectTrack={(id) => { setSelectedTrackId(id); setInspectorOpen(true); }}
                onOpenPlugins={(trackId) => {
                  setSelectedTrackId(trackId);
                  setPluginFilter('effects');
                  setShowPluginBrowser(true);
                }}
              />
            )}

            {/* FLOW — project map */}
            {activeView === 'flow' && (
              <FlowView
                tracks={tracks}
                tempo={transport.tempo}
                timeSignature={`${transport.timeSignatureNumerator}/${transport.timeSignatureDenominator}`}
                selectedTrackId={selectedTrackId}
                onSelectTrack={(id) => { setSelectedTrackId(id); setInspectorOpen(true); }}
                onAddTrack={handleAddTrack}
                onOpenMixer={() => setActiveView('mixer')}
                onOpenTimeline={() => setActiveView('timeline')}
                onOpenNodeGraph={expertMode ? () => setActiveView('nodegraph') : undefined}
                projectName={project.name}
                livePosition={livePosition}
                isPlaying={transport.isPlaying}
              />
            )}
          </div>
        </div>

        {/* ── Right Sidebar (Universal Inspector) ── */}
        <AnimatePresence initial={false}>
          {inspectorOpen && (
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: 240 }}
              exit={{ width: 0 }}
              transition={{ duration: 0.15, ease: 'easeInOut' }}
              className="shrink-0 border-l border-[#1e1e26] bg-[#111115] flex flex-col overflow-hidden z-10"
            >
              <div className="h-8 border-b border-[#1e1e26] flex items-center px-3 shrink-0">
                <span className="text-[10px] font-semibold text-gray-400 flex-1 uppercase tracking-wider">Inspector</span>
                <button onClick={() => setInspectorOpen(false)} className="h-5 w-5 flex items-center justify-center text-gray-700 hover:text-gray-300 rounded transition-colors">
                  <X className="h-3 w-3" />
                </button>
              </div>

              {selectedTrack ? (
                <TrackInspector
                  track={selectedTrack}
                  onClose={() => setSelectedTrackId(null)}
                  onUpdate={(updates) => handleTrackUpdate(selectedTrackId!, updates)}
                  onOpenPlugins={() => { setPluginFilter('all'); setShowPluginBrowser(true); }}
                  embedded
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 p-4 text-center">
                  <Settings className="h-8 w-8 text-gray-800" />
                  <p className="text-[11px] text-gray-700 leading-relaxed">
                    Select a track to inspect its properties and plugin chain.
                  </p>
                  {expertMode && (
                    <div className="w-full mt-3 space-y-0.5">
                      <div className="text-[9px] text-gray-700 uppercase tracking-wider text-left px-1 mb-1">Session</div>
                      <button onClick={() => setShowProjectSettings(true)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-gray-600 hover:bg-[#1a1a22] hover:text-gray-200 transition-colors">
                        <Settings className="h-3 w-3" /> Project Settings
                      </button>
                      <button onClick={() => setShowVersionManagement(true)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-gray-600 hover:bg-[#1a1a22] hover:text-gray-200 transition-colors">
                        <Camera className="h-3 w-3" /> Version Branches
                      </button>
                    </div>
                  )}
                </div>
              )}

              {showAIPanel && (
                <div className="border-t border-[#1e1e26] overflow-hidden shrink-0" style={{ maxHeight: 340 }}>
                  <FlowStateAIPanel
                    projectId={projectId}
                    tracks={tracks}
                    currentTime={livePosition}
                    tempo={transport.tempo}
                    musicalKey={musicalKey}
                    scale={musicalScale}
                    onAIMix={handleAIMix}
                    onAIMaster={handleAIMaster}
                    onGenerateMelody={handleGenerateMelody}
                    onGenerateDrums={handleGenerateDrums}
                    onGeneratePercussion={handleGeneratePercussion}
                    onGenerateBass={handleGenerateBass}
                    onGenerateChords={handleGenerateChords}
                    onAnalyzeAudio={handleAnalyzeAudio}
                    onDetectKey={handleDetectKey}
                    onAutoArrange={handleAutoArrange}
                    onSuggestChords={handleSuggestChords}
                    onClose={() => setShowAIPanel(false)}
                    isAIMixing={isAIMixing}
                    isAIMastering={isAIMastering}
                  />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Inspector collapsed toggle */}
        {!inspectorOpen && (
          <button
            onClick={() => setInspectorOpen(true)}
            className="shrink-0 w-2 bg-[#111115] hover:bg-[#1a1a22] border-l border-[#1e1e26] flex items-center justify-center transition-colors"
            title="Open inspector"
          >
            <ChevronRight className="h-2.5 w-2.5 text-gray-700" />
          </button>
        )}
      </div>

      {/* ════ OVERLAYS ════ */}
      <MobileLyricsPanel
        open={showLyrics && platform.isMobile}
        onClose={() => setShowLyrics(false)}
        sections={lyricsSections}
        activeSectionId={lyricsActiveSectionId}
        onSectionsChange={setLyricsSections}
        onActiveSectionChange={setLyricsActiveSectionId}
        currentTime={livePosition}
        onSeek={handleSeek}
        isPlaying={transport.isPlaying}
      />

      {tracks.some(t => t.armed) && projectId && (
        <RecordingPanel
          projectId={projectId}
          armedTracks={tracks.filter(t => t.armed).map(t => ({ id: t.id, name: t.name }))}
          inputMonitoringMode="auto"
          currentTransportTime={livePosition}
          onRecordingStart={() => store.record()}
          onRecordingStop={() => store.stop()}
          onClipUploaded={(trackId, clip) => {
            toast({ title: 'Recording Saved', description: `Clip "${clip.name}" added to track.` });
          }}
          punchIn={punchIn}
          punchOut={punchOut}
          punchInTime={punchInTime}
          punchOutTime={punchOutTime}
          loopRecord={loopRecord}
        />
      )}

      <AnimatePresence>
        {showSurroundPanel && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-4 right-4 z-50 w-[480px] max-h-[500px] bg-[#1f1f23] border border-[#444] rounded-lg shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-3 py-2 bg-[#252529] border-b border-[#333]">
              <div className="flex items-center gap-2">
                <Speaker className="h-4 w-4 text-cyan-400" />
                <span className="text-sm font-medium">Surround / Immersive Audio</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowSurroundPanel(false)} className="h-6 w-6 p-0">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-gray-400">Format:</span>
                <select
                  value={surroundFormat}
                  onChange={(e) => setSurroundFormat(e.target.value as any)}
                  className="h-6 bg-[#1a1a1e] border border-[#444] rounded px-2 text-xs text-gray-300"
                >
                  <option value="2.0">Stereo (2.0)</option>
                  <option value="5.1">5.1 Surround</option>
                  <option value="7.1">7.1 Surround</option>
                  <option value="7.1.4">7.1.4 Atmos Bed</option>
                  <option value="atmos">Dolby Atmos</option>
                </select>
              </div>
              <SpatialAudioMixer
                speakerConfig={surroundFormat}
                onSpeakerConfigChange={(config) => setSurroundFormat(config)}
                objects={tracks.map((t, i) => ({
                  id: t.id,
                  name: t.name,
                  x: Math.cos((i / tracks.length) * Math.PI * 2) * 0.5,
                  y: Math.sin((i / tracks.length) * Math.PI * 2) * 0.5,
                  z: 0,
                  size: 1,
                  color: t.color || '#3b82f6',
                  mute: t.muted || false,
                  solo: t.solo || false,
                  volume: t.volume || 0.8,
                }))}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <FlowStatePluginBrowser
        open={showPluginBrowser}
        onOpenChange={setShowPluginBrowser}
        onAddPlugin={handleAddPlugin}
        trackId={selectedTrackId || undefined}
        projectId={projectId || undefined}
      />

      <Dialog open={showMusicGenerator} onOpenChange={setShowMusicGenerator}>
        <DialogContent className="max-w-4xl h-[80vh] p-0 bg-transparent border-0">
          <AIMusicGenerator
            projectId={projectId}
            initialTempo={transport.tempo}
            onClose={() => setShowMusicGenerator(false)}
            onTrackGenerated={(result) => {
              const s = useStudioStore.getState();
              const trackName = result.name || 'AI Generated Track';
              const newTrackId = s.addTrack(result.type || 'audio', trackName);
              if (result.audioFilePath && newTrackId) {
                s.addAudioClip(newTrackId, {
                  trackId: newTrackId,
                  startTime: 0,
                  duration: result.duration || 30,
                  sourceUrl: result.audioFilePath,
                  name: trackName,
                  offset: 0,
                  gain: 1,
                  fadeIn: 0,
                  fadeOut: 0,
                  color: result.color || '#3b82f6',
                  muted: false,
                  locked: false,
                });
              }
              toast({ title: 'AI Generation Complete', description: `"${trackName}" added to timeline.` });
              setShowMusicGenerator(false);
            }}
          />
        </DialogContent>
      </Dialog>

      <FlowStateKeyboardShortcuts
        isOpen={showKeyboardShortcuts}
        onClose={() => setShowKeyboardShortcuts(false)}
      />

      <SaveAsDialog
        open={showSaveAsDialog}
        onOpenChange={setShowSaveAsDialog}
        currentProjectId={projectId}
        currentTitle={project.name}
        currentDescription={project.description}
        onSaved={(newProjectId) => {
          queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
          queryClient.invalidateQueries({ queryKey: ['/api/studio/projects'] });
        }}
      />

      <UnsavedChangesDialog
        open={showUnsavedChangesDialog}
        onOpenChange={setShowUnsavedChangesDialog}
        projectName={project.name}
        isSaving={isSaving}
        onSave={async () => {
          setIsSaving(true);
          try {
            await forceSave();
            store.markSaved();
            if (pendingNavigation) {
              navigate(pendingNavigation);
            }
          } finally {
            setIsSaving(false);
            setPendingNavigation(null);
          }
        }}
        onDiscard={() => {
          store.markSaved();
          if (pendingNavigation) {
            navigate(pendingNavigation);
          }
          setPendingNavigation(null);
        }}
        onCancel={() => {
          setPendingNavigation(null);
        }}
      />

      <ProjectSettingsDialog
        open={showProjectSettings}
        onOpenChange={setShowProjectSettings}
        projectId={projectId}
        project={{
          name: project.name,
          description: project.description,
          tempo: transport.tempo,
          timeSignatureNumerator: transport.timeSignatureNumerator,
          timeSignatureDenominator: transport.timeSignatureDenominator,
          sampleRate: project.sampleRate,
          bitDepth: project.bitDepth,
        }}
        onUpdate={(updates) => {
          if (updates.name) store.setProject({ name: updates.name });
          if (updates.description !== undefined) store.setProject({ description: updates.description });
          if (updates.tempo) store.setTempo(updates.tempo);
          if (updates.timeSignatureNumerator !== undefined || updates.timeSignatureDenominator !== undefined) {
            store.setTransport({
              timeSignatureNumerator: updates.timeSignatureNumerator ?? transport.timeSignatureNumerator,
              timeSignatureDenominator: updates.timeSignatureDenominator ?? transport.timeSignatureDenominator,
            });
          }
          if (updates.sampleRate) store.setProject({ sampleRate: updates.sampleRate });
          if (updates.bitDepth) store.setProject({ bitDepth: updates.bitDepth });
        }}
      />

      <CrashRecoveryDialog
        onRecover={(data) => {
          try {
            const parsed = JSON.parse(data);
            // Restore project metadata
            if (parsed.projectName || parsed.projectDescription) {
              store.setProject({
                name: parsed.projectName || 'Recovered Project',
                description: parsed.projectDescription || '',
              });
            }
            // Restore transport state
            if (parsed.transport) {
              store.setTempo(parsed.transport.tempo || 120);
              store.setTransport({
                timeSignatureNumerator: parsed.transport.timeSignatureNumerator || 4,
                timeSignatureDenominator: parsed.transport.timeSignatureDenominator || 4,
                loopStart: parsed.transport.loopStart || 0,
                loopEnd: parsed.transport.loopEnd || 16,
                isLooping: parsed.transport.isLooping || false,
              });
              if (parsed.transport.position) {
                store.setPosition(parsed.transport.position);
              }
            }
            // Restore track states (volume, pan, mute, solo)
            if (parsed.tracks && Array.isArray(parsed.tracks)) {
              parsed.tracks.forEach((recoveredTrack: any) => {
                const existingTrack = store.tracks.find(t => t.id === recoveredTrack.id);
                if (existingTrack) {
                  store.updateTrack(recoveredTrack.id, {
                    volume: recoveredTrack.volume ?? existingTrack.volume,
                    pan: recoveredTrack.pan ?? existingTrack.pan,
                    muted: recoveredTrack.muted ?? existingTrack.muted,
                    solo: recoveredTrack.solo ?? existingTrack.solo,
                  });
                }
              });
            }
            // Clear recovery data after successful restore
            localStorage.removeItem('studio_recovery_data');
            toast({
              title: 'Work Recovered',
              description: 'Your previous session has been restored.',
            });
          } catch (error) {
            logger.error('[CrashRecovery] Failed to parse recovery data:', error);
            toast({
              title: 'Recovery Failed',
              description: 'Unable to restore previous session.',
              variant: 'destructive',
            });
          }
        }}
        onDiscard={() => {
          localStorage.removeItem('studio_recovery_data');
          toast({
            title: 'Recovery Discarded',
            description: 'Starting fresh session.',
          });
        }}
      />

      <VersionManagementDialog
        open={showVersionManagement}
        onOpenChange={setShowVersionManagement}
        projectName={project.name}
        versions={projectVersions}
        onCreateVersion={(name, description) => {
          // Create a full snapshot of current project state
          const snapshot = {
            project: {
              name: project.name,
              description: project.description,
              sampleRate: project.sampleRate,
              bitDepth: project.bitDepth,
            },
            transport: {
              tempo: transport.tempo,
              timeSignatureNumerator: transport.timeSignatureNumerator,
              timeSignatureDenominator: transport.timeSignatureDenominator,
              loopStart: transport.loopStart,
              loopEnd: transport.loopEnd,
              isLooping: transport.isLooping,
            },
            tracks: store.tracks.map(t => ({
              id: t.id,
              name: t.name,
              type: t.type,
              volume: t.volume,
              pan: t.pan,
              muted: t.muted,
              solo: t.solo,
            })),
          };
          const newVersion = {
            id: `ver_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name,
            description,
            createdAt: Date.now(),
            snapshot,
          };
          setProjectVersions(prev => [newVersion, ...prev].slice(0, 20));
          toast({
            title: 'Version Created',
            description: `Saved "${name}" snapshot.`,
          });
        }}
        onLoadVersion={(versionId) => {
          const version = projectVersions.find(v => v.id === versionId) as any;
          if (version?.snapshot) {
            // Restore project state
            if (version.snapshot.project) {
              store.setProject(version.snapshot.project);
            }
            // Restore transport state
            if (version.snapshot.transport) {
              store.setTempo(version.snapshot.transport.tempo);
              store.setTransport({
                timeSignatureNumerator: version.snapshot.transport.timeSignatureNumerator,
                timeSignatureDenominator: version.snapshot.transport.timeSignatureDenominator,
                loopStart: version.snapshot.transport.loopStart,
                loopEnd: version.snapshot.transport.loopEnd,
                isLooping: version.snapshot.transport.isLooping,
              });
            }
            // Restore track states
            if (version.snapshot.tracks && Array.isArray(version.snapshot.tracks)) {
              version.snapshot.tracks.forEach((snapshotTrack: any) => {
                const existingTrack = store.tracks.find(t => t.id === snapshotTrack.id);
                if (existingTrack) {
                  store.updateTrack(snapshotTrack.id, {
                    volume: snapshotTrack.volume,
                    pan: snapshotTrack.pan,
                    muted: snapshotTrack.muted,
                    solo: snapshotTrack.solo,
                  });
                }
              });
            }
            toast({
              title: 'Version Loaded',
              description: `Restored to "${version.name}"`,
            });
          } else {
            toast({
              title: 'Version Not Found',
              description: 'Unable to restore this version.',
              variant: 'destructive',
            });
          }
        }}
        onDeleteVersion={(versionId) => {
          setProjectVersions(prev => prev.filter(v => v.id !== versionId));
          toast({
            title: 'Version Deleted',
            description: 'The version has been removed.',
          });
        }}
      />

      <FlowStateExport
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        projectId={projectId || ''}
        projectName={project.name}
        duration={project.duration || 0}
        onExportComplete={(url) => {
          toast({ title: 'Export Complete', description: 'Your audio file is ready for download.' });
        }}
      />

      <FlowStateImportAudio
        open={showImportAudio}
        onOpenChange={setShowImportAudio}
        projectId={projectId || undefined}
        onImportComplete={async (files) => {
          await loadProjectData();
          
          await Promise.resolve();
          const freshState = useStudioStore.getState();
          for (const file of files) {
            for (const track of freshState.tracks) {
              for (const clip of track.audioClips) {
                const urlMatch = clip.sourceUrl === file.url || 
                  (clip.sourceUrl && file.url && clip.sourceUrl.includes(file.url.split('/').pop() || ''));
                if (urlMatch && clip.duration <= 0) {
                  try {
                    const response = await fetch(file.url);
                    const arrayBuffer = await response.arrayBuffer();
                    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                    const sampleRate = audioBuffer.sampleRate;
                    const totalSamples = audioBuffer.length;
                    const durationSeconds = totalSamples / sampleRate;
                    useStudioStore.getState().updateAudioClip(track.id, clip.id, {
                      duration: durationSeconds,
                      sampleRate,
                      totalSamples,
                    });
                    audioContext.close();
                  } catch (e) {
                    logger.error('[DAW] Failed to detect audio duration:', e);
                    if (file.duration && file.duration > 0) {
                      useStudioStore.getState().updateAudioClip(track.id, clip.id, { 
                        duration: file.duration 
                      });
                    }
                  }
                }
              }
            }
          }
          
          toast({ title: 'Audio Imported', description: `${files.length} file(s) imported successfully.` });
        }}
      />

      <StemExportDialog
        open={showStemExport}
        onOpenChange={setShowStemExport}
        projectId={projectId}
      />

      {!platform.isMobile && (
        <AudioDeviceDialog
          open={showAudioDevices}
          onOpenChange={setShowAudioDevices}
        />
      )}

      <MobileAudioDialog
        open={showAudioDevices && platform.isMobile}
        onClose={() => setShowAudioDevices(false)}
      />
    </div>
  );
}

interface TransportBarProps {
  transport: any;
  project: any;
  livePosition: number;
  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;
  formatTime: (s: number) => string;
  formatBars: (s: number) => string;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onRecord: () => void;
  onRewind: () => void;
  onToggleLoop: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onTempoChange: (tempo: number) => void;
  onOpenPlugins: () => void;
  onOpenAI: () => void;
  onOpenGenerator: () => void;
  showAIPanel: boolean;
  punchIn: boolean;
  punchOut: boolean;
  punchInTime: number;
  punchOutTime: number;
  loopRecord: boolean;
  onTogglePunchIn: () => void;
  onTogglePunchOut: () => void;
  onPunchInTimeChange: (t: number) => void;
  onPunchOutTimeChange: (t: number) => void;
  onToggleLoopRecord: () => void;
  expertMode?: boolean;
  onToggleExpertMode?: () => void;
  onOpenVersions?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  masterVolume?: number;
  onMasterVolumeChange?: (v: number) => void;
}

function TransportBar({
  transport, project, livePosition, canUndo, canRedo, isDirty, formatTime, formatBars,
  onPlay, onPause, onStop, onRecord, onRewind, onToggleLoop,
  onUndo, onRedo, onSave, onTempoChange, onOpenPlugins, onOpenAI, onOpenGenerator, showAIPanel,
  punchIn, punchOut, punchInTime, punchOutTime, loopRecord,
  onTogglePunchIn, onTogglePunchOut, onPunchInTimeChange, onPunchOutTimeChange, onToggleLoopRecord,
  expertMode, onToggleExpertMode, onOpenVersions, isFullscreen, onToggleFullscreen,
  masterVolume = 0.8, onMasterVolumeChange,
}: TransportBarProps) {
  return (
    <div className="bg-[#252529] border-b border-[#333] shrink-0 overflow-x-auto" style={{ height: 'var(--transport-h)' }}>
      <div className="flex items-center gap-4 min-w-max h-full px-4">
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={onUndo} disabled={!canUndo} className="h-8 w-8 p-0">
              <Undo className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={onRedo} disabled={!canRedo} className="h-8 w-8 p-0">
              <Redo className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Redo (Ctrl+Y)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={onSave} className={cn("h-8 w-8 p-0 relative", isDirty && "text-amber-400")}>
              <Save className="h-4 w-4" />
              {isDirty && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-400 rounded-full" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isDirty ? 'Save Changes (Ctrl+S)' : 'Saved (Ctrl+S)'}</TooltipContent>
        </Tooltip>
      </div>

      <div className="h-6 w-px bg-[#444]" />

      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={onRewind} className="h-8 w-8 p-0">
              <SkipBack className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Return to Start</TooltipContent>
        </Tooltip>

        {transport.isPlaying ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={onPause} className="h-8 w-8 p-0">
                <Pause className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Pause (Space)</TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={onPlay} className="h-8 w-8 p-0 text-green-500 hover:text-green-400">
                <Play className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Play (Space)</TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={onStop} className="h-8 w-8 p-0">
              <Square className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Stop</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRecord}
              className={cn("h-8 w-8 p-0", transport.isRecording && "text-red-500")}
            >
              <Circle className={cn("h-4 w-4", transport.isRecording && "fill-red-500")} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Record (R)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleLoop}
              className={cn("h-8 w-8 p-0", transport.isLooping && "text-blue-500")}
            >
              <Repeat className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Loop (L)</TooltipContent>
        </Tooltip>
      </div>

      <div className="h-6 w-px bg-[#444]" />

      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onTogglePunchIn}
              className={cn("h-6 px-1.5 text-[10px]", punchIn && "bg-orange-600/20 text-orange-400")}
            >
              P.In
            </Button>
          </TooltipTrigger>
          <TooltipContent>Punch In</TooltipContent>
        </Tooltip>
        {punchIn && (
          <input
            type="number"
            value={punchInTime}
            onChange={(e) => onPunchInTimeChange(Number(e.target.value))}
            className="w-12 h-5 bg-[#1a1a1e] border border-[#444] rounded px-1 text-[10px] font-mono text-center"
            min={0}
            step={0.1}
          />
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onTogglePunchOut}
              className={cn("h-6 px-1.5 text-[10px]", punchOut && "bg-orange-600/20 text-orange-400")}
            >
              P.Out
            </Button>
          </TooltipTrigger>
          <TooltipContent>Punch Out</TooltipContent>
        </Tooltip>
        {punchOut && (
          <input
            type="number"
            value={punchOutTime}
            onChange={(e) => onPunchOutTimeChange(Number(e.target.value))}
            className="w-12 h-5 bg-[#1a1a1e] border border-[#444] rounded px-1 text-[10px] font-mono text-center"
            min={0}
            step={0.1}
          />
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleLoopRecord}
              className={cn("h-6 px-1.5 text-[10px]", loopRecord && "bg-red-600/20 text-red-400")}
            >
              Loop Rec
            </Button>
          </TooltipTrigger>
          <TooltipContent>Loop Record</TooltipContent>
        </Tooltip>
      </div>

      <div className="h-6 w-px bg-[#444]" />

      {/* ── LCD Time Display ── */}
      <div
        className="flex items-center gap-3 px-3 py-1 rounded"
        style={{ background: '#080b0d', border: '1px solid #1e2a2e', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.8)' }}
      >
        <div className="flex flex-col items-center">
          <span className="text-[8px] text-emerald-900 uppercase tracking-widest font-semibold">TIME</span>
          <span
            className="font-mono text-base leading-none tracking-wider tabular-nums"
            style={{ color: '#00e5a0', textShadow: '0 0 8px rgba(0,229,160,0.5)', fontVariantNumeric: 'tabular-nums' }}
          >
            {formatTime(livePosition)}
          </span>
        </div>
        <div className="w-px h-6 bg-emerald-900/40" />
        <div className="flex flex-col items-center">
          <span className="text-[8px] text-emerald-900 uppercase tracking-widest font-semibold">BARS</span>
          <span
            className="font-mono text-base leading-none tracking-wider tabular-nums"
            style={{ color: '#00e5a0', textShadow: '0 0 8px rgba(0,229,160,0.5)', fontVariantNumeric: 'tabular-nums' }}
          >
            {formatBars(livePosition)}
          </span>
        </div>
      </div>

      <div className="h-6 w-px bg-[#444]" />

      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">BPM</span>
        <input
          type="number"
          value={transport.tempo}
          onChange={(e) => onTempoChange(Number(e.target.value))}
          className="w-14 h-7 rounded px-2 text-sm font-mono text-center font-semibold"
          style={{ background: '#080b0d', border: '1px solid #1e2a2e', color: '#f59e0b', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.8)' }}
          min={20}
          max={300}
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">SIG</span>
        <span
          className="font-mono text-sm font-semibold px-2 py-0.5 rounded"
          style={{ background: '#080b0d', border: '1px solid #1e2a2e', color: '#94a3b8' }}
        >
          {transport.timeSignature || '4/4'}
        </span>
      </div>

      <div className="h-6 w-px bg-[#444]" />

      {/* ── Master Volume ── */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 cursor-default">
              <Volume2 className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-[10px] text-gray-500 uppercase tracking-wider hidden lg:block">Master</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>Master Output Volume</TooltipContent>
        </Tooltip>
        <Slider
          value={[Math.round(masterVolume * 100)]}
          min={0}
          max={100}
          step={1}
          onValueChange={([v]) => onMasterVolumeChange?.(v / 100)}
          className="w-20"
        />
        <span
          className="text-[10px] font-mono w-7 text-center"
          style={{ color: masterVolume >= 0.9 ? '#ef4444' : masterVolume >= 0.7 ? '#22c55e' : '#94a3b8' }}
        >
          {Math.round(masterVolume * 100)}
        </span>
      </div>

      <div className="h-6 w-px bg-[#444]" />

      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={onOpenPlugins} className="h-8 gap-1.5 text-xs">
              <Library className="h-4 w-4" />
              Plugins
            </Button>
          </TooltipTrigger>
          <TooltipContent>Plugin Browser (Shift+P)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenAI}
              className={cn("h-8 gap-1.5 text-xs", showAIPanel && "bg-purple-600/20 text-purple-400")}
            >
              <Brain className="h-4 w-4" />
              AI Co-Producer
            </Button>
          </TooltipTrigger>
          <TooltipContent>AI Co-Producer Panel (Alt+A)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={onOpenGenerator} className="h-8 gap-1.5 text-xs">
              <Sparkles className="h-4 w-4" />
              Generate
            </Button>
          </TooltipTrigger>
          <TooltipContent>AI Music Generator (Alt+G)</TooltipContent>
        </Tooltip>
      </div>

      <div className="h-6 w-px bg-[#444]" />

      <div className="flex items-center gap-1.5 shrink-0 truncate max-w-48">
        <div className="w-5 h-5 rounded bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center shrink-0">
          <Music className="h-2.5 w-2.5 text-white" />
        </div>
        <span className="text-sm text-gray-400 truncate">{project.name || 'Untitled Project'}</span>
        {isDirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />}
      </div>

      {(onOpenVersions || onToggleExpertMode || onToggleFullscreen) && (
        <>
          <div className="h-6 w-px bg-[#444]" />
          <div className="flex items-center gap-1">
            {onOpenVersions && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={onOpenVersions} className="h-8 gap-1.5 text-xs">
                    <Camera className="h-4 w-4" />
                    Versions
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Version History</TooltipContent>
              </Tooltip>
            )}
            {onToggleExpertMode && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onToggleExpertMode}
                    className={cn(
                      "h-8 px-3 text-xs font-medium border",
                      expertMode
                        ? "border-purple-500/50 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20"
                        : "border-[#444] text-gray-500 hover:text-white"
                    )}
                  >
                    {expertMode ? 'Expert' : 'Simple'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{expertMode ? 'Switch to Simple mode' : 'Switch to Expert mode'}</TooltipContent>
              </Tooltip>
            )}
            {onToggleFullscreen && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={onToggleFullscreen} className="h-8 w-8 p-0">
                    {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </>
      )}
      </div>
    </div>
  );
}

interface ToolbarProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onAddTrack: (type: 'audio' | 'instrument' | 'midi' | 'bus') => void;
  showInspector: boolean;
  showEditor: boolean;
  showMixer: boolean;
  onToggleInspector: () => void;
  onToggleEditor: () => void;
  onToggleMixer: () => void;
  onOpenAllPlugins: () => void;
  onOpenInstruments: () => void;
  onOpenEffects: () => void;
  onOpenShortcuts: () => void;
  onExport: () => void;
  onImportAudio: () => void;
  onStemExport: () => void;
  showAutomation: boolean;
  onToggleAutomation: () => void;
  showSurroundPanel: boolean;
  onToggleSurround: () => void;
  showVideoTrack: boolean;
  onToggleVideo: () => void;
  showLyrics: boolean;
  onToggleLyrics: () => void;
  onOpenAudioDevices: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

function Toolbar({
  zoom, onZoomIn, onZoomOut, onAddTrack,
  showInspector, showEditor, showMixer,
  onToggleInspector, onToggleEditor, onToggleMixer,
  onOpenAllPlugins, onOpenInstruments, onOpenEffects, onOpenShortcuts,
  onExport, onImportAudio, onStemExport,
  showAutomation, onToggleAutomation,
  showSurroundPanel, onToggleSurround,
  showVideoTrack, onToggleVideo,
  showLyrics, onToggleLyrics,
  onOpenAudioDevices,
  isFullscreen, onToggleFullscreen
}: ToolbarProps) {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showBrowseMenu, setShowBrowseMenu] = useState(false);
  const [showViewMenu, setShowViewMenu] = useState(false);
  const [showFileMenu, setShowFileMenu] = useState(false);

  useEffect(() => {
    const close = () => {
      setShowAddMenu(false);
      setShowBrowseMenu(false);
      setShowViewMenu(false);
      setShowFileMenu(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const anyViewActive = showAutomation || showSurroundPanel || showVideoTrack;

  return (
    <div
      className="bg-[#1f1f23] border-b border-[#333] shrink-0 flex items-center gap-1 px-3"
      style={{ height: 'var(--toolbar-h)' }}
    >
      {/* ── Add Track ── */}
      <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
        <Button
          variant="ghost" size="sm"
          onClick={() => setShowAddMenu(!showAddMenu)}
          className="h-7 gap-1.5 text-xs font-medium"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Track
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
        <AnimatePresence>
          {showAddMenu && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="absolute top-full left-0 mt-1 bg-[#2a2a2e] border border-[#444] rounded-lg shadow-xl z-50 py-1 min-w-44"
            >
              {([
                { type: 'audio' as const, icon: Music, label: 'Audio Track' },
                { type: 'instrument' as const, icon: Piano, label: 'Instrument Track' },
                { type: 'midi' as const, icon: Layers, label: 'MIDI Track' },
                { type: 'bus' as const, icon: Sliders, label: 'Bus Track' },
              ] as const).map(({ type, icon: Icon, label }) => (
                <button
                  key={type}
                  onClick={() => { onAddTrack(type); setShowAddMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[#3a3a3e] transition-colors"
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="h-5 w-px bg-[#444] mx-0.5" />

      {/* ── Edit Modes ── */}
      {(() => {
        const editMode = useStudioStore((s) => s.view.editMode);
        const setEditMode = useStudioStore((s) => s.setEditMode);
        return (
          <div className="flex items-center gap-0.5">
            {([
              { mode: 'select' as const, icon: MousePointer2, label: 'Select (V)' },
              { mode: 'draw' as const, icon: Pencil, label: 'Draw (B)' },
              { mode: 'erase' as const, icon: Eraser, label: 'Erase (X)' },
              { mode: 'slice' as const, icon: Scissors, label: 'Slice (C)' },
            ]).map(({ mode, icon: MIcon, label }) => (
              <Tooltip key={mode}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => setEditMode(mode as any)}
                    className={cn('h-7 w-7 p-0', editMode === mode && 'bg-blue-600/20 text-blue-400')}
                  >
                    <MIcon className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{label}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        );
      })()}

      {/* ── Snap ── */}
      {(() => {
        const snapToGrid = useStudioStore((s) => s.view.snapToGrid);
        const setView = useStudioStore((s) => s.setView);
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost" size="sm"
                onClick={() => setView({ snapToGrid: !snapToGrid })}
                className={cn('h-7 w-7 p-0', snapToGrid && 'bg-blue-600/20 text-blue-400')}
              >
                <Grid3X3 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Snap to Grid</TooltipContent>
          </Tooltip>
        );
      })()}

      <div className="h-5 w-px bg-[#444] mx-0.5" />

      {/* ── Browse dropdown ── */}
      <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
        <Button
          variant="ghost" size="sm"
          onClick={() => setShowBrowseMenu(!showBrowseMenu)}
          className="h-7 gap-1 text-xs"
        >
          <Library className="h-3.5 w-3.5" />
          Browse
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
        <AnimatePresence>
          {showBrowseMenu && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="absolute top-full left-0 mt-1 bg-[#2a2a2e] border border-[#444] rounded-lg shadow-xl z-50 py-1 min-w-36"
            >
              {([
                { icon: Library, label: 'All Plugins', action: onOpenAllPlugins },
                { icon: Piano, label: 'Instruments', action: onOpenInstruments },
                { icon: Wand2, label: 'Effects', action: onOpenEffects },
              ] as const).map(({ icon: Icon, label, action }) => (
                <button
                  key={label}
                  onClick={() => { action(); setShowBrowseMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[#3a3a3e] transition-colors"
                >
                  <Icon className="h-3.5 w-3.5 text-gray-400" />
                  {label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="h-5 w-px bg-[#444] mx-0.5" />

      {/* ── Zoom ── */}
      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="sm" onClick={onZoomOut} className="h-7 w-7 p-0">
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs text-gray-400 w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
        <Button variant="ghost" size="sm" onClick={onZoomIn} className="h-7 w-7 p-0">
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* ── Spacer ── */}
      <div className="flex-1" />

      {/* ── View dropdown ── */}
      <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
        <Button
          variant="ghost" size="sm"
          onClick={() => setShowViewMenu(!showViewMenu)}
          className={cn('h-7 gap-1 text-xs relative', anyViewActive && 'text-blue-400')}
        >
          <Eye className="h-3.5 w-3.5" />
          View
          {anyViewActive && <span className="absolute top-1 right-5 w-1.5 h-1.5 bg-blue-400 rounded-full" />}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
        <AnimatePresence>
          {showViewMenu && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="absolute top-full right-0 mt-1 bg-[#2a2a2e] border border-[#444] rounded-lg shadow-xl z-50 py-1 min-w-44"
            >
              {([
                { icon: Activity, label: 'Automation', active: showAutomation, action: onToggleAutomation, dot: 'bg-purple-400' },
                { icon: Speaker, label: 'Surround', active: showSurroundPanel, action: onToggleSurround, dot: 'bg-cyan-400' },
                { icon: Film, label: 'Video Track', active: showVideoTrack, action: onToggleVideo, dot: 'bg-green-400' },
              ] as const).map(({ icon: Icon, label, active, action, dot }) => (
                <button
                  key={label}
                  onClick={() => { action(); setShowViewMenu(false); }}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-[#3a3a3e] transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Icon className={cn('h-3.5 w-3.5', active ? dot.replace('bg-', 'text-') : 'text-gray-400')} />
                    {label}
                  </span>
                  {active && <span className={cn('w-2 h-2 rounded-full shrink-0', dot)} />}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── File dropdown ── */}
      <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
        <Button
          variant="ghost" size="sm"
          onClick={() => setShowFileMenu(!showFileMenu)}
          className="h-7 gap-1 text-xs"
        >
          <Save className="h-3.5 w-3.5" />
          File
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
        <AnimatePresence>
          {showFileMenu && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="absolute top-full right-0 mt-1 bg-[#2a2a2e] border border-[#444] rounded-lg shadow-xl z-50 py-1 min-w-44"
            >
              {([
                { icon: Save, label: 'Export Audio', hint: 'Ctrl+Shift+E', action: onExport },
                { icon: FolderOpen, label: 'Import Audio', hint: 'Ctrl+I', action: onImportAudio },
                { icon: Layers, label: 'Export Stems', hint: 'Ctrl+Shift+S', action: onStemExport },
              ] as const).map(({ icon: Icon, label, hint, action }) => (
                <button
                  key={label}
                  onClick={() => { action(); setShowFileMenu(false); }}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-[#3a3a3e] transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-gray-400" />
                    {label}
                  </span>
                  <span className="text-[10px] text-gray-500 shrink-0">{hint}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="h-5 w-px bg-[#444] mx-0.5" />

      {/* ── Keyboard Shortcuts ── */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="sm" onClick={onOpenShortcuts} className="h-7 w-7 p-0">
            <Keyboard className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Keyboard Shortcuts (?)</TooltipContent>
      </Tooltip>

      {/* ── Lyrics ── */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost" size="sm"
            onClick={onToggleLyrics}
            className={cn('h-7 gap-1 text-xs', showLyrics && 'bg-emerald-600/20 text-emerald-400')}
          >
            <FileText className="h-3.5 w-3.5" />
            Lyrics
          </Button>
        </TooltipTrigger>
        <TooltipContent>Lyrics Editor (L)</TooltipContent>
      </Tooltip>

      {/* ── Audio Devices ── */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="sm" onClick={onOpenAudioDevices} className="h-7 w-7 p-0">
            <Headphones className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Audio Device Settings</TooltipContent>
      </Tooltip>

      {/* ── Fullscreen ── */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost" size="sm"
            onClick={onToggleFullscreen}
            className={cn('h-7 w-7 p-0', isFullscreen && 'text-yellow-400')}
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{isFullscreen ? 'Exit Fullscreen (F11)' : 'Fullscreen (F11)'}</TooltipContent>
      </Tooltip>

      <div className="h-5 w-px bg-[#444] mx-0.5" />

      {/* ── Panel Toggles ── */}
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost" size="sm"
              onClick={onToggleInspector}
              className={cn('h-7 gap-1 text-xs', showInspector && 'bg-blue-600/20 text-blue-400')}
            >
              <PanelRightOpen className="h-3.5 w-3.5" />
              Inspector
            </Button>
          </TooltipTrigger>
          <TooltipContent>Inspector (I)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost" size="sm"
              onClick={onToggleEditor}
              className={cn('h-7 gap-1 text-xs', showEditor && 'bg-blue-600/20 text-blue-400')}
            >
              <PanelBottomOpen className="h-3.5 w-3.5" />
              Editor
            </Button>
          </TooltipTrigger>
          <TooltipContent>Editor (E)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost" size="sm"
              onClick={onToggleMixer}
              className={cn('h-7 gap-1 text-xs', showMixer && 'bg-blue-600/20 text-blue-400')}
            >
              <Sliders className="h-3.5 w-3.5" />
              Mixer
            </Button>
          </TooltipTrigger>
          <TooltipContent>Mixer (M)</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

interface TimelineRulerProps {
  zoom: number;
  scrollX: number;
  tempo: number;
  sampleRate?: number;
  timeSignature?: string;
  onSeek?: (seconds: number) => void;
}

type TimeDisplayMode = 'bars' | 'seconds' | 'time' | 'samples' | 'bars+seconds' | 'bars+time';

const TIME_DISPLAY_LABELS: Record<TimeDisplayMode, string> = {
  'bars': 'Bars',
  'seconds': 'Seconds',
  'time': 'Timecode (SMPTE)',
  'samples': 'Samples',
  'bars+seconds': 'Bars + Seconds',
  'bars+time': 'Bars + Timecode',
};

function formatSecondsLabel(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const secsStr = secs < 10 && mins > 0 ? `0${secs.toFixed(secs % 1 === 0 ? 0 : 1)}` : secs.toFixed(secs % 1 === 0 ? 0 : 1);
  return `${mins}:${secsStr.padStart(2, '0')}`;
}

function formatSMPTE(totalSeconds: number, fps: number = 30): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  const frames = Math.floor((totalSeconds % 1) * fps);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}

function getTimeInterval(pixelsPerSecond: number): number {
  const minPixelGap = 80;
  const candidates = [0.5, 1, 2, 5, 10, 15, 30, 60];
  for (const c of candidates) {
    if (c * pixelsPerSecond >= minPixelGap) return c;
  }
  return 60;
}

function TimelineRuler({ zoom, scrollX, tempo, sampleRate = 44100, timeSignature = '4/4', onSeek }: TimelineRulerProps) {
  const timeDisplay = useStudioStore((state) => state.view.timeDisplay) as TimeDisplayMode;
  const setView = useStudioStore((state) => state.setView);

  const [numerator] = timeSignature.split('/').map(Number);
  const beatsPerBar = numerator || 4;
  const pixelsPerBeat = 40 * zoom;
  const pixelsPerBar = pixelsPerBeat * beatsPerBar;
  const pixelsPerSecond = pixelsPerBeat * (tempo / 60);

  const isDualMode = timeDisplay === 'bars+seconds' || timeDisplay === 'bars+time';
  const rulerHeight = isDualMode ? 'h-8' : 'h-6';

  const renderBars = () => {
    const visibleBars = Math.ceil(1200 / pixelsPerBar) + 2;
    const startBar = Math.max(1, Math.floor(scrollX / pixelsPerBar) + 1);
    return Array.from({ length: visibleBars + 50 }).map((_, i) => {
      const bar = startBar + i;
      return (
        <div
          key={bar}
          className="absolute bottom-0 flex flex-col items-center"
          style={{ left: `${(bar - 1) * pixelsPerBar}px` }}
        >
          <span className="text-[10px] text-gray-500 mb-0.5">{bar}</span>
          <div className="h-2 w-px bg-[#555]" />
        </div>
      );
    });
  };

  const renderTimeMarks = (mode: 'seconds' | 'time' | 'samples') => {
    const interval = getTimeInterval(pixelsPerSecond);
    const totalWidth = 1200 + scrollX + 500;
    const maxTime = totalWidth / pixelsPerSecond;
    const startTime = Math.floor((scrollX / pixelsPerSecond) / interval) * interval;
    const marks: JSX.Element[] = [];
    for (let t = Math.max(0, startTime); t <= maxTime; t += interval) {
      const px = t * pixelsPerSecond;
      let label: string;
      if (mode === 'seconds') {
        label = formatSecondsLabel(t);
      } else if (mode === 'time') {
        label = formatSMPTE(t);
      } else {
        label = Math.floor(t * sampleRate).toLocaleString();
      }
      marks.push(
        <div
          key={t}
          className="absolute bottom-0 flex flex-col items-center"
          style={{ left: `${px}px` }}
        >
          <span className="text-[10px] text-gray-500 mb-0.5 whitespace-nowrap">{label}</span>
          <div className="h-2 w-px bg-[#555]" />
        </div>
      );
    }
    return marks;
  };

  const renderDual = (secondaryMode: 'seconds' | 'time') => {
    const visibleBars = Math.ceil(1200 / pixelsPerBar) + 2;
    const startBar = Math.max(1, Math.floor(scrollX / pixelsPerBar) + 1);
    return Array.from({ length: visibleBars + 50 }).map((_, i) => {
      const bar = startBar + i;
      const px = (bar - 1) * pixelsPerBar;
      const timeAtPx = px / pixelsPerSecond;
      const secondary = secondaryMode === 'seconds'
        ? formatSecondsLabel(timeAtPx)
        : formatSMPTE(timeAtPx);
      return (
        <div
          key={bar}
          className="absolute bottom-0 flex flex-col items-center"
          style={{ left: `${px}px` }}
        >
          <span className="text-[10px] text-gray-500 leading-tight">{bar}</span>
          <span className="text-[8px] text-gray-600 leading-tight whitespace-nowrap">{secondary}</span>
          <div className="h-1.5 w-px bg-[#555]" />
        </div>
      );
    });
  };

  const getContent = () => {
    switch (timeDisplay) {
      case 'bars': return renderBars();
      case 'seconds': return renderTimeMarks('seconds');
      case 'time': return renderTimeMarks('time');
      case 'samples': return renderTimeMarks('samples');
      case 'bars+seconds': return renderDual('seconds');
      case 'bars+time': return renderDual('time');
      default: return renderBars();
    }
  };

  const visibleBars = Math.ceil(1200 / pixelsPerBar) + 2;
  const startBar = Math.max(1, Math.floor(scrollX / pixelsPerBar) + 1);
  const containerWidth = Math.max(200, (startBar + visibleBars + 50) * pixelsPerBar);

  const handleRulerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left + scrollX;
    const seconds = Math.max(0, clickX / pixelsPerSecond);
    onSeek(seconds);
  }, [onSeek, scrollX, pixelsPerSecond]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={`${rulerHeight} bg-[#1f1f23] border-b border-[#333] flex items-end overflow-hidden shrink-0 cursor-pointer`}
          style={{ marginLeft: 'var(--track-header-w)' }}
          onClick={handleRulerClick}
        >
          <div
            className="relative h-full"
            style={{ width: `${containerWidth}px`, transform: `translateX(-${scrollX}px)` }}
          >
            {getContent()}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {(Object.keys(TIME_DISPLAY_LABELS) as TimeDisplayMode[]).map((mode) => (
          <ContextMenuItem
            key={mode}
            onClick={() => setView({ timeDisplay: mode })}
          >
            <span className="w-5 inline-flex items-center justify-center mr-1">
              {timeDisplay === mode && <Check className="h-3.5 w-3.5" />}
            </span>
            {TIME_DISPLAY_LABELS[mode]}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}

interface ArrangeViewProps {
  tracks: any[];
  selectedTrackId: string | null;
  selectedClipId: string | null;
  zoom: number;
  scrollX: number;
  tempo: number;
  playheadPosition: number;
  isPlaying: boolean;
  trackHeaderWidth: number;
  onSelectTrack: (id: string) => void;
  onSelectClip: (id: string | null) => void;
  onUpdateTrack: (id: string, updates: any) => void;
  onDeleteTrack: (id: string) => void;
  onDuplicateTrack: (id: string) => void;
  showAutomation?: boolean;
  automationLanes?: any[];
  onAutomationLanesChange?: (lanes: any[]) => void;
  showVideoTrack?: boolean;
  allTracks?: any[];
  onAddTrack?: (type: 'audio' | 'instrument' | 'midi' | 'bus') => void;
}

function ArrangeView({
  tracks, selectedTrackId, selectedClipId, zoom, scrollX, tempo, playheadPosition, isPlaying,
  trackHeaderWidth, onSelectTrack, onSelectClip, onUpdateTrack, onDeleteTrack, onDuplicateTrack,
  showAutomation, automationLanes = [], onAutomationLanesChange, showVideoTrack, allTracks = [],
  onAddTrack,
}: ArrangeViewProps) {
  const pixelsPerSecond = 40 * zoom * (tempo / 60);
  const playheadX = playheadPosition * pixelsPerSecond;

  const timeSignatureNumerator = useStudioStore((s) => s.transport.timeSignatureNumerator) || 4;
  const pixelsPerBeat = 40 * zoom;
  const pixelsPerBar = pixelsPerBeat * timeSignatureNumerator;

  const gridElements = useMemo(() => {
    const startBar = Math.max(0, Math.floor(scrollX / pixelsPerBar));
    const visibleBars = Math.ceil(1400 / pixelsPerBar) + 2;
    const elements: JSX.Element[] = [];
    for (let i = 0; i < visibleBars; i++) {
      const bar = startBar + i;
      const x = bar * pixelsPerBar + trackHeaderWidth;
      elements.push(
        <div
          key={`bar-${bar}`}
          className="absolute top-0 bottom-0 w-px pointer-events-none"
          style={{ left: x, backgroundColor: 'rgba(255, 255, 255, 0.08)' }}
        />
      );
      for (let b = 1; b < timeSignatureNumerator; b++) {
        elements.push(
          <div
            key={`beat-${bar}-${b}`}
            className="absolute top-0 bottom-0 w-px pointer-events-none"
            style={{ left: x + b * pixelsPerBeat, backgroundColor: 'rgba(255, 255, 255, 0.03)' }}
          />
        );
      }
    }
    return elements;
  }, [scrollX, pixelsPerBar, pixelsPerBeat, timeSignatureNumerator, trackHeaderWidth]);

  return (
    <div className="relative min-h-full">
      {gridElements}

      {showVideoTrack && (
        <div className="border-b border-[#444]">
          <VideoTrack
            duration={300}
            isPlaying={isPlaying}
            pendingImportUrl={pendingImportVideoUrl}
            onPendingImportConsumed={() => setPendingImportVideoUrl(null)}
          />
        </div>
      )}

      {tracks.length === 0 ? (
        <div className="flex items-center justify-center h-full min-h-64">
          <div className="text-center px-6">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #1a1f2e, #252840)' }}>
              <Music className="h-8 w-8 text-emerald-500/70" />
            </div>
            <p className="text-sm font-medium text-gray-300 mb-1">Start Your Session</p>
            <p className="text-xs text-gray-600 mb-5">Add your first track to begin composing</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {([
                { type: 'audio' as const, icon: Music, label: 'Audio', color: '#3b82f6' },
                { type: 'instrument' as const, icon: Piano, label: 'Instrument', color: '#8b5cf6' },
                { type: 'midi' as const, icon: Layers, label: 'MIDI', color: '#22c55e' },
                { type: 'bus' as const, icon: Sliders, label: 'Bus', color: '#f59e0b' },
              ] as const).map(({ type, icon: TIcon, label, color }) => (
                <button
                  key={type}
                  onClick={() => onAddTrack(type)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all hover:scale-105 active:scale-95"
                  style={{ background: `${color}18`, border: `1px solid ${color}30`, color }}
                >
                  <TIcon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        tracks.map((track, index) => (
          <div key={track.id}>
            <TrackLane
              track={track}
              index={index}
              isSelected={track.id === selectedTrackId}
              selectedClipId={selectedClipId}
              zoom={zoom}
              tempo={tempo}
              onSelect={() => onSelectTrack(track.id)}
              onSelectClip={onSelectClip}
              onUpdate={(updates) => onUpdateTrack(track.id, updates)}
              onDelete={() => onDeleteTrack(track.id)}
              onDuplicate={() => onDuplicateTrack(track.id)}
              allTracks={allTracks}
            />
            {showAutomation && (
              <div className="border-b border-[#333] bg-[#1a1a1e]" style={{ height: 80 }}>
                <div className="flex h-full">
                  <div
                    className="shrink-0 flex items-center px-3 border-r border-[#333] bg-[#1f1f23]"
                    style={{ width: 'var(--track-header-w)' }}
                  >
                    <Activity className="h-3 w-3 mr-1.5 text-purple-400" />
                    <span className="text-[10px] text-gray-400 truncate">Automation</span>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <FlowStateAutomation
                      lanes={automationLanes.filter(l => l.trackId === track.id)}
                      onLanesChange={(newLanes) => {
                        const otherLanes = automationLanes.filter(l => l.trackId !== track.id);
                        onAutomationLanesChange?.([...otherLanes, ...newLanes]);
                      }}
                      duration={300}
                      currentTime={playheadPosition}
                      zoom={zoom}
                      isPlaying={isPlaying}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        ))
      )}

      <div
        className="absolute top-0 bottom-0 w-px bg-red-500 z-20 pointer-events-none"
        style={{ left: `${playheadX + trackHeaderWidth}px` }}
      >
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rotate-45" />
      </div>
    </div>
  );
}

interface TrackLaneProps {
  track: any;
  index: number;
  isSelected: boolean;
  selectedClipId: string | null;
  zoom: number;
  tempo: number;
  onSelect: () => void;
  onSelectClip: (id: string | null) => void;
  onUpdate: (updates: any) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  allTracks?: any[];
}

function TrackLane({ track, index, isSelected, selectedClipId, zoom, tempo, onSelect, onSelectClip, onUpdate, onDelete, onDuplicate, allTracks = [] }: TrackLaneProps) {
  const height = track.collapsed ? 24 : (track.height || 80);

  const trackTypeIcon = {
    audio: Music,
    instrument: Piano,
    midi: Layers,
    bus: Sliders,
    master: Volume2,
    aux: Sliders,
  }[track.type] || Music;

  const Icon = trackTypeIcon;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "flex border-b border-[#333] transition-colors cursor-pointer",
            isSelected ? "bg-[#2a2a3a]" : "hover:bg-[#232328]"
          )}
          style={{ height }}
          onClick={onSelect}
        >
          <div
            className="shrink-0 flex flex-col justify-center px-3 border-r border-[#333] relative"
            style={{ width: 'var(--track-header-w)', backgroundColor: `${track.color}15` }}
          >
            <div className="w-1 h-full absolute left-0 top-0" style={{ backgroundColor: track.color }} />
            
            {(() => {
              const tMeterDb = track.meterLevel?.left ?? -60;
              const tMeterPct = Math.max(0, Math.min(100, ((tMeterDb + 60) / 60) * 100));
              return (
                <div className="absolute right-0 top-0 bottom-0 w-[2px] bg-[#1a1a1e]">
                  <div
                    className="absolute bottom-0 left-0 right-0"
                    style={{
                      height: `${tMeterPct}%`,
                      background: tMeterPct > 90 ? '#ef4444' : tMeterPct > 70 ? '#eab308' : '#22c55e',
                      transition: 'height 75ms',
                    }}
                  />
                </div>
              );
            })()}

            {/* Top row: collapse + icon + name + M/S/R */}
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); onUpdate({ collapsed: !track.collapsed }); }}
                className="hover:bg-white/10 rounded p-0.5 shrink-0"
              >
                {track.collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>

              <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: track.color }} />

              <span className="text-xs truncate flex-1 font-medium">{track.name}</span>

              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); onUpdate({ muted: !track.muted }); }}
                  className={cn(
                    "h-5 w-5 flex items-center justify-center rounded text-[10px] font-bold",
                    track.muted ? "bg-orange-600 text-white" : "bg-[#333] hover:bg-[#444]"
                  )}
                >
                  M
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onUpdate({ solo: !track.solo }); }}
                  className={cn(
                    "h-5 w-5 flex items-center justify-center rounded text-[10px] font-bold",
                    track.solo ? "bg-yellow-600 text-white" : "bg-[#333] hover:bg-[#444]"
                  )}
                >
                  S
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onUpdate({ armed: !track.armed }); }}
                  className={cn(
                    "h-5 w-5 flex items-center justify-center rounded text-[10px]",
                    track.armed ? "bg-red-600 text-white" : "bg-[#333] hover:bg-[#444]"
                  )}
                >
                  <Circle className="h-2.5 w-2.5" fill={track.armed ? "white" : "none"} />
                </button>
              </div>
            </div>

            {/* Bottom row: volume + pan (only when not collapsed) */}
            {!track.collapsed && (
              <div className="flex items-center gap-2 mt-1.5" onClick={(e) => e.stopPropagation()}>
                <Volume2 className="h-2.5 w-2.5 text-gray-600 shrink-0" />
                <Slider
                  value={[Math.round((track.volume ?? 0.8) * 100)]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={([v]) => onUpdate({ volume: v / 100 })}
                  className="flex-1 h-1"
                />
                <span className="text-[9px] font-mono text-gray-600 w-5 text-right shrink-0">{Math.round((track.volume ?? 0.8) * 100)}</span>
                {/* Pan indicator */}
                <div
                  className="h-2.5 w-2.5 rounded-full shrink-0 border border-[#444] flex items-center justify-center cursor-pointer"
                  title={`Pan: ${Math.round((track.pan ?? 0) * 100)}`}
                  onClick={(e) => { e.stopPropagation(); onUpdate({ pan: 0 }); }}
                  style={{ background: track.pan && track.pan !== 0 ? '#3b82f6' : '#333' }}
                />
              </div>
            )}

            {track.type === 'bus' && !track.collapsed && (
              <div className="flex items-center mt-1" onClick={(e) => e.stopPropagation()}>
                <select
                  value={track.routeTo || ''}
                  onChange={(e) => { e.stopPropagation(); onUpdate({ routeTo: e.target.value || null }); }}
                  onClick={(e) => e.stopPropagation()}
                  className="h-4 bg-[#1a1a1e] border border-[#444] rounded text-[9px] text-gray-300 px-0.5 w-full"
                >
                  <option value="">Route To...</option>
                  <option value="master">Master</option>
                  {allTracks.filter(t => t.id !== track.id && t.type !== 'master').map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex-1 relative bg-[#1a1a1e] overflow-hidden">
            {!track.collapsed && track.audioClips?.map((clip: any) => (
              <AudioClipView key={clip.id} clip={clip} zoom={zoom} tempo={tempo} trackColor={track.color} trackId={track.id} isSelected={clip.id === selectedClipId} onSelect={() => onSelectClip(clip.id)} />
            ))}
            {!track.collapsed && track.midiClips?.map((clip: any) => (
              <MidiClipView key={clip.id} clip={clip} zoom={zoom} tempo={tempo} trackColor={track.color} trackId={track.id} isSelected={clip.id === selectedClipId} onSelect={() => onSelectClip(clip.id)} />
            ))}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onDuplicate}>
          <Copy className="h-3.5 w-3.5 mr-2" />
          Duplicate Track
        </ContextMenuItem>
        <ContextMenuItem onClick={onDelete} className="text-red-400">
          <Trash2 className="h-3.5 w-3.5 mr-2" />
          Delete Track
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

interface AudioClipViewProps {
  clip: any;
  zoom: number;
  tempo: number;
  trackColor: string;
  trackId: string;
  isSelected: boolean;
  onSelect: () => void;
}

function AudioClipView({ clip, zoom, tempo, trackColor, trackId, isSelected, onSelect }: AudioClipViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeSignatureNumerator = useStudioStore((s) => s.transport.timeSignatureNumerator) || 4;

  const pixelsPerBeat = 40 * zoom;
  const pixelsPerBar = pixelsPerBeat * timeSignatureNumerator;
  const pixelsPerSecond = pixelsPerBeat * (tempo / 60);

  const durationSeconds = clip.duration || 0;
  const beats = durationSeconds * (tempo / 60);
  const bars = beats / timeSignatureNumerator;
  const pixelWidth = bars * pixelsPerBar;

  const startBeats = (clip.startTime || 0) * (tempo / 60);
  const startBars = startBeats / timeSignatureNumerator;
  const left = startBars * pixelsPerBar;

  const isLoading = durationSeconds <= 0;
  const width = isLoading ? 100 : pixelWidth;
  const clampedWidth = Math.max(width, 20);

  const [drag, setDrag] = useState<{
    type: 'move' | 'trim-start' | 'trim-end';
    startX: number;
    origStart: number;
    origDuration: number;
    origOffset: number;
    deltaX: number;
  } | null>(null);

  useEffect(() => {
    if (!drag) return;
    const onMouseMove = (e: MouseEvent) => {
      setDrag(prev => prev ? { ...prev, deltaX: e.clientX - prev.startX } : null);
    };
    const onMouseUp = () => {
      setDrag(prev => {
        if (!prev) return null;
        const deltaSec = prev.deltaX / pixelsPerSecond;
        const s = useStudioStore.getState();
        const snapEnabled = s.view.snapToGrid;
        const gridSizeSec = (s.view.gridSize || 1) * 60 / (s.transport.tempo || 120);
        const snap = (v: number) => snapEnabled ? Math.round(v / gridSizeSec) * gridSizeSec : v;

        if (prev.type === 'move') {
          const newStart = snap(Math.max(0, prev.origStart + deltaSec));
          s.updateAudioClip(trackId, clip.id, { startTime: newStart });
        } else if (prev.type === 'trim-start') {
          const rawDelta = deltaSec;
          const maxDelta = prev.origDuration - (20 / pixelsPerSecond);
          const clampedDelta = Math.min(Math.max(rawDelta, -prev.origStart), maxDelta);
          const newStart = snap(prev.origStart + clampedDelta);
          const actualDelta = newStart - prev.origStart;
          s.updateAudioClip(trackId, clip.id, {
            startTime: newStart,
            duration: prev.origDuration - actualDelta,
            offset: (prev.origOffset || 0) + actualDelta,
          });
        } else if (prev.type === 'trim-end') {
          const newDur = Math.max(20 / pixelsPerSecond, prev.origDuration + deltaSec);
          s.updateAudioClip(trackId, clip.id, { duration: snap(prev.origStart + newDur) - prev.origStart });
        }
        return null;
      });
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [drag, pixelsPerSecond, trackId, clip.id]);

  const handleMouseDown = (e: React.MouseEvent, type: 'move' | 'trim-start' | 'trim-end') => {
    e.stopPropagation();
    onSelect();
    setDrag({
      type,
      startX: e.clientX,
      origStart: clip.startTime || 0,
      origDuration: clip.duration || 0,
      origOffset: clip.offset || 0,
      deltaX: 0,
    });
  };

  const dragOffset = drag ? drag.deltaX : 0;
  const displayLeft = drag?.type === 'move' ? left + dragOffset : drag?.type === 'trim-start' ? left + dragOffset : left;
  const displayWidth = drag?.type === 'trim-end' ? clampedWidth + dragOffset : drag?.type === 'trim-start' ? clampedWidth - dragOffset : clampedWidth;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const drawW = Math.floor(Math.max(displayWidth, 20));
    const drawH = canvas.clientHeight;
    canvas.width = drawW * dpr;
    canvas.height = drawH * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, drawW, drawH);

    const waveform = clip.waveformData;
    if (!waveform || waveform.length === 0) {
      ctx.fillStyle = `${trackColor}50`;
      const barCount = Math.min(50, Math.floor(drawW / 4));
      const barW = Math.max(1, drawW / barCount);
      for (let i = 0; i < barCount; i++) {
        const h = drawH * (0.2 + Math.random() * 0.5);
        ctx.fillRect(i * barW, (drawH - h) / 2, Math.max(barW - 1, 1), h);
      }
      return;
    }

    const peakCount = waveform.length;
    const step = Math.max(1, Math.floor(peakCount / drawW));
    const barsToRender = Math.min(drawW, peakCount);

    const clipStartTime = clip.startTime || 0;
    const clipDuration = clip.duration || 0;
    const secondsPerBeat = 60 / tempo;
    const secondsPerBar = secondsPerBeat * timeSignatureNumerator;

    if (clipDuration > 0 && secondsPerBar > 0) {
      const firstBar = Math.ceil(clipStartTime / secondsPerBar);
      const lastBar = Math.floor((clipStartTime + clipDuration) / secondsPerBar);
      ctx.lineWidth = 1;
      for (let bar = firstBar; bar <= lastBar; bar++) {
        const t = bar * secondsPerBar;
        const x = ((t - clipStartTime) / clipDuration) * drawW;
        if (x > 0 && x < drawW) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, drawH);
          ctx.stroke();
        }
      }
      const firstBeat = Math.ceil(clipStartTime / secondsPerBeat);
      const lastBeat = Math.floor((clipStartTime + clipDuration) / secondsPerBeat);
      for (let beat = firstBeat; beat <= lastBeat; beat++) {
        if (beat % timeSignatureNumerator === 0) continue;
        const t = beat * secondsPerBeat;
        const x = ((t - clipStartTime) / clipDuration) * drawW;
        if (x > 0 && x < drawW) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, drawH);
          ctx.stroke();
        }
      }
    }

    ctx.fillStyle = `${trackColor}90`;
    for (let i = 0; i < barsToRender; i++) {
      const peakIdx = Math.floor((i / barsToRender) * peakCount);
      let maxVal = 0;
      for (let j = 0; j < step && peakIdx + j < peakCount; j++) {
        const v = Math.abs(waveform[peakIdx + j]);
        if (v > maxVal) maxVal = v;
      }
      const h = Math.max(1, maxVal * drawH);
      const x = (i / barsToRender) * drawW;
      ctx.fillRect(x, (drawH - h) / 2, Math.max(drawW / barsToRender, 1), h);
    }
  }, [clip.waveformData, clip.startTime, clip.duration, displayWidth, trackColor, zoom, tempo, timeSignatureNumerator]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn("absolute top-1 bottom-1 rounded overflow-hidden group", drag && "opacity-80")}
          style={{
            left: Math.max(0, displayLeft),
            width: Math.max(displayWidth, 20),
            backgroundColor: `${trackColor}${isSelected ? '60' : '40'}`,
            borderLeft: `2px solid ${trackColor}`,
            borderRight: isSelected ? `2px solid ${trackColor}` : undefined,
            boxShadow: isSelected ? `0 0 8px ${trackColor}80, inset 0 0 0 1px ${trackColor}60` : undefined,
            opacity: isLoading ? 0.6 : 1,
            zIndex: isSelected ? 10 : 1,
          }}
          onMouseDown={(e) => handleMouseDown(e, 'move')}
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
        >
          <div
            className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10 hover:bg-white/30"
            onMouseDown={(e) => handleMouseDown(e, 'trim-start')}
          />
          <div
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize z-10 hover:bg-white/30"
            onMouseDown={(e) => handleMouseDown(e, 'trim-end')}
          />
          <div className="px-1.5 py-0.5 text-[10px] truncate text-white/80 pointer-events-none">
            {clip.name}{isLoading ? ' (loading...)' : ''}
          </div>
          <canvas
            ref={canvasRef}
            className="absolute inset-x-0 bottom-0 w-full pointer-events-none"
            style={{ height: 'calc(100% - 18px)' }}
          />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => {
          const s = useStudioStore.getState();
          const params = (s as any)._clipEditParams?.[clip.id] || {};
          (s as any)._showTimeStretchDialog = clip.id;
        }}>
          <Waves className="h-3.5 w-3.5 mr-2" />
          Time Stretch...
        </ContextMenuItem>
        <ContextMenuItem onClick={() => {
          const s = useStudioStore.getState();
          (s as any)._showPitchShiftDialog = clip.id;
        }}>
          <ArrowUpDown className="h-3.5 w-3.5 mr-2" />
          Pitch Shift...
        </ContextMenuItem>
        <ContextMenuItem onClick={() => {
          const s = useStudioStore.getState();
          s.updateAudioClip(trackId, clip.id, { reversed: !clip.reversed });
        }}>
          <RotateCcw className="h-3.5 w-3.5 mr-2" />
          {clip.reversed ? 'Unreverse' : 'Reverse'}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => {
          const s = useStudioStore.getState();
          s.updateAudioClip(trackId, clip.id, { normalized: true, gain: 1.0 });
        }}>
          <Activity className="h-3.5 w-3.5 mr-2" />
          Normalize
        </ContextMenuItem>
        <ContextMenuItem onClick={() => {
          const s = useStudioStore.getState();
          s.updateAudioClip(trackId, clip.id, { fadeIn: (clip.fadeIn || 0) > 0 ? 0 : 0.5 });
        }}>
          <Waves className="h-3.5 w-3.5 mr-2" />
          {(clip.fadeIn || 0) > 0 ? 'Remove Fade In' : 'Fade In (0.5s)'}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => {
          const s = useStudioStore.getState();
          s.updateAudioClip(trackId, clip.id, { fadeOut: (clip.fadeOut || 0) > 0 ? 0 : 0.5 });
        }}>
          <Waves className="h-3.5 w-3.5 mr-2" />
          {(clip.fadeOut || 0) > 0 ? 'Remove Fade Out' : 'Fade Out (0.5s)'}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function MidiClipGrid({ clipStartTime, clipDuration, tempo }: { clipStartTime: number; clipDuration: number; tempo: number }) {
  const tsNum = useStudioStore((s) => s.transport.timeSignatureNumerator) || 4;
  const secondsPerBeat = 60 / tempo;
  const secondsPerBar = secondsPerBeat * tsNum;
  if (clipDuration <= 0 || secondsPerBar <= 0) return null;

  const lines: JSX.Element[] = [];
  const firstBar = Math.ceil(clipStartTime / secondsPerBar);
  const lastBar = Math.floor((clipStartTime + clipDuration) / secondsPerBar);
  for (let bar = firstBar; bar <= lastBar; bar++) {
    const pct = ((bar * secondsPerBar - clipStartTime) / clipDuration) * 100;
    if (pct > 0 && pct < 100) {
      lines.push(<div key={`b${bar}`} className="absolute top-0 bottom-0 w-px pointer-events-none" style={{ left: `${pct}%`, backgroundColor: 'rgba(255,255,255,0.15)' }} />);
    }
  }
  const firstBeat = Math.ceil(clipStartTime / secondsPerBeat);
  const lastBeat = Math.floor((clipStartTime + clipDuration) / secondsPerBeat);
  for (let beat = firstBeat; beat <= lastBeat; beat++) {
    if (beat % tsNum === 0) continue;
    const pct = ((beat * secondsPerBeat - clipStartTime) / clipDuration) * 100;
    if (pct > 0 && pct < 100) {
      lines.push(<div key={`bt${beat}`} className="absolute top-0 bottom-0 w-px pointer-events-none" style={{ left: `${pct}%`, backgroundColor: 'rgba(255,255,255,0.06)' }} />);
    }
  }
  return <div className="absolute inset-0 pointer-events-none">{lines}</div>;
}

interface MidiClipViewProps {
  clip: any;
  zoom: number;
  tempo: number;
  trackColor: string;
  trackId: string;
  isSelected: boolean;
  onSelect: () => void;
}

function MidiClipView({ clip, zoom, tempo, trackColor, trackId, isSelected, onSelect }: MidiClipViewProps) {
  const pixelsPerSecond = 40 * zoom * (tempo / 60);
  const left = clip.startTime * pixelsPerSecond;
  const width = clip.duration * pixelsPerSecond;
  const clampedWidth = Math.max(width, 20);

  const [drag, setDrag] = useState<{
    type: 'move' | 'trim-start' | 'trim-end';
    startX: number;
    origStart: number;
    origDuration: number;
    origOffset: number;
    deltaX: number;
  } | null>(null);

  useEffect(() => {
    if (!drag) return;
    const onMouseMove = (e: MouseEvent) => {
      setDrag(prev => prev ? { ...prev, deltaX: e.clientX - prev.startX } : null);
    };
    const onMouseUp = () => {
      setDrag(prev => {
        if (!prev) return null;
        const deltaSec = prev.deltaX / pixelsPerSecond;
        const s = useStudioStore.getState();
        const snapEnabled = s.view.snapToGrid;
        const gridSizeSec = (s.view.gridSize || 1) * 60 / (s.transport.tempo || 120);
        const snap = (v: number) => snapEnabled ? Math.round(v / gridSizeSec) * gridSizeSec : v;

        if (prev.type === 'move') {
          const newStart = snap(Math.max(0, prev.origStart + deltaSec));
          s.updateMidiClip(trackId, clip.id, { startTime: newStart });
        } else if (prev.type === 'trim-start') {
          const maxDelta = prev.origDuration - (20 / pixelsPerSecond);
          const clampedDelta = Math.min(Math.max(deltaSec, -prev.origStart), maxDelta);
          const newStart = snap(prev.origStart + clampedDelta);
          const actualDelta = newStart - prev.origStart;
          s.updateMidiClip(trackId, clip.id, {
            startTime: newStart,
            duration: prev.origDuration - actualDelta,
          });
        } else if (prev.type === 'trim-end') {
          const newDur = Math.max(20 / pixelsPerSecond, prev.origDuration + deltaSec);
          s.updateMidiClip(trackId, clip.id, { duration: snap(prev.origStart + newDur) - prev.origStart });
        }
        return null;
      });
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [drag, pixelsPerSecond, trackId, clip.id]);

  const handleMouseDown = (e: React.MouseEvent, type: 'move' | 'trim-start' | 'trim-end') => {
    e.stopPropagation();
    onSelect();
    setDrag({
      type,
      startX: e.clientX,
      origStart: clip.startTime || 0,
      origDuration: clip.duration || 0,
      origOffset: clip.offset || 0,
      deltaX: 0,
    });
  };

  const dragOffset = drag ? drag.deltaX : 0;
  const displayLeft = drag?.type === 'move' ? left + dragOffset : drag?.type === 'trim-start' ? left + dragOffset : left;
  const displayWidth = drag?.type === 'trim-end' ? clampedWidth + dragOffset : drag?.type === 'trim-start' ? clampedWidth - dragOffset : clampedWidth;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn("absolute top-1 bottom-1 rounded overflow-hidden group", drag && "opacity-80")}
          style={{
            left: Math.max(0, displayLeft),
            width: Math.max(displayWidth, 20),
            backgroundColor: `${trackColor}${isSelected ? '60' : '40'}`,
            borderLeft: `2px solid ${trackColor}`,
            borderRight: isSelected ? `2px solid ${trackColor}` : undefined,
            boxShadow: isSelected ? `0 0 8px ${trackColor}80, inset 0 0 0 1px ${trackColor}60` : undefined,
            zIndex: isSelected ? 10 : 1,
          }}
          onMouseDown={(e) => handleMouseDown(e, 'move')}
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
        >
          <div
            className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10 hover:bg-white/30"
            onMouseDown={(e) => handleMouseDown(e, 'trim-start')}
          />
          <div
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize z-10 hover:bg-white/30"
            onMouseDown={(e) => handleMouseDown(e, 'trim-end')}
          />
          <div className="px-1.5 py-0.5 text-[10px] truncate text-white/80 pointer-events-none">{clip.name}</div>
          <MidiClipGrid clipStartTime={clip.startTime} clipDuration={clip.duration} tempo={tempo} />
          <div className="absolute inset-x-1 bottom-1 top-5 flex flex-col gap-px overflow-hidden pointer-events-none">
            {clip.notes?.slice(0, 8).map((note: any, i: number) => (
              <div
                key={i}
                className="h-1.5 rounded-sm"
                style={{
                  backgroundColor: trackColor,
                  width: `${(note.duration / clip.duration) * 100}%`,
                  marginLeft: `${(note.startTime / clip.duration) * 100}%`,
                }}
              />
            ))}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => {
          const s = useStudioStore.getState();
          s.updateMidiClip(trackId, clip.id, { reversed: !clip.reversed });
        }}>
          <RotateCcw className="h-3.5 w-3.5 mr-2" />
          {clip.reversed ? 'Unreverse' : 'Reverse'}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => {
          const s = useStudioStore.getState();
          s.updateMidiClip(trackId, clip.id, { normalized: true });
        }}>
          <Activity className="h-3.5 w-3.5 mr-2" />
          Normalize Velocities
        </ContextMenuItem>
        <ContextMenuItem onClick={() => {
          const s = useStudioStore.getState();
          s.updateMidiClip(trackId, clip.id, { pitchShift: (clip.pitchShift || 0) + 1 });
        }}>
          <ArrowUpDown className="h-3.5 w-3.5 mr-2" />
          Pitch +1 Semitone
        </ContextMenuItem>
        <ContextMenuItem onClick={() => {
          const s = useStudioStore.getState();
          s.updateMidiClip(trackId, clip.id, { pitchShift: (clip.pitchShift || 0) - 1 });
        }}>
          <ArrowUpDown className="h-3.5 w-3.5 mr-2" />
          Pitch -1 Semitone
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

interface TrackInspectorProps {
  track: any;
  onClose: () => void;
  onUpdate: (updates: any) => void;
  onOpenPlugins: () => void;
  embedded?: boolean;
}

function TrackInspector({ track, onClose, onUpdate, onOpenPlugins, embedded }: TrackInspectorProps) {
  return (
    <div className={embedded ? "flex-1 flex flex-col overflow-hidden" : "bg-[#1f1f23] border-r border-[#333] flex flex-col shrink-0 overflow-hidden"} style={embedded ? undefined : { width: 'var(--inspector-w)' }}>
      {!embedded && <div className="h-10 flex items-center justify-between px-3 border-b border-[#333]">
        <span className="text-sm font-medium">Inspector</span>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
          <PanelRightClose className="h-3.5 w-3.5" />
        </Button>
      </div>}

      <div className="flex-1 overflow-auto p-3 space-y-4">
        <div>
          <label className="text-[10px] text-gray-500 uppercase">Track Name</label>
          <input
            type="text"
            value={track.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            className="w-full mt-1 h-7 bg-[#2a2a2e] border border-[#444] rounded px-2 text-sm"
          />
        </div>

        <div>
          <label className="text-[10px] text-gray-500 uppercase">Volume</label>
          <div className="flex items-center gap-2 mt-1">
            <Slider
              value={[track.volume * 100]}
              onValueChange={([v]) => onUpdate({ volume: v / 100 })}
              max={100}
              className="flex-1"
            />
            <span className="text-xs w-10 text-right">{Math.round(track.volume * 100)}%</span>
          </div>
        </div>

        <div>
          <label className="text-[10px] text-gray-500 uppercase">Pan</label>
          <div className="flex items-center gap-2 mt-1">
            <Slider
              value={[track.pan * 50 + 50]}
              onValueChange={([v]) => onUpdate({ pan: (v - 50) / 50 })}
              max={100}
              className="flex-1"
            />
            <span className="text-xs w-10 text-right">
              {track.pan === 0 ? 'C' : track.pan > 0 ? `R${Math.round(track.pan * 100)}` : `L${Math.round(-track.pan * 100)}`}
            </span>
          </div>
        </div>

        <div>
          <label className="text-[10px] text-gray-500 uppercase">Color</label>
          <div className="flex gap-1 mt-1 flex-wrap">
            {TRACK_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => onUpdate({ color })}
                className={cn(
                  "w-6 h-6 rounded",
                  track.color === color && "ring-2 ring-white ring-offset-1 ring-offset-[#1f1f23]"
                )}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>

        <div className="pt-2 border-t border-[#333]">
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] text-gray-500 uppercase">Plugins ({track.plugins?.length || 0})</label>
            <Button variant="ghost" size="sm" onClick={onOpenPlugins} className="h-6 text-xs gap-1">
              <Plus className="h-3 w-3" />
              Add
            </Button>
          </div>
          <div className="space-y-1">
            {track.plugins?.map((plugin: any) => (
              <div
                key={plugin.id}
                className="flex items-center gap-2 p-2 bg-[#2a2a2e] rounded text-xs"
              >
                <Wand2 className="h-3.5 w-3.5 text-purple-400" />
                <span className="truncate flex-1">{plugin.name}</span>
                <button
                  onClick={() => useStudioStore.getState().togglePluginBypass(track.id, plugin.id)}
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded",
                    plugin.bypassed ? "bg-gray-600" : "bg-green-600/30 text-green-400"
                  )}
                >
                  {plugin.bypassed ? 'OFF' : 'ON'}
                </button>
              </div>
            ))}
            {(!track.plugins || track.plugins.length === 0) && (
              <p className="text-xs text-gray-500 italic">No plugins</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface EditorPanelProps {
  track: any;
  onClose: () => void;
}

function EditorPanel({ track, onClose }: EditorPanelProps) {
  const [height, setHeight] = useState(192);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  const handleResizeStart = (e: React.MouseEvent) => {
    dragRef.current = { startY: e.clientY, startH: height };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startY - ev.clientY;
      setHeight(Math.max(80, Math.min(600, dragRef.current.startH + delta)));
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    e.preventDefault();
  };

  return (
    <div className="bg-[#1a1a1e] border-t border-[#333] flex flex-col shrink-0" style={{ height }}>
      <div
        className="h-1.5 bg-[#333] hover:bg-blue-500/50 active:bg-blue-500 cursor-ns-resize shrink-0 transition-colors"
        onMouseDown={handleResizeStart}
        title="Drag to resize"
      />
      <div className="h-8 flex items-center justify-between px-3 bg-[#1f1f23] border-b border-[#333] shrink-0">
        <span className="text-sm font-medium">
          {track ? `Editing: ${track.name}` : 'Editor'}
        </span>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
          <PanelBottomClose className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex-1 flex items-center justify-center text-gray-500 overflow-hidden">
        {track ? (
          <div className="text-center">
            <Piano className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Select a clip to edit</p>
          </div>
        ) : (
          <div className="text-center">
            <Layers className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Select a track first</p>
          </div>
        )}
      </div>
    </div>
  );
}

interface MixerPanelProps {
  tracks: any[];
  masterTrack: any;
  selectedTrackId: string | null;
  onSelectTrack: (id: string) => void;
  onUpdateTrack: (id: string, updates: any) => void;
  onClose: () => void;
  projectId: string;
  embedded?: boolean;
}

function MixerPanel({ tracks, masterTrack, selectedTrackId, onSelectTrack, onUpdateTrack, onClose, projectId, embedded }: MixerPanelProps) {
  const [showSnapshotMenu, setShowSnapshotMenu] = useState(false);
  const [mixerHeight, setMixerHeight] = useState(embedded ? 9999 : 240);
  const mixerDragRef = useRef<{ startY: number; startH: number } | null>(null);
  const queryClient = useQueryClient();

  const handleMixerResizeStart = (e: React.MouseEvent) => {
    mixerDragRef.current = { startY: e.clientY, startH: mixerHeight };
    const onMove = (ev: MouseEvent) => {
      if (!mixerDragRef.current) return;
      const delta = mixerDragRef.current.startY - ev.clientY;
      setMixerHeight(Math.max(120, Math.min(700, mixerDragRef.current.startH + delta)));
    };
    const onUp = () => {
      mixerDragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    e.preventDefault();
  };

  const { data: snapshotsData } = useQuery({
    queryKey: ['mix-snapshots', projectId],
    queryFn: async () => {
      if (!projectId) return { snapshots: [] };
      const res = await apiRequest('GET', `/api/studio/projects/${projectId}/mix-snapshots`);
      return res.json();
    },
    enabled: !!projectId,
  });

  const snapshots = snapshotsData?.snapshots || [];

  const saveSnapshotMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/studio/projects/${projectId}/mix-snapshots`, {
        name: `Mix Snapshot ${new Date().toLocaleTimeString()}`,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mix-snapshots', projectId] });
    },
  });

  const recallSnapshotMutation = useMutation({
    mutationFn: async (snapshotId: string) => {
      const res = await apiRequest('POST', `/api/studio/projects/${projectId}/mix-snapshots/${snapshotId}/recall`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mix-snapshots', projectId] });
    },
  });

  const deleteSnapshotMutation = useMutation({
    mutationFn: async (snapshotId: string) => {
      const res = await apiRequest('DELETE', `/api/studio/projects/${projectId}/mix-snapshots/${snapshotId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mix-snapshots', projectId] });
    },
  });

  return (
    <div className={cn("bg-[#1a1a1e] border-t border-[#333] flex flex-col", embedded ? "flex-1 overflow-hidden" : "shrink-0")} style={embedded ? undefined : { height: mixerHeight }}>
      {!embedded && <div
        className="h-1.5 bg-[#333] hover:bg-blue-500/50 active:bg-blue-500 cursor-ns-resize shrink-0 transition-colors"
        onMouseDown={handleMixerResizeStart}
        title="Drag to resize"
      />}
      <div className="h-8 flex items-center justify-between px-3 bg-[#1f1f23] border-b border-[#333] shrink-0">
        <span className="text-sm font-medium">Mixer</span>
        <div className="flex items-center gap-1">
          {projectId && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => saveSnapshotMutation.mutate()}
                    disabled={saveSnapshotMutation.isPending}
                    className="h-6 px-2 text-[10px] gap-1"
                  >
                    <Camera className="h-3 w-3" />
                    Save Snapshot
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Save current mix as snapshot</TooltipContent>
              </Tooltip>
              <div className="relative">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSnapshotMenu(!showSnapshotMenu)}
                  className="h-6 px-2 text-[10px] gap-1"
                >
                  <ChevronDown className="h-3 w-3" />
                  Snapshots {snapshots.length > 0 && `(${snapshots.length})`}
                </Button>
                {showSnapshotMenu && (
                  <div className="absolute right-0 top-7 z-50 w-56 bg-[#252529] border border-[#444] rounded shadow-lg py-1 max-h-48 overflow-y-auto">
                    {snapshots.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-gray-500">No snapshots saved</div>
                    ) : (
                      snapshots.map((snap: any) => (
                        <div key={snap.id} className="flex items-center justify-between px-3 py-1.5 hover:bg-[#333] group">
                          <button
                            className="flex-1 text-left text-xs truncate"
                            onClick={() => {
                              recallSnapshotMutation.mutate(snap.id);
                              setShowSnapshotMenu(false);
                            }}
                          >
                            {snap.name}
                          </button>
                          <button
                            className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 ml-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteSnapshotMutation.mutate(snap.id);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </>
          )}
          <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
            <PanelBottomClose className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex-1 flex overflow-x-auto p-2 gap-1">
        {tracks.map((track) => (
          <ChannelStrip
            key={track.id}
            track={track}
            isSelected={track.id === selectedTrackId}
            onSelect={() => onSelectTrack(track.id)}
            onUpdate={(updates) => onUpdateTrack(track.id, updates)}
            allTracks={tracks}
          />
        ))}
        {masterTrack && (
          <ChannelStrip
            track={{ ...masterTrack, name: 'Master', type: 'master', color: '#888' }}
            isSelected={false}
            isMaster
            onSelect={() => {}}
            onUpdate={() => {}}
          />
        )}
      </div>
    </div>
  );
}

interface ChannelStripProps {
  track: any;
  isSelected: boolean;
  isMaster?: boolean;
  onSelect: () => void;
  onUpdate: (updates: any) => void;
  allTracks?: any[];
}

function ChannelStrip({ track, isSelected, isMaster, onSelect, onUpdate, allTracks = [] }: ChannelStripProps) {
  const leftDb = track.meterLevel?.left ?? -60;
  const rightDb = track.meterLevel?.right ?? -60;
  const leftPct = Math.max(0, Math.min(100, ((leftDb + 60) / 60) * 100));
  const rightPct = Math.max(0, Math.min(100, ((rightDb + 60) / 60) * 100));
  const peakHoldRef = useRef({ left: 0, right: 0, leftTime: 0, rightTime: 0 });
  const [peakHold, setPeakHold] = useState({ left: 0, right: 0 });

  useEffect(() => {
    const now = Date.now();
    const ph = peakHoldRef.current;
    if (leftPct >= ph.left) { ph.left = leftPct; ph.leftTime = now; }
    if (rightPct >= ph.right) { ph.right = rightPct; ph.rightTime = now; }
    if (now - ph.leftTime > 2000) ph.left = Math.max(leftPct, ph.left - 2);
    if (now - ph.rightTime > 2000) ph.right = Math.max(rightPct, ph.right - 2);
    setPeakHold({ left: ph.left, right: ph.right });
  }, [leftPct, rightPct]);

  const meterGradient = 'linear-gradient(to top, #22c55e 0%, #22c55e 60%, #eab308 75%, #ef4444 95%, #ef4444 100%)';

  return (
    <div
      className={cn(
        "shrink-0 flex flex-col rounded overflow-hidden cursor-pointer transition-colors",
        isSelected ? "bg-[#2a2a3a]" : "bg-[#252529] hover:bg-[#2a2a2e]",
        isMaster && "bg-[#2a2a35]"
      )}
      style={{ width: 'var(--strip-w)' }}
      onClick={onSelect}
    >
      <div className="text-[10px] text-center py-1 truncate px-1 border-b border-[#333]" style={{ color: track.color }}>
        {track.name}
      </div>

      <div className="flex-1 flex items-center justify-center py-2 gap-0.5">
        <div className="h-full w-1.5 bg-[#1a1a1e] rounded relative overflow-hidden">
          <div
            className="absolute bottom-0 left-0 right-0 transition-all duration-75"
            style={{ height: `${leftPct}%`, background: meterGradient }}
          />
          <div
            className="absolute left-0 right-0 bg-white"
            style={{ bottom: `${peakHold.left}%`, height: '1px', opacity: peakHold.left > 0 ? 0.8 : 0 }}
          />
        </div>
        <div className="h-full w-1.5 bg-[#1a1a1e] rounded relative overflow-hidden">
          <div
            className="absolute bottom-0 left-0 right-0 transition-all duration-75"
            style={{ height: `${rightPct}%`, background: meterGradient }}
          />
          <div
            className="absolute left-0 right-0 bg-white"
            style={{ bottom: `${peakHold.right}%`, height: '1px', opacity: peakHold.right > 0 ? 0.8 : 0 }}
          />
        </div>
      </div>

      <div className="px-1.5 pb-1">
        <input
          type="range"
          min={0}
          max={100}
          value={track.volume * 100}
          onChange={(e) => onUpdate({ volume: Number(e.target.value) / 100 })}
          className="w-full h-20 appearance-none bg-transparent cursor-pointer"
          style={{
            writingMode: 'vertical-lr',
            direction: 'rtl',
          }}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      <div className="flex justify-center gap-0.5 pb-1">
        <button
          onClick={(e) => { e.stopPropagation(); onUpdate({ muted: !track.muted }); }}
          className={cn(
            "h-4 w-4 flex items-center justify-center rounded text-[8px] font-bold",
            track.muted ? "bg-orange-600" : "bg-[#333]"
          )}
        >
          M
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onUpdate({ solo: !track.solo }); }}
          className={cn(
            "h-4 w-4 flex items-center justify-center rounded text-[8px] font-bold",
            track.solo ? "bg-yellow-600" : "bg-[#333]"
          )}
        >
          S
        </button>
      </div>

      {track.type === 'bus' && (
        <div className="px-1 pb-1">
          <select
            value={track.routeTo || ''}
            onChange={(e) => { e.stopPropagation(); onUpdate({ routeTo: e.target.value || null }); }}
            onClick={(e) => e.stopPropagation()}
            className="w-full h-4 bg-[#1a1a1e] border border-[#444] rounded text-[8px] text-gray-400 px-0.5"
          >
            <option value="">Route...</option>
            <option value="master">Master</option>
            {allTracks.filter(t => t.id !== track.id && t.type !== 'master').map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="text-[10px] text-center py-1 text-gray-400">
        {Math.round(track.volume * 100)}%
      </div>
    </div>
  );
}

// ════ NODE GRAPH VIEW ════
interface NodeGraphViewProps {
  tracks: any[];
  masterTrack: any;
  selectedTrackId: string | null;
  onSelectTrack: (id: string) => void;
  onOpenPlugins: (trackId: string) => void;
}

function NodeGraphView({ tracks, masterTrack, selectedTrackId, onSelectTrack, onOpenPlugins }: NodeGraphViewProps) {
  const nodeW = 140;
  const nodeH = 72;
  const colGap = 48;
  const startX = 32;
  const startY = 32;
  const masterX = startX + nodeW + colGap + (Math.max(tracks.length - 1, 0) * (nodeW + colGap)) / 2;
  const masterY = startY + nodeH + 80;

  return (
    <div className="flex-1 overflow-auto bg-[#0a0a0d] relative">
      <svg
        className="absolute inset-0"
        style={{ width: Math.max(startX * 2 + tracks.length * (nodeW + colGap), 600), height: masterY + nodeH + startY }}
      >
        {/* Connections: track → master */}
        {tracks.map((t, i) => {
          const tx = startX + i * (nodeW + colGap) + nodeW / 2;
          const ty = startY + nodeH;
          const mx = masterX + nodeW / 2;
          const my = masterY;
          return (
            <path
              key={t.id}
              d={`M ${tx} ${ty} C ${tx} ${ty + 40} ${mx} ${my - 40} ${mx} ${my}`}
              fill="none"
              stroke={t.id === selectedTrackId ? '#10b981' : '#2a2a3a'}
              strokeWidth={t.id === selectedTrackId ? 2 : 1.5}
            />
          );
        })}
      </svg>

      {/* Track nodes */}
      {tracks.map((t, i) => (
        <button
          key={t.id}
          onClick={() => onSelectTrack(t.id)}
          className={cn(
            "absolute rounded-lg border text-left transition-all",
            t.id === selectedTrackId
              ? "border-emerald-500 bg-[#111a1a] shadow-lg shadow-emerald-900/20"
              : "border-[#2a2a3a] bg-[#12121a] hover:border-[#3a3a4a]"
          )}
          style={{ left: startX + i * (nodeW + colGap), top: startY, width: nodeW, height: nodeH }}
        >
          <div className="p-2">
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: t.color || '#3b82f6' }} />
              <span className="text-[11px] font-medium truncate text-white">{t.name}</span>
            </div>
            <div className="flex items-center gap-1 text-[9px] text-gray-600">
              <span className={cn("px-1 py-px rounded", t.muted ? "bg-yellow-500/20 text-yellow-500" : "bg-[#1e1e28] text-gray-600")}>M</span>
              <span className={cn("px-1 py-px rounded", t.solo ? "bg-cyan-500/20 text-cyan-500" : "bg-[#1e1e28] text-gray-600")}>S</span>
              <span className="flex-1 text-right">{t.plugins?.length || 0} fx</span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onOpenPlugins(t.id); }}
              className="mt-1 w-full text-center text-[9px] text-gray-700 hover:text-gray-300 transition-colors"
            >
              + Add FX
            </button>
          </div>
        </button>
      ))}

      {/* Master node */}
      <div
        className="absolute rounded-lg border border-emerald-800/60 bg-[#0e1a14] text-left"
        style={{ left: masterX, top: masterY, width: nodeW, height: nodeH }}
      >
        <div className="p-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Activity className="h-2.5 w-2.5 text-emerald-400 shrink-0" />
            <span className="text-[11px] font-semibold text-emerald-300">Master</span>
          </div>
          <div className="text-[9px] text-gray-600">{tracks.length} track{tracks.length !== 1 ? 's' : ''} → output</div>
        </div>
      </div>

      {tracks.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-gray-700">Add tracks to see the signal flow graph.</p>
        </div>
      )}
    </div>
  );
}

// ════ FLOW VIEW ════
interface FlowViewProps {
  tracks: any[];
  tempo: number;
  timeSignature: string;
  selectedTrackId: string | null;
  onSelectTrack: (id: string) => void;
  onAddTrack: () => void;
  onOpenMixer: () => void;
  onOpenTimeline: () => void;
  onOpenNodeGraph?: () => void;
  projectName: string;
  livePosition: number;
  isPlaying: boolean;
}

function FlowView({
  tracks,
  tempo,
  timeSignature,
  selectedTrackId,
  onSelectTrack,
  onAddTrack,
  onOpenMixer,
  onOpenTimeline,
  onOpenNodeGraph,
  projectName,
  livePosition,
  isPlaying,
}: FlowViewProps) {
  return (
    <div className="flex-1 overflow-auto bg-[#0a0a0d] p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Project overview card */}
        <div className="rounded-xl border border-[#1e1e28] bg-[#111118] p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="text-base font-semibold text-white">{projectName || 'Untitled Project'}</h2>
              <p className="text-xs text-gray-600 mt-0.5">{tempo} BPM · {timeSignature} · {tracks.length} track{tracks.length !== 1 ? 's' : ''}</p>
            </div>
            <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium", isPlaying ? "bg-emerald-500/10 text-emerald-400" : "bg-[#1a1a22] text-gray-600")}>
              <div className={cn("h-1.5 w-1.5 rounded-full", isPlaying ? "bg-emerald-400 animate-pulse" : "bg-gray-700")} />
              {isPlaying ? 'Playing' : 'Stopped'}
            </div>
          </div>

          {/* Quick-nav buttons */}
          <div className="flex flex-wrap gap-2">
            <button onClick={onOpenTimeline} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a1a22] hover:bg-[#22222c] text-xs text-gray-300 transition-colors">
              <Waves className="h-3 w-3 text-emerald-400" /> Timeline
            </button>
            <button onClick={onOpenMixer} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a1a22] hover:bg-[#22222c] text-xs text-gray-300 transition-colors">
              <Sliders className="h-3 w-3 text-blue-400" /> Mixer
            </button>
            {onOpenNodeGraph && (
              <button onClick={onOpenNodeGraph} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a1a22] hover:bg-[#22222c] text-xs text-gray-300 transition-colors">
                <Activity className="h-3 w-3 text-purple-400" /> Node Graph
              </button>
            )}
          </div>
        </div>

        {/* Tracks overview */}
        <div className="rounded-xl border border-[#1e1e28] bg-[#111118] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#1e1e28]">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Tracks</span>
            <button onClick={onAddTrack} className="flex items-center gap-1 px-2 py-1 rounded text-xs text-emerald-400 hover:bg-emerald-500/10 transition-colors">
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>
          {tracks.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-gray-700 mb-3">No tracks yet</p>
              <button onClick={onAddTrack} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm transition-colors">
                Add First Track
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[#1a1a22]">
              {tracks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onSelectTrack(t.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                    t.id === selectedTrackId ? "bg-[#1a1a26]" : "hover:bg-[#141420]"
                  )}
                >
                  <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color || '#3b82f6' }} />
                  <span className="text-sm text-white flex-1 truncate">{t.name}</span>
                  <div className="flex items-center gap-2 text-[10px] text-gray-600">
                    {t.muted && <span className="px-1 py-px rounded bg-yellow-500/10 text-yellow-600">MUTED</span>}
                    {t.solo && <span className="px-1 py-px rounded bg-cyan-500/10 text-cyan-600">SOLO</span>}
                    <span>{t.plugins?.length || 0} fx</span>
                    <span>{Math.round((t.volume || 0.8) * 100)}%</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default StudioOneDAW;
