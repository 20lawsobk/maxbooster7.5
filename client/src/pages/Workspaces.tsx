import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Building2, Plus, Users, Settings, Crown, Mail, UserPlus, LogOut, Music, Briefcase, Home } from 'lucide-react';

interface Workspace {
  id: string;
  name: string;
  type: 'artist' | 'label' | 'agency' | 'management';
  description?: string;
  memberCount: number;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  branding?: {
    logo?: string;
    colors?: { primary?: string; secondary?: string };
  };
  createdAt: string;
}

interface WorkspaceMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatar?: string;
  role: string;
  joinedAt: string;
}

export default function Workspaces() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  
  const [newWorkspace, setNewWorkspace] = useState({
    name: '',
    type: 'artist' as const,
    description: '',
  });
  
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');

  const { data: workspacesData, isLoading } = useQuery<{ workspaces: Workspace[] }>({
    queryKey: ['/api/workspace/user/workspaces'],
    enabled: !!user,
  });

  const { data: membersData } = useQuery<{ members: WorkspaceMember[] }>({
    queryKey: ['/api/workspace', selectedWorkspace?.id, 'members'],
    enabled: !!selectedWorkspace,
  });

  const createWorkspaceMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/workspace/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newWorkspace),
      });
      if (!res.ok) throw new Error('Failed to create workspace');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workspace/user/workspaces'] });
      setShowCreateDialog(false);
      setNewWorkspace({ name: '', type: 'artist', description: '' });
      toast({ title: 'Workspace created', description: 'Your new workspace is ready.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const inviteMemberMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWorkspace) throw new Error('No workspace selected');
      const res = await fetch(`/api/workspace/${selectedWorkspace.id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      if (!res.ok) throw new Error('Failed to send invitation');
      return res.json();
    },
    onSuccess: () => {
      setShowInviteDialog(false);
      setInviteEmail('');
      toast({ title: 'Invitation sent', description: `An invitation has been sent to ${inviteEmail}` });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  if (!user) {
    setLocation('/login');
    return null;
  }

  const workspaces = workspacesData?.workspaces || [];
  const members = membersData?.members || [];

  const getWorkspaceTypeIcon = (type: string) => {
    switch (type) {
      case 'artist': return <Music className="h-4 w-4" />;
      case 'label': return <Building2 className="h-4 w-4" />;
      case 'agency': return <Briefcase className="h-4 w-4" />;
      case 'management': return <Users className="h-4 w-4" />;
      default: return <Home className="h-4 w-4" />;
    }
  };

  const getRoleBadge = (role: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'outline'> = {
      owner: 'default',
      admin: 'secondary',
      member: 'outline',
      viewer: 'outline',
    };
    return (
      <Badge variant={variants[role] || 'outline'} className="text-xs">
        {role === 'owner' && <Crown className="h-3 w-3 mr-1" />}
        {role.charAt(0).toUpperCase() + role.slice(1)}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Building2 className="h-8 w-8 text-primary" />
              Workspaces
            </h1>
            <p className="text-muted-foreground mt-1">
              Collaborate with your team, label, or management
            </p>
          </div>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Workspace
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Workspace</DialogTitle>
                <DialogDescription>
                  Set up a collaborative workspace for your team
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Workspace Name</Label>
                  <Input
                    id="name"
                    value={newWorkspace.name}
                    onChange={(e) => setNewWorkspace({ ...newWorkspace, name: e.target.value })}
                    placeholder="My Label"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="type">Workspace Type</Label>
                  <Select
                    value={newWorkspace.type}
                    onValueChange={(v: any) => setNewWorkspace({ ...newWorkspace, type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="artist">
                        <span className="flex items-center gap-2">
                          <Music className="h-4 w-4" /> Artist Collective
                        </span>
                      </SelectItem>
                      <SelectItem value="label">
                        <span className="flex items-center gap-2">
                          <Building2 className="h-4 w-4" /> Record Label
                        </span>
                      </SelectItem>
                      <SelectItem value="agency">
                        <span className="flex items-center gap-2">
                          <Briefcase className="h-4 w-4" /> Agency
                        </span>
                      </SelectItem>
                      <SelectItem value="management">
                        <span className="flex items-center gap-2">
                          <Users className="h-4 w-4" /> Management
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="description">Description (optional)</Label>
                  <Textarea
                    id="description"
                    value={newWorkspace.description}
                    onChange={(e) => setNewWorkspace({ ...newWorkspace, description: e.target.value })}
                    placeholder="What is this workspace for?"
                    rows={3}
                  />
                </div>
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
                <Button 
                  onClick={() => createWorkspaceMutation.mutate()}
                  disabled={!newWorkspace.name || createWorkspaceMutation.isPending}
                >
                  {createWorkspaceMutation.isPending ? 'Creating...' : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {workspaces.length === 0 ? (
          <Card className="p-12 text-center">
            <Building2 className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-medium">No workspaces yet</h3>
            <p className="text-muted-foreground mt-2 max-w-md mx-auto">
              Create a workspace to collaborate with your team, manage artists, or coordinate with your label.
            </p>
            <Button className="mt-6" onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Workspace
            </Button>
          </Card>
        ) : (
          <Tabs defaultValue="workspaces" className="space-y-4">
            <TabsList>
              <TabsTrigger value="workspaces">My Workspaces</TabsTrigger>
              <TabsTrigger value="invitations">Invitations</TabsTrigger>
            </TabsList>

            <TabsContent value="workspaces" className="space-y-4">
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {workspaces.map((workspace) => (
                  <Card 
                    key={workspace.id}
                    className="cursor-pointer hover:border-primary transition-colors"
                    onClick={() => setSelectedWorkspace(workspace)}
                  >
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg flex items-center gap-2">
                          {getWorkspaceTypeIcon(workspace.type)}
                          {workspace.name}
                        </CardTitle>
                        {getRoleBadge(workspace.role)}
                      </div>
                      <CardDescription>
                        {workspace.description || `${workspace.type.charAt(0).toUpperCase() + workspace.type.slice(1)} workspace`}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Users className="h-4 w-4" />
                        <span>{workspace.memberCount} member{workspace.memberCount !== 1 ? 's' : ''}</span>
                      </div>
                    </CardContent>
                    <CardFooter className="gap-2">
                      <Button variant="outline" size="sm" className="flex-1">
                        <Settings className="h-4 w-4 mr-1" />
                        Manage
                      </Button>
                      {(workspace.role === 'owner' || workspace.role === 'admin') && (
                        <Button 
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedWorkspace(workspace);
                            setShowInviteDialog(true);
                          }}
                        >
                          <UserPlus className="h-4 w-4" />
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="invitations">
              <Card className="p-8 text-center">
                <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-medium">No pending invitations</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  When someone invites you to their workspace, it will appear here
                </p>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {selectedWorkspace && (
          <Card>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    {getWorkspaceTypeIcon(selectedWorkspace.type)}
                  </div>
                  <div>
                    <CardTitle>{selectedWorkspace.name}</CardTitle>
                    <CardDescription>{selectedWorkspace.type}</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getRoleBadge(selectedWorkspace.role)}
                  {(selectedWorkspace.role === 'owner' || selectedWorkspace.role === 'admin') && (
                    <Button size="sm" onClick={() => setShowInviteDialog(true)}>
                      <UserPlus className="h-4 w-4 mr-1" />
                      Invite
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <h4 className="font-medium mb-4">Members ({members.length})</h4>
              <div className="space-y-3">
                {members.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No members to display</p>
                ) : (
                  members.map((member) => (
                    <div key={member.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={member.avatar} />
                          <AvatarFallback>{member.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-sm">{member.name}</p>
                          <p className="text-xs text-muted-foreground">{member.email}</p>
                        </div>
                      </div>
                      {getRoleBadge(member.role)}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Team Member</DialogTitle>
              <DialogDescription>
                Send an invitation to join {selectedWorkspace?.name}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@example.com"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin - Full access</SelectItem>
                    <SelectItem value="member">Member - Can collaborate</SelectItem>
                    <SelectItem value="viewer">Viewer - Read-only access</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowInviteDialog(false)}>Cancel</Button>
              <Button 
                onClick={() => inviteMemberMutation.mutate()}
                disabled={!inviteEmail || inviteMemberMutation.isPending}
              >
                {inviteMemberMutation.isPending ? 'Sending...' : 'Send Invitation'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
