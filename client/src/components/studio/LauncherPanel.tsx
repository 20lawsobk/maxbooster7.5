import { useState, useEffect, useCallback } from "react";
import { Play, Square, Plus, MoreHorizontal, Grid3X3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { studioOneTheme } from "@/lib/studioOneTheme";
import {
  useStudioStore,
  type LauncherClip,
  type LauncherScene,
  type LauncherQuantize,
} from "@/lib/studioStore";
import { cn } from "@/lib/utils";

interface Track {
  id: string;
  name: string;
  color: string;
}

interface LauncherPanelProps {
  tracks: Track[];
  className?: string;
}

function ClipCell({
  clip,
  trackColor,
  onTrigger,
  onStop,
  onAddClick,
  onRemove,
}: {
  clip: LauncherClip | undefined;
  trackColor: string;
  onTrigger: () => void;
  onStop: () => void;
  onAddClick: () => void;
  onRemove: () => void;
}) {
  if (!clip) {
    return (
      <button
        onClick={onAddClick}
        className="w-full h-full flex items-center justify-center rounded-md transition-all group hover:bg-white/5"
        style={{
          background: studioOneTheme.colors.bg.deep,
          border: `1px dashed ${studioOneTheme.colors.border.subtle}`,
        }}
      >
        <Plus
          className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: studioOneTheme.colors.text.muted }}
        />
      </button>
    );
  }

  const handleClick = () => {
    if (clip.isPlaying) {
      onStop();
    } else {
      onTrigger();
    }
  };

  return (
    <div className="relative group">
      <button
        onClick={handleClick}
        className={cn(
          "w-full h-full rounded-md transition-all relative overflow-hidden",
          clip.isPlaying && "ring-2 ring-green-500 animate-pulse",
        )}
        style={{
          background: clip.isPlaying
            ? `linear-gradient(180deg, ${clip.color}50 0%, ${clip.color}25 100%)`
            : `linear-gradient(180deg, ${clip.color}30 0%, ${clip.color}15 100%)`,
          border: clip.isQueued
            ? `2px solid ${studioOneTheme.colors.accent.yellow}`
            : `1px solid ${clip.isPlaying ? clip.color : clip.color + "50"}`,
          boxShadow: clip.isPlaying ? `0 0 12px ${clip.color}40` : "none",
        }}
      >
        {clip.isPlaying && (
          <div className="absolute top-1 right-1">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          </div>
        )}

        {clip.isQueued && !clip.isPlaying && (
          <div className="absolute top-1 right-1">
            <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
          </div>
        )}

        <div className="flex flex-col items-start justify-end h-full p-1.5">
          <span
            className="text-[9px] font-medium truncate w-full text-left"
            style={{ color: studioOneTheme.colors.text.primary }}
          >
            {clip.name}
          </span>
          <span
            className="text-[8px]"
            style={{ color: studioOneTheme.colors.text.muted }}
          >
            {clip.duration} beats
          </span>
        </div>

        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 transition-opacity">
          {clip.isPlaying ? (
            <Square className="h-5 w-5" style={{ color: "#fff" }} />
          ) : (
            <Play className="h-5 w-5" style={{ color: "#fff" }} />
          )}
        </div>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-3 w-3 text-white" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={onRemove}>Delete Clip</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function SceneRow({
  scene,
  tracks,
  clips,
  onSceneTrigger,
  onClipTrigger,
  onClipStop,
  onAddClip,
  onRemoveClip,
  onSceneNameChange,
  onRemoveScene,
}: {
  scene: LauncherScene;
  tracks: Track[];
  clips: LauncherClip[];
  onSceneTrigger: () => void;
  onClipTrigger: (clipId: string) => void;
  onClipStop: (clipId: string) => void;
  onAddClip: (trackId: string) => void;
  onRemoveClip: (clipId: string) => void;
  onSceneNameChange: (name: string) => void;
  onRemoveScene: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(scene.name);

  const handleNameSubmit = () => {
    onSceneNameChange(editName);
    setIsEditing(false);
  };

  const hasClips = clips.some((c) => c.slotIndex === scene.index);
  const hasPlayingClips = clips.some(
    (c) => c.slotIndex === scene.index && c.isPlaying,
  );

  return (
    <div
      className="flex border-b"
      style={{
        height: 56,
        borderColor: studioOneTheme.colors.border.subtle,
      }}
    >
      <div
        className="flex items-center shrink-0 border-r px-1 gap-1 group"
        style={{
          width: 70,
          background: studioOneTheme.colors.bg.secondary,
          borderColor: studioOneTheme.colors.border.primary,
        }}
      >
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onSceneTrigger}
                disabled={!hasClips}
                className={cn(
                  "h-6 w-6 p-0",
                  hasPlayingClips && "bg-green-500/20",
                )}
              >
                <Play
                  className="h-3 w-3"
                  style={{
                    color: hasClips
                      ? studioOneTheme.colors.accent.green
                      : studioOneTheme.colors.text.muted,
                  }}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Trigger Scene</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {isEditing ? (
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={(e) => e.key === "Enter" && handleNameSubmit()}
            className="h-5 text-[9px] px-1"
            autoFocus
          />
        ) : (
          <span
            className="text-[9px] font-medium truncate flex-1 cursor-pointer"
            style={{ color: scene.color }}
            onDoubleClick={() => setIsEditing(true)}
          >
            {scene.name}
          </span>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreHorizontal
                className="h-3 w-3"
                style={{ color: studioOneTheme.colors.text.muted }}
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={onRemoveScene}>
              Delete Scene
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-1">
        {tracks.map((track) => {
          const clip = clips.find(
            (c) => c.trackId === track.id && c.slotIndex === scene.index,
          );
          return (
            <div
              key={track.id}
              className="shrink-0 p-0.5"
              style={{ width: 80 }}
            >
              <ClipCell
                clip={clip}
                trackColor={track.color}
                onTrigger={() => clip && onClipTrigger(clip.id)}
                onStop={() => clip && onClipStop(clip.id)}
                onAddClick={() => onAddClip(track.id)}
                onRemove={() => clip && onRemoveClip(clip.id)}
              />
            </div>
          );
        })}
      </div>

      <div
        className="flex items-center justify-center shrink-0 border-l"
        style={{
          width: 40,
          borderColor: studioOneTheme.colors.border.primary,
        }}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            clips
              .filter(
                (c) =>
                  c.slotIndex === scene.index && (c.isPlaying || c.isQueued),
              )
              .forEach((c) => onClipStop(c.id));
          }}
          className="h-6 w-6 p-0"
          disabled={
            !hasPlayingClips &&
            !clips.some((c) => c.slotIndex === scene.index && c.isQueued)
          }
        >
          <Square
            className="h-3 w-3"
            style={{ color: studioOneTheme.colors.text.muted }}
          />
        </Button>
      </div>
    </div>
  );
}

