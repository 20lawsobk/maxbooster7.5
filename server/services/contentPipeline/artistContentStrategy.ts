/**
 * Artist Content Strategy
 *
 * Generates social media and ad content for the artist's personal brand,
 * music catalog, releases, identity, and fan relationships.
 *
 * Content verticals:
 * - New release promotion
 * - Pre-release / teaser / pre-save campaign
 * - Behind-the-scenes & studio content
 * - Lyric reveals & snippet drops
 * - Fan engagement (Q&A, polls, milestones)
 * - Artist identity & brand storytelling
 * - Playlist / streaming push
 * - Live shows & events
 * - Merchandise & storefront promotion
 * - Collaborations & features
 * - Throwback / catalog discovery
 * - Listening party invites
 */

import type { SupportedPlatform } from './platformFormatters.js';
import type { GeneratorContext } from './contentTypeGenerators.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ArtistContentVertical =
  | 'new_release'
  | 'pre_release'
  | 'behind_the_scenes'
  | 'lyric_reveal'
  | 'fan_engagement'
  | 'brand_story'
  | 'streaming_push'
  | 'live_event'
  | 'merchandise'
  | 'collaboration'
  | 'catalog_discovery'
  | 'listening_party';

export interface ArtistContext {
  artistName: string;
  genre: string;
  mood: string;
  trackTitle?: string;
  albumTitle?: string;
  releaseDate?: string;
  streamingLinks?: Partial<Record<string, string>>;
  bio?: string;
  brandVoice: GeneratorContext['brandVoice'];
  colorPalette: string[];
  targetAudience: string;
  socialHandles?: Partial<Record<SupportedPlatform, string>>;
  milestones?: string[];
  upcomingEvents?: Array<{ name: string; date: string; venue?: string; city?: string }>;
  collaborators?: string[];
  keywords: string[];
}

export interface ArtistContentPiece {
  vertical: ArtistContentVertical;
  platform: SupportedPlatform;
  headline: string;
  hook: string;
  caption: string;
  cta: string;
  hashtags: string[];
  visualDirection: string;
  videoScriptHook?: string;
  storyFrameHint?: string;
  interactionPrompt?: string;
  source?: string;
}

// ─── Vertical Templates ───────────────────────────────────────────────────────

type VerticalGenerator = (ctx: ArtistContext, platform: SupportedPlatform) => ArtistContentPiece;

