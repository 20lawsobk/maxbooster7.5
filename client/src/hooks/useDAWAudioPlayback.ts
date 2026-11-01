// @ts-nocheck
import { useEffect, useRef, useCallback } from "react";
import { logger } from "@/lib/logger";
import type {
  UnifiedTrack,
  UnifiedTransport,
} from "@/stores/unifiedStoreAdapter";

interface UseDAWAudioPlaybackOptions {
  tracks: UnifiedTrack[];
  transport: UnifiedTransport;
}

interface ActiveSource {
  node: AudioBufferSourceNode;
  gainNode: GainNode;
  clipId: string;
}

export function useDAWAudioPlayback({
  tracks,
  transport,
}: UseDAWAudioPlaybackOptions) {
  const contextRef = useRef<AudioContext | null>(null);
  const buffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  const activeSourcesRef = useRef<Map<string, ActiveSource>>(new Map());
  const playStartContextTimeRef = useRef<number>(0);
  const playStartPositionRef = useRef<number>(0);
  const isPlayingRef = useRef(false);

  const getOrCreateContext = useCallback((): AudioContext => {
    if (!contextRef?.current || contextRef?.current.state === "closed") {
      const AudioCtx =
        window.AudioContext ||
        (window as Record<string, unknown>).webkitAudioContext;
      contextRef.current = new AudioCtx({ latencyHint: "interactive" });
    }
    return contextRef?.current;
  }, []);

  const decodeAudio = useCallback(
    async (sourceUrl: string): Promise<AudioBuffer | null> => {
      if (buffersRef?.current.has(sourceUrl)) {
        return buffersRef?.current.get(sourceUrl);
      }
      try {
        const ctx = getOrCreateContext();
        const response = await fetch(sourceUrl);
        if (!response?.ok) throw new Error(`HTTP ${response?.status}`);
        const arrayBuffer = await response?.arrayBuffer();
        const audioBuffer = await ctx?.decodeAudioData(arrayBuffer);
        buffersRef?.current.set(sourceUrl, audioBuffer);
        return audioBuffer;
      } catch (err) {
        logger.warn("[DAWPlayback] Failed to decode audio:", sourceUrl, err);
        return null;
      }
    },
    [getOrCreateContext],
  );

  useEffect(() => {
    const allUrls = new Set<string>();
    for (const track of tracks) {
      if (track?.muted) continue;
      for (const clip of track?.audioClips ?? []) {
        if (clip?.sourceUrl) allUrls?.add(clip?.sourceUrl);
      }
    }
    allUrls?.forEach((url) => {
      if (!buffersRef?.current.has(url)) {
        decodeAudio(url);
      }
    });
  }, [tracks, decodeAudio]);

  const stopAllSources = useCallback((fadeOut = false) => {
    const ctx = contextRef?.current;
    activeSourcesRef?.current.forEach(({ node, gainNode }) => {
      try {
        if (fadeOut && ctx) {
          gainNode?.gain.setTargetAtTime(0, ctx?.currentTime, 0.05);
          node?.stop(ctx?.currentTime + 0.15);
        } else {
          node?.stop();
        }
      } catch {}
    });
    activeSourcesRef?.current.clear();
  }, []);

  const scheduleClips = useCallback(
    (position: number) => {
      const ctx = getOrCreateContext();
      if (ctx?.state === "suspended") {
        ctx?.resume().catch(() => {});
      }

      stopAllSources(false);

      const contextNow = ctx?.currentTime;
      playStartContextTimeRef.current = contextNow;
      playStartPositionRef.current = position;

      const soloExists = tracks?.some((t) => t?.solo);

      for (const track of tracks) {
        if (track?.muted) continue;
        if (soloExists && !track?.solo) continue;

        for (const clip of track?.audioClips ?? []) {
          if (!clip?.sourceUrl) continue;
          const buffer = buffersRef?.current.get(clip?.sourceUrl);
          if (!buffer) continue;

          const clipStart = clip?.startTime;
          const clipEnd = clip?.startTime + clip?.duration;

          if (position > clipEnd) continue;

          const sourceNode = ctx?.createBufferSource();
          sourceNode.buffer = buffer;

          const gainNode = ctx?.createGain();
          gainNode.gain.value = Math.max(0, Math.min(1, track?.volume ?? 0.8));
          sourceNode?.connect(gainNode);
          gainNode?.connect(ctx?.destination);

          let startContextTime: number;
          let offsetIntoClip: number;

          if (position < clipStart) {
            startContextTime = contextNow + (clipStart - position);
            offsetIntoClip = 0;
          } else {
            startContextTime = contextNow;
            offsetIntoClip = position - clipStart;
          }

          const remainingDuration = clip?.duration - offsetIntoClip;
          if (remainingDuration <= 0) continue;

          try {
            sourceNode?.start(
              startContextTime,
              offsetIntoClip,
              remainingDuration,
            );
            activeSourcesRef?.current.set(clip?.id, {
              node: sourceNode,
              gainNode,
              clipId: clip.id,
            });

            sourceNode.onended = () => {
              activeSourcesRef?.current.delete(clip?.id);
            };
          } catch (err) {
            logger.warn(
              "[DAWPlayback] Failed to start source for clip:",
              clip?.id,
              err,
            );
          }
        }
      }
    },
    [tracks, getOrCreateContext, stopAllSources],
  );

  useEffect(() => {
    if (transport?.isPlaying && !isPlayingRef?.current) {
      isPlayingRef.current = true;
      scheduleClips(transport?.position);
    } else if (!transport?.isPlaying && isPlayingRef?.current) {
      isPlayingRef.current = false;
      stopAllSources(true);
    }
  }, [transport?.isPlaying]);

  useEffect(() => {
    if (!transport?.isPlaying) {
      stopAllSources(false);
    }
  }, [transport?.position]);

  useEffect(() => {
    return () => {
      stopAllSources(false);
      contextRef?.current?.close().catch(() => {});
    };
  }, []);

  const unlockAudio = useCallback(() => {
    const ctx = getOrCreateContext();
    if (ctx?.state === "suspended") {
      ctx?.resume().catch(() => {});
    }
  }, [getOrCreateContext]);

  return { decodeAudio, unlockAudio };
}
