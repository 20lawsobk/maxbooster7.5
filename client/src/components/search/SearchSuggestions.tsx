import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  Music,
  User,
  Hash,
  TrendingUp,
  Clock,
  Sparkles,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { useDebounce } from "@/hooks";
import { cn } from "@/lib/utils";

interface Suggestion {
  text: string;
  type: "query" | "user" | "beat" | "genre" | "tag" | "artist" | "hashtag";
  highlighted: string;
  metadata?: {
    count?: number;
    trending?: boolean;
    recent?: boolean;
  };
}

interface SearchSuggestionsProps {
  query: string;
  onSelect: (suggestion: string, type?: string) => void;
  onClose?: () => void;
  showRecent?: boolean;
  showTrending?: boolean;
  showHashtags?: boolean;
  context?: "global" | "marketplace" | "social" | "analytics" | "distribution";
  maxSuggestions?: number;
  className?: string;
}

const SUGGESTION_ICONS: Record<string, React.ElementType> = {
  query: Search,
  user: User,
  beat: Music,
  genre: Hash,
  tag: Hash,
  artist: User,
  hashtag: Hash,
};

const SUGGESTION_COLORS: Record<string, string> = {
  query: "text-slate-400",
  user: "text-blue-400",
  beat: "text-purple-400",
  genre: "text-green-400",
  tag: "text-orange-400",
  artist: "text-blue-400",
  hashtag: "text-pink-400",
};