const VERTICAL_GENERATORS: Record<ArtistContentVertical, VerticalGenerator> = {
  new_release: (ctx, platform) => ({
    vertical: 'new_release',
    platform,
    headline: `${ctx.trackTitle ?? 'New Music'} — Out Now`,
    hook: `We dropped it. ${ctx.artistName} — "${ctx.trackTitle ?? 'New Track'}" is officially out now 🎵`,
    caption: buildReleaseCaption(ctx, 'out_now'),
    cta: 'Stream Now — Link in Bio',
    hashtags: buildArtistHashtags(ctx, 'new_release', platform),
    visualDirection: `Release artwork in ${ctx.colorPalette[0] ?? 'dark'} palette. Artist name and track title prominent. "Out Now" stamp. Streaming platform logos.`,
    videoScriptHook: `The song I've been holding back — it's finally here.`,
    interactionPrompt: `What's your first reaction? Drop it in the comments 👇`,
  }),

  pre_release: (ctx, platform) => ({
    vertical: 'pre_release',
    platform,
    headline: `${ctx.trackTitle ?? 'Something New'} — Coming ${ctx.releaseDate ?? 'Soon'}`,
    hook: `I've been sitting on this one for months. It's almost time. 👀`,
    caption: `"${ctx.trackTitle ?? 'New Track'}" drops ${ctx.releaseDate ?? 'soon'}.\n\n${ctx.mood.charAt(0).toUpperCase() + ctx.mood.slice(1)} ${ctx.genre} — and it's unlike anything I've done before.\n\nPre-save now so you don't miss it. Link in bio 🎶`,
    cta: 'Pre-Save Now',
    hashtags: buildArtistHashtags(ctx, 'pre_release', platform),
    visualDirection: `Countdown-style graphic. Release date large. Blurred/teased artwork. Artist name. Dark, anticipatory color scheme.`,
    videoScriptHook: `I'm not supposed to be showing you this yet...`,
    storyFrameHint: `Use countdown sticker to release date`,
    interactionPrompt: `Are you ready for this? 🔥 or 💯`,
  }),

  behind_the_scenes: (ctx, platform) => ({
    vertical: 'behind_the_scenes',
    platform,
    headline: `Inside the Studio: ${ctx.artistName}`,
    hook: `This is what the music actually looks like being made. No filter. 🎛️`,
    caption: `Raw. Unfiltered. Real.\n\nThis is how "${ctx.trackTitle ?? 'the music'}" came to life in the studio.\n\nEvery song you hear started exactly like this — just me, the ${ctx.genre} sound, and a vision.\n\nMore BTS dropping soon. Follow for the full journey. 🎵`,
    cta: 'Follow for the Full Journey',
    hashtags: buildArtistHashtags(ctx, 'behind_the_scenes', platform),
    visualDirection: `Authentic studio footage. Messy creative environment. Artist at work. Warm, intimate lighting. Not overly produced.`,
    videoScriptHook: `Nobody sees this side of the music. Until now.`,
    interactionPrompt: `What part of the process are you most curious about?`,
  }),

  lyric_reveal: (ctx, platform) => ({
    vertical: 'lyric_reveal',
    platform,
    headline: `These lyrics hit different at 2AM...`,
    hook: `Real words. Real moment. ${ctx.artistName} drops a lyric from "${ctx.trackTitle ?? 'the new track'}". 📝`,
    caption: `"[Your most powerful lyric here]"\n\n— ${ctx.artistName}, "${ctx.trackTitle ?? 'New Track'}"\n\n${ctx.releaseDate ? `Out ${ctx.releaseDate}.` : 'Out now.'} Full song — link in bio.\n\nWho needed to hear this today? Tag them. 💬`,
    cta: 'Stream the Full Song',
    hashtags: buildArtistHashtags(ctx, 'lyric_reveal', platform),
    visualDirection: `Lyric typography on moody background. ${ctx.mood} color palette. Artist name and track credit small at bottom. Bold, readable font.`,
    videoScriptHook: `This line took me 3 weeks to write. Here's why.`,
    interactionPrompt: `Which line in this song hits you the hardest?`,
  }),

  fan_engagement: (ctx, platform) => ({
    vertical: 'fan_engagement',
    platform,
    headline: `Ask ${ctx.artistName} Anything`,
    hook: `I'm right here. Ask me anything. 👇`,
    caption: `I don't do this often enough — but today, it's all about you.\n\nDrop your questions below. Music, life, the creative process — whatever.\n\nI'm answering everything in the next 24 hours. 🎵\n\nLet's talk.`,
    cta: 'Drop Your Question Below',
    hashtags: buildArtistHashtags(ctx, 'fan_engagement', platform),
    visualDirection: `Casual, candid photo or selfie-style image of artist. Friendly, approachable energy. Speech bubble or question mark graphic element.`,
    videoScriptHook: `My fans know me better than most people in my life. So let's actually talk.`,
    interactionPrompt: `What's one thing you want to ask me?`,
  }),

  brand_story: (ctx, platform) => ({
    vertical: 'brand_story',
    platform,
    headline: `Why I Make ${ctx.genre} Music`,
    hook: `This is the real story behind ${ctx.artistName}. No highlights reel. 🎤`,
    caption: `I didn't start making ${ctx.genre} music because it was safe.\n\nI started because it was the only thing that made me feel something real.\n\nThe ${ctx.mood} energy you hear — that's not a style choice. That's who I am.\n\n${ctx.bio ? ctx.bio + '\n\n' : ''}This is my story. What's yours? 💬`,
    cta: 'Follow the Journey',
    hashtags: buildArtistHashtags(ctx, 'brand_story', platform),
    visualDirection: `Cinematic artist portrait. ${ctx.mood} lighting. Authentic environment — not a studio set. Tell a visual story.`,
    videoScriptHook: `People always ask why I make ${ctx.genre}. Here's the real answer.`,
    interactionPrompt: `What does ${ctx.genre} mean to you?`,
  }),

  streaming_push: (ctx, platform) => ({
    vertical: 'streaming_push',
    platform,
    headline: `"${ctx.trackTitle ?? 'New Track'}" is getting plays — here's why`,
    hook: `People are streaming this for a reason. Have you heard it yet? 🎧`,
    caption: `"${ctx.trackTitle ?? 'New Track'}" — ${ctx.artistName}\n\n${ctx.mood.charAt(0).toUpperCase() + ctx.mood.slice(1)} ${ctx.genre} for when you need it most.\n\nAlready on rotation for thousands of listeners.\n\nJoin them. Stream it now — link in bio 🎵`,
    cta: 'Add to Your Playlist',
    hashtags: buildArtistHashtags(ctx, 'streaming_push', platform),
    visualDirection: `Streaming platform UI mockup showing the track. Play button prominent. Stream count if available. Artist image in background.`,
    interactionPrompt: `What playlist does this belong on? Name it below 👇`,
  }),

  live_event: (ctx, platform) => ({
    vertical: 'live_event',
    platform,
    headline: ctx.upcomingEvents?.[0]
      ? `${ctx.artistName} LIVE — ${ctx.upcomingEvents[0].city ?? ctx.upcomingEvents[0].name}`
      : `${ctx.artistName} — Live Dates Announced`,
    hook: `We're bringing the ${ctx.mood} ${ctx.genre} energy LIVE. 🎤`,
    caption: ctx.upcomingEvents?.[0]
      ? `LIVE:\n\n📍 ${ctx.upcomingEvents[0].venue ?? ctx.upcomingEvents[0].name}\n📅 ${ctx.upcomingEvents[0].date}\n🏙️ ${ctx.upcomingEvents[0].city ?? ''}\n\nTickets available now — link in bio. Don't sleep on this. 🎵`
      : `Live shows are coming.\n\nDates dropping soon. Follow and turn on notifications so you don't miss the announcement.\n\n${ctx.mood.charAt(0).toUpperCase() + ctx.mood.slice(1)} ${ctx.genre} energy — live and unfiltered. 🔥`,
    cta: 'Get Tickets',
    hashtags: buildArtistHashtags(ctx, 'live_event', platform),
    visualDirection: `Event poster style. Artist name large. Date and venue. Energetic typography. ${ctx.mood} color palette.`,
    videoScriptHook: `Last time I performed, the crowd lost it. I'm bringing that energy back.`,
  }),

  merchandise: (ctx, platform) => ({
    vertical: 'merchandise',
    platform,
    headline: `${ctx.artistName} Merch — Limited Drop`,
    hook: `Wear the sound. ${ctx.artistName} merch is live. 👕`,
    caption: `The ${ctx.artistName} merch drop is live — and it's limited.\n\n${ctx.mood.charAt(0).toUpperCase() + ctx.mood.slice(1)} designs. ${ctx.genre} energy. Made for people who actually listen.\n\nShop now — link in bio. Once it's gone, it's gone. 🛍️`,
    cta: 'Shop the Drop',
    hashtags: buildArtistHashtags(ctx, 'merchandise', platform),
    visualDirection: `Merch mockup on model or flat-lay. Artist branding clear. Limited edition feel — use scarcity visual language.`,
    interactionPrompt: `Which design is your favorite? Vote below 👇`,
  }),

  collaboration: (ctx, platform) => ({
    vertical: 'collaboration',
    platform,
    headline: `${ctx.artistName} × ${ctx.collaborators?.[0] ?? 'Special Guest'} — New Music`,
    hook: `Two artists. One record. And it sounds exactly how you'd hope. 🔥`,
    caption: `${ctx.artistName} × ${ctx.collaborators?.[0] ?? 'Special Guest'} — "${ctx.trackTitle ?? 'New Collab'}"\n\nWhen two different worlds collide, this is what happens.\n\n${ctx.mood.charAt(0).toUpperCase() + ctx.mood.slice(1)} ${ctx.genre} energy × something completely new.\n\nOut ${ctx.releaseDate ?? 'now'}. Stream it — link in bio. 🎵`,
    cta: 'Stream the Collab',
    hashtags: buildArtistHashtags(ctx, 'collaboration', platform),
    visualDirection: `Side-by-side or merged portrait of both artists. Collaborative energy — not competitive. ${ctx.colorPalette[0] ?? 'dark'} palette.`,
    videoScriptHook: `This collab started with one conversation. Here's how it became a record.`,
    interactionPrompt: `Did you expect these two to sound like this together?`,
  }),

  catalog_discovery: (ctx, platform) => ({
    vertical: 'catalog_discovery',
    platform,
    headline: `If You Missed This ${ctx.artistName} Track...`,
    hook: `This one flew under the radar. But it shouldn't have. 🎧`,
    caption: `Not every song goes viral the day it drops.\n\nBut that doesn't mean it doesn't deserve to be heard.\n\nIf you're new to ${ctx.artistName} — start here. "${ctx.trackTitle ?? 'This track'}" is the one that tells you everything about who I am.\n\n${ctx.mood.charAt(0).toUpperCase() + ctx.mood.slice(1)} ${ctx.genre}. No compromise. Stream it now — link in bio. 🎵`,
    cta: 'Discover the Catalog',
    hashtags: buildArtistHashtags(ctx, 'catalog_discovery', platform),
    visualDirection: `Nostalgic or archival feel. Original release artwork. "Hidden gem" visual language — could use a spotlight or discovery motif.`,
    interactionPrompt: `Which ${ctx.artistName} track got you first?`,
  }),

  listening_party: (ctx, platform) => ({
    vertical: 'listening_party',
    platform,
    headline: `Listening Party — "${ctx.trackTitle ?? 'New Music'}" Live`,
    hook: `You're invited. Let's hear it together. 🎧`,
    caption: `Listening party for "${ctx.trackTitle ?? 'the new drop'}" — join me LIVE.\n\nWe're going through the whole thing. Track by track. I'll explain every decision.\n\n${ctx.releaseDate ? `Date: ${ctx.releaseDate}` : 'Date TBA — follow for the announcement.'}\n\nBring your headphones. This one requires full attention. 🎵`,
    cta: 'Set a Reminder',
    hashtags: buildArtistHashtags(ctx, 'listening_party', platform),
    visualDirection: `Live stream / event graphic. Headphone visual. Date and time prominent. Warm, intimate energy.`,
    storyFrameHint: `Add countdown sticker to the listening party time`,
    interactionPrompt: `Who's coming? Drop a 🎧 if you're in.`,
  }),
};

