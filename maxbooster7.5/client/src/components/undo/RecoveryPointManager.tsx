import { useState, useEffect, useCallback } from 'react';
import {
  Flag,
  GitBranch,
  Clock,
  RotateCcw,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Settings,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';

export interface RecoveryPoint {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  actionId: string;
  module?: string;
  isAutomatic?: boolean;
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - timestamp;

  if (diff < 60000) {
    return 'Just now';
  } else if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes}m ago`;
  } else if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours}h ago`;
  } else if (diff < 604800000) {
    return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface RecoveryPointCardProps {
  point: RecoveryPoint;
  onRestore: () => void;
  onDelete: () => void;
  disabled?: boolean;
}

function RecoveryPointCard({ point, onRestore, onDelete, disabled }: RecoveryPointCardProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg border transition-colors',
        'hover:bg-muted/50',
        disabled && 'opacity-50 pointer-events-none'
      )}
    >
      <div className="flex flex-col items-center">
        <div
          className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center',
            point.isAutomatic ? 'bg-blue-500/10 text-blue-500' : 'bg-amber-500/10 text-amber-500'
          )}
        >
          {point.isAutomatic ? <RefreshCw className="w-4 h-4" /> : <Flag className="w-4 h-4" />}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{point.name}</span>
          {point.isAutomatic && (
            <Badge variant="secondary" className="text-[10px]">
              Auto
            </Badge>
          )}
        </div>
        {point.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {point.description}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>{formatTimestamp(point.createdAt)}</span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onRestore}
          disabled={disabled}
          className="gap-1 text-xs"
        >
          <RotateCcw className="w-3 h-3" />
          Restore
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          disabled={disabled}
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

export interface RecoveryPointManagerProps {
  className?: string;
  trigger?: React.ReactNode;
  maxPoints?: number;
  autoRecoveryEnabled?: boolean;
  onAutoRecoveryChange?: (enabled: boolean) => void;
}

