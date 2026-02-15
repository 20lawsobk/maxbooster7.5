import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useStudioStore } from '@/lib/studioStore';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  Settings2,
  ChevronDown,
  ChevronUp,
  Layout,
  Palette,
  Keyboard,
  Save,
  RotateCcw,
  GripVertical,
  Eye,
  EyeOff,
  Layers,
  ZoomIn,
  Activity,
  Mic,
  Sliders,
  Headphones,
  Trash2,
  Plus,
  Check,
  X,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const STORAGE_KEY = 'maxbooster_studio_ui_preferences';

interface PanelConfig {
  id: string;
  name: string;
  visible: boolean;
  order: number;
}

interface ToolbarButton {
  id: string;
  name: string;
  visible: boolean;
}

interface KeyboardShortcut {
  id: string;
  name: string;
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

interface LayoutPreset {
  id: string;
  name: string;
  panels: PanelConfig[];
  toolbarButtons: ToolbarButton[];
  theme: ThemeConfig;
  zoomLevel: number;
}

interface ThemeConfig {
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  borderColor: string;
}

interface MeterSettings {
  ballistics: 'fast' | 'medium' | 'slow';
  peakHold: number;
  falloff: number;
}

interface UIPreferences {
  panels: PanelConfig[];
  toolbarButtons: ToolbarButton[];
  theme: ThemeConfig;
  shortcuts: KeyboardShortcut[];
  zoomLevel: number;
  meterSettings: MeterSettings;
  layoutPresets: LayoutPreset[];
  activePreset: string | null;
}

const DEFAULT_PANELS: PanelConfig[] = [
  { id: 'browser', name: 'Browser', visible: true, order: 0 },
  { id: 'inspector', name: 'Inspector', visible: true, order: 1 },
  { id: 'mixer', name: 'Mixer', visible: true, order: 2 },
  { id: 'timeline', name: 'Timeline', visible: true, order: 3 },
  { id: 'transport', name: 'Transport', visible: true, order: 4 },
  { id: 'routing', name: 'Routing Matrix', visible: false, order: 5 },
  { id: 'aiAssistant', name: 'AI Assistant', visible: false, order: 6 },
  { id: 'lyrics', name: 'Lyrics', visible: false, order: 7 },
  { id: 'analysis', name: 'Analysis', visible: false, order: 8 },
];

const DEFAULT_TOOLBAR_BUTTONS: ToolbarButton[] = [
  { id: 'save', name: 'Save', visible: true },
  { id: 'undo', name: 'Undo', visible: true },
  { id: 'redo', name: 'Redo', visible: true },
  { id: 'addTrack', name: 'Add Track', visible: true },
  { id: 'export', name: 'Export', visible: true },
  { id: 'aiMix', name: 'AI Mix', visible: true },
  { id: 'aiMaster', name: 'AI Master', visible: true },
  { id: 'distribute', name: 'Distribute', visible: true },
  { id: 'metronome', name: 'Metronome', visible: true },
  { id: 'snap', name: 'Snap', visible: true },
  { id: 'loop', name: 'Loop', visible: true },
];

const DEFAULT_THEME: ThemeConfig = {
  accentColor: '#3b82f6',
  backgroundColor: '#1a1a2e',
  textColor: '#e5e5e5',
  borderColor: '#2a2a4a',
};

const DEFAULT_SHORTCUTS: KeyboardShortcut[] = [
  { id: 'playPause', name: 'Play/Pause', key: 'Space' },
  { id: 'stop', name: 'Stop', key: 'S' },
  { id: 'record', name: 'Record', key: 'R' },
  { id: 'mute', name: 'Mute Track', key: 'M' },
  { id: 'solo', name: 'Solo Track', key: 'O' },
  { id: 'delete', name: 'Delete', key: 'Delete' },
  { id: 'save', name: 'Save', key: 'S', ctrl: true },
  { id: 'undo', name: 'Undo', key: 'Z', ctrl: true },
  { id: 'redo', name: 'Redo', key: 'Y', ctrl: true },
  { id: 'duplicate', name: 'Duplicate', key: 'D', ctrl: true },
  { id: 'selectAll', name: 'Select All', key: 'A', ctrl: true },
  { id: 'zoomIn', name: 'Zoom In', key: '=', ctrl: true },
  { id: 'zoomOut', name: 'Zoom Out', key: '-', ctrl: true },
  { id: 'loop', name: 'Toggle Loop', key: 'L' },
  { id: 'metronome', name: 'Toggle Metronome', key: 'K' },
];

const DEFAULT_METER_SETTINGS: MeterSettings = {
  ballistics: 'medium',
  peakHold: 2000,
  falloff: 12,
};

const WORKFLOW_PRESETS: LayoutPreset[] = [
  {
    id: 'recording',
    name: 'Recording',
    panels: [
      { id: 'browser', name: 'Browser', visible: false, order: 0 },
      { id: 'inspector', name: 'Inspector', visible: true, order: 1 },
      { id: 'mixer', name: 'Mixer', visible: false, order: 2 },
      { id: 'timeline', name: 'Timeline', visible: true, order: 3 },
      { id: 'transport', name: 'Transport', visible: true, order: 4 },
      { id: 'routing', name: 'Routing Matrix', visible: true, order: 5 },
      { id: 'aiAssistant', name: 'AI Assistant', visible: false, order: 6 },
      { id: 'lyrics', name: 'Lyrics', visible: false, order: 7 },
      { id: 'analysis', name: 'Analysis', visible: false, order: 8 },
    ],
    toolbarButtons: DEFAULT_TOOLBAR_BUTTONS,
    theme: DEFAULT_THEME,
    zoomLevel: 1.0,
  },
  {
    id: 'mixing',
    name: 'Mixing',
    panels: [
      { id: 'browser', name: 'Browser', visible: true, order: 0 },
      { id: 'inspector', name: 'Inspector', visible: true, order: 1 },
      { id: 'mixer', name: 'Mixer', visible: true, order: 2 },
      { id: 'timeline', name: 'Timeline', visible: true, order: 3 },
      { id: 'transport', name: 'Transport', visible: true, order: 4 },
      { id: 'routing', name: 'Routing Matrix', visible: true, order: 5 },
      { id: 'aiAssistant', name: 'AI Assistant', visible: true, order: 6 },
      { id: 'lyrics', name: 'Lyrics', visible: false, order: 7 },
      { id: 'analysis', name: 'Analysis', visible: true, order: 8 },
    ],
    toolbarButtons: DEFAULT_TOOLBAR_BUTTONS,
    theme: DEFAULT_THEME,
    zoomLevel: 1.5,
  },
  {
    id: 'mastering',
    name: 'Mastering',
    panels: [
      { id: 'browser', name: 'Browser', visible: false, order: 0 },
      { id: 'inspector', name: 'Inspector', visible: true, order: 1 },
      { id: 'mixer', name: 'Mixer', visible: true, order: 2 },
      { id: 'timeline', name: 'Timeline', visible: true, order: 3 },
      { id: 'transport', name: 'Transport', visible: true, order: 4 },
      { id: 'routing', name: 'Routing Matrix', visible: false, order: 5 },
      { id: 'aiAssistant', name: 'AI Assistant', visible: true, order: 6 },
      { id: 'lyrics', name: 'Lyrics', visible: false, order: 7 },
      { id: 'analysis', name: 'Analysis', visible: true, order: 8 },
    ],
    toolbarButtons: DEFAULT_TOOLBAR_BUTTONS,
    theme: DEFAULT_THEME,
    zoomLevel: 2.0,
  },
];

const DEFAULT_PREFERENCES: UIPreferences = {
  panels: DEFAULT_PANELS,
  toolbarButtons: DEFAULT_TOOLBAR_BUTTONS,
  theme: DEFAULT_THEME,
  shortcuts: DEFAULT_SHORTCUTS,
  zoomLevel: 1.0,
  meterSettings: DEFAULT_METER_SETTINGS,
  layoutPresets: WORKFLOW_PRESETS,
  activePreset: null,
};

interface CollapsibleSectionProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

function CollapsibleSection({
  title,
  icon,
  children,
  defaultExpanded = true,
}: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="border-b" style={{ borderColor: 'var(--studio-border)' }}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon && <div style={{ color: 'var(--studio-text-muted)' }}>{icon}</div>}
          <span className="text-sm font-bold tracking-wide" style={{ color: 'var(--studio-text)' }}>
            {title}
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4" style={{ color: 'var(--studio-text-muted)' }} />
        ) : (
          <ChevronDown className="h-4 w-4" style={{ color: 'var(--studio-text-muted)' }} />
        )}
      </button>
      {isExpanded && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

interface SortablePanelItemProps {
  panel: PanelConfig;
  onToggle: (id: string) => void;
}

function SortablePanelItem({ panel, onToggle }: SortablePanelItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: panel.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-2 rounded hover:bg-white/5"
      {...attributes}
    >
      <div {...listeners} className="cursor-grab">
        <GripVertical className="h-4 w-4" style={{ color: 'var(--studio-text-subtle)' }} />
      </div>
      <div className="flex-1 flex items-center gap-2">
        {panel.visible ? (
          <Eye className="h-4 w-4" style={{ color: 'var(--studio-accent)' }} />
        ) : (
          <EyeOff className="h-4 w-4" style={{ color: 'var(--studio-text-subtle)' }} />
        )}
        <span
          className="text-sm"
          style={{
            color: panel.visible ? 'var(--studio-text)' : 'var(--studio-text-subtle)',
          }}
        >
          {panel.name}
        </span>
      </div>
      <Switch checked={panel.visible} onCheckedChange={() => onToggle(panel.id)} />
    </div>
  );
}

