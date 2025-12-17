import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useLocation } from 'wouter';
import { useRequireSubscription } from '@/hooks/useRequireAuth';
import { useAIWorkflow } from '@/hooks/useAIWorkflow';
import type { Project, TrackAnalysis } from '@shared/schema';
import { getCPUUsage } from '@/hooks/useAudioPlayer';
import { useMultiTrackRecorder } from '@/hooks/useMultiTrackRecorder';
import { useStudioController } from '@/hooks/useStudioController';
import { arrayMove } from '@dnd-kit/sortable';

import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogContainerProvider } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { logger } from '@/lib/logger';
import { useKeyboardShortcuts, STUDIO_SHORTCUTS } from '@/hooks/useKeyboardShortcuts';
import { announce } from '@/lib/accessibility';
import {
  Upload,
  Save,
  Brain,
  Sparkles,
  Wand2,
  AudioWaveform,
  Plus,
  Minus,
  Music,
  Piano,
  Zap,
  FileAudio,
  FileText,
  X,
  ChevronDown,
  MonitorSpeaker,
  Download,
  Layers,
  Sliders,
  Activity,
  Loader2,
  Maximize,
  Minimize,
  RotateCw,
  Share2,
} from 'lucide-react';

import { Transport } from '@/components/studio/Transport';
import { TrackList } from '@/components/studio/TrackList';
import { Timeline } from '@/components/studio/Timeline';
import { MixerPanel } from '@/components/studio/MixerPanel';
import { ExportDialog } from '@/components/studio/ExportDialog';
import { StemExportDialog } from '@/components/studio/StemExportDialog';
import { AIAssistantPanel } from '@/components/studio/AIAssistantPanel';
import { DistributionDialog } from '@/components/studio/DistributionDialog';
import { AIGeneratorDialog } from '@/components/studio/AIGeneratorDialog';
import { ConversionDialog } from '@/components/studio/ConversionDialog';
import { PerformanceMonitor } from '@/components/studio/PerformanceMonitor';
import { RecordingPanel } from '@/components/studio/RecordingPanel';
import { WaveformVisualizer } from '@/components/studio/WaveformVisualizer';
import { MarkerLane } from '@/components/studio/MarkerLane';
import { ZoomControls } from '@/components/studio/ZoomControls';
import { TimeRuler } from '@/components/studio/TimeRuler';
import { AutomationLane } from '@/components/studio/AutomationLane';
import AudioEngine from '@/lib/audioEngine';
import { LayoutGrid } from '@/components/studio/LayoutGrid';
import { StudioTopBar } from '@/components/studio/StudioTopBar';
import { StudioInspector } from '@/components/studio/StudioInspector';
import { StudioBrowser } from '@/components/studio/StudioBrowser';
import { StudioDock } from '@/components/studio/StudioDock';
import { useMarkers } from '@/hooks/useMarkers';
import { useStudioStore } from '@/lib/studioStore';
import { TransportBar } from '@/components/studio/TransportBar';
import { BrowserPanel } from '@/components/studio/BrowserPanel';
import { InspectorPanel } from '@/components/studio/InspectorPanel';
import { RoutingMatrix } from '@/components/studio/RoutingMatrix';
import StudioTutorial from '@/components/studio/StudioTutorial';
import { DeviceSelector } from '@/components/studio/DeviceSelector';
import { MetronomeControl } from '@/components/studio/MetronomeControl';
import { PunchRecordingMarkers } from '@/components/studio/PunchRecordingMarkers';
import { TakeCompingLanes } from '@/components/studio/TakeCompingLanes';
import { AudioEngineMonitor } from '@/components/studio/AudioEngineMonitor';
import { useAudioDevices } from '@/hooks/useAudioDevices';
import { useMIDIDevices } from '@/hooks/useMIDIDevices';
import { useMetronome } from '@/hooks/useMetronome';

// Import audio plugins and AI processors
import { CompressorPlugin } from '@/lib/audio/plugins/CompressorPlugin';
import { EQPlugin } from '@/lib/audio/plugins/EQPlugin';
import { ReverbPlugin } from '@/lib/audio/plugins/ReverbPlugin';
import { DelayPlugin } from '@/lib/audio/plugins/DelayPlugin';
import { DistortionPlugin } from '@/lib/audio/plugins/DistortionPlugin';
import { ChorusPlugin } from '@/lib/audio/plugins/ChorusPlugin';
import { FlangerPlugin } from '@/lib/audio/plugins/FlangerPlugin';
import { PhaserPlugin } from '@/lib/audio/plugins/PhaserPlugin';
import { AIMixer } from '@/lib/audio/AIMixer';
import { AIMastering } from '@/lib/audio/AIMastering';

const TRACK_COLORS = [
  '#4ade80',
  '#60a5fa',
  '#f87171',
  '#fbbf24',
  '#a78bfa',
  '#fb923c',
  '#ec4899',
  '#14b8a6',
  '#8b5cf6',
  '#06b6d4',
];

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
  recordEnabled: boolean;
  inputMonitoring: boolean;
  color: string;
  height: number;
  collapsed: boolean;
  outputBus: string;
  groupId?: string;
  effects?: {
    eq?: {
      lowGain: number;
      midGain: number;
      highGain: number;
      midFrequency: number;
      bypass?: boolean;
    };
    compressor?: {
      threshold: number;
      ratio: number;
      attack: number;
      release: number;
      bypass?: boolean;
    };
    reverb?: { mix: number; irId?: string; bypass?: boolean };
  };
}

interface MixBus {
  id: string;
  projectId: string;
  name: string;
  color: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
}

