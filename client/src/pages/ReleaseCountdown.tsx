import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { 
  Clock, Calendar, Plus, Rocket, CheckCircle, Circle, 
  Music, Share2, Image, FileText, Bell, ExternalLink,
  Timer, PartyPopper, Sparkles
} from 'lucide-react';
import { format, differenceInDays, differenceInHours, differenceInMinutes, differenceInSeconds } from 'date-fns';

interface Release {
  id: string;
  title: string;
  artistName: string;
  releaseDate: string;
  coverArt?: string;
  status: 'upcoming' | 'today' | 'released';
  presaveLink?: string;
  presaveCount: number;
  tasks: Array<{
    id: string;
    title: string;
    category: string;
    dueDate?: string;
    completed: boolean;
  }>;
}

function CountdownTimer({ targetDate }: { targetDate: string }) {
  const [, setTick] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [targetDate]);
  
  const target = new Date(targetDate);
  const now = new Date();
  
  if (now >= target) {
    return (
      <div className="flex items-center gap-2 text-green-500">
        <PartyPopper className="h-5 w-5" />
        <span className="font-bold">Released!</span>
      </div>
    );
  }
  
  const days = differenceInDays(target, now);
  const hours = differenceInHours(target, now) % 24;
  const minutes = differenceInMinutes(target, now) % 60;
  const seconds = differenceInSeconds(target, now) % 60;
  
  return (
    <div className="grid grid-cols-4 gap-2 text-center">
      <div className="bg-muted rounded-lg p-2">
        <p className="text-2xl font-bold">{days}</p>
        <p className="text-xs text-muted-foreground">Days</p>
      </div>
      <div className="bg-muted rounded-lg p-2">
        <p className="text-2xl font-bold">{hours}</p>
        <p className="text-xs text-muted-foreground">Hours</p>
      </div>
      <div className="bg-muted rounded-lg p-2">
        <p className="text-2xl font-bold">{minutes}</p>
        <p className="text-xs text-muted-foreground">Min</p>
      </div>
      <div className="bg-muted rounded-lg p-2">
        <p className="text-2xl font-bold">{seconds}</p>
        <p className="text-xs text-muted-foreground">Sec</p>
      </div>
    </div>
  );
}

