import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Image,
  Loader2,
  Download,
  Sparkles,
  RefreshCw,
  Palette,
  Layout,
  Copy,
  Check,
} from "lucide-react";

export type ImagePlatform =
  | "instagram"
  | "instagram_reels"
  | "tiktok"
  | "youtube"
  | "facebook"
  | "twitter"
  | "linkedin"
  | "threads";

export type ImageStyle =
  | "modern"
  | "cinematic"
  | "minimal"
  | "bold"
  | "vintage"
  | "neon"
  | "luxury";

export type ImageTone =
  | "energetic"
  | "calm"
  | "professional"
  | "playful"
  | "dramatic";

interface AIImageGeneratorProps {
  platform: ImagePlatform;
  topic: string;
  tone?: ImageTone;
  goal?: string;
  artistName?: string;
  endpoint?: string;
  onImageGenerated?: (url: string) => void;
  className?: string;
}

interface VisualSpec {
  thumbnail_prompt: string;
  color_scheme: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
  };
  layout: string;
  dimensions: { width: number; height: number };
  format: string;
  platform: string;
  processing_time_ms: number;
}

interface GeneratedImage {
  url: string | null;
  width: number;
  height: number;
  format: string;
  platform: string;
  prompt_used: string;
  color_scheme: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
  };
  processing_time_ms: number;
  visual_spec?: VisualSpec;
}

const STYLES: Array<{
  id: ImageStyle;
  name: string;
  description: string;
  color: string;
}> = [
  {
    id: "modern",
    name: "Modern",
    description: "Clean contemporary",
    color: "#6366f1",
  },
  {
    id: "cinematic",
    name: "Cinematic",
    description: "Film-quality dramatic",
    color: "#e94560",
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Clean & focused",
    color: "#6b7280",
  },
  {
    id: "bold",
    name: "Bold",
    description: "High contrast impact",
    color: "#f59e0b",
  },
  {
    id: "vintage",
    name: "Vintage",
    description: "Retro aesthetic",
    color: "#92400e",
  },
  {
    id: "neon",
    name: "Neon",
    description: "Vibrant electric",
    color: "#ff6ec7",
  },
  {
    id: "luxury",
    name: "Luxury",
    description: "Premium gold/black",
    color: "#d4af37",
  },
];

const PLATFORM_LABELS: Record<ImagePlatform, string> = {
  instagram: "Instagram Feed (1:1)",
  instagram_reels: "Instagram Reels (9:16)",
  tiktok: "TikTok (9:16)",
  youtube: "YouTube Thumbnail (16:9)",
  facebook: "Facebook (16:9)",
  twitter: "Twitter/X (16:9)",
  linkedin: "LinkedIn (1.91:1)",
  threads: "Threads (1:1)",
};

