import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from '@/components/ui/dialog';
import { 
  Sheet, 
  SheetContent, 
  SheetDescription, 
  SheetHeader, 
  SheetTitle,
} from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { 
  Users, 
  Search, 
  UserPlus, 
  Mail, 
  Download, 
  Filter, 
  MoreHorizontal, 
  Star, 
  TrendingUp, 
  MailQuestion,
  Plus,
  Trash2,
  Tag as TagIcon,
  Share2,
  Upload,
  Music
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { format } from 'date-fns';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
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

// Types from schema or equivalent
interface FanSubscriber {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  source: string;
  tags: string[] | null;
  totalSpent: number;
  isVip: boolean;
  joinedAt: string;
  notes: string | null;
}

interface FanMessage {
  id: string;
  subject: string;
  body: string;
  sentAt: string;
  recipientCount: number;
  openCount: number;
  clickCount: number;
}

interface FanHubStats {
  totalFans: number;
  vipCount: number;
  growthRate: number;
  emailOpenRate: number;
  avgSpend: number;
}

export default function FanHub() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFan, setSelectedFan] = useState<FanSubscriber | null>(null);
  const [isAddingFan, setIsAddingFan] = useState(false);
  const [isComposingMessage, setIsComposingMessage] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [pendingDeleteFanId, setPendingDeleteFanId] = useState<string | null>(null);
  const [isTaggingFan, setIsTaggingFan] = useState<FanSubscriber | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isEditingFan, setIsEditingFan] = useState<FanSubscriber | null>(null);
  const [editForm, setEditForm] = useState({ name: '', phone: '', notes: '', isVip: false });

  // Queries
  const { data: subscribersData, isLoading: loadingSubscribers } = useQuery<{ subscribers: FanSubscriber[] }>({
    queryKey: ['/api/fan-hub/subscribers', { search: searchTerm }],
  });

  const { data: stats, isLoading: loadingStats } = useQuery<FanHubStats>({
    queryKey: ['/api/fan-hub/stats'],
  });

  const { data: messages, isLoading: loadingMessages } = useQuery<FanMessage[]>({
    queryKey: ['/api/fan-hub/messages'],
  });

  // Mutations
  const addFanMutation = useMutation({
    mutationFn: async (newFan: Partial<FanSubscriber>) => {
      const res = await apiRequest('POST', '/api/fan-hub/subscribers', newFan);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/fan-hub/subscribers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/fan-hub/stats'] });
      setIsAddingFan(false);
      toast({ title: 'Success', description: 'Fan subscriber added successfully.' });
    },
  });

  const deleteFanMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/fan-hub/subscribers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/fan-hub/subscribers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/fan-hub/stats'] });
      setSelectedFan(null);
      toast({ title: 'Success', description: 'Fan subscriber removed.' });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (message: { subject: string; body: string }) => {
      const res = await apiRequest('POST', '/api/fan-hub/message', message);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/fan-hub/messages'] });
      setIsComposingMessage(false);
      toast({ title: 'Success', description: 'Bulk message sent to your fans!' });
    },
  });

  const addTagMutation = useMutation({
    mutationFn: async ({ id, tags }: { id: string; tags: string[] }) => {
      const res = await apiRequest('PUT', `/api/fan-hub/subscribers/${id}/tag`, { tags });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/fan-hub/subscribers'] });
      setIsTaggingFan(null);
      setTagInput('');
      toast({ title: 'Tags updated' });
    },
  });

  const updateFanMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<FanSubscriber> }) => {
      const res = await apiRequest('PUT', `/api/fan-hub/subscribers/${id}`, data);
      return res.json();
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['/api/fan-hub/subscribers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/fan-hub/stats'] });
      setIsEditingFan(null);
      if (selectedFan) setSelectedFan({ ...selectedFan, ...updated });
      toast({ title: 'Fan profile updated' });
    },
  });

  const handleExport = () => {
    const headers = ['Name', 'Email', 'Phone', 'VIP', 'Source', 'Joined', 'Total Spent', 'Tags', 'Notes'];
    const rows = subscribers.map(fan => [
      fan.name || '',
      fan.email,
      fan.phone || '',
      fan.isVip ? 'Yes' : 'No',
      fan.source || '',
      format(new Date(fan.joinedAt), 'yyyy-MM-dd'),
      fan.totalSpent.toFixed(2),
      (fan.tags || []).join('|'),
      (fan.notes || '').replace(/"/g, '""'),
    ].map(v => `"${v}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fans-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: 'Export complete', description: `${subscribers.length} fans exported to CSV.` });
  };

  const handleImportCSV = async () => {
    if (!importFile) return;
    setIsImporting(true);
    try {
      const text = await importFile.text();
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) {
        toast({ title: 'Empty file', description: 'CSV must have at least a header row and one data row.', variant: 'destructive' });
        return;
      }
      const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());
      const emailIdx = headers.findIndex(h => h === 'email');
      const nameIdx = headers.findIndex(h => h === 'name');
      const phoneIdx = headers.findIndex(h => h === 'phone');
      const tagsIdx = headers.findIndex(h => h === 'tags');
      if (emailIdx === -1) {
        toast({ title: 'Missing email column', description: 'Your CSV must have an "email" column.', variant: 'destructive' });
        return;
      }
      const fans = lines.slice(1).map(line => {
        const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim());
        return {
          email: cols[emailIdx] || '',
          name: nameIdx >= 0 ? cols[nameIdx] : undefined,
          phone: phoneIdx >= 0 ? cols[phoneIdx] : undefined,
          tags: tagsIdx >= 0 && cols[tagsIdx] ? cols[tagsIdx].split('|').map(t => t.trim()).filter(Boolean) : undefined,
        };
      }).filter(f => f.email && f.email.includes('@'));

      const res = await apiRequest('POST', '/api/fan-hub/subscribers/import', { subscribers: fans });
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: ['/api/fan-hub/subscribers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/fan-hub/stats'] });
      setImportFile(null);
      toast({ title: 'Import complete!', description: `${result.imported || fans.length} fans imported successfully.` });
    } catch {
      toast({ title: 'Import failed', description: 'Could not parse CSV. Please check the file format.', variant: 'destructive' });
    } finally {
      setIsImporting(false);
    }
  };

  const subscribers = subscribersData?.subscribers || [];
  const vipFans = subscribers.filter(f => f.isVip);

  const handleAddFan = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      email: formData.get('email') as string,
      phone: formData.get('phone') as string,
      isVip: formData.get('isVip') === 'on',
      notes: formData.get('notes') as string,
      tags: (formData.get('tags') as string).split(',').map(t => t.trim()).filter(Boolean),
    };
    addFanMutation.mutate(data);
  };

  const handleSendMessage = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    sendMessageMutation.mutate({
      subject: formData.get('subject') as string,
      body: formData.get('body') as string,
    });
  };

  return (
    <AppLayout title="Fan Hub">
      <div className="space-y-6">
        {/* Stats Header */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Fans</CardTitle>
              <Users className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalFans || 0}</div>
              <p className="text-xs text-muted-foreground">
                <span className="text-emerald-500 flex items-center gap-1 font-medium">
                  <TrendingUp className="h-3 w-3" />
                  {stats?.growthRate || 0}%
                </span>{' '}
                from last month
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">VIP Fans</CardTitle>
              <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.vipCount || 0}</div>
              <p className="text-xs text-muted-foreground">
                {stats?.totalFans ? Math.round((stats.vipCount / stats.totalFans) * 100) : 0}% of your fan base
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Avg. Spend</CardTitle>
              <div className="text-emerald-500 font-bold">$</div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${stats?.avgSpend?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
              </div>
              <p className="text-xs text-muted-foreground">Across all subscribers</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Email Open Rate</CardTitle>
              <MailQuestion className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.emailOpenRate || 0}%</div>
              <p className="text-xs text-muted-foreground">Industry avg: 21.3%</p>
            </CardContent>
          </Card>
        </div>

        {/* Action Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-4 rounded-lg border shadow-sm">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={handleExport} disabled={subscribers.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            <Dialog open={isAddingFan} onOpenChange={setIsAddingFan}>
              <DialogTrigger asChild>
                <Button className="flex-1 sm:flex-none">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add Fan
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Fan</DialogTitle>
                  <DialogDescription>
                    Manually add a fan to your subscriber database.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddFan} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Full Name</Label>
                      <Input id="name" name="name" placeholder="John Doe" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <Input id="email" name="email" type="email" placeholder="john@example.com" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number (Optional)</Label>
                    <Input id="phone" name="phone" placeholder="+1 (555) 000-0000" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tags">Tags (comma separated)</Label>
                    <Input id="tags" name="tags" placeholder="tour, merch-buyer, early-adopter" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea id="notes" name="notes" placeholder="Any additional info about this fan..." />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="isVip" name="isVip" />
                    <Label htmlFor="isVip">Mark as VIP</Label>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsAddingFan(false)}>Cancel</Button>
                    <Button type="submit" disabled={addFanMutation.isPending}>
                      {addFanMutation.isPending ? 'Adding...' : 'Add Fan'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
            <Dialog open={isComposingMessage} onOpenChange={setIsComposingMessage}>
              <DialogTrigger asChild>
                <Button variant="secondary" className="flex-1 sm:flex-none">
                  <Mail className="h-4 w-4 mr-2" />
                  Broadcast
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Send Broadcast Email</DialogTitle>
                  <DialogDescription>
                    Send a bulk message to all your {subscribers.length} fans.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSendMessage} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="subject">Subject</Label>
                    <Input id="subject" name="subject" placeholder="New release out now!" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="body">Message Body</Label>
                    <Textarea id="body" name="body" rows={10} placeholder="Write your message here..." required />
                  </div>
                  <div className="flex justify-between items-center bg-muted p-3 rounded-md">
                    <span className="text-sm text-muted-foreground italic">
                      Recipient count: {subscribers.length} fans
                    </span>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" onClick={() => setIsComposingMessage(false)}>Cancel</Button>
                      <Button type="submit" disabled={sendMessageMutation.isPending}>
                        {sendMessageMutation.isPending ? 'Sending...' : 'Send Message'}
                      </Button>
                    </div>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="all" onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 max-w-md">
            <TabsTrigger value="all">All Fans</TabsTrigger>
            <TabsTrigger value="vip">VIPs</TabsTrigger>
            <TabsTrigger value="messages">History</TabsTrigger>
            <TabsTrigger value="import">Import</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="pt-4">
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Total Spent</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingSubscribers ? (
                    Array(5).fill(0).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={5} className="h-12 animate-pulse bg-muted/50" />
                      </TableRow>
                    ))
                  ) : subscribers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5}>
                        {searchTerm ? (
                          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                            <Users className="h-10 w-10 mb-3 opacity-20" />
                            <p className="mb-2">No fans match "{searchTerm}"</p>
                            <Button variant="link" onClick={() => setSearchTerm('')}>Clear search</Button>
                          </div>
                        ) : (
                          <div className="py-12 px-6">
                            <div className="max-w-xl mx-auto text-center mb-8">
                              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                                <Users className="h-8 w-8 text-primary opacity-60" />
                              </div>
                              <h3 className="text-lg font-semibold mb-2">Build Your Fan Base</h3>
                              <p className="text-muted-foreground text-sm">You don't have any fans yet. Here are some ways to grow your community:</p>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
                              <div className="rounded-lg border bg-card p-4 text-center">
                                <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto mb-3">
                                  <Music className="h-5 w-5 text-blue-500" />
                                </div>
                                <p className="font-medium text-sm mb-1">Release Music</p>
                                <p className="text-xs text-muted-foreground">Distribute on all platforms to reach new listeners and convert them into fans.</p>
                              </div>
                              <div className="rounded-lg border bg-card p-4 text-center">
                                <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center mx-auto mb-3">
                                  <Share2 className="h-5 w-5 text-purple-500" />
                                </div>
                                <p className="font-medium text-sm mb-1">Share Your EPK</p>
                                <p className="text-xs text-muted-foreground">Send your press kit link to blogs, playlists, and venues to build awareness.</p>
                              </div>
                              <div className="rounded-lg border bg-card p-4 text-center">
                                <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
                                  <Upload className="h-5 w-5 text-green-500" />
                                </div>
                                <p className="font-medium text-sm mb-1">Import Existing Fans</p>
                                <p className="text-xs text-muted-foreground">Already have fans elsewhere? Import them via CSV from the Import tab above.</p>
                              </div>
                            </div>
                            <div className="flex justify-center mt-6 gap-3">
                              <Button onClick={() => setIsAddingFan(true)}>
                                <UserPlus className="h-4 w-4 mr-2" />
                                Add Your First Fan
                              </Button>
                            </div>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ) : (
                    subscribers.map((fan) => (
                      <TableRow key={fan.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedFan(fan)}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                              {fan.name?.charAt(0) || fan.email.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-medium flex items-center gap-2">
                                {fan.name || 'Anonymous'}
                                {fan.isVip && <Star className="h-3 w-3 text-amber-500 fill-amber-500" />}
                              </div>
                              <div className="text-xs text-muted-foreground">{fan.email}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">{fan.source}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {format(new Date(fan.joinedAt), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell className="font-medium">
                          ${fan.totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setSelectedFan(fan)}>View Profile</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setIsTaggingFan(fan); setTagInput((fan.tags || []).join(', ')); }}>
                                <TagIcon className="h-4 w-4 mr-2" />
                                Edit Tags
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => setPendingDeleteFanId(fan.id)}>Remove Fan</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="vip" className="pt-4">
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Total Spent</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vipFans.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-64 text-center">
                        <div className="flex flex-col items-center justify-center text-muted-foreground">
                          <Star className="h-12 w-12 mb-4 opacity-20" />
                          <p>You haven't marked any fans as VIP yet.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    vipFans.map((fan) => (
                      <TableRow key={fan.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedFan(fan)}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-600 font-bold text-xs">
                              {fan.name?.charAt(0) || fan.email.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-medium flex items-center gap-2">
                                {fan.name || 'Anonymous'}
                                <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                              </div>
                              <div className="text-xs text-muted-foreground">{fan.email}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize border-amber-500/50 text-amber-600">VIP</Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {format(new Date(fan.joinedAt), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell className="font-medium">
                          ${fan.totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="messages" className="pt-4">
            <div className="grid gap-4">
              {messages?.length === 0 ? (
                <Card className="p-12 text-center">
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <Mail className="h-12 w-12 mb-4 opacity-20" />
                    <h3 className="text-lg font-medium text-foreground">No message history</h3>
                    <p className="max-w-sm mx-auto mt-1 mb-6">
                      Start engaging with your fans by sending your first broadcast message.
                    </p>
                    <Button onClick={() => setIsComposingMessage(true)}>
                      <Mail className="h-4 w-4 mr-2" />
                      Send First Message
                    </Button>
                  </div>
                </Card>
              ) : (
                messages?.map((msg) => (
                  <Card key={msg.id} className="overflow-hidden">
                    <div className="bg-muted/30 p-4 border-b flex justify-between items-center">
                      <div>
                        <h4 className="font-semibold text-lg">{msg.subject}</h4>
                        <p className="text-xs text-muted-foreground">
                          Sent on {format(new Date(msg.sentAt), 'MMMM d, yyyy @ h:mm a')}
                        </p>
                      </div>
                      <Badge variant="secondary">Sent</Badge>
                    </div>
                    <CardContent className="p-6">
                      <div className="grid grid-cols-3 gap-8 mb-6">
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Recipients</p>
                          <p className="text-2xl font-bold">{msg.recipientCount}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Open Rate</p>
                          <p className="text-2xl font-bold">
                            {msg.recipientCount > 0 ? Math.round((msg.openCount / msg.recipientCount) * 100) : 0}%
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Click Rate</p>
                          <p className="text-2xl font-bold">
                            {msg.openCount > 0 ? Math.round((msg.clickCount / msg.openCount) * 100) : 0}%
                          </p>
                        </div>
                      </div>
                      <div className="bg-muted/20 p-4 rounded-md text-sm whitespace-pre-wrap border italic text-muted-foreground">
                        {msg.body.length > 200 ? msg.body.substring(0, 200) + '...' : msg.body}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="import" className="pt-4">
            <Card className="p-10 max-w-2xl mx-auto">
              <div className="flex flex-col items-center text-center">
                <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                  <Plus className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-bold mb-2">Import Your Fan Base</h3>
                <p className="text-muted-foreground mb-8">
                  Already have a list of fans from Mailchimp, Bandcamp, or your website? 
                  Upload a CSV file to import them all at once.
                </p>
                <div className="w-full max-w-sm space-y-4">
                  <div className={`relative border-2 border-dashed rounded-xl p-8 transition-colors ${importFile ? 'border-primary/50 bg-primary/5' : 'border-muted-foreground/20 hover:border-primary/30'}`}>
                    <input
                      type="file"
                      accept=".csv"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    />
                    {importFile ? (
                      <div className="text-center">
                        <p className="font-medium text-primary">{importFile.name}</p>
                        <p className="text-xs text-muted-foreground mt-1">{(importFile.size / 1024).toFixed(1)} KB</p>
                      </div>
                    ) : (
                      <div className="text-center">
                        <Download className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                        <p className="text-sm font-medium">Click or drag to select CSV</p>
                        <p className="text-xs text-muted-foreground mt-1">Max 1,000 fans per import</p>
                      </div>
                    )}
                  </div>
                  <Button 
                    className="w-full" 
                    onClick={handleImportCSV}
                    disabled={!importFile || isImporting}
                  >
                    {isImporting ? 'Importing...' : `Import${importFile ? ' Fans' : ' CSV'}`}
                  </Button>
                  {importFile && (
                    <Button variant="ghost" size="sm" className="w-full" onClick={() => setImportFile(null)}>
                      Clear selection
                    </Button>
                  )}
                </div>
                <div className="mt-10 pt-8 border-t w-full text-left">
                  <h4 className="font-semibold mb-4 flex items-center gap-2">
                    <Filter className="h-4 w-4" />
                    CSV Format Requirements
                  </h4>
                  <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
                    <li>Must include an <code className="bg-muted px-1 rounded">email</code> column (required)</li>
                    <li>Optional: <code className="bg-muted px-1 rounded">name</code>, <code className="bg-muted px-1 rounded">phone</code>, <code className="bg-muted px-1 rounded">tags</code></li>
                    <li>Multiple tags: pipe-separated inside the tags column (e.g. <code className="bg-muted px-1 rounded">tour|vip|merch</code>)</li>
                    <li>First row must be the header row</li>
                  </ul>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Fan Profile Drawer */}
        <Sheet open={!!selectedFan} onOpenChange={(open) => !open && setSelectedFan(null)}>
          <SheetContent className="sm:max-w-md overflow-y-auto">
            {selectedFan && (
              <>
                <SheetHeader className="pb-6 border-b">
                  <div className="flex justify-between items-start">
                    <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-2xl mb-4">
                      {selectedFan.name?.charAt(0) || selectedFan.email.charAt(0).toUpperCase()}
                    </div>
                    <Badge variant={selectedFan.isVip ? 'default' : 'outline'} className={selectedFan.isVip ? 'bg-amber-500 hover:bg-amber-600' : ''}>
                      {selectedFan.isVip ? 'VIP Fan' : 'Standard'}
                    </Badge>
                  </div>
                  <SheetTitle className="text-2xl">{selectedFan.name || 'Anonymous Fan'}</SheetTitle>
                  <SheetDescription>{selectedFan.email}</SheetDescription>
                </SheetHeader>

                <div className="py-6 space-y-8">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Joined</p>
                      <p className="font-medium">{format(new Date(selectedFan.joinedAt), 'MMM d, yyyy')}</p>
                    </div>
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Total Spent</p>
                      <p className="font-medium">${selectedFan.totalSpent.toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-semibold flex items-center gap-2">
                      <TagIcon className="h-4 w-4" />
                      Tags
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedFan.tags && selectedFan.tags.length > 0 ? (
                        selectedFan.tags.map(tag => (
                          <Badge key={tag} variant="secondary">{tag}</Badge>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No tags assigned.</p>
                      )}
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-6 w-6 rounded-full"
                        onClick={() => { setIsTaggingFan(selectedFan); setTagInput((selectedFan?.tags || []).join(', ')); }}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-semibold">Fan Notes</h4>
                    <div className="p-4 bg-muted/30 rounded-lg text-sm border italic text-muted-foreground">
                      {selectedFan.notes || "No notes available for this fan."}
                    </div>
                  </div>

                  <div className="pt-8 border-t space-y-3">
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        setIsEditingFan(selectedFan);
                        setEditForm({ name: selectedFan.name || '', phone: selectedFan.phone || '', notes: selectedFan.notes || '', isVip: selectedFan.isVip });
                      }}
                    >
                      Edit Profile
                    </Button>
                    <Button
                      variant={selectedFan.isVip ? 'secondary' : 'outline'}
                      className={`w-full ${selectedFan.isVip ? 'border-amber-500/50 text-amber-600' : ''}`}
                      onClick={() => updateFanMutation.mutate({ id: selectedFan.id, data: { isVip: !selectedFan.isVip } })}
                      disabled={updateFanMutation.isPending}
                    >
                      <Star className={`h-4 w-4 mr-2 ${selectedFan.isVip ? 'fill-amber-500 text-amber-500' : ''}`} />
                      {selectedFan.isVip ? 'Remove VIP Status' : 'Mark as VIP'}
                    </Button>
                    <Button 
                      variant="destructive" 
                      className="w-full"
                      onClick={() => setPendingDeleteFanId(selectedFan.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Fan
                    </Button>
                  </div>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>

        {/* Edit Fan Profile Dialog */}
        <Dialog open={!!isEditingFan} onOpenChange={(open) => !open && setIsEditingFan(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Edit Fan Profile</DialogTitle>
              <DialogDescription>{isEditingFan?.email}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label htmlFor="edit-name">Full Name</Label>
                <Input id="edit-name" value={editForm.name} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))} placeholder="John Doe" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-phone">Phone</Label>
                <Input id="edit-phone" value={editForm.phone} onChange={(e) => setEditForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 (555) 000-0000" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-notes">Notes</Label>
                <Textarea id="edit-notes" rows={3} value={editForm.notes} onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes about this fan..." />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Checkbox id="edit-vip" checked={editForm.isVip} onCheckedChange={(c) => setEditForm(f => ({ ...f, isVip: !!c }))} />
                <Label htmlFor="edit-vip">VIP Fan</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditingFan(null)}>Cancel</Button>
              <Button
                onClick={() => {
                  if (!isEditingFan) return;
                  updateFanMutation.mutate({ id: isEditingFan.id, data: editForm });
                }}
                disabled={updateFanMutation.isPending}
              >
                {updateFanMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Tags Dialog */}
        <Dialog open={!!isTaggingFan} onOpenChange={(open) => !open && setIsTaggingFan(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Edit Tags</DialogTitle>
              <DialogDescription>
                Add or remove tags for {isTaggingFan?.name || isTaggingFan?.email}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <Label htmlFor="tags-input">Tags (comma-separated)</Label>
              <Input
                id="tags-input"
                placeholder="tour, vip, merch-buyer, newsletter"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Current: {isTaggingFan?.tags?.join(', ') || 'none'}</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsTaggingFan(null)}>Cancel</Button>
              <Button
                onClick={() => {
                  if (!isTaggingFan) return;
                  const tags = tagInput.split(',').map(t => t.trim()).filter(Boolean);
                  addTagMutation.mutate({ id: isTaggingFan.id, tags });
                }}
                disabled={addTagMutation.isPending}
              >
                <TagIcon className="h-4 w-4 mr-2" />
                {addTagMutation.isPending ? 'Saving...' : 'Save Tags'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!pendingDeleteFanId} onOpenChange={(open) => !open && setPendingDeleteFanId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Fan</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove this fan from your list? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (pendingDeleteFanId) {
                    deleteFanMutation.mutate(pendingDeleteFanId);
                    setPendingDeleteFanId(null);
                    if (selectedFan?.id === pendingDeleteFanId) setSelectedFan(null);
                  }
                }}
              >
                Remove Fan
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
