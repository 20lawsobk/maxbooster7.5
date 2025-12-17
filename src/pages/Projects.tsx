import { useState } from 'react';
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
import { apiRequest } from '@/lib/queryClient';
import {
  Music,
  Upload,
  Play,
  Pause,
  MoreVertical,
  Edit,
  Trash2,
  TrendingUp,
  Calendar,
  Clock,
  FileAudio,
  Sparkles,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function Projects() {
  const { user, isLoading: authLoading } = useRequireSubscription();
  const [location, setLocation] = useLocation();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    title: '',
    description: '',
    genre: '',
    file: null as File | null,
  });
  const [isUploading, setIsUploading] = useState(false);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<number | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    genre: '',
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: projectsData, isLoading: projectsLoading } = useQuery({
    queryKey: ['/api/projects'],
    enabled: !!user,
  });

  const projects = (projectsData as any)?.data || [];

  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await apiRequest('POST', '/api/projects', formData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      toast({
        title: 'Success!',
        description: 'Your project has been uploaded successfully.',
      });
      setIsUploadOpen(false);
      setUploadForm({ title: '', description: '', genre: '', file: null });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Upload Failed',
        description: error.message || 'Failed to upload project. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (projectId: number) => {
      await apiRequest('DELETE', `/api/projects/${projectId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      toast({
        title: 'Project Deleted',
        description: 'The project has been removed successfully.',
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Delete Failed',
        description: error.message || 'Failed to delete project. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await apiRequest('PATCH', `/api/projects/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      toast({
        title: 'Project Updated',
        description: 'Your project has been updated successfully.',
      });
      setIsEditOpen(false);
      setEditingProject(null);
    },
    onError: (error: unknown) => {
      toast({
        title: 'Update Failed',
        description: error.message || 'Failed to update project.',
        variant: 'destructive',
      });
    },
  });

  const handlePlayProject = (project: unknown) => {
    // If already playing this project, pause it
    if (currentlyPlaying === project.id && audioElement) {
      audioElement.pause();
      setCurrentlyPlaying(null);
      return;
    }

    // Stop current audio if any
    if (audioElement) {
      audioElement.pause();
    }

    // Create new audio element
    if (project.audioUrl) {
      const audio = new Audio(project.audioUrl);
      audio.play();
      setAudioElement(audio);
      setCurrentlyPlaying(project.id);

      audio.onended = () => {
        setCurrentlyPlaying(null);
      };
    } else {
      toast({
        title: 'No Audio File',
        description: "This project doesn't have an audio file attached.",
        variant: 'destructive',
      });
    }
  };

  const handleEdit = (project: unknown) => {
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

    setIsUploading(true);

    const formData = new FormData();
    formData.append('title', uploadForm.title);
    formData.append('description', uploadForm.description);
    formData.append('genre', uploadForm.genre);
    formData.append('audio', uploadForm.file);

    uploadMutation.mutate(formData);
    setIsUploading(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'mastering':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'draft':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getProgressValue = (status: string, progress?: number) => {
    if (progress) return progress;
    switch (status) {
      case 'completed':
        return 100;
      case 'mastering':
        return 90;
      case 'in_progress':
        return 50;
      default:
        return 25;
    }
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
              {(projects as any)?.length || 0} project
              {((projects as any)?.length || 0) !== 1 ? 's' : ''} total
            </p>
          </div>

          <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
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
            <DialogContent className="max-w-md">
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
                    accept="audio/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setUploadForm((prev) => ({ ...prev, file }));
                    }}
                    required
                    data-testid="input-file-upload"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Supported formats: MP3, WAV, FLAC, OGG (Max 100MB)
                  </p>
                </div>

                <div className="flex justify-end space-x-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsUploadOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isUploading}>
                    {isUploading ? 'Uploading...' : 'Upload Project'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

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
        ) : ((projects as any)?.length || 0) === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="No projects yet. Create your first masterpiece!"
            description="Upload your first audio project to get started with AI-powered music tools, professional mixing, and real-time analytics."
            actionLabel="Upload Your First Project"
            onAction={() => setIsUploadOpen(true)}
            secondaryActionLabel="Learn More"
            onSecondaryAction={() => setLocation('/help')}
            size="lg"
            variant="card"
          />
        ) : (
          <section
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            role="region"
            aria-label="Projects grid"
          >
            {(projects as any)?.map((project: unknown) => (
              <Card key={project.id} className="hover:shadow-lg transition-shadow duration-200">
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
                        <Button variant="ghost" size="sm" data-testid={`button-menu-${project.id}`}>
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handlePlayProject(project)}
                          data-testid={`button-play-${project.id}`}
                        >
                          {currentlyPlaying === project.id ? (
                            <Pause className="h-4 w-4 mr-2" />
                          ) : (
                            <Play className="h-4 w-4 mr-2" />
                          )}
                          {currentlyPlaying === project.id ? 'Pause' : 'Play'}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleEdit(project)}
                          data-testid={`button-edit-${project.id}`}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
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
                      <Badge variant="secondary" className={getStatusColor(project.status)}>
                        {project.status?.replace('_', ' ')?.toUpperCase() || 'UNKNOWN'}
                      </Badge>
                      <span className="text-sm text-gray-500">
                        {getProgressValue(project.status, project.progress)}% Complete
                      </span>
                    </div>
                    <Progress
                      value={getProgressValue(project.status, project.progress)}
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
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handlePlayProject(project)}
                      data-testid={`button-play-bottom-${project.id}`}
                    >
                      {currentlyPlaying === project.id ? (
                        <Pause className="h-4 w-4 mr-2" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      {currentlyPlaying === project.id ? 'Pause' : 'Play'}
                    </Button>
                    {project.status === 'completed' ? (
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
                        onClick={() => handleEdit(project)}
                        data-testid={`button-continue-${project.id}`}
                      >
                        Continue
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>
        )}
      </div>
    </AppLayout>
  );
}
