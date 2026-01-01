import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Save,
  History,
  GitBranch,
  Camera,
  Trash2,
  RotateCcw,
  Clock,
  FileText,
  Plus,
  Play,
  Pause,
  Star,
  StarOff,
  MoreVertical,
  Copy,
  Check,
  AlertTriangle,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

interface Version {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
  isAutoSave: boolean;
  isFavorite: boolean;
  trackCount: number;
  duration: number;
}

interface Snapshot {
  id: string;
  name: string;
  timestamp: number;
  createdAt: Date;
  type: 'mixer' | 'arrangement' | 'full';
}

interface ScratchPad {
  id: string;
  name: string;
  notes: string;
  audioUrl?: string;
  createdAt: Date;
  duration?: number;
}

interface SessionManagerProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  versions?: Version[];
  snapshots?: Snapshot[];
  scratchPads?: ScratchPad[];
  onSaveVersion: (name: string, description: string) => void;
  onLoadVersion: (versionId: string) => void;
  onDeleteVersion: (versionId: string) => void;
  onCreateSnapshot: (name: string, type: Snapshot['type']) => void;
  onLoadSnapshot: (snapshotId: string) => void;
  onCreateScratchPad: (name: string, notes: string) => void;
  onDeleteScratchPad: (padId: string) => void;
}

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatDate = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
};

