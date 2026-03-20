import { db } from '../db.js';
import { eq, and, ilike } from 'drizzle-orm';
import { artistProfiles, artistProfileReleases, releases, distroReleases } from '@shared/schema';
import type { ArtistProfile, InsertArtistProfile } from '@shared/schema';
import { logger } from '../logger.js';
import { labelGridService } from './labelgrid-service.js';
import type { LabelGridArtistPlatformPresence } from './labelgrid-service.js';

interface SpotifyArtistResult {
  id: string;
  uri: string;
  name: string;
  imageUrl: string | null;
  genres: string[];
  followers: number;
  popularity: number;
  externalUrl: string;
}

interface AppleArtistResult {
  id: string;
  name: string;
  genres: string[];
  artworkUrl: string | null;
  url: string;
}

interface DeezerArtistResult {
  id: string;
  name: string;
  pictureUrl: string | null;
  fans: number;
  link: string;
}

interface MusicBrainzArtistResult {
  id: string;
  name: string;
  score: number;
  type: string | null;
  country: string | null;
  tags: string[];
  disambiguation: string | null;
}

interface AudiomackArtistResult {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  followers: number;
  url: string;
}

interface JioSaavnArtistResult {
  id: string;
  name: string;
  imageUrl: string | null;
  url: string;
}

export interface PlatformUrlDiscovery {
  platform: string;
  platformLabel: string;
  searchUrl: string;
  profileUrl: string | null;
  status: 'found' | 'not_found' | 'unverified' | 'distributed';
  method: 'url_template';
}

interface PlatformSearchResults {
  spotify: SpotifyArtistResult[];
  apple: AppleArtistResult[];
  deezer: DeezerArtistResult[];
  musicbrainz: MusicBrainzArtistResult[];
  audiomack: AudiomackArtistResult[];
  jiosaavn: JioSaavnArtistResult[];
}

