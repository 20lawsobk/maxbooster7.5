import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useRequireAdmin } from "@/hooks/useRequireAuth";
import {
  Music, TrendingUp, DollarSign, Zap, BarChart2, Globe, Hash,
  Loader2, RefreshCw, Star, Target, ChevronDown, ChevronUp, Filter,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BeatSample {
  id: string;
  genre: string;
  mood: string;
  bpm: number;
  key: string;
  price: number;
  hooks: string[];
  description: string;
  engagementScore: number;
  salesScore: number;
  combinedScore: number;
  viralPotential: number;
  conversionRate: number;
  estimatedMonthlyRevenue: number;
  topPlatform: string;
}

interface PostSample {
  id: string;
  platform: string;
  contentType: string;
  genre: string;
  caption: string;
  hashtags: string[];
  cta: string;
  peakHours: number[];
  bestContentType: string;
  isBestContentType: boolean;
  engagementScore: number;
  salesScore: number;
  combinedScore: number;
  predictedReach: number;
  predictedLikes: number;
  predictedShares: number;
  conversionRate: number;
  estimatedRevenue: number;
}

interface MatrixCell {
  bestContentType: string;
  combinedScore: number;
  engagementScore: number;
  salesScore: number;
  estimatedRevenue: number;
}

interface SummaryData {
  topGenres: Array<{
    genre: string; avgScore: number; topMood: string; topScore: number;
    marketDemand: number; avgSalePrice: number; trendMomentum: number;
    monthlySearchVolume: number;
  }>;
  topContentCombos: Array<{
    platform: string; contentType: string; avgScore: number;
    reachMultiplier: number; avgEngagementRate: number;
  }>;
  totalBeatSamples: number;
  totalPostSamples: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_ICONS: Record<string, string> = {
  instagram: "📸", tiktok: "🎵", twitter: "🐦",
  youtube: "▶️", facebook: "👥", linkedin: "💼",
};
const GENRE_ICONS: Record<string, string> = {
  trap:"🔥", hiphop:"🎤", "r&b":"🎸", drill:"⚡", lofi:"☕", lo_fi:"☕",
  pop:"⭐", electronic:"🎛️", indie:"🎸", afrobeats:"🌍", dancehall:"🏝️", jazz:"🎷",
};
const MOOD_COLORS: Record<string, string> = {
  dark:"bg-gray-800 text-gray-100", empowering:"bg-yellow-500 text-yellow-950",
  chill:"bg-blue-500 text-white", aggressive:"bg-red-600 text-white",
  melancholic:"bg-indigo-500 text-white", energetic:"bg-orange-500 text-white",
  nostalgic:"bg-amber-600 text-white", euphoric:"bg-pink-500 text-white",
};

const GENRES = [
  "trap","hiphop","r&b","drill","lofi","pop",
  "electronic","indie","afrobeats","dancehall","lo_fi","jazz",
];

function scoreColor(score: number) {
  if (score >= 80) return "text-green-400";
  if (score >= 60) return "text-yellow-400";
  if (score >= 40) return "text-orange-400";
  return "text-red-400";
}
function scoreBg(score: number) {
  if (score >= 80) return "bg-green-500/20 border-green-500/40";
  if (score >= 60) return "bg-yellow-500/20 border-yellow-500/40";
  if (score >= 40) return "bg-orange-500/20 border-orange-500/40";
  return "bg-red-500/20 border-red-500/40";
}
function formatRevenue(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n}`;
}

// ─── Summary tab ──────────────────────────────────────────────────────────────

function SummaryTab() {
  const { data, isLoading } = useQuery<SummaryData>({
    queryKey: ["/api/admin/content-sampler/summary"],
    staleTime: 1000 * 60 * 5,
  });

  if (isLoading) return <LoadingSpinner label="Scoring all genres & platforms…" />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label:"Beat samples", value: data.totalBeatSamples, icon:<Music className="w-4 h-4"/>, color:"text-purple-400" },
          { label:"Post samples", value: data.totalPostSamples, icon:<Globe className="w-4 h-4"/>, color:"text-blue-400" },
          { label:"Top genre", value: data.topGenres[0]?.genre.toUpperCase(), icon:<Star className="w-4 h-4"/>, color:"text-yellow-400" },
          { label:"Top platform", value: data.topContentCombos[0]?.platform.toUpperCase(), icon:<TrendingUp className="w-4 h-4"/>, color:"text-green-400" },
        ].map(s => (
          <Card key={s.label} className="bg-white/5 border-white/10">
            <CardContent className="pt-4 pb-3">
              <div className={`flex items-center gap-1.5 ${s.color} mb-1`}>{s.icon}<span className="text-xs font-medium uppercase tracking-wide">{s.label}</span></div>
              <div className="text-2xl font-bold text-white">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Top genres */}
        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Music className="w-4 h-4 text-purple-400"/>Top Genres by Combined Score</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {data.topGenres.map((g, i) => (
              <div key={g.genre} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-4">{i+1}</span>
                <span className="text-lg">{GENRE_ICONS[g.genre] || "🎵"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-sm font-medium capitalize">{g.genre}</span>
                    <span className={`text-sm font-bold ${scoreColor(g.avgScore)}`}>{g.avgScore}</span>
                  </div>
                  <Progress value={g.avgScore} className="h-1.5" />
                  <div className="flex gap-3 mt-0.5">
                    <span className="text-[10px] text-muted-foreground">Best mood: <span className="text-white">{g.topMood}</span></span>
                    <span className="text-[10px] text-muted-foreground">Avg price: <span className="text-green-400">${g.avgSalePrice}</span></span>
                    <span className="text-[10px] text-muted-foreground">Momentum: <span className="text-yellow-400">{g.trendMomentum}</span></span>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Top content combos */}
        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Target className="w-4 h-4 text-blue-400"/>Top Platform × Content Type</CardTitle>
            <CardDescription className="text-xs">Averaged across all genres</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {data.topContentCombos.map((c, i) => (
              <div key={c.platform+c.contentType} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-4">{i+1}</span>
                <span className="text-lg">{PLATFORM_ICONS[c.platform] || "📱"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-sm font-medium capitalize">{c.platform} <span className="text-muted-foreground">·</span> {c.contentType}</span>
                    <span className={`text-sm font-bold ${scoreColor(c.avgScore)}`}>{c.avgScore}</span>
                  </div>
                  <Progress value={c.avgScore} className="h-1.5" />
                  <div className="flex gap-3 mt-0.5">
                    <span className="text-[10px] text-muted-foreground">Reach ×<span className="text-white">{c.reachMultiplier}</span></span>
                    <span className="text-[10px] text-muted-foreground">Eng: <span className="text-blue-400">{(c.avgEngagementRate*100).toFixed(2)}%</span></span>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Beats tab ────────────────────────────────────────────────────────────────

function BeatsTab() {
  const [filterGenre, setFilterGenre] = useState("all");
  const [filterMood, setFilterMood] = useState("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"combinedScore"|"engagementScore"|"salesScore"|"estimatedMonthlyRevenue">("combinedScore");
  const [showCount, setShowCount] = useState(24);

  const { data, isLoading } = useQuery<{ total: number; results: BeatSample[] }>({
    queryKey: ["/api/admin/content-sampler/beats"],
    staleTime: 1000 * 60 * 5,
  });

  if (isLoading) return <LoadingSpinner label="Generating 96 beat samples…" />;
  if (!data) return null;

  const moods = ["all","dark","empowering","chill","aggressive","melancholic","energetic","nostalgic","euphoric"];

  let results = data.results;
  if (filterGenre !== "all") results = results.filter(b => b.genre === filterGenre);
  if (filterMood !== "all") results = results.filter(b => b.mood === filterMood);
  if (search) results = results.filter(b => b.genre.includes(search.toLowerCase()) || b.mood.includes(search.toLowerCase()) || b.hooks.some(h => h.toLowerCase().includes(search.toLowerCase())));
  results = [...results].sort((a, b) => (b[sortBy] as number) - (a[sortBy] as number));

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Input placeholder="Search genre, mood, hook…" value={search} onChange={e => setSearch(e.target.value)} className="w-48 h-8 text-sm bg-white/5 border-white/20" />
        <Select value={filterGenre} onValueChange={setFilterGenre}>
          <SelectTrigger className="w-36 h-8 text-sm bg-white/5 border-white/20"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All genres</SelectItem>
            {GENRES.map(g => <SelectItem key={g} value={g}>{GENRE_ICONS[g]} {g}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterMood} onValueChange={setFilterMood}>
          <SelectTrigger className="w-36 h-8 text-sm bg-white/5 border-white/20"><SelectValue /></SelectTrigger>
          <SelectContent>
            {moods.map(m => <SelectItem key={m} value={m}>{m === "all" ? "All moods" : m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={v => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="w-44 h-8 text-sm bg-white/5 border-white/20"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="combinedScore">Sort: Combined</SelectItem>
            <SelectItem value="engagementScore">Sort: Engagement</SelectItem>
            <SelectItem value="salesScore">Sort: Sales</SelectItem>
            <SelectItem value="estimatedMonthlyRevenue">Sort: Revenue</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">{results.length} beats</span>
      </div>

      {/* Results grid */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {results.slice(0, showCount).map((beat, i) => (
          <Card key={beat.id} className={`border ${scoreBg(beat.combinedScore)} transition-all hover:scale-[1.01]`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{GENRE_ICONS[beat.genre] || "🎵"}</span>
                  <div>
                    <div className="font-semibold text-sm capitalize">{beat.genre}</div>
                    <Badge className={`text-[10px] px-1.5 py-0 h-4 ${MOOD_COLORS[beat.mood] || "bg-white/10"}`}>{beat.mood}</Badge>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-xl font-bold ${scoreColor(beat.combinedScore)}`}>{beat.combinedScore}</div>
                  <div className="text-[10px] text-muted-foreground">combined</div>
                </div>
              </div>

              {/* Score bars */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <div className="flex justify-between text-[10px] mb-0.5">
                    <span className="text-muted-foreground">Engagement</span>
                    <span className={scoreColor(beat.engagementScore)}>{beat.engagementScore}</span>
                  </div>
                  <Progress value={beat.engagementScore} className="h-1" />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] mb-0.5">
                    <span className="text-muted-foreground">Sales</span>
                    <span className={scoreColor(beat.salesScore)}>{beat.salesScore}</span>
                  </div>
                  <Progress value={beat.salesScore} className="h-1" />
                </div>
              </div>

              {/* Meta */}
              <div className="flex gap-2 text-[11px] mb-2.5 flex-wrap">
                <span className="bg-white/10 rounded px-1.5 py-0.5">🥁 {beat.bpm} BPM</span>
                <span className="bg-white/10 rounded px-1.5 py-0.5">🎹 {beat.key}</span>
                <span className="bg-green-500/20 text-green-400 rounded px-1.5 py-0.5">${beat.price} lease</span>
                <span className="bg-white/10 rounded px-1.5 py-0.5 capitalize">{PLATFORM_ICONS[beat.topPlatform]} {beat.topPlatform}</span>
              </div>

              {/* Hooks */}
              <div className="text-[10px] text-muted-foreground mb-2">
                {beat.hooks.slice(0,2).map((h,j) => (
                  <span key={j} className="inline-block bg-white/5 rounded px-1.5 py-0.5 mr-1 mb-1 text-white/70">"{h}"</span>
                ))}
              </div>

              {/* Revenue */}
              <div className="flex items-center justify-between pt-2 border-t border-white/5">
                <div className="text-[10px] text-muted-foreground">Est. monthly</div>
                <div className="text-sm font-semibold text-green-400">{formatRevenue(beat.estimatedMonthlyRevenue)}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {results.length > showCount && (
        <Button variant="outline" className="w-full border-white/20" onClick={() => setShowCount(c => c + 24)}>
          <ChevronDown className="w-4 h-4 mr-2" />Show more ({results.length - showCount} remaining)
        </Button>
      )}
    </div>
  );
}

