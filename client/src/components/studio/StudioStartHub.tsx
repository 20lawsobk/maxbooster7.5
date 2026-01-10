import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { formatDistanceToNow } from 'date-fns';
import {
  Plus,
  FolderOpen,
  Music,
  Star,
  Clock,
  Layout,
  Mic,
  AudioWaveform,
  Disc3,
  Piano,
  Layers,
  Sparkles,
  ChevronRight,
} from 'lucide-react';

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
  projectCount: number;
  templates: Template[];
  user: {
    id: string;
    name: string;
  };
}

interface StudioStartHubProps {
  onProjectSelect: (projectId: string) => void;
  onCreateProject: (title: string, templateId?: string) => void;
}

const TEMPLATE_CATEGORIES = [
  { id: 'all', label: 'All', icon: Layout },
  { id: 'recording', label: 'Recording', icon: Mic },
  { id: 'production', label: 'Production', icon: AudioWaveform },
  { id: 'mastering', label: 'Mastering', icon: Disc3 },
  { id: 'user', label: 'My Templates', icon: Layers },
];

const GENRE_ICONS: Record<string, typeof Music> = {
  'Hip Hop': AudioWaveform,
  'Electronic': Sparkles,
  'Pop': Star,
  'Rock': Music,
  'R&B': Mic,
  'Jazz': Piano,
};

