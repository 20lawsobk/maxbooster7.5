import { db } from "../db";
import { dspProviders } from "@shared/schema";
import { sql, count } from "drizzle-orm";
import { logger } from "../logger.js";

export const DISTRIBUTION_PLATFORMS = [
  // =====================================================
  // 1. MAJOR GLOBAL STREAMING & DOWNLOAD
  // =====================================================
  {
    name: "Spotify",
    slug: "spotify",
    isActive: true,
    metadata: {
      apiBase: "https://api.spotify.com/v1",
      authType: "OAuth2",
      deliveryMethod: "api",
      processingTime: "1-5 days",
      region: "global",
      category: "streaming",
      isPreferred: true,
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
  {
    name: "Apple Music",
    slug: "apple-music",
    isActive: true,
    metadata: {
      apiBase: "https://api.music.apple.com/v1",
      authType: "JWT",
      deliveryMethod: "api",
      processingTime: "1-3 days",
      region: "global",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
  {
    name: "iTunes",
    slug: "itunes",
    isActive: true,
    metadata: {
      apiBase: "https://api.music.apple.com/v1",
      authType: "JWT",
      deliveryMethod: "api",
      processingTime: "1-3 days",
      region: "global",
      category: "store",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
  {
    name: "Amazon Music",
    slug: "amazon-music",
    isActive: true,
    metadata: {
      apiBase: "https://api.amazonmusic.com/v1",
      authType: "AWS_SigV4",
      deliveryMethod: "api",
      processingTime: "3-7 days",
      region: "global",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
  {
    name: "Tidal",
    slug: "tidal",
    isActive: true,
    metadata: {
      apiBase: "https://api.tidal.com/v1",
      authType: "OAuth2",
      deliveryMethod: "api",
      processingTime: "5-10 days",
      region: "global",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC", "MQA"],
      },
    },
  },
  {
    name: "Deezer",
    slug: "deezer",
    isActive: true,
    metadata: {
      apiBase: "https://api.deezer.com",
      authType: "OAuth2",
      deliveryMethod: "api",
      processingTime: "3-7 days",
      region: "global",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
  {
    name: "YouTube Music",
    slug: "youtube-music",
    isActive: true,
    metadata: {
      apiBase: "https://www.googleapis.com/youtube/v3",
      authType: "OAuth2",
      deliveryMethod: "api",
      processingTime: "1-2 days",
      region: "global",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: false,
        metadata: ["title", "artist"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },
  {
    name: "Pandora",
    slug: "pandora",
    isActive: true,
    metadata: {
      apiBase: "https://api.pandora.com/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "north_america",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: false,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },
  {
    name: "iHeartRadio",
    slug: "iheartradio",
    isActive: true,
    metadata: {
      apiBase: "https://api.iheart.com/v1",
      authType: "API_Key",
      deliveryMethod: "ftp",
      processingTime: "7-14 days",
      region: "north_america",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: false,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },
  {
    name: "Napster",
    slug: "napster",
    isActive: true,
    metadata: {
      apiBase: "https://api.napster.com/v2.2",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "5-10 days",
      region: "global",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },

  // =====================================================
  // 2. SPECIALIZED ELECTRONIC & INDIE STORES
  // =====================================================
  {
    name: "Beatport",
    slug: "beatport",
    isActive: true,
    metadata: {
      apiBase: "https://api.beatport.com/v4",
      authType: "OAuth2",
      deliveryMethod: "api",
      processingTime: "5-10 days",
      region: "global",
      category: "electronic",
      isPreferred: true,
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album", "bpm", "key"],
        audioFormats: ["WAV", "AIFF"],
      },
    },
  },
  {
    name: "Juno Download",
    slug: "juno-download",
    isActive: true,
    metadata: {
      apiBase: "https://api.junodownload.com/v1",
      authType: "API_Key",
      deliveryMethod: "ftp",
      processingTime: "7-14 days",
      region: "global",
      category: "electronic",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album", "bpm", "key"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
  {
    name: "Bandcamp",
    slug: "bandcamp",
    isActive: true,
    metadata: {
      apiBase: "https://bandcamp.com/api",
      authType: "OAuth2",
      deliveryMethod: "direct_upload",
      processingTime: "1-3 days",
      region: "global",
      category: "indie",
      requirements: {
        isrc: false,
        upc: false,
        metadata: ["title", "artist"],
        audioFormats: ["WAV", "FLAC", "MP3"],
      },
    },
  },
  {
    name: "SoundCloud",
    slug: "soundcloud",
    isActive: true,
    metadata: {
      apiBase: "https://api.soundcloud.com",
      authType: "OAuth2",
      deliveryMethod: "api",
      processingTime: "1-3 days",
      region: "global",
      category: "streaming",
      requirements: {
        isrc: false,
        upc: false,
        metadata: ["title", "artist"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },
  {
    name: "Audiomack",
    slug: "audiomack",
    isActive: true,
    metadata: {
      apiBase: "https://api.audiomack.com/v1",
      authType: "OAuth2",
      deliveryMethod: "api",
      processingTime: "3-7 days",
      region: "global",
      category: "streaming",
      requirements: {
        isrc: false,
        upc: false,
        metadata: ["title", "artist"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },
  {
    name: "Traxsource",
    slug: "traxsource",
    isActive: true,
    metadata: {
      apiBase: "https://api.traxsource.com/v1",
      authType: "API_Key",
      deliveryMethod: "ftp",
      processingTime: "7-14 days",
      region: "global",
      category: "electronic",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album", "bpm", "key"],
        audioFormats: ["WAV", "AIFF"],
      },
    },
  },

  // =====================================================
  // 3. REGIONAL & EMERGING MARKETS
  // =====================================================
  // China
  {
    name: "NetEase Cloud Music",
    slug: "netease-cloud-music",
    isActive: true,
    metadata: {
      apiBase: "https://api.music.163.com/api",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "china",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
  {
    name: "QQ Music",
    slug: "qq-music",
    isActive: true,
    metadata: {
      apiBase: "https://api.qq.com/music/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "china",
      category: "streaming",
      parent: "tencent",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
  {
    name: "Kugou",
    slug: "kugou",
    isActive: true,
    metadata: {
      apiBase: "https://api.kugou.com/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "china",
      category: "streaming",
      parent: "tencent",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
  {
    name: "Kuwo",
    slug: "kuwo",
    isActive: true,
    metadata: {
      apiBase: "https://api.kuwo.cn/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "china",
      category: "streaming",
      parent: "tencent",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
  {
    name: "Kuaishou",
    slug: "kuaishou",
    isActive: true,
    metadata: {
      apiBase: "https://open.kuaishou.com/music/v1",
      authType: "OAuth2",
      deliveryMethod: "api",
      processingTime: "5-10 days",
      region: "china",
      category: "social",
      requirements: {
        isrc: false,
        upc: false,
        metadata: ["title", "artist"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },

  // India
  {
    name: "JioSaavn",
    slug: "jiosaavn",
    isActive: true,
    metadata: {
      apiBase: "https://api.jiosaavn.com/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "5-10 days",
      region: "india",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: false,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },
  {
    name: "Gaana",
    slug: "gaana",
    isActive: true,
    metadata: {
      apiBase: "https://api.gaana.com/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "india",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: false,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },

  // Middle East & Africa
  {
    name: "Anghami",
    slug: "anghami",
    isActive: true,
    metadata: {
      apiBase: "https://api.anghami.com/v1",
      authType: "OAuth2",
      deliveryMethod: "api",
      processingTime: "5-10 days",
      region: "middle_east",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
  {
    name: "Boomplay",
    slug: "boomplay",
    isActive: true,
    metadata: {
      apiBase: "https://api.boomplay.com/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "africa",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: false,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },

  // Asia Pacific
  {
    name: "JOOX",
    slug: "joox",
    isActive: true,
    metadata: {
      apiBase: "https://api.joox.com/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "asia",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: false,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },
  {
    name: "KKBOX",
    slug: "kkbox",
    isActive: true,
    metadata: {
      apiBase: "https://api.kkbox.com/v1.1",
      authType: "OAuth2",
      deliveryMethod: "api",
      processingTime: "5-10 days",
      region: "taiwan",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
  {
    name: "AWA",
    slug: "awa",
    isActive: true,
    metadata: {
      apiBase: "https://api.awa.fm/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "japan",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
  {
    name: "FLO",
    slug: "flo",
    isActive: true,
    metadata: {
      apiBase: "https://api.music-flo.com/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "korea",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
  {
    name: "Melon",
    slug: "melon",
    isActive: true,
    metadata: {
      apiBase: "https://api.melon.com/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "korea",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },

  // Russia
  {
    name: "Yandex Music",
    slug: "yandex-music",
    isActive: true,
    metadata: {
      apiBase: "https://api.music.yandex.net/v1",
      authType: "OAuth2",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "russia",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
  {
    name: "VK Music",
    slug: "vk-music",
    isActive: true,
    metadata: {
      apiBase: "https://api.vk.com/method",
      authType: "OAuth2",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "russia",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: false,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },

  // Latin America
  {
    name: "Claro Música",
    slug: "claro-musica",
    isActive: true,
    metadata: {
      apiBase: "https://api.claromusica.com/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "10-14 days",
      region: "latin_america",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: false,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },
  {
    name: "Trebel",
    slug: "trebel",
    isActive: true,
    metadata: {
      apiBase: "https://api.trebelmusic.com/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "latin_america",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: false,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },

  // =====================================================
  // 4. SOCIAL MEDIA & CONTENT IDENTIFICATION
  // =====================================================
  {
    name: "TikTok",
    slug: "tiktok",
    isActive: true,
    metadata: {
      apiBase: "https://open-api.tiktok.com",
      authType: "OAuth2",
      deliveryMethod: "api",
      processingTime: "1-3 days",
      region: "global",
      category: "social",
      requirements: {
        isrc: false,
        upc: false,
        metadata: ["title", "artist"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },
  {
    name: "Meta Library",
    slug: "meta-library",
    isActive: true,
    metadata: {
      apiBase: "https://graph.facebook.com/v18.0",
      authType: "OAuth2",
      deliveryMethod: "api",
      processingTime: "3-7 days",
      region: "global",
      category: "social",
      platforms: ["facebook", "instagram"],
      requirements: {
        isrc: false,
        upc: false,
        metadata: ["title", "artist"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },
  {
    name: "Instagram",
    slug: "instagram",
    isActive: true,
    metadata: {
      apiBase: "https://graph.facebook.com/v18.0",
      authType: "OAuth2",
      deliveryMethod: "api",
      processingTime: "3-7 days",
      region: "global",
      category: "social",
      requirements: {
        isrc: false,
        upc: false,
        metadata: ["title", "artist"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },
  {
    name: "Facebook",
    slug: "facebook",
    isActive: true,
    metadata: {
      apiBase: "https://graph.facebook.com/v18.0",
      authType: "OAuth2",
      deliveryMethod: "api",
      processingTime: "3-7 days",
      region: "global",
      category: "social",
      requirements: {
        isrc: false,
        upc: false,
        metadata: ["title", "artist"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },
  {
    name: "Snapchat",
    slug: "snapchat",
    isActive: true,
    metadata: {
      apiBase: "https://adsapi.snapchat.com/v1",
      authType: "OAuth2",
      deliveryMethod: "api",
      processingTime: "5-10 days",
      region: "global",
      category: "social",
      requirements: {
        isrc: false,
        upc: false,
        metadata: ["title", "artist"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },
  {
    name: "YouTube Content ID",
    slug: "youtube-content-id",
    isActive: true,
    metadata: {
      apiBase: "https://www.googleapis.com/youtube/partner/v1",
      authType: "OAuth2",
      deliveryMethod: "api",
      processingTime: "1-3 days",
      region: "global",
      category: "monetization",
      requirements: {
        isrc: true,
        upc: false,
        metadata: ["title", "artist"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },
  {
    name: "Twitch",
    slug: "twitch",
    isActive: true,
    metadata: {
      apiBase: "https://api.twitch.tv/helix",
      authType: "OAuth2",
      deliveryMethod: "api",
      processingTime: "5-10 days",
      region: "global",
      category: "social",
      requirements: {
        isrc: false,
        upc: false,
        metadata: ["title", "artist"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },
  {
    name: "SoundExchange",
    slug: "soundexchange",
    isActive: true,
    metadata: {
      apiBase: "https://api.soundexchange.com/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "14-30 days",
      region: "north_america",
      category: "royalty_collection",
      requirements: {
        isrc: true,
        upc: false,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV"],
      },
    },
  },

  // =====================================================
  // 5. NICHE & LIFESTYLE PLATFORMS
  // =====================================================
  {
    name: "Peloton",
    slug: "peloton",
    isActive: true,
    metadata: {
      apiBase: "https://api.onepeloton.com/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "14-30 days",
      region: "global",
      category: "fitness",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "bpm"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
  {
    name: "Soundtrack Your Brand",
    slug: "soundtrack-your-brand",
    isActive: true,
    metadata: {
      apiBase: "https://api.soundtrackyourbrand.com/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "global",
      category: "b2b",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "mood", "genre"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
  {
    name: "Pretzel Rocks",
    slug: "pretzel-rocks",
    isActive: true,
    metadata: {
      apiBase: "https://api.pretzel.rocks/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "5-10 days",
      region: "global",
      category: "streaming_safe",
      requirements: {
        isrc: false,
        upc: false,
        metadata: ["title", "artist"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },
  {
    name: "Roblox",
    slug: "roblox",
    isActive: true,
    metadata: {
      apiBase: "https://apis.roblox.com/assets/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "global",
      category: "gaming",
      requirements: {
        isrc: false,
        upc: false,
        metadata: ["title", "artist"],
        audioFormats: ["OGG", "MP3"],
      },
    },
  },

  // =====================================================
  // 6. ADDITIONAL STORES & SERVICES
  // =====================================================
  {
    name: "Amazon MP3",
    slug: "amazon-mp3",
    isActive: true,
    metadata: {
      apiBase: "https://api.amazonmusic.com/mp3/v1",
      authType: "AWS_SigV4",
      deliveryMethod: "api",
      processingTime: "3-7 days",
      region: "global",
      category: "store",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },
  {
    name: "7digital",
    slug: "7digital",
    isActive: true,
    metadata: {
      apiBase: "https://api.7digital.com/1.2",
      authType: "OAuth1",
      deliveryMethod: "api",
      processingTime: "5-10 days",
      region: "global",
      category: "store",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
  {
    name: "Qobuz",
    slug: "qobuz",
    isActive: true,
    metadata: {
      apiBase: "https://api.qobuz.com/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "europe",
      category: "store",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
  {
    name: "MediaNet",
    slug: "medianet",
    isActive: true,
    metadata: {
      apiBase: "https://api.mndigital.com/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "10-14 days",
      region: "global",
      category: "store",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
  {
    name: "Gracenote",
    slug: "gracenote",
    isActive: true,
    metadata: {
      apiBase: "https://api.gracenote.com/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "3-7 days",
      region: "global",
      category: "metadata",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
  {
    name: "Shazam",
    slug: "shazam",
    isActive: true,
    metadata: {
      apiBase: "https://api.shazam.com/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "5-10 days",
      region: "global",
      category: "discovery",
      requirements: {
        isrc: true,
        upc: false,
        metadata: ["title", "artist"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },
  {
    name: "Tencent Music",
    slug: "tencent-music",
    isActive: true,
    metadata: {
      apiBase: "https://api.tencentmusic.com/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "china",
      category: "streaming",
      parent: "tencent",
      subsidiaries: ["qq-music", "kugou", "kuwo"],
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },

  // =====================================================
  // 7. ADDITIONAL DISTROKID PLATFORMS
  // =====================================================

  // TikTok Ecosystem
  {
    name: "Luna",
    slug: "luna",
    isActive: true,
    metadata: {
      apiBase: "https://open-api.tiktok.com/luna",
      authType: "OAuth2",
      deliveryMethod: "api",
      processingTime: "1-3 days",
      region: "global",
      category: "social",
      parent: "tiktok",
      requirements: {
        isrc: false,
        upc: false,
        metadata: ["title", "artist"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },
  {
    name: "CapCut",
    slug: "capcut",
    isActive: true,
    metadata: {
      apiBase: "https://open-api.capcut.com/v1",
      authType: "OAuth2",
      deliveryMethod: "api",
      processingTime: "1-3 days",
      region: "global",
      category: "social",
      parent: "tiktok",
      requirements: {
        isrc: false,
        upc: false,
        metadata: ["title", "artist"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },

  // Additional Tencent/China Platforms
  {
    name: "WeSing",
    slug: "wesing",
    isActive: true,
    metadata: {
      apiBase: "https://api.wesing.qq.com/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "china",
      category: "karaoke",
      parent: "tencent",
      requirements: {
        isrc: true,
        upc: false,
        metadata: ["title", "artist"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },
  {
    name: "Ultimate Music",
    slug: "ultimate-music",
    isActive: true,
    metadata: {
      apiBase: "https://api.ultimatemusic.qq.com/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "china",
      category: "streaming",
      parent: "tencent",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
  {
    name: "Bilibili",
    slug: "bilibili",
    isActive: true,
    metadata: {
      apiBase: "https://api.bilibili.com/audio",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "5-10 days",
      region: "china",
      category: "video",
      requirements: {
        isrc: false,
        upc: false,
        metadata: ["title", "artist"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },
  {
    name: "Tencent Video",
    slug: "tencent-video",
    isActive: true,
    metadata: {
      apiBase: "https://api.v.qq.com/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "china",
      category: "video",
      parent: "tencent",
      requirements: {
        isrc: true,
        upc: false,
        metadata: ["title", "artist"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },
  {
    name: "iQIYI",
    slug: "iqiyi",
    isActive: true,
    metadata: {
      apiBase: "https://open.iqiyi.com/v1",
      authType: "OAuth2",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "china",
      category: "video",
      requirements: {
        isrc: true,
        upc: false,
        metadata: ["title", "artist"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },

  // Apple Ecosystem
  {
    name: "Siri",
    slug: "siri",
    isActive: true,
    metadata: {
      apiBase: "https://api.music.apple.com/v1",
      authType: "JWT",
      deliveryMethod: "api",
      processingTime: "1-3 days",
      region: "global",
      category: "voice_assistant",
      parent: "apple",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },

  // Video Distribution
  {
    name: "Vevo",
    slug: "vevo",
    isActive: true,
    metadata: {
      apiBase: "https://api.vevo.com/v1",
      authType: "OAuth2",
      deliveryMethod: "api",
      processingTime: "5-10 days",
      region: "global",
      category: "video",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },

  // Latin America
  {
    name: "Kuack Media",
    slug: "kuack-media",
    isActive: true,
    metadata: {
      apiBase: "https://api.kuackmedia.com/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "latin_america",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },

  // Additional Korea Platforms
  {
    name: "Bugs",
    slug: "bugs",
    isActive: true,
    metadata: {
      apiBase: "https://api.bugs.co.kr/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "korea",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
  {
    name: "Genie",
    slug: "genie",
    isActive: true,
    metadata: {
      apiBase: "https://api.genie.co.kr/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "korea",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
  {
    name: "Vibe",
    slug: "vibe",
    isActive: true,
    metadata: {
      apiBase: "https://api.vibe.naver.com/v1",
      authType: "OAuth2",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "korea",
      category: "streaming",
      parent: "naver",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },

  // Additional Japan Platforms
  {
    name: "LINE Music",
    slug: "line-music",
    isActive: true,
    metadata: {
      apiBase: "https://api.music.line.me/v1",
      authType: "OAuth2",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "japan",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
  {
    name: "Rakuten Music",
    slug: "rakuten-music",
    isActive: true,
    metadata: {
      apiBase: "https://api.music.rakuten.co.jp/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "japan",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
  {
    name: "Mora",
    slug: "mora",
    isActive: true,
    metadata: {
      apiBase: "https://api.mora.jp/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "japan",
      category: "store",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
  {
    name: "Recochoku",
    slug: "recochoku",
    isActive: true,
    metadata: {
      apiBase: "https://api.recochoku.jp/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "japan",
      category: "store",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },

  // Additional European Platforms
  {
    name: "Nuuday",
    slug: "nuuday",
    isActive: true,
    metadata: {
      apiBase: "https://api.nuuday.dk/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "denmark",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
  {
    name: "Zvuk",
    slug: "zvuk",
    isActive: true,
    metadata: {
      apiBase: "https://api.zvuk.com/v1",
      authType: "OAuth2",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "russia",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },

  // Additional Global Platforms
  {
    name: "LiveXLive",
    slug: "livexlive",
    isActive: true,
    metadata: {
      apiBase: "https://api.livexlive.com/v1",
      authType: "OAuth2",
      deliveryMethod: "api",
      processingTime: "5-10 days",
      region: "global",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },
  {
    name: "Mixcloud",
    slug: "mixcloud",
    isActive: true,
    metadata: {
      apiBase: "https://api.mixcloud.com",
      authType: "OAuth2",
      deliveryMethod: "api",
      processingTime: "3-7 days",
      region: "global",
      category: "streaming",
      requirements: {
        isrc: false,
        upc: false,
        metadata: ["title", "artist"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },
  {
    name: "Resso",
    slug: "resso",
    isActive: true,
    metadata: {
      apiBase: "https://api.resso.com/v1",
      authType: "OAuth2",
      deliveryMethod: "api",
      processingTime: "5-10 days",
      region: "asia",
      category: "streaming",
      parent: "bytedance",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
  {
    name: "UMA",
    slug: "uma",
    isActive: true,
    metadata: {
      apiBase: "https://api.uma.fm/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "global",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
  {
    name: "TouchTunes",
    slug: "touchtunes",
    isActive: true,
    metadata: {
      apiBase: "https://api.touchtunes.com/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "10-14 days",
      region: "north_america",
      category: "jukebox",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },
  {
    name: "TIM Music",
    slug: "tim-music",
    isActive: true,
    metadata: {
      apiBase: "https://api.timmusic.it/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "italy",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },
  {
    name: "Saavn",
    slug: "saavn",
    isActive: true,
    metadata: {
      apiBase: "https://api.saavn.com/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "5-10 days",
      region: "india",
      category: "streaming",
      alias: "jiosaavn",
      requirements: {
        isrc: true,
        upc: false,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },
  {
    name: "Wynk",
    slug: "wynk",
    isActive: true,
    metadata: {
      apiBase: "https://api.wynk.in/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "india",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: false,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },
  {
    name: "Hungama",
    slug: "hungama",
    isActive: true,
    metadata: {
      apiBase: "https://api.hungama.com/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "india",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: false,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },

  // Additional African Platforms
  {
    name: "Mdundo",
    slug: "mdundo",
    isActive: true,
    metadata: {
      apiBase: "https://api.mdundo.com/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "africa",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: false,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },
  {
    name: "uduX",
    slug: "udux",
    isActive: true,
    metadata: {
      apiBase: "https://api.udux.com/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "africa",
      category: "streaming",
      requirements: {
        isrc: true,
        upc: false,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },

  // Voice Assistants
  {
    name: "Amazon Alexa",
    slug: "amazon-alexa",
    isActive: true,
    metadata: {
      apiBase: "https://api.amazonmusic.com/alexa/v1",
      authType: "AWS_SigV4",
      deliveryMethod: "api",
      processingTime: "3-7 days",
      region: "global",
      category: "voice_assistant",
      parent: "amazon",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
  {
    name: "Google Assistant",
    slug: "google-assistant",
    isActive: true,
    metadata: {
      apiBase: "https://www.googleapis.com/actions/v1",
      authType: "OAuth2",
      deliveryMethod: "api",
      processingTime: "1-3 days",
      region: "global",
      category: "voice_assistant",
      parent: "google",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },

  // Fitness & Lifestyle
  {
    name: "Apple Fitness+",
    slug: "apple-fitness-plus",
    isActive: true,
    metadata: {
      apiBase: "https://api.music.apple.com/fitness/v1",
      authType: "JWT",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "global",
      category: "fitness",
      parent: "apple",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "bpm"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
  {
    name: "Feed.fm",
    slug: "feed-fm",
    isActive: true,
    metadata: {
      apiBase: "https://api.feed.fm/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "global",
      category: "b2b",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "mood", "genre"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
  {
    name: "Epidemic Sound",
    slug: "epidemic-sound",
    isActive: true,
    metadata: {
      apiBase: "https://api.epidemicsound.com/v1",
      authType: "OAuth2",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "global",
      category: "sync",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "mood", "genre"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },

  // Gaming Platforms
  {
    name: "Fortnite",
    slug: "fortnite",
    isActive: true,
    metadata: {
      apiBase: "https://api.epicgames.com/fortnite/music/v1",
      authType: "OAuth2",
      deliveryMethod: "api",
      processingTime: "14-30 days",
      region: "global",
      category: "gaming",
      requirements: {
        isrc: false,
        upc: false,
        metadata: ["title", "artist"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },

  // Electronic & DJ Platforms
  {
    name: "DJ City",
    slug: "dj-city",
    isActive: true,
    metadata: {
      apiBase: "https://api.djcity.com/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "global",
      category: "dj_pool",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "bpm", "key"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },
  {
    name: "BPM Supreme",
    slug: "bpm-supreme",
    isActive: true,
    metadata: {
      apiBase: "https://api.bpmsupreme.com/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "global",
      category: "dj_pool",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "bpm", "key"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },
  {
    name: "Digital DJ Pool",
    slug: "digital-dj-pool",
    isActive: true,
    metadata: {
      apiBase: "https://api.digitaldjpool.com/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "global",
      category: "dj_pool",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "bpm", "key"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },

  // Additional MediaNet Outlets (aggregated)
  {
    name: "Dubset",
    slug: "dubset",
    isActive: true,
    metadata: {
      apiBase: "https://api.dubset.com/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "global",
      category: "remix_licensing",
      requirements: {
        isrc: true,
        upc: false,
        metadata: ["title", "artist"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },
  {
    name: "eMusic",
    slug: "emusic",
    isActive: true,
    metadata: {
      apiBase: "https://api.emusic.com/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "global",
      category: "store",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "MP3"],
      },
    },
  },
  {
    name: "HDtracks",
    slug: "hdtracks",
    isActive: true,
    metadata: {
      apiBase: "https://api.hdtracks.com/v1",
      authType: "API_Key",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "global",
      category: "store",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
  {
    name: "Primephonic",
    slug: "primephonic",
    isActive: true,
    metadata: {
      apiBase: "https://api.primephonic.com/v1",
      authType: "OAuth2",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "global",
      category: "classical",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "composer", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
  {
    name: "IDAGIO",
    slug: "idagio",
    isActive: true,
    metadata: {
      apiBase: "https://api.idagio.com/v1",
      authType: "OAuth2",
      deliveryMethod: "api",
      processingTime: "7-14 days",
      region: "global",
      category: "classical",
      requirements: {
        isrc: true,
        upc: true,
        metadata: ["title", "artist", "composer", "album"],
        audioFormats: ["WAV", "FLAC"],
      },
    },
  },
];

export async function seedDistributionPlatforms() {
  logger.info("🌱 Seeding distribution platforms...");

  try {
    const [{ total }] = await db?.select({ total: count() }).from(dspProviders);

    if (Number(total) >= DISTRIBUTION_PLATFORMS?.length) {
      logger.info(
        `✅ Distribution platform seeding complete! ${DISTRIBUTION_PLATFORMS?.length} platforms available.`,
      );
      return;
    }

    const values = DISTRIBUTION_PLATFORMS?.map((p) => ({
      name: p.name,
      slug: p.slug,
      isActive: p.isActive,
      metadata: p.metadata,
    }));

    await db
      .insert(dspProviders)
      .values(values)
      .onConflictDoUpdate({
        target: dspProviders.slug,
        set: {
          name: sql`excluded.name`,
          isActive: sql`excluded.is_active`,
          metadata: sql`excluded.metadata`,
        },
      });

    logger.info(
      `✅ Distribution platform seeding complete! ${DISTRIBUTION_PLATFORMS?.length} platforms available.`,
    );
  } catch (error: unknown) {
    logger.warn({ err: error }, "❌ Error seeding distribution platforms:");
    throw error;
  }
}
