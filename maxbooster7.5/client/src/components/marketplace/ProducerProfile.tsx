import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Music,
  Play,
  Pause,
  Heart,
  Share2,
  MessageCircle,
  Star,
  Award,
  Trophy,
  Crown,
  Flame,
  TrendingUp,
  Users,
  Eye,
  DollarSign,
  CheckCircle,
  Calendar,
  MapPin,
  Globe,
  Verified,
  Headphones,
  Download,
  ShoppingCart,
  ExternalLink,
  Instagram,
  Youtube,
  Twitter,
  Sparkles,
  BarChart3,
  Zap,
  Music2,
} from 'lucide-react';
import {
  FacebookIcon,
  InstagramIcon,
  YouTubeIcon,
  TikTokIcon,
  TwitterIcon,
} from '@/components/ui/brand-icons';

interface ProducerStats {
  totalBeats: number;
  totalSales: number;
  totalPlays: number;
  totalDownloads: number;
  followers: number;
  rating: number;
  reviewCount: number;
  responseRate: number;
  responseTime: string;
  memberSince: string;
  location: string;
}

interface ProducerBadge {
  id: string;
  name: string;
  icon: React.ReactNode;
  color: string;
  description: string;
  earnedAt: string;
}

interface ProducerSocial {
  platform: string;
  url: string;
  followers?: number;
}

interface ProducerBeat {
  id: string;
  title: string;
  price: number;
  plays: number;
  likes: number;
  genre: string;
  tempo: number;
  coverUrl?: string;
  audioUrl?: string;
}

interface ProducerReview {
  id: string;
  reviewer: {
    name: string;
    avatar?: string;
  };
  rating: number;
  comment: string;
  createdAt: string;
  beatTitle?: string;
}

interface ProducerProfileProps {
  producerId: string;
  isOpen: boolean;
  onClose: () => void;
}

const BADGE_ICONS: Record<string, { icon: React.ReactNode; color: string }> = {
  verified: { icon: <CheckCircle className="w-4 h-4" />, color: 'bg-blue-500' },
  top_seller: { icon: <Crown className="w-4 h-4" />, color: 'bg-yellow-500' },
  trending: { icon: <Flame className="w-4 h-4" />, color: 'bg-orange-500' },
  platinum: { icon: <Award className="w-4 h-4" />, color: 'bg-purple-500' },
  gold: { icon: <Trophy className="w-4 h-4" />, color: 'bg-amber-500' },
  rising_star: { icon: <Star className="w-4 h-4" />, color: 'bg-pink-500' },
  quick_responder: { icon: <Zap className="w-4 h-4" />, color: 'bg-green-500' },
  prolific: { icon: <Music2 className="w-4 h-4" />, color: 'bg-cyan-500' },
};