export function RecoveryPointManager({
  className,
  trigger,
  maxPoints = 20,
  autoRecoveryEnabled = true,
  onAutoRecoveryChange,
}: RecoveryPointManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<RecoveryPoint | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [recoveryPoints, setRecoveryPoints] = useState<RecoveryPoint[]>([]);
  const [autoRecovery, setAutoRecovery] = useState(autoRecoveryEnabled);

  const [newPointName, setNewPointName] = useState('');
  const [newPointDescription, setNewPointDescription] = useState('');

  const loadRecoveryPoints = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest('GET', '/api/undo/restore-points');
      const data = await response.json();
      if (data.success && data.restorePoints) {
        setRecoveryPoints(
          data.restorePoints.map((rp: any) => ({
            id: rp.id,
            name: rp.name,
            description: rp.description,
            createdAt: new Date(rp.createdAt).getTime(),
            actionId: rp.actionId,
            isAutomatic: rp.name?.toLowerCase().includes('auto'),
          }))
        );
      }
    } catch (error) {
      console.error('Failed to load recovery points:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadRecoveryPoints();
    }
  }, [isOpen, loadRecoveryPoints]);

  const handleCreateRecoveryPoint = async () => {
    if (!newPointName.trim()) return;

    setIsLoading(true);
    try {
      const response = await apiRequest('POST', '/api/undo/create-restore-point', {
        name: newPointName.trim(),
        description: newPointDescription.trim() || undefined,
      });
      const data = await response.json();

      if (data.success) {
        const newPoint: RecoveryPoint = {
          id: data.restorePointId,
          name: newPointName.trim(),
          description: newPointDescription.trim() || undefined,
          createdAt: Date.now(),
          actionId: '',
        };
        setRecoveryPoints((prev) => [newPoint, ...prev].slice(0, maxPoints));
        setNewPointName('');
        setNewPointDescription('');
        setIsCreateOpen(false);
      }
    } catch (error) {
      console.error('Failed to create recovery point:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestoreToPoint = async () => {
    if (!selectedPoint) return;

    setIsRestoring(true);
    try {
      const response = await apiRequest('POST', `/api/undo/restore/${selectedPoint.id}`);
      const data = await response.json();
      
      if (data.success) {
        setConfirmRestoreOpen(false);
        setSelectedPoint(null);
      }
    } catch (error) {
      console.error('Failed to restore to point:', error);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleDeletePoint = async () => {
    if (!selectedPoint) return;

    setIsLoading(true);
    try {
      await apiRequest('DELETE', `/api/undo/restore-points/${selectedPoint.id}`);
      setRecoveryPoints((prev) => prev.filter((p) => p.id !== selectedPoint.id));
      setConfirmDeleteOpen(false);
      setSelectedPoint(null);
    } catch (error) {
      console.error('Failed to delete recovery point:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const initiateRestore = (point: RecoveryPoint) => {
    setSelectedPoint(point);
    setConfirmRestoreOpen(true);
  };

  const initiateDelete = (point: RecoveryPoint) => {
    setSelectedPoint(point);
    setConfirmDeleteOpen(true);
  };

  const handleAutoRecoveryChange = (enabled: boolean) => {
    setAutoRecovery(enabled);
    onAutoRecoveryChange?.(enabled);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          {trigger || (
            <Button variant="outline" size="sm" className={cn('gap-2', className)}>
              <GitBranch className="w-4 h-4" />
              Recovery Points
              {recoveryPoints.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {recoveryPoints.length}
                </Badge>
              )}
            </Button>
          )}
        </DialogTrigger>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <GitBranch className="w-5 h-5" />
                Recovery Points
              </DialogTitle>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Settings className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Settings</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <div className="flex items-center justify-between px-2 py-2">
                    <Label htmlFor="auto-recovery" className="text-sm">
                      Auto-recovery
                    </Label>
                    <Switch
                      id="auto-recovery"
                      checked={autoRecovery}
                      onCheckedChange={handleAutoRecoveryChange}
                    />
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <DialogDescription>
              Create recovery points to save your progress. Restore to any point at any time.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-muted-foreground">
                {recoveryPoints.length} recovery point{recoveryPoints.length !== 1 ? 's' : ''}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCreateOpen(true)}
                className="gap-1"
              >
                <Plus className="w-3 h-3" />
                Create Point
              </Button>
            </div>

            <ScrollArea className="h-[350px]">
              {isLoading && recoveryPoints.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : recoveryPoints.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Flag className="w-12 h-12 mb-4 opacity-50" />
                  <p className="text-sm font-medium">No recovery points</p>
                  <p className="text-xs mt-1 text-center max-w-[200px]">
                    Create a recovery point to save your current progress
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsCreateOpen(true)}
                    className="mt-4 gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    Create First Point
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {recoveryPoints.map((point) => (
                    <RecoveryPointCard
                      key={point.id}
                      point={point}
                      onRestore={() => initiateRestore(point)}
                      onDelete={() => initiateDelete(point)}
                      disabled={isRestoring || isLoading}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Create Recovery Point
            </DialogTitle>
            <DialogDescription>
              Save your current progress as a recovery point.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="recovery-point-name">Name</Label>
              <Input
                id="recovery-point-name"
                placeholder="e.g., Before major changes"
                value={newPointName}
                onChange={(e) => setNewPointName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recovery-point-description">Description (optional)</Label>
              <Textarea
                id="recovery-point-description"
                placeholder="Add notes about this recovery point..."
                value={newPointDescription}
                onChange={(e) => setNewPointDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-sm text-muted-foreground">
                Current state will be saved
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateRecoveryPoint}
              disabled={!newPointName.trim() || isLoading}
              className="gap-1"
            >
              {isLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Flag className="w-4 h-4" />
              )}
              Create Point
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmRestoreOpen} onOpenChange={setConfirmRestoreOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Restore to Point
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedPoint && (
                <>
                  <p className="mb-3">
                    Are you sure you want to restore to this point? Actions after this point will be undone.
                  </p>
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="font-medium text-foreground">{selectedPoint.name}</div>
                    <div className="text-xs mt-1 text-muted-foreground">
                      Created {formatTimestamp(selectedPoint.createdAt)}
                    </div>
                  </div>
                  <p className="mt-3 text-amber-600 dark:text-amber-400 text-sm">
                    You can redo these actions later if needed.
                  </p>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRestoring}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestoreToPoint}
              disabled={isRestoring}
              className="gap-1"
            >
              {isRestoring ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4" />
              )}
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-destructive" />
              Delete Recovery Point
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedPoint && (
                <>
                  <p className="mb-3">
                    Are you sure you want to delete this recovery point? This action cannot be undone.
                  </p>
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="font-medium text-foreground">{selectedPoint.name}</div>
                    <div className="text-xs mt-1 text-muted-foreground">
                      Created {formatTimestamp(selectedPoint.createdAt)}
                    </div>
                  </div>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePoint}
              disabled={isLoading}
              className="gap-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default RecoveryPointManager;
