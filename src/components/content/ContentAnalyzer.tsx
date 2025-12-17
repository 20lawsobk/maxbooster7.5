import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  Sparkles,
  Image as ImageIcon,
  Video,
  Music,
  FileText,
  Globe,
  Upload,
  Loader2,
  CheckCircle,
  TrendingUp,
  Eye,
  Heart,
  Share2,
  Zap,
  Target,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface AnalysisResult {
  type: 'image' | 'video' | 'audio' | 'text' | 'website';
  data: any;
  timestamp: string;
}

export function ContentAnalyzer() {
  const [activeTab, setActiveTab] = useState<'image' | 'video' | 'audio' | 'text' | 'website'>('image');
  const [imageUrl, setImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [textContent, setTextContent] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const { toast } = useToast();

  const analyzeContent = async (type: string, url: string, content?: string) => {
    setAnalyzing(true);
    setResult(null);

    try {
      const endpoint = `/api/content-analysis/${type}`;
      const payload =
        type === 'text'
          ? { text: content }
          : type === 'video'
          ? { videoUrl: url, duration: 30 }
          : type === 'audio'
          ? { audioUrl: url }
          : type === 'website'
          ? { websiteUrl: url }
          : { imageUrl: url };

      const response = await apiRequest('POST', endpoint, payload);

      if (response.success) {
        setResult({
          type: type as any,
          data: response.analysis,
          timestamp: response.timestamp,
        });
        toast({
          title: '✨ Analysis Complete',
          description: `Your ${type} has been analyzed with AI-powered insights.`,
        });
      }
    } catch (error: any) {
      toast({
        title: 'Analysis Failed',
        description: error.message || 'Failed to analyze content. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const saveForAutopilotTraining = async () => {
    if (!result) return;

    try {
      // Save analyzed features to database for autopilot training
      await apiRequest('POST', '/api/autopilot/save-features', {
        contentType: result.type,
        features: result.data,
        contentUrl: result.type === 'image' ? imageUrl : result.type === 'video' ? videoUrl : result.type === 'audio' ? audioUrl : result.type === 'website' ? websiteUrl : undefined,
        contentText: result.type === 'text' ? textContent : undefined,
      });

      toast({
        title: '🎯 Saved for Training',
        description: 'This content analysis will be used to improve your autopilot AI predictions.',
        duration: 3000,
      });
    } catch (error: any) {
      toast({
        title: 'Save Failed',
        description: error.message || 'Failed to save for autopilot training.',
        variant: 'destructive',
      });
    }
  };

  const renderImageAnalysis = (data: any) => (
    <div className="space-y-4">
      <div>
        <h4 className="font-semibold mb-2 flex items-center gap-2">
          <Eye className="h-4 w-4" />
          Visual Composition
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Layout</p>
            <Badge variant="secondary">{data.composition?.layout}</Badge>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Color Mood</p>
            <Badge variant="secondary">{data.colors?.mood}</Badge>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Complexity</p>
            <Progress value={data.composition?.complexity * 100} className="h-2" />
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Attention Score</p>
            <Progress value={data.engagement?.attentionGrabbing * 100} className="h-2" />
          </div>
        </div>
      </div>

      <div>
        <h4 className="font-semibold mb-2 flex items-center gap-2">
          <Heart className="h-4 w-4" />
          Engagement Potential
        </h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm">Shareability</span>
            <span className="text-sm font-medium">{Math.round(data.engagement?.shareability * 100)}%</span>
          </div>
          <Progress value={data.engagement?.shareability * 100} />
          
          <div className="flex items-center justify-between">
            <span className="text-sm">Emotional Impact</span>
            <Badge>{data.engagement?.emotionalImpact}</Badge>
          </div>
        </div>
      </div>

      <div>
        <h4 className="font-semibold mb-2">Content Details</h4>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-3 w-3" />
            Faces: {data.content?.hasFaces ? `Yes (${data.content.faceCount})` : 'No'}
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-3 w-3" />
            Text: {data.content?.hasText ? data.content.textAmount : 'None'}
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-3 w-3" />
            Branding: {Math.round(data.branding?.brandingStrength * 100)}%
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-3 w-3" />
            Quality: {Math.round(data.branding?.professionalQuality * 100)}%
          </div>
        </div>
      </div>

      {data.vibe && data.vibe.length > 0 && (
        <div>
          <h4 className="font-semibold mb-2">Visual Vibe</h4>
          <div className="flex flex-wrap gap-2">
            {data.vibe.map((v: string, i: number) => (
              <Badge key={i} variant="outline">{v}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderVideoAnalysis = (data: any) => (
    <div className="space-y-4">
      <div>
        <h4 className="font-semibold mb-2 flex items-center gap-2">
          <Video className="h-4 w-4" />
          Video Metrics
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Duration</p>
            <Badge variant="secondary">{data.duration}s</Badge>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Motion</p>
            <Badge variant="secondary">{data.motion?.intensity}</Badge>
          </div>
        </div>
      </div>

      <div>
        <h4 className="font-semibold mb-2 flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Engagement Scores
        </h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm">Hook Strength</span>
            <span className="text-sm font-medium">{Math.round(data.engagement?.hookStrength * 100)}%</span>
          </div>
          <Progress value={data.engagement?.hookStrength * 100} />
          
          <div className="flex items-center justify-between">
            <span className="text-sm">Viral Potential</span>
            <span className="text-sm font-medium">{Math.round(data.viralPotential * 100)}%</span>
          </div>
          <Progress value={data.viralPotential * 100} />
        </div>
      </div>

      <div>
        <h4 className="font-semibold mb-2">Retention Estimates</h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm">First 5 Seconds</span>
            <span className="text-sm font-medium">{Math.round(data.engagement?.retention?.first5Seconds * 100)}%</span>
          </div>
          <Progress value={data.engagement?.retention?.first5Seconds * 100} />
          
          <div className="flex items-center justify-between">
            <span className="text-sm">Overall Retention</span>
            <span className="text-sm font-medium">{Math.round(data.engagement?.retention?.overall * 100)}%</span>
          </div>
          <Progress value={data.engagement?.retention?.overall * 100} />
        </div>
      </div>

      <div>
        <h4 className="font-semibold mb-2">Audio & Visual</h4>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-3 w-3" />
            Music: {data.audio?.hasMusic ? 'Yes' : 'No'}
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-3 w-3" />
            Speech: {data.audio?.hasSpeech ? 'Yes' : 'No'}
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-3 w-3" />
            CTA: {data.engagement?.callToActionPresence ? 'Present' : 'None'}
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-3 w-3" />
            Quality: {Math.round(data.visual?.quality * 100)}%
          </div>
        </div>
      </div>
    </div>
  );

  const renderTextAnalysis = (data: any) => (
    <div className="space-y-4">
      <div>
        <h4 className="font-semibold mb-2 flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Text Metrics
        </h4>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Words</p>
            <Badge variant="secondary">{data.structure?.length}</Badge>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Sentiment</p>
            <Badge variant="secondary">{data.tone?.sentiment}</Badge>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Formality</p>
            <Badge variant="secondary">{data.tone?.formality}</Badge>
          </div>
        </div>
      </div>

      <div>
        <h4 className="font-semibold mb-2 flex items-center gap-2">
          <Zap className="h-4 w-4" />
          Performance Scores
        </h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm">Energy Level</span>
            <span className="text-sm font-medium">{Math.round(data.tone?.energy * 100)}%</span>
          </div>
          <Progress value={data.tone?.energy * 100} />
          
          <div className="flex items-center justify-between">
            <span className="text-sm">Viral Potential</span>
            <span className="text-sm font-medium">{Math.round(data.engagement?.viralPotential * 100)}%</span>
          </div>
          <Progress value={data.engagement?.viralPotential * 100} />
          
          <div className="flex items-center justify-between">
            <span className="text-sm">Persuasiveness</span>
            <span className="text-sm font-medium">{Math.round(data.quality?.persuasiveness * 100)}%</span>
          </div>
          <Progress value={data.quality?.persuasiveness * 100} />
        </div>
      </div>

      {data.content?.mainTopics && data.content.mainTopics.length > 0 && (
        <div>
          <h4 className="font-semibold mb-2">Main Topics</h4>
          <div className="flex flex-wrap gap-2">
            {data.content.mainTopics.map((topic: string, i: number) => (
              <Badge key={i} variant="outline">{topic}</Badge>
            ))}
          </div>
        </div>
      )}

      {data.tone?.emotion && data.tone.emotion.length > 0 && (
        <div>
          <h4 className="font-semibold mb-2">Emotional Tone</h4>
          <div className="flex flex-wrap gap-2">
            {data.tone.emotion.map((emotion: string, i: number) => (
              <Badge key={i}>{emotion}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderWebsiteAnalysis = (data: any) => (
    <div className="space-y-4">
      <div>
        <h4 className="font-semibold mb-2 flex items-center gap-2">
          <Globe className="h-4 w-4" />
          Design & UX
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Layout</p>
            <Badge variant="secondary">{data.design?.layout}</Badge>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Color Scheme</p>
            <Badge variant="secondary">{data.design?.colorScheme}</Badge>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Visual Hierarchy</p>
            <Progress value={data.design?.visualHierarchy * 100} className="h-2" />
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Mobile Optimized</p>
            <Badge variant={data.ux?.mobileOptimized ? 'default' : 'destructive'}>
              {data.ux?.mobileOptimized ? 'Yes' : 'No'}
            </Badge>
          </div>
        </div>
      </div>

      <div>
        <h4 className="font-semibold mb-2 flex items-center gap-2">
          <Target className="h-4 w-4" />
          Conversion Optimization
        </h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm">CTA Clarity</span>
            <span className="text-sm font-medium">{Math.round(data.content?.ctaClarity * 100)}%</span>
          </div>
          <Progress value={data.content?.ctaClarity * 100} />
          
          <div className="flex items-center justify-between">
            <span className="text-sm">Overall Conversion Score</span>
            <span className="text-sm font-medium">{Math.round(data.conversion?.conversionOptimization * 100)}%</span>
          </div>
          <Progress value={data.conversion?.conversionOptimization * 100} />
        </div>
      </div>

      <div>
        <h4 className="font-semibold mb-2">Trust Signals</h4>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-3 w-3" />
            Social Proof: {data.content?.socialProof ? 'Yes' : 'No'}
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-3 w-3" />
            Urgency: {data.conversion?.urgency ? 'Yes' : 'No'}
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-3 w-3" />
            Scarcity: {data.conversion?.scarcity ? 'Yes' : 'No'}
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-3 w-3" />
            Guarantees: {data.conversion?.guarantees ? 'Yes' : 'No'}
          </div>
        </div>
      </div>

      {data.content?.trustSignals && data.content.trustSignals.length > 0 && (
        <div>
          <h4 className="font-semibold mb-2">Trust Elements</h4>
          <div className="flex flex-wrap gap-2">
            {data.content.trustSignals.map((signal: string, i: number) => (
              <Badge key={i} variant="outline">{signal}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <CardTitle>Multimodal Content Analysis</CardTitle>
        </div>
        <CardDescription>
          AI-powered analysis of images, videos, audio, text, and websites to maximize engagement
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-4">
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="image">
              <ImageIcon className="h-4 w-4 mr-2" />
              Image
            </TabsTrigger>
            <TabsTrigger value="video">
              <Video className="h-4 w-4 mr-2" />
              Video
            </TabsTrigger>
            <TabsTrigger value="audio">
              <Music className="h-4 w-4 mr-2" />
              Audio
            </TabsTrigger>
            <TabsTrigger value="text">
              <FileText className="h-4 w-4 mr-2" />
              Text
            </TabsTrigger>
            <TabsTrigger value="website">
              <Globe className="h-4 w-4 mr-2" />
              Website
            </TabsTrigger>
          </TabsList>

          <TabsContent value="image" className="space-y-4">
            <div className="space-y-2">
              <Label>Image URL</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://example.com/image.jpg"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                />
                <Button
                  onClick={() => analyzeContent('image', imageUrl)}
                  disabled={analyzing || !imageUrl}
                >
                  {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Analyze'}
                </Button>
              </div>
            </div>
            {result && result.type === 'image' && renderImageAnalysis(result.data)}
          </TabsContent>

          <TabsContent value="video" className="space-y-4">
            <div className="space-y-2">
              <Label>Video URL</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://example.com/video.mp4"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                />
                <Button
                  onClick={() => analyzeContent('video', videoUrl)}
                  disabled={analyzing || !videoUrl}
                >
                  {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Analyze'}
                </Button>
              </div>
            </div>
            {result && result.type === 'video' && renderVideoAnalysis(result.data)}
          </TabsContent>

          <TabsContent value="audio" className="space-y-4">
            <div className="space-y-2">
              <Label>Audio URL</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://example.com/track.mp3"
                  value={audioUrl}
                  onChange={(e) => setAudioUrl(e.target.value)}
                />
                <Button
                  onClick={() => analyzeContent('audio', audioUrl)}
                  disabled={analyzing || !audioUrl}
                >
                  {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Analyze'}
                </Button>
              </div>
            </div>
            {result && result.type === 'audio' && (
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">Music Analysis</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-sm text-muted-foreground">Tempo</p>
                      <Badge>{result.data.music?.tempo} BPM</Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Key</p>
                      <Badge>{result.data.music?.key}</Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Mode</p>
                      <Badge>{result.data.music?.mode}</Badge>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Audio Qualities</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Energy</span>
                      <span className="text-sm font-medium">{Math.round(result.data.music?.energy * 100)}%</span>
                    </div>
                    <Progress value={result.data.music?.energy * 100} />
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Marketability</span>
                      <span className="text-sm font-medium">{Math.round(result.data.marketability * 100)}%</span>
                    </div>
                    <Progress value={result.data.marketability * 100} />
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="text" className="space-y-4">
            <div className="space-y-2">
              <Label>Text Content</Label>
              <div className="space-y-2">
                <textarea
                  className="w-full min-h-[120px] p-3 rounded-md border bg-background"
                  placeholder="Enter your text content to analyze..."
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                />
                <Button
                  onClick={() => analyzeContent('text', '', textContent)}
                  disabled={analyzing || !textContent}
                  className="w-full"
                >
                  {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Analyze Text'}
                </Button>
              </div>
            </div>
            {result && result.type === 'text' && renderTextAnalysis(result.data)}
          </TabsContent>

          <TabsContent value="website" className="space-y-4">
            <div className="space-y-2">
              <Label>Website URL</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://example.com"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                />
                <Button
                  onClick={() => analyzeContent('website', websiteUrl)}
                  disabled={analyzing || !websiteUrl}
                >
                  {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Analyze'}
                </Button>
              </div>
            </div>
            {result && result.type === 'website' && renderWebsiteAnalysis(result.data)}
          </TabsContent>
        </Tabs>

        {/* Save for Autopilot Training Button */}
        {result && !analyzing && (
          <div className="mt-4 p-4 border rounded-lg bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-950/20 dark:to-blue-950/20 border-cyan-200 dark:border-cyan-800">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold flex items-center gap-2">
                  <Zap className="h-4 w-4 text-cyan-600" />
                  Use for Autopilot Training
                </h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Save this analysis to improve your AI autopilot predictions for future content
                </p>
              </div>
              <Button
                onClick={saveForAutopilotTraining}
                variant="default"
                className="bg-cyan-600 hover:bg-cyan-700"
              >
                <Target className="h-4 w-4 mr-2" />
                Save for Training
              </Button>
            </div>
          </div>
        )}

        {analyzing && (
          <div className="mt-4 p-4 border rounded-lg bg-muted/30">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div>
                <p className="font-medium">Analyzing your content...</p>
                <p className="text-sm text-muted-foreground">
                  Our AI is extracting features to optimize engagement
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