export default function Studio() {
  const { user, isLoading } = useRequireSubscription();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const params = useParams<{ projectId?: string }>();
  const [location, setLocation] = useLocation();

  // Initialize AI workflow hook
  const { startWorkflow, cancel, retry, reset, integrate, aiMix, aiMaster, audioAnalysis } =
    useAIWorkflow({
      onStateChange: (type, state) => {
        logger.info(`[Studio] ${type} state changed to: ${state}`);
      },
      onError: (type, error) => {
        logger.error(`[Studio] ${type} error:`, error);
      },
      onSuccess: (type, data) => {
        logger.info(`[Studio] ${type} success:`, data);
        if (type === 'ai-mix' || type === 'ai-master') {
          queryClient.invalidateQueries({
            queryKey: ['/api/studio/projects', selectedProject?.id, 'tracks'],
          });
        }
        if (type === 'audio-analysis') {
          queryClient.invalidateQueries({ queryKey: ['/api/analysis', selectedProject?.id] });
          setShowAnalysisPanel(true);
        }
      },
    });

  const [view, setView] = useState<'arrangement' | 'mixer'>('arrangement');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null);
  const [showAutomation, setShowAutomation] = useState(false);
  const [automationParameter, setAutomationParameter] = useState<'volume' | 'pan' | 'effect-param'>(
    'volume'
  );

  // Use Zustand store for zoom and other timeline state
  const {
    zoom,
    setZoom,
    currentTime: studioCurrentTime,
    setCurrentTime: setStudioCurrentTime,
    browserVisible,
    toggleBrowser,
    inspectorVisible,
    toggleInspector,
    routingMatrixVisible,
    toggleRoutingMatrix,
    selectedInputDevice,
    selectedOutputDevice,
    bufferSize,
    setSelectedInputDevice,
    setSelectedOutputDevice,
    setBufferSize,
    metronomeEnabled,
    metronomeVolume,
    setMetronomeEnabled,
    setMetronomeVolume,
    punchMode,
    punchIn,
    punchOut,
    setPunchMode,
    setPunchIn,
    setPunchOut,
    tempo,
    setTempo,
    timeSignature,
    takesByTrack,
    addTake,
    updateTake,
    deleteTake,
  } = useStudioStore();

  // DAW Professional Features
  const audioDevices = useAudioDevices();
  const midiDevices = useMIDIDevices();
  const metronome = useMetronome({
    bpm: tempo,
    timeSignature:
      timeSignature === '4/4' ? { numerator: 4, denominator: 4 } : { numerator: 3, denominator: 4 },
    volume: metronomeVolume,
  });

  // Sync device selection between hook and store
  useEffect(() => {
    if (audioDevices.selectedInput !== selectedInputDevice) {
      setSelectedInputDevice(audioDevices.selectedInput);
    }
  }, [audioDevices.selectedInput, selectedInputDevice, setSelectedInputDevice]);

  // Marker persistence with React Query
  const markerService = useMarkers(selectedProject?.id || null);

  // Metronome Transport Sync
  const isPlaying = useStudioStore((state) => state.isPlaying);
  useEffect(() => {
    if (metronomeEnabled && isPlaying) {
      metronome.start();
    } else {
      metronome.stop();
    }
  }, [isPlaying, metronomeEnabled]);

  const [isAIMixing, setIsAIMixing] = useState(false);
  const [isAIMastering, setIsAIMastering] = useState(false);
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [showLyricsPanel, setShowLyricsPanel] = useState(false);
  const [lyricsContent, setLyricsContent] = useState('');
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showStemExportDialog, setShowStemExportDialog] = useState(false);
  const [showDistributionDialog, setShowDistributionDialog] = useState(false);
  const [showAIGeneratorDialog, setShowAIGeneratorDialog] = useState(false);
  const [showConversionDialog, setShowConversionDialog] = useState(false);
  const [exportFormat, setExportFormat] = useState<string>('wav');
  const [exportType, setExportType] = useState<string>('mixdown');
  const [exportSampleRate, setExportSampleRate] = useState(48000);
  const [exportBitDepth, setExportBitDepth] = useState(24);
  const [exportBitrate, setExportBitrate] = useState(320);
  const [exportNormalize, setExportNormalize] = useState(true);
  const [exportDither, setExportDither] = useState(true);
  const [exportJobId, setExportJobId] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState(0);
  const [tapTempoClicks, setTapTempoClicks] = useState<number[]>([]);
  const [showAddTrackDialog, setShowAddTrackDialog] = useState(false);
  const [newTrackName, setNewTrackName] = useState('');
  const [newTrackType, setNewTrackType] = useState<'audio' | 'midi' | 'instrument'>('audio');
  const [newTrackColor, setNewTrackColor] = useState(TRACK_COLORS[0]);
  const [showAddBusDialog, setShowAddBusDialog] = useState(false);
  const [newBusName, setNewBusName] = useState('');
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [inputMonitoringMode, setInputMonitoringMode] = useState<'off' | 'on' | 'auto'>('auto');
  const [latencyMs, setLatencyMs] = useState(0);
  const [cpuUsage, setCpuUsage] = useState(0);
  const [showCPUWarning, setShowCPUWarning] = useState(false);
  const [freezingTrackId, setFreezingTrackId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLyricsLoaded, setIsLyricsLoaded] = useState(false);
  const [showAnalysisPanel, setShowAnalysisPanel] = useState(false);
  const [visualizerMode, setVisualizerMode] = useState<'waveform' | 'spectrum'>('waveform');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dawContainerRef = useRef<HTMLDivElement>(null);
  const multiTrackRecorder = useMultiTrackRecorder();
  const metronomeIntervalRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextClickTimeRef = useRef<number>(0);
  const recordingIntervalRef = useRef<number | null>(null);
  const audioEngineRef = useRef<AudioEngine | null>(null);
  const inputMonitoringRefs = useRef<Map<string, any>>(new Map());

  // Initialize AudioEngine safely
  if (!audioEngineRef.current) {
    audioEngineRef.current = AudioEngine.getInstance();
  }

  // Memoize the onError callback to prevent audio engine re-initialization
  const handleStudioError = useCallback(
    (error: Error) => {
      logger.error('Studio controller error:', error);
      toast({
        title: 'Playback error',
        description: error.message,
        variant: 'destructive',
      });
    },
    [toast]
  );

  // Initialize studio controller
  const controller = useStudioController({
    projectId: selectedProject?.id?.toString() || null,
    onError: handleStudioError,
  });

  // Get real duration from audio clips (reactive - updates when clips change)
  const projectDuration = controller.projectDuration;

  const { data: projectsData } = useQuery({
    queryKey: ['/api/studio/projects'],
    enabled: !!user,
  });
  const projects = (projectsData as any)?.data || [];

  const { data: tracks = [], isLoading: isLoadingTracks } = useQuery<StudioTrack[]>({
    queryKey: ['/api/studio/projects', selectedProject?.id, 'tracks'],
    enabled: !!selectedProject,
  });

  const { data: userPreferences } = useQuery<any>({
    queryKey: ['/api/user/preferences'],
    enabled: !!user,
  });

  const { data: samples = [] } = useQuery<any[]>({
    queryKey: ['/api/studio/samples'],
    enabled: !!user,
  });
  const { data: recentFiles = [] } = useQuery<any[]>({
    queryKey: ['/api/studio/recent-files'],
    enabled: !!user,
  });
  const { data: projectLyrics } = useQuery<any>({
    queryKey: [`/api/studio/lyrics?projectId=${selectedProject?.id}`],
    enabled: !!selectedProject,
  });
  const { data: mixBusses = [] } = useQuery<MixBus[]>({
    queryKey: ['/api/studio/projects', selectedProject?.id, 'mix-busses'],
    enabled: !!selectedProject,
  });

  const createProjectMutation = useMutation({
    mutationFn: async (title: string) => {
      const res = await apiRequest('POST', '/api/studio/projects', {
        title,
        bpm: 120,
        status: 'draft',
      });
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/studio/projects'] });
      setSelectedProject(data);
      // Navigate to the new project URL
      setLocation(`/studio/${data.id}`);
      toast({ title: 'Project created successfully' });
    },
  });

  const uploadFileMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('audio', file);
      if (selectedProject) formData.append('projectId', selectedProject.id.toString());
      return await apiRequest('POST', '/api/studio/upload', formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/studio/projects', selectedProject?.id, 'tracks'],
      });
      queryClient.invalidateQueries({ queryKey: ['/api/studio/recent-files'] });
      toast({ title: 'File uploaded successfully' });
    },
  });

  // AI Mix workflow
  const handleAIMix = () => {
    const apiCall = async (signal?: AbortSignal) => {
      if (!selectedProject) throw new Error('No project selected');
      const response = await fetch(`/api/studio/ai-mix/${selectedProject.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
        signal,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'AI mixing failed');
      }
      return response.json();
    };
    startWorkflow('ai-mix', apiCall);
  };

  // AI Master workflow
  const handleAIMaster = () => {
    const apiCall = async (signal?: AbortSignal) => {
      if (!selectedProject) throw new Error('No project selected');
      const response = await fetch(`/api/studio/ai-master/${selectedProject.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
        signal,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'AI mastering failed');
      }
      return response.json();
    };
    startWorkflow('ai-master', apiCall);
  };

  // Audio Analysis workflow
  const handleAnalyzeAudio = async () => {
    const apiCall = async (signal?: AbortSignal) => {
      if (!selectedProject) throw new Error('No project selected');
      if (!tracks || tracks.length === 0) throw new Error('No tracks to analyze');

      const firstTrack = tracks[0];

      // Fetch audio clips for the first track
      const clipsResponse = await fetch(`/api/studio/tracks/${firstTrack.id}/audio-clips`, {
        method: 'GET',
        credentials: 'include',
        signal,
      });

      if (!clipsResponse.ok) {
        throw new Error('Failed to fetch audio clips');
      }

      const clipsData = await clipsResponse.json();
      const clips = clipsData.clips || clipsData || [];

      if (!clips || clips.length === 0) {
        throw new Error('No audio clips found in project. Please upload an audio file first.');
      }

      // Get the actual audio file path from the first clip
      const audioUrl = clips[0].filePath || clips[0].file_path;
      if (!audioUrl) {
        throw new Error('No audio file path found. Please upload an audio file first.');
      }

      // Dynamically import audio analysis service to avoid bundling 2.6MB essentia.js
      const { audioAnalysisService } = await import('@/lib/audioAnalysisService');
      const analysisResults = await audioAnalysisService.analyzeAudioURL(audioUrl);

      const analysisData = {
        projectId: selectedProject.id,
        trackId: firstTrack.id,
        bpm: analysisResults.bpm.toString(),
        musicalKey: analysisResults.musicalKey,
        scale: analysisResults.scale,
        energy: analysisResults.energy,
        danceability: analysisResults.danceability,
        valence: analysisResults.energy * 0.7,
        loudnessLufs: analysisResults.loudness,
        spectralCentroid: analysisResults.spectralCentroid,
        durationSeconds: Math.floor(analysisResults.durationSeconds),
        beatPositions: analysisResults.beatPositions,
      };

      const response = await fetch('/api/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(analysisData),
        signal,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Analysis failed');
      }

      return response.json();
    };

    startWorkflow('audio-analysis', apiCall);
  };

  const saveLyricsMutation = useMutation({
    mutationFn: async ({ projectId, content }: { projectId: string; content: string }) => {
      return await apiRequest('POST', '/api/studio/lyrics', { projectId, content });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/studio/lyrics'] }),
  });

  const { data: trackAnalysisData } = useQuery<TrackAnalysis | null>({
    queryKey: ['/api/analysis', selectedProject?.id],
    enabled: !!selectedProject?.id,
  });

  const updateTrackMutation = useMutation({
    mutationFn: async ({
      trackId,
      updates,
    }: {
      trackId: string;
      updates: Partial<StudioTrack>;
    }) => {
      if (!selectedProject) return;
      return await apiRequest('PATCH', `/api/studio/tracks/${trackId}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/studio/projects', selectedProject?.id, 'tracks'],
      });
    },
  });

  const addTrackMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProject) throw new Error('No project selected');
      const trackNumber = (tracks.length || 0) + 1;
      const defaultName = `${newTrackType.charAt(0).toUpperCase() + newTrackType.slice(1)} ${trackNumber}`;

      return await apiRequest('POST', `/api/studio/projects/${selectedProject.id}/tracks`, {
        name: newTrackName || defaultName,
        trackType: newTrackType,
        trackNumber,
        volume: 0.8,
        pan: 0,
        mute: false,
        solo: false,
        armed: false,
        recordEnabled: false,
        inputMonitoring: false,
        color: newTrackColor,
        height: 100,
        collapsed: false,
        outputBus: 'master',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/studio/projects', selectedProject?.id, 'tracks'],
      });
      setShowAddTrackDialog(false);
      setNewTrackName('');
      setNewTrackColor(TRACK_COLORS[Math.floor(Math.random() * TRACK_COLORS.length)]);
      toast({ title: 'Track added successfully' });
    },
  });

  const deleteTrackMutation = useMutation({
    mutationFn: async (trackId: string) => {
      if (!selectedProject) throw new Error('No project selected');
      return await apiRequest('DELETE', `/api/studio/tracks/${trackId}`, {
        projectId: selectedProject.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/studio/projects', selectedProject?.id, 'tracks'],
      });
      toast({ title: 'Track deleted successfully' });
    },
  });

  const duplicateTrackMutation = useMutation({
    mutationFn: async (trackId: string) => {
      if (!selectedProject) throw new Error('No project selected');
      const track = tracks.find((t) => t.id === trackId);
      if (!track) throw new Error('Track not found');

      return await apiRequest('POST', `/api/studio/projects/${selectedProject.id}/tracks`, {
        name: `${track.name} (Copy)`,
        trackType: track.trackType,
        trackNumber: tracks.length + 1,
        volume: track.volume,
        pan: track.pan,
        mute: false,
        solo: false,
        armed: false,
        recordEnabled: false,
        inputMonitoring: track.inputMonitoring,
        color: track.color,
        height: track.height,
        collapsed: false,
        outputBus: track.outputBus,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/studio/projects', selectedProject?.id, 'tracks'],
      });
      toast({ title: 'Track duplicated successfully' });
    },
  });

  const createMixBusMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProject) throw new Error('No project selected');
      return await apiRequest('POST', '/api/studio/mix-busses', {
        projectId: selectedProject.id,
        name: newBusName,
        color: TRACK_COLORS[Math.floor(Math.random() * TRACK_COLORS.length)],
        volume: 0.8,
        pan: 0,
        mute: false,
        solo: false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/studio/projects', selectedProject?.id, 'mix-busses'],
      });
      setShowAddBusDialog(false);
      setNewBusName('');
      toast({ title: 'Mix bus created successfully' });
    },
  });

  const reorderTracksMutation = useMutation({
    mutationFn: async ({ trackIds }: { trackIds: string[] }) => {
      if (!selectedProject) throw new Error('No project selected');
      return await apiRequest(
        'PATCH',
        `/api/studio/projects/${selectedProject.id}/tracks/reorder`,
        {
          trackIds,
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/studio/projects', selectedProject?.id, 'tracks'],
      });
    },
  });

  const exportProjectMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProject) throw new Error('No project selected');

      // Step 1: Create export job on server
      const response = await apiRequest('POST', `/api/studio/export`, {
        projectId: selectedProject.id,
        exportType,
        format: exportFormat,
        sampleRate: exportSampleRate,
        bitDepth: exportBitDepth,
        bitrate: exportBitrate,
        normalize: exportNormalize,
        dither: exportDither,
        startTime: 0,
        endTime: null,
        trackIds:
          exportType === 'tracks'
            ? tracks.filter((t) => selectedTrack === t.id).map((t) => t.id)
            : undefined,
        metadata: {
          artist: '',
          title: selectedProject.title || 'Untitled',
          album: '',
          year: new Date().getFullYear(),
        },
      });
      const jobData = await response.json();

      if (!jobData.jobId) {
        throw new Error('Failed to create export job');
      }

      setExportJobId(jobData.jobId);

      // Step 2: Render audio in browser using OfflineAudioContext
      const { exportAudio } = await import('@/lib/exportEngine');

      // Fetch audio clips for all tracks
      const tracksWithClips = await Promise.all(
        tracks.map(async (track) => {
          try {
            const clipsResponse = await apiRequest(
              'GET',
              `/api/studio/tracks/${track.id}/audio-clips`
            );
            const clipsData = await clipsResponse.json();
            const clips = clipsData.clips || clipsData || [];
            return { track, clips };
          } catch (error: unknown) {
            return { track, clips: [] };
          }
        })
      );

      // Prepare tracks for export
      const exportTracks = tracksWithClips
        .map(({ track, clips }) => {
          let audioUrl = '';
          if (clips.length > 0) {
            audioUrl = clips[0].filePath || clips[0].file_path || '';
          } else if ((track as any).filePath) {
            audioUrl = (track as any).filePath;
          }

          return {
            id: track.id,
            name: track.name,
            audioUrl,
            gain: track.volume || 0.8,
            pan: track.pan || 0,
            isMuted: track.mute || false,
            isSolo: track.solo || false,
            effects: track.effects,
          };
        })
        .filter((t) => t.audioUrl);

      if (exportTracks.length === 0) {
        throw new Error('No tracks with audio to export');
      }

      // Calculate project duration (use max track duration or default)
      const maxDuration = Math.max(...exportTracks.map(() => 60)); // Default 60s per track

      const exportResult = await exportAudio(
        {
          tracks: exportTracks,
          exportType: exportType === 'stems' ? 'stems' : 'mixdown',
          sampleRate: exportSampleRate,
          bitDepth: exportBitDepth,
          normalize: exportNormalize,
          dither: exportDither,
          duration: maxDuration,
          masterGain: 0.8,
          masterCompression: {
            threshold: -12,
            ratio: 4,
            attack: 0.005,
            release: 0.12,
          },
        },
        (progress) => {
          setExportProgress(progress.progress);
          if (progress.stage === 'loading') {
            toast({ title: progress.message, description: 'Loading audio files...' });
          } else if (progress.stage === 'rendering') {
            toast({
              title: progress.message,
              description: 'Rendering with OfflineAudioContext...',
            });
          } else if (progress.stage === 'encoding') {
            toast({ title: progress.message, description: 'Converting to WAV format...' });
          }
        }
      );

      // Step 3: Upload rendered audio to server
      const formData = new FormData();
      exportResult.files.forEach((file, index) => {
        formData.append('audio', file.blob, file.name);
      });

      toast({
        title: 'Uploading rendered audio...',
        description: 'Sending to server for format conversion...',
      });

      const uploadResponse = await fetch(`/api/studio/export/${jobData.jobId}/upload`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload rendered audio');
      }

      return jobData;
    },
    onSuccess: (data) => {
      if (data.jobId) {
        toast({ title: 'Processing export...', description: 'Converting to final format...' });

        // Poll for completion
        const checkStatus = setInterval(async () => {
          try {
            const statusResponse = await fetch(`/api/studio/export/${data.jobId}/status`);
            const status = await statusResponse.json();
            setExportProgress(status.progress || 0);

            if (status.status === 'completed') {
              clearInterval(checkStatus);
              setShowExportDialog(false);
              setExportJobId(null);
              setExportProgress(0);
              toast({
                title: `Export completed as ${exportFormat.toUpperCase()}`,
                description: 'Download starting...',
              });
              window.open(`/api/studio/export/${data.jobId}/download`, '_blank');
            } else if (status.status === 'failed') {
              clearInterval(checkStatus);
              setExportJobId(null);
              setExportProgress(0);
              toast({
                title: 'Export failed',
                description: status.error || 'Unknown error',
                variant: 'destructive',
              });
            }
          } catch (error: unknown) {
            logger.error('Error checking export status:', error);
          }
        }, 1000);
      }
    },
    onError: (error: Error) => {
      setExportJobId(null);
      setExportProgress(0);
      toast({
        title: 'Export failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const displayTracks: StudioTrack[] = controller.tracks;

  useEffect(() => {
    // Poll for AudioContext availability and monitor CPU
    const checkInterval = setInterval(() => {
      const engineContext = controller.getAudioContext();
      if (engineContext) {
        const usage = getCPUUsage(engineContext);
        setCpuUsage(usage);
        setShowCPUWarning(usage > 80);
      } else {
        // Engine not initialized yet, reset CPU display
        setCpuUsage(0);
        setShowCPUWarning(false);
      }
    }, 1000);
    
    return () => clearInterval(checkInterval);
  }, [controller]);

  useEffect(() => {
    if (projectLyrics) {
      setLyricsContent(projectLyrics.content || '');
      setIsLyricsLoaded(true);
    } else {
      setLyricsContent('');
      setIsLyricsLoaded(true);
    }
  }, [projectLyrics]);

  useEffect(() => {
    if (userPreferences && selectedProject) {
      const tutorialCompleted = userPreferences.tutorialCompleted?.studio;
      if (!tutorialCompleted) {
        const timer = setTimeout(() => {
          setShowTutorial(true);
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [userPreferences, selectedProject]);

  // Load project from URL parameter on mount
  useEffect(() => {
    const projectIdFromUrl = params.projectId;

    if (projectIdFromUrl && projects.length > 0) {
      const project = projects.find(
        (p: unknown) => p.id === projectIdFromUrl || p.id.toString() === projectIdFromUrl
      );

      if (project) {
        // Valid project found - load it
        if (!selectedProject || selectedProject.id !== project.id) {
          setSelectedProject(project);
        }
      } else {
        // Invalid project ID - show error and redirect
        toast({
          title: 'Project not found',
          description: 'The requested project does not exist or you do not have access to it.',
          variant: 'destructive',
        });
        setLocation('/studio');
      }
    } else if (!projectIdFromUrl && selectedProject) {
      // No projectId in URL but we have a selected project - this is a mismatch
      // This can happen if user manually navigates to /studio while viewing a project
      // We'll keep the selected project but won't update the URL to avoid navigation loops
    }
  }, [params.projectId, projects, selectedProject, setLocation, toast]);

  // Sync URL when selected project changes (but not from URL changes)
  useEffect(() => {
    if (selectedProject && selectedProject.id !== params.projectId) {
      // Project was changed via UI, update URL
      setLocation(`/studio/${selectedProject.id}`);
    } else if (!selectedProject && params.projectId) {
      // Project was cleared, navigate to /studio
      setLocation('/studio');
    }
  }, [selectedProject, params.projectId, setLocation]);

  useEffect(() => {
    if (!selectedProject || !tracks.length || isLoadingTracks) return;

    const loadTracksIntoController = async () => {
      try {
        await controller.loadTracks(tracks as any);
      } catch (error: unknown) {
        logger.error('Error loading tracks into controller:', error);
        toast({
          title: 'Error loading audio',
          description: 'Failed to load some audio tracks.',
          variant: 'destructive',
        });
      }
    };

    loadTracksIntoController();
  }, [selectedProject, tracks, isLoadingTracks, controller, toast]);

  // Loop handling - seek back when loop is enabled and end is reached
  useEffect(() => {
    if (!controller.transport.isPlaying || !controller.transport.loopEnabled) return;

    const checkLoop = () => {
      if (controller.transport.currentTime >= controller.transport.loopEnd) {
        controller.seek(controller.transport.loopStart);
      }
    };

    const interval = setInterval(checkLoop, 100);
    return () => clearInterval(interval);
  }, [controller]);

  const toggleFullscreen = useCallback(async () => {
    if (!dawContainerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        await dawContainerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (error: unknown) {
      logger.error('Error toggling fullscreen:', error);
      toast({
        title: 'Fullscreen error',
        description:
          "Unable to toggle fullscreen mode. Please try using F11 or your browser's fullscreen option.",
        variant: 'destructive',
      });
    }
  }, [toast]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Input monitoring management for armed tracks
  useEffect(() => {
    if (!displayTracks.length) return;

    const handleInputMonitoring = async () => {
      for (const track of displayTracks) {
        const shouldMonitor = track.armed && track.inputMonitoring;
        const isMonitoring = inputMonitoringRefs.current.has(track.id);

        if (shouldMonitor && !isMonitoring) {
          try {
            const monitoringData = await multiTrackRecorder.startInputMonitoring(
              track.id,
              track.name
            );
            if (monitoringData) {
              inputMonitoringRefs.current.set(track.id, monitoringData);
            }
          } catch (error: unknown) {
            logger.error(`Failed to start input monitoring for track ${track.id}:`, error);
          }
        } else if (!shouldMonitor && isMonitoring) {
          const monitoringData = inputMonitoringRefs.current.get(track.id);
          multiTrackRecorder.stopInputMonitoring(track.id, monitoringData);
          inputMonitoringRefs.current.delete(track.id);
        }
      }
    };

    handleInputMonitoring();

    return () => {
      inputMonitoringRefs.current.forEach((monitoringData, trackId) => {
        multiTrackRecorder.stopInputMonitoring(trackId, monitoringData);
      });
      inputMonitoringRefs.current.clear();
    };
  }, [displayTracks, multiTrackRecorder]);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) uploadFileMutation.mutate(file);
    },
    [uploadFileMutation]
  );

  const handleSaveProject = useCallback(async () => {
    if (!selectedProject) return;

    setIsSaving(true);
    try {
      // Save project state - in this implementation, we're using auto-save via mutations
      // This manual save updates the lastSaved timestamp to give user feedback
      await new Promise((resolve) => setTimeout(resolve, 500)); // Brief delay for UX feedback
      setLastSaved(new Date());
      toast({ title: 'Project saved successfully' });
    } catch (error: unknown) {
      logger.error('Error saving project:', error);
      toast({
        title: 'Save failed',
        description: 'Could not save project. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }, [selectedProject, toast]);


  const handleTrackUpdate = useCallback(
    async (trackId: string, updates: Partial<StudioTrack>) => {
      try {
        await controller.updateTrack(trackId, updates);
      } catch (error: unknown) {
        logger.error('Error updating track:', error);
      }
    },
    [controller]
  );

  const handleMuteToggle = useCallback(
    async (trackId: string) => {
      try {
        await controller.toggleMute(trackId);
      } catch (error: unknown) {
        logger.error('Error toggling mute:', error);
      }
    },
    [controller]
  );

  const handleSoloToggle = useCallback(
    async (trackId: string) => {
      try {
        await controller.toggleSolo(trackId);
      } catch (error: unknown) {
        logger.error('Error toggling solo:', error);
      }
    },
    [controller]
  );

  const handleVolumeChange = useCallback(
    async (trackId: string, volume: number) => {
      try {
        await controller.setTrackVolume(trackId, volume);
      } catch (error: unknown) {
        logger.error('Error changing volume:', error);
      }
    },
    [controller]
  );

  const handlePanChange = useCallback(
    async (trackId: string, pan: number) => {
      try {
        await controller.setTrackPan(trackId, pan);
      } catch (error: unknown) {
        logger.error('Error changing pan:', error);
      }
    },
    [controller]
  );

  const handleMasterVolumeChange = useCallback(
    (volume: number) => {
      try {
        controller.setMasterVolume(volume);
      } catch (error: unknown) {
        logger.error('Error changing master volume:', error);
      }
    },
    [controller]
  );

  const handleTrackNameChange = useCallback(
    async (trackId: string, name: string) => {
      try {
        await controller.updateTrack(trackId, { name });
      } catch (error: unknown) {
        logger.error('Error changing track name:', error);
      }
    },
    [controller]
  );

  const handleReorderTracks = useCallback(
    (oldIndex: number, newIndex: number) => {
      if (!selectedProject) return;
      const reorderedTracks = arrayMove(tracks, oldIndex, newIndex);
      const trackIds = reorderedTracks.map((t) => t.id);
      reorderTracksMutation.mutate({ trackIds });
    },
    [selectedProject, tracks, reorderTracksMutation]
  );

  const handlePlay = useCallback(async () => {
    await controller.play();
  }, [controller]);

  const handlePause = useCallback(() => controller.pause(), [controller]);
  const handleStop = useCallback(() => controller.stop(), [controller]);
  const handleSkipBack = useCallback(() => {
    const newTime = Math.max(0, controller.transport.currentTime - 5);
    controller.seek(newTime);
  }, [controller]);
  const handleSkipForward = useCallback(() => {
    // Use real duration from audio clips
    const estimatedDuration = projectDuration;
    const newTime = Math.min(estimatedDuration, controller.transport.currentTime + 5);
    controller.seek(newTime);
  }, [controller, projectDuration]);

  const handleTimelineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const timelineWidth = rect.width;
      // Use a safe default duration of 300 seconds (5 minutes)
      const estimatedDuration = selectedProject?.duration || 300;
      const newTime = (clickX / timelineWidth) * estimatedDuration;
      controller.seek(newTime);
    },
    [controller, selectedProject]
  );

  const handleClipUpdate = useCallback(
    async (trackId: string, clipId: string, updates: { startTime?: number; duration?: number }) => {
      try {
        // Update the local Map and sync to AudioEngine immediately
        controller.updateClipInMap(trackId, clipId, updates);

        // Persist to backend
        const dbUpdates: { startTime?: number; duration?: number } = {};
        if (updates.startTime !== undefined) {
          dbUpdates.startTime = updates.startTime;
        }
        if (updates.duration !== undefined) {
          dbUpdates.duration = updates.duration;
        }

        await controller.updateClip(clipId, dbUpdates);
        // Invalidate tracks query to refresh clip data
        queryClient.invalidateQueries({
          queryKey: ['/api/studio/projects', selectedProject?.id, 'tracks'],
        });
        toast({ title: 'Clip updated successfully' });
      } catch (error: unknown) {
        logger.error('Failed to update clip:', error);
        toast({
          title: 'Failed to update clip',
          description: error.message,
          variant: 'destructive',
        });
      }
    },
    [controller, queryClient, selectedProject, toast]
  );

  const handleTapTempo = useCallback(() => {
    const now = Date.now();
    const newClicks = [...tapTempoClicks, now].slice(-4);
    setTapTempoClicks(newClicks);
    if (newClicks.length >= 2) {
      const intervals = [];
      for (let i = 1; i < newClicks.length; i++) intervals.push(newClicks[i] - newClicks[i - 1]);
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const newBpm = Math.round(60000 / avgInterval);
      if (newBpm >= 40 && newBpm <= 240) controller.setTempo(newBpm);
    }
  }, [tapTempoClicks, controller]);

  const incrementTempo = useCallback(
    () => controller.setTempo(Math.min(240, controller.transport.tempo + 1)),
    [controller]
  );
  const decrementTempo = useCallback(
    () => controller.setTempo(Math.max(40, controller.transport.tempo - 1)),
    [controller]
  );

  const handleStartRecording = useCallback(async () => {
    if (!selectedProject) {
      toast({ title: 'No project selected', variant: 'destructive' });
      return;
    }
    const armedTracks = displayTracks.filter((t) => t.armed);
    if (armedTracks.length === 0) {
      toast({
        title: 'No tracks armed for recording',
        description: 'Arm at least one track',
        variant: 'destructive',
      });
      return;
    }
    try {
      controller.startRecording();
      const { sessionId } = await multiTrackRecorder.startRecording(
        armedTracks.map((t) => ({ id: t.id, name: t.name })),
        {
          startPosition: controller.transport.currentTime,
          takeNumber: 1,
          isLoopRecording: controller.transport.loopEnabled,
        }
      );
      const interval = window.setInterval(
        () => setRecordingDuration(multiTrackRecorder.duration),
        100
      );
      recordingIntervalRef.current = interval;
      toast({ title: `Recording ${armedTracks.length} track(s)` });
    } catch (error: unknown) {
      logger.error('Error starting recording:', error);
      controller.stopRecording();
      toast({
        title: 'Failed to start recording',
        description: error.message,
        variant: 'destructive',
      });
    }
  }, [selectedProject, displayTracks, controller, multiTrackRecorder, toast]);

  const handleStopRecording = useCallback(async () => {
    if (!multiTrackRecorder.isRecording || !selectedProject) return;
    try {
      const recordedBlobs = await multiTrackRecorder.stopRecording();
      announce('Recording stopped');
      controller.stopRecording();
      await multiTrackRecorder.uploadRecordings(recordedBlobs, selectedProject.id.toString());
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
      setRecordingDuration(0);
      queryClient.invalidateQueries({
        queryKey: ['/api/studio/projects', selectedProject.id, 'tracks'],
      });
      toast({ title: 'Recording complete' });
    } catch (error: unknown) {
      logger.error('Error stopping recording:', error);
      controller.stopRecording();
      toast({
        title: 'Failed to stop recording',
        description: error.message,
        variant: 'destructive',
      });
    }
  }, [multiTrackRecorder, selectedProject, controller, queryClient, toast]);

  // Keyboard shortcuts implementation
  const shortcuts = useKeyboardShortcuts([
    {
      key: ' ',
      handler: () => (controller.transport.isPlaying ? handlePause() : handlePlay()),
      description: 'Play/Pause',
    },
    {
      key: 's',
      handler: () => handleStop(),
      description: 'Stop',
    },
    {
      key: 'r',
      handler: () =>
        controller.transport.isRecording ? handleStopRecording() : handleStartRecording(),
      description: 'Record',
    },
    {
      key: 'l',
      handler: () => controller.toggleLoop(),
      description: 'Toggle Loop',
    },
    {
      key: 'b',
      handler: () => toggleBrowser(),
      description: 'Toggle Browser Panel',
    },
    {
      key: 'i',
      handler: () => toggleInspector(),
      description: 'Toggle Inspector Panel',
    },
    {
      key: 'shift+r',
      handler: () => toggleRoutingMatrix(),
      description: 'Toggle Routing Matrix',
    },
    {
      key: 'm',
      handler: () => {
        if (selectedTrack) {
          const track = displayTracks.find((t) => t.id === selectedTrack);
          if (track) {
            handleMuteToggle(track.id);
            announce(`Track ${track.name} ${track.mute ? 'unmuted' : 'muted'}`);
          }
        }
      },
      description: 'Mute selected track',
    },
    {
      key: 'Delete',
      handler: () => {
        // Delete selected clip logic
        announce('Delete selected clip');
      },
      description: 'Delete selected clip',
    },
    {
      key: 's',
      ctrl: true,
      handler: async () => {
        if (selectedProject) {
          await saveProjectMutation.mutateAsync({ projectId: selectedProject.id.toString() });
          announce('Project saved');
        }
      },
      description: 'Save project',
    },
    {
      key: 'z',
      ctrl: true,
      handler: () => announce('Undo'),
      description: 'Undo',
    },
    {
      key: 'y',
      ctrl: true,
      handler: () => announce('Redo'),
      description: 'Redo',
    },
    {
      key: 'l',
      handler: () => {
        controller.toggleLoop();
        announce(`Loop ${controller.transport.loopEnabled ? 'enabled' : 'disabled'}`);
      },
      description: 'Toggle loop',
    },
    {
      key: 'k',
      handler: () => {
        controller.toggleClick();
        announce(`Metronome ${controller.transport.clickEnabled ? 'enabled' : 'disabled'}`);
      },
      description: 'Toggle metronome',
    },
    {
      key: '=',
      ctrl: true,
      handler: () => {
        setZoom((prev) => Math.min(prev * 1.2, 5));
        announce('Zoom in');
      },
      description: 'Zoom in',
    },
    {
      key: '-',
      ctrl: true,
      handler: () => {
        setZoom((prev) => Math.max(prev / 1.2, 0.5));
        announce('Zoom out');
      },
      description: 'Zoom out',
    },
    {
      key: ',',
      handler: () => handleSkipBack(),
      description: 'Skip back',
    },
    {
      key: '.',
      handler: () => handleSkipForward(),
      description: 'Skip forward',
    },
  ]);

  useEffect(() => {
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) audioContextRef.current = new AudioContextClass();
    }
  }, []);

  useEffect(() => {
    const context = audioContextRef.current;
    if (!context || !controller.transport.clickEnabled || !controller.transport.isPlaying) {
      if (metronomeIntervalRef.current) {
        window.clearInterval(metronomeIntervalRef.current);
        metronomeIntervalRef.current = null;
      }
      return;
    }
    const beatDuration = 60 / controller.transport.tempo;
    const [numerator] = (selectedProject?.timeSignature || '4/4').split('/').map(Number);
    let beatCount = 0;
    const scheduleClick = () => {
      const now = context.currentTime;
      if (nextClickTimeRef.current <= now) nextClickTimeRef.current = now;
      const osc = context.createOscillator();
      const gain = context.createGain();
      const isFirstBeat = beatCount % numerator === 0;
      osc.frequency.value = isFirstBeat ? 1000 : 800;
      gain.gain.value = isFirstBeat ? 0.3 : 0.15;
      osc.connect(gain);
      gain.connect(context.destination);
      osc.start(nextClickTimeRef.current);
      osc.stop(nextClickTimeRef.current + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, nextClickTimeRef.current + 0.05);
      nextClickTimeRef.current += beatDuration;
      beatCount++;
    };
    scheduleClick();
    const interval = window.setInterval(scheduleClick, (beatDuration * 1000) / 2);
    metronomeIntervalRef.current = interval;
    return () => {
      if (metronomeIntervalRef.current) {
        window.clearInterval(metronomeIntervalRef.current);
        metronomeIntervalRef.current = null;
      }
    };
  }, [controller, selectedProject?.timeSignature]);

  useEffect(() => {
    if (!selectedProject || !isLyricsLoaded) return;
    const timer = setTimeout(() => {
      if (lyricsContent !== (projectLyrics?.content || '')) {
        saveLyricsMutation.mutate({
          projectId: selectedProject.id.toString(),
          content: lyricsContent,
        });
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [lyricsContent, selectedProject, isLyricsLoaded]);

  const handleDuplicateTrack = useCallback(
    (trackId: string) => {
      duplicateTrackMutation.mutate(trackId);
    },
    [duplicateTrackMutation]
  );

  const handleDeleteTrack = useCallback(
    async (trackId: string) => {
      try {
        await controller.deleteTrack(trackId);
        toast({ title: 'Track deleted successfully' });
      } catch (error: unknown) {
        logger.error('Error deleting track:', error);
        toast({
          title: 'Failed to delete track',
          description: 'An error occurred while deleting the track.',
          variant: 'destructive',
        });
      }
    },
    [controller, toast]
  );

  const handleAddTrack = useCallback(() => {
    setShowAddTrackDialog(true);
  }, []);

  const addGeneratedTrackMutation = useMutation({
    mutationFn: async ({
      audioFilePath,
      parameters,
    }: {
      audioFilePath: string;
      parameters: any;
    }) => {
      if (!selectedProject) throw new Error('No project selected');

      const trackNumber = (tracks.length || 0) + 1;
      const trackName = `AI: ${parameters.key} ${parameters.mood}`;
      const trackColor = TRACK_COLORS[Math.floor(Math.random() * TRACK_COLORS.length)];

      return await apiRequest('POST', `/api/studio/projects/${selectedProject.id}/tracks`, {
        name: trackName,
        trackType: 'audio',
        trackNumber,
        volume: 0.8,
        pan: 0,
        mute: false,
        solo: false,
        armed: false,
        recordEnabled: false,
        inputMonitoring: false,
        color: trackColor,
        height: 100,
        collapsed: false,
        outputBus: 'master',
        filePath: audioFilePath,
        clips: [
          {
            name: trackName,
            startTime: 0,
            duration: 10,
            filePath: audioFilePath,
          },
        ],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/studio/projects', selectedProject?.id, 'tracks'],
      });
      setShowAIGeneratorDialog(false);
      toast({
        title: 'Track added successfully',
        description: 'Generated audio has been added to your project',
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Failed to add track',
        description: error.message || 'Could not add generated audio to project',
        variant: 'destructive',
      });
    },
  });

  const handleAddGeneration = useCallback(
    (audioFilePath: string, parameters: unknown) => {
      addGeneratedTrackMutation.mutate({ audioFilePath, parameters });
    },
    [addGeneratedTrackMutation]
  );

  const isDataLoading = isLoading || !user || (selectedProject && isLoadingTracks);

  return (
    <AppLayout noPadding={!isDataLoading}>
      {isDataLoading ? (
        <div
          className="flex items-center justify-center h-full"
          role="status"
          aria-label="Loading studio"
        >
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          <span className="sr-only">Loading studio components...</span>
        </div>
      ) : (
        <div
          ref={dawContainerRef}
          className="h-full flex flex-col studio-container"
          role="application"
          aria-label="Digital Audio Workstation"
        >
          <LayoutGrid
            topBar={
              <StudioTopBar
                tempo={controller.transport.tempo}
                timeSignature={selectedProject?.timeSignature || '4/4'}
                cpuUsage={cpuUsage}
                zoom={zoom}
                selectedTool={undefined}
                selectedProject={selectedProject}
                projects={projects}
                onToolSelect={() => {}}
                onZoomIn={() => setZoom((z) => Math.min(z * 1.2, 5))}
                onZoomOut={() => setZoom((z) => Math.max(z / 1.2, 0.1))}
                onShowTutorial={() => setShowTutorial(true)}
                onZoomReset={() => setZoom(1)}
                onProjectChange={(projectId) => {
                  const project = projects.find((p: unknown) => p.id === projectId);
                  if (project) setSelectedProject(project);
                }}
                onCreateProject={(title) => createProjectMutation.mutate(title)}
                onUploadFile={() => fileInputRef.current?.click()}
                onSaveProject={handleSaveProject}
                isSaving={isSaving}
              />
            }
            inspector={
              inspectorVisible ? (
                <InspectorPanel
                  selectedTrack={
                    selectedTrack ? displayTracks.find((t) => t.id === selectedTrack) || null : null
                  }
                  selectedClip={null}
                  onTrackUpdate={handleTrackUpdate}
                  onClipUpdate={(clipId, updates) => logger.info('Clip update:', clipId, updates)}
                />
              ) : null
            }
            timeline={
              <>
                <div
                  className="border-b max-h-32 overflow-y-auto"
                  style={{
                    borderColor: 'var(--studio-border)',
                    backgroundColor: 'var(--studio-bg-medium)',
                  }}
                >
                  <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
                    <div className="flex items-center gap-2 flex-wrap px-4 py-2">
                      <RecordingPanel
                        isRecording={controller.transport.isRecording}
                        recordingDuration={recordingDuration}
                        armedTracksCount={displayTracks.filter((t) => t.armed).length}
                        inputMonitoringMode={inputMonitoringMode}
                        latencyMs={latencyMs}
                      />
                      <PerformanceMonitor
                        cpuUsage={cpuUsage}
                        showCPUWarning={showCPUWarning}
                        freezingTrackId={freezingTrackId}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-purple-400 hover:text-purple-300 hover:bg-purple-900/20"
                        onClick={() => setIsAIMixing(true)}
                        data-testid="button-ai-mix"
                      >
                        <Brain className="h-4 w-4 mr-1" />
                        AI Mix
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-blue-400 hover:text-blue-300 hover:bg-blue-900/20"
                        onClick={() => setIsAIMastering(true)}
                        data-testid="button-ai-master"
                      >
                        <Sparkles className="h-4 w-4 mr-1" />
                        AI Master
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-amber-400 hover:text-amber-300 hover:bg-amber-900/20"
                        onClick={() => setShowAIGeneratorDialog(true)}
                        data-testid="button-ai-generator"
                      >
                        <Wand2 className="h-4 w-4 mr-1" />
                        AI Generator
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-900/20"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowAIAssistant(true);
                        }}
                        data-testid="button-ai-assistant"
                      >
                        <Sparkles className="h-4 w-4 mr-1" />
                        AI Assistant
                      </Button>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant={showAnalysisPanel ? 'secondary' : 'ghost'}
                              className="h-8 text-green-400 hover:text-green-300 hover:bg-green-900/20"
                              onClick={() => {
                                if (trackAnalysisData) {
                                  setShowAnalysisPanel(true);
                                } else {
                                  handleAnalyzeAudio();
                                }
                              }}
                              disabled={
                                !selectedProject ||
                                tracks.length === 0 ||
                                audioAnalysis.currentState === 'requesting' ||
                                audioAnalysis.currentState === 'processing'
                              }
                              data-testid="button-analyze-audio"
                            >
                              {audioAnalysis.currentState === 'requesting' ||
                              audioAnalysis.currentState === 'processing' ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                  Analyzing...
                                </>
                              ) : (
                                <>
                                  <Activity className="h-4 w-4 mr-1" />
                                  Analyze
                                </>
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Analyze audio features (BPM, key, energy, etc.)</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <Button
                        size="sm"
                        variant={showLyricsPanel ? 'secondary' : 'ghost'}
                        className="h-8"
                        onClick={() => setShowLyricsPanel(!showLyricsPanel)}
                        data-testid="button-toggle-lyrics"
                      >
                        <FileText className="h-4 w-4 mr-1" />
                        Lyrics
                      </Button>
                      <Separator orientation="vertical" className="h-6 bg-gray-600" />
                      {lastSaved && (
                        <div
                          className="text-xs text-gray-400"
                          data-testid="text-autosave-indicator"
                        >
                          {isSaving ? (
                            <span className="text-blue-400">💾 Saving...</span>
                          ) : (
                            <span>
                              💾 Saved{' '}
                              {new Date().getTime() - lastSaved.getTime() < 60000
                                ? 'just now'
                                : `${Math.floor((new Date().getTime() - lastSaved.getTime()) / 60000)}m ago`}
                            </span>
                          )}
                        </div>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        onClick={() => setShowExportDialog(true)}
                        disabled={!selectedProject}
                        data-testid="button-open-export"
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Export
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        onClick={() => setShowStemExportDialog(true)}
                        disabled={!selectedProject || tracks.length === 0}
                        data-testid="button-export-stems"
                      >
                        <Layers className="h-4 w-4 mr-1" />
                        Export Stems
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        onClick={() => setShowConversionDialog(true)}
                        disabled={!selectedProject}
                        data-testid="button-convert"
                      >
                        <FileAudio className="h-4 w-4 mr-1" />
                        Convert
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        onClick={() => setShowDistributionDialog(true)}
                        disabled={!selectedProject}
                        data-testid="button-open-distribution"
                      >
                        <FileText className="h-4 w-4 mr-1" />
                        Distribution
                      </Button>
                      <Separator orientation="vertical" className="h-6 bg-gray-600" />
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8"
                              onClick={toggleFullscreen}
                              data-testid="button-toggle-fullscreen"
                            >
                              {isFullscreen ? (
                                <>
                                  <Minimize className="h-4 w-4 mr-1" />
                                  Exit
                                </>
                              ) : (
                                <>
                                  <Maximize className="h-4 w-4 mr-1" />
                                  Fullscreen
                                </>
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>
                              {isFullscreen ? 'Exit fullscreen (ESC)' : 'Enter fullscreen mode'}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <Separator orientation="vertical" className="h-6 bg-gray-600" />
                      <Button
                        size="sm"
                        variant={view === 'arrangement' ? 'secondary' : 'ghost'}
                        className="h-8"
                        onClick={() => setView('arrangement')}
                        data-testid="button-view-arrangement"
                      >
                        <Layers className="h-4 w-4 mr-1" />
                        Arrangement
                      </Button>
                      <Button
                        size="sm"
                        variant={view === 'mixer' ? 'secondary' : 'ghost'}
                        className="h-8"
                        onClick={() => setView('mixer')}
                        data-testid="button-view-mixer"
                      >
                        <Sliders className="h-4 w-4 mr-1" />
                        Mixer
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex-1 flex flex-col overflow-hidden bg-[#1a1a1a]">
                  {!selectedProject ? (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-center max-w-md">
                        <AudioWaveform className="h-16 w-16 mx-auto mb-4 text-gray-600" />
                        <h3 className="text-lg font-semibold text-white mb-2">
                          No Project Selected
                        </h3>
                        <p className="text-sm text-gray-400 mb-4">
                          Create a new project or select an existing one from the dropdown above to
                          get started
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div
                        className={`${showLyricsPanel ? 'flex-1' : 'flex-1'} flex flex-col overflow-hidden`}
                      >
                        {view === 'arrangement' ? (
                          <div className="flex-1 flex flex-col overflow-hidden">
                            <div className="p-4 border-b border-gray-700">
                              <WaveformVisualizer
                                audioEngine={audioEngineRef.current}
                                isPlaying={controller.transport.isPlaying}
                                mode={visualizerMode}
                                onModeChange={setVisualizerMode}
                              />
                            </div>
                            {/* Zoom Controls and Snap Grid */}
                            <ZoomControls />

                            {/* Time Ruler */}
                            <div className="flex">
                              <div className="w-64 bg-[#252525] border-r border-gray-700" />
                              <div className="flex-1">
                                <TimeRuler
                                  duration={projectDuration}
                                  tempo={controller.transport.tempo}
                                  timeSignature={selectedProject?.timeSignature || '4/4'}
                                  loopEnabled={controller.transport.loopEnabled}
                                  loopStart={controller.transport.loopStart}
                                  loopEnd={controller.transport.loopEnd}
                                  onTimelineClick={handleTimelineClick}
                                />
                              </div>
                            </div>

                            {/* Marker Lane */}
                            <div className="flex">
                              <div className="w-64 bg-[#252525] border-r border-gray-700" />
                              <div className="flex-1">
                                <MarkerLane
                                  duration={projectDuration}
                                  onTimelineClick={handleTimelineClick}
                                />
                              </div>
                            </div>

                            <div className="flex border-b border-gray-700">
                              <div className="w-64 bg-[#252525] border-r border-gray-700 p-2 flex items-center justify-between">
                                <div className="text-xs font-semibold text-gray-400">TRACKS</div>
                                <div className="flex gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-2 text-xs"
                                    onClick={() => setShowAddTrackDialog(true)}
                                    data-testid="button-add-track"
                                  >
                                    <Plus className="h-3 w-3 mr-1" />
                                    Add
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-2 text-xs"
                                    onClick={() => setShowAddBusDialog(true)}
                                    data-testid="button-add-bus"
                                  >
                                    <MonitorSpeaker className="h-3 w-3 mr-1" />
                                    Bus
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant={showAutomation ? 'secondary' : 'ghost'}
                                    className="h-6 px-2 text-xs"
                                    onClick={() => setShowAutomation(!showAutomation)}
                                    data-testid="button-toggle-automation"
                                  >
                                    <Activity className="h-3 w-3 mr-1" />
                                    Auto
                                  </Button>
                                </div>
                              </div>
                              <div className="flex-1 bg-[#1a1a1a] relative timeline-container">
                                <Timeline
                                  currentTime={controller.transport.currentTime}
                                  loopEnabled={controller.transport.loopEnabled}
                                  loopStart={controller.transport.loopStart}
                                  loopEnd={controller.transport.loopEnd}
                                  duration={projectDuration}
                                  timeSignature={selectedProject?.timeSignature || '4/4'}
                                  tracks={displayTracks.map((t) => ({
                                    id: t.id,
                                    name: t.name,
                                    color: t.color || TRACK_COLORS[0],
                                  }))}
                                  trackClips={controller.trackClips}
                                  onTimelineClick={handleTimelineClick}
                                  onClipUpdate={handleClipUpdate}
                                  snapEnabled={true}
                                  snapInterval={0.25}
                                />
                              </div>
                            </div>

                            {/* Automation Lanes */}
                            {showAutomation && selectedTrack && (
                              <div className="flex">
                                <div className="w-64 bg-[#252525] border-r border-gray-700" />
                                <div className="flex-1">
                                  <AutomationLane
                                    trackId={selectedTrack}
                                    parameter={automationParameter}
                                    duration={projectDuration}
                                    onPointsChange={(points) => {
                                      logger.info('Automation points updated:', points);
                                    }}
                                  />
                                </div>
                              </div>
                            )}
                            <ScrollArea className="flex-1 track-list-container">
                              <TrackList
                                tracks={displayTracks}
                                trackClips={controller.trackClips}
                                mixBusses={mixBusses}
                                onTrackNameChange={handleTrackNameChange}
                                onMuteToggle={handleMuteToggle}
                                onSoloToggle={handleSoloToggle}
                                onVolumeChange={handleVolumeChange}
                                onTrackUpdate={handleTrackUpdate}
                                onDuplicateTrack={handleDuplicateTrack}
                                onDeleteTrack={handleDeleteTrack}
                                onAddTrack={handleAddTrack}
                                onReorderTracks={handleReorderTracks}
                              />
                            </ScrollArea>
                          </div>
                        ) : (
                          <div className="mixer-panel h-full">
                            <MixerPanel
                              tracks={displayTracks}
                              projectId={selectedProject?.id}
                              onMuteToggle={handleMuteToggle}
                              onSoloToggle={handleSoloToggle}
                              onVolumeChange={handleVolumeChange}
                              onPanChange={handlePanChange}
                              onMasterVolumeChange={handleMasterVolumeChange}
                            />
                          </div>
                        )}
                      </div>

                      {showLyricsPanel && (
                        <div
                          className="border-t border-gray-700 bg-[#1a1a1a] flex flex-col"
                          style={{ height: '200px' }}
                        >
                          <div className="h-8 bg-[#252525] border-b border-gray-700 flex items-center justify-between px-3">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-gray-400" />
                              <span className="text-xs font-semibold text-gray-400">LYRICS</span>
                              {selectedProject && (
                                <span className="text-xs text-gray-500">
                                  - {selectedProject.title}
                                </span>
                              )}
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 text-gray-400 hover:text-white"
                              onClick={() => setShowLyricsPanel(false)}
                              data-testid="button-close-lyrics-panel"
                            >
                              <ChevronDown className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="flex-1 p-3">
                            <Textarea
                              value={lyricsContent}
                              onChange={(e) => setLyricsContent(e.target.value)}
                              placeholder={
                                selectedProject
                                  ? 'Type or paste your lyrics here...'
                                  : 'Select a project to add lyrics'
                              }
                              className="w-full h-full bg-[#1a1a1a] border-gray-700 text-white resize-none focus-visible:ring-1 focus-visible:ring-gray-600 font-mono text-sm"
                              disabled={!selectedProject}
                              data-testid="textarea-lyrics"
                            />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </>
            }
            browser={
              browserVisible ? (
                <div className="browser-panel h-full">
                  <BrowserPanel />
                </div>
              ) : null
            }
            dock={
              <div className="transport-container">
                <TransportBar
                  armedTracksCount={displayTracks.filter((t) => t.armed).length}
                  onUndo={() => logger.info('Undo')}
                  onRedo={() => logger.info('Redo')}
                  canUndo={false}
                  canRedo={false}
                  onPlay={handlePlay}
                  onPause={handlePause}
                  onStop={handleStop}
                  onRecord={() =>
                    controller.transport.isRecording
                      ? controller.stopRecording()
                      : controller.startRecording()
                  }
                  onSeek={(time) => controller.seek(time)}
                />
              </div>
            }
            inspectorCollapsed={!inspectorVisible}
            browserCollapsed={!browserVisible}
          />

          <DialogContainerProvider value={isFullscreen ? dawContainerRef.current : null}>
            <Dialog open={isAIMixing} onOpenChange={setIsAIMixing}>
            <DialogContent className="bg-[#252525] border-gray-700 text-white">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-purple-400" />
                  AI Mixing Assistant
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-gray-300">
                  Max Booster AI will analyze and optimize your mix automatically:
                </p>
                <ul className="space-y-1 text-xs text-gray-400">
                  <li>• Automatic EQ balancing</li>
                  <li>• Dynamic range optimization</li>
                  <li>• Stereo field enhancement</li>
                  <li>• Frequency masking detection</li>
                </ul>
                <Button
                  className="w-full bg-purple-600 hover:bg-purple-700"
                  onClick={() => handleAIMix()}
                  disabled={
                    aiMix.currentState === 'requesting' || aiMix.currentState === 'processing'
                  }
                  data-testid="button-start-ai-mix"
                >
                  {aiMix.currentState === 'requesting' || aiMix.currentState === 'processing' ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {aiMix.currentState === 'requesting' ? 'Requesting...' : 'Mixing...'}
                    </>
                  ) : aiMix.currentState === 'success' ? (
                    'Mix Complete!'
                  ) : (
                    'Start AI Mix'
                  )}
                </Button>
                {aiMix.progress > 0 && aiMix.progress < 100 && (
                  <Progress value={aiMix.progress} className="mt-2 h-2" />
                )}
                {aiMix.currentState === 'error' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => retry('ai-mix', () => handleAIMix())}
                    className="mt-2"
                  >
                    <RotateCw className="w-3 h-3 mr-1" />
                    Retry
                  </Button>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isAIMastering} onOpenChange={setIsAIMastering}>
            <DialogContent className="bg-[#252525] border-gray-700 text-white">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-blue-400" />
                  AI Mastering Suite
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-gray-300">
                  Professional mastering with AI-powered optimization:
                </p>
                <ul className="space-y-1 text-xs text-gray-400">
                  <li>• Loudness optimization</li>
                  <li>• Frequency spectrum balancing</li>
                  <li>• Stereo enhancement</li>
                  <li>• Dynamic range control</li>
                </ul>
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  onClick={() => handleAIMaster()}
                  disabled={
                    aiMaster.currentState === 'requesting' || aiMaster.currentState === 'processing'
                  }
                  data-testid="button-start-ai-master"
                >
                  {aiMaster.currentState === 'requesting' ||
                  aiMaster.currentState === 'processing' ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {aiMaster.currentState === 'requesting' ? 'Requesting...' : 'Mastering...'}
                    </>
                  ) : aiMaster.currentState === 'success' ? (
                    'Master Complete!'
                  ) : (
                    'Start AI Master'
                  )}
                </Button>
                {aiMaster.progress > 0 && aiMaster.progress < 100 && (
                  <Progress value={aiMaster.progress} className="mt-2 h-2" />
                )}
                {aiMaster.currentState === 'error' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => retry('ai-master', () => handleAIMaster())}
                    className="mt-2"
                  >
                    <RotateCw className="w-3 h-3 mr-1" />
                    Retry
                  </Button>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={showAIAssistant} onOpenChange={setShowAIAssistant}>
            <DialogContent className="bg-[#252525] border-gray-700 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-cyan-400" />
                  AI Studio Assistant
                </DialogTitle>
              </DialogHeader>
              <AIAssistantPanel 
                projectId={selectedProject?.id}
                onApplyChanges={(changes) => {
                  logger.info('AI Assistant applied changes:', changes);
                  toast({
                    title: 'AI Changes Applied',
                    description: 'The AI Assistant has made improvements to your project.',
                  });
                }}
              />
            </DialogContent>
          </Dialog>

          <Dialog open={showAnalysisPanel} onOpenChange={setShowAnalysisPanel}>
            <DialogContent className="bg-[#252525] border-gray-700 text-white max-w-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-green-400" />
                  Audio Analysis Results
                </DialogTitle>
              </DialogHeader>

              {audioAnalysis.currentState === 'requesting' ||
              audioAnalysis.currentState === 'processing' ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <Loader2 className="h-12 w-12 text-green-400 animate-spin" />
                  <p className="text-sm text-gray-400">Analyzing audio features...</p>
                  <p className="text-xs text-gray-500">This may take a few moments</p>
                </div>
              ) : trackAnalysisData ? (
                <div className="space-y-6" data-testid="container-analysis-results">
                  <div className="flex items-center justify-between pb-2 border-b border-gray-700">
                    <p className="text-sm text-gray-400">
                      Last analyzed: {new Date(trackAnalysisData.analyzedAt).toLocaleString()}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAnalyzeAudio()}
                      disabled={
                        audioAnalysis.currentState === 'requesting' ||
                        audioAnalysis.currentState === 'processing'
                      }
                      data-testid="button-retry-analysis"
                    >
                      <Activity className="h-3 w-3 mr-1" />
                      Re-analyze
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Card className="bg-[#1a1a1a] border-gray-700 p-4">
                      <div className="space-y-2">
                        <Label className="text-xs text-gray-400">BPM</Label>
                        <div className="flex items-baseline gap-2">
                          <Badge
                            variant="secondary"
                            className="text-lg font-bold"
                            data-testid="badge-bpm"
                          >
                            {parseFloat(trackAnalysisData.bpm || '120').toFixed(1)}
                          </Badge>
                          <span className="text-xs text-gray-500">beats/min</span>
                        </div>
                      </div>
                    </Card>

                    <Card className="bg-[#1a1a1a] border-gray-700 p-4">
                      <div className="space-y-2">
                        <Label className="text-xs text-gray-400">Musical Key</Label>
                        <div className="flex items-baseline gap-2">
                          <Badge
                            variant="secondary"
                            className="text-lg font-bold"
                            data-testid="badge-key"
                          >
                            {trackAnalysisData.musicalKey || 'C'}{' '}
                            {trackAnalysisData.scale || 'major'}
                          </Badge>
                        </div>
                      </div>
                    </Card>

                    <Card className="bg-[#1a1a1a] border-gray-700 p-4">
                      <div className="space-y-2">
                        <Label className="text-xs text-gray-400">Duration</Label>
                        <div className="flex items-baseline gap-2">
                          <span className="text-lg font-bold" data-testid="text-duration">
                            {Math.floor((trackAnalysisData.durationSeconds || 0) / 60)}:
                            {String((trackAnalysisData.durationSeconds || 0) % 60).padStart(2, '0')}
                          </span>
                          <span className="text-xs text-gray-500">min:sec</span>
                        </div>
                      </div>
                    </Card>

                    <Card className="bg-[#1a1a1a] border-gray-700 p-4">
                      <div className="space-y-2">
                        <Label className="text-xs text-gray-400">Loudness</Label>
                        <div className="flex items-baseline gap-2">
                          <span className="text-lg font-bold" data-testid="text-loudness">
                            {(trackAnalysisData.loudnessLufs || -14).toFixed(1)}
                          </span>
                          <span className="text-xs text-gray-500">LUFS</span>
                        </div>
                      </div>
                    </Card>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label className="text-xs text-gray-400">Energy</Label>
                        <span className="text-xs font-medium" data-testid="text-energy-value">
                          {((trackAnalysisData.energy || 0.5) * 100).toFixed(0)}%
                        </span>
                      </div>
                      <Progress
                        value={(trackAnalysisData.energy || 0.5) * 100}
                        className="h-2"
                        data-testid="progress-energy"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label className="text-xs text-gray-400">Danceability</Label>
                        <span className="text-xs font-medium" data-testid="text-danceability-value">
                          {((trackAnalysisData.danceability || 0.5) * 100).toFixed(0)}%
                        </span>
                      </div>
                      <Progress
                        value={(trackAnalysisData.danceability || 0.5) * 100}
                        className="h-2"
                        data-testid="progress-danceability"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label className="text-xs text-gray-400">Valence (Positivity)</Label>
                        <span className="text-xs font-medium" data-testid="text-valence-value">
                          {((trackAnalysisData.valence || 0.5) * 100).toFixed(0)}%
                        </span>
                      </div>
                      <Progress
                        value={(trackAnalysisData.valence || 0.5) * 100}
                        className="h-2"
                        data-testid="progress-valence"
                      />
                    </div>

                    <Card className="bg-[#1a1a1a] border-gray-700 p-4">
                      <div className="space-y-2">
                        <Label className="text-xs text-gray-400">
                          Spectral Centroid (Brightness)
                        </Label>
                        <div className="flex items-baseline gap-2">
                          <span className="text-lg font-bold" data-testid="text-spectral-centroid">
                            {((trackAnalysisData.spectralCentroid || 1500) / 1000).toFixed(2)}
                          </span>
                          <span className="text-xs text-gray-500">kHz</span>
                        </div>
                        <p className="text-xs text-gray-500">
                          {(trackAnalysisData.spectralCentroid || 1500) > 2000
                            ? 'Bright, high-frequency content'
                            : 'Warm, low-frequency content'}
                        </p>
                      </div>
                    </Card>
                  </div>
                </div>
              ) : (
                <div
                  className="flex flex-col items-center justify-center py-12 space-y-4"
                  data-testid="container-no-analysis"
                >
                  <Activity className="h-12 w-12 text-gray-600" />
                  <p className="text-sm text-gray-400">No analysis data available</p>
                  <Button
                    onClick={() => handleAnalyzeAudio()}
                    disabled={
                      !selectedProject ||
                      tracks.length === 0 ||
                      audioAnalysis.currentState === 'requesting' ||
                      audioAnalysis.currentState === 'processing'
                    }
                    data-testid="button-start-analysis"
                  >
                    {audioAnalysis.currentState === 'requesting' ||
                    audioAnalysis.currentState === 'processing' ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {audioAnalysis.currentState === 'requesting'
                          ? 'Requesting...'
                          : 'Analyzing...'}
                      </>
                    ) : (
                      <>
                        <Activity className="h-4 w-4 mr-2" />
                        Analyze Now
                      </>
                    )}
                  </Button>
                </div>
              )}

              {audioAnalysis.currentState === 'error' && (
                <Card
                  className="bg-red-900/20 border-red-700 p-4"
                  data-testid="card-analysis-error"
                >
                  <div className="flex items-start gap-3">
                    <X className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="space-y-2 flex-1">
                      <p className="text-sm text-red-400 font-medium">Analysis Failed</p>
                      <p className="text-xs text-gray-400">
                        {audioAnalysis.errorMessage || 'An error occurred during analysis'}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAnalyzeAudio()}
                          disabled={audioAnalysis.retryCount >= 3}
                          className="mt-2"
                          data-testid="button-retry-after-error"
                        >
                          <RotateCw className="h-3 w-3 mr-1" />
                          {audioAnalysis.retryCount >= 3
                            ? 'Max retries'
                            : `Try Again (${audioAnalysis.retryCount}/3)`}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => reset('audio-analysis')}
                          className="mt-2"
                          data-testid="button-reset-analysis"
                        >
                          Reset
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {audioAnalysis.progress > 0 && audioAnalysis.progress < 100 && !showAnalysisPanel && (
                <Card
                  className="bg-blue-900/20 border-blue-700 p-4 mt-4"
                  data-testid="card-analysis-progress"
                >
                  <div className="space-y-2">
                    <p className="text-sm text-blue-400">Analyzing Audio...</p>
                    <Progress value={audioAnalysis.progress} className="h-2" />
                    <p className="text-xs text-gray-400">
                      {Math.round(audioAnalysis.progress)}% complete
                    </p>
                  </div>
                </Card>
              )}
            </DialogContent>
          </Dialog>

          <DistributionDialog
            open={showDistributionDialog}
            onOpenChange={setShowDistributionDialog}
            projectId={selectedProject?.id || ''}
            projectName={selectedProject?.name || 'Untitled'}
            tracks={tracks}
          />

          <ExportDialog
            open={showExportDialog}
            onOpenChange={setShowExportDialog}
            exportFormat={exportFormat}
            setExportFormat={setExportFormat}
            exportType={exportType}
            setExportType={setExportType}
            exportSampleRate={exportSampleRate}
            setExportSampleRate={setExportSampleRate}
            exportBitDepth={exportBitDepth}
            setExportBitDepth={setExportBitDepth}
            exportBitrate={exportBitrate}
            setExportBitrate={setExportBitrate}
            exportNormalize={exportNormalize}
            setExportNormalize={setExportNormalize}
            exportDither={exportDither}
            setExportDither={setExportDither}
            onExport={() => exportProjectMutation.mutate()}
            isExporting={exportProjectMutation.isPending}
          />

          <StemExportDialog
            open={showStemExportDialog}
            onOpenChange={setShowStemExportDialog}
            projectId={selectedProject?.id?.toString() || null}
          />

          <AIGeneratorDialog
            open={showAIGeneratorDialog}
            onOpenChange={setShowAIGeneratorDialog}
            projectId={selectedProject?.id}
            onAddToProject={handleAddGeneration}
          />

          <ConversionDialog
            open={showConversionDialog}
            onOpenChange={setShowConversionDialog}
            projectId={selectedProject?.id || null}
            availableFiles={recentFiles.map((f: unknown) => ({
              path: f.path || f.filePath || '',
              name: f.name || '',
              size: f.size || f.fileSize || 0,
            }))}
          />

          {routingMatrixVisible && (
            <RoutingMatrix
              tracks={displayTracks.map((t) => ({
                id: t.id,
                name: t.name,
                color: t.color,
                type: t.trackType,
              }))}
              buses={mixBuses.map((b) => ({
                id: b.id,
                name: b.name,
                color: b.color,
              }))}
              onClose={toggleRoutingMatrix}
            />
          )}

          <Dialog open={showAddTrackDialog} onOpenChange={setShowAddTrackDialog}>
            <DialogContent className="bg-[#252525] border-gray-700 text-white">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5 text-green-400" />
                  Add Track
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Track Type</Label>
                  <Select
                    value={newTrackType}
                    onValueChange={(val: 'audio' | 'midi' | 'instrument') => setNewTrackType(val)}
                  >
                    <SelectTrigger
                      className="bg-[#1a1a1a] border-gray-700"
                      data-testid="select-track-type"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#252525] border-gray-700">
                      <SelectItem value="audio">Audio Track</SelectItem>
                      <SelectItem value="midi">MIDI Track</SelectItem>
                      <SelectItem value="instrument">Instrument Track</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Track Name (optional)</Label>
                  <Input
                    placeholder={`${newTrackType.charAt(0).toUpperCase() + newTrackType.slice(1)} ${(tracks.length || 0) + 1}`}
                    value={newTrackName}
                    onChange={(e) => setNewTrackName(e.target.value)}
                    className="bg-[#1a1a1a] border-gray-700"
                    data-testid="input-new-track-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Track Color</Label>
                  <div className="grid grid-cols-5 gap-2">
                    {TRACK_COLORS.map((color) => (
                      <button
                        key={color}
                        className={`h-8 w-8 rounded cursor-pointer border-2 transition-all ${newTrackColor === color ? 'border-white scale-110' : 'border-transparent'}`}
                        style={{ backgroundColor: color }}
                        onClick={() => setNewTrackColor(color)}
                        data-testid={`color-${color}`}
                      />
                    ))}
                  </div>
                </div>
                <Button
                  className="w-full bg-green-600 hover:bg-green-700"
                  onClick={async () => {
                    if (!selectedProject) return;
                    try {
                      const trackNumber = (controller.tracks.length || 0) + 1;
                      const defaultName = `${newTrackType.charAt(0).toUpperCase() + newTrackType.slice(1)} ${trackNumber}`;

                      await controller.createTrack({
                        projectId: selectedProject.id.toString(),
                        name: newTrackName || defaultName,
                        trackType: newTrackType,
                        trackNumber,
                        volume: 0.8,
                        pan: 0,
                        mute: false,
                        solo: false,
                        armed: false,
                        recordEnabled: false,
                        inputMonitoring: false,
                        color: newTrackColor,
                        height: 100,
                        collapsed: false,
                        outputBus: 'master',
                      });

                      setShowAddTrackDialog(false);
                      setNewTrackName('');
                      setNewTrackColor(
                        TRACK_COLORS[Math.floor(Math.random() * TRACK_COLORS.length)]
                      );
                      toast({ title: 'Track added successfully' });
                    } catch (error: unknown) {
                      logger.error('Error adding track:', error);
                      toast({
                        title: 'Failed to add track',
                        description: 'An error occurred while adding the track.',
                        variant: 'destructive',
                      });
                    }
                  }}
                  disabled={controller.isCreatingTrack}
                  data-testid="button-confirm-add-track"
                >
                  {controller.isCreatingTrack ? 'Adding...' : 'Add Track'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={showAddBusDialog} onOpenChange={setShowAddBusDialog}>
            <DialogContent className="bg-[#252525] border-gray-700 text-white">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <MonitorSpeaker className="h-5 w-5 text-blue-400" />
                  Create Mix Bus
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Bus Name</Label>
                  <Input
                    placeholder="Bus A"
                    value={newBusName}
                    onChange={(e) => setNewBusName(e.target.value)}
                    className="bg-[#1a1a1a] border-gray-700"
                    data-testid="input-new-bus-name"
                  />
                </div>
                <div className="pt-2 text-xs text-gray-400">
                  <p>
                    Mix buses allow you to group multiple tracks together for processing and
                    routing.
                  </p>
                </div>
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  onClick={() => createMixBusMutation.mutate()}
                  disabled={createMixBusMutation.isPending || !newBusName}
                  data-testid="button-confirm-add-bus"
                >
                  {createMixBusMutation.isPending ? 'Creating...' : 'Create Bus'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          </DialogContainerProvider>

          {showTutorial && (
            <StudioTutorial
              onComplete={() => setShowTutorial(false)}
              onSkip={() => setShowTutorial(false)}
            />
          )}
        </div>
      )}
    </AppLayout>
  );
}
