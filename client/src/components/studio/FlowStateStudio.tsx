import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Pause,
  Square,
  Circle,
  SkipBack,
  SkipForward,
  Repeat,
  Volume2,
  Headphones,
  Settings,
  Wand2,
  Sparkles,
  Brain,
  Layers,
  Music,
  Mic,
  Scissors,
  Copy,
  Trash2,
  Undo,
  Redo,
  Save,
  Download,
  Share2,
  Maximize2,
  Grid3X3,
  Zap,
  TrendingUp,
  Clock,
  ChevronRight,
  X,
  PanelRightOpen,
  PanelRightClose,
  Waves,
  Timer,
  Flag,
  GitBranch,
  FolderOpen,
  MoreHorizontal,
} from 'lucide-react';
import './FlowStateTheme.css';
import { FlowStateAISidebar } from './FlowStateAISidebar';
import { FlowStateSmartToolbar } from './FlowStateSmartToolbar';
import { FlowStateSpatialVisualizer } from './FlowStateSpatialVisualizer';
import { FlowStateTrackList } from './FlowStateTrackList';
import { FlowStateMixer } from './FlowStateMixer';
import { FlowStateSpectralEditor } from './FlowStateSpectralEditor';
import { FlowStateAudioWarp } from './FlowStateAudioWarp';
import { FlowStateTakeComping } from './FlowStateTakeComping';
import { FlowStateSampleBrowser } from './FlowStateSampleBrowser';
import { FlowStateArrangementMarkers } from './FlowStateArrangementMarkers';
import { FlowStateSidechainVisualizer } from './FlowStateSidechainVisualizer';
import { FlowStateBeatSlicer } from './FlowStateBeatSlicer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';

interface FlowStateStudioProps {
  projectId?: string;
  projectName?: string;
  onSave?: () => void;
  onExport?: () => void;
}

