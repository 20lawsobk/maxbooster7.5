import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useStudioStore } from "@/lib/studioStore";
import { useDynamicLayout } from "@/hooks/useDynamicLayout";
import { Play, Pause, Square, Circle, SkipBack, SkipForward, Repeat, Plus, Minus, Music2, RotateCcw, RotateCw, Activity, Volume2, VolumeX, Volume1, ArrowDownToLine, ArrowUpFromLine, Layers, AlertCircle, Radio, Grid3X3, Eye, Target, Snowflake, Cpu, ChevronUp, ChevronDown, Music, Maximize, Minimize, ZoomIn, ZoomOut } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MUSICAL_KEYS, type MusicalKey, type KeyMode } from "@/lib/studioStore";
import { AIMixer } from "@/lib/audio/AIMixer";
import { AIMastering } from "@/lib/audio/AIMastering";
import { useToast } from "@/hooks/use-toast";
import { AutoscrollButton } from "./AutoscrollButton";
import AudioEngine from "@/lib/audioEngine";

interface TransportBarProps {
  armedTracksCount?: number;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onPlay?: () => void;
  onPause?: () => void;
  onStop?: () => void;
  onRecord?: () => void;
  onSeek?: (time: number) => void;
  duration?: number;
  masterVolume?: number;
  onMasterVolumeChange?: (volume: number) => void;
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
  zoom?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
}

