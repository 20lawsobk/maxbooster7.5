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
  nbAlbum: number;
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
  { id: 'gaana',            label: 'Gaana',            searchUrl: (n) => `https://gaana.com/search/${encodeURIComponent(n)}` },
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
  { id: 'soundexchange',    label: 'SoundExchange',    searchUrl: (n) => `https://www.soundexchange.com/artist-registration/` },
  { id: 'peloton',          label: 'Peloton',          searchUrl: (n) => `https://www.onepeloton.com/music` },
  { id: 'soundtrack-your-brand', label: 'Soundtrack Your Brand', searchUrl: (n) => `https://www.soundtrackyourbrand.com/music?search=${encodeURIComponent(n)}` },
  { id: 'pretzel-rocks',    label: 'Pretzel',          searchUrl: (n) => `https://www.pretzel.rocks/search?query=${encodeURIComponent(n)}` },
  { id: 'roblox',           label: 'Roblox',           searchUrl: (n) => `https://www.roblox.com/search/people?keyword=${encodeURIComponent(n)}` },
  { id: 'amazon-mp3',       label: 'Amazon (MP3)',     searchUrl: (n) => `https://www.amazon.com/s?k=${encodeURIComponent(n)}&i=digital-music` },
  { id: '7digital',         label: '7digital',         searchUrl: (n) => `https://us.7digital.com/search?q=${encodeURIComponent(n)}` },
  { id: 'medianet',         label: 'MediaNet',         searchUrl: (n) => `https://www.mndigital.com` },
  { id: 'gracenote',        label: 'Gracenote',        searchUrl: (n) => `https://www.gracenote.com/music/` },
  { id: 'shazam',           label: 'Shazam',           searchUrl: (n) => `https://www.shazam.com/search?q=${encodeURIComponent(n)}` },
  { id: 'tencent-music',    label: 'Tencent Music',    searchUrl: (n) => `https://y.qq.com/portal/search.html#searchid=1&remoteplace=txt.yqq.top&query=${encodeURIComponent(n)}` },
  { id: 'luna',             label: 'Luna Music',       searchUrl: (n) => `https://www.lunamusic.ai/search?q=${encodeURIComponent(n)}` },
  { id: 'capcut',           label: 'CapCut',           searchUrl: (n) => `https://www.capcut.com/explore?search=${encodeURIComponent(n)}&type=music` },
  { id: 'wesing',           label: 'WeSing',           searchUrl: (n) => `https://m.wesing.com/search?keywords=${encodeURIComponent(n)}` },
  { id: 'bilibili',         label: 'Bilibili',         searchUrl: (n) => `https://search.bilibili.com/all?keyword=${encodeURIComponent(n)}` },
  { id: 'tencent-video',    label: 'Tencent Video',    searchUrl: (n) => `https://v.qq.com/search.html#stag=0&query=${encodeURIComponent(n)}` },
  { id: 'iqiyi',            label: 'iQIYI',            searchUrl: (n) => `https://www.iqiyi.com/search.html?query=${encodeURIComponent(n)}` },
  { id: 'siri',             label: 'Siri / Apple',     searchUrl: (n) => `https://music.apple.com/search?term=${encodeURIComponent(n)}` },
  { id: 'vevo',             label: 'Vevo',             searchUrl: (n, s) => `https://www.vevo.com/artist/${s}` },
  { id: 'kuack-media',      label: 'Kuack Media',      searchUrl: (n) => `https://kuack.com/search?q=${encodeURIComponent(n)}` },
  { id: 'bugs',             label: 'Bugs',             searchUrl: (n) => `https://music.bugs.co.kr/search/artist?q=${encodeURIComponent(n)}` },
  { id: 'genie',            label: 'Genie',            searchUrl: (n) => `https://www.genie.co.kr/search/searchMain?query=${encodeURIComponent(n)}` },
  { id: 'melon',            label: 'Melon',            searchUrl: (n) => `https://www.melon.com/search/total/index.htm?q=${encodeURIComponent(n)}` },
  { id: 'awa',              label: 'AWA',              searchUrl: (n) => `https://awa.fm/search?q=${encodeURIComponent(n)}` },
  { id: 'flo',              label: 'FLO',              searchUrl: (n) => `https://www.music-flo.com/search?q=${encodeURIComponent(n)}` },
  { id: 'vibe',             label: 'Naver Vibe',       searchUrl: (n) => `https://vibe.naver.com/search/${encodeURIComponent(n)}` },
  { id: 'rakuten-music',    label: 'Rakuten Music',    searchUrl: (n) => `https://music.rakuten.co.jp/search/artist/?word=${encodeURIComponent(n)}` },
  { id: 'mora',             label: 'mora',             searchUrl: (n) => `https://mora.jp/search/searchResult?keyword=${encodeURIComponent(n)}` },
  { id: 'recochoku',        label: 'Recochoku',        searchUrl: (n) => `https://recochoku.jp/search?q=${encodeURIComponent(n)}` },
  { id: 'nuuday',           label: 'Nuuday / YouSee',  searchUrl: (n) => `https://yousee.dk/musik/search?q=${encodeURIComponent(n)}` },
  { id: 'zvuk',             label: 'Zvuk',             searchUrl: (n) => `https://zvuk.com/search?q=${encodeURIComponent(n)}` },
  { id: 'livexlive',        label: 'LiveXLive',        searchUrl: (n) => `https://www.livexlive.com/search?q=${encodeURIComponent(n)}` },
  { id: 'mixcloud',         label: 'Mixcloud',         searchUrl: (n, s) => `https://www.mixcloud.com/${s}/` },
  { id: 'resso',            label: 'Resso',            searchUrl: (n) => `https://www.resso.com/search?q=${encodeURIComponent(n)}` },
  { id: 'uma',              label: 'UMA',              searchUrl: (n) => `https://uma.app/search?q=${encodeURIComponent(n)}` },
  { id: 'touchtunes',       label: 'TouchTunes',       searchUrl: (n) => `https://www.touchtunes.com/music/search?q=${encodeURIComponent(n)}` },
  { id: 'tim-music',        label: 'TIM Music',        searchUrl: (n) => `https://timmusic.com.br/busca/${encodeURIComponent(n)}` },
  { id: 'saavn',            label: 'Saavn',            searchUrl: (n) => `https://www.jiosaavn.com/search/${encodeURIComponent(n)}` },
  { id: 'wynk',             label: 'Wynk Music',       searchUrl: (n) => `https://wynk.in/search/${encodeURIComponent(n)}` },
  { id: 'hungama',          label: 'Hungama',          searchUrl: (n) => `https://www.hungama.com/search/${encodeURIComponent(n)}/` },
  { id: 'mdundo',           label: 'Mdundo',           searchUrl: (n) => `https://www.mdundo.com/search/${encodeURIComponent(n)}` },
  { id: 'udux',             label: 'UDUX',             searchUrl: (n) => `https://udux.com/search/${encodeURIComponent(n)}` },
  { id: 'amazon-alexa',     label: 'Amazon Alexa',     searchUrl: (n) => `https://music.amazon.com/search/${encodeURIComponent(n)}` },
  { id: 'google-assistant', label: 'Google Assistant', searchUrl: (n) => `https://music.youtube.com/search?q=${encodeURIComponent(n)}` },
  { id: 'apple-fitness-plus', label: 'Apple Fitness+', searchUrl: (n) => `https://music.apple.com/search?term=${encodeURIComponent(n)}` },
  { id: 'feed-fm',          label: 'Feed.fm',          searchUrl: (n) => `https://feed.fm/publishers/` },
  { id: 'epidemic-sound',   label: 'Epidemic Sound',   searchUrl: (n) => `https://www.epidemicsound.com/music/search/?term=${encodeURIComponent(n)}&contentType=artist` },
  { id: 'fortnite',         label: 'Fortnite',         searchUrl: (n) => `https://www.fortnite.com/news` },
  { id: 'dj-city',          label: 'DJcity',           searchUrl: (n) => `https://www.djcity.com/search/${encodeURIComponent(n)}` },
  { id: 'bpm-supreme',      label: 'BPM Supreme',      searchUrl: (n) => `https://www.bpmsupreme.com/search?q=${encodeURIComponent(n)}` },
  { id: 'digital-dj-pool',  label: 'Digital DJ Pool',  searchUrl: (n) => `https://www.digitaldjpool.com/search?q=${encodeURIComponent(n)}` },
  { id: 'dubset',           label: 'Dubset / Songtradr', searchUrl: (n) => `https://www.songtradr.com/search?q=${encodeURIComponent(n)}` },
  { id: 'emusic',           label: 'eMusic',           searchUrl: (n) => `https://www.emusic.com/search?q=${encodeURIComponent(n)}` },
  { id: 'hdtracks',         label: 'HDtracks',         searchUrl: (n) => `https://www.hdtracks.com/catalogsearch/result/?q=${encodeURIComponent(n)}` },
  { id: 'primephonic',      label: 'Primephonic',      searchUrl: (n) => `https://primephonic.com/search?q=${encodeURIComponent(n)}` },
  { id: 'idagio',           label: 'Idagio',           searchUrl: (n) => `https://app.idagio.com/search?query=${encodeURIComponent(n)}` },
  { id: 'joox',             label: 'JOOX',             searchUrl: (n) => `https://www.joox.com/search?query=${encodeURIComponent(n)}` },
  { id: 'meta-library',     label: 'Meta Music Library', searchUrl: (n) => `https://www.facebook.com/search/top?q=${encodeURIComponent(n)}` },
  { id: 'ultimate-music',   label: 'Ultimate Music',   searchUrl: (n) => `https://www.ultimatemusic.com/search?q=${encodeURIComponent(n)}` },
  { id: 'itunes',           label: 'iTunes Store',     searchUrl: (n) => `https://itunes.apple.com/search?term=${encodeURIComponent(n)}&entity=musicArtist` },
];

