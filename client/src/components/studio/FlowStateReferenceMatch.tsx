import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  Waveform,
  BarChart3,
  Zap,
  RefreshCw,
  Check,
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Target,
  Sparkles,
  Download,
  Layers
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface FrequencyBand {
  name: string;
  range: string;
  reference: number;
  current: number;
  difference: number;
  suggestion: string;
}

interface DynamicsAnalysis {
  rms: number;
  peak: number;
  crestFactor: number;
  lufs: number;
  dynamicRange: number;
}

interface StereoAnalysis {
  width: number;
  correlation: number;
  balance: number;
}

interface ReferenceTrack {
  id: string;
  name: string;
  duration: number;
  waveform: number[];
  analysis: {
    frequency: FrequencyBand[];
    dynamics: DynamicsAnalysis;
    stereo: StereoAnalysis;
    tempo: number;
    key: string;
  };
}

interface FlowStateReferenceMatchProps {
  currentTrackName?: string;
  onApplyEQ?: (bands: FrequencyBand[]) => void;
  onApplyCompression?: (settings: DynamicsAnalysis) => void;
  className?: string;
}

export function FlowStateReferenceMatch({
  currentTrackName = 'My Mix',
  onApplyEQ,
  onApplyCompression,
  className
}: FlowStateReferenceMatchProps) {
  const { toast } = useToast();
  const [referenceTrack, setReferenceTrack] = useState<ReferenceTrack | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingTrack, setPlayingTrack] = useState<'reference' | 'current'>('current');
  const [loudnessMatch, setLoudnessMatch] = useState(true);
  const [abComparison, setAbComparison] = useState(false);
  const [matchIntensity, setMatchIntensity] = useState([75]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentAnalysis] = useState<ReferenceTrack['analysis']>({
    frequency: [
      { name: 'Sub', range: '20-60Hz', reference: 0, current: -2, difference: -2, suggestion: 'Boost sub frequencies by 2dB' },
      { name: 'Bass', range: '60-250Hz', reference: 0, current: 1.5, difference: 1.5, suggestion: 'Cut bass by 1.5dB' },
      { name: 'Low Mid', range: '250-500Hz', reference: 0, current: 0.5, difference: 0.5, suggestion: 'Slight cut at 300Hz' },
      { name: 'Mid', range: '500-2kHz', reference: 0, current: -1, difference: -1, suggestion: 'Boost mids slightly' },
      { name: 'High Mid', range: '2k-4kHz', reference: 0, current: 2, difference: 2, suggestion: 'Cut presence by 2dB' },
      { name: 'Presence', range: '4k-6kHz', reference: 0, current: -0.5, difference: -0.5, suggestion: 'Boost clarity slightly' },
      { name: 'Brilliance', range: '6k-10kHz', reference: 0, current: 1, difference: 1, suggestion: 'Cut air frequencies by 1dB' },
      { name: 'Air', range: '10k-20kHz', reference: 0, current: -1.5, difference: -1.5, suggestion: 'Add air with shelf at 12kHz' },
    ],
    dynamics: {
      rms: -14,
      peak: -1,
      crestFactor: 13,
      lufs: -14,
      dynamicRange: 8
    },
    stereo: {
      width: 65,
      correlation: 0.85,
      balance: 2
    },
    tempo: 128,
    key: 'F Minor'
  });

  const generateMockWaveform = (): number[] => {
    const waveform: number[] = [];
    for (let i = 0; i < 200; i++) {
      waveform.push(0.3 + Math.random() * 0.5);
    }
    return waveform;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('audio/')) {
      toast({ title: 'Invalid file', description: 'Please upload an audio file', variant: 'destructive' });
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress(0);

    const progressInterval = setInterval(() => {
      setAnalysisProgress(prev => Math.min(prev + Math.random() * 15, 95));
    }, 200);

    setTimeout(() => {
      clearInterval(progressInterval);
      setAnalysisProgress(100);

      const mockReference: ReferenceTrack = {
        id: `ref-${Date.now()}`,
        name: file.name.replace(/\.[^/.]+$/, ''),
        duration: 180 + Math.random() * 120,
        waveform: generateMockWaveform(),
        analysis: {
          frequency: [
            { name: 'Sub', range: '20-60Hz', reference: -3, current: -5, difference: -2, suggestion: 'Boost sub by 2dB with high-pass at 30Hz' },
            { name: 'Bass', range: '60-250Hz', reference: 2, current: 3.5, difference: 1.5, suggestion: 'Tighten bass with multiband compression' },
            { name: 'Low Mid', range: '250-500Hz', reference: -1, current: -0.5, difference: 0.5, suggestion: 'Cut mud at 300Hz' },
            { name: 'Mid', range: '500-2kHz', reference: 1, current: 0, difference: -1, suggestion: 'Add body with 1dB boost at 800Hz' },
            { name: 'High Mid', range: '2k-4kHz', reference: 3, current: 5, difference: 2, suggestion: 'Reduce harshness at 3kHz' },
            { name: 'Presence', range: '4k-6kHz', reference: 2, current: 1.5, difference: -0.5, suggestion: 'Subtle presence boost for clarity' },
            { name: 'Brilliance', range: '6k-10kHz', reference: 1, current: 2, difference: 1, suggestion: 'De-ess and reduce sibilance' },
            { name: 'Air', range: '10k-20kHz', reference: 3, current: 1.5, difference: -1.5, suggestion: 'Add air with Maag-style EQ at 40kHz harmonic' },
          ],
          dynamics: {
            rms: -12,
            peak: -0.3,
            crestFactor: 11.7,
            lufs: -11,
            dynamicRange: 6
          },
          stereo: {
            width: 78,
            correlation: 0.72,
            balance: -1
          },
          tempo: 124,
          key: 'G Minor'
        }
      };

      setReferenceTrack(mockReference);
      setIsAnalyzing(false);
      toast({ 
        title: 'Analysis complete', 
        description: `Analyzed "${mockReference.name}" - Ready for matching!` 
      });
    }, 2500);
  };

  const applyEQMatch = () => {
    if (!referenceTrack) return;
    onApplyEQ?.(referenceTrack.analysis.frequency);
    toast({ title: 'EQ matching applied', description: 'Frequency balance matched to reference' });
  };

  const applyDynamicsMatch = () => {
    if (!referenceTrack) return;
    onApplyCompression?.(referenceTrack.analysis.dynamics);
    toast({ title: 'Dynamics matching applied', description: 'Compression settings matched to reference' });
  };

  const getDifferenceColor = (diff: number): string => {
    const abs = Math.abs(diff);
    if (abs < 1) return 'text-green-400';
    if (abs < 2) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getDifferenceBar = (diff: number): React.ReactNode => {
    const abs = Math.abs(diff);
    const width = Math.min(abs * 20, 100);
    const color = abs < 1 ? 'bg-green-500' : abs < 2 ? 'bg-yellow-500' : 'bg-red-500';
    
    return (
      <div className="flex items-center gap-2">
        <div className="w-24 h-2 bg-zinc-800 rounded-full overflow-hidden relative">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-px h-full bg-zinc-600" />
          </div>
          <motion.div
            className={cn("h-full rounded-full", color)}
            initial={{ width: 0 }}
            animate={{ 
              width: `${width}%`,
              marginLeft: diff < 0 ? `${50 - width}%` : '50%'
            }}
          />
        </div>
        <span className={cn("text-xs font-mono w-12", getDifferenceColor(diff))}>
          {diff > 0 ? '+' : ''}{diff.toFixed(1)}dB
        </span>
      </div>
    );
  };

  return (
    <div className={cn("flex flex-col h-full bg-zinc-950 text-white", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-lg">
            <Target className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h2 className="font-semibold">Reference Match</h2>
            <p className="text-xs text-zinc-500">Match your mix to pro tracks</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 mr-4">
            <Switch checked={loudnessMatch} onCheckedChange={setLoudnessMatch} />
            <Label className="text-sm text-zinc-400">Loudness Match</Label>
          </div>
          <Badge variant="outline" className="text-purple-400 border-purple-400/30">
            <Sparkles className="w-3 h-3 mr-1" />
            AI Analysis
          </Badge>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Reference Upload & Waveforms */}
        <div className="w-96 border-r border-zinc-800 p-4 flex flex-col gap-4">
          {/* Upload Area */}
          <Card
            className={cn(
              "border-2 border-dashed transition-all cursor-pointer",
              referenceTrack 
                ? "bg-purple-500/5 border-purple-500/30" 
                : "bg-zinc-900 border-zinc-700 hover:border-purple-500/50"
            )}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={handleFileUpload}
            />
            <div className="p-6 text-center">
              {isAnalyzing ? (
                <>
                  <RefreshCw className="w-10 h-10 mx-auto mb-3 text-purple-400 animate-spin" />
                  <p className="text-sm font-medium mb-2">Analyzing reference...</p>
                  <Progress value={analysisProgress} className="h-2" />
                  <p className="text-xs text-zinc-500 mt-2">
                    {analysisProgress < 30 ? 'Extracting frequency spectrum...' :
                     analysisProgress < 60 ? 'Analyzing dynamics...' :
                     analysisProgress < 90 ? 'Measuring stereo image...' :
                     'Generating suggestions...'}
                  </p>
                </>
              ) : referenceTrack ? (
                <>
                  <Check className="w-10 h-10 mx-auto mb-3 text-green-400" />
                  <p className="font-medium">{referenceTrack.name}</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    {Math.floor(referenceTrack.duration / 60)}:{String(Math.floor(referenceTrack.duration % 60)).padStart(2, '0')} • {referenceTrack.analysis.tempo} BPM • {referenceTrack.analysis.key}
                  </p>
                  <p className="text-xs text-purple-400 mt-2">Click to change reference</p>
                </>
              ) : (
                <>
                  <Upload className="w-10 h-10 mx-auto mb-3 text-zinc-500" />
                  <p className="text-sm font-medium">Drop a reference track</p>
                  <p className="text-xs text-zinc-500 mt-1">
                    Upload a professionally mixed track to match
                  </p>
                </>
              )}
            </div>
          </Card>

          {/* Waveform Comparison */}
          {referenceTrack && (
            <Card className="bg-zinc-900 border-zinc-800 p-4 flex-1">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium">Waveform Comparison</h3>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={playingTrack === 'current' ? 'default' : 'outline'}
                    onClick={() => setPlayingTrack('current')}
                    className="h-7 text-xs"
                  >
                    Your Mix
                  </Button>
                  <Button
                    size="sm"
                    variant={playingTrack === 'reference' ? 'default' : 'outline'}
                    onClick={() => setPlayingTrack('reference')}
                    className="h-7 text-xs"
                  >
                    Reference
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                {/* Your Mix Waveform */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-zinc-500">{currentTrackName}</span>
                    <span className="text-xs text-zinc-500">{currentAnalysis.dynamics.lufs} LUFS</span>
                  </div>
                  <div className="h-12 bg-zinc-950 rounded flex items-center px-1">
                    {generateMockWaveform().map((v, i) => (
                      <div
                        key={i}
                        className="flex-1 mx-px bg-blue-500/60 rounded-sm"
                        style={{ height: `${v * 100}%` }}
                      />
                    ))}
                  </div>
                </div>

                {/* Reference Waveform */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-zinc-500">{referenceTrack.name}</span>
                    <span className="text-xs text-zinc-500">{referenceTrack.analysis.dynamics.lufs} LUFS</span>
                  </div>
                  <div className="h-12 bg-zinc-950 rounded flex items-center px-1">
                    {referenceTrack.waveform.map((v, i) => (
                      <div
                        key={i}
                        className="flex-1 mx-px bg-purple-500/60 rounded-sm"
                        style={{ height: `${v * 100}%` }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Playback Controls */}
              <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t border-zinc-800">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => setIsPlaying(!isPlaying)}
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </Button>
                <div className="flex items-center gap-2">
                  <Switch checked={abComparison} onCheckedChange={setAbComparison} />
                  <Label className="text-xs">A/B Auto-Switch</Label>
                </div>
              </div>
            </Card>
          )}

          {/* Match Intensity */}
          {referenceTrack && (
            <div className="space-y-2">
              <Label className="text-sm text-zinc-400">
                Match Intensity: {matchIntensity[0]}%
              </Label>
              <Slider
                value={matchIntensity}
                onValueChange={setMatchIntensity}
                min={0}
                max={100}
                step={5}
              />
              <p className="text-xs text-zinc-500">
                Higher values match the reference more closely
              </p>
            </div>
          )}
        </div>

        {/* Right Panel - Analysis Results */}
        <div className="flex-1 overflow-auto p-4">
          {referenceTrack ? (
            <Tabs defaultValue="frequency" className="h-full flex flex-col">
              <TabsList className="bg-zinc-900 mb-4">
                <TabsTrigger value="frequency">
                  <BarChart3 className="w-4 h-4 mr-1" />
                  Frequency
                </TabsTrigger>
                <TabsTrigger value="dynamics">
                  <Waveform className="w-4 h-4 mr-1" />
                  Dynamics
                </TabsTrigger>
                <TabsTrigger value="stereo">
                  <Layers className="w-4 h-4 mr-1" />
                  Stereo
                </TabsTrigger>
              </TabsList>

              <TabsContent value="frequency" className="flex-1 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Frequency Balance Comparison</h3>
                  <Button
                    size="sm"
                    className="bg-purple-500 hover:bg-purple-600"
                    onClick={applyEQMatch}
                  >
                    <Zap className="w-4 h-4 mr-1" />
                    Apply EQ Match
                  </Button>
                </div>

                <div className="space-y-3">
                  {referenceTrack.analysis.frequency.map((band, idx) => (
                    <motion.div
                      key={band.name}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="bg-zinc-900 rounded-lg p-3"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="font-medium">{band.name}</span>
                          <span className="text-xs text-zinc-500 ml-2">{band.range}</span>
                        </div>
                        {getDifferenceBar(band.difference)}
                      </div>
                      <p className="text-xs text-zinc-400 flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-purple-400" />
                        {band.suggestion}
                      </p>
                    </motion.div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="dynamics" className="flex-1 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Dynamics Comparison</h3>
                  <Button
                    size="sm"
                    className="bg-purple-500 hover:bg-purple-600"
                    onClick={applyDynamicsMatch}
                  >
                    <Zap className="w-4 h-4 mr-1" />
                    Apply Dynamics Match
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Card className="bg-zinc-900 border-zinc-800 p-4">
                    <h4 className="text-sm text-zinc-400 mb-2">Your Mix</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm">LUFS</span>
                        <span className="font-mono">{currentAnalysis.dynamics.lufs} dB</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Peak</span>
                        <span className="font-mono">{currentAnalysis.dynamics.peak} dB</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Dynamic Range</span>
                        <span className="font-mono">{currentAnalysis.dynamics.dynamicRange} dB</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Crest Factor</span>
                        <span className="font-mono">{currentAnalysis.dynamics.crestFactor} dB</span>
                      </div>
                    </div>
                  </Card>

                  <Card className="bg-zinc-900 border-zinc-800 p-4">
                    <h4 className="text-sm text-zinc-400 mb-2">Reference</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm">LUFS</span>
                        <span className="font-mono text-purple-400">{referenceTrack.analysis.dynamics.lufs} dB</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Peak</span>
                        <span className="font-mono text-purple-400">{referenceTrack.analysis.dynamics.peak} dB</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Dynamic Range</span>
                        <span className="font-mono text-purple-400">{referenceTrack.analysis.dynamics.dynamicRange} dB</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Crest Factor</span>
                        <span className="font-mono text-purple-400">{referenceTrack.analysis.dynamics.crestFactor} dB</span>
                      </div>
                    </div>
                  </Card>
                </div>

                <Card className="bg-zinc-900 border-zinc-800 p-4">
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    AI Suggestions
                  </h4>
                  <ul className="space-y-2 text-sm text-zinc-400">
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                      <span>Apply 2:1 compression with 5ms attack and 80ms release on master bus</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                      <span>Use a limiter with -0.3dB ceiling and 3dB gain reduction</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                      <span>Your mix has more dynamic range - consider whether this is intentional</span>
                    </li>
                  </ul>
                </Card>
              </TabsContent>

              <TabsContent value="stereo" className="flex-1 space-y-4">
                <h3 className="font-medium">Stereo Image Comparison</h3>

                <div className="grid grid-cols-2 gap-4">
                  <Card className="bg-zinc-900 border-zinc-800 p-4">
                    <h4 className="text-sm text-zinc-400 mb-4">Your Mix</h4>
                    
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm">Stereo Width</span>
                          <span className="font-mono">{currentAnalysis.stereo.width}%</span>
                        </div>
                        <Progress value={currentAnalysis.stereo.width} className="h-2" />
                      </div>
                      
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm">Correlation</span>
                          <span className="font-mono">{currentAnalysis.stereo.correlation.toFixed(2)}</span>
                        </div>
                        <Progress value={currentAnalysis.stereo.correlation * 100} className="h-2" />
                      </div>
                      
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm">Balance</span>
                          <span className="font-mono">{currentAnalysis.stereo.balance > 0 ? '+' : ''}{currentAnalysis.stereo.balance}%</span>
                        </div>
                        <div className="h-2 bg-zinc-800 rounded-full relative">
                          <div className="absolute inset-y-0 left-1/2 w-px bg-zinc-600" />
                          <div 
                            className="absolute top-0 bottom-0 w-2 bg-blue-500 rounded-full"
                            style={{ left: `calc(50% + ${currentAnalysis.stereo.balance}%)` }}
                          />
                        </div>
                      </div>
                    </div>
                  </Card>

                  <Card className="bg-zinc-900 border-zinc-800 p-4">
                    <h4 className="text-sm text-zinc-400 mb-4">Reference</h4>
                    
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm">Stereo Width</span>
                          <span className="font-mono text-purple-400">{referenceTrack.analysis.stereo.width}%</span>
                        </div>
                        <Progress value={referenceTrack.analysis.stereo.width} className="h-2" />
                      </div>
                      
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm">Correlation</span>
                          <span className="font-mono text-purple-400">{referenceTrack.analysis.stereo.correlation.toFixed(2)}</span>
                        </div>
                        <Progress value={referenceTrack.analysis.stereo.correlation * 100} className="h-2" />
                      </div>
                      
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm">Balance</span>
                          <span className="font-mono text-purple-400">{referenceTrack.analysis.stereo.balance > 0 ? '+' : ''}{referenceTrack.analysis.stereo.balance}%</span>
                        </div>
                        <div className="h-2 bg-zinc-800 rounded-full relative">
                          <div className="absolute inset-y-0 left-1/2 w-px bg-zinc-600" />
                          <div 
                            className="absolute top-0 bottom-0 w-2 bg-purple-500 rounded-full"
                            style={{ left: `calc(50% + ${referenceTrack.analysis.stereo.balance}%)` }}
                          />
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>

                <Card className="bg-zinc-900 border-zinc-800 p-4">
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    AI Suggestions
                  </h4>
                  <ul className="space-y-2 text-sm text-zinc-400">
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                      <span>Widen your mix by {referenceTrack.analysis.stereo.width - currentAnalysis.stereo.width}% using mid/side processing</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                      <span>Reference has lower correlation - try adding subtle stereo widening effects</span>
                    </li>
                  </ul>
                </Card>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-zinc-500">
              <Target className="w-20 h-20 mb-4 opacity-20" />
              <p className="text-lg font-medium">No Reference Track</p>
              <p className="text-sm mt-1">Upload a professionally mixed track to compare</p>
              <p className="text-xs mt-4 max-w-xs text-center">
                The AI will analyze frequency balance, dynamics, and stereo image, 
                then suggest exactly how to match your mix
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FlowStateReferenceMatch;
