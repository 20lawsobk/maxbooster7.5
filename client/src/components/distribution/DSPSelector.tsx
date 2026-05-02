import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MonitorSpeaker, Search, CheckCircle, Loader2 } from 'lucide-react';
import {
  SpotifyIcon,
  AppleMusicIcon,
  iTunesIcon,
  AmazonMusicIcon,
  TidalIcon,
  DeezerIcon,
  YouTubeMusicIcon,
  PandoraIcon,
  iHeartRadioIcon,
  NapsterIcon,
  BeatportIcon,
  JunoDownloadIcon,
  BandcampIcon,
  SoundCloudIcon,
  AudiomackIcon,
  TraxsourceIcon,
  NetEaseIcon,
  QQMusicIcon,
  KugouIcon,
  KuwoIcon,
  KuaishouIcon,
  JioSaavnIcon,
  GaanaIcon,
  AnghamiIcon,
  BoomplayIcon,
  JOOXIcon,
  KKBOXIcon,
  AWAIcon,
  FLOIcon,
  MelonIcon,
  YandexMusicIcon,
  VKIcon,
  ClaroMusicaIcon,
  TrebelIcon,
  TikTokIcon,
  MetaIcon,
  InstagramIcon,
  FacebookIcon,
  SnapchatIcon,
  YouTubeIcon,
  TwitchIcon,
  SoundExchangeIcon,
  PelotonIcon,
  SoundtrackYBIcon,
  PretzelRocksIcon,
  RobloxIcon,
  AmazonIcon,
  SevenDigitalIcon,
  QobuzIcon,
  MediaNetIcon,
  GracenoteIcon,
  ShazamIcon,
  TencentMusicIcon,
  LunaIcon,
  CapCutIcon,
  WeSingIcon,
  UltimateMusicIcon,
  BilibiliIcon,
  TencentVideoIcon,
  IQIYIIcon,
  SiriIcon,
  VevoIcon,
  KuackMediaIcon,
  BugsIcon,
  GenieIcon,
  VibeIcon,
  LineIcon,
  RakutenMusicIcon,
  MoraIcon,
  RecochokuIcon,
  NuudayIcon,
  ZvukIcon,
  LiveXLiveIcon,
  MixcloudIcon,
  RessoIcon,
  UMAIcon,
  TouchTunesIcon,
  TIMusicIcon,
  SaavnIcon,
  WynkIcon,
  HungamaIcon,
  MdundoIcon,
  UDUXIcon,
  AlexaIcon,
  GoogleAssistantIcon,
  AppleFitnessIcon,
  FeedFMIcon,
  EpidemicSoundIcon,
  FortniteIcon,
  DJCityIcon,
  BPMSupremeIcon,
  DigitalDJPoolIcon,
  DubsetIcon,
  eMusicIcon,
  HDTracksIcon,
  PrimephonicIcon,
  IdagioIcon,
} from '@/components/ui/brand-icons';
import { useQuery } from '@tanstack/react-query';

interface DSP {
  id: string;
  slug: string;
  name: string;
  category: 'streaming' | 'social' | 'store' | 'other';
  region: string;
  processingTime: string;
  iconComponent?: Record<string, unknown>;
  color?: string;
}

