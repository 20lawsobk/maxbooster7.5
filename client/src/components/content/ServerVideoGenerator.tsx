import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
} from 'lucide-react';

interface ServerVideoGeneratorProps {
  platform: string;
  topic: string;
  tone?: string;
  goal?: string;
  artistName?: string;
  onVideoGenerated: (url: string) => void;
  className?: string;
}

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

const QUICK_TEMPLATES = [
  { id: 'promo', name: 'Quick Promo', color: '#e94560' },
  { id: 'lyric', name: 'Quick Lyric', color: '#ffd700' },
  { id: 'announcement', name: 'Quick Announce', color: '#0f3460' },
  { id: 'minimal', name: 'Quick Minimal', color: '#333333' },
  { id: 'neon', name: 'Quick Neon', color: '#ff6ec7' },
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
  topic,
  tone = 'energetic',
  goal = 'growth',
  artistName = '',
  onVideoGenerated,
  className = '',
}: ServerVideoGeneratorProps) {
  const { toast } = useToast();

  const [selectedTemplate, setSelectedTemplate] = useState('cinematic_promo');
  const [aspectRatio, setAspectRatio] = useState(PLATFORM_DEFAULT_RATIO[platform] || '9:16');
  const [duration, setDuration] = useState(10);
  const [customArtistName, setCustomArtistName] = useState(artistName);
  const [quality, setQuality] = useState<'cinematic' | 'quick'>('cinematic');
  const [isGenerating, setIsGenerating] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState<{
    hook: string;
    body: string;
    cta: string;
    source: string;
    width: number;
    height: number;
    processingTime: number;
    renderTime: number;
    scenesRendered: number;
    templateName: string;
    quality: string;
  } | null>(null);

  useEffect(() => {
    setAspectRatio(PLATFORM_DEFAULT_RATIO[platform] || '9:16');
  }, [platform]);

  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast({
        title: 'Topic Required',
        description: 'Please enter a topic or description for the video.',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    setVideoUrl(null);
    setVideoInfo(null);

    try {
      const response = await fetch('/api/social/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          topic,
          platform,
          template: selectedTemplate,
          aspect_ratio: aspectRatio,
          duration,
          tone,
          goal,
          artist_name: customArtistName || undefined,
          quality,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Video generation failed');
      }

      const data = await response.json();

      if (data.success && data.url) {
        setVideoUrl(data.url);
        setVideoInfo({
          hook: data.hook,
          body: data.body,
          cta: data.cta,
          source: data.source,
          width: data.width,
          height: data.height,
          processingTime: Math.round(data.processing_time_ms),
          renderTime: Math.round(data.render_time_ms || 0),
          scenesRendered: data.scenes_rendered || 1,
          templateName: data.template_name || data.template,
          quality: data.quality || quality,
        });
        onVideoGenerated(data.url);
        toast({
          title: 'Video Generated',
          description: `${data.width}x${data.height} cinematic video ready (${data.scenes_rendered || 1} scenes)`,
        });
      } else {
        throw new Error(data.error || 'Video generation failed');
      }
    } catch (error: any) {
      toast({
        title: 'Generation Failed',
        description: error.message || 'Could not generate video',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const isCinematic = quality === 'cinematic';
  const templates = isCinematic ? CINEMATIC_TEMPLATES : QUICK_TEMPLATES;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Film className="h-5 w-5" />
          Cinematic AI Video Studio
        </CardTitle>
        <CardDescription>
          Multi-scene cinematic videos with animated backgrounds, transitions, and color grading
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button
            variant={isCinematic ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setQuality('cinematic');
              setSelectedTemplate('cinematic_promo');
              setDuration(10);
            }}
            className="flex-1"
          >
            <Film className="h-3.5 w-3.5 mr-1.5" />
            Cinematic
          </Button>
          <Button
            variant={!isCinematic ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setQuality('quick');
              setSelectedTemplate('promo');
              setDuration(8);
            }}
            className="flex-1"
          >
            <Zap className="h-3.5 w-3.5 mr-1.5" />
            Quick
          </Button>
        </div>

        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-2 block">
            <Layout className="h-3.5 w-3.5 inline mr-1" />
            {isCinematic ? 'Cinematic Template' : 'Quick Template'}
          </Label>
          {isCinematic ? (
            <div className="grid grid-cols-3 gap-1.5 max-h-[280px] overflow-y-auto pr-1">
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
                      <div
                        className="w-4 h-4 rounded-full flex-shrink-0"
                        style={{ backgroundColor: t.color }}
                      />
                      <Icon className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    </div>
                    <span className="text-[11px] font-medium block leading-tight">{t.name}</span>
                    <span className="text-[10px] text-muted-foreground block leading-tight mt-0.5">{t.description}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-1.5">
              {QUICK_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTemplate(t.id)}
                  className={`p-2 rounded-lg border text-center transition-all ${
                    selectedTemplate === t.id
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div
                    className="w-5 h-5 rounded-full mx-auto mb-1"
                    style={{ backgroundColor: t.color }}
                  />
                  <span className="text-[11px] font-medium block">{t.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

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
                    <span>{ar.name}</span>
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
                {isCinematic ? (
                  <>
                    <SelectItem value="8">8 seconds</SelectItem>
                    <SelectItem value="10">10 seconds</SelectItem>
                    <SelectItem value="15">15 seconds</SelectItem>
                    <SelectItem value="20">20 seconds</SelectItem>
                    <SelectItem value="30">30 seconds</SelectItem>
                  </>
                ) : (
                  <>
                    <SelectItem value="5">5 seconds</SelectItem>
                    <SelectItem value="8">8 seconds</SelectItem>
                    <SelectItem value="10">10 seconds</SelectItem>
                    <SelectItem value="15">15 seconds</SelectItem>
                  </>
                )}
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
            placeholder="Your artist/brand name"
            className="h-9"
          />
        </div>

        <Button
          onClick={handleGenerate}
          disabled={isGenerating || !topic.trim()}
          className="w-full"
          size="lg"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {isCinematic ? 'Rendering Cinematic Video...' : 'Generating Video...'}
            </>
          ) : (
            <>
              {isCinematic ? <Film className="h-4 w-4 mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {isCinematic ? 'Generate Cinematic Video' : 'Generate Quick Video'}
            </>
          )}
        </Button>

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
                    {videoInfo.width}x{videoInfo.height}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    <Sparkles className="h-2.5 w-2.5 mr-1" />
                    {videoInfo.source === 'ai_model' ? 'AI Generated' : 'Template'}
                  </Badge>
                  {videoInfo.quality === 'cinematic' && (
                    <Badge variant="default" className="text-[10px]">
                      <Film className="h-2.5 w-2.5 mr-1" />
                      Cinematic
                    </Badge>
                  )}
                  {videoInfo.scenesRendered > 1 && (
                    <Badge variant="outline" className="text-[10px]">
                      <Layers className="h-2.5 w-2.5 mr-1" />
                      {videoInfo.scenesRendered} Scenes
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px]">
                    {(videoInfo.processingTime / 1000).toFixed(1)}s render
                  </Badge>
                </div>
                {videoInfo.templateName && (
                  <div className="text-[11px] text-muted-foreground">
                    Template: {videoInfo.templateName}
                  </div>
                )}
                {videoInfo.hook && (
                  <div className="text-xs">
                    <span className="font-medium">Hook:</span>{' '}
                    <span className="text-muted-foreground">{videoInfo.hook.substring(0, 100)}</span>
                  </div>
                )}
              </div>
            )}

            <a
              href={videoUrl}
              download={`maxbooster-cinematic-${platform}-video.mp4`}
              className="inline-flex items-center justify-center w-full rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground"
            >
              <Download className="h-4 w-4 mr-2" />
              Download MP4
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
