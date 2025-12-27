import { useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Music,
  Play,
  Pause,
  Heart,
  Share2,
  Star,
  Users,
  DollarSign,
  CheckCircle,
  MapPin,
  Globe,
  ArrowLeft,
  ShoppingCart,
  Headphones,
  RefreshCw,
} from 'lucide-react';
import { useState, useRef } from 'react';
import { useLocation } from 'wouter';

interface Producer {
  id: string;
  username: string;
  name?: string;
  avatarUrl?: string;
  bio?: string;
  location?: string;
  website?: string;
  verified?: boolean;
  followers?: number;
  sales?: number;
  beats?: number;
  rating?: number;
}

interface Beat {
  id: string;
  title: string;
  bpm: number;
  key: string;
  genre: string;
  price: number;
  coverArt?: string;
  audioPreview?: string;
  plays?: number;
}

export default function ProducerProfilePage() {
  const { user, isLoading: authLoading } = useRequireAuth();
  const params = useParams<{ producerId: string }>();
  const producerId = params.producerId;
  const [, navigate] = useLocation();
  const [playingBeatId, setPlayingBeatId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { data: producer, isLoading: producerLoading } = useQuery<Producer>({
    queryKey: ['producer', producerId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/marketplace/producers/${producerId}`);
      return res.json();
    },
    enabled: !!producerId,
  });

  const { data: beatsData, isLoading: beatsLoading } = useQuery<{ beats: Beat[] }>({
    queryKey: ['producer-beats', producerId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/marketplace/beats?producerId=${producerId}`);
      return res.json();
    },
    enabled: !!producerId,
  });

  const beats = beatsData?.beats || [];

  const handlePlayBeat = (beat: Beat) => {
    if (playingBeatId === beat.id) {
      audioRef.current?.pause();
      setPlayingBeatId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (beat.audioPreview) {
        audioRef.current = new Audio(beat.audioPreview);
        audioRef.current.play();
        setPlayingBeatId(beat.id);
        audioRef.current.onended = () => setPlayingBeatId(null);
      }
    }
  };

  if (authLoading || producerLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!producer) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-96 space-y-4">
          <h2 className="text-2xl font-bold">Producer Not Found</h2>
          <p className="text-muted-foreground">The producer you're looking for doesn't exist.</p>
          <Button onClick={() => navigate('/marketplace')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Marketplace
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate('/marketplace')} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Marketplace
        </Button>

        <Card className="overflow-hidden">
          <div className="h-32 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600" />
          <CardContent className="relative pt-0">
            <div className="flex flex-col md:flex-row items-start md:items-end gap-6 -mt-16">
              <div className="relative">
                {producer.avatarUrl ? (
                  <img
                    src={producer.avatarUrl}
                    alt={producer.name || producer.username}
                    className="w-32 h-32 rounded-full border-4 border-background object-cover shadow-xl"
                  />
                ) : (
                  <div className="w-32 h-32 rounded-full border-4 border-background bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-4xl font-bold shadow-xl">
                    {(producer.name || producer.username)?.substring(0, 2)?.toUpperCase() || 'PR'}
                  </div>
                )}
                {producer.verified && (
                  <div className="absolute bottom-2 right-2 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center border-2 border-white">
                    <CheckCircle className="w-5 h-5 text-white" />
                  </div>
                )}
              </div>

              <div className="flex-1 pb-4">
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-3xl font-bold">{producer.name || producer.username}</h1>
                  {producer.verified && (
                    <Badge className="bg-blue-600">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Verified
                    </Badge>
                  )}
                </div>

                {producer.bio && (
                  <p className="text-muted-foreground mb-3 max-w-2xl">{producer.bio}</p>
                )}

                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  {producer.location && (
                    <div className="flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      {producer.location}
                    </div>
                  )}
                  {producer.website && (
                    <a
                      href={producer.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:text-blue-500 transition"
                    >
                      <Globe className="w-4 h-4" />
                      Website
                    </a>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <Button className="bg-gradient-to-r from-blue-600 to-purple-600">
                  <Users className="w-4 h-4 mr-2" />
                  Follow
                </Button>
                <Button variant="outline">
                  <Share2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <Music className="w-8 h-8 mx-auto mb-2 text-blue-500" />
              <p className="text-2xl font-bold">{producer.beats || beats.length || 0}</p>
              <p className="text-sm text-muted-foreground">Beats</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <DollarSign className="w-8 h-8 mx-auto mb-2 text-green-500" />
              <p className="text-2xl font-bold">{producer.sales || 0}</p>
              <p className="text-sm text-muted-foreground">Sales</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Users className="w-8 h-8 mx-auto mb-2 text-purple-500" />
              <p className="text-2xl font-bold">{producer.followers || 0}</p>
              <p className="text-sm text-muted-foreground">Followers</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Star className="w-8 h-8 mx-auto mb-2 text-yellow-500" />
              <p className="text-2xl font-bold">{(producer.rating || 0).toFixed(1)}</p>
              <p className="text-sm text-muted-foreground">Rating</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="beats" className="w-full">
          <TabsList>
            <TabsTrigger value="beats">Beats ({beats.length})</TabsTrigger>
            <TabsTrigger value="about">About</TabsTrigger>
          </TabsList>

          <TabsContent value="beats" className="mt-6">
            {beatsLoading ? (
              <div className="flex justify-center py-12">
                <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : beats.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {beats.map((beat) => (
                  <Card key={beat.id} className="group hover:shadow-lg transition">
                    <CardContent className="p-0">
                      <div className="relative aspect-square bg-gradient-to-br from-blue-500 to-purple-600 rounded-t-lg overflow-hidden">
                        {beat.coverArt ? (
                          <img src={beat.coverArt} alt={beat.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <Music className="w-16 h-16 text-white opacity-50" />
                          </div>
                        )}
                        <Button
                          size="icon"
                          className="absolute bottom-4 right-4 rounded-full w-12 h-12 bg-white/90 hover:bg-white text-black shadow-lg"
                          onClick={() => handlePlayBeat(beat)}
                        >
                          {playingBeatId === beat.id ? (
                            <Pause className="w-5 h-5" />
                          ) : (
                            <Play className="w-5 h-5 ml-0.5" />
                          )}
                        </Button>
                      </div>
                      <div className="p-4 space-y-3">
                        <div>
                          <h4 className="font-semibold truncate">{beat.title}</h4>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>{beat.bpm} BPM</span>
                            <span>•</span>
                            <span>{beat.key}</span>
                            <span>•</span>
                            <Badge variant="secondary" className="text-xs">
                              {beat.genre}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-lg font-bold text-green-600">${beat.price}</span>
                          <Button size="sm" className="bg-gradient-to-r from-blue-600 to-purple-600">
                            <ShoppingCart className="w-4 h-4 mr-1" />
                            Buy
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <Music className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-xl font-semibold mb-2">No Beats Yet</h3>
                  <p className="text-muted-foreground">This producer hasn't uploaded any beats yet.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="about" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>About {producer.name || producer.username}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {producer.bio ? (
                  <p className="text-muted-foreground">{producer.bio}</p>
                ) : (
                  <p className="text-muted-foreground italic">No bio available.</p>
                )}
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  {producer.location && (
                    <div>
                      <p className="text-sm font-medium">Location</p>
                      <p className="text-muted-foreground">{producer.location}</p>
                    </div>
                  )}
                  {producer.website && (
                    <div>
                      <p className="text-sm font-medium">Website</p>
                      <a
                        href={producer.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline"
                      >
                        {producer.website}
                      </a>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
