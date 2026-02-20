import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Palette,
  Clock,
  Layout,
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

const TEMPLATES = [
  { id: 'promo', name: 'Promo', description: 'Bold with accent colors', color: '#e94560' },
  { id: 'lyric', name: 'Lyric', description: 'Elegant gold accents', color: '#ffd700' },
  { id: 'announcement', name: 'Announcement', description: 'Professional style', color: '#0f3460' },
  { id: 'minimal', name: 'Minimal', description: 'Clean light design', color: '#333333' },
  { id: 'neon', name: 'Neon', description: 'Vibrant neon glow', color: '#ff6ec7' },
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

  const [selectedTemplate, setSelectedTemplate] = useState('promo');
  const [aspectRatio, setAspectRatio] = useState(PLATFORM_DEFAULT_RATIO[platform] || '9:16');
  const [duration, setDuration] = useState(8);
  const [customArtistName, setCustomArtistName] = useState(artistName);

  useEffect(() => {
    setAspectRatio(PLATFORM_DEFAULT_RATIO[platform] || '9:16');
  }, [platform]);
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
  } | null>(null);

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
        });
        onVideoGenerated(data.url);
        toast({
          title: 'Video Generated',
          description: `${data.width}x${data.height} video ready in ${Math.round(data.processing_time_ms / 1000)}s`,
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

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Video className="h-5 w-5" />
          AI Video Generator
        </CardTitle>
        <CardDescription>
          Generate a ready-to-post video with AI-powered text overlays
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          <Label className="text-xs font-medium text-muted-foreground mb-2 block">
            <Layout className="h-3.5 w-3.5 inline mr-1" />
            Video Template
          </Label>
          <div className="grid grid-cols-5 gap-1.5">
            {TEMPLATES.map((t) => (
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
                  className="w-6 h-6 rounded-full mx-auto mb-1"
                  style={{ backgroundColor: t.color }}
                />
                <span className="text-xs font-medium block">{t.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              <Palette className="h-3.5 w-3.5 inline mr-1" />
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
              Duration (seconds)
            </Label>
            <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5s</SelectItem>
                <SelectItem value="8">8s</SelectItem>
                <SelectItem value="10">10s</SelectItem>
                <SelectItem value="15">15s</SelectItem>
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
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating Video...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Video
            </>
          )}
        </Button>

        {videoUrl && (
          <div className="space-y-3">
            <div className="rounded-lg overflow-hidden border bg-black">
              <video
                src={videoUrl}
                className="w-full"
                style={{ maxHeight: 400 }}
                controls
                autoPlay
                muted
              />
            </div>

            {videoInfo && (
              <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{videoInfo.width}x{videoInfo.height}</span>
                  <span className="flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    {videoInfo.source === 'ai_model' ? 'AI Generated' : 'Template'}
                  </span>
                  <span>{videoInfo.processingTime}ms</span>
                </div>
                {videoInfo.hook && (
                  <div className="text-xs">
                    <span className="font-medium">Hook:</span>{' '}
                    <span className="text-muted-foreground">{videoInfo.hook.substring(0, 80)}</span>
                  </div>
                )}
              </div>
            )}

            <a
              href={videoUrl}
              download={`maxbooster-${platform}-video.mp4`}
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
