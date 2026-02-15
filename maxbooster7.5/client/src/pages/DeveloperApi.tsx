import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { motion, AnimatePresence } from 'framer-motion';

import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  Code,
  Key,
  Copy,
  Trash2,
  Eye,
  EyeOff,
  Plus,
  Activity,
  BarChart3,
  CheckCircle2,
  AlertCircle,
  Info,
  Zap,
  Clock,
  TrendingUp,
  Shield,
  Terminal,
  Book,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';

interface ApiKey {
  id: string;
  keyName: string;
  apiKeyPreview: string;
  tier: 'free' | 'pro' | 'enterprise';
  rateLimit: number;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  expiresAt: string | null;
}

interface ApiUsage {
  totalRequests: number;
  byEndpoint: Array<{
    endpoint: string;
    requests: number;
    avgResponseTime: number;
  }>;
  byDay: Array<{
    date: string;
    requests: number;
    avgResponseTime: number;
  }>;
}

export default function DeveloperApi() {
  const { user, isLoading: authLoading } = useRequireAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyTier, setNewKeyTier] = useState<'free' | 'pro' | 'enterprise'>('free');
  const [createdApiKey, setCreatedApiKey] = useState<string | null>(null);
  const [selectedKeyForDeletion, setSelectedKeyForDeletion] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<'curl' | 'javascript' | 'python'>(
    'curl'
  );

  // Fetch API keys
  const { data: apiKeysData, isLoading: keysLoading } = useQuery({
    queryKey: ['/api/developer/keys'],
    enabled: !!user,
  });

  // Fetch usage statistics
  const { data: usageData, isLoading: usageLoading } = useQuery({
    queryKey: ['/api/developer/usage'],
    enabled: !!user,
  });

  // Create API key mutation
  const createKeyMutation = useMutation({
    mutationFn: async (data: { keyName: string; tier: 'free' | 'pro' | 'enterprise' }) => {
      const response = await apiRequest('/api/developer/keys/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return response;
    },
    onSuccess: (data) => {
      setCreatedApiKey(data.apiKey.apiKey);
      queryClient.invalidateQueries({ queryKey: ['/api/developer/keys'] });
      toast({
        title: 'API Key Created',
        description: 'Your new API key has been generated successfully.',
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create API key',
        variant: 'destructive',
      });
    },
  });

  // Delete API key mutation
  const deleteKeyMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const response = await apiRequest(`/api/developer/keys/${keyId}`, {
        method: 'DELETE',
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/developer/keys'] });
      queryClient.invalidateQueries({ queryKey: ['/api/developer/usage'] });
      setSelectedKeyForDeletion(null);
      toast({
        title: 'API Key Revoked',
        description: 'The API key has been revoked successfully.',
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to revoke API key',
        variant: 'destructive',
      });
    },
  });

  const handleCreateKey = () => {
    if (!newKeyName.trim()) {
      toast({
        title: 'Error',
        description: 'Please provide a name for your API key',
        variant: 'destructive',
      });
      return;
    }

    createKeyMutation.mutate({
      keyName: newKeyName,
      tier: newKeyTier,
    });
  };

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
    toast({
      title: 'Copied',
      description: 'API key copied to clipboard',
    });
  };

  const apiKeys = apiKeysData?.apiKeys || [];
  const totalRequests = usageData?.totalUsage?.totalRequests || 0;

  const codeExamples = {
    curl: `# Get streaming analytics
curl -X GET \\
  'https://your-domain.com/api/v1/analytics/streams?timeRange=30d' \\
  -H 'Authorization: Bearer YOUR_API_KEY_HERE'

# Get platform summary
curl -X GET \\
  'https://your-domain.com/api/v1/analytics/platforms' \\
  -H 'Authorization: Bearer YOUR_API_KEY_HERE'`,
    javascript: `// Using fetch API
const apiKey = 'YOUR_API_KEY_HERE';

// Get streaming analytics
const response = await fetch('https://your-domain.com/api/v1/analytics/streams?timeRange=30d', {
  headers: {
    'Authorization': \`Bearer \${apiKey}\`
  }
});

const data = await response.json();
logger.info('Stream data:', data);

// Get engagement metrics
const engagement = await fetch('https://your-domain.com/api/v1/analytics/engagement', {
  headers: {
    'Authorization': \`Bearer \${apiKey}\`
  }
}).then(res => res.json());

logger.info('Engagement:', engagement);`,
    python: `import requests

API_KEY = 'YOUR_API_KEY_HERE'
BASE_URL = 'https://your-domain.com/api/v1'

headers = {
    'Authorization': f'Bearer {API_KEY}'
}

# Get streaming analytics
response = requests.get(
    f'{BASE_URL}/analytics/streams',
    headers=headers,
    params={'timeRange': '30d'}
)

data = response.json()
print('Stream data:', data)

# Get demographics
demographics = requests.get(
    f'{BASE_URL}/analytics/demographics',
    headers=headers
).json()

print('Demographics:', demographics)`,
  };

  if (authLoading) {
    return (
      <AppLayout>
        <div className="container mx-auto py-8 px-4">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-32 w-full" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto py-8 px-4 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
            <Terminal className="h-8 w-8" />
            Developer API
          </h1>
          <p className="text-muted-foreground">
            Access your music analytics data programmatically with our powerful REST API
          </p>
        </div>

        <Tabs defaultValue="keys" className="space-y-6">
          <TabsList>
            <TabsTrigger value="keys">
              <Key className="h-4 w-4 mr-2" />
              API Keys
            </TabsTrigger>
            <TabsTrigger value="usage">
              <Activity className="h-4 w-4 mr-2" />
              Usage
            </TabsTrigger>
            <TabsTrigger value="docs">
              <Book className="h-4 w-4 mr-2" />
              Documentation
            </TabsTrigger>
          </TabsList>

          {/* API Keys Tab */}
          <TabsContent value="keys" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Your API Keys</CardTitle>
                    <CardDescription>
                      Create and manage API keys to access the Max Booster Analytics API
                    </CardDescription>
                  </div>
                  <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Create API Key
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Create New API Key</DialogTitle>
                        <DialogDescription>
                          Generate a new API key to access the Analytics API
                        </DialogDescription>
                      </DialogHeader>

                      {createdApiKey ? (
                        <div className="space-y-4">
                          <Alert>
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>
                              <strong>Save this API key securely!</strong> You won't be able to view
                              it again.
                            </AlertDescription>
                          </Alert>

                          <div className="space-y-2">
                            <Label>Your API Key</Label>
                            <div className="flex gap-2">
                              <Input value={createdApiKey} readOnly className="font-mono text-sm" />
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleCopyKey(createdApiKey)}
                              >
                                {copiedKey === createdApiKey ? (
                                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </div>

                          <DialogFooter>
                            <Button
                              onClick={() => {
                                setCreatedApiKey(null);
                                setIsCreateDialogOpen(false);
                                setNewKeyName('');
                              }}
                            >
                              Done
                            </Button>
                          </DialogFooter>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="keyName">Key Name</Label>
                            <Input
                              id="keyName"
                              placeholder="Production API Key"
                              value={newKeyName}
                              onChange={(e) => setNewKeyName(e.target.value)}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="tier">Tier</Label>
                            <Select
                              value={newKeyTier}
                              onValueChange={(value) =>
                                setNewKeyTier(value as 'free' | 'pro' | 'enterprise')
                              }
                            >
                              <SelectTrigger id="tier">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="free">Free (100 req/sec)</SelectItem>
                                <SelectItem value="pro">Pro (1,000 req/sec)</SelectItem>
                                <SelectItem value="enterprise">
                                  Enterprise (5,000 req/sec)
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <DialogFooter>
                            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                              Cancel
                            </Button>
                            <Button
                              onClick={handleCreateKey}
                              disabled={createKeyMutation.isPending}
                            >
                              {createKeyMutation.isPending ? 'Creating...' : 'Create Key'}
                            </Button>
                          </DialogFooter>
                        </div>
                      )}
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {keysLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))}
                  </div>
                ) : apiKeys.length === 0 ? (
                  <div className="text-center py-12">
                    <Key className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">No API keys yet</p>
                    <p className="text-sm text-muted-foreground mb-4">
                      Create your first API key to get started
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {apiKeys.map((key: ApiKey) => (
                      <motion.div
                        key={key.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="border rounded-lg p-4"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold">{key.keyName}</h3>
                              <Badge variant={key.isActive ? 'default' : 'secondary'}>
                                {key.isActive ? 'Active' : 'Inactive'}
                              </Badge>
                              <Badge variant={key.tier === 'free' ? 'outline' : 'default'}>
                                {key.tier === 'enterprise'
                                  ? '🚀 Enterprise'
                                  : key.tier === 'pro'
                                    ? '⚡ Pro'
                                    : '🆓 Free'}
                              </Badge>
                            </div>

                            <div className="space-y-1 text-sm text-muted-foreground">
                              <div className="flex items-center gap-2">
                                <Code className="h-3 w-3" />
                                <code className="font-mono">{key.apiKeyPreview}</code>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="flex items-center gap-1">
                                  <Zap className="h-3 w-3" />
                                  {key.rateLimit} req/sec
                                </div>
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  Created {new Date(key.createdAt).toLocaleDateString()}
                                </div>
                                {key.lastUsedAt && (
                                  <div className="flex items-center gap-1">
                                    <Activity className="h-3 w-3" />
                                    Last used {new Date(key.lastUsedAt).toLocaleDateString()}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSelectedKeyForDeletion(key.id)}
                            disabled={deleteKeyMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Usage Tab */}
          <TabsContent value="usage" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{totalRequests.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground">Last 30 days</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Active Keys</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {apiKeys.filter((k: ApiKey) => k.isActive).length}
                  </div>
                  <p className="text-xs text-muted-foreground">of {apiKeys.length} total keys</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Rate Limit</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">
                    {apiKeys.length > 0 ? Math.max(...apiKeys.map((k: ApiKey) => k.rateLimit)) : 0}
                  </div>
                  <p className="text-xs text-muted-foreground">requests per second</p>
                </CardContent>
              </Card>
            </div>

            {usageData?.byApiKey && usageData.byApiKey.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Usage by API Key</CardTitle>
                  <CardDescription>Request breakdown for each API key</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {usageData.byApiKey.map((keyUsage: unknown) => (
                      <div key={keyUsage.keyId} className="border-b last:border-0 pb-4 last:pb-0">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium">{keyUsage.keyName}</h4>
                          <Badge variant="outline">{keyUsage.tier}</Badge>
                        </div>
                        <div className="text-2xl font-bold mb-1">
                          {keyUsage.totalRequests.toLocaleString()}
                        </div>
                        <p className="text-sm text-muted-foreground">requests</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Documentation Tab */}
          <TabsContent value="docs" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Getting Started</CardTitle>
                <CardDescription>
                  Quick guide to using the Max Booster Analytics API
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">Authentication</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    All API requests require authentication using an API key in the Authorization
                    header:
                  </p>
                  <code className="block bg-muted p-3 rounded text-sm">
                    Authorization: Bearer YOUR_API_KEY_HERE
                  </code>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Base URL</h3>
                  <code className="block bg-muted p-3 rounded text-sm">
                    https://your-domain.com/api/v1
                  </code>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Rate Limits</h3>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    <li>Free tier: 100 requests per second</li>
                    <li>Pro tier: 1,000 requests per second</li>
                    <li>Enterprise tier: 5,000 requests per second</li>
                    <li>Rate limit headers included in all responses</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>API Endpoints</CardTitle>
                    <CardDescription>Available endpoints for analytics data</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    {
                      method: 'GET',
                      path: '/analytics/platforms',
                      description: 'List connected streaming platforms',
                    },
                    {
                      method: 'GET',
                      path: '/analytics/streams/:artistId?',
                      description: 'Get streaming statistics across platforms',
                    },
                    {
                      method: 'GET',
                      path: '/analytics/engagement/:artistId?',
                      description: 'Get engagement metrics (likes, shares, comments)',
                    },
                    {
                      method: 'GET',
                      path: '/analytics/demographics/:artistId?',
                      description: 'Get audience demographics data',
                    },
                    {
                      method: 'GET',
                      path: '/analytics/playlists/:artistId?',
                      description: 'Get playlist placement information',
                    },
                    {
                      method: 'GET',
                      path: '/analytics/tracks/:artistId?',
                      description: 'Get track performance data',
                    },
                    {
                      method: 'GET',
                      path: '/analytics/summary/:artistId?',
                      description: 'Get complete analytics summary',
                    },
                  ].map((endpoint) => (
                    <div key={endpoint.path} className="border-b last:border-0 pb-4 last:pb-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="font-mono">
                          {endpoint.method}
                        </Badge>
                        <code className="text-sm">{endpoint.path}</code>
                      </div>
                      <p className="text-sm text-muted-foreground">{endpoint.description}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Code Examples</CardTitle>
                    <CardDescription>Example requests in different languages</CardDescription>
                  </div>
                  <Select
                    value={selectedLanguage}
                    onValueChange={(value: unknown) => setSelectedLanguage(value)}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="curl">cURL</SelectItem>
                      <SelectItem value="javascript">JavaScript</SelectItem>
                      <SelectItem value="python">Python</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
                    <code className="text-sm">{codeExamples[selectedLanguage]}</code>
                  </pre>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={() => {
                      navigator.clipboard.writeText(codeExamples[selectedLanguage]);
                      toast({ title: 'Copied', description: 'Code copied to clipboard' });
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Delete Confirmation Dialog */}
        <Dialog
          open={!!selectedKeyForDeletion}
          onOpenChange={() => setSelectedKeyForDeletion(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Revoke API Key</DialogTitle>
              <DialogDescription>
                Are you sure you want to revoke this API key? This action cannot be undone and any
                applications using this key will lose access.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedKeyForDeletion(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() =>
                  selectedKeyForDeletion && deleteKeyMutation.mutate(selectedKeyForDeletion)
                }
                disabled={deleteKeyMutation.isPending}
              >
                {deleteKeyMutation.isPending ? 'Revoking...' : 'Revoke Key'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
