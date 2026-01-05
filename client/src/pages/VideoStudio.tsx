import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppLayout } from '@/components/layout/AppLayout';
import { useRequireSubscription } from '@/hooks/useRequireAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { 
  Play, 
  Pause, 
  Download, 
  Search, 
  Filter, 
  Grid3X3, 
  List,
  Video,
  Sparkles,
  Zap,
  Clock,
  FileVideo,
  X,
  Loader2,
  ArrowLeft,
  LayoutGrid,
} from 'lucide-react';
import { TemplateCard } from '@/components/video/TemplateCard';
import { VideoPreview } from '@/components/video/VideoPreview';
import { CustomizationPanel } from '@/components/video/CustomizationPanel';
import { 
  templateManager, 
  type TemplateMetadata, 
  type ColorPalette,
  type AspectRatio,
  DEFAULT_PALETTES,
} from '@/lib/video/templates';
import { 
  VideoExporter, 
  type ExportOptions, 
  type ExportProgress,
  type VideoFormat,
  type VideoResolution,
  type FrameRate,
  RESOLUTION_PRESETS,
} from '@/lib/video/VideoExporter';
import {
  RenderOrchestrator,
  type OrchestratorState,
} from '@/lib/video/RenderOrchestrator';
import {
  compileTemplate,
  type CompilationResult,
  type AudioReactiveBinding,
} from '@/lib/video/TemplateCompiler';
import type { VideoProject } from '../../../../shared/video/VideoRendererEngine';

type ViewMode = 'gallery' | 'editor';

interface ExportSettings {
  format: VideoFormat;
  resolution: VideoResolution;
  frameRate: FrameRate;
}

