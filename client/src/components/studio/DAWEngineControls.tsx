import { logger } from '@/lib/logger';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, Pause, Square, Circle, SkipBack, SkipForward,
  Repeat, Magnet, Grid, Layers, Sliders, Music, Mic,
  Volume2, Clock, Gauge, Save, FolderOpen, Plus, Undo2, Redo2,
  Wand2, Brain, Lightbulb, ChevronDown, Settings, Zap,
  SlidersHorizontal, GitBranch, Route, Piano, Drum
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDAWCore } from '@/hooks/useDAWCore';
import { cn } from '@/lib/utils';
import type { EditMode, AutomationMode } from '@/lib/daw';

interface DAWEngineControlsProps {
  onOpenPluginBrowser: () => void;
  onOpenAIPanel: () => void;
  onOpenMixer: () => void;
  onOpenPianoRoll: () => void;
}

export function DAWEngineControls({
  onOpenPluginBrowser,
  onOpenAIPanel,
  onOpenMixer,
  onOpenPianoRoll,
}: DAWEngineControlsProps) {
  const daw = useDAWCore();
  const [localTempo, setLocalTempo] = useState(daw.tempo);

  useEffect(() => {
    if (!daw.isInitialized) {
      daw.initialize().catch((err: unknown) => logger.error('DAW init failed:', err));
    }
  }, [daw]);

  useEffect(() => {
    setLocalTempo(daw.tempo);
  }, [daw.tempo]);

  const handleTempoChange = useCallback((value: number) => {
    setLocalTempo(value);
  }, []);

  const handleTempoCommit = useCallback(() => {
    daw.setTempo(localTempo);
  }, [daw, localTempo]);

  const formatPosition = (position: typeof daw.position) => {
    const bar = Math.floor(position.musical.bar);
    const beat = Math.floor(position.musical.beat);
    const tick = Math.floor(position.musical.tick);
    return `${bar.toString().padStart(3, '0')}.${beat}.${tick.toString().padStart(3, '0')}`;
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col gap-1 bg-zinc-900/95 border-b border-zinc-800">
      <div className="flex items-center justify-between px-4 py-2 gap-4">
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1">
                <FolderOpen className="w-4 h-4" />
                Project
                <ChevronDown className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onClick={() => daw.newProject()}>
                <Plus className="w-4 h-4 mr-2" />
                New Project
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => daw.saveProject()}>
                <Save className="w-4 h-4 mr-2" />
                Save Project
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Import Audio...</DropdownMenuItem>
              <DropdownMenuItem>Export Mix...</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="h-4 w-px bg-zinc-700" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-8 w-8", !daw.canUndo && "opacity-50")}
                onClick={daw.undo}
                disabled={!daw.canUndo}
              >
                <Undo2 className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-8 w-8", !daw.canRedo && "opacity-50")}
                onClick={daw.redo}
                disabled={!daw.canRedo}
              >
                <Redo2 className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Redo (Ctrl+Y)</TooltipContent>
          </Tooltip>

          {daw.isDirty && (
            <span className="text-xs text-amber-500 ml-2">Unsaved</span>
          )}
        </div>

        <div className="flex items-center gap-3 bg-zinc-800/50 rounded-lg px-3 py-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => daw.setPosition(0)}
              >
                <SkipBack className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Return to Start</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-10 w-10 rounded-full",
                  daw.isPlaying && "bg-green-600/20 text-green-500"
                )}
                onClick={daw.isPlaying ? daw.pause : daw.play}
              >
                {daw.isPlaying ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <Play className="w-5 h-5 ml-0.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{daw.isPlaying ? 'Pause (Space)' : 'Play (Space)'}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={daw.stop}
              >
                <Square className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Stop</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-10 w-10 rounded-full",
                  daw.isRecording && "bg-red-600/20 text-red-500 animate-pulse"
                )}
                onClick={daw.record}
              >
                <Circle className={cn("w-5 h-5", daw.isRecording && "fill-red-500")} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Record (R)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-8 w-8",
                  daw.isLooping && "bg-blue-600/20 text-blue-500"
                )}
                onClick={daw.toggleLoop}
              >
                <Repeat className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Loop (L)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => daw.setPosition(daw.position.musical.totalBeats + 4)}
              >
                <SkipForward className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Skip Forward</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex flex-col items-center">
            <span className="text-xs text-zinc-500 mb-0.5">Position</span>
            <span className="font-mono text-sm text-white bg-zinc-800 px-2 py-0.5 rounded">
              {formatPosition(daw.position)}
            </span>
          </div>

          <div className="flex flex-col items-center">
            <span className="text-xs text-zinc-500 mb-0.5">Time</span>
            <span className="font-mono text-sm text-white bg-zinc-800 px-2 py-0.5 rounded">
              {formatTime(daw.position.seconds)}
            </span>
          </div>

          <div className="flex flex-col items-center">
            <span className="text-xs text-zinc-500 mb-0.5">Tempo</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={localTempo}
                onChange={(e) => handleTempoChange(parseFloat(e.target.value) || 120)}
                onBlur={handleTempoCommit}
                onKeyDown={(e) => e.key === 'Enter' && handleTempoCommit()}
                className="w-14 text-center font-mono text-sm bg-zinc-800 text-white px-1 py-0.5 rounded border-0 focus:ring-1 focus:ring-purple-500"
                min={20}
                max={999}
              />
              <span className="text-xs text-zinc-500">BPM</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "gap-1",
                  daw.snapEnabled && "bg-purple-600/20 text-purple-500"
                )}
                onClick={() => daw.setSnap(!daw.snapEnabled)}
              >
                <Magnet className="w-4 h-4" />
                Snap
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle Snap to Grid</TooltipContent>
          </Tooltip>

          <Select
            value={daw.gridDivision.toString()}
            onValueChange={(v) => daw.setGridDivision(parseFloat(v))}
          >
            <SelectTrigger className="w-20 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="4">1 Bar</SelectItem>
              <SelectItem value="1">1/4</SelectItem>
              <SelectItem value="0.5">1/8</SelectItem>
              <SelectItem value="0.25">1/16</SelectItem>
              <SelectItem value="0.125">1/32</SelectItem>
              <SelectItem value="0.0625">1/64</SelectItem>
            </SelectContent>
          </Select>

          <div className="h-4 w-px bg-zinc-700" />

          <Select
            value={daw.editMode}
            onValueChange={(v) => daw.setEditMode(v as EditMode)}
          >
            <SelectTrigger className="w-24 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="slip">Slip</SelectItem>
              <SelectItem value="ripple">Ripple</SelectItem>
              <SelectItem value="shuffle">Shuffle</SelectItem>
              <SelectItem value="spot">Spot</SelectItem>
            </SelectContent>
          </Select>

          <div className="h-4 w-px bg-zinc-700" />

          <Select
            value={daw.automationMode}
            onValueChange={(v) => daw.setAutomationMode(v as AutomationMode)}
          >
            <SelectTrigger className="w-20 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="off">Off</SelectItem>
              <SelectItem value="read">Read</SelectItem>
              <SelectItem value="write">Write</SelectItem>
              <SelectItem value="touch">Touch</SelectItem>
              <SelectItem value="latch">Latch</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between px-4 py-1 bg-zinc-800/30 border-t border-zinc-800/50">
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1 text-xs">
                <Plus className="w-3 h-3" />
                Add Track
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => daw.addTrack('audio')}>
                <Volume2 className="w-4 h-4 mr-2" />
                Audio Track
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => daw.addTrack('instrument')}>
                <Music className="w-4 h-4 mr-2" />
                Instrument Track
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => daw.addTrack('midi')}>
                <Piano className="w-4 h-4 mr-2" />
                MIDI Track
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => daw.createBus('Bus')}>
                <GitBranch className="w-4 h-4 mr-2" />
                Bus Track
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => daw.addTrack('aux')}>
                <Route className="w-4 h-4 mr-2" />
                Aux Track
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => daw.addTrack('folder')}>
                <Layers className="w-4 h-4 mr-2" />
                Folder Track
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="h-4 w-px bg-zinc-700 mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={onOpenMixer}>
                <SlidersHorizontal className="w-3 h-3" />
                Mixer
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open Mixer (M)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={onOpenPianoRoll}>
                <Piano className="w-3 h-3" />
                Piano Roll
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open Piano Roll</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={onOpenPluginBrowser}>
                <Sliders className="w-3 h-3" />
                Plugins
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open Plugin Browser (Shift+P)</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-xs bg-gradient-to-r from-purple-600/10 to-pink-600/10"
                onClick={onOpenAIPanel}
              >
                <Brain className="w-3 h-3 text-purple-500" />
                AI Co-Producer
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open AI Panel (Alt+A)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-xs"
                onClick={() => {
                  const suggestions = daw.analyzeMix();
                  logger.info('Mix Analysis:', suggestions);
                }}
              >
                <Lightbulb className="w-3 h-3" />
                Analyze Mix
              </Button>
            </TooltipTrigger>
            <TooltipContent>AI Mix Analysis</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-xs"
                onClick={() => {
                  const chords = daw.suggestChords();
                  logger.info('Chord Suggestions:', chords);
                }}
              >
                <Music className="w-3 h-3" />
                Suggest Chords
              </Button>
            </TooltipTrigger>
            <TooltipContent>AI Chord Suggestions</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span className="flex items-center gap-1">
            <Gauge className="w-3 h-3" />
            {daw.currentKey} {daw.currentMode}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {daw.zoom.toFixed(1)}x
          </span>
        </div>
      </div>
    </div>
  );
}
