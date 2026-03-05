import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Input } from '@/components/ui/input';
import {
  Wand2,
  Globe,
  Brain,
  TrendingUp,
  Hash,
  Calendar,
  TestTube2,
  Copy,
  Sparkles,
  Loader2,
  CheckCircle2,
  Clock,
  Target,
  Users,
  Zap,
  Bot,
  FileText,
  Link,
  ChevronDown,
  ChevronUp,
  Music,
  Newspaper,
  ShoppingBag,
  Star,
  Eye,
  Heart,
  Play,
  Timer,
  Tag,
  MapPin,
  Mic,
  DollarSign,
  Database,
} from 'lucide-react';

const PLATFORMS = [
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'twitter', label: 'Twitter/X' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'googlebusiness', label: 'Google Business' },
  { value: 'threads', label: 'Threads' },
];

const TONES = [
  { value: 'energetic', label: 'Energetic' },
  { value: 'professional', label: 'Professional' },
  { value: 'casual', label: 'Casual' },
  { value: 'edgy', label: 'Edgy' },
  { value: 'playful', label: 'Playful' },
  { value: 'serious', label: 'Serious' },
  { value: 'promotional', label: 'Promotional' },
];

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', flag: '🇧🇷' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
];

interface AIGenerateResult {
  success: boolean;
  platform: string;
  source: 'ai' | 'template';
  processingTimeMs: number;
  hook: string;
  body: string;
  cta: string;
  caption: string;
  hashtags: string[];
  content?: any;
}

interface TrendingTopic {
  id: string;
  topic: string;
  popularity: number;
  category: string;
  relevance: number;
}

interface HashtagCategory {
  category: string;
  hashtags: string[];
  reach: 'high' | 'medium' | 'niche';
}

interface ABVariant {
  id: string;
  content: string;
  predictedEngagement: number;
  strengths: string[];
}

interface PostingTime {
  day: string;
  time: string;
  engagement_score: number;
}

