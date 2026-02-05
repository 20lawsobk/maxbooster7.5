import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  Shield,
  Bell,
  Mail,
  Smartphone,
  AlertTriangle,
  Lock,
  Globe,
  Key,
  CheckCircle,
  Loader2,
  Info,
} from 'lucide-react';

interface SecurityAlertSettings {
  emailOnNewLogin: boolean;
  emailOnPasswordChange: boolean;
  emailOn2FAChange: boolean;
  emailOnSuspiciousActivity: boolean;
  emailOnNewDevice: boolean;
  pushOnLogin: boolean;
  pushOnSecurityChange: boolean;
  loginAlertFrequency: 'always' | 'new_device' | 'suspicious_only';
}

export function SecurityAlertsSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);

  const { data: settings, isLoading } = useQuery<SecurityAlertSettings>({
    queryKey: ['/api/auth/security-alerts'],
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<SecurityAlertSettings>) => {
      const res = await apiRequest('PUT', '/api/auth/security-alerts', updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/security-alerts'] });
      toast({
        title: 'Security Alerts Updated',
        description: 'Your security notification preferences have been saved.',
      });
      setSaving(null);
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update security alerts. Please try again.',
        variant: 'destructive',
      });
      setSaving(null);
    },
  });

  const handleToggle = (key: keyof SecurityAlertSettings, value: boolean) => {
    setSaving(key);
    updateMutation.mutate({ [key]: value });
  };

  const handleFrequencyChange = (value: 'always' | 'new_device' | 'suspicious_only') => {
    setSaving('loginAlertFrequency');
    updateMutation.mutate({ loginAlertFrequency: value });
  };

  const defaultSettings: SecurityAlertSettings = {
    emailOnNewLogin: true,
    emailOnPasswordChange: true,
    emailOn2FAChange: true,
    emailOnSuspiciousActivity: true,
    emailOnNewDevice: true,
    pushOnLogin: false,
    pushOnSecurityChange: true,
    loginAlertFrequency: 'new_device',
  };

  const currentSettings = settings || defaultSettings;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="h-6 w-40 bg-muted animate-pulse rounded" />
          <div className="h-4 w-60 bg-muted animate-pulse rounded mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Stay Informed About Your Account Security</AlertTitle>
        <AlertDescription>
          Choose how you want to be notified about security-related events on your account.
          We recommend enabling email notifications for critical security events.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Email Notifications
          </CardTitle>
          <CardDescription>
            Receive email alerts for important security events
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-primary/5 border border-primary/20">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="emailOnSuspiciousActivity" className="text-base font-medium">
                  Suspicious Activity Alerts
                </Label>
                <p className="text-sm text-muted-foreground">
                  Get notified immediately when we detect unusual login attempts
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {saving === 'emailOnSuspiciousActivity' && <Loader2 className="h-4 w-4 animate-spin" />}
              <Switch
                id="emailOnSuspiciousActivity"
                checked={currentSettings.emailOnSuspiciousActivity}
                onCheckedChange={(checked) => handleToggle('emailOnSuspiciousActivity', checked)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg hover:bg-muted/50 transition-colors">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Globe className="h-5 w-5 text-blue-600" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="emailOnNewDevice" className="text-base font-medium">
                  New Device Login
                </Label>
                <p className="text-sm text-muted-foreground">
                  Alert when your account is accessed from a new device or location
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {saving === 'emailOnNewDevice' && <Loader2 className="h-4 w-4 animate-spin" />}
              <Switch
                id="emailOnNewDevice"
                checked={currentSettings.emailOnNewDevice}
                onCheckedChange={(checked) => handleToggle('emailOnNewDevice', checked)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg hover:bg-muted/50 transition-colors">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Lock className="h-5 w-5 text-green-600" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="emailOnPasswordChange" className="text-base font-medium">
                  Password Changes
                </Label>
                <p className="text-sm text-muted-foreground">
                  Confirmation email when your password is changed
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {saving === 'emailOnPasswordChange' && <Loader2 className="h-4 w-4 animate-spin" />}
              <Switch
                id="emailOnPasswordChange"
                checked={currentSettings.emailOnPasswordChange}
                onCheckedChange={(checked) => handleToggle('emailOnPasswordChange', checked)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg hover:bg-muted/50 transition-colors">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Key className="h-5 w-5 text-purple-600" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="emailOn2FAChange" className="text-base font-medium">
                  Two-Factor Authentication Changes
                </Label>
                <p className="text-sm text-muted-foreground">
                  Alert when 2FA is enabled or disabled on your account
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {saving === 'emailOn2FAChange' && <Loader2 className="h-4 w-4 animate-spin" />}
              <Switch
                id="emailOn2FAChange"
                checked={currentSettings.emailOn2FAChange}
                onCheckedChange={(checked) => handleToggle('emailOn2FAChange', checked)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg hover:bg-muted/50 transition-colors">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-muted rounded-lg">
                <Bell className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="emailOnNewLogin" className="text-base font-medium">
                  All Login Notifications
                </Label>
                <p className="text-sm text-muted-foreground">
                  Receive an email every time you log in
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {saving === 'emailOnNewLogin' && <Loader2 className="h-4 w-4 animate-spin" />}
              <Switch
                id="emailOnNewLogin"
                checked={currentSettings.emailOnNewLogin}
                onCheckedChange={(checked) => handleToggle('emailOnNewLogin', checked)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            Push Notifications
          </CardTitle>
          <CardDescription>
            Real-time alerts on your mobile device
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg hover:bg-muted/50 transition-colors">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                <Shield className="h-5 w-5 text-orange-600" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pushOnSecurityChange" className="text-base font-medium">
                  Security Changes
                </Label>
                <p className="text-sm text-muted-foreground">
                  Push notifications for password and 2FA changes
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {saving === 'pushOnSecurityChange' && <Loader2 className="h-4 w-4 animate-spin" />}
              <Switch
                id="pushOnSecurityChange"
                checked={currentSettings.pushOnSecurityChange}
                onCheckedChange={(checked) => handleToggle('pushOnSecurityChange', checked)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg hover:bg-muted/50 transition-colors">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-muted rounded-lg">
                <Bell className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pushOnLogin" className="text-base font-medium">
                  Login Alerts
                </Label>
                <p className="text-sm text-muted-foreground">
                  Get push notifications when you log in
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {saving === 'pushOnLogin' && <Loader2 className="h-4 w-4 animate-spin" />}
              <Switch
                id="pushOnLogin"
                checked={currentSettings.pushOnLogin}
                onCheckedChange={(checked) => handleToggle('pushOnLogin', checked)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Alert Frequency
          </CardTitle>
          <CardDescription>
            Control how often you receive login alerts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Label>Login Alert Frequency</Label>
            <Select
              value={currentSettings.loginAlertFrequency}
              onValueChange={handleFrequencyChange}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select frequency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="always">
                  <div className="flex flex-col">
                    <span>Every login</span>
                    <span className="text-xs text-muted-foreground">Get notified for every login attempt</span>
                  </div>
                </SelectItem>
                <SelectItem value="new_device">
                  <div className="flex flex-col">
                    <span>New devices only</span>
                    <span className="text-xs text-muted-foreground">Only when logging in from a new device</span>
                  </div>
                </SelectItem>
                <SelectItem value="suspicious_only">
                  <div className="flex flex-col">
                    <span>Suspicious activity only</span>
                    <span className="text-xs text-muted-foreground">Only when we detect unusual behavior</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              This controls how often you receive login-related notifications. We recommend "New devices only" for a good balance of security and convenience.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default SecurityAlertsSettings;
