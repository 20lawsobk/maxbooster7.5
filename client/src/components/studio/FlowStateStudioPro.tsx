import { useState, useCallback, useMemo, useEffect } from 'react';
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
  Settings,
  Wand2,
  Sparkles,
  Brain,
  Layers,
  Music,
  Mic,
  Scissors,
  Undo,
  Redo,
  Save,
  Download,
  Grid3X3,
  Zap,
  Clock,
  ChevronRight,
  PanelRightOpen,
  PanelRightClose,
  Box,
  Sliders,
  Activity,
  Target,
  Gauge,
  Palette,
  Radio,
  Keyboard,
  MousePointer,
  Move,
  Pencil,
  Eraser,
} from 'lucide-react';
import './FlowStateTheme.css';
import { useFlowStateAdapter, type FlowStateMode } from '@/hooks/useFlowStateAdapter';
import { FlowState3DWorkspace } from './FlowState3DWorkspace';
import { FlowStateAIPanel } from './FlowStateAIPanel';
import { FlowStateSmartToolbar } from './FlowStateSmartToolbar';
import { FlowStateMixer } from './FlowStateMixer';
import { FlowStateSpectralVisualizer } from './FlowStateSpectralVisualizer';
import { FlowStateCollaborationPresence, useCollaborationPresence } from './FlowStateCollaborationPresence';
import { FlowStatePluginChain, type PluginNode } from './FlowStatePluginChain';
import { AIGeneratorDialog } from './AIGeneratorDialog';
import { cn } from '@/lib/utils';

interface FlowStateStudioProProps {
  projectId: string | null;
  projectName?: string;
  onSave?: () => void;
  onExport?: () => void;
  onAIMix?: () => void;
  onAIMaster?: () => void;
  isAIMixing?: boolean;
  isAIMastering?: boolean;
}

const MODE_CONFIG: Record<FlowStateMode, { label: string; icon: typeof Music; color: string; description: string }> = {
  create: { label: 'Create', icon: Sparkles, color: 'from-purple-500 to-pink-500', description: 'Compose & arrange' },
  record: { label: 'Record', icon: Mic, color: 'from-red-500 to-orange-500', description: 'Capture performance' },
  mix: { label: 'Mix', icon: Sliders, color: 'from-blue-500 to-cyan-500', description: 'Balance & process' },
  master: { label: 'Master', icon: Gauge, color: 'from-amber-500 to-yellow-500', description: 'Finalize & polish' },
  perform: { label: 'Perform', icon: Radio, color: 'from-green-500 to-emerald-500', description: 'Live session' },
};

const EDIT_TOOLS = [
  { id: 'pointer', icon: MousePointer, label: 'Select' },
  { id: 'range', icon: Move, label: 'Range' },
  { id: 'draw', icon: Pencil, label: 'Draw' },
  { id: 'split', icon: Scissors, label: 'Split' },
  { id: 'erase', icon: Eraser, label: 'Erase' },
];

