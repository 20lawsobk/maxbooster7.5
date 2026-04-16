import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Users, Search, UserPlus, Check, X, MessageSquare, Music, Star, MapPin, Zap, Clock, Send, FolderPlus } from 'lucide-react';

interface Connection {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatar?: string;
  role: string;
  genres?: string[];
  location?: string;
  status: 'connected' | 'pending_sent' | 'pending_received';
  connectedAt?: string;
}

interface Suggestion {
  id: string;
  userId: string;
  name: string;
  avatar?: string;
  role: string;
  genres?: string[];
  location?: string;
  matchScore: number;
  matchReasons: string[];
}

interface CollabProject {
  id: string;
  name: string;
  status: 'active' | 'completed' | 'pending';
  collaborators: Array<{ id: string; name: string; avatar?: string }>;
  createdAt: string;
}

export default function Collaborations() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showConnectDialog, setShowConnectDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Suggestion | null>(null);
  const [connectionMessage, setConnectionMessage] = useState('');
  const [showCreateProjectDialog, setShowCreateProjectDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [newProjectGenre, setNewProjectGenre] = useState('');

  const { data: connectionsData, isLoading: loadingConnections} = useQuery<Connection[]>({
    queryKey: ['/api/collaborations/connections'],
    enabled: !!user,
  });

  const { data: pendingData } = useQuery<Connection[]>({
    queryKey: ['/api/collaborations/connections/pending'],
    enabled: !!user,
  });

  const { data: suggestionsData } = useQuery<Suggestion[]>({
    queryKey: ['/api/collaborations/suggestions'],
    enabled: !!user,
  });

  const { data: projectsData } = useQuery<{ projects: CollabProject[] }>({
    queryKey: ['/api/collaborations/projects'],
    enabled: !!user,
  });

  const sendConnectionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUser) throw new Error('No user selected');
      const res = await fetch('/api/collaborations/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: selectedUser.userId, message: connectionMessage }),
      });
      if (!res.ok) throw new Error('Failed to send connection request');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/collaborations'] });
      setShowConnectDialog(false);
      setSelectedUser(null);
      setConnectionMessage('');
      toast({ title: 'Request sent', description: 'Your connection request has been sent.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const acceptConnectionMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const res = await fetch(`/api/collaborations/accept/${connectionId}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to accept connection');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/collaborations'] });
      toast({ title: 'Connection accepted' });
    },
  });

  const declineConnectionMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const res = await fetch(`/api/collaborations/decline/${connectionId}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to decline connection');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/collaborations'] });
      toast({ title: 'Connection declined' });
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: async (data: { title: string; description: string; genre: string }) => {
      const res = await apiRequest('POST', '/api/collaborations/projects', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/collaborations/projects'] });
      setShowCreateProjectDialog(false);
      setNewProjectName('');
      setNewProjectDescription('');
      setNewProjectGenre('');
      toast({ title: 'Project created!', description: 'Your collaboration project is ready.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create project', variant: 'destructive' });
    },
  });

  if (!user) {
    setLocation('/login');
    return null;
  }

const connections = connectionsData || [];
  const pendingRequests = pendingData || [];
  const suggestions = suggestionsData || [];
  const projects = projectsData?.projects || [];

  const filteredConnections = searchQuery
    ? connections.filter(c => 
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.role.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : connections;

  return (
    <AppLayout>
      {loadingConnections ? (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Users className="h-8 w-8 text-primary" />
              Collaborations
            </h1>
            <p className="text-muted-foreground mt-1">
              Connect with artists, producers, and industry professionals
            </p>
          </div>
        </div>

        {pendingRequests.length > 0 && (
          <Card className="border-amber-500/50 bg-amber-500/5">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-500" />
                Pending Connection Requests ({pendingRequests.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {pendingRequests.map((request) => (
                  <div key={request.id} className="flex items-center justify-between p-3 rounded-lg bg-background">
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={request.avatar} />
                        <AvatarFallback>{(request.name || 'UN').slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{request.name}</p>
                        <p className="text-sm text-muted-foreground">{request.role}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => declineConnectionMutation.mutate(request.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm"
                        onClick={() => acceptConnectionMutation.mutate(request.id)}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Accept
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="connections" className="space-y-4">
          <TabsList>
            <TabsTrigger value="connections">My Network ({connections.length})</TabsTrigger>
            <TabsTrigger value="discover">Discover</TabsTrigger>
            <TabsTrigger value="projects">Collab Projects</TabsTrigger>
          </TabsList>

          <TabsContent value="connections" className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search connections..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {filteredConnections.length === 0 ? (
              <Card className="p-8 text-center">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-medium">No connections yet</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Discover and connect with other artists and professionals
                </p>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredConnections.map((connection) => (
                  <Card key={connection.id}>
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={connection.avatar} />
                          <AvatarFallback>{(connection.name || 'UN').slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                          <CardTitle className="text-base">{connection.name}</CardTitle>
                          <CardDescription>{connection.role}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        {connection.genres && connection.genres.length > 0 && (
                          <div className="flex items-center gap-2">
                            <Music className="h-4 w-4 text-muted-foreground" />
                            <span>{connection.genres.slice(0, 3).join(', ')}</span>
                          </div>
                        )}
                        {connection.location && (
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <span>{connection.location}</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                    <CardFooter className="gap-2">
                      <Button variant="outline" size="sm" className="flex-1">
                        <MessageSquare className="h-4 w-4 mr-1" />
                        Message
                      </Button>
                      <Button variant="outline" size="sm">
                        View Profile
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="discover" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-500" />
                Suggested for You
              </h3>
            </div>

            {suggestions.length === 0 ? (
              <Card className="p-8 text-center">
                <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-medium">No suggestions yet</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Complete your profile to get personalized suggestions
                </p>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {suggestions.map((suggestion) => (
                  <Card key={suggestion.id}>
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={suggestion.avatar} />
                          <AvatarFallback>{(suggestion.name || 'UN').slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <CardTitle className="text-base">{suggestion.name}</CardTitle>
                          <CardDescription>{suggestion.role}</CardDescription>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          <Star className="h-3 w-3 mr-1" />
                          {suggestion.matchScore}% Match
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {suggestion.genres && suggestion.genres.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {suggestion.genres.slice(0, 3).map((genre) => (
                              <Badge key={genre} variant="outline" className="text-xs">
                                {genre}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {suggestion.matchReasons.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {suggestion.matchReasons[0]}
                          </p>
                        )}
                      </div>
                    </CardContent>
                    <CardFooter>
                      <Button 
                        className="w-full"
                        onClick={() => {
                          setSelectedUser(suggestion);
                          setShowConnectDialog(true);
                        }}
                      >
                        <UserPlus className="h-4 w-4 mr-2" />
                        Connect
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="projects" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setShowCreateProjectDialog(true)}>
                <FolderPlus className="h-4 w-4 mr-2" />
                New Project
              </Button>
            </div>
            {projects.length === 0 ? (
              <Card className="p-8 text-center">
                <Music className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-medium">No collaboration projects</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Start a project with your connections to collaborate on music
                </p>
                <Button className="mt-4" onClick={() => setShowCreateProjectDialog(true)}>
                  <FolderPlus className="h-4 w-4 mr-2" />
                  Start a Project
                </Button>
              </Card>
            ) : (
              <div className="grid gap-4">
                {projects.map((project) => (
                  <Card key={project.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{project.name}</CardTitle>
                        <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>
                          {project.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Collaborators:</span>
                        <div className="flex -space-x-2">
                          {project.collaborators.map((collab) => (
                            <Avatar key={collab.id} className="h-8 w-8 border-2 border-background">
                              <AvatarImage src={collab.avatar} />
                              <AvatarFallback>{(collab.name || 'UN').slice(0, 2)}</AvatarFallback>
                            </Avatar>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter>
                      <Button variant="outline" size="sm">Open Project</Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Create Project Dialog */}
        <Dialog open={showCreateProjectDialog} onOpenChange={setShowCreateProjectDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Start a Collaboration Project</DialogTitle>
              <DialogDescription>
                Create a shared workspace for you and your collaborators to work on music together.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="project-name">Project Name *</Label>
                <Input
                  id="project-name"
                  placeholder="e.g. Summer EP with DJ Karim"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-genre">Genre</Label>
                <Input
                  id="project-genre"
                  placeholder="e.g. Hip-Hop, R&B, Afrobeats..."
                  value={newProjectGenre}
                  onChange={(e) => setNewProjectGenre(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-desc">Description</Label>
                <Textarea
                  id="project-desc"
                  placeholder="What's the vision for this project? Goals, vibe, timeline..."
                  rows={3}
                  value={newProjectDescription}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateProjectDialog(false)}>Cancel</Button>
              <Button
                onClick={() => createProjectMutation.mutate({ title: newProjectName, description: newProjectDescription, genre: newProjectGenre })}
                disabled={!newProjectName.trim() || createProjectMutation.isPending}
              >
                <FolderPlus className="h-4 w-4 mr-2" />
                {createProjectMutation.isPending ? 'Creating...' : 'Create Project'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showConnectDialog} onOpenChange={setShowConnectDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Connect with {selectedUser?.name}</DialogTitle>
              <DialogDescription>
                Send a personalized message with your connection request
              </DialogDescription>
            </DialogHeader>
            
            {selectedUser && (
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <Avatar>
                  <AvatarImage src={selectedUser.avatar} />
                  <AvatarFallback>{(selectedUser.name || 'UN').slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{selectedUser.name}</p>
                  <p className="text-sm text-muted-foreground">{selectedUser.role}</p>
                </div>
              </div>
            )}
            
            <Textarea
              placeholder="Hi, I'd love to connect and potentially collaborate on some music..."
              value={connectionMessage}
              onChange={(e) => setConnectionMessage(e.target.value)}
              rows={4}
            />
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowConnectDialog(false)}>Cancel</Button>
              <Button 
                onClick={() => sendConnectionMutation.mutate()}
                disabled={sendConnectionMutation.isPending}
              >
                <Send className="h-4 w-4 mr-2" />
                {sendConnectionMutation.isPending ? 'Sending...' : 'Send Request'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
        </>
      )}
    </AppLayout>
  );
}
