import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Music, User, Folder, Disc, ChevronLeft, ChevronRight, Grid, List, Play, Heart, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { SearchEmptyState } from "./SearchEmptyState";

interface SearchResultsProps {
  query: string;
  filters?: Record<string, any>;
  onFilterChange?: (filters: Record<string, any>) => void;
  onResultClick?: (result: Record<string, unknown>, type: string) => void;
  showFilters?: boolean;
  initialCategory?: string;
}

interface SearchResult {
  id: string;
  type: "beat" | "user" | "project" | "release";
  title?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  description?: string;
  genre?: string;
  price?: number;
  plays?: number;
  avatarUrl?: string;
  artworkUrl?: string;
  relevanceScore?: number;
}

export function SearchResults({
  query,
  filters = {},
  onFilterChange,
  onResultClick,
  showFilters = true,
  initialCategory = "all",
}: SearchResultsProps) {
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(0);
  const limit = 20;

  const {
    data: searchData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["/api/search/unified", query, filters, activeCategory, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        q: query,
        type: activeCategory,
        limit: String(limit),
        offset: String(page * limit),
        ...Object.fromEntries(
          Object.entries(filters).filter(
            ([_, v]) => v !== undefined && v !== "",
          ),
        ),
      });

      const res = await fetch(`/api/search/unified?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: query.length >= 2,
    staleTime: 60000,
  });


  const getCategoryCount = (category: string) => {
    if (!searchData?.categories) return 0;
    return searchData.categories[category]?.total || 0;
  };

  const getDisplayResults = () => {
    if (!searchData) return [];
    if (activeCategory === "all") {
      return searchData.allResults || [];
    }
    return searchData.categories?.[activeCategory]?.items || [];
  };

  const totalResults = searchData?.totalResults || 0;
  const totalPages = Math.ceil(totalResults / limit);
  const results = getDisplayResults();

  if (!query || query.length < 2) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        Enter at least 2 characters to search
      </div>
    );
  }

  if (isLoading) {
    return <SearchResultsSkeleton viewMode={viewMode} />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-red-400">
        Failed to load search results. Please try again.
      </div>
    );
  }

  if (totalResults === 0) {
    return (
      <SearchEmptyState
        query={query}
        onSuggestionClick={(q) => onResultClick?.({ query: q }, "search")}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-white">
            {totalResults.toLocaleString()} results for "{query}"
          </h2>
          {Object.keys(filters).filter((k) => filters[k]).length > 0 && (
            <Badge
              variant="secondary"
              className="bg-purple-500/20 text-purple-300"
            >
              {Object.keys(filters).filter((k) => filters[k]).length} filters
              active
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setViewMode("grid")}
            className="h-8 w-8"
          >
            <Grid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setViewMode("list")}
            className="h-8 w-8"
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList className="bg-slate-800/50">
          <TabsTrigger
            value="all"
            className="data-[state=active]:bg-purple-600"
          >
            All ({totalResults})
          </TabsTrigger>
          <TabsTrigger
            value="beats"
            className="data-[state=active]:bg-purple-600"
          >
            <Music className="h-4 w-4 mr-1" />
            Beats ({getCategoryCount("beats")})
          </TabsTrigger>
          <TabsTrigger
            value="users"
            className="data-[state=active]:bg-purple-600"
          >
            <User className="h-4 w-4 mr-1" />
            Users ({getCategoryCount("users")})
          </TabsTrigger>
          <TabsTrigger
            value="projects"
            className="data-[state=active]:bg-purple-600"
          >
            <Folder className="h-4 w-4 mr-1" />
            Projects ({getCategoryCount("projects")})
          </TabsTrigger>
          <TabsTrigger
            value="releases"
            className="data-[state=active]:bg-purple-600"
          >
            <Disc className="h-4 w-4 mr-1" />
            Releases ({getCategoryCount("releases")})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeCategory} className="mt-4">
          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {results.map((result: SearchResult) => (
                <ResultCard
                  key={result.id}
                  result={result}
                  onClick={() => onResultClick?.(result, result.type)}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {results.map((result: SearchResult) => (
                <ResultListItem
                  key={result.id}
                  result={result}
                  onClick={() => onResultClick?.(result, result.type)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="border-slate-700"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <span className="text-sm text-slate-400 px-4">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="border-slate-700"
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}

function ResultCard({
  result,
  onClick,
}: {
  result: SearchResult;
  onClick: () => void;
}) {
  const getTypeStyles = () => {
    switch (result.type) {
      case "beat":
        return "border-purple-500/30 hover:border-purple-500/60";
      case "user":
        return "border-blue-500/30 hover:border-blue-500/60";
      case "project":
        return "border-green-500/30 hover:border-green-500/60";
      case "release":
        return "border-orange-500/30 hover:border-orange-500/60";
      default:
        return "border-slate-700 hover:border-slate-600";
    }
  };

  const getName = () => {
    if (result.title) return result.title;
    if (result.firstName && result.lastName)
      return `${result.firstName} ${result.lastName}`;
    return result.username || "Untitled";
  };

  return (
    <Card
      className={cn(
        "bg-slate-800/50 border cursor-pointer transition-all hover:bg-slate-800",
        getTypeStyles(),
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="aspect-square rounded-lg bg-slate-700/50 mb-3 flex items-center justify-center overflow-hidden">
          {result.artworkUrl || result.avatarUrl ? (
            <img
              src={result.artworkUrl || result.avatarUrl}
              alt={getName()}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="text-slate-600">
              {result.type === "beat" && <Music className="h-12 w-12" />}
              {result.type === "user" && <User className="h-12 w-12" />}
              {result.type === "project" && <Folder className="h-12 w-12" />}
              {result.type === "release" && <Disc className="h-12 w-12" />}
            </div>
          )}
        </div>
        <div className="space-y-1">
          <h3 className="font-medium text-white truncate">{getName()}</h3>
          {result.type === "user" && result.username && (
            <p className="text-sm text-slate-400">@{result.username}</p>
          )}
          {result.genre && (
            <Badge variant="secondary" className="text-xs bg-slate-700">
              {result.genre}
            </Badge>
          )}
          <div className="flex items-center justify-between text-sm text-slate-400 pt-2">
            {result.plays !== undefined && (
              <span className="flex items-center gap-1">
                <Play className="h-3 w-3" />
                {result.plays.toLocaleString()}
              </span>
            )}
            {result.price !== undefined && (
              <span className="text-green-400 font-medium">
                ${result.price}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ResultListItem({
  result,
  onClick,
}: {
  result: SearchResult;
  onClick: () => void;
}) {
  const getTypeIcon = () => {
    switch (result.type) {
      case "beat":
        return <Music className="h-5 w-5 text-purple-400" />;
      case "user":
        return <User className="h-5 w-5 text-blue-400" />;
      case "project":
        return <Folder className="h-5 w-5 text-green-400" />;
      case "release":
        return <Disc className="h-5 w-5 text-orange-400" />;
      default:
        return null;
    }
  };

  const getName = () => {
    if (result.title) return result.title;
    if (result.firstName && result.lastName)
      return `${result.firstName} ${result.lastName}`;
    return result.username || "Untitled";
  };

  return (
    <div
      className="flex items-center gap-4 p-4 rounded-lg bg-slate-800/50 border border-slate-700 hover:bg-slate-800 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <div className="w-12 h-12 rounded-lg bg-slate-700/50 flex items-center justify-center flex-shrink-0 overflow-hidden">
        {result.artworkUrl || result.avatarUrl ? (
          <img
            src={result.artworkUrl || result.avatarUrl}
            alt={getName()}
            className="w-full h-full object-cover"
          />
        ) : (
          getTypeIcon()
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-white truncate">{getName()}</h3>
          <Badge
            variant="outline"
            className="text-xs capitalize border-slate-600"
          >
            {result.type}
          </Badge>
        </div>
        <p className="text-sm text-slate-400 truncate">
          {result.description ||
            result.genre ||
            (result.username && `@${result.username}`)}
        </p>
      </div>
      <div className="flex items-center gap-4 flex-shrink-0">
        {result.plays !== undefined && (
          <span className="text-sm text-slate-400 flex items-center gap-1">
            <Play className="h-3 w-3" />
            {result.plays.toLocaleString()}
          </span>
        )}
        {result.price !== undefined && (
          <span className="text-green-400 font-medium">${result.price}</span>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Heart className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function SearchResultsSkeleton({ viewMode }: { viewMode: "grid" | "list" }) {
  if (viewMode === "grid") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-6 w-48 bg-slate-700" />
        </div>
        <Skeleton className="h-10 w-full max-w-lg bg-slate-700" />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="aspect-square rounded-lg bg-slate-700" />
              <Skeleton className="h-4 w-3/4 bg-slate-700" />
              <Skeleton className="h-3 w-1/2 bg-slate-700" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Skeleton className="h-6 w-48 bg-slate-700" />
      </div>
      <Skeleton className="h-10 w-full max-w-lg bg-slate-700" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 p-4 rounded-lg bg-slate-800/50"
          >
            <Skeleton className="w-12 h-12 rounded-lg bg-slate-700" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3 bg-slate-700" />
              <Skeleton className="h-3 w-1/4 bg-slate-700" />
            </div>
            <Skeleton className="h-4 w-16 bg-slate-700" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default SearchResults;
