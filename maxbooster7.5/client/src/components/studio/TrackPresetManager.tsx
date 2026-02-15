import { useState, useMemo, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Search,
  Mic,
  Music,
  Speaker,
  Guitar,
  Waves,
  Piano,
  Sparkles,
  Layers,
  Settings,
  Check,
  Plus,
  Save,
  Trash2,
  Edit3,
  Download,
  Upload,
  Undo,
  ChevronRight,
  Sliders,
  X,
  Copy,
  Lock,
  FileJson,
  ArrowRight,
  ArrowRightLeft,
} from 'lucide-react';
import {
  TrackPreset,
  PresetCategory,
  PresetEffect,
  StudioTrackSnapshot,
  PresetUndoState,
  CATEGORY_INFO,
  FACTORY_PRESETS,
  getAllPresets,
  getUserPresets,
  saveUserPreset,
  updateUserPreset,
  deleteUserPreset,
  filterPresets,
  getPresetPreview,
  exportPresets,
  importPresets,
  getLastUndoState,
  saveUndoState,
  createPresetFromTrack,
} from '@/lib/trackPresets';

interface TrackPresetManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTrack?: StudioTrackSnapshot;
  selectedTracks?: StudioTrackSnapshot[];
  onApplyPreset?: (preset: TrackPreset, trackId: string) => void;
  onApplyPresetToMultiple?: (preset: TrackPreset, trackIds: string[]) => void;
  onUndoPreset?: (trackId: string, previousData: Partial<StudioTrackSnapshot>) => void;
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  Mic: Mic,
  Drum: Music,
  Speaker: Speaker,
  Guitar: Guitar,
  Waves: Waves,
  Piano: Piano,
  Music: Music,
  Sparkles: Sparkles,
  Layers: Layers,
  Settings: Settings,
};

function getCategoryIcon(iconName: string): React.ElementType {
  return CATEGORY_ICONS[iconName] || Settings;
}

function EffectTypeIcon({ type }: { type: string }) {
  const iconClasses = 'w-3 h-3';
  switch (type) {
    case 'eq':
      return <Sliders className={iconClasses} />;
    case 'compressor':
      return <Waves className={iconClasses} />;
    case 'reverb':
      return <Sparkles className={iconClasses} />;
    case 'delay':
      return <ArrowRightLeft className={iconClasses} />;
    case 'gate':
      return <Lock className={iconClasses} />;
    default:
      return <Settings className={iconClasses} />;
  }
}

