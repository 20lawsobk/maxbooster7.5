import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  Wand2,
  Music,
  Upload,
  Zap,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Lightbulb,
  Volume2,
  Target,
  Sparkles,
  FileAudio,
  Loader2,
} from 'lucide-react';

const LUFS_TARGETS = [
  { value: '-14', label: '-14 LUFS (Spotify, YouTube)', platform: 'Streaming' },
  { value: '-16', label: '-16 LUFS (Apple Music)', platform: 'Streaming' },
  { value: '-18', label: '-18 LUFS (Amazon Music)', platform: 'Streaming' },
  { value: 'custom', label: 'Custom Target', platform: 'Custom' },
];

const GENRE_PRESETS = [
  { id: 'hip_hop', name: 'Hip-Hop', icon: '🎤' },
  { id: 'edm', name: 'EDM', icon: '🎧' },
  { id: 'rock', name: 'Rock', icon: '🎸' },
  { id: 'pop', name: 'Pop', icon: '🎵' },
  { id: 'jazz', name: 'Jazz', icon: '🎺' },
  { id: 'classical', name: 'Classical', icon: '🎻' },
  { id: 'rb', name: 'R&B', icon: '🎹' },
  { id: 'country', name: 'Country', icon: '🤠' },
  { id: 'reggae', name: 'Reggae', icon: '🌴' },
  { id: 'metal', name: 'Metal', icon: '🤘' },
  { id: 'indie', name: 'Indie', icon: '🎨' },
  { id: 'folk', name: 'Folk', icon: '🪕' },
  { id: 'blues', name: 'Blues', icon: '🎷' },
  { id: 'electronic', name: 'Electronic', icon: '⚡' },
  { id: 'ambient', name: 'Ambient', icon: '🌊' },
  { id: 'trap', name: 'Trap', icon: '💎' },
  { id: 'house', name: 'House', icon: '🏠' },
  { id: 'techno', name: 'Techno', icon: '🔊' },
  { id: 'dubstep', name: 'Dubstep', icon: '🎚️' },
  { id: 'soul', name: 'Soul', icon: '✨' },
];

interface AISuggestion {
  id: string;
  type: 'info' | 'warning' | 'success';
  message: string;
  confidence: number;
  action?: string;
}

interface LoudnessAnalysis {
  currentLUFS: number;
  targetLUFS: number;
  dynamic_range: number;
  peak: number;
  recommendation: string;
  confidence: number;
}

interface AIAssistantPanelProps {
  projectId?: string;
  onApplyChanges?: (changes: unknown) => void;
}

/**
 * TODO: Add function documentation
 */
