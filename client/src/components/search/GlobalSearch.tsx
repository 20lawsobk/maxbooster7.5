import { logger } from '@/lib/logger';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
} from 'lucide-react';
import { useDebounce } from '@/hooks';
import { cn } from '@/lib/utils';

interface AutocompleteSuggestion {
  text: string;
  type: 'query' | 'user' | 'beat' | 'genre';
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
  trend: 'up' | 'down' | 'stable';
}

interface GlobalSearchProps {
  onSearch: (query: string, filters?: any) => void;
  onResultClick?: (result: any) => void;
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
  placeholder = 'Search beats, artists, projects...',
  className,
  showTrending = true,
  showHistory = true,
  showVoiceSearch = true,
  autoFocus = false,
  compact = false,
}: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const debouncedQuery = useDebounce(query, 300);

  const { data: autocompleteData, isLoading: isLoadingAutocomplete } = useQuery({
    queryKey: ['/api/search/autocomplete', debouncedQuery],
    queryFn: async () => {
      if (debouncedQuery.length < 2) return { suggestions: [] };
      const res = await fetch(`/api/search/autocomplete?q=${encodeURIComponent(debouncedQuery)}&limit=8`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch suggestions');
      return res.json();
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 60000,
  });

  const { data: historyData } = useQuery({
    queryKey: ['/api/search/history'],
    queryFn: async () => {
      const res = await fetch('/api/search/history', { credentials: 'include' });
      if (!res.ok) return { history: [] };
      return res.json();
    },
    enabled: showHistory,
    staleTime: 30000,
  });

  const { data: trendingData } = useQuery({
    queryKey: ['/api/search/trending'],
    queryFn: async () => {
      const res = await fetch('/api/search/trending', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch trending');
      return res.json();
    },
    enabled: showTrending,
    staleTime: 300000,
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
    },
  });

  const removeHistoryItemMutation = useMutation({
    mutationFn: async (searchQuery: string) => {
      const res = await fetch(`/api/search/history/${encodeURIComponent(searchQuery)}`, {
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

  const handleSearch = useCallback((searchQuery: string) => {
    if (searchQuery.trim()) {
      onSearch(searchQuery.trim());
      setIsOpen(false);
    }
  }, [onSearch]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch(query);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const startVoiceSearch = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      logger.warn('Speech recognition not supported');
      return;
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    
    recognition.onresult = (event: any) => {
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
      case 'user': return <User className="h-4 w-4 text-blue-400" />;
      case 'beat': return <Music className="h-4 w-4 text-purple-400" />;
      case 'genre': return <Disc className="h-4 w-4 text-green-400" />;
      default: return <Search className="h-4 w-4 text-slate-400" />;
    }
  };

  const getTrendIcon = (trend: string) => {
    if (trend === 'up') return <TrendingUp className="h-3 w-3 text-green-400" />;
    if (trend === 'down') return <TrendingUp className="h-3 w-3 text-red-400 rotate-180" />;
    return null;
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <div className={cn('relative', className)}>
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
                'pl-10 pr-20 bg-slate-800/50 border-slate-700 focus:border-purple-500',
                'placeholder:text-slate-500',
                compact ? 'h-9' : 'h-11'
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
                    setQuery('');
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
                    'h-6 w-6',
                    isListening ? 'text-red-400 animate-pulse' : 'text-slate-400 hover:text-white'
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
              {suggestions.map((suggestion: AutocompleteSuggestion, index: number) => (
                <button
                  key={`${suggestion.text}-${index}`}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left rounded-md hover:bg-slate-800 transition-colors"
                  onClick={() => {
                    setQuery(suggestion.text);
                    handleSearch(suggestion.text);
                  }}
                >
                  {getTypeIcon(suggestion.type)}
                  <span 
                    className="text-sm text-slate-200"
                    dangerouslySetInnerHTML={{ __html: (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)))))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))))))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)))))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)))))))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)))))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))))))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)))))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted))) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize((typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)) : (typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(suggestion.highlighted) : suggestion.highlighted)))))))) }}
                  />
                </button>
              ))}
            </div>
          )}

          {showHistory && history.length > 0 && !query && (
            <div className="p-2 border-t border-slate-800">
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <History className="h-3 w-3" />
                  Recent Searches
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-slate-500 hover:text-red-400"
                  onClick={() => clearHistoryMutation.mutate()}
                  disabled={clearHistoryMutation.isPending}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              </div>
              {history.slice(0, 5).map((item: SearchHistoryItem, index: number) => (
                <div
                  key={`${item.query}-${index}`}
                  className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-slate-800 group"
                >
                  <button
                    className="flex items-center gap-3 flex-1 text-left"
                    onClick={() => {
                      setQuery(item.query);
                      handleSearch(item.query);
                    }}
                  >
                    <Clock className="h-4 w-4 text-slate-500" />
                    <span className="text-sm text-slate-300">{item.query}</span>
                    <span className="text-xs text-slate-600">
                      {item.resultCount} results
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeHistoryItemMutation.mutate(item.query);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {showTrending && trending.length > 0 && !query && (
            <div className="p-2 border-t border-slate-800">
              <div className="px-2 py-1 text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                Trending Searches
              </div>
              {trending.slice(0, 6).map((item: TrendingSearch, index: number) => (
                <button
                  key={`${item.query}-${index}`}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left rounded-md hover:bg-slate-800 transition-colors"
                  onClick={() => {
                    setQuery(item.query);
                    handleSearch(item.query);
                  }}
                >
                  <TrendingUp className="h-4 w-4 text-orange-400" />
                  <span className="text-sm text-slate-300 flex-1">{item.query}</span>
                  {getTrendIcon(item.trend)}
                  <Badge variant="secondary" className="text-[10px] bg-slate-800">
                    {item.searchCount}
                  </Badge>
                </button>
              ))}
            </div>
          )}

          {!suggestions.length && !history.length && !trending.length && (
            <div className="p-8 text-center">
              <Search className="h-8 w-8 mx-auto text-slate-600 mb-2" />
              <p className="text-sm text-slate-500">
                Start typing to search
              </p>
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export function CommandSearch({
  onSearch,
  onClose,
}: {
  onSearch: (query: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);

  const { data: searchData, isLoading } = useQuery({
    queryKey: ['/api/search/unified', debouncedQuery],
    queryFn: async () => {
      if (debouncedQuery.length < 2) return null;
      const res = await fetch(`/api/search/unified?q=${encodeURIComponent(debouncedQuery)}&limit=10`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Search failed');
      return res.json();
    },
    enabled: debouncedQuery.length >= 2,
  });

  return (
    <Command className="rounded-lg border border-slate-700 shadow-xl bg-slate-900">
      <CommandInput
        placeholder="Search everything..."
        value={query}
        onValueChange={setQuery}
        className="border-none focus:ring-0"
      />
      <CommandList>
        {isLoading && (
          <div className="p-4 text-center">
            <Loader2 className="h-6 w-6 mx-auto animate-spin text-purple-400" />
          </div>
        )}

        {!isLoading && query.length < 2 && (
          <CommandEmpty>Type at least 2 characters to search</CommandEmpty>
        )}

        {!isLoading && searchData?.totalResults === 0 && (
          <CommandEmpty>No results found for "{query}"</CommandEmpty>
        )}

        {searchData?.categories?.beats?.items?.length > 0 && (
          <CommandGroup heading="Beats">
            {searchData.categories.beats.items.slice(0, 5).map((beat: any) => (
              <CommandItem
                key={beat.id}
                onSelect={() => {
                  onSearch(beat.title);
                  onClose();
                }}
                className="flex items-center gap-3 cursor-pointer"
              >
                <Music className="h-4 w-4 text-purple-400" />
                <div className="flex-1">
                  <span className="font-medium">{beat.title}</span>
                  {beat.genre && (
                    <span className="text-xs text-slate-500 ml-2">{beat.genre}</span>
                  )}
                </div>
                {beat.price && (
                  <Badge variant="secondary" className="text-xs">
                    ${beat.price}
                  </Badge>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {searchData?.categories?.users?.items?.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Artists & Producers">
              {searchData.categories.users.items.slice(0, 5).map((user: any) => (
                <CommandItem
                  key={user.id}
                  onSelect={() => {
                    onSearch(user.username);
                    onClose();
                  }}
                  className="flex items-center gap-3 cursor-pointer"
                >
                  <User className="h-4 w-4 text-blue-400" />
                  <div className="flex-1">
                    <span className="font-medium">
                      {user.firstName && user.lastName
                        ? `${user.firstName} ${user.lastName}`
                        : user.username}
                    </span>
                    {user.username && (
                      <span className="text-xs text-slate-500 ml-2">@{user.username}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {searchData?.categories?.projects?.items?.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Projects">
              {searchData.categories.projects.items.slice(0, 5).map((project: any) => (
                <CommandItem
                  key={project.id}
                  onSelect={() => {
                    onSearch(project.title);
                    onClose();
                  }}
                  className="flex items-center gap-3 cursor-pointer"
                >
                  <Folder className="h-4 w-4 text-green-400" />
                  <span className="font-medium">{project.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </Command>
  );
}

export default GlobalSearch;
