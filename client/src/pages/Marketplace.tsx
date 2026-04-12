import { logger } from '@/lib/logger';
import { uploadImageFile, createLocalPreview, revokeLocalPreview } from '@/lib/imageUpload';
import { SafeImg } from '@/components/ui/safe-img';
import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { Howl } from 'howler';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';

import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard, StatCardRow } from '@/components/ui/stat-card';
import { ChartCard, SimpleAreaChart } from '@/components/ui/chart-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { audioAnalysisService, type BeatMetadataSuggestion } from '@/lib/audioAnalysisService';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useAnalyticsInvalidation } from '@/hooks/useAnalyticsInvalidation';
import { apiRequest, uploadWithProgress } from '@/lib/queryClient';
import { StemsManager } from '@/components/StemsManager';
import { PayoutDashboard } from '@/components/marketplace/PayoutDashboard';
import StorefrontBuilder from '@/components/marketplace/StorefrontBuilder';
import {
  MarketplaceOutcomeHandler,
  useMarketplaceOutcome,
  WaveformAudioPlayer,
  LicenseComparisonCard,
  PurchaseConfirmationFlow,
  BeatGridSkeleton,
  ProducerGridSkeleton,
  AnalyticsDashboardSkeleton,
  PurchaseHistorySkeleton,
  NoBeatsFoundEmptyState,
  EmptyCartState,
  NoPurchasesState,
  NoMyBeatsState,
  NoProducersFoundState,
  NoAnalyticsDataState,
  NoEscrowTransactionsState,
  NoContractsState,
  NoCollaborationsState,
  FilterResultsHeader,
} from '@/components/marketplace';
import {
  Music,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Heart,
  Share2,
  Download,
  Upload,
  Plus,
  Edit,
  Trash2,
  Search,
  Filter,
  SortAsc,
  SortDesc,
  Grid,
  List,
  Star,
  Award,
  Trophy,
  Crown,
  Flame,
  TrendingUp,
  Users,
  Eye,
  DollarSign,
  CreditCard,
  ShoppingCart,
  Package,
  Truck,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  Calendar,
  MapPin,
  Globe,
  Lock,
  Unlock,
  Shield,
  Zap,
  Sparkles,
  Brain,
  Bot,
  Target,
  BarChart3,
  PieChart,
  LineChart,
  Activity,
  TrendingDown,
  Minus,
  PlusCircle,
  Loader2,
  MinusCircle,
  X,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  MoreVertical,
  Settings,
  User,
  UserPlus,
  UserMinus,
  UserCheck,
  UserX,
  MessageCircle,
  Mail,
  Phone,
  Video,
  Camera,
  Image as ImageIcon,
  File,
  FileText,
  FileAudio,
  FileVideo,
  FileImage,
  Folder,
  FolderOpen,
  Save,
  Copy,
  Scissors,
  Undo,
  Redo,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Maximize,
  Minimize,
  ExternalLink,
  Link,
  Link2,
  Unlink,
  Bookmark,
  BookmarkCheck,
  Flag,
  ThumbsUp,
  ThumbsDown,
  Handshake,
  FileSignature,
  Wallet,
  Banknote,
  CircleDollarSign,
  SkipBack,
  SkipForward,
  Repeat,
  Shuffle,
  Layers,
  UploadCloud,
  FolderUp,
  Wand2,
  Lightbulb,
  Percent,
  Receipt,
  Scale,
  ScrollText,
} from 'lucide-react';

// BeatStars Clone Interfaces
interface LicenseTier {
  id?: string;
  licenseType: string;
  label: string;
  priceCents: number;
  price: number;
  discountType: string;
  discountPercent: number | null;
  discountPriceCents: number | null;
  discountPrice: number | null;
  discountExpiresAt: string | null;
  bogoEnabled: boolean;
  bogoGetType: string | null;
  bogoGetPercent: number;
  fileFormats: string[];
  audioUrls: Record<string, string>;
  isActive: boolean;
}

interface Beat {
  id: string;
  title: string;
  producer: string;
  producerId: string;
  price: number;
  currency: string;
  genre: string;
  mood: string;
  tempo: number;
  key: string;
  duration: number;
  audioUrl?: string;
  previewUrl?: string;
  fullUrl?: string;
  coverArt: string;
  tags: string[];
  description: string;
  isExclusive: boolean;
  isLease: boolean;
  licenseType: 'basic' | 'premium' | 'unlimited' | 'exclusive';
  downloads: number;
  likes: number;
  plays: number;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'inactive' | 'pending';
  waveformData?: number[];
  discountPercent?: number | null;
  discountPriceCents?: number | null;
  discountExpiresAt?: string | null;
  hasLicenseTiers?: boolean;
  licenseTiers?: LicenseTier[];
}

interface Producer {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  bio: string;
  location: string;
  followers: number;
  following: number;
  beats: number;
  sales: number;
  rating: number;
  verified: boolean;
  joinedAt: string;
  socialLinks: {
    instagram?: string;
    twitter?: string;
    youtube?: string;
    soundcloud?: string;
  };
}

interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface ProducersResponse {
  producers: Producer[];
  pagination: Pagination;
}

interface Purchase {
  id: string;
  beatId: string;
  listingId: string;
  buyerId: string;
  userId: string;
  sellerId: string;
  amount: number;
  currency: string;
  licenseType: string;
  licenseSnapshot?: any;
  licenseDocumentUrl?: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  createdAt: string;
  completedAt?: string;
  downloadUrl?: string;
  licenseUrl?: string;
  beatTitle?: string;
  beatArtworkUrl?: string;
  beatAudioUrl?: string;
  beatMetadata?: any;
  sellerName?: string;
  sellerUsername?: string;
  metadata?: any;
}

interface CartItem {
  beatId: string;
  licenseType: string;
  price: number;
}

interface EscrowTransaction {
  id: string;
  beatId: string;
  beatTitle: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  amount: number;
  escrowFee: number;
  status: 'pending' | 'held' | 'released' | 'disputed' | 'refunded';
  createdAt: string;
  releaseDate?: string;
  disputeReason?: string;
}

interface LicenseTemplate {
  id: string;
  name: string;
  type: 'non-exclusive' | 'exclusive' | 'unlimited' | 'custom';
  price: number;
  streams: number | 'unlimited';
  copies: number | 'unlimited';
  radioStations: number | 'unlimited';
  musicVideos: number | 'unlimited';
  duration: string;
  allowsBroadcast: boolean;
  allowsProfit: boolean;
  allowsSync: boolean;
  customTerms?: string;
  isActive: boolean;
}

interface AffiliateData {
  id: string;
  name: string;
  email: string;
  affiliateCode: string;
  commissionRate: number;
  totalEarnings: number;
  pendingPayout: number;
  referralCount: number;
  conversionRate: number;
  status: 'active' | 'pending' | 'suspended';
  joinedAt: string;
}

interface AIRecommendation {
  id: string;
  beat: Beat;
  matchScore: number;
  reasons: string[];
  category: 'similar_style' | 'trending' | 'new_release' | 'personalized';
}

interface ContractTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  variables: string[];
  category: 'beat_lease' | 'exclusive' | 'collaboration' | 'sync' | 'custom';
  isDefault: boolean;
  createdAt: string;
}

interface BulkUploadItem {
  id: string;
  file: File;
  title: string;
  genre: string;
  mood: string;
  tempo: number;
  key: string;
  price: number;
  licenseType: string;
  description: string;
  tags: string;
  coverArtServerUrl: string | null;
  coverArtPreviewUrl: string | null;
  coverArtUploading: boolean;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
}

interface CollaborationOffer {
  id: string;
  fromUser: { id: string; name: string; avatar: string };
  toUser: { id: string; name: string; avatar: string };
  beatId?: string;
  beatTitle?: string;
  type: 'feature' | 'remix' | 'split' | 'ghost_production' | 'custom';
  terms: string;
  splitPercentage: number;
  budget?: number;
  status: 'pending' | 'accepted' | 'rejected' | 'negotiating' | 'completed';
  messages: { sender: string; content: string; timestamp: string }[];
  createdAt: string;
}

interface SalesAnalytics {
  totalRevenue: number;
  totalSales: number;
  avgSalePrice: number;
  conversionRate: number;
  revenueChangePercent: number;
  salesChangePercent: number;
  weeklyData: { week: string; revenue: number; sales: number }[];
  topBeats: { title: string; sales: number; revenue: number }[];
  licenseDistribution: Record<string, number>;
}

const BEAT_GENRES = [
  'Hip-Hop', 'Trap', 'R&B', 'Pop', 'Rock', 'Electronic', 'Jazz', 'Blues',
  'Country', 'Reggae', 'Folk', 'Alternative', 'Indie', 'Punk', 'Metal',
  'Funk', 'Soul', 'Gospel', 'World', 'Latin', 'Ambient', 'Experimental',
];

const BEAT_MOODS = [
  'Aggressive', 'Chill', 'Dark', 'Happy', 'Sad', 'Energetic', 'Relaxed',
  'Romantic', 'Mysterious', 'Uplifting', 'Melancholic', 'Confident',
  'Nostalgic', 'Futuristic', 'Vintage', 'Modern', 'Classic', 'Experimental',
];

const LICENSE_TYPES: LicenseTemplate[] = [
  {
    id: 'basic',
    name: 'Basic Lease',
    type: 'non-exclusive',
    price: 29.99,
    streams: 100000,
    copies: 5000,
    radioStations: 2,
    musicVideos: 1,
    duration: '1 year',
    allowsBroadcast: false,
    allowsProfit: true,
    allowsSync: false,
    isActive: true,
  },
  {
    id: 'premium',
    name: 'Premium Lease',
    type: 'non-exclusive',
    price: 99.99,
    streams: 500000,
    copies: 25000,
    radioStations: 10,
    musicVideos: 3,
    duration: '2 years',
    allowsBroadcast: true,
    allowsProfit: true,
    allowsSync: true,
    isActive: true,
  },
  {
    id: 'unlimited',
    name: 'Unlimited Lease',
    type: 'unlimited',
    price: 199.99,
    streams: 'unlimited',
    copies: 'unlimited',
    radioStations: 'unlimited',
    musicVideos: 'unlimited',
    duration: 'Lifetime',
    allowsBroadcast: true,
    allowsProfit: true,
    allowsSync: true,
    isActive: true,
  },
  {
    id: 'exclusive',
    name: 'Exclusive Rights',
    type: 'exclusive',
    price: 999.99,
    streams: 'unlimited',
    copies: 'unlimited',
    radioStations: 'unlimited',
    musicVideos: 'unlimited',
    duration: 'Lifetime (Full Ownership)',
    allowsBroadcast: true,
    allowsProfit: true,
    allowsSync: true,
    isActive: true,
  },
];

function ProducerFollowButton({ producerId, followMutation, unfollowMutation }: { 
  producerId: string; 
  followMutation: any; 
  unfollowMutation: any;
}) {
  const { data: followStatus, isLoading } = useQuery({
    queryKey: ['/api/marketplace/producers', producerId, 'follow-status'],
    queryFn: async () => {
      const response = await fetch(`/api/marketplace/producers/${producerId}/follow-status`, {
        credentials: 'include',
      });
      if (!response.ok) return { isFollowing: false };
      return response.json();
    },
  });

  const isFollowing = followStatus?.isFollowing || false;
  const isPending = followMutation.isPending || unfollowMutation.isPending;

  return (
    <Button 
      variant={isFollowing ? "default" : "outline"} 
      size="icon" 
      onClick={() => {
        if (isFollowing) {
          unfollowMutation.mutate(producerId);
        } else {
          followMutation.mutate(producerId);
        }
      }}
      disabled={isLoading || isPending}
      className={isFollowing ? "bg-purple-600 hover:bg-purple-700" : ""}
    >
      {isPending ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : isFollowing ? (
        <UserCheck className="w-4 h-4" />
      ) : (
        <UserPlus className="w-4 h-4" />
      )}
    </Button>
  );
}


