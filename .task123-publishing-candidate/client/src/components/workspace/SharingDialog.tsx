// @ts-nocheck
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Share2, Link, Copy, Check, UserPlus, Globe, Lock, Clock, X, Eye, Edit, Users } from "lucide-react";

export type SharePermission = "view" | "comment" | "edit" | "admin";

export interface ShareMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatar?: string;
  permission: SharePermission;
  addedAt: string;
}

export interface ShareLink {
  id: string;
  url: string;
  permission: SharePermission;
  expiresAt?: string;
  password?: boolean;
  accessCount: number;
  createdAt: string;
}

export interface ShareSettings {
  allowDownload: boolean;
  allowComments: boolean;
  requireSignIn: boolean;
  expirationDays?: number;
  password?: string;
}

interface SharingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  currentMembers: ShareMember[];
  currentLinks: ShareLink[];
  workspaceMembers: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  }[];
  onShareWithMembers: (
    memberIds: string[],
    permission: SharePermission,
  ) => Promise<void>;
  onUpdateMemberPermission: (
    shareId: string,
    permission: SharePermission,
  ) => Promise<void>;
  onRemoveMember: (shareId: string) => Promise<void>;
  onCreateLink: (
    settings: ShareSettings & { permission: SharePermission },
  ) => Promise<ShareLink>;
  onRevokeLink: (linkId: string) => Promise<void>;
  isLoading?: boolean;
}

const permissionConfig: Record<
  SharePermission,
  { icon: React.ElementType; label: string; description: string }
> = {
  view: { icon: Eye, label: "View", description: "Can only view" },
  comment: {
    icon: Edit,
    label: "Comment",
    description: "Can view and comment",
  },
  edit: {
    icon: Edit,
    label: "Edit",
    description: "Can view, comment, and edit",
  },
  admin: {
    icon: Users,
    label: "Admin",
    description: "Full access including sharing",
  },
};