export function FlowStateStudio({ 
  projectId, 
  projectName = 'Untitled Project',
  onSave,
  onExport 
}: FlowStateStudioProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [bpm, setBpm] = useState(120);
  const [showAISidebar, setShowAISidebar] = useState(true);
  const [showMixer, setShowMixer] = useState(false);
  const [showSpatialViz, setShowSpatialViz] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  
  // Advanced tool panels
  const [activePanel, setActivePanel] = useState<string | null>(null);
  
  const togglePanel = (panel: string) => {
    setActivePanel(prev => prev === panel ? null : panel);
  };
  
  const [tracks, setTracks] = useState([
    { id: '1', name: 'Drums', type: 'audio' as const, color: '#f43f5e', volume: 0.8, pan: 0, mute: false, solo: false, armed: false },
    { id: '2', name: 'Bass', type: 'audio' as const, color: '#8b5cf6', volume: 0.75, pan: 0, mute: false, solo: false, armed: false },
    { id: '3', name: 'Lead Synth', type: 'midi' as const, color: '#22d3ee', volume: 0.7, pan: 0.1, mute: false, solo: false, armed: false },
    { id: '4', name: 'Vocals', type: 'audio' as const, color: '#f97316', volume: 0.85, pan: 0, mute: false, solo: false, armed: false },
    { id: '5', name: 'Pad', type: 'midi' as const, color: '#10b981', volume: 0.6, pan: -0.2, mute: false, solo: false, armed: false },
  ]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const formatBars = (seconds: number) => {
    const beatsPerSecond = bpm / 60;
    const totalBeats = seconds * beatsPerSecond;
    const bars = Math.floor(totalBeats / 4) + 1;
    const beats = Math.floor(totalBeats % 4) + 1;
    const ticks = Math.floor((totalBeats % 1) * 4);
    return `${bars}.${beats}.${ticks}`;
  };

  useEffect(() => {
    let animationId: number;
    let lastTime = performance.now();
    
    const updateTime = (currentAnimTime: number) => {
      if (!isPlaying) return;
      
      const deltaTime = (currentAnimTime - lastTime) / 1000;
      lastTime = currentAnimTime;
      setCurrentTime(prev => prev + deltaTime);
      animationId = requestAnimationFrame(updateTime);
    };
    
    if (isPlaying) {
      lastTime = performance.now();
      animationId = requestAnimationFrame(updateTime);
    }
    
    return () => {
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [isPlaying]);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleStop = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleRecord = () => {
    setIsRecording(!isRecording);
    if (!isRecording) {
      setIsPlaying(true);
    }
  };

  const contextActions = useMemo(() => {
    if (selectedClipId) {
      return [
        { id: 'split', icon: Scissors, label: 'Split', suggested: true },
        { id: 'duplicate', icon: Copy, label: 'Duplicate' },
        { id: 'delete', icon: Trash2, label: 'Delete' },
        { id: 'stems', icon: Layers, label: 'Separate Stems', suggested: true },
      ];
    }
    if (selectedTrackId) {
      return [
        { id: 'record', icon: Mic, label: 'Record' },
        { id: 'ai-generate', icon: Wand2, label: 'AI Generate', suggested: true },
        { id: 'effects', icon: Sparkles, label: 'Add Effects' },
        { id: 'automate', icon: TrendingUp, label: 'Automate' },
      ];
    }
    return [
      { id: 'add-track', icon: Music, label: 'Add Track' },
      { id: 'import', icon: Download, label: 'Import Audio' },
      { id: 'ai-compose', icon: Brain, label: 'AI Compose', suggested: true },
      { id: 'templates', icon: Grid3X3, label: 'Templates' },
    ];
  }, [selectedClipId, selectedTrackId]);

  return (
    <div className="flowstate-studio flex flex-col h-screen">
      {/* Top Bar */}
      <header className="flow-transport">
        {/* Project Info */}
        <div className="flex items-center gap-3 min-w-[200px]">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <Music className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">{projectName}</div>
            <div className="text-xs text-slate-400">Saved 2 min ago</div>
          </div>
        </div>

        {/* Transport Controls */}
        <div className="flow-transport-controls">
          <button className="flow-transport-btn" onClick={() => setCurrentTime(0)}>
            <SkipBack className="w-5 h-5" />
          </button>
          
          <button 
            className={`flow-transport-btn ${isPlaying ? 'active' : ''}`}
            onClick={handlePlayPause}
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          
          <button className="flow-transport-btn" onClick={handleStop}>
            <Square className="w-5 h-5" />
          </button>
          
          <button 
            className={`flow-transport-btn ${isRecording ? 'record' : ''}`}
            onClick={handleRecord}
          >
            <Circle className="w-5 h-5" fill={isRecording ? 'currentColor' : 'none'} />
          </button>
          
          <button 
            className={`flow-transport-btn ${isLooping ? 'active' : ''}`}
            onClick={() => setIsLooping(!isLooping)}
          >
            <Repeat className="w-5 h-5" />
          </button>
        </div>

        {/* Time Display */}
        <div className="flex items-center gap-4">
          <div className="flow-time-display">
            {formatTime(currentTime)}
          </div>
          <div className="flow-bpm-display">
            <div className="flow-bpm-value">{bpm}</div>
            <div className="flow-bpm-label">BPM</div>
          </div>
          <div className="text-xs text-slate-500 font-mono">
            {formatBars(currentTime)}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2 ml-auto">
          <button className="flow-btn-ghost p-2 rounded-lg hover:bg-white/5">
            <Undo className="w-4 h-4 text-slate-400" />
          </button>
          <button className="flow-btn-ghost p-2 rounded-lg hover:bg-white/5">
            <Redo className="w-4 h-4 text-slate-400" />
          </button>
          
          <div className="w-px h-6 bg-white/10 mx-2" />
          
          <button 
            className={`flow-btn-ghost p-2 rounded-lg hover:bg-white/5 ${showSpatialViz ? 'text-cyan-400' : 'text-slate-400'}`}
            onClick={() => setShowSpatialViz(!showSpatialViz)}
          >
            <Headphones className="w-4 h-4" />
          </button>
          
          <button 
            className={`flow-btn-ghost p-2 rounded-lg hover:bg-white/5 ${showMixer ? 'text-indigo-400' : 'text-slate-400'}`}
            onClick={() => setShowMixer(!showMixer)}
          >
            <Layers className="w-4 h-4" />
          </button>
          
          {/* Advanced Tools Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button 
                className={`flow-btn-ghost p-2 rounded-lg hover:bg-white/5 ${activePanel ? 'text-orange-400' : 'text-slate-400'}`}
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-zinc-900 border-zinc-700">
              <DropdownMenuLabel className="text-zinc-400">Advanced Tools</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-zinc-700" />
              <DropdownMenuItem 
                className={`cursor-pointer ${activePanel === 'spectral' ? 'bg-indigo-500/20 text-indigo-400' : ''}`}
                onClick={() => togglePanel('spectral')}
              >
                <Waves className="w-4 h-4 mr-2" />
                Spectral Editor
              </DropdownMenuItem>
              <DropdownMenuItem 
                className={`cursor-pointer ${activePanel === 'warp' ? 'bg-amber-500/20 text-amber-400' : ''}`}
                onClick={() => togglePanel('warp')}
              >
                <Timer className="w-4 h-4 mr-2" />
                Audio Warp
              </DropdownMenuItem>
              <DropdownMenuItem 
                className={`cursor-pointer ${activePanel === 'comping' ? 'bg-purple-500/20 text-purple-400' : ''}`}
                onClick={() => togglePanel('comping')}
              >
                <Layers className="w-4 h-4 mr-2" />
                Take Comping
              </DropdownMenuItem>
              <DropdownMenuItem 
                className={`cursor-pointer ${activePanel === 'samples' ? 'bg-teal-500/20 text-teal-400' : ''}`}
                onClick={() => togglePanel('samples')}
              >
                <FolderOpen className="w-4 h-4 mr-2" />
                Sample Browser
              </DropdownMenuItem>
              <DropdownMenuItem 
                className={`cursor-pointer ${activePanel === 'markers' ? 'bg-red-500/20 text-red-400' : ''}`}
                onClick={() => togglePanel('markers')}
              >
                <Flag className="w-4 h-4 mr-2" />
                Arrangement Markers
              </DropdownMenuItem>
              <DropdownMenuItem 
                className={`cursor-pointer ${activePanel === 'sidechain' ? 'bg-pink-500/20 text-pink-400' : ''}`}
                onClick={() => togglePanel('sidechain')}
              >
                <GitBranch className="w-4 h-4 mr-2" />
                Sidechain Visualizer
              </DropdownMenuItem>
              <DropdownMenuItem 
                className={`cursor-pointer ${activePanel === 'slicer' ? 'bg-orange-500/20 text-orange-400' : ''}`}
                onClick={() => togglePanel('slicer')}
              >
                <Scissors className="w-4 h-4 mr-2" />
                Beat Slicer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <div className="w-px h-6 bg-white/10 mx-2" />
          
          <button className="flow-btn-ghost p-2 rounded-lg hover:bg-white/5" onClick={onSave}>
            <Save className="w-4 h-4 text-slate-400" />
          </button>
          
          <button className="flow-btn-ghost p-2 rounded-lg hover:bg-white/5" onClick={onExport}>
            <Share2 className="w-4 h-4 text-slate-400" />
          </button>
          
          <button 
            className={`flow-btn-ghost p-2 rounded-lg hover:bg-white/5 ${showAISidebar ? 'text-purple-400' : 'text-slate-400'}`}
            onClick={() => setShowAISidebar(!showAISidebar)}
          >
            {showAISidebar ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Timeline & Tracks */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Spatial Visualizer */}
          <AnimatePresence>
            {showSpatialViz && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 200, opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <FlowStateSpatialVisualizer tracks={tracks} isPlaying={isPlaying} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Timeline Ruler */}
          <div className="flow-timeline-ruler px-[200px]">
            {Array.from({ length: 20 }, (_, i) => (
              <div 
                key={i} 
                className="flow-timeline-marker"
                style={{ width: `${100 * zoom}px` }}
              >
                {i + 1}
              </div>
            ))}
          </div>

          {/* Tracks */}
          <FlowStateTrackList
            tracks={tracks}
            selectedTrackId={selectedTrackId}
            onSelectTrack={setSelectedTrackId}
            onUpdateTrack={(id, updates) => {
              setTracks(tracks.map(t => t.id === id ? { ...t, ...updates } : t));
            }}
            currentTime={currentTime}
            zoom={zoom}
            isPlaying={isPlaying}
          />

          {/* Mixer Panel */}
          <AnimatePresence>
            {showMixer && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 280, opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="border-t border-white/5 overflow-hidden"
              >
                <FlowStateMixer tracks={tracks} onUpdateTrack={(id, updates) => {
                  setTracks(tracks.map(t => t.id === id ? { ...t, ...updates } : t));
                }} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Advanced Tools Panel */}
          <AnimatePresence>
            {activePanel && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 450, opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="border-t border-white/5 overflow-hidden"
              >
                {activePanel === 'spectral' && <FlowStateSpectralEditor />}
                {activePanel === 'warp' && <FlowStateAudioWarp />}
                {activePanel === 'comping' && <FlowStateTakeComping />}
                {activePanel === 'samples' && <FlowStateSampleBrowser />}
                {activePanel === 'markers' && (
                  <FlowStateArrangementMarkers 
                    currentTime={currentTime}
                    onSeekToMarker={(time) => setCurrentTime(time)}
                  />
                )}
                {activePanel === 'sidechain' && <FlowStateSidechainVisualizer />}
                {activePanel === 'slicer' && <FlowStateBeatSlicer bpm={bpm} />}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* AI Sidebar */}
        <AnimatePresence>
          {showAISidebar && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <FlowStateAISidebar 
                selectedTrackId={selectedTrackId}
                selectedClipId={selectedClipId}
                tracks={tracks}
                currentTime={currentTime}
                bpm={bpm}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Smart Context Toolbar */}
      <FlowStateSmartToolbar actions={contextActions} />
    </div>
  );
}
