import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Crown,
  MoreVertical,
  UserMinus,
  Shield,
  Mail,
  Clock,
  Eye,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export interface WorkspaceMemberDetails {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatar?: string;
  role: "owner" | "admin" | "manager" | "member" | "viewer";
  joinedAt: string;
  lastActiveAt?: string;
  status?: "active" | "inactive" | "pending";
  isOnline?: boolean;
}

interface MemberManagementCardProps {
  member: WorkspaceMemberDetails;
  currentUserRole: "owner" | "admin" | "manager" | "member" | "viewer";
  onRoleChange?: (memberId: string, newRole: string) => void;
  onRemove?: (memberId: string) => void;
  onResendInvite?: (memberId: string) => void;
  isLoading?: boolean;
}

const roleConfig = {
  owner: { label: "Owner", color: "bg-yellow-500", icon: Crown },
  admin: { label: "Admin", color: "bg-purple-500", icon: Shield },
  manager: { label: "Manager", color: "bg-blue-500", icon: Shield },
  member: { label: "Member", color: "bg-green-500", icon: null },
  viewer: { label: "Viewer", color: "bg-gray-500", icon: Eye },
};

export function MemberManagementCard({
  member,
  currentUserRole,
  onRoleChange,
  onRemove,
  onResendInvite,
  isLoading = false,
}: MemberManagementCardProps) {
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [selectedRole, setSelectedRole] = useState(member.role);

  const canManageMembers =
    currentUserRole === "owner" || currentUserRole === "admin";
  const canChangeRole = canManageMembers && member.role !== "owner";
  const canRemove = canManageMembers && member.role !== "owner";
  const isOwner = member.role === "owner";

  const handleRoleChange = (newRole: string) => {
    setSelectedRole(newRole as typeof member.role);
    if (onRoleChange) {
      onRoleChange(member.id, newRole);
    }
  };

  const handleRemove = () => {
    if (onRemove) {
      onRemove(member.id);
    }
    setShowRemoveDialog(false);
  };

  const roleInfo = roleConfig[member.role];
  const RoleIcon = roleInfo.icon;

  return (
    <>
      <Card className="hover:border-primary/50 transition-colors">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={member.avatar} />
                  <AvatarFallback className="bg-primary/10">
                    {member.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {member.isOnline && (
                  <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-background" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm truncate">{member.name}</p>
                  <Badge
                    variant="secondary"
                    className={`text-xs text-white ${roleInfo.color}`}
                  >
                    {RoleIcon && <RoleIcon className="h-3 w-3 mr-1" />}
                    {roleInfo.label}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {member.email}
                </p>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>
                    Joined{" "}
                    {formatDistanceToNow(new Date(member.joinedAt), {
                      addSuffix: true,
                    })}
                  </span>
                  {member.lastActiveAt && (
                    <>
                      <span className="text-muted-foreground/50">•</span>
                      <span>
                        Active{" "}
                        {formatDistanceToNow(new Date(member.lastActiveAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {canChangeRole && (
                <Select
                  value={selectedRole}
                  onValueChange={handleRoleChange}
                  disabled={isLoading}
                >
                  <SelectTrigger className="w-28 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              )}

              {canManageMembers && !isOwner && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {member.status === "pending" && onResendInvite && (
                      <DropdownMenuItem
                        onClick={() => onResendInvite(member.id)}
                      >
                        <Mail className="h-4 w-4 mr-2" />
                        Resend Invitation
                      </DropdownMenuItem>
                    )}
                    {canRemove && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setShowRemoveDialog(true)}
                          className="text-destructive focus:text-destructive"
                        >
                          <UserMinus className="h-4 w-4 mr-2" />
                          Remove Member
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{member.name}</strong>{" "}
              from this workspace? They will lose access to all workspace
              resources.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default MemberManagementCard;