// ─── Hashtag Builder ──────────────────────────────────────────────────────────

function buildArtistHashtags(
  ctx: ArtistContext,
  vertical: ArtistContentVertical,
  platform: SupportedPlatform,
): string[] {
  const branded = [`#${ctx.artistName.replace(/\s+/g, '')}`, `#${ctx.genre.replace(/\s+/g, '')}Music`];

  const verticalTags: Record<ArtistContentVertical, string[]> = {
    new_release: ['#NewMusic', '#NewRelease', '#OutNow', '#StreamNow', '#NewMusicFriday'],
    pre_release: ['#ComingSoon', '#PreSave', '#NewMusic', '#CountdownToRelease'],
    behind_the_scenes: ['#StudioLife', '#BehindTheMusic', '#MakingMusic', '#StudioSession'],
    lyric_reveal: ['#Lyrics', '#SongLyrics', '#Songwriter', '#LyricVideo'],
    fan_engagement: ['#QAndA', '#FanLove', '#AskMe', '#FanEngagement'],
    brand_story: ['#ArtistStory', '#MusicJourney', '#IndependentArtist', '#ArtistLife'],
    streaming_push: ['#Spotify', '#AppleMusic', '#StreamNow', '#PlaylistPush'],
    live_event: ['#LiveMusic', '#Concert', '#LiveShow', '#TourLife'],
    merchandise: ['#Merch', '#ArtistMerch', '#LimitedEdition', '#ShopNow'],
    collaboration: ['#Collab', '#NewMusic', '#Feature', '#MusicCollab'],
    catalog_discovery: ['#ThrowbackMusic', '#HiddenGem', '#DeepCut', '#MusicDiscover'],
    listening_party: ['#ListeningParty', '#LiveStream', '#NewAlbum', '#MusicEvent'],
  };

  const platformBoost: Partial<Record<SupportedPlatform, string[]>> = {
    tiktok: ['#FYP', '#MusicTikTok', '#TikTokMusic'],
    instagram: ['#Reels', '#InstaMusic', '#MusicReels'],
    youtube: ['#YouTubeMusic', '#MusicVideo'],
    twitter: ['#NowPlaying', '#MusicTwitter'],
    google_business: [],
  };

  return [
    ...branded,
    ...(verticalTags[vertical] ?? []),
    ...(platformBoost[platform] ?? []),
    '#IndependentArtist',
    '#MusicPromotion',
  ].slice(0, 30);
}

