import { useState, useRef, useEffect } from "react";
import { getCsrfTokenFromCookie } from "@/lib/queryClient";
import { useLocation } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Download, Sparkles, Clock, Layout, Film, Zap, Layers, Mic, Image, FileText, Upload, CheckCircle, ChevronDown, ChevronUp, Camera, Music, BarChart2 } from "lucide-react";

interface ServerVideoGeneratorProps {
  platform: string;
  topic: string;
  tone?: string;
  goal?: string;
  artistName?: string;
  onVideoGenerated: (url: string) => void;
  onImportToStudio?: (url: string) => void;
  className?: string;
  // Pre-population props (used when arriving from URL params / ContentGenerator redirect)
  initialHook?: string;
  initialBody?: string;
  initialCta?: string;
  initialTemplate?: string;
  initialBgColor?: string;
  initialAccentColor?: string;
  /**
   * When true the component immediately starts video generation on mount using
   * the supplied topic/hook/body/cta — the user already expressed intent by
   * clicking "Generate", so no second click is needed.
   */
  autoStart?: boolean;
}

type InputMode = "text" | "audio" | "image" | "studio";

/**
 * Shape of a video-generation job record returned by `/api/social/generate-video`
 * and `/api/social/video-job/:id`. All fields are optional because the server
 * returns different subsets at different points (queued → processing → done).
 */
interface VideoJobData {
  job_id?: string;
  status?: string;
  success?: boolean;
  url?: string;
  video_url?: string;
  hook?: string;
  body?: string;
  cta?: string;
  source?: string;
  topic?: string;
  template?: string;
  template_name?: string;
  width?: number;
  height?: number;
  duration?: number;
  aspect_ratio?: string;
  platform?: string;
  processing_time_ms?: number;
  render_time_ms?: number;
  scenes_rendered?: number;
  quality?: string;
  hashtags?: string[];
  content_confidence?: number | null;
  sentiment_score?: number | null;
  sentiment_label?: string | null;
  error?: string;
  message?: string;
}

/** Subset of VideoJobData surfaced to the rendered UI in the result panel. */
interface VideoInfo {
  hook?: string;
  body?: string;
  cta?: string;
  source?: string;
  width?: number;
  height?: number;
  processingTime: number;
  renderTime: number;
  scenesRendered: number;
  templateName?: string;
  quality?: string;
  hashtags: string[];
  contentConfidence: number | null;
  sentimentScore: number | null;
  sentimentLabel: string | null;
}

/** Video-config block returned by the analyze-audio / analyze-image endpoints. */
interface VideoConfig {
  genre?: string;
  topic?: string;
  tone?: string;
  speed?: number;
  bg?: string;
  ac?: string;
  duration?: number;
  platform?: string;
}

/** Content seed derived from analyzed media. */
interface ContentSeed {
  topic?: string;
  genre?: string;
  artist?: string;
  track?: string;
}

/** Subset of the raw audio analysis surfaced in the UI. */
interface AudioAnalysisResult {
  genre?: string;
  tempo?: number;
  key?: string;
  error?: string;
}

/** Response shape of POST /api/social/analyze-audio. */
interface AudioAnalysisResponse {
  success?: boolean;
  message?: string;
  analysis?: AudioAnalysisResult;
  seed?: ContentSeed;
  content?: unknown;
  video_config?: VideoConfig;
}

/** Subset of the raw image analysis surfaced in the UI. */
interface ImageAnalysisResult {
  mood?: string;
  genre_hint?: string;
  error?: string;
}

/** Response shape of POST /api/social/analyze-image. */
interface ImageAnalysisResponse {
  success?: boolean;
  message?: string;
  analysis?: ImageAnalysisResult;
  seed?: ContentSeed;
  content?: unknown;
  video_config?: VideoConfig;
  palette?: string[];
}

/** Narrow an unknown caught value to a string message. */
function errMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "");
}
function errName(error: unknown): string | undefined {
  return error instanceof Error ? error.name : undefined;
}

const CINEMATIC_TEMPLATES = [
  {
    id: "cinematic_promo",
    name: "Cinematic Promo",
    description: "Film-quality dramatic lighting",
    category: "promo",
    color: "#e94560",
    icon: Film,
  },
  {
    id: "neon_pulse",
    name: "Neon Pulse",
    description: "Vibrant plasma energy",
    category: "energetic",
    color: "#ff6ec7",
    icon: Zap,
  },
  {
    id: "dark_cinema",
    name: "Dark Cinema",
    description: "Moody atmospheric film",
    category: "dramatic",
    color: "#1a1a2e",
    icon: Film,
  },
  {
    id: "aurora",
    name: "Aurora",
    description: "Northern lights waves",
    category: "atmospheric",
    color: "#40e0d0",
    icon: Sparkles,
  },
  {
    id: "music_video",
    name: "Music Video",
    description: "High-energy bold colors",
    category: "music",
    color: "#ff00ff",
    icon: Zap,
  },
  {
    id: "gold_luxury",
    name: "Gold Luxury",
    description: "Premium gold aesthetic",
    category: "luxury",
    color: "#d4af37",
    icon: Sparkles,
  },
  {
    id: "elegant_minimal",
    name: "Elegant",
    description: "Clean sophisticated",
    category: "professional",
    color: "#8b7355",
    icon: Layout,
  },
  {
    id: "vintage_film",
    name: "Vintage Film",
    description: "Retro 8mm aesthetic",
    category: "retro",
    color: "#5c4033",
    icon: Film,
  },
  {
    id: "ocean_wave",
    name: "Ocean Wave",
    description: "Calming ocean gradients",
    category: "calm",
    color: "#006994",
    icon: Sparkles,
  },
  {
    id: "fire_ember",
    name: "Fire & Ember",
    description: "Intense warm tones",
    category: "intense",
    color: "#ff4500",
    icon: Zap,
  },
  {
    id: "storyteller",
    name: "Storyteller",
    description: "Narrative progression",
    category: "narrative",
    color: "#2d2d44",
    icon: Layers,
  },
];

const ASPECT_RATIOS = [
  { id: "9:16", name: "Vertical (9:16)", hint: "TikTok, Reels, Shorts" },
  { id: "16:9", name: "Landscape (16:9)", hint: "YouTube, Twitter" },
  { id: "1:1", name: "Square (1:1)", hint: "Instagram, Facebook" },
  { id: "4:5", name: "Portrait (4:5)", hint: "Instagram, Facebook" },
];

const PLATFORM_DEFAULT_RATIO: Record<string, string> = {
  tiktok: "9:16",
  instagram: "1:1",
  youtube: "16:9",
  facebook: "1:1",
  twitter: "16:9",
  linkedin: "16:9",
  google_business: "16:9",
  threads: "1:1",
};