export function SessionManager({
  isOpen,
  onClose,
  projectId,
  versions = [],
  snapshots = [],
  scratchPads = [],
  onSaveVersion,
  onLoadVersion,
  onDeleteVersion,
  onCreateSnapshot,
  onLoadSnapshot,
  onCreateScratchPad,
  onDeleteScratchPad,
}: SessionManagerProps) {
  const [newVersionName, setNewVersionName] = useState('');
  const [newVersionDescription, setNewVersionDescription] = useState('');
  const [newSnapshotName, setNewSnapshotName] = useState('');
  const [newSnapshotType, setNewSnapshotType] = useState<Snapshot['type']>('full');
  const [newPadName, setNewPadName] = useState('');
  const [newPadNotes, setNewPadNotes] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'version' | 'scratchpad'; id: string } | null>(null);

  const handleSaveVersion = useCallback(() => {
    if (!newVersionName.trim()) return;
    onSaveVersion(newVersionName, newVersionDescription);
    setNewVersionName('');
    setNewVersionDescription('');
  }, [newVersionName, newVersionDescription, onSaveVersion]);

  const handleCreateSnapshot = useCallback(() => {
    if (!newSnapshotName.trim()) return;
    onCreateSnapshot(newSnapshotName, newSnapshotType);
    setNewSnapshotName('');
  }, [newSnapshotName, newSnapshotType, onCreateSnapshot]);

  const handleCreateScratchPad = useCallback(() => {
    if (!newPadName.trim()) return;
    onCreateScratchPad(newPadName, newPadNotes);
    setNewPadName('');
    setNewPadNotes('');
  }, [newPadName, newPadNotes, onCreateScratchPad]);

  const handleConfirmDelete = useCallback(() => {
    if (!confirmDelete) return;
    if (confirmDelete.type === 'version') {
      onDeleteVersion(confirmDelete.id);
    } else {
      onDeleteScratchPad(confirmDelete.id);
    }
    setConfirmDelete(null);
  }, [confirmDelete, onDeleteVersion, onDeleteScratchPad]);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-4xl max-h-[90vh] bg-zinc-900 border-zinc-700">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <History className="h-5 w-5 text-purple-400" />
              Session Manager
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="versions" className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-zinc-800">
              <TabsTrigger value="versions" className="data-[state=active]:bg-purple-600">
                <GitBranch className="h-4 w-4 mr-2" />
                Versions
              </TabsTrigger>
              <TabsTrigger value="snapshots" className="data-[state=active]:bg-purple-600">
                <Camera className="h-4 w-4 mr-2" />
                Snapshots
              </TabsTrigger>
              <TabsTrigger value="scratchpad" className="data-[state=active]:bg-purple-600">
                <FileText className="h-4 w-4 mr-2" />
                Scratch Pad
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="h-[500px] mt-4">
              <TabsContent value="versions" className="space-y-4 px-1">
                <div className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700 space-y-3">
                  <h4 className="text-sm font-medium text-white flex items-center gap-2">
                    <Save className="h-4 w-4 text-purple-400" />
                    Save New Version
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-zinc-400 text-xs">Version Name</Label>
                      <Input
                        value={newVersionName}
                        onChange={(e) => setNewVersionName(e.target.value)}
                        placeholder="e.g., Verse 2 complete"
                        className="bg-zinc-800 border-zinc-600 text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-zinc-400 text-xs">Description (optional)</Label>
                      <Input
                        value={newVersionDescription}
                        onChange={(e) => setNewVersionDescription(e.target.value)}
                        placeholder="What changed?"
                        className="bg-zinc-800 border-zinc-600 text-white"
                      />
                    </div>
                  </div>
                  <Button 
                    onClick={handleSaveVersion} 
                    disabled={!newVersionName.trim()}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Save Version
                  </Button>
                </div>

                <Separator className="bg-zinc-700" />

                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-zinc-400">Version History</h4>
                  {versions.length === 0 ? (
                    <div className="p-8 text-center text-zinc-500">
                      <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No versions saved yet</p>
                      <p className="text-xs mt-1">Save your first version to enable rollback</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {versions.map((version) => (
                        <div
                          key={version.id}
                          className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700 hover:border-zinc-600 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-lg ${version.isAutoSave ? 'bg-zinc-700' : 'bg-purple-600/20'}`}>
                                {version.isAutoSave ? (
                                  <Clock className="h-4 w-4 text-zinc-400" />
                                ) : (
                                  <GitBranch className="h-4 w-4 text-purple-400" />
                                )}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-white font-medium">{version.name}</span>
                                  {version.isAutoSave && (
                                    <Badge variant="outline" className="text-xs bg-zinc-700 border-zinc-600 text-zinc-400">
                                      Auto-save
                                    </Badge>
                                  )}
                                  {version.isFavorite && (
                                    <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
                                  )}
                                </div>
                                {version.description && (
                                  <p className="text-xs text-zinc-400 mt-0.5">{version.description}</p>
                                )}
                                <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                                  <span>{formatDate(version.createdAt)}</span>
                                  <span>{version.trackCount} tracks</span>
                                  <span>{formatDuration(version.duration)}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onLoadVersion(version.id)}
                                className="bg-zinc-800 border-zinc-600 text-zinc-300 hover:bg-zinc-700"
                              >
                                <RotateCcw className="h-3 w-3 mr-1" />
                                Load
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="text-zinc-400">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="bg-zinc-800 border-zinc-700">
                                  <DropdownMenuItem className="text-zinc-300 hover:bg-zinc-700">
                                    <Star className="h-4 w-4 mr-2" />
                                    {version.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="text-zinc-300 hover:bg-zinc-700">
                                    <Copy className="h-4 w-4 mr-2" />
                                    Create branch from here
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator className="bg-zinc-700" />
                                  <DropdownMenuItem 
                                    className="text-red-400 hover:bg-red-900/20"
                                    onClick={() => setConfirmDelete({ type: 'version', id: version.id })}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete version
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="snapshots" className="space-y-4 px-1">
                <div className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700 space-y-3">
                  <h4 className="text-sm font-medium text-white flex items-center gap-2">
                    <Camera className="h-4 w-4 text-purple-400" />
                    Create Snapshot
                  </h4>
                  <p className="text-xs text-zinc-400">
                    Snapshots capture specific aspects of your session for quick recall.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-zinc-400 text-xs">Snapshot Name</Label>
                      <Input
                        value={newSnapshotName}
                        onChange={(e) => setNewSnapshotName(e.target.value)}
                        placeholder="e.g., Verse mix v1"
                        className="bg-zinc-800 border-zinc-600 text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-zinc-400 text-xs">Snapshot Type</Label>
                      <div className="flex gap-2">
                        {(['mixer', 'arrangement', 'full'] as const).map((type) => (
                          <Button
                            key={type}
                            variant="outline"
                            size="sm"
                            className={`capitalize flex-1 ${
                              newSnapshotType === type 
                                ? 'bg-purple-600 border-purple-500 text-white' 
                                : 'bg-zinc-800 border-zinc-600 text-zinc-300'
                            }`}
                            onClick={() => setNewSnapshotType(type)}
                          >
                            {type}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <Button 
                    onClick={handleCreateSnapshot}
                    disabled={!newSnapshotName.trim()}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    Create Snapshot
                  </Button>
                </div>

                <Separator className="bg-zinc-700" />

                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-zinc-400">Saved Snapshots</h4>
                  {snapshots.length === 0 ? (
                    <div className="p-8 text-center text-zinc-500">
                      <Camera className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No snapshots created yet</p>
                      <p className="text-xs mt-1">Snapshots help you compare different mix settings</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {snapshots.map((snapshot) => (
                        <div
                          key={snapshot.id}
                          className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700 hover:border-zinc-600 cursor-pointer transition-colors"
                          onClick={() => onLoadSnapshot(snapshot.id)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Camera className="h-4 w-4 text-purple-400" />
                              <span className="text-white text-sm font-medium">{snapshot.name}</span>
                            </div>
                            <Badge variant="outline" className="text-xs bg-zinc-700 border-zinc-600 text-zinc-400 capitalize">
                              {snapshot.type}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-2 text-xs text-zinc-500">
                            <Clock className="h-3 w-3" />
                            <span>{formatDate(snapshot.createdAt)}</span>
                            <span>at {formatDuration(snapshot.timestamp)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="scratchpad" className="space-y-4 px-1">
                <div className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700 space-y-3">
                  <h4 className="text-sm font-medium text-white flex items-center gap-2">
                    <FileText className="h-4 w-4 text-purple-400" />
                    New Scratch Pad
                  </h4>
                  <p className="text-xs text-zinc-400">
                    Jot down ideas, lyrics, or notes for your session.
                  </p>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label className="text-zinc-400 text-xs">Title</Label>
                      <Input
                        value={newPadName}
                        onChange={(e) => setNewPadName(e.target.value)}
                        placeholder="e.g., Verse 2 lyrics"
                        className="bg-zinc-800 border-zinc-600 text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-zinc-400 text-xs">Notes</Label>
                      <Textarea
                        value={newPadNotes}
                        onChange={(e) => setNewPadNotes(e.target.value)}
                        placeholder="Type your ideas here..."
                        className="bg-zinc-800 border-zinc-600 text-white min-h-[100px]"
                      />
                    </div>
                  </div>
                  <Button 
                    onClick={handleCreateScratchPad}
                    disabled={!newPadName.trim()}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create Scratch Pad
                  </Button>
                </div>

                <Separator className="bg-zinc-700" />

                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-zinc-400">Saved Notes</h4>
                  {scratchPads.length === 0 ? (
                    <div className="p-8 text-center text-zinc-500">
                      <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No scratch pads yet</p>
                      <p className="text-xs mt-1">Create notes to capture your ideas</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {scratchPads.map((pad) => (
                        <div
                          key={pad.id}
                          className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-white font-medium">{pad.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-zinc-500">{formatDate(pad.createdAt)}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-400 hover:bg-red-900/20 h-6 w-6 p-0"
                                onClick={() => setConfirmDelete({ type: 'scratchpad', id: pad.id })}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          <p className="text-sm text-zinc-300 whitespace-pre-wrap">{pad.notes}</p>
                          {pad.audioUrl && (
                            <div className="flex items-center gap-2 mt-2 p-2 bg-zinc-900 rounded">
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-purple-400">
                                <Play className="h-3 w-3" />
                              </Button>
                              <div className="flex-1 h-1 bg-zinc-700 rounded-full">
                                <div className="w-1/3 h-full bg-purple-500 rounded-full" />
                              </div>
                              <span className="text-xs text-zinc-500">
                                {pad.duration ? formatDuration(pad.duration) : '0:00'}
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              Confirm Delete
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Are you sure you want to delete this {confirmDelete?.type}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 border-zinc-600 text-zinc-300 hover:bg-zinc-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
