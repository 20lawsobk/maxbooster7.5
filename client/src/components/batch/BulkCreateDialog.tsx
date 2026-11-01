// @ts-nocheck
import { useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Upload,
  FileSpreadsheet,
  Copy,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  Trash2,
  Download,
  FileText,
  Sparkles,
} from "lucide-react";

export interface BulkCreateField {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "textarea";
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  defaultValue?: Record<string, unknown>;
}

export interface BulkCreateTemplate {
  id: string;
  name: string;
  description?: string;
  fields: Record<string, any>;
}

export interface BulkCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceName: string;
  fields: BulkCreateField[];
  templates?: BulkCreateTemplate[];
  onBulkCreate: (items: Record<string, any>[]) => Promise<{
    success: number;
    failed: Array<{ index: number; error: string }>;
  }>;
  maxItems?: number;
  className?: string;
}

interface CreationItem {
  id: string;
  data: Record<string, any>;
  status: "pending" | "processing" | "success" | "error";
  error?: string;
}

function generateId() {
  return `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function parseCSV(text: string): Record<string, any>[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0]
    .split(",")
    .map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const rows: Record<string, any>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const row: Record<string, any> = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });

    rows.push(row);
  }

  return rows;
}

export function BulkCreateDialog({
  open,
  onOpenChange,
  resourceName,
  fields,
  templates = [],
  onBulkCreate,
  maxItems = 100,
  className,
}: BulkCreateDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<
    "manual" | "csv" | "template" | "duplicate"
  >("manual");
  const [items, setItems] = useState<CreationItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [csvPreview, setCsvPreview] = useState<Record<string, any>[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [duplicateCount, setDuplicateCount] = useState(1);
  const [duplicateSource, setDuplicateSource] = useState<Record<string, any>>(
    {},
  );
  const [variationField, setVariationField] = useState<string>("");

  const createDefaultItem = useCallback((): CreationItem => {
    const data: Record<string, any> = {};
    fields.forEach((field) => {
      data[field.key] = field.defaultValue ?? "";
    });
    return {
      id: generateId(),
      data,
      status: "pending",
    };
  }, [fields]);

  const addItem = useCallback(() => {
    if (items.length >= maxItems) {
      toast({
        title: "Maximum items reached",
        description: `You can only create up to ${maxItems} items at once.`,
        variant: "destructive",
      });
      return;
    }
    setItems((prev) => [...prev, createDefaultItem()]);
  }, [items.length, maxItems, createDefaultItem, toast]);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const updateItem = useCallback(
    (id: string, key: string, value: Record<string, unknown>) => {
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, data: { ...item.data, [key]: value } }
            : item,
        ),
      );
    },
    [],
  );

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        const parsed = parseCSV(text);

        if (parsed.length === 0) {
          toast({
            title: "Invalid CSV",
            description:
              "Could not parse the CSV file. Make sure it has headers and data rows.",
            variant: "destructive",
          });
          return;
        }

        if (parsed.length > maxItems) {
          toast({
            title: "Too many rows",
            description: `CSV has ${parsed.length} rows but maximum is ${maxItems}. Only the first ${maxItems} will be used.`,
            variant: "destructive",
          });
          setCsvPreview(parsed.slice(0, maxItems));
        } else {
          setCsvPreview(parsed);
        }
      };
      reader.readAsText(file);
    },
    [maxItems, toast],
  );

  const importFromCsv = useCallback(() => {
    const newItems: CreationItem[] = csvPreview.map((row) => ({
      id: generateId(),
      data: { ...row },
      status: "pending" as const,
    }));
    setItems(newItems);
    setCsvPreview([]);
    setActiveTab("manual");
    toast({
      title: "CSV imported",
      description: `${newItems.length} items imported from CSV.`,
    });
  }, [csvPreview, toast]);

  const applyTemplate = useCallback(() => {
    const template = templates.find((t) => t.id === selectedTemplate);
    if (!template) return;

    const newItem: CreationItem = {
      id: generateId(),
      data: { ...template.fields },
      status: "pending",
    };
    setItems((prev) => [...prev, newItem]);
    toast({
      title: "Template applied",
      description: `Created item from "${template.name}" template.`,
    });
  }, [selectedTemplate, templates, toast]);

  const duplicateWithVariations = useCallback(() => {
    if (duplicateCount <= 0 || duplicateCount > maxItems) return;

    const newItems: CreationItem[] = [];
    for (let i = 0; i < duplicateCount; i++) {
      const data = { ...duplicateSource };
      if (variationField && data[variationField]) {
        data[variationField] = `${data[variationField]} ${i + 1}`;
      }
      newItems.push({
        id: generateId(),
        data,
        status: "pending",
      });
    }
    setItems((prev) => [...prev, ...newItems].slice(0, maxItems));
    toast({
      title: "Items duplicated",
      description: `Created ${newItems.length} items with variations.`,
    });
  }, [duplicateCount, duplicateSource, variationField, maxItems, toast]);

  const handleCreate = useCallback(async () => {
    if (items.length === 0) return;

    setIsProcessing(true);
    setProgress({ current: 0, total: items.length });

    try {
      const itemsData = items.map((item) => item.data);
      const result = await onBulkCreate(itemsData);

      setItems((prev) =>
        prev.map((item, index) => {
          const failed = result.failed.find((f) => f.index === index);
          return {
            ...item,
            status: failed ? "error" : "success",
            error: failed.error,
          };
        }),
      );

      setProgress({ current: items.length, total: items.length });

      if (result.failed.length === 0) {
        toast({
          title: "Creation complete",
          description: `Successfully created ${result.success} ${resourceName}(s).`,
        });
        setTimeout(() => {
          onOpenChange(false);
          resetForm();
        }, 1500);
      } else {
        toast({
          title: "Partial success",
          description: `Created ${result.success}, failed ${result.failed.length} ${resourceName}(s).`,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Creation failed",
        description:
          error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  }, [items, onBulkCreate, resourceName, toast, onOpenChange]);

  const resetForm = useCallback(() => {
    setItems([]);
    setCsvPreview([]);
    setSelectedTemplate("");
    setDuplicateCount(1);
    setDuplicateSource({});
    setVariationField("");
    setProgress({ current: 0, total: 0 });
  }, []);

  const downloadCsvTemplate = useCallback(() => {
    const headers = fields.map((f) => f.label).join(",");
    const example = fields
      .map((f) => f.placeholder || f.defaultValue || "")
      .join(",");
    const csv = `${headers}\n${example}`;

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${resourceName.toLowerCase()}-template.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [fields, resourceName]);

  const successCount = items.filter((i) => i.status === "success").length;
  const errorCount = items.filter((i) => i.status === "error").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-w-4xl max-h-[90vh]", className)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Bulk Create {resourceName}s
          </DialogTitle>
          <DialogDescription>
            Create multiple {resourceName.toLowerCase()}s at once using manual
            entry, CSV import, or templates.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as Record<string, unknown>)}
        >
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="manual" disabled={isProcessing}>
              <FileText className="h-4 w-4 mr-2" />
              Manual
            </TabsTrigger>
            <TabsTrigger value="csv" disabled={isProcessing}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              CSV Import
            </TabsTrigger>
            <TabsTrigger
              value="template"
              disabled={isProcessing || templates.length === 0}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="duplicate" disabled={isProcessing}>
              <Copy className="h-4 w-4 mr-2" />
              Duplicate
            </TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{items.length} items</Badge>
                {successCount > 0 && (
                  <Badge
                    variant="secondary"
                    className="bg-green-100 text-green-800"
                  >
                    {successCount} created
                  </Badge>
                )}
                {errorCount > 0 && (
                  <Badge variant="destructive">{errorCount} failed</Badge>
                )}
              </div>
              <Button
                onClick={addItem}
                disabled={items.length >= maxItems || isProcessing}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </div>

            <ScrollArea className="h-[400px] border rounded-lg">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mb-4 opacity-50" />
                  <p>No items yet. Click "Add Item" to start.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      {fields.slice(0, 4).map((field) => (
                        <TableHead key={field.key}>{field.label}</TableHead>
                      ))}
                      <TableHead className="w-20">Status</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, index) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-xs">
                          {index + 1}
                        </TableCell>
                        {fields.slice(0, 4).map((field) => (
                          <TableCell key={field.key}>
                            {field.type === "select" ? (
                              <Select
                                value={item.data[field.key] || ""}
                                onValueChange={(v) =>
                                  updateItem(item.id, field.key, v)
                                }
                                disabled={
                                  isProcessing || item.status !== "pending"
                                }
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue placeholder="Select..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {field.options?.map((opt) => (
                                    <SelectItem
                                      key={opt.value}
                                      value={opt.value}
                                    >
                                      {opt.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                type={
                                  field.type === "number" ? "number" : "text"
                                }
                                value={item.data[field.key] || ""}
                                onChange={(e) =>
                                  updateItem(item.id, field.key, e.target.value)
                                }
                                placeholder={field.placeholder}
                                className="h-8"
                                disabled={
                                  isProcessing || item.status !== "pending"
                                }
                              />
                            )}
                          </TableCell>
                        ))}
                        <TableCell>
                          {item.status === "pending" && (
                            <Badge variant="outline">Pending</Badge>
                          )}
                          {item.status === "processing" && (
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          )}
                          {item.status === "success" && (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          )}
                          {item.status === "error" && (
                            <AlertCircle
                              className="h-4 w-4 text-destructive"
                              title={item.error}
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => removeItem(item.id)}
                            disabled={isProcessing || item.status !== "pending"}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="csv" className="space-y-4">
            <div className="flex items-center gap-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload CSV
              </Button>
              <Button variant="outline" onClick={downloadCsvTemplate}>
                <Download className="h-4 w-4 mr-2" />
                Download Template
              </Button>
            </div>

            {csvPreview.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <Badge variant="outline">
                    {csvPreview.length} rows found
                  </Badge>
                  <Button onClick={importFromCsv}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Import {csvPreview.length} Items
                  </Button>
                </div>

                <ScrollArea className="h-[300px] border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {Object.keys(csvPreview[0] || {}).map((key) => (
                          <TableHead key={key}>{key}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {csvPreview.slice(0, 10).map((row, index) => (
                        <TableRow key={index}>
                          {Object.values(row).map(
                            (value: Record<string, unknown>, i) => (
                              <TableCell key={i}>{String(value)}</TableCell>
                            ),
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {csvPreview.length > 10 && (
                    <p className="text-center text-sm text-muted-foreground py-2">
                      ... and {csvPreview.length - 10} more rows
                    </p>
                  )}
                </ScrollArea>
              </>
            )}

            {csvPreview.length === 0 && (
              <div className="flex flex-col items-center justify-center h-[300px] border-2 border-dashed rounded-lg text-muted-foreground">
                <FileSpreadsheet className="h-12 w-12 mb-4 opacity-50" />
                <p>Upload a CSV file to preview and import</p>
                <p className="text-sm mt-1">
                  First row should contain column headers
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="template" className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Select Template</Label>
                <Select
                  value={selectedTemplate}
                  onValueChange={setSelectedTemplate}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedTemplate && (
                <div className="p-4 border rounded-lg bg-muted/50">
                  <h4 className="font-medium mb-2">Template Preview</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {Object.entries(
                      templates.find((t) => t.id === selectedTemplate)
                        ?.fields || {},
                    ).map(([key, value]) => (
                      <div key={key}>
                        <span className="text-muted-foreground">{key}:</span>{" "}
                        <span>{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button onClick={applyTemplate} disabled={!selectedTemplate}>
                <Plus className="h-4 w-4 mr-2" />
                Create from Template
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="duplicate" className="space-y-4">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Number of Copies</Label>
                  <Input
                    type="number"
                    min={1}
                    max={maxItems}
                    value={duplicateCount}
                    onChange={(e) =>
                      setDuplicateCount(parseInt(e.target.value) || 1)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Variation Field (optional)</Label>
                  <Select
                    value={variationField || "__none__"}
                    onValueChange={(v) =>
                      setVariationField(v === "__none__" ? "" : v)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Add number suffix to..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {fields
                        .filter((f) => f.type === "text")
                        .map((field) => (
                          <SelectItem key={field.key} value={field.key}>
                            {field.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Source Data</Label>
                <div className="grid gap-3">
                  {fields.map((field) => (
                    <div
                      key={field.key}
                      className="grid grid-cols-3 gap-2 items-center"
                    >
                      <Label className="text-sm">{field.label}</Label>
                      <div className="col-span-2">
                        {field.type === "select" ? (
                          <Select
                            value={duplicateSource[field.key] || ""}
                            onValueChange={(v) =>
                              setDuplicateSource((prev) => ({
                                ...prev,
                                [field.key]: v,
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent>
                              {field.options?.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            type={field.type === "number" ? "number" : "text"}
                            value={duplicateSource[field.key] || ""}
                            onChange={(e) =>
                              setDuplicateSource((prev) => ({
                                ...prev,
                                [field.key]: e.target.value,
                              }))
                            }
                            placeholder={field.placeholder}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Button onClick={duplicateWithVariations}>
                <Copy className="h-4 w-4 mr-2" />
                Create {duplicateCount} Copies
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {isProcessing && (
          <div className="space-y-2">
            <Progress value={(progress.current / progress.total) * 100} />
            <p className="text-sm text-center text-muted-foreground">
              Creating {progress.current} of {progress.total}...
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={resetForm} disabled={isProcessing}>
            <X className="h-4 w-4 mr-2" />
            Clear All
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={items.length === 0 || isProcessing}
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Create {items.filter((i) => i.status === "pending").length}{" "}
                {resourceName}(s)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const releaseCreateFields: BulkCreateField[] = [
  {
    key: "title",
    label: "Title",
    type: "text",
    required: true,
    placeholder: "Release title",
  },
  {
    key: "artist",
    label: "Artist",
    type: "text",
    required: true,
    placeholder: "Artist name",
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
      { value: "rnb", label: "R&B" },
    ],
  },
  {
    key: "releaseDate",
    label: "Release Date",
    type: "text",
    placeholder: "YYYY-MM-DD",
  },
];

export const trackCreateFields: BulkCreateField[] = [
  {
    key: "title",
    label: "Title",
    type: "text",
    required: true,
    placeholder: "Track title",
  },
  { key: "duration", label: "Duration", type: "text", placeholder: "3:30" },
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
    ],
  },
];

export const beatCreateFields: BulkCreateField[] = [
  {
    key: "title",
    label: "Title",
    type: "text",
    required: true,
    placeholder: "Beat title",
  },
  { key: "price", label: "Price", type: "number", placeholder: "29.99" },
  { key: "bpm", label: "BPM", type: "number", placeholder: "140" },
  {
    key: "genre",
    label: "Genre",
    type: "select",
    options: [
      { value: "trap", label: "Trap" },
      { value: "drill", label: "Drill" },
      { value: "boom_bap", label: "Boom Bap" },
      { value: "lo_fi", label: "Lo-Fi" },
    ],
  },
  {
    key: "license",
    label: "License",
    type: "select",
    options: [
      { value: "basic", label: "Basic" },
      { value: "premium", label: "Premium" },
      { value: "exclusive", label: "Exclusive" },
    ],
  },
];

export const postCreateFields: BulkCreateField[] = [
  {
    key: "content",
    label: "Content",
    type: "textarea",
    required: true,
    placeholder: "Post content...",
  },
  {
    key: "platform",
    label: "Platform",
    type: "select",
    options: [
      { value: "twitter", label: "Twitter/X" },
      { value: "instagram", label: "Instagram" },
      { value: "facebook", label: "Facebook" },
      { value: "tiktok", label: "TikTok" },
    ],
  },
  {
    key: "scheduledDate",
    label: "Schedule Date",
    type: "text",
    placeholder: "YYYY-MM-DD HH:MM",
  },
];
