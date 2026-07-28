import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Save, FolderOpen, Trash2, Copy, Share2, MoreHorizontal, BookOpen, Clock, Star, StarOff, Check, Loader2, FileText, Settings, Download } from "lucide-react";

export interface BatchTemplate {
  id: string;
  name: string;
  description?: string;
  resource: string;
  action: string;
  configuration: Record<string, any>;
  isFavorite: boolean;
  isShared: boolean;
  sharedBy?: string;
  createdAt: string;
  updatedAt: string;
  usageCount: number;
}

export interface BatchTemplateManagerProps {
  resource: string;
  currentConfiguration?: Record<string, any>;
  onApplyTemplate: (configuration: Record<string, any>) => void;
  className?: string;
}

export function BatchTemplateManager({
  resource,
  currentConfiguration,
  onApplyTemplate,
  className,
}: BatchTemplateManagerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] =
    useState<BatchTemplate | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [shareEmail, setShareEmail] = useState("");

  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ["/api/batch/templates", resource],
    queryFn: async () => {
      const response = await apiRequest(
        "GET",
        `/api/batch/templates?resource=${resource}`,
      );
      return response.templates || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      configuration: Record<string, any>;
    }) => {
      return apiRequest("POST", "/api/batch/templates", {
        ...data,
        resource,
        action: "bulk_operation",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/batch/templates"] });
      toast({
        title: "Template saved",
        description: "Your batch template has been saved.",
      });
      setSaveDialogOpen(false);
      setTemplateName("");
      setTemplateDescription("");
    },
    onError: (error) => {
      toast({
        title: "Failed to save template",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<BatchTemplate>;
    }) => {
      return apiRequest("PUT", `/api/batch/templates/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/batch/templates"] });
      toast({ title: "Template updated" });
    },
    onError: (error) => {
      toast({
        title: "Failed to update template",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/batch/templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/batch/templates"] });
      toast({ title: "Template deleted" });
      setDeleteDialogOpen(false);
      setSelectedTemplate(null);
    },
    onError: (error) => {
      toast({
        title: "Failed to delete template",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const shareMutation = useMutation({
    mutationFn: async ({
      templateId,
      email,
    }: {
      templateId: string;
      email: string;
    }) => {
      return apiRequest("POST", `/api/batch/templates/${templateId}/share`, {
        email,
      });
    },
    onSuccess: () => {
      toast({
        title: "Template shared",
        description: `Template shared successfully.`,
      });
      setShareDialogOpen(false);
      setShareEmail("");
    },
    onError: (error) => {
      toast({
        title: "Failed to share template",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSaveTemplate = useCallback(() => {
    if (!templateName.trim() || !currentConfiguration) return;
    saveMutation.mutate({
      name: templateName.trim(),
      description: templateDescription.trim() || undefined,
      configuration: currentConfiguration,
    });
  }, [templateName, templateDescription, currentConfiguration, saveMutation]);

  const handleApplyTemplate = useCallback(
    (template: BatchTemplate) => {
      onApplyTemplate(template.configuration);
      updateMutation.mutate({
        id: template.id,
        data: { usageCount: template.usageCount + 1 },
      });
      toast({
        title: "Template applied",
        description: `Applied "${template.name}" configuration.`,
      });
      setLoadDialogOpen(false);
    },
    [onApplyTemplate, updateMutation, toast],
  );

  const handleToggleFavorite = useCallback(
    (template: BatchTemplate) => {
      updateMutation.mutate({
        id: template.id,
        data: { isFavorite: !template.isFavorite },
      });
    },
    [updateMutation],
  );

  const handleDuplicateTemplate = useCallback(
    (template: BatchTemplate) => {
      saveMutation.mutate({
        name: `${template.name} (Copy)`,
        description: template.description,
        configuration: template.configuration,
      });
    },
    [saveMutation],
  );

  const handleExportTemplate = useCallback(
    (template: BatchTemplate) => {
      const exportData = {
        name: template.name,
        description: template.description,
        resource: template.resource,
        action: template.action,
        configuration: template.configuration,
        exportedAt: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `batch-template-${template.name.toLowerCase().replace(/\s+/g, "-")}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Template exported" });
    },
    [toast],
  );

  const favoriteTemplates = useMemo(
    () => templates.filter((t: BatchTemplate) => t.isFavorite),
    [templates],
  );

  useMemo(
    () =>
      [...templates]
        .sort(
          (a: BatchTemplate, b: BatchTemplate) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )
        .slice(0, 5),
    [templates],
  );

  return (
    <TooltipProvider>
      <div className={cn("flex items-center gap-2", className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSaveDialogOpen(true)}
              disabled={
                !currentConfiguration ||
                Object.keys(currentConfiguration).length === 0
              }
            >
              <Save className="h-4 w-4 mr-2" />
              Save Template
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Save current configuration as a template
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLoadDialogOpen(true)}
              disabled={templates.length === 0}
            >
              <FolderOpen className="h-4 w-4 mr-2" />
              Load Template
            </Button>
          </TooltipTrigger>
          <TooltipContent>Load a saved template</TooltipContent>
        </Tooltip>

        {favoriteTemplates.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Star className="h-4 w-4 mr-2" />
                Favorites
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {favoriteTemplates.map((template: BatchTemplate) => (
                <DropdownMenuItem
                  key={template.id}
                  onClick={() => handleApplyTemplate(template)}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  {template.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Save className="h-5 w-5" />
                Save Template
              </DialogTitle>
              <DialogDescription>
                Save your current batch configuration as a reusable template.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="template-name">Template Name *</Label>
                <Input
                  id="template-name"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g., Standard Release Settings"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-description">Description</Label>
                <Textarea
                  id="template-description"
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  placeholder="Describe what this template does..."
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setSaveDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveTemplate}
                disabled={!templateName.trim() || saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Save Template
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={loadDialogOpen} onOpenChange={setLoadDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5" />
                Load Template
              </DialogTitle>
              <DialogDescription>
                Choose a template to apply to your current selection.
              </DialogDescription>
            </DialogHeader>

            {templatesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No templates saved yet.</p>
                <p className="text-sm">
                  Save your first template to get started.
                </p>
              </div>
            ) : (
              <ScrollArea className="max-h-[60vh]">
                <div className="space-y-3">
                  {templates.map((template: BatchTemplate) => (
                    <Card
                      key={template.id}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-muted/50",
                        template.isFavorite && "ring-1 ring-amber-400/50",
                      )}
                      onClick={() => handleApplyTemplate(template)}
                    >
                      <CardHeader className="py-3">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <CardTitle className="text-base flex items-center gap-2">
                              {template.name}
                              {template.isFavorite && (
                                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                              )}
                              {template.isShared && (
                                <Badge variant="secondary" className="text-xs">
                                  <Share2 className="h-3 w-3 mr-1" />
                                  Shared
                                </Badge>
                              )}
                            </CardTitle>
                            {template.description && (
                              <CardDescription className="text-sm">
                                {template.description}
                              </CardDescription>
                            )}
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              asChild
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleFavorite(template);
                                }}
                              >
                                {template.isFavorite ? (
                                  <>
                                    <StarOff className="h-4 w-4 mr-2" />
                                    Remove from Favorites
                                  </>
                                ) : (
                                  <>
                                    <Star className="h-4 w-4 mr-2" />
                                    Add to Favorites
                                  </>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedTemplate(template);
                                  setShareDialogOpen(true);
                                }}
                              >
                                <Share2 className="h-4 w-4 mr-2" />
                                Share
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDuplicateTemplate(template);
                                }}
                              >
                                <Copy className="h-4 w-4 mr-2" />
                                Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleExportTemplate(template);
                                }}
                              >
                                <Download className="h-4 w-4 mr-2" />
                                Export
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedTemplate(template);
                                  setDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardHeader>
                      <CardContent className="py-2 border-t">
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(template.updatedAt).toLocaleDateString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <Settings className="h-3 w-3" />
                            {Object.keys(template.configuration).length}{" "}
                            settings
                          </span>
                          <span>Used {template.usageCount}x</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setLoadDialogOpen(false)}
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Template</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{selectedTemplate.name}"? This
                action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  selectedTemplate && deleteMutation.mutate(selectedTemplate.id)
                }
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Delete"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Share2 className="h-5 w-5" />
                Share Template
              </DialogTitle>
              <DialogDescription>
                Share "{selectedTemplate.name}" with a team member.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="share-email">Email Address</Label>
                <Input
                  id="share-email"
                  type="email"
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  placeholder="colleague@example.com"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShareDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() =>
                  selectedTemplate &&
                  shareMutation.mutate({
                    templateId: selectedTemplate.id,
                    email: shareEmail,
                  })
                }
                disabled={!shareEmail.trim() || shareMutation.isPending}
              >
                {shareMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Share2 className="h-4 w-4 mr-2" />
                    Share
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

export function QuickTemplateButton({
  template,
  onApply,
}: {
  template: BatchTemplate;
  onApply: (configuration: Record<string, any>) => void;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onApply(template.configuration)}
            className="gap-2"
          >
            <FileText className="h-4 w-4" />
            {template.name}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{template.description || "Apply this template"}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
