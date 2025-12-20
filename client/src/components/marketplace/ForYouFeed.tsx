import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { BeatCard } from '@/components/ui/beat-card';
import { BeatPreviewControls } from './BeatPreviewControls';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import {
  Sparkles,
  TrendingUp,
  Clock,
  Heart,
  Music,
  RefreshCw,
  ChevronRight,
  Flame,
  Star,
  Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Beat {
  id: string;
  title: string;
  producer: string;
  producerId: string;
  price: number;
  genre: string;
  mood: string;
  tempo: number;
  key: string;
  audioUrl?: string;
  previewUrl?: string;
  artworkUrl?: string;
  plays: number;
  likes: number;
  isHot: boolean;
  isNew: boolean;
  discoveryScore: number;
}

interface FeedSection {
  id: string;
  title: string;
  description: string;
  beats: Beat[];
  type: 'personalized' | 'trending' | 'new' | 'genre_match' | 'mood_match';
}

interface TasteProfile {
  topGenres: { genre: string; score: number }[];
  topMoods: { mood: string; score: number }[];
  totalInteractions: number;
}

interface ForYouResponse {
  sections: FeedSection[];
  tasteProfile: TasteProfile;
  allBeats: Beat[];
}

const sectionIcons: Record<string, any> = {
  personalized: Sparkles,
  trending: TrendingUp,
  new: Clock,
  genre_match: Music,
  mood_match: Heart,
};

const sectionColors: Record<string, string> = {
  personalized: 'from-purple-500 to-pink-500',
  trending: 'from-orange-500 to-red-500',
  new: 'from-cyan-500 to-blue-500',
  genre_match: 'from-emerald-500 to-teal-500',
  mood_match: 'from-rose-500 to-pink-500',
};

export function ForYouFeed() {
  const [selectedBeat, setSelectedBeat] = useState<Beat | null>(null);
  const [likedBeats, setLikedBeats] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch, isFetching } = useQuery<ForYouResponse>({
    queryKey: ['for-you-feed'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/marketplace/for-you');
      return response.json();
    },
  });

  const interactionMutation = useMutation({
    mutationFn: async ({ beatId, type }: { beatId: string; type: string }) => {
      await apiRequest('POST', '/api/marketplace/interaction', {
        beatId,
        interactionType: type,
        source: 'for_you_feed',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['for-you-feed'] });
    },
  });

  const handlePlay = (beat: Beat) => {
    interactionMutation.mutate({ beatId: beat.id, type: 'play' });
    setSelectedBeat(beat);
  };

  const handleLike = (beat: Beat) => {
    const newLiked = new Set(likedBeats);
    if (likedBeats.has(beat.id)) {
      newLiked.delete(beat.id);
    } else {
      newLiked.add(beat.id);
      interactionMutation.mutate({ beatId: beat.id, type: 'like' });
    }
    setLikedBeats(newLiked);
  };

  const handleAddToCart = (beat: Beat) => {
    interactionMutation.mutate({ beatId: beat.id, type: 'add_to_cart' });
    toast({
      title: 'Added to cart',
      description: `${beat.title} has been added to your cart`,
    });
  };

  if (isLoading) {
    return <ForYouFeedSkeleton />;
  }

  if (error) {
    return (
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="py-12 text-center">
          <p className="text-slate-400 mb-4">Unable to load your personalized feed</p>
          <Button onClick={() => refetch()} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const sections = data?.sections || [];
  const tasteProfile = data?.tasteProfile;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">For You</h2>
            <p className="text-sm text-slate-400">
              Beats curated based on your taste
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-slate-400 hover:text-white"
        >
          <RefreshCw className={cn('h-4 w-4 mr-2', isFetching && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {tasteProfile && tasteProfile.totalInteractions > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap gap-2"
        >
          {tasteProfile.topGenres.map((g, i) => (
            <Badge
              key={g.genre}
              variant="secondary"
              className={cn(
                'bg-gradient-to-r text-white border-0',
                i === 0 ? 'from-purple-500 to-pink-500' : 'from-slate-600 to-slate-700'
              )}
            >
              <Music className="h-3 w-3 mr-1" />
              {g.genre}
              <span className="ml-1 opacity-70">{Math.round(g.score * 100)}%</span>
            </Badge>
          ))}
          {tasteProfile.topMoods.map((m, i) => (
            <Badge
              key={m.mood}
              variant="secondary"
              className="bg-slate-700/50 text-slate-300"
            >
              <Heart className="h-3 w-3 mr-1" />
              {m.mood}
            </Badge>
          ))}
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {sections.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="py-16 text-center">
                <Sparkles className="h-12 w-12 text-slate-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">
                  Your personalized feed is building
                </h3>
                <p className="text-slate-400 max-w-md mx-auto mb-6">
                  Start browsing and interacting with beats to help us learn your taste. 
                  The more you listen, like, and purchase, the better your recommendations become.
                </p>
                <Button className="bg-gradient-to-r from-purple-500 to-pink-500">
                  <Zap className="h-4 w-4 mr-2" />
                  Explore All Beats
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <div className="space-y-8">
            {sections.map((section, sectionIndex) => {
              const Icon = sectionIcons[section.type] || Sparkles;
              const colorClass = sectionColors[section.type] || 'from-slate-500 to-slate-600';

              return (
                <motion.div
                  key={section.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: sectionIndex * 0.1 }}
                >
                  <Card className="bg-slate-800/30 border-slate-700/50 overflow-hidden">
                    <CardHeader className="pb-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={cn('p-2 rounded-lg bg-gradient-to-br', colorClass)}>
                            <Icon className="h-4 w-4 text-white" />
                          </div>
                          <div>
                            <CardTitle className="text-lg text-white">{section.title}</CardTitle>
                            <CardDescription>{section.description}</CardDescription>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
                          See All
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="w-full pb-4">
                        <div className="flex gap-4">
                          {section.beats.map((beat, beatIndex) => (
                            <motion.div
                              key={beat.id}
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: beatIndex * 0.05 }}
                              className="flex-shrink-0 w-[220px]"
                            >
                              <BeatCard
                                id={beat.id}
                                title={beat.title}
                                producer={beat.producer}
                                price={beat.price}
                                bpm={beat.tempo}
                                key={beat.key}
                                genre={beat.genre}
                                audioUrl={beat.previewUrl || beat.audioUrl}
                                isPlaying={selectedBeat?.id === beat.id}
                                isLiked={likedBeats.has(beat.id)}
                                onPlay={() => handlePlay(beat)}
                                onLike={() => handleLike(beat)}
                                onAddToCart={() => handleAddToCart(beat)}
                                showPreviewControls={true}
                              />
                              {beat.isHot && (
                                <div className="flex items-center gap-1 mt-2 text-xs text-orange-400">
                                  <Flame className="h-3 w-3" />
                                  Hot
                                </div>
                              )}
                              {beat.isNew && (
                                <div className="flex items-center gap-1 mt-2 text-xs text-cyan-400">
                                  <Star className="h-3 w-3" />
                                  New
                                </div>
                              )}
                            </motion.div>
                          ))}
                        </div>
                        <ScrollBar orientation="horizontal" />
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </AnimatePresence>

      {selectedBeat && selectedBeat.previewUrl && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-4 left-4 right-4 z-50 max-w-2xl mx-auto"
        >
          <Card className="bg-slate-900/95 backdrop-blur border-slate-700 shadow-2xl">
            <CardContent className="p-4">
              <div className="flex items-center gap-4 mb-3">
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                  <Music className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-white truncate">{selectedBeat.title}</h4>
                  <p className="text-sm text-slate-400">{selectedBeat.producer}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedBeat(null)}
                  className="text-slate-400"
                >
                  Close
                </Button>
              </div>
              <BeatPreviewControls
                beatId={selectedBeat.id}
                audioUrl={selectedBeat.previewUrl || selectedBeat.audioUrl || ''}
                onInteraction={(type) => {
                  interactionMutation.mutate({ beatId: selectedBeat.id, type });
                }}
                originalBpm={selectedBeat.tempo}
                originalKey={selectedBeat.key}
              />
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}

function ForYouFeedSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-lg" />
        <div>
          <Skeleton className="w-32 h-6 mb-1" />
          <Skeleton className="w-48 h-4" />
        </div>
      </div>

      {[1, 2, 3].map((i) => (
        <Card key={i} className="bg-slate-800/30 border-slate-700/50">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-lg" />
              <div>
                <Skeleton className="w-40 h-5 mb-1" />
                <Skeleton className="w-60 h-4" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 overflow-hidden">
              {[1, 2, 3, 4].map((j) => (
                <Skeleton key={j} className="w-[220px] h-[280px] flex-shrink-0 rounded-lg" />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
