import { useCallback, useState } from 'react';
import { Plus, X, Edit2, Flag } from 'lucide-react';
import { useStudioStore, type Marker } from '@/lib/studioStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

interface MarkerLaneProps {
  duration: number;
  onTimelineClick?: (time: number) => void;
}

const MARKER_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink
];

/**
 * TODO: Add function documentation
 */
export function MarkerLane({ duration, onTimelineClick }: MarkerLaneProps) {
  const {
    markers,
    selectedMarkerId,
    addMarker,
    updateMarker,
    deleteMarker,
    selectMarker,
    currentTime,
  } = useStudioStore();

  const [isAdding, setIsAdding] = useState(false);
  const [editingMarkerId, setEditingMarkerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleAddMarker = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isAdding) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const clickTime = (x / rect.width) * duration;

      const newMarker: Marker = {
        id: `marker-${Date.now()}`,
        name: `Marker ${markers.length + 1}`,
        time: Math.max(0, Math.min(clickTime, duration)),
        position: Math.max(0, Math.min(clickTime, duration)),
        color: MARKER_COLORS[markers.length % MARKER_COLORS.length],
        type: 'marker',
      };

      addMarker(newMarker);
      setIsAdding(false);
    },
    [isAdding, duration, markers.length, addMarker]
  );

  const handleMarkerClick = useCallback(
    (e: React.MouseEvent, marker: Marker) => {
      e.stopPropagation();
      selectMarker(marker.id);
      if (onTimelineClick) {
        onTimelineClick(marker.time);
      }
    },
    [selectMarker, onTimelineClick]
  );

  const startEdit = useCallback((marker: Marker) => {
    setEditingMarkerId(marker.id);
    setEditingName(marker.name);
  }, []);

  const saveEdit = useCallback(() => {
    if (editingMarkerId && editingName.trim()) {
      updateMarker(editingMarkerId, { name: editingName.trim() });
    }
    setEditingMarkerId(null);
    setEditingName('');
  }, [editingMarkerId, editingName, updateMarker]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        saveEdit();
      } else if (e.key === 'Escape') {
        setEditingMarkerId(null);
        setEditingName('');
      }
    },
    [saveEdit]
  );

  return (
    <div className="relative">
      {/* Marker Lane Header */}
      <div
        className="h-8 flex items-center justify-between px-3 border-b"
        style={{
          background: 'var(--studio-bg-medium)',
          borderColor: 'var(--studio-border)',
        }}
      >
        <div className="flex items-center gap-2">
          <Flag className="h-3.5 w-3.5" style={{ color: 'var(--studio-text-muted)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--studio-text-muted)' }}>
            MARKERS
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => setIsAdding(!isAdding)}
          title={isAdding ? 'Cancel adding marker' : 'Add marker'}
        >
          {isAdding ? (
            <X className="h-3.5 w-3.5" style={{ color: 'var(--studio-text)' }} />
          ) : (
            <Plus className="h-3.5 w-3.5" style={{ color: 'var(--studio-text)' }} />
          )}
        </Button>
      </div>

      {/* Marker Lane Content */}
      <div
        className={`h-10 relative border-b ${isAdding ? 'cursor-crosshair' : ''}`}
        style={{
          background: 'var(--studio-bg-medium)',
          borderColor: 'var(--studio-border)',
        }}
        onClick={handleAddMarker}
      >
        {/* Guide text when adding */}
        {isAdding && markers.length === 0 && (
          <div
            className="absolute inset-0 flex items-center justify-center text-xs"
            style={{ color: 'var(--studio-text-muted)' }}
          >
            Click to add marker
          </div>
        )}

        {/* Render markers */}
        {markers.map((marker) => {
          const isSelected = marker.id === selectedMarkerId;
          const isEditing = marker.id === editingMarkerId;
          const position = (marker.time / duration) * 100;

          return (
            <ContextMenu key={marker.id}>
              <ContextMenuTrigger>
                <div
                  className={`absolute top-0 bottom-0 flex flex-col items-center cursor-pointer transition-all ${
                    isSelected ? 'z-10' : 'z-0'
                  }`}
                  style={{
                    left: `${position}%`,
                    transform: 'translateX(-50%)',
                  }}
                  onClick={(e) => handleMarkerClick(e, marker)}
                >
                  {/* Marker Flag */}
                  <div
                    className={`h-full flex items-center justify-center transition-all ${
                      isSelected ? 'scale-110' : 'hover:scale-105'
                    }`}
                    style={{
                      width: '2px',
                      backgroundColor: marker.color,
                      boxShadow: isSelected ? `0 0 8px ${marker.color}` : 'none',
                    }}
                  >
                    <div
                      className="absolute -top-1 w-3 h-3 rotate-45"
                      style={{ backgroundColor: marker.color }}
                    />
                  </div>

                  {/* Marker Name */}
                  {isEditing ? (
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={saveEdit}
                      onKeyDown={handleKeyDown}
                      className="absolute top-full mt-1 h-5 text-[10px] px-1 w-20"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div
                      className={`absolute top-full mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${
                        isSelected ? 'ring-1 ring-white/50' : ''
                      }`}
                      style={{
                        backgroundColor: marker.color,
                        color: 'white',
                      }}
                    >
                      {marker.name}
                    </div>
                  )}
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onClick={() => startEdit(marker)}>
                  <Edit2 className="h-3 w-3 mr-2" />
                  Rename
                </ContextMenuItem>
                <ContextMenuItem onClick={() => deleteMarker(marker.id)}>
                  <X className="h-3 w-3 mr-2" />
                  Delete
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}

        {/* Current time indicator */}
        {duration > 0 && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white/30 pointer-events-none"
            style={{
              left: `${(currentTime / duration) * 100}%`,
            }}
          />
        )}
      </div>
    </div>
  );
}