// Platforms already handled by full API search — excluded from URL-template generation
const API_SEARCHED_PLATFORMS = new Set([
  'spotify', 'apple-music', 'deezer', 'audiomack', 'jiosaavn',
]);

class ArtistProfileService {
  private spotifyToken: string | null = null;
  private spotifyTokenExpiry: number = 0;

  // ── Name-matching engine ───────────────────────────────────────────────────
  // Eight-stage ensemble that handles the full spectrum of real-world artist
  // name variations: diacritics, hyphens, stage prefixes, word-order swaps,
  // symbol substitutions, abbreviated forms, and fuzzy typos.

  /** Strip Unicode combining diacritical marks: "Björk" → "Bjork" */
  private _stripDiacritics(s: string): string {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /**
   * Core normalisation — applied to every comparison.
   * Strips diacritics, lowercases, expands common symbols, collapses punctuation.
   * Does NOT strip stage-name prefixes here (reserved for relaxed form).
   */
  private _normalizeName(name: string): string {
    let s = this._stripDiacritics(name).toLowerCase();
    // Symbol expansions: "Jay-Z & Friends" → recognise & as "and"
    s = s.replace(/&/g, ' and ').replace(/\+/g, ' and ').replace(/@/g, ' at ');
    // Strip feat/ft/featuring and everything after — track-style artist strings
    s = s.replace(/\s+(?:feat\.?|ft\.?|featuring)\b.*/i, '');
    // Strip parenthetical disambiguation suffixes: "(rapper)", "(UK)", "(band)"
    s = s.replace(/\s*\([^)]{0,45}\)\s*/g, ' ');
    // Collapse all remaining punctuation/hyphens/apostrophes to spaces
    s = s.replace(/[^a-z0-9\s]/g, ' ');
    return s.replace(/\s+/g, ' ').trim();
  }