export function AIImageGenerator({
  platform,
  topic,
  tone = "energetic",
  goal = "growth",
  artistName = "",
  endpoint,
  onImageGenerated,
  className = "",
}: AIImageGeneratorProps) {
  const { toast } = useToast();
  const [selectedStyle, setSelectedStyle] = useState<ImageStyle>("modern");
  const [selectedTone, setSelectedTone] = useState<ImageTone>(tone);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GeneratedImage | null>(null);
  const [copied, setCopied] = useState(false);

  const apiEndpoint = endpoint || "/api/social/generate-image";
  const isMultimodalEndpoint = apiEndpoint.includes("/multimodal/generate");

  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast({
        title: "Topic Required",
        description: "Please enter a topic or description for the image.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setResult(null);

    try {
      let data: Record<string, unknown>;

      if (isMultimodalEndpoint) {
        const mmPlatform =
          platform === "instagram_reels" ? "instagram" : platform;
        const validPlatforms = [
          "facebook",
          "instagram",
          "threads",
          "tiktok",
          "youtube",
          "google_business",
          "linkedin",
        ];
        const resolvedPlatform = validPlatforms.includes(mmPlatform)
          ? mmPlatform
          : "instagram";
        const response = await apiRequest("POST", apiEndpoint, {
          input: {
            modality: "text",
            payload: topic,
          },
          platforms: [resolvedPlatform],
          intent: `${selectedTone} image creative for ${artistName || "artist"}`,
          constraints: { styleTags: [selectedStyle, selectedTone] },
        });
        const mmData = await response.json();
        const imageAsset = (mmData.assets || []).find(
          (a: Record<string, unknown>) => a.modality === "image",
        );
        if (!imageAsset) throw new Error("No image asset returned");
        data = {
          success: true,
          url: imageAsset.payload || null,
          width: 1080,
          height: 1080,
          format: "png",
          platform,
          prompt_used: imageAsset.metadata?.prompt || topic,
          color_scheme: {
            primary: "#000000",
            secondary: "#ffffff",
            accent: "#6366f1",
            background: "#000000",
          },
          processing_time_ms: 0,
        };
      } else {
        const response = await apiRequest("POST", apiEndpoint, {
          topic,
          platform,
          tone: selectedTone,
          goal,
          artist_name: artistName || undefined,
          style: selectedStyle,
        });
        data = await response.json();
        if (!data.success)
          throw new Error(data.message || "Image generation failed");
      }

      setResult(data);

      if (data.url && onImageGenerated) {
        onImageGenerated(data.url);
      }

      toast({
        title: "Image Creative Ready",
        description: data.url
          ? "Your AI-generated image is ready."
          : "Visual spec generated — use the prompt with your image tool.",
      });
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : "Image generation failed";
      toast({
        title: "Generation Failed",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyPrompt = async () => {
    const prompt = result?.prompt_used || result?.visual_spec?.thumbnail_prompt;
    if (!prompt) return;
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!result?.url) return;
    const a = document.createElement("a");
    a.href = result.url;
    a.download = `ai-image-${platform}-${Date.now()}.${result.format || "png"}`;
    a.click();
  };

  return (
    <Card
      className={`border-2 border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-indigo-950/20 dark:to-violet-950/20 ${className}`}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Image className="w-5 h-5 text-indigo-500" />
          AI Image Creative Generator
        </CardTitle>
        <CardDescription>
          Generate platform-optimized image creatives using the Max Booster AI
          model — cinematic, styled, and ready to post.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <Badge
            variant="outline"
            className="text-indigo-600 border-indigo-300"
          >
            {PLATFORM_LABELS[platform] || platform}
          </Badge>
          <Badge
            variant="outline"
            className="text-violet-600 border-violet-300"
          >
            {topic.slice(0, 40)}
            {topic.length > 40 ? "…" : ""}
          </Badge>
        </div>

        <div className="space-y-2">
          <Label>Visual Style</Label>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2">
            {STYLES.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedStyle(s.id)}
                className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 text-xs transition-all cursor-pointer ${
                  selectedStyle === s.id
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 shadow-sm"
                    : "border-border hover:border-indigo-300"
                }`}
              >
                <div
                  className="w-5 h-5 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="font-medium leading-tight text-center">
                  {s.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Tone</Label>
            <Select
              value={selectedTone}
              onValueChange={(v) => setSelectedTone(v as ImageTone)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="energetic">Energetic</SelectItem>
                <SelectItem value="calm">Calm</SelectItem>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="playful">Playful</SelectItem>
                <SelectItem value="dramatic">Dramatic</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !topic.trim()}
              className="w-full bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Image
                </>
              )}
            </Button>
          </div>
        </div>

        {result && (
          <div className="space-y-4 pt-2 border-t">
            {result.url ? (
              <div className="space-y-3">
                <div className="rounded-lg overflow-hidden border bg-black">
                  <img
                    src={result.url}
                    alt="AI-generated creative"
                    className="w-full object-contain max-h-80"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    {result.width}×{result.height}
                  </Badge>
                  <Badge variant="secondary">
                    {result.format?.toUpperCase()}
                  </Badge>
                  <Badge variant="secondary">
                    {result.processing_time_ms}ms
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleDownload}
                    variant="outline"
                    className="flex-1"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleGenerate}
                    variant="outline"
                    className="flex-1"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Regenerate
                  </Button>
                </div>
              </div>
            ) : result.visual_spec ? (
              <div className="space-y-3">
                <div className="p-4 rounded-lg bg-muted/50 border space-y-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-500" />
                    <span className="font-semibold text-sm">
                      AI Visual Spec Generated
                    </span>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Generated Prompt
                    </Label>
                    <p className="text-sm leading-relaxed bg-background p-3 rounded border">
                      {result.visual_spec.thumbnail_prompt}
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleCopyPrompt}
                      className="h-7 text-xs"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3 h-3 mr-1" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 mr-1" /> Copy Prompt
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Palette className="w-3 h-3" /> Color Scheme
                    </Label>
                    <div className="flex gap-2 flex-wrap">
                      {Object.entries(result.visual_spec.color_scheme).map(
                        ([key, hex]) => (
                          <div key={key} className="flex items-center gap-1">
                            <div
                              className="w-5 h-5 rounded-full border shadow-sm"
                              style={{ backgroundColor: hex }}
                              title={`${key}: ${hex}`}
                            />
                            <span className="text-xs text-muted-foreground">
                              {key}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Layout className="w-3 h-3" /> Layout
                    </Label>
                    <p className="text-sm">{result.visual_spec.layout}</p>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="outline">
                      {result.visual_spec.dimensions.width}×
                      {result.visual_spec.dimensions.height}
                    </Badge>
                    <Badge variant="outline">
                      {result.visual_spec.format?.toUpperCase()}
                    </Badge>
                    <Badge variant="outline">
                      {result.visual_spec.processing_time_ms}ms
                    </Badge>
                  </div>
                </div>

                <Button
                  size="sm"
                  onClick={handleGenerate}
                  variant="outline"
                  className="w-full"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Regenerate
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