export default function Marketplace() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { invalidateOnMarketplaceChange } = useAnalyticsInvalidation();
  const [activeTab, setActiveTab] = useState('browse');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [pendingDeleteProductId, setPendingDeleteProductId] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const [selectedGenre, setSelectedGenre] = useState('');
  const [selectedMood, setSelectedMood] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isPlaying, setIsPlaying] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showCartModal, setShowCartModal] = useState(false);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [hasStems, setHasStems] = useState(false);
  const howlRef = useRef<Howl | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const isPickingFileRef = useRef(false);
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const blockFakePopstate = (e: PopStateEvent) => {
      if (isPickingFileRef.current) {
        e.stopImmediatePropagation();
        window.history.pushState(null, '', window.location.href);
      }
    };
    const resetOnWindowFocus = () => {
      if (isPickingFileRef.current) {
        setTimeout(() => { isPickingFileRef.current = false; }, 1500);
      }
    };
    window.addEventListener('popstate', blockFakePopstate, { capture: true });
    window.addEventListener('focus', resetOnWindowFocus);
    return () => {
      window.removeEventListener('popstate', blockFakePopstate, { capture: true });
      window.removeEventListener('focus', resetOnWindowFocus);
    };
  }, []);

  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    title: '',
    genre: '',
    mood: '',
    tempo: 120,
    key: 'C',
    price: 50,
    licenseType: 'basic',
    description: '',
    tags: '',
  });
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [coverArtFile, setCoverArtFile] = useState<File | null>(null);
  const [coverArtPreviewUrl, setCoverArtPreviewUrl] = useState<string | null>(null);
  const [coverArtServerUrl, setCoverArtServerUrl] = useState<string | null>(null);
  const [coverArtUploading, setCoverArtUploading] = useState(false);
  const [editCoverArtServerUrl, setEditCoverArtServerUrl] = useState<string | null>(null);
  const [editCoverArtPreviewUrl, setEditCoverArtPreviewUrl] = useState<string | null>(null);
  const [editCoverArtUploading, setEditCoverArtUploading] = useState(false);
  const [bulkEditUploadedCoverPreviewUrl, setBulkEditUploadedCoverPreviewUrl] = useState<string | null>(null);
  const [bulkEditUploadedCoverServerUrl, setBulkEditUploadedCoverServerUrl] = useState<string | null>(null);
  const [bulkEditUploadedCoverUploading, setBulkEditUploadedCoverUploading] = useState(false);
  const [bulkEditCoverPreviewUrl, setBulkEditCoverPreviewUrl] = useState<string | null>(null);
  const [bulkEditCoverServerUrl, setBulkEditCoverServerUrl] = useState<string | null>(null);
  const [bulkEditCoverUploading, setBulkEditCoverUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [isDraggingAudio, setIsDraggingAudio] = useState(false);
  const [fileValidationError, setFileValidationError] = useState<string | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const [isAnalyzingAudio, setIsAnalyzingAudio] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<BeatMetadataSuggestion | null>(null);

  const MAX_AUDIO_SIZE_MB = 100;
  const MAX_COVER_SIZE_MB = 10;
  const ALLOWED_AUDIO_FORMATS = ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/aac', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/aiff', 'audio/webm'];
  const ALLOWED_IMAGE_FORMATS = ['image/jpeg', 'image/png', 'image/jpg'];

  const validateAudioFile = (file: File): string | null => {
    if (!ALLOWED_AUDIO_FORMATS.includes(file.type) && !file.name.match(/\.(mp3|wav|flac|aac|ogg|m4a|aiff|aif|webm)$/i)) {
      return 'Invalid audio format. Please use MP3, WAV, FLAC, AAC, OGG, M4A, or AIFF.';
    }
    if (file.size > MAX_AUDIO_SIZE_MB * 1024 * 1024) {
      return `Audio file too large. Maximum size is ${MAX_AUDIO_SIZE_MB}MB.`;
    }
    return null;
  };

  const validateCoverFile = (file: File): string | null => {
    if (!ALLOWED_IMAGE_FORMATS.includes(file.type)) {
      return 'Invalid image format. Please use JPG or PNG.';
    }
    if (file.size > MAX_COVER_SIZE_MB * 1024 * 1024) {
      return `Cover art too large. Maximum size is ${MAX_COVER_SIZE_MB}MB.`;
    }
    return null;
  };

  const handleAudioFileSelect = (file: File) => {
    const error = validateAudioFile(file);
    if (error) {
      setFileValidationError(error);
      toast({ title: 'Invalid File', description: error, variant: 'destructive' });
      return;
    }
    setFileValidationError(null);
    setAudioFile(file);
    setAiSuggestion(null);
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    setAudioPreviewUrl(URL.createObjectURL(file));
    const filenameWithoutExt = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    if (!uploadForm.title) {
      setUploadForm(prev => ({ ...prev, title: filenameWithoutExt }));
    }

    setIsAnalyzingAudio(true);
    audioAnalysisService.analyzeAndSuggestMetadata(file).then((suggestion) => {
      setAiSuggestion(suggestion);
      setUploadForm(prev => ({
        ...prev,
        tempo: suggestion.bpm,
        key: suggestion.key,
        genre: prev.genre || suggestion.genre,
        mood: prev.mood || suggestion.mood,
        tags: prev.tags || suggestion.tags.join(', '),
      }));
      toast({
        title: 'AI Analysis Complete',
        description: `Detected ${suggestion.bpm} BPM, Key: ${suggestion.key}, Genre: ${suggestion.genre}`,
      });
    }).catch((err) => {
      logger.error('Audio analysis failed:', err);
      toast({
        title: 'Audio Analysis',
        description: 'Could not auto-detect metadata. Please fill in manually.',
        variant: 'destructive',
      });
    }).finally(() => {
      setIsAnalyzingAudio(false);
    });
  };

  const handleCoverFileSelect = (file: File) => {
    const error = validateCoverFile(file);
    if (error) {
      toast({ title: 'Invalid File', description: error, variant: 'destructive' });
      return;
    }
    if (coverArtPreviewUrl) revokeLocalPreview(coverArtPreviewUrl);
    const preview = createLocalPreview(file);
    setCoverArtFile(file);
    setCoverArtPreviewUrl(preview);
    setCoverArtServerUrl(null);
    setCoverArtUploading(true);
    uploadImageFile(file, '/api/storage/upload', 'file')
      .then((url) => {
        setCoverArtServerUrl(url);
        revokeLocalPreview(preview);
        setCoverArtPreviewUrl(null);
      })
      .catch(() => {
        toast({ title: 'Cover Art Upload Failed', description: 'Using local preview — will retry on submit.', variant: 'destructive' });
      })
      .finally(() => setCoverArtUploading(false));
  };

  const handleAudioDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingAudio(true);
  };

  const handleAudioDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingAudio(false);
  };

  const handleAudioDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingAudio(false);
    const file = e.dataTransfer.files[0];
    if (file) handleAudioFileSelect(file);
  };

  const resetUploadForm = () => {
    setAiSuggestion(null);
    setIsAnalyzingAudio(false);
    setUploadForm({
      title: '',
      genre: '',
      mood: '',
      tempo: 120,
      key: 'C',
      price: 50,
      licenseType: 'basic',
      description: '',
      tags: '',
    });
    setAudioFile(null);
    setCoverArtFile(null);
    if (coverArtPreviewUrl) {
      revokeLocalPreview(coverArtPreviewUrl);
      setCoverArtPreviewUrl(null);
    }
    setCoverArtServerUrl(null);
    setCoverArtUploading(false);
    setUploadProgress(0);
    setFileValidationError(null);
    if (audioPreviewUrl) {
      revokeLocalPreview(audioPreviewUrl);
      setAudioPreviewUrl(null);
    }
  };

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [showPreviewPlayer, setShowPreviewPlayer] = useState(false);
  const [currentBeat, setCurrentBeat] = useState<Beat | null>(null);

  const [showEscrowModal, setShowEscrowModal] = useState(false);
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [showLicenseViewer, setShowLicenseViewer] = useState(false);
  const [licenseViewerContent, setLicenseViewerContent] = useState<string | null>(null);
  const [showAffiliateModal, setShowAffiliateModal] = useState(false);
  const [showContractModal, setShowContractModal] = useState(false);
  const [showEditContract, setShowEditContract] = useState(false);
  const [showDeleteContract, setShowDeleteContract] = useState(false);
  const [selectedContract, setSelectedContract] = useState<ContractTemplate | null>(null);
  const [editContractForm, setEditContractForm] = useState({
    name: '',
    description: '',
    content: '',
    category: 'custom',
  });
  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);
  const [showCollaborationModal, setShowCollaborationModal] = useState(false);

  const [bulkUploadItems, setBulkUploadItems] = useState<BulkUploadItem[]>([]);
  const [selectedLicense, setSelectedLicense] = useState<LicenseTemplate | null>(null);
  const [licenseForm, setLicenseForm] = useState({
    name: '',
    type: 'non-exclusive' as string,
    priceCents: 2999,
    streams: '100000',
    copies: '5000',
    musicVideos: '1',
    duration: '1 year',
    allowsBroadcast: false,
    allowsProfit: true,
    allowsSync: false,
    fileFormats: 'MP3',
  });
  const [contractForm, setContractForm] = useState({
    name: '',
    description: '',
    content: '',
    category: 'beat_lease',
    variables: [] as string[],
  });
  const [collaborationForm, setCollaborationForm] = useState({
    type: 'feature',
    terms: '',
    splitPercentage: 50,
    budget: 0,
    message: '',
  });

  // Merch Store queries and mutations
  const { data: merchItems, isLoading: merchLoading } = useQuery({
    queryKey: ['/api/merch'],
    enabled: activeTab === 'merch',
  });

  const { data: merchOrders, isLoading: ordersLoading } = useQuery({
    queryKey: ['/api/merch/orders'],
    enabled: activeTab === 'merch',
  });

  const { data: merchStats } = useQuery({
    queryKey: ['/api/merch/stats'],
    enabled: activeTab === 'merch',
  });

  const addItemMutation = useMutation({
    mutationFn: async (newItem: any) => {
      const res = await apiRequest('POST', '/api/merch', newItem);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/merch'] });
      queryClient.invalidateQueries({ queryKey: ['/api/merch/stats'] });
      toast({ title: 'Success', description: 'Item added successfully' });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/merch/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/merch'] });
      toast({ title: 'Success', description: 'Item deleted' });
    },
  });

  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingBeat, setEditingBeat] = useState<Beat | null>(null);
  const [deletingBeatId, setDeletingBeatId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    genre: '',
    mood: '',
    tempo: 120,
    key: 'C',
    price: 50,
    licenseType: 'basic',
    description: '',
    tags: '',
    coverArtFile: null as File | null,
    discountPercent: 0,
    discountExpiresAt: '',
  });

  const [selectedBeats, setSelectedBeats] = useState<Set<string>>(new Set());
  const [showBulkEditUploaded, setShowBulkEditUploaded] = useState(false);
  const [bulkEditUploadedValues, setBulkEditUploadedValues] = useState({
    genre: '',
    mood: '',
    tempo: 0,
    key: '',
    price: 0,
    licenseType: '',
    tags: '',
    discountAction: 'keep' as 'keep' | 'apply' | 'remove',
    discountPercent: 0,
    discountExpiresAt: '',
    coverArtFile: null as File | null,
  });

  const toggleBeatSelection = (beatId: string) => {
    setSelectedBeats(prev => {
      const next = new Set(prev);
      if (next.has(beatId)) next.delete(beatId);
      else next.add(beatId);
      return next;
    });
  };

  const toggleSelectAllBeats = () => {
    if (selectedBeats.size === myBeats.length) {
      setSelectedBeats(new Set());
    } else {
      setSelectedBeats(new Set(myBeats.map((b: Beat) => b.id)));
    }
  };

  const applyBulkEditUploaded = async () => {
    const selectedIds = Array.from(selectedBeats);
    let successCount = 0;
    for (const beatId of selectedIds) {
      try {
        const formData = new FormData();
        const beat = myBeats.find((b: Beat) => b.id === beatId);
        if (!beat) continue;
        formData.append('title', beat.title);
        formData.append('genre', bulkEditUploadedValues.genre || beat.genre || '');
        formData.append('mood', bulkEditUploadedValues.mood || beat.mood || '');
        formData.append('tempo', String(bulkEditUploadedValues.tempo > 0 ? bulkEditUploadedValues.tempo : (beat.tempo || 120)));
        formData.append('key', bulkEditUploadedValues.key || beat.key || 'C');
        formData.append('price', String(bulkEditUploadedValues.price > 0 ? bulkEditUploadedValues.price : (beat.price || 50)));
        formData.append('licenseType', bulkEditUploadedValues.licenseType || beat.licenseType || 'basic');
        formData.append('tags', bulkEditUploadedValues.tags || (beat.tags?.join(', ') || ''));
        formData.append('description', beat.description || '');
        if (bulkEditUploadedCoverServerUrl) formData.append('artworkUrl', bulkEditUploadedCoverServerUrl);
        else if (bulkEditUploadedValues.coverArtFile) formData.append('artwork', bulkEditUploadedValues.coverArtFile);

        await apiRequest('PUT', `/api/marketplace/listings/${beatId}`, formData, { timeout: 300000 });

        if (bulkEditUploadedValues.discountAction === 'apply' && bulkEditUploadedValues.discountPercent > 0 && bulkEditUploadedValues.discountPercent < 100) {
          await apiRequest('PUT', `/api/storefront/_/listings/${beatId}/discount`, {
            discountPercent: bulkEditUploadedValues.discountPercent,
            discountExpiresAt: bulkEditUploadedValues.discountExpiresAt || null,
          });
        } else if (bulkEditUploadedValues.discountAction === 'remove' && beat.discountPercent) {
          await apiRequest('DELETE', `/api/storefront/_/listings/${beatId}/discount`);
        }

        successCount++;
      } catch (err) {
        logger.error(`Failed to update beat ${beatId}:`, err);
      }
    }
    toast({ title: 'Bulk Edit Complete', description: `Updated ${successCount} of ${selectedIds.length} beats.` });
    setShowBulkEditUploaded(false);
    setSelectedBeats(new Set());
    queryClient.invalidateQueries({ queryKey: ['/api/marketplace/my-beats'] });
  };

  const { data: beats = [], isLoading: beatsLoading} = useQuery<Beat[]>({
    queryKey: ['/api/marketplace/beats', searchQuery, selectedGenre, selectedMood, sortBy],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (selectedGenre) params.append('genre', selectedGenre);
      if (selectedMood) params.append('mood', selectedMood);
      if (sortBy) params.append('sortBy', sortBy);

      const url = `/api/marketplace/beats${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetch(url, { credentials: 'include' });

      if (!res.ok) {
        throw new Error(`${res.status}: ${res.statusText}`);
      }

      return await res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: producersData, isLoading: producersLoading } = useQuery<ProducersResponse>({
    queryKey: ['/api/marketplace/producers'],
    staleTime: 5 * 60 * 1000,
  });

  const producers = producersData?.producers || [];

  const { data: purchases = [], isLoading: purchasesLoading } = useQuery<Purchase[]>({
    queryKey: ['/api/marketplace/purchases'],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: salesAnalytics, isLoading: salesAnalyticsLoading } = useQuery<SalesAnalytics>({
    queryKey: ['/api/marketplace/sales-analytics'],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: myBeats = [], isLoading: myBeatsLoading } = useQuery<Beat[]>({
    queryKey: ['/api/marketplace/my-beats'],
    enabled: !!user && activeTab === 'my-beats',
    staleTime: 5 * 60 * 1000,
  });

  const { data: escrowTransactions = [] } = useQuery<EscrowTransaction[]>({
    queryKey: ['/api/marketplace/escrow'],
    enabled: !!user && activeTab === 'escrow',
    staleTime: 5 * 60 * 1000,
  });

  const { data: affiliates = [] } = useQuery<AffiliateData[]>({
    queryKey: ['/api/marketplace/affiliates'],
    enabled: !!user && activeTab === 'affiliates',
    staleTime: 5 * 60 * 1000,
  });

  const { data: aiRecommendations = [] } = useQuery<AIRecommendation[]>({
    queryKey: ['/api/marketplace/ai-recommendations'],
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
  });

  const { data: licenseTemplatesData = [] } = useQuery<LicenseTemplate[]>({
    queryKey: ['/api/marketplace/license-templates'],
    enabled: !!user && activeTab === 'licenses',
    staleTime: 5 * 60 * 1000,
  });

  const activeLicenseTemplates = licenseTemplatesData.length > 0 ? licenseTemplatesData : LICENSE_TYPES;

  const { data: contractTemplates = [] } = useQuery<ContractTemplate[]>({
    queryKey: ['/api/marketplace/contracts'],
    enabled: !!user && activeTab === 'contracts',
    staleTime: 5 * 60 * 1000,
  });

  const { data: collaborations = [] } = useQuery<CollaborationOffer[]>({
    queryKey: ['/api/marketplace/collaborations'],
    enabled: !!user && activeTab === 'collaborations',
    staleTime: 5 * 60 * 1000,
  });

  const purchaseBeatMutation = useMutation({
    mutationFn: async (data: { beatId: string; licenseType: string; useEscrow?: boolean }) => {
      const response = await apiRequest('POST', '/api/marketplace/purchase', data);
      return response.json();
    },
    onSuccess: (data: { url?: string }) => {
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({
          title: 'Purchase Successful!',
          description: `You've successfully purchased the beat. Download link sent to your email.`,
        });
        queryClient.invalidateQueries({ queryKey: ['/api/marketplace/purchases'] });
        invalidateOnMarketplaceChange();
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Purchase Failed',
        description: error.message || 'Failed to process purchase',
        variant: 'destructive',
      });
    },
  });

  const connectStripeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/marketplace/connect-stripe', {});
      return response.json();
    },
    onSuccess: (data: { url?: string }) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Connection Failed',
        description: error.message || 'Failed to connect Stripe account',
        variant: 'destructive',
      });
    },
  });

  const uploadBeatMutation = useMutation({
    mutationFn: async (beatData: FormData) => {
      return uploadWithProgress('/api/marketplace/upload', beatData, {
        onProgress: (percent) => setUploadProgress(percent),
        timeout: 300000, // 5 minutes
      });
    },
    onSuccess: () => {
      toast({
        title: 'Beat Uploaded!',
        description: 'Your beat has been uploaded successfully and is now live.',
      });
      resetUploadForm();
      setShowUploadModal(false);
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/beats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/my-beats'] });
      invalidateOnMarketplaceChange();
    },
    onError: (error: Error) => {
      setUploadProgress(0);
      toast({
        title: 'Upload Failed',
        description: error.message || 'Failed to upload beat',
        variant: 'destructive',
      });
    },
  });

  const updateBeatMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: FormData }) => {
      const response = await apiRequest('PUT', `/api/marketplace/listings/${id}`, data, {
        timeout: 300000,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Beat Updated!',
        description: 'Your beat has been updated successfully.',
      });
      setShowEditModal(false);
      setEditingBeat(null);
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/my-beats'] });
      invalidateOnMarketplaceChange();
    },
    onError: (error: Error) => {
      toast({
        title: 'Update Failed',
        description: error.message || 'Failed to update beat',
        variant: 'destructive',
      });
    },
  });

  const deleteBeatMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/marketplace/listings/${id}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Beat Deleted',
        description: 'Your beat has been removed from the marketplace.',
      });
      setShowDeleteConfirm(false);
      setDeletingBeatId(null);
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/my-beats'] });
      invalidateOnMarketplaceChange();
    },
    onError: (error: Error) => {
      toast({
        title: 'Delete Failed',
        description: error.message || 'Failed to delete beat',
        variant: 'destructive',
      });
    },
  });

  const [discountBeat, setDiscountBeat] = useState<Beat | null>(null);
  const [discountForm, setDiscountForm] = useState({ percent: 10, expiresAt: '' });
  const [editLicenseTiers, setEditLicenseTiers] = useState<Array<{
    licenseType: string;
    label: string;
    priceCents: number;
    discountType: string;
    discountPercent: number;
    discountExpiresAt: string;
    bogoEnabled: boolean;
    bogoGetType: string;
    bogoGetPercent: number;
    fileFormats: string[];
    audioUrls: Record<string, string>;
    isActive: boolean;
  }>>([]);
  const [showLicenseTiers, setShowLicenseTiers] = useState(false);

  const discountMutation = useMutation({
    mutationFn: async ({ beatId, discountPercent, discountExpiresAt }: { beatId: string; discountPercent: number | null; discountExpiresAt?: string }) => {
      if (discountPercent === null) {
        const response = await apiRequest('DELETE', `/api/storefront/_/listings/${beatId}/discount`);
        return response.json();
      }
      const response = await apiRequest('PUT', `/api/storefront/_/listings/${beatId}/discount`, {
        discountPercent,
        discountExpiresAt: discountExpiresAt || null,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Discount Updated', description: 'Beat discount has been updated.' });
      setDiscountBeat(null);
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/my-beats'] });
      invalidateOnMarketplaceChange();
    },
    onError: (error: Error) => {
      toast({ title: 'Discount Error', description: error.message || 'Failed to update discount', variant: 'destructive' });
    },
  });

  const tiersMutation = useMutation({
    mutationFn: async ({ beatId, tiers }: { beatId: string; tiers: typeof editLicenseTiers }) => {
      if (tiers.length === 0) {
        const response = await apiRequest('DELETE', `/api/storefront/_/listings/${beatId}/tiers`);
        return response.json();
      }
      const response = await apiRequest('PUT', `/api/storefront/_/listings/${beatId}/tiers`, { tiers });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'License Tiers Saved', description: 'License pricing has been updated.' });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/my-beats'] });
      invalidateOnMarketplaceChange();
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message || 'Failed to save license tiers', variant: 'destructive' });
    },
  });

  const DEFAULT_LICENSE_TIERS = [
    { licenseType: 'basic', label: 'Basic', priceCents: 2999, discountType: 'none', discountPercent: 0, discountExpiresAt: '', bogoEnabled: false, bogoGetType: '', bogoGetPercent: 100, fileFormats: ['mp3'], audioUrls: {}, isActive: true },
    { licenseType: 'premium', label: 'Premium', priceCents: 4999, discountType: 'none', discountPercent: 0, discountExpiresAt: '', bogoEnabled: false, bogoGetType: '', bogoGetPercent: 100, fileFormats: ['mp3', 'wav'], audioUrls: {}, isActive: true },
    { licenseType: 'unlimited', label: 'Unlimited', priceCents: 9999, discountType: 'none', discountPercent: 0, discountExpiresAt: '', bogoEnabled: false, bogoGetType: '', bogoGetPercent: 100, fileFormats: ['mp3', 'wav', 'stems'], audioUrls: {}, isActive: true },
    { licenseType: 'exclusive', label: 'Exclusive', priceCents: 29999, discountType: 'none', discountPercent: 0, discountExpiresAt: '', bogoEnabled: false, bogoGetType: '', bogoGetPercent: 100, fileFormats: ['mp3', 'wav', 'stems'], audioUrls: {}, isActive: true },
  ];

  const handleEditBeat = (beat: Beat) => {
    setEditingBeat(beat);
    if (editCoverArtPreviewUrl) revokeLocalPreview(editCoverArtPreviewUrl);
    setEditCoverArtPreviewUrl(null);
    setEditCoverArtServerUrl(null);
    setEditCoverArtUploading(false);
    setEditForm({
      title: beat.title,
      genre: beat.genre || '',
      mood: beat.mood || '',
      tempo: beat.tempo || 120,
      key: beat.key || 'C',
      price: beat.price || 50,
      licenseType: beat.licenseType || 'basic',
      description: beat.description || '',
      tags: beat.tags?.join(', ') || '',
      coverArtFile: null,
      discountPercent: beat.discountPercent || 0,
      discountExpiresAt: beat.discountExpiresAt || '',
    });
    const hasTiers = beat.hasLicenseTiers && beat.licenseTiers && beat.licenseTiers.length > 0;
    setShowLicenseTiers(!!hasTiers);
    setEditLicenseTiers(hasTiers ? beat.licenseTiers!.map(t => ({
      licenseType: t.licenseType,
      label: t.label,
      priceCents: t.priceCents,
      discountType: t.discountType || 'none',
      discountPercent: t.discountPercent || 0,
      discountExpiresAt: t.discountExpiresAt || '',
      bogoEnabled: t.bogoEnabled || false,
      bogoGetType: t.bogoGetType || '',
      bogoGetPercent: t.bogoGetPercent ?? 100,
      fileFormats: t.fileFormats || ['mp3'],
      audioUrls: t.audioUrls || {},
      isActive: t.isActive !== false,
    })) : []);
    setShowEditModal(true);
  };

  const handleUpdateBeat = async () => {
    if (!editingBeat) return;
    const formData = new FormData();
    formData.append('title', editForm.title);
    formData.append('genre', editForm.genre);
    if (editForm.mood) formData.append('mood', editForm.mood);
    formData.append('tempo', String(editForm.tempo));
    formData.append('key', editForm.key);
    formData.append('price', String(editForm.price));
    if (editForm.licenseType) formData.append('licenseType', editForm.licenseType);
    formData.append('description', editForm.description);
    formData.append('tags', editForm.tags);
    if (editCoverArtServerUrl) {
      formData.append('artworkUrl', editCoverArtServerUrl);
    } else if (editForm.coverArtFile) {
      formData.append('artwork', editForm.coverArtFile);
    }
    updateBeatMutation.mutate({ id: editingBeat.id, data: formData });

    if (!showLicenseTiers) {
      const hadDiscount = editingBeat.discountPercent && editingBeat.discountPercent > 0;
      const wantsDiscount = editForm.discountPercent > 0 && editForm.discountPercent < 100;
      if (wantsDiscount) {
        discountMutation.mutate({
          beatId: editingBeat.id,
          discountPercent: editForm.discountPercent,
          discountExpiresAt: editForm.discountExpiresAt || undefined,
        });
      } else if (hadDiscount && !wantsDiscount) {
        discountMutation.mutate({ beatId: editingBeat.id, discountPercent: null });
      }
    }

    if (showLicenseTiers && editLicenseTiers.length > 0) {
      tiersMutation.mutate({ beatId: editingBeat.id, tiers: editLicenseTiers });
    } else if (!showLicenseTiers && editingBeat.hasLicenseTiers) {
      tiersMutation.mutate({ beatId: editingBeat.id, tiers: [] });
    }
  };

  const handleDeleteBeat = (beatId: string) => {
    setDeletingBeatId(beatId);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteBeat = () => {
    if (deletingBeatId) {
      deleteBeatMutation.mutate(deletingBeatId);
    }
  };

  const followProducerMutation = useMutation({
    mutationFn: async (producerId: string) => {
      const response = await apiRequest('POST', `/api/marketplace/follow/${producerId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Producer Followed!',
        description: 'You will see updates from this producer',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/producers'] });
    },
  });

  const unfollowProducerMutation = useMutation({
    mutationFn: async (producerId: string) => {
      const response = await apiRequest('POST', `/api/marketplace/unfollow/${producerId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Producer Unfollowed',
        description: 'You have unfollowed this producer',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/producers'] });
    },
  });

  const likeBeatMutation = useMutation({
    mutationFn: async (beatId: string) => {
      const response = await apiRequest('POST', `/api/marketplace/beats/${beatId}/like`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Beat Liked!',
        description: 'This beat has been added to your favorites',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/beats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/for-you'] });
    },
  });

  const createLicenseTemplateMutation = useMutation({
    mutationFn: async (data: typeof licenseForm) => {
      const response = await apiRequest('POST', '/api/marketplace/license-templates', data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'License Created', description: 'New license template created successfully.' });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/license-templates'] });
      setShowLicenseModal(false);
      setLicenseForm({ name: '', type: 'non-exclusive', priceCents: 2999, streams: '100000', copies: '5000', musicVideos: '1', duration: '1 year', allowsBroadcast: false, allowsProfit: true, allowsSync: false, fileFormats: 'MP3' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message || 'Failed to create license template', variant: 'destructive' });
    },
  });

  const updateLicenseTemplateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<typeof licenseForm & { isActive: boolean }>) => {
      const response = await apiRequest('PUT', `/api/marketplace/license-templates/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'License Updated', description: 'License template updated successfully.' });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/license-templates'] });
      setSelectedLicense(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message || 'Failed to update license template', variant: 'destructive' });
    },
  });

  const deleteLicenseTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/marketplace/license-templates/${id}`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'License Deleted', description: 'License template has been removed.' });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/license-templates'] });
      setSelectedLicense(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message || 'Failed to delete license template', variant: 'destructive' });
    },
  });

  const openEditLicense = (license: LicenseTemplate) => {
    setSelectedLicense(license);
    setLicenseForm({
      name: license.name,
      type: license.type,
      priceCents: Math.round(license.price * 100),
      streams: String(license.streams),
      copies: String(license.copies),
      musicVideos: String(license.musicVideos),
      duration: license.duration,
      allowsBroadcast: license.allowsBroadcast,
      allowsProfit: license.allowsProfit,
      allowsSync: license.allowsSync,
      fileFormats: 'MP3',
    });
  };

  const rateBeatMutation = useMutation({
    mutationFn: async ({ beatId, rating }: { beatId: string; rating: number }) => {
      const response = await apiRequest('POST', `/api/marketplace/beats/${beatId}/rate`, { rating });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Rating Submitted!',
        description: `Your rating has been recorded. Average: ${data.avgRating}/5`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/beats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/for-you'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Rating Failed',
        description: error?.message || 'Could not submit your rating. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const releaseEscrowMutation = useMutation({
    mutationFn: async (transactionId: string) => {
      const response = await apiRequest('POST', `/api/marketplace/escrow/${transactionId}/release`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Escrow Released', description: 'Funds have been released to the seller.' });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/escrow'] });
      invalidateOnMarketplaceChange();
    },
  });

  const createAffiliateMutation = useMutation({
    mutationFn: async (data: { name: string; email: string; commissionRate: number }) => {
      const response = await apiRequest('POST', '/api/marketplace/affiliates', data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Affiliate Created', description: 'New affiliate partner has been added.' });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/affiliates'] });
      setShowAffiliateModal(false);
    },
  });

  const saveContractMutation = useMutation({
    mutationFn: async (data: typeof contractForm) => {
      const response = await apiRequest('POST', '/api/marketplace/contracts', data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Contract Saved', description: 'Your contract template has been saved.' });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/contracts'] });
      setShowContractModal(false);
    },
  });

  const updateContractMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest('PATCH', `/api/marketplace/contracts/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Contract Updated', description: 'Your contract template has been updated.' });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/contracts'] });
      setShowEditContract(false);
      setSelectedContract(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Update Failed', description: error?.message || 'Failed to update contract.', variant: 'destructive' });
    },
  });

  const deleteContractMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/marketplace/contracts/${id}`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Contract Deleted', description: 'Your contract template has been removed.' });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/contracts'] });
      setShowDeleteContract(false);
      setSelectedContract(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Delete Failed', description: error?.message || 'Failed to delete contract.', variant: 'destructive' });
    },
  });

  const sendCollaborationMutation = useMutation({
    mutationFn: async (data: { toUserId: string; beatId?: string } & typeof collaborationForm) => {
      const response = await apiRequest('POST', '/api/marketplace/collaborations', data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Offer Sent', description: 'Your collaboration offer has been sent.' });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/collaborations'] });
      setShowCollaborationModal(false);
    },
  });

  const trackInteraction = async (beatId: string, interactionType: string, extra?: any) => {
    try {
      await fetch('/api/marketplace/interaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ beatId, interactionType, ...extra }),
      });
    } catch (e) {
      // Silent fail - don't block UX for analytics
    }
  };

  const handlePlayPause = async (beatId: string, beatUrl?: string) => {
    if (isPlaying === beatId) {
      // Pause/stop current playback immediately
      if (howlRef.current) {
        howlRef.current.pause();
      }
      setIsPlaying(null);
      setShowPreviewPlayer(false);
      return;
    }

    // Stop any existing playback and cleanup
    if (howlRef.current) {
      howlRef.current.stop();
      howlRef.current.unload();
      howlRef.current = null;
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    const beat = beats.find((b) => b.id === beatId) || myBeats.find((b) => b.id === beatId);
    let audioUrl = beatUrl || beat?.audioUrl || beat?.previewUrl || beat?.fullUrl;

    if (!audioUrl) {
      toast({
        title: 'Preview Unavailable',
        description: 'Audio file not available for this beat',
        variant: 'destructive',
      });
      return;
    }

    // Convert relative URL to absolute URL with proper API endpoint
    if (!audioUrl.startsWith('http')) {
      // Handle URLs without leading slash (e.g., "uploads/...")
      if (!audioUrl.startsWith('/')) {
        audioUrl = `/api/marketplace/audio/${audioUrl}`;
      } else if (!audioUrl.startsWith('/api/')) {
        // Has leading slash but not going through API
        audioUrl = `/api/marketplace/audio${audioUrl}`;
      }
      audioUrl = `${window.location.origin}${audioUrl}`;
    }

    setIsLoadingAudio(true);
    setCurrentBeat(beat || null);
    setShowPreviewPlayer(true);

    // Detect audio format from URL extension
    const urlLower = audioUrl.toLowerCase();
    let formats: string[] = ['mp3']; // default
    if (urlLower.endsWith('.wav')) {
      formats = ['wav'];
    } else if (urlLower.endsWith('.ogg')) {
      formats = ['ogg'];
    } else if (urlLower.endsWith('.webm')) {
      formats = ['webm'];
    } else if (urlLower.endsWith('.flac')) {
      formats = ['flac'];
    } else if (urlLower.endsWith('.m4a') || urlLower.endsWith('.aac')) {
      formats = ['m4a', 'aac'];
    }

    // Use Howler.js with streaming - starts playing immediately without downloading entire file
    const howl = new Howl({
      src: [audioUrl],
      format: formats,
      html5: true, // Required for streaming - uses HTML5 Audio element
      volume: volume / 100,
      xhr: {
        withCredentials: true, // Send cookies for authenticated requests
      },
      onload: () => {
        setDuration(howl.duration());
      },
      onplay: () => {
        setIsLoadingAudio(false);
        setIsPlaying(beatId);
        // Update current time periodically
        const updateTime = () => {
          if (howlRef.current && howlRef.current.playing()) {
            setCurrentTime(howlRef.current.seek() as number);
            requestAnimationFrame(updateTime);
          }
        };
        requestAnimationFrame(updateTime);
      },
      onend: () => {
        setIsPlaying(null);
        setShowPreviewPlayer(false);
        setCurrentTime(0);
      },
      onloaderror: (_id, error) => {
        logger.error('Howler load error:', error);
        toast({
          title: 'Playback Error',
          description: 'Failed to load audio file',
          variant: 'destructive',
        });
        setIsPlaying(null);
        setIsLoadingAudio(false);
        setShowPreviewPlayer(false);
      },
      onplayerror: (_id, error) => {
        logger.error('Howler play error:', error);
        // Try to unlock and play again (needed for mobile browsers)
        howl.once('unlock', () => {
          howl.play();
        });
      },
    });

    howlRef.current = howl;
    howl.play();
  };

  const handleSeek = (value: number[]) => {
    if (howlRef.current) {
      howlRef.current.seek(value[0]);
      setCurrentTime(value[0]);
    }
  };

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    setVolume(newVolume);
    if (howlRef.current) {
      howlRef.current.volume(newVolume / 100);
    }
    if (newVolume > 0) setIsMuted(false);
  };

  const toggleMute = () => {
    if (howlRef.current) {
      howlRef.current.mute(!isMuted);
      setIsMuted(!isMuted);
    }
  };

  const formatTime = (time: number): string => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    return () => {
      if (howlRef.current) {
        howlRef.current.stop();
        howlRef.current.unload();
        howlRef.current = null;
      }
    };
  }, []);

  const handleAddToCart = (beat: Beat, licenseType: string) => {
    const existingItem = cart.find(
      (item) => item.beatId === beat.id && item.licenseType === licenseType
    );
    if (existingItem) {
      toast({
        title: 'Already in Cart',
        description: 'This beat with this license type is already in your cart.',
        variant: 'destructive',
      });
      return;
    }

    const price = getLicensePrice(beat, licenseType);
    setCart([...cart, { beatId: beat.id, licenseType, price }]);
    toast({
      title: 'Added to Cart',
      description: `${beat.title} has been added to your cart.`,
    });
  };

  const handlePurchase = (beat: Beat, licenseType: string, useEscrow = false) => {
    purchaseBeatMutation.mutate({ beatId: beat.id, licenseType, useEscrow });
  };

  const handleShare = (beat: Beat) => {
    const beatUrl = `${window.location.origin}/marketplace/beat/${beat.id}`;
    if (navigator.share) {
      navigator.share({
        title: beat.title,
        text: `Check out this beat: ${beat.title} by ${beat.producer}`,
        url: beatUrl,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(beatUrl).then(() => {
        toast({
          title: 'Link Copied!',
          description: 'Beat link copied to clipboard',
        });
      }).catch(() => {
        toast({
          title: 'Share',
          description: beatUrl,
        });
      });
    }
  };

  const getLicensePrice = (beat: Beat, licenseType: string): number => {
    if (beat.hasLicenseTiers && beat.licenseTiers?.length) {
      const tier = beat.licenseTiers.find(t => t.licenseType === licenseType && t.isActive);
      if (tier) {
        if (tier.discountType === 'percent' && tier.discountPrice != null) return tier.discountPrice;
        return tier.price;
      }
    }
    const basePrice = beat.price;
    switch (licenseType) {
      case 'basic': return basePrice;
      case 'premium': return basePrice * 2;
      case 'unlimited': return basePrice * 5;
      case 'exclusive': return basePrice * 20;
      default: return basePrice;
    }
  };

  const getLicenseOriginalPrice = (beat: Beat, licenseType: string): number | null => {
    if (beat.hasLicenseTiers && beat.licenseTiers?.length) {
      const tier = beat.licenseTiers.find(t => t.licenseType === licenseType && t.isActive);
      if (tier && tier.discountType === 'percent' && tier.discountPercent && tier.discountPercent > 0) {
        return tier.price;
      }
    }
    return null;
  };

  const getLicenseTier = (beat: Beat, licenseType: string): LicenseTier | null => {
    if (beat.hasLicenseTiers && beat.licenseTiers?.length) {
      return beat.licenseTiers.find(t => t.licenseType === licenseType && t.isActive) || null;
    }
    return null;
  };

  const getLicenseDescription = (licenseType: string): string => {
    switch (licenseType) {
      case 'basic': return 'Basic lease - 5,000 copies, 1 year';
      case 'premium': return 'Premium lease - 50,000 copies, 2 years';
      case 'unlimited': return 'Unlimited lease - Unlimited copies, 5 years';
      case 'exclusive': return 'Exclusive rights - Full ownership';
      default: return '';
    }
  };

  const getAvailableLicenses = (beat: Beat): string[] => {
    if (beat.hasLicenseTiers && beat.licenseTiers?.length) {
      return beat.licenseTiers.filter(t => t.isActive).map(t => t.licenseType);
    }
    return ['basic', 'premium', 'unlimited'];
  };

  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [bulkEditValues, setBulkEditValues] = useState({
    title: '',
    genre: '',
    mood: '',
    tempo: 0,
    key: '',
    price: 0,
    licenseType: '',
    description: '',
    tags: '',
    coverArtFile: null as File | null,
  });
  const [expandedBulkItem, setExpandedBulkItem] = useState<string | null>(null);

  const handleBulkFileSelect = (files: FileList) => {
    const newItems: BulkUploadItem[] = Array.from(files).map((file, index) => ({
      id: `bulk-${Date.now()}-${index}`,
      file,
      title: file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
      genre: 'Hip-Hop',
      mood: 'Chill',
      tempo: 120,
      key: 'C',
      price: 50,
      licenseType: 'basic',
      description: '',
      tags: '',
      coverArtServerUrl: null,
      coverArtPreviewUrl: null,
      coverArtUploading: false,
      status: 'pending',
      progress: 0,
    }));
    setBulkUploadItems([...bulkUploadItems, ...newItems]);
  };

  const applyBulkEdit = () => {
    setBulkUploadItems(prev => prev.map(item => {
      if (item.status !== 'pending') return item;
      const updated = { ...item };
      if (bulkEditValues.title) updated.title = bulkEditValues.title;
      if (bulkEditValues.genre) updated.genre = bulkEditValues.genre;
      if (bulkEditValues.mood) updated.mood = bulkEditValues.mood;
      if (bulkEditValues.tempo > 0) updated.tempo = bulkEditValues.tempo;
      if (bulkEditValues.key) updated.key = bulkEditValues.key;
      if (bulkEditValues.price > 0) updated.price = bulkEditValues.price;
      if (bulkEditValues.licenseType) updated.licenseType = bulkEditValues.licenseType;
      if (bulkEditValues.description) updated.description = bulkEditValues.description;
      if (bulkEditValues.tags) updated.tags = bulkEditValues.tags;
      if (bulkEditCoverServerUrl) {
        updated.coverArtServerUrl = bulkEditCoverServerUrl;
        if (updated.coverArtPreviewUrl) revokeLocalPreview(updated.coverArtPreviewUrl);
        updated.coverArtPreviewUrl = null;
        updated.coverArtUploading = false;
      }
      return updated;
    }));
    setBulkEditMode(false);
    toast({ title: 'Applied', description: 'Settings applied to all pending beats.' });
  };

  const handleBulkUpload = async () => {
    let succeeded = 0;
    let failed = 0;

    for (const item of bulkUploadItems) {
      if (item.status === 'pending') {
        setBulkUploadItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: 'uploading' as const, progress: 0 } : i))
        );

        try {
          const formData = new FormData();
          formData.append('audioFile', item.file);
          formData.append('title', item.title);
          formData.append('genre', item.genre);
          formData.append('mood', item.mood);
          formData.append('tempo', item.tempo.toString());
          formData.append('key', item.key);
          formData.append('price', item.price.toString());
          formData.append('licenseType', item.licenseType);
          if (item.description) formData.append('description', item.description);
          if (item.tags) formData.append('tags', item.tags);
          if (item.coverArtServerUrl) formData.append('artworkUrl', item.coverArtServerUrl);

          await uploadWithProgress('/api/marketplace/upload', formData, { timeout: 300000 });

          setBulkUploadItems((prev) =>
            prev.map((i) =>
              i.id === item.id ? { ...i, status: 'completed' as const, progress: 100 } : i
            )
          );
          succeeded++;
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Upload failed';
          setBulkUploadItems((prev) =>
            prev.map((i) =>
              i.id === item.id
                ? { ...i, status: 'failed' as const, error: errorMessage }
                : i
            )
          );
          failed++;
        }
      }
    }

    queryClient.invalidateQueries({ queryKey: ['/api/marketplace/my-beats'] });
    queryClient.invalidateQueries({ queryKey: ['/api/marketplace/beats'] });

    if (failed === 0) {
      toast({
        title: 'Bulk Upload Complete',
        description: `${succeeded} beat${succeeded !== 1 ? 's' : ''} uploaded successfully.`,
      });
    } else if (succeeded === 0) {
      toast({
        title: 'Upload Failed',
        description: `All ${failed} upload${failed !== 1 ? 's' : ''} failed. Please try again.`,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Partial Upload',
        description: `${succeeded} uploaded, ${failed} failed. Check failed items and retry.`,
        variant: 'destructive',
      });
    }
  };

  if (authLoading) {
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-64 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
              ))}
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-200/60 dark:border-gray-700">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Max Booster Marketplace
              </h1>
              <p className="text-gray-600 dark:text-gray-300 mt-2 text-lg">
                Buy & Sell Beats with Escrow Protection & AI Discovery
              </p>
              <div className="flex items-center flex-wrap gap-2 mt-4">
                <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50">
                  <Shield className="w-3 h-3 mr-1" />
                  Escrow Protected
                </Badge>
                <Badge variant="outline" className="border-purple-200 text-purple-700 bg-purple-50">
                  <Brain className="w-3 h-3 mr-1" />
                  AI Discovery
                </Badge>
                <Badge variant="outline" className="border-green-200 text-green-700 bg-green-50">
                  <FileSignature className="w-3 h-3 mr-1" />
                  Smart Contracts
                </Badge>
                <Badge variant="outline" className="border-orange-200 text-orange-700 bg-orange-50">
                  <Handshake className="w-3 h-3 mr-1" />
                  Collaborations
                </Badge>
              </div>
            </div>
            {user && (
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => setShowBulkUploadModal(true)}
                  variant="outline"
                  data-testid="button-bulk-upload"
                >
                  <FolderUp className="w-4 h-4 mr-2" />
                  Bulk Upload
                </Button>
                <Button
                  onClick={() => setShowUploadModal(true)}
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                  data-testid="button-upload-beat"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Beat
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowCartModal(true)}
                  data-testid="button-view-cart"
                >
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Cart ({cart.length})
                </Button>
              </div>
            )}
          </div>
        </div>

        {aiRecommendations.length > 0 && aiRecommendations.some(rec => rec.beat) && (
          <Card className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border-purple-200 dark:border-purple-800">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Sparkles className="w-5 h-5 mr-2 text-purple-600" />
                AI Recommendations For You
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 overflow-x-auto pb-2">
                {aiRecommendations.slice(0, 5).filter(rec => rec.beat).map((rec) => (
                  <Card
                    key={rec.id}
                    className="min-w-[200px] hover:shadow-lg transition cursor-pointer"
                    onClick={() => rec.beat && handlePlayPause(rec.beat.id)}
                  >
                    <CardContent className="p-4">
                      <div className="w-full h-24 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg mb-3 flex items-center justify-center">
                        <Music className="w-8 h-8 text-white opacity-70" />
                      </div>
                      <h4 className="font-semibold text-sm truncate">{rec.beat?.title || 'Unknown Beat'}</h4>
                      <p className="text-xs text-muted-foreground">{rec.beat?.producer || 'Unknown Producer'}</p>
                      <div className="flex items-center mt-2">
                        <Badge variant="secondary" className="text-xs">
                          {rec.matchScore || 0}% Match
                        </Badge>
                      </div>
                      <div className="mt-2">
                        {(rec.reasons || []).slice(0, 2).map((reason, i) => (
                          <p key={i} className="text-xs text-muted-foreground flex items-center">
                            <Lightbulb className="w-3 h-3 mr-1 text-yellow-500" />
                            {reason}
                          </p>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg">
          <CardContent className="p-6">
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="flex-1" ref={searchRef}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 z-10" />
                  <Input
                    placeholder="Search beats, producers, genres..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowSuggestions(e.target.value.length > 0);
                    }}
                    onFocus={() => searchQuery.length > 0 && setShowSuggestions(true)}
                    className="pl-10"
                    data-testid="input-search-beats"
                  />
                  {showSuggestions && searchQuery.length > 0 && (() => {
                    const q = searchQuery.toLowerCase();
                    const matchedProducers = producers.filter(p =>
                      p.displayName?.toLowerCase().includes(q) ||
                      p.username?.toLowerCase().includes(q) ||
                      p.bio?.toLowerCase().includes(q)
                    ).slice(0, 5);
                    const matchedGenres = BEAT_GENRES.filter(g => g.toLowerCase().includes(q)).slice(0, 4);
                    const matchedMoods = BEAT_MOODS.filter(m => m.toLowerCase().includes(q)).slice(0, 3);
                    if (matchedProducers.length === 0 && matchedGenres.length === 0 && matchedMoods.length === 0) return null;
                    return (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden max-h-80 overflow-y-auto">
                        {matchedProducers.length > 0 && (
                          <div>
                            <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-900">Producers</div>
                            {matchedProducers.map(p => (
                              <button
                                key={p.id}
                                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors text-left"
                                onClick={() => {
                                  setShowSuggestions(false);
                                  navigate(`/marketplace/producer/${p.id}`);
                                }}
                              >
                                {p.avatar ? (
                                  <img src={p.avatar} alt={p.displayName} className="w-8 h-8 rounded-full object-cover border border-purple-500/30" />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                                    {p.displayName?.substring(0, 2)?.toUpperCase() || 'PR'}
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-medium text-sm truncate">{p.displayName}</span>
                                    {p.verified && <CheckCircle className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />}
                                  </div>
                                  <span className="text-xs text-gray-500">{p.beats || 0} beats · {p.followers || 0} followers</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                        {matchedGenres.length > 0 && (
                          <div>
                            <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-900">Genres</div>
                            {matchedGenres.map(g => (
                              <button
                                key={g}
                                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors text-left"
                                onClick={() => {
                                  setShowSuggestions(false);
                                  setSearchQuery('');
                                  setSelectedGenre(g);
                                }}
                              >
                                <Music className="w-4 h-4 text-blue-500" />
                                <span className="text-sm">{g}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {matchedMoods.length > 0 && (
                          <div>
                            <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-900">Moods</div>
                            {matchedMoods.map(m => (
                              <button
                                key={m}
                                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors text-left"
                                onClick={() => {
                                  setShowSuggestions(false);
                                  setSearchQuery('');
                                  setSelectedMood(m);
                                }}
                              >
                                <Sparkles className="w-4 h-4 text-purple-500" />
                                <span className="text-sm">{m}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={selectedGenre} onValueChange={setSelectedGenre}>
                  <SelectTrigger className="w-32" data-testid="select-genre">
                    <SelectValue placeholder="Genre" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Genres</SelectItem>
                    {BEAT_GENRES.map((genre) => (
                      <SelectItem key={genre} value={genre}>{genre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedMood} onValueChange={setSelectedMood}>
                  <SelectTrigger className="w-32" data-testid="select-mood">
                    <SelectValue placeholder="Mood" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Moods</SelectItem>
                    {BEAT_MOODS.map((mood) => (
                      <SelectItem key={mood} value={mood}>{mood}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-36" data-testid="select-sort-by">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest</SelectItem>
                    <SelectItem value="oldest">Oldest</SelectItem>
                    <SelectItem value="price-low">Price: Low to High</SelectItem>
                    <SelectItem value="price-high">Price: High to Low</SelectItem>
                    <SelectItem value="popular">Most Popular</SelectItem>
                    <SelectItem value="trending">Trending</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex border rounded-lg">
                  <Button
                    variant={viewMode === 'grid' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('grid')}
                  >
                    <Grid className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('list')}
                  >
                    <List className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className={`grid w-full ${user ? 'grid-cols-5 lg:grid-cols-11' : 'grid-cols-2'} bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700`}>
            <TabsTrigger value="browse" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs">
              Browse
            </TabsTrigger>
            <TabsTrigger value="producers" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs">
              Producers
            </TabsTrigger>
            {user && (
              <>
                <TabsTrigger value="my-beats" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs">
                  My Beats
                </TabsTrigger>
                <TabsTrigger value="my-store" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs">
                  My Store
                </TabsTrigger>
                <TabsTrigger value="merch" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs">
                  <ShoppingCart className="w-3 h-3 mr-1 inline" />
                  Merch
                </TabsTrigger>
                <TabsTrigger value="purchases" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs">
                  Purchases
                </TabsTrigger>
                <TabsTrigger value="sales" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs">
                  Analytics
                </TabsTrigger>
                <TabsTrigger value="escrow" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs">
                  Escrow
                </TabsTrigger>
                <TabsTrigger value="licenses" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs">
                  Licenses
                </TabsTrigger>
                <TabsTrigger value="affiliates" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs">
                  Affiliates
                </TabsTrigger>
                <TabsTrigger value="contracts" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs">
                  Contracts
                </TabsTrigger>
                <TabsTrigger value="collaborations" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs">
                  Collabs
                </TabsTrigger>
              </>
            )}
          </TabsList>

          <TabsContent value="browse" className="space-y-6">
            {(searchQuery || selectedGenre !== 'all' || selectedMood !== 'all') && !beatsLoading && (beats.length > 0 || producers.length > 0) && (
              <FilterResultsHeader
                resultCount={beats.length}
                filterName={searchQuery || (selectedGenre !== 'all' ? selectedGenre : selectedMood !== 'all' ? selectedMood : undefined)}
                onClear={() => {
                  setSearchQuery('');
                  setSelectedGenre('all');
                  setSelectedMood('all');
                }}
              />
            )}

            {searchQuery && (() => {
              const q = searchQuery.toLowerCase();
              const matchingProducers = producers.filter(p =>
                p.displayName?.toLowerCase().includes(q) ||
                p.username?.toLowerCase().includes(q) ||
                p.bio?.toLowerCase().includes(q) ||
                p.location?.toLowerCase().includes(q)
              );
              if (matchingProducers.length === 0) return null;
              return (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Users className="w-5 h-5 text-purple-500" />
                    Producers ({matchingProducers.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {matchingProducers.map((producer) => (
                      <Card
                        key={producer.id}
                        className="hover:shadow-xl transition group cursor-pointer border-2 hover:border-blue-500"
                        onClick={() => navigate(`/marketplace/producer/${producer.id}`)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center gap-4">
                            <div className="relative flex-shrink-0">
                              {producer.avatar ? (
                                <img
                                  src={producer.avatar}
                                  alt={producer.displayName || 'Producer'}
                                  className="w-14 h-14 rounded-full object-cover border-2 border-purple-500/30"
                                />
                              ) : (
                                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-lg font-bold">
                                  {producer.displayName?.substring(0, 2)?.toUpperCase() || 'PR'}
                                </div>
                              )}
                              {producer.verified && (
                                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center border-2 border-white">
                                  <CheckCircle className="w-3 h-3 text-white" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-bold truncate group-hover:text-blue-600 transition">{producer.displayName}</h4>
                              {producer.bio && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{producer.bio}</p>
                              )}
                              <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                                <span>{producer.beats || 0} beats</span>
                                <span>{producer.followers || 0} followers</span>
                                {producer.rating ? <span>{'★'.repeat(Math.round(producer.rating))}</span> : null}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })()}

            {beatsLoading ? (
              <BeatGridSkeleton count={12} viewMode={viewMode as 'grid' | 'list'} />
            ) : beats.length === 0 ? (
              <NoBeatsFoundEmptyState
                searchQuery={searchQuery}
                suggestions={['Trap', 'Hip-Hop', 'R&B', 'Lo-Fi', 'Pop', 'Drill']}
                filterApplied={selectedGenre !== 'all' || selectedMood !== 'all'}
                onAction={(action) => {
                  if (action === 'clear_filters') {
                    setSearchQuery('');
                    setSelectedGenre('all');
                    setSelectedMood('all');
                  } else if (action.startsWith('search:')) {
                    setSearchQuery(action.replace('search:', ''));
                    setSelectedGenre('all');
                    setSelectedMood('all');
                  }
                }}
              />
            ) : (
              <div className={`grid gap-6 ${viewMode === 'grid' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1'}`}>
                {beats.map((beat) => (
                  <Card key={beat.id} className="group hover:shadow-xl transition-all duration-300 border border-gray-200 dark:border-gray-700">
                    <CardContent className="p-0">
                      <div className="relative">
                        <div className="relative w-full h-48 bg-gradient-to-br from-blue-500 to-purple-600 rounded-t-lg overflow-hidden">
                          <div className="flex items-center justify-center h-full">
                            <Music className="w-16 h-16 text-white opacity-50" />
                          </div>
                          {beat.coverArt && (
                            <img
                              src={beat.coverArt}
                              alt={beat.title}
                              loading="lazy"
                              decoding="async"
                              className="absolute inset-0 w-full h-full object-cover opacity-0 transition-opacity duration-300"
                              onLoad={(e) => { (e.target as HTMLImageElement).style.opacity = '1'; }}
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          )}
                        </div>
                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-200 rounded-t-lg flex items-center justify-center">
                          <Button
                            onClick={() => handlePlayPause(beat.id)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white/20 hover:bg-white/30 text-white border-white/30"
                            size="sm"
                            disabled={isLoadingAudio && isPlaying === beat.id}
                          >
                            {isLoadingAudio && isPlaying === beat.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : isPlaying === beat.id ? (
                              <Pause className="w-4 h-4" />
                            ) : (
                              <Play className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                        <div className="absolute top-3 right-3">
                          <Badge variant="secondary" className="backdrop-blur-sm bg-white/90 dark:bg-gray-800/90">
                            {beat.tempo} BPM
                          </Badge>
                        </div>
                        <div className="absolute top-3 left-3">
                          <Badge variant="outline" className="backdrop-blur-sm bg-green-500/90 text-white border-0">
                            <Shield className="w-3 h-3 mr-1" />
                            Escrow
                          </Badge>
                        </div>
                      </div>

                      <div className="p-4">
                        <div className="mb-3">
                          <h3 className="font-semibold text-gray-900 dark:text-white text-lg mb-1 line-clamp-1">
                            {beat.title}
                          </h3>
                          <p className="text-gray-600 dark:text-gray-400 text-sm mb-2">{beat.producer}</p>
                          <div className="flex items-center flex-wrap gap-1">
                            <Badge variant="outline" className="text-xs">{beat.genre}</Badge>
                            <Badge variant="outline" className="text-xs">{beat.mood}</Badge>
                            {beat.isExclusive && <Badge variant="destructive" className="text-xs">Exclusive</Badge>}
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 mb-4">
                          <div className="flex items-center space-x-4">
                            <div className="flex items-center space-x-1">
                              <Play className="w-3 h-3" />
                              <span>{(beat.plays ?? 0).toLocaleString()}</span>
                            </div>
                            <button 
                              className="flex items-center space-x-1 hover:text-red-500 transition-colors"
                              onClick={() => likeBeatMutation.mutate(beat.id)}
                              disabled={likeBeatMutation.isPending}
                            >
                              <Heart className={`w-3 h-3 ${likeBeatMutation.isPending ? 'animate-pulse' : ''}`} />
                              <span>{(beat.likes ?? 0).toLocaleString()}</span>
                            </button>
                            <div className="flex items-center space-x-1">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  onClick={() => rateBeatMutation.mutate({ beatId: beat.id, rating: star })}
                                  className="hover:scale-110 transition-transform"
                                  disabled={rateBeatMutation.isPending}
                                >
                                  <Star 
                                    className={`w-3 h-3 ${star <= ((beat as any).avgRating || 0) ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`} 
                                  />
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="text-right">
                            {beat.discountPercent && beat.discountPriceCents != null ? (
                              <>
                                <div className="flex items-center gap-1.5 justify-end">
                                  <p className="font-semibold text-green-600">${(beat.discountPriceCents / 100).toFixed(2)}</p>
                                  <Badge variant="destructive" className="text-[10px] px-1 py-0">-{beat.discountPercent}%</Badge>
                                </div>
                                <p className="text-xs line-through text-muted-foreground">${beat.price}</p>
                              </>
                            ) : (
                              <>
                                <p className="font-semibold text-gray-900 dark:text-white">${beat.price}</p>
                                <p className="text-xs">Starting from</p>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="space-y-2 mb-4">
                          {getAvailableLicenses(beat).map((license) => {
                            const tier = getLicenseTier(beat, license);
                            const originalPrice = getLicenseOriginalPrice(beat, license);
                            return (
                            <div key={license} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
                              <div>
                                <div className="flex items-center gap-1">
                                  <p className="text-sm font-medium capitalize">{tier?.label || license}</p>
                                  {tier?.bogoEnabled && (
                                    <Badge className="text-[9px] px-1 py-0 bg-orange-500">BOGO</Badge>
                                  )}
                                  {tier?.fileFormats && tier.fileFormats.length > 1 && (
                                    <Badge variant="outline" className="text-[9px] px-1 py-0">{tier.fileFormats.map(f => f.toUpperCase()).join('+')}</Badge>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500">{getLicenseDescription(license)}</p>
                                {tier?.bogoEnabled && tier.bogoGetType && (
                                  <p className="text-[10px] text-orange-600">Buy 1, get {tier.bogoGetPercent === 100 ? 'FREE' : `${tier.bogoGetPercent}% off`} {tier.bogoGetType} license</p>
                                )}
                              </div>
                              <div className="flex items-center space-x-2">
                                <div className="text-right">
                                  <span className="text-sm font-semibold">${getLicensePrice(beat, license).toFixed(2)}</span>
                                  {originalPrice != null && (
                                    <span className="text-xs line-through text-muted-foreground ml-1">${originalPrice.toFixed(2)}</span>
                                  )}
                                  {tier?.discountPercent && tier.discountPercent > 0 && (
                                    <Badge variant="destructive" className="text-[9px] px-1 py-0 ml-1">-{tier.discountPercent}%</Badge>
                                  )}
                                </div>
                                <Button size="sm" onClick={() => handleAddToCart(beat, license)} className="h-8 px-3">
                                  <Plus className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                            );
                          })}
                        </div>

                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => handlePurchase(beat, 'basic', true)}
                          >
                            <Shield className="w-4 h-4 mr-1" />
                            Buy with Escrow
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleShare(beat)}>
                            <Share2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="producers" className="space-y-6">
            {producers.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {producers.slice(0, 12).map((producer) => (
                  <Card key={producer.id} className="hover:shadow-xl transition group cursor-pointer border-2 hover:border-blue-500">
                    <CardContent className="p-6">
                      <div className="flex flex-col items-center space-y-4">
                        <div className="relative">
                          {producer.avatar ? (
                            <img 
                              src={producer.avatar} 
                              alt={producer.displayName || 'Producer'} 
                              className="w-24 h-24 rounded-full object-cover group-hover:scale-110 transition border-4 border-purple-500/30"
                            />
                          ) : (
                            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold group-hover:scale-110 transition">
                              {producer.displayName?.substring(0, 2)?.toUpperCase() || 'PR'}
                            </div>
                          )}
                          {producer.verified && (
                            <div className="absolute bottom-0 right-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center border-2 border-white">
                              <CheckCircle className="w-5 h-5 text-white" />
                            </div>
                          )}
                        </div>
                        <div className="text-center w-full">
                          <h4 className="font-bold text-lg group-hover:text-blue-600 transition">{producer.displayName}</h4>
                          {producer.bio && (
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">{producer.bio}</p>
                          )}
                          {producer.location && (
                            <div className="flex items-center justify-center space-x-1 text-xs text-gray-500 mt-1">
                              <MapPin className="w-3 h-3" />
                              <span>{producer.location}</span>
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-4 w-full">
                          <div className="text-center">
                            <p className="text-xl font-bold text-blue-600">{producer.beats}</p>
                            <p className="text-xs text-gray-500">Beats</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xl font-bold text-green-600">{producer.sales}</p>
                            <p className="text-xs text-gray-500">Sales</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xl font-bold text-purple-600">{producer.followers}</p>
                            <p className="text-xs text-gray-500">Followers</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-1">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className={`w-4 h-4 ${i < Math.floor(producer.rating ?? 0) ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`}
                            />
                          ))}
                          <span className="text-sm font-semibold ml-2">{(producer.rating ?? 0).toFixed(1)}</span>
                        </div>
                        <div className="flex space-x-2 w-full">
                          <Button
                            className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                            onClick={() => navigate(`/marketplace/producer/${producer.id}`)}
                          >
                            View Profile
                          </Button>
                          <ProducerFollowButton 
                            producerId={producer.id}
                            followMutation={followProducerMutation}
                            unfollowMutation={unfollowProducerMutation}
                          />
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => {
                              setShowCollaborationModal(true);
                            }}
                          >
                            <Handshake className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20">
                <CardContent className="p-12 text-center">
                  <Users className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-xl font-semibold mb-2">No Producers Yet</h3>
                  <p className="text-muted-foreground">Be the first producer on Max Booster Marketplace!</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="my-beats">
            {myBeatsLoading ? (
              <BeatGridSkeleton count={6} viewMode="grid" />
            ) : myBeats.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedBeats.size === myBeats.length && myBeats.length > 0}
                        onChange={toggleSelectAllBeats}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                      <span className="text-sm text-muted-foreground">
                        {selectedBeats.size > 0 ? `${selectedBeats.size} selected` : 'Select all'}
                      </span>
                    </label>
                  </div>
                  {selectedBeats.size > 0 && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setShowBulkEditUploaded(true);
                          setBulkEditUploadedValues({ genre: '', mood: '', tempo: 0, key: '', price: 0, licenseType: '', tags: '', discountAction: 'keep', discountPercent: 0, discountExpiresAt: '', coverArtFile: null });
                          if (bulkEditUploadedCoverPreviewUrl) revokeLocalPreview(bulkEditUploadedCoverPreviewUrl);
                          setBulkEditUploadedCoverPreviewUrl(null);
                          setBulkEditUploadedCoverServerUrl(null);
                          setBulkEditUploadedCoverUploading(false);
                        }}
                      >
                        <Edit className="w-3 h-3 mr-1" />
                        Bulk Edit ({selectedBeats.size})
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedBeats(new Set())}
                      >
                        Clear Selection
                      </Button>
                    </div>
                  )}
                </div>

                {showBulkEditUploaded && selectedBeats.size > 0 && (
                  <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-blue-700 dark:text-blue-400">Bulk Edit {selectedBeats.size} beats (leave blank to skip)</p>
                      <Button size="sm" variant="ghost" onClick={() => setShowBulkEditUploaded(false)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="flex items-start gap-4 mb-2">
                      <div className="flex-shrink-0">
                        <Label className="text-xs">Cover Art</Label>
                        {(bulkEditUploadedValues.coverArtFile || bulkEditUploadedCoverServerUrl) ? (
                          <div className="relative w-16 h-16 mt-1">
                            <SafeImg src={bulkEditUploadedCoverPreviewUrl || bulkEditUploadedCoverServerUrl || ''} alt="" className="w-16 h-16 rounded object-cover" loading="eager" />
                            {bulkEditUploadedCoverUploading && <div className="absolute inset-0 bg-black/50 rounded flex items-center justify-center"><Loader2 className="w-4 h-4 text-white animate-spin" /></div>}
                            <button className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs" onClick={() => {
                              if (bulkEditUploadedCoverPreviewUrl) revokeLocalPreview(bulkEditUploadedCoverPreviewUrl);
                              setBulkEditUploadedCoverPreviewUrl(null);
                              setBulkEditUploadedCoverServerUrl(null);
                              setBulkEditUploadedCoverUploading(false);
                              setBulkEditUploadedValues(prev => ({ ...prev, coverArtFile: null }));
                            }}>
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        ) : (
                          <label className="mt-1 w-16 h-16 border-2 border-dashed rounded flex flex-col items-center justify-center cursor-pointer hover:border-purple-400 transition-colors">
                            <input type="file" accept="image/jpeg,image/png" className="sr-only" onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              if (bulkEditUploadedCoverPreviewUrl) revokeLocalPreview(bulkEditUploadedCoverPreviewUrl);
                              const preview = createLocalPreview(f);
                              setBulkEditUploadedValues(prev => ({ ...prev, coverArtFile: f }));
                              setBulkEditUploadedCoverPreviewUrl(preview);
                              setBulkEditUploadedCoverServerUrl(null);
                              setBulkEditUploadedCoverUploading(true);
                              uploadImageFile(f, '/api/storage/upload', 'file')
                                .then(url => { setBulkEditUploadedCoverServerUrl(url); revokeLocalPreview(preview); setBulkEditUploadedCoverPreviewUrl(null); })
                                .catch(() => toast({ title: 'Cover Art Upload Failed', variant: 'destructive' }))
                                .finally(() => setBulkEditUploadedCoverUploading(false));
                            }} />
                            <ImageIcon className="w-4 h-4 text-muted-foreground" />
                            <span className="text-[9px] text-muted-foreground mt-0.5">Add</span>
                          </label>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <Label className="text-xs">Genre</Label>
                        <Select value={bulkEditUploadedValues.genre} onValueChange={(v) => setBulkEditUploadedValues(prev => ({ ...prev, genre: v }))}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                          <SelectContent>{BEAT_GENRES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Mood</Label>
                        <Select value={bulkEditUploadedValues.mood} onValueChange={(v) => setBulkEditUploadedValues(prev => ({ ...prev, mood: v }))}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                          <SelectContent>{BEAT_MOODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Key</Label>
                        <Select value={bulkEditUploadedValues.key} onValueChange={(v) => setBulkEditUploadedValues(prev => ({ ...prev, key: v }))}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                          <SelectContent>
                            {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">License</Label>
                        <Select value={bulkEditUploadedValues.licenseType} onValueChange={(v) => setBulkEditUploadedValues(prev => ({ ...prev, licenseType: v }))}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="basic">Basic</SelectItem>
                            <SelectItem value="premium">Premium</SelectItem>
                            <SelectItem value="unlimited">Unlimited</SelectItem>
                            <SelectItem value="exclusive">Exclusive</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">BPM</Label>
                        <Input type="number" value={bulkEditUploadedValues.tempo || ''} onChange={(e) => setBulkEditUploadedValues(prev => ({ ...prev, tempo: parseInt(e.target.value) || 0 }))} placeholder="BPM" className="h-8 text-xs" />
                      </div>
                      <div>
                        <Label className="text-xs">Price ($)</Label>
                        <Input type="number" value={bulkEditUploadedValues.price || ''} onChange={(e) => setBulkEditUploadedValues(prev => ({ ...prev, price: parseInt(e.target.value) || 0 }))} placeholder="Price" className="h-8 text-xs" />
                      </div>
                      <div>
                        <Label className="text-xs">Tags</Label>
                        <Input value={bulkEditUploadedValues.tags} onChange={(e) => setBulkEditUploadedValues(prev => ({ ...prev, tags: e.target.value }))} placeholder="tag1, tag2" className="h-8 text-xs" />
                      </div>
                    </div>
                    <div className="border-t pt-3 mt-2">
                      <div className="flex items-center gap-2 mb-2">
                        <Percent className="w-4 h-4 text-green-600" />
                        <Label className="text-xs font-medium">Discount</Label>
                      </div>
                      <div className="flex gap-2 flex-wrap mb-2">
                        {(['keep', 'apply', 'remove'] as const).map(action => (
                          <Button
                            key={action}
                            type="button"
                            size="sm"
                            variant={bulkEditUploadedValues.discountAction === action ? 'default' : 'outline'}
                            className="h-6 text-[10px] px-2"
                            onClick={() => setBulkEditUploadedValues(prev => ({ ...prev, discountAction: action }))}
                          >
                            {action === 'keep' ? 'Keep Existing' : action === 'apply' ? 'Set Discount' : 'Remove Discounts'}
                          </Button>
                        ))}
                      </div>
                      {bulkEditUploadedValues.discountAction === 'apply' && (
                        <>
                          <div className="flex gap-2 flex-wrap mb-2">
                            {[10, 15, 20, 25, 30, 40, 50].map(p => (
                              <Button
                                key={p}
                                type="button"
                                size="sm"
                                variant={bulkEditUploadedValues.discountPercent === p ? 'default' : 'outline'}
                                className="h-6 text-[10px] px-2"
                                onClick={() => setBulkEditUploadedValues(prev => ({ ...prev, discountPercent: p }))}
                              >
                                {p}%
                              </Button>
                            ))}
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-[10px]">Custom %</Label>
                              <Input type="number" value={bulkEditUploadedValues.discountPercent || ''} onChange={(e) => setBulkEditUploadedValues(prev => ({ ...prev, discountPercent: parseInt(e.target.value) || 0 }))} min={1} max={99} className="h-7 text-xs" />
                            </div>
                            <div>
                              <Label className="text-[10px]">Expires (optional)</Label>
                              <Input type="datetime-local" value={bulkEditUploadedValues.discountExpiresAt ? bulkEditUploadedValues.discountExpiresAt.slice(0, 16) : ''} onChange={(e) => setBulkEditUploadedValues(prev => ({ ...prev, discountExpiresAt: e.target.value ? new Date(e.target.value).toISOString() : '' }))} className="h-7 text-xs" />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button size="sm" variant="outline" onClick={() => setShowBulkEditUploaded(false)}>Cancel</Button>
                      <Button size="sm" onClick={applyBulkEditUploaded} className="bg-gradient-to-r from-blue-600 to-purple-600">
                        Apply to {selectedBeats.size} Beats
                      </Button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {myBeats.map((beat: Beat) => (
                    <Card key={beat.id} className={`group hover:shadow-xl transition-shadow duration-200 ${selectedBeats.has(beat.id) ? 'ring-2 ring-blue-500' : ''}`}>
                      <CardContent className="p-0">
                        <div className="relative aspect-square bg-gradient-to-br from-blue-500 to-purple-600 rounded-t-lg overflow-hidden">
                          <div className="absolute top-2 left-2 z-10">
                            <input
                              type="checkbox"
                              checked={selectedBeats.has(beat.id)}
                              onChange={() => toggleBeatSelection(beat.id)}
                              className="w-5 h-5 rounded border-2 border-white bg-black/30 cursor-pointer"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                          <div className="flex items-center justify-center h-full">
                            <Music className="w-16 h-16 text-white opacity-50" />
                          </div>
                          {beat.coverArt && (
                            <img
                              src={beat.coverArt}
                              alt={beat.title}
                              loading="lazy"
                              decoding="async"
                              className="absolute inset-0 w-full h-full object-cover opacity-0 transition-opacity duration-300"
                              onLoad={(e) => { (e.target as HTMLImageElement).style.opacity = '1'; }}
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          )}
                        </div>
                        <div className="p-4">
                          <h3 className="font-semibold text-lg mb-1">{beat.title}</h3>
                          <p className="text-sm text-muted-foreground mb-2">{beat.genre}{beat.mood ? ` \u2022 ${beat.mood}` : ''}</p>
                          <div className="flex items-center justify-between">
                            <div>
                              {beat.discountPercent && beat.discountPriceCents != null ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-lg font-bold text-green-600">${(beat.discountPriceCents / 100).toFixed(2)}</span>
                                  <span className="text-sm line-through text-muted-foreground">${beat.price}</span>
                                  <Badge variant="destructive" className="text-[10px] px-1 py-0">-{beat.discountPercent}%</Badge>
                                </div>
                              ) : (
                                <span className="text-lg font-bold">${beat.price}</span>
                              )}
                            </div>
                            <div className="flex space-x-1">
                              <Button size="sm" variant="outline" onClick={() => { setDiscountBeat(beat); setDiscountForm({ percent: beat.discountPercent || 10, expiresAt: beat.discountExpiresAt || '' }); }} title="Set discount">
                                <Percent className="w-4 h-4" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => handleEditBeat(beat)}>
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => handleDeleteBeat(beat.id)} className="hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/20">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ) : (
              <NoMyBeatsState
                onAction={(action) => {
                  if (action === 'upload') {
                    setShowUploadModal(true);
                  } else if (action === 'bulk_upload') {
                    setShowBulkUploadModal(true);
                  }
                }}
              />
            )}
          </TabsContent>

          <TabsContent value="my-store" className="space-y-6">
            <StorefrontBuilder />
          </TabsContent>

          <TabsContent value="purchases">
            {purchasesLoading ? (
              <PurchaseHistorySkeleton />
            ) : purchases.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold">My Purchases ({purchases.length})</h2>
                  <Badge variant="outline">{purchases.filter((p: Purchase) => p.status === 'completed').length} completed</Badge>
                </div>
                {purchases.map((purchase: Purchase) => {
                  const licenseLabels: Record<string, string> = {
                    basic: 'Basic Lease',
                    premium: 'Premium Lease',
                    unlimited: 'Unlimited Lease',
                    exclusive: 'Exclusive Rights',
                  };
                  const licenseName = purchase.licenseSnapshot?.label || licenseLabels[purchase.licenseType] || purchase.licenseType;
                  const snapshot = purchase.licenseSnapshot as any;
                  const fileFormats = snapshot?.fileFormats?.map((f: string) => f.toUpperCase()) || ['MP3'];
                  
                  return (
                  <Card key={purchase.id} className="overflow-hidden">
                    <CardContent className="p-0">
                      <div className="flex flex-col md:flex-row">
                        <div className="w-full md:w-32 h-32 md:h-auto flex-shrink-0">
                          {purchase.beatArtworkUrl ? (
                            <img src={purchase.beatArtworkUrl} alt={purchase.beatTitle || ''} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                              <Music className="w-10 h-10 text-white" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 p-5">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h3 className="font-bold text-lg">{purchase.beatTitle || `Beat #${purchase.listingId?.slice(0, 8)}`}</h3>
                              <p className="text-sm text-muted-foreground">
                                by {purchase.sellerName || purchase.sellerUsername || 'Producer'}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-bold">${(purchase.amount || 0).toFixed(2)}</p>
                              <Badge
                                variant={purchase.status === 'completed' ? 'default' : purchase.status === 'refunded' ? 'destructive' : 'secondary'}
                                className={purchase.status === 'completed' ? 'bg-green-600' : ''}
                              >
                                {purchase.status}
                              </Badge>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 mb-3 flex-wrap">
                            <Badge variant="outline" className="capitalize">
                              <FileText className="w-3 h-3 mr-1" />
                              {licenseName}
                            </Badge>
                            {fileFormats.map((fmt: string) => (
                              <Badge key={fmt} variant="secondary" className="text-xs">{fmt}</Badge>
                            ))}
                            {snapshot?.bogoEnabled && (
                              <Badge className="bg-orange-500 text-xs">BOGO</Badge>
                            )}
                          </div>

                          <p className="text-xs text-muted-foreground mb-3">
                            Purchased on {new Date(purchase.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                          </p>

                          {purchase.status === 'completed' && (
                            <div className="flex items-center gap-2 flex-wrap">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                  try {
                                    const res = await apiRequest('GET', `/api/marketplace/purchases/${purchase.id}/license-agreement?format=download`);
                                    const blob = await res.blob();
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `license-agreement-${purchase.id}.txt`;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                  } catch {
                                    toast({ title: 'Error', description: 'Failed to download license', variant: 'destructive' });
                                  }
                                }}
                              >
                                <FileText className="w-4 h-4 mr-1" />
                                License Agreement
                              </Button>
                              {purchase.beatAudioUrl && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    const a = document.createElement('a');
                                    a.href = purchase.beatAudioUrl!;
                                    a.download = `${purchase.beatTitle || 'beat'}.mp3`;
                                    a.click();
                                  }}
                                >
                                  <Download className="w-4 h-4 mr-1" />
                                  Download Beat
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={async () => {
                                  try {
                                    const res = await apiRequest('GET', `/api/marketplace/purchases/${purchase.id}/license-agreement`);
                                    const data = await res.json();
                                    setLicenseViewerContent(data.agreement);
                                    setShowLicenseViewer(true);
                                  } catch {
                                    toast({ title: 'Error', description: 'Failed to load license', variant: 'destructive' });
                                  }
                                }}
                              >
                                <Eye className="w-4 h-4 mr-1" />
                                View License
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  );
                })}
              </div>
            ) : (
              <NoPurchasesState
                onAction={(action) => {
                  if (action === 'browse') {
                    setActiveTab('browse');
                  }
                }}
              />
            )}

            {showLicenseViewer && licenseViewerContent && (
              <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowLicenseViewer(false)}>
                <Card className="max-w-3xl w-full max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>License Agreement</CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => setShowLicenseViewer(false)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[60vh]">
                      <pre className="whitespace-pre-wrap font-mono text-sm p-4 bg-muted rounded-lg">{licenseViewerContent}</pre>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="sales" className="space-y-6">
            <StatCardRow>
              <StatCard
                title="Total Revenue"
                value={salesAnalytics?.totalRevenue || 0}
                change={parseFloat(String(salesAnalytics?.revenueChangePercent || 0))}
                trend={(salesAnalytics?.revenueChangePercent ?? 0) > 0 ? 'up' : 'neutral'}
                prefix="$"
                sparklineData={salesAnalytics?.weeklyData?.map((w: { revenue: number }) => w.revenue) ?? []}
                icon={<DollarSign className="h-5 w-5" />}
              />
              <StatCard
                title="Total Sales"
                value={salesAnalytics?.totalSales || 0}
                change={parseFloat(String(salesAnalytics?.salesChangePercent || 0))}
                trend={(salesAnalytics?.salesChangePercent ?? 0) > 0 ? 'up' : 'neutral'}
                sparklineData={salesAnalytics?.weeklyData?.map((w: { sales: number }) => w.sales) ?? []}
                icon={<ShoppingCart className="h-5 w-5" />}
              />
              <StatCard
                title="Avg. Sale Price"
                value={salesAnalytics?.avgSalePrice || 0}
                change={0}
                trend="neutral"
                prefix="$"
                sparklineData={[]}
                icon={<Target className="h-5 w-5" />}
              />
              <StatCard
                title="Conversion Rate"
                value={salesAnalytics?.conversionRate || 0}
                change={0}
                trend="neutral"
                suffix="%"
                sparklineData={[]}
                icon={<TrendingUp className="h-5 w-5" />}
              />
            </StatCardRow>

            <ChartCard
              title="Revenue Performance"
              subtitle="Weekly earnings over the last 30 days"
            >
              {salesAnalytics?.weeklyData && salesAnalytics.weeklyData.length > 0 ? (
                <SimpleAreaChart
                  data={salesAnalytics.weeklyData.map((w: { week: string; revenue: number }) => ({
                    label: w.week,
                    value: w.revenue,
                  }))}
                  height={200}
                />
              ) : (
                <div className="h-48 flex items-center justify-center text-slate-500">
                  <div className="text-center">
                    <BarChart3 className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                    <p className="text-sm">No sales data yet</p>
                  </div>
                </div>
              )}
            </ChartCard>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Trophy className="w-5 h-5 mr-2" />
                    Top Selling Beats
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {(salesAnalytics?.topBeats?.length ?? 0) > 0 ? (
                      salesAnalytics?.topBeats?.map((beat: { title: string; sales: number; revenue: number }, index: number) => (
                        <div key={index} className="flex items-center justify-between p-3 rounded-lg border">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 rounded bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                              <span className="text-white font-bold text-sm">{index + 1}</span>
                            </div>
                            <div>
                              <p className="font-medium">{beat.title}</p>
                              <p className="text-xs text-gray-500">{beat.sales} sales</p>
                            </div>
                          </div>
                          <p className="text-sm font-semibold text-green-600">${beat.revenue?.toFixed(2)}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-center text-gray-500 py-4">No sales data yet</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <PieChart className="w-5 h-5 mr-2" />
                    License Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {['basic', 'premium', 'unlimited', 'exclusive'].map((license) => (
                      <div key={license}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="capitalize">{license}</span>
                          <span className="font-semibold">
                            {salesAnalytics?.licenseDistribution?.[license]?.toFixed(0) || 0}%
                          </span>
                        </div>
                        <Progress value={salesAnalytics?.licenseDistribution?.[license] || 0} className="h-2" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <PayoutDashboard />
          </TabsContent>

          <TabsContent value="escrow" className="space-y-6">
            <Card className="border-green-200 bg-green-50 dark:bg-green-900/20">
              <CardContent className="p-6">
                <div className="flex items-start space-x-4">
                  <div className="w-12 h-12 bg-green-100 dark:bg-green-800 rounded-full flex items-center justify-center">
                    <Shield className="w-6 h-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-green-900 dark:text-green-100">Escrow Protection</h3>
                    <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                      All transactions are protected with escrow. Funds are held securely until both parties confirm the transaction.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCard
                title="Held in Escrow"
                value={escrowTransactions.filter(t => t.status === 'held').reduce((sum, t) => sum + t.amount, 0)}
                change={0}
                trend="neutral"
                prefix="$"
                sparklineData={[]}
                icon={<Wallet className="h-5 w-5" />}
              />
              <StatCard
                title="Released This Month"
                value={escrowTransactions.filter(t => t.status === 'released').reduce((sum, t) => sum + t.amount, 0)}
                change={0}
                trend="up"
                prefix="$"
                sparklineData={[]}
                icon={<Banknote className="h-5 w-5" />}
              />
              <StatCard
                title="Active Transactions"
                value={escrowTransactions.filter(t => t.status === 'held').length}
                change={0}
                trend="neutral"
                sparklineData={[]}
                icon={<Activity className="h-5 w-5" />}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Escrow Transactions</CardTitle>
              </CardHeader>
              <CardContent>
                {escrowTransactions.length > 0 ? (
                  <div className="space-y-4">
                    {escrowTransactions.map((transaction) => (
                      <div key={transaction.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center space-x-4">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            transaction.status === 'held' ? 'bg-yellow-100 text-yellow-600' :
                            transaction.status === 'released' ? 'bg-green-100 text-green-600' :
                            transaction.status === 'disputed' ? 'bg-red-100 text-red-600' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {transaction.status === 'held' ? <Clock className="w-5 h-5" /> :
                             transaction.status === 'released' ? <CheckCircle className="w-5 h-5" /> :
                             transaction.status === 'disputed' ? <AlertCircle className="w-5 h-5" /> :
                             <Shield className="w-5 h-5" />}
                          </div>
                          <div>
                            <p className="font-medium">{transaction.beatTitle}</p>
                            <p className="text-sm text-muted-foreground">
                              {transaction.buyerName} → {transaction.sellerName}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          <div className="text-right">
                            <p className="font-semibold">${(transaction.amount ?? 0).toFixed(2)}</p>
                            <Badge variant={
                              transaction.status === 'held' ? 'secondary' :
                              transaction.status === 'released' ? 'default' :
                              'destructive'
                            }>
                              {transaction.status}
                            </Badge>
                          </div>
                          {transaction.status === 'held' && (
                            <Button
                              size="sm"
                              onClick={() => releaseEscrowMutation.mutate(transaction.id)}
                              disabled={releaseEscrowMutation.isPending}
                            >
                              Release Funds
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <NoEscrowTransactionsState />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="licenses" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold">License Templates</h2>
                <p className="text-muted-foreground">Manage your license automation and pricing</p>
              </div>
              <Button onClick={() => setShowLicenseModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Custom License
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {activeLicenseTemplates.map((license) => (
                <Card key={license.id} className={`relative ${license.type === 'exclusive' ? 'border-2 border-purple-500' : ''}`}>
                  {license.type === 'exclusive' && (
                    <Badge className="absolute -top-2 -right-2 bg-purple-500">Most Popular</Badge>
                  )}
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>{license.name}</span>
                      <Badge variant={license.isActive ? 'default' : 'secondary'}>
                        {license.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="text-3xl font-bold text-center">${license.price}</div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Streams</span>
                        <span className="font-medium">{license.streams === 'unlimited' ? '∞' : (typeof license.streams === 'number' ? license.streams : parseInt(String(license.streams)) || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Copies</span>
                        <span className="font-medium">{license.copies === 'unlimited' ? '∞' : (typeof license.copies === 'number' ? license.copies : parseInt(String(license.copies)) || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Music Videos</span>
                        <span className="font-medium">{license.musicVideos === 'unlimited' ? '∞' : license.musicVideos}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Duration</span>
                        <span className="font-medium">{license.duration}</span>
                      </div>
                    </div>
                    {(license as any).fileFormats && (
                      <div className="flex justify-between">
                        <span>File Formats</span>
                        <span className="font-medium text-xs">{(license as any).fileFormats}</span>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1 pt-2 border-t">
                      {license.allowsBroadcast && <Badge variant="outline" className="text-xs">Broadcast</Badge>}
                      {license.allowsProfit && <Badge variant="outline" className="text-xs">For Profit</Badge>}
                      {license.allowsSync && <Badge variant="outline" className="text-xs">Sync</Badge>}
                    </div>
                    <Button variant="outline" className="w-full" onClick={() => openEditLicense(license)}>
                      <Edit className="w-4 h-4 mr-2" />
                      Edit License
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="affiliates" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold">Affiliate Program</h2>
                <p className="text-muted-foreground">Manage your affiliate partners and payouts</p>
              </div>
              <Button onClick={() => setShowAffiliateModal(true)}>
                <UserPlus className="w-4 h-4 mr-2" />
                Add Affiliate
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <StatCard
                title="Total Affiliates"
                value={affiliates.length}
                change={0}
                trend="neutral"
                sparklineData={[]}
                icon={<Users className="h-5 w-5" />}
              />
              <StatCard
                title="Total Referrals"
                value={affiliates.reduce((sum, a) => sum + (a.referralCount ?? 0), 0)}
                change={0}
                trend="up"
                sparklineData={[]}
                icon={<Link2 className="h-5 w-5" />}
              />
              <StatCard
                title="Total Payouts"
                value={affiliates.reduce((sum, a) => sum + (a.totalEarnings ?? 0), 0)}
                change={0}
                trend="neutral"
                prefix="$"
                sparklineData={[]}
                icon={<DollarSign className="h-5 w-5" />}
              />
              <StatCard
                title="Avg. Conversion"
                value={affiliates.length > 0 ? (affiliates.reduce((sum, a) => sum + (a.conversionRate ?? 0), 0) / affiliates.length).toFixed(1) : 0}
                change={0}
                trend="neutral"
                suffix="%"
                sparklineData={[]}
                icon={<Percent className="h-5 w-5" />}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Affiliate Partners</CardTitle>
              </CardHeader>
              <CardContent>
                {affiliates.length > 0 ? (
                  <div className="space-y-4">
                    {affiliates.map((affiliate) => (
                      <div key={affiliate.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center space-x-4">
                          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                            {affiliate.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium">{affiliate.name}</p>
                            <p className="text-sm text-muted-foreground">{affiliate.email}</p>
                            <div className="flex items-center space-x-2 mt-1">
                              <Badge variant="outline" className="text-xs">
                                Code: {affiliate.affiliateCode}
                              </Badge>
                              <Badge variant={affiliate.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                                {affiliate.status}
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-8 text-center">
                          <div>
                            <p className="text-sm text-muted-foreground">Commission</p>
                            <p className="font-semibold">{affiliate.commissionRate}%</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Referrals</p>
                            <p className="font-semibold">{affiliate.referralCount}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Earnings</p>
                            <p className="font-semibold text-green-600">${(affiliate.totalEarnings ?? 0).toFixed(2)}</p>
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <Button size="sm" variant="outline">
                            <Receipt className="w-4 h-4 mr-1" />
                            Payout
                          </Button>
                          <Button size="sm" variant="outline">
                            <Edit className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No affiliates yet</p>
                    <Button className="mt-4" onClick={() => setShowAffiliateModal(true)}>
                      Add Your First Affiliate
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contracts" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold">Contract Templates</h2>
                <p className="text-muted-foreground">Build and manage your license contracts</p>
              </div>
              <Button onClick={() => setShowContractModal(true)}>
                <FileSignature className="w-4 h-4 mr-2" />
                Create Contract
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {contractTemplates.length > 0 ? (
                contractTemplates.map((contract) => (
                  <Card key={contract.id}>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <div className="flex items-center">
                          <ScrollText className="w-5 h-5 mr-2" />
                          {contract.name}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedContract(contract);
                            setShowDeleteContract(true);
                          }}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-4">{contract.description}</p>
                      <Badge variant="outline">{contract.category.replace('_', ' ')}</Badge>
                      <div className="flex space-x-2 mt-4">
                        <Button size="sm" variant="outline" className="flex-1">
                          <Eye className="w-4 h-4 mr-1" />
                          Preview
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => {
                            setSelectedContract(contract);
                            setEditContractForm({
                              name: contract.name,
                              description: contract.description || '',
                              content: contract.content || '',
                              category: contract.category || 'custom',
                            });
                            setShowEditContract(true);
                          }}
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          Edit
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="col-span-full">
                  <NoContractsState
                    onAction={(action) => {
                      if (action === 'create_contract') {
                        setShowContractModal(true);
                      }
                    }}
                  />
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="collaborations" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold">Collaboration Offers</h2>
                <p className="text-muted-foreground">Manage collaboration requests and offers</p>
              </div>
              <Button onClick={() => setShowCollaborationModal(true)}>
                <Handshake className="w-4 h-4 mr-2" />
                New Offer
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCard
                title="Pending Offers"
                value={collaborations.filter(c => c.status === 'pending').length}
                change={0}
                trend="neutral"
                sparklineData={[]}
                icon={<Clock className="h-5 w-5" />}
              />
              <StatCard
                title="Active Collaborations"
                value={collaborations.filter(c => c.status === 'accepted').length}
                change={0}
                trend="up"
                sparklineData={[]}
                icon={<Handshake className="h-5 w-5" />}
              />
              <StatCard
                title="Completed"
                value={collaborations.filter(c => c.status === 'completed').length}
                change={0}
                trend="neutral"
                sparklineData={[]}
                icon={<CheckCircle className="h-5 w-5" />}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Recent Offers</CardTitle>
              </CardHeader>
              <CardContent>
                {collaborations.length > 0 ? (
                  <div className="space-y-4">
                    {collaborations.map((collab) => (
                      <div key={collab.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center space-x-4">
                          <div className="flex -space-x-2">
                            <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold border-2 border-white">
                              {collab.fromUser.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center text-white font-bold border-2 border-white">
                              {collab.toUser.name.substring(0, 2).toUpperCase()}
                            </div>
                          </div>
                          <div>
                            <p className="font-medium">
                              {collab.fromUser.name} → {collab.toUser.name}
                            </p>
                            <p className="text-sm text-muted-foreground capitalize">{collab.type.replace('_', ' ')}</p>
                            {collab.beatTitle && (
                              <p className="text-xs text-muted-foreground">Beat: {collab.beatTitle}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          <div className="text-right">
                            <p className="font-semibold">{collab.splitPercentage}% Split</p>
                            {collab.budget && <p className="text-sm text-green-600">${collab.budget} budget</p>}
                          </div>
                          <Badge variant={
                            collab.status === 'pending' ? 'secondary' :
                            collab.status === 'accepted' ? 'default' :
                            collab.status === 'completed' ? 'outline' :
                            'destructive'
                          }>
                            {collab.status}
                          </Badge>
                          <div className="flex space-x-1">
                            {collab.status === 'pending' && (
                              <>
                                <Button size="sm" variant="default">Accept</Button>
                                <Button size="sm" variant="outline">Decline</Button>
                              </>
                            )}
                            <Button size="sm" variant="outline">
                              <MessageCircle className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <NoCollaborationsState
                    onAction={(action) => {
                      if (action === 'find_collaborators') {
                        setShowCollaborationModal(true);
                      }
                    }}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="merch" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Merch Store</h2>
                <p className="text-muted-foreground text-sm">Manage your physical and digital merchandise.</p>
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button className="bg-gradient-to-r from-blue-600 to-purple-600">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Product
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[600px]">
                  <DialogHeader>
                    <DialogTitle>Add New Product</DialogTitle>
                    <DialogDescription>
                      Enter the details for your new merchandise item.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    const data = Object.fromEntries(formData.entries());
                    addItemMutation.mutate({
                      ...data,
                      price: parseFloat(data.price as string),
                      inventory: parseInt(data.inventory as string) || 0,
                      isActive: true,
                    });
                  }} className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Product Name</Label>
                        <Input id="name" name="name" required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="category">Category</Label>
                        <Select name="category" defaultValue="clothing">
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="clothing">Clothing</SelectItem>
                            <SelectItem value="accessories">Accessories</SelectItem>
                            <SelectItem value="music">Music (Physical)</SelectItem>
                            <SelectItem value="digital">Digital Download</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea id="description" name="description" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="price">Price ($)</Label>
                        <Input id="price" name="price" type="number" step="0.01" required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="inventory">Inventory</Label>
                        <Input id="inventory" name="inventory" type="number" defaultValue="0" />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={addItemMutation.isPending}>
                        {addItemMutation.isPending ? 'Adding...' : 'Add Product'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">${merchStats?.totalRevenue?.toFixed(2) || '0.00'}</div>
                  <p className="text-xs text-muted-foreground">Lifetime earnings</p>
                </CardContent>
              </Card>
              <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Orders (Month)</CardTitle>
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{merchStats?.ordersThisMonth || 0}</div>
                  <p className="text-xs text-muted-foreground">Orders this month</p>
                </CardContent>
              </Card>
              <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{merchStats?.totalOrders || 0}</div>
                  <p className="text-xs text-muted-foreground">All time orders</p>
                </CardContent>
              </Card>
              <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Low Stock</CardTitle>
                  <AlertCircle className="h-4 w-4 text-destructive" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{merchStats?.inventoryAlerts || 0}</div>
                  <p className="text-xs text-muted-foreground">Items needing restock</p>
                </CardContent>
              </Card>
            </div>

            <Tabs defaultValue="products" className="w-full">
              <TabsList className="bg-gray-100 dark:bg-gray-900 border-gray-200 dark:border-gray-700">
                <TabsTrigger value="products">Products</TabsTrigger>
                <TabsTrigger value="orders">Orders</TabsTrigger>
              </TabsList>
              <TabsContent value="products" className="pt-4">
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {merchLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <Card key={i} className="animate-pulse bg-white dark:bg-gray-800">
                        <CardContent className="h-48" />
                      </Card>
                    ))
                  ) : merchItems?.length === 0 ? (
                    <div className="col-span-full flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-lg bg-muted/10">
                      <Package className="h-12 w-12 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold">No products found</h3>
                      <p className="text-muted-foreground text-sm">Add your first product to get started.</p>
                    </div>
                  ) : (
                    merchItems?.map((item: any) => (
                      <Card key={item.id} className="overflow-hidden bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow">
                        <div className="aspect-square bg-muted relative">
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.name} className="object-cover w-full h-full" />
                          ) : (
                            <div className="flex items-center justify-center h-full">
                              <Package className="h-12 w-12 text-muted-foreground/20" />
                            </div>
                          )}
                          <div className="absolute top-2 right-2">
                            <Badge variant={item.isActive ? "default" : "secondary"}>
                              {item.isActive ? "Active" : "Draft"}
                            </Badge>
                          </div>
                        </div>
                        <CardHeader className="p-4 pb-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <CardTitle className="text-base truncate max-w-[150px]">{item.name}</CardTitle>
                              <p className="text-xs text-muted-foreground capitalize">{item.category}</p>
                            </div>
                            <div className="font-bold text-blue-600">${parseFloat(item.price).toFixed(2)}</div>
                          </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-0 space-y-3">
                          <div className="flex justify-between items-center text-xs">
                            <span>Stock: {item.isDigital ? '∞ (Digital)' : item.inventory}</span>
                            <span>Sold: {item.soldCount || 0}</span>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="flex-1 text-xs">
                              <Edit className="h-3 w-3 mr-1" />
                              Edit
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-destructive hover:text-destructive text-xs"
                              onClick={() => setPendingDeleteProductId(item.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </TabsContent>
              <TabsContent value="orders" className="pt-4">
                <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-lg">Recent Orders</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Order ID</TableHead>
                          <TableHead>Buyer</TableHead>
                          <TableHead>Total</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ordersLoading ? (
                          Array.from({ length: 3 }).map((_, i) => (
                            <TableRow key={i} className="animate-pulse">
                              <TableCell colSpan={5} className="h-12" />
                            </TableRow>
                          ))
                        ) : merchOrders?.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-12 text-muted-foreground text-sm">
                              No orders yet.
                            </TableCell>
                          </TableRow>
                        ) : (
                          merchOrders?.map((order: any) => (
                            <TableRow key={order.id}>
                              <TableCell className="font-mono text-xs">
                                {order.id.split('-')[0]}
                              </TableCell>
                              <TableCell>
                                <div className="text-sm font-medium">{order.buyerName}</div>
                                <div className="text-[10px] text-muted-foreground">{order.buyerEmail}</div>
                              </TableCell>
                              <TableCell className="text-sm font-medium">
                                ${parseFloat(order.total).toFixed(2)}
                              </TableCell>
                              <TableCell>
                                <Badge variant={
                                  order.status === 'delivered' ? 'default' :
                                  order.status === 'shipped' ? 'secondary' :
                                  'outline'
                                } className="text-[10px] capitalize">
                                  {order.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button variant="ghost" size="sm" className="text-xs">
                                  Details
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      </div>

      {showPreviewPlayer && currentBeat && (
        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t shadow-lg p-4 z-50">
          <div className="max-w-7xl mx-auto flex items-center space-x-4">
            <div className="relative w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg overflow-hidden flex-shrink-0">
              <div className="flex items-center justify-center h-full">
                <Music className="w-8 h-8 text-white" />
              </div>
              {currentBeat.coverArt && (
                <img
                  src={currentBeat.coverArt}
                  alt={currentBeat.title}
                  loading="eager"
                  decoding="async"
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
            </div>
            <div className="flex-shrink-0 w-48">
              <p className="font-semibold truncate">{currentBeat.title}</p>
              <p className="text-sm text-muted-foreground truncate">{currentBeat.producer}</p>
            </div>
            <div className="flex items-center space-x-2">
              <Button size="icon" variant="ghost">
                <SkipBack className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                className="bg-gradient-to-r from-blue-600 to-purple-600"
                onClick={() => handlePlayPause(currentBeat.id)}
                disabled={isLoadingAudio}
              >
                {isLoadingAudio ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <Play className="w-5 h-5" />
                )}
              </Button>
              <Button size="icon" variant="ghost">
                <SkipForward className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex-1 flex items-center space-x-3">
              <span className="text-sm w-12 text-right">{formatTime(currentTime)}</span>
              <Slider
                value={[currentTime]}
                max={duration || 100}
                step={1}
                onValueChange={handleSeek}
                className="flex-1"
              />
              <span className="text-sm w-12">{formatTime(duration)}</span>
            </div>
            <div className="flex items-center space-x-2 w-32">
              <Button size="icon" variant="ghost" onClick={toggleMute}>
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </Button>
              <Slider
                value={[isMuted ? 0 : volume]}
                max={100}
                step={1}
                onValueChange={handleVolumeChange}
                className="w-20"
              />
            </div>
            <Button size="icon" variant="ghost" onClick={() => setShowPreviewPlayer(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={showUploadModal} onOpenChange={(open) => { if (!open && isPickingFileRef.current) return; setShowUploadModal(open); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()} onFocusOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Upload Your Beat</DialogTitle>
            <DialogDescription>Fill in the details below to upload your beat to the marketplace</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">Beat Title *</Label>
                <Input
                  id="title"
                  value={uploadForm.title}
                  onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                  placeholder="Enter beat title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="genre">Genre *</Label>
                <Select value={uploadForm.genre} onValueChange={(value) => setUploadForm({ ...uploadForm, genre: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select genre" />
                  </SelectTrigger>
                  <SelectContent>
                    {BEAT_GENRES.map((genre) => (
                      <SelectItem key={genre} value={genre}>{genre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="mood">Mood *</Label>
                <Select value={uploadForm.mood} onValueChange={(value) => setUploadForm({ ...uploadForm, mood: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select mood" />
                  </SelectTrigger>
                  <SelectContent>
                    {BEAT_MOODS.map((mood) => (
                      <SelectItem key={mood} value={mood}>{mood}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tempo">Tempo (BPM) *</Label>
                <Input
                  id="tempo"
                  type="number"
                  value={uploadForm.tempo}
                  onChange={(e) => setUploadForm({ ...uploadForm, tempo: parseInt(e.target.value) })}
                  min="60"
                  max="200"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="key">Key *</Label>
                <Select value={uploadForm.key} onValueChange={(value) => setUploadForm({ ...uploadForm, key: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select key" />
                  </SelectTrigger>
                  <SelectContent>
                    {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map((key) => (
                      <SelectItem key={key} value={key}>{key}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="price">Price (USD) *</Label>
                <Input
                  id="price"
                  type="number"
                  value={uploadForm.price}
                  onChange={(e) => setUploadForm({ ...uploadForm, price: parseInt(e.target.value) })}
                  min="1"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="licenseType">License Type *</Label>
              <Select value={uploadForm.licenseType} onValueChange={(value) => setUploadForm({ ...uploadForm, licenseType: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select license type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Basic License</SelectItem>
                  <SelectItem value="premium">Premium License</SelectItem>
                  <SelectItem value="unlimited">Unlimited License</SelectItem>
                  <SelectItem value="exclusive">Exclusive Rights</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={uploadForm.description}
                onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
                placeholder="Describe your beat..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input
                id="tags"
                value={uploadForm.tags}
                onChange={(e) => setUploadForm({ ...uploadForm, tags: e.target.value })}
                placeholder="e.g., dark, trap, heavy bass"
              />
            </div>
            <div className="space-y-2">
              <Label>Audio File (MP3, WAV, FLAC, AAC, OGG, M4A, AIFF) * <span className="text-xs text-muted-foreground">Max {MAX_AUDIO_SIZE_MB}MB</span></Label>
              {audioFile ? (
                <div
                  className="border-2 border-dashed rounded-lg p-6 text-center border-green-500 bg-green-50 dark:bg-green-950"
                  onDragOver={handleAudioDragOver}
                  onDragLeave={handleAudioDragLeave}
                  onDrop={handleAudioDrop}
                >
                  <div className="space-y-2">
                    <FileAudio className="w-10 h-10 mx-auto text-green-500" />
                    <p className="font-medium text-green-700 dark:text-green-400">{audioFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(audioFile.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAudioFile(null);
                        if (audioPreviewUrl) {
                          URL.revokeObjectURL(audioPreviewUrl);
                          setAudioPreviewUrl(null);
                        }
                      }}
                    >
                      <X className="w-4 h-4 mr-1" /> Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <label
                  htmlFor="audio-upload"
                  className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer block ${
                    isDraggingAudio 
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' 
                      : fileValidationError 
                        ? 'border-red-500 bg-red-50 dark:bg-red-950'
                        : 'border-gray-300 hover:border-gray-400'
                  }`}
                  onDragOver={handleAudioDragOver}
                  onDragLeave={handleAudioDragLeave}
                  onDrop={handleAudioDrop}
                >
                  <input
                    id="audio-upload"
                    type="file"
                    accept="audio/*,.mp3,.wav,.flac,.aac,.ogg,.m4a,.aiff,.aif,.webm"
                    onClick={() => { isPickingFileRef.current = true; }}
                    onChange={(e) => {
                      setTimeout(() => { isPickingFileRef.current = false; }, 1500);
                      e.target.files?.[0] && handleAudioFileSelect(e.target.files[0]);
                    }}
                    className="sr-only"
                  />
                  <UploadCloud className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
                  <p className="font-medium">Tap to select audio file</p>
                  <p className="text-sm text-muted-foreground">or drag & drop on desktop</p>
                </label>
              )}
              {fileValidationError && (
                <p className="text-sm text-red-500">{fileValidationError}</p>
              )}
              {audioPreviewUrl && (
                <div className="flex items-center space-x-2 p-2 bg-muted rounded-lg">
                  <Play className="w-4 h-4 text-muted-foreground" />
                  <audio
                    ref={audioPreviewRef}
                    src={audioPreviewUrl}
                    controls
                    className="flex-1 h-8"
                    preload="metadata"
                  />
                </div>
              )}
              {isAnalyzingAudio && (
                <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/50 dark:to-purple-950/50 border border-blue-200 dark:border-blue-800 rounded-lg animate-pulse">
                  <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                  <div>
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-300">AI is analyzing your beat...</p>
                    <p className="text-xs text-blue-500 dark:text-blue-400">Detecting BPM, key, genre, mood & tags</p>
                  </div>
                </div>
              )}
              {aiSuggestion && !isAnalyzingAudio && (
                <div className="p-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/50 dark:to-emerald-950/50 border border-green-200 dark:border-green-800 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-green-600 dark:text-green-400" />
                    <span className="text-sm font-medium text-green-700 dark:text-green-300">AI Auto-filled Metadata</span>
                    <span className="text-xs text-green-500 ml-auto">{Math.round(aiSuggestion.confidence * 100)}% confidence</span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900 rounded-full text-green-700 dark:text-green-300">{aiSuggestion.bpm} BPM</span>
                    <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900 rounded-full text-green-700 dark:text-green-300">Key: {aiSuggestion.key}</span>
                    <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900 rounded-full text-green-700 dark:text-green-300">{aiSuggestion.genre}</span>
                    <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900 rounded-full text-green-700 dark:text-green-300">{aiSuggestion.mood}</span>
                    <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900 rounded-full text-blue-700 dark:text-blue-300">Energy: {Math.round(aiSuggestion.energy * 100)}%</span>
                    <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900 rounded-full text-blue-700 dark:text-blue-300">Dance: {Math.round(aiSuggestion.danceability * 100)}%</span>
                  </div>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1.5">Fields auto-filled below. You can adjust any value.</p>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Cover Art (JPG/PNG) <span className="text-xs text-muted-foreground">Max {MAX_COVER_SIZE_MB}MB - Recommended 3000x3000</span></Label>
              {coverArtFile ? (
                <div className="border-2 border-dashed rounded-lg p-4 text-center border-purple-500 bg-purple-50 dark:bg-purple-950">
                  <div className="flex items-center gap-4">
                    <div className="w-24 h-24 rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-700 flex-shrink-0 relative">
                      <SafeImg
                        src={coverArtServerUrl || coverArtPreviewUrl || ''}
                        alt="Cover art preview"
                        className="w-full h-full object-cover"
                        loading="eager"
                      />
                      {coverArtUploading && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
                          <Loader2 className="w-6 h-6 text-white animate-spin" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 text-left space-y-1">
                      <p className="font-medium text-purple-700 dark:text-purple-400 truncate">{coverArtFile.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {(coverArtFile.size / (1024 * 1024)).toFixed(2)} MB
                        {coverArtUploading && <span className="ml-2 text-blue-500">Uploading…</span>}
                        {coverArtServerUrl && !coverArtUploading && <span className="ml-2 text-green-500">✓ Uploaded</span>}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (coverArtPreviewUrl) revokeLocalPreview(coverArtPreviewUrl);
                          setCoverArtFile(null);
                          setCoverArtPreviewUrl(null);
                          setCoverArtServerUrl(null);
                          setCoverArtUploading(false);
                        }}
                      >
                        <X className="w-4 h-4 mr-1" /> Remove
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <label
                  htmlFor="cover-art-upload"
                  className="border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer block border-gray-300 hover:border-purple-400 hover:bg-purple-50/50 dark:hover:bg-purple-950/30"
                  onDragOver={(e) => { e.preventDefault(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files[0];
                    if (file) handleCoverFileSelect(file);
                  }}
                >
                  <input
                    id="cover-art-upload"
                    type="file"
                    accept="image/jpeg,image/png,image/jpg"
                    onClick={() => { isPickingFileRef.current = true; }}
                    onChange={(e) => {
                      setTimeout(() => { isPickingFileRef.current = false; }, 1500);
                      e.target.files?.[0] && handleCoverFileSelect(e.target.files[0]);
                    }}
                    className="sr-only"
                  />
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                      <ImageIcon className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-sm">Tap to select cover art</p>
                      <p className="text-xs text-muted-foreground">or drag & drop on desktop</p>
                      <p className="text-xs text-muted-foreground mt-1">Square image recommended (3000x3000px)</p>
                    </div>
                  </div>
                </label>
              )}
            </div>
          </div>
          {uploadBeatMutation.isPending && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Uploading...</span>
                <span>{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetUploadForm(); setShowUploadModal(false); }} disabled={uploadBeatMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!uploadForm.title || !uploadForm.genre || !audioFile) {
                  toast({
                    title: 'Missing Information',
                    description: 'Please fill in all required fields and upload an audio file',
                    variant: 'destructive',
                  });
                  return;
                }
                setUploadProgress(0);
                const formData = new FormData();
                formData.append('title', uploadForm.title);
                formData.append('genre', uploadForm.genre);
                formData.append('mood', uploadForm.mood);
                formData.append('tempo', uploadForm.tempo.toString());
                formData.append('key', uploadForm.key);
                formData.append('price', uploadForm.price.toString());
                formData.append('licenseType', uploadForm.licenseType);
                formData.append('description', uploadForm.description);
                formData.append('tags', uploadForm.tags);
                formData.append('audioFile', audioFile);
                if (coverArtServerUrl) {
                  formData.append('artworkUrl', coverArtServerUrl);
                } else if (coverArtFile) {
                  formData.append('coverArt', coverArtFile);
                }
                uploadBeatMutation.mutate(formData);
              }}
              disabled={uploadBeatMutation.isPending || !audioFile || !uploadForm.title || !uploadForm.genre}
              className="bg-gradient-to-r from-blue-600 to-purple-600"
            >
              {uploadBeatMutation.isPending ? `Uploading ${uploadProgress}%` : 'Upload Beat'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showBulkUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/80" onClick={() => { setBulkUploadItems([]); setShowBulkUploadModal(false); }} />
          <div className="relative z-50 bg-background border rounded-lg shadow-lg w-full max-w-5xl max-h-[90vh] overflow-y-auto mx-4 p-6">
            <button
              className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none"
              onClick={() => { setBulkUploadItems([]); setShowBulkUploadModal(false); }}
            >
              <X className="h-4 w-4" />
            </button>
            <div className="mb-4">
              <h2 className="text-lg font-semibold flex items-center">
                <FolderUp className="w-5 h-5 mr-2" />
                Bulk Upload
              </h2>
              <p className="text-sm text-muted-foreground">Upload multiple beats at once. Edit each beat individually or apply settings in bulk.</p>
            </div>
            <div className="space-y-4">
              <div
                className="border-2 border-dashed rounded-lg p-6 text-center transition-colors hover:border-blue-400"
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (e.dataTransfer.files) handleBulkFileSelect(e.dataTransfer.files);
                }}
              >
                <UploadCloud className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-lg font-medium mb-1">Drag & drop audio files here</p>
                <p className="text-sm text-muted-foreground mb-3">Supports MP3, WAV, FLAC, AAC, OGG, M4A, AIFF</p>
                <label className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 cursor-pointer">
                  <input
                    type="file"
                    multiple
                    accept="audio/mpeg,audio/wav,audio/flac,audio/aac,audio/ogg,audio/mp4,audio/x-m4a,audio/aiff,audio/webm,.mp3,.wav,.flac,.aac,.ogg,.m4a,.aiff,.aif,.webm"
                    className="sr-only"
                    onClick={() => { isPickingFileRef.current = true; }}
                    onChange={(e) => {
                      setTimeout(() => { isPickingFileRef.current = false; }, 1500);
                      if (e.target.files && e.target.files.length > 0) {
                        handleBulkFileSelect(e.target.files);
                      }
                      e.target.value = '';
                    }}
                  />
                  Select Files
                </label>
              </div>

              {bulkUploadItems.length > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{bulkUploadItems.length} beats queued</p>
                    <div className="flex gap-2">
                      <Button
                        variant={bulkEditMode ? "default" : "outline"}
                        size="sm"
                        onClick={() => setBulkEditMode(!bulkEditMode)}
                      >
                        <Edit className="w-3 h-3 mr-1" />
                        Bulk Edit All
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setBulkUploadItems(prev => prev.filter(i => i.status !== 'pending'))}
                      >
                        Clear Pending
                      </Button>
                    </div>
                  </div>

                  {bulkEditMode && (
                    <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-3">
                      <p className="text-sm font-medium text-blue-700 dark:text-blue-400">Apply to all pending beats (leave blank to skip)</p>
                      <div className="flex items-start gap-4 mb-2">
                        <div className="flex-shrink-0">
                          <Label className="text-xs">Cover Art</Label>
                          {(bulkEditValues.coverArtFile || bulkEditCoverServerUrl) ? (
                            <div className="relative w-20 h-20 mt-1">
                              <SafeImg src={bulkEditCoverPreviewUrl || bulkEditCoverServerUrl || ''} alt="" className="w-20 h-20 rounded object-cover" loading="eager" />
                              {bulkEditCoverUploading && <div className="absolute inset-0 bg-black/50 rounded flex items-center justify-center"><Loader2 className="w-5 h-5 text-white animate-spin" /></div>}
                              <button
                                className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                                onClick={() => {
                                  if (bulkEditCoverPreviewUrl) revokeLocalPreview(bulkEditCoverPreviewUrl);
                                  setBulkEditCoverPreviewUrl(null);
                                  setBulkEditCoverServerUrl(null);
                                  setBulkEditCoverUploading(false);
                                  setBulkEditValues(prev => ({ ...prev, coverArtFile: null }));
                                }}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <label className="mt-1 w-20 h-20 border-2 border-dashed rounded flex flex-col items-center justify-center cursor-pointer hover:border-purple-400 transition-colors">
                              <input
                                type="file"
                                accept="image/jpeg,image/png"
                                className="sr-only"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (!f) return;
                                  const err = validateCoverFile(f);
                                  if (err) { toast({ title: 'Invalid File', description: err, variant: 'destructive' }); return; }
                                  if (bulkEditCoverPreviewUrl) revokeLocalPreview(bulkEditCoverPreviewUrl);
                                  const preview = createLocalPreview(f);
                                  setBulkEditCoverPreviewUrl(preview);
                                  setBulkEditCoverServerUrl(null);
                                  setBulkEditCoverUploading(true);
                                  setBulkEditValues(prev => ({ ...prev, coverArtFile: f }));
                                  uploadImageFile(f, '/api/storage/upload', 'file')
                                    .then(url => { setBulkEditCoverServerUrl(url); revokeLocalPreview(preview); setBulkEditCoverPreviewUrl(null); })
                                    .catch(() => toast({ title: 'Cover Art Upload Failed', variant: 'destructive' }))
                                    .finally(() => setBulkEditCoverUploading(false));
                                }}
                              />
                              <ImageIcon className="w-5 h-5 text-muted-foreground" />
                              <span className="text-[10px] text-muted-foreground mt-1">Add Art</span>
                            </label>
                          )}
                        </div>
                        <div className="flex-1">
                          <Label className="text-xs">Name / Title</Label>
                          <Input value={bulkEditValues.title} onChange={(e) => setBulkEditValues(prev => ({ ...prev, title: e.target.value }))} placeholder="Beat name..." className="h-8 text-xs mt-1" />
                          <p className="text-[10px] text-muted-foreground mt-1">Sets the same name for all pending beats</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <Label className="text-xs">Genre</Label>
                          <Select value={bulkEditValues.genre} onValueChange={(v) => setBulkEditValues(prev => ({ ...prev, genre: v }))}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                            <SelectContent>{BEAT_GENRES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Mood</Label>
                          <Select value={bulkEditValues.mood} onValueChange={(v) => setBulkEditValues(prev => ({ ...prev, mood: v }))}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                            <SelectContent>{BEAT_MOODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Key</Label>
                          <Select value={bulkEditValues.key} onValueChange={(v) => setBulkEditValues(prev => ({ ...prev, key: v }))}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                            <SelectContent>
                              {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">License</Label>
                          <Select value={bulkEditValues.licenseType} onValueChange={(v) => setBulkEditValues(prev => ({ ...prev, licenseType: v }))}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="basic">Basic</SelectItem>
                              <SelectItem value="premium">Premium</SelectItem>
                              <SelectItem value="unlimited">Unlimited</SelectItem>
                              <SelectItem value="exclusive">Exclusive</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">BPM</Label>
                          <Input type="number" value={bulkEditValues.tempo || ''} onChange={(e) => setBulkEditValues(prev => ({ ...prev, tempo: parseInt(e.target.value) || 0 }))} placeholder="BPM" className="h-8 text-xs" />
                        </div>
                        <div>
                          <Label className="text-xs">Price ($)</Label>
                          <Input type="number" value={bulkEditValues.price || ''} onChange={(e) => setBulkEditValues(prev => ({ ...prev, price: parseInt(e.target.value) || 0 }))} placeholder="Price" className="h-8 text-xs" />
                        </div>
                        <div>
                          <Label className="text-xs">Tags</Label>
                          <Input value={bulkEditValues.tags} onChange={(e) => setBulkEditValues(prev => ({ ...prev, tags: e.target.value }))} placeholder="tag1, tag2" className="h-8 text-xs" />
                        </div>
                        <div className="flex items-end">
                          <Button size="sm" onClick={applyBulkEdit} className="h-8 bg-gradient-to-r from-blue-600 to-purple-600 w-full">
                            Apply to All
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  <ScrollArea className="max-h-[400px]">
                    <div className="space-y-2">
                      {bulkUploadItems.map((item) => (
                        <div key={item.id} className="border rounded-lg overflow-hidden">
                          <div
                            className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50"
                            onClick={() => setExpandedBulkItem(expandedBulkItem === item.id ? null : item.id)}
                          >
                            {(item.coverArtPreviewUrl || item.coverArtServerUrl) ? (
                              <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0 relative">
                                <SafeImg src={item.coverArtPreviewUrl || item.coverArtServerUrl || ''} alt="" className="w-full h-full object-cover" loading="eager" />
                                {item.coverArtUploading && <div className="absolute inset-0 bg-black/50 rounded flex items-center justify-center"><Loader2 className="w-4 h-4 text-white animate-spin" /></div>}
                              </div>
                            ) : (
                              <FileAudio className="w-10 h-10 text-blue-500 flex-shrink-0 p-1" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{item.title}</p>
                              <p className="text-xs text-muted-foreground">{item.genre} &bull; {item.key} &bull; {item.tempo} BPM &bull; ${item.price}</p>
                            </div>
                            <div className="flex-shrink-0 w-24">
                              {item.status === 'pending' && <Badge variant="secondary" className="text-xs">Pending</Badge>}
                              {item.status === 'uploading' && <Progress value={item.progress} className="w-full h-2" />}
                              {item.status === 'completed' && <Badge className="text-xs bg-green-600">Done</Badge>}
                              {item.status === 'failed' && <Badge variant="destructive" className="text-xs">Failed</Badge>}
                            </div>
                            <ChevronDown className={`w-4 h-4 transition-transform ${expandedBulkItem === item.id ? 'rotate-180' : ''}`} />
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={(e) => { e.stopPropagation(); setBulkUploadItems(prev => prev.filter(i => i.id !== item.id)); }}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>

                          {expandedBulkItem === item.id && (
                            <div className="px-3 pb-3 space-y-3 border-t bg-muted/30">
                              <div className="grid grid-cols-2 gap-3 pt-3">
                                <div>
                                  <Label className="text-xs">Title</Label>
                                  <Input
                                    value={item.title}
                                    onChange={(e) => setBulkUploadItems(prev => prev.map(i => i.id === item.id ? { ...i, title: e.target.value } : i))}
                                    className="h-8 text-sm"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">Genre</Label>
                                  <Select value={item.genre} onValueChange={(v) => setBulkUploadItems(prev => prev.map(i => i.id === item.id ? { ...i, genre: v } : i))}>
                                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>{BEAT_GENRES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-xs">Mood</Label>
                                  <Select value={item.mood} onValueChange={(v) => setBulkUploadItems(prev => prev.map(i => i.id === item.id ? { ...i, mood: v } : i))}>
                                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>{BEAT_MOODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-xs">Key</Label>
                                  <Select value={item.key} onValueChange={(v) => setBulkUploadItems(prev => prev.map(i => i.id === item.id ? { ...i, key: v } : i))}>
                                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-xs">BPM</Label>
                                  <Input type="number" value={item.tempo} onChange={(e) => setBulkUploadItems(prev => prev.map(i => i.id === item.id ? { ...i, tempo: parseInt(e.target.value) || 120 } : i))} className="h-8 text-sm" min="60" max="300" />
                                </div>
                                <div>
                                  <Label className="text-xs">Price ($)</Label>
                                  <Input type="number" value={item.price} onChange={(e) => setBulkUploadItems(prev => prev.map(i => i.id === item.id ? { ...i, price: parseInt(e.target.value) || 1 } : i))} className="h-8 text-sm" min="1" />
                                </div>
                                <div>
                                  <Label className="text-xs">License</Label>
                                  <Select value={item.licenseType} onValueChange={(v) => setBulkUploadItems(prev => prev.map(i => i.id === item.id ? { ...i, licenseType: v } : i))}>
                                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="basic">Basic</SelectItem>
                                      <SelectItem value="premium">Premium</SelectItem>
                                      <SelectItem value="unlimited">Unlimited</SelectItem>
                                      <SelectItem value="exclusive">Exclusive</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-xs">Tags</Label>
                                  <Input value={item.tags} onChange={(e) => setBulkUploadItems(prev => prev.map(i => i.id === item.id ? { ...i, tags: e.target.value } : i))} placeholder="e.g., dark, trap" className="h-8 text-sm" />
                                </div>
                              </div>
                              <div>
                                <Label className="text-xs">Description</Label>
                                <Textarea
                                  value={item.description}
                                  onChange={(e) => setBulkUploadItems(prev => prev.map(i => i.id === item.id ? { ...i, description: e.target.value } : i))}
                                  placeholder="Optional description..."
                                  rows={2}
                                  className="text-sm"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Cover Art</Label>
                                {(item.coverArtPreviewUrl || item.coverArtServerUrl) ? (
                                  <div className="flex items-center gap-3 mt-1">
                                    <div className="w-16 h-16 rounded overflow-hidden relative">
                                      <SafeImg src={item.coverArtPreviewUrl || item.coverArtServerUrl || ''} alt="" className="w-full h-full object-cover" loading="eager" />
                                      {item.coverArtUploading && <div className="absolute inset-0 bg-black/50 rounded flex items-center justify-center"><Loader2 className="w-4 h-4 text-white animate-spin" /></div>}
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground">{item.coverArtServerUrl ? '✓ Uploaded' : item.coverArtUploading ? 'Uploading…' : 'Preview'}</p>
                                      <Button variant="ghost" size="sm" className="h-6 text-xs mt-1" onClick={() => {
                                        if (item.coverArtPreviewUrl) revokeLocalPreview(item.coverArtPreviewUrl);
                                        setBulkUploadItems(prev => prev.map(i => i.id === item.id ? { ...i, coverArtServerUrl: null, coverArtPreviewUrl: null, coverArtUploading: false } : i));
                                      }}>
                                        <X className="w-3 h-3 mr-1" /> Remove
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <label className="border border-dashed rounded-lg p-3 text-center cursor-pointer block mt-1 hover:border-purple-400 transition-colors">
                                    <input
                                      type="file"
                                      accept="image/jpeg,image/png"
                                      className="sr-only"
                                      onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (!f) return;
                                        const err = validateCoverFile(f);
                                        if (err) { toast({ title: 'Invalid File', description: err, variant: 'destructive' }); return; }
                                        const preview = createLocalPreview(f);
                                        setBulkUploadItems(prev => prev.map(i => i.id === item.id ? { ...i, coverArtPreviewUrl: preview, coverArtServerUrl: null, coverArtUploading: true } : i));
                                        uploadImageFile(f, '/api/storage/upload', 'file')
                                          .then(url => {
                                            revokeLocalPreview(preview);
                                            setBulkUploadItems(prev => prev.map(i => i.id === item.id ? { ...i, coverArtServerUrl: url, coverArtPreviewUrl: null, coverArtUploading: false } : i));
                                          })
                                          .catch(() => {
                                            toast({ title: 'Cover Art Upload Failed', variant: 'destructive' });
                                            setBulkUploadItems(prev => prev.map(i => i.id === item.id ? { ...i, coverArtUploading: false } : i));
                                          });
                                      }}
                                    />
                                    <div className="flex items-center gap-2 justify-center">
                                      <ImageIcon className="w-4 h-4 text-muted-foreground" />
                                      <span className="text-xs text-muted-foreground">Add cover art (JPG/PNG)</span>
                                    </div>
                                  </label>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </>
              )}
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => { setBulkUploadItems([]); setShowBulkUploadModal(false); }}>Cancel</Button>
              <Button
                onClick={handleBulkUpload}
                disabled={bulkUploadItems.filter(i => i.status === 'pending').length === 0}
                className="bg-gradient-to-r from-blue-600 to-purple-600"
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload {bulkUploadItems.filter(i => i.status === 'pending').length} Beats
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={showAffiliateModal} onOpenChange={setShowAffiliateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Affiliate Partner</DialogTitle>
            <DialogDescription>Invite a new affiliate to promote your beats</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input placeholder="Affiliate name" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" placeholder="affiliate@example.com" />
            </div>
            <div className="space-y-2">
              <Label>Commission Rate (%)</Label>
              <Slider defaultValue={[20]} max={50} step={5} />
              <p className="text-sm text-muted-foreground">20% of each sale</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAffiliateModal(false)}>Cancel</Button>
            <Button className="bg-gradient-to-r from-blue-600 to-purple-600">
              <UserPlus className="w-4 h-4 mr-2" />
              Add Affiliate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showContractModal} onOpenChange={setShowContractModal}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <FileSignature className="w-5 h-5 mr-2" />
              Contract Template Builder
            </DialogTitle>
            <DialogDescription>Create a reusable contract template for your beat sales</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Contract Name</Label>
                <Input
                  value={contractForm.name}
                  onChange={(e) => setContractForm({ ...contractForm, name: e.target.value })}
                  placeholder="e.g., Standard Beat Lease Agreement"
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={contractForm.category}
                  onValueChange={(value) => setContractForm({ ...contractForm, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beat_lease">Beat Lease</SelectItem>
                    <SelectItem value="exclusive">Exclusive Rights</SelectItem>
                    <SelectItem value="collaboration">Collaboration</SelectItem>
                    <SelectItem value="sync">Sync License</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={contractForm.description}
                onChange={(e) => setContractForm({ ...contractForm, description: e.target.value })}
                placeholder="Brief description of this contract"
              />
            </div>
            <div className="space-y-2">
              <Label>Contract Content</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Use variables like {'{buyer_name}'}, {'{beat_title}'}, {'{price}'}, {'{date}'} for dynamic content
              </p>
              <Textarea
                value={contractForm.content}
                onChange={(e) => setContractForm({ ...contractForm, content: e.target.value })}
                placeholder={`BEAT LEASE AGREEMENT

This agreement is entered into between {seller_name} ("Producer") and {buyer_name} ("Licensee") for the beat titled "{beat_title}".

1. GRANT OF LICENSE
Producer hereby grants Licensee a non-exclusive license to use the beat...

2. TERMS
- Price: ${'{price}'}
- Date: {date}
- Duration: {duration}

...`}
                rows={12}
                className="font-mono text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="cursor-pointer">{'{buyer_name}'}</Badge>
              <Badge variant="outline" className="cursor-pointer">{'{seller_name}'}</Badge>
              <Badge variant="outline" className="cursor-pointer">{'{beat_title}'}</Badge>
              <Badge variant="outline" className="cursor-pointer">{'{price}'}</Badge>
              <Badge variant="outline" className="cursor-pointer">{'{date}'}</Badge>
              <Badge variant="outline" className="cursor-pointer">{'{license_type}'}</Badge>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowContractModal(false)}>Cancel</Button>
            <Button
              onClick={() => saveContractMutation.mutate(contractForm)}
              disabled={saveContractMutation.isPending}
              className="bg-gradient-to-r from-blue-600 to-purple-600"
            >
              <Save className="w-4 h-4 mr-2" />
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCollaborationModal} onOpenChange={setShowCollaborationModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Handshake className="w-5 h-5 mr-2" />
              Send Collaboration Offer
            </DialogTitle>
            <DialogDescription>Propose a collaboration with another producer or artist</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Collaboration Type</Label>
              <Select
                value={collaborationForm.type}
                onValueChange={(value) => setCollaborationForm({ ...collaborationForm, type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="feature">Feature</SelectItem>
                  <SelectItem value="remix">Remix</SelectItem>
                  <SelectItem value="split">Split Beat</SelectItem>
                  <SelectItem value="ghost_production">Ghost Production</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Revenue Split (%)</Label>
              <div className="flex items-center space-x-4">
                <Slider
                  value={[collaborationForm.splitPercentage]}
                  onValueChange={(value) => setCollaborationForm({ ...collaborationForm, splitPercentage: value[0] })}
                  max={100}
                  step={5}
                  className="flex-1"
                />
                <span className="font-semibold w-16 text-right">{collaborationForm.splitPercentage}%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                You: {collaborationForm.splitPercentage}% | Partner: {100 - collaborationForm.splitPercentage}%
              </p>
            </div>
            <div className="space-y-2">
              <Label>Budget (Optional)</Label>
              <Input
                type="number"
                value={collaborationForm.budget}
                onChange={(e) => setCollaborationForm({ ...collaborationForm, budget: parseInt(e.target.value) })}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>Terms & Details</Label>
              <Textarea
                value={collaborationForm.terms}
                onChange={(e) => setCollaborationForm({ ...collaborationForm, terms: e.target.value })}
                placeholder="Describe what you're looking for..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                value={collaborationForm.message}
                onChange={(e) => setCollaborationForm({ ...collaborationForm, message: e.target.value })}
                placeholder="Write a personal message..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCollaborationModal(false)}>Cancel</Button>
            <Button
              onClick={() => sendCollaborationMutation.mutate({
                toUserId: 'placeholder',
                ...collaborationForm
              })}
              disabled={sendCollaborationMutation.isPending}
              className="bg-gradient-to-r from-blue-600 to-purple-600"
            >
              <Handshake className="w-4 h-4 mr-2" />
              Send Offer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="bg-background max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Edit className="w-5 h-5 mr-2" />
              Edit Beat
            </DialogTitle>
            <DialogDescription>Update your beat details, cover art, and discount settings</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <Label className="text-xs">Cover Art</Label>
                {(editForm.coverArtFile || editCoverArtServerUrl) ? (
                  <div className="relative w-24 h-24 mt-1">
                    <SafeImg src={editCoverArtPreviewUrl || editCoverArtServerUrl || ''} alt="" className="w-24 h-24 rounded-lg object-cover" loading="eager" />
                    {editCoverArtUploading && <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center"><Loader2 className="w-5 h-5 text-white animate-spin" /></div>}
                    <button
                      className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                      onClick={() => {
                        if (editCoverArtPreviewUrl) revokeLocalPreview(editCoverArtPreviewUrl);
                        setEditCoverArtPreviewUrl(null);
                        setEditCoverArtServerUrl(null);
                        setEditCoverArtUploading(false);
                        setEditForm({ ...editForm, coverArtFile: null });
                      }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="relative mt-1">
                    {editingBeat?.coverArt ? (
                      <div className="relative w-24 h-24">
                        <SafeImg src={editingBeat.coverArt} alt="" className="w-24 h-24 rounded-lg object-cover" loading="eager" />
                        <label className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center cursor-pointer opacity-0 hover:opacity-100 transition-opacity">
                          <input
                            type="file"
                            accept="image/jpeg,image/png"
                            className="sr-only"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              if (editCoverArtPreviewUrl) revokeLocalPreview(editCoverArtPreviewUrl);
                              const preview = createLocalPreview(f);
                              setEditCoverArtPreviewUrl(preview);
                              setEditCoverArtServerUrl(null);
                              setEditCoverArtUploading(true);
                              setEditForm({ ...editForm, coverArtFile: f });
                              uploadImageFile(f, '/api/storage/upload', 'file')
                                .then(url => { setEditCoverArtServerUrl(url); revokeLocalPreview(preview); setEditCoverArtPreviewUrl(null); })
                                .catch(() => toast({ title: 'Cover Art Upload Failed', variant: 'destructive' }))
                                .finally(() => setEditCoverArtUploading(false));
                            }}
                          />
                          <Edit className="w-5 h-5 text-white" />
                        </label>
                      </div>
                    ) : (
                      <label className="w-24 h-24 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-purple-400 transition-colors">
                        <input
                          type="file"
                          accept="image/jpeg,image/png"
                          className="sr-only"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            if (editCoverArtPreviewUrl) revokeLocalPreview(editCoverArtPreviewUrl);
                            const preview = createLocalPreview(f);
                            setEditCoverArtPreviewUrl(preview);
                            setEditCoverArtServerUrl(null);
                            setEditCoverArtUploading(true);
                            setEditForm({ ...editForm, coverArtFile: f });
                            uploadImageFile(f, '/api/storage/upload', 'file')
                              .then(url => { setEditCoverArtServerUrl(url); revokeLocalPreview(preview); setEditCoverArtPreviewUrl(null); })
                              .catch(() => toast({ title: 'Cover Art Upload Failed', variant: 'destructive' }))
                              .finally(() => setEditCoverArtUploading(false));
                          }}
                        />
                        <ImageIcon className="w-6 h-6 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground mt-1">Add Art</span>
                      </label>
                    )}
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <Label>Title</Label>
                <Input
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  placeholder="Beat title"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Genre</Label>
                <Select value={editForm.genre} onValueChange={(value) => setEditForm({ ...editForm, genre: value })}>
                  <SelectTrigger><SelectValue placeholder="Select genre" /></SelectTrigger>
                  <SelectContent>{BEAT_GENRES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Mood</Label>
                <Select value={editForm.mood} onValueChange={(value) => setEditForm({ ...editForm, mood: value })}>
                  <SelectTrigger><SelectValue placeholder="Select mood" /></SelectTrigger>
                  <SelectContent>{BEAT_MOODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Key</Label>
                <Select value={editForm.key} onValueChange={(value) => setEditForm({ ...editForm, key: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map((key) => (
                      <SelectItem key={key} value={key}>{key}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>BPM</Label>
                <Input type="number" value={editForm.tempo} onChange={(e) => setEditForm({ ...editForm, tempo: parseInt(e.target.value) || 120 })} min={60} max={300} />
              </div>
              <div className="space-y-2">
                <Label>License</Label>
                <Select value={editForm.licenseType} onValueChange={(value) => setEditForm({ ...editForm, licenseType: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="basic">Basic</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                    <SelectItem value="unlimited">Unlimited</SelectItem>
                    <SelectItem value="exclusive">Exclusive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Base Price ($)</Label>
              <Input type="number" value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: parseFloat(e.target.value) || 0 })} min={0} />
            </div>
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-600" />
                  License Tiers
                </Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{showLicenseTiers ? 'Per-license pricing' : 'Single price'}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant={showLicenseTiers ? 'default' : 'outline'}
                    className="h-7 text-xs"
                    onClick={() => {
                      if (!showLicenseTiers && editLicenseTiers.length === 0) {
                        setEditLicenseTiers(DEFAULT_LICENSE_TIERS.map(t => ({ ...t, priceCents: Math.round(editForm.price * 100) || t.priceCents })));
                      }
                      setShowLicenseTiers(!showLicenseTiers);
                    }}
                  >
                    {showLicenseTiers ? 'Enabled' : 'Enable'}
                  </Button>
                </div>
              </div>
              {showLicenseTiers && (
                <div className="space-y-3 mt-2">
                  <p className="text-xs text-muted-foreground">Set different prices, discounts, BOGO deals, and file formats for each license type. Each license can have its own discount.</p>
                  {editLicenseTiers.map((tier, idx) => (
                    <div key={tier.licenseType} className={`border rounded-lg p-3 space-y-2 ${!tier.isActive ? 'opacity-50' : ''}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <input type="checkbox" checked={tier.isActive} onChange={(e) => {
                            const updated = [...editLicenseTiers];
                            updated[idx] = { ...updated[idx], isActive: e.target.checked };
                            setEditLicenseTiers(updated);
                          }} className="rounded" />
                          <span className="font-medium text-sm">{tier.label}</span>
                          <Badge variant="outline" className="text-[10px]">{tier.licenseType}</Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">$</span>
                          <Input
                            type="number"
                            value={(tier.priceCents / 100).toFixed(2)}
                            onChange={(e) => {
                              const updated = [...editLicenseTiers];
                              updated[idx] = { ...updated[idx], priceCents: Math.round((parseFloat(e.target.value) || 0) * 100) };
                              setEditLicenseTiers(updated);
                            }}
                            min={0}
                            className="h-7 w-24 text-xs text-right"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Discount Type</Label>
                          <Select value={tier.discountType} onValueChange={(value) => {
                            const updated = [...editLicenseTiers];
                            updated[idx] = { ...updated[idx], discountType: value };
                            setEditLicenseTiers(updated);
                          }}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No Discount</SelectItem>
                              <SelectItem value="percent">% Off</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {tier.discountType === 'percent' && (
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Discount %</Label>
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                value={tier.discountPercent || ''}
                                onChange={(e) => {
                                  const updated = [...editLicenseTiers];
                                  updated[idx] = { ...updated[idx], discountPercent: parseInt(e.target.value) || 0 };
                                  setEditLicenseTiers(updated);
                                }}
                                min={1} max={99}
                                className="h-7 text-xs"
                              />
                              {tier.discountPercent > 0 && (
                                <Badge variant="destructive" className="text-[9px] whitespace-nowrap">
                                  ${((tier.priceCents / 100) * (1 - tier.discountPercent / 100)).toFixed(2)}
                                </Badge>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      {tier.discountType === 'percent' && (
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Discount Expires (optional)</Label>
                          <Input
                            type="datetime-local"
                            value={tier.discountExpiresAt ? tier.discountExpiresAt.slice(0, 16) : ''}
                            onChange={(e) => {
                              const updated = [...editLicenseTiers];
                              updated[idx] = { ...updated[idx], discountExpiresAt: e.target.value ? new Date(e.target.value).toISOString() : '' };
                              setEditLicenseTiers(updated);
                            }}
                            className="h-7 text-xs"
                          />
                        </div>
                      )}
                      <div className="flex items-center gap-2 pt-1">
                        <input type="checkbox" checked={tier.bogoEnabled} onChange={(e) => {
                          const updated = [...editLicenseTiers];
                          updated[idx] = { ...updated[idx], bogoEnabled: e.target.checked };
                          setEditLicenseTiers(updated);
                        }} className="rounded" />
                        <Label className="text-xs font-medium text-orange-600">BOGO Deal</Label>
                        {tier.bogoEnabled && (
                          <span className="text-[10px] text-muted-foreground">Buy this license, get another free/discounted</span>
                        )}
                      </div>
                      {tier.bogoEnabled && (
                        <div className="grid grid-cols-2 gap-2 pl-5">
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Free License Type</Label>
                            <Select value={tier.bogoGetType || ''} onValueChange={(value) => {
                              const updated = [...editLicenseTiers];
                              updated[idx] = { ...updated[idx], bogoGetType: value };
                              setEditLicenseTiers(updated);
                            }}>
                              <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                              <SelectContent>
                                {editLicenseTiers.filter(t => t.licenseType !== tier.licenseType).map(t => (
                                  <SelectItem key={t.licenseType} value={t.licenseType}>{t.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">BOGO Discount %</Label>
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                value={tier.bogoGetPercent}
                                onChange={(e) => {
                                  const updated = [...editLicenseTiers];
                                  updated[idx] = { ...updated[idx], bogoGetPercent: parseInt(e.target.value) || 0 };
                                  setEditLicenseTiers(updated);
                                }}
                                min={0} max={100}
                                className="h-7 text-xs"
                              />
                              <span className="text-[10px] text-muted-foreground whitespace-nowrap">{tier.bogoGetPercent === 100 ? 'FREE' : `${tier.bogoGetPercent}% off`}</span>
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="pt-1">
                        <Label className="text-[10px] text-muted-foreground">Included File Formats</Label>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {['mp3', 'wav', 'flac', 'stems'].map(fmt => (
                            <Button
                              key={fmt}
                              type="button"
                              size="sm"
                              variant={tier.fileFormats.includes(fmt) ? 'default' : 'outline'}
                              className="h-6 text-[10px] px-2"
                              onClick={() => {
                                const updated = [...editLicenseTiers];
                                const formats = tier.fileFormats.includes(fmt)
                                  ? tier.fileFormats.filter(f => f !== fmt)
                                  : [...tier.fileFormats, fmt];
                                updated[idx] = { ...updated[idx], fileFormats: formats.length > 0 ? formats : ['mp3'] };
                                setEditLicenseTiers(updated);
                              }}
                            >
                              {fmt.toUpperCase()}
                            </Button>
                          ))}
                        </div>
                        {tier.fileFormats.length > 1 && (
                          <p className="text-[10px] text-green-600 mt-1">Buyer gets {tier.fileFormats.map(f => f.toUpperCase()).join(' + ')} files</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {!showLicenseTiers && (
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Percent className="w-4 h-4 text-green-600" />
                  Discount
                </Label>
                {editForm.discountPercent > 0 && (
                  <Badge variant="destructive" className="text-xs">-{editForm.discountPercent}% = ${(editForm.price * (1 - editForm.discountPercent / 100)).toFixed(2)}</Badge>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                {[0, 10, 15, 20, 25, 30, 40, 50].map(p => (
                  <Button
                    key={p}
                    type="button"
                    size="sm"
                    variant={editForm.discountPercent === p ? 'default' : 'outline'}
                    className="h-7 text-xs"
                    onClick={() => setEditForm({ ...editForm, discountPercent: p })}
                  >
                    {p === 0 ? 'None' : `${p}%`}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Label className="text-xs">Custom %</Label>
                  <Input type="number" value={editForm.discountPercent || ''} onChange={(e) => setEditForm({ ...editForm, discountPercent: parseInt(e.target.value) || 0 })} min={0} max={99} className="h-8 text-sm" />
                </div>
                <div className="flex-1">
                  <Label className="text-xs">Expires (optional)</Label>
                  <Input type="datetime-local" value={editForm.discountExpiresAt ? editForm.discountExpiresAt.slice(0, 16) : ''} onChange={(e) => setEditForm({ ...editForm, discountExpiresAt: e.target.value ? new Date(e.target.value).toISOString() : '' })} className="h-8 text-sm" />
                </div>
              </div>
            </div>
            )}
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} placeholder="Describe your beat..." rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Tags (comma-separated)</Label>
              <Input value={editForm.tags} onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })} placeholder="dark, melodic, emotional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>Cancel</Button>
            <Button
              onClick={handleUpdateBeat}
              disabled={updateBeatMutation.isPending}
              className="bg-gradient-to-r from-blue-600 to-purple-600"
            >
              {updateBeatMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="bg-background">
          <DialogHeader>
            <DialogTitle className="flex items-center text-red-600">
              <AlertCircle className="w-5 h-5 mr-2" />
              Delete Beat
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this beat? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteBeat}
              disabled={deleteBeatMutation.isPending}
            >
              {deleteBeatMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Beat
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Contract Dialog */}
      <Dialog open={showEditContract} onOpenChange={setShowEditContract}>
        <DialogContent className="sm:max-w-lg bg-white dark:bg-gray-800">
          <DialogHeader>
            <DialogTitle>Edit Contract Template</DialogTitle>
            <DialogDescription>
              Update your contract template details below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-contract-name">Contract Name</Label>
              <Input
                id="edit-contract-name"
                value={editContractForm.name}
                onChange={(e) => setEditContractForm({ ...editContractForm, name: e.target.value })}
                placeholder="e.g., Exclusive License Agreement"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-contract-description">Description</Label>
              <Textarea
                id="edit-contract-description"
                value={editContractForm.description}
                onChange={(e) => setEditContractForm({ ...editContractForm, description: e.target.value })}
                placeholder="Brief description of this contract template"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-contract-category">Category</Label>
              <Select
                value={editContractForm.category}
                onValueChange={(value) => setEditContractForm({ ...editContractForm, category: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="exclusive">Exclusive License</SelectItem>
                  <SelectItem value="non_exclusive">Non-Exclusive License</SelectItem>
                  <SelectItem value="lease">Lease Agreement</SelectItem>
                  <SelectItem value="buyout">Buyout Agreement</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-contract-content">Contract Content</Label>
              <Textarea
                id="edit-contract-content"
                value={editContractForm.content}
                onChange={(e) => setEditContractForm({ ...editContractForm, content: e.target.value })}
                placeholder="Enter your contract terms and conditions..."
                rows={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditContract(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedContract) {
                  updateContractMutation.mutate({
                    id: selectedContract.id,
                    data: editContractForm,
                  });
                }
              }}
              disabled={updateContractMutation.isPending}
            >
              {updateContractMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Contract Confirmation */}
      <AlertDialog open={showDeleteContract} onOpenChange={setShowDeleteContract}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contract Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedContract?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedContract) {
                  deleteContractMutation.mutate(selectedContract.id);
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteContractMutation.isPending ? 'Deleting...' : 'Delete Contract'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pendingDeleteProductId !== null} onOpenChange={(open) => { if (!open) setPendingDeleteProductId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this product? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDeleteProductId !== null) {
                  deleteItemMutation.mutate(pendingDeleteProductId);
                  setPendingDeleteProductId(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Discount Dialog */}
      <Dialog open={!!discountBeat} onOpenChange={(open) => !open && setDiscountBeat(null)}>
        <DialogContent className="bg-white dark:bg-gray-800">
          <DialogHeader>
            <DialogTitle>Set Discount - {discountBeat?.title}</DialogTitle>
            <DialogDescription>
              Add a discount to your beat like BeatStars. Current price: ${discountBeat?.price}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Discount Percentage</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min="1"
                  max="99"
                  value={discountForm.percent}
                  onChange={(e) => setDiscountForm({ ...discountForm, percent: parseInt(e.target.value) || 0 })}
                  className="w-24"
                />
                <span className="text-muted-foreground">%</span>
                {discountBeat && discountForm.percent > 0 && (
                  <span className="text-green-600 font-medium">
                    Sale price: ${((discountBeat.price) * (1 - discountForm.percent / 100)).toFixed(2)}
                  </span>
                )}
              </div>
              <div className="flex gap-2 mt-2">
                {[10, 20, 25, 30, 50].map((p) => (
                  <Button
                    key={p}
                    size="sm"
                    variant={discountForm.percent === p ? 'default' : 'outline'}
                    onClick={() => setDiscountForm({ ...discountForm, percent: p })}
                  >
                    {p}%
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Expiration Date (optional)</Label>
              <Input
                type="datetime-local"
                value={discountForm.expiresAt ? discountForm.expiresAt.slice(0, 16) : ''}
                onChange={(e) => setDiscountForm({ ...discountForm, expiresAt: e.target.value ? new Date(e.target.value).toISOString() : '' })}
              />
              <p className="text-xs text-muted-foreground">Leave empty for no expiration</p>
            </div>
          </div>
          <DialogFooter className="flex justify-between">
            {discountBeat?.discountPercent && (
              <Button
                variant="outline"
                className="text-red-600"
                onClick={() => discountBeat && discountMutation.mutate({ beatId: discountBeat.id, discountPercent: null })}
              >
                Remove Discount
              </Button>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDiscountBeat(null)}>Cancel</Button>
              <Button
                onClick={() => {
                  if (discountBeat && discountForm.percent > 0 && discountForm.percent < 100) {
                    discountMutation.mutate({
                      beatId: discountBeat.id,
                      discountPercent: discountForm.percent,
                      discountExpiresAt: discountForm.expiresAt || undefined,
                    });
                  }
                }}
                disabled={discountMutation.isPending || discountForm.percent <= 0 || discountForm.percent >= 100}
              >
                {discountMutation.isPending ? 'Saving...' : 'Apply Discount'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={showLicenseModal} onOpenChange={(open) => {
        setShowLicenseModal(open);
        if (!open) setLicenseForm({ name: '', type: 'non-exclusive', priceCents: 2999, streams: '100000', copies: '5000', musicVideos: '1', duration: '1 year', allowsBroadcast: false, allowsProfit: true, allowsSync: false, fileFormats: 'MP3' });
      }}>
        <DialogContent className="bg-white dark:bg-gray-800 max-w-lg">
          <DialogHeader>
            <DialogTitle>Create License Template</DialogTitle>
            <DialogDescription>Define the terms for a custom license type</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label>License Name</Label>
              <Input value={licenseForm.name} onChange={(e) => setLicenseForm({ ...licenseForm, name: e.target.value })} placeholder="e.g. Premium Lease" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={licenseForm.type} onValueChange={(v) => setLicenseForm({ ...licenseForm, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="non-exclusive">Non-Exclusive</SelectItem>
                    <SelectItem value="exclusive">Exclusive</SelectItem>
                    <SelectItem value="unlimited">Unlimited</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Price ($)</Label>
                <Input type="number" step="0.01" min="0" value={(licenseForm.priceCents / 100).toFixed(2)} onChange={(e) => setLicenseForm({ ...licenseForm, priceCents: Math.round(parseFloat(e.target.value || '0') * 100) })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Streams</Label>
                <Input value={licenseForm.streams} onChange={(e) => setLicenseForm({ ...licenseForm, streams: e.target.value })} placeholder="100000 or unlimited" />
              </div>
              <div className="space-y-2">
                <Label>Copies</Label>
                <Input value={licenseForm.copies} onChange={(e) => setLicenseForm({ ...licenseForm, copies: e.target.value })} placeholder="5000 or unlimited" />
              </div>
              <div className="space-y-2">
                <Label>Music Videos</Label>
                <Input value={licenseForm.musicVideos} onChange={(e) => setLicenseForm({ ...licenseForm, musicVideos: e.target.value })} placeholder="1 or unlimited" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Duration</Label>
              <Input value={licenseForm.duration} onChange={(e) => setLicenseForm({ ...licenseForm, duration: e.target.value })} placeholder="e.g. 1 year, Lifetime" />
            </div>
            <div className="flex gap-6 pt-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={licenseForm.allowsBroadcast} onChange={(e) => setLicenseForm({ ...licenseForm, allowsBroadcast: e.target.checked })} className="rounded" />
                Broadcast
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={licenseForm.allowsProfit} onChange={(e) => setLicenseForm({ ...licenseForm, allowsProfit: e.target.checked })} className="rounded" />
                For Profit
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={licenseForm.allowsSync} onChange={(e) => setLicenseForm({ ...licenseForm, allowsSync: e.target.checked })} className="rounded" />
                Sync
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLicenseModal(false)}>Cancel</Button>
            <Button onClick={() => createLicenseTemplateMutation.mutate(licenseForm)} disabled={!licenseForm.name || createLicenseTemplateMutation.isPending}>
              {createLicenseTemplateMutation.isPending ? 'Creating...' : 'Create License'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedLicense} onOpenChange={(open) => !open && setSelectedLicense(null)}>
        <DialogContent className="bg-white dark:bg-gray-800 max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit License: {selectedLicense?.name}</DialogTitle>
            <DialogDescription>Update license terms and pricing</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label>License Name</Label>
              <Input value={licenseForm.name} onChange={(e) => setLicenseForm({ ...licenseForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={licenseForm.type} onValueChange={(v) => setLicenseForm({ ...licenseForm, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="non-exclusive">Non-Exclusive</SelectItem>
                    <SelectItem value="exclusive">Exclusive</SelectItem>
                    <SelectItem value="unlimited">Unlimited</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Price ($)</Label>
                <Input type="number" step="0.01" min="0" value={(licenseForm.priceCents / 100).toFixed(2)} onChange={(e) => setLicenseForm({ ...licenseForm, priceCents: Math.round(parseFloat(e.target.value || '0') * 100) })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Streams</Label>
                <Input value={licenseForm.streams} onChange={(e) => setLicenseForm({ ...licenseForm, streams: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Copies</Label>
                <Input value={licenseForm.copies} onChange={(e) => setLicenseForm({ ...licenseForm, copies: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Music Videos</Label>
                <Input value={licenseForm.musicVideos} onChange={(e) => setLicenseForm({ ...licenseForm, musicVideos: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Duration</Label>
              <Input value={licenseForm.duration} onChange={(e) => setLicenseForm({ ...licenseForm, duration: e.target.value })} />
            </div>
            <div className="flex gap-6 pt-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={licenseForm.allowsBroadcast} onChange={(e) => setLicenseForm({ ...licenseForm, allowsBroadcast: e.target.checked })} className="rounded" />
                Broadcast
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={licenseForm.allowsProfit} onChange={(e) => setLicenseForm({ ...licenseForm, allowsProfit: e.target.checked })} className="rounded" />
                For Profit
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={licenseForm.allowsSync} onChange={(e) => setLicenseForm({ ...licenseForm, allowsSync: e.target.checked })} className="rounded" />
                Sync
              </label>
            </div>
          </div>
          <DialogFooter className="flex justify-between">
            {selectedLicense && licenseTemplatesData.length > 0 && (
              <Button variant="destructive" size="sm" onClick={() => deleteLicenseTemplateMutation.mutate(selectedLicense.id)} disabled={deleteLicenseTemplateMutation.isPending}>
                {deleteLicenseTemplateMutation.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSelectedLicense(null)}>Cancel</Button>
              <Button onClick={() => selectedLicense && updateLicenseTemplateMutation.mutate({ id: selectedLicense.id, ...licenseForm })} disabled={!licenseForm.name || updateLicenseTemplateMutation.isPending}>
                {updateLicenseTemplateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCartModal} onOpenChange={setShowCartModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <ShoppingCart className="w-5 h-5 mr-2" />
              Your Cart ({cart.length})
            </DialogTitle>
            <DialogDescription>Review your items before checkout</DialogDescription>
          </DialogHeader>
          {cart.length === 0 ? (
            <EmptyCartState onAction={() => setShowCartModal(false)} />
          ) : (
            <div className="space-y-4">
              <ScrollArea className="max-h-[300px]">
                <div className="space-y-3 pr-4">
                  {cart.map((item, index) => {
                    const beat = beats.find((b: Beat) => b.id === item.beatId);
                    return (
                      <div key={`${item.beatId}-${item.licenseType}`} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{beat?.title || 'Beat'}</p>
                          <p className="text-xs text-muted-foreground capitalize">{item.licenseType} License</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-sm">${item.price.toFixed(2)}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => {
                              setCart(cart.filter((_, i) => i !== index));
                              toast({ title: 'Removed from Cart' });
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
              <div className="border-t pt-3 space-y-3">
                <div className="flex justify-between items-center font-semibold">
                  <span>Total</span>
                  <span className="text-lg">${cart.reduce((sum, item) => sum + item.price, 0).toFixed(2)}</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => { setCart([]); toast({ title: 'Cart Cleared' }); }}>
                    Clear Cart
                  </Button>
                  <Button
                    className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                    disabled={purchaseBeatMutation.isPending}
                    onClick={() => {
                      if (cart.length > 0) {
                        const item = cart[0];
                        const beat = beats.find((b: Beat) => b.id === item.beatId);
                        if (beat) {
                          handlePurchase(beat, item.licenseType);
                          setShowCartModal(false);
                        } else {
                          toast({ title: 'Error', description: 'Beat no longer available', variant: 'destructive' });
                        }
                      }
                    }}
                  >
                    {purchaseBeatMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Checkout</>
                    ) : (
                      <><CreditCard className="w-4 h-4 mr-2" /> Checkout ({cart.length} {cart.length === 1 ? 'item' : 'items'})</>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