export function ContentGenerator() {
  const { toast } = useToast();
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [culturalAdaptation, setCulturalAdaptation] = useState(true);
  const [contentPrompt, setContentPrompt] = useState('');
  const [generatedContent, setGeneratedContent] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState('instagram');
  const [selectedTone, setSelectedTone] = useState('energetic');
  const [aiResult, setAiResult] = useState<AIGenerateResult | null>(null);
  const [variantCount, setVariantCount] = useState(3);

  const [showUrlImport, setShowUrlImport] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [urlAnalysis, setUrlAnalysis] = useState<any>(null);
  const [urlImporting, setUrlImporting] = useState(false);

  const { data: trendingTopics, isLoading: loadingTrends } = useQuery<TrendingTopic[]>({
    queryKey: ['/api/social/ai-content/trending-topics'],
    queryFn: async () => {
      try {
        const res = await apiRequest('GET', '/api/social/ai-content/trending-topics');
        return await res.json();
      } catch {
        return [];
      }
    },
    retry: false,
    staleTime: 300000,
  });

  const { data: postingTimes, isLoading: loadingTimes } = useQuery<PostingTime[]>({
    queryKey: ['/api/social/ai-content/posting-times'],
    queryFn: async () => {
      try {
        const res = await apiRequest('GET', '/api/social/ai-content/posting-times');
        return await res.json();
      } catch {
        return [];
      }
    },
    retry: false,
    staleTime: 300000,
  });

  const analyzeBrandVoiceMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('/api/social/ai-content/analyze-brand-voice', {
        method: 'POST',
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Brand Voice Analyzed',
        description: `Analyzed ${data.posts_analyzed} posts. Voice profile updated.`,
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Analysis Failed',
        description: error.message || 'Unable to analyze brand voice',
        variant: 'destructive',
      });
    },
  });

  const generateContentMutation = useMutation({
    mutationFn: async (data: { prompt: string; language: string; culturalAdaptation: boolean }) => {
      const res = await apiRequest('/api/social/ai-content/multilingual', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: (data) => {
      setGeneratedContent(data.content);
      toast({
        title: 'Content Generated',
        description: `Created ${selectedLanguage === 'en' ? 'English' : LANGUAGES.find((l) => l.code === selectedLanguage)?.name} content`,
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Generation Failed',
        description: (error as any).message || 'Unable to generate content',
        variant: 'destructive',
      });
    },
  });

  const aiGenerateMutation = useMutation({
    mutationFn: async (data: { topic: string; platform: string; tone: string; genre?: string; artistName?: string; trackTitle?: string; contentType?: string }) => {
      const res = await apiRequest('POST', '/api/social/generate', data);
      return await res.json() as AIGenerateResult;
    },
    onSuccess: (data) => {
      setAiResult(data);
      const caption = data.caption || `${data.hook}\n\n${data.body}\n\n${data.cta}`;
      setGeneratedContent(caption);
      toast({
        title: 'Content Generated',
        description: `Created ${PLATFORMS.find(p => p.value === data.platform)?.label || data.platform} content via ${data.source === 'ai' ? 'AI Model' : 'Smart Templates'} in ${(data.processingTimeMs / 1000).toFixed(1)}s`,
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Generation Failed',
        description: (error as any).message || 'Unable to generate content',
        variant: 'destructive',
      });
    },
  });

  const optimizeHashtagsMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest('/api/social/ai-content/optimize-hashtags', {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
      return res.json();
    },
    onError: (error: unknown) => {
      toast({
        title: 'Hashtag Optimization Failed',
        description: error.message || 'Unable to optimize hashtags',
        variant: 'destructive',
      });
    },
  });

  const generateABVariantsMutation = useMutation({
    mutationFn: async (data: { content: string; variantCount: number }) => {
      const res = await apiRequest('/api/social/ai-content/ab-variants', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onError: (error: unknown) => {
      toast({
        title: 'Variant Generation Failed',
        description: error.message || 'Unable to generate variants',
        variant: 'destructive',
      });
    },
  });

  const handleGenerateContent = () => {
    if (!contentPrompt.trim()) {
      toast({
        title: 'Missing Prompt',
        description: 'Please enter a content description',
        variant: 'destructive',
      });
      return;
    }

    const urlContext = urlAnalysis ? {
      genre:          urlAnalysis.genre && urlAnalysis.genre !== 'default' ? urlAnalysis.genre : undefined,
      artistName:     urlAnalysis.artist || undefined,
      trackTitle:     urlAnalysis.track || undefined,
      albumName:      urlAnalysis.album || undefined,
      label:          urlAnalysis.label || undefined,
      releaseDate:    urlAnalysis.release_date || undefined,
      duration:       urlAnalysis.duration || undefined,
      urlContentType: urlAnalysis.content_type || undefined,
      contentType:    urlAnalysis.content_type && urlAnalysis.content_type !== 'website' ? urlAnalysis.content_type : undefined,
      contentCategory: urlAnalysis.content_category || undefined,
      keywords:       urlAnalysis.keywords?.length ? urlAnalysis.keywords : undefined,
      tags:           urlAnalysis.tags?.length ? urlAnalysis.tags : undefined,
      urlDescription: urlAnalysis.summary && urlAnalysis.summary !== contentPrompt ? urlAnalysis.summary : undefined,
      // Engagement context (lets AI reference popularity)
      viewCount:      urlAnalysis.view_count ?? undefined,
      likeCount:      urlAnalysis.like_count ?? undefined,
      playCount:      urlAnalysis.play_count ?? undefined,
      // Event context
      eventDate:      urlAnalysis.event_date || undefined,
      eventLocation:  urlAnalysis.event_location || undefined,
      performers:     urlAnalysis.performers?.length ? urlAnalysis.performers : undefined,
      // Product context
      price:          urlAnalysis.price || undefined,
      brand:          urlAnalysis.brand || undefined,
      rating:         urlAnalysis.rating || undefined,
      // Platform
      sourcePlatform: urlAnalysis.platform && urlAnalysis.platform !== 'web' ? urlAnalysis.platform : undefined,
    } : {};

    aiGenerateMutation.mutate({
      topic: contentPrompt,
      platform: selectedPlatform,
      tone: selectedTone,
      ...urlContext,
    });
  };

  const handleOptimizeHashtags = () => {
    if (!generatedContent) {
      toast({
        title: 'No Content',
        description: 'Generate content first to optimize hashtags',
        variant: 'destructive',
      });
      return;
    }
    optimizeHashtagsMutation.mutate(generatedContent);
  };

  const handleGenerateVariants = () => {
    if (!generatedContent) {
      toast({
        title: 'No Content',
        description: 'Generate content first to create variants',
        variant: 'destructive',
      });
      return;
    }
    generateABVariantsMutation.mutate({
      content: generatedContent,
      variantCount,
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied!',
      description: 'Content copied to clipboard',
    });
  };

  const TONE_DETECT_MAP: Record<string, string> = {
    hype: 'energetic',
    motivational: 'energetic',
    uplifting: 'casual',
    chill: 'casual',
    romantic: 'casual',
    dark: 'edgy',
    informative: 'professional',
    promotional: 'promotional',
    default: 'energetic',
  };

  const CATEGORY_ICON: Record<string, React.ReactNode> = {
    music:       <Music className="w-3 h-3" />,
    music_news:  <Music className="w-3 h-3" />,
    news:        <Newspaper className="w-3 h-3" />,
    tech:        <Zap className="w-3 h-3" />,
    business:    <Star className="w-3 h-3" />,
    culture:     <Star className="w-3 h-3" />,
    event:       <Calendar className="w-3 h-3" />,
    product:     <ShoppingBag className="w-3 h-3" />,
    ecommerce:   <ShoppingBag className="w-3 h-3" />,
    social:      <Globe className="w-3 h-3" />,
    video:       <Globe className="w-3 h-3" />,
    entertainment:<Globe className="w-3 h-3" />,
  };

  const handleUrlImport = async () => {
    if (!importUrl.trim()) return;
    setUrlImporting(true);
    setUrlAnalysis(null);
    try {
      const res = await apiRequest('POST', '/api/social/analyze-url', {
        url: importUrl.trim(),
        platform: selectedPlatform,
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Analysis failed');
      const analysis = data.analysis;
      setUrlAnalysis(analysis);

      const prompt = analysis.summary || analysis.title || importUrl;
      setContentPrompt(prompt);

      const mappedTone = TONE_DETECT_MAP[analysis.tone] || 'energetic';
      if (mappedTone) setSelectedTone(mappedTone);

      toast({
        title: 'URL imported',
        description: `Loaded from ${analysis.domain || analysis.platform}`,
      });
    } catch (err: any) {
      toast({
        title: 'Import failed',
        description: err.message || 'Could not analyze that URL',
        variant: 'destructive',
      });
    } finally {
      setUrlImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          AI Content Generator
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="generate" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="generate">
              <Wand2 className="w-4 h-4 mr-1" />
              Generate
            </TabsTrigger>
            <TabsTrigger value="trends">
              <TrendingUp className="w-4 h-4 mr-1" />
              Trends
            </TabsTrigger>
            <TabsTrigger value="calendar">
              <Calendar className="w-4 h-4 mr-1" />
              Schedule
            </TabsTrigger>
            <TabsTrigger value="testing">
              <TestTube2 className="w-4 h-4 mr-1" />
              A/B Test
            </TabsTrigger>
          </TabsList>

          <TabsContent value="generate" className="space-y-4">

            {/* ── URL Import ─────────────────────────────────────────────── */}
            <div className="border rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setShowUrlImport((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium bg-muted/40 hover:bg-muted/70 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Link className="w-4 h-4 text-primary" />
                  Import from URL
                  <span className="text-xs text-muted-foreground font-normal">
                    — any link: music, news, article, product, social post…
                  </span>
                </span>
                {showUrlImport ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showUrlImport && (
                <div className="px-4 py-3 space-y-3 border-t bg-background">
                  <div className="flex gap-2">
                    <Input
                      placeholder="https://open.spotify.com/track/… or any URL"
                      value={importUrl}
                      onChange={(e) => setImportUrl(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleUrlImport()}
                      className="flex-1"
                    />
                    <Button
                      onClick={handleUrlImport}
                      disabled={urlImporting || !importUrl.trim()}
                      size="sm"
                    >
                      {urlImporting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Link className="w-4 h-4" />
                      )}
                      <span className="ml-2">{urlImporting ? 'Importing…' : 'Import'}</span>
                    </Button>
                  </div>

                  {urlAnalysis && (
                    <div className="rounded-md border bg-muted/30 p-3 space-y-2.5">

                      {/* ── Header row: image + title + basic metadata ── */}
                      <div className="flex items-start gap-3">
                        {(urlAnalysis.thumbnail_url || urlAnalysis.og_image) && (
                          <img
                            src={urlAnalysis.thumbnail_url || urlAnalysis.og_image}
                            alt=""
                            className="w-16 h-16 object-cover rounded-md flex-shrink-0"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{urlAnalysis.title || urlAnalysis.domain}</p>

                          {/* Artist / Track / Album */}
                          {urlAnalysis.artist && (
                            <p className="text-xs text-primary font-medium mt-0.5 flex items-center gap-1">
                              <Mic className="w-3 h-3" />
                              {urlAnalysis.artist}
                              {urlAnalysis.track && ` — ${urlAnalysis.track}`}
                              {urlAnalysis.album && !urlAnalysis.track && ` · ${urlAnalysis.album}`}
                            </p>
                          )}
                          {urlAnalysis.track && !urlAnalysis.artist && (
                            <p className="text-xs text-primary font-medium mt-0.5">{urlAnalysis.track}</p>
                          )}
                          {urlAnalysis.album && urlAnalysis.artist && urlAnalysis.track && (
                            <p className="text-xs text-muted-foreground mt-0.5">Album: {urlAnalysis.album}</p>
                          )}

                          {/* Author / Published */}
                          {urlAnalysis.author && !urlAnalysis.artist && (
                            <p className="text-xs text-muted-foreground mt-0.5">by {urlAnalysis.author}</p>
                          )}
                          {urlAnalysis.summary && urlAnalysis.summary !== urlAnalysis.title && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{urlAnalysis.summary}</p>
                          )}
                        </div>
                      </div>

                      {/* ── Classification badges ── */}
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="secondary" className="text-xs flex items-center gap-1">
                          {CATEGORY_ICON[urlAnalysis.platform_category] || <Globe className="w-3 h-3" />}
                          {urlAnalysis.platform !== 'web' ? urlAnalysis.platform.replace(/_/g, ' ') : urlAnalysis.domain}
                        </Badge>
                        {urlAnalysis.content_type && urlAnalysis.content_type !== 'website' && (
                          <Badge variant="outline" className="text-xs">{urlAnalysis.content_type.replace(/_/g, ' ')}</Badge>
                        )}
                        {urlAnalysis.genre && urlAnalysis.genre !== 'default' && (
                          <Badge variant="outline" className="text-xs">{urlAnalysis.genre}</Badge>
                        )}
                        {urlAnalysis.tone && urlAnalysis.tone !== 'default' && (
                          <Badge variant="outline" className="text-xs">{urlAnalysis.tone}</Badge>
                        )}
                        {urlAnalysis.language && urlAnalysis.language !== 'en' && (
                          <Badge variant="outline" className="text-xs uppercase">{urlAnalysis.language}</Badge>
                        )}
                      </div>

                      {/* ── Music metadata row ── */}
                      {(urlAnalysis.duration || urlAnalysis.release_date || urlAnalysis.label || urlAnalysis.isrc) && (
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {urlAnalysis.duration && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Timer className="w-3 h-3" />{urlAnalysis.duration}
                            </span>
                          )}
                          {urlAnalysis.release_date && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Calendar className="w-3 h-3" />{urlAnalysis.release_date.slice(0, 10)}
                            </span>
                          )}
                          {urlAnalysis.label && (
                            <span className="text-xs text-muted-foreground">{urlAnalysis.label}</span>
                          )}
                          {urlAnalysis.isrc && (
                            <span className="text-xs text-muted-foreground font-mono">ISRC: {urlAnalysis.isrc}</span>
                          )}
                        </div>
                      )}

                      {/* ── Engagement stats ── */}
                      {(urlAnalysis.view_count != null || urlAnalysis.like_count != null ||
                        urlAnalysis.play_count != null || urlAnalysis.subscriber_count != null) && (
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {urlAnalysis.view_count != null && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Eye className="w-3 h-3" />{urlAnalysis.view_count.toLocaleString()} views
                            </span>
                          )}
                          {urlAnalysis.like_count != null && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Heart className="w-3 h-3" />{urlAnalysis.like_count.toLocaleString()} likes
                            </span>
                          )}
                          {urlAnalysis.play_count != null && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Play className="w-3 h-3" />{urlAnalysis.play_count.toLocaleString()} plays
                            </span>
                          )}
                          {urlAnalysis.subscriber_count != null && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Users className="w-3 h-3" />{
                                typeof urlAnalysis.subscriber_count === 'number'
                                  ? urlAnalysis.subscriber_count.toLocaleString()
                                  : urlAnalysis.subscriber_count
                              } subscribers
                            </span>
                          )}
                        </div>
                      )}

                      {/* ── Article metadata ── */}
                      {(urlAnalysis.reading_time_minutes || urlAnalysis.published || urlAnalysis.section) && (
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {urlAnalysis.reading_time_minutes && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" />{urlAnalysis.reading_time_minutes} min read
                            </span>
                          )}
                          {urlAnalysis.published && !urlAnalysis.release_date && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Calendar className="w-3 h-3" />{urlAnalysis.published.slice(0, 10)}
                            </span>
                          )}
                          {urlAnalysis.section && (
                            <span className="text-xs text-muted-foreground">{urlAnalysis.section}</span>
                          )}
                        </div>
                      )}

                      {/* ── Event details ── */}
                      {(urlAnalysis.event_date || urlAnalysis.event_location || (urlAnalysis.performers && urlAnalysis.performers.length > 0)) && (
                        <div className="space-y-1">
                          {urlAnalysis.event_date && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Calendar className="w-3 h-3" />{urlAnalysis.event_date.slice(0, 16).replace('T', ' ')}
                            </p>
                          )}
                          {urlAnalysis.event_location && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <MapPin className="w-3 h-3" />{urlAnalysis.event_location}
                            </p>
                          )}
                          {urlAnalysis.performers && urlAnalysis.performers.length > 0 && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Mic className="w-3 h-3" />{urlAnalysis.performers.slice(0, 4).join(', ')}
                              {urlAnalysis.performers.length > 4 && ` +${urlAnalysis.performers.length - 4}`}
                            </p>
                          )}
                        </div>
                      )}

                      {/* ── Product info ── */}
                      {(urlAnalysis.price || urlAnalysis.brand || urlAnalysis.rating) && (
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {urlAnalysis.price && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <DollarSign className="w-3 h-3" />
                              {urlAnalysis.currency && urlAnalysis.currency !== 'USD' ? `${urlAnalysis.currency} ` : ''}
                              {urlAnalysis.price}
                            </span>
                          )}
                          {urlAnalysis.brand && (
                            <span className="text-xs text-muted-foreground">{urlAnalysis.brand}</span>
                          )}
                          {urlAnalysis.rating && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Star className="w-3 h-3" />{urlAnalysis.rating}
                              {urlAnalysis.review_count && ` (${urlAnalysis.review_count.toLocaleString()})`}
                            </span>
                          )}
                        </div>
                      )}

                      {/* ── Tracklist / album tracks ── */}
                      {urlAnalysis.tracklist && urlAnalysis.tracklist.length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">
                            Tracklist ({urlAnalysis.track_count || urlAnalysis.tracklist.length} tracks):
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {urlAnalysis.tracklist.slice(0, 6).map((t: string, i: number) => (
                              <span key={i} className="text-xs bg-muted rounded px-1.5 py-0.5">{t}</span>
                            ))}
                            {urlAnalysis.tracklist.length > 6 && (
                              <span className="text-xs text-muted-foreground">+{urlAnalysis.tracklist.length - 6} more</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* ── Tags (author-assigned) ── */}
                      {urlAnalysis.tags && urlAnalysis.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          <Tag className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                          {urlAnalysis.tags.slice(0, 8).map((tag: string) => (
                            <span
                              key={tag}
                              className="text-xs bg-primary/10 text-primary rounded px-1.5 py-0.5 cursor-pointer hover:bg-primary/20"
                              onClick={() => setContentPrompt((p) => p ? `${p}, ${tag}` : tag)}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* ── Keywords (extracted) ── */}
                      {urlAnalysis.keywords && urlAnalysis.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {urlAnalysis.keywords.slice(0, 8).map((kw: string) => (
                            <span
                              key={kw}
                              className="text-xs bg-muted text-muted-foreground rounded px-1.5 py-0.5 cursor-pointer hover:bg-muted/80"
                              onClick={() => setContentPrompt((p) => p ? `${p}, ${kw}` : kw)}
                            >
                              {kw}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* ── Data sources + success message ── */}
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-green-500" />
                          Topic auto-filled below — edit if needed, then generate
                        </p>
                        {urlAnalysis.data_sources && urlAnalysis.data_sources.length > 0 && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1" title={urlAnalysis.data_sources.join(', ')}>
                            <Database className="w-3 h-3" />
                            {urlAnalysis.data_sources.length} source{urlAnalysis.data_sources.length !== 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* ────────────────────────────────────────────────────────────── */}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  Platform
                </Label>
                <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Tone
                </Label>
                <Select value={selectedTone} onValueChange={setSelectedTone}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TONES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>What's your content about?</Label>
              <Textarea
                placeholder="e.g. new single release, behind the scenes studio session, tour announcement..."
                value={contentPrompt}
                onChange={(e) => setContentPrompt(e.target.value)}
                className="min-h-[100px]"
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleGenerateContent}
                disabled={aiGenerateMutation.isPending}
                className="flex-1"
              >
                {aiGenerateMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4 mr-2" />
                    Generate Content
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => analyzeBrandVoiceMutation.mutate()}
                disabled={analyzeBrandVoiceMutation.isPending}
              >
                {analyzeBrandVoiceMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Brain className="w-4 h-4" />
                )}
                <span className="ml-2">Analyze My Voice</span>
              </Button>
            </div>

            {aiResult && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label>Generated Content</Label>
                    <Badge variant={aiResult.source === 'ai' ? 'default' : 'secondary'} className="text-xs">
                      {aiResult.source === 'ai' ? (
                        <><Bot className="w-3 h-3 mr-1" /> AI Model</>
                      ) : (
                        <><FileText className="w-3 h-3 mr-1" /> Smart Template</>
                      )}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      <Clock className="w-3 h-3 mr-1" />
                      {(aiResult.processingTimeMs / 1000).toFixed(1)}s
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(generatedContent)}
                  >
                    <Copy className="w-4 h-4 mr-1" />
                    Copy All
                  </Button>
                </div>

                {aiResult.hook && (
                  <Card className="border-l-4 border-l-primary bg-muted/30">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold uppercase text-primary">Hook</span>
                        <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => copyToClipboard(aiResult.hook)}>
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                      <p className="text-sm">{aiResult.hook}</p>
                    </CardContent>
                  </Card>
                )}

                {aiResult.body && (
                  <Card className="border-l-4 border-l-blue-500 bg-muted/30">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold uppercase text-blue-500">Body</span>
                        <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => copyToClipboard(aiResult.body)}>
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                      <p className="text-sm">{aiResult.body}</p>
                    </CardContent>
                  </Card>
                )}

                {aiResult.cta && (
                  <Card className="border-l-4 border-l-green-500 bg-muted/30">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold uppercase text-green-500">Call to Action</span>
                        <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => copyToClipboard(aiResult.cta)}>
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                      <p className="text-sm">{aiResult.cta}</p>
                    </CardContent>
                  </Card>
                )}

                {aiResult.hashtags && aiResult.hashtags.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-1">
                        <Hash className="w-4 h-4" />
                        Hashtags
                      </Label>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2"
                        onClick={() => copyToClipboard(aiResult.hashtags.join(' '))}
                      >
                        <Copy className="w-3 h-3 mr-1" />
                        Copy All
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {aiResult.hashtags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className="cursor-pointer hover:bg-secondary"
                          onClick={() => copyToClipboard(tag)}
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <Card className="bg-muted/20">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase text-muted-foreground">Full Caption Preview</span>
                      <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => copyToClipboard(generatedContent)}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                    <p className="text-sm whitespace-pre-wrap text-muted-foreground">{generatedContent}</p>
                  </CardContent>
                </Card>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleOptimizeHashtags}
                    disabled={optimizeHashtagsMutation.isPending}
                    className="flex-1"
                  >
                    {optimizeHashtagsMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Hash className="w-4 h-4 mr-2" />
                    )}
                    Optimize Hashtags
                  </Button>
                </div>

                {optimizeHashtagsMutation.data && (
                  <div className="space-y-2">
                    {optimizeHashtagsMutation.data.categories?.map((category: HashtagCategory) => (
                      <div key={category.category} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              category.reach === 'high'
                                ? 'default'
                                : category.reach === 'medium'
                                  ? 'secondary'
                                  : 'outline'
                            }
                          >
                            {category.reach} reach
                          </Badge>
                          <span className="text-sm font-medium">{category.category}</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {category.hashtags.map((tag) => (
                            <Badge
                              key={tag}
                              variant="outline"
                              className="cursor-pointer hover:bg-secondary"
                              onClick={() => copyToClipboard(tag)}
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="trends" className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium">Trending Topics</h3>
              <Badge variant="secondary">{trendingTopics?.length || 0} trends</Badge>
            </div>

            {loadingTrends ? (
              <div className="text-center py-8">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Loading trends...</p>
              </div>
            ) : (
              <div className="space-y-2">
                {trendingTopics?.map((topic) => (
                  <Card key={topic.id} className="hover:bg-accent transition-colors cursor-pointer">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium">{topic.topic}</h4>
                          <Badge variant="outline" className="mt-1 text-xs">
                            {topic.category}
                          </Badge>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-primary">{topic.popularity}</div>
                          <p className="text-xs text-muted-foreground">Popularity</p>
                        </div>
                      </div>
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Relevance</span>
                          <span className="font-medium">{topic.relevance}%</span>
                        </div>
                        <Progress value={topic.relevance} className="h-1" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="calendar" className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Optimal Posting Times
              </h3>
              <Badge variant="secondary">Based on your audience</Badge>
            </div>

            {loadingTimes ? (
              <div className="text-center py-8">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Loading schedule...</p>
              </div>
            ) : (
              <div className="space-y-2">
                {postingTimes?.map((time, index) => (
                  <Card
                    key={index}
                    className={`${
                      time.engagement_score >= 90 ? 'border-primary bg-primary/5' : ''
                    }`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                            <Clock className="w-6 h-6 text-primary" />
                          </div>
                          <div>
                            <h4 className="font-medium">{time.day}</h4>
                            <p className="text-sm text-muted-foreground">{time.time}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-2">
                            {time.engagement_score >= 90 && (
                              <Zap className="w-4 h-4 text-primary" />
                            )}
                            <span className="text-lg font-bold">{time.engagement_score}%</span>
                          </div>
                          <p className="text-xs text-muted-foreground">Engagement</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="testing" className="space-y-4">
            <div className="space-y-2">
              <Label>Number of Variants (2-5)</Label>
              <Select
                value={variantCount.toString()}
                onValueChange={(v) => setVariantCount(parseInt(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2, 3, 4, 5].map((num) => (
                    <SelectItem key={num} value={num.toString()}>
                      {num} variants
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleGenerateVariants}
              disabled={!generatedContent || generateABVariantsMutation.isPending}
              className="w-full"
            >
              {generateABVariantsMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating Variants...
                </>
              ) : (
                <>
                  <TestTube2 className="w-4 h-4 mr-2" />
                  Generate A/B Test Variants
                </>
              )}
            </Button>

            {generateABVariantsMutation.data?.variants && (
              <div className="space-y-3">
                {generateABVariantsMutation.data.variants.map(
                  (variant: ABVariant, index: number) => (
                    <Card key={variant.id}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <Badge>Variant {index + 1}</Badge>
                          <div className="flex items-center gap-2">
                            <Target className="w-4 h-4 text-primary" />
                            <span className="text-sm font-medium">
                              {variant.predictedEngagement}% predicted engagement
                            </span>
                          </div>
                        </div>
                        <p className="text-sm">{variant.content}</p>
                        <div className="flex flex-wrap gap-1">
                          {variant.strengths.map((strength) => (
                            <Badge key={strength} variant="secondary" className="text-xs">
                              {strength}
                            </Badge>
                          ))}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard(variant.content)}
                          className="w-full"
                        >
                          <Copy className="w-4 h-4 mr-1" />
                          Copy Variant
                        </Button>
                      </CardContent>
                    </Card>
                  )
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
