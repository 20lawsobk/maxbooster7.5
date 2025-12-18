import { useState, useRef, useEffect } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { logger } from '@/lib/logger';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useAIWorkflow } from '@/hooks/useAIWorkflow';
import { apiRequest } from '@/lib/queryClient';
import {
  Wand2,
  Music,
  Upload,
  Play,
  Pause,
  Download,
  Plus,
  Loader2,
  Sparkles,
  AudioWaveform,
  X,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Zap,
  Drum,
  Piano,
  Guitar,
  Settings2,
} from 'lucide-react';

const INSTRUMENT_TYPES = [
  { id: 'drums', name: 'Drums', icon: '🥁' },
  { id: 'bass', name: 'Bass', icon: '🎸' },
  { id: 'synth', name: 'Synth Lead', icon: '🎹' },
  { id: 'pad', name: 'Pad', icon: '🌊' },
  { id: 'pluck', name: 'Pluck', icon: '✨' },
  { id: 'arp', name: 'Arpeggio', icon: '🎶' },
  { id: 'melody', name: 'Melody', icon: '🎵' },
  { id: 'full_beat', name: 'Full Beat', icon: '🔊' },
];

const GENRES = [
  { id: 'trap', name: 'Trap', tempo: 140 },
  { id: 'house', name: 'House', tempo: 125 },
  { id: 'hiphop', name: 'Hip Hop', tempo: 90 },
  { id: 'dnb', name: 'Drum & Bass', tempo: 174 },
  { id: 'techno', name: 'Techno', tempo: 130 },
  { id: 'lofi', name: 'Lo-Fi', tempo: 80 },
  { id: 'dubstep', name: 'Dubstep', tempo: 140 },
  { id: 'pop', name: 'Pop', tempo: 120 },
  { id: 'rock', name: 'Rock', tempo: 120 },
  { id: 'jazz', name: 'Jazz', tempo: 110 },
  { id: 'rnb', name: 'R&B', tempo: 85 },
  { id: 'ambient', name: 'Ambient', tempo: 70 },
];

const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SCALES = ['major', 'minor', 'dorian', 'phrygian', 'lydian', 'mixolydian'];

const textToMusicSchema = z.object({
  text: z.string().optional().default(''),
});

interface AIGeneratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  onAddToProject?: (audioUrl: string, parameters: unknown) => void;
}

// Helper function to get state badge
function getStateBadge(state: string) {
  switch (state) {
    case 'idle':
      return <Badge variant="secondary">Ready</Badge>;
    case 'requesting':
      return (
        <Badge variant="default" className="animate-pulse">
          Requesting...
        </Badge>
      );
    case 'processing':
      return (
        <Badge variant="default" className="animate-pulse">
          Processing...
        </Badge>
      );
    case 'success':
      return (
        <Badge variant="outline" className="text-green-600 border-green-600">
          Complete
        </Badge>
      );
    case 'integrated':
      return (
        <Badge variant="outline" className="text-blue-600 border-blue-600">
          Integrated
        </Badge>
      );
    case 'error':
      return <Badge variant="destructive">Error</Badge>;
    default:
      return null;
  }
}

/**
 * TODO: Add function documentation
 */
