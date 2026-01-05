import { useState, useCallback, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Play,
  Pause,
  Download,
  Loader2,
  Video,
  Quote,
  Music,
  Megaphone,
  AlertTriangle,
  Check,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  RenderOrchestrator,
  type OrchestratorState,
} from '@/lib/video/RenderOrchestrator';
import {
  compileTemplate,
  type CompilationResult,
} from '@/lib/video/TemplateCompiler';
import {
  getBrowserCapabilities,
  type BrowserCapabilities,
} from '@/lib/video/BrowserCapabilities';
import {
  VideoExporter,
  type ExportProgress,
} from '@/lib/video/VideoExporter';
import {
  type AspectRatio,
  type ColorPalette,
  type PromoTemplateOptions,
  type SocialTeaserOptions,
  type ReleaseAnnouncementOptions,
  type QuoteLyricOptions,
  DEFAULT_PALETTES,
  ASPECT_RATIOS,
} from '@/lib/video/templates/PromoTemplates';

export type Platform = 
  | 'twitter' 
  | 'instagram' 
  | 'instagram_reels' 
  | 'instagram_feed'
  | 'tiktok' 
  | 'youtube' 
  | 'youtube_shorts'
  | 'facebook' 
  | 'linkedin';

export type VideoTemplate = 'teaser' | 'release' | 'quote' | 'lyric';

export interface VideoContentGeneratorProps {
  platform: Platform;
  contentText: string;
  audioUrl?: string;
  onVideoGenerated: (url: string, blob: Blob) => void;
  artistName?: string;
  releaseName?: string;
  className?: string;
}

interface TemplateOption {
  id: VideoTemplate;
  name: string;
  description: string;
  icon: React.ReactNode;
}

const TEMPLATES: TemplateOption[] = [
  {
    id: 'teaser',
    name: 'Social Teaser',
    description: 'Quick hook for announcements',
    icon: <Megaphone className="h-5 w-5" />,
  },
  {
    id: 'release',
    name: 'Release Promo',
    description: 'New music announcement',
    icon: <Music className="h-5 w-5" />,
  },
  {
    id: 'quote',
    name: 'Quote Card',
    description: 'Lyric or quote highlight',
    icon: <Quote className="h-5 w-5" />,
  },
  {
    id: 'lyric',
    name: 'Lyric Video',
    description: 'Animated lyrics display',
    icon: <Video className="h-5 w-5" />,
  },
];

const PALETTE_OPTIONS = Object.entries(DEFAULT_PALETTES).map(([key, value]) => ({
  id: key,
  name: key.charAt(0).toUpperCase() + key.slice(1),
  palette: value,
}));

function getPlatformAspectRatio(platform: Platform): AspectRatio {
  switch (platform) {
    case 'tiktok':
    case 'instagram_reels':
    case 'youtube_shorts':
      return '9:16';
    case 'twitter':
    case 'facebook':
    case 'linkedin':
    case 'youtube':
      return '16:9';
    case 'instagram':
    case 'instagram_feed':
      return '1:1';
    default:
      return '16:9';
  }
}

function getPlatformLabel(platform: Platform): string {
  const labels: Record<Platform, string> = {
    twitter: 'Twitter/X',
    instagram: 'Instagram',
    instagram_reels: 'Instagram Reels',
    instagram_feed: 'Instagram Feed',
    tiktok: 'TikTok',
    youtube: 'YouTube',
    youtube_shorts: 'YouTube Shorts',
    facebook: 'Facebook',
    linkedin: 'LinkedIn',
  };
  return labels[platform] || platform;
}

type GeneratorPhase = 
  | 'idle' 
  | 'checking' 
  | 'compiling' 
  | 'ready' 
  | 'previewing' 
  | 'exporting' 
  | 'complete' 
  | 'error';

