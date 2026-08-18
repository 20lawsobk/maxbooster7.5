// @ts-nocheck
import { useState, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, CheckCircle2, Edit, Loader2 } from "lucide-react";

export interface EditableField {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "textarea" | "checkbox" | "date";
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  description?: string;
  validation?: (value: Record<string, unknown>) => string | null;
}

export interface BulkEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: EditableField[];
  selectedCount: number;
  onApply: (changes: Record<string, any>) => Promise<void>;
  title?: string;
  description?: string;
  isLoading?: boolean;
}

interface FieldChange {
  enabled: boolean;
  value: Record<string, unknown>;
}

export function BulkEditDialog({
  open,
  onOpenChange,
  fields,
  selectedCount,
  onApply,
  title = "Bulk Edit",
  description,
  isLoading = false,
}: BulkEditDialogProps) {
  const [changes, setChanges] = useState<Record<string, FieldChange>>(() =>
    fields.reduce(
      (acc, field) => {
        acc[field.key] = { enabled: false, value: getDefaultValue(field) };
        return acc;
      },
      {} as Record<string, FieldChange>,
    ),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const enabledChangesCount = useMemo(
    () => Object.values(changes).filter((c) => c.enabled).length,
    [changes],
  );

  const toggleField = useCallback((key: string) => {
    setChanges((prev) => ({
      ...prev,
      [key]: { ...prev[key], enabled: !prev[key].enabled },
    }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const updateValue = useCallback(
    (key: string, value: Record<string, unknown>) => {
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

    await onApply(enabledChanges);
    onOpenChange(false);
  }, [changes, fields, onApply, onOpenChange]);

  const handleReset = useCallback(() => {
    setChanges(
      fields.reduce(
        (acc, field) => {
          acc[field.key] = { enabled: false, value: getDefaultValue(field) };
          return acc;
        },
        {} as Record<string, FieldChange>,
      ),
    );
    setErrors({});
  }, [fields]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {description ||
              `Edit ${selectedCount} selected item${selectedCount > 1 ? "s" : ""}. Only enabled fields will be updated.`}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4 pr-4">
            {fields.map((field) => {
              const change = changes[field.key];
              const error = errors[field.key];

              return (
                <div key={field.key} className="space-y-2">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id={`enable-${field.key}`}
                      checked={change.enabled}
                      onCheckedChange={() => toggleField(field.key)}
                    />
                    <Label
                      htmlFor={`enable-${field.key}`}
                      className={cn(
                        "cursor-pointer font-medium",
                        !change.enabled && "text-muted-foreground",
                      )}
                    >
                      {field.label}
                    </Label>
                    {change.enabled && (
                      <Badge variant="secondary" className="text-xs">
                        Will update
                      </Badge>
                    )}
                  </div>

                  {change.enabled && (
                    <div className="ml-7 space-y-2">
                      {field.description && (
                        <p className="text-sm text-muted-foreground">
                          {field.description}
                        </p>
                      )}

                      {renderFieldInput(field, change.value, (value) =>
                        updateValue(field.key, value),
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
        </ScrollArea>

        <Separator />

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {enabledChangesCount} field{enabledChangesCount !== 1 ? "s" : ""}{" "}
            will be updated
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={isLoading}
            >
              Reset
            </Button>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleApply}
              disabled={
                isLoading ||
                enabledChangesCount === 0 ||
                Object.keys(errors).length > 0
              }
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Applying...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Apply to {selectedCount} item{selectedCount > 1 ? "s" : ""}
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getDefaultValue(field: EditableField): unknown {
  switch (field.type) {
    case "checkbox":
      return false;
    case "number":
      return 0;
    case "select":
      return field.options?.[0]?.value || "";
    default:
      return "";
  }
}

function renderFieldInput(
  field: EditableField,
  value: Record<string, unknown>,
  onChange: (value: Record<string, unknown>) => void,
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

export const distributionEditFields: EditableField[] = [
  {
    key: "status",
    label: "Status",
    type: "select",
    options: [
      { value: "draft", label: "Draft" },
      { value: "pending", label: "Pending Review" },
      { value: "live", label: "Live" },
    ],
  },
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
  { key: "explicit", label: "Explicit Content", type: "checkbox" },
  {
    key: "label",
    label: "Label Name",
    type: "text",
    placeholder: "Enter label name",
  },
];

export const socialEditFields: EditableField[] = [
  {
    key: "status",
    label: "Status",
    type: "select",
    options: [
      { value: "draft", label: "Draft" },
      { value: "scheduled", label: "Scheduled" },
      { value: "published", label: "Published" },
    ],
  },
  { key: "scheduledDate", label: "Schedule Date", type: "date" },
  {
    key: "hashtags",
    label: "Hashtags",
    type: "text",
    placeholder: "#music #newrelease",
  },
];

export const marketplaceEditFields: EditableField[] = [
  { key: "price", label: "Price", type: "number", placeholder: "0.00" },
  {
    key: "status",
    label: "Listing Status",
    type: "select",
    options: [
      { value: "active", label: "Active" },
      { value: "paused", label: "Paused" },
      { value: "sold", label: "Sold" },
    ],
  },
  { key: "featured", label: "Featured", type: "checkbox" },
  {
    key: "category",
    label: "Category",
    type: "select",
    options: [
      { value: "beats", label: "Beats" },
      { value: "samples", label: "Samples" },
      { value: "presets", label: "Presets" },
    ],
  },
];

export const studioEditFields: EditableField[] = [
  { key: "tempo", label: "Tempo (BPM)", type: "number", placeholder: "120" },
  {
    key: "key",
    label: "Key",
    type: "select",
    options: [
      { value: "C", label: "C Major" },
      { value: "Am", label: "A Minor" },
      { value: "G", label: "G Major" },
      { value: "Em", label: "E Minor" },
    ],
  },
  { key: "normalize", label: "Normalize Audio", type: "checkbox" },
];
