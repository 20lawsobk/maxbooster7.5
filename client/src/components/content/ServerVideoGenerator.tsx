import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Video,
  Loader2,
  Download,
  Sparkles,
  Clock,
  Layout,
  Film,
  Zap,
  Layers,
  Mic,
  Image,
  FileText,
  Upload,
  CheckCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface ServerVideoGeneratorProps {
  platform: string;
  topic: string;
  tone?: string;
  goal?: string;
  artistName?: string;
  onVideoGenerated: (url: string) => void;
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

type InputMode = 'text' | 'audio' | 'image';

const CINEMATIC_TEMPLATES = [
  { id: 'cinematic_promo', name: 'Cinematic Promo', description: 'Film-quality dramatic lighting', category: 'promo', color: '#e94560', icon: Film },
  { id: 'neon_pulse', name: 'Neon Pulse', description: 'Vibrant plasma energy', category: 'energetic', color: '#ff6ec7', icon: Zap },
  { id: 'dark_cinema', name: 'Dark Cinema', description: 'Moody atmospheric film', category: 'dramatic', color: '#1a1a2e', icon: Film },
  { id: 'aurora', name: 'Aurora', description: 'Northern lights waves', category: 'atmospheric', color: '#40e0d0', icon: Sparkles },
  { id: 'music_video', name: 'Music Video', description: 'High-energy bold colors', category: 'music', color: '#ff00ff', icon: Zap },
  { id: 'gold_luxury', name: 'Gold Luxury', description: 'Premium gold aesthetic', category: 'luxury', color: '#d4af37', icon: Sparkles },
  { id: 'elegant_minimal', name: 'Elegant', description: 'Clean sophisticated', category: 'professional', color: '#8b7355', icon: Layout },
  { id: 'vintage_film', name: 'Vintage Film', description: 'Retro 8mm aesthetic', category: 'retro', color: '#5c4033', icon: Film },
  { id: 'ocean_wave', name: 'Ocean Wave', description: 'Calming ocean gradients', category: 'calm', color: '#006994', icon: Sparkles },
  { id: 'fire_ember', name: 'Fire & Ember', description: 'Intense warm tones', category: 'intense', color: '#ff4500', icon: Zap },
  { id: 'storyteller', name: 'Storyteller', description: 'Narrative progression', category: 'narrative', color: '#2d2d44', icon: Layers },
];

const ASPECT_RATIOS = [
  { id: '9:16', name: 'Vertical (9:16)', hint: 'TikTok, Reels, Shorts' },
  { id: '16:9', name: 'Landscape (16:9)', hint: 'YouTube, Twitter' },
  { id: '1:1', name: 'Square (1:1)', hint: 'Instagram, Facebook' },
  { id: '4:5', name: 'Portrait (4:5)', hint: 'Instagram, Facebook' },
];

const PLATFORM_DEFAULT_RATIO: Record<string, string> = {
  tiktok: '9:16',
  instagram: '1:1',
  youtube: '16:9',
  facebook: '1:1',
  twitter: '16:9',
  linkedin: '16:9',
  google_business: '16:9',
  threads: '1:1',
};

export function ServerVideoGenerator({
  platform,
  topic: topicProp,
  tone = 'energetic',
  goal = 'growth',
  artistName: artistNameProp = '',
  onVideoGenerated,
  className = '',
  initialHook = '',
  initialBody = '',
  initialCta = '',
  initialTemplate = '',
  initialBgColor = '',
  initialAccentColor = '',
  autoStart = false,
}: ServerVideoGeneratorProps) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [inputMode, setInputMode] = useState<InputMode>('text');
  // Tracks whether autoStart has already fired so it never fires twice
  const autoStartFiredRef = useRef(false);

  // Text mode state
  const [textTopic, setTextTopic] = useState('');
  const [hook, setHook] = useState(initialHook);
  const [body, setBody] = useState(initialBody);
  const [cta, setCta] = useState(initialCta);
  const [showAdvanced, setShowAdvanced] = useState(
    !!(initialHook || initialBody || initialCta)
  );
  const [useTemplate, setUseTemplate] = useState(!!initialTemplate);
  const [selectedTemplate, setSelectedTemplate] = useState(
    initialTemplate || 'cinematic_promo'
  );

  // Audio mode state
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioAnalysis, setAudioAnalysis] = useState<any>(null);
  const [isAnalyzingAudio, setIsAnalyzingAudio] = useState(false);

  // Image mode state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageAnalysis, setImageAnalysis] = useState<any>(null);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);

  // Voiceover
  const [voiceover, setVoiceover] = useState(false);

  // Common state
  const [aspectRatio, setAspectRatio] = useState(PLATFORM_DEFAULT_RATIO[platform] || '9:16');
  const [duration, setDuration] = useState(10);
  const [customArtistName, setCustomArtistName] = useState(artistNameProp);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingStage, setGeneratingStage] = useState<string>('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState<any | null>(null);

  const audioInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setAspectRatio(PLATFORM_DEFAULT_RATIO[platform] || '9:16');
  }, [platform]);

  useEffect(() => {
    if (topicProp && !textTopic) setTextTopic(topicProp);
  }, [topicProp]);

  // Clean up image preview URL on unmount
  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  const applyVideoResult = (data: any) => {
    setVideoUrl(data.url);
    setVideoInfo({
      hook: data.hook,
      body: data.body,
      cta: data.cta,
      source: data.source,
      width: data.width,
      height: data.height,
      processingTime: Math.round(data.processing_time_ms || 0),
      renderTime: Math.round(data.render_time_ms || 0),
      scenesRendered: data.scenes_rendered || 1,
      templateName: data.template_name || data.template,
      quality: data.quality,
    });
    onVideoGenerated(data.url);
  };

  const pollJobUntilDone = async (jobId: string): Promise<any> => {
    const maxAttempts = 60;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const resp = await fetch(`/api/social/video-job/${jobId}`, { credentials: 'include' });
      const text = await resp.text();
      let data: any;
      try { data = JSON.parse(text); } catch { throw new Error('Unexpected response from server'); }
      if (data.status === 'done' && data.success && data.url) return data;
      if (data.status === 'error') throw new Error(data.error || 'Video generation failed');
      setGeneratingStage(`Rendering… (${Math.round((i + 1) * 2)}s)`);
    }
    throw new Error('Video generation timed out. Please try again.');
  };

  const callGenerateVideo = async (payload: Record<string, any>) => {
    setIsGenerating(true);
    setGeneratingStage('Starting…');
    setVideoUrl(null);
    setVideoInfo(null);

    // 6-minute client-side timeout — FFmpeg generation can take up to ~5 min.
    // Using AbortController prevents dangling connections from triggering hard
    // navigations if the proxy drops the request mid-flight.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6 * 60 * 1000);

    try {
      const response = await fetch('/api/social/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
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
      let data: any;
      try { data = JSON.parse(rawText); } catch {
        throw new Error(response.ok ? 'Invalid server response' : `Server error (${response.status})`);
      }

      if (response.status === 401) {
        // SPA navigation — no full-page reload, no session loss
        toast({
          title: 'Session expired',
          description: 'Please sign in again to continue.',
          variant: 'destructive',
        });
        setLocation(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      if (!response.ok) throw new Error(data?.message || data?.error || 'Video generation failed');

      if (data.job_id && data.status === 'processing') {
        setGeneratingStage('Rendering frames…');
        data = await pollJobUntilDone(data.job_id);
      }
      if (data.success && data.url) {
        applyVideoResult(data);
        toast({
          title: 'Video Generated',
          description: `${data.width}×${data.height} video ready (${data.scenes_rendered || 1} scene${data.scenes_rendered !== 1 ? 's' : ''})`,
        });
      } else {
        throw new Error(data.error || 'Video generation failed');
      }
    } catch (error: any) {
      // Distinguish user-visible messages: abort (timeout/proxy drop) vs other errors
      if (error.name === 'AbortError') {
        toast({
          title: 'Generation Timed Out',
          description: 'The video took too long to generate. Try a shorter duration or simpler settings.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Generation Failed',
          description: error.message || 'Could not generate video',
          variant: 'destructive',
        });
      }
    } finally {
      clearTimeout(timeoutId);
      setIsGenerating(false);
      setGeneratingStage('');
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
      callGenerateVideo({
        topic: topicProp?.trim() || initialHook?.trim(),
        hook:  initialHook  || undefined,
        body:  initialBody  || undefined,
        cta:   initialCta   || undefined,
        template: initialTemplate || undefined,
        quality:  initialTemplate ? 'cinematic' : undefined,
        bg_color:     initialBgColor     || undefined,
        accent_color: initialAccentColor || undefined,
        voiceover: false,
      });
    }, 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Text mode ────────────────────────────────────────────────────────────────

  const handleGenerateFromText = async () => {
    const topic = textTopic.trim() || topicProp.trim();
    if (!topic && !hook) {
      toast({ title: 'Content Required', description: 'Enter a topic or hook text.', variant: 'destructive' });
      return;
    }
    await callGenerateVideo({
      topic: topic || hook,
      hook: hook || undefined,
      body: body || undefined,
      cta: cta || undefined,
      template: useTemplate ? selectedTemplate : undefined,
      quality: useTemplate ? 'cinematic' : undefined,
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
      form.append('audio', audioFile);
      form.append('platform', platform);
      const resp = await fetch('/api/social/analyze-audio', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) throw new Error(data.message || 'Audio analysis failed');
      setAudioAnalysis(data);
      toast({ title: 'Audio Analyzed', description: `Detected: ${data.analysis?.genre || 'music'} — ${data.analysis?.tempo ? Math.round(data.analysis.tempo) + ' BPM' : ''}` });
    } catch (err: any) {
      toast({ title: 'Analysis Failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsAnalyzingAudio(false);
    }
  };

  const handleGenerateFromAudio = async () => {
    if (!audioAnalysis) {
      toast({ title: 'Analyze First', description: 'Analyze your audio file before generating.', variant: 'destructive' });
      return;
    }
    const vc = audioAnalysis.video_config || {};
    await callGenerateVideo({
      topic: vc.topic || audioAnalysis.seed?.topic || 'music',
      tone: vc.tone || tone,
      bg_color: vc.bg,
      accent_color: vc.ac,
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
      form.append('image', imageFile);
      form.append('platform', platform);
      if (customArtistName) form.append('artist_name', customArtistName);
      const resp = await fetch('/api/social/analyze-image', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) throw new Error(data.message || 'Image analysis failed');
      setImageAnalysis(data);
      toast({ title: 'Image Analyzed', description: `Mood: ${data.analysis?.mood || 'detected'} — colors extracted` });
    } catch (err: any) {
      toast({ title: 'Analysis Failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsAnalyzingImage(false);
    }
  };

  const handleGenerateFromImage = async () => {
    if (!imageAnalysis) {
      toast({ title: 'Analyze First', description: 'Analyze your image before generating.', variant: 'destructive' });
      return;
    }
    const vc = imageAnalysis.video_config || {};
    await callGenerateVideo({
      topic: vc.topic || imageAnalysis.seed?.topic || 'music aesthetic',
      tone: vc.tone || tone,
      bg_color: vc.bg,
      accent_color: vc.ac,
      voiceover,
    });
  };

  // ── Mode can be reset ─────────────────────────────────────────────────────────

  const resetVideo = () => { setVideoUrl(null); setVideoInfo(null); };

  const inputModes: { id: InputMode; label: string; icon: React.ReactNode }[] = [
    { id: 'text', label: 'Text', icon: <FileText className="h-3.5 w-3.5" /> },
    { id: 'audio', label: 'Audio', icon: <Mic className="h-3.5 w-3.5" /> },
    { id: 'image', label: 'Image', icon: <Image className="h-3.5 w-3.5" /> },
  ];

  // In autoStart mode show only the progress/result view — no form
  const isAutoMode = autoStart && !!(topicProp?.trim() || initialHook?.trim());

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Film className="h-5 w-5" />
          {isAutoMode ? 'Creating Your Video' : 'AI Video Studio'}
        </CardTitle>
        <CardDescription>
          {isAutoMode
            ? videoUrl
              ? 'Your video is ready — watch and download below.'
              : isGenerating
              ? 'Your video is rendering. This usually takes 1–3 minutes.'
              : 'Something went wrong. Customize the settings below and try again.'
            : 'Generate cinematic videos from text, audio, or artwork'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">

        {/* ── AUTO-START: show only progress + result, hide the form ── */}
        {isAutoMode && (isGenerating || videoUrl) && (
          <div className="space-y-4">
            {isGenerating && (
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                  <Film className="absolute inset-0 m-auto h-6 w-6 text-primary" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-medium">
                    {generatingStage || 'Preparing your video…'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Rendering scenes, adding music, and compositing your clip
                  </p>
                </div>
                {topicProp && (
                  <div className="max-w-xs text-center rounded-lg bg-muted/50 px-3 py-2">
                    <p className="text-xs text-muted-foreground truncate">"{topicProp}"</p>
                  </div>
                )}
              </div>
            )}

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
                      {videoInfo.source === 'ai_model' && (
                        <Badge variant="default" className="text-[10px]">
                          <Sparkles className="h-2.5 w-2.5 mr-1" />
                          AI Generated
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
                <a
                  href={videoUrl}
                  download={`maxbooster-video-${platform}.mp4`}
                  className="inline-flex items-center justify-center w-full rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download MP4
                </a>
              </div>
            )}
          </div>
        )}

        {/* When autoStart errored (not generating, no video) — show minimal retry */}
        {isAutoMode && !isGenerating && !videoUrl && autoStartFiredRef.current && (
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-3 text-sm text-amber-700 dark:text-amber-400">
              Video generation didn't complete. You can retry with the settings below.
            </div>
          </div>
        )}

        {/* Hide the full form when autoStart succeeded or is in progress */}
        {!(isAutoMode && (isGenerating || videoUrl)) && (
          <>
        {/* Input mode tabs */}
        <div className="flex rounded-lg border overflow-hidden">
          {inputModes.map((m) => (
            <button
              key={m.id}
              onClick={() => { setInputMode(m.id); resetVideo(); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors ${
                inputMode === m.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              {m.icon}
              {m.label}
            </button>
          ))}
        </div>

        {/* ── TEXT MODE ── */}
        {inputMode === 'text' && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Topic / Description
              </Label>
              <Textarea
                value={textTopic}
                onChange={(e) => setTextTopic(e.target.value)}
                placeholder={topicProp || 'e.g., New single dropping Friday, behind the scenes studio session…'}
                rows={3}
                className="resize-none"
              />
            </div>

            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {showAdvanced ? 'Hide' : 'Add'} hook / body / CTA (optional)
            </button>

            {showAdvanced && (
              <div className="space-y-2 pl-2 border-l-2 border-muted">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Hook (opening line)</Label>
                  <Input
                    value={hook}
                    onChange={(e) => setHook(e.target.value)}
                    placeholder="Attention-grabbing first line…"
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">Body (main message)</Label>
                  <Input
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Core message…"
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">CTA (call to action)</Label>
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
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/50'
                }`}
              >
                <Layout className="h-3 w-3" />
                {useTemplate ? 'Template: ON' : 'Use a template (optional)'}
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
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <div className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                        <Icon className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      </div>
                      <span className="text-[11px] font-medium block leading-tight">{t.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── AUDIO MODE ── */}
        {inputMode === 'audio' && (
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
                audioFile ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'
              }`}
            >
              {audioFile ? (
                <>
                  <CheckCircle className="h-8 w-8 text-primary" />
                  <span className="text-sm font-medium">{audioFile.name}</span>
                  <span className="text-xs text-muted-foreground">{(audioFile.size / 1024 / 1024).toFixed(2)} MB — click to change</span>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm font-medium">Upload an audio file</span>
                  <span className="text-xs text-muted-foreground">MP3, WAV, AAC, FLAC, OGG</span>
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
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analyzing audio…</>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-2" />Analyze Audio</>
                )}
              </Button>
            )}

            {audioAnalysis && (
              <div className="bg-muted/40 rounded-lg p-3 space-y-1.5 text-xs">
                <p className="font-medium text-sm">Audio Analyzed</p>
                {audioAnalysis.analysis?.genre && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground">Genre:</span>
                    <Badge variant="secondary" className="text-[10px] h-4">{audioAnalysis.analysis.genre}</Badge>
                  </div>
                )}
                {audioAnalysis.analysis?.tempo && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground">Tempo:</span>
                    <span>{Math.round(audioAnalysis.analysis.tempo)} BPM</span>
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
                    <span className="text-foreground">{audioAnalysis.seed.topic}</span>
                  </div>
                )}
                <button
                  onClick={() => { setAudioAnalysis(null); setAudioFile(null); }}
                  className="text-[10px] text-muted-foreground underline pt-1"
                >
                  Clear and re-upload
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── IMAGE MODE ── */}
        {inputMode === 'image' && (
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
                imageFile ? 'border-primary' : 'border-border hover:border-primary/50'
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
                    <span className="text-white text-sm font-medium">Click to change</span>
                  </div>
                </div>
              ) : (
                <div className="p-6 flex flex-col items-center gap-2">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm font-medium">Upload artwork or image</span>
                  <span className="text-xs text-muted-foreground">JPG, PNG, WEBP — colors & mood are extracted</span>
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
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analyzing image…</>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-2" />Analyze Image</>
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
                    <span className="text-muted-foreground">Genre hint:</span>
                    <Badge variant="secondary" className="text-[10px] h-4">{imageAnalysis.analysis.genre_hint}</Badge>
                  </div>
                )}
                {imageAnalysis.palette && imageAnalysis.palette.length > 0 && (
                  <div>
                    <span className="text-muted-foreground block mb-1">Extracted palette:</span>
                    <div className="flex gap-1.5">
                      {imageAnalysis.palette.slice(0, 5).map((color: string, i: number) => (
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
                  onClick={() => { setImageAnalysis(null); setImageFile(null); if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl); setImagePreviewUrl(null); }}
                  className="text-[10px] text-muted-foreground underline pt-1"
                >
                  Clear and re-upload
                </button>
              </div>
            )}
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
            <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
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

        {/* Voiceover toggle */}
        <button
          onClick={() => setVoiceover(!voiceover)}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
            voiceover
              ? 'border-primary bg-primary/5 text-primary'
              : 'border-border text-muted-foreground hover:border-primary/50'
          }`}
        >
          <Mic className="h-3 w-3" />
          {voiceover ? 'Voiceover: ON' : 'Add voiceover (AI reads your text)'}
        </button>

        {/* Generate button */}
        <Button
          onClick={
            inputMode === 'text' ? handleGenerateFromText
            : inputMode === 'audio' ? handleGenerateFromAudio
            : handleGenerateFromImage
          }
          disabled={
            isGenerating ||
            (inputMode === 'text' && !textTopic.trim() && !topicProp.trim() && !hook.trim()) ||
            (inputMode === 'audio' && !audioAnalysis) ||
            (inputMode === 'image' && !imageAnalysis)
          }
          className="w-full"
          size="lg"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {generatingStage || 'Generating Video…'}
            </>
          ) : (
            <>
              <Film className="h-4 w-4 mr-2" />
              {inputMode === 'text' ? 'Generate Video from Text'
               : inputMode === 'audio' ? 'Generate Video from Audio'
               : 'Generate Video from Image'}
            </>
          )}
        </Button>

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
                  {videoInfo.source === 'ai_model' && (
                    <Badge variant="default" className="text-[10px]">
                      <Sparkles className="h-2.5 w-2.5 mr-1" />
                      AI Generated
                    </Badge>
                  )}
                </div>
                {videoInfo.hook && (
                  <div className="text-xs">
                    <span className="font-medium">Hook:</span>{' '}
                    <span className="text-muted-foreground">{videoInfo.hook.substring(0, 120)}</span>
                  </div>
                )}
              </div>
            )}

            <a
              href={videoUrl}
              download={`maxbooster-video-${platform}.mp4`}
              className="inline-flex items-center justify-center w-full rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground"
            >
              <Download className="h-4 w-4 mr-2" />
              Download MP4
            </a>
          </div>
        )}
        </>
        )}
      </CardContent>
    </Card>
  );
}