export default function VideoStudio() {
  const { user, isLoading: authLoading } = useRequireSubscription();
  const { toast } = useToast();
  
  const [viewMode, setViewMode] = useState<ViewMode>('gallery');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [layoutView, setLayoutView] = useState<'grid' | 'list'>('grid');
  
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateMetadata | null>(null);
  const [compilationResult, setCompilationResult] = useState<CompilationResult | null>(null);
  
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [palette, setPalette] = useState<ColorPalette>(DEFAULT_PALETTES.modern);
  const [font, setFont] = useState('Inter');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [effects, setEffects] = useState<Record<string, boolean>>({});
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | undefined>();
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    format: 'webm',
    resolution: '1080p',
    frameRate: 30,
  });
  
  const orchestratorRef = useRef<RenderOrchestrator | null>(null);
  const exporterRef = useRef<VideoExporter | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  const templates = templateManager.getAllTemplates();

  const filteredTemplates = templates.filter((template) => {
    const matchesSearch = 
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = categoryFilter === 'all' || template.category === categoryFilter;
    
    return matchesSearch && matchesCategory;
  });

  const categories = ['all', ...new Set(templates.map(t => t.category))];

  useEffect(() => {
    return () => {
      if (orchestratorRef.current) {
        orchestratorRef.current.dispose();
        orchestratorRef.current = null;
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, []);

  const compileAndLoadTemplate = useCallback(async (
    template: TemplateMetadata,
    options: {
      name?: string;
      aspectRatio?: AspectRatio;
      palette?: ColorPalette;
      audioUrl?: string;
    } = {}
  ) => {
    try {
      const templateType = template.type as any;
      
      const compiledResult = compileTemplate({
        type: templateType,
        id: template.id,
        name: options.name || template.name,
        aspectRatio: options.aspectRatio || template.supportedAspectRatios[0] || '16:9',
        duration: template.defaultDuration,
        fps: 30,
        palette: options.palette || DEFAULT_PALETTES.modern,
        background: {
          type: 'gradient',
          gradientColors: [
            (options.palette || DEFAULT_PALETTES.modern).primary,
            (options.palette || DEFAULT_PALETTES.modern).secondary,
          ],
          gradientAngle: 135,
        },
        artistName: options.name || 'Artist Name',
        releaseName: options.name || template.name,
        releaseType: 'single',
        releaseDate: 'Coming Soon',
        tourName: options.name || template.name,
        dates: [],
        title: options.name || template.name,
        mediaClips: [],
        quote: 'Your quote here...',
        quotationStyle: 'minimal',
        targetDate: new Date(Date.now() + 86400000).toISOString(),
        eventName: 'Event',
        timerStyle: 'digital',
        showLabels: true,
        leftContent: { title: 'Left' },
        rightContent: { title: 'Right' },
        dividerStyle: 'solid',
        comparisonType: 'side-by-side',
        hookText: 'Coming Soon...',
        mainContent: 'Stay Tuned',
        contentType: 'announcement',
        teaserLength: 15,
      } as any, {
        targetFps: 30,
        audioAnalysis: true,
      });

      setCompilationResult(compiledResult);

      if (orchestratorRef.current) {
        orchestratorRef.current.dispose();
      }

      const orchestrator = new RenderOrchestrator({
        width: compiledResult.project.width,
        height: compiledResult.project.height,
        fps: compiledResult.project.fps,
        enableAudioAnalysis: true,
        mockAudio: !options.audioUrl,
        events: {
          onStateChange: (state) => {
            if (state === 'playing') {
              setIsPlaying(true);
            } else if (state === 'paused' || state === 'ready') {
              setIsPlaying(false);
            }
          },
          onTimeUpdate: (time) => {
            setCurrentTime(time);
          },
          onError: (error) => {
            console.error('Orchestrator error:', error);
            toast({
              title: 'Rendering Error',
              description: error.message,
              variant: 'destructive',
            });
          },
        },
      });

      await orchestrator.initialize();

      if (options.audioUrl) {
        const project = {
          ...compiledResult.project,
          audioUrl: options.audioUrl,
        };
        await orchestrator.loadProject(project, compiledResult.audioReactiveBindings);
      } else {
        await orchestrator.loadProject(compiledResult.project, compiledResult.audioReactiveBindings);
      }

      orchestratorRef.current = orchestrator;
      
      return compiledResult;
    } catch (err) {
      console.error('Failed to compile template:', err);
      toast({
        title: 'Template Error',
        description: 'Failed to compile template',
        variant: 'destructive',
      });
      return null;
    }
  }, [toast]);

  const handleTemplateSelect = useCallback(async (template: TemplateMetadata) => {
    setSelectedTemplate(template);
    setTitle(template.name);
    setSubtitle('');
    setAspectRatio(template.supportedAspectRatios[0] || '16:9');
    setPalette(DEFAULT_PALETTES.modern);
    
    await compileAndLoadTemplate(template, {
      name: template.name,
      aspectRatio: template.supportedAspectRatios[0] || '16:9',
      palette: DEFAULT_PALETTES.modern,
      audioUrl,
    });
    
    setViewMode('editor');
  }, [compileAndLoadTemplate, audioUrl]);

  const handleBackToGallery = useCallback(() => {
    setViewMode('gallery');
    setSelectedTemplate(null);
    setCompilationResult(null);
    setIsPlaying(false);
    setCurrentTime(0);
    
    if (orchestratorRef.current) {
      orchestratorRef.current.stop();
    }
  }, []);

  const handleAudioUpload = useCallback(async (file: File) => {
    setAudioFile(file);
    
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
    
    if (selectedTemplate && orchestratorRef.current) {
      await compileAndLoadTemplate(selectedTemplate, {
        name: title || selectedTemplate.name,
        aspectRatio,
        palette,
        audioUrl: url,
      });
    }
    
    toast({
      title: 'Audio Uploaded',
      description: `${file.name} is ready to use`,
    });
  }, [selectedTemplate, title, aspectRatio, palette, audioUrl, compileAndLoadTemplate, toast]);

  const handleAudioRemove = useCallback(async () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioFile(null);
    setAudioUrl(undefined);
    
    if (selectedTemplate) {
      await compileAndLoadTemplate(selectedTemplate, {
        name: title || selectedTemplate.name,
        aspectRatio,
        palette,
      });
    }
  }, [audioUrl, selectedTemplate, title, aspectRatio, palette, compileAndLoadTemplate]);

  const handleEffectToggle = (effectId: string, enabled: boolean) => {
    setEffects(prev => ({ ...prev, [effectId]: enabled }));
  };

  const handlePaletteChange = useCallback(async (newPalette: ColorPalette) => {
    setPalette(newPalette);
    
    if (selectedTemplate) {
      await compileAndLoadTemplate(selectedTemplate, {
        name: title || selectedTemplate.name,
        aspectRatio,
        palette: newPalette,
        audioUrl,
      });
    }
  }, [selectedTemplate, title, aspectRatio, audioUrl, compileAndLoadTemplate]);

  const handleAspectRatioChange = useCallback(async (newRatio: AspectRatio) => {
    setAspectRatio(newRatio);
    
    if (selectedTemplate) {
      await compileAndLoadTemplate(selectedTemplate, {
        name: title || selectedTemplate.name,
        aspectRatio: newRatio,
        palette,
        audioUrl,
      });
    }
  }, [selectedTemplate, title, palette, audioUrl, compileAndLoadTemplate]);

  const handlePlayPause = useCallback(() => {
    if (!orchestratorRef.current) return;
    
    if (isPlaying) {
      orchestratorRef.current.pause();
    } else {
      orchestratorRef.current.play();
    }
  }, [isPlaying]);

  const handleSeek = useCallback((time: number) => {
    if (!orchestratorRef.current) return;
    
    orchestratorRef.current.seek(time);
    setCurrentTime(time);
  }, []);

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handleStateChange = useCallback((state: OrchestratorState) => {
    setIsPlaying(state === 'playing');
  }, []);

  const handleExport = async () => {
    if (!compilationResult || !orchestratorRef.current) {
      toast({
        title: 'Export Failed',
        description: 'Please select a template first',
        variant: 'destructive',
      });
      return;
    }

    setIsExporting(true);
    setExportProgress(null);
    exporterRef.current = new VideoExporter();
    abortControllerRef.current = new AbortController();

    const resolution = RESOLUTION_PRESETS[exportSettings.resolution];
    
    const exportOrchestrator = new RenderOrchestrator({
      width: resolution.width,
      height: resolution.height,
      fps: exportSettings.frameRate,
      enableAudioAnalysis: !!audioUrl,
      mockAudio: !audioUrl,
    });

    try {
      await exportOrchestrator.initialize();
      
      const scaledProject: VideoProject = {
        ...compilationResult.project,
        width: resolution.width,
        height: resolution.height,
        fps: exportSettings.frameRate,
        audioUrl,
      };
      
      await exportOrchestrator.loadProject(scaledProject, compilationResult.audioReactiveBindings);
      
      const frameRenderer = exportOrchestrator.getFrameRenderer();

      const options: ExportOptions = {
        format: exportSettings.format,
        resolution: exportSettings.resolution,
        frameRate: exportSettings.frameRate,
        audioUrl,
        onProgress: (progress) => {
          setExportProgress(progress);
        },
        signal: abortControllerRef.current.signal,
      };

      const result = await exporterRef.current.export(scaledProject, frameRenderer, options);
      
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title || 'video'}_${Date.now()}.${exportSettings.format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: 'Export Complete!',
        description: `Your video has been downloaded (${(result.fileSize / (1024 * 1024)).toFixed(2)} MB)`,
      });
      
      setExportDialogOpen(false);
    } catch (error) {
      if ((error as Error).message?.includes('cancelled') || (error as Error).message?.includes('ABORTED')) {
        toast({
          title: 'Export Cancelled',
          description: 'The export was cancelled',
        });
      } else {
        toast({
          title: 'Export Failed',
          description: (error as Error).message || 'An error occurred during export',
          variant: 'destructive',
        });
      }
    } finally {
      exportOrchestrator.dispose();
      setIsExporting(false);
      setExportProgress(null);
      exporterRef.current = null;
      abortControllerRef.current = null;
    }
  };

  const handleCancelExport = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (exporterRef.current) {
      exporterRef.current.abort();
    }
  };

  const getPhaseLabel = (phase: string) => {
    const labels: Record<string, string> = {
      preparing: 'Preparing...',
      rendering: 'Rendering frames...',
      encoding: 'Encoding video...',
      muxing: 'Adding audio...',
      finalizing: 'Finalizing...',
    };
    return labels[phase] || phase;
  };

  const project = compilationResult?.project;
  const projectDuration = project?.duration || 10;

  if (authLoading) {
    return (
      <AppLayout title="Video Studio" subtitle="Create stunning promotional videos">
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout 
      title="Video Studio" 
      subtitle="Create stunning promotional videos"
      noPadding={viewMode === 'editor'}
    >
      <AnimatePresence mode="wait">
        {viewMode === 'gallery' ? (
          <motion.div
            key="gallery"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="space-y-6 p-6"
          >
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <div className="flex-1 w-full sm:max-w-md">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search templates..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-40">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat === 'all' ? 'All Categories' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex rounded-lg border p-1">
                  <Button
                    variant={layoutView === 'grid' ? 'secondary' : 'ghost'}
                    size="icon"
                    onClick={() => setLayoutView('grid')}
                    className="h-8 w-8"
                  >
                    <Grid3X3 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={layoutView === 'list' ? 'secondary' : 'ghost'}
                    size="icon"
                    onClick={() => setLayoutView('list')}
                    className="h-8 w-8"
                  >
                    <List className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            <Tabs defaultValue="all" className="space-y-6">
              <TabsList className="bg-muted/50">
                <TabsTrigger value="all" className="gap-2">
                  <LayoutGrid className="w-4 h-4" />
                  All Templates
                </TabsTrigger>
                <TabsTrigger value="popular" className="gap-2">
                  <Zap className="w-4 h-4" />
                  Popular
                </TabsTrigger>
                <TabsTrigger value="new" className="gap-2">
                  <Sparkles className="w-4 h-4" />
                  New
                </TabsTrigger>
              </TabsList>

              <TabsContent value="all">
                <div className={`grid gap-6 ${
                  layoutView === 'grid' 
                    ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' 
                    : 'grid-cols-1'
                }`}>
                  {filteredTemplates.map((template) => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      isSelected={selectedTemplate?.id === template.id}
                      onSelect={handleTemplateSelect}
                    />
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="popular">
                <div className={`grid gap-6 ${
                  layoutView === 'grid' 
                    ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' 
                    : 'grid-cols-1'
                }`}>
                  {templateManager.getPopularTemplates(8).map((template) => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      isSelected={selectedTemplate?.id === template.id}
                      onSelect={handleTemplateSelect}
                    />
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="new">
                <div className={`grid gap-6 ${
                  layoutView === 'grid' 
                    ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' 
                    : 'grid-cols-1'
                }`}>
                  {templateManager.getNewTemplates().length > 0 ? (
                    templateManager.getNewTemplates().map((template) => (
                      <TemplateCard
                        key={template.id}
                        template={template}
                        isSelected={selectedTemplate?.id === template.id}
                        onSelect={handleTemplateSelect}
                      />
                    ))
                  ) : (
                    <div className="col-span-full text-center py-12 text-muted-foreground">
                      <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>New templates coming soon!</p>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            {filteredTemplates.length === 0 && (
              <div className="text-center py-12">
                <Video className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-medium mb-2">No templates found</h3>
                <p className="text-muted-foreground">Try adjusting your search or filters</p>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="editor"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            className="h-full flex flex-col"
          >
            <div className="flex items-center justify-between p-4 border-b bg-card shrink-0">
              <div className="flex items-center gap-4">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleBackToGallery}
                  className="gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </Button>
                <div className="h-6 w-px bg-border" />
                <div>
                  <h2 className="font-semibold">{selectedTemplate?.name}</h2>
                  <p className="text-xs text-muted-foreground">{selectedTemplate?.description}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="gap-1">
                  <Clock className="w-3 h-3" />
                  {projectDuration}s
                </Badge>
                <Badge variant="secondary">
                  {aspectRatio}
                </Badge>
                <Button 
                  onClick={() => setExportDialogOpen(true)}
                  className="gap-2"
                >
                  <Download className="w-4 h-4" />
                  Export
                </Button>
              </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 flex flex-col p-4 overflow-hidden">
                <div className="flex-1 min-h-0">
                  <VideoPreview
                    orchestrator={orchestratorRef.current}
                    audioUrl={audioUrl}
                    onTimeUpdate={handleTimeUpdate}
                    onStateChange={handleStateChange}
                  />
                </div>

                <Card className="mt-4 shrink-0">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handlePlayPause}
                      >
                        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </Button>

                      <div className="flex-1 space-y-2">
                        <div className="h-8 relative bg-muted rounded-lg overflow-hidden">
                          <div 
                            className="absolute top-0 bottom-0 bg-primary/20"
                            style={{ 
                              width: `${((currentTime / projectDuration) * 100)}%` 
                            }}
                          />
                          
                          <div 
                            className="absolute top-0 bottom-0 w-0.5 bg-primary"
                            style={{ 
                              left: `${((currentTime / projectDuration) * 100)}%` 
                            }}
                          />

                          {project?.layers
                            .filter(l => l.type === 'text')
                            .map((layer, idx) => {
                              const animation = layer.animation;
                              const startTime = animation?.startTime || 0;
                              const endTime = animation?.duration 
                                ? startTime + animation.duration 
                                : projectDuration;
                              
                              return (
                                <div
                                  key={layer.id}
                                  className="absolute h-2 top-1/2 -translate-y-1/2 bg-accent/60 rounded-full"
                                  style={{
                                    left: `${(startTime / projectDuration) * 100}%`,
                                    width: `${((endTime - startTime) / projectDuration) * 100}%`,
                                  }}
                                  title={`Layer ${idx + 1}`}
                                />
                              );
                            })}
                        </div>

                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{formatTime(currentTime)}</span>
                          <span>{formatTime(projectDuration)}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{project?.fps || 30} fps</span>
                        <span>•</span>
                        <span>{project?.width}×{project?.height}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="w-80 xl:w-96 border-l shrink-0 overflow-hidden">
                <CustomizationPanel
                  title={title}
                  subtitle={subtitle}
                  palette={palette}
                  font={font}
                  aspectRatio={aspectRatio}
                  effects={effects}
                  audioFile={audioFile}
                  onTitleChange={setTitle}
                  onSubtitleChange={setSubtitle}
                  onPaletteChange={handlePaletteChange}
                  onFontChange={setFont}
                  onAspectRatioChange={handleAspectRatioChange}
                  onEffectToggle={handleEffectToggle}
                  onAudioUpload={handleAudioUpload}
                  onAudioRemove={handleAudioRemove}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileVideo className="w-5 h-5" />
              Export Video
            </DialogTitle>
            <DialogDescription>
              Configure your export settings and download your video
            </DialogDescription>
          </DialogHeader>

          {!isExporting ? (
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Format</label>
                <Select 
                  value={exportSettings.format} 
                  onValueChange={(v) => setExportSettings(prev => ({ ...prev, format: v as VideoFormat }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="webm">WebM (Best quality)</SelectItem>
                    <SelectItem value="mp4">MP4 (Most compatible)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Resolution</label>
                <Select 
                  value={exportSettings.resolution}
                  onValueChange={(v) => setExportSettings(prev => ({ ...prev, resolution: v as VideoResolution }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="720p">720p (1280×720)</SelectItem>
                    <SelectItem value="1080p">1080p Full HD (1920×1080)</SelectItem>
                    <SelectItem value="4k">4K Ultra HD (3840×2160)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Frame Rate</label>
                <Select 
                  value={String(exportSettings.frameRate)}
                  onValueChange={(v) => setExportSettings(prev => ({ ...prev, frameRate: Number(v) as FrameRate }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24">24 fps (Cinematic)</SelectItem>
                    <SelectItem value="30">30 fps (Standard)</SelectItem>
                    <SelectItem value="60">60 fps (Smooth)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Duration</span>
                  <span>{projectDuration}s</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Estimated size</span>
                  <span>
                    ~{Math.round(
                      (RESOLUTION_PRESETS[exportSettings.resolution].width * 
                       RESOLUTION_PRESETS[exportSettings.resolution].height * 
                       projectDuration * 
                       exportSettings.frameRate * 0.05) / (1024 * 1024)
                    )} MB
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 space-y-6">
              <div className="text-center">
                <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
                <h4 className="font-medium">{getPhaseLabel(exportProgress?.phase || 'preparing')}</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  {exportProgress?.currentFrame || 0} / {exportProgress?.totalFrames || 0} frames
                </p>
              </div>

              <div className="space-y-2">
                <Progress value={exportProgress?.percentage || 0} />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{exportProgress?.percentage || 0}% complete</span>
                  <span>
                    {exportProgress?.estimatedTimeRemaining 
                      ? `~${Math.ceil(exportProgress.estimatedTimeRemaining)}s remaining`
                      : 'Calculating...'}
                  </span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            {!isExporting ? (
              <>
                <Button variant="outline" onClick={() => setExportDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleExport} className="gap-2">
                  <Download className="w-4 h-4" />
                  Export Video
                </Button>
              </>
            ) : (
              <Button variant="destructive" onClick={handleCancelExport} className="gap-2">
                <X className="w-4 h-4" />
                Cancel Export
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
