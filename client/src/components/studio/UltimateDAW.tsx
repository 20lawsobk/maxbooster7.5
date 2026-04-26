import { useState, useCallback, useMemo, useEffect, useRef, DragEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Pause, Square, Circle, SkipBack, SkipForward, Repeat,
  Volume2, Settings, Wand2, Sparkles, Brain, Layers, Music, Mic,
  Scissors, Undo, Redo, Save, Download, Grid3X3, Zap, Clock,
  ChevronRight, PanelRightOpen, PanelRightClose, Box, Sliders,
  Activity, Target, Gauge, Palette, Radio, Keyboard, MousePointer,
  Move, Pencil, Eraser, Plus, HelpCircle, Library, Eye, EyeOff,
  Maximize2, Minimize2, SplitSquareVertical, Waves, ListMusic,
  Piano, Drum, Guitar, Terminal, Network, LayoutGrid, Type
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useUnifiedStore } from '@/stores/unifiedStoreAdapter';
import { FlowState3DWorkspace } from './FlowState3DWorkspace';
import { FlowStateAIPanel } from './FlowStateAIPanel';
import { FlowStateSmartToolbar } from './FlowStateSmartToolbar';
import { FlowStateMixer } from './FlowStateMixer';
import { FlowStateSpectralVisualizer } from './FlowStateSpectralVisualizer';
import { FlowStatePluginChain } from './FlowStatePluginChain';
import { FlowStateTimeline, FlowStatePlayhead } from './FlowStateTimeline';
import { FlowStateAddTrack, AddTrackButton } from './FlowStateAddTrack';
import { FlowStateKeyboardShortcuts } from './FlowStateKeyboardShortcuts';
import { FlowStatePluginBrowser } from './FlowStatePluginBrowser';
import { FlowStateInstrumentDialog } from './FlowStateInstrumentDialog';
import { PluginControlDialog } from './PluginControlDialog';
import { PluginBrowser } from './PluginBrowser';
import { AIMusicGenerator } from './AIMusicGenerator';
import { LyricDisplay, type LyricLine } from './LyricDisplay';
import { ProjectSelector } from './ProjectSelector';
import { WaveformClip } from './WaveformClip';
import type { FlowStateMode } from '@/hooks/useFlowStateAdapter';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useProjectSync } from '@/hooks/useProjectSync';
import { useDAWAudioPlayback } from '@/hooks/useDAWAudioPlayback';
import './FlowStateTheme.css';

type WorkspaceView = 'arrange' | 'mixer' | 'edit' | 'spatial' | 'launcher';

interface UltimateDAWProps {
  projectId: string | null;
  projectName?: string;
  onSave?: () => void;
  onExport?: () => void;
}

const MODE_CONFIG: Record<FlowStateMode, { label: string; icon: typeof Music; color: string }> = {
  create: { label: 'Create', icon: Sparkles, color: 'from-purple-500 to-pink-500' },
  record: { label: 'Record', icon: Mic, color: 'from-red-500 to-orange-500' },
  mix: { label: 'Mix', icon: Sliders, color: 'from-blue-500 to-cyan-500' },
  master: { label: 'Master', icon: Gauge, color: 'from-amber-500 to-yellow-500' },
  perform: { label: 'Perform', icon: Radio, color: 'from-green-500 to-emerald-500' },
};

const WORKSPACE_VIEWS: { id: WorkspaceView; icon: typeof LayoutGrid; label: string }[] = [
  { id: 'arrange', icon: LayoutGrid, label: 'Arrange' },
  { id: 'mixer', icon: Sliders, label: 'Mixer' },
  { id: 'edit', icon: Piano, label: 'Edit' },
  { id: 'spatial', icon: Box, label: '3D Spatial' },
  { id: 'launcher', icon: Grid3X3, label: 'Launcher' },
];

const EDIT_TOOLS = [
  { id: 'pointer', icon: MousePointer, label: 'Select (V)' },
  { id: 'range', icon: Move, label: 'Range (R)' },
  { id: 'draw', icon: Pencil, label: 'Draw (D)' },
  { id: 'split', icon: Scissors, label: 'Split (S)' },
  { id: 'erase', icon: Eraser, label: 'Erase (E)' },
];

