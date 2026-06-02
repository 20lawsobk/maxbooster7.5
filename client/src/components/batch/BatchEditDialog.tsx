import { useState, useCallback, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, CheckCircle2, Edit, Loader2, Eye, Settings, ChevronRight, Info } from "lucide-react";

export interface BatchEditField {
  key: string;
  label: string;
  type:
    | "text"
    | "number"
    | "select"
    | "textarea"
    | "checkbox"
    | "date"
    | "tags"
    | "multiselect";
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  description?: string;
  group?: string;
  validation?: (value: unknown) => string | null;
  defaultValue?: unknown;
}

export interface BatchEditPreview {
  id: string;
  name: string;
  currentValues: Record<string, any>;
  newValues: Record<string, any>;
}

export interface BatchEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: BatchEditField[];
  selectedItems: Array<{ id: string; name?: string; [key: string]: unknown }>;
  onApply: (
    changes: Record<string, any>,
    itemIds: string[],
  ) => Promise<{
    success: string[];
    failed: Array<{ id: string; error: string }>;
  }>;
  title?: string;
  description?: string;
  showPreview?: boolean;
  allowPartialApply?: boolean;
}

interface FieldChange {
  enabled: boolean;
  value: unknown;
}

export function BatchEditDialog({
  open,
  onOpenChange,
  fields,
  selectedItems,
  onApply,
  title = "Batch Edit",
  description,
  showPreview = true,
  allowPartialApply = true,
}: BatchEditDialogProps) {
  const [changes, setChanges] = useState<Record<string, FieldChange>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isApplying, setIsApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState({ current: 0, total: 0 });
  const [applyResult, setApplyResult] = useState<{
    success: string[];
    failed: Array<{ id: string; error: string }>;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");

  useEffect(() => {
    if (open) {
      setChanges(
        fields.reduce(
          (acc, field) => {
            acc[field.key] = {
              enabled: false,
              value: field.defaultValue ?? getDefaultValue(field),
            };
            return acc;
          },
          {} as Record<string, FieldChange>,
        ),
      );
      setErrors({});
      setApplyResult(null);
      setActiveTab("edit");
    }
  }, [open, fields]);

  const enabledChangesCount = useMemo(
    () => Object.values(changes).filter((c) => c.enabled).length,
    [changes],
  );

  const groupedFields = useMemo(() => {
    const groups: Record<string, BatchEditField[]> = { default: [] };
    fields.forEach((field) => {
      const group = field.group || "default";
      if (!groups[group]) groups[group] = [];
      groups[group].push(field);
    });
    return groups;
  }, [fields]);

  const previews = useMemo<BatchEditPreview[]>(() => {
    if (!showPreview) return [];

    const enabledChanges = Object.entries(changes)
      .filter(([_, change]) => change.enabled)
      .reduce(
        (acc, [key, change]) => {
          acc[key] = change.value;
          return acc;
        },
        {} as Record<string, any>,
      );

    return selectedItems.slice(0, 10).map((item) => ({
      id: item.id,
      name: item.name || item.title || item.id,
      currentValues: fields.reduce(
        (acc, field) => {
          acc[field.key] = item[field.key];
          return acc;
        },
        {} as Record<string, any>,
      ),
      newValues: { ...item, ...enabledChanges },
    }));
  }, [selectedItems, changes, fields, showPreview]);

  const toggleField = useCallback((key: string) => {
    setChanges((prev) => ({
      ...prev,
      [key]: { ...prev[key], enabled: !prev[key]?.enabled },
    }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const updateValue = useCallback(
    (key: string, value: unknown) => {
      setChanges((prev) => ({
        ...prev,
        [key]: { ...prev[key], value },
      }));

      const field = fields.find((f) => f.key === key);
      if (field?.validation) {
        const error = field.validation(value);
        setErrors((prev) => {
          if (error) {
            return { ...prev, [key]: error };
          }
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    },
    [fields],
  );

  const handleApply = useCallback(async () => {
    const enabledChanges = Object.entries(changes)
      .filter(([_, change]) => change.enabled)
      .reduce(
        (acc, [key, change]) => {
          acc[key] = change.value;
          return acc;
        },
        {} as Record<string, any>,
      );

    if (Object.keys(enabledChanges).length === 0) return;

    let hasErrors = false;
    for (const [key, value] of Object.entries(enabledChanges)) {
      const field = fields.find((f) => f.key === key);
      if (field?.validation) {
        const error = field.validation(value);
        if (error) {
          setErrors((prev) => ({ ...prev, [key]: error }));
          hasErrors = true;
        }
      }
    }

    if (hasErrors) return;

    setIsApplying(true);
    setApplyProgress({ current: 0, total: selectedItems.length });

    try {
      const result = await onApply(
        enabledChanges,
        selectedItems.map((item) => item.id),
      );
      setApplyResult(result);

      if (result.failed.length === 0) {
        setTimeout(() => {
          onOpenChange(false);
        }, 1500);
      }
    } catch (error) {
      setApplyResult({
        success: [],
        failed: selectedItems.map((item) => ({
          id: item.id,
          error: error.message || "Unknown error",
        })),
      });
    } finally {
      setIsApplying(false);
    }
  }, [changes, fields, selectedItems, onApply, onOpenChange]);

  const handleReset = useCallback(() => {
    setChanges(
      fields.reduce(
        (acc, field) => {
          acc[field.key] = {
            enabled: false,
            value: field.defaultValue ?? getDefaultValue(field),
          };
          return acc;
        },
        {} as Record<string, FieldChange>,
      ),
    );
    setErrors({});
    setApplyResult(null);
  }, [fields]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {description ||
              `Edit ${selectedItems.length} selected item${selectedItems.length > 1 ? "s" : ""}. Only enabled fields will be updated.`}
          </DialogDescription>
        </DialogHeader>

        {applyResult ? (
          <div className="py-6 space-y-4">
            <div className="flex items-center justify-center gap-4">
              {applyResult.failed.length === 0 ? (
                <div className="text-center">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-2" />
                  <p className="font-medium">All items updated successfully!</p>
                  <p className="text-sm text-muted-foreground">
                    {applyResult.success.length} item
                    {applyResult.success.length !== 1 ? "s" : ""} updated
                  </p>
                </div>
              ) : (
                <div className="w-full space-y-4">
                  <div className="flex items-center justify-center gap-8">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-500">
                        {applyResult.success.length}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Succeeded
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-destructive">
                        {applyResult.failed.length}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Failed
                      </div>
                    </div>
                  </div>
                  <ScrollArea className="h-40 border rounded-lg">
                    <div className="p-2 space-y-2">
                      {applyResult.failed.map((failure, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2 p-2 bg-destructive/5 rounded text-sm"
                        >
                          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                          <div>
                            <p className="font-medium">{failure.id}</p>
                            <p className="text-xs text-muted-foreground">
                              {failure.error}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          </div>
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as "edit" | "preview")}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="edit" className="gap-2">
                <Settings className="h-4 w-4" />
                Edit Fields
              </TabsTrigger>
              <TabsTrigger
                value="preview"
                className="gap-2"
                disabled={enabledChangesCount === 0}
              >
                <Eye className="h-4 w-4" />
                Preview ({enabledChangesCount})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="edit" className="mt-4">
              <ScrollArea className="h-[400px] pr-4">
                {Object.entries(groupedFields).map(([group, groupFields]) => (
                  <div key={group} className="mb-4">
                    {group !== "default" && (
                      <h4 className="text-sm font-medium text-muted-foreground mb-2">
                        {group}
                      </h4>
                    )}
                    <div className="space-y-3">
                      {groupFields.map((field) => {
                        const change = changes[field.key];
                        const error = errors[field.key];

                        return (
                          <div key={field.key} className="space-y-2">
                            <div className="flex items-center gap-3">
                              <Checkbox
                                id={`enable-${field.key}`}
                                checked={change?.enabled}
                                onCheckedChange={() => toggleField(field.key)}
                              />
                              <Label
                                htmlFor={`enable-${field.key}`}
                                className={cn(
                                  "cursor-pointer font-medium flex-1",
                                  !change?.enabled && "text-muted-foreground",
                                )}
                              >
                                {field.label}
                              </Label>
                              {change?.enabled && (
                                <Badge variant="secondary" className="text-xs">
                                  Will update
                                </Badge>
                              )}
                            </div>

                            {change?.enabled && (
                              <div className="ml-7 space-y-2">
                                {field.description && (
                                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                                    <Info className="h-3 w-3" />
                                    {field.description}
                                  </p>
                                )}
                                {renderFieldInput(
                                  field,
                                  change.value,
                                  (value) => updateValue(field.key, value),
                                )}
                                {error && (
                                  <p className="text-sm text-destructive flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" />
                                    {error}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="preview" className="mt-4">
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-3">
                  {previews.map((preview) => (
                    <div
                      key={preview.id}
                      className="border rounded-lg p-3 space-y-2"
                    >
                      <div className="font-medium text-sm">{preview.name}</div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {Object.entries(changes)
                          .filter(([_, change]) => change.enabled)
                          .map(([key, change]) => {
                            const field = fields.find((f) => f.key === key);
                            const currentValue = preview.currentValues[key];
                            const newValue = change.value;

                            return (
                              <div
                                key={key}
                                className="flex items-center gap-2"
                              >
                                <span className="text-muted-foreground">
                                  {field?.label}:
                                </span>
                                <span className="line-through text-muted-foreground">
                                  {formatValue(currentValue)}
                                </span>
                                <ChevronRight className="h-3 w-3" />
                                <span className="font-medium text-primary">
                                  {formatValue(newValue)}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  ))}
                  {selectedItems.length > 10 && (
                    <p className="text-center text-sm text-muted-foreground">
                      And {selectedItems.length - 10} more items...
                    </p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}

        {isApplying && (
          <div className="space-y-2">
            <Progress
              value={(applyProgress.current / applyProgress.total) * 100}
            />
            <p className="text-sm text-center text-muted-foreground">
              Applying changes to {applyProgress.current} of{" "}
              {applyProgress.total} items...
            </p>
          </div>
        )}

        <Separator />

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {enabledChangesCount} field{enabledChangesCount !== 1 ? "s" : ""}{" "}
            selected for {selectedItems.length} item
            {selectedItems.length !== 1 ? "s" : ""}
          </div>
          <div className="flex gap-2">
            {!applyResult && (
              <>
                <Button
                  variant="outline"
                  onClick={handleReset}
                  disabled={isApplying}
                >
                  Reset
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isApplying}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleApply}
                  disabled={
                    isApplying ||
                    enabledChangesCount === 0 ||
                    Object.keys(errors).length > 0
                  }
                >
                  {isApplying ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Applying...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Apply Changes
                    </>
                  )}
                </Button>
              </>
            )}
            {applyResult && (
              <Button onClick={() => onOpenChange(false)}>
                {applyResult.failed.length === 0 ? "Done" : "Close"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getDefaultValue(field: BatchEditField): unknown {
  switch (field.type) {
    case "checkbox":
      return false;
    case "number":
      return 0;
    case "select":
      return field.options?.[0]?.value || "";
    case "tags":
    case "multiselect":
      return [];
    default:
      return "";
  }
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "(empty)";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ") || "(none)";
  return String(value);
}

function renderFieldInput(
  field: BatchEditField,
  value: unknown,
  onChange: (value: unknown) => void,
) {
  switch (field.type) {
    case "select":
      return (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder={field.placeholder || "Select..."} />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "textarea":
      return (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
        />
      );
    case "checkbox":
      return (
        <div className="flex items-center gap-2">
          <Checkbox
            checked={value}
            onCheckedChange={onChange}
            id={`value-${field.key}`}
          />
          <Label
            htmlFor={`value-${field.key}`}
            className="text-sm cursor-pointer"
          >
            {field.placeholder || "Enabled"}
          </Label>
        </div>
      );
    case "number":
      return (
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          placeholder={field.placeholder}
        />
      );
    case "date":
      return (
        <Input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "tags":
      return (
        <Input
          type="text"
          value={Array.isArray(value) ? value.join(", ") : value}
          onChange={(e) =>
            onChange(
              e.target.value
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            )
          }
          placeholder={field.placeholder || "Enter tags separated by commas"}
        />
      );
    default:
      return (
        <Input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
        />
      );
  }
}

export const releaseEditFields: BatchEditField[] = [
  {
    key: "status",
    label: "Status",
    type: "select",
    group: "Status",
    options: [
      { value: "draft", label: "Draft" },
      { value: "pending", label: "Pending Review" },
      { value: "live", label: "Live" },
      { value: "taken_down", label: "Taken Down" },
    ],
  },
  {
    key: "genre",
    label: "Primary Genre",
    type: "select",
    group: "Metadata",
    options: [
      { value: "pop", label: "Pop" },
      { value: "rock", label: "Rock" },
      { value: "hiphop", label: "Hip Hop" },
      { value: "electronic", label: "Electronic" },
      { value: "rnb", label: "R&B" },
      { value: "country", label: "Country" },
      { value: "jazz", label: "Jazz" },
      { value: "classical", label: "Classical" },
    ],
  },
  {
    key: "explicit",
    label: "Explicit Content",
    type: "checkbox",
    group: "Metadata",
  },
  {
    key: "label",
    label: "Label Name",
    type: "text",
    placeholder: "Enter label name",
    group: "Metadata",
  },
  {
    key: "releaseDate",
    label: "Release Date",
    type: "date",
    group: "Scheduling",
  },
  {
    key: "territories",
    label: "Territories",
    type: "select",
    group: "Distribution",
    options: [
      { value: "worldwide", label: "Worldwide" },
      { value: "us", label: "United States" },
      { value: "eu", label: "European Union" },
      { value: "asia", label: "Asia Pacific" },
    ],
  },
];

export const trackEditFields: BatchEditField[] = [
  {
    key: "genre",
    label: "Genre",
    type: "select",
    options: [
      { value: "pop", label: "Pop" },
      { value: "rock", label: "Rock" },
      { value: "hiphop", label: "Hip Hop" },
      { value: "electronic", label: "Electronic" },
    ],
  },
  { key: "bpm", label: "BPM", type: "number", placeholder: "120" },
  {
    key: "key",
    label: "Key",
    type: "select",
    options: [
      { value: "C", label: "C Major" },
      { value: "Am", label: "A Minor" },
      { value: "G", label: "G Major" },
      { value: "Em", label: "E Minor" },
      { value: "D", label: "D Major" },
      { value: "Bm", label: "B Minor" },
    ],
  },
  {
    key: "tags",
    label: "Tags",
    type: "tags",
    placeholder: "chill, summer, vibes",
  },
  { key: "explicit", label: "Explicit", type: "checkbox" },
];

export const postEditFields: BatchEditField[] = [
  {
    key: "status",
    label: "Status",
    type: "select",
    options: [
      { value: "draft", label: "Draft" },
      { value: "scheduled", label: "Scheduled" },
      { value: "published", label: "Published" },
      { value: "archived", label: "Archived" },
    ],
  },
  { key: "scheduledDate", label: "Schedule Date", type: "date" },
  {
    key: "hashtags",
    label: "Hashtags",
    type: "tags",
    placeholder: "#music #newrelease",
  },
  {
    key: "platforms",
    label: "Platforms",
    type: "select",
    options: [
      { value: "all", label: "All Platforms" },
      { value: "instagram", label: "Instagram Only" },
      { value: "twitter", label: "Twitter Only" },
      { value: "tiktok", label: "TikTok Only" },
    ],
  },
];

export const fileEditFields: BatchEditField[] = [
  {
    key: "folder",
    label: "Move to Folder",
    type: "select",
    options: [
      { value: "/", label: "Root" },
      { value: "/audio", label: "Audio" },
      { value: "/images", label: "Images" },
      { value: "/documents", label: "Documents" },
    ],
  },
  {
    key: "tags",
    label: "Tags",
    type: "tags",
    placeholder: "project, final, v2",
  },
  { key: "shared", label: "Shared", type: "checkbox" },
];
