import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { VolumeX, Headphones, Music, Mic, Settings2, Maximize2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import AudioEngine from '@/lib/audioEngine';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { ProfessionalFader } from './ProfessionalFader';
import { Knob } from './Knob';
import { VUMeter } from './VUMeter';
import { SpectrumAnalyzer } from './SpectrumAnalyzer';
import { logger } from '@/lib/logger';

const audioEngine = AudioEngine.getInstance();

interface StudioTrack {
  id: string;
  name: string;
  trackType: 'audio' | 'midi' | 'instrument';
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  color: string;
  effects?: {
    eq?: {
      lowGain: number;
      midGain: number;
      highGain: number;
      midFrequency: number;
      bypass?: boolean;
    };
    compressor?: {
      threshold: number;
      ratio: number;
      attack: number;
      release: number;
      bypass?: boolean;
    };
    reverb?: { mix: number; irId?: string; bypass?: boolean };
  };
}

interface MixerPanelProps {
  tracks: StudioTrack[];
  projectId?: string;
  onMuteToggle: (trackId: string) => void;
  onSoloToggle: (trackId: string) => void;
  onVolumeChange: (trackId: string, volume: number) => void;
  onPanChange: (trackId: string, pan: number) => void;
  onMasterVolumeChange: (volume: number) => void;
}

interface TrackEffects {
  eq: {
    lowGain: number;
    midGain: number;
    highGain: number;
    midFrequency: number;
    bypass: boolean;
  };
  compressor: {
    threshold: number;
    ratio: number;
    attack: number;
    release: number;
    bypass: boolean;
  };
  reverb: {
    mix: number;
    irId: string;
    bypass: boolean;
  };
}

const defaultEffects: TrackEffects = {
  eq: {
    lowGain: 0,
    midGain: 0,
    highGain: 0,
    midFrequency: 1000,
    bypass: false,
  },
  compressor: {
    threshold: -24,
    ratio: 3,
    attack: 10,
    release: 200,
    bypass: false,
  },
  reverb: {
    mix: 0.2,
    irId: 'default',
    bypass: false,
  },
};

/**
 * TODO: Add function documentation
 */
export function MixerPanel({
  tracks,
  projectId,
  onMuteToggle,
  onSoloToggle,
  onVolumeChange,
  onPanChange,
  onMasterVolumeChange,
}: MixerPanelProps) {
  const { toast } = useToast();
  const [masterVolume, setMasterVolume] = useState(0.8);
  const [trackEffects, setTrackEffects] = useState<Record<string, TrackEffects>>(() =>
    tracks.reduce(
      (acc, track) => ({
        ...acc,
        [track.id]: track.effects
          ? {
              eq: { ...defaultEffects.eq, ...(track.effects.eq || {}) },
              compressor: { ...defaultEffects.compressor, ...(track.effects.compressor || {}) },
              reverb: { ...defaultEffects.reverb, ...(track.effects.reverb || {}) },
            }
          : { ...defaultEffects },
      }),
      {}
    )
  );

  // Resync trackEffects when tracks prop updates (handles async TanStack Query data)
  useEffect(() => {
    setTrackEffects((prev) => {
      const updated: Record<string, TrackEffects> = {};
      tracks.forEach((track) => {
        // Merge incoming track.effects with defaults, preserving existing state for unchanged tracks
        updated[track.id] = track.effects
          ? {
              eq: { ...defaultEffects.eq, ...(track.effects.eq || {}) },
              compressor: { ...defaultEffects.compressor, ...(track.effects.compressor || {}) },
              reverb: { ...defaultEffects.reverb, ...(track.effects.reverb || {}) },
            }
          : prev[track.id] || { ...defaultEffects };
      });
      return updated;
    });
  }, [tracks]);

  const updateEffectsMutation = useMutation({
    mutationFn: async ({
      trackId,
      effects,
    }: {
      trackId: string;
      effects: Partial<TrackEffects>;
    }) => {
      if (!projectId) {
        throw new Error('Project ID is required');
      }
      await apiRequest('PATCH', `/api/projects/${projectId}/tracks/${trackId}/effects`, effects);
    },
    onSuccess: () => {
      // Invalidate tracks query to refetch and keep cache in sync
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ['/api/studio/projects', projectId, 'tracks'] });
      }
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to save effects: ${error.message}`,
        variant: 'destructive',
      });
    },
  });

  const updateEQ = (trackId: string, field: keyof TrackEffects['eq'], value: number | boolean) => {
    setTrackEffects((prev) => {
      const updated = {
        ...prev,
        [trackId]: {
          ...prev[trackId],
          eq: {
            ...prev[trackId].eq,
            [field]: value,
          },
        },
      };

      const eq = updated[trackId].eq;
      audioEngine.updateTrackEQ(trackId, {
        lowGain: eq.lowGain,
        midGain: eq.midGain,
        highGain: eq.highGain,
        midFrequency: eq.midFrequency,
        bypass: eq.bypass,
      });

      updateEffectsMutation.mutate({
        trackId,
        effects: { eq },
      });

      return updated;
    });
  };

  const updateCompressor = (
    trackId: string,
    field: keyof TrackEffects['compressor'],
    value: number | boolean
  ) => {
    setTrackEffects((prev) => {
      const updated = {
        ...prev,
        [trackId]: {
          ...prev[trackId],
          compressor: {
            ...prev[trackId].compressor,
            [field]: value,
          },
        },
      };

      const comp = updated[trackId].compressor;
      audioEngine.updateTrackCompressor(trackId, {
        threshold: comp.threshold,
        ratio: comp.ratio,
        attack: comp.attack,
        release: comp.release,
        knee: 6,
        bypass: comp.bypass,
      });

      updateEffectsMutation.mutate({
        trackId,
        effects: { compressor: comp },
      });

      return updated;
    });
  };

  const updateReverb = (
    trackId: string,
    field: keyof TrackEffects['reverb'],
    value: number | string | boolean
  ) => {
    setTrackEffects((prev) => {
      const updated = {
        ...prev,
        [trackId]: {
          ...prev[trackId],
          reverb: {
            ...prev[trackId].reverb,
            [field]: value,
          },
        },
      };

      const reverb = updated[trackId].reverb;
      audioEngine.updateTrackReverb(trackId, {
        mix: reverb.mix,
        decay: 2.0,
        preDelay: 0,
        irId: reverb.irId,
        bypass: reverb.bypass,
      });

      updateEffectsMutation.mutate({
        trackId,
        effects: { reverb },
      });

      return updated;
    });
  };

  // Simulated level meters (in production, these would come from audio analysis)
  const [trackLevels, setTrackLevels] = useState<Record<string, { level: number; peak: number }>>(
    {}
  );
  const [masterAnalyser, setMasterAnalyser] = useState<AnalyserNode | null>(null);

  // Initialize master analyser
  useEffect(() => {
    const initAnalyser = async () => {
      try {
        await audioEngine.initialize();
        const analyser = audioEngine.getMasterAnalyser();
        setMasterAnalyser(analyser);
      } catch (error: unknown) {
        logger.error('Failed to initialize audio analyser:', error);
      }
    };
    initAnalyser();
  }, []);

  // Simulate audio levels (in production, connect to actual audio analysis)
  useEffect(() => {
    const interval = setInterval(() => {
      setTrackLevels((prev) => {
        const updated: typeof prev = {};
        tracks.forEach((track) => {
          const baseLevel = track.mute ? -60 : -20 + (Math.random() * 15 - 7.5);
          const peak = track.mute ? -60 : Math.max(baseLevel, prev[track.id]?.peak ?? -60) - 0.5;
          updated[track.id] = {
            level: baseLevel,
            peak: peak > baseLevel ? peak : baseLevel,
          };
        });
        return updated;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [tracks]);

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1">
        <motion.div
          className="p-2 sm:p-4 flex gap-2 sm:gap-3 overflow-x-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {tracks.map((track, index) => {
            const effects = trackEffects[track.id] || defaultEffects;
            const levels = trackLevels[track.id] || { level: -60, peak: -60 };

            return (
              <motion.div
                key={track.id}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: index * 0.05, duration: 0.3 }}
              >
                <Card
                  className="w-44 sm:w-56 md:w-72 border-gray-700 overflow-hidden group shrink-0"
                  style={{
                    background: 'var(--studio-panel)',
                    borderColor: 'var(--studio-border)',
                  }}
                >
                  {/* Track Color Strip */}
                  <div className="h-1 w-full" style={{ background: track.color }} />

                  <CardContent className="p-2 sm:p-4 flex flex-col gap-2 sm:gap-4">
                    {/* Track Header */}
                    <motion.div
                      className="flex items-center justify-between"
                      whileHover={{ scale: 1.02 }}
                      transition={{ type: 'spring', stiffness: 400 }}
                    >
                      <div className="flex items-center gap-2">
                        {track.trackType === 'audio' && (
                          <Music className="w-3 h-3" style={{ color: track.color }} />
                        )}
                        {track.trackType === 'instrument' && (
                          <Mic className="w-3 h-3" style={{ color: track.color }} />
                        )}
                        <div
                          className="text-sm font-medium truncate"
                          style={{ color: 'var(--studio-text)' }}
                          data-testid={`text-track-name-${track.id}`}
                        >
                          {track.name}
                        </div>
                      </div>
                      <Settings2
                        className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        style={{ color: 'var(--studio-text-muted)' }}
                      />
                    </motion.div>

                    {/* VU Meter */}
                    <div className="flex justify-center">
                      <VUMeter
                        level={levels.level}
                        peak={levels.peak}
                        width={180}
                        height={50}
                        style="modern"
                        showScale={false}
                      />
                    </div>

                    {/* Professional Volume Fader with LED Meter */}
                    <div className="flex justify-center">
                      <ProfessionalFader
                        value={track.volume}
                        onChange={(value) => onVolumeChange(track.id, value)}
                        label="VOL"
                        height={150}
                        showMeter={true}
                        meterLevel={levels.level}
                        peakLevel={levels.peak}
                        data-testid={`slider-volume-${track.id}`}
                      />
                    </div>

                    {/* Pan Knob */}
                    <div className="flex justify-center">
                      <Knob
                        value={track.pan}
                        onChange={(value) => onPanChange(track.id, value)}
                        label="PAN"
                        size={48}
                        min={-1}
                        max={1}
                        defaultValue={0}
                        bipolar={true}
                        color={track.color}
                        data-testid={`slider-pan-${track.id}`}
                      />
                    </div>

                    {/* Mute/Solo Buttons with Animation */}
                    <div className="flex gap-1 sm:gap-2 justify-center">
                      <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                        <Button
                          size="sm"
                          variant={track.mute ? 'destructive' : 'ghost'}
                          className="h-9 sm:h-8 px-2 sm:px-3 transition-all touch-manipulation"
                          onClick={() => onMuteToggle(track.id)}
                          data-testid={`button-mixer-mute-${track.id}`}
                          style={{
                            background: track.mute ? '#ef4444' : 'transparent',
                            borderColor: track.mute ? '#ef4444' : 'var(--studio-border)',
                          }}
                        >
                          <VolumeX className="h-3 w-3 sm:mr-1" />
                          <span className="text-[10px] sm:text-xs hidden sm:inline">MUTE</span>
                        </Button>
                      </motion.div>
                      <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                        <Button
                          size="sm"
                          variant={track.solo ? 'default' : 'ghost'}
                          className="h-9 sm:h-8 px-2 sm:px-3 transition-all touch-manipulation"
                          onClick={() => onSoloToggle(track.id)}
                          data-testid={`button-mixer-solo-${track.id}`}
                          style={{
                            background: track.solo ? '#fbbf24' : 'transparent',
                            borderColor: track.solo ? '#fbbf24' : 'var(--studio-border)',
                            color: track.solo ? '#000' : 'var(--studio-text)',
                          }}
                        >
                          <Headphones className="h-3 w-3 sm:mr-1" />
                          <span className="text-[10px] sm:text-xs hidden sm:inline">SOLO</span>
                        </Button>
                      </motion.div>
                    </div>

                    <Accordion type="single" collapsible className="w-full">
                      <AccordionItem value="effects" className="border-gray-700">
                        <AccordionTrigger className="text-xs text-gray-300 py-2 hover:text-white">
                          Effects
                        </AccordionTrigger>
                        <AccordionContent className="space-y-4 pt-2">
                          {/* EQ Section with Professional Knobs */}
                          <motion.div
                            className="space-y-3 pb-3 border-b"
                            style={{ borderColor: 'var(--studio-border)' }}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.1 }}
                            data-testid={`effect-slot-${track.id}-eq`}
                          >
                            <div className="flex items-center justify-between">
                              <Label
                                className="text-xs"
                                style={{ color: 'var(--studio-text-muted)' }}
                              >
                                3-BAND EQ
                              </Label>
                              <motion.div
                                className="flex items-center gap-2"
                                whileHover={{ scale: 1.05 }}
                              >
                                <Label
                                  htmlFor={`eq-bypass-${track.id}`}
                                  className="text-xs"
                                  style={{ color: 'var(--studio-text-muted)' }}
                                >
                                  Bypass
                                </Label>
                                <Switch
                                  id={`eq-bypass-${track.id}`}
                                  checked={effects.eq.bypass}
                                  onCheckedChange={(checked) =>
                                    updateEQ(track.id, 'bypass', checked)
                                  }
                                  data-testid={`toggle-eq-bypass-${track.id}`}
                                />
                              </motion.div>
                            </div>

                            {/* EQ Knobs Row */}
                            <div className="flex justify-around items-center py-2">
                              {/* Low Frequency Knob */}
                              <div className="flex flex-col items-center">
                                <Knob
                                  value={effects.eq.lowGain}
                                  onChange={(value) => updateEQ(track.id, 'lowGain', value)}
                                  label="LOW"
                                  size={42}
                                  min={-12}
                                  max={12}
                                  defaultValue={0}
                                  unit="dB"
                                  color="#3498db"
                                />
                              </div>

                              {/* Mid Frequency Knob */}
                              <div className="flex flex-col items-center">
                                <Knob
                                  value={effects.eq.midGain}
                                  onChange={(value) => updateEQ(track.id, 'midGain', value)}
                                  label="MID"
                                  size={42}
                                  min={-12}
                                  max={12}
                                  defaultValue={0}
                                  unit="dB"
                                  color="#2ecc71"
                                />
                                {/* Mid Frequency Control */}
                                <Knob
                                  value={effects.eq.midFrequency}
                                  onChange={(value) => updateEQ(track.id, 'midFrequency', value)}
                                  label="FREQ"
                                  size={32}
                                  min={200}
                                  max={8000}
                                  defaultValue={1000}
                                  displayValue={`${Math.round((effects.eq.midFrequency / 1000) * 10) / 10}kHz`}
                                  color="#95a5a6"
                                />
                              </div>

                              {/* High Frequency Knob */}
                              <div className="flex flex-col items-center">
                                <Knob
                                  value={effects.eq.highGain}
                                  onChange={(value) => updateEQ(track.id, 'highGain', value)}
                                  label="HIGH"
                                  size={42}
                                  min={-12}
                                  max={12}
                                  defaultValue={0}
                                  unit="dB"
                                  color="#f39c12"
                                />
                              </div>
                            </div>
                          </motion.div>

                          {/* Compressor Section */}
                          <div
                            className="space-y-3 pb-3 border-b border-gray-700"
                            data-testid={`effect-slot-${track.id}-compressor`}
                          >
                            <div className="flex items-center justify-between">
                              <Label className="text-xs text-gray-400">Compressor</Label>
                              <div className="flex items-center gap-2">
                                <Label
                                  htmlFor={`comp-bypass-${track.id}`}
                                  className="text-xs text-gray-400"
                                >
                                  Bypass
                                </Label>
                                <Switch
                                  id={`comp-bypass-${track.id}`}
                                  checked={effects.compressor.bypass}
                                  onCheckedChange={(checked) =>
                                    updateCompressor(track.id, 'bypass', checked)
                                  }
                                  data-testid={`toggle-comp-bypass-${track.id}`}
                                />
                              </div>
                            </div>

                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-xs">
                                <Label className="text-gray-400">Threshold</Label>
                                <span className="text-gray-300">
                                  {effects.compressor.threshold.toFixed(1)} dB
                                </span>
                              </div>
                              <Slider
                                min={-50}
                                max={0}
                                step={1}
                                value={[effects.compressor.threshold]}
                                onValueChange={([value]) =>
                                  updateCompressor(track.id, 'threshold', value)
                                }
                                data-testid={`slider-comp-threshold-${track.id}`}
                                className="cursor-pointer"
                              />
                            </div>

                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-xs">
                                <Label className="text-gray-400">Ratio</Label>
                                <span className="text-gray-300">
                                  {effects.compressor.ratio.toFixed(1)}:1
                                </span>
                              </div>
                              <Slider
                                min={1}
                                max={10}
                                step={0.5}
                                value={[effects.compressor.ratio]}
                                onValueChange={([value]) =>
                                  updateCompressor(track.id, 'ratio', value)
                                }
                                data-testid={`slider-comp-ratio-${track.id}`}
                                className="cursor-pointer"
                              />
                            </div>

                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-xs">
                                <Label className="text-gray-400">Attack</Label>
                                <span className="text-gray-300">
                                  {effects.compressor.attack.toFixed(1)} ms
                                </span>
                              </div>
                              <Slider
                                min={3}
                                max={30}
                                step={1}
                                value={[effects.compressor.attack]}
                                onValueChange={([value]) =>
                                  updateCompressor(track.id, 'attack', value)
                                }
                                data-testid={`slider-comp-attack-${track.id}`}
                                className="cursor-pointer"
                              />
                            </div>

                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-xs">
                                <Label className="text-gray-400">Release</Label>
                                <span className="text-gray-300">
                                  {effects.compressor.release.toFixed(0)} ms
                                </span>
                              </div>
                              <Slider
                                min={60}
                                max={600}
                                step={10}
                                value={[effects.compressor.release]}
                                onValueChange={([value]) =>
                                  updateCompressor(track.id, 'release', value)
                                }
                                data-testid={`slider-comp-release-${track.id}`}
                                className="cursor-pointer"
                              />
                            </div>
                          </div>

                          {/* Reverb Section */}
                          <div className="space-y-3" data-testid={`effect-slot-${track.id}-reverb`}>
                            <div className="flex items-center justify-between">
                              <Label className="text-xs text-gray-400">Reverb</Label>
                              <div className="flex items-center gap-2">
                                <Label
                                  htmlFor={`reverb-bypass-${track.id}`}
                                  className="text-xs text-gray-400"
                                >
                                  Bypass
                                </Label>
                                <Switch
                                  id={`reverb-bypass-${track.id}`}
                                  checked={effects.reverb.bypass}
                                  onCheckedChange={(checked) =>
                                    updateReverb(track.id, 'bypass', checked)
                                  }
                                  data-testid={`toggle-reverb-bypass-${track.id}`}
                                />
                              </div>
                            </div>

                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-xs">
                                <Label className="text-gray-400">Mix</Label>
                                <span className="text-gray-300">
                                  {(effects.reverb.mix * 100).toFixed(0)}%
                                </span>
                              </div>
                              <Slider
                                min={0}
                                max={1}
                                step={0.05}
                                value={[effects.reverb.mix]}
                                onValueChange={([value]) => updateReverb(track.id, 'mix', value)}
                                data-testid={`slider-reverb-mix-${track.id}`}
                                className="cursor-pointer"
                              />
                            </div>

                            <div className="space-y-2">
                              <Label className="text-xs text-gray-400">Impulse Response</Label>
                              <Select
                                value={effects.reverb.irId}
                                onValueChange={(value) => updateReverb(track.id, 'irId', value)}
                              >
                                <SelectTrigger
                                  className="h-8 text-xs"
                                  data-testid={`select-reverb-ir-${track.id}`}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="default">Default</SelectItem>
                                  <SelectItem value="small-room">Small Room</SelectItem>
                                  <SelectItem value="large-hall">Large Hall</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}

          {/* Professional Master Section */}
          <motion.div
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: tracks.length * 0.05 + 0.1, duration: 0.3 }}
          >
            <Card
              className="w-80 border-2 overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, var(--studio-panel) 0%, #2a2a2f 100%)',
                borderColor: '#fbbf24',
                boxShadow: '0 0 20px rgba(251, 191, 36, 0.2)',
              }}
            >
              {/* Master Header */}
              <div
                className="h-2 w-full"
                style={{ background: 'linear-gradient(90deg, #fbbf24, #f59e0b)' }}
              />

              <CardContent className="p-4 flex flex-col gap-4">
                <motion.div
                  className="flex items-center justify-center gap-2"
                  whileHover={{ scale: 1.02 }}
                >
                  <Maximize2 className="w-4 h-4" style={{ color: '#fbbf24' }} />
                  <div
                    className="text-lg font-bold tracking-wider"
                    style={{ color: '#fbbf24' }}
                    data-testid="text-master-channel"
                  >
                    MASTER BUS
                  </div>
                  <Maximize2 className="w-4 h-4" style={{ color: '#fbbf24' }} />
                </motion.div>

                {/* Master Spectrum Analyzer */}
                <div
                  className="rounded overflow-hidden border"
                  style={{ borderColor: 'var(--studio-border)' }}
                >
                  <SpectrumAnalyzer
                    analyserNode={masterAnalyser}
                    width={280}
                    height={100}
                    barCount={64}
                    style="bars"
                    showGrid={true}
                    showLabels={true}
                    color="var(--meter-gradient-yellow)"
                  />
                </div>

                {/* Master VU Meter */}
                <div className="flex justify-center">
                  <VUMeter
                    level={masterVolume * 66 - 60}
                    peak={masterVolume * 66 - 57}
                    width={240}
                    height={60}
                    style="classic"
                    showScale={true}
                  />
                </div>

                {/* Master Volume Fader */}
                <div className="flex justify-center">
                  <ProfessionalFader
                    value={masterVolume}
                    onChange={(value) => {
                      setMasterVolume(value);
                      onMasterVolumeChange(value);
                    }}
                    onDoubleClick={() => {
                      setMasterVolume(0.75);
                      onMasterVolumeChange(0.75);
                    }}
                    label="MASTER"
                    height={180}
                    showMeter={true}
                    meterLevel={masterVolume * 66 - 60}
                    peakLevel={masterVolume * 66 - 57}
                  />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      </ScrollArea>
    </div>
  );
}
