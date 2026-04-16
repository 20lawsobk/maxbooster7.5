import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { Skeleton } from '@/components/ui/skeleton';
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
import { Copyright, Plus, FileText, CheckCircle, Clock, PieChart, Edit, Trash2, MoreVertical } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useRequireSubscription } from '@/hooks/useRequireAuth';
import { Cell, Pie, PieChart as RechartsPieChart, ResponsiveContainer, Tooltip } from 'recharts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface PublishingWork {
  id: string;
  trackTitle: string;
  iswc: string;
  isrc: string;
  proName: string;
  publishingSplit: string;
  writerSplit: string;
  status: string;
  registeredAt: string;
}

interface PublishingStats {
  totalWorks: number;
  pendingCount: number;
  confirmedCount: number;
}

export default function Publishing() {
  const { user } = useRequireSubscription();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingWork, setEditingWork] = useState<PublishingWork | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const { data: works = [], isLoading } = useQuery<PublishingWork[]>({
    queryKey: ['/api/publishing'],
  });

  const { data: stats } = useQuery<PublishingStats>({
    queryKey: ['/api/publishing/stats'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/publishing', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/publishing'] });
      queryClient.invalidateQueries({ queryKey: ['/api/publishing/stats'] });
      setIsDialogOpen(false);
      toast({ title: 'Work registered successfully' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await apiRequest('PUT', `/api/publishing/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/publishing'] });
      queryClient.invalidateQueries({ queryKey: ['/api/publishing/stats'] });
      setEditingWork(null);
      toast({ title: 'Work updated' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/publishing/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/publishing'] });
      queryClient.invalidateQueries({ queryKey: ['/api/publishing/stats'] });
      toast({ title: 'Work removed' });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());
    createMutation.mutate({
      ...data,
      copyrightYear: data.copyrightYear ? parseInt(data.copyrightYear as string) : undefined,
    });
  };

  // Build pie chart data from actual works — average splits across all works
  const splitData = works.length > 0
    ? (() => {
        const avgWriter = works.reduce((s, w) => s + (Number(w.writerSplit) || 0), 0) / works.length;
        const avgPublisher = works.reduce((s, w) => s + (Number(w.publishingSplit) || 0), 0) / works.length;
        return [
          { name: 'Writer Split', value: Math.round(avgWriter), color: '#3b82f6' },
          { name: 'Publisher Split', value: Math.round(avgPublisher), color: '#10b981' },
        ];
      })()
    : [
        { name: 'Writer Split', value: 50, color: '#3b82f6' },
        { name: 'Publisher Split', value: 50, color: '#10b981' },
      ];

  if (!user) return null;

  return (
    <AppLayout>
      <div className="p-6 space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold gradient-text mb-2 flex items-center gap-2">
              <Copyright className="w-8 h-8" />
              Publishing Rights
            </h1>
            <p className="text-muted-foreground">Manage your PRO registrations and publishing splits</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Register Work
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Register New Work</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="trackTitle">Track Title</Label>
                    <Input id="trackTitle" name="trackTitle" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="copyrightYear">Copyright Year</Label>
                    <Input id="copyrightYear" name="copyrightYear" type="number" defaultValue={new Date().getFullYear()} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="iswc">ISWC</Label>
                    <Input id="iswc" name="iswc" placeholder="T-123.456.789-C" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="isrc">ISRC</Label>
                    <Input id="isrc" name="isrc" placeholder="US-ABC-12-34567" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="proName">PRO</Label>
                    <Input id="proName" name="proName" placeholder="ASCAP, BMI, SESAC" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="proRegistrationId">PRO Work ID</Label>
                    <Input id="proRegistrationId" name="proRegistrationId" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="writerSplit">Writer Split %</Label>
                    <Input id="writerSplit" name="writerSplit" type="number" defaultValue="50" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="publishingSplit">Publisher Split %</Label>
                    <Input id="publishingSplit" name="publishingSplit" type="number" defaultValue="50" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="publisherName">Publisher Name</Label>
                  <Input id="publisherName" name="publisherName" />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? 'Registering...' : 'Register Work'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Registered Works</CardTitle>
              <FileText className="h-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalWorks || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Confirmed</CardTitle>
              <CheckCircle className="h-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.confirmedCount || 0}</div>
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
          <Card className="row-span-2">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Split Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="h-[150px]">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={splitData}
                    innerRadius={40}
                    outerRadius={60}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {splitData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </RechartsPieChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-1">
                {splitData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                      {item.name}
                    </span>
                    <span>{item.value}%</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Registered Works</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2 py-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-4 px-4 py-3 border-b last:border-0">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            ) : works.length === 0 ? (
              <div className="py-14 text-center space-y-5">
                <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Copyright className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-1">No registered works yet</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    Register each track with your PRO to collect performance royalties whenever your music is played on radio, TV, or live venues.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2 max-w-md mx-auto">
                  {['ASCAP', 'BMI', 'SESAC', 'PRS', 'SOCAN', 'APRA'].map(pro => (
                    <span key={pro} className="px-3 py-1 rounded-full border text-xs font-medium text-muted-foreground">{pro}</span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setIsDialogOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Register Your First Work
                </button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>ISWC / ISRC</TableHead>
                    <TableHead>PRO</TableHead>
                    <TableHead>Splits (W/P)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {works.map((work) => (
                    <TableRow key={work.id}>
                      <TableCell className="font-medium">{work.trackTitle}</TableCell>
                      <TableCell>
                        <div className="text-xs">ISWC: {work.iswc || '—'}</div>
                        <div className="text-xs text-muted-foreground">ISRC: {work.isrc || '—'}</div>
                      </TableCell>
                      <TableCell>{work.proName || '—'}</TableCell>
                      <TableCell>
                        {work.writerSplit ?? '—'}% / {work.publishingSplit ?? '—'}%
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          work.status === 'confirmed'
                            ? 'border-green-500/30 text-green-500 bg-green-500/10'
                            : work.status === 'pending'
                            ? 'border-yellow-500/30 text-yellow-500 bg-yellow-500/10'
                            : 'border-muted-foreground/30'
                        }>
                          {work.status === 'confirmed' ? '✓ Confirmed' : work.status === 'pending' ? '⏳ Pending' : work.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditingWork(work)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => setPendingDeleteId(work.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <PieChart className="w-5 h-5" />
                PRO Registration Guide
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Registering your works with a Performing Rights Organization (PRO) is essential to collect performance royalties.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="justify-start" asChild>
                  <a href="https://www.ascap.com" target="_blank" rel="noopener noreferrer">ASCAP Website</a>
                </Button>
                <Button variant="outline" className="justify-start" asChild>
                  <a href="https://www.bmi.com" target="_blank" rel="noopener noreferrer">BMI Website</a>
                </Button>
                <Button variant="outline" className="justify-start" asChild>
                  <a href="https://www.sesac.com" target="_blank" rel="noopener noreferrer">SESAC Website</a>
                </Button>
                <Button variant="outline" className="justify-start" asChild>
                  <a href="https://www.prsformusic.com" target="_blank" rel="noopener noreferrer">PRS for Music</a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Work Dialog */}
      <Dialog open={!!editingWork} onOpenChange={(open) => { if (!open) setEditingWork(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Work</DialogTitle>
          </DialogHeader>
          {editingWork && (
            <form onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const data = Object.fromEntries(fd.entries());
              updateMutation.mutate({
                id: editingWork.id,
                ...data,
                copyrightYear: data.copyrightYear ? parseInt(data.copyrightYear as string) : undefined,
              });
            }} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-trackTitle">Track Title</Label>
                  <Input id="edit-trackTitle" name="trackTitle" defaultValue={editingWork.trackTitle} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-copyrightYear">Copyright Year</Label>
                  <Input id="edit-copyrightYear" name="copyrightYear" type="number" defaultValue={editingWork.copyrightYear} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-iswc">ISWC</Label>
                  <Input id="edit-iswc" name="iswc" defaultValue={editingWork.iswc} placeholder="T-123.456.789-C" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-isrc">ISRC</Label>
                  <Input id="edit-isrc" name="isrc" defaultValue={editingWork.isrc} placeholder="US-ABC-12-34567" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-proName">PRO</Label>
                  <Input id="edit-proName" name="proName" defaultValue={editingWork.proName} placeholder="ASCAP, BMI, SESAC" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-proRegistrationId">PRO Work ID</Label>
                  <Input id="edit-proRegistrationId" name="proRegistrationId" defaultValue={editingWork.proRegistrationId} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-writerSplit">Writer Split %</Label>
                  <Input id="edit-writerSplit" name="writerSplit" type="number" defaultValue={editingWork.writerSplit} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-publishingSplit">Publisher Split %</Label>
                  <Input id="edit-publishingSplit" name="publishingSplit" type="number" defaultValue={editingWork.publishingSplit} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-publisherName">Publisher Name</Label>
                <Input id="edit-publisherName" name="publisherName" defaultValue={editingWork.publisherName} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingWork(null)}>Cancel</Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!pendingDeleteId} onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Registered Work</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this work registration? This action cannot be undone.
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
              Delete Work
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
