import { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Mic, Volume2, Radio, X, CheckCircle2 } from 'lucide-react';

interface RoutingConnection {
  from: string;
  to: string;
  enabled: boolean;
}

interface Track {
  id: string;
  name: string;
  color: string;
  type: 'audio' | 'midi' | 'instrument';
}

interface Bus {
  id: string;
  name: string;
  color: string;
}

interface RoutingMatrixProps {
  tracks?: Track[];
  buses?: Bus[];
  onClose?: () => void;
}

const DEFAULT_TRACKS: Track[] = [
  { id: 'track-1', name: 'Vocals', color: '#4ade80', type: 'audio' },
  { id: 'track-2', name: 'Guitar', color: '#60a5fa', type: 'audio' },
  { id: 'track-3', name: 'Bass', color: '#f87171', type: 'audio' },
  { id: 'track-4', name: 'Drums', color: '#fbbf24', type: 'audio' },
];

const DEFAULT_BUSES: Bus[] = [
  { id: 'bus-1', name: 'Reverb', color: '#a78bfa' },
  { id: 'bus-2', name: 'Delay', color: '#fb923c' },
  { id: 'master', name: 'Master', color: '#ec4899' },
];

/**
 * TODO: Add function documentation
 */
export function RoutingMatrix({
  tracks = DEFAULT_TRACKS,
  buses = DEFAULT_BUSES,
  onClose,
}: RoutingMatrixProps) {
  const [connections, setConnections] = useState<RoutingConnection[]>([
    // Default: all tracks to master
    ...tracks.map((track) => ({ from: track.id, to: 'master', enabled: true })),
  ]);

  const toggleConnection = (from: string, to: string) => {
    setConnections((prev) => {
      const existing = prev.find((c) => c.from === from && c.to === to);
      if (existing) {
        return prev.map((c) =>
          c.from === from && c.to === to ? { ...c, enabled: !c.enabled } : c
        );
      } else {
        return [...prev, { from, to, enabled: true }];
      }
    });
  };

  const isConnected = (from: string, to: string) => {
    const connection = connections.find((c) => c.from === from && c.to === to);
    return connection?.enabled || false;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[90vw] max-w-6xl h-[80vh] rounded-lg shadow-2xl flex flex-col"
        style={{
          background: 'var(--studio-bg-medium)',
          border: '1px solid var(--studio-border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="h-14 px-6 flex items-center justify-between border-b"
          style={{ borderColor: 'var(--studio-border)' }}
        >
          <div className="flex items-center gap-3">
            <Radio className="h-5 w-5" style={{ color: 'var(--studio-accent)' }} />
            <h2 className="text-lg font-bold tracking-wide" style={{ color: 'var(--studio-text)' }}>
              ROUTING MATRIX
            </h2>
            <Badge
              variant="outline"
              className="text-xs"
              style={{
                borderColor: 'var(--studio-accent)',
                color: 'var(--studio-accent)',
              }}
            >
              Signal Flow
            </Badge>
          </div>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Legend */}
        <div
          className="px-6 py-3 flex items-center gap-6 border-b text-xs"
          style={{
            background: 'var(--studio-bg-deep)',
            borderColor: 'var(--studio-border)',
            color: 'var(--studio-text-muted)',
          }}
        >
          <div className="flex items-center gap-2">
            <Mic className="h-3.5 w-3.5" />
            <span>Sources (Tracks)</span>
          </div>
          <ArrowRight className="h-3.5 w-3.5" />
          <div className="flex items-center gap-2">
            <Volume2 className="h-3.5 w-3.5" />
            <span>Destinations (Buses)</span>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div
                className="h-6 w-6 rounded border-2 flex items-center justify-center"
                style={{
                  borderColor: 'var(--studio-accent)',
                  background: 'var(--studio-accent)' + '30',
                }}
              >
                <CheckCircle2 className="h-3.5 w-3.5" style={{ color: 'var(--studio-accent)' }} />
              </div>
              <span>Connected</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="h-6 w-6 rounded border-2"
                style={{ borderColor: 'var(--studio-border)' }}
              />
              <span>Disconnected</span>
            </div>
          </div>
        </div>

        {/* Matrix Grid */}
        <ScrollArea className="flex-1">
          <div className="p-6">
            <TooltipProvider>
              <div className="inline-block min-w-full">
                {/* Column Headers */}
                <div className="flex mb-2">
                  <div className="w-40" />
                  {buses.map((bus) => (
                    <div
                      key={bus.id}
                      className="w-20 flex flex-col items-center justify-center gap-1"
                    >
                      <div className="h-2 w-12 rounded-full" style={{ background: bus.color }} />
                      <span
                        className="text-xs font-medium truncate w-full text-center"
                        style={{ color: 'var(--studio-text)' }}
                      >
                        {bus.name}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Rows */}
                {tracks.map((track, trackIndex) => (
                  <div
                    key={track.id}
                    className="flex items-center mb-2 rounded hover:bg-white/5 transition-colors"
                  >
                    {/* Row Header */}
                    <div className="w-40 flex items-center gap-2 px-3 py-2">
                      <div className="h-2 w-2 rounded-full" style={{ background: track.color }} />
                      <span
                        className="text-sm font-medium truncate"
                        style={{ color: 'var(--studio-text)' }}
                      >
                        {track.name}
                      </span>
                    </div>

                    {/* Connection Points */}
                    {buses.map((bus) => {
                      const connected = isConnected(track.id, bus.id);

                      return (
                        <div
                          key={`${track.id}-${bus.id}`}
                          className="w-20 flex items-center justify-center"
                        >
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => toggleConnection(track.id, bus.id)}
                                className={`h-10 w-10 rounded border-2 flex items-center justify-center transition-all hover:scale-110 ${
                                  connected ? 'hover:opacity-80' : 'hover:border-white/40'
                                }`}
                                style={{
                                  borderColor: connected ? bus.color : 'var(--studio-border)',
                                  background: connected
                                    ? bus.color + '30'
                                    : 'var(--studio-bg-deep)',
                                }}
                              >
                                {connected && (
                                  <CheckCircle2 className="h-5 w-5" style={{ color: bus.color }} />
                                )}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {connected
                                ? `Disconnect ${track.name} from ${bus.name}`
                                : `Connect ${track.name} to ${bus.name}`}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      );
                    })}
                  </div>
                ))}

                {/* Signal Flow Visualization */}
                <div
                  className="mt-8 p-4 rounded-lg"
                  style={{ background: 'var(--studio-bg-deep)' }}
                >
                  <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--studio-text)' }}>
                    Active Signal Flow
                  </h3>
                  <div className="space-y-2">
                    {connections
                      .filter((c) => c.enabled)
                      .map((connection, i) => {
                        const track = tracks.find((t) => t.id === connection.from);
                        const bus = buses.find((b) => b.id === connection.to);
                        if (!track || !bus) return null;

                        return (
                          <div key={i} className="flex items-center gap-3 text-sm">
                            <div className="flex items-center gap-2">
                              <div
                                className="h-2 w-2 rounded-full"
                                style={{ background: track.color }}
                              />
                              <span style={{ color: 'var(--studio-text-muted)' }}>
                                {track.name}
                              </span>
                            </div>
                            <ArrowRight
                              className="h-3.5 w-3.5"
                              style={{ color: 'var(--studio-text-subtle)' }}
                            />
                            <div className="flex items-center gap-2">
                              <div
                                className="h-2 w-2 rounded-full"
                                style={{ background: bus.color }}
                              />
                              <span style={{ color: 'var(--studio-text-muted)' }}>{bus.name}</span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            </TooltipProvider>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div
          className="h-14 px-6 flex items-center justify-between border-t"
          style={{ borderColor: 'var(--studio-border)' }}
        >
          <div className="text-sm" style={{ color: 'var(--studio-text-muted)' }}>
            {connections.filter((c) => c.enabled).length} active connections
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setConnections([])}>
              Clear All
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={onClose}
              style={{
                background: 'var(--studio-accent)',
                color: 'white',
              }}
            >
              Done
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
