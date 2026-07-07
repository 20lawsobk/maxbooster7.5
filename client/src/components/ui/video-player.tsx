import { useState } from "react";
import type { CSSProperties } from "react";
import { AlertTriangle } from "lucide-react";

interface VideoPlayerProps {
  src: string;
  /** Server-generated first-frame poster. Prevents a grey box on mobile. */
  poster?: string | null;
  autoPlay?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Called once if inline playback fails on this device. */
  onPlaybackError?: () => void;
}

/**
 * Universal, dependency-free video player.
 *
 * Renders a native <video> element — decoding is handled by the OS/browser,
 * which gives the widest device/console reach for H.264/AAC MP4 (a JS library
 * can't add codec support, only JS that may fail on constrained TV/console
 * browsers). A real `poster` image (server generated) replaces the flaky
 * `#t=0.1` fragment so mobile shows a frame instead of a grey placeholder.
 * `playsInline` stops iOS Safari from forcing fullscreen and `muted` is
 * required for autoplay on iOS/Android. On a decode/network failure it shows an
 * honest fallback instead of a silent 0:00 player.
 */
export function VideoPlayer({
  src,
  poster,
  autoPlay = false,
  className,
  style,
  onPlaybackError,
}: VideoPlayerProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-3">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
            Preview unavailable on this device
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          The video generated successfully but couldn't play inline here. Use
          Download to save the clip.
        </p>
      </div>
    );
  }

  return (
    <video
      src={src}
      poster={poster || undefined}
      controls
      muted
      playsInline
      preload="metadata"
      {...(autoPlay ? { autoPlay: true } : {})}
      onError={() => {
        setFailed(true);
        onPlaybackError?.();
      }}
      className={className}
      style={style}
    />
  );
}
