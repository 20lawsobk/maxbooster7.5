import { useState, useRef, useEffect } from 'react';
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
  Globe,
  EyeOff,
  Video,
  Megaphone,
  Shuffle,
} from 'lucide-react';
import { BogoPromotionsManager } from './BogoPromotionsManager';
import { DNSZoneEditor } from './DNSZoneEditor';

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
  // Tracks whether the user has manually typed in the URL field.
  // While false, the slug stays in sync with the title (Replit behaviour).
  const [slugUserEdited, setSlugUserEdited] = useState(false);

  const [subdomainForm, setSubdomainForm] = useState({
    subdomain: '',
    isSubdomainActive: false,
  });
  const [subdomainAvailable, setSubdomainAvailable] = useState<boolean | null>(null);
  const [checkingSubdomain, setCheckingSubdomain] = useState(false);

  const [customDomainForm, setCustomDomainForm] = useState({
    customDomain: '',
    isCustomDomainActive: false,
  });
  const [customDomainAvailable, setCustomDomainAvailable] = useState<boolean | null>(null);
  const [customDomainValid, setCustomDomainValid] = useState<boolean | null>(null);
  const [checkingCustomDomain, setCheckingCustomDomain] = useState(false);
  const [verifyingDomain, setVerifyingDomain] = useState(false);
  const [domainVerificationResult, setDomainVerificationResult] = useState<{
    verified: boolean;
    cnameFound: boolean;
    aRecordFound: boolean;
    cnameTarget?: string;
    aRecords?: string[];
    error?: string;
  } | null>(null);

  const [dnsRegistrar, setDnsRegistrar] = useState<'godaddy' | 'cloudflare' | 'namecheap' | 'other'>('godaddy');
  const [godaddyApiKey, setGodaddyApiKey] = useState('');
  const [godaddyApiSecret, setGodaddyApiSecret] = useState('');
  const [godaddyAutoConfiguring, setGodaddyAutoConfiguring] = useState(false);
  const [godaddyConfigResult, setGodaddyConfigResult] = useState<{ success: boolean; message: string; record?: any } | null>(null);
  const [dnsLookupResult, setDnsLookupResult] = useState<{
    domain: string;
    records: Array<{ type: string; name: string; value: string; ttl?: number; priority?: number }>;
    byType: Record<string, any[]>;
    totalRecords: number;
    pointsToMaxbooster: boolean;
  } | null>(null);
  const [loadingDnsLookup, setLoadingDnsLookup] = useState(false);
  const [propagationResult, setPropagationResult] = useState<{
    domain: string;
    resolvers: Array<{ resolver: string; ip: string; location: string; resolved: boolean; pointsToMaxbooster: boolean; cnames: string[]; aRecords: string[] }>;
    summary: { total: number; propagated: number; verified: number; propagationPct: number; verifiedPct: number };
  } | null>(null);
  const [checkingPropagation, setCheckingPropagation] = useState(false);

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
  const [uploadProgress, setUploadProgress] = useState<number>(0);

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
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('assetType', assetType);

      const result = await uploadWithProgress('/api/storefront/upload-asset', formData, {
        onProgress: (percent: number) => setUploadProgress(percent),
      }) as any;

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
      setUploadProgress(0);
    }
  };

  const UploadProgressBar = ({ label }: { label: string }) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Uploading {label}...</span>
        <span className="font-medium">{Math.round(uploadProgress)}%</span>
      </div>
      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-300"
          style={{ width: `${uploadProgress}%` }}
        />
      </div>
    </div>
  );

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
        description: `Your storefront "${data.name}" has been created! Set up a custom URL in the settings to get yourname.maxbooster.app`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/storefront/my'] });
      setShowCreateDialog(false);
      setSelectedStorefront(data);
      setSubdomainForm({ subdomain: '', isSubdomainActive: false });
      setSubdomainAvailable(null);
      setCreateForm({ name: '', slug: '', templateId: '' });
      setSlugUserEdited(false);
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

  const publishStorefrontMutation = useMutation({
    mutationFn: async ({ storefrontId, isPublished }: { storefrontId: string; isPublished: boolean }) => {
      const response = await apiRequest('PATCH', `/api/storefront/${storefrontId}/publish`, { isPublished });
      return response.json();
    },
    onSuccess: (data: any, variables) => {
      toast({
        title: variables.isPublished ? 'Storefront Published' : 'Storefront Unpublished',
        description: variables.isPublished
          ? 'Your storefront is now visible in the marketplace.'
          : 'Your storefront has been hidden from the marketplace.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/storefront/my'] });
      if (selectedStorefront?.id === variables.storefrontId) {
        setSelectedStorefront({ ...selectedStorefront, isPublic: variables.isPublished });
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Publish Failed',
        description: error.message || 'Failed to update publish status',
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

  const [showCampaignResult, setShowCampaignResult] = useState<any>(null);

  const promoteCampaignMutation = useMutation({
    mutationFn: async (storefrontId: string) => {
      const response = await apiRequest('POST', '/api/social/veo-campaign/promote-storefront', { storefrontId });
      return response.json();
    },
    onSuccess: (data) => {
      setShowCampaignResult(data);
      toast({
        title: 'Campaign Generated!',
        description: `Video campaign created with ${data.campaign?.videos?.length || 0} platform videos.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Campaign Failed',
        description: error.message || 'Failed to generate video campaign',
        variant: 'destructive',
      });
    },
  });

  const updateSubdomainMutation = useMutation({
    mutationFn: async ({ storefrontId, subdomain, isSubdomainActive }: { storefrontId: string; subdomain: string; isSubdomainActive: boolean }) => {
      const response = await apiRequest('PUT', `/api/storefront/${storefrontId}/subdomain`, { subdomain, isSubdomainActive });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Custom URL Updated',
        description: 'Your storefront custom URL has been saved.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/storefront/my'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Update Failed',
        description: error.message || 'Failed to update custom URL',
        variant: 'destructive',
      });
    },
  });

  const checkSubdomainAvailability = async (subdomain: string) => {
    if (!subdomain || subdomain.length < 3) {
      setSubdomainAvailable(null);
      return;
    }
    setCheckingSubdomain(true);
    try {
      const response = await apiRequest('GET', `/api/storefront/check-subdomain/${subdomain}`);
      const data = await response.json();
      setSubdomainAvailable(data.available);
    } catch {
      setSubdomainAvailable(null);
    } finally {
      setCheckingSubdomain(false);
    }
  };

  const updateCustomDomainMutation = useMutation({
    mutationFn: async ({ storefrontId, customDomain, isCustomDomainActive }: { storefrontId: string; customDomain: string | null; isCustomDomainActive: boolean }) => {
      const response = await apiRequest('PUT', `/api/storefront/${storefrontId}/custom-domain`, { customDomain, isCustomDomainActive });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Custom Domain Saved',
        description: 'Your custom domain has been saved. Verify DNS to activate it.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/storefront/my'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Save Failed',
        description: error.message || 'Failed to save custom domain',
        variant: 'destructive',
      });
    },
  });

  const checkCustomDomainAvailability = async (domain: string) => {
    if (!domain || domain.length < 4) {
      setCustomDomainAvailable(null);
      setCustomDomainValid(null);
      return;
    }
    setCheckingCustomDomain(true);
    try {
      const excludeId = selectedStorefront?.id ?? '';
      const response = await apiRequest('GET', `/api/storefront/check-domain?domain=${encodeURIComponent(domain)}&excludeId=${excludeId}`);
      const data = await response.json();
      setCustomDomainValid(data.valid);
      setCustomDomainAvailable(data.available);
    } catch {
      setCustomDomainAvailable(null);
      setCustomDomainValid(null);
    } finally {
      setCheckingCustomDomain(false);
    }
  };

  const verifyCustomDomain = async () => {
    if (!selectedStorefront) return;
    setVerifyingDomain(true);
    setDomainVerificationResult(null);
    try {
      const response = await apiRequest('POST', `/api/storefront/${selectedStorefront.id}/verify-domain`, {});
      const data = await response.json();
      setDomainVerificationResult(data);
      if (data.verified) {
        toast({ title: 'Domain Verified', description: 'DNS is configured correctly. Your custom domain is now active.' });
        queryClient.invalidateQueries({ queryKey: ['/api/storefront/my'] });
        setCustomDomainForm(prev => ({ ...prev, isCustomDomainActive: true }));
      } else {
        toast({
          title: 'DNS Not Ready',
          description: 'DNS records not detected yet. Changes can take up to 48 hours to propagate.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({ title: 'Verification Failed', description: 'Could not check DNS. Try again shortly.', variant: 'destructive' });
    } finally {
      setVerifyingDomain(false);
    }
  };

  const runDnsLookup = async (domain: string) => {
    if (!domain || domain.length < 4) return;
    setLoadingDnsLookup(true);
    setDnsLookupResult(null);
    try {
      const response = await apiRequest('GET', `/api/storefront/dns/lookup?domain=${encodeURIComponent(domain)}`);
      const data = await response.json();
      setDnsLookupResult(data);
    } catch {
      toast({ title: 'DNS Lookup Failed', description: 'Could not query DNS records for this domain.', variant: 'destructive' });
    } finally {
      setLoadingDnsLookup(false);
    }
  };

  const checkPropagation = async (domain: string) => {
    if (!domain || domain.length < 4) return;
    setCheckingPropagation(true);
    setPropagationResult(null);
    try {
      const response = await apiRequest('GET', `/api/storefront/dns/propagation?domain=${encodeURIComponent(domain)}`);
      const data = await response.json();
      setPropagationResult(data);
    } catch {
      toast({ title: 'Propagation Check Failed', description: 'Could not check DNS propagation.', variant: 'destructive' });
    } finally {
      setCheckingPropagation(false);
    }
  };

  const godaddyAutoConfigure = async () => {
    if (!selectedStorefront || !customDomainForm.customDomain || !godaddyApiKey || !godaddyApiSecret) return;
    setGodaddyAutoConfiguring(true);
    setGodaddyConfigResult(null);
    try {
      const response = await apiRequest('POST', `/api/storefront/${selectedStorefront.id}/godaddy-auto-configure`, {
        apiKey: godaddyApiKey,
        apiSecret: godaddyApiSecret,
        domain: customDomainForm.customDomain,
      });
      const data = await response.json();
      if (data.success) {
        setGodaddyConfigResult(data);
        toast({ title: 'CNAME Added via GoDaddy API', description: data.message });
        setTimeout(() => checkPropagation(customDomainForm.customDomain), 2000);
      } else {
        setGodaddyConfigResult({ success: false, message: data.error || 'Auto-configuration failed' });
        toast({ title: 'GoDaddy API Error', description: data.error, variant: 'destructive' });
      }
    } catch (e: any) {
      setGodaddyConfigResult({ success: false, message: e.message || 'Auto-configuration failed' });
      toast({ title: 'Auto-configuration Failed', description: 'Please configure DNS manually.', variant: 'destructive' });
    } finally {
      setGodaddyAutoConfiguring(false);
    }
  };

  const [suggestingUrl, setSuggestingUrl] = useState(false);

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

  // Fetch a fresh Replit-style random URL suggestion from the server.
  // Called by shuffle buttons — each call returns a different memorable combo.
  // When target is 'slug', also resets the user-edited flag so title typing
  // resumes syncing (matching Replit's behaviour after a shuffle).
  const suggestRandomUrl = async (target: 'slug' | 'subdomain' = 'slug') => {
    setSuggestingUrl(true);
    try {
      const response = await apiRequest('GET', '/api/storefront/suggest-url');
      const data = await response.json();
      if (target === 'slug') {
        setCreateForm((prev) => ({ ...prev, slug: data.slug }));
        setSlugUserEdited(false); // shuffle clears the manual-edit lock
      } else {
        setSubdomainForm((prev) => ({ ...prev, subdomain: data.slug }));
        setSubdomainAvailable(null);
      }
    } catch {
      toast({ title: 'Error', description: 'Could not generate a URL suggestion', variant: 'destructive' });
    } finally {
      setSuggestingUrl(false);
    }
  };

  // Auto-populate the slug with a memorable random URL whenever the create dialog opens,
  // exactly as Replit does — the field is never blank when the dialog appears.
  useEffect(() => {
    if (showCreateDialog) {
      setSlugUserEdited(false);
      suggestRandomUrl('slug');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCreateDialog]);

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
                  setSubdomainForm({
                    subdomain: (storefront as any).subdomain || '',
                    isSubdomainActive: (storefront as any).isSubdomainActive || false,
                  });
                  setSubdomainAvailable(null);
                  setCustomDomainForm({
                    customDomain: (storefront as any).customDomain || '',
                    isCustomDomainActive: (storefront as any).isCustomDomainActive || false,
                  });
                  setCustomDomainAvailable(null);
                  setCustomDomainValid(null);
                  setDomainVerificationResult(null);
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
                        <Badge variant={storefront.isPublic ? "default" : "secondary"} className={storefront.isPublic ? "bg-green-600 hover:bg-green-700" : ""}>
                          {storefront.isPublic ? <Globe className="w-3 h-3 mr-1" /> : <EyeOff className="w-3 h-3 mr-1" />}
                          {storefront.isPublic ? 'Published' : 'Draft'}
                        </Badge>
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
                      variant={storefront.isPublic ? "outline" : "default"}
                      size="sm"
                      className="flex-1"
                      disabled={publishStorefrontMutation.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        publishStorefrontMutation.mutate({
                          storefrontId: storefront.id,
                          isPublished: !storefront.isPublic,
                        });
                      }}
                    >
                      {storefront.isPublic ? <EyeOff className="w-4 h-4 mr-1" /> : <Globe className="w-4 h-4 mr-1" />}
                      {publishStorefrontMutation.isPending ? 'Updating...' : storefront.isPublic ? 'Unpublish' : 'Publish'}
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        const sf = storefront as any;
                        if (sf.subdomain && sf.isSubdomainActive) {
                          window.open(`https://${sf.subdomain}.maxbooster.app`, '_blank');
                        } else {
                          window.open(`/storefront/${storefront.slug}`, '_blank');
                        }
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
                        setSubdomainForm({
                          subdomain: (storefront as any).subdomain || '',
                          isSubdomainActive: (storefront as any).isSubdomainActive || false,
                        });
                        setSubdomainAvailable(null);
                        setCustomDomainForm({
                          customDomain: (storefront as any).customDomain || '',
                          isCustomDomainActive: (storefront as any).isCustomDomainActive || false,
                        });
                        setCustomDomainAvailable(null);
                        setCustomDomainValid(null);
                        setDomainVerificationResult(null);
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
                        } else {
                          setCustomization({
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
                        }
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
                        size="sm"
                        onClick={() => promoteCampaignMutation.mutate(selectedStorefront.id)}
                        disabled={promoteCampaignMutation.isPending || !selectedStorefront.isPublic}
                        className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
                      >
                        {promoteCampaignMutation.isPending ? (
                          <>Generating...</>
                        ) : (
                          <>
                            <Megaphone className="w-4 h-4 mr-1" />
                            Promote with Video
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const sf = selectedStorefront as any;
                          if (sf.subdomain && sf.isSubdomainActive) {
                            window.open(`https://${sf.subdomain}.maxbooster.app`, '_blank');
                          } else {
                            window.open(`/storefront/${selectedStorefront.slug}`, '_blank');
                          }
                        }}
                      >
                        <ExternalLink className="w-4 h-4 mr-1" />
                        Open in New Tab
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="grid w-full grid-cols-6">
                      <TabsTrigger value="overview">Overview</TabsTrigger>
                      <TabsTrigger value="branding">Branding</TabsTrigger>
                      <TabsTrigger value="colors">Colors & Fonts</TabsTrigger>
                      <TabsTrigger value="membership">Memberships</TabsTrigger>
                      <TabsTrigger value="promotions">Promotions</TabsTrigger>
                      <TabsTrigger value="dns">DNS</TabsTrigger>
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
                        <Label>Storefront ID</Label>
                        <Input value={selectedStorefront.slug} disabled className="bg-muted" />
                        {subdomainForm.subdomain && subdomainForm.isSubdomainActive ? (
                          <p className="text-xs text-muted-foreground mt-1">
                            Your storefront URL: <span className="font-medium text-primary">{subdomainForm.subdomain}.maxbooster.app</span>
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-1">
                            Set up a custom URL below to get <span className="font-medium">yourname.maxbooster.app</span>
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-base font-semibold">Custom URL</Label>
                          <p className="text-sm text-muted-foreground">
                            Get a personalized storefront link
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label htmlFor="subdomain-toggle" className="text-sm">Active</Label>
                          <input
                            id="subdomain-toggle"
                            type="checkbox"
                            checked={subdomainForm.isSubdomainActive}
                            onChange={(e) => setSubdomainForm({ ...subdomainForm, isSubdomainActive: e.target.checked })}
                            className="w-4 h-4"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 items-center">
                        <Input
                          value={subdomainForm.subdomain}
                          onChange={(e) => {
                            const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                            setSubdomainForm({ ...subdomainForm, subdomain: val });
                            setSubdomainAvailable(null);
                          }}
                          placeholder="silent-wave"
                          className="flex-1"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          title="Shuffle — suggest a memorable URL"
                          onClick={() => suggestRandomUrl('subdomain')}
                          disabled={suggestingUrl}
                        >
                          <Shuffle className="w-4 h-4" />
                        </Button>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">.maxbooster.app</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => checkSubdomainAvailability(subdomainForm.subdomain)}
                          disabled={!subdomainForm.subdomain || subdomainForm.subdomain.length < 3 || checkingSubdomain}
                        >
                          {checkingSubdomain ? 'Checking...' : 'Check Availability'}
                        </Button>
                        {subdomainAvailable !== null && (
                          <span className={`text-sm font-medium ${subdomainAvailable ? 'text-green-600' : 'text-red-600'}`}>
                            {subdomainAvailable ? (
                              <span className="flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Available</span>
                            ) : (
                              <span className="flex items-center gap-1"><AlertCircle className="w-4 h-4" /> Taken</span>
                            )}
                          </span>
                        )}
                      </div>
                      <Button
                        size="sm"
                        onClick={() => {
                          if (selectedStorefront) {
                            updateSubdomainMutation.mutate({
                              storefrontId: selectedStorefront.id,
                              subdomain: subdomainForm.subdomain,
                              isSubdomainActive: subdomainForm.isSubdomainActive,
                            });
                          }
                        }}
                        disabled={!subdomainForm.subdomain || subdomainForm.subdomain.length < 3 || updateSubdomainMutation.isPending}
                      >
                        <Save className="w-4 h-4 mr-2" />
                        {updateSubdomainMutation.isPending ? 'Saving...' : 'Save Custom URL'}
                      </Button>
                    </div>

                    <div className="border rounded-lg p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-base font-semibold">Custom Domain</Label>
                          <p className="text-sm text-muted-foreground">Use your own domain (e.g. www.mybeats.com)</p>
                        </div>
                        {customDomainForm.isCustomDomainActive && (
                          <Badge className="bg-green-600 text-white">Active</Badge>
                        )}
                      </div>

                      <div className="flex gap-2 items-center">
                        <Input
                          value={customDomainForm.customDomain}
                          onChange={(e) => {
                            const val = e.target.value.toLowerCase().trim();
                            setCustomDomainForm({ ...customDomainForm, customDomain: val });
                            setCustomDomainAvailable(null);
                            setCustomDomainValid(null);
                            setDomainVerificationResult(null);
                          }}
                          placeholder="www.mybeats.com"
                          className="flex-1"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => checkCustomDomainAvailability(customDomainForm.customDomain)}
                          disabled={!customDomainForm.customDomain || customDomainForm.customDomain.length < 4 || checkingCustomDomain}
                        >
                          {checkingCustomDomain ? 'Checking...' : 'Check'}
                        </Button>
                      </div>

                      {customDomainAvailable !== null && (
                        <div className="text-sm font-medium">
                          {!customDomainValid ? (
                            <span className="text-red-600 flex items-center gap-1"><AlertCircle className="w-4 h-4" /> Invalid format — use a full domain like www.mybeats.com</span>
                          ) : customDomainAvailable ? (
                            <span className="text-green-600 flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Available</span>
                          ) : (
                            <span className="text-red-600 flex items-center gap-1"><AlertCircle className="w-4 h-4" /> Already in use by another storefront</span>
                          )}
                        </div>
                      )}

                      {customDomainForm.isCustomDomainActive && customDomainForm.customDomain && (
                        <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-2 flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 flex-shrink-0" />
                          Live at <a href={`https://${customDomainForm.customDomain}`} target="_blank" rel="noopener noreferrer" className="font-medium underline">{customDomainForm.customDomain}</a>
                        </div>
                      )}

                      <div className="border rounded-lg overflow-hidden">
                        <div className="bg-muted px-3 py-2 flex gap-1 text-xs font-medium border-b">
                          {(['godaddy', 'cloudflare', 'namecheap', 'other'] as const).map(r => (
                            <button
                              key={r}
                              onClick={() => setDnsRegistrar(r)}
                              className={`px-3 py-1 rounded capitalize transition-colors ${dnsRegistrar === r ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                              {r === 'godaddy' ? 'GoDaddy' : r === 'cloudflare' ? 'Cloudflare' : r === 'namecheap' ? 'Namecheap' : 'Other / Manual'}
                            </button>
                          ))}
                        </div>

                        <div className="p-3 space-y-3 text-sm">
                          {dnsRegistrar === 'godaddy' && (
                            <div className="space-y-3">
                              <div className="bg-amber-50 border border-amber-200 rounded p-3 space-y-2">
                                <p className="font-semibold text-amber-800">Auto-Configure via GoDaddy API</p>
                                <p className="text-amber-700 text-xs">Enter your GoDaddy API credentials and we'll add the CNAME record automatically. Get keys at <a href="https://developer.godaddy.com/keys" target="_blank" rel="noopener noreferrer" className="underline">developer.godaddy.com/keys</a></p>
                                <div className="grid grid-cols-2 gap-2">
                                  <input
                                    type="text"
                                    placeholder="API Key"
                                    value={godaddyApiKey}
                                    onChange={e => setGodaddyApiKey(e.target.value)}
                                    className="border rounded px-2 py-1 text-xs font-mono bg-background"
                                  />
                                  <input
                                    type="password"
                                    placeholder="API Secret"
                                    value={godaddyApiSecret}
                                    onChange={e => setGodaddyApiSecret(e.target.value)}
                                    className="border rounded px-2 py-1 text-xs font-mono bg-background"
                                  />
                                </div>
                                <Button
                                  size="sm"
                                  className="bg-amber-600 hover:bg-amber-700 text-white w-full"
                                  onClick={godaddyAutoConfigure}
                                  disabled={!godaddyApiKey || !godaddyApiSecret || !customDomainForm.customDomain || godaddyAutoConfiguring}
                                >
                                  {godaddyAutoConfiguring ? 'Configuring via GoDaddy API...' : 'Auto-Configure DNS via GoDaddy'}
                                </Button>
                                {godaddyConfigResult && (
                                  <div className={`rounded p-2 text-xs ${godaddyConfigResult.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                                    {godaddyConfigResult.message}
                                    {godaddyConfigResult.record && (
                                      <div className="font-mono mt-1">CNAME {godaddyConfigResult.record.name} → {godaddyConfigResult.record.value} (TTL {godaddyConfigResult.record.ttl}s)</div>
                                    )}
                                  </div>
                                )}
                              </div>
                              <p className="text-muted-foreground text-xs font-medium">Or configure manually in GoDaddy DNS Manager:</p>
                              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                                <li>Log in to <strong>godaddy.com</strong> → My Products → Domains</li>
                                <li>Click <strong>DNS</strong> next to your domain</li>
                                <li>Click <strong>Add New Record</strong></li>
                                <li>Select <strong>CNAME</strong> from the Type dropdown</li>
                                <li>Fill in the values below and click <strong>Save</strong></li>
                              </ol>
                            </div>
                          )}
                          {dnsRegistrar === 'cloudflare' && (
                            <div className="space-y-2">
                              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                                <li>Log in to <strong>dash.cloudflare.com</strong> → select your domain</li>
                                <li>Click <strong>DNS</strong> → <strong>Records</strong> → <strong>Add record</strong></li>
                                <li>Select <strong>CNAME</strong> from the Type dropdown</li>
                                <li>Fill in the values below and click <strong>Save</strong></li>
                                <li>Set <strong>Proxy status</strong> to <strong>DNS only</strong> (grey cloud) — not proxied</li>
                              </ol>
                              <div className="bg-blue-50 border border-blue-200 rounded p-2 text-xs text-blue-700">
                                Cloudflare supports CNAME flattening, so you can use this for apex/root domains too (use <code>@</code> as name).
                              </div>
                            </div>
                          )}
                          {dnsRegistrar === 'namecheap' && (
                            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                              <li>Log in to <strong>namecheap.com</strong> → Domain List → Manage</li>
                              <li>Click the <strong>Advanced DNS</strong> tab</li>
                              <li>Click <strong>Add New Record</strong></li>
                              <li>Select <strong>CNAME Record</strong> from the Type dropdown</li>
                              <li>Fill in the values below and click <strong>Save All Changes</strong></li>
                            </ol>
                          )}
                          {dnsRegistrar === 'other' && (
                            <p className="text-xs text-muted-foreground">Log in to your domain registrar's DNS management panel and add a new CNAME record with the values below. If your registrar doesn't support CNAME at the root domain, use Cloudflare as your DNS provider (free) which supports CNAME flattening.</p>
                          )}

                          <div className="bg-background border rounded overflow-hidden font-mono text-xs">
                            <div className="grid grid-cols-4 gap-px bg-border">
                              <div className="bg-muted px-2 py-1 font-semibold text-muted-foreground">Type</div>
                              <div className="bg-muted px-2 py-1 font-semibold text-muted-foreground">Name / Host</div>
                              <div className="bg-muted px-2 py-1 font-semibold text-muted-foreground col-span-1">Value / Points To</div>
                              <div className="bg-muted px-2 py-1 font-semibold text-muted-foreground">TTL</div>
                            </div>
                            <div className="grid grid-cols-4 gap-px bg-border">
                              <div className="bg-background px-2 py-2 text-blue-600 font-bold">CNAME</div>
                              <div className="bg-background px-2 py-2 text-green-700">
                                {customDomainForm.customDomain
                                  ? (customDomainForm.customDomain.split('.').length > 2
                                    ? customDomainForm.customDomain.split('.').slice(0, -2).join('.')
                                    : '@')
                                  : 'www'}
                              </div>
                              <div className="bg-background px-2 py-2 text-purple-700">maxbooster.replit.app</div>
                              <div className="bg-background px-2 py-2 text-muted-foreground">3600</div>
                            </div>
                          </div>
                          <p className="text-muted-foreground text-xs">TTL 3600 = 1 hour cache. Lower to 300 (5 min) before making changes for faster propagation, then raise back after confirming it works.</p>
                        </div>
                      </div>

                      <div className="border rounded-lg overflow-hidden">
                        <div className="bg-muted px-3 py-2 text-xs font-semibold border-b flex items-center justify-between">
                          <span>Live DNS Zone Viewer</span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-xs px-2"
                            onClick={() => runDnsLookup(customDomainForm.customDomain)}
                            disabled={!customDomainForm.customDomain || loadingDnsLookup}
                          >
                            {loadingDnsLookup ? 'Looking up...' : 'Look Up Records'}
                          </Button>
                        </div>
                        <div className="p-3">
                          {!dnsLookupResult && !loadingDnsLookup && (
                            <p className="text-xs text-muted-foreground">Click "Look Up Records" to query all live DNS records for your domain from Google's public resolver (8.8.8.8).</p>
                          )}
                          {loadingDnsLookup && <p className="text-xs text-muted-foreground animate-pulse">Querying DNS records...</p>}
                          {dnsLookupResult && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-xs">
                                <span className="font-medium">{dnsLookupResult.totalRecords} record{dnsLookupResult.totalRecords !== 1 ? 's' : ''} found</span>
                                {dnsLookupResult.pointsToMaxbooster ? (
                                  <span className="text-green-600 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Points to Max Booster</span>
                                ) : (
                                  <span className="text-amber-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Not yet pointed to Max Booster</span>
                                )}
                              </div>
                              {dnsLookupResult.records.length > 0 ? (
                                <div className="font-mono text-xs border rounded overflow-hidden">
                                  <div className="grid grid-cols-4 gap-px bg-border">
                                    <div className="bg-muted px-2 py-1 font-semibold text-muted-foreground">Type</div>
                                    <div className="bg-muted px-2 py-1 font-semibold text-muted-foreground">Name</div>
                                    <div className="bg-muted px-2 py-1 font-semibold text-muted-foreground col-span-2">Value</div>
                                  </div>
                                  {dnsLookupResult.records.slice(0, 12).map((r, i) => (
                                    <div key={i} className="grid grid-cols-4 gap-px bg-border">
                                      <div className={`bg-background px-2 py-1.5 font-bold ${r.type === 'CNAME' ? 'text-blue-600' : r.type === 'A' ? 'text-green-600' : r.type === 'MX' ? 'text-orange-600' : r.type === 'TXT' ? 'text-purple-600' : 'text-muted-foreground'}`}>{r.type}</div>
                                      <div className="bg-background px-2 py-1.5 truncate text-muted-foreground">{r.name}</div>
                                      <div className="bg-background px-2 py-1.5 col-span-2 truncate">{r.priority ? `[${r.priority}] ` : ''}{r.value}</div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">No records found. DNS may not be configured yet.</p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="border rounded-lg overflow-hidden">
                        <div className="bg-muted px-3 py-2 text-xs font-semibold border-b flex items-center justify-between">
                          <span>Global Propagation Check</span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-xs px-2"
                            onClick={() => checkPropagation(customDomainForm.customDomain)}
                            disabled={!customDomainForm.customDomain || checkingPropagation}
                          >
                            {checkingPropagation ? 'Checking...' : 'Check Propagation'}
                          </Button>
                        </div>
                        <div className="p-3 space-y-2">
                          {!propagationResult && !checkingPropagation && (
                            <p className="text-xs text-muted-foreground">Check your domain across {6} global DNS resolvers (Google, Cloudflare, Quad9, OpenDNS, Verisign) simultaneously — like GoDaddy's propagation checker.</p>
                          )}
                          {checkingPropagation && <p className="text-xs text-muted-foreground animate-pulse">Querying 6 global resolvers simultaneously...</p>}
                          {propagationResult && (
                            <div className="space-y-2">
                              <div className="flex gap-4 text-xs">
                                <span>Propagated: <strong className={propagationResult.summary.propagationPct === 100 ? 'text-green-600' : 'text-amber-600'}>{propagationResult.summary.propagationPct}%</strong></span>
                                <span>Verified correct: <strong className={propagationResult.summary.verifiedPct === 100 ? 'text-green-600' : propagationResult.summary.verifiedPct > 0 ? 'text-amber-600' : 'text-red-600'}>{propagationResult.summary.verifiedPct}%</strong></span>
                              </div>
                              <div className="grid grid-cols-2 gap-1.5">
                                {propagationResult.resolvers.map((r, i) => (
                                  <div key={i} className={`rounded p-2 text-xs border flex items-start gap-2 ${r.pointsToMaxbooster ? 'bg-green-50 border-green-200' : r.resolved ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
                                    <div className={`w-2 h-2 rounded-full mt-0.5 flex-shrink-0 ${r.pointsToMaxbooster ? 'bg-green-500' : r.resolved ? 'bg-amber-500' : 'bg-red-400'}`} />
                                    <div className="min-w-0">
                                      <div className="font-semibold truncate">{r.resolver} <span className="font-normal text-muted-foreground">({r.ip})</span></div>
                                      <div className="text-muted-foreground text-[10px]">{r.location}</div>
                                      <div className={`text-[10px] mt-0.5 ${r.pointsToMaxbooster ? 'text-green-700' : r.resolved ? 'text-amber-700' : 'text-red-600'}`}>
                                        {r.pointsToMaxbooster ? 'Verified' : r.resolved ? (r.cnames[0] || r.aRecords[0] || 'Resolves (wrong target)') : 'No records yet'}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <p className="text-xs text-muted-foreground">Green = points to Max Booster. Yellow = resolves but wrong target. Red = not propagated yet (up to 48h).</p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={verifyCustomDomain}
                          disabled={!customDomainForm.customDomain || verifyingDomain || !selectedStorefront}
                        >
                          {verifyingDomain ? 'Verifying...' : 'Verify & Activate'}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            if (selectedStorefront && customDomainForm.customDomain) {
                              updateCustomDomainMutation.mutate({
                                storefrontId: selectedStorefront.id,
                                customDomain: customDomainForm.customDomain,
                                isCustomDomainActive: customDomainForm.isCustomDomainActive,
                              });
                            }
                          }}
                          disabled={!customDomainForm.customDomain || customDomainForm.customDomain.length < 4 || updateCustomDomainMutation.isPending}
                        >
                          <Save className="w-4 h-4 mr-2" />
                          {updateCustomDomainMutation.isPending ? 'Saving...' : 'Save Domain'}
                        </Button>
                        {customDomainForm.customDomain && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => {
                              if (selectedStorefront) {
                                updateCustomDomainMutation.mutate({ storefrontId: selectedStorefront.id, customDomain: null, isCustomDomainActive: false });
                                setCustomDomainForm({ customDomain: '', isCustomDomainActive: false });
                                setCustomDomainAvailable(null);
                                setDomainVerificationResult(null);
                                setDnsLookupResult(null);
                                setPropagationResult(null);
                                setGodaddyConfigResult(null);
                              }
                            }}
                          >
                            Remove Domain
                          </Button>
                        )}
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
                        {uploadingAsset === 'logo' ? (
                          <UploadProgressBar label="logo" />
                        ) : customization.logo ? (
                          <div className="relative">
                            <img src={customization.logo} alt="Logo" className="max-h-20 mx-auto object-contain" />
                            <p className="text-xs text-muted-foreground mt-2">Click to change</p>
                          </div>
                        ) : (
                          <>
                            <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">
                              Click to upload logo (PNG, JPG, max 5MB)
                            </p>
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
                        {uploadingAsset === 'banner' ? (
                          <div className="p-6">
                            <UploadProgressBar label="banner" />
                          </div>
                        ) : customization.banner ? (
                          <div className="relative">
                            <img src={customization.banner} alt="Banner" className="w-full h-32 object-cover" />
                            <p className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-white bg-black/50 px-2 py-1 rounded">Click to change</p>
                          </div>
                        ) : (
                          <div className="p-12">
                            <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">
                              Click to upload banner (PNG, JPG, recommended 1920x400px)
                            </p>
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
                        {uploadingAsset === 'avatar' ? (
                          <UploadProgressBar label="avatar" />
                        ) : customization.avatar ? (
                          <div className="relative">
                            <img src={customization.avatar} alt="Avatar" className="w-20 h-20 mx-auto rounded-full object-cover" />
                            <p className="text-xs text-muted-foreground mt-2">Click to change</p>
                          </div>
                        ) : (
                          <>
                            <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">
                              Click to upload avatar (PNG, JPG, square recommended)
                            </p>
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

                  <TabsContent value="dns" className="space-y-4 mt-4">
                    <DNSZoneEditor
                      storefrontId={selectedStorefront.id}
                      domain={selectedStorefront.customDomain || ''}
                    />
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
                      onClick={() => {
                        const sf = selectedStorefront as any;
                        if (sf.subdomain && sf.isSubdomainActive) {
                          window.open(`https://${sf.subdomain}.maxbooster.app`, '_blank');
                        } else {
                          window.open(`/storefront/${selectedStorefront.slug}`, '_blank');
                        }
                      }}
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
                  // Keep the URL in sync with the title unless the user has
                  // manually edited the URL field (Replit behaviour)
                  if (!slugUserEdited && e.target.value.trim()) {
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
                  onChange={(e) => {
                    setCreateForm({ ...createForm, slug: e.target.value });
                    setSlugUserEdited(true); // stop auto-syncing from title
                  }}
                  placeholder="silent-wave"
                />
                <Button
                  variant="outline"
                  size="icon"
                  title="Generate name-based slug"
                  onClick={() => generateSlug(createForm.name)}
                  disabled={!createForm.name}
                >
                  <Sparkles className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  title="Shuffle — get a random memorable URL"
                  onClick={() => suggestRandomUrl('slug')}
                  disabled={suggestingUrl}
                >
                  <Shuffle className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {createForm.slug
                  ? <>Your storefront will be at: <span className="font-medium text-primary">/{createForm.slug}</span></>
                  : 'Type a name above or hit shuffle for a memorable random URL'}
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

      <Dialog open={!!showCampaignResult} onOpenChange={(open) => !open && setShowCampaignResult(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="w-5 h-5 text-purple-600" />
              Video Campaign Generated
            </DialogTitle>
            <DialogDescription>
              Your promotional video campaign has been created for multiple platforms.
            </DialogDescription>
          </DialogHeader>
          {showCampaignResult?.campaign && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-muted rounded-lg p-3">
                  <span className="text-muted-foreground">Videos</span>
                  <p className="font-bold text-lg">{showCampaignResult.campaign.videos?.length || 0}</p>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <span className="text-muted-foreground">Platforms</span>
                  <p className="font-bold text-lg">{showCampaignResult.campaign.platforms?.length || 0}</p>
                </div>
              </div>
              {showCampaignResult.campaign.platforms && (
                <div>
                  <Label className="text-sm mb-2 block">Target Platforms</Label>
                  <div className="flex flex-wrap gap-1">
                    {showCampaignResult.campaign.platforms.map((p: string) => (
                      <Badge key={p} variant="secondary" className="text-xs">{p}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowCampaignResult(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
