import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getCsrfTokenFromCookie } from "@/lib/queryClient";
import { useNavigate } from "wouter";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search,
  Music,
  User,
  Folder,
  Disc,
  Clock,
  TrendingUp,
  Sparkles,
  X,
  ArrowRight,
  Loader2,
  FileAudio,
  BarChart3,
  Share2,
  Calendar,
  Hash,
  Lightbulb,
  Command as CommandIcon,
  History,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { useDebounce } from "@/hooks";
import { cn } from "@/lib/utils";

interface SearchResult {
  id: string;
  type: "beat" | "user" | "project" | "release" | "track" | "playlist" | "post";
  title?: string;
  name?: string;
  username?: string;
  description?: string;
  genre?: string;
  price?: number;
  artworkUrl?: string;
  avatarUrl?: string;
  relevanceScore?: number;
}

interface CategoryResults {
  items: SearchResult[];
  total: number;
}

interface SearchResponse {
  query: string;
  totalResults: number;
  categories: {
    beats?: CategoryResults;
    users?: CategoryResults;
    projects?: CategoryResults;
    releases?: CategoryResults;
    tracks?: CategoryResults;
    playlists?: CategoryResults;
    posts?: CategoryResults;
  };
  didYouMean?: string;
  allResults: SearchResult[];
}

interface GlobalSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResultSelect?: (result: SearchResult, type: string) => void;
  defaultCategory?: string;
}

const CATEGORY_CONFIG = {
  beats: {
    icon: Music,
    color: "text-purple-400",
    label: "Beats",
    path: "/marketplace",
  },
  users: {
    icon: User,
    color: "text-blue-400",
    label: "Artists",
    path: "/collaborations",
  },
  projects: {
    icon: Folder,
    color: "text-green-400",
    label: "Projects",
    path: "/studio",
  },
  releases: {
    icon: Disc,
    color: "text-orange-400",
    label: "Releases",
    path: "/distribution",
  },
  tracks: {
    icon: FileAudio,
    color: "text-pink-400",
    label: "Tracks",
    path: "/studio",
  },
  playlists: {
    icon: Hash,
    color: "text-cyan-400",
    label: "Playlists",
    path: "/marketplace",
  },
  posts: {
    icon: Share2,
    color: "text-yellow-400",
    label: "Posts",
    path: "/social",
  },
};

const QUICK_ACTIONS = [
  {
    id: "new-project",
    label: "Create New Project",
    icon: Folder,
    shortcut: "N",
    path: "/studio",
  },
  {
    id: "upload-beat",
    label: "Upload Beat",
    icon: Music,
    shortcut: "U",
    path: "/marketplace",
  },
  {
    id: "new-release",
    label: "New Release",
    icon: Disc,
    shortcut: "R",
    path: "/distribution",
  },
  {
    id: "analytics",
    label: "View Analytics",
    icon: BarChart3,
    shortcut: "A",
    path: "/analytics",
  },
  {
    id: "schedule-post",
    label: "Schedule Post",
    icon: Calendar,
    shortcut: "P",
    path: "/social",
  },
];