// All 97 DSP distribution platforms with URL templates
// Used to generate artist profile search links for platforms without public search APIs
const ALL_DSP_URL_TEMPLATES: Array<{ id: string; label: string; searchUrl: (name: string, slug: string) => string }> = [
  { id: 'pandora',          label: 'Pandora',          searchUrl: (n) => `https://www.pandora.com/search/${encodeURIComponent(n)}/artists` },
  { id: 'iheartradio',      label: 'iHeart Radio',     searchUrl: (n) => `https://www.iheart.com/search/?keywords=${encodeURIComponent(n)}` },
  { id: 'tidal',            label: 'Tidal',            searchUrl: (n) => `https://tidal.com/browse/search?q=${encodeURIComponent(n)}&type=artists` },
  { id: 'amazon-music',     label: 'Amazon Music',     searchUrl: (n) => `https://music.amazon.com/search/${encodeURIComponent(n)}` },
  { id: 'youtube-music',    label: 'YouTube Music',    searchUrl: (n) => `https://music.youtube.com/search?q=${encodeURIComponent(n)}` },
  { id: 'soundcloud',       label: 'SoundCloud',       searchUrl: (n, s) => `https://soundcloud.com/search/people?q=${encodeURIComponent(n)}` },
  { id: 'bandcamp',         label: 'Bandcamp',         searchUrl: (n) => `https://bandcamp.com/search?q=${encodeURIComponent(n)}&item_type=b` },
  { id: 'napster',          label: 'Napster',          searchUrl: (n) => `https://us.napster.com/search/artists/${encodeURIComponent(n)}` },
  { id: 'qobuz',            label: 'Qobuz',            searchUrl: (n) => `https://www.qobuz.com/gb-en/search?q=${encodeURIComponent(n)}&target=Performers` },
  { id: 'traxsource',       label: 'Traxsource',       searchUrl: (n) => `https://www.traxsource.com/search?q=${encodeURIComponent(n)}&type=artists` },
  { id: 'beatport',         label: 'Beatport',         searchUrl: (n) => `https://www.beatport.com/search?q=${encodeURIComponent(n)}` },
  { id: 'juno-download',    label: 'Juno Download',    searchUrl: (n) => `https://www.junodownload.com/search/?order=jd_date_of_pub+desc&q%5Bf%5D%5B0%5D=artists&q%5Bsub%5D%5B0%5D=${encodeURIComponent(n)}` },
  { id: 'boomplay',         label: 'Boomplay',         searchUrl: (n) => `https://www.boomplay.com/search/default/${encodeURIComponent(n)}` },
  { id: 'anghami',          label: 'Anghami',          searchUrl: (n) => `https://play.anghami.com/search?q=${encodeURIComponent(n)}&type=artists` },
  { id: 'gaana',            label: 'Gaana',            searchUrl: (n, s) => `https://gaana.com/search/${s}` },
  { id: 'kkbox',            label: 'KKBOX',            searchUrl: (n) => `https://www.kkbox.com/tw/en/search/${encodeURIComponent(n)}/artist` },
  { id: 'line-music',       label: 'LINE MUSIC',       searchUrl: (n) => `https://music.line.me/webapp/search/artists?query=${encodeURIComponent(n)}` },
  { id: 'netease-cloud-music', label: 'NetEase Cloud Music', searchUrl: (n) => `https://music.163.com/#/search/m/?s=${encodeURIComponent(n)}&type=100` },
  { id: 'qq-music',         label: 'QQ Music',         searchUrl: (n) => `https://y.qq.com/portal/search.html#page=1&searchid=1&query=${encodeURIComponent(n)}` },
  { id: 'kugou',            label: 'Kugou',            searchUrl: (n) => `https://www.kugou.com/yy/singer/index.html#src=${encodeURIComponent(n)}` },
  { id: 'kuwo',             label: 'Kuwo',             searchUrl: (n) => `https://www.kuwo.cn/search/singers?wd=${encodeURIComponent(n)}` },
  { id: 'kuaishou',         label: 'Kuaishou',         searchUrl: (n) => `https://www.kuaishou.com/search/${encodeURIComponent(n)}` },
  { id: 'yandex-music',     label: 'Yandex Music',     searchUrl: (n) => `https://music.yandex.ru/search?text=${encodeURIComponent(n)}&type=artists` },
  { id: 'vk-music',         label: 'VK Music',         searchUrl: (n) => `https://vk.com/search?c[section]=artists&c[q]=${encodeURIComponent(n)}` },
  { id: 'claro-musica',     label: 'Claro Música',     searchUrl: (n) => `https://www.claromusica.com/buscar?q=${encodeURIComponent(n)}` },
  { id: 'trebel',           label: 'Trebel',           searchUrl: (n) => `https://www.trebel.io/search/${encodeURIComponent(n)}` },
  { id: 'tiktok',           label: 'TikTok',           searchUrl: (n) => `https://www.tiktok.com/search?q=${encodeURIComponent(n)}` },
  { id: 'instagram',        label: 'Instagram',        searchUrl: (n, s) => `https://www.instagram.com/${s}/` },
  { id: 'facebook',         label: 'Facebook',         searchUrl: (n, s) => `https://www.facebook.com/search/top?q=${encodeURIComponent(n)}` },
  { id: 'snapchat',         label: 'Snapchat',         searchUrl: (n, s) => `https://www.snapchat.com/add/${s}` },
  { id: 'youtube-content-id', label: 'YouTube',        searchUrl: (n) => `https://www.youtube.com/results?search_query=${encodeURIComponent(n)}` },
  { id: 'twitch',           label: 'Twitch',           searchUrl: (n, s) => `https://www.twitch.tv/${s}` },
  { id: 'soundexchange',    label: 'SoundExchange',    searchUrl: (n) => `https://www.soundexchange.com` },
  { id: 'peloton',          label: 'Peloton',          searchUrl: (n) => `https://www.onepeloton.com` },
  { id: 'soundtrack-your-brand', label: 'Soundtrack by Twitch', searchUrl: (n) => `https://www.soundtrackyourbrand.com` },
  { id: 'pretzel-rocks',    label: 'Pretzel',          searchUrl: (n) => `https://www.pretzel.rocks` },
  { id: 'roblox',           label: 'Roblox',           searchUrl: (n) => `https://www.roblox.com/discover#` },
  { id: 'amazon-mp3',       label: 'Amazon (MP3)',     searchUrl: (n) => `https://www.amazon.com/s?k=${encodeURIComponent(n)}&i=digital-music` },
  { id: '7digital',         label: '7digital',         searchUrl: (n) => `https://us.7digital.com/search?q=${encodeURIComponent(n)}` },
  { id: 'medianet',         label: 'MediaNet',         searchUrl: (n) => `https://music.mediasnet.com` },
  { id: 'gracenote',        label: 'Gracenote',        searchUrl: (n) => `https://www.gracenote.com` },
  { id: 'shazam',           label: 'Shazam',           searchUrl: (n) => `https://www.shazam.com/search?q=${encodeURIComponent(n)}` },
  { id: 'tencent-music',    label: 'Tencent Music',    searchUrl: (n) => `https://www.tencentmusic.com` },
  { id: 'luna',             label: 'Luna',             searchUrl: (n) => `https://luna.app` },
  { id: 'capcut',           label: 'CapCut',           searchUrl: (n) => `https://www.capcut.com` },
  { id: 'wesing',           label: 'WeSing',           searchUrl: (n) => `https://www.wesing.com` },
  { id: 'bilibili',         label: 'Bilibili',         searchUrl: (n) => `https://search.bilibili.com/all?keyword=${encodeURIComponent(n)}` },
  { id: 'tencent-video',    label: 'Tencent Video',    searchUrl: (n) => `https://v.qq.com/search.html#stag=0&query=${encodeURIComponent(n)}` },
  { id: 'iqiyi',            label: 'iQIYI',            searchUrl: (n) => `https://www.iqiyi.com/search.html?query=${encodeURIComponent(n)}` },
  { id: 'siri',             label: 'Siri / Apple',     searchUrl: (n) => `https://music.apple.com/search?term=${encodeURIComponent(n)}` },
  { id: 'vevo',             label: 'Vevo',             searchUrl: (n, s) => `https://www.vevo.com/artist/${s}` },
  { id: 'kuack-media',      label: 'Kuack Media',      searchUrl: (n) => `https://kuack.com` },
  { id: 'bugs',             label: 'Bugs',             searchUrl: (n) => `https://music.bugs.co.kr/search/artist?q=${encodeURIComponent(n)}` },
  { id: 'genie',            label: 'Genie',            searchUrl: (n) => `https://www.genie.co.kr/search/searchMain?query=${encodeURIComponent(n)}` },
  { id: 'melon',            label: 'Melon',            searchUrl: (n) => `https://www.melon.com/search/total/index.htm?q=${encodeURIComponent(n)}` },
  { id: 'awa',              label: 'AWA',              searchUrl: (n) => `https://awa.fm/search?q=${encodeURIComponent(n)}` },
  { id: 'flo',              label: 'FLO',              searchUrl: (n) => `https://www.music-flo.com/search?q=${encodeURIComponent(n)}` },
  { id: 'vibe',             label: 'Naver Vibe',       searchUrl: (n) => `https://vibe.naver.com/search/${encodeURIComponent(n)}` },
  { id: 'rakuten-music',    label: 'Rakuten Music',    searchUrl: (n) => `https://music.rakuten.co.jp` },
  { id: 'mora',             label: 'mora',             searchUrl: (n) => `https://mora.jp/search/searchResult?keyword=${encodeURIComponent(n)}` },
  { id: 'recochoku',        label: 'Recochoku',        searchUrl: (n) => `https://recochoku.jp/search?q=${encodeURIComponent(n)}` },
  { id: 'nuuday',           label: 'Nuuday',           searchUrl: (n) => `https://yousee.dk/musik` },
  { id: 'zvuk',             label: 'Zvuk',             searchUrl: (n) => `https://zvuk.com/search?q=${encodeURIComponent(n)}` },
  { id: 'livexlive',        label: 'LiveXLive',        searchUrl: (n) => `https://www.livexlive.com/search?q=${encodeURIComponent(n)}` },
  { id: 'mixcloud',         label: 'Mixcloud',         searchUrl: (n, s) => `https://www.mixcloud.com/${s}/` },
  { id: 'resso',            label: 'Resso',            searchUrl: (n) => `https://www.resso.com` },
  { id: 'uma',              label: 'UMA',              searchUrl: (n) => `https://uma.app` },
  { id: 'touchtunes',       label: 'TouchTunes',       searchUrl: (n) => `https://www.touchtunes.com` },
  { id: 'tim-music',        label: 'TIM Music',        searchUrl: (n) => `https://timmusic.com.br` },
  { id: 'saavn',            label: 'Saavn',            searchUrl: (n) => `https://www.jiosaavn.com/search/${encodeURIComponent(n)}` },
  { id: 'wynk',             label: 'Wynk Music',       searchUrl: (n) => `https://wynk.in/search/${encodeURIComponent(n)}` },
  { id: 'hungama',          label: 'Hungama',          searchUrl: (n) => `https://www.hungama.com/search/${encodeURIComponent(n)}/` },
  { id: 'mdundo',           label: 'Mdundo',           searchUrl: (n) => `https://www.mdundo.com/search/${encodeURIComponent(n)}` },
  { id: 'udux',             label: 'UDUX',             searchUrl: (n) => `https://udux.com/search/${encodeURIComponent(n)}` },
  { id: 'amazon-alexa',     label: 'Amazon Alexa',     searchUrl: (n) => `https://music.amazon.com/search/${encodeURIComponent(n)}` },
  { id: 'google-assistant', label: 'Google Assistant', searchUrl: (n) => `https://music.youtube.com/search?q=${encodeURIComponent(n)}` },
  { id: 'apple-fitness-plus', label: 'Apple Fitness+', searchUrl: (n) => `https://music.apple.com/search?term=${encodeURIComponent(n)}` },
  { id: 'feed-fm',          label: 'Feed.fm',          searchUrl: (n) => `https://feed.fm` },
  { id: 'epidemic-sound',   label: 'Epidemic Sound',   searchUrl: (n) => `https://www.epidemicsound.com/music/search/?term=${encodeURIComponent(n)}&contentType=artist` },
  { id: 'fortnite',         label: 'Fortnite',         searchUrl: (n) => `https://www.fortnite.com` },
  { id: 'dj-city',          label: 'DJcity',           searchUrl: (n) => `https://www.djcity.com/search/${encodeURIComponent(n)}` },
  { id: 'bpm-supreme',      label: 'BPM Supreme',      searchUrl: (n) => `https://www.bpmsupreme.com/search?q=${encodeURIComponent(n)}` },
  { id: 'digital-dj-pool',  label: 'Digital DJ Pool',  searchUrl: (n) => `https://www.digitaldjpool.com/search?q=${encodeURIComponent(n)}` },
  { id: 'dubset',           label: 'Dubset',           searchUrl: (n) => `https://dubset.com` },
  { id: 'emusic',           label: 'eMusic',           searchUrl: (n) => `https://www.emusic.com/search?q=${encodeURIComponent(n)}` },
  { id: 'hdtracks',         label: 'HDtracks',         searchUrl: (n) => `https://www.hdtracks.com/catalogsearch/result/?q=${encodeURIComponent(n)}` },
  { id: 'primephonic',      label: 'Primephonic',      searchUrl: (n) => `https://primephonic.com/search?q=${encodeURIComponent(n)}` },
  { id: 'idagio',           label: 'Idagio',           searchUrl: (n) => `https://app.idagio.com/search?query=${encodeURIComponent(n)}` },
  { id: 'joox',             label: 'JOOX',             searchUrl: (n) => `https://www.joox.com/search?query=${encodeURIComponent(n)}` },
  { id: 'meta-library',     label: 'Meta Music Library', searchUrl: (n) => `https://www.facebook.com/search/top?q=${encodeURIComponent(n)}` },
  { id: 'ultimate-music',   label: 'Ultimate Music',   searchUrl: (n) => `https://www.ultimatemusic.com` },
  { id: 'itunes',           label: 'iTunes Store',     searchUrl: (n) => `https://itunes.apple.com/search?term=${encodeURIComponent(n)}&entity=musicArtist` },
];