interface UICustomizerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplyPreferences?: (preferences: UIPreferences) => void;
}

export function UICustomizer({ open, onOpenChange, onApplyPreferences }: UICustomizerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const {
    browserVisible,
    inspectorVisible,
    routingMatrixVisible,
    toggleBrowser,
    toggleInspector,
    toggleRoutingMatrix,
    zoom,
    setZoom,
  } = useStudioStore();

  const [preferences, setPreferences] = useState<UIPreferences>(DEFAULT_PREFERENCES);
  const [activeTab, setActiveTab] = useState('panels');
  const [editingShortcut, setEditingShortcut] = useState<string | null>(null);
  const [newPresetName, setNewPresetName] = useState('');
  const [showSavePresetDialog, setShowSavePresetDialog] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setPreferences({ ...DEFAULT_PREFERENCES, ...parsed });
      } catch {
        setPreferences(DEFAULT_PREFERENCES);
      }
    }
  }, []);

  const { data: serverPreferences } = useQuery({
    queryKey: ['/api/user/preferences/studio'],
    enabled: open,
  });

  const savePreferencesMutation = useMutation({
    mutationFn: async (prefs: UIPreferences) => {
      return await apiRequest('PUT', '/api/user/preferences/studio', prefs);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/preferences/studio'] });
      toast({ title: 'Preferences saved' });
    },
    onError: () => {
      toast({ title: 'Failed to save preferences to server', variant: 'destructive' });
    },
  });

  const savePreferences = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    savePreferencesMutation.mutate(preferences);
    onApplyPreferences?.(preferences);
    applyPreferencesToStore();
  }, [preferences, savePreferencesMutation, onApplyPreferences]);

  const applyPreferencesToStore = useCallback(() => {
    const browserPanel = preferences.panels.find((p) => p.id === 'browser');
    const inspectorPanel = preferences.panels.find((p) => p.id === 'inspector');
    const routingPanel = preferences.panels.find((p) => p.id === 'routing');

    if (browserPanel && browserPanel.visible !== browserVisible) {
      toggleBrowser();
    }
    if (inspectorPanel && inspectorPanel.visible !== inspectorVisible) {
      toggleInspector();
    }
    if (routingPanel && routingPanel.visible !== routingMatrixVisible) {
      toggleRoutingMatrix();
    }
    if (preferences.zoomLevel !== zoom) {
      setZoom(preferences.zoomLevel);
    }
  }, [
    preferences,
    browserVisible,
    inspectorVisible,
    routingMatrixVisible,
    zoom,
    toggleBrowser,
    toggleInspector,
    toggleRoutingMatrix,
    setZoom,
  ]);

  const handlePanelToggle = (panelId: string) => {
    setPreferences((prev) => ({
      ...prev,
      panels: prev.panels.map((p) => (p.id === panelId ? { ...p, visible: !p.visible } : p)),
    }));
  };

  const handlePanelDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setPreferences((prev) => {
        const oldIndex = prev.panels.findIndex((p) => p.id === active.id);
        const newIndex = prev.panels.findIndex((p) => p.id === over.id);
        const reordered = arrayMove(prev.panels, oldIndex, newIndex);
        return {
          ...prev,
          panels: reordered.map((p, i) => ({ ...p, order: i })),
        };
      });
    }
  };

  const handleToolbarButtonToggle = (buttonId: string) => {
    setPreferences((prev) => ({
      ...prev,
      toolbarButtons: prev.toolbarButtons.map((b) =>
        b.id === buttonId ? { ...b, visible: !b.visible } : b
      ),
    }));
  };

  const handleThemeChange = (key: keyof ThemeConfig, value: string) => {
    setPreferences((prev) => ({
      ...prev,
      theme: { ...prev.theme, [key]: value },
    }));
  };

  const handleShortcutEdit = (shortcutId: string, newKey: string) => {
    setPreferences((prev) => ({
      ...prev,
      shortcuts: prev.shortcuts.map((s) => (s.id === shortcutId ? { ...s, key: newKey } : s)),
    }));
    setEditingShortcut(null);
  };

  const handleMeterSettingsChange = (key: keyof MeterSettings, value: any) => {
    setPreferences((prev) => ({
      ...prev,
      meterSettings: { ...prev.meterSettings, [key]: value },
    }));
  };

  const handleZoomChange = (value: number) => {
    setPreferences((prev) => ({ ...prev, zoomLevel: value }));
  };

  const applyWorkflowPreset = (presetId: string) => {
    const preset = preferences.layoutPresets.find((p) => p.id === presetId);
    if (preset) {
      setPreferences((prev) => ({
        ...prev,
        panels: preset.panels,
        toolbarButtons: preset.toolbarButtons,
        theme: preset.theme,
        zoomLevel: preset.zoomLevel,
        activePreset: presetId,
      }));
      toast({ title: `Applied "${preset.name}" layout` });
    }
  };

  const saveCurrentAsPreset = () => {
    if (!newPresetName.trim()) return;

    const newPreset: LayoutPreset = {
      id: `custom-${Date.now()}`,
      name: newPresetName.trim(),
      panels: [...preferences.panels],
      toolbarButtons: [...preferences.toolbarButtons],
      theme: { ...preferences.theme },
      zoomLevel: preferences.zoomLevel,
    };

    setPreferences((prev) => ({
      ...prev,
      layoutPresets: [...prev.layoutPresets, newPreset],
      activePreset: newPreset.id,
    }));

    setNewPresetName('');
    setShowSavePresetDialog(false);
    toast({ title: 'Preset saved' });
  };

  const deletePreset = (presetId: string) => {
    if (WORKFLOW_PRESETS.some((p) => p.id === presetId)) {
      toast({ title: 'Cannot delete built-in presets', variant: 'destructive' });
      return;
    }

    setPreferences((prev) => ({
      ...prev,
      layoutPresets: prev.layoutPresets.filter((p) => p.id !== presetId),
      activePreset: prev.activePreset === presetId ? null : prev.activePreset,
    }));
    toast({ title: 'Preset deleted' });
  };

  const resetToDefaults = () => {
    setPreferences(DEFAULT_PREFERENCES);
    localStorage.removeItem(STORAGE_KEY);
    toast({ title: 'Reset to defaults' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[85vh] overflow-hidden p-0"
        style={{
          background: 'var(--studio-bg-medium)',
          borderColor: 'var(--studio-border)',
        }}
      >
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle
            className="text-lg font-bold tracking-wide flex items-center gap-2"
            style={{ color: 'var(--studio-text)' }}
          >
            <Settings2 className="h-5 w-5" />
            UI Customizer
          </DialogTitle>
          <DialogDescription style={{ color: 'var(--studio-text-muted)' }}>
            Customize your studio interface layout, theme, and shortcuts
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList
            className="w-full h-12 grid grid-cols-5 rounded-none border-b mx-0"
            style={{
              background: 'var(--studio-bg-deep)',
              borderColor: 'var(--studio-border)',
            }}
          >
            <TabsTrigger
              value="panels"
              className="text-xs data-[state=active]:bg-white/10 gap-1.5"
              style={{ color: 'var(--studio-text-muted)' }}
            >
              <Layout className="h-3.5 w-3.5" />
              Panels
            </TabsTrigger>
            <TabsTrigger
              value="theme"
              className="text-xs data-[state=active]:bg-white/10 gap-1.5"
              style={{ color: 'var(--studio-text-muted)' }}
            >
              <Palette className="h-3.5 w-3.5" />
              Theme
            </TabsTrigger>
            <TabsTrigger
              value="shortcuts"
              className="text-xs data-[state=active]:bg-white/10 gap-1.5"
              style={{ color: 'var(--studio-text-muted)' }}
            >
              <Keyboard className="h-3.5 w-3.5" />
              Shortcuts
            </TabsTrigger>
            <TabsTrigger
              value="presets"
              className="text-xs data-[state=active]:bg-white/10 gap-1.5"
              style={{ color: 'var(--studio-text-muted)' }}
            >
              <Layers className="h-3.5 w-3.5" />
              Presets
            </TabsTrigger>
            <TabsTrigger
              value="meters"
              className="text-xs data-[state=active]:bg-white/10 gap-1.5"
              style={{ color: 'var(--studio-text-muted)' }}
            >
              <Activity className="h-3.5 w-3.5" />
              Meters
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[400px]">
            <TabsContent value="panels" className="mt-0 p-0">
              <CollapsibleSection title="PANEL VISIBILITY & ORDER" icon={<Eye className="h-4 w-4" />}>
                <p className="text-xs mb-3" style={{ color: 'var(--studio-text-muted)' }}>
                  Drag to reorder panels. Toggle visibility with the switch.
                </p>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handlePanelDragEnd}
                >
                  <SortableContext
                    items={preferences.panels.map((p) => p.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div
                      className="space-y-1 rounded-lg p-2"
                      style={{ background: 'var(--studio-bg-deep)' }}
                    >
                      {preferences.panels
                        .sort((a, b) => a.order - b.order)
                        .map((panel) => (
                          <SortablePanelItem
                            key={panel.id}
                            panel={panel}
                            onToggle={handlePanelToggle}
                          />
                        ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </CollapsibleSection>

              <CollapsibleSection
                title="TOOLBAR BUTTONS"
                icon={<Sliders className="h-4 w-4" />}
                defaultExpanded={false}
              >
                <div
                  className="space-y-1 rounded-lg p-2"
                  style={{ background: 'var(--studio-bg-deep)' }}
                >
                  {preferences.toolbarButtons.map((button) => (
                    <div
                      key={button.id}
                      className="flex items-center justify-between p-2 rounded hover:bg-white/5"
                    >
                      <span
                        className="text-sm"
                        style={{
                          color: button.visible ? 'var(--studio-text)' : 'var(--studio-text-subtle)',
                        }}
                      >
                        {button.name}
                      </span>
                      <Switch
                        checked={button.visible}
                        onCheckedChange={() => handleToolbarButtonToggle(button.id)}
                      />
                    </div>
                  ))}
                </div>
              </CollapsibleSection>

              <CollapsibleSection
                title="DEFAULT ZOOM"
                icon={<ZoomIn className="h-4 w-4" />}
                defaultExpanded={false}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs" style={{ color: 'var(--studio-text-muted)' }}>
                      Zoom Level
                    </Label>
                    <span className="text-xs font-mono" style={{ color: 'var(--studio-text)' }}>
                      {(preferences.zoomLevel * 100).toFixed(0)}%
                    </span>
                  </div>
                  <Slider
                    value={[preferences.zoomLevel]}
                    onValueChange={([val]) => handleZoomChange(val)}
                    min={0.25}
                    max={4}
                    step={0.25}
                    className="cursor-pointer"
                  />
                </div>
              </CollapsibleSection>
            </TabsContent>

            <TabsContent value="theme" className="mt-0 p-0">
              <CollapsibleSection title="COLOR THEME" icon={<Palette className="h-4 w-4" />}>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs" style={{ color: 'var(--studio-text-muted)' }}>
                      Accent Color
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={preferences.theme.accentColor}
                        onChange={(e) => handleThemeChange('accentColor', e.target.value)}
                        className="h-10 w-16 p-1 cursor-pointer"
                      />
                      <Input
                        value={preferences.theme.accentColor}
                        onChange={(e) => handleThemeChange('accentColor', e.target.value)}
                        className="flex-1 h-10 font-mono text-sm"
                        style={{
                          background: 'var(--studio-bg-deep)',
                          borderColor: 'var(--studio-border)',
                          color: 'var(--studio-text)',
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs" style={{ color: 'var(--studio-text-muted)' }}>
                      Background Color
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={preferences.theme.backgroundColor}
                        onChange={(e) => handleThemeChange('backgroundColor', e.target.value)}
                        className="h-10 w-16 p-1 cursor-pointer"
                      />
                      <Input
                        value={preferences.theme.backgroundColor}
                        onChange={(e) => handleThemeChange('backgroundColor', e.target.value)}
                        className="flex-1 h-10 font-mono text-sm"
                        style={{
                          background: 'var(--studio-bg-deep)',
                          borderColor: 'var(--studio-border)',
                          color: 'var(--studio-text)',
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs" style={{ color: 'var(--studio-text-muted)' }}>
                      Text Color
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={preferences.theme.textColor}
                        onChange={(e) => handleThemeChange('textColor', e.target.value)}
                        className="h-10 w-16 p-1 cursor-pointer"
                      />
                      <Input
                        value={preferences.theme.textColor}
                        onChange={(e) => handleThemeChange('textColor', e.target.value)}
                        className="flex-1 h-10 font-mono text-sm"
                        style={{
                          background: 'var(--studio-bg-deep)',
                          borderColor: 'var(--studio-border)',
                          color: 'var(--studio-text)',
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs" style={{ color: 'var(--studio-text-muted)' }}>
                      Border Color
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={preferences.theme.borderColor}
                        onChange={(e) => handleThemeChange('borderColor', e.target.value)}
                        className="h-10 w-16 p-1 cursor-pointer"
                      />
                      <Input
                        value={preferences.theme.borderColor}
                        onChange={(e) => handleThemeChange('borderColor', e.target.value)}
                        className="flex-1 h-10 font-mono text-sm"
                        style={{
                          background: 'var(--studio-bg-deep)',
                          borderColor: 'var(--studio-border)',
                          color: 'var(--studio-text)',
                        }}
                      />
                    </div>
                  </div>

                  <Separator style={{ background: 'var(--studio-border)' }} />

                  <div
                    className="p-4 rounded-lg"
                    style={{
                      background: preferences.theme.backgroundColor,
                      border: `1px solid ${preferences.theme.borderColor}`,
                    }}
                  >
                    <p className="text-sm mb-2" style={{ color: preferences.theme.textColor }}>
                      Theme Preview
                    </p>
                    <Button
                      size="sm"
                      style={{
                        background: preferences.theme.accentColor,
                        color: '#ffffff',
                      }}
                    >
                      Sample Button
                    </Button>
                  </div>
                </div>
              </CollapsibleSection>
            </TabsContent>

            <TabsContent value="shortcuts" className="mt-0 p-0">
              <CollapsibleSection title="KEYBOARD SHORTCUTS" icon={<Keyboard className="h-4 w-4" />}>
                <p className="text-xs mb-3" style={{ color: 'var(--studio-text-muted)' }}>
                  Click a shortcut to edit. Press a new key to assign.
                </p>
                <div
                  className="space-y-1 rounded-lg p-2"
                  style={{ background: 'var(--studio-bg-deep)' }}
                >
                  {preferences.shortcuts.map((shortcut) => (
                    <div
                      key={shortcut.id}
                      className="flex items-center justify-between p-2 rounded hover:bg-white/5"
                    >
                      <span className="text-sm" style={{ color: 'var(--studio-text)' }}>
                        {shortcut.name}
                      </span>
                      <div className="flex items-center gap-2">
                        {editingShortcut === shortcut.id ? (
                          <Input
                            autoFocus
                            placeholder="Press key..."
                            className="w-32 h-8 text-center text-sm"
                            style={{
                              background: 'var(--studio-bg-medium)',
                              borderColor: 'var(--studio-accent)',
                              color: 'var(--studio-text)',
                            }}
                            onKeyDown={(e) => {
                              e.preventDefault();
                              handleShortcutEdit(shortcut.id, e.key);
                            }}
                            onBlur={() => setEditingShortcut(null)}
                          />
                        ) : (
                          <Badge
                            variant="outline"
                            className="cursor-pointer hover:bg-white/10"
                            onClick={() => setEditingShortcut(shortcut.id)}
                            style={{
                              borderColor: 'var(--studio-border)',
                              color: 'var(--studio-text-muted)',
                            }}
                          >
                            {[
                              shortcut.ctrl && 'Ctrl',
                              shortcut.shift && 'Shift',
                              shortcut.alt && 'Alt',
                              shortcut.key,
                            ]
                              .filter(Boolean)
                              .join(' + ')}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            </TabsContent>

            <TabsContent value="presets" className="mt-0 p-0">
              <CollapsibleSection title="WORKFLOW LAYOUTS" icon={<Mic className="h-4 w-4" />}>
                <p className="text-xs mb-3" style={{ color: 'var(--studio-text-muted)' }}>
                  Quick-switch between optimized layouts for different workflows.
                </p>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {['recording', 'mixing', 'mastering'].map((preset) => {
                    const presetData = preferences.layoutPresets.find((p) => p.id === preset);
                    const isActive = preferences.activePreset === preset;
                    return (
                      <Button
                        key={preset}
                        variant={isActive ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => applyWorkflowPreset(preset)}
                        className="gap-1.5"
                        style={
                          isActive
                            ? { background: 'var(--studio-accent)' }
                            : { borderColor: 'var(--studio-border)' }
                        }
                      >
                        {preset === 'recording' && <Mic className="h-3.5 w-3.5" />}
                        {preset === 'mixing' && <Sliders className="h-3.5 w-3.5" />}
                        {preset === 'mastering' && <Headphones className="h-3.5 w-3.5" />}
                        {presetData?.name || preset}
                      </Button>
                    );
                  })}
                </div>
              </CollapsibleSection>

              <CollapsibleSection
                title="SAVED PRESETS"
                icon={<Layers className="h-4 w-4" />}
                defaultExpanded={false}
              >
                <div
                  className="space-y-1 rounded-lg p-2 mb-3"
                  style={{ background: 'var(--studio-bg-deep)' }}
                >
                  {preferences.layoutPresets
                    .filter((p) => !['recording', 'mixing', 'mastering'].includes(p.id))
                    .map((preset) => (
                      <div
                        key={preset.id}
                        className="flex items-center justify-between p-2 rounded hover:bg-white/5"
                      >
                        <span className="text-sm" style={{ color: 'var(--studio-text)' }}>
                          {preset.name}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => applyWorkflowPreset(preset.id)}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-red-400 hover:text-red-300"
                            onClick={() => deletePreset(preset.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  {preferences.layoutPresets.filter(
                    (p) => !['recording', 'mixing', 'mastering'].includes(p.id)
                  ).length === 0 && (
                    <p className="text-sm text-center py-4" style={{ color: 'var(--studio-text-muted)' }}>
                      No custom presets saved
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => setShowSavePresetDialog(true)}
                >
                  <Plus className="h-4 w-4" />
                  Save Current as Preset
                </Button>
              </CollapsibleSection>
            </TabsContent>

            <TabsContent value="meters" className="mt-0 p-0">
              <CollapsibleSection title="METER BALLISTICS" icon={<Activity className="h-4 w-4" />}>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs" style={{ color: 'var(--studio-text-muted)' }}>
                      Response Speed
                    </Label>
                    <Select
                      value={preferences.meterSettings.ballistics}
                      onValueChange={(val) =>
                        handleMeterSettingsChange('ballistics', val as 'fast' | 'medium' | 'slow')
                      }
                    >
                      <SelectTrigger
                        className="h-9"
                        style={{
                          background: 'var(--studio-bg-deep)',
                          borderColor: 'var(--studio-border)',
                          color: 'var(--studio-text)',
                        }}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fast">Fast (VU-like)</SelectItem>
                        <SelectItem value="medium">Medium (Standard)</SelectItem>
                        <SelectItem value="slow">Slow (RMS-like)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs" style={{ color: 'var(--studio-text-muted)' }}>
                        Peak Hold Time
                      </Label>
                      <span className="text-xs font-mono" style={{ color: 'var(--studio-text)' }}>
                        {preferences.meterSettings.peakHold}ms
                      </span>
                    </div>
                    <Slider
                      value={[preferences.meterSettings.peakHold]}
                      onValueChange={([val]) => handleMeterSettingsChange('peakHold', val)}
                      min={500}
                      max={5000}
                      step={100}
                      className="cursor-pointer"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs" style={{ color: 'var(--studio-text-muted)' }}>
                        Falloff Rate
                      </Label>
                      <span className="text-xs font-mono" style={{ color: 'var(--studio-text)' }}>
                        {preferences.meterSettings.falloff} dB/s
                      </span>
                    </div>
                    <Slider
                      value={[preferences.meterSettings.falloff]}
                      onValueChange={([val]) => handleMeterSettingsChange('falloff', val)}
                      min={6}
                      max={30}
                      step={1}
                      className="cursor-pointer"
                    />
                  </div>
                </div>
              </CollapsibleSection>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <DialogFooter className="px-6 py-4 border-t" style={{ borderColor: 'var(--studio-border)' }}>
          <Button
            variant="outline"
            onClick={resetToDefaults}
            className="gap-2"
            style={{ borderColor: 'var(--studio-border)' }}
          >
            <RotateCcw className="h-4 w-4" />
            Reset to Defaults
          </Button>
          <Button onClick={savePreferences} className="gap-2" style={{ background: 'var(--studio-accent)' }}>
            <Save className="h-4 w-4" />
            Save & Apply
          </Button>
        </DialogFooter>

        <Dialog open={showSavePresetDialog} onOpenChange={setShowSavePresetDialog}>
          <DialogContent
            className="max-w-sm"
            style={{
              background: 'var(--studio-bg-medium)',
              borderColor: 'var(--studio-border)',
            }}
          >
            <DialogHeader>
              <DialogTitle style={{ color: 'var(--studio-text)' }}>Save Layout Preset</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label style={{ color: 'var(--studio-text-muted)' }}>Preset Name</Label>
                <Input
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  placeholder="My Custom Layout"
                  style={{
                    background: 'var(--studio-bg-deep)',
                    borderColor: 'var(--studio-border)',
                    color: 'var(--studio-text)',
                  }}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSavePresetDialog(false)}>
                Cancel
              </Button>
              <Button onClick={saveCurrentAsPreset} disabled={!newPresetName.trim()}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

export type { UIPreferences, PanelConfig, ToolbarButton, KeyboardShortcut, ThemeConfig, MeterSettings, LayoutPreset };