const ICON_MAP: Record<string, any> = {
  spotify: SpotifyIcon,
  'apple-music': AppleMusicIcon,
  itunes: iTunesIcon,
  'amazon-music': AmazonMusicIcon,
  'amazon-mp3': AmazonIcon,
  tidal: TidalIcon,
  deezer: DeezerIcon,
  'youtube-music': YouTubeMusicIcon,
  pandora: PandoraIcon,
  iheartradio: iHeartRadioIcon,
  napster: NapsterIcon,
  beatport: BeatportIcon,
  'juno-download': JunoDownloadIcon,
  bandcamp: BandcampIcon,
  soundcloud: SoundCloudIcon,
  audiomack: AudiomackIcon,
  traxsource: TraxsourceIcon,
  'netease-cloud-music': NetEaseIcon,
  'qq-music': QQMusicIcon,
  kugou: KugouIcon,
  kuwo: KuwoIcon,
  kuaishou: KuaishouIcon,
  jiosaavn: JioSaavnIcon,
  saavn: SaavnIcon,
  gaana: GaanaIcon,
  anghami: AnghamiIcon,
  boomplay: BoomplayIcon,
  joox: JOOXIcon,
  kkbox: KKBOXIcon,
  awa: AWAIcon,
  flo: FLOIcon,
  melon: MelonIcon,
  'yandex-music': YandexMusicIcon,
  'vk-music': VKIcon,
  'claro-musica': ClaroMusicaIcon,
  trebel: TrebelIcon,
  tiktok: TikTokIcon,
  'meta-library': MetaIcon,
  instagram: InstagramIcon,
  facebook: FacebookIcon,
  snapchat: SnapchatIcon,
  'youtube-content-id': YouTubeIcon,
  twitch: TwitchIcon,
  soundexchange: SoundExchangeIcon,
  peloton: PelotonIcon,
  'soundtrack-your-brand': SoundtrackYBIcon,
  'pretzel-rocks': PretzelRocksIcon,
  roblox: RobloxIcon,
  '7digital': SevenDigitalIcon,
  qobuz: QobuzIcon,
  medianet: MediaNetIcon,
  gracenote: GracenoteIcon,
  shazam: ShazamIcon,
  'tencent-music': TencentMusicIcon,
  luna: LunaIcon,
  capcut: CapCutIcon,
  wesing: WeSingIcon,
  'ultimate-music': UltimateMusicIcon,
  bilibili: BilibiliIcon,
  'tencent-video': TencentVideoIcon,
  iqiyi: IQIYIIcon,
  siri: SiriIcon,
  vevo: VevoIcon,
  'kuack-media': KuackMediaIcon,
  bugs: BugsIcon,
  genie: GenieIcon,
  vibe: VibeIcon,
  'line-music': LineIcon,
  'rakuten-music': RakutenMusicIcon,
  mora: MoraIcon,
  recochoku: RecochokuIcon,
  nuuday: NuudayIcon,
  zvuk: ZvukIcon,
  livexlive: LiveXLiveIcon,
  mixcloud: MixcloudIcon,
  resso: RessoIcon,
  uma: UMAIcon,
  touchtunes: TouchTunesIcon,
  'tim-music': TIMusicIcon,
  wynk: WynkIcon,
  hungama: HungamaIcon,
  mdundo: MdundoIcon,
  udux: UDUXIcon,
  'amazon-alexa': AlexaIcon,
  'google-assistant': GoogleAssistantIcon,
  'apple-fitness-plus': AppleFitnessIcon,
  'feed-fm': FeedFMIcon,
  'epidemic-sound': EpidemicSoundIcon,
  fortnite: FortniteIcon,
  'dj-city': DJCityIcon,
  'bpm-supreme': BPMSupremeIcon,
  'digital-dj-pool': DigitalDJPoolIcon,
  dubset: DubsetIcon,
  emusic: eMusicIcon,
  hdtracks: HDTracksIcon,
  primephonic: PrimephonicIcon,
  idagio: IdagioIcon,
};

const COLOR_MAP: Record<string, string> = {
  spotify: '#1ED760',
  'apple-music': '#FA243C',
  itunes: '#FB5BC5',
  'youtube-music': '#FF0000',
  'amazon-music': '#FF9900',
  'amazon-mp3': '#FF9900',
  tidal: '#000000',
  deezer: '#A238FF',
  pandora: '#224099',
  iheartradio: '#C6002B',
  napster: '#2259FF',
  beatport: '#01FF95',
  'juno-download': '#FF6600',
  bandcamp: '#408294',
  soundcloud: '#FF5500',
  audiomack: '#FFA200',
  traxsource: '#E50000',
  'netease-cloud-music': '#D43C33',
  'qq-music': '#12B7F5',
  kugou: '#002B73',
  kuwo: '#FF6D00',
  kuaishou: '#FF4906',
  jiosaavn: '#008ECC',
  saavn: '#008ECC',
  gaana: '#E72429',
  anghami: '#7F4DFF',
  boomplay: '#FF6D00',
  joox: '#00C83E',
  kkbox: '#00CC00',
  awa: '#1B1B1B',
  flo: '#00A4E4',
  melon: '#00CD3C',
  'yandex-music': '#FF0000',
  'vk-music': '#0077FF',
  'claro-musica': '#DC143C',
  trebel: '#6600CC',
  tiktok: '#000000',
  'meta-library': '#0467DF',
  instagram: '#E1306C',
  facebook: '#0866FF',
  snapchat: '#FFFC00',
  'youtube-content-id': '#FF0000',
  twitch: '#9146FF',
  soundexchange: '#0066CC',
  peloton: '#181A1D',
  'soundtrack-your-brand': '#0099CC',
  'pretzel-rocks': '#9400D3',
  roblox: '#E02020',
  '7digital': '#FF6600',
  qobuz: '#00A8C6',
  medianet: '#0099CC',
  gracenote: '#0066CC',
  shazam: '#0088FF',
  'tencent-music': '#0057FF',
  luna: '#9400D3',
  capcut: '#1A1A1A',
  wesing: '#1B8AE8',
  'ultimate-music': '#6600FF',
  bilibili: '#00A1D6',
  'tencent-video': '#FF6600',
  iqiyi: '#00BE06',
  siri: '#007AFF',
  vevo: '#E61C24',
  'kuack-media': '#FF3300',
  bugs: '#FF0000',
  genie: '#0062CC',
  vibe: '#FF6600',
  'line-music': '#00C300',
  'rakuten-music': '#BF0000',
  mora: '#FF6600',
  recochoku: '#FF6600',
  nuuday: '#003399',
  zvuk: '#7B2FBE',
  livexlive: '#0099FF',
  mixcloud: '#5000FF',
  resso: '#FF4444',
  uma: '#FF6600',
  touchtunes: '#0066CC',
  'tim-music': '#0066CC',
  wynk: '#E50E0E',
  hungama: '#FF6D00',
  mdundo: '#FF6D00',
  udux: '#0066CC',
  'amazon-alexa': '#00CAFF',
  'google-assistant': '#4285F4',
  'apple-fitness-plus': '#FC3C44',
  'feed-fm': '#0066CC',
  'epidemic-sound': '#1A1A1A',
  fortnite: '#2D93E0',
  'dj-city': '#FF0000',
  'bpm-supreme': '#CC0000',
  'digital-dj-pool': '#0066CC',
  dubset: '#5C5C8A',
  emusic: '#FF6600',
  hdtracks: '#003366',
  primephonic: '#1A1A1A',
  idagio: '#1A1A1A',
};

