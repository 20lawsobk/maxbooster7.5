import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Mail,
  Smartphone,
  Volume2,
  VolumeX,
  Users,
  DollarSign,
  Music2,
  MessageSquare,
  Megaphone,
  Shield,
  ShoppingBag,
  Loader2,
  Check,
  ExternalLink,
  Moon,
  Phone,
  Clock,
  BellOff,
  AlertCircle,
  Trophy,
  LayoutDashboard,
  Heart,
  Flame,
  FileText,
  BarChart2,
  MapPin,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { PushPermissionPrompt } from './PushPermissionPrompt';
import type {
  NotificationPreferences as NotificationPreferencesType,
  EmailFrequency,
  NotificationCategory,
  NotificationOutcome,
} from './types';
import { categoryConfig } from './types';

const defaultPreferences: NotificationPreferencesType = {
  muteAll: false,
  quietHours: {
    enabled: false,
    startTime: '22:00',
    endTime: '08:00',
    timezone: 'America/New_York',
    allowUrgent: true,
  },
  email: {
    enabled: true,
    frequency: 'instant',
    categories: {
      account_security: true,
      distribution: true,
      social_media: true,
      marketplace: true,
      royalties: true,
      collaboration: true,
      achievements: true,
      system: true,
      platform_admin: true,
    },
  },
  push: {
    enabled: false,
    categories: {
      account_security: true,
      distribution: true,
      social_media: false,
      marketplace: true,
      royalties: true,
      collaboration: true,
      achievements: true,
      system: true,
      platform_admin: true,
    },
  },
  sms: {
    enabled: false,
    phoneNumber: null,
    verified: false,
    categories: {
      account_security: true,
      royalties: true,
    },
  },
  inApp: {
    enabled: true,
    sound: true,
    desktop: true,
  },
};

const categoryIcons: Record<NotificationCategory, React.ElementType> = {
  account_security:   Shield,
  distribution:       Music2,
  social_media:       MessageSquare,
  direct_interaction: Heart,
  platform_generated: Flame,
  content_based:      FileText,
  engagement_summary: BarChart2,
  location_based:     MapPin,
  marketplace:        ShoppingBag,
  royalties:          DollarSign,
  collaboration:      Users,
  achievements:       Trophy,
  system:             Megaphone,
  platform_admin:     LayoutDashboard,
};

const timezones = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
];