// ─── Posts tab ────────────────────────────────────────────────────────────────

function PostsTab() {
  const [genre, setGenre] = useState("trap");
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [sortBy, setSortBy] = useState<"combinedScore"|"engagementScore"|"salesScore"|"estimatedRevenue">("combinedScore");
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery<{ total: number; results: PostSample[] }>({
    queryKey: ["/api/admin/content-sampler/posts", genre],
    queryFn: () => fetch(`/api/admin/content-sampler/posts?genre=${genre}`).then(r => r.json()),
    staleTime: 1000 * 60 * 5,
  });

  if (isLoading) return <LoadingSpinner label="Generating post samples…" />;
  if (!data) return null;

  let results = data.results;
  if (filterPlatform !== "all") results = results.filter(p => p.platform === filterPlatform);
  results = [...results].sort((a, b) => (b[sortBy] as number) - (a[sortBy] as number));

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={genre} onValueChange={v => { setGenre(v); }}>
          <SelectTrigger className="w-36 h-8 text-sm bg-white/5 border-white/20"><SelectValue /></SelectTrigger>
          <SelectContent>
            {GENRES.map(g => <SelectItem key={g} value={g}>{GENRE_ICONS[g]} {g}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterPlatform} onValueChange={setFilterPlatform}>
          <SelectTrigger className="w-36 h-8 text-sm bg-white/5 border-white/20"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            {["instagram","tiktok","twitter","youtube","facebook","linkedin"].map(p => (
              <SelectItem key={p} value={p}>{PLATFORM_ICONS[p]} {p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={v => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="w-44 h-8 text-sm bg-white/5 border-white/20"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="combinedScore">Sort: Combined</SelectItem>
            <SelectItem value="engagementScore">Sort: Engagement</SelectItem>
            <SelectItem value="salesScore">Sort: Sales</SelectItem>
            <SelectItem value="estimatedRevenue">Sort: Revenue</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">{results.length} posts</span>
      </div>

      {/* Results */}
      <div className="space-y-2.5">
        {results.map((post) => {
          const isOpen = expanded === post.id;
          return (
            <Card key={post.id} className={`border ${scoreBg(post.combinedScore)}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpanded(isOpen ? null : post.id)}>
                  <span className="text-xl">{PLATFORM_ICONS[post.platform]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm capitalize">{post.platform}</span>
                      <Badge variant="outline" className="text-[10px] border-white/20 capitalize">{post.contentType}</Badge>
                      {post.isBestContentType && <Badge className="text-[10px] bg-yellow-500/20 text-yellow-400 border-yellow-500/30">⭐ Best format</Badge>}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate mt-0.5">{post.caption.slice(0, 80)}…</div>
                  </div>
                  <div className="flex gap-4 text-right shrink-0">
                    <div>
                      <div className={`text-base font-bold ${scoreColor(post.combinedScore)}`}>{post.combinedScore}</div>
                      <div className="text-[10px] text-muted-foreground">combined</div>
                    </div>
                    <div>
                      <div className="text-base font-bold text-green-400">{formatRevenue(post.estimatedRevenue)}</div>
                      <div className="text-[10px] text-muted-foreground">est. rev</div>
                    </div>
                    <div className="flex items-center">
                      {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground"/> : <ChevronDown className="w-4 h-4 text-muted-foreground"/>}
                    </div>
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
                    {/* Scores */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label:"Engagement", value:post.engagementScore, icon:<Zap className="w-3 h-3"/> },
                        { label:"Sales", value:post.salesScore, icon:<DollarSign className="w-3 h-3"/> },
                        { label:"Reach", value:post.predictedReach.toLocaleString(), icon:<Globe className="w-3 h-3"/>, raw:true },
                        { label:"Conversion", value:`${post.conversionRate}%`, icon:<Target className="w-3 h-3"/>, raw:true },
                      ].map(m => (
                        <div key={m.label} className="bg-white/5 rounded-lg p-2.5">
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-1">{m.icon}{m.label}</div>
                          <div className={`text-base font-bold ${m.raw ? "text-white" : scoreColor(m.value as number)}`}>
                            {m.raw ? m.value : m.value}
                          </div>
                          {!m.raw && <Progress value={m.value as number} className="h-1 mt-1" />}
                        </div>
                      ))}
                    </div>

                    {/* Caption */}
                    <div className="bg-white/5 rounded-lg p-3">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Sample caption</div>
                      <p className="text-sm leading-relaxed text-white/90">{post.caption}</p>
                      <p className="text-sm text-blue-400 mt-1">{post.cta}</p>
                    </div>

                    {/* Hashtags */}
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1"><Hash className="w-3 h-3"/>Hashtags</div>
                      <div className="flex flex-wrap gap-1">
                        {post.hashtags.map(h => (
                          <span key={h} className="text-[11px] bg-blue-500/20 text-blue-300 rounded px-2 py-0.5">{h}</span>
                        ))}
                      </div>
                    </div>

                    {/* Peak hours */}
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>⏰ Peak hours:</span>
                      {post.peakHours.map(h => (
                        <span key={h} className="bg-white/10 rounded px-1.5 py-0.5 text-white">{h}:00</span>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Matrix tab ───────────────────────────────────────────────────────────────

function MatrixTab() {
  const { data, isLoading } = useQuery<{
    matrix: Record<string, Record<string, MatrixCell>>;
    topCombinations: Array<{ genre: string; platform: string; contentType: string; combinedScore: number; estimatedRevenue: number }>;
    platforms: string[];
    genres: string[];
  }>({
    queryKey: ["/api/admin/content-sampler/matrix"],
    staleTime: 1000 * 60 * 5,
  });

  if (isLoading) return <LoadingSpinner label="Building genre × platform matrix…" />;
  if (!data) return null;

  const { matrix, topCombinations, platforms, genres } = data;

  return (
    <div className="space-y-6">
      {/* Top 20 combos */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><BarChart2 className="w-4 h-4 text-yellow-400"/>Top 20 Genre × Platform × Content Type Combinations</CardTitle>
          <CardDescription className="text-xs">Ranked by combined engagement + sales score</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            {topCombinations.map((c, i) => (
              <div key={`${c.genre}-${c.platform}`} className="flex items-center gap-3 text-sm">
                <span className="text-xs text-muted-foreground w-5 text-right">{i+1}</span>
                <span>{GENRE_ICONS[c.genre] || "🎵"}</span>
                <span className="font-medium capitalize w-24">{c.genre}</span>
                <span>{PLATFORM_ICONS[c.platform]}</span>
                <span className="text-muted-foreground capitalize w-20">{c.platform}</span>
                <Badge variant="outline" className="text-[10px] border-white/20 capitalize">{c.contentType}</Badge>
                <div className="flex-1" />
                <span className={`font-bold w-10 text-right ${scoreColor(c.combinedScore)}`}>{c.combinedScore}</span>
                <span className="text-green-400 text-xs w-14 text-right">{formatRevenue(c.estimatedRevenue)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Heatmap grid */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Genre × Platform Heatmap</CardTitle>
          <CardDescription className="text-xs">Combined score (higher = better engagement + sales fit)</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs min-w-[600px]">
            <thead>
              <tr>
                <th className="text-left py-1 pr-3 font-medium text-muted-foreground w-24">Genre</th>
                {platforms.map(p => (
                  <th key={p} className="text-center py-1 px-2 font-medium text-muted-foreground capitalize">
                    <span>{PLATFORM_ICONS[p]}</span><br/>{p.slice(0,4)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {genres.map(genre => (
                <tr key={genre} className="border-t border-white/5">
                  <td className="py-1.5 pr-3 font-medium capitalize">
                    {GENRE_ICONS[genre]} {genre}
                  </td>
                  {platforms.map(platform => {
                    const cell = matrix[genre]?.[platform];
                    if (!cell) return <td key={platform} className="text-center py-1.5 px-2 text-muted-foreground">—</td>;
                    const sc = cell.combinedScore;
                    const bg = sc >= 80 ? "bg-green-500/30" : sc >= 65 ? "bg-yellow-500/20" : sc >= 50 ? "bg-orange-500/15" : "bg-red-500/10";
                    return (
                      <td key={platform} className="text-center py-1.5 px-2">
                        <div className={`rounded px-1 py-0.5 ${bg}`}>
                          <span className={`font-bold ${scoreColor(sc)}`}>{sc}</span>
                          <div className="text-[9px] text-muted-foreground capitalize">{cell.bestContentType}</div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function LoadingSpinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
      <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ContentSampler() {
  const { user, isLoading: authLoading } = useRequireAdmin();

  if (authLoading) return <LoadingSpinner label="Authenticating…" />;
  if (!user || user.role !== "admin") return null;

  return (
    <AppLayout>
      <div className="container mx-auto max-w-7xl px-4 py-6 space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Content Sampler</h1>
              <p className="text-muted-foreground text-sm">All genres × moods (96 beats) and all platforms × content types (24 posts) — scored for engagement and sales</p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="summary">
          <TabsList className="bg-white/5 border border-white/10">
            <TabsTrigger value="summary" className="data-[state=active]:bg-white/10">
              <BarChart2 className="w-3.5 h-3.5 mr-1.5" />Summary
            </TabsTrigger>
            <TabsTrigger value="beats" className="data-[state=active]:bg-white/10">
              <Music className="w-3.5 h-3.5 mr-1.5" />Beats (96)
            </TabsTrigger>
            <TabsTrigger value="posts" className="data-[state=active]:bg-white/10">
              <Globe className="w-3.5 h-3.5 mr-1.5" />Posts (24)
            </TabsTrigger>
            <TabsTrigger value="matrix" className="data-[state=active]:bg-white/10">
              <Hash className="w-3.5 h-3.5 mr-1.5" />Matrix
            </TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="mt-4"><SummaryTab /></TabsContent>
          <TabsContent value="beats" className="mt-4"><BeatsTab /></TabsContent>
          <TabsContent value="posts" className="mt-4"><PostsTab /></TabsContent>
          <TabsContent value="matrix" className="mt-4"><MatrixTab /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
