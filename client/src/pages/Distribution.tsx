import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRequireSubscription } from '@/hooks/useRequireAuth';
import { useLocation } from 'wouter';

import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard, StatCardRow } from '@/components/ui/stat-card';
import { ChartCard, SimpleAreaChart, PlatformBreakdown } from '@/components/ui/chart-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  Upload,
  Music,
  Globe,
  Calendar as CalendarIcon,
  Clock,
  MonitorSpeaker,
  Radio,
  CheckCircle,
  XCircle,
  AlertCircle,
  Play,
  Download,
  BarChart3,
  DollarSign,
  Users,
  TrendingUp,
  Eye,
  Plus,
  Link2,
  Star,
  X,
  Share2,
  Edit,
  Trash2,
  ExternalLink,
  Headphones,
  Music2,
  Disc,
  FileAudio,
  Copy,
  Settings,
  CreditCard,
  Banknote,
  PieChart,
  Target,
  Zap,
  Shield,
  Award,
  Crown,
  Sparkles,
  MapPin,
} from 'lucide-react';
import {
  SpotifyIcon,
  AppleMusicIcon,
  YouTubeIcon,
  AmazonIcon,
  TidalIcon,
  SoundCloudIcon,
  TikTokIcon,
  InstagramIcon,
  FacebookIcon,
} from '@/components/ui/brand-icons';
import { ReleaseWizard } from '@/components/distribution/ReleaseWizard';
import { AutomatedQC } from '@/components/distribution/AutomatedQC';
import { ISRCManager } from '@/components/distribution/ISRCManager';
import { TakedownManager } from '@/components/distribution/TakedownManager';
import { EarningsReconciliation } from '@/components/distribution/EarningsReconciliation';
import { RoyaltySplitManager } from '@/components/distribution/RoyaltySplitManager';
import { ReleaseDateScheduler } from '@/components/distribution/ReleaseDateScheduler';
import { HyperFollowBuilder } from '@/components/distribution/HyperFollowBuilder';

// DistroKid Clone Interfaces
interface Release {
  id: string;
  title: string;
  artistName: string;
  releaseType: 'single' | 'album' | 'EP';
  primaryGenre: string;
  secondaryGenre?: string;
  language: string;
  releaseDate: string;
  scheduledDate?: string;
  isScheduled: boolean;
  status: 'pending' | 'live' | 'processing' | 'failed';
  platforms: Platform[];
  tracksData: Track[];
  upcCode: string;
  labelName?: string;
  copyrightYear: number;
  copyrightOwner: string;
  hyperFollowUrl?: string;
  preSaves: number;
  isExplicit: boolean;
  iTunesPricing?: string;
  earnings: number;
  totalStreams: number;
  totalDownloads: number;
  spotifyStreams: number;
  appleMusicStreams: number;
  youtubeStreams: number;
  leaveALegacy: boolean;
  legacyPrice?: number;
  albumArt?: string;
}

interface Track {
  id: string;
  trackNumber: number;
  title: string;
  duration: number;
  isrc?: string;
  audioFile: string;
  explicit: boolean;
  songwriters: Collaborator[];
  producers: Collaborator[];
  performers: Collaborator[];
  featuredArtists: Collaborator[];
  lyrics?: string;
  language: string;
  streams: number;
  downloads: number;
  earnings: number;
}

interface Collaborator {
  id: string;
  name: string;
  email: string;
  role: 'songwriter' | 'producer' | 'performer' | 'manager' | 'featured_artist';
  percentage: number;
  inviteStatus: 'pending' | 'accepted' | 'declined';
  recoupment: number;
  recoupmentPaid: number;
}

interface Platform {
  id: string;
  name: string;
  category: 'streaming' | 'social' | 'store';
  region: string;
  isActive: boolean;
  processingTime: string;
  iconUrl?: string;
  websiteUrl?: string;
  streams?: number;
  earnings?: number;
}

interface DistributionAnalytics {
  totalEarnings: number;
  totalStreams: number;
  totalReleases: number;
  pendingReleases: number;
  platformBreakdown: {
    platform: string;
    streams: number;
    earnings: number;
  }[];
}

interface HyperFollowPage {
  id: string;
  releaseId: string;
  url: string;
  isActive: boolean;
  pageViews: number;
  preSaves: number;
  clicks: number;
  collectEmails: boolean;
  fanEmails: string[];
}

interface UploadForm {
  // Basic Info
  title: string;
  artistName: string;
  releaseType: 'single' | 'album' | 'EP';
  primaryGenre: string;
  secondaryGenre: string;
  language: string;

  // Release Settings
  releaseDate: Date | null;
  isScheduled: boolean;
  scheduledDate: Date | null;
  labelName: string;
  copyrightYear: number;
  copyrightOwner: string;
  publishingRights: string;

  // Audio Files
  audioFiles: File[];
  albumArt: File | null;

  // Tracks
  tracks: {
    title: string;
    explicit: boolean;
    songwriters: string;
    producers: string;
    performers: string;
    featuredArtists: string;
    lyrics: string;
  }[];

  // Platform Selection
  selectedPlatforms: string[];

  // Advanced Settings
  isExplicit: boolean;
  iTunesPricing: string;
  leaveALegacy: boolean;
  legacyPrice: number;

  // Collaborators & Splits
  collaborators: {
    name: string;
    email: string;
    role: string;
    percentage: number;
  }[];
}

// API Response Types
interface ComprehensiveAnalytics {
  overview?: {
    totalRevenue: number;
    totalStreams: number;
  };
  streams?: {
    byPlatform: Array<{
      platform: string;
      streams: number;
      revenue: number;
    }>;
  };
}

interface AnalyticsGrowth {
  earningsGrowth: number;
  streamsGrowth: number;
  totalGrowth: number;
}

interface StreamingTrend {
  date: string;
  streams: number;
  platform: string;
}

interface GeographicData {
  country: string;
  streams: number;
  earnings: number;
}

interface EarningsBreakdown {
  thisMonth: number;
  monthGrowth: number;
  pendingPayout: number;
  nextPayoutDate: string;
}

interface PlatformEarning {
  platform: string;
  amount: number;
}

interface PayoutHistory {
  date: string;
  amount: number;
}

interface HyperFollowAnalytics {
  preSavesGrowth: number;
  viewsGrowth: number;
  conversionRate: number;
  conversionGrowth: number;
}

interface PlatformData {
  slug: string;
  name: string;
  category: 'streaming' | 'social' | 'store';
  region: string;
  processingTime: string;
  isActive?: boolean;
  iconUrl?: string;
  websiteUrl?: string;
}

interface DistroPlatform extends PlatformData {
  id: string;
  icon: any;
  color: string;
  earnings: number;
}

interface UploadSessionStatus {
  sessionId: string;
  progress: number;
  uploadedChunks: number;
  totalChunks: number;
  status: 'initializing' | 'uploading' | 'processing' | 'complete' | 'failed';
}

/**
 * TODO: Add function documentation
 */
function getPlatformIcon(slug: string) {
  const iconMap: Record<string, any> = {
    spotify: SpotifyIcon,
    'apple-music': AppleMusicIcon,
    'youtube-music': YouTubeIcon,
    'amazon-music': AmazonIcon,
    'amazon-mp3': AmazonIcon,
    tidal: TidalIcon,
    tiktok: TikTokIcon,
    instagram: InstagramIcon,
    facebook: FacebookIcon,
    soundcloud: SoundCloudIcon,
  };
  return iconMap[slug] || Music;
}

/**
 * TODO: Add function documentation
 */
function getPlatformColor(slug: string) {
  const colorMap: Record<string, string> = {
    spotify: '#1DB954',
    'apple-music': '#FA243C',
    'youtube-music': '#FF0000',
    'amazon-music': '#FF9900',
    'amazon-mp3': '#FF9900',
    tidal: '#000000',
    deezer: '#FEAA2D',
    tiktok: '#000000',
    instagram: '#E4405F',
    facebook: '#1877F2',
    pandora: '#005483',
    iheartradio: '#C6002B',
    soundcloud: '#FF3300',
    napster: '#000000',
    qobuz: '#000000',
    audiomack: '#FFA500',
    jiosaavn: '#FF6B35',
    gaana: '#FF6B35',
    melon: '#00C73C',
    anghami: '#A74CD5',
    boomplay: '#FF6B35',
    'yandex-music': '#FFCC00',
    'netease-cloud-music': '#FF6B35',
  };
  return colorMap[slug] || '#666666';
}

const GENRES = [
  'Pop',
  'Rock',
  'Hip-Hop',
  'R&B',
  'Country',
  'Electronic',
  'Jazz',
  'Classical',
  'Blues',
  'Reggae',
  'Folk',
  'Alternative',
  'Indie',
  'Punk',
  'Metal',
  'Funk',
  'Soul',
  'Gospel',
  'World',
  'Latin',
  'Ambient',
  'Experimental',
  'Lo-Fi',
];