export function SharingDialog({
  open,
  onOpenChange,
  _projectId,
  projectName,
  currentMembers,
  currentLinks,
  workspaceMembers,
  onShareWithMembers,
  onUpdateMemberPermission,
  onRemoveMember,
  onCreateLink,
  onRevokeLink,
  isLoading = false,
}: SharingDialogProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("members");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [sharePermission, setSharePermission] =
    useState<SharePermission>("view");
  const [copied, setCopied] = useState<string | null>(null);

  const [linkSettings, setLinkSettings] = useState<ShareSettings>({
    allowDownload: true,
    allowComments: true,
    requireSignIn: false,
    expirationDays: 7,
  });
  const [linkPermission, setLinkPermission] = useState<SharePermission>("view");

  const availableMembers = workspaceMembers.filter(
    (m) => !currentMembers.some((cm) => cm.userId === m.id),
  );

  const filteredMembers = availableMembers.filter(
    (m) =>
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.email.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleCopyLink = (url: string, linkId: string) => {
    navigator.clipboard.writeText(url);
    setCopied(linkId);
    toast({ title: "Link copied to clipboard" });
    setTimeout(() => setCopied(null), 2000);
  };

  const handleShareWithMembers = async () => {
    if (selectedMembers.length === 0) return;
    await onShareWithMembers(selectedMembers, sharePermission);
    setSelectedMembers([]);
    setSearchQuery("");
    toast({ title: "Project shared successfully" });
  };

  const handleCreateLink = async () => {
    const link = await onCreateLink({
      ...linkSettings,
      permission: linkPermission,
    });
    handleCopyLink(link.url, link.id);
    toast({ title: "Share link created" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Share "{projectName}"
          </DialogTitle>
          <DialogDescription>
            Share this project with team members or create a public link
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="members">
              <Users className="h-4 w-4 mr-2" />
              Members
            </TabsTrigger>
            <TabsTrigger value="links">
              <Link className="h-4 w-4 mr-2" />
              Share Links
            </TabsTrigger>
          </TabsList>

          <TabsContent value="members" className="space-y-4">
            <div className="space-y-2">
              <Label>Add team members</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <Select
                  value={sharePermission}
                  onValueChange={(v) =>
                    setSharePermission(v as SharePermission)
                  }
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(permissionConfig).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <config.icon className="h-4 w-4" />
                          {config.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {searchQuery && filteredMembers.length > 0 && (
                <div className="border rounded-md max-h-32 overflow-y-auto">
                  {filteredMembers.map((member) => (
                    <button
                      key={member.id}
                      className="w-full flex items-center gap-2 p-2 hover:bg-muted text-left"
                      onClick={() => {
                        setSelectedMembers((prev) =>
                          prev.includes(member.id)
                            ? prev.filter((id) => id !== member.id)
                            : [...prev, member.id],
                        );
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedMembers.includes(member.id)}
                        readOnly
                        className="rounded"
                      />
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={member.avatar} />
                        <AvatarFallback className="text-xs">
                          {member.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {member.name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {member.email}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {selectedMembers.length > 0 && (
                <Button
                  onClick={handleShareWithMembers}
                  disabled={isLoading}
                  className="w-full"
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Share with {selectedMembers.length} member
                  {selectedMembers.length > 1 ? "s" : ""}
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <Label>People with access</Label>
              <ScrollArea className="h-48">
                <div className="space-y-2">
                  {currentMembers.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Not shared with anyone yet
                    </p>
                  ) : (
                    currentMembers.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-2 rounded-lg hover:bg-muted"
                      >
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={member.avatar} />
                            <AvatarFallback className="text-xs">
                              {member.name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">{member.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {member.email}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Select
                            value={member.permission}
                            onValueChange={(v) =>
                              onUpdateMemberPermission(
                                member.id,
                                v as SharePermission,
                              )
                            }
                          >
                            <SelectTrigger className="w-24 h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(permissionConfig).map(
                                ([key, config]) => (
                                  <SelectItem key={key} value={key}>
                                    {config.label}
                                  </SelectItem>
                                ),
                              )}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => onRemoveMember(member.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="links" className="space-y-4">
            <div className="space-y-3">
              <Label>Create share link</Label>
              <div className="space-y-3 p-3 border rounded-lg">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Permission</Label>
                  <Select
                    value={linkPermission}
                    onValueChange={(v) =>
                      setLinkPermission(v as SharePermission)
                    }
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(permissionConfig).map(([key, config]) => (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            <config.icon className="h-4 w-4" />
                            {config.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm">Require sign in</Label>
                    <p className="text-xs text-muted-foreground">
                      Users must be logged in
                    </p>
                  </div>
                  <Switch
                    checked={linkSettings.requireSignIn}
                    onCheckedChange={(checked) =>
                      setLinkSettings((prev) => ({
                        ...prev,
                        requireSignIn: checked,
                      }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm">Allow downloads</Label>
                    <p className="text-xs text-muted-foreground">
                      Users can download files
                    </p>
                  </div>
                  <Switch
                    checked={linkSettings.allowDownload}
                    onCheckedChange={(checked) =>
                      setLinkSettings((prev) => ({
                        ...prev,
                        allowDownload: checked,
                      }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-sm">Expires in</Label>
                  <Select
                    value={String(linkSettings.expirationDays || "never")}
                    onValueChange={(v) =>
                      setLinkSettings((prev) => ({
                        ...prev,
                        expirationDays: v === "never" ? undefined : parseInt(v),
                      }))
                    }
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 day</SelectItem>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                      <SelectItem value="never">Never</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={handleCreateLink}
                  disabled={isLoading}
                  className="w-full"
                >
                  <Link className="h-4 w-4 mr-2" />
                  Create Link
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Active links</Label>
              <ScrollArea className="h-40">
                <div className="space-y-2">
                  {currentLinks.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No active share links
                    </p>
                  ) : (
                    currentLinks.map((link) => (
                      <div
                        key={link.id}
                        className="flex items-center justify-between p-2 rounded-lg border"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {link.password ? (
                            <Lock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          ) : (
                            <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate max-w-[200px]">
                              {link.url}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Badge variant="secondary" className="text-xs">
                                {permissionConfig[link.permission].label}
                              </Badge>
                              {link.expiresAt && (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  Expires{" "}
                                  {new Date(
                                    link.expiresAt,
                                  ).toLocaleDateString()}
                                </span>
                              )}
                              <span>{link.accessCount} views</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleCopyLink(link.url, link.id)}
                          >
                            {copied === link.id ? (
                              <Check className="h-4 w-4 text-green-500" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => onRevokeLink(link.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export default SharingDialog;