export function FlowStateStudioPro({
  projectId,
  projectName = 'Untitled Project',
  onSave,
  onExport,
  onAIMix,
  onAIMaster,
  isAIMixing = false,
  isAIMastering = false,
}: FlowStateStudioProProps) {
  const adapter = useFlowStateAdapter(projectId);
  const { tracks, transport, context, suggestions } = adapter;
  const collaboration = useCollaborationPresence(projectId);

  const [showAIPanel, setShowAIPanel] = useState(true);
  const [showMixer, setShowMixer] = useState(false);
  const [showPluginChain, setShowPluginChain] = useState(false);
  const [show3DWorkspace, setShow3DWorkspace] = useState(false);
  const [showSpectralVisualizer, setShowSpectralVisualizer] = useState(false);
  const [showAIGeneratorDialog, setShowAIGeneratorDialog] = useState(false);
  const [activeTool, setActiveTool] = useState('pointer');
  const [chromeVisible, setChromeVisible] = useState(true);
  const [masterPlugins, setMasterPlugins] = useState<PluginNode[]>([]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          transport.isPlaying ? adapter.pause() : adapter.play();
          break;
        case 'KeyR':
          if (!e.metaKey && !e.ctrlKey) {
            adapter.record();
          }
          break;
        case 'KeyL':
          adapter.toggleLoop();
          break;
        case 'KeyM':
          if (context.selectedTrackIds[0]) {
            adapter.toggleTrackMute(context.selectedTrackIds[0]);
          }
          break;
        case 'KeyS':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            onSave?.();
          } else if (context.selectedTrackIds[0]) {
            adapter.toggleTrackSolo(context.selectedTrackIds[0]);
          }
          break;
        case 'Home':
          adapter.seek(0);
          break;
        case 'Tab':
          e.preventDefault();
          setChromeVisible(prev => !prev);
          break;
        case 'Digit1':
        case 'Digit2':
        case 'Digit3':
        case 'Digit4':
        case 'Digit5':
          const modeIndex = parseInt(e.code.replace('Digit', '')) - 1;
          const modes: FlowStateMode[] = ['create', 'record', 'mix', 'master', 'perform'];
          if (modes[modeIndex]) {
            adapter.setMode(modes[modeIndex]);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [adapter, transport, context, onSave]);

  useEffect(() => {
    const selectedTrack = context.selectedTrackIds[0] || null;
    collaboration.setCurrentTrack(selectedTrack);
  }, [context.selectedTrackIds, collaboration]);

  useEffect(() => {
    collaboration.setRecordingStatus(transport.isRecording);
  }, [transport.isRecording, collaboration]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    collaboration.updateCursorPosition(e.clientX, e.clientY);
  }, [collaboration]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const formatBars = (seconds: number) => {
    const beatsPerSecond = transport.tempo / 60;
    const totalBeats = seconds * beatsPerSecond;
    const bars = Math.floor(totalBeats / 4) + 1;
    const beats = Math.floor(totalBeats % 4) + 1;
    const ticks = Math.floor((totalBeats % 1) * 4);
    return `${bars}.${beats}.${ticks}`;
  };

  const currentModeConfig = MODE_CONFIG[context.mode];

  const handleTrackVolumeChange = useCallback((trackId: string, volume: number) => {
    adapter.setTrackVolume(trackId, volume);
  }, [adapter]);

  const handleTrackPanChange = useCallback((trackId: string, pan: number) => {
    adapter.setTrackPan(trackId, pan);
  }, [adapter]);

  const handleTrackMuteToggle = useCallback((trackId: string) => {
    adapter.toggleTrackMute(trackId);
  }, [adapter]);

  const handleTrackSoloToggle = useCallback((trackId: string) => {
    adapter.toggleTrackSolo(trackId);
  }, [adapter]);

  return (
    <div
      className="flowstate-studio h-screen w-full flex flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white overflow-hidden relative"
      onMouseMove={handleMouseMove}
    >
      <FlowStateCollaborationPresence
        collaborators={collaboration.collaborators}
        currentUserId="current-user"
        isConnected={collaboration.isConnected}
        onInvite={() => console.log('Invite collaborators')}
        onReconnect={() => collaboration.reconnect()}
      />

      <AnimatePresence>
        {showSpectralVisualizer && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute top-20 left-1/2 -translate-x-1/2 z-40"
          >
            <FlowStateSpectralVisualizer
              audioContext={null}
              analyserNode={null}
              isPlaying={transport.isPlaying}
              width={400}
              height={180}
              mode="spectrum"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {chromeVisible && (
          <motion.header
            initial={{ y: -60 }}
            animate={{ y: 0 }}
            exit={{ y: -60 }}
            className="h-14 flex-shrink-0 border-b border-white/5 bg-black/30 backdrop-blur-xl flex items-center px-4 gap-4"
          >
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${currentModeConfig.color} flex items-center justify-center`}>
                <currentModeConfig.icon className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-semibold text-white">{projectName}</h1>
                <p className="text-[10px] text-white/50">{currentModeConfig.label} Mode</p>
              </div>
            </div>

            <div className="flex-1 flex justify-center">
              <div className="flex items-center gap-1 bg-black/40 rounded-full p-1 border border-white/5">
                {(Object.entries(MODE_CONFIG) as [FlowStateMode, typeof currentModeConfig][]).map(([mode, config]) => (
                  <motion.button
                    key={mode}
                    onClick={() => adapter.setMode(mode)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5",
                      context.mode === mode
                        ? `bg-gradient-to-r ${config.color} text-white shadow-lg`
                        : "text-white/50 hover:text-white hover:bg-white/5"
                    )}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <config.icon className="w-3 h-3" />
                    {config.label}
                  </motion.button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <motion.button
                onClick={() => setShow3DWorkspace(!show3DWorkspace)}
                className={cn(
                  "p-2 rounded-lg transition-all",
                  show3DWorkspace
                    ? "bg-indigo-600 text-white"
                    : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                )}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                title="3D Workspace"
              >
                <Box className="w-4 h-4" />
              </motion.button>

              <motion.button
                onClick={() => setShowSpectralVisualizer(!showSpectralVisualizer)}
                className={cn(
                  "p-2 rounded-lg transition-all",
                  showSpectralVisualizer
                    ? "bg-cyan-600 text-white"
                    : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                )}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                title="Spectral Visualizer"
              >
                <Activity className="w-4 h-4" />
              </motion.button>
              
              <motion.button
                onClick={() => setShowMixer(!showMixer)}
                className={cn(
                  "p-2 rounded-lg transition-all",
                  showMixer
                    ? "bg-indigo-600 text-white"
                    : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                )}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                title="Mixer"
              >
                <Sliders className="w-4 h-4" />
              </motion.button>
              
              <motion.button
                onClick={() => setShowPluginChain(!showPluginChain)}
                className={cn(
                  "p-2 rounded-lg transition-all",
                  showPluginChain
                    ? "bg-amber-600 text-white"
                    : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                )}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                title="Plugin Chain"
              >
                <Layers className="w-4 h-4" />
              </motion.button>
              
              <motion.button
                onClick={() => setShowAIPanel(!showAIPanel)}
                className={cn(
                  "p-2 rounded-lg transition-all",
                  showAIPanel
                    ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white"
                    : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                )}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Brain className="w-4 h-4" />
              </motion.button>

              <div className="w-px h-6 bg-white/10" />

              <motion.button
                onClick={onSave}
                className="p-2 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Save className="w-4 h-4" />
              </motion.button>
              
              <motion.button
                onClick={onExport}
                className="p-2 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Download className="w-4 h-4" />
              </motion.button>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      <div className="flex-1 flex overflow-hidden">
        <AnimatePresence>
          {chromeVisible && (
            <motion.div
              initial={{ x: -60 }}
              animate={{ x: 0 }}
              exit={{ x: -60 }}
              className="w-14 flex-shrink-0 border-r border-white/5 bg-black/20 flex flex-col items-center py-3 gap-1"
            >
              {EDIT_TOOLS.map((tool) => (
                <motion.button
                  key={tool.id}
                  onClick={() => setActiveTool(tool.id)}
                  className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center transition-all",
                    activeTool === tool.id
                      ? "bg-indigo-600 text-white"
                      : "text-white/50 hover:bg-white/5 hover:text-white"
                  )}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  title={tool.label}
                >
                  <tool.icon className="w-4 h-4" />
                </motion.button>
              ))}

              <div className="flex-1" />

              <motion.button
                className="w-10 h-10 rounded-lg flex items-center justify-center text-white/50 hover:bg-white/5 hover:text-white"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Settings className="w-4 h-4" />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 flex flex-col overflow-hidden">
          {show3DWorkspace ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1"
            >
              <FlowState3DWorkspace
                tracks={tracks}
                isPlaying={transport.isPlaying}
                currentTime={transport.currentTime}
                onTrackSelect={(trackId) => adapter.selectTrack(trackId)}
                selectedTrackIds={context.selectedTrackIds}
              />
            </motion.div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              <FlowStateSmartToolbar
                selectionType={context.selectionType}
                selectedTrackId={context.selectedTrackIds[0] || null}
                selectedClipId={context.selectedClipIds[0] || null}
                onAction={(action) => console.log('Toolbar action:', action)}
              />

              <div className="flex-1 bg-gradient-to-b from-slate-900/50 to-slate-950/50 overflow-hidden relative">
                <div className="absolute inset-0 overflow-auto">
                  <div className="min-w-full min-h-full p-4">
                    {tracks.length === 0 ? (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-center text-white/50">
                          <Music className="w-12 h-12 mx-auto mb-4 opacity-30" />
                          <p className="text-lg font-medium">No tracks yet</p>
                          <p className="text-sm mt-1">Create or import tracks to get started</p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {tracks.map((track) => (
                          <motion.div
                            key={track.id}
                            onClick={() => adapter.selectTrack(track.id)}
                            className={cn(
                              "h-24 rounded-xl border transition-all cursor-pointer",
                              context.selectedTrackIds.includes(track.id)
                                ? "border-indigo-500 bg-indigo-500/10"
                                : "border-white/5 bg-white/[0.02] hover:bg-white/[0.05]"
                            )}
                            whileHover={{ scale: 1.005 }}
                            layout
                          >
                            <div className="h-full flex items-center px-4 gap-4">
                              <div
                                className="w-3 h-16 rounded-full"
                                style={{ backgroundColor: track.color }}
                              />
                              
                              <div className="w-32">
                                <p className="text-sm font-medium text-white">{track.name}</p>
                                <p className="text-xs text-white/50 capitalize">{track.type}</p>
                              </div>

                              <div className="flex items-center gap-2">
                                <motion.button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleTrackMuteToggle(track.id);
                                  }}
                                  className={cn(
                                    "w-8 h-8 rounded flex items-center justify-center text-xs font-bold",
                                    track.mute
                                      ? "bg-red-500 text-white"
                                      : "bg-white/10 text-white/60"
                                  )}
                                  whileHover={{ scale: 1.1 }}
                                  whileTap={{ scale: 0.9 }}
                                >
                                  M
                                </motion.button>
                                
                                <motion.button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleTrackSoloToggle(track.id);
                                  }}
                                  className={cn(
                                    "w-8 h-8 rounded flex items-center justify-center text-xs font-bold",
                                    track.solo
                                      ? "bg-yellow-500 text-black"
                                      : "bg-white/10 text-white/60"
                                  )}
                                  whileHover={{ scale: 1.1 }}
                                  whileTap={{ scale: 0.9 }}
                                >
                                  S
                                </motion.button>
                                
                                <motion.button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    adapter.toggleTrackArm(track.id);
                                  }}
                                  className={cn(
                                    "w-8 h-8 rounded flex items-center justify-center",
                                    track.armed
                                      ? "bg-red-600 text-white animate-pulse"
                                      : "bg-white/10 text-white/60"
                                  )}
                                  whileHover={{ scale: 1.1 }}
                                  whileTap={{ scale: 0.9 }}
                                >
                                  <Circle className="w-3 h-3" fill={track.armed ? "currentColor" : "none"} />
                                </motion.button>
                              </div>

                              <div className="flex-1 h-16 bg-black/30 rounded-lg overflow-hidden relative">
                                {track.clips.map((clip) => (
                                  <div
                                    key={clip.id}
                                    className="absolute top-1 bottom-1 rounded"
                                    style={{
                                      left: `${clip.startTime * 10}%`,
                                      width: `${clip.duration * 10}%`,
                                      backgroundColor: track.color,
                                      opacity: 0.7,
                                    }}
                                  />
                                ))}
                                
                                <div className="absolute inset-0 flex items-center justify-center">
                                  {track.clips.length === 0 && (
                                    <span className="text-xs text-white/30">Drop audio here</span>
                                  )}
                                </div>
                              </div>

                              <div className="w-6 h-16 flex flex-col gap-0.5">
                                <div
                                  className="flex-1 rounded-sm bg-gradient-to-t from-green-500 via-yellow-500 to-red-500"
                                  style={{
                                    clipPath: `inset(${100 - track.meterLevel[0] * 100}% 0 0 0)`,
                                  }}
                                />
                                <div
                                  className="flex-1 rounded-sm bg-gradient-to-t from-green-500 via-yellow-500 to-red-500"
                                  style={{
                                    clipPath: `inset(${100 - track.meterLevel[1] * 100}% 0 0 0)`,
                                  }}
                                />
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <AnimatePresence>
            {showMixer && (
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: 200 }}
                exit={{ height: 0 }}
                className="border-t border-white/5 overflow-hidden"
              >
                <FlowStateMixer
                  tracks={tracks.map(t => ({
                    id: t.id,
                    name: t.name,
                    color: t.color,
                    volume: t.volume,
                    pan: t.pan,
                    mute: t.mute,
                    solo: t.solo,
                    armed: t.armed,
                    meterLevel: t.meterLevel,
                  }))}
                  onVolumeChange={handleTrackVolumeChange}
                  onPanChange={handleTrackPanChange}
                  onMuteToggle={handleTrackMuteToggle}
                  onSoloToggle={handleTrackSoloToggle}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {showPluginChain && (
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: 320 }}
              exit={{ width: 0 }}
              className="border-l border-white/5 overflow-hidden"
            >
              <FlowStatePluginChain
                trackId={context.selectedTrackIds[0] || null}
                trackName={context.selectedTrackIds[0] 
                  ? tracks.find(t => t.id === context.selectedTrackIds[0])?.name || 'Selected Track'
                  : 'Master'}
                plugins={masterPlugins}
                onPluginsChange={setMasterPlugins}
                onClose={() => setShowPluginChain(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showAIPanel && (
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: 320 }}
              exit={{ width: 0 }}
              className="border-l border-white/5 overflow-hidden"
            >
              <FlowStateAIPanel
                suggestions={suggestions.map(s => ({
                  id: s.id,
                  type: s.type as any,
                  title: s.title,
                  description: s.description,
                  confidence: s.confidence,
                  onApply: s.action,
                }))}
                mode={context.mode}
                projectId={projectId}
                onAIMix={onAIMix}
                onAIMaster={onAIMaster}
                onAIGenerate={() => setShowAIGeneratorDialog(true)}
                isAIMixing={isAIMixing}
                isAIMastering={isAIMastering}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <motion.div
        className={cn(
          "h-20 flex-shrink-0 border-t border-white/5 bg-gradient-to-r from-black/40 via-black/30 to-black/40 backdrop-blur-xl",
          "flex items-center justify-between px-6",
          !chromeVisible && "opacity-80"
        )}
      >
        <div className="flex items-center gap-4 text-sm font-mono">
          <div className="bg-black/50 rounded-lg px-4 py-2 border border-white/10">
            <span className="text-white/50 text-xs block">Time</span>
            <span className="text-white text-lg">{formatTime(transport.currentTime)}</span>
          </div>
          <div className="bg-black/50 rounded-lg px-4 py-2 border border-white/10">
            <span className="text-white/50 text-xs block">Bars</span>
            <span className="text-white text-lg">{formatBars(transport.currentTime)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <motion.button
            onClick={() => adapter.seek(0)}
            className="w-12 h-12 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <SkipBack className="w-5 h-5" />
          </motion.button>

          <motion.button
            onClick={() => transport.isPlaying ? adapter.pause() : adapter.play()}
            className={cn(
              "w-16 h-16 rounded-2xl flex items-center justify-center text-white transition-all shadow-xl",
              transport.isPlaying
                ? "bg-gradient-to-br from-indigo-500 to-purple-600"
                : "bg-gradient-to-br from-green-500 to-emerald-600"
            )}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {transport.isPlaying ? (
              <Pause className="w-7 h-7" />
            ) : (
              <Play className="w-7 h-7 ml-1" />
            )}
          </motion.button>

          <motion.button
            onClick={adapter.stop}
            className="w-12 h-12 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Square className="w-5 h-5" />
          </motion.button>

          <motion.button
            onClick={adapter.record}
            className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center transition-all",
              transport.isRecording
                ? "bg-red-600 text-white animate-pulse"
                : "bg-white/5 text-red-400 hover:bg-red-600/20"
            )}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Circle className="w-5 h-5" fill={transport.isRecording ? "currentColor" : "none"} />
          </motion.button>

          <div className="w-px h-10 bg-white/10 mx-2" />

          <motion.button
            onClick={adapter.toggleLoop}
            className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center transition-all",
              transport.loopEnabled
                ? "bg-indigo-600 text-white"
                : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white"
            )}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Repeat className="w-5 h-5" />
          </motion.button>

          <motion.button
            onClick={adapter.toggleMetronome}
            className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center transition-all",
              transport.metronomeEnabled
                ? "bg-amber-600 text-white"
                : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white"
            )}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Activity className="w-5 h-5" />
          </motion.button>
        </div>

        <div className="flex items-center gap-4">
          <div className="bg-black/50 rounded-lg px-4 py-2 border border-white/10 flex items-center gap-2">
            <span className="text-white/50 text-xs">BPM</span>
            <input
              type="number"
              value={transport.tempo}
              onChange={(e) => adapter.setTempo(Number(e.target.value))}
              className="w-16 bg-transparent text-white text-lg font-mono text-center focus:outline-none"
              min={20}
              max={300}
            />
          </div>
          <div className="bg-black/50 rounded-lg px-4 py-2 border border-white/10">
            <span className="text-white/50 text-xs block">Sig</span>
            <span className="text-white text-lg font-mono">{transport.timeSignature}</span>
          </div>
        </div>
      </motion.div>

      <div className="absolute bottom-24 left-4 text-xs text-white/30 pointer-events-none">
        <span>Press TAB for Zero-Chrome mode</span>
      </div>

      {projectId && (
        <AIGeneratorDialog
          isOpen={showAIGeneratorDialog}
          onClose={() => setShowAIGeneratorDialog(false)}
          projectId={parseInt(projectId)}
          onGenerated={(params) => {
            setShowAIGeneratorDialog(false);
          }}
        />
      )}
    </div>
  );
}
