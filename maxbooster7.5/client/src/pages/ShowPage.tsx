import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRequireSubscription } from '@/hooks/useRequireAuth';
import { useStudioStore } from '@/lib/studioStore';
import { useMetronome } from '@/hooks/useMetronome';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Music,
  FileText,
  Sliders,
  Volume2,
  VolumeX,
  Headphones,
  Timer,
  AlertTriangle,
  Maximize,
  Minimize,
  Settings,
  Plus,
  Trash2,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Edit2,
  Save,
  Clock,
  Zap,
  Tablet,
  Wifi,
  WifiOff,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Layers,
  Activity,
  Radio,
  StopCircle,
  RotateCcw,
  ListMusic,
  MessageSquare,
  Mic,
} from 'lucide-react';

interface SetlistSong {
  id: string;
  title: string;
  artist?: string;
  duration: number;
  bpm: number;
  key?: string;
  notes?: string;
  backingTrackUrl?: string;
  lyricsId?: string;
  presetId?: string;
  markers?: { time: number; label: string; color: string }[];
}

interface EffectPreset {
  id: string;
  name: string;
  category: string;
  parameters: Record<string, number>;
}

interface RemoteDevice {
  id: string;
  name: string;
  type: 'tablet' | 'phone' | 'desktop';
  connected: boolean;
  lastSeen: Date;
}

