import React, { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import {
  GripVertical,
  Eye,
  EyeOff,
  Plus,
  Save,
  RotateCcw,
  Trash2,
  LayoutDashboard,
  Maximize2,
  Minimize2,
  Check,
  X,
  Sparkles,
  Download,
  Upload,
  Settings,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardWidget, WidgetSize, SmartWidgetConfig } from "./SmartWidget";

interface DashboardLayout {
  id: string;
  name: string;
  widgets: SmartWidgetConfig[];
  isDefault?: boolean;
  createdAt?: Date;
}

interface DashboardCustomizerProps {
  onSave?: (layout: DashboardLayout) => void;
  onCancel?: () => void;
  showPresets?: boolean;
}

interface LayoutPreset {
  id: string;
  name: string;
  description: string;
  widgetIds: string[];
}

const defaultPresets: LayoutPreset[] = [
  {
    id: "minimal",
    name: "Minimal",
    description: "Only essential widgets",
    widgetIds: ["streams", "revenue", "quick-actions"],
  },
  {
    id: "analytics-focused",
    name: "Analytics Focused",
    description: "Data-driven dashboard",
    widgetIds: [
      "streams",
      "revenue",
      "analytics-chart",
      "audience-insights",
      "trends",
    ],
  },
  {
    id: "creator",
    name: "Creator",
    description: "For active content creators",
    widgetIds: [
      "quick-actions",
      "ai-coach",
      "content-calendar",
      "social-reach",
      "next-release",
    ],
  },
  {
    id: "business",
    name: "Business",
    description: "Revenue and contracts focus",
    widgetIds: [
      "revenue",
      "royalties",
      "contracts",
      "distribution-status",
      "notifications",
    ],
  },
];

const availableWidgets: SmartWidgetConfig[] = [
  {
    id: "streams",
    title: "Total Streams",
    size: "small",
    position: 0,
    visible: true,
    pinned: false,
    viewCount: 0,
    avgViewDuration: 0,
    category: "analytics",
  },
  {
    id: "revenue",
    title: "Revenue",
    size: "small",
    position: 1,
    visible: true,
    pinned: false,
    viewCount: 0,
    avgViewDuration: 0,
    category: "finance",
  },
  {
    id: "social-reach",
    title: "Social Reach",
    size: "small",
    position: 2,
    visible: true,
    pinned: false,
    viewCount: 0,
    avgViewDuration: 0,
    category: "social",
  },
  {
    id: "quick-actions",
    title: "Quick Actions",
    size: "medium",
    position: 3,
    visible: true,
    pinned: false,
    viewCount: 0,
    avgViewDuration: 0,
    category: "actions",
  },
  {
    id: "ai-coach",
    title: "AI Career Coach",
    size: "medium",
    position: 4,
    visible: true,
    pinned: false,
    viewCount: 0,
    avgViewDuration: 0,
    category: "ai",
  },
  {
    id: "next-release",
    title: "Upcoming Releases",
    size: "medium",
    position: 5,
    visible: true,
    pinned: false,
    viewCount: 0,
    avgViewDuration: 0,
    category: "releases",
  },
  {
    id: "analytics-chart",
    title: "Analytics Chart",
    size: "large",
    position: 6,
    visible: true,
    pinned: false,
    viewCount: 0,
    avgViewDuration: 0,
    category: "analytics",
  },
  {
    id: "content-calendar",
    title: "Content Calendar",
    size: "medium",
    position: 7,
    visible: false,
    pinned: false,
    viewCount: 0,
    avgViewDuration: 0,
    category: "content",
  },
  {
    id: "collaborators",
    title: "Suggested Collaborators",
    size: "medium",
    position: 8,
    visible: false,
    pinned: false,
    viewCount: 0,
    avgViewDuration: 0,
    category: "collaboration",
  },
  {
    id: "royalties",
    title: "Royalties Overview",
    size: "medium",
    position: 9,
    visible: false,
    pinned: false,
    viewCount: 0,
    avgViewDuration: 0,
    category: "finance",
  },
  {
    id: "distribution-status",
    title: "Distribution Status",
    size: "medium",
    position: 10,
    visible: false,
    pinned: false,
    viewCount: 0,
    avgViewDuration: 0,
    category: "distribution",
  },
  {
    id: "audience-insights",
    title: "Audience Insights",
    size: "medium",
    position: 11,
    visible: false,
    pinned: false,
    viewCount: 0,
    avgViewDuration: 0,
    category: "analytics",
  },
  {
    id: "trends",
    title: "Trending",
    size: "small",
    position: 12,
    visible: false,
    pinned: false,
    viewCount: 0,
    avgViewDuration: 0,
    category: "discovery",
  },
  {
    id: "contracts",
    title: "Active Contracts",
    size: "medium",
    position: 13,
    visible: false,
    pinned: false,
    viewCount: 0,
    avgViewDuration: 0,
    category: "legal",
  },
  {
    id: "notifications",
    title: "Notifications",
    size: "small",
    position: 14,
    visible: false,
    pinned: false,
    viewCount: 0,
    avgViewDuration: 0,
    category: "system",
  },
  {
    id: "achievements",
    title: "Achievements",
    size: "small",
    position: 15,
    visible: false,
    pinned: false,
    viewCount: 0,
    avgViewDuration: 0,
    category: "gamification",
  },
];

export function DashboardCustomizer({
  onSave,
  onCancel,
  showPresets = true,
}: DashboardCustomizerProps) {
  const queryClient = useQueryClient();
  const [widgets, setWidgets] = useState<SmartWidgetConfig[]>([]);
  const [layoutName, setLayoutName] = useState("My Dashboard");
  const [savePresetOpen, setSavePresetOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [draggedWidget, setDraggedWidget] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: currentLayout, isLoading } = useQuery<{
    widgets: SmartWidgetConfig[];
  }>({
    queryKey: ["/api/personalization/dashboard-layout"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: savedPresets = [] } = useQuery<LayoutPreset[]>({
    queryKey: ["/api/personalization/layout-presets"],
    staleTime: 10 * 60 * 1000,
  });

  React.useEffect(() => {
    if (currentLayout?.widgets) {
      setWidgets(currentLayout.widgets);
    } else {
      setWidgets(availableWidgets);
    }
  }, [currentLayout]);

  const saveLayoutMutation = useMutation({
    mutationFn: async (layout: {
      name: string;
      widgets: SmartWidgetConfig[];
    }) => {
      const response = await apiRequest(
        "PUT",
        "/api/personalization/dashboard-layout",
        layout,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/personalization/dashboard-layout"],
      });
      setHasChanges(false);
    },
  });

  const savePresetMutation = useMutation({
    mutationFn: async (preset: { name: string; widgetIds: string[] }) => {
      const response = await apiRequest(
        "POST",
        "/api/personalization/layout-presets",
        preset,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/personalization/layout-presets"],
      });
      setSavePresetOpen(false);
      setPresetName("");
    },
  });

  const visibleWidgets = useMemo(
    () =>
      widgets.filter((w) => w.visible).sort((a, b) => a.position - b.position),
    [widgets],
  );

  const hiddenWidgets = useMemo(
    () => widgets.filter((w) => !w.visible),
    [widgets],
  );

  const toggleWidgetVisibility = useCallback((widgetId: string) => {
    setWidgets((prev) =>
      prev.map((w) => (w.id === widgetId ? { ...w, visible: !w.visible } : w)),
    );
    setHasChanges(true);
  }, []);

  const changeWidgetSize = useCallback((widgetId: string, size: WidgetSize) => {
    setWidgets((prev) =>
      prev.map((w) => (w.id === widgetId ? { ...w, size } : w)),
    );
    setHasChanges(true);
  }, []);

  const handleDragStart = useCallback((widgetId: string) => {
    setDraggedWidget(widgetId);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      if (!draggedWidget || draggedWidget === targetId) return;

      setWidgets((prev) => {
        const newWidgets = [...prev];
        const draggedIndex = newWidgets.findIndex(
          (w) => w.id === draggedWidget,
        );
        const targetIndex = newWidgets.findIndex((w) => w.id === targetId);

        if (draggedIndex !== -1 && targetIndex !== -1) {
          const [removed] = newWidgets.splice(draggedIndex, 1);
          newWidgets.splice(targetIndex, 0, removed);
          return newWidgets.map((w, i) => ({ ...w, position: i }));
        }
        return prev;
      });
      setHasChanges(true);
    },
    [draggedWidget],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedWidget(null);
  }, []);

  const applyPreset = useCallback((preset: LayoutPreset) => {
    setWidgets((prev) =>
      prev
        .map((w) => ({
          ...w,
          visible: preset.widgetIds.includes(w.id),
          position:
            preset.widgetIds.indexOf(w.id) !== -1
              ? preset.widgetIds.indexOf(w.id)
              : w.position + 100,
        }))
        .sort((a, b) => a.position - b.position)
        .map((w, i) => ({ ...w, position: i })),
    );
    setHasChanges(true);
  }, []);

  const handleSave = useCallback(() => {
    saveLayoutMutation.mutate(
      {
        name: layoutName,
        widgets,
      },
      {
        onSuccess: () => {
          onSave?.({ id: "custom", name: layoutName, widgets });
        },
      },
    );
  }, [layoutName, widgets, saveLayoutMutation, onSave]);

  const handleReset = useCallback(() => {
    if (currentLayout?.widgets) {
      setWidgets(currentLayout.widgets);
    } else {
      setWidgets(availableWidgets);
    }
    setHasChanges(false);
  }, [currentLayout]);

  const handleSaveAsPreset = useCallback(() => {
    if (!presetName.trim()) return;
    savePresetMutation.mutate({
      name: presetName,
      widgetIds: visibleWidgets.map((w) => w.id),
    });
  }, [presetName, visibleWidgets, savePresetMutation]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LayoutDashboard className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">Customize Dashboard</h2>
            <p className="text-sm text-muted-foreground">
              Drag to reorder, toggle to show/hide widgets
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Badge variant="secondary" className="text-xs">
              Unsaved changes
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSavePresetOpen(true)}
          >
            <Copy className="h-4 w-4 mr-2" />
            Save as Preset
          </Button>
          <Button onClick={handleSave} disabled={saveLayoutMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {saveLayoutMutation.isPending ? "Saving..." : "Save Layout"}
          </Button>
        </div>
      </div>

      {showPresets && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Quick Presets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {defaultPresets.map((preset) => (
                <Button
                  key={preset.id}
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset(preset)}
                  className="text-xs"
                >
                  <Sparkles className="h-3 w-3 mr-1" />
                  {preset.name}
                </Button>
              ))}
              {savedPresets.map((preset) => (
                <Button
                  key={preset.id}
                  variant="secondary"
                  size="sm"
                  onClick={() => applyPreset(preset)}
                  className="text-xs"
                >
                  {preset.name}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Visible Widgets ({visibleWidgets.length})
              </CardTitle>
              <CardDescription>Drag to reorder</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-2">
                  {visibleWidgets.map((widget) => (
                    <div
                      key={widget.id}
                      draggable
                      onDragStart={() => handleDragStart(widget.id)}
                      onDragOver={(e) => handleDragOver(e, widget.id)}
                      onDragEnd={handleDragEnd}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border bg-card transition-all",
                        draggedWidget === widget.id &&
                          "opacity-50 border-primary",
                      )}
                    >
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                      <div className="flex-1">
                        <span className="font-medium text-sm">
                          {widget.title}
                        </span>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {widget.category}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {widget.size}
                          </Badge>
                        </div>
                      </div>
                      <Select
                        value={widget.size}
                        onValueChange={(size) =>
                          changeWidgetSize(widget.id, size as WidgetSize)
                        }
                      >
                        <SelectTrigger className="w-24 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="small">Small</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="large">Large</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => toggleWidgetVisibility(widget.id)}
                      >
                        <EyeOff className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <EyeOff className="h-4 w-4" />
                Hidden Widgets ({hiddenWidgets.length})
              </CardTitle>
              <CardDescription>Click to show</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-2">
                  {hiddenWidgets.map((widget) => (
                    <div
                      key={widget.id}
                      className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => toggleWidgetVisibility(widget.id)}
                    >
                      <Plus className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <span className="font-medium text-sm">
                          {widget.title}
                        </span>
                        <Badge variant="outline" className="text-xs ml-2">
                          {widget.category}
                        </Badge>
                      </div>
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    </div>
                  ))}
                  {hiddenWidgets.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      All widgets are visible
                    </p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={savePresetOpen} onOpenChange={setSavePresetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as Preset</DialogTitle>
            <DialogDescription>
              Save your current layout as a reusable preset
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="preset-name">Preset Name</Label>
              <Input
                id="preset-name"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="My Custom Layout"
              />
            </div>
            <div>
              <Label>Included Widgets</Label>
              <div className="flex flex-wrap gap-1 mt-2">
                {visibleWidgets.map((w) => (
                  <Badge key={w.id} variant="secondary" className="text-xs">
                    {w.title}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSavePresetOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveAsPreset}
              disabled={!presetName.trim() || savePresetMutation.isPending}
            >
              {savePresetMutation.isPending ? "Saving..." : "Save Preset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default DashboardCustomizer;
