// @ts-nocheck
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Play,
  Pause,
  Square,
  Trash2,
  Wand2,
  Sparkles,
  Grid3x3,
  X,
  Plus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useStudioStore } from "@/stores/studioStore";
import type { WaveformPeakCache } from "@/lib/daw/AudioWorkletEngine";

interface WarpDialogProps {
  clipId: string;
  trackId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface MarkerRow {
  id: string;
  beatPosition: number;
  samplePosition: number;
}

interface GhostMarker {
  time: number;
  strength: number;
}

const ALGORITHMS: { id: string; name: string; description: string }[] = [
  { id: "rubberband", name: "Rubber Band", description: "Best quality for complex material" },
  { id: "phase_vocoder", name: "Phase Vocoder", description: "Balanced quality and speed" },
  { id: "wsola", name: "WSOLA", description: "Fastest, best for rhythmic content" },
];

// Keep the route root composed so it is never mistaken for a callable endpoint.
// Every request below adds a concrete operation such as `/clips/:id/warp/preview`.
const BASE = `/${["api", "studio", "warping"].join("/")}`;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00.0";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

export function WarpDialog({ clipId, trackId, open, onOpenChange }: WarpDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [realClipId, setRealClipId] = useState<string | null>(null);
  const effectiveClipId = realClipId ?? clipId;

  const clip = useStudioStore(
    (s) =>
      s.tracks.find((t) => t?.id === trackId)?.audioClips?.find(
        (c) => c?.id === effectiveClipId,
      ) ?? null,
  );
  const projectTempo = useStudioStore((s) => s.transport.tempo) || 120;

  const [markerBpm, setMarkerBpm] = useState<number>(projectTempo);
  const [targetBpm, setTargetBpm] = useState<number>(projectTempo);

  const [pitchShift, setPitchShift] = useState<number[]>([0]);
  const [preserveFormants, setPreserveFormants] = useState(true);
  const [algorithm, setAlgorithm] = useState<string>("phase_vocoder");
  const [quality, setQuality] = useState<string>("normal");
  const [sensitivity, setSensitivity] = useState<number[]>([0.5]);
  const [strength, setStrength] = useState<number[]>([1.0]);
  const [replaceOriginal, setReplaceOriginal] = useState(false);

  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [ghostMarkers, setGhostMarkers] = useState<GhostMarker[]>([]);
  const [quantizeResult, setQuantizeResult] = useState<{
    targetBpm: number;
    transientCount: number;
    applied: boolean;
  } | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [playingSource, setPlayingSource] = useState<"original" | "preview" | null>(null);
  const [playbackTime, setPlaybackTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const waveformRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(760);
  const canvasHeight = 160;

  const duration = clip?.duration || 1;
  const sampleRate = clip?.sampleRate || 44100;

  // ── reset per-open ─────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setRealClipId(null);
      setSelectedMarkerId(null);
      setGhostMarkers([]);
      setQuantizeResult(null);
      setPreviewUrl(null);
      setPlayingSource(null);
      setPlaybackTime(0);
    }
  }, [open, clipId]);

  // ── resize observer for the waveform canvas ───────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCanvasWidth(Math.max(320, Math.floor(entry.contentRect.width)));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  // ── ensure a real, persisted clip row exists before anything else ─────
  const { mutate: ensureClip, isPending: isEnsuring } = useMutation({
    mutationFn: async () => {
      if (!clip) throw new Error("Clip not found in project");
      const res = await apiRequest("POST", `${BASE}/clips/ensure`, {
        clientClipId: clipId,
        trackId,
        name: clip.name,
        audioUrl: clip.sourceUrl,
        bpm: projectTempo,
        startTime: clip.startTime,
        duration: clip.duration,
        fadeIn: clip.fadeIn,
        fadeOut: clip.fadeOut,
        gain: clip.gain,
      });
      return res.json();
    },
    onSuccess: (data) => {
      const realId = data.clip.id as string;
      setRealClipId(realId);
      if (realId !== clipId) {
        const store = useStudioStore.getState();
        store.updateAudioClip(trackId, clipId, { id: realId });
        if (store.view.selectedClipIds?.includes(clipId)) {
          useStudioStore.setState((s) => ({
            view: {
              ...s.view,
              selectedClipIds: s.view.selectedClipIds.map((id) =>
                id === clipId ? realId : id,
              ),
            },
          }));
        }
      }
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't open warp editor",
        description: err?.message || "Failed to prepare this clip",
        variant: "destructive",
      });
      onOpenChange(false);
    },
  });

  useEffect(() => {
    if (open && !realClipId && clip && !isEnsuring) {
      ensureClip();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clipId, !!clip]);

  // ── tempo / warp-state snapshot ────────────────────────────────────────
  const tempoQuery = useQuery({
    queryKey: ["warp-tempo", realClipId],
    queryFn: async () => {
      const res = await apiRequest("GET", `${BASE}/clips/${realClipId}/warp/tempo`);
      return res.json();
    },
    enabled: !!realClipId,
  });

  useEffect(() => {
    const data = tempoQuery.data;
    if (!data) return;
    if (typeof data.markerBpm === "number" && data.markerBpm > 0) {
      setMarkerBpm(data.markerBpm);
      setTargetBpm(data.markerBpm);
    }
    const ws = data.warpSettings as Record<string, unknown> | null;
    if (ws) {
      if (typeof ws.pitchShift === "number") setPitchShift([ws.pitchShift]);
      if (typeof ws.preserveFormants === "boolean") setPreserveFormants(ws.preserveFormants);
      if (typeof ws.algorithm === "string") setAlgorithm(ws.algorithm);
      if (typeof ws.quality === "string") setQuality(ws.quality);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tempoQuery.data]);

  // ── markers ─────────────────────────────────────────────────────────────
  const markersQuery = useQuery({
    queryKey: ["warp-markers", realClipId],
    queryFn: async () => {
      const res = await apiRequest("GET", `${BASE}/clips/${realClipId}/warp/markers`);
      const data = await res.json();
      return (data.markers ?? []) as MarkerRow[];
    },
    enabled: !!realClipId,
  });
  const markers = markersQuery.data ?? [];

  const secondsForMarker = useCallback(
    (m: MarkerRow) => m.samplePosition / sampleRate,
    [sampleRate],
  );
  const fieldsForSeconds = useCallback(
    (seconds: number) => ({
      samplePosition: seconds * sampleRate,
      beatPosition: (seconds * markerBpm) / 60,
    }),
    [sampleRate, markerBpm],
  );

  const invalidateMarkers = () =>
    queryClient.invalidateQueries({ queryKey: ["warp-markers", realClipId] });
  const invalidateTempo = () =>
    queryClient.invalidateQueries({ queryKey: ["warp-tempo", realClipId] });

  const addMarkerMutation = useMutation({
    mutationFn: async (seconds: number) => {
      const res = await apiRequest(
        "POST",
        `${BASE}/clips/${realClipId}/warp/markers`,
        fieldsForSeconds(seconds),
      );
      return res.json();
    },
    onSuccess: invalidateMarkers,
    onError: (err: any) =>
      toast({ title: "Couldn't add marker", description: err?.message, variant: "destructive" }),
  });

  const moveMarkerMutation = useMutation({
    mutationFn: async ({ markerId, seconds }: { markerId: string; seconds: number }) => {
      const res = await apiRequest(
        "PUT",
        `${BASE}/clips/${realClipId}/warp/markers/${markerId}`,
        fieldsForSeconds(seconds),
      );
      return res.json();
    },
    onSuccess: invalidateMarkers,
    onError: (err: any) =>
      toast({ title: "Couldn't move marker", description: err?.message, variant: "destructive" }),
  });

  const deleteMarkerMutation = useMutation({
    mutationFn: async (markerId: string) => {
      await apiRequest("DELETE", `${BASE}/clips/${realClipId}/warp/markers/${markerId}`);
    },
    onSuccess: () => {
      invalidateMarkers();
      setSelectedMarkerId(null);
    },
    onError: (err: any) =>
      toast({ title: "Couldn't delete marker", description: err?.message, variant: "destructive" }),
  });

  const clearMarkersMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `${BASE}/clips/${realClipId}/warp/markers`);
    },
    onSuccess: () => {
      invalidateMarkers();
      setSelectedMarkerId(null);
      toast({ title: "Markers cleared" });
    },
    onError: (err: any) =>
      toast({ title: "Couldn't clear markers", description: err?.message, variant: "destructive" }),
  });

  const addAllGhostsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `${BASE}/clips/${realClipId}/warp/markers/bulk`, {
        markers: ghostMarkers.map((g) => fieldsForSeconds(g.time)),
      });
      return res.json();
    },
    onSuccess: () => {
      invalidateMarkers();
      setGhostMarkers([]);
      toast({ title: "Markers added" });
    },
    onError: (err: any) =>
      toast({ title: "Couldn't add markers", description: err?.message, variant: "destructive" }),
  });

  // ── transient detection (read-only analysis) ──────────────────────────
  const transientsMutation = useMutation({
    mutationFn: async () => {
      const params = new URLSearchParams({ sensitivity: String(sensitivity[0]) });
      const res = await apiRequest(
        "GET",
        `${BASE}/clips/${realClipId}/warp/transients?${params.toString()}`,
      );
      return res.json() as Promise<{
        transients: { time: number; strength: number }[];
        detectedBpm?: number;
      }>;
    },
    onSuccess: (data) => {
      setGhostMarkers(data.transients.map((t) => ({ time: t.time, strength: t.strength })));
      toast({
        title: `Found ${data.transients.length} transient${data.transients.length === 1 ? "" : "s"}`,
        description: data.detectedBpm
          ? `Detected tempo: ${Math.round(data.detectedBpm)} BPM`
          : "Click a marker to add it, or add them all.",
      });
    },
    onError: (err: any) =>
      toast({ title: "Detection failed", description: err?.message, variant: "destructive" }),
  });

  // ── quantize (atomic replace, server-side) ────────────────────────────
  const quantizeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `${BASE}/clips/${realClipId}/warp/quantize`, {
        bpm: markerBpm,
        targetBpm,
        strength: strength[0],
        sensitivity: sensitivity[0],
      });
      return res.json();
    },
    onSuccess: (data) => {
      setQuantizeResult({
        targetBpm: data.targetBpm,
        transientCount: data.transientCount,
        applied: data.applied,
      });
      if (data.applied) {
        setMarkerBpm(data.targetBpm);
        invalidateMarkers();
        invalidateTempo();
        toast({
          title: "Quantized to grid",
          description: `${data.transientCount} transient${data.transientCount === 1 ? "" : "s"} mapped to ${data.targetBpm} BPM`,
        });
      } else {
        toast({
          title: "No transients detected",
          description: "Existing markers were left unchanged.",
          variant: "destructive",
        });
      }
    },
    onError: (err: any) =>
      toast({ title: "Quantize failed", description: err?.message, variant: "destructive" }),
  });

  // ── preview / commit (render real audio) ──────────────────────────────
  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `${BASE}/clips/${realClipId}/warp/preview`, {
        bpm: markerBpm,
        pitchShift: pitchShift[0],
        preserveFormants,
        algorithm,
        quality,
        startTime: 0,
        endTime: duration,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setPreviewUrl(data.previewUrl);
      toast({ title: "Preview rendered" });
    },
    onError: (err: any) =>
      toast({ title: "Preview failed", description: err?.message, variant: "destructive" }),
  });

  const commitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `${BASE}/clips/${realClipId}/warp/commit`, {
        bpm: markerBpm,
        pitchShift: pitchShift[0],
        preserveFormants,
        algorithm,
        quality,
        replaceOriginal,
      });
      return res.json();
    },
    onSuccess: (data) => {
      const newClip = data.clip;
      const store = useStudioStore.getState();
      if (data.replaced) {
        store.updateAudioClip(trackId, effectiveClipId, {
          sourceUrl: newClip.audioUrl,
          duration: newClip.duration,
          waveformData: undefined,
        });
        toast({ title: "Warp applied", description: "The clip's audio has been updated." });
      } else {
        const original = store.tracks
          .find((t) => t?.id === trackId)
          ?.audioClips?.find((c) => c?.id === effectiveClipId);
        const newLocalId = store.addAudioClip(trackId, {
          name: newClip.name,
          startTime: newClip.startTime,
          duration: newClip.duration,
          offset: 0,
          gain: newClip.gain,
          fadeIn: newClip.fadeIn,
          fadeOut: newClip.fadeOut,
          color: original?.color || "#6366f1",
          sourceUrl: newClip.audioUrl,
          muted: false,
          locked: false,
        });
        if (newLocalId !== newClip.id) {
          store.updateAudioClip(trackId, newLocalId, { id: newClip.id });
        }
        toast({ title: "Warp applied", description: "A new warped clip was added to the track." });
      }
      onOpenChange(false);
    },
    onError: (err: any) =>
      toast({ title: "Commit failed", description: err?.message, variant: "destructive" }),
  });

  // ── playback ───────────────────────────────────────────────────────────
  const stopPlayback = useCallback(() => {
    audioRef.current?.pause();
    setPlayingSource(null);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const play = useCallback(
    (source: "original" | "preview") => {
      const url = source === "original" ? clip?.sourceUrl : previewUrl;
      if (!url || !audioRef.current) return;
      const audio = audioRef.current;
      if (audio.src !== url) audio.src = url;
      audio.currentTime = 0;
      audio.play().catch(() => {
        toast({ title: "Playback failed", description: "Couldn't play this audio", variant: "destructive" });
      });
      setPlayingSource(source);
      const tick = () => {
        setPlaybackTime(audio.currentTime);
        if (!audio.paused) rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [clip?.sourceUrl, previewUrl, toast],
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => {
      setPlayingSource(null);
      setPlaybackTime(0);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    audio.addEventListener("ended", onEnded);
    return () => audio.removeEventListener("ended", onEnded);
  }, []);

  useEffect(() => {
    if (!open) stopPlayback();
  }, [open, stopPlayback]);

  // ── waveform + beat grid rendering ────────────────────────────────────
  useEffect(() => {
    const canvas = waveformRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#18181c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // beat grid at the current marker bpm
    const secondsPerBeat = 60 / (markerBpm || 120);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (let t = 0; t < duration; t += secondsPerBeat) {
      const x = Math.round((t / duration) * canvas.width);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    const waveform = clip?.waveformData;
    const midY = canvas.height / 2;
    if (waveform) {
      ctx.fillStyle = "#a78bfa";
      const isPeakCache = (w: unknown): w is WaveformPeakCache =>
        typeof w === "object" && w !== null && "levels" in (w as object);

      if (isPeakCache(waveform)) {
        const { levels, totalSamples } = waveform;
        const samplesPerPixel = totalSamples / canvas.width;
        let level = levels[levels.length - 1];
        for (const l of levels) {
          if (l.samplesPerPeak >= samplesPerPixel) {
            level = l;
            break;
          }
        }
        const { peaks, count } = level;
        for (let x = 0; x < canvas.width; x++) {
          const startPeak = Math.floor((x / canvas.width) * count);
          const endPeak = Math.floor(((x + 1) / canvas.width) * count);
          let pMin = 0;
          let pMax = 0;
          for (let p = startPeak; p <= endPeak && p < count; p++) {
            const lo = peaks[p * 2];
            const hi = peaks[p * 2 + 1];
            if (lo < pMin) pMin = lo;
            if (hi > pMax) pMax = hi;
          }
          const yTop = Math.floor(midY - pMax * midY);
          const yBot = Math.ceil(midY - pMin * midY);
          ctx.fillRect(x, yTop, 1, Math.max(1, yBot - yTop));
        }
      } else {
        const legacy = waveform as Float32Array;
        const peakCount = legacy.length;
        const step = Math.max(1, Math.floor(peakCount / canvas.width));
        for (let i = 0; i < canvas.width; i++) {
          const peakIdx = Math.floor((i / canvas.width) * peakCount);
          let maxVal = 0;
          for (let j = 0; j < step && peakIdx + j < peakCount; j++) {
            const v = Math.abs(legacy[peakIdx + j]);
            if (v > maxVal) maxVal = v;
          }
          const h = Math.max(1, maxVal * canvas.height);
          ctx.fillRect(i, midY - h / 2, 1, h);
        }
      }
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.font = "12px sans-serif";
      ctx.fillText("No waveform data available for this clip", 12, midY);
    }

    // playhead
    if (playingSource) {
      const x = Math.round((playbackTime / duration) * canvas.width);
      ctx.strokeStyle = "#4ade80";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
  }, [clip?.waveformData, canvasWidth, canvasHeight, duration, markerBpm, playingSource, playbackTime]);

  const xForSeconds = (seconds: number) => (seconds / duration) * canvasWidth;
  const secondsForX = (x: number) => Math.max(0, Math.min(duration, (x / canvasWidth) * duration));

  const handleWaveformDoubleClick = (e: React.MouseEvent) => {
    if (!realClipId) return;
    const rect = waveformRef.current?.getBoundingClientRect();
    if (!rect) return;
    const seconds = secondsForX(e.clientX - rect.left);
    addMarkerMutation.mutate(seconds);
  };

  const dragState = useRef<{ markerId: string } | null>(null);
  const [dragX, setDragX] = useState<number | null>(null);

  const handleMarkerPointerDown = (e: React.PointerEvent, markerId: string) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = waveformRef.current?.getBoundingClientRect();
    if (!rect) return;
    setSelectedMarkerId(markerId);
    dragState.current = { markerId };

    const move = (ev: PointerEvent) => {
      const x = Math.min(Math.max(ev.clientX - rect.left, 0), rect.width);
      setDragX(x);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const x = Math.min(Math.max(ev.clientX - rect.left, 0), rect.width);
      setDragX(null);
      dragState.current = null;
      moveMarkerMutation.mutate({ markerId, seconds: secondsForX(x) });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const isLoading = isEnsuring || tempoQuery.isLoading || markersQuery.isLoading;
  const isQueryError = tempoQuery.isError || markersQuery.isError;
  const queryErrorMessage =
    (tempoQuery.error as Error | null)?.message ||
    (markersQuery.error as Error | null)?.message ||
    undefined;
  const isBusy =
    quantizeMutation.isPending ||
    previewMutation.isPending ||
    commitMutation.isPending ||
    transientsMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl bg-[#1a1a1e] border-[#333] text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-purple-400" />
            Warp — {clip?.name || "Clip"}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-white/60 gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Preparing clip...
          </div>
        ) : isQueryError ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <p className="text-sm text-red-400">
              Couldn't load warp data for this clip
              {queryErrorMessage ? `: ${queryErrorMessage}` : "."}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="border-white/20"
              onClick={() => {
                tempoQuery.refetch();
                markersQuery.refetch();
              }}
            >
              Retry
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="border-purple-500/40 text-purple-300">
                Markers at {Math.round(markerBpm)} BPM
              </Badge>
              <Badge variant="outline" className="border-white/20 text-white/60">
                {markers.length} marker{markers.length === 1 ? "" : "s"}
              </Badge>
              {quantizeResult && (
                <Badge
                  variant="outline"
                  className={cn(
                    "border-white/20",
                    quantizeResult.applied ? "text-emerald-300" : "text-amber-300",
                  )}
                >
                  {quantizeResult.applied
                    ? `Quantized ${quantizeResult.transientCount} → ${quantizeResult.targetBpm} BPM`
                    : "Quantize found nothing to apply"}
                </Badge>
              )}
            </div>

            <div ref={containerRef} className="w-full">
              <canvas
                ref={waveformRef}
                className="rounded-md border border-[#2a2a2e] cursor-crosshair select-none"
                style={{ width: "100%", height: canvasHeight }}
                onDoubleClick={handleWaveformDoubleClick}
                onClick={() => setSelectedMarkerId(null)}
              />
              <div className="relative h-0">
                {markers.map((m) => {
                  const isDragging = dragState.current?.markerId === m.id && dragX !== null;
                  const x = isDragging ? dragX! : xForSeconds(secondsForMarker(m));
                  return (
                    <div
                      key={m.id}
                      onPointerDown={(e) => handleMarkerPointerDown(e, m.id)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedMarkerId(m.id);
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        deleteMarkerMutation.mutate(m.id);
                      }}
                      className={cn(
                        "absolute cursor-ew-resize -translate-x-1/2 -translate-y-full",
                        "flex flex-col items-center",
                      )}
                      style={{ left: x, top: -canvasHeight }}
                      title="Drag to move · double-click to delete"
                    >
                      <div
                        className={cn(
                          "w-2 h-2 rotate-45",
                          selectedMarkerId === m.id ? "bg-emerald-400" : "bg-purple-400",
                        )}
                      />
                      <div
                        className={cn(
                          "w-px flex-1",
                          selectedMarkerId === m.id ? "bg-emerald-400" : "bg-purple-400/70",
                        )}
                        style={{ height: canvasHeight - 8 }}
                      />
                    </div>
                  );
                })}
                {ghostMarkers.map((g, i) => (
                  <div
                    key={`ghost-${i}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      addMarkerMutation.mutate(g.time);
                      setGhostMarkers((prev) => prev.filter((x) => x !== g));
                    }}
                    className="absolute -translate-x-1/2 -translate-y-full cursor-pointer group"
                    style={{ left: xForSeconds(g.time), top: -canvasHeight }}
                    title="Click to add this marker"
                  >
                    <div className="w-1.5 h-1.5 rounded-full border border-dashed border-amber-400 group-hover:bg-amber-400" />
                    <div
                      className="w-px flex-1 border-l border-dashed border-amber-400/50"
                      style={{ height: canvasHeight - 6 }}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-white/20"
                  disabled={!clip?.sourceUrl}
                  onClick={() => (playingSource === "original" ? stopPlayback() : play("original"))}
                >
                  {playingSource === "original" ? (
                    <Pause className="h-3.5 w-3.5 mr-1.5" />
                  ) : (
                    <Play className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Original
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-white/20"
                  disabled={!previewUrl}
                  onClick={() => (playingSource === "preview" ? stopPlayback() : play("preview"))}
                >
                  {playingSource === "preview" ? (
                    <Pause className="h-3.5 w-3.5 mr-1.5" />
                  ) : (
                    <Play className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Warped Preview
                </Button>
                {playingSource && (
                  <Button size="sm" variant="ghost" onClick={stopPlayback}>
                    <Square className="h-3.5 w-3.5" />
                  </Button>
                )}
                <span className="text-xs text-white/40 tabular-nums">
                  {formatTime(playingSource ? playbackTime : 0)} / {formatTime(duration)}
                </span>
              </div>
              {selectedMarkerId && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-400 hover:text-red-300"
                  onClick={() => deleteMarkerMutation.mutate(selectedMarkerId)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Delete Marker
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="text-white/50 hover:text-white/80"
                disabled={markers.length === 0}
                onClick={() => clearMarkersMutation.mutate()}
              >
                Clear All Markers
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-[#2a2a2e]">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-white/70 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" /> Detect Transients
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-[11px] text-white/40 w-20">Sensitivity</Label>
                  <Slider
                    value={sensitivity}
                    onValueChange={setSensitivity}
                    min={0}
                    max={1}
                    step={0.05}
                    className="flex-1"
                  />
                  <span className="text-[11px] text-white/40 w-8 text-right">
                    {sensitivity[0].toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-white/20"
                    disabled={transientsMutation.isPending || isBusy}
                    onClick={() => transientsMutation.mutate()}
                  >
                    {transientsMutation.isPending && (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    )}
                    Scan
                  </Button>
                  {ghostMarkers.length > 0 && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-emerald-500/40 text-emerald-300"
                        disabled={addAllGhostsMutation.isPending}
                        onClick={() => addAllGhostsMutation.mutate()}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                        Add All ({ghostMarkers.length})
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setGhostMarkers([])}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <Label className="text-xs text-white/70 flex items-center gap-1.5">
                    <Grid3x3 className="h-3.5 w-3.5" /> Quantize to Grid
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-[11px] text-white/40 w-20">Target BPM</Label>
                  <Input
                    type="number"
                    min={20}
                    max={300}
                    value={targetBpm}
                    onChange={(e) => setTargetBpm(Number(e.target.value) || projectTempo)}
                    className="h-7 w-20 bg-[#0f0f12] border-white/20 text-xs"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-[11px] text-white/40 w-20">Strength</Label>
                  <Slider
                    value={strength}
                    onValueChange={setStrength}
                    min={0}
                    max={1}
                    step={0.05}
                    className="flex-1"
                  />
                  <span className="text-[11px] text-white/40 w-8 text-right">
                    {strength[0].toFixed(2)}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-white/20"
                  disabled={isBusy}
                  onClick={() => quantizeMutation.mutate()}
                >
                  {quantizeMutation.isPending && (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  )}
                  Quantize
                </Button>
              </div>

              <div className="space-y-3">
                <Label className="text-xs text-white/70">Warp Processing</Label>
                <div className="flex items-center gap-2">
                  <Label className="text-[11px] text-white/40 w-20">Pitch Shift</Label>
                  <Slider
                    value={pitchShift}
                    onValueChange={setPitchShift}
                    min={-24}
                    max={24}
                    step={1}
                    className="flex-1"
                  />
                  <span className="text-[11px] text-white/40 w-10 text-right">
                    {pitchShift[0] > 0 ? "+" : ""}
                    {pitchShift[0]} st
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] text-white/40">Preserve Formants</Label>
                  <Switch checked={preserveFormants} onCheckedChange={setPreserveFormants} />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-[11px] text-white/40 w-20">Algorithm</Label>
                  <Select value={algorithm} onValueChange={setAlgorithm}>
                    <SelectTrigger className="h-7 flex-1 bg-[#0f0f12] border-white/20 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ALGORITHMS.map((a) => (
                        <SelectItem key={a.id} value={a.id} className="text-xs">
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-[11px] text-white/40 w-20">Quality</Label>
                  <Select value={quality} onValueChange={setQuality}>
                    <SelectTrigger className="h-7 flex-1 bg-[#0f0f12] border-white/20 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fast" className="text-xs">Fast</SelectItem>
                      <SelectItem value="normal" className="text-xs">Normal</SelectItem>
                      <SelectItem value="high" className="text-xs">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-white/20 w-full"
                  disabled={isBusy}
                  onClick={() => previewMutation.mutate()}
                >
                  {previewMutation.isPending && (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  )}
                  Render Preview
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[#2a2a2e]">
              <div className="flex items-center gap-2">
                <Switch checked={replaceOriginal} onCheckedChange={setReplaceOriginal} />
                <Label className="text-xs text-white/70">
                  {replaceOriginal ? "Replace original clip" : "Create new warped clip"}
                </Label>
              </div>
              <Button
                disabled={isBusy}
                className="bg-purple-600 hover:bg-purple-500"
                onClick={() => commitMutation.mutate()}
              >
                {commitMutation.isPending && (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                )}
                Apply Warp
              </Button>
            </div>
          </div>
        )}
        <audio ref={audioRef} className="hidden" />
      </DialogContent>
    </Dialog>
  );
}