// ─── Release Caption Builder ──────────────────────────────────────────────────

function buildReleaseCaption(ctx: ArtistContext, stage: 'out_now' | 'pre_save'): string {
  const base = stage === 'out_now'
    ? `"${ctx.trackTitle ?? 'New Track'}" is OUT NOW.\n\n`
    : `"${ctx.trackTitle ?? 'New Track'}" drops ${ctx.releaseDate ?? 'soon'}. Pre-save now.\n\n`;

  const body = `${ctx.mood.charAt(0).toUpperCase() + ctx.mood.slice(1)} ${ctx.genre} energy — this one hits different.\n\n`;

  const links = ctx.streamingLinks
    ? Object.entries(ctx.streamingLinks)
        .slice(0, 3)
        .map(([platform, url]) => `🎵 ${platform}: ${url}`)
        .join('\n') + '\n\n'
    : 'Stream everywhere — link in bio\n\n';

  const cta = stage === 'out_now'
    ? 'Add it to your playlist. You won\'t regret it. 🔥'
    : 'Pre-save now and be the first to hear it. 🎧';

  return base + body + links + cta;
}

// ─── Main API ─────────────────────────────────────────────────────────────────

/**
 * Generates a content piece for a specific artist vertical on a given platform.
 */
export function generateArtistContent(
  ctx: ArtistContext,
  vertical: ArtistContentVertical,
  platform: SupportedPlatform,
): ArtistContentPiece {
  const generator = VERTICAL_GENERATORS[vertical];
  return generator(ctx, platform);
}

