import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Cpu, Snowflake } from 'lucide-react';

interface PerformanceMonitorProps {
  cpuUsage: number;
  showCPUWarning: boolean;
  onFreezeTrack?: (trackId: string) => void;
  onUnfreezeTrack?: (trackId: string) => void;
  freezingTrackId: string | null;
}

/**
 * TODO: Add function documentation
 */
export function PerformanceMonitor({
  cpuUsage,
  showCPUWarning,
  onFreezeTrack,
  onUnfreezeTrack,
  freezingTrackId,
}: PerformanceMonitorProps) {
  return (
    <div className="flex items-center gap-2">
      {showCPUWarning && (
        <Badge variant="destructive" className="animate-pulse" data-testid="badge-cpu-warning">
          <Cpu className="h-3 w-3 mr-1" />
          High CPU: {cpuUsage.toFixed(0)}%
        </Badge>
      )}
      {!showCPUWarning && cpuUsage > 0 && (
        <div className="text-xs text-gray-400" data-testid="text-cpu-usage">
          CPU: {cpuUsage.toFixed(0)}%
        </div>
      )}
    </div>
  );
}