function ArrangeBarRuler({
  zoom,
  tempo,
  timeSignature,
  currentTime,
  isPlaying,
  totalBars,
}: {
  zoom: number;
  tempo: number;
  timeSignature: string;
  currentTime: number;
  isPlaying: boolean;
  totalBars: number;
}) {
  const beatsPerBar = parseInt(timeSignature.split('/')[0]) || 4;
  const secondsPerBeat = 60 / tempo;
  const secondsPerBar = secondsPerBeat * beatsPerBar;
  const pixelsPerSecond = 50 * zoom;
  const totalWidth = totalBars * secondsPerBar * pixelsPerSecond;

  const gridLines = useMemo(() => {
    const lines: { position: number; label?: string; type: 'bar' | 'beat' }[] = [];
    for (let bar = 0; bar < totalBars; bar++) {
      const barTime = bar * secondsPerBar;
      lines.push({ position: barTime * pixelsPerSecond, label: String(bar + 1), type: 'bar' });
      if (zoom >= 0.5) {
        for (let beat = 1; beat < beatsPerBar; beat++) {
          lines.push({
            position: (barTime + beat * secondsPerBeat) * pixelsPerSecond,
            type: 'beat',
          });
        }
      }
    }
    return lines;
  }, [zoom, tempo, timeSignature, beatsPerBar, secondsPerBar, secondsPerBeat, pixelsPerSecond, totalBars]);

  const playheadX = currentTime * pixelsPerSecond;

  return (
    <div className="sticky top-0 z-20 flex h-6 bg-zinc-900/95 border-b border-zinc-700/60 select-none backdrop-blur-sm" style={{ minWidth: 'max-content' }}>
      <div className="w-48 flex-shrink-0 border-r border-zinc-700/60 bg-zinc-900/95 flex items-center px-2">
        <span className="text-[9px] text-zinc-500 tracking-widest font-semibold uppercase">Bars</span>
      </div>
      <div className="relative flex-shrink-0" style={{ width: totalWidth, height: 24 }}>
        {gridLines.map((line, i) => (
          <div
            key={i}
            className={cn(
              'absolute top-0 bottom-0',
              line.type === 'bar' ? 'border-l border-zinc-600/60' : 'border-l border-zinc-700/40'
            )}
            style={{ left: line.position }}
          >
            {line.label && (
              <span className="absolute top-0.5 left-1 text-[10px] text-zinc-400 font-medium leading-none">
                {line.label}
              </span>
            )}
          </div>
        ))}
        <motion.div
          className="absolute top-0 bottom-0 w-px bg-rose-500 z-10 pointer-events-none"
          style={{ left: playheadX }}
          animate={isPlaying ? { opacity: [1, 0.6, 1] } : { opacity: 1 }}
          transition={{ duration: 0.5, repeat: Infinity }}
        />
      </div>
    </div>
  );
}