export function GlobalSearchDialog({
  open,
  onOpenChange,
  onResultSelect,
  defaultCategory,
}: GlobalSearchDialogProps) {
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(
    defaultCategory || null,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [, navigate] = useNavigate();
  const debouncedQuery = useDebounce(query, 250);

  const { data: searchData, isLoading } = useQuery({
    queryKey: ["/api/search/unified", debouncedQuery, selectedCategory],
    queryFn: async () => {
      if (debouncedQuery.length < 2) return null;
      const params = new URLSearchParams({
        q: debouncedQuery,
        type: selectedCategory || "all",
        limit: "10",
      });
      const res = await fetch(`/api/search/unified?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Search failed");
      return res.json() as Promise<SearchResponse>;
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 30000,
  });

  const { data: historyData } = useQuery({
    queryKey: ["/api/search/history"],
    queryFn: async () => {
      const res = await fetch("/api/search/history", {
        credentials: "include",
      });
      if (!res.ok) return { history: [] };
      return res.json();
    },
    enabled: open,
  });

  const { data: trendingData } = useQuery({
    queryKey: ["/api/search/trending"],
    queryFn: async () => {
      const res = await fetch("/api/search/trending", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch trending");
      return res.json();
    },
    enabled: open,
    staleTime: 300000,
  });

  const clearHistoryMutation = useMutation({
    mutationFn: async () => {
      const csrfToken = getCsrfTokenFromCookie();
      const res = await fetch("/api/search/history", {
        method: "DELETE",
        credentials: "include",
        headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
      });
      if (!res.ok) throw new Error("Failed to clear");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/search/history"] });
    },
  });

  const handleSelect = useCallback(
    (result: SearchResult) => {
      if (onResultSelect) {
        onResultSelect(result, result.type);
      } else {
        const config =
          CATEGORY_CONFIG[result.type as keyof typeof CATEGORY_CONFIG];
        if (config) {
          navigate(`${config.path}?id=${result.id}`);
        }
      }
      onOpenChange(false);
      setQuery("");
    },
    [onResultSelect, navigate, onOpenChange],
  );

  const handleQuickAction = useCallback(
    (action: (typeof QUICK_ACTIONS)[0]) => {
      navigate(action.path);
      onOpenChange(false);
      setQuery("");
    },
    [navigate, onOpenChange],
  );

  const handleHistoryClick = useCallback((historyQuery: string) => {
    setQuery(historyQuery);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  const getCategoryIcon = (type: string) => {
    const config = CATEGORY_CONFIG[type as keyof typeof CATEGORY_CONFIG];
    if (!config) return Search;
    return config.icon;
  };

  const getCategoryColor = (type: string) => {
    const config = CATEGORY_CONFIG[type as keyof typeof CATEGORY_CONFIG];
    return config?.color || "text-slate-400";
  };

  const getName = (result: SearchResult) => {
    return result.title || result.name || result.username || "Untitled";
  };

  const history = historyData?.history || [];
  const trending = trendingData?.queries || [];
  const hasResults = searchData?.totalResults && searchData.totalResults > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 max-w-2xl bg-slate-900 border-slate-700 shadow-2xl">
        <DialogTitle className="sr-only">Global Search</DialogTitle>
        <Command className="bg-transparent">
          <div className="flex items-center border-b border-slate-700 px-3">
            <Search className="h-4 w-4 text-slate-400 shrink-0" />
            <CommandInput
              ref={inputRef}
              placeholder="Search beats, artists, projects, releases..."
              value={query}
              onValueChange={setQuery}
              className="flex h-12 w-full rounded-md bg-transparent py-3 text-sm text-white placeholder:text-slate-500 outline-none disabled:cursor-not-allowed disabled:opacity-50 border-0"
            />
            {query && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-slate-400 hover:text-white shrink-0"
                onClick={() => setQuery("")}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            <kbd className="ml-2 shrink-0 pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-slate-700 bg-slate-800 px-1.5 font-mono text-[10px] font-medium text-slate-400">
              <span className="text-xs">⌘</span>K
            </kbd>
          </div>

          {selectedCategory && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700">
              <Badge
                variant="secondary"
                className="bg-purple-500/20 text-purple-300 cursor-pointer"
                onClick={() => setSelectedCategory(null)}
              >
                {CATEGORY_CONFIG[
                  selectedCategory as keyof typeof CATEGORY_CONFIG
                ]?.label || selectedCategory}
                <X className="h-3 w-3 ml-1" />
              </Badge>
            </div>
          )}

          <CommandList className="max-h-[400px] overflow-y-auto">
            {isLoading && query.length >= 2 && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
              </div>
            )}

            {!isLoading && query.length >= 2 && !hasResults && (
              <div className="py-8 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center">
                  <Search className="h-8 w-8 text-slate-600" />
                </div>
                <p className="text-sm text-slate-400 mb-4">
                  No results found for "{query}"
                </p>
                {searchData?.didYouMean && (
                  <Button
                    variant="link"
                    className="text-purple-400"
                    onClick={() => setQuery(searchData.didYouMean!)}
                  >
                    <Lightbulb className="h-4 w-4 mr-2" />
                    Did you mean "{searchData.didYouMean}"?
                  </Button>
                )}
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <span className="text-xs text-slate-500">Try:</span>
                  {trending
                    .slice(0, 3)
                    .map((item: { query: string }, i: number) => (
                      <Button
                        key={i}
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs border-slate-600"
                        onClick={() => setQuery(item.query)}
                      >
                        {item.query}
                      </Button>
                    ))}
                </div>
              </div>
            )}

            {!isLoading && hasResults && searchData && (
              <>
                {Object.entries(searchData.categories || {}).map(
                  ([category, data]) => {
                    if (!data?.items?.length) return null;
                    const Icon = getCategoryIcon(category);
                    const config =
                      CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG];

                    return (
                      <CommandGroup
                        key={category}
                        heading={
                          <span className="flex items-center gap-2">
                            <Icon
                              className={cn(
                                "h-4 w-4",
                                getCategoryColor(category),
                              )}
                            />
                            {config?.label || category}
                            <Badge
                              variant="secondary"
                              className="text-xs bg-slate-700"
                            >
                              {data.total}
                            </Badge>
                          </span>
                        }
                      >
                        {data.items.slice(0, 5).map((result: SearchResult) => (
                          <CommandItem
                            key={result.id}
                            onSelect={() => handleSelect(result)}
                            className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-800"
                          >
                            <div
                              className={cn(
                                "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                                "bg-slate-800 overflow-hidden",
                              )}
                            >
                              {result.artworkUrl || result.avatarUrl ? (
                                <img
                                  src={result.artworkUrl || result.avatarUrl}
                                  alt={getName(result)}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <Icon
                                  className={cn(
                                    "h-5 w-5",
                                    getCategoryColor(category),
                                  )}
                                />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white truncate">
                                {getName(result)}
                              </p>
                              <p className="text-xs text-slate-400 truncate">
                                {result.description ||
                                  result.genre ||
                                  result.username ||
                                  config?.label}
                              </p>
                            </div>
                            {result.price !== undefined && (
                              <span className="text-sm text-green-400 font-medium shrink-0">
                                ${result.price}
                              </span>
                            )}
                            <ArrowRight className="h-4 w-4 text-slate-600 shrink-0" />
                          </CommandItem>
                        ))}
                        {data.total > 5 && (
                          <CommandItem
                            className="flex items-center justify-center py-2 text-sm text-purple-400 cursor-pointer"
                            onSelect={() => {
                              setSelectedCategory(category);
                            }}
                          >
                            View all {data.total}{" "}
                            {config?.label.toLowerCase() || category}
                            <ExternalLink className="h-3 w-3 ml-1" />
                          </CommandItem>
                        )}
                      </CommandGroup>
                    );
                  },
                )}
              </>
            )}

            {!query && (
              <>
                {history.length > 0 && (
                  <CommandGroup
                    heading={
                      <span className="flex items-center justify-between w-full">
                        <span className="flex items-center gap-2">
                          <History className="h-4 w-4 text-slate-400" />
                          Recent Searches
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 text-xs text-slate-500 hover:text-red-400"
                          onClick={(e) => {
                            e.stopPropagation();
                            clearHistoryMutation.mutate();
                          }}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Clear
                        </Button>
                      </span>
                    }
                  >
                    {history
                      .slice(0, 5)
                      .map(
                        (
                          item: { query: string; resultCount: number },
                          i: number,
                        ) => (
                          <CommandItem
                            key={i}
                            onSelect={() => handleHistoryClick(item.query)}
                            className="flex items-center gap-3 cursor-pointer"
                          >
                            <Clock className="h-4 w-4 text-slate-500" />
                            <span className="flex-1 text-sm text-slate-300">
                              {item.query}
                            </span>
                            <span className="text-xs text-slate-600">
                              {item.resultCount} results
                            </span>
                          </CommandItem>
                        ),
                      )}
                  </CommandGroup>
                )}

                {trending.length > 0 && (
                  <>
                    <CommandSeparator />
                    <CommandGroup
                      heading={
                        <span className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-orange-400" />
                          Trending
                        </span>
                      }
                    >
                      {trending
                        .slice(0, 6)
                        .map(
                          (
                            item: {
                              query: string;
                              searchCount: number;
                              trend: string;
                            },
                            i: number,
                          ) => (
                            <CommandItem
                              key={i}
                              onSelect={() => setQuery(item.query)}
                              className="flex items-center gap-3 cursor-pointer"
                            >
                              <Sparkles className="h-4 w-4 text-orange-400" />
                              <span className="flex-1 text-sm text-slate-300">
                                {item.query}
                              </span>
                              <Badge
                                variant="secondary"
                                className="text-[10px] bg-slate-800"
                              >
                                {item.searchCount}
                              </Badge>
                            </CommandItem>
                          ),
                        )}
                    </CommandGroup>
                  </>
                )}

                <CommandSeparator />
                <CommandGroup
                  heading={
                    <span className="flex items-center gap-2">
                      <CommandIcon className="h-4 w-4 text-blue-400" />
                      Quick Actions
                    </span>
                  }
                >
                  {QUICK_ACTIONS.map((action) => (
                    <CommandItem
                      key={action.id}
                      onSelect={() => handleQuickAction(action)}
                      className="flex items-center gap-3 cursor-pointer"
                    >
                      <action.icon className="h-4 w-4 text-blue-400" />
                      <span className="flex-1 text-sm text-slate-300">
                        {action.label}
                      </span>
                      <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-slate-700 bg-slate-800 px-1.5 font-mono text-[10px] font-medium text-slate-400">
                        ⌘{action.shortcut}
                      </kbd>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>

          <div className="flex items-center justify-between border-t border-slate-700 px-3 py-2 text-xs text-slate-500">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-slate-700 bg-slate-800 px-1">
                  ↑↓
                </kbd>
                navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-slate-700 bg-slate-800 px-1">
                  ↵
                </kbd>
                select
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-slate-700 bg-slate-800 px-1">
                  esc
                </kbd>
                close
              </span>
            </div>
            <span className="text-slate-600">Max Booster Search</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

export function useGlobalSearch() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return { open, setOpen };
}

export default GlobalSearchDialog;