export default function ShowPage() {
  const { user, isLoading } = useRequireSubscription();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    tempo,
    setTempo,
    isPlaying,
    setIsPlaying,
    currentTime,
    setCurrentTime,
    metronomeEnabled,
    setMetronomeEnabled,
    metronomeVolume,
    setMetronomeVolume,
  } = useStudioStore();

  const metronome = useMetronome({
    bpm: tempo,
    timeSignature: { numerator: 4, denominator: 4 },
    volume: metronomeVolume,
  });

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAddSongDialog, setShowAddSongDialog] = useState(false);
  const [showEditSongDialog, setShowEditSongDialog] = useState(false);
  const [editingSong, setEditingSong] = useState<SetlistSong | null>(null);
  const [teleprompterVisible, setTeleprompterVisible] = useState(true);
  const [effectsPanelVisible, setEffectsPanelVisible] = useState(true);
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
  const [countdownBetweenSongs, setCountdownBetweenSongs] = useState(5);
  const [clickTrackOutput, setClickTrackOutput] = useState<string>('default');
  const [mainOutput, setMainOutput] = useState<string>('default');
  const [remoteControlEnabled, setRemoteControlEnabled] = useState(false);
  const [connectedDevices, setConnectedDevices] = useState<RemoteDevice[]>([]);
  const [teleprompterFontSize, setTeleprompterFontSize] = useState(32);
  const [teleprompterScrollSpeed, setTeleprompterScrollSpeed] = useState(1);
  const [emergencyStopActive, setEmergencyStopActive] = useState(false);

  const [setlist, setSetlist] = useState<SetlistSong[]>([
    {
      id: '1',
      title: 'Opening Track',
      artist: 'Your Band',
      duration: 240,
      bpm: 120,
      key: 'C Major',
      notes: 'High energy opener - full band intro',
      markers: [
        { time: 0, label: 'Intro', color: '#3b82f6' },
        { time: 30, label: 'Verse 1', color: '#10b981' },
        { time: 60, label: 'Chorus', color: '#f59e0b' },
      ],
    },
    {
      id: '2',
      title: 'Crowd Favorite',
      duration: 210,
      bpm: 128,
      key: 'G Major',
      notes: 'Extended outro - crowd sing-along',
    },
    {
      id: '3',
      title: 'Ballad',
      duration: 300,
      bpm: 72,
      key: 'A Minor',
      notes: 'Acoustic intro - dimmed lights',
    },
  ]);

  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [songProgress, setSongProgress] = useState(0);

  const [effectPresets] = useState<EffectPreset[]>([
    { id: '1', name: 'Clean', category: 'Guitar', parameters: { gain: 0.3, reverb: 0.2, delay: 0 } },
    { id: '2', name: 'Crunch', category: 'Guitar', parameters: { gain: 0.6, reverb: 0.3, delay: 0.1 } },
    { id: '3', name: 'Lead', category: 'Guitar', parameters: { gain: 0.8, reverb: 0.4, delay: 0.3 } },
    { id: '4', name: 'Vocal Dry', category: 'Vocal', parameters: { reverb: 0.1, delay: 0, compression: 0.5 } },
    { id: '5', name: 'Vocal Wet', category: 'Vocal', parameters: { reverb: 0.5, delay: 0.2, compression: 0.6 } },
  ]);
  const [activePreset, setActivePreset] = useState<string>('1');

  const [effectValues, setEffectValues] = useState({
    masterVolume: 0.8,
    reverbMix: 0.3,
    delayMix: 0.2,
    compression: 0.5,
    eqLow: 0,
    eqMid: 0,
    eqHigh: 0,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  const progressIntervalRef = useRef<number | null>(null);

  const currentSong = useMemo(() => setlist[currentSongIndex], [setlist, currentSongIndex]);

  useEffect(() => {
    if (currentSong) {
      setTempo(currentSong.bpm);
    }
  }, [currentSong, setTempo]);

  useEffect(() => {
    if (isPlaying && currentSong) {
      progressIntervalRef.current = window.setInterval(() => {
        setSongProgress((prev) => {
          const newProgress = prev + 0.1;
          if (newProgress >= currentSong.duration) {
            handleNextSong();
            return 0;
          }
          return newProgress;
        });
      }, 100);
    } else {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    }
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [isPlaying, currentSong]);

  useEffect(() => {
    if (metronomeEnabled && isPlaying) {
      metronome.start();
    } else {
      metronome.stop();
    }
  }, [isPlaying, metronomeEnabled, metronome]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
    setEmergencyStopActive(false);
    toast({ title: 'Playing', description: `Now playing: ${currentSong?.title}` });
  }, [setIsPlaying, currentSong, toast]);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
  }, [setIsPlaying]);

  const handleStop = useCallback(() => {
    setIsPlaying(false);
    setSongProgress(0);
  }, [setIsPlaying]);

  const handleEmergencyStop = useCallback(() => {
    setIsPlaying(false);
    setSongProgress(0);
    setEmergencyStopActive(true);
    metronome.stop();
    toast({
      title: 'Emergency Stop',
      description: 'All playback has been stopped immediately',
      variant: 'destructive',
    });
  }, [setIsPlaying, metronome, toast]);

  const handleNextSong = useCallback(() => {
    if (currentSongIndex < setlist.length - 1) {
      setIsPlaying(false);
      setSongProgress(0);
      setCountdownSeconds(countdownBetweenSongs);

      countdownIntervalRef.current = window.setInterval(() => {
        setCountdownSeconds((prev) => {
          if (prev === null || prev <= 1) {
            if (countdownIntervalRef.current) {
              clearInterval(countdownIntervalRef.current);
            }
            setCurrentSongIndex((i) => i + 1);
            setIsPlaying(true);
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      handleStop();
      toast({ title: 'Set Complete', description: 'You have finished the setlist!' });
    }
  }, [currentSongIndex, setlist.length, countdownBetweenSongs, setIsPlaying, handleStop, toast]);

  const handlePreviousSong = useCallback(() => {
    if (currentSongIndex > 0) {
      setCurrentSongIndex((i) => i - 1);
      setSongProgress(0);
    }
  }, [currentSongIndex]);

  const moveSong = useCallback((index: number, direction: 'up' | 'down') => {
    const newSetlist = [...setlist];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex >= 0 && targetIndex < newSetlist.length) {
      [newSetlist[index], newSetlist[targetIndex]] = [newSetlist[targetIndex], newSetlist[index]];
      setSetlist(newSetlist);
    }
  }, [setlist]);

  const deleteSong = useCallback((id: string) => {
    setSetlist((prev) => prev.filter((s) => s.id !== id));
    toast({ title: 'Song removed from setlist' });
  }, [toast]);

  const selectSong = useCallback((index: number) => {
    setCurrentSongIndex(index);
    setSongProgress(0);
    if (isPlaying) {
      setIsPlaying(false);
    }
  }, [isPlaying, setIsPlaying]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const applyPreset = useCallback((presetId: string) => {
    const preset = effectPresets.find((p) => p.id === presetId);
    if (preset) {
      setActivePreset(presetId);
      toast({ title: 'Preset Applied', description: preset.name });
    }
  }, [effectPresets, toast]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div
        ref={containerRef}
        className={`min-h-screen bg-gray-950 text-white flex flex-col ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}
      >
        <header className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-4">
            <Music className="w-6 h-6 text-primary" />
            <span className="font-bold text-lg">Show Mode</span>
            <Badge variant="outline" className="border-green-500 text-green-400">
              <Radio className="w-3 h-3 mr-1" />
              LIVE
            </Badge>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 rounded-lg">
              <Timer className="w-4 h-4 text-blue-400" />
              <span className="font-mono text-xl font-bold">{tempo}</span>
              <span className="text-gray-400 text-sm">BPM</span>
            </div>

            {currentSong && (
              <div className="text-center">
                <div className="text-sm text-gray-400">Now Playing</div>
                <div className="font-semibold">{currentSong.title}</div>
              </div>
            )}

            <div className="flex items-center gap-2 font-mono text-xl">
              <span className="text-gray-400">{formatTime(songProgress)}</span>
              <span className="text-gray-600">/</span>
              <span>{formatTime(currentSong?.duration || 0)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setRemoteControlEnabled(!remoteControlEnabled)}
                  className={remoteControlEnabled ? 'text-green-400' : 'text-gray-400'}
                >
                  {remoteControlEnabled ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remote Control ({remoteControlEnabled ? 'On' : 'Off'})</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => setShowSettings(true)}>
                  <Settings className="w-5 h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Settings</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={toggleFullscreen}>
                  {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</TooltipContent>
            </Tooltip>
          </div>
        </header>

        {countdownSeconds !== null && (
          <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center">
            <div className="text-center">
              <div className="text-2xl text-gray-400 mb-4">Next Song</div>
              <div className="text-8xl font-bold text-primary animate-pulse">{countdownSeconds}</div>
              <div className="text-3xl mt-4 text-white">{setlist[currentSongIndex + 1]?.title}</div>
              <div className="text-xl text-gray-400 mt-2">
                {setlist[currentSongIndex + 1]?.bpm} BPM • {setlist[currentSongIndex + 1]?.key}
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 flex overflow-hidden">
          <aside className="w-72 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
            <div className="p-3 border-b border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListMusic className="w-4 h-4" />
                <span className="font-semibold">Setlist</span>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowAddSongDialog(true)}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {setlist.map((song, index) => (
                  <div
                    key={song.id}
                    onClick={() => selectSong(index)}
                    className={`group p-3 rounded-lg cursor-pointer transition-all ${
                      index === currentSongIndex
                        ? 'bg-primary/20 border border-primary/50'
                        : 'bg-gray-800/50 hover:bg-gray-800 border border-transparent'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-5">{index + 1}</span>
                        <div>
                          <div className="font-medium text-sm">{song.title}</div>
                          <div className="text-xs text-gray-400 flex items-center gap-2 mt-0.5">
                            <span>{formatTime(song.duration)}</span>
                            <span>•</span>
                            <span>{song.bpm} BPM</span>
                            {song.key && (
                              <>
                                <span>•</span>
                                <span>{song.key}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => { e.stopPropagation(); moveSong(index, 'up'); }}
                          disabled={index === 0}
                        >
                          <ChevronUp className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => { e.stopPropagation(); moveSong(index, 'down'); }}
                          disabled={index === setlist.length - 1}
                        >
                          <ChevronDown className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-red-400 hover:text-red-300"
                          onClick={(e) => { e.stopPropagation(); deleteSong(song.id); }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    {song.notes && (
                      <div className="mt-2 text-xs text-gray-500 flex items-start gap-1">
                        <MessageSquare className="w-3 h-3 mt-0.5 shrink-0" />
                        <span className="line-clamp-2">{song.notes}</span>
                      </div>
                    )}
                    {index === currentSongIndex && isPlaying && (
                      <Progress
                        value={(songProgress / song.duration) * 100}
                        className="mt-2 h-1"
                      />
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </aside>

          <main className="flex-1 flex flex-col overflow-hidden">
            <div className="h-20 bg-gray-900/50 border-b border-gray-800 flex items-center justify-center gap-4 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-12 w-12"
                onClick={handlePreviousSong}
                disabled={currentSongIndex === 0}
              >
                <SkipBack className="w-6 h-6" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="h-12 w-12"
                onClick={handleStop}
              >
                <Square className="w-6 h-6" />
              </Button>

              <Button
                className={`h-16 w-16 rounded-full ${isPlaying ? 'bg-primary hover:bg-primary/80' : 'bg-green-600 hover:bg-green-700'}`}
                onClick={() => (isPlaying ? handlePause() : handlePlay())}
              >
                {isPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8 ml-1" />}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="h-12 w-12"
                onClick={handleNextSong}
                disabled={currentSongIndex === setlist.length - 1}
              >
                <SkipForward className="w-6 h-6" />
              </Button>

              <Separator orientation="vertical" className="h-8 mx-4" />

              <Button
                variant={metronomeEnabled ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setMetronomeEnabled(!metronomeEnabled)}
                className={metronomeEnabled ? 'bg-blue-600 hover:bg-blue-700' : ''}
              >
                <Headphones className="w-4 h-4 mr-2" />
                Click Track
              </Button>

              <Separator orientation="vertical" className="h-8 mx-4" />

              <Button
                variant="destructive"
                size="lg"
                className="bg-red-600 hover:bg-red-700 font-bold px-6"
                onClick={handleEmergencyStop}
              >
                <StopCircle className="w-5 h-5 mr-2" />
                EMERGENCY STOP
              </Button>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {teleprompterVisible && (
                <div className="flex-1 bg-black p-6 flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-blue-400" />
                      <span className="font-semibold">Teleprompter</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setTeleprompterFontSize((s) => Math.max(16, s - 4))}>
                        <span className="text-xs">A-</span>
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setTeleprompterFontSize((s) => Math.min(64, s + 4))}>
                        <span className="text-lg">A+</span>
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setTeleprompterVisible(false)}>
                        <EyeOff className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <ScrollArea className="flex-1">
                    <div
                      className="text-center leading-relaxed text-gray-300"
                      style={{ fontSize: teleprompterFontSize }}
                    >
                      {currentSong?.notes ? (
                        <div className="whitespace-pre-wrap">{currentSong.notes}</div>
                      ) : (
                        <div className="text-gray-500 italic">No lyrics or notes for this song</div>
                      )}
                    </div>
                  </ScrollArea>

                  {currentSong?.markers && currentSong.markers.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-800">
                      <div className="text-sm text-gray-400 mb-2">Song Markers</div>
                      <div className="flex flex-wrap gap-2">
                        {currentSong.markers.map((marker, i) => (
                          <Badge
                            key={i}
                            variant="outline"
                            style={{ borderColor: marker.color, color: marker.color }}
                            className="cursor-pointer hover:opacity-80"
                            onClick={() => setSongProgress(marker.time)}
                          >
                            {formatTime(marker.time)} - {marker.label}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {effectsPanelVisible && (
                <div className="w-80 bg-gray-900 border-l border-gray-800 flex flex-col shrink-0">
                  <div className="p-3 border-b border-gray-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-purple-400" />
                      <span className="font-semibold">Effects Control</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEffectsPanelVisible(false)}>
                      <EyeOff className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="p-4 border-b border-gray-800">
                    <Label className="text-xs text-gray-400 mb-2 block">Quick Presets</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {effectPresets.map((preset) => (
                        <Button
                          key={preset.id}
                          variant={activePreset === preset.id ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => applyPreset(preset.id)}
                          className="text-xs"
                        >
                          {preset.name}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <ScrollArea className="flex-1">
                    <div className="p-4 space-y-6">
                      <div>
                        <Label className="text-xs text-gray-400 mb-3 flex items-center justify-between">
                          <span>Master Volume</span>
                          <span className="font-mono">{Math.round(effectValues.masterVolume * 100)}%</span>
                        </Label>
                        <Slider
                          value={[effectValues.masterVolume]}
                          max={1}
                          step={0.01}
                          onValueChange={([v]) => setEffectValues((p) => ({ ...p, masterVolume: v }))}
                        />
                      </div>

                      <Separator />

                      <div>
                        <Label className="text-xs text-gray-400 mb-3 flex items-center justify-between">
                          <span>Reverb Mix</span>
                          <span className="font-mono">{Math.round(effectValues.reverbMix * 100)}%</span>
                        </Label>
                        <Slider
                          value={[effectValues.reverbMix]}
                          max={1}
                          step={0.01}
                          onValueChange={([v]) => setEffectValues((p) => ({ ...p, reverbMix: v }))}
                        />
                      </div>

                      <div>
                        <Label className="text-xs text-gray-400 mb-3 flex items-center justify-between">
                          <span>Delay Mix</span>
                          <span className="font-mono">{Math.round(effectValues.delayMix * 100)}%</span>
                        </Label>
                        <Slider
                          value={[effectValues.delayMix]}
                          max={1}
                          step={0.01}
                          onValueChange={([v]) => setEffectValues((p) => ({ ...p, delayMix: v }))}
                        />
                      </div>

                      <div>
                        <Label className="text-xs text-gray-400 mb-3 flex items-center justify-between">
                          <span>Compression</span>
                          <span className="font-mono">{Math.round(effectValues.compression * 100)}%</span>
                        </Label>
                        <Slider
                          value={[effectValues.compression]}
                          max={1}
                          step={0.01}
                          onValueChange={([v]) => setEffectValues((p) => ({ ...p, compression: v }))}
                        />
                      </div>

                      <Separator />

                      <div className="space-y-3">
                        <Label className="text-xs text-gray-400">EQ</Label>
                        <div className="flex justify-between gap-4">
                          <div className="flex-1 text-center">
                            <div className="text-xs text-gray-500 mb-1">Low</div>
                            <Slider
                              orientation="vertical"
                              value={[effectValues.eqLow + 12]}
                              max={24}
                              step={0.5}
                              className="h-24 mx-auto"
                              onValueChange={([v]) => setEffectValues((p) => ({ ...p, eqLow: v - 12 }))}
                            />
                            <div className="text-xs font-mono mt-1">{effectValues.eqLow > 0 ? '+' : ''}{effectValues.eqLow}dB</div>
                          </div>
                          <div className="flex-1 text-center">
                            <div className="text-xs text-gray-500 mb-1">Mid</div>
                            <Slider
                              orientation="vertical"
                              value={[effectValues.eqMid + 12]}
                              max={24}
                              step={0.5}
                              className="h-24 mx-auto"
                              onValueChange={([v]) => setEffectValues((p) => ({ ...p, eqMid: v - 12 }))}
                            />
                            <div className="text-xs font-mono mt-1">{effectValues.eqMid > 0 ? '+' : ''}{effectValues.eqMid}dB</div>
                          </div>
                          <div className="flex-1 text-center">
                            <div className="text-xs text-gray-500 mb-1">High</div>
                            <Slider
                              orientation="vertical"
                              value={[effectValues.eqHigh + 12]}
                              max={24}
                              step={0.5}
                              className="h-24 mx-auto"
                              onValueChange={([v]) => setEffectValues((p) => ({ ...p, eqHigh: v - 12 }))}
                            />
                            <div className="text-xs font-mono mt-1">{effectValues.eqHigh > 0 ? '+' : ''}{effectValues.eqHigh}dB</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>

            {(!teleprompterVisible || !effectsPanelVisible) && (
              <div className="absolute bottom-4 right-4 flex gap-2">
                {!teleprompterVisible && (
                  <Button variant="outline" size="sm" onClick={() => setTeleprompterVisible(true)}>
                    <FileText className="w-4 h-4 mr-2" />
                    Show Teleprompter
                  </Button>
                )}
                {!effectsPanelVisible && (
                  <Button variant="outline" size="sm" onClick={() => setEffectsPanelVisible(true)}>
                    <Sliders className="w-4 h-4 mr-2" />
                    Show Effects
                  </Button>
                )}
              </div>
            )}
          </main>
        </div>

        {remoteControlEnabled && connectedDevices.length > 0 && (
          <div className="h-10 bg-gray-900 border-t border-gray-800 px-4 flex items-center gap-4">
            <Tablet className="w-4 h-4 text-green-400" />
            <span className="text-sm text-gray-400">
              {connectedDevices.length} device(s) connected
            </span>
            {connectedDevices.map((device) => (
              <Badge key={device.id} variant="outline" className="border-green-500/50 text-green-400">
                {device.name}
              </Badge>
            ))}
          </div>
        )}

        <Dialog open={showSettings} onOpenChange={setShowSettings}>
          <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-md">
            <DialogHeader>
              <DialogTitle>Show Settings</DialogTitle>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div>
                <Label className="text-sm text-gray-400">Countdown Between Songs</Label>
                <div className="flex items-center gap-2 mt-2">
                  <Slider
                    value={[countdownBetweenSongs]}
                    min={0}
                    max={30}
                    step={1}
                    onValueChange={([v]) => setCountdownBetweenSongs(v)}
                    className="flex-1"
                  />
                  <span className="w-12 text-right font-mono">{countdownBetweenSongs}s</span>
                </div>
              </div>

              <div>
                <Label className="text-sm text-gray-400">Click Track Output</Label>
                <Select value={clickTrackOutput} onValueChange={setClickTrackOutput}>
                  <SelectTrigger className="mt-2 bg-gray-800 border-gray-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    <SelectItem value="default">Default Output</SelectItem>
                    <SelectItem value="headphones">Headphones Only</SelectItem>
                    <SelectItem value="output-2">Output 2</SelectItem>
                    <SelectItem value="output-3">Output 3</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm text-gray-400">Main Output</Label>
                <Select value={mainOutput} onValueChange={setMainOutput}>
                  <SelectTrigger className="mt-2 bg-gray-800 border-gray-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    <SelectItem value="default">Default Output</SelectItem>
                    <SelectItem value="output-1">Output 1</SelectItem>
                    <SelectItem value="output-2">Output 2</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm text-gray-400">Click Track Volume</Label>
                <div className="flex items-center gap-2 mt-2">
                  <VolumeX className="w-4 h-4 text-gray-500" />
                  <Slider
                    value={[metronomeVolume]}
                    max={1}
                    step={0.01}
                    onValueChange={([v]) => setMetronomeVolume(v)}
                    className="flex-1"
                  />
                  <Volume2 className="w-4 h-4 text-gray-500" />
                </div>
              </div>

              <Separator className="bg-gray-800" />

              <div className="flex items-center justify-between">
                <Label className="text-sm">Remote Control</Label>
                <Switch
                  checked={remoteControlEnabled}
                  onCheckedChange={setRemoteControlEnabled}
                />
              </div>

              {remoteControlEnabled && (
                <div className="p-3 bg-gray-800 rounded-lg">
                  <div className="text-sm text-gray-400 mb-2">Companion App</div>
                  <div className="text-xs text-gray-500">
                    Open the Max Booster companion app on your tablet or phone to connect.
                    Make sure both devices are on the same network.
                  </div>
                  <Badge variant="outline" className="mt-2 border-blue-500/50 text-blue-400">
                    Session Code: {Math.random().toString(36).substring(2, 8).toUpperCase()}
                  </Badge>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => setShowSettings(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showAddSongDialog} onOpenChange={setShowAddSongDialog}>
          <DialogContent className="bg-gray-900 border-gray-800 text-white">
            <DialogHeader>
              <DialogTitle>Add Song to Setlist</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Title</Label>
                <Input className="mt-1 bg-gray-800 border-gray-700" placeholder="Song title" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>BPM</Label>
                  <Input type="number" className="mt-1 bg-gray-800 border-gray-700" defaultValue={120} />
                </div>
                <div>
                  <Label>Key</Label>
                  <Input className="mt-1 bg-gray-800 border-gray-700" placeholder="C Major" />
                </div>
              </div>
              <div>
                <Label>Duration (seconds)</Label>
                <Input type="number" className="mt-1 bg-gray-800 border-gray-700" defaultValue={240} />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea className="mt-1 bg-gray-800 border-gray-700" placeholder="Performance notes..." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowAddSongDialog(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  const newSong: SetlistSong = {
                    id: Date.now().toString(),
                    title: 'New Song',
                    duration: 240,
                    bpm: 120,
                  };
                  setSetlist([...setlist, newSong]);
                  setShowAddSongDialog(false);
                  toast({ title: 'Song added to setlist' });
                }}
              >
                Add Song
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
