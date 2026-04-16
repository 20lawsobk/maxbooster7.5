import { useState, useRef, useEffect } from 'react';
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
  DialogFooter,
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
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAnalyticsInvalidation } from '@/hooks/useAnalyticsInvalidation';
import { apiRequest } from '@/lib/queryClient';
import {
  Upload,
  Music,
  Globe,
  Calendar as CalendarIcon,
  Clock,
  MonitorSpeaker,
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
  Crown,
  Sparkles,
  MapPin,
  ListMusic,
  Ticket,
  Film,
  Briefcase,
  Video,
  ShieldCheck,
  Wand2,
  Loader2,
  ImagePlus,
  Mic,
} from 'lucide-react';
import {
  SpotifyIcon,
  AppleMusicIcon,
  YouTubeIcon,
  YouTubeMusicIcon,
  AmazonIcon,
  AmazonMusicIcon,
  iTunesIcon,
  TidalIcon,
  DeezerIcon,
  SoundCloudIcon,
  AudiomackIcon,
  PandoraIcon,
  iHeartRadioIcon,
  NapsterIcon,
  BeatportIcon,
  BandcampIcon,
  TikTokIcon,
  InstagramIcon,
  FacebookIcon,
  SnapchatIcon,
  ShazamIcon,
  NetEaseIcon,
  KuaishouIcon,
  VKIcon,
  MixcloudIcon,
  PelotonIcon,
  TwitchIcon,
  MetaIcon,
  XIcon,
  RobloxIcon,
  LineIcon,
  BilibiliIcon,
  DiscordIcon,
  JioSaavnIcon,
  AnghamiIcon,
  JOOXIcon,
  KKBOXIcon,
  AWAIcon,
  FLOIcon,
  TencentMusicIcon,
  NuudayIcon,
  TrebelIcon,
  MelonIcon,
  YandexMusicIcon,
  GaanaIcon,
  BoomplayIcon,
  TraxsourceIcon,
  QQMusicIcon,
  KugouIcon,
  KuwoIcon,
  RakutenMusicIcon,
  LineMusIcon,
} from '@/components/ui/brand-icons';
import { ReleaseWizard } from '@/components/distribution/ReleaseWizard';
import { AutomatedQC } from '@/components/distribution/AutomatedQC';
import { ISRCManager } from '@/components/distribution/ISRCManager';
import { TakedownManager } from '@/components/distribution/TakedownManager';
import { EarningsReconciliation } from '@/components/distribution/EarningsReconciliation';
import { DataTransferWizard } from '@/components/distribution/DataTransferWizard';
import { RoyaltySplitManager } from '@/components/distribution/RoyaltySplitManager';
import { HyperFollowBuilder } from '@/components/distribution/HyperFollowBuilder';
import { SubmissionStatusTracker } from '@/components/distribution/SubmissionStatusTracker';
import { ContentIDManager } from '@/components/distribution/ContentIDManager';
import ArtistProfileManager from '@/components/distribution/ArtistProfileManager';
import { EmbedCodeGenerator } from '@/components/distribution/EmbedCodeGenerator';

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
  // Collaborators & Splits
  collaborators: {
    name: string;
    email: string;
    role: string;
    percentage: number;
  }[];

  // Legal Confirmations
  rightsConfirmed: boolean;
  contentOriginal: boolean;
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

function getPlatformIcon(slug: string) {
  const iconMap: Record<string, any> = {
    spotify: SpotifyIcon,
    'apple-music': AppleMusicIcon,
    itunes: iTunesIcon,
    'youtube-music': YouTubeMusicIcon,
    youtube: YouTubeIcon,
    'amazon-music': AmazonMusicIcon,
    'amazon-mp3': AmazonMusicIcon,
    amazon: AmazonIcon,
    tidal: TidalIcon,
    deezer: DeezerIcon,
    soundcloud: SoundCloudIcon,
    audiomack: AudiomackIcon,
    pandora: PandoraIcon,
    iheartradio: iHeartRadioIcon,
    'iheartradio-radio': iHeartRadioIcon,
    napster: NapsterIcon,
    beatport: BeatportIcon,
    bandcamp: BandcampIcon,
    tiktok: TikTokIcon,
    instagram: InstagramIcon,
    facebook: FacebookIcon,
    snapchat: SnapchatIcon,
    shazam: ShazamIcon,
    netease: NetEaseIcon,
    'netease-cloud-music': NetEaseIcon,
    kuaishou: KuaishouIcon,
    vk: VKIcon,
    'vk-music': VKIcon,
    mixcloud: MixcloudIcon,
    peloton: PelotonIcon,
    twitch: TwitchIcon,
    meta: MetaIcon,
    twitter: XIcon,
    x: XIcon,
    roblox: RobloxIcon,
    line: LineIcon,
    'line-music': LineMusIcon,
    bilibili: BilibiliIcon,
    discord: DiscordIcon,
    jiosaavn: JioSaavnIcon,
    'jio-saavn': JioSaavnIcon,
    saavn: JioSaavnIcon,
    anghami: AnghamiIcon,
    joox: JOOXIcon,
    kkbox: KKBOXIcon,
    awa: AWAIcon,
    flo: FLOIcon,
    melon: MelonIcon,
    gaana: GaanaIcon,
    boomplay: BoomplayIcon,
    'yandex-music': YandexMusicIcon,
    yandex: YandexMusicIcon,
    'tencent-music': TencentMusicIcon,
    'qq-music': QQMusicIcon,
    kugou: KugouIcon,
    kuwo: KuwoIcon,
    trebel: TrebelIcon,
    nuuday: NuudayIcon,
    rakuten: RakutenMusicIcon,
    'rakuten-music': RakutenMusicIcon,
    traxsource: TraxsourceIcon,
  };
  return iconMap[slug] || Music;
}

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

