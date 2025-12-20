import { useState, memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MessageSquare,
  Search,
  Sparkles,
  TrendingUp,
  DollarSign,
  Users,
  Music,
  Globe,
  Calendar,
  BarChart3,
  PieChart,
  LineChart,
  Send,
  Loader2,
  History,
  Lightbulb,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  X,
} from 'lucide-react';

interface QueryResult {
  type: 'chart' | 'metric' | 'table' | 'text';
  title: string;
  data: any;
  summary: string;
}

interface QueryHistory {
  query: string;
  timestamp: Date;
  resultType: string;
}

interface NaturalLanguageQueryProps {
  onQuery?: (query: string) => Promise<QueryResult>;
}

const exampleQueries = [
  { text: "What were my top performing tracks last month?", icon: Music },
  { text: "Show me streaming trends for the past 6 months", icon: TrendingUp },
  { text: "Which countries generate the most revenue?", icon: Globe },
  { text: "Compare my Spotify vs Apple Music performance", icon: BarChart3 },
  { text: "How many new listeners did I gain this week?", icon: Users },
  { text: "What's my average revenue per stream by platform?", icon: DollarSign },
  { text: "Show playlist additions in the last 30 days", icon: Calendar },
  { text: "Which demographics engage most with my music?", icon: PieChart },
];

const mockResults: Record<string, QueryResult> = {
  'top performing': {
    type: 'table',
    title: 'Top Performing Tracks - Last Month',
    summary: 'Your top 5 tracks generated 78% of total streams. "Summer Nights" leads with 125K streams.',
    data: {
      tracks: [
        { name: 'Summer Nights', streams: 125000, revenue: 450, growth: 23 },
        { name: 'Midnight Drive', streams: 98000, revenue: 352, growth: 15 },
        { name: 'Ocean Waves', streams: 76000, revenue: 273, growth: 8 },
        { name: 'City Lights', streams: 54000, revenue: 194, growth: -5 },
        { name: 'Mountain High', streams: 43000, revenue: 155, growth: 12 },
      ],
    },
  },
  'streaming trends': {
    type: 'chart',
    title: 'Streaming Trends - Last 6 Months',
    summary: 'Overall streaming up 34% with a notable spike in October due to playlist placements.',
    data: {
      chartType: 'line',
      labels: ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      values: [85000, 92000, 105000, 156000, 142000, 138000],
      change: 34,
    },
  },
  'countries': {
    type: 'chart',
    title: 'Revenue by Country',
    summary: 'United States leads with 45% of total revenue, followed by UK (18%) and Germany (12%).',
    data: {
      chartType: 'bar',
      items: [
        { name: 'United States', value: 4500, percentage: 45 },
        { name: 'United Kingdom', value: 1800, percentage: 18 },
        { name: 'Germany', value: 1200, percentage: 12 },
        { name: 'Canada', value: 850, percentage: 8.5 },
        { name: 'Australia', value: 650, percentage: 6.5 },
      ],
    },
  },
  'spotify': {
    type: 'chart',
    title: 'Platform Comparison: Spotify vs Apple Music',
    summary: 'Spotify generates 2.3x more streams but Apple Music has a 40% higher revenue per stream.',
    data: {
      chartType: 'comparison',
      platforms: [
        { name: 'Spotify', streams: 450000, revenue: 1620, rps: 0.0036, color: '#1DB954' },
        { name: 'Apple Music', streams: 195000, revenue: 975, rps: 0.005, color: '#FA2D48' },
      ],
    },
  },
  'new listeners': {
    type: 'metric',
    title: 'New Listeners This Week',
    summary: 'You gained 3,450 new listeners this week, a 12% increase from last week.',
    data: {
      value: 3450,
      change: 12,
      comparison: 3080,
      period: 'week',
    },
  },
  'revenue per stream': {
    type: 'table',
    title: 'Average Revenue Per Stream by Platform',
    summary: 'Tidal offers the highest payout at $0.0125 per stream, while YouTube Music pays the lowest.',
    data: {
      platforms: [
        { name: 'Tidal', rps: 0.0125, streams: 12000, revenue: 150 },
        { name: 'Apple Music', rps: 0.005, streams: 195000, revenue: 975 },
        { name: 'Amazon Music', rps: 0.004, streams: 85000, revenue: 340 },
        { name: 'Spotify', rps: 0.0036, streams: 450000, revenue: 1620 },
        { name: 'YouTube Music', rps: 0.002, streams: 120000, revenue: 240 },
      ],
    },
  },
  'playlist additions': {
    type: 'metric',
    title: 'Playlist Activity - Last 30 Days',
    summary: 'Added to 8 new playlists with a combined reach of 4.2M listeners.',
    data: {
      value: 8,
      reach: 4200000,
      topPlaylist: 'Chill Vibes',
      estimatedStreams: 45000,
    },
  },
  'demographics': {
    type: 'chart',
    title: 'Audience Demographics Engagement',
    summary: 'The 25-34 age group shows the highest engagement at 8.5%, followed by 18-24 at 7.2%.',
    data: {
      chartType: 'pie',
      segments: [
        { name: '18-24', value: 28, engagement: 7.2 },
        { name: '25-34', value: 35, engagement: 8.5 },
        { name: '35-44', value: 22, engagement: 6.1 },
        { name: '45-54', value: 10, engagement: 4.8 },
        { name: '55+', value: 5, engagement: 3.2 },
      ],
    },
  },
};

