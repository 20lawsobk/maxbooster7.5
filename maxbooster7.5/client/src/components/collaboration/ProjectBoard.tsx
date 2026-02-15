import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Users, Music, Calendar, UserPlus, LogOut, Crown } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

const GENRES = [
  'Hip Hop', 'R&B', 'Pop', 'Electronic', 'Rock', 'Jazz', 'Classical',
  'Country', 'Reggae', 'Latin', 'Afrobeats', 'K-Pop', 'Indie', 'Metal', 'Folk',
];

const ROLES = [
  'Producer', 'Vocalist', 'Rapper', 'Singer', 'Songwriter', 'Beatmaker',
  'Mixing Engineer', 'Mastering Engineer', 'DJ', 'Instrumentalist',
];

export function ProjectBoard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newProject, setNewProject] = useState({
    title: '',
    description: '',
    genre: '',
    lookingFor: [] as string[],
    maxMembers: 10,
    isPublic: true,
  });

  const { data: allProjects, isLoading: allLoading } = useQuery({
    queryKey: ['/api/collaborations/projects'],
    queryFn: async () => {
      const res = await fetch('/api/collaborations/projects', {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch projects');
      return res.json();
    },
  });

  const { data: myProjects, isLoading: myLoading } = useQuery({
    queryKey: ['/api/collaborations/projects', 'own'],
    queryFn: async () => {
      const res = await fetch('/api/collaborations/projects?ownOnly=true', {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch my projects');
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newProject) => {
      const res = await apiRequest('POST', '/api/collaborations/projects', data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Project Created!' });
      setIsCreateOpen(false);
      setNewProject({
        title: '',
        description: '',
        genre: '',
        lookingFor: [],
        maxMembers: 10,
        isPublic: true,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/collaborations/projects'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create project',
        variant: 'destructive',
      });
    },
  });

  const joinMutation = useMutation({
    mutationFn: async ({ projectId, role }: { projectId: string; role: string }) => {
      const res = await apiRequest('POST', `/api/collaborations/projects/${projectId}/join`, { role });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Joined Project!' });
      queryClient.invalidateQueries({ queryKey: ['/api/collaborations/projects'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to join project',
        variant: 'destructive',
      });
    },
  });

  const leaveMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const res = await apiRequest('POST', `/api/collaborations/projects/${projectId}/leave`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Left Project' });
      queryClient.invalidateQueries({ queryKey: ['/api/collaborations/projects'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to leave project',
        variant: 'destructive',
      });
    },
  });

  const toggleRole = (role: string) => {
    setNewProject((prev) => ({
      ...prev,
      lookingFor: prev.lookingFor.includes(role)
        ? prev.lookingFor.filter((r) => r !== role)
        : [...prev.lookingFor, role],
    }));
  };

  const isUserMember = (project: any) => {
    return project.members?.some((m: any) => m.userId === user?.id);
  };

  const isProjectOwner = (project: any) => {
    return project.ownerId === user?.id;
  };

  const renderProjectCard = (project: any) => {
    const isMember = isUserMember(project);
    const isOwner = isProjectOwner(project);
    const memberCount = project.members?.length || 0;

    return (
      <Card key={project.id} className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                {project.title}
                {isOwner && (
                  <Badge variant="secondary">
                    <Crown className="h-3 w-3 mr-1" />
                    Owner
                  </Badge>
                )}
              </CardTitle>
              {project.genre && (
                <Badge variant="outline" className="mt-1">
                  <Music className="h-3 w-3 mr-1" />
                  {project.genre}
                </Badge>
              )}
            </div>
            <Badge variant={project.status === 'open' ? 'default' : 'secondary'}>
              {project.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {project.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {project.description}
            </p>
          )}

          {project.lookingFor?.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-1">Looking for:</p>
              <div className="flex flex-wrap gap-1">
                {project.lookingFor.map((role: string) => (
                  <Badge key={role} variant="outline" className="text-xs">
                    {role}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {memberCount}/{project.maxMembers || 10} members
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {new Date(project.createdAt).toLocaleDateString()}
            </span>
          </div>

          {project.members?.length > 0 && (
            <div className="flex -space-x-2">
              {project.members.slice(0, 5).map((member: any) => (
                <Avatar key={member.id} className="h-8 w-8 border-2 border-background">
                  <AvatarImage src={member.user?.avatarUrl} />
                  <AvatarFallback className="text-xs">
                    {member.user?.username?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
              ))}
              {project.members.length > 5 && (
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs border-2 border-background">
                  +{project.members.length - 5}
                </div>
              )}
            </div>
          )}

          <div className="pt-2">
            {isMember && !isOwner ? (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => leaveMutation.mutate(project.id)}
                disabled={leaveMutation.isPending}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Leave Project
              </Button>
            ) : !isMember && project.status === 'open' ? (
              <Button
                size="sm"
                className="w-full"
                onClick={() => joinMutation.mutate({ projectId: project.id, role: 'member' })}
                disabled={joinMutation.isPending || memberCount >= (project.maxMembers || 10)}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Join Project
              </Button>
            ) : isOwner ? (
              <Button variant="outline" size="sm" className="w-full" disabled>
                Manage Project
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderSkeletons = () => (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {[...Array(6)].map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-20" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-16 w-full mb-4" />
            <Skeleton className="h-8 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Collaboration Projects
          </CardTitle>
          <CardDescription>Create or join projects with other artists</CardDescription>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Project
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Collaboration Project</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>Project Title</Label>
                <Input
                  value={newProject.title}
                  onChange={(e) => setNewProject((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Enter project title..."
                />
              </div>

              <div>
                <Label>Description</Label>
                <Textarea
                  value={newProject.description}
                  onChange={(e) => setNewProject((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Describe your project..."
                  rows={3}
                />
              </div>

              <div>
                <Label>Genre</Label>
                <Select
                  value={newProject.genre}
                  onValueChange={(v) => setNewProject((p) => ({ ...p, genre: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select genre" />
                  </SelectTrigger>
                  <SelectContent>
                    {GENRES.map((genre) => (
                      <SelectItem key={genre} value={genre}>
                        {genre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Looking For</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {ROLES.map((role) => (
                    <Button
                      key={role}
                      type="button"
                      variant={newProject.lookingFor.includes(role) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleRole(role)}
                    >
                      {role}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Max Members</Label>
                  <Input
                    type="number"
                    min={2}
                    max={50}
                    value={newProject.maxMembers}
                    onChange={(e) =>
                      setNewProject((p) => ({ ...p, maxMembers: parseInt(e.target.value) || 10 }))
                    }
                  />
                </div>
                <div className="flex items-center space-x-2 pt-6">
                  <Switch
                    checked={newProject.isPublic}
                    onCheckedChange={(v) => setNewProject((p) => ({ ...p, isPublic: v }))}
                  />
                  <Label>Public Project</Label>
                </div>
              </div>

              <Button
                className="w-full"
                onClick={() => createMutation.mutate(newProject)}
                disabled={!newProject.title || createMutation.isPending}
              >
                {createMutation.isPending ? 'Creating...' : 'Create Project'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="all">
          <TabsList className="mb-4">
            <TabsTrigger value="all">All Projects</TabsTrigger>
            <TabsTrigger value="my">My Projects</TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            {allLoading ? (
              renderSkeletons()
            ) : allProjects?.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {allProjects.map(renderProjectCard)}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No projects yet</p>
                <p className="text-sm">Be the first to create a collaboration project!</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="my">
            {myLoading ? (
              renderSkeletons()
            ) : myProjects?.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {myProjects.map(renderProjectCard)}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No projects yet</p>
                <p className="text-sm">Create a project to start collaborating!</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default ProjectBoard;
