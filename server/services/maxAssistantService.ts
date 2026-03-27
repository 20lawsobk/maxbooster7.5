import { logger } from '../logger.js';

// ── Deterministic PRNG — FNV-1a 32-bit ──────────────────────────────────────
function seededIndex(seed: string, length: number): number {
  if (length <= 0) return 0;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
    h >>>= 0;
  }
  return h % length;
}
// ────────────────────────────────────────────────────────────────────────────

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AssistantResponse {
  content: string;
  category: string;
  confidence: number;
  proactiveSuggestions?: string[];
  relatedTopics?: string[];
  quickActions?: QuickAction[];
}

interface QuickAction {
  label: string;
  prompt: string;
  icon?: string;
}

type KnowledgeEntry = {
  keywords: string[];
  answer: string;
  category: string;
  nextSteps?: string[];
  relatedKeywords?: string[];
};

const KNOWLEDGE_BASE: KnowledgeEntry[] = [
  // ── STUDIO / DAW ──────────────────────────────────────────────────────────
  {
    keywords: ['studio', 'daw', 'digital audio workstation', 'record', 'recording', 'tracks', 'track', 'how to use studio', 'open studio'],
    category: 'studio',
    relatedKeywords: ['mixing', 'mastering', 'export', 'midi', 'plugin'],
    nextSteps: ['Try the AI Mix feature on your track', 'Export your finished track to WAV', 'Use AI Generator to create a beat from scratch', 'Set up a distribution release from your Studio project'],
    answer: `The Max Booster Studio is a full professional DAW (Digital Audio Workstation) — built 100% in-house.

**Getting Started:**
1. Click "Studio" in the left sidebar
2. Create a new project or open an existing one
3. Add tracks: Audio, MIDI, or Instrument tracks
4. Record live or import audio/MIDI files
5. Edit, arrange, mix, and export your finished track

**Core Features:**
• Unlimited multi-track recording and editing
• AI-powered mixing and mastering (in-house engine)
• Virtual instruments and professional effects
• Automation lanes for every parameter
• MIDI piano roll editor
• Export to WAV, MP3, FLAC, and stems
• Real-time collaboration with other artists
• Stem separation — isolate vocals, drums, bass from any track
• Plugin system (VST bridge for external plugins)
• Comping — select the best takes from multiple recordings

**Track Types:**
• **Audio Track** — record live audio or import files
• **MIDI Track** — program notes and melodies
• **Instrument Track** — MIDI + built-in virtual instrument
• **Aux/Bus Track** — group routing for mixing

**Pro Tips:**
• Save projects to cloud automatically — your work never gets lost
• Use "Save As Template" to reuse your go-to session layout
• Keyboard shortcut: **Spacebar** = play/stop, **R** = record, **Cmd/Ctrl+Z** = undo

The Studio interface is modeled after Studio One for a professional-grade workflow.`,
  },
  {
    keywords: ['ai mix', 'ai mixing', 'mixing', 'eq', 'compression', 'master', 'mastering', 'ai master', 'loudness', 'lufs', 'finish track', 'polish', 'mix down'],
    category: 'studio',
    relatedKeywords: ['export', 'distribution', 'studio', 'mastering standards'],
    nextSteps: ['Export your mastered track to WAV for distribution', 'Submit to distribution after mastering', 'Run AI Master to hit streaming loudness targets', 'Upload to the Beat Marketplace after mastering'],
    answer: `AI Mixing & Mastering is powered by Max Booster's custom in-house AI engine — no third-party APIs.

**AI Mixer:**
• Automatic level balancing across all tracks
• Intelligent EQ per track based on genre and frequency analysis
• Genre-aware dynamic compression
• Stereo imaging and spatial positioning
• Reverb and delay send automation
• Harmonic excitement and saturation control

**AI Mastering:**
• Multi-band compression for punch and clarity
• Adaptive EQ to correct tonal imbalances
• Stereo widening to professional width
• Loudness optimization targeting streaming standards:
  - Spotify: -14 LUFS integrated
  - Apple Music: -16 LUFS integrated
  - YouTube: -14 LUFS integrated
  - Tidal (HiFi): -18 LUFS integrated
  - SoundCloud: -14 LUFS integrated

**How to use:**
1. Open your project in Studio
2. Click "AI Tools" in the top toolbar
3. Choose "AI Mix" (for track mixing) or "AI Master" (final polish)
4. Select your target genre/style (Trap, R&B, Pop, Rock, etc.)
5. Hit Process — results in seconds

**Advanced Controls:**
• Reference Track Matching — upload a reference track and the AI matches its tonal character
• LUFS Target — set custom loudness target for niche platforms
• Stem-specific processing — apply AI mix to individual stems

This replaces thousands of dollars in professional mixing/mastering services.`,
  },
  {
    keywords: ['ai generator', 'generate beat', 'generate music', 'generate melody', 'text to music', 'create beat', 'beat from scratch', 'ai generate', 'generate from text', 'make beat', 'create music'],
    category: 'studio',
    relatedKeywords: ['midi', 'instruments', 'export', 'marketplace', 'distribution'],
    nextSteps: ['Edit the generated beat in the MIDI editor', 'Add your own vocals or instrumentation', 'Export and distribute the track', 'List the beat on the Marketplace'],
    answer: `The AI Generator creates original beats, melodies, chord progressions, and full instrumentals from text descriptions — all powered by our in-house AdvancedMusicAI model.

**How to use:**
1. In Studio, click "AI Generator" in the toolbar
2. Type a description: "dark trap beat with 808s at 140 BPM" or "lo-fi jazz piano with vinyl crackle"
3. Choose duration (8, 16, 32, or 64 bars)
4. Select key signature and time signature (optional)
5. Hit Generate — your track appears as a new project

**The AI understands:**
• Genres (trap, R&B, pop, jazz, rock, EDM, afrobeats, drill, amapiano, and 50+ more)
• Mood descriptors (dark, uplifting, melancholic, energetic, chill, aggressive, smooth)
• Instrumentation requests (808s, piano, strings, brass, pad, perc, synth lead)
• Tempo and key specifications (BPM, major/minor keys, modes)
• Structural cues (verse, chorus, bridge, drop, breakdown patterns)
• Era/decade influences (90s, 2000s, current, future)
• Artist-inspired styles (described by genre characteristics, not copying)

**Pattern Library:**
• 4,700+ melody patterns across genres
• 2,000+ drum patterns
• 1,800+ percussion patterns
• Constantly expanding with new musical data

All generated music is 100% yours to use, sell, or distribute.`,
  },
  {
    keywords: ['midi', 'piano roll', 'midi editor', 'midi notes', 'midi instrument', 'virtual instrument', 'vst', 'plugin', 'synthesizer'],
    category: 'studio',
    relatedKeywords: ['generate', 'studio', 'instruments', 'chord'],
    nextSteps: ['Quantize your MIDI to fix timing', 'Add velocity variation for a human feel', 'Humanize function for natural groove', 'Route MIDI to a virtual instrument'],
    answer: `The MIDI editor and virtual instruments in Max Booster Studio give you full in-box production capability.

**MIDI Piano Roll:**
• Draw, edit, and delete MIDI notes with precision
• Velocity editing per note (how hard each note hits)
• Quantization (1/4, 1/8, 1/16, 1/32 note grids)
• Humanize function for natural, non-robotic feel
• Chord mode for quick harmonic composition
• Scale lock — only play notes in your chosen key
• Note transpose (shift selected notes up/down)
• Legato mode — extend notes to connect seamlessly

**Built-in Virtual Instruments:**
• Synthesizers (subtractive, FM, wavetable — 3 distinct engines)
• Sampler (load your own samples or use included library)
• Drum machines with step sequencer
• Realistic piano and electric piano
• Guitar (acoustic and electric with chord voicings)
• Full orchestral: strings, brass, woodwinds, choir
• 808 bass synthesizer with pitch envelope
• Arp/chord sequencers built in

**MIDI Routing:**
• Send MIDI to any virtual instrument
• Stack multiple instruments on one MIDI track
• MIDI learn for hardware controller mapping

For MIDI hardware (keyboards, controllers), you may be prompted for MIDI device permission in your browser — this only appears on the Studio page.`,
  },
  {
    keywords: ['export', 'bounce', 'download track', 'wav', 'mp3', 'flac', 'stems', 'export project', 'bounce down'],
    category: 'studio',
    relatedKeywords: ['distribution', 'marketplace', 'mastering', 'delivery'],
    nextSteps: ['Submit your exported track to distribution', 'Upload to the Beat Marketplace', 'Run AI Master before exporting for best quality', 'Export stems for collaborators'],
    answer: `Exporting your finished music from Max Booster Studio:

**Export Formats:**
• **WAV** — Full lossless quality (16-bit or 24-bit, 44.1kHz or 48kHz)
• **MP3** — Compressed, smaller file (128, 192, or 320 kbps)
• **FLAC** — Lossless compressed (ideal for distribution masters)
• **AIFF** — Apple lossless (compatible with all DAWs)
• **Stems** — Export each track individually for collaboration or licensing

**How to export:**
1. In Studio, go to File → Export (or press Cmd/Ctrl+E)
2. Choose your format and quality settings
3. Select export range (all, loop, or selection)
4. Optionally apply AI Master in the same step
5. Click Export — file downloads immediately

**Export Presets:**
• **Distribution Master** — 24-bit WAV, AI Mastered, -14 LUFS
• **Streaming Ready** — MP3 320kbps, normalized
• **Stem Pack** — All tracks bounced individually
• **Custom** — Set your own parameters

**For distribution:** Use WAV or FLAC at 24-bit for the highest quality master. The distribution system accepts these formats directly.

**Pro Tip:** Export stems as well as your final mix — buyers on the Marketplace may pay significantly more for stem packs.`,
  },
  {
    keywords: ['collaboration', 'collab', 'real-time editing', 'work together', 'invite collaborator', 'shared project', 'co-produce'],
    category: 'studio',
    relatedKeywords: ['studio', 'royalty split', 'share'],
    nextSteps: ['Set up a royalty split agreement with your collaborator', 'Export stems after collaborating', 'Submit a joint release to distribution'],
    answer: `Real-time studio collaboration lets you co-produce tracks live with other Max Booster users.

**Starting a Collaboration:**
1. Open any Studio project
2. Click the collaboration icon (top right) → "Invite Collaborator"
3. Enter their Max Booster username or email
4. They receive a notification with a join link
5. Both parties edit in real-time, changes sync instantly

**What you can do together:**
• Both users can add, edit, delete, and move regions simultaneously
• See each other's cursor position in the timeline
• Presence indicator shows who is active and where
• Built-in session chat
• Conflict resolution — if both edit the same region, changes are merged intelligently

**Collaboration Permissions:**
• **Editor** — full access to edit tracks and settings
• **Viewer** — listen only, cannot edit
• **Commenter** — can add timeline markers and notes

**After collaborating:**
• Set up royalty splits in the distribution form to automatically share royalties
• Each collaborator exports their own copy for their records
• Project history logs every change and who made it`,
  },
  {
    keywords: ['stem separation', 'stem splitter', 'isolate vocals', 'remove vocals', 'extract drums', 'separate stems', 'isolate bass'],
    category: 'studio',
    relatedKeywords: ['remix', 'sampling', 'studio'],
    nextSteps: ['Use isolated stems in a remix', 'Export isolated vocal for acapella', 'Layer stems into a new beat'],
    answer: `Stem Separation uses AI to isolate individual elements from any audio file — powered by our in-house AI.

**What you can separate:**
• Vocals (lead + background)
• Drums (full kit or individual pieces)
• Bass (bass guitar + 808)
• Melody (piano, guitars, synths)
• Other (everything not classified above)

**How to use:**
1. In Studio, drag in any audio file (WAV, MP3, FLAC)
2. Right-click the audio region → "Separate Stems"
3. Choose which stems to isolate
4. Click Process — stems appear as individual tracks in seconds
5. Mute/solo any combination

**Quality:** Our AI achieves professional-grade separation — minimal bleed between stems compared to older open-source tools.

**Uses:**
• Remove vocals to create instrumentals for distribution
• Extract drums to study or sample the groove
• Isolate vocals for acapella releases
• Remix existing recordings you own
• Practice singing/playing along to isolated elements

**Legal note:** You can only legally separate and use stems from music you own or have a valid license for.`,
  },

  // ── DISTRIBUTION ──────────────────────────────────────────────────────────
  {
    keywords: ['distribution', 'distribute', 'release music', 'upload music', 'submit music', 'put music on spotify', 'streaming', 'get on spotify', 'apple music', 'new release', 'submit release'],
    category: 'distribution',
    relatedKeywords: ['platforms', 'isrc', 'metadata', 'cover art', 'royalties'],
    nextSteps: ['Upload cover art (3000x3000px)', 'Set your release date (2+ weeks out for best playlist pitching odds)', 'Add collaborator royalty splits', 'Pitch to playlist editors after going live'],
    answer: `Max Booster distributes your music to 150+ streaming platforms worldwide — and you keep 100% of your royalties.

**Step-by-Step Distribution:**
1. Go to **Distribution** in the sidebar
2. Click **"New Release"**
3. Upload your audio file (WAV or FLAC recommended, minimum 16-bit/44.1kHz)
4. Upload cover art (3000×3000 pixels, JPG or PNG)
5. Fill in metadata:
   - Song/album title
   - Artist name (and featuring artists)
   - Genre and subgenre
   - Release date
   - Language of lyrics
   - ISRC code (auto-generated if you don't have one)
   - UPC barcode (auto-generated for albums/EPs)
   - Explicit content flag
6. Select platforms (all 150+ or pick specific ones)
7. Set royalty splits if you have collaborators
8. Submit for review

**Timeline:**
• Review process: 24–48 hours
• Live on platforms: 1–3 business days after approval
• Recommendation: Submit at least **2 weeks before** your target date for playlist pitching opportunities

**You keep 100% of royalties.** No commission, no hidden fees.

**Release Types:**
• **Single** (1 track) — fastest approval
• **EP** (2–6 tracks) — requires UPC barcode (auto-generated)
• **Album** (7+ tracks) — requires UPC barcode, longer metadata completion

**Pre-Save Campaigns:** Max Booster generates a pre-save link automatically for any scheduled release.`,
  },
  {
    keywords: ['platforms', 'which platforms', 'streaming platforms', 'where distributed', 'tidal', 'deezer', 'amazon music', 'youtube music', 'pandora', 'soundcloud', 'boomplay'],
    category: 'distribution',
    relatedKeywords: ['distribution', 'royalties', 'international'],
    nextSteps: ['Select all platforms for maximum reach', 'Enable YouTube Content ID for video monetization', 'Check your platform-specific analytics after launch'],
    answer: `Max Booster distributes to 150+ platforms including every major service globally:

**Major Streaming (US/Global):**
Spotify, Apple Music, YouTube Music, Amazon Music, Tidal, Deezer, Pandora, iHeartRadio, Napster, Boomplay, SoundCloud (monetized), Audiomack

**Social Media Platforms:**
TikTok (music library), Instagram/Facebook (Meta Music), Snapchat Sounds, Triller

**International Markets:**
• 🇨🇳 China: NetEase Music, QQ Music, Kugou, Kuwo
• 🇮🇳 India: JioSaavn, Gaana, Wynk Music, Hungama
• 🇸🇦 Middle East: Anghami, Shahid
• 🇿🇦 Africa: Boomplay, Mdundo
• 🇰🇷 South Korea: Melon, Genie, FLO, Bugs
• 🇯🇵 Japan: AWA, Line Music, Recochoku
• 🇧🇷 Brazil: Deezer (dominant), Spotify

**Video:**
YouTube (full upload + Content ID — monetizes any video using your music)

**Podcast/Audiobook Platforms:** Available on request

You can distribute to all 150+ platforms at once or select specific ones. No extra charge per platform — everything is included in your subscription.`,
  },
  {
    keywords: ['isrc', 'isrc code', 'upc', 'barcode', 'release code', 'copyright', 'metadata'],
    category: 'distribution',
    relatedKeywords: ['distribution', 'release', 'copyright'],
    nextSteps: ['Make sure all metadata is correct before submitting', 'Register with a PRO for performance royalties', 'Keep your ISRC codes on file for future reference'],
    answer: `ISRC and UPC codes identify your music worldwide — Max Booster handles both automatically.

**ISRC (International Standard Recording Code):**
• Unique identifier for each individual recording/track
• Required for all streaming distribution
• Format: CC-XXX-YY-NNNNN (country, registrant, year, sequence)
• Max Booster auto-generates a valid ISRC for every track you distribute
• If you already have ISRCs (from a previous distributor), enter them manually in the metadata form — this ensures no duplicates in royalty reporting

**UPC/EAN Barcode:**
• Required for albums and EPs (not needed for singles in most cases)
• Auto-generated by Max Booster at no extra cost
• Tracks your release as a product across all stores

**Copyright:**
• Distributing through Max Booster does NOT affect your copyright
• You retain 100% of your publishing and master rights
• The ℗ (phonogram) and © (copyright) year are set to your release year automatically

**Metadata Best Practices:**
• Spell artist names consistently across all releases (affects search and discoverability)
• Always flag explicit content if your track contains it (platforms will take it down otherwise)
• Add featured artists in the "Featuring" field, not the title
• Genre selection impacts playlist editorial consideration — choose the most specific genre that fits`,
  },
  {
    keywords: ['cover art', 'artwork', 'album art', 'image requirements', 'art size', 'art specs', 'album cover'],
    category: 'distribution',
    relatedKeywords: ['distribution', 'release'],
    nextSteps: ['Create your art at 3000x3000px', 'Test visibility at thumbnail size', 'Submit your release after cover art is ready'],
    answer: `Cover art requirements for music distribution:

**Required Specifications:**
• Size: **3000×3000 pixels minimum** (square format, 1:1 ratio)
• Format: JPG or PNG
• Color space: RGB (not CMYK)
• File size: Under 10MB
• Resolution: 72 DPI minimum (300 DPI recommended for print-quality)

**Platform Content Rules (Rejection Causes):**
• No explicit imagery on artwork (even if track is marked explicit)
• No third-party logos, brand trademarks, or watermarks
• No URLs or social media handles
• No misleading artist names or chart positions ("#1 Billboard" etc.)
• No blurry, pixelated, or low-quality images

**Tips for Best Results:**
• Design at exactly 3000×3000 for sharpest output
• Test how it looks at 100×100 (thumbnail on mobile)
• Use a clean, bold design — this is the primary visual impression
• Avoid very thin fonts (they disappear at small sizes)
• High contrast between subject and background improves visibility

**Marketplace-specific:**
Beat marketplace thumbnails can be any dimension but square is recommended for consistency.`,
  },
  {
    keywords: ['playlist pitching', 'playlist', 'editorial playlist', 'spotify editorial', 'submit to playlist', 'pitch release', 'editorial consideration'],
    category: 'distribution',
    relatedKeywords: ['distribution', 'release', 'spotify', 'analytics'],
    nextSteps: ['Submit your pitch 7+ days before release date', 'Connect your Spotify for Artists account', 'Write a compelling pitch in the style description field'],
    answer: `Playlist Pitching submits your music directly to editorial playlist curators before your release date.

**How to Pitch:**
1. Go to **Playlist Pitching** in the sidebar
2. Select an upcoming release (must not yet be released)
3. Fill in the pitch form:
   - Mood and genre tags
   - Story behind the track (1–2 sentences)
   - Comparable artists (who you sound like)
   - What makes this track unique
4. Submit — pitches go to Spotify editorial, Apple Music editorial, and platform-specific curators

**Requirements:**
• Release must be scheduled, not yet live
• Pitch window: 7 days before release is the minimum (earlier is better)
• Only one pitch submission per release

**What curators look at:**
• Pitch quality (your description matters)
• Genre fit with existing playlist playlists
• Streaming history and listener loyalty ratio
• Whether you have other music already on the platform
• Audio quality and production value

**Independent Playlist Pitching:**
Max Booster also connects you with independent playlist curators (not just editorial). These are often easier to land and still drive significant streams.

**After Going Live:**
Track your playlist placements in Analytics → Playlists. Playlist adds typically spike streams within 48 hours.`,
  },
  {
    keywords: ['labelgrid', 'label distribution', 'distribution service', 'label submission', 'label portal', 'submit to label'],
    category: 'distribution',
    relatedKeywords: ['distribution', 'release', 'label'],
    nextSteps: ['Submit your best release to labels via the Label Submissions portal', 'Build your streaming stats before pitching to labels'],
    answer: `LabelGrid Integration allows you to submit your music to record labels and distributors directly from Max Booster.

**What LabelGrid provides:**
• Direct submission portal for 200+ independent labels
• A&R contact database
• Submission tracking (see status of each pitch)
• Label response management

**How to submit:**
1. Go to **Distribution → Label Submissions**
2. Select a release you want to submit
3. Browse the label directory and filter by genre
4. Click "Submit" on any label profile
5. Your release and streaming data are automatically included

**Tips for Label Submissions:**
• Build at least 10,000–50,000 monthly listeners before cold pitching labels
• Include your streaming analytics in your pitch
• Target labels that already sign artists in your genre
• Personalize your message — generic pitches are ignored

**Your stats are sent automatically:**
When you submit to a label through LabelGrid, your Max Booster analytics (streams, audience demographics, growth rate) are included — giving labels the data they need to evaluate you.`,
  },

  // ── ROYALTIES & PAYMENTS ──────────────────────────────────────────────────
  {
    keywords: ['royalties', 'royalty', 'payment', 'paid', 'when do i get paid', 'earnings', 'revenue', 'money', 'payout', 'income', 'how much', 'earnings dashboard'],
    category: 'royalties',
    relatedKeywords: ['payout', 'split', 'publishing', 'stripe', 'bank'],
    nextSteps: ['Connect your payout method in Settings → Billing', 'Set up a payout alert for when earnings hit $10', 'View platform-by-platform breakdown in Royalties dashboard', 'Set up royalty splits for future releases with collaborators'],
    answer: `Royalties flow from streaming platforms to your Max Booster account to your bank:

**Payment Timeline:**
• Streaming platforms report and pay royalties **60–90 days** after the month streams occur
• Example: January streams → paid to Max Booster by late March → paid to you in April
• Max Booster processes your earnings on a rolling monthly basis
• Minimum payout threshold: **$10 USD**

**You keep 100%** — Max Booster takes $0 commission on your streaming royalties.

**Tracking Your Earnings:**
1. Go to **Royalties** in the sidebar
2. Dashboard shows: total earnings, per-platform breakdown, per-song breakdown, territory breakdown
3. Filter by time period (last 7 days, 30 days, 3 months, all-time)
4. Export detailed reports (CSV or PDF) for your records/taxes

**Payout Methods:**
• Bank transfer (ACH — USA, direct to your bank)
• International wire transfer
• PayPal
• Stripe Connect (fastest, direct deposit)

**Setting up payouts:**
Go to Settings → Billing → Payment Methods → Add Payout Account

**Revenue Intelligence:**
The Revenue Intelligence dashboard predicts your next 30/90/180 days of earnings based on current growth trajectories — found under Analytics → Revenue Intelligence.`,
  },
  {
    keywords: ['royalty split', 'split royalties', 'collaborator', 'co-writer', 'featured artist', 'split payment', 'share revenue', 'revenue share'],
    category: 'royalties',
    relatedKeywords: ['royalties', 'collaboration', 'publishing', 'distribution'],
    nextSteps: ['Invite collaborators to accept their split before submitting', 'Download the split agreement PDF for your records', 'Set up publishing splits separately from master splits'],
    answer: `Royalty splits let you automatically share earnings with co-writers, producers, featured artists, and managers.

**How to Set Up Splits:**
1. Go to **Distribution → New Release** (or edit a pending release)
2. Click the **"Royalty Splits"** section
3. Add collaborators by their email address or Max Booster username
4. Assign percentages (must total exactly 100%)
5. Collaborators receive an email invitation to accept their split
6. Once accepted, royalties are distributed automatically each payment cycle

**Features:**
• Unlimited collaborators per release
• Real-time earnings tracking for each party (each person sees only their share)
• Each collaborator has their own payout settings and methods
• Change splits before release (locked after distribution goes live)
• Full payment history and statements per collaborator
• PDF split agreement generated automatically

**Pending splits:** If a collaborator hasn't accepted their split, their portion is held in escrow until they do. You can set a timeout period after which unclaimed splits revert to you.

**Publishing vs. Master splits:**
• Master (recording) splits — set in the distribution form
• Publishing (songwriting) splits — managed separately in Royalties → Publishing`,
  },
  {
    keywords: ['publishing', 'publishing rights', 'mechanical', 'performance rights', 'pro', 'ascap', 'bmi', 'songwriting royalties', 'sync', 'sync licensing'],
    category: 'royalties',
    relatedKeywords: ['royalties', 'distribution', 'copyright'],
    nextSteps: ['Register with a PRO (ASCAP, BMI, or SESAC)', 'Register all your released songs with your PRO', 'Check the Sync Licensing portal for placement opportunities'],
    answer: `Publishing royalties are separate from streaming royalties — here's how both work:

**Streaming (Master) Royalties:**
• Paid by platforms for streams of your recording
• Collected and paid through Max Booster distribution
• You keep 100%
• Reported in: Royalties → Streaming

**Publishing (Songwriting) Royalties:**
• Paid for the underlying composition (melody + lyrics)
• Two types: Mechanical royalties + Performance royalties
• Collected by PROs (Performing Rights Organizations)

**PROs you can register with:**
• ASCAP, BMI, or SESAC (USA)
• SOCAN (Canada)
• PRS (UK)
• APRA AMCOS (Australia)
• SACEM (France)
• GEMA (Germany)
• SIAE (Italy)

**Max Booster + Publishing:**
• Max Booster collects mechanical royalties through our distribution partners (for streaming)
• Register as a songwriter with a PRO for performance royalties (radio, TV, live performance)
• Our Royalties dashboard shows publishing earnings separately when connected

**Sync Licensing Portal:**
Earn publishing royalties by licensing your music to:
• TV shows, films, documentaries
• Commercials and brand campaigns
• Video games
• YouTube creators (Content ID)

Go to **Sync Licensing** in the sidebar to list your tracks for sync opportunities.

**Pro Tip:** Register every song with your PRO as soon as it's distributed — retroactive registration is possible but you may miss early earnings.`,
  },
  {
    keywords: ['instant payout', 'advance', 'cash advance', 'early payout', 'royalty advance', 'instant cash'],
    category: 'royalties',
    relatedKeywords: ['royalties', 'payment', 'stripe'],
    nextSteps: ['Check your advance eligibility in Royalties → Instant Payouts', 'Connect a verified payout method to unlock advances'],
    answer: `Instant Payouts let you access your earned royalties immediately, before the 60–90 day platform reporting cycle.

**How it works:**
1. Go to **Royalties → Instant Payouts**
2. See your available advance balance (based on projected earnings)
3. Request an advance of any amount up to your available balance
4. Funds land in your bank/PayPal within 1–2 business days
5. When the actual royalties arrive, they automatically reconcile

**Eligibility:**
• At least 3 months of distribution history
• Consistent streaming track record
• Verified payout method connected

**No fees for advances up to $500/month** on eligible plans. Larger advances have a small processing fee.

**Predictive earnings:**
Your advance eligibility is calculated using our AI revenue forecasting model, which analyzes your current streams, growth rate, and historical earning patterns to predict upcoming royalties.`,
  },

  // ── MARKETPLACE ───────────────────────────────────────────────────────────
  {
    keywords: ['marketplace', 'sell beats', 'beat store', 'storefront', 'list beat', 'upload beat', 'beat marketplace', 'sell samples', 'sell loops', 'sell presets', 'beat selling'],
    category: 'marketplace',
    relatedKeywords: ['license', 'stripe', 'storefront', 'pricing', 'revenue'],
    nextSteps: ['Set up your Stripe Connect account to receive payments', 'Create your storefront branding (logo, banner, colors)', 'Price your beats competitively ($20–$50 for leases, $200+ for exclusives)', 'Upload a watermarked preview MP3 to attract buyers'],
    answer: `The Max Booster Marketplace is your built-in beat store — zero platform fees.

**Set Up Your Storefront:**
1. Go to **Marketplace** in the sidebar
2. Click **"Create Storefront"**
3. Customize: display name, bio, logo, colors, banner image
4. Get your custom URL: \`yourname.maxbooster.app\`
5. Connect Stripe Connect for payment processing (one-time setup, takes 2 minutes)

**Uploading Products:**
1. Click **"Add Product"**
2. Upload your beat/sample/preset file (high quality WAV)
3. Upload a watermarked preview MP3 (plays in browser before purchase)
4. Set your pricing tiers:
   - **Basic Lease** — non-exclusive, limited streams/downloads
   - **Premium Lease** — more usage rights
   - **Exclusive Rights** — full ownership transfer, removes from store
5. Attach license terms (use our built-in templates or customize)
6. Add tags, genre, BPM, key for discoverability
7. Publish

**What you can sell:**
• Beats (any genre)
• Sample packs and loop kits
• One-shots and drum kits
• VST/plugin presets
• Stem packs and track-outs
• Acapella files

**Pricing Psychology:**
• Basic Lease: $19.99–$49.99 (most conversions here)
• Premium Lease: $49.99–$149.99
• Exclusive: $299–$999+ (position as premium)

**You keep 100%** (minus Stripe processing: ~2.9% + $0.30 per transaction).`,
  },
  {
    keywords: ['license', 'licensing', 'exclusive', 'non-exclusive', 'lease', 'exclusive rights', 'beat license', 'music license', 'license terms', 'license template'],
    category: 'marketplace',
    relatedKeywords: ['marketplace', 'sell', 'beat'],
    nextSteps: ['Use the built-in license template editor to customize your terms', 'Set stream and download limits per license tier', 'Specify whether the buyer must credit you'],
    answer: `Max Booster supports all standard music licensing tiers for the marketplace:

**License Types:**

**Non-Exclusive Lease (most common):**
• Buyer gets limited usage rights for the specific licensing period
• You can resell the same beat to multiple buyers indefinitely
• Limits set per license tier (streams, downloads, performance use)
• Must credit producer (configurable)

**Basic Lease (example defaults):**
• Up to 100,000 streams
• 5,000 downloads/copies
• Non-commercial performance only
• Must credit producer

**Premium Lease (example defaults):**
• Up to 500,000 streams
• Unlimited digital downloads
• Monetized YouTube/streaming use
• Minimal or no producer credit required

**Unlimited Lease:**
• Unlimited streams and copies
• Full digital distribution rights
• No credit required

**Exclusive Rights:**
• Buyer receives sole ownership of the recording rights
• Beat is automatically removed from your store after purchase
• You may retain publishing/writing rights (configurable per listing)
• Typically priced 10–100× the lease price

**Custom Licensing:**
• Set your own limits and terms per product in the Marketplace → License Editor
• All licenses auto-generate as PDF and are emailed to the buyer after purchase
• License history is stored in your account for legal protection`,
  },
  {
    keywords: ['storefront', 'custom store', 'beat store setup', 'store branding', 'custom url', 'store link', 'promote store'],
    category: 'marketplace',
    relatedKeywords: ['marketplace', 'sell', 'stripe', 'social media'],
    nextSteps: ['Share your storefront URL on all social media profiles', 'Enable the Social Media Autopilot to auto-promote your beats', 'Add your storefront link to your press kit'],
    answer: `Your Max Booster Storefront is your own professional beat/music store.

**Storefront Customization:**
• **URL:** \`yourartistname.maxbooster.app\` — fully custom, branded
• **Logo:** Upload your logo (PNG with transparency recommended)
• **Banner:** 1920×400px header image
• **Color Scheme:** Pick primary, accent, and background colors
• **Bio:** Tell producers/artists about your style
• **Social Links:** Link your Instagram, Twitter, YouTube, etc.
• **Custom Domain:** Connect your own domain (e.g., \`beats.yourname.com\`)

**Store Features:**
• Built-in audio player for previews
• Cart system (multi-beat checkout in one transaction)
• Automated license delivery after payment
• Discount codes and promo links
• Sales analytics (views, plays, conversion rate, revenue)
• Bundle deals (buy 3 beats, get 10% off)

**Promoting Your Storefront:**
• Share your store link in Instagram bio, Twitter bio, YouTube channel art
• Use the Social Media Autopilot to automatically post beat previews
• Enable "New Beat" auto-posts — every time you upload, your followers know
• The Advertising Autopilot can run beat promotion campaigns with zero ad spend`,
  },

  // ── SOCIAL MEDIA & AUTOPILOT ──────────────────────────────────────────────
  {
    keywords: ['social media', 'social', 'autopilot', 'auto post', 'automatic posting', 'instagram', 'twitter', 'tiktok', 'facebook', 'youtube', 'post automatically', 'social media autopilot', 'auto posting'],
    category: 'social',
    relatedKeywords: ['connect account', 'schedule', 'content', 'advertising', 'analytics'],
    nextSteps: ['Connect your social accounts via OAuth', 'Set your posting frequency (start with 1–2x/day)', 'Upload your music for content generation', 'Turn on the AI caption writer for platform-optimized text'],
    answer: `The Social Media Autopilot runs 24/7 and manages your entire social presence using our in-house AI.

**What it does automatically:**
• Creates platform-optimized content from your music catalog
• Posts on a smart schedule based on your audience's peak activity times
• Writes captions, hashtags, and calls to action per platform
• Adapts tone and format per platform:
  - Instagram: visual-first, carousel and Reels hooks
  - TikTok: trend-aware hooks, music-synced timing cues
  - Twitter/X: punchy, shareable text threads
  - Facebook: community-focused, longer narrative
  - YouTube: SEO-optimized descriptions and titles
  - LinkedIn: professional artist/creator framing

**Platforms supported:**
Instagram, Twitter/X, Facebook (Pages), YouTube, TikTok, LinkedIn, Threads

**Setting up:**
1. Go to **Social Media** in the sidebar
2. Connect your accounts (OAuth — we never store your passwords)
3. Set your posting frequency (1–5 posts per day per platform)
4. Upload music or let the AI pull from your existing catalog
5. Preview generated content before it goes live (optional)
6. Turn on Autopilot — it handles everything from there

**Content types generated:**
• Beat/track previews (short audio clips)
• Behind-the-scenes studio content
• Engagement posts (polls, questions, fan shoutouts)
• Release announcements and countdown posts
• Trending sound/hashtag participation
• Milestone celebrations

The AI learns from your engagement data — content improves automatically over time as it sees what resonates with your audience.`,
  },
  {
    keywords: ['connect account', 'connect instagram', 'connect twitter', 'connect tiktok', 'oauth', 'link account', 'social account', 'connect facebook', 'connect youtube'],
    category: 'social',
    relatedKeywords: ['social media', 'autopilot', 'posting'],
    nextSteps: ['Enable Autopilot after connecting accounts', 'Set your posting preferences per platform', 'Connect analytics to measure performance'],
    answer: `Connecting your social media accounts to Max Booster:

**Steps:**
1. Go to **Settings → Connected Accounts** (or Social Media page → Accounts tab)
2. Click **"Connect"** next to each platform
3. You'll be redirected to the platform's official OAuth login page
4. Authorize Max Booster — we only get posting and analytics permissions
5. Return to Max Booster — account is linked and ready

**Platform-specific notes:**
• **Instagram:** You must have a Creator or Business account (not Personal). Connect via Facebook Page — this is Instagram's requirement, not ours.
• **TikTok:** Supports both sandbox and live posting modes. Sandbox mode queues posts as drafts for your review before they go live.
• **YouTube:** Uses your Google account. Only the channels you own are accessible.
• **Twitter/X:** Supports multi-account connection (different profiles)
• **Facebook:** Connect your Facebook Page (not personal profile) to post

**What permissions we request:**
• Create posts/videos on your behalf ✓
• Read your analytics and engagement ✓
• Read follower/following count ✓
• We CANNOT: read DMs, access passwords, or see followers' private data

**Token expiration:**
• Instagram/Facebook: 60 days (auto-refresh)
• Twitter: 30 days (auto-refresh)
• TikTok: 24 hours (auto-refresh)
• YouTube: Non-expiring (revoke manually if needed)

**Troubleshooting:** If a connection fails, log into the platform directly first, then retry the OAuth flow.`,
  },
  {
    keywords: ['post schedule', 'when to post', 'best time', 'posting time', 'schedule post', 'optimal time', 'timing', 'posting frequency'],
    category: 'social',
    relatedKeywords: ['social media', 'autopilot', 'analytics'],
    nextSteps: ['Enable AI-Optimized Timing for automatic best-time selection', 'Review your past post performance to refine timing', 'Set blackout windows for holidays and off-hours'],
    answer: `Max Booster's AI calculates optimal posting times for your specific audience — not generic industry averages.

**How the Timing AI works:**
• Analyzes your historical post performance by hour and day of week
• Models your specific audience's timezone distribution
• Cross-references platform-wide peak hours for your exact genre
• Recommends a personalized schedule updated weekly
• Learns continuously — improves as your audience grows

**General starting windows (before AI calibration):**
• **Instagram:** Tue–Fri, 11am–1pm and 7pm–9pm (local time)
• **TikTok:** Tue, Thu, Fri, 7am–9am and 7pm–11pm
• **Twitter/X:** Mon–Wed, 9am–12pm; Fri 9am–10am
• **YouTube:** Thu–Sat, 2pm–4pm and 8pm–11pm
• **Facebook:** Wed–Sun, 1pm–3pm

**Customizing your schedule:**
1. Go to **Social Media → Schedule**
2. Enable "AI-Optimized Timing" for automatic best-time selection
3. Or set manual time slots if you prefer fixed windows
4. Set "Do Not Post" blackout periods (e.g., late night, holidays)
5. Set posting frequency per platform (e.g., 2x/day Instagram, 4x/day TikTok)

**Release strategy:**
For a new release, use "Burst Mode" — the AI posts 5–8x more frequently in the 48 hours around your release date to maximize initial momentum.`,
  },
  {
    keywords: ['content calendar', 'plan posts', 'posting plan', 'content plan', 'schedule content', 'bulk schedule'],
    category: 'social',
    relatedKeywords: ['social media', 'autopilot', 'schedule'],
    nextSteps: ['Review and approve queued content in the Content Calendar', 'Upload assets in bulk for the AI to repurpose', 'Set a release countdown schedule for your next drop'],
    answer: `The Content Calendar gives you a visual overview and control over all scheduled and auto-generated content.

**How to use:**
1. Go to **Social Media → Content Calendar**
2. See a month/week/day view of all scheduled posts
3. Click any post to preview, edit, or delete it
4. Drag posts to reschedule them
5. Add manual posts by clicking any empty time slot

**Bulk Upload:**
• Upload 30–90 days of content at once (images, videos, audio clips)
• The AI writes captions for all of them simultaneously
• Review in bulk before scheduling (Approve All or per-post)

**Content Types in Calendar:**
• 🟢 Auto-generated (AI created)
• 🔵 Manual (you created)
• 🟡 Pending approval (needs your review before posting)
• 🔴 Failed (needs attention — connection issue or platform error)

**Collaboration Queue:**
If you have a social media manager, give them Editor access to the content calendar — they can create and approve posts without touching your account credentials.`,
  },

  // ── ADVERTISING AUTOPILOT ─────────────────────────────────────────────────
  {
    keywords: ['advertising', 'ad campaign', 'advertising autopilot', 'organic ads', 'zero cost', 'growth', 'promote music', 'marketing', 'ad spend', 'viral', 'promote', 'grow fans'],
    category: 'advertising',
    relatedKeywords: ['social media', 'analytics', 'ab test', 'campaign'],
    nextSteps: ['Create your first campaign and set an objective (Awareness vs. Streams)', 'Connect your social accounts so the AI can execute campaigns', 'Review your A/B test results after 72 hours', 'Set a release date campaign for your next drop'],
    answer: `The Advertising Autopilot is Max Booster's zero-cost organic growth engine — it replicates paid ad results using purely organic strategy.

**Core Philosophy:**
Traditional ad platforms charge $5–$50+ per 1,000 views. Our AI achieves the same reach by understanding and exploiting platform algorithms organically — at zero ongoing cost.

**How the AI works:**
1. Analyzes platform algorithms (Instagram Explore, TikTok FYP, YouTube Recommendations)
2. Identifies the content patterns that trigger organic amplification (equivalent to what paid ads achieve)
3. Executes "burst sequencing" — coordinated multi-platform posting that creates viral velocity
4. Continuously A/B tests content styles and adapts to what performs best for your specific audience

**Campaign Objectives:**
• **Awareness** — maximize reach and impressions
• **Engagement** — maximize likes, comments, shares
• **Fan Growth** — maximize follower acquisition
• **Streams** — maximize Spotify/Apple Music streams
• **Sales** — maximize Marketplace beats sold

**Setting up a campaign:**
1. Go to **Advertising** in the sidebar
2. Click **"Create Campaign"**
3. Select your campaign objective
4. Set your target audience (genre fans, location, age range, demographics)
5. Select target platforms
6. Activate — AI handles all execution

Results typically begin showing within **72 hours** of activation.

**Results tracking:**
• Real-time performance dashboard
• Platform-by-platform attribution
• Stream lift measurement (campaign-attributable streams)
• Follower growth attribution
• Content performance breakdown by variation`,
  },
  {
    keywords: ['ab test', 'a/b test', 'test content', 'which post performs', 'content test', 'split test', 'variant', 'best content'],
    category: 'advertising',
    relatedKeywords: ['advertising', 'social media', 'content'],
    nextSteps: ['Wait 48–72 hours for sufficient test data', 'Apply the winning variant to future campaigns', 'Test your thumbnail variations next after captions'],
    answer: `A/B testing in the Advertising Autopilot finds what content drives the most growth for your specific audience.

**What gets tested automatically:**
• Hook text (first line of captions — determines if someone stops scrolling)
• Thumbnail / cover image variations (critical for YouTube and TikTok)
• Posting time slots (sometimes a 2-hour shift changes everything)
• Caption length (short punchy vs. long storytelling)
• Hashtag sets (different combinations)
• Call-to-action phrasing ("Stream now" vs. "Listen below" vs. "Out now")
• Emoji usage and placement
• Music clip section used (hook vs. verse vs. drop)

**How the test runs:**
• AI creates 2–4 variations of each content element
• Each variation is posted during an equal test window (48–72 hours)
• Engagement, reach, and conversion metrics are tracked per variant
• Statistical significance threshold: 95% confidence before declaring a winner
• The winning variant becomes the template for future posts
• Tests repeat continuously — content quality improves week over week

**Viewing results:**
Go to **Advertising → Campaigns → [Campaign Name] → A/B Results**
• See side-by-side comparison of all variants
• Click any variant to see its full metrics
• Export test results to CSV

**Manual A/B tests:**
You can also set up custom A/B tests in the Content Calendar — create two versions of a post and the system will track which performs better.`,
  },

  // ── ANALYTICS ─────────────────────────────────────────────────────────────
  {
    keywords: ['analytics', 'stats', 'statistics', 'performance', 'streams', 'listeners', 'plays', 'views', 'data', 'insights', 'dashboard', 'metrics', 'audience'],
    category: 'analytics',
    relatedKeywords: ['royalties', 'social media', 'distribution', 'revenue intelligence'],
    nextSteps: ['Filter by platform to see which drives most streams', 'Check audience demographics to inform content strategy', 'Enable revenue intelligence for earnings prediction', 'Connect Spotify for Artists for more granular data'],
    answer: `The Analytics dashboard gives you a complete view of your music career performance in one place.

**Dashboard Overview:**
• **Total Streams** — cumulative and period-specific (today, 7d, 30d, all-time)
• **Monthly Listeners** — unique listeners per month
• **Playlist Adds** — how many playlists your songs appear on
• **Revenue** — total earnings and platform breakdown
• **Audience Geography** — top countries, cities, listener demographics
• **Growth Rate** — week-over-week and month-over-month metrics

**Per-Track Analytics:**
• Stream count by platform
• Save rate (saves/streams — industry benchmark: >5% is strong)
• Skip rate (what % of listeners skip before 30 seconds)
• Playlist reach
• Peak chart position (if applicable)

**Platform Analytics:**
• See streams broken down by: Spotify, Apple Music, YouTube, TikTok, etc.
• Engagement rates per social post
• Video views, watch time, and subscriber conversions (YouTube)
• Click-through rates from social posts to streaming

**Revenue Intelligence:**
AI-powered earnings forecasting — go to Analytics → Revenue Intelligence to see:
• Projected earnings for next 30/90/180 days
• Earnings by release, by platform, by territory
• "If you grow X% per month" scenario modeling

**Certified Analytics (for label pitches):**
Export a certified analytics report — a professionally formatted PDF with your verified streaming statistics, suitable for presenting to labels, sync supervisors, and press.`,
  },
  {
    keywords: ['audience', 'demographics', 'listeners', 'fans', 'who listens', 'audience data', 'listener data', 'age', 'location', 'geography'],
    category: 'analytics',
    relatedKeywords: ['analytics', 'social media', 'advertising', 'content'],
    nextSteps: ['Use audience data to target your Advertising Autopilot campaigns', 'Adjust content language/style based on top country', 'Schedule posts in the timezone of your largest audience'],
    answer: `Audience Analytics reveals exactly who your listeners are and where they come from.

**Demographic Breakdown:**
• **Age groups:** 13–17, 18–24, 25–34, 35–44, 45–54, 55+
• **Gender:** Male, Female, Other/Non-binary
• **Top Countries:** Up to 25 countries ranked by listener count
• **Top Cities:** Metropolitan areas with highest listener concentration
• **Languages:** Listening language preference

**Discovery Methods:**
• How new listeners find your music: algorithmic recommendations, playlists, direct search, social media referral, friend shares
• Platform source: which platform drives the most new listeners

**Listener Loyalty:**
• **Super fans** — listen to 3+ of your tracks regularly
• **Casual fans** — listen occasionally
• **New listeners** — first-time hearers this month
• **Churned listeners** — haven't streamed in 60+ days

**Using Audience Data:**
• Genre fans in specific cities → pitch local venues and blogs
• 18–24 demographic → optimize for TikTok and Instagram Reels
• Strong international presence → pitch to international playlist curators
• Low save rate → your hook isn't connecting, A/B test intro variations`,
  },
  {
    keywords: ['executive dashboard', 'career overview', 'career score', 'health score', 'career metrics', 'overall performance'],
    category: 'analytics',
    relatedKeywords: ['analytics', 'revenue', 'social media', 'distribution'],
    nextSteps: ['Review your Career Health Score weekly', 'Take suggested actions from the career coach', 'Export your certified analytics report'],
    answer: `The Executive Dashboard gives you a bird's-eye view of your entire music career in one screen.

**What's on the Executive Dashboard:**
• **Career Health Score** — composite score (0–100) across: streaming growth, social engagement, revenue, release consistency, audience retention
• **Total Career Revenue** — lifetime and trending
• **Cross-Platform Follower Total** — combined following across all connected platforms
• **Release Timeline** — visual history of all your releases and their performance
• **Top Performing Track** — your best all-time track by streams
• **Growth Velocity** — how fast your career is accelerating (streams per new follower)

**Career Health Score Breakdown:**
• Streaming growth rate (30%)
• Social media engagement rate (20%)
• Revenue growth (20%)
• Release cadence (15%) — how consistently you're releasing
• Audience retention (15%) — are people coming back?

**Alerts and Recommendations:**
• "Your save rate dropped 30% on last release — try a different intro hook"
• "Your audience is most active in LA — consider a local show"
• "Your revenue is on track for $X this month"
• Actionable insights updated daily based on your latest data`,
  },

  // ── CAREER TOOLS ──────────────────────────────────────────────────────────
  {
    keywords: ['career coach', 'career advice', 'career plan', 'music career', 'grow career', 'career strategy', 'what should i do next'],
    category: 'career',
    relatedKeywords: ['analytics', 'advertising', 'distribution', 'social media'],
    nextSteps: ['Complete your career profile for personalized coaching', 'Set a 6-month career goal in the Career Coach', 'Review your Weekly Action Plan every Monday'],
    answer: `The Career Coach is Max Booster's AI-driven career management system that creates personalized roadmaps for your music career.

**What it does:**
• Analyzes your current stats, catalog, audience, and revenue
• Creates a personalized 30/90/180-day action plan
• Assigns weekly tasks with priority rankings
• Tracks completion and adjusts plans based on results

**Setting Up Your Career Plan:**
1. Go to **Career Coach** in the sidebar
2. Complete your artist profile (genre, career stage, goals)
3. Connect your streaming accounts for baseline data
4. Set your primary goal (fan growth, revenue, label deal, sync placements, etc.)
5. The AI generates your initial roadmap in under 60 seconds

**Weekly Action Plans include:**
• Release strategy recommendations
• Social media content assignments
• Playlist pitching targets
• Industry networking opportunities
• Revenue optimization actions
• Health/wellbeing reminders (career longevity focus)

**Career Phases:**
The Coach adapts to your stage:
• **Emerging** — building first 1,000 listeners
• **Independent** — 1K–50K monthly listeners
• **Rising** — 50K–500K monthly listeners
• **Established** — 500K+ monthly listeners, revenue focus
• **Major-ready** — label pitch preparation mode`,
  },
  {
    keywords: ['press kit', 'epk', 'electronic press kit', 'bio', 'artist bio', 'press materials', 'media kit'],
    category: 'career',
    relatedKeywords: ['career', 'distribution', 'analytics'],
    nextSteps: ['Add your best photos and streaming data to your EPK', 'Share your EPK link when pitching to blogs and venues', 'Update your EPK after each major release'],
    answer: `The Press Kit (EPK) builder creates a professional media package for blogs, venues, labels, and sync supervisors.

**What's in your EPK:**
• Artist bio (short, medium, and long versions)
• Professional photos (upload up to 20 high-res images)
• Streaming statistics (auto-pulled from your analytics — certified figures)
• Top tracks with embedded audio player
• Music videos
• Press quotes and reviews
• Upcoming shows/tour dates
• Contact/booking information
• Social media links with live follower counts

**Building your EPK:**
1. Go to **Career → Press Kit**
2. Fill in your bio (the AI can help write it — click "AI Bio Writer")
3. Upload professional photos
4. Select which tracks to feature
5. Your streaming stats populate automatically from your analytics
6. Publish — you get a shareable link: \`maxbooster.app/epk/yourname\`

**EPK Analytics:**
• See who viewed your EPK and for how long
• Which sections they engaged with most
• Geography of viewers
• Referral source (where the link was clicked from)

**Sharing your EPK:**
• Send the link directly to blogs, labels, venues, sync agencies
• Embed on your own website
• Add to your email signature
• Include in grant applications and festival submissions`,
  },
  {
    keywords: ['tour', 'shows', 'venues', 'booking', 'gigs', 'live performance', 'concert', 'tour management', 'booking agent'],
    category: 'career',
    relatedKeywords: ['career', 'analytics', 'press kit'],
    nextSteps: ['Add your upcoming shows to the Tour Manager', 'Share show dates via the Social Media Autopilot', 'Add venue contacts to your CRM'],
    answer: `The Tour Manager and Venue CRM help you organize your live performance business.

**Tour Manager:**
• Add upcoming shows (date, venue, city, ticket link, set time)
• Track performance fees and expenses per show
• Manage tour budgets and profit/loss
• View all shows on a map/calendar view
• Share tour dates with your social media automatically

**Venue & Booking CRM:**
• Database of venue contacts (buyer name, email, capacity, genre fit)
• Track outreach status (contacted, interested, booked, performed)
• Note history for each venue contact
• Set follow-up reminders
• Star-rate venues for rebooking priority

**Booking Outreach:**
• The AI generates customized booking pitches for each venue
• Pitch includes: your EPK link, streaming stats, genre fit, suggested fee
• Track which pitches get responses and convert to bookings

**Set List Builder:**
• Create and save set lists for different show lengths (30min, 45min, 60min)
• Track which songs work best live (based on crowd response notes you add)
• Generate PDF set lists to share with your band`,
  },
  {
    keywords: ['sync licensing', 'sync', 'tv', 'film', 'commercial', 'music supervisor', 'sync placement', 'license for film', 'brand deal'],
    category: 'career',
    relatedKeywords: ['publishing', 'royalties', 'career'],
    nextSteps: ['List your top tracks in the Sync Licensing portal', 'Tag tracks accurately (mood, tempo, instrumentation) for supervisor search', 'Register your publishing with a PRO to collect sync performance royalties'],
    answer: `The Sync Licensing portal connects your music with TV shows, films, ads, and games.

**What sync licensing earns:**
• **Upfront sync fee** — paid when your music is licensed ($100–$50,000+ depending on placement)
• **Backend performance royalties** — paid every time the content airs (via your PRO)

**Setting up for sync:**
1. Go to **Sync Licensing** in the sidebar
2. Add tracks to your sync catalog
3. Tag each track accurately:
   - Mood (tense, uplifting, melancholic, epic, etc.)
   - Tempo (BPM)
   - Instrumentation (vocals, instrumental, orchestra, etc.)
   - Scene type (action, romance, corporate, sports, etc.)
   - Lyrics (none, minimal, prominent)
4. Set your licensing fees (or leave open to negotiation)
5. Music supervisors can browse and license directly

**Music Supervisor Search:**
Supervisors search by: genre, mood, tempo, vocal presence, instrumentation, era. The more accurately you tag, the more discoverable your music is.

**Exclusivity Options:**
• Non-exclusive sync: Same track can be licensed to multiple projects simultaneously
• Exclusive sync (rare): One project gets sole rights for a period — commands higher fee

**Instrumental Versions:**
Always upload instrumental versions of your tracks — many placements prefer instrumentals. You can create them in Studio (mute vocal track, export).`,
  },
  {
    keywords: ['songwriter', 'songwriting', 'lyric', 'lyrics', 'verse', 'chorus', 'song structure', 'write song', 'co-write'],
    category: 'career',
    relatedKeywords: ['studio', 'publishing', 'career'],
    nextSteps: ['Save your lyrics to the Songwriting workspace', 'Register finished songs with your PRO for publishing royalties', 'Collaborate on lyrics with co-writers via the collaboration feature'],
    answer: `The Songwriting workspace helps you write, organize, and develop your songs.

**Songwriting Features:**
• **Lyric editor** — write and format verses, choruses, bridges with color-coding
• **Rhyme assistant** — AI suggests rhymes and near-rhymes as you write
• **Chord sheet** — pair lyrics with chord progressions
• **Song structure templates** — classic pop, hip-hop, R&B, folk, EDM structures
• **Version history** — every draft saved automatically, revert anytime
• **Collaborator mode** — co-write in real-time with another user

**AI Co-Writing Tools:**
• **Line completion** — finish a lyric line based on your rhyme scheme and theme
• **Hook generator** — suggest hook variations based on your song's mood and tempo
• **Concept expansion** — give a theme, AI generates 3–5 concept directions
• **Structural suggestions** — "your pre-chorus feels weak, try these alternatives"

**Note:** All lyrics you write are 100% yours — the AI suggests but you own every word you keep.

**Songwriting Analytics:**
Track your productivity: songs written per month, average completion rate, genre distribution of your catalog.`,
  },
  {
    keywords: ['sample clearance', 'sample', 'clear sample', 'sample permission', 'copyright clearance', 'sample approval'],
    category: 'career',
    relatedKeywords: ['publishing', 'distribution', 'copyright'],
    nextSteps: ['Submit your sample for clearance before distributing', 'Use the AI generator to create original elements instead of sampling'],
    answer: `The Sample Clearance portal helps you legally clear samples before distributing music.

**What you need to clear:**
• Any recognizable portion of another recording (master clearance)
• Any recreation of an existing melody or chord progression protected by copyright (publishing/composition clearance)
• Even 1–2 seconds of a recognizable sample requires clearance

**Two types of clearance:**
1. **Master Rights** — permission from whoever owns the original recording (usually a label)
2. **Publishing Rights** — permission from whoever owns the composition (songwriter/publisher)

**Using the Sample Clearance portal:**
1. Go to **Career → Sample Clearances**
2. Submit the details: original artist, song title, sample start time, how you used it
3. The system identifies the rights holders automatically (powered by music databases)
4. Submit a clearance request directly through the portal
5. Track status (pending, approved, rejected, negotiating)

**What happens if you sample without clearance:**
• Your release may be rejected by distributors
• Platforms may take down your music
• Copyright holder can sue for infringement

**Alternative:** If clearance is denied or too expensive, use the Studio's AI Generator to create a similar original element — legally yours from the start.`,
  },
  {
    keywords: ['project budget', 'budget', 'production cost', 'music budget', 'spending', 'studio budget', 'album budget'],
    category: 'career',
    relatedKeywords: ['career', 'royalties', 'revenue'],
    nextSteps: ['Add all your production expenses to track ROI on each release', 'Compare budgets vs. revenue in the Analytics dashboard'],
    answer: `Project Budget Management helps you track the financial performance of each release.

**What to track:**
• Studio recording costs
• Mixing and mastering fees (or the value of your time using Max Booster tools)
• Music video production
• Promotion and marketing spend (ads, PR)
• Featured artist fees
• Sample clearance costs
• Distribution costs (Max Booster subscription allocation)
• Artwork/design costs

**How to use:**
1. Go to **Career → Project Budgets**
2. Create a budget for each release or project
3. Add line items with amounts and dates
4. Tag expenses by category
5. The dashboard shows: total spent, revenue earned, ROI percentage

**ROI Calculation:**
If your release cost $500 to make and has earned $750 in royalties + $200 in Marketplace sales, your ROI is 90%.

**Budget Templates:**
• Single release (low budget)
• EP production (medium budget)
• Album (full production)
• Music video
• Tour/live shows

This data helps you make smarter investment decisions across your catalog.`,
  },

  // ── SUBSCRIPTIONS & BILLING ──────────────────────────────────────────────
  {
    keywords: ['subscription', 'plan', 'pricing', 'price', 'cost', 'monthly', 'yearly', 'lifetime', 'upgrade', 'downgrade', 'free trial'],
    category: 'account',
    relatedKeywords: ['billing', 'payment', 'cancel', 'stripe'],
    nextSteps: ['View your current plan in Settings → Billing', 'Upgrade to unlock additional concurrent distribution releases', 'Set up autopay to avoid interruptions'],
    answer: `Max Booster offers flexible plans built for serious artists at every stage of their career.

**Plan Structure:**
All plans include the complete Max Booster feature set. Plans differ by usage limits and priority access.

**What's included in every plan:**
• Full Studio DAW (unlimited projects)
• Music distribution to 150+ platforms (you keep 100% royalties)
• Social Media Autopilot (all platforms)
• Advertising Autopilot (unlimited campaigns)
• AI mixing, mastering, and generation
• Beat Marketplace (unlimited listings)
• Analytics dashboard with revenue intelligence
• Career Coach with personalized roadmaps
• Press Kit builder
• Playlist pitching
• Sync Licensing portal
• Tour Manager & Venue CRM
• Songwriting workspace
• Sample Clearance portal
• Priority support (4-hour response)

**Billing cycle options:**
• Monthly — maximum flexibility
• Annual — significant savings vs. monthly
• Lifetime — one-time payment, all future updates included

**No hidden fees:**
• $0 distribution commission
• $0 per-release charges
• $0 marketplace commission (only Stripe processing applies)
• $0 feature unlocks or add-ons

**Managing your subscription:**
Go to **Settings → Billing** to: view your current plan, update payment method, upgrade/downgrade, or cancel.

For current specific pricing, visit the Pricing page or contact our support team.`,
  },
  {
    keywords: ['cancel', 'cancellation', 'cancel subscription', 'stop subscription', 'end plan', 'pause subscription'],
    category: 'account',
    relatedKeywords: ['subscription', 'billing', 'refund'],
    nextSteps: ['Download your data before canceling', 'Check your pending royalties before canceling — they still get paid out', 'Consider pausing instead of canceling if it\'s temporary'],
    answer: `Canceling or pausing your Max Booster subscription:

**How to cancel:**
1. Go to **Settings → Billing**
2. Click **"Manage Subscription"**
3. Select **"Cancel Subscription"**
4. Confirm — your subscription ends at the current billing period

**What happens after cancellation:**
• Your account stays active until your current period ends
• Your music stays live on streaming platforms after cancellation
• Royalties continue to be paid out (they're yours — we collect them for up to 12 months)
• Your Studio projects are preserved for 90 days (download them before this period expires)
• Your Beat Marketplace storefront goes offline (can reactivate when you resubscribe)

**Pausing instead of canceling:**
If you need a break but plan to return, you can pause your subscription for 1–3 months — your data, projects, and settings are fully preserved.

**Refund policy:**
• Monthly plans: No refunds for partial months (but can cancel and keep access until period ends)
• Annual plans: Pro-rated refund available within 30 days of purchase
• Contact support with any billing disputes

**Your royalties are always yours:**
Even if you cancel, Max Booster continues collecting and paying out royalties from your distributed music for up to 12 months after cancellation.`,
  },

  // ── ACCOUNT & SECURITY ────────────────────────────────────────────────────
  {
    keywords: ['password', 'reset password', 'forgot password', 'change password', 'login issue', 'cant login', 'locked out', 'sign in'],
    category: 'account',
    relatedKeywords: ['2fa', 'security', 'account'],
    nextSteps: ['Enable 2FA after resetting your password for better security', 'Add a backup email in case of lockout'],
    answer: `Help with password and login issues:

**Forgot your password:**
1. Go to the login page
2. Click **"Forgot Password"**
3. Enter your email address
4. Check your inbox for a reset link (check spam/junk if not found within 5 minutes)
5. Click the link and create a new strong password
6. Reset links expire after 1 hour — request a new one if needed

**Changing your password (while logged in):**
1. Go to **Settings → Security**
2. Click **"Change Password"**
3. Enter your current password, then your new password
4. Confirm — you'll stay logged in on your current device

**Strong password requirements:**
• Minimum 12 characters
• Mix of uppercase, lowercase, numbers, and symbols
• Don't reuse passwords from other sites
• Use a password manager (1Password, Bitwarden, etc.)

**Two-Factor Authentication (2FA):**
• Enable in **Settings → Security → Two-Factor Authentication**
• Use any TOTP app (Google Authenticator, Authy, 1Password)
• Store your backup codes somewhere safe

**Account temporarily locked:**
After multiple failed login attempts, your account temporarily locks for 15 minutes as a security measure. Wait 15 minutes or contact support to unlock immediately.`,
  },
  {
    keywords: ['delete account', 'close account', 'remove account', 'deactivate', 'terminate account'],
    category: 'account',
    relatedKeywords: ['data', 'privacy', 'cancel', 'gdpr'],
    nextSteps: ['Download all your Studio projects before requesting deletion', 'Collect any pending earnings (must be above $10 threshold)', 'Save your royalty reports and split agreements'],
    answer: `To delete your Max Booster account:

1. Go to **Settings → Account**
2. Scroll to "Danger Zone" and click **"Delete Account"**
3. Read the confirmation carefully
4. Confirm by typing your password
5. Your account enters a **30-day grace period**

**During the 30-day grace period:**
• Your account is deactivated but all data is preserved
• You can cancel the deletion and reactivate at any time
• Your music stays live on streaming platforms during this period

**After 30 days:**
• All personal data is permanently deleted (GDPR Article 17 compliance)
• Your distributed music will be taken down from all platforms within 7 days
• Pending royalties are paid out before deletion completes

**Important — do this BEFORE deleting:**
• Download all Studio projects (File → Export each project)
• Export your analytics data (Analytics → Export)
• Download royalty reports (Royalties → Export → CSV)
• Save your split agreements (Royalties → Splits → Download PDFs)
• Collect any pending earnings above the $10 payout threshold`,
  },
  {
    keywords: ['2fa', 'two factor', 'authenticator', 'mfa', 'security', 'two-factor authentication', 'backup codes'],
    category: 'account',
    relatedKeywords: ['password', 'account', 'security'],
    nextSteps: ['Download your backup codes and store them safely', 'Add 2FA to your authenticator app (Google Authenticator, Authy)', 'Enable login notifications for new device detection'],
    answer: `Two-factor authentication (2FA) adds a critical layer of security to your Max Booster account.

**Setting up 2FA:**
1. Go to **Settings → Security → Two-Factor Authentication**
2. Click **"Enable 2FA"**
3. Scan the QR code with your authenticator app
4. Enter the 6-digit code from your app to verify setup
5. Download and save your **backup codes** — store these offline (you'll need them if you lose your phone)

**Supported apps:**
Google Authenticator, Authy, 1Password, Microsoft Authenticator, Bitwarden

**How it works at login:**
• Enter your email and password as usual
• You're prompted for your 6-digit authenticator code
• Code refreshes every 30 seconds

**If you lose your authenticator:**
1. Use one of your saved backup codes
2. Each backup code is single-use
3. After using a backup code, generate new ones in Settings → Security

**If you've lost both authenticator and backup codes:**
• Contact support with government ID verification to regain access
• Process takes 24–72 hours for security review

**Strong password + 2FA** is the best protection for your account, music library, and earnings.`,
  },
  {
    keywords: ['api key', 'developer api', 'api access', 'third party access', 'developer', 'webhook', 'api integration'],
    category: 'account',
    relatedKeywords: ['security', 'account', 'developer'],
    nextSteps: ['Generate an API key in Settings → Developer', 'Set up webhooks to receive real-time event notifications', 'Review API rate limits before building integrations'],
    answer: `Max Booster provides a developer API for building custom integrations.

**API Access:**
1. Go to **Settings → API Keys**
2. Click **"Generate New API Key"**
3. Name your key (e.g., "My Dashboard Integration")
4. Set permissions (read-only, read-write, or specific scopes)
5. Copy and store your key securely — it's only shown once

**API Capabilities:**
• Read your streaming analytics data
• Read and create distribution releases
• Read royalty earnings data
• Read and write social media post queue
• Manage marketplace listings
• Receive real-time event webhooks

**Webhooks:**
Get notified instantly when:
• A release goes live on platforms
• A royalty payment is processed
• A marketplace sale is completed
• A social post publishes or fails
• A stream milestone is reached

**Rate Limits:**
• Standard: 1,000 requests/hour
• Analytics heavy: 100 requests/minute for data endpoints
• Webhook delivery: Retried 3 times on failure

**Documentation:**
Full API documentation with examples is available at your Developer settings page.`,
  },

  // ── MAX AI ASSISTANT ──────────────────────────────────────────────────────
  {
    keywords: ['who are you', 'what are you', 'about max', 'about you', 'what is max', 'are you ai', 'are you a bot', 'are you real', 'how do you work', 'introduce yourself'],
    category: 'assistant',
    relatedKeywords: ['help', 'support', 'features'],
    nextSteps: ['Ask me anything about any Max Booster feature', 'Tell me your current goal and I\'ll suggest a starting point', 'Ask me "what should I do next?" for personalized guidance'],
    answer: `I'm Max — the AI assistant built entirely in-house by the Max Booster engineering team.

**What makes me different:**
• Powered by Max Booster's proprietary knowledge engine — no third-party AI APIs
• Trained on every feature, workflow, and use case within the Max Booster platform
• Full conversation memory — I remember what you've asked in this session
• Proactive — I suggest next steps based on what you're working on

**I can help you with:**
• Step-by-step guidance on any feature (Studio, Distribution, Marketplace, Social, Advertising, Analytics, Career Tools)
• Music career strategy and advice
• Troubleshooting issues on the platform
• Understanding your analytics and royalty data
• Marketplace and licensing questions
• Technical questions about audio production

**What I can't do:**
• Make account changes for you (those require you to act in the platform)
• Access real-time data from your specific account
• Connect to external services outside Max Booster

**Pro tip:** Be specific with your questions for the best answers. Instead of "how do I use the studio," try "how do I export stems from my studio project?"

What would you like to explore today?`,
  },
  {
    keywords: ['in-house ai', 'custom ai', 'ai technology', 'how is ai built', 'your ai', 'max booster ai', 'proprietary ai', 'ai model', 'trained ai', 'ai engine'],
    category: 'assistant',
    relatedKeywords: ['assistant', 'studio', 'advertising'],
    nextSteps: ['Try the AI Generator to create original music', 'Activate the Social Media Autopilot to see the AI in action', 'Enable the Advertising Autopilot for zero-cost organic growth'],
    answer: `Every AI feature in Max Booster — including me — is built and trained entirely in-house by the B-Lawz Music engineering team.

**Our In-House AI Stack:**

**Models & Architecture:**
• Custom transformer architecture optimized specifically for music industry tasks
• In-house GPU training infrastructure with SIMD/Tensor Core acceleration
• Per-user model fine-tuning — your AI learns your specific audience and catalog
• Continuous retraining every 50 new data points (posts, streams, sales)
• No data shared with third-party AI providers — ever
• All models trained on 2024–2026 music industry data

**Specialized AI Engines:**
• **SocialMediaAutopilotAI** — predicts virality, engagement scores, and optimal posting timing per platform
• **AdvertisingAutopilotAI v3** — organic amplification by modeling and exploiting platform algorithms
• **AdvancedMusicAI** — deep music theory, audio analysis, beat generation, melody patterns
• **AI Mixer/Mastering** — genre-aware deterministic audio processing targeting streaming standards
• **Revenue Forecaster** — time-series prediction of royalty earnings
• **Customer Health Scorer** — predicts user career trajectory and churn risk
• **Viral Scoring Engine** — predicts virality probability for any piece of content
• **Max (me)** — comprehensive knowledge, conversation, and proactive guidance

**Why we build everything in-house:**
• Your music, data, and strategies stay completely private
• Models tuned specifically for the music industry — not generic
• No dependency on external API availability or pricing changes
• Faster, more accurate responses for music-specific queries`,
  },

  // ── SUPPORT & GENERAL ─────────────────────────────────────────────────────
  {
    keywords: ['help', 'support', 'contact support', 'contact us', 'human support', 'talk to person', 'escalate', 'ticket'],
    category: 'support',
    relatedKeywords: ['account', 'billing', 'assistant'],
    nextSteps: ['Try asking me your question first — I can resolve most issues instantly', 'Open a support ticket for billing or account-specific issues', 'Check the status page for any ongoing platform issues'],
    answer: `I'm here to help with any question about Max Booster! Here's how to get support:

**Ask me (Max) first:**
I can answer questions about any feature instantly — and I'm available 24/7.

**In-App Support:**
1. Go to **Support** in the sidebar
2. Browse help articles organized by category
3. Submit a support ticket for issues that require account access

**Support Response Times:**
• Max AI (me): Instant, 24/7
• Ticket support: Within 24 hours on business days
• Priority support: Within 4 hours (included in all plans)
• Emergency (account access lost, billing issue): Contact via live chat

**For your support ticket, include:**
• Your username or email address
• Description of the issue
• What you expected to happen vs. what happened
• Steps to reproduce (if it's a bug)
• Screenshots or screen recording

**Platform Status:**
Check if there's a known issue at the Status page (linked in the sidebar footer) — this will tell you if any services are experiencing degraded performance.

What can I help you with right now?`,
  },
  {
    keywords: ['mobile app', 'app', 'ios app', 'android app', 'download app', 'phone app', 'tablet', 'desktop app'],
    category: 'general',
    relatedKeywords: ['notifications', 'sync', 'offline'],
    nextSteps: ['Download the mobile app for studio recording on the go', 'Enable push notifications for royalty and campaign alerts', 'Sync your projects across all devices automatically'],
    answer: `Max Booster is available on every platform — web, mobile, and desktop.

**iOS App:**
• Available on the App Store
• Full feature parity with the web platform
• Studio (with audio recording), distribution, analytics, all career tools
• Push notifications for milestones, payouts, and campaign results
• Offline mode for Studio editing when internet is unavailable

**Android App:**
• Available on the Google Play Store
• Full feature parity including Studio and audio recording
• Push notifications and real-time sync

**Desktop App (Native):**
• Windows, macOS, and Linux native apps
• Lower audio latency than browser (ideal for live recording)
• Direct audio device access for professional studio setups
• Available in **Settings → Download Desktop App**

**Web Platform:**
• Works in Chrome, Safari, Firefox, Edge (latest 2 versions)
• No install required — full functionality
• WebAudio API powers the Studio (requires microphone permission for recording)

**Sync:**
All your projects, settings, and data sync instantly across all devices. Start a beat on desktop, add a vocal on mobile, distribute from the web — everything stays in sync.`,
  },
  {
    keywords: ['notification', 'alert', 'email notification', 'push notification', 'turn off notification', 'notification settings'],
    category: 'general',
    relatedKeywords: ['mobile', 'account', 'settings'],
    nextSteps: ['Set up a royalty alert for when earnings hit $10', 'Enable push notifications in the mobile app', 'Configure digest frequency (real-time vs. daily summary)'],
    answer: `Max Booster notifications keep you informed about important career events.

**Notification Types:**
• **Royalty alerts** — when earnings reach your payout threshold
• **Distribution updates** — release approved, rejected, or gone live
• **Social media** — campaign performance summaries, engagement spikes, post failures
• **Marketplace** — new beats sold, license request received, payout confirmed
• **Career milestones** — 1K streams, 10K streams, follower targets hit
• **Security** — new login from unrecognized device
• **Collaboration** — someone invited you to a project

**Managing Notifications:**
1. Go to **Settings → Notifications**
2. Toggle each type on or off
3. Choose delivery method per type:
   - In-app notification (bell icon)
   - Email
   - Push notification (mobile app)
4. Set digest frequency: real-time, daily summary, or weekly

**Push notifications** require the mobile app and notification permission granted in your device settings.

**Email preferences:** You can unsubscribe from marketing emails while keeping transactional notifications (receipts, distribution updates) — manage in Settings → Email Preferences.`,
  },
  {
    keywords: ['gdpr', 'privacy', 'data', 'my data', 'delete data', 'data rights', 'privacy policy', 'personal data', 'data export'],
    category: 'account',
    relatedKeywords: ['delete account', 'security', 'account'],
    nextSteps: ['Export your data in Settings → Privacy → Export My Data', 'Review what data we collect in Settings → Privacy'],
    answer: `Max Booster is fully GDPR-compliant and built with privacy as a foundation.

**Your Data Rights:**
• **Right to Access** — Full data export: Settings → Privacy → Export My Data (delivered within 72 hours)
• **Right to Erasure** — Delete your account → all personal data permanently removed after 30-day grace period
• **Right to Rectification** — Update any incorrect personal info in Settings → Profile
• **Right to Portability** — Export includes music files, project data, analytics, royalty records, messages

**What data we collect:**
• Account information (email, display name, payment method on file)
• Usage data (features used, session duration, error logs)
• Music files you upload (stored encrypted, used only to deliver the service)
• Social media performance data (from connected accounts — analytics only, no DMs)
• Streaming analytics (from distribution partners)

**What we never do:**
• Sell your personal data to any third party
• Use your music to train our AI models without explicit consent
• Share your earnings data with anyone
• Use connected social accounts for anything other than your authorized actions
• Store your social media passwords (OAuth only)

**Data Security:**
• Encrypted at rest (AES-256) and in transit (TLS 1.3)
• US-based servers (SOC 2 compliant infrastructure)
• EU data residency available on request (GDPR Article 46)
• 90-day backup retention after account deletion`,
  },
  {
    keywords: ['offline', 'offline mode', 'no internet', 'work offline', 'cache'],
    category: 'general',
    relatedKeywords: ['mobile', 'studio', 'storage'],
    nextSteps: ['Enable offline mode in the mobile app settings', 'Download your active projects for offline access before going offline'],
    answer: `Max Booster supports offline mode for working without an internet connection.

**Offline Capabilities:**
• **Studio** — open, edit, and export projects previously cached
• **Songwriting** — write and save lyrics offline
• **Beat Marketplace** — browse your own inventory offline

**What requires internet:**
• Distributing a new release (requires upload)
• Posting to social media
• Syncing analytics data
• Processing payments

**Setting up offline mode:**
1. Open the Max Booster mobile or desktop app
2. Go to Settings → Offline Mode → Enable
3. Select projects to cache for offline access (up to your device storage limit)
4. When offline, a banner shows that you're in offline mode
5. When internet returns, all changes sync automatically — no action needed

**Sync on reconnect:**
Any edits made offline are queued and synced automatically when internet is restored. If there's a conflict (you edited on both offline and another device), you'll be shown both versions and choose which to keep.`,
  },
  {
    keywords: ['onboarding', 'getting started', 'new user', 'beginner', 'first steps', 'setup', 'start', 'where to begin'],
    category: 'general',
    relatedKeywords: ['career coach', 'distribution', 'studio', 'social media'],
    nextSteps: ['Complete the onboarding checklist in your dashboard', 'Set up your artist profile first (it powers all other features)', 'Connect your social accounts to unlock the Autopilot'],
    answer: `Welcome to Max Booster! Here's how to get started effectively:

**Recommended First Steps:**
1. **Complete your artist profile** — Settings → Profile (name, genre, bio, photo). This powers your EPK, marketplace storefront, and AI personalization.

2. **Connect your social accounts** — Settings → Connected Accounts. This unlocks the Social Media Autopilot and lets analytics track your full online presence.

3. **Upload your first release** — Go to Distribution → New Release. Even if it's not ready to submit yet, getting familiar with the form early saves time later.

4. **Explore Studio** — Create a new Studio project. Record, import a beat, or use the AI Generator to create something from scratch.

5. **Set up your Marketplace storefront** — Even if you don't have beats to sell yet, claim your custom URL (it's first-come, first-served).

6. **Visit Career Coach** — Set your primary goal and get a personalized 30-day action plan.

**Onboarding Checklist:**
Your dashboard has an interactive onboarding checklist showing your progress. Complete all items to unlock the full potential of the platform.

**Tip:** The platform works best when everything is connected — Studio → Distribution → Analytics → Autopilot form a complete loop that compounds results over time.`,
  },
  {
    keywords: ['hybrid storage', 'storage', 'file storage', 'pocket dimension', 'boosterstate', 'replit storage', 'object storage', 'storage tier'],
    category: 'general',
    relatedKeywords: ['studio', 'distribution', 'files'],
    nextSteps: ['All storage is managed automatically — no action needed', 'Large project archives are stored in cold tier to save space'],
    answer: `Max Booster uses a three-tier hybrid storage architecture for optimal performance and cost efficiency.

**Storage Tiers:**

**Hot Tier (Replit Object Storage):**
• Recently created and frequently accessed files
• Projects you've opened in the last 30 days
• Active distribution releases and uploaded assets
• Instant access, no loading delays

**Cold Tier (Pocket Dimension — Custom Technology):**
• Archived files not accessed in 30+ days
• Old project versions and backups
• Applies streaming compression and deduplication
• Reduces storage footprint by up to 60%
• Files promoted back to hot tier on access (seamless)

**BoosterState (Metadata & Session Layer):**
• Custom Rust-based Write-Ahead Log (WAL) key-value store
• Manages session data, posting queues, and fast lookups
• Powers real-time features without database overhead
• Built-in for ultra-low latency

**What this means for you:**
• Your files are always accessible regardless of which tier they're on
• Auto-tiering happens in the background — you never need to manage it
• Old projects load slightly slower from cold tier (seconds, not minutes)
• No storage limits on your subscription — the system scales automatically

**Deduplication:**
If multiple users upload the same audio sample, it's stored once and referenced multiple times — saving space and improving the platform's efficiency for everyone.`,
  },

  // ── AI VIDEO GENERATOR ────────────────────────────────────────────────────
  {
    keywords: ['video', 'music video', 'ai video', 'generate video', 'cinematic video', 'visual', 'video generator', 'make video', 'create video', 'video for music', 'lyric video', 'visualizer'],
    category: 'studio',
    relatedKeywords: ['social media', 'youtube', 'tiktok', 'instagram reels', 'distribution'],
    nextSteps: ['Export your video to YouTube or Instagram Reels', 'Use the AI Video on TikTok with the Social Media Autopilot', 'Add your branding overlay before exporting', 'Share the cinematic video on all connected social platforms'],
    answer: `The AI Cinematic Video Generator creates professional music videos and visual content from your audio — powered entirely by Max Booster's in-house AI.

**What it does:**
• Converts your music into a full cinematic music video automatically
• AI generates scene compositions, transitions, and visual effects in sync with your audio
• Cuts synchronized to beat drops and song structure
• Multiple visual styles to choose from:
  - **Cinematic** — film-quality scenes and color grading
  - **Lo-Fi** — retro, warm-toned aesthetic
  - **Abstract** — motion graphics and particle effects
  - **Performance** — artist-in-studio simulated footage
  - **Lyric Video** — animated lyrics over visual backgrounds

**Export formats:**
• 1080p Full HD for standard uploads
• 4K Ultra HD for premium quality
• Ready for YouTube, TikTok, Instagram Reels, and Facebook

**Customization:**
• Artist name and logo overlays
• Custom color palette to match your brand
• Intro/outro bumper frames

**How to use:**
1. In Studio, open your finished project
2. Click "Generate Video" in the toolbar
3. Choose your visual style and brand preferences
4. Hit Generate — your video is ready in minutes
5. Export and share directly to connected social accounts

No video editing skills required. The AI handles every frame end to end.`,
  },

  // ── FAN HUB & COMMUNITY ───────────────────────────────────────────────────
  {
    keywords: ['fan hub', 'fan community', 'fan engagement', 'fans', 'community', 'fan club', 'fan page', 'engage fans', 'fan interaction', 'fan base', 'fanbase'],
    category: 'social',
    relatedKeywords: ['social media', 'autopilot', 'analytics', 'fan campaign'],
    nextSteps: ['Set up a Fan Campaign to grow your community', 'Use the Social Media Autopilot to keep fans engaged automatically', 'Track your audience demographics in the Analytics dashboard', 'Send a pre-save campaign to your fanbase before your next release'],
    answer: `The Fan Hub is your centralized space for building and engaging your fan community on Max Booster.

**Fan Hub Features:**
• Fan list management — view and organize your subscriber and follower base
• Fan segmentation — group fans by genre preference, location, or engagement level
• Direct messaging (fan broadcast) — send updates to your entire fanbase at once
• Fan activity feed — see who's listening, sharing, and commenting in real time
• Exclusive content drops — share unreleased material, stems, or behind-the-scenes with superfans
• Fan milestones — celebrate streaming, follower, and purchase milestones with your community

**Fan Campaigns:**
• Pre-release hype campaigns — build anticipation with countdowns and teasers
• Merch giveaways — run limited campaigns for merchandise drops
• Fan voting — let your community vote on song names, artwork, or setlists
• UGC (User Generated Content) campaigns — encourage fans to create content around your music
• Playlist collaboration — invite fans to submit songs to a shared playlist

**Integration with other Max Booster tools:**
• Autopilot auto-posts engage your fanbase across all platforms
• Analytics shows your most engaged fans and territories
• Marketplace notifies superfans of new beat or merch drops

Building a loyal fan community is one of the most powerful career accelerators — Fan Hub makes it automatic.`,
  },

  // ── CONTRACTS ─────────────────────────────────────────────────────────────
  {
    keywords: ['contract', 'music contract', 'agreement', 'deal', 'record deal', 'publishing deal', 'licensing agreement', 'feature agreement', 'collaborator contract', 'contract management'],
    category: 'career',
    relatedKeywords: ['sync licensing', 'royalty split', 'publishing', 'marketplace license', 'legal'],
    nextSteps: ['Set up a royalty split for your collaborators alongside the contract', 'Register the track in the Sync Licensing portal after the agreement is signed', 'Export a PDF copy of the contract for your records', 'Use the Contract alongside a Marketplace license for beat sales'],
    answer: `Max Booster's Contract Management system lets you draft, send, and manage music industry agreements — all without a lawyer for standard deals.

**Contract Types Supported:**
• **Feature/Collaboration Agreements** — terms for featured artist appearances
• **Beat Purchase/License Agreements** — exclusive and non-exclusive beat deals
• **Co-Writer Agreements** — split percentages and publishing rights for co-written songs
• **Producer Agreements** — producer credit, advance, and point structure
• **Sync Licensing Contracts** — permission for film, TV, and commercial use
• **Management Agreements** — manager commissions and responsibilities
• **Distribution Agreements** — label or distributor deal terms

**How to use:**
1. Go to Career → Contracts
2. Choose a contract template
3. Fill in the parties, terms, and payment structure
4. Send via email for digital signature
5. Store and track signed contracts in your dashboard

**Key features:**
• Pre-built templates for every common music deal type
• Digital signature support — no printing or scanning needed
• Contract status tracking — pending, signed, expired
• Linked to Royalty Splits — contract terms auto-populate split percentages
• PDF export for your personal records
• Reminders for contract renewal and expiry dates

**Important note:** For complex deals (major label, large sync placements), always consult a music attorney. Max Booster contracts are designed for standard independent artist agreements.`,
  },

  // ── RADIO PITCHING ────────────────────────────────────────────────────────
  {
    keywords: ['radio', 'radio pitch', 'radio submission', 'fm radio', 'internet radio', 'radio station', 'radio play', 'airplay', 'radio promotion', 'college radio', 'submit to radio'],
    category: 'career',
    relatedKeywords: ['distribution', 'playlist pitching', 'career coach', 'sync licensing', 'analytics'],
    nextSteps: ['Submit your radio pitch at least 4 weeks before your release date', 'Pair your radio campaign with a Social Media Autopilot burst for maximum reach', 'Track airplay royalties in your Royalties dashboard', 'Follow up your radio submission with an EPK (Electronic Press Kit)'],
    answer: `The Radio Pitch Tool lets you submit tracks to FM stations, internet radio networks, and college radio programs — directly from Max Booster.

**Radio submission types:**
• **FM/Terrestrial Radio** — submit to commercial and independent FM stations
• **Internet Radio** — Pandora, iHeart, SiriusXM, and independent streams
• **College Radio** — CMJ-affiliated and independent college stations
• **Gospel/Christian Radio** — faith-based radio networks
• **Genre-specific Radio** — Hip-Hop, R&B, Country, Electronic, Latin networks

**How to submit:**
1. Go to Career → Radio Pitch
2. Select your track and target radio format
3. Fill in your pitch: artist bio, track description, target audience
4. Choose your target stations or let AI recommend based on genre
5. Submit — confirmation sent to your dashboard

**What Max Booster's AI optimizes:**
• Matching your track's genre and energy to the right station formats
• Pitch copy written by AI based on your artist profile and track metadata
• Submission timing recommendations based on release window
• Follow-up reminder scheduling

**Tracking:**
• View submission status per station
• Track airplay reports linked to your royalty earnings
• Monitor which stations are spinning your music via integrated airplay data

**Pro Tip:** Submit your radio pitch at least 4 weeks before your release date. Most stations need advance time to add tracks to their rotation.`,
  },

  // ── FAN CAMPAIGNS ─────────────────────────────────────────────────────────
  {
    keywords: ['fan campaign', 'campaign', 'presave', 'pre-save', 'pre save', 'release campaign', 'music campaign', 'launch campaign', 'promotional campaign', 'countdown campaign'],
    category: 'social',
    relatedKeywords: ['social media autopilot', 'distribution', 'release', 'fan hub', 'analytics'],
    nextSteps: ['Launch a pre-save campaign 2-4 weeks before your release', 'Connect your social accounts to auto-post campaign content', 'Pair the campaign with a release countdown for maximum hype', 'Monitor campaign performance in the Analytics dashboard'],
    answer: `Fan Campaigns are coordinated promotional efforts built inside Max Booster to drive engagement and momentum around your music releases and brand.

**Campaign Types:**
• **Pre-Save Campaign** — drive Spotify/Apple Music saves before your release date
• **Release Launch Campaign** — multi-platform announcement when your music goes live
• **Behind-the-Scenes Series** — teaser content dripped out over days/weeks before release
• **Merchandise Drop Campaign** — announce and promote a new merch item
• **Fan Voting Campaign** — engage fans in naming a song, picking artwork, or setting a setlist
• **UGC (User Generated Content) Campaign** — prompt fans to create content using your music
• **Milestone Celebration Campaign** — 1M streams, 10K followers, album anniversary

**How to create a campaign:**
1. Go to Social → Campaigns (or Career → Fan Campaigns)
2. Choose a campaign type and set your goal
3. Set the campaign date range and target platforms
4. AI generates all content variants — captions, hashtags, visuals guidance
5. Publish to the Content Calendar for review or activate Autopilot for fully automatic posting

**Campaign Analytics:**
• Impressions and reach per platform
• Pre-save conversion rate
• Click-through rate on campaign links
• Fan growth attributed to the campaign
• Best-performing content variants

**Pro Tip:** A 2-week pre-save campaign before your release typically increases Day 1 stream counts by 30-50% compared to no campaign.`,
  },

  // ── RELEASE COUNTDOWN ─────────────────────────────────────────────────────
  {
    keywords: ['release countdown', 'countdown', 'pre-release', 'pre release', 'hype', 'teaser', 'upcoming release', 'dropping soon', 'countdown timer', 'release date'],
    category: 'distribution',
    relatedKeywords: ['fan campaign', 'social media autopilot', 'pre-save', 'distribution', 'release'],
    nextSteps: ['Activate the Social Media Autopilot to post countdown content automatically', 'Launch a pre-save campaign alongside the countdown', 'Submit your playlist pitch during the countdown period', 'Prepare your release announcement content in the Content Calendar'],
    answer: `Release Countdown is a built-in feature that builds anticipation for your upcoming music drop with automated teaser content, timers, and pre-release assets.

**What the Release Countdown does:**
• Generates a shareable countdown timer page linked to your release
• AI creates a sequence of teaser posts leading up to your release date
• Pre-save link generation — fans can add your music to their library before it's live
• Custom countdown graphics — artwork countdown posts with your branding
• Automatically activates full release announcement content on drop day

**How to set up:**
1. When creating a Distribution release, set a future release date
2. Toggle "Enable Release Countdown"
3. Choose countdown duration (7 days, 14 days, 21 days, 30 days)
4. Select which content types to generate (teasers, previews, behind-scenes)
5. Connect your social accounts — Autopilot handles the rest

**Generated countdown assets:**
• "X days until drop" social posts (auto-generated daily)
• 15-second audio snippet posts (excerpt of your track)
• Behind-the-scenes studio content using your project files
• Final "Tomorrow is the day" hype post
• Release day announcement post with streaming links

**Pre-save integration:**
• Spotify pre-save link embedded in all countdown posts
• Apple Music pre-add link
• Fan email capture for release notification

**Tracking:**
• Pre-save count in real time
• Link clicks and reach per countdown post
• Conversion rate from teaser to pre-save`,
  },

  // ── MERCH / MERCHANDISE ───────────────────────────────────────────────────
  {
    keywords: ['merch', 'merchandise', 'merch store', 't-shirt', 'hoodie', 'clothing', 'sell merch', 'artist merch', 'fan merch', 'print on demand', 'merch drop'],
    category: 'marketplace',
    relatedKeywords: ['fan hub', 'fan campaign', 'storefront', 'marketplace', 'royalties'],
    nextSteps: ['Promote your merch drop with a Fan Campaign', 'Add your merch store link to all social profiles', 'Use the Autopilot to auto-post merch announcements', 'Run a limited-time drop campaign for new merch items'],
    answer: `Max Booster includes a built-in Merchandise storefront so you can sell artist merch directly to your fans alongside your music and beats.

**What you can sell:**
• T-Shirts, hoodies, hats, and custom apparel
• Posters and art prints
• Digital merchandise (exclusive stems, samples, sessions)
• Bundles (music + merch packages)
• Limited edition drops — time-limited availability to create urgency

**Print-on-Demand integration:**
• No inventory required — products are printed and shipped on purchase
• International shipping handled automatically
• Returns and fulfillment managed by the platform
• Your profit margin per item shown before you list

**How to set up:**
1. Go to Marketplace → Merch Store
2. Upload your artwork or designs
3. Choose product types and sizes
4. Set your price (platform shows your profit margin)
5. Publish — your merch is live immediately

**Merch + Music bundles:**
• Sell beats + a t-shirt together as a package
• Offer album + hoodie pre-order bundles
• Exclusive merch unlocks for fans who stream a certain amount

**Merch Analytics:**
• Sales by item and variant
• Revenue per product
• Customer location data
• Conversion rate from store visits to purchase

**Fan Campaign integration:**
• Launch a "Merch Drop" campaign and Autopilot handles all the announcement posts automatically`,
  },

  // ── WORKSPACES ────────────────────────────────────────────────────────────
  {
    keywords: ['workspace', 'workspaces', 'organize', 'organization', 'project folder', 'band account', 'team', 'label account', 'multiple artists', 'manage artists'],
    category: 'account',
    relatedKeywords: ['collaboration', 'royalty split', 'contracts', 'studio', 'distribution'],
    nextSteps: ['Invite team members to your workspace in Settings → Workspace', 'Set permissions so collaborators can only access what they need', 'Create separate workspaces for different artist projects', 'Assign royalty splits across workspace members'],
    answer: `Workspaces let you organize your Max Booster account for different artists, bands, or projects — and invite team members with controlled access.

**What Workspaces do:**
• Create separate environments for each artist or project you manage
• Invite collaborators, managers, or band members with role-based access
• Keep royalties, analytics, and releases separated by workspace
• Switch between workspaces without logging out

**Workspace roles:**
• **Owner** — full control over all features, billing, and settings
• **Admin** — manage releases, social accounts, and team members
• **Collaborator** — access Studio and specific projects only
• **Viewer** — read-only access to analytics and royalty reports

**Who uses Workspaces:**
• **Managers** managing multiple artists from one dashboard
• **Record labels** running multiple artist accounts under one roof
• **Bands** splitting access across members
• **Solo artists** with a manager or publicist who needs limited access

**How to set up:**
1. Go to Settings → Workspace
2. Click "Create New Workspace" or "Invite Member"
3. Assign a role to each team member
4. Each workspace has its own storage, releases, and analytics

**Workspace isolation:**
• Music files, projects, and releases are completely separated
• Analytics and royalties are workspace-specific
• Social accounts are per-workspace — no crossover posting

Multiple workspaces are available on all paid plans.`,
  },

  // ── SELF-EVOLUTION ENGINE ─────────────────────────────────────────────────
  {
    keywords: ['self evolution', 'self-evolution', 'evolving ai', 'ai learning', 'ai improve', 'platform learn', 'adaptive ai', 'ai retrain', 'train model', 'model update', 'ai evolution'],
    category: 'assistant',
    relatedKeywords: ['in-house ai', 'ai technology', 'max booster ai', 'pocket dimension'],
    nextSteps: ['Your usage automatically contributes to improving the platform AI', 'No action required — the Self-Evolution Engine runs automatically'],
    answer: `The Self-Evolution Engine is Max Booster's proprietary AI retraining system that continuously improves every AI feature on the platform based on real usage patterns.

**How it works:**
• Usage data from the platform (anonymized and aggregated) feeds into retraining pipelines
• AI models update automatically on a scheduled cycle without any downtime
• Each AI feature — mixing, mastering, content generation, beat generation — improves independently
• New patterns detected in usage trigger targeted model updates for that specific feature

**What gets better over time:**
• **AI Mixer/Mastering** — learns from thousands of tracks processed to improve tonal and dynamic accuracy
• **Social Content AI** — improves caption quality based on which posts generate the highest engagement
• **Beat Generator** — learns from the most popular generated beats to create better starting points
• **Max AI Assistant** — expands its knowledge base as new features ship and new user questions arrive
• **Advertising Autopilot** — learns which campaign patterns generate the best organic growth

**Technical details:**
• Models are stored in the Pocket Dimension storage fabric (custom distributed storage)
• PocketFabric Cluster (3-node auto-scaling AI compute) handles retraining workloads
• Training jobs run on a dedicated compute schedule — no impact on platform performance
• Model versions are versioned and rolled back automatically if performance drops

**For users:**
• You don't need to do anything — the AI gets better the more you use Max Booster
• Improvements deploy silently in the background
• Your data privacy is fully protected — all learning uses aggregated, anonymized patterns

Max Booster is one of the only platforms where the AI is genuinely self-improving from real music career data.`,
  },

  // ── MAX BOOSTER OVERVIEW ──────────────────────────────────────────────────
  {
    keywords: ['what is max booster', 'about max booster', 'max booster platform', 'what does max booster do', 'max booster features', 'everything max booster', 'platform overview', 'all features', 'what can max booster do', 'tell me about max booster', 'overview', 'platform summary'],
    category: 'general',
    relatedKeywords: ['studio', 'distribution', 'royalties', 'marketplace', 'social', 'analytics', 'career'],
    nextSteps: ['Explore the Studio to start making music', 'Submit your first release via Distribution', 'Connect your social accounts for Autopilot', 'Check your career score in the Analytics Dashboard'],
    answer: `**Max Booster** is the all-in-one AI music career management platform for independent artists — built by B-Lawz Music.

It replaces every tool you'd need to run a music career, from production to streaming to marketing to monetization. Everything runs on custom in-house AI — no OpenAI, no external APIs.

---

## 🎚️ Studio (Professional DAW)
• Unlimited multi-track audio and MIDI recording
• AI Mixer and AI Mastering (loudness targeting for Spotify, Apple Music, Tidal, YouTube)
• AI Beat Generator — create full beats and melodies from text descriptions
• Stem Separation, MIDI Piano Roll, VST Plugin Bridge
• Real-time collaboration, cloud save, and export to WAV/MP3/FLAC/stems
• AI Cinematic Video Generator — turn your audio into a full music video

## 🌍 Distribution (150+ Platforms)
• One-click release to Spotify, Apple Music, YouTube Music, Amazon, Tidal, Deezer, TikTok, Instagram, Pandora, SoundCloud, Boomplay, Beatport, and 140+ more
• Auto ISRC and UPC generation
• Playlist pitching to Spotify editorial and curators
• Pre-save campaigns and release countdown automation
• Smart content ID and copyright protection

## 💰 Royalties (100% Retention)
• Keep 100% of your streaming royalties — Max Booster takes nothing
• Real-time earnings dashboard per track, platform, and territory
• Royalty splits for collaborators (auto-calculated)
• Publishing rights and PRO registration guidance (ASCAP, BMI)
• Sync licensing revenue tracking
• Instant Payout / Royalty Advance — access future earnings early
• Revenue Intelligence — 90-day AI earnings forecast

## 🛒 Beat Marketplace
• Sell beats, loops, samples, and preset packs with full license control
• Non-Exclusive, Exclusive, and Unlimited license tiers
• Custom branded storefront with a unique URL
• Merch store — sell apparel and limited-edition drops alongside music
• Integrated Stripe checkout — no third-party redirects
• Bundle pricing and conversion analytics

## 📱 Social Media Autopilot
• Connect Instagram, Twitter/X, TikTok, Facebook, YouTube, LinkedIn
• AI generates captions, hashtags, and emojis — platform-optimized
• AI-Optimized Timing — posts go out at peak audience hours
• Content Calendar, Burst Mode, Brand Voice consistency
• A/B Testing — finds your best-performing caption hooks automatically
• Fan Campaigns — pre-save, merch drops, countdowns, and UGC campaigns
• Fan Hub — broadcast to your community, exclusive content drops

## 📊 Analytics & Insights
• Executive Dashboard with career health score
• Streams, listeners, plays, and engagement per track and platform
• Audience demographics (age, gender, location) and territory maps
• Revenue analytics linked to your royalty dashboard
• Predictive insights and competitor benchmarking

## 🚀 Advertising Autopilot
• Zero-budget organic growth campaigns — no ad spend required
• AI builds and executes full promotional campaigns automatically
• A/B content testing to identify winning angles
• Multi-platform management from a single dashboard

## 🎤 Career Tools
• AI Career Coach — personalized strategy based on your metrics and goals
• Electronic Press Kit (EPK) generator
• Tour and Venue Management
• Sync Licensing Portal — submit to TV, film, and brand placements
• Songwriting Assistant (AI co-writer)
• Contract Management — draft, send, and track music industry agreements
• Radio Pitch Tool — submit to FM, internet, and college radio
• Sample Clearance Tracker
• Project Budget Planner
• Release Countdown and Fan Campaign Manager

## 🤖 In-House AI Engine
• Every AI feature is proprietary — no third-party AI APIs
• Self-Evolution Engine — models continuously retrain on real platform data
• Pocket Dimension distributed storage for AI model weights
• PocketFabric 3-node auto-scaling compute cluster

---

**Plans:** Free (limited), Monthly, Yearly, and Lifetime — you keep 100% of royalties on all paid plans.`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// PROACTIVE SUGGESTION LOGIC
// ─────────────────────────────────────────────────────────────────────────────

const PROACTIVE_FLOWS: Record<string, string[]> = {
  studio: [
    'Ready to distribute this track? Go to Distribution → New Release',
    'Export your track as stems for future collaboration or licensing',
    'Run AI Master to hit streaming loudness targets before exporting',
    'List the finished beat on the Marketplace to start earning',
    'Share a preview on social media using the Autopilot',
  ],
  distribution: [
    'Submit a playlist pitch 7+ days before your release date for editorial consideration',
    'Set up royalty splits now if you have collaborators on this release',
    'Enable pre-save links to build momentum before your release goes live',
    'Prepare a social media campaign to launch alongside your release',
    'Tag your tracks in the Sync Licensing portal after they go live',
  ],
  royalties: [
    'Connect a payout method in Settings → Billing to receive earnings',
    'Set up royalty splits before your next release if you work with collaborators',
    'Register with a PRO (ASCAP/BMI) to collect publishing performance royalties',
    'Check Revenue Intelligence for your 90-day earnings forecast',
    'Export your royalty report for tax filing (Settings → Reports)',
  ],
  marketplace: [
    'Upload a watermarked MP3 preview — buyers need to hear before purchasing',
    'Enable the Social Media Autopilot to auto-promote new beat uploads',
    'Set up bundle pricing (3 beats for a discount) to increase average order value',
    'Add your store URL to all your social media profiles and bio links',
    'Check your conversion rate in Marketplace Analytics — optimize pricing if below 2%',
  ],
  social: [
    'Enable AI-Optimized Timing to automatically post at peak audience hours',
    'Use Burst Mode around your next release date for maximum momentum',
    'Connect all platforms — each connected account amplifies the AI\'s effectiveness',
    'Review pending content in the Content Calendar before it goes live',
    'A/B test your caption hooks — small wording changes can double engagement',
  ],
  advertising: [
    'Review your A/B test results after 72 hours — apply winning variants',
    'Create a release-specific campaign 2 weeks before launch',
    'Target your campaign at the genre fans identified in your analytics',
    'Use Burst Mode + Advertising Autopilot together for maximum launch impact',
    'Check stream lift attribution — see which posts are actually driving listens',
  ],
  analytics: [
    'Export a Certified Analytics report to pitch to labels, blogs, or press',
    'Check your audience demographic breakdown to refine content targeting',
    'Set milestone alerts — get notified when you hit 10K or 50K monthly listeners',
    'Compare platform-by-platform to find where to double down',
    'Use Revenue Intelligence to project your next 90 days of earnings',
  ],
  career: [
    'Update your Press Kit EPK after every major release',
    'Submit to labels via the LabelGrid portal when you have 10K+ monthly listeners',
    'Add your next show to the Tour Manager and auto-post the dates',
    'Check your Career Health Score weekly and act on low-scoring areas',
    'Register every new song with your PRO to ensure you collect all royalties',
  ],
  account: [
    'Enable 2FA for maximum account security',
    'Add a backup email in case you lose access to your primary',
    'Download your data export periodically as a personal backup',
    'Review connected app permissions every 6 months',
  ],
  support: [
    'Check the Status page for any ongoing platform issues before submitting a ticket',
    'Include your username and steps to reproduce when submitting a bug report',
  ],
  assistant: [
    'Ask me "what should I do next?" for personalized step suggestions based on your goal',
    'Ask about any specific feature for a detailed walkthrough',
    'I can explain how any two features work together — just ask',
  ],
  video: [
    'Export your music video to YouTube and TikTok after generation',
    'Share your cinematic video using the Social Media Autopilot for hands-free promotion',
    'Add branding overlays before exporting to keep your visual identity consistent',
    'Use Lyric Video style for tracks with a strong vocal performance',
  ],
  campaign: [
    'Launch a pre-save campaign 2-4 weeks before your release date for maximum Day-1 streams',
    'Pair your Fan Campaign with Release Countdown posts for high-momentum launches',
    'Track campaign conversions in Analytics to see which content drove the most pre-saves',
    'Reuse winning campaign content structures for your next release',
  ],
  merch: [
    'Promote your merch drop with a Fan Campaign for maximum visibility',
    'Add your merch store link to every social media bio',
    'Bundle merch with a music release for higher average order value',
    'Use the Autopilot to announce new merch drops automatically across all platforms',
  ],
  contracts: [
    'Pair your contract with a Royalty Split to automate payment distribution',
    'Register your track in the Sync Licensing portal after signing a placement agreement',
    'Export signed contracts as PDFs for your personal records',
    'Set contract expiry reminders so you never miss a renewal date',
  ],
  radio: [
    'Submit your radio pitch at least 4 weeks before your release date',
    'Pair your radio push with a Social Media Burst Mode campaign',
    'Track airplay royalties through your Royalties dashboard',
    'Update your EPK before submitting to major stations',
  ],
  workspace: [
    'Set collaborator permissions before sharing your workspace with a manager or band member',
    'Create a separate workspace for each artist if you manage multiple acts',
    'Review workspace member access every few months to keep permissions current',
  ],
  general: [
    'The Max Assistant can guide you through any feature — just ask',
    'Check your Career Health Score weekly in the Analytics Dashboard',
    'Use the Platform Overview to discover features you haven\'t tried yet',
  ],
};

const QUICK_ACTIONS_MAP: Record<string, QuickAction[]> = {
  studio: [
    { label: 'How to export stems', prompt: 'How do I export stems from my studio project?' },
    { label: 'AI mixing guide', prompt: 'How does AI mixing and mastering work?' },
    { label: 'Generate a beat', prompt: 'How do I generate a beat with the AI generator?' },
    { label: 'Real-time collab', prompt: 'How does real-time studio collaboration work?' },
  ],
  distribution: [
    { label: 'Submit a release', prompt: 'How do I submit my first release for distribution?' },
    { label: 'Pitch to playlists', prompt: 'How does playlist pitching work?' },
    { label: 'Cover art specs', prompt: 'What are the cover art requirements for distribution?' },
    { label: 'Set royalty splits', prompt: 'How do I set up royalty splits for a release?' },
  ],
  royalties: [
    { label: 'When do I get paid', prompt: 'When and how do royalty payments work?' },
    { label: 'Payout setup', prompt: 'How do I connect my bank account for payouts?' },
    { label: 'Publishing royalties', prompt: 'How do publishing and PRO royalties work?' },
    { label: 'Royalty splits', prompt: 'How do I split royalties with collaborators?' },
  ],
  marketplace: [
    { label: 'Set up storefront', prompt: 'How do I set up my beat marketplace storefront?' },
    { label: 'License types', prompt: 'What are the different beat license types?' },
    { label: 'Pricing strategy', prompt: 'How should I price my beats?' },
    { label: 'Connect Stripe', prompt: 'How do I connect Stripe to receive marketplace payments?' },
  ],
  social: [
    { label: 'Connect accounts', prompt: 'How do I connect my social media accounts?' },
    { label: 'Posting schedule', prompt: 'When is the best time to post on social media?' },
    { label: 'Content calendar', prompt: 'How does the content calendar work?' },
    { label: 'TikTok setup', prompt: 'How do I connect TikTok to the autopilot?' },
  ],
  advertising: [
    { label: 'Create a campaign', prompt: 'How do I create an advertising autopilot campaign?' },
    { label: 'A/B testing', prompt: 'How does A/B testing work in the advertising autopilot?' },
    { label: 'Zero-cost growth', prompt: 'How does organic zero-cost growth work?' },
    { label: 'Track results', prompt: 'How do I measure my advertising campaign results?' },
  ],
  analytics: [
    { label: 'Reading my dashboard', prompt: 'How do I read my analytics dashboard?' },
    { label: 'Audience data', prompt: 'How do I see my audience demographics?' },
    { label: 'Revenue forecast', prompt: 'How does the revenue intelligence forecast work?' },
    { label: 'Certified analytics', prompt: 'How do I get a certified analytics report for label pitches?' },
  ],
  career: [
    { label: 'Career Coach setup', prompt: 'How do I set up my career coach plan?' },
    { label: 'Build my EPK', prompt: 'How do I build my press kit EPK?' },
    { label: 'Sync licensing', prompt: 'How do I list my music for sync licensing?' },
    { label: 'Submit to labels', prompt: 'How do I submit my music to record labels?' },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// FOLLOW-UP & SCORING LOGIC
// ─────────────────────────────────────────────────────────────────────────────

const FOLLOW_UP_PATTERNS = [
  { pattern: /^(how|what|why|when|where|can|do|does|is|are|tell me|explain|show|give)\b/i, isQuestion: true },
  { pattern: /\bmore\b|\bdetail|\bexplain|\belaborate|\bexpand\b/i, isFollowUp: true },
  { pattern: /\bthat\b|\bit\b|\bthis\b|\bthose\b|\bthey\b/i, isContextual: true },
];

const STOP_WORDS = new Set([
  'is', 'in', 'to', 'be', 'as', 'at', 'by', 'or', 'an', 'if', 'no', 'so',
  'the', 'and', 'for', 'are', 'not', 'can', 'was', 'one', 'had', 'its',
  'did', 'who', 'now', 'see', 'use', 'two', 'way', 'any', 'has', 'him',
  'them', 'they', 'with', 'have', 'from', 'will', 'been', 'when', 'your',
  'does', 'into', 'just', 'like', 'make', 'some', 'than', 'that', 'this',
  'how', 'what', 'work', 'tell', 'help', 'give', 'show', 'get', 'much',
  'about', 'really', 'actually', 'also', 'more', 'which', 'where', 'there',
  'want', 'need', 'my', 'me', 'you', 'we', 'our', 'your', 'their',
]);

function scoreEntry(entry: KnowledgeEntry, tokens: string[]): number {
  let score = 0;
  const keywords = entry.keywords;
  for (const token of tokens) {
    if (STOP_WORDS.has(token) || token.length < 3) continue;
    for (const kw of keywords) {
      if (kw === token) {
        score += 4;
      } else {
        const kwWords = kw.split(' ');
        if (kwWords.includes(token)) {
          score += 3;
        } else if (token.includes(kw) && kw.length >= 4) {
          score += 2;
        } else if (kwWords.some((w) => w.includes(token) && token.length >= 5 && w !== token)) {
          score += 1;
        }
      }
    }
    // Also score related keywords (lower weight)
    if (entry.relatedKeywords) {
      for (const rk of entry.relatedKeywords) {
        if (rk === token || rk.split(' ').includes(token)) {
          score += 1;
        }
      }
    }
  }
  return score;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

function detectFollowUpContext(message: string, history: ConversationMessage[]): string | null {
  const isContextual = FOLLOW_UP_PATTERNS.some((p) => p.isContextual && p.pattern.test(message));
  if (!isContextual || history.length === 0) return null;

  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role === 'assistant') {
      const tokens = tokenize(msg.content);
      const bestEntry = KNOWLEDGE_BASE.reduce(
        (best, entry) => {
          const s = scoreEntry(entry, tokens);
          return s > best.score ? { entry, score: s } : best;
        },
        { entry: null as KnowledgeEntry | null, score: 0 }
      );
      if (bestEntry.entry && bestEntry.score > 2) return bestEntry.entry.category;
      break;
    }
  }
  return null;
}

function getProactiveSuggestions(category: string, entry: KnowledgeEntry): string[] {
  const flows = PROACTIVE_FLOWS[category] || [];
  const nextSteps = entry.nextSteps || [];
  
  // Combine next steps and proactive flows, prioritize specific next steps
  const combined = [...nextSteps, ...flows];
  // Deduplicate and return top 3
  const unique = [...new Set(combined)];
  return unique.slice(0, 3);
}

function getRelatedTopics(entry: KnowledgeEntry): string[] {
  const related = entry.relatedKeywords || [];
  return related.slice(0, 4).map((k) => {
    // Map keyword to a human-readable topic name
    const topicMap: Record<string, string> = {
      studio: 'Studio & Production',
      distribution: 'Music Distribution',
      royalties: 'Royalties & Payments',
      marketplace: 'Beat Marketplace',
      social: 'Social Media Autopilot',
      advertising: 'Advertising Autopilot',
      analytics: 'Analytics Dashboard',
      career: 'Career Tools',
      account: 'Account Settings',
      mixing: 'AI Mixing & Mastering',
      export: 'Exporting Tracks',
      midi: 'MIDI & Virtual Instruments',
      platforms: 'Streaming Platforms',
      license: 'Beat Licensing',
      publishing: 'Publishing & PRO',
      split: 'Royalty Splits',
      'connect account': 'Connecting Accounts',
      schedule: 'Posting Schedule',
      'ab test': 'A/B Testing',
      campaign: 'Ad Campaigns',
      stripe: 'Stripe & Payments',
      'press kit': 'Press Kit / EPK',
      sync: 'Sync Licensing',
      'career coach': 'Career Coach',
      'isrc': 'ISRC & Metadata',
    };
    return topicMap[k] || k;
  });
}

function getQuickActions(category: string): QuickAction[] {
  return (QUICK_ACTIONS_MAP[category] || []).slice(0, 4);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

export function generateMaxResponse(
  userMessage: string,
  history: ConversationMessage[]
): AssistantResponse {
  const tokens = tokenize(userMessage);

  if (tokens.length === 0) {
    return {
      content: "I didn't catch that — could you rephrase your question? I'm here to help with anything about Max Booster.",
      category: 'general',
      confidence: 1,
      quickActions: [
        { label: 'Getting started', prompt: 'How do I get started with Max Booster?' },
        { label: 'Distribute music', prompt: 'How do I distribute my music?' },
        { label: 'Set up social autopilot', prompt: 'How do I set up the social media autopilot?' },
        { label: 'Sell beats', prompt: 'How do I sell beats on the marketplace?' },
      ],
    };
  }

  const scores = KNOWLEDGE_BASE.map((entry) => ({
    entry,
    score: scoreEntry(entry, tokens),
  }));

  scores.sort((a, b) => b.score - a.score);

  const topScore = scores[0];

  if (topScore.score >= 2) {
    const category = topScore.entry.category;
    return {
      content: topScore.entry.answer,
      category,
      confidence: Math.min(topScore.score / 6, 1),
      proactiveSuggestions: getProactiveSuggestions(category, topScore.entry),
      relatedTopics: getRelatedTopics(topScore.entry),
      quickActions: getQuickActions(category),
    };
  }

  const followUpCategory = detectFollowUpContext(userMessage, history);
  if (followUpCategory) {
    const categoryEntries = KNOWLEDGE_BASE.filter((e) => e.category === followUpCategory);
    if (categoryEntries.length > 0) {
      const entry = categoryEntries[seededIndex(followUpCategory + ':' + userMessage.slice(0, 48), categoryEntries.length)];
      return {
        content: entry.answer,
        category: followUpCategory,
        confidence: 0.5,
        proactiveSuggestions: getProactiveSuggestions(followUpCategory, entry),
        relatedTopics: getRelatedTopics(entry),
        quickActions: getQuickActions(followUpCategory),
      };
    }
  }

  const isQuestion = FOLLOW_UP_PATTERNS.some((p) => p.isQuestion && p.pattern.test(userMessage));

  const fallbackTopics = `Here are the areas I can help you with — click any topic or ask me anything:

• **Studio & DAW** — recording, mixing, mastering, AI generation, stem separation
• **Music Distribution** — releasing to 150+ platforms, metadata, ISRC, playlist pitching
• **Royalties & Payments** — earnings timeline, payout setup, splits, publishing/PRO
• **Beat Marketplace** — storefront setup, licensing tiers, pricing, Stripe payments
• **Social Media Autopilot** — connecting accounts, AI content, scheduling, 24/7 posting
• **Advertising Autopilot** — zero-cost organic growth, A/B testing, campaign management
• **Analytics** — streams, revenue forecasting, audience insights, certified reports
• **Career Tools** — career coach, press kit EPK, playlist pitching, sync licensing, tour management
• **Account & Billing** — subscription, 2FA security, payouts, data/privacy

What would you like to explore?`;

  return {
    content: isQuestion
      ? `Great question! Let me point you in the right direction.\n\n${fallbackTopics}`
      : fallbackTopics,
    category: 'general',
    confidence: 0.2,
    quickActions: [
      { label: 'Getting started', prompt: 'How do I get started with Max Booster?' },
      { label: 'Distribute music', prompt: 'How do I distribute my first release?' },
      { label: 'Set up autopilot', prompt: 'How do I set up the social media autopilot?' },
      { label: 'Sell beats', prompt: 'How do I sell beats on the marketplace?' },
    ],
  };
}

logger.info('[MaxAssistantService] In-house Max AI assistant knowledge engine initialized — comprehensive edition with proactive prediction');