const ResultChart = memo(({ data }: { data: any }) => {
  if (data.chartType === 'line') {
    const max = Math.max(...data.values);
    const min = Math.min(...data.values);
    const range = max - min || 1;
    
    const points = data.values
      .map((value: number, i: number) => {
        const x = (i / (data.values.length - 1)) * 100;
        const y = 100 - ((value - min) / range) * 80 - 10;
        return `${x},${y}`;
      })
      .join(' ');

    return (
      <div className="space-y-4">
        <div className="h-48 relative">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
            <defs>
              <linearGradient id="queryGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d={`M0,100 L0,${100 - ((data.values[0] - min) / range) * 80 - 10} ${data.values
                .map((v: number, i: number) => {
                  const x = (i / (data.values.length - 1)) * 100;
                  const y = 100 - ((v - min) / range) * 80 - 10;
                  return `L${x},${y}`;
                })
                .join(' ')} L100,100 Z`}
              fill="url(#queryGradient)"
            />
            <polyline
              points={points}
              fill="none"
              stroke="#6366f1"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          {data.labels.map((label: string, i: number) => (
            <span key={i}>{label}</span>
          ))}
        </div>
      </div>
    );
  }

  if (data.chartType === 'bar') {
    return (
      <div className="space-y-3">
        {data.items.map((item: any, idx: number) => (
          <div key={idx} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>{item.name}</span>
              <span className="font-semibold">${item.value.toLocaleString()} ({item.percentage}%)</span>
            </div>
            <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${item.percentage}%` }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (data.chartType === 'comparison') {
    return (
      <div className="grid grid-cols-2 gap-6">
        {data.platforms.map((platform: any, idx: number) => (
          <div key={idx} className="text-center p-4 rounded-lg" style={{ backgroundColor: `${platform.color}15` }}>
            <p className="font-bold text-lg" style={{ color: platform.color }}>{platform.name}</p>
            <div className="mt-4 space-y-2">
              <div>
                <p className="text-2xl font-bold">{(platform.streams / 1000).toFixed(0)}K</p>
                <p className="text-xs text-muted-foreground">Streams</p>
              </div>
              <div>
                <p className="text-xl font-bold">${platform.revenue.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Revenue</p>
              </div>
              <div>
                <p className="text-lg font-bold">${platform.rps.toFixed(4)}</p>
                <p className="text-xs text-muted-foreground">Per Stream</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (data.chartType === 'pie') {
    const colors = ['#6366f1', '#ec4899', '#22c55e', '#f59e0b', '#06b6d4'];
    return (
      <div className="grid grid-cols-5 gap-2">
        {data.segments.map((segment: any, idx: number) => (
          <div key={idx} className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
            <div 
              className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: colors[idx] }}
            >
              {segment.value}%
            </div>
            <p className="text-xs font-medium">{segment.name}</p>
            <p className="text-xs text-muted-foreground">{segment.engagement}% eng.</p>
          </div>
        ))}
      </div>
    );
  }

  return null;
});
ResultChart.displayName = 'ResultChart';

const ResultMetric = memo(({ data }: { data: any }) => {
  return (
    <div className="flex items-center justify-center gap-8 py-8">
      <div className="text-center">
        <motion.p
          className="text-5xl font-bold text-indigo-600"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          {typeof data.value === 'number' ? data.value.toLocaleString() : data.value}
        </motion.p>
        {data.change !== undefined && (
          <div className={`flex items-center justify-center gap-1 mt-2 ${data.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {data.change >= 0 ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
            <span className="font-medium">{Math.abs(data.change)}% vs last {data.period}</span>
          </div>
        )}
        {data.reach && (
          <p className="text-sm text-muted-foreground mt-2">
            Combined reach: {(data.reach / 1000000).toFixed(1)}M listeners
          </p>
        )}
      </div>
    </div>
  );
});
ResultMetric.displayName = 'ResultMetric';

const ResultTable = memo(({ data }: { data: any }) => {
  const items = data.tracks || data.platforms || [];
  const isTrackData = !!data.tracks;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left p-3 font-semibold">{isTrackData ? 'Track' : 'Platform'}</th>
            <th className="text-right p-3 font-semibold">{isTrackData ? 'Streams' : 'RPS'}</th>
            <th className="text-right p-3 font-semibold">Revenue</th>
            <th className="text-right p-3 font-semibold">{isTrackData ? 'Growth' : 'Streams'}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: any, idx: number) => (
            <motion.tr
              key={idx}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              className={idx % 2 === 0 ? 'bg-slate-50 dark:bg-slate-900/50' : ''}
            >
              <td className="p-3 font-medium">{item.name}</td>
              <td className="p-3 text-right">
                {isTrackData ? item.streams.toLocaleString() : `$${item.rps.toFixed(4)}`}
              </td>
              <td className="p-3 text-right">${item.revenue.toLocaleString()}</td>
              <td className="p-3 text-right">
                {isTrackData ? (
                  <span className={item.growth >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {item.growth >= 0 ? '+' : ''}{item.growth}%
                  </span>
                ) : (
                  item.streams.toLocaleString()
                )}
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
ResultTable.displayName = 'ResultTable';

export default function NaturalLanguageQuery({ onQuery }: NaturalLanguageQueryProps) {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [history, setHistory] = useState<QueryHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const handleQuery = useCallback(async (queryText: string) => {
    setIsLoading(true);
    setResult(null);

    const queryLower = queryText.toLowerCase();
    let matchedResult: QueryResult | null = null;
    
    for (const [key, value] of Object.entries(mockResults)) {
      if (queryLower.includes(key)) {
        matchedResult = value;
        break;
      }
    }

    await new Promise(resolve => setTimeout(resolve, 1500));

    if (matchedResult) {
      setResult(matchedResult);
      setHistory(prev => [
        { query: queryText, timestamp: new Date(), resultType: matchedResult!.type },
        ...prev.slice(0, 9),
      ]);
    } else {
      setResult({
        type: 'text',
        title: 'Query Result',
        summary: `I analyzed your question: "${queryText}". Based on your current data, here's what I found...`,
        data: null,
      });
    }

    setIsLoading(false);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      handleQuery(query);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-indigo-500" />
            Natural Language Analytics
          </h2>
          <p className="text-muted-foreground mt-1">
            Ask questions about your music data in plain English
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowHistory(!showHistory)}
        >
          <History className="h-4 w-4 mr-2" />
          History
        </Button>
      </div>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask anything about your music analytics..."
                className="pl-12 pr-12 h-14 text-lg"
              />
              <Button
                type="submit"
                size="sm"
                disabled={isLoading || !query.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </form>

          <div className="mt-6">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="h-4 w-4 text-yellow-500" />
              <span className="text-sm font-medium">Try asking:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {exampleQueries.map((example, idx) => {
                const Icon = example.icon;
                return (
                  <Button
                    key={idx}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      setQuery(example.text);
                      handleQuery(example.text);
                    }}
                  >
                    <Icon className="h-3 w-3 mr-1" />
                    {example.text}
                  </Button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <AnimatePresence>
        {showHistory && history.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <History className="h-5 w-5" />
                    Recent Queries
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setShowHistory(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {history.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer"
                      onClick={() => {
                        setQuery(item.query);
                        handleQuery(item.query);
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <Search className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{item.query}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">{item.resultType}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {item.timestamp.toLocaleTimeString()}
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
            <div className="mt-6">
              <Skeleton className="h-48 w-full" />
            </div>
          </CardContent>
        </Card>
      )}

      <AnimatePresence>
        {result && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-indigo-500" />
                      {result.title}
                    </CardTitle>
                    <CardDescription className="mt-2">{result.summary}</CardDescription>
                  </div>
                  <Badge variant="outline" className="capitalize">{result.type}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {result.type === 'chart' && <ResultChart data={result.data} />}
                {result.type === 'metric' && <ResultMetric data={result.data} />}
                {result.type === 'table' && <ResultTable data={result.data} />}
                {result.type === 'text' && (
                  <p className="text-muted-foreground">{result.summary}</p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
