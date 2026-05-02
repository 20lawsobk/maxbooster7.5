import { useState, useEffect, useCallback } from 'react';
import { Headphones, Mic, Settings, Volume2, RefreshCw, CheckCircle, AlertCircle, Play, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface AudioDevice {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
}

interface AudioDeviceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SAMPLE_RATES = [44100, 48000, 88200, 96000, 192000];
const BUFFER_SIZES = [64, 128, 256, 512, 1024, 2048];

function formatHz(hz: number): string {
  return hz >= 1000 ? `${(hz / 1000).toFixed(hz % 1000 === 0 ? 0 : 1)} kHz` : `${hz} Hz`;
}

export function AudioDeviceDialog({ open, onOpenChange }: AudioDeviceDialogProps) {
  const [outputDevices, setOutputDevices] = useState<AudioDevice[]>([]);
  const [inputDevices, setInputDevices] = useState<AudioDevice[]>([]);
  const [selectedOutput, setSelectedOutput] = useState<string>('default');
  const [selectedInput, setSelectedInput] = useState<string>('default');
  const [sampleRate, setSampleRate] = useState(48000);
  const [bufferSize, setBufferSize] = useState(256);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [testNode, setTestNode] = useState<OscillatorNode | null>(null);
  const [permission, setPermission] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown');
  const [latency, setLatency] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const enumerateDevices = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter(d => d.kind === 'audiooutput').map(d => ({
        deviceId: d.deviceId,
        label: d.label || `Output ${d.deviceId.slice(0, 6)}`,
        kind: d.kind,
      }));
      const inputs = devices.filter(d => d.kind === 'audioinput').map(d => ({
        deviceId: d.deviceId,
        label: d.label || `Input ${d.deviceId.slice(0, 6)}`,
        kind: d.kind,
      }));
      setOutputDevices(outputs.length > 0 ? outputs : [{ deviceId: 'default', label: 'Default Output', kind: 'audiooutput' }]);
      setInputDevices(inputs.length > 0 ? inputs : [{ deviceId: 'default', label: 'Default Input', kind: 'audioinput' }]);
      setPermission('granted');
    } catch {
      setPermission('denied');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setPermission('granted');
      await enumerateDevices();
    } catch {
      setPermission('denied');
    }
  }, [enumerateDevices]);

  useEffect(() => {
    if (!open) return;
    navigator.permissions?.query({ name: 'microphone' as PermissionName }).then(result => {
      setPermission(result.state as Record<string, unknown>);
      if (result.state === 'granted') enumerateDevices();
    }).catch(() => enumerateDevices());
  }, [open, enumerateDevices]);

  const startTest = useCallback(() => {
    try {
      const ctx = new AudioContext({ sampleRate, latencyHint: bufferSize / sampleRate });
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.15, ctx.currentTime + 0.4);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
      osc.frequency.value = 440;
      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.55);
      setTestNode(osc);
      setTestStatus('testing');
      setLatency(Math.round(ctx.baseLatency * 1000 + ctx.outputLatency * 1000));
      osc.onended = () => {
        ctx.close();
        setTestNode(null);
        setTestStatus('ok');
        setTimeout(() => setTestStatus('idle'), 3000);
      };
    } catch {
      setTestStatus('error');
      setTimeout(() => setTestStatus('idle'), 3000);
    }
  }, [sampleRate, bufferSize]);

  const stopTest = useCallback(() => {
    testNode?.stop();
    setTestNode(null);
    setTestStatus('idle');
  }, [testNode]);

  const calculatedLatency = Math.round((bufferSize / sampleRate) * 1000 * 2);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1c1c24] border border-[#333] text-white p-0 max-w-lg w-full overflow-hidden">
        <DialogTitle className="sr-only">Audio Device Settings</DialogTitle>
        <DialogDescription className="sr-only">Configure audio hardware, input/output devices, sample rate, and buffer size.</DialogDescription>
        {/* Header */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[#2a2a2e] bg-[#181820]">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 flex items-center justify-center">
            <Settings className="h-4 w-4 text-blue-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Audio Device Settings</h2>
            <p className="text-xs text-gray-500">Configure audio hardware and routing</p>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Permission banner */}
          {permission === 'denied' && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-900/20 border border-red-800/50 rounded-lg">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
              <p className="text-xs text-red-300">Microphone access denied. Enable it in browser settings to list input devices.</p>
            </div>
          )}
          {permission === 'prompt' && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-amber-900/20 border border-amber-800/50 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
                <p className="text-xs text-amber-300">Grant microphone access to enumerate all devices.</p>
              </div>
              <Button size="sm" onClick={requestPermission} className="h-6 text-xs shrink-0 bg-amber-600 hover:bg-amber-500">
                Allow
              </Button>
            </div>
          )}

          {/* Output Device */}
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-300 uppercase tracking-wider">
              <Volume2 className="h-3.5 w-3.5 text-blue-400" />
              Output Device
            </label>
            <select
              value={selectedOutput}
              onChange={(e) => setSelectedOutput(e.target.value)}
              className="w-full bg-[#252530] border border-[#333] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 appearance-none cursor-pointer"
            >
              {outputDevices.length === 0
                ? <option value="default">Default System Output</option>
                : outputDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)
              }
            </select>
          </div>

          {/* Input Device */}
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-300 uppercase tracking-wider">
              <Mic className="h-3.5 w-3.5 text-red-400" />
              Input Device
            </label>
            <select
              value={selectedInput}
              onChange={(e) => setSelectedInput(e.target.value)}
              className="w-full bg-[#252530] border border-[#333] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 appearance-none cursor-pointer"
            >
              {inputDevices.length === 0
                ? <option value="default">Default System Input</option>
                : inputDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)
              }
            </select>
          </div>

          {/* Sample Rate + Buffer Size */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Sample Rate</label>
              <div className="flex flex-wrap gap-1">
                {SAMPLE_RATES.map(rate => (
                  <button
                    key={rate}
                    onClick={() => setSampleRate(rate)}
                    className={cn(
                      'px-2 py-1 rounded text-xs font-mono transition-colors border',
                      sampleRate === rate
                        ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                        : 'bg-[#252530] border-[#333] text-gray-400 hover:border-[#555] hover:text-gray-200'
                    )}
                  >
                    {formatHz(rate)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Buffer Size</label>
              <div className="flex flex-wrap gap-1">
                {BUFFER_SIZES.map(size => (
                  <button
                    key={size}
                    onClick={() => setBufferSize(size)}
                    className={cn(
                      'px-2 py-1 rounded text-xs font-mono transition-colors border',
                      bufferSize === size
                        ? 'bg-purple-600/20 border-purple-500/50 text-purple-300'
                        : 'bg-[#252530] border-[#333] text-gray-400 hover:border-[#555] hover:text-gray-200'
                    )}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Latency estimate */}
          <div className="flex items-center justify-between px-3 py-2 bg-[#252530] rounded-lg border border-[#333]">
            <div className="space-y-0.5">
              <p className="text-xs text-gray-400">Estimated Round-Trip Latency</p>
              <p className="text-lg font-bold text-white tabular-nums">
                ~{latency ?? calculatedLatency} <span className="text-sm font-normal text-gray-400">ms</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">{formatHz(sampleRate)} · {bufferSize} samples</p>
              <p className="text-xs text-gray-600 mt-0.5">
                {calculatedLatency <= 6 ? 'Ultra-low' : calculatedLatency <= 12 ? 'Low' : calculatedLatency <= 24 ? 'Medium' : 'High'} latency
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={enumerateDevices}
              disabled={isRefreshing}
              className="h-8 gap-1.5 text-xs text-gray-400 hover:text-white"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
              Refresh Devices
            </Button>

            <div className="flex items-center gap-2">
              {testStatus !== 'idle' && (
                <div className="flex items-center gap-1.5 text-xs">
                  {testStatus === 'testing' && <span className="text-blue-400 animate-pulse">Playing 440 Hz tone…</span>}
                  {testStatus === 'ok' && (
                    <span className="flex items-center gap-1 text-emerald-400">
                      <CheckCircle className="h-3.5 w-3.5" /> Audio OK
                    </span>
                  )}
                  {testStatus === 'error' && (
                    <span className="flex items-center gap-1 text-red-400">
                      <AlertCircle className="h-3.5 w-3.5" /> Test Failed
                    </span>
                  )}
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={testStatus === 'testing' ? stopTest : startTest}
                className={cn(
                  'h-8 gap-1.5 text-xs border',
                  testStatus === 'testing'
                    ? 'border-blue-500/50 text-blue-400 bg-blue-600/10 hover:bg-blue-600/20'
                    : 'border-[#444] text-gray-300 hover:text-white hover:border-[#666]'
                )}
              >
                {testStatus === 'testing'
                  ? <><Square className="h-3 w-3" /> Stop</>
                  : <><Play className="h-3 w-3" /> Test Audio</>
                }
              </Button>

              <Button
                size="sm"
                onClick={() => onOpenChange(false)}
                className="h-8 text-xs bg-blue-600 hover:bg-blue-500"
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