// Platforms already handled by full API search — excluded from URL-template generation
const API_SEARCHED_PLATFORMS = new Set([
  'spotify', 'apple-music', 'deezer', 'audiomack', 'jiosaavn',
]);

class ArtistProfileService {
  private spotifyToken: string | null = null;
  private spotifyTokenExpiry: number = 0;

  // Normalize artist name for fuzzy comparison:
  // strips punctuation, collapses spaces, lowercases, strips common prefixes like "the"
  private _normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')  // strip punctuation (hyphens, apostrophes, etc.)
      .replace(/\bthe\b/g, '')        // strip leading "the"
      .replace(/\s+/g, ' ')          // collapse whitespace
      .trim();
  }

  // Levenshtein edit distance for character-level similarity
  private _levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }
    return dp[m][n];
  }

  // Compute a 0–100 name similarity score using normalized name matching,
  // Jaccard word-overlap, and Levenshtein character-level distance.
  // Returns the best score across all methods to minimise false negatives.
  private _nameSimilarity(a: string, b: string): number {
    const na = this._normalizeName(a);
    const nb = this._normalizeName(b);

    // Exact after normalization → perfect
    if (na === nb) return 100;

    // Substring containment (one is a superset of the other after normalization)
    if (na.includes(nb) || nb.includes(na)) return 85;

    // Jaccard word-level overlap
    const wordsA = new Set(na.split(' ').filter(Boolean));
    const wordsB = new Set(nb.split(' ').filter(Boolean));
    const shared = [...wordsA].filter(w => wordsB.has(w)).length;
    const union = new Set([...wordsA, ...wordsB]).size;
    const jaccardScore = union > 0 ? Math.round((shared / union) * 60) : 0;

    // Levenshtein character-level ratio (capped at 20 chars to stay O(n²) fast)
    const maxLen = Math.max(na.length, nb.length);
    let levScore = 0;
    if (maxLen > 0 && maxLen <= 25) {
      const dist = this._levenshtein(na, nb);
      levScore = Math.round(Math.max(0, (1 - dist / maxLen) * 55));
    }

    return Math.max(jaccardScore, levScore);
  }

  // Retry wrapper with exponential backoff for external API calls
  private async _withRetry<T>(
    fn: () => Promise<T>,
    maxAttempts = 3,
    label = 'external API'
  ): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        lastErr = err;
        const isRetryable = err?.name === 'TimeoutError' ||
                            err?.message?.includes('timeout') ||
                            err?.message?.includes('network') ||
                            (err?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT');
        if (isRetryable && attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, 300 * attempt));
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  private async getSpotifyToken(): Promise<string | null> {
    if (this.spotifyToken && Date.now() < this.spotifyTokenExpiry) {
      return this.spotifyToken;
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return null;
    }

    try {
      const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        logger.warn('[ArtistProfile] Spotify token fetch failed:', response.status);
        return null;
      }

      const data = await response.json() as { access_token: string; expires_in: number };
      this.spotifyToken = data.access_token;
      this.spotifyTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
      return this.spotifyToken;
    } catch (err) {
      logger.error('[ArtistProfile] Spotify token error:', err);
      return null;
    }
  }

  async searchSpotifyArtists(query: string): Promise<SpotifyArtistResult[]> {
    const token = await this.getSpotifyToken();
    if (!token) return [];

    try {
      const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=artist&limit=8`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) return [];

      const data = await response.json() as any;
      return (data.artists?.items || []).map((a: any): SpotifyArtistResult => ({
        id: a.id,
        uri: a.uri,
        name: a.name,
        imageUrl: a.images?.[0]?.url ?? null,
        genres: a.genres || [],
        followers: a.followers?.total ?? 0,
        popularity: a.popularity ?? 0,
        externalUrl: a.external_urls?.spotify ?? '',
      }));
    } catch (err) {
      logger.error('[ArtistProfile] Spotify search error:', err);
      return [];
    }
  }

  async verifySpotifyArtist(spotifyId: string): Promise<SpotifyArtistResult | null> {
    const token = await this.getSpotifyToken();
    if (!token) return null;

    try {
      const response = await fetch(`https://api.spotify.com/v1/artists/${spotifyId}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) return null;

      const a = await response.json() as any;
      return {
        id: a.id,
        uri: a.uri,
        name: a.name,
        imageUrl: a.images?.[0]?.url ?? null,
        genres: a.genres || [],
        followers: a.followers?.total ?? 0,
        popularity: a.popularity ?? 0,
        externalUrl: a.external_urls?.spotify ?? '',
      };
    } catch (err) {
      logger.error('[ArtistProfile] Spotify verify error:', err);
      return null;
    }
  }

  async searchAppleArtists(query: string): Promise<AppleArtistResult[]> {
    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=musicArtist&limit=8`;
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });

      if (!response.ok) return [];

      const data = await response.json() as any;
      return (data.results || []).map((a: any): AppleArtistResult => ({
        id: String(a.artistId),
        name: a.artistName,
        genres: a.primaryGenreName ? [a.primaryGenreName] : [],
        artworkUrl: null,
        url: a.artistLinkUrl ?? '',
      }));
    } catch (err) {
      logger.error('[ArtistProfile] Apple search error:', err);
      return [];
    }
  }

  async searchDeezerArtists(query: string): Promise<DeezerArtistResult[]> {
    try {
      const url = `https://api.deezer.com/search/artist?q=${encodeURIComponent(query)}&limit=8`;
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });

      if (!response.ok) return [];

      const data = await response.json() as any;
      return (data.data || []).map((a: any): DeezerArtistResult => ({
        id: String(a.id),
        name: a.name,
        pictureUrl: a.picture_medium ?? null,
        fans: a.nb_fan ?? 0,
        link: a.link ?? '',
      }));
    } catch (err) {
      logger.error('[ArtistProfile] Deezer search error:', err);
      return [];
    }
  }

  async searchMusicBrainzArtists(query: string): Promise<MusicBrainzArtistResult[]> {
    try {
      // MusicBrainz requires a User-Agent header; uses standard REST API (no key needed)
      const url = `https://musicbrainz.org/ws/2/artist?query=artist:"${encodeURIComponent(query)}"&limit=8&fmt=json`;
      const response = await this._withRetry(() => fetch(url, {
        headers: {
          'User-Agent': 'MaxBooster/1.0 (music career management platform)',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      }), 2, 'MusicBrainz');

      if (!response.ok) return [];

      const data = await response.json() as any;
      return (data.artists || []).map((a: any): MusicBrainzArtistResult => ({
        id: a.id,
        name: a.name,
        score: a.score ?? 0,
        type: a.type ?? null,
        country: a.country ?? null,
        tags: (a.tags || []).map((t: any) => t.name as string),
        disambiguation: a.disambiguation ?? null,
      }));
    } catch (err) {
      logger.warn('[ArtistProfile] MusicBrainz search error (non-fatal):', err);
      return [];
    }
  }

  // Audiomack public search API — no key required
  async searchAudiomackArtists(query: string): Promise<AudiomackArtistResult[]> {
    try {
      const url = `https://api.audiomack.com/v1/search?type=artists&q=${encodeURIComponent(query)}&limit=5`;
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) return [];

      const data = await response.json() as any;
      return (data.results || []).slice(0, 5).map((a: any): AudiomackArtistResult => ({
        id: String(a.id ?? a.url_slug ?? ''),
        name: a.name ?? a.label ?? '',
        slug: a.url_slug ?? '',
        imageUrl: a.image ?? null,
        followers: a.followers ?? 0,
        url: a.url_slug ? `https://audiomack.com/${a.url_slug}` : '',
      }));
    } catch (err) {
      logger.warn('[ArtistProfile] Audiomack search error (non-fatal):', err);
      return [];
    }
  }

  // JioSaavn public search API — no key required
  async searchJioSaavnArtists(query: string): Promise<JioSaavnArtistResult[]> {
    try {
      const url = `https://www.jiosaavn.com/api.php?__call=autocomplete.get&_format=json&_marker=0&cc=in&includeMetaTags=1&query=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'MaxBooster/1.0',
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) return [];

      const data = await response.json() as any;
      const artists = data?.artists?.data || [];
      return artists.slice(0, 5).map((a: any): JioSaavnArtistResult => ({
        id: String(a.id ?? ''),
        name: a.title ?? a.name ?? '',
        imageUrl: a.image ?? null,
        url: a.url ? `https://www.jiosaavn.com${a.url}` : '',
      }));
    } catch (err) {
      logger.warn('[ArtistProfile] JioSaavn search error (non-fatal):', err);
      return [];
    }
  }

  async searchAllPlatforms(query: string): Promise<PlatformSearchResults> {
    const [spotify, apple, deezer, musicbrainz, audiomack, jiosaavn] = await Promise.allSettled([
      this.searchSpotifyArtists(query),
      this.searchAppleArtists(query),
      this.searchDeezerArtists(query),
      this.searchMusicBrainzArtists(query),
      this.searchAudiomackArtists(query),
      this.searchJioSaavnArtists(query),
    ]);

    return {
      spotify: spotify.status === 'fulfilled' ? spotify.value : [],
      apple: apple.status === 'fulfilled' ? apple.value : [],
      deezer: deezer.status === 'fulfilled' ? deezer.value : [],
      musicbrainz: musicbrainz.status === 'fulfilled' ? musicbrainz.value : [],
      audiomack: audiomack.status === 'fulfilled' ? audiomack.value : [],
      jiosaavn: jiosaavn.status === 'fulfilled' ? jiosaavn.value : [],
    };
  }

  // Generate a URL-friendly slug from an artist name
  private _nameToSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  // Generate URL-template-based discoveries for all 97 DSPs that don't have public search APIs.
  // Returns search/profile URLs the user can visit to verify their presence on each platform.
  generateUrlDiscoveries(artistName: string): PlatformUrlDiscovery[] {
    const slug = this._nameToSlug(artistName);
    return ALL_DSP_URL_TEMPLATES
      .filter(p => !API_SEARCHED_PLATFORMS.has(p.id))
      .map(p => ({
        platform: p.id,
        platformLabel: p.label,
        searchUrl: p.searchUrl(artistName, slug),
        profileUrlTemplate: null,
        method: 'url_template' as const,
      }));
  }

  async createProfile(data: InsertArtistProfile): Promise<ArtistProfile> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const [profile] = await db.insert(artistProfiles).values({
          ...data,
          updatedAt: new Date(),
        }).returning();
        return profile;
      } catch (err: any) {
        lastErr = err;
        const isTransient = err?.message?.includes('Failed query') || err?.cause?.message?.includes('timeout') || err?.cause?.message?.includes('connection');
        if (isTransient && attempt < 3) {
          await new Promise(r => setTimeout(r, 200 * attempt));
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  async getUserProfiles(userId: string): Promise<ArtistProfile[]> {
    return db.select().from(artistProfiles)
      .where(eq(artistProfiles.userId, userId))
      .orderBy(artistProfiles.createdAt);
  }

  async getProfile(id: string, userId: string): Promise<ArtistProfile | null> {
    const [profile] = await db.select().from(artistProfiles)
      .where(and(eq(artistProfiles.id, id), eq(artistProfiles.userId, userId)))
      .limit(1);
    return profile ?? null;
  }

  async updateProfile(id: string, userId: string, data: Partial<InsertArtistProfile>): Promise<ArtistProfile | null> {
    const [updated] = await db.update(artistProfiles)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(artistProfiles.id, id), eq(artistProfiles.userId, userId)))
      .returning();
    return updated ?? null;
  }

  async deleteProfile(id: string, userId: string): Promise<boolean> {
    await db.delete(artistProfileReleases).where(eq(artistProfileReleases.artistProfileId, id));
    const result = await db.delete(artistProfiles)
      .where(and(eq(artistProfiles.id, id), eq(artistProfiles.userId, userId)))
      .returning({ id: artistProfiles.id });
    return result.length > 0;
  }

  async linkProfileToRelease(artistProfileId: string, releaseId: string, isPrimary = true): Promise<void> {
    await db.insert(artistProfileReleases).values({
      artistProfileId,
      releaseId,
      isPrimary,
    }).onConflictDoNothing();
  }

  async getProfilesByRelease(releaseId: string): Promise<ArtistProfile[]> {
    const rows = await db.select({ profile: artistProfiles })
      .from(artistProfileReleases)
      .innerJoin(artistProfiles, eq(artistProfileReleases.artistProfileId, artistProfiles.id))
      .where(eq(artistProfileReleases.releaseId, releaseId));
    return rows.map(r => r.profile);
  }

  async submitFixerRequest(id: string, userId: string, targetSpotifyUri: string, notes: string): Promise<ArtistProfile | null> {
    if (!/^spotify:artist:[A-Za-z0-9]+$/.test(targetSpotifyUri)) {
      throw new Error('Invalid Spotify artist URI format. Expected: spotify:artist:<ID>');
    }

    const [updated] = await db.update(artistProfiles)
      .set({
        fixerPending: true,
        fixerTargetSpotifyUri: targetSpotifyUri,
        fixerNotes: notes || null,
        fixerStatus: 'pending',
        fixerRequestedAt: new Date(),
        fixerResolvedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(artistProfiles.id, id), eq(artistProfiles.userId, userId)))
      .returning();

    if (updated) {
      logger.info(`[ArtistProfile] Fixer request submitted: profile=${id}, target=${targetSpotifyUri}`);
    }
    return updated ?? null;
  }

  async resolveFixerRequest(id: string, approved: boolean): Promise<ArtistProfile | null> {
    const [profile] = await db.select().from(artistProfiles).where(eq(artistProfiles.id, id)).limit(1);
    if (!profile) return null;

    const updates: Partial<ArtistProfile> = {
      fixerPending: false,
      fixerStatus: approved ? 'resolved' : 'rejected',
      fixerResolvedAt: new Date(),
      updatedAt: new Date(),
    };

    if (approved && profile.fixerTargetSpotifyUri) {
      const spotifyId = profile.fixerTargetSpotifyUri.replace('spotify:artist:', '');
      updates.spotifyArtistId = spotifyId;
      updates.spotifyArtistUri = profile.fixerTargetSpotifyUri;
    }

    const [updated] = await db.update(artistProfiles)
      .set(updates)
      .where(eq(artistProfiles.id, id))
      .returning();

    logger.info(`[ArtistProfile] Fixer request ${approved ? 'approved' : 'rejected'}: profile=${id}`);
    return updated ?? null;
  }

  // ── Auto-discover: search all platforms, score each result, pick top match ──

  private _scoreSpotify(result: SpotifyArtistResult, query: string): number {
    let score = 0;
    const nameSim = this._nameSimilarity(result.name, query);
    // Name similarity dominates scoring — use a graded scale
    if (nameSim >= 95) score += 50;        // Effectively exact after normalization
    else if (nameSim >= 70) score += 38;   // Strong partial match / contains
    else if (nameSim >= 40) score += 22;   // Shared words match
    else if (nameSim >= 20) score += 10;   // Weak match — flag as uncertain
    else return 0;                          // No meaningful name overlap — skip
    if (result.imageUrl) score += 8;
    if (result.popularity >= 60) score += 22;
    else if (result.popularity >= 30) score += 13;
    else if (result.popularity >= 10) score += 5;
    if (result.genres.length > 0) score += 5;
    if (result.followers >= 1_000_000) score += 10;
    else if (result.followers >= 100_000) score += 7;
    else if (result.followers >= 10_000) score += 4;
    else if (result.followers >= 1_000) score += 1;
    return Math.min(score, 100);
  }

  private _scoreDeezer(result: DeezerArtistResult, query: string): number {
    let score = 0;
    const nameSim = this._nameSimilarity(result.name, query);
    if (nameSim >= 95) score += 50;
    else if (nameSim >= 70) score += 38;
    else if (nameSim >= 40) score += 22;
    else if (nameSim >= 20) score += 10;
    else return 0;
    if (result.pictureUrl) score += 8;
    if (result.fans >= 500_000) score += 22;
    else if (result.fans >= 50_000) score += 14;
    else if (result.fans >= 5_000) score += 6;
    else if (result.fans >= 500) score += 2;
    return Math.min(score, 100);
  }

  private _scoreApple(result: AppleArtistResult, query: string): number {
    let score = 0;
    const nameSim = this._nameSimilarity(result.name, query);
    if (nameSim >= 95) score += 55;        // Apple has no popularity — weight name more
    else if (nameSim >= 70) score += 40;
    else if (nameSim >= 40) score += 24;
    else if (nameSim >= 20) score += 10;
    else return 0;
    if (result.genres.length > 0) score += 8;
    return Math.min(score, 100);
  }

  private _scoreMusicBrainz(result: MusicBrainzArtistResult, query: string): number {
    let score = 0;
    const nameSim = this._nameSimilarity(result.name, query);
    if (nameSim >= 95) score += 40;
    else if (nameSim >= 70) score += 28;
    else if (nameSim >= 40) score += 15;
    else return 0;
    // MusicBrainz provides its own relevance score (0-100)
    if (result.score >= 90) score += 30;
    else if (result.score >= 75) score += 20;
    else if (result.score >= 60) score += 10;
    // Artist type bonus — confirms it's actually a music artist
    if (result.type === 'Person' || result.type === 'Group') score += 15;
    // Genre tags confirm music category
    if (result.tags.length > 0) score += 5;
    return Math.min(score, 90); // Cap at 90 — MusicBrainz alone can't reach full confidence
  }

  private _scoreAudiomack(result: AudiomackArtistResult, query: string): number {
    let score = 0;
    const nameSim = this._nameSimilarity(result.name, query);
    if (nameSim >= 95) score += 55;
    else if (nameSim >= 70) score += 40;
    else if (nameSim >= 40) score += 22;
    else if (nameSim >= 20) score += 10;
    else return 0;
    if (result.imageUrl) score += 8;
    if (result.followers >= 100_000) score += 15;
    else if (result.followers >= 10_000) score += 8;
    else if (result.followers >= 1_000) score += 3;
    return Math.min(score, 100);
  }

  private _scoreJioSaavn(result: JioSaavnArtistResult, query: string): number {
    let score = 0;
    const nameSim = this._nameSimilarity(result.name, query);
    if (nameSim >= 95) score += 55;
    else if (nameSim >= 70) score += 40;
    else if (nameSim >= 40) score += 20;
    else if (nameSim >= 20) score += 10;
    else return 0;
    if (result.imageUrl) score += 8;
    return Math.min(score, 80); // JioSaavn alone caps at 80 (regional platform)
  }

  // Cross-platform validation: count how many API platforms confirmed a match.
  // Boosts overall confidence when ≥2 platforms agree — reduces false positives.
  private _crossValidationBonus(confirmedCount: number): number {
    if (confirmedCount >= 4) return 15;
    if (confirmedCount >= 3) return 10;
    if (confirmedCount >= 2) return 5;
    return 0;
  }

  async autoDiscover(profileId: string, userId: string): Promise<{
    spotify:     { result: SpotifyArtistResult;   confidence: number } | null;
    apple:       { result: AppleArtistResult;      confidence: number } | null;
    deezer:      { result: DeezerArtistResult;     confidence: number } | null;
    musicbrainz: { result: MusicBrainzArtistResult; confidence: number } | null;
    audiomack:   { result: AudiomackArtistResult;  confidence: number } | null;
    jiosaavn:    { result: JioSaavnArtistResult;   confidence: number } | null;
    urlDiscoveries: PlatformUrlDiscovery[];
    labelgridPlatforms: LabelGridArtistPlatformPresence[];
    labelgridConfigured: boolean;
    saved: boolean;
    savedFields: string[];
  }> {
    const profile = await this.getProfile(profileId, userId);
    if (!profile) throw new Error('Artist profile not found');

    const query = profile.artistName;

    // Search all API platforms + LabelGrid in parallel — single round-trip
    const [raw, lgArtist] = await Promise.all([
      this.searchAllPlatforms(query),
      labelGridService.searchArtistAcrossPlatforms(query).catch(() => null),
    ]);

    // Score each platform's results independently
    const topSpotify = raw.spotify
      .map(r => ({ result: r, confidence: this._scoreSpotify(r, query) }))
      .filter(r => r.confidence > 0)
      .sort((a, b) => b.confidence - a.confidence)[0] ?? null;

    const topApple = raw.apple
      .map(r => ({ result: r, confidence: this._scoreApple(r, query) }))
      .filter(r => r.confidence > 0)
      .sort((a, b) => b.confidence - a.confidence)[0] ?? null;

    const topDeezer = raw.deezer
      .map(r => ({ result: r, confidence: this._scoreDeezer(r, query) }))
      .filter(r => r.confidence > 0)
      .sort((a, b) => b.confidence - a.confidence)[0] ?? null;

    const topMusicBrainz = raw.musicbrainz
      .map(r => ({ result: r, confidence: this._scoreMusicBrainz(r, query) }))
      .filter(r => r.confidence > 0)
      .sort((a, b) => b.confidence - a.confidence)[0] ?? null;

    const topAudiomack = raw.audiomack
      .map(r => ({ result: r, confidence: this._scoreAudiomack(r, query) }))
      .filter(r => r.confidence > 0)
      .sort((a, b) => b.confidence - a.confidence)[0] ?? null;

    const topJioSaavn = raw.jiosaavn
      .map(r => ({ result: r, confidence: this._scoreJioSaavn(r, query) }))
      .filter(r => r.confidence > 0)
      .sort((a, b) => b.confidence - a.confidence)[0] ?? null;

    // Count preliminary API confirmations (before threshold check) for cross-validation
    const CONFIDENCE_THRESHOLD = 55;
    const prelimConfirmed = [topSpotify, topApple, topDeezer, topAudiomack]
      .filter(r => r !== null && r.confidence >= CONFIDENCE_THRESHOLD).length;
    const bonus = this._crossValidationBonus(prelimConfirmed);

    // Apply cross-validation bonus — if multiple platforms agree, boost each match
    const apply = <T>(r: { result: T; confidence: number } | null) =>
      r ? { result: r.result, confidence: Math.min(100, r.confidence + bonus) } : null;

    const finalSpotify     = apply(topSpotify);
    const finalApple       = apply(topApple);
    const finalDeezer      = apply(topDeezer);
    const finalMusicBrainz = apply(topMusicBrainz);
    const finalAudiomack   = apply(topAudiomack);
    const finalJioSaavn    = apply(topJioSaavn);

    const updates: Partial<InsertArtistProfile> = {};
    const savedFields: string[] = [];

    if (finalSpotify && finalSpotify.confidence >= CONFIDENCE_THRESHOLD && !profile.spotifyArtistId) {
      updates.spotifyArtistId = finalSpotify.result.id;
      updates.spotifyArtistUri = finalSpotify.result.uri;
      if (finalSpotify.result.imageUrl && !profile.profileImageUrl) {
        updates.profileImageUrl = finalSpotify.result.imageUrl;
      }
      if (finalSpotify.result.genres.length > 0 && (!profile.genres || profile.genres.length === 0)) {
        updates.genres = finalSpotify.result.genres.slice(0, 5);
      }
      savedFields.push('spotify');
    }

    if (finalApple && finalApple.confidence >= CONFIDENCE_THRESHOLD && !profile.appleArtistId) {
      updates.appleArtistId = finalApple.result.id;
      savedFields.push('apple');
    }

    if (finalDeezer && finalDeezer.confidence >= CONFIDENCE_THRESHOLD && !profile.deezerArtistId) {
      updates.deezerArtistId = finalDeezer.result.id;
      if (finalDeezer.result.pictureUrl && !profile.profileImageUrl && !updates.profileImageUrl) {
        updates.profileImageUrl = finalDeezer.result.pictureUrl;
      }
      savedFields.push('deezer');
    }

    if (finalAudiomack && finalAudiomack.confidence >= CONFIDENCE_THRESHOLD && !profile.soundcloudArtistId) {
      updates.soundcloudArtistId = finalAudiomack.result.slug || finalAudiomack.result.id;
      savedFields.push('audiomack');
    }

    // MusicBrainz and JioSaavn confirm identity but don't save separate platform ID fields
    if (finalMusicBrainz && finalMusicBrainz.confidence >= CONFIDENCE_THRESHOLD) {
      savedFields.push('musicbrainz_confirmed');
      logger.info(`[ArtistProfile] MusicBrainz confirmed: profile=${profileId} mbid=${finalMusicBrainz.result.id} score=${finalMusicBrainz.confidence}`);
    }

    if (finalJioSaavn && finalJioSaavn.confidence >= CONFIDENCE_THRESHOLD) {
      savedFields.push('jiosaavn_confirmed');
    }

    // Get LabelGrid platform presences — either from search result directly,
    // or by making a second call using the artist ID from the search result.
    let labelgridPlatforms: LabelGridArtistPlatformPresence[] = [];
    if (lgArtist) {
      if (lgArtist.platforms && lgArtist.platforms.length > 0) {
        labelgridPlatforms = lgArtist.platforms;
      } else {
        // Search result didn't embed platforms — fetch them separately
        labelgridPlatforms = await labelGridService.getArtistPlatformPresence(lgArtist.id).catch(() => []);
      }
      logger.info(`[ArtistProfile] LabelGrid: artist=${lgArtist.name} platforms=${labelgridPlatforms.length}`);
    }

    const labelgridConfigured = labelGridService.isApiConfigured();

    // Generate URL-template discoveries for all 97 DSPs.
    // These are generated once using the verified artist name — NOT fetched per platform.
    const urlDiscoveries = this.generateUrlDiscoveries(query);

    const saved = savedFields.filter(f => !f.endsWith('_confirmed')).length > 0;
    if (saved) {
      await this.updateProfile(profileId, userId, updates);
      logger.info(`[ArtistProfile] Auto-discover saved: profile=${profileId} platforms=[${savedFields.join(',')}]`);
    }

    if (bonus > 0) {
      logger.info(`[ArtistProfile] Cross-validation bonus +${bonus} applied: ${prelimConfirmed} platforms confirmed profile=${profileId}`);
    }

    return {
      spotify: finalSpotify,
      apple: finalApple,
      deezer: finalDeezer,
      musicbrainz: finalMusicBrainz,
      audiomack: finalAudiomack,
      jiosaavn: finalJioSaavn,
      urlDiscoveries,
      labelgridPlatforms,
      labelgridConfigured,
      saved,
      savedFields,
    };
  }

  async autoSync(profileId: string, userId: string): Promise<{
    synced: string[];
    changes: Record<string, unknown>;
  }> {
    const profile = await this.getProfile(profileId, userId);
    if (!profile) throw new Error('Artist profile not found');

    const updates: Partial<InsertArtistProfile> = {};
    const synced: string[] = [];
    const changes: Record<string, unknown> = {};

    if (profile.spotifyArtistId) {
      const fresh = await this.verifySpotifyArtist(profile.spotifyArtistId);
      if (fresh) {
        synced.push('spotify');
        if (fresh.imageUrl && fresh.imageUrl !== profile.profileImageUrl) {
          updates.profileImageUrl = fresh.imageUrl;
          changes.profileImageUrl = fresh.imageUrl;
        }
        if (fresh.genres.length > 0) {
          const existing = JSON.stringify((profile.genres ?? []).slice().sort());
          const incoming = JSON.stringify(fresh.genres.slice().sort());
          if (existing !== incoming) {
            updates.genres = fresh.genres.slice(0, 5);
            changes.genres = fresh.genres.slice(0, 5);
          }
        }
        if (!profile.isVerified) {
          updates.isVerified = true;
          updates.verifiedAt = new Date();
          changes.isVerified = true;
        }
      }
    }

    if (profile.deezerArtistId) {
      try {
        const res = await fetch(`https://api.deezer.com/artist/${profile.deezerArtistId}`, {
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const d = await res.json() as any;
          synced.push('deezer');
          if (d.picture_medium && d.picture_medium !== profile.profileImageUrl && !updates.profileImageUrl) {
            updates.profileImageUrl = d.picture_medium;
            changes.profileImageUrl = d.picture_medium;
          }
        }
      } catch {
        logger.warn(`[ArtistProfile] Deezer sync failed for profile=${profileId}`);
      }
    }

    if (Object.keys(updates).length > 0) {
      await this.updateProfile(profileId, userId, updates);
      logger.info(`[ArtistProfile] Auto-sync updated: profile=${profileId} synced=[${synced.join(',')}]`);
    }

    return { synced, changes };
  }

  buildDistributionMetadata(profile: ArtistProfile): Record<string, string | null> {
    return {
      artistName: profile.artistName,
      isNewArtist: profile.isNewArtist ? 'true' : 'false',
      spotifyArtistId: profile.spotifyArtistId ?? null,
      spotifyArtistUri: profile.spotifyArtistUri ?? null,
      appleArtistId: profile.appleArtistId ?? null,
      youtubeChannelId: profile.youtubeChannelId ?? null,
      tidalArtistId: profile.tidalArtistId ?? null,
      deezerArtistId: profile.deezerArtistId ?? null,
      soundcloudArtistId: profile.soundcloudArtistId ?? null,
      amazonMusicArtistId: profile.amazonMusicArtistId ?? null,
    };
  }
}

export const artistProfileService = new ArtistProfileService();
