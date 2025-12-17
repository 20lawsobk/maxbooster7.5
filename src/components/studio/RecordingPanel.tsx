import { Badge } from '@/components/ui/badge';
import { Mic } from 'lucide-react';

interface RecordingPanelProps {
  isRecording: boolean;
  recordingDuration: number;
  armedTracksCount: number;
  inputMonitoringMode: 'off' | 'on' | 'auto';
  latencyMs: number;
}

/**
 * TODO: Add function documentation
 */
export function RecordingPanel({
  isRecording,
  recordingDuration,
  armedTracksCount,
  inputMonitoringMode,
  latencyMs,
}: RecordingPanelProps) {
  if (!isRecording && armedTracksCount === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      {isRecording && (
        <Badge variant="destructive" className="animate-pulse" data-testid="badge-recording">
          <Mic className="h-3 w-3 mr-1 animate-pulse" />
          REC {Math.floor(recordingDuration)}s
        </Badge>
      )}
      {latencyMs > 0 && (
        <div className="text-gray-400" data-testid="text-latency">
          Latency: {latencyMs.toFixed(1)}ms
        </div>
      )}
    </div>
  );
}