const mockProducerData = {
  id: '1',
  name: 'B-Lawz Beats',
  username: 'blawzbeats',
  avatar: '/images/producers/blawz.jpg',
  coverImage: '/images/covers/producer-cover.jpg',
  bio: 'Grammy-nominated producer specializing in Hip-Hop, R&B, and Pop. Over 500+ placements with major artists. All beats are 100% original and exclusive.',
  verified: true,
  stats: {
    totalBeats: 342,
    totalSales: 1247,
    totalPlays: 892000,
    totalDownloads: 45600,
    followers: 12400,
    rating: 4.9,
    reviewCount: 456,
    responseRate: 98,
    responseTime: '< 2 hours',
    memberSince: '2019-03-15',
    location: 'Los Angeles, CA',
  },
  badges: [
    { id: '1', name: 'Verified', type: 'verified', earnedAt: '2019-03-15' },
    { id: '2', name: 'Top Seller', type: 'top_seller', earnedAt: '2021-06-01' },
    { id: '3', name: 'Trending', type: 'trending', earnedAt: '2024-01-15' },
    { id: '4', name: 'Platinum Producer', type: 'platinum', earnedAt: '2023-09-01' },
    { id: '5', name: 'Quick Responder', type: 'quick_responder', earnedAt: '2020-01-01' },
  ],
  socials: [
    { platform: 'instagram', url: 'https://instagram.com/blawzbeats', followers: 45000 },
    { platform: 'youtube', url: 'https://youtube.com/blawzbeats', followers: 128000 },
    { platform: 'twitter', url: 'https://twitter.com/blawzbeats', followers: 23000 },
    { platform: 'tiktok', url: 'https://tiktok.com/@blawzbeats', followers: 89000 },
  ],
  featuredBeats: [
    { id: '1', title: 'Midnight Dreams', price: 49.99, plays: 12400, likes: 890, genre: 'Hip-Hop', tempo: 140 },
    { id: '2', title: 'Summer Vibes', price: 79.99, plays: 8900, likes: 650, genre: 'R&B', tempo: 95 },
    { id: '3', title: 'Dark Energy', price: 59.99, plays: 15200, likes: 1100, genre: 'Trap', tempo: 150 },
    { id: '4', title: 'Smooth Operator', price: 99.99, plays: 6700, likes: 520, genre: 'Neo-Soul', tempo: 85 },
  ],
  recentReviews: [
    { id: '1', reviewer: { name: 'Mike A.', avatar: '' }, rating: 5, comment: 'Amazing quality beats! Super responsive too.', createdAt: '2024-01-10', beatTitle: 'Midnight Dreams' },
    { id: '2', reviewer: { name: 'Sarah M.', avatar: '' }, rating: 5, comment: 'Best producer on the platform. Period.', createdAt: '2024-01-08', beatTitle: 'Summer Vibes' },
    { id: '3', reviewer: { name: 'Jay K.', avatar: '' }, rating: 4, comment: 'Great beats, quick delivery. Will buy again!', createdAt: '2024-01-05', beatTitle: 'Dark Energy' },
  ],
  genres: ['Hip-Hop', 'Trap', 'R&B', 'Pop', 'Neo-Soul', 'Drill'],
  equipment: ['FL Studio', 'Waves Plugins', 'Kontakt', 'Serum', 'Omnisphere'],
  achievements: [
    { label: 'Total Earnings', value: '$125,000+' },
    { label: 'Major Placements', value: '15+' },
    { label: 'Return Customers', value: '78%' },
    { label: 'Avg. Rating', value: '4.9/5' },
  ],
};

