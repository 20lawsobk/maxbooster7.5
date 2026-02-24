import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getCsrfHeaders } from '@/lib/queryClient';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  Link as LinkIcon,
  Unlink,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Clock,
  Shield,
  Music,
  Share2,
  Headphones,
  MessageCircle,
} from 'lucide-react';
import { SiSpotify, SiApplemusic, SiSoundcloud, SiYoutube, SiInstagram, SiTiktok, SiFacebook, SiX, SiGoogle, SiThreads } from '@icons-pack/react-simple-icons';

interface ConnectedAccount {
  id: string;
  provider: string;
  providerAccountId: string;
  username?: string;
  displayName?: string;
  email?: string;
  avatarUrl?: string;
  connectedAt: string;
  lastSyncedAt?: string;
  expiresAt?: string;
  status: 'connected' | 'expired' | 'error';
  scopes: string[];
  permissions: {
    id: string;
    label: string;
    description: string;
    enabled: boolean;
    required: boolean;
  }[];
}

const providerIcons: Record<string, React.ReactNode> = {
  spotify: <SiSpotify className="h-5 w-5" color="#1DB954" />,
  apple_music: <SiApplemusic className="h-5 w-5" color="#FA243C" />,
  soundcloud: <SiSoundcloud className="h-5 w-5" color="#FF5500" />,
  youtube: <SiYoutube className="h-5 w-5" color="#FF0000" />,
  instagram: <SiInstagram className="h-5 w-5" color="#E4405F" />,
  tiktok: <SiTiktok className="h-5 w-5" />,
  facebook: <SiFacebook className="h-5 w-5" color="#1877F2" />,
  twitter: <SiX className="h-5 w-5" color="#000000" />,
  google: <SiGoogle className="h-5 w-5" color="#4285F4" />,
  meta: <SiFacebook className="h-5 w-5" color="#0081FB" />,
  threads: <SiThreads className="h-5 w-5" color="#000000" />,
  linkedin: <Share2 className="h-5 w-5" color="#0077B5" />,
  googlebusiness: <SiGoogle className="h-5 w-5" color="#4285F4" />,
};

const providerNames: Record<string, string> = {
  spotify: 'Spotify',
  apple_music: 'Apple Music',
  soundcloud: 'SoundCloud',
  youtube: 'YouTube',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  twitter: 'Twitter/X',
  google: 'Google',
  meta: 'Meta (Facebook + Instagram)',
  threads: 'Threads',
  linkedin: 'LinkedIn',
  googlebusiness: 'Google Business',
};

const providerCategories: Record<string, { icon: React.ReactNode; label: string }> = {
  spotify: { icon: <Music className="h-4 w-4" />, label: 'Streaming' },
  apple_music: { icon: <Music className="h-4 w-4" />, label: 'Streaming' },
  soundcloud: { icon: <Headphones className="h-4 w-4" />, label: 'Streaming' },
  youtube: { icon: <Share2 className="h-4 w-4" />, label: 'Social' },
  instagram: { icon: <Share2 className="h-4 w-4" />, label: 'Social' },
  tiktok: { icon: <Share2 className="h-4 w-4" />, label: 'Social' },
  facebook: { icon: <Share2 className="h-4 w-4" />, label: 'Social' },
  twitter: { icon: <Share2 className="h-4 w-4" />, label: 'Social' },
  google: { icon: <Shield className="h-4 w-4" />, label: 'Authentication' },
  meta: { icon: <Share2 className="h-4 w-4" />, label: 'Social' },
  threads: { icon: <MessageCircle className="h-4 w-4" />, label: 'Social' },
  linkedin: { icon: <Share2 className="h-4 w-4" />, label: 'Social' },
  googlebusiness: { icon: <Shield className="h-4 w-4" />, label: 'Business' },
};

