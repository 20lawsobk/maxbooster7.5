import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Store,
  Palette,
  Upload,
  Plus,
  Trash2,
  Edit,
  Eye,
  Save,
  CheckCircle,
  AlertCircle,
  Sparkles,
  DollarSign,
  Users,
  Crown,
  Globe,
  Link,
  Copy,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';

interface StorefrontTemplate {
  id: string;
  name: string;
  description: string;
  previewUrl: string;
  thumbnailUrl: string;
  customizationOptions: any;
  isPremium: boolean;
  isActive: boolean;
}

interface Storefront {
  id: string;
  userId: string;
  name: string;
  slug: string;
  subdomain: string | null;
  customDomain: string | null;
  isSubdomainActive: boolean;
  isCustomDomainActive: boolean;
  templateId: string | null;
  customization: {
    colors?: {
      primary?: string;
      secondary?: string;
      background?: string;
      text?: string;
    };
    fonts?: {
      heading?: string;
      body?: string;
    };
    layout?: {
      headerStyle?: string;
      gridColumns?: number;
    };
    logo?: string;
    banner?: string;
    avatar?: string;
    bio?: string;
    socialLinks?: {
      instagram?: string;
      twitter?: string;
      youtube?: string;
      soundcloud?: string;
    };
  };
  seo: {
    title?: string;
    description?: string;
    keywords?: string[];
    ogImage?: string;
  };
  isActive: boolean;
  isPublic: boolean;
  views: number;
  uniqueVisitors: number;
  createdAt: string;
  updatedAt: string;
}

interface MembershipTier {
  id: string;
  storefrontId: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  interval: 'month' | 'year';
  benefits: any;
  isActive: boolean;
  sortOrder: number;
  maxSubscribers: number | null;
  currentSubscribers: number;
}

