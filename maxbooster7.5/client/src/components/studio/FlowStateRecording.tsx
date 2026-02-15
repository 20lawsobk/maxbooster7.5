import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
import {
  Mic,
  MicOff,
  Circle,
  Square,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Headphones,
  Settings,
  AlertCircle,
  Check,
  RefreshCw,
  Waves,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface AudioDevice {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
}

interface RecordingSettings {
  inputDevice: string;
  outputDevice: string;
  inputGain: number;
  monitorLevel: number;
  monitorEnabled: boolean;
  countIn: number;
  recordingMode: 'normal' | 'punch' | 'loop';
  sampleRate: number;
  bitDepth: number;
}

interface FlowStateRecordingProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trackId: string;
  trackName?: string;
  projectId?: string;
  onRecordingComplete?: (audioBlob: Blob, duration: number) => void;
  onRecordingStart?: () => void;
  onRecordingStop?: () => void;
}

const SAMPLE_RATES = [44100, 48000, 88200, 96000];
const BIT_DEPTHS = [16, 24, 32];
const COUNT_IN_OPTIONS = [0, 1, 2, 4];

export function FlowStateRecording({
  open,
  onOpenChange,
  trackId,
  trackName = 'Audio Track',
  projectId,
  onRecordingComplete,
  onRecordingStart,
  onRecordingStop,
}: FlowStateRecordingProps) {
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [inputLevel, setInputLevel] = useState(0);
  const [peakLevel, setPeakLevel] = useState(0);
  const [isClipping, setIsClipping] = useState(false);
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [countdownValue, setCountdownValue] = useState<number | null>(null);

  const [settings, setSettings] = useState<RecordingSettings>({
    inputDevice: 'default',
    outputDevice: 'default',
    inputGain: 1.0,
    monitorLevel: 0.5,
    monitorEnabled: false,
    countIn: 0,
    recordingMode: 'normal',
    sampleRate: 48000,
    bitDepth: 24,
  });

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const enumerateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioDevices = devices.filter(
        d => d.kind === 'audioinput' || d.kind === 'audiooutput'
      ).map(d => ({
        deviceId: d.deviceId,
        label: d.label || `${d.kind === 'audioinput' ? 'Microphone' : 'Speaker'} ${d.deviceId.slice(0, 8)}`,
        kind: d.kind,
      }));
      setAudioDevices(audioDevices);
    } catch (error) {
      console.error('Failed to enumerate devices:', error);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setHasPermission(true);
      await enumerateDevices();
    } catch (error) {
      console.error('Microphone permission denied:', error);
      setHasPermission(false);
      toast({
        title: 'Microphone access denied',
        description: 'Please allow microphone access to record audio.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [enumerateDevices, toast]);

  useEffect(() => {
    if (open) {
      requestPermission();
    }
    return () => {
      stopRecording();
      cleanup();
    };
  }, [open, requestPermission]);

  const cleanup = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
  }, []);

  const setupAudioPipeline = useCallback(async () => {
    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: settings.inputDevice !== 'default' ? { exact: settings.inputDevice } : undefined,
          sampleRate: settings.sampleRate,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;

      audioContextRef.current = new AudioContext({ sampleRate: settings.sampleRate });
      const source = audioContextRef.current.createMediaStreamSource(stream);
      
      analyzerRef.current = audioContextRef.current.createAnalyser();
      analyzerRef.current.fftSize = 2048;
      analyzerRef.current.smoothingTimeConstant = 0.8;

      gainNodeRef.current = audioContextRef.current.createGain();
      gainNodeRef.current.gain.value = settings.inputGain;

      source.connect(gainNodeRef.current);
      gainNodeRef.current.connect(analyzerRef.current);

      if (settings.monitorEnabled) {
        const monitorGain = audioContextRef.current.createGain();
        monitorGain.gain.value = settings.monitorLevel;
        gainNodeRef.current.connect(monitorGain);
        monitorGain.connect(audioContextRef.current.destination);
      }

      return stream;
    } catch (error) {
      console.error('Failed to setup audio pipeline:', error);
      throw error;
    }
  }, [settings]);

  const updateLevels = useCallback(() => {
    if (!analyzerRef.current) return;

    const dataArray = new Uint8Array(analyzerRef.current.frequencyBinCount);
    analyzerRef.current.getByteTimeDomainData(dataArray);

    let sum = 0;
    let max = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const value = Math.abs(dataArray[i] - 128) / 128;
      sum += value;
      if (value > max) max = value;
    }
    const rms = sum / dataArray.length;
    
    setInputLevel(rms);
    if (max > peakLevel) {
      setPeakLevel(max);
      if (max > 0.95) {
        setIsClipping(true);
        setTimeout(() => setIsClipping(false), 500);
      }
    }

    animationFrameRef.current = requestAnimationFrame(updateLevels);
  }, [peakLevel]);

  const drawWaveform = useCallback(() => {
    if (!canvasRef.current || !analyzerRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dataArray = new Uint8Array(analyzerRef.current.frequencyBinCount);
    analyzerRef.current.getByteTimeDomainData(dataArray);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.lineWidth = 2;
    ctx.strokeStyle = isRecording ? '#ef4444' : '#22c55e';
    ctx.beginPath();

    const sliceWidth = canvas.width / dataArray.length;
    let x = 0;

    for (let i = 0; i < dataArray.length; i++) {
      const v = dataArray[i] / 128.0;
      const y = (v * canvas.height) / 2;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
  }, [isRecording]);

  const startCountdown = useCallback(async () => {
    if (settings.countIn === 0) {
      return startRecordingImmediate();
    }

    for (let i = settings.countIn; i > 0; i--) {
      setCountdownValue(i);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    setCountdownValue(null);
    startRecordingImmediate();
  }, [settings.countIn]);

  const startRecordingImmediate = useCallback(async () => {
    try {
      const stream = await setupAudioPipeline();

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        onRecordingComplete?.(blob, recordingTime);
      };

      mediaRecorderRef.current.start(100);
      setIsRecording(true);
      setRecordingTime(0);
      onRecordingStart?.();

      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 0.1);
      }, 100);

      updateLevels();

      toast({ title: 'Recording started' });
    } catch (error) {
      console.error('Failed to start recording:', error);
      toast({
        title: 'Failed to start recording',
        variant: 'destructive',
      });
    }
  }, [setupAudioPipeline, onRecordingComplete, onRecordingStart, recordingTime, updateLevels, toast]);

  const startRecording = useCallback(() => {
    startCountdown();
  }, [startCountdown]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      onRecordingStop?.();

      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }

      toast({ title: 'Recording stopped' });
    }
  }, [isRecording, onRecordingStop, toast]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
        setIsPaused(false);
      } else {
        mediaRecorderRef.current.pause();
        setIsPaused(true);
      }
    }
  }, [isRecording, isPaused]);

  const resetPeakLevel = useCallback(() => {
    setPeakLevel(0);
  }, []);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  const inputDevices = audioDevices.filter(d => d.kind === 'audioinput');
  const outputDevices = audioDevices.filter(d => d.kind === 'audiooutput');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 bg-slate-950 border-slate-800">
        <div className="flex flex-col">
          <div className="h-14 px-6 flex items-center justify-between border-b border-slate-800 bg-slate-900/50">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center",
                isRecording ? "bg-red-500/20" : "bg-slate-800"
              )}>
                {isRecording ? (
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 1 }}
                  >
                    <Mic className="h-5 w-5 text-red-500" />
                  </motion.div>
                ) : (
                  <Mic className="h-5 w-5 text-white/60" />
                )}
              </div>
              <div>
                <h2 className="font-semibold text-white">{trackName}</h2>
                <p className="text-xs text-white/40">Audio Recording</p>
              </div>
            </div>

            <div className={cn(
              "text-3xl font-mono font-bold",
              isRecording ? "text-red-500" : "text-white"
            )}>
              {formatTime(recordingTime)}
            </div>
          </div>

          <AnimatePresence>
            {countdownValue !== null && (
              <motion.div
                className="absolute inset-0 flex items-center justify-center bg-black/80 z-50"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <motion.span
                  key={countdownValue}
                  className="text-9xl font-bold text-white"
                  initial={{ scale: 2, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {countdownValue}
                </motion.span>
              </motion.div>
            )}
          </AnimatePresence>

          {isLoading ? (
            <div className="h-64 flex items-center justify-center">
              <RefreshCw className="h-8 w-8 animate-spin text-white/40" />
            </div>
          ) : !hasPermission ? (
            <div className="h-64 flex flex-col items-center justify-center gap-4 px-8">
              <AlertCircle className="h-12 w-12 text-yellow-500" />
              <p className="text-center text-white/60">
                Microphone access is required to record audio.
              </p>
              <Button onClick={requestPermission}>
                <Mic className="h-4 w-4 mr-2" />
                Allow Microphone Access
              </Button>
            </div>
          ) : (
            <>
              <div className="p-6 space-y-6">
                <div className="flex gap-6">
                  <div className="flex-1 space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-white/40">Input Device</Label>
                      <Select
                        value={settings.inputDevice}
                        onValueChange={(v) => setSettings(s => ({ ...s, inputDevice: v }))}
                        disabled={isRecording}
                      >
                        <SelectTrigger className="bg-slate-800 border-slate-700">
                          <SelectValue placeholder="Select input" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">Default Microphone</SelectItem>
                          {inputDevices.map(device => (
                            <SelectItem key={device.deviceId} value={device.deviceId}>
                              {device.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-white/40">Input Gain</Label>
                        <span className="text-xs text-white/60">
                          {(settings.inputGain * 100).toFixed(0)}%
                        </span>
                      </div>
                      <Slider
                        value={[settings.inputGain]}
                        onValueChange={([v]) => {
                          setSettings(s => ({ ...s, inputGain: v }));
                          if (gainNodeRef.current) {
                            gainNodeRef.current.gain.value = v;
                          }
                        }}
                        min={0}
                        max={2}
                        step={0.01}
                        disabled={isRecording}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Headphones className="h-4 w-4 text-white/40" />
                        <Label className="text-xs text-white/60">Monitor</Label>
                      </div>
                      <Switch
                        checked={settings.monitorEnabled}
                        onCheckedChange={(v) => setSettings(s => ({ ...s, monitorEnabled: v }))}
                        disabled={isRecording}
                      />
                    </div>

                    {settings.monitorEnabled && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs text-white/40">Monitor Level</Label>
                          <span className="text-xs text-white/60">
                            {(settings.monitorLevel * 100).toFixed(0)}%
                          </span>
                        </div>
                        <Slider
                          value={[settings.monitorLevel]}
                          onValueChange={([v]) => setSettings(s => ({ ...s, monitorLevel: v }))}
                          min={0}
                          max={1}
                          step={0.01}
                        />
                      </div>
                    )}
                  </div>

                  <div className="w-16 space-y-2">
                    <Label className="text-xs text-white/40 block text-center">Level</Label>
                    <div className="h-40 bg-black rounded-lg p-2 flex gap-1">
                      <LevelMeter level={inputLevel} isClipping={isClipping} />
                      <LevelMeter level={inputLevel * 0.95} isClipping={isClipping} />
                    </div>
                    <div 
                      className="text-[10px] text-center text-white/40 cursor-pointer hover:text-white/60"
                      onClick={resetPeakLevel}
                    >
                      Peak: {(peakLevel * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>

                <canvas
                  ref={canvasRef}
                  className="w-full h-20 bg-black rounded-lg"
                  width={600}
                  height={80}
                />

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-white/40">Count-In</Label>
                    <Select
                      value={settings.countIn.toString()}
                      onValueChange={(v) => setSettings(s => ({ ...s, countIn: parseInt(v) }))}
                      disabled={isRecording}
                    >
                      <SelectTrigger className="bg-slate-800 border-slate-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COUNT_IN_OPTIONS.map(v => (
                          <SelectItem key={v} value={v.toString()}>
                            {v === 0 ? 'Off' : `${v} bars`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-white/40">Sample Rate</Label>
                    <Select
                      value={settings.sampleRate.toString()}
                      onValueChange={(v) => setSettings(s => ({ ...s, sampleRate: parseInt(v) }))}
                      disabled={isRecording}
                    >
                      <SelectTrigger className="bg-slate-800 border-slate-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SAMPLE_RATES.map(rate => (
                          <SelectItem key={rate} value={rate.toString()}>
                            {rate / 1000} kHz
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-white/40">Bit Depth</Label>
                    <Select
                      value={settings.bitDepth.toString()}
                      onValueChange={(v) => setSettings(s => ({ ...s, bitDepth: parseInt(v) }))}
                      disabled={isRecording}
                    >
                      <SelectTrigger className="bg-slate-800 border-slate-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BIT_DEPTHS.map(depth => (
                          <SelectItem key={depth} value={depth.toString()}>
                            {depth}-bit
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="h-16 px-6 flex items-center justify-center gap-4 border-t border-slate-800 bg-slate-900/30">
                {!isRecording ? (
                  <Button
                    size="lg"
                    onClick={startRecording}
                    className="h-12 px-8 bg-red-500 hover:bg-red-600 text-white"
                  >
                    <Circle className="h-5 w-5 mr-2 fill-current" />
                    Record
                  </Button>
                ) : (
                  <>
                    <Button
                      size="lg"
                      variant="outline"
                      onClick={pauseRecording}
                      className="h-12 px-6"
                    >
                      {isPaused ? (
                        <>
                          <Play className="h-5 w-5 mr-2" />
                          Resume
                        </>
                      ) : (
                        <>
                          <Pause className="h-5 w-5 mr-2" />
                          Pause
                        </>
                      )}
                    </Button>
                    <Button
                      size="lg"
                      onClick={stopRecording}
                      className="h-12 px-8 bg-slate-700 hover:bg-slate-600"
                    >
                      <Square className="h-5 w-5 mr-2" />
                      Stop
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LevelMeter({ level, isClipping }: { level: number; isClipping: boolean }) {
  const segments = 20;
  const activeSegments = Math.floor(level * segments);

  return (
    <div className="flex-1 flex flex-col-reverse gap-0.5">
      {Array.from({ length: segments }).map((_, i) => {
        const isActive = i < activeSegments;
        const isPeak = i >= segments - 2;
        const isWarn = i >= segments - 5 && i < segments - 2;

        let color = '#22c55e';
        if (isPeak) color = isClipping ? '#ef4444' : '#ef4444';
        else if (isWarn) color = '#eab308';

        return (
          <motion.div
            key={i}
            className="flex-1 rounded-sm"
            style={{
              backgroundColor: isActive ? color : 'rgba(255,255,255,0.1)',
            }}
            animate={{
              opacity: isActive ? 1 : 0.3,
            }}
            transition={{ duration: 0.05 }}
          />
        );
      })}
    </div>
  );
}