export function AIAssistantPanel({ projectId, onApplyChanges }: AIAssistantPanelProps) {
  const { toast } = useToast();
  const [selectedLUFSTarget, setSelectedLUFSTarget] = useState('-14');
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);

  const { data: presetsData } = useQuery({
    queryKey: ['/api/studio/ai-music/presets'],
    queryFn: async () => {
      try {
        const res = await apiRequest('GET', '/api/studio/ai-music/presets');
        return res.json();
      } catch {
        return [];
      }
    },
    retry: false,
    staleTime: 60000,
  });

  const { data: suggestions, refetch: refetchSuggestions } = useQuery<AISuggestion[]>({
    queryKey: ['/api/studio/ai-music/suggestions', projectId, selectedGenre],
    queryFn: async () => {
      try {
        const res = await apiRequest('GET', `/api/studio/ai-music/suggestions?projectId=${projectId}&genre=${selectedGenre || 'pop'}`);
        const data = await res.json();
        return data.map((s: any) => ({
          id: s.id,
          type: s.priority === 'high' ? 'warning' : s.priority === 'medium' ? 'info' : 'success',
          message: s.suggestion || s.message,
          confidence: Math.round((s.confidence || 0.85) * 100),
          action: s.category,
        }));
      } catch {
        return [];
      }
    },
    enabled: !!projectId,
    retry: false,
    staleTime: 30000,
  });

  const analyzeLoudnessMutation = useMutation({
    mutationFn: async (targetLUFS: string) => {
      const res = await apiRequest('POST', '/api/studio/ai-music/analyze-loudness', { projectId, targetLUFS });
      return res.json();
    },
    onSuccess: (data: LoudnessAnalysis) => {
      toast({
        title: 'Loudness Analysis Complete',
        description: data.recommendation,
      });
      refetchSuggestions();
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unable to analyze loudness';
      toast({
        title: 'Analysis Failed',
        description: message,
        variant: 'destructive',
      });
    },
  });

  const matchReferenceMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('reference', file);
      if (projectId) formData.append('projectId', projectId);

      const res = await apiRequest('POST', '/api/studio/ai-music/match-reference', formData);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Reference Match Complete',
        description: `Applied ${data.adjustments?.length || 0} adjustments to match reference track`,
      });
      if (onApplyChanges && data.adjustments) {
        onApplyChanges(data.adjustments);
      }
      refetchSuggestions();
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unable to match reference track';
      toast({
        title: 'Reference Matching Failed',
        description: message,
        variant: 'destructive',
      });
    },
  });

  const applyGenrePresetMutation = useMutation({
    mutationFn: async (genreId: string) => {
      const res = await apiRequest('POST', '/api/studio/ai-music/apply-genre-preset', { projectId, genreId });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Genre Preset Applied',
        description: `Applied ${selectedGenre} preset successfully`,
      });
      if (onApplyChanges && data.settings) {
        onApplyChanges(data.settings);
      }
      refetchSuggestions();
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unable to apply genre preset';
      toast({
        title: 'Preset Application Failed',
        description: message,
        variant: 'destructive',
      });
    },
  });

  const handleAnalyzeLoudness = () => {
    analyzeLoudnessMutation.mutate(selectedLUFSTarget);
  };

  const handleReferenceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      setReferenceFile(file);
      matchReferenceMutation.mutate(file);
    }
  };

  const handleApplyGenrePreset = (genreId: string) => {
    setSelectedGenre(genreId);
    applyGenrePresetMutation.mutate(genreId);
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 90) return 'text-green-600';
    if (confidence >= 70) return 'text-yellow-600';
    return 'text-orange-600';
  };

  const getSuggestionIcon = (type: string) => {
    switch (type) {
      case 'warning':
        return <AlertCircle className="w-4 h-4 text-yellow-600" />;
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      default:
        return <Lightbulb className="w-4 h-4 text-blue-600" />;
    }
  };

  return (
    <div className="flex flex-col space-y-4">
      <div className="space-y-4">
        <Tabs defaultValue="loudness" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="loudness">
              <Volume2 className="w-4 h-4 mr-1" />
              LUFS
            </TabsTrigger>
            <TabsTrigger value="reference">
              <Target className="w-4 h-4 mr-1" />
              Reference
            </TabsTrigger>
            <TabsTrigger value="genre">
              <Music className="w-4 h-4 mr-1" />
              Genre
            </TabsTrigger>
          </TabsList>

          <TabsContent value="loudness" className="space-y-3">
            <div className="space-y-2">
              <Label>Target Loudness</Label>
              <Select value={selectedLUFSTarget} onValueChange={setSelectedLUFSTarget}>
                <SelectTrigger>
                  <SelectValue placeholder="Select LUFS target" />
                </SelectTrigger>
                <SelectContent>
                  {LUFS_TARGETS.map((target) => (
                    <SelectItem key={target.value} value={target.value}>
                      <div className="flex items-center justify-between w-full">
                        <span>{target.label}</span>
                        <Badge variant="outline" className="ml-2 text-xs">
                          {target.platform}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button"
              onClick={handleAnalyzeLoudness}
              disabled={analyzeLoudnessMutation.isPending}
              className="w-full"
            >
              {analyzeLoudnessMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  Analyze Loudness
                </>
              )}
            </Button>

            {analyzeLoudnessMutation.data && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Current LUFS:</span>
                      <span className="font-semibold">
                        {analyzeLoudnessMutation.data.currentLUFS} LUFS
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Target LUFS:</span>
                      <span className="font-semibold">
                        {analyzeLoudnessMutation.data.targetLUFS} LUFS
                      </span>
                    </div>
                    <Progress value={analyzeLoudnessMutation.data.confidence} className="h-2" />
                    <p className="text-xs text-muted-foreground">
                      Confidence: {analyzeLoudnessMutation.data.confidence}%
                    </p>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>

          <TabsContent value="reference" className="space-y-3">
            <div className="space-y-2">
              <Label>Upload Reference Track</Label>
              <div className="flex flex-col gap-2">
                <input
                  type="file"
                  id="reference-upload"
                  accept="audio/*"
                  onChange={handleReferenceUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => document.getElementById('reference-upload')?.click()}
                  disabled={matchReferenceMutation.isPending}
                  className="w-full"
                >
                  {matchReferenceMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      {referenceFile ? referenceFile.name : 'Choose Reference Track'}
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Upload a professional track to match its sonic characteristics
                </p>
              </div>
            </div>

            {matchReferenceMutation.data && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Analysis Complete</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Loudness Match:</span>
                        <span className="ml-1 font-semibold">
                          {matchReferenceMutation.data.loudness_match}%
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Frequency Match:</span>
                        <span className="ml-1 font-semibold">
                          {matchReferenceMutation.data.frequency_match}%
                        </span>
                      </div>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>

          <TabsContent value="genre" className="space-y-3">
            <div className="space-y-2">
              <Label>Select Genre Preset</Label>
              <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto">
                {GENRE_PRESETS.map((genre) => (
                  <Button
                    type="button"
                    key={genre.id}
                    variant={selectedGenre === genre.id ? 'default' : 'outline'}
                    onClick={() => handleApplyGenrePreset(genre.id)}
                    disabled={applyGenrePresetMutation.isPending}
                    className="justify-start"
                  >
                    <span className="mr-2">{genre.icon}</span>
                    {genre.name}
                  </Button>
                ))}
              </div>
            </div>

            {applyGenrePresetMutation.isPending && (
              <Alert>
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertDescription>Applying {selectedGenre} preset settings...</AlertDescription>
              </Alert>
            )}
          </TabsContent>
        </Tabs>

        <div className="space-y-3 pt-4 border-t">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              AI Suggestions
            </h4>
            <Badge variant="secondary" className="text-xs">
              {suggestions?.length || 0} insights
            </Badge>
          </div>

          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {suggestions && suggestions.length > 0 ? (
              suggestions.map((suggestion) => (
                <Alert key={suggestion.id} variant="default" className="py-2">
                  <div className="flex items-start gap-2">
                    {getSuggestionIcon(suggestion.type)}
                    <div className="flex-1 space-y-1">
                      <p className="text-sm">{suggestion.message}</p>
                      <div className="flex items-center justify-between">
                        <p
                          className={`text-xs font-medium ${getConfidenceColor(suggestion.confidence)}`}
                        >
                          {suggestion.confidence}% confidence
                        </p>
                        {suggestion.action && (
                          <Button 
                            type="button"
                            size="sm" 
                            variant="ghost" 
                            className="h-6 text-xs"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toast({
                                title: 'Fix Applied',
                                description: `Applied ${suggestion.action} fix`,
                              });
                            }}
                          >
                            Apply Fix
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </Alert>
              ))
            ) : (
              <div className="text-center py-6 text-sm text-muted-foreground">
                <Lightbulb className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No suggestions available</p>
                <p className="text-xs">Analyze your project to get AI insights</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
