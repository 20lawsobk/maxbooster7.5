import { useState, useEffect } from 'react';
import {
  Database,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronRight,
  HardDrive,
  Clock,
  BarChart3,
  FileText,
  User,
  Layout,
  FolderOpen,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { offlineCache, CacheEntry, CacheCategory } from '@/lib/offline';
import { formatDistanceToNow } from 'date-fns';

interface CacheStats {
  totalEntries: number;
  totalSize: number;
  byCategory: Record<CacheCategory, { count: number; size: number }>;
  hitRate: number;
}

interface OfflineDataViewerProps {
  className?: string;
  maxCacheSize?: number;
  showDetails?: boolean;
}

const categoryConfig: Record<CacheCategory, { icon: typeof Database; label: string; color: string }> = {
  analytics: { icon: BarChart3, label: 'Analytics', color: 'text-blue-500' },
  dashboard: { icon: Layout, label: 'Dashboard', color: 'text-purple-500' },
  ui: { icon: FileText, label: 'UI Data', color: 'text-green-500' },
  user: { icon: User, label: 'User Data', color: 'text-orange-500' },
  general: { icon: FolderOpen, label: 'General', color: 'text-gray-500' },
};

export function OfflineDataViewer({
  className,
  maxCacheSize = 50 * 1024 * 1024,
  showDetails = true,
}: OfflineDataViewerProps) {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<CacheCategory>>(new Set());
  const [categoryEntries, setCategoryEntries] = useState<Record<CacheCategory, CacheEntry[]>>({
    analytics: [],
    dashboard: [],
    ui: [],
    user: [],
    general: [],
  });

  const loadStats = async () => {
    setIsLoading(true);
    try {
      const cacheStats = await offlineCache.getStats();
      setStats(cacheStats);
    } catch (error) {
      console.error('[OfflineDataViewer] Failed to load stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadCategoryEntries = async (category: CacheCategory) => {
    try {
      const entries = await offlineCache.getByCategory(category);
      setCategoryEntries(prev => ({ ...prev, [category]: entries }));
    } catch (error) {
      console.error('[OfflineDataViewer] Failed to load category entries:', error);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const toggleCategory = async (category: CacheCategory) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
      await loadCategoryEntries(category);
    }
    setExpandedCategories(newExpanded);
  };

  const handleClearCategory = async (category: CacheCategory) => {
    await offlineCache.invalidateCategory(category);
    await loadStats();
    setCategoryEntries(prev => ({ ...prev, [category]: [] }));
  };

  const handleClearAll = async () => {
    await offlineCache.clear();
    await loadStats();
    setCategoryEntries({
      analytics: [],
      dashboard: [],
      ui: [],
      user: [],
      general: [],
    });
    setExpandedCategories(new Set());
  };

  const handleCleanupExpired = async () => {
    await offlineCache.cleanupExpired();
    await loadStats();
    for (const category of expandedCategories) {
      await loadCategoryEntries(category);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const usagePercent = stats ? Math.round((stats.totalSize / maxCacheSize) * 100) : 0;

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Database className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Offline Data</CardTitle>
              <CardDescription>Cached data available offline</CardDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={loadStats}
            disabled={isLoading}
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {stats && (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5">
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                  Storage Used
                </span>
                <span className="font-medium">
                  {formatBytes(stats.totalSize)} / {formatBytes(maxCacheSize)}
                </span>
              </div>
              <Progress value={usagePercent} className="h-2" />
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="font-semibold text-lg">{stats.totalEntries}</div>
                <div className="text-xs text-muted-foreground">Cached Items</div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="font-semibold text-lg">{Math.round(stats.hitRate * 100)}%</div>
                <div className="text-xs text-muted-foreground">Hit Rate</div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="font-semibold text-lg">{Object.keys(stats.byCategory).length}</div>
                <div className="text-xs text-muted-foreground">Categories</div>
              </div>
            </div>

            <Separator />

            <ScrollArea className="max-h-[300px]">
              <div className="space-y-2">
                {(Object.entries(stats.byCategory) as [CacheCategory, { count: number; size: number }][])
                  .filter(([, data]) => data.count > 0)
                  .map(([category, data]) => {
                    const config = categoryConfig[category];
                    const Icon = config.icon;
                    const isExpanded = expandedCategories.has(category);
                    const entries = categoryEntries[category];

                    return (
                      <Collapsible
                        key={category}
                        open={isExpanded}
                        onOpenChange={() => toggleCategory(category)}
                      >
                        <CollapsibleTrigger asChild>
                          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors">
                            <div className="flex items-center gap-3">
                              <Icon className={cn('h-4 w-4', config.color)} />
                              <div>
                                <p className="font-medium text-sm">{config.label}</p>
                                <p className="text-xs text-muted-foreground">
                                  {data.count} items • {formatBytes(data.size)}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {showDetails && (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Clear {config.label} Cache</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will remove all {data.count} cached {config.label.toLowerCase()} items.
                                        This action cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleClearCategory(category)}>
                                        Clear
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              )}
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="pl-10 pr-3 py-2 space-y-1">
                            {entries.length === 0 ? (
                              <p className="text-xs text-muted-foreground py-2">Loading...</p>
                            ) : (
                              entries.slice(0, 10).map((entry) => (
                                <div
                                  key={entry.key}
                                  className="flex items-center justify-between py-1.5 text-xs"
                                >
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span className="truncate font-mono text-muted-foreground">
                                      {entry.key.length > 40 ? '...' + entry.key.slice(-37) : entry.key}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                                      {formatBytes(entry.size)}
                                    </Badge>
                                    <span className="text-muted-foreground flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      {formatDistanceToNow(entry.lastAccessed, { addSuffix: true })}
                                    </span>
                                  </div>
                                </div>
                              ))
                            )}
                            {entries.length > 10 && (
                              <p className="text-xs text-muted-foreground pt-2">
                                +{entries.length - 10} more items
                              </p>
                            )}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
              </div>
            </ScrollArea>

            <Separator />

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={handleCleanupExpired}
              >
                <Clock className="h-4 w-4 mr-1" />
                Cleanup Expired
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="flex-1"
                    disabled={stats.totalEntries === 0}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Clear All
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear All Offline Data</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove all {stats.totalEntries} cached items ({formatBytes(stats.totalSize)}).
                      You'll need to reconnect to reload this data.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleClearAll}>
                      Clear All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </>
        )}

        {!stats && isLoading && (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default OfflineDataViewer;
