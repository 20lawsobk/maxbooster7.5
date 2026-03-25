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
import { Copyright, Plus, FileText, CheckCircle, Clock, PieChart } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useRequireSubscription } from '@/hooks/useRequireAuth';
import { Cell, Pie, PieChart as RechartsPieChart, ResponsiveContainer, Tooltip } from 'recharts';

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
      toast({ title: 'Success', description: 'Work registered successfully' });
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

  const splitData = [
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
              <div className="py-8 text-center text-muted-foreground">
                No registered works yet. Register your first work to start tracking royalties!
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {works.map((work) => (
                    <TableRow key={work.id}>
                      <TableCell className="font-medium">{work.trackTitle}</TableCell>
                      <TableCell>
                        <div className="text-xs">ISWC: {work.iswc || 'N/A'}</div>
                        <div className="text-xs text-muted-foreground">ISRC: {work.isrc || 'N/A'}</div>
                      </TableCell>
                      <TableCell>{work.proName || 'N/A'}</TableCell>
                      <TableCell>
                        {work.writerSplit}% / {work.publishingSplit}%
                      </TableCell>
                      <TableCell>
                        <Badge variant={work.status === 'confirmed' ? 'default' : 'secondary'}>
                          {work.status}
                        </Badge>
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
    </AppLayout>
  );
}
