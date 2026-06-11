import { logger } from "@/lib/logger";
import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FolderOpen,
  Plus,
  Search,
  ChevronDown,
  Loader2,
  Trash2,
  Copy,
  MoreVertical,
  FileAudio,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { dawCore } from "@/lib/daw";

interface Project {
  id: string;
  title: string;
  description?: string | null;
  genre?: string | null;
  bpm?: number | null;
  key?: string | null;
  status?: string | null;
  isStudioProject?: boolean | null;
  metadata?: Record<string, unknown> | null;
  favorite?: boolean | null;
  lastOpenedAt?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  sampleRate?: number | null;
  bitDepth?: number | null;
}

interface FlowStateProjectSelectorProps {
  currentProjectId: string | null;
  currentProjectName: string;
  onProjectSelect: (projectId: string, projectName: string) => void;
  onNewProject: (title: string) => Promise<{ id: string } | void>;
  onSaveProject?: () => Promise<void>;
  isDirty?: boolean;
}

export function FlowStateProjectSelector({
  currentProjectId,
  currentProjectName,
  onProjectSelect,
  onNewProject,
  onSaveProject,
  isDirty = false,
}: FlowStateProjectSelectorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({ open: false, title: "", description: "", onConfirm: () => {} });

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/studio/projects"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/studio/projects");
      const data = await response.json();
      return Array.isArray(data) ? data : data.data || [];
    },
    enabled: isOpen,
    staleTime: 30000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (projectId: string) => {
      await apiRequest("DELETE", `/api/studio/projects/${projectId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/studio/projects"] });
      toast({ title: "Project deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete project", variant: "destructive" });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const response = await apiRequest(
        "POST",
        `/api/studio/projects/${projectId}/duplicate`,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/studio/projects"] });
      toast({ title: "Project duplicated" });
    },
    onError: () => {
      toast({ title: "Failed to duplicate project", variant: "destructive" });
    },
  });

  const filteredProjects = projects.filter(
    (project) =>
      project.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.genre?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const recentProjects = [...filteredProjects]
    .sort((a, b) => {
      const dateA = a.lastOpenedAt || a.updatedAt || a.createdAt;
      const dateB = b.lastOpenedAt || b.updatedAt || b.createdAt;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    })
    .slice(0, 10);

  const handleCreateProject = useCallback(async () => {
    if (!newProjectTitle.trim()) {
      toast({ title: "Please enter a project name", variant: "destructive" });
      return;
    }

    setIsCreating(true);
    try {
      const result = await onNewProject(newProjectTitle);
      if (result?.id) {
        onProjectSelect(result.id, newProjectTitle);
        queryClient.invalidateQueries({ queryKey: ["/api/studio/projects"] });
        toast({ title: "Project created successfully" });
      }
      setNewProjectTitle("");
      setShowNewProject(false);
      setIsOpen(false);
    } catch (error) {
      toast({ title: "Failed to create project", variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  }, [newProjectTitle, onNewProject, onProjectSelect, queryClient, toast]);

  const doLoadProject = useCallback(
    async (project: Project) => {
      try {
        const loaded = await dawCore.project.loadFromBackend(project.id);
        if (loaded) {
          onProjectSelect(project.id, project.title);
          setIsOpen(false);
          toast({ title: `Opened "${project.title}"` });
        } else {
          logger.warn(
            "[ProjectSelector] Project loaded with basic metadata only - proceeding",
          );
          onProjectSelect(project.id, project.title);
          setIsOpen(false);
          toast({
            title: `Opened "${project.title}"`,
            description: "Some DAW settings may not be restored",
          });
        }
      } catch (error) {
        logger.error("[ProjectSelector] Failed to load project:", error);
        toast({
          title: "Failed to load project",
          variant: "destructive",
        });
      }
    },
    [onProjectSelect, toast],
  );

  const handleSelectProject = useCallback(
    async (project: Project) => {
      if (isDirty && onSaveProject) {
        setConfirmDialog({
          open: true,
          title: "Unsaved Changes",
          description:
            "You have unsaved changes. Save before switching projects?",
          onConfirm: async () => {
            setConfirmDialog((d) => ({ ...d, open: false }));
            setIsSaving(true);
            try {
              await onSaveProject();
              toast({ title: "Project saved" });
              await doLoadProject(project);
            } catch {
              setConfirmDialog({
                open: true,
                title: "Save Failed",
                description:
                  "Could not save the project. Switch anyway and lose changes?",
                onConfirm: async () => {
                  setConfirmDialog((d) => ({ ...d, open: false }));
                  await doLoadProject(project);
                },
              });
            } finally {
              setIsSaving(false);
            }
          },
        });
        return;
      }

      await doLoadProject(project);
    },
    [isDirty, onSaveProject, doLoadProject, setConfirmDialog, toast],
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto py-1 px-2 gap-2 text-left hover:bg-white/5"
          >
            <div className="flex flex-col items-start">
              <span className="text-sm font-medium text-white truncate max-w-[150px]">
                {currentProjectName}
              </span>
              {isDirty && (
                <span className="text-[10px] text-amber-400">
                  Unsaved changes
                </span>
              )}
            </div>
            <ChevronDown className="h-3 w-3 text-white/50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-80 p-0 bg-slate-950 border-slate-800"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="p-3 border-b border-slate-800">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
              <Input
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-slate-900 border-slate-700 text-sm"
              />
            </div>
          </div>

          <div className="p-2 border-b border-slate-800">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
              onClick={() => setShowNewProject(true)}
            >
              <Plus className="h-4 w-4" />
              New Project
            </Button>
            {onSaveProject && currentProjectId && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 text-green-400 hover:text-green-300 hover:bg-green-500/10"
                onClick={async () => {
                  setIsSaving(true);
                  try {
                    await onSaveProject();
                    toast({ title: "Project saved" });
                  } finally {
                    setIsSaving(false);
                  }
                }}
                disabled={isSaving}
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Current Project
              </Button>
            )}
          </div>

          <ScrollArea className="h-64">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-white/40" />
              </div>
            ) : recentProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-white/40">
                <FolderOpen className="h-8 w-8 mb-2" />
                <p className="text-sm">No projects found</p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {recentProjects.map((project) => (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={cn(
                      "group flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                      project.id === currentProjectId
                        ? "bg-blue-500/20 border border-blue-500/30"
                        : "hover:bg-white/5",
                    )}
                    onClick={() => handleSelectProject(project)}
                  >
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0">
                      <FileAudio className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {project.title}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-white/40">
                        <span>{project.bpm || 120} BPM</span>
                        {project.genre && (
                          <>
                            <span>•</span>
                            <span className="truncate">{project.genre}</span>
                          </>
                        )}
                        <span>•</span>
                        <span>
                          {formatDate(project.updatedAt || project.createdAt)}
                        </span>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="bg-slate-900 border-slate-700"
                      >
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            duplicateMutation.mutate(project.id);
                          }}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-400 focus:text-red-400"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDialog({
                              open: true,
                              title: "Delete Project",
                              description: `Are you sure you want to delete "${project.title}"? This cannot be undone.`,
                              onConfirm: () =>
                                deleteMutation.mutate(project.id),
                            });
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </motion.div>
                ))}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      <Dialog open={showNewProject} onOpenChange={setShowNewProject}>
        <DialogContent className="max-w-md bg-slate-950 border-slate-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-blue-400" />
              New Project
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Project Name</Label>
              <Input
                placeholder="My New Track"
                value={newProjectTitle}
                onChange={(e) => setNewProjectTitle(e.target.value)}
                className="bg-slate-900 border-slate-700"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateProject();
                }}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowNewProject(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateProject}
                disabled={isCreating || !newProjectTitle.trim()}
                className="bg-blue-500 hover:bg-blue-600"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Project"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((d) => ({ ...d, open }))}
      >
        <AlertDialogContent className="bg-zinc-900 border-zinc-700">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              {confirmDialog.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="bg-zinc-800 border-zinc-700 hover:bg-zinc-700"
              onClick={() => setConfirmDialog((d) => ({ ...d, open: false }))}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-blue-600 hover:bg-blue-700"
              onClick={confirmDialog.onConfirm}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