export function NotificationPreferences() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [phoneInput, setPhoneInput] = useState('');
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);

  useEffect(() => {
    if ('Notification' in window) {
      setPushPermission(Notification.permission);
    } else {
      setPushPermission('unsupported');
    }
  }, []);

  const { data: preferences = defaultPreferences, isLoading } = useQuery<NotificationPreferencesType>({
    queryKey: ['/api/notifications/preferences'],
  });

  useEffect(() => {
    if (preferences?.sms?.phoneNumber) {
      setPhoneInput(preferences.sms.phoneNumber);
    }
  }, [preferences?.sms?.phoneNumber]);

  const updatePreferencesMutation = useMutation({
    mutationFn: async (newPreferences: NotificationPreferencesType) => {
      return apiRequest('PUT', '/api/notifications/preferences', newPreferences);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/preferences'] });
      toast({ title: 'Preferences saved', description: 'Your notification preferences have been updated.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to save preferences. Please try again.', variant: 'destructive' });
    },
  });

  const { data: pushKeyData } = useQuery<{ publicKey: string }>({
    queryKey: ['/api/notifications/push-key'],
    retry: false,
  });

  const registerPushSubscription = useMutation({
    mutationFn: async (subscription: PushSubscription) => {
      return apiRequest('POST', '/api/notifications/push-subscriptions', {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')!))),
          auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')!))),
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/preferences'] });
    },
  });

  const verifyPhoneMutation = useMutation({
    mutationFn: async (phone: string) => {
      const res = await apiRequest('POST', '/api/notifications/sms/verify', { phoneNumber: phone });
      return res.json() as Promise<{ success: boolean; message: string; devCode?: string }>;
    },
    onSuccess: (data, variables) => {
      setShowCodeInput(true);
      setCodeInput('');
      setPendingPhone(variables);
      if (data?.devCode) {
        setDevCode(data.devCode);
        toast({ title: 'Demo mode', description: 'No SMS provider configured. Your code is shown below.' });
      } else {
        setDevCode(null);
        toast({ title: 'Code sent', description: 'Check your phone for the 6-digit verification code.' });
      }
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to send verification code. Please try again.', variant: 'destructive' });
    },
  });

  const confirmPhoneMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await apiRequest('POST', '/api/notifications/sms/confirm', {
        code,
        phoneNumber: pendingPhone,
      });
      return res.json() as Promise<{ success: boolean; message: string }>;
    },
    onSuccess: () => {
      setShowCodeInput(false);
      setCodeInput('');
      setDevCode(null);
      setPendingPhone(null);
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/preferences'] });
      toast({ title: 'Phone verified', description: 'SMS notifications are now active on your account.' });
    },
    onError: (error: unknown) => {
      const msg = (error as { message?: string })?.message ?? 'The code you entered is incorrect or expired.';
      toast({ title: 'Verification failed', description: msg, variant: 'destructive' });
    },
  });

  const updatePreference = <K extends keyof NotificationPreferencesType>(
    section: K,
    key: string,
    value: unknown
  ) => {
    const updated = {
      ...preferences,
      [section]: typeof preferences[section] === 'object'
        ? {
            ...preferences[section],
            [key]: value,
          }
        : value,
    };
    updatePreferencesMutation.mutate(updated);
  };

  const updateCategoryPreference = (
    section: 'email' | 'push' | 'sms',
    category: string,
    value: boolean
  ) => {
    const updated = {
      ...preferences,
      [section]: {
        ...preferences[section],
        categories: {
          ...preferences[section].categories,
          [category]: value,
        },
      },
    };
    updatePreferencesMutation.mutate(updated);
  };

  const handleEnablePush = async () => {
    if (pushPermission === 'granted') {
      updatePreference('push', 'enabled', true);
    } else if (pushPermission === 'default') {
      setShowPushPrompt(true);
    } else {
      toast({
        title: 'Push notifications blocked',
        description: 'Please enable notifications in your browser settings.',
        variant: 'destructive',
      });
    }
  };

  const handlePushPermissionGranted = async () => {
    setPushPermission('granted');
    setShowPushPrompt(false);

    try {
      const vapidKey = pushKeyData?.publicKey;
      if (!vapidKey) {
        toast({ title: 'Error', description: 'Push notifications are not configured on the server.', variant: 'destructive' });
        return;
      }

      const padding = '='.repeat((4 - (vapidKey.length % 4)) % 4);
      const base64 = (vapidKey + padding).replace(/-/g, '+').replace(/_/g, '/');
      const applicationServerKey = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      await registerPushSubscription.mutateAsync(subscription);
      updatePreference('push', 'enabled', true);

      toast({
        title: 'Push notifications enabled',
        description: "You'll now receive push notifications from Max Booster.",
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to enable push notifications. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleMuteAll = (muted: boolean) => {
    const updated = {
      ...preferences,
      muteAll: muted,
    };
    updatePreferencesMutation.mutate(updated);
    toast({
      title: muted ? 'All notifications muted' : 'Notifications unmuted',
      description: muted
        ? 'You won\'t receive any notifications until you unmute.'
        : 'You\'ll now receive notifications based on your preferences.',
    });
  };

  const handleQuietHoursChange = (key: string, value: unknown) => {
    const updated = {
      ...preferences,
      quietHours: {
        ...preferences.quietHours,
        [key]: value,
      },
    };
    updatePreferencesMutation.mutate(updated);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className={preferences.muteAll ? 'border-destructive/50 bg-destructive/5' : ''}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {preferences.muteAll ? <BellOff className="h-5 w-5 text-destructive" /> : <Bell className="h-5 w-5" />}
              <CardTitle>Notification Settings</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="mute-all" className="text-sm text-muted-foreground">
                Mute all
              </Label>
              <Switch
                id="mute-all"
                checked={preferences.muteAll}
                onCheckedChange={handleMuteAll}
                data-testid="switch-mute-all"
              />
            </div>
          </div>
          <CardDescription>
            {preferences.muteAll
              ? 'All notifications are currently muted. Toggle off to receive notifications.'
              : 'Control how and when you receive notifications from Max Booster.'}
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Moon className="h-5 w-5" />
            <CardTitle>Quiet Hours</CardTitle>
          </div>
          <CardDescription>
            Set times when you don't want to be disturbed by notifications.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable quiet hours</Label>
              <p className="text-sm text-muted-foreground">
                Pause non-urgent notifications during specific hours
              </p>
            </div>
            <Switch
              checked={preferences.quietHours.enabled}
              onCheckedChange={(checked) => handleQuietHoursChange('enabled', checked)}
              data-testid="switch-quiet-hours"
            />
          </div>

          {preferences.quietHours.enabled && (
            <>
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start time</Label>
                  <Input
                    type="time"
                    value={preferences.quietHours.startTime}
                    onChange={(e) => handleQuietHoursChange('startTime', e.target.value)}
                    data-testid="input-quiet-start"
                  />
                </div>
                <div className="space-y-2">
                  <Label>End time</Label>
                  <Input
                    type="time"
                    value={preferences.quietHours.endTime}
                    onChange={(e) => handleQuietHoursChange('endTime', e.target.value)}
                    data-testid="input-quiet-end"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Timezone</Label>
                <Select
                  value={preferences.quietHours.timezone}
                  onValueChange={(value) => handleQuietHoursChange('timezone', value)}
                >
                  <SelectTrigger data-testid="select-timezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timezones.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Allow urgent notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Urgent notifications will still come through during quiet hours
                  </p>
                </div>
                <Switch
                  checked={preferences.quietHours.allowUrgent}
                  onCheckedChange={(checked) => handleQuietHoursChange('allowUrgent', checked)}
                  data-testid="switch-allow-urgent"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            <CardTitle>In-App Notifications</CardTitle>
          </div>
          <CardDescription>
            Control notifications within the Max Booster application
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable in-app notifications</Label>
              <p className="text-sm text-muted-foreground">
                Show notification badges and alerts within the app
              </p>
            </div>
            <Switch
              checked={preferences.inApp.enabled}
              onCheckedChange={(checked) => updatePreference('inApp', 'enabled', checked)}
              data-testid="switch-inapp-enabled"
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5 flex items-center gap-2">
              {preferences.inApp.sound ? <Volume2 className="h-4 w-4 text-muted-foreground" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
              <div>
                <Label>Notification sounds</Label>
                <p className="text-sm text-muted-foreground">
                  Play a sound when new notifications arrive
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.inApp.sound}
              onCheckedChange={(checked) => updatePreference('inApp', 'sound', checked)}
              disabled={!preferences.inApp.enabled}
              data-testid="switch-inapp-sound"
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Desktop notifications</Label>
              <p className="text-sm text-muted-foreground">
                Show system desktop notifications when the app is in background
              </p>
            </div>
            <Switch
              checked={preferences.inApp.desktop}
              onCheckedChange={(checked) => updatePreference('inApp', 'desktop', checked)}
              disabled={!preferences.inApp.enabled}
              data-testid="switch-inapp-desktop"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            <CardTitle>Push Notifications</CardTitle>
            {preferences.push.enabled && (
              <Badge variant="secondary" className="bg-green-100 text-green-700">
                <Check className="h-3 w-3 mr-1" />
                Enabled
              </Badge>
            )}
          </div>
          <CardDescription>
            Receive notifications even when you're not using Max Booster
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {pushPermission === 'denied' && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Push notifications are blocked. To enable them, update your browser settings and allow notifications for this site.
              </AlertDescription>
            </Alert>
          )}

          {pushPermission === 'unsupported' && (
            <Alert>
              <AlertDescription>
                Push notifications are not supported in this browser.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable push notifications</Label>
              <p className="text-sm text-muted-foreground">
                Get notified on your device when important events occur
              </p>
            </div>
            <Switch
              checked={preferences.push.enabled}
              onCheckedChange={(checked) => {
                if (checked) {
                  handleEnablePush();
                } else {
                  updatePreference('push', 'enabled', false);
                }
              }}
              disabled={pushPermission === 'denied' || pushPermission === 'unsupported'}
              data-testid="switch-push-enabled"
            />
          </div>

          {preferences.push.enabled && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label className="text-sm font-medium">Push notification categories:</Label>
                {(Object.keys(categoryConfig) as NotificationCategory[])
                  .filter((cat) => cat !== 'system' && (cat !== 'platform_admin' || isAdmin))
                  .map((key) => {
                    const Icon = categoryIcons[key];
                    const isAdminCategory = key === 'platform_admin';
                    return (
                      <div key={key} className={`flex items-center justify-between py-1 ${isAdminCategory ? 'rounded-lg bg-orange-50 dark:bg-orange-950/20 px-2 border border-orange-200 dark:border-orange-800/40' : ''}`}>
                        <div className="flex items-center gap-2">
                          <Icon className={`h-4 w-4 ${isAdminCategory ? 'text-orange-500' : 'text-muted-foreground'}`} />
                          <div>
                            <span className={`text-sm ${isAdminCategory ? 'font-medium text-orange-700 dark:text-orange-300' : ''}`}>{categoryConfig[key].label}</span>
                            {isAdminCategory && <span className="ml-2 text-[10px] bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded font-medium">Admin Only</span>}
                            <p className="text-xs text-muted-foreground">{categoryConfig[key].description}</p>
                          </div>
                        </div>
                        <Switch
                          checked={preferences.push.categories[key] ?? true}
                          onCheckedChange={(checked) => updateCategoryPreference('push', key, checked)}
                          data-testid={`switch-push-${key}`}
                        />
                      </div>
                    );
                  })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            <CardTitle>Email Notifications</CardTitle>
          </div>
          <CardDescription>
            Control email notifications and digest frequency
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable email notifications</Label>
              <p className="text-sm text-muted-foreground">
                Receive updates and alerts via email
              </p>
            </div>
            <Switch
              checked={preferences.email.enabled}
              onCheckedChange={(checked) => updatePreference('email', 'enabled', checked)}
              data-testid="switch-email-enabled"
            />
          </div>

          {preferences.email.enabled && (
            <>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Email frequency</Label>
                  <p className="text-sm text-muted-foreground">
                    How often should we send email digests?
                  </p>
                </div>
                <Select
                  value={preferences.email.frequency}
                  onValueChange={(value) => updatePreference('email', 'frequency', value as EmailFrequency)}
                >
                  <SelectTrigger className="w-[140px]" data-testid="select-email-frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instant">Instant</SelectItem>
                    <SelectItem value="daily">Daily digest</SelectItem>
                    <SelectItem value="weekly">Weekly digest</SelectItem>
                    <SelectItem value="never">Never</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />
              <div className="space-y-3">
                <Label className="text-sm font-medium">Email me about:</Label>
                {(Object.keys(categoryConfig) as NotificationCategory[])
                  .filter((cat) => cat !== 'platform_admin' || isAdmin)
                  .map((key) => {
                  const Icon = categoryIcons[key];
                  const isAdminCategory = key === 'platform_admin';
                  return (
                    <div key={key} className={`flex items-center justify-between py-1 ${isAdminCategory ? 'rounded-lg bg-orange-50 dark:bg-orange-950/20 px-2 border border-orange-200 dark:border-orange-800/40' : ''}`}>
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${isAdminCategory ? 'text-orange-500' : 'text-muted-foreground'}`} />
                        <div>
                          <span className={`text-sm ${isAdminCategory ? 'font-medium text-orange-700 dark:text-orange-300' : ''}`}>{categoryConfig[key].label}</span>
                          {isAdminCategory && <span className="ml-2 text-[10px] bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded font-medium">Admin Only</span>}
                          <p className="text-xs text-muted-foreground">{categoryConfig[key].description}</p>
                        </div>
                      </div>
                      <Switch
                        checked={preferences.email.categories[key] ?? false}
                        onCheckedChange={(checked) => updateCategoryPreference('email', key, checked)}
                        data-testid={`switch-email-${key}`}
                      />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            <CardTitle>SMS Notifications</CardTitle>
            <Badge variant="outline" className="text-xs">Critical Only</Badge>
          </div>
          <CardDescription>
            Receive SMS alerts for critical account and payment notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              SMS notifications are reserved for critical alerts only, such as security warnings and large payment receipts.
            </AlertDescription>
          </Alert>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable SMS notifications</Label>
              <p className="text-sm text-muted-foreground">
                Receive critical alerts via SMS
              </p>
            </div>
            <Switch
              checked={preferences.sms.enabled}
              onCheckedChange={(checked) => updatePreference('sms', 'enabled', checked)}
              data-testid="switch-sms-enabled"
            />
          </div>

          {preferences.sms.enabled && (
            <>
              <div className="space-y-2">
                <Label>Phone number</Label>
                <div className="flex gap-2">
                  <Input
                    type="tel"
                    placeholder="+1 (555) 123-4567"
                    value={phoneInput}
                    onChange={(e) => { setPhoneInput(e.target.value); setShowCodeInput(false); setDevCode(null); }}
                    data-testid="input-phone"
                  />
                  <Button
                    variant="outline"
                    onClick={() => verifyPhoneMutation.mutate(phoneInput)}
                    disabled={!phoneInput || verifyPhoneMutation.isPending}
                  >
                    {verifyPhoneMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : preferences.sms.verified ? (
                      <>
                        <Check className="h-4 w-4 mr-1" />
                        Verified
                      </>
                    ) : (
                      'Send Code'
                    )}
                  </Button>
                </div>
              </div>

              {showCodeInput && !preferences.sms.verified && (
                <div className="space-y-2 p-3 rounded-md border bg-muted/30">
                  <Label>Enter verification code</Label>
                  {devCode && (
                    <Alert className="py-2">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        <strong>Demo mode:</strong> No SMS provider configured. Your code is: <strong className="font-mono tracking-widest">{devCode}</strong>
                      </AlertDescription>
                    </Alert>
                  )}
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="6-digit code"
                      value={codeInput}
                      onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, ''))}
                      data-testid="input-sms-code"
                    />
                    <Button
                      onClick={() => confirmPhoneMutation.mutate(codeInput)}
                      disabled={codeInput.length < 6 || confirmPhoneMutation.isPending}
                    >
                      {confirmPhoneMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm'}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Didn't receive it?{' '}
                    <button
                      className="underline text-primary hover:opacity-80"
                      onClick={() => verifyPhoneMutation.mutate(phoneInput)}
                      disabled={verifyPhoneMutation.isPending}
                    >
                      Resend code
                    </button>
                  </p>
                </div>
              )}

              <Separator />
              <div className="space-y-3">
                <Label className="text-sm font-medium">SMS alerts for:</Label>
                <div className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <span className="text-sm">Account & Security</span>
                      <p className="text-xs text-muted-foreground">Suspicious activity, login alerts</p>
                    </div>
                  </div>
                  <Switch
                    checked={preferences.sms.categories.account_security}
                    onCheckedChange={(checked) => updateCategoryPreference('sms', 'account_security', checked)}
                    data-testid="switch-sms-security"
                  />
                </div>
                <div className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <span className="text-sm">Royalties</span>
                      <p className="text-xs text-muted-foreground">Large payment receipts, payout issues</p>
                    </div>
                  </div>
                  <Switch
                    checked={preferences.sms.categories.royalties}
                    onCheckedChange={(checked) => updateCategoryPreference('sms', 'royalties', checked)}
                    data-testid="switch-sms-royalties"
                  />
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Email Delivery History</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="outline" className="w-full" asChild>
            <a href="/settings/email-history" data-testid="view-email-history">
              <Mail className="h-4 w-4 mr-2" />
              View email delivery history
              <ExternalLink className="h-3 w-3 ml-2" />
            </a>
          </Button>
        </CardContent>
      </Card>

      <PushPermissionPrompt
        open={showPushPrompt}
        onOpenChange={setShowPushPrompt}
        onGranted={handlePushPermissionGranted}
        onDenied={() => {
          setShowPushPrompt(false);
          setPushPermission('denied');
        }}
      />

      {updatePreferencesMutation.isPending && (
        <div className="fixed bottom-4 right-4 bg-background border rounded-lg shadow-lg p-3 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Saving preferences...</span>
        </div>
      )}
    </div>
  );
}
