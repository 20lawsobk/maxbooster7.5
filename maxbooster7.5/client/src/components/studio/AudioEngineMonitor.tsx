import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useAudioContext } from '@/hooks/useAudioContext';
import { Activity, Cpu, Clock, Zap, AlertCircle } from 'lucide-react';
import { useState, useEffect } from 'react';

interface AudioEngineMonitorProps {
  latencyMs?: number;
  cpuUsage?: number;
  bufferSize?: number;
  onBufferSizeChange?: (size: number) => void;
  compact?: boolean;
}

const BUFFER_SIZES = [64, 128, 256, 512, 1024, 2048, 4096];

/**
 * TODO: Add function documentation
 */
export function AudioEngineMonitor({
  latencyMs = 0,
  cpuUsage = 0,
  bufferSize = 256,
  onBufferSizeChange,
  compact = false,
}: AudioEngineMonitorProps) {
  const { context, sampleRate } = useAudioContext();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [calculatedLatency, setCalculatedLatency] = useState(0);

  // Calculate theoretical latency based on buffer size and sample rate
  useEffect(() => {
    if (context) {
      const baseLatency = (context.baseLatency || 0) * 1000;
      const outputLatency = (context.outputLatency || 0) * 1000;
      const bufferLatency = (bufferSize / sampleRate) * 1000;
      setCalculatedLatency(baseLatency + outputLatency + bufferLatency);
    }
  }, [context, bufferSize, sampleRate]);

  const getLatencyStatus = (latency: number) => {
    if (latency < 10) return { color: 'text-green-500', label: 'Excellent' };
    if (latency < 20) return { color: 'text-blue-500', label: 'Good' };
    if (latency < 40) return { color: 'text-yellow-500', label: 'Acceptable' };
    return { color: 'text-red-500', label: 'High' };
  };

  const getCPUStatus = (cpu: number) => {
    if (cpu < 50) return { color: 'text-green-500', label: 'Good' };
    if (cpu < 75) return { color: 'text-yellow-500', label: 'Moderate' };
    return { color: 'text-red-500', label: 'High' };
  };

  const latencyStatus = getLatencyStatus(latencyMs || calculatedLatency);
  const cpuStatus = getCPUStatus(cpuUsage);

  if (compact) {
    return (
      <div className="flex items-center gap-3 text-xs">
        {/* Latency */}
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3 text-gray-500" />
          <span className={latencyStatus.color}>
            {(latencyMs || calculatedLatency).toFixed(1)}ms
          </span>
        </div>

        {/* CPU */}
        <div className="flex items-center gap-1">
          <Cpu className="h-3 w-3 text-gray-500" />
          <span className={cpuStatus.color}>{cpuUsage.toFixed(0)}%</span>
        </div>

        {/* Sample Rate */}
        <div className="flex items-center gap-1 text-gray-500">
          <Activity className="h-3 w-3" />
          <span>{(sampleRate / 1000).toFixed(1)}kHz</span>
        </div>
      </div>
    );
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-indigo-500" />
          <h3 className="text-sm font-semibold">Audio Engine</h3>
        </div>
        <Badge variant={context ? 'default' : 'destructive'} className="text-xs">
          {context ? 'Active' : 'Inactive'}
        </Badge>
      </div>

      {/* Real-time Metrics */}
      <div className="grid grid-cols-2 gap-3">
        {/* Latency */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-400">Latency</Label>
            <Badge variant="outline" className={`text-xs ${latencyStatus.color}`}>
              {latencyStatus.label}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-500" />
            <span className={`text-2xl font-mono ${latencyStatus.color}`}>
              {(latencyMs || calculatedLatency).toFixed(1)}
            </span>
            <span className="text-xs text-gray-500">ms</span>
          </div>
          <Progress
            value={Math.min(((latencyMs || calculatedLatency) / 50) * 100, 100)}
            className="h-1"
          />
        </div>

        {/* CPU Usage */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-400">CPU Usage</Label>
            <Badge variant="outline" className={`text-xs ${cpuStatus.color}`}>
              {cpuStatus.label}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-gray-500" />
            <span className={`text-2xl font-mono ${cpuStatus.color}`}>{cpuUsage.toFixed(0)}</span>
            <span className="text-xs text-gray-500">%</span>
          </div>
          <Progress value={cpuUsage} className="h-1" />
        </div>
      </div>

      {/* Audio Context Info */}
      {context && (
        <div className="space-y-2 p-3 bg-gray-900/50 rounded border border-gray-800">
          <div className="text-xs font-medium text-gray-300">Audio Context</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">State:</span>
              <span className={context.state === 'running' ? 'text-green-500' : 'text-yellow-500'}>
                {context.state}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Sample Rate:</span>
              <span className="font-mono">{(sampleRate / 1000).toFixed(1)} kHz</span>
            </div>
            {context.baseLatency !== undefined && (
              <div className="flex justify-between">
                <span className="text-gray-500">Base Latency:</span>
                <span className="font-mono">{(context.baseLatency * 1000).toFixed(1)} ms</span>
              </div>
            )}
            {context.outputLatency !== undefined && (
              <div className="flex justify-between">
                <span className="text-gray-500">Output Latency:</span>
                <span className="font-mono">{(context.outputLatency * 1000).toFixed(1)} ms</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Buffer Size Control */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Buffer Size</Label>
          <Badge variant="secondary" className="text-xs font-mono">
            {bufferSize} samples
          </Badge>
        </div>

        <Select
          value={bufferSize.toString()}
          onValueChange={(value) => onBufferSizeChange?.(parseInt(value))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BUFFER_SIZES.map((size) => {
              const latency = (size / sampleRate) * 1000;
              const recommendation =
                size <= 128
                  ? '(Low latency, high CPU)'
                  : size <= 512
                    ? '(Balanced)'
                    : '(High latency, low CPU)';

              return (
                <SelectItem key={size} value={size.toString()}>
                  <div className="flex flex-col">
                    <span>{size} samples</span>
                    <span className="text-xs text-gray-500">
                      ~{latency.toFixed(1)}ms {recommendation}
                    </span>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        <div className="text-xs text-gray-500 flex items-start gap-2">
          <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
          <div>
            Smaller buffer = lower latency but higher CPU usage. Use 64-256 for recording, 512-1024
            for mixing.
          </div>
        </div>
      </div>

      {/* Advanced Info Toggle */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="w-full text-xs"
      >
        {showAdvanced ? 'Hide' : 'Show'} Advanced Info
      </Button>

      {showAdvanced && context && (
        <div className="space-y-2 text-xs">
          <div className="font-medium text-gray-300">Technical Details</div>
          <div className="space-y-1 p-2 bg-gray-950 rounded border border-gray-800 font-mono">
            <div className="flex justify-between">
              <span className="text-gray-500">Current Time:</span>
              <span>{context.currentTime.toFixed(3)}s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Destination:</span>
              <span>{context.destination.channelCount} channels</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Max Channels:</span>
              <span>{context.destination.maxChannelCount}</span>
            </div>
          </div>

          <div className="space-y-1 text-gray-500">
            <div className="font-medium">Latency Breakdown:</div>
            <ul className="list-disc list-inside ml-2 space-y-0.5">
              <li>Input device latency</li>
              <li>Buffer processing latency ({bufferSize} samples)</li>
              <li>Output device latency</li>
              <li>Plugin processing delay</li>
            </ul>
          </div>
        </div>
      )}
    </Card>
  );
}
