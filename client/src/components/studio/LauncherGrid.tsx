import { useState, useCallback } from 'react';
import { Play, Square, Plus, Music, Disc, Layers, ChevronDown, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { studioOneTheme } from '@/lib/studioOneTheme';

interface LauncherClip {
  id: string;
  name: string;
  type: 'audio' | 'midi';
  color: string;
  duration: number;
  isPlaying: boolean;
  isQueued: boolean;
}

interface LauncherScene {
  id: string;
  name: string;
  clips: (LauncherClip | null)[];
}

interface LauncherTrack {
  id: string;
  name: string;
  color: string;
  armed: boolean;
}

interface LauncherGridProps {
  scenes: LauncherScene[];
  tracks: LauncherTrack[];
  onClipTrigger: (sceneId: string, trackIndex: number) => void;
  onSceneTrigger: (sceneId: string) => void;
  onSceneStop: (sceneId: string) => void;
  onAddScene: () => void;
  onAddClip: (sceneId: string, trackIndex: number) => void;
  onStopAll: () => void;
}

function ClipCell({
  clip,
  trackColor,
  onClick,
  onAddClick,
}: {
  clip: LauncherClip | null;
  trackColor: string;
  onClick: () => void;
  onAddClick: () => void;
}) {
  if (!clip) {
    return (
      <button
        onClick={onAddClick}
        className="w-full h-full flex items-center justify-center rounded transition-all hover:bg-white/10"
        style={{
          background: studioOneTheme.colors.bg.deep,
          border: `1px dashed ${studioOneTheme.colors.border.subtle}`,
        }}
      >
        <Plus className="h-4 w-4" style={{ color: studioOneTheme.colors.text.muted }} />
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="w-full h-full rounded transition-all relative overflow-hidden group"
      style={{
        background: clip.isPlaying 
          ? `linear-gradient(180deg, ${clip.color}60 0%, ${clip.color}30 100%)`
          : `linear-gradient(180deg, ${clip.color}30 0%, ${clip.color}15 100%)`,
        border: `1px solid ${clip.isPlaying ? clip.color : clip.color + '60'}`,
        boxShadow: clip.isPlaying ? `0 0 10px ${clip.color}50` : 'none',
      }}
    >
      {/* Playing indicator */}
      {clip.isPlaying && (
        <div className="absolute top-1 right-1">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        </div>
      )}
      
      {/* Queued indicator */}
      {clip.isQueued && !clip.isPlaying && (
        <div className="absolute top-1 right-1">
          <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
        </div>
      )}

      {/* Clip info */}
      <div className="flex flex-col items-start justify-end h-full p-1.5">
        <span 
          className="text-[9px] font-medium truncate w-full"
          style={{ color: studioOneTheme.colors.text.primary }}
        >
          {clip.name}
        </span>
        <span 
          className="text-[8px]"
          style={{ color: studioOneTheme.colors.text.muted }}
        >
          {clip.type === 'audio' ? '♪' : '♬'} {(clip.duration / 1000).toFixed(1)}s
        </span>
      </div>

      {/* Play/Stop overlay */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/30 transition-opacity">
        {clip.isPlaying ? (
          <Square className="h-6 w-6" style={{ color: clip.color }} />
        ) : (
          <Play className="h-6 w-6" style={{ color: clip.color }} />
        )}
      </div>
    </button>
  );
}

export function LauncherGrid({
  scenes,
  tracks,
  onClipTrigger,
  onSceneTrigger,
  onSceneStop,
  onAddScene,
  onAddClip,
  onStopAll,
}: LauncherGridProps) {
  const CELL_WIDTH = 80;
  const CELL_HEIGHT = 50;
  const SCENE_COLUMN_WIDTH = 60;
  const HEADER_HEIGHT = 40;

  return (
    <div 
      className="flex flex-col h-full"
      style={{ background: studioOneTheme.colors.bg.primary }}
    >
      {/* Track Headers */}
      <div 
        className="flex border-b shrink-0"
        style={{ 
          borderColor: studioOneTheme.colors.border.primary,
          height: HEADER_HEIGHT,
        }}
      >
        {/* Scene column header */}
        <div 
          className="flex items-center justify-center shrink-0 border-r"
          style={{ 
            width: SCENE_COLUMN_WIDTH,
            background: studioOneTheme.colors.bg.secondary,
            borderColor: studioOneTheme.colors.border.primary,
          }}
        >
          <Layers className="h-4 w-4" style={{ color: studioOneTheme.colors.text.muted }} />
        </div>

        {/* Track headers */}
        <ScrollArea className="flex-1" orientation="horizontal">
          <div className="flex">
            {tracks.map((track) => (
              <div
                key={track.id}
                className="flex flex-col items-center justify-center shrink-0 border-r px-2"
                style={{
                  width: CELL_WIDTH,
                  background: studioOneTheme.colors.bg.secondary,
                  borderColor: studioOneTheme.colors.border.subtle,
                  borderBottom: `2px solid ${track.color}`,
                }}
              >
                <span 
                  className="text-[10px] font-medium truncate w-full text-center"
                  style={{ color: studioOneTheme.colors.text.primary }}
                >
                  {track.name}
                </span>
                {track.armed && (
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse mt-0.5" />
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Stop all button */}
        <div 
          className="flex items-center justify-center shrink-0 border-l"
          style={{ 
            width: 50,
            background: studioOneTheme.colors.bg.secondary,
            borderColor: studioOneTheme.colors.border.primary,
          }}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={onStopAll}
            className="h-8 w-8 p-0"
          >
            <Square className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      </div>

      {/* Scene Grid */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col">
          {scenes.map((scene, sceneIndex) => (
            <div 
              key={scene.id}
              className="flex border-b"
              style={{ 
                height: CELL_HEIGHT,
                borderColor: studioOneTheme.colors.border.subtle,
              }}
            >
              {/* Scene trigger */}
              <div 
                className="flex items-center shrink-0 border-r px-1 group"
                style={{ 
                  width: SCENE_COLUMN_WIDTH,
                  background: studioOneTheme.colors.bg.secondary,
                  borderColor: studioOneTheme.colors.border.primary,
                }}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSceneTrigger(scene.id)}
                  className="h-6 w-6 p-0"
                >
                  <Play className="h-3 w-3" style={{ color: studioOneTheme.colors.accent.green }} />
                </Button>
                <span 
                  className="text-[9px] font-medium truncate flex-1"
                  style={{ color: studioOneTheme.colors.text.secondary }}
                >
                  {scene.name}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreHorizontal className="h-3 w-3" style={{ color: studioOneTheme.colors.text.muted }} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => onSceneStop(scene.id)}>
                      Stop Scene
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Clip cells */}
              <div className="flex flex-1">
                {tracks.map((track, trackIndex) => (
                  <div
                    key={track.id}
                    className="shrink-0 p-0.5"
                    style={{ width: CELL_WIDTH }}
                  >
                    <ClipCell
                      clip={scene.clips[trackIndex] || null}
                      trackColor={track.color}
                      onClick={() => onClipTrigger(scene.id, trackIndex)}
                      onAddClick={() => onAddClip(scene.id, trackIndex)}
                    />
                  </div>
                ))}
              </div>

              {/* Scene stop */}
              <div 
                className="flex items-center justify-center shrink-0 border-l"
                style={{ 
                  width: 50,
                  borderColor: studioOneTheme.colors.border.primary,
                }}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSceneStop(scene.id)}
                  className="h-6 w-6 p-0"
                >
                  <Square className="h-3 w-3" style={{ color: studioOneTheme.colors.text.muted }} />
                </Button>
              </div>
            </div>
          ))}

          {/* Add scene row */}
          <div 
            className="flex items-center justify-center py-2 border-b cursor-pointer hover:bg-white/5"
            style={{ borderColor: studioOneTheme.colors.border.subtle }}
            onClick={onAddScene}
          >
            <Plus className="h-4 w-4 mr-2" style={{ color: studioOneTheme.colors.text.muted }} />
            <span className="text-[10px]" style={{ color: studioOneTheme.colors.text.muted }}>
              Add Scene
            </span>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
