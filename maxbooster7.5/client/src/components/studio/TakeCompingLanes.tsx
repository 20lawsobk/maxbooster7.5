import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Layers, Star, Trash2, Eye, EyeOff, Scissors, Copy, Sparkles } from 'lucide-react';

export interface Take {
  id: string;
  takeNumber: number;
  takeGroupId: string;
  startTime: number;
  duration: number;
  audioUrl?: string;
  isComped: boolean;
  isMuted: boolean;
  rating?: number; // 0-5 stars
  note?: string;
  waveformData?: number[];
}

interface TakeCompingLanesProps {
  takes: Take[];
  selectedTakeId: string | null;
  onSelectTake: (takeId: string) => void;
  onToggleMute: (takeId: string) => void;
  onToggleComp: (takeId: string) => void;
  onDeleteTake: (takeId: string) => void;
  onRateTake: (takeId: string, rating: number) => void;
  onDuplicateTake: (takeId: string) => void;
  onCreateCompFromSelection: (takeIds: string[]) => void;
  compact?: boolean;
}

/**
 * TODO: Add function documentation
 */
export function TakeCompingLanes({
  takes,
  selectedTakeId,
  onSelectTake,
  onToggleMute,
  onToggleComp,
  onDeleteTake,
  onRateTake,
  onDuplicateTake,
  onCreateCompFromSelection,
  compact = false,
}: TakeCompingLanesProps) {
  const [selectedTakes, setSelectedTakes] = useState<Set<string>>(new Set());

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds.toFixed(1)}s`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const toggleTakeSelection = (takeId: string) => {
    const newSelection = new Set(selectedTakes);
    if (newSelection.has(takeId)) {
      newSelection.delete(takeId);
    } else {
      newSelection.add(takeId);
    }
    setSelectedTakes(newSelection);
  };

  const compedTakes = takes.filter((t) => t.isComped);
  const nonCompedTakes = takes.filter((t) => !t.isComped);

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <Layers className="h-3 w-3 text-gray-500" />
          <span className="text-xs text-gray-500">
            {takes.length} takes ({compedTakes.length} comped)
          </span>
        </div>
      </div>
    );
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-blue-500" />
          <h3 className="text-sm font-semibold">Take Comping</h3>
          <Badge variant="outline" className="text-xs">
            {takes.length} takes
          </Badge>
        </div>

        {selectedTakes.size > 0 && (
          <Button
            variant="default"
            size="sm"
            onClick={() => onCreateCompFromSelection(Array.from(selectedTakes))}
            className="h-7 text-xs gap-1"
          >
            <Sparkles className="h-3 w-3" />
            Create Comp ({selectedTakes.size})
          </Button>
        )}
      </div>

      {takes.length === 0 ? (
        <div className="text-xs text-gray-500 text-center p-6 bg-gray-900/50 rounded border border-gray-800">
          No takes recorded yet. Arm a track and start recording to create takes.
        </div>
      ) : (
        <ScrollArea className="h-[400px]">
          <div className="space-y-4">
            {/* Comped Takes */}
            {compedTakes.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-green-400">
                  <Sparkles className="h-3 w-3" />
                  Comped Takes ({compedTakes.length})
                </div>
                {compedTakes.map((take) => (
                  <TakeLaneItem
                    key={take.id}
                    take={take}
                    isSelected={selectedTakeId === take.id}
                    isMultiSelected={selectedTakes.has(take.id)}
                    onSelect={() => onSelectTake(take.id)}
                    onToggleMultiSelect={() => toggleTakeSelection(take.id)}
                    onToggleMute={() => onToggleMute(take.id)}
                    onToggleComp={() => onToggleComp(take.id)}
                    onDelete={() => onDeleteTake(take.id)}
                    onRate={(rating) => onRateTake(take.id, rating)}
                    onDuplicate={() => onDuplicateTake(take.id)}
                    formatTime={formatTime}
                    formatDuration={formatDuration}
                  />
                ))}
              </div>
            )}

            {compedTakes.length > 0 && nonCompedTakes.length > 0 && <Separator />}

            {/* Non-Comped Takes */}
            {nonCompedTakes.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-gray-400">
                  Other Takes ({nonCompedTakes.length})
                </div>
                {nonCompedTakes.map((take) => (
                  <TakeLaneItem
                    key={take.id}
                    take={take}
                    isSelected={selectedTakeId === take.id}
                    isMultiSelected={selectedTakes.has(take.id)}
                    onSelect={() => onSelectTake(take.id)}
                    onToggleMultiSelect={() => toggleTakeSelection(take.id)}
                    onToggleMute={() => onToggleMute(take.id)}
                    onToggleComp={() => onToggleComp(take.id)}
                    onDelete={() => onDeleteTake(take.id)}
                    onRate={(rating) => onRateTake(take.id, rating)}
                    onDuplicate={() => onDuplicateTake(take.id)}
                    formatTime={formatTime}
                    formatDuration={formatDuration}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      )}

      {/* Comping Tips */}
      <div className="text-xs text-gray-500 space-y-1 pt-2 border-t border-gray-800">
        <div className="font-medium">Comping Workflow:</div>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Record multiple takes with loop recording</li>
          <li>Rate takes (click stars) to mark favorites</li>
          <li>Select multiple takes and click "Create Comp"</li>
          <li>Edit comp by slicing and moving sections</li>
        </ul>
      </div>
    </Card>
  );
}

interface TakeLaneItemProps {
  take: Take;
  isSelected: boolean;
  isMultiSelected: boolean;
  onSelect: () => void;
  onToggleMultiSelect: () => void;
  onToggleMute: () => void;
  onToggleComp: () => void;
  onDelete: () => void;
  onRate: (rating: number) => void;
  onDuplicate: () => void;
  formatTime: (seconds: number) => string;
  formatDuration: (seconds: number) => string;
}

/**
 * TODO: Add function documentation
 */
function TakeLaneItem({
  take,
  isSelected,
  isMultiSelected,
  onSelect,
  onToggleMultiSelect,
  onToggleMute,
  onToggleComp,
  onDelete,
  onRate,
  onDuplicate,
  formatTime,
  formatDuration,
}: TakeLaneItemProps) {
  return (
    <div
      className={`p-3 rounded border transition-all cursor-pointer ${
        isSelected
          ? 'bg-blue-500/20 border-blue-500/50'
          : isMultiSelected
            ? 'bg-purple-500/20 border-purple-500/50'
            : 'bg-gray-900/50 border-gray-800 hover:bg-gray-800/50'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 space-y-2">
          {/* Header */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isMultiSelected}
              onChange={(e) => {
                e.stopPropagation();
                onToggleMultiSelect();
              }}
              className="rounded"
            />
            <Badge variant={take.isComped ? 'default' : 'secondary'} className="text-xs">
              Take {take.takeNumber}
            </Badge>
            {take.isComped && <Sparkles className="h-3 w-3 text-green-500" />}
            {take.isMuted && <EyeOff className="h-3 w-3 text-gray-500" />}
          </div>

          {/* Info */}
          <div className="text-xs text-gray-400 space-y-1">
            <div className="flex items-center gap-2">
              <span>Start: {formatTime(take.startTime)}</span>
              <span>•</span>
              <span>Duration: {formatDuration(take.duration)}</span>
            </div>

            {/* Rating */}
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((rating) => (
                <button
                  key={rating}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRate(rating);
                  }}
                  className="hover:scale-110 transition-transform"
                >
                  <Star
                    className={`h-3 w-3 ${
                      take.rating && rating <= take.rating
                        ? 'fill-yellow-500 text-yellow-500'
                        : 'text-gray-600'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Waveform Preview (simplified) */}
          <div className="h-8 bg-gray-950 rounded border border-gray-800 overflow-hidden">
            {take.waveformData && take.waveformData.length > 0 ? (
              <div className="flex items-center h-full gap-px">
                {take.waveformData.slice(0, 50).map((value, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-blue-500"
                    style={{ height: `${value * 100}%` }}
                  />
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-gray-600">
                No waveform data
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onToggleMute();
            }}
            className="h-7 w-7 p-0"
            title={take.isMuted ? 'Unmute' : 'Mute'}
          >
            {take.isMuted ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onToggleComp();
            }}
            className="h-7 w-7 p-0"
            title={take.isComped ? 'Remove from comp' : 'Add to comp'}
          >
            <Sparkles className={`h-3 w-3 ${take.isComped ? 'text-green-500' : ''}`} />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            className="h-7 w-7 p-0"
            title="Duplicate take"
          >
            <Copy className="h-3 w-3" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="h-7 w-7 p-0 text-red-500 hover:text-red-400"
            title="Delete take"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
