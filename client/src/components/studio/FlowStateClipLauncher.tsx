import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Pause,
  Square,
  Circle,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Copy,
  Volume2,
  VolumeX,
  Headphones,
  Music,
  Drum,
  Guitar,
  Mic2,
  Piano,
  Layers,
  Grid3X3,
  Maximize2,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Clip {
  id: string;
  name: string;
  color: string;
  duration: number;
  isPlaying: boolean;
  isQueued: boolean;
  isRecording: boolean;
  loopEnabled: boolean;
  followAction?: "none" | "next" | "previous" | "first" | "last" | "random";
  waveform?: number[];
}

interface ClipSlot {
  id: string;
  clip: Clip | null;
  sceneIndex: number;
  trackIndex: number;
}

interface Track {
  id: string;
  name: string;
  type: "audio" | "midi" | "drum" | "group";
  color: string;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  armed: boolean;
  clips: ClipSlot[];
}

interface Scene {
  id: string;
  name: string;
  tempo?: number;
  timeSignature?: string;
}

interface FlowStateClipLauncherProps {
  onClipTrigger?: (clipId: string, trackId: string) => void;
  onSceneTrigger?: (sceneId: string) => void;
  className?: string;
}

const TRACK_COLORS = [
  "bg-red-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-yellow-500",
  "bg-lime-500",
  "bg-green-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-cyan-500",
  "bg-sky-500",
  "bg-blue-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-purple-500",
  "bg-fuchsia-500",
  "bg-pink-500",
];

const TRACK_ICONS: Record<string, React.ReactNode> = {
  audio: <Music className="w-3.5 h-3.5" />,
  midi: <Piano className="w-3.5 h-3.5" />,
  drum: <Drum className="w-3.5 h-3.5" />,
  group: <Layers className="w-3.5 h-3.5" />,
};

const generateMockWaveform = (): number[] => {
  const waveform: number[] = [];
  for (let i = 0; i < 40; i++) {
    waveform.push(0.2 + Math.random() * 0.6);
  }
  return waveform;
};