interface DSPSelectorProps {
  selectedPlatforms: string[];
  onChange: (platforms: string[]) => void;
}

export function DSPSelector({ selectedPlatforms, onChange }: DSPSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const { data: platforms = [], isLoading } = useQuery<DSP[]>({
    queryKey: ['/api/distribution/platforms'],
  });

  const enrichedPlatforms = platforms.map((p) => ({
    ...p,
    iconComponent: ICON_MAP[p.slug],
    color: COLOR_MAP[p.slug],
  }));

  const categories = [
    { value: 'all', label: 'All Platforms', count: enrichedPlatforms.length },
    {
      value: 'streaming',
      label: 'Streaming',
      count: enrichedPlatforms.filter((p) => p.category === 'streaming').length,
    },
    {
      value: 'social',
      label: 'Social',
      count: enrichedPlatforms.filter((p) => p.category === 'social').length,
    },
    {
      value: 'store',
      label: 'Store',
      count: enrichedPlatforms.filter((p) => p.category === 'store').length,
    },
  ];

  const filteredPlatforms = enrichedPlatforms.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const togglePlatform = (slug: string) => {
    if (selectedPlatforms.includes(slug)) {
      onChange(selectedPlatforms.filter((s) => s !== slug));
    } else {
      onChange([...selectedPlatforms, slug]);
    }
  };

  const selectAll = () => {
    onChange(filteredPlatforms.map((p) => p.slug));
  };

  const clearAll = () => {
    onChange([]);
  };

  const selectMajorPlatforms = () => {
    const major = ['spotify', 'apple-music', 'youtube-music', 'amazon-music', 'tidal', 'deezer'];
    const majorSlugs = enrichedPlatforms.filter((p) => major.includes(p.slug)).map((p) => p.slug);
    onChange(majorSlugs);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 flex flex-col items-center justify-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Fetching available platforms…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MonitorSpeaker className="h-5 w-5" />
          Select Distribution Platforms
        </CardTitle>
        <CardDescription>
          Choose where your music will be distributed. More platforms = more reach.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <strong>{selectedPlatforms.length}</strong> of{' '}
            <strong>{enrichedPlatforms.length}</strong> platforms selected
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={selectMajorPlatforms}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Major Platforms
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={selectAll}>
              Select All
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={clearAll}>
              Clear All
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat.value}
              type="button"
              className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                selectedCategory === cat.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80'
              }`}
              onClick={() => setSelectedCategory(cat.value)}
            >
              {cat.label} ({cat.count})
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search platforms..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredPlatforms.map((platform) => {
            const Icon = platform.iconComponent;
            const isSelected = selectedPlatforms.includes(platform.slug);

            return (
              <div
                key={platform.id}
                className={`relative p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  isSelected
                    ? 'border-primary bg-primary/5'
                    : 'border-muted hover:border-primary/50'
                }`}
                onClick={() => togglePlatform(platform.slug)}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => togglePlatform(platform.slug)}
                    className="mt-0.5"
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {Icon ? (
                        <Icon className="h-4 w-4 flex-shrink-0" style={{ color: platform.color }} />
                      ) : (
                        <MonitorSpeaker className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      )}
                      <span className="font-medium truncate">{platform.name}</span>
                    </div>

                    <div className="flex flex-wrap gap-1 mt-2">
                      <Badge variant="secondary" className="text-xs">
                        {platform.category}
                      </Badge>
                      {platform.region !== 'global' && (
                        <Badge variant="outline" className="text-xs">
                          {platform.region}
                        </Badge>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground mt-2">{platform.processingTime}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredPlatforms.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <MonitorSpeaker className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No platforms found matching &quot;{searchQuery}&quot;</p>
          </div>
        )}

        {selectedPlatforms.length > 0 && (
          <div className="space-y-2 pt-4 border-t">
            <Label>Selected Platforms ({selectedPlatforms.length})</Label>
            <div className="flex flex-wrap gap-2">
              {selectedPlatforms.map((slug) => {
                const platform = enrichedPlatforms.find((p) => p.slug === slug);
                if (!platform) return null;
                const Icon = platform.iconComponent;

                return (
                  <Badge key={slug} variant="secondary" className="gap-1.5 pr-1">
                    {Icon && <Icon className="h-3 w-3" style={{ color: platform.color }} />}
                    {platform.name}
                    <button
                      type="button"
                      className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePlatform(slug);
                      }}
                    >
                      ✕
                    </button>
                  </Badge>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