export function LauncherPanel({ tracks, className }: LauncherPanelProps) {
  const {
    launcherClips,
    launcherScenes,
    launcherQuantize,
    showLauncher,
    triggerClip,
    stopClip,
    triggerScene,
    stopAllClips,
    setLauncherQuantize,
    addLauncherClip,
    removeLauncherClip,
    addLauncherScene,
    removeLauncherScene,
    updateLauncherScene,
  } = useStudioStore();

  const handleAddClip = useCallback(
    (trackId: string, slotIndex: number) => {
      const track = tracks.find((t) => t.id === trackId);
      const clipNum =
        launcherClips.filter((c) => c.trackId === trackId).length + 1;
      addLauncherClip({
        trackId,
        slotIndex,
        name: `Clip ${clipNum}`,
        color: track.color || "#4ade80",
        duration: 4,
      });
    },
    [tracks, launcherClips, addLauncherClip],
  );

  const handleAddScene = useCallback(() => {
    const colors = ["#8b5cf6", "#ec4899", "#06b6d4", "#f59e0b", "#10b981"];
    const color = colors[launcherScenes.length % colors.length];
    addLauncherScene({ color });
  }, [launcherScenes, addLauncherScene]);

  useEffect(() => {
    const interval = setInterval(() => {
      const state = useStudioStore.getState();
      if (
        state.queuedLauncherClips.length > 0 &&
        state.launcherQuantize !== "1beat"
      ) {
        state.queuedLauncherClips.forEach((clipId) => {
          const clip = state.launcherClips.find((c) => c.id === clipId);
          if (clip) {
            const trackClipsToStop = state.launcherClips.filter(
              (c) =>
                c.trackId === clip.trackId && c.id !== clipId && c.isPlaying,
            );

            useStudioStore.setState((s) => ({
              launcherClips: s.launcherClips.map((c) => {
                if (c.id === clipId)
                  return { ...c, isPlaying: true, isQueued: false };
                if (trackClipsToStop.map((tc) => tc.id).includes(c.id)) {
                  return { ...c, isPlaying: false, isQueued: false };
                }
                return c;
              }),
              activeLauncherClips: [
                ...s.activeLauncherClips.filter(
                  (id) => !trackClipsToStop.map((c) => c.id).includes(id),
                ),
                clipId,
              ],
              queuedLauncherClips: s.queuedLauncherClips.filter(
                (id) => id !== clipId,
              ),
            }));
          }
        });
      }
    }, getQuantizeDelayMs(launcherQuantize));

    return () => clearInterval(interval);
  }, [launcherQuantize]);

  if (!showLauncher) return null;

  return (
    <div
      className={cn("flex flex-col border-r", className)}
      style={{
        width: Math.max(320, 70 + tracks.length * 80 + 40),
        background: studioOneTheme.colors.bg.primary,
        borderColor: studioOneTheme.colors.border.primary,
      }}
    >
      <div
        className="flex items-center justify-between px-2 border-b shrink-0"
        style={{
          height: 36,
          background: studioOneTheme.colors.bg.secondary,
          borderColor: studioOneTheme.colors.border.primary,
        }}
      >
        <div className="flex items-center gap-2">
          <Grid3X3
            className="h-4 w-4"
            style={{ color: studioOneTheme.colors.text.muted }}
          />
          <span
            className="text-xs font-medium"
            style={{ color: studioOneTheme.colors.text.primary }}
          >
            Session Launcher
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={launcherQuantize}
            onValueChange={(v) => setLauncherQuantize(v as LauncherQuantize)}
          >
            <SelectTrigger
              className="h-6 w-20 text-[10px]"
              style={{
                background: studioOneTheme.colors.bg.surface,
                borderColor: studioOneTheme.colors.border.subtle,
                color: studioOneTheme.colors.text.secondary,
              }}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1beat">1 Beat</SelectItem>
              <SelectItem value="1bar">1 Bar</SelectItem>
              <SelectItem value="2bars">2 Bars</SelectItem>
              <SelectItem value="4bars">4 Bars</SelectItem>
            </SelectContent>
          </Select>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={stopAllClips}
                  className="h-6 w-6 p-0"
                >
                  <Square className="h-4 w-4 text-red-500" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Stop All Clips</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <div
        className="flex border-b shrink-0"
        style={{
          height: 32,
          borderColor: studioOneTheme.colors.border.primary,
        }}
      >
        <div
          className="flex items-center justify-center shrink-0 border-r"
          style={{
            width: 70,
            background: studioOneTheme.colors.bg.secondary,
            borderColor: studioOneTheme.colors.border.primary,
          }}
        >
          <span
            className="text-[9px]"
            style={{ color: studioOneTheme.colors.text.muted }}
          >
            Scene
          </span>
        </div>

        <ScrollArea className="flex-1" orientation="horizontal">
          <div className="flex">
            {tracks.map((track) => (
              <div
                key={track.id}
                className="flex flex-col items-center justify-center shrink-0 border-r px-1"
                style={{
                  width: 80,
                  background: studioOneTheme.colors.bg.secondary,
                  borderColor: studioOneTheme.colors.border.subtle,
                  borderBottom: `2px solid ${track.color}`,
                }}
              >
                <span
                  className="text-[9px] font-medium truncate w-full text-center"
                  style={{ color: studioOneTheme.colors.text.primary }}
                >
                  {track.name}
                </span>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div
          className="flex items-center justify-center shrink-0 border-l"
          style={{
            width: 40,
            background: studioOneTheme.colors.bg.secondary,
            borderColor: studioOneTheme.colors.border.primary,
          }}
        >
          <span
            className="text-[8px]"
            style={{ color: studioOneTheme.colors.text.muted }}
          >
            Stop
          </span>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col">
          {launcherScenes.map((scene) => (
            <SceneRow
              key={scene.id}
              scene={scene}
              tracks={tracks}
              clips={launcherClips}
              onSceneTrigger={() => triggerScene(scene.index)}
              onClipTrigger={triggerClip}
              onClipStop={stopClip}
              onAddClip={(trackId) => handleAddClip(trackId, scene.index)}
              onRemoveClip={removeLauncherClip}
              onSceneNameChange={(name) =>
                updateLauncherScene(scene.id, { name })
              }
              onRemoveScene={() => removeLauncherScene(scene.index)}
            />
          ))}

          <div
            className="flex items-center justify-center py-3 cursor-pointer hover:bg-white/5 transition-colors"
            style={{ borderColor: studioOneTheme.colors.border.subtle }}
            onClick={handleAddScene}
          >
            <Plus
              className="h-4 w-4 mr-2"
              style={{ color: studioOneTheme.colors.text.muted }}
            />
            <span
              className="text-[10px]"
              style={{ color: studioOneTheme.colors.text.muted }}
            >
              Add Scene
            </span>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function getQuantizeDelayMs(quantize: LauncherQuantize): number {
  switch (quantize) {
    case "1beat":
      return 500;
    case "1bar":
      return 2000;
    case "2bars":
      return 4000;
    case "4bars":
      return 8000;
    default:
      return 2000;
  }
}
