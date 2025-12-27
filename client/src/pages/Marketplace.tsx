import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRequireSubscription } from '@/hooks/useRequireAuth';

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
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { StemsManager } from '@/components/StemsManager';
import { PayoutDashboard } from '@/components/marketplace/PayoutDashboard';
import StorefrontBuilder from '@/components/marketplace/StorefrontBuilder';
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
  Image,
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
  Paste,
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
  buyerId: string;
  sellerId: string;
  amount: number;
  currency: string;
  licenseType: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  createdAt: string;
  completedAt?: string;
  downloadUrl?: string;
  licenseUrl?: string;
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

export default function Marketplace() {
  const { user, isLoading: authLoading } = useRequireSubscription();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('browse');
  const [searchQuery, setSearchQuery] = useState('');
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
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

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [showPreviewPlayer, setShowPreviewPlayer] = useState(false);
  const [currentBeat, setCurrentBeat] = useState<Beat | null>(null);

  const [showEscrowModal, setShowEscrowModal] = useState(false);
  const [showLicenseModal, setShowLicenseModal] = useState(false);
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

  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingBeat, setEditingBeat] = useState<Beat | null>(null);
  const [deletingBeatId, setDeletingBeatId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    genre: '',
    tempo: 120,
    key: 'C',
    price: 50,
    description: '',
    tags: '',
  });

  const { data: beats = [], isLoading: beatsLoading } = useQuery<Beat[]>({
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
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: producersData, isLoading: producersLoading } = useQuery<ProducersResponse>({
    queryKey: ['/api/marketplace/producers'],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const producers = producersData?.producers || [];

  const { data: purchases = [], isLoading: purchasesLoading } = useQuery<Purchase[]>({
    queryKey: ['/api/marketplace/purchases'],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: salesAnalytics, isLoading: salesAnalyticsLoading } = useQuery({
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
      const response = await apiRequest('POST', '/api/marketplace/upload', beatData, {
        timeout: 300000, // 5 minutes for large audio file uploads
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Beat Uploaded!',
        description: 'Your beat has been uploaded and is pending approval.',
      });
      setShowUploadModal(false);
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/beats'] });
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
    },
    onError: (error: Error) => {
      toast({
        title: 'Delete Failed',
        description: error.message || 'Failed to delete beat',
        variant: 'destructive',
      });
    },
  });

  const handleEditBeat = (beat: Beat) => {
    setEditingBeat(beat);
    setEditForm({
      title: beat.title,
      genre: beat.genre || '',
      tempo: beat.bpm || 120,
      key: beat.key || 'C',
      price: beat.price || 50,
      description: beat.description || '',
      tags: beat.tags?.join(', ') || '',
    });
    setShowEditModal(true);
  };

  const handleUpdateBeat = () => {
    if (!editingBeat) return;
    const formData = new FormData();
    formData.append('title', editForm.title);
    formData.append('genre', editForm.genre);
    formData.append('tempo', String(editForm.tempo));
    formData.append('key', editForm.key);
    formData.append('price', String(editForm.price));
    formData.append('description', editForm.description);
    formData.append('tags', editForm.tags);
    updateBeatMutation.mutate({ id: editingBeat.id, data: formData });
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

  const releaseEscrowMutation = useMutation({
    mutationFn: async (transactionId: string) => {
      const response = await apiRequest('POST', `/api/marketplace/escrow/${transactionId}/release`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Escrow Released', description: 'Funds have been released to the seller.' });
      queryClient.invalidateQueries({ queryKey: ['/api/marketplace/escrow'] });
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

  const handlePlayPause = (beatId: string, beatUrl?: string) => {
    if (isPlaying === beatId) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setIsPlaying(null);
      setShowPreviewPlayer(false);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    const beat = beats.find((b) => b.id === beatId) || myBeats.find((b) => b.id === beatId);
    const audioUrl = beatUrl || beat?.audioUrl || beat?.previewUrl || beat?.fullUrl;

    if (!audioUrl) {
      toast({
        title: 'Preview Unavailable',
        description: 'Audio file not available for this beat',
        variant: 'destructive',
      });
      return;
    }

    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.crossOrigin = 'anonymous';
      audioRef.current.preload = 'auto';
      audioRef.current.addEventListener('ended', () => {
        setIsPlaying(null);
        setShowPreviewPlayer(false);
      });
      audioRef.current.addEventListener('error', (e) => {
        const error = audioRef.current?.error;
        let errorMessage = 'Failed to load audio file';
        if (error) {
          switch (error.code) {
            case MediaError.MEDIA_ERR_ABORTED:
              errorMessage = 'Audio loading was aborted';
              break;
            case MediaError.MEDIA_ERR_NETWORK:
              errorMessage = 'Network error while loading audio';
              break;
            case MediaError.MEDIA_ERR_DECODE:
              errorMessage = 'Audio format not supported';
              break;
            case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
              errorMessage = 'Audio source not supported';
              break;
          }
        }
        toast({
          title: 'Playback Error',
          description: errorMessage,
          variant: 'destructive',
        });
        setIsPlaying(null);
      });
      audioRef.current.addEventListener('timeupdate', () => {
        if (audioRef.current) {
          setCurrentTime(audioRef.current.currentTime);
        }
      });
      audioRef.current.addEventListener('loadedmetadata', () => {
        if (audioRef.current) {
          setDuration(audioRef.current.duration);
        }
      });
    }

    audioRef.current.src = audioUrl;
    audioRef.current.volume = volume / 100;
    audioRef.current.load();
    
    const playAudio = () => {
      audioRef.current?.play().catch((err) => {
        toast({
          title: 'Playback Error',
          description: err.name === 'NotAllowedError' 
            ? 'Click the play button again to start playback'
            : 'Failed to play audio. Please try again.',
          variant: 'destructive',
        });
        setIsPlaying(null);
      });
    };
    
    if (audioRef.current.readyState >= 2) {
      playAudio();
    } else {
      audioRef.current.addEventListener('canplay', playAudio, { once: true });
    }

    setIsPlaying(beatId);
    setCurrentBeat(beat || null);
    setShowPreviewPlayer(true);
  };

  const handleSeek = (value: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume / 100;
    }
    if (newVolume > 0) setIsMuted(false);
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
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
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
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
    if (navigator.share) {
      navigator.share({
        title: beat.title,
        text: `Check out this beat: ${beat.title} by ${beat.producer}`,
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast({
        title: 'Link Copied!',
        description: 'Beat link copied to clipboard',
      });
    }
  };

  const getLicensePrice = (beat: Beat, licenseType: string): number => {
    const basePrice = beat.price;
    switch (licenseType) {
      case 'basic':
        return basePrice;
      case 'premium':
        return basePrice * 2;
      case 'unlimited':
        return basePrice * 5;
      case 'exclusive':
        return basePrice * 20;
      default:
        return basePrice;
    }
  };

  const getLicenseDescription = (licenseType: string): string => {
    switch (licenseType) {
      case 'basic':
        return 'Basic lease - 5,000 copies, 1 year';
      case 'premium':
        return 'Premium lease - 50,000 copies, 2 years';
      case 'unlimited':
        return 'Unlimited lease - Unlimited copies, 5 years';
      case 'exclusive':
        return 'Exclusive rights - Full ownership';
      default:
        return '';
    }
  };

  const handleBulkFileSelect = (files: FileList) => {
    const newItems: BulkUploadItem[] = Array.from(files).map((file, index) => ({
      id: `bulk-${Date.now()}-${index}`,
      file,
      title: file.name.replace(/\.[^/.]+$/, ''),
      genre: 'Hip-Hop',
      mood: 'Chill',
      tempo: 120,
      key: 'C',
      price: 50,
      licenseType: 'basic',
      status: 'pending',
      progress: 0,
    }));
    setBulkUploadItems([...bulkUploadItems, ...newItems]);
  };

  const handleBulkUpload = async () => {
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

          await apiRequest('POST', '/api/marketplace/upload', formData);

          setBulkUploadItems((prev) =>
            prev.map((i) =>
              i.id === item.id ? { ...i, status: 'completed' as const, progress: 100 } : i
            )
          );
        } catch {
          setBulkUploadItems((prev) =>
            prev.map((i) =>
              i.id === item.id
                ? { ...i, status: 'failed' as const, error: 'Upload failed' }
                : i
            )
          );
        }
      }
    }
    queryClient.invalidateQueries({ queryKey: ['/api/marketplace/my-beats'] });
    toast({ title: 'Bulk Upload Complete', description: 'Your beats have been uploaded.' });
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

  if (!user) return null;

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
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    placeholder="Search beats, producers, genres..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-beats"
                  />
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
          <TabsList className="grid w-full grid-cols-5 lg:grid-cols-11 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <TabsTrigger value="browse" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs">
              Browse
            </TabsTrigger>
            <TabsTrigger value="producers" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs">
              Producers
            </TabsTrigger>
            <TabsTrigger value="my-beats" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs">
              My Beats
            </TabsTrigger>
            <TabsTrigger value="my-store" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs">
              My Store
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
          </TabsList>

          <TabsContent value="browse" className="space-y-6">
            {beatsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {[...Array(12)].map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="p-0">
                      <div className="w-full h-48 bg-gray-200 dark:bg-gray-700 rounded-t-lg"></div>
                      <div className="p-4">
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
                        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : beats.length === 0 ? (
              <Card className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-blue-200 dark:border-blue-800">
                <CardContent className="p-12 text-center">
                  <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Music className="w-12 h-12 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                    No Beats Found
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
                    Try adjusting your search criteria or browse different genres and moods.
                  </p>
                  <Button
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedGenre('');
                      setSelectedMood('');
                    }}
                    className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 px-8 py-3"
                  >
                    <RefreshCw className="w-5 h-5 mr-2" />
                    Clear Filters
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className={`grid gap-6 ${viewMode === 'grid' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1'}`}>
                {beats.map((beat) => (
                  <Card key={beat.id} className="group hover:shadow-xl transition-all duration-300 border border-gray-200 dark:border-gray-700">
                    <CardContent className="p-0">
                      <div className="relative">
                        <div className="w-full h-48 bg-gradient-to-br from-blue-500 to-purple-600 rounded-t-lg flex items-center justify-center">
                          {beat.coverArt ? (
                            <img src={beat.coverArt} alt={beat.title} className="w-full h-full object-cover rounded-t-lg" />
                          ) : (
                            <Music className="w-16 h-16 text-white opacity-50" />
                          )}
                        </div>
                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-200 rounded-t-lg flex items-center justify-center">
                          <Button
                            onClick={() => handlePlayPause(beat.id)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white/20 hover:bg-white/30 text-white border-white/30"
                            size="sm"
                          >
                            {isPlaying === beat.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
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
                            <div className="flex items-center space-x-1">
                              <Heart className="w-3 h-3" />
                              <span>{(beat.likes ?? 0).toLocaleString()}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-gray-900 dark:text-white">${beat.price}</p>
                            <p className="text-xs">Starting from</p>
                          </div>
                        </div>

                        <div className="space-y-2 mb-4">
                          {['basic', 'premium', 'unlimited'].map((license) => (
                            <div key={license} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
                              <div>
                                <p className="text-sm font-medium capitalize">{license}</p>
                                <p className="text-xs text-gray-500">{getLicenseDescription(license)}</p>
                              </div>
                              <div className="flex items-center space-x-2">
                                <span className="text-sm font-semibold">${getLicensePrice(beat, license)}</span>
                                <Button size="sm" onClick={() => handleAddToCart(beat, license)} className="h-8 px-3">
                                  <Plus className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
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
                          {producer.avatarUrl ? (
                            <img 
                              src={producer.avatarUrl} 
                              alt={producer.name || producer.displayName || 'Producer'} 
                              className="w-24 h-24 rounded-full object-cover group-hover:scale-110 transition border-4 border-purple-500/30"
                            />
                          ) : (
                            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold group-hover:scale-110 transition">
                              {(producer.name || producer.displayName)?.substring(0, 2)?.toUpperCase() || 'PR'}
                            </div>
                          )}
                          {producer.verified && (
                            <div className="absolute bottom-0 right-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center border-2 border-white">
                              <CheckCircle className="w-5 h-5 text-white" />
                            </div>
                          )}
                        </div>
                        <div className="text-center w-full">
                          <h4 className="font-bold text-lg group-hover:text-blue-600 transition">{producer.name || producer.displayName}</h4>
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
                            onClick={() => (window.location.href = `/marketplace/producer/${producer.id}`)}
                          >
                            View Profile
                          </Button>
                          <Button variant="outline" size="icon" onClick={() => followProducerMutation.mutate(producer.id)}>
                            <UserPlus className="w-4 h-4" />
                          </Button>
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
              <div className="flex justify-center py-12">
                <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : myBeats.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {myBeats.map((beat: Beat) => (
                  <Card key={beat.id} className="group hover:shadow-xl transition-shadow duration-200">
                    <CardContent className="p-0">
                      <div className="relative aspect-square bg-gradient-to-br from-blue-500 to-purple-600 rounded-t-lg overflow-hidden">
                        {beat.coverArt ? (
                          <img src={beat.coverArt} alt={beat.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <Music className="w-16 h-16 text-white opacity-50" />
                          </div>
                        )}
                      </div>
                      <div className="p-4">
                        <h3 className="font-semibold text-lg mb-1">{beat.title}</h3>
                        <p className="text-sm text-muted-foreground mb-2">{beat.genre}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-lg font-bold">${beat.price}</span>
                          <div className="flex space-x-1">
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
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Music className="w-16 h-16 text-muted-foreground mb-4" />
                  <p className="text-lg font-semibold mb-2">No Beats Uploaded Yet</p>
                  <p className="text-sm text-muted-foreground mb-4">Upload your first beat to get started</p>
                  <Button onClick={() => setShowUploadModal(true)}>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Beat
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="my-store" className="space-y-6">
            <StorefrontBuilder />
          </TabsContent>

          <TabsContent value="purchases">
            {purchasesLoading ? (
              <div className="flex justify-center py-12">
                <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : purchases.length > 0 ? (
              <div className="space-y-4">
                {purchases.map((purchase: Purchase) => (
                  <Card key={purchase.id}>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                            <Music className="w-8 h-8 text-white" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-lg">Beat #{purchase.beatId}</h3>
                            <p className="text-sm text-muted-foreground">{purchase.licenseType} License</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Purchased on {new Date(purchase.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-lg font-bold">${purchase.amount}</span>
                          <Button size="sm" variant="outline">
                            <Download className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <ShoppingCart className="w-16 h-16 text-muted-foreground mb-4" />
                  <p className="text-lg font-semibold mb-2">No Purchases Yet</p>
                  <p className="text-sm text-muted-foreground mb-4">Browse beats to make your first purchase</p>
                  <Button onClick={() => setActiveTab('browse')}>
                    <Music className="w-4 h-4 mr-2" />
                    Browse Beats
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="sales" className="space-y-6">
            <StatCardRow>
              <StatCard
                title="Total Revenue"
                value={salesAnalytics?.totalRevenue || 0}
                change={parseFloat(String(salesAnalytics?.revenueChangePercent || 0))}
                trend={salesAnalytics?.revenueChangePercent > 0 ? 'up' : 'neutral'}
                prefix="$"
                sparklineData={salesAnalytics?.weeklyData?.map((w: { revenue: number }) => w.revenue) ?? []}
                icon={<DollarSign className="h-5 w-5" />}
              />
              <StatCard
                title="Total Sales"
                value={salesAnalytics?.totalSales || 0}
                change={parseFloat(String(salesAnalytics?.salesChangePercent || 0))}
                trend={salesAnalytics?.salesChangePercent > 0 ? 'up' : 'neutral'}
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
              icon={<BarChart3 className="h-5 w-5 text-blue-500" />}
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
                    {salesAnalytics?.topBeats?.length > 0 ? (
                      salesAnalytics.topBeats.map((beat: { title: string; sales: number; revenue: number }, index: number) => (
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
                  <div className="text-center py-8">
                    <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No escrow transactions yet</p>
                  </div>
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
              {LICENSE_TYPES.map((license) => (
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
                        <span className="font-medium">{license.streams === 'unlimited' ? '∞' : (license.streams ?? 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Copies</span>
                        <span className="font-medium">{license.copies === 'unlimited' ? '∞' : (license.copies ?? 0).toLocaleString()}</span>
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
                    <div className="flex flex-wrap gap-1 pt-2 border-t">
                      {license.allowsBroadcast && <Badge variant="outline" className="text-xs">Broadcast</Badge>}
                      {license.allowsProfit && <Badge variant="outline" className="text-xs">For Profit</Badge>}
                      {license.allowsSync && <Badge variant="outline" className="text-xs">Sync</Badge>}
                    </div>
                    <Button variant="outline" className="w-full" onClick={() => setSelectedLicense(license)}>
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
                <Card className="col-span-full">
                  <CardContent className="text-center py-12">
                    <FileSignature className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Contract Templates</h3>
                    <p className="text-muted-foreground mb-4">Create your first contract template to automate licensing</p>
                    <Button onClick={() => setShowContractModal(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Contract Template
                    </Button>
                  </CardContent>
                </Card>
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
                  <div className="text-center py-8">
                    <Handshake className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No collaboration offers yet</p>
                    <Button className="mt-4" onClick={() => setShowCollaborationModal(true)}>
                      Send Your First Offer
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {showPreviewPlayer && currentBeat && (
        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t shadow-lg p-4 z-50">
          <div className="max-w-7xl mx-auto flex items-center space-x-4">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
              {currentBeat.coverArt ? (
                <img src={currentBeat.coverArt} alt={currentBeat.title} className="w-full h-full object-cover rounded-lg" />
              ) : (
                <Music className="w-8 h-8 text-white" />
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
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
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

      <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
              <Label htmlFor="audio">Audio File (MP3, WAV, FLAC, AAC, OGG, M4A, AIFF) *</Label>
              <Input
                id="audio"
                type="file"
                accept="audio/mpeg,audio/wav,audio/flac,audio/aac,audio/ogg,audio/mp4,audio/x-m4a,audio/aiff,audio/webm,.mp3,.wav,.flac,.aac,.ogg,.m4a,.aiff,.aif,.webm"
                onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coverArt">Cover Art (JPG/PNG)</Label>
              <Input
                id="coverArt"
                type="file"
                accept="image/jpeg,image/png,image/jpg"
                onChange={(e) => setCoverArtFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadModal(false)}>Cancel</Button>
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
                if (coverArtFile) formData.append('coverArt', coverArtFile);
                uploadBeatMutation.mutate(formData);
              }}
              disabled={uploadBeatMutation.isPending}
              className="bg-gradient-to-r from-blue-600 to-purple-600"
            >
              {uploadBeatMutation.isPending ? 'Uploading...' : 'Upload Beat'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBulkUploadModal} onOpenChange={setShowBulkUploadModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <FolderUp className="w-5 h-5 mr-2" />
              Bulk Upload
            </DialogTitle>
            <DialogDescription>Upload multiple beats at once with automated metadata</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <UploadCloud className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium mb-2">Drag & drop audio files here</p>
              <p className="text-sm text-muted-foreground mb-4">Supports MP3, WAV, FLAC, AAC, OGG, M4A, AIFF</p>
              <Input
                type="file"
                multiple
                accept="audio/mpeg,audio/wav,audio/flac,audio/aac,audio/ogg,audio/mp4,audio/x-m4a,audio/aiff,audio/webm,.mp3,.wav,.flac,.aac,.ogg,.m4a,.aiff,.aif,.webm"
                onChange={(e) => e.target.files && handleBulkFileSelect(e.target.files)}
                className="hidden"
                id="bulk-upload-input"
              />
              <Button asChild variant="outline">
                <label htmlFor="bulk-upload-input" className="cursor-pointer">
                  Select Files
                </label>
              </Button>
            </div>

            {bulkUploadItems.length > 0 && (
              <ScrollArea className="h-64">
                <div className="space-y-2">
                  {bulkUploadItems.map((item) => (
                    <div key={item.id} className="flex items-center space-x-4 p-3 border rounded-lg">
                      <FileAudio className="w-8 h-8 text-blue-500 flex-shrink-0" />
                      <div className="flex-1">
                        <Input
                          value={item.title}
                          onChange={(e) => setBulkUploadItems(prev =>
                            prev.map(i => i.id === item.id ? { ...i, title: e.target.value } : i)
                          )}
                          className="mb-2"
                        />
                        <div className="flex space-x-2">
                          <Select
                            value={item.genre}
                            onValueChange={(value) => setBulkUploadItems(prev =>
                              prev.map(i => i.id === item.id ? { ...i, genre: value } : i)
                            )}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {BEAT_GENRES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Input
                            type="number"
                            value={item.price}
                            onChange={(e) => setBulkUploadItems(prev =>
                              prev.map(i => i.id === item.id ? { ...i, price: parseInt(e.target.value) } : i)
                            )}
                            className="w-24"
                            placeholder="Price"
                          />
                        </div>
                      </div>
                      <div className="flex-shrink-0 w-32">
                        {item.status === 'pending' && <Badge variant="secondary">Pending</Badge>}
                        {item.status === 'uploading' && <Progress value={item.progress} className="w-full" />}
                        {item.status === 'completed' && <Badge variant="default">Complete</Badge>}
                        {item.status === 'failed' && <Badge variant="destructive">Failed</Badge>}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setBulkUploadItems(prev => prev.filter(i => i.id !== item.id))}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkUploadModal(false)}>Cancel</Button>
            <Button
              onClick={handleBulkUpload}
              disabled={bulkUploadItems.length === 0}
              className="bg-gradient-to-r from-blue-600 to-purple-600"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload {bulkUploadItems.filter(i => i.status === 'pending').length} Beats
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
        <DialogContent className="bg-background">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Edit className="w-5 h-5 mr-2" />
              Edit Beat
            </DialogTitle>
            <DialogDescription>Update your beat details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                placeholder="Beat title"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Genre</Label>
                <Select
                  value={editForm.genre}
                  onValueChange={(value) => setEditForm({ ...editForm, genre: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select genre" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hip-hop">Hip-Hop</SelectItem>
                    <SelectItem value="rnb">R&B</SelectItem>
                    <SelectItem value="pop">Pop</SelectItem>
                    <SelectItem value="trap">Trap</SelectItem>
                    <SelectItem value="drill">Drill</SelectItem>
                    <SelectItem value="afrobeats">Afrobeats</SelectItem>
                    <SelectItem value="reggaeton">Reggaeton</SelectItem>
                    <SelectItem value="rock">Rock</SelectItem>
                    <SelectItem value="electronic">Electronic</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Key</Label>
                <Select
                  value={editForm.key}
                  onValueChange={(value) => setEditForm({ ...editForm, key: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map((key) => (
                      <SelectItem key={key} value={key}>{key}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>BPM</Label>
                <Input
                  type="number"
                  value={editForm.tempo}
                  onChange={(e) => setEditForm({ ...editForm, tempo: parseInt(e.target.value) || 120 })}
                  min={60}
                  max={200}
                />
              </div>
              <div className="space-y-2">
                <Label>Price ($)</Label>
                <Input
                  type="number"
                  value={editForm.price}
                  onChange={(e) => setEditForm({ ...editForm, price: parseFloat(e.target.value) || 0 })}
                  min={0}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                placeholder="Describe your beat..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Tags (comma-separated)</Label>
              <Input
                value={editForm.tags}
                onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                placeholder="dark, melodic, emotional"
              />
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
    </AppLayout>
  );
}