// Platform-specific visual templates — each platform has a distinct look & feel:
//  TikTok/Reels: fast neon energy  |  YouTube: dark cinematic  |  LinkedIn: clean minimal
//  Instagram: plasma promo  |  Twitter: punchy quick promo  |  Threads: storyteller
//  Facebook: announcement  |  Google Business: gold luxury branding
const PLATFORM_DEFAULT_TEMPLATE: Record<string, string> = {
  tiktok: "neon_pulse",
  instagram: "cinematic_promo",
  instagram_reels: "neon_pulse",
  youtube: "dark_cinema",
  facebook: "announcement",
  twitter: "promo",
  linkedin: "elegant_minimal",
  threads: "storyteller",
  google_business: "gold_luxury",
};

export function ServerVideoGenerator({
  platform,
  topic: topicProp,
  tone = "energetic",
  goal = "growth",
  artistName: artistNameProp = "",
  onVideoGenerated,
  onImportToStudio,
  className = "",
  initialHook = "",
  initialBody = "",
  initialCta = "",
  initialTemplate = "",
  initialBgColor = "",
  initialAccentColor = "",
  autoStart = false,
}: ServerVideoGeneratorProps) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [inputMode, setInputMode] = useState<InputMode>("text");
  // Tracks whether autoStart has already fired so it never fires twice
  const autoStartFiredRef = useRef(false);
  // True during the 400ms warm-up delay before autoStart fires — hides the form
  const [autoStartPending, setAutoStartPending] = useState(
    autoStart && !!(topicProp?.trim() || initialHook?.trim()),
  );

  // Text mode state
  const [textTopic, setTextTopic] = useState("");
  const [hook, setHook] = useState(initialHook);
  const [body, setBody] = useState(initialBody);
  const [cta, setCta] = useState(initialCta);
  const [showAdvanced, setShowAdvanced] = useState(
    !!(initialHook || initialBody || initialCta),
  );
  const [useTemplate, setUseTemplate] = useState(!!initialTemplate);
  const [selectedTemplate, setSelectedTemplate] = useState(
    initialTemplate || "cinematic_promo",
  );

  // Audio mode state
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioAnalysis, setAudioAnalysis] =
    useState<AudioAnalysisResponse | null>(null);
  const [isAnalyzingAudio, setIsAnalyzingAudio] = useState(false);

  // Image mode state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageAnalysis, setImageAnalysis] =
    useState<ImageAnalysisResponse | null>(null);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);

  // Voiceover
  const [voiceover, setVoiceover] = useState(false);

  // Photorealistic mode — MaxCore AI image + Ken Burns animation as the visual base
  const [photorealistic, setPhotorealistic] = useState(false);

  // Music Video Studio mode state — beat-synced full-song AI video
  const [studioAudioFile, setStudioAudioFile] = useState<File | null>(null);
  const [studioBeatAnalysis, setStudioBeatAnalysis] = useState<{
    bpm: number; confidence: number; durationSeconds: number;
    sections: Array<{ startTime: number; endTime: number; type: string; label: string; avgEnergy: number }>;
    tier: string;
  } | null>(null);
  const [studioGenre, setStudioGenre] = useState("hip-hop");
  const [studioHook, setStudioHook] = useState("");
  const [studioArtistStyle, setStudioArtistStyle] = useState("");
  const [isAnalyzingBeat, setIsAnalyzingBeat] = useState(false);
  const [studioMvJobId, setStudioMvJobId] = useState<string | null>(null);

  // Common state
  const [aspectRatio, setAspectRatio] = useState(
    PLATFORM_DEFAULT_RATIO[platform] || "9:16",
  );
  const [duration, setDuration] = useState(10);
  const [customArtistName, setCustomArtistName] = useState(artistNameProp);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingStage, setGeneratingStage] = useState<string>("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);

  const [renderProgress, setRenderProgress] = useState<number>(0);
  const blobUrlRef = useRef<string | null>(null); // tracks current blob URL so we can revoke on unmount

  const audioInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const studioAudioInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const userCancelledRef = useRef(false);
  const [generatingElapsed, setGeneratingElapsed] = useState(0);
  // Persists the active job ID so the visibilitychange handler can resume polling
  const activeJobIdRef = useRef<string | null>(null);

  useEffect(() => {
    setAspectRatio(PLATFORM_DEFAULT_RATIO[platform] || "9:16");
  }, [platform]);

  useEffect(() => {
    if (topicProp && !textTopic) setTextTopic(topicProp);
  }, [topicProp]);

  // Resume polling when the page becomes visible again (e.g. user returns from
  // background on mobile).  If a job is still active, immediately check its status
  // so the result surfaces without waiting for the next 2s poll tick.
  useEffect(() => {
    const onVisible = () => {
      const jobId = activeJobIdRef.current;
      if (!jobId || document.visibilityState !== "visible") return;
      fetch(`/api/social/video-job/${jobId}`, { credentials: "include" })
        .then((r) => r.json() as Promise<VideoJobData>)
        .then((data) => {
          const url = data.url || data.video_url;
          if ((data.status === "done" || data.status === "completed") && url) {
            activeJobIdRef.current = null;
            applyVideoResult({ ...data, success: true, url });
            setIsGenerating(false);
            setGeneratingStage("");
            setGeneratingElapsed(0);
          }
        })
        .catch(() => {
          /* silent — the running poll loop will handle it */
        });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // INTENTIONAL: mount-only effect — the handler only needs to access refs (stable) and
    // activeJobIdRef/applyVideoResult are always current via ref indirection. Adding them
    // as deps would re-register the visibilitychange listener on every render.
     
  }, []);

  // Clean up image preview URL on unmount
  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  // Revoke any blob URL when the component unmounts or a new video replaces it
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  const applyVideoResult = (data: VideoJobData) => {
    const finalUrl = data.url ?? data.video_url ?? "";
    setVideoUrl(finalUrl || null);
    setVideoInfo({
      hook: data.hook,
      body: data.body,
      cta: data.cta,
      source: data.source,
      width: data.width,
      height: data.height,
      processingTime: Math.round(data.processing_time_ms ?? 0),
      renderTime: Math.round(data.render_time_ms ?? 0),
      scenesRendered: data.scenes_rendered ?? 1,
      templateName: data.template_name ?? data.template,
      quality: data.quality,
      hashtags: data.hashtags ?? [],
      contentConfidence: data.content_confidence ?? null,
      sentimentScore: data.sentiment_score ?? null,
      sentimentLabel: data.sentiment_label ?? null,
    });
    if (finalUrl) onVideoGenerated(finalUrl);
  };

  const pollJobUntilDone = async (jobId: string): Promise<VideoJobData> => {
    activeJobIdRef.current = jobId;
    const maxAttempts = 90; // 3 min budget (90 × 2s)
    let consecutiveErrors = 0;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      if (userCancelledRef.current) throw new Error("Cancelled");
      try {
        const resp = await fetch(`/api/social/video-job/${jobId}`, {
          credentials: "include",
        });
        const text = await resp.text();
        let data: VideoJobData;
        try {
          data = JSON.parse(text) as VideoJobData;
        } catch {
          throw new Error("Unexpected response from server");
        }
        consecutiveErrors = 0;

        // Server returns status='completed' with video_url — normalise to the
        // shape callGenerateVideo expects: {success:true, url, ...rest}
        const videoUrl = data.url || data.video_url;
        const isDone =
          (data.status === "done" || data.status === "completed") && videoUrl;
        if (isDone) {
          activeJobIdRef.current = null;
          return { ...data, success: true, url: videoUrl };
        }
        if (data.status === "error")
          throw new Error(data.error || "Video generation failed");
        setGeneratingStage(`Rendering… (${Math.round((i + 1) * 2)}s)`);
      } catch (err) {
        const msg = errMessage(err);
        if (msg === "Cancelled" || msg === "Video generation failed") throw err;
        // Network/parse error — retry up to 5 times before giving up
        consecutiveErrors++;
        if (consecutiveErrors >= 5)
          throw new Error(
            "Network error during video generation. Please check your connection.",
          );
        // Back off briefly on error then retry
        await new Promise((r) => setTimeout(r, 1000 * consecutiveErrors));
      }
    }
    throw new Error("Video generation timed out. Please try again.");
  };

  const callGenerateVideo = async (payload: Record<string, unknown>) => {
    setIsGenerating(true);
    setGeneratingStage("Starting…");
    setVideoUrl(null);
    setVideoInfo(null);

    // 45-second timeout on the initial POST — the server responds immediately
    // (job queued) so >45s means the server is unreachable or the session is
    // stuck.  Polling has its own 120-second budget via maxAttempts.
    userCancelledRef.current = false;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 45 * 1000);

    // Elapsed-time counter (updates every second so the user sees progress)
    setGeneratingElapsed(0);
    const elapsedInterval = setInterval(
      () => setGeneratingElapsed((s) => s + 1),
      1000,
    );

    try {
      const csrfToken = getCsrfTokenFromCookie();
      const response = await fetch("/api/social/generate-video", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({
          platform,
          aspect_ratio: aspectRatio,
          duration,
          tone,
          goal,
          artist_name: customArtistName || undefined,
          ...payload,
        }),
      });

      const rawText = await response.text();
      let data: VideoJobData;
      try {
        data = JSON.parse(rawText) as VideoJobData;
      } catch {
        throw new Error(
          response.ok
            ? "Invalid server response"
            : `Server error (${response.status})`,
        );
      }

      if (response.status === 401) {
        // SPA navigation — no full-page reload, no session loss
        toast({
          title: "Session expired",
          description: "Please sign in again to continue.",
          variant: "destructive",
        });
        setLocation(
          `/login?redirect=${encodeURIComponent(window.location.pathname)}`,
        );
        return;
      }
      if (!response.ok)
        throw new Error(
          data?.message || data?.error || "Video generation failed",
        );

      if (data.job_id && data.status === "processing") {
        setGeneratingStage("Rendering frames…");
        data = await pollJobUntilDone(data.job_id);
      }
      // After polling, `data.url` is guaranteed when success is true.
      if (data.success && data.url) {
        // MaxCore returns a real H.264 MP4 (moov-first / faststart).
        // Use the server URL directly — no client-side re-render needed.
        clearTimeout(timeoutId);
        applyVideoResult(data);
        const w = data.width || 1080;
        const h = data.height || 1920;
        const dur = data.duration || duration || 10;
        toast({
          title: "Video Ready",
          description: `${w}×${h} · ${dur}s · MaxCore H.264`,
        });
      } else {
        throw new Error(data.error || "Video generation failed");
      }
    } catch (error) {
      const message = errMessage(error);
      if (errName(error) === "AbortError") {
        if (userCancelledRef.current) {
          toast({
            title: "Cancelled",
            description: "Video generation was cancelled.",
          });
        } else {
          toast({
            title: "Generation Timed Out",
            description: "The server didn't respond in time. Please try again.",
            variant: "destructive",
          });
        }
      } else {
        const isRestartError = message.includes("restarted");
        toast({
          title: isRestartError ? "Server Restarted" : "Generation Failed",
          description: message || "Could not generate video",
          variant: "destructive",
        });
      }
      // Auto-start failed — unlock the form so the user can adjust and try manually.
      if (autoStart) {
        autoStartFiredRef.current = false;
      }
    } finally {
      clearTimeout(timeoutId);
      clearInterval(elapsedInterval);
      abortControllerRef.current = null;
      userCancelledRef.current = false;
      activeJobIdRef.current = null;
      setIsGenerating(false);
      setGeneratingStage("");
      setGeneratingElapsed(0);
    }
  };

  // Auto-start: fire generation immediately when the parent already has the
  // user's topic/content and just needs the video rendered.  We use a short
  // delay so React has flushed the initial state (textTopic from topicProp).
  // Must be placed after callGenerateVideo is defined to avoid TDZ issues.
  useEffect(() => {
    if (!autoStart || autoStartFiredRef.current) return;
    const hasContent = !!(topicProp?.trim() || initialHook?.trim());
    if (!hasContent) return;
    autoStartFiredRef.current = true;
    const id = setTimeout(() => {
      setAutoStartPending(false);
      const hasScript = !!(
        initialHook?.trim() ||
        initialBody?.trim() ||
        initialCta?.trim()
      );
      const platformTemplate =
        PLATFORM_DEFAULT_TEMPLATE[platform] || "cinematic_promo";
      const chosenTemplate = initialTemplate || platformTemplate;
      callGenerateVideo({
        topic: topicProp.trim() || initialHook?.trim(),
        hook: initialHook || undefined,
        body: initialBody || undefined,
        cta: initialCta || undefined,
        template: chosenTemplate,
        quality: "cinematic",
        bg_color: initialBgColor || undefined,
        accent_color: initialAccentColor || undefined,
        voiceover: hasScript,
      });
    }, 100);
    return () => {
      clearTimeout(id);
      // Reset so a React StrictMode double-invocation (or real remount) can
      // start the timer again — without this the second invocation sees
      // autoStartFiredRef.current = true and returns early, leaving
      // autoStartPending = true forever.
      autoStartFiredRef.current = false;
    };
    // INTENTIONAL: mount-only effect — all props accessed here (topic, hook, template, etc.)
    // are captured at mount time intentionally. Including them would re-trigger auto-start on
    // every prop change; the ref guard (autoStartFiredRef) is sufficient to ensure single-fire.
     
  }, []);

  // ── Text mode ────────────────────────────────────────────────────────────────

  const handleGenerateFromText = async () => {
    const topic = textTopic.trim() || topicProp.trim();
    if (!topic && !hook) {
      toast({
        title: "Content Required",
        description: "Enter a topic or hook text.",
        variant: "destructive",
      });
      return;
    }
    await callGenerateVideo({
      topic: topic || hook,
      hook: hook || undefined,
      body: body || undefined,
      cta: cta || undefined,
      template: photorealistic ? undefined : (useTemplate ? selectedTemplate : undefined),
      quality: photorealistic ? "photorealistic" : (useTemplate ? "cinematic" : undefined),
      bg_color: initialBgColor || undefined,
      accent_color: initialAccentColor || undefined,
      voiceover,
    });
  };

  // ── Audio mode ───────────────────────────────────────────────────────────────

  const handleAudioFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAudioFile(file);
    setAudioAnalysis(null);
  };

  const handleAnalyzeAudio = async () => {
    if (!audioFile) return;
    setIsAnalyzingAudio(true);
    try {
      const form = new FormData();
      form.append("audio", audioFile);
      form.append("platform", platform);
      const csrfToken = getCsrfTokenFromCookie();
      const resp = await fetch("/api/social/analyze-audio", {
        method: "POST",
        credentials: "include",
        headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
        body: form,
      });
      const data = await resp.json();
      if (!resp.ok || !data.success)
        throw new Error(data.message || "Audio analysis failed");
      setAudioAnalysis(data);
      toast({
        title: "Audio Analyzed",
        description: `Detected: ${data.analysis?.genre || "music"} — ${data.analysis?.tempo ? Math.round(data.analysis.tempo) + " BPM" : ""}`,
      });
    } catch (err) {
      toast({
        title: "Analysis Failed",
        description: errMessage(err),
        variant: "destructive",
      });
    } finally {
      setIsAnalyzingAudio(false);
    }
  };

  const handleGenerateFromAudio = async () => {
    if (!audioAnalysis) {
      toast({
        title: "Analyze First",
        description: "Analyze your audio file before generating.",
        variant: "destructive",
      });
      return;
    }
    const vc: VideoConfig = audioAnalysis.video_config || {};
    await callGenerateVideo({
      topic: vc.topic || audioAnalysis.seed?.topic || "music",
      tone: vc.tone || tone,
      bg_color: vc.bg,
      accent_color: vc.ac,
      quality: photorealistic ? "photorealistic" : undefined,
      voiceover,
    });
  };

  // ── Image mode ───────────────────────────────────────────────────────────────

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImageAnalysis(null);
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(URL.createObjectURL(file));
  };

  const handleAnalyzeImage = async () => {
    if (!imageFile) return;
    setIsAnalyzingImage(true);
    try {
      const form = new FormData();
      form.append("image", imageFile);
      form.append("platform", platform);
      if (customArtistName) form.append("artist_name", customArtistName);
      const csrfToken2 = getCsrfTokenFromCookie();
      const resp = await fetch("/api/social/analyze-image", {
        method: "POST",
        credentials: "include",
        headers: csrfToken2 ? { "x-csrf-token": csrfToken2 } : {},
        body: form,
      });
      const data = await resp.json();
      if (!resp.ok || !data.success)
        throw new Error(data.message || "Image analysis failed");
      setImageAnalysis(data);
      toast({
        title: "Image Analyzed",
        description: `Mood: ${data.analysis?.mood || "detected"} — colors extracted`,
      });
    } catch (err) {
      toast({
        title: "Analysis Failed",
        description: errMessage(err),
        variant: "destructive",
      });
    } finally {
      setIsAnalyzingImage(false);
    }
  };

  const handleGenerateFromImage = async () => {
    if (!imageAnalysis) {
      toast({
        title: "Analyze First",
        description: "Analyze your image before generating.",
        variant: "destructive",
      });
      return;
    }
    const vc: VideoConfig = imageAnalysis.video_config || {};
    await callGenerateVideo({
      topic: vc.topic || imageAnalysis.seed?.topic || "music aesthetic",
      tone: vc.tone || tone,
      bg_color: vc.bg,
      accent_color: vc.ac,
      quality: photorealistic ? "photorealistic" : undefined,
      voiceover,
    });
  };

  // ── Music Video Studio handlers ───────────────────────────────────────────────

  const handleStudioAudioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStudioAudioFile(file);
    setStudioBeatAnalysis(null);
  };

  const handleAnalyzeBeat = async () => {
    if (!studioAudioFile) return;
    setIsAnalyzingBeat(true);
    try {
      const fd = new FormData();
      fd.append("audio", studioAudioFile);
      const resp = await fetch("/api/social/beat-analyze", {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": getCsrfTokenFromCookie() || "" },
        body: fd,
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) throw new Error(data.error || "Beat analysis failed");
      setStudioBeatAnalysis(data);
      toast({ title: "Beat Analyzed", description: `${Math.round(data.bpm)} BPM · ${data.sections?.length ?? 0} sections detected` });
    } catch (err) {
      toast({ title: "Analysis Failed", description: errMessage(err), variant: "destructive" });
    } finally {
      setIsAnalyzingBeat(false);
    }
  };

  const handleGenerateMusicVideo = async () => {
    if (!studioAudioFile) return;
    setIsGenerating(true);
    setGeneratingStage("Analyzing beats…");
    setRenderProgress(0);
    try {
      const fd = new FormData();
      fd.append("audio", studioAudioFile);
      fd.append("ai_generate_scenes", "true");
      fd.append("genre", studioGenre);
      fd.append("hook", studioHook || "");
      fd.append("artist_style", studioArtistStyle || "");
      fd.append("artist_name", customArtistName || "");
      fd.append("platform", platform);
      fd.append("aspect_ratio", aspectRatio);
      fd.append("beat_sync", "true");
      fd.append("color_grade", "cinematic");
      fd.append("max_scenes", "8");
      const csrf = getCsrfTokenFromCookie();
      if (csrf) fd.append("_csrf", csrf);

      const resp = await fetch("/api/social/generate-music-video", {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": csrf || "" },
        body: fd,
      });
      const initData = await resp.json();
      if (!resp.ok || !initData.success) throw new Error(initData.error || "Job start failed");

      const jobId = initData.jobId as string;
      setStudioMvJobId(jobId);
      activeJobIdRef.current = jobId;
      setGeneratingStage("Generating AI scenes…");

      // Poll music-video-job endpoint
      const poll = async (): Promise<void> => {
        const jobResp = await fetch(`/api/social/music-video-job/${jobId}`, { credentials: "include" });
        const jobData = await jobResp.json();
        if (jobData.status === "done") {
          const r = jobData.result as Record<string, unknown>;
          const url = (r?.url as string) || "";
          applyVideoResult({
            success: true,
            url,
            hook: studioHook || undefined,
            bpm: r?.bpm as number,
            viral_score: r?.viralScore as number,
            viral_recommendation: r?.viralRecommendation as string,
            duration: r?.durationSeconds as number,
            scenes_count: (r?.scenes as unknown[])?.length,
          });
          setIsGenerating(false);
          setGeneratingStage("");
          activeJobIdRef.current = null;
          if (r?.viralScore) {
            toast({ title: `Viral Score: ${r.viralScore}/100`, description: (r.viralRecommendation as string) || undefined });
          }
          return;
        }
        if (jobData.status === "error") {
          throw new Error(jobData.error || "Music video generation failed");
        }
        await new Promise((r) => setTimeout(r, 3000));
        return poll();
      };

      setGeneratingStage("Rendering beat-synced video…");
      await poll();
    } catch (err) {
      toast({ title: "Music Video Failed", description: errMessage(err), variant: "destructive" });
      setIsGenerating(false);
      setGeneratingStage("");
    }
  };

  // ── Mode can be reset ─────────────────────────────────────────────────────────

  const resetVideo = () => {
    setVideoUrl(null);
    setVideoInfo(null);
  };

  const inputModes: { id: InputMode; label: string; icon: React.ReactNode }[] =
    [
      { id: "text", label: "Text", icon: <FileText className="h-3.5 w-3.5" /> },
      { id: "audio", label: "Audio", icon: <Mic className="h-3.5 w-3.5" /> },
      { id: "image", label: "Image", icon: <Image className="h-3.5 w-3.5" /> },
      { id: "studio", label: "MV Studio", icon: <Music className="h-3.5 w-3.5" /> },
    ];

  // In autoStart mode show only the progress/result view — no form
  const isAutoMode = autoStart && !!(topicProp?.trim() || initialHook?.trim());

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Film className="h-5 w-5" />
          {isAutoMode ? "Creating Your Video" : "AI Video Studio"}
        </CardTitle>
        <CardDescription>
          {isAutoMode
            ? videoUrl
              ? "Your video is ready — watch and download below."
              : isGenerating || autoStartPending
                ? "Your video is rendering. This usually takes 1–3 minutes."
                : "Something went wrong. Adjust settings below and try again."
            : "Generate cinematic videos from text, audio, or artwork"}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ── AUTO-START: show only progress + result, hide the form ── */}
        {isAutoMode && (isGenerating || videoUrl || autoStartPending) && (
          <div className="space-y-4">
            {(isGenerating || autoStartPending) &&
              (() => {
                const isCompositing = generatingStage.startsWith("Compositing");
                // During compositing use exact render progress, otherwise use time-based estimate
                const EXPECTED_S = 25;
                const pct = autoStartPending
                  ? 0
                  : isCompositing
                    ? renderProgress
                    : Math.min(
                        95,
                        Math.round(
                          100 *
                            (1 - Math.exp(-generatingElapsed / EXPECTED_S)) *
                            1.05,
                        ),
                      );

                // Stage label from elapsed
                const stageLabel = autoStartPending
                  ? "Starting up…"
                  : generatingStage && generatingStage !== "Starting…"
                    ? generatingStage
                    : generatingElapsed < 3
                      ? "Queuing job…"
                      : generatingElapsed < 10
                        ? "Generating AI script…"
                        : generatingElapsed < 18
                          ? "Rendering scenes…"
                          : "Adding music & compositing…";

                return (
                  <div className="flex flex-col items-center gap-5 py-8">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                      <Film className="absolute inset-0 m-auto h-6 w-6 text-primary" />
                    </div>

                    <div className="w-full max-w-xs space-y-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {stageLabel}
                        </span>
                        <span className="tabular-nums">{pct}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-1000 ease-out"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      {isGenerating && generatingElapsed > 0 && (
                        <p className="text-right text-xs text-muted-foreground tabular-nums">
                          {generatingElapsed}s elapsed
                        </p>
                      )}
                    </div>

                    {topicProp && (
                      <div className="max-w-xs text-center rounded-lg bg-muted/50 px-3 py-2">
                        <p className="text-xs text-muted-foreground truncate">
                          "{topicProp}"
                        </p>
                      </div>
                    )}
                    {isGenerating && (
                      <button
                        onClick={() => {
                          userCancelledRef.current = true;
                          abortControllerRef.current?.abort();
                        }}
                        className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                );
              })()}

            {videoUrl && (
              <div className="space-y-3">
                <div className="rounded-lg overflow-hidden border bg-black">
                  <video
                    src={videoUrl}
                    className="w-full"
                    style={{ maxHeight: 420 }}
                    controls
                    autoPlay
                    muted
                    playsInline
                  />
                </div>
                {videoInfo && (
                  <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-[10px]">
                        {videoInfo.width}×{videoInfo.height}
                      </Badge>
                      {videoInfo.scenesRendered > 1 && (
                        <Badge variant="outline" className="text-[10px]">
                          <Layers className="h-2.5 w-2.5 mr-1" />
                          {videoInfo.scenesRendered} Scenes
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px]">
                        {(videoInfo.processingTime / 1000).toFixed(1)}s render
                      </Badge>
                      {(videoInfo.source === "ai_model" ||
                        videoInfo.source === "MaxCoreAI") && (
                        <Badge variant="default" className="text-[10px]">
                          <Sparkles className="h-2.5 w-2.5 mr-1" />
                          AI Generated
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <a
                    href={videoUrl}
                    download={`maxbooster-video-${platform}.mp4`}
                    className="inline-flex items-center justify-center flex-1 rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download MP4
                  </a>
                  {onImportToStudio && (
                    <button
                      onClick={() => onImportToStudio(videoUrl!)}
                      className="inline-flex items-center justify-center flex-1 rounded-md text-sm font-medium h-9 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    >
                      <Film className="h-4 w-4 mr-2" />
                      Import to Studio
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Hide the full form while auto-generating, after success, or during startup delay.
            If auto-start fails, autoStartFiredRef resets to false and the form appears. */}
        {!(isAutoMode && (isGenerating || videoUrl)) &&
          !autoStartPending &&
          !(isAutoMode && autoStartFiredRef.current) && (
            <>
              {/* Input mode tabs */}
              <div className="flex rounded-lg border overflow-hidden">
                {inputModes.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setInputMode(m.id);
                      resetVideo();
                    }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors ${
                      inputMode === m.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {m.icon}
                    {m.label}
                  </button>
                ))}
              </div>

              {/* ── TEXT MODE ── */}
              {inputMode === "text" && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                      Topic / Description
                    </Label>
                    <Textarea
                      value={textTopic}
                      onChange={(e) => setTextTopic(e.target.value)}
                      placeholder={
                        topicProp ||
                        "e.g., New single dropping Friday, behind the scenes studio session…"
                      }
                      rows={3}
                      className="resize-none"
                    />
                  </div>

                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showAdvanced ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                    {showAdvanced ? "Hide" : "Add"} hook / body / CTA (optional)
                  </button>

                  {showAdvanced && (
                    <div className="space-y-2 pl-2 border-l-2 border-muted">
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">
                          Hook (opening line)
                        </Label>
                        <Input
                          value={hook}
                          onChange={(e) => setHook(e.target.value)}
                          placeholder="Attention-grabbing first line…"
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">
                          Body (main message)
                        </Label>
                        <Input
                          value={body}
                          onChange={(e) => setBody(e.target.value)}
                          placeholder="Core message…"
                          className="h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">
                          CTA (call to action)
                        </Label>
                        <Input
                          value={cta}
                          onChange={(e) => setCta(e.target.value)}
                          placeholder="Stream now, follow for more…"
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setUseTemplate(!useTemplate)}
                      className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                        useTemplate
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      <Layout className="h-3 w-3" />
                      {useTemplate
                        ? "Visual Style: ON"
                        : "Visual Style (optional)"}
                    </button>
                  </div>

                  {useTemplate && (
                    <div className="grid grid-cols-3 gap-1.5 max-h-[200px] overflow-y-auto pr-1">
                      {CINEMATIC_TEMPLATES.map((t) => {
                        const Icon = t.icon;
                        return (
                          <button
                            key={t.id}
                            onClick={() => setSelectedTemplate(t.id)}
                            className={`p-2 rounded-lg border text-left transition-all ${
                              selectedTemplate === t.id
                                ? "border-primary bg-primary/5 ring-1 ring-primary"
                                : "border-border hover:border-primary/50"
                            }`}
                          >
                            <div className="flex items-center gap-1.5 mb-1">
                              <div
                                className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: t.color }}
                              />
                              <Icon className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            </div>
                            <span className="text-[11px] font-medium block leading-tight">
                              {t.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── AUDIO MODE ── */}
              {inputMode === "audio" && (
                <div className="space-y-3">
                  <input
                    ref={audioInputRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={handleAudioFileChange}
                  />
                  <button
                    onClick={() => audioInputRef.current?.click()}
                    className={`w-full rounded-lg border-2 border-dashed p-6 flex flex-col items-center gap-2 transition-colors ${
                      audioFile
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50 hover:bg-muted/30"
                    }`}
                  >
                    {audioFile ? (
                      <>
                        <CheckCircle className="h-8 w-8 text-primary" />
                        <span className="text-sm font-medium">
                          {audioFile.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {(audioFile.size / 1024 / 1024).toFixed(2)} MB — click
                          to change
                        </span>
                      </>
                    ) : (
                      <>
                        <Upload className="h-8 w-8 text-muted-foreground" />
                        <span className="text-sm font-medium">
                          Upload an audio file
                        </span>
                        <span className="text-xs text-muted-foreground">
                          MP3, WAV, AAC, FLAC, OGG
                        </span>
                      </>
                    )}
                  </button>

                  {audioFile && !audioAnalysis && (
                    <Button
                      onClick={handleAnalyzeAudio}
                      disabled={isAnalyzingAudio}
                      variant="outline"
                      className="w-full"
                    >
                      {isAnalyzingAudio ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Analyzing audio…
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-2" />
                          Analyze Audio
                        </>
                      )}
                    </Button>
                  )}

                  {audioAnalysis && (
                    <div className="bg-muted/40 rounded-lg p-3 space-y-1.5 text-xs">
                      <p className="font-medium text-sm">Audio Analyzed</p>
                      {audioAnalysis.analysis?.genre && (
                        <div className="flex gap-2">
                          <span className="text-muted-foreground">Genre:</span>
                          <Badge
                            variant="secondary"
                            className="text-[10px] h-4"
                          >
                            {audioAnalysis.analysis.genre}
                          </Badge>
                        </div>
                      )}
                      {audioAnalysis.analysis?.tempo && (
                        <div className="flex gap-2">
                          <span className="text-muted-foreground">Tempo:</span>
                          <span>
                            {Math.round(audioAnalysis.analysis.tempo)} BPM
                          </span>
                        </div>
                      )}
                      {audioAnalysis.analysis?.key && (
                        <div className="flex gap-2">
                          <span className="text-muted-foreground">Key:</span>
                          <span>{audioAnalysis.analysis.key}</span>
                        </div>
                      )}
                      {audioAnalysis.seed?.topic && (
                        <div className="flex gap-2">
                          <span className="text-muted-foreground">Topic:</span>
                          <span className="text-foreground">
                            {audioAnalysis.seed.topic}
                          </span>
                        </div>
                      )}
                      <button
                        onClick={() => {
                          setAudioAnalysis(null);
                          setAudioFile(null);
                        }}
                        className="text-[10px] text-muted-foreground underline pt-1"
                      >
                        Clear and re-upload
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── IMAGE MODE ── */}
              {inputMode === "image" && (
                <div className="space-y-3">
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageFileChange}
                  />
                  <button
                    onClick={() => imageInputRef.current?.click()}
                    className={`w-full rounded-lg border-2 border-dashed transition-colors overflow-hidden ${
                      imageFile
                        ? "border-primary"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    {imagePreviewUrl ? (
                      <div className="relative">
                        <img
                          src={imagePreviewUrl}
                          alt="Artwork preview"
                          className="w-full max-h-48 object-cover"
                        />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                          <span className="text-white text-sm font-medium">
                            Click to change
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-6 flex flex-col items-center gap-2">
                        <Upload className="h-8 w-8 text-muted-foreground" />
                        <span className="text-sm font-medium">
                          Upload artwork or image
                        </span>
                        <span className="text-xs text-muted-foreground">
                          JPG, PNG, WEBP — colors & mood are extracted
                        </span>
                      </div>
                    )}
                  </button>

                  {imageFile && !imageAnalysis && (
                    <Button
                      onClick={handleAnalyzeImage}
                      disabled={isAnalyzingImage}
                      variant="outline"
                      className="w-full"
                    >
                      {isAnalyzingImage ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Analyzing image…
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-2" />
                          Analyze Image
                        </>
                      )}
                    </Button>
                  )}

                  {imageAnalysis && (
                    <div className="bg-muted/40 rounded-lg p-3 space-y-2 text-xs">
                      <p className="font-medium text-sm">Image Analyzed</p>
                      {imageAnalysis.analysis?.mood && (
                        <div className="flex gap-2">
                          <span className="text-muted-foreground">Mood:</span>
                          <span>{imageAnalysis.analysis.mood}</span>
                        </div>
                      )}
                      {imageAnalysis.analysis?.genre_hint && (
                        <div className="flex gap-2">
                          <span className="text-muted-foreground">
                            Genre hint:
                          </span>
                          <Badge
                            variant="secondary"
                            className="text-[10px] h-4"
                          >
                            {imageAnalysis.analysis.genre_hint}
                          </Badge>
                        </div>
                      )}
                      {imageAnalysis.palette &&
                        imageAnalysis.palette.length > 0 && (
                          <div>
                            <span className="text-muted-foreground block mb-1">
                              Extracted palette:
                            </span>
                            <div className="flex gap-1.5">
                              {imageAnalysis.palette
                                .slice(0, 5)
                                .map((color: string, i: number) => (
                                  <div
                                    key={i}
                                    className="w-7 h-7 rounded-full border border-white/20 shadow-sm"
                                    style={{ backgroundColor: color }}
                                    title={color}
                                  />
                                ))}
                            </div>
                          </div>
                        )}
                      <button
                        onClick={() => {
                          setImageAnalysis(null);
                          setImageFile(null);
                          if (imagePreviewUrl)
                            URL.revokeObjectURL(imagePreviewUrl);
                          setImagePreviewUrl(null);
                        }}
                        className="text-[10px] text-muted-foreground underline pt-1"
                      >
                        Clear and re-upload
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── MUSIC VIDEO STUDIO MODE ── */}
              {inputMode === "studio" && (
                <div className="space-y-3">
                  <input
                    ref={studioAudioInputRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={handleStudioAudioChange}
                  />

                  {/* Audio upload zone */}
                  <button
                    onClick={() => studioAudioInputRef.current?.click()}
                    className={`w-full rounded-lg border-2 border-dashed p-5 flex flex-col items-center gap-2 transition-colors ${
                      studioAudioFile
                        ? "border-emerald-500 bg-emerald-500/5"
                        : "border-border hover:border-emerald-500/50 hover:bg-muted/30"
                    }`}
                  >
                    {studioAudioFile ? (
                      <>
                        <Music className="h-7 w-7 text-emerald-500" />
                        <span className="text-sm font-medium">{studioAudioFile.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {(studioAudioFile.size / 1024 / 1024).toFixed(2)} MB — click to change
                        </span>
                      </>
                    ) : (
                      <>
                        <Music className="h-7 w-7 text-muted-foreground" />
                        <span className="text-sm font-medium">Upload your track</span>
                        <span className="text-xs text-muted-foreground">MP3, WAV, AAC, FLAC — full song length</span>
                      </>
                    )}
                  </button>

                  {/* Analyze beat button */}
                  {studioAudioFile && !studioBeatAnalysis && (
                    <Button onClick={handleAnalyzeBeat} disabled={isAnalyzingBeat} variant="outline" className="w-full">
                      {isAnalyzingBeat ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analyzing beats…</>
                      ) : (
                        <><BarChart2 className="h-4 w-4 mr-2" />Analyze Track</>
                      )}
                    </Button>
                  )}

                  {/* Beat analysis results */}
                  {studioBeatAnalysis && (
                    <div className="bg-muted/40 rounded-lg p-3 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">Track Analyzed</span>
                        <Badge variant="secondary" className="text-[10px]">{studioBeatAnalysis.tier}</Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-background rounded p-2">
                          <div className="font-bold text-base text-emerald-500">{Math.round(studioBeatAnalysis.bpm)}</div>
                          <div className="text-muted-foreground">BPM</div>
                        </div>
                        <div className="bg-background rounded p-2">
                          <div className="font-bold text-base">{studioBeatAnalysis.sections.length}</div>
                          <div className="text-muted-foreground">Sections</div>
                        </div>
                        <div className="bg-background rounded p-2">
                          <div className="font-bold text-base">{Math.floor(studioBeatAnalysis.durationSeconds / 60)}:{String(Math.round(studioBeatAnalysis.durationSeconds % 60)).padStart(2, "0")}</div>
                          <div className="text-muted-foreground">Length</div>
                        </div>
                      </div>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {studioBeatAnalysis.sections.map((s, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={`text-[9px] h-4 shrink-0 ${
                                s.type === "chorus" ? "border-emerald-500 text-emerald-500"
                                : s.type === "verse" ? "border-blue-400 text-blue-400"
                                : s.type === "intro" ? "border-violet-400 text-violet-400"
                                : "border-muted-foreground text-muted-foreground"
                              }`}
                            >{s.type}</Badge>
                            <span className="text-muted-foreground">{s.label}</span>
                            <span className="ml-auto text-muted-foreground">{s.startTime.toFixed(1)}s–{s.endTime.toFixed(1)}s</span>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => { setStudioBeatAnalysis(null); setStudioAudioFile(null); }} className="text-[10px] text-muted-foreground underline pt-1">
                        Clear and re-upload
                      </button>
                    </div>
                  )}

                  {/* Genre + style */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Genre</Label>
                      <Select value={studioGenre} onValueChange={setStudioGenre}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["hip-hop","trap","r&b","pop","electronic","edm","dance","rock","country","jazz","latin","afrobeats","drill"].map((g) => (
                            <SelectItem key={g} value={g} className="text-xs">{g}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Artist Style <span className="opacity-50">(optional)</span></Label>
                      <Input
                        value={studioArtistStyle}
                        onChange={(e) => setStudioArtistStyle(e.target.value)}
                        placeholder="dark and moody…"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  {/* Hook text */}
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Hook / Lyric <span className="opacity-50">(optional overlay)</span></Label>
                    <Input
                      value={studioHook}
                      onChange={(e) => setStudioHook(e.target.value)}
                      placeholder="Your hook or lyric here…"
                      className="h-8 text-xs"
                    />
                  </div>

                  <p className="text-[10px] text-muted-foreground leading-relaxed bg-emerald-500/5 border border-emerald-500/20 rounded p-2">
                    <strong>Music Video Studio</strong> — MaxCore AI generates one photorealistic scene per song section, beat-syncs all transitions, and renders a full-length cinematic music video. No 8-second cap. No templates.
                  </p>
                </div>
              )}

              {/* ── Common options ── */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    Aspect Ratio
                  </Label>
                  <Select value={aspectRatio} onValueChange={setAspectRatio}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ASPECT_RATIOS.map((ar) => (
                        <SelectItem key={ar.id} value={ar.id}>
                          {ar.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    <Clock className="h-3.5 w-3.5 inline mr-1" />
                    Duration
                  </Label>
                  <Select
                    value={String(duration)}
                    onValueChange={(v) => setDuration(Number(v))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="8">8 seconds</SelectItem>
                      <SelectItem value="10">10 seconds</SelectItem>
                      <SelectItem value="15">15 seconds</SelectItem>
                      <SelectItem value="20">20 seconds</SelectItem>
                      <SelectItem value="30">30 seconds</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Artist Name (optional)
                </Label>
                <Input
                  value={customArtistName}
                  onChange={(e) => setCustomArtistName(e.target.value)}
                  placeholder="Your artist or brand name"
                  className="h-9"
                />
              </div>

              {/* Voiceover + Photorealistic toggles */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setVoiceover(!voiceover)}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    voiceover
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  <Mic className="h-3 w-3" />
                  {voiceover ? "Voiceover: ON" : "Add voiceover"}
                </button>

                <button
                  onClick={() => setPhotorealistic(!photorealistic)}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    photorealistic
                      ? "border-violet-500 bg-violet-500/10 text-violet-500"
                      : "border-border text-muted-foreground hover:border-violet-500/50"
                  }`}
                  title="Use MaxCore AI to generate a photorealistic background image animated with a cinematic zoom effect"
                >
                  <Camera className="h-3 w-3" />
                  {photorealistic ? "Photorealistic: ON" : "Photorealistic (AI photo)"}
                </button>
              </div>

              {/* Generate button */}
              <Button
                onClick={
                  inputMode === "studio"
                    ? handleGenerateMusicVideo
                    : inputMode === "text"
                      ? handleGenerateFromText
                      : inputMode === "audio"
                        ? handleGenerateFromAudio
                        : handleGenerateFromImage
                }
                disabled={
                  isGenerating ||
                  (inputMode === "text" &&
                    !textTopic.trim() &&
                    !topicProp.trim() &&
                    !hook.trim()) ||
                  (inputMode === "audio" && !audioAnalysis) ||
                  (inputMode === "image" && !imageAnalysis) ||
                  (inputMode === "studio" && !studioAudioFile)
                }
                className={`w-full ${inputMode === "studio" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}`}
                size="lg"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {generatingStage || "Generating Video…"}
                  </>
                ) : (
                  <>
                    {inputMode === "studio" ? <Music className="h-4 w-4 mr-2" /> : <Film className="h-4 w-4 mr-2" />}
                    {inputMode === "text"
                      ? "Generate Video from Text"
                      : inputMode === "audio"
                        ? "Generate Video from Audio"
                        : inputMode === "studio"
                          ? "Generate Full Music Video"
                          : "Generate Video from Image"}
                  </>
                )}
              </Button>

              {/* Progress bar — manual mode */}
              {isGenerating &&
                !isAutoMode &&
                (() => {
                  const isCompositing =
                    generatingStage.startsWith("Compositing");
                  const EXPECTED_S = 25;
                  const pct = isCompositing
                    ? renderProgress
                    : Math.min(
                        95,
                        Math.round(
                          100 *
                            (1 - Math.exp(-generatingElapsed / EXPECTED_S)) *
                            1.05,
                        ),
                      );
                  const stageLabel =
                    generatingStage && generatingStage !== "Starting…"
                      ? generatingStage
                      : generatingElapsed < 3
                        ? "Queuing job…"
                        : generatingElapsed < 10
                          ? "Generating AI script…"
                          : generatingElapsed < 18
                            ? "Rendering scenes…"
                            : "Adding music & compositing…";
                  return (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{stageLabel}</span>
                        <span className="tabular-nums">
                          {pct}%
                          {generatingElapsed > 0
                            ? ` · ${generatingElapsed}s`
                            : ""}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-1000 ease-out"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })()}

              {/* Result */}
              {videoUrl && (
                <div className="space-y-3">
                  <div className="rounded-lg overflow-hidden border bg-black">
                    <video
                      src={videoUrl}
                      className="w-full"
                      style={{ maxHeight: 420 }}
                      controls
                      autoPlay
                      muted
                      playsInline
                    />
                  </div>

                  {videoInfo && (
                    <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-[10px]">
                          {videoInfo.width}×{videoInfo.height}
                        </Badge>
                        {videoInfo.scenesRendered > 1 && (
                          <Badge variant="outline" className="text-[10px]">
                            <Layers className="h-2.5 w-2.5 mr-1" />
                            {videoInfo.scenesRendered} Scenes
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px]">
                          {(videoInfo.processingTime / 1000).toFixed(1)}s render
                        </Badge>
                        {videoInfo.source === "ai_model" && (
                          <Badge variant="default" className="text-[10px]">
                            <Sparkles className="h-2.5 w-2.5 mr-1" />
                            AI Generated
                          </Badge>
                        )}
                      </div>
                      {videoInfo.hook && (
                        <div className="text-xs">
                          <span className="font-medium">Hook:</span>{" "}
                          <span className="text-muted-foreground">
                            {videoInfo.hook.substring(0, 120)}
                          </span>
                        </div>
                      )}
                      {videoInfo.hashtags?.length > 0 && (
                        <div className="text-xs">
                          <span className="font-medium">Hashtags:</span>{" "}
                          <span className="text-blue-500 dark:text-blue-400">
                            {videoInfo.hashtags.slice(0, 5).join(" ")}
                          </span>
                        </div>
                      )}
                      {videoInfo.sentimentLabel && (
                        <div className="text-xs flex items-center gap-1.5">
                          <span className="font-medium">Sentiment:</span>
                          <span
                            className={
                              videoInfo.sentimentLabel === "positive"
                                ? "text-green-500 dark:text-green-400"
                                : videoInfo.sentimentLabel === "negative"
                                  ? "text-red-500 dark:text-red-400"
                                  : "text-muted-foreground"
                            }
                          >
                            {videoInfo.sentimentLabel}
                            {videoInfo.sentimentScore != null &&
                              ` (${Math.round(videoInfo.sentimentScore * 100)}%)`}
                          </span>
                          {videoInfo.contentConfidence != null && (
                            <span className="text-muted-foreground">
                              · Confidence{" "}
                              {Math.round(videoInfo.contentConfidence * 100)}%
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <a
                      href={videoUrl}
                      download={`maxbooster-video-${platform}.mp4`}
                      className="inline-flex items-center justify-center flex-1 rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download MP4
                    </a>
                    {onImportToStudio && (
                      <button
                        onClick={() => onImportToStudio(videoUrl!)}
                        className="inline-flex items-center justify-center flex-1 rounded-md text-sm font-medium h-9 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                      >
                        <Film className="h-4 w-4 mr-2" />
                        Import to Studio
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
      </CardContent>
    </Card>
  );
}
