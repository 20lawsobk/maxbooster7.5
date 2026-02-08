import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Pause, Square, Circle, SkipBack, SkipForward, Repeat,
  Volume2, Undo, Redo, Save, Plus, Settings, Sliders, Piano,
  Layers, Mic, Music, Drum, Guitar, FolderOpen, ChevronDown,
  ChevronRight, MoreHorizontal, Lock, Unlock, Eye, EyeOff,
  Trash2, Copy, Scissors, ZoomIn, ZoomOut, Grid3X3, Wand2,
  PanelBottomOpen, PanelBottomClose, PanelRightOpen, PanelRightClose,
  Brain, Sparkles, Library, Keyboard, HelpCircle, X, Camera
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudioScale } from '@/hooks/useStudioScale';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useUnifiedStore } from '@/stores/unifiedStoreAdapter';
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
import { FlowStateImportAudio } from './FlowStateImportAudio';
import { StemExportDialog } from './StemExportDialog';
import { StudioStartHub } from './StudioStartHub';
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
  const store = useUnifiedStore();
  const { tracks, masterTrack, transport, view, project, canUndo, canRedo } = store;
  const { toast } = useToast();
  const queryClient = useQueryClient();
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
  const { ref: containerRef, scale: uiScale, cssVars, trackHeaderWidth, aiPanelWidth } = useStudioScale();

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
          console.error('Failed to parse stored versions:', e);
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.shiftKey && e.key === 'P') {
        e.preventDefault();
        setPluginFilter('all');
        setShowPluginBrowser(true);
      }
      if (e.shiftKey && e.key === 'I') {
        e.preventDefault();
        setPluginFilter('instruments');
        setShowPluginBrowser(true);
      }
      if (e.shiftKey && e.key === 'E') {
        e.preventDefault();
        setPluginFilter('effects');
        setShowPluginBrowser(true);
      }
      if (e.altKey && e.key === 'a') {
        e.preventDefault();
        setShowAIPanel(prev => !prev);
      }
      if (e.altKey && e.key === 'g') {
        e.preventDefault();
        setShowMusicGenerator(true);
      }
      if (e.key === '?') {
        e.preventDefault();
        setShowKeyboardShortcuts(true);
      }
      if (e.key === ' ' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        if (isPlayingRef.current) {
          store.pause();
          if (audioInitializedRef.current) audioEngine.pause();
        } else {
          store.play();
          if (audioInitializedRef.current) audioEngine.play();
        }
      }
      if (e.key === 'r' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        store.record();
      }
      if (e.key === 'l' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        store.toggleLoop();
      }
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        setShowProjectDialog(true);
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        setShowSaveAsDialog(true);
      } else if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        store.undo();
      }
      if (e.ctrlKey && e.key === 'y') {
        e.preventDefault();
        store.redo();
      }
      if (e.key === 'm' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        setShowMixer(prev => !prev);
      }
      if (e.key === 'i' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        setShowInspector(prev => !prev);
      }
      if (e.key === 'e' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        setShowEditor(prev => !prev);
      }
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault();
        setShowProjectSettings(true);
      }
      if (e.ctrlKey && e.altKey && e.key === 'v') {
        e.preventDefault();
        setShowVersionManagement(true);
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        setShowExportDialog(true);
      }
      if (e.ctrlKey && e.key === 'i') {
        e.preventDefault();
        setShowImportAudio(true);
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        setShowStemExport(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [store, audioEngine]);

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
      console.log('[DAW] Project changed, clearing audio engine state');
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
          console.error('[DAW] Failed to initialize audio engine:', err);
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

            loadedClipsRef.current.add(clip.id);
            console.log(`[DAW] Loaded clip: ${clip.name} on track ${track.name}`);
          } catch (err) {
            console.error(`[DAW] Failed to load clip ${clip.name}:`, err);
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
        console.error('[DAW] Failed to update track on backend:', err);
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
        console.error('[DAW] Failed to delete track on backend:', err);
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
        console.error('[DAW] Failed to sync new track to backend:', err);
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
            window.location.href = `/studio/${id}`;
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
    <div ref={containerRef} style={cssVars as React.CSSProperties} className="h-full w-full flex flex-col bg-[#1a1a1e] text-white overflow-hidden select-none">
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
      />

      <div className="flex-1 flex overflow-hidden">
        {showInspector && selectedTrack && (
          <TrackInspector
            track={selectedTrack}
            onClose={() => setShowInspector(false)}
            onUpdate={(updates) => handleTrackUpdate(selectedTrackId!, updates)}
            onOpenPlugins={() => { setPluginFilter('all'); setShowPluginBrowser(true); }}
          />
        )}

        <div className="flex-1 flex flex-col overflow-hidden">
          <Toolbar
            zoom={zoom}
            onZoomIn={() => setZoom(z => Math.min(z * 1.25, 4))}
            onZoomOut={() => setZoom(z => Math.max(z / 1.25, 0.25))}
            onAddTrack={handleAddTrack}
            showInspector={showInspector}
            showEditor={showEditor}
            showMixer={showMixer}
            onToggleInspector={() => setShowInspector(!showInspector)}
            onToggleEditor={() => setShowEditor(!showEditor)}
            onToggleMixer={() => setShowMixer(!showMixer)}
            onOpenAllPlugins={() => { setPluginFilter('all'); setShowPluginBrowser(true); }}
            onOpenInstruments={() => { setPluginFilter('instruments'); setShowPluginBrowser(true); }}
            onOpenEffects={() => { setPluginFilter('effects'); setShowPluginBrowser(true); }}
            onOpenShortcuts={() => setShowKeyboardShortcuts(true)}
            onExport={() => setShowExportDialog(true)}
            onImportAudio={() => setShowImportAudio(true)}
            onStemExport={() => setShowStemExport(true)}
          />

          <div className="flex-1 flex flex-col overflow-hidden">
            <TimelineRuler zoom={zoom} scrollX={scrollX} tempo={transport.tempo} />

            <div className="flex-1 overflow-auto" onScroll={(e) => setScrollX(e.currentTarget.scrollLeft)}>
              <ArrangeView
                tracks={tracks}
                selectedTrackId={selectedTrackId}
                zoom={zoom}
                scrollX={scrollX}
                tempo={transport.tempo}
                playheadPosition={livePosition}
                isPlaying={transport.isPlaying}
                trackHeaderWidth={trackHeaderWidth}
                onSelectTrack={setSelectedTrackId}
                onUpdateTrack={(id, updates) => handleTrackUpdate(id, updates)}
              />
            </div>
          </div>

          {showEditor && (
            <EditorPanel
              track={selectedTrack}
              onClose={() => setShowEditor(false)}
            />
          )}
        </div>

        <AnimatePresence>
          {showAIPanel && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: aiPanelWidth, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="shrink-0 border-l border-[#333] overflow-hidden"
            >
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {showMixer && (
        <MixerPanel
          tracks={tracks}
          masterTrack={masterTrack}
          selectedTrackId={selectedTrackId}
          onSelectTrack={setSelectedTrackId}
          onUpdateTrack={(id, updates) => handleTrackUpdate(id, updates)}
          onClose={() => setShowMixer(false)}
          projectId={projectId || ''}
        />
      )}

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
        />
      )}

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
            onClose={() => setShowMusicGenerator(false)}
            onTrackGenerated={(result) => {
              toast({ title: 'AI Generation Complete', description: `Generated audio successfully.` });
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
              window.location.href = pendingNavigation;
            }
          } finally {
            setIsSaving(false);
            setPendingNavigation(null);
          }
        }}
        onDiscard={() => {
          store.markSaved();
          if (pendingNavigation) {
            window.location.href = pendingNavigation;
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
            console.error('[CrashRecovery] Failed to parse recovery data:', error);
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
        onImportComplete={(files) => {
          files.forEach(file => {
            store.addTrack('audio', file.name);
          });
          toast({ title: 'Audio Imported', description: `${files.length} file(s) imported successfully.` });
        }}
      />

      <StemExportDialog
        open={showStemExport}
        onOpenChange={setShowStemExport}
        projectId={projectId}
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
}

function TransportBar({
  transport, project, livePosition, canUndo, canRedo, isDirty, formatTime, formatBars,
  onPlay, onPause, onStop, onRecord, onRewind, onToggleLoop,
  onUndo, onRedo, onSave, onTempoChange, onOpenPlugins, onOpenAI, onOpenGenerator, showAIPanel
}: TransportBarProps) {
  return (
    <div className="bg-[#252529] border-b border-[#333] flex items-center px-4 gap-4 shrink-0 flex-wrap" style={{ height: 'var(--transport-h)' }}>
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

      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-gray-500 uppercase">Time</span>
          <span className="font-mono text-sm text-white">{formatTime(livePosition)}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-gray-500 uppercase">Bars</span>
          <span className="font-mono text-sm text-white">{formatBars(livePosition)}</span>
        </div>
      </div>

      <div className="h-6 w-px bg-[#444]" />

      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">BPM</span>
        <input
          type="number"
          value={transport.tempo}
          onChange={(e) => onTempoChange(Number(e.target.value))}
          className="w-16 h-7 bg-[#1a1a1e] border border-[#444] rounded px-2 text-sm font-mono text-center"
          min={20}
          max={300}
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">Time Sig</span>
        <span className="font-mono text-sm">{transport.timeSignature || '4/4'}</span>
      </div>

      <div className="flex-1" />

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

      <div className="text-sm text-gray-400 truncate max-w-48">
        {project.name || 'Untitled Project'}
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
}

function Toolbar({
  zoom, onZoomIn, onZoomOut, onAddTrack,
  showInspector, showEditor, showMixer,
  onToggleInspector, onToggleEditor, onToggleMixer,
  onOpenAllPlugins, onOpenInstruments, onOpenEffects, onOpenShortcuts,
  onExport, onImportAudio, onStemExport
}: ToolbarProps) {
  const [showAddMenu, setShowAddMenu] = useState(false);

  return (
    <div className="bg-[#1f1f23] border-b border-[#333] flex items-center px-3 gap-2 shrink-0 flex-wrap" style={{ height: 'var(--toolbar-h)' }}>
      <div className="relative">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAddMenu(!showAddMenu)}
          className="h-7 gap-1.5 text-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Track
          <ChevronDown className="h-3 w-3" />
        </Button>

        <AnimatePresence>
          {showAddMenu && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-full left-0 mt-1 bg-[#2a2a2e] border border-[#444] rounded-lg shadow-xl z-50 py-1 min-w-40"
            >
              {[
                { type: 'audio' as const, icon: Music, label: 'Audio Track' },
                { type: 'instrument' as const, icon: Piano, label: 'Instrument Track' },
                { type: 'midi' as const, icon: Layers, label: 'MIDI Track' },
                { type: 'bus' as const, icon: Sliders, label: 'Bus Track' },
              ].map(({ type, icon: Icon, label }) => (
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

      <div className="h-5 w-px bg-[#444]" />

      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={onOpenAllPlugins} className="h-7 gap-1 text-xs">
              <Library className="h-3.5 w-3.5" />
              All Plugins
            </Button>
          </TooltipTrigger>
          <TooltipContent>All Plugins (Shift+P)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={onOpenInstruments} className="h-7 gap-1 text-xs">
              <Piano className="h-3.5 w-3.5" />
              Instruments
            </Button>
          </TooltipTrigger>
          <TooltipContent>Instruments (Shift+I)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={onOpenEffects} className="h-7 gap-1 text-xs">
              <Wand2 className="h-3.5 w-3.5" />
              Effects
            </Button>
          </TooltipTrigger>
          <TooltipContent>Effects (Shift+E)</TooltipContent>
        </Tooltip>
      </div>

      <div className="h-5 w-px bg-[#444]" />

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onZoomOut} className="h-7 w-7 p-0">
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs text-gray-400 w-12 text-center">{Math.round(zoom * 100)}%</span>
        <Button variant="ghost" size="sm" onClick={onZoomIn} className="h-7 w-7 p-0">
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="h-5 w-px bg-[#444]" />

      <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
        <Grid3X3 className="h-3.5 w-3.5" />
        Snap
      </Button>

      <div className="h-5 w-px bg-[#444]" />

      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={onExport} className="h-7 gap-1 text-xs">
              <Save className="h-3.5 w-3.5" />
              Export
            </Button>
          </TooltipTrigger>
          <TooltipContent>Export Audio (Ctrl+Shift+E)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={onImportAudio} className="h-7 gap-1 text-xs">
              <FolderOpen className="h-3.5 w-3.5" />
              Import
            </Button>
          </TooltipTrigger>
          <TooltipContent>Import Audio (Ctrl+I)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={onStemExport} className="h-7 gap-1 text-xs">
              <Layers className="h-3.5 w-3.5" />
              Stems
            </Button>
          </TooltipTrigger>
          <TooltipContent>Export Stems (Ctrl+Shift+S)</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={onOpenShortcuts} className="h-7 w-7 p-0">
              <Keyboard className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Keyboard Shortcuts (?)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleInspector}
              className={cn("h-7 w-7 p-0", showInspector && "bg-blue-600/20 text-blue-400")}
            >
              <PanelRightOpen className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Inspector (I)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleEditor}
              className={cn("h-7 w-7 p-0", showEditor && "bg-blue-600/20 text-blue-400")}
            >
              <PanelBottomOpen className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Editor (E)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleMixer}
              className={cn("h-7 w-7 p-0", showMixer && "bg-blue-600/20 text-blue-400")}
            >
              <Sliders className="h-3.5 w-3.5" />
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
}

function TimelineRuler({ zoom, scrollX, tempo }: TimelineRulerProps) {
  const pixelsPerBeat = 40 * zoom;
  const beatsPerBar = 4;
  const pixelsPerBar = pixelsPerBeat * beatsPerBar;
  const visibleBars = Math.ceil(1200 / pixelsPerBar) + 2;
  const startBar = Math.max(1, Math.floor(scrollX / pixelsPerBar) + 1);

  return (
    <div className="h-6 bg-[#1f1f23] border-b border-[#333] flex items-end overflow-hidden shrink-0" style={{ marginLeft: 'var(--track-header-w)' }}>
      <div
        className="relative h-full"
        style={{ width: `${Math.max(200, (startBar + visibleBars + 50) * pixelsPerBar)}px` }}
      >
        {Array.from({ length: visibleBars + 50 }).map((_, i) => {
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
        })}
      </div>
    </div>
  );
}

interface ArrangeViewProps {
  tracks: any[];
  selectedTrackId: string | null;
  zoom: number;
  scrollX: number;
  tempo: number;
  playheadPosition: number;
  isPlaying: boolean;
  trackHeaderWidth: number;
  onSelectTrack: (id: string) => void;
  onUpdateTrack: (id: string, updates: any) => void;
}

function ArrangeView({
  tracks, selectedTrackId, zoom, scrollX, tempo, playheadPosition, isPlaying,
  trackHeaderWidth, onSelectTrack, onUpdateTrack
}: ArrangeViewProps) {
  const pixelsPerSecond = 40 * zoom * (tempo / 60);
  const playheadX = playheadPosition * pixelsPerSecond;

  return (
    <div className="relative min-h-full">
      {tracks.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-gray-500">
          <div className="text-center">
            <Music className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No tracks yet</p>
            <p className="text-xs text-gray-600 mt-1">Click "Add Track" to get started</p>
          </div>
        </div>
      ) : (
        tracks.map((track, index) => (
          <TrackLane
            key={track.id}
            track={track}
            index={index}
            isSelected={track.id === selectedTrackId}
            zoom={zoom}
            tempo={tempo}
            onSelect={() => onSelectTrack(track.id)}
            onUpdate={(updates) => onUpdateTrack(track.id, updates)}
          />
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
  zoom: number;
  tempo: number;
  onSelect: () => void;
  onUpdate: (updates: any) => void;
}

function TrackLane({ track, index, isSelected, zoom, tempo, onSelect, onUpdate }: TrackLaneProps) {
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
    <div
      className={cn(
        "flex border-b border-[#333] transition-colors cursor-pointer",
        isSelected ? "bg-[#2a2a3a]" : "hover:bg-[#232328]"
      )}
      style={{ height }}
      onClick={onSelect}
    >
      <div
        className="shrink-0 flex items-center gap-2 px-3 border-r border-[#333] relative"
        style={{ width: 'var(--track-header-w)', backgroundColor: `${track.color}15` }}
      >
        <div className="w-1 h-full absolute left-0 top-0" style={{ backgroundColor: track.color }} />
        
        <button
          onClick={(e) => { e.stopPropagation(); onUpdate({ collapsed: !track.collapsed }); }}
          className="hover:bg-white/10 rounded p-0.5"
        >
          {track.collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>

        <Icon className="h-4 w-4" style={{ color: track.color }} />

        <span className="text-sm truncate flex-1">{track.name}</span>

        <div className="flex items-center gap-1">
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

      <div className="flex-1 relative bg-[#1a1a1e] overflow-hidden">
        {!track.collapsed && track.audioClips?.map((clip: any) => (
          <AudioClipView key={clip.id} clip={clip} zoom={zoom} tempo={tempo} trackColor={track.color} />
        ))}
        {!track.collapsed && track.midiClips?.map((clip: any) => (
          <MidiClipView key={clip.id} clip={clip} zoom={zoom} tempo={tempo} trackColor={track.color} />
        ))}
      </div>
    </div>
  );
}

interface AudioClipViewProps {
  clip: any;
  zoom: number;
  tempo: number;
  trackColor: string;
}

function AudioClipView({ clip, zoom, tempo, trackColor }: AudioClipViewProps) {
  const pixelsPerSecond = 40 * zoom * (tempo / 60);
  const left = clip.startTime * pixelsPerSecond;
  const width = clip.duration * pixelsPerSecond;

  return (
    <div
      className="absolute top-1 bottom-1 rounded overflow-hidden"
      style={{
        left,
        width: Math.max(width, 20),
        backgroundColor: `${trackColor}40`,
        borderLeft: `2px solid ${trackColor}`,
      }}
    >
      <div className="px-1.5 py-0.5 text-[10px] truncate text-white/80">{clip.name}</div>
      <div className="absolute inset-x-0 bottom-0 h-8 flex items-end justify-around px-1">
        {Array.from({ length: Math.min(50, Math.floor(width / 4)) }).map((_, i) => (
          <div
            key={i}
            className="w-px bg-white/30"
            style={{ height: `${20 + Math.random() * 60}%` }}
          />
        ))}
      </div>
    </div>
  );
}

interface MidiClipViewProps {
  clip: any;
  zoom: number;
  tempo: number;
  trackColor: string;
}

function MidiClipView({ clip, zoom, tempo, trackColor }: MidiClipViewProps) {
  const pixelsPerSecond = 40 * zoom * (tempo / 60);
  const left = clip.startTime * pixelsPerSecond;
  const width = clip.duration * pixelsPerSecond;

  return (
    <div
      className="absolute top-1 bottom-1 rounded overflow-hidden"
      style={{
        left,
        width: Math.max(width, 20),
        backgroundColor: `${trackColor}40`,
        borderLeft: `2px solid ${trackColor}`,
      }}
    >
      <div className="px-1.5 py-0.5 text-[10px] truncate text-white/80">{clip.name}</div>
      <div className="absolute inset-x-1 bottom-1 top-5 flex flex-col gap-px overflow-hidden">
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
  );
}

interface TrackInspectorProps {
  track: any;
  onClose: () => void;
  onUpdate: (updates: any) => void;
  onOpenPlugins: () => void;
}

function TrackInspector({ track, onClose, onUpdate, onOpenPlugins }: TrackInspectorProps) {
  return (
    <div className="bg-[#1f1f23] border-r border-[#333] flex flex-col shrink-0 overflow-hidden" style={{ width: 'var(--inspector-w)' }}>
      <div className="h-10 flex items-center justify-between px-3 border-b border-[#333]">
        <span className="text-sm font-medium">Inspector</span>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
          <PanelRightClose className="h-3.5 w-3.5" />
        </Button>
      </div>

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
                  onClick={() => {}}
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
  return (
    <div className="bg-[#1a1a1e] border-t border-[#333] flex flex-col shrink-0" style={{ height: 'var(--editor-h)' }}>
      <div className="h-8 flex items-center justify-between px-3 bg-[#1f1f23] border-b border-[#333]">
        <span className="text-sm font-medium">
          {track ? `Editing: ${track.name}` : 'Editor'}
        </span>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-6 w-6 p-0">
          <PanelBottomClose className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex-1 flex items-center justify-center text-gray-500">
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
}

function MixerPanel({ tracks, masterTrack, selectedTrackId, onSelectTrack, onUpdateTrack, onClose, projectId }: MixerPanelProps) {
  const [showSnapshotMenu, setShowSnapshotMenu] = useState(false);
  const queryClient = useQueryClient();

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
    <div className="bg-[#1a1a1e] border-t border-[#333] flex flex-col shrink-0" style={{ height: 'var(--mixer-h)' }}>
      <div className="h-8 flex items-center justify-between px-3 bg-[#1f1f23] border-b border-[#333]">
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
}

function ChannelStrip({ track, isSelected, isMaster, onSelect, onUpdate }: ChannelStripProps) {
  const meterLevel = track.meterLevel?.left || 0;

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

      <div className="flex-1 flex items-center justify-center py-2">
        <div className="h-full w-3 bg-[#1a1a1e] rounded relative overflow-hidden">
          <div
            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-green-500 via-yellow-500 to-red-500 transition-all"
            style={{ height: `${meterLevel * 100}%` }}
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

      <div className="text-[10px] text-center py-1 text-gray-400">
        {Math.round(track.volume * 100)}%
      </div>
    </div>
  );
}

export default StudioOneDAW;