function PlaylistPitchingContent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isNewPitchOpen, setIsNewPitchOpen] = useState(false);
  
  const { data: pitches = [], isLoading: pitchesLoading } = useQuery<any[]>({
    queryKey: ['/api/playlist-pitching'],
  });

  const { data: stats, isLoading: statsLoading } = useQuery<any>({
    queryKey: ['/api/playlist-pitching/stats'],
  });

  const [newPitchForm, setNewPitchForm] = useState({
    trackTitle: '',
    artistName: '',
    genre: '',
    curatorName: '',
    playlistUrl: '',
    description: '',
    status: 'submitted',
  });

  const createPitchMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', '/api/playlist-pitching', data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Pitch created!' });
      setIsNewPitchOpen(false);
      setNewPitchForm({
        trackTitle: '',
        artistName: '',
        genre: '',
        curatorName: '',
        playlistUrl: '',
        description: '',
        status: 'submitted',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/playlist-pitching'] });
      queryClient.invalidateQueries({ queryKey: ['/api/playlist-pitching/stats'] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Playlist Pitching</h2>
          <p className="text-gray-500">Track your submissions to curators</p>
        </div>
        <Button onClick={() => setIsNewPitchOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Track New Pitch
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Total Pitches" value={statsLoading ? '—' : (stats?.total ?? 0)} icon={<ListMusic className="w-4 h-4" />} />
        <StatCard title="Accepted" value={statsLoading ? '—' : (stats?.accepted ?? 0)} icon={<CheckCircle className="w-4 h-4 text-green-500" />} />
        <StatCard title="Pending" value={statsLoading ? '—' : (stats?.pending ?? 0)} icon={<Clock className="w-4 h-4 text-yellow-500" />} />
        <StatCard title="Conversion" value={statsLoading ? '—' : `${(stats?.conversionRate ?? 0).toFixed(1)}%`} icon={<TrendingUp className="w-4 h-4 text-purple-500" />} />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-gray-50/50 dark:bg-gray-800/50">
                <tr>
                  <th className="p-4 font-medium">Track</th>
                  <th className="p-4 font-medium">Curator</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pitchesLoading ? (
                  <>
                    {[1,2,3].map(i => (
                      <tr key={i} className="border-b">
                        <td className="p-4"><Skeleton className="h-4 w-32 mb-1" /><Skeleton className="h-3 w-20" /></td>
                        <td className="p-4"><Skeleton className="h-4 w-24" /></td>
                        <td className="p-4"><Skeleton className="h-5 w-16 rounded-full" /></td>
                        <td className="p-4"><Skeleton className="h-3 w-20" /></td>
                      </tr>
                    ))}
                  </>
                ) : pitches.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-14 text-center">
                      <Target className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p className="text-gray-600 dark:text-gray-400 font-medium">No pitches tracked yet</p>
                      <p className="text-sm text-gray-400 mt-1">Track every curator, blog, and radio pitch in one place.</p>
                    </td>
                  </tr>
                ) : pitches.map((pitch) => (
                  <tr key={pitch.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
                    <td className="p-4">
                      <div className="font-medium">{pitch.trackTitle}</div>
                      <div className="text-xs text-gray-500">{pitch.artistName}</div>
                    </td>
                    <td className="p-4">{pitch.curatorName}</td>
                    <td className="p-4">
                      <Badge variant="outline">{pitch.status}</Badge>
                    </td>
                    <td className="p-4 text-xs text-gray-500">
                      {new Date(pitch.submittedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isNewPitchOpen} onOpenChange={setIsNewPitchOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Track New Pitch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Track Title</Label>
              <Input 
                value={newPitchForm.trackTitle}
                onChange={(e) => setNewPitchForm({ ...newPitchForm, trackTitle: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Curator Name</Label>
              <Input 
                value={newPitchForm.curatorName}
                onChange={(e) => setNewPitchForm({ ...newPitchForm, curatorName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Playlist URL</Label>
              <Input 
                value={newPitchForm.playlistUrl}
                onChange={(e) => setNewPitchForm({ ...newPitchForm, playlistUrl: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewPitchOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => createPitchMutation.mutate({ ...newPitchForm, submittedAt: new Date().toISOString() })}
              disabled={createPitchMutation.isPending}
            >
              Save Pitch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ShowsContent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newShow, setNewShow] = useState({
    name: "",
    venue: "",
    city: "",
    country: "US",
    date: "",
    capacity: 0,
    ticketUrl: "",
  });

  const { data: shows = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/shows"],
  });

  const { data: stats } = useQuery<any>({
    queryKey: ["/api/shows/stats"],
  });

  const createShowMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/shows", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shows"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shows/stats"] });
      setShowCreateDialog(false);
      setNewShow({ name: "", venue: "", city: "", country: "US", date: "", capacity: 0, ticketUrl: "" });
      toast({ title: "Show created" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Shows & Tours</h2>
          <p className="text-gray-500">Manage your live performances</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Show
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Total Shows" value={stats?.totalShows || 0} icon={<Ticket className="w-4 h-4" />} />
        <StatCard title="Revenue" value={`$${(stats?.totalRevenue || 0).toLocaleString()}`} icon={<DollarSign className="w-4 h-4 text-green-500" />} />
        <StatCard title="Avg. Attendance" value={Math.round(stats?.avgTicketsSold || 0)} icon={<Users className="w-4 h-4 text-blue-500" />} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <>
            {[1,2,3].map(i => (
              <Card key={i} className="p-6 space-y-3">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-8 w-24 mt-2" />
              </Card>
            ))}
          </>
        ) : shows.length === 0 ? (
          <Card className="col-span-full p-16 text-center">
            <Ticket className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">No shows scheduled yet</p>
            <p className="text-sm text-gray-500 mb-6">Add your first show to start tracking ticket sales, revenue, and attendance.</p>
            <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Add Your First Show
            </Button>
          </Card>
        ) : shows.map((show) => (
          <Card key={show.id}>
            <CardHeader>
              <CardTitle className="text-lg">{show.name}</CardTitle>
              <p className="text-sm text-gray-500">{show.venue}, {show.city}</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                <CalendarIcon className="w-4 h-4" />
                {new Date(show.date).toLocaleDateString()}
              </div>
              <Button variant="outline" className="w-full" asChild>
                <a href={show.ticketUrl || "#"} target="_blank" rel="noopener noreferrer">View Tickets</a>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <VenueBookingCRM />

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Show</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Show Name</Label>
              <Input value={newShow.name} onChange={(e) => setNewShow({...newShow, name: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Venue</Label>
                <Input value={newShow.venue} onChange={(e) => setNewShow({...newShow, venue: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="datetime-local" value={newShow.date} onChange={(e) => setNewShow({...newShow, date: e.target.value})} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button 
              onClick={() => createShowMutation.mutate(newShow)}
              disabled={createShowMutation.isPending}
            >
              Add Show
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VenueBookingCRM() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [newVenue, setNewVenue] = useState({ venueName: '', city: '', state: '', capacity: '', contactName: '', contactEmail: '', status: 'prospect', notes: '' });

  const { data: venues = [], isLoading } = useQuery<any[]>({ queryKey: ['/api/venues'] });
  const { data: stats } = useQuery<any>({ queryKey: ['/api/venues/stats'] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/venues', { ...data, capacity: data.capacity ? parseInt(data.capacity) : undefined });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/venues'] });
      queryClient.invalidateQueries({ queryKey: ['/api/venues/stats'] });
      setIsOpen(false);
      setNewVenue({ venueName: '', city: '', state: '', capacity: '', contactName: '', contactEmail: '', status: 'prospect', notes: '' });
      toast({ title: 'Venue Added', description: 'Venue contact saved to your booking CRM' });
    },
  });

  const statusColor: Record<string, string> = {
    prospect: 'bg-gray-100 text-gray-700',
    contacted: 'bg-blue-100 text-blue-700',
    negotiating: 'bg-yellow-100 text-yellow-700',
    booked: 'bg-green-100 text-green-700',
    completed: 'bg-purple-100 text-purple-700',
    declined: 'bg-red-100 text-red-700',
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="w-5 h-5 text-purple-600" />
          Venue & Booking CRM
        </CardTitle>
        <div className="flex items-center gap-3">
          <div className="flex gap-4 text-sm text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />{stats?.contacted || 0} Contacted</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />{stats?.booked || 0} Booked</span>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" />Add Venue</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Venue Contact</DialogTitle><DialogDescription>Track a venue for booking outreach</DialogDescription></DialogHeader>
              <div className="space-y-3 py-2">
                <div><Label>Venue Name *</Label><Input placeholder="Madison Square Garden" value={newVenue.venueName} onChange={(e) => setNewVenue({...newVenue, venueName: e.target.value})} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>City</Label><Input placeholder="New York" value={newVenue.city} onChange={(e) => setNewVenue({...newVenue, city: e.target.value})} /></div>
                  <div><Label>State</Label><Input placeholder="NY" value={newVenue.state} onChange={(e) => setNewVenue({...newVenue, state: e.target.value})} /></div>
                </div>
                <div><Label>Capacity</Label><Input type="number" placeholder="5000" value={newVenue.capacity} onChange={(e) => setNewVenue({...newVenue, capacity: e.target.value})} /></div>
                <div><Label>Booking Contact</Label><Input placeholder="Jane Smith" value={newVenue.contactName} onChange={(e) => setNewVenue({...newVenue, contactName: e.target.value})} /></div>
                <div><Label>Contact Email</Label><Input type="email" placeholder="booking@venue.com" value={newVenue.contactEmail} onChange={(e) => setNewVenue({...newVenue, contactEmail: e.target.value})} /></div>
                <div><Label>Notes</Label><Input placeholder="Best venue for hip-hop shows..." value={newVenue.notes} onChange={(e) => setNewVenue({...newVenue, notes: e.target.value})} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                <Button onClick={() => createMutation.mutate(newVenue)} disabled={!newVenue.venueName || createMutation.isPending}>Save Venue</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2 py-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="space-y-1">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-8 w-20" />
              </div>
            ))}
          </div>
        ) : venues.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <MapPin className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No venues tracked yet. Add venue contacts to manage your booking pipeline.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {venues.map((v: any) => (
              <div key={v.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 transition-colors">
                <div>
                  <p className="font-medium text-sm">{v.venueName}</p>
                  <p className="text-xs text-gray-500">{[v.city, v.state].filter(Boolean).join(', ')}{v.capacity ? ` · Cap: ${v.capacity.toLocaleString()}` : ''}</p>
                  {v.contactName && <p className="text-xs text-gray-400 mt-0.5">Contact: {v.contactName}{v.contactEmail ? ` · ${v.contactEmail}` : ''}</p>}
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusColor[v.status] || statusColor.prospect}`}>{v.status}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SyncLicensingContent() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: catalog = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/sync-licensing'],
  });

  const { data: stats } = useQuery<any>({
    queryKey: ['/api/sync-licensing/stats'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/sync-licensing', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sync-licensing'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sync-licensing/stats'] });
      setIsDialogOpen(false);
      toast({ title: 'Success', description: 'Track added to sync catalog' });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());
    createMutation.mutate({
      ...data,
      bpm: data.bpm ? parseInt(data.bpm as string) : undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Sync Licensing</h2>
          <p className="text-gray-500">Put Your Music in TV, Film & Ads</p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add to Catalog
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Catalog Size" value={stats?.totalTracks || 0} icon={<Music className="w-4 h-4" />} />
        <StatCard title="Licensed" value={stats?.licensedCount || 0} icon={<CheckCircle className="w-4 h-4 text-green-500" />} />
        <StatCard title="Revenue" value={`$${stats?.revenue || 0}`} icon={<DollarSign className="w-4 h-4 text-purple-500" />} />
        <StatCard title="Pending" value={stats?.pendingCount || 0} icon={<Clock className="w-4 h-4 text-yellow-500" />} />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-gray-50/50 dark:bg-gray-800/50">
                <tr>
                  <th className="p-4 font-medium">Track</th>
                  <th className="p-4 font-medium">Genre/Mood</th>
                  <th className="p-4 font-medium">Usage Type</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4 font-medium">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading ? (
                  <>
                    {[1,2,3].map(i => (
                      <tr key={i} className="border-b">
                        <td className="p-4"><Skeleton className="h-4 w-32 mb-1" /><Skeleton className="h-3 w-20" /></td>
                        <td className="p-4"><Skeleton className="h-4 w-20 mb-1" /><Skeleton className="h-3 w-16" /></td>
                        <td className="p-4"><Skeleton className="h-4 w-24" /></td>
                        <td className="p-4"><Skeleton className="h-5 w-16 rounded-full" /></td>
                        <td className="p-4"><Skeleton className="h-4 w-14" /></td>
                      </tr>
                    ))}
                  </>
                ) : catalog.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-14 text-center">
                      <Music className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p className="text-gray-600 dark:text-gray-400 font-medium">No tracks in your catalog yet</p>
                      <p className="text-sm text-gray-400 mt-1">Distribute your first release to see tracks appear here.</p>
                    </td>
                  </tr>
                ) : catalog.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
                    <td className="p-4">
                      <div className="font-medium">{item.trackTitle}</div>
                      <div className="text-xs text-gray-500">{item.artistName}</div>
                    </td>
                    <td className="p-4">
                      <div>{item.genre}</div>
                      <div className="text-xs text-gray-500">{item.mood}</div>
                    </td>
                    <td className="p-4">{item.usageType}</td>
                    <td className="p-4">
                      <Badge variant="outline">{item.status}</Badge>
                    </td>
                    <td className="p-4">${item.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Track to Sync Catalog</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="trackTitle">Track Title</Label>
              <Input id="trackTitle" name="trackTitle" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="genre">Genre</Label>
                <Input id="genre" name="genre" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="price">Price ($)</Label>
                <Input id="price" name="price" type="number" step="0.01" />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={createMutation.isPending}>
              Add Track
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
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

export default function Distribution() {
  const { user, isLoading } = useRequireSubscription();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { invalidateOnDistributionChange } = useAnalyticsInvalidation();
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const albumArtRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState('releases');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isHyperFollowOpen, setIsHyperFollowOpen] = useState(false);
  const [showReleaseDetails, setShowReleaseDetails] = useState(false);
  const [showEditRelease, setShowEditRelease] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);
  const [editReleaseForm, setEditReleaseForm] = useState({
    title: '',
    artistName: '',
    releaseDate: '',
    primaryGenre: '',
  });

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
    collaborators: [],
    rightsConfirmed: false,
    contentOriginal: false,
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
  const { data: releases = [], isLoading: releasesLoading} = useQuery<Release[]>({
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

  const { data: platformsResponse, isLoading: platformsLoading } = useQuery<{ platforms: PlatformData[] }>({
    queryKey: ['/api/distribution/platforms'],
    enabled: !!user,
  });

  const platformsData = platformsResponse?.platforms || [];

  const DISTRO_PLATFORMS: DistroPlatform[] = Array.from(
    new Map(
      platformsData.map((platform) => {
        const platformEarning = platformEarnings.find((p) => p.platform === platform.name);
        return [
          platform.slug,
          {
            ...platform,
            id: platform.slug,
            icon: getPlatformIcon(platform.slug),
            color: getPlatformColor(platform.slug),
            earnings: platformEarning?.amount ?? 0,
          },
        ];
      })
    ).values()
  );

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
        collaborators: [],
      });
      queryClient.invalidateQueries({ queryKey: ['/api/distribution/releases'] });
      invalidateOnDistributionChange();
    },
    onError: (error: Error) => {
      toast({
        title: 'Upload failed',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const updateReleaseMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest('PATCH', `/api/distribution/releases/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Release Updated',
        description: 'Your release has been updated successfully.',
      });
      setShowEditRelease(false);
      setSelectedRelease(null);
      queryClient.invalidateQueries({ queryKey: ['/api/distribution/releases'] });
      invalidateOnDistributionChange();
    },
    onError: (error: Error) => {
      toast({
        title: 'Update Failed',
        description: error?.message || 'Failed to update release.',
        variant: 'destructive',
      });
    },
  });

  const deleteReleaseMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/distribution/releases/${id}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Release Deleted',
        description: 'Your release has been removed.',
      });
      setShowDeleteConfirm(false);
      setSelectedRelease(null);
      queryClient.invalidateQueries({ queryKey: ['/api/distribution/releases'] });
      invalidateOnDistributionChange();
    },
    onError: (error: Error) => {
      toast({
        title: 'Delete Failed',
        description: error?.message || 'Failed to delete release.',
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
      invalidateOnDistributionChange();
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
      invalidateOnDistributionChange();
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
      invalidateOnDistributionChange();
    },
  });

  const { data: uploadSessionStatus } = useQuery<UploadSessionStatus | null>({
    queryKey: ['/api/distribution/upload', activeSessionId, 'status'],
    enabled: !!activeSessionId && !isPaused,
    refetchInterval: 5000,
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
            (release.metadata as any)?.artistName || release.artistName || 'Unknown Artist',
            (release.metadata as any)?.primaryGenre || release.genre || 'N/A',
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

  if (!user) return null;

return (
    <AppLayout>
      {isLoading ? (
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
      ) : (
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
                value="releases"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white whitespace-nowrap"
                data-testid="tab-releases"
              >
                My Releases
              </TabsTrigger>
              <TabsTrigger
                value="artist-profiles"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white whitespace-nowrap"
                data-testid="tab-artist-profiles"
              >
                <Music2 className="w-4 h-4 mr-1" />
                Artist Profiles
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
                value="hyperfollow"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white whitespace-nowrap"
                data-testid="tab-hyperfollow"
              >
                Pre-Save
              </TabsTrigger>
              <TabsTrigger
                value="share-embed"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white whitespace-nowrap"
                data-testid="tab-share-embed"
              >
                <Share2 className="w-4 h-4 mr-1" />
                Share & Embed
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
              <TabsTrigger
                value="transfer"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white whitespace-nowrap"
                data-testid="tab-transfer"
              >
                <Link2 className="w-4 h-4 mr-1" />
                Data Transfer
              </TabsTrigger>
              <TabsTrigger
                value="submission-status"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white whitespace-nowrap"
                data-testid="tab-submission-status"
              >
                <Globe className="w-4 h-4 mr-1" />
                Status
              </TabsTrigger>
              <TabsTrigger
                value="content-id"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white whitespace-nowrap"
                data-testid="tab-content-id"
              >
                <Shield className="w-4 h-4 mr-1" />
                Content ID
              </TabsTrigger>
              <TabsTrigger
                value="playlist-pitching"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white whitespace-nowrap"
                data-testid="tab-playlist-pitching"
              >
                <ListMusic className="w-4 h-4 mr-1" />
                Playlist Pitching
              </TabsTrigger>
              <TabsTrigger
                value="shows"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white whitespace-nowrap"
                data-testid="tab-shows"
              >
                <Ticket className="w-4 h-4 mr-1" />
                Shows & Tours
              </TabsTrigger>
              <TabsTrigger
                value="sync-licensing"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white whitespace-nowrap"
                data-testid="tab-sync-licensing"
              >
                <Film className="w-4 h-4 mr-1" />
                Sync Licensing
              </TabsTrigger>
              <TabsTrigger
                value="a-and-r"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white whitespace-nowrap"
                data-testid="tab-a-and-r"
              >
                <Briefcase className="w-4 h-4 mr-1" />
                A&R Submissions
              </TabsTrigger>
              <TabsTrigger
                value="sample-clearance"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white whitespace-nowrap"
                data-testid="tab-sample-clearance"
              >
                <ShieldCheck className="w-4 h-4 mr-1" />
                Sample Clearance
              </TabsTrigger>
              <TabsTrigger
                value="music-videos"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white whitespace-nowrap"
                data-testid="tab-music-videos"
              >
                <Video className="w-4 h-4 mr-1" />
                Music Videos
              </TabsTrigger>
            </TabsList>
          </div>

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
                            {(release.metadata as any)?.artistName || release.artistName || '—'}
                          </p>
                          <div className="flex items-center space-x-2">
                            {(release.metadata as any)?.releaseType && (
                              <Badge variant="outline" className="text-xs capitalize">
                                {(release.metadata as any).releaseType}
                              </Badge>
                            )}
                            {(release.metadata as any)?.primaryGenre && (
                              <Badge variant="outline" className="text-xs">
                                {(release.metadata as any).primaryGenre}
                              </Badge>
                            )}
                            {((release.metadata as any)?.isExplicit || release.isExplicit) && (
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
                            <span>
                              {release.releaseDate
                                ? new Date(release.releaseDate).toLocaleDateString()
                                : 'No date set'}
                            </span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Globe className="w-4 h-4" />
                            <span>{(release.metadata as any)?.upcCode || release.upcCode || '—'}</span>
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
                              setEditReleaseForm({
                                title: release.title,
                                artistName: (release.metadata as any)?.artistName || release.artistName || '',
                                releaseDate: release.releaseDate ? new Date(release.releaseDate).toISOString().split('T')[0] : '',
                                primaryGenre: (release.metadata as any)?.primaryGenre || '',
                              });
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
                              setSelectedRelease(release);
                              setShowDeleteConfirm(true);
                            }}
                            data-testid={`button-delete-release-${release.id}`}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
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

          {/* Artist Profiles Tab */}
          <TabsContent value="artist-profiles" className="space-y-6">
            <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center text-gray-900 dark:text-white">
                  <Music2 className="w-5 h-5 mr-2 text-blue-600" />
                  Artist Identity Management
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Store your Spotify URI, Apple Artist ID, YouTube Channel ID and more so every release
                  lands on the correct streaming page — not a duplicate. Use the Looker-Upper to find IDs
                  and the Fixer if a release was misattributed.
                </p>
              </CardHeader>
              <CardContent>
                <ArtistProfileManager />
              </CardContent>
            </Card>
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
                invalidateOnDistributionChange();
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
                      <div className="flex flex-col items-center justify-center py-10 text-center">
                        <BarChart3 className="w-10 h-10 mb-3 text-gray-300" />
                        <p className="text-sm font-medium text-gray-500">No streaming trends yet</p>
                        <p className="text-xs text-gray-400 mt-1">Trend data will appear as your releases accumulate streams.</p>
                      </div>
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
                    <div className="col-span-full flex flex-col items-center justify-center py-10 text-center">
                      <MapPin className="w-10 h-10 mb-3 text-gray-300" />
                      <p className="text-sm font-medium text-gray-500">No geographic data yet</p>
                      <p className="text-xs text-gray-400 mt-1">Listener locations will appear here once your music is streaming.</p>
                    </div>
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
                          : <span className="text-purple-500/70">Pending</span>}
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
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <PieChart className="w-10 h-10 mb-3 text-gray-300" />
                      <p className="text-sm font-medium text-gray-500">No earnings data yet</p>
                      <p className="text-xs text-gray-400 mt-1">Platform earnings will appear here once your first royalty cycle completes.</p>
                    </div>
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
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <Banknote className="w-10 h-10 mb-3 text-gray-300" />
                      <p className="text-sm font-medium text-gray-500">No payouts yet</p>
                      <p className="text-xs text-gray-400 mt-1">Your first payout will appear here once earnings reach the minimum threshold.</p>
                    </div>
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

          {/* Share & Embed Tab */}
          <TabsContent value="share-embed" className="space-y-6">
            <EmbedCodeGenerator />
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

          {/* Data Transfer Tab */}
          <TabsContent value="transfer" className="space-y-6">
            <DataTransferWizard />
          </TabsContent>

          {/* Submission Status Tab */}
          <TabsContent value="submission-status" className="space-y-6">
            {selectedRelease ? (
              <SubmissionStatusTracker
                releaseId={selectedRelease.id}
                releaseTitle={selectedRelease.title}
                onRetry={(platform) => {
                  toast({
                    title: 'Retry Initiated',
                    description: `Retrying submission to ${platform}...`,
                  });
                }}
              />
            ) : releases.length > 0 ? (
              <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                <CardHeader>
                  <CardTitle className="flex items-center text-gray-900 dark:text-white">
                    <Globe className="w-5 h-5 mr-2 text-blue-600" />
                    Submission Status Tracker
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-500 dark:text-gray-400 mb-4">
                    Select a release to view its submission status across platforms.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {releases.slice(0, 6).map((release: Release) => (
                      <Card
                        key={release.id}
                        className="cursor-pointer hover:shadow-lg transition-shadow"
                        onClick={() => setSelectedRelease(release)}
                      >
                        <CardContent className="p-4 flex items-center gap-4">
                          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                            <Music className="w-6 h-6 text-white" />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium">{release.title}</p>
                            <p className="text-sm text-muted-foreground">{(release.metadata as any)?.artistName || release.artistName || '—'}</p>
                          </div>
                          <Badge
                            variant={release.status === 'live' ? 'default' : release.status === 'processing' ? 'secondary' : 'outline'}
                          >
                            {release.status}
                          </Badge>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-white dark:bg-gray-800">
                <CardContent className="p-12 text-center">
                  <Globe className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Releases Yet</h3>
                  <p className="text-gray-500 mb-4">Create a release to track its submission status.</p>
                  <Button onClick={() => setActiveTab('new-release')}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Release
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Content ID Tab */}
          <TabsContent value="content-id" className="space-y-6">
            {selectedRelease ? (
              <ContentIDManager
                releaseId={selectedRelease.id}
                tracks={(selectedRelease.tracksData || []).map((t: Track) => ({
                  id: t.id,
                  title: t.title,
                  audioUrl: t.audioFile,
                }))}
                onComplete={() => {
                  toast({
                    title: 'Content ID Complete',
                    description: 'All tracks have been registered for Content ID protection.',
                  });
                }}
              />
            ) : releases.length > 0 ? (
              <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                <CardHeader>
                  <CardTitle className="flex items-center text-gray-900 dark:text-white">
                    <Shield className="w-5 h-5 mr-2 text-green-600" />
                    Content ID Protection
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-500 dark:text-gray-400 mb-4">
                    Select a release to manage Content ID protection for its tracks.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {releases.slice(0, 6).map((release: Release) => (
                      <Card
                        key={release.id}
                        className="cursor-pointer hover:shadow-lg transition-shadow"
                        onClick={() => setSelectedRelease(release)}
                      >
                        <CardContent className="p-4 flex items-center gap-4">
                          <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-teal-600 rounded-lg flex items-center justify-center">
                            <Shield className="w-6 h-6 text-white" />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium">{release.title}</p>
                            <p className="text-sm text-muted-foreground">
                              {(release.tracksData || []).length} track(s)
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-white dark:bg-gray-800">
                <CardContent className="p-12 text-center">
                  <Shield className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Releases Yet</h3>
                  <p className="text-gray-500 mb-4">Create a release to protect your content.</p>
                  <Button onClick={() => setActiveTab('new-release')}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Release
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>


          {/* Playlist Pitching Tab */}
          <TabsContent value="playlist-pitching" className="space-y-6">
            <PlaylistPitchingContent />
          </TabsContent>

          {/* Shows & Tours Tab */}
          <TabsContent value="shows" className="space-y-6">
            <ShowsContent />
          </TabsContent>

          {/* Sync Licensing Tab */}
          <TabsContent value="sync-licensing" className="space-y-6">
            <SyncLicensingContent />
          </TabsContent>

          <TabsContent value="a-and-r" className="space-y-6">
            <ARSubmissionsContent />
          </TabsContent>

          <TabsContent value="sample-clearance" className="space-y-6">
            <SampleClearanceContent />
          </TabsContent>

          <TabsContent value="music-videos" className="space-y-6">
            <MusicVideosContent />
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
                    <div className="flex items-center justify-between">
                      <Label>Select Distribution Platforms ({uploadForm.selectedPlatforms.length} of {DISTRO_PLATFORMS.length} selected)</Label>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setUploadForm((prev) => ({
                              ...prev,
                              selectedPlatforms: DISTRO_PLATFORMS.map((p) => p.id),
                            }))
                          }
                        >
                          Select All
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setUploadForm((prev) => ({ ...prev, selectedPlatforms: [] }))
                          }
                        >
                          Clear All
                        </Button>
                      </div>
                    </div>
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

                  <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-700 space-y-4">
                    <div className="flex items-start space-x-3">
                      <Shield className="w-5 h-5 text-blue-600 mt-0.5" />
                      <div>
                        <p className="font-semibold text-blue-800 dark:text-blue-200">
                          Rights Confirmation Required
                        </p>
                        <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                          Please confirm the following before submitting your release:
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3 ml-8">
                      <div className="flex items-start space-x-3">
                        <Checkbox
                          id="rights-confirmed"
                          checked={uploadForm.rightsConfirmed}
                          onCheckedChange={(checked) =>
                            setUploadForm((prev) => ({ ...prev, rightsConfirmed: checked as boolean }))
                          }
                          data-testid="checkbox-rights-confirmed"
                        />
                        <Label htmlFor="rights-confirmed" className="text-sm leading-tight cursor-pointer">
                          I confirm that I own or have obtained all necessary rights, licenses, and permissions 
                          to distribute this content. I have cleared all samples, interpolations, and third-party 
                          elements. I have mechanical licenses for any cover songs.
                        </Label>
                      </div>

                      <div className="flex items-start space-x-3">
                        <Checkbox
                          id="content-original"
                          checked={uploadForm.contentOriginal}
                          onCheckedChange={(checked) =>
                            setUploadForm((prev) => ({ ...prev, contentOriginal: checked as boolean }))
                          }
                          data-testid="checkbox-content-original"
                        />
                        <Label htmlFor="content-original" className="text-sm leading-tight cursor-pointer">
                          I understand that submitting content I don't have rights to may result in takedowns, 
                          legal liability, and account termination. I agree to the{' '}
                          <a href="/terms" target="_blank" className="text-blue-600 hover:underline">
                            Terms of Service
                          </a>{' '}
                          including the indemnification clause.
                        </Label>
                      </div>
                    </div>

                    {(!uploadForm.rightsConfirmed || !uploadForm.contentOriginal) && (
                      <p className="text-xs text-blue-600 dark:text-blue-400 ml-8">
                        You must confirm both statements above to submit your release.
                      </p>
                    )}
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
                  disabled={
                    uploadReleaseMutation.isPending ||
                    (currentStep === 5 && (!uploadForm.rightsConfirmed || !uploadForm.contentOriginal))
                  }
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

        {/* View Release Detail Dialog */}
        <Dialog open={showReleaseDetails} onOpenChange={setShowReleaseDetails}>
          <DialogContent className="sm:max-w-lg bg-white dark:bg-gray-800">
            <DialogHeader>
              <DialogTitle className="text-xl">{selectedRelease?.title}</DialogTitle>
              <DialogDescription>Full release details</DialogDescription>
            </DialogHeader>
            {selectedRelease && (
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide mb-1">Artist</p>
                    <p className="font-medium">{(selectedRelease.metadata as any)?.artistName || '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide mb-1">Status</p>
                    <Badge variant={selectedRelease.status === 'live' ? 'default' : 'secondary'} className="capitalize">
                      {selectedRelease.status}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide mb-1">Release Type</p>
                    <p className="font-medium capitalize">{(selectedRelease.metadata as any)?.releaseType || '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide mb-1">Genre</p>
                    <p className="font-medium">{(selectedRelease.metadata as any)?.primaryGenre || '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide mb-1">Release Date</p>
                    <p className="font-medium">
                      {selectedRelease.releaseDate
                        ? new Date(selectedRelease.releaseDate).toLocaleDateString()
                        : 'Not scheduled'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide mb-1">Language</p>
                    <p className="font-medium">{(selectedRelease.metadata as any)?.language || '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide mb-1">Copyright Owner</p>
                    <p className="font-medium">{(selectedRelease.metadata as any)?.copyrightOwner || '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide mb-1">Copyright Year</p>
                    <p className="font-medium">{(selectedRelease.metadata as any)?.copyrightYear || '—'}</p>
                  </div>
                </div>
                {(selectedRelease.metadata as any)?.selectedPlatforms?.length > 0 && (
                  <div>
                    <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide mb-2">Platforms</p>
                    <div className="flex flex-wrap gap-1">
                      {(selectedRelease.metadata as any).selectedPlatforms.map((p: string) => (
                        <Badge key={p} variant="outline" className="text-xs capitalize">{p}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {(selectedRelease.metadata as any)?.labelName && (
                  <div>
                    <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide mb-1">Label</p>
                    <p className="font-medium">{(selectedRelease.metadata as any).labelName}</p>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowReleaseDetails(false)}>Close</Button>
              <Button onClick={() => {
                setShowReleaseDetails(false);
                if (selectedRelease) {
                  setEditReleaseForm({
                    title: selectedRelease.title,
                    artistName: (selectedRelease.metadata as any)?.artistName || '',
                    releaseDate: selectedRelease.releaseDate ? new Date(selectedRelease.releaseDate).toISOString().split('T')[0] : '',
                    primaryGenre: (selectedRelease.metadata as any)?.primaryGenre || '',
                  });
                  setShowEditRelease(true);
                }
              }}>
                <Edit className="w-4 h-4 mr-2" />
                Edit Release
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Release Dialog */}
        <Dialog open={showEditRelease} onOpenChange={setShowEditRelease}>
          <DialogContent className="sm:max-w-md bg-white dark:bg-gray-800">
            <DialogHeader>
              <DialogTitle>Edit Release</DialogTitle>
              <DialogDescription>
                Update your release details below.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-title">Title</Label>
                <Input
                  id="edit-title"
                  value={editReleaseForm.title}
                  onChange={(e) => setEditReleaseForm({ ...editReleaseForm, title: e.target.value })}
                  placeholder="Release title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-artist">Artist Name</Label>
                <Input
                  id="edit-artist"
                  value={editReleaseForm.artistName}
                  onChange={(e) => setEditReleaseForm({ ...editReleaseForm, artistName: e.target.value })}
                  placeholder="Artist name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-date">Release Date</Label>
                <Input
                  id="edit-date"
                  type="date"
                  value={editReleaseForm.releaseDate}
                  onChange={(e) => setEditReleaseForm({ ...editReleaseForm, releaseDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-genre">Primary Genre</Label>
                <Select
                  value={editReleaseForm.primaryGenre}
                  onValueChange={(value) => setEditReleaseForm({ ...editReleaseForm, primaryGenre: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select genre" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hip-hop">Hip-Hop/Rap</SelectItem>
                    <SelectItem value="pop">Pop</SelectItem>
                    <SelectItem value="rnb">R&B/Soul</SelectItem>
                    <SelectItem value="rock">Rock</SelectItem>
                    <SelectItem value="electronic">Electronic</SelectItem>
                    <SelectItem value="country">Country</SelectItem>
                    <SelectItem value="jazz">Jazz</SelectItem>
                    <SelectItem value="classical">Classical</SelectItem>
                    <SelectItem value="latin">Latin</SelectItem>
                    <SelectItem value="alternative">Alternative</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditRelease(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (selectedRelease) {
                    updateReleaseMutation.mutate({
                      id: selectedRelease.id,
                      data: {
                        title: editReleaseForm.title,
                        artistName: editReleaseForm.artistName,
                        releaseDate: editReleaseForm.releaseDate,
                        primaryGenre: editReleaseForm.primaryGenre,
                      },
                    });
                  }
                }}
                disabled={updateReleaseMutation.isPending}
              >
                {updateReleaseMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Release Confirmation */}
        <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <AlertDialogContent className="bg-white dark:bg-gray-800">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Release</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{selectedRelease?.title}"? This action cannot be undone
                and will initiate a takedown from all platforms if the release is already live.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (selectedRelease) {
                    deleteReleaseMutation.mutate(selectedRelease.id);
                  }
                }}
                className="bg-red-600 hover:bg-red-700"
              >
                {deleteReleaseMutation.isPending ? 'Deleting...' : 'Delete Release'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      )}
    </AppLayout>
  );
}

// ============================================================================
// A&R SUBMISSIONS CONTENT
// ============================================================================

function ARSubmissionsContent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [newSubmission, setNewSubmission] = useState({
    trackTitle: '', labelName: '', contactName: '', contactEmail: '', contactRole: '',
    submissionMethod: 'email', demoUrl: '', notes: '', priority: 'medium',
  });

  const { data: submissions = [], isLoading } = useQuery<any[]>({ queryKey: ['/api/label-submissions'] });
  const { data: stats } = useQuery<any>({ queryKey: ['/api/label-submissions/stats'] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => { const res = await apiRequest('POST', '/api/label-submissions', data); return res.json(); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/label-submissions'] });
      setIsNewOpen(false);
      setNewSubmission({ trackTitle: '', labelName: '', contactName: '', contactEmail: '', contactRole: '', submissionMethod: 'email', demoUrl: '', notes: '', priority: 'medium' });
      toast({ title: 'Submission Added', description: 'Label submission tracked successfully.' });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: any) => { const res = await apiRequest('PUT', `/api/label-submissions/${id}`, { status }); return res.json(); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/label-submissions'] }),
  });

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    submitted: 'bg-blue-100 text-blue-700',
    under_review: 'bg-yellow-100 text-yellow-700',
    following_up: 'bg-orange-100 text-orange-700',
    accepted: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    declined: 'bg-red-100 text-red-700',
  };

  const priorityColors: Record<string, string> = {
    low: 'bg-gray-100 text-gray-600',
    medium: 'bg-yellow-100 text-yellow-700',
    high: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Submitted', value: stats?.total || 0, icon: <Briefcase className="w-5 h-5" /> },
          { label: 'Pending Response', value: stats?.pending || 0, icon: <AlertCircle className="w-5 h-5 text-yellow-500" /> },
          { label: 'Accepted', value: stats?.accepted || 0, icon: <CheckCircle className="w-5 h-5 text-green-500" /> },
          { label: 'Conversion Rate', value: `${stats?.conversionRate || 0}%`, icon: <TrendingUp className="w-5 h-5 text-blue-500" /> },
        ].map((stat, i) => (
          <Card key={i}><CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">{stat.icon}</div>
            <div><p className="text-xs text-gray-500">{stat.label}</p><p className="text-xl font-bold">{stat.value}</p></div>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><Briefcase className="w-5 h-5 text-blue-600" />A&R & Label Submissions</CardTitle>
            <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
              <DialogTrigger asChild><Button size="sm" className="gradient-bg"><Plus className="w-4 h-4 mr-1" />Track Submission</Button></DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Track Label Submission</DialogTitle><DialogDescription>Log a music submission to a label or A&R contact</DialogDescription></DialogHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Track Title</Label><Input placeholder="Song name" value={newSubmission.trackTitle} onChange={(e) => setNewSubmission({...newSubmission, trackTitle: e.target.value})} /></div>
                    <div><Label>Label / Company</Label><Input placeholder="Label name" value={newSubmission.labelName} onChange={(e) => setNewSubmission({...newSubmission, labelName: e.target.value})} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Contact Name</Label><Input placeholder="A&R rep name" value={newSubmission.contactName} onChange={(e) => setNewSubmission({...newSubmission, contactName: e.target.value})} /></div>
                    <div><Label>Contact Email</Label><Input type="email" placeholder="email@label.com" value={newSubmission.contactEmail} onChange={(e) => setNewSubmission({...newSubmission, contactEmail: e.target.value})} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Role</Label><Input placeholder="A&R Director, Manager..." value={newSubmission.contactRole} onChange={(e) => setNewSubmission({...newSubmission, contactRole: e.target.value})} /></div>
                    <div><Label>Priority</Label>
                      <Select value={newSubmission.priority} onValueChange={(v) => setNewSubmission({...newSubmission, priority: v})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div><Label>Demo / Stream Link</Label><Input placeholder="SoundCloud, Drive, etc." value={newSubmission.demoUrl} onChange={(e) => setNewSubmission({...newSubmission, demoUrl: e.target.value})} /></div>
                  <div><Label>Notes</Label><Textarea placeholder="Any additional context..." value={newSubmission.notes} onChange={(e) => setNewSubmission({...newSubmission, notes: e.target.value})} className="h-20" /></div>
                  <Button className="w-full gradient-bg" onClick={() => createMutation.mutate(newSubmission)} disabled={!newSubmission.trackTitle || !newSubmission.labelName || createMutation.isPending}>
                    {createMutation.isPending ? 'Saving...' : 'Track Submission'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3 py-2">
              {[1,2,3].map(i => (
                <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                  <Skeleton className="h-8 w-28 ml-4" />
                </div>
              ))}
            </div>
          ) : submissions.length === 0 ? (
            <div className="text-center py-12">
              <Briefcase className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500">No submissions tracked yet.</p>
              <p className="text-sm text-gray-400 mt-1">Start tracking your label submissions and A&R outreach.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {submissions.map((sub: any) => (
                <div key={sub.id} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{sub.trackTitle}</span>
                      <Badge className={`text-xs ${priorityColors[sub.priority || 'medium']}`}>{sub.priority}</Badge>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{sub.labelName}{sub.contactName ? ` — ${sub.contactName}` : ''}{sub.contactRole ? `, ${sub.contactRole}` : ''}</p>
                    {sub.notes && <p className="text-xs text-gray-400 mt-1">{sub.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Select value={sub.status} onValueChange={(v) => updateStatusMutation.mutate({ id: sub.id, status: v })}>
                      <SelectTrigger className="w-36 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['draft','submitted','under_review','following_up','accepted','rejected'].map(s => <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Badge className={`text-xs whitespace-nowrap ${statusColors[sub.status] || 'bg-gray-100 text-gray-600'}`}>{sub.status?.replace('_', ' ')}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// SAMPLE CLEARANCE CONTENT
// ============================================================================

function SampleClearanceContent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [newClearance, setNewClearance] = useState({
    trackTitle: '', sampleSource: '', sampleArtist: '', sampleLabel: '', samplePublisher: '',
    clearanceType: 'master_and_sync', contactEmail: '', fee: '', notes: '',
  });

  const { data: clearances = [], isLoading } = useQuery<any[]>({ queryKey: ['/api/sample-clearances'] });
  const { data: stats } = useQuery<any>({ queryKey: ['/api/sample-clearances/stats'] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => { const res = await apiRequest('POST', '/api/sample-clearances', data); return res.json(); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sample-clearances'] });
      setIsNewOpen(false);
      toast({ title: 'Sample Added', description: 'Sample clearance tracking started.' });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: any) => { const res = await apiRequest('PUT', `/api/sample-clearances/${id}`, { status }); return res.json(); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/sample-clearances'] }),
  });

  const statusColors: Record<string, string> = {
    needed: 'bg-red-100 text-red-700',
    contacting: 'bg-blue-100 text-blue-700',
    negotiating: 'bg-yellow-100 text-yellow-700',
    in_review: 'bg-orange-100 text-orange-700',
    cleared: 'bg-green-100 text-green-700',
    denied: 'bg-red-100 text-red-700',
    no_sample: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Samples', value: stats?.total || 0 },
          { label: 'Cleared', value: stats?.cleared || 0, color: 'text-green-600' },
          { label: 'Pending', value: stats?.pending || 0, color: 'text-yellow-600' },
          { label: 'Fees Paid', value: `$${(stats?.totalFees || 0).toLocaleString()}`, color: 'text-blue-600' },
        ].map((s, i) => (
          <Card key={i}><CardContent className="p-4 text-center">
            <p className="text-2xl font-bold mt-1 {s.color || ''}">{s.value}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><Shield className="w-5 h-5 text-blue-600" />Sample Clearance Tracker</CardTitle>
            <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
              <DialogTrigger asChild><Button size="sm" className="gradient-bg"><Plus className="w-4 h-4 mr-1" />Add Sample</Button></DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Track Sample Clearance</DialogTitle><DialogDescription>Track a sample used in your music that needs clearance</DialogDescription></DialogHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Your Track</Label><Input placeholder="Track using the sample" value={newClearance.trackTitle} onChange={(e) => setNewClearance({...newClearance, trackTitle: e.target.value})} /></div>
                    <div><Label>Sample Source</Label><Input placeholder="Original song title" value={newClearance.sampleSource} onChange={(e) => setNewClearance({...newClearance, sampleSource: e.target.value})} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Original Artist</Label><Input value={newClearance.sampleArtist} onChange={(e) => setNewClearance({...newClearance, sampleArtist: e.target.value})} /></div>
                    <div><Label>Original Label</Label><Input value={newClearance.sampleLabel} onChange={(e) => setNewClearance({...newClearance, sampleLabel: e.target.value})} /></div>
                  </div>
                  <div><Label>Publisher</Label><Input placeholder="Music publisher" value={newClearance.samplePublisher} onChange={(e) => setNewClearance({...newClearance, samplePublisher: e.target.value})} /></div>
                  <div><Label>Clearance Type</Label>
                    <Select value={newClearance.clearanceType} onValueChange={(v) => setNewClearance({...newClearance, clearanceType: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="master_and_sync">Master & Sync (both)</SelectItem>
                        <SelectItem value="master_only">Master Only</SelectItem>
                        <SelectItem value="sync_only">Sync Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Contact Email</Label><Input type="email" value={newClearance.contactEmail} onChange={(e) => setNewClearance({...newClearance, contactEmail: e.target.value})} /></div>
                    <div><Label>Clearance Fee ($)</Label><Input type="number" placeholder="0" value={newClearance.fee} onChange={(e) => setNewClearance({...newClearance, fee: e.target.value})} /></div>
                  </div>
                  <div><Label>Notes</Label><Textarea className="h-16" value={newClearance.notes} onChange={(e) => setNewClearance({...newClearance, notes: e.target.value})} /></div>
                  <Button className="w-full gradient-bg" onClick={() => createMutation.mutate({...newClearance, fee: newClearance.fee ? parseFloat(newClearance.fee) : undefined})} disabled={!newClearance.trackTitle || !newClearance.sampleSource || createMutation.isPending}>
                    {createMutation.isPending ? 'Adding...' : 'Track Sample'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3 py-2">
              {[1,2,3].map(i => (
                <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                  <Skeleton className="h-8 w-28 ml-4" />
                </div>
              ))}
            </div>
          ) : clearances.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500">No samples tracked.</p>
              <p className="text-sm text-gray-400 mt-1">Track samples in your music and manage clearance status.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {clearances.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{c.trackTitle} <span className="text-gray-400">uses</span> "{c.sampleSource}"</p>
                    <p className="text-xs text-gray-500 mt-0.5">{c.sampleArtist && `by ${c.sampleArtist}`}{c.sampleLabel && ` on ${c.sampleLabel}`}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{c.clearanceType?.replace('_', ' & ')} clearance{c.fee ? ` — $${c.fee}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Select value={c.status} onValueChange={(v) => updateStatusMutation.mutate({ id: c.id, status: v })}>
                      <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['needed','contacting','negotiating','in_review','cleared','denied','no_sample'].map(s => <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Badge className={`text-xs whitespace-nowrap ${statusColors[c.status] || 'bg-gray-100'}`}>{c.status?.replace('_', ' ')}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-l-4 border-l-yellow-500">
        <CardContent className="p-4">
          <h3 className="font-semibold flex items-center gap-2 mb-2"><AlertCircle className="w-4 h-4 text-yellow-500" />Sample Clearance Guide</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-gray-600">
            <div><p className="font-medium text-gray-800 mb-1">1. Identify Rights Holders</p><p>Find both the master rights holder (label/artist) and publishing rights holder (publisher/songwriter).</p></div>
            <div><p className="font-medium text-gray-800 mb-1">2. Request Clearance</p><p>Contact both parties and negotiate a license fee or royalty arrangement.</p></div>
            <div><p className="font-medium text-gray-800 mb-1">3. Get It In Writing</p><p>Always get a written license agreement before releasing music with a sample.</p></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// MUSIC VIDEOS CONTENT
// ============================================================================

function MusicVideosContent() {
  const { toast } = useToast();

  const [songTitle, setSongTitle] = useState('');
  const [artistName, setArtistName] = useState('');
  const [hookText, setHookText] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [ctaText, setCtaText] = useState('');
  const [voiceProfile, setVoiceProfile] = useState('smooth_narrator');
  const [colorGrade, setColorGrade] = useState('cinematic');
  const [outputPlatform, setOutputPlatform] = useState('youtube');
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [selectedAudio, setSelectedAudio] = useState<File | null>(null);
  const [enableVoice, setEnableVoice] = useState(false);

  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedVideoUrl, setCompletedVideoUrl] = useState<string | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const { data: voiceProfiles = [] } = useQuery<any[]>({ queryKey: ['/api/social/voice-profiles'] });
  const { data: libraryVideos = [] } = useQuery<any[]>({ queryKey: ['/api/music-videos'] });

  useEffect(() => {
    if (!jobId || jobStatus?.status === 'completed' || jobStatus?.status === 'failed') return;
    const interval = setInterval(async () => {
      try {
        const res = await apiRequest('GET', `/api/social/music-video-job/${jobId}`);
        const data = await res.json();
        setJobStatus(data);
        if (data.status === 'completed') {
          setCompletedVideoUrl(data.videoUrl || data.outputPath || null);
          toast({ title: 'Music Video Ready!', description: 'Your AI music video has been generated.' });
        } else if (data.status === 'failed') {
          toast({ title: 'Generation Failed', description: data.error || 'Something went wrong.', variant: 'destructive' });
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [jobId, jobStatus?.status, toast]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 10 - selectedImages.length);
    if (!files.length) return;
    const newPreviews = files.map(f => URL.createObjectURL(f));
    setSelectedImages(prev => [...prev, ...files].slice(0, 10));
    setImagePreviews(prev => [...prev, ...newPreviews].slice(0, 10));
    e.target.value = '';
  };

  const removeImage = (i: number) => {
    setSelectedImages(prev => prev.filter((_, idx) => idx !== i));
    setImagePreviews(prev => prev.filter((_, idx) => idx !== i));
  };

  const handleGenerate = async () => {
    if (!selectedImages.length) {
      toast({ title: 'Images required', description: 'Upload at least 1 image to generate a music video.', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);
    setJobId(null);
    setJobStatus(null);
    setCompletedVideoUrl(null);
    try {
      const form = new FormData();
      selectedImages.forEach(img => form.append('images', img));
      if (selectedAudio) form.append('audio', selectedAudio);
      form.append('config', JSON.stringify({
        songTitle,
        artistName,
        hookText,
        bodyText,
        ctaText,
        voiceProfile: enableVoice ? voiceProfile : undefined,
        colorGrade,
        outputPlatform,
        enableVoiceNarration: enableVoice,
      }));
      const res = await fetch('/api/social/generate-music-video', {
        method: 'POST',
        body: form,
        credentials: 'include',
      });
      const data = await res.json();
      if (data.jobId) {
        setJobId(data.jobId);
        setJobStatus({ status: 'processing', progress: 0 });
      } else {
        throw new Error(data.error || 'Failed to start generation');
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const COLOR_GRADES = [
    { value: 'cinematic', label: 'Cinematic' },
    { value: 'warm', label: 'Warm' },
    { value: 'cool', label: 'Cool' },
    { value: 'neon', label: 'Neon' },
    { value: 'none', label: 'Natural' },
  ];

  const PLATFORMS = ['youtube', 'instagram', 'tiktok', 'all_platforms'];

  const FALLBACK_VOICES = [
    { id: 'smooth_narrator', name: 'Smooth Narrator' },
    { id: 'hype_man', name: 'Hype Man' },
    { id: 'radio_announcer', name: 'Radio Announcer' },
    { id: 'deep_boss', name: 'Deep Boss' },
    { id: 'ethereal_guide', name: 'Ethereal Guide' },
    { id: 'r_and_b_smooth', name: 'R&B Smooth' },
    { id: 'rap_mc', name: 'Rap MC' },
  ];

  const isGenerating = !!jobId && !!jobStatus && jobStatus.status !== 'completed' && jobStatus.status !== 'failed';
  const progressValue = jobStatus?.progress ? Math.round(jobStatus.progress * 100) : isGenerating ? 15 : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-purple-600" />
            AI Music Video Generator
          </CardTitle>
          <p className="text-sm text-gray-500 mt-0.5">Upload your images and audio — AI composes a beat-synced music video with Ken Burns motion, text overlays, and color grading</p>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* Image upload grid */}
          <div>
            <Label className="text-sm font-medium mb-2 block">
              Scene Images <span className="text-gray-400 font-normal">(1–10 photos)</span>
            </Label>
            <div className="flex flex-wrap gap-2">
              {imagePreviews.map((src, i) => (
                <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 group flex-shrink-0">
                  <img src={src} alt={`Scene ${i + 1}`} className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <div className="absolute bottom-0.5 left-0.5 bg-black/60 text-white text-[9px] px-1 rounded leading-4">{i + 1}</div>
                </div>
              ))}
              {selectedImages.length < 10 && (
                <button
                  onClick={() => imageInputRef.current?.click()}
                  className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center gap-1 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/20 transition-colors text-gray-400 hover:text-purple-500 flex-shrink-0"
                >
                  <ImagePlus className="w-5 h-5" />
                  <span className="text-[10px]">Add</span>
                </button>
              )}
            </div>
            <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageSelect} />
            <p className="text-xs text-gray-400 mt-1.5">Images play in order with animated motion paths. Drag to reorder after upload.</p>
          </div>

          {/* Audio upload */}
          <div>
            <Label className="text-sm font-medium mb-1.5 block">
              Audio Track <span className="text-gray-400 font-normal">(optional — enables beat-sync)</span>
            </Label>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => audioInputRef.current?.click()} className="text-xs h-8">
                <Music className="w-3.5 h-3.5 mr-1.5" />
                {selectedAudio ? selectedAudio.name : 'Upload Audio'}
              </Button>
              {selectedAudio && (
                <button onClick={() => setSelectedAudio(null)} className="text-gray-400 hover:text-red-500 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={e => { setSelectedAudio(e.target.files?.[0] || null); e.target.value = ''; }} />
            <p className="text-xs text-gray-400 mt-1">Scene cuts auto-align to detected beats. MP3, WAV, AAC, FLAC supported.</p>
          </div>

          {/* Song info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Song Title</Label>
              <Input placeholder="Track name" value={songTitle} onChange={e => setSongTitle(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Artist Name</Label>
              <Input placeholder="Your artist name" value={artistName} onChange={e => setArtistName(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>

          {/* Text overlays */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Text Overlays <span className="text-gray-400 font-normal text-xs">(optional — animated on-screen text)</span>
            </Label>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs w-12 text-gray-500 shrink-0">Hook</span>
                <Input placeholder="Opening hook — first scene" value={hookText} onChange={e => setHookText(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs w-12 text-gray-500 shrink-0">Body</span>
                <Input placeholder="Middle body text" value={bodyText} onChange={e => setBodyText(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs w-12 text-gray-500 shrink-0">CTA</span>
                <Input placeholder='Call-to-action e.g. "Stream Now on Spotify"' value={ctaText} onChange={e => setCtaText(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
          </div>

          {/* Style options */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Color Grade</Label>
              <Select value={colorGrade} onValueChange={setColorGrade}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COLOR_GRADES.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Output Platform</Label>
              <Select value={outputPlatform} onValueChange={setOutputPlatform}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map(p => <SelectItem key={p} value={p}>{p.replace('_', ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Voice narration */}
          <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
            <Checkbox id="voice-enable" checked={enableVoice} onCheckedChange={v => setEnableVoice(!!v)} />
            <div className="flex-1 min-w-0">
              <Label htmlFor="voice-enable" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5 text-purple-500" />
                Add AI Voice Narration
              </Label>
              <p className="text-xs text-gray-400 mt-0.5">Synthesize a voice-over from your hook / body / CTA text</p>
            </div>
            {enableVoice && (
              <Select value={voiceProfile} onValueChange={setVoiceProfile}>
                <SelectTrigger className="w-40 h-7 text-xs shrink-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(voiceProfiles.length ? voiceProfiles : FALLBACK_VOICES).map((v: any) => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Generate button */}
          <Button
            className="w-full gradient-bg"
            onClick={handleGenerate}
            disabled={!selectedImages.length || isSubmitting || isGenerating}
          >
            {isSubmitting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting…</>
            ) : isGenerating ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating…</>
            ) : (
              <><Wand2 className="w-4 h-4 mr-2" />Generate Music Video</>
            )}
          </Button>

          {/* Progress / result */}
          {(isGenerating || jobStatus?.status === 'completed' || jobStatus?.status === 'failed') && (
            <div className="space-y-2 p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
              {isGenerating && (
                <>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-600 dark:text-gray-300 font-medium">
                      {jobStatus?.step || 'Compositing scenes…'}
                    </span>
                    <span className="text-gray-400">{progressValue}%</span>
                  </div>
                  <Progress value={progressValue} className="h-1.5" />
                  <p className="text-xs text-gray-400 mt-1">Applying Ken Burns motion, beat-synced cuts, and color grade…</p>
                </>
              )}
              {jobStatus?.status === 'completed' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-sm font-medium">Music video ready!</span>
                  </div>
                  {completedVideoUrl && (
                    <>
                      <video controls className="w-full rounded-lg max-h-64 bg-black" src={completedVideoUrl} />
                      <Button variant="outline" size="sm" className="w-full" asChild>
                        <a href={completedVideoUrl} download>
                          <Download className="w-3.5 h-3.5 mr-1.5" />
                          Download Video
                        </a>
                      </Button>
                    </>
                  )}
                </div>
              )}
              {jobStatus?.status === 'failed' && (
                <div className="flex items-center gap-2 text-red-500">
                  <XCircle className="w-4 h-4" />
                  <span className="text-sm">{jobStatus.error || 'Generation failed. Please try again.'}</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Video library */}
      {libraryVideos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Film className="w-4 h-4 text-blue-500" />
              Video Library
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {libraryVideos.map((v: any) => (
                <div key={v.id} className="flex items-center justify-between p-3 border border-gray-100 dark:border-gray-800 rounded-lg">
                  <div>
                    <p className="text-sm font-medium">{v.trackTitle || v.songTitle || 'Untitled'}</p>
                    <p className="text-xs text-gray-400">{v.stage || v.status || 'Generated'}</p>
                  </div>
                  {v.videoUrl && (
                    <Button variant="ghost" size="sm" asChild>
                      <a href={v.videoUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
