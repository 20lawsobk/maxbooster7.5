import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRequireAdmin } from '@/hooks/useRequireAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Users,
  DollarSign,
  Music,
  TrendingUp,
  Search,
  Filter,
  Download,
  UserCheck,
  UserX,
  Crown,
  Calendar,
  Mail,
  Edit,
  Trash2,
  Eye,
  Ban,
  Shield,
  CreditCard,
  Activity,
  Server,
  Database,
  Cpu,
  HardDrive,
  Wifi,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Power,
  PowerOff,
  Flag,
  MessageSquare,
  AlertCircle,
  RefreshCw,
  Clock,
  Zap,
  BarChart3,
  Settings,
  UserCog,
  FileWarning,
  Globe,
  LayoutDashboard,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useLocation } from 'wouter';

interface AdminUser {
  id: string;
  username: string;
  email: string;
  role: string;
  subscriptionTier: string | null;
  subscriptionStatus: string | null;
  createdAt: string;
  isSuspended?: boolean;
}

interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface UsersResponse {
  users: AdminUser[];
  pagination: Pagination;
}

interface ModerationReport {
  id: string;
  contentType: string;
  contentId: string;
  contentTitle: string;
  reportedBy: string;
  reportedByUsername: string;
  reason: string;
  description: string;
  status: string;
  createdAt: string;
  targetUserId: string;
  targetUsername: string;
  reviewedBy?: string;
  reviewedAt?: string;
  resolution?: string;
}

interface SystemHealth {
  server: {
    uptime: number;
    uptimeFormatted: string;
    memory: {
      heapUsed: number;
      heapTotal: number;
      rss: number;
      percentUsed: number;
    };
    cpu: number;
    disk: number;
  };
  database: {
    status: string;
    latency: number | null;
    connectionPool: {
      active: number;
      idle: number;
      max: number;
    };
  };
  externalApis: Record<string, { status: string; latency: number }>;
  killSwitch: {
    globalKilled: boolean;
    systemStates: Record<string, boolean>;
    lastAction: string | null;
  };
  errorTracking: {
    last24h: number;
    last7d: number;
    errorRate: string;
  };
}

interface AdminAnalytics {
  totalUsers: number;
  totalProjects: number;
  totalRevenue: number;
  totalStreams: number;
  recentSignups: number;
  revenueGrowth: number;
  projectsGrowth: number;
  userGrowthRate: number;
  subscriptionStats: { plan: string; count: number }[];
  featureUsage: { feature: string; usage: number; percentage: number }[];
  newUsers: number;
}

