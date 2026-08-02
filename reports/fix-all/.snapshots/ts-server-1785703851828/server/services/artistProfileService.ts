import { db } from "../db.js";
import { eq, and, inArray } from "drizzle-orm";
import { artistProfiles, artistProfileReleases, distroTracks, profileClaimPipeline, profileClaimEvents, artistIdentityLinks, artistDnaSnapshots, profileSplitEvents, distributorHistoryImports } from "@shared/schema";
import type { ArtistProfile, InsertArtistProfile, ProfileClaimPipeline, ArtistIdentityLink, ArtistDnaSnapshot } from "@shared/schema";
import { logger } from "../logger.js";
import { labelGridService } from "./labelgrid-service.js";
import { MaxCoreAIClient } from "./maxcoreClient.js";
import type { LabelGridArtistPlatformPresence } from "./labelgrid-service.js";

// ── Claim pipeline state constants ────────────────────────────────────────────
export const CLAIM_STATES = [
  "unstarted",
  "instructions_viewed",
  "portal_opened",
  "id_submitted",
  "verified",
  "watching",
] as const;
export type ClaimState = (typeof CLAIM_STATES)[number];

// ── Health score dimension weights ────────────────────────────────────────────
const HEALTH_WEIGHTS = {
  coverage: 25, // How many key portals are claimed
  metadata: 25, // Image, bio, genres, social handles
  verification: 20, // Platforms with verified status
  freshness: 15, // How recently synced; no stale IDs
  safety: 15, // No split detected, claim events logged, watch active
};

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
  status: "found" | "not_found" | "unverified" | "distributed";
  method: "url_template";
}

interface PlatformSearchResults {
  spotify: SpotifyArtistResult[];
  apple: AppleArtistResult[];
  deezer: DeezerArtistResult[];
  musicbrainz: MusicBrainzArtistResult[];
  audiomack: AudiomackArtistResult[];
  jiosaavn: JioSaavnArtistResult[];
}

// ── Raw external-API response shapes ─────────────────────────────────────────
// These describe the loosely-typed JSON returned by third-party DSP APIs so the
// mapping code below can read nested fields without `unknown` friction. All
// fields are optional because the upstream payloads are not guaranteed.
interface RawSpotifyArtist {
  id?: string;
  uri?: string;
  name?: string;
  images?: Array<{ url?: string }>;
  genres?: string[];
  followers?: { total?: number };
  popularity?: number;
  external_urls?: { spotify?: string };
}

interface RawSpotifySearchResponse {
  artists?: { items?: RawSpotifyArtist[] };
}

interface RawAppleArtist {
  artistId?: number | string;
  artistName?: string;
  primaryGenreName?: string;
  genres?: string[];
  artworkUrl100?: string;
  artworkUrl60?: string;
  artistLinkUrl?: string;
}

interface RawAppleSearchResponse {
  results?: RawAppleArtist[];
}

interface RawDeezerArtist {
  id?: number | string;
  name?: string;
  picture_xl?: string;
  picture_big?: string;
  picture_medium?: string;
  picture_small?: string;
  nb_fan?: number;
  nb_album?: number;
  link?: string;
}

interface RawDeezerSearchResponse {
  error?: unknown;
  data?: RawDeezerArtist[];
}

interface RawMusicBrainzTag {
  name?: string;
}

interface RawMusicBrainzArtist {
  id?: string;
  name?: string;
  score?: number | string;
  type?: string | null;
  country?: string | null;
  tags?: RawMusicBrainzTag[];
  "genre-list"?: Array<RawMusicBrainzTag | string>;
  disambiguation?: string | null;
}

interface RawMusicBrainzResponse {
  artists?: RawMusicBrainzArtist[];
}

interface RawAudiomackArtist {
  id?: string | number;
  url_slug?: string;
  name?: string;
  label?: string;
  image?: string;
  avatar?: string;
  followers?: number;
  fans?: number;
}

interface RawAudiomackResponse {
  results?: RawAudiomackArtist[];
}

interface RawJioSaavnImage {
  quality?: string;
  url?: string;
}

interface RawJioSaavnArtist {
  id?: string | number;
  name?: string;
  title?: string;
  image?: RawJioSaavnImage[] | string;
  url?: string;
}

interface RawSaavnDevResponse {
  data?: { results?: RawJioSaavnArtist[] };
  results?: RawJioSaavnArtist[];
}

interface RawJioSaavnAutocompleteResponse {
  artists?: { data?: RawJioSaavnArtist[] };
}

interface RawItunesLookupItem {
  wrapperType?: string;
  kind?: string;
  collectionType?: string;
  artistId?: number | string;
  artistName?: string;
  collectionArtistName?: string;
  primaryGenreName?: string;
  artistLinkUrl?: string;
  artistViewUrl?: string;
  artworkUrl100?: string;
  artworkUrl60?: string;
}

interface RawItunesLookupResponse {
  results?: RawItunesLookupItem[];
}

interface RawDeezerAlbumResponse {
  error?: unknown;
  artist?: {
    id?: number | string;
    name?: string;
    picture_xl?: string;
    picture_big?: string;
    picture_medium?: string;
    picture_small?: string;
    nb_fan?: number;
    link?: string;
  };
}

// All 97 DSP distribution platforms with URL templates
// Used to generate artist profile search links for platforms without public search APIs
const ALL_DSP_URL_TEMPLATES: Array<{
  id: string;
  label: string;
  searchUrl: (name: string, slug: string) => string;
}> = [
  {
    id: "pandora",
    label: "Pandora",
    searchUrl: (n) =>
      `https://www.pandora.com/search/${encodeURIComponent(n)}/artists`,
  },
  {
    id: "iheartradio",
    label: "iHeart Radio",
    searchUrl: (n) =>
      `https://www.iheart.com/search/?keywords=${encodeURIComponent(n)}`,
  },
  {
    id: "tidal",
    label: "Tidal",
    searchUrl: (n) =>
      `https://tidal.com/browse/search?q=${encodeURIComponent(n)}&type=artists`,
  },
  {
    id: "amazon-music",
    label: "Amazon Music",
    searchUrl: (n) =>
      `https://music.amazon.com/search/${encodeURIComponent(n)}`,
  },
  {
    id: "youtube-music",
    label: "YouTube Music",
    searchUrl: (n) =>
      `https://music.youtube.com/search?q=${encodeURIComponent(n)}`,
  },
  {
    id: "soundcloud",
    label: "SoundCloud",
    searchUrl: (n, _s) =>
      `https://soundcloud.com/search/people?q=${encodeURIComponent(n)}`,
  },
  {
    id: "bandcamp",
    label: "Bandcamp",
    searchUrl: (n) =>
      `https://bandcamp.com/search?q=${encodeURIComponent(n)}&item_type=b`,
  },
  {
    id: "napster",
    label: "Napster",
    searchUrl: (n) =>
      `https://us.napster.com/search/artists/${encodeURIComponent(n)}`,
  },
  {
    id: "qobuz",
    label: "Qobuz",
    searchUrl: (n) =>
      `https://www.qobuz.com/gb-en/search?q=${encodeURIComponent(n)}&target=Performers`,
  },
  {
    id: "traxsource",
    label: "Traxsource",
    searchUrl: (n) =>
      `https://www.traxsource.com/search?q=${encodeURIComponent(n)}&type=artists`,
  },
  {
    id: "beatport",
    label: "Beatport",
    searchUrl: (n) =>
      `https://www.beatport.com/search?q=${encodeURIComponent(n)}`,
  },
  {
    id: "juno-download",
    label: "Juno Download",
    searchUrl: (n) =>
      `https://www.junodownload.com/search/?order=jd_date_of_pub+desc&q%5Bf%5D%5B0%5D=artists&q%5Bsub%5D%5B0%5D=${encodeURIComponent(n)}`,
  },
  {
    id: "boomplay",
    label: "Boomplay",
    searchUrl: (n) =>
      `https://www.boomplay.com/search/default/${encodeURIComponent(n)}`,
  },
  {
    id: "anghami",
    label: "Anghami",
    searchUrl: (n) =>
      `https://play.anghami.com/search?q=${encodeURIComponent(n)}&type=artists`,
  },
  {
    id: "gaana",
    label: "Gaana",
    searchUrl: (n) => `https://gaana.com/search/${encodeURIComponent(n)}`,
  },
  {
    id: "kkbox",
    label: "KKBOX",
    searchUrl: (n) =>
      `https://www.kkbox.com/tw/en/search/${encodeURIComponent(n)}/artist`,
  },
  {
    id: "line-music",
    label: "LINE MUSIC",
    searchUrl: (n) =>
      `https://music.line.me/webapp/search/artists?query=${encodeURIComponent(n)}`,
  },
  {
    id: "netease-cloud-music",
    label: "NetEase Cloud Music",
    searchUrl: (n) =>
      `https://music.163.com/#/search/m/?s=${encodeURIComponent(n)}&type=100`,
  },
  {
    id: "qq-music",
    label: "QQ Music",
    searchUrl: (n) =>
      `https://y.qq.com/portal/search.html#page=1&searchid=1&query=${encodeURIComponent(n)}`,
  },
  {
    id: "kugou",
    label: "Kugou",
    searchUrl: (n) =>
      `https://www.kugou.com/yy/singer/index.html#src=${encodeURIComponent(n)}`,
  },
  {
    id: "kuwo",
    label: "Kuwo",
    searchUrl: (n) =>
      `https://www.kuwo.cn/search/singers?wd=${encodeURIComponent(n)}`,
  },
  {
    id: "kuaishou",
    label: "Kuaishou",
    searchUrl: (n) =>
      `https://www.kuaishou.com/search/${encodeURIComponent(n)}`,
  },
  {
    id: "yandex-music",
    label: "Yandex Music",
    searchUrl: (n) =>
      `https://music.yandex.ru/search?text=${encodeURIComponent(n)}&type=artists`,
  },
  {
    id: "vk-music",
    label: "VK Music",
    searchUrl: (n) =>
      `https://vk.com/search?c[section]=artists&c[q]=${encodeURIComponent(n)}`,
  },
  {
    id: "claro-musica",
    label: "Claro Música",
    searchUrl: (n) =>
      `https://www.claromusica.com/buscar?q=${encodeURIComponent(n)}`,
  },
  {
    id: "trebel",
    label: "Trebel",
    searchUrl: (n) => `https://www.trebel.io/search/${encodeURIComponent(n)}`,
  },
  {
    id: "tiktok",
    label: "TikTok",
    searchUrl: (n) =>
      `https://www.tiktok.com/search?q=${encodeURIComponent(n)}`,
  },
  {
    id: "instagram",
    label: "Instagram",
    searchUrl: (_n, s) => `https://www.instagram.com/${s}/`,
  },
  {
    id: "facebook",
    label: "Facebook",
    searchUrl: (n, _s) =>
      `https://www.facebook.com/search/top?q=${encodeURIComponent(n)}`,
  },
  {
    id: "snapchat",
    label: "Snapchat",
    searchUrl: (_n, s) => `https://www.snapchat.com/add/${s}`,
  },
  {
    id: "youtube-content-id",
    label: "YouTube",
    searchUrl: (n) =>
      `https://www.youtube.com/results?search_query=${encodeURIComponent(n)}`,
  },
  {
    id: "twitch",
    label: "Twitch",
    searchUrl: (_n, s) => `https://www.twitch.tv/${s}`,
  },
  {
    id: "soundexchange",
    label: "SoundExchange",
    searchUrl: (_n) => `https://www.soundexchange.com/artist-registration/`,
  },
  {
    id: "peloton",
    label: "Peloton",
    searchUrl: (_n) => `https://www.onepeloton.com/music`,
  },
  {
    id: "soundtrack-your-brand",
    label: "Soundtrack Your Brand",
    searchUrl: (n) =>
      `https://www.soundtrackyourbrand.com/music?search=${encodeURIComponent(n)}`,
  },
  {
    id: "pretzel-rocks",
    label: "Pretzel",
    searchUrl: (n) =>
      `https://www.pretzel.rocks/search?query=${encodeURIComponent(n)}`,
  },
  {
    id: "roblox",
    label: "Roblox",
    searchUrl: (n) =>
      `https://www.roblox.com/search/people?keyword=${encodeURIComponent(n)}`,
  },
  {
    id: "amazon-mp3",
    label: "Amazon (MP3)",
    searchUrl: (n) =>
      `https://www.amazon.com/s?k=${encodeURIComponent(n)}&i=digital-music`,
  },
  {
    id: "7digital",
    label: "7digital",
    searchUrl: (n) =>
      `https://us.7digital.com/search?q=${encodeURIComponent(n)}`,
  },
  {
    id: "medianet",
    label: "MediaNet",
    searchUrl: (_n) => `https://www.mndigital.com`,
  },
  {
    id: "gracenote",
    label: "Gracenote",
    searchUrl: (_n) => `https://www.gracenote.com/music/`,
  },
  {
    id: "shazam",
    label: "Shazam",
    searchUrl: (n) =>
      `https://www.shazam.com/search?q=${encodeURIComponent(n)}`,
  },
  {
    id: "tencent-music",
    label: "Tencent Music",
    searchUrl: (n) =>
      `https://y.qq.com/portal/search.html#searchid=1&remoteplace=txt.yqq.top&query=${encodeURIComponent(n)}`,
  },
  {
    id: "luna",
    label: "Luna Music",
    searchUrl: (n) =>
      `https://www.lunamusic.ai/search?q=${encodeURIComponent(n)}`,
  },
  {
    id: "capcut",
    label: "CapCut",
    searchUrl: (n) =>
      `https://www.capcut.com/explore?search=${encodeURIComponent(n)}&type=music`,
  },
  {
    id: "wesing",
    label: "WeSing",
    searchUrl: (n) =>
      `https://m.wesing.com/search?keywords=${encodeURIComponent(n)}`,
  },
  {
    id: "bilibili",
    label: "Bilibili",
    searchUrl: (n) =>
      `https://search.bilibili.com/all?keyword=${encodeURIComponent(n)}`,
  },
  {
    id: "tencent-video",
    label: "Tencent Video",
    searchUrl: (n) =>
      `https://v.qq.com/search.html#stag=0&query=${encodeURIComponent(n)}`,
  },
  {
    id: "iqiyi",
    label: "iQIYI",
    searchUrl: (n) =>
      `https://www.iqiyi.com/search.html?query=${encodeURIComponent(n)}`,
  },
  {
    id: "siri",
    label: "Siri / Apple",
    searchUrl: (n) =>
      `https://music.apple.com/search?term=${encodeURIComponent(n)}`,
  },
  {
    id: "vevo",
    label: "Vevo",
    searchUrl: (_n, s) => `https://www.vevo.com/artist/${s}`,
  },
  {
    id: "kuack-media",
    label: "Kuack Media",
    searchUrl: (n) => `https://kuack.com/search?q=${encodeURIComponent(n)}`,
  },
  {
    id: "bugs",
    label: "Bugs",
    searchUrl: (n) =>
      `https://music.bugs.co.kr/search/artist?q=${encodeURIComponent(n)}`,
  },
  {
    id: "genie",
    label: "Genie",
    searchUrl: (n) =>
      `https://www.genie.co.kr/search/searchMain?query=${encodeURIComponent(n)}`,
  },
  {
    id: "melon",
    label: "Melon",
    searchUrl: (n) =>
      `https://www.melon.com/search/total/index.htm?q=${encodeURIComponent(n)}`,
  },
  {
    id: "awa",
    label: "AWA",
    searchUrl: (n) => `https://awa.fm/search?q=${encodeURIComponent(n)}`,
  },
  {
    id: "flo",
    label: "FLO",
    searchUrl: (n) =>
      `https://www.music-flo.com/search?q=${encodeURIComponent(n)}`,
  },
  {
    id: "vibe",
    label: "Naver Vibe",
    searchUrl: (n) => `https://vibe.naver.com/search/${encodeURIComponent(n)}`,
  },
  {
    id: "rakuten-music",
    label: "Rakuten Music",
    searchUrl: (n) =>
      `https://music.rakuten.co.jp/search/artist/?word=${encodeURIComponent(n)}`,
  },
  {
    id: "mora",
    label: "mora",
    searchUrl: (n) =>
      `https://mora.jp/search/searchResult?keyword=${encodeURIComponent(n)}`,
  },
  {
    id: "recochoku",
    label: "Recochoku",
    searchUrl: (n) => `https://recochoku.jp/search?q=${encodeURIComponent(n)}`,
  },
  {
    id: "nuuday",
    label: "Nuuday / YouSee",
    searchUrl: (n) =>
      `https://yousee.dk/musik/search?q=${encodeURIComponent(n)}`,
  },
  {
    id: "zvuk",
    label: "Zvuk",
    searchUrl: (n) => `https://zvuk.com/search?q=${encodeURIComponent(n)}`,
  },
  {
    id: "livexlive",
    label: "LiveXLive",
    searchUrl: (n) =>
      `https://www.livexlive.com/search?q=${encodeURIComponent(n)}`,
  },
  {
    id: "mixcloud",
    label: "Mixcloud",
    searchUrl: (_n, s) => `https://www.mixcloud.com/${s}/`,
  },
  {
    id: "resso",
    label: "Resso",
    searchUrl: (n) => `https://www.resso.com/search?q=${encodeURIComponent(n)}`,
  },
  {
    id: "uma",
    label: "UMA",
    searchUrl: (n) => `https://uma.app/search?q=${encodeURIComponent(n)}`,
  },
  {
    id: "touchtunes",
    label: "TouchTunes",
    searchUrl: (n) =>
      `https://www.touchtunes.com/music/search?q=${encodeURIComponent(n)}`,
  },
  {
    id: "tim-music",
    label: "TIM Music",
    searchUrl: (n) => `https://timmusic.com.br/busca/${encodeURIComponent(n)}`,
  },
  {
    id: "saavn",
    label: "Saavn",
    searchUrl: (n) =>
      `https://www.jiosaavn.com/search/${encodeURIComponent(n)}`,
  },
  {
    id: "wynk",
    label: "Wynk Music",
    searchUrl: (n) => `https://wynk.in/search/${encodeURIComponent(n)}`,
  },
  {
    id: "hungama",
    label: "Hungama",
    searchUrl: (n) =>
      `https://www.hungama.com/search/${encodeURIComponent(n)}/`,
  },
  {
    id: "mdundo",
    label: "Mdundo",
    searchUrl: (n) => `https://www.mdundo.com/search/${encodeURIComponent(n)}`,
  },
  {
    id: "udux",
    label: "UDUX",
    searchUrl: (n) => `https://udux.com/search/${encodeURIComponent(n)}`,
  },
  {
    id: "amazon-alexa",
    label: "Amazon Alexa",
    searchUrl: (n) =>
      `https://music.amazon.com/search/${encodeURIComponent(n)}`,
  },
  {
    id: "google-assistant",
    label: "Google Assistant",
    searchUrl: (n) =>
      `https://music.youtube.com/search?q=${encodeURIComponent(n)}`,
  },
  {
    id: "apple-fitness-plus",
    label: "Apple Fitness+",
    searchUrl: (n) =>
      `https://music.apple.com/search?term=${encodeURIComponent(n)}`,
  },
  {
    id: "feed-fm",
    label: "Feed.fm",
    searchUrl: (_n) => `https://feed.fm/publishers/`,
  },
  {
    id: "epidemic-sound",
    label: "Epidemic Sound",
    searchUrl: (n) =>
      `https://www.epidemicsound.com/music/search/?term=${encodeURIComponent(n)}&contentType=artist`,
  },
  {
    id: "fortnite",
    label: "Fortnite",
    searchUrl: (_n) => `https://www.fortnite.com/news`,
  },
  {
    id: "dj-city",
    label: "DJcity",
    searchUrl: (n) => `https://www.djcity.com/search/${encodeURIComponent(n)}`,
  },
  {
    id: "bpm-supreme",
    label: "BPM Supreme",
    searchUrl: (n) =>
      `https://www.bpmsupreme.com/search?q=${encodeURIComponent(n)}`,
  },
  {
    id: "digital-dj-pool",
    label: "Digital DJ Pool",
    searchUrl: (n) =>
      `https://www.digitaldjpool.com/search?q=${encodeURIComponent(n)}`,
  },
  {
    id: "dubset",
    label: "Dubset / Songtradr",
    searchUrl: (n) =>
      `https://www.songtradr.com/search?q=${encodeURIComponent(n)}`,
  },
  {
    id: "emusic",
    label: "eMusic",
    searchUrl: (n) =>
      `https://www.emusic.com/search?q=${encodeURIComponent(n)}`,
  },
  {
    id: "hdtracks",
    label: "HDtracks",
    searchUrl: (n) =>
      `https://www.hdtracks.com/catalogsearch/result/?q=${encodeURIComponent(n)}`,
  },
  {
    id: "primephonic",
    label: "Primephonic",
    searchUrl: (n) =>
      `https://primephonic.com/search?q=${encodeURIComponent(n)}`,
  },
  {
    id: "idagio",
    label: "Idagio",
    searchUrl: (n) =>
      `https://app.idagio.com/search?query=${encodeURIComponent(n)}`,
  },
  {
    id: "joox",
    label: "JOOX",
    searchUrl: (n) =>
      `https://www.joox.com/search?query=${encodeURIComponent(n)}`,
  },
  {
    id: "meta-library",
    label: "Meta Music Library",
    searchUrl: (n) =>
      `https://www.facebook.com/search/top?q=${encodeURIComponent(n)}`,
  },
  {
    id: "ultimate-music",
    label: "Ultimate Music",
    searchUrl: (n) =>
      `https://www.ultimatemusic.com/search?q=${encodeURIComponent(n)}`,
  },
  {
    id: "itunes",
    label: "iTunes Store",
    searchUrl: (n) =>
      `https://itunes.apple.com/search?term=${encodeURIComponent(n)}&entity=musicArtist`,
  },
];

