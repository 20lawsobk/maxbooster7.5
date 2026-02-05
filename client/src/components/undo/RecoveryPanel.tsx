import { useState, useMemo } from 'react';
import {
  Trash2,
  RotateCcw,
  Clock,
  Search,
  Filter,
  FileText,
  Music,
  Image,
  Folder,
  Settings,
  Users,
  Calendar,
  X,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { useUndoHistory, useUndo } from '@/contexts/UndoContext';
import { UndoableAction, getActionLabel } from '@/lib/undo/types';

export interface DeletedItem {
  id: string;
  type: 'file' | 'track' | 'post' | 'release' | 'settings' | 'collaborator' | 'event' | 'other';
  name: string;
  description?: string;
  deletedAt: number;
  module: string;
  metadata?: Record<string, unknown>;
  action: UndoableAction;
}

function getItemIcon(type: DeletedItem['type']) {
  switch (type) {
    case 'file':
      return FileText;
    case 'track':
      return Music;
    case 'post':
      return Image;
    case 'release':
      return Folder;
    case 'settings':
      return Settings;
    case 'collaborator':
      return Users;
    case 'event':
      return Calendar;
    default:
      return FileText;
  }
}

function formatTimeSince(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60000) {
    return 'Just now';
  } else if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes}m ago`;
  } else if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours}h ago`;
  } else if (diff < 604800000) {
    const days = Math.floor(diff / 86400000);
    return `${days}d ago`;
  } else {
    return new Date(timestamp).toLocaleDateString();
  }
}

interface DeletedItemCardProps {
  item: DeletedItem;
  isSelected: boolean;
  onSelect: (selected: boolean) => void;
  onRecover: () => void;
}

function DeletedItemCard({ item, isSelected, onSelect, onRecover }: DeletedItemCardProps) {
  const Icon = getItemIcon(item.type);

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg border transition-colors',
        'hover:bg-muted/50',
        isSelected && 'bg-primary/5 border-primary/30'
      )}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={(checked) => onSelect(checked === true)}
        className="mt-1"
      />
      <div className={cn(
        'p-2 rounded-md',
        item.type === 'file' && 'bg-blue-500/10 text-blue-500',
        item.type === 'track' && 'bg-green-500/10 text-green-500',
        item.type === 'post' && 'bg-purple-500/10 text-purple-500',
        item.type === 'release' && 'bg-amber-500/10 text-amber-500',
        item.type === 'settings' && 'bg-gray-500/10 text-gray-500',
        item.type === 'collaborator' && 'bg-pink-500/10 text-pink-500',
        item.type === 'event' && 'bg-cyan-500/10 text-cyan-500',
        item.type === 'other' && 'bg-muted text-muted-foreground'
      )}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{item.name}</span>
          <Badge variant="outline" className="text-[10px] h-4">
            {item.type}
          </Badge>
        </div>
        {item.description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {item.description}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>{formatTimeSince(item.deletedAt)}</span>
          <span className="text-muted-foreground/50">•</span>
          <span>{item.module}</span>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onRecover}
        className="gap-1 text-xs"
      >
        <RotateCcw className="w-3 h-3" />
        Recover
      </Button>
    </div>
  );
}

export interface RecoveryPanelProps {
  className?: string;
  maxItems?: number;
}

