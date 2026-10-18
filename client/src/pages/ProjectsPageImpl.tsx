import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { draftStorage } from "@/lib/offline/DraftStorage";
import { offlineQueue, syncManager } from "@/lib/offline";
import { offlineIdentity, assertOfflineIdentity } from "@/lib/offline/identity";
import { useRequireSubscription } from "@/hooks/useRequireAuth";
import { useAnalyticsInvalidation } from "@/hooks/useAnalyticsInvalidation";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  formatProjectDate,
  formatProjectDuration,
  formatProjectFileSize,
  normalizeMutationSuccess,
  normalizeProjectResponse,
  normalizeProjectsResponse,
  normalizeSongwritingAssist,
  normalizeSongwritingDraftInput,
  normalizeSongwritingSessionResponse,
  normalizeSongwritingSessions,
  readProjectsJson,
  resolveProjectAudioSource,
  type Project,
  type SongwritingDraftInput,
  type SongwritingSession,
} from "@/lib/projectsPageContracts";
import { AppLayout } from "@/components/layout/AppLayout";
import { PendingChangesPanel } from "@/components/offline/PendingChangesPanel";
import { ConflictResolver } from "@/components/offline/ConflictResolver";
import { StudioProjectDialog } from "@/components/studio/StudioProjectDialog";
import { RoyaltySplitManager } from "@/components/royalties/RoyaltySplitManager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonProjectCard } from "@/components/ui/skeleton-loader";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Calendar,
  ChevronRight,
  Clock,
  Copy,
  Edit,
  FileAudio,
  Lightbulb,
  Loader2,
  Mic2,
  MoreVertical,
  Music,
  Pause,
  PenLine,
  Play,
  Plus,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Upload,
  Users,
} from "lucide-react";

type EditForm = Pick<Project, "title"> & {
  description: string;
  genre: string;
  expectedUpdatedAt?: string | null;
};

type MutationResult = { queued: boolean };

