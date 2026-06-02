import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRequireSubscription } from "@/hooks/useRequireAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Music,
  Send,
  Users,
  Search,
  ExternalLink,
  Plus,
  BarChart3,
  Clock,
  CheckCircle,
  XCircle,
  Filter,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface PlaylistPitch {
  id: string;
  trackTitle: string;
  artistName: string;
  genre: string;
  mood: string;
  bpm: number;
  description: string;
  status: "draft" | "submitted" | "under_review" | "accepted" | "rejected";
  playlistUrl: string;
  curatorName: string;
  submittedAt: string;
}

interface Curator {
  id: string;
  name: string;
  genre: string;
  followers: string;
  submissionUrl: string;
  email: string;
}

interface PitchStats {
  total: number;
  accepted: number;
  pending: number;
  rejected: number;
  conversionRate: number;
}

export default function PlaylistPitching() {
  const { user } = useRequireSubscription();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isNewPitchOpen, setIsNewPitchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterGenre, setFilterGenre] = useState("all");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const { data: pitches = [], isLoading: pitchesLoading } = useQuery<
    PlaylistPitch[]
  >({
    queryKey: ["/api/playlist-pitching"],
  });

  const { data: curators = [], isLoading: curatorsLoading } = useQuery<
    Curator[]
  >({
    queryKey: ["/api/playlist-pitching/curators"],
  });

  const { data: stats } = useQuery<PitchStats>({
    queryKey: ["/api/playlist-pitching/stats"],
  });

  const [newPitchForm, setNewPitchForm] = useState({
    trackTitle: "",
    artistName: "",
    genre: "",
    curatorName: "",
    playlistUrl: "",
    description: "",
    status: "submitted",
  });

  const createPitchMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const response = await apiRequest("POST", "/api/playlist-pitching", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Pitch created!",
        description: "Your submission has been tracked.",
      });
      setIsNewPitchOpen(false);
      setNewPitchForm({
        trackTitle: "",
        artistName: "",
        genre: "",
        curatorName: "",
        playlistUrl: "",
        description: "",
        status: "submitted",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/playlist-pitching"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/playlist-pitching/stats"],
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await apiRequest("PUT", `/api/playlist-pitching/${id}`, {
        status,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Status updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/playlist-pitching"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/playlist-pitching/stats"],
      });
    },
  });

  const deletePitchMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/playlist-pitching/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Pitch removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/playlist-pitching"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/playlist-pitching/stats"],
      });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return (
          <Badge
            variant="outline"
            className="bg-slate-500/10 text-slate-400 border-slate-500/20"
          >
            Draft
          </Badge>
        );
      case "submitted":
        return (
          <Badge
            variant="outline"
            className="bg-blue-500/10 text-blue-400 border-blue-500/20"
          >
            Submitted
          </Badge>
        );
      case "under_review":
        return (
          <Badge
            variant="outline"
            className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
          >
            Under Review
          </Badge>
        );
      case "accepted":
        return (
          <Badge
            variant="outline"
            className="bg-green-500/10 text-green-400 border-green-500/20"
          >
            Accepted
          </Badge>
        );
      case "rejected":
        return (
          <Badge
            variant="outline"
            className="bg-red-500/10 text-red-400 border-red-500/20"
          >
            Rejected
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filteredCurators = curators.filter(
    (c) =>
      (c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.genre.toLowerCase().includes(searchQuery.toLowerCase())) &&
      (filterGenre === "all" ||
        c.genre.toLowerCase().includes(filterGenre.toLowerCase())),
  );

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">
              Playlist Pitching
            </h1>
            <p className="text-gray-400">
              Track your submissions and find the right curators for your music.
            </p>
          </div>
          <Button
            onClick={() => setIsNewPitchOpen(true)}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Track New Pitch
          </Button>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Total Pitches</p>
                  <p className="text-2xl font-bold text-white">
                    {stats?.total || 0}
                  </p>
                </div>
                <div className="p-2 rounded-full bg-blue-500/10">
                  <Send className="w-5 h-5 text-blue-500" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Accepted</p>
                  <p className="text-2xl font-bold text-green-500">
                    {stats?.accepted || 0}
                  </p>
                </div>
                <div className="p-2 rounded-full bg-green-500/10">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Pending</p>
                  <p className="text-2xl font-bold text-yellow-500">
                    {stats?.pending || 0}
                  </p>
                </div>
                <div className="p-2 rounded-full bg-yellow-500/10">
                  <Clock className="w-5 h-5 text-yellow-500" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="pt-6 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Conversion Rate</p>
                  <p className="text-2xl font-bold text-purple-500">
                    {(stats?.conversionRate || 0).toFixed(1)}%
                  </p>
                </div>
                <div className="p-2 rounded-full bg-purple-500/10">
                  <BarChart3 className="w-5 h-5 text-purple-500" />
                </div>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-purple-500 h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, stats?.conversionRate || 0)}%`,
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="my-pitches" className="w-full">
          <TabsList className="bg-gray-900 border-gray-800 mb-6">
            <TabsTrigger value="my-pitches">My Pitches</TabsTrigger>
            <TabsTrigger value="find-curators">Find Curators</TabsTrigger>
          </TabsList>

          <TabsContent value="my-pitches" className="space-y-4">
            {!pitchesLoading && pitches.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-700 bg-gray-900/50 py-14 px-6 text-center space-y-6">
                <div className="mx-auto w-16 h-16 rounded-full bg-purple-500/10 flex items-center justify-center">
                  <Send className="w-7 h-7 text-purple-400" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold text-white">
                    Start tracking your pitches
                  </h3>
                  <p className="text-gray-400 max-w-md mx-auto text-sm leading-relaxed">
                    Log every playlist submission you make — accepted, rejected,
                    or still waiting. Build a real picture of what's working.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-xl mx-auto text-left">
                  {[
                    {
                      step: "1",
                      text: 'Find a curator in the "Find Curators" tab',
                    },
                    {
                      step: "2",
                      text: "Submit your music via their submission link",
                    },
                    {
                      step: "3",
                      text: "Track the pitch here and update its status",
                    },
                  ].map((item) => (
                    <div
                      key={item.step}
                      className="flex items-start gap-3 p-3 rounded-lg bg-gray-800/60 border border-gray-700"
                    >
                      <div className="w-6 h-6 rounded-full bg-purple-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {item.step}
                      </div>
                      <p className="text-xs text-gray-300">{item.text}</p>
                    </div>
                  ))}
                </div>
                <Button
                  onClick={() => setIsNewPitchOpen(true)}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Track Your First Pitch
                </Button>
              </div>
            )}
            {(pitchesLoading || pitches.length > 0) && (
              <Card className="bg-gray-900 border-gray-800">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-gray-800 text-gray-400 font-medium">
                      <tr>
                        <th className="p-4">Track</th>
                        <th className="p-4">Curator</th>
                        <th className="p-4">Status</th>
                        <th className="p-4">Date</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800 text-gray-300">
                      {pitchesLoading ? (
                        <>
                          {[1, 2, 3, 4].map((i) => (
                            <tr key={i}>
                              <td className="p-4">
                                <Skeleton className="h-4 w-40" />
                              </td>
                              <td className="p-4">
                                <Skeleton className="h-4 w-28" />
                              </td>
                              <td className="p-4">
                                <Skeleton className="h-5 w-16 rounded-full" />
                              </td>
                              <td className="p-4">
                                <Skeleton className="h-4 w-20" />
                              </td>
                              <td className="p-4 text-right">
                                <Skeleton className="h-7 w-14 rounded ml-auto" />
                              </td>
                            </tr>
                          ))}
                        </>
                      ) : (
                        pitches.map((pitch) => (
                          <tr
                            key={pitch.id}
                            className="hover:bg-gray-800/30 transition-colors"
                          >
                            <td className="p-4">
                              <div className="flex flex-col">
                                <span className="font-medium text-white">
                                  {pitch.trackTitle}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {pitch.artistName}
                                </span>
                              </div>
                            </td>
                            <td className="p-4">
                              {pitch.curatorName || "Unknown"}
                            </td>
                            <td className="p-4">
                              {getStatusBadge(pitch.status)}
                            </td>
                            <td className="p-4 text-xs">
                              {pitch.submittedAt
                                ? new Date(
                                    pitch.submittedAt,
                                  ).toLocaleDateString()
                                : "Draft"}
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Select
                                  onValueChange={(val) =>
                                    updateStatusMutation.mutate({
                                      id: pitch.id,
                                      status: val,
                                    })
                                  }
                                  defaultValue={pitch.status}
                                >
                                  <SelectTrigger className="w-[130px] h-8 bg-gray-800 border-gray-700">
                                    <SelectValue placeholder="Update Status" />
                                  </SelectTrigger>
                                  <SelectContent className="bg-gray-900 border-gray-800">
                                    <SelectItem value="draft">Draft</SelectItem>
                                    <SelectItem value="submitted">
                                      Submitted
                                    </SelectItem>
                                    <SelectItem value="under_review">
                                      Under Review
                                    </SelectItem>
                                    <SelectItem value="accepted">
                                      Accepted
                                    </SelectItem>
                                    <SelectItem value="rejected">
                                      Rejected
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => setPendingDeleteId(pitch.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="find-curators" className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 items-center">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input
                  placeholder="Search by curator or genre..."
                  className="pl-10 bg-gray-900 border-gray-800 text-white"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <Filter className="w-4 h-4 text-gray-500" />
                <Select value={filterGenre} onValueChange={setFilterGenre}>
                  <SelectTrigger className="w-full md:w-[180px] bg-gray-900 border-gray-800">
                    <SelectValue placeholder="Genre" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-800">
                    <SelectItem value="all">All Genres</SelectItem>
                    <SelectItem value="pop">Pop</SelectItem>
                    <SelectItem value="indie">Indie</SelectItem>
                    <SelectItem value="electronic">Electronic</SelectItem>
                    <SelectItem value="hip-hop">Hip-Hop</SelectItem>
                    <SelectItem value="lofi">Lofi</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {curatorsLoading ? (
                Array(6)
                  .fill(0)
                  .map((_, i) => (
                    <Card
                      key={i}
                      className="bg-gray-900 border-gray-800 h-48 animate-pulse"
                    />
                  ))
              ) : filteredCurators.length === 0 ? (
                <div className="col-span-full py-14 text-center border border-dashed border-gray-700 rounded-xl bg-gray-900/50 space-y-3">
                  <Users className="mx-auto w-10 h-10 text-gray-600" />
                  <p className="text-gray-400 font-medium">No curators found</p>
                  <p className="text-sm text-gray-600">
                    Try a different genre filter or search term.
                  </p>
                </div>
              ) : (
                filteredCurators.map((curator) => (
                  <Card
                    key={curator.id}
                    className="bg-gray-900 border-gray-800 hover:border-purple-500/50 transition-all group"
                  >
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-lg text-white group-hover:text-purple-400 transition-colors">
                            {curator.name}
                          </CardTitle>
                          <p className="text-sm text-gray-500 mt-1">
                            {curator.genre}
                          </p>
                        </div>
                        <Badge
                          variant="secondary"
                          className="bg-purple-500/10 text-purple-400"
                        >
                          {curator.followers}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-col gap-1 text-xs text-gray-400">
                        <span>{curator.email}</span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          asChild
                          variant="outline"
                          className="flex-1 bg-gray-800 border-gray-700 h-9 text-xs"
                        >
                          <a
                            href={curator.submissionUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="w-3 h-3 mr-2" />
                            Submit Music
                          </a>
                        </Button>
                        <Button
                          onClick={() => {
                            setNewPitchForm((prev) => ({
                              ...prev,
                              curatorName: curator.name,
                              playlistUrl: curator.submissionUrl,
                            }));
                            setIsNewPitchOpen(true);
                          }}
                          className="flex-1 bg-purple-600/10 hover:bg-purple-600/20 text-purple-400 h-9 text-xs"
                        >
                          Track Pitch
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* New Pitch Dialog */}
        <Dialog open={isNewPitchOpen} onOpenChange={setIsNewPitchOpen}>
          <DialogContent className="bg-gray-900 border-gray-800 text-white sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Track New Playlist Pitch</DialogTitle>
              <DialogDescription className="text-gray-400">
                Record a pitch you've made to track its status and follow-ups.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="trackTitle">Track Title</Label>
                <Input
                  id="trackTitle"
                  placeholder="e.g. Midnight Waves"
                  className="bg-gray-800 border-gray-700"
                  value={newPitchForm.trackTitle}
                  onChange={(e) =>
                    setNewPitchForm({
                      ...newPitchForm,
                      trackTitle: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="artistName">Artist Name</Label>
                <Input
                  id="artistName"
                  placeholder="Your artist name"
                  className="bg-gray-800 border-gray-700"
                  value={newPitchForm.artistName}
                  onChange={(e) =>
                    setNewPitchForm({
                      ...newPitchForm,
                      artistName: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="genre">Genre</Label>
                <Input
                  id="genre"
                  placeholder="e.g. Dream Pop"
                  className="bg-gray-800 border-gray-700"
                  value={newPitchForm.genre}
                  onChange={(e) =>
                    setNewPitchForm({ ...newPitchForm, genre: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Current Status</Label>
                <Select
                  value={newPitchForm.status}
                  onValueChange={(val) =>
                    setNewPitchForm({ ...newPitchForm, status: val })
                  }
                >
                  <SelectTrigger className="bg-gray-800 border-gray-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-800">
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="submitted">Submitted</SelectItem>
                    <SelectItem value="under_review">Under Review</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 col-span-2">
                <Label htmlFor="curatorName">Curator / Playlist Name</Label>
                <Input
                  id="curatorName"
                  placeholder="e.g. Indie Mono"
                  className="bg-gray-800 border-gray-700"
                  value={newPitchForm.curatorName}
                  onChange={(e) =>
                    setNewPitchForm({
                      ...newPitchForm,
                      curatorName: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label htmlFor="playlistUrl">Playlist / Submission URL</Label>
                <Input
                  id="playlistUrl"
                  placeholder="https://..."
                  className="bg-gray-800 border-gray-700"
                  value={newPitchForm.playlistUrl}
                  onChange={(e) =>
                    setNewPitchForm({
                      ...newPitchForm,
                      playlistUrl: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label htmlFor="description">Pitch Description</Label>
                <Textarea
                  id="description"
                  placeholder="Tell the curator about your track..."
                  className="bg-gray-800 border-gray-700 h-24"
                  value={newPitchForm.description}
                  onChange={(e) =>
                    setNewPitchForm({
                      ...newPitchForm,
                      description: e.target.value,
                    })
                  }
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsNewPitchOpen(false)}
                className="bg-gray-800 border-gray-700"
              >
                Cancel
              </Button>
              <Button
                onClick={() =>
                  createPitchMutation.mutate({
                    ...newPitchForm,
                    submittedAt: new Date().toISOString(),
                  })
                }
                className="bg-purple-600 hover:bg-purple-700"
                disabled={createPitchMutation.isPending}
              >
                {createPitchMutation.isPending ? "Saving..." : "Save Pitch"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Pitch Confirmation */}
        <AlertDialog
          open={!!pendingDeleteId}
          onOpenChange={(open) => {
            if (!open) setPendingDeleteId(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Pitch</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this pitch? This action cannot
                be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (pendingDeleteId) {
                    deletePitchMutation.mutate(pendingDeleteId);
                    setPendingDeleteId(null);
                  }
                }}
              >
                Delete Pitch
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
