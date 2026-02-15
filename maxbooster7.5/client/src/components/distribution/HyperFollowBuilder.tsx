import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tantml:parameter>@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useToast } from '@/hooks/use-toast';
import {
  Eye,
  Save,
  Copy,
  ExternalLink,
  Upload,
  Palette,
  Mail,
  Share2,
  Smartphone,
  BarChart3,
  Link as LinkIcon,
  Trash2,
  X,
  Check,
  Music,
  Globe,
  Sparkles,
} from 'lucide-react';
import {
  SpotifyIcon,
  AppleMusicIcon,
  YouTubeIcon,
  AmazonIcon,
  TidalIcon,
  DeezerIcon,
  SoundCloudIcon,
  TwitterIcon,
  FacebookIcon,
  InstagramIcon,
  TikTokIcon,
} from '@/components/ui/brand-icons';

// Validation schema
const hyperFollowSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  artistName: z.string().min(1, 'Artist name is required'),
  slug: z
    .string()
    .min(3, 'Slug must be at least 3 characters')
    .max(50, 'Slug must be less than 50 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'),
  headerImage: z.string().optional(),
  description: z.string().optional(),
  collectEmails: z.boolean().default(true),
  platforms: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      enabled: z.boolean(),
      url: z.string().optional(),
    })
  ),
  socialLinks: z
    .array(
      z.object({
        platform: z.string(),
        url: z.string(),
      })
    )
    .optional(),
  theme: z.object({
    primaryColor: z.string(),
    backgroundColor: z.string(),
    textColor: z.string(),
    buttonStyle: z.enum(['rounded', 'square', 'pill']),
  }),
});

type HyperFollowFormData = z.infer<typeof hyperFollowSchema>;

interface Platform {
  id: string;
  name: string;
  icon: any;
  color: string;
  category: 'streaming' | 'social';
  defaultUrl?: string;
}

const AVAILABLE_PLATFORMS: Platform[] = [
  {
    id: 'spotify',
    name: 'Spotify Pre-Save',
    icon: SpotifyIcon,
    color: '#1DB954',
    category: 'streaming',
  },
  {
    id: 'apple-music',
    name: 'Apple Music Pre-Add',
    icon: AppleMusicIcon,
    color: '#FA243C',
    category: 'streaming',
  },
  {
    id: 'youtube-music',
    name: 'YouTube Music',
    icon: YouTubeIcon,
    color: '#FF0000',
    category: 'streaming',
  },
  {
    id: 'amazon-music',
    name: 'Amazon Music',
    icon: AmazonIcon,
    color: '#FF9900',
    category: 'streaming',
  },
  { id: 'tidal', name: 'TIDAL', icon: TidalIcon, color: '#000000', category: 'streaming' },
  { id: 'deezer', name: 'Deezer', icon: DeezerIcon, color: '#FEAA2D', category: 'streaming' },
  {
    id: 'soundcloud',
    name: 'SoundCloud',
    icon: SoundCloudIcon,
    color: '#FF3300',
    category: 'streaming',
  },
];

const SOCIAL_PLATFORMS = [
  { id: 'twitter', name: 'Twitter', icon: TwitterIcon, color: '#1DA1F2' },
  { id: 'facebook', name: 'Facebook', icon: FacebookIcon, color: '#1877F2' },
  { id: 'instagram', name: 'Instagram', icon: InstagramIcon, color: '#E4405F' },
  { id: 'tiktok', name: 'TikTok', icon: TikTokIcon, color: '#000000' },
];

interface HyperFollowBuilderProps {
  releaseId?: string;
  campaignId?: string;
  onComplete?: (campaign: unknown) => void;
  onCancel?: () => void;
}

/**
 * TODO: Add function documentation
 */