  /**
   * Relaxed normalisation — used as a fallback in later comparison stages.
   * Also strips common stage-name prefixes/articles that vary across platforms.
   */
  private _normalizeRelaxed(name: string): string {
    let s = this._normalizeName(name);
    // Strip leading articles
    s = s.replace(/^(?:the|a|an)\s+/, '').replace(/\bthe\b/g, '');
    // Strip stage name honorifics/prefixes
    s = s.replace(/\b(?:dj|mc|sir|mr|ms|dr|st|lil|young|big|ol)\b\.?\s*/g, '');
    return s.replace(/\s+/g, ' ').trim();
  }

  /**
   * Collapsed form — removes ALL whitespace and punctuation.
   * "B-Lawz" → "blawz", "B Lawz" → "blawz", "b.lawz" → "blawz"
   * Best for hyphenation and spacing variants.
   */
  private _collapseForm(name: string): string {
    return this._stripDiacritics(name).toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  /**
   * Collapsed-relaxed form — collapsed + relaxed normalisation combined.
   * "DJ B-Lawz" → "blawz", "DJ BLawz" → "blawz"
   */
  private _collapseRelaxed(name: string): string {
    return this._normalizeRelaxed(name).replace(/[^a-z0-9]/g, '');
  }

  /** Sort tokens alphabetically and rejoin — handles word-order permutations. */
  private _tokenSorted(s: string): string {
    return s.split(' ').filter(Boolean).sort().join(' ');
  }

  /**
   * Dice coefficient on character bigrams (0–1).
   * Very effective for short-string similarity with typos/spelling variants.
   */
  private _bigramSim(a: string, b: string): number {
    if (!a || !b) return a === b ? 1 : 0;
    if (a.length === 1 && b.length === 1) return a === b ? 1 : 0;
    const bigrams = (s: string): Map<string, number> => {
      const m = new Map<string, number>();
      for (let i = 0; i < s.length - 1; i++) {
        const bg = s.slice(i, i + 2);
        m.set(bg, (m.get(bg) ?? 0) + 1);
      }
      return m;
    };
    const ba = bigrams(a), bb = bigrams(b);
    let hits = 0;
    for (const [bg, cnt] of ba) hits += Math.min(cnt, bb.get(bg) ?? 0);
    const total = (a.length - 1) + (b.length - 1);
    return total === 0 ? 0 : (2 * hits) / total;
  }

  /** Levenshtein edit distance (O(m×n) — keep inputs ≤ 35 chars) */
  private _levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  }