export function AIGeneratorDialog({
  open,
  onOpenChange,
  projectId,
  onAddToProject,
}: AIGeneratorDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'text' | 'audio'>('text');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [instrumentType, setInstrumentType] = useState<string>('drums');
  const [genre, setGenre] = useState<string>('trap');
  const [tempo, setTempo] = useState<number>(140);
  const [musicalKey, setMusicalKey] = useState<string>('C');
  const [scale, setScale] = useState<string>('minor');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [targetType, setTargetType] = useState<string>('drums');

  // Use the AI workflow hook
  const { startWorkflow, cancel, retry, reset, integrate, textToMusic, audioToMusic } =
    useAIWorkflow({
      onStateChange: (type, state) => {
        logger.info(`[AI Generator] ${type} state changed to: ${state}`);
      },
      onError: (type, error) => {
        logger.error(`[AI Generator] ${type} error:`, error);
      },
      onSuccess: (type, data) => {
        logger.info(`[AI Generator] ${type} success:`, data);
        queryClient.invalidateQueries({ queryKey: ['/api/studio/generation', projectId] });
      },
    });

  const form = useForm({
    resolver: zodResolver(textToMusicSchema),
    defaultValues: {
      text: '',
    },
  });

  // Get the active workflow based on the tab
  const activeWorkflow = activeTab === 'text' ? textToMusic : audioToMusic;
  const activeWorkflowType = activeTab === 'text' ? 'text-to-music' : 'audio-to-music';

  // Handle text-to-music submission
  const handleTextSubmit = form.handleSubmit((data) => {
    const apiCall = async (signal?: AbortSignal) => {
      const response = await fetch('/api/studio/generation/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          projectId,
          text: data.text,
          instrumentType,
          genre,
          tempo,
          key: musicalKey,
          scale,
        }),
        signal,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to generate music');
      }

      return response.json();
    };

    startWorkflow('text-to-music', apiCall);
  });

  // Handle audio upload
  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('audio/')) {
        toast({
          title: 'Invalid File',
          description: 'Please upload an audio file',
          variant: 'destructive',
        });
        return;
      }
      setAudioFile(file);
    }
  };

  // Handle audio-to-music generation
  const handleAudioGenerate = () => {
    if (!audioFile) return;

    const apiCall = async (signal?: AbortSignal) => {
      const formData = new FormData();
      formData.append('audio', audioFile);
      formData.append('targetType', targetType);
      if (projectId) {
        formData.append('projectId', projectId);
      }

      const response = await fetch('/api/studio/generation/audio', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        signal,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to generate music');
      }

      return response.json();
    };

    startWorkflow('audio-to-music', apiCall);
  };

  // Handle cancel
  const handleCancel = () => {
    cancel(activeWorkflowType);
  };

  // Handle retry
  const handleRetry = () => {
    if (activeTab === 'text') {
      const text = form.getValues('text');
      if (text) {
        handleTextSubmit();
      }
    } else {
      if (audioFile) {
        handleAudioGenerate();
      }
    }
  };

  // Toggle playback
  const togglePlayback = () => {
    if (!audioRef.current || !activeWorkflow.resultData?.audioFilePath) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  // Handle add to project
  const handleAddToProject = () => {
    if (activeWorkflow.resultData && onAddToProject) {
      onAddToProject(activeWorkflow.resultData.audioFilePath, activeWorkflow.resultData.parameters);
      integrate(activeWorkflowType);
    }
  };

  // Handle download
  const handleDownload = () => {
    if (activeWorkflow.resultData?.audioFilePath) {
      const link = document.createElement('a');
      link.href = activeWorkflow.resultData.audioFilePath;
      link.download = `generated-melody-${Date.now()}.wav`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Reset workflows when dialog closes
  useEffect(() => {
    if (!open) {
      reset('text-to-music');
      reset('audio-to-music');
      setAudioFile(null);
      form.reset();
    }
  }, [open, reset, form]);

  const exampleTexts = [
    'dark trap hi-hats with bounce',
    'punchy 808 bass pattern',
    'dreamy synth pad with reverb',
    'aggressive dubstep wobble bass',
    'chill lofi drum loop',
    'melodic house lead synth',
  ];
  
  const handleGenreChange = (newGenre: string) => {
    setGenre(newGenre);
    const genreData = GENRES.find(g => g.id === newGenre);
    if (genreData) {
      setTempo(genreData.tempo);
    }
  };

  const isProcessing =
    activeWorkflow.currentState === 'requesting' || activeWorkflow.currentState === 'processing';
  const hasResult =
    activeWorkflow.currentState === 'success' || activeWorkflow.currentState === 'integrated';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        data-testid="ai-generator-dialog"
      >
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2" data-testid="dialog-title">
              <Sparkles className="w-5 h-5 text-primary" />
              AI Music Generator
            </DialogTitle>
            {activeWorkflow.currentState !== 'idle' && (
              <div className="flex items-center gap-2" data-testid="state-indicator">
                {getStateBadge(activeWorkflow.currentState)}
                {activeWorkflow.retryCount > 0 && (
                  <Badge variant="outline" className="text-xs">
                    Retry {activeWorkflow.retryCount}
                  </Badge>
                )}
              </div>
            )}
          </div>
          <DialogDescription data-testid="dialog-description">
            Generate drums, bass, synths, and melodies using AI synthesis. Describe what you want 
            or upload a reference audio for style transfer.
          </DialogDescription>
        </DialogHeader>

        {/* Progress Bar */}
        {isProcessing && (
          <div className="space-y-2" data-testid="progress-container">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {activeWorkflow.currentState === 'requesting'
                  ? 'Sending request...'
                  : 'Processing AI generation...'}
              </span>
              <span className="font-medium">{Math.round(activeWorkflow.progress)}%</span>
            </div>
            <Progress value={activeWorkflow.progress} className="h-2" data-testid="progress-bar" />
          </div>
        )}

        {/* Error Alert */}
        {activeWorkflow.currentState === 'error' && activeWorkflow.errorMessage && (
          <Alert variant="destructive" data-testid="error-alert">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>{activeWorkflow.errorMessage}</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRetry}
                  disabled={activeWorkflow.retryCount >= 3}
                  data-testid="button-retry"
                >
                  <RotateCw className="w-3 h-3 mr-1" />
                  Retry
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => reset(activeWorkflowType)}
                  data-testid="button-reset"
                >
                  Reset
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as 'text' | 'audio')}
          data-testid="generator-tabs"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="text" data-testid="tab-text-to-music">
              <Wand2 className="w-4 h-4 mr-2" />
              Text-to-Music
            </TabsTrigger>
            <TabsTrigger value="audio" data-testid="tab-audio-to-music">
              <AudioWaveform className="w-4 h-4 mr-2" />
              Audio-to-Music
            </TabsTrigger>
          </TabsList>

          <TabsContent value="text" className="space-y-4" data-testid="text-to-music-content">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Instrument Type</Label>
                <Select value={instrumentType} onValueChange={setInstrumentType} disabled={isProcessing}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select instrument" />
                  </SelectTrigger>
                  <SelectContent>
                    {INSTRUMENT_TYPES.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        <span className="flex items-center gap-2">
                          <span>{type.icon}</span>
                          <span>{type.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Genre</Label>
                <Select value={genre} onValueChange={handleGenreChange} disabled={isProcessing}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select genre" />
                  </SelectTrigger>
                  <SelectContent>
                    {GENRES.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name} ({g.tempo} BPM)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Tempo: {tempo} BPM</Label>
              </div>
              <Slider
                value={[tempo]}
                onValueChange={(v) => setTempo(v[0])}
                min={40}
                max={240}
                step={1}
                disabled={isProcessing}
                className="w-full"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Key</Label>
                <Select value={musicalKey} onValueChange={setMusicalKey} disabled={isProcessing}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select key" />
                  </SelectTrigger>
                  <SelectContent>
                    {KEYS.map((k) => (
                      <SelectItem key={k} value={k}>{k}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Scale</Label>
                <Select value={scale} onValueChange={setScale} disabled={isProcessing}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select scale" />
                  </SelectTrigger>
                  <SelectContent>
                    {SCALES.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <Separator />
            
            <div className="space-y-2">
              <Label htmlFor="description" data-testid="label-description">
                Additional Description (optional)
              </Label>
              <Textarea
                id="description"
                placeholder="Add details like 'punchy', 'dark', 'atmospheric', 'aggressive'..."
                className="min-h-[80px]"
                disabled={isProcessing}
                data-testid="textarea-description"
                {...form.register('text')}
              />
              {form.formState.errors.text && (
                <p className="text-sm text-destructive" data-testid="error-text">
                  {form.formState.errors.text.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label data-testid="label-examples">Quick Presets:</Label>
              <div className="flex flex-wrap gap-2">
                {exampleTexts.map((example, index) => (
                  <Badge
                    key={index}
                    variant="secondary"
                    className="cursor-pointer hover:bg-secondary/80"
                    onClick={() => !isProcessing && form.setValue('text', example)}
                    data-testid={`example-text-${index}`}
                  >
                    {example}
                  </Badge>
                ))}
              </div>
            </div>

            {textToMusic.resultData && textToMusic.resultData.sourceType === 'text' && (
              <Card className="p-4 space-y-3" data-testid="card-generated-params">
                <h4
                  className="font-medium flex items-center gap-2"
                  data-testid="heading-detected-params"
                >
                  <Music className="w-4 h-4" />
                  Detected Parameters
                </h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div data-testid="param-key">
                    <span className="text-muted-foreground">Key:</span>{' '}
                    <span className="font-medium">
                      {textToMusic.resultData.parameters.key}{' '}
                      {textToMusic.resultData.parameters.scale}
                    </span>
                  </div>
                  <div data-testid="param-tempo">
                    <span className="text-muted-foreground">Tempo:</span>{' '}
                    <span className="font-medium">
                      {textToMusic.resultData.parameters.tempo} BPM
                    </span>
                  </div>
                  <div data-testid="param-mood">
                    <span className="text-muted-foreground">Mood:</span>{' '}
                    <span className="font-medium capitalize">
                      {textToMusic.resultData.parameters.mood}
                    </span>
                  </div>
                  <div data-testid="param-genre">
                    <span className="text-muted-foreground">Genre:</span>{' '}
                    <span className="font-medium capitalize">
                      {textToMusic.resultData.parameters.genre}
                    </span>
                  </div>
                </div>
              </Card>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleTextSubmit}
                disabled={isProcessing || textToMusic.currentState === 'integrated'}
                className="flex-1"
                data-testid="button-generate-text"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {textToMusic.currentState === 'requesting' ? 'Requesting...' : 'Generating...'}
                  </>
                ) : textToMusic.currentState === 'integrated' ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Integrated
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4 mr-2" />
                    Generate Music
                  </>
                )}
              </Button>
              {isProcessing && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCancel}
                  data-testid="button-cancel-text"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </TabsContent>

          <TabsContent value="audio" className="space-y-4" data-testid="audio-to-music-content">
            <Card className="p-4 bg-primary/5 border-primary/20">
              <div className="flex items-start gap-3">
                <Zap className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <h4 className="font-medium text-sm">Style Transfer</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Upload a reference audio file. The AI will analyze its characteristics (tempo, 
                    brightness, energy) and generate new sounds matching that style.
                  </p>
                </div>
              </div>
            </Card>
            
            <div className="space-y-2">
              <Label htmlFor="audio-file" data-testid="label-audio-file">
                Upload Reference Audio
              </Label>
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  id="audio-file"
                  accept="audio/*"
                  onChange={handleAudioUpload}
                  disabled={isProcessing}
                  className="hidden"
                  data-testid="input-audio-file"
                />
                <Button
                  variant="outline"
                  onClick={() => !isProcessing && fileInputRef.current?.click()}
                  disabled={isProcessing}
                  className="flex-1"
                  data-testid="button-upload-audio"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {audioFile ? audioFile.name : 'Choose Audio File'}
                </Button>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Generate As</Label>
              <Select value={targetType} onValueChange={setTargetType} disabled={isProcessing}>
                <SelectTrigger>
                  <SelectValue placeholder="Select output type" />
                </SelectTrigger>
                <SelectContent>
                  {INSTRUMENT_TYPES.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      <span className="flex items-center gap-2">
                        <span>{type.icon}</span>
                        <span>{type.name}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                The AI will generate this type of sound using the style from your reference audio.
              </p>
            </div>

            {audioToMusic.resultData && audioToMusic.resultData.sourceType === 'audio' && (
              <Card className="p-4 space-y-3" data-testid="card-analysis-results">
                <h4
                  className="font-medium flex items-center gap-2"
                  data-testid="heading-analysis-results"
                >
                  <AudioWaveform className="w-4 h-4" />
                  Analysis Results
                </h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div data-testid="analysis-key">
                    <span className="text-muted-foreground">Detected Key:</span>{' '}
                    <span className="font-medium">
                      {audioToMusic.resultData.parameters.key}{' '}
                      {audioToMusic.resultData.parameters.scale}
                    </span>
                  </div>
                  <div data-testid="analysis-tempo">
                    <span className="text-muted-foreground">Detected BPM:</span>{' '}
                    <span className="font-medium">{audioToMusic.resultData.parameters.tempo}</span>
                  </div>
                  <div data-testid="analysis-mood">
                    <span className="text-muted-foreground">Mood:</span>{' '}
                    <span className="font-medium capitalize">
                      {audioToMusic.resultData.parameters.mood}
                    </span>
                  </div>
                  <div data-testid="analysis-genre">
                    <span className="text-muted-foreground">Genre:</span>{' '}
                    <span className="font-medium capitalize">
                      {audioToMusic.resultData.parameters.genre}
                    </span>
                  </div>
                </div>
              </Card>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleAudioGenerate}
                disabled={!audioFile || isProcessing || audioToMusic.currentState === 'integrated'}
                className="flex-1"
                data-testid="button-generate-audio"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {audioToMusic.currentState === 'requesting'
                      ? 'Requesting...'
                      : 'Analyzing & Generating...'}
                  </>
                ) : audioToMusic.currentState === 'integrated' ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Integrated
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4 mr-2" />
                    Analyze & Generate
                  </>
                )}
              </Button>
              {isProcessing && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCancel}
                  data-testid="button-cancel-audio"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {hasResult && activeWorkflow.resultData && (
          <>
            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium flex items-center gap-2" data-testid="heading-preview">
                  <Music className="w-4 h-4" />
                  Generated Music Preview
                </h4>
                {activeWorkflow.currentState === 'integrated' && (
                  <Badge variant="outline" className="text-blue-600 border-blue-600">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Added to Project
                  </Badge>
                )}
              </div>

              <Card className="p-4 space-y-3" data-testid="card-preview">
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={togglePlayback}
                    data-testid="button-playback"
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </Button>
                  <div className="flex-1">
                    <div className="text-sm font-medium mb-1" data-testid="text-preview-title">
                      {activeWorkflow.resultData.parameters.key}{' '}
                      {activeWorkflow.resultData.parameters.scale} -{' '}
                      {activeWorkflow.resultData.parameters.tempo} BPM
                    </div>
                    <Progress value={0} className="h-2" data-testid="progress-playback" />
                  </div>
                </div>

                <audio
                  ref={audioRef}
                  src={activeWorkflow.resultData.audioFilePath}
                  onEnded={() => setIsPlaying(false)}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />

                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={handleDownload} data-testid="button-download">
                    <Download className="w-4 h-4 mr-2" />
                    Download WAV
                  </Button>
                  {onAddToProject && (
                    <Button
                      onClick={handleAddToProject}
                      disabled={activeWorkflow.currentState === 'integrated'}
                      data-testid="button-add-to-project"
                    >
                      {activeWorkflow.currentState === 'integrated' ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Added to Project
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4 mr-2" />
                          Add to Project
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </Card>

              <Card className="p-4 space-y-2" data-testid="card-music-info">
                <div className="text-sm">
                  <span className="text-muted-foreground" data-testid="text-notes-label">
                    Notes Generated:
                  </span>{' '}
                  <span className="font-medium" data-testid="text-notes-count">
                    {activeWorkflow.resultData.generatedNotes?.length || 0}
                  </span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground" data-testid="text-chords-label">
                    Chords Generated:
                  </span>{' '}
                  <span className="font-medium" data-testid="text-chords-count">
                    {activeWorkflow.resultData.generatedChords?.length || 0}
                  </span>
                </div>
                {activeWorkflow.timestamp && (
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Generated {new Date(activeWorkflow.timestamp).toLocaleTimeString()}
                  </div>
                )}
              </Card>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