export default function ReleaseCountdown() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);
  const [newRelease, setNewRelease] = useState({
    title: '',
    artistName: '',
    releaseDate: '',
  });

  const { data: releasesData, isLoading } = useQuery<{ countdowns: Release[] }>({
    queryKey: ['/api/countdowns'],
    enabled: !!user,
  });

  const createReleaseMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/countdowns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newRelease),
      });
      if (!res.ok) throw new Error('Failed to create countdown');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/countdowns'] });
      setShowCreateDialog(false);
      setNewRelease({ title: '', artistName: '', releaseDate: '' });
      toast({ title: 'Countdown created', description: 'Your release countdown is now active!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const toggleTaskMutation = useMutation({
    mutationFn: async ({ releaseId, taskId, completed }: { releaseId: string; taskId: string; completed: boolean }) => {
      const res = await fetch(`/api/countdowns/${releaseId}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ completed }),
      });
      if (!res.ok) throw new Error('Failed to update task');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/countdowns'] });
    },
  });

  if (!user) {
    setLocation('/login');
    return null;
  }

  const releases = releasesData?.countdowns || [];
  const upcomingReleases = releases.filter(r => r.status === 'upcoming');
  const pastReleases = releases.filter(r => r.status === 'released');

  const getTaskIcon = (category: string) => {
    switch (category) {
      case 'artwork': return <Image className="h-4 w-4" />;
      case 'social': return <Share2 className="h-4 w-4" />;
      case 'distribution': return <Music className="h-4 w-4" />;
      case 'content': return <FileText className="h-4 w-4" />;
      case 'promotion': return <Bell className="h-4 w-4" />;
      default: return <CheckCircle className="h-4 w-4" />;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Timer className="h-8 w-8 text-primary" />
              Release Countdown
            </h1>
            <p className="text-muted-foreground mt-1">
              Track your upcoming releases and manage pre-release tasks
            </p>
          </div>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Countdown
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Release Countdown</DialogTitle>
                <DialogDescription>
                  Set up a countdown for your upcoming release
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Release Title</Label>
                  <Input
                    id="title"
                    value={newRelease.title}
                    onChange={(e) => setNewRelease({ ...newRelease, title: e.target.value })}
                    placeholder="My New Single"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="artist">Artist Name</Label>
                  <Input
                    id="artist"
                    value={newRelease.artistName}
                    onChange={(e) => setNewRelease({ ...newRelease, artistName: e.target.value })}
                    placeholder="Your artist name"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="date">Release Date</Label>
                  <Input
                    id="date"
                    type="datetime-local"
                    value={newRelease.releaseDate}
                    onChange={(e) => setNewRelease({ ...newRelease, releaseDate: e.target.value })}
                  />
                </div>
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
                <Button 
                  onClick={() => createReleaseMutation.mutate()}
                  disabled={!newRelease.title || !newRelease.releaseDate || createReleaseMutation.isPending}
                >
                  {createReleaseMutation.isPending ? 'Creating...' : 'Create Countdown'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="upcoming" className="space-y-4">
          <TabsList>
            <TabsTrigger value="upcoming">
              Upcoming ({upcomingReleases.length})
            </TabsTrigger>
            <TabsTrigger value="past">
              Past Releases ({pastReleases.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="space-y-4">
            {upcomingReleases.length === 0 ? (
              <Card className="p-12 text-center">
                <Rocket className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-medium">No upcoming releases</h3>
                <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                  Create a countdown to track your next release and manage all your pre-release tasks in one place
                </p>
                <Button className="mt-6" onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Countdown
                </Button>
              </Card>
            ) : (
              <div className="grid lg:grid-cols-2 gap-6">
                {upcomingReleases.map((release) => (
                  <Card 
                    key={release.id}
                    className="cursor-pointer hover:border-primary transition-colors"
                    onClick={() => setSelectedRelease(release)}
                  >
                    <CardHeader>
                      <div className="flex items-start gap-4">
                        <div className="h-20 w-20 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                          {release.coverArt ? (
                            <img src={release.coverArt} alt={release.title} className="h-full w-full object-cover" />
                          ) : (
                            <Music className="h-8 w-8 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1">
                          <CardTitle>{release.title}</CardTitle>
                          <CardDescription>{release.artistName}</CardDescription>
                          <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            {format(new Date(release.releaseDate), 'MMM d, yyyy h:mm a')}
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <CountdownTimer targetDate={release.releaseDate} />
                      
                      <div>
                        <div className="flex items-center justify-between text-sm mb-2">
                          <span>Pre-release tasks</span>
                          <span>
                            {release.tasks.filter(t => t.completed).length}/{release.tasks.length}
                          </span>
                        </div>
                        <Progress 
                          value={(release.tasks.filter(t => t.completed).length / release.tasks.length) * 100} 
                          className="h-2"
                        />
                      </div>
                      
                      {release.presaveLink && (
                        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-amber-500" />
                            <span className="text-sm font-medium">{release.presaveCount} pre-saves</span>
                          </div>
                          <Button size="sm" variant="outline">
                            <ExternalLink className="h-4 w-4 mr-1" />
                            Share
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="past" className="space-y-4">
            {pastReleases.length === 0 ? (
              <Card className="p-8 text-center">
                <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-medium">No past releases</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Completed release countdowns will appear here
                </p>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pastReleases.map((release) => (
                  <Card key={release.id}>
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                          {release.coverArt ? (
                            <img src={release.coverArt} alt={release.title} className="h-full w-full object-cover" />
                          ) : (
                            <Music className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                        <div>
                          <CardTitle className="text-base">{release.title}</CardTitle>
                          <CardDescription className="text-xs">
                            Released {format(new Date(release.releaseDate), 'MMM d, yyyy')}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardFooter>
                      <Badge variant="default" className="flex items-center gap-1">
                        <PartyPopper className="h-3 w-3" />
                        {release.presaveCount} pre-saves
                      </Badge>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {selectedRelease && (
          <Dialog open={!!selectedRelease} onOpenChange={() => setSelectedRelease(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                    {selectedRelease.coverArt ? (
                      <img src={selectedRelease.coverArt} alt={selectedRelease.title} className="h-full w-full object-cover" />
                    ) : (
                      <Music className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <span>{selectedRelease.title}</span>
                    <p className="text-sm font-normal text-muted-foreground">{selectedRelease.artistName}</p>
                  </div>
                </DialogTitle>
              </DialogHeader>
              
              <div className="space-y-6">
                <CountdownTimer targetDate={selectedRelease.releaseDate} />
                
                <div>
                  <h4 className="font-medium mb-3">Pre-Release Checklist</h4>
                  <div className="space-y-2">
                    {selectedRelease.tasks.map((task) => (
                      <div 
                        key={task.id}
                        className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <Checkbox
                          checked={task.completed}
                          onCheckedChange={(checked) => 
                            toggleTaskMutation.mutate({
                              releaseId: selectedRelease.id,
                              taskId: task.id,
                              completed: !!checked,
                            })
                          }
                        />
                        <div className="flex items-center gap-2 flex-1">
                          {getTaskIcon(task.category)}
                          <span className={task.completed ? 'line-through text-muted-foreground' : ''}>
                            {task.title}
                          </span>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {task.category}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <Button className="flex-1">
                    <Share2 className="h-4 w-4 mr-2" />
                    Share Pre-save Link
                  </Button>
                  <Button variant="outline">
                    <Bell className="h-4 w-4 mr-2" />
                    Notify Fans
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}