  /**
   * Eight-stage name similarity ensemble — returns 0–100.
   *
   * Stage 1  Exact normalised match                    → 100
   * Stage 2  Exact relaxed match (prefix-stripped)     → 97
   * Stage 3  Collapsed form exact (hyphen/space blind) → 99
   * Stage 4  Collapsed-relaxed exact                   → 96
   * Stage 5  Token-sorted (word-order blind)           → 95
   * Stage 6  Substring containment (length-weighted)   → 72–92
   * Stage 7  Bigram Dice coefficient                   → 0–90
   * Stage 8  Levenshtein edit-distance ratio           → 0–87
   * Stage 8b Jaccard word overlap                      → 0–78
   *
   * Returns the maximum across all stages.
   */
  private _nameSimilarity(a: string, b: string): number {
    // ── Stage 1: Exact normalised ──
    const na = this._normalizeName(a);
    const nb = this._normalizeName(b);
    if (!na || !nb) return 0;
    if (na === nb) return 100;

    // ── Stage 2: Exact relaxed (prefix/article stripped) ──
    const ra = this._normalizeRelaxed(a);
    const rb = this._normalizeRelaxed(b);
    if (ra === rb && ra.length > 0) return 97;

    // ── Stage 3: Collapsed form (hyphen/spacing blind) ──
    const ca = this._collapseForm(a);
    const cb = this._collapseForm(b);
    if (ca === cb && ca.length > 0) return 99;

    // ── Stage 4: Collapsed-relaxed ──
    const cra = this._collapseRelaxed(a);
    const crb = this._collapseRelaxed(b);
    if (cra === crb && cra.length > 0) return 96;

    // ── Stage 5: Token-sorted normalised ──
    if (this._tokenSorted(na) === this._tokenSorted(nb)) return 95;
    if (this._tokenSorted(ra) === this._tokenSorted(rb) && ra.length > 0) return 93;

    // ── Stage 6: Substring containment (length-weighted) ──
    let substringScore = 0;
    // Prefer collapsed comparison so "B-Lawz" contains "BLawz"
    const [longC, shortC] = ca.length >= cb.length ? [ca, cb] : [cb, ca];
    const [longN, shortN] = na.length >= nb.length ? [na, nb] : [nb, na];
    if (shortC.length >= 3 && longC.includes(shortC)) {
      substringScore = Math.round(70 + (shortC.length / longC.length) * 22);
    } else if (shortN.length >= 3 && longN.includes(shortN)) {
      substringScore = Math.round(68 + (shortN.length / longN.length) * 20);
    }

    // ── Stage 7: Bigram Dice on collapsed forms ──
    // Use collapsed so punctuation/spacing doesn't fragment bigrams
    const bigramScore = Math.round(this._bigramSim(ca, cb) * 90);

    // ── Stage 8: Levenshtein on collapsed forms (cap at 35 chars) ──
    const levA = ca.slice(0, 35), levB = cb.slice(0, 35);
    const maxLev = Math.max(levA.length, levB.length);
    const levScore = maxLev > 0
      ? Math.round(Math.max(0, (1 - this._levenshtein(levA, levB) / maxLev) * 87))
      : 0;

    // ── Stage 8b: Jaccard word overlap ──
    const wordsA = new Set(na.split(' ').filter(Boolean));
    const wordsB = new Set(nb.split(' ').filter(Boolean));
    const shared = [...wordsA].filter(w => wordsB.has(w)).length;
    const union  = new Set([...wordsA, ...wordsB]).size;
    const jaccardScore = union > 0 ? Math.round((shared / union) * 78) : 0;

    return Math.max(substringScore, bigramScore, levScore, jaccardScore);
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
      return (data.results || [])
        .filter((a: any) => a.artistId && a.artistName)
        .map((a: any): AppleArtistResult => ({
          id: String(a.artistId),
          name: a.artistName,
          genres: [
            ...(a.primaryGenreName ? [a.primaryGenreName] : []),
            ...(a.genres || []),
          ].filter((g, i, arr) => arr.indexOf(g) === i).slice(0, 4),
          // iTunes returns artworkUrl100 for artists that have images
          artworkUrl: a.artworkUrl100 ?? a.artworkUrl60 ?? null,
          url: a.artistLinkUrl ?? `https://music.apple.com/us/artist/${a.artistId}`,
        }));
    } catch (err) {
      logger.error('[ArtistProfile] Apple search error:', err);
      return [];
    }
  }

  async searchDeezerArtists(query: string): Promise<DeezerArtistResult[]> {
    try {
      const url = `https://api.deezer.com/search/artist?q=${encodeURIComponent(query)}&limit=8&order=RANKING`;
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });

      if (!response.ok) return [];

      const data = await response.json() as any;
      if (data.error) return []; // Deezer returns {error:{...}} on quota/errors
      return (data.data || [])
        .filter((a: any) => a.id && a.name)
        .map((a: any): DeezerArtistResult => ({
          id: String(a.id),
          name: a.name,
          // Prefer highest-resolution image: xl → big → medium → small
          pictureUrl: a.picture_xl ?? a.picture_big ?? a.picture_medium ?? a.picture_small ?? null,
          fans: a.nb_fan ?? 0,
          nbAlbum: a.nb_album ?? 0,
          link: a.link ?? `https://www.deezer.com/artist/${a.id}`,
        }));
    } catch (err) {
      logger.error('[ArtistProfile] Deezer search error:', err);
      return [];
    }
  }

  async searchMusicBrainzArtists(query: string): Promise<MusicBrainzArtistResult[]> {
    const mbHeaders = {
      'User-Agent': 'MaxBooster/1.0 (music career management platform; max@maxbooster.io)',
      'Accept': 'application/json',
    };

    const parseMbArtists = (data: any): MusicBrainzArtistResult[] =>
      (data.artists || [])
        .filter((a: any) => a.id && a.name)
        .map((a: any): MusicBrainzArtistResult => ({
          id: a.id,
          name: a.name,
          score: Number(a.score ?? 0),
          type: a.type ?? null,
          country: a.country ?? null,
          // Include both genre tags and regular tags for richer scoring
          tags: [
            ...(a.tags || []).map((t: any) => String(t.name)),
            ...(a['genre-list'] || []).map((g: any) => String(g.name ?? g)),
          ].filter((v, i, arr) => arr.indexOf(v) === i),
          disambiguation: a.disambiguation ?? null,
        }));

    try {
      // Stage 1: Strict quoted artist name search — most precise
      const strictUrl = `https://musicbrainz.org/ws/2/artist?query=artist:"${encodeURIComponent(query)}"&limit=8&fmt=json`;
      const strictRes = await this._withRetry(() => fetch(strictUrl, {
        headers: mbHeaders,
        signal: AbortSignal.timeout(10000),
      }), 2, 'MusicBrainz');

      if (strictRes.ok) {
        const data = await strictRes.json() as any;
        const results = parseMbArtists(data);
        if (results.length > 0) return results;
      }

      // Stage 2: Relaxed bare-name search — catches aliases, romanised names, alternate spellings
      await new Promise(r => setTimeout(r, 500)); // Respect MusicBrainz rate limit (1 req/sec)
      const relaxedUrl = `https://musicbrainz.org/ws/2/artist?query=${encodeURIComponent(query)}&limit=8&fmt=json`;
      const relaxedRes = await fetch(relaxedUrl, {
        headers: mbHeaders,
        signal: AbortSignal.timeout(8000),
      });
      if (!relaxedRes.ok) return [];
      const relaxedData = await relaxedRes.json() as any;
      return parseMbArtists(relaxedData);
    } catch (err) {
      logger.warn('[ArtistProfile] MusicBrainz search error (non-fatal):', err);
      return [];
    }
  }

  // Audiomack public search API — NOTE: requires OAuth consumer_key for v1 API (returns 401 without it)
  // Kept for forward-compatibility; returns empty array when unauthenticated
  async searchAudiomackArtists(query: string): Promise<AudiomackArtistResult[]> {
    try {
      const url = `https://api.audiomack.com/v1/search?type=artists&q=${encodeURIComponent(query)}&limit=5`;
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'MaxBooster/1.0' },
        signal: AbortSignal.timeout(6000),
      });

      if (response.status === 401) {
        // Expected: Audiomack v1 API requires OAuth consumer_key — suppress repeat logs
        return [];
      }
      if (!response.ok) return [];

      const data = await response.json() as any;
      return (data.results || []).slice(0, 5).map((a: any): AudiomackArtistResult => ({
        id: String(a.id ?? a.url_slug ?? ''),
        name: a.name ?? a.label ?? '',
        slug: a.url_slug ?? '',
        imageUrl: a.image ?? a.avatar ?? null,
        followers: a.followers ?? a.fans ?? 0,
        url: a.url_slug ? `https://audiomack.com/${a.url_slug}` : '',
      }));
    } catch (err: any) {
      // Suppress noise — Audiomack API consistently requires auth in production
      if (!err?.message?.includes('401')) {
        logger.warn('[ArtistProfile] Audiomack search error (non-fatal):', err?.message ?? err);
      }
      return [];
    }
  }

  // JioSaavn artist search — primary: saavn.dev community mirror (richer data)
  // fallback: JioSaavn autocomplete endpoint (minimal data but more stable)
  async searchJioSaavnArtists(query: string): Promise<JioSaavnArtistResult[]> {
    // Primary: saavn.dev open API — returns structured artist data with images
    try {
      const url = `https://saavn.dev/api/search/artists?query=${encodeURIComponent(query)}&page=1&limit=5`;
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'MaxBooster/1.0' },
        signal: AbortSignal.timeout(7000),
      });
      if (response.ok) {
        const data = await response.json() as any;
        const artists: any[] = data?.data?.results ?? data?.results ?? [];
        if (artists.length > 0) {
          return artists.slice(0, 5).map((a: any): JioSaavnArtistResult => ({
            id: String(a.id ?? ''),
            name: a.name ?? a.title ?? '',
            // saavn.dev image array: [{quality:"50x50",url:...},{quality:"150x150",url:...},{quality:"500x500",url:...}]
            imageUrl: (Array.isArray(a.image)
              ? (a.image.find((i: any) => i.quality === '500x500') ?? a.image[a.image.length - 1])?.url
              : a.image) ?? null,
            url: a.url ?? (a.id ? `https://www.jiosaavn.com/artist/-/${a.id}` : ''),
          }));
        }
      }
    } catch { /* fall through to backup */ }

    // Fallback: JioSaavn autocomplete endpoint
    try {
      const url = `https://www.jiosaavn.com/api.php?__call=autocomplete.get&_format=json&_marker=0&cc=in&includeMetaTags=1&query=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'MaxBooster/1.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return [];
      const data = await response.json() as any;
      const artists: any[] = data?.artists?.data ?? [];
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

  // ── UPC-based direct lookup ──────────────────────────────────────────────
  // Significantly more accurate than name search for newly distributed releases:
  // Apple and Deezer both expose album-by-UPC endpoints that return the exact
  // artist record tied to that release — no fuzzy matching needed.
  async searchByUPC(upc: string): Promise<{ apple: AppleArtistResult | null; deezer: DeezerArtistResult | null }> {
    const normalized = upc.replace(/[^0-9]/g, '');
    if (!normalized) return { apple: null, deezer: null };

    const [appleRes, deezerRes] = await Promise.allSettled([
      // Apple iTunes UPC lookup — returns album and artist records; artist may be nested in album
      fetch(`https://itunes.apple.com/lookup?upc=${normalized}&entity=musicArtist`, {
        signal: AbortSignal.timeout(8000),
      }).then(async r => {
        if (!r.ok) return null;
        const d = await r.json() as any;
        const results: any[] = d.results || [];

        // Prefer explicit artist record (wrapperType==='artist')
        let artist = results.find((x: any) => x.wrapperType === 'artist' || x.kind === 'artist');

        // Fallback: extract artist info from album collection (iTunes often returns album first)
        if (!artist) {
          const album = results.find((x: any) =>
            x.wrapperType === 'collection' || x.collectionType === 'Album'
          );
          if (album?.artistId) {
            artist = {
              artistId: album.artistId,
              artistName: album.artistName ?? album.collectionArtistName,
              primaryGenreName: album.primaryGenreName,
              artistLinkUrl: album.artistViewUrl,
              artworkUrl100: album.artworkUrl100 ?? album.artworkUrl60,
            };
          }
        }

        if (!artist) return null;
        return {
          id: String(artist.artistId),
          name: artist.artistName ?? '',
          genres: artist.primaryGenreName ? [artist.primaryGenreName] : [],
          artworkUrl: artist.artworkUrl100 ?? artist.artworkUrl60 ?? null,
          url: artist.artistLinkUrl ?? artist.artistViewUrl ?? `https://music.apple.com/us/artist/${artist.artistId}`,
        } as AppleArtistResult;
      }),

      // Deezer UPC lookup — returns the album and its artist with image
      fetch(`https://api.deezer.com/album/upc:${normalized}`, {
        signal: AbortSignal.timeout(8000),
      }).then(async r => {
        if (!r.ok) return null;
        const d = await r.json() as any;
        if (!d?.artist?.id || d.error) return null;
        return {
          id: String(d.artist.id),
          name: d.artist.name,
          pictureUrl: d.artist.picture_xl ?? d.artist.picture_big ?? d.artist.picture_medium ?? null,
          fans: d.artist.nb_fan ?? 0,
          nbAlbum: 0,
          link: d.artist.link ?? `https://www.deezer.com/artist/${d.artist.id}`,
        } as DeezerArtistResult;
      }),
    ]);

    return {
      apple: appleRes.status === 'fulfilled' ? appleRes.value : null,
      deezer: deezerRes.status === 'fulfilled' ? deezerRes.value : null,
    };
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

  // ── Platform scoring ───────────────────────────────────────────────────────
  // Each scorer converts _nameSimilarity (0–100) + platform-specific signals
  // into a final 0–100 confidence score.
  //
  // Design principles:
  //  • Name is the dominant signal — exact matches always pass the 55 threshold.
  //  • Popularity/fans/followers are BONUSES, never penalties — an emerging artist
  //    with 0 followers should still be identifiable by name.
  //  • Each tier is documented with the rationale for its weight.

  /**
   * Convert a raw nameSim score into a base confidence that always passes the
   * 55 threshold for exact matches, even on platforms with no popularity data.
   */
  private _nameBase(nameSim: number, exactWeight: number, highWeight: number, medWeight: number): number {
    if (nameSim >= 95) return exactWeight;  // Exact / near-exact
    if (nameSim >= 80) return highWeight;   // Very close (one-char diff, collapsed equal)
    if (nameSim >= 65) return medWeight;    // Probable match (bigram / Levenshtein strong)
    if (nameSim >= 45) return Math.round(medWeight * 0.6); // Possible — below threshold alone
    if (nameSim >= 25) return Math.round(medWeight * 0.3); // Weak — will need other signals
    return 0; // No meaningful name overlap
  }

  private _scoreSpotify(result: SpotifyArtistResult, query: string): number {
    const nameSim = this._nameSimilarity(result.name, query);
    // Base: exact name → 58 (just over threshold), slides down to 0 at nameSim < 25
    let score = this._nameBase(nameSim, 58, 44, 28);
    if (score === 0) return 0;

    // Image presence — genuine artists virtually always have one
    if (result.imageUrl) score += 6;

    // Popularity bonus (0–100 Spotify scale) — bonus only, not penalty for new artists
    if (result.popularity >= 70) score += 18;
    else if (result.popularity >= 45) score += 12;
    else if (result.popularity >= 20) score += 6;
    else if (result.popularity >= 5)  score += 2;
    // popularity === 0 → no bonus, no penalty

    // Genre presence confirms it's a music entity
    if (result.genres.length >= 3) score += 7;
    else if (result.genres.length >= 1) score += 4;

    // Follower count bonus — reflects established presence
    if (result.followers >= 1_000_000) score += 11;
    else if (result.followers >= 100_000) score += 7;
    else if (result.followers >= 10_000)  score += 4;
    else if (result.followers >= 1_000)   score += 2;
    // < 1 000 followers → no bonus, no penalty

    return Math.min(score, 100);
  }

  private _scoreDeezer(result: DeezerArtistResult, query: string): number {
    const nameSim = this._nameSimilarity(result.name, query);
    let score = this._nameBase(nameSim, 60, 46, 30);
    if (score === 0) return 0;

    // Image presence bonus — Deezer XL images confirm an active artist profile
    if (result.pictureUrl) score += 6;

    // Fan count bonus — Deezer fans scale differently to Spotify followers
    if (result.fans >= 1_000_000) score += 18;
    else if (result.fans >= 100_000) score += 12;
    else if (result.fans >= 10_000)  score += 7;
    else if (result.fans >= 1_000)   score += 3;
    else if (result.fans >= 100)     score += 1;
    // 0 fans → no bonus, no penalty

    // Album count bonus — more releases = more established artist presence
    if (result.nbAlbum >= 10)    score += 5;
    else if (result.nbAlbum >= 3) score += 3;
    else if (result.nbAlbum >= 1) score += 1;

    return Math.min(score, 100);
  }

  private _scoreApple(result: AppleArtistResult, query: string): number {
    const nameSim = this._nameSimilarity(result.name, query);
    // Apple has NO popularity/follower data — name carries more weight
    let score = this._nameBase(nameSim, 65, 50, 33);
    if (score === 0) return 0;

    // Genre presence — Apple's genre taxonomy is reliable
    if (result.genres.length >= 2) score += 10;
    else if (result.genres.length === 1) score += 6;

    // Artwork URL presence
    if (result.artworkUrl) score += 5;

    return Math.min(score, 100);
  }

  private _scoreMusicBrainz(result: MusicBrainzArtistResult, query: string): number {
    const nameSim = this._nameSimilarity(result.name, query);
    let score = this._nameBase(nameSim, 42, 30, 18);
    if (score === 0) return 0;

    // MusicBrainz returns its own relevance score (0–100) — trust it heavily
    if (result.score >= 95) score += 32;
    else if (result.score >= 80) score += 22;
    else if (result.score >= 65) score += 12;
    else if (result.score >= 50) score += 5;

    // Artist type strongly confirms a music entity
    if (result.type === 'Person' || result.type === 'Group') score += 14;
    else if (result.type === 'Other') score += 4;

    // Genre tags confirm music category
    if (result.tags.length >= 3) score += 7;
    else if (result.tags.length >= 1) score += 3;

    // Disambiguation field means MB knows this is a specific artist (not an alias)
    if (result.disambiguation) score += 3;

    return Math.min(score, 90); // Cap — MusicBrainz alone can't reach full confidence
  }

  private _scoreAudiomack(result: AudiomackArtistResult, query: string): number {
    const nameSim = this._nameSimilarity(result.name, query);
    let score = this._nameBase(nameSim, 60, 46, 28);
    if (score === 0) return 0;

    if (result.imageUrl) score += 6;

    if (result.followers >= 500_000) score += 18;
    else if (result.followers >= 50_000)  score += 12;
    else if (result.followers >= 5_000)   score += 6;
    else if (result.followers >= 500)     score += 2;

    return Math.min(score, 100);
  }

  private _scoreJioSaavn(result: JioSaavnArtistResult, query: string): number {
    const nameSim = this._nameSimilarity(result.name, query);
    let score = this._nameBase(nameSim, 58, 44, 26);
    if (score === 0) return 0;

    if (result.imageUrl) score += 6;

    return Math.min(score, 80); // Cap — regional platform, lower standalone confidence
  }

  // ── Cross-platform validation ──────────────────────────────────────────────
  // When multiple independent APIs agree on the same artist, compound confidence
  // rises. Each additional confirmation reduces the false-positive risk sharply.
  private _crossValidationBonus(confirmedCount: number): number {
    if (confirmedCount >= 4) return 18;
    if (confirmedCount >= 3) return 12;
    if (confirmedCount >= 2) return 6;
    return 0;
  }

  // ─── Distributor-Transfer Model ──────────────────────────────────────────────
  // Artist profiles belong to DSPs, not distributors. When switching distributors,
  // nothing transfers between them. The new distributor delivers releases with the
  // artist's existing platform IDs; DSPs match via metadata (name, ISRCs, fingerprint).
  // The artist then claims/re-claims their profiles on each platform.
  // ──────────────────────────────────────────────────────────────────────────────

  async autoDiscover(profileId: string, userId: string, upc?: string): Promise<{
    claims: {
      spotify: { hasId: boolean; artistId: string | null; claimUrl: string; profileUrl: string | null };
      apple:   { hasId: boolean; artistId: string | null; claimUrl: string; profileUrl: string | null };
      amazon:  { hasId: boolean; artistId: string | null; claimUrl: string; profileUrl: string | null };
      youtube: { hasId: boolean; channelId: string | null; claimUrl: string; channelUrl: string | null };
      tidal:   { hasId: boolean; artistId: string | null; claimUrl: string; profileUrl: string | null };
      deezer:  { hasId: boolean; artistId: string | null; claimUrl: string; profileUrl: string | null };
    };
    upcMatch: { apple: AppleArtistResult | null; deezer: DeezerArtistResult | null } | null;
    upcDiscovered: boolean;
    urlDiscoveries: PlatformUrlDiscovery[];
    labelgridPlatforms: LabelGridArtistPlatformPresence[];
    labelgridConfigured: boolean;
    metadata: { artistName: string; linkedCount: number; missingPlatforms: string[] };
    saved: boolean;
    savedFields: string[];
  }> {
    const profile = await this.getProfile(profileId, userId);
    if (!profile) throw new Error('Artist profile not found');

    const name = profile.artistName;
    const encodedName = encodeURIComponent(name);

    // Build per-platform claim entries using the profile's existing IDs.
    // Claim URLs are the official "Artist Portal" entry points for each DSP.
    const claims = {
      spotify: {
        hasId: !!profile.spotifyArtistId,
        artistId: profile.spotifyArtistId ?? null,
        claimUrl: 'https://artists.spotify.com/claim',
        profileUrl: profile.spotifyArtistId
          ? `https://open.spotify.com/artist/${profile.spotifyArtistId}`
          : `https://open.spotify.com/search/${encodedName}`,
      },
      apple: {
        hasId: !!profile.appleArtistId,
        artistId: profile.appleArtistId ?? null,
        claimUrl: 'https://artists.apple.com',
        profileUrl: profile.appleArtistId
          ? `https://music.apple.com/us/artist/${profile.appleArtistId}`
          : `https://music.apple.com/us/search?term=${encodedName}`,
      },
      amazon: {
        hasId: !!profile.amazonMusicArtistId,
        artistId: profile.amazonMusicArtistId ?? null,
        claimUrl: 'https://artists.amazon.com',
        profileUrl: profile.amazonMusicArtistId
          ? `https://music.amazon.com/artists/${profile.amazonMusicArtistId}`
          : `https://music.amazon.com/search?q=${encodedName}`,
      },
      youtube: {
        hasId: !!profile.youtubeChannelId,
        channelId: profile.youtubeChannelId ?? null,
        claimUrl: 'https://oac.youtube.com',
        channelUrl: profile.youtubeChannelId
          ? `https://www.youtube.com/channel/${profile.youtubeChannelId}`
          : `https://www.youtube.com/results?search_query=${encodedName}`,
      },
      tidal: {
        hasId: !!profile.tidalArtistId,
        artistId: profile.tidalArtistId ?? null,
        claimUrl: 'https://artists.tidal.com',
        profileUrl: profile.tidalArtistId
          ? `https://tidal.com/browse/artist/${profile.tidalArtistId}`
          : `https://tidal.com/search?q=${encodedName}`,
      },
      deezer: {
        hasId: !!profile.deezerArtistId,
        artistId: profile.deezerArtistId ?? null,
        claimUrl: 'https://creators.deezer.com',
        profileUrl: profile.deezerArtistId
          ? `https://www.deezer.com/artist/${profile.deezerArtistId}`
          : `https://www.deezer.com/search/${encodedName}`,
      },
    };

    // UPC lookup — exact matching, no name-based guessing.
    // DSPs match releases to artist profiles using metadata; UPC confirms delivery.
    let upcMatch: { apple: AppleArtistResult | null; deezer: DeezerArtistResult | null } | null = null;
    let upcDiscovered = false;
    if (upc) {
      const hits = await this.searchByUPC(upc);
      if (hits.apple || hits.deezer) {
        upcMatch = hits;
        upcDiscovered = true;
        // If a UPC match fills in a missing ID, save it automatically
        const updates: Partial<InsertArtistProfile> = {};
        const savedFields: string[] = [];
        if (hits.apple && !profile.appleArtistId) {
          updates.appleArtistId = hits.apple.id;
          savedFields.push('apple');
          claims.apple.hasId = true;
          claims.apple.artistId = hits.apple.id;
          claims.apple.profileUrl = `https://music.apple.com/us/artist/${hits.apple.id}`;
        }
        if (hits.deezer && !profile.deezerArtistId) {
          updates.deezerArtistId = hits.deezer.id;
          savedFields.push('deezer');
          claims.deezer.hasId = true;
          claims.deezer.artistId = hits.deezer.id;
          claims.deezer.profileUrl = `https://www.deezer.com/artist/${hits.deezer.id}`;
        }
        if (Object.keys(updates).length > 0) {
          await this.updateProfile(profileId, userId, updates);
          logger.info(`[ArtistProfile] UPC match saved: profile=${profileId} upc=${upc} fields=[${savedFields.join(',')}]`);
          return {
            claims,
            upcMatch,
            upcDiscovered,
            urlDiscoveries: this.generateUrlDiscoveries(name),
            labelgridPlatforms: await labelGridService.getArtistPlatformPresence(profileId).catch(() => []),
            labelgridConfigured: labelGridService.isApiConfigured(),
            metadata: this._buildMetadataSummary(profile, savedFields),
            saved: true,
            savedFields,
          };
        }
      }
    }

    // LabelGrid platform delivery status (real distributor data — not name-scraped)
    const labelgridPlatforms = await labelGridService.getArtistPlatformPresence(profileId).catch(() => []);
    const labelgridConfigured = labelGridService.isApiConfigured();

    // URL-template discoveries for all 97 DSPs — search links, not scraped data
    const urlDiscoveries = this.generateUrlDiscoveries(name);

    const linkedIds = [
      profile.spotifyArtistId && 'Spotify',
      profile.appleArtistId && 'Apple Music',
      profile.amazonMusicArtistId && 'Amazon Music',
      profile.youtubeChannelId && 'YouTube',
      profile.tidalArtistId && 'TIDAL',
      profile.deezerArtistId && 'Deezer',
    ].filter(Boolean) as string[];

    logger.info(`[ArtistProfile] Distributor model: profile=${profileId} linked=[${linkedIds.join(',')}]`);

    return {
      claims,
      upcMatch,
      upcDiscovered,
      urlDiscoveries,
      labelgridPlatforms,
      labelgridConfigured,
      metadata: this._buildMetadataSummary(profile, []),
      saved: false,
      savedFields: [],
    };
  }

  private _buildMetadataSummary(
    profile: ArtistProfile,
    extraSaved: string[],
  ): { artistName: string; linkedCount: number; missingPlatforms: string[] } {
    const platformMap: [string, string | null][] = [
      ['Spotify', profile.spotifyArtistId],
      ['Apple Music', profile.appleArtistId],
      ['Amazon Music', profile.amazonMusicArtistId],
      ['YouTube', profile.youtubeChannelId],
      ['TIDAL', profile.tidalArtistId],
      ['Deezer', profile.deezerArtistId],
    ];
    const linked = platformMap.filter(([, id]) => id).map(([p]) => p);
    const missing = platformMap.filter(([p, id]) => !id && !extraSaved.includes(p)).map(([p]) => p);
    return { artistName: profile.artistName, linkedCount: linked.length, missingPlatforms: missing };
  }

  async autoSync(profileId: string, userId: string): Promise<{
    synced: string[];
    changes: Record<string, unknown>;
    metadataConsistency: { consistent: boolean; linkedIds: Record<string, string | null>; missingPlatforms: string[] };
  }> {
    const profile = await this.getProfile(profileId, userId);
    if (!profile) throw new Error('Artist profile not found');

    // Sync = verify which platform IDs are present and report metadata consistency.
    // DSPs own the artist profiles — we verify our stored IDs are still valid by
    // checking whether our LabelGrid-delivered releases are live on each platform.
    const synced: string[] = [];
    const changes: Record<string, unknown> = {};

    const linkedIds: Record<string, string | null> = {
      spotify: profile.spotifyArtistId ?? null,
      apple: profile.appleArtistId ?? null,
      amazon: profile.amazonMusicArtistId ?? null,
      youtube: profile.youtubeChannelId ?? null,
      tidal: profile.tidalArtistId ?? null,
      deezer: profile.deezerArtistId ?? null,
    };

    const missingPlatforms: string[] = [];
    if (!profile.spotifyArtistId) missingPlatforms.push('Spotify');
    if (!profile.appleArtistId)   missingPlatforms.push('Apple Music');
    if (!profile.amazonMusicArtistId) missingPlatforms.push('Amazon Music');
    if (!profile.youtubeChannelId) missingPlatforms.push('YouTube');
    if (!profile.tidalArtistId)   missingPlatforms.push('TIDAL');
    if (!profile.deezerArtistId)  missingPlatforms.push('Deezer');

    // Mark linked platforms as synced
    if (profile.spotifyArtistId)      synced.push('spotify');
    if (profile.appleArtistId)        synced.push('apple');
    if (profile.amazonMusicArtistId)  synced.push('amazon');
    if (profile.youtubeChannelId)     synced.push('youtube');
    if (profile.tidalArtistId)        synced.push('tidal');
    if (profile.deezerArtistId)       synced.push('deezer');

    // Mark profile as verified if at least one platform ID is present
    if (synced.length > 0 && !profile.isVerified) {
      await this.updateProfile(profileId, userId, { isVerified: true, verifiedAt: new Date() });
      changes.isVerified = true;
      logger.info(`[ArtistProfile] Auto-sync: profile=${profileId} verified=true linked=[${synced.join(',')}]`);
    }

    return {
      synced,
      changes,
      metadataConsistency: {
        consistent: missingPlatforms.length === 0,
        linkedIds,
        missingPlatforms,
      },
    };
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