export function HyperFollowBuilder({
  releaseId,
  campaignId,
  onComplete,
  onCancel,
}: HyperFollowBuilderProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('design');
  const [showPreview, setShowPreview] = useState(false);
  const [headerImageFile, setHeaderImageFile] = useState<File | null>(null);
  const [headerImagePreview, setHeaderImagePreview] = useState<string>('');

  // Load existing campaign if editing
  const { data: existingCampaign } = useQuery({
    queryKey: ['/api/distribution/hyperfollow', campaignId],
    enabled: !!campaignId,
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<HyperFollowFormData>({
    resolver: zodResolver(hyperFollowSchema),
    defaultValues: existingCampaign || {
      title: '',
      artistName: '',
      slug: '',
      description: '',
      collectEmails: true,
      platforms: AVAILABLE_PLATFORMS.map((p) => ({
        id: p.id,
        name: p.name,
        enabled: false,
        url: '',
      })),
      socialLinks: [],
      theme: {
        primaryColor: '#8B5CF6',
        backgroundColor: '#0F0F0F',
        textColor: '#FFFFFF',
        buttonStyle: 'rounded' as const,
      },
    },
  });

  const watchedValues = watch();

  // Auto-generate slug from title
  useEffect(() => {
    if (watchedValues.title && !campaignId) {
      const slug = watchedValues.title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 50);
      setValue('slug', slug);
    }
  }, [watchedValues.title, campaignId, setValue]);

  // Handle image upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: 'File too large',
          description: 'Image must be less than 5MB',
          variant: 'destructive',
        });
        return;
      }

      setHeaderImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setHeaderImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Save campaign mutation
  const saveMutation = useMutation({
    mutationFn: async (data: HyperFollowFormData) => {
      const formData = new FormData();

      if (headerImageFile) {
        formData.append('headerImage', headerImageFile);
      }

      formData.append(
        'data',
        JSON.stringify({
          ...data,
          releaseId,
        })
      );

      const url = campaignId
        ? `/api/distribution/hyperfollow/${campaignId}`
        : '/api/distribution/hyperfollow';

      const method = campaignId ? 'PATCH' : 'POST';
      const response = await apiRequest(method, url, formData);
      return response.json();
    },
    onSuccess: (campaign) => {
      toast({
        title: 'Campaign saved!',
        description: 'Your HyperFollow page has been created.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/distribution/hyperfollow'] });
      onComplete?.(campaign);
    },
    onError: (error: unknown) => {
      toast({
        title: 'Error saving campaign',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Copy link to clipboard
  const copyLink = () => {
    const link = `${window.location.origin}/pre-save/${watchedValues.slug}`;
    navigator.clipboard.writeText(link);
    toast({
      title: 'Link copied!',
      description: 'Share it with your fans.',
    });
  };

  const onSubmit = (data: HyperFollowFormData) => {
    saveMutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            HyperFollow Campaign Builder
          </h2>
          <p className="text-muted-foreground">
            Create a stunning pre-save landing page for your release
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowPreview(true)}>
            <Eye className="h-4 w-4 mr-2" />
            Preview
          </Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={saveMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {saveMutation.isPending ? 'Saving...' : 'Save Campaign'}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="design">
            <Palette className="h-4 w-4 mr-2" />
            Design
          </TabsTrigger>
          <TabsTrigger value="platforms">
            <Music className="h-4 w-4 mr-2" />
            Platforms
          </TabsTrigger>
          <TabsTrigger value="social">
            <Share2 className="h-4 w-4 mr-2" />
            Social
          </TabsTrigger>
          <TabsTrigger value="analytics">
            <BarChart3 className="h-4 w-4 mr-2" />
            Analytics
          </TabsTrigger>
        </TabsList>

        {/* Design Tab */}
        <TabsContent value="design" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Set up your campaign details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Release Title *</Label>
                <Input id="title" {...register('title')} placeholder="My Awesome Song" />
                {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="artistName">Artist Name *</Label>
                <Input id="artistName" {...register('artistName')} placeholder="Your Artist Name" />
                {errors.artistName && (
                  <p className="text-sm text-destructive">{errors.artistName.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">Custom URL Slug *</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">maxbooster.com/pre-save/</span>
                  <Input
                    id="slug"
                    {...register('slug')}
                    placeholder="my-awesome-song"
                    className="flex-1"
                  />
                </div>
                {errors.slug && <p className="text-sm text-destructive">{errors.slug.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  {...register('description')}
                  placeholder="Tell your fans about this release..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Header Image</Label>
                <div className="border-2 border-dashed border-muted rounded-lg p-6 text-center">
                  {headerImagePreview ? (
                    <div className="space-y-2">
                      <img
                        src={headerImagePreview}
                        alt="Header preview"
                        className="max-h-48 mx-auto rounded-lg"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setHeaderImageFile(null);
                          setHeaderImagePreview('');
                        }}
                      >
                        <X className="h-4 w-4 mr-2" />
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <label className="cursor-pointer">
                      <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Click to upload header image</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Recommended: 1600x900px, Max 5MB
                      </p>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Theme Customization</CardTitle>
              <CardDescription>Customize colors and button styles</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="primaryColor">Primary Color</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      {...register('theme.primaryColor')}
                      className="h-10 w-20 rounded cursor-pointer"
                    />
                    <Input
                      value={watchedValues.theme?.primaryColor}
                      onChange={(e) => setValue('theme.primaryColor', e.target.value)}
                      placeholder="#8B5CF6"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="backgroundColor">Background</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      {...register('theme.backgroundColor')}
                      className="h-10 w-20 rounded cursor-pointer"
                    />
                    <Input
                      value={watchedValues.theme?.backgroundColor}
                      onChange={(e) => setValue('theme.backgroundColor', e.target.value)}
                      placeholder="#0F0F0F"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="textColor">Text Color</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      {...register('theme.textColor')}
                      className="h-10 w-20 rounded cursor-pointer"
                    />
                    <Input
                      value={watchedValues.theme?.textColor}
                      onChange={(e) => setValue('theme.textColor', e.target.value)}
                      placeholder="#FFFFFF"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Button Style</Label>
                <div className="flex gap-4">
                  {(['rounded', 'square', 'pill'] as const).map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => setValue('theme.buttonStyle', style)}
                      className={`px-4 py-2 border-2 ${
                        watchedValues.theme?.buttonStyle === style
                          ? 'border-primary bg-primary/10'
                          : 'border-muted'
                      } ${
                        style === 'rounded'
                          ? 'rounded-md'
                          : style === 'square'
                            ? 'rounded-none'
                            : 'rounded-full'
                      }`}
                    >
                      {style.charAt(0).toUpperCase() + style.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Email Collection</CardTitle>
              <CardDescription>Capture fan emails for your mailing list</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="collectEmails">Enable Email Capture</Label>
                  <p className="text-sm text-muted-foreground">
                    Collect emails when fans pre-save your release
                  </p>
                </div>
                <Switch
                  id="collectEmails"
                  checked={watchedValues.collectEmails}
                  onCheckedChange={(checked) => setValue('collectEmails', checked)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Platforms Tab */}
        <TabsContent value="platforms" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Streaming Platforms</CardTitle>
              <CardDescription>Enable platforms and set up pre-save/pre-add links</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {AVAILABLE_PLATFORMS.map((platform, index) => {
                const Icon = platform.icon;
                const isEnabled = watchedValues.platforms?.[index]?.enabled || false;

                return (
                  <div key={platform.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: platform.color }}
                        >
                          <Icon className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <p className="font-medium">{platform.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {isEnabled ? 'Active' : 'Inactive'}
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={(checked) => {
                          const platforms = [...(watchedValues.platforms || [])];
                          platforms[index] = { ...platforms[index], enabled: checked };
                          setValue('platforms', platforms);
                        }}
                      />
                    </div>

                    {isEnabled && (
                      <div className="space-y-2">
                        <Label htmlFor={`platform-url-${platform.id}`}>
                          {platform.name} Link (Optional)
                        </Label>
                        <Input
                          id={`platform-url-${platform.id}`}
                          placeholder={`https://${platform.id}.com/...`}
                          value={watchedValues.platforms?.[index]?.url || ''}
                          onChange={(e) => {
                            const platforms = [...(watchedValues.platforms || [])];
                            platforms[index] = { ...platforms[index], url: e.target.value };
                            setValue('platforms', platforms);
                          }}
                        />
                        <p className="text-xs text-muted-foreground">
                          Leave empty to use default behavior
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Social Tab */}
        <TabsContent value="social" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Social Media Links</CardTitle>
              <CardDescription>Add social sharing buttons to your campaign</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {SOCIAL_PLATFORMS.map((platform) => {
                const Icon = platform.icon;
                const existingLink = watchedValues.socialLinks?.find(
                  (link) => link.platform === platform.id
                );

                return (
                  <div key={platform.id} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded flex items-center justify-center"
                        style={{ backgroundColor: platform.color }}
                      >
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      <Label>{platform.name}</Label>
                    </div>
                    <Input
                      placeholder={`https://${platform.id}.com/yourusername`}
                      value={existingLink?.url || ''}
                      onChange={(e) => {
                        const links = watchedValues.socialLinks || [];
                        const filtered = links.filter((l) => l.platform !== platform.id);

                        if (e.target.value) {
                          filtered.push({ platform: platform.id, url: e.target.value });
                        }

                        setValue('socialLinks', filtered);
                      }}
                    />
                  </div>
                );
              })}

              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  Social links will appear as share buttons on your HyperFollow page, making it easy
                  for fans to share your release.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Campaign Analytics</CardTitle>
              <CardDescription>Track performance and engagement metrics</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {campaignId ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Page Views</p>
                    <p className="text-2xl font-bold">0</p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Pre-Saves</p>
                    <p className="text-2xl font-bold">0</p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Emails Collected</p>
                    <p className="text-2xl font-bold">0</p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Conversion Rate</p>
                    <p className="text-2xl font-bold">0%</p>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center bg-muted rounded-lg">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    Save your campaign to start tracking analytics
                  </p>
                </div>
              )}

              <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <p className="text-sm">
                  <strong>Pro Tip:</strong> Analytics are updated in real-time. Track which
                  platforms your fans prefer and optimize your marketing strategy.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Shareable Link Section */}
      {watchedValues.slug && (
        <Card className="border-primary/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LinkIcon className="h-5 w-5" />
              Shareable Link
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={`${window.location.origin}/pre-save/${watchedValues.slug}`}
                className="font-mono text-sm"
              />
              <Button variant="outline" onClick={copyLink}>
                <Copy className="h-4 w-4 mr-2" />
                Copy
              </Button>
              <Button variant="outline" asChild>
                <a
                  href={`/pre-save/${watchedValues.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview Modal */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Campaign Preview</DialogTitle>
            <DialogDescription>This is how your HyperFollow page will look</DialogDescription>
          </DialogHeader>

          <div
            className="rounded-lg overflow-hidden"
            style={{
              backgroundColor: watchedValues.theme?.backgroundColor || '#0F0F0F',
              color: watchedValues.theme?.textColor || '#FFFFFF',
            }}
          >
            {/* Header Image */}
            {headerImagePreview && (
              <img src={headerImagePreview} alt="Header" className="w-full h-40 object-cover" />
            )}

            {/* Content */}
            <div className="p-6 space-y-4">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold">{watchedValues.title || 'Release Title'}</h2>
                <p className="text-lg">{watchedValues.artistName || 'Artist Name'}</p>
                {watchedValues.description && (
                  <p className="text-sm opacity-80">{watchedValues.description}</p>
                )}
              </div>

              {/* Platform Buttons */}
              <div className="space-y-2">
                {watchedValues.platforms
                  ?.filter((p) => p.enabled)
                  .map((platform) => {
                    const platformData = AVAILABLE_PLATFORMS.find((ap) => ap.id === platform.id);
                    if (!platformData) return null;
                    const Icon = platformData.icon;

                    return (
                      <button
                        key={platform.id}
                        className="w-full flex items-center justify-center gap-3 p-3 transition-opacity hover:opacity-80"
                        style={{
                          backgroundColor: watchedValues.theme?.primaryColor || '#8B5CF6',
                          borderRadius:
                            watchedValues.theme?.buttonStyle === 'pill'
                              ? '9999px'
                              : watchedValues.theme?.buttonStyle === 'square'
                                ? '0'
                                : '0.375rem',
                        }}
                      >
                        <Icon className="h-5 w-5" />
                        <span className="font-medium">{platform.name}</span>
                      </button>
                    );
                  })}
              </div>

              {/* Email Collection */}
              {watchedValues.collectEmails && (
                <div className="space-y-2">
                  <Input placeholder="Enter your email" disabled className="bg-background/10" />
                  <Button
                    className="w-full"
                    disabled
                    style={{
                      backgroundColor: watchedValues.theme?.primaryColor || '#8B5CF6',
                    }}
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Join Mailing List
                  </Button>
                </div>
              )}

              {/* Social Links */}
              {watchedValues.socialLinks && watchedValues.socialLinks.length > 0 && (
                <div className="flex justify-center gap-3 pt-4">
                  {watchedValues.socialLinks.map((link) => {
                    const socialPlatform = SOCIAL_PLATFORMS.find((sp) => sp.id === link.platform);
                    if (!socialPlatform) return null;
                    const Icon = socialPlatform.icon;

                    return (
                      <div
                        key={link.platform}
                        className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
                        style={{ backgroundColor: socialPlatform.color }}
                      >
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-4 border-t">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowPreview(true)}>
            <Eye className="h-4 w-4 mr-2" />
            Preview
          </Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={saveMutation.isPending}>
            <Check className="h-4 w-4 mr-2" />
            {campaignId ? 'Update Campaign' : 'Create Campaign'}
          </Button>
        </div>
      </div>
    </div>
  );
}
