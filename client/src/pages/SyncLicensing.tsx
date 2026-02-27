import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Film, Music, Plus, DollarSign, Clock, CheckCircle } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useRequireSubscription } from '@/hooks/useRequireAuth';

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

  const { data: catalog = [], isLoading } = useQuery<SyncSubmission[]>({
    queryKey: ['/api/sync-licensing'],
  });

  const { data: stats } = useQuery<SyncStats>({
    queryKey: ['/api/sync-licensing/stats'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/sync-licensing', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sync-licensing'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sync-licensing/stats'] });
      setIsDialogOpen(false);
      toast({ title: 'Success', description: 'Track added to sync catalog' });
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
      case 'available':
        return <Badge variant="outline">Available</Badge>;
      case 'submitted':
        return <Badge variant="secondary">Submitted</Badge>;
      case 'under_review':
        return <Badge className="bg-yellow-500">Under Review</Badge>;
      case 'licensed':
        return <Badge className="bg-green-500">Licensed</Badge>;
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
            <p className="text-muted-foreground">Put Your Music in TV, Film & Ads</p>
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
                    <Input id="mood" name="mood" placeholder="Epic, Dark, Happy" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bpm">BPM</Label>
                    <Input id="bpm" name="bpm" type="number" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="usageType">Usage Type</Label>
                    <Input id="usageType" name="usageType" placeholder="TV/Film/Ads" />
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
                    {createMutation.isPending ? 'Adding...' : 'Add Track'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Catalog Size</CardTitle>
              <Music className="h-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalTracks || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Licensed Tracks</CardTitle>
              <CheckCircle className="h-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.licensedCount || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
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
              <div className="text-2xl font-bold">{stats?.pendingCount || 0}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sync Catalog</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-8 text-center text-muted-foreground">Loading catalog...</div>
            ) : catalog.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                No tracks in your sync catalog yet. Add your first track to get started!
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Track</TableHead>
                    <TableHead>Genre/Mood</TableHead>
                    <TableHead>BPM</TableHead>
                    <TableHead>Usage Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {catalog.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.trackTitle}
                        <div className="text-xs text-muted-foreground">{item.artistName}</div>
                      </TableCell>
                      <TableCell>
                        {item.genre}
                        <div className="text-xs text-muted-foreground">{item.mood}</div>
                      </TableCell>
                      <TableCell>{item.bpm || '-'}</TableCell>
                      <TableCell>{item.usageType || '-'}</TableCell>
                      <TableCell>{getStatusBadge(item.status)}</TableCell>
                      <TableCell>${item.price || '0.00'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