function ComingSoonDistribution() {
  return (
    <AppLayout>
      <div className="min-h-[80vh] flex items-center justify-center p-6">
        <Card className="max-w-2xl w-full bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700">
          <CardContent className="p-12 text-center">
            <div className="mb-8">
              <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 flex items-center justify-center">
                <Radio className="w-12 h-12 text-white" />
              </div>
              <Badge variant="outline" className="mb-4 text-purple-400 border-purple-400">
                <Clock className="w-3 h-3 mr-1" />
                Extended Testing
              </Badge>
              <h1 className="text-4xl font-bold text-white mb-4">Distribution</h1>
              <p className="text-xl text-gray-400 mb-2">Coming Soon</p>
              <div className="flex items-center justify-center gap-2 text-2xl font-semibold text-purple-400">
                <CalendarIcon className="w-6 h-6" />
                February 1st, 2026
              </div>
            </div>
            <p className="text-gray-400 mb-8 max-w-md mx-auto">
              We're putting our distribution system through extended testing to ensure 
              the highest quality experience for getting your music on all major platforms.
            </p>
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700">
                <Shield className="w-8 h-8 text-green-400 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Quality Assured</p>
              </div>
              <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700">
                <Zap className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Fast Delivery</p>
              </div>
              <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700">
                <Music className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                <p className="text-sm text-gray-400">All Platforms</p>
              </div>
            </div>
            <p className="text-sm text-gray-500">Thank you for your patience while we perfect this feature.</p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

export default function Distribution() {
  const { user, isLoading } = useRequireSubscription();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const albumArtRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState('overview');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isHyperFollowOpen, setIsHyperFollowOpen] = useState(false);
  const [showReleaseDetails, setShowReleaseDetails] = useState(false);
  const [showEditRelease, setShowEditRelease] = useState(false);
  const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);

  // Upload Form State
  const [uploadForm, setUploadForm] = useState<UploadForm>({
    title: '',
    artistName: '',
    releaseType: 'single',
    primaryGenre: '',
    secondaryGenre: '',
    language: 'English',
    releaseDate: null,
    isScheduled: false,
    scheduledDate: null,
    labelName: '',
    copyrightYear: new Date().getFullYear(),
    copyrightOwner: '',
    publishingRights: 'Independent',
    audioFiles: [],
    albumArt: null,
    tracks: [],
    selectedPlatforms: ['spotify', 'apple-music', 'youtube-music', 'amazon-music'],
    isExplicit: false,
    iTunesPricing: 'standard',
    leaveALegacy: false,
    legacyPrice: 29,
    collaborators: [],
  });

  // Chunked Upload State
  const [uploadSessions, setUploadSessions] = useState<any[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [eta, setETA] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [generatedISRC, setGeneratedISRC] = useState<string>('');
  const [generatedUPC, setGeneratedUPC] = useState<string>('');

  // Data Queries
  const { data: releases = [], isLoading: releasesLoading } = useQuery<Release[]>({
    queryKey: ['/api/distribution/releases'],
    enabled: !!user,
  });

  const {
    data: comprehensiveAnalytics,
    isLoading: analyticsLoading,
    error: analyticsError,
  } = useQuery<ComprehensiveAnalytics>({
    queryKey: ['/api/analytics/dashboard'],
    enabled: !!user,
  });

  // Extract distribution-specific analytics from comprehensive data
  const analytics: DistributionAnalytics = comprehensiveAnalytics
    ? {
        totalEarnings: comprehensiveAnalytics.overview?.totalRevenue || 0,
        totalStreams: comprehensiveAnalytics.overview?.totalStreams || 0,
        totalReleases: releases.length,
        pendingReleases: releases.filter((r: Release) => r.status === 'pending').length,
        platformBreakdown:
          comprehensiveAnalytics.streams?.byPlatform?.map((p) => ({
            platform: p.platform,
            streams: p.streams,
            earnings: p.revenue,
          })) || [],
      }
    : {
        totalEarnings: 0,
        totalStreams: 0,
        totalReleases: releases.length,
        pendingReleases: releases.filter((r: Release) => r.status === 'pending').length,
        platformBreakdown: [],
      };

  const { data: hyperFollowPages = [], isLoading: hyperFollowLoading } = useQuery<
    HyperFollowPage[]
  >({
    queryKey: ['/api/distribution/hyperfollow'],
  });

  const { data: analyticsGrowth } = useQuery<AnalyticsGrowth>({
    queryKey: ['/api/distribution/analytics/growth'],
    enabled: !!user,
  });

  const { data: streamingTrends = [] } = useQuery<StreamingTrend[]>({
    queryKey: ['/api/distribution/streaming-trends'],
    enabled: !!user,
  });

  const { data: geographicData = [] } = useQuery<GeographicData[]>({
    queryKey: ['/api/distribution/geographic'],
    enabled: !!user,
  });

  const { data: earningsBreakdown } = useQuery<EarningsBreakdown>({
    queryKey: ['/api/distribution/earnings/breakdown'],
    enabled: !!user,
  });

  const { data: platformEarnings = [] } = useQuery<PlatformEarning[]>({
    queryKey: ['/api/distribution/platform-earnings'],
    enabled: !!user,
  });

  const { data: payoutHistory = [] } = useQuery<PayoutHistory[]>({
    queryKey: ['/api/distribution/payout-history'],
    enabled: !!user,
  });

  const { data: hyperFollowAnalytics } = useQuery<HyperFollowAnalytics>({
    queryKey: ['/api/distribution/hyperfollow/analytics'],
    enabled: !!user,
  });

  const { data: platformsData = [], isLoading: platformsLoading } = useQuery<PlatformData[]>({
    queryKey: ['/api/distribution/platforms'],
    enabled: !!user,
  });

  const DISTRO_PLATFORMS: DistroPlatform[] = platformsData.map((platform) => {
    const platformEarning = platformEarnings.find((p) => p.platform === platform.name);
    return {
      ...platform,
      id: platform.slug,
      icon: getPlatformIcon(platform.slug),
      color: getPlatformColor(platform.slug),
      earnings: platformEarning?.amount ?? 0,
    };
  });

  // Mutations
  const uploadReleaseMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await apiRequest('POST', '/api/distribution/upload', formData);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Release uploaded successfully!',
        description: 'Your music is now being processed for distribution.',
      });
      setIsUploadOpen(false);
      setCurrentStep(1);
      setUploadForm({
        title: '',
        artistName: '',
        releaseType: 'single',
        primaryGenre: '',
        secondaryGenre: '',
        language: 'English',
        releaseDate: null,
        isScheduled: false,
        scheduledDate: null,
        labelName: '',
        copyrightYear: new Date().getFullYear(),
        copyrightOwner: '',
        publishingRights: 'Independent',
        audioFiles: [],
        albumArt: null,
        tracks: [],
        selectedPlatforms: ['spotify', 'apple-music', 'youtube-music', 'amazon-music'],
        isExplicit: false,
        iTunesPricing: 'standard',
        leaveALegacy: false,
        legacyPrice: 29,
        collaborators: [],
      });
      queryClient.invalidateQueries({ queryKey: ['/api/distribution/releases'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Upload failed',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const createHyperFollowMutation = useMutation({
    mutationFn: async (releaseId: string) => {
      const response = await apiRequest('POST', '/api/distribution/hyperfollow', { releaseId });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'HyperFollow page created!',
        description: `Your pre-save page is live at ${data.url}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/distribution/hyperfollow'] });
    },
  });

  // Chunked Upload Mutations
  const initUploadMutation = useMutation({
    mutationFn: async ({ filename, totalSize }: { filename: string; totalSize: number }) => {
      const response = await apiRequest('POST', '/api/distribution/upload/init', {
        filename,
        totalSize,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setActiveSessionId(data.sessionId);
      toast({
        title: 'Upload session initialized',
        description: `Ready to upload ${data.totalChunks} chunks`,
      });
    },
  });

  const uploadChunkMutation = useMutation({
    mutationFn: async ({ sessionId, chunkIndex, chunkData, chunkHash }: { sessionId: string; chunkIndex: number; chunkData: ArrayBuffer; chunkHash: string }) => {
      const formData = new FormData();
      formData.append('chunk', new Blob([chunkData]));
      formData.append('chunkIndex', chunkIndex.toString());
      formData.append('chunkHash', chunkHash);

      const response = await apiRequest(
        'POST',
        `/api/distribution/upload/${sessionId}/chunk`,
        formData
      );
      return response.json();
    },
  });

  const finalizeUploadMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest(
        'POST',
        `/api/distribution/upload/${sessionId}/finalize`,
        {}
      );
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Upload complete!',
        description: 'Your file has been uploaded successfully',
      });
      setActiveSessionId(null);
    },
  });

  const generateISRCMutation = useMutation({
    mutationFn: async ({
      trackId,
      artist,
      title,
    }: {
      trackId: string;
      artist: string;
      title: string;
    }) => {
      const response = await apiRequest('POST', '/api/distribution/codes/isrc', {
        trackId,
        artist,
        title,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setGeneratedISRC(data.isrc);
      toast({
        title: 'ISRC generated',
        description: `Code: ${data.isrc}`,
      });
    },
  });

  const generateUPCMutation = useMutation({
    mutationFn: async ({ releaseId, title }: { releaseId: string; title: string }) => {
      const response = await apiRequest('POST', '/api/distribution/codes/upc', {
        releaseId,
        title,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setGeneratedUPC(data.upc);
      toast({
        title: 'UPC generated',
        description: `Code: ${data.upc}`,
      });
    },
  });

  const submitToSpotifyMutation = useMutation({
    mutationFn: async ({ releaseId, credentials }: { releaseId: string; credentials?: Record<string, string> }) => {
      const response = await apiRequest('POST', '/api/distribution/platform/spotify', {
        releaseId,
        credentials,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Submitted to Spotify',
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/distribution/releases'] });
    },
  });

  const submitToAppleMutation = useMutation({
    mutationFn: async ({ releaseId, credentials }: { releaseId: string; credentials?: Record<string, string> }) => {
      const response = await apiRequest('POST', '/api/distribution/platform/apple', {
        releaseId,
        credentials,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Submitted to Apple Music',
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/distribution/releases'] });
    },
  });

  const submitToYouTubeMutation = useMutation({
    mutationFn: async ({ releaseId, credentials }: { releaseId: string; credentials?: Record<string, string> }) => {
      const response = await apiRequest('POST', '/api/distribution/platform/youtube', {
        releaseId,
        credentials,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Submitted to YouTube',
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/distribution/releases'] });
    },
  });

  const { data: uploadSessionStatus } = useQuery<UploadSessionStatus | null>({
    queryKey: ['/api/distribution/upload', activeSessionId, 'status'],
    enabled: !!activeSessionId && !isPaused,
    refetchInterval: 2000,
    queryFn: async () => {
      if (!activeSessionId) return null;
      const response = await fetch(`/api/distribution/upload/${activeSessionId}/status`, {
        credentials: 'include',
      });
      return response.json();
    },
  });

  const exportReportMutation = useMutation({
    mutationFn: async (format: 'csv' | 'pdf' = 'csv') => {
      if (format === 'pdf') {
        try {
          // Generate PDF using jsPDF
          const { jsPDF } = await import('jspdf');
          const { default: autoTable } = await import('jspdf-autotable');
          
          const doc = new jsPDF();
          
          // Add title
          doc.setFontSize(18);
          doc.text('Distribution Report', 14, 20);
          
          // Add metadata
          doc.setFontSize(10);
          doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 30);
          doc.text(`User: ${user?.username || 'Unknown'}`, 14, 36);
          
          // Prepare table data from actual releases
          const releases = releasesData?.releases || [];
          const tableData = releases.map((release: any) => [
            release.title || 'Untitled',
            release.artistName || 'Unknown Artist',
            release.genre || 'N/A',
            release.releaseDate ? new Date(release.releaseDate).toLocaleDateString() : 'Not Set',
            release.status || 'Draft',
            release.platforms?.length || 0,
          ]);
          
          // Add table
          autoTable(doc, {
            startY: 45,
            head: [['Title', 'Artist', 'Genre', 'Release Date', 'Status', 'Platforms']],
            body: tableData.length > 0 ? tableData : [['No releases found', '', '', '', '', '']],
            theme: 'striped',
            headStyles: { fillColor: [59, 130, 246] },
            styles: { fontSize: 9 },
          });
          
          // Add summary
          const finalY = (doc as any).lastAutoTable?.finalY || 60;
          doc.setFontSize(12);
          doc.text('Summary', 14, finalY + 15);
          doc.setFontSize(10);
          doc.text(`Total Releases: ${releases.length}`, 14, finalY + 23);
          doc.text(
            `Active Releases: ${releases.filter((r: any) => r.status === 'published').length}`,
            14,
            finalY + 29
          );
          doc.text(
            `Draft Releases: ${releases.filter((r: any) => r.status === 'draft').length}`,
            14,
            finalY + 35
          );
          
          // Save the PDF
          doc.save(`distribution-report-${Date.now()}.pdf`);
          return;
        } catch (error) {
          throw new Error('Failed to generate PDF. Please try again.');
        }
      }

      // CSV export
      const response = await fetch('/api/distribution/export-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ format: 'csv' }),
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Download the CSV
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `distribution-report-${Date.now()}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Report exported successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to export report',
        variant: 'destructive',
      });
    },
  });

  // Handler Functions
  const handleFileUpload = (files: FileList | null, type: 'audio' | 'artwork') => {
    if (!files) return;

    if (type === 'audio') {
      const audioFiles = Array.from(files).filter(
        (file) => file.type.includes('audio') || file.name.match(/\.(mp3|wav|flac|aac|ogg)$/i)
      );

      setUploadForm((prev) => ({
        ...prev,
        audioFiles: [...prev.audioFiles, ...audioFiles],
        tracks: audioFiles.map((file, index) => ({
          title: file.name.replace(/\.[^/.]+$/, ''),
          explicit: false,
          songwriters: '',
          producers: '',
          performers: '',
          featuredArtists: '',
          lyrics: '',
        })),
      }));
    } else {
      const imageFile = files[0];
      if (imageFile && imageFile.type.includes('image')) {
        setUploadForm((prev) => ({ ...prev, albumArt: imageFile }));
      }
    }
  };

  const handleUploadSubmit = async () => {
    const formData = new FormData();

    // Add form data
    formData.append('title', uploadForm.title);
    formData.append('artistName', uploadForm.artistName);
    formData.append('releaseType', uploadForm.releaseType);
    formData.append('primaryGenre', uploadForm.primaryGenre);
    formData.append('secondaryGenre', uploadForm.secondaryGenre);
    formData.append('language', uploadForm.language);
    formData.append('releaseDate', uploadForm.releaseDate?.toISOString() || '');
    formData.append('isScheduled', uploadForm.isScheduled.toString());
    formData.append('scheduledDate', uploadForm.scheduledDate?.toISOString() || '');
    formData.append('labelName', uploadForm.labelName);
    formData.append('copyrightYear', uploadForm.copyrightYear.toString());
    formData.append('copyrightOwner', uploadForm.copyrightOwner);
    formData.append('publishingRights', uploadForm.publishingRights);
    formData.append('selectedPlatforms', JSON.stringify(uploadForm.selectedPlatforms));
    formData.append('isExplicit', uploadForm.isExplicit.toString());
    formData.append('iTunesPricing', uploadForm.iTunesPricing);
    formData.append('leaveALegacy', uploadForm.leaveALegacy.toString());
    formData.append('legacyPrice', uploadForm.legacyPrice.toString());
    formData.append('tracks', JSON.stringify(uploadForm.tracks));
    formData.append('collaborators', JSON.stringify(uploadForm.collaborators));

    // Add files
    uploadForm.audioFiles.forEach((file, index) => {
      formData.append(`audioFile_${index}`, file);
    });

    if (uploadForm.albumArt) {
      formData.append('albumArt', uploadForm.albumArt);
    }

    uploadReleaseMutation.mutate(formData);
  };

  const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, 5));
  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 1));

  if (isLoading) {
    return (
      <AppLayout>
        <div className="max-w-7xl mx-auto p-6 space-y-6">
          <div className="animate-pulse space-y-4">
            <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
              ))}
            </div>
            <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-64 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
              ))}
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!user) return null;

  if (user.role !== 'admin') {
    return <ComingSoonDistribution />;
  }

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header Section */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-200/60 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Music Distribution
              </h1>
              <p className="text-gray-600 dark:text-gray-300 mt-2 text-lg">
                Get your music on 150+ platforms including Spotify, Apple Music, and TikTok
              </p>
              <div className="flex items-center space-x-4 mt-4">
                <Badge variant="outline" className="border-green-200 text-green-700 bg-green-50">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  No annual fees
                </Badge>
                <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50">
                  <Zap className="w-3 h-3 mr-1" />
                  Keep 100% royalties
                </Badge>
                <Badge variant="outline" className="border-purple-200 text-purple-700 bg-purple-50">
                  <Crown className="w-3 h-3 mr-1" />
                  HyperFollow pre-saves
                </Badge>
              </div>
            </div>
            <Button
              onClick={() => setIsUploadOpen(true)}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-3 text-lg shadow-lg"
              data-testid="button-upload-music"
            >
              <Upload className="w-5 h-5 mr-2" />
              Upload Music
            </Button>
          </div>
        </div>

        {/* Analytics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-green-700 dark:text-green-300">
                    Total Earnings
                  </p>
                  <p className="text-3xl font-bold text-green-900 dark:text-green-100">
                    ${(analytics?.totalEarnings ?? 0).toFixed(2)}
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                    {analyticsGrowth?.earningsGrowth
                      ? `+${analyticsGrowth.earningsGrowth.toFixed(1)}% this month`
                      : 'No change'}
                  </p>
                </div>
                <div className="p-3 bg-green-200 dark:bg-green-800 rounded-full">
                  <DollarSign className="w-6 h-6 text-green-700 dark:text-green-300" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-50 to-cyan-100 dark:from-blue-900/20 dark:to-cyan-900/20 border-blue-200 dark:border-blue-800">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    Total Streams
                  </p>
                  <p className="text-3xl font-bold text-blue-900 dark:text-blue-100">
                    {(analytics?.totalStreams ?? 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    {analyticsGrowth?.streamsGrowth
                      ? `+${analyticsGrowth.streamsGrowth.toFixed(1)}% this month`
                      : 'No change'}
                  </p>
                </div>
                <div className="p-3 bg-blue-200 dark:bg-blue-800 rounded-full">
                  <Play className="w-6 h-6 text-blue-700 dark:text-blue-300" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-violet-100 dark:from-purple-900/20 dark:to-violet-900/20 border-purple-200 dark:border-purple-800">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-purple-700 dark:text-purple-300">
                    Live Releases
                  </p>
                  <p className="text-3xl font-bold text-purple-900 dark:text-purple-100">
                    {analytics?.totalReleases ?? 0}
                  </p>
                  <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                    {releases.filter((r) => r.status === 'processing').length} processing
                  </p>
                </div>
                <div className="p-3 bg-purple-200 dark:bg-purple-800 rounded-full">
                  <Music className="w-6 h-6 text-purple-700 dark:text-purple-300" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-50 to-amber-100 dark:from-orange-900/20 dark:to-amber-900/20 border-orange-200 dark:border-orange-800">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-orange-700 dark:text-orange-300">
                    Platforms
                  </p>
                  <p className="text-3xl font-bold text-orange-900 dark:text-orange-100">150+</p>
                  <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">All connected</p>
                </div>
                <div className="p-3 bg-orange-200 dark:bg-orange-800 rounded-full">
                  <Globe className="w-6 h-6 text-orange-700 dark:text-orange-300" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="overflow-x-auto">
            <TabsList className="inline-flex w-auto min-w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <TabsTrigger
                value="overview"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white whitespace-nowrap"
                data-testid="tab-overview"
              >
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="releases"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white whitespace-nowrap"
                data-testid="tab-releases"
              >
                My Releases
              </TabsTrigger>
              <TabsTrigger
                value="new-release"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white whitespace-nowrap"
                data-testid="tab-new-release"
              >
                <Plus className="w-4 h-4 mr-1" />
                New Release
              </TabsTrigger>
              <TabsTrigger
                value="quality"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white whitespace-nowrap"
                data-testid="tab-quality"
              >
                <Shield className="w-4 h-4 mr-1" />
                QC
              </TabsTrigger>
              <TabsTrigger
                value="codes"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white whitespace-nowrap"
                data-testid="tab-codes"
              >
                ISRC/UPC
              </TabsTrigger>
              <TabsTrigger
                value="scheduling"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white whitespace-nowrap"
                data-testid="tab-scheduling"
              >
                <CalendarIcon className="w-4 h-4 mr-1" />
                Scheduling
              </TabsTrigger>
              <TabsTrigger
                value="splits"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white whitespace-nowrap"
                data-testid="tab-splits"
              >
                <Users className="w-4 h-4 mr-1" />
                Splits
              </TabsTrigger>
              <TabsTrigger
                value="earnings"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white whitespace-nowrap"
                data-testid="tab-earnings"
              >
                Earnings
              </TabsTrigger>
              <TabsTrigger
                value="takedowns"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white whitespace-nowrap"
                data-testid="tab-takedowns"
              >
                Takedowns
              </TabsTrigger>
              <TabsTrigger
                value="rights"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white whitespace-nowrap"
                data-testid="tab-rights"
              >
                <Award className="w-4 h-4 mr-1" />
                Rights
              </TabsTrigger>
              <TabsTrigger
                value="hyperfollow"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white whitespace-nowrap"
                data-testid="tab-hyperfollow"
              >
                Pre-Save
              </TabsTrigger>
              <TabsTrigger
                value="analytics"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white whitespace-nowrap"
                data-testid="tab-analytics"
              >
                Analytics
              </TabsTrigger>
              <TabsTrigger
                value="platforms"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white whitespace-nowrap"
                data-testid="tab-platforms"
              >
                Platforms
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent Releases */}
              <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center text-gray-900 dark:text-white">
                    <Music className="w-5 h-5 mr-2 text-blue-600" />
                    Recent Releases
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {releasesLoading ? (
                    <div className="space-y-4">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="animate-pulse flex items-center space-x-4">
                          <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
                          <div className="flex-1">
                            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
                            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : releases.length === 0 ? (
                    <div className="text-center py-8">
                      <Upload className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                      <p className="text-gray-500 dark:text-gray-400 mb-4">No releases yet</p>
                      <Button
                        onClick={() => setIsUploadOpen(true)}
                        className="bg-blue-600 hover:bg-blue-700"
                        data-testid="button-upload-first-release"
                      >
                        Upload Your First Release
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {releases.slice(0, 5).map((release: unknown) => (
                        <div
                          key={release.id}
                          className="flex items-center space-x-4 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                        >
                          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                            <Music className="w-6 h-6 text-white" />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-gray-900 dark:text-white">
                              {release.title}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {release.artistName}
                            </p>
                          </div>
                          <Badge variant={release.status === 'live' ? 'default' : 'secondary'}>
                            {release.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Quick Stats */}
              <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center text-gray-900 dark:text-white">
                    <BarChart3 className="w-5 h-5 mr-2 text-purple-600" />
                    Platform Performance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {DISTRO_PLATFORMS.slice(0, 6).map((platform) => {
                      const IconComponent = platform.icon;
                      return (
                        <div
                          key={platform.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50"
                        >
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center shadow-sm">
                              <IconComponent className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white text-sm">
                                {platform.name}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {platform.processingTime}
                              </p>
                            </div>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            Connected
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Releases Tab */}
          <TabsContent value="releases" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">My Releases</h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Manage and track your distributed music
                </p>
              </div>
              <Button
                onClick={() => setIsUploadOpen(true)}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                data-testid="button-new-release"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Release
              </Button>
            </div>

            {releasesLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="p-6">
                      <div className="w-full h-48 bg-gray-200 dark:bg-gray-700 rounded-lg mb-4"></div>
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-4"></div>
                      <div className="flex justify-between">
                        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
                        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : releases.length === 0 ? (
              <Card className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-blue-200 dark:border-blue-800">
                <CardContent className="p-12 text-center">
                  <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Music className="w-12 h-12 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                    No Releases Yet
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
                    Start your music distribution journey by uploading your first release to 150+
                    platforms worldwide.
                  </p>
                  <Button
                    onClick={() => setIsUploadOpen(true)}
                    className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 px-8 py-3"
                    data-testid="button-upload-first-release-cta"
                  >
                    <Upload className="w-5 h-5 mr-2" />
                    Upload Your First Release
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {releases.map((release: unknown) => (
                  <Card
                    key={release.id}
                    className="group hover:shadow-xl transition-all duration-300 border border-gray-200 dark:border-gray-700"
                  >
                    <CardContent className="p-0">
                      {/* Album Art */}
                      <div className="relative">
                        <div className="w-full h-48 bg-gradient-to-br from-blue-500 to-purple-600 rounded-t-lg flex items-center justify-center">
                          {release.albumArt ? (
                            <img
                              src={release.albumArt}
                              alt={release.title}
                              className="w-full h-full object-cover rounded-t-lg"
                            />
                          ) : (
                            <Music className="w-16 h-16 text-white opacity-50" />
                          )}
                        </div>
                        <div className="absolute top-3 right-3">
                          <Badge
                            variant={
                              release.status === 'live'
                                ? 'default'
                                : release.status === 'processing'
                                  ? 'secondary'
                                  : 'destructive'
                            }
                            className="backdrop-blur-sm bg-white/90 dark:bg-gray-800/90"
                          >
                            {release.status}
                          </Badge>
                        </div>
                        <div className="absolute bottom-3 left-3 right-3">
                          <div className="flex items-center justify-between text-white">
                            <div className="flex items-center space-x-2">
                              <Play className="w-4 h-4" />
                              <span className="text-sm font-medium">
                                {release.totalStreams?.toLocaleString() || '0'}
                              </span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <DollarSign className="w-4 h-4" />
                              <span className="text-sm font-medium">
                                ${release.earnings?.toFixed(2) || '0.00'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Release Info */}
                      <div className="p-6">
                        <div className="mb-4">
                          <h3 className="font-semibold text-gray-900 dark:text-white text-lg mb-1 line-clamp-1">
                            {release.title}
                          </h3>
                          <p className="text-gray-600 dark:text-gray-400 text-sm mb-2">
                            {release.artistName}
                          </p>
                          <div className="flex items-center space-x-2">
                            <Badge variant="outline" className="text-xs">
                              {release.releaseType}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {release.primaryGenre}
                            </Badge>
                            {release.isExplicit && (
                              <Badge variant="destructive" className="text-xs">
                                Explicit
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            <p className="text-2xl font-bold text-blue-600">
                              {release.tracksData?.length || 0}
                            </p>
                            <p className="text-xs text-gray-500">Tracks</p>
                          </div>
                          <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            <p className="text-2xl font-bold text-green-600">
                              {release.platforms?.length || 0}
                            </p>
                            <p className="text-xs text-gray-500">Platforms</p>
                          </div>
                        </div>

                        {/* Release Date */}
                        <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 mb-4">
                          <div className="flex items-center space-x-1">
                            <CalendarIcon className="w-4 h-4" />
                            <span>{new Date(release.releaseDate).toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Globe className="w-4 h-4" />
                            <span>{release.upcCode}</span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => {
                              setSelectedRelease(release);
                              setShowReleaseDetails(true);
                            }}
                            data-testid={`button-view-release-${release.id}`}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            View
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedRelease(release);
                              setShowEditRelease(true);
                            }}
                            data-testid={`button-edit-release-${release.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const shareUrl = `https://maxbooster.ai/release/${release.id}`;
                              navigator.clipboard.writeText(shareUrl);
                              toast({
                                title: 'Share Link Copied',
                                description: 'Release link copied to clipboard!',
                              });
                            }}
                            data-testid={`button-share-release-${release.id}`}
                          >
                            <Share2 className="w-4 h-4" />
                          </Button>
                        </div>

                        {/* HyperFollow */}
                        {release.hyperFollowUrl && (
                          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <Link2 className="w-4 h-4 text-blue-600" />
                                <span className="text-sm font-medium text-gray-900 dark:text-white">
                                  HyperFollow
                                </span>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => window.open(release.hyperFollowUrl, '_blank')}
                                data-testid={`button-hyperfollow-external-${release.id}`}
                              >
                                <ExternalLink className="w-4 h-4" />
                              </Button>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              {release.preSaves || 0} pre-saves
                            </p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="new-release" className="space-y-6">
            <ReleaseWizard
              onComplete={() => {
                toast({
                  title: 'Success!',
                  description: 'Your release has been submitted for distribution.',
                });
                setActiveTab('releases');
                queryClient.invalidateQueries({ queryKey: ['/api/distribution/releases'] });
              }}
              onCancel={() => setActiveTab('releases')}
            />
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            {/* Modern Analytics Stats with Sparklines */}
            <StatCardRow>
              <StatCard
                title="Total Streams"
                value={analytics?.totalStreams ?? 0}
                change={analyticsGrowth?.streamsGrowth ?? 0}
                trend={analyticsGrowth?.streamsGrowth && analyticsGrowth.streamsGrowth > 0 ? 'up' : 'neutral'}
                sparklineData={streamingTrends?.slice(-7)?.map((w: { streams: number }) => w.streams) ?? []}
                icon={<Play className="h-5 w-5" />}
              />
              <StatCard
                title="Total Earnings"
                value={analytics?.totalEarnings ?? 0}
                change={analyticsGrowth?.earningsGrowth ?? 0}
                trend={analyticsGrowth?.earningsGrowth && analyticsGrowth.earningsGrowth > 0 ? 'up' : 'neutral'}
                prefix="$"
                sparklineData={[]}
                icon={<DollarSign className="h-5 w-5" />}
              />
              <StatCard
                title="Avg. Per Stream"
                value={Number(((analytics?.totalEarnings ?? 0) / Math.max(analytics?.totalStreams ?? 1, 1)).toFixed(4))}
                change={0}
                trend="neutral"
                prefix="$"
                sparklineData={[]}
                icon={<Target className="h-5 w-5" />}
              />
              <StatCard
                title="Active Platforms"
                value={analytics?.platformBreakdown?.length ?? 0}
                change={0}
                trend="neutral"
                sparklineData={[]}
                icon={<Globe className="h-5 w-5" />}
              />
            </StatCardRow>

            {/* Revenue Trends & Platform Breakdown Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ChartCard
                title="Revenue Trends"
                subtitle="Last 30 days earnings"
                icon={<TrendingUp className="h-5 w-5 text-blue-500" />}
              >
                {streamingTrends && streamingTrends.length > 0 ? (
                  <SimpleAreaChart
                    data={streamingTrends?.map((w: { date: string; streams: number }) => ({
                      label: w.date,
                      value: w.streams,
                    })) ?? []}
                    height={180}
                  />
                ) : (
                  <div className="h-48 flex items-center justify-center text-slate-500">
                    <div className="text-center">
                      <TrendingUp className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                      <p className="text-sm">No trend data yet</p>
                      <p className="text-xs text-slate-600">Release music to see revenue trends</p>
                    </div>
                  </div>
                )}
              </ChartCard>

              <ChartCard
                title="Platform Breakdown"
                subtitle="Earnings by platform"
                icon={<PieChart className="h-5 w-5 text-blue-500" />}
              >
                {analytics?.platformBreakdown && analytics.platformBreakdown.length > 0 ? (
                  <PlatformBreakdown
                    platforms={analytics.platformBreakdown.slice(0, 5).map((p: { platform: string; earnings: number }, i: number) => {
                      const platformColors: Record<string, string> = {
                        'Spotify': '#1DB954',
                        'Apple Music': '#FA2D48',
                        'YouTube Music': '#FF0000',
                        'Amazon Music': '#00A8E1',
                        'Deezer': '#FEAA2D',
                        'Tidal': '#000000',
                        'TikTok': '#00F2EA',
                      };
                      const defaultColors = ['#06b6d4', '#a855f7', '#f43f5e', '#f97316', '#84cc16'];
                      return {
                        name: p.platform,
                        value: p.earnings,
                        color: platformColors[p.platform] || defaultColors[i % defaultColors.length],
                      };
                    })}
                  />
                ) : (
                  <div className="h-48 flex items-center justify-center text-slate-500">
                    <div className="text-center">
                      <Globe className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                      <p className="text-sm">No platform data yet</p>
                      <p className="text-xs text-slate-600">Distribute music to see earnings breakdown</p>
                    </div>
                  </div>
                )}
              </ChartCard>
            </div>

            {/* Platform Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BarChart3 className="w-5 h-5 mr-2" />
                  Platform Performance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {analytics?.platformBreakdown && analytics.platformBreakdown.length > 0 ? (
                    analytics.platformBreakdown.map((platform, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition"
                      >
                        <div className="flex items-center space-x-4 flex-1">
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                            <Music className="w-6 h-6 text-white" />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900 dark:text-white">
                              {platform.platform}
                            </p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {(platform.streams ?? 0).toLocaleString()} streams
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold text-green-600 dark:text-green-400">
                            ${(platform.earnings ?? 0).toFixed(2)}
                          </p>
                          <p className="text-xs text-gray-500">
                            $
                            {(
                              (platform.earnings ?? 0) / Math.max(platform.streams ?? 1, 1)
                            ).toFixed(4)}
                            /stream
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12">
                      <Globe className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">No platform data available yet</p>
                      <p className="text-sm text-gray-400 mt-2">
                        Your analytics will appear here once you have releases live
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Streaming Trends */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Streaming Trends (30 Days)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {streamingTrends.length > 0 ? (
                      streamingTrends.map((week: unknown, index: number) => (
                        <div key={index} className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {week.date}
                          </span>
                          <div className="flex items-center space-x-3">
                            <div className="w-32">
                              <Progress
                                value={
                                  (week.streams /
                                    Math.max(
                                      ...streamingTrends.map((w: unknown) => w.streams),
                                      1
                                    )) *
                                  100
                                }
                                className="h-2"
                              />
                            </div>
                            <span className="text-sm font-semibold text-gray-900 dark:text-white w-16 text-right">
                              {week.streams.toLocaleString()}
                            </span>
                            <Badge
                              variant="outline"
                              className="border-green-200 text-green-700 bg-green-50"
                            >
                              {week.change > 0 ? `+${week.change}%` : `${week.change}%`}
                            </Badge>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-center text-gray-500 py-4">
                        No streaming data available yet
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Top Performing Releases</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {releases.slice(0, 4).map((release, index) => (
                      <div
                        key={release.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                            <span className="text-white font-bold text-sm">{index + 1}</span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {release.title}
                            </p>
                            <p className="text-xs text-gray-500">
                              {release.totalStreams?.toLocaleString() ?? 0} streams
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-green-600 dark:text-green-400">
                            ${(release.earnings ?? 0).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Geographic Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <MapPin className="w-5 h-5 mr-2" />
                  Top Regions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {geographicData.length > 0 ? (
                    geographicData.map((region: unknown, index: number) => (
                      <div
                        key={index}
                        className="p-4 rounded-lg border border-gray-200 dark:border-gray-700"
                      >
                        <p className="font-semibold text-gray-900 dark:text-white mb-1">
                          {region.region}
                        </p>
                        <p className="text-2xl font-bold text-blue-600">
                          {region.streams.toLocaleString()}
                        </p>
                        <Progress value={region.percentage} className="h-1 mt-2" />
                        <p className="text-xs text-gray-500 mt-1">{region.percentage}% of total</p>
                      </div>
                    ))
                  ) : (
                    <p className="col-span-full text-center text-gray-500 py-4">
                      No geographic data available yet
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="earnings" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Earnings & Royalties
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Track your revenue across all platforms
                </p>
              </div>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportReportMutation.mutate()}
                  disabled={exportReportMutation.isPending}
                  data-testid="button-export-report"
                >
                  <Download className="w-4 h-4 mr-2" />
                  {exportReportMutation.isPending ? 'Exporting...' : 'Export Report'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/settings?tab=payments')}
                  data-testid="button-payment-settings"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Payment Settings
                </Button>
              </div>
            </div>

            {/* Earnings Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-green-700 dark:text-green-300">
                        Total Earnings
                      </p>
                      <p className="text-3xl font-bold text-green-900 dark:text-green-100">
                        ${(analytics?.totalEarnings ?? 0).toFixed(2)}
                      </p>
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                        {earningsBreakdown?.totalGrowth
                          ? `+${earningsBreakdown.totalGrowth.toFixed(1)}% this month`
                          : analyticsGrowth?.earningsGrowth
                            ? `+${analyticsGrowth.earningsGrowth.toFixed(1)}% this month`
                            : 'No change'}
                      </p>
                    </div>
                    <div className="p-3 bg-green-200 dark:bg-green-800 rounded-full">
                      <DollarSign className="w-6 h-6 text-green-700 dark:text-green-300" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-blue-50 to-cyan-100 dark:from-blue-900/20 dark:to-cyan-900/20 border-blue-200 dark:border-blue-800">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                        This Month
                      </p>
                      <p className="text-3xl font-bold text-blue-900 dark:text-blue-100">
                        ${(earningsBreakdown?.thisMonth ?? 0).toFixed(2)}
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                        {earningsBreakdown?.monthGrowth
                          ? `+${earningsBreakdown.monthGrowth.toFixed(1)}% from last month`
                          : 'No change'}
                      </p>
                    </div>
                    <div className="p-3 bg-blue-200 dark:bg-blue-800 rounded-full">
                      <TrendingUp className="w-6 h-6 text-blue-700 dark:text-blue-300" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-purple-50 to-violet-100 dark:from-purple-900/20 dark:to-violet-900/20 border-purple-200 dark:border-purple-800">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-purple-700 dark:text-purple-300">
                        Pending Payout
                      </p>
                      <p className="text-3xl font-bold text-purple-900 dark:text-purple-100">
                        ${(earningsBreakdown?.pendingPayout ?? 0).toFixed(2)}
                      </p>
                      <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                        Next payout:{' '}
                        {earningsBreakdown?.nextPayoutDate
                          ? new Date(earningsBreakdown.nextPayoutDate).toLocaleDateString()
                          : 'TBD'}
                      </p>
                    </div>
                    <div className="p-3 bg-purple-200 dark:bg-purple-800 rounded-full">
                      <Clock className="w-6 h-6 text-purple-700 dark:text-purple-300" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-orange-50 to-amber-100 dark:from-orange-900/20 dark:to-amber-900/20 border-orange-200 dark:border-orange-800">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-orange-700 dark:text-orange-300">
                        Avg. per Stream
                      </p>
                      <p className="text-3xl font-bold text-orange-900 dark:text-orange-100">
                        $
                        {(
                          ((analytics?.totalEarnings ?? 0) / (analytics?.totalStreams ?? 1)) *
                          1000
                        ).toFixed(3)}
                      </p>
                      <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                        Per 1,000 streams
                      </p>
                    </div>
                    <div className="p-3 bg-orange-200 dark:bg-orange-800 rounded-full">
                      <BarChart3 className="w-6 h-6 text-orange-700 dark:text-orange-300" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Platform Earnings Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <PieChart className="w-5 h-5 mr-2" />
                  Platform Earnings Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {platformEarnings.length > 0 ? (
                    platformEarnings.map((platform: unknown) => {
                      const platformInfo = DISTRO_PLATFORMS.find(
                        (p) => p.id === platform.platformId
                      );
                      const IconComponent = platformInfo?.icon || Music;

                      return (
                        <div
                          key={platform.platformId}
                          className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
                        >
                          <div className="flex items-center space-x-4">
                            <div className="w-10 h-10 bg-white dark:bg-gray-700 rounded-full flex items-center justify-between shadow-sm">
                              <IconComponent
                                className="w-5 h-5"
                                style={{ color: platformInfo?.color }}
                              />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white">
                                {platform.name}
                              </p>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                {(platform.streams ?? 0).toLocaleString()} streams • $
                                {platform.perStreamRate?.toFixed(4) ?? '0.0000'} per stream
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-green-600">
                              ${(platform.earnings ?? 0).toFixed(2)}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {(platform.percentage ?? 0).toFixed(1)}%
                            </p>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-center text-gray-500 py-4">
                      No platform earnings data available yet
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Recent Payouts */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <CreditCard className="w-5 h-5 mr-2" />
                  Recent Payouts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {payoutHistory.length > 0 ? (
                    payoutHistory.map((payout: unknown, index: number) => (
                      <div
                        key={payout.id || index}
                        className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
                      >
                        <div className="flex items-center space-x-4">
                          <div className="w-10 h-10 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                            <Banknote className="w-5 h-5 text-green-600 dark:text-green-400" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {new Date(payout.date).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                              })}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {payout.method}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-green-600">
                            ${payout.amount.toFixed(2)}
                          </p>
                          <Badge
                            variant="default"
                            className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          >
                            {payout.status}
                          </Badge>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-gray-500 py-4">
                      No payout history available yet
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Payment Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Settings className="w-5 h-5 mr-2" />
                  Payment Settings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <Label className="text-sm font-medium">Payout Threshold</Label>
                      <Select defaultValue="50">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="25" data-testid="select-payout-25">
                            $25
                          </SelectItem>
                          <SelectItem value="50" data-testid="select-payout-50">
                            $50
                          </SelectItem>
                          <SelectItem value="100" data-testid="select-payout-100">
                            $100
                          </SelectItem>
                          <SelectItem value="200" data-testid="select-payout-200">
                            $200
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-500 mt-1">
                        Minimum amount before automatic payout
                      </p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Payout Frequency</Label>
                      <Select defaultValue="monthly">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="weekly" data-testid="select-frequency-weekly">
                            Weekly
                          </SelectItem>
                          <SelectItem value="monthly" data-testid="select-frequency-monthly">
                            Monthly
                          </SelectItem>
                          <SelectItem value="quarterly" data-testid="select-frequency-quarterly">
                            Quarterly
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-500 mt-1">How often you receive payments</p>
                    </div>
                  </div>

                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <div className="flex items-start space-x-3">
                      <Shield className="w-5 h-5 text-blue-600 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-blue-900 dark:text-blue-100">
                          Secure Payments
                        </h4>
                        <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                          All payments are processed securely through Stripe. Your banking
                          information is encrypted and never stored on our servers.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="hyperfollow" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  HyperFollow Pre-Save Pages
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Create landing pages to collect pre-saves and build your fanbase
                </p>
              </div>
              <Button
                onClick={() => setIsHyperFollowOpen(true)}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                data-testid="button-create-hyperfollow"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create HyperFollow Page
              </Button>
            </div>

            {/* HyperFollow Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card className="bg-gradient-to-br from-blue-50 to-cyan-100 dark:from-blue-900/20 dark:to-cyan-900/20 border-blue-200 dark:border-blue-800">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                        Total Pre-Saves
                      </p>
                      <p className="text-3xl font-bold text-blue-900 dark:text-blue-100">
                        {hyperFollowPages
                          .reduce((sum, page) => sum + page.preSaves, 0)
                          .toLocaleString()}
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                        {hyperFollowAnalytics?.preSavesGrowth
                          ? `+${hyperFollowAnalytics.preSavesGrowth.toFixed(1)}% this month`
                          : 'No change'}
                      </p>
                    </div>
                    <div className="p-3 bg-blue-200 dark:bg-blue-800 rounded-full">
                      <Users className="w-6 h-6 text-blue-700 dark:text-blue-300" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-green-700 dark:text-green-300">
                        Page Views
                      </p>
                      <p className="text-3xl font-bold text-green-900 dark:text-green-100">
                        {hyperFollowPages
                          .reduce((sum, page) => sum + page.pageViews, 0)
                          .toLocaleString()}
                      </p>
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                        {hyperFollowAnalytics?.viewsGrowth
                          ? `+${hyperFollowAnalytics.viewsGrowth.toFixed(1)}% this month`
                          : 'No change'}
                      </p>
                    </div>
                    <div className="p-3 bg-green-200 dark:bg-green-800 rounded-full">
                      <Eye className="w-6 h-6 text-green-700 dark:text-green-300" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-purple-50 to-violet-100 dark:from-purple-900/20 dark:to-violet-900/20 border-purple-200 dark:border-purple-800">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-purple-700 dark:text-purple-300">
                        Conversion Rate
                      </p>
                      <p className="text-3xl font-bold text-purple-900 dark:text-purple-100">
                        {(hyperFollowAnalytics?.conversionRate ?? 0).toFixed(1)}%
                      </p>
                      <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                        {hyperFollowAnalytics?.conversionGrowth
                          ? `+${hyperFollowAnalytics.conversionGrowth.toFixed(1)}% this month`
                          : 'No change'}
                      </p>
                    </div>
                    <div className="p-3 bg-purple-200 dark:bg-purple-800 rounded-full">
                      <Target className="w-6 h-6 text-purple-700 dark:text-purple-300" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-orange-50 to-amber-100 dark:from-orange-900/20 dark:to-amber-900/20 border-orange-200 dark:border-orange-800">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-orange-700 dark:text-orange-300">
                        Active Pages
                      </p>
                      <p className="text-3xl font-bold text-orange-900 dark:text-orange-100">
                        {hyperFollowPages.filter((page) => page.isActive).length}
                      </p>
                      <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                        Live campaigns
                      </p>
                    </div>
                    <div className="p-3 bg-orange-200 dark:bg-orange-800 rounded-full">
                      <Link2 className="w-6 h-6 text-orange-700 dark:text-orange-300" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* HyperFollow Pages List */}
            {hyperFollowLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="p-6">
                      <div className="w-full h-32 bg-gray-200 dark:bg-gray-700 rounded-lg mb-4"></div>
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-4"></div>
                      <div className="flex justify-between">
                        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
                        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : hyperFollowPages.length === 0 ? (
              <Card className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-blue-200 dark:border-blue-800">
                <CardContent className="p-12 text-center">
                  <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Link2 className="w-12 h-12 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                    No HyperFollow Pages Yet
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
                    Create your first HyperFollow page to start collecting pre-saves and building
                    your fanbase before your release goes live.
                  </p>
                  <Button
                    onClick={() => setIsHyperFollowOpen(true)}
                    className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 px-8 py-3"
                    data-testid="button-create-hyperfollow-cta"
                  >
                    <Plus className="w-5 h-5 mr-2" />
                    Create Your First HyperFollow Page
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="text-center py-8">
                <Link2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">HyperFollow pages will appear here</p>
              </div>
            )}
          </TabsContent>

          {/* Quality Control Tab */}
          <TabsContent value="quality" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Automated Quality Control
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Ensure your releases meet platform requirements with automated QC checks
                </p>
              </div>
            </div>
            <AutomatedQC
              releaseId={selectedRelease?.id}
              audioFiles={uploadForm.audioFiles}
              artwork={uploadForm.albumArt ?? undefined}
              metadata={{
                title: uploadForm.title,
                artist: uploadForm.artistName,
                genre: uploadForm.primaryGenre,
                language: uploadForm.language,
                releaseDate: uploadForm.releaseDate?.toISOString(),
              }}
              onCheckComplete={(report) => {
                toast({
                  title: 'QC Check Complete',
                  description: `Score: ${report.overallScore}% - ${report.checks.filter(c => c.status === 'passed').length}/${report.checks.length} checks passed`,
                });
              }}
              onApplyFix={(checkId, fixAction) => {
                toast({
                  title: 'Fix Applied',
                  description: `Applied fix: ${fixAction}`,
                });
              }}
            />
          </TabsContent>

          {/* ISRC/UPC Codes Tab */}
          <TabsContent value="codes" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  ISRC & UPC Code Management
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Generate and manage unique identifiers for your tracks and releases
                </p>
              </div>
            </div>
            <ISRCManager
              releaseId={selectedRelease?.id}
              onCodeAssigned={(code, type) => {
                if (type === 'isrc') {
                  setGeneratedISRC(code);
                } else {
                  setGeneratedUPC(code);
                }
                toast({
                  title: `${type.toUpperCase()} Assigned`,
                  description: `Code: ${code}`,
                });
              }}
            />
          </TabsContent>

          {/* Release Scheduling Tab */}
          <TabsContent value="scheduling" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Release Scheduling
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Schedule your releases with platform-specific timing for maximum impact
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ReleaseDateScheduler
                selectedDate={uploadForm.releaseDate}
                onChange={(date) => setUploadForm(prev => ({ ...prev, releaseDate: date }))}
                minWeeksAhead={2}
              />
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Platform Timing
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <div className="flex items-center gap-2">
                        <SpotifyIcon className="w-5 h-5" />
                        <span className="font-medium">Spotify</span>
                      </div>
                      <Badge variant="outline" className="text-green-600">Friday midnight UTC</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                      <div className="flex items-center gap-2">
                        <AppleMusicIcon className="w-5 h-5" />
                        <span className="font-medium">Apple Music</span>
                      </div>
                      <Badge variant="outline" className="text-red-600">Friday midnight local</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                      <div className="flex items-center gap-2">
                        <YouTubeIcon className="w-5 h-5" />
                        <span className="font-medium">YouTube Music</span>
                      </div>
                      <Badge variant="outline" className="text-yellow-600">Friday 12:00 UTC</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                      <div className="flex items-center gap-2">
                        <AmazonIcon className="w-5 h-5" />
                        <span className="font-medium">Amazon Music</span>
                      </div>
                      <Badge variant="outline" className="text-orange-600">Friday midnight UTC</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <div className="flex items-center gap-2">
                        <TikTokIcon className="w-5 h-5" />
                        <span className="font-medium">TikTok</span>
                      </div>
                      <Badge variant="outline">Immediate upon approval</Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Most platforms release new music on Fridays. We automatically schedule your release
                    to go live at the optimal time for each platform.
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Splits Tab */}
          <TabsContent value="splits" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Royalty Splits Configuration
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Automatically split royalty payments with collaborators
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <RoyaltySplitManager
                  splits={uploadForm.collaborators.map((c, i) => ({
                    id: `collab-${i}`,
                    name: c.name,
                    email: c.email,
                    role: c.role as 'songwriter' | 'producer' | 'performer' | 'manager' | 'featured_artist',
                    percentage: c.percentage,
                    inviteStatus: 'pending' as const,
                  }))}
                  onChange={(splits) => {
                    setUploadForm(prev => ({
                      ...prev,
                      collaborators: splits.map(s => ({
                        name: s.name,
                        email: s.email,
                        role: s.role,
                        percentage: s.percentage,
                      })),
                    }));
                  }}
                  onSendInvites={async (splits) => {
                    toast({
                      title: 'Invites Sent',
                      description: `${splits.length} collaborator invitation(s) sent successfully`,
                    });
                  }}
                />
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5" />
                    Split Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Collaborators</span>
                      <span className="font-medium">{uploadForm.collaborators.length}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Allocated</span>
                      <span className="font-medium">
                        {uploadForm.collaborators.reduce((sum, c) => sum + c.percentage, 0)}%
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Remaining</span>
                      <span className="font-medium text-green-600">
                        {100 - uploadForm.collaborators.reduce((sum, c) => sum + c.percentage, 0)}%
                      </span>
                    </div>
                  </div>
                  <div className="pt-4 border-t">
                    <p className="text-xs text-muted-foreground">
                      Payments are automatically split and sent to collaborators when you receive royalties.
                      Each collaborator will receive an email invitation to accept their split.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Takedowns Tab */}
          <TabsContent value="takedowns" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Takedown Management
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Request removal of your content from streaming platforms
                </p>
              </div>
            </div>
            <TakedownManager />
          </TabsContent>

          {/* Rights Management Tab */}
          <TabsContent value="rights" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Rights Management
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Manage ownership, licensing, and content protection
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5" />
                    Ownership & Copyright
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <Label className="text-sm font-medium">Copyright Owner</Label>
                      <Input
                        placeholder="Your name or company"
                        value={uploadForm.copyrightOwner}
                        onChange={(e) => setUploadForm(prev => ({ ...prev, copyrightOwner: e.target.value }))}
                        className="mt-2"
                      />
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <Label className="text-sm font-medium">Copyright Year</Label>
                      <Input
                        type="number"
                        placeholder={new Date().getFullYear().toString()}
                        value={uploadForm.copyrightYear}
                        onChange={(e) => setUploadForm(prev => ({ ...prev, copyrightYear: parseInt(e.target.value) || new Date().getFullYear() }))}
                        className="mt-2"
                      />
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <Label className="text-sm font-medium">Publishing Rights</Label>
                      <Select
                        value={uploadForm.publishingRights}
                        onValueChange={(value) => setUploadForm(prev => ({ ...prev, publishingRights: value }))}
                      >
                        <SelectTrigger className="mt-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Independent">Independent (Self-Published)</SelectItem>
                          <SelectItem value="Publisher">Signed to Publisher</SelectItem>
                          <SelectItem value="Partial">Partial Publishing Deal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="w-5 h-5" />
                    Content ID & Protection
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <div>
                          <p className="font-medium">YouTube Content ID</p>
                          <p className="text-xs text-muted-foreground">Protect & monetize on YouTube</p>
                        </div>
                      </div>
                      <Badge className="bg-green-600">Active</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <div>
                          <p className="font-medium">Facebook Rights Manager</p>
                          <p className="text-xs text-muted-foreground">Protect on FB & Instagram</p>
                        </div>
                      </div>
                      <Badge className="bg-green-600">Active</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Shield className="w-5 h-5 text-blue-600" />
                        <div>
                          <p className="font-medium">Audio Fingerprinting</p>
                          <p className="text-xs text-muted-foreground">Detect unauthorized use</p>
                        </div>
                      </div>
                      <Badge className="bg-blue-600">Enabled</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Sparkles className="w-5 h-5 text-purple-600" />
                        <div>
                          <p className="font-medium">Shazam Integration</p>
                          <p className="text-xs text-muted-foreground">Be discoverable on Shazam</p>
                        </div>
                      </div>
                      <Badge className="bg-purple-600">Active</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="w-5 h-5" />
                    Territory Rights
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Worldwide Distribution</p>
                        <p className="text-sm text-muted-foreground">
                          Your music is available in all territories where platforms operate
                        </p>
                      </div>
                      <Badge className="bg-green-600">
                        <Globe className="w-3 h-3 mr-1" />
                        All Territories
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
                        <p className="text-2xl font-bold text-blue-600">195+</p>
                        <p className="text-xs text-muted-foreground">Countries</p>
                      </div>
                      <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
                        <p className="text-2xl font-bold text-green-600">150+</p>
                        <p className="text-xs text-muted-foreground">Platforms</p>
                      </div>
                      <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
                        <p className="text-2xl font-bold text-purple-600">100%</p>
                        <p className="text-xs text-muted-foreground">You Keep</p>
                      </div>
                      <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
                        <p className="text-2xl font-bold text-orange-600">∞</p>
                        <p className="text-xs text-muted-foreground">Ownership</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="platforms">
            <Card>
              <CardHeader>
                <CardTitle>Distribution Platforms</CardTitle>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Your music will be distributed to 150+ platforms automatically
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {DISTRO_PLATFORMS.map((platform) => {
                    const IconComponent = platform.icon;
                    return (
                      <div
                        key={platform.id}
                        className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                      >
                        <div className="flex items-center space-x-3 mb-3">
                          <div className="w-8 h-8 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center shadow-sm">
                            <IconComponent className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="font-medium text-sm text-gray-900 dark:text-white">
                              {platform.name}
                            </p>
                            <Badge variant="outline" className="text-xs">
                              {platform.category}
                            </Badge>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">Processing:</span>
                            <span className="font-medium">{platform.processingTime}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">Region:</span>
                            <span className="font-medium">{platform.region}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Upload Dialog */}
        <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Upload Your Music
              </DialogTitle>
              <DialogDescription>
                Distribute your music to 150+ platforms including Spotify, Apple Music, and TikTok
              </DialogDescription>
            </DialogHeader>

            <div className="mt-6">
              {/* Step Indicator */}
              <div className="flex items-center justify-between mb-8">
                {[1, 2, 3, 4, 5].map((step) => (
                  <div key={step} className="flex items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                        currentStep >= step
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
                      }`}
                    >
                      {step}
                    </div>
                    {step < 5 && (
                      <div
                        className={`w-16 h-0.5 mx-2 ${
                          currentStep > step ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
                        }`}
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* Step Content */}
              {currentStep === 1 && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold">Basic Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="title">Release Title *</Label>
                      <Input
                        id="title"
                        placeholder="Enter release title"
                        value={uploadForm.title}
                        onChange={(e) =>
                          setUploadForm((prev) => ({ ...prev, title: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="artistName">Artist Name *</Label>
                      <Input
                        id="artistName"
                        placeholder="Enter artist name"
                        value={uploadForm.artistName}
                        onChange={(e) =>
                          setUploadForm((prev) => ({ ...prev, artistName: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="releaseType">Release Type *</Label>
                      <Select
                        value={uploadForm.releaseType}
                        onValueChange={(value) =>
                          setUploadForm((prev) => ({
                            ...prev,
                            releaseType: value as 'single' | 'album' | 'EP',
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single" data-testid="select-type-single">
                            Single
                          </SelectItem>
                          <SelectItem value="EP" data-testid="select-type-ep">
                            EP
                          </SelectItem>
                          <SelectItem value="album" data-testid="select-type-album">
                            Album
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="primaryGenre">Primary Genre *</Label>
                      <Select
                        value={uploadForm.primaryGenre}
                        onValueChange={(value) =>
                          setUploadForm((prev) => ({ ...prev, primaryGenre: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select genre" />
                        </SelectTrigger>
                        <SelectContent>
                          {GENRES.map((genre) => (
                            <SelectItem
                              key={genre}
                              value={genre}
                              data-testid={`select-genre-${genre.toLowerCase().replace(/\s+/g, '-')}`}
                            >
                              {genre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="language">Language</Label>
                      <Select
                        value={uploadForm.language}
                        onValueChange={(value) =>
                          setUploadForm((prev) => ({ ...prev, language: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="English" data-testid="select-language-english">
                            English
                          </SelectItem>
                          <SelectItem value="Spanish" data-testid="select-language-spanish">
                            Spanish
                          </SelectItem>
                          <SelectItem value="French" data-testid="select-language-french">
                            French
                          </SelectItem>
                          <SelectItem value="German" data-testid="select-language-german">
                            German
                          </SelectItem>
                          <SelectItem value="Italian" data-testid="select-language-italian">
                            Italian
                          </SelectItem>
                          <SelectItem value="Portuguese" data-testid="select-language-portuguese">
                            Portuguese
                          </SelectItem>
                          <SelectItem value="Japanese" data-testid="select-language-japanese">
                            Japanese
                          </SelectItem>
                          <SelectItem value="Korean" data-testid="select-language-korean">
                            Korean
                          </SelectItem>
                          <SelectItem value="Mandarin" data-testid="select-language-mandarin">
                            Mandarin
                          </SelectItem>
                          <SelectItem value="Other" data-testid="select-language-other">
                            Other
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="copyrightOwner">Copyright Owner *</Label>
                      <Input
                        id="copyrightOwner"
                        placeholder="Enter copyright owner"
                        value={uploadForm.copyrightOwner}
                        onChange={(e) =>
                          setUploadForm((prev) => ({ ...prev, copyrightOwner: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="explicit"
                      checked={uploadForm.isExplicit}
                      onCheckedChange={(checked) =>
                        setUploadForm((prev) => ({ ...prev, isExplicit: checked as boolean }))
                      }
                    />
                    <Label htmlFor="explicit">This release contains explicit content</Label>
                  </div>
                </div>
              )}

              {currentStep === 2 && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold">Upload Audio & Artwork</h3>

                  {/* Audio Upload */}
                  <div className="space-y-4">
                    <Label>Audio Files *</Label>
                    <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
                      <input
                        type="file"
                        ref={fileInputRef}
                        multiple
                        accept=".mp3,.wav,.flac,.aac,.ogg"
                        onChange={(e) => handleFileUpload(e.target.files, 'audio')}
                        className="hidden"
                      />
                      <FileAudio className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600 dark:text-gray-300 mb-2">
                        Drop your audio files here or click to browse
                      </p>
                      <p className="text-sm text-gray-500 mb-4">
                        Supported formats: MP3, WAV, FLAC, AAC, OGG (Max 100MB each)
                      </p>
                      <Button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-blue-600 hover:bg-blue-700"
                        data-testid="button-choose-audio"
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Choose Audio Files
                      </Button>
                    </div>

                    {uploadForm.audioFiles.length > 0 && (
                      <div className="space-y-2">
                        <Label>Uploaded Files ({uploadForm.audioFiles.length})</Label>
                        {uploadForm.audioFiles.map((file, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                          >
                            <div className="flex items-center space-x-3">
                              <FileAudio className="w-5 h-5 text-blue-600" />
                              <div>
                                <p className="font-medium">{file.name}</p>
                                <p className="text-sm text-gray-500">
                                  {(file.size / 1024 / 1024).toFixed(2)} MB
                                </p>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const newFiles = uploadForm.audioFiles.filter(
                                  (_, i) => i !== index
                                );
                                const newTracks = uploadForm.tracks.filter((_, i) => i !== index);
                                setUploadForm((prev) => ({
                                  ...prev,
                                  audioFiles: newFiles,
                                  tracks: newTracks,
                                }));
                              }}
                              data-testid={`button-remove-audio-${index}`}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Album Art Upload */}
                  <div className="space-y-4">
                    <Label>Album Artwork *</Label>
                    <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6">
                      <input
                        type="file"
                        ref={albumArtRef}
                        accept="image/*"
                        onChange={(e) => handleFileUpload(e.target.files, 'artwork')}
                        className="hidden"
                      />
                      {uploadForm.albumArt ? (
                        <div className="flex items-center space-x-4">
                          <img
                            src={URL.createObjectURL(uploadForm.albumArt)}
                            alt="Album artwork"
                            className="w-16 h-16 rounded-lg object-cover"
                          />
                          <div className="flex-1">
                            <p className="font-medium">{uploadForm.albumArt.name}</p>
                            <p className="text-sm text-gray-500">
                              {(uploadForm.albumArt.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setUploadForm((prev) => ({ ...prev, albumArt: null }))}
                            data-testid="button-remove-artwork"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="text-center">
                          <Disc className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                          <p className="text-gray-600 dark:text-gray-300 mb-2">
                            Upload album artwork
                          </p>
                          <p className="text-sm text-gray-500 mb-4">
                            3000x3000 pixels recommended (JPG, PNG)
                          </p>
                          <Button
                            type="button"
                            onClick={() => albumArtRef.current?.click()}
                            variant="outline"
                            data-testid="button-choose-artwork"
                          >
                            <Upload className="w-4 h-4 mr-2" />
                            Choose Artwork
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 3 && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold">Track Details</h3>
                  {uploadForm.tracks.map((track, index) => (
                    <Card key={index} className="p-4">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-medium">Track {index + 1}</h4>
                        <Badge variant="secondary">{uploadForm.audioFiles[index]?.name}</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Track Title *</Label>
                          <Input
                            value={track.title}
                            onChange={(e) => {
                              const newTracks = [...uploadForm.tracks];
                              newTracks[index] = { ...track, title: e.target.value };
                              setUploadForm((prev) => ({ ...prev, tracks: newTracks }));
                            }}
                            placeholder="Enter track title"
                          />
                        </div>
                        <div>
                          <Label>Featured Artists</Label>
                          <Input
                            value={track.featuredArtists}
                            onChange={(e) => {
                              const newTracks = [...uploadForm.tracks];
                              newTracks[index] = { ...track, featuredArtists: e.target.value };
                              setUploadForm((prev) => ({ ...prev, tracks: newTracks }));
                            }}
                            placeholder="ft. Artist Name"
                          />
                        </div>
                        <div>
                          <Label>Songwriters</Label>
                          <Input
                            value={track.songwriters}
                            onChange={(e) => {
                              const newTracks = [...uploadForm.tracks];
                              newTracks[index] = { ...track, songwriters: e.target.value };
                              setUploadForm((prev) => ({ ...prev, tracks: newTracks }));
                            }}
                            placeholder="Writer 1, Writer 2"
                          />
                        </div>
                        <div>
                          <Label>Producers</Label>
                          <Input
                            value={track.producers}
                            onChange={(e) => {
                              const newTracks = [...uploadForm.tracks];
                              newTracks[index] = { ...track, producers: e.target.value };
                              setUploadForm((prev) => ({ ...prev, tracks: newTracks }));
                            }}
                            placeholder="Producer 1, Producer 2"
                          />
                        </div>
                      </div>
                      <div className="mt-4">
                        <Label>Lyrics (Optional)</Label>
                        <Textarea
                          value={track.lyrics}
                          onChange={(e) => {
                            const newTracks = [...uploadForm.tracks];
                            newTracks[index] = { ...track, lyrics: e.target.value };
                            setUploadForm((prev) => ({ ...prev, tracks: newTracks }));
                          }}
                          placeholder="Enter lyrics here..."
                          rows={6}
                        />
                      </div>
                      <div className="flex items-center space-x-2 mt-4">
                        <Checkbox
                          checked={track.explicit}
                          onCheckedChange={(checked) => {
                            const newTracks = [...uploadForm.tracks];
                            newTracks[index] = { ...track, explicit: checked as boolean };
                            setUploadForm((prev) => ({ ...prev, tracks: newTracks }));
                          }}
                        />
                        <Label>This track contains explicit content</Label>
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              {currentStep === 4 && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold">Platform Selection & Settings</h3>

                  <div className="space-y-4">
                    <Label>Select Distribution Platforms</Label>
                    <div className="grid grid-cols-3 gap-4">
                      {DISTRO_PLATFORMS.map((platform) => (
                        <div
                          key={platform.id}
                          className="flex items-center space-x-3 p-3 border rounded-lg"
                        >
                          <Checkbox
                            checked={uploadForm.selectedPlatforms.includes(platform.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setUploadForm((prev) => ({
                                  ...prev,
                                  selectedPlatforms: [...prev.selectedPlatforms, platform.id],
                                }));
                              } else {
                                setUploadForm((prev) => ({
                                  ...prev,
                                  selectedPlatforms: prev.selectedPlatforms.filter(
                                    (id) => id !== platform.id
                                  ),
                                }));
                              }
                            }}
                          />
                          <platform.icon className="w-5 h-5" style={{ color: platform.color }} />
                          <span className="font-medium">{platform.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Release Date</Label>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          checked={uploadForm.isScheduled}
                          onCheckedChange={(checked) =>
                            setUploadForm((prev) => ({ ...prev, isScheduled: checked as boolean }))
                          }
                        />
                        <span>Schedule for later release</span>
                      </div>
                      {uploadForm.isScheduled && (
                        <Input
                          type="date"
                          value={
                            uploadForm.scheduledDate
                              ? uploadForm.scheduledDate.toISOString().split('T')[0]
                              : ''
                          }
                          onChange={(e) =>
                            setUploadForm((prev) => ({
                              ...prev,
                              scheduledDate: new Date(e.target.value),
                            }))
                          }
                          className="mt-2"
                          min={new Date().toISOString().split('T')[0]}
                        />
                      )}
                    </div>
                    <div>
                      <Label>iTunes Pricing</Label>
                      <Select
                        value={uploadForm.iTunesPricing}
                        onValueChange={(value) =>
                          setUploadForm((prev) => ({ ...prev, iTunesPricing: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="standard" data-testid="select-pricing-standard">
                            Standard Pricing
                          </SelectItem>
                          <SelectItem value="premium" data-testid="select-pricing-premium">
                            Premium Pricing (+30%)
                          </SelectItem>
                          <SelectItem value="budget" data-testid="select-pricing-budget">
                            Budget Pricing (-20%)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={uploadForm.leaveALegacy}
                        onCheckedChange={(checked) =>
                          setUploadForm((prev) => ({ ...prev, leaveALegacy: checked as boolean }))
                        }
                      />
                      <Label>Enable Leave a Legacy ($29 one-time fee)</Label>
                    </div>
                    {uploadForm.leaveALegacy && (
                      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                          Leave a Legacy keeps your music online forever, even if you stop paying
                          for DistroKid. Your music will never be taken down from stores.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {currentStep === 5 && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold">Review & Submit</h3>

                  <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-lg space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-medium text-gray-500">Release Title</Label>
                        <p className="font-medium">{uploadForm.title}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-gray-500">Artist Name</Label>
                        <p className="font-medium">{uploadForm.artistName}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-gray-500">Release Type</Label>
                        <p className="font-medium capitalize">{uploadForm.releaseType}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-gray-500">Genre</Label>
                        <p className="font-medium">{uploadForm.primaryGenre}</p>
                      </div>
                    </div>

                    <div>
                      <Label className="text-sm font-medium text-gray-500">
                        Tracks ({uploadForm.audioFiles.length})
                      </Label>
                      <div className="space-y-2 mt-2">
                        {uploadForm.tracks.map((track, index) => (
                          <div
                            key={index}
                            className="flex items-center space-x-3 p-2 bg-white dark:bg-gray-700 rounded"
                          >
                            <span className="text-sm font-mono text-gray-500">{index + 1}.</span>
                            <span className="font-medium">{track.title}</span>
                            {track.explicit && (
                              <Badge variant="destructive" className="text-xs">
                                Explicit
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <Label className="text-sm font-medium text-gray-500">
                        Platforms ({uploadForm.selectedPlatforms.length})
                      </Label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {uploadForm.selectedPlatforms.map((platformId) => {
                          const platform = DISTRO_PLATFORMS.find((p) => p.id === platformId);
                          return platform ? (
                            <Badge
                              key={platformId}
                              variant="secondary"
                              className="flex items-center space-x-1"
                            >
                              <platform.icon className="w-3 h-3" />
                              <span>{platform.name}</span>
                            </Badge>
                          ) : null;
                        })}
                      </div>
                    </div>

                    {uploadForm.leaveALegacy && (
                      <div className="flex items-center space-x-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded">
                        <Shield className="w-5 h-5 text-blue-600" />
                        <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                          Leave a Legacy Enabled (+$29)
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg">
                    <div className="flex items-start space-x-3">
                      <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-yellow-800 dark:text-yellow-200">
                          Before You Submit
                        </p>
                        <ul className="text-sm text-yellow-700 dark:text-yellow-300 mt-2 space-y-1">
                          <li>
                            • Make sure all track titles and artist names are spelled correctly
                          </li>
                          <li>
                            • Verify your album artwork meets platform requirements (3000x3000px)
                          </li>
                          <li>• Double-check that all collaborators are properly credited</li>
                          <li>
                            • Review your platform selection - you can't change this after
                            submission
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step Navigation */}
              <div className="flex justify-between mt-8">
                <Button
                  variant="outline"
                  onClick={prevStep}
                  disabled={currentStep === 1}
                  data-testid="button-previous-step"
                >
                  Previous
                </Button>
                <Button
                  onClick={currentStep === 5 ? handleUploadSubmit : nextStep}
                  disabled={uploadReleaseMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700"
                  data-testid={currentStep === 5 ? 'button-submit-release' : 'button-next-step'}
                >
                  {uploadReleaseMutation.isPending
                    ? 'Uploading...'
                    : currentStep === 5
                      ? 'Submit Release'
                      : 'Next'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
