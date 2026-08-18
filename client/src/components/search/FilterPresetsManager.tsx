// @ts-nocheck
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCsrfTokenFromCookie } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Bookmark, Plus, Save, Trash2, Edit, MoreHorizontal, Star, StarOff, Check, Filter, Loader2, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface FilterPreset {
  id: string;
  name: string;
  filters: Record<string, any>;
  isDefault?: boolean;
  isBuiltIn?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface FilterPresetsManagerProps {
  currentFilters: Record<string, any>;
  onApplyPreset: (filters: Record<string, any>) => void;
  onSavePreset?: (name: string, filters: Record<string, any>) => void;
  context?: "marketplace" | "analytics" | "social" | "distribution" | "global";
  className?: string;
  compact?: boolean;
}

export function FilterPresetsManager({
  currentFilters,
  onApplyPreset,
  _onSavePreset,
  context = "global",
  className,
  compact = false,
}: FilterPresetsManagerProps) {
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState<string | null>(null);
  const [editingPreset, setEditingPreset] = useState<FilterPreset | null>(null);
  const [presetName, setPresetName] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: presetsData, isLoading } = useQuery({
    queryKey: ["/api/search/filter-presets", context],
    queryFn: async () => {
      const res = await fetch(`/api/search/filter-presets?context=${context}`, {
        credentials: "include",
      });
      if (!res.ok) return { presets: [] };
      return res.json();
    },
  });

  const savePresetMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      filters: Record<string, any>;
      id?: string;
    }) => {
      const csrfToken = getCsrfTokenFromCookie();
      const res = await fetch("/api/search/filter-presets", {
        method: data.id ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ ...data, context }),
      });
      if (!res.ok) throw new Error("Failed to save preset");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/search/filter-presets"],
      });
      setShowSaveDialog(false);
      setEditingPreset(null);
      setPresetName("");
      toast({
        title: "Preset Saved",
        description: "Your filter preset has been saved successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save filter preset.",
        variant: "destructive",
      });
    },
  });

  const deletePresetMutation = useMutation({
    mutationFn: async (presetId: string) => {
      const csrfToken = getCsrfTokenFromCookie();
      const res = await fetch(`/api/search/filter-presets/${presetId}`, {
        method: "DELETE",
        credentials: "include",
        headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
      });
      if (!res.ok) throw new Error("Failed to delete preset");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/search/filter-presets"],
      });
      setShowDeleteDialog(null);
      toast({
        title: "Preset Deleted",
        description: "Filter preset has been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete filter preset.",
        variant: "destructive",
      });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (presetId: string) => {
      const csrfToken = getCsrfTokenFromCookie();
      const res = await fetch(
        `/api/search/filter-presets/${presetId}/default`,
        {
          method: "POST",
          credentials: "include",
          headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
        },
      );
      if (!res.ok) throw new Error("Failed to set default");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/search/filter-presets"],
      });
      toast({
        title: "Default Updated",
        description: "Default preset has been updated.",
      });
    },
  });

  const presets: FilterPreset[] = presetsData?.presets || [];
  const hasActiveFilters =
    Object.keys(currentFilters).filter((k) => currentFilters[k] !== undefined)
      .length > 0;

  const handleSave = () => {
    if (!presetName.trim()) return;
    savePresetMutation.mutate({
      name: presetName.trim(),
      filters: currentFilters,
      id: editingPreset.id,
    });
  };

  const handleEdit = (preset: FilterPreset) => {
    setEditingPreset(preset);
    setPresetName(preset.name);
    setShowSaveDialog(true);
  };

  const handleFilterChange = (
    key: string,
    value: Record<string, unknown>,
  ): string => {
    if (key.includes("price")) return `$${value}`;
    if (key.includes("bpm")) return `${value} BPM`;
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value);
  });

  if (compact) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="border-slate-600">
              <Bookmark className="h-4 w-4 mr-2" />
              Presets
              <ChevronDown className="h-4 w-4 ml-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56 bg-slate-900 border-slate-700"
          >
            {isLoading ? (
              <div className="p-2">
                <Skeleton className="h-8 w-full bg-slate-700" />
              </div>
            ) : presets.length === 0 ? (
              <div className="p-4 text-center text-sm text-slate-500">
                No saved presets
              </div>
            ) : (
              presets.map((preset) => (
                <DropdownMenuItem
                  key={preset.id}
                  onClick={() => onApplyPreset(preset.filters)}
                  className="flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    {preset.isDefault && (
                      <Star className="h-3 w-3 text-yellow-400" />
                    )}
                    {preset.name}
                  </span>
                  {preset.isBuiltIn && (
                    <Badge variant="secondary" className="text-[10px]">
                      Built-in
                    </Badge>
                  )}
                </DropdownMenuItem>
              ))
            )}
            {hasActiveFilters && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setShowSaveDialog(true)}
                  className="cursor-pointer"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save Current Filters
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <SavePresetDialog
          open={showSaveDialog}
          onOpenChange={setShowSaveDialog}
          presetName={presetName}
          onNameChange={setPresetName}
          onSave={handleSave}
          isLoading={savePresetMutation.isPending}
          isEditing={!!editingPreset}
          currentFilters={currentFilters}
        />
      </div>
    );
  }

  return (
    <Card className={cn("bg-slate-800/50 border-slate-700", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bookmark className="h-5 w-5 text-purple-400" />
            Filter Presets
          </CardTitle>
          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSaveDialog(true)}
              className="border-slate-600"
            >
              <Plus className="h-4 w-4 mr-1" />
              Save Current
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full bg-slate-700" />
            ))}
          </div>
        ) : presets.length === 0 ? (
          <div className="text-center py-8">
            <Filter className="h-12 w-12 mx-auto text-slate-600 mb-3" />
            <p className="text-slate-400 mb-2">No saved presets</p>
            <p className="text-sm text-slate-500">
              Apply filters and save them as a preset for quick access.
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-64">
            <div className="space-y-2">
              {presets.map((preset) => (
                <PresetItem
                  key={preset.id}
                  preset={preset}
                  onApply={() => onApplyPreset(preset.filters)}
                  onEdit={() => handleEdit(preset)}
                  onDelete={() => setShowDeleteDialog(preset.id)}
                  onSetDefault={() => setDefaultMutation.mutate(preset.id)}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>

      <SavePresetDialog
        open={showSaveDialog}
        onOpenChange={setShowSaveDialog}
        presetName={presetName}
        onNameChange={setPresetName}
        onSave={handleSave}
        isLoading={savePresetMutation.isPending}
        isEditing={!!editingPreset}
        currentFilters={currentFilters}
      />

      <AlertDialog
        open={!!showDeleteDialog}
        onOpenChange={() => setShowDeleteDialog(null)}
      >
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Preset</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this filter preset? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                showDeleteDialog &&
                deletePresetMutation.mutate(showDeleteDialog)
              }
              className="bg-red-600 hover:bg-red-700"
            >
              {deletePresetMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function PresetItem({
  preset,
  onApply,
  onEdit,
  onDelete,
  onSetDefault,
}: {
  preset: FilterPreset;
  onApply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
}) {
  const filterCount = Object.keys(preset.filters).filter(
    (k) => preset.filters[k] !== undefined,
  ).length;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-700/30 hover:bg-slate-700/50 transition-colors group">
      <button onClick={onApply} className="flex-1 text-left">
        <div className="flex items-center gap-2">
          {preset.isDefault && <Star className="h-4 w-4 text-yellow-400" />}
          <span className="font-medium text-white">{preset.name}</span>
          {preset.isBuiltIn && (
            <Badge variant="secondary" className="text-[10px] bg-slate-600">
              Built-in
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1 mt-1">
          <Badge
            variant="outline"
            className="text-[10px] border-slate-600 text-slate-400"
          >
            {filterCount} filter{filterCount !== 1 ? "s" : ""}
          </Badge>
          {Object.entries(preset.filters)
            .filter(([_, v]) => v !== undefined)
            .slice(0, 3)
            .map(([key, value]) => (
              <Badge
                key={key}
                variant="secondary"
                className="text-[10px] bg-purple-500/10 text-purple-300"
              >
                {String(value)}
              </Badge>
            ))}
        </div>
      </button>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          onClick={onApply}
          className="h-8 w-8 text-green-400 hover:text-green-300"
        >
          <Check className="h-4 w-4" />
        </Button>
        {!preset.isBuiltIn && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="bg-slate-900 border-slate-700"
            >
              <DropdownMenuItem onClick={onEdit}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onSetDefault}>
                {preset.isDefault ? (
                  <>
                    <StarOff className="h-4 w-4 mr-2" />
                    Remove Default
                  </>
                ) : (
                  <>
                    <Star className="h-4 w-4 mr-2" />
                    Set as Default
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-red-400">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

function SavePresetDialog({
  open,
  onOpenChange,
  presetName,
  onNameChange,
  onSave,
  isLoading,
  isEditing,
  currentFilters,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presetName: string;
  onNameChange: (name: string) => void;
  onSave: () => void;
  isLoading: boolean;
  isEditing: boolean;
  currentFilters: Record<string, any>;
}) {
  const activeFilters = Object.entries(currentFilters).filter(
    ([_, v]) => v !== undefined && v !== "" && v !== false,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Preset" : "Save Filter Preset"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the name of your filter preset."
              : "Save your current filters as a reusable preset."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Preset Name</Label>
            <Input
              value={presetName}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="e.g., My Trap Search"
              className="bg-slate-800 border-slate-600"
            />
          </div>
          {!isEditing && activeFilters.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm text-slate-400">Filters to Save</Label>
              <div className="flex flex-wrap gap-2">
                {activeFilters.map(([key, value]) => (
                  <Badge
                    key={key}
                    variant="secondary"
                    className="bg-purple-500/20 text-purple-300"
                  >
                    {key}: {String(value)}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onSave}
            disabled={!presetName.trim() || isLoading}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                {isEditing ? "Update" : "Save"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default FilterPresetsManager;