export function VideoContentGenerator({
  platform,
  contentText,
  audioUrl,
  onVideoGenerated,
  artistName = 'Artist',
  releaseName = 'Release',
  className = '',
}: VideoContentGeneratorProps) {
  const { toast } = useToast();
  
  const [selectedTemplate, setSelectedTemplate] = useState<VideoTemplate>('teaser');
  const [selectedPalette, setSelectedPalette] = useState<string>('modern');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(() => getPlatformAspectRatio(platform));
  
  const [phase, setPhase] = useState<GeneratorPhase>('idle');
  const [capabilities, setCapabilities] = useState<BrowserCapabilities | null>(null);
  const [compilationResult, setCompilationResult] = useState<CompilationResult | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orchestratorRef = useRef<RenderOrchestrator | null>(null);
  const exporterRef = useRef<VideoExporter | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setAspectRatio(getPlatformAspectRatio(platform));
  }, [platform]);

  useEffect(() => {
    return () => {
      if (orchestratorRef.current) {
        orchestratorRef.current.destroy();
        orchestratorRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current = null;
      }
    };
  }, []);

  const checkCapabilities = useCallback(async () => {
    setPhase('checking');
    setErrorMessage(null);
    
    try {
      const caps = await getBrowserCapabilities();
      setCapabilities(caps);
      
      if (!caps.overall.supportsExport) {
        setErrorMessage('Your browser does not support video export. Please use a modern browser like Chrome or Firefox.');
        setPhase('error');
        return false;
      }
      
      return true;
    } catch (error) {
      setErrorMessage('Failed to detect browser capabilities.');
      setPhase('error');
      return false;
    }
  }, []);

  const compileVideoTemplate = useCallback(async () => {
    setPhase('compiling');
    
    const palette = DEFAULT_PALETTES[selectedPalette] || DEFAULT_PALETTES.modern;
    const { width, height } = ASPECT_RATIOS[aspectRatio];
    
    let templateOptions: PromoTemplateOptions;
    
    const baseOptions = {
      id: `video_${Date.now()}`,
      name: 'Generated Video',
      aspectRatio,
      duration: 10,
      fps: 30,
      palette,
      background: {
        type: 'gradient' as const,
        gradientColors: [palette.primary, palette.secondary],
        gradientAngle: 135,
      },
    };
    
    switch (selectedTemplate) {
      case 'teaser':
        templateOptions = {
          ...baseOptions,
          type: 'teaser',
          hookText: contentText.substring(0, 50) + (contentText.length > 50 ? '...' : ''),
          mainContent: contentText,
          artistName,
          contentType: 'announcement',
          teaserLength: 15,
        } as SocialTeaserOptions;
        break;
        
      case 'release':
        templateOptions = {
          ...baseOptions,
          type: 'release',
          artistName,
          releaseName: releaseName || contentText.substring(0, 30),
          releaseType: 'single',
          releaseDate: 'Coming Soon',
        } as ReleaseAnnouncementOptions;
        break;
        
      case 'quote':
      case 'lyric':
        templateOptions = {
          ...baseOptions,
          type: 'quote',
          quote: contentText,
          artistName,
          quotationStyle: selectedTemplate === 'lyric' ? 'typewriter' : 'minimal',
        } as QuoteLyricOptions;
        break;
        
      default:
        templateOptions = {
          ...baseOptions,
          type: 'teaser',
          hookText: contentText.substring(0, 50),
          mainContent: contentText,
          artistName,
          contentType: 'announcement',
          teaserLength: 15,
        } as SocialTeaserOptions;
    }
    
    try {
      const result = compileTemplate(templateOptions, {
        targetFps: 30,
        optimizeForExport: true,
      });
      
      if (audioUrl) {
        result.project.audioUrl = audioUrl;
      }
      
      setCompilationResult(result);
      return result;
    } catch (error) {
      console.error('Template compilation failed:', error);
      setErrorMessage('Failed to compile video template.');
      setPhase('error');
      return null;
    }
  }, [selectedTemplate, selectedPalette, aspectRatio, contentText, artistName, releaseName, audioUrl]);

  const initializePreview = useCallback(async (result: CompilationResult) => {
    if (!canvasRef.current) return;
    
    const { width, height } = ASPECT_RATIOS[aspectRatio];
    const canvas = canvasRef.current;
    canvas.width = width;
    canvas.height = height;
    
    if (orchestratorRef.current) {
      orchestratorRef.current.destroy();
    }
    
    if (audioUrl) {
      audioElementRef.current = new Audio(audioUrl);
      audioElementRef.current.crossOrigin = 'anonymous';
    }
    
    const orchestrator = new RenderOrchestrator({
      width,
      height,
      fps: 30,
      enableAudioAnalysis: !!audioUrl,
      mockAudio: !audioUrl,
      audioElement: audioElementRef.current || undefined,
      events: {
        onTimeUpdate: (time) => setCurrentTime(time),
        onStateChange: (state) => {
          if (state === 'playing') setIsPlaying(true);
          else if (state === 'paused' || state === 'ready') setIsPlaying(false);
        },
        onError: (error) => {
          console.error('Orchestrator error:', error);
          toast({
            title: 'Preview Error',
            description: error.message,
            variant: 'destructive',
          });
        },
      },
    });
    
    orchestratorRef.current = orchestrator;
    
    try {
      await orchestrator.initialize();
      await orchestrator.loadProject(result.project, result.audioReactiveBindings);
      
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          orchestrator.attachCanvas(canvasRef.current);
        }
      }
      
      orchestrator.renderFrame(0);
      setPhase('ready');
    } catch (error) {
      console.error('Failed to initialize preview:', error);
      setErrorMessage('Failed to initialize video preview.');
      setPhase('error');
    }
  }, [aspectRatio, audioUrl, toast]);

  const handleGeneratePreview = useCallback(async () => {
    const capsOk = await checkCapabilities();
    if (!capsOk) return;
    
    const result = await compileVideoTemplate();
    if (!result) return;
    
    await initializePreview(result);
  }, [checkCapabilities, compileVideoTemplate, initializePreview]);

  const togglePlayback = useCallback(() => {
    if (!orchestratorRef.current) return;
    
    if (isPlaying) {
      orchestratorRef.current.pause();
      if (audioElementRef.current) {
        audioElementRef.current.pause();
      }
    } else {
      orchestratorRef.current.play();
      if (audioElementRef.current) {
        audioElementRef.current.play();
      }
    }
  }, [isPlaying]);

  const handleExport = useCallback(async () => {
    if (!compilationResult || !orchestratorRef.current) {
      toast({
        title: 'Not Ready',
        description: 'Please generate a preview first.',
        variant: 'destructive',
      });
      return;
    }
    
    setPhase('exporting');
    setExportProgress(null);
    
    abortControllerRef.current = new AbortController();
    
    const exporter = new VideoExporter();
    exporterRef.current = exporter;
    
    const orchestrator = orchestratorRef.current;
    
    try {
      const result = await exporter.export(
        compilationResult.project,
        async (canvas, frameNumber, timestamp) => {
          orchestrator.renderFrame(timestamp);
          const ctx = canvas.getContext('2d');
          if (ctx && canvasRef.current) {
            ctx.drawImage(canvasRef.current, 0, 0, canvas.width, canvas.height);
          }
        },
        {
          format: 'webm',
          resolution: '1080p',
          frameRate: 30,
          audioUrl,
          onProgress: (progress) => {
            setExportProgress(progress);
          },
          signal: abortControllerRef.current.signal,
        }
      );
      
      const videoUrl = URL.createObjectURL(result.blob);
      setPhase('complete');
      
      toast({
        title: 'Video Exported',
        description: `Video exported successfully (${(result.fileSize / 1024 / 1024).toFixed(2)} MB)`,
      });
      
      onVideoGenerated(videoUrl, result.blob);
    } catch (error: any) {
      if (error.code === 'ABORTED') {
        setPhase('ready');
        return;
      }
      
      console.error('Export failed:', error);
      setErrorMessage(error.message || 'Video export failed.');
      setPhase('error');
      
      toast({
        title: 'Export Failed',
        description: error.message || 'Failed to export video.',
        variant: 'destructive',
      });
    }
  }, [compilationResult, audioUrl, onVideoGenerated, toast]);

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (exporterRef.current) {
      exporterRef.current.abort();
    }
    setPhase('ready');
  }, []);

  const handleReset = useCallback(() => {
    if (orchestratorRef.current) {
      orchestratorRef.current.destroy();
      orchestratorRef.current = null;
    }
    setPhase('idle');
    setCompilationResult(null);
    setExportProgress(null);
    setErrorMessage(null);
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  const progressPercentage = exportProgress?.percentage || 0;
  const duration = compilationResult?.project.duration || 10;
  const previewProgress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <Card className={`w-full ${className}`}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Video className="h-5 w-5" />
              Video Generator
            </CardTitle>
            <CardDescription>
              Create video content for {getPlatformLabel(platform)}
            </CardDescription>
          </div>
          {phase !== 'idle' && phase !== 'checking' && (
            <Button variant="ghost" size="sm" onClick={handleReset}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Reset
            </Button>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {phase === 'error' && errorMessage && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">Error</p>
              <p className="text-sm text-muted-foreground">{errorMessage}</p>
            </div>
          </div>
        )}

        {phase === 'idle' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  onClick={() => setSelectedTemplate(template.id)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    selectedTemplate === template.id
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border hover:border-primary/50 hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={selectedTemplate === template.id ? 'text-primary' : 'text-muted-foreground'}>
                      {template.icon}
                    </span>
                    <span className="font-medium text-sm">{template.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{template.description}</p>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Color Palette
                </label>
                <Select value={selectedPalette} onValueChange={setSelectedPalette}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PALETTE_OPTIONS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-4 h-4 rounded-full border"
                            style={{
                              background: `linear-gradient(135deg, ${option.palette.primary}, ${option.palette.secondary})`,
                            }}
                          />
                          {option.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Aspect Ratio
                </label>
                <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as AspectRatio)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                    <SelectItem value="9:16">9:16 (Portrait)</SelectItem>
                    <SelectItem value="1:1">1:1 (Square)</SelectItem>
                    <SelectItem value="4:5">4:5 (Portrait)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button onClick={handleGeneratePreview} className="w-full">
              <Video className="h-4 w-4 mr-2" />
              Generate Preview
            </Button>
          </>
        )}

        {(phase === 'checking' || phase === 'compiling') && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              {phase === 'checking' ? 'Checking browser capabilities...' : 'Compiling video template...'}
            </p>
          </div>
        )}

        {(phase === 'ready' || phase === 'previewing' || phase === 'exporting' || phase === 'complete') && (
          <>
            <div 
              className="relative bg-black rounded-lg overflow-hidden"
              style={{
                aspectRatio: aspectRatio.replace(':', '/'),
              }}
            >
              <canvas
                ref={canvasRef}
                className="w-full h-full object-contain"
              />
              
              {phase !== 'exporting' && (
                <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-white hover:bg-white/20"
                      onClick={togglePlayback}
                    >
                      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>
                    <div className="flex-1">
                      <Progress value={previewProgress} className="h-1" />
                    </div>
                    <span className="text-xs text-white/80 tabular-nums">
                      {currentTime.toFixed(1)}s / {duration}s
                    </span>
                  </div>
                </div>
              )}
            </div>

            {phase === 'exporting' && exportProgress && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {exportProgress.phase === 'preparing' && 'Preparing...'}
                    {exportProgress.phase === 'rendering' && 'Rendering frames...'}
                    {exportProgress.phase === 'encoding' && 'Encoding video...'}
                    {exportProgress.phase === 'muxing' && 'Adding audio...'}
                    {exportProgress.phase === 'finalizing' && 'Finalizing...'}
                  </span>
                  <span className="font-medium">{progressPercentage}%</span>
                </div>
                <Progress value={progressPercentage} />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Frame {exportProgress.currentFrame} / {exportProgress.totalFrames}
                  </span>
                  <span>
                    {exportProgress.estimatedTimeRemaining > 0 
                      ? `~${Math.ceil(exportProgress.estimatedTimeRemaining)}s remaining`
                      : 'Almost done...'
                    }
                  </span>
                </div>
                <Button variant="outline" size="sm" className="w-full" onClick={handleCancel}>
                  <X className="h-4 w-4 mr-2" />
                  Cancel Export
                </Button>
              </div>
            )}

            {phase === 'ready' && (
              <Button onClick={handleExport} className="w-full">
                <Download className="h-4 w-4 mr-2" />
                Export Video
              </Button>
            )}

            {phase === 'complete' && (
              <div className="flex items-center justify-center gap-2 py-2 text-green-600 dark:text-green-400">
                <Check className="h-5 w-5" />
                <span className="font-medium">Video generated successfully!</span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default VideoContentGenerator;
