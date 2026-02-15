import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CountdownTimer } from "./CountdownTimer";
import { ReleaseChecklist } from "./ReleaseChecklist";
import { CountdownCard } from "./CountdownCard";
import { PresaveTracker } from "./PresaveTracker";
import {
  Plus,
  Rocket,
  Calendar,
  ListTodo,
  BarChart3,
  Sparkles,
  Music,
  ExternalLink,
} from "lucide-react";

interface Countdown {
  id: string;
  title: string;
  releaseDate: string;
  artworkUrl?: string;
  presaveUrl?: string;
  status: string;
  progress: {
    completed: number;
    total: number;
    percentage: number;
  };
  timeRemaining: {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isReleased: boolean;
  };
  taskCount: number;
}

interface CountdownDetail extends Countdown {
  tasks: Array<{
    id: string;
    task: string;
    dueDate: string | null;
    completedAt: string | null;
    category: string | null;
    order: number;
  }>;
  analytics: {
    totalPresaves: number;
    totalShares: number;
    totalPageViews: number;
    dailyData: Array<{
      date: string;
      presaves: number;
      shares: number;
      pageViews: number;
    }>;
  };
}

export function PreReleaseHub() {
  const [selectedCountdownId, setSelectedCountdownId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newCountdown, setNewCountdown] = useState({
    title: "",
    releaseDate: "",
    artworkUrl: "",
    presaveUrl: "",
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: countdownsData, isLoading: countdownsLoading } = useQuery<{
    success: boolean;
    data: Countdown[];
  }>({
    queryKey: ["/api/countdowns"],
  });

  const { data: countdownDetail, isLoading: detailLoading } = useQuery<{
    success: boolean;
    data: CountdownDetail;
  }>({
    queryKey: [`/api/countdowns/${selectedCountdownId}`],
    enabled: !!selectedCountdownId,
  });

  const createCountdownMutation = useMutation({
    mutationFn: async (data: typeof newCountdown) => {
      const response = await apiRequest("POST", "/api/countdowns", data);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/countdowns"] });
      setCreateDialogOpen(false);
      setNewCountdown({ title: "", releaseDate: "", artworkUrl: "", presaveUrl: "" });
      setSelectedCountdownId(data.data.countdown.id);
      toast({
        title: "Countdown Created",
        description: "Your release countdown has been created with a pre-release checklist.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create countdown",
        variant: "destructive",
      });
    },
  });

  const countdowns = countdownsData?.data || [];
  const detail = countdownDetail?.data;

  const activeCountdowns = countdowns.filter((c) => !c.timeRemaining.isReleased);
  const pastCountdowns = countdowns.filter((c) => c.timeRemaining.isReleased);

  const handleCreateCountdown = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCountdown.title || !newCountdown.releaseDate) {
      toast({
        title: "Missing Fields",
        description: "Please fill in the title and release date",
        variant: "destructive",
      });
      return;
    }
    createCountdownMutation.mutate(newCountdown);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Rocket className="h-8 w-8 text-primary" />
            Pre-Release Hub
          </h1>
          <p className="text-muted-foreground mt-1">
            Build excitement and track your release campaigns
          </p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Countdown
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Release Countdown</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateCountdown} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Release Title</Label>
                <Input
                  id="title"
                  placeholder="My New Album"
                  value={newCountdown.title}
                  onChange={(e) => setNewCountdown({ ...newCountdown, title: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="releaseDate">Release Date</Label>
                <Input
                  id="releaseDate"
                  type="datetime-local"
                  value={newCountdown.releaseDate}
                  onChange={(e) => setNewCountdown({ ...newCountdown, releaseDate: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="artworkUrl">Artwork URL (optional)</Label>
                <Input
                  id="artworkUrl"
                  placeholder="https://..."
                  value={newCountdown.artworkUrl}
                  onChange={(e) => setNewCountdown({ ...newCountdown, artworkUrl: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="presaveUrl">Pre-save URL (optional)</Label>
                <Input
                  id="presaveUrl"
                  placeholder="https://..."
                  value={newCountdown.presaveUrl}
                  onChange={(e) => setNewCountdown({ ...newCountdown, presaveUrl: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createCountdownMutation.isPending}>
                  {createCountdownMutation.isPending ? "Creating..." : "Create Countdown"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {countdownsLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <Skeleton className="h-32 w-full" />
              <CardContent className="p-4">
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : countdowns.length === 0 ? (
        <Card className="p-12 text-center">
          <Sparkles className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">No Release Countdowns Yet</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Create your first countdown to start building excitement for your upcoming release with
            a complete pre-release checklist.
          </p>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Your First Countdown
          </Button>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  Active Countdowns
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {activeCountdowns.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No active countdowns
                  </p>
                ) : (
                  activeCountdowns.map((countdown) => (
                    <div
                      key={countdown.id}
                      onClick={() => setSelectedCountdownId(countdown.id)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        selectedCountdownId === countdown.id
                          ? "border-primary bg-primary/5"
                          : "border-transparent bg-muted/30 hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {countdown.artworkUrl ? (
                          <img
                            src={countdown.artworkUrl}
                            alt={countdown.title}
                            className="w-10 h-10 rounded object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center">
                            <Music className="h-5 w-5 text-primary" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{countdown.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {countdown.timeRemaining.days}d {countdown.timeRemaining.hours}h left
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {pastCountdowns.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Music className="h-5 w-5 text-green-500" />
                    Released
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {pastCountdowns.map((countdown) => (
                    <div
                      key={countdown.id}
                      onClick={() => setSelectedCountdownId(countdown.id)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        selectedCountdownId === countdown.id
                          ? "border-primary bg-primary/5"
                          : "border-transparent bg-muted/30 hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {countdown.artworkUrl ? (
                          <img
                            src={countdown.artworkUrl}
                            alt={countdown.title}
                            className="w-10 h-10 rounded object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded bg-green-500/10 flex items-center justify-center">
                            <Music className="h-5 w-5 text-green-500" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{countdown.title}</p>
                          <p className="text-xs text-green-500">Released</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          <div className="lg:col-span-2 space-y-6">
            {selectedCountdownId && detail ? (
              <>
                <CountdownTimer
                  releaseDate={detail.releaseDate}
                  title={detail.title}
                  artworkUrl={detail.artworkUrl}
                />

                <Tabs defaultValue="checklist">
                  <TabsList className="w-full">
                    <TabsTrigger value="checklist" className="flex-1">
                      <ListTodo className="h-4 w-4 mr-2" />
                      Checklist
                    </TabsTrigger>
                    <TabsTrigger value="analytics" className="flex-1">
                      <BarChart3 className="h-4 w-4 mr-2" />
                      Analytics
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="checklist" className="mt-4">
                    <ReleaseChecklist
                      countdownId={selectedCountdownId}
                      tasks={detail.tasks}
                      isLoading={detailLoading}
                    />
                  </TabsContent>
                  <TabsContent value="analytics" className="mt-4">
                    <PresaveTracker
                      countdownId={selectedCountdownId}
                      presaveUrl={detail.presaveUrl}
                      analytics={detail.analytics}
                    />
                  </TabsContent>
                </Tabs>
              </>
            ) : (
              <Card className="p-12 text-center">
                <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Select a Countdown</h3>
                <p className="text-muted-foreground">
                  Choose a countdown from the list to view details
                </p>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default PreReleaseHub;