function EffectChainVisualization({ effects }: { effects: PresetEffect[] }) {
  if (effects.length === 0) {
    return (
      <div
        className="text-xs text-center py-4"
        style={{ color: 'var(--studio-text-subtle)' }}
      >
        No effects in chain
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {effects.map((effect, index) => (
        <div key={effect.id} className="flex items-center gap-1">
          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs ${
              effect.bypass ? 'opacity-50' : ''
            }`}
            style={{
              backgroundColor: 'var(--studio-bg-deep)',
              border: '1px solid var(--studio-border-subtle)',
              color: 'var(--studio-text)',
            }}
          >
            <EffectTypeIcon type={effect.type} />
            <span>{effect.name}</span>
            {effect.bypass && (
              <span className="text-[10px]" style={{ color: 'var(--studio-text-subtle)' }}>
                (OFF)
              </span>
            )}
          </div>
          {index < effects.length - 1 && (
            <ArrowRight className="w-3 h-3" style={{ color: 'var(--studio-text-subtle)' }} />
          )}
        </div>
      ))}
    </div>
  );
}

function PresetCard({
  preset,
  isSelected,
  onClick,
  onDoubleClick,
}: {
  preset: TrackPreset;
  isSelected: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
}) {
  const Icon = getCategoryIcon(preset.icon);
  const preview = getPresetPreview(preset);

  return (
    <div
      className={`relative p-3 rounded-lg cursor-pointer transition-all duration-200 border ${
        isSelected
          ? 'border-[var(--studio-accent)] shadow-lg'
          : 'border-[var(--studio-border-subtle)] hover:border-[var(--studio-border)]'
      }`}
      style={{
        backgroundColor: isSelected
          ? 'var(--studio-surface-elevated)'
          : 'var(--studio-surface)',
        boxShadow: isSelected
          ? '0 0 20px rgba(74, 158, 255, 0.15)'
          : undefined,
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {isSelected && (
        <div
          className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, var(--studio-accent) 0%, var(--studio-accent-active) 100%)',
          }}
        >
          <Check className="w-2.5 h-2.5 text-white" />
        </div>
      )}

      <div className="flex items-start gap-2">
        <div
          className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
          style={{
            backgroundColor: `${preset.color}20`,
            border: `1px solid ${preset.color}40`,
          }}
        >
          <Icon className="w-4 h-4" style={{ color: preset.color }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3
              className="font-medium text-sm truncate"
              style={{ color: 'var(--studio-text)' }}
            >
              {preset.name}
            </h3>
            {preset.isFactory && (
              <Lock className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--studio-text-subtle)' }} />
            )}
          </div>
          <p
            className="text-xs mt-0.5 line-clamp-1"
            style={{ color: 'var(--studio-text-muted)' }}
          >
            {preset.description}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2">
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0"
          style={{
            borderColor: `${preset.color}40`,
            color: preset.color,
            backgroundColor: `${preset.color}10`,
          }}
        >
          {CATEGORY_INFO[preset.category].name}
        </Badge>
        <span
          className="text-[10px]"
          style={{ color: 'var(--studio-text-subtle)' }}
        >
          {preview.effectCount} {preview.effectCount === 1 ? 'effect' : 'effects'}
        </span>
        {preview.sendCount > 0 && (
          <span
            className="text-[10px]"
            style={{ color: 'var(--studio-text-subtle)' }}
          >
            {preview.sendCount} {preview.sendCount === 1 ? 'send' : 'sends'}
          </span>
        )}
      </div>
    </div>
  );
}

function PresetDetailsPanel({
  preset,
  onApply,
  onApplyToMultiple,
  onEdit,
  onDelete,
  canApplyToMultiple,
  isUserPreset,
}: {
  preset: TrackPreset;
  onApply: () => void;
  onApplyToMultiple?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  canApplyToMultiple: boolean;
  isUserPreset: boolean;
}) {
  const Icon = getCategoryIcon(preset.icon);
  const preview = getPresetPreview(preset);

  return (
    <div
      className="h-full flex flex-col rounded-lg overflow-hidden"
      style={{ backgroundColor: 'var(--studio-bg-medium)' }}
    >
      <div
        className="p-4 border-b"
        style={{
          borderColor: 'var(--studio-border)',
          background: `linear-gradient(135deg, ${preset.color}10 0%, transparent 100%)`,
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-lg flex items-center justify-center"
            style={{
              backgroundColor: `${preset.color}25`,
              border: `1px solid ${preset.color}50`,
            }}
          >
            <Icon className="w-6 h-6" style={{ color: preset.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2
                className="font-bold text-lg truncate"
                style={{ color: 'var(--studio-text)' }}
              >
                {preset.name}
              </h2>
              {preset.isFactory && (
                <Badge
                  variant="outline"
                  className="text-[10px] flex-shrink-0"
                  style={{ borderColor: 'var(--studio-border)', color: 'var(--studio-text-subtle)' }}
                >
                  Factory
                </Badge>
              )}
            </div>
            <Badge
              variant="outline"
              className="text-[10px] mt-1"
              style={{
                borderColor: `${preset.color}40`,
                color: preset.color,
                backgroundColor: `${preset.color}10`,
              }}
            >
              {CATEGORY_INFO[preset.category].name}
            </Badge>
          </div>
        </div>
        <p
          className="text-sm mt-3"
          style={{ color: 'var(--studio-text-muted)' }}
        >
          {preset.description}
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          <div>
            <h3
              className="text-xs font-semibold uppercase mb-2 flex items-center gap-2"
              style={{ color: 'var(--studio-text-subtle)' }}
            >
              <Layers className="w-3.5 h-3.5" />
              Effect Chain
            </h3>
            <EffectChainVisualization effects={preset.data.effects} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div
              className="p-3 rounded-lg"
              style={{ backgroundColor: 'var(--studio-bg-deep)' }}
            >
              <div
                className="text-xs font-medium"
                style={{ color: 'var(--studio-text-subtle)' }}
              >
                Effects
              </div>
              <div
                className="text-lg font-bold mt-1"
                style={{ color: 'var(--studio-text)' }}
              >
                {preview.effectCount}
              </div>
            </div>
            <div
              className="p-3 rounded-lg"
              style={{ backgroundColor: 'var(--studio-bg-deep)' }}
            >
              <div
                className="text-xs font-medium"
                style={{ color: 'var(--studio-text-subtle)' }}
              >
                Sends
              </div>
              <div
                className="text-lg font-bold mt-1"
                style={{ color: 'var(--studio-text)' }}
              >
                {preview.sendCount}
              </div>
            </div>
          </div>

          <div
            className="p-3 rounded-lg"
            style={{ backgroundColor: 'var(--studio-bg-deep)' }}
          >
            <div
              className="text-xs font-medium mb-2"
              style={{ color: 'var(--studio-text-subtle)' }}
            >
              Track Settings
            </div>
            <div className="space-y-1.5 text-xs" style={{ color: 'var(--studio-text-muted)' }}>
              <div className="flex justify-between">
                <span>Track Type</span>
                <span style={{ color: 'var(--studio-text)' }}>{preset.data.trackType}</span>
              </div>
              <div className="flex justify-between">
                <span>Volume</span>
                <span style={{ color: 'var(--studio-text)' }}>{Math.round(preset.data.volume * 100)}%</span>
              </div>
              <div className="flex justify-between">
                <span>Pan</span>
                <span style={{ color: 'var(--studio-text)' }}>
                  {preset.data.pan === 0 ? 'C' : preset.data.pan > 0 ? `R${Math.round(preset.data.pan * 100)}` : `L${Math.round(Math.abs(preset.data.pan) * 100)}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Output Bus</span>
                <span style={{ color: 'var(--studio-text)' }}>{preset.data.outputBus}</span>
              </div>
            </div>
          </div>

          {preset.data.sends.length > 0 && (
            <div>
              <h3
                className="text-xs font-semibold uppercase mb-2"
                style={{ color: 'var(--studio-text-subtle)' }}
              >
                Sends
              </h3>
              <div className="space-y-1.5">
                {preset.data.sends.map((send) => (
                  <div
                    key={send.busId}
                    className="flex items-center justify-between px-2 py-1.5 rounded text-xs"
                    style={{ backgroundColor: 'var(--studio-bg-deep)' }}
                  >
                    <span style={{ color: 'var(--studio-text-muted)' }}>{send.busName}</span>
                    <span style={{ color: 'var(--studio-text)' }}>{Math.round(send.level * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {preset.tags.length > 0 && (
            <div>
              <h3
                className="text-xs font-semibold uppercase mb-2"
                style={{ color: 'var(--studio-text-subtle)' }}
              >
                Tags
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {preset.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="text-[10px]"
                    style={{
                      backgroundColor: 'var(--studio-bg-light)',
                      color: 'var(--studio-text-muted)',
                    }}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {preset.author && (
            <div
              className="text-xs pt-2 border-t"
              style={{
                color: 'var(--studio-text-subtle)',
                borderColor: 'var(--studio-border-subtle)',
              }}
            >
              Created by {preset.author}
            </div>
          )}
        </div>
      </ScrollArea>

      <div
        className="p-4 border-t space-y-2"
        style={{ borderColor: 'var(--studio-border)' }}
      >
        <div className="flex gap-2">
          <Button
            onClick={onApply}
            className="flex-1 studio-btn-accent"
          >
            <ArrowRight className="w-4 h-4 mr-1" />
            Apply to Track
          </Button>
          {canApplyToMultiple && onApplyToMultiple && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={onApplyToMultiple}
                    variant="outline"
                    size="icon"
                    style={{
                      borderColor: 'var(--studio-border)',
                      backgroundColor: 'var(--studio-surface)',
                    }}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Apply to Selected Tracks</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className="flex gap-2">
          {isUserPreset && (
            <>
              <Button
                onClick={onEdit}
                variant="ghost"
                size="sm"
                className="flex-1"
                style={{ color: 'var(--studio-text)' }}
              >
                <Edit3 className="w-3.5 h-3.5 mr-1" />
                Edit
              </Button>
              <Button
                onClick={onDelete}
                variant="ghost"
                size="sm"
                className="flex-1 text-red-400 hover:text-red-300 hover:bg-red-400/10"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Delete
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SavePresetDialog({
  open,
  onOpenChange,
  onSave,
  track,
  editPreset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (preset: TrackPreset) => void;
  track?: StudioTrackSnapshot;
  editPreset?: TrackPreset;
}) {
  const [name, setName] = useState(editPreset?.name || '');
  const [description, setDescription] = useState(editPreset?.description || '');
  const [category, setCategory] = useState<PresetCategory>(editPreset?.category || 'custom');
  const [tags, setTags] = useState(editPreset?.tags.join(', ') || '');

  const handleSave = () => {
    if (!name.trim()) return;

    const tagList = tags
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);

    if (editPreset) {
      const updated = updateUserPreset(editPreset.id, {
        name: name.trim(),
        description: description.trim(),
        category,
        tags: tagList,
        icon: CATEGORY_INFO[category].icon,
        color: CATEGORY_INFO[category].color,
      });
      if (updated) {
        onSave(updated);
      }
    } else if (track) {
      const preset = createPresetFromTrack(track, name.trim(), description.trim(), category, tagList);
      const saved = saveUserPreset(preset);
      onSave(saved);
    }

    setName('');
    setDescription('');
    setCategory('custom');
    setTags('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md"
        style={{
          backgroundColor: 'var(--studio-bg-medium)',
          borderColor: 'var(--studio-border)',
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: 'var(--studio-text)' }}>
            {editPreset ? 'Edit Preset' : 'Save as Preset'}
          </DialogTitle>
          <DialogDescription style={{ color: 'var(--studio-text-muted)' }}>
            {editPreset
              ? 'Update the preset metadata.'
              : 'Save the current track configuration as a reusable preset.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="preset-name" style={{ color: 'var(--studio-text)' }}>
              Preset Name
            </Label>
            <Input
              id="preset-name"
              placeholder="My Custom Preset"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                backgroundColor: 'var(--studio-bg-deep)',
                borderColor: 'var(--studio-border)',
                color: 'var(--studio-text)',
              }}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="preset-category" style={{ color: 'var(--studio-text)' }}>
              Category
            </Label>
            <div className="grid grid-cols-5 gap-1">
              {(Object.keys(CATEGORY_INFO) as PresetCategory[]).map((cat) => {
                const Icon = getCategoryIcon(CATEGORY_INFO[cat].icon);
                const isActive = category === cat;
                return (
                  <TooltipProvider key={cat}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setCategory(cat)}
                          className={`p-2 rounded flex items-center justify-center transition-all ${
                            isActive ? 'ring-2 ring-offset-1' : ''
                          }`}
                          style={{
                            backgroundColor: isActive ? `${CATEGORY_INFO[cat].color}20` : 'var(--studio-bg-deep)',
                            borderColor: isActive ? CATEGORY_INFO[cat].color : 'var(--studio-border-subtle)',
                            ringColor: CATEGORY_INFO[cat].color,
                          }}
                        >
                          <Icon
                            className="w-4 h-4"
                            style={{ color: isActive ? CATEGORY_INFO[cat].color : 'var(--studio-text-muted)' }}
                          />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{CATEGORY_INFO[cat].name}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="preset-description" style={{ color: 'var(--studio-text)' }}>
              Description (optional)
            </Label>
            <Textarea
              id="preset-description"
              placeholder="Describe what this preset is best used for..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={{
                backgroundColor: 'var(--studio-bg-deep)',
                borderColor: 'var(--studio-border)',
                color: 'var(--studio-text)',
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="preset-tags" style={{ color: 'var(--studio-text)' }}>
              Tags (comma separated)
            </Label>
            <Input
              id="preset-tags"
              placeholder="vocal, warm, compression"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              style={{
                backgroundColor: 'var(--studio-bg-deep)',
                borderColor: 'var(--studio-border)',
                color: 'var(--studio-text)',
              }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            style={{ color: 'var(--studio-text)' }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim()}
            className="studio-btn-accent"
          >
            <Save className="w-4 h-4 mr-2" />
            {editPreset ? 'Update Preset' : 'Save Preset'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteConfirmDialog({
  open,
  onOpenChange,
  presetName,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presetName: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-sm"
        style={{
          backgroundColor: 'var(--studio-bg-medium)',
          borderColor: 'var(--studio-border)',
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: 'var(--studio-text)' }}>Delete Preset</DialogTitle>
          <DialogDescription style={{ color: 'var(--studio-text-muted)' }}>
            Are you sure you want to delete "{presetName}"? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            style={{ color: 'var(--studio-text)' }}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategorySidebar({
  activeCategory,
  onCategoryChange,
  presetCounts,
}: {
  activeCategory: string;
  onCategoryChange: (category: string) => void;
  presetCounts: Record<string, number>;
}) {
  const categories = ['all', ...Object.keys(CATEGORY_INFO)];

  return (
    <div className="w-48 flex-shrink-0 space-y-1">
      {categories.map((cat) => {
        const isActive = activeCategory === cat;
        const catInfo = cat === 'all' ? null : CATEGORY_INFO[cat as PresetCategory];
        const Icon = cat === 'all' ? Layers : getCategoryIcon(catInfo?.icon || 'Settings');
        const count = cat === 'all' ? Object.values(presetCounts).reduce((a, b) => a + b, 0) : presetCounts[cat] || 0;

        return (
          <button
            key={cat}
            onClick={() => onCategoryChange(cat)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
              isActive ? 'font-medium' : ''
            }`}
            style={{
              backgroundColor: isActive ? 'var(--studio-surface-elevated)' : 'transparent',
              color: isActive ? 'var(--studio-text)' : 'var(--studio-text-muted)',
              border: isActive ? '1px solid var(--studio-border)' : '1px solid transparent',
            }}
          >
            <Icon
              className="w-4 h-4"
              style={{ color: isActive && catInfo ? catInfo.color : 'currentColor' }}
            />
            <span className="flex-1 text-left capitalize">{cat === 'all' ? 'All Presets' : catInfo?.name}</span>
            <span
              className="text-xs px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: isActive ? 'var(--studio-bg-deep)' : 'var(--studio-surface)',
                color: 'var(--studio-text-subtle)',
              }}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function TrackPresetManager({
  open,
  onOpenChange,
  selectedTrack,
  selectedTracks = [],
  onApplyPreset,
  onApplyPresetToMultiple,
  onUndoPreset,
}: TrackPresetManagerProps) {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<TrackPreset | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingPreset, setEditingPreset] = useState<TrackPreset | null>(null);
  const [lastAppliedUndo, setLastAppliedUndo] = useState<PresetUndoState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allPresets = useMemo(() => getAllPresets(), [open]);

  const presetCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allPresets.forEach((p) => {
      counts[p.category] = (counts[p.category] || 0) + 1;
    });
    return counts;
  }, [allPresets]);

  const filteredPresets = useMemo(() => {
    const options: Parameters<typeof filterPresets>[0] = {};
    
    if (activeCategory !== 'all') {
      options.category = activeCategory as PresetCategory;
    }
    
    if (searchQuery) {
      options.search = searchQuery;
    }
    
    return filterPresets(options);
  }, [activeCategory, searchQuery, allPresets]);

  const handleApplyPreset = useCallback(() => {
    if (!selectedPreset || !selectedTrack || !onApplyPreset) return;

    const undoState: PresetUndoState = {
      trackId: selectedTrack.id,
      previousData: { ...selectedTrack },
      presetId: selectedPreset.id,
      appliedAt: new Date(),
    };
    saveUndoState(undoState);
    setLastAppliedUndo(undoState);

    onApplyPreset(selectedPreset, selectedTrack.id);
  }, [selectedPreset, selectedTrack, onApplyPreset]);

  const handleApplyToMultiple = useCallback(() => {
    if (!selectedPreset || selectedTracks.length === 0 || !onApplyPresetToMultiple) return;

    selectedTracks.forEach((track) => {
      const undoState: PresetUndoState = {
        trackId: track.id,
        previousData: { ...track },
        presetId: selectedPreset.id,
        appliedAt: new Date(),
      };
      saveUndoState(undoState);
    });

    onApplyPresetToMultiple(selectedPreset, selectedTracks.map((t) => t.id));
  }, [selectedPreset, selectedTracks, onApplyPresetToMultiple]);

  const handleUndo = useCallback(() => {
    if (!lastAppliedUndo || !onUndoPreset) return;
    onUndoPreset(lastAppliedUndo.trackId, lastAppliedUndo.previousData as Partial<StudioTrackSnapshot>);
    setLastAppliedUndo(null);
  }, [lastAppliedUndo, onUndoPreset]);

  const handleDeletePreset = useCallback(() => {
    if (!selectedPreset || selectedPreset.isFactory) return;
    deleteUserPreset(selectedPreset.id);
    setSelectedPreset(null);
  }, [selectedPreset]);

  const handleExport = useCallback(() => {
    const userPresets = getUserPresets();
    if (userPresets.length === 0) {
      return;
    }
    
    const json = exportPresets(userPresets);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `track-presets-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleImport = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const result = importPresets(content);
      if (result.success) {
        setSelectedPreset(null);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }, []);

  const handleSavePreset = useCallback((preset: TrackPreset) => {
    setSelectedPreset(preset);
    setEditingPreset(null);
  }, []);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-5xl h-[80vh] flex flex-col p-0"
          style={{
            backgroundColor: 'var(--studio-bg-dark)',
            borderColor: 'var(--studio-border)',
          }}
        >
          <DialogHeader className="px-6 pt-6 pb-4 border-b" style={{ borderColor: 'var(--studio-border)' }}>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle
                  className="text-xl font-bold"
                  style={{ color: 'var(--studio-text)' }}
                >
                  Track Presets
                </DialogTitle>
                <DialogDescription style={{ color: 'var(--studio-text-muted)' }}>
                  Browse and apply track presets, or save your own configurations.
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                {lastAppliedUndo && onUndoPreset && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={handleUndo}
                          variant="outline"
                          size="sm"
                          style={{
                            borderColor: 'var(--studio-border)',
                            backgroundColor: 'var(--studio-surface)',
                          }}
                        >
                          <Undo className="w-4 h-4 mr-1" />
                          Undo
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Undo last preset application</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={handleExport}
                        variant="ghost"
                        size="icon"
                        style={{ color: 'var(--studio-text)' }}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Export User Presets</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => fileInputRef.current?.click()}
                        variant="ghost"
                        size="icon"
                        style={{ color: 'var(--studio-text)' }}
                      >
                        <Upload className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Import Presets</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  className="hidden"
                />
                {selectedTrack && (
                  <Button
                    onClick={() => setShowSaveDialog(true)}
                    className="studio-btn-accent"
                    size="sm"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Save Current Track
                  </Button>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 flex overflow-hidden">
            <div className="flex flex-col flex-1 min-w-0">
              <div className="px-6 py-3 border-b" style={{ borderColor: 'var(--studio-border-subtle)' }}>
                <div className="relative">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                    style={{ color: 'var(--studio-text-subtle)' }}
                  />
                  <Input
                    placeholder="Search presets..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                    style={{
                      backgroundColor: 'var(--studio-bg-medium)',
                      borderColor: 'var(--studio-border)',
                      color: 'var(--studio-text)',
                    }}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: 'var(--studio-text-subtle)' }}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 flex overflow-hidden p-4 gap-4">
                <CategorySidebar
                  activeCategory={activeCategory}
                  onCategoryChange={setActiveCategory}
                  presetCounts={presetCounts}
                />

                <ScrollArea className="flex-1">
                  <div className="grid grid-cols-2 gap-3 pr-4">
                    {filteredPresets.length === 0 ? (
                      <div
                        className="col-span-2 flex flex-col items-center justify-center py-12 text-center"
                        style={{ color: 'var(--studio-text-muted)' }}
                      >
                        <Layers className="w-12 h-12 mb-4 opacity-50" />
                        <p className="font-medium">No presets found</p>
                        <p className="text-sm mt-1">Try adjusting your search or category filter.</p>
                      </div>
                    ) : (
                      filteredPresets.map((preset) => (
                        <PresetCard
                          key={preset.id}
                          preset={preset}
                          isSelected={selectedPreset?.id === preset.id}
                          onClick={() => setSelectedPreset(preset)}
                          onDoubleClick={handleApplyPreset}
                        />
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>

            {selectedPreset && (
              <div
                className="w-80 flex-shrink-0 border-l"
                style={{ borderColor: 'var(--studio-border)' }}
              >
                <PresetDetailsPanel
                  preset={selectedPreset}
                  onApply={handleApplyPreset}
                  onApplyToMultiple={selectedTracks.length > 1 ? handleApplyToMultiple : undefined}
                  onEdit={() => {
                    setEditingPreset(selectedPreset);
                    setShowSaveDialog(true);
                  }}
                  onDelete={() => setShowDeleteDialog(true)}
                  canApplyToMultiple={selectedTracks.length > 1}
                  isUserPreset={selectedPreset.isUserPreset}
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <SavePresetDialog
        open={showSaveDialog}
        onOpenChange={setShowSaveDialog}
        onSave={handleSavePreset}
        track={editingPreset ? undefined : selectedTrack}
        editPreset={editingPreset || undefined}
      />

      <DeleteConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        presetName={selectedPreset?.name || ''}
        onConfirm={handleDeletePreset}
      />
    </>
  );
}
