import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Film,
  Music,
  Plus,
  DollarSign,
  Clock,
  CheckCircle,
  Edit,
  Trash2,
  MoreVertical,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useRequireSubscription } from "@/hooks/useRequireAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface SyncSubmission {
  id: string;
  trackTitle: string;
  artistName: string;
  genre: string;
  mood: string;
  bpm: number;
  usageType: string;
  status: string;
  price: string;
  createdAt: string;
}

interface SyncStats {
  totalTracks: number;
  licensedCount: number;
  revenue: number;
  pendingCount: number;
}

export default function SyncLicensing() {
  const { user } = useRequireSubscription();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SyncSubmission | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const { data: catalog = [], isLoading } = useQuery<SyncSubmission[]>({
    queryKey: ["/api/sync-licensing"],
  });

  const { data: stats } = useQuery<SyncStats>({
    queryKey: ["/api/sync-licensing/stats"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/sync-licensing", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sync-licensing"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/sync-licensing/stats"],
      });
      setIsDialogOpen(false);
      toast({
        title: "Track added",
        description: "Your track is now in the sync catalog.",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: Record<string, unknown>) => {
      const res = await apiRequest("PUT", `/api/sync-licensing/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sync-licensing"] });
      setEditingItem(null);
      toast({ title: "Track updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/sync-licensing/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sync-licensing"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/sync-licensing/stats"],
      });
      toast({ title: "Track removed from catalog" });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());
    createMutation.mutate({
      ...data,
      bpm: data.bpm ? parseInt(data.bpm as string) : undefined,
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "available":
        return (
          <Badge
            variant="outline"
            className="border-blue-500/30 text-blue-400 bg-blue-500/10"
          >
            Available
          </Badge>
        );
      case "submitted":
        return (
          <Badge
            variant="outline"
            className="border-yellow-500/30 text-yellow-400 bg-yellow-500/10"
          >
            Submitted
          </Badge>
        );
      case "under_review":
        return (
          <Badge
            variant="outline"
            className="border-orange-500/30 text-orange-400 bg-orange-500/10"
          >
            Under Review
          </Badge>
        );
      case "licensed":
        return (
          <Badge
            variant="outline"
            className="border-green-500/30 text-green-400 bg-green-500/10"
          >
            Licensed ✓
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (!user) return null;

  return (
    <AppLayout>
      <div className="p-6 space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold gradient-text mb-2 flex items-center gap-2">
              <Film className="w-8 h-8" />
              Sync Licensing
            </h1>
            <p className="text-muted-foreground">
              Put Your Music in TV, Film & Ads
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add to Catalog
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add Track to Sync Catalog</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="trackTitle">Track Title</Label>
                    <Input id="trackTitle" name="trackTitle" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="artistName">Artist Name</Label>
                    <Input id="artistName" name="artistName" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="genre">Genre</Label>
                    <Input id="genre" name="genre" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mood">Mood Tags</Label>
                    <Input
                      id="mood"
                      name="mood"
                      placeholder="Epic, Dark, Happy"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bpm">BPM</Label>
                    <Input id="bpm" name="bpm" type="number" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="usageType">Usage Type</Label>
                    <Input
                      id="usageType"
                      name="usageType"
                      placeholder="TV/Film/Ads"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="price">Licensing Price ($)</Label>
                    <Input id="price" name="price" type="number" step="0.01" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <textarea
                    id="description"
                    name="description"
                    className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Adding..." : "Add Track"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Catalog Size
              </CardTitle>
              <Music className="h-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats?.totalTracks || 0}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Licensed Tracks
              </CardTitle>
              <CheckCircle className="h-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats?.licensedCount || 0}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Earnings
              </CardTitle>
              <DollarSign className="h-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${stats?.revenue || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats?.pendingCount || 0}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sync Catalog</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2 py-2">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="flex items-center gap-4 px-4 py-3 border-b last:border-0"
                  >
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-4 w-14" />
                  </div>
                ))}
              </div>
            ) : catalog.length === 0 ? (
              <div className="py-14 text-center space-y-5">
                <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Film className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-1">
                    Your sync catalog is empty
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    Add tracks to license your music to TV shows, films, ads,
                    and video games. Include mood tags and BPM to help music
                    supervisors find your work.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-xl mx-auto text-left">
                  {[
                    {
                      icon: "🎬",
                      label: "TV & Film",
                      desc: "Score your music for television and movies",
                    },
                    {
                      icon: "📢",
                      label: "Advertising",
                      desc: "License tracks for brand campaigns",
                    },
                    {
                      icon: "🎮",
                      label: "Video Games",
                      desc: "Provide music for gaming environments",
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="p-3 rounded-lg border bg-muted/30 text-center space-y-1"
                    >
                      <div className="text-2xl">{item.icon}</div>
                      <p className="text-xs font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.desc}
                      </p>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setIsDialogOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Add Your First Track
                </button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Track</TableHead>
                    <TableHead>Genre / Mood</TableHead>
                    <TableHead>BPM</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {catalog.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.trackTitle}
                        <div className="text-xs text-muted-foreground">
                          {item.artistName}
                        </div>
                      </TableCell>
                      <TableCell>
                        {item.genre || "—"}
                        {item.mood && (
                          <div className="text-xs text-muted-foreground">
                            {item.mood}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{item.bpm || "—"}</TableCell>
                      <TableCell>{item.usageType || "—"}</TableCell>
                      <TableCell>{getStatusBadge(item.status)}</TableCell>
                      <TableCell className="font-medium">
                        ${item.price || "0.00"}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setEditingItem(item)}
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => setPendingDeleteId(item.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog
        open={!!editingItem}
        onOpenChange={(open) => {
          if (!open) setEditingItem(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Track</DialogTitle>
          </DialogHeader>
          {editingItem && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const data = Object.fromEntries(fd.entries());
                updateMutation.mutate({
                  id: editingItem.id,
                  ...data,
                  bpm: data.bpm ? parseInt(data.bpm as string) : undefined,
                });
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-trackTitle">Track Title</Label>
                  <Input
                    id="edit-trackTitle"
                    name="trackTitle"
                    defaultValue={editingItem.trackTitle}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-artistName">Artist Name</Label>
                  <Input
                    id="edit-artistName"
                    name="artistName"
                    defaultValue={editingItem.artistName}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-genre">Genre</Label>
                  <Input
                    id="edit-genre"
                    name="genre"
                    defaultValue={editingItem.genre}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-mood">Mood Tags</Label>
                  <Input
                    id="edit-mood"
                    name="mood"
                    defaultValue={editingItem.mood}
                    placeholder="Epic, Dark, Happy"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-bpm">BPM</Label>
                  <Input
                    id="edit-bpm"
                    name="bpm"
                    type="number"
                    defaultValue={editingItem.bpm}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-usageType">Usage Type</Label>
                  <Input
                    id="edit-usageType"
                    name="usageType"
                    defaultValue={editingItem.usageType}
                    placeholder="TV/Film/Ads"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-price">Licensing Price ($)</Label>
                  <Input
                    id="edit-price"
                    name="price"
                    type="number"
                    step="0.01"
                    defaultValue={editingItem.price}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-status">Status</Label>
                  <Select name="status" defaultValue={editingItem.status}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="available">Available</SelectItem>
                      <SelectItem value="submitted">Submitted</SelectItem>
                      <SelectItem value="under_review">Under Review</SelectItem>
                      <SelectItem value="licensed">Licensed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingItem(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!pendingDeleteId}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from Catalog</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this track from your sync catalog?
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDeleteId) {
                  deleteMutation.mutate(pendingDeleteId);
                  setPendingDeleteId(null);
                }
              }}
            >
              Remove Track
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
