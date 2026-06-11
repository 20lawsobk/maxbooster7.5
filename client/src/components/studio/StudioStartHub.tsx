import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Plus,
  Music,
  Star,
  Clock,
  Layout,
  Mic,
  AudioWaveform,
  Disc3,
  Layers,
  Sparkles,
  ChevronRight,
  Search,
  Grid3X3,
  List,
  MoreVertical,
  Trash2,
  Copy,
  Edit3,
  Play,
  Settings,
  HelpCircle,
  BookOpen,
  Sliders,
  Radio,
  FileAudio,
  Headphones,
  Crown,
  Zap,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Project {
  id: string;
  title: string;
  description?: string;
  genre?: string;
  bpm?: number;
  favorite?: boolean;
  lastOpenedAt?: string;
  updatedAt?: string;
  createdAt?: string;
  coverImageUrl?: string;
  tags?: string[];
  workflowStage?: string;
  trackCount?: number;
  clipCount?: number;
  duration?: number;
}

interface Template {
  id: string;
  name: string;
  description?: string;
  category?: string;
  genre?: string;
  bpm?: number;
  trackCount?: number;
  coverImageUrl?: string;
  isBuiltIn?: boolean;
  usageCount?: number;
}

interface StartHubData {
  recentProjects: Project[];
  favoriteProjects: Project[];
  songs: { count: number; items: Project[] };
  masteringProjects: { count: number; items: Project[] };
  shows: { count: number; items: Project[] };
  stats: {
    totalProjects: number;
    totalSongs: number;
    totalMasteringProjects: number;
    totalShows: number;
    totalClips: number;
  };
  templates: Template[];
  templatesByCategory: {
    recording: Template[];
    production: Template[];
    mastering: Template[];
    user: Template[];
  };
  user: {
    id: string;
    name: string;
    email?: string;
    avatar?: string;
    subscriptionTier?: string;
    createdAt?: string;
  };
  demoSongs: Array<{
    id: string;
    title: string;
    genre: string;
    bpm: number;
    coverImageUrl: string | null;
  }>;
  tips: Array<{ id: string; title: string; description: string; icon: string }>;
}

interface StudioStartHubProps {
  onProjectSelect: (projectId: string) => void;
  onCreateProject: (
    title: string,
    templateId?: string,
    workflowStage?: string,
  ) => void;
}

const PROJECT_TYPES = [
  {
    id: "song",
    label: "Song",
    icon: Music,
    color: "from-blue-500 to-cyan-500",
    description: "Multi-track recording & arrangement",
  },
  {
    id: "project",
    label: "Project",
    icon: Disc3,
    color: "from-purple-500 to-pink-500",
    description: "Album mastering & production",
  },
  {
    id: "show",
    label: "Show",
    icon: Radio,
    color: "from-green-500 to-emerald-500",
    description: "Live performance setlist",
  },
];

const TEMPLATE_CATEGORIES = [
  { id: "all", label: "All Templates", icon: Layout },
  { id: "recording", label: "Recording", icon: Mic },
  { id: "production", label: "Production", icon: AudioWaveform },
  { id: "mastering", label: "Mastering", icon: Disc3 },
  { id: "user", label: "My Templates", icon: Layers },
];

const GENRE_COLORS: Record<string, string> = {
  "Hip Hop": "bg-orange-500/20 text-orange-400 border-orange-500/30",
  Electronic: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  Pop: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  Rock: "bg-red-500/20 text-red-400 border-red-500/30",
  "R&B": "bg-purple-500/20 text-purple-400 border-purple-500/30",
  Jazz: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  Classical: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  Acoustic: "bg-green-500/20 text-green-400 border-green-500/30",
};

const TIP_ICONS: Record<string, typeof BookOpen> = {
  book: BookOpen,
  mic: Mic,
  sliders: Sliders,
  sparkles: Sparkles,
};

