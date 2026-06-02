import { logger } from "@/lib/logger";
import { useState, useEffect, useRef, useCallback } from "react";
import { getCsrfTokenFromCookie } from "@/lib/queryClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Search,
  Mic,
  X,
  Clock,
  TrendingUp,
  Music,
  User,
  Folder,
  Disc,
  Loader2,
  Sparkles,
  History,
  Trash2,
} from "lucide-react";
import { useDebounce } from "@/hooks";
import { cn } from "@/lib/utils";

interface AutocompleteSuggestion {
  text: string;
  type: "query" | "user" | "beat" | "genre";
  highlighted: string;
}

interface SearchHistoryItem {
  query: string;
  timestamp: string;
  resultCount: number;
}

interface TrendingSearch {
  query: string;
  searchCount: number;
  trend: "up" | "down" | "stable";
}

interface GlobalSearchProps {
  onSearch: (query: string, filters?: Record<string, unknown>) => void;
  onResultClick?: (result: Record<string, unknown>) => void;
  placeholder?: string;
  className?: string;
  showTrending?: boolean;
  showHistory?: boolean;
  showVoiceSearch?: boolean;
  autoFocus?: boolean;
  compact?: boolean;
}

export function GlobalSearch({
  onSearch,
  onResultClick,
  placeholder = "Search beats, artists, projects...",
  className,
  showTrending = true,
  showHistory = true,
  showVoiceSearch = true,
  autoFocus = false,
  compact = false,
}: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const debouncedQuery = useDebounce(query, 300);

  const { data: autocompleteData, isLoading: isLoadingAutocomplete } = useQuery(
    {
      queryKey: ["/api/search/autocomplete", debouncedQuery],
      queryFn: async () => {
        if (debouncedQuery.length < 2) return { suggestions: [] };
        const res = await fetch(
          `/api/search/autocomplete?q=${encodeURIComponent(debouncedQuery)}&limit=8`,
          {
            credentials: "include",
          },
        );
        if (!res.ok) throw new Error("Failed to fetch suggestions");
        return res.json();
      },
      enabled: debouncedQuery.length >= 2,
      staleTime: 60000,
    },
  );

  const { data: historyData } = useQuery({
    queryKey: ["/api/search/history"],
    queryFn: async () => {
      const res = await fetch("/api/search/history", {
        credentials: "include",
      });
      if (!res.ok) return { history: [] };
      return res.json();
    },
    enabled: showHistory,
    staleTime: 30000,
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
    enabled: showTrending,
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
      if (!res.ok) throw new Error("Failed to clear history");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/search/history"] });
    },
  });

  const removeHistoryItemMutation = useMutation({
    mutationFn: async (searchQuery: string) => {
      const csrfToken = getCsrfTokenFromCookie();
      const res = await fetch(
        `/api/search/history/${encodeURIComponent(searchQuery)}`,
        {
          method: "DELETE",
          credentials: "include",
          headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
        },
      );
      if (!res.ok) throw new Error("Failed to remove item");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/search/history"] });
    },
  });

  const handleSearch = useCallback(
    (searchQuery: string) => {
      if (searchQuery.trim()) {
        onSearch(searchQuery.trim());
        setIsOpen(false);
      }
    },
    [onSearch],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch(query);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const startVoiceSearch = useCallback(() => {
    if (
      !("webkitSpeechRecognition" in window) &&
      !("SpeechRecognition" in window)
    ) {
      logger.warn("Speech recognition not supported");
      return;
    }

    const SpeechRecognition =
      (window as Record<string, unknown>).webkitSpeechRecognition ||
      (window as Record<string, unknown>).SpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognition.onresult = (event: Record<string, unknown>) => {
      const transcript = event.results[0][0].transcript;
      setQuery(transcript);
      handleSearch(transcript);
    };

    recognition.start();
  }, [handleSearch]);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const suggestions = autocompleteData?.suggestions || [];
  const history = historyData?.history || [];
  const trending = trendingData?.queries || [];

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "user":
        return <User className="h-4 w-4 text-blue-400" />;
      case "beat":
        return <Music className="h-4 w-4 text-purple-400" />;
      case "genre":
        return <Disc className="h-4 w-4 text-green-400" />;
      default:
        return <Search className="h-4 w-4 text-slate-400" />;
    }
  };

  const getTrendIcon = (trend: string) => {
    if (trend === "up")
      return <TrendingUp className="h-3 w-3 text-green-400" />;
    if (trend === "down")
      return <TrendingUp className="h-3 w-3 text-red-400 rotate-180" />;
    return null;
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <div className={cn("relative", className)}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              ref={inputRef}
              type="text"
              placeholder={placeholder}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (e.target.value.length >= 2) setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              onKeyDown={handleKeyDown}
              className={cn(
                "pl-10 pr-20 bg-slate-800/50 border-slate-700 focus:border-purple-500",
                "placeholder:text-slate-500",
                compact ? "h-9" : "h-11",
              )}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {query && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-slate-400 hover:text-white"
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
              {showVoiceSearch && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-6 w-6",
                    isListening
                      ? "text-red-400 animate-pulse"
                      : "text-slate-400 hover:text-white",
                  )}
                  onClick={startVoiceSearch}
                  disabled={isListening}
                >
                  <Mic className="h-3 w-3" />
                </Button>
              )}
              {isLoadingAutocomplete && (
                <Loader2 className="h-4 w-4 text-slate-400 animate-spin" />
              )}
            </div>
          </div>
        </div>
      </PopoverTrigger>

      <PopoverContent
        className="w-[400px] p-0 bg-slate-900 border-slate-700"
        align="start"
        sideOffset={4}
      >
        <ScrollArea className="max-h-[400px]">
          {suggestions.length > 0 && (
            <div className="p-2">
              <div className="px-2 py-1 text-xs font-medium text-slate-500 uppercase tracking-wider">
                Suggestions
              </div>
              {suggestions.map(
                (suggestion: AutocompleteSuggestion, index: number) => (
                  <button
                    key={`${suggestion.text}-${index}`}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left rounded-md hover:bg-slate-800 transition-colors"
                    onClick={() => {
                      setQuery(suggestion.text);
                      handleSearch(suggestion.text);
                    }}
                  >
                    {getTypeIcon(suggestion.type)}
                    <span className="text-sm text-slate-200">
                      {suggestion.highlighted}
                    </span>
                  </button>
                ),
              )}
            </div>
          )}
          {showHistory && history.length > 0 && (
            <div className="p-2 border-t border-slate-800">
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Recent
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-slate-500 hover:text-white"
                  onClick={() => clearHistoryMutation.mutate()}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              </div>
              {history.map((item: SearchHistoryItem) => (
                <button
                  key={item.query}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left rounded-md hover:bg-slate-800 transition-colors"
                  onClick={() => handleSearch(item.query)}
                >
                  <History className="h-4 w-4 text-slate-400" />
                  <span className="text-sm text-slate-200 flex-1">
                    {item.query}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-slate-500 hover:text-white"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeHistoryItemMutation.mutate(item.query);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </button>
              ))}
            </div>
          )}
          {showTrending && trending.length > 0 && (
            <div className="p-2 border-t border-slate-800">
              <div className="px-2 py-1 text-xs font-medium text-slate-500 uppercase tracking-wider">
                Trending
              </div>
              {trending.map((item: TrendingSearch) => (
                <button
                  key={item.query}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left rounded-md hover:bg-slate-800 transition-colors"
                  onClick={() => handleSearch(item.query)}
                >
                  <TrendingUp className="h-4 w-4 text-slate-400" />
                  <span className="text-sm text-slate-200 flex-1">
                    {item.query}
                  </span>
                  {getTrendIcon(item.trend)}
                  <Badge variant="secondary" className="text-xs">
                    {item.searchCount}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export default GlobalSearch;
