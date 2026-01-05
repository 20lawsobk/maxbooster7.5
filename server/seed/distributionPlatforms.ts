import { db } from '../db';
import { dspProviders } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../logger.js';

export const DISTRIBUTION_PLATFORMS = [
  // =====================================================
  // 1. MAJOR GLOBAL STREAMING & DOWNLOAD
  // =====================================================
  {
    name: 'Spotify',
    slug: 'spotify',
    isActive: true,
    metadata: {
      apiBase: 'https://api.spotify.com/v1',
      authType: 'OAuth2',
      deliveryMethod: 'api',
      processingTime: '1-5 days',
      region: 'global',
      category: 'streaming',
      isPreferred: true,
      requirements: { isrc: true, upc: true, metadata: ['title', 'artist', 'album'], audioFormats: ['WAV', 'FLAC'] },
    },
  },
  {
    name: 'Apple Music',
    slug: 'apple-music',
    isActive: true,
    metadata: {
      apiBase: 'https://api.music.apple.com/v1',
      authType: 'JWT',
      deliveryMethod: 'api',
      processingTime: '1-3 days',
      region: 'global',
      category: 'streaming',
      requirements: { isrc: true, upc: true, metadata: ['title', 'artist', 'album'], audioFormats: ['WAV', 'FLAC'] },
    },
  },
  {
    name: 'iTunes',
    slug: 'itunes',
    isActive: true,
    metadata: {
      apiBase: 'https://api.music.apple.com/v1',
      authType: 'JWT',
      deliveryMethod: 'api',
      processingTime: '1-3 days',
      region: 'global',
      category: 'store',
      requirements: { isrc: true, upc: true, metadata: ['title', 'artist', 'album'], audioFormats: ['WAV', 'FLAC'] },
    },
  },
  {
    name: 'Amazon Music',
    slug: 'amazon-music',
    isActive: true,
    metadata: {
      apiBase: 'https://api.amazonmusic.com/v1',
      authType: 'AWS_SigV4',
      deliveryMethod: 'api',
      processingTime: '3-7 days',
      region: 'global',
      category: 'streaming',
      requirements: { isrc: true, upc: true, metadata: ['title', 'artist', 'album'], audioFormats: ['WAV', 'FLAC'] },
    },
  },
  {
    name: 'Tidal',
    slug: 'tidal',
    isActive: true,
    metadata: {
      apiBase: 'https://api.tidal.com/v1',
      authType: 'OAuth2',
      deliveryMethod: 'api',
      processingTime: '5-10 days',
      region: 'global',
      category: 'streaming',
      requirements: { isrc: true, upc: true, metadata: ['title', 'artist', 'album'], audioFormats: ['WAV', 'FLAC', 'MQA'] },
    },
  },
  {
    name: 'Deezer',
    slug: 'deezer',
    isActive: true,
    metadata: {
      apiBase: 'https://api.deezer.com',
      authType: 'OAuth2',
      deliveryMethod: 'api',
      processingTime: '3-7 days',
      region: 'global',
      category: 'streaming',
      requirements: { isrc: true, upc: true, metadata: ['title', 'artist', 'album'], audioFormats: ['WAV', 'FLAC'] },
    },
  },
  {
    name: 'YouTube Music',
    slug: 'youtube-music',
    isActive: true,
    metadata: {
      apiBase: 'https://www.googleapis.com/youtube/v3',
      authType: 'OAuth2',
      deliveryMethod: 'api',
      processingTime: '1-2 days',
      region: 'global',
      category: 'streaming',
      requirements: { isrc: true, upc: false, metadata: ['title', 'artist'], audioFormats: ['WAV', 'MP3'] },
    },
  },
  {
    name: 'Pandora',
    slug: 'pandora',
    isActive: true,
    metadata: {
      apiBase: 'https://api.pandora.com/v1',
      authType: 'API_Key',
      deliveryMethod: 'api',
      processingTime: '7-14 days',
      region: 'north_america',
      category: 'streaming',
      requirements: { isrc: true, upc: false, metadata: ['title', 'artist', 'album'], audioFormats: ['WAV', 'MP3'] },
    },
  },
  {
    name: 'iHeartRadio',
    slug: 'iheartradio',
    isActive: true,
    metadata: {
      apiBase: 'https://api.iheart.com/v1',
      authType: 'API_Key',
      deliveryMethod: 'ftp',
      processingTime: '7-14 days',
      region: 'north_america',
      category: 'streaming',
      requirements: { isrc: true, upc: false, metadata: ['title', 'artist', 'album'], audioFormats: ['WAV', 'MP3'] },
    },
  },
  {
    name: 'Napster',
    slug: 'napster',
    isActive: true,
    metadata: {
      apiBase: 'https://api.napster.com/v2.2',
      authType: 'API_Key',
      deliveryMethod: 'api',
      processingTime: '5-10 days',
      region: 'global',
      category: 'streaming',
      requirements: { isrc: true, upc: true, metadata: ['title', 'artist', 'album'], audioFormats: ['WAV', 'FLAC'] },
    },
  },

  // =====================================================
  // 2. SPECIALIZED ELECTRONIC & INDIE STORES
  // =====================================================
  {
    name: 'Beatport',
    slug: 'beatport',
    isActive: true,
    metadata: {
      apiBase: 'https://api.beatport.com/v4',
      authType: 'OAuth2',
      deliveryMethod: 'api',
      processingTime: '5-10 days',
      region: 'global',
      category: 'electronic',
      isPreferred: true,
      requirements: { isrc: true, upc: true, metadata: ['title', 'artist', 'album', 'bpm', 'key'], audioFormats: ['WAV', 'AIFF'] },
    },
  },
  {
    name: 'Juno Download',
    slug: 'juno-download',
    isActive: true,
    metadata: {
      apiBase: 'https://api.junodownload.com/v1',
      authType: 'API_Key',
      deliveryMethod: 'ftp',
      processingTime: '7-14 days',
      region: 'global',
      category: 'electronic',
      requirements: { isrc: true, upc: true, metadata: ['title', 'artist', 'album', 'bpm', 'key'], audioFormats: ['WAV', 'FLAC'] },
    },
  },
  {
    name: 'Bandcamp',
    slug: 'bandcamp',
    isActive: true,
    metadata: {
      apiBase: 'https://bandcamp.com/api',
      authType: 'OAuth2',
      deliveryMethod: 'direct_upload',
      processingTime: '1-3 days',
      region: 'global',
      category: 'indie',
      requirements: { isrc: false, upc: false, metadata: ['title', 'artist'], audioFormats: ['WAV', 'FLAC', 'MP3'] },
    },
  },
  {
    name: 'SoundCloud',
    slug: 'soundcloud',
    isActive: true,
    metadata: {
      apiBase: 'https://api.soundcloud.com',
      authType: 'OAuth2',
      deliveryMethod: 'api',
      processingTime: '1-3 days',
      region: 'global',
      category: 'streaming',
      requirements: { isrc: false, upc: false, metadata: ['title', 'artist'], audioFormats: ['WAV', 'MP3'] },
    },
  },
  {
    name: 'Audiomack',
    slug: 'audiomack',
    isActive: true,
    metadata: {
      apiBase: 'https://api.audiomack.com/v1',
      authType: 'OAuth2',
      deliveryMethod: 'api',
      processingTime: '3-7 days',
      region: 'global',
      category: 'streaming',
      requirements: { isrc: false, upc: false, metadata: ['title', 'artist'], audioFormats: ['WAV', 'MP3'] },
    },
  },
  {
    name: 'Traxsource',
    slug: 'traxsource',
    isActive: true,
    metadata: {
      apiBase: 'https://api.traxsource.com/v1',
      authType: 'API_Key',
      deliveryMethod: 'ftp',
      processingTime: '7-14 days',
      region: 'global',
      category: 'electronic',
      requirements: { isrc: true, upc: true, metadata: ['title', 'artist', 'album', 'bpm', 'key'], audioFormats: ['WAV', 'AIFF'] },
    },
  },

  // =====================================================
  // 3. REGIONAL & EMERGING MARKETS
  // =====================================================
  // China
  {
    name: 'NetEase Cloud Music',
    slug: 'netease-cloud-music',
    isActive: true,
    metadata: {
      apiBase: 'https://api.music.163.com/api',
      authType: 'API_Key',
      deliveryMethod: 'api',
      processingTime: '7-14 days',
      region: 'china',
      category: 'streaming',
      requirements: { isrc: true, upc: true, metadata: ['title', 'artist', 'album'], audioFormats: ['WAV', 'FLAC'] },
    },
  },
  {
    name: 'QQ Music',
    slug: 'qq-music',
    isActive: true,
    metadata: {
      apiBase: 'https://api.qq.com/music/v1',
      authType: 'API_Key',
      deliveryMethod: 'api',
      processingTime: '7-14 days',
      region: 'china',
      category: 'streaming',
      parent: 'tencent',
      requirements: { isrc: true, upc: true, metadata: ['title', 'artist', 'album'], audioFormats: ['WAV', 'FLAC'] },
    },
  },
  {
    name: 'Kugou',
    slug: 'kugou',
    isActive: true,
    metadata: {
      apiBase: 'https://api.kugou.com/v1',
      authType: 'API_Key',
      deliveryMethod: 'api',
      processingTime: '7-14 days',
      region: 'china',
      category: 'streaming',
      parent: 'tencent',
      requirements: { isrc: true, upc: true, metadata: ['title', 'artist', 'album'], audioFormats: ['WAV', 'FLAC'] },
    },
  },
  {
    name: 'Kuwo',
    slug: 'kuwo',
    isActive: true,
    metadata: {
      apiBase: 'https://api.kuwo.cn/v1',
      authType: 'API_Key',
      deliveryMethod: 'api',
      processingTime: '7-14 days',
      region: 'china',
      category: 'streaming',
      parent: 'tencent',
      requirements: { isrc: true, upc: true, metadata: ['title', 'artist', 'album'], audioFormats: ['WAV', 'FLAC'] },
    },
  },
  {
    name: 'Kuaishou',
    slug: 'kuaishou',
    isActive: true,
    metadata: {
      apiBase: 'https://open.kuaishou.com/music/v1',
      authType: 'OAuth2',
      deliveryMethod: 'api',
      processingTime: '5-10 days',
      region: 'china',
      category: 'social',
      requirements: { isrc: false, upc: false, metadata: ['title', 'artist'], audioFormats: ['WAV', 'MP3'] },
    },
  },

  // India
  {
    name: 'JioSaavn',
    slug: 'jiosaavn',
    isActive: true,
    metadata: {
      apiBase: 'https://api.jiosaavn.com/v1',
      authType: 'API_Key',
      deliveryMethod: 'api',
      processingTime: '5-10 days',
      region: 'india',
      category: 'streaming',
      requirements: { isrc: true, upc: false, metadata: ['title', 'artist', 'album'], audioFormats: ['WAV', 'MP3'] },
    },
  },
  {
    name: 'Gaana',
    slug: 'gaana',
    isActive: true,
    metadata: {
      apiBase: 'https://api.gaana.com/v1',
      authType: 'API_Key',
      deliveryMethod: 'api',
      processingTime: '7-14 days',
      region: 'india',
      category: 'streaming',
      requirements: { isrc: true, upc: false, metadata: ['title', 'artist', 'album'], audioFormats: ['WAV', 'MP3'] },
    },
  },

  // Middle East & Africa
  {
    name: 'Anghami',
    slug: 'anghami',
    isActive: true,
    metadata: {
      apiBase: 'https://api.anghami.com/v1',
      authType: 'OAuth2',
      deliveryMethod: 'api',
      processingTime: '5-10 days',
      region: 'middle_east',
      category: 'streaming',
      requirements: { isrc: true, upc: true, metadata: ['title', 'artist', 'album'], audioFormats: ['WAV', 'FLAC'] },
    },
  },
  {
    name: 'Boomplay',
    slug: 'boomplay',
    isActive: true,
    metadata: {
      apiBase: 'https://api.boomplay.com/v1',
      authType: 'API_Key',
      deliveryMethod: 'api',
      processingTime: '7-14 days',
      region: 'africa',
      category: 'streaming',
      requirements: { isrc: true, upc: false, metadata: ['title', 'artist', 'album'], audioFormats: ['WAV', 'MP3'] },
    },
  },

  // Asia Pacific
  {
    name: 'JOOX',
    slug: 'joox',
    isActive: true,
    metadata: {
      apiBase: 'https://api.joox.com/v1',
      authType: 'API_Key',
      deliveryMethod: 'api',
      processingTime: '7-14 days',
      region: 'asia',
      category: 'streaming',
      requirements: { isrc: true, upc: false, metadata: ['title', 'artist', 'album'], audioFormats: ['WAV', 'MP3'] },
    },
  },
  {
    name: 'KKBOX',
    slug: 'kkbox',
    isActive: true,
    metadata: {
      apiBase: 'https://api.kkbox.com/v1.1',
      authType: 'OAuth2',
      deliveryMethod: 'api',
      processingTime: '5-10 days',
      region: 'taiwan',
      category: 'streaming',
      requirements: { isrc: true, upc: true, metadata: ['title', 'artist', 'album'], audioFormats: ['WAV', 'FLAC'] },
    },
  },
  {
    name: 'AWA',
    slug: 'awa',
    isActive: true,
    metadata: {
      apiBase: 'https://api.awa.fm/v1',
      authType: 'API_Key',
      deliveryMethod: 'api',
      processingTime: '7-14 days',
      region: 'japan',
      category: 'streaming',
      requirements: { isrc: true, upc: true, metadata: ['title', 'artist', 'album'], audioFormats: ['WAV', 'FLAC'] },
    },
  },
  {
    name: 'FLO',
    slug: 'flo',
    isActive: true,
    metadata: {
      apiBase: 'https://api.music-flo.com/v1',
      authType: 'API_Key',
      deliveryMethod: 'api',
      processingTime: '7-14 days',
      region: 'korea',
      category: 'streaming',
      requirements: { isrc: true, upc: true, metadata: ['title', 'artist', 'album'], audioFormats: ['WAV', 'FLAC'] },
    },
  },
  {
    name: 'Melon',
    slug: 'melon',
    isActive: true,
    metadata: {
      apiBase: 'https://api.melon.com/v1',
      authType: 'API_Key',
      deliveryMethod: 'api',
      processingTime: '7-14 days',
      region: 'korea',
      category: 'streaming',
      requirements: { isrc: true, upc: true, metadata: ['title', 'artist', 'album'], audioFormats: ['WAV', 'FLAC'] },
    },
  },

  // Russia
  {
    name: 'Yandex Music',
    slug: 'yandex-music',
    isActive: true,
    metadata: {
      apiBase: 'https://api.music.yandex.net/v1',
      authType: 'OAuth2',
      deliveryMethod: 'api',
      processingTime: '7-14 days',
      region: 'russia',
      category: 'streaming',
      requirements: { isrc: true, upc: true, metadata: ['title', 'artist', 'album'], audioFormats: ['WAV', 'FLAC'] },
    },
  },
  {
    name: 'VK Music',
    slug: 'vk-music',
    isActive: true,
    metadata: {
      apiBase: 'https://api.vk.com/method',
      authType: 'OAuth2',
      deliveryMethod: 'api',
      processingTime: '7-14 days',
      region: 'russia',
      category: 'streaming',
      requirements: { isrc: true, upc: false, metadata: ['title', 'artist', 'album'], audioFormats: ['WAV', 'MP3'] },
    },
  },

  // Latin America
  {
    name: 'Claro Música',
    slug: 'claro-musica',
    isActive: true,
    metadata: {
      apiBase: 'https://api.claromusica.com/v1',
      authType: 'API_Key',
      deliveryMethod: 'api',
      processingTime: '10-14 days',
      region: 'latin_america',
      category: 'streaming',
      requirements: { isrc: true, upc: false, metadata: ['title', 'artist', 'album'], audioFormats: ['WAV', 'MP3'] },
    },
  },
  {
    name: 'Trebel',
    slug: 'trebel',
    isActive: true,
    metadata: {
      apiBase: 'https://api.trebelmusic.com/v1',
      authType: 'API_Key',
      deliveryMethod: 'api',
      processingTime: '7-14 days',
      region: 'latin_america',
      category: 'streaming',
      requirements: { isrc: true, upc: false, metadata: ['title', 'artist', 'album'], audioFormats: ['WAV', 'MP3'] },
    },
  },

  // =====================================================
  // 4. SOCIAL MEDIA & CONTENT IDENTIFICATION
  // =====================================================
  {
    name: 'TikTok',
    slug: 'tiktok',
    isActive: true,
    metadata: {
      apiBase: 'https://open-api.tiktok.com',
      authType: 'OAuth2',
      deliveryMethod: 'api',
      processingTime: '1-3 days',
      region: 'global',
      category: 'social',
      requirements: { isrc: false, upc: false, metadata: ['title', 'artist'], audioFormats: ['WAV', 'MP3'] },
    },
  },
  {
    name: 'Meta Library',
    slug: 'meta-library',
    isActive: true,
    metadata: {
      apiBase: 'https://graph.facebook.com/v18.0',
      authType: 'OAuth2',
      deliveryMethod: 'api',
      processingTime: '3-7 days',
      region: 'global',
      category: 'social',
      platforms: ['facebook', 'instagram'],
      requirements: { isrc: false, upc: false, metadata: ['title', 'artist'], audioFormats: ['WAV', 'MP3'] },
    },
  },
  {
    name: 'Instagram',
    slug: 'instagram',
    isActive: true,
    metadata: {
      apiBase: 'https://graph.facebook.com/v18.0',
      authType: 'OAuth2',
      deliveryMethod: 'api',
      processingTime: '3-7 days',
      region: 'global',
      category: 'social',
      requirements: { isrc: false, upc: false, metadata: ['title', 'artist'], audioFormats: ['WAV', 'MP3'] },
    },
  },
  {
    name: 'Facebook',
    slug: 'facebook',
    isActive: true,
    metadata: {
      apiBase: 'https://graph.facebook.com/v18.0',
      authType: 'OAuth2',
      deliveryMethod: 'api',
      processingTime: '3-7 days',
      region: 'global',
      category: 'social',
      requirements: { isrc: false, upc: false, metadata: ['title', 'artist'], audioFormats: ['WAV', 'MP3'] },
    },
  },
  {
    name: 'Snapchat',
    slug: 'snapchat',
    isActive: true,
    metadata: {
      apiBase: 'https://adsapi.snapchat.com/v1',
      authType: 'OAuth2',
      deliveryMethod: 'api',
      processingTime: '5-10 days',
      region: 'global',
      category: 'social',
      requirements: { isrc: false, upc: false, metadata: ['title', 'artist'], audioFormats: ['WAV', 'MP3'] },
    },
  },
  {
    name: 'YouTube Content ID',
    slug: 'youtube-content-id',
    isActive: true,
    metadata: {
      apiBase: 'https://www.googleapis.com/youtube/partner/v1',
      authType: 'OAuth2',
      deliveryMethod: 'api',
      processingTime: '1-3 days',
      region: 'global',
      category: 'monetization',
      requirements: { isrc: true, upc: false, metadata: ['title', 'artist'], audioFormats: ['WAV', 'MP3'] },
    },
  },
  {
    name: 'Twitch',
    slug: 'twitch',
    isActive: true,
    metadata: {
      apiBase: 'https://api.twitch.tv/helix',
      authType: 'OAuth2',
      deliveryMethod: 'api',
      processingTime: '5-10 days',
      region: 'global',
      category: 'social',
      requirements: { isrc: false, upc: false, metadata: ['title', 'artist'], audioFormats: ['WAV', 'MP3'] },
    },
  },
  {
    name: 'SoundExchange',
    slug: 'soundexchange',
    isActive: true,
    metadata: {
      apiBase: 'https://api.soundexchange.com/v1',
      authType: 'API_Key',
      deliveryMethod: 'api',
      processingTime: '14-30 days',
      region: 'north_america',
      category: 'royalty_collection',
      requirements: { isrc: true, upc: false, metadata: ['title', 'artist', 'album'], audioFormats: ['WAV'] },
    },
  },

  // =====================================================
  // 5. NICHE & LIFESTYLE PLATFORMS
  // =====================================================
  {
    name: 'Peloton',
    slug: 'peloton',
    isActive: true,
    metadata: {
      apiBase: 'https://api.onepeloton.com/v1',
      authType: 'API_Key',
      deliveryMethod: 'api',
      processingTime: '14-30 days',
      region: 'global',
      category: 'fitness',
      requirements: { isrc: true, upc: true, metadata: ['title', 'artist', 'bpm'], audioFormats: ['WAV', 'FLAC'] },
    },
  },
  {
    name: 'Soundtrack Your Brand',
    slug: 'soundtrack-your-brand',
    isActive: true,
    metadata: {
      apiBase: 'https://api.soundtrackyourbrand.com/v1',
      authType: 'API_Key',
      deliveryMethod: 'api',
      processingTime: '7-14 days',
      region: 'global',
      category: 'b2b',
      requirements: { isrc: true, upc: true, metadata: ['title', 'artist', 'mood', 'genre'], audioFormats: ['WAV', 'FLAC'] },
    },
  },
  {
    name: 'Pretzel Rocks',
    slug: 'pretzel-rocks',
    isActive: true,
    metadata: {
      apiBase: 'https://api.pretzel.rocks/v1',
      authType: 'API_Key',
      deliveryMethod: 'api',
      processingTime: '5-10 days',
      region: 'global',
      category: 'streaming_safe',
      requirements: { isrc: false, upc: false, metadata: ['title', 'artist'], audioFormats: ['WAV', 'MP3'] },
    },
  },
  {
    name: 'Roblox',
    slug: 'roblox',
    isActive: true,
    metadata: {
      apiBase: 'https://apis.roblox.com/assets/v1',
      authType: 'API_Key',
      deliveryMethod: 'api',
      processingTime: '7-14 days',
      region: 'global',
      category: 'gaming',
      requirements: { isrc: false, upc: false, metadata: ['title', 'artist'], audioFormats: ['OGG', 'MP3'] },
    },
  },

  // =====================================================
  // 6. ADDITIONAL STORES & SERVICES
  // =====================================================
  {
    name: 'Amazon MP3',
    slug: 'amazon-mp3',
    isActive: true,
    metadata: {
      apiBase: 'https://api.amazonmusic.com/mp3/v1',
      authType: 'AWS_SigV4',
      deliveryMethod: 'api',
      processingTime: '3-7 days',
      region: 'global',
      category: 'store',
      requirements: { isrc: true, upc: true, metadata: ['title', 'artist', 'album'], audioFormats: ['WAV', 'MP3'] },
    },
  },
  {
    name: '7digital',
    slug: '7digital',
    isActive: true,
    metadata: {
      apiBase: 'https://api.7digital.com/1.2',
      authType: 'OAuth1',
      deliveryMethod: 'api',
      processingTime: '5-10 days',
      region: 'global',
      category: 'store',
      requirements: { isrc: true, upc: true, metadata: ['title', 'artist', 'album'], audioFormats: ['WAV', 'FLAC'] },
    },
  },
  {
    name: 'Qobuz',
    slug: 'qobuz',
    isActive: true,
    metadata: {
      apiBase: 'https://api.qobuz.com/v1',
      authType: 'API_Key',
      deliveryMethod: 'api',
      processingTime: '7-14 days',
      region: 'europe',
      category: 'store',
      requirements: { isrc: true, upc: true, metadata: ['title', 'artist', 'album'], audioFormats: ['WAV', 'FLAC'] },
    },
  },
  {
    name: 'MediaNet',
    slug: 'medianet',
    isActive: true,
    metadata: {
      apiBase: 'https://api.mndigital.com/v1',
      authType: 'API_Key',
      deliveryMethod: 'api',
      processingTime: '10-14 days',
      region: 'global',
      category: 'store',
      requirements: { isrc: true, upc: true, metadata: ['title', 'artist', 'album'], audioFormats: ['WAV', 'FLAC'] },
    },
  },
  {
    name: 'Gracenote',
    slug: 'gracenote',
    isActive: true,
    metadata: {
      apiBase: 'https://api.gracenote.com/v1',
      authType: 'API_Key',
      deliveryMethod: 'api',
      processingTime: '3-7 days',
      region: 'global',
      category: 'metadata',
      requirements: { isrc: true, upc: true, metadata: ['title', 'artist', 'album'], audioFormats: ['WAV', 'FLAC'] },
    },
  },
  {
    name: 'Shazam',
    slug: 'shazam',
    isActive: true,
    metadata: {
      apiBase: 'https://api.shazam.com/v1',
      authType: 'API_Key',
      deliveryMethod: 'api',
      processingTime: '5-10 days',
      region: 'global',
      category: 'discovery',
      requirements: { isrc: true, upc: false, metadata: ['title', 'artist'], audioFormats: ['WAV', 'MP3'] },
    },
  },
  {
    name: 'Tencent Music',
    slug: 'tencent-music',
    isActive: true,
    metadata: {
      apiBase: 'https://api.tencentmusic.com/v1',
      authType: 'API_Key',
      deliveryMethod: 'api',
      processingTime: '7-14 days',
      region: 'china',
      category: 'streaming',
      parent: 'tencent',
      subsidiaries: ['qq-music', 'kugou', 'kuwo'],
      requirements: { isrc: true, upc: true, metadata: ['title', 'artist', 'album'], audioFormats: ['WAV', 'FLAC'] },
    },
  },
];

export async function seedDistributionPlatforms() {
  logger.info('🌱 Seeding distribution platforms...');

  try {
    for (const platform of DISTRIBUTION_PLATFORMS) {
      const [existing] = await db
        .select()
        .from(dspProviders)
        .where(eq(dspProviders.slug, platform.slug))
        .limit(1);

      if (!existing) {
        await db.insert(dspProviders).values({
          name: platform.name,
          slug: platform.slug,
          isActive: platform.isActive,
          metadata: platform.metadata,
        });
        logger.info(`  ✅ Added platform: ${platform.name}`);
      } else {
        await db.update(dspProviders)
          .set({ metadata: platform.metadata, isActive: platform.isActive })
          .where(eq(dspProviders.slug, platform.slug));
        logger.info(`  🔄 Updated platform: ${platform.name}`);
      }
    }

    logger.info(
      `✅ Distribution platform seeding complete! ${DISTRIBUTION_PLATFORMS.length} platforms available.`
    );
  } catch (error: unknown) {
    logger.error('❌ Error seeding distribution platforms:', error);
    throw error;
  }
}