export function UltimateDAW({ projectId, projectName = 'Untitled', onSave, onExport }: UltimateDAWProps) {
  const store = useUnifiedStore();
  const { tracks, masterTrack, transport, view, project, canUndo, canRedo } = store;
  
  const { toast } = useToast();
  const { forceSave, invalidateProjectQueries, loadProjectData } = useProjectSync(projectId);
  const [mode, setMode] = useState<FlowStateMode>('create');
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const projectLoadedRef = useRef<string | null>(null);
  const playbackRafRef = useRef<number | null>(null);
  const playbackStartTimeRef = useRef<number>(0);
  const playbackStartPositionRef = useRef<number>(0);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('arrange');
  const [activeTool, setActiveTool] = useState('pointer');
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [showPluginBrowser, setShowPluginBrowser] = useState(false);
  const [showMixer, setShowMixer] = useState(true);
  const [showSpectral, setShowSpectral] = useState(false);
  const [showAddTrack, setShowAddTrack] = useState(false);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [showMusicGenerator, setShowMusicGenerator] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [isAIMixing, setIsAIMixing] = useState(false);
  const [isAIMastering, setIsAIMastering] = useState(false);
  const [musicalKey, setMusicalKey] = useState('C');
  const [scale, setScale] = useState('minor');
  const [dragOverTrackId, setDragOverTrackId] = useState<string | null>(null);
  const [uploadingTrackId, setUploadingTrackId] = useState<string | null>(null);

  const { unlockAudio } = useDAWAudioPlayback({ tracks, transport });
  const [lyrics, setLyrics] = useState<LyricLine[]>([
    { id: 'intro-1', text: 'Click Edit to add your lyrics...', startTime: 0, endTime: 4, type: 'intro' },
  ]);

  useEffect(() => {
    if (projectId && projectId !== projectLoadedRef.current) {
      projectLoadedRef.current = projectId;
      setIsLoadingProject(true);
      loadProjectData().finally(() => {
        setIsLoadingProject(false);
      });
    }
  }, [projectId, loadProjectData]);

  useEffect(() => {
    if (transport.isPlaying) {
      playbackStartTimeRef.current = performance.now();
      playbackStartPositionRef.current = transport.position;

      const tick = () => {
        const elapsedSec = (performance.now() - playbackStartTimeRef.current) / 1000;
        store.setPosition(playbackStartPositionRef.current + elapsedSec);
        playbackRafRef.current = requestAnimationFrame(tick);
      };
      playbackRafRef.current = requestAnimationFrame(tick);
    } else {
      if (playbackRafRef.current !== null) {
        cancelAnimationFrame(playbackRafRef.current);
        playbackRafRef.current = null;
      }
    }
    return () => {
      if (playbackRafRef.current !== null) {
        cancelAnimationFrame(playbackRafRef.current);
        playbackRafRef.current = null;
      }
    };
  }, [transport.isPlaying]);

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
        scale: params?.scale || scale,
      });
      const response = await res.json();
      if (response.audioFilePath) {
        toast({ title: 'Melody Generated', description: 'New melody track has been created.' });
      }
    } catch (error: any) {
      toast({ title: 'Generation Failed', description: error.message, variant: 'destructive' });
    }
  }, [projectId, transport.tempo, musicalKey, scale, toast]);

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
        scale: params?.scale || scale,
      });
      const response = await res.json();
      if (response.audioFilePath) {
        toast({ title: 'Bass Generated', description: 'New bass line has been created.' });
      }
    } catch (error: any) {
      toast({ title: 'Generation Failed', description: error.message, variant: 'destructive' });
    }
  }, [projectId, transport.tempo, musicalKey, scale, toast]);

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

  const handleAnalyzeAudio = useCallback(async () => {
    return {
      key: 'C',
      scale: 'minor',
      tempo: transport.tempo,
      timeSignature: transport.timeSignature,
      energy: 0.75,
      danceability: 0.8,
      valence: 0.6,
      chords: [
        { chord: 'Cm', time: 0 },
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
  }, [transport.tempo, transport.timeSignature]);

  const handleAudioFileDrop = useCallback(async (trackId: string, file: File, dropXPx: number) => {
    if (!file.type.startsWith('audio/')) {
      toast({ title: 'Unsupported file', description: 'Please drop an audio file.', variant: 'destructive' });
      return;
    }
    setUploadingTrackId(trackId);
    try {
      const formData = new FormData();
      formData.append('audio', file);
      if (projectId) formData.append('projectId', projectId);
      let sourceUrl: string;
      try {
        const res = await fetch('/api/studio/record/upload', { method: 'POST', body: formData });
        if (res.ok) {
          const json = await res.json();
          sourceUrl = json.url || json.audioUrl || '';
        } else {
          sourceUrl = '';
        }
      } catch {
        sourceUrl = '';
      }
      if (!sourceUrl) {
        sourceUrl = URL.createObjectURL(file);
      }
      const pixelsPerSecond = 50 * zoom;
      const startTime = Math.max(0, dropXPx / pixelsPerSecond);

      let duration = 30;
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const tempCtx = new AudioCtx();
        const arrayBuf = await file.arrayBuffer();
        const decoded = await tempCtx.decodeAudioData(arrayBuf);
        duration = decoded.duration;
        tempCtx.close();
      } catch {
        try {
          const blobUrl = URL.createObjectURL(file);
          duration = await new Promise<number>((resolve) => {
            const audio = new Audio(blobUrl);
            audio.addEventListener('loadedmetadata', () => {
              URL.revokeObjectURL(blobUrl);
              resolve(isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 30);
            }, { once: true });
            audio.addEventListener('error', () => { URL.revokeObjectURL(blobUrl); resolve(30); }, { once: true });
            setTimeout(() => resolve(30), 8000);
          });
        } catch {
          duration = 30;
        }
      }

      store.addAudioClip(trackId, {
        trackId,
        name: file.name.replace(/\.[^.]+$/, ''),
        startTime,
        duration,
        sourceUrl,
        offset: 0,
        gain: 1,
        fadeIn: 0,
        fadeOut: 0,
        color: tracks.find(t => t.id === trackId)?.color || '#4ade80',
        muted: false,
        locked: false,
      });
      toast({ title: 'Audio added', description: `"${file.name}" placed on track.` });
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setUploadingTrackId(null);
    }
  }, [projectId, zoom, tracks, store, toast]);

  const handleTrackDragOver = useCallback((e: DragEvent<HTMLDivElement>, trackId: string) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      setDragOverTrackId(trackId);
    }
  }, []);

  const handleTrackDragLeave = useCallback(() => {
    setDragOverTrackId(null);
  }, []);

  const handleTrackDrop = useCallback((e: DragEvent<HTMLDivElement>, trackId: string, trackRect: DOMRect) => {
    e.preventDefault();
    setDragOverTrackId(null);
    const file = e.dataTransfer.files[0];
    if (file) {
      const dropX = e.clientX - trackRect.left;
      handleAudioFileDrop(trackId, file, dropX);
    }
  }, [handleAudioFileDrop]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          unlockAudio();
          if (transport.isPlaying) store.pause(); else store.play();
          break;
        case 'KeyR':
          if (!e.metaKey && !e.ctrlKey) store.record();
          break;
        case 'KeyL':
          store.toggleLoop();
          break;
        case 'Home':
          store.setPosition(0);
          break;
        case 'Tab':
          e.preventDefault();
          setChromeVisible(prev => !prev);
          break;
        case 'Digit1': setMode('create'); break;
        case 'Digit2': setMode('record'); break;
        case 'Digit3': setMode('mix'); break;
        case 'Digit4': setMode('master'); break;
        case 'Digit5': setMode('perform'); break;
        case 'KeyV': setActiveTool('pointer'); break;
        case 'KeyD': setActiveTool('draw'); break;
        case 'KeyE': setActiveTool('erase'); break;
        case 'KeyZ':
          if ((e.metaKey || e.ctrlKey) && e.shiftKey) {
            e.preventDefault();
            store.redo();
          } else if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            store.undo();
          }
          break;
        case 'KeyS':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            forceSave().then(() => {
              toast({ title: 'Saved', description: 'Project synced successfully.' });
              onSave?.();
            }).catch(() => {
              toast({ title: 'Save failed', description: 'Could not sync project. Try again.', variant: 'destructive' });
            });
          }
          break;
        case 'Slash':
          if (e.shiftKey) setShowKeyboardShortcuts(prev => !prev);
          break;
        case 'KeyP':
          if (e.shiftKey) setShowPluginBrowser(prev => !prev);
          break;
        case 'KeyN':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            setShowAddTrack(true);
          }
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [transport.isPlaying, store, onSave, forceSave, toast]);
  
  const formatTime = useCallback((seconds: number) => {
    const bars = Math.floor(seconds * transport.tempo / 240) + 1;
    const beats = Math.floor((seconds * transport.tempo / 60) % 4) + 1;
    const ticks = Math.floor(((seconds * transport.tempo / 60) % 1) * 960);
    return `${bars}.${beats}.${ticks.toString().padStart(3, '0')}`;
  }, [transport.tempo]);
  
  const currentModeConfig = MODE_CONFIG[mode];
  
  return (
    <div className="ultimate-daw h-screen flex flex-col bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 text-white overflow-hidden">
      <AnimatePresence>
        {chromeVisible && (
          <motion.header
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            className="flex-shrink-0 h-14 border-b border-zinc-800/50 bg-zinc-900/80 backdrop-blur-xl flex items-center px-4 gap-4"
          >
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${currentModeConfig.color} flex items-center justify-center`}>
                <currentModeConfig.icon className="w-4 h-4 text-white" />
              </div>
              <ProjectSelector currentProjectId={projectId} />
              <span className="text-xs text-zinc-500 px-2 py-1 bg-zinc-800 rounded">{currentModeConfig.label} Mode</span>
            </div>
            
            <div className="flex items-center gap-1 ml-4">
              {Object.entries(MODE_CONFIG).map(([key, config]) => (
                <Tooltip key={key}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setMode(key as FlowStateMode)}
                      className={cn(
                        'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                        mode === key
                          ? `bg-gradient-to-r ${config.color} text-white shadow-lg`
                          : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                      )}
                    >
                      {config.label}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Press {Object.keys(MODE_CONFIG).indexOf(key) + 1}</TooltipContent>
                </Tooltip>
              ))}
            </div>
            
            <div className="flex-1" />
            
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => store.undo()}
                disabled={!canUndo}
                className="text-zinc-400 hover:text-white"
              >
                <Undo className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => store.redo()}
                disabled={!canRedo}
                className="text-zinc-400 hover:text-white"
              >
                <Redo className="w-4 h-4" />
              </Button>
              <div className="w-px h-6 bg-zinc-700" />
              <Button variant="ghost" size="sm" onClick={() => forceSave().then(() => { toast({ title: 'Saved' }); onSave?.(); }).catch(() => { toast({ title: 'Save failed', variant: 'destructive' }); })} className="text-zinc-400 hover:text-white">
                <Save className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={onExport} className="text-zinc-400 hover:text-white">
                <Download className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="flex items-center gap-1 ml-4">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAIPanel(prev => !prev)}
                    className={cn('text-zinc-400 hover:text-white', showAIPanel && 'text-purple-400')}
                  >
                    <Brain className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>AI Co-Producer</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowMusicGenerator(prev => !prev)}
                    className={cn('text-zinc-400 hover:text-white', showMusicGenerator && 'text-pink-400')}
                  >
                    <Wand2 className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>AI Music Generator</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowLyrics(prev => !prev)}
                    className={cn('text-zinc-400 hover:text-white', showLyrics && 'text-amber-400')}
                  >
                    <Type className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Lyric Display</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPluginBrowser(prev => !prev)}
                    className={cn('text-zinc-400 hover:text-white', showPluginBrowser && 'text-blue-400')}
                  >
                    <Library className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Plugin Browser (Shift+P)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSpectral(prev => !prev)}
                    className={cn('text-zinc-400 hover:text-white', showSpectral && 'text-cyan-400')}
                  >
                    <Activity className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Spectral Analyzer</TooltipContent>
              </Tooltip>
            </div>
          </motion.header>
        )}
      </AnimatePresence>
      
      <AnimatePresence>
        {chromeVisible && (
          <motion.div
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            className="flex-shrink-0 h-12 border-b border-zinc-800/50 bg-zinc-900/60 backdrop-blur flex items-center justify-center px-4 gap-4"
          >
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => store.setPosition(0)}
                className="text-zinc-400 hover:text-white h-8 w-8"
              >
                <SkipBack className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => store.stop()}
                className="text-zinc-400 hover:text-white h-8 w-8"
              >
                <Square className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                onClick={() => { unlockAudio(); if (transport.isPlaying) store.pause(); else store.play(); }}
                className={cn(
                  'h-10 w-10 rounded-full',
                  transport.isPlaying 
                    ? 'bg-green-600 hover:bg-green-700' 
                    : 'bg-zinc-700 hover:bg-zinc-600'
                )}
              >
                {transport.isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => store.record()}
                className={cn(
                  'h-8 w-8',
                  transport.isRecording ? 'text-red-500 animate-pulse' : 'text-zinc-400 hover:text-red-500'
                )}
              >
                <Circle className="w-4 h-4" fill={transport.isRecording ? 'currentColor' : 'none'} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => store.toggleLoop()}
                className={cn('h-8 w-8', transport.isLooping ? 'text-blue-400' : 'text-zinc-400 hover:text-white')}
              >
                <Repeat className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="flex items-center gap-4 px-4 py-1 bg-zinc-800/50 rounded-lg">
              <div className="text-center">
                <div className="text-lg font-mono font-bold tracking-wider">
                  {formatTime(transport.position)}
                </div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Position</div>
              </div>
              <div className="w-px h-8 bg-zinc-700" />
              <div className="text-center">
                <div className="text-lg font-mono font-bold">{transport.tempo}</div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider">BPM</div>
              </div>
              <div className="w-px h-8 bg-zinc-700" />
              <div className="text-center">
                <div className="text-lg font-mono font-bold">{transport.timeSignature}</div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Time Sig</div>
              </div>
            </div>
            
            <div className="flex items-center gap-1 bg-zinc-800/50 rounded-lg p-1">
              {EDIT_TOOLS.map(tool => (
                <Tooltip key={tool.id}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setActiveTool(tool.id)}
                      className={cn(
                        'p-2 rounded transition-all',
                        activeTool === tool.id
                          ? 'bg-zinc-700 text-white'
                          : 'text-zinc-500 hover:text-white hover:bg-zinc-700/50'
                      )}
                    >
                      <tool.icon className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{tool.label}</TooltipContent>
                </Tooltip>
              ))}
            </div>
            
            <div className="flex-1" />
            
            <div className="flex items-center gap-1 bg-zinc-800/50 rounded-lg p-1">
              {WORKSPACE_VIEWS.map(view => (
                <Tooltip key={view.id}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setWorkspaceView(view.id)}
                      className={cn(
                        'px-3 py-1.5 rounded flex items-center gap-2 text-sm transition-all',
                        workspaceView === view.id
                          ? 'bg-zinc-700 text-white'
                          : 'text-zinc-500 hover:text-white hover:bg-zinc-700/50'
                      )}
                    >
                      <view.icon className="w-4 h-4" />
                      {view.label}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{view.label} View</TooltipContent>
                </Tooltip>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      <div className="flex-1 flex overflow-hidden">
        <AnimatePresence>
          {showAIPanel && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="flex-shrink-0 border-r border-zinc-800/50 bg-zinc-900/50 overflow-hidden"
            >
              <FlowStateAIPanel
                projectId={projectId}
                mode={mode}
                tracks={(tracks || []).map(t => ({ id: t.id, name: t.name, type: t.type }))}
                currentTime={transport.position}
                tempo={transport.tempo}
                musicalKey={musicalKey}
                scale={scale}
                onAIMix={handleAIMix}
                onAIMaster={handleAIMaster}
                onAIGenerate={() => setShowMusicGenerator(true)}
                onGenerateMelody={handleGenerateMelody}
                onGenerateDrums={handleGenerateDrums}
                onGeneratePercussion={handleGeneratePercussion}
                onGenerateBass={handleGenerateBass}
                onAnalyzeAudio={handleAnalyzeAudio}
                onClose={() => setShowAIPanel(false)}
                isAIMixing={isAIMixing}
                isAIMastering={isAIMastering}
              />
            </motion.aside>
          )}
        </AnimatePresence>
        
        <AnimatePresence>
          {showMusicGenerator && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 400, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="flex-shrink-0 border-r border-zinc-800/50 bg-zinc-900/50 overflow-hidden"
            >
              <AIMusicGenerator
                projectId={projectId}
                onTrackGenerated={(track) => {
                  const trackName = track.name || 'AI Generated Track';
                  const trackType = track.type || 'audio';
                  const newTrackId = store.addTrack(trackType as any, trackName);
                  if (track.audioFilePath && newTrackId) {
                    store.addAudioClip(newTrackId, {
                      trackId: newTrackId,
                      startTime: 0,
                      duration: track.duration || 30,
                      sourceUrl: track.audioFilePath,
                      name: trackName,
                      offset: 0,
                      gain: 1,
                      fadeIn: 0,
                      fadeOut: 0,
                      color: track.color || '#8B5CF6',
                      muted: false,
                      locked: false,
                    });
                  }
                  toast({ title: 'Track Added', description: `"${trackName}" added to project.` });
                }}
                onClose={() => setShowMusicGenerator(false)}
              />
            </motion.aside>
          )}
        </AnimatePresence>
        
        <main className="flex-1 flex flex-col overflow-hidden">
          {workspaceView === 'arrange' && (
            <div className="flex-1 flex flex-col">
              <div className="flex-shrink-0 h-8 bg-zinc-900/80 border-b border-zinc-800/50 flex items-center px-2 gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500">Zoom:</span>
                  <input
                    type="range"
                    min="0.25"
                    max="4"
                    step="0.25"
                    value={zoom}
                    onChange={(e) => {
                      const newZoom = parseFloat(e.target.value);
                      setZoom(newZoom);
                      store.setZoom(newZoom);
                    }}
                    className="w-24 h-1 bg-zinc-700 rounded appearance-none cursor-pointer"
                  />
                  <span className="text-xs text-zinc-400 w-12">{Math.round(zoom * 100)}%</span>
                </div>
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAddTrack(true)}
                  className="h-6 text-xs"
                >
                  <Plus className="w-3 h-3 mr-1" /> Add Track
                </Button>
              </div>
              
              <div className="flex-1 overflow-auto bg-zinc-950/50">
                {/* Sticky bar/beat ruler that scrolls with tracks */}
                <ArrangeBarRuler
                  zoom={zoom}
                  tempo={transport.tempo}
                  timeSignature={transport.timeSignature}
                  currentTime={transport.position}
                  isPlaying={transport.isPlaying}
                  totalBars={(() => {
                    const bpb = parseInt(transport.timeSignature.split('/')[0]) || 4;
                    const spb = (60 / transport.tempo) * bpb;
                    let maxSec = 120;
                    for (const t of (tracks || [])) {
                      for (const c of (t.audioClips || [])) {
                        maxSec = Math.max(maxSec, c.startTime + c.duration);
                      }
                    }
                    return Math.max(64, Math.ceil(maxSec / spb) + 8);
                  })()}
                />
                {tracks.length === 0 ? (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center space-y-4">
                      <div className="w-16 h-16 mx-auto rounded-full bg-zinc-800 flex items-center justify-center">
                        <Music className="w-8 h-8 text-zinc-600" />
                      </div>
                      <div>
                        <h3 className="text-lg font-medium text-zinc-300">No tracks yet</h3>
                        <p className="text-sm text-zinc-500">Add your first track to get started</p>
                      </div>
                      <Button onClick={() => setShowAddTrack(true)} className="gap-2">
                        <Plus className="w-4 h-4" /> Add Track
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="min-h-full">
                    {tracks.map((track, index) => (
                      <div
                        key={track.id}
                        onClick={() => setSelectedTrackId(track.id)}
                        className={cn(
                          'h-20 border-b border-zinc-800/30 flex cursor-pointer transition-colors',
                          selectedTrackId === track.id ? 'bg-zinc-800/30' : 'hover:bg-zinc-800/20'
                        )}
                      >
                        <div className="w-48 flex-shrink-0 border-r border-zinc-800/50 p-2 flex items-center gap-2">
                          <div
                            className="w-3 h-full rounded-sm"
                            style={{ backgroundColor: track.color }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{track.name}</div>
                            <div className="text-xs text-zinc-500 capitalize">{track.type}</div>
                          </div>
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); store.toggleTrackMute(track.id); }}
                              className={cn(
                                'w-6 h-5 text-[10px] font-bold rounded',
                                track.muted ? 'bg-amber-600 text-white' : 'bg-zinc-700 text-zinc-400'
                              )}
                            >
                              M
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); store.toggleTrackSolo(track.id); }}
                              className={cn(
                                'w-6 h-5 text-[10px] font-bold rounded',
                                track.solo ? 'bg-amber-400 text-black' : 'bg-zinc-700 text-zinc-400'
                              )}
                            >
                              S
                            </button>
                          </div>
                        </div>
                        <div
                          className={cn(
                            'flex-1 relative bg-zinc-900/30 transition-colors',
                            dragOverTrackId === track.id && 'bg-zinc-700/40 ring-2 ring-inset ring-emerald-500/50',
                          )}
                          onDragOver={(e) => handleTrackDragOver(e, track.id)}
                          onDragLeave={handleTrackDragLeave}
                          onDrop={(e) => handleTrackDrop(e, track.id, e.currentTarget.getBoundingClientRect())}
                        >
                          {dragOverTrackId === track.id && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                              <span className="text-xs text-emerald-400 bg-zinc-900/80 px-2 py-1 rounded">
                                Drop audio here
                              </span>
                            </div>
                          )}
                          {uploadingTrackId === track.id && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                              <span className="text-xs text-zinc-400 bg-zinc-900/80 px-2 py-1 rounded animate-pulse">
                                Loading…
                              </span>
                            </div>
                          )}
                          {track.audioClips.map(clip => (
                            <div
                              key={clip.id}
                              className="absolute top-1 bottom-1"
                              style={{
                                left: `${clip.startTime * 50 * zoom}px`,
                                width: `${Math.max(clip.duration * 50 * zoom, 20)}px`,
                              }}
                            >
                              <WaveformClip
                                audioUrl={clip.sourceUrl}
                                duration={clip.duration}
                                startTime={clip.startTime}
                                width={Math.max(clip.duration * 50 * zoom, 20)}
                                height={64}
                                color={clip.color || track.color}
                                selected={false}
                                muted={clip.muted || track.muted}
                                clipName={clip.name}
                                zoom={zoom}
                                bpm={transport.tempo}
                                timeSignature={transport.timeSignature}
                                showGridLines={true}
                                pixelsPerSecond={50}
                                consolidatedWaveform={true}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          
          {workspaceView === 'mixer' && (
            <div className="flex-1">
              <FlowStateMixer 
                projectId={projectId}
                tracks={(tracks || []).map(t => ({
                  id: t.id,
                  name: t.name,
                  color: t.color,
                  volume: t.volume ?? 0.8,
                  pan: t.pan ?? 0,
                  mute: t.muted ?? false,
                  solo: t.solo ?? false,
                  armed: t.armed ?? false,
                  meterLevel: [Math.random() * 0.8, Math.random() * 0.8] as [number, number],
                }))}
                onVolumeChange={(id, vol) => store.setTrackVolume(id, vol)}
                onPanChange={(id, pan) => store.setTrackPan(id, pan)}
                onMuteToggle={(id) => store.toggleTrackMute(id)}
                onSoloToggle={(id) => store.toggleTrackSolo(id)}
              />
            </div>
          )}
          
          {workspaceView === 'spatial' && (
            <div className="flex-1">
              <FlowState3DWorkspace 
                projectId={projectId}
                tracks={(tracks || []).map(t => ({
                  id: t.id,
                  name: t.name,
                  type: t.type,
                  color: t.color,
                  volume: t.volume ?? 0.8,
                  pan: t.pan ?? 0,
                  muted: t.muted ?? false,
                  solo: t.solo ?? false,
                  armed: t.armed ?? false,
                  meterLevel: [Math.random() * 0.6, Math.random() * 0.6] as [number, number],
                  audioClips: t.audioClips || [],
                  midiClips: t.midiClips || [],
                }))}
                isPlaying={transport.isPlaying}
                currentTime={transport.position}
                onTrackSelect={(id) => setSelectedTrackId(id)}
                selectedTrackIds={selectedTrackId ? [selectedTrackId] : []}
              />
            </div>
          )}
          
          {workspaceView === 'edit' && (
            <div className="flex-1 flex items-center justify-center bg-zinc-950">
              <div className="text-center space-y-4">
                <Piano className="w-16 h-16 mx-auto text-zinc-600" />
                <h3 className="text-lg font-medium text-zinc-300">Piano Roll / Editor</h3>
                <p className="text-sm text-zinc-500">Select a MIDI clip to edit</p>
              </div>
            </div>
          )}
          
          {workspaceView === 'launcher' && (
            <div className="flex-1 flex items-center justify-center bg-zinc-950">
              <div className="text-center space-y-4">
                <Grid3X3 className="w-16 h-16 mx-auto text-zinc-600" />
                <h3 className="text-lg font-medium text-zinc-300">Clip Launcher</h3>
                <p className="text-sm text-zinc-500">Session view for live performance</p>
              </div>
            </div>
          )}
        </main>
        
        <AnimatePresence>
          {showLyrics && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 350, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="flex-shrink-0 border-l border-zinc-800/50 overflow-hidden"
            >
              <LyricDisplay
                lyrics={lyrics}
                currentTime={transport.position}
                isPlaying={transport.isPlaying}
                tempo={transport.tempo}
                onLyricsChange={setLyrics}
                onSeek={(time) => store.setPosition(time)}
              />
            </motion.aside>
          )}
        </AnimatePresence>
        
        <AnimatePresence>
          {showPluginBrowser && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 300, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="flex-shrink-0 border-l border-zinc-800/50 bg-zinc-900/50 overflow-hidden"
            >
              <PluginBrowser
                onSelectPlugin={(plugin) => {
                  if (selectedTrackId) {
                    store.addPlugin(selectedTrackId, {
                      pluginId: plugin.id,
                      pluginSlug: plugin.id,
                      name: plugin.name,
                      bypassed: false,
                      parameters: {},
                    });
                  }
                }}
                selectedTrackId={selectedTrackId}
              />
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
      
      <AnimatePresence>
        {showMixer && workspaceView !== 'mixer' && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 200, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex-shrink-0 border-t border-zinc-800/50 bg-zinc-900/80"
          >
            <div className="h-full flex overflow-x-auto p-2 gap-2">
              {tracks.map(track => (
                <div
                  key={track.id}
                  className="flex-shrink-0 w-20 bg-zinc-800/50 rounded-lg p-2 flex flex-col items-center gap-2"
                >
                  <div className="w-full h-24 bg-zinc-900 rounded relative">
                    <div
                      className="absolute bottom-0 left-1 right-1 bg-gradient-to-t from-green-500 to-green-400 rounded-sm transition-all"
                      style={{ height: `${Math.max(0, (60 + track.meterLevel.left) / 60 * 100)}%` }}
                    />
                  </div>
                  <input
                    type="range"
                    min="-60"
                    max="6"
                    value={track.volume}
                    onChange={(e) => store.setTrackVolume(track.id, parseFloat(e.target.value))}
                    className="w-16 h-1"
                    style={{ writingMode: 'bt-lr', WebkitAppearance: 'slider-vertical' } as React.CSSProperties}
                  />
                  <div className="text-xs truncate w-full text-center">{track.name}</div>
                </div>
              ))}
              <div className="flex-shrink-0 w-24 bg-zinc-800/80 rounded-lg p-2 flex flex-col items-center gap-2 border border-zinc-700">
                <div className="text-[10px] text-zinc-400 uppercase tracking-wider">Master</div>
                <div className="w-full h-24 bg-zinc-900 rounded relative flex gap-1 p-1">
                  <div
                    className="flex-1 bg-gradient-to-t from-green-500 via-yellow-500 to-red-500 rounded-sm transition-all"
                    style={{ height: `${Math.max(0, (60 + masterTrack.meterLevel.left) / 60 * 100)}%` }}
                  />
                  <div
                    className="flex-1 bg-gradient-to-t from-green-500 via-yellow-500 to-red-500 rounded-sm transition-all"
                    style={{ height: `${Math.max(0, (60 + masterTrack.meterLevel.right) / 60 * 100)}%` }}
                  />
                </div>
                <div className="text-xs">{masterTrack.volume.toFixed(1)} dB</div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      <AnimatePresence>
        {showSpectral && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 120, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex-shrink-0 border-t border-zinc-800/50"
          >
            <FlowStateSpectralVisualizer />
          </motion.div>
        )}
      </AnimatePresence>
      
      {showAddTrack && (
        <FlowStateAddTrack
          projectId={projectId}
          isOpen={showAddTrack}
          onClose={() => setShowAddTrack(false)}
          onAddTrack={(type, name) => {
            store.addTrack(type as any, name);
            setShowAddTrack(false);
          }}
        />
      )}
      
      {showKeyboardShortcuts && (
        <FlowStateKeyboardShortcuts onClose={() => setShowKeyboardShortcuts(false)} />
      )}
      
      {!chromeVisible && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-zinc-900/90 backdrop-blur-xl rounded-full px-6 py-3 flex items-center gap-4 shadow-xl border border-zinc-700/50"
        >
          <Button size="sm" variant="ghost" onClick={() => store.setPosition(0)}>
            <SkipBack className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            onClick={() => { unlockAudio(); if (transport.isPlaying) store.pause(); else store.play(); }}
            className={transport.isPlaying ? 'bg-green-600' : 'bg-zinc-700'}
          >
            {transport.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => store.record()}
            className={transport.isRecording ? 'text-red-500' : ''}
          >
            <Circle className="w-4 h-4" fill={transport.isRecording ? 'currentColor' : 'none'} />
          </Button>
          <span className="text-sm font-mono">{formatTime(transport.position)}</span>
          <span className="text-xs text-zinc-500">Press TAB to show UI</span>
        </motion.div>
      )}
    </div>
  );
}

export default UltimateDAW;