export function ProducerProfile({ producerId, isOpen, onClose }: ProducerProfileProps) {
  const [activeTab, setActiveTab] = useState('beats');
  const [playingBeat, setPlayingBeat] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: producer, isLoading, error } = useQuery({
    queryKey: ['producer', producerId],
    queryFn: async () => {
      const response = await fetch(`/api/marketplace/producers/${producerId}`);
      if (!response.ok) {
        throw new Error('Failed to load producer');
      }
      return response.json();
    },
    enabled: isOpen && !!producerId,
  });

  const { data: followStatus } = useQuery({
    queryKey: ['producer-follow', producerId],
    queryFn: async () => {
      const response = await fetch(`/api/marketplace/producers/${producerId}/follow-status`);
      if (!response.ok) return { isFollowing: false };
      return response.json();
    },
    enabled: isOpen && !!producerId,
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/marketplace/follow-producer', { producerId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['producer', producerId] });
      queryClient.invalidateQueries({ queryKey: ['producer-follow', producerId] });
      toast({ title: 'Following producer' });
    },
    onError: () => {
      toast({ title: 'Failed to follow', variant: 'destructive' });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/marketplace/unfollow-producer', { producerId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['producer', producerId] });
      queryClient.invalidateQueries({ queryKey: ['producer-follow', producerId] });
      toast({ title: 'Unfollowed producer' });
    },
    onError: () => {
      toast({ title: 'Failed to unfollow', variant: 'destructive' });
    },
  });

  const isFollowing = followStatus?.isFollowing ?? false;

  const handleFollowToggle = () => {
    if (isFollowing) {
      unfollowMutation.mutate();
    } else {
      followMutation.mutate();
    }
  };

  const handlePlayBeat = (beatId: string, audioUrl?: string) => {
    if (playingBeat === beatId) {
      audioRef.current?.pause();
      setPlayingBeat(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (audioUrl) {
        const audio = new Audio(audioUrl);
        audio.play();
        audio.onended = () => setPlayingBeat(null);
        audioRef.current = audio;
        setPlayingBeat(beatId);
      }
    }
  };

  const fallbackProducer = mockProducerData;

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`w-4 h-4 ${i < Math.floor(rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
      />
    ));
  };

  const getSocialIcon = (platform: string) => {
    switch (platform) {
      case 'instagram': return <InstagramIcon className="w-5 h-5" />;
      case 'youtube': return <YouTubeIcon className="w-5 h-5" />;
      case 'twitter': return <TwitterIcon className="w-5 h-5" />;
      case 'tiktok': return <TikTokIcon className="w-5 h-5" />;
      default: return <Globe className="w-5 h-5" />;
    }
  };

  const displayProducer = producer || fallbackProducer;

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
        setPlayingBeat(null);
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
      setPlayingBeat(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden bg-background">
        {isLoading ? (
          <div className="p-8 space-y-4">
            <div className="flex gap-4">
              <div className="w-32 h-32 rounded-full bg-muted animate-pulse" />
              <div className="flex-1 space-y-2 pt-8">
                <div className="h-8 w-48 bg-muted animate-pulse rounded" />
                <div className="h-4 w-32 bg-muted animate-pulse rounded" />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4 mt-6">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-muted-foreground">Failed to load producer profile</p>
            <Button variant="outline" onClick={() => onClose()} className="mt-4">Close</Button>
          </div>
        ) : (
        <ScrollArea className="max-h-[90vh]">
          <div className="relative">
            <div className="h-40 bg-gradient-to-br from-primary/30 via-primary/20 to-primary/10 relative overflow-hidden">
              <div className="absolute inset-0 bg-[url('/images/pattern.svg')] opacity-10" />
              <motion.div
                className="absolute inset-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
              >
                <div className="absolute bottom-4 right-4 flex gap-2">
                  {(displayProducer.badges || []).map((badge: any) => {
                    const badgeConfig = BADGE_ICONS[badge.type];
                    return (
                      <TooltipProvider key={badge.id}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ delay: 0.2 }}
                              className={`w-8 h-8 rounded-full ${badgeConfig?.color} flex items-center justify-center text-white shadow-lg`}
                            >
                              {badgeConfig?.icon}
                            </motion.div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-medium">{badge.name}</p>
                            <p className="text-xs text-muted-foreground">
                              Earned {new Date(badge.earnedAt).toLocaleDateString()}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
                </div>
              </motion.div>
            </div>
            
            <div className="px-6 pb-6">
              <div className="flex flex-col md:flex-row gap-6 -mt-16 relative z-10">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                >
                  <Avatar className="w-32 h-32 border-4 border-background shadow-xl">
                    <AvatarImage src={displayProducer.avatar} />
                    <AvatarFallback className="text-3xl font-bold bg-primary text-primary-foreground">
                      {displayProducer.name?.charAt(0) || 'P'}
                    </AvatarFallback>
                  </Avatar>
                </motion.div>
                
                <div className="flex-1 pt-8 md:pt-12">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-2xl font-bold">{displayProducer.name}</h2>
                        {displayProducer.verified && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <CheckCircle className="w-5 h-5 text-blue-500 fill-blue-500" />
                              </TooltipTrigger>
                              <TooltipContent>Verified Producer</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                      <p className="text-muted-foreground">@{displayProducer.username}</p>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-4 h-4" />
                          {displayProducer.stats?.location || 'Unknown'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          Joined {displayProducer.stats?.memberSince ? new Date(displayProducer.stats.memberSince).getFullYear() : 'N/A'}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button
                        variant={isFollowing ? 'outline' : 'default'}
                        onClick={handleFollowToggle}
                        disabled={followMutation.isPending || unfollowMutation.isPending}
                      >
                        {isFollowing ? (
                          <>
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Following
                          </>
                        ) : (
                          <>
                            <Users className="w-4 h-4 mr-2" />
                            Follow
                          </>
                        )}
                      </Button>
                      <Button variant="outline">
                        <MessageCircle className="w-4 h-4 mr-2" />
                        Message
                      </Button>
                      <Button variant="ghost" size="icon">
                        <Share2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6"
              >
                <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-blue-500">{displayProducer.stats?.totalBeats || 0}</p>
                    <p className="text-xs text-muted-foreground">Beats</p>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-green-500">{formatNumber(displayProducer.stats?.totalSales || 0)}</p>
                    <p className="text-xs text-muted-foreground">Sales</p>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-purple-500">{formatNumber(displayProducer.stats?.totalPlays || 0)}</p>
                    <p className="text-xs text-muted-foreground">Plays</p>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-orange-500">{formatNumber(displayProducer.stats?.followers || 0)}</p>
                    <p className="text-xs text-muted-foreground">Followers</p>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="mt-6"
              >
                <p className="text-sm leading-relaxed">{displayProducer.bio}</p>
                
                <div className="flex flex-wrap gap-2 mt-4">
                  {displayProducer.genres.map((genre) => (
                    <Badge key={genre} variant="secondary">
                      {genre}
                    </Badge>
                  ))}
                </div>

                <div className="flex items-center gap-4 mt-4">
                  {displayProducer.socials.map((social) => (
                    <TooltipProvider key={social.platform}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a
                            href={social.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-full bg-muted hover:bg-muted/80 transition-colors"
                          >
                            {getSocialIcon(social.platform)}
                          </a>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{social.platform}</p>
                          {social.followers && (
                            <p className="text-xs text-muted-foreground">
                              {formatNumber(social.followers)} followers
                            </p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                </div>
              </motion.div>

              <Separator className="my-6" />

              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="w-full justify-start">
                  <TabsTrigger value="beats">
                    <Music className="w-4 h-4 mr-2" />
                    Beats ({displayProducer.stats.totalBeats})
                  </TabsTrigger>
                  <TabsTrigger value="reviews">
                    <Star className="w-4 h-4 mr-2" />
                    Reviews ({displayProducer.stats.reviewCount})
                  </TabsTrigger>
                  <TabsTrigger value="stats">
                    <BarChart3 className="w-4 h-4 mr-2" />
                    Stats
                  </TabsTrigger>
                  <TabsTrigger value="about">
                    <Users className="w-4 h-4 mr-2" />
                    About
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="beats" className="mt-6">
                  <div className="grid gap-4">
                    <AnimatePresence mode="popLayout">
                      {displayProducer.featuredBeats.map((beat, index) => (
                        <motion.div
                          key={beat.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }}
                        >
                          <Card className="hover:shadow-md transition-shadow">
                            <CardContent className="p-4">
                              <div className="flex items-center gap-4">
                                <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="w-10 h-10 rounded-full"
                                    onClick={() => setPlayingBeat(playingBeat === beat.id ? null : beat.id)}
                                  >
                                    {playingBeat === beat.id ? (
                                      <Pause className="w-5 h-5" />
                                    ) : (
                                      <Play className="w-5 h-5 ml-0.5" />
                                    )}
                                  </Button>
                                </div>
                                
                                <div className="flex-1">
                                  <h4 className="font-medium">{beat.title}</h4>
                                  <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                                    <Badge variant="outline" className="text-xs">
                                      {beat.genre}
                                    </Badge>
                                    <span>{beat.tempo} BPM</span>
                                    <span className="flex items-center gap-1">
                                      <Headphones className="w-3 h-3" />
                                      {formatNumber(beat.plays)}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Heart className="w-3 h-3" />
                                      {formatNumber(beat.likes)}
                                    </span>
                                  </div>
                                </div>
                                
                                <div className="text-right">
                                  <p className="text-lg font-bold">${beat.price}</p>
                                  <Button size="sm" className="mt-1">
                                    <ShoppingCart className="w-4 h-4 mr-1" />
                                    Add to Cart
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    
                    <Button variant="outline" className="w-full">
                      View All {displayProducer.stats.totalBeats} Beats
                    </Button>
                  </div>
                </TabsContent>
                
                <TabsContent value="reviews" className="mt-6">
                  <div className="flex items-center gap-6 mb-6 p-4 bg-muted rounded-lg">
                    <div className="text-center">
                      <p className="text-4xl font-bold">{displayProducer.stats.rating}</p>
                      <div className="flex items-center justify-center mt-1">
                        {renderStars(displayProducer.stats.rating)}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {displayProducer.stats.reviewCount} reviews
                      </p>
                    </div>
                    <div className="flex-1 space-y-2">
                      {[5, 4, 3, 2, 1].map((stars) => (
                        <div key={stars} className="flex items-center gap-2">
                          <span className="text-sm w-3">{stars}</span>
                          <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                          <Progress value={stars === 5 ? 85 : stars === 4 ? 12 : 3} className="flex-1 h-2" />
                          <span className="text-xs text-muted-foreground w-8">{stars === 5 ? '85%' : stars === 4 ? '12%' : '3%'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    {displayProducer.recentReviews.map((review) => (
                      <Card key={review.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <Avatar className="w-10 h-10">
                              <AvatarImage src={review.reviewer.avatar} />
                              <AvatarFallback>{review.reviewer.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium">{review.reviewer.name}</p>
                                  <div className="flex items-center gap-2">
                                    <div className="flex">{renderStars(review.rating)}</div>
                                    <span className="text-xs text-muted-foreground">
                                      {new Date(review.createdAt).toLocaleDateString()}
                                    </span>
                                  </div>
                                </div>
                                {review.beatTitle && (
                                  <Badge variant="outline" className="text-xs">
                                    <Music className="w-3 h-3 mr-1" />
                                    {review.beatTitle}
                                  </Badge>
                                )}
                              </div>
                              <p className="mt-2 text-sm">{review.comment}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>
                
                <TabsContent value="stats" className="mt-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {displayProducer.achievements.map((achievement) => (
                      <Card key={achievement.label} className="text-center">
                        <CardContent className="p-4">
                          <p className="text-2xl font-bold">{achievement.value}</p>
                          <p className="text-sm text-muted-foreground">{achievement.label}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  
                  <Card className="mt-4">
                    <CardHeader>
                      <CardTitle className="text-lg">Response Metrics</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Response Rate</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Progress value={displayProducer.stats?.responseRate || 0} className="flex-1" />
                            <span className="font-medium">{displayProducer.stats?.responseRate || 0}%</span>
                          </div>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Avg. Response Time</p>
                          <p className="text-lg font-medium mt-1">{displayProducer.stats?.responseTime || 'N/A'}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
                
                <TabsContent value="about" className="mt-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Equipment & Software</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2">
                          {(displayProducer.equipment || []).map((item: string) => (
                            <Badge key={item} variant="secondary">
                              {item}
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Quick Facts</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Member Since</span>
                          <span>{displayProducer.stats?.memberSince ? new Date(displayProducer.stats.memberSince).toLocaleDateString() : 'N/A'}</span>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Location</span>
                          <span>{displayProducer.stats?.location || 'Not specified'}</span>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Total Downloads</span>
                          <span>{formatNumber(displayProducer.stats?.totalDownloads || 0)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ProducerCard({ producer, onClick }: { producer: any; onClick: () => void }) {
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -4 }}
      transition={{ duration: 0.2 }}
    >
      <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={onClick}>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <Avatar className="w-16 h-16">
              <AvatarImage src={producer.avatar} />
              <AvatarFallback className="text-lg font-bold bg-primary text-primary-foreground">
                {producer.name?.charAt(0) || 'P'}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold truncate">{producer.name}</h3>
                {producer.verified && (
                  <CheckCircle className="w-4 h-4 text-blue-500 fill-blue-500 flex-shrink-0" />
                )}
              </div>
              <p className="text-sm text-muted-foreground truncate">@{producer.username}</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Music className="w-3 h-3" />
                  {producer.beatCount || 0} beats
                </span>
                <span className="flex items-center gap-1">
                  <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                  {producer.rating || 0}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {formatNumber(producer.followers || 0)}
                </span>
              </div>
            </div>
            
            <div className="flex flex-col gap-1">
              {producer.badges?.slice(0, 3).map((badge: any) => {
                const badgeConfig = BADGE_ICONS[badge.type];
                return (
                  <div
                    key={badge.id}
                    className={`w-6 h-6 rounded-full ${badgeConfig?.color || 'bg-gray-500'} flex items-center justify-center text-white text-[10px]`}
                  >
                    {badgeConfig?.icon}
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