export function StudioStartHub({
  onProjectSelect,
  onCreateProject,
}: StudioStartHubProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectType, setNewProjectType] = useState<
    "song" | "project" | "show"
  >("song");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [activeSection, setActiveSection] = useState<
    "recent" | "songs" | "projects" | "shows"
  >("recent");

  const { data: hubData, isLoading } = useQuery<StartHubData>({
    queryKey: ["/api/studio/start-hub/summary"],
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: async ({
      projectId,
      favorite,
    }: {
      projectId: string;
      favorite: boolean;
    }) => {
      const response = await apiRequest(
        "PATCH",
        `/api/studio/projects/${projectId}/favorite`,
        { favorite },
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/studio/start-hub/summary"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/studio/projects"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update favorite status",
        variant: "destructive",
      });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const response = await apiRequest(
        "DELETE",
        `/api/studio/projects/${projectId}`,
      );
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Project deleted",
        description: "Project has been removed",
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/studio/start-hub/summary"],
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete project",
        variant: "destructive",
      });
    },
  });

  const createFromTemplateMutation = useMutation({
    mutationFn: async ({
      templateId,
      title,
    }: {
      templateId: string;
      title: string;
    }) => {
      const response = await apiRequest(
        "POST",
        `/api/studio/templates/${templateId}/create-project`,
        { title },
      );
      return response.json();
    },
    onSuccess: (project) => {
      toast({
        title: "Project created",
        description: `Created "${project.title}" from template`,
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/studio/start-hub/summary"],
      });
      onProjectSelect(project.id);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create project from template",
        variant: "destructive",
      });
    },
  });

  const handleCreateProject = () => {
    if (newProjectTitle.trim()) {
      const workflowStage =
        newProjectType === "project"
          ? "mastering"
          : newProjectType === "show"
            ? "show"
            : "writing";
      onCreateProject(newProjectTitle.trim(), undefined, workflowStage);
      setNewProjectTitle("");
      setShowNewProjectDialog(false);
    }
  };

  const handleProjectOpen = (projectId: string) => {
    apiRequest("PATCH", `/api/studio/projects/${projectId}/opened`, {});
    onProjectSelect(projectId);
  };

  const filteredTemplates = useMemo(() => {
    if (!hubData?.templates) return [];
    let templates = hubData.templates;
    if (selectedCategory !== "all") {
      templates = templates.filter(
        (t) =>
          t.category === selectedCategory ||
          (selectedCategory === "user" && t.userId),
      );
    }
    if (searchQuery) {
      templates = templates.filter(
        (t) =>
          t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.genre?.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }
    return templates;
  }, [hubData?.templates, selectedCategory, searchQuery]);

  const displayProjects = useMemo(() => {
    if (!hubData) return [];
    let projects: Project[];
    switch (activeSection) {
      case "songs":
        projects = hubData.songs.items;
        break;
      case "projects":
        projects = hubData.masteringProjects.items;
        break;
      case "shows":
        projects = hubData.shows.items;
        break;
      default:
        projects = hubData.recentProjects;
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      projects = projects.filter(
        (p) =>
          p.title.toLowerCase().includes(query) ||
          p.genre?.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query) ||
          p.tags?.some((tag) => tag.toLowerCase().includes(query)),
      );
    }

    return projects;
  }, [hubData, activeSection, searchQuery]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] p-6">
        <div className="max-w-[1600px] mx-auto">
          <div className="flex gap-6">
            <div className="w-64 space-y-4">
              <Skeleton className="h-20 bg-gray-800" />
              <Skeleton className="h-40 bg-gray-800" />
              <Skeleton className="h-60 bg-gray-800" />
            </div>
            <div className="flex-1 space-y-6">
              <Skeleton className="h-12 bg-gray-800" />
              <div className="grid grid-cols-4 gap-4">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <Skeleton key={i} className="h-48 bg-gray-800" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-white">
      <div className="max-w-[1600px] mx-auto flex">
        {/* Left Sidebar - Profile & Navigation */}
        <aside className="w-64 min-h-screen bg-[#141414] border-r border-gray-800 flex flex-col">
          {/* User Profile Section */}
          <div className="p-4 border-b border-gray-800">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-lg font-bold">
                {hubData?.user.name?.[0]?.toUpperCase() || "A"}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-white truncate">
                  {hubData?.user.name || "Artist"}
                </h3>
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <Crown className="h-3 w-3 text-amber-400" />
                  <span className="capitalize">
                    {hubData?.user.subscriptionTier || "Free"}
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-gray-400 hover:text-white"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-gray-800/50 rounded-lg p-2">
                <div className="text-lg font-bold text-white">
                  {hubData?.stats.totalSongs || 0}
                </div>
                <div className="text-[10px] text-gray-400">Songs</div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-2">
                <div className="text-lg font-bold text-white">
                  {hubData?.stats.totalMasteringProjects || 0}
                </div>
                <div className="text-[10px] text-gray-400">Projects</div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-2">
                <div className="text-lg font-bold text-white">
                  {hubData?.stats.totalShows || 0}
                </div>
                <div className="text-[10px] text-gray-400">Shows</div>
              </div>
            </div>
          </div>

          {/* Create New Section */}
          <div className="p-4 border-b border-gray-800">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Create New
            </h4>
            <div className="space-y-1">
              {PROJECT_TYPES.map((type) => (
                <button
                  key={type.id}
                  onClick={() => {
                    setNewProjectType(type.id as "song" | "project" | "show");
                    setShowNewProjectDialog(true);
                  }}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-800 transition-colors group"
                >
                  <div
                    className={cn(
                      "h-9 w-9 rounded-lg bg-gradient-to-br flex items-center justify-center",
                      type.color,
                    )}
                  >
                    <type.icon className="h-4 w-4 text-white" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-white">
                      {type.label}
                    </div>
                    <div className="text-[10px] text-gray-500">
                      {type.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Navigation */}
          <div className="p-4 flex-1">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Documents
            </h4>
            <nav className="space-y-1">
              {[
                {
                  id: "recent",
                  label: "Recent",
                  icon: Clock,
                  count: hubData?.recentProjects.length,
                },
                {
                  id: "songs",
                  label: "Songs",
                  icon: Music,
                  count: hubData?.stats.totalSongs,
                },
                {
                  id: "projects",
                  label: "Projects",
                  icon: Disc3,
                  count: hubData?.stats.totalMasteringProjects,
                },
                {
                  id: "shows",
                  label: "Shows",
                  icon: Radio,
                  count: hubData?.stats.totalShows,
                },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() =>
                    setActiveSection(item.id as Record<string, unknown>)
                  }
                  className={cn(
                    "w-full flex items-center justify-between p-2.5 rounded-lg transition-colors",
                    activeSection === item.id
                      ? "bg-blue-500/20 text-blue-400"
                      : "text-gray-400 hover:bg-gray-800 hover:text-white",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <item.icon className="h-4 w-4" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </div>
                  <Badge
                    variant="secondary"
                    className="text-xs bg-gray-700/50 text-gray-300"
                  >
                    {item.count || 0}
                  </Badge>
                </button>
              ))}
            </nav>

            <Separator className="my-4 bg-gray-800" />

            {/* Favorites */}
            {(hubData?.favoriteProjects?.length || 0) > 0 && (
              <>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
                  Pinned
                </h4>
                <div className="space-y-1">
                  {hubData?.favoriteProjects.slice(0, 5).map((project) => (
                    <button
                      key={project.id}
                      onClick={() => handleProjectOpen(project.id)}
                      className="w-full flex items-center gap-2 p-2 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-colors group"
                    >
                      <FileAudio className="h-4 w-4 text-gray-500" />
                      <span className="text-sm truncate flex-1 text-left">
                        {project.title}
                      </span>
                      <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Help & Learning */}
          <div className="p-4 border-t border-gray-800">
            <button className="w-full flex items-center gap-3 p-2.5 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-colors">
              <HelpCircle className="h-4 w-4" />
              <span className="text-sm">Help & Tutorials</span>
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 overflow-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">
                {activeSection === "recent"
                  ? "Recent Documents"
                  : activeSection === "songs"
                    ? "Songs"
                    : activeSection === "projects"
                      ? "Mastering Projects"
                      : "Shows"}
              </h1>
              <p className="text-gray-400 text-sm mt-1">
                {activeSection === "recent"
                  ? "Pick up where you left off"
                  : `${displayProjects.length} ${activeSection}`}
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                  placeholder="Search documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-64 pl-9 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
                />
              </div>

              {/* View Toggle */}
              <div className="flex items-center bg-gray-800 rounded-lg p-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-8 w-8",
                    viewMode === "grid" ? "bg-gray-700" : "",
                  )}
                  onClick={() => setViewMode("grid")}
                >
                  <Grid3X3 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-8 w-8",
                    viewMode === "list" ? "bg-gray-700" : "",
                  )}
                  onClick={() => setViewMode("list")}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Projects Grid/List */}
          {displayProjects.length > 0 ? (
            viewMode === "grid" ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mb-8">
                {displayProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onOpen={() => handleProjectOpen(project.id)}
                    onToggleFavorite={() =>
                      toggleFavoriteMutation.mutate({
                        projectId: project.id,
                        favorite: !project.favorite,
                      })
                    }
                    onDelete={() => deleteProjectMutation.mutate(project.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-2 mb-8">
                {displayProjects.map((project) => (
                  <ProjectListItem
                    key={project.id}
                    project={project}
                    onOpen={() => handleProjectOpen(project.id)}
                    onToggleFavorite={() =>
                      toggleFavoriteMutation.mutate({
                        projectId: project.id,
                        favorite: !project.favorite,
                      })
                    }
                    onDelete={() => deleteProjectMutation.mutate(project.id)}
                  />
                ))}
              </div>
            )
          ) : (
            <EmptyState
              section={activeSection}
              onCreateNew={() => setShowNewProjectDialog(true)}
            />
          )}

          {/* Templates Section */}
          <section className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Layout className="h-5 w-5 text-purple-400" />
                Templates
              </h2>
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-400 hover:text-white"
              >
                View All
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>

            <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
              <TabsList className="bg-gray-800/50 p-1 mb-4">
                {TEMPLATE_CATEGORIES.map((cat) => (
                  <TabsTrigger
                    key={cat.id}
                    value={cat.id}
                    className="text-xs data-[state=active]:bg-gray-700"
                  >
                    <cat.icon className="h-3 w-3 mr-1.5" />
                    {cat.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                {filteredTemplates.slice(0, 12).map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onSelect={() =>
                      createFromTemplateMutation.mutate({
                        templateId: template.id,
                        title: `New ${template.name}`,
                      })
                    }
                  />
                ))}
              </div>
            </Tabs>
          </section>

          {/* Learning & Tips Section */}
          <section className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Demo Songs */}
            <Card className="bg-gray-800/30 border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2 text-white">
                  <Headphones className="h-4 w-4 text-blue-400" />
                  Demo Songs
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {hubData?.demoSongs.map((demo) => (
                  <div
                    key={demo.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-700/50 cursor-pointer group"
                  >
                    <div className="h-10 w-10 rounded bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
                      <Music className="h-5 w-5 text-blue-400" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-white">
                        {demo.title}
                      </div>
                      <div className="text-xs text-gray-400">
                        {demo.genre} • {demo.bpm} BPM
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100"
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Tips */}
            <Card className="bg-gray-800/30 border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2 text-white">
                  <Zap className="h-4 w-4 text-amber-400" />
                  Getting Started
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {hubData?.tips.map((tip) => {
                  const Icon = TIP_ICONS[tip.icon] || BookOpen;
                  return (
                    <div
                      key={tip.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-700/50 cursor-pointer group"
                    >
                      <div className="h-10 w-10 rounded bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
                        <Icon className="h-5 w-5 text-amber-400" />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-white">
                          {tip.title}
                        </div>
                        <div className="text-xs text-gray-400">
                          {tip.description}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-500 opacity-0 group-hover:opacity-100" />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </section>
        </main>
      </div>

      {/* New Project Dialog */}
      <Dialog
        open={showNewProjectDialog}
        onOpenChange={setShowNewProjectDialog}
      >
        <DialogContent className="bg-[#1a1a1a] border-gray-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">
              Create New{" "}
              {PROJECT_TYPES.find((t) => t.id === newProjectType)?.label}
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              {PROJECT_TYPES.find((t) => t.id === newProjectType)?.description}
            </DialogDescription>
          </DialogHeader>

          {/* Type Selection */}
          <div className="grid grid-cols-3 gap-2 py-4">
            {PROJECT_TYPES.map((type) => (
              <button
                key={type.id}
                onClick={() =>
                  setNewProjectType(type.id as Record<string, unknown>)
                }
                className={cn(
                  "p-3 rounded-lg border-2 transition-all",
                  newProjectType === type.id
                    ? "border-blue-500 bg-blue-500/10"
                    : "border-gray-700 hover:border-gray-600",
                )}
              >
                <div
                  className={cn(
                    "h-10 w-10 mx-auto rounded-lg bg-gradient-to-br flex items-center justify-center mb-2",
                    type.color,
                  )}
                >
                  <type.icon className="h-5 w-5 text-white" />
                </div>
                <div className="text-sm font-medium text-white">
                  {type.label}
                </div>
              </button>
            ))}
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="projectTitle" className="text-gray-300">
                Name
              </Label>
              <Input
                id="projectTitle"
                value={newProjectTitle}
                onChange={(e) => setNewProjectTitle(e.target.value)}
                placeholder={`My New ${PROJECT_TYPES.find((t) => t.id === newProjectType)?.label}`}
                className="bg-gray-800 border-gray-700 text-white"
                onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
                autoFocus
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowNewProjectDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateProject}
              disabled={!newProjectTitle.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Create {PROJECT_TYPES.find((t) => t.id === newProjectType)?.label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProjectCard({
  project,
  onOpen,
  onToggleFavorite,
  onDelete,
}: {
  project: Project;
  onOpen: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
}) {
  const genreClass = project.genre
    ? GENRE_COLORS[project.genre] || "bg-gray-500/20 text-gray-400"
    : "";

  return (
    <div
      className="group relative bg-gray-800/50 rounded-xl border border-gray-700/50 hover:border-gray-600 transition-all cursor-pointer overflow-hidden"
      onClick={onOpen}
    >
      {/* Cover Image / Placeholder */}
      <div className="aspect-square bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center relative">
        {project.coverImageUrl ? (
          <img
            src={project.coverImageUrl}
            alt={project.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <Music className="h-12 w-12 text-gray-600" />
        )}

        {/* Hover Overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Button
            size="icon"
            className="h-12 w-12 rounded-full bg-blue-600 hover:bg-blue-700"
          >
            <Play className="h-6 w-6 ml-0.5" />
          </Button>
        </div>

        {/* Favorite Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
        >
          <Star
            className={cn(
              "h-4 w-4",
              project.favorite
                ? "text-yellow-400 fill-yellow-400"
                : "text-white",
            )}
          />
        </button>
      </div>

      {/* Info */}
      <div className="p-3">
        <h4 className="font-medium text-white truncate">{project.title}</h4>
        <div className="flex items-center gap-2 mt-1.5">
          {project.genre && (
            <Badge
              variant="outline"
              className={cn("text-[10px] py-0 h-5", genreClass)}
            >
              {project.genre}
            </Badge>
          )}
          {project.bpm && (
            <span className="text-[10px] text-gray-500">{project.bpm} BPM</span>
          )}
        </div>
        <div className="flex items-center justify-between mt-2 text-[10px] text-gray-500">
          <span>{project.trackCount || 0} tracks</span>
          {project.lastOpenedAt && (
            <span>
              {formatDistanceToNow(new Date(project.lastOpenedAt), {
                addSuffix: true,
              })}
            </span>
          )}
        </div>
      </div>

      {/* Context Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            onClick={(e) => e.stopPropagation()}
            className="absolute top-2 left-2 h-8 w-8 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
          >
            <MoreVertical className="h-4 w-4 text-white" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="bg-gray-800 border-gray-700">
          <DropdownMenuItem onClick={onOpen} className="text-gray-300">
            <Play className="h-4 w-4 mr-2" /> Open
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            className="text-gray-300"
          >
            <Star className="h-4 w-4 mr-2" />{" "}
            {project.favorite ? "Unpin" : "Pin"}
          </DropdownMenuItem>
          <DropdownMenuItem className="text-gray-300">
            <Copy className="h-4 w-4 mr-2" /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem className="text-gray-300">
            <Edit3 className="h-4 w-4 mr-2" /> Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-gray-700" />
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-red-400"
          >
            <Trash2 className="h-4 w-4 mr-2" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ProjectListItem({
  project,
  onOpen,
  onToggleFavorite,
  onDelete,
}: {
  project: Project;
  onOpen: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
}) {
  const genreClass = project.genre
    ? GENRE_COLORS[project.genre] || "bg-gray-500/20 text-gray-400"
    : "";

  return (
    <div
      className="group flex items-center gap-4 p-3 rounded-lg bg-gray-800/30 hover:bg-gray-800/50 border border-transparent hover:border-gray-700 transition-all cursor-pointer"
      onClick={onOpen}
    >
      {/* Thumbnail */}
      <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center overflow-hidden flex-shrink-0">
        {project.coverImageUrl ? (
          <img
            src={project.coverImageUrl}
            alt={project.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <Music className="h-6 w-6 text-gray-500" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-white truncate">{project.title}</h4>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          {project.genre && (
            <Badge
              variant="outline"
              className={cn("text-[10px] py-0 h-4", genreClass)}
            >
              {project.genre}
            </Badge>
          )}
          <span>{project.trackCount || 0} tracks</span>
          {project.bpm && <span>{project.bpm} BPM</span>}
        </div>
      </div>

      {/* Last Opened */}
      <div className="text-xs text-gray-500 flex-shrink-0">
        {project.lastOpenedAt &&
          formatDistanceToNow(new Date(project.lastOpenedAt), {
            addSuffix: true,
          })}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
        >
          <Star
            className={cn(
              "h-4 w-4",
              project.favorite
                ? "text-yellow-400 fill-yellow-400"
                : "text-gray-400",
            )}
          />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-4 w-4 text-gray-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-gray-800 border-gray-700">
            <DropdownMenuItem className="text-gray-300">
              <Copy className="h-4 w-4 mr-2" /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem className="text-gray-300">
              <Edit3 className="h-4 w-4 mr-2" /> Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-gray-700" />
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="text-red-400"
            >
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function TemplateCard({
  template,
  onSelect,
}: {
  template: Template;
  onSelect: () => void;
}) {
  return (
    <div
      className="group p-3 rounded-lg bg-gray-800/30 hover:bg-gray-800/50 border border-transparent hover:border-gray-700 transition-all cursor-pointer"
      onClick={onSelect}
    >
      <div className="h-16 w-full rounded-lg bg-gradient-to-br from-purple-600/20 to-blue-600/20 flex items-center justify-center mb-2">
        <Layout className="h-6 w-6 text-purple-400" />
      </div>
      <h4 className="font-medium text-white text-sm truncate">
        {template.name}
      </h4>
      <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-1">
        {template.trackCount && template.trackCount > 0 && (
          <span>{template.trackCount} tracks</span>
        )}
        {template.isBuiltIn && (
          <Badge
            variant="secondary"
            className="text-[10px] py-0 h-4 bg-purple-500/20 text-purple-400"
          >
            Built-in
          </Badge>
        )}
      </div>
    </div>
  );
}

function EmptyState({
  section,
  onCreateNew,
}: {
  section: string;
  onCreateNew: () => void;
}) {
  const config = {
    recent: {
      icon: Clock,
      title: "No recent documents",
      description: "Your recently opened documents will appear here",
    },
    songs: {
      icon: Music,
      title: "No songs yet",
      description: "Create your first song to get started",
    },
    projects: {
      icon: Disc3,
      title: "No mastering projects",
      description: "Create a project for album mastering",
    },
    shows: {
      icon: Radio,
      title: "No shows yet",
      description: "Create a show for live performance",
    },
  }[section] || {
    icon: Music,
    title: "No documents",
    description: "Create your first document",
  };

  const Icon = config.icon;

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-16 w-16 rounded-2xl bg-gray-800 flex items-center justify-center mb-4">
        <Icon className="h-8 w-8 text-gray-600" />
      </div>
      <h3 className="text-lg font-medium text-white mb-1">{config.title}</h3>
      <p className="text-gray-400 text-sm mb-4">{config.description}</p>
      <Button onClick={onCreateNew} className="bg-blue-600 hover:bg-blue-700">
        <Plus className="h-4 w-4 mr-2" />
        Create New
      </Button>
    </div>
  );
}
