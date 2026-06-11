import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCsrfTokenFromCookie } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Building2,
  Plus,
  Users,
  Crown,
  UserPlus,
  Music,
  Briefcase,
  Home,
  Shield,
  Activity,
  Share2,
  Eye,
} from "lucide-react";
import {
  WorkspaceOutcomeHandler,
  useWorkspaceOutcome,
  MemberManagementCard,
  type WorkspaceMemberDetails,
  RolePermissionMatrix,
  type Role,
  PresenceAvatars,
  type Collaborator,
  ActivityFeed,
  type ActivityItem,
  SharingDialog,
  type SharePermission,
} from "@/components/workspace";

interface Workspace {
  id: string;
  name: string;
  type: "artist" | "label" | "agency" | "management";
  description?: string;
  memberCount: number;
  role: "owner" | "admin" | "manager" | "member" | "viewer";
  branding?: {
    logo?: string;
    colors?: { primary?: string; secondary?: string };
  };
  createdAt: string;
}

interface WorkspaceMember {
  id: string;
  userId: string;
  userFirstName?: string;
  userLastName?: string;
  userEmail: string;
  userProfileImage?: string;
  role: string;
  roleId?: string;
  status: string;
  joinedAt: string;
  lastActiveAt?: string;
}

export default function Workspaces() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showSharingDialog, setShowSharingDialog] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState("overview");

  const [newWorkspace, setNewWorkspace] = useState({
    name: "",
    type: "artist" as const,
    description: "",
  });

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");

  const workspaceOutcome = useWorkspaceOutcome();

  const { data: workspacesData, isLoading } = useQuery<{
    workspaces: Workspace[];
  }>({
    queryKey: ["/api/workspace/user/workspaces"],
    enabled: !!user,
  });

  const { data: membersData } = useQuery<{ members: WorkspaceMember[] }>({
    queryKey: [`/api/workspace/${selectedWorkspace?.id}/members`],
    enabled: !!selectedWorkspace,
  });

  const { data: rolesData } = useQuery<{ roles: Role[] }>({
    queryKey: [`/api/workspace/${selectedWorkspace?.id}/roles`],
    enabled: !!selectedWorkspace,
  });

  const { data: activitiesData, refetch: refetchActivities } = useQuery<{
    activities: ActivityItem[];
  }>({
    queryKey: [`/api/workspace/${selectedWorkspace?.id}/activity`],
    enabled: !!selectedWorkspace,
  });

  const { data: presenceData } = useQuery<{ presence: Collaborator[] }>({
    queryKey: [`/api/workspace/${selectedWorkspace?.id}/presence`],
    enabled: !!selectedWorkspace,
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (!selectedWorkspace) return;
    const sendHeartbeat = () => {
      fetch(`/api/workspace/${selectedWorkspace.id}/presence/heartbeat`, {
        method: "POST",
        credentials: "include",
      }).catch(() => {});
    };
    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 30000);
    const onFocus = () => sendHeartbeat();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [selectedWorkspace?.id]);

  const createWorkspaceMutation = useMutation({
    mutationFn: async () => {
      const csrfToken = getCsrfTokenFromCookie();
      const res = await fetch("/api/workspace/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        credentials: "include",
        body: JSON.stringify(newWorkspace),
      });
      if (!res.ok) throw new Error("Failed to create workspace");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/workspace/user/workspaces"],
      });
      setShowCreateDialog(false);
      setNewWorkspace({ name: "", type: "artist", description: "" });
      workspaceOutcome.workspaceCreated(
        newWorkspace.name,
        data.workspace?.id || "",
      );
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const inviteMemberMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWorkspace) throw new Error("No workspace selected");
      const csrfToken = getCsrfTokenFromCookie();
      const res = await fetch(`/api/workspace/${selectedWorkspace.id}/invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      if (!res.ok) throw new Error("Failed to send invitation");
      return res.json();
    },
    onSuccess: () => {
      setShowInviteDialog(false);
      const email = inviteEmail;
      setInviteEmail("");
      workspaceOutcome.memberInvited(email);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMemberRoleMutation = useMutation({
    mutationFn: async ({
      memberId,
      role,
    }: {
      memberId: string;
      role: string;
    }) => {
      if (!selectedWorkspace) throw new Error("No workspace selected");
      const csrfToken = getCsrfTokenFromCookie();
      const res = await fetch(
        `/api/workspace/${selectedWorkspace.id}/members/${memberId}/role`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
          },
          credentials: "include",
          body: JSON.stringify({ role }),
        },
      );
      if (!res.ok) throw new Error("Failed to update role");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [`/api/workspace/${selectedWorkspace?.id}/members`],
      });
      workspaceOutcome.memberRoleChanged("Member", "previous", variables.role);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      if (!selectedWorkspace) throw new Error("No workspace selected");
      const csrfToken = getCsrfTokenFromCookie();
      const res = await fetch(
        `/api/workspace/${selectedWorkspace.id}/members/${memberId}`,
        {
          method: "DELETE",
          credentials: "include",
          headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
        },
      );
      if (!res.ok) throw new Error("Failed to remove member");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/workspace/${selectedWorkspace?.id}/members`],
      });
      workspaceOutcome.memberRemoved("Member");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createRoleMutation = useMutation({
    mutationFn: async (role: Omit<Role, "id">) => {
      if (!selectedWorkspace) throw new Error("No workspace selected");
      const csrfToken = getCsrfTokenFromCookie();
      const res = await fetch(`/api/workspace/${selectedWorkspace.id}/roles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        credentials: "include",
        body: JSON.stringify(role),
      });
      if (!res.ok) throw new Error("Failed to create role");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [`/api/workspace/${selectedWorkspace?.id}/roles`],
      });
      workspaceOutcome.roleCreated(variables.name);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({
      roleId,
      updates,
    }: {
      roleId: string;
      updates: Partial<Role>;
    }) => {
      if (!selectedWorkspace) throw new Error("No workspace selected");
      const csrfToken = getCsrfTokenFromCookie();
      const res = await fetch(
        `/api/workspace/${selectedWorkspace.id}/roles/${roleId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
          },
          credentials: "include",
          body: JSON.stringify(updates),
        },
      );
      if (!res.ok) throw new Error("Failed to update role");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [`/api/workspace/${selectedWorkspace?.id}/roles`],
      });
      workspaceOutcome.roleUpdated(variables.updates.name || "Role");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (roleId: string) => {
      if (!selectedWorkspace) throw new Error("No workspace selected");
      const csrfToken = getCsrfTokenFromCookie();
      const res = await fetch(
        `/api/workspace/${selectedWorkspace.id}/roles/${roleId}`,
        {
          method: "DELETE",
          credentials: "include",
          headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
        },
      );
      if (!res.ok) throw new Error("Failed to delete role");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/workspace/${selectedWorkspace?.id}/roles`],
      });
      workspaceOutcome.roleDeleted("Role");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const exportAuditMutation = useMutation({
    mutationFn: async () => {
      if (!selectedWorkspace) throw new Error("No workspace selected");
      const res = await fetch(
        `/api/workspace/${selectedWorkspace.id}/audit/export?format=json`,
        {
          credentials: "include",
        },
      );
      if (!res.ok) throw new Error("Failed to export audit log");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${selectedWorkspace.id}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      workspaceOutcome.auditExportGenerated();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (!user) {
    setLocation("/login");
    return null;
  }

  const workspaces = workspacesData?.workspaces || [];
  const members = membersData?.members || [];
  const roles = rolesData?.roles || [];
  const activities = activitiesData?.activities || [];
  const presence = presenceData?.presence || [];

  const formattedMembers: WorkspaceMemberDetails[] = members.map((m) => ({
    id: m.id,
    userId: m.userId,
    name:
      `${m.userFirstName || ""} ${m.userLastName || ""}`.trim() || m.userEmail,
    email: m.userEmail,
    avatar: m.userProfileImage,
    role: m.role as "owner" | "admin" | "manager" | "member" | "viewer",
    joinedAt: m.joinedAt,
    lastActiveAt: m.lastActiveAt,
    status: m.status as "active" | "inactive" | "pending",
    isOnline: presence.some(
      (p) => p.userId === m.userId && p.status === "online",
    ),
  }));

  const formattedRoles: Role[] = roles.map((r: Record<string, unknown>) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    permissions: r.permissions || [],
    isSystem: r.isSystem,
    isCustom: !r.isSystem,
    priority: r.priority || 50,
  }));

  const collaborators: Collaborator[] = presence.map((p) => ({
    userId: p.userId,
    displayName: p.displayName || "Unknown",
    avatar: p.avatar,
    color: p.color || "#6366F1",
    status: p.status || "offline",
    cursor: p.cursor,
    selection: p.selection,
  }));

  const getWorkspaceTypeIcon = (type: string) => {
    switch (type) {
      case "artist":
        return <Music className="h-4 w-4" />;
      case "label":
        return <Building2 className="h-4 w-4" />;
      case "agency":
        return <Briefcase className="h-4 w-4" />;
      case "management":
        return <Users className="h-4 w-4" />;
      default:
        return <Home className="h-4 w-4" />;
    }
  };

  const getRoleBadge = (role: string) => {
    const variants: Record<string, "default" | "secondary" | "outline"> = {
      owner: "default",
      admin: "secondary",
      manager: "secondary",
      member: "outline",
      viewer: "outline",
    };
    return (
      <Badge variant={variants[role] || "outline"} className="text-xs">
        {role === "owner" && <Crown className="h-3 w-3 mr-1" />}
        {(role || "member").charAt(0).toUpperCase() +
          (role || "member").slice(1)}
      </Badge>
    );
  };

  const canManageMembers =
    selectedWorkspace?.role === "owner" || selectedWorkspace?.role === "admin";

  return (
    <AppLayout>
      <WorkspaceOutcomeHandler
        outcome={workspaceOutcome.outcome}
        onDismiss={workspaceOutcome.clearOutcome}
      />

      {isLoading ? (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
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
            <div className="flex items-center gap-3">
              {selectedWorkspace && collaborators.length > 0 && (
                <PresenceAvatars
                  collaborators={collaborators}
                  maxVisible={5}
                  size="md"
                />
              )}
              <Dialog
                open={showCreateDialog}
                onOpenChange={setShowCreateDialog}
              >
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
                        onChange={(e) =>
                          setNewWorkspace({
                            ...newWorkspace,
                            name: e.target.value,
                          })
                        }
                        placeholder="My Label"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="type">Workspace Type</Label>
                      <Select
                        value={newWorkspace.type}
                        onValueChange={(v: Record<string, unknown>) =>
                          setNewWorkspace({ ...newWorkspace, type: v })
                        }
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
                      <Label htmlFor="description">
                        Description (optional)
                      </Label>
                      <Textarea
                        id="description"
                        value={newWorkspace.description}
                        onChange={(e) =>
                          setNewWorkspace({
                            ...newWorkspace,
                            description: e.target.value,
                          })
                        }
                        placeholder="What is this workspace for?"
                        rows={3}
                      />
                    </div>
                  </div>

                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setShowCreateDialog(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => createWorkspaceMutation.mutate()}
                      disabled={
                        !newWorkspace.name || createWorkspaceMutation.isPending
                      }
                    >
                      {createWorkspaceMutation.isPending
                        ? "Creating..."
                        : "Create"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {workspaces.length === 0 ? (
            <Card className="p-12 text-center">
              <Building2 className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-medium">No workspaces yet</h3>
              <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                Create a workspace to collaborate with your team, manage
                artists, or coordinate with your label.
              </p>
              <Button
                className="mt-6"
                onClick={() => setShowCreateDialog(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Workspace
              </Button>
            </Card>
          ) : (
            <div className="grid lg:grid-cols-4 gap-6">
              <div className="lg:col-span-1">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Your Workspaces</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="h-[400px]">
                      <div className="space-y-1 p-2">
                        {workspaces.map((workspace) => (
                          <button
                            key={workspace.id}
                            className={`w-full text-left p-3 rounded-lg transition-colors ${
                              selectedWorkspace?.id === workspace.id
                                ? "bg-primary/10 border border-primary/20"
                                : "hover:bg-muted"
                            }`}
                            onClick={() => {
                              setSelectedWorkspace(workspace);
                              setActiveTab("overview");
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center">
                                {getWorkspaceTypeIcon(workspace.type)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">
                                  {workspace.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {workspace.memberCount} members
                                </p>
                              </div>
                              {getRoleBadge(workspace.role)}
                            </div>
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>

              <div className="lg:col-span-3">
                {selectedWorkspace ? (
                  <Card>
                    <CardHeader className="border-b">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                            {getWorkspaceTypeIcon(selectedWorkspace.type)}
                          </div>
                          <div>
                            <CardTitle className="flex items-center gap-2">
                              {selectedWorkspace.name}
                              {getRoleBadge(selectedWorkspace.role)}
                            </CardTitle>
                            <CardDescription>
                              {selectedWorkspace.description ||
                                `${(selectedWorkspace.type || "project").charAt(0).toUpperCase() + (selectedWorkspace.type || "project").slice(1)} workspace`}
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <PresenceAvatars
                            collaborators={collaborators.filter(
                              (c) => c.status !== "offline",
                            )}
                            maxVisible={3}
                            size="sm"
                          />
                          {canManageMembers && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowSharingDialog(true)}
                              >
                                <Share2 className="h-4 w-4 mr-1" />
                                Share
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => setShowInviteDialog(true)}
                              >
                                <UserPlus className="h-4 w-4 mr-1" />
                                Invite
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <div className="border-b px-4">
                          <TabsList className="bg-transparent h-12">
                            <TabsTrigger
                              value="overview"
                              className="data-[state=active]:bg-transparent"
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              Overview
                            </TabsTrigger>
                            <TabsTrigger
                              value="members"
                              className="data-[state=active]:bg-transparent"
                            >
                              <Users className="h-4 w-4 mr-2" />
                              Members
                            </TabsTrigger>
                            {canManageMembers && (
                              <TabsTrigger
                                value="roles"
                                className="data-[state=active]:bg-transparent"
                              >
                                <Shield className="h-4 w-4 mr-2" />
                                Roles
                              </TabsTrigger>
                            )}
                            <TabsTrigger
                              value="activity"
                              className="data-[state=active]:bg-transparent"
                            >
                              <Activity className="h-4 w-4 mr-2" />
                              Activity
                            </TabsTrigger>
                          </TabsList>
                        </div>

                        <div className="p-4">
                          <TabsContent
                            value="overview"
                            className="m-0 space-y-4"
                          >
                            <div className="grid md:grid-cols-3 gap-4">
                              <Card>
                                <CardContent className="pt-6">
                                  <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                      <Users className="h-5 w-5 text-blue-500" />
                                    </div>
                                    <div>
                                      <p className="text-2xl font-bold">
                                        {formattedMembers.length}
                                      </p>
                                      <p className="text-sm text-muted-foreground">
                                        Total Members
                                      </p>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                              <Card>
                                <CardContent className="pt-6">
                                  <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                                      <Activity className="h-5 w-5 text-green-500" />
                                    </div>
                                    <div>
                                      <p className="text-2xl font-bold">
                                        {
                                          collaborators.filter(
                                            (c) => c.status === "online",
                                          ).length
                                        }
                                      </p>
                                      <p className="text-sm text-muted-foreground">
                                        Online Now
                                      </p>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                              <Card>
                                <CardContent className="pt-6">
                                  <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                                      <Shield className="h-5 w-5 text-purple-500" />
                                    </div>
                                    <div>
                                      <p className="text-2xl font-bold">
                                        {formattedRoles.length}
                                      </p>
                                      <p className="text-sm text-muted-foreground">
                                        Custom Roles
                                      </p>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            </div>

                            <div className="grid md:grid-cols-2 gap-4">
                              <Card>
                                <CardHeader>
                                  <CardTitle className="text-base">
                                    Recent Members
                                  </CardTitle>
                                </CardHeader>
                                <CardContent>
                                  <div className="space-y-3">
                                    {formattedMembers
                                      .slice(0, 5)
                                      .map((member) => (
                                        <div
                                          key={member.id}
                                          className="flex items-center justify-between"
                                        >
                                          <div className="flex items-center gap-2">
                                            <div className="relative">
                                              <Avatar className="h-8 w-8">
                                                <AvatarImage
                                                  src={member.avatar}
                                                />
                                                <AvatarFallback className="text-xs">
                                                  {member.name
                                                    .slice(0, 2)
                                                    .toUpperCase()}
                                                </AvatarFallback>
                                              </Avatar>
                                              {member.isOnline && (
                                                <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-green-500 border border-background" />
                                              )}
                                            </div>
                                            <div>
                                              <p className="text-sm font-medium">
                                                {member.name}
                                              </p>
                                              <p className="text-xs text-muted-foreground">
                                                {member.email}
                                              </p>
                                            </div>
                                          </div>
                                          {getRoleBadge(member.role)}
                                        </div>
                                      ))}
                                  </div>
                                </CardContent>
                              </Card>

                              <Card>
                                <CardHeader>
                                  <CardTitle className="text-base">
                                    Recent Activity
                                  </CardTitle>
                                </CardHeader>
                                <CardContent>
                                  <div className="space-y-3">
                                    {activities.slice(0, 5).map((activity) => (
                                      <div
                                        key={activity.id}
                                        className="flex items-start gap-2"
                                      >
                                        <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                                          <Activity className="h-3 w-3" />
                                        </div>
                                        <div>
                                          <p className="text-sm">
                                            <span className="font-medium">
                                              {activity.userName}
                                            </span>{" "}
                                            {activity.type
                                              .replace(".", " ")
                                              .replace("_", " ")}
                                          </p>
                                          <p className="text-xs text-muted-foreground">
                                            {new Date(
                                              activity.timestamp,
                                            ).toLocaleDateString()}
                                          </p>
                                        </div>
                                      </div>
                                    ))}
                                    {activities.length === 0 && (
                                      <p className="text-sm text-muted-foreground">
                                        No recent activity
                                      </p>
                                    )}
                                  </div>
                                </CardContent>
                              </Card>
                            </div>
                          </TabsContent>

                          <TabsContent value="members" className="m-0">
                            <div className="space-y-3">
                              {formattedMembers.length === 0 ? (
                                <p className="text-center text-muted-foreground py-8">
                                  No members to display
                                </p>
                              ) : (
                                formattedMembers.map((member) => (
                                  <MemberManagementCard
                                    key={member.id}
                                    member={member}
                                    currentUserRole={selectedWorkspace.role}
                                    onRoleChange={(memberId, newRole) => {
                                      updateMemberRoleMutation.mutate({
                                        memberId,
                                        role: newRole,
                                      });
                                    }}
                                    onRemove={(memberId) => {
                                      removeMemberMutation.mutate(memberId);
                                    }}
                                    isLoading={
                                      updateMemberRoleMutation.isPending ||
                                      removeMemberMutation.isPending
                                    }
                                  />
                                ))
                              )}
                            </div>
                          </TabsContent>

                          {canManageMembers && (
                            <TabsContent value="roles" className="m-0">
                              <RolePermissionMatrix
                                roles={formattedRoles}
                                onCreateRole={(role) =>
                                  createRoleMutation.mutate(role)
                                }
                                onUpdateRole={(roleId, updates) =>
                                  updateRoleMutation.mutate({ roleId, updates })
                                }
                                onDeleteRole={(roleId) =>
                                  deleteRoleMutation.mutate(roleId)
                                }
                                isLoading={
                                  createRoleMutation.isPending ||
                                  updateRoleMutation.isPending ||
                                  deleteRoleMutation.isPending
                                }
                                canEdit={canManageMembers}
                              />
                            </TabsContent>
                          )}

                          <TabsContent value="activity" className="m-0">
                            <ActivityFeed
                              activities={activities}
                              onRefresh={() => refetchActivities()}
                              onExportAudit={() => exportAuditMutation.mutate()}
                              canExport={canManageMembers}
                            />
                          </TabsContent>
                        </div>
                      </Tabs>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="p-12 text-center">
                    <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium">Select a workspace</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Choose a workspace from the list to view details
                    </p>
                  </Card>
                )}
              </div>
            </div>
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
                      <SelectItem value="manager">
                        Manager - Manage releases
                      </SelectItem>
                      <SelectItem value="member">
                        Member - Can collaborate
                      </SelectItem>
                      <SelectItem value="viewer">
                        Viewer - Read-only access
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowInviteDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => inviteMemberMutation.mutate()}
                  disabled={!inviteEmail || inviteMemberMutation.isPending}
                >
                  {inviteMemberMutation.isPending
                    ? "Sending..."
                    : "Send Invitation"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {selectedWorkspace && (
            <SharingDialog
              open={showSharingDialog}
              onOpenChange={setShowSharingDialog}
              projectId=""
              projectName={selectedWorkspace.name}
              currentMembers={[]}
              currentLinks={[]}
              workspaceMembers={formattedMembers.map((m) => ({
                id: m.userId,
                name: m.name,
                email: m.email,
                avatar: m.avatar,
              }))}
              onShareWithMembers={async (memberIds, _permission) => {
                workspaceOutcome.projectShared("", memberIds.length);
              }}
              onUpdateMemberPermission={async (memberId, permission) => {
                await updateMemberRoleMutation.mutateAsync({
                  memberId,
                  role: permission,
                });
              }}
              onRemoveMember={async (memberId) => {
                await removeMemberMutation.mutateAsync(memberId);
              }}
              onCreateLink={async (settings) => {
                const link = {
                  id: crypto.randomUUID(),
                  url: `https://maxbooster.app/share/${crypto.randomUUID().slice(0, 8)}`,
                  permission: settings.permission as SharePermission,
                  expiresAt: settings.expirationDays
                    ? new Date(
                        Date.now() + settings.expirationDays * 86400000,
                      ).toISOString()
                    : undefined,
                  password: !!settings.password,
                  accessCount: 0,
                  createdAt: new Date().toISOString(),
                };
                workspaceOutcome.externalLinkGenerated(
                  link.url,
                  link.expiresAt,
                );
                return link;
              }}
              onRevokeLink={async () => {
                workspaceOutcome.shareRevoked("");
              }}
            />
          )}
        </div>
      )}
    </AppLayout>
  );
}
