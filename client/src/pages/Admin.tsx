import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRequireAdmin } from '@/hooks/useRequireAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
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
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useLocation } from 'wouter';

interface AdminUser {
  id: string;
  username: string;
  email: string;
  role: string;
  subscriptionPlan: string | null;
  subscriptionStatus: string | null;
  createdAt: string;
  password?: undefined;
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

interface SubscriptionStat {
  plan: string;
  count: number;
}

interface UserGrowthData {
  date: string;
  count: number;
}

interface StreamGrowthData {
  date: string;
  count: number;
}

interface TopArtistData {
  id: string;
  name: string;
  streams: number;
}

interface PlatformStatData {
  label: string;
  value: number;
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
  userGrowth: UserGrowthData[];
  streamGrowth: StreamGrowthData[];
  topArtists: TopArtistData[];
  platformStats: PlatformStatData[];
  subscriptionStats: SubscriptionStat[];
  newUsers: number;
}

interface AdminSettings {
  emailNotifications: boolean;
  maintenanceMode: boolean;
  userRegistrationEnabled: boolean;
  apiRateLimit: number;
  webhookEndpoint: string | null;
}

export default function Admin() {
  const { user, isLoading: authLoading } = useRequireAdmin();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [showRateLimitDialog, setShowRateLimitDialog] = useState(false);
  const [showWebhookDialog, setShowWebhookDialog] = useState(false);
  const [showEditUserDialog, setShowEditUserDialog] = useState(false);
  const [showDeleteUserDialog, setShowDeleteUserDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [editUserRole, setEditUserRole] = useState('user');
  const [editUserPlan, setEditUserPlan] = useState('free');
  const [editUserStatus, setEditUserStatus] = useState('active');

  const { data: platformSettings } = useQuery<AdminSettings>({
    queryKey: ['/api/admin/settings'],
    enabled: !!user,
  });

  const { data: adminAnalytics, isLoading: analyticsLoading } = useQuery<AdminAnalytics>({
    queryKey: ['/api/admin/analytics'],
    enabled: !!user,
  });

  const { data: usersData, isLoading: usersLoading } = useQuery<UsersResponse>({
    queryKey: ['/api/admin/users'],
    enabled: !!user,
  });

  const users = usersData?.users || [];

  // Update state when platformSettings loads
  useEffect(() => {
    if (platformSettings) {
      setEmailNotifications(platformSettings.emailNotifications ?? true);
      setMaintenanceMode(platformSettings.maintenanceMode ?? false);
    }
  }, [platformSettings]);

  // Mutations
  const exportUsersMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('GET', '/api/admin/users/export');
      return response.json();
    },
    onSuccess: (data) => {
      // Create download link
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `users-export-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: 'Export Successful',
        description: 'User data has been exported.',
      });
    },
  });

  const sendEmailMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest('POST', `/api/admin/users/${userId}/email`, {
        subject: 'Message from Max Booster',
        message: 'Hello from Max Booster! We wanted to reach out about your account.',
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Email Sent',
        description: 'Email has been sent to the user.',
      });
    },
  });

  const toggleNotificationsMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const response = await apiRequest('POST', '/api/admin/settings/notifications', { enabled });
      return response.json();
    },
    onSuccess: (data) => {
      setEmailNotifications(data.enabled);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      toast({
        title: 'Settings Updated',
        description: `Email notifications ${data.enabled ? 'enabled' : 'disabled'}.`,
      });
    },
  });

  const toggleMaintenanceMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const response = await apiRequest('POST', '/api/admin/settings/maintenance', { enabled });
      return response.json();
    },
    onSuccess: (data) => {
      setMaintenanceMode(data.enabled);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      toast({
        title: 'Maintenance Mode',
        description: data.enabled
          ? 'Platform is now in maintenance mode.'
          : 'Platform is now accessible to users.',
        variant: data.enabled ? 'destructive' : 'default',
      });
    },
  });

  const toggleUserRegistrationMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const response = await apiRequest('POST', '/api/admin/settings/registration', { enabled });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      toast({
        title: 'Settings Updated',
        description: `User registration ${data.enabled ? 'enabled' : 'disabled'}.`,
      });
    },
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
      toast({
        title: 'User Updated',
        description: 'User details have been updated successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Update Failed',
        description: error.message,
        variant: 'destructive',
      });
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
      toast({
        title: 'User Deleted',
        description: 'User has been deleted from the platform.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Delete Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const { data: paymentBypassStatus } = useQuery<{ isActive: boolean; expiresAt?: string; activatedBy?: string }>({
    queryKey: ['/api/payment-bypass/status'],
    enabled: !!user,
  });

  const activatePaymentBypassMutation = useMutation({
    mutationFn: async ({ durationHours, reason }: { durationHours: number; reason: string }) => {
      const response = await apiRequest('POST', '/api/payment-bypass/activate', { durationHours, reason });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payment-bypass/status'] });
      toast({
        title: 'Payment Bypass Activated',
        description: 'Payment requirements have been temporarily bypassed.',
      });
    },
  });

  const deactivatePaymentBypassMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/payment-bypass/deactivate', { reason: 'Admin deactivation' });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payment-bypass/status'] });
      toast({
        title: 'Payment Bypass Deactivated',
        description: 'Payment requirements are now enforced.',
      });
    },
  });

  // Handlers
  const handleExportUsers = () => {
    exportUsersMutation.mutate();
  };

  const handleSendEmail = (userId: string) => {
    sendEmailMutation.mutate(userId);
  };

  const handleViewUser = (userId: string) => {
    const foundUser = users.find(u => u.id === userId);
    if (foundUser) {
      toast({
        title: `User: ${foundUser.username || foundUser.email}`,
        description: `Plan: ${foundUser.subscriptionPlan || 'None'} | Status: ${foundUser.subscriptionStatus || 'Unknown'} | Role: ${foundUser.role || 'user'}`,
      });
    }
  };

  const handleEditUser = (userId: string) => {
    const foundUser = users.find(u => u.id === userId);
    if (foundUser) {
      setSelectedUser(foundUser);
      setEditUserRole(foundUser.role || 'user');
      setEditUserPlan(foundUser.subscriptionPlan || 'free');
      setEditUserStatus(foundUser.subscriptionStatus || 'active');
      setShowEditUserDialog(true);
    }
  };

  const handleBanUser = (userId: string) => {
    const foundUser = users.find(u => u.id === userId);
    if (foundUser) {
      if (foundUser.subscriptionStatus === 'banned') {
        updateUserMutation.mutate({ userId, subscriptionStatus: 'inactive' });
      } else {
        updateUserMutation.mutate({ userId, subscriptionStatus: 'banned' });
      }
    }
  };

  const handleDeleteUser = (userId: string) => {
    const foundUser = users.find(u => u.id === userId);
    if (foundUser) {
      setSelectedUser(foundUser);
      setShowDeleteUserDialog(true);
    }
  };

  const handleSaveUserEdit = () => {
    if (selectedUser) {
      updateUserMutation.mutate({
        userId: selectedUser.id,
        role: editUserRole,
        subscriptionTier: editUserPlan,
        subscriptionStatus: editUserStatus,
      });
    }
  };

  const handleConfirmDeleteUser = () => {
    if (selectedUser) {
      deleteUserMutation.mutate(selectedUser.id);
    }
  };

  const handleToggleNotifications = () => {
    toggleNotificationsMutation.mutate(!emailNotifications);
  };

  const handleToggleMaintenance = () => {
    if (
      maintenanceMode ||
      confirm(
        'Are you sure you want to enable maintenance mode? Users will not be able to access the platform.'
      )
    ) {
      toggleMaintenanceMutation.mutate(!maintenanceMode);
    }
  };

  const handleToggleUserRegistration = () => {
    const currentState = platformSettings?.userRegistrationEnabled ?? true;
    toggleUserRegistrationMutation.mutate(!currentState);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      (user.username?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (user.email?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || user.subscriptionStatus === statusFilter;
    const matchesPlan = planFilter === 'all' || user.subscriptionPlan === planFilter;

    return matchesSearch && matchesStatus && matchesPlan;
  });

  const statsCards = [
    {
      title: 'Total Users',
      value: adminAnalytics?.totalUsers?.toLocaleString() || '0',
      change: `+${adminAnalytics?.recentSignups || 0} this month`,
      icon: Users,
      color: 'from-blue-500 to-cyan-500',
    },
    {
      title: 'Total Revenue',
      value: `$${adminAnalytics?.totalRevenue?.toLocaleString() || '0'}`,
      change: adminAnalytics?.revenueGrowth
        ? `${adminAnalytics.revenueGrowth > 0 ? '+' : ''}${adminAnalytics.revenueGrowth.toFixed(1)}% from last month`
        : 'No data',
      icon: DollarSign,
      color: 'from-green-500 to-emerald-500',
    },
    {
      title: 'Total Projects',
      value: adminAnalytics?.totalProjects?.toLocaleString() || '0',
      change: adminAnalytics?.projectsGrowth
        ? `${adminAnalytics.projectsGrowth > 0 ? '+' : ''}${adminAnalytics.projectsGrowth.toFixed(1)}% from last month`
        : 'No data',
      icon: Music,
      color: 'from-purple-500 to-indigo-500',
    },
    {
      title: 'Growth Rate',
      value: adminAnalytics?.userGrowthRate ? `${adminAnalytics.userGrowthRate.toFixed(1)}%` : '0%',
      change: 'Monthly active users',
      icon: TrendingUp,
      color: 'from-pink-500 to-rose-500',
    },
  ];

  const subscriptionStats = adminAnalytics?.subscriptionStats || [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'inactive':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'cancelled':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'past_due':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'banned':
        return 'bg-red-200 text-red-900 border-red-400';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getPlanColor = (plan: string) => {
    switch (plan) {
      case 'lifetime':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'yearly':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'monthly':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'free':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
        return <Crown className="h-4 w-4 text-yellow-600" />;
      case 'user':
        return <UserCheck className="h-4 w-4 text-green-600" />;
      default:
        return <UserX className="h-4 w-4 text-gray-600" />;
    }
  };

  return (
    <AppLayout title="Admin Portal" subtitle="Manage users, analytics, and platform settings">
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statsCards.map((stat, index) => (
            <Card
              key={index}
              className="hover-lift transition-all duration-200"
              data-testid={`card-stat-${stat.title.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-500 text-sm font-medium">{stat.title}</p>
                    <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                    <p className="text-green-600 text-sm font-medium">{stat.change}</p>
                  </div>
                  <div
                    className={`w-12 h-12 bg-gradient-to-r ${stat.color} rounded-lg flex items-center justify-center`}
                  >
                    <stat.icon className="h-6 w-6 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="users" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="users" data-testid="tab-users">
              Users
            </TabsTrigger>
            <TabsTrigger value="analytics" data-testid="tab-analytics">
              Analytics
            </TabsTrigger>
            <TabsTrigger value="subscriptions" data-testid="tab-subscriptions">
              Subscriptions
            </TabsTrigger>
            <TabsTrigger value="settings" data-testid="tab-settings">
              Settings
            </TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <CardTitle>User Management</CardTitle>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportUsers}
                      disabled={exportUsersMutation.isPending}
                      data-testid="button-export-users"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Export
                    </Button>
                  </div>
                </div>

                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder="Search users..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                      data-testid="input-search-users"
                    />
                  </div>

                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" data-testid="select-status-all">
                        All Status
                      </SelectItem>
                      <SelectItem value="active" data-testid="select-status-active">
                        Active
                      </SelectItem>
                      <SelectItem value="inactive" data-testid="select-status-inactive">
                        Inactive
                      </SelectItem>
                      <SelectItem value="cancelled" data-testid="select-status-cancelled">
                        Cancelled
                      </SelectItem>
                      <SelectItem value="past_due" data-testid="select-status-past-due">
                        Past Due
                      </SelectItem>
                      <SelectItem value="banned" data-testid="select-status-banned">
                        Banned
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={planFilter} onValueChange={setPlanFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Filter by plan" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" data-testid="select-plan-all">
                        All Plans
                      </SelectItem>
                      <SelectItem value="free" data-testid="select-plan-free">
                        Free
                      </SelectItem>
                      <SelectItem value="monthly" data-testid="select-plan-monthly">
                        Monthly
                      </SelectItem>
                      <SelectItem value="yearly" data-testid="select-plan-yearly">
                        Yearly
                      </SelectItem>
                      <SelectItem value="lifetime" data-testid="select-plan-lifetime">
                        Lifetime
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {usersLoading ? (
                  <div className="space-y-4">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="flex items-center space-x-4">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Plan</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Joined</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUsers.map((user) => (
                          <TableRow key={user.id}>
                            <TableCell>
                              <div className="flex items-center space-x-3">
                                <div className="w-8 h-8 bg-gradient-to-br from-primary to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                                  {user.username?.charAt(0)?.toUpperCase() || 'U'}
                                </div>
                                <div>
                                  <p className="font-medium text-gray-900">
                                    {user.username || 'Unknown'}
                                  </p>
                                  <p className="text-sm text-gray-500">
                                    {user.email || 'No email'}
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className={getPlanColor(user.subscriptionPlan ?? '')}
                              >
                                {user.subscriptionPlan?.toUpperCase() || 'FREE'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className={getStatusColor(user.subscriptionStatus ?? '')}
                              >
                                {user.subscriptionStatus?.toUpperCase() || 'INACTIVE'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center space-x-2">
                                {getRoleIcon(user.role)}
                                <span className="capitalize">{user.role}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center space-x-1 text-sm text-gray-500">
                                <Calendar className="h-3 w-3" />
                                <span>{new Date(user.createdAt).toLocaleDateString()}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center space-x-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleViewUser(user.id)}
                                  data-testid={`button-view-${user.id}`}
                                  title="View user details"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditUser(user.id)}
                                  data-testid={`button-edit-${user.id}`}
                                  title="Edit user"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleSendEmail(user.id)}
                                  disabled={sendEmailMutation.isPending}
                                  data-testid={`button-email-${user.id}`}
                                  title="Send email"
                                >
                                  <Mail className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleBanUser(user.id)}
                                  disabled={updateUserMutation.isPending}
                                  data-testid={`button-ban-${user.id}`}
                                  title={user.subscriptionStatus === 'banned' ? 'Unban user' : 'Ban user'}
                                  className={user.subscriptionStatus === 'banned' ? 'text-green-600' : 'text-orange-600'}
                                >
                                  <Ban className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteUser(user.id)}
                                  data-testid={`button-delete-${user.id}`}
                                  title="Delete user"
                                  className="text-red-600 hover:text-red-800"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Platform Growth</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center border">
                    <div className="text-center">
                      <TrendingUp className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">User Growth Chart</h3>
                      <p className="text-gray-500 mb-4">Track platform growth over time</p>
                      <div className="text-sm text-gray-600">
                        <p>• {adminAnalytics?.totalUsers || 0} total users</p>
                        <p>• {adminAnalytics?.recentSignups || 0} new signups this month</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Revenue Analytics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center border">
                    <div className="text-center">
                      <DollarSign className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">Revenue Breakdown</h3>
                      <p className="text-gray-500 mb-4">Monthly recurring revenue and growth</p>
                      <div className="text-sm text-gray-600">
                        <p>
                          • ${adminAnalytics?.totalRevenue?.toLocaleString() || 0} total revenue
                        </p>
                        <p>• Monthly recurring revenue tracking</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Subscriptions Tab */}
          <TabsContent value="subscriptions" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Subscription Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {subscriptionStats.map((stat, index) => (
                    <div key={index} className="text-center p-6 bg-gray-50 rounded-lg">
                      <h3 className="text-lg font-semibold text-gray-900 capitalize">
                        {stat.plan} Plan
                      </h3>
                      <p className="text-3xl font-bold text-primary mt-2">{stat.count}</p>
                      <p className="text-sm text-gray-500 mt-1">
                        {((stat.count / (adminAnalytics?.totalUsers || 1)) * 100).toFixed(1)}% of
                        users
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-8">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4">Plan Distribution</h4>
                  <div className="space-y-3">
                    {subscriptionStats.map((stat, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div
                            className={`w-4 h-4 rounded-full ${
                              stat.plan === 'lifetime'
                                ? 'bg-purple-500'
                                : stat.plan === 'yearly'
                                  ? 'bg-blue-500'
                                  : stat.plan === 'monthly'
                                    ? 'bg-green-500'
                                    : 'bg-gray-500'
                            }`}
                          />
                          <span className="capitalize font-medium">{stat.plan} Plan</span>
                        </div>
                        <div className="text-right">
                          <span className="font-bold">{stat.count} users</span>
                          <span className="text-sm text-gray-500 ml-2">
                            ({((stat.count / (adminAnalytics?.totalUsers || 1)) * 100).toFixed(1)}%)
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Platform Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">General Settings</h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">User Registration</h4>
                          <p className="text-sm text-gray-500">Allow new users to register</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleToggleUserRegistration}
                          disabled={toggleUserRegistrationMutation.isPending}
                          data-testid="toggle-user-registration"
                        >
                          {((platformSettings as any)?.userRegistrationEnabled ?? true)
                            ? 'Enabled'
                            : 'Disabled'}
                        </Button>
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">Email Notifications</h4>
                          <p className="text-sm text-gray-500">
                            Send system notifications via email
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleToggleNotifications}
                          disabled={toggleNotificationsMutation.isPending}
                          data-testid="toggle-email-notifications"
                        >
                          {emailNotifications ? 'Enabled' : 'Disabled'}
                        </Button>
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">Maintenance Mode</h4>
                          <p className="text-sm text-gray-500">Put platform in maintenance mode</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleToggleMaintenance}
                          disabled={toggleMaintenanceMutation.isPending}
                          data-testid="toggle-maintenance-mode"
                        >
                          {maintenanceMode ? 'Enabled' : 'Disabled'}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Payment Bypass Controls</h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div className="flex items-center space-x-4">
                          <div className={`p-3 rounded-full ${paymentBypassStatus?.isActive ? 'bg-yellow-200' : 'bg-green-200'}`}>
                            <CreditCard className={`h-5 w-5 ${paymentBypassStatus?.isActive ? 'text-yellow-700' : 'text-green-700'}`} />
                          </div>
                          <div>
                            <h4 className="font-medium">Payment Requirements</h4>
                            <p className="text-sm text-gray-500">
                              {paymentBypassStatus?.isActive 
                                ? `Bypassed until ${paymentBypassStatus.expiresAt ? new Date(paymentBypassStatus.expiresAt).toLocaleString() : 'manually disabled'}`
                                : 'Payment requirements are enforced'}
                            </p>
                          </div>
                        </div>
                        {paymentBypassStatus?.isActive ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deactivatePaymentBypassMutation.mutate()}
                            disabled={deactivatePaymentBypassMutation.isPending}
                            data-testid="button-deactivate-payment-bypass"
                          >
                            Re-enable Payments
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => activatePaymentBypassMutation.mutate({ durationHours: 2, reason: 'Admin bypass' })}
                            disabled={activatePaymentBypassMutation.isPending}
                            className="text-yellow-700 border-yellow-400 hover:bg-yellow-50"
                            data-testid="button-activate-payment-bypass"
                          >
                            Bypass for 2 Hours
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">API Settings</h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">API Rate Limiting</h4>
                          <p className="text-sm text-gray-500">Limit API requests per user</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowRateLimitDialog(true)}
                          data-testid="button-configure-rate-limiting"
                        >
                          Configure
                        </Button>
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">Webhook Endpoints</h4>
                          <p className="text-sm text-gray-500">Manage webhook configurations</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowWebhookDialog(true)}
                          data-testid="button-manage-webhooks"
                        >
                          Manage
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* API Rate Limiting Dialog */}
      <AlertDialog open={showRateLimitDialog} onOpenChange={setShowRateLimitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Configure API Rate Limiting</AlertDialogTitle>
            <AlertDialogDescription>
              Set the maximum number of API requests per user per minute.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label>Requests per minute</Label>
            <Input type="number" defaultValue="100" className="mt-2" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                toast({
                  title: 'Rate Limit Updated',
                  description: 'API rate limiting has been configured',
                });
                setShowRateLimitDialog(false);
              }}
            >
              Save Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Webhook Endpoints Dialog */}
      <AlertDialog open={showWebhookDialog} onOpenChange={setShowWebhookDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Manage Webhook Endpoints</AlertDialogTitle>
            <AlertDialogDescription>
              Configure webhook endpoints for platform events.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label>Webhook URL</Label>
              <Input type="url" placeholder="https://api.example.com/webhook" className="mt-2" />
            </div>
            <div>
              <Label>Events</Label>
              <Select defaultValue="all">
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Events</SelectItem>
                  <SelectItem value="user">User Events</SelectItem>
                  <SelectItem value="payment">Payment Events</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                toast({
                  title: 'Webhook Configured',
                  description: 'Webhook endpoint has been saved',
                });
                setShowWebhookDialog(false);
              }}
            >
              Save Webhook
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit User Dialog */}
      <AlertDialog open={showEditUserDialog} onOpenChange={setShowEditUserDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Edit User</AlertDialogTitle>
            <AlertDialogDescription>
              Update user role and subscription settings for {selectedUser?.username || selectedUser?.email}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-4">
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
              <Label>Subscription Status</Label>
              <Select value={editUserStatus} onValueChange={setEditUserStatus}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="past_due">Past Due</SelectItem>
                  <SelectItem value="banned">Banned</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedUser(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSaveUserEdit}
              disabled={updateUserMutation.isPending}
            >
              {updateUserMutation.isPending ? 'Saving...' : 'Save Changes'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete User Confirmation Dialog */}
      <AlertDialog open={showDeleteUserDialog} onOpenChange={setShowDeleteUserDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the user "{selectedUser?.username || selectedUser?.email}"? 
              This action cannot be undone and will permanently remove all user data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedUser(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteUser}
              disabled={deleteUserMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteUserMutation.isPending ? 'Deleting...' : 'Delete User'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
