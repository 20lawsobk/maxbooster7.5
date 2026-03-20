import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRequireSubscription } from '@/hooks/useRequireAuth';
import { useLocation } from 'wouter';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonProjectCard } from '@/components/ui/skeleton-loader';
import { useToast } from '@/hooks/use-toast';
import { useAnalyticsInvalidation } from '@/hooks/useAnalyticsInvalidation';
import { apiRequest, uploadWithProgress } from '@/lib/queryClient';
import {
  Music,
  Upload,
  Play,
  Pause,
  Loader2,
  MoreVertical,
  Edit,
  Trash2,
  TrendingUp,
  Calendar,
  Clock,
  FileAudio,
  Sparkles,
  Mic2,
  PenLine,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  ChevronRight,
  Target,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Project {
  id: string;
  userId: string;
  title: string;
  description?: string | null;
  genre?: string | null;
  bpm?: number | null;
  key?: string | null;
  status?: string | null;
  workflowStage?: string | null;
  isStudioProject?: boolean | null;
  metadata?: Record<string, unknown> | null;
  favorite?: boolean | null;
  lastOpenedAt?: string | null;
  coverImageUrl?: string | null;
  tags?: string[] | null;
  timeSignature?: string | null;
  sampleRate?: number | null;
  bitDepth?: number | null;
  createdAt: string;
  updatedAt?: string | null;
  audioUrl?: string | null;
  duration?: number | null;
  fileSize?: number | null;
  streams?: number | null;
  progress?: number | null;
}

interface ProjectsApiResponse {
  data: Project[];
}

interface ApiError {
  message?: string;
}

export default function Projects() {
  const { user, isLoading: authLoading } = useRequireSubscription();
  const [location, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState('projects');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    title: '',
    description: '',
    genre: '',
    file: null as File | null,
  });
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioProjectRef = useRef<string | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    genre: '',
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { invalidateOnProjectChange } = useAnalyticsInvalidation();

  const { data: projectsData, isLoading: projectsLoading} = useQuery<ProjectsApiResponse>({
    queryKey: ['/api/projects'],
    enabled: !!user,
  });

  const projects: Project[] = projectsData?.data || [];

  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      return uploadWithProgress('/api/projects', formData, {
        onProgress: (percent) => setUploadProgress(percent),
        timeout: 300000, // 5 minutes
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/studio/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/studio/start-hub/summary'] });
      invalidateOnProjectChange();
      toast({
        title: 'Success!',
        description: 'Your project has been uploaded successfully.',
      });
      setIsUploadOpen(false);
      setUploadForm({ title: '', description: '', genre: '', file: null });
      setUploadProgress(0);
    },
    onError: (error: Error) => {
      const apiError = error as ApiError;
      toast({
        title: 'Upload Failed',
        description: apiError.message || 'Failed to upload project. Please try again.',
        variant: 'destructive',
      });
      setUploadProgress(0);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const response = await apiRequest('DELETE', `/api/studio/projects/${projectId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/studio/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/studio/start-hub/summary'] });
      invalidateOnProjectChange();
      toast({
        title: 'Project Deleted',
        description: 'The project has been removed successfully.',
      });
    },
    onError: (error: Error) => {
      const apiError = error as ApiError;
      toast({
        title: 'Delete Failed',
        description: apiError.message || 'Failed to delete project. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest('PATCH', `/api/studio/projects/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/studio/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/studio/start-hub/summary'] });
      invalidateOnProjectChange();
      toast({
        title: 'Project Updated',
        description: 'Your project has been updated successfully.',
      });
      setIsEditOpen(false);
      setEditingProject(null);
    },
    onError: (error: Error) => {
      const apiError = error as ApiError;
      toast({
        title: 'Update Failed',
        description: apiError.message || 'Failed to update project.',
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
    };
  }, []);

  const handlePlayProject = (project: Project) => {
    if (currentlyPlaying === project.id && audioRef.current) {
      audioRef.current.pause();
      setCurrentlyPlaying(null);
      setAudioLoading(null);
      audioProjectRef.current = null;
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    if (project.audioUrl) {
      let audioSrc = project.audioUrl;
      if (!audioSrc.startsWith('http') && !audioSrc.startsWith('/api/')) {
        audioSrc = `/api/marketplace/audio/${audioSrc.replace(/^\//, '')}`;
      }

      audioProjectRef.current = project.id;
      setAudioLoading(project.id);
      setCurrentlyPlaying(project.id);

      const startPlayback = (audio: HTMLAudioElement) => {
        audio.oncanplay = () => {
          if (audioProjectRef.current === project.id) {
            setAudioLoading(null);
          }
          audio.oncanplay = null;
        };

        audio.onended = () => {
          if (audioProjectRef.current === project.id) {
            setCurrentlyPlaying(null);
            setAudioLoading(null);
            audioProjectRef.current = null;
          }
        };

        audio.onerror = () => {
          if (audioProjectRef.current === project.id) {
            setCurrentlyPlaying(null);
            setAudioLoading(null);
            audioProjectRef.current = null;
            toast({
              title: 'Playback Error',
              description: 'Could not load audio file.',
              variant: 'destructive',
            });
          }
        };

        audio.play().catch(() => {
          if (audioProjectRef.current === project.id) {
            setCurrentlyPlaying(null);
            setAudioLoading(null);
            audioProjectRef.current = null;
          }
        });
      };

      if (audioRef.current && audioRef.current.src.endsWith(audioSrc)) {
        setAudioLoading(null);
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {
          setCurrentlyPlaying(null);
          audioProjectRef.current = null;
        });
      } else {
        const audio = audioRef.current || new Audio();
        audio.preload = 'auto';
        audio.src = audioSrc;
        audioRef.current = audio;
        startPlayback(audio);
      }
    } else {
      toast({
        title: 'No Audio File',
        description: "This project doesn't have an audio file attached.",
        variant: 'destructive',
      });
    }
  };

  const handleEdit = (project: Project) => {
    setEditingProject(project);
    setEditForm({
      title: project.title || '',
      description: project.description || '',
      genre: project.genre || '',
    });
    setIsEditOpen(true);
  };

  const handleUpdateProject = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editForm.title.trim()) {
      toast({
        title: 'Missing Information',
        description: 'Please provide a title.',
        variant: 'destructive',
      });
      return;
    }

    if (!editingProject) {
      toast({
        title: 'Error',
        description: 'No project selected for editing.',
        variant: 'destructive',
      });
      return;
    }

    editMutation.mutate({
      id: editingProject.id,
      data: {
        title: editForm.title,
        description: editForm.description,
        genre: editForm.genre,
      },
    });
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!uploadForm.file || !uploadForm.title.trim()) {
      toast({
        title: 'Missing Information',
        description: 'Please provide a title and select an audio file.',
        variant: 'destructive',
      });
      return;
    }

    const formData = new FormData();
    formData.append('title', uploadForm.title);
    formData.append('description', uploadForm.description);
    formData.append('genre', uploadForm.genre);
    formData.append('audio', uploadForm.file, uploadForm.file.name);

    uploadMutation.mutate(formData);
  };

  const getWorkflowStageLabel = (stage: string) => {
    const labels: Record<string, string> = {
      setup: 'SETUP',
      recording: 'RECORDING',
      editing: 'EDITING',
      mixing: 'MIXING',
      mastering: 'MASTERING',
      delivery: 'DELIVERY',
    };
    return labels[stage] || stage?.toUpperCase() || 'DRAFT';
  };

  const getStatusColor = (stage: string) => {
    switch (stage) {
      case 'delivery':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'mastering':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'mixing':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'editing':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'recording':
        return 'bg-cyan-100 text-cyan-800 border-cyan-200';
      case 'setup':
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getProgressValue = (stage: string, progress?: number) => {
    if (progress) return progress;
    const stageProgress: Record<string, number> = {
      setup: 10,
      recording: 25,
      editing: 45,
      mixing: 65,
      mastering: 85,
      delivery: 100,
    };
    return stageProgress[stage] || 10;
  };

  const formatFileSize = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

return (
    <AppLayout>
      <div className="p-6" role="main" aria-label="Projects management">
        {/* Header Actions */}
        <header className="flex justify-between items-center mb-6" role="banner">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Your Projects</h1>
            <p className="text-gray-500" role="status" aria-live="polite">
              {projects.length} project
              {projects.length !== 1 ? 's' : ''} total
            </p>
          </div>

          <div className="flex gap-2">
            <Dialog open={isUploadOpen} onOpenChange={(open) => {
              // Prevent closing while upload is in progress
              if (!open && uploadMutation.isPending) return;
              setIsUploadOpen(open);
            }}>
              <DialogTrigger asChild>
                <Button
                  className="gradient-bg"
                  data-testid="button-upload-project"
                  aria-label="Upload new project"
                >
                  <Upload className="h-4 w-4 mr-2" aria-hidden="true" />
                  Upload Project
                </Button>
              </DialogTrigger>
            <DialogContent 
              className="max-w-md"
              onInteractOutside={(e) => {
                if (uploadMutation.isPending) e.preventDefault();
              }}
              onEscapeKeyDown={(e) => {
                if (uploadMutation.isPending) e.preventDefault();
              }}
            >
              <DialogHeader>
                <DialogTitle>Upload New Project</DialogTitle>
              </DialogHeader>

              <form onSubmit={handleUpload} className="space-y-4">
                <div>
                  <Label htmlFor="title">Project Title</Label>
                  <Input
                    id="title"
                    value={uploadForm.title}
                    onChange={(e) => setUploadForm((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter project title"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="description">Description (Optional)</Label>
                  <Textarea
                    id="description"
                    value={uploadForm.description}
                    onChange={(e) =>
                      setUploadForm((prev) => ({ ...prev, description: e.target.value }))
                    }
                    placeholder="Describe your project"
                    rows={3}
                  />
                </div>

                <div>
                  <Label htmlFor="genre">Genre</Label>
                  <Select
                    value={uploadForm.genre}
                    onValueChange={(value) => setUploadForm((prev) => ({ ...prev, genre: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select genre" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pop">Pop</SelectItem>
                      <SelectItem value="rock">Rock</SelectItem>
                      <SelectItem value="hip-hop">Hip-Hop</SelectItem>
                      <SelectItem value="electronic">Electronic</SelectItem>
                      <SelectItem value="jazz">Jazz</SelectItem>
                      <SelectItem value="classical">Classical</SelectItem>
                      <SelectItem value="country">Country</SelectItem>
                      <SelectItem value="r&b">R&B</SelectItem>
                      <SelectItem value="indie">Indie</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="file">Audio File</Label>
                  <Input
                    id="file"
                    type="file"
                    accept=".mp3,.wav,.flac,.ogg,.aiff,.aif,.webm,.aac,.m4a,audio/mpeg,audio/wav,audio/flac,audio/ogg,audio/aiff,audio/webm,audio/aac,audio/mp4,audio/*"
                    capture={undefined}
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setUploadForm((prev) => ({ ...prev, file }));
                    }}
                    required
                    data-testid="input-file-upload"
                    aria-describedby="file-help"
                  />
                  <p id="file-help" className="text-xs text-gray-500 mt-1">
                    Supported formats: MP3, WAV, FLAC, OGG, AIFF, WebM, AAC (Max 500MB)
                  </p>
                  {uploadForm.file && (
                    <p className="text-xs text-green-600 mt-1">
                      Selected: {uploadForm.file.name} ({(uploadForm.file.size / (1024 * 1024)).toFixed(2)} MB)
                    </p>
                  )}
                </div>

                <div className="flex justify-end space-x-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsUploadOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={uploadMutation.isPending}>
                    {uploadMutation.isPending ? `Uploading ${uploadProgress}%` : 'Upload Project'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          </div>

          {/* Edit Project Dialog */}
          <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Edit Project</DialogTitle>
              </DialogHeader>

              <form onSubmit={handleUpdateProject} className="space-y-4">
                <div>
                  <Label htmlFor="edit-title">Project Title</Label>
                  <Input
                    id="edit-title"
                    value={editForm.title}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter project title"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="edit-description">Description (Optional)</Label>
                  <Textarea
                    id="edit-description"
                    value={editForm.description}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, description: e.target.value }))
                    }
                    placeholder="Describe your project"
                    rows={3}
                  />
                </div>

                <div>
                  <Label htmlFor="edit-genre">Genre</Label>
                  <Select
                    value={editForm.genre}
                    onValueChange={(value) => setEditForm((prev) => ({ ...prev, genre: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select genre" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pop">Pop</SelectItem>
                      <SelectItem value="rock">Rock</SelectItem>
                      <SelectItem value="hip-hop">Hip-Hop</SelectItem>
                      <SelectItem value="electronic">Electronic</SelectItem>
                      <SelectItem value="jazz">Jazz</SelectItem>
                      <SelectItem value="classical">Classical</SelectItem>
                      <SelectItem value="country">Country</SelectItem>
                      <SelectItem value="r&b">R&B</SelectItem>
                      <SelectItem value="indie">Indie</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex justify-end space-x-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={editMutation.isPending}>
                    {editMutation.isPending ? 'Updating...' : 'Update Project'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </header>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 mt-2">
          <TabsList className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <TabsTrigger value="projects" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
              <Music className="w-4 h-4 mr-1" />
              My Projects
            </TabsTrigger>
            <TabsTrigger value="songwriting" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
              <Mic2 className="w-4 h-4 mr-1" />
              Songwriting
            </TabsTrigger>
          </TabsList>

          <TabsContent value="projects" className="space-y-6">
        {/* Projects Grid */}
        {projectsLoading ? (
          <section
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            role="region"
            aria-label="Loading projects"
            aria-busy="true"
          >
            {[...Array(6)].map((_, i) => (
              <SkeletonProjectCard key={i} />
            ))}
          </section>
        ) : projects.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="No projects yet. Create your first masterpiece!"
            description="Upload your first audio to get started with AI-powered music tools."
            actionLabel="Upload Project"
            onAction={() => setIsUploadOpen(true)}
            size="lg"
            variant="card"
          />
        ) : (
          <section
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            role="region"
            aria-label="Projects grid"
          >
            {projects.map((project: Project) => (
              <Card key={project.id} className="hover:shadow-lg transition-shadow duration-200 cursor-pointer" onClick={() => setLocation(`/studio/${project.id}`)}>
                <CardContent className="p-6">
                  {/* Project Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      <div className="w-12 h-12 bg-gradient-to-br from-primary to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        <FileAudio className="h-6 w-6 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-gray-900 truncate">{project.title}</h3>
                        <p className="text-sm text-gray-500">
                          {project.genre && <span className="capitalize">{project.genre} • </span>}
                          <Calendar className="inline h-3 w-3 mr-1" />
                          {new Date(project.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" data-testid={`button-menu-${project.id}`} onClick={(e) => e.stopPropagation()}>
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handlePlayProject(project)}
                          data-testid={`button-play-${project.id}`}
                        >
                          {audioLoading === project.id ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : currentlyPlaying === project.id ? (
                            <Pause className="h-4 w-4 mr-2" />
                          ) : (
                            <Play className="h-4 w-4 mr-2" />
                          )}
                          {audioLoading === project.id ? 'Loading...' : currentlyPlaying === project.id ? 'Pause' : 'Play'}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setLocation(`/studio/${project.id}`)}
                          data-testid={`button-open-studio-${project.id}`}
                        >
                          <Music className="h-4 w-4 mr-2" />
                          Open in Studio
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleEdit(project)}
                          data-testid={`button-edit-${project.id}`}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setLocation(`/analytics?project=${project.id}`)}
                          data-testid={`button-analytics-${project.id}`}
                        >
                          <TrendingUp className="h-4 w-4 mr-2" />
                          Analytics
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => deleteMutation.mutate(project.id)}
                          data-testid={`button-delete-${project.id}`}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Project Status & Progress */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="secondary" className={getStatusColor(project.workflowStage || project.status)}>
                        {getWorkflowStageLabel(project.workflowStage || project.status)}
                      </Badge>
                      <span className="text-sm text-gray-500">
                        {getProgressValue(project.workflowStage || project.status, project.progress)}% Complete
                      </span>
                    </div>
                    <Progress
                      value={getProgressValue(project.workflowStage || project.status, project.progress)}
                      className="h-2"
                    />
                  </div>

                  {/* Project Details */}
                  <div className="space-y-2 text-sm text-gray-500 mb-4">
                    {project.duration && (
                      <div className="flex items-center">
                        <Clock className="h-3 w-3 mr-2" />
                        Duration: {formatDuration(project.duration)}
                      </div>
                    )}
                    {project.fileSize && (
                      <div className="flex items-center">
                        <FileAudio className="h-3 w-3 mr-2" />
                        Size: {formatFileSize(project.fileSize)}
                      </div>
                    )}
                    {project.streams > 0 && (
                      <div className="flex items-center">
                        <Play className="h-3 w-3 mr-2" />
                        Streams: {project.streams.toLocaleString()}
                      </div>
                    )}
                  </div>

                  {/* Project Description */}
                  {project.description && (
                    <p className="text-sm text-gray-600 mb-4 line-clamp-2">{project.description}</p>
                  )}

                  {/* Action Buttons */}
                  <div className="flex space-x-2" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handlePlayProject(project)}
                      data-testid={`button-play-bottom-${project.id}`}
                    >
                      {audioLoading === project.id ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : currentlyPlaying === project.id ? (
                        <Pause className="h-4 w-4 mr-2" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      {audioLoading === project.id ? 'Loading...' : currentlyPlaying === project.id ? 'Pause' : 'Play'}
                    </Button>
                    {project.workflowStage === 'delivery' || project.status === 'completed' ? (
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => setLocation(`/analytics?project=${project.id}`)}
                        data-testid={`button-analytics-bottom-${project.id}`}
                      >
                        <TrendingUp className="h-4 w-4 mr-2" />
                        Analytics
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => setLocation(`/studio/${project.id}`)}
                        data-testid={`button-continue-${project.id}`}
                      >
                        <Music className="h-4 w-4 mr-2" />
                        Continue
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>
        )}
          </TabsContent>

          <TabsContent value="songwriting" className="space-y-6">
            <SongwritingTab />
          </TabsContent>

        </Tabs>
      </div>
    </AppLayout>
  );
}

function SongwritingTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [rhymeWord, setRhymeWord] = useState('');
  const [rhymes, setRhymes] = useState<string[]>([]);
  const [aiChord, setAiChord] = useState('');
  const [newSession, setNewSession] = useState({ title: '', genre: 'hip-hop', mood: '', bpm: 90, key: 'C', lyrics: '', notes: '' });

  const { data: sessions = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/songwriting'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/songwriting', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/songwriting'] });
      setIsNewDialogOpen(false);
      setNewSession({ title: '', genre: 'hip-hop', mood: '', bpm: 90, key: 'C', lyrics: '', notes: '' });
      toast({ title: 'Session Created', description: 'Songwriting session saved' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await apiRequest('PUT', `/api/songwriting/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/songwriting'] });
      toast({ title: 'Saved', description: 'Session updated' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/songwriting/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/songwriting'] });
      setSelectedSession(null);
      toast({ title: 'Deleted', description: 'Session removed' });
    },
  });

  const getRhymes = async () => {
    if (!rhymeWord.trim()) return;
    const res = await apiRequest('POST', '/api/songwriting/ai-assist', { prompt: rhymeWord, genre: selectedSession?.genre || 'hip-hop' });
    const data = await res.json();
    setRhymes(data.rhymes || []);
    setAiChord(data.chordProgression || '');
  };

  const SONG_STRUCTURES = [
    'Verse – Chorus – Verse – Chorus – Bridge – Chorus',
    'Intro – Verse – Pre-Chorus – Chorus – Verse – Chorus – Outro',
    'Intro – Hook – Verse – Hook – Bridge – Hook',
    'Verse – Verse – Chorus – Verse – Chorus – Outro',
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Sessions</h2>
          <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gradient-bg"><Plus className="w-4 h-4 mr-1" />New</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Songwriting Session</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Title</Label><Input placeholder="Song title..." value={newSession.title} onChange={(e) => setNewSession({...newSession, title: e.target.value})} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Genre</Label>
                    <Select value={newSession.genre} onValueChange={(v) => setNewSession({...newSession, genre: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['hip-hop','pop','rnb','rock','country','electronic'].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Key</Label><Input placeholder="C, Am, F#..." value={newSession.key} onChange={(e) => setNewSession({...newSession, key: e.target.value})} /></div>
                </div>
                <div><Label>BPM</Label><Input type="number" value={newSession.bpm} onChange={(e) => setNewSession({...newSession, bpm: Number(e.target.value)})} /></div>
                <div><Label>Mood</Label><Input placeholder="melancholy, hype, romantic..." value={newSession.mood} onChange={(e) => setNewSession({...newSession, mood: e.target.value})} /></div>
                <Button className="w-full gradient-bg" onClick={() => createMutation.mutate(newSession)} disabled={!newSession.title || createMutation.isPending}>
                  {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Create Session
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? <div className="text-center py-8 text-gray-400">Loading...</div> : sessions.length === 0 ? (
          <Card className="p-8 text-center">
            <Mic2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500">No sessions yet. Create your first song!</p>
          </Card>
        ) : sessions.map((s: any) => (
          <Card key={s.id} className={`cursor-pointer hover:shadow-md transition-shadow ${selectedSession?.id === s.id ? 'border-blue-500 shadow-md' : ''}`} onClick={() => setSelectedSession(s)}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-sm">{s.title}</p>
                  <p className="text-xs text-gray-500 mt-1">{s.genre} • {s.key} • {s.bpm} BPM</p>
                  {s.mood && <p className="text-xs text-gray-400 mt-1">{s.mood}</p>}
                </div>
                <Badge variant="outline" className="text-xs">{s.status?.replace('_', ' ')}</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="lg:col-span-2 space-y-4">
        {selectedSession ? (
          <>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{selectedSession.title}</CardTitle>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => updateMutation.mutate({ id: selectedSession.id, lyrics: selectedSession.lyrics, notes: selectedSession.notes })} disabled={updateMutation.isPending}>
                      {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                    </Button>
                    <Button size="sm" variant="outline" className="text-red-500" onClick={() => deleteMutation.mutate(selectedSession.id)}>Delete</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium mb-2 flex items-center gap-1"><PenLine className="w-3 h-3" />Lyrics</Label>
                    <Textarea
                      className="min-h-[200px] font-mono text-sm"
                      placeholder={"[Verse 1]\n...\n\n[Chorus]\n...\n\n[Bridge]\n..."}
                      value={selectedSession.lyrics || ''}
                      onChange={(e) => setSelectedSession({...selectedSession, lyrics: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Notes</Label>
                    <Textarea className="min-h-[80px] text-sm" placeholder="Song ideas, references, production notes..." value={selectedSession.notes || ''} onChange={(e) => setSelectedSession({...selectedSession, notes: e.target.value})} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-sm flex items-center gap-1"><Lightbulb className="w-4 h-4 text-yellow-500" />Rhyme Finder</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex gap-2 mb-3">
                    <Input placeholder="Enter a word..." value={rhymeWord} onChange={(e) => setRhymeWord(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && getRhymes()} />
                    <Button size="sm" onClick={getRhymes}>Find</Button>
                  </div>
                  {rhymes.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {rhymes.map(r => (
                        <Badge key={r} variant="secondary" className="cursor-pointer hover:bg-blue-100" onClick={() => setSelectedSession({...selectedSession, lyrics: (selectedSession.lyrics || '') + ' ' + r})}>
                          {r}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {aiChord && <p className="text-xs text-gray-500 mt-3 border-t pt-2"><span className="font-medium">Suggested chords:</span> {aiChord}</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-sm flex items-center gap-1"><Target className="w-4 h-4 text-purple-500" />Song Structure Templates</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {SONG_STRUCTURES.map((s, i) => (
                      <div key={i} className="flex items-start gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20"
                        onClick={() => setSelectedSession({...selectedSession, lyrics: s + '\n\n' + (selectedSession.lyrics || '')})}>
                        <ChevronRight className="w-3 h-3 mt-0.5 text-blue-500 flex-shrink-0" />{s}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          <Card className="p-12 text-center">
            <Mic2 className="w-16 h-16 mx-auto mb-4 text-gray-200" />
            <h3 className="text-lg font-medium text-gray-500 mb-2">Select a session</h3>
            <p className="text-sm text-gray-400">Choose a session from the list or create a new one to start writing</p>
          </Card>
        )}
      </div>
    </div>
  );
}
