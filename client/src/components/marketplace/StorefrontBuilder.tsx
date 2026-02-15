import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest, uploadWithProgress } from '@/lib/queryClient';
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
import { useOnboardingProgress } from '@/hooks/useOnboardingProgress';
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
  ExternalLink,
  Music,
  Instagram,
  Twitter,
  Youtube,
} from 'lucide-react';
import { BogoPromotionsManager } from './BogoPromotionsManager';

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
  const { trackBeatStoreSetup } = useOnboardingProgress();

  const [activeTab, setActiveTab] = useState('overview');
  const [selectedStorefront, setSelectedStorefront] = useState<Storefront | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showTierDialog, setShowTierDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [storefrontToDelete, setStorefrontToDelete] = useState<Storefront | null>(null);
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

  const [uploadingAsset, setUploadingAsset] = useState<string | null>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleAssetUpload = async (file: File, assetType: 'logo' | 'banner' | 'avatar') => {
    if (!file) return;
    
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      toast({
        title: 'File Too Large',
        description: 'Maximum file size is 5MB',
        variant: 'destructive',
      });
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: 'Invalid File Type',
        description: 'Please upload a JPEG, PNG, GIF, or WebP image',
        variant: 'destructive',
      });
      return;
    }

    setUploadingAsset(assetType);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('assetType', assetType);

      const result = await uploadWithProgress('/api/storefront/upload-asset', formData, {}) as any;

      if (result.error) {
        throw new Error(result.error);
      }

      setCustomization({
        ...customization,
        [assetType]: result.url,
      });

      toast({
        title: 'Upload Successful',
        description: `Your ${assetType} has been uploaded`,
      });
    } catch (error) {
      toast({
        title: 'Upload Failed',
        description: error instanceof Error ? error.message : 'Failed to upload file',
        variant: 'destructive',
      });
    } finally {
      setUploadingAsset(null);
    }
  };

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
      trackBeatStoreSetup();
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

  const deleteStorefrontMutation = useMutation({
    mutationFn: async (storefrontId: string) => {
      const response = await apiRequest('DELETE', `/api/storefront/${storefrontId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Storefront Deleted',
        description: 'The storefront has been permanently removed.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/storefront/my'] });
      if (selectedStorefront?.id === storefrontToDelete?.id) {
        setSelectedStorefront(null);
      }
      setShowDeleteDialog(false);
      setStorefrontToDelete(null);
    },
    onError: (error: unknown) => {
      toast({
        title: 'Delete Failed',
        description: error.message || 'Failed to delete storefront',
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
                onClick={() => {
                  setSelectedStorefront(storefront);
                  if (storefront.customization) {
                    setCustomization({
                      colors: {
                        primary: storefront.customization.colors?.primary || '#8B5CF6',
                        secondary: storefront.customization.colors?.secondary || '#EC4899',
                        background: storefront.customization.colors?.background || '#FFFFFF',
                        text: storefront.customization.colors?.text || '#000000',
                      },
                      fonts: {
                        heading: storefront.customization.fonts?.heading || 'Inter',
                        body: storefront.customization.fonts?.body || 'Inter',
                      },
                      layout: {
                        headerStyle: storefront.customization.layout?.headerStyle || 'centered',
                        gridColumns: storefront.customization.layout?.gridColumns || 3,
                      },
                      logo: storefront.customization.logo || undefined,
                      banner: storefront.customization.banner || undefined,
                      avatar: storefront.customization.avatar || undefined,
                      bio: storefront.customization.bio || '',
                      socialLinks: storefront.customization.socialLinks || {},
                    });
                  }
                }}
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
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(`/store/${storefront.slug}`, '_blank');
                      }}
                    >
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
                        setCustomization(storefront.customization || {
                          bio: '',
                          socialLinks: {},
                          theme: 'dark',
                          accentColor: '#6366f1',
                          layout: 'grid',
                          showStats: true,
                          featuredBeatIds: [],
                        });
                        setActiveTab('overview');
                      }}
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        setStorefrontToDelete(storefront);
                        setShowDeleteDialog(true);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {selectedStorefront && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle>Customize {selectedStorefront.name}</CardTitle>
                      <CardDescription>
                        Personalize your storefront with colors, branding, and membership tiers
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(`/store/${selectedStorefront.slug}`, '_blank')}
                      >
                        <ExternalLink className="w-4 h-4 mr-1" />
                        Open in New Tab
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="grid w-full grid-cols-5">
                      <TabsTrigger value="overview">Overview</TabsTrigger>
                      <TabsTrigger value="branding">Branding</TabsTrigger>
                      <TabsTrigger value="colors">Colors & Fonts</TabsTrigger>
                      <TabsTrigger value="membership">Memberships</TabsTrigger>
                      <TabsTrigger value="promotions">Promotions</TabsTrigger>
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

                  <TabsContent value="branding" className="space-y-4 mt-4">
                    <div>
                      <Label>Logo</Label>
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleAssetUpload(file, 'logo');
                        }}
                      />
                      <div 
                        className="mt-2 border-2 border-dashed rounded-lg p-6 text-center hover:border-primary transition-colors cursor-pointer relative overflow-hidden"
                        onClick={() => logoInputRef.current?.click()}
                      >
                        {customization.logo ? (
                          <div className="relative">
                            <img src={customization.logo} alt="Logo" className="max-h-20 mx-auto object-contain" />
                            <p className="text-xs text-muted-foreground mt-2">Click to change</p>
                          </div>
                        ) : (
                          <>
                            {uploadingAsset === 'logo' ? (
                              <div className="animate-pulse">Uploading...</div>
                            ) : (
                              <>
                                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                                <p className="text-sm text-muted-foreground">
                                  Click to upload logo (PNG, JPG, max 5MB)
                                </p>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    <div>
                      <Label>Banner Image</Label>
                      <input
                        ref={bannerInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleAssetUpload(file, 'banner');
                        }}
                      />
                      <div 
                        className="mt-2 border-2 border-dashed rounded-lg text-center hover:border-primary transition-colors cursor-pointer relative overflow-hidden"
                        onClick={() => bannerInputRef.current?.click()}
                      >
                        {customization.banner ? (
                          <div className="relative">
                            <img src={customization.banner} alt="Banner" className="w-full h-32 object-cover" />
                            <p className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-white bg-black/50 px-2 py-1 rounded">Click to change</p>
                          </div>
                        ) : (
                          <div className="p-12">
                            {uploadingAsset === 'banner' ? (
                              <div className="animate-pulse">Uploading...</div>
                            ) : (
                              <>
                                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                                <p className="text-sm text-muted-foreground">
                                  Click to upload banner (PNG, JPG, recommended 1920x400px)
                                </p>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <Label>Profile Avatar</Label>
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleAssetUpload(file, 'avatar');
                        }}
                      />
                      <div 
                        className="mt-2 border-2 border-dashed rounded-lg p-6 text-center hover:border-primary transition-colors cursor-pointer relative overflow-hidden"
                        onClick={() => avatarInputRef.current?.click()}
                      >
                        {customization.avatar ? (
                          <div className="relative">
                            <img src={customization.avatar} alt="Avatar" className="w-20 h-20 mx-auto rounded-full object-cover" />
                            <p className="text-xs text-muted-foreground mt-2">Click to change</p>
                          </div>
                        ) : (
                          <>
                            {uploadingAsset === 'avatar' ? (
                              <div className="animate-pulse">Uploading...</div>
                            ) : (
                              <>
                                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                                <p className="text-sm text-muted-foreground">
                                  Click to upload avatar (PNG, JPG, square recommended)
                                </p>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    <Button onClick={handleSaveCustomization} className="w-full">
                      <Save className="w-4 h-4 mr-2" />
                      Save Branding
                    </Button>
                  </TabsContent>

                  <TabsContent value="colors" className="space-y-4 mt-4">
                    <div className="mb-6">
                      <Label className="text-base font-semibold mb-3 block">Theme Presets</Label>
                      <p className="text-sm text-muted-foreground mb-4">Quick-start with a pre-designed theme</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {[
                          { name: 'Midnight Purple', primary: '#8B5CF6', secondary: '#EC4899', background: '#0F172A', text: '#F8FAFC' },
                          { name: 'Ocean Blue', primary: '#3B82F6', secondary: '#06B6D4', background: '#0C1929', text: '#E2E8F0' },
                          { name: 'Sunset Orange', primary: '#F97316', secondary: '#EAB308', background: '#1C1917', text: '#FAFAF9' },
                          { name: 'Forest Green', primary: '#22C55E', secondary: '#10B981', background: '#0D1B12', text: '#ECFDF5' },
                          { name: 'Rose Gold', primary: '#F43F5E', secondary: '#FB7185', background: '#18181B', text: '#FAFAFA' },
                          { name: 'Classic Light', primary: '#1E293B', secondary: '#64748B', background: '#FFFFFF', text: '#0F172A' },
                          { name: 'Neon Cyber', primary: '#00FF88', secondary: '#FF00FF', background: '#0A0A0A', text: '#00FF88' },
                          { name: 'Warm Earth', primary: '#D97706', secondary: '#92400E', background: '#1C1917', text: '#FEF3C7' },
                        ].map((theme) => {
                          const isActive =
                            customization.colors?.primary === theme.primary &&
                            customization.colors?.secondary === theme.secondary;
                          return (
                          <button
                            key={theme.name}
                            onClick={() => {
                              const newCustomization = {
                                ...customization,
                                colors: {
                                  primary: theme.primary,
                                  secondary: theme.secondary,
                                  background: theme.background,
                                  text: theme.text,
                                },
                              };
                              setCustomization(newCustomization);
                              if (selectedStorefront) {
                                updateStorefrontMutation.mutate({ customization: newCustomization });
                              }
                            }}
                            className={`p-3 rounded-lg border-2 transition-all text-left group ${isActive ? 'border-primary ring-2 ring-primary/30' : 'border-transparent hover:border-primary'}`}
                            style={{ backgroundColor: theme.background }}
                          >
                            <div className="flex gap-1 mb-2">
                              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: theme.primary }} />
                              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: theme.secondary }} />
                            </div>
                            <span className="text-xs font-medium" style={{ color: theme.text }}>{theme.name}</span>
                          </button>
                          );
                        })}
                      </div>
                    </div>

                    <Label className="text-base font-semibold block">Custom Colors</Label>
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

                  <TabsContent value="promotions" className="space-y-4 mt-4">
                    <BogoPromotionsManager storefrontId={selectedStorefront.id} />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

              <Card className="sticky top-4">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Eye className="w-5 h-5" />
                    Live Preview
                  </CardTitle>
                  <CardDescription>
                    Changes update automatically as you customize
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div 
                    className="rounded-lg overflow-hidden border"
                    style={{
                      backgroundColor: customization.colors?.background || '#FFFFFF',
                      color: customization.colors?.text || '#000000',
                    }}
                  >
                    {customization.banner && (
                      <div
                        className="w-full h-24 bg-cover bg-center"
                        style={{ backgroundImage: `url(${customization.banner})` }}
                      />
                    )}
                    {!customization.banner && (
                      <div 
                        className="w-full h-24 flex items-center justify-center"
                        style={{ 
                          background: `linear-gradient(135deg, ${customization.colors?.primary || '#8B5CF6'} 0%, ${customization.colors?.secondary || '#EC4899'} 100%)` 
                        }}
                      >
                        <span className="text-white/60 text-sm">Banner Area</span>
                      </div>
                    )}
                    
                    <div className="p-4">
                      <div className="flex items-start gap-3 mb-4">
                        {customization.avatar ? (
                          <img 
                            src={customization.avatar} 
                            alt="Avatar" 
                            className="w-12 h-12 rounded-full object-cover border-2 border-white shadow"
                          />
                        ) : (
                          <div 
                            className="w-12 h-12 rounded-full flex items-center justify-center border-2 border-white shadow"
                            style={{ 
                              background: `linear-gradient(135deg, ${customization.colors?.primary || '#8B5CF6'} 0%, ${customization.colors?.secondary || '#EC4899'} 100%)` 
                            }}
                          >
                            <Music className="w-6 h-6 text-white" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 
                            className="font-bold text-lg truncate"
                            style={{ fontFamily: customization.fonts?.heading || 'Inter' }}
                          >
                            {selectedStorefront.name}
                          </h3>
                          <p 
                            className="text-sm opacity-70 line-clamp-2"
                            style={{ fontFamily: customization.fonts?.body || 'Inter' }}
                          >
                            {customization.bio || 'Your bio will appear here...'}
                          </p>
                        </div>
                      </div>
                      
                      {(customization.socialLinks?.instagram || 
                        customization.socialLinks?.twitter || 
                        customization.socialLinks?.youtube) && (
                        <div className="flex gap-2 mb-4">
                          {customization.socialLinks?.instagram && (
                            <div 
                              className="w-8 h-8 rounded-full flex items-center justify-center"
                              style={{ backgroundColor: customization.colors?.primary || '#8B5CF6' }}
                            >
                              <Instagram className="w-4 h-4 text-white" />
                            </div>
                          )}
                          {customization.socialLinks?.twitter && (
                            <div 
                              className="w-8 h-8 rounded-full flex items-center justify-center"
                              style={{ backgroundColor: customization.colors?.primary || '#8B5CF6' }}
                            >
                              <Twitter className="w-4 h-4 text-white" />
                            </div>
                          )}
                          {customization.socialLinks?.youtube && (
                            <div 
                              className="w-8 h-8 rounded-full flex items-center justify-center"
                              style={{ backgroundColor: customization.colors?.primary || '#8B5CF6' }}
                            >
                              <Youtube className="w-4 h-4 text-white" />
                            </div>
                          )}
                        </div>
                      )}
                      
                      <div className="grid grid-cols-3 gap-2">
                        {[1, 2, 3].map((i) => (
                          <div 
                            key={i}
                            className="aspect-square rounded-lg flex items-center justify-center"
                            style={{ 
                              backgroundColor: customization.colors?.primary ? `${customization.colors.primary}20` : '#8B5CF620' 
                            }}
                          >
                            <Music 
                              className="w-6 h-6"
                              style={{ color: customization.colors?.primary || '#8B5CF6' }}
                            />
                          </div>
                        ))}
                      </div>
                      
                      <div className="mt-4 pt-4 border-t border-current/10">
                        <p className="text-xs text-center opacity-50">
                          Preview of your storefront at /{selectedStorefront.slug}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-4 flex gap-2">
                    <Button 
                      className="flex-1"
                      onClick={() => window.open(`/store/${selectedStorefront.slug}`, '_blank')}
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      View Full Storefront
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}

      <Dialog open={showDeleteDialog} onOpenChange={(open) => {
        setShowDeleteDialog(open);
        if (!open) setStorefrontToDelete(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Storefront</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{storefrontToDelete?.name}"? This will permanently remove the storefront, all its customization, and associated data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowDeleteDialog(false);
              setStorefrontToDelete(null);
            }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (storefrontToDelete) {
                  deleteStorefrontMutation.mutate(storefrontToDelete.id);
                }
              }}
              disabled={deleteStorefrontMutation.isPending}
            >
              {deleteStorefrontMutation.isPending ? 'Deleting...' : 'Delete Storefront'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
