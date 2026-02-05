import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
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
  Clock,
  X,
  Trash2,
  Search,
  ArrowRight,
  RotateCcw,
  History,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface SearchHistoryItem {
  query: string;
  timestamp: string;
  resultCount: number;
  category?: string;
}

interface RecentSearchesProps {
  onSearchClick: (query: string) => void;
  onClear?: () => void;
  maxItems?: number;
  showTimestamp?: boolean;
  showResultCount?: boolean;
  compact?: boolean;
  className?: string;
}

export function RecentSearches({
  onSearchClick,
  onClear,
  maxItems = 10,
  showTimestamp = true,
  showResultCount = true,
  compact = false,
  className,
}: RecentSearchesProps) {
  const [showClearDialog, setShowClearDialog] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: historyData, isLoading } = useQuery({
    queryKey: ['/api/search/history'],
    queryFn: async () => {
      const res = await fetch('/api/search/history', { credentials: 'include' });
      if (!res.ok) return { history: [], totalCount: 0 };
      return res.json();
    },
    staleTime: 30000,
  });

  const clearHistoryMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/search/history', {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to clear history');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/search/history'] });
      setShowClearDialog(false);
      onClear?.();
      toast({
        title: 'History Cleared',
        description: 'Your search history has been cleared.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to clear search history.',
        variant: 'destructive',
      });
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: async (query: string) => {
      const res = await fetch(`/api/search/history/${encodeURIComponent(query)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to remove item');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/search/history'] });
    },
  });

  const history: SearchHistoryItem[] = historyData?.history || [];
  const displayHistory = history.slice(0, maxItems);

  if (compact) {
    return (
      <div className={cn('space-y-2', className)}>
        {isLoading ? (
          <div className="flex gap-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8 w-24 bg-slate-700" />
            ))}
          </div>
        ) : displayHistory.length === 0 ? (
          <p className="text-sm text-slate-500">No recent searches</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {displayHistory.map((item, index) => (
              <Badge
                key={index}
                variant="secondary"
                className="bg-slate-700 text-slate-300 cursor-pointer hover:bg-slate-600 transition-colors group flex items-center gap-1"
                onClick={() => onSearchClick(item.query)}
              >
                <Clock className="h-3 w-3 text-slate-500" />
                {item.query}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeItemMutation.mutate(item.query);
                  }}
                  className="ml-1 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {history.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-slate-500 hover:text-red-400"
                onClick={() => setShowClearDialog(true)}
              >
                Clear all
              </Button>
            )}
          </div>
        )}

        <ClearHistoryDialog
          open={showClearDialog}
          onOpenChange={setShowClearDialog}
          onConfirm={() => clearHistoryMutation.mutate()}
          isLoading={clearHistoryMutation.isPending}
          itemCount={history.length}
        />
      </div>
    );
  }

  return (
    <Card className={cn('bg-slate-800/50 border-slate-700', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <History className="h-5 w-5 text-slate-400" />
            Recent Searches
            {history.length > 0 && (
              <Badge variant="secondary" className="bg-slate-700 text-slate-400">
                {historyData?.totalCount || history.length}
              </Badge>
            )}
          </CardTitle>
          {history.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowClearDialog(true)}
              className="text-slate-400 hover:text-red-400"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 p-2">
                <Skeleton className="h-4 w-4 rounded bg-slate-700" />
                <Skeleton className="h-4 flex-1 bg-slate-700" />
                <Skeleton className="h-4 w-16 bg-slate-700" />
              </div>
            ))}
          </div>
        ) : displayHistory.length === 0 ? (
          <div className="text-center py-8">
            <Search className="h-12 w-12 mx-auto text-slate-600 mb-3" />
            <p className="text-slate-400 mb-2">No recent searches</p>
            <p className="text-sm text-slate-500">
              Your search history will appear here.
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-80">
            <div className="space-y-1">
              {displayHistory.map((item, index) => (
                <SearchHistoryItem
                  key={index}
                  item={item}
                  onClick={() => onSearchClick(item.query)}
                  onRemove={() => removeItemMutation.mutate(item.query)}
                  showTimestamp={showTimestamp}
                  showResultCount={showResultCount}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>

      <ClearHistoryDialog
        open={showClearDialog}
        onOpenChange={setShowClearDialog}
        onConfirm={() => clearHistoryMutation.mutate()}
        isLoading={clearHistoryMutation.isPending}
        itemCount={history.length}
      />
    </Card>
  );
}

function SearchHistoryItem({
  item,
  onClick,
  onRemove,
  showTimestamp,
  showResultCount,
}: {
  item: SearchHistoryItem;
  onClick: () => void;
  onRemove: () => void;
  showTimestamp: boolean;
  showResultCount: boolean;
}) {
  const formattedTime = item.timestamp
    ? formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })
    : '';

  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700/50 transition-colors group">
      <button
        onClick={onClick}
        className="flex-1 flex items-center gap-3 text-left"
      >
        <Clock className="h-4 w-4 text-slate-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate">{item.query}</p>
          {(showTimestamp || showResultCount) && (
            <div className="flex items-center gap-2 mt-0.5">
              {showResultCount && (
                <span className="text-xs text-slate-500">
                  {item.resultCount} result{item.resultCount !== 1 ? 's' : ''}
                </span>
              )}
              {showTimestamp && formattedTime && (
                <span className="text-xs text-slate-600">{formattedTime}</span>
              )}
            </div>
          )}
        </div>
        <ArrowRight className="h-4 w-4 text-slate-600 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

function ClearHistoryDialog({
  open,
  onOpenChange,
  onConfirm,
  isLoading,
  itemCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isLoading: boolean;
  itemCount: number;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-slate-900 border-slate-700">
        <AlertDialogHeader>
          <AlertDialogTitle>Clear Search History</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to clear your search history? This will remove{' '}
            {itemCount} search{itemCount !== 1 ? 'es' : ''} and cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-red-600 hover:bg-red-700"
            disabled={isLoading}
          >
            {isLoading ? (
              <RotateCcw className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Clear History
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function InlineRecentSearches({
  onSearchClick,
  maxItems = 5,
  className,
}: {
  onSearchClick: (query: string) => void;
  maxItems?: number;
  className?: string;
}) {
  const { data: historyData, isLoading } = useQuery({
    queryKey: ['/api/search/history'],
    queryFn: async () => {
      const res = await fetch('/api/search/history', { credentials: 'include' });
      if (!res.ok) return { history: [] };
      return res.json();
    },
    staleTime: 30000,
  });

  const history = historyData?.history?.slice(0, maxItems) || [];

  if (isLoading || history.length === 0) return null;

  return (
    <div className={cn('flex items-center gap-2 flex-wrap', className)}>
      <span className="text-xs text-slate-500">Recent:</span>
      {history.map((item: SearchHistoryItem, index: number) => (
        <button
          key={index}
          onClick={() => onSearchClick(item.query)}
          className="text-xs text-slate-400 hover:text-purple-400 transition-colors"
        >
          {item.query}
        </button>
      ))}
    </div>
  );
}

export default RecentSearches;
