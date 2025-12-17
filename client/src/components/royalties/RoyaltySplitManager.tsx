import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, Edit, Plus, Trash2, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { ProjectRoyaltySplit } from '@shared/schema';

interface RoyaltySplitManagerProps {
  projectId: string;
}

/**
 * TODO: Add function documentation
 */
export function RoyaltySplitManager({ projectId }: RoyaltySplitManagerProps) {
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingSplit, setEditingSplit] = useState<ProjectRoyaltySplit | null>(null);
  const [formData, setFormData] = useState({
    collaboratorId: '',
    splitPercentage: '',
    role: '',
  });

  // Fetch royalty splits for this project
  const { data: splits = [], isLoading } = useQuery<ProjectRoyaltySplit[]>({
    queryKey: ['/api/projects', projectId, 'royalty-splits'],
    enabled: !!projectId,
  });

  // Calculate total percentage
  const totalPercentage = splits.reduce((sum, split) => {
    return sum + parseFloat(split.splitPercentage || '0');
  }, 0);

  const isValid = Math.abs(totalPercentage - 100) < 0.01;

  // Create split mutation
  const createSplitMutation = useMutation({
    mutationFn: async (data: unknown) => {
      const response = await apiRequest('POST', `/api/projects/${projectId}/royalty-splits`, data);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: data.isValid ? 'Collaborator Added' : 'Collaborator Added (Invalid Total)',
        description: data.isValid
          ? 'Royalty split has been created successfully'
          : 'Warning: Total splits do not equal 100%',
        variant: data.isValid ? 'default' : 'destructive',
      });
      setIsAddDialogOpen(false);
      setFormData({ collaboratorId: '', splitPercentage: '', role: '' });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'royalty-splits'] });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create split',
        variant: 'destructive',
      });
    },
  });

  // Update split mutation
  const updateSplitMutation = useMutation({
    mutationFn: async ({ splitId, data }: { splitId: string; data: any }) => {
      const response = await apiRequest(
        'PUT',
        `/api/projects/${projectId}/royalty-splits/${splitId}`,
        data
      );
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: data.isValid ? 'Split Updated' : 'Split Updated (Invalid Total)',
        description: data.isValid
          ? 'Royalty split has been updated successfully'
          : 'Warning: Total splits do not equal 100%',
        variant: data.isValid ? 'default' : 'destructive',
      });
      setIsEditDialogOpen(false);
      setEditingSplit(null);
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'royalty-splits'] });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update split',
        variant: 'destructive',
      });
    },
  });

  // Delete split mutation
  const deleteSplitMutation = useMutation({
    mutationFn: async (splitId: string) => {
      const response = await apiRequest(
        'DELETE',
        `/api/projects/${projectId}/royalty-splits/${splitId}`,
        {}
      );
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Collaborator Removed',
        description: 'Royalty split has been deleted',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'royalty-splits'] });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete split',
        variant: 'destructive',
      });
    },
  });

  const handleAddSplit = () => {
    if (!formData.collaboratorId || !formData.splitPercentage || !formData.role) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all fields',
        variant: 'destructive',
      });
      return;
    }

    const percentage = parseFloat(formData.splitPercentage);
    if (percentage <= 0 || percentage > 100) {
      toast({
        title: 'Invalid Percentage',
        description: 'Percentage must be between 0 and 100',
        variant: 'destructive',
      });
      return;
    }

    createSplitMutation.mutate({
      collaboratorId: formData.collaboratorId,
      splitPercentage: formData.splitPercentage,
      role: formData.role,
    });
  };

  const handleEditSplit = () => {
    if (!editingSplit) return;

    const percentage = parseFloat(formData.splitPercentage);
    if (percentage <= 0 || percentage > 100) {
      toast({
        title: 'Invalid Percentage',
        description: 'Percentage must be between 0 and 100',
        variant: 'destructive',
      });
      return;
    }

    updateSplitMutation.mutate({
      splitId: editingSplit.id,
      data: {
        splitPercentage: formData.splitPercentage,
        role: formData.role,
      },
    });
  };

  const openEditDialog = (split: ProjectRoyaltySplit) => {
    setEditingSplit(split);
    setFormData({
      collaboratorId: split.collaboratorId || '',
      splitPercentage: split.splitPercentage || '',
      role: split.role || '',
    });
    setIsEditDialogOpen(true);
  };

  if (isLoading) {
    return (
      <Card data-testid="split-manager-loading">
        <CardContent className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="split-manager-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            <CardTitle data-testid="split-manager-title">Collaborators & Royalty Splits</CardTitle>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-add-collaborator">
                <Plus className="w-4 h-4 mr-2" />
                Add Collaborator
              </Button>
            </DialogTrigger>
            <DialogContent data-testid="dialog-add-collaborator">
              <DialogHeader>
                <DialogTitle>Add Collaborator</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="collaboratorId">Collaborator ID</Label>
                  <Input
                    id="collaboratorId"
                    data-testid="input-collaborator-id"
                    placeholder="Enter user ID"
                    value={formData.collaboratorId}
                    onChange={(e) => setFormData({ ...formData, collaboratorId: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="role">Role</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(value) => setFormData({ ...formData, role: value })}
                  >
                    <SelectTrigger data-testid="select-role">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="producer">Producer</SelectItem>
                      <SelectItem value="songwriter">Songwriter</SelectItem>
                      <SelectItem value="vocalist">Vocalist</SelectItem>
                      <SelectItem value="engineer">Engineer</SelectItem>
                      <SelectItem value="instrumentalist">Instrumentalist</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="percentage">Split Percentage (%)</Label>
                  <Input
                    id="percentage"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    data-testid="input-percentage"
                    placeholder="e.g., 33.33"
                    value={formData.splitPercentage}
                    onChange={(e) => setFormData({ ...formData, splitPercentage: e.target.value })}
                  />
                </div>
                <Button
                  onClick={handleAddSplit}
                  disabled={createSplitMutation.isPending}
                  data-testid="button-save-collaborator"
                  className="w-full"
                >
                  {createSplitMutation.isPending ? 'Adding...' : 'Add Collaborator'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Validation indicator */}
        <div
          className={`flex items-center gap-2 p-3 rounded-lg ${
            isValid ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'
          }`}
          data-testid={isValid ? 'indicator-valid' : 'indicator-invalid'}
        >
          {isValid ? (
            <>
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">Valid Split: Total = 100%</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-5 h-5" />
              <span className="font-medium">
                Invalid Split: Total = {totalPercentage.toFixed(2)}% (Must be 100%)
              </span>
            </>
          )}
        </div>

        {/* Splits table */}
        {splits.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground" data-testid="text-no-splits">
            <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No collaborators added yet</p>
            <p className="text-sm">Add collaborators to define royalty splits</p>
          </div>
        ) : (
          <Table data-testid="table-splits">
            <TableHeader>
              <TableRow>
                <TableHead>Collaborator</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Split %</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {splits.map((split) => (
                <TableRow key={split.id} data-testid={`row-split-${split.id}`}>
                  <TableCell data-testid={`text-collaborator-${split.id}`}>
                    {split.collaboratorId}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" data-testid={`badge-role-${split.id}`}>
                      {split.role}
                    </Badge>
                  </TableCell>
                  <TableCell data-testid={`text-percentage-${split.id}`}>
                    {parseFloat(split.splitPercentage || '0').toFixed(2)}%
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEditDialog(split)}
                        data-testid={`button-edit-${split.id}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteSplitMutation.mutate(split.id)}
                        disabled={deleteSplitMutation.isPending}
                        data-testid={`button-delete-${split.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Total row */}
        {splits.length > 0 && (
          <div
            className="flex items-center justify-between pt-4 border-t font-bold"
            data-testid="row-total"
          >
            <span>Total</span>
            <span className={totalPercentage !== 100 ? 'text-red-600' : ''}>
              {totalPercentage.toFixed(2)}%
            </span>
          </div>
        )}

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent data-testid="dialog-edit-split">
            <DialogHeader>
              <DialogTitle>Edit Split</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Collaborator ID</Label>
                <Input
                  value={formData.collaboratorId}
                  disabled
                  data-testid="input-edit-collaborator-id"
                />
              </div>
              <div>
                <Label htmlFor="edit-role">Role</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value) => setFormData({ ...formData, role: value })}
                >
                  <SelectTrigger data-testid="select-edit-role">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="producer">Producer</SelectItem>
                    <SelectItem value="songwriter">Songwriter</SelectItem>
                    <SelectItem value="vocalist">Vocalist</SelectItem>
                    <SelectItem value="engineer">Engineer</SelectItem>
                    <SelectItem value="instrumentalist">Instrumentalist</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-percentage">Split Percentage (%)</Label>
                <Input
                  id="edit-percentage"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  data-testid="input-edit-percentage"
                  value={formData.splitPercentage}
                  onChange={(e) => setFormData({ ...formData, splitPercentage: e.target.value })}
                />
              </div>
              <Button
                onClick={handleEditSplit}
                disabled={updateSplitMutation.isPending}
                data-testid="button-save-edit"
                className="w-full"
              >
                {updateSplitMutation.isPending ? 'Updating...' : 'Update Split'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