const EMPTY_SONG: SongwritingDraftInput = {
  title: "",
  genre: "hip-hop",
  mood: "",
  bpm: 90,
  key: "C",
  lyrics: "",
  notes: "",
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function projectStage(project: Project): string {
  return project.workflowStage || project.status || "setup";
}

function workflowLabel(stage: string): string {
  const labels: Record<string, string> = {
    setup: "SETUP",
    writing: "WRITING",
    recording: "RECORDING",
    editing: "EDITING",
    mixing: "MIXING",
    mastering: "MASTERING",
    delivery: "DELIVERY",
    completed: "COMPLETED",
  };
  return labels[stage] || stage.toUpperCase() || "DRAFT";
}

function workflowColor(stage: string): string {
  switch (stage) {
    case "delivery":
    case "completed":
      return "bg-green-100 text-green-800 border-green-200";
    case "mastering":
      return "bg-purple-100 text-purple-800 border-purple-200";
    case "mixing":
      return "bg-indigo-100 text-indigo-800 border-indigo-200";
    case "editing":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "recording":
      return "bg-cyan-100 text-cyan-800 border-cyan-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
}

function progressValue(project: Project): number {
  if (typeof project.progress === "number" && Number.isFinite(project.progress)) {
    return Math.max(0, Math.min(100, project.progress));
  }
  const stages: Record<string, number> = {
    setup: 10,
    writing: 15,
    recording: 25,
    editing: 45,
    mixing: 65,
    mastering: 85,
    delivery: 100,
    completed: 100,
  };
  return stages[projectStage(project)] ?? 10;
}

export default function ProjectsPageImpl() {
  const { user, isLoading: authLoading } = useRequireSubscription();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { invalidateOnProjectChange } = useAnalyticsInvalidation();
  const [activeTab, setActiveTab] = useState("projects");
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const editRequestRef = useRef(0);
  const [royaltySplitProject, setRoyaltySplitProject] = useState<Project | null>(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [reviewConflicts, setReviewConflicts] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({
    title: "",
    description: "",
    genre: "",
  });
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioProjectRef = useRef<string | null>(null);

  const {
    data: projectsData,
    isLoading: projectsLoading,
    isError: projectsError,
    refetch: refetchProjects,
    isFetching: projectsFetching,
  } = useQuery({
    queryKey: ["/api/projects"],
    enabled: Boolean(user),
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/projects");
      return normalizeProjectsResponse(await readProjectsJson(response));
    },
  });
  const projects = projectsData?.data ?? [];

  const invalidateProjectQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/studio/projects"] }),
      queryClient.invalidateQueries({
        queryKey: ["/api/studio/start-hub/summary"],
      }),
    ]);
    invalidateOnProjectChange();
  };

  const deleteMutation = useMutation<MutationResult, Error, string>({
    mutationFn: async (projectId) => {
      const identity = offlineIdentity();
      const project = projects.find((candidate) => candidate.id === projectId);
      if (!project) {
        throw new Error("Refresh your projects before deleting this item.");
      }
      if (project.updatedAt === undefined) throw new Error("Refresh your projects to load a saved project version before deleting.");
      const expectedUpdatedAt = project.updatedAt === null ? null : new Date(project.updatedAt).toISOString();

      let action: Awaited<ReturnType<typeof offlineQueue.enqueue>> | undefined;
      try {
        action = await offlineQueue.enqueue(
          "project.delete",
          {
            projectId,
            expectedUpdatedAt,
          },
          { conflictStrategy: "manual" },
        );
      } catch {
        assertOfflineIdentity(identity);
        if (!navigator.onLine) {
          throw new Error(
            "Deletion could not be saved on this device. Reconnect and try again.",
          );
        }
        toast({
          title: "Local queue unavailable",
          description: "Deletion requires a successful server response.",
        });
      }

      assertOfflineIdentity(identity);
      if (action) {
        const result = navigator.onLine
          ? await syncManager.forceSyncAction(action.id)
          : null;
        if (result?.outcome === "rejected" || result?.outcome === "conflict") {
          throw new Error(result.error || "Deletion needs review.");
        }
        return { queued: !result?.success };
      }

      const response = await apiRequest(
        "DELETE",
        `/api/studio/projects/${encodeURIComponent(projectId)}`,
        { expectedUpdatedAt },
      );
      normalizeMutationSuccess(await readProjectsJson(response));
      return { queued: false };
    },
    onSuccess: async (result) => {
      await invalidateProjectQueries();
      toast({
        title: result.queued ? "Deletion pending" : "Project Deleted",
        description: result.queued
          ? "Saved on this device. The project remains visible until the server confirms deletion."
          : "The project has been removed successfully.",
      });
    },
    onError: (error) =>
      toast({
        title: "Delete Failed",
        description: (error as { status?: number }).status === 409
          ? "This project changed. Refresh and review before deleting again."
          : errorMessage(error, "Failed to delete project."),
        variant: "destructive",
      }),
  });

  const duplicateMutation = useMutation<Project, Error, string>({
    mutationFn: async (projectId) => {
      const response = await apiRequest(
        "POST",
        `/api/studio/projects/${encodeURIComponent(projectId)}/duplicate`,
      );
      return normalizeProjectResponse(await readProjectsJson(response));
    },
    onSuccess: async (newProject) => {
      await invalidateProjectQueries();
      toast({
        title: "Project Duplicated",
        description: `"${newProject.title}" is ready to edit.`,
      });
    },
    onError: (error) =>
      toast({
        title: "Duplicate Failed",
        description: errorMessage(error, "Failed to duplicate project."),
        variant: "destructive",
      }),
  });

  const editMutation = useMutation<MutationResult, Error, { id: string; data: EditForm }>({
    mutationFn: async ({ id, data }) => {
      const identity = offlineIdentity();
      if (!editingProject || editingProject.id !== id || editingProject.updatedAt === undefined) {
        throw new Error("This draft has no saved project version. Refresh and review the server copy before saving.");
      }
      const expectedUpdatedAt = editingProject.updatedAt === null ? null : new Date(editingProject.updatedAt).toISOString();
      const normalized: EditForm = {
        title: data.title.trim(),
        description: data.description.trim(),
        genre: data.genre.trim(),
      };
      if (!normalized.title || normalized.title.length > 255) {
        throw new Error("Project title must be between 1 and 255 characters.");
      }
      if (normalized.description.length > 5000) {
        throw new Error("Description must be 5,000 characters or fewer.");
      }
      if (normalized.genre.length > 100) {
        throw new Error("Genre must be 100 characters or fewer.");
      }

      let draftVersion: number | undefined;
      try {
        draftVersion = (
          await draftStorage.saveDraft(`project-edit:${id}`, { ...normalized, expectedUpdatedAt })
        ).version;
      } catch {
        setDraftMessage(
          "Local storage unavailable. This update requires a successful server response.",
        );
      }
      assertOfflineIdentity(identity);

      if (draftVersion !== undefined) {
        const action = await offlineQueue.enqueue(
          "project.update",
          {
            projectId: id,
            changes: normalized,
            isStudio: false,
            expectedUpdatedAt,
          },
          {
            conflictStrategy: "manual",
            metadata: { formId: `project-edit:${id}`, draftVersion },
          },
        );
        assertOfflineIdentity(identity);
        const result = navigator.onLine
          ? await syncManager.forceSyncAction(action.id)
          : null;
        if (result?.outcome === "rejected" || result?.outcome === "conflict") {
          throw new Error(
            result.error ||
              "This project changed on the server. Review pending changes.",
          );
        }
        return { queued: !result?.success };
      }

      const response = await apiRequest(
        "PATCH",
        `/api/studio/projects/${encodeURIComponent(id)}`,
        { ...normalized, expectedUpdatedAt },
      );
      normalizeProjectResponse(await readProjectsJson(response));
      return { queued: false };
    },
    onSuccess: async (result) => {
      await invalidateProjectQueries();
      toast({
        title: result.queued
          ? "Project change saved on this device"
          : "Project Updated",
        description: result.queued
          ? "Pending server confirmation. Review its status below; keep the draft until it is applied."
          : "Your project has been updated successfully.",
      });
      setIsEditOpen(false);
      // Queue acknowledgments below remove only the exact persisted draft version.
      setEditingProject(null);
    },
    onError: (error) =>
      toast({
        title: "Update Failed",
        description: (error as { status?: number }).status === 409
          ? "This project changed on the server. Your form is still here; review the conflict before saving again."
          : errorMessage(error, "Failed to update project."),
        variant: "destructive",
      }),
  });

  useEffect(
    () =>
      offlineQueue.on("action-updated", (event) => {
        const action = event.action;
        if (!action?.type.startsWith("project.") || action.status !== "completed") {
          return;
        }
        void queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/studio/projects"] });
        const formId = action.metadata?.formId;
        if (typeof formId === "string") {
          void (async () => {
            const saved = await draftStorage.getDraft(formId);
            if (saved?.version === action.metadata?.draftVersion) {
              await draftStorage.deleteDraft(formId);
            }
          })().catch(() =>
            setDraftMessage(
              "The server confirmed your change, but its old local draft could not be removed.",
            ),
          );
        }
      }),
    [queryClient],
  );

  useEffect(
    () => () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute("src");
        audioRef.current.load();
        audioRef.current = null;
      }
    },
    [],
  );

  const stopPlayback = () => {
    audioRef.current?.pause();
    setCurrentlyPlaying(null);
    setAudioLoading(null);
    audioProjectRef.current = null;
  };

  const handlePlayProject = (project: Project) => {
    if (currentlyPlaying === project.id && audioRef.current) {
      stopPlayback();
      return;
    }
    if (!project.audioUrl) {
      toast({
        title: "No Audio File",
        description: "This project doesn't have an audio file attached.",
        variant: "destructive",
      });
      return;
    }

    let audioSrc: string;
    try {
      audioSrc = resolveProjectAudioSource(project.audioUrl);
    } catch (error) {
      toast({
        title: "Playback Blocked",
        description: errorMessage(error, "This audio source is not allowed."),
        variant: "destructive",
      });
      return;
    }

    audioRef.current?.pause();
    audioProjectRef.current = project.id;
    setAudioLoading(project.id);
    setCurrentlyPlaying(project.id);

    const audio = audioRef.current ?? new Audio();
    audio.preload = "metadata";
    const resolvedNext = new URL(audioSrc, window.location.origin).href;
    if (audio.src !== resolvedNext) {
      audio.src = audioSrc;
    } else {
      audio.currentTime = 0;
    }
    audioRef.current = audio;
    audio.oncanplay = () => {
      if (audioProjectRef.current === project.id) setAudioLoading(null);
    };
    audio.onended = () => {
      if (audioProjectRef.current === project.id) stopPlayback();
    };
    audio.onerror = () => {
      if (audioProjectRef.current !== project.id) return;
      stopPlayback();
      toast({
        title: "Playback Error",
        description: "Could not load audio file.",
        variant: "destructive",
      });
    };
    void audio.play().catch(() => {
      if (audioProjectRef.current !== project.id) return;
      stopPlayback();
      toast({
        title: "Playback Error",
        description: "Playback could not be started.",
        variant: "destructive",
      });
    });
  };

  const handleEdit = async (project: Project) => {
    const requestId = ++editRequestRef.current;
    const identity = offlineIdentity();
    setEditingProject(project);
    setDraftMessage("");
    setEditForm({
      title: project.title,
      description: project.description ?? "",
      genre: project.genre ?? "",
    });
    setIsEditOpen(true);
    try {
      const saved = await draftStorage.getDraft<EditForm>(
        `project-edit:${project.id}`,
      );
      assertOfflineIdentity(identity);
      if (requestId !== editRequestRef.current) return;
      if (saved) {
        setEditingProject({ ...project, updatedAt: saved.data.expectedUpdatedAt });
        setEditForm(saved.data);
        setDraftMessage(
          saved.data.expectedUpdatedAt === undefined
            ? "This older draft has no saved project version. Copy its content, then reopen the server version before applying your changes."
            : "Recovered a draft saved on this device. Review it before updating.",
        );
      }
    } catch {
      if (requestId !== editRequestRef.current) return;
      setDraftMessage(
        "Local drafts are unavailable. Keep this form open until your update succeeds.",
      );
    }
  };

  const handleSaveEditDraft = async () => {
    if (!editingProject || editingProject.updatedAt === undefined) {
      setDraftMessage("This draft has no saved project version. Copy its content, then reopen the server version before saving.");
      return;
    }
    const identity = offlineIdentity();
    const expectedUpdatedAt = editingProject.updatedAt === null ? null : new Date(editingProject.updatedAt).toISOString();
    try {
      await draftStorage.saveDraft(`project-edit:${editingProject.id}`, { ...editForm, expectedUpdatedAt });
      assertOfflineIdentity(identity);
      setDraftMessage("Draft saved on this device with its original project version.");
    } catch {
      assertOfflineIdentity(identity);
      setDraftMessage("Draft could not be saved on this device. Keep this form open until your update succeeds.");
    }
  };

  const handleUseServerVersion = () => {
    const snapshot = projects.find(candidate => candidate.id === editingProject?.id);
    if (!snapshot || snapshot.updatedAt === undefined) {
      setDraftMessage("Refresh the project list to load the current server version first.");
      return;
    }
    ++editRequestRef.current;
    setEditingProject(snapshot);
    setEditForm({ title: snapshot.title, description: snapshot.description ?? "", genre: snapshot.genre ?? "" });
    setDraftMessage("Loaded the server version. The older device draft remains saved until you explicitly replace it.");
  };

  const requestDelete = (project: Project) => {
    if (
      window.confirm(
        `Delete “${project.title}”? This permanently removes the project and its saved studio data.`,
      )
    ) {
      deleteMutation.mutate(project.id);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" role="status">
        <Loader2 className="h-8 w-8 animate-spin" aria-label="Loading projects" />
      </div>
    );
  }
  if (!user) return null;

  return (
    <AppLayout>
      <main className="p-6" aria-label="Projects management">
        <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Your Projects</h1>
            <p className="text-muted-foreground" role="status" aria-live="polite">
              {projects.length} project{projects.length === 1 ? "" : "s"} total
            </p>
          </div>
          <Button className="gradient-bg" onClick={() => setIsUploadOpen(true)}>
            <Upload className="h-4 w-4 mr-2" /> New Project
          </Button>
          <StudioProjectDialog
            open={isUploadOpen}
            onOpenChange={setIsUploadOpen}
            onProjectCreated={() => void invalidateProjectQueries()}
          />
        </header>

        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Edit Project</DialogTitle></DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!editingProject) return;
                editMutation.mutate({ id: editingProject.id, data: editForm });
              }}
            >
              <div>
                <Label htmlFor="edit-title">Project Title</Label>
                <Input
                  id="edit-title"
                  required
                  maxLength={255}
                  value={editForm.title}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="edit-description">Description (Optional)</Label>
                <Textarea
                  id="edit-description"
                  maxLength={5000}
                  rows={3}
                  value={editForm.description}
                  onChange={(event) =>
                    setEditForm((prev) => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="edit-genre">Genre</Label>
                <Select
                  value={editForm.genre}
                  onValueChange={(genre) =>
                    setEditForm((prev) => ({ ...prev, genre }))
                  }
                >
                  <SelectTrigger id="edit-genre"><SelectValue placeholder="Select genre" /></SelectTrigger>
                  <SelectContent>
                    {["pop", "rock", "hip-hop", "electronic", "jazz", "classical", "country", "r&b", "indie", "other"].map((genre) => (
                      <SelectItem key={genre} value={genre}>{genre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {editingProject?.updatedAt === undefined && (
                  <Button type="button" variant="outline" onClick={handleUseServerVersion}>
                    Use current server version
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleSaveEditDraft()}
                >
                  Save draft on device
                </Button>
                <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={editMutation.isPending}>
                  {editMutation.isPending ? "Updating…" : "Update Project"}
                </Button>
              </div>
              {draftMessage && <p className="text-sm text-muted-foreground" role="status">{draftMessage}</p>}
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(royaltySplitProject)}
          onOpenChange={(open) => !open && setRoyaltySplitProject(null)}
        >
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Royalty Splits — {royaltySplitProject?.title}</DialogTitle>
            </DialogHeader>
            {royaltySplitProject && (
              <RoyaltySplitManager projectId={royaltySplitProject.id} />
            )}
          </DialogContent>
        </Dialog>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="projects"><Music className="w-4 h-4 mr-1" />My Projects</TabsTrigger>
            <TabsTrigger value="songwriting"><Mic2 className="w-4 h-4 mr-1" />Songwriting</TabsTrigger>
          </TabsList>

          <TabsContent value="projects" className="space-y-6">
            <PendingChangesPanel />
            <Button variant="outline" onClick={() => setReviewConflicts(true)}>
              Review sync conflicts
            </Button>
            <ConflictResolver
              open={reviewConflicts}
              onOpenChange={setReviewConflicts}
              onResolve={() => void syncManager.sync()}
            />

            {projectsError && (
              <div role="alert" className="rounded-lg border border-destructive p-4 space-y-2">
                <p>
                  {projectsData
                    ? "Projects could not be refreshed. Showing the last loaded list."
                    : "Your projects could not be loaded. Your work has not been removed."}
                </p>
                <Button
                  variant="outline"
                  disabled={projectsFetching}
                  onClick={() => void refetchProjects()}
                >
                  {projectsFetching ? "Retrying…" : "Retry loading projects"}
                </Button>
              </div>
            )}

            {projectsLoading ? (
              <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" aria-busy="true">
                {[...Array(6)].map((_, index) => <SkeletonProjectCard key={index} />)}
              </section>
            ) : projectsError && !projectsData ? null : projects.length === 0 ? (
              <EmptyState
                icon={Sparkles}
                title="No projects yet. Create your first masterpiece!"
                description="Create a project to get started with Max Booster's studio tools."
                actionLabel="New Project"
                onAction={() => setIsUploadOpen(true)}
                size="lg"
                variant="card"
              />
            ) : (
              <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" aria-label="Projects grid">
                {projects.map((project) => {
                  const stage = projectStage(project);
                  const progress = progressValue(project);
                  return (
                    <Card
                      key={project.id}
                      className="hover:shadow-lg transition-shadow cursor-pointer"
                      onClick={() => setLocation(`/studio/${encodeURIComponent(project.id)}`)}
                    >
                      <CardContent className="p-6 space-y-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shrink-0">
                              <FileAudio className="h-6 w-6 text-white" />
                            </div>
                            <div className="min-w-0">
                              <h2 className="font-semibold truncate">{project.title}</h2>
                              <p className="text-sm text-muted-foreground">
                                {project.genre ? `${project.genre} • ` : ""}
                                <Calendar className="inline h-3 w-3 mr-1" />
                                {formatProjectDate(project.createdAt)}
                              </p>
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={`Actions for ${project.title}`}
                                onClick={(event) => event.stopPropagation()}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <DropdownMenuItem onClick={() => handlePlayProject(project)}>
                                {audioLoading === project.id ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : currentlyPlaying === project.id ? (
                                  <Pause className="h-4 w-4 mr-2" />
                                ) : (
                                  <Play className="h-4 w-4 mr-2" />
                                )}
                                {currentlyPlaying === project.id ? "Pause" : "Play"}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setLocation(`/studio/${encodeURIComponent(project.id)}`)}>
                                <Music className="h-4 w-4 mr-2" />Open in Studio
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => void handleEdit(project)}>
                                <Edit className="h-4 w-4 mr-2" />Edit Details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setRoyaltySplitProject(project)}>
                                <Users className="h-4 w-4 mr-2" />Royalty Splits
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={duplicateMutation.isPending}
                                onClick={() => duplicateMutation.mutate(project.id)}
                              >
                                <Copy className="h-4 w-4 mr-2" />Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setLocation(`/analytics?project=${encodeURIComponent(project.id)}`)}>
                                <TrendingUp className="h-4 w-4 mr-2" />Analytics
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-red-600" onClick={() => requestDelete(project)}>
                                <Trash2 className="h-4 w-4 mr-2" />Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <Badge className={workflowColor(stage)}>{workflowLabel(stage)}</Badge>
                            <span className="text-sm text-muted-foreground">{progress}% Complete</span>
                          </div>
                          <Progress value={progress} className="h-2" />
                        </div>

                        <div className="space-y-1 text-sm text-muted-foreground">
                          {typeof project.duration === "number" && (
                            <p><Clock className="h-3 w-3 inline mr-2" />Duration: {formatProjectDuration(project.duration)}</p>
                          )}
                          {typeof project.fileSize === "number" && (
                            <p><FileAudio className="h-3 w-3 inline mr-2" />Size: {formatProjectFileSize(project.fileSize)}</p>
                          )}
                          {typeof project.streams === "number" && project.streams > 0 && (
                            <p><Play className="h-3 w-3 inline mr-2" />Streams: {project.streams.toLocaleString()}</p>
                          )}
                        </div>
                        {project.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">{project.description}</p>
                        )}
                        <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
                          <Button variant="outline" size="sm" className="flex-1" onClick={() => handlePlayProject(project)}>
                            {audioLoading === project.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : currentlyPlaying === project.id ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                            {audioLoading === project.id ? "Buffering…" : currentlyPlaying === project.id ? "Pause" : "Play"}
                          </Button>
                          <Button
                            size="sm"
                            className="flex-1"
                            onClick={() =>
                              stage === "delivery" || stage === "completed"
                                ? setLocation(`/analytics?project=${encodeURIComponent(project.id)}`)
                                : setLocation(`/studio/${encodeURIComponent(project.id)}`)
                            }
                          >
                            {stage === "delivery" || stage === "completed" ? <TrendingUp className="h-4 w-4 mr-2" /> : <Music className="h-4 w-4 mr-2" />}
                            {stage === "delivery" || stage === "completed" ? "Analytics" : "Continue"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </section>
            )}
          </TabsContent>

          <TabsContent value="songwriting">
            <SongwritingTab />
          </TabsContent>
        </Tabs>
      </main>
    </AppLayout>
  );
}

function SongwritingTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedSession, setSelectedSession] = useState<SongwritingSession | null>(null);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [newSession, setNewSession] = useState<SongwritingDraftInput>(EMPTY_SONG);
  const [rhymeWord, setRhymeWord] = useState("");

  const {
    data: sessions = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["/api/songwriting"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/songwriting");
      return normalizeSongwritingSessions(await readProjectsJson(response));
    },
  });

  const createMutation = useMutation<SongwritingSession, Error, SongwritingDraftInput>({
    mutationFn: async (input) => {
      const normalized = normalizeSongwritingDraftInput(input);
      const response = await apiRequest("POST", "/api/songwriting", normalized);
      return normalizeSongwritingSessionResponse(await readProjectsJson(response));
    },
    onSuccess: async (session) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/songwriting"] });
      setSelectedSession(session);
      setIsNewDialogOpen(false);
      setNewSession(EMPTY_SONG);
      toast({ title: "Session Created", description: "Songwriting session saved." });
    },
    onError: (error) =>
      toast({
        title: "Create Failed",
        description: errorMessage(error, "Could not create songwriting session."),
        variant: "destructive",
      }),
  });

  const updateMutation = useMutation<
    SongwritingSession,
    Error,
    { id: string; lyrics: string; notes: string }
  >({
    mutationFn: async ({ id, lyrics, notes }) => {
      const normalized = normalizeSongwritingDraftInput({
        title: selectedSession?.title ?? "Session",
        genre: selectedSession?.genre ?? "hip-hop",
        mood: selectedSession?.mood ?? "",
        bpm: selectedSession?.bpm ?? 90,
        key: selectedSession?.key ?? "C",
        lyrics,
        notes,
      });
      const response = await apiRequest(
        "PUT",
        `/api/songwriting/${encodeURIComponent(id)}`,
        { lyrics: normalized.lyrics, notes: normalized.notes },
      );
      return normalizeSongwritingSessionResponse(await readProjectsJson(response));
    },
    onSuccess: async (session) => {
      setSelectedSession(session);
      await queryClient.invalidateQueries({ queryKey: ["/api/songwriting"] });
      toast({ title: "Saved", description: "Session updated." });
    },
    onError: (error) =>
      toast({
        title: "Save Failed",
        description: errorMessage(error, "Could not save the session."),
        variant: "destructive",
      }),
  });

  const deleteMutation = useMutation<{ success: true }, Error, string>({
    mutationFn: async (id) => {
      const response = await apiRequest(
        "DELETE",
        `/api/songwriting/${encodeURIComponent(id)}`,
      );
      return normalizeMutationSuccess(await readProjectsJson(response));
    },
    onSuccess: async () => {
      setSelectedSession(null);
      await queryClient.invalidateQueries({ queryKey: ["/api/songwriting"] });
      toast({ title: "Deleted", description: "Session removed." });
    },
    onError: (error) =>
      toast({
        title: "Delete Failed",
        description: errorMessage(error, "Could not delete the session."),
        variant: "destructive",
      }),
  });

  const assistMutation = useMutation({
    mutationFn: async (prompt: string) => {
      if (!selectedSession) throw new Error("Select a songwriting session first.");
      const normalizedPrompt = prompt.trim();
      if (normalizedPrompt.length < 2 || normalizedPrompt.length > 1000) {
        throw new Error("Enter between 2 and 1,000 characters for AI assistance.");
      }
      const response = await apiRequest("POST", "/api/songwriting/ai-assist", {
        prompt: normalizedPrompt,
        genre: (selectedSession.genre ?? "hip-hop").slice(0, 100),
        mood: (selectedSession.mood ?? "").slice(0, 100),
        existing: (selectedSession.lyrics ?? "").slice(0, 5000),
      });
      return normalizeSongwritingAssist(await readProjectsJson(response));
    },
    onError: (error) =>
      toast({
        title: "AI Assist Unavailable",
        description: errorMessage(error, "Could not generate songwriting suggestions."),
        variant: "destructive",
      }),
  });

  const SONG_STRUCTURES = [
    "Verse – Chorus – Verse – Chorus – Bridge – Chorus",
    "Intro – Verse – Pre-Chorus – Chorus – Verse – Chorus – Outro",
    "Intro – Hook – Verse – Hook – Bridge – Hook",
    "Verse – Verse – Chorus – Verse – Chorus – Outro",
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Sessions</h2>
          <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" />New</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Songwriting Session</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="song-title">Title</Label>
                  <Input id="song-title" maxLength={255} value={newSession.title} onChange={(event) => setNewSession((prev) => ({ ...prev, title: event.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Genre</Label>
                    <Select value={newSession.genre} onValueChange={(genre) => setNewSession((prev) => ({ ...prev, genre }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["hip-hop", "pop", "rnb", "rock", "country", "electronic"].map((genre) => <SelectItem key={genre} value={genre}>{genre}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="song-key">Key</Label>
                    <Input id="song-key" maxLength={32} value={newSession.key} onChange={(event) => setNewSession((prev) => ({ ...prev, key: event.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="song-bpm">BPM</Label>
                  <Input id="song-bpm" type="number" min={20} max={999} step={1} value={newSession.bpm} onChange={(event) => setNewSession((prev) => ({ ...prev, bpm: Number(event.target.value) }))} />
                </div>
                <div>
                  <Label htmlFor="song-mood">Mood</Label>
                  <Input id="song-mood" maxLength={100} value={newSession.mood} onChange={(event) => setNewSession((prev) => ({ ...prev, mood: event.target.value }))} />
                </div>
                <Button className="w-full" onClick={() => createMutation.mutate(newSession)} disabled={!newSession.title.trim() || createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Create Session
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isError && (
          <div role="alert" className="rounded-md border border-destructive p-3">
            <p className="text-sm">Songwriting sessions could not be loaded.</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => void refetch()}>Retry</Button>
          </div>
        )}
        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
        ) : sessions.length === 0 ? (
          <Card className="p-8 text-center"><Mic2 className="w-12 h-12 mx-auto mb-3 text-muted-foreground" /><p>No sessions yet.</p></Card>
        ) : (
          sessions.map((session) => (
            <Card key={session.id} className={`cursor-pointer ${selectedSession?.id === session.id ? "border-blue-500" : ""}`} onClick={() => setSelectedSession(session)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div><p className="font-semibold text-sm">{session.title}</p><p className="text-xs text-muted-foreground">{session.genre ?? "genre unset"} • {session.key ?? "key unset"} • {session.bpm ?? "—"} BPM</p></div>
                  <Badge variant="outline">{session.status?.replace("_", " ") ?? "draft"}</Badge>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </section>

      <section className="lg:col-span-2 space-y-4">
        {!selectedSession ? (
          <Card className="p-12 text-center"><Mic2 className="w-16 h-16 mx-auto mb-4 text-muted-foreground" /><h3 className="font-medium">Select a session</h3></Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>{selectedSession.title}</CardTitle>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updateMutation.isPending}
                      onClick={() => updateMutation.mutate({ id: selectedSession.id, lyrics: selectedSession.lyrics ?? "", notes: selectedSession.notes ?? "" })}
                    >
                      {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (window.confirm(`Delete songwriting session “${selectedSession.title}”?`)) {
                          deleteMutation.mutate(selectedSession.id);
                        }
                      }}
                    >Delete</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="song-lyrics"><PenLine className="w-3 h-3 inline mr-1" />Lyrics</Label>
                  <Textarea id="song-lyrics" maxLength={20000} className="min-h-[200px] font-mono" value={selectedSession.lyrics ?? ""} onChange={(event) => setSelectedSession((prev) => prev ? { ...prev, lyrics: event.target.value } : prev)} />
                </div>
                <div>
                  <Label htmlFor="song-notes">Notes</Label>
                  <Textarea id="song-notes" maxLength={10000} className="min-h-[80px]" value={selectedSession.notes ?? ""} onChange={(event) => setSelectedSession((prev) => prev ? { ...prev, notes: event.target.value } : prev)} />
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-sm"><Lightbulb className="w-4 h-4 inline mr-1" />Rhyme & AI Ideas</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex gap-2 mb-3">
                    <Input maxLength={1000} placeholder="Enter a word or idea…" value={rhymeWord} onChange={(event) => setRhymeWord(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") assistMutation.mutate(rhymeWord); }} />
                    <Button size="sm" disabled={assistMutation.isPending || rhymeWord.trim().length < 2} onClick={() => assistMutation.mutate(rhymeWord)}>
                      {assistMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Find"}
                    </Button>
                  </div>
                  {assistMutation.data?.rhymes.length ? (
                    <div className="flex flex-wrap gap-2">
                      {assistMutation.data.rhymes.map((rhyme) => (
                        <Badge key={rhyme} variant="secondary" className="cursor-pointer" onClick={() => setSelectedSession((prev) => prev ? { ...prev, lyrics: `${prev.lyrics ?? ""}${prev.lyrics ? " " : ""}${rhyme}` } : prev)}>{rhyme}</Badge>
                      ))}
                    </div>
                  ) : null}
                  {assistMutation.data?.chordProgression && <p className="text-xs text-muted-foreground mt-3"><strong>Suggested chords:</strong> {assistMutation.data.chordProgression}</p>}
                  {assistMutation.data?.suggestions.length ? (
                    <ul className="mt-3 space-y-1 text-xs text-muted-foreground">{assistMutation.data.suggestions.map((suggestion) => <li key={suggestion}>• {suggestion}</li>)}</ul>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-sm"><Target className="w-4 h-4 inline mr-1" />Song Structure Templates</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {SONG_STRUCTURES.map((structure) => (
                    <button
                      key={structure}
                      type="button"
                      className="w-full text-left flex items-start gap-2 p-2 bg-muted rounded text-xs hover:bg-accent"
                      onClick={() => setSelectedSession((prev) => prev ? { ...prev, lyrics: `${structure}\n\n${prev.lyrics ?? ""}` } : prev)}
                    >
                      <ChevronRight className="w-3 h-3 mt-0.5 shrink-0" />{structure}
                    </button>
                  ))}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