/**
 * Generates the full artist content set across all active verticals and platforms.
 * Intelligently selects verticals based on what artist context fields are populated.
 */
export function generateAllArtistContent(
  ctx: ArtistContext,
  platforms: SupportedPlatform[],
): ArtistContentPiece[] {
  const pieces: ArtistContentPiece[] = [];

  // Determine active verticals from context
  const activeVerticals: ArtistContentVertical[] = ['fan_engagement', 'brand_story', 'catalog_discovery'];

  if (ctx.trackTitle) {
    activeVerticals.unshift('new_release', 'lyric_reveal', 'streaming_push');
  }

  if (ctx.releaseDate) {
    const releaseTime = new Date(ctx.releaseDate).getTime();
    const now = Date.now();
    if (releaseTime > now) {
      activeVerticals.unshift('pre_release');
    }
  }

  if (ctx.upcomingEvents && ctx.upcomingEvents.length > 0) {
    activeVerticals.push('live_event', 'listening_party');
  }

  if (ctx.collaborators && ctx.collaborators.length > 0) {
    activeVerticals.push('collaboration');
  }

  // Always include BTS content
  activeVerticals.push('behind_the_scenes');

  // Deduplicate
  const deduped = [...new Set(activeVerticals)];

  for (const vertical of deduped) {
    for (const platform of platforms) {
      pieces.push({ ...generateArtistContent(ctx, vertical, platform), source: 'MaxCoreAI' });
    }
  }

  return pieces;
}
