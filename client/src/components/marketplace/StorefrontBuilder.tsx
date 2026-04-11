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
  Copy,
  Link,
} from 'lucide-react';
import { BogoPromotionsManager } from './BogoPromotionsManager';
import { StorefrontDnsZoneManager } from './StorefrontDnsZoneManager';
import { validateFreeDomain, SUPPORTED_TLDS } from '@shared/domainValidation';

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

const STOREFRONT_BASE = 'https://maxbooster.replit.app';

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
  const [customDomainInstructions, setCustomDomainInstructions] = useState<{
    domain: string;
    verificationToken: string;
    instructions: { txt: { name: string; value: string }; cname: { name: string; value: string } };
  } | null>(null);
  const [requestingCustomDomain, setRequestingCustomDomain] = useState(false);
  const [verifyingDomain, setVerifyingDomain] = useState(false);
  const [domainVerified, setDomainVerified] = useState<boolean | null>(null);
  const [newDnsZoneDomain, setNewDnsZoneDomain] = useState('');
  const [addedDnsZone, setAddedDnsZone] = useState<{ id: string; domain: string; nameserver1: string; nameserver2: string } | null>(null);

  // Free domain — user picks any full domain (e.g. mybeats.com), included with subscription
  const [freeDomainSld, setFreeDomainSld] = useState('');
  const [freeDomainTld, setFreeDomainTld] = useState('.com');
  const [freeDomainError, setFreeDomainError] = useState<string | null>(null);
  const [freeDomainAvailable, setFreeDomainAvailable] = useState<boolean | null>(null);
  const [checkingFreeDomain, setCheckingFreeDomain] = useState(false);
  const [claimedPlatformDomain, setClaimedPlatformDomain] = useState<string | null>(null);

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

  const { data: domainsData, refetch: refetchDomains } = useQuery<{ ok: boolean; domains: Array<{ id: string; domain: string; type: string; status: string; isPrimary: boolean; createdAt: string }> }>({
    queryKey: ['/api/storefront-domains', selectedStorefront?.id],
    enabled: !!selectedStorefront,
    queryFn: async () => {
      const res = await fetch(`/api/storefront-domains/storefront/${selectedStorefront!.id}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch domains');
      return res.json();
    },
  });
  const storefrontDomainsList = domainsData?.domains ?? [];

  const createStorefrontMutation = useMutation({
    mutationFn: async (data: typeof createForm) => {
      const response = await apiRequest('POST', '/api/storefront/create', data);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Storefront Created!',
        description: `Your storefront "${data.name}" is live at ${STOREFRONT_BASE}/storefront/${data.slug}`,
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
    onError: (error: Error) => {
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
    onError: (error: Error) => {
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
    onError: (error: Error) => {
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
    onError: (error: Error) => {
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

  const reserveManagedMutation = useMutation({
    mutationFn: async ({ storefrontId, desiredLabel }: { storefrontId: string; desiredLabel: string }) => {
      const response = await apiRequest('POST', '/api/storefront-domains/managed/reserve', { storefrontId, desiredLabel });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.ok) {
        toast({ title: 'Subdomain Reserved', description: `Your store is now at https://maxbooster.replit.app/s/${data.subdomain || subdomainForm.subdomain}` });
        queryClient.invalidateQueries({ queryKey: ['/api/storefront/my'] });
        queryClient.invalidateQueries({ queryKey: ['/api/storefront-domains', selectedStorefront?.id] });
      } else {
        toast({ title: 'Reserve Failed', description: data.error || 'Failed to reserve subdomain', variant: 'destructive' });
      }
    },
    onError: (error: any) => {
      toast({ title: 'Reserve Failed', description: error.message || 'Failed to reserve subdomain', variant: 'destructive' });
    },
  });

  const { data: dnsZonesData, refetch: refetchDnsZones } = useQuery<{ zones: Array<{ id: string; domain: string; status: string; isVerified: boolean; nameserver1: string; nameserver2: string; verificationToken: string }> }>({
    queryKey: ['/api/dns-manager/zones'],
    queryFn: () => apiRequest('GET', '/api/dns-manager/zones').then(r => r.json()),
  });
  const dnsZones = dnsZonesData?.zones ?? [];

  const addDnsZoneMutation = useMutation({
    mutationFn: (domain: string) => apiRequest('POST', '/api/dns-manager/zones', { domain }).then(r => r.json()),
    onSuccess: (data) => {
      if (data.zone) {
        setAddedDnsZone(data.zone);
        setNewDnsZoneDomain('');
        refetchDnsZones();
        toast({ title: 'Domain Added', description: 'Update your nameservers to point to Max Booster.' });
      } else {
        toast({ title: 'Failed', description: data.error || 'Could not add domain', variant: 'destructive' });
      }
    },
    onError: async (err: any) => {
      let msg = 'Failed to add domain';
      try { const d = await err.response?.json(); msg = d?.error ?? msg; } catch {}
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    },
  });

  // Fetch existing platform subdomain when storefront changes
  const { data: existingPlatformData } = useQuery<{ ok: boolean; domain: string | null; status: string | null }>({
    queryKey: ['/api/storefront-domains/platform', selectedStorefront?.id],
    queryFn: () => selectedStorefront
      ? apiRequest('GET', `/api/storefront-domains/platform/${selectedStorefront.id}`).then(r => r.json())
      : Promise.resolve({ ok: true, domain: null, status: null }),
    enabled: !!selectedStorefront,
  });

  // Sync claimed domain into state when query resolves
  useEffect(() => {
    if (existingPlatformData?.domain) {
      setClaimedPlatformDomain(existingPlatformData.domain);
    }
  }, [existingPlatformData]);

  const claimPlatformDomainMutation = useMutation({
    mutationFn: (data: { sld: string; tld: string; storefrontId: string }) =>
      apiRequest('POST', '/api/storefront-domains/platform/claim', data).then(r => r.json()),
    onSuccess: (data) => {
      if (data.ok) {
        setClaimedPlatformDomain(data.domain);
        toast({
          title: 'Your Domain is Live!',
          description: `${data.domain} is now active and pointing to your store.`,
        });
        queryClient.invalidateQueries({ queryKey: ['/api/storefront-domains/platform', selectedStorefront?.id] });
      } else {
        toast({ title: 'Failed', description: data.error || 'Could not claim domain', variant: 'destructive' });
      }
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to claim domain', variant: 'destructive' });
    },
  });

  const checkFreeDomainAvailability = async (sld: string, tld: string) => {
    const v = validateFreeDomain(sld, tld);
    if (!v.valid) {
      setFreeDomainError(v.error ?? null);
      setFreeDomainAvailable(null);
      return;
    }
    setCheckingFreeDomain(true);
    setFreeDomainError(null);
    try {
      const response = await apiRequest('POST', '/api/storefront-domains/platform/check', { sld, tld });
      const data = await response.json();
      if (data.available) {
        setFreeDomainAvailable(true);
      } else {
        setFreeDomainAvailable(false);
        if (data.reason === 'registered_externally') {
          setFreeDomainError('This domain is already registered globally — it belongs to someone else.');
        } else {
          setFreeDomainError('This domain has already been claimed on Max Booster.');
        }
      }
    } catch {
      setFreeDomainAvailable(null);
      setFreeDomainError('Could not check availability — please try again.');
    } finally {
      setCheckingFreeDomain(false);
    }
  };

  const checkSubdomainAvailability = async (subdomain: string) => {
    if (!subdomain || subdomain.length < 3) {
      setSubdomainAvailable(null);
      return;
    }
    setCheckingSubdomain(true);
    try {
      const response = await apiRequest('POST', '/api/storefront-domains/managed/check', { desiredLabel: subdomain });
      const data = await response.json();
      setSubdomainAvailable(data.available ?? false);
    } catch {
      setSubdomainAvailable(null);
    } finally {
      setCheckingSubdomain(false);
    }
  };

  const requestCustomDomainFn = async () => {
    if (!selectedStorefront || !customDomainForm.customDomain) return;
    setRequestingCustomDomain(true);
    setCustomDomainInstructions(null);
    setDomainVerified(null);
    try {
      const response = await apiRequest('POST', '/api/storefront-domains/custom/request', {
        storefrontId: selectedStorefront.id,
        domain: customDomainForm.customDomain,
      });
      const data = await response.json();
      if (data.ok) {
        setCustomDomainInstructions(data);
        toast({ title: 'Domain Added', description: 'Follow the DNS instructions below to verify ownership.' });
        queryClient.invalidateQueries({ queryKey: ['/api/storefront-domains', selectedStorefront.id] });
      } else {
        toast({ title: 'Failed', description: data.error || 'Could not add domain', variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to add domain', variant: 'destructive' });
    } finally {
      setRequestingCustomDomain(false);
    }
  };

  const verifyCustomDomain = async () => {
    if (!customDomainInstructions?.domain && !customDomainForm.customDomain) return;
    const domain = customDomainInstructions?.domain || customDomainForm.customDomain;
    setVerifyingDomain(true);
    setDomainVerified(null);
    try {
      const response = await apiRequest('POST', '/api/storefront-domains/custom/verify', { domain });
      const data = await response.json();
      if (data.verified) {
        setDomainVerified(true);
        toast({ title: 'Domain Verified!', description: `${domain} is now active.` });
        queryClient.invalidateQueries({ queryKey: ['/api/storefront-domains', selectedStorefront?.id] });
      } else {
        setDomainVerified(false);
        toast({ title: 'Not Verified Yet', description: 'TXT record not found. DNS changes can take up to 48 hours.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Verification Failed', description: 'Could not check DNS. Try again shortly.', variant: 'destructive' });
    } finally {
      setVerifyingDomain(false);
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
                  setCustomDomainInstructions(null);
                  setDomainVerified(null);
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
                        window.open(`${window.location.origin}/storefront/${storefront.slug}`, '_blank');
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
                        setCustomDomainInstructions(null);
                        setDomainVerified(null);
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
                          window.open(`${window.location.origin}/storefront/${selectedStorefront.slug}`, '_blank');
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
                        <div className="mt-2 space-y-1.5">
                          {(() => {
                            const activeSubdomain = subdomainForm.subdomain && subdomainForm.isSubdomainActive ? subdomainForm.subdomain : null;
                            const primaryUrl = activeSubdomain
                              ? `https://maxbooster.replit.app/s/${activeSubdomain}`
                              : `${STOREFRONT_BASE}/storefront/${selectedStorefront.slug}`;
                            return (
                              <>
                                <div className="flex items-center gap-2">
                                  <p className="text-xs text-muted-foreground flex-1 truncate">
                                    <span className="font-medium">Your store link: </span>
                                    <a
                                      href={primaryUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-primary underline"
                                    >
                                      {primaryUrl}
                                    </a>
                                  </p>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 flex-shrink-0"
                                    title="Copy store link"
                                    onClick={() => {
                                      navigator.clipboard.writeText(primaryUrl);
                                      toast({ title: 'Link copied!', description: 'Your store link is in the clipboard.' });
                                    }}
                                  >
                                    <Copy className="w-3 h-3" />
                                  </Button>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* ── FREE PLATFORM DOMAIN (included with subscription) ── */}
                    <div className="border-2 border-purple-500/60 rounded-lg p-4 space-y-3 bg-purple-50/40 dark:bg-purple-950/20">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <Globe className="w-4 h-4 text-purple-600" />
                            <Label className="text-base font-semibold text-purple-900 dark:text-purple-100">Your Free Domain</Label>
                            <span className="text-[10px] bg-purple-600 text-white px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide">Included</span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Choose any domain name and extension — fully yours, managed by Max Booster DNS
                          </p>
                        </div>
                        {claimedPlatformDomain && (
                          <span className="flex items-center gap-1 text-green-700 dark:text-green-400 text-xs font-semibold bg-green-100 dark:bg-green-900/40 px-2 py-1 rounded-full">
                            <CheckCircle className="w-3 h-3" /> Active
                          </span>
                        )}
                      </div>

                      {claimedPlatformDomain ? (
                        <div className="space-y-3">
                          {/* Domain row */}
                          <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-purple-300 dark:border-purple-700 rounded-lg px-3 py-2">
                            <Globe className="w-4 h-4 text-purple-600 flex-shrink-0" />
                            <span className="font-mono font-semibold text-sm flex-1">{claimedPlatformDomain}</span>
                            <button
                              className="text-muted-foreground hover:text-foreground"
                              title="Copy domain"
                              onClick={() => {
                                navigator.clipboard.writeText(claimedPlatformDomain);
                                toast({ title: 'Copied!', description: `${claimedPlatformDomain} is in your clipboard.` });
                              }}
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Nameserver setup — identical flow to Cloudflare / Namecheap */}
                          <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-2">
                            <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" /> Action required — update your nameservers
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Go to your domain registrar (GoDaddy, Namecheap, Google Domains, etc.), find <strong>Nameservers</strong>, change to <strong>Custom</strong>, and enter:
                            </p>
                            {(['maxbooster.replit.app'] as const).map((ns) => (
                              <div key={ns} className="flex items-center gap-2 bg-white dark:bg-gray-900 border border-input rounded px-2 py-1">
                                <span className="font-mono text-xs flex-1 select-all">{ns}</span>
                                <button
                                  className="text-muted-foreground hover:text-foreground flex-shrink-0"
                                  title={`Copy ${ns}`}
                                  onClick={() => {
                                    navigator.clipboard.writeText(ns);
                                    toast({ title: 'Copied!', description: `${ns} is in your clipboard.` });
                                  }}
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                            <p className="text-xs text-muted-foreground">
                              DNS changes propagate globally in <strong>up to 48 hours</strong> (usually under 30 minutes). Once live, {claimedPlatformDomain} will point to your store automatically.
                            </p>
                          </div>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setClaimedPlatformDomain(null);
                              setFreeDomainSld('');
                              setFreeDomainAvailable(null);
                              setFreeDomainError(null);
                            }}
                          >
                            Change domain
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {/* Domain name + TLD selector */}
                          <div className="flex items-stretch rounded-lg border border-input overflow-hidden focus-within:ring-1 focus-within:ring-purple-500">
                            <input
                              type="text"
                              value={freeDomainSld}
                              onChange={(e) => {
                                const raw = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                                setFreeDomainSld(raw);
                                setFreeDomainAvailable(null);
                                if (!raw) {
                                  setFreeDomainError(null);
                                } else {
                                  const v = validateFreeDomain(raw, freeDomainTld);
                                  setFreeDomainError(v.valid ? null : (v.error ?? null));
                                }
                              }}
                              placeholder="mybeats"
                              className="flex-1 px-3 py-2 text-sm bg-transparent outline-none min-w-0"
                              maxLength={63}
                            />
                            <select
                              value={freeDomainTld}
                              onChange={(e) => {
                                setFreeDomainTld(e.target.value);
                                setFreeDomainAvailable(null);
                                if (freeDomainSld) {
                                  const v = validateFreeDomain(freeDomainSld, e.target.value);
                                  setFreeDomainError(v.valid ? null : (v.error ?? null));
                                }
                              }}
                              className="border-l border-input bg-muted px-2 py-2 text-sm font-mono text-muted-foreground outline-none cursor-pointer"
                            >
                              {SUPPORTED_TLDS.map(tld => (
                                <option key={tld} value={tld}>{tld}</option>
                              ))}
                            </select>
                          </div>

                          {freeDomainSld && !freeDomainError && (
                            <p className="text-xs text-muted-foreground font-mono">
                              {freeDomainSld}{freeDomainTld}
                            </p>
                          )}

                          {freeDomainError && (
                            <p className="text-xs text-red-600 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3 flex-shrink-0" /> {freeDomainError}
                            </p>
                          )}

                          <div className="flex items-center gap-2 flex-wrap">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => checkFreeDomainAvailability(freeDomainSld, freeDomainTld)}
                              disabled={!freeDomainSld || !!freeDomainError || checkingFreeDomain}
                            >
                              {checkingFreeDomain ? 'Checking...' : 'Check Availability'}
                            </Button>
                            {!freeDomainError && freeDomainAvailable !== null && (
                              <span className={`text-sm font-medium flex items-center gap-1 ${freeDomainAvailable ? 'text-green-600' : 'text-red-600'}`}>
                                {freeDomainAvailable
                                  ? <><CheckCircle className="w-4 h-4" /> Available!</>
                                  : <><AlertCircle className="w-4 h-4" /> Already taken</>
                                }
                              </span>
                            )}
                          </div>

                          {freeDomainAvailable && (
                            <Button
                              size="sm"
                              className="bg-purple-600 hover:bg-purple-700 text-white w-full"
                              onClick={() => {
                                if (selectedStorefront && freeDomainSld) {
                                  claimPlatformDomainMutation.mutate({ sld: freeDomainSld, tld: freeDomainTld, storefrontId: selectedStorefront.id });
                                }
                              }}
                              disabled={claimPlatformDomainMutation.isPending}
                            >
                              <Globe className="w-4 h-4 mr-2" />
                              {claimPlatformDomainMutation.isPending
                                ? 'Activating...'
                                : `Claim ${freeDomainSld}${freeDomainTld}`}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ── PATH-BASED CUSTOM URL ── */}
                    <div className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-base font-semibold">Short Link</Label>
                          <p className="text-sm text-muted-foreground">
                            Also accessible via a short path link
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
                        <span className="text-xs text-muted-foreground whitespace-nowrap">→ maxbooster.replit.app/s/</span>
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
                          if (selectedStorefront && subdomainAvailable) {
                            reserveManagedMutation.mutate({
                              storefrontId: selectedStorefront.id,
                              desiredLabel: subdomainForm.subdomain,
                            });
                          }
                        }}
                        disabled={!subdomainForm.subdomain || subdomainForm.subdomain.length < 3 || !subdomainAvailable || reserveManagedMutation.isPending}
                      >
                        <Save className="w-4 h-4 mr-2" />
                        {reserveManagedMutation.isPending ? 'Reserving...' : 'Reserve Subdomain'}
                      </Button>
                      <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-800 space-y-1">
                        <p className="font-semibold flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Subdomain URL format</p>
                        <p>Once reserved and active, your store is accessible at <span className="font-mono font-medium">{subdomainForm.subdomain ? `https://maxbooster.replit.app/s/${subdomainForm.subdomain}` : `maxbooster.replit.app/s/{your-name}`}</span>. The direct path URL <span className="font-mono font-medium">{STOREFRONT_BASE}/storefront/{selectedStorefront?.slug}</span> also always works.</p>
                      </div>
                    </div>

                    <div className="border rounded-lg p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-base font-semibold">Bring Your Own Domain</Label>
                          <p className="text-sm text-muted-foreground">Already own a domain like <span className="font-mono">mybeats.com</span>? Point it to Max Booster's nameservers and manage DNS records here.</p>
                        </div>
                        {dnsZones.some(z => z.isVerified) && (
                          <Badge className="bg-green-600 text-white">Active</Badge>
                        )}
                      </div>

                      {dnsZones.length > 0 && (
                        <div className="space-y-2">
                          {dnsZones.map(zone => (
                            <div key={zone.id} className="flex items-center justify-between bg-muted rounded px-3 py-2 text-sm">
                              <div className="flex items-center gap-2">
                                <Globe className="w-4 h-4 text-muted-foreground" />
                                <span className="font-mono font-medium">{zone.domain}</span>
                              </div>
                              <Badge variant={zone.isVerified ? 'default' : 'outline'} className={zone.isVerified ? 'bg-green-600 text-white' : ''}>
                                {zone.isVerified ? 'Active' : zone.status}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-2 items-center">
                        <Input
                          value={newDnsZoneDomain}
                          onChange={(e) => {
                            const val = e.target.value.toLowerCase().trim();
                            setNewDnsZoneDomain(val);
                            setAddedDnsZone(null);
                          }}
                          placeholder="mybeats.com"
                          className="flex-1"
                        />
                        <Button
                          size="sm"
                          onClick={() => {
                            if (newDnsZoneDomain && newDnsZoneDomain.length >= 4) {
                              addDnsZoneMutation.mutate(newDnsZoneDomain);
                            }
                          }}
                          disabled={!newDnsZoneDomain || newDnsZoneDomain.length < 4 || addDnsZoneMutation.isPending}
                        >
                          {addDnsZoneMutation.isPending ? 'Adding...' : 'Add Domain'}
                        </Button>
                      </div>

                      {addedDnsZone && (
                        <div className="space-y-3">
                          <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs space-y-2">
                            <p className="font-semibold text-blue-800">Domain added — point your nameserver to Max Booster:</p>
                            <p className="text-blue-700 text-[11px]">Log in to your domain registrar and set the nameserver to:</p>
                            <div className="flex flex-col gap-1 font-mono">
                              <div className="flex items-center gap-2 bg-white rounded px-2 py-1 border">
                                <span className="text-muted-foreground text-[11px]">NS</span>
                                <span className="text-blue-800 font-medium">maxbooster.replit.app</span>
                              </div>
                            </div>
                            <p className="text-blue-600 text-[11px]">DNS propagation can take 1–48 hours. Once done, your domain will show as Active in the DNS tab.</p>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setActiveTab('dns')}
                        >
                          <Globe className="w-3 h-3 mr-1" />
                          Manage DNS Records
                        </Button>
                        {dnsZones.length === 0 && !addedDnsZone && (
                          <p className="text-xs text-muted-foreground">Add your domain above, then manage DNS records in the DNS tab.</p>
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
                    <StorefrontDnsZoneManager storefrontId={selectedStorefront.id} />
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
                        window.open(`${STOREFRONT_BASE}/storefront/${selectedStorefront.slug}`, '_blank');
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
                  ? <>Your storefront will be at: <span className="font-medium text-primary">{STOREFRONT_BASE}/storefront/{createForm.slug}</span></>
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