export function RecoveryPanel({ className, maxItems = 100 }: RecoveryPanelProps) {
  const { history } = useUndoHistory();
  const { undo } = useUndo();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isRecovering, setIsRecovering] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [itemToRecover, setItemToRecover] = useState<DeletedItem | null>(null);
  const [showExpanded, setShowExpanded] = useState(false);

  const deletedItems: DeletedItem[] = useMemo(() => {
    return history
      .filter((action) => 
        ['delete', 'file_delete', 'post_delete', 'collaboration_remove'].includes(action.type) &&
        !action.isUndone
      )
      .map((action) => {
        let type: DeletedItem['type'] = 'other';
        if (action.type === 'file_delete') type = 'file';
        else if (action.type === 'post_delete') type = 'post';
        else if (action.type === 'collaboration_remove') type = 'collaborator';
        else if (action.metadata.entityType) {
          const entityType = action.metadata.entityType.toLowerCase();
          if (entityType.includes('track')) type = 'track';
          else if (entityType.includes('release')) type = 'release';
          else if (entityType.includes('setting')) type = 'settings';
          else if (entityType.includes('event')) type = 'event';
        }

        return {
          id: action.id,
          type,
          name: action.metadata.description || getActionLabel(action),
          description: action.metadata.entityType,
          deletedAt: action.metadata.timestamp,
          module: action.metadata.module,
          metadata: action.metadata.customData as Record<string, unknown> | undefined,
          action,
        };
      })
      .slice(-maxItems)
      .reverse();
  }, [history, maxItems]);

  const filteredItems = useMemo(() => {
    let filtered = deletedItems;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.name.toLowerCase().includes(term) ||
          item.description?.toLowerCase().includes(term) ||
          item.module.toLowerCase().includes(term)
      );
    }

    if (typeFilter !== 'all') {
      filtered = filtered.filter((item) => item.type === typeFilter);
    }

    return filtered;
  }, [deletedItems, searchTerm, typeFilter]);

  const displayedItems = showExpanded ? filteredItems : filteredItems.slice(0, 10);

  const handleSelectItem = (id: string, selected: boolean) => {
    const newSelected = new Set(selectedItems);
    if (selected) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedItems(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedItems.size === filteredItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredItems.map((item) => item.id)));
    }
  };

  const handleRecoverSingle = async (item: DeletedItem) => {
    setIsRecovering(true);
    try {
      const actionIndex = history.findIndex((a) => a.id === item.id);
      if (actionIndex !== -1) {
        await undo();
      }
    } finally {
      setIsRecovering(false);
      setConfirmDialogOpen(false);
      setItemToRecover(null);
    }
  };

  const handleRecoverSelected = async () => {
    if (selectedItems.size === 0) return;

    setIsRecovering(true);
    try {
      const itemsToRecover = filteredItems.filter((item) => selectedItems.has(item.id));
      for (const item of itemsToRecover) {
        const actionIndex = history.findIndex((a) => a.id === item.id);
        if (actionIndex !== -1) {
          await undo();
        }
      }
      setSelectedItems(new Set());
    } finally {
      setIsRecovering(false);
    }
  };

  const initiateRecover = (item: DeletedItem) => {
    setItemToRecover(item);
    setConfirmDialogOpen(true);
  };

  return (
    <>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className={cn('gap-2', className)}>
            <Trash2 className="w-4 h-4" />
            Recovery
            {deletedItems.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {deletedItems.length}
              </Badge>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              Deleted Items Recovery
            </SheetTitle>
            <SheetDescription>
              Recover deleted items. Items are kept for 30 days before permanent deletion.
            </SheetDescription>
          </SheetHeader>

          <div className="flex items-center gap-2 mt-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search deleted items..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-8"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[110px] h-8">
                <Filter className="w-3 h-3 mr-1" />
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="file">Files</SelectItem>
                <SelectItem value="track">Tracks</SelectItem>
                <SelectItem value="post">Posts</SelectItem>
                <SelectItem value="release">Releases</SelectItem>
                <SelectItem value="settings">Settings</SelectItem>
                <SelectItem value="collaborator">Collaborators</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {selectedItems.size > 0 && (
            <div className="flex items-center justify-between py-2 px-3 bg-muted rounded-lg mb-4">
              <span className="text-sm">
                {selectedItems.size} item{selectedItems.size > 1 ? 's' : ''} selected
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedItems(new Set())}
                >
                  <X className="w-3 h-3 mr-1" />
                  Clear
                </Button>
                <Button
                  size="sm"
                  onClick={handleRecoverSelected}
                  disabled={isRecovering}
                  className="gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  Recover Selected
                </Button>
              </div>
            </div>
          )}

          <ScrollArea className="h-[calc(100vh-280px)]">
            {filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Trash2 className="w-12 h-12 mb-4 opacity-50" />
                <p className="text-sm font-medium">No deleted items</p>
                <p className="text-xs mt-1">Items you delete will appear here for recovery</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between py-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSelectAll}
                    className="text-xs"
                  >
                    {selectedItems.size === filteredItems.length ? 'Deselect All' : 'Select All'}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {filteredItems.length} item{filteredItems.length > 1 ? 's' : ''}
                  </span>
                </div>

                {displayedItems.map((item) => (
                  <DeletedItemCard
                    key={item.id}
                    item={item}
                    isSelected={selectedItems.has(item.id)}
                    onSelect={(selected) => handleSelectItem(item.id, selected)}
                    onRecover={() => initiateRecover(item)}
                  />
                ))}

                {filteredItems.length > 10 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowExpanded(!showExpanded)}
                    className="w-full gap-1 text-muted-foreground"
                  >
                    {showExpanded ? (
                      <>
                        <ChevronUp className="w-4 h-4" />
                        Show Less
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4" />
                        Show {filteredItems.length - 10} More
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5" />
              Recover Item
            </AlertDialogTitle>
            <AlertDialogDescription>
              {itemToRecover && (
                <>
                  <p>Are you sure you want to recover this item?</p>
                  <div className="mt-3 p-3 bg-muted rounded-lg">
                    <div className="font-medium text-foreground">{itemToRecover.name}</div>
                    <div className="text-xs mt-1 text-muted-foreground">
                      Deleted {formatTimeSince(itemToRecover.deletedAt)}
                    </div>
                  </div>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRecovering}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => itemToRecover && handleRecoverSingle(itemToRecover)}
              disabled={isRecovering}
              className="gap-1"
            >
              {isRecovering ? (
                <span className="animate-spin">⏳</span>
              ) : (
                <RotateCcw className="w-4 h-4" />
              )}
              Recover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default RecoveryPanel;