export function StudioStartHub({ onProjectSelect, onCreateProject }: StudioStartHubProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const { data: hubData, isLoading } = useQuery<StartHubData>({
    queryKey: ['/api/studio/start-hub/summary'],
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: async ({ projectId, favorite }: { projectId: string; favorite: boolean }) => {
      const response = await apiRequest('PATCH', `/api/studio/projects/${projectId}/favorite`, { favorite });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/studio/start-hub/summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/studio/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update favorite status',
        variant: 'destructive',
      });
    },
  });

  const createFromTemplateMutation = useMutation({
    mutationFn: async ({ templateId, title }: { templateId: string; title: string }) => {
      const response = await apiRequest('POST', `/api/studio/templates/${templateId}/create-project`, { title });
      return response.json();
    },
    onSuccess: (project) => {
      toast({
        title: 'Project created',
        description: `Created "${project.title}" from template`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/studio/start-hub/summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/studio/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      onProjectSelect(project.id);
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to create project from template',
        variant: 'destructive',
      });
    },
  });

  const handleCreateProject = () => {
    if (newProjectTitle.trim()) {
      onCreateProject(newProjectTitle.trim());
      setNewProjectTitle('');
      setShowNewProjectDialog(false);
    }
  };

  const handleProjectOpen = (projectId: string) => {
    apiRequest('PATCH', `/api/studio/projects/${projectId}/opened`, {});
    onProjectSelect(projectId);
  };

  const filteredTemplates = hubData?.templates.filter(
    t => selectedCategory === 'all' || t.category === selectedCategory
  ) || [];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          <Skeleton className="h-12 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Studio</h1>
            <p className="text-gray-400">
              Welcome back{hubData?.user.name ? `, ${hubData.user.name}` : ''}. 
              {hubData?.projectCount ? ` You have ${hubData.projectCount} project${hubData.projectCount !== 1 ? 's' : ''}.` : ''}
            </p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card 
            className="bg-gradient-to-br from-blue-600/20 to-blue-800/20 border-blue-500/30 hover:border-blue-400/50 transition-all cursor-pointer group"
            onClick={() => setShowNewProjectDialog(true)}
          >
            <CardContent className="p-6 flex items-center gap-4">
              <div className="h-14 w-14 rounded-xl bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
                <Plus className="h-7 w-7 text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">New Song</h3>
                <p className="text-sm text-gray-400">Start a fresh project</p>
              </div>
            </CardContent>
          </Card>

          <Card 
            className="bg-gradient-to-br from-purple-600/20 to-purple-800/20 border-purple-500/30 hover:border-purple-400/50 transition-all cursor-pointer group"
            onClick={() => setSelectedCategory('mastering')}
          >
            <CardContent className="p-6 flex items-center gap-4">
              <div className="h-14 w-14 rounded-xl bg-purple-500/20 flex items-center justify-center group-hover:bg-purple-500/30 transition-colors">
                <Disc3 className="h-7 w-7 text-purple-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">New Project</h3>
                <p className="text-sm text-gray-400">Mastering & album layout</p>
              </div>
            </CardContent>
          </Card>

          <Card 
            className="bg-gradient-to-br from-green-600/20 to-green-800/20 border-green-500/30 hover:border-green-400/50 transition-all cursor-pointer group"
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.json,.song,.project';
              input.click();
            }}
          >
            <CardContent className="p-6 flex items-center gap-4">
              <div className="h-14 w-14 rounded-xl bg-green-500/20 flex items-center justify-center group-hover:bg-green-500/30 transition-colors">
                <FolderOpen className="h-7 w-7 text-green-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Open</h3>
                <p className="text-sm text-gray-400">Open existing document</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Recent Projects & Favorites */}
          <div className="lg:col-span-2 space-y-6">
            {/* Favorites */}
            {(hubData?.favoriteProjects?.length || 0) > 0 && (
              <Card className="bg-gray-800/50 border-gray-700">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2 text-white">
                    <Star className="h-5 w-5 text-yellow-400 fill-yellow-400" />
                    Pinned Projects
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {hubData?.favoriteProjects.map((project) => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        onOpen={() => handleProjectOpen(project.id)}
                        onToggleFavorite={() => 
                          toggleFavoriteMutation.mutate({ 
                            projectId: project.id, 
                            favorite: !project.favorite 
                          })
                        }
                        compact
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recent Projects */}
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2 text-white">
                  <Clock className="h-5 w-5 text-gray-400" />
                  Recent Projects
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(hubData?.recentProjects?.length || 0) > 0 ? (
                  <ScrollArea className="h-[400px] pr-4">
                    <div className="space-y-3">
                      {hubData?.recentProjects.map((project) => (
                        <ProjectCard
                          key={project.id}
                          project={project}
                          onOpen={() => handleProjectOpen(project.id)}
                          onToggleFavorite={() => 
                            toggleFavoriteMutation.mutate({ 
                              projectId: project.id, 
                              favorite: !project.favorite 
                            })
                          }
                        />
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="text-center py-12 text-gray-400">
                    <Music className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No projects yet</p>
                    <p className="text-sm mt-1">Create your first project to get started</p>
                    <Button 
                      className="mt-4" 
                      onClick={() => setShowNewProjectDialog(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create Project
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Templates */}
          <div className="space-y-6">
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2 text-white">
                  <Layout className="h-5 w-5 text-gray-400" />
                  Templates
                </CardTitle>
                <CardDescription className="text-gray-400">
                  Quick start with pre-configured setups
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
                  <TabsList className="w-full bg-gray-700/50 p-1 mb-4">
                    {TEMPLATE_CATEGORIES.slice(0, 3).map((cat) => (
                      <TabsTrigger 
                        key={cat.id} 
                        value={cat.id}
                        className="flex-1 text-xs data-[state=active]:bg-gray-600"
                      >
                        {cat.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  
                  <ScrollArea className="h-[350px] pr-2">
                    <div className="space-y-2">
                      {filteredTemplates.length > 0 ? (
                        filteredTemplates.map((template) => (
                          <TemplateCard
                            key={template.id}
                            template={template}
                            onSelect={() => {
                              createFromTemplateMutation.mutate({
                                templateId: template.id,
                                title: `New ${template.name} Project`,
                              });
                            }}
                          />
                        ))
                      ) : (
                        <div className="text-center py-8 text-gray-400">
                          <Layout className="h-10 w-10 mx-auto mb-3 opacity-50" />
                          <p className="text-sm">No templates in this category</p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* New Project Dialog */}
      <Dialog open={showNewProjectDialog} onOpenChange={setShowNewProjectDialog}>
        <DialogContent className="bg-gray-800 border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">Create New Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="projectTitle" className="text-gray-300">Project Name</Label>
              <Input
                id="projectTitle"
                value={newProjectTitle}
                onChange={(e) => setNewProjectTitle(e.target.value)}
                placeholder="My New Song"
                className="bg-gray-700 border-gray-600 text-white"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowNewProjectDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateProject} disabled={!newProjectTitle.trim()}>
              Create Project
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
  compact = false,
}: { 
  project: Project; 
  onOpen: () => void; 
  onToggleFavorite: () => void;
  compact?: boolean;
}) {
  const GenreIcon = project.genre ? (GENRE_ICONS[project.genre] || Music) : Music;
  
  return (
    <div 
      className={`group relative flex items-center gap-3 p-3 rounded-lg bg-gray-700/30 hover:bg-gray-700/50 border border-transparent hover:border-gray-600 transition-all cursor-pointer ${compact ? 'flex-col items-start' : ''}`}
      onClick={onOpen}
    >
      <div className={`${compact ? 'w-full h-20' : 'h-12 w-12'} rounded-lg bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center overflow-hidden`}>
        {project.coverImageUrl ? (
          <img src={project.coverImageUrl} alt={project.title} className="w-full h-full object-cover" />
        ) : (
          <GenreIcon className={`${compact ? 'h-8 w-8' : 'h-6 w-6'} text-gray-400`} />
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-white truncate">{project.title}</h4>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          {project.bpm && <span>{project.bpm} BPM</span>}
          {project.genre && <Badge variant="secondary" className="text-xs py-0">{project.genre}</Badge>}
          {project.lastOpenedAt && (
            <span className="text-gray-500">
              {formatDistanceToNow(new Date(project.lastOpenedAt), { addSuffix: true })}
            </span>
          )}
        </div>
      </div>
      
      <Button
        variant="ghost"
        size="icon"
        className={`${compact ? 'absolute top-2 right-2' : ''} h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity`}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
      >
        <Star className={`h-4 w-4 ${project.favorite ? 'text-yellow-400 fill-yellow-400' : 'text-gray-400'}`} />
      </Button>
      
      {!compact && (
        <ChevronRight className="h-5 w-5 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </div>
  );
}

function TemplateCard({ template, onSelect }: { template: Template; onSelect: () => void }) {
  const GenreIcon = template.genre ? (GENRE_ICONS[template.genre] || Layout) : Layout;
  
  return (
    <div 
      className="group flex items-center gap-3 p-3 rounded-lg bg-gray-700/30 hover:bg-gray-700/50 border border-transparent hover:border-gray-600 transition-all cursor-pointer"
      onClick={onSelect}
    >
      <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-600/30 to-blue-600/30 flex items-center justify-center">
        <GenreIcon className="h-5 w-5 text-purple-400" />
      </div>
      
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-white text-sm truncate">{template.name}</h4>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          {template.bpm && <span>{template.bpm} BPM</span>}
          {template.trackCount && template.trackCount > 0 && (
            <span>{template.trackCount} tracks</span>
          )}
          {template.isBuiltIn && (
            <Badge variant="secondary" className="text-xs py-0">Built-in</Badge>
          )}
        </div>
      </div>
      
      <ChevronRight className="h-4 w-4 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}