export function SearchSuggestions({
  query,
  onSelect,
  onClose,
  showRecent = true,
  showTrending = true,
  showHashtags = false,
  context = "global",
  maxSuggestions = 10,
  className,
}: SearchSuggestionsProps) {
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebounce(query, 200);

  const { data: suggestionsData, isLoading } = useQuery({
    queryKey: ["/api/search/suggestions", debouncedQuery, context],
    queryFn: async () => {
      if (debouncedQuery.length < 2) return { suggestions: [] };
      const params = new URLSearchParams({
        q: debouncedQuery,
        limit: String(maxSuggestions),
        context,
      });
      const res = await fetch(`/api/search/suggestions?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch suggestions");
      return res.json();
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 60000,
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
    enabled: showRecent && debouncedQuery.length < 2,
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
    enabled: showTrending && debouncedQuery.length < 2,
    staleTime: 300000,
  });

  const { data: hashtagsData } = useQuery({
    queryKey: ["/api/social/hashtags/trending"],
    queryFn: async () => {
      const res = await fetch("/api/social/hashtags/trending", {
        credentials: "include",
      });
      if (!res.ok) return { hashtags: [] };
      return res.json();
    },
    enabled: showHashtags && context === "social" && debouncedQuery.length < 2,
    staleTime: 300000,
  });

  const suggestions: Suggestion[] = suggestionsData?.suggestions || [];
  const history = historyData?.history || [];
  const trending = trendingData?.queries || [];
  const hashtags = hashtagsData?.hashtags || [];

  const allItems =
    query.length >= 2
      ? suggestions
      : [
          ...history.slice(0, 5).map((h: { query: string }) => ({
            text: h.query,
            type: "query" as const,
            highlighted: h.query,
            metadata: { recent: true },
          })),
          ...trending
            .slice(0, 5)
            .map((t: { query: string; searchCount: number }) => ({
              text: t.query,
              type: "query" as const,
              highlighted: t.query,
              metadata: { trending: true, count: t.searchCount },
            })),
          ...hashtags.slice(0, 5).map((h: { tag: string; count: number }) => ({
            text: `#${h.tag}`,
            type: "hashtag" as const,
            highlighted: `#${h.tag}`,
            metadata: { count: h.count },
          })),
        ];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (allItems.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % allItems.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(
          (prev) => (prev - 1 + allItems.length) % allItems.length,
        );
      } else if (e.key === "Enter" && selectedIndex >= 0) {
        e.preventDefault();
        const item = allItems[selectedIndex];
        onSelect(item.text, item.type);
      } else if (e.key === "Escape") {
        onClose?.();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [allItems, selectedIndex, onSelect, onClose]);

  useEffect(() => {
    setSelectedIndex(-1);
  }, [query]);

  if (query.length < 2 && allItems.length === 0) {
    return null;
  }

  const getIcon = (type: string) => {
    const Icon = SUGGESTION_ICONS[type] || Search;
    return (
      <Icon
        className={cn("h-4 w-4", SUGGESTION_COLORS[type] || "text-slate-400")}
      />
    );
  };

  return (
    <Card className={cn("bg-slate-900 border-slate-700 shadow-xl", className)}>
      <CardContent className="p-0">
        <ScrollArea className="max-h-80">
          {isLoading && query.length >= 2 && (
            <div className="p-4 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
            </div>
          )}

          {!isLoading && query.length >= 2 && suggestions.length === 0 && (
            <div className="p-4 text-center text-sm text-slate-500">
              No suggestions found
            </div>
          )}

          {query.length < 2 && showRecent && history.length > 0 && (
            <div className="p-2">
              <div className="px-2 py-1 text-xs font-medium text-slate-500 uppercase flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Recent
              </div>
              {history
                .slice(0, 5)
                .map((item: { query: string }, index: number) => (
                  <SuggestionItem
                    key={`history-${index}`}
                    icon={<Clock className="h-4 w-4 text-slate-500" />}
                    text={item.query}
                    isSelected={selectedIndex === index}
                    onClick={() => onSelect(item.query, "query")}
                  />
                ))}
            </div>
          )}

          {query.length < 2 && showTrending && trending.length > 0 && (
            <div className="p-2 border-t border-slate-800">
              <div className="px-2 py-1 text-xs font-medium text-slate-500 uppercase flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                Trending
              </div>
              {trending
                .slice(0, 5)
                .map(
                  (
                    item: { query: string; searchCount: number },
                    index: number,
                  ) => (
                    <SuggestionItem
                      key={`trending-${index}`}
                      icon={<Sparkles className="h-4 w-4 text-orange-400" />}
                      text={item.query}
                      badge={String(item.searchCount)}
                      isSelected={selectedIndex === history.length + index}
                      onClick={() => onSelect(item.query, "query")}
                    />
                  ),
                )}
            </div>
          )}

          {query.length < 2 &&
            showHashtags &&
            context === "social" &&
            hashtags.length > 0 && (
              <div className="p-2 border-t border-slate-800">
                <div className="px-2 py-1 text-xs font-medium text-slate-500 uppercase flex items-center gap-1">
                  <Hash className="h-3 w-3" />
                  Popular Hashtags
                </div>
                {hashtags
                  .slice(0, 5)
                  .map(
                    (item: { tag: string; count: number }, index: number) => (
                      <SuggestionItem
                        key={`hashtag-${index}`}
                        icon={<Hash className="h-4 w-4 text-pink-400" />}
                        text={`#${item.tag}`}
                        badge={String(item.count)}
                        isSelected={
                          selectedIndex ===
                          history.length + trending.length + index
                        }
                        onClick={() => onSelect(`#${item.tag}`, "hashtag")}
                      />
                    ),
                  )}
              </div>
            )}

          {query.length >= 2 && suggestions.length > 0 && (
            <div className="p-2" ref={listRef}>
              {suggestions.map((suggestion, index) => (
                <SuggestionItem
                  key={`suggestion-${index}`}
                  icon={getIcon(suggestion.type)}
                  text={suggestion.text}
                  highlighted={suggestion.highlighted}
                  type={suggestion.type}
                  isSelected={selectedIndex === index}
                  onClick={() => onSelect(suggestion.text, suggestion.type)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function SuggestionItem({
  icon,
  text,
  highlighted,
  type,
  badge,
  isSelected,
  onClick,
}: {
  icon: React.ReactNode;
  text: string;
  highlighted?: string;
  type?: string;
  badge?: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-left",
        isSelected
          ? "bg-slate-800 text-white"
          : "hover:bg-slate-800/50 text-slate-300",
      )}
      onClick={onClick}
    >
      {icon}
      <span className="flex-1 text-sm truncate">{highlighted || text}</span>
      {type && type !== "query" && (
        <Badge
          variant="outline"
          className="text-[10px] border-slate-700 text-slate-500"
        >
          {type}
        </Badge>
      )}
      {badge && (
        <Badge variant="secondary" className="text-[10px] bg-slate-800">
          {badge}
        </Badge>
      )}
      <ArrowRight className="h-3 w-3 text-slate-600" />
    </button>
  );
}

export function InlineSearchSuggestions({
  query,
  onSelect,
  className,
}: {
  query: string;
  onSelect: (suggestion: string) => void;
  className?: string;
}) {
  const debouncedQuery = useDebounce(query, 200);

  const { data } = useQuery({
    queryKey: ["/api/search/autocomplete", debouncedQuery],
    queryFn: async () => {
      if (debouncedQuery.length < 2) return { suggestions: [] };
      const res = await fetch(
        `/api/search/autocomplete?q=${encodeURIComponent(debouncedQuery)}&limit=5`,
        {
          credentials: "include",
        },
      );
      if (!res.ok) throw new Error("Failed to fetch suggestions");
      return res.json();
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 60000,
  });

  const suggestions = data?.suggestions || [];

  if (suggestions.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {suggestions.slice(0, 5).map((s: { text: string }, i: number) => (
        <Badge
          key={i}
          variant="secondary"
          className="bg-slate-700 text-slate-300 cursor-pointer hover:bg-purple-500/20 hover:text-purple-300 transition-colors"
          onClick={() => onSelect(s.text)}
        >
          {s.text}
        </Badge>
      ))}
    </div>
  );
}

export default SearchSuggestions;