export function FlowStateClipLauncher({
  onClipTrigger,
  onSceneTrigger,
  className,
}: FlowStateClipLauncherProps) {
  const { toast } = useToast();
  const [scenes, setScenes] = useState<Scene[]>([
    { id: "scene-1", name: "Intro", tempo: 120 },
    { id: "scene-2", name: "Verse 1", tempo: 120 },
    { id: "scene-3", name: "Chorus", tempo: 120 },
    { id: "scene-4", name: "Verse 2", tempo: 120 },
    { id: "scene-5", name: "Bridge", tempo: 110 },
    { id: "scene-6", name: "Outro", tempo: 120 },
    { id: "scene-7", name: "" },
    { id: "scene-8", name: "" },
  ]);

  const [tracks, setTracks] = useState<Track[]>(() => {
    const trackDefs = [
      { name: "Drums", type: "drum" as const, color: TRACK_COLORS[0] },
      { name: "Bass", type: "midi" as const, color: TRACK_COLORS[4] },
      { name: "Keys", type: "midi" as const, color: TRACK_COLORS[8] },
      { name: "Synth Lead", type: "midi" as const, color: TRACK_COLORS[10] },
      { name: "Guitar", type: "audio" as const, color: TRACK_COLORS[1] },
      { name: "Vocals", type: "audio" as const, color: TRACK_COLORS[14] },
      { name: "FX", type: "audio" as const, color: TRACK_COLORS[12] },
      { name: "Pads", type: "midi" as const, color: TRACK_COLORS[6] },
    ];

    return trackDefs.map((def, trackIdx) => ({
      id: `track-${trackIdx}`,
      name: def.name,
      type: def.type,
      color: def.color,
      volume: 0.8,
      pan: 0,
      muted: false,
      solo: false,
      armed: false,
      clips: scenes.map((scene, sceneIdx) => ({
        id: `slot-${trackIdx}-${sceneIdx}`,
        sceneIndex: sceneIdx,
        trackIndex: trackIdx,
        clip:
          Math.random() > 0.4
            ? {
                id: `clip-${trackIdx}-${sceneIdx}`,
                name: `${def.name} ${sceneIdx + 1}`,
                color: def.color,
                duration: 4 + Math.floor(Math.random() * 4) * 2,
                isPlaying: false,
                isQueued: false,
                isRecording: false,
                loopEnabled: true,
                waveform: generateMockWaveform(),
              }
            : null,
      })),
    }));
  });

  const [globalPlaying, setGlobalPlaying] = useState(false);
  const [currentScene, setCurrentScene] = useState<string | null>(null);
  const [quantize, setQuantize] = useState("1 Bar");
  const [tempo, setTempo] = useState(120);
  const [selectedClip, setSelectedClip] = useState<string | null>(null);

  const triggerClip = useCallback(
    (trackId: string, slotId: string) => {
      setTracks((prev) =>
        prev.map((track) => {
          if (track.id !== trackId) return track;

          return {
            ...track,
            clips: track.clips.map((slot) => {
              if (!slot.clip) return slot;

              if (slot.id === slotId) {
                const newPlaying = !slot.clip.isPlaying;
                if (newPlaying) {
                  onClipTrigger?.(slot.clip.id, trackId);
                }
                return {
                  ...slot,
                  clip: {
                    ...slot.clip,
                    isPlaying: newPlaying,
                    isQueued: false,
                  },
                };
              } else {
                return {
                  ...slot,
                  clip: { ...slot.clip, isPlaying: false },
                };
              }
            }),
          };
        }),
      );
    },
    [onClipTrigger],
  );

  const triggerScene = useCallback(
    (sceneId: string) => {
      const sceneIndex = scenes.findIndex((s) => s.id === sceneId);
      if (sceneIndex === -1) return;

      setCurrentScene(sceneId);
      onSceneTrigger?.(sceneId);

      setTracks((prev) =>
        prev.map((track) => ({
          ...track,
          clips: track.clips.map((slot) => ({
            ...slot,
            clip: slot.clip
              ? {
                  ...slot.clip,
                  isPlaying: slot.sceneIndex === sceneIndex,
                  isQueued: false,
                }
              : null,
          })),
        })),
      );

      setGlobalPlaying(true);
      toast({
        title: `Scene: ${scenes[sceneIndex].name || `Scene ${sceneIndex + 1}`}`,
      });
    },
    [scenes, onSceneTrigger, toast],
  );

  const stopAll = useCallback(() => {
    setTracks((prev) =>
      prev.map((track) => ({
        ...track,
        clips: track.clips.map((slot) => ({
          ...slot,
          clip: slot.clip
            ? { ...slot.clip, isPlaying: false, isQueued: false }
            : null,
        })),
      })),
    );
    setGlobalPlaying(false);
    setCurrentScene(null);
  }, []);

  const toggleTrackMute = (trackId: string) => {
    setTracks((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, muted: !t.muted } : t)),
    );
  };

  const toggleTrackSolo = (trackId: string) => {
    setTracks((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, solo: !t.solo } : t)),
    );
  };

  const toggleTrackArm = (trackId: string) => {
    setTracks((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, armed: !t.armed } : t)),
    );
  };

  const addScene = () => {
    const newScene: Scene = {
      id: `scene-${Date.now()}`,
      name: `Scene ${scenes.length + 1}`,
      tempo,
    };
    setScenes((prev) => [...prev, newScene]);
    setTracks((prev) =>
      prev.map((track) => ({
        ...track,
        clips: [
          ...track.clips,
          {
            id: `slot-${track.id}-${scenes.length}`,
            sceneIndex: scenes.length,
            trackIndex: parseInt(track.id.split("-")[1]),
            clip: null,
          },
        ],
      })),
    );
  };

  const addTrack = (type: Track["type"] = "audio") => {
    const newTrack: Track = {
      id: `track-${Date.now()}`,
      name: `Track ${tracks.length + 1}`,
      type,
      color: TRACK_COLORS[tracks.length % TRACK_COLORS.length],
      volume: 0.8,
      pan: 0,
      muted: false,
      solo: false,
      armed: false,
      clips: scenes.map((scene, idx) => ({
        id: `slot-new-${idx}`,
        sceneIndex: idx,
        trackIndex: tracks.length,
        clip: null,
      })),
    };
    setTracks((prev) => [...prev, newTrack]);
  };

  return (
    <div
      className={cn("flex flex-col h-full bg-zinc-950 text-white", className)}
    >
      {/* Header / Transport */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-green-500/20 to-emerald-500/20 rounded-lg">
            <Grid3X3 className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h2 className="font-semibold">Clip Launcher</h2>
            <p className="text-xs text-zinc-500">Session View</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Tempo */}
          <div className="flex items-center gap-2 bg-zinc-900 rounded-lg px-3 py-1.5">
            <span className="text-xs text-zinc-400">BPM</span>
            <Input
              type="number"
              value={tempo}
              onChange={(e) => setTempo(parseInt(e.target.value) || 120)}
              className="w-16 h-6 bg-transparent border-none text-center font-mono text-sm p-0"
            />
          </div>

          {/* Quantize */}
          <Select value={quantize} onValueChange={setQuantize}>
            <SelectTrigger className="w-24 h-8 bg-zinc-900 border-zinc-700 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="None">None</SelectItem>
              <SelectItem value="1/4">1/4 Beat</SelectItem>
              <SelectItem value="1/2">1/2 Beat</SelectItem>
              <SelectItem value="1 Beat">1 Beat</SelectItem>
              <SelectItem value="1 Bar">1 Bar</SelectItem>
              <SelectItem value="2 Bars">2 Bars</SelectItem>
              <SelectItem value="4 Bars">4 Bars</SelectItem>
            </SelectContent>
          </Select>

          {/* Transport */}
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant={globalPlaying ? "default" : "outline"}
              className={cn(
                "h-8 w-8",
                globalPlaying && "bg-green-500 hover:bg-green-600",
              )}
              onClick={() => setGlobalPlaying(!globalPlaying)}
            >
              {globalPlaying ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              onClick={stopAll}
            >
              <Square className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="flex-1 overflow-auto">
        <div className="min-w-max">
          {/* Track Headers */}
          <div className="flex sticky top-0 z-20 bg-zinc-950 border-b border-zinc-800">
            {/* Scene Launch Column Header */}
            <div className="w-20 shrink-0 p-2 border-r border-zinc-800">
              <span className="text-xs text-zinc-500">Scenes</span>
            </div>

            {/* Track Headers */}
            {tracks.map((track) => (
              <div
                key={track.id}
                className="w-28 shrink-0 p-2 border-r border-zinc-800"
              >
                <div className="flex items-center gap-1 mb-1">
                  <div className={cn("w-2 h-2 rounded-full", track.color)} />
                  <span className="text-xs font-medium truncate">
                    {track.name}
                  </span>
                </div>
                <div className="flex items-center gap-0.5">
                  {TRACK_ICONS[track.type]}
                  <Button
                    size="icon"
                    variant="ghost"
                    className={cn("h-5 w-5", track.muted && "text-red-400")}
                    onClick={() => toggleTrackMute(track.id)}
                  >
                    {track.muted ? (
                      <VolumeX className="w-3 h-3" />
                    ) : (
                      <Volume2 className="w-3 h-3" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className={cn("h-5 w-5", track.solo && "text-yellow-400")}
                    onClick={() => toggleTrackSolo(track.id)}
                  >
                    <Headphones className="w-3 h-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className={cn("h-5 w-5", track.armed && "text-red-500")}
                    onClick={() => toggleTrackArm(track.id)}
                  >
                    <Circle
                      className={cn("w-3 h-3", track.armed && "fill-current")}
                    />
                  </Button>
                </div>
              </div>
            ))}

            {/* Add Track */}
            <div className="w-12 shrink-0 p-2 flex items-center justify-center">
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => addTrack()}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Scene Rows */}
          {scenes.map((scene, sceneIdx) => (
            <div
              key={scene.id}
              className={cn(
                "flex border-b border-zinc-800/50",
                currentScene === scene.id && "bg-green-500/5",
              )}
            >
              {/* Scene Launch Button */}
              <div className="w-20 shrink-0 p-1 border-r border-zinc-800 flex items-center">
                <Button
                  size="sm"
                  variant={currentScene === scene.id ? "default" : "ghost"}
                  className={cn(
                    "w-full h-12 flex flex-col items-center justify-center gap-0.5",
                    currentScene === scene.id &&
                      "bg-green-500 hover:bg-green-600",
                  )}
                  onClick={() => triggerScene(scene.id)}
                >
                  <Play className="w-3.5 h-3.5" />
                  <span className="text-[10px] truncate max-w-full">
                    {scene.name || `${sceneIdx + 1}`}
                  </span>
                </Button>
              </div>

              {/* Clip Slots */}
              {tracks.map((track) => {
                const slot = track.clips[sceneIdx];
                const clip = slot?.clip;

                return (
                  <ContextMenuTrigger
                    key={slot?.id || `empty-${track.id}-${sceneIdx}`}
                  >
                    <div
                      className={cn(
                        "w-28 h-14 shrink-0 p-1 border-r border-zinc-800/50 cursor-pointer",
                        track.muted && "opacity-50",
                      )}
                      onClick={() => clip && triggerClip(track.id, slot.id)}
                    >
                      {clip ? (
                        <motion.div
                          className={cn(
                            "h-full rounded relative overflow-hidden",
                            clip.isPlaying
                              ? "ring-2 ring-green-500 ring-offset-1 ring-offset-zinc-950"
                              : clip.isQueued
                                ? "ring-2 ring-yellow-500 ring-offset-1 ring-offset-zinc-950"
                                : "",
                            track.color.replace("bg-", "bg-") + "/20",
                          )}
                          animate={
                            clip.isPlaying
                              ? {
                                  boxShadow: [
                                    "0 0 0px rgba(34,197,94,0)",
                                    "0 0 10px rgba(34,197,94,0.5)",
                                    "0 0 0px rgba(34,197,94,0)",
                                  ],
                                }
                              : {}
                          }
                          transition={{ repeat: Infinity, duration: 1 }}
                        >
                          {/* Waveform */}
                          <div className="absolute inset-0 flex items-center px-0.5">
                            {clip.waveform?.map((v, i) => (
                              <div
                                key={i}
                                className={cn(
                                  "flex-1 mx-px rounded-sm transition-all",
                                  clip.isPlaying
                                    ? track.color
                                    : track.color.replace("500", "700"),
                                )}
                                style={{ height: `${v * 100}%` }}
                              />
                            ))}
                          </div>

                          {/* Clip Info */}
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] truncate">
                                {clip.name}
                              </span>
                              {clip.isPlaying && (
                                <motion.div
                                  className="w-1.5 h-1.5 bg-green-500 rounded-full"
                                  animate={{ opacity: [1, 0.3, 1] }}
                                  transition={{
                                    repeat: Infinity,
                                    duration: 0.5,
                                  }}
                                />
                              )}
                            </div>
                          </div>

                          {/* Play indicator */}
                          {clip.isPlaying && (
                            <motion.div
                              className="absolute top-1 right-1"
                              animate={{ scale: [1, 1.2, 1] }}
                              transition={{ repeat: Infinity, duration: 0.5 }}
                            >
                              <Play className="w-3 h-3 text-green-400 fill-green-400" />
                            </motion.div>
                          )}
                        </motion.div>
                      ) : (
                        <div className="h-full rounded border border-zinc-800 border-dashed flex items-center justify-center hover:border-zinc-600 hover:bg-zinc-900/50 transition-colors">
                          <Plus className="w-4 h-4 text-zinc-600" />
                        </div>
                      )}
                    </div>
                    <ContextMenuContent>
                      {clip ? (
                        <>
                          <ContextMenuItem
                            onClick={() => triggerClip(track.id, slot.id)}
                          >
                            {clip.isPlaying ? "Stop Clip" : "Launch Clip"}
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuItem>Edit Clip</ContextMenuItem>
                          <ContextMenuItem>Duplicate</ContextMenuItem>
                          <ContextMenuItem>Rename</ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuItem className="text-red-400">
                            Delete Clip
                          </ContextMenuItem>
                        </>
                      ) : (
                        <>
                          <ContextMenuItem>Create Empty Clip</ContextMenuItem>
                          <ContextMenuItem>Record into Slot</ContextMenuItem>
                          <ContextMenuItem>Paste Clip</ContextMenuItem>
                        </>
                      )}
                    </ContextMenuContent>
                  </ContextMenuTrigger>
                );
              })}

              <div className="w-12 shrink-0" />
            </div>
          ))}

          {/* Add Scene Row */}
          <div className="flex border-b border-zinc-800/50">
            <div className="w-20 shrink-0 p-1 border-r border-zinc-800">
              <Button
                size="sm"
                variant="ghost"
                className="w-full h-10"
                onClick={addScene}
              >
                <Plus className="w-4 h-4 mr-1" />
                Scene
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer / Master */}
      <div className="border-t border-zinc-800 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Badge
              variant="outline"
              className={cn(
                globalPlaying
                  ? "text-green-400 border-green-400/30"
                  : "text-zinc-400",
              )}
            >
              {globalPlaying ? "Playing" : "Stopped"}
            </Badge>
            {currentScene && (
              <span className="text-sm text-zinc-400">
                Scene:{" "}
                {scenes.find((s) => s.id === currentScene)?.name || "Unnamed"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span>{tracks.length} tracks</span>
            <span>•</span>
            <span>{scenes.filter((s) => s.name).length} scenes</span>
            <span>•</span>
            <span>Quantize: {quantize}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FlowStateClipLauncher;