export default function StorefrontBuilder() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('overview');
  const [selectedStorefront, setSelectedStorefront] = useState<Storefront | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showTierDialog, setShowTierDialog] = useState(false);
  const [editingTier, setEditingTier] = useState<MembershipTier | null>(null);

  const [createForm, setCreateForm] = useState({
    name: '',
    slug: '',
    templateId: '',
  });

  const [customization, setCustomization] = useState<Storefront['customization']>({
    colors: {
      primary: '#8B5CF6',
      secondary: '#EC4899',
      background: '#FFFFFF',
      text: '#000000',
    },
    fonts: {
      heading: 'Inter',
      body: 'Inter',
    },
    layout: {
      headerStyle: 'centered',
      gridColumns: 3,
    },
    bio: '',
    socialLinks: {},
  });

  const [tierForm, setTierForm] = useState({
    name: '',
    description: '',
    priceCents: 999,
    interval: 'month' as 'month' | 'year',
    benefits: {
      exclusiveContent: false,
      earlyAccess: false,
      discounts: { percentage: 0 },
      customPerks: [] as string[],
    },
    maxSubscribers: null as number | null,
  });

  const { data: storefronts = [], isLoading: storefrontsLoading } = useQuery<Storefront[]>({
    queryKey: ['/api/storefront/my'],
    enabled: !!user,
  });

  const { data: templates = [], isLoading: templatesLoading } = useQuery<StorefrontTemplate[]>({
    queryKey: ['/api/storefront/templates'],
    enabled: !!user,
  });

  const { data: tiers = [], isLoading: tiersLoading } = useQuery<MembershipTier[]>({
    queryKey: ['/api/storefront', selectedStorefront?.id, 'tiers'],
    enabled: !!selectedStorefront,
    queryFn: async () => {
      const res = await fetch(`/api/storefront/${selectedStorefront!.id}/membership-tiers`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch tiers');
      return res.json();
    },
  });

  const createStorefrontMutation = useMutation({
    mutationFn: async (data: typeof createForm) => {
      const response = await apiRequest('POST', '/api/storefront/create', data);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Storefront Created!',
        description: `Your storefront "${data.name}" is now live at /${data.slug}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/storefront/my'] });
      setShowCreateDialog(false);
      setSelectedStorefront(data);
      setCreateForm({ name: '', slug: '', templateId: '' });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Creation Failed',
        description: error.message || 'Failed to create storefront',
        variant: 'destructive',
      });
    },
  });

  const updateStorefrontMutation = useMutation({
    mutationFn: async (data: Partial<Storefront>) => {
      const response = await apiRequest(
        'PUT',
        `/api/storefront/${selectedStorefront!.id}/customize`,
        data
      );
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Storefront Updated!',
        description: 'Your changes have been saved successfully.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/storefront/my'] });
      setSelectedStorefront(data);
    },
    onError: (error: unknown) => {
      toast({
        title: 'Update Failed',
        description: error.message || 'Failed to update storefront',
        variant: 'destructive',
      });
    },
  });

  const createTierMutation = useMutation({
    mutationFn: async (data: typeof tierForm) => {
      const response = await apiRequest(
        'POST',
        `/api/storefront/${selectedStorefront!.id}/membership-tiers`,
        data
      );
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Membership Tier Created!',
        description: 'Your new membership tier is now available.',
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/storefront', selectedStorefront!.id, 'tiers'],
      });
      setShowTierDialog(false);
      setTierForm({
        name: '',
        description: '',
        priceCents: 999,
        interval: 'month',
        benefits: {
          exclusiveContent: false,
          earlyAccess: false,
          discounts: { percentage: 0 },
          customPerks: [],
        },
        maxSubscribers: null,
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Creation Failed',
        description: error.message || 'Failed to create membership tier',
        variant: 'destructive',
      });
    },
  });

  const generateSlug = async (name: string) => {
    try {
      const response = await apiRequest('POST', '/api/storefront/generate-slug', { name });
      const data = await response.json();
      setCreateForm((prev) => ({ ...prev, slug: data.slug }));
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: 'Failed to generate slug',
        variant: 'destructive',
      });
    }
  };

  const handleSaveCustomization = () => {
    if (!selectedStorefront) return;

    updateStorefrontMutation.mutate({
      customization,
    });
  };

  if (!user) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-2xl font-bold mb-4">Please log in to manage your storefront</h2>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold flex items-center gap-2">
            <Store className="w-10 h-10" />
            Storefront Builder
          </h1>
          <p className="text-muted-foreground mt-2">
            Create and customize your professional artist storefront
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} size="lg">
          <Plus className="w-5 h-5 mr-2" />
          Create Storefront
        </Button>
      </div>

      {storefronts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Store className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">No Storefronts Yet</h3>
            <p className="text-muted-foreground mb-6">
              Create your first storefront to start selling your music and building your fanbase
            </p>
            <Button onClick={() => setShowCreateDialog(true)} size="lg">
              <Plus className="w-5 h-5 mr-2" />
              Create Your First Storefront
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {storefronts.map((storefront) => (
              <Card
                key={storefront.id}
                className={`cursor-pointer transition-all ${
                  selectedStorefront?.id === storefront.id
                    ? 'ring-2 ring-primary'
                    : 'hover:shadow-lg'
                }`}
                onClick={() => setSelectedStorefront(storefront)}
              >
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {storefront.name}
                        {storefront.isActive && (
                          <Badge variant="default">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Active
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription className="mt-1">/{storefront.slug}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Views:</span>
                      <span className="font-medium">{storefront.views}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Unique Visitors:</span>
                      <span className="font-medium">{storefront.uniqueVisitors}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button variant="outline" size="sm" className="flex-1">
                      <Eye className="w-4 h-4 mr-1" />
                      Preview
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedStorefront(storefront);
                        setCustomization(storefront.customization);
                      }}
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {selectedStorefront && (
            <Card>
              <CardHeader>
                <CardTitle>Customize {selectedStorefront.name}</CardTitle>
                <CardDescription>
                  Personalize your storefront with colors, branding, and membership tiers
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="grid w-full grid-cols-5">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="domain">Domain</TabsTrigger>
                    <TabsTrigger value="branding">Branding</TabsTrigger>
                    <TabsTrigger value="colors">Colors & Fonts</TabsTrigger>
                    <TabsTrigger value="membership">Membership Tiers</TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="space-y-4 mt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Storefront Name</Label>
                        <Input
                          value={selectedStorefront.name}
                          onChange={(e) =>
                            setSelectedStorefront({
                              ...selectedStorefront,
                              name: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div>
                        <Label>Slug (URL)</Label>
                        <Input value={selectedStorefront.slug} disabled className="bg-muted" />
                        <p className="text-xs text-muted-foreground mt-1">
                          Your storefront URL: /{selectedStorefront.slug}
                        </p>
                      </div>
                    </div>

                    <div>
                      <Label>Bio</Label>
                      <Textarea
                        value={customization.bio || ''}
                        onChange={(e) =>
                          setCustomization({
                            ...customization,
                            bio: e.target.value,
                          })
                        }
                        rows={4}
                        placeholder="Tell your fans about yourself..."
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Instagram</Label>
                        <Input
                          value={customization.socialLinks?.instagram || ''}
                          onChange={(e) =>
                            setCustomization({
                              ...customization,
                              socialLinks: {
                                ...customization.socialLinks,
                                instagram: e.target.value,
                              },
                            })
                          }
                          placeholder="@username"
                        />
                      </div>
                      <div>
                        <Label>Twitter</Label>
                        <Input
                          value={customization.socialLinks?.twitter || ''}
                          onChange={(e) =>
                            setCustomization({
                              ...customization,
                              socialLinks: {
                                ...customization.socialLinks,
                                twitter: e.target.value,
                              },
                            })
                          }
                          placeholder="@username"
                        />
                      </div>
                      <div>
                        <Label>YouTube</Label>
                        <Input
                          value={customization.socialLinks?.youtube || ''}
                          onChange={(e) =>
                            setCustomization({
                              ...customization,
                              socialLinks: {
                                ...customization.socialLinks,
                                youtube: e.target.value,
                              },
                            })
                          }
                          placeholder="Channel URL"
                        />
                      </div>
                      <div>
                        <Label>SoundCloud</Label>
                        <Input
                          value={customization.socialLinks?.soundcloud || ''}
                          onChange={(e) =>
                            setCustomization({
                              ...customization,
                              socialLinks: {
                                ...customization.socialLinks,
                                soundcloud: e.target.value,
                              },
                            })
                          }
                          placeholder="Profile URL"
                        />
                      </div>
                    </div>

                    <Button onClick={handleSaveCustomization} className="w-full">
                      <Save className="w-4 h-4 mr-2" />
                      Save Changes
                    </Button>
                  </TabsContent>

                  <TabsContent value="domain" className="space-y-6 mt-4">
                    <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Globe className="w-5 h-5 text-blue-600" />
                          Custom Subdomain
                        </CardTitle>
                        <CardDescription>
                          Get a memorable URL for your store: yourname.maxbooster.app
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <Label>Subdomain</Label>
                          <div className="flex gap-2 mt-1">
                            <div className="flex-1 flex items-center gap-1">
                              <Input
                                value={selectedStorefront.subdomain || ''}
                                onChange={(e) => {
                                  const value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                                  setSelectedStorefront({
                                    ...selectedStorefront,
                                    subdomain: value || null,
                                  });
                                }}
                                placeholder="your-artist-name"
                                className="flex-1"
                              />
                              <span className="text-muted-foreground whitespace-nowrap">.maxbooster.app</span>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Use 3-30 lowercase letters, numbers, and hyphens
                          </p>
                        </div>

                        {selectedStorefront.subdomain && (
                          <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border">
                            <div className="flex items-center gap-2">
                              <Link className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm font-mono">
                                {selectedStorefront.subdomain}.maxbooster.app
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  navigator.clipboard.writeText(`https://${selectedStorefront.subdomain}.maxbooster.app`);
                                  toast({ title: 'URL copied to clipboard' });
                                }}
                              >
                                <Copy className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => window.open(`/store/${selectedStorefront.slug}`, '_blank')}
                              >
                                <ExternalLink className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <div>
                            <Label>Enable Subdomain</Label>
                            <p className="text-xs text-muted-foreground">
                              Make your store accessible via your custom subdomain
                            </p>
                          </div>
                          <Button
                            variant={selectedStorefront.isSubdomainActive ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => {
                              setSelectedStorefront({
                                ...selectedStorefront,
                                isSubdomainActive: !selectedStorefront.isSubdomainActive,
                              });
                            }}
                            disabled={!selectedStorefront.subdomain}
                          >
                            {selectedStorefront.isSubdomainActive ? (
                              <>
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Active
                              </>
                            ) : (
                              'Enable'
                            )}
                          </Button>
                        </div>

                        <Button 
                          onClick={handleSaveCustomization} 
                          className="w-full"
                          disabled={updateStorefrontMutation.isPending}
                        >
                          {updateStorefrontMutation.isPending ? (
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Save className="w-4 h-4 mr-2" />
                          )}
                          Save Domain Settings
                        </Button>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Store className="w-5 h-5" />
                          Store URLs
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <div>
                            <p className="text-sm font-medium">Default URL</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              /store/{selectedStorefront.slug}
                            </p>
                          </div>
                          <Badge variant="secondary">Always Active</Badge>
                        </div>
                        
                        {selectedStorefront.subdomain && (
                          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                            <div>
                              <p className="text-sm font-medium">Subdomain URL</p>
                              <p className="text-xs text-muted-foreground font-mono">
                                {selectedStorefront.subdomain}.maxbooster.app
                              </p>
                            </div>
                            <Badge variant={selectedStorefront.isSubdomainActive ? 'default' : 'secondary'}>
                              {selectedStorefront.isSubdomainActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="branding" className="space-y-4 mt-4">
                    <div>
                      <Label>Logo</Label>
                      <div className="mt-2 border-2 border-dashed rounded-lg p-6 text-center hover:border-primary transition-colors cursor-pointer">
                        <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          Click to upload logo (PNG, JPG, max 2MB)
                        </p>
                      </div>
                    </div>

                    <div>
                      <Label>Banner Image</Label>
                      <div className="mt-2 border-2 border-dashed rounded-lg p-12 text-center hover:border-primary transition-colors cursor-pointer">
                        <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          Click to upload banner (PNG, JPG, recommended 1920x400px)
                        </p>
                      </div>
                    </div>

                    <div>
                      <Label>Profile Avatar</Label>
                      <div className="mt-2 border-2 border-dashed rounded-lg p-6 text-center hover:border-primary transition-colors cursor-pointer">
                        <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          Click to upload avatar (PNG, JPG, square recommended)
                        </p>
                      </div>
                    </div>

                    <Button onClick={handleSaveCustomization} className="w-full">
                      <Save className="w-4 h-4 mr-2" />
                      Save Branding
                    </Button>
                  </TabsContent>

                  <TabsContent value="colors" className="space-y-4 mt-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <Label>Primary Color</Label>
                        <div className="flex gap-2 mt-2">
                          <Input
                            type="color"
                            value={customization.colors?.primary || '#8B5CF6'}
                            onChange={(e) =>
                              setCustomization({
                                ...customization,
                                colors: {
                                  ...customization.colors,
                                  primary: e.target.value,
                                },
                              })
                            }
                            className="w-16 h-10 p-1 cursor-pointer"
                          />
                          <Input
                            type="text"
                            value={customization.colors?.primary || '#8B5CF6'}
                            onChange={(e) =>
                              setCustomization({
                                ...customization,
                                colors: {
                                  ...customization.colors,
                                  primary: e.target.value,
                                },
                              })
                            }
                            className="flex-1"
                          />
                        </div>
                      </div>

                      <div>
                        <Label>Secondary Color</Label>
                        <div className="flex gap-2 mt-2">
                          <Input
                            type="color"
                            value={customization.colors?.secondary || '#EC4899'}
                            onChange={(e) =>
                              setCustomization({
                                ...customization,
                                colors: {
                                  ...customization.colors,
                                  secondary: e.target.value,
                                },
                              })
                            }
                            className="w-16 h-10 p-1 cursor-pointer"
                          />
                          <Input
                            type="text"
                            value={customization.colors?.secondary || '#EC4899'}
                            onChange={(e) =>
                              setCustomization({
                                ...customization,
                                colors: {
                                  ...customization.colors,
                                  secondary: e.target.value,
                                },
                              })
                            }
                            className="flex-1"
                          />
                        </div>
                      </div>

                      <div>
                        <Label>Background Color</Label>
                        <div className="flex gap-2 mt-2">
                          <Input
                            type="color"
                            value={customization.colors?.background || '#FFFFFF'}
                            onChange={(e) =>
                              setCustomization({
                                ...customization,
                                colors: {
                                  ...customization.colors,
                                  background: e.target.value,
                                },
                              })
                            }
                            className="w-16 h-10 p-1 cursor-pointer"
                          />
                          <Input
                            type="text"
                            value={customization.colors?.background || '#FFFFFF'}
                            onChange={(e) =>
                              setCustomization({
                                ...customization,
                                colors: {
                                  ...customization.colors,
                                  background: e.target.value,
                                },
                              })
                            }
                            className="flex-1"
                          />
                        </div>
                      </div>

                      <div>
                        <Label>Text Color</Label>
                        <div className="flex gap-2 mt-2">
                          <Input
                            type="color"
                            value={customization.colors?.text || '#000000'}
                            onChange={(e) =>
                              setCustomization({
                                ...customization,
                                colors: {
                                  ...customization.colors,
                                  text: e.target.value,
                                },
                              })
                            }
                            className="w-16 h-10 p-1 cursor-pointer"
                          />
                          <Input
                            type="text"
                            value={customization.colors?.text || '#000000'}
                            onChange={(e) =>
                              setCustomization({
                                ...customization,
                                colors: {
                                  ...customization.colors,
                                  text: e.target.value,
                                },
                              })
                            }
                            className="flex-1"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Heading Font</Label>
                        <Select
                          value={customization.fonts?.heading || 'Inter'}
                          onValueChange={(value) =>
                            setCustomization({
                              ...customization,
                              fonts: {
                                ...customization.fonts,
                                heading: value,
                              },
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Inter">Inter</SelectItem>
                            <SelectItem value="Roboto">Roboto</SelectItem>
                            <SelectItem value="Poppins">Poppins</SelectItem>
                            <SelectItem value="Montserrat">Montserrat</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label>Body Font</Label>
                        <Select
                          value={customization.fonts?.body || 'Inter'}
                          onValueChange={(value) =>
                            setCustomization({
                              ...customization,
                              fonts: {
                                ...customization.fonts,
                                body: value,
                              },
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Inter">Inter</SelectItem>
                            <SelectItem value="Roboto">Roboto</SelectItem>
                            <SelectItem value="Poppins">Poppins</SelectItem>
                            <SelectItem value="Montserrat">Montserrat</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <Button onClick={handleSaveCustomization} className="w-full">
                      <Save className="w-4 h-4 mr-2" />
                      Save Colors & Fonts
                    </Button>
                  </TabsContent>

                  <TabsContent value="membership" className="space-y-4 mt-4">
                    <div className="flex justify-between items-center mb-4">
                      <div>
                        <h3 className="text-lg font-semibold">Membership Tiers</h3>
                        <p className="text-sm text-muted-foreground">
                          Create subscription tiers for your fans
                        </p>
                      </div>
                      <Button onClick={() => setShowTierDialog(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Tier
                      </Button>
                    </div>

                    {tiers.length === 0 ? (
                      <Card>
                        <CardContent className="py-8 text-center">
                          <Crown className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                          <p className="text-muted-foreground">
                            No membership tiers yet. Create your first tier to start earning
                            recurring revenue!
                          </p>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {tiers.map((tier) => (
                          <Card key={tier.id}>
                            <CardHeader>
                              <CardTitle className="flex items-center gap-2">
                                <Crown className="w-5 h-5 text-primary" />
                                {tier.name}
                              </CardTitle>
                              <CardDescription>{tier.description}</CardDescription>
                            </CardHeader>
                            <CardContent>
                              <div className="space-y-3">
                                <div className="flex justify-between items-baseline">
                                  <span className="text-3xl font-bold">
                                    ${(tier.priceCents / 100).toFixed(2)}
                                  </span>
                                  <span className="text-muted-foreground">/ {tier.interval}</span>
                                </div>

                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Users className="w-4 h-4" />
                                  <span>
                                    {tier.currentSubscribers}
                                    {tier.maxSubscribers && ` / ${tier.maxSubscribers}`} subscribers
                                  </span>
                                </div>

                                <div className="flex gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="flex-1"
                                    onClick={() => {
                                      setEditingTier(tier);
                                      setShowTierDialog(true);
                                    }}
                                  >
                                    <Edit className="w-4 h-4 mr-1" />
                                    Edit
                                  </Button>
                                  <Button variant="outline" size="sm" className="text-destructive">
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Storefront</DialogTitle>
            <DialogDescription>
              Set up your professional artist storefront in minutes
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label>Storefront Name</Label>
              <Input
                value={createForm.name}
                onChange={(e) => {
                  setCreateForm({ ...createForm, name: e.target.value });
                  if (!createForm.slug) {
                    generateSlug(e.target.value);
                  }
                }}
                placeholder="My Artist Name"
              />
            </div>

            <div>
              <Label>URL Slug</Label>
              <div className="flex gap-2">
                <Input
                  value={createForm.slug}
                  onChange={(e) => setCreateForm({ ...createForm, slug: e.target.value })}
                  placeholder="my-artist-name"
                />
                <Button
                  variant="outline"
                  onClick={() => generateSlug(createForm.name)}
                  disabled={!createForm.name}
                >
                  Generate
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Your storefront will be at: /{createForm.slug}
              </p>
            </div>

            <div>
              <Label>Template (Optional)</Label>
              <Select
                value={createForm.templateId}
                onValueChange={(value) => setCreateForm({ ...createForm, templateId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                      {template.isPremium && ' (Premium)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createStorefrontMutation.mutate(createForm)}
              disabled={!createForm.name || !createForm.slug}
            >
              Create Storefront
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showTierDialog} onOpenChange={setShowTierDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTier ? 'Edit' : 'Create'} Membership Tier</DialogTitle>
            <DialogDescription>
              Set up recurring revenue with subscription tiers for your fans
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label>Tier Name</Label>
              <Input
                value={tierForm.name}
                onChange={(e) => setTierForm({ ...tierForm, name: e.target.value })}
                placeholder="Fan Club"
              />
            </div>

            <div>
              <Label>Description</Label>
              <Textarea
                value={tierForm.description}
                onChange={(e) => setTierForm({ ...tierForm, description: e.target.value })}
                rows={3}
                placeholder="What members get..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Price (USD)</Label>
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                  <Input
                    type="number"
                    value={tierForm.priceCents / 100}
                    onChange={(e) =>
                      setTierForm({
                        ...tierForm,
                        priceCents: Math.round(parseFloat(e.target.value) * 100),
                      })
                    }
                    min="1"
                    step="0.01"
                  />
                </div>
              </div>

              <div>
                <Label>Billing Interval</Label>
                <Select
                  value={tierForm.interval}
                  onValueChange={(value: 'month' | 'year') =>
                    setTierForm({ ...tierForm, interval: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="month">Monthly</SelectItem>
                    <SelectItem value="year">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Max Subscribers (Optional)</Label>
              <Input
                type="number"
                value={tierForm.maxSubscribers || ''}
                onChange={(e) =>
                  setTierForm({
                    ...tierForm,
                    maxSubscribers: e.target.value ? parseInt(e.target.value) : null,
                  })
                }
                placeholder="Unlimited"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTierDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createTierMutation.mutate(tierForm)}
              disabled={!tierForm.name || tierForm.priceCents < 100}
            >
              {editingTier ? 'Update' : 'Create'} Tier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
