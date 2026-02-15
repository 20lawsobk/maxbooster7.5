import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Edit2, Trash2, Shield, Lock, Eye, FileEdit, Download, CheckCircle, Upload } from 'lucide-react';

export type ResourceType = 'releases' | 'analytics' | 'royalties' | 'social' | 'settings' | 'team' | 'catalog' | 'billing';
export type ActionType = 'create' | 'read' | 'update' | 'delete' | 'approve' | 'publish' | 'export';

export interface Permission {
  resource: ResourceType;
  actions: ActionType[];
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: Permission[];
  isSystem?: boolean;
  isCustom?: boolean;
  priority: number;
}

interface RolePermissionMatrixProps {
  roles: Role[];
  onCreateRole?: (role: Omit<Role, 'id'>) => void;
  onUpdateRole?: (roleId: string, updates: Partial<Role>) => void;
  onDeleteRole?: (roleId: string) => void;
  isLoading?: boolean;
  canEdit?: boolean;
}

const RESOURCES: { key: ResourceType; label: string; icon: React.ElementType }[] = [
  { key: 'releases', label: 'Releases', icon: Upload },
  { key: 'analytics', label: 'Analytics', icon: Eye },
  { key: 'royalties', label: 'Royalties', icon: Download },
  { key: 'social', label: 'Social', icon: FileEdit },
  { key: 'settings', label: 'Settings', icon: Shield },
  { key: 'team', label: 'Team', icon: Shield },
  { key: 'catalog', label: 'Catalog', icon: FileEdit },
  { key: 'billing', label: 'Billing', icon: Lock },
];

const ACTIONS: { key: ActionType; label: string; color: string }[] = [
  { key: 'create', label: 'Create', color: 'bg-green-500/20 text-green-500' },
  { key: 'read', label: 'Read', color: 'bg-blue-500/20 text-blue-500' },
  { key: 'update', label: 'Update', color: 'bg-yellow-500/20 text-yellow-500' },
  { key: 'delete', label: 'Delete', color: 'bg-red-500/20 text-red-500' },
  { key: 'approve', label: 'Approve', color: 'bg-purple-500/20 text-purple-500' },
  { key: 'publish', label: 'Publish', color: 'bg-cyan-500/20 text-cyan-500' },
  { key: 'export', label: 'Export', color: 'bg-orange-500/20 text-orange-500' },
];