const ADMIN_NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'users', label: 'User Management', icon: Users },
  { id: 'moderation', label: 'Content Moderation', icon: Flag },
  { id: 'system', label: 'System Health', icon: Server },
  { id: 'analytics', label: 'Platform Analytics', icon: BarChart3 },
  { id: 'killswitch', label: 'Kill Switch', icon: Power },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function Admin() {
  const { user, isLoading: authLoading } = useRequireAdmin();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [moderationFilter, setModerationFilter] = useState('pending');
  const [showEditUserDialog, setShowEditUserDialog] = useState(false);
  const [showDeleteUserDialog, setShowDeleteUserDialog] = useState(false);
  const [showModerationDialog, setShowModerationDialog] = useState(false);
  const [showKillSwitchDialog, setShowKillSwitchDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [selectedReport, setSelectedReport] = useState<ModerationReport | null>(null);
  const [editUserRole, setEditUserRole] = useState('user');
  const [editUserPlan, setEditUserPlan] = useState('free');
  const [editUserStatus, setEditUserStatus] = useState('active');
  const [moderationAction, setModerationAction] = useState('');
  const [moderationNotes, setModerationNotes] = useState('');
  const [killSwitchReason, setKillSwitchReason] = useState('');
  const [killSwitchTarget, setKillSwitchTarget] = useState<'all' | string>('all');

  const { data: usersData, isLoading: usersLoading, refetch: refetchUsers } = useQuery<UsersResponse>({
    queryKey: ['/api/admin/users', { search: searchTerm, status: statusFilter, plan: planFilter }],
    enabled: !!user,
  });

  const { data: adminAnalytics, isLoading: analyticsLoading } = useQuery<AdminAnalytics>({
    queryKey: ['/api/admin/analytics'],
    enabled: !!user,
  });

  const { data: systemHealth, isLoading: healthLoading, refetch: refetchHealth } = useQuery<SystemHealth>({
    queryKey: ['/api/admin/system-health'],
    enabled: !!user,
    refetchInterval: 30000,
  });

  const { data: moderationReports, isLoading: moderationLoading, refetch: refetchModeration } = useQuery({
    queryKey: ['/api/admin/moderation/reports', { status: moderationFilter }],
    enabled: !!user,
  });

  const { data: platformSettings } = useQuery({
    queryKey: ['/api/admin/settings'],
    enabled: !!user,
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, role, subscriptionTier, subscriptionStatus }: { userId: string; role?: string; subscriptionTier?: string; subscriptionStatus?: string }) => {
      const response = await apiRequest('PUT', `/api/admin/users/${userId}`, { role, subscriptionTier, subscriptionStatus });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      setShowEditUserDialog(false);
      setSelectedUser(null);
      toast({ title: 'User Updated', description: 'User details have been updated successfully.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Update Failed', description: error.message, variant: 'destructive' });
    },
  });

  const suspendUserMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason?: string }) => {
      const response = await apiRequest('POST', `/api/admin/users/${userId}/suspend`, { reason });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({ title: 'User Suspended', description: 'User has been suspended successfully.' });
    },
  });

  const reactivateUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest('POST', `/api/admin/users/${userId}/reactivate`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({ title: 'User Reactivated', description: 'User has been reactivated successfully.' });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest('DELETE', `/api/admin/users/${userId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      setShowDeleteUserDialog(false);
      setSelectedUser(null);
      toast({ title: 'User Deleted', description: 'User has been deleted from the platform.' });
    },
  });

  const reviewReportMutation = useMutation({
    mutationFn: async ({ reportId, action, notes }: { reportId: string; action: string; notes: string }) => {
      const response = await apiRequest('POST', `/api/admin/moderation/reports/${reportId}/review`, { action, notes });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/moderation/reports'] });
      setShowModerationDialog(false);
      setSelectedReport(null);
      setModerationAction('');
      setModerationNotes('');
      toast({ title: 'Report Reviewed', description: 'The moderation report has been processed.' });
    },
  });

  const killAllMutation = useMutation({
    mutationFn: async (reason: string) => {
      const response = await apiRequest('POST', '/api/kill-switch/kill-all', { reason });
      return response.json();
    },
    onSuccess: () => {
      refetchHealth();
      setShowKillSwitchDialog(false);
      setKillSwitchReason('');
      toast({ title: 'Emergency Stop Activated', description: 'All autonomous systems have been stopped.', variant: 'destructive' });
    },
  });

  const resumeAllMutation = useMutation({
    mutationFn: async (reason: string) => {
      const response = await apiRequest('POST', '/api/kill-switch/resume-all', { reason });
      return response.json();
    },
    onSuccess: () => {
      refetchHealth();
      toast({ title: 'Systems Resumed', description: 'All autonomous systems have been resumed.' });
    },
  });

  const exportUsersMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('GET', '/api/admin/users/export');
      return response.json();
    },
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `users-export-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: 'Export Successful', description: 'User data has been exported.' });
    },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return null;

  const users = usersData?.users || [];
  const reports = moderationReports?.reports || [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'inactive': return 'bg-gray-100 text-gray-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      case 'suspended': case 'banned': return 'bg-red-200 text-red-900';
      case 'past_due': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getApiStatusColor = (status: string) => {
    switch (status) {
      case 'operational': return 'text-green-600';
      case 'degraded': return 'text-yellow-600';
      case 'down': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getApiStatusIcon = (status: string) => {
    switch (status) {
      case 'operational': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'degraded': return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case 'down': return <XCircle className="h-4 w-4 text-red-600" />;
      default: return <AlertCircle className="h-4 w-4 text-gray-600" />;
    }
  };

  const renderSidebar = () => (
    <div className="w-64 bg-gray-900 text-white min-h-screen p-4 flex-shrink-0">
      <div className="mb-8">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Shield className="h-6 w-6 text-blue-400" />
          Admin Panel
        </h2>
        <p className="text-gray-400 text-sm mt-1">Max Booster Control Center</p>
      </div>
      <nav className="space-y-1">
        {ADMIN_NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveSection(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
              activeSection === item.id
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-800 hover:text-white'
            }`}
          >
            <item.icon className="h-5 w-5" />
            <span className="text-sm font-medium">{item.label}</span>
          </button>
        ))}
      </nav>
      {systemHealth?.killSwitch?.globalKilled && (
        <div className="mt-8 p-3 bg-red-900/50 border border-red-700 rounded-lg">
          <div className="flex items-center gap-2 text-red-400">
            <PowerOff className="h-4 w-4" />
            <span className="text-sm font-medium">Kill Switch Active</span>
          </div>
          <p className="text-xs text-red-300 mt-1">All systems are paused</p>
        </div>
      )}
    </div>
  );

  const renderOverview = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm">Total Users</p>
                <p className="text-3xl font-bold">{adminAnalytics?.totalUsers?.toLocaleString() || '0'}</p>
                <p className="text-blue-200 text-sm">+{adminAnalytics?.recentSignups || 0} this month</p>
              </div>
              <Users className="h-12 w-12 text-blue-200" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-sm">Total Revenue</p>
                <p className="text-3xl font-bold">${adminAnalytics?.totalRevenue?.toLocaleString() || '0'}</p>
                <p className="text-green-200 text-sm">+{adminAnalytics?.revenueGrowth || 0}% growth</p>
              </div>
              <DollarSign className="h-12 w-12 text-green-200" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-sm">Total Projects</p>
                <p className="text-3xl font-bold">{adminAnalytics?.totalProjects?.toLocaleString() || '0'}</p>
                <p className="text-purple-200 text-sm">+{adminAnalytics?.projectsGrowth || 0}% growth</p>
              </div>
              <Music className="h-12 w-12 text-purple-200" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-orange-100 text-sm">System Uptime</p>
                <p className="text-3xl font-bold">{systemHealth?.server?.uptimeFormatted || 'N/A'}</p>
                <p className="text-orange-200 text-sm">99.9% availability</p>
              </div>
              <Activity className="h-12 w-12 text-orange-200" />
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Quick System Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {healthLoading ? (
              <Skeleton className="h-32" />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Database</span>
                  <Badge variant={systemHealth?.database?.status === 'connected' ? 'default' : 'destructive'}>
                    {systemHealth?.database?.status || 'Unknown'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">CPU Usage</span>
                  <span className="text-sm font-medium">{systemHealth?.server?.cpu || 0}%</span>
                </div>
                <Progress value={systemHealth?.server?.cpu || 0} className="h-2" />
                <div className="flex items-center justify-between">
                  <span className="text-sm">Memory Usage</span>
                  <span className="text-sm font-medium">{systemHealth?.server?.memory?.percentUsed || 0}%</span>
                </div>
                <Progress value={systemHealth?.server?.memory?.percentUsed || 0} className="h-2" />
                <div className="flex items-center justify-between">
                  <span className="text-sm">Error Rate (24h)</span>
                  <Badge variant="outline">{systemHealth?.errorTracking?.errorRate || '0%'}</Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flag className="h-5 w-5" />
              Moderation Queue
            </CardTitle>
          </CardHeader>
          <CardContent>
            {moderationLoading ? (
              <Skeleton className="h-32" />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-600" />
                    <span className="font-medium">Pending Reports</span>
                  </div>
                  <Badge variant="outline" className="bg-yellow-100">
                    {moderationReports?.stats?.pending || 0}
                  </Badge>
                </div>
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Eye className="h-5 w-5 text-blue-600" />
                    <span className="font-medium">Reviewed Today</span>
                  </div>
                  <Badge variant="outline" className="bg-blue-100">
                    {moderationReports?.stats?.reviewed || 0}
                  </Badge>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setActiveSection('moderation')}
                >
                  View All Reports
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderUserManagement = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">User Management</h2>
          <p className="text-gray-500">Manage platform users and subscriptions</p>
        </div>
        <Button onClick={() => exportUsersMutation.mutate()} disabled={exportUsersMutation.isPending}>
          <Download className="h-4 w-4 mr-2" />
          Export Users
        </Button>
      </div>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="banned">Banned</SelectItem>
              </SelectContent>
            </Select>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Plans</SelectItem>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
                <SelectItem value="lifetime">Lifetime</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {usersLoading ? (
            <Skeleton className="h-64" />
          ) : (
            <ScrollArea className="h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{u.username || 'N/A'}</p>
                          <p className="text-sm text-gray-500">{u.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                          {u.role === 'admin' && <Crown className="h-3 w-3 mr-1" />}
                          {u.role || 'user'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{u.subscriptionTier || 'free'}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(u.subscriptionStatus || 'inactive')}>
                          {u.subscriptionStatus || 'inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedUser(u);
                              setEditUserRole(u.role || 'user');
                              setEditUserPlan(u.subscriptionTier || 'free');
                              setEditUserStatus(u.subscriptionStatus || 'active');
                              setShowEditUserDialog(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {u.subscriptionStatus === 'suspended' || u.isSuspended ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => reactivateUserMutation.mutate(u.id)}
                            >
                              <UserCheck className="h-4 w-4 text-green-600" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => suspendUserMutation.mutate({ userId: u.id })}
                            >
                              <Ban className="h-4 w-4 text-yellow-600" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedUser(u);
                              setShowDeleteUserDialog(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
          {usersData?.pagination && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-500">
                Showing {users.length} of {usersData.pagination.total} users
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={usersData.pagination.page <= 1}>
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={usersData.pagination.page >= usersData.pagination.totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const renderModeration = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Content Moderation</h2>
          <p className="text-gray-500">Review and manage reported content</p>
        </div>
        <div className="flex gap-2">
          <Select value={moderationFilter} onValueChange={setModerationFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Reports</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="reviewed">Reviewed</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => refetchModeration()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-yellow-800 font-medium">Pending</p>
              <p className="text-2xl font-bold text-yellow-900">{moderationReports?.stats?.pending || 0}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-yellow-600" />
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-blue-800 font-medium">Reviewed</p>
              <p className="text-2xl font-bold text-blue-900">{moderationReports?.stats?.reviewed || 0}</p>
            </div>
            <Eye className="h-8 w-8 text-blue-600" />
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-green-800 font-medium">Resolved</p>
              <p className="text-2xl font-bold text-green-900">{moderationReports?.stats?.resolved || 0}</p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-600" />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Reported Content Queue</CardTitle>
        </CardHeader>
        <CardContent>
          {moderationLoading ? (
            <Skeleton className="h-64" />
          ) : reports.length > 0 ? (
            <div className="space-y-4">
              {reports.map((report: ModerationReport) => (
                <div
                  key={report.id}
                  className="p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline">{report.contentType}</Badge>
                        <Badge variant={report.status === 'pending' ? 'destructive' : 'default'}>
                          {report.status}
                        </Badge>
                        <Badge variant="secondary">{report.reason.replace('_', ' ')}</Badge>
                      </div>
                      <h4 className="font-medium">{report.contentTitle}</h4>
                      <p className="text-sm text-gray-600 mt-1">{report.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                        <span>Reported by: {report.reportedByUsername}</span>
                        <span>Target: {report.targetUsername}</span>
                        <span>{new Date(report.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSelectedReport(report);
                        setShowModerationDialog(true);
                      }}
                    >
                      Review
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <p className="text-gray-600">No pending reports</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const renderSystemHealth = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">System Health</h2>
          <p className="text-gray-500">Monitor platform infrastructure and services</p>
        </div>
        <Button variant="outline" onClick={() => refetchHealth()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>
      {healthLoading ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <Cpu className="h-8 w-8 text-blue-600" />
                  <span className="text-2xl font-bold">{systemHealth?.server?.cpu || 0}%</span>
                </div>
                <p className="text-sm text-gray-500">CPU Usage</p>
                <Progress value={systemHealth?.server?.cpu || 0} className="mt-2" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <HardDrive className="h-8 w-8 text-green-600" />
                  <span className="text-2xl font-bold">{systemHealth?.server?.memory?.percentUsed || 0}%</span>
                </div>
                <p className="text-sm text-gray-500">Memory Usage</p>
                <Progress value={systemHealth?.server?.memory?.percentUsed || 0} className="mt-2" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <Database className="h-8 w-8 text-purple-600" />
                  <span className="text-2xl font-bold">{systemHealth?.server?.disk || 0}%</span>
                </div>
                <p className="text-sm text-gray-500">Disk Usage</p>
                <Progress value={systemHealth?.server?.disk || 0} className="mt-2" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <Clock className="h-8 w-8 text-orange-600" />
                  <span className="text-xl font-bold">{systemHealth?.server?.uptimeFormatted || 'N/A'}</span>
                </div>
                <p className="text-sm text-gray-500">Server Uptime</p>
              </CardContent>
            </Card>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Database Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span>Connection Status</span>
                    <Badge variant={systemHealth?.database?.status === 'connected' ? 'default' : 'destructive'}>
                      {systemHealth?.database?.status === 'connected' ? (
                        <><CheckCircle className="h-3 w-3 mr-1" /> Connected</>
                      ) : (
                        <><XCircle className="h-3 w-3 mr-1" /> Disconnected</>
                      )}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span>Query Latency</span>
                    <span className="font-medium">{systemHealth?.database?.latency || 0}ms</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span>Connection Pool</span>
                    <span className="font-medium">
                      {systemHealth?.database?.connectionPool?.active || 0} / {systemHealth?.database?.connectionPool?.max || 20}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  External API Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {systemHealth?.externalApis && Object.entries(systemHealth.externalApis).map(([api, data]) => (
                    <div key={api} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded">
                      <div className="flex items-center gap-2">
                        {getApiStatusIcon(data.status)}
                        <span className="capitalize">{api.replace('_', ' ')}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={getApiStatusColor(data.status)}>
                          {data.status}
                        </Badge>
                        <span className="text-sm text-gray-500">{data.latency}ms</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Error Tracking
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-red-50 rounded-lg">
                  <p className="text-red-800 text-sm">Last 24 Hours</p>
                  <p className="text-3xl font-bold text-red-900">{systemHealth?.errorTracking?.last24h || 0}</p>
                </div>
                <div className="p-4 bg-orange-50 rounded-lg">
                  <p className="text-orange-800 text-sm">Last 7 Days</p>
                  <p className="text-3xl font-bold text-orange-900">{systemHealth?.errorTracking?.last7d || 0}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-gray-800 text-sm">Error Rate</p>
                  <p className="text-3xl font-bold text-gray-900">{systemHealth?.errorTracking?.errorRate || '0%'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );

  const renderAnalytics = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Platform Analytics</h2>
        <p className="text-gray-500">Revenue, growth, and feature usage metrics</p>
      </div>
      {analyticsLoading ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-gray-500">Monthly Revenue</p>
                <p className="text-3xl font-bold">${adminAnalytics?.totalRevenue?.toLocaleString() || '0'}</p>
                <p className="text-sm text-green-600">+{adminAnalytics?.revenueGrowth || 0}% from last month</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-gray-500">New Users (30d)</p>
                <p className="text-3xl font-bold">{adminAnalytics?.newUsers || 0}</p>
                <p className="text-sm text-green-600">+{adminAnalytics?.userGrowthRate?.toFixed(1) || 0}% growth rate</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-gray-500">Total Streams</p>
                <p className="text-3xl font-bold">{adminAnalytics?.totalStreams?.toLocaleString() || '0'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-gray-500">Active Projects</p>
                <p className="text-3xl font-bold">{adminAnalytics?.totalProjects?.toLocaleString() || '0'}</p>
              </CardContent>
            </Card>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Subscription Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {adminAnalytics?.subscriptionStats?.map((stat) => (
                    <div key={stat.plan} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${
                          stat.plan === 'lifetime' ? 'bg-purple-500' :
                          stat.plan === 'yearly' ? 'bg-blue-500' :
                          stat.plan === 'monthly' ? 'bg-green-500' : 'bg-gray-400'
                        }`} />
                        <span className="capitalize">{stat.plan || 'free'}</span>
                      </div>
                      <span className="font-medium">{stat.count} users</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Feature Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {adminAnalytics?.featureUsage?.map((feature) => (
                    <div key={feature.feature}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm">{feature.feature}</span>
                        <span className="text-sm font-medium">{feature.percentage}%</span>
                      </div>
                      <Progress value={feature.percentage} className="h-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );

  const renderKillSwitch = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-red-600 flex items-center gap-2">
          <Power className="h-6 w-6" />
          Kill Switch Control
        </h2>
        <p className="text-gray-500">Emergency controls for autonomous systems</p>
      </div>
      <Card className={systemHealth?.killSwitch?.globalKilled ? 'border-red-500 bg-red-50' : ''}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Global Kill Switch</span>
            <Badge variant={systemHealth?.killSwitch?.globalKilled ? 'destructive' : 'default'}>
              {systemHealth?.killSwitch?.globalKilled ? 'ACTIVATED' : 'INACTIVE'}
            </Badge>
          </CardTitle>
          <CardDescription>
            Emergency stop for all autonomous systems. Use with caution.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {systemHealth?.killSwitch?.globalKilled ? (
              <div className="p-4 bg-red-100 border border-red-300 rounded-lg">
                <div className="flex items-center gap-2 text-red-800 mb-2">
                  <PowerOff className="h-5 w-5" />
                  <span className="font-medium">All Systems Stopped</span>
                </div>
                <p className="text-sm text-red-700">
                  All autonomous operations are currently paused.
                </p>
              </div>
            ) : (
              <div className="p-4 bg-green-100 border border-green-300 rounded-lg">
                <div className="flex items-center gap-2 text-green-800 mb-2">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Systems Operational</span>
                </div>
                <p className="text-sm text-green-700">
                  All autonomous systems are running normally.
                </p>
              </div>
            )}
            <div className="flex gap-4">
              {systemHealth?.killSwitch?.globalKilled ? (
                <Button
                  className="flex-1"
                  onClick={() => {
                    setKillSwitchTarget('all');
                    setShowKillSwitchDialog(true);
                  }}
                >
                  <Power className="h-4 w-4 mr-2" />
                  Resume All Systems
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => {
                    setKillSwitchTarget('all');
                    setShowKillSwitchDialog(true);
                  }}
                >
                  <PowerOff className="h-4 w-4 mr-2" />
                  Emergency Stop All
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Individual System Controls</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {systemHealth?.killSwitch?.systemStates && Object.entries(systemHealth.killSwitch.systemStates).map(([system, isKilled]) => (
              <div
                key={system}
                className={`p-4 border rounded-lg ${isKilled ? 'border-red-300 bg-red-50' : 'border-green-300 bg-green-50'}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isKilled ? (
                      <XCircle className="h-5 w-5 text-red-600" />
                    ) : (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    )}
                    <span className="font-medium capitalize">{system.replace('_', ' ')}</span>
                  </div>
                  <Badge variant={isKilled ? 'destructive' : 'default'}>
                    {isKilled ? 'Stopped' : 'Running'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderSettings = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Platform Settings</h2>
        <p className="text-gray-500">Configure global platform settings</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>General Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium">Maintenance Mode</p>
                <p className="text-sm text-gray-500">Disable access for non-admin users</p>
              </div>
              <Badge variant={platformSettings?.maintenanceMode ? 'destructive' : 'secondary'}>
                {platformSettings?.maintenanceMode ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium">User Registration</p>
                <p className="text-sm text-gray-500">Allow new user signups</p>
              </div>
              <Badge variant={platformSettings?.userRegistrationEnabled ? 'default' : 'secondary'}>
                {platformSettings?.userRegistrationEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium">Email Notifications</p>
                <p className="text-sm text-gray-500">Send system emails</p>
              </div>
              <Badge variant={platformSettings?.emailNotifications ? 'default' : 'secondary'}>
                {platformSettings?.emailNotifications ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" className="w-full justify-start" onClick={() => setLocation('/admin/kyc')}>
              <Shield className="h-4 w-4 mr-2" />
              KYC Verification Review
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => setLocation('/admin/security')}>
              <Shield className="h-4 w-4 mr-2" />
              Security Dashboard
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => setLocation('/admin/support')}>
              <MessageSquare className="h-4 w-4 mr-2" />
              Support Dashboard
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => setLocation('/admin/autonomy')}>
              <Zap className="h-4 w-4 mr-2" />
              Autonomy Controls
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeSection) {
      case 'overview': return renderOverview();
      case 'users': return renderUserManagement();
      case 'moderation': return renderModeration();
      case 'system': return renderSystemHealth();
      case 'analytics': return renderAnalytics();
      case 'killswitch': return renderKillSwitch();
      case 'settings': return renderSettings();
      default: return renderOverview();
    }
  };

  return (
    <div className="flex min-h-screen">
      {renderSidebar()}
      <div className="flex-1 bg-gray-50 p-6 overflow-auto">
        {renderContent()}
      </div>

      <Dialog open={showEditUserDialog} onOpenChange={setShowEditUserDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update settings for {selectedUser?.username || selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Role</Label>
              <Select value={editUserRole} onValueChange={setEditUserRole}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subscription Plan</Label>
              <Select value={editUserPlan} onValueChange={setEditUserPlan}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                  <SelectItem value="lifetime">Lifetime</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={editUserStatus} onValueChange={setEditUserStatus}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="banned">Banned</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditUserDialog(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (selectedUser) {
                  updateUserMutation.mutate({
                    userId: selectedUser.id,
                    role: editUserRole,
                    subscriptionTier: editUserPlan,
                    subscriptionStatus: editUserStatus,
                  });
                }
              }}
              disabled={updateUserMutation.isPending}
            >
              {updateUserMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteUserDialog} onOpenChange={setShowDeleteUserDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedUser?.username || selectedUser?.email}"?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedUser && deleteUserMutation.mutate(selectedUser.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showModerationDialog} onOpenChange={setShowModerationDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Review Report</DialogTitle>
            <DialogDescription>
              Take action on this moderation report
            </DialogDescription>
          </DialogHeader>
          {selectedReport && (
            <div className="space-y-4 py-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="font-medium">{selectedReport.contentTitle}</p>
                <p className="text-sm text-gray-600">{selectedReport.description}</p>
                <div className="flex gap-2 mt-2">
                  <Badge variant="outline">{selectedReport.reason.replace('_', ' ')}</Badge>
                  <Badge variant="secondary">by {selectedReport.reportedByUsername}</Badge>
                </div>
              </div>
              <div>
                <Label>Action</Label>
                <Select value={moderationAction} onValueChange={setModerationAction}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select action" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dismiss">Dismiss Report</SelectItem>
                    <SelectItem value="warn_user">Warn User</SelectItem>
                    <SelectItem value="remove_content">Remove Content</SelectItem>
                    <SelectItem value="ban_user">Ban User</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={moderationNotes}
                  onChange={(e) => setModerationNotes(e.target.value)}
                  placeholder="Add notes about this decision..."
                  className="mt-2"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModerationDialog(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (selectedReport && moderationAction) {
                  reviewReportMutation.mutate({
                    reportId: selectedReport.id,
                    action: moderationAction,
                    notes: moderationNotes,
                  });
                }
              }}
              disabled={!moderationAction || reviewReportMutation.isPending}
            >
              {reviewReportMutation.isPending ? 'Processing...' : 'Submit Review'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showKillSwitchDialog} onOpenChange={setShowKillSwitchDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {systemHealth?.killSwitch?.globalKilled ? 'Resume Systems' : 'Emergency Stop'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {systemHealth?.killSwitch?.globalKilled
                ? 'Provide a reason to resume all autonomous systems.'
                : 'This will immediately stop all autonomous systems. Provide a reason for the emergency stop.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label>Reason (required)</Label>
            <Textarea
              value={killSwitchReason}
              onChange={(e) => setKillSwitchReason(e.target.value)}
              placeholder="Enter reason for this action..."
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (killSwitchReason.length >= 5) {
                  if (systemHealth?.killSwitch?.globalKilled) {
                    resumeAllMutation.mutate(killSwitchReason);
                  } else {
                    killAllMutation.mutate(killSwitchReason);
                  }
                }
              }}
              disabled={killSwitchReason.length < 5}
              className={systemHealth?.killSwitch?.globalKilled ? '' : 'bg-red-600 hover:bg-red-700'}
            >
              {systemHealth?.killSwitch?.globalKilled ? 'Resume Systems' : 'Activate Kill Switch'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
