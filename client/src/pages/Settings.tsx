import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  User,
  Lock,
  Bell,
  Palette,
  Music,
  Shield,
  CreditCard,
  Download,
  Trash2,
  Upload,
  Eye,
  EyeOff,
  Link as LinkIcon,
} from 'lucide-react';
import { useRequireSubscription } from '@/hooks/useRequireAuth';
import { useToast } from '@/hooks/use-toast';
import { useOnboardingProgress } from '@/hooks/useOnboardingProgress';
import { apiRequest, queryClient as qc } from '@/lib/queryClient';
import { isUnauthorizedError } from '@/lib/authUtils';
import { PlatformConnections } from '@/components/social/platform-connections';
import ChangePasswordDialog from '@/components/dialogs/ChangePasswordDialog';
import TwoFactorSetupDialog from '@/components/dialogs/TwoFactorSetupDialog';
import PaymentUpdateDialog from '@/components/dialogs/PaymentUpdateDialog';
import DeleteAccountDialog from '@/components/dialogs/DeleteAccountDialog';
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

export default function Settings() {
  const { user, isLoading: authLoading } = useRequireSubscription();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { trackProfileComplete, trackSocialAccountConnected, trackCollaboratorInvited } = useOnboardingProgress();
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showPassword, setShowPassword] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [twoFactorOpen, setTwoFactorOpen] = useState(false);
  const [paymentUpdateOpen, setPaymentUpdateOpen] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [cancelSubscriptionOpen, setCancelSubscriptionOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(user?.profileImageUrl || '');

  // Query for full profile data
  const { data: fullProfile } = useQuery({
    queryKey: ['/api/auth/profile'],
    enabled: !!user,
  });

  // Query for notification settings
  const { data: notificationData } = useQuery({
    queryKey: ['/api/auth/notifications'],
    enabled: !!user,
  });

  // Query for preferences
  const { data: preferencesData } = useQuery({
    queryKey: ['/api/auth/preferences'],
    enabled: !!user,
  });

  // Query for subscription data
  const { data: subscriptionData } = useQuery({
    queryKey: ['/api/billing/subscription'],
    enabled: !!user,
  });

  // Query for payment method
  const { data: paymentMethod } = useQuery({
    queryKey: ['/api/billing/payment-method'],
    enabled: !!user,
  });

  // Query for billing history
  const { data: billingHistory = [], isLoading: billingLoading } = useQuery({
    queryKey: ['/api/billing/history'],
    enabled: !!user,
  });

  // Query for login sessions
  const { data: loginSessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ['/api/auth/sessions'],
    enabled: !!user,
  });

  const [profileData, setProfileData] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    bio: '',
    website: '',
    location: '',
  });

  const [notificationSettings, setNotificationSettings] = useState({
    emailNotifications: true,
    pushNotifications: true,
    weeklyReports: true,
    salesAlerts: true,
    royaltyUpdates: true,
  });

  const [preferences, setPreferences] = useState({
    theme: 'dark',
    defaultBPM: 120,
    defaultKey: 'C',
    autoSave: true,
    betaFeatures: false,
  });

  // Update profileData when fullProfile loads
  useEffect(() => {
    if (fullProfile) {
      setProfileData({
        firstName: fullProfile.firstName || '',
        lastName: fullProfile.lastName || '',
        email: fullProfile.email || '',
        bio: fullProfile.bio || '',
        website: fullProfile.website || '',
        location: fullProfile.location || '',
      });
    }
  }, [fullProfile]);

  // Update notificationSettings when notificationData loads
  useEffect(() => {
    if (notificationData) {
      setNotificationSettings({
        emailNotifications: notificationData.emailNotifications ?? true,
        pushNotifications: notificationData.pushNotifications ?? true,
        weeklyReports: notificationData.weeklyReports ?? true,
        salesAlerts: notificationData.salesAlerts ?? true,
        royaltyUpdates: notificationData.royaltyUpdates ?? true,
      });
    }
  }, [notificationData]);

  // Update preferences when preferencesData loads
  useEffect(() => {
    if (preferencesData) {
      setPreferences({
        theme: preferencesData.theme || 'dark',
        defaultBPM: preferencesData.defaultBPM || 120,
        defaultKey: preferencesData.defaultKey || 'C',
        autoSave: preferencesData.autoSave ?? true,
        betaFeatures: preferencesData.betaFeatures ?? false,
      });
    }
  }, [preferencesData]);

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (data: unknown) => {
      const response = await apiRequest('PUT', '/api/auth/profile', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      toast({
        title: 'Profile Updated',
        description: 'Your profile has been updated successfully.',
      });
      trackProfileComplete();
    },
    onError: (error) => {
      if (isUnauthorizedError(error as Error)) {
        toast({
          title: 'Unauthorized',
          description: 'You are logged out. Logging in again...',
          variant: 'destructive',
        });
        setTimeout(() => {
          window.location.href = '/api/login';
        }, 500);
        return;
      }
      toast({
        title: 'Error',
        description: 'Failed to update profile. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate(profileData);
  };

  const handleNotificationChange = async (key: string, value: boolean) => {
    const previousSettings = { ...notificationSettings };

    // Optimistic update
    setNotificationSettings((prev) => ({ ...prev, [key]: value }));

    try {
      await apiRequest('PUT', '/api/auth/notifications', { [key]: value });

      // CRITICAL: Invalidate cache to refetch updated data
      queryClient.invalidateQueries({ queryKey: ['/api/auth/notifications'] });

      toast({
        title: 'Updated',
        description: 'Notification settings updated',
      });
    } catch (error: unknown) {
      // Rollback on failure
      setNotificationSettings(previousSettings);

      toast({
        title: 'Error',
        description: 'Failed to update notification settings',
        variant: 'destructive',
      });
    }
  };

  const handlePreferenceChange = async (key: string, value: unknown) => {
    const previousPreferences = { ...preferences };

    // Optimistic update
    setPreferences((prev) => ({ ...prev, [key]: value }));

    try {
      await apiRequest('PUT', '/api/auth/preferences', { [key]: value });

      // CRITICAL: Invalidate cache to refetch updated data
      queryClient.invalidateQueries({ queryKey: ['/api/auth/preferences'] });

      toast({
        title: 'Updated',
        description: 'Preferences updated',
      });
    } catch (error: unknown) {
      // Rollback on failure
      setPreferences(previousPreferences);

      toast({
        title: 'Error',
        description: 'Failed to update preferences',
        variant: 'destructive',
      });
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'Error',
        description: 'Image size should be less than 5MB',
        variant: 'destructive',
      });
      return;
    }

    const formData = new FormData();
    formData.append('avatar', file);

    try {
      const response = await fetch('/api/auth/avatar', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Upload failed');

      const data = await response.json();
      setAvatarUrl(data.profileImageUrl);
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });

      toast({
        title: 'Success',
        description: 'Profile picture updated successfully',
      });
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: 'Failed to upload profile picture',
        variant: 'destructive',
      });
    }
  };

  const handleAvatarRemove = async () => {
    try {
      await apiRequest('DELETE', '/api/auth/avatar');
      setAvatarUrl('');
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });

      toast({
        title: 'Success',
        description: 'Profile picture removed',
      });
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: 'Failed to remove profile picture',
        variant: 'destructive',
      });
    }
  };

  const handleGoogleDisconnect = async () => {
    try {
      await apiRequest('DELETE', '/api/auth/google-connection');
      toast({
        title: 'Success',
        description: 'Google account disconnected',
      });
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: 'Failed to disconnect Google account',
        variant: 'destructive',
      });
    }
  };

  const handleCancelSubscription = async () => {
    try {
      await apiRequest('POST', '/api/billing/cancel-subscription');
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      toast({
        title: 'Subscription Cancelled',
        description: 'Your subscription will remain active until the end of the billing period',
      });
      setCancelSubscriptionOpen(false);
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: 'Failed to cancel subscription',
        variant: 'destructive',
      });
    }
  };

  const handleDownloadInvoice = async (invoiceId: string) => {
    try {
      const response = await fetch(`/api/billing/invoices/${invoiceId}/download`, {
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${invoiceId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: 'Success',
        description: 'Invoice downloaded successfully',
      });
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: 'Failed to download invoice',
        variant: 'destructive',
      });
    }
  };

  const handleTerminateSession = async (sessionId: string) => {
    try {
      await apiRequest('POST', '/api/auth/sessions/terminate', { sessionId });

      // CRITICAL: Invalidate cache to refetch updated sessions list
      queryClient.invalidateQueries({ queryKey: ['/api/auth/sessions'] });

      toast({
        title: 'Success',
        description: 'Session terminated successfully',
      });
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: 'Failed to terminate session',
        variant: 'destructive',
      });
    }
  };

  const handleExportData = async () => {
    try {
      const response = await fetch('/api/auth/export-data', {
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `maxbooster-data-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: 'Success',
        description: 'Your data has been exported successfully',
      });
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: 'Failed to export data',
        variant: 'destructive',
      });
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          <p className="text-muted-foreground">Loading Settings...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <AppLayout>
      <div className="p-6 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold gradient-text mb-2" data-testid="text-settings-title">
              Settings
            </h1>
            <p className="text-muted-foreground">Manage your account settings and preferences</p>
          </div>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="profile" data-testid="tab-profile">
              <User className="w-4 h-4 mr-2" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="account" data-testid="tab-account">
              <Lock className="w-4 h-4 mr-2" />
              Account
            </TabsTrigger>
            <TabsTrigger value="notifications" data-testid="tab-notifications">
              <Bell className="w-4 h-4 mr-2" />
              Notifications
            </TabsTrigger>
            <TabsTrigger value="preferences" data-testid="tab-preferences">
              <Palette className="w-4 h-4 mr-2" />
              Preferences
            </TabsTrigger>
            <TabsTrigger value="billing" data-testid="tab-billing">
              <CreditCard className="w-4 h-4 mr-2" />
              Billing
            </TabsTrigger>
            <TabsTrigger value="security" data-testid="tab-security">
              <Shield className="w-4 h-4 mr-2" />
              Security
            </TabsTrigger>
            <TabsTrigger value="platforms" data-testid="tab-platforms">
              <LinkIcon className="w-4 h-4 mr-2" />
              Platforms
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-6">
            <Card className="glassmorphism">
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleProfileSubmit} className="space-y-6">
                  {/* Profile Picture */}
                  <div className="flex items-center space-x-6">
                    <Avatar className="w-24 h-24">
                      <AvatarImage src={avatarUrl || user?.profileImageUrl} />
                      <AvatarFallback className="text-2xl">
                        {user?.firstName?.[0]}
                        {user?.lastName?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="space-y-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAvatarUpload}
                      />
                      <Button
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        data-testid="button-upload-avatar"
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Upload Photo
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleAvatarRemove}
                        data-testid="button-remove-avatar"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Remove
                      </Button>
                    </div>
                  </div>

                  {/* Basic Information */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <Label htmlFor="firstName">First Name</Label>
                      <Input
                        id="firstName"
                        value={profileData.firstName}
                        onChange={(e) =>
                          setProfileData((prev) => ({ ...prev, firstName: e.target.value }))
                        }
                        data-testid="input-first-name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input
                        id="lastName"
                        value={profileData.lastName}
                        onChange={(e) =>
                          setProfileData((prev) => ({ ...prev, lastName: e.target.value }))
                        }
                        data-testid="input-last-name"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      value={profileData.email}
                      onChange={(e) =>
                        setProfileData((prev) => ({ ...prev, email: e.target.value }))
                      }
                      data-testid="input-email"
                    />
                  </div>

                  <div>
                    <Label htmlFor="bio">Bio</Label>
                    <Textarea
                      id="bio"
                      placeholder="Tell us about yourself and your music..."
                      value={profileData.bio}
                      onChange={(e) => setProfileData((prev) => ({ ...prev, bio: e.target.value }))}
                      data-testid="textarea-bio"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <Label htmlFor="website">Website</Label>
                      <Input
                        id="website"
                        placeholder="https://yourwebsite.com"
                        value={profileData.website}
                        onChange={(e) =>
                          setProfileData((prev) => ({ ...prev, website: e.target.value }))
                        }
                        data-testid="input-website"
                      />
                    </div>
                    <div>
                      <Label htmlFor="location">Location</Label>
                      <Input
                        id="location"
                        placeholder="City, Country"
                        value={profileData.location}
                        onChange={(e) =>
                          setProfileData((prev) => ({ ...prev, location: e.target.value }))
                        }
                        data-testid="input-location"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={updateProfileMutation.isPending}
                    data-testid="button-save-profile"
                  >
                    {updateProfileMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="account" className="space-y-6">
            <Card className="glassmorphism">
              <CardHeader>
                <CardTitle>Account Security</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Change Password */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Change Password</h3>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="currentPassword">Current Password</Label>
                      <div className="relative">
                        <Input
                          id="currentPassword"
                          type={showPassword ? 'text' : 'password'}
                          data-testid="input-current-password"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-2 top-1/2 transform -translate-y-1/2"
                          onClick={() => setShowPassword(!showPassword)}
                          data-testid="button-toggle-password"
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="newPassword">New Password</Label>
                      <Input id="newPassword" type="password" data-testid="input-new-password" />
                    </div>
                    <div>
                      <Label htmlFor="confirmPassword">Confirm New Password</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        data-testid="input-confirm-password"
                      />
                    </div>
                    <Button
                      onClick={() => setChangePasswordOpen(true)}
                      data-testid="button-change-password"
                    >
                      Change Password
                    </Button>
                  </div>
                </div>

                {/* Two-Factor Authentication */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Two-Factor Authentication</h3>
                  <div className="flex items-center justify-between p-4 bg-muted/20 rounded-lg">
                    <div>
                      <p className="font-medium">Authenticator App</p>
                      <p className="text-sm text-muted-foreground">
                        Use an authenticator app for additional security
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => setTwoFactorOpen(true)}
                      data-testid="button-setup-2fa"
                    >
                      Setup
                    </Button>
                  </div>
                </div>

                {/* Connected Accounts */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Connected Accounts</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-4 bg-muted/20 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center">
                          <span className="text-white text-sm font-bold">G</span>
                        </div>
                        <div>
                          <p className="font-medium">Google</p>
                          <p className="text-sm text-muted-foreground">Connected for login</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleGoogleDisconnect}
                        data-testid="button-disconnect-google"
                      >
                        Disconnect
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-6">
            <Card className="glassmorphism">
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Email Notifications */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Email Notifications</h3>
                  <div className="space-y-4">
                    {[
                      {
                        key: 'emailNotifications',
                        label: 'Email Notifications',
                        description: 'Receive notifications via email',
                      },
                      {
                        key: 'weeklyReports',
                        label: 'Weekly Reports',
                        description: 'Get weekly performance summaries',
                      },
                      {
                        key: 'royaltyUpdates',
                        label: 'Royalty Updates',
                        description: 'Notifications about new royalty payments',
                      },
                      {
                        key: 'salesAlerts',
                        label: 'Sales Alerts',
                        description: 'Instant notifications for beat sales',
                      },
                    ].map((setting) => (
                      <div key={setting.key} className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{setting.label}</p>
                          <p className="text-sm text-muted-foreground">{setting.description}</p>
                        </div>
                        <Switch
                          checked={
                            notificationSettings[setting.key as keyof typeof notificationSettings]
                          }
                          onCheckedChange={(checked) =>
                            handleNotificationChange(setting.key, checked)
                          }
                          data-testid={`switch-${setting.key}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Push Notifications */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Push Notifications</h3>
                  <div className="space-y-4">
                    {[
                      {
                        key: 'pushNotifications',
                        label: 'Push Notifications',
                        description: 'Receive push notifications on your devices',
                      },
                    ].map((setting) => (
                      <div key={setting.key} className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{setting.label}</p>
                          <p className="text-sm text-muted-foreground">{setting.description}</p>
                        </div>
                        <Switch
                          checked={
                            notificationSettings[setting.key as keyof typeof notificationSettings]
                          }
                          onCheckedChange={(checked) =>
                            handleNotificationChange(setting.key, checked)
                          }
                          data-testid={`switch-${setting.key}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preferences" className="space-y-6">
            <Card className="glassmorphism">
              <CardHeader>
                <CardTitle>Studio Preferences</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Theme Settings */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Appearance</h3>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Theme</p>
                      <p className="text-sm text-muted-foreground">Choose your preferred theme</p>
                    </div>
                    <Select
                      value={preferences.theme}
                      onValueChange={(value) => handlePreferenceChange('theme', value)}
                    >
                      <SelectTrigger className="w-32" data-testid="select-theme">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dark" data-testid="select-theme-dark">
                          Dark
                        </SelectItem>
                        <SelectItem value="light" data-testid="select-theme-light">
                          Light
                        </SelectItem>
                        <SelectItem value="system" data-testid="select-theme-system">
                          System
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Studio Defaults */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Studio Defaults</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Default BPM</p>
                        <p className="text-sm text-muted-foreground">
                          Default tempo for new projects
                        </p>
                      </div>
                      <Input
                        type="number"
                        className="w-24"
                        value={preferences.defaultBPM}
                        onChange={(e) =>
                          handlePreferenceChange('defaultBPM', parseInt(e.target.value))
                        }
                        data-testid="input-default-bpm"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Default Key</p>
                        <p className="text-sm text-muted-foreground">
                          Default key signature for new projects
                        </p>
                      </div>
                      <Select
                        value={preferences.defaultKey}
                        onValueChange={(value) => handlePreferenceChange('defaultKey', value)}
                      >
                        <SelectTrigger className="w-32" data-testid="select-default-key">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="C" data-testid="select-key-c">
                            C Major
                          </SelectItem>
                          <SelectItem value="G" data-testid="select-key-g">
                            G Major
                          </SelectItem>
                          <SelectItem value="D" data-testid="select-key-d">
                            D Major
                          </SelectItem>
                          <SelectItem value="A" data-testid="select-key-a">
                            A Major
                          </SelectItem>
                          <SelectItem value="E" data-testid="select-key-e">
                            E Major
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Advanced Settings */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Advanced</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Auto-save Projects</p>
                        <p className="text-sm text-muted-foreground">
                          Automatically save your work every few minutes
                        </p>
                      </div>
                      <Switch
                        checked={preferences.autoSave}
                        onCheckedChange={(checked) => handlePreferenceChange('autoSave', checked)}
                        data-testid="switch-auto-save"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Beta Features</p>
                        <p className="text-sm text-muted-foreground">
                          Enable experimental features and early access
                        </p>
                      </div>
                      <Switch
                        checked={preferences.betaFeatures}
                        onCheckedChange={(checked) =>
                          handlePreferenceChange('betaFeatures', checked)
                        }
                        data-testid="switch-beta-features"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="billing" className="space-y-6">
            <Card className="glassmorphism">
              <CardHeader>
                <CardTitle>Billing & Subscription</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Current Plan */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Current Plan</h3>
                  <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-primary">
                          {subscriptionData?.planName || 'Free Plan'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {subscriptionData?.description || 'Limited access'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold">${subscriptionData?.price || 0}</p>
                        <p className="text-sm text-muted-foreground">
                          per {subscriptionData?.interval || 'month'}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex space-x-2">
                      <Button
                        variant="outline"
                        onClick={() => navigate('/pricing')}
                        data-testid="button-change-plan"
                      >
                        Change Plan
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setCancelSubscriptionOpen(true)}
                        data-testid="button-cancel-subscription"
                      >
                        Cancel Subscription
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Payment Method */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Payment Method</h3>
                  <div className="p-4 bg-muted/20 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center">
                          <CreditCard className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <p className="font-medium">
                            {paymentMethod?.last4
                              ? `•••• •••• •••• ${paymentMethod.last4}`
                              : 'No payment method'}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {paymentMethod?.expiry
                              ? `Expires ${paymentMethod.expiry}`
                              : 'Add payment method'}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPaymentUpdateOpen(true)}
                        data-testid="button-update-payment"
                      >
                        Update
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Billing History */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Billing History</h3>
                  {billingLoading ? (
                    <div className="space-y-3">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="animate-pulse p-3 bg-muted/20 rounded">
                          <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/3 mb-2"></div>
                          <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-1/4"></div>
                        </div>
                      ))}
                    </div>
                  ) : billingHistory.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-gray-500 dark:text-gray-400">No billing history yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {billingHistory.map((billing: unknown) => (
                        <div
                          key={billing.id || billing.invoiceId}
                          className="flex items-center justify-between p-3 bg-muted/20 rounded"
                          data-testid={`billing-${billing.invoiceId}`}
                        >
                          <div>
                            <p className="font-medium">
                              {new Date(billing.date).toLocaleDateString()}
                            </p>
                            <p className="text-sm text-muted-foreground">{billing.invoiceId}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">${billing.amount.toFixed(2)}</p>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDownloadInvoice(billing.invoiceId)}
                              data-testid={`button-download-invoice-${billing.invoiceId}`}
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="space-y-6">
            <Card className="glassmorphism">
              <CardHeader>
                <CardTitle>Security & Privacy</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Login Activity */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Recent Login Activity</h3>
                  {sessionsLoading ? (
                    <div className="space-y-3">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="animate-pulse p-3 bg-muted/20 rounded">
                          <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-2/3 mb-2"></div>
                          <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-1/2"></div>
                        </div>
                      ))}
                    </div>
                  ) : loginSessions.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-gray-500 dark:text-gray-400">No recent login activity</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {loginSessions.map((session: unknown) => (
                        <div
                          key={session.id}
                          className="flex items-center justify-between p-3 bg-muted/20 rounded"
                          data-testid={`session-${session.id}`}
                        >
                          <div>
                            <p className="font-medium">{session.device || 'Unknown Device'}</p>
                            <p className="text-sm text-muted-foreground">
                              {session.location || 'Unknown'} • {session.time || 'Unknown'}
                            </p>
                          </div>
                          <div className="flex items-center space-x-2">
                            {session.current && (
                              <span className="text-xs bg-accent/20 text-accent px-2 py-1 rounded">
                                Current
                              </span>
                            )}
                            {!session.current && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleTerminateSession(session.id)}
                                data-testid={`button-terminate-session-${session.id}`}
                              >
                                Terminate
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Data Export */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Data & Privacy</h3>
                  <div className="space-y-4">
                    <div className="p-4 bg-muted/20 rounded-lg">
                      <p className="font-medium mb-2">Export Your Data</p>
                      <p className="text-sm text-muted-foreground mb-4">
                        Download a copy of all your data including projects, tracks, and analytics.
                      </p>
                      <Button
                        variant="outline"
                        onClick={handleExportData}
                        data-testid="button-export-data"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Request Data Export
                      </Button>
                    </div>

                    <div className="p-4 bg-destructive/10 rounded-lg border border-destructive/20">
                      <p className="font-medium mb-2 text-destructive">Delete Account</p>
                      <p className="text-sm text-muted-foreground mb-4">
                        Permanently delete your account and all associated data. This action cannot
                        be undone.
                      </p>
                      <Button
                        variant="destructive"
                        onClick={() => setDeleteAccountOpen(true)}
                        data-testid="button-delete-account"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Account
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="platforms" className="space-y-6">
            <PlatformConnections />
          </TabsContent>
        </Tabs>

        {/* Dialogs */}
        <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />

        <TwoFactorSetupDialog open={twoFactorOpen} onOpenChange={setTwoFactorOpen} />

        <PaymentUpdateDialog open={paymentUpdateOpen} onOpenChange={setPaymentUpdateOpen} />

        <DeleteAccountDialog open={deleteAccountOpen} onOpenChange={setDeleteAccountOpen} />

        <AlertDialog open={cancelSubscriptionOpen} onOpenChange={setCancelSubscriptionOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel Subscription</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to cancel your subscription? You'll continue to have access to
                Max Booster Pro features until the end of your current billing period.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
              <AlertDialogAction onClick={handleCancelSubscription}>
                Cancel Subscription
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
