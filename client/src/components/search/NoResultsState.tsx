import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Lightbulb, TrendingUp, Music, Sparkles, RefreshCw, ArrowRight, Frown, HelpCircle, Filter, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface NoResultsStateProps {
  query: string;
  onSuggestionClick?: (suggestion: string) => void;
  onClearSearch?: () => void;
  onClearFilters?: () => void;
  showTips?: boolean;
  showTrending?: boolean;
  showGenres?: boolean;
  hasActiveFilters?: boolean;
  context?: "global" | "marketplace" | "analytics" | "social" | "distribution";
  className?: string;
}

const SEARCH_TIPS = [
  { text: "Try using fewer or more general keywords", icon: Search },
  { text: "Check for spelling mistakes", icon: HelpCircle },
  { text: "Try searching for a genre or mood instead", icon: Music },
  { text: 'Use quotes for exact phrases: "trap beat"', icon: Zap },
  { text: "Filter by BPM range for more specific results", icon: Filter },
];

const COMMON_CORRECTIONS: Record<string, string> = {
  tarp: "trap",
  hiphop: "hip-hop",
  lofi: "lo-fi",
  rnb: "r&b",
  dril: "drill",
  drll: "drill",
  beaat: "beat",
  melodc: "melodic",
  aggresive: "aggressive",
  chil: "chill",
  rythm: "rhythm",
  acustic: "acoustic",
};

const CONTEXT_SUGGESTIONS: Record<
  string,
  { title: string; suggestions: string[] }
> = {
  marketplace: {
    title: "Popular Searches",
    suggestions: [
      "trap beat",
      "lo-fi",
      "drill type beat",
      "r&b instrumental",
      "melodic rap",
    ],
  },
  social: {
    title: "Trending Topics",
    suggestions: ["#newmusic", "#producer", "#beatmaker", "#hiphop", "#studio"],
  },
  analytics: {
    title: "Common Metrics",
    suggestions: ["revenue", "streams", "downloads", "engagement", "growth"],
  },
  distribution: {
    title: "Release Types",
    suggestions: ["single", "album", "EP", "pending", "live"],
  },
  global: {
    title: "Explore",
    suggestions: ["beats", "producers", "projects", "releases", "playlists"],
  },
};

