import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  Eye,
  EyeOff,
  Download,
  Trash2,
  Shield,
  Globe,
  Users,
  Lock,
  FileText,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Clock,
  Info,
} from 'lucide-react';

interface PrivacySettings {
  profileVisibility: 'public' | 'private' | 'connections';
  showEmail: boolean;
  showLocation: boolean;
  allowMessages: boolean;
  allowSearchIndexing: boolean;
  gdprDataProcessing: boolean;
  gdprMarketing: boolean;
  gdprAnalytics: boolean;
}

interface DataExportStatus {
  status: 'none' | 'pending' | 'ready' | 'expired';
  requestedAt?: string;
  expiresAt?: string;
  downloadUrl?: string;
}

export function PrivacySettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [exportDataOpen, setExportDataOpen] = useState(false);

  const { data: privacySettings, isLoading } = useQuery<PrivacySettings>({
    queryKey: ['/api/auth/privacy-settings'],
  });

  const { data: exportStatus } = useQuery<DataExportStatus>({
    queryKey: ['/api/auth/data-export-status'],
  });

  const updatePrivacyMutation = useMutation({
    mutationFn: async (updates: Partial<PrivacySettings>) => {
      const res = await apiRequest('PUT', '/api/auth/privacy-settings', updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/privacy-settings'] });
      toast({
        title: 'Privacy Settings Updated',
        description: 'Your privacy preferences have been saved.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update privacy settings. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const requestExportMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/auth/request-data-export');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/data-export-status'] });
      toast({
        title: 'Export Requested',
        description: 'Your data export is being prepared. You will receive an email when it is ready.',
      });
      setExportDataOpen(false);
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to request data export. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleToggle = (key: keyof PrivacySettings, value: boolean) => {
    updatePrivacyMutation.mutate({ [key]: value });
  };

  const handleVisibilityChange = (value: 'public' | 'private' | 'connections') => {
    updatePrivacyMutation.mutate({ profileVisibility: value });
  };

  const handleDownloadExport = async () => {
    if (exportStatus?.downloadUrl) {
      window.open(exportStatus.downloadUrl, '_blank');
    } else {
      try {
        const response = await fetch('/api/auth/export-data', {
          credentials: 'include',
        });

        if (!response.ok) throw new Error('Download failed');

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
          title: 'Download Started',
          description: 'Your data export is being downloaded.',
        });
      } catch {
        toast({
          title: 'Error',
          description: 'Failed to download data export.',
          variant: 'destructive',
        });
      }
    }
  };

  const visibilityOptions = [
    { value: 'public', label: 'Public', icon: Globe, description: 'Anyone can view your profile' },
    { value: 'connections', label: 'Connections Only', icon: Users, description: 'Only your connections can view' },
    { value: 'private', label: 'Private', icon: Lock, description: 'Only you can view your profile' },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
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
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            Profile Visibility
          </CardTitle>
          <CardDescription>
            Control who can see your profile and information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label className="text-base font-medium">Who can see your profile?</Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {visibilityOptions.map(option => {
                const Icon = option.icon;
                const isSelected = privacySettings?.profileVisibility === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => handleVisibilityChange(option.value as 'public' | 'private' | 'connections')}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-muted hover:border-primary/50 hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className={`h-5 w-5 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                      <span className="font-medium">{option.label}</span>
                      {isSelected && <CheckCircle className="h-4 w-4 text-primary ml-auto" />}
                    </div>
                    <p className="text-sm text-muted-foreground">{option.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg hover:bg-muted/50 transition-colors">
              <div className="flex items-start gap-3">
                <Eye className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="space-y-1">
                  <Label htmlFor="showEmail" className="text-base font-medium">Show Email Address</Label>
                  <p className="text-sm text-muted-foreground">
                    Display your email on your public profile
                  </p>
                </div>
              </div>
              <Switch
                id="showEmail"
                checked={privacySettings?.showEmail ?? false}
                onCheckedChange={(checked) => handleToggle('showEmail', checked)}
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg hover:bg-muted/50 transition-colors">
              <div className="flex items-start gap-3">
                <Globe className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="space-y-1">
                  <Label htmlFor="showLocation" className="text-base font-medium">Show Location</Label>
                  <p className="text-sm text-muted-foreground">
                    Display your location on your profile
                  </p>
                </div>
              </div>
              <Switch
                id="showLocation"
                checked={privacySettings?.showLocation ?? true}
                onCheckedChange={(checked) => handleToggle('showLocation', checked)}
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg hover:bg-muted/50 transition-colors">
              <div className="flex items-start gap-3">
                <Users className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="space-y-1">
                  <Label htmlFor="allowMessages" className="text-base font-medium">Allow Direct Messages</Label>
                  <p className="text-sm text-muted-foreground">
                    Let other users send you messages
                  </p>
                </div>
              </div>
              <Switch
                id="allowMessages"
                checked={privacySettings?.allowMessages ?? true}
                onCheckedChange={(checked) => handleToggle('allowMessages', checked)}
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg hover:bg-muted/50 transition-colors">
              <div className="flex items-start gap-3">
                <Globe className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="space-y-1">
                  <Label htmlFor="allowSearchIndexing" className="text-base font-medium">Search Engine Indexing</Label>
                  <p className="text-sm text-muted-foreground">
                    Allow search engines to index your profile
                  </p>
                </div>
              </div>
              <Switch
                id="allowSearchIndexing"
                checked={privacySettings?.allowSearchIndexing ?? true}
                onCheckedChange={(checked) => handleToggle('allowSearchIndexing', checked)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Data & Privacy (GDPR)
          </CardTitle>
          <CardDescription>
            Manage your data processing consent and privacy rights
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Your Data Rights</AlertTitle>
            <AlertDescription>
              Under GDPR, you have the right to access, correct, delete, and export your personal data.
              You can manage your consent preferences below.
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-primary mt-0.5" />
                <div className="space-y-1">
                  <Label htmlFor="gdprDataProcessing" className="text-base font-medium">Essential Data Processing</Label>
                  <p className="text-sm text-muted-foreground">
                    Required for account functionality and service delivery
                  </p>
                </div>
              </div>
              <Badge variant="secondary">Required</Badge>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg hover:bg-muted/50 transition-colors">
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="space-y-1">
                  <Label htmlFor="gdprMarketing" className="text-base font-medium">Marketing Communications</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive promotional emails and product updates
                  </p>
                </div>
              </div>
              <Switch
                id="gdprMarketing"
                checked={privacySettings?.gdprMarketing ?? false}
                onCheckedChange={(checked) => handleToggle('gdprMarketing', checked)}
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg hover:bg-muted/50 transition-colors">
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="space-y-1">
                  <Label htmlFor="gdprAnalytics" className="text-base font-medium">Analytics & Personalization</Label>
                  <p className="text-sm text-muted-foreground">
                    Help us improve by sharing usage data and enable personalized recommendations
                  </p>
                </div>
              </div>
              <Switch
                id="gdprAnalytics"
                checked={privacySettings?.gdprAnalytics ?? true}
                onCheckedChange={(checked) => handleToggle('gdprAnalytics', checked)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            Your Data
          </CardTitle>
          <CardDescription>
            Download or delete your personal data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/10">
            <div className="flex items-start gap-3">
              <Download className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium">Download Your Data</p>
                <p className="text-sm text-muted-foreground">
                  Get a copy of all your data including profile, projects, and activity
                </p>
                {exportStatus?.status === 'pending' && exportStatus.requestedAt && (
                  <div className="flex items-center gap-2 mt-2">
                    <Clock className="h-4 w-4 text-yellow-600" />
                    <span className="text-sm text-yellow-600">
                      Export in progress since {new Date(exportStatus.requestedAt).toLocaleDateString()}
                    </span>
                  </div>
                )}
                {exportStatus?.status === 'ready' && (
                  <div className="flex items-center gap-2 mt-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm text-green-600">
                      Export ready for download
                    </span>
                  </div>
                )}
              </div>
            </div>
            {exportStatus?.status === 'ready' ? (
              <Button onClick={handleDownloadExport}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            ) : exportStatus?.status === 'pending' ? (
              <Button disabled>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setExportDataOpen(true)}>
                Request Export
              </Button>
            )}
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg border border-destructive/20 bg-destructive/5">
            <div className="flex items-start gap-3">
              <Trash2 className="h-5 w-5 text-destructive mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium text-destructive">Delete Your Account</p>
                <p className="text-sm text-muted-foreground">
                  Permanently delete your account and all associated data
                </p>
              </div>
            </div>
            <Button variant="destructive" onClick={() => setDeleteAccountOpen(true)}>
              Delete Account
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={exportDataOpen} onOpenChange={setExportDataOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Request Data Export</AlertDialogTitle>
            <AlertDialogDescription>
              We will prepare a complete export of your data including:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Profile information</li>
                <li>Projects and releases</li>
                <li>Analytics and activity history</li>
                <li>Payment history</li>
                <li>Connected accounts</li>
              </ul>
              <p className="mt-3">You will receive an email when your export is ready to download.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => requestExportMutation.mutate()}
              disabled={requestExportMutation.isPending}
            >
              {requestExportMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Requesting...
                </>
              ) : (
                'Request Export'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteAccountOpen} onOpenChange={setDeleteAccountOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Delete Account?</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-3">
                <p>This action is irreversible. Deleting your account will:</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>Permanently delete all your projects and releases</li>
                  <li>Remove all your analytics and history</li>
                  <li>Cancel any active subscriptions</li>
                  <li>Disconnect all linked accounts</li>
                </ul>
                <Alert variant="destructive" className="mt-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Your data cannot be recovered after deletion. Consider exporting your data first.
                  </AlertDescription>
                </Alert>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setDeleteAccountOpen(false);
              }}
            >
              I understand, delete my account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default PrivacySettings;