export function RolePermissionMatrix({
  roles,
  onCreateRole,
  onUpdateRole,
  onDeleteRole,
  isLoading = false,
  canEdit = true,
}: RolePermissionMatrixProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [newRole, setNewRole] = useState<Omit<Role, 'id'>>({
    name: '',
    description: '',
    permissions: [],
    priority: 50,
  });

  const hasPermission = (role: Role, resource: ResourceType, action: ActionType): boolean => {
    const permission = role.permissions.find(p => p.resource === resource);
    return permission?.actions.includes(action) ?? false;
  };

  const togglePermission = (resource: ResourceType, action: ActionType) => {
    const currentPermissions = editingRole?.permissions || newRole.permissions;
    const existingPerm = currentPermissions.find(p => p.resource === resource);

    let newPermissions: Permission[];
    if (existingPerm) {
      if (existingPerm.actions.includes(action)) {
        const newActions = existingPerm.actions.filter(a => a !== action);
        if (newActions.length === 0) {
          newPermissions = currentPermissions.filter(p => p.resource !== resource);
        } else {
          newPermissions = currentPermissions.map(p =>
            p.resource === resource ? { ...p, actions: newActions } : p
          );
        }
      } else {
        newPermissions = currentPermissions.map(p =>
          p.resource === resource ? { ...p, actions: [...p.actions, action] } : p
        );
      }
    } else {
      newPermissions = [...currentPermissions, { resource, actions: [action] }];
    }

    if (editingRole) {
      setEditingRole({ ...editingRole, permissions: newPermissions });
    } else {
      setNewRole({ ...newRole, permissions: newPermissions });
    }
  };

  const handleCreateRole = () => {
    if (onCreateRole && newRole.name) {
      onCreateRole(newRole);
      setNewRole({ name: '', description: '', permissions: [], priority: 50 });
      setShowCreateDialog(false);
    }
  };

  const handleUpdateRole = () => {
    if (onUpdateRole && editingRole) {
      onUpdateRole(editingRole.id, {
        name: editingRole.name,
        description: editingRole.description,
        permissions: editingRole.permissions,
        priority: editingRole.priority,
      });
      setEditingRole(null);
    }
  };

  const handleDeleteRole = (roleId: string) => {
    if (onDeleteRole) {
      onDeleteRole(roleId);
    }
  };

  const currentPermissions = editingRole?.permissions || newRole.permissions;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Roles & Permissions
            </CardTitle>
            <CardDescription>Manage workspace roles and their permissions</CardDescription>
          </div>
          {canEdit && (
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Role
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="matrix">
          <TabsList>
            <TabsTrigger value="matrix">Permission Matrix</TabsTrigger>
            <TabsTrigger value="roles">Role List</TabsTrigger>
          </TabsList>

          <TabsContent value="matrix">
            <ScrollArea className="w-full">
              <div className="min-w-[800px]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-2 font-medium">Resource</th>
                      {ACTIONS.map(action => (
                        <th key={action.key} className="text-center py-3 px-2 font-medium">
                          {action.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {roles.map(role => (
                      <tr key={role.id} className="border-b last:border-0">
                        <td colSpan={ACTIONS.length + 1} className="py-2">
                          <div className="flex items-center gap-2 mb-2 bg-muted/50 rounded px-2 py-1">
                            <Badge variant={role.isSystem ? 'secondary' : 'default'}>
                              {role.name}
                            </Badge>
                            {role.isSystem && (
                              <Lock className="h-3 w-3 text-muted-foreground" />
                            )}
                            {role.description && (
                              <span className="text-xs text-muted-foreground">
                                {role.description}
                              </span>
                            )}
                          </div>
                          <table className="w-full">
                            <tbody>
                              {RESOURCES.map(resource => {
                                const ResourceIcon = resource.icon;
                                return (
                                  <tr key={resource.key} className="hover:bg-muted/30">
                                    <td className="py-1 px-2 w-32">
                                      <div className="flex items-center gap-2">
                                        <ResourceIcon className="h-4 w-4 text-muted-foreground" />
                                        <span>{resource.label}</span>
                                      </div>
                                    </td>
                                    {ACTIONS.map(action => (
                                      <td key={action.key} className="text-center py-1 px-2">
                                        {hasPermission(role, resource.key, action.key) ? (
                                          <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                                        ) : (
                                          <span className="text-muted-foreground">—</span>
                                        )}
                                      </td>
                                    ))}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="roles">
            <div className="space-y-3">
              {roles.map(role => (
                <Card key={role.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Shield className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{role.name}</p>
                          {role.isSystem && (
                            <Badge variant="outline" className="text-xs">
                              <Lock className="h-3 w-3 mr-1" />
                              System
                            </Badge>
                          )}
                          {role.isCustom && (
                            <Badge variant="secondary" className="text-xs">Custom</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{role.description}</p>
                      </div>
                    </div>

                    {canEdit && !role.isSystem && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingRole(role)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteRole(role.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1">
                    {role.permissions.flatMap(p =>
                      p.actions.map(action => {
                        const actionConfig = ACTIONS.find(a => a.key === action);
                        return (
                          <Badge
                            key={`${p.resource}-${action}`}
                            variant="secondary"
                            className={`text-xs ${actionConfig?.color}`}
                          >
                            {p.resource}:{action}
                          </Badge>
                        );
                      })
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>

      <Dialog open={showCreateDialog || !!editingRole} onOpenChange={(open) => {
        if (!open) {
          setShowCreateDialog(false);
          setEditingRole(null);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRole ? 'Edit Role' : 'Create New Role'}</DialogTitle>
            <DialogDescription>
              Define the permissions for this role
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="roleName">Role Name</Label>
              <Input
                id="roleName"
                value={editingRole?.name || newRole.name}
                onChange={(e) => {
                  if (editingRole) {
                    setEditingRole({ ...editingRole, name: e.target.value });
                  } else {
                    setNewRole({ ...newRole, name: e.target.value });
                  }
                }}
                placeholder="e.g., Content Creator"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="roleDesc">Description</Label>
              <Input
                id="roleDesc"
                value={editingRole?.description || newRole.description}
                onChange={(e) => {
                  if (editingRole) {
                    setEditingRole({ ...editingRole, description: e.target.value });
                  } else {
                    setNewRole({ ...newRole, description: e.target.value });
                  }
                }}
                placeholder="Brief description of this role"
              />
            </div>

            <div className="space-y-3">
              <Label>Permissions</Label>
              {RESOURCES.map(resource => {
                const ResourceIcon = resource.icon;
                return (
                  <div key={resource.key} className="border rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <ResourceIcon className="h-4 w-4" />
                      <span className="font-medium text-sm">{resource.label}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {ACTIONS.map(action => {
                        const isChecked = currentPermissions
                          .find(p => p.resource === resource.key)
                          ?.actions.includes(action.key) ?? false;
                        return (
                          <label
                            key={action.key}
                            className="flex items-center gap-1 cursor-pointer"
                          >
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={() => togglePermission(resource.key, action.key)}
                            />
                            <span className="text-xs">{action.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowCreateDialog(false);
              setEditingRole(null);
            }}>
              Cancel
            </Button>
            <Button
              onClick={editingRole ? handleUpdateRole : handleCreateRole}
              disabled={isLoading || !(editingRole?.name || newRole.name)}
            >
              {editingRole ? 'Update Role' : 'Create Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default RolePermissionMatrix;
