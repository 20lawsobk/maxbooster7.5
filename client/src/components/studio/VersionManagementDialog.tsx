import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow, format } from 'date-fns';
import { 
  History, 
  Plus, 
  Clock, 
  RefreshCw, 
  Trash2, 
  Loader2,
  Save,
  FileStack
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProjectVersion {
  id: string;
  name: string;
  description: string;
  createdAt: number;
}

interface VersionManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  onCreateVersion: (name: string, description: string) => void;
  onLoadVersion: (versionId: string) => void;
  onDeleteVersion: (versionId: string) => void;
  versions: ProjectVersion[];
}

const VERSION_STORAGE_KEY = 'daw_versions';

export function VersionManagementDialog({
  open,
  onOpenChange,
  projectName,
  onCreateVersion,
  onLoadVersion,
  onDeleteVersion,
  versions,
}: VersionManagementDialogProps) {
  const { toast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [newVersionName, setNewVersionName] = useState('');
  const [newVersionDescription, setNewVersionDescription] = useState('');
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setIsCreating(false);
      setNewVersionName('');
      setNewVersionDescription('');
      setSelectedVersionId(null);
    }
  }, [open]);

  const handleCreateVersion = useCallback(() => {
    if (!newVersionName.trim()) {
      toast({
        title: 'Name Required',
        description: 'Please enter a name for this version.',
        variant: 'destructive',
      });
      return;
    }

    onCreateVersion(newVersionName.trim(), newVersionDescription.trim());
    setIsCreating(false);
    setNewVersionName('');
    setNewVersionDescription('');

    toast({
      title: 'Version Created',
      description: `"${newVersionName}" has been saved.`,
    });
  }, [newVersionName, newVersionDescription, onCreateVersion, toast]);

  const handleLoadVersion = useCallback((versionId: string) => {
    setIsLoading(true);
    try {
      onLoadVersion(versionId);
      toast({
        title: 'Version Loaded',
        description: 'Project has been restored to selected version.',
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Load Failed',
        description: 'Unable to load selected version.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [onLoadVersion, onOpenChange, toast]);

  const handleDeleteVersion = useCallback((versionId: string, versionName: string) => {
    onDeleteVersion(versionId);
    if (selectedVersionId === versionId) {
      setSelectedVersionId(null);
    }
    toast({
      title: 'Version Deleted',
      description: `"${versionName}" has been removed.`,
    });
  }, [onDeleteVersion, selectedVersionId, toast]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-[#1e1e22] border-[#333] text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <History className="h-5 w-5 text-purple-500" />
            Version History
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Create and manage snapshots of "{projectName}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {isCreating ? (
            <div className="bg-[#2a2a2e] rounded-lg p-4 border border-[#444] space-y-3">
              <h4 className="text-sm font-medium text-white flex items-center gap-2">
                <Plus className="h-4 w-4 text-emerald-500" />
                Create New Version
              </h4>
              <div className="space-y-2">
                <Label htmlFor="versionName" className="text-gray-300 text-sm">Version Name</Label>
                <Input
                  id="versionName"
                  value={newVersionName}
                  onChange={(e) => setNewVersionName(e.target.value)}
                  placeholder="e.g., Before mixing"
                  className="bg-[#1e1e22] border-[#555] text-white placeholder:text-gray-500"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="versionDesc" className="text-gray-300 text-sm">Description (optional)</Label>
                <Textarea
                  id="versionDesc"
                  value={newVersionDescription}
                  onChange={(e) => setNewVersionDescription(e.target.value)}
                  placeholder="What's in this version?"
                  className="bg-[#1e1e22] border-[#555] text-white placeholder:text-gray-500 resize-none h-16"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsCreating(false)}
                  className="text-gray-400 hover:text-white"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreateVersion}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Save className="h-4 w-4 mr-1" />
                  Save Version
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={() => setIsCreating(true)}
              className="w-full bg-[#2a2a2e] border-[#444] text-white hover:bg-[#333] hover:text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create New Version
            </Button>
          )}

          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-400 flex items-center gap-2">
              <FileStack className="h-4 w-4" />
              Saved Versions ({versions.length})
            </h4>

            {versions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Clock className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p>No saved versions yet</p>
                <p className="text-sm">Create your first version to save a snapshot</p>
              </div>
            ) : (
              <ScrollArea className="h-64">
                <div className="space-y-2 pr-2">
                  {versions.map((version) => (
                    <div
                      key={version.id}
                      className={cn(
                        "bg-[#2a2a2e] rounded-lg p-3 border transition-colors cursor-pointer",
                        selectedVersionId === version.id
                          ? "border-purple-500 bg-purple-500/10"
                          : "border-[#444] hover:border-[#666]"
                      )}
                      onClick={() => setSelectedVersionId(version.id)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-white truncate">{version.name}</p>
                          {version.description && (
                            <p className="text-sm text-gray-400 mt-0.5 line-clamp-2">
                              {version.description}
                            </p>
                          )}
                          <p className="text-xs text-gray-500 mt-1">
                            {format(version.createdAt, 'MMM d, yyyy h:mm a')} 
                            {' '}({formatDistanceToNow(version.createdAt, { addSuffix: true })})
                          </p>
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleLoadVersion(version.id);
                            }}
                            disabled={isLoading}
                            className="h-7 w-7 p-0 text-gray-400 hover:text-emerald-400"
                            title="Load this version"
                          >
                            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteVersion(version.id, version.name);
                            }}
                            className="h-7 w-7 p-0 text-gray-400 hover:text-red-400"
                            title="Delete this version"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>

        <DialogFooter className="pt-4">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-gray-400 hover:text-white"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
