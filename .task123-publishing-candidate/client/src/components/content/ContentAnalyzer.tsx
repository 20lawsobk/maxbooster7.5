import { useState, type ChangeEvent, type ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  apiRequest,
  getAuthToken,
  getCsrfTokenFromCookie,
} from "@/lib/queryClient";
import {
  FileText,
  Globe,
  Image as ImageIcon,
  Loader2,
  Music,
  Sparkles,
  Upload,
  Video,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  AnalysisEnvelope,
  AnalysisKind,
  AnalysisValue,
  ContentAnalysisResponse,
} from "@shared/types/contentAnalysis";

type ContentType = AnalysisKind | "audio";
type AudioFacts = Record<string, unknown> & { source?: string };
type Result =
  | { type: AnalysisKind; data: AnalysisEnvelope; timestamp: string }
  | { type: "audio"; data: AudioFacts; timestamp: string };

const AUDIO_UPLOAD_TYPES = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mpeg",
  "audio/flac",
  "audio/x-flac",
  "audio/ogg",
  "audio/opus",
  "audio/webm",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/aiff",
  "audio/x-aiff",
]);
const OWNED_AUDIO_ASSET =
  /^\/uploads\/audio-inputs\/[a-f0-9]{64}\/[a-f0-9-]+\.(?:wav|mp3|flac|ogg|opus|webm|m4a|aac|aiff)$/i;

function readableLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function scalar(value: string | number | boolean | null): ReactNode {
  if (value === null) return <span className="text-muted-foreground">Not available</span>;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

/** React escapes every string rendered here; upstream values are never HTML. */
export function StructuredFacts({
  value,
  depth = 0,
}: {
  value: AnalysisValue | unknown;
  depth?: number;
}) {
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground">None measured</span>;
    const objects = value.some((item) => item && typeof item === "object");
    return objects ? (
      <div className="space-y-2">
        {value.map((item, index) => (
          <div key={index} className="rounded-md border p-2">
            <StructuredFacts value={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    ) : (
      <div className="flex flex-wrap gap-2">
        {value.map((item, index) => (
          <Badge key={index} variant="outline">{scalar(item as never)}</Badge>
        ))}
      </div>
    );
  }
  if (value && typeof value === "object") {
    return (
      <dl className={depth === 0 ? "grid gap-3 sm:grid-cols-2" : "space-y-2"}>
        {Object.entries(value as Record<string, unknown>).map(([key, nested]) => (
          <div key={key} className="min-w-0 rounded-md border bg-muted/20 p-3">
            <dt className="text-xs font-medium text-muted-foreground">
              {readableLabel(key)}
            </dt>
            <dd className="mt-1 break-words text-sm">
              <StructuredFacts value={nested} depth={depth + 1} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return <>{scalar(value as string | number | boolean | null)}</>;
}

async function ensureCsrfToken(): Promise<string> {
  const existing = getCsrfTokenFromCookie();
  if (existing) return existing;
  const response = await fetch("/api/csrf-token", {
    credentials: "include",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.csrfToken !== "string" || !body.csrfToken) {
    throw new Error("Unable to initialize secure upload");
  }
  return body.csrfToken;
}

export function ContentAnalyzer() {
  const [activeTab, setActiveTab] = useState<ContentType>("image");
  const [values, setValues] = useState<Record<ContentType, string>>({
    image: "",
    video: "",
    audio: "",
    text: "",
    website: "",
  });
  const [analyzing, setAnalyzing] = useState(false);
  const [uploading, setUploading] = useState<"image" | "video" | "audio" | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const { toast } = useToast();

  const update = (type: ContentType, value: string) =>
    setValues((current) => ({ ...current, [type]: value }));

  const analyze = async (type: ContentType, supplied?: string) => {
    const value = (supplied ?? values[type]).trim();
    if (!value) return;
    setAnalyzing(true);
    setResult(null);
    try {
      const body =
        type === "text"
          ? { text: value }
          : type === "website"
            ? { url: /^https?:\/\//i.test(value) ? value : `https://${value}` }
            : type === "image"
              ? { imageUrl: value }
              : type === "video"
                ? { videoUrl: value }
                : { audioUrl: value };
      const response = await apiRequest(
        "POST",
        `/api/content-analysis/${type}`,
        body,
        { timeout: 600_000 },
      );
      const payload = await response.json();
      if (type === "audio") {
        setResult({ type, data: payload.analysis as AudioFacts, timestamp: payload.timestamp });
      } else {
        const typed = payload as ContentAnalysisResponse;
        setResult({ type, data: typed.analysis, timestamp: typed.timestamp });
      }
      toast({
        title: "Analysis complete",
        description:
          type === "audio"
            ? "MaxCore Audio Conductor measurements are ready."
            : "Native algorithmic measurements are ready.",
      });
    } catch (error) {
      toast({
        title: "Analysis failed",
        description: error instanceof Error ? error.message : "Unable to analyze this content.",
        variant: "destructive",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const upload = async (
    kind: "image" | "video" | "audio",
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (kind === "audio" && !AUDIO_UPLOAD_TYPES.has(file.type.toLowerCase())) {
      toast({
        title: "Unsupported audio type",
        description: "Select WAV, MP3, FLAC, OGG, Opus, WebM, M4A, AAC, or AIFF audio.",
        variant: "destructive",
      });
      return;
    }
    const limit = kind === "image" ? 16 * 1024 * 1024 : 100 * 1024 * 1024;
    if (file.size > limit) {
      toast({ title: "File too large", description: `${kind === "image" ? "Images" : kind === "video" ? "Videos" : "Audio files"} must be no larger than ${kind === "image" ? "16" : "100"} MiB.`, variant: "destructive" });
      return;
    }
    setUploading(kind);
    try {
      const token = await ensureCsrfToken();
      const authToken = getAuthToken();
      const endpoint =
        kind === "audio"
          ? "/api/audio/upload"
          : `/api/content-analysis/assets?kind=${kind}`;
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": file.type,
          "x-csrf-token": token,
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: file,
      });
      const body = await response.json().catch(() => ({}));
      if (
        !response.ok ||
        typeof body.url !== "string" ||
        (kind === "audio" && !OWNED_AUDIO_ASSET.test(body.url))
      ) {
        throw new Error(body.error || "Upload failed");
      }
      update(kind, body.url);
      await analyze(kind, body.url);
    } catch (error) {
      toast({
        title: "Upload failed",
          description: error instanceof Error ? error.message : "Unable to upload this file.",
        variant: "destructive",
      });
    } finally {
      setUploading(null);
    }
  };

  const renderResult = (type: ContentType) => {
    if (!result || result.type !== type) return null;
    if (result.type === "audio") {
      return (
        <div className="space-y-3 rounded-lg border p-4">
          <div>
            <h4 className="font-semibold">Measured Audio Analysis</h4>
            <p className="text-xs text-muted-foreground">
              Provenance: {result.data.source ?? "MaxCore Audio Conductor"}
            </p>
          </div>
          <StructuredFacts value={result.data} />
        </div>
      );
    }
    return (
      <div className="space-y-4 rounded-lg border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>MaxCore native analysis</Badge>
          <Badge variant="secondary">{readableLabel(result.data.kind)}</Badge>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Method</p>
          <p className="text-sm">{result.data.method}</p>
        </div>
        <StructuredFacts value={result.data.analysis} />
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Limitations</p>
          {result.data.limitations.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {result.data.limitations.map((limitation, index) => (
                <li key={index}>{limitation}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No additional limitations reported.</p>
          )}
        </div>
      </div>
    );
  };

  const mediaTab = (kind: "image" | "video") => (
    <TabsContent value={kind} className="space-y-4">
      <div className="space-y-2">
        <Label>{readableLabel(kind)} URL</Label>
        <div className="flex gap-2">
          <Input
            aria-label={`${readableLabel(kind)} URL`}
            placeholder={`https://example.com/${kind === "image" ? "image.jpg" : "video.mp4"}`}
            value={values[kind]}
            onChange={(event) => update(kind, event.target.value)}
          />
          <Button onClick={() => analyze(kind)} disabled={analyzing || !values[kind]}>
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Analyze"}
          </Button>
        </div>
        <div>
          <Input
            className="sr-only"
            id={`${kind}-analysis-file`}
            type="file"
            accept={kind === "image" ? "image/jpeg,image/png,image/webp" : "video/mp4,video/webm,video/quicktime"}
            onChange={(event) => upload(kind, event)}
          />
          <Button asChild variant="outline" size="sm">
            <Label htmlFor={`${kind}-analysis-file`} className="cursor-pointer">
              {uploading === kind ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Upload {readableLabel(kind)}
            </Label>
          </Button>
          <span className="ml-2 text-xs text-muted-foreground">
            {kind === "image" ? "16 MiB maximum" : "100 MiB maximum"}
          </span>
        </div>
      </div>
      {renderResult(kind)}
    </TabsContent>
  );

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <CardTitle>Multimodal Content Analysis</CardTitle>
        </div>
        <CardDescription>
          Measured pixel, frame, text, HTML, and audio facts from MaxCore. This is
          algorithmic analysis, not learned semantic vision or performance prediction.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ContentType)} className="space-y-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="image"><ImageIcon className="mr-2 h-4 w-4" />Image</TabsTrigger>
            <TabsTrigger value="video"><Video className="mr-2 h-4 w-4" />Video</TabsTrigger>
            <TabsTrigger value="audio"><Music className="mr-2 h-4 w-4" />Audio</TabsTrigger>
            <TabsTrigger value="text"><FileText className="mr-2 h-4 w-4" />Text</TabsTrigger>
            <TabsTrigger value="website"><Globe className="mr-2 h-4 w-4" />Website</TabsTrigger>
          </TabsList>
          {mediaTab("image")}
          {mediaTab("video")}
          <TabsContent value="audio" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="audio-analysis-file">Owned audio asset</Label>
              <p className="text-sm text-muted-foreground">
                Select an audio file to upload securely to your private MaxCore analysis storage.
              </p>
              <Input
                className="sr-only"
                id="audio-analysis-file"
                type="file"
                accept="audio/wav,audio/x-wav,audio/wave,audio/mpeg,audio/flac,audio/x-flac,audio/ogg,audio/opus,audio/webm,audio/mp4,audio/x-m4a,audio/aac,audio/aiff,audio/x-aiff"
                onChange={(event) => upload("audio", event)}
              />
              <Button asChild variant="outline">
                <Label htmlFor="audio-analysis-file" className="cursor-pointer">
                  {uploading === "audio" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  Select and analyze audio
                </Label>
              </Button>
              {values.audio && (
                <p className="break-all text-xs text-muted-foreground">
                  Owned asset ready: {values.audio}
                </p>
              )}
            </div>
            {renderResult("audio")}
          </TabsContent>
          <TabsContent value="text" className="space-y-4">
            <Label>Text Content</Label>
            <textarea className="min-h-[120px] w-full rounded-md border bg-background p-3" value={values.text} onChange={(event) => update("text", event.target.value)} placeholder="Enter text to measure..." />
            <Button className="w-full" onClick={() => analyze("text")} disabled={analyzing || !values.text}>Analyze Text</Button>
            {renderResult("text")}
          </TabsContent>
          <TabsContent value="website" className="space-y-4">
            <Label>Website URL</Label>
            <div className="flex gap-2">
              <Input value={values.website} onChange={(event) => update("website", event.target.value)} placeholder="https://example.com" />
              <Button onClick={() => analyze("website")} disabled={analyzing || !values.website}>Analyze</Button>
            </div>
            {renderResult("website")}
          </TabsContent>
        </Tabs>
        {analyzing && (
          <div className="mt-4 flex items-center gap-3 rounded-lg border bg-muted/30 p-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div>
              <p className="font-medium">Analyzing your content...</p>
              <p className="text-sm text-muted-foreground">MaxCore is measuring native content properties.</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}