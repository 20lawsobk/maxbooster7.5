import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  Lightbulb,
  TrendingUp,
  Music,
  Sparkles,
  RefreshCw,
  ArrowRight,
  Frown,
  HelpCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SearchEmptyStateProps {
  query: string;
  onSuggestionClick?: (suggestion: string) => void;
  onClearSearch?: () => void;
  showTips?: boolean;
  className?: string;
}

const SEARCH_TIPS = [
  'Try using fewer or more general keywords',
  'Check for spelling mistakes',
  'Try searching for a genre or mood instead',
  'Use quotes for exact phrases: "trap beat"',
  'Filter by BPM range for more specific results',
];

const COMMON_CORRECTIONS: Record<string, string> = {
  'tarp': 'trap',
  'hiphop': 'hip-hop',
  'lofi': 'lo-fi',
  'rnb': 'r&b',
  'dril': 'drill',
  'drll': 'drill',
  'beaat': 'beat',
  'melodc': 'melodic',
  'aggresive': 'aggressive',
  'chil': 'chill',
};

export function SearchEmptyState({
  query,
  onSuggestionClick,
  onClearSearch,
  showTips = true,
  className,
}: SearchEmptyStateProps) {
  const { data: trendingData } = useQuery({
    queryKey: ['/api/search/trending'],
    queryFn: async () => {
      const res = await fetch('/api/search/trending', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch trending');
      return res.json();
    },
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

  const suggestedCorrection = checkSpelling(query);
  const trendingQueries = trendingData?.queries?.slice(0, 6) || [];
  const trendingGenres = trendingData?.genres?.slice(0, 8) || [];

  return (
    <div className={cn('py-12 px-4', className)}>
      <div className="max-w-2xl mx-auto text-center space-y-8">
        <div className="space-y-4">
          <div className="w-20 h-20 mx-auto rounded-full bg-slate-800 flex items-center justify-center">
            <Frown className="h-10 w-10 text-slate-500" />
          </div>
          <h2 className="text-2xl font-bold text-white">No results found</h2>
          <p className="text-slate-400">
            We couldn't find anything matching "{query}"
          </p>
        </div>

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

        {showTips && (
          <Card className="bg-slate-800/50 border-slate-700 text-left">
            <CardContent className="py-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-blue-400" />
                Search Tips
              </h3>
              <ul className="space-y-2">
                {SEARCH_TIPS.map((tip, index) => (
                  <li key={index} className="flex items-start gap-2 text-slate-400">
                    <span className="text-purple-400 mt-1">•</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {trendingQueries.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white flex items-center justify-center gap-2">
              <TrendingUp className="h-5 w-5 text-orange-400" />
              Trending Searches
            </h3>
            <div className="flex flex-wrap justify-center gap-2">
              {trendingQueries.map((item: { query: string }, index: number) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  onClick={() => onSuggestionClick?.(item.query)}
                  className="border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
                >
                  {item.query}
                </Button>
              ))}
            </div>
          </div>
        )}

        {trendingGenres.length > 0 && (
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
                  className="bg-slate-700 text-slate-300 cursor-pointer hover:bg-purple-500/20 hover:text-purple-300 px-4 py-2"
                  onClick={() => onSuggestionClick?.(genre)}
                >
                  {genre}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="pt-4">
          <Button
            variant="outline"
            onClick={onClearSearch}
            className="border-slate-600 text-slate-300 hover:bg-slate-700"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Clear Search
          </Button>
        </div>
      </div>
    </div>
  );
}

export function NoResultsInline({
  query,
  onSuggestionClick,
}: {
  query: string;
  onSuggestionClick?: (suggestion: string) => void;
}) {
  const suggestedCorrection = Object.entries(COMMON_CORRECTIONS).find(
    ([typo]) => query.toLowerCase().includes(typo)
  );

  return (
    <div className="flex items-center gap-4 p-4 rounded-lg bg-slate-800/50 border border-slate-700">
      <Search className="h-5 w-5 text-slate-500" />
      <div className="flex-1">
        <p className="text-slate-300">
          No results for "{query}"
        </p>
        {suggestedCorrection && (
          <button
            className="text-sm text-purple-400 hover:text-purple-300 mt-1"
            onClick={() => onSuggestionClick?.(
              query.toLowerCase().replace(suggestedCorrection[0], suggestedCorrection[1])
            )}
          >
            Did you mean "{query.toLowerCase().replace(suggestedCorrection[0], suggestedCorrection[1])}"?
          </button>
        )}
      </div>
    </div>
  );
}

export function PartialResultsNotice({
  query,
  resultCount,
  category,
}: {
  query: string;
  resultCount: number;
  category?: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-sm">
      <Sparkles className="h-4 w-4 text-yellow-400" />
      <span className="text-yellow-200">
        Showing {resultCount} partial match{resultCount !== 1 ? 'es' : ''} for "{query}"
        {category && ` in ${category}`}. Try adjusting your search for more results.
      </span>
    </div>
  );
}

export function FuzzyMatchNotice({
  originalQuery,
  matchedQuery,
  onUseOriginal,
}: {
  originalQuery: string;
  matchedQuery: string;
  onUseOriginal?: () => void;
}) {
  if (originalQuery.toLowerCase() === matchedQuery.toLowerCase()) return null;

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-sm">
      <div className="flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-blue-400" />
        <span className="text-blue-200">
          Showing results for "{matchedQuery}" instead of "{originalQuery}"
        </span>
      </div>
      {onUseOriginal && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onUseOriginal}
          className="text-blue-300 hover:text-blue-200 h-7"
        >
          Search for "{originalQuery}" instead
        </Button>
      )}
    </div>
  );
}

export default SearchEmptyState;