export function NoResultsState({
  query,
  onSuggestionClick,
  onClearSearch,
  onClearFilters,
  showTips = true,
  showTrending = true,
  showGenres = true,
  hasActiveFilters = false,
  context = "global",
  className,
}: NoResultsStateProps) {
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

  const checkSpelling = (text: string): string | null => {
    const words = text.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (COMMON_CORRECTIONS[word]) {
        return text.toLowerCase().replace(word, COMMON_CORRECTIONS[word]);
      }
    }
    return null;
  };

  const findSimilar = (text: string): string[] => {
    const normalizedQuery = text.toLowerCase();
    const similar: string[] = [];

    Object.entries(COMMON_CORRECTIONS).forEach(([typo, correct]) => {
      if (normalizedQuery.includes(typo.substring(0, 3))) {
        similar.push(correct);
      }
    });

    return [...new Set(similar)].slice(0, 3);
  };

  const suggestedCorrection = checkSpelling(query);
  const similarTerms = findSimilar(query);
  const trendingQueries = trendingData?.queries?.slice(0, 6) || [];
  const trendingGenres = trendingData?.genres?.slice(0, 8) || [];
  const contextSuggestions =
    CONTEXT_SUGGESTIONS[context] || CONTEXT_SUGGESTIONS.global;

  return (
    <div className={cn("py-12 px-4", className)}>
      <div className="max-w-2xl mx-auto text-center space-y-8">
        <div className="space-y-4">
          <div className="w-20 h-20 mx-auto rounded-full bg-slate-800 flex items-center justify-center">
            <Frown className="h-10 w-10 text-slate-500" />
          </div>
          <h2 className="text-2xl font-bold text-white">No results found</h2>
          <p className="text-slate-400">
            We couldn't find anything matching "{query}"
            {hasActiveFilters && " with your current filters"}
          </p>
        </div>

        {hasActiveFilters && (
          <Card className="bg-yellow-500/10 border-yellow-500/30">
            <CardContent className="py-4">
              <div className="flex items-center justify-center gap-3">
                <Filter className="h-5 w-5 text-yellow-400" />
                <span className="text-yellow-200">
                  Your filters may be too restrictive
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onClearFilters}
                  className="border-yellow-500/50 text-yellow-300 hover:bg-yellow-500/20"
                >
                  Clear Filters
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {suggestedCorrection && (
          <Card className="bg-purple-500/10 border-purple-500/30">
            <CardContent className="py-4">
              <div className="flex items-center justify-center gap-3">
                <Lightbulb className="h-5 w-5 text-purple-400" />
                <span className="text-slate-300">Did you mean:</span>
                <Button
                  variant="link"
                  className="text-purple-400 hover:text-purple-300 p-0 h-auto font-semibold"
                  onClick={() => onSuggestionClick?.(suggestedCorrection)}
                >
                  "{suggestedCorrection}"
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {similarTerms.length > 0 && !suggestedCorrection && (
          <div className="space-y-3">
            <p className="text-sm text-slate-400">You might be looking for:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {similarTerms.map((term, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  onClick={() => onSuggestionClick?.(term)}
                  className="border-purple-500/30 text-purple-300 hover:bg-purple-500/10"
                >
                  <Sparkles className="h-3 w-3 mr-1" />
                  {term}
                </Button>
              ))}
            </div>
          </div>
        )}

        {showTips && (
          <Card className="bg-slate-800/50 border-slate-700 text-left">
            <CardContent className="py-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-blue-400" />
                Search Tips
              </h3>
              <ul className="space-y-3">
                {SEARCH_TIPS.map((tip, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-3 text-slate-400"
                  >
                    <tip.icon className="h-4 w-4 text-purple-400 mt-0.5 shrink-0" />
                    <span>{tip.text}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white flex items-center justify-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-400" />
            {contextSuggestions.title}
          </h3>
          <div className="flex flex-wrap justify-center gap-2">
            {contextSuggestions.suggestions.map((suggestion, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                onClick={() => onSuggestionClick?.(suggestion)}
                className="border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                {suggestion}
              </Button>
            ))}
          </div>
        </div>

        {showTrending && trendingQueries.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white flex items-center justify-center gap-2">
              <TrendingUp className="h-5 w-5 text-orange-400" />
              Trending Searches
            </h3>
            <div className="flex flex-wrap justify-center gap-2">
              {trendingQueries.map(
                (
                  item: { query: string; searchCount: number },
                  index: number,
                ) => (
                  <Button
                    key={index}
                    variant="outline"
                    size="sm"
                    onClick={() => onSuggestionClick?.(item.query)}
                    className="border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
                  >
                    {item.query}
                    <Badge
                      variant="secondary"
                      className="ml-2 text-[10px] bg-slate-700"
                    >
                      {item.searchCount}
                    </Badge>
                  </Button>
                ),
              )}
            </div>
          </div>
        )}

        {showGenres && trendingGenres.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white flex items-center justify-center gap-2">
              <Music className="h-5 w-5 text-green-400" />
              Browse by Genre
            </h3>
            <div className="flex flex-wrap justify-center gap-2">
              {trendingGenres.map((genre: string, index: number) => (
                <Badge
                  key={index}
                  variant="secondary"
                  className="bg-slate-700 text-slate-300 cursor-pointer hover:bg-purple-500/20 hover:text-purple-300 px-4 py-2 transition-colors"
                  onClick={() => onSuggestionClick?.(genre)}
                >
                  {genre}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="pt-4 flex items-center justify-center gap-4">
          <Button
            variant="outline"
            onClick={onClearSearch}
            className="border-slate-600 text-slate-300 hover:bg-slate-700"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Clear Search
          </Button>
          {hasActiveFilters && (
            <Button
              variant="outline"
              onClick={onClearFilters}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              <Filter className="h-4 w-4 mr-2" />
              Reset Filters
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function NoResultsInline({
  query,
  onSuggestionClick,
  context = "global",
}: {
  query: string;
  onSuggestionClick?: (suggestion: string) => void;
  context?: "global" | "marketplace" | "social" | "analytics" | "distribution";
}) {
  const suggestedCorrection = Object.entries(COMMON_CORRECTIONS).find(
    ([typo]) => query.toLowerCase().includes(typo),
  );

  return (
    <div className="flex items-center gap-4 p-4 rounded-lg bg-slate-800/50 border border-slate-700">
      <Search className="h-5 w-5 text-slate-500" />
      <div className="flex-1">
        <p className="text-slate-300">No results for "{query}"</p>
        {suggestedCorrection && (
          <button
            className="text-sm text-purple-400 hover:text-purple-300 mt-1"
            onClick={() =>
              onSuggestionClick?.(
                query
                  .toLowerCase()
                  .replace(suggestedCorrection[0], suggestedCorrection[1]),
              )
            }
          >
            Did you mean "
            {query
              .toLowerCase()
              .replace(suggestedCorrection[0], suggestedCorrection[1])}
            "?
          </button>
        )}
      </div>
    </div>
  );
}

export function FilterNoResultsState({
  onClearFilters,
  activeFilterCount,
}: {
  onClearFilters: () => void;
  activeFilterCount: number;
}) {
  return (
    <div className="text-center py-12">
      <Filter className="h-16 w-16 mx-auto text-slate-600 mb-4" />
      <h3 className="text-xl font-semibold text-white mb-2">
        No matching results
      </h3>
      <p className="text-slate-400 mb-6">
        Your {activeFilterCount} active filter
        {activeFilterCount !== 1 ? "s" : ""} didn't match any items.
        <br />
        Try adjusting or clearing your filters.
      </p>
      <Button
        variant="outline"
        onClick={onClearFilters}
        className="border-purple-500/50 text-purple-300 hover:bg-purple-500/10"
      >
        <RefreshCw className="h-4 w-4 mr-2" />
        Clear All Filters
      </Button>
    </div>
  );
}

export default NoResultsState;