export function ConnectedAccountsManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<ConnectedAccount | null>(null);

  const { data: accounts = [], isLoading } = useQuery<ConnectedAccount[]>({
    queryKey: ['/api/auth/connected-accounts'],
  });

  const disconnectMutation = useMutation({
    mutationFn: async (accountId: string) => {
      await apiRequest('DELETE', `/api/auth/connected-accounts/${accountId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/connected-accounts'] });
      setDisconnectDialogOpen(false);
      setSelectedAccount(null);
      toast({
        title: 'Account Disconnected',
        description: 'The account has been unlinked from your profile.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to disconnect account. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const refreshMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const res = await apiRequest('POST', `/api/auth/connected-accounts/${accountId}/refresh`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/connected-accounts'] });
      toast({
        title: 'Connection Refreshed',
        description: 'The account connection has been renewed.',
      });
    },
    onError: () => {
      toast({
        title: 'Refresh Failed',
        description: 'Could not refresh the connection. You may need to reconnect.',
        variant: 'destructive',
      });
    },
  });

  const updatePermissionsMutation = useMutation({
    mutationFn: async ({ accountId, permissions }: { accountId: string; permissions: Record<string, boolean> }) => {
      const res = await apiRequest('PUT', `/api/auth/connected-accounts/${accountId}/permissions`, permissions);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/connected-accounts'] });
      setPermissionsDialogOpen(false);
      toast({
        title: 'Permissions Updated',
        description: 'Account permissions have been saved.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update permissions. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const openDisconnectDialog = (account: ConnectedAccount) => {
    setSelectedAccount(account);
    setDisconnectDialogOpen(true);
  };

  const openPermissionsDialog = (account: ConnectedAccount) => {
    setSelectedAccount(account);
    setPermissionsDialogOpen(true);
  };

  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);

  const connectAccount = async (provider: string) => {
    setConnectingProvider(provider);
    try {
      const response = await fetch(`/api/social/connect/${provider}`, {
        method: 'POST',
        headers: getCsrfHeaders(),
        credentials: 'include',
      });
      const data = await response.json();
      if (data.authUrl) {
        const top = window.top || window;
        top.location.href = data.authUrl;
      } else if (data.message) {
        toast({
          title: 'Connection Issue',
          description: data.message,
          variant: 'destructive',
        });
        setConnectingProvider(null);
      }
    } catch (error) {
      toast({
        title: 'Connection Failed',
        description: 'Failed to connect to platform. Please try again.',
        variant: 'destructive',
      });
      setConnectingProvider(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'connected':
        return (
          <Badge variant="default" className="bg-green-600">
            <CheckCircle className="h-3 w-3 mr-1" />
            Connected
          </Badge>
        );
      case 'expired':
        return (
          <Badge variant="secondary">
            <Clock className="h-3 w-3 mr-1" />
            Expired
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Error
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const availableProviders = ['meta', 'twitter', 'youtube', 'tiktok', 'threads', 'linkedin', 'spotify', 'soundcloud', 'googlebusiness'];
  const connectedProviders = new Set(accounts.map(a => a.provider));
  const metaConnected = connectedProviders.has('facebook') || connectedProviders.has('instagram');
  const unconnectedProviders = availableProviders.filter(p => {
    if (p === 'meta') return !metaConnected;
    return !connectedProviders.has(p);
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="h-6 w-40 bg-muted animate-pulse rounded" />
          <div className="h-4 w-60 bg-muted animate-pulse rounded mt-2" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const expiredAccounts = accounts.filter(a => a.status === 'expired' || a.status === 'error');

  return (
    <div className="space-y-6">
      {expiredAccounts.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Connection Issues</AlertTitle>
          <AlertDescription>
            {expiredAccounts.length} connected account{expiredAccounts.length > 1 ? 's need' : ' needs'} attention. 
            Please refresh or reconnect them.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5 text-primary" />
            Connected Accounts
          </CardTitle>
          <CardDescription>
            Manage your connected streaming platforms and social media accounts
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {accounts.length === 0 ? (
            <div className="text-center py-8 bg-muted/10 rounded-lg border border-dashed">
              <LinkIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No Connected Accounts</h3>
              <p className="text-muted-foreground mb-4">
                Connect your streaming and social media accounts to sync your music.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className={`flex items-center justify-between p-4 rounded-lg border ${
                    account.status === 'connected'
                      ? 'bg-muted/10'
                      : account.status === 'expired'
                      ? 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-900'
                      : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-background border">
                      {providerIcons[account.provider] || <LinkIcon className="h-5 w-5" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{providerNames[account.provider] || account.provider}</p>
                        {getStatusBadge(account.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {account.displayName || account.username || account.email}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Connected {formatDate(account.connectedAt)}
                        {account.lastSyncedAt && ` • Last synced ${formatDate(account.lastSyncedAt)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {account.status === 'expired' || account.status === 'error' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => refreshMutation.mutate(account.id)}
                        disabled={refreshMutation.isPending}
                      >
                        {refreshMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <RefreshCw className="h-4 w-4 mr-1" />
                            Reconnect
                          </>
                        )}
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openPermissionsDialog(account)}
                        >
                          <Shield className="h-4 w-4 mr-1" />
                          Permissions
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => refreshMutation.mutate(account.id)}
                          disabled={refreshMutation.isPending}
                          title="Refresh connection"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openDisconnectDialog(account)}
                      className="text-destructive hover:text-destructive"
                      title="Disconnect account"
                    >
                      <Unlink className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {unconnectedProviders.length > 0 && (
            <>
              <Separator className="my-6" />
              <div>
                <h4 className="text-sm font-medium mb-3">Available to Connect</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {unconnectedProviders.map((provider) => (
                    <Button
                      key={provider}
                      variant="outline"
                      className="justify-start h-auto py-3"
                      onClick={() => connectAccount(provider)}
                      disabled={connectingProvider === provider}
                    >
                      <div className="flex items-center gap-3">
                        {connectingProvider === provider ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          providerIcons[provider] || <LinkIcon className="h-5 w-5" />
                        )}
                        <div className="text-left">
                          <p className="font-medium">{providerNames[provider]}</p>
                          <p className="text-xs text-muted-foreground">
                            {connectingProvider === provider ? 'Connecting...' : providerCategories[provider]?.label || 'Connect'}
                          </p>
                        </div>
                      </div>
                    </Button>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={permissionsDialogOpen} onOpenChange={setPermissionsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedAccount && providerIcons[selectedAccount.provider]}
              {selectedAccount && providerNames[selectedAccount.provider]} Permissions
            </DialogTitle>
            <DialogDescription>
              Manage what Max Booster can access from this connected account.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {selectedAccount?.permissions.map((permission) => (
              <div
                key={permission.id}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  permission.required ? 'bg-primary/5 border border-primary/20' : 'hover:bg-muted/50'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={permission.id} className="font-medium">
                      {permission.label}
                    </Label>
                    {permission.required && (
                      <Badge variant="secondary" className="text-xs">Required</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{permission.description}</p>
                </div>
                <Switch
                  id={permission.id}
                  checked={permission.enabled}
                  disabled={permission.required}
                  onCheckedChange={(checked) => {
                    if (selectedAccount) {
                      updatePermissionsMutation.mutate({
                        accountId: selectedAccount.id,
                        permissions: { [permission.id]: checked },
                      });
                    }
                  }}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermissionsDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={disconnectDialogOpen} onOpenChange={setDisconnectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {selectedAccount && providerIcons[selectedAccount.provider]}
              Disconnect {selectedAccount && providerNames[selectedAccount.provider]}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the connection to your {selectedAccount && providerNames[selectedAccount.provider]} account. 
              You can reconnect at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedAccount && disconnectMutation.mutate(selectedAccount.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {disconnectMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Unlink className="h-4 w-4 mr-2" />
              )}
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default ConnectedAccountsManager;
