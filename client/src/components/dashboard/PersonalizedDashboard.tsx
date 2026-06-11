import React, { useState, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useDashboardLayout,
  DashboardWidget,
  LayoutPreset,
} from "@/hooks/useUserPreferences";
import { useToast } from "@/hooks/use-toast";
import {
  Settings,
  GripVertical,
  Eye,
  EyeOff,
  Layout,
  Save,
  RotateCcw,
  Maximize2,
  Minimize2,
  Grid3X3,
} from "lucide-react";

interface SortableWidgetItemProps {
  widget: DashboardWidget;
  onToggle: (id: string) => void;
  onResize: (id: string, size: "small" | "medium" | "large") => void;
}

function SortableWidgetItem({
  widget,
  onToggle,
  onResize,
}: SortableWidgetItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between p-3 rounded-lg border ${
        widget.visible ? "bg-card" : "bg-muted/50"
      } ${isDragging ? "shadow-lg" : ""}`}
    >
      <div className="flex items-center gap-3">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className={widget.visible ? "" : "text-muted-foreground"}>
          {widget.name}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Select
          value={widget.size}
          onValueChange={(value) =>
            onResize(widget.id, value as "small" | "medium" | "large")
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
        <Button variant="ghost" size="icon" onClick={() => onToggle(widget.id)}>
          {widget.visible ? (
            <Eye className="h-4 w-4" />
          ) : (
            <EyeOff className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </div>
    </div>
  );
}

interface PersonalizedDashboardProps {
  children?: React.ReactNode;
  onLayoutChange?: (layout: DashboardWidget[]) => void;
}

export function PersonalizedDashboard({
  children,
  onLayoutChange,
}: PersonalizedDashboardProps) {
  const {
    layout,
    isLoading,

    reorderWidgets,
    setPreset,
    isSaving,
  } = useDashboardLayout();
  const { toast } = useToast();
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [localWidgets, setLocalWidgets] = useState<DashboardWidget[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setLocalWidgets((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex).map(
          (item, index) => ({
            ...item,
            order: index,
          }),
        );
        return newItems;
      });
    }
  }, []);

  const handleToggleWidget = useCallback((id: string) => {
    setLocalWidgets((items) =>
      items.map((item) =>
        item.id === id ? { ...item, visible: !item.visible } : item,
      ),
    );
  }, []);

  const handleResizeWidget = useCallback(
    (id: string, size: "small" | "medium" | "large") => {
      setLocalWidgets((items) =>
        items.map((item) => (item.id === id ? { ...item, size } : item)),
      );
    },
    [],
  );

  const handleOpenCustomizer = useCallback(() => {
    if (layout) {
      setLocalWidgets([...layout.widgets]);
      setIsCustomizing(true);
    }
  }, [layout]);

  const handleSaveLayout = useCallback(async () => {
    if (!layout) return;

    try {
      await reorderWidgets(localWidgets);
      toast({
        title: "Layout Saved",
        description: "Your dashboard layout has been saved.",
      });
      setIsCustomizing(false);
      onLayoutChange?.(localWidgets);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save layout. Please try again.",
        variant: "destructive",
      });
    }
  }, [layout, localWidgets, reorderWidgets, toast, onLayoutChange]);

  const handleResetLayout = useCallback(() => {
    if (layout) {
      setLocalWidgets([...layout.widgets]);
    }
  }, [layout]);

  const handlePresetChange = useCallback(
    async (preset: LayoutPreset) => {
      try {
        await setPreset(preset);
        toast({
          title: "Preset Applied",
          description: `Dashboard set to ${preset} layout.`,
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to apply preset. Please try again.",
          variant: "destructive",
        });
      }
    },
    [setPreset, toast],
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          <div className="h-8 w-24 bg-muted animate-pulse rounded" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-48 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  layout?.widgets.filter((w) => w.visible).sort((a, b) => a.order - b.order) ||
    [];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-normal">
            <Layout className="h-3 w-3 mr-1" />
            {layout?.preset || "standard"} layout
          </Badge>
        </div>
        <Sheet open={isCustomizing} onOpenChange={setIsCustomizing}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" onClick={handleOpenCustomizer}>
              <Settings className="h-4 w-4 mr-2" />
              Customize
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[400px] sm:w-[540px]">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Grid3X3 className="h-5 w-5" />
                Customize Dashboard
              </SheetTitle>
            </SheetHeader>
            <div className="mt-6 space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">Layout Preset</label>
                <Select
                  value={layout?.preset || "standard"}
                  onValueChange={(value) =>
                    handlePresetChange(value as LayoutPreset)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compact">
                      <div className="flex items-center gap-2">
                        <Minimize2 className="h-4 w-4" />
                        Compact - Minimal widgets
                      </div>
                    </SelectItem>
                    <SelectItem value="standard">
                      <div className="flex items-center gap-2">
                        <Layout className="h-4 w-4" />
                        Standard - Balanced view
                      </div>
                    </SelectItem>
                    <SelectItem value="detailed">
                      <div className="flex items-center gap-2">
                        <Maximize2 className="h-4 w-4" />
                        Detailed - All information
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Widget Order & Visibility
                </label>
                <p className="text-sm text-muted-foreground">
                  Drag to reorder. Toggle visibility for each widget.
                </p>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={localWidgets.map((w) => w.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {localWidgets.map((widget) => (
                        <SortableWidgetItem
                          key={widget.id}
                          widget={widget}
                          onToggle={handleToggleWidget}
                          onResize={handleResizeWidget}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>

              <div className="flex gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={handleResetLayout}
                  disabled={isSaving}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset
                </Button>
                <Button
                  onClick={handleSaveLayout}
                  disabled={isSaving}
                  className="flex-1"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {isSaving ? "Saving..." : "Save Layout"}
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {children}
    </div>
  );
}

export function DashboardWidgetWrapper({
  widgetId,
  children,
  className = "",
}: {
  widgetId: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { layout } = useDashboardLayout();
  const widget = layout?.widgets.find((w) => w.id === widgetId);

  if (!widget?.visible) {
    return null;
  }

  const sizeClasses = {
    small: "col-span-1",
    medium: "col-span-1 md:col-span-1",
    large: "col-span-1 md:col-span-2",
  };

  return (
    <div className={`${sizeClasses[widget.size]} ${className}`}>{children}</div>
  );
}

export default PersonalizedDashboard;