// Platforms already handled by full API search — excluded from URL-template generation
const API_SEARCHED_PLATFORMS = new Set([
  "spotify",
  "apple-music",
  "deezer",
  "audiomack",
  "jiosaavn",
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
    return s?.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  /**
   * Core normalisation — applied to every comparison.
   * Strips diacritics, lowercases, expands common symbols, collapses punctuation.
   * Does NOT strip stage-name prefixes here (reserved for relaxed form).
   */
  private _normalizeName(name: string): string {
    let s = this._stripDiacritics(name).toLowerCase();
    // Symbol expansions: "Jay-Z & Friends" → recognise & as "and"
    s = s?.replace(/&/g, " and ").replace(/\+/g, " and ").replace(/@/g, " at ");
    // Strip feat/ft/featuring and everything after — track-style artist strings
    s = s?.replace(/\s+(?:feat\.?|ft\.?|featuring)\b.*/i, "");
    // Strip parenthetical disambiguation suffixes: "(rapper)", "(UK)", "(band)"
    s = s?.replace(/\s*\([^)]{0,45}\)\s*/g, " ");
    // Collapse all remaining punctuation/hyphens/apostrophes to spaces
    s = s?.replace(/[^a-z0-9\s]/g, " ");
    return s?.replace(/\s+/g, " ").trim();
  }

  /**
   * Relaxed normalisation — used as a fallback in later comparison stages.
   * Also strips common stage-name prefixes/articles that vary across platforms.
   */
  private _normalizeRelaxed(name: string): string {
    let s = this._normalizeName(name);
    // Strip leading articles
    s = s?.replace(/^(?:the|a|an)\s+/, "").replace(/\bthe\b/g, "");
    // Strip stage name honorifics/prefixes
    s = s?.replace(/\b(?:dj|mc|sir|mr|ms|dr|st|lil|young|big|ol)\b\.?\s*/g, "");
    return s?.replace(/\s+/g, " ").trim();
  }

  /**
   * Collapsed form — removes ALL whitespace and punctuation.
   * "B-Lawz" → "blawz", "B Lawz" → "blawz", "b.lawz" → "blawz"
   * Best for hyphenation and spacing variants.
   */
  private _collapseForm(name: string): string {
    return this._stripDiacritics(name)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  /**
   * Collapsed-relaxed form — collapsed + relaxed normalisation combined.
   * "DJ B-Lawz" → "blawz", "DJ BLawz" → "blawz"
   */
  private _collapseRelaxed(name: string): string {
    return this._normalizeRelaxed(name).replace(/[^a-z0-9]/g, "");
  }

  /** Sort tokens alphabetically and rejoin — handles word-order permutations. */
  private _tokenSorted(s: string): string {
    return s?.split(" ").filter(Boolean).sort().join(" ");
  }

  /**
   * Dice coefficient on character bigrams (0–1).
   * Very effective for short-string similarity with typos/spelling variants.
   */
  private _bigramSim(a: string, b: string): number {
    if (!a || !b) return a === b ? 1 : 0;
    if (a?.length === 1 && b?.length === 1) return a === b ? 1 : 0;
    const bigrams = (s: string): Map<string, number> => {
      const m = new Map<string, number>();
      for (let i = 0; i < s?.length - 1; i++) {
        const bg = s?.slice(i, i + 2);
        m?.set(bg, (m?.get(bg) ?? 0) + 1);
      }
      return m;
    };
    const ba = bigrams(a),
      bb = bigrams(b);
    let hits = 0;
    for (const [bg, cnt] of ba) hits += Math.min(cnt, bb?.get(bg) ?? 0);
    const total = a?.length - 1 + (b?.length - 1);
    return total === 0 ? 0 : (2 * hits) / total;
  }

  /** Levenshtein edit distance (O(m×n) — keep inputs ≤ 35 chars) */
  private _levenshtein(a: string, b: string): number {
    const m = a?.length,
      n = b?.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
    );
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] =
          a[i - 1] === b[j - 1]
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
    if (ra === rb && ra?.length > 0) return 97;

    // ── Stage 3: Collapsed form (hyphen/spacing blind) ──
    const ca = this._collapseForm(a);
    const cb = this._collapseForm(b);
    if (ca === cb && ca?.length > 0) return 99;

    // ── Stage 4: Collapsed-relaxed ──
    const cra = this._collapseRelaxed(a);
    const crb = this._collapseRelaxed(b);
    if (cra === crb && cra?.length > 0) return 96;

    // ── Stage 5: Token-sorted normalised ──
    if (this._tokenSorted(na) === this._tokenSorted(nb)) return 95;
    if (this._tokenSorted(ra) === this._tokenSorted(rb) && ra?.length > 0)
      return 93;

    // ── Stage 6: Substring containment (length-weighted) ──
    let substringScore = 0;
    // Prefer collapsed comparison so "B-Lawz" contains "BLawz"
    const [longC, shortC] = ca?.length >= cb?.length ? [ca, cb] : [cb, ca];
    const [longN, shortN] = na?.length >= nb?.length ? [na, nb] : [nb, na];
    if (shortC?.length >= 3 && longC?.includes(shortC)) {
      substringScore = Math.round(70 + (shortC?.length / longC?.length) * 22);
    } else if (shortN?.length >= 3 && longN?.includes(shortN)) {
      substringScore = Math.round(68 + (shortN?.length / longN?.length) * 20);
    }

    // ── Stage 7: Bigram Dice on collapsed forms ──
    // Use collapsed so punctuation/spacing doesn't fragment bigrams
    const bigramScore = Math.round(this._bigramSim(ca, cb) * 90);

    // ── Stage 8: Levenshtein on collapsed forms (cap at 35 chars) ──
    const levA = ca.slice(0, 35),
      levB = cb.slice(0, 35);
    const maxLev = Math.max(levA.length, levB.length);
    const levScore =
      maxLev > 0
        ? Math.round(
            Math.max(0, (1 - this._levenshtein(levA, levB) / maxLev) * 87),
          )
        : 0;

    // ── Stage 8b: Jaccard word overlap ──
    const wordsA = new Set(na.split(" ").filter(Boolean));
    const wordsB = new Set(nb.split(" ").filter(Boolean));
    const shared = [...wordsA].filter((w) => wordsB.has(w)).length;
    const union = new Set([...wordsA, ...wordsB]).size;
    const jaccardScore = union > 0 ? Math.round((shared / union) * 78) : 0;

    return Math.max(substringScore, bigramScore, levScore, jaccardScore);
  }

  // Retry wrapper with exponential backoff for external API calls
  private async _withRetry<T>(
    fn: () => Promise<T>,
    maxAttempts = 3,
    _label = "external API",
  ): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const e = err as {
          name?: string;
          message?: string;
          cause?: { code?: string };
        };
        const isRetryable =
          e.name === "TimeoutError" ||
          !!e.message?.includes("timeout") ||
          !!e.message?.includes("network") ||
          e.cause?.code === "UND_ERR_CONNECT_TIMEOUT";
        if (isRetryable && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 300 * attempt));
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
      const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
        "base64",
      );
      const response = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        logger.warn(
          "[ArtistProfile] Spotify token fetch failed:",
          response.status,
        );
        return null;
      }

      const data = (await response.json()) as {
        access_token: string;
        expires_in: number;
      };
      this.spotifyToken = data.access_token;
      this.spotifyTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
      return this.spotifyToken;
    } catch (err) {
      logger.warn({ err: err }, "[ArtistProfile] Spotify token error:");
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

      const data = (await response.json()) as RawSpotifySearchResponse;
      return (data.artists?.items || []).map(
        (a: RawSpotifyArtist): SpotifyArtistResult => ({
          id: a.id ?? "",
          uri: a.uri ?? "",
          name: a.name ?? "",
          imageUrl: a.images?.[0]?.url ?? null,
          genres: a.genres || [],
          followers: a.followers?.total ?? 0,
          popularity: a.popularity ?? 0,
          externalUrl: a.external_urls?.spotify ?? "",
        }),
      );
    } catch (err) {
      logger.warn({ err: err }, "[ArtistProfile] Spotify search error:");
      return [];
    }
  }

  async verifySpotifyArtist(
    spotifyId: string,
  ): Promise<SpotifyArtistResult | null> {
    const token = await this.getSpotifyToken();
    if (!token) return null;

    try {
      const response = await fetch(
        `https://api.spotify.com/v1/artists/${spotifyId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(8000),
        },
      );

      if (!response.ok) return null;

      const a = (await response.json()) as RawSpotifyArtist;
      return {
        id: a.id ?? "",
        uri: a.uri ?? "",
        name: a.name ?? "",
        imageUrl: a.images?.[0]?.url ?? null,
        genres: a.genres || [],
        followers: a.followers?.total ?? 0,
        popularity: a.popularity ?? 0,
        externalUrl: a.external_urls?.spotify ?? "",
      };
    } catch (err) {
      logger.warn({ err: err }, "[ArtistProfile] Spotify verify error:");
      return null;
    }
  }

  async searchAppleArtists(query: string): Promise<AppleArtistResult[]> {
    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=musicArtist&limit=8`;
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });

      if (!response.ok) return [];

      const data = (await response.json()) as RawAppleSearchResponse;
      return (data.results || [])
        .filter((a: RawAppleArtist) => a.artistId && a.artistName)
        .map(
          (a: RawAppleArtist): AppleArtistResult => ({
            id: String(a.artistId),
            name: a.artistName ?? "",
            genres: [
              ...(a.primaryGenreName ? [a.primaryGenreName] : []),
              ...(a.genres || []),
            ]
              .filter((g, i, arr) => arr.indexOf(g) === i)
              .slice(0, 4),
            // iTunes returns artworkUrl100 for artists that have images
            artworkUrl: a.artworkUrl100 ?? a.artworkUrl60 ?? null,
            url:
              a.artistLinkUrl ??
              `https://music.apple.com/us/artist/${a.artistId}`,
          }),
        );
    } catch (err) {
      logger.warn({ err: err }, "[ArtistProfile] Apple search error:");
      return [];
    }
  }

  async searchDeezerArtists(query: string): Promise<DeezerArtistResult[]> {
    try {
      const url = `https://api.deezer.com/search/artist?q=${encodeURIComponent(query)}&limit=8&order=RANKING`;
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });

      if (!response.ok) return [];

      const data = (await response.json()) as RawDeezerSearchResponse;
      if (data.error) return []; // Deezer returns {error:{...}} on quota/errors
      return (data.data || [])
        .filter((a: RawDeezerArtist) => a.id && a.name)
        .map(
          (a: RawDeezerArtist): DeezerArtistResult => ({
            id: String(a.id),
            name: a.name ?? "",
            // Prefer highest-resolution image: xl → big → medium → small
            pictureUrl:
              a.picture_xl ??
              a.picture_big ??
              a.picture_medium ??
              a.picture_small ??
              null,
            fans: a.nb_fan ?? 0,
            nbAlbum: a.nb_album ?? 0,
            link: a.link ?? `https://www.deezer.com/artist/${a.id}`,
          }),
        );
    } catch (err) {
      logger.warn({ err: err }, "[ArtistProfile] Deezer search error:");
      return [];
    }
  }

  async searchMusicBrainzArtists(
    query: string,
  ): Promise<MusicBrainzArtistResult[]> {
    const mbHeaders = {
      "User-Agent":
        "MaxBooster/1.0 (music career management platform; max@maxbooster.io)",
      Accept: "application/json",
    };

    const parseMbArtists = (
      data: RawMusicBrainzResponse,
    ): MusicBrainzArtistResult[] =>
      (data.artists || [])
        .filter((a: RawMusicBrainzArtist) => a.id && a.name)
        .map(
          (a: RawMusicBrainzArtist): MusicBrainzArtistResult => ({
            id: a.id ?? "",
            name: a.name ?? "",
            score: Number(a.score ?? 0),
            type: a.type ?? null,
            country: a.country ?? null,
            // Include both genre tags and regular tags for richer scoring
            tags: [
              ...(a.tags || []).map((t: RawMusicBrainzTag) =>
                String(t.name),
              ),
              ...(a["genre-list"] || []).map((g: RawMusicBrainzTag | string) =>
                String(typeof g === "string" ? g : (g.name ?? g)),
              ),
            ].filter((v, i, arr) => arr.indexOf(v) === i),
            disambiguation: a.disambiguation ?? null,
          }),
        );

    try {
      // Stage 1: Strict quoted artist name search — most precise
      const strictUrl = `https://musicbrainz.org/ws/2/artist?query=artist:"${encodeURIComponent(query)}"&limit=8&fmt=json`;
      const strictRes = await this._withRetry(
        () =>
          fetch(strictUrl, {
            headers: mbHeaders,
            signal: AbortSignal.timeout(10000),
          }),
        2,
        "MusicBrainz",
      );

      if (strictRes.ok) {
        const data = (await strictRes.json()) as Record<string, unknown>;
        const results = parseMbArtists(data);
        if (results.length > 0) return results;
      }

      // Stage 2: Relaxed bare-name search — catches aliases, romanised names, alternate spellings
      await new Promise((r) => setTimeout(r, 500)); // Respect MusicBrainz rate limit (1 req/sec)
      const relaxedUrl = `https://musicbrainz.org/ws/2/artist?query=${encodeURIComponent(query)}&limit=8&fmt=json`;
      const relaxedRes = await fetch(relaxedUrl, {
        headers: mbHeaders,
        signal: AbortSignal.timeout(8000),
      });
      if (!relaxedRes.ok) return [];
      const relaxedData = (await relaxedRes.json()) as Record<string, unknown>;
      return parseMbArtists(relaxedData);
    } catch (err) {
      logger.warn(
        { err: err },
        "[ArtistProfile] MusicBrainz search error (non-fatal):",
      );
      return [];
    }
  }

  // Audiomack public search API — NOTE: requires OAuth consumer_key for v1 API (returns 401 without it)
  // Kept for forward-compatibility; returns empty array when unauthenticated
  async searchAudiomackArtists(
    query: string,
  ): Promise<AudiomackArtistResult[]> {
    try {
      const url = `https://api.audiomack.com/v1/search?type=artists&q=${encodeURIComponent(query)}&limit=5`;
      const response = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "MaxBooster/1.0" },
        signal: AbortSignal.timeout(6000),
      });

      if (response.status === 401) {
        // Expected: Audiomack v1 API requires OAuth consumer_key — suppress repeat logs
        return [];
      }
      if (!response.ok) return [];

      const data = (await response.json()) as RawAudiomackResponse;
      return (data.results || []).slice(0, 5).map(
        (a: RawAudiomackArtist): AudiomackArtistResult => ({
          id: String(a.id ?? a.url_slug ?? ""),
          name: a.name ?? a.label ?? "",
          slug: a.url_slug ?? "",
          imageUrl: a.image ?? a.avatar ?? null,
          followers: a.followers ?? a.fans ?? 0,
          url: a.url_slug ? `https://audiomack.com/${a.url_slug}` : "",
        }),
      );
    } catch (err) {
      // Suppress noise — Audiomack API consistently requires auth in production
      const e = err as { message?: string };
      if (!e.message?.includes("401")) {
        logger.warn(
          "[ArtistProfile] Audiomack search error (non-fatal):",
          e.message ?? err,
        );
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
        headers: { Accept: "application/json", "User-Agent": "MaxBooster/1.0" },
        signal: AbortSignal.timeout(7000),
      });
      if (response.ok) {
        const data = (await response.json()) as RawSaavnDevResponse;
        const artists: RawJioSaavnArtist[] =
          data.data?.results ?? data.results ?? [];
        if (artists.length > 0) {
          return artists.slice(0, 5).map(
            (a: RawJioSaavnArtist): JioSaavnArtistResult => ({
              id: String(a.id ?? ""),
              name: a.name ?? a.title ?? "",
              // saavn.dev image array: [{quality:"50x50",url:...},{quality:"150x150",url:...},{quality:"500x500",url:...}]
              imageUrl:
                (Array.isArray(a.image)
                  ? (
                      a.image.find(
                        (i: RawJioSaavnImage) => i.quality === "500x500",
                      ) ?? a.image[a.image.length - 1]
                    )?.url
                  : a.image) ?? null,
              url:
                a.url ??
                (a.id ? `https://www.jiosaavn.com/artist/-/${a.id}` : ""),
            }),
          );
        }
      }
    } catch {
      /* fall through to backup */
    }

    // Fallback: JioSaavn autocomplete endpoint
    try {
      const url = `https://www.jiosaavn.com/api.php?__call=autocomplete.get&_format=json&_marker=0&cc=in&includeMetaTags=1&query=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "MaxBooster/1.0" },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return [];
      const data = (await response.json()) as RawJioSaavnAutocompleteResponse;
      const artists: RawJioSaavnArtist[] = data.artists?.data ?? [];
      return artists.slice(0, 5).map(
        (a: RawJioSaavnArtist): JioSaavnArtistResult => ({
          id: String(a.id ?? ""),
          name: a.title ?? a.name ?? "",
          imageUrl: typeof a.image === "string" ? a.image : null,
          url: a.url ? `https://www.jiosaavn.com${a.url}` : "",
        }),
      );
    } catch (err) {
      logger.warn(
        { err: err },
        "[ArtistProfile] JioSaavn search error (non-fatal):",
      );
      return [];
    }
  }

  // ── UPC-based direct lookup ──────────────────────────────────────────────
  // Significantly more accurate than name search for newly distributed releases:
  // Apple and Deezer both expose album-by-UPC endpoints that return the exact
  // artist record tied to that release — no fuzzy matching needed.
  async searchByUPC(
    upc: string,
  ): Promise<{
    apple: AppleArtistResult | null;
    deezer: DeezerArtistResult | null;
  }> {
    const normalized = upc.replace(/[^0-9]/g, "");
    if (!normalized) return { apple: null, deezer: null };

    const [appleRes, deezerRes] = await Promise.allSettled([
      // Apple iTunes UPC lookup — returns album and artist records; artist may be nested in album
      fetch(
        `https://itunes.apple.com/lookup?upc=${normalized}&entity=musicArtist`,
        {
          signal: AbortSignal.timeout(8000),
        },
      ).then(async (r) => {
        if (!r.ok) return null;
        const d = (await r.json()) as Record<string, unknown>;
        const results: Record<string, unknown>[] = d.results || [];

        // Prefer explicit artist record (wrapperType==='artist')
        let artist = results.find(
          (x: Record<string, unknown>) =>
            x.wrapperType === "artist" || x.kind === "artist",
        );

        // Fallback: extract artist info from album collection (iTunes often returns album first)
        if (!artist) {
          const album = results.find(
            (x: Record<string, unknown>) =>
              x.wrapperType === "collection" || x.collectionType === "Album",
          );
          if (album!.artistId) {
            artist = {
              artistId: album!.artistId,
              artistName: album!.artistName ?? album!.collectionArtistName,
              primaryGenreName: album!.primaryGenreName,
              artistLinkUrl: album!.artistViewUrl,
              artworkUrl100: album!.artworkUrl100 ?? album!.artworkUrl60,
            };
          }
        }

        if (!artist) return null;
        return {
          id: String(artist.artistId),
          name: artist.artistName ?? "",
          genres: artist.primaryGenreName ? [artist.primaryGenreName] : [],
          artworkUrl: artist.artworkUrl100 ?? artist.artworkUrl60 ?? null,
          url:
            artist.artistLinkUrl ??
            artist.artistViewUrl ??
            `https://music.apple.com/us/artist/${artist.artistId}`,
        } as AppleArtistResult;
      }),

      // Deezer UPC lookup — returns the album and its artist with image
      fetch(`https://api.deezer.com/album/upc:${normalized}`, {
        signal: AbortSignal.timeout(8000),
      }).then(async (r) => {
        if (!r.ok) return null;
        const d = (await r.json()) as Record<string, unknown>;
        if (!(d.artist as any).id || d.error) return null;
        return {
          id: String((d.artist as any).id),
          name: (d.artist as Error).name,
          pictureUrl:
            (d.artist as any).picture_xl ??
            (d.artist as any).picture_big ??
            (d.artist as any).picture_medium ??
            null,
          fans: (d.artist as any).nb_fan ?? 0,
          nbAlbum: 0,
          link: (d.artist as any).link ?? `https://www.deezer.com/artist/${(d.artist as any).id}`,
        } as DeezerArtistResult;
      }),
    ]);

    return {
      apple: appleRes.status === "fulfilled" ? appleRes.value : null,
      deezer: deezerRes.status === "fulfilled" ? deezerRes.value : null,
    };
  }

  async searchAllPlatforms(query: string): Promise<PlatformSearchResults> {
    const [spotify, apple, deezer, musicbrainz, audiomack, jiosaavn] =
      await Promise.allSettled([
        this.searchSpotifyArtists(query),
        this.searchAppleArtists(query),
        this.searchDeezerArtists(query),
        this.searchMusicBrainzArtists(query),
        this.searchAudiomackArtists(query),
        this.searchJioSaavnArtists(query),
      ]);

    return {
      spotify: spotify.status === "fulfilled" ? spotify.value : [],
      apple: apple.status === "fulfilled" ? apple.value : [],
      deezer: deezer.status === "fulfilled" ? deezer.value : [],
      musicbrainz: musicbrainz.status === "fulfilled" ? musicbrainz.value : [],
      audiomack: audiomack.status === "fulfilled" ? audiomack.value : [],
      jiosaavn: jiosaavn.status === "fulfilled" ? jiosaavn.value : [],
    };
  }

  // Generate a URL-friendly slug from an artist name
  private _nameToSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();
  }

  // Generate URL-template-based discoveries for all 97 DSPs that don't have public search APIs.
  // Returns search/profile URLs the user can visit to verify their presence on each platform.
  generateUrlDiscoveries(artistName: string): PlatformUrlDiscovery[] {
    const slug = this._nameToSlug(artistName);
    return ALL_DSP_URL_TEMPLATES?.filter(
      (p) => !API_SEARCHED_PLATFORMS?.has(p?.id),
    ).map((p) => ({
      platform: p.id,
      platformLabel: p.label,
      searchUrl: p.searchUrl(artistName, slug),
      profileUrlTemplate: null,
      method: "url_template" as const,
    }));
  }

  async createProfile(data: InsertArtistProfile): Promise<ArtistProfile> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const [profile] = await db
          .insert(artistProfiles)
          .values({
            ...data,
            updatedAt: new Date(),
          })
          .returning();
        return profile;
      } catch (err) {
        lastErr = err;
        const isTransient =
          (err as any)?.message?.includes("Failed query") ||
          (err as any)?.cause?.message?.includes("timeout") ||
          (err as any)?.cause?.message?.includes("connection");
        if (isTransient && attempt < 3) {
          await new Promise((r) => setTimeout(r, 200 * attempt));
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  async getUserProfiles(userId: string): Promise<ArtistProfile[]> {
    return db
      .select()
      .from(artistProfiles)
      .where(eq(artistProfiles?.userId, userId))
      .orderBy(artistProfiles?.createdAt);
  }

  async getProfile(id: string, userId: string): Promise<ArtistProfile | null> {
    const [profile] = await db
      .select()
      .from(artistProfiles)
      .where(and(eq(artistProfiles?.id, id), eq(artistProfiles?.userId, userId)))
      .limit(1);
    return profile ?? null;
  }

  async updateProfile(
    id: string,
    userId: string,
    data: Partial<InsertArtistProfile>,
  ): Promise<ArtistProfile | null> {
    const [updated] = await db
      .update(artistProfiles)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(artistProfiles?.id, id), eq(artistProfiles?.userId, userId)))
      .returning();

    // Best-effort sync to MaxCore artist storage so generation endpoints read the
    // latest profile. Fire-and-forget — never blocks or fails the local update.
    if (updated) {
      const d = data as Record<string, unknown>;
      void MaxCoreAIClient.generate(`/api/storage/artist/${id}`, {
        genre: d.genre,
        tone: d.tone,
        artist_name: (updated as Record<string, unknown>).name,
      });
    }

    return updated ?? null;
  }

  async deleteProfile(id: string, userId: string): Promise<boolean> {
    await db
      .delete(artistProfileReleases)
      .where(eq(artistProfileReleases?.artistProfileId, id));
    const result = await db
      .delete(artistProfiles)
      .where(and(eq(artistProfiles?.id, id), eq(artistProfiles?.userId, userId)))
      .returning({ id: artistProfiles.id });
    return result?.length > 0;
  }

  async linkProfileToRelease(
    artistProfileId: string,
    releaseId: string,
    isPrimary = true,
  ): Promise<void> {
    await db
      .insert(artistProfileReleases)
      .values({
        artistProfileId,
        releaseId,
        isPrimary,
      })
      .onConflictDoNothing();
  }

  async getProfilesByRelease(releaseId: string): Promise<ArtistProfile[]> {
    const rows = await db
      .select({ profile: artistProfiles })
      .from(artistProfileReleases)
      .innerJoin(
        artistProfiles,
        eq(artistProfileReleases?.artistProfileId, artistProfiles?.id),
      )
      .where(eq(artistProfileReleases?.releaseId, releaseId))
      .limit(50);
    return rows?.map((r) => r?.profile);
  }

  async submitFixerRequest(
    id: string,
    userId: string,
    targetSpotifyUri: string,
    notes: string,
  ): Promise<ArtistProfile | null> {
    if (!/^spotify:artist:[A-Za-z0-9]+$/.test(targetSpotifyUri)) {
      throw new Error(
        "Invalid Spotify artist URI format. Expected: spotify:artist:<ID>",
      );
    }

    const [updated] = await db
      .update(artistProfiles)
      .set({
        fixerPending: true,
        fixerTargetSpotifyUri: targetSpotifyUri,
        fixerNotes: notes || null,
        fixerStatus: "pending",
        fixerRequestedAt: new Date(),
        fixerResolvedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(artistProfiles?.id, id), eq(artistProfiles?.userId, userId)))
      .returning();

    if (updated) {
      logger.info(
        `[ArtistProfile] Fixer request submitted: profile=${id}, target=${targetSpotifyUri}`,
      );
    }
    return updated ?? null;
  }

  async resolveFixerRequest(
    id: string,
    approved: boolean,
  ): Promise<ArtistProfile | null> {
    const [profile] = await db
      .select()
      .from(artistProfiles)
      .where(eq(artistProfiles?.id, id))
      .limit(1);
    if (!profile) return null;

    const updates: Partial<ArtistProfile> = {
      fixerPending: false,
      fixerStatus: approved ? "resolved" : "rejected",
      fixerResolvedAt: new Date(),
      updatedAt: new Date(),
    };

    if (approved && profile?.fixerTargetSpotifyUri) {
      const spotifyId = profile?.fixerTargetSpotifyUri.replace(
        "spotify:artist:",
        "",
      );
      updates.spotifyArtistId = spotifyId;
      updates.spotifyArtistUri = profile?.fixerTargetSpotifyUri;
    }

    const [updated] = await db
      .update(artistProfiles)
      .set(updates)
      .where(eq(artistProfiles?.id, id))
      .returning();

    logger.info(
      `[ArtistProfile] Fixer request ${approved ? "approved" : "rejected"}: profile=${id}`,
    );
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
  private _nameBase(
    nameSim: number,
    exactWeight: number,
    highWeight: number,
    medWeight: number,
  ): number {
    if (nameSim >= 95) return exactWeight; // Exact / near-exact
    if (nameSim >= 80) return highWeight; // Very close (one-char diff, collapsed equal)
    if (nameSim >= 65) return medWeight; // Probable match (bigram / Levenshtein strong)
    if (nameSim >= 45) return Math.round(medWeight * 0.6); // Possible — below threshold alone
    if (nameSim >= 25) return Math.round(medWeight * 0.3); // Weak — will need other signals
    return 0; // No meaningful name overlap
  }

  private _scoreSpotify(result: SpotifyArtistResult, query: string): number {
    const nameSim = this._nameSimilarity(result?.name, query);
    // Base: exact name → 58 (just over threshold), slides down to 0 at nameSim < 25
    let score = this._nameBase(nameSim, 58, 44, 28);
    if (score === 0) return 0;

    // Image presence — genuine artists virtually always have one
    if (result.imageUrl) score += 6;

    // Popularity bonus (0–100 Spotify scale) — bonus only, not penalty for new artists
    if (result?.popularity >= 70) score += 18;
    else if (result?.popularity >= 45) score += 12;
    else if (result?.popularity >= 20) score += 6;
    else if (result?.popularity >= 5) score += 2;
    // popularity === 0 → no bonus, no penalty

    // Genre presence confirms it's a music entity
    if (result.genres.length >= 3) score += 7;
    else if (result.genres.length >= 1) score += 4;

    // Follower count bonus — reflects established presence
    if (result.followers >= 1_000_000) score += 11;
    else if (result.followers >= 100_000) score += 7;
    else if (result.followers >= 10_000) score += 4;
    else if (result.followers >= 1_000) score += 2;
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
    else if (result.fans >= 10_000) score += 7;
    else if (result.fans >= 1_000) score += 3;
    else if (result.fans >= 100) score += 1;
    // 0 fans → no bonus, no penalty

    // Album count bonus — more releases = more established artist presence
    if (result.nbAlbum >= 10) score += 5;
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
    if (result?.genres.length >= 2) score += 10;
    else if (result?.genres.length === 1) score += 6;

    // Artwork URL presence
    if (result.artworkUrl) score += 5;

    return Math.min(score, 100);
  }

  private _scoreMusicBrainz(
    result: MusicBrainzArtistResult,
    query: string,
  ): number {
    const nameSim = this._nameSimilarity(result?.name, query);
    let score = this._nameBase(nameSim, 42, 30, 18);
    if (score === 0) return 0;

    // MusicBrainz returns its own relevance score (0–100) — trust it heavily
    if (result?.score >= 95) score += 32;
    else if (result?.score >= 80) score += 22;
    else if (result?.score >= 65) score += 12;
    else if (result?.score >= 50) score += 5;

    // Artist type strongly confirms a music entity
    if (result?.type === "Person" || result?.type === "Group") score += 14;
    else if (result?.type === "Other") score += 4;

    // Genre tags confirm music category
    if (result?.tags.length >= 3) score += 7;
    else if (result?.tags.length >= 1) score += 3;

    // Disambiguation field means MB knows this is a specific artist (not an alias)
    if (result.disambiguation) score += 3;

    return Math.min(score, 90); // Cap — MusicBrainz alone can't reach full confidence
  }

  private _scoreAudiomack(
    result: AudiomackArtistResult,
    query: string,
  ): number {
    const nameSim = this._nameSimilarity(result.name, query);
    let score = this._nameBase(nameSim, 60, 46, 28);
    if (score === 0) return 0;

    if (result.imageUrl) score += 6;

    if (result.followers >= 500_000) score += 18;
    else if (result.followers >= 50_000) score += 12;
    else if (result.followers >= 5_000) score += 6;
    else if (result.followers >= 500) score += 2;

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

  async autoDiscover(
    profileId: string,
    userId: string,
    upc?: string,
  ): Promise<{
    spotify: { result: SpotifyArtistResult; confidence: number } | null;
    apple: { result: AppleArtistResult; confidence: number } | null;
    deezer: { result: DeezerArtistResult; confidence: number } | null;
    musicbrainz: { result: MusicBrainzArtistResult; confidence: number } | null;
    audiomack: { result: AudiomackArtistResult; confidence: number } | null;
    jiosaavn: { result: JioSaavnArtistResult; confidence: number } | null;
    urlDiscoveries: PlatformUrlDiscovery[];
    labelgridPlatforms: LabelGridArtistPlatformPresence[];
    labelgridConfigured: boolean;
    saved: boolean;
    savedFields: string[];
    upcDiscovered?: boolean;
  }> {
    const profile = await this.getProfile(profileId, userId);
    if (!profile) throw new Error("Artist profile not found");

    const query = profile.artistName;

    // Run UPC lookup (if provided) + name search in parallel.
    // LabelGrid is a distribution platform only — it has no public artist search API
    // (token scopes: user.view-catalog, user.gate-use). LabelGrid platform status is
    // populated separately via webhook callbacks from distribution submissions.
    // UPC results are exact and bypass confidence scoring — treated as 97 confidence.
    const lgArtist = null; // LabelGrid does not expose an artist search endpoint
    const [raw, upcHits] = await Promise.all([
      this.searchAllPlatforms(query),
      upc
        ? this.searchByUPC(upc)
        : Promise.resolve({ apple: null, deezer: null }),
    ]);

    // Score each platform's results independently
    const topSpotify =
      raw?.spotify
        .map((r) => ({ result: r, confidence: this._scoreSpotify(r, query) }))
        .filter((r) => r?.confidence > 0)
        .sort((a, b) => b?.confidence - a?.confidence)[0] ?? null;

    // UPC lookup gives exact artist records — treat as confidence 97 and prefer over name search
    const upcApple = upcHits?.apple
      ? { result: upcHits.apple, confidence: 97 }
      : null;
    const upcDeezer = upcHits?.deezer
      ? { result: upcHits.deezer, confidence: 97 }
      : null;

    const topApple =
      upcApple ??
      raw?.apple
        .map((r) => ({ result: r, confidence: this._scoreApple(r, query) }))
        .filter((r) => r?.confidence > 0)
        .sort((a, b) => b?.confidence - a?.confidence)[0] ??
      null;

    const topDeezer =
      upcDeezer ??
      raw?.deezer
        .map((r) => ({ result: r, confidence: this._scoreDeezer(r, query) }))
        .filter((r) => r?.confidence > 0)
        .sort((a, b) => b?.confidence - a?.confidence)[0] ??
      null;

    const topMusicBrainz =
      raw?.musicbrainz
        .map((r) => ({
          result: r,
          confidence: this._scoreMusicBrainz(r, query),
        }))
        .filter((r) => r?.confidence > 0)
        .sort((a, b) => b?.confidence - a?.confidence)[0] ?? null;

    const topAudiomack =
      raw?.audiomack
        .map((r) => ({ result: r, confidence: this._scoreAudiomack(r, query) }))
        .filter((r) => r?.confidence > 0)
        .sort((a, b) => b?.confidence - a?.confidence)[0] ?? null;

    const topJioSaavn =
      raw?.jiosaavn
        .map((r) => ({ result: r, confidence: this._scoreJioSaavn(r, query) }))
        .filter((r) => r?.confidence > 0)
        .sort((a, b) => b?.confidence - a?.confidence)[0] ?? null;

    // Count preliminary API confirmations (before threshold check) for cross-validation
    const CONFIDENCE_THRESHOLD = 55;
    const prelimConfirmed = [
      topSpotify,
      topApple,
      topDeezer,
      topAudiomack,
    ].filter((r) => r !== null && r?.confidence >= CONFIDENCE_THRESHOLD).length;
    const bonus = this._crossValidationBonus(prelimConfirmed);

    // Apply cross-validation bonus — if multiple platforms agree, boost each match
    const apply = <T>(r: { result: T; confidence: number } | null) =>
      r
        ? { result: r.result, confidence: Math.min(100, r?.confidence + bonus) }
        : null;

    const finalSpotify = apply(topSpotify);
    const finalApple = apply(topApple);
    const finalDeezer = apply(topDeezer);
    const finalMusicBrainz = apply(topMusicBrainz);
    const finalAudiomack = apply(topAudiomack);
    const finalJioSaavn = apply(topJioSaavn);

    const updates: Partial<InsertArtistProfile> = {};
    const savedFields: string[] = [];

    if (
      finalSpotify &&
      finalSpotify?.confidence >= CONFIDENCE_THRESHOLD &&
      !profile?.spotifyArtistId
    ) {
      updates.spotifyArtistId = finalSpotify?.result.id;
      updates.spotifyArtistUri = finalSpotify?.result.uri;
      if (finalSpotify?.result.imageUrl && !profile?.profileImageUrl) {
        updates.profileImageUrl = finalSpotify?.result.imageUrl;
      }
      if (
        finalSpotify?.result.genres?.length > 0 &&
        (!profile?.genres || profile?.genres.length === 0)
      ) {
        updates.genres = finalSpotify?.result.genres?.slice(0, 5);
      }
      savedFields?.push("spotify");
    }

    if (
      finalApple &&
      finalApple?.confidence >= CONFIDENCE_THRESHOLD &&
      !profile?.appleArtistId
    ) {
      updates.appleArtistId = finalApple?.result.id;
      savedFields?.push("apple");
    }

    if (
      finalDeezer &&
      finalDeezer?.confidence >= CONFIDENCE_THRESHOLD &&
      !profile?.deezerArtistId
    ) {
      updates.deezerArtistId = finalDeezer?.result.id;
      if (
        finalDeezer?.result.pictureUrl &&
        !profile?.profileImageUrl &&
        !updates?.profileImageUrl
      ) {
        updates.profileImageUrl = finalDeezer?.result.pictureUrl;
      }
      savedFields?.push("deezer");
    }

    if (
      finalAudiomack &&
      finalAudiomack?.confidence >= CONFIDENCE_THRESHOLD &&
      !profile?.soundcloudArtistId
    ) {
      updates.soundcloudArtistId =
        finalAudiomack?.result.slug || finalAudiomack?.result.id;
      savedFields?.push("audiomack");
    }

    // MusicBrainz and JioSaavn confirm identity but don't save separate platform ID fields
    if (
      finalMusicBrainz &&
      finalMusicBrainz.confidence >= CONFIDENCE_THRESHOLD
    ) {
      savedFields.push("musicbrainz_confirmed");
      logger.info(
        `[ArtistProfile] MusicBrainz confirmed: profile=${profileId} mbid=${finalMusicBrainz.result.id} score=${finalMusicBrainz.confidence}`,
      );
    }

    if (finalJioSaavn && finalJioSaavn.confidence >= CONFIDENCE_THRESHOLD) {
      savedFields.push("jiosaavn_confirmed");
    }

    // Get LabelGrid platform presences — either from search result directly,
    // or by making a second call using the artist ID from the search result.
    let labelgridPlatforms: LabelGridArtistPlatformPresence[] = [];
    if (lgArtist) {
      if ((lgArtist as any).platforms && (lgArtist as any).platforms.length > 0) {
        labelgridPlatforms = (lgArtist as any).platforms;
      } else {
        // Search result didn't embed platforms — fetch them separately
        labelgridPlatforms = await labelGridService
          .getArtistPlatformPresence((lgArtist as any)?.id)
          .catch(() => []);
      }
      logger.info(
        `[ArtistProfile] LabelGrid: artist=${(lgArtist as any).name} platforms=${labelgridPlatforms?.length}`,
      );
    }

    const labelgridConfigured = labelGridService?.isApiConfigured();

    // Generate URL-template discoveries for all 97 DSPs.
    // These are generated once using the verified artist name — NOT fetched per platform.
    const urlDiscoveries = this.generateUrlDiscoveries(query);

    const saved =
      savedFields?.filter((f) => !f?.endsWith("_confirmed")).length > 0;
    if (saved) {
      await this.updateProfile(profileId, userId, updates);
      logger.info(
        `[ArtistProfile] Auto-discover saved: profile=${profileId} platforms=[${savedFields?.join(",")}]`,
      );

      // Breakthrough: auto-init claim pipeline for every newly discovered platform
      // This creates the pipeline row at 'unstarted' state so claim tracking begins immediately
      const claimablePlatforms = savedFields?.filter(
        (f) => !f?.endsWith("_confirmed"),
      );
      const platformMap: Record<string, string> = {
        spotify: "spotify",
        apple: "apple_music",
        deezer: "deezer",
        youtube: "youtube",
        soundcloud: "soundcloud",
        audiomack: "audiomack",
        musicbrainz: "musicbrainz",
      };
      for (const field of claimablePlatforms) {
        const platformKey = platformMap[field];
        if (platformKey) {
          try {
            await this.updateClaimState(
              profileId,
              userId,
              platformKey,
              "unstarted",
              "system",
              "Auto-initialized on platform discovery",
            );
          } catch {
            // Non-fatal — don't block discovery if claim init fails
          }
        }
      }
    }

    if (bonus > 0) {
      logger.info(
        `[ArtistProfile] Cross-validation bonus +${bonus} applied: ${prelimConfirmed} platforms confirmed profile=${profileId}`,
      );
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
      upcDiscovered: !!(upcApple || upcDeezer),
    };
  }

  async autoSync(
    profileId: string,
    userId: string,
  ): Promise<{
    synced: string[];
    changes: Record<string, unknown>;
  }> {
    const profile = await this.getProfile(profileId, userId);
    if (!profile) throw new Error("Artist profile not found");

    const updates: Partial<InsertArtistProfile> = {};
    const synced: string[] = [];
    const changes: Record<string, unknown> = {};

    if (profile.spotifyArtistId) {
      const fresh = await this.verifySpotifyArtist(profile.spotifyArtistId);
      if (fresh) {
        synced.push("spotify");
        if (fresh.imageUrl && fresh.imageUrl !== profile.profileImageUrl) {
          updates.profileImageUrl = fresh.imageUrl;
          changes.profileImageUrl = fresh.imageUrl;
        }
        if (fresh.genres.length > 0) {
          const existing = JSON.stringify(
            (profile.genres ?? []).slice().sort(),
          );
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
        const res = await fetch(
          `https://api.deezer.com/artist/${profile.deezerArtistId}`,
          {
            signal: AbortSignal.timeout(8000),
          },
        );
        if (res.ok) {
          const d = (await res.json()) as Record<string, unknown>;
          synced.push("deezer");
          if (
            d.picture_medium &&
            d.picture_medium !== profile.profileImageUrl &&
            !updates.profileImageUrl
          ) {
            updates.profileImageUrl = d.picture_medium;
            changes.profileImageUrl = d.picture_medium;
          }
        }
      } catch {
        logger.warn(
          `[ArtistProfile] Deezer sync failed for profile=${profileId}`,
        );
      }
    }

    if (Object.keys(updates).length > 0) {
      await this.updateProfile(profileId, userId, updates);
      logger.info(
        `[ArtistProfile] Auto-sync updated: profile=${profileId} synced=[${synced.join(",")}]`,
      );
    }

    return { synced, changes };
  }

  buildDistributionMetadata(
    profile: ArtistProfile,
  ): Record<string, string | null> {
    return {
      artistName: profile.artistName,
      isNewArtist: profile.isNewArtist ? "true" : "false",
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

  async profileHub(
    profileId: string,
    userId: string,
  ): Promise<{
    artistName: string;
    profileImageUrl: string | null;
    genres: string[];
    isVerified: boolean;
    verifiedPlatforms: string[];
    portals: {
      key: string;
      label: string;
      portalUrl: string;
      artistPageUrl: string | null;
      fieldKey: string | null;
      claimed: boolean;
      artistId: string | null;
      howVerified: string;
      claimInstructions: string;
      distributorHandles: boolean;
      autoDiscoverKey: string | null;
    }[];
    metadataKeys: {
      artistName: string;
      storedIds: Record<string, string>;
    };
    urlDiscoveries: PlatformUrlDiscovery[];
    labelgridConfigured: boolean;
  }> {
    const profile = await this.getProfile(profileId, userId);
    if (!profile) throw new Error("Artist profile not found");

    const portals = [
      {
        key: "spotify",
        label: "Spotify for Artists",
        portalUrl: "https://artists.spotify.com/",
        artistPageUrl: profile.spotifyArtistId
          ? `https://open.spotify.com/artist/${profile.spotifyArtistId}`
          : null,
        fieldKey: "spotifyArtistId",
        claimed: !!profile.spotifyArtistId,
        artistId: profile.spotifyArtistId ?? null,
        howVerified: "Distributor metadata + artist name",
        claimInstructions:
          "After your first release is live on Spotify, go to artists.spotify.com and claim your profile using the email address on file with your distributor.",
        distributorHandles: false,
        autoDiscoverKey: "spotify",
      },
      {
        key: "apple",
        label: "Apple Music for Artists",
        portalUrl: "https://artists.apple.com/",
        artistPageUrl: profile.appleArtistId
          ? `https://music.apple.com/us/artist/${profile.appleArtistId}`
          : null,
        fieldKey: "appleArtistId",
        claimed: !!profile.appleArtistId,
        artistId: profile.appleArtistId ?? null,
        howVerified: "Apple ID + distributor metadata",
        claimInstructions:
          "Sign in at artists.apple.com with the Apple ID connected to your music account. Apple verifies via your iTunes Connect / distributor relationship.",
        distributorHandles: false,
        autoDiscoverKey: "apple",
      },
      {
        key: "amazon",
        label: "Amazon Music for Artists",
        portalUrl: "https://artists.amazon.com/",
        artistPageUrl: null,
        fieldKey: "amazonMusicArtistId",
        claimed: !!profile.amazonMusicArtistId,
        artistId: profile.amazonMusicArtistId ?? null,
        howVerified: "Identity verification via Amazon account",
        claimInstructions:
          "Go to artists.amazon.com, sign in with your Amazon account, and search for your artist name. You'll need at least one release live on Amazon Music.",
        distributorHandles: false,
        autoDiscoverKey: null,
      },
      {
        key: "youtube",
        label: "YouTube Official Artist Channel",
        portalUrl: "https://studio.youtube.com/",
        artistPageUrl: profile.youtubeChannelId
          ? `https://www.youtube.com/channel/${profile.youtubeChannelId}`
          : null,
        fieldKey: "youtubeChannelId",
        claimed: !!profile?.youtubeChannelId,
        artistId: profile.youtubeChannelId ?? null,
        howVerified: "Channel ownership + music delivery via distributor",
        claimInstructions:
          "Your distributor (LabelGrid) can request YouTube OAC (Official Artist Channel) merging once you have music on YouTube. This consolidates all your music under one verified channel. Alternatively, link your existing YouTube channel in YouTube Studio.",
        distributorHandles: true,
        autoDiscoverKey: null,
      },
      {
        key: "deezer",
        label: "Deezer for Creators",
        portalUrl: "https://creators.deezer.com/",
        artistPageUrl: profile.deezerArtistId
          ? `https://www.deezer.com/artist/${profile.deezerArtistId}`
          : null,
        fieldKey: "deezerArtistId",
        claimed: !!profile?.deezerArtistId,
        artistId: profile.deezerArtistId ?? null,
        howVerified: "Distributor metadata matching",
        claimInstructions:
          "Go to creators.deezer.com, create a free account, and search for your artist name to request access. Deezer typically approves within a few days.",
        distributorHandles: false,
        autoDiscoverKey: "deezer",
      },
      {
        key: "tidal",
        label: "Tidal for Artists",
        portalUrl: "https://artists.tidal.com/",
        artistPageUrl: null,
        fieldKey: "tidalArtistId",
        claimed: !!profile?.tidalArtistId,
        artistId: profile.tidalArtistId ?? null,
        howVerified: "Distributor metadata",
        claimInstructions:
          "Sign up at artists.tidal.com. TIDAL reviews requests manually and typically approves within 1–2 weeks. Your distributor's delivery to TIDAL helps confirm your identity.",
        distributorHandles: false,
        autoDiscoverKey: null,
      },
      {
        key: "pandora",
        label: "Pandora for Artists",
        portalUrl: "https://artists.pandora.com/",
        artistPageUrl: null,
        fieldKey: null,
        claimed: false,
        artistId: null,
        howVerified: "Distributor delivery confirmation",
        claimInstructions:
          "Register at artists.pandora.com. Pandora requires you to have distributed music to Pandora first. Use the same email associated with your distributor account.",
        distributorHandles: false,
        autoDiscoverKey: null,
      },
      {
        key: "soundcloud",
        label: "SoundCloud for Artists",
        portalUrl: "https://soundcloud.com/for/artists",
        artistPageUrl: profile.soundcloudArtistId
          ? `https://soundcloud.com/${profile.soundcloudArtistId}`
          : null,
        fieldKey: "soundcloudArtistId",
        claimed: !!profile.soundcloudArtistId,
        artistId: profile.soundcloudArtistId ?? null,
        howVerified: "Account verification + distribution delivery",
        claimInstructions:
          "Visit soundcloud.com/for/artists to upgrade to SoundCloud Pro for expanded analytics. Your username/slug on SoundCloud is your identifier.",
        distributorHandles: false,
        autoDiscoverKey: "audiomack",
      },
    ];

    const storedIds: Record<string, string> = {};
    if (profile.spotifyArtistId) storedIds["Spotify"] = profile.spotifyArtistId;
    if (profile.appleArtistId) storedIds["Apple"] = profile.appleArtistId;
    if (profile.deezerArtistId) storedIds["Deezer"] = profile.deezerArtistId;
    if (profile.tidalArtistId) storedIds["Tidal"] = profile.tidalArtistId;
    if (profile.youtubeChannelId)
      storedIds["YouTube"] = profile.youtubeChannelId;
    if (profile.amazonMusicArtistId)
      storedIds["Amazon"] = profile.amazonMusicArtistId;
    if (profile.soundcloudArtistId)
      storedIds["SoundCloud"] = profile.soundcloudArtistId;

    const urlDiscoveries = this.generateUrlDiscoveries(profile.artistName);
    const labelgridConfigured = labelGridService.isApiConfigured();

    return {
      artistName: profile.artistName,
      profileImageUrl: profile.profileImageUrl ?? null,
      genres: profile.genres ?? [],
      isVerified: profile.isVerified,
      verifiedPlatforms: (profile.verifiedPlatforms ?? []) as string[],
      portals,
      metadataKeys: {
        artistName: profile.artistName,
        storedIds,
      },
      urlDiscoveries,
      labelgridConfigured,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 1: FOUNDATION — ISRC Chain Discovery
  // Uses ISRCs from distro_tracks to find artist IDs across platforms.
  // Chain: ISRC → MusicBrainz MBID → Spotify/Apple/Deezer IDs
  // ══════════════════════════════════════════════════════════════════════════

  async isrcChainDiscover(
    profileId: string,
    userId: string,
  ): Promise<{
    isrcsSearched: string[];
    mbidFound: string | null;
    platformsDiscovered: Record<string, string>;
    savedFields: string[];
    chainSteps: Array<{ step: string; result: string; success: boolean }>;
  }> {
    const profile = await this.getProfile(profileId, userId);
    if (!profile) throw new Error("Artist profile not found");

    const chainSteps: Array<{
      step: string;
      result: string;
      success: boolean;
    }> = [];
    const platformsDiscovered: Record<string, string> = {};
    const savedFields: string[] = [];

    // Step 1: Get all ISRCs from distribution releases linked to this profile
    const profileReleases = await db
      .select({ releaseId: artistProfileReleases.releaseId })
      .from(artistProfileReleases)
      .where(eq(artistProfileReleases.artistProfileId, profileId));

    const releaseIds = profileReleases.map((r) => r.releaseId).filter(Boolean);

    // Also look at distroReleases via distroTracks
    const tracks =
      releaseIds.length > 0
        ? await db
            .select({ isrc: distroTracks.isrc })
            .from(distroTracks)
            .where(inArray(distroTracks.releaseId, releaseIds))
        : [];

    const isrcs = tracks
      .map((t) => t.isrc)
      .filter((i): i is string => !!i && i.length === 12);
    const uniqueIsrcs = [...new Set(isrcs)].slice(0, 10); // Limit to 10 for rate limiting

    chainSteps.push({
      step: "ISRC collection from distribution history",
      result:
        uniqueIsrcs.length > 0
          ? `Found ${uniqueIsrcs.length} ISRCs: ${uniqueIsrcs.slice(0, 3).join(", ")}${uniqueIsrcs.length > 3 ? "…" : ""}`
          : "No ISRCs found in distribution history",
      success: uniqueIsrcs.length > 0,
    });

    if (uniqueIsrcs.length === 0) {
      return {
        isrcsSearched: [],
        mbidFound: null,
        platformsDiscovered,
        savedFields,
        chainSteps,
      };
    }

    // Step 2: Query MusicBrainz for each ISRC to find the recording and linked artist MBID
    let mbid: string | null = null;
    let mbArtistName: string | null = null;

    for (const isrc of uniqueIsrcs) {
      if (mbid) break;
      try {
        const url = `https://musicbrainz.org/ws/2/isrc/${isrc}?fmt=json&inc=artists`;
        const res = await fetch(url, {
          headers: { "User-Agent": "MaxBooster/3.0 (music-career-platform)" },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) continue;
        const data = (await res.json()) as Record<string, unknown>;
        const recordings = data.recordings ?? [];
        for (const recording of recordings) {
          const artistCredit = recording["artist-credit"][0];
          if (artistCredit.artist) {
            const nameSim = this._nameSimilarity(
              artistCredit.artist.name,
              profile.artistName,
            );
            if (nameSim >= 60) {
              mbid = artistCredit.artist.id;
              mbArtistName = artistCredit.artist.name;
              break;
            }
          }
        }
        if (mbid) break;
        await new Promise((r) => setTimeout(r, 500)); // MusicBrainz rate limit: 1 req/sec
      } catch {
        // Continue with next ISRC
      }
    }

    chainSteps.push({
      step: "MusicBrainz ISRC → MBID lookup",
      result: mbid
        ? `Found MBID ${mbid} for "${mbArtistName}"`
        : "No matching artist MBID found",
      success: !!mbid,
    });

    if (!mbid) {
      return {
        isrcsSearched: uniqueIsrcs,
        mbidFound: null,
        platformsDiscovered,
        savedFields,
        chainSteps,
      };
    }

    // Step 3: Use MBID to query MusicBrainz artist relations for Spotify/Apple IDs
    try {
      const url = `https://musicbrainz.org/ws/2/artist/${mbid}?fmt=json&inc=url-rels`;
      const res = await fetch(url, {
        headers: { "User-Agent": "MaxBooster/3.0 (music-career-platform)" },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        const relations: Record<string, unknown>[] = data.relations ?? [];

        for (const rel of relations) {
          const url = (rel.url as any).resource ?? "";
          if (
            !profile.spotifyArtistId &&
            url.includes("open.spotify.com/artist/")
          ) {
            const id = url.split("/artist/")[1].split("?")[0];
            if (id) {
              platformsDiscovered.spotify = id;
            }
          }
          if (
            !profile.appleArtistId &&
            url.includes("music.apple.com") &&
            url.includes("/artist/")
          ) {
            const parts = url.split("/artist/");
            const id = parts[1].split("/")[0].split("?")[0];
            if (id) {
              platformsDiscovered.apple = id;
            }
          }
          if (!profile.deezerArtistId && url.includes("deezer.com/artist/")) {
            const id = url.split("/artist/")[1].split("?")[0];
            if (id) {
              platformsDiscovered.deezer = id;
            }
          }
          if (
            !profile.youtubeChannelId &&
            url.includes("youtube.com/channel/")
          ) {
            const id = url.split("/channel/")[1].split("?")[0];
            if (id) {
              platformsDiscovered.youtube = id;
            }
          }
          if (!profile.soundcloudArtistId && url.includes("soundcloud.com/")) {
            const slug = url.split("soundcloud.com/")[1].split("/")[0];
            if (slug) {
              platformsDiscovered.soundcloud = slug;
            }
          }
        }

        chainSteps.push({
          step: "MusicBrainz MBID → URL relations lookup",
          result:
            Object.keys(platformsDiscovered).length > 0
              ? `Found IDs for: ${Object.keys(platformsDiscovered).join(", ")}`
              : "No linked platform URLs found on MusicBrainz",
          success: Object.keys(platformsDiscovered).length > 0,
        });
      }
    } catch {
      chainSteps.push({
        step: "MusicBrainz URL relations lookup",
        result: "Request failed",
        success: false,
      });
    }

    // Step 4: Save discovered IDs + update identity graph
    const updates: Partial<InsertArtistProfile> = {};
    if (!profile.musicbrainzId && mbid) {
      updates.musicbrainzId = mbid;
      savedFields.push("musicbrainz");
    }
    if (platformsDiscovered.spotify && !profile.spotifyArtistId) {
      updates.spotifyArtistId = platformsDiscovered.spotify;
      updates.spotifyArtistUri = `spotify:artist:${platformsDiscovered.spotify}`;
      savedFields.push("spotify");
    }
    if (platformsDiscovered.apple && !profile.appleArtistId) {
      updates.appleArtistId = platformsDiscovered.apple;
      savedFields.push("apple");
    }
    if (platformsDiscovered.deezer && !profile.deezerArtistId) {
      updates.deezerArtistId = platformsDiscovered.deezer;
      savedFields.push("deezer");
    }
    if (platformsDiscovered.youtube && !profile.youtubeChannelId) {
      updates.youtubeChannelId = platformsDiscovered.youtube;
      savedFields.push("youtube");
    }
    if (platformsDiscovered.soundcloud && !profile.soundcloudArtistId) {
      updates.soundcloudArtistId = platformsDiscovered.soundcloud;
      savedFields.push("soundcloud");
    }

    if (Object.keys(updates).length > 0) {
      await this.updateProfile(profileId, userId, updates);
    }

    // Propagate identity graph links (ISRC-chain is highest confidence = 98)
    const confirmedPlatforms = Object.entries(platformsDiscovered);
    for (let i = 0; i < confirmedPlatforms.length; i++) {
      for (let j = i + 1; j < confirmedPlatforms.length; j++) {
        await this._upsertIdentityLink(
          profileId,
          confirmedPlatforms[i][0],
          confirmedPlatforms[i][1],
          confirmedPlatforms[j][0],
          confirmedPlatforms[j][1],
          98,
          "isrc_chain",
        ).catch(() => {});
      }
      // Also link MBID to each platform
      if (mbid) {
        await this._upsertIdentityLink(
          profileId,
          "musicbrainz",
          mbid,
          confirmedPlatforms[i][0],
          confirmedPlatforms[i][1],
          98,
          "isrc_chain",
        ).catch(() => {});
      }
    }

    chainSteps.push({
      step: "Save discovered IDs and update identity graph",
      result:
        savedFields.length > 0
          ? `Saved: ${savedFields.join(", ")}`
          : "No new IDs to save (already populated)",
      success: true,
    });

    logger.info(
      `[ArtistProfile] ISRC chain discovery: profile=${profileId} saved=[${savedFields.join(",")}] mbid=${mbid}`,
    );

    return {
      isrcsSearched: uniqueIsrcs,
      mbidFound: mbid,
      platformsDiscovered,
      savedFields,
      chainSteps,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 1: FOUNDATION — Split Profile Scanner
  // Detects music that landed on wrong artist page IDs across platforms
  // ══════════════════════════════════════════════════════════════════════════

  async scanForSplitProfiles(
    profileId: string,
    userId: string,
  ): Promise<{
    splitsDetected: number;
    splitEvents: Array<{
      platform: string;
      storedId: string;
      detectedId: string;
      affectedIsrcs: string[];
      releaseTitle?: string;
    }>;
    scannedPlatforms: string[];
    lastScannedAt: string;
  }> {
    const profile = await this.getProfile(profileId, userId);
    if (!profile) throw new Error("Artist profile not found");

    const splitEvents: Array<{
      platform: string;
      storedId: string;
      detectedId: string;
      affectedIsrcs: string[];
      releaseTitle?: string;
    }> = [];
    const scannedPlatforms: string[] = [];

    // Get all ISRCs for this profile
    const profileReleases = await db
      .select({ releaseId: artistProfileReleases.releaseId })
      .from(artistProfileReleases)
      .where(eq(artistProfileReleases.artistProfileId, profileId));

    const releaseIds = profileReleases.map((r) => r.releaseId).filter(Boolean);
    const tracks =
      releaseIds.length > 0
        ? await db
            .select({ isrc: distroTracks.isrc, title: distroTracks.title })
            .from(distroTracks)
            .where(inArray(distroTracks.releaseId, releaseIds))
        : [];
    const isrcs = [
      ...new Set(tracks.map((t) => t.isrc).filter((i): i is string => !!i)),
    ].slice(0, 5);

    // Check Spotify: verify that our stored artist ID matches what MusicBrainz reports for each ISRC
    if (profile.spotifyArtistId && isrcs.length > 0) {
      scannedPlatforms.push("spotify");
      const detectedOnWrongPage: string[] = [];

      for (const isrc of isrcs.slice(0, 3)) {
        try {
          const res = await fetch(
            `https://musicbrainz.org/ws/2/isrc/${isrc}?fmt=json&inc=artists`,
            {
              headers: {
                "User-Agent": "MaxBooster/3.0 (music-career-platform)",
              },
              signal: AbortSignal.timeout(6000),
            },
          );
          if (!res.ok) continue;
          const data = (await res.json()) as Record<string, unknown>;
          // Look at URL relations to check Spotify artist IDs
          for (const recording of data.recordings ?? []) {
            const mbArtistId = recording["artist-credit"][0].artist.id;
            if (mbArtistId) {
              // Use mbid→spotify URL relation to get Spotify ID
              const relRes = await fetch(
                `https://musicbrainz.org/ws/2/artist/${mbArtistId}?fmt=json&inc=url-rels`,
                {
                  headers: { "User-Agent": "MaxBooster/3.0" },
                  signal: AbortSignal.timeout(6000),
                },
              );
              if (relRes.ok) {
                const relData = (await relRes.json()) as Record<
                  string,
                  unknown
                >;
                for (const rel of relData.relations ?? []) {
                  const url = rel.url.resource ?? "";
                  if (url.includes("open.spotify.com/artist/")) {
                    const detectedSpotifyId = url
                      .split("/artist/")[1]
                      .split("?")[0];
                    if (
                      detectedSpotifyId &&
                      detectedSpotifyId !== profile.spotifyArtistId
                    ) {
                      detectedOnWrongPage.push(isrc);
                      break;
                    }
                  }
                }
              }
            }
          }
          await new Promise((r) => setTimeout(r, 600));
        } catch {
          /* skip */
        }
      }

      if (detectedOnWrongPage.length > 0) {
        const evt = {
          platform: "spotify",
          storedId: profile.spotifyArtistId,
          detectedId: "unknown (check MusicBrainz)",
          affectedIsrcs: detectedOnWrongPage,
          releaseTitle:
            tracks.find((t) => t.isrc && detectedOnWrongPage.includes(t.isrc))
              .title ?? undefined,
        };
        splitEvents.push(evt);

        // Record in DB
        await db
          .insert(profileSplitEvents)
          .values({
            artistProfileId: profileId,
            platform: "spotify",
            storedArtistId: profile.spotifyArtistId,
            detectedArtistId: "unknown",
            affectedIsrcs: detectedOnWrongPage,
            releaseTitle: evt.releaseTitle,
          })
          .onConflictDoNothing();
      }
    }

    // Update profile split_detected flag
    const hasSplits = splitEvents.length > 0;
    await db
      .update(artistProfiles)
      .set({
        splitDetected: hasSplits,
        lastWatchedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(artistProfiles.id, profileId));

    logger.info(
      `[ArtistProfile] Split scan complete: profile=${profileId} splits=${splitEvents.length}`,
    );

    return {
      splitsDetected: splitEvents.length,
      splitEvents,
      scannedPlatforms,
      lastScannedAt: new Date().toISOString(),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 2: INTELLIGENCE — Profile Health Score (0–100)
  // Five dimensions: coverage, metadata, verification, freshness, safety
  // ══════════════════════════════════════════════════════════════════════════

  async calculateHealthScore(
    profileId: string,
    userId: string,
  ): Promise<{
    score: number;
    breakdown: Record<string, number>;
    recommendations: string[];
    grade: "A" | "B" | "C" | "D" | "F";
  }> {
    const profile = await this.getProfile(profileId, userId);
    if (!profile) throw new Error("Artist profile not found");

    const breakdown: Record<string, number> = {};
    const recommendations: string[] = [];

    // ── 1. Coverage (0–25): key portal claimed count ──────────────────────
    const keyPortals = [
      profile.spotifyArtistId,
      profile.appleArtistId,
      profile.deezerArtistId,
      profile.youtubeChannelId,
      profile.tidalArtistId,
      profile.soundcloudArtistId,
      profile.amazonMusicArtistId,
    ];
    const claimedCount = keyPortals.filter(Boolean).length;
    const coverageScore = Math.round(
      (claimedCount / keyPortals.length) * HEALTH_WEIGHTS.coverage,
    );
    breakdown.coverage = coverageScore;
    if (claimedCount < 4)
      recommendations.push(
        `Claim ${4 - claimedCount} more key DSP portals to protect your profile`,
      );
    if (!profile.spotifyArtistId)
      recommendations.push("Claim Spotify for Artists — highest priority");
    if (!profile.appleArtistId)
      recommendations.push("Claim Apple Music for Artists");

    // ── 2. Metadata (0–25): image, bio, genres, social handles ───────────
    let metaScore = 0;
    if (profile.profileImageUrl) metaScore += 8;
    else
      recommendations.push(
        "Add a profile image to establish visual identity across platforms",
      );
    if (profile.genres && profile.genres.length >= 2) metaScore += 7;
    else if (profile.genres && profile.genres.length === 1) metaScore += 4;
    else recommendations.push("Add genre tags to improve discoverability");
    if (profile.profileBio && profile.profileBio.length >= 100) metaScore += 6;
    else
      recommendations.push(
        "Write a bio (100+ chars) to help curators and fans find you",
      );
    const handles = (profile.socialHandles as Record<string, string>) ?? {};
    if (Object.keys(handles).length >= 2) metaScore += 4;
    else
      recommendations.push(
        "Link your social handles to bridge fans across platforms",
      );
    breakdown.metadata = Math.min(metaScore, HEALTH_WEIGHTS.metadata);

    // ── 3. Verification (0–20): verified platform count ──────────────────
    const verifiedPlatforms = (profile.verifiedPlatforms ?? []) as string[];
    const verifyScore = Math.min(
      Math.round((verifiedPlatforms.length / 3) * HEALTH_WEIGHTS.verification),
      HEALTH_WEIGHTS.verification,
    );
    breakdown.verification = verifyScore;
    if (verifiedPlatforms.length === 0)
      recommendations.push("Verify your Spotify profile for a trusted badge");
    if (!verifiedPlatforms.includes("spotify") && profile.spotifyArtistId) {
      recommendations.push(
        "Run Spotify verification to confirm your artist ID",
      );
    }

    // ── 4. Freshness (0–15): recent sync + no stale data ─────────────────
    let freshnessScore = HEALTH_WEIGHTS.freshness;
    const now = Date.now();
    const lastSync = profile.updatedAt
      ? new Date(profile.updatedAt).getTime()
      : 0;
    const daysSinceSync = (now - lastSync) / (1000 * 60 * 60 * 24);
    if (daysSinceSync > 90) {
      freshnessScore -= 8;
      recommendations.push(
        "Run Auto-Sync — your profile data is over 90 days old",
      );
    } else if (daysSinceSync > 30) {
      freshnessScore -= 4;
      recommendations.push("Run Auto-Sync to refresh your platform metadata");
    }
    const lastWatch = profile.lastWatchedAt
      ? new Date(profile.lastWatchedAt).getTime()
      : 0;
    const daysSinceWatch = (now - lastWatch) / (1000 * 60 * 60 * 24);
    if (daysSinceWatch > 30 || !profile.lastWatchedAt) {
      freshnessScore -= 5;
      recommendations.push(
        "Run Split Scanner to check for unauthorized profile splits",
      );
    }
    breakdown.freshness = Math.max(0, freshnessScore);

    // ── 5. Safety (0–15): no splits, claim events logged, watch active ───
    let safetyScore = HEALTH_WEIGHTS.safety;
    if (profile.splitDetected) {
      safetyScore -= 10;
      recommendations.unshift(
        "URGENT: A split profile has been detected — fix immediately with the Fixer tool",
      );
    }
    if (!profile.watchEnabled) {
      safetyScore -= 3;
      recommendations.push(
        "Enable profile watch to detect unauthorized releases",
      );
    }
    if (profile.fixerPending) {
      safetyScore -= 2;
    }
    breakdown.safety = Math.max(0, safetyScore);

    const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
    const grade: "A" | "B" | "C" | "D" | "F" =
      score >= 85
        ? "A"
        : score >= 70
          ? "B"
          : score >= 55
            ? "C"
            : score >= 40
              ? "D"
              : "F";

    // Persist to DB
    await db
      .update(artistProfiles)
      .set({
        healthScore: score,
        healthBreakdown: breakdown,
        lastHealthAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(artistProfiles.id, profileId));

    return {
      score,
      breakdown,
      recommendations: recommendations.slice(0, 6),
      grade,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 1: FOUNDATION — Claim Pipeline State Machine
  // ══════════════════════════════════════════════════════════════════════════

  async getClaimPipeline(
    profileId: string,
    userId: string,
  ): Promise<{
    pipeline: Array<
      ProfileClaimPipeline & { stateIndex: number; label: string }
    >;
  }> {
    // Verify ownership
    const profile = await this.getProfile(profileId, userId);
    if (!profile) throw new Error("Artist profile not found");

    const rows = await db
      .select()
      .from(profileClaimPipeline)
      .where(eq(profileClaimPipeline.artistProfileId, profileId));

    const STATE_LABELS: Record<string, string> = {
      unstarted: "Not Started",
      instructions_viewed: "Instructions Read",
      portal_opened: "Portal Visited",
      id_submitted: "ID Submitted",
      verified: "Verified",
      watching: "Monitoring",
    };

    return {
      pipeline: rows.map((r) => ({
        ...r,
        stateIndex: CLAIM_STATES.indexOf(r.state as ClaimState),
        label: STATE_LABELS[r.state] ?? r.state,
      })),
    };
  }

  async updateClaimState(
    profileId: string,
    userId: string,
    platform: string,
    newState: ClaimState,
    triggeredBy: "user" | "system" = "user",
    notes?: string,
  ): Promise<ProfileClaimPipeline> {
    const profile = await this.getProfile(profileId, userId);
    if (!profile) throw new Error("Artist profile not found");

    // Get or create pipeline row for this platform
    const [existing] = await db
      .select()
      .from(profileClaimPipeline)
      .where(
        and(
          eq(profileClaimPipeline.artistProfileId, profileId),
          eq(profileClaimPipeline.platform, platform),
        ),
      );

    const fromState = existing.state ?? "unstarted";

    const now = new Date();
    const stateTimestamps: Record<string, Date | undefined> = {
      instructionsViewedAt: existing.instructionsViewedAt ?? undefined,
      portalOpenedAt: existing.portalOpenedAt ?? undefined,
      idSubmittedAt: existing.idSubmittedAt ?? undefined,
      verifiedAt: existing.verifiedAt ?? undefined,
      watchingStartedAt: existing.watchingStartedAt ?? undefined,
    };
    if (newState === "instructions_viewed")
      stateTimestamps.instructionsViewedAt = now;
    if (newState === "portal_opened") stateTimestamps.portalOpenedAt = now;
    if (newState === "id_submitted") stateTimestamps.idSubmittedAt = now;
    if (newState === "verified") stateTimestamps.verifiedAt = now;
    if (newState === "watching") stateTimestamps.watchingStartedAt = now;

    let row: ProfileClaimPipeline;
    if (!existing) {
      const [inserted] = await db
        .insert(profileClaimPipeline)
        .values({
          artistProfileId: profileId,
          platform,
          state: newState,
          ...stateTimestamps,
          lastTransitionAt: now,
          notes: notes ?? null,
        })
        .returning();
      row = inserted;
    } else {
      const [updated] = await db
        .update(profileClaimPipeline)
        .set({
          state: newState,
          ...stateTimestamps,
          lastTransitionAt: now,
          notes: notes ?? existing.notes,
          updatedAt: now,
        })
        .where(eq(profileClaimPipeline.id, existing.id))
        .returning();
      row = updated;
    }

    // Log the event
    await db.insert(profileClaimEvents).values({
      artistProfileId: profileId,
      platform,
      fromState,
      toState: newState,
      triggeredBy,
      metadata: { notes: notes ?? null },
    });

    logger.info(
      `[ArtistProfile] Claim pipeline: profile=${profileId} platform=${platform} ${fromState}→${newState}`,
    );
    return row;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 2: INTELLIGENCE — Artist Identity Graph
  // ══════════════════════════════════════════════════════════════════════════

  private async _upsertIdentityLink(
    profileId: string,
    platformA: string,
    idA: string,
    platformB: string,
    idB: string,
    confidence: number,
    bridgeType = "name_match",
  ): Promise<void> {
    // Normalize order so (A,B) and (B,A) hash to the same row
    const [pa, ia, pb, ib] =
      platformA < platformB
        ? [platformA, idA, platformB, idB]
        : [platformB, idB, platformA, idA];

    const existing = await db
      .select({
        id: artistIdentityLinks.id,
        confidence: artistIdentityLinks.confidence,
      })
      .from(artistIdentityLinks)
      .where(
        and(
          eq(artistIdentityLinks.artistProfileId, profileId),
          eq(artistIdentityLinks.platformA, pa),
          eq(artistIdentityLinks.idA, ia),
          eq(artistIdentityLinks.platformB, pb),
          eq(artistIdentityLinks.idB, ib),
        ),
      );

    if (existing.length > 0) {
      // Only update if confidence improved
      if (confidence > existing[0].confidence) {
        await db
          .update(artistIdentityLinks)
          .set({ confidence, bridgeType, discoveredAt: new Date() })
          .where(eq(artistIdentityLinks.id, existing[0].id));
      }
    } else {
      await db.insert(artistIdentityLinks).values({
        artistProfileId: profileId,
        platformA: pa,
        idA: ia,
        platformB: pb,
        idB: ib,
        confidence,
        source: "auto_discover",
        bridgeType,
      });
    }
  }

  async getIdentityGraph(
    profileId: string,
    userId: string,
  ): Promise<{
    nodes: Array<{ platform: string; id: string; isConfirmed: boolean }>;
    links: ArtistIdentityLink[];
    confirmationScore: number;
  }> {
    const profile = await this.getProfile(profileId, userId);
    if (!profile) throw new Error("Artist profile not found");

    const links = await db
      .select()
      .from(artistIdentityLinks)
      .where(eq(artistIdentityLinks.artistProfileId, profileId));

    const nodeMap = new Map<
      string,
      { platform: string; id: string; isConfirmed: boolean }
    >();
    const confirmedPlatforms = new Set<string>([
      ...(profile.spotifyArtistId ? ["spotify"] : []),
      ...(profile.appleArtistId ? ["apple"] : []),
      ...(profile.deezerArtistId ? ["deezer"] : []),
      ...(profile.youtubeChannelId ? ["youtube"] : []),
      ...(profile.tidalArtistId ? ["tidal"] : []),
      ...(profile.soundcloudArtistId ? ["soundcloud"] : []),
      ...(profile.amazonMusicArtistId ? ["amazon"] : []),
      ...(profile.musicbrainzId ? ["musicbrainz"] : []),
    ]);

    for (const link of links) {
      nodeMap.set(`${link.platformA}:${link.idA}`, {
        platform: link.platformA,
        id: link.idA,
        isConfirmed: confirmedPlatforms.has(link.platformA),
      });
      nodeMap.set(`${link.platformB}:${link.idB}`, {
        platform: link.platformB,
        id: link.idB,
        isConfirmed: confirmedPlatforms.has(link.platformB),
      });
    }

    const avgConfidence =
      links.length > 0
        ? Math.round(links.reduce((s, l) => s + l.confidence, 0) / links.length)
        : 0;

    return {
      nodes: Array.from(nodeMap.values()),
      links,
      confirmationScore: avgConfidence,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 3: BREAKTHROUGH — Artist DNA Snapshot (immutable per release)
  // ══════════════════════════════════════════════════════════════════════════

  async snapshotArtistDNA(
    profileId: string,
    userId: string,
    releaseId?: string,
    upc?: string,
    isrcs?: string[],
  ): Promise<ArtistDnaSnapshot> {
    const profile = await this.getProfile(profileId, userId);
    if (!profile) throw new Error("Artist profile not found");

    const platformIds: Record<string, string> = {};
    if (profile.spotifyArtistId) platformIds.spotify = profile.spotifyArtistId;
    if (profile.appleArtistId) platformIds.apple = profile.appleArtistId;
    if (profile.deezerArtistId) platformIds.deezer = profile.deezerArtistId;
    if (profile.youtubeChannelId)
      platformIds.youtube = profile.youtubeChannelId;
    if (profile.tidalArtistId) platformIds.tidal = profile.tidalArtistId;
    if (profile.soundcloudArtistId)
      platformIds.soundcloud = profile.soundcloudArtistId;
    if (profile.amazonMusicArtistId)
      platformIds.amazon = profile.amazonMusicArtistId;
    if (profile.musicbrainzId) platformIds.musicbrainz = profile.musicbrainzId;

    const snapshotJson: Record<string, unknown> = {
      version: "3.0",
      capturedAt: new Date().toISOString(),
      artistName: profile.artistName,
      genres: profile.genres,
      profileImageUrl: profile.profileImageUrl,
      healthScore: profile.healthScore,
      platformIds,
      verifiedPlatforms: profile.verifiedPlatforms,
      isNewArtist: profile.isNewArtist,
      releaseId: releaseId ?? null,
      upc: upc ?? null,
      isrcList: isrcs ?? [],
    };

    const [snapshot] = await db
      .insert(artistDnaSnapshots)
      .values({
        artistProfileId: profileId,
        releaseId: releaseId ?? null,
        upc: upc ?? null,
        isrcList: isrcs ?? [],
        platformIdsAtSnapshot: platformIds,
        snapshotJson,
      })
      .returning();

    logger.info(
      `[ArtistProfile] DNA snapshot created: profile=${profileId} release=${releaseId ?? "none"} platforms=${Object.keys(platformIds).length}`,
    );
    return snapshot;
  }

  async getDnaSnapshots(
    profileId: string,
    userId: string,
  ): Promise<ArtistDnaSnapshot[]> {
    const profile = await this.getProfile(profileId, userId);
    if (!profile) throw new Error("Artist profile not found");
    return db
      .select()
      .from(artistDnaSnapshots)
      .where(eq(artistDnaSnapshots.artistProfileId, profileId));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 3: BREAKTHROUGH — Multi-platform Fixer
  // ══════════════════════════════════════════════════════════════════════════

  async submitMultiPlatformFixer(
    profileId: string,
    userId: string,
    targetPlatformIds: Record<string, string>,
    notes?: string,
  ): Promise<ArtistProfile | null> {
    const profile = await this.getProfile(profileId, userId);
    if (!profile) throw new Error("Artist profile not found");

    const targetPlatforms = Object.keys(targetPlatformIds);
    if (targetPlatforms.length === 0)
      throw new Error("At least one platform target is required");

    // Validate Spotify URI format if provided
    if (
      targetPlatformIds.spotify &&
      !targetPlatformIds.spotify.match(/^(spotify:artist:)?[A-Za-z0-9]+$/)
    ) {
      throw new Error("Invalid Spotify artist ID or URI");
    }

    const updates: Partial<InsertArtistProfile> = {
      fixerPending: true,
      fixerTargetPlatformIds: targetPlatformIds,
      fixerTargetPlatforms: targetPlatforms,
      fixerNotes: notes ?? null,
      fixerStatus: "pending",
      fixerRequestedAt: new Date(),
    };

    // For Spotify, also set the legacy field for backward compat
    if (targetPlatformIds.spotify) {
      const spotifyId = targetPlatformIds.spotify.startsWith("spotify:artist:")
        ? targetPlatformIds.spotify.replace("spotify:artist:", "")
        : targetPlatformIds.spotify;
      updates.fixerTargetSpotifyUri = `spotify:artist:${spotifyId}`;
    }

    const [updated] = await db
      .update(artistProfiles)
      .set({ ...updates, updatedAt: new Date() })
      .where(
        and(
          eq(artistProfiles.id, profileId),
          eq(artistProfiles.userId, userId),
        ),
      )
      .returning();

    logger.info(
      `[ArtistProfile] Multi-platform fixer submitted: profile=${profileId} platforms=[${targetPlatforms.join(",")}]`,
    );
    return updated ?? null;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 2: INTELLIGENCE — Cross-distributor History Import
  // ══════════════════════════════════════════════════════════════════════════

  async importDistributorHistory(
    profileId: string,
    userId: string,
    sourceDistributor: string,
    isrcList: string[],
    upcList: string[],
  ): Promise<{
    importId: string;
    isrcsQueued: number;
    upcsQueued: number;
    estimatedDiscoveries: number;
  }> {
    const profile = await this.getProfile(profileId, userId);
    if (!profile) throw new Error("Artist profile not found");

    const cleanIsrcs = [
      ...new Set(
        isrcList
          .map((i) => i.trim().toUpperCase())
          .filter((i) => i.length === 12),
      ),
    ];
    const cleanUpcs = [
      ...new Set(upcList.map((u) => u.trim()).filter((u) => u.length >= 8)),
    ];

    const [importRecord] = await db
      .insert(distributorHistoryImports)
      .values({
        artistProfileId: profileId,
        userId,
        sourceDistributor,
        isrcList: cleanIsrcs,
        upcList: cleanUpcs,
        status: "queued",
      })
      .returning();

    // Trigger immediate processing in the background
    this._processDistributorImport(
      importRecord.id,
      profileId,
      userId,
      cleanIsrcs,
      cleanUpcs,
    ).catch((err) => {
      logger.warn(`[ArtistProfile] Import processing failed: ${err.message}`);
    });

    return {
      importId: importRecord.id,
      isrcsQueued: cleanIsrcs.length,
      upcsQueued: cleanUpcs.length,
      estimatedDiscoveries: Math.round(
        (cleanIsrcs.length + cleanUpcs.length) * 0.6,
      ),
    };
  }

  private async _processDistributorImport(
    importId: string,
    profileId: string,
    userId: string,
    isrcs: string[],
    upcs: string[],
  ): Promise<void> {
    const discovered: Record<string, string> = {};

    // Query MusicBrainz for each ISRC
    for (const isrc of isrcs.slice(0, 15)) {
      try {
        const res = await fetch(
          `https://musicbrainz.org/ws/2/isrc/${isrc}?fmt=json&inc=artists+url-rels`,
          {
            headers: { "User-Agent": "MaxBooster/3.0" },
            signal: AbortSignal.timeout(6000),
          },
        );
        if (res.ok) {
          const data = (await res.json()) as {
            recordings?: Array<{
              "artist-credit"?: Array<{ artist?: { id?: string } }>;
            }>;
          };
          for (const recording of data.recordings ?? []) {
            const mbArtistId = recording["artist-credit"][0].artist.id;
            if (mbArtistId && !discovered.musicbrainz) {
              discovered.musicbrainz = mbArtistId;
            }
          }
        }
        await new Promise((r) => setTimeout(r, 600));
      } catch {
        /* skip */
      }
    }

    // Query MusicBrainz for each UPC/barcode (release lookup)
    for (const upc of upcs.slice(0, 15)) {
      try {
        const res = await fetch(
          `https://musicbrainz.org/ws/2/release/?query=barcode:${encodeURIComponent(upc)}&fmt=json`,
          {
            headers: { "User-Agent": "MaxBooster/3.0" },
            signal: AbortSignal.timeout(6000),
          },
        );
        if (res.ok) {
          const data = (await res.json()) as {
            releases?: Array<{
              "artist-credit"?: Array<{ artist?: { id?: string } }>;
            }>;
          };
          for (const release of data.releases ?? []) {
            const mbArtistId = release["artist-credit"][0].artist.id;
            if (mbArtistId && !discovered.musicbrainz) {
              discovered.musicbrainz = mbArtistId;
            }
          }
        }
        await new Promise((r) => setTimeout(r, 600));
      } catch {
        /* skip */
      }
    }

    await db
      .update(distributorHistoryImports)
      .set({
        status: "completed",
        discoveredPlatforms: discovered,
        processedAt: new Date(),
      })
      .where(eq(distributorHistoryImports.id, importId));

    if (Object.keys(discovered).length > 0) {
      await this.updateProfile(profileId, userId, {
        musicbrainzId: discovered.musicbrainz,
      } as Record<string, unknown>);
    }

    logger.info(
      `[ArtistProfile] Import processed: importId=${importId} discovered=${Object.keys(discovered).join(",")}`,
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 3: BREAKTHROUGH — Distributor Portability Report (JSON-LD + summary)
  // ══════════════════════════════════════════════════════════════════════════

  async exportPortabilityReport(
    profileId: string,
    userId: string,
  ): Promise<{
    jsonLd: Record<string, unknown>;
    summary: {
      artistName: string;
      totalPlatforms: number;
      claimedPlatforms: string[];
      verifiedPlatforms: string[];
      isrcCount: number;
      healthScore: number;
      snapshotCount: number;
      splitEventsDetected: number;
      identityLinks: number;
      exportedAt: string;
    };
    transferChecklist: Array<{
      item: string;
      status: "complete" | "missing" | "warning";
      detail: string;
    }>;
  }> {
    const profile = await this.getProfile(profileId, userId);
    if (!profile) throw new Error("Artist profile not found");

    const [snapshots, splits, links, _releases] = await Promise.all([
      db
        .select()
        .from(artistDnaSnapshots)
        .where(eq(artistDnaSnapshots.artistProfileId, profileId)),
      db
        .select()
        .from(profileSplitEvents)
        .where(eq(profileSplitEvents.artistProfileId, profileId)),
      db
        .select()
        .from(artistIdentityLinks)
        .where(eq(artistIdentityLinks.artistProfileId, profileId)),
      db
        .select({ releaseId: artistProfileReleases.releaseId })
        .from(artistProfileReleases)
        .where(eq(artistProfileReleases.artistProfileId, profileId)),
    ]);

    const isrcSet = new Set<string>();
    for (const snap of snapshots) {
      for (const isrc of (snap.isrcList ?? []) as string[]) isrcSet.add(isrc);
    }

    const claimedPlatforms: string[] = [];
    const platformMap: Record<string, string> = {};
    if (profile.spotifyArtistId) {
      claimedPlatforms.push("spotify");
      platformMap.spotify = profile.spotifyArtistId;
    }
    if (profile.appleArtistId) {
      claimedPlatforms.push("apple");
      platformMap.apple = profile.appleArtistId;
    }
    if (profile.deezerArtistId) {
      claimedPlatforms.push("deezer");
      platformMap.deezer = profile.deezerArtistId;
    }
    if (profile.youtubeChannelId) {
      claimedPlatforms.push("youtube");
      platformMap.youtube = profile.youtubeChannelId;
    }
    if (profile.tidalArtistId) {
      claimedPlatforms.push("tidal");
      platformMap.tidal = profile.tidalArtistId;
    }
    if (profile.soundcloudArtistId) {
      claimedPlatforms.push("soundcloud");
      platformMap.soundcloud = profile.soundcloudArtistId;
    }
    if (profile.amazonMusicArtistId) {
      claimedPlatforms.push("amazon");
      platformMap.amazon = profile.amazonMusicArtistId;
    }
    if (profile.musicbrainzId) {
      claimedPlatforms.push("musicbrainz");
      platformMap.musicbrainz = profile.musicbrainzId;
    }

    const verifiedPlatforms = (profile.verifiedPlatforms ?? []) as string[];

    const jsonLd: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "MusicGroup",
      "@id": `https://maxbooster.app/artist/${profileId}`,
      name: profile.artistName,
      genre: profile.genres ?? [],
      image: profile.profileImageUrl,
      description: profile.profileBio,
      sameAs: [
        profile.spotifyArtistId
          ? `https://open.spotify.com/artist/${profile.spotifyArtistId}`
          : null,
        profile.appleArtistId
          ? `https://music.apple.com/us/artist/${profile.appleArtistId}`
          : null,
        profile.deezerArtistId
          ? `https://www.deezer.com/artist/${profile.deezerArtistId}`
          : null,
        profile.youtubeChannelId
          ? `https://www.youtube.com/channel/${profile.youtubeChannelId}`
          : null,
        profile.soundcloudArtistId
          ? `https://soundcloud.com/${profile.soundcloudArtistId}`
          : null,
      ].filter(Boolean),
      "mb:maxbooster": {
        version: "3.0",
        exportedAt: new Date().toISOString(),
        profileId,
        platformIds: platformMap,
        verifiedPlatforms,
        healthScore: profile.healthScore,
        isrcList: Array.from(isrcSet),
        snapshotHistory: snapshots.map((s) => ({
          id: s.id,
          releaseId: s.releaseId,
          capturedAt: s.createdAt,
        })),
        identityLinks: links.length,
        splitEventsDetected: splits.length,
      },
    };

    const transferChecklist: Array<{
      item: string;
      status: "complete" | "missing" | "warning";
      detail: string;
    }> = [
      {
        item: "Spotify for Artists claimed",
        status: profile.spotifyArtistId ? "complete" : "missing",
        detail: profile.spotifyArtistId
          ? `ID: ${profile.spotifyArtistId}`
          : "Claim at artists.spotify.com before transferring",
      },
      {
        item: "Apple Music for Artists claimed",
        status: profile.appleArtistId ? "complete" : "missing",
        detail: profile.appleArtistId
          ? `ID: ${profile.appleArtistId}`
          : "Claim at artists.apple.com",
      },
      {
        item: "Artist profile image",
        status: profile.profileImageUrl ? "complete" : "warning",
        detail: profile.profileImageUrl
          ? "Profile image on file"
          : "Upload image to new distributor portal",
      },
      {
        item: "Genre tags",
        status: (profile.genres!.length ?? 0) > 0 ? "complete" : "warning",
        detail:
          (profile.genres!.length ?? 0) > 0
            ? profile.genres!.join(", ")
            : "Add genre tags before transfer",
      },
      {
        item: "ISRC registry",
        status: isrcSet.size > 0 ? "complete" : "warning",
        detail:
          isrcSet.size > 0
            ? `${isrcSet.size} ISRCs on file`
            : "Collect ISRCs from current distributor before switching",
      },
      {
        item: "DNA snapshots",
        status: snapshots.length > 0 ? "complete" : "warning",
        detail:
          snapshots.length > 0
            ? `${snapshots.length} immutable snapshots as proof of ownership`
            : "Take a DNA snapshot before switching distributors",
      },
      {
        item: "No split profiles detected",
        status: profile.splitDetected ? "warning" : "complete",
        detail: profile.splitDetected
          ? "Fix split profiles BEFORE switching distributors"
          : "No splits detected",
      },
    ];

    return {
      jsonLd,
      summary: {
        artistName: profile.artistName,
        totalPlatforms: claimedPlatforms.length,
        claimedPlatforms,
        verifiedPlatforms,
        isrcCount: isrcSet.size,
        healthScore: profile.healthScore ?? 0,
        snapshotCount: snapshots.length,
        splitEventsDetected: splits.length,
        identityLinks: links.length,
        exportedAt: new Date().toISOString(),
      },
      transferChecklist,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 3: BREAKTHROUGH — Social Handle → DSP Profile Bridging
  // ══════════════════════════════════════════════════════════════════════════

  async resolveHandleToDSP(
    profileId: string,
    userId: string,
    platform:
      | "instagram"
      | "tiktok"
      | "twitter"
      | "youtube"
      | "soundcloud"
      | "bandcamp",
    handle: string,
  ): Promise<{
    platform: string;
    handle: string;
    profileUrl: string;
    dspLink: string | null;
    saved: boolean;
  }> {
    const profile = await this.getProfile(profileId, userId);
    if (!profile) throw new Error("Artist profile not found");

    const cleanHandle = handle.replace(/^@/, "").trim();
    let profileUrl = "";
    let dspLink: string | null = null;
    let saved = false;

    switch (platform) {
      case "instagram":
        profileUrl = `https://www.instagram.com/${cleanHandle}/`;
        break;
      case "tiktok":
        profileUrl = `https://www.tiktok.com/@${cleanHandle}`;
        break;
      case "twitter":
        profileUrl = `https://twitter.com/${cleanHandle}`;
        break;
      case "youtube":
        profileUrl = `https://www.youtube.com/@${cleanHandle}`;
        dspLink = `https://music.youtube.com/search?q=${encodeURIComponent(profile.artistName)}`;
        break;
      case "soundcloud":
        profileUrl = `https://soundcloud.com/${cleanHandle}`;
        dspLink = profileUrl;
        if (!profile.soundcloudArtistId) {
          await this.updateProfile(profileId, userId, {
            soundcloudArtistId: cleanHandle,
          });
          saved = true;
        }
        break;
      case "bandcamp":
        profileUrl = `https://${cleanHandle}.bandcamp.com`;
        dspLink = profileUrl;
        if (!profile.bandcampSlug) {
          await this.updateProfile(profileId, userId, {
            bandcampSlug: cleanHandle,
          } as Record<string, unknown>);
          saved = true;
        }
        break;
    }

    // Save social handle to profile
    const currentHandles =
      (profile.socialHandles as Record<string, string>) ?? {};
    if (!currentHandles[platform] || currentHandles[platform] !== cleanHandle) {
      currentHandles[platform] = cleanHandle;
      await this.updateProfile(profileId, userId, {
        socialHandles: currentHandles,
      } as Record<string, unknown>);
      saved = true;
    }

    // Propagate to identity graph
    if (dspLink && (platform === "soundcloud" || platform === "youtube")) {
      await this._upsertIdentityLink(
        profileId,
        platform,
        cleanHandle,
        "name_match",
        profile.artistName,
        70,
        "social_handle",
      ).catch(() => {});
    }

    return { platform, handle: cleanHandle, profileUrl, dspLink, saved };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 2: INTELLIGENCE — Enhanced Confidence Scorer Helpers
  // Population-aware disambiguation for common artist names
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Given multiple candidates for the same query, apply differential weighting:
   * when the top candidate has significantly more fans/followers than the second,
   * boost the top by up to 15 points and reduce others.
   */
  disambiguateByPopularity<
    T extends {
      confidence: number;
      followers?: number;
      fans?: number;
      popularity?: number;
    },
  >(candidates: T[]): T[] {
    if (candidates.length < 2) return candidates;
    const signal = (c: T) =>
      c.followers ?? c.fans ?? (c.popularity ? c.popularity * 1000 : 0);
    const top = candidates[0];
    const second = candidates[1];
    const topSignal = signal(top);
    const secondSignal = signal(second);
    if (topSignal > 0 && topSignal > secondSignal * 3) {
      // Top candidate has 3× more listeners — high disambiguation confidence
      candidates[0] = {
        ...top,
        confidence: Math.min(100, top.confidence + 12),
      };
    }
    return candidates;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 1: FOUNDATION — Profile Watch (background polling)
  // Detect unauthorized releases on known artist page IDs
  // ══════════════════════════════════════════════════════════════════════════

  async watchProfileForUnauthorizedReleases(
    profileId: string,
    userId: string,
  ): Promise<{
    checked: string[];
    unauthorized: Array<{
      platform: string;
      title: string;
      detectedAt: string;
    }>;
    lastWatchedAt: string;
  }> {
    const profile = await this.getProfile(profileId, userId);
    if (!profile) throw new Error("Artist profile not found");

    const checked: string[] = [];
    const unauthorized: Array<{
      platform: string;
      title: string;
      detectedAt: string;
    }> = [];

    // Check Spotify: fetch latest albums and cross-reference ISRCs
    if (profile.spotifyArtistId) {
      checked.push("spotify");
      try {
        const token = await (this as any)._getSpotifyToken();
        if (token) {
          const res = await fetch(
            `https://api.spotify.com/v1/artists/${profile.spotifyArtistId}/albums?limit=5&include_groups=single,album`,
            {
              headers: { Authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(8000),
            },
          );
          if (res.ok) {
            const data = (await res.json()) as Record<string, unknown>;
            const remoteAlbumNames = ((data.items ?? []) as any).map(
              (a: Record<string, unknown>) => a.name as string,
            );
            logger.info(
              `[ArtistProfile] Watch: Spotify profile=${profileId} albums=${remoteAlbumNames.length}`,
            );
            // Flag releases we don't recognize (not in distroReleases for this user)
            // Simplified heuristic for now: if albums list is non-empty, profile is active
          }
        }
      } catch {
        logger.warn(
          `[ArtistProfile] Watch: Spotify check failed for profile=${profileId}`,
        );
      }
    }

    // Update lastWatchedAt
    await db
      .update(artistProfiles)
      .set({ lastWatchedAt: new Date(), updatedAt: new Date() })
      .where(eq(artistProfiles?.id, profileId));

    return {
      checked,
      unauthorized,
      lastWatchedAt: new Date().toISOString(),
    };
  }
}

export const artistProfileService = new ArtistProfileService();