export function TransportBar({
  armedTracksCount = 0,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onPlay,
  onPause,
  onStop,
  onRecord,
  onSeek,
  duration = 300,
  masterVolume = 80,
  onMasterVolumeChange,
  onToggleFullscreen,
  isFullscreen = false,
  zoom = 1,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}: TransportBarProps) {
  const {
    currentTime,
    isPlaying,
    isRecording,
    loopEnabled,
    loopStart,
    loopEnd,
    tempo,
    timeSignature,
    metronomeEnabled,
    setLoopEnabled,
    setLoopStart,
    setLoopEnd,
    setTempo,
    setMetronomeEnabled,
    punchMode,
    punchIn,
    punchOut,
    setPunchMode,
    setPunchIn,
    setPunchOut,
    recordingMode,
    setRecordingMode,
    preRollBars,
    setPreRollBars,
    countInBars,
    setCountInBars,
    
    
    inputMonitoring,
    setInputMonitoring,
    adaptiveSnapEnabled,
    setAdaptiveSnapEnabled,
    translucentEventsEnabled,
    setTranslucentEventsEnabled,
    showSyncPoints,
    setShowSyncPoints,
    
    getFrozenTrackCount,
    projectKey,
    projectKeyMode,
    globalTranspose,
    originalProjectKey,
    setProjectKey,
    setProjectKeyMode,
    transposeUp,
    transposeDown,
    resetTranspose,
    getTransposedKey,
    chordDisplayMode,
    cycleChordDisplayMode,
  } = useStudioStore();

  // Responsive layout - include md breakpoint for landscape mobile/tablet
  const { containerRef, isSmallScreen, isMediumScreen,  width } =
    useDynamicLayout();
  // Compact mode for screens under 1024px (xs, sm, md) - covers landscape phones and small tablets
  const isCompact = isSmallScreen || isMediumScreen || width < 1024;
  const buttonSize = isCompact ? "h-8 w-8" : "h-10 w-10";
  const playButtonSize = isCompact ? "h-10 w-10" : "h-14 w-14";
  const iconSize = isCompact ? "h-3 w-3" : "h-4 w-4";
  const playIconSize = isCompact ? "h-4 w-4" : "h-6 w-6";

  const [tapTempoTimes, setTapTempoTimes] = useState<number[]>([]);
  const [isMuted, setIsMuted] = useState(masterVolume === 0);
  const [previousVolume, setPreviousVolume] = useState(
    masterVolume > 0 ? masterVolume : 80,
  );

  useEffect(() => {
    setIsMuted(masterVolume === 0);
  }, [masterVolume]);

  const formatSMPTE = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * 30);
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}:${frames.toString().padStart(2, "0")}`;
  };

  const formatMusicalTime = (seconds: number) => {
    const [numerator] = timeSignature.split("/").map(Number);
    const beatsPerBar = numerator;
    const beatDuration = 60 / tempo;

    const totalBeats = seconds / beatDuration;
    const bar = Math.floor(totalBeats / beatsPerBar) + 1;
    const beat = Math.floor(totalBeats % beatsPerBar) + 1;
    const tick = Math.floor((totalBeats % 1) * 960);

    return `${bar}.${beat}.${tick.toString().padStart(3, "0")}`;
  };

  const handlePlay = useCallback(() => {
    if (isPlaying && onPause) {
      onPause();
    } else if (!isPlaying && onPlay) {
      onPlay();
    }
  }, [isPlaying, onPlay, onPause]);

  const handleStop = useCallback(() => {
    if (onStop) {
      onStop();
    }
  }, [onStop]);

  const handleRecord = useCallback(() => {
    if (onRecord) {
      onRecord();
    }
  }, [onRecord]);

  const handleSkipBack = useCallback(() => {
    if (onSeek) {
      onSeek(Math.max(0, currentTime - 1));
    }
  }, [currentTime, onSeek]);

  const handleSkipForward = useCallback(() => {
    if (onSeek) {
      onSeek(currentTime + 1);
    }
  }, [currentTime, onSeek]);

  const handleTapTempo = useCallback(() => {
    const now = Date.now();
    const newTimes = [...tapTempoTimes, now].slice(-4);
    setTapTempoTimes(newTimes);

    if (newTimes.length >= 2) {
      const intervals = [];
      for (let i = 1; i < newTimes.length; i++) {
        intervals.push(newTimes[i] - newTimes[i - 1]);
      }
      const avgInterval =
        intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const newTempo = Math.round(60000 / avgInterval);
      if (newTempo >= 40 && newTempo <= 240) {
        setTempo(newTempo);
      }
    }

    setTimeout(() => setTapTempoTimes([]), 3000);
  }, [tapTempoTimes, setTempo]);

  const handleVolumeChange = useCallback(
    (value: number[]) => {
      const newVolume = value[0];
      if (onMasterVolumeChange) {
        onMasterVolumeChange(newVolume);
      }
      if (newVolume > 0) {
        setIsMuted(false);
      }
    },
    [onMasterVolumeChange],
  );

  const toggleMute = useCallback(() => {
    if (isMuted) {
      if (onMasterVolumeChange) {
        onMasterVolumeChange(previousVolume);
      }
      setIsMuted(false);
    } else {
      setPreviousVolume(masterVolume);
      if (onMasterVolumeChange) {
        onMasterVolumeChange(0);
      }
      setIsMuted(true);
    }
  }, [isMuted, previousVolume, masterVolume, onMasterVolumeChange]);

  const handleSeekChange = useCallback(
    (value: number[]) => {
      if (onSeek) {
        onSeek(value[0]);
      }
    },
    [onSeek],
  );

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getVolumeIcon = () => {
    if (isMuted || masterVolume === 0) {
      return <VolumeX className="h-4 w-4" />;
    } else if (masterVolume < 50) {
      return <Volume1 className="h-4 w-4" />;
    } else {
      return <Volume2 className="h-4 w-4" />;
    }
  };

  return (
    <div
      ref={containerRef as React.RefObject<HTMLDivElement>}
      className={`flex items-center justify-between border-b ${isCompact ? "px-2 py-1 gap-1 flex-wrap min-h-[52px]" : "h-20 px-6"}`}
      style={{
        background:
          "linear-gradient(180deg, var(--studio-bg-medium) 0%, var(--studio-bg-deep) 100%)",
        borderColor: "var(--studio-border)",
      }}
    >
      <TooltipProvider>
        {/* Left: Transport Controls */}
        <div className={`flex items-center ${isCompact ? "gap-1" : "gap-3"}`}>
          {/* Skip Back */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={`studio-btn ${buttonSize} rounded-md flex items-center justify-center`}
                onClick={handleSkipBack}
              >
                <SkipBack className={iconSize} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Skip Back (,)</TooltipContent>
          </Tooltip>

          {/* Stop */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={`studio-btn ${buttonSize} rounded-md flex items-center justify-center`}
                onClick={handleStop}
              >
                <Square className={iconSize} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Stop (Enter)</TooltipContent>
          </Tooltip>

          {/* Play/Pause */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={`${playButtonSize} rounded-lg flex items-center justify-center transition-all ${
                  isPlaying ? "studio-btn-play playing" : "studio-btn-play"
                }`}
                onClick={handlePlay}
              >
                {isPlaying ? (
                  <Pause className={playIconSize} />
                ) : (
                  <Play className={`${playIconSize} ml-0.5`} />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>Play/Pause (Space)</TooltipContent>
          </Tooltip>

          {/* Input Monitoring Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={`studio-btn ${isCompact ? "h-7 w-7" : "h-8 w-8"} rounded flex items-center justify-center ${
                  inputMonitoring ? "studio-btn-accent" : ""
                }`}
                onClick={() => setInputMonitoring(!inputMonitoring)}
                style={{
                  boxShadow: inputMonitoring
                    ? "0 0 8px rgba(34, 197, 94, 0.4)"
                    : undefined,
                }}
              >
                <Radio className={isCompact ? "h-3 w-3" : "h-3.5 w-3.5"} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              Input Monitoring {inputMonitoring ? "On" : "Off"}
            </TooltipContent>
          </Tooltip>

          {/* Record */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={`studio-btn-record ${buttonSize} rounded-md flex items-center justify-center relative ${
                  isRecording ? "recording animate-pulse" : ""
                } ${punchMode ? "punch-armed" : ""}`}
                onClick={handleRecord}
                style={{
                  border: punchMode ? "2px solid #f59e0b" : undefined,
                  boxShadow: punchMode
                    ? "0 0 10px rgba(245, 158, 11, 0.4)"
                    : undefined,
                }}
              >
                <Circle
                  className={iconSize}
                  fill={isRecording ? "currentColor" : "none"}
                />
                {recordingMode !== "replace" && (
                  <span
                    className="absolute -bottom-1 -right-1 text-[8px] font-bold px-1 rounded"
                    style={{
                      background:
                        recordingMode === "overdub" ? "#3b82f6" : "#8b5cf6",
                      color: "#fff",
                    }}
                  >
                    {recordingMode === "overdub" ? "OVR" : "STK"}
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              Record (R) -{" "}
              {recordingMode === "replace"
                ? "Replace"
                : recordingMode === "overdub"
                  ? "Overdub"
                  : "Stacked"}
              {punchMode && " [Punch Armed]"}
            </TooltipContent>
          </Tooltip>

          {/* Recording Mode Selector - Hidden on compact screens */}
          {!isCompact && (
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={`studio-btn h-5 px-1.5 rounded text-[8px] font-bold ${
                        recordingMode === "replace" ? "studio-btn-accent" : ""
                      }`}
                      onClick={() => setRecordingMode("replace")}
                    >
                      REP
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Replace Mode</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={`studio-btn h-5 px-1.5 rounded text-[8px] font-bold ${
                        recordingMode === "overdub" ? "studio-btn-accent" : ""
                      }`}
                      onClick={() => setRecordingMode("overdub")}
                    >
                      OVR
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Overdub Mode</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={`studio-btn h-5 px-1.5 rounded text-[8px] font-bold ${
                        recordingMode === "stacked" ? "studio-btn-accent" : ""
                      }`}
                      onClick={() => setRecordingMode("stacked")}
                    >
                      <Layers className="h-2.5 w-2.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Stacked Takes Mode</TooltipContent>
                </Tooltip>
              </div>
              <div className="flex items-center gap-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <select
                      className="studio-btn h-5 px-1 rounded text-[8px] font-bold bg-transparent cursor-pointer"
                      style={{ color: "var(--studio-text)" }}
                      value={preRollBars}
                      onChange={(e) => setPreRollBars(Number(e.target.value))}
                    >
                      <option value={0}>PR:0</option>
                      <option value={1}>PR:1</option>
                      <option value={2}>PR:2</option>
                      <option value={4}>PR:4</option>
                    </select>
                  </TooltipTrigger>
                  <TooltipContent>Pre-roll Bars</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <select
                      className="studio-btn h-5 px-1 rounded text-[8px] font-bold bg-transparent cursor-pointer"
                      style={{ color: "var(--studio-text)" }}
                      value={countInBars}
                      onChange={(e) => setCountInBars(Number(e.target.value))}
                    >
                      <option value={0}>CI:0</option>
                      <option value={1}>CI:1</option>
                      <option value={2}>CI:2</option>
                      <option value={4}>CI:4</option>
                    </select>
                  </TooltipTrigger>
                  <TooltipContent>Count-in Bars</TooltipContent>
                </Tooltip>
              </div>
            </div>
          )}

          {/* Skip Forward */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={`studio-btn ${buttonSize} rounded-md flex items-center justify-center`}
                onClick={handleSkipForward}
              >
                <SkipForward className={iconSize} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Skip Forward (.)</TooltipContent>
          </Tooltip>

          {/* Armed Tracks Badge */}
          {armedTracksCount > 0 && (
            <div
              className="ml-2 px-3 h-7 rounded flex items-center gap-1.5 text-xs font-medium"
              style={{
                background: "linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)",
                color: "#fca5a5",
                border: "1px solid #991b1b",
                boxShadow: "0 0 10px rgba(239, 68, 68, 0.2)",
              }}
            >
              <Circle className="h-3 w-3 fill-current" />
              {armedTracksCount} Armed
            </div>
          )}
        </div>

        {/* Center: Time Display & Loop Controls */}
        <div className={`flex items-center ${isCompact ? "gap-2" : "gap-6"}`}>
          {/* SMPTE Timecode */}
          <div
            className={`flex flex-col items-end rounded-md ${isCompact ? "px-2 py-1" : "px-4 py-2"}`}
            style={{
              background: "var(--studio-surface)",
              border: "1px solid var(--studio-border-subtle)",
              boxShadow: "var(--studio-shadow-inner)",
            }}
          >
            <div
              className={`font-mono font-bold tracking-widest ${isCompact ? "text-sm" : "text-lg"}`}
              style={{ color: "var(--studio-text)" }}
            >
              {formatSMPTE(currentTime)}
            </div>
            {!isCompact && (
              <div
                className="text-xs font-mono tracking-wide"
                style={{ color: "var(--studio-text-subtle)" }}
              >
                {formatMusicalTime(currentTime)}
              </div>
            )}
          </div>

          {!isCompact && (
            <div
              className="h-8 w-px"
              style={{ background: "var(--studio-border)" }}
            />
          )}

          {/* Loop Controls */}
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={`studio-btn rounded-md text-xs font-bold flex items-center gap-2 ${
                    loopEnabled ? "studio-btn-accent" : ""
                  } ${isCompact ? "h-7 px-2" : "h-9 px-4"}`}
                  onClick={() => setLoopEnabled(!loopEnabled)}
                >
                  <Repeat className={isCompact ? "h-3 w-3" : "h-3.5 w-3.5"} />
                  {!isCompact && "LOOP"}
                </button>
              </TooltipTrigger>
              <TooltipContent>Toggle Loop (L)</TooltipContent>
            </Tooltip>

            {loopEnabled && !isCompact && (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={loopStart}
                  onChange={(e) => setLoopStart(Number(e.target.value))}
                  className="w-16 h-7 text-xs"
                  min={0}
                />
                <span style={{ color: "var(--studio-text-muted)" }}>to</span>
                <Input
                  type="number"
                  value={loopEnd}
                  onChange={(e) => setLoopEnd(Number(e.target.value))}
                  className="w-16 h-7 text-xs"
                  min={loopStart + 1}
                />
              </div>
            )}
          </div>

          {/* Punch Recording Controls - Hidden on compact */}
          {!isCompact && (
            <>
              <div
                className="h-8 w-px"
                style={{ background: "var(--studio-border)" }}
              />

              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={`studio-btn h-9 px-3 rounded-md text-xs font-bold flex items-center gap-1.5 ${
                        punchMode ? "studio-btn-accent" : ""
                      }`}
                      onClick={() => setPunchMode(!punchMode)}
                      style={{
                        border: punchMode ? "1px solid #f59e0b" : undefined,
                        boxShadow: punchMode
                          ? "0 0 8px rgba(245, 158, 11, 0.3)"
                          : undefined,
                      }}
                    >
                      <ArrowDownToLine className="h-3.5 w-3.5" />
                      <ArrowUpFromLine className="h-3.5 w-3.5" />
                      PUNCH
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Toggle Punch In/Out Recording (I)
                  </TooltipContent>
                </Tooltip>

                {punchMode && (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <span
                        className="text-[10px] font-medium"
                        style={{ color: "var(--studio-text-subtle)" }}
                      >
                        IN
                      </span>
                      <Input
                        type="number"
                        value={punchIn ?? 0}
                        onChange={(e) => setPunchIn(Number(e.target.value))}
                        className="w-14 h-6 text-xs"
                        min={0}
                        style={{
                          borderColor: "#f59e0b",
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span
                        className="text-[10px] font-medium"
                        style={{ color: "var(--studio-text-subtle)" }}
                      >
                        OUT
                      </span>
                      <Input
                        type="number"
                        value={punchOut ?? 0}
                        onChange={(e) => setPunchOut(Number(e.target.value))}
                        className="w-14 h-6 text-xs"
                        min={(punchIn ?? 0) + 1}
                        style={{
                          borderColor: "#f59e0b",
                        }}
                      />
                    </div>
                    {punchMode && (
                      <div
                        className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium"
                        style={{
                          background: "rgba(245, 158, 11, 0.2)",
                          color: "#fbbf24",
                          border: "1px solid rgba(245, 158, 11, 0.4)",
                        }}
                      >
                        <AlertCircle className="h-3 w-3" />
                        ARMED
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div
                className="h-8 w-px"
                style={{ background: "var(--studio-border)" }}
              />

              {/* Metronome */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className={`studio-btn-metronome h-9 px-4 rounded-md text-xs font-bold flex items-center gap-2 ${
                      metronomeEnabled ? "active" : ""
                    }`}
                    onClick={() => setMetronomeEnabled(!metronomeEnabled)}
                  >
                    <Activity className="h-3.5 w-3.5" />
                    CLICK
                  </button>
                </TooltipTrigger>
                <TooltipContent>Metronome (M)</TooltipContent>
              </Tooltip>

              <div
                className="h-8 w-px"
                style={{ background: "var(--studio-border)" }}
              />

              {/* Autoscroll */}
              <AutoscrollButton />

              <div
                className="h-8 w-px"
                style={{ background: "var(--studio-border)" }}
              />
            </>
          )}

          {/* Audio Sync Settings (Studio One style) */}
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={`studio-btn h-8 w-8 rounded flex items-center justify-center ${
                    adaptiveSnapEnabled ? "studio-btn-accent" : ""
                  }`}
                  onClick={() => setAdaptiveSnapEnabled(!adaptiveSnapEnabled)}
                  style={{
                    boxShadow: adaptiveSnapEnabled
                      ? "0 0 8px rgba(59, 130, 246, 0.4)"
                      : undefined,
                  }}
                >
                  <Grid3X3 className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                Adaptive Snap {adaptiveSnapEnabled ? "On" : "Off"} - Grid adapts
                to zoom level
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={`studio-btn h-8 w-8 rounded flex items-center justify-center ${
                    translucentEventsEnabled ? "studio-btn-accent" : ""
                  }`}
                  onClick={() =>
                    setTranslucentEventsEnabled(!translucentEventsEnabled)
                  }
                  style={{
                    boxShadow: translucentEventsEnabled
                      ? "0 0 8px rgba(139, 92, 246, 0.4)"
                      : undefined,
                  }}
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                Translucent Events {translucentEventsEnabled ? "On" : "Off"} -
                Show grid through waveforms
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={`studio-btn h-8 w-8 rounded flex items-center justify-center ${
                    showSyncPoints ? "studio-btn-accent" : ""
                  }`}
                  onClick={() => setShowSyncPoints(!showSyncPoints)}
                  style={{
                    boxShadow: showSyncPoints
                      ? "0 0 8px rgba(251, 191, 36, 0.4)"
                      : undefined,
                  }}
                >
                  <Target className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                Show Sync Points {showSyncPoints ? "On" : "Off"} - Display sync
                point markers on clips
              </TooltipContent>
            </Tooltip>

            <div
              className="h-6 w-px ml-1"
              style={{ background: "var(--studio-border)" }}
            />

            {/* Chord Display Mode Toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="studio-btn h-8 px-2.5 rounded flex items-center justify-center gap-1.5 font-bold text-xs"
                  onClick={cycleChordDisplayMode}
                  style={{
                    background:
                      chordDisplayMode === "nashville"
                        ? "linear-gradient(135deg, rgba(245, 158, 11, 0.3), rgba(234, 88, 12, 0.2))"
                        : chordDisplayMode === "roman"
                          ? "linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(124, 58, 237, 0.2))"
                          : undefined,
                    color:
                      chordDisplayMode === "nashville"
                        ? "#fbbf24"
                        : chordDisplayMode === "roman"
                          ? "#a78bfa"
                          : "var(--studio-text)",
                    border:
                      chordDisplayMode === "nashville"
                        ? "1px solid rgba(245, 158, 11, 0.5)"
                        : chordDisplayMode === "roman"
                          ? "1px solid rgba(139, 92, 246, 0.5)"
                          : "1px solid var(--studio-border)",
                    boxShadow:
                      chordDisplayMode === "nashville"
                        ? "0 0 10px rgba(245, 158, 11, 0.3)"
                        : chordDisplayMode === "roman"
                          ? "0 0 10px rgba(139, 92, 246, 0.3)"
                          : undefined,
                  }}
                >
                  <Music2 className="h-3 w-3" />
                  <span>
                    {chordDisplayMode === "nashville"
                      ? "123"
                      : chordDisplayMode === "roman"
                        ? "IV"
                        : "C"}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                Chord Display:{" "}
                {chordDisplayMode === "standard"
                  ? "Standard (C, Am, G7)"
                  : chordDisplayMode === "nashville"
                    ? "Nashville Numbers (1, 6m, 5/7)"
                    : "Roman Numerals (I, vi, V7)"}
                <br />
                <span className="text-muted-foreground">
                  Click to cycle modes
                </span>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Right: Tempo & Undo/Redo */}
        <div className="flex items-center gap-4">
          {/* Tempo Controls - Hidden on compact */}
          {!isCompact && (
            <div className="flex items-center gap-2">
              <button
                className="studio-btn h-8 w-8 rounded flex items-center justify-center"
                onClick={() => setTempo(tempo - 1)}
              >
                <Minus className="h-3 w-3" />
              </button>

              <div
                className="flex flex-col items-center px-4 py-1.5 rounded-md"
                style={{
                  background: "var(--studio-surface)",
                  border: "1px solid var(--studio-border-subtle)",
                  boxShadow: "var(--studio-shadow-inner)",
                }}
              >
                <input
                  type="number"
                  value={tempo}
                  onChange={(e) => setTempo(Number(e.target.value))}
                  className="w-14 h-6 text-base font-mono font-bold text-center outline-none border-none"
                  style={{
                    background: "transparent",
                    color: "var(--studio-text)",
                  }}
                  min="40"
                  max="240"
                />
                <span
                  className="text-[9px] font-medium tracking-wider"
                  style={{ color: "var(--studio-text-subtle)" }}
                >
                  BPM
                </span>
              </div>

              <button
                className="studio-btn h-8 w-8 rounded flex items-center justify-center"
                onClick={() => setTempo(tempo + 1)}
              >
                <Plus className="h-3 w-3" />
              </button>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="studio-btn h-8 px-3 rounded text-[10px] font-bold tracking-wider"
                    onClick={handleTapTempo}
                  >
                    TAP
                  </button>
                </TooltipTrigger>
                <TooltipContent>Tap Tempo</TooltipContent>
              </Tooltip>
            </div>
          )}

          {/* Time Signature - Hidden on compact */}
          {!isCompact && (
            <div
              className="px-3 py-1.5 rounded-md font-mono text-base font-bold"
              style={{
                background: "var(--studio-surface)",
                color: "var(--studio-text)",
                border: "1px solid var(--studio-border-subtle)",
                boxShadow: "var(--studio-shadow-inner)",
              }}
            >
              {timeSignature}
            </div>
          )}

          {!isCompact && (
            <div
              className="h-8 w-px"
              style={{ background: "var(--studio-border)" }}
            />
          )}

          {/* Global Transpose Controls - Hidden on compact */}
          {!isCompact && (
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1">
                    <Music
                      className="h-3.5 w-3.5"
                      style={{ color: "var(--studio-text-subtle)" }}
                    />
                    <Select
                      value={projectKey}
                      onValueChange={(value: MusicalKey) =>
                        setProjectKey(value)
                      }
                    >
                      <SelectTrigger
                        className="h-8 w-16 text-xs font-bold border-none"
                        style={{
                          background: "var(--studio-surface)",
                          color: "var(--studio-text)",
                        }}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MUSICAL_KEYS.map((key) => (
                          <SelectItem key={key} value={key}>
                            {key}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={projectKeyMode}
                      onValueChange={(value: KeyMode) =>
                        setProjectKeyMode(value)
                      }
                    >
                      <SelectTrigger
                        className="h-8 w-20 text-xs font-bold border-none"
                        style={{
                          background: "var(--studio-surface)",
                          color: "var(--studio-text)",
                        }}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="major">Major</SelectItem>
                        <SelectItem value="minor">Minor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  Project Key - All audio & MIDI will transpose relative to this
                  key
                </TooltipContent>
              </Tooltip>

              {/* Transpose Display with visual indicator */}
              {globalTranspose !== 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs font-bold"
                      style={{
                        background:
                          globalTranspose > 0
                            ? "linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(22, 163, 74, 0.3))"
                            : "linear-gradient(135deg, rgba(249, 115, 22, 0.2), rgba(234, 88, 12, 0.3))",
                        color: globalTranspose > 0 ? "#4ade80" : "#fb923c",
                        border:
                          globalTranspose > 0
                            ? "1px solid rgba(34, 197, 94, 0.4)"
                            : "1px solid rgba(249, 115, 22, 0.4)",
                        boxShadow:
                          globalTranspose > 0
                            ? "0 0 8px rgba(34, 197, 94, 0.3)"
                            : "0 0 8px rgba(249, 115, 22, 0.3)",
                      }}
                    >
                      {globalTranspose > 0 ? "↑" : "↓"}
                      {Math.abs(globalTranspose)}
                      <span className="ml-1 opacity-70">
                        {originalProjectKey} → {getTransposedKey()}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    Transposed {Math.abs(globalTranspose)} semitone
                    {Math.abs(globalTranspose) !== 1 ? "s" : ""}{" "}
                    {globalTranspose > 0 ? "up" : "down"}
                    <br />
                    Original: {originalProjectKey} {projectKeyMode} →{" "}
                    {getTransposedKey()} {projectKeyMode}
                  </TooltipContent>
                </Tooltip>
              )}

              {/* Transpose Up/Down Buttons */}
              <div className="flex flex-col gap-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="studio-btn h-4 w-6 rounded-sm flex items-center justify-center"
                      onClick={transposeUp}
                      disabled={globalTranspose >= 12}
                      style={{ opacity: globalTranspose >= 12 ? 0.4 : 1 }}
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Transpose Up (Shift+↑)</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="studio-btn h-4 w-6 rounded-sm flex items-center justify-center"
                      onClick={transposeDown}
                      disabled={globalTranspose <= -12}
                      style={{ opacity: globalTranspose <= -12 ? 0.4 : 1 }}
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Transpose Down (Shift+↓)</TooltipContent>
                </Tooltip>
              </div>

              {/* Reset Button - only show when transposed */}
              {globalTranspose !== 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="studio-btn h-8 w-8 rounded flex items-center justify-center"
                      onClick={resetTranspose}
                      style={{
                        color: "#fbbf24",
                      }}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Reset Transpose (Shift+0)</TooltipContent>
                </Tooltip>
              )}
            </div>
          )}

          {/* Progress Bar - Hidden on compact */}
          {!isCompact && (
            <>
              <div
                className="h-8 w-px"
                style={{ background: "var(--studio-border)" }}
              />

              <div className="flex items-center gap-2 min-w-[180px]">
                <span
                  className="text-xs font-mono w-12 text-right"
                  style={{ color: "var(--studio-text-subtle)" }}
                >
                  {formatTime(currentTime)}
                </span>
                <Slider
                  value={[currentTime]}
                  max={duration}
                  step={0.1}
                  onValueChange={handleSeekChange}
                  className="flex-1 min-w-[80px]"
                />
                <span
                  className="text-xs font-mono w-12"
                  style={{ color: "var(--studio-text-subtle)" }}
                >
                  {formatTime(duration)}
                </span>
              </div>

              <div
                className="h-8 w-px"
                style={{ background: "var(--studio-border)" }}
              />

              {/* Master Volume - Marketplace-style */}
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="studio-btn h-8 w-8 rounded flex items-center justify-center"
                      onClick={toggleMute}
                    >
                      {getVolumeIcon()}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{isMuted ? "Unmute" : "Mute"}</TooltipContent>
                </Tooltip>
                <Slider
                  value={[isMuted ? 0 : masterVolume]}
                  max={100}
                  step={1}
                  onValueChange={handleVolumeChange}
                  className="w-20"
                />
                <span
                  className="text-xs font-mono w-8"
                  style={{ color: "var(--studio-text-subtle)" }}
                >
                  {isMuted ? 0 : masterVolume}%
                </span>
              </div>

              <div
                className="h-8 w-px"
                style={{ background: "var(--studio-border)" }}
              />

              {/* CPU Savings Indicator */}
              {getFrozenTrackCount() > 0 && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md"
                        style={{
                          background:
                            "linear-gradient(135deg, rgba(6, 182, 212, 0.15), rgba(30, 58, 138, 0.2))",
                          border: "1px solid rgba(6, 182, 212, 0.3)",
                          boxShadow: "0 0 10px rgba(6, 182, 212, 0.15)",
                        }}
                      >
                        <Snowflake className="w-3.5 h-3.5 text-cyan-400" />
                        <div className="flex items-center gap-1">
                          <Cpu className="w-3 h-3 text-cyan-300" />
                          <span className="text-xs font-bold text-cyan-400">
                            {getFrozenTrackCount()} FROZEN
                          </span>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-semibold">
                        {getFrozenTrackCount()} track
                        {getFrozenTrackCount() > 1 ? "s" : ""} frozen
                      </p>
                      <p className="text-xs text-gray-400">
                        CPU optimized - plugins bypassed
                      </p>
                    </TooltipContent>
                  </Tooltip>
                  <div
                    className="h-8 w-px"
                    style={{ background: "var(--studio-border)" }}
                  />
                </>
              )}
            </>
          )}

          {/* Undo/Redo */}
          {(onUndo || onRedo) && (
            <div className="flex items-center gap-1">
              {onUndo && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="studio-btn h-8 w-8 rounded flex items-center justify-center"
                      onClick={onUndo}
                      disabled={!canUndo}
                      style={{ opacity: canUndo ? 1 : 0.5 }}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
                </Tooltip>
              )}

              {onRedo && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="studio-btn h-8 w-8 rounded flex items-center justify-center"
                      onClick={onRedo}
                      disabled={!canRedo}
                      style={{ opacity: canRedo ? 1 : 0.5 }}
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Redo (Ctrl+Y)</TooltipContent>
                </Tooltip>
              )}
            </div>
          )}

          {/* Fullscreen Button - Always visible */}
          {onToggleFullscreen && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={`studio-btn ${buttonSize} rounded flex items-center justify-center`}
                  onClick={onToggleFullscreen}
                >
                  {isFullscreen ? (
                    <Minimize className={iconSize} />
                  ) : (
                    <Maximize className={iconSize} />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Zoom Controls - Only visible on compact/mobile mode */}
          {isCompact && onZoomIn && onZoomOut && (
            <div className="flex items-center gap-1 ml-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className={`studio-btn ${buttonSize} rounded flex items-center justify-center`}
                    onClick={onZoomOut}
                  >
                    <ZoomOut className={iconSize} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Zoom Out</TooltipContent>
              </Tooltip>

              {onZoomReset && (
                <button
                  className="studio-btn h-7 px-2 rounded flex items-center justify-center text-xs font-mono"
                  onClick={onZoomReset}
                >
                  {Math.round(zoom * 100)}%
                </button>
              )}

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className={`studio-btn ${buttonSize} rounded flex items-center justify-center`}
                    onClick={onZoomIn}
                  >
                    <ZoomIn className={iconSize} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Zoom In</TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      </TooltipProvider>
    </div>
  );
}
