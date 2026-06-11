import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, TrendingUp, Clock, Music, Play, ChevronRight, RefreshCw, Flame, Star, Zap, Disc } from "lucide-react";
import { cn } from "@/lib/utils";

interface DiscoverySection {
  title: string;
  description: string;
  items: Record<string, unknown>[];
}

interface DiscoveryFeedProps {
  onItemClick?: (item: Record<string, unknown>, type: string) => void;
  onSeeAll?: (section: string) => void;
  showPersonalized?: boolean;
  className?: string;
}

export function DiscoveryFeed({
  onItemClick,
  onSeeAll,
  showPersonalized = true,
  className,
}: DiscoveryFeedProps) {
  const [activeTab, setActiveTab] = useState("for-you");

  const {
    data: discoveryData,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["/api/search/discover"],
    queryFn: async () => {
      const res = await fetch("/api/search/discover", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch discovery feed");
      return res.json();
    },
    staleTime: 120000,
  });

  if (isLoading) {
    return <DiscoveryFeedSkeleton />;
  }

  const {
    newReleases,
    trending,
    personalized,
    curatedCollections,
    featuredGenres,
  } = discoveryData || {};

  return (
    <div className={cn("space-y-8", className)}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-purple-400" />
            Discover
          </h1>
          <p className="text-slate-400 mt-1">Find your next favorite beat</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isRefetching}
          className="border-slate-600"
        >
          <RefreshCw
            className={cn("h-4 w-4 mr-2", isRefetching && "animate-spin")}
          />
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-800/50">
          <TabsTrigger
            value="for-you"
            className="data-[state=active]:bg-purple-600"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            For You
          </TabsTrigger>
          <TabsTrigger
            value="trending"
            className="data-[state=active]:bg-purple-600"
          >
            <TrendingUp className="h-4 w-4 mr-2" />
            Trending
          </TabsTrigger>
          <TabsTrigger
            value="new"
            className="data-[state=active]:bg-purple-600"
          >
            <Clock className="h-4 w-4 mr-2" />
            New Releases
          </TabsTrigger>
          <TabsTrigger
            value="genres"
            className="data-[state=active]:bg-purple-600"
          >
            <Music className="h-4 w-4 mr-2" />
            Genres
          </TabsTrigger>
        </TabsList>

        <TabsContent value="for-you" className="mt-6 space-y-8">
          {showPersonalized &&
            personalized &&
            personalized.items?.length > 0 && (
              <DiscoverSection
                title={personalized.title}
                description={personalized.description}
                icon={<Sparkles className="h-5 w-5 text-purple-400" />}
                items={personalized.items}
                onItemClick={(item) => onItemClick?.(item, "beat")}
                onSeeAll={() => onSeeAll?.("personalized")}
                highlight
              />
            )}

          {trending && (
            <DiscoverSection
              title={trending.title}
              description={trending.description}
              icon={<Flame className="h-5 w-5 text-orange-400" />}
              items={trending.items}
              onItemClick={(item) => onItemClick?.(item, "beat")}
              onSeeAll={() => onSeeAll?.("trending")}
            />
          )}

          {newReleases && (
            <DiscoverSection
              title={newReleases.title}
              description={newReleases.description}
              icon={<Clock className="h-5 w-5 text-green-400" />}
              items={newReleases.items}
              onItemClick={(item) => onItemClick?.(item, "beat")}
              onSeeAll={() => onSeeAll?.("new-releases")}
            />
          )}
        </TabsContent>

        <TabsContent value="trending" className="mt-6">
          {trending && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {trending.items?.map(
                (item: Record<string, unknown>, index: number) => (
                  <BeatCard
                    key={item.id}
                    beat={item}
                    rank={index + 1}
                    onClick={() => onItemClick?.(item, "beat")}
                  />
                ),
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="new" className="mt-6">
          {newReleases && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {newReleases.items?.map((item: Record<string, unknown>) => (
                <BeatCard
                  key={item.id}
                  beat={item}
                  isNew
                  onClick={() => onItemClick?.(item, "beat")}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="genres" className="mt-6 space-y-6">
          {featuredGenres && (
            <div className="flex flex-wrap gap-3">
              {featuredGenres.map((genre: string) => (
                <Button
                  key={genre}
                  variant="outline"
                  onClick={() => onSeeAll?.(`genre:${genre}`)}
                  className="border-slate-600 text-slate-300 hover:bg-purple-500/20 hover:text-purple-300 hover:border-purple-500/50"
                >
                  <Music className="h-4 w-4 mr-2" />
                  {genre}
                </Button>
              ))}
            </div>
          )}

          {curatedCollections?.map(
            (collection: DiscoverySection, index: number) => (
              <DiscoverSection
                key={index}
                title={collection.title}
                description={collection.description}
                icon={<Disc className="h-5 w-5 text-blue-400" />}
                items={collection.items}
                onItemClick={(item) => onItemClick?.(item, "beat")}
                onSeeAll={() => onSeeAll?.(collection.title)}
              />
            ),
          )}
        </TabsContent>
      </Tabs>

      {curatedCollections?.length > 0 && activeTab === "for-you" && (
        <div className="space-y-8">
          {curatedCollections
            .slice(0, 3)
            .map((collection: DiscoverySection, index: number) => (
              <DiscoverSection
                key={index}
                title={collection.title}
                description={collection.description}
                icon={<Star className="h-5 w-5 text-yellow-400" />}
                items={collection.items}
                onItemClick={(item) => onItemClick?.(item, "beat")}
                onSeeAll={() => onSeeAll?.(collection.title)}
              />
            ))}
        </div>
      )}
    </div>
  );
}

function DiscoverSection({
  title,
  description,
  icon,
  items,
  onItemClick,
  onSeeAll,
  highlight = false,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  items: Record<string, unknown>[];
  onItemClick: (item: Record<string, unknown>) => void;
  onSeeAll?: () => void;
  highlight?: boolean;
}) {
  if (!items || items.length === 0) return null;

  return (
    <Card
      className={cn(
        "bg-slate-800/30 border-slate-700",
        highlight && "border-purple-500/30 bg-purple-500/5",
      )}
    >
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              {icon}
              {title}
            </CardTitle>
            <p className="text-sm text-slate-400 mt-1">{description}</p>
          </div>
          {onSeeAll && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSeeAll}
              className="text-slate-400 hover:text-white"
            >
              See all
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex gap-4">
            {items
              .slice(0, 8)
              .map((item: Record<string, unknown>, _index: number) => (
                <BeatCardCompact
                  key={item.id}
                  beat={item}
                  onClick={() => onItemClick(item)}
                />
              ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function BeatCard({
  beat,
  rank,
  isNew,
  onClick,
}: {
  beat: Record<string, unknown>;
  rank?: number;
  isNew?: boolean;
  onClick: () => void;
}) {
  return (
    <Card
      className="bg-slate-800/50 border-slate-700 hover:bg-slate-800 cursor-pointer transition-all group"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="relative aspect-square rounded-lg bg-slate-700/50 mb-3 overflow-hidden">
          {beat.artworkUrl ? (
            <img
              src={beat.artworkUrl}
              alt={beat.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Music className="h-12 w-12 text-slate-600" />
            </div>
          )}

          {rank && (
            <div className="absolute top-2 left-2 w-8 h-8 rounded-full bg-black/70 flex items-center justify-center">
              <span className="text-sm font-bold text-white">#{rank}</span>
            </div>
          )}

          {isNew && (
            <Badge className="absolute top-2 right-2 bg-green-500 text-white">
              NEW
            </Badge>
          )}

          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Button
              size="icon"
              className="bg-purple-600 hover:bg-purple-700 rounded-full"
            >
              <Play className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="space-y-1">
          <h3 className="font-medium text-white truncate">{beat.title}</h3>
          {beat.genre && (
            <Badge variant="secondary" className="text-xs bg-slate-700">
              {beat.genre}
            </Badge>
          )}
          <div className="flex items-center justify-between text-sm text-slate-400 pt-2">
            <span className="flex items-center gap-1">
              <Play className="h-3 w-3" />
              {(beat.plays || 0).toLocaleString()}
            </span>
            {beat.price && (
              <span className="text-green-400 font-medium">${beat.price}</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BeatCardCompact({
  beat,
  onClick,
}: {
  beat: Record<string, unknown>;
  onClick: () => void;
}) {
  return (
    <div className="flex-shrink-0 w-40 cursor-pointer group" onClick={onClick}>
      <div className="relative aspect-square rounded-lg bg-slate-700/50 mb-2 overflow-hidden">
        {beat.artworkUrl ? (
          <img
            src={beat.artworkUrl}
            alt={beat.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music className="h-8 w-8 text-slate-600" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Play className="h-8 w-8 text-white" />
        </div>
      </div>
      <h4 className="font-medium text-sm text-white truncate">{beat.title}</h4>
      <p className="text-xs text-slate-400 truncate">{beat.genre || "Beat"}</p>
    </div>
  );
}

function DiscoveryFeedSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32 bg-slate-700" />
          <Skeleton className="h-4 w-48 bg-slate-700" />
        </div>
        <Skeleton className="h-9 w-24 bg-slate-700" />
      </div>

      <Skeleton className="h-10 w-full max-w-md bg-slate-700" />

      {[1, 2, 3].map((section) => (
        <Card key={section} className="bg-slate-800/30 border-slate-700">
          <CardHeader className="pb-4">
            <Skeleton className="h-6 w-40 bg-slate-700" />
            <Skeleton className="h-4 w-60 bg-slate-700" />
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              {[1, 2, 3, 4, 5].map((item) => (
                <div key={item} className="w-40 flex-shrink-0">
                  <Skeleton className="aspect-square rounded-lg bg-slate-700 mb-2" />
                  <Skeleton className="h-4 w-full bg-slate-700 mb-1" />
                  <Skeleton className="h-3 w-2/3 bg-slate-700" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function SimilarBeatsSection({
  beatId,
  onItemClick,
}: {
  beatId: string;
  onItemClick?: (item: Record<string, unknown>) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/search/similar", beatId],
    queryFn: async () => {
      const res = await fetch(`/api/search/similar/${beatId}?limit=6`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch similar beats");
      return res.json();
    },
    enabled: !!beatId,
    staleTime: 300000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-40 bg-slate-700" />
        <div className="flex gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="w-32 h-40 rounded-lg bg-slate-700" />
          ))}
        </div>
      </div>
    );
  }

  if (!data?.similar || data.similar.length === 0) {
    return null;
  }

  return (
    <Card className="bg-slate-800/30 border-slate-700">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Zap className="h-5 w-5 text-yellow-400" />
          Similar to "{data.sourceBeat.title}"
        </CardTitle>
        <p className="text-sm text-slate-400">
          Beats with similar{" "}
          {data.matchCriteria?.genre
            ? `genre (${data.matchCriteria.genre})`
            : ""}
          {data.matchCriteria?.bpmRange
            ? ` and BPM (${data.matchCriteria.bpmRange})`
            : ""}
        </p>
      </CardHeader>
      <CardContent>
        <ScrollArea className="w-full">
          <div className="flex gap-4">
            {data.similar.map((beat: Record<string, unknown>) => (
              <BeatCardCompact
                key={beat.id}
                beat={beat}
                onClick={() => onItemClick?.(beat)}
              />
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export default DiscoveryFeed;
